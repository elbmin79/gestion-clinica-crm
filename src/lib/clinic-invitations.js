import { CLINIC_ROLES, CLINIC_PERMISSION_KEYS, sanitizeClinicPermissions } from './clinic-permissions.js';

export const invitationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateInvitationInput({ clinicId, email, role, permissions } = {}) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!invitationIdPattern.test(clinicId || '')) return { error: 'Selecciona una clínica válida.' };
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { error: 'Escribe un correo válido.' };
  if (!CLINIC_ROLES.some(([value]) => value === role)) return { error: 'Selecciona un rol válido.' };
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)
    || !Object.entries(permissions).every(([key, value]) => CLINIC_PERMISSION_KEYS.includes(key)
      && (key === 'availability.scope' ? ['self', 'branch', 'clinic'].includes(value) : typeof value === 'boolean'))) {
    return { error: 'Revisa los permisos seleccionados.' };
  }
  return { clinicId, email: normalizedEmail, role, permissions: sanitizeClinicPermissions(permissions, role) };
}

export function invitationCallbackUrl(origin, invitationId) {
  const url = new URL('/auth/callback', origin);
  if (!['http:', 'https:'].includes(url.protocol) || (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('invalid_origin');
  if (!invitationIdPattern.test(invitationId)) throw new Error('invalid_invitation');
  url.searchParams.set('next', `/accept-invite?id=${invitationId}`);
  return url.toString();
}

export function invitationErrorMessage(error) {
  const message = error?.message || '';
  if (error?.status === 429 || /rate_limit/.test(message)) return 'Espera un minuto antes de reenviar. Si continúa, revisa el límite de correos de la clínica.';
  if (/already_member/.test(message)) return 'Esa persona ya tiene acceso a esta clínica.';
  if (/admin_required/.test(message)) return 'Solo una persona administradora puede enviar invitaciones.';
  return 'No se pudo enviar la invitación. Revisa la configuración de correo e inténtalo de nuevo.';
}

export function authLinkDestination(next, type) {
  // Invitations and recovery must not silently land in the CRM without setup.
  if (type === 'invite' || type === 'recovery') {
    return /^\/accept-invite\?id=[0-9a-f-]{36}$/i.test(next || '') ? next : '/update-password';
  }
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/';
}
