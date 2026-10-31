-- Allow a single WhatsApp sender to serve multiple clinic branches.
create table public.clinic_whatsapp_sender_branches (
  clinic_id uuid not null,
  sender_key text not null,
  branch_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (clinic_id, sender_key, branch_id),
  constraint clinic_whatsapp_sender_branches_clinic_branch_unique unique (clinic_id, branch_id),
  foreign key (clinic_id, sender_key)
    references public.clinic_whatsapp_senders (clinic_id, sender_key) on delete cascade,
  foreign key (branch_id, clinic_id)
    references public.branches (id, clinic_id) on delete cascade
);

create index clinic_whatsapp_sender_branches_branch_idx
  on public.clinic_whatsapp_sender_branches (clinic_id, branch_id, sender_key);

alter table public.clinic_whatsapp_sender_branches enable row level security;
revoke all on public.clinic_whatsapp_sender_branches from anon, authenticated;
grant select on public.clinic_whatsapp_sender_branches to authenticated;
create policy clinic_whatsapp_sender_branches_member_read
  on public.clinic_whatsapp_sender_branches
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id)));

insert into public.clinic_whatsapp_sender_branches (clinic_id, sender_key, branch_id)
select clinic_id, sender_key, branch_id
  from public.clinic_whatsapp_senders
 where branch_id is not null
on conflict do nothing;

create or replace function public.save_clinic_whatsapp_settings_v2(
  target_clinic_id uuid,
  target_provider_mode text,
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
  branch_list jsonb;
  requested_branches uuid[];
  requested_branch uuid;
  branch_count integer;
  is_default_sender boolean;
  active_sender boolean;
  sender_count integer := 0;
  default_count integer := 0;
begin
  if not private.has_clinic_access(target_clinic_id, array['admin']) then
    raise exception 'Only clinic administrators can update WhatsApp settings.' using errcode = '42501';
  end if;
  if target_provider_mode not in ('mock', 'twilio') then
    raise exception 'Unsupported WhatsApp provider mode.' using errcode = '22023';
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
    raise exception 'Invalid WhatsApp template readiness.' using errcode = '22023';
  end if;

  insert into public.clinic_whatsapp_configurations (
    clinic_id, provider_mode, allow_default_fallback, template_readiness, updated_at
  ) values (
    target_clinic_id, target_provider_mode, coalesce(target_allow_default_fallback, false), target_template_readiness, now()
  ) on conflict (clinic_id) do update
    set provider_mode = excluded.provider_mode,
        allow_default_fallback = excluded.allow_default_fallback,
        template_readiness = excluded.template_readiness,
        updated_at = now();

  update public.clinic_whatsapp_senders
     set active = false, is_default = false, branch_id = null, updated_at = now()
   where clinic_id = target_clinic_id;
  delete from public.clinic_whatsapp_sender_branches where clinic_id = target_clinic_id;

  for sender in select value from jsonb_array_elements(target_senders)
  loop
    sender_count := sender_count + 1;
    if jsonb_typeof(sender) <> 'object' then
      raise exception 'Invalid WhatsApp sender.' using errcode = '22023';
    end if;
    sender_key_value := trim(coalesce(sender->>'sender_key', ''));
    display_label_value := trim(coalesce(sender->>'display_label', ''));
    branch_list := sender->'branch_ids';
    if branch_list is null then
      requested_branch := nullif(sender->>'branch_id', '')::uuid;
      branch_list := case when requested_branch is null then '[]'::jsonb else jsonb_build_array(requested_branch::text) end;
    end if;
    if jsonb_typeof(branch_list) <> 'array' or jsonb_array_length(branch_list) > 100 then
      raise exception 'Invalid WhatsApp sender branch list.' using errcode = '22023';
    end if;
    select coalesce(array_agg(item.value::uuid order by item.ordinality), array[]::uuid[])
      into requested_branches
      from jsonb_array_elements_text(branch_list) with ordinality as item(value, ordinality);
    select count(distinct assigned.branch_id)::integer
      into branch_count
      from unnest(requested_branches) as assigned(branch_id);
    if cardinality(requested_branches) = 0 or branch_count <> cardinality(requested_branches) then
      raise exception 'Select at least one distinct branch for each WhatsApp sender.' using errcode = '22023';
    end if;
    if exists (
      select 1
        from unnest(requested_branches) as assigned(branch_id)
        left join public.branches branch
          on branch.id = assigned.branch_id
         and branch.clinic_id = target_clinic_id
         and branch.active
       where branch.id is null
    ) then
      raise exception 'WhatsApp sender branches must be active branches in this clinic.' using errcode = '22023';
    end if;

    requested_branch := requested_branches[1];
    is_default_sender := coalesce((sender->>'is_default')::boolean, false);
    active_sender := coalesce((sender->>'active')::boolean, true);
    if (target_provider_mode = 'mock' and sender_key_value !~ '^mock:[a-z0-9]+(-[a-z0-9]+)*$')
      or (target_provider_mode = 'twilio' and sender_key_value !~ '^twilio:\+[1-9][0-9]{7,14}$')
      or length(display_label_value) not between 1 and 120 then
      raise exception 'Sender does not match the selected WhatsApp provider.' using errcode = '22023';
    end if;
    if coalesce(sender->>'meta_phone_number_id', '') <> '' then
      raise exception 'Meta sender IDs are not supported by this provider.' using errcode = '22023';
    end if;
    if is_default_sender then default_count := default_count + 1; end if;
    insert into public.clinic_whatsapp_senders (
      clinic_id, branch_id, sender_key, display_label, is_default, active
    ) values (
      target_clinic_id, case when active_sender then requested_branch else null end,
      sender_key_value, display_label_value, is_default_sender, active_sender
    ) on conflict (clinic_id, sender_key) do update
      set branch_id = excluded.branch_id,
          display_label = excluded.display_label,
          is_default = excluded.is_default,
          active = excluded.active,
          updated_at = now();

    if active_sender then
      if exists (
        select 1 from public.clinic_whatsapp_sender_branches existing
         where existing.clinic_id = target_clinic_id
           and existing.branch_id = any(requested_branches)
           and existing.sender_key <> sender_key_value
      ) then
        raise exception 'Each branch can be assigned to only one active WhatsApp sender.' using errcode = '23505';
      end if;
      insert into public.clinic_whatsapp_sender_branches (clinic_id, sender_key, branch_id)
      select target_clinic_id, sender_key_value, assigned.branch_id
        from unnest(requested_branches) as assigned(branch_id);
    end if;
  end loop;

  if default_count > 1 or (target_allow_default_fallback and default_count <> 1) then
    raise exception 'Default fallback requires exactly one default WhatsApp sender.' using errcode = '22023';
  end if;
  if target_allow_default_fallback and not exists (
    select 1 from public.clinic_whatsapp_senders where clinic_id = target_clinic_id and is_default and active
  ) then
    raise exception 'The default WhatsApp sender must be active.' using errcode = '22023';
  end if;
  return true;
end;
$$;

revoke all on function public.save_clinic_whatsapp_settings_v2(uuid, text, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.save_clinic_whatsapp_settings_v2(uuid, text, boolean, jsonb, jsonb) to authenticated;
