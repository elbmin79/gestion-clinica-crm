-- Invitations never grant clinic access until the authenticated recipient accepts.
create table public.clinic_invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) <= 254),
  role text not null check (role in ('admin','clinician','receptionist','billing')),
  permissions jsonb not null check (jsonb_typeof(permissions) = 'object'),
  invited_by uuid not null references auth.users(id),
  requires_password boolean not null default true,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  delivery_status text not null default 'sending' check (delivery_status in ('sending','sent','failed')),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);
create unique index clinic_invitations_pending_email on public.clinic_invitations(clinic_id,email) where status = 'pending';
create index clinic_invitations_recipient on public.clinic_invitations(email) where status = 'pending';
alter table public.clinic_invitations enable row level security;
revoke all on public.clinic_invitations from anon, authenticated;
grant select on public.clinic_invitations to authenticated;
grant all on public.clinic_invitations to service_role;
create policy clinic_invitations_admin_read on public.clinic_invitations for select to authenticated
  using ((select private.has_clinic_access(clinic_id,array['admin'])));
create policy clinic_invitations_recipient_read on public.clinic_invitations for select to authenticated
  using (email = lower((select auth.jwt()->>'email')));

-- Service-only entry points: callers must verify the current user using getUser().
-- Recheck the inviter's membership here, not in user-editable account metadata.
create function public.prepare_clinic_invitation(p_clinic uuid,p_inviter uuid,p_email text,p_role text,p_permissions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.clinic_invitations; recipient auth.users; normalized_email text := lower(btrim(p_email));
begin
  if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic and user_id=p_inviter and role='admin') then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinic::text || normalized_email,0));
  select * into recipient from auth.users where lower(email)=normalized_email and deleted_at is null limit 1;
  if exists(select 1 from public.clinic_memberships where clinic_id=p_clinic and user_id=recipient.id) then raise exception 'already_member'; end if;
  select * into invitation from public.clinic_invitations where clinic_id=p_clinic and email=normalized_email and status='pending' for update;
  if found and invitation.last_sent_at > now()-interval '60 seconds' then raise exception 'invite_rate_limited'; end if;
  if invitation.id is null then
    insert into public.clinic_invitations(clinic_id,email,role,permissions,invited_by,requires_password)
    values(p_clinic,normalized_email,p_role,p_permissions,p_inviter,coalesce(recipient.encrypted_password,'')='') returning * into invitation;
  else
    update public.clinic_invitations set role=p_role,permissions=p_permissions,invited_by=p_inviter,
      requires_password=coalesce(recipient.encrypted_password,'')='',delivery_status='sending',last_sent_at=now(),expires_at=now()+interval '7 days'
    where id=invitation.id returning * into invitation;
  end if;
  return jsonb_build_object('id',invitation.id,'email',normalized_email,'requires_password',invitation.requires_password,
    'user_exists',recipient.id is not null,'email_confirmed',recipient.email_confirmed_at is not null);
end $$;
revoke all on function public.prepare_clinic_invitation(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_clinic_invitation(uuid,uuid,text,text,jsonb) to service_role;

create function public.accept_clinic_invitation(p_invitation uuid,p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.clinic_invitations; recipient auth.users;
begin
  select * into invitation from public.clinic_invitations where id=p_invitation for update;
  select * into recipient from auth.users where id=p_user and deleted_at is null;
  if invitation.id is null or recipient.id is null or lower(recipient.email) <> invitation.email or recipient.email_confirmed_at is null then
    raise exception 'invitation_not_found' using errcode='42501';
  end if;
  if invitation.status='accepted' and invitation.accepted_by=p_user then return invitation.clinic_id; end if;
  if invitation.status<>'pending' or invitation.expires_at<=now() or invitation.delivery_status='failed' then raise exception 'invitation_unavailable'; end if;
  if invitation.requires_password and coalesce(recipient.encrypted_password,'')='' then raise exception 'password_required'; end if;
  -- Lock the inviter's membership so revocation cannot race activation.
  perform 1 from public.clinic_memberships where clinic_id=invitation.clinic_id and user_id=invitation.invited_by and role='admin' for share;
  if not found then raise exception 'inviter_no_longer_admin'; end if;
  insert into public.clinic_memberships(clinic_id,user_id,role,permissions)
    values(invitation.clinic_id,p_user,invitation.role,invitation.permissions) on conflict(clinic_id,user_id) do nothing;
  update public.clinic_invitations set status='accepted',accepted_at=now(),accepted_by=p_user where id=p_invitation;
  return invitation.clinic_id;
end $$;
revoke all on function public.accept_clinic_invitation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.accept_clinic_invitation(uuid,uuid) to service_role;
