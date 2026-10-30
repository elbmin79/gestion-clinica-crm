-- MedicalCRM Supabase schema migration bundle
-- Generated from supabase/migrations in filename order.
-- Apply to a fresh destination Supabase project as its project owner.

-- >>> BEGIN 20261028221430_202610260001_clinic_crm.sql
-- Shared, clinic-scoped PostgreSQL foundation for the CRM.
-- Apply only to a Supabase project created for this clinic. No patient data is seeded.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
create extension if not exists btree_gist;

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  timezone text not null default 'America/Mexico_City',
  currency text not null default 'MXN' check (currency = 'MXN'),
  created_at timestamptz not null default now()
);

create table public.clinic_memberships (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'clinician', 'receptionist', 'billing')),
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);

-- SECURITY DEFINER avoids recursive membership-table RLS checks.
create function private.has_clinic_access(target_clinic_id uuid, allowed_roles text[] default null)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_memberships as membership
    where membership.clinic_id = target_clinic_id
      and membership.user_id = (select auth.uid())
      and (allowed_roles is null or membership.role = any (allowed_roles))
  );
$$;
revoke all on function private.has_clinic_access(uuid, text[]) from public, anon;
grant execute on function private.has_clinic_access(uuid, text[]) to authenticated;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, clinic_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  business_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 160),
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, clinic_id),
  unique (id, business_id, clinic_id),
  foreign key (business_id, clinic_id) references public.businesses(id, clinic_id) on delete restrict
);

create table public.clinic_providers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 160),
  role_title text not null default 'Profesional',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, clinic_id),
  unique (clinic_id, user_id)
);

create table public.provider_branches (
  clinic_id uuid not null,
  provider_id uuid not null,
  branch_id uuid not null,
  primary key (provider_id, branch_id),
  foreign key (provider_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete cascade,
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete cascade
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  record_number text not null,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  email text,
  phone text,
  service_summary text,
  status text not null default 'active' check (status in ('active', 'follow_up', 'new', 'inactive')),
  primary_branch_id uuid,
  primary_provider_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, clinic_id),
  unique (clinic_id, record_number),
  foreign key (primary_branch_id, clinic_id) references public.branches(id, clinic_id) on delete restrict,
  foreign key (primary_provider_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete restrict
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  business_id uuid not null,
  branch_id uuid not null,
  provider_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  service text not null check (length(trim(service)) between 1 and 200),
  modality text not null default 'in_person' check (modality in ('in_person', 'virtual')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (id, clinic_id),
  unique (id, patient_id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (business_id, clinic_id) references public.businesses(id, clinic_id) on delete restrict,
  foreign key (branch_id, business_id, clinic_id) references public.branches(id, business_id, clinic_id) on delete restrict,
  foreign key (provider_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete restrict
);

-- Enforce schedule conflicts in the database, including concurrent requests.
alter table public.appointments
  add constraint appointments_provider_no_overlap
  exclude using gist (
    clinic_id with =,
    provider_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'cancelled');
alter table public.appointments
  add constraint appointments_patient_no_overlap
  exclude using gist (
    clinic_id with =,
    patient_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'cancelled');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  appointment_id uuid,
  direction text not null check (direction in ('income', 'refund')),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'MXN' check (currency = 'MXN'),
  method text not null check (method in ('cash', 'card', 'transfer', 'other')),
  transaction_date date not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (appointment_id, patient_id, clinic_id) references public.appointments(id, patient_id, clinic_id) on delete restrict
);

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  kind text not null check (kind in ('contract', 'consent')),
  title text not null check (length(trim(title)) between 1 and 200),
  category text not null default 'Documento clínico' check (length(trim(category)) between 1 and 120),
  version integer not null check (version > 0),
  content text not null check (length(trim(content)) > 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, clinic_id),
  unique (clinic_id, kind, title, version)
);

create table public.patient_diagnoses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  summary text not null check (length(trim(summary)) > 0),
  status text not null default 'draft' check (status in ('draft', 'accepted', 'superseded')),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, clinic_id),
  unique (id, patient_id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  check (
    (status = 'draft' and accepted_at is null and accepted_by is null)
    or (status = 'accepted' and accepted_at is not null and accepted_by is not null)
    or (status = 'superseded' and ((accepted_at is null and accepted_by is null) or (accepted_at is not null and accepted_by is not null)))
  )
);

create table public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  template_id uuid,
  diagnosis_id uuid,
  kind text not null check (kind in ('contract', 'consent')),
  title text not null,
  service text,
  template_version integer,
  content_snapshot text not null check (length(trim(content_snapshot)) > 0),
  status text not null default 'pending' check (status in ('pending', 'signed', 'cancelled', 'replaced')),
  requested_at timestamptz not null default now(),
  signed_at timestamptz,
  signed_by uuid references auth.users(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  unique (id, clinic_id),
  unique (id, patient_id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (template_id, clinic_id) references public.document_templates(id, clinic_id) on delete restrict,
  foreign key (diagnosis_id, patient_id, clinic_id) references public.patient_diagnoses(id, patient_id, clinic_id) on delete restrict,
  check ((status = 'signed') = (signed_at is not null and signed_by is not null))
);

create table public.patient_activities (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  activity_type text not null check (activity_type in ('follow_up', 'call', 'message', 'administrative', 'other')),
  note text not null check (length(trim(note)) between 1 and 2000),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  entity text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  record_id text not null,
  occurred_at timestamptz not null default now()
);

create index appointments_clinic_starts_at_idx on public.appointments (clinic_id, starts_at);
create index appointments_provider_starts_at_idx on public.appointments (clinic_id, provider_id, starts_at);
create index appointments_branch_starts_at_idx on public.appointments (clinic_id, branch_id, starts_at);
create index payments_clinic_date_idx on public.payments (clinic_id, transaction_date desc);
create index documents_clinic_patient_requested_idx on public.patient_documents (clinic_id, patient_id, requested_at desc);
create index activities_clinic_patient_created_idx on public.patient_activities (clinic_id, patient_id, created_at desc);
create index audit_events_clinic_occurred_idx on public.audit_events (clinic_id, occurred_at desc);

alter table public.clinics enable row level security;
alter table public.clinic_memberships enable row level security;
alter table public.businesses enable row level security;
alter table public.branches enable row level security;
alter table public.clinic_providers enable row level security;
alter table public.provider_branches enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.document_templates enable row level security;
alter table public.patient_diagnoses enable row level security;
alter table public.patient_documents enable row level security;
alter table public.patient_activities enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.clinics, public.clinic_memberships, public.businesses, public.branches,
  public.clinic_providers, public.provider_branches, public.patients, public.appointments,
  public.payments, public.document_templates, public.patient_diagnoses,
  public.patient_documents, public.patient_activities, public.audit_events
from anon, authenticated;

grant select, update on public.clinics to authenticated;
grant select on public.clinic_memberships to authenticated;
grant select, insert, update, delete on public.businesses, public.branches,
  public.clinic_providers, public.provider_branches to authenticated;
grant select, insert, update, delete on public.patients, public.appointments to authenticated;
grant select, insert on public.payments to authenticated;
grant select, insert, update, delete on public.document_templates to authenticated;
grant select, insert, update, delete on public.patient_diagnoses to authenticated;
-- Client-created document requests are immutable. Signing and state transitions
-- must be performed by a trusted integration, not an arbitrary browser client.
grant select, insert on public.patient_documents to authenticated;
grant select, insert on public.patient_activities to authenticated;
grant select on public.audit_events to authenticated;

create policy clinics_member_read on public.clinics
  for select to authenticated using ((select private.has_clinic_access(id, null)));
create policy clinics_admin_update on public.clinics
  for update to authenticated
  using ((select private.has_clinic_access(id, array['admin'])))
  with check ((select private.has_clinic_access(id, array['admin'])));

create policy memberships_self_or_admin_read on public.clinic_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_clinic_access(clinic_id, array['admin'])));

create policy businesses_member_read on public.businesses
  for select to authenticated using ((select private.has_clinic_access(clinic_id, null)));
create policy businesses_staff_write on public.businesses
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'receptionist'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin', 'receptionist'])));

create policy branches_member_read on public.branches
  for select to authenticated using ((select private.has_clinic_access(clinic_id, null)));
create policy branches_staff_write on public.branches
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'receptionist'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin', 'receptionist'])));

create policy providers_member_read on public.clinic_providers
  for select to authenticated using ((select private.has_clinic_access(clinic_id, null)));
create policy providers_admin_write on public.clinic_providers
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));

create policy provider_branches_member_read on public.provider_branches
  for select to authenticated using ((select private.has_clinic_access(clinic_id, null)));
create policy provider_branches_admin_write on public.provider_branches
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));

create policy patients_clinical_staff_read on public.patients
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy patients_clinical_staff_write on public.patients
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));

create policy appointments_staff_read on public.appointments
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy appointments_staff_write on public.appointments
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])))
  with check (
    (select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist']))
    and (
      not exists (
        select 1 from public.provider_branches as assignment
        where assignment.clinic_id = public.appointments.clinic_id
          and assignment.provider_id = public.appointments.provider_id
      )
      or exists (
        select 1 from public.provider_branches as assignment
        where assignment.clinic_id = public.appointments.clinic_id
          and assignment.provider_id = public.appointments.provider_id
          and assignment.branch_id = public.appointments.branch_id
      )
    )
  );

create policy payments_finance_read on public.payments
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'receptionist', 'billing'])));
create policy payments_finance_insert on public.payments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_clinic_access(clinic_id, array['admin', 'receptionist', 'billing']))
  );

create policy templates_staff_read on public.document_templates
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy templates_admin_write on public.document_templates
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));

create policy diagnoses_clinical_staff_read on public.patient_diagnoses
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy diagnoses_clinical_staff_write on public.patient_diagnoses
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician'])))
  with check (
    (select private.has_clinic_access(clinic_id, array['admin', 'clinician']))
    and (status <> 'accepted' or accepted_by = (select auth.uid()))
  );

create policy documents_clinical_staff_read on public.patient_documents
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy documents_staff_insert on public.patient_documents
  for insert to authenticated
  with check (
    status = 'pending'
    and signed_at is null
    and signed_by is null
    and created_by = (select auth.uid())
    and (select private.has_clinic_access(clinic_id, array['admin', 'clinician']))
    and (
      kind <> 'contract'
      or exists (
        select 1 from public.patient_diagnoses as diagnosis
        where diagnosis.id = public.patient_documents.diagnosis_id
          and diagnosis.patient_id = public.patient_documents.patient_id
          and diagnosis.clinic_id = public.patient_documents.clinic_id
          and diagnosis.status = 'accepted'
      )
    )
  );

create policy activities_clinical_staff_read on public.patient_activities
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy activities_clinical_staff_insert on public.patient_activities
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist']))
  );

create policy audit_admin_read on public.audit_events
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])));

-- Append-only audit entries record the entity and operation, never field contents.
create function private.capture_audit_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  event_row jsonb;
begin
  event_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_events (clinic_id, actor_id, entity, action, record_id)
  values (
    (event_row ->> 'clinic_id')::uuid,
    (select auth.uid()),
    tg_table_name,
    tg_op,
    coalesce(
      event_row ->> 'id',
      event_row ->> 'record_number',
      event_row ->> 'user_id',
      case when event_row ? 'provider_id'
        then (event_row ->> 'provider_id') || ':' || (event_row ->> 'branch_id')
        else null
      end,
      'unknown'
    )
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.capture_audit_event() from public, anon, authenticated;

create function private.prevent_clinic_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'clinic_id cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_clinic_change() from public, anon, authenticated;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

create trigger patients_prevent_clinic_change before update on public.patients
  for each row execute function private.prevent_clinic_change();
create trigger appointments_prevent_clinic_change before update on public.appointments
  for each row execute function private.prevent_clinic_change();
create trigger payments_prevent_clinic_change before update on public.payments
  for each row execute function private.prevent_clinic_change();
create trigger templates_prevent_clinic_change before update on public.document_templates
  for each row execute function private.prevent_clinic_change();
create trigger diagnoses_prevent_clinic_change before update on public.patient_diagnoses
  for each row execute function private.prevent_clinic_change();
create trigger documents_prevent_clinic_change before update on public.patient_documents
  for each row execute function private.prevent_clinic_change();
create trigger activities_prevent_clinic_change before update on public.patient_activities
  for each row execute function private.prevent_clinic_change();
create trigger patients_touch_updated_at before update on public.patients
  for each row execute function private.touch_updated_at();
create trigger appointments_touch_updated_at before update on public.appointments
  for each row execute function private.touch_updated_at();

create trigger audit_memberships after insert or update or delete on public.clinic_memberships
  for each row execute function private.capture_audit_event();
create trigger audit_businesses after insert or update or delete on public.businesses
  for each row execute function private.capture_audit_event();
create trigger audit_branches after insert or update or delete on public.branches
  for each row execute function private.capture_audit_event();
create trigger audit_providers after insert or update or delete on public.clinic_providers
  for each row execute function private.capture_audit_event();
create trigger audit_provider_branches after insert or update or delete on public.provider_branches
  for each row execute function private.capture_audit_event();
create trigger audit_templates after insert or update or delete on public.document_templates
  for each row execute function private.capture_audit_event();
create trigger audit_patients after insert or update or delete on public.patients
  for each row execute function private.capture_audit_event();
create trigger audit_appointments after insert or update or delete on public.appointments
  for each row execute function private.capture_audit_event();
create trigger audit_payments after insert on public.payments
  for each row execute function private.capture_audit_event();
create trigger audit_documents after insert or update on public.patient_documents
  for each row execute function private.capture_audit_event();
create trigger audit_diagnoses after insert or update or delete on public.patient_diagnoses
  for each row execute function private.capture_audit_event();
create trigger audit_activities after insert on public.patient_activities
  for each row execute function private.capture_audit_event();

-- <<< END 20261028221430_202610260001_clinic_crm.sql
-- >>> BEGIN 20261028221433_202610260002_finance_workspace.sql
-- Minimal finance workspace access for admin, receptionist, and billing roles.
-- Patient identity is limited to the fields required to reconcile payments.

create index payments_clinic_patient_idx on public.payments (clinic_id, patient_id);
create index payments_clinic_appointment_idx on public.payments (clinic_id, appointment_id) where appointment_id is not null;

create function public.get_finance_patients(target_clinic_id uuid)
returns table(patient_id uuid, record_number text, full_name text, primary_branch_id uuid, primary_provider_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select patient.id, patient.record_number, patient.full_name, patient.primary_branch_id, patient.primary_provider_id
  from public.patients as patient
  where patient.clinic_id = target_clinic_id
    and (select private.has_clinic_access(target_clinic_id, array['admin', 'receptionist', 'billing']))
  order by patient.full_name;
$$;
revoke all on function public.get_finance_patients(uuid) from public, anon;
grant execute on function public.get_finance_patients(uuid) to authenticated;

create function public.get_finance_appointments(target_clinic_id uuid, from_at timestamptz, to_at timestamptz, appointment_ids uuid[] default '{}')
returns table(
  appointment_id uuid,
  patient_id uuid,
  business_id uuid,
  branch_id uuid,
  provider_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  service text,
  modality text,
  status text,
  branch_name text,
  provider_name text,
  business_name text
)
language sql stable security definer
set search_path = ''
as $$
  select appointment.id, appointment.patient_id, appointment.business_id,
         appointment.branch_id, appointment.provider_id, appointment.starts_at,
         appointment.ends_at, appointment.service, appointment.modality, appointment.status,
         branch.name, provider.name, business.name
  from public.appointments as appointment
  left join public.branches as branch on branch.id = appointment.branch_id and branch.clinic_id = appointment.clinic_id
  left join public.clinic_providers as provider on provider.id = appointment.provider_id and provider.clinic_id = appointment.clinic_id
  left join public.businesses as business on business.id = appointment.business_id and business.clinic_id = appointment.clinic_id
  where appointment.clinic_id = target_clinic_id
    and ((appointment.starts_at >= from_at and appointment.starts_at < to_at) or appointment.id = any(appointment_ids))
    and (select private.has_clinic_access(target_clinic_id, array['admin', 'receptionist', 'billing']))
  order by appointment.starts_at desc;
$$;
revoke all on function public.get_finance_appointments(uuid, timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.get_finance_appointments(uuid, timestamptz, timestamptz, uuid[]) to authenticated;

-- Serialize refunds for the same patient/appointment and reject amounts that
-- exceed its committed net income, including concurrent refund requests.
create function private.validate_payment_refund()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  available numeric(12, 2);
begin
  if new.direction <> 'refund' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(new.clinic_id::text),
    hashtext(new.patient_id::text)
  );

  select coalesce(sum(case when payment.direction = 'income' then payment.amount else -payment.amount end), 0)
    into available
    from public.payments as payment
    where payment.clinic_id = new.clinic_id
      and (
        (new.appointment_id is not null and payment.appointment_id = new.appointment_id)
        or (new.appointment_id is null and payment.patient_id = new.patient_id)
      );

  if new.amount > available then
    raise exception 'refund exceeds available net income'
      using errcode = '23514', constraint = 'payments_refund_within_balance';
  end if;

  return new;
end;
$$;
revoke all on function private.validate_payment_refund() from public, anon, authenticated;

create trigger payments_validate_refund
  before insert on public.payments
  for each row execute function private.validate_payment_refund();
-- <<< END 20261028221433_202610260002_finance_workspace.sql
-- >>> BEGIN 20261028221436_202610260003_appointment_deposits.sql
-- Clinic-configured booking deposits must be received before confirmation.
alter table public.appointments
  add column deposit_required boolean not null default false,
  add column deposit_amount numeric(12, 2) not null default 0,
  add constraint appointments_deposit_amount_valid
    check ((deposit_required and deposit_amount > 0) or (not deposit_required and deposit_amount = 0));

-- Preserve existing bookings, but make deposits the default for all new ones.
alter table public.appointments
  alter column deposit_required set default true;

create function private.enforce_appointment_deposit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  received numeric(12, 2);
begin
  if tg_op = 'INSERT' and (not new.deposit_required or new.deposit_amount <= 0) then
    raise exception 'A positive appointment deposit is required for new bookings.'
      using errcode = '23514', constraint = 'appointments_deposit_required';
  end if;

  if tg_op = 'UPDATE' and old.deposit_required and not new.deposit_required then
    raise exception 'An appointment deposit cannot be removed after booking.'
      using errcode = '23514', constraint = 'appointments_deposit_required';
  end if;

  if new.status in ('confirmed', 'completed') and new.deposit_required then
    select coalesce(sum(case when payment.direction = 'income' then payment.amount else -payment.amount end), 0)
      into received
      from public.payments as payment
      where payment.clinic_id = new.clinic_id
        and payment.appointment_id = new.id;

    if received < new.deposit_amount then
      raise exception 'Appointment deposit has not been received.'
        using errcode = '23514', constraint = 'appointments_deposit_required';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_appointment_deposit() from public, anon, authenticated;

create trigger appointments_require_deposit_before_confirmation
  before insert or update of status, deposit_required, deposit_amount on public.appointments
  for each row execute function private.enforce_appointment_deposit();
-- <<< END 20261028221436_202610260003_appointment_deposits.sql
-- >>> BEGIN 20261028221438_202610260004_appointment_reminders.sql
-- Durable schedule for the clinic's three appointment messages. Delivery is
-- handled by a separately configured messaging worker; this migration sends
-- nothing to patients.
create table public.appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  kind text not null check (kind in ('confirmation_2d', 'reminder_1d', 'reminder_5h')),
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, kind),
  foreign key (appointment_id, clinic_id) references public.appointments(id, clinic_id) on delete cascade
);

create index appointment_reminders_due_idx
  on public.appointment_reminders (scheduled_at)
  where status in ('pending', 'failed');
create index appointment_reminders_clinic_schedule_idx
  on public.appointment_reminders (clinic_id, scheduled_at);

alter table public.appointment_reminders enable row level security;
grant select on public.appointment_reminders to authenticated;

create policy appointment_reminders_staff_read on public.appointment_reminders
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'receptionist'])));

create function private.refresh_appointment_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder_definition record;
  scheduled_time timestamptz;
begin
  if new.status <> 'confirmed' then
    update public.appointment_reminders
      set status = 'cancelled', updated_at = now()
      where clinic_id = new.clinic_id
        and appointment_id = new.id
        and status <> 'sent';
    return new;
  end if;

  for reminder_definition in
    select definition.kind, definition.lead_time
      from (values
        ('confirmation_2d'::text, interval '48 hours'),
        ('reminder_1d'::text, interval '24 hours'),
        ('reminder_5h'::text, interval '5 hours')
      ) as definition(kind, lead_time)
  loop
    scheduled_time := new.starts_at - reminder_definition.lead_time;

    insert into public.appointment_reminders (
      clinic_id, appointment_id, kind, scheduled_at, status
    ) values (
      new.clinic_id,
      new.id,
      reminder_definition.kind,
      scheduled_time,
      case when scheduled_time > now() then 'pending' else 'skipped' end
    )
    on conflict (appointment_id, kind) do update
      set scheduled_at = excluded.scheduled_at,
          status = case
            when public.appointment_reminders.status = 'sent' then 'sent'
            else excluded.status
          end,
          attempt_count = case
            when public.appointment_reminders.status = 'sent' then public.appointment_reminders.attempt_count
            else 0
          end,
          last_error = case
            when public.appointment_reminders.status = 'sent' then public.appointment_reminders.last_error
            else null
          end,
          updated_at = now();
  end loop;

  return new;
end;
$$;
revoke all on function private.refresh_appointment_reminders() from public, anon, authenticated;

create trigger appointments_refresh_reminders
  after insert or update of status, starts_at on public.appointments
  for each row execute function private.refresh_appointment_reminders();

create function public.get_appointment_reminders(
  target_clinic_id uuid,
  window_start timestamptz default now(),
  window_end timestamptz default now() + interval '90 days'
)
returns table (
  id uuid,
  appointment_id uuid,
  kind text,
  scheduled_at timestamptz,
  status text,
  attempt_count integer,
  patient_name text,
  appointment_at timestamptz,
  service text,
  provider_name text,
  branch_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'receptionist']) then
    raise exception 'Appointment reminder access is not enabled for this role.' using errcode = '42501';
  end if;

  return query
    select reminder.id,
           reminder.appointment_id,
           reminder.kind,
           reminder.scheduled_at,
           reminder.status,
           reminder.attempt_count,
           patient.full_name,
           appointment.starts_at,
           appointment.service,
           provider.name,
           branch.name
      from public.appointment_reminders as reminder
      join public.appointments as appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id
      join public.clinic_providers as provider
        on provider.id = appointment.provider_id
       and provider.clinic_id = appointment.clinic_id
      join public.branches as branch
        on branch.id = appointment.branch_id
       and branch.clinic_id = appointment.clinic_id
     where reminder.clinic_id = target_clinic_id
       and reminder.scheduled_at >= window_start
       and reminder.scheduled_at < window_end
     order by reminder.scheduled_at asc;
end;
$$;
revoke all on function public.get_appointment_reminders(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_appointment_reminders(uuid, timestamptz, timestamptz) to authenticated;
-- <<< END 20261028221438_202610260004_appointment_reminders.sql
-- >>> BEGIN 20261028221441_202610260005_reschedule_appointment_reminders.sql
-- Keep a new reminder set when a confirmed appointment is rescheduled or
-- cancelled and then confirmed again. Earlier sends remain auditable.
alter table public.appointments
  add column reminder_schedule_version integer not null default 1
  check (reminder_schedule_version > 0);

alter table public.appointment_reminders
  add column schedule_version integer not null default 1
  check (schedule_version > 0);

alter table public.appointment_reminders
  drop constraint appointment_reminders_appointment_id_kind_key;

alter table public.appointment_reminders
  add constraint appointment_reminders_appointment_kind_version_key
  unique (appointment_id, kind, schedule_version);

create function private.advance_reminder_schedule_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at
     or (old.status <> 'confirmed' and new.status = 'confirmed') then
    new.reminder_schedule_version := old.reminder_schedule_version + 1;
  end if;
  return new;
end;
$$;
revoke all on function private.advance_reminder_schedule_version() from public, anon, authenticated;

create trigger appointments_advance_reminder_schedule_version
  before update of status, starts_at on public.appointments
  for each row execute function private.advance_reminder_schedule_version();

create or replace function private.refresh_appointment_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder_definition record;
  scheduled_time timestamptz;
begin
  if new.status <> 'confirmed' then
    update public.appointment_reminders
      set status = 'cancelled', updated_at = now()
      where clinic_id = new.clinic_id
        and appointment_id = new.id
        and schedule_version = new.reminder_schedule_version
        and status in ('pending', 'failed');
    return new;
  end if;

  update public.appointment_reminders
    set status = 'cancelled', updated_at = now()
    where clinic_id = new.clinic_id
      and appointment_id = new.id
      and schedule_version <> new.reminder_schedule_version
      and status in ('pending', 'failed');

  for reminder_definition in
    select definition.kind, definition.lead_time
      from (values
        ('confirmation_2d'::text, interval '48 hours'),
        ('reminder_1d'::text, interval '24 hours'),
        ('reminder_5h'::text, interval '5 hours')
      ) as definition(kind, lead_time)
  loop
    scheduled_time := new.starts_at - reminder_definition.lead_time;

    insert into public.appointment_reminders (
      clinic_id, appointment_id, kind, scheduled_at, status, schedule_version
    ) values (
      new.clinic_id,
      new.id,
      reminder_definition.kind,
      scheduled_time,
      case when scheduled_time > now() then 'pending' else 'skipped' end,
      new.reminder_schedule_version
    )
    on conflict (appointment_id, kind, schedule_version) do update
      set scheduled_at = excluded.scheduled_at,
          status = case
            when public.appointment_reminders.status = 'sent' then 'sent'
            else excluded.status
          end,
          attempt_count = case
            when public.appointment_reminders.status = 'sent' then public.appointment_reminders.attempt_count
            else 0
          end,
          last_error = case
            when public.appointment_reminders.status = 'sent' then public.appointment_reminders.last_error
            else null
          end,
          updated_at = now();
  end loop;

  return new;
end;
$$;

create or replace function public.get_appointment_reminders(
  target_clinic_id uuid,
  window_start timestamptz default now(),
  window_end timestamptz default now() + interval '90 days'
)
returns table (
  id uuid,
  appointment_id uuid,
  kind text,
  scheduled_at timestamptz,
  status text,
  attempt_count integer,
  patient_name text,
  appointment_at timestamptz,
  service text,
  provider_name text,
  branch_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'receptionist']) then
    raise exception 'Appointment reminder access is not enabled for this role.' using errcode = '42501';
  end if;

  return query
    select reminder.id,
           reminder.appointment_id,
           reminder.kind,
           reminder.scheduled_at,
           reminder.status,
           reminder.attempt_count,
           patient.full_name,
           appointment.starts_at,
           appointment.service,
           provider.name,
           branch.name
      from public.appointment_reminders as reminder
      join public.appointments as appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
       and appointment.reminder_schedule_version = reminder.schedule_version
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id
      join public.clinic_providers as provider
        on provider.id = appointment.provider_id
       and provider.clinic_id = appointment.clinic_id
      join public.branches as branch
        on branch.id = appointment.branch_id
       and branch.clinic_id = appointment.clinic_id
     where reminder.clinic_id = target_clinic_id
       and reminder.scheduled_at >= window_start
       and reminder.scheduled_at < window_end
     order by reminder.scheduled_at asc;
end;
$$;
revoke all on function public.get_appointment_reminders(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_appointment_reminders(uuid, timestamptz, timestamptz) to authenticated;
-- <<< END 20261028221441_202610260005_reschedule_appointment_reminders.sql
-- >>> BEGIN 20261028221447_202610260006_document_template_versioning.sql
-- Keep one active version per clinic, document type, and normalized title.
with ranked_active_templates as (
  select template.id,
         row_number() over (
           partition by template.clinic_id, template.kind, lower(trim(template.title))
           order by template.version desc, template.created_at desc, template.id desc
         ) as rank
    from public.document_templates as template
   where template.active
)
update public.document_templates as template
   set active = false
  from ranked_active_templates as ranked
 where template.id = ranked.id
   and ranked.rank > 1;

create unique index document_templates_single_active_version_idx
  on public.document_templates (clinic_id, kind, (lower(trim(title))))
  where active;

create function public.save_clinic_document_template(
  target_clinic_id uuid,
  target_kind text,
  target_title text,
  target_category text,
  target_content text
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_title text := trim(coalesce(target_title, ''));
  normalized_category text := trim(coalesce(target_category, ''));
  normalized_content text := trim(coalesce(target_content, ''));
  next_version integer;
  author_id uuid := (select auth.uid());
begin
  if target_kind is null or target_kind not in ('contract', 'consent') then
    raise exception 'Template kind must be contract or consent.' using errcode = '22023';
  end if;
  if length(normalized_title) not between 1 and 200 then
    raise exception 'Template title must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if length(normalized_content) = 0 then
    raise exception 'Template content cannot be empty.' using errcode = '22023';
  end if;
  if length(normalized_category) = 0 then
    normalized_category := case when target_kind = 'contract' then 'Prestación de servicios' else 'Documento clínico' end;
  end if;

  -- Serialize saves within this clinic so simultaneous revisions get distinct
  -- versions and cannot leave two active copies of the same template.
  perform 1
    from public.clinics as clinic
   where clinic.id = target_clinic_id
   for update;
  if not found then
    raise exception 'Clinic does not exist.' using errcode = '23503';
  end if;
  if not private.has_clinic_access(target_clinic_id, array['admin']) then
    raise exception 'Only clinic administrators can save document templates.' using errcode = '42501';
  end if;
  if author_id is null then
    raise exception 'An authenticated administrator is required.' using errcode = '42501';
  end if;

  select coalesce(max(template.version), 0) + 1
    into next_version
    from public.document_templates as template
   where template.clinic_id = target_clinic_id
     and template.kind = target_kind
     and lower(trim(template.title)) = lower(normalized_title);

  update public.document_templates as template
     set active = false
   where template.clinic_id = target_clinic_id
     and template.kind = target_kind
     and lower(trim(template.title)) = lower(normalized_title)
     and template.active;

  return query
    insert into public.document_templates (
      clinic_id, kind, title, category, version, content, active, created_by
    ) values (
      target_clinic_id,
      target_kind,
      normalized_title,
      normalized_category,
      next_version,
      normalized_content,
      true,
      author_id
    )
    returning document_templates.id, document_templates.version;
end;
$$;
revoke all on function public.save_clinic_document_template(uuid, text, text, text, text) from public, anon;
grant execute on function public.save_clinic_document_template(uuid, text, text, text, text) to authenticated;
-- <<< END 20261028221447_202610260006_document_template_versioning.sql
-- >>> BEGIN 20261028221449_202610260007_diagnosis_contract_consistency.sql
-- A patient can have only one currently accepted diagnosis. Keep earlier
-- accepted records as superseded history rather than deleting them.
with ranked_accepted_diagnoses as (
  select diagnosis.id,
         row_number() over (
           partition by diagnosis.clinic_id, diagnosis.patient_id
           order by diagnosis.accepted_at desc nulls last,
                    diagnosis.created_at desc,
                    diagnosis.id desc
         ) as rank
    from public.patient_diagnoses as diagnosis
   where diagnosis.status = 'accepted'
)
update public.patient_diagnoses as diagnosis
   set status = 'superseded'
  from ranked_accepted_diagnoses as ranked
 where diagnosis.id = ranked.id
   and ranked.rank > 1;

create unique index patient_diagnoses_single_accepted_idx
  on public.patient_diagnoses (clinic_id, patient_id)
  where status = 'accepted';

revoke insert, update, delete on public.patient_diagnoses from authenticated;
grant select on public.patient_diagnoses to authenticated;

drop policy diagnoses_clinical_staff_read on public.patient_diagnoses;
create policy diagnoses_clinical_staff_read on public.patient_diagnoses
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician'])));

create function public.accept_patient_diagnosis(
  target_clinic_id uuid,
  target_patient_id uuid,
  target_summary text
)
returns table(diagnosis_id uuid, accepted_by uuid, superseded_diagnosis_count integer, replaced_contract_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_summary text := trim(coalesce(target_summary, ''));
  current_user_id uuid := (select auth.uid());
  changed_diagnosis_count integer := 0;
  changed_contract_count integer := 0;
begin
  if length(normalized_summary) = 0 or length(normalized_summary) > 4000 then
    raise exception 'Diagnosis summary must contain 1 to 4000 characters.' using errcode = '22023';
  end if;
  if current_user_id is null
     or not private.has_clinic_access(target_clinic_id, array['admin', 'clinician']) then
    raise exception 'Only clinic administrators and clinicians can accept diagnoses.' using errcode = '42501';
  end if;

  -- Serialize diagnosis changes for this patient, including the contract
  -- transition below, so concurrent accepts cannot leave competing versions.
  perform 1
    from public.patients as patient
   where patient.id = target_patient_id
     and patient.clinic_id = target_clinic_id
   for update;
  if not found then
    raise exception 'Patient does not exist in this clinic.' using errcode = '23503';
  end if;

  update public.patient_diagnoses as diagnosis
     set status = 'superseded'
   where diagnosis.clinic_id = target_clinic_id
     and diagnosis.patient_id = target_patient_id
     and diagnosis.status = 'accepted';
  get diagnostics changed_diagnosis_count = row_count;

  update public.patient_documents as document
     set status = 'replaced'
   where document.clinic_id = target_clinic_id
     and document.patient_id = target_patient_id
     and document.kind = 'contract'
     and document.status = 'pending';
  get diagnostics changed_contract_count = row_count;

  return query
    insert into public.patient_diagnoses (
      clinic_id, patient_id, summary, status, accepted_at, accepted_by, created_by
    ) values (
      target_clinic_id,
      target_patient_id,
      normalized_summary,
      'accepted',
      now(),
      current_user_id,
      current_user_id
    )
    returning patient_diagnoses.id, patient_diagnoses.accepted_by, changed_diagnosis_count, changed_contract_count;
end;
$$;
revoke all on function public.accept_patient_diagnosis(uuid, uuid, text) from public, anon;
grant execute on function public.accept_patient_diagnosis(uuid, uuid, text) to authenticated;
-- <<< END 20261028221449_202610260007_diagnosis_contract_consistency.sql
-- >>> BEGIN 20261028221452_202610260008_payment_deposit_consistency.sql
-- Serialize appointment confirmation and refund checks for the same patient.
-- A refund may not leave an already confirmed appointment below its
-- required deposit, and a concurrent confirmation must see committed refunds.

create or replace function private.enforce_appointment_deposit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  received numeric(12, 2);
begin
  if tg_op = 'INSERT' and (not new.deposit_required or new.deposit_amount <= 0) then
    raise exception 'A positive appointment deposit is required for new bookings.'
      using errcode = '23514', constraint = 'appointments_deposit_required';
  end if;

  if tg_op = 'UPDATE' and old.deposit_required and not new.deposit_required then
    raise exception 'An appointment deposit cannot be removed after booking.'
      using errcode = '23514', constraint = 'appointments_deposit_required';
  end if;

  if new.status in ('confirmed', 'completed') and new.deposit_required then
    perform pg_advisory_xact_lock(
      hashtext(new.clinic_id::text),
      hashtext(new.patient_id::text)
    );

    select coalesce(sum(case when payment.direction = 'income' then payment.amount else -payment.amount end), 0)
      into received
      from public.payments as payment
      where payment.clinic_id = new.clinic_id
        and payment.appointment_id = new.id;

    if received < new.deposit_amount then
      raise exception 'Appointment deposit has not been received.'
        using errcode = '23514', constraint = 'appointments_deposit_required';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.enforce_appointment_deposit() from public, anon, authenticated;

create or replace function private.validate_payment_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  available numeric(12, 2);
  appointment_status text;
  appointment_deposit_required boolean;
  appointment_deposit_amount numeric(12, 2);
begin
  if new.direction <> 'refund' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(new.clinic_id::text),
    hashtext(new.patient_id::text)
  );

  select coalesce(sum(case when payment.direction = 'income' then payment.amount else -payment.amount end), 0)
    into available
    from public.payments as payment
    where payment.clinic_id = new.clinic_id
      and (
        (new.appointment_id is not null and payment.appointment_id = new.appointment_id)
        or (new.appointment_id is null and payment.patient_id = new.patient_id)
      );

  if new.amount > available then
    raise exception 'refund exceeds available net income'
      using errcode = '23514', constraint = 'payments_refund_within_balance';
  end if;

  if new.appointment_id is not null then
    select appointment.status, appointment.deposit_required, appointment.deposit_amount
      into appointment_status, appointment_deposit_required, appointment_deposit_amount
      from public.appointments as appointment
     where appointment.id = new.appointment_id
       and appointment.clinic_id = new.clinic_id;

    if appointment_status = 'confirmed'
       and appointment_deposit_required
       and available - new.amount < appointment_deposit_amount then
      raise exception 'refund would leave a confirmed appointment below its required deposit'
        using errcode = '23514', constraint = 'payments_refund_preserves_appointment_deposit';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.validate_payment_refund() from public, anon, authenticated;
-- <<< END 20261028221452_202610260008_payment_deposit_consistency.sql
-- >>> BEGIN 20261028221455_202610260009_appointment_schedule_bounds.sql
-- Keep shared bookings inside the day view's 06:00–00:00 schedule and on
-- quarter-hour starts, using the clinic's timezone rather than the server's.
create or replace function private.enforce_appointment_schedule_bounds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinic_timezone text;
  local_start timestamp without time zone;
  local_end timestamp without time zone;
  local_day_end timestamp without time zone;
  start_offset_seconds integer;
begin
  if tg_op = 'UPDATE'
     and new.clinic_id is not distinct from old.clinic_id
     and new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at
     and new.status = 'cancelled' then
    return new;
  end if;

  select clinic.timezone
    into clinic_timezone
    from public.clinics as clinic
   where clinic.id = new.clinic_id;

  if clinic_timezone is null then
    raise exception 'appointments_schedule_bounds: clinic timezone is not configured.'
      using errcode = '23514', constraint = 'appointments_schedule_bounds';
  end if;

  local_start := new.starts_at at time zone clinic_timezone;
  local_end := new.ends_at at time zone clinic_timezone;
  local_day_end := date_trunc('day', local_start) + interval '1 day';
  start_offset_seconds := extract(epoch from local_start - date_trunc('day', local_start))::integer;

  if local_start::time < time '06:00'
     or mod(start_offset_seconds, 900) <> 0
     or local_end > local_day_end then
    raise exception 'appointments_schedule_bounds: appointment must start at or after 06:00 on a quarter-hour and end by local midnight.'
      using errcode = '23514', constraint = 'appointments_schedule_bounds';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_appointment_schedule_bounds() from public, anon, authenticated;

create trigger appointments_enforce_schedule_bounds
  before insert or update of clinic_id, starts_at, ends_at, status on public.appointments
  for each row execute function private.enforce_appointment_schedule_bounds();
-- <<< END 20261028221455_202610260009_appointment_schedule_bounds.sql
-- >>> BEGIN 20261028221458_202610260010_patient_whatsapp_consent.sql
-- Reminder delivery must never infer WhatsApp consent from clinical consent.
-- Keep the current state on the patient and append every grant/revocation.
alter table public.patients
  add column appointment_whatsapp_opt_in boolean not null default false,
  add column appointment_whatsapp_opt_in_at timestamptz,
  add column appointment_whatsapp_opt_in_source text,
  add constraint patients_appointment_whatsapp_consent_valid
    check (
      (appointment_whatsapp_opt_in and appointment_whatsapp_opt_in_at is not null
        and appointment_whatsapp_opt_in_source in ('written', 'verbal', 'electronic'))
      or
      (not appointment_whatsapp_opt_in and appointment_whatsapp_opt_in_at is null
        and appointment_whatsapp_opt_in_source is null)
    );

-- Keep profile and messaging-consent changes behind one role-checked, audited RPC.
-- This prevents a consent event from being separated from its patient update.
revoke update on public.patients from authenticated;

create table public.patient_messaging_consent_history (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  channel text not null check (channel = 'whatsapp'),
  opted_in boolean not null,
  source text check (source is null or source in ('written', 'verbal', 'electronic')),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete cascade,
  check ((opted_in and source is not null) or (not opted_in and source is null))
);

create index patient_messaging_consent_history_patient_idx
  on public.patient_messaging_consent_history (clinic_id, patient_id, recorded_at desc);

alter table public.patient_messaging_consent_history enable row level security;
revoke all on public.patient_messaging_consent_history from anon, authenticated;
grant select on public.patient_messaging_consent_history to authenticated;

create policy patient_messaging_consent_admin_read on public.patient_messaging_consent_history
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'receptionist'])));


-- Apply patient edits and consent history as a single transaction.
create function public.update_patient_directory_record(
  target_clinic_id uuid,
  target_patient_id uuid,
  target_full_name text,
  target_email text,
  target_phone text,
  target_service_summary text,
  target_branch_id uuid,
  target_provider_id uuid,
  target_status text,
  target_whatsapp_opt_in boolean,
  target_whatsapp_opt_in_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_row public.patients%rowtype;
  consent_changed boolean;
  consent_recorded_at timestamptz;
  actor_id uuid := auth.uid();
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'clinician', 'receptionist']) then
    raise exception 'Patient edit access is not enabled for this role.' using errcode = '42501';
  end if;

  if target_status not in ('active', 'follow_up', 'new', 'inactive') then
    raise exception 'Patient status is invalid.' using errcode = '23514', constraint = 'patient_status_valid';
  end if;

  if target_whatsapp_opt_in and (
    target_whatsapp_opt_in_source is null
    or target_whatsapp_opt_in_source not in ('written', 'verbal', 'electronic')
  ) then
    raise exception 'Choose how the patient authorized WhatsApp appointment messages.'
      using errcode = '23514', constraint = 'patient_whatsapp_consent_source_valid';
  end if;

  if not target_whatsapp_opt_in then
    target_whatsapp_opt_in_source := null;
  end if;

  select *
    into patient_row
    from public.patients as patient
   where patient.id = target_patient_id
     and patient.clinic_id = target_clinic_id
   for update;

  if not found then
    raise exception 'Patient record not found in this clinic.' using errcode = 'P0002';
  end if;

  if target_whatsapp_opt_in and nullif(trim(target_phone), '') is null then
    raise exception 'Add a patient phone number before recording WhatsApp authorization.'
      using errcode = '23514', constraint = 'patient_whatsapp_consent_requires_phone';
  end if;

  consent_changed :=
    patient_row.appointment_whatsapp_opt_in is distinct from target_whatsapp_opt_in
    or (target_whatsapp_opt_in and patient_row.appointment_whatsapp_opt_in_source is distinct from target_whatsapp_opt_in_source);

  consent_recorded_at := case
    when target_whatsapp_opt_in and consent_changed then now()
    when target_whatsapp_opt_in then patient_row.appointment_whatsapp_opt_in_at
    else null
  end;

  if consent_changed then
    insert into public.patient_messaging_consent_history (
      clinic_id, patient_id, channel, opted_in, source, recorded_by, recorded_at
    ) values (
      target_clinic_id, target_patient_id, 'whatsapp', target_whatsapp_opt_in,
      target_whatsapp_opt_in_source, actor_id, coalesce(consent_recorded_at, now())
    );
  end if;

  update public.patients as patient
     set full_name = trim(target_full_name),
         email = nullif(trim(coalesce(target_email, '')), ''),
         phone = nullif(trim(coalesce(target_phone, '')), ''),
         service_summary = coalesce(nullif(trim(target_service_summary), ''), 'Por definir'),
         primary_branch_id = target_branch_id,
         primary_provider_id = target_provider_id,
         status = target_status,
         appointment_whatsapp_opt_in = target_whatsapp_opt_in,
         appointment_whatsapp_opt_in_at = consent_recorded_at,
         appointment_whatsapp_opt_in_source = target_whatsapp_opt_in_source
   where patient.id = target_patient_id
     and patient.clinic_id = target_clinic_id;
end;
$$;

revoke all on function public.update_patient_directory_record(uuid, uuid, text, text, text, text, uuid, uuid, text, boolean, text) from public, anon;
grant execute on function public.update_patient_directory_record(uuid, uuid, text, text, text, text, uuid, uuid, text, boolean, text) to authenticated;
-- <<< END 20261028221458_202610260010_patient_whatsapp_consent.sql
-- >>> BEGIN 20261028221505_202610260011_reminder_delivery_eligibility.sql
-- Expose delivery eligibility without returning contact details to the queue UI.
drop function public.get_appointment_reminders(uuid, timestamptz, timestamptz);

create function public.get_appointment_reminders(
  target_clinic_id uuid,
  window_start timestamptz default now(),
  window_end timestamptz default now() + interval '90 days'
)
returns table (
  id uuid,
  appointment_id uuid,
  kind text,
  scheduled_at timestamptz,
  status text,
  attempt_count integer,
  patient_name text,
  appointment_at timestamptz,
  service text,
  provider_name text,
  branch_name text,
  delivery_eligible boolean,
  delivery_block_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'receptionist']) then
    raise exception 'Appointment reminder access is not enabled for this role.' using errcode = '42501';
  end if;

  return query
    select reminder.id,
           reminder.appointment_id,
           reminder.kind,
           reminder.scheduled_at,
           reminder.status,
           reminder.attempt_count,
           patient.full_name,
           appointment.starts_at,
           appointment.service,
           provider.name,
           branch.name,
           (patient.appointment_whatsapp_opt_in and nullif(trim(patient.phone), '') is not null),
           case
             when not patient.appointment_whatsapp_opt_in then 'Sin autorización de WhatsApp'
             when nullif(trim(patient.phone), '') is null then 'Falta teléfono'
             else null
           end
      from public.appointment_reminders as reminder
      join public.appointments as appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id
      join public.clinic_providers as provider
        on provider.id = appointment.provider_id
       and provider.clinic_id = appointment.clinic_id
      join public.branches as branch
        on branch.id = appointment.branch_id
       and branch.clinic_id = appointment.clinic_id
     where reminder.clinic_id = target_clinic_id
       and reminder.scheduled_at >= window_start
       and reminder.scheduled_at < window_end
     order by reminder.scheduled_at asc;
end;
$$;

revoke all on function public.get_appointment_reminders(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_appointment_reminders(uuid, timestamptz, timestamptz) to authenticated;
-- <<< END 20261028221505_202610260011_reminder_delivery_eligibility.sql
-- >>> BEGIN 20261028221508_202610260012_patient_document_preparation.sql
-- Clients may only create documents through the atomic preparation RPC.
revoke insert on public.patient_documents from authenticated;

create function public.prepare_patient_document(
  target_clinic_id uuid,
  target_patient_id uuid,
  target_template_id uuid,
  target_kind text,
  target_service text default null
)
returns table (
  document_id uuid,
  document_title text,
  document_kind text,
  document_service text,
  document_template_version integer,
  document_content_snapshot text,
  document_status text,
  document_requested_at timestamptz,
  document_diagnosis_id uuid,
  document_created_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_row public.patients%rowtype;
  template_row public.document_templates%rowtype;
  document_row public.patient_documents%rowtype;
  active_diagnosis_id uuid;
  service_value text;
  actor_id uuid := auth.uid();
  requested_at_value timestamptz := now();
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'clinician']) then
    raise exception 'Document preparation access is not enabled for this role.' using errcode = '42501';
  end if;

  if target_kind not in ('contract', 'consent') then
    raise exception 'Document type is invalid.' using errcode = '23514';
  end if;

  select *
    into patient_row
    from public.patients as patient
   where patient.id = target_patient_id
     and patient.clinic_id = target_clinic_id
   for update;

  if not found then
    raise exception 'Patient record not found in this clinic.' using errcode = 'P0002';
  end if;

  select *
    into template_row
    from public.document_templates as template
   where template.id = target_template_id
     and template.clinic_id = target_clinic_id
     and template.kind = target_kind
     and template.active
   for share;

  if not found or nullif(trim(template_row.content), '') is null then
    raise exception 'Choose an active clinic-approved template with content.' using errcode = '23514';
  end if;

  if target_kind = 'contract' then
    select diagnosis.id
      into active_diagnosis_id
      from public.patient_diagnoses as diagnosis
     where diagnosis.clinic_id = target_clinic_id
       and diagnosis.patient_id = target_patient_id
       and diagnosis.status = 'accepted'
     order by diagnosis.created_at desc
     limit 1;

    if active_diagnosis_id is null then
      raise exception 'Accept the patient diagnosis before preparing a service contract.' using errcode = '23514';
    end if;

    service_value := coalesce(nullif(trim(target_service), ''), nullif(trim(patient_row.service_summary), ''), 'Por definir');
  else
    service_value := null;
    active_diagnosis_id := null;
  end if;

  update public.patient_documents as existing_document
     set status = 'replaced'
   where existing_document.clinic_id = target_clinic_id
     and existing_document.patient_id = target_patient_id
     and existing_document.kind = target_kind
     and existing_document.status = 'pending';

  insert into public.patient_documents (
    clinic_id, patient_id, template_id, diagnosis_id, kind, title, service,
    template_version, content_snapshot, status, requested_at, created_by
  ) values (
    target_clinic_id, target_patient_id, template_row.id, active_diagnosis_id,
    target_kind, template_row.title, service_value, template_row.version,
    template_row.content, 'pending', requested_at_value, actor_id
  )
  returning * into document_row;

  return query select document_row.id, document_row.title, document_row.kind,
                      document_row.service, document_row.template_version,
                      document_row.content_snapshot, document_row.status,
                      document_row.requested_at, document_row.diagnosis_id,
                      document_row.created_by;
end;
$$;

revoke all on function public.prepare_patient_document(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.prepare_patient_document(uuid, uuid, uuid, text, text) to authenticated;
-- <<< END 20261028221508_202610260012_patient_document_preparation.sql
-- >>> BEGIN 20261028221512_202610260013_whatsapp_reminder_dispatch.sql
-- Server-side WhatsApp delivery. This migration creates no credentials and
-- sends no messages; only the service-role worker may claim or settle rows.
alter table public.appointment_reminders
  drop constraint appointment_reminders_status_check,
  add constraint appointment_reminders_status_check
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled', 'unknown')),
  add column sending_started_at timestamptz;

-- A worker that died while a provider request was in flight must not cause an
-- automatic duplicate. Expired leases become unknown and require review.
create function public.claim_due_appointment_reminders(target_limit integer default 20)
returns table (
  reminder_id uuid,
  kind text,
  patient_name text,
  appointment_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Reminder dispatch is restricted to the server worker.' using errcode = '42501';
  end if;

  update public.appointment_reminders as reminder
     set status = 'unknown',
         sending_started_at = null,
         last_error = 'Worker stopped after claiming; provider delivery is uncertain.',
         updated_at = now()
   where reminder.status = 'sending'
     and (reminder.sending_started_at is null
       or reminder.sending_started_at < now() - interval '2 minutes');

  update public.appointment_reminders as reminder
     set status = case when appointment.status = 'confirmed'
                       and appointment.reminder_schedule_version = reminder.schedule_version
                       then 'skipped' else 'cancelled' end,
         last_error = case
           when appointment.status <> 'confirmed' then 'Appointment is no longer confirmed.'
           when appointment.reminder_schedule_version <> reminder.schedule_version then 'Appointment schedule changed.'
           when appointment.starts_at <= now() then 'Appointment has already started.'
           when not patient.appointment_whatsapp_opt_in then 'Patient has not authorized WhatsApp appointment messages.'
           else 'Patient phone number is missing or not in international E.164 format.'
         end,
         updated_at = now()
    from public.appointments as appointment
    join public.patients as patient
      on patient.id = appointment.patient_id
     and patient.clinic_id = appointment.clinic_id
   where reminder.appointment_id = appointment.id
     and reminder.clinic_id = appointment.clinic_id
     and reminder.status in ('pending', 'failed')
     and reminder.scheduled_at <= now()
     and (
       appointment.status <> 'confirmed'
       or appointment.reminder_schedule_version <> reminder.schedule_version
       or appointment.starts_at <= now()
       or not patient.appointment_whatsapp_opt_in
       or coalesce(trim(patient.phone), '') !~ '^\+[1-9][0-9]{7,14}$'
     );

  return query
    with due as (
      select reminder.id
        from public.appointment_reminders as reminder
        join public.appointments as appointment
          on appointment.id = reminder.appointment_id
         and appointment.clinic_id = reminder.clinic_id
         and appointment.reminder_schedule_version = reminder.schedule_version
        join public.patients as patient
          on patient.id = appointment.patient_id
         and patient.clinic_id = appointment.clinic_id
       where (reminder.status = 'pending'
          or (reminder.status = 'failed'
              and reminder.attempt_count < 3
              and reminder.updated_at <= now() - interval '15 minutes'))
         and reminder.scheduled_at <= now()
         and appointment.status = 'confirmed'
         and appointment.starts_at > now()
         and patient.appointment_whatsapp_opt_in
         and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$'
       order by reminder.scheduled_at, reminder.id
       limit greatest(1, least(coalesce(target_limit, 20), 50))
       for update of reminder skip locked
    ), claimed as (
      update public.appointment_reminders as reminder
         set status = 'sending',
             attempt_count = reminder.attempt_count + 1,
             sending_started_at = now(),
             last_error = null,
             updated_at = now()
        from due
       where reminder.id = due.id
       returning reminder.id, reminder.kind, reminder.appointment_id,
                 reminder.clinic_id, reminder.schedule_version
    )
    select claimed.id,
           claimed.kind,
           patient.full_name,
           appointment.starts_at
      from claimed
      join public.appointments as appointment
        on appointment.id = claimed.appointment_id
       and appointment.clinic_id = claimed.clinic_id
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id;
end;
$$;

revoke all on function public.claim_due_appointment_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_reminders(integer) to service_role;

-- Return contact details only for a currently claimed row after a second
-- authorization, schedule, appointment, and phone validation.
create function public.get_claimed_reminder_for_dispatch(target_reminder_id uuid)
returns table (
  phone text,
  patient_name text,
  appointment_at timestamptz,
  kind text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Reminder dispatch is restricted to the server worker.' using errcode = '42501';
  end if;

  update public.appointment_reminders as reminder
     set status = case when appointment.status = 'confirmed'
                       and appointment.reminder_schedule_version = reminder.schedule_version
                       then 'skipped' else 'cancelled' end,
         sending_started_at = null,
         last_error = case
           when appointment.status <> 'confirmed' then 'Appointment is no longer confirmed.'
           when appointment.reminder_schedule_version <> reminder.schedule_version then 'Appointment schedule changed.'
           when appointment.starts_at <= now() then 'Appointment has already started.'
           when not patient.appointment_whatsapp_opt_in then 'Patient has not authorized WhatsApp appointment messages.'
           else 'Patient phone number is missing or not in international E.164 format.'
         end,
         updated_at = now()
    from public.appointments as appointment
    join public.patients as patient
      on patient.id = appointment.patient_id
     and patient.clinic_id = appointment.clinic_id
   where reminder.id = target_reminder_id
     and reminder.appointment_id = appointment.id
     and reminder.clinic_id = appointment.clinic_id
     and reminder.status = 'sending'
     and (
       appointment.status <> 'confirmed'
       or appointment.reminder_schedule_version <> reminder.schedule_version
       or appointment.starts_at <= now()
       or not patient.appointment_whatsapp_opt_in
       or coalesce(trim(patient.phone), '') !~ '^\+[1-9][0-9]{7,14}$'
     );

  return query
    select trim(patient.phone),
           patient.full_name,
           appointment.starts_at,
           reminder.kind
      from public.appointment_reminders as reminder
      join public.appointments as appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
       and appointment.reminder_schedule_version = reminder.schedule_version
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id
     where reminder.id = target_reminder_id
       and reminder.status = 'sending'
       and reminder.scheduled_at <= now()
       and appointment.status = 'confirmed'
       and appointment.starts_at > now()
       and patient.appointment_whatsapp_opt_in
       and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$';
end;
$$;

revoke all on function public.get_claimed_reminder_for_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.get_claimed_reminder_for_dispatch(uuid) to service_role;

create function public.settle_appointment_reminder(
  target_reminder_id uuid,
  target_status text,
  target_provider_message_id text default null,
  target_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Reminder dispatch is restricted to the server worker.' using errcode = '42501';
  end if;

  if target_status not in ('sent', 'failed', 'unknown') then
    raise exception 'Reminder outcome is invalid.' using errcode = '23514';
  end if;

  update public.appointment_reminders as reminder
     set status = target_status,
         sending_started_at = null,
         provider_message_id = nullif(left(coalesce(target_provider_message_id, ''), 255), ''),
         last_error = nullif(left(coalesce(target_error, ''), 300), ''),
         updated_at = now()
   where reminder.id = target_reminder_id
     and reminder.status = 'sending';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.settle_appointment_reminder(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_appointment_reminder(uuid, text, text, text) to service_role;

-- Keep the staff-facing queue's eligibility indicator consistent with the
-- dispatcher's strict phone validation; never return phone numbers here.
create or replace function public.get_appointment_reminders(
  target_clinic_id uuid,
  window_start timestamptz default now(),
  window_end timestamptz default now() + interval '90 days'
)
returns table (
  id uuid,
  appointment_id uuid,
  kind text,
  scheduled_at timestamptz,
  status text,
  attempt_count integer,
  patient_name text,
  appointment_at timestamptz,
  service text,
  provider_name text,
  branch_name text,
  delivery_eligible boolean,
  delivery_block_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'receptionist']) then
    raise exception 'Appointment reminder access is not enabled for this role.' using errcode = '42501';
  end if;

  return query
    select reminder.id,
           reminder.appointment_id,
           reminder.kind,
           reminder.scheduled_at,
           reminder.status,
           reminder.attempt_count,
           patient.full_name,
           appointment.starts_at,
           appointment.service,
           provider.name,
           branch.name,
           (patient.appointment_whatsapp_opt_in
             and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$'),
           case
             when not patient.appointment_whatsapp_opt_in then 'Sin autorización de WhatsApp'
             when nullif(trim(patient.phone), '') is null then 'Falta teléfono'
             when coalesce(trim(patient.phone), '') !~ '^\+[1-9][0-9]{7,14}$' then 'Teléfono inválido: usa formato internacional'
             else null
           end
      from public.appointment_reminders as reminder
      join public.appointments as appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
       and appointment.reminder_schedule_version = reminder.schedule_version
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id
      join public.clinic_providers as provider
        on provider.id = appointment.provider_id
       and provider.clinic_id = appointment.clinic_id
      join public.branches as branch
        on branch.id = appointment.branch_id
       and branch.clinic_id = appointment.clinic_id
     where reminder.clinic_id = target_clinic_id
       and reminder.scheduled_at >= window_start
       and reminder.scheduled_at < window_end
     order by reminder.scheduled_at asc;
end;
$$;

revoke all on function public.get_appointment_reminders(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_appointment_reminders(uuid, timestamptz, timestamptz) to authenticated;

-- An unknown provider outcome is immutable and must never be automatically resent.
create or replace function private.refresh_appointment_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder_definition record;
  scheduled_time timestamptz;
begin
  if new.status <> 'confirmed' then
    update public.appointment_reminders
      set status = 'cancelled', updated_at = now()
      where clinic_id = new.clinic_id
        and appointment_id = new.id
        and schedule_version = new.reminder_schedule_version
        and status in ('pending', 'failed');
    return new;
  end if;

  update public.appointment_reminders
    set status = 'cancelled', updated_at = now()
    where clinic_id = new.clinic_id
      and appointment_id = new.id
      and schedule_version <> new.reminder_schedule_version
      and status in ('pending', 'failed');

  for reminder_definition in
    select definition.kind, definition.lead_time
      from (values
        ('confirmation_2d'::text, interval '48 hours'),
        ('reminder_1d'::text, interval '24 hours'),
        ('reminder_5h'::text, interval '5 hours')
      ) as definition(kind, lead_time)
  loop
    scheduled_time := new.starts_at - reminder_definition.lead_time;

    insert into public.appointment_reminders (
      clinic_id, appointment_id, kind, scheduled_at, status, schedule_version
    ) values (
      new.clinic_id,
      new.id,
      reminder_definition.kind,
      scheduled_time,
      case when scheduled_time > now() then 'pending' else 'skipped' end,
      new.reminder_schedule_version
    )
    on conflict (appointment_id, kind, schedule_version) do update
      set scheduled_at = excluded.scheduled_at,
          status = case
            when public.appointment_reminders.status in ('sent', 'unknown') then public.appointment_reminders.status
            else excluded.status
          end,
          attempt_count = case
            when public.appointment_reminders.status in ('sent', 'unknown') then public.appointment_reminders.attempt_count
            else 0
          end,
          last_error = case
            when public.appointment_reminders.status in ('sent', 'unknown') then public.appointment_reminders.last_error
            else null
          end,
          updated_at = now();
  end loop;

  return new;
end;
$$;
-- <<< END 20261028221512_202610260013_whatsapp_reminder_dispatch.sql
-- >>> BEGIN 20261028221515_202610260014_preserve_patient_appointment_history.sql
-- Staff workflows deactivate patients and cancel appointments; they do not
-- hard-delete clinical or scheduling records from a browser session.
revoke delete on public.patients, public.appointments from public, anon, authenticated;
-- <<< END 20261028221515_202610260014_preserve_patient_appointment_history.sql
-- >>> BEGIN 20261028221517_202610260015_protect_confirmed_deposits_from_patient_refunds.sql
-- A patient-level refund has no appointment association, so it must not be
-- allowed to consume the funds reserved for any confirmed appointment deposit.
create or replace function private.validate_payment_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  available numeric(12, 2);
  protected_deposits numeric(12, 2);
  appointment_status text;
  appointment_deposit_required boolean;
  appointment_deposit_amount numeric(12, 2);
begin
  if new.direction <> 'refund' then
    return new;
  end if;

  -- Appointment confirmation, appointment refunds, and general patient
  -- refunds all serialize on this patient-scoped transaction lock.
  perform pg_advisory_xact_lock(
    hashtext(new.clinic_id::text),
    hashtext(new.patient_id::text)
  );

  select coalesce(sum(case when payment.direction = 'income' then payment.amount else -payment.amount end), 0)
    into available
    from public.payments as payment
   where payment.clinic_id = new.clinic_id
     and payment.patient_id = new.patient_id
     and (
       new.appointment_id is null
       or payment.appointment_id = new.appointment_id
     );

  if new.amount > available then
    raise exception 'refund exceeds available net income'
      using errcode = '23514', constraint = 'payments_refund_within_balance';
  end if;

  if new.appointment_id is not null then
    select appointment.status, appointment.deposit_required, appointment.deposit_amount
      into appointment_status, appointment_deposit_required, appointment_deposit_amount
      from public.appointments as appointment
     where appointment.id = new.appointment_id
       and appointment.clinic_id = new.clinic_id;

    if appointment_status = 'confirmed'
       and appointment_deposit_required
       and available - new.amount < appointment_deposit_amount then
      raise exception 'refund would leave a confirmed appointment below its required deposit'
        using errcode = '23514', constraint = 'payments_refund_preserves_appointment_deposit';
    end if;
  else
    select coalesce(sum(appointment.deposit_amount), 0)
      into protected_deposits
      from public.appointments as appointment
     where appointment.clinic_id = new.clinic_id
       and appointment.patient_id = new.patient_id
       and appointment.status = 'confirmed'
       and appointment.deposit_required;

    if available - new.amount < protected_deposits then
      raise exception 'patient-level refund would consume funds reserved for confirmed appointment deposits'
        using errcode = '23514', constraint = 'payments_refund_preserves_patient_deposits';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_payment_refund() from public, anon, authenticated;
-- <<< END 20261028221517_202610260015_protect_confirmed_deposits_from_patient_refunds.sql
-- >>> BEGIN 20261028221523_202610260016_align_clinic_timezone_default.sql
-- Keep new clinic records aligned with the clinic's Tijuana UI and reminder
-- defaults. Existing clinics retain their explicitly stored timezone.
alter table public.clinics
  alter column timezone set default 'America/Tijuana';
-- <<< END 20261028221523_202610260016_align_clinic_timezone_default.sql
-- >>> BEGIN 20261028221526_202610260017_include_deposit_reserves_in_finance_appointments.sql
-- Finance-only appointment lookups must include deposit fields so refund
-- workflows can display the amount reserved by confirmed bookings.
drop function public.get_finance_appointments(uuid, timestamptz, timestamptz, uuid[]);

create function public.get_finance_appointments(target_clinic_id uuid, from_at timestamptz, to_at timestamptz, appointment_ids uuid[] default '{}')
returns table(
  appointment_id uuid,
  patient_id uuid,
  business_id uuid,
  branch_id uuid,
  provider_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  service text,
  modality text,
  status text,
  branch_name text,
  provider_name text,
  business_name text,
  deposit_required boolean,
  deposit_amount numeric(12, 2)
)
language sql stable security definer
set search_path = ''
as $$
  select appointment.id, appointment.patient_id, appointment.business_id,
         appointment.branch_id, appointment.provider_id, appointment.starts_at,
         appointment.ends_at, appointment.service, appointment.modality, appointment.status,
         branch.name, provider.name, business.name,
         appointment.deposit_required, appointment.deposit_amount
  from public.appointments as appointment
  left join public.branches as branch on branch.id = appointment.branch_id and branch.clinic_id = appointment.clinic_id
  left join public.clinic_providers as provider on provider.id = appointment.provider_id and provider.clinic_id = appointment.clinic_id
  left join public.businesses as business on business.id = appointment.business_id and business.clinic_id = appointment.clinic_id
  where appointment.clinic_id = target_clinic_id
    and ((appointment.starts_at >= from_at and appointment.starts_at < to_at) or appointment.id = any(appointment_ids))
    and (select private.has_clinic_access(target_clinic_id, array['admin', 'receptionist', 'billing']))
  order by appointment.starts_at desc;
$$;

revoke all on function public.get_finance_appointments(uuid, timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.get_finance_appointments(uuid, timestamptz, timestamptz, uuid[]) to authenticated;
-- <<< END 20261028221526_202610260017_include_deposit_reserves_in_finance_appointments.sql
-- >>> BEGIN 20261028221529_202610270001_patient_encounters_and_files.sql
-- Structured clinical encounters and patient-linked copies of signed documents.
-- The storage bucket is private; files are served only through short-lived URLs.
create table public.patient_encounters (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  appointment_id uuid,
  clinician_id uuid,
  occurred_at timestamptz not null default now(),
  chief_complaint text not null check (length(trim(chief_complaint)) between 1 and 2000),
  history text not null default '',
  examination text not null default '',
  assessment text not null default '',
  plan text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (clinician_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete restrict,
  foreign key (appointment_id, patient_id, clinic_id) references public.appointments(id, patient_id, clinic_id) on delete restrict
);
create index patient_encounters_timeline_idx on public.patient_encounters(clinic_id, patient_id, occurred_at desc);
alter table public.patient_encounters enable row level security;
revoke all on public.patient_encounters from anon, authenticated;
grant select, insert on public.patient_encounters to authenticated;
create policy patient_encounters_clinical_read on public.patient_encounters
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin','clinician'])));
create policy patient_encounters_clinician_insert on public.patient_encounters
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (select private.has_clinic_access(clinic_id, array['admin','clinician']))
  );

create table public.patient_document_files (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  kind text not null check (kind in ('consent','contract','other')),
  title text not null check (length(trim(title)) between 1 and 200),
  signed_at timestamptz,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict
);
create index patient_document_files_timeline_idx on public.patient_document_files(clinic_id, patient_id, created_at desc);
alter table public.patient_document_files enable row level security;
revoke all on public.patient_document_files from anon, authenticated;
grant select, insert on public.patient_document_files to authenticated;
create policy patient_files_clinical_read on public.patient_document_files
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin','clinician','receptionist'])));
create policy patient_files_clinician_insert on public.patient_document_files
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and (select private.has_clinic_access(clinic_id, array['admin','clinician']))
    and storage_path like clinic_id::text || '/' || patient_id::text || '/%'
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('patient-records', 'patient-records', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy patient_record_files_read on storage.objects for select to authenticated
  using (bucket_id = 'patient-records' and (select private.has_clinic_access((storage.foldername(name))[1]::uuid, array['admin','clinician','receptionist'])));
create policy patient_record_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'patient-records'
    and (select private.has_clinic_access((storage.foldername(name))[1]::uuid, array['admin','clinician']))
    and (storage.foldername(name))[2] is not null
  );
-- <<< END 20261028221529_202610270001_patient_encounters_and_files.sql
-- >>> BEGIN 20261028221533_202610270002_appointment_confirmation_responses.sql
-- Two-way appointment confirmation requests. No outbound message is sent by
-- this migration; a separately configured service worker dispatches the queue.
create table public.appointment_confirmation_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  schedule_version integer not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped','cancelled','unknown')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  sending_started_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, schedule_version),
  foreign key (appointment_id, clinic_id) references public.appointments(id, clinic_id) on delete cascade
);
create index appointment_confirmation_due_idx on public.appointment_confirmation_requests(scheduled_at) where status in ('pending','failed');
alter table public.appointment_confirmation_requests enable row level security;
revoke all on public.appointment_confirmation_requests from anon, authenticated;
grant select on public.appointment_confirmation_requests to authenticated;
create policy appointment_confirmation_staff_read on public.appointment_confirmation_requests
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin','receptionist'])));

create table public.appointment_confirmation_replies (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  context_message_id text not null,
  action text not null check (action in ('confirm','cancel','reschedule')),
  received_at timestamptz not null default now(),
  outcome text not null check (outcome in ('confirmed','cancelled','staff_follow_up','needs_staff','ignored'))
);
revoke all on public.appointment_confirmation_replies from public, anon, authenticated;
grant all on public.appointment_confirmation_requests, public.appointment_confirmation_replies to service_role;

create function public.claim_due_appointment_confirmations(target_limit integer default 20)
returns table(request_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Confirmation dispatch is restricted to the server worker.' using errcode='42501'; end if;
  update public.appointment_confirmation_requests r set status='unknown', sending_started_at=null,
    last_error='Worker stopped after claiming; provider delivery is uncertain.', updated_at=now()
   where r.status='sending' and (r.sending_started_at is null or r.sending_started_at < now()-interval '2 minutes');
  return query with due as (
    select r.id from public.appointment_confirmation_requests r
    join public.appointments a on a.id=r.appointment_id and a.clinic_id=r.clinic_id
    join public.patients p on p.id=a.patient_id and p.clinic_id=a.clinic_id
    where (r.status='pending' or (r.status='failed' and r.attempt_count<3 and r.updated_at<=now()-interval '15 minutes'))
      and r.scheduled_at<=now() and a.status='pending'
      and a.starts_at>now() and a.reminder_schedule_version=r.schedule_version
      and p.appointment_whatsapp_opt_in and coalesce(trim(p.phone),'') ~ '^\+[1-9][0-9]{7,14}$'
    order by r.scheduled_at
    limit least(greatest(coalesce(target_limit,20),1),50)
    for update of r skip locked
  ), claimed as (
    update public.appointment_confirmation_requests r set status='sending',attempt_count=r.attempt_count+1,
      sending_started_at=now(),last_error=null,updated_at=now() from due where r.id=due.id returning r.id
  ) select claimed.id from claimed;
end; $$;
revoke all on function public.claim_due_appointment_confirmations(integer) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_confirmations(integer) to service_role;

create function public.get_claimed_appointment_confirmation(target_request_id uuid)
returns table(request_id uuid, phone text, patient_name text, appointment_at timestamptz, clinic_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Confirmation dispatch is restricted to the server worker.' using errcode='42501'; end if;
  return query select r.id, trim(p.phone), p.full_name, a.starts_at, a.clinic_id
    from public.appointment_confirmation_requests r
    join public.appointments a on a.id=r.appointment_id and a.clinic_id=r.clinic_id
    join public.patients p on p.id=a.patient_id and p.clinic_id=a.clinic_id
    where r.id=target_request_id and r.status='sending' and r.scheduled_at<=now()
      and a.status='pending' and a.starts_at>now() and a.reminder_schedule_version=r.schedule_version
      and p.appointment_whatsapp_opt_in and coalesce(trim(p.phone),'') ~ '^\+[1-9][0-9]{7,14}$';
end; $$;
revoke all on function public.get_claimed_appointment_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.get_claimed_appointment_confirmation(uuid) to service_role;

create function public.settle_appointment_confirmation(target_request_id uuid, target_status text, target_message_id text default null, target_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Confirmation dispatch is restricted to the server worker.' using errcode='42501'; end if;
  if target_status not in ('sent','failed','unknown','skipped') then raise exception 'Invalid confirmation outcome.' using errcode='23514'; end if;
  update public.appointment_confirmation_requests set status=target_status,sending_started_at=null,
    provider_message_id=nullif(left(coalesce(target_message_id,''),255),''),last_error=nullif(left(coalesce(target_error,''),300),''),updated_at=now()
    where id=target_request_id and status='sending';
  get diagnostics changed=row_count; return changed=1;
end; $$;
revoke all on function public.settle_appointment_confirmation(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.settle_appointment_confirmation(uuid,text,text,text) to service_role;

create function public.apply_appointment_confirmation_reply(target_context_message_id text, target_inbound_message_id text, target_from text, target_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare request_row public.appointment_confirmation_requests%rowtype;
appointment_row public.appointments%rowtype;
patient_row public.patients%rowtype;
reply_outcome text;
matching_requests integer;
inserted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Webhook processing is restricted to the server worker.' using errcode='42501'; end if;
  if target_action not in ('confirm','cancel','reschedule') or nullif(target_inbound_message_id,'') is null then return 'ignored'; end if;
  if exists(select 1 from public.appointment_confirmation_replies where provider_message_id=target_inbound_message_id) then return 'duplicate'; end if;
  if nullif(target_context_message_id,'') is not null then
    select r.* into request_row from public.appointment_confirmation_requests r
      where r.provider_message_id=target_context_message_id and r.status='sent'
        and exists(select 1 from public.appointments a where a.id=r.appointment_id and a.clinic_id=r.clinic_id and a.reminder_schedule_version=r.schedule_version)
      for update;
  else
    select count(*) into matching_requests from public.appointment_confirmation_requests r
      join public.appointments a on a.id=r.appointment_id and a.clinic_id=r.clinic_id
      join public.patients p on p.id=a.patient_id and p.clinic_id=a.clinic_id
      where r.status='sent' and a.status='pending' and a.starts_at>now() and a.reminder_schedule_version=r.schedule_version
        and regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(target_from,''),'[^0-9]','','g');
    if matching_requests <> 1 then return 'ignored'; end if;
    select r.* into request_row from public.appointment_confirmation_requests r
      join public.appointments a on a.id=r.appointment_id and a.clinic_id=r.clinic_id
      join public.patients p on p.id=a.patient_id and p.clinic_id=a.clinic_id
      where r.status='sent' and a.status='pending' and a.starts_at>now() and a.reminder_schedule_version=r.schedule_version
        and regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(target_from,''),'[^0-9]','','g') for update of r;
  end if;
  if not found then return 'ignored'; end if;
  select a.* into appointment_row from public.appointments a where a.id=request_row.appointment_id and a.clinic_id=request_row.clinic_id for update;
  select p.* into patient_row from public.patients p where p.id=appointment_row.patient_id and p.clinic_id=appointment_row.clinic_id;
  if appointment_row.status <> 'pending' or appointment_row.starts_at <= now()
     or regexp_replace(coalesce(patient_row.phone,''),'[^0-9]','','g') <> regexp_replace(coalesce(target_from,''),'[^0-9]','','g') then return 'ignored'; end if;
  reply_outcome := case target_action when 'confirm' then 'confirmed' when 'cancel' then 'cancelled' else 'staff_follow_up' end;
  insert into public.appointment_confirmation_replies(provider_message_id,context_message_id,action,outcome)
    values(target_inbound_message_id,coalesce(nullif(target_context_message_id,''),request_row.provider_message_id),target_action,reply_outcome) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;
  if target_action='confirm' then
    if appointment_row.deposit_required and not exists (
      select 1 from public.payments pay where pay.appointment_id=appointment_row.id and pay.clinic_id=appointment_row.clinic_id
      group by pay.appointment_id having sum(case when pay.direction='income' then pay.amount else -pay.amount end) >= appointment_row.deposit_amount
    ) then
      update public.appointment_confirmation_replies set outcome='needs_staff' where provider_message_id=target_inbound_message_id;
      insert into public.patient_activities(clinic_id,patient_id,activity_type,note,author_id)
        values(appointment_row.clinic_id,appointment_row.patient_id,'message','La paciente respondió que confirma la cita, pero falta registrar el depósito requerido. Revisar manualmente.',null);
      return 'needs_staff';
    end if;
    update public.appointments set status='confirmed',updated_at=now() where id=appointment_row.id and clinic_id=appointment_row.clinic_id;
    return 'confirmed';
  elsif target_action='cancel' then
    update public.appointments set status='cancelled',updated_at=now() where id=appointment_row.id and clinic_id=appointment_row.clinic_id;
    return 'cancelled';
  end if;
  insert into public.patient_activities(clinic_id,patient_id,activity_type,note,author_id)
    values(appointment_row.clinic_id,appointment_row.patient_id,'message','La paciente solicitó reagendar su cita del '||to_char(appointment_row.starts_at,'YYYY-MM-DD HH24:MI')||'. Responder manualmente.',null);
  return 'staff_follow_up';
end; $$;
revoke all on function public.apply_appointment_confirmation_reply(text,text,text,text) from public, anon, authenticated;
grant execute on function public.apply_appointment_confirmation_reply(text,text,text,text) to service_role;

-- Keep 24-hour and 5-hour reminders on confirmed appointments. The 48-hour
-- request now belongs to the pending-appointment confirmation queue below.
create or replace function private.refresh_appointment_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  reminder_definition record;
  scheduled_time timestamptz;
begin
  if new.status <> 'confirmed' then
    update public.appointment_reminders set status='cancelled',updated_at=now()
      where clinic_id=new.clinic_id and appointment_id=new.id and schedule_version=new.reminder_schedule_version and status in ('pending','failed');
    return new;
  end if;
  update public.appointment_reminders set status='cancelled',updated_at=now()
    where clinic_id=new.clinic_id and appointment_id=new.id and schedule_version<>new.reminder_schedule_version and status in ('pending','failed');
  update public.appointment_reminders set status='cancelled',updated_at=now()
    where clinic_id=new.clinic_id and appointment_id=new.id and kind='confirmation_2d' and schedule_version=new.reminder_schedule_version and status in ('pending','failed');
  for reminder_definition in
    select definition.kind,definition.lead_time from (values
      ('reminder_1d'::text,interval '24 hours'),('reminder_5h'::text,interval '5 hours')
    ) as definition(kind,lead_time)
  loop
    scheduled_time := new.starts_at-reminder_definition.lead_time;
    insert into public.appointment_reminders(clinic_id,appointment_id,kind,scheduled_at,status,schedule_version)
      values(new.clinic_id,new.id,reminder_definition.kind,scheduled_time,
        case when scheduled_time>now() then 'pending' else 'skipped' end,new.reminder_schedule_version)
      on conflict(appointment_id,kind,schedule_version) do update set scheduled_at=excluded.scheduled_at,
        status=case when public.appointment_reminders.status in ('sent','unknown') then public.appointment_reminders.status else excluded.status end,
        attempt_count=case when public.appointment_reminders.status in ('sent','unknown') then public.appointment_reminders.attempt_count else 0 end,
        last_error=case when public.appointment_reminders.status in ('sent','unknown') then public.appointment_reminders.last_error else null end,
        updated_at=now();
  end loop;
  return new;
end; $$;
revoke all on function private.refresh_appointment_reminders() from public, anon, authenticated;

create function private.schedule_appointment_confirmation_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare due_at timestamptz;
begin
  update public.appointment_confirmation_requests set status='cancelled',updated_at=now()
    where clinic_id=new.clinic_id and appointment_id=new.id and schedule_version<>new.reminder_schedule_version and status in ('pending','failed');
  if new.status='pending' then
    due_at := greatest(new.starts_at-interval '48 hours', now());
    insert into public.appointment_confirmation_requests(clinic_id,appointment_id,schedule_version,scheduled_at,status)
      values(new.clinic_id,new.id,new.reminder_schedule_version,due_at,'pending')
      on conflict(appointment_id,schedule_version) do update set scheduled_at=excluded.scheduled_at,
        status=case when public.appointment_confirmation_requests.status in ('sent','unknown') then public.appointment_confirmation_requests.status else 'pending' end,
        updated_at=now();
  else
    update public.appointment_confirmation_requests set status='cancelled',updated_at=now()
      where clinic_id=new.clinic_id and appointment_id=new.id and status in ('pending','failed');
  end if;
  return new;
end; $$;
revoke all on function private.schedule_appointment_confirmation_request() from public, anon, authenticated;
create trigger appointments_schedule_confirmation_request after insert or update of status,starts_at on public.appointments
  for each row execute function private.schedule_appointment_confirmation_request();

-- Move any still-pending 48-hour notices off the legacy reminder queue so
-- they cannot be sent twice by the existing reminder worker.
update public.appointment_reminders
   set status='cancelled',last_error='Two-day confirmation moved to the confirmation queue.',updated_at=now()
 where kind='confirmation_2d' and status in ('pending','failed');

-- Existing appointments do not fire the new trigger at migration time.
-- Queue every future pending appointment, sending short-notice requests now.
insert into public.appointment_confirmation_requests(clinic_id,appointment_id,schedule_version,scheduled_at,status)
select a.clinic_id,a.id,a.reminder_schedule_version,greatest(a.starts_at-interval '48 hours',now()),'pending'
  from public.appointments a
 where a.status='pending' and a.starts_at>now()
on conflict(appointment_id,schedule_version) do nothing;
-- <<< END 20261028221533_202610270002_appointment_confirmation_responses.sql
-- >>> BEGIN 20261028221536_202610270003_botox_treatment_records.sql
-- Separate, clinician-only audit trail for Botox treatment sessions.
create table public.botox_treatment_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  appointment_id uuid,
  clinician_id uuid,
  performed_at timestamptz not null default now(),
  product text not null check (length(trim(product)) between 1 and 160),
  lot_number text not null check (length(trim(lot_number)) between 1 and 100),
  expiration_date date,
  treatment_areas text not null check (length(trim(treatment_areas)) between 1 and 4000),
  total_units numeric(7,2) not null check (total_units > 0 and total_units <= 10000),
  follow_up text not null default '' check (length(follow_up) <= 4000),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (clinician_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete restrict,
  foreign key (appointment_id, patient_id, clinic_id) references public.appointments(id, patient_id, clinic_id) on delete restrict
);

create index botox_treatment_records_timeline_idx
  on public.botox_treatment_records(clinic_id, patient_id, performed_at desc);

alter table public.botox_treatment_records enable row level security;
revoke all on public.botox_treatment_records from anon, authenticated;
grant select, insert on public.botox_treatment_records to authenticated;

create policy botox_records_clinical_read on public.botox_treatment_records
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin','clinician'])));

create policy botox_records_clinician_insert on public.botox_treatment_records
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_clinic_access(clinic_id, array['admin','clinician']))
  );
-- <<< END 20261028221536_202610270003_botox_treatment_records.sql
-- >>> BEGIN 20261028221549_202610270004_botox_consent_links.sql
-- Tie a Botox treatment record to the signed consent record or uploaded copy.
alter table public.patient_documents
  add constraint patient_documents_id_patient_clinic_key unique (id, patient_id, clinic_id);
alter table public.patient_document_files
  add constraint patient_document_files_id_patient_clinic_key unique (id, patient_id, clinic_id);

alter table public.botox_treatment_records
  add column consent_document_id uuid,
  add column consent_file_id uuid,
  add constraint botox_treatment_consent_source_check
    check (consent_document_id is null or consent_file_id is null),
  add constraint botox_treatment_consent_document_fkey
    foreign key (consent_document_id, patient_id, clinic_id)
    references public.patient_documents(id, patient_id, clinic_id) on delete restrict,
  add constraint botox_treatment_consent_file_fkey
    foreign key (consent_file_id, patient_id, clinic_id)
    references public.patient_document_files(id, patient_id, clinic_id) on delete restrict;
-- <<< END 20261028221549_202610270004_botox_consent_links.sql
-- >>> BEGIN 20261028234726_enable_rls_appointment_confirmation_replies.sql
-- Defense in depth for the service-role-only inbound confirmation table.
-- Client roles have no table grants; service_role bypasses RLS.
alter table public.appointment_confirmation_replies enable row level security;
-- <<< END 20261028234726_enable_rls_appointment_confirmation_replies.sql
-- >>> BEGIN 20261029000507_branch_contact_and_hours.sql
alter table public.branches
  add column phone text,
  add column hours text;

update public.branches
set name = 'Elixir Clinic'
where name = 'Sucursal principal'
  and clinic_id = (select id from public.clinics where name = 'Elixir Clinic' limit 1);

update public.branches
set address = 'Calz. Macristy de Hermosillo #916 Col. Republica Mexicana Planta Alta, Local -3, Mexicali, Baja California',
    phone = '6863086854',
    hours = 'Lunes a sábados de 9:00 am a 2:00 pm'
where name = 'Elixir Clinic';

update public.branches
set address = 'Calz. Macristy de Hermosillo #916 Col. Republica Mexicana Planta Alta, Local -3, Mexicali, Baja California',
    phone = '6863086854',
    hours = 'Lunes a viernes de 11:00 am a 7:00 pm y sábados de 9:00 am a 2:00 pm'
where name = 'Macristy - Elixir Clinic Spa';

update public.branches
set address = 'Calz. Macristy de Hermosillo #916 Col. Republica Mexicana Planta Alta, Local -3, Mexicali, Baja California',
    phone = '6863086854',
    hours = 'Lunes a sábados de 9:00 am a 7:00 pm'
where name = 'Macristy - Florezen';

update public.branches
set address = 'Avenida General Ignacio Zaragoza 1747 Col. Nueva 21100, Mexicali, Baja California',
    phone = '6863086854',
    hours = 'Lunes a viernes de 10:00 am a 6:00 pm y sábados de 9:00 am a 2:00 pm'
where name = 'Zaragoza - Elixir Clinic Spa';

update public.branches
set address = 'Avenida General Ignacio Zaragoza 1747 Col. Nueva 21100, Mexicali, Baja California',
    phone = '6863086854',
    hours = 'Lunes a sábados de 9:00 am a 7:00 pm'
where name = 'Zaragoza - Florezen';
-- <<< END 20261029000507_branch_contact_and_hours.sql
-- >>> BEGIN 20261029040726_clinic_business_areas.sql
-- Split the two clinic brands out of their encoded branch names so the CRM
-- can switch between clinic and area using business_id / branch_id.
begin;

-- The appointment foreign key ties branch_id and business_id together. Temporarily
-- replace it inside this transaction while both sides are reassigned.
alter table public.appointments
  drop constraint if exists appointments_branch_id_business_id_clinic_id_fkey;

do $migration$
declare
  target record;
  target_business_id uuid;
begin
  for target in
    select distinct branch.clinic_id, area.business_name
      from public.branches as branch
      cross join (values
        ('Macristy - Elixir Clinic Spa', 'Elixir Clinic Spa'),
        ('Zaragoza - Elixir Clinic Spa', 'Elixir Clinic Spa'),
        ('Macristy - Florezen', 'Florezen'),
        ('Zaragoza - Florezen', 'Florezen')
      ) as area(branch_name, business_name)
     where lower(trim(branch.name)) = lower(area.branch_name)
  loop
    select business.id
      into target_business_id
      from public.businesses as business
     where business.clinic_id = target.clinic_id
       and lower(trim(business.name)) = lower(target.business_name)
     order by business.created_at, business.id
     limit 1;

    if target_business_id is null then
      insert into public.businesses (clinic_id, name, active)
      values (target.clinic_id, target.business_name, true)
      returning id into target_business_id;
    end if;

    update public.branches as branch
       set business_id = target_business_id
      from (values
        ('Macristy - Elixir Clinic Spa', 'Elixir Clinic Spa'),
        ('Zaragoza - Elixir Clinic Spa', 'Elixir Clinic Spa'),
        ('Macristy - Florezen', 'Florezen'),
        ('Zaragoza - Florezen', 'Florezen')
      ) as area(branch_name, business_name)
     where branch.clinic_id = target.clinic_id
       and lower(trim(area.business_name)) = lower(trim(target.business_name))
       and lower(trim(branch.name)) = lower(trim(area.branch_name));

    update public.appointments as appointment
       set business_id = branch.business_id
      from public.branches as branch
     where appointment.clinic_id = target.clinic_id
       and appointment.branch_id = branch.id
       and branch.clinic_id = target.clinic_id;
  end loop;
end
$migration$;

alter table public.appointments
  add constraint appointments_branch_id_business_id_clinic_id_fkey
  foreign key (branch_id, business_id, clinic_id)
  references public.branches(id, business_id, clinic_id)
  on delete restrict;

commit;
-- <<< END 20261029040726_clinic_business_areas.sql
-- >>> BEGIN 20261029050010_profile_avatars.sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy profile_avatars_read_own
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy profile_avatars_upload_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.extension(name) in ('jpg', 'png', 'webp')
);

create policy profile_avatars_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
-- <<< END 20261029050010_profile_avatars.sql
-- >>> BEGIN 20261029050539_profile_signatures.sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-signatures',
  'profile-signatures',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy profile_signatures_read_own
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-signatures'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy profile_signatures_upload_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-signatures'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif')
);

create policy profile_signatures_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-signatures'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
-- <<< END 20261029050539_profile_signatures.sql
-- >>> BEGIN 20261029064027_admin_clinic_membership_insert.sql
-- Let clinic admins grant an existing account access to their clinic.
-- Membership changes keep RLS and the membership audit trigger in effect.
grant insert on public.clinic_memberships to authenticated;

create policy memberships_admin_insert on public.clinic_memberships
  for insert to authenticated
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));
-- <<< END 20261029064027_admin_clinic_membership_insert.sql
-- >>> BEGIN 20261029080207_admin_manage_clinic_memberships.sql
-- Allow clinic admins to update roles and revoke access while keeping the audit trigger active.
grant update (role), delete on public.clinic_memberships to authenticated;

create policy memberships_admin_update on public.clinic_memberships
  for update to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));

create policy memberships_admin_delete on public.clinic_memberships
  for delete to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])));

create or replace function private.prevent_last_clinic_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_clinic uuid;
  admins_remaining integer;
begin
  if tg_op = 'UPDATE' then
    if old.role <> 'admin' or new.role = 'admin' then
      return new;
    end if;
    affected_clinic := old.clinic_id;
  else
    if old.role <> 'admin' then
      return old;
    end if;
    affected_clinic := old.clinic_id;
  end if;

  -- Serialize admin demotions/revocations for this clinic to prevent concurrent lockout.
  perform 1 from public.clinics where id = affected_clinic for update;
  select count(*) into admins_remaining
  from public.clinic_memberships
  where clinic_id = affected_clinic and role = 'admin';

  if admins_remaining <= 1 then
    raise exception 'clinic_must_keep_admin'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_last_clinic_admin_removal() from public;

create trigger prevent_last_clinic_admin_removal
  before update of role or delete on public.clinic_memberships
  for each row execute function private.prevent_last_clinic_admin_removal();
-- <<< END 20261029080207_admin_manage_clinic_memberships.sql
-- >>> BEGIN 20261029180738_professional_account_links.sql
-- Identity comes from the account; clinical title and branch assignments stay clinic-owned.
create or replace function private.enforce_provider_account_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare account_row auth.users%rowtype;
begin
  if new.user_id is null then return new; end if;
  select * into account_row from auth.users where id = new.user_id;
  if not found or new.user_id = '2bb8b5a1-b652-4db7-8070-8e0a5ee7897e'::uuid
     or lower(account_row.email) = 'admin@mkzsolutions.com.mx' then
    raise exception 'Esta cuenta no está disponible para el equipo clínico.';
  end if;
  if tg_op = 'INSERT' or new.user_id is distinct from old.user_id or new.clinic_id is distinct from old.clinic_id then
    perform 1 from public.clinic_memberships where clinic_id = new.clinic_id and user_id = new.user_id for share;
    if not found then raise exception 'La cuenta ya no tiene acceso a esta clínica.'; end if;
  end if;
  new.name := left(coalesce(nullif(trim(concat_ws(' ',
    account_row.raw_user_meta_data->>'names', account_row.raw_user_meta_data->>'firstLastName', account_row.raw_user_meta_data->>'secondLastName')), ''),
    nullif(account_row.raw_user_meta_data->>'full_name', ''), nullif(account_row.raw_user_meta_data->>'name', ''), account_row.email, new.name), 160);
  return new;
end;
$$;
revoke all on function private.enforce_provider_account_identity() from public;
create trigger provider_account_identity before insert or update on public.clinic_providers
for each row execute function private.enforce_provider_account_identity();

create or replace function private.sync_professional_profile_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The provider trigger derives the current account name, including on profile edits.
  update public.clinic_providers set name = name where user_id = new.id;
  return new;
end;
$$;
revoke all on function private.sync_professional_profile_name() from public;
create trigger sync_professional_profile_name after update of raw_user_meta_data, email on auth.users
for each row when (old.raw_user_meta_data is distinct from new.raw_user_meta_data or old.email is distinct from new.email)
execute function private.sync_professional_profile_name();

create or replace function public.save_clinic_professional(
  p_clinic_id uuid, p_provider_id uuid, p_user_id uuid, p_name text, p_role_title text, p_branch_ids uuid[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; prior_user_id uuid; unique_branches uuid[];
begin
  if auth.uid() is null or not private.has_clinic_access(p_clinic_id, array['admin']) then
    raise exception 'Solo una persona administradora puede guardar profesionales.' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 160 or length(coalesce(p_role_title,'')) > 160 then
    raise exception 'Revisa el nombre y el cargo o especialidad.';
  end if;
  select array_agg(distinct branch_id) into unique_branches from unnest(p_branch_ids) branch_id;
  if coalesce(cardinality(unique_branches), 0) = 0 then raise exception 'Selecciona al menos una sucursal de atención.'; end if;
  perform 1 from public.branches where clinic_id = p_clinic_id and active and id = any(unique_branches) for share;
  if (select count(*) from public.branches where clinic_id = p_clinic_id and active and id = any(unique_branches)) <> cardinality(unique_branches) then
    raise exception 'Revisa las sucursales seleccionadas.';
  end if;
  if p_provider_id is not null then
    select user_id into prior_user_id from public.clinic_providers where id = p_provider_id and clinic_id = p_clinic_id for update;
    if not found then raise exception 'El profesional ya no está disponible en esta clínica.'; end if;
    if prior_user_id is not null and p_user_id is distinct from prior_user_id then
      raise exception 'La cuenta vinculada no se puede sustituir desde este formulario.';
    end if;
    update public.clinic_providers set name = trim(p_name), role_title = coalesce(nullif(trim(p_role_title),''),'Profesional'), user_id = p_user_id
      where id = p_provider_id and clinic_id = p_clinic_id returning id into saved_id;
  else
    insert into public.clinic_providers(clinic_id,user_id,name,role_title)
      values(p_clinic_id,p_user_id,trim(p_name),coalesce(nullif(trim(p_role_title),''),'Profesional')) returning id into saved_id;
  end if;
  delete from public.provider_branches where clinic_id = p_clinic_id and provider_id = saved_id;
  insert into public.provider_branches(clinic_id,provider_id,branch_id)
    select p_clinic_id,saved_id,branch_id from unnest(unique_branches) branch_id;
  return saved_id;
exception when unique_violation then
  raise exception 'Esta cuenta ya está vinculada a otro profesional. Edita el registro existente.' using errcode = '23505';
end;
$$;
revoke all on function public.save_clinic_professional(uuid,uuid,uuid,text,text,uuid[]) from public, anon;
grant execute on function public.save_clinic_professional(uuid,uuid,uuid,text,text,uuid[]) to authenticated;
-- <<< END 20261029180738_professional_account_links.sql
-- >>> BEGIN 20261029182052_agenda_professional_colors.sql
-- Agenda identity belongs to a professional at a branch, independently of patient avatars and appointment status.
create or replace function private.valid_agenda_color_config(color text, service_colors jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare allowed text[] := array['green','orange','yellow','burgundy','blue','indigo','red','pink'];
begin
  if color is not null and not color = any(allowed) then return false; end if;
  if jsonb_typeof(service_colors) <> 'object' then return false; end if;
  if (select count(*) from jsonb_each(service_colors)) > 20 then return false; end if;
  return not exists(select 1 from jsonb_each_text(service_colors) r where length(trim(r.key)) not between 1 and 80 or r.value is null or not r.value = any(allowed));
end;
$$;
revoke all on function private.valid_agenda_color_config(text,jsonb) from public;
grant execute on function private.valid_agenda_color_config(text,jsonb) to authenticated;
alter table public.provider_branches add column agenda_color text,
  add column agenda_service_colors jsonb not null default '{}'::jsonb,
  add constraint provider_branch_agenda_colors_valid check(private.valid_agenda_color_config(agenda_color,agenda_service_colors));
create or replace function public.save_clinic_professional_with_colors(
  p_clinic_id uuid, p_provider_id uuid, p_user_id uuid, p_name text, p_role_title text, p_branch_ids uuid[], p_branch_settings jsonb default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; prior_user_id uuid; unique_branches uuid[]; prior_settings jsonb; settings jsonb;
begin
  if auth.uid() is null or not private.has_clinic_access(p_clinic_id, array['admin']) then
    raise exception 'Solo una persona administradora puede guardar profesionales.' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 160 or length(coalesce(p_role_title,'')) > 160 then
    raise exception 'Revisa el nombre y el cargo o especialidad.';
  end if;
  select array_agg(distinct branch_id) into unique_branches from unnest(p_branch_ids) branch_id;
  if coalesce(cardinality(unique_branches), 0) = 0 then raise exception 'Selecciona al menos una sucursal de atención.'; end if;
  perform 1 from public.branches where clinic_id = p_clinic_id and active and id = any(unique_branches) for share;
  if (select count(*) from public.branches where clinic_id = p_clinic_id and active and id = any(unique_branches)) <> cardinality(unique_branches) then
    raise exception 'Revisa las sucursales seleccionadas.';
  end if;
  if p_provider_id is not null then
    select user_id into prior_user_id from public.clinic_providers where id = p_provider_id and clinic_id = p_clinic_id for update;
    if not found then raise exception 'El profesional ya no está disponible en esta clínica.'; end if;
    if prior_user_id is not null and p_user_id is distinct from prior_user_id then
      raise exception 'La cuenta vinculada no se puede sustituir desde este formulario.';
    end if;
    update public.clinic_providers set name = trim(p_name), role_title = coalesce(nullif(trim(p_role_title),''),'Profesional'), user_id = p_user_id
      where id = p_provider_id and clinic_id = p_clinic_id returning id into saved_id;
  else
    insert into public.clinic_providers(clinic_id,user_id,name,role_title)
      values(p_clinic_id,p_user_id,trim(p_name),coalesce(nullif(trim(p_role_title),''),'Profesional')) returning id into saved_id;
  end if;
  if p_branch_settings is not null and jsonb_typeof(p_branch_settings) <> 'object' then raise exception 'Revisa los colores de las sucursales.'; end if;
  select coalesce(jsonb_object_agg(branch_id::text,jsonb_build_object('color',agenda_color,'serviceColors',agenda_service_colors)), '{}'::jsonb)
    into prior_settings from public.provider_branches where clinic_id=p_clinic_id and provider_id=saved_id and branch_id=any(unique_branches);
  settings := coalesce(p_branch_settings,prior_settings);
  if exists(select 1 from jsonb_object_keys(settings) key where not key = any(select b::text from unnest(unique_branches)b)) then
    raise exception 'Revisa los colores de las sucursales.';
  end if;
  delete from public.provider_branches where clinic_id = p_clinic_id and provider_id = saved_id;
  insert into public.provider_branches(clinic_id,provider_id,branch_id,agenda_color,agenda_service_colors)
    select p_clinic_id,saved_id,branch_id,nullif(settings->branch_id::text->>'color',''),coalesce(settings->branch_id::text->'serviceColors','{}'::jsonb) from unnest(unique_branches) branch_id;
  return saved_id;
exception when unique_violation then
  raise exception 'Esta cuenta ya está vinculada a otro profesional. Edita el registro existente.' using errcode = '23505';
end;
$$;
revoke all on function public.save_clinic_professional_with_colors(uuid,uuid,uuid,text,text,uuid[],jsonb) from public, anon;
grant execute on function public.save_clinic_professional_with_colors(uuid,uuid,uuid,text,text,uuid[],jsonb) to authenticated;

-- Preserve the prior RPC contract; callers that omit colors retain their current configuration.
create or replace function public.save_clinic_professional(
  p_clinic_id uuid, p_provider_id uuid, p_user_id uuid, p_name text, p_role_title text, p_branch_ids uuid[]
) returns uuid language sql security invoker set search_path = '' as $$
  select public.save_clinic_professional_with_colors(p_clinic_id,p_provider_id,p_user_id,p_name,p_role_title,p_branch_ids,null);
$$;
notify pgrst, 'reload schema';
-- <<< END 20261029182052_agenda_professional_colors.sql
-- >>> BEGIN 20261029191404_clinic_services_catalog.sql
create table public.clinic_services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  code text not null check (length(trim(code)) between 1 and 80),
  category text not null check (length(trim(category)) between 1 and 80),
  name text not null check (length(trim(name)) between 1 and 180),
  description text,
  duration_min integer check (duration_min is null or duration_min between 15 and 720),
  duration_max integer check (duration_max is null or duration_max between 15 and 720),
  offers jsonb not null default '[]'::jsonb check (jsonb_typeof(offers) = 'array'),
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'),
  notes text,
  source text not null default 'Capturado por la clínica',
  status text not null default 'setup_needed' check (status in ('setup_needed', 'ready')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, code),
  unique (id, clinic_id),
  check (duration_min is null or duration_max is null or duration_max >= duration_min),
  check (offers = '[]'::jsonb or jsonb_typeof(offers) = 'array')
);

create index clinic_services_clinic_active_category_idx on public.clinic_services (clinic_id, active, category, name);
create table public.clinic_service_branches (
  clinic_id uuid not null,
  service_id uuid not null,
  branch_id uuid not null,
  primary key (clinic_id, service_id, branch_id),
  foreign key (service_id, clinic_id) references public.clinic_services(id, clinic_id) on delete cascade,
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete cascade
);
create index clinic_service_branches_branch_idx on public.clinic_service_branches (clinic_id, branch_id, service_id);
alter table public.clinic_service_branches enable row level security;
create table public.clinic_service_providers (
  clinic_id uuid not null,
  service_id uuid not null,
  provider_id uuid not null,
  primary key (clinic_id, service_id, provider_id),
  foreign key (service_id, clinic_id) references public.clinic_services(id, clinic_id) on delete cascade,
  foreign key (provider_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete cascade
);
create index clinic_service_providers_provider_idx on public.clinic_service_providers (clinic_id, provider_id, service_id);
alter table public.clinic_service_providers enable row level security;
alter table public.clinic_services enable row level security;

alter table public.appointments
  add column service_id uuid,
  add column service_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(service_snapshot) = 'object'),
  add constraint appointments_service_clinic_fk foreign key (service_id, clinic_id)
    references public.clinic_services(id, clinic_id) on delete restrict;
create index appointments_service_idx on public.appointments (clinic_id, service_id) where service_id is not null;
revoke all on public.clinic_services from anon, authenticated;
grant select, insert, update on public.clinic_services to authenticated;
revoke all on public.clinic_service_branches from anon, authenticated;
grant select, insert, delete on public.clinic_service_branches to authenticated;
revoke all on public.clinic_service_providers from anon, authenticated;
grant select, insert, delete on public.clinic_service_providers to authenticated;

create policy clinic_services_staff_read on public.clinic_services
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy clinic_services_admin_write on public.clinic_services
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));
create policy clinic_service_branches_staff_read on public.clinic_service_branches
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy clinic_service_branches_admin_write on public.clinic_service_branches
  for all to authenticated using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));
create policy clinic_service_providers_staff_read on public.clinic_service_providers
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy clinic_service_providers_admin_write on public.clinic_service_providers
  for all to authenticated using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));

create trigger audit_clinic_services after insert or update or delete on public.clinic_services
  for each row execute function private.capture_audit_event();

create function private.touch_clinic_service()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_clinic_service() from public, anon, authenticated;
create trigger touch_clinic_service before update on public.clinic_services
  for each row execute function private.touch_clinic_service();

create function public.save_clinic_service(
  target_clinic_id uuid, target_service_id uuid, target_code text, target_category text,
  target_name text, target_description text, target_duration_min integer, target_duration_max integer,
  target_offers jsonb, target_variants jsonb, target_notes text, target_source text,
  target_status text, target_active boolean, target_branch_ids uuid[], target_provider_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  if not private.has_clinic_access(target_clinic_id, array['admin']) then
    raise exception 'Solo una persona administradora puede modificar el catálogo.' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(target_branch_ids, array[]::uuid[])) requested(id)
    where not exists (select 1 from public.branches b where b.id = requested.id and b.clinic_id = target_clinic_id and b.active)
  ) then raise exception 'Selecciona sucursales activas de esta clínica.' using errcode = '23514'; end if;
  if exists (
    select 1 from unnest(coalesce(target_provider_ids, array[]::uuid[])) requested(id)
    where not exists (
      select 1 from public.clinic_providers p
      join public.provider_branches pb on pb.provider_id=p.id and pb.clinic_id=p.clinic_id
      where p.id=requested.id and p.clinic_id=target_clinic_id and p.active and pb.branch_id=any(coalesce(target_branch_ids,array[]::uuid[]))
    )
  ) then raise exception 'Cada profesional debe estar activo y asignado a una de las sucursales del servicio.' using errcode = '23514'; end if;
  if target_service_id is null then
    insert into public.clinic_services (clinic_id, code, category, name, description, duration_min, duration_max, offers, variants, notes, source, status, active)
    values (target_clinic_id, target_code, target_category, target_name, target_description, target_duration_min, target_duration_max, target_offers, target_variants, target_notes, coalesce(target_source, 'Capturado por la clínica'), target_status, target_active)
    returning id into saved_id;
  else
    update public.clinic_services set code=target_code, category=target_category, name=target_name,
      description=target_description, duration_min=target_duration_min, duration_max=target_duration_max,
      offers=target_offers, variants=target_variants, notes=target_notes, source=coalesce(target_source, 'Capturado por la clínica'),
      status=target_status, active=target_active
    where id=target_service_id and clinic_id=target_clinic_id returning id into saved_id;
    if saved_id is null then raise exception 'El servicio ya no existe en esta clínica.' using errcode = 'P0002'; end if;
  end if;
  delete from public.clinic_service_branches where clinic_id=target_clinic_id and service_id=saved_id;
  insert into public.clinic_service_branches (clinic_id, service_id, branch_id)
  select target_clinic_id, saved_id, requested.id
  from (select distinct id from unnest(coalesce(target_branch_ids, array[]::uuid[])) requested(id)) requested;
  delete from public.clinic_service_providers where clinic_id=target_clinic_id and service_id=saved_id;
  insert into public.clinic_service_providers (clinic_id, service_id, provider_id)
  select target_clinic_id, saved_id, requested.id
  from (select distinct id from unnest(coalesce(target_provider_ids, array[]::uuid[])) requested(id)) requested;
  return saved_id;
end;
$$;
revoke all on function public.save_clinic_service(uuid,uuid,text,text,text,text,integer,integer,jsonb,jsonb,text,text,text,boolean,uuid[],uuid[]) from public, anon;
grant execute on function public.save_clinic_service(uuid,uuid,text,text,text,text,integer,integer,jsonb,jsonb,text,text,text,boolean,uuid[],uuid[]) to authenticated;

create function private.validate_appointment_catalog_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare service_row public.clinic_services%rowtype;
begin
  if new.service_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.service_id is not distinct from new.service_id
    and old.branch_id is not distinct from new.branch_id and old.provider_id is not distinct from new.provider_id then
    new.service_snapshot := old.service_snapshot;
    return new;
  end if;
  if tg_op = 'INSERT' or old.service_id is distinct from new.service_id
    or old.branch_id is distinct from new.branch_id or old.provider_id is distinct from new.provider_id then
    select s.* into service_row from public.clinic_services s
      join public.clinic_service_branches sb on sb.clinic_id=s.clinic_id and sb.service_id=s.id and sb.branch_id=new.branch_id
      join public.clinic_service_providers sp on sp.clinic_id=s.clinic_id and sp.service_id=s.id and sp.provider_id=new.provider_id
      join public.provider_branches pb on pb.clinic_id=s.clinic_id and pb.branch_id=sb.branch_id and pb.provider_id=sp.provider_id
      where s.id=new.service_id and s.clinic_id=new.clinic_id and s.active and s.duration_min is not null;
    if service_row.id is null then
      raise exception 'El servicio no está habilitado para la sucursal y profesional seleccionados.' using errcode = '23514';
    end if;
    new.service := service_row.name;
    new.service_snapshot := jsonb_build_object('code',service_row.code,'name',service_row.name,'category',service_row.category,
      'durationMin',service_row.duration_min,'durationMax',service_row.duration_max,'offers',service_row.offers,
      'variants',service_row.variants,'capturedAt',now());
  end if;
  return new;
end;
$$;
revoke all on function private.validate_appointment_catalog_service() from public, anon, authenticated;
create trigger appointments_catalog_service_guard before insert or update of service_id, service_snapshot, branch_id, provider_id
  on public.appointments for each row execute function private.validate_appointment_catalog_service();
-- <<< END 20261029191404_clinic_services_catalog.sql
-- >>> BEGIN 20261029192115_preserve_service_snapshots.sql
create or replace function private.validate_appointment_catalog_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare service_row public.clinic_services%rowtype;
begin
  if new.service_id is null then return new; end if;

  if tg_op = 'UPDATE' and old.service_id is not distinct from new.service_id then
    new.service_snapshot := old.service_snapshot;
    new.service := old.service;
    if old.branch_id is not distinct from new.branch_id and old.provider_id is not distinct from new.provider_id then
      return new;
    end if;
  end if;

  select s.* into service_row
  from public.clinic_services s
  join public.clinic_service_branches sb on sb.clinic_id=s.clinic_id and sb.service_id=s.id and sb.branch_id=new.branch_id
  join public.clinic_service_providers sp on sp.clinic_id=s.clinic_id and sp.service_id=s.id and sp.provider_id=new.provider_id
  join public.provider_branches pb on pb.clinic_id=s.clinic_id and pb.branch_id=sb.branch_id and pb.provider_id=sp.provider_id
  join public.branches b on b.id=sb.branch_id and b.clinic_id=s.clinic_id and b.active
  join public.clinic_providers p on p.id=sp.provider_id and p.clinic_id=s.clinic_id and p.active
  where s.id=new.service_id and s.clinic_id=new.clinic_id and s.active and s.duration_min is not null;
  if service_row.id is null then
    raise exception 'El servicio no está habilitado para la sucursal y profesional seleccionados.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' or old.service_id is distinct from new.service_id then
    new.service := service_row.name;
    new.service_snapshot := jsonb_build_object('code',service_row.code,'name',service_row.name,'category',service_row.category,
      'durationMin',service_row.duration_min,'durationMax',service_row.duration_max,'offers',service_row.offers,
      'variants',service_row.variants,'capturedAt',now());
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_catalog_service_guard on public.appointments;
create trigger appointments_catalog_service_guard before insert or update of service_id, service_snapshot, service, branch_id, provider_id
  on public.appointments for each row execute function private.validate_appointment_catalog_service();
-- <<< END 20261029192115_preserve_service_snapshots.sql
-- >>> BEGIN 20261029192455_multi_service_appointments.sql
alter table public.appointments add column service_ids uuid[] not null default array[]::uuid[];
update public.appointments set service_ids = array[service_id] where service_id is not null;
create index appointments_service_ids_gin on public.appointments using gin (service_ids);

create or replace function private.validate_appointment_catalog_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  service_rows jsonb;
  service_names text;
  requested_count integer;
  matched_count integer;
begin
  if tg_op = 'UPDATE' and old.service_ids is not distinct from new.service_ids
    and old.service_id is not distinct from new.service_id then
    if old.branch_id is not distinct from new.branch_id and old.provider_id is not distinct from new.provider_id then
      new.service_snapshot := old.service_snapshot;
      new.service := old.service;
      return new;
    end if;
    if coalesce(cardinality(new.service_ids),0)=0 and new.service_id is null then
      new.service_snapshot := old.service_snapshot;
      new.service := old.service;
      return new;
    end if;
  end if;

  if coalesce(cardinality(new.service_ids),0)=0 and new.service_id is not null then
    new.service_ids := array[new.service_id];
  end if;
  if coalesce(cardinality(new.service_ids),0)=0 then
    new.service_id := null;
    new.service_snapshot := '{}'::jsonb;
    return new;
  end if;
  if cardinality(new.service_ids) <> (select count(distinct id) from unnest(new.service_ids) ids(id)) then
    raise exception 'No repitas servicios en la misma cita.' using errcode = '23514';
  end if;
  if cardinality(new.service_ids) > 12 then
    raise exception 'Selecciona hasta 12 servicios por cita.' using errcode = '23514';
  end if;
  if extract(epoch from (new.ends_at-new.starts_at)) not between 900 and 43200
    or mod(extract(epoch from (new.ends_at-new.starts_at))::integer,900)<>0 then
    raise exception 'La duración de la cita debe estar entre 15 minutos y 12 horas, en pasos de 15 minutos.' using errcode = '23514';
  end if;

  with selected as (
    select s.id,s.code,s.category,s.name,s.duration_min,s.duration_max,s.offers,s.variants,
      array_position(new.service_ids,s.id) ordinal
    from unnest(new.service_ids) requested(id)
    join public.clinic_services s on s.id=requested.id and s.clinic_id=new.clinic_id and s.active
    join public.clinic_service_branches sb on sb.clinic_id=s.clinic_id and sb.service_id=s.id and sb.branch_id=new.branch_id
    join public.clinic_service_providers sp on sp.clinic_id=s.clinic_id and sp.service_id=s.id and sp.provider_id=new.provider_id
    join public.provider_branches pb on pb.clinic_id=s.clinic_id and pb.provider_id=sp.provider_id and pb.branch_id=sb.branch_id
    join public.branches b on b.id=sb.branch_id and b.clinic_id=s.clinic_id and b.active
    join public.clinic_providers p on p.id=sp.provider_id and p.clinic_id=s.clinic_id and p.active
  )
  select count(*)::integer,
    jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'category',category,
      'durationMin',duration_min,'durationMax',duration_max,'offers',offers,'variants',variants) order by ordinal),
    string_agg(name,' + ' order by ordinal)
  into matched_count,service_rows,service_names
  from selected;
  requested_count := cardinality(new.service_ids);
  if coalesce(matched_count,0)<>requested_count then
    raise exception 'Cada servicio debe estar activo y asignado al profesional y sucursal de la cita.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.service_ids is not distinct from new.service_ids
    and old.service_id is not distinct from new.service_id then
    new.service := old.service;
    new.service_snapshot := old.service_snapshot;
    return new;
  end if;

  new.service_id := new.service_ids[1];
  new.service := service_names;
  new.service_snapshot := jsonb_build_object('services',service_rows,'scheduledDurationMinutes',extract(epoch from (new.ends_at-new.starts_at))::integer/60,'capturedAt',now());
  return new;
end;
$$;

drop trigger if exists appointments_catalog_service_guard on public.appointments;
create trigger appointments_catalog_service_guard before insert or update of service_id, service_ids, service_snapshot, service, branch_id, provider_id, starts_at, ends_at
  on public.appointments for each row execute function private.validate_appointment_catalog_service();
-- <<< END 20261029192455_multi_service_appointments.sql
-- >>> BEGIN 20261029193937_clarify_lipolaser_assessment_currency.sql
update public.clinic_services
set offers = jsonb_set(offers, '{0,currency}', '"MXN"'::jsonb, false),
    notes = 'Moneda aclarada por la clínica: MXN.',
    updated_at = now()
where code = 'lipo-assessment'
  and offers #>> '{0,kind}' = 'single'
  and (offers #>> '{0,amount}')::numeric = 500
  and offers #>> '{0,currency}' = 'UNRESOLVED';
-- <<< END 20261029193937_clarify_lipolaser_assessment_currency.sql
-- >>> BEGIN 20261029194320_empty_service_scope_is_clinic_wide.sql
create or replace function private.validate_appointment_catalog_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  service_rows jsonb;
  service_names text;
  requested_count integer;
  matched_count integer;
begin
  if tg_op = 'UPDATE' and old.service_ids is not distinct from new.service_ids
    and old.service_id is not distinct from new.service_id then
    if old.branch_id is not distinct from new.branch_id and old.provider_id is not distinct from new.provider_id then
      new.service_snapshot := old.service_snapshot;
      new.service := old.service;
      return new;
    end if;
    if coalesce(cardinality(new.service_ids),0)=0 and new.service_id is null then
      new.service_snapshot := old.service_snapshot;
      new.service := old.service;
      return new;
    end if;
  end if;

  if coalesce(cardinality(new.service_ids),0)=0 and new.service_id is not null then
    new.service_ids := array[new.service_id];
  end if;
  if coalesce(cardinality(new.service_ids),0)=0 then
    new.service_id := null;
    new.service_snapshot := '{}'::jsonb;
    return new;
  end if;
  if cardinality(new.service_ids) <> (select count(distinct id) from unnest(new.service_ids) ids(id)) then
    raise exception 'No repitas servicios en la misma cita.' using errcode = '23514';
  end if;
  if cardinality(new.service_ids) > 12 then
    raise exception 'Selecciona hasta 12 servicios por cita.' using errcode = '23514';
  end if;
  if extract(epoch from (new.ends_at-new.starts_at)) not between 900 and 43200
    or mod(extract(epoch from (new.ends_at-new.starts_at))::integer,900)<>0 then
    raise exception 'La duración de la cita debe estar entre 15 minutos y 12 horas, en pasos de 15 minutos.' using errcode = '23514';
  end if;

  with selected as (
    select s.id,s.code,s.category,s.name,s.duration_min,s.duration_max,s.offers,s.variants,
      array_position(new.service_ids,s.id) ordinal
    from unnest(new.service_ids) requested(id)
    join public.clinic_services s on s.id=requested.id and s.clinic_id=new.clinic_id and s.active
    join public.branches b on b.id=new.branch_id and b.clinic_id=s.clinic_id and b.active
    join public.clinic_providers p on p.id=new.provider_id and p.clinic_id=s.clinic_id and p.active
    join public.provider_branches pb on pb.clinic_id=s.clinic_id and pb.provider_id=p.id and pb.branch_id=b.id
    where (not exists (select 1 from public.clinic_service_branches sb where sb.clinic_id=s.clinic_id and sb.service_id=s.id)
      or exists (select 1 from public.clinic_service_branches sb where sb.clinic_id=s.clinic_id and sb.service_id=s.id and sb.branch_id=b.id))
      and (not exists (select 1 from public.clinic_service_providers sp where sp.clinic_id=s.clinic_id and sp.service_id=s.id)
      or exists (select 1 from public.clinic_service_providers sp where sp.clinic_id=s.clinic_id and sp.service_id=s.id and sp.provider_id=p.id))
  )
  select count(*)::integer,
    jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'category',category,
      'durationMin',duration_min,'durationMax',duration_max,'offers',offers,'variants',variants) order by ordinal),
    string_agg(name,' + ' order by ordinal)
  into matched_count,service_rows,service_names
  from selected;
  requested_count := cardinality(new.service_ids);
  if coalesce(matched_count,0)<>requested_count then
    raise exception 'Cada servicio debe estar activo y disponible para el profesional y sucursal de la cita.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.service_ids is not distinct from new.service_ids
    and old.service_id is not distinct from new.service_id then
    new.service := old.service;
    new.service_snapshot := old.service_snapshot;
    return new;
  end if;

  new.service_id := new.service_ids[1];
  new.service := service_names;
  new.service_snapshot := jsonb_build_object('services',service_rows,'scheduledDurationMinutes',extract(epoch from (new.ends_at-new.starts_at))::integer/60,'capturedAt',now());
  return new;
end;
$$;
-- <<< END 20261029194320_empty_service_scope_is_clinic_wide.sql
-- >>> BEGIN 20261029225620_clinic_whatsapp_mock_setup.sql
-- Clinic-scoped WhatsApp setup metadata for a simulated provider only.
-- No credentials, Meta connection, webhook registration, or message delivery.
create table public.clinic_whatsapp_configurations (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  provider_mode text not null default 'mock' check (provider_mode = 'mock'),
  waba_id text,
  allow_default_fallback boolean not null default false,
  template_readiness jsonb not null default '{"confirmation_2d":false,"reminder_1d":false,"reminder_5h":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_whatsapp_template_readiness_object check (jsonb_typeof(template_readiness) = 'object')
);

create table public.clinic_whatsapp_senders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinic_whatsapp_configurations(clinic_id) on delete cascade,
  branch_id uuid,
  sender_key text not null check (sender_key ~ '^mock:[a-z0-9]+(-[a-z0-9]+)*$'),
  display_label text not null check (length(trim(display_label)) between 1 and 120),
  meta_phone_number_id text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, sender_key),
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete cascade,
  constraint clinic_whatsapp_mock_senders_no_meta_id check (meta_phone_number_id is null)
);

create unique index clinic_whatsapp_sender_branch_unique
  on public.clinic_whatsapp_senders (clinic_id, branch_id)
  where branch_id is not null;
create unique index clinic_whatsapp_sender_default_unique
  on public.clinic_whatsapp_senders (clinic_id)
  where is_default;
create index clinic_whatsapp_sender_meta_id_idx
  on public.clinic_whatsapp_senders (meta_phone_number_id)
  where meta_phone_number_id is not null;

alter table public.clinic_whatsapp_configurations enable row level security;
alter table public.clinic_whatsapp_senders enable row level security;
revoke all on public.clinic_whatsapp_configurations from anon, authenticated;
revoke all on public.clinic_whatsapp_senders from anon, authenticated;
grant select on public.clinic_whatsapp_configurations to authenticated;
grant select on public.clinic_whatsapp_senders to authenticated;
create policy clinic_whatsapp_settings_member_read on public.clinic_whatsapp_configurations
  for select to authenticated using ((select private.has_clinic_access(clinic_id)));
create policy clinic_whatsapp_senders_member_read on public.clinic_whatsapp_senders
  for select to authenticated using ((select private.has_clinic_access(clinic_id)));

create function public.save_clinic_whatsapp_settings(
  target_clinic_id uuid,
  target_allow_default_fallback boolean,
  target_template_readiness jsonb,
  target_senders jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender jsonb;
  sender_key_value text;
  display_label_value text;
  requested_branch uuid;
  is_default_sender boolean;
  active_sender boolean;
  sender_count integer := 0;
  default_count integer := 0;
begin
  if not private.has_clinic_access(target_clinic_id, array['admin']) then
    raise exception 'Only clinic administrators can update WhatsApp settings.' using errcode = '42501';
  end if;
  if target_senders is null or jsonb_typeof(target_senders) <> 'array' or jsonb_array_length(target_senders) > 50 then
    raise exception 'Invalid sender configuration.' using errcode = '22023';
  end if;
  if target_template_readiness is null or jsonb_typeof(target_template_readiness) <> 'object'
    or target_template_readiness - array['confirmation_2d','reminder_1d','reminder_5h'] <> '{}'::jsonb
    or not (target_template_readiness ?& array['confirmation_2d','reminder_1d','reminder_5h'])
    or exists (
      select 1 from jsonb_each(target_template_readiness) as item(key, value)
      where jsonb_typeof(item.value) <> 'boolean'
    ) then
    raise exception 'Invalid simulated template readiness.' using errcode = '22023';
  end if;

  insert into public.clinic_whatsapp_configurations (
    clinic_id, provider_mode, allow_default_fallback, template_readiness, updated_at
  ) values (
    target_clinic_id, 'mock', coalesce(target_allow_default_fallback, false), target_template_readiness, now()
  ) on conflict (clinic_id) do update
    set provider_mode = 'mock',
        allow_default_fallback = excluded.allow_default_fallback,
        template_readiness = excluded.template_readiness,
        updated_at = now();

  update public.clinic_whatsapp_senders
     set active = false, is_default = false, branch_id = null, updated_at = now()
   where clinic_id = target_clinic_id;
  for sender in select value from jsonb_array_elements(target_senders)
  loop
    sender_count := sender_count + 1;
    if jsonb_typeof(sender) <> 'object' then
      raise exception 'Invalid simulated sender.' using errcode = '22023';
    end if;
    sender_key_value := trim(coalesce(sender->>'sender_key', ''));
    display_label_value := trim(coalesce(sender->>'display_label', ''));
    requested_branch := nullif(sender->>'branch_id', '')::uuid;
    is_default_sender := coalesce((sender->>'is_default')::boolean, false);
    active_sender := coalesce((sender->>'active')::boolean, true);
    if sender_key_value !~ '^mock:[a-z0-9]+(-[a-z0-9]+)*$' or length(display_label_value) not between 1 and 120 then
      raise exception 'Sender keys must be simulated and labels must be between 1 and 120 characters.' using errcode = '22023';
    end if;
    if coalesce(sender->>'meta_phone_number_id', '') <> '' then
      raise exception 'Meta phone-number IDs are disabled in mock mode.' using errcode = '22023';
    end if;
    if is_default_sender then default_count := default_count + 1; end if;
    insert into public.clinic_whatsapp_senders (
      clinic_id, branch_id, sender_key, display_label, is_default, active
    ) values (
      target_clinic_id, requested_branch, sender_key_value, display_label_value, is_default_sender, active_sender
    ) on conflict (clinic_id, sender_key) do update
      set branch_id = excluded.branch_id,
          display_label = excluded.display_label,
          is_default = excluded.is_default,
          active = excluded.active,
          updated_at = now();
  end loop;
  if default_count > 1 or (target_allow_default_fallback and default_count <> 1) then
    raise exception 'Default fallback requires exactly one default simulated sender.' using errcode = '22023';
  end if;
  if target_allow_default_fallback and not exists (
    select 1 from public.clinic_whatsapp_senders where clinic_id = target_clinic_id and is_default and active
  ) then
    raise exception 'The default simulated sender must be active.' using errcode = '22023';
  end if;
  return true;
end;
$$;

revoke all on function public.save_clinic_whatsapp_settings(uuid, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.save_clinic_whatsapp_settings(uuid, boolean, jsonb, jsonb) to authenticated;

-- Return tenant and branch routing metadata only to the server-side worker.
-- Separate sender IDs are exposed in the public RPC API only in a future live-mode migration.
create function public.get_claimed_reminder_for_dispatch_v2(target_reminder_id uuid)
returns table (
  phone text,
  patient_name text,
  appointment_at timestamptz,
  kind text,
  clinic_id uuid,
  branch_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Reminder dispatch is restricted to the server worker.' using errcode = '42501';
  end if;
  return query
    select trim(patient.phone), patient.full_name, appointment.starts_at, reminder.kind,
           reminder.clinic_id, appointment.branch_id
      from public.appointment_reminders as reminder
      join public.appointments as appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
       and appointment.reminder_schedule_version = reminder.schedule_version
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id
     where reminder.id = target_reminder_id
       and reminder.status = 'sending'
       and reminder.scheduled_at <= now()
       and appointment.status = 'confirmed'
       and appointment.starts_at > now()
       and patient.appointment_whatsapp_opt_in
       and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$';
end;
$$;
revoke all on function public.get_claimed_reminder_for_dispatch_v2(uuid) from public, anon, authenticated;
grant execute on function public.get_claimed_reminder_for_dispatch_v2(uuid) to service_role;

create function public.get_claimed_appointment_confirmation_v2(target_request_id uuid)
returns table (
  phone text,
  patient_name text,
  appointment_at timestamptz,
  clinic_id uuid,
  branch_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Confirmation dispatch is restricted to the server worker.' using errcode = '42501';
  end if;
  return query
    select trim(p.phone), p.full_name, a.starts_at, r.clinic_id, a.branch_id
      from public.appointment_confirmation_requests r
      join public.appointments a on a.id = r.appointment_id and a.clinic_id = r.clinic_id
      join public.patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
     where r.id = target_request_id and r.status = 'sending' and r.scheduled_at <= now()
       and a.status = 'pending' and a.starts_at > now() and a.reminder_schedule_version = r.schedule_version
       and p.appointment_whatsapp_opt_in and coalesce(trim(p.phone), '') ~ '^\+[1-9][0-9]{7,14}$';
end;
$$;
revoke all on function public.get_claimed_appointment_confirmation_v2(uuid) from public, anon, authenticated;
grant execute on function public.get_claimed_appointment_confirmation_v2(uuid) to service_role;

-- Inbound confirmations are scoped by the phone-number mapping resolved from
-- the signed webhook metadata. A branch-specific sender cannot affect another
-- branch; the explicit clinic default may serve every branch in that clinic.
create function public.apply_appointment_confirmation_reply_v2(
  target_clinic_id uuid,
  target_branch_id uuid,
  target_context_message_id text,
  target_inbound_message_id text,
  target_from text,
  target_action text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.appointment_confirmation_requests%rowtype;
  appointment_row public.appointments%rowtype;
  patient_row public.patients%rowtype;
  reply_outcome text;
  matching_requests integer;
  inserted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Webhook processing is restricted to the server worker.' using errcode = '42501';
  end if;
  if target_clinic_id is null or target_action not in ('confirm', 'cancel', 'reschedule')
    or nullif(target_inbound_message_id, '') is null then
    return 'ignored';
  end if;
  if exists (
    select 1 from public.appointment_confirmation_replies
     where provider_message_id = target_inbound_message_id
  ) then
    return 'duplicate';
  end if;

  if nullif(target_context_message_id, '') is not null then
    select r.* into request_row
      from public.appointment_confirmation_requests r
      join public.appointments a on a.id = r.appointment_id and a.clinic_id = r.clinic_id
     where r.provider_message_id = target_context_message_id
       and r.clinic_id = target_clinic_id
       and (target_branch_id is null or a.branch_id = target_branch_id)
       and r.status = 'sent'
       and a.reminder_schedule_version = r.schedule_version
     for update of r;
  else
    select count(*) into matching_requests
      from public.appointment_confirmation_requests r
      join public.appointments a on a.id = r.appointment_id and a.clinic_id = r.clinic_id
      join public.patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
     where r.clinic_id = target_clinic_id
       and (target_branch_id is null or a.branch_id = target_branch_id)
       and r.status = 'sent' and a.status = 'pending' and a.starts_at > now()
       and a.reminder_schedule_version = r.schedule_version
       and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
         = regexp_replace(coalesce(target_from, ''), '[^0-9]', '', 'g');
    if matching_requests <> 1 then return 'ignored'; end if;
    select r.* into request_row
      from public.appointment_confirmation_requests r
      join public.appointments a on a.id = r.appointment_id and a.clinic_id = r.clinic_id
      join public.patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
     where r.clinic_id = target_clinic_id
       and (target_branch_id is null or a.branch_id = target_branch_id)
       and r.status = 'sent' and a.status = 'pending' and a.starts_at > now()
       and a.reminder_schedule_version = r.schedule_version
       and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
         = regexp_replace(coalesce(target_from, ''), '[^0-9]', '', 'g')
     for update of r;
  end if;
  if not found then return 'ignored'; end if;

  select a.* into appointment_row from public.appointments a
   where a.id = request_row.appointment_id and a.clinic_id = target_clinic_id for update;
  select p.* into patient_row from public.patients p
   where p.id = appointment_row.patient_id and p.clinic_id = target_clinic_id;
  if appointment_row.status <> 'pending' or appointment_row.starts_at <= now()
    or (target_branch_id is not null and appointment_row.branch_id <> target_branch_id)
    or regexp_replace(coalesce(patient_row.phone, ''), '[^0-9]', '', 'g')
      <> regexp_replace(coalesce(target_from, ''), '[^0-9]', '', 'g') then
    return 'ignored';
  end if;

  reply_outcome := case target_action when 'confirm' then 'confirmed' when 'cancel' then 'cancelled' else 'staff_follow_up' end;
  insert into public.appointment_confirmation_replies(provider_message_id, context_message_id, action, outcome)
    values (target_inbound_message_id, coalesce(nullif(target_context_message_id, ''), request_row.provider_message_id), target_action, reply_outcome)
    on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;

  if target_action = 'confirm' then
    if appointment_row.deposit_required and not exists (
      select 1 from public.payments pay
       where pay.appointment_id = appointment_row.id and pay.clinic_id = appointment_row.clinic_id
       group by pay.appointment_id
       having sum(case when pay.direction = 'income' then pay.amount else -pay.amount end) >= appointment_row.deposit_amount
    ) then
      update public.appointment_confirmation_replies set outcome = 'needs_staff'
       where provider_message_id = target_inbound_message_id;
      insert into public.patient_activities(clinic_id, patient_id, activity_type, note, author_id)
        values (appointment_row.clinic_id, appointment_row.patient_id, 'message',
          'La paciente respondió que confirma la cita, pero falta registrar el depósito requerido. Revisar manualmente.', null);
      return 'needs_staff';
    end if;
    update public.appointments set status = 'confirmed', updated_at = now()
     where id = appointment_row.id and clinic_id = target_clinic_id;
    return 'confirmed';
  elsif target_action = 'cancel' then
    update public.appointments set status = 'cancelled', updated_at = now()
     where id = appointment_row.id and clinic_id = target_clinic_id;
    return 'cancelled';
  end if;

  insert into public.patient_activities(clinic_id, patient_id, activity_type, note, author_id)
    values (appointment_row.clinic_id, appointment_row.patient_id, 'message',
      'La paciente solicitó reagendar su cita del ' || to_char(appointment_row.starts_at, 'YYYY-MM-DD HH24:MI') || '. Responder manualmente.', null);
  return 'staff_follow_up';
end;
$$;
revoke all on function public.apply_appointment_confirmation_reply_v2(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_appointment_confirmation_reply_v2(uuid, uuid, text, text, text, text) to service_role;

-- Keep the staff queue explicit about whether each recorded outcome came from
-- the mock provider. This endpoint still returns no patient contact details.
create function public.get_appointment_reminders_v2(
  target_clinic_id uuid,
  window_start timestamptz default now(),
  window_end timestamptz default now() + interval '90 days'
)
returns table (
  id uuid,
  appointment_id uuid,
  kind text,
  scheduled_at timestamptz,
  status text,
  attempt_count integer,
  patient_name text,
  appointment_at timestamptz,
  service text,
  provider_name text,
  branch_name text,
  delivery_eligible boolean,
  delivery_block_reason text,
  simulated boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'receptionist']) then
    raise exception 'Appointment reminder access is not enabled for this role.' using errcode = '42501';
  end if;
  return query
    select reminder.id, reminder.appointment_id, reminder.kind, reminder.scheduled_at,
           reminder.status, reminder.attempt_count, patient.full_name, appointment.starts_at,
           appointment.service, provider.name, branch.name,
           (patient.appointment_whatsapp_opt_in and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$'),
           case
             when not patient.appointment_whatsapp_opt_in then 'Sin autorización de WhatsApp'
             when nullif(trim(patient.phone), '') is null then 'Falta teléfono'
             when coalesce(trim(patient.phone), '') !~ '^\+[1-9][0-9]{7,14}$' then 'Teléfono inválido: usa formato internacional'
             else null
           end,
           (coalesce(reminder.provider_message_id, '') like 'mock:%'
             or coalesce(reminder.last_error, '') like 'Resultado simulado:%')
      from public.appointment_reminders reminder
      join public.appointments appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
       and appointment.reminder_schedule_version = reminder.schedule_version
      join public.patients patient
        on patient.id = appointment.patient_id and patient.clinic_id = appointment.clinic_id
      join public.clinic_providers provider
        on provider.id = appointment.provider_id and provider.clinic_id = appointment.clinic_id
      join public.branches branch
        on branch.id = appointment.branch_id and branch.clinic_id = appointment.clinic_id
     where reminder.clinic_id = target_clinic_id
       and reminder.scheduled_at >= window_start and reminder.scheduled_at < window_end
     order by reminder.scheduled_at asc;
end;
$$;
revoke all on function public.get_appointment_reminders_v2(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_appointment_reminders_v2(uuid, timestamptz, timestamptz) to authenticated;
-- <<< END 20261029225620_clinic_whatsapp_mock_setup.sql
-- >>> BEGIN 20261030034458_google_calendar_oauth.sql
-- Server-only OAuth credentials for a clinic's Google Calendar connection.
-- The refresh token is encrypted by the application before it is stored.
create table public.clinic_google_calendar_connections (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  google_email text not null check (length(trim(google_email)) between 3 and 320),
  calendar_id text not null default 'primary' check (length(trim(calendar_id)) between 1 and 1024),
  refresh_token_ciphertext text not null,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'partial', 'error')),
  last_sync_error text check (last_sync_error is null or length(last_sync_error) <= 500)
);

alter table public.clinic_google_calendar_connections enable row level security;
revoke all on public.clinic_google_calendar_connections from public, anon, authenticated;
grant select, insert, update, delete on public.clinic_google_calendar_connections to service_role;

create table public.clinic_google_calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (appointment_id, clinic_id) references public.appointments(id, clinic_id) on delete cascade
);

create unique index clinic_google_calendar_active_job_unique
  on public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
  where status in ('queued', 'processing');
create index clinic_google_calendar_queued_jobs_idx
  on public.clinic_google_calendar_sync_jobs (next_attempt_at, created_at)
  where status = 'queued';

alter table public.clinic_google_calendar_sync_jobs enable row level security;
revoke all on public.clinic_google_calendar_sync_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.clinic_google_calendar_sync_jobs to service_role;

create function private.enqueue_google_calendar_appointment_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.starts_at is not distinct from new.starts_at
     and old.ends_at is not distinct from new.ends_at
     and old.status is not distinct from new.status then
    return new;
  end if;
  if new.status <> 'completed' and exists (
    select 1 from public.clinic_google_calendar_connections as connection
    where connection.clinic_id = new.clinic_id
  ) then
    insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
    values (new.clinic_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger appointments_enqueue_google_calendar_sync
  after insert or update of starts_at, ends_at, status on public.appointments
  for each row execute function private.enqueue_google_calendar_appointment_sync();

revoke all on function private.enqueue_google_calendar_appointment_sync() from public, anon, authenticated;

create function public.queue_google_calendar_initial_sync(target_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar queueing is restricted to the server.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clinic_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
  ) then
    raise exception 'Google Calendar is not connected for this clinic.' using errcode = '22023';
  end if;
  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
  select appointment.clinic_id, appointment.id
    from public.appointments as appointment
   where appointment.clinic_id = target_clinic_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
     and not exists (
       select 1 from public.clinic_google_calendar_sync_jobs as prior
       where prior.clinic_id = appointment.clinic_id
         and prior.appointment_id = appointment.id
         and prior.status = 'succeeded'
     )
  on conflict do nothing;
  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

create function public.claim_google_calendar_sync_jobs(target_clinic_id uuid default null, target_limit integer default 10)
returns table(job_id uuid, clinic_id uuid, appointment_id uuid, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar dispatch is restricted to the server.' using errcode = '42501';
  end if;
  return query
    with picked as (
      select job.id
        from public.clinic_google_calendar_sync_jobs as job
       where ((job.status = 'queued' and job.next_attempt_at <= now())
          or (job.status = 'processing' and job.updated_at < now() - interval '10 minutes'))
         and (target_clinic_id is null or job.clinic_id = target_clinic_id)
       order by job.created_at
       for update skip locked
       limit least(greatest(coalesce(target_limit, 10), 1), 50)
    )
    update public.clinic_google_calendar_sync_jobs as job
       set status = 'processing', attempts = job.attempts + 1, updated_at = now(), last_error = null
      from picked
     where job.id = picked.id
    returning job.id, job.clinic_id, job.appointment_id, job.attempts;
end;
$$;

revoke all on function public.queue_google_calendar_initial_sync(uuid) from public, anon, authenticated;
revoke all on function public.claim_google_calendar_sync_jobs(uuid, integer) from public, anon, authenticated;
grant execute on function public.queue_google_calendar_initial_sync(uuid) to service_role;
grant execute on function public.claim_google_calendar_sync_jobs(uuid, integer) to service_role;
-- <<< END 20261030034458_google_calendar_oauth.sql
-- >>> BEGIN 20261030052342_google_calendar_provider_connections.sql
begin;

create table public.clinic_provider_google_calendar_connections (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider_id uuid not null,
  google_email text not null check (length(trim(google_email)) between 3 and 320),
  calendar_id text not null default 'primary' check (length(trim(calendar_id)) between 1 and 1024),
  refresh_token_ciphertext text not null,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'partial', 'error')),
  last_sync_error text check (last_sync_error is null or length(last_sync_error) <= 500),
  primary key (clinic_id, provider_id),
  foreign key (provider_id, clinic_id)
    references public.clinic_providers(id, clinic_id) on delete cascade
);

alter table public.clinic_provider_google_calendar_connections enable row level security;
revoke all on public.clinic_provider_google_calendar_connections from public, anon, authenticated;
grant select, insert, update, delete on public.clinic_provider_google_calendar_connections to service_role;

create table public.clinic_google_calendar_event_links (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  provider_id uuid,
  calendar_id text not null,
  google_email text not null,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, appointment_id),
  foreign key (appointment_id, clinic_id)
    references public.appointments(id, clinic_id) on delete cascade
);

create index clinic_google_calendar_event_links_provider_idx
  on public.clinic_google_calendar_event_links (clinic_id, provider_id);
alter table public.clinic_google_calendar_event_links enable row level security;
revoke all on public.clinic_google_calendar_event_links from public, anon, authenticated;
grant select, insert, update, delete on public.clinic_google_calendar_event_links to service_role;

-- Preserve the known destination for events already created by the clinic-wide connection.
insert into public.clinic_google_calendar_event_links
  (clinic_id, appointment_id, provider_id, calendar_id, google_email, updated_at)
select distinct on (job.clinic_id, job.appointment_id)
  job.clinic_id, job.appointment_id, null, connection.calendar_id,
  connection.google_email, coalesce(job.completed_at, job.updated_at)
from public.clinic_google_calendar_sync_jobs as job
join public.clinic_google_calendar_connections as connection
  on connection.clinic_id = job.clinic_id
where job.status = 'succeeded'
order by job.clinic_id, job.appointment_id, job.completed_at desc nulls last, job.updated_at desc
on conflict (clinic_id, appointment_id) do nothing;

create or replace function private.enqueue_google_calendar_appointment_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.starts_at is not distinct from new.starts_at
     and old.ends_at is not distinct from new.ends_at
     and old.status is not distinct from new.status
     and old.provider_id is not distinct from new.provider_id then
    return new;
  end if;

  if new.status <> 'completed' and (
    exists (
      select 1 from public.clinic_google_calendar_connections as connection
      where connection.clinic_id = new.clinic_id
    )
    or exists (
      select 1 from public.clinic_provider_google_calendar_connections as connection
      where connection.clinic_id = new.clinic_id
        and connection.provider_id = new.provider_id
    )
    or exists (
      select 1 from public.clinic_google_calendar_event_links as event_link
      where event_link.clinic_id = new.clinic_id
        and event_link.appointment_id = new.id
    )
  ) then
    insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
    values (new.clinic_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_enqueue_google_calendar_sync on public.appointments;
create trigger appointments_enqueue_google_calendar_sync
  after insert or update of starts_at, ends_at, status, provider_id on public.appointments
  for each row execute function private.enqueue_google_calendar_appointment_sync();

create or replace function public.queue_google_calendar_initial_sync(target_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar queueing is restricted to the server.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clinic_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
  ) and not exists (
    select 1 from public.clinic_provider_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
  ) then
    raise exception 'Google Calendar is not connected for this clinic.' using errcode = '22023';
  end if;

  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
  select appointment.clinic_id, appointment.id
    from public.appointments as appointment
   where appointment.clinic_id = target_clinic_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
     and (
       exists (
         select 1 from public.clinic_google_calendar_connections as connection
         where connection.clinic_id = appointment.clinic_id
       )
       or exists (
         select 1 from public.clinic_provider_google_calendar_connections as connection
         where connection.clinic_id = appointment.clinic_id
           and connection.provider_id = appointment.provider_id
       )
     )
     and not exists (
       select 1 from public.clinic_google_calendar_sync_jobs as prior
       where prior.clinic_id = appointment.clinic_id
         and prior.appointment_id = appointment.id
         and prior.status = 'succeeded'
     )
  on conflict do nothing;
  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

create or replace function public.queue_google_calendar_provider_initial_sync(
  target_clinic_id uuid,
  target_provider_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar queueing is restricted to the server.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clinic_provider_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
      and connection.provider_id = target_provider_id
  ) then
    raise exception 'This professional has no connected Google Calendar.' using errcode = '22023';
  end if;

  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
  select appointment.clinic_id, appointment.id
    from public.appointments as appointment
   where appointment.clinic_id = target_clinic_id
     and appointment.provider_id = target_provider_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
  on conflict do nothing;
  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

drop function public.claim_google_calendar_sync_jobs(uuid, integer);
create function public.claim_google_calendar_sync_jobs(
  target_clinic_id uuid default null,
  target_limit integer default 10,
  target_provider_id uuid default null
)
returns table(job_id uuid, clinic_id uuid, appointment_id uuid, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar dispatch is restricted to the server.' using errcode = '42501';
  end if;
  return query
    with picked as (
      select job.id
        from public.clinic_google_calendar_sync_jobs as job
       where ((job.status = 'queued' and job.next_attempt_at <= now())
          or (job.status = 'processing' and job.updated_at < now() - interval '10 minutes'))
         and (target_clinic_id is null or job.clinic_id = target_clinic_id)
         and (target_provider_id is null or exists (
           select 1 from public.appointments as appointment
           where appointment.clinic_id = job.clinic_id
             and appointment.id = job.appointment_id
             and appointment.provider_id = target_provider_id
         ) or exists (
           select 1 from public.clinic_google_calendar_event_links as event_link
           where event_link.clinic_id = job.clinic_id
             and event_link.appointment_id = job.appointment_id
             and event_link.provider_id = target_provider_id
         ))
       order by job.created_at
       for update skip locked
       limit least(greatest(coalesce(target_limit, 10), 1), 50)
    )
    update public.clinic_google_calendar_sync_jobs as job
       set status = 'processing', attempts = job.attempts + 1, updated_at = now(), last_error = null
      from picked
     where job.id = picked.id
    returning job.id, job.clinic_id, job.appointment_id, job.attempts;
end;
$$;

revoke all on function public.queue_google_calendar_initial_sync(uuid) from public, anon, authenticated;
revoke all on function public.queue_google_calendar_provider_initial_sync(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_google_calendar_sync_jobs(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.queue_google_calendar_initial_sync(uuid) to service_role;
grant execute on function public.queue_google_calendar_provider_initial_sync(uuid, uuid) to service_role;
grant execute on function public.claim_google_calendar_sync_jobs(uuid, integer, uuid) to service_role;

commit;
-- <<< END 20261030052342_google_calendar_provider_connections.sql
-- >>> BEGIN 20261030062740_google_calendar_disable_clinic_fallback.sql
begin;

-- Only a professional's own connected Google account receives appointment events.
create or replace function private.enqueue_google_calendar_appointment_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.starts_at is not distinct from new.starts_at
     and old.ends_at is not distinct from new.ends_at
     and old.status is not distinct from new.status
     and old.provider_id is not distinct from new.provider_id then
    return new;
  end if;

  if new.status <> 'completed' and (
    exists (
      select 1 from public.clinic_provider_google_calendar_connections as connection
      where connection.clinic_id = new.clinic_id
        and connection.provider_id = new.provider_id
    )
    or exists (
      select 1 from public.clinic_google_calendar_event_links as event_link
      where event_link.clinic_id = new.clinic_id
        and event_link.appointment_id = new.id
        and event_link.provider_id is not null
    )
  ) then
    insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
    values (new.clinic_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.queue_google_calendar_initial_sync(target_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar queueing is restricted to the server.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clinic_provider_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
  ) then
    raise exception 'No professional Google Calendar is connected for this clinic.' using errcode = '22023';
  end if;

  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
  select appointment.clinic_id, appointment.id
    from public.appointments as appointment
   where appointment.clinic_id = target_clinic_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
     and exists (
       select 1 from public.clinic_provider_google_calendar_connections as connection
       where connection.clinic_id = appointment.clinic_id
         and connection.provider_id = appointment.provider_id
     )
     and not exists (
       select 1 from public.clinic_google_calendar_sync_jobs as prior
       where prior.clinic_id = appointment.clinic_id
         and prior.appointment_id = appointment.id
         and prior.status = 'succeeded'
     )
  on conflict do nothing;
  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

create or replace function public.claim_google_calendar_sync_jobs(
  target_clinic_id uuid default null,
  target_limit integer default 10,
  target_provider_id uuid default null
)
returns table(job_id uuid, clinic_id uuid, appointment_id uuid, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar dispatch is restricted to the server.' using errcode = '42501';
  end if;
  return query
    with picked as (
      select job.id
        from public.clinic_google_calendar_sync_jobs as job
       where ((job.status = 'queued' and job.next_attempt_at <= now())
          or (job.status = 'processing' and job.updated_at < now() - interval '10 minutes'))
         and (target_clinic_id is null or job.clinic_id = target_clinic_id)
         and (
           (
             target_provider_id is not null
             and (
               exists (
                 select 1 from public.appointments as appointment
                 where appointment.clinic_id = job.clinic_id
                   and appointment.id = job.appointment_id
                   and appointment.provider_id = target_provider_id
                   and exists (
                     select 1 from public.clinic_provider_google_calendar_connections as connection
                     where connection.clinic_id = appointment.clinic_id
                       and connection.provider_id = appointment.provider_id
                   )
               )
               or exists (
                 select 1 from public.clinic_google_calendar_event_links as event_link
                 where event_link.clinic_id = job.clinic_id
                   and event_link.appointment_id = job.appointment_id
                   and event_link.provider_id = target_provider_id
               )
             )
           )
           or (
             target_provider_id is null
             and (
               exists (
                 select 1 from public.appointments as appointment
                 join public.clinic_provider_google_calendar_connections as connection
                   on connection.clinic_id = appointment.clinic_id
                  and connection.provider_id = appointment.provider_id
                 where appointment.clinic_id = job.clinic_id
                   and appointment.id = job.appointment_id
               )
               or exists (
                 select 1 from public.clinic_google_calendar_event_links as event_link
                 where event_link.clinic_id = job.clinic_id
                   and event_link.appointment_id = job.appointment_id
                   and event_link.provider_id is not null
               )
             )
           )
         )
       order by job.created_at
       for update skip locked
       limit least(greatest(coalesce(target_limit, 10), 1), 50)
    )
    update public.clinic_google_calendar_sync_jobs as job
       set status = 'processing', attempts = job.attempts + 1, updated_at = now(), last_error = null
      from picked
     where job.id = picked.id
    returning job.id, job.clinic_id, job.appointment_id, job.attempts;
end;
$$;

commit;
-- <<< END 20261030062740_google_calendar_disable_clinic_fallback.sql
-- >>> BEGIN 20261030070000_google_calendar_per_crm_account.sql
-- Google Calendar OAuth connections belong to the CRM account that authorized them.
-- Each CRM user can independently connect a Google account and sync clinic appointments.

alter table public.clinic_google_calendar_connections
  drop constraint clinic_google_calendar_connections_pkey;
alter table public.clinic_google_calendar_connections
  add primary key (clinic_id, connected_by);
alter table public.clinic_google_calendar_connections
  alter column connected_by set not null;

alter table public.clinic_google_calendar_event_links
  add column connected_by uuid references auth.users(id) on delete cascade;
update public.clinic_google_calendar_event_links as event_link
   set connected_by = coalesce(
     (select connection.connected_by
        from public.clinic_provider_google_calendar_connections as connection
       where connection.clinic_id = event_link.clinic_id
         and connection.provider_id = event_link.provider_id),
     (select connection.connected_by
        from public.clinic_google_calendar_connections as connection
       where connection.clinic_id = event_link.clinic_id
       order by connection.connected_at
       limit 1),
     (select membership.user_id
        from public.clinic_memberships as membership
       where membership.clinic_id = event_link.clinic_id
         and membership.role = 'admin'
       order by membership.created_at
       limit 1)
   );
delete from public.clinic_google_calendar_event_links where connected_by is null;
alter table public.clinic_google_calendar_event_links
  alter column connected_by set not null;
alter table public.clinic_google_calendar_event_links
  drop constraint clinic_google_calendar_event_links_pkey;
alter table public.clinic_google_calendar_event_links
  add primary key (clinic_id, appointment_id, connected_by);

alter table public.clinic_google_calendar_sync_jobs
  add column user_id uuid references auth.users(id) on delete cascade;
update public.clinic_google_calendar_sync_jobs as job
   set user_id = coalesce(
     (select event_link.connected_by from public.clinic_google_calendar_event_links as event_link
       where event_link.clinic_id = job.clinic_id and event_link.appointment_id = job.appointment_id limit 1),
     (select connection.connected_by from public.clinic_google_calendar_connections as connection
       where connection.clinic_id = job.clinic_id order by connection.connected_at limit 1),
     (select connection.connected_by from public.clinic_provider_google_calendar_connections as connection
       join public.appointments as appointment on appointment.clinic_id = connection.clinic_id and appointment.provider_id = connection.provider_id
       where appointment.clinic_id = job.clinic_id and appointment.id = job.appointment_id limit 1)
   );
delete from public.clinic_google_calendar_sync_jobs where user_id is null;
alter table public.clinic_google_calendar_sync_jobs alter column user_id set not null;
drop index if exists public.clinic_google_calendar_active_job_unique;
create unique index clinic_google_calendar_active_job_unique
  on public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id, user_id)
  where status in ('queued', 'processing');

create or replace function private.enqueue_google_calendar_appointment_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.starts_at is not distinct from new.starts_at
     and old.ends_at is not distinct from new.ends_at
     and old.status is not distinct from new.status
     and old.provider_id is not distinct from new.provider_id then
    return new;
  end if;

  if new.status <> 'completed' then
    insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id, user_id)
    select new.clinic_id, new.id, connection.connected_by
      from public.clinic_google_calendar_connections as connection
     where connection.clinic_id = new.clinic_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.queue_google_calendar_initial_sync(target_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar queueing is restricted to the server.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clinic_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
  ) and not exists (
    select 1 from public.clinic_provider_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
  ) then
    raise exception 'No Google Calendar account is connected for this clinic.' using errcode = '22023';
  end if;

  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id, user_id)
  select appointment.clinic_id, appointment.id, connection.connected_by
    from public.appointments as appointment
    join public.clinic_google_calendar_connections as connection on connection.clinic_id = appointment.clinic_id
   where appointment.clinic_id = target_clinic_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
     and not exists (
       select 1 from public.clinic_google_calendar_sync_jobs as prior
       where prior.clinic_id = appointment.clinic_id
         and prior.appointment_id = appointment.id
         and prior.user_id = connection.connected_by
         and prior.status = 'succeeded'
     )
  on conflict do nothing;
  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

create or replace function public.queue_google_calendar_user_initial_sync(target_clinic_id uuid, target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar queueing is restricted to the server.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clinic_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id and connection.connected_by = target_user_id) then
    raise exception 'This CRM account has no connected Google Calendar.' using errcode = '22023';
  end if;
  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id, user_id)
  select appointment.clinic_id, appointment.id, target_user_id
    from public.appointments as appointment
   where appointment.clinic_id = target_clinic_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
  on conflict do nothing;
  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

revoke all on function public.queue_google_calendar_initial_sync(uuid) from public, anon, authenticated;
grant execute on function public.queue_google_calendar_initial_sync(uuid) to service_role;
revoke all on function public.queue_google_calendar_user_initial_sync(uuid, uuid) from public, anon, authenticated;
grant execute on function public.queue_google_calendar_user_initial_sync(uuid, uuid) to service_role;
drop function public.claim_google_calendar_sync_jobs(uuid, integer, uuid);
create function public.claim_google_calendar_sync_jobs(
  target_clinic_id uuid default null,
  target_limit integer default 10,
  target_provider_id uuid default null,
  target_user_id uuid default null
)
returns table(job_id uuid, clinic_id uuid, appointment_id uuid, attempts integer, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar dispatch is restricted to the server.' using errcode = '42501';
  end if;
  return query
    with picked as (
      select job.id from public.clinic_google_calendar_sync_jobs as job
       where ((job.status = 'queued' and job.next_attempt_at <= now())
          or (job.status = 'processing' and job.updated_at < now() - interval '10 minutes'))
         and (target_clinic_id is null or job.clinic_id = target_clinic_id)
         and (target_user_id is null or job.user_id = target_user_id)
         and exists (select 1 from public.clinic_google_calendar_connections as connection
           where connection.clinic_id = job.clinic_id and connection.connected_by = job.user_id)
       order by job.created_at for update skip locked
       limit least(greatest(coalesce(target_limit, 10), 1), 50)
    )
    update public.clinic_google_calendar_sync_jobs as job
       set status = 'processing', attempts = job.attempts + 1, updated_at = now(), last_error = null
      from picked where job.id = picked.id
    returning job.id, job.clinic_id, job.appointment_id, job.attempts, job.user_id;
end;
$$;
revoke all on function public.claim_google_calendar_sync_jobs(uuid, integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_google_calendar_sync_jobs(uuid, integer, uuid, uuid) to service_role;
-- <<< END 20261030070000_google_calendar_per_crm_account.sql
-- >>> BEGIN 20261030072515_clinic_availability.sql
-- Clinic availability rules: scoped blocks and configurable provider overlaps.

create table public.clinic_availability_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  allow_provider_overlaps boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.clinic_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  scope text not null default 'clinic' check (scope in ('clinic', 'branch', 'provider')),
  branch_id uuid,
  provider_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((scope = 'clinic' and branch_id is null and provider_id is null)
      or (scope = 'branch' and branch_id is not null and provider_id is null)
      or (scope = 'provider' and provider_id is not null and branch_id is null)),
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete cascade,
  foreign key (provider_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete cascade
);

create index clinic_availability_blocks_window_idx
  on public.clinic_availability_blocks (clinic_id, starts_at, ends_at);
create index clinic_availability_blocks_branch_window_idx
  on public.clinic_availability_blocks (clinic_id, branch_id, starts_at, ends_at)
  where scope = 'branch';
create index clinic_availability_blocks_provider_window_idx
  on public.clinic_availability_blocks (clinic_id, provider_id, starts_at, ends_at)
  where scope = 'provider';

alter table public.clinic_availability_settings enable row level security;
alter table public.clinic_availability_blocks enable row level security;
revoke all on public.clinic_availability_settings, public.clinic_availability_blocks from anon, authenticated;
grant select, insert, update on public.clinic_availability_settings to authenticated;
grant select, insert, delete on public.clinic_availability_blocks to authenticated;

create policy availability_settings_member_read on public.clinic_availability_settings
  for select to authenticated using ((select private.has_clinic_access(clinic_id, null)));
create policy availability_settings_admin_write on public.clinic_availability_settings
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));
create policy availability_blocks_member_read on public.clinic_availability_blocks
  for select to authenticated using ((select private.has_clinic_access(clinic_id, null)));
create policy availability_blocks_staff_write on public.clinic_availability_blocks
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));

-- Serialize appointment and block writes within a clinic so a booking cannot race
-- a newly-created block or another appointment for the same provider.
create function private.enforce_clinic_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  provider_overlaps_allowed boolean;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('availability:' || new.clinic_id::text, 0));

  if exists (
    select 1 from public.clinic_availability_blocks as block
     where block.clinic_id = new.clinic_id
       and tstzrange(block.starts_at, block.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
       and (block.scope = 'clinic'
         or (block.scope = 'branch' and block.branch_id = new.branch_id)
         or (block.scope = 'provider' and block.provider_id = new.provider_id))
  ) then
    raise exception using errcode = '23P01', message = 'La cita coincide con un horario bloqueado.';
  end if;

  select coalesce(settings.allow_provider_overlaps, false)
    into provider_overlaps_allowed
    from public.clinic_availability_settings as settings
   where settings.clinic_id = new.clinic_id;

  if not coalesce(provider_overlaps_allowed, false) and exists (
    select 1 from public.appointments as appointment
     where appointment.clinic_id = new.clinic_id
       and appointment.provider_id = new.provider_id
       and appointment.status <> 'cancelled'
       and appointment.id is distinct from new.id
       and tstzrange(appointment.starts_at, appointment.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'El profesional ya tiene una cita en ese horario.';
  end if;

  return new;
end;
$$;

create function private.protect_clinic_availability_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('availability:' || new.clinic_id::text, 0));
  if not new.allow_provider_overlaps and exists (
    select 1 from public.appointments as first_appointment
    join public.appointments as second_appointment
      on second_appointment.clinic_id = first_appointment.clinic_id
     and second_appointment.provider_id = first_appointment.provider_id
     and second_appointment.id > first_appointment.id
     and tstzrange(second_appointment.starts_at, second_appointment.ends_at, '[)')
         && tstzrange(first_appointment.starts_at, first_appointment.ends_at, '[)')
   where first_appointment.clinic_id = new.clinic_id
     and first_appointment.status <> 'cancelled'
     and second_appointment.status <> 'cancelled'
  ) then
    raise exception using errcode = '23P01', message = 'No puedes desactivar las citas simultáneas mientras existan citas del mismo profesional que se traslapen.';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create function private.protect_clinic_availability_block()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.clinic_id <> new.clinic_id then
    raise exception using errcode = '23514', message = 'No se puede cambiar la clínica de un horario bloqueado.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('availability:' || new.clinic_id::text, 0));
  if exists (
    select 1 from public.appointments as appointment
     where appointment.clinic_id = new.clinic_id
       and appointment.status <> 'cancelled'
       and tstzrange(appointment.starts_at, appointment.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
       and (new.scope = 'clinic'
         or (new.scope = 'branch' and appointment.branch_id = new.branch_id)
         or (new.scope = 'provider' and appointment.provider_id = new.provider_id))
  ) then
    raise exception using errcode = '23P01', message = 'No se puede bloquear un horario que ya tiene citas.';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_enforce_clinic_availability on public.appointments;
drop trigger if exists clinic_availability_settings_protect on public.clinic_availability_settings;
drop trigger if exists clinic_availability_blocks_protect on public.clinic_availability_blocks;
alter table public.appointments drop constraint if exists appointments_provider_no_overlap;

create trigger appointments_enforce_clinic_availability
  before insert or update of clinic_id, provider_id, branch_id, starts_at, ends_at, status
  on public.appointments for each row execute function private.enforce_clinic_availability();
create trigger clinic_availability_settings_protect
  before insert or update on public.clinic_availability_settings
  for each row execute function private.protect_clinic_availability_settings();
create trigger clinic_availability_blocks_protect
  before insert or update on public.clinic_availability_blocks
  for each row execute function private.protect_clinic_availability_block();
-- <<< END 20261030072515_clinic_availability.sql
-- >>> BEGIN 20261030072602_clinic_availability_policy_tuneup.sql
-- Keep read policies single-purpose and index all availability block foreign keys.

drop policy availability_settings_admin_write on public.clinic_availability_settings;
create policy availability_settings_admin_insert on public.clinic_availability_settings
  for insert to authenticated with check ((select private.has_clinic_access(clinic_id, array['admin'])));
create policy availability_settings_admin_update on public.clinic_availability_settings
  for update to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));

drop policy availability_blocks_staff_write on public.clinic_availability_blocks;
create policy availability_blocks_staff_insert on public.clinic_availability_blocks
  for insert to authenticated
  with check ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy availability_blocks_staff_delete on public.clinic_availability_blocks
  for delete to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));

create index clinic_availability_blocks_branch_fk_idx
  on public.clinic_availability_blocks (branch_id, clinic_id) where branch_id is not null;
create index clinic_availability_blocks_provider_fk_idx
  on public.clinic_availability_blocks (provider_id, clinic_id) where provider_id is not null;
create index clinic_availability_blocks_created_by_fk_idx
  on public.clinic_availability_blocks (created_by) where created_by is not null;
-- <<< END 20261030072602_clinic_availability_policy_tuneup.sql
