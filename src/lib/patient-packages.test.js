import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { demoPackageBalances, parsePackagePurchase } from './patient-packages.js';

test('demo packages track reservations, completed sessions, balances and separate renewals', () => {
  const purchase = { id: 'one', patientId: 'patient', totalSessions: 3, agreedAmount: 1200 };
  const [first, renewal] = demoPackageBalances([purchase, { ...purchase, id: 'two' }], 'patient', [
    { packageId: 'one', status: 'Completada' }, { packageId: 'one', status: 'Confirmada' },
    { packageId: 'one', status: 'Cancelada' }, { packageId: 'two', status: 'Por confirmar' },
  ], [{ packageId: 'one', amount: 1000, direction: 'Ingreso' }, { packageId: 'one', amount: 100, direction: 'Reembolso' }]);
  assert.deepEqual([first.completedSessions, first.reservedSessions, first.remainingSessions, first.availableSessions, first.paidAmount, first.outstandingAmount], [1, 1, 2, 1, 900, 300]);
  assert.deepEqual([renewal.completedSessions, renewal.reservedSessions, renewal.paidAmount], [0, 1, 0]);
  assert.deepEqual(parsePackagePurchase('3', '150.50'), { totalSessions: 3, agreedAmount: 150.5 });
  assert.throws(() => parsePackagePurchase('0', '100'), /sesiones/);
});

test('PostgreSQL keeps package capacity, scoped purchases and payment allocations consistent', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const sql = await readFile(new URL('../../supabase/migrations/20261109234341_patient_packages.sql', import.meta.url), 'utf8');
  const id = n => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const [clinic, patient, service, staff, first, renewal, otherPatient, outsider] = Array.from({ length:8 }, (_, i) => id(i+1));
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    grant usage on schema auth, private to authenticated;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${staff}'), ('${outsider}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function private.has_clinic_permission(uuid,text) returns boolean language sql stable as $$
      select $1='${clinic}' and auth.uid()='${staff}' and $2 in ('payments.view','payments.create','payments.refund','agenda.create','agenda.edit')
    $$;
    create table public.patients(id uuid, clinic_id uuid, primary key(id,clinic_id));
    create table public.clinic_services(id uuid, clinic_id uuid, name text, active boolean, primary key(id,clinic_id));
    create table public.appointments(id uuid primary key default gen_random_uuid(), clinic_id uuid not null, patient_id uuid not null,
      service_id uuid, service_ids uuid[], status text not null, deposit_required boolean not null, deposit_amount numeric not null);
    create table public.payments(id uuid primary key default gen_random_uuid(), clinic_id uuid not null, patient_id uuid not null,
      appointment_id uuid, direction text not null, amount numeric(12,2) not null, transaction_date date not null default '2026-11-09');
    grant select on public.clinic_services, public.appointments, public.payments to authenticated;
    insert into public.patients values ('${patient}','${clinic}'), ('${otherPatient}','${clinic}');
    insert into public.clinic_services values ('${service}','${clinic}','Tratamiento de prueba',true);
    ${sql}
    create trigger appointments_require_deposit_before_confirmation before insert or update of status on public.appointments
      for each row execute function private.enforce_appointment_deposit();
    create trigger payments_validate_refund before insert on public.payments
      for each row execute function private.validate_payment_refund();
  `);
  const identity = user => db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await identity(staff);
  await db.exec('set role authenticated');
  const insertPackage = pkg => db.query(
    'insert into public.patient_packages(id,clinic_id,patient_id,service_id,sessions_total,agreed_amount) values($1,$2,$3,$4,2,1200)', [pkg,clinic,patient,service]);
  await insertPackage(first);
  await insertPackage(renewal);
  assert.equal((await db.query('select service_name from public.patient_packages limit 1')).rows[0].service_name, 'Tratamiento de prueba');
  await identity(outsider);
  assert.equal((await db.query('select id from public.patient_package_balances')).rows.length, 0);
  await assert.rejects(insertPackage(id(9)), {code:'42501'});
  await db.exec('reset role');
  await identity(staff);
  const book = async (pkg, customer = patient, services = [service]) => (await db.query(
    "insert into public.appointments(clinic_id,patient_id,package_id,service_ids,status,deposit_required,deposit_amount) values($1,$2,$3,$4,'pending',false,0) returning id",
    [clinic,customer,pkg,services])).rows[0].id;
  const a = await book(first);
  const b = await book(first);
  await assert.rejects(book(first), {constraint:'appointments_package_capacity'});
  await assert.rejects(book(renewal,otherPatient), {constraint:'appointments_package_match'});
  await assert.rejects(book(renewal,patient,[]), {constraint:'appointments_package_match'});
  await assert.rejects(book(null), {constraint:'appointments_deposit_required'});
  await db.query("update public.appointments set status='completed' where id=$1", [a]);
  await db.query("update public.appointments set status='cancelled' where id=$1", [b]);
  await book(first);
  await assert.rejects(db.query("update public.appointments set status='pending' where id=$1", [b]), {constraint:'appointments_package_capacity'});
  const pay = (pkg, appointment, direction, amount) => db.query(
    'insert into public.payments(clinic_id,patient_id,package_id,appointment_id,direction,amount) values($1,$2,$3,$4,$5,$6) returning package_id',
    [clinic,patient,pkg,appointment,direction,amount]);
  await pay(first,null,'income',500);
  assert.equal((await pay(null,a,'income',700)).rows[0].package_id, first);
  await assert.rejects(pay(first,null,'income',1), {constraint:'payments_package_balance'});
  await assert.rejects(pay(null,null,'refund',100), {constraint:'payments_refund_within_balance'});
  await assert.rejects(pay(renewal,a,'income',10), {constraint:'payments_package_match'});
  await pay(first,null,'refund',100);
  const result = await db.query('select id,completed_sessions,reserved_sessions,paid_amount from public.patient_package_balances order by id');
  assert.deepEqual(result.rows.map(row => [row.id,row.completed_sessions,row.reserved_sessions,Number(row.paid_amount)]),
    [[first,1,1,1100],[renewal,0,0,0]]);
  await t.test('a converted USD payment settles the package using its recorded MXN amount', async () => {
    const fx = await readFile(new URL('../../supabase/migrations/20261110000534_payment_exchange_rates.sql', import.meta.url),'utf8');
    await db.exec(fx);
    const rate = (await db.query("insert into public.payment_exchange_rates(rate_date,rate) values('2026-11-06',20) returning id")).rows[0].id;
    const addConverted = (amount,usd) => db.query(
      "insert into public.payments(clinic_id,patient_id,package_id,direction,amount,original_amount_usd,fx_rate_id) values($1,$2,$3,'income',$4,$5,$6)",
      [clinic,patient,first,amount,usd,rate]);
    await assert.rejects(addConverted(100,4),{constraint:'payments_exchange_amount'});
    await addConverted(100,5);
    assert.equal(Number((await db.query('select paid_amount from public.patient_package_balances where id=$1',[first])).rows[0].paid_amount),1200);
    await assert.rejects(addConverted(20,1),{constraint:'payments_package_balance'});
  });
});
