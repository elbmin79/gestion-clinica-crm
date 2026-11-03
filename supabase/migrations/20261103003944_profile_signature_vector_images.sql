update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/svg+xml'
]
where id = 'profile-signatures';

drop policy if exists profile_signatures_upload_own on storage.objects;

create policy profile_signatures_upload_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-signatures'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'svg')
);
