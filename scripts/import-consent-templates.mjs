import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { consentTitleFromFilename, htmlConsentToTemplate } from '../src/lib/document-placeholders.js';

const root = process.cwd();
const envFile = await readFile(path.join(root, '.env.local'), 'utf8');
const env = Object.fromEntries(envFile.split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const clinics = await client.from('clinics').select('id, name').order('created_at');
if (clinics.error) throw clinics.error;
const clinic = (clinics.data || []).find(item => /elixir/i.test(item.name)) || clinics.data?.[0];
if (!clinic) throw new Error('No hay una clínica en este proyecto.');

const folder = path.join(root, 'consentimientos');
const files = (await readdir(folder)).filter(name => name.toLowerCase().endsWith('.html')).sort();
let inserted = 0;
let skipped = 0;
for (const filename of files) {
  const title = consentTitleFromFilename(filename);
  const kind = /^contrato/i.test(title) ? 'contract' : 'consent';
  const existing = await client.from('document_templates').select('id').eq('clinic_id', clinic.id).eq('kind', kind).ilike('title', title).eq('active', true).limit(1);
  if (existing.error) throw existing.error;
  if (existing.data?.length) { skipped += 1; continue; }
  const html = await readFile(path.join(folder, filename), 'utf8');
  const content = htmlConsentToTemplate(html);
  if (!content || /\bbersha\b/i.test(content)) throw new Error(`Quedó un dato de ejemplo en ${filename}`);
  const saved = await client.from('document_templates').insert({
    clinic_id: clinic.id,
    kind,
    title,
    category: kind === 'contract' ? 'Prestación de servicios' : 'Consentimiento informado',
    version: 1,
    content,
    active: true,
  }).select('id').single();
  if (saved.error) throw saved.error;
  inserted += 1;
}
console.log(`Clínica: ${clinic.name}. Formatos nuevos: ${inserted}. Ya existían: ${skipped}.`);
