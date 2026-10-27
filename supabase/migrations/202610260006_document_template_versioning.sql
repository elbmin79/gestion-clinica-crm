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
