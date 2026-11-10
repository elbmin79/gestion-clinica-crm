import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { convertCurrency, normalizeUsdRate } from './exchange-rates.js';
import { fetchReferenceRate } from './frankfurter.js';
import { createClinicPaymentsStore } from './supabase/clinic-payments.js';

const providerRate = {base:'USD',quote:'MXN',date:'2026-11-06',rate:18.635};

test('conversions are reciprocal and use the same positive half-cent rounding as the ledger', () => {
  const quote = normalizeUsdRate(providerRate,'2026-11-09');
  assert.deepEqual(convertCurrency('1','USD',quote),{amount:18.64,currency:'MXN'});
  assert.deepEqual(convertCurrency('186.35','MXN',quote),{amount:10,currency:'USD'});
  assert.deepEqual(convertCurrency('0','MXN',quote),{amount:0,currency:'USD'});
  assert.throws(()=>convertCurrency('9999999999.99','USD',quote),/máximo/);
  assert.throws(()=>normalizeUsdRate({...providerRate,quote:'EUR'}),/válido/);
  assert.throws(()=>normalizeUsdRate(providerRate,'2026-11-05'),/válido/);
});

test('rate lookup requests only the USD/MXN pair and validates the provider response', async () => {
  const result = await fetchReferenceRate('2026-11-09', async url => {
    assert.equal(url.href,'https://api.frankfurter.dev/v2/rate/USD/MXN?date=2026-11-09');
    return Response.json(providerRate);
  });
  assert.equal(result.rate,'18.635');
  assert.equal(result.date,'2026-11-06');
  await assert.rejects(fetchReferenceRate('',async()=>Response.json({}, {status:503})),/no disponible/);
});

test('payment storage writes the original USD and rate id only on converted movements', async () => {
  const writes = [];
  const store = createClinicPaymentsStore({clientFactory:()=>({
    auth:{getUser:async()=>({data:{user:{id:'staff'}}})},
    from:table=>({
      insert(row){assert.equal(table,'payments');writes.push(row);return this;},
      select(){return this;},
      single:async()=>({data:{id:'payment'}}),
    }),
  })});
  const patient={databaseId:'patient'};
  const input={direction:'Ingreso',amount:18.64,date:'2026-11-09'};
  await store.create('clinic',patient,null,input);
  await store.create('clinic',patient,null,{...input,exchange:{id:'rate-id',originalAmount:1}});
  assert.equal(Object.hasOwn(writes[0],'fx_rate_id'),false);
  assert.deepEqual([writes[1].amount,writes[1].original_amount_usd,writes[1].fx_rate_id],[18.64,1,'rate-id']);
});

test('payment reads retain exchange metadata and fall back when migrations have not been applied', async () => {
  const columns=[];
  let migrated=true;
  const row={id:'payment',patient_id:'patient',transaction_date:'2026-11-09',direction:'income',amount:'18.64'};
  const store=createClinicPaymentsStore({clientFactory:()=>({
    rpc:async()=>({data:[]}),
    from:()=>({
      select(value){columns.push(value);return this;},eq(){return this;},lte(){return this;},order(){return this;},
      async range(){
        const current=columns.at(-1);
        if(migrated)return {data:[{...row,original_amount_usd:'1',package_id:'package',payment_exchange_rates:{rate:'18.635',rate_date:'2026-11-06'}}]};
        if(current.includes('payment_exchange_rates'))return {error:{code:'PGRST200',message:'Missing relationship for payment_exchange_rates'}};
        if(current.includes('package_id'))return {error:{code:'42703',message:'Column package_id does not exist'}};
        return {data:[row]};
      },
    }),
  })});
  const load=()=>store.load('clinic','America/Tijuana',{branches:[],providers:[],businesses:[]});
  const [first]=(await load()).payments;
  assert.deepEqual(first.exchange,{originalAmount:1,date:'2026-11-06',rate:'18.635'});
  assert.equal(first.packageId,'package');
  migrated=false;
  assert.equal((await load()).payments[0].exchange,null);
  assert.equal(columns.length,4);
});

test('PostgreSQL makes provider rates read-only and validates recorded conversions', async t => {
  const db=new PGlite();
  t.after(()=>db.close());
  const sql=await readFile(new URL('../../supabase/migrations/20261110000534_payment_exchange_rates.sql',import.meta.url),'utf8');
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls; create schema private;
    create table public.payments(id uuid primary key default gen_random_uuid(), amount numeric(12,2) not null,transaction_date date not null);
    grant select,insert on public.payments to authenticated;
    insert into public.payments(amount,transaction_date) values(50,'2026-11-05');
    ${sql}
    set role service_role;
  `);
  const insertRate=rate=>db.query("insert into public.payment_exchange_rates(rate_date,rate) values('2026-11-06',$1) returning id",[rate]);
  const rate=(await insertRate('18.635')).rows[0].id;
  await db.exec('reset role; set role authenticated');
  await assert.rejects(insertRate('19'),{code:'42501'});
  const add=(amount,original,rateId,date='2026-11-09')=>db.query(
    'insert into public.payments(amount,original_amount_usd,fx_rate_id,transaction_date) values($1,$2,$3,$4)',
    [amount,original,rateId,date]);
  await add('18.64','1',rate);
  await assert.rejects(add('18.63','1',rate),{constraint:'payments_exchange_amount'});
  await assert.rejects(add('18.64','1',rate,'2026-11-05'),{constraint:'payments_exchange_amount'});
  await assert.rejects(add('18.64','1',null),{constraint:'payments_exchange_pair'});
  await db.exec('reset role; set role service_role');
  await insertRate('18.625');
  await db.exec('reset role');
  const history=(await db.query('select p.amount,p.original_amount_usd,r.rate from public.payments p left join public.payment_exchange_rates r on r.id=p.fx_rate_id order by p.amount')).rows;
  assert.deepEqual(history.map(item=>[Number(item.amount),item.original_amount_usd===null?null:Number(item.original_amount_usd),item.rate===null?null:Number(item.rate)]),
    [[18.64,1,18.635],[50,null,null]]);
});
