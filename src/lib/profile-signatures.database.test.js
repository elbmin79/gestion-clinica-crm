import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('profile signature bucket accepts generated SVG files under the existing owner-only policy', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role authenticated;
    create schema auth;
    create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function storage.foldername(path text) returns text[] language sql immutable as $$ select array[split_part(path, '/', 1)] $$;
    create function storage.extension(path text) returns text language sql immutable as $$ select lower(split_part(path, '.', -1)) $$;
    create table storage.buckets (id text primary key, allowed_mime_types text[]);
    insert into storage.buckets values ('profile-signatures', array['image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif']);
    create table storage.objects (bucket_id text not null, name text not null, primary key(bucket_id, name));
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
    grant select, update on storage.buckets to authenticated;
  `);
  const migration = await readFile(new URL('../../supabase/migrations/20261103003944_profile_signature_vector_images.sql', import.meta.url), 'utf8');
  await db.exec(migration);

  const allowedTypes = (await db.query("select allowed_mime_types from storage.buckets where id='profile-signatures'")).rows[0].allowed_mime_types;
  assert.ok(allowedTypes.includes('image/svg+xml'));

  await db.exec(`select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false); set role authenticated;`);
  await db.query("insert into storage.objects values ('profile-signatures','20000000-0000-0000-0000-000000000001/drawn.svg')");
  await assert.rejects(db.query("insert into storage.objects values ('profile-signatures','20000000-0000-0000-0000-000000000002/other.svg')"), /row-level security/i);
  await assert.rejects(db.query("insert into storage.objects values ('profile-signatures','20000000-0000-0000-0000-000000000001/other.txt')"), /row-level security/i);
});
