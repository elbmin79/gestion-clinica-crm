import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { findClinicPromotion, parseClinicPromotion, promotionStatus, quoteSessionPrice } from './clinic-promotions.js';

const promotion = { id:'p1', serviceId:'facial', name:'Noviembre', kind:'single', amount:500, currency:'MXN',
  startsOn:'2026-11-01', endsOn:'2026-11-30', active:true, createdAt:'2026-10-20T12:00:00Z' };
const service = (id, amount, currency = 'MXN') => ({ id, offers:[{ kind:'single', amount, currency }] });

test('promotion validity includes both endpoints, excludes archived offers and resolves overlapping dates', () => {
  assert.equal(promotionStatus(promotion,'2026-10-31'),'Programada');
  assert.equal(findClinicPromotion([promotion],'facial','single','2026-11-01'),promotion);
  assert.equal(findClinicPromotion([promotion],'facial','single','2026-11-30'),promotion);
  assert.equal(findClinicPromotion([promotion],'facial','single','2026-12-01'),null);
  const newer = { ...promotion, id:'p2', startsOn:'2026-11-15' };
  assert.equal(findClinicPromotion([promotion,newer],'facial','single','2026-11-16'),newer);
  assert.equal(findClinicPromotion([promotion,{ ...newer, active:false }],'facial','single','2026-11-16'),promotion);
});

test('session quotes combine eligible promotions with regular prices and preserve accepted values independently', () => {
  const services = [service('facial',700), service('massage',100)];
  const accepted = quoteSessionPrice(services,[promotion],'2026-11-10');
  assert.deepEqual(accepted,{price:{amount:600,currency:'MXN'},promotionNames:['Noviembre']});
  assert.deepEqual(quoteSessionPrice(services,[promotion],'2026-12-01'),{price:{amount:800,currency:'MXN'},promotionNames:[]});
  assert.equal(accepted.price.amount,600);
  assert.deepEqual(quoteSessionPrice([services[0],service('massage',25,'USD')],[promotion],'2026-11-10'),{price:null,promotionNames:[]});
  assert.equal(findClinicPromotion([{ ...promotion,kind:'package',sessions:4 }],'facial','package','2026-11-10').sessions,4);
});

test('promotion forms reject invalid dates and validate package terms', () => {
  const fields = {name:' Especial ', serviceId:'facial', kind:'package', startsOn:'2026-11-01', endsOn:'2026-11-30', amount:'1100', sessions:'4'};
  const parse = data => parseClinicPromotion(new Map(Object.entries(data)));
  assert.deepEqual(parse(fields),{...fields,name:'Especial',amount:1100,sessions:4,currency:'MXN'});
  assert.throws(()=>parse({...fields,endsOn:'2026-11-31'}),/periodo válido/);
  assert.throws(()=>parse({...fields,sessions:'0'}),/sesiones/);
});

test('PostgreSQL scopes promotions to the clinic and limits writes to service managers', async t => {
  const db = new PGlite();
  t.after(()=>db.close());
  const clinic='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002';
  const first='20000000-0000-0000-0000-000000000001', foreign='20000000-0000-0000-0000-000000000002';
  const sql = await readFile(new URL('../../supabase/migrations/20261109235230_clinic_promotions.sql',import.meta.url),'utf8');
  await db.exec(`
    create role anon; create role authenticated; create schema private;
    grant usage on schema private to authenticated;
    create function private.has_clinic_permission(uuid,text) returns boolean language sql stable as $$
      select $1='${clinic}' and (current_setting('test.staff',true)='manager' or
        (current_setting('test.staff',true)='reader' and $2='agenda.view'))
    $$;
    create table public.clinic_services(id uuid, clinic_id uuid, primary key(id,clinic_id));
    insert into public.clinic_services values('${first}','${clinic}'),('${foreign}','${other}');
    ${sql}
    set role authenticated;
    set test.staff = 'manager';
  `);
  const add = (id,kind,currency,sessions,end='2026-11-30') => db.query(
    "insert into public.clinic_promotions(clinic_id,service_id,name,kind,amount,currency,sessions,starts_on,ends_on) values($1,$2,'Especial',$3,500,$4,$5,'2026-11-01',$6) returning id",
    [clinic,id,kind,currency,sessions,end]);
  const [row] = (await add(first,'single','USD',null)).rows;
  await add(first,'package','MXN',3);
  await assert.rejects(add(foreign,'single','MXN',null),{code:'23503'});
  await assert.rejects(add(first,'package','USD',3),{code:'23514'});
  await assert.rejects(add(first,'single','MXN',null,'2026-10-01'),{code:'23514'});
  await db.query('update public.clinic_promotions set active=false where id=$1',[row.id]);
  await db.exec("set test.staff = 'reader'");
  assert.equal((await db.query('select id from public.clinic_promotions')).rows.length,2);
  await assert.rejects(add(first,'single','MXN',null),{code:'42501'});
  assert.equal((await db.query('update public.clinic_promotions set active=true returning id')).rows.length,0);
  await db.exec("set test.staff = 'outsider'");
  assert.equal((await db.query('select id from public.clinic_promotions')).rows.length,0);
});
