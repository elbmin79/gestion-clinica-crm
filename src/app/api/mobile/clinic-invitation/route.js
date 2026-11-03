import { createServiceClient } from '@/lib/supabase/service-client';
import { invitationIdPattern } from '@/lib/clinic-invitations.js';

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
  if (allowedOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return Response.json(body, { status, headers });
}

export async function OPTIONS(request) {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  } });
}

async function recipientContext(request, id) {
  if (!invitationIdPattern.test(id || '')) return { error: 'La invitación no es válida.', status: 400 };
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { error: 'Inicia sesión desde el enlace de invitación.', status: 401 };
  const serviceClient = createServiceClient();
  if (!serviceClient) return { error: 'Falta configurar el acceso seguro del servidor.', status: 503 };
  const { data: auth, error: authError } = await serviceClient.auth.getUser(token);
  const user = auth?.user;
  if (authError || !user) return { error: 'Tu sesión venció. Abre de nuevo el enlace de invitación.', status: 401 };
  if (!user.email_confirmed_at || !user.email) return { error: 'Confirma tu correo desde el enlace de invitación antes de continuar.', status: 403 };
  const { data: invitation, error } = await serviceClient.from('clinic_invitations')
    .select('id,clinic_id,email,role,status,requires_password,expires_at,delivery_status,accepted_by')
    .eq('id', id).eq('email', user.email.toLowerCase()).maybeSingle();
  if (error) return { error: 'No se pudo verificar la invitación. Inténtalo de nuevo.', status: 503 };
  if (!invitation) return { error: 'Esta invitación pertenece a otra cuenta o ya no está disponible.', status: 404 };
  if (invitation.status === 'accepted' && invitation.accepted_by === user.id) return { serviceClient, user, invitation, accepted: true };
  if (invitation.status !== 'pending' || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.delivery_status === 'failed') {
    return { error: 'La invitación venció o fue revocada. Pide a la persona administradora que la reenvíe.', status: 410 };
  }
  return { serviceClient, user, invitation };
}

function invitationPayload(invitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    requiresPassword: invitation.requires_password,
    expiresAt: invitation.expires_at,
  };
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  const context = await recipientContext(request, id);
  if (context.error) return json(request, { error: context.error }, context.status);
  if (context.accepted) return json(request, { accepted: true, clinicId: context.invitation.clinic_id });
  return json(request, { invitation: invitationPayload(context.invitation) });
}

export async function POST(request) {
  let payload;
  try { payload = await request.json(); } catch { return json(request, { error: 'Solicitud inválida.' }, 400); }
  const id = String(payload?.id || '');
  const context = await recipientContext(request, id);
  if (context.error) return json(request, { error: context.error }, context.status);
  if (context.accepted) return json(request, { ok: true, clinicId: context.invitation.clinic_id });
  const { serviceClient, user, invitation } = context;
  if (invitation.requires_password) {
    const { error: passwordError } = await serviceClient.from('clinic_invitations')
      .update({ password_set_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'pending').eq('email', user.email.toLowerCase());
    if (passwordError) return json(request, { error: 'No se pudo completar la contraseña. Inténtalo de nuevo.' }, 503);
  }
  const { data: clinicId, error } = await serviceClient.rpc('accept_clinic_invitation', { p_invitation: id, p_user: user.id });
  if (error || !clinicId) return json(request, { error: 'No se pudo activar el acceso. La invitación pudo vencer o ser revocada. Inténtalo de nuevo o contacta a la persona administradora.' }, 409);
  return json(request, { ok: true, clinicId });
}
