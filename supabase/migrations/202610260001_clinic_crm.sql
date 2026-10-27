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

