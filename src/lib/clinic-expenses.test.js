import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { billOccurrences, dueDateInMonth, monthlyClose, parseExpense, parseMonthlyBill } from './clinic-expenses.js';

test('monthly close uses actual payment dates and leaves late bill payments linked to the original period', () => {
  const bill = { id:'water',name:'Agua',active:true,dueDay:31,startsMonth:'2026-02-01' };
  const expense = { billId:'water',billMonth:'2026-02-01',paidOn:'2026-03-02',amount:475.5 };
  const payments = [{date:'2026-03-01',direction:'Ingreso',amount:1000},{date:'2026-03-02',direction:'Reembolso',amount:100}];
  assert.equal(dueDateInMonth('2024-02',31),'2024-02-29');
  assert.equal(billOccurrences([bill],[expense],'2026-02','2026-03-02')[0].status,'Pagado');
  assert.equal(billOccurrences([bill],[],'2026-02','2026-02-28')[0].status,'Vence hoy');
  assert.equal(billOccurrences([bill],[],'2026-01','2026-02-28').length,0);
  assert.equal(monthlyClose(payments,[expense],'2026-02').spent,0);
  assert.deepEqual(monthlyClose(payments,[expense],'2026-03'),{received:1000,refunded:100,spent:475.5,net:424.5,expenses:[expense]});
  const fields = new Map(Object.entries({name:' Agua ',category:'Servicios',dueDay:'31',startsMonth:'2026-02',estimate:'500.20'}));
  assert.equal(parseMonthlyBill(fields).estimate,500.2);
  assert.throws(()=>parseExpense(new Map([['amount','0'],['paidOn','2026-02-28']]),'2026-02-28'),/importe positivo/);
});

test('PostgreSQL scopes the expense ledger, prevents duplicate bill payments and sends one reminder per period', async t => {
  const db = new PGlite();
  t.after(()=>db.close());
  const sql = await readFile(new URL('../../supabase/migrations/20261109235804_clinic_expense_ledger.sql',import.meta.url),'utf8');
  const uuid = n => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const [clinic,other,admin,billing,clinician,outsider,water,internet] = Array.from({length:8},(_,i)=>uuid(i+1));
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    grant usage on schema auth, private to authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.clinics(id uuid primary key,timezone text);
    create table public.clinic_memberships(clinic_id uuid,user_id uuid,role text);
    create function private.has_clinic_permission(uuid,text) returns boolean language sql stable security definer as $$
      select exists(select 1 from public.clinic_memberships m where m.clinic_id=$1 and m.user_id=auth.uid()
        and ($2='payments.view' or m.role in ('admin','billing')))
    $$;
    create table public.staff_notifications(id uuid primary key default gen_random_uuid(),clinic_id uuid,user_id uuid,
      kind text check(kind in ('patient_arrived')),message text check(message in ('Paciente en recepción')));
    create table public.staff_notification_preferences(clinic_id uuid,user_id uuid,push_enabled boolean);
    create table public.staff_push_subscriptions(id uuid primary key default gen_random_uuid(),clinic_id uuid,user_id uuid);
    create table private.staff_push_deliveries(notification_id uuid,subscription_id uuid);
    insert into auth.users values('${admin}'),('${billing}'),('${clinician}'),('${outsider}');
    insert into public.clinics values('${clinic}','America/Tijuana'),('${other}','UTC');
    insert into public.clinic_memberships values ('${clinic}','${admin}','admin'),('${clinic}','${billing}','billing'),
      ('${clinic}','${clinician}','clinician'),('${other}','${outsider}','admin');
    insert into public.staff_push_subscriptions(clinic_id,user_id) values('${clinic}','${admin}'),('${clinic}','${billing}');
    insert into public.staff_notification_preferences values('${clinic}','${billing}',false);
    ${sql}
  `);
  const identity = user => db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  await identity(billing);
  await db.exec('set role authenticated');
  const bill = (id,name) => db.query("insert into public.clinic_monthly_bills(id,clinic_id,name,category,due_day,starts_month) values($1,$2,$3,'Servicios',31,'2026-02-01')",[id,clinic,name]);
  await bill(water,'Agua');
  await bill(internet,'Internet');
  const expense = (id, month) => db.query("insert into public.clinic_expenses(clinic_id,name,category,amount,paid_on,bill_id,bill_month) values($1,'Internet','Servicios',500,'2026-02-20',$2,$3)",[clinic,id,month]);
  await expense(internet,'2026-02-01');
  await assert.rejects(expense(internet,'2026-02-01'),{code:'23505'});
  await assert.rejects(expense(water,'2026-01-01'),{code:'23514'});
  const run = async time => (await db.query('select public.queue_monthly_bill_notices($1) as queued',[time])).rows[0].queued;
  await assert.rejects(run('2026-02-28T08:00Z'),{code:'42501'});
  await identity(clinician);
  await assert.rejects(bill(uuid(9),'Otro'),{code:'42501'});
  await identity(outsider);
  assert.equal((await db.query('select id from public.clinic_expenses')).rows.length,0);
  await db.exec('reset role; set role service_role');
  assert.equal(await run('2026-02-28T07:59Z'),0,'local date is still February 27');
  assert.equal(await run('2026-02-28T08:00Z'),2,'the paid bill is excluded and only finance accounts receive the other notice');
  assert.equal(await run('2026-02-28T08:01Z'),0);
  await db.exec('reset role');
  assert.deepEqual((await db.query("select user_id from public.staff_notifications where kind='bill_due' order by user_id")).rows,
    [{user_id:admin},{user_id:billing}]);
  assert.equal((await db.query('select count(*)::int as count from private.staff_push_deliveries')).rows[0].count,1);
  assert.equal(await run('2026-03-31T08:00Z'),4,'both bills recur for the next month');
});
