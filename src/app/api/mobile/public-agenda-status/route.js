import { createServiceClient } from '@/lib/supabase/service-client';
import { agendaSecret } from '@/lib/public-agenda-security';
import { hasClinicPermission } from '@/lib/clinic-permissions.js';

export const runtime = 'nodejs';

function allowedOrigin(origin) {
  const configured = (process.env.MOBILE_APP_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
  if (!origin) return false;
  if (configured.includes(origin)) return true;
  if (process.env.NODE_ENV === 'production') return false;
  try { const parsed = new URL(origin); return ['http:', 'https:'].includes(parsed.protocol) && ['localhost', '127.0.0.1'].includes(parsed.hostname); }
  catch { return false; }
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  } });
}

export async function GET(request) {
  const clinicId = new URL(request.url).searchParams.get('clinicId') || '';
  if (!/^[\da-f-]{36}$/i.test(clinicId)) return json(request, { error: 'Selecciona una clínica válida.' }, 400);
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json(request, { error: 'Inicia sesión para consultar la agenda pública.' }, 401);
  const service = createServiceClient();
  if (!service) return json(request, { error: 'El estado de la agenda pública no está disponible.' }, 503);
  const { data: auth, error: authError } = await service.auth.getUser(token);
  if (authError || !auth?.user) return json(request, { error: 'Tu sesión venció. Inicia sesión de nuevo.' }, 401);
  const { data: membership, error: membershipError } = await service.from('clinic_memberships')
    .select('role, permissions').eq('clinic_id', clinicId).eq('user_id', auth.user.id).maybeSingle();
  if (membershipError || !membership || !hasClinicPermission(membership.role, membership.permissions, 'public_agenda.view')) {
    return json(request, { error: 'No tienes permiso para consultar la agenda pública.' }, 403);
  }
  const secretConfigured = agendaSecret().length >= 32;
  const databaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  return json(request, { configured: secretConfigured && databaseConfigured, secretConfigured, databaseConfigured });
}
