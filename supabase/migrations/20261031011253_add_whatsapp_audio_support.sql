alter table public.clinic_whatsapp_messages
  drop constraint clinic_whatsapp_messages_media_type_check,
  add constraint clinic_whatsapp_messages_media_type_check
    check (
      media_content_type is null
      or media_content_type = any (array[
        'image/jpeg', 'image/png', 'image/webp', 'video/mp4',
        'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/3gpp'
      ])
    );

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4',
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/3gpp'
]
where id = 'clinic-whatsapp-media';
