alter table public.clinic_whatsapp_messages
  add column media_object_path text,
  add column media_content_type text,
  add column media_filename text,
  add column media_size_bytes bigint;

alter table public.clinic_whatsapp_messages
  drop constraint clinic_whatsapp_messages_body_check,
  add constraint clinic_whatsapp_messages_body_content_check
    check ((length(body) between 1 and 4096) or (media_object_path is not null and body = '')),
  add constraint clinic_whatsapp_messages_media_type_check
    check (media_content_type is null or media_content_type = any (array['image/jpeg','image/png','image/webp','video/mp4'])),
  add constraint clinic_whatsapp_messages_media_metadata_check
    check (
      (media_object_path is null and media_content_type is null and media_filename is null and media_size_bytes is null)
      or (media_object_path is not null and media_content_type is not null and media_filename is not null and media_size_bytes between 1 and 20971520)
    );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinic-whatsapp-media',
  'clinic-whatsapp-media',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','video/mp4']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
