'use server';

import { createClient } from '../../lib/supabase/server';
import { createServiceClient } from '../../lib/supabase/service-client';
import { hiddenDirectoryUserIds, isHiddenDirectoryAccount } from '../../lib/account-visibility';
import { CLINIC_PERMISSION_KEYS, sanitizeClinicPermissions } from '../../lib/clinic-permissions.js';

const clinicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedRoles = new Set(['admin', 'clinician', 'receptionist', 'billing']);
const userPageSize = 1000;

function validPermissionPayload(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => CLINIC_PERMISSION_KEYS.includes(key))
    && Object.values(value).every(item => typeof item === 'boolean');
}

async function authorizeClinicAdmin(clinicId) {
  if (typeof clinicId !== 'string' || !clinicIdPattern.test(clinicId)) {
    return { error: 'Selecciona una clínica válida.' };
  }

  const sessionClient = await createClient();
  if (!sessionClient) return { error: 'La conexión de la clínica no está configurada.' };

  const { data: userData, error: userError } = await sessionClient.auth.getUser();
  if (userError || !userData?.user) return { error: 'Inicia sesión de nuevo para administrar accesos.' };

  const { data: membership, error: membershipError } = await sessionClient
    .from('clinic_memberships')
    .select('role')
    .eq('clinic_id', clinicId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (membershipError || membership?.role !== 'admin') {
    return { error: 'Solo una persona administradora puede asignar acceso a la clínica.' };
  }

  const serviceClient = createServiceClient();
  if (!serviceClient) return { error: 'Falta configurar el acceso seguro del servidor.' };

  return { sessionClient, serviceClient, currentUserId: userData.user.id };
}

function displayName(metadata = {}) {
  return [metadata.names, metadata.firstLastName, metadata.secondLastName].filter(Boolean).join(' ')
    || metadata.full_name
    || metadata.name
    || '';
}

function profileAvatarUrl(serviceClient, user) {
  const path = user?.user_metadata?.avatar_path;
  return typeof path === 'string' && path.startsWith(`${user.id}/`)
    ? serviceClient.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl
    : '';
}

async function listAuthUsers(serviceClient) {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: userPageSize });
    if (error) return { error };
    const pageUsers = data?.users || [];
    users.push(...pageUsers);
    if (pageUsers.length < userPageSize) break;
  }
  return { users };
}

export async function loadClinicAccessData(clinicId) {
  try {
    const context = await authorizeClinicAdmin(clinicId);
    if (context.error) return { ok: false, message: context.error };

    const { data: rows, error } = await context.serviceClient
      .from('clinic_memberships')
      .select('user_id, role, permissions, created_at')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: true });

    if (error) return { ok: false, message: 'No se pudo cargar el equipo con acceso a esta clínica.' };

    const assignedIds = new Set((rows || []).map(member => member.user_id));
    const [{ users, error: usersError }, members] = await Promise.all([
      listAuthUsers(context.serviceClient),
      Promise.all((rows || []).map(async row => {
        const { data } = await context.serviceClient.auth.admin.getUserById(row.user_id);
        const user = data?.user;
        if (isHiddenDirectoryAccount({ id: row.user_id, email: user?.email })) return null;
        return {
          userId: row.user_id,
          name: displayName(user?.user_metadata),
          email: user?.email || '',
          avatarUrl: profileAvatarUrl(context.serviceClient, user),
          role: row.role,
          permissions: row.permissions || {},
        };
      })),
    ]);
    if (usersError) return { ok: false, message: 'No se pudieron cargar las cuentas registradas.' };

    const accounts = users
      .filter(user => user.email && !assignedIds.has(user.id) && !isHiddenDirectoryAccount(user))
      .map(user => ({
        userId: user.id,
        name: displayName(user.user_metadata),
        email: user.email,
        avatarUrl: profileAvatarUrl(context.serviceClient, user),
        confirmed: Boolean(user.email_confirmed_at),
      }))
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'es'));

    return { ok: true, members: members.filter(Boolean), accounts, currentUserId: context.currentUserId };
  } catch {
    return { ok: false, message: 'No se pudieron cargar las cuentas de la clínica.' };
  }
}

export async function assignClinicAccess({ clinicId, userId, role, permissions }) {
  try {
    const context = await authorizeClinicAdmin(clinicId);
    if (context.error) return { ok: false, message: context.error };

    if (typeof userId !== 'string' || !clinicIdPattern.test(userId)) {
      return { ok: false, message: 'Selecciona una cuenta registrada.' };
    }
    if (!allowedRoles.has(role)) return { ok: false, message: 'Selecciona un rol válido.' };
    if (!validPermissionPayload(permissions)) return { ok: false, message: 'Revisa los permisos seleccionados.' };

    const { data, error: targetError } = await context.serviceClient.auth.admin.getUserById(userId);
    if (targetError) return { ok: false, message: 'No se pudo verificar la cuenta seleccionada.' };
    const targetUser = data?.user;
    if (!targetUser?.email) return { ok: false, message: 'No se encontró la cuenta seleccionada.' };
    if (isHiddenDirectoryAccount(targetUser)) return { ok: false, message: 'No se encontró la cuenta seleccionada.' };
    if (!targetUser.email_confirmed_at) {
      return { ok: false, message: 'Esa cuenta debe confirmar su correo antes de recibir acceso a la clínica.' };
    }

    const { error: insertError } = await context.sessionClient
      .from('clinic_memberships')
      .insert({ clinic_id: clinicId, user_id: targetUser.id, role, permissions: sanitizeClinicPermissions(permissions, role) });

    if (insertError?.code === '23505') {
      return { ok: false, message: 'Esa cuenta ya tiene acceso a esta clínica.' };
    }
    if (insertError) {
      return { ok: false, message: 'No se pudo asignar acceso a la clínica.' };
    }

    return { ok: true, message: 'Acceso asignado. La persona debe actualizar o volver a abrir el CRM para cargar su clínica.' };
  } catch {
    return { ok: false, message: 'No se pudo asignar acceso a la clínica.' };
  }
}

async function clinicAdminCount(context, clinicId) {
  const { count, error } = await context.serviceClient
    .from('clinic_memberships')
    .select('user_id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .not('user_id', 'in', `(${hiddenDirectoryUserIds.join(',')})`)
    .eq('role', 'admin');
  return { count: count || 0, error };
}

export async function updateClinicAccessRole({ clinicId, userId, role, permissions }) {
  try {
    const context = await authorizeClinicAdmin(clinicId);
    if (context.error) return { ok: false, message: context.error };
    if (typeof userId !== 'string' || !clinicIdPattern.test(userId)) return { ok: false, message: 'Selecciona una cuenta válida.' };
    if (isHiddenDirectoryAccount({ id: userId })) return { ok: false, message: 'No se encontró el acceso de esa cuenta.' };
    if (!allowedRoles.has(role)) return { ok: false, message: 'Selecciona un rol válido.' };
    if (!validPermissionPayload(permissions)) return { ok: false, message: 'Revisa los permisos seleccionados.' };

    const { data: member, error: memberError } = await context.sessionClient
      .from('clinic_memberships')
      .select('role, permissions')
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .maybeSingle();
    if (memberError || !member) return { ok: false, message: 'No se encontró el acceso de esa cuenta.' };
    if (member.role === 'admin') return { ok: false, message: 'Los permisos de una cuenta administradora no se pueden modificar.' };
    if (member.role === role && JSON.stringify(member.permissions || {}) === JSON.stringify(sanitizeClinicPermissions(permissions, role))) return { ok: true, message: 'Los permisos no han cambiado.' };

    const { error: updateError } = await context.sessionClient
      .from('clinic_memberships')
      .update({ role, permissions: sanitizeClinicPermissions(permissions, role) })
      .eq('clinic_id', clinicId)
      .eq('user_id', userId);
    if (updateError?.code === '23514') return { ok: false, message: 'La clínica debe conservar al menos una persona administradora.' };
    if (updateError) return { ok: false, message: 'No se pudo cambiar el rol de acceso.' };

    return { ok: true, message: 'El rol de acceso se actualizó.' };
  } catch {
    return { ok: false, message: 'No se pudo cambiar el rol de acceso.' };
  }
}

export async function revokeClinicAccess({ clinicId, userId }) {
  try {
    const context = await authorizeClinicAdmin(clinicId);
    if (context.error) return { ok: false, message: context.error };
    if (typeof userId !== 'string' || !clinicIdPattern.test(userId)) return { ok: false, message: 'Selecciona una cuenta válida.' };
    if (isHiddenDirectoryAccount({ id: userId })) return { ok: false, message: 'No se encontró el acceso de esa cuenta.' };

    const { data: member, error: memberError } = await context.sessionClient
      .from('clinic_memberships')
      .select('role')
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .maybeSingle();
    if (memberError || !member) return { ok: false, message: 'No se encontró el acceso de esa cuenta.' };

    if (member.role === 'admin') return { ok: false, message: 'No se puede revocar el acceso de otra cuenta administradora.' };

    if (member.role === 'admin') {
      const { count, error } = await clinicAdminCount(context, clinicId);
      if (error) return { ok: false, message: 'No se pudo verificar el equipo administrador.' };
      if (count <= 1) return { ok: false, message: 'Asigna primero otro administrador para conservar acceso administrativo a la clínica.' };
    }

    const { error: deleteError } = await context.sessionClient
      .from('clinic_memberships')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('user_id', userId);
    if (deleteError?.code === '23514') return { ok: false, message: 'La clínica debe conservar al menos una persona administradora.' };
    if (deleteError) return { ok: false, message: 'No se pudo revocar el acceso a la clínica.' };

    return { ok: true, message: 'El acceso a la clínica fue revocado.' };
  } catch {
    return { ok: false, message: 'No se pudo revocar el acceso a la clínica.' };
  }
}
