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
