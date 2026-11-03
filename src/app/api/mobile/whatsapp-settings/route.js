import { createServiceClient } from '@/lib/supabase/service-client';
import { createWhatsAppSettingsActions } from '@/lib/whatsapp/settings-actions-core.js';
import { hasClinicPermission } from '@/lib/clinic-permissions.js';

export const runtime = 'nodejs';

function allowedOrigin(origin) {
  if (!origin) return false;
  const configured = (process.env.MOBILE_APP_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
  if (configured.includes(origin)) return true;
  return process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function json(request, body, status = 200) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const origin = request.headers.get('origin');
  if (allowedOrigin(origin)) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin'); }
  return Response.json(body, { status, headers });
}

export async function OPTIONS(request) {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600', Vary: 'Origin',
  } });
}

async function contextFor(request, clinicId, permission) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId || '')) return { error: 'Selecciona una clínica válida.', status: 400 };
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { error: 'Inicia sesión para administrar WhatsApp.', status: 401 };
  const service = createServiceClient();
  if (!service) return { error: 'El servicio de WhatsApp no está disponible.', status: 503 };
  const { data: auth, error: authError } = await service.auth.getUser(token);
  if (authError || !auth?.user) return { error: 'Tu sesión venció. Inicia sesión de nuevo.', status: 401 };
  const { data: membership, error: membershipError } = await service.from('clinic_memberships')
    .select('role,permissions').eq('clinic_id', clinicId).eq('user_id', auth.user.id).maybeSingle();
  if (membershipError || !membership || !hasClinicPermission(membership.role, membership.permissions, permission)) {
    return { error: 'No tienes permiso para administrar WhatsApp.', status: 403 };
  }
  // The shared settings action rechecks membership and permission before every read/write.
  const client = new Proxy(service, { get(target, key) {
    if (key === 'auth') return { getUser: async () => ({ data: { user: auth.user }, error: null }) };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return { client, membership };
}

function actionsFor(client) {
  return createWhatsAppSettingsActions({ createServerClient: async () => client });
}

export async function GET(request) {
  const url = new URL(request.url);
  const clinicId = url.searchParams.get('clinicId') || '';
  const context = await contextFor(request, clinicId, 'whatsapp.view');
  if (context.error) return json(request, { error: context.error }, context.status);
  const actions = actionsFor(context.client);
  const settings = await actions.load(clinicId);
  if (!settings.ok) return json(request, { error: settings.message }, 503);
  const branchResult = await context.client.from('branches').select('id,name').eq('clinic_id', clinicId).eq('active', true).order('name');
  if (branchResult.error) return json(request, { error: 'No se pudieron cargar las sucursales.' }, 503);
  const canManage = hasClinicPermission(context.membership.role, context.membership.permissions, 'whatsapp.manage');
  const available = canManage ? await actions.loadAvailableSenders(clinicId) : { ok: true, senders: [], senderLookupError: '' };
  return json(request, {
    settings,
    branches: branchResult.data || [],
    availableSenders: available.senders || [],
    inboxSender: available.inboxSender || null,
    senderLookupError: available.senderLookupError || (!available.ok ? available.message : ''),
    canManage,
  });
}

export async function POST(request) {
  let payload;
  try { payload = await request.json(); } catch { return json(request, { error: 'Solicitud inválida.' }, 400); }
  const clinicId = String(payload?.clinicId || '');
  const context = await contextFor(request, clinicId, 'whatsapp.manage');
  if (context.error) return json(request, { error: context.error }, context.status);
  const result = await actionsFor(context.client).save(payload);
  return result.ok ? json(request, result) : json(request, { error: result.message }, 400);
}
