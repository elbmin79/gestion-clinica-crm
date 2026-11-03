import { createServiceClient } from '@/lib/supabase/service-client';
import { deliverClinicInvitation } from '@/lib/clinic-invitation-delivery.js';
import { invitationIdPattern } from '@/lib/clinic-invitations.js';
import { hiddenDirectoryUserIds, isHiddenDirectoryAccount } from '@/lib/account-visibility';
import { CLINIC_PERMISSION_KEYS, CLINIC_ROLES, sanitizeClinicPermissions } from '@/lib/clinic-permissions.js';

export const runtime = 'nodejs';

const allowedRoles = new Set(CLINIC_ROLES.map(([role]) => role));

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
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}

async function authorizeAdmin(request, clinicId) {
  if (!invitationIdPattern.test(clinicId || '')) return { error: 'Selecciona una clínica válida.', status: 400 };
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { error: 'Inicia sesión para administrar accesos.', status: 401 };
  const serviceClient = createServiceClient();
  if (!serviceClient) return { error: 'Falta configurar el acceso seguro del servidor.', status: 503 };
  const { data: auth, error: authError } = await serviceClient.auth.getUser(token);
  if (authError || !auth?.user) return { error: 'Tu sesión venció. Inicia sesión de nuevo.', status: 401 };
  const { data: membership, error: membershipError } = await serviceClient.from('clinic_memberships')
    .select('role').eq('clinic_id', clinicId).eq('user_id', auth.user.id).maybeSingle();
  if (membershipError || membership?.role !== 'admin') return { error: 'Solo una persona administradora puede administrar accesos.', status: 403 };
  return { serviceClient, user: auth.user };
}

function displayName(metadata = {}) {
  return [metadata.names, metadata.firstLastName, metadata.secondLastName].filter(Boolean).join(' ')
    || metadata.full_name || metadata.name || '';
}

function avatarUrl(serviceClient, user) {
  const path = user?.user_metadata?.avatar_path;
  return typeof path === 'string' && path.startsWith(`${user.id}/`)
    ? serviceClient.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl
    : '';
}

async function listAuthUsers(serviceClient) {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { error };
    const pageUsers = data?.users || [];
    users.push(...pageUsers);
    if (pageUsers.length < 1000) break;
  }
  return { users };
}

export async function GET(request) {
  const clinicId = new URL(request.url).searchParams.get('clinicId') || '';
  const context = await authorizeAdmin(request, clinicId);
  if (context.error) return json(request, { error: context.error }, context.status);
  const { serviceClient } = context;
  const [memberResult, invitationResult, userResult] = await Promise.all([
    serviceClient.from('clinic_memberships').select('user_id, role, permissions, created_at').eq('clinic_id', clinicId).order('created_at', { ascending: true }),
    serviceClient.from('clinic_invitations').select('id,email,role,permissions,status,delivery_status,expires_at,last_sent_at').eq('clinic_id', clinicId).eq('status', 'pending').order('created_at', { ascending: false }),
    listAuthUsers(serviceClient),
  ]);
  if (memberResult.error || invitationResult.error || userResult.error) return json(request, { error: 'No se pudieron cargar las cuentas de la clínica.' }, 503);

  const members = await Promise.all((memberResult.data || []).map(async member => {
    const { data } = await serviceClient.auth.admin.getUserById(member.user_id);
    const user = data?.user;
    if (isHiddenDirectoryAccount({ id: member.user_id, email: user?.email })) return null;
    return {
      userId: member.user_id, name: displayName(user?.user_metadata), email: user?.email || '',
      avatarUrl: avatarUrl(serviceClient, user), role: member.role, permissions: member.permissions || {},
    };
  }));
  const assignedIds = new Set((memberResult.data || []).map(member => member.user_id));
  const pendingEmails = new Set((invitationResult.data || []).map(invitation => invitation.email.toLowerCase()));
  const accounts = userResult.users
    .filter(user => user.email && !assignedIds.has(user.id) && !pendingEmails.has(user.email.toLowerCase()) && !isHiddenDirectoryAccount(user))
    .map(user => ({ userId: user.id, name: displayName(user.user_metadata), email: user.email, avatarUrl: avatarUrl(serviceClient, user), confirmed: Boolean(user.email_confirmed_at) }))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'es'));

  return json(request, { members: members.filter(Boolean), accounts, currentUserId: context.user.id, invitations: invitationResult.data || [] });
}

function validPermissions(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => CLINIC_PERMISSION_KEYS.includes(key))
    && Object.entries(value).every(([key, item]) => key === 'availability.scope'
      ? ['self', 'branch', 'clinic'].includes(item)
      : typeof item === 'boolean');
}

export async function POST(request) {
  let payload;
  try { payload = await request.json(); } catch { return json(request, { ok: false, message: 'Solicitud inválida.' }, 400); }
  const clinicId = String(payload?.clinicId || '');
  const context = await authorizeAdmin(request, clinicId);
  if (context.error) return json(request, { ok: false, message: context.error }, context.status);
  const { serviceClient, user } = context;
  const action = String(payload?.action || '');

  if (action === 'invite') {
    const origin = process.env.APP_URL?.trim() || (process.env.NODE_ENV !== 'production' ? new URL(request.url).origin : '');
    if (!origin) return json(request, { ok: false, message: 'Configura APP_URL para enviar invitaciones desde la app.' }, 503);
    try {
      const result = await deliverClinicInvitation({ input: payload, context: { serviceClient, user }, origin, native: payload?.client === 'mobile' });
      return json(request, result, result.ok ? 200 : 400);
    } catch { return json(request, { ok: false, message: 'No se pudo enviar la invitación. Revisa la dirección del CRM e inténtalo de nuevo.' }, 400); }
  }

  if (action === 'revoke-invitation') {
    const invitationId = String(payload?.invitationId || '');
    if (!invitationIdPattern.test(invitationId)) return json(request, { ok: false, message: 'Selecciona una invitación válida.' }, 400);
    const { data, error } = await serviceClient.from('clinic_invitations').update({ status: 'revoked' })
      .eq('id', invitationId).eq('clinic_id', clinicId).eq('status', 'pending').select('id');
    return error || !data?.length
      ? json(request, { ok: false, message: 'No se pudo revocar; actualiza la lista y revisa si ya fue aceptada.' }, 409)
      : json(request, { ok: true, message: 'Invitación revocada. El enlace ya no otorga acceso a la clínica.' });
  }

  const targetUserId = String(payload?.userId || '');
  if (!invitationIdPattern.test(targetUserId) || isHiddenDirectoryAccount({ id: targetUserId })) return json(request, { ok: false, message: 'Selecciona una cuenta válida.' }, 400);

  if (action === 'assign') {
    const role = String(payload?.role || '');
    if (!allowedRoles.has(role) || !validPermissions(payload?.permissions)) return json(request, { ok: false, message: 'Revisa el rol y los permisos seleccionados.' }, 400);
    const { data: target, error: targetError } = await serviceClient.auth.admin.getUserById(targetUserId);
    if (targetError || !target?.user?.email || isHiddenDirectoryAccount(target.user)) return json(request, { ok: false, message: 'No se encontró la cuenta seleccionada.' }, 404);
    if (!target.user.email_confirmed_at) return json(request, { ok: false, message: 'Esa cuenta debe confirmar su correo antes de recibir acceso a la clínica.' }, 409);
    const { data: pendingInvite, error: inviteError } = await serviceClient.from('clinic_invitations').select('id')
      .eq('clinic_id', clinicId).eq('email', target.user.email.toLowerCase()).eq('status', 'pending').maybeSingle();
    if (inviteError) return json(request, { ok: false, message: 'No se pudo verificar la invitación de esa cuenta.' }, 503);
    if (pendingInvite) return json(request, { ok: false, message: 'Esa persona debe aceptar su invitación para activar el acceso.' }, 409);
    const { error } = await serviceClient.from('clinic_memberships').insert({ clinic_id: clinicId, user_id: targetUserId, role, permissions: sanitizeClinicPermissions(payload.permissions, role) });
    if (error?.code === '23505') return json(request, { ok: false, message: 'Esa cuenta ya tiene acceso a esta clínica.' }, 409);
    if (error) return json(request, { ok: false, message: 'No se pudo asignar acceso a la clínica.' }, 503);
    return json(request, { ok: true, message: 'Acceso asignado. La persona debe actualizar o volver a abrir el CRM para cargar su clínica.' });
  }

  if (action === 'update-member') {
    const role = String(payload?.role || '');
    if (!allowedRoles.has(role) || !validPermissions(payload?.permissions)) return json(request, { ok: false, message: 'Revisa el rol y los permisos seleccionados.' }, 400);
    const { data: member, error: memberError } = await serviceClient.from('clinic_memberships').select('role, permissions')
      .eq('clinic_id', clinicId).eq('user_id', targetUserId).maybeSingle();
    if (memberError || !member) return json(request, { ok: false, message: 'No se encontró el acceso de esa cuenta.' }, 404);
    if (member.role === 'admin') return json(request, { ok: false, message: 'Los permisos de una cuenta administradora no se pueden modificar.' }, 403);
    const permissions = sanitizeClinicPermissions(payload.permissions, role);
    const { error } = await serviceClient.from('clinic_memberships').update({ role, permissions }).eq('clinic_id', clinicId).eq('user_id', targetUserId);
    if (error?.code === '23514') return json(request, { ok: false, message: 'La clínica debe conservar al menos una persona administradora.' }, 409);
    if (error) return json(request, { ok: false, message: 'No se pudieron guardar los permisos.' }, 503);
    return json(request, { ok: true, message: 'El rol y los permisos se actualizaron.' });
  }

  if (action === 'revoke-member') {
    const { data: member, error: memberError } = await serviceClient.from('clinic_memberships').select('role')
      .eq('clinic_id', clinicId).eq('user_id', targetUserId).maybeSingle();
    if (memberError || !member) return json(request, { ok: false, message: 'No se encontró el acceso de esa cuenta.' }, 404);
    if (member.role === 'admin') return json(request, { ok: false, message: 'No se puede revocar el acceso de otra cuenta administradora.' }, 403);
    const { error } = await serviceClient.from('clinic_memberships').delete().eq('clinic_id', clinicId).eq('user_id', targetUserId);
    if (error?.code === '23514') return json(request, { ok: false, message: 'La clínica debe conservar al menos una persona administradora.' }, 409);
    if (error) return json(request, { ok: false, message: 'No se pudo revocar el acceso a la clínica.' }, 503);
    return json(request, { ok: true, message: 'El acceso a la clínica fue revocado.' });
  }

  return json(request, { ok: false, message: 'Acción de acceso desconocida.' }, 400);
}
