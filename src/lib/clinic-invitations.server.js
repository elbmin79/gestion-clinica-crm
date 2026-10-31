import 'server-only';
import { createClient } from './supabase/server';
import { createServiceClient } from './supabase/service-client';
import { invitationIdPattern } from './clinic-invitations.js';

export async function invitationAdminContext(clinicId) {
  if (!invitationIdPattern.test(clinicId || '')) return { error: 'Selecciona una clínica válida.' };
  const sessionClient = await createClient();
  if (!sessionClient) return { error: 'La conexión de la clínica no está configurada.' };
  const { data, error } = await sessionClient.auth.getUser();
  if (error || !data?.user) return { error: 'Inicia sesión de nuevo para administrar accesos.' };
  const { data: membership, error: membershipError } = await sessionClient.from('clinic_memberships')
    .select('role').eq('clinic_id', clinicId).eq('user_id', data.user.id).maybeSingle();
  if (membershipError || membership?.role !== 'admin') return { error: 'Solo una persona administradora puede administrar invitaciones.' };
  const serviceClient = createServiceClient();
  return serviceClient ? { sessionClient, serviceClient, user: data.user } : { error: 'Falta configurar el acceso seguro del servidor.' };
}

export async function recipientInvitationContext(id) {
  if (!invitationIdPattern.test(id || '')) return { error: 'La invitación no es válida.' };
  const sessionClient = await createClient();
  if (!sessionClient) return { error: 'La conexión de la clínica no está configurada.' };
  const { data, error } = await sessionClient.auth.getUser();
  if (error || !data?.user) return { login: true };
  const serviceClient = createServiceClient();
  if (!serviceClient) return { error: 'No se pudo verificar la invitación. Inténtalo de nuevo.' };
  const { data: invitation, error: loadError } = await serviceClient.from('clinic_invitations')
    .select('id,clinic_id,email,role,status,requires_password,expires_at,delivery_status,accepted_by')
    .eq('id', id).eq('email', data.user.email?.toLowerCase() || '').maybeSingle();
  if (loadError) return { error: 'No se pudo cargar la invitación. Inténtalo de nuevo.' };
  if (!invitation) return { error: 'Esta invitación pertenece a otra cuenta o ya no está disponible.' };
  if (invitation.status === 'accepted' && invitation.accepted_by === data.user.id) return { accepted: true, invitation };
  if (invitation.status !== 'pending' || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.delivery_status === 'failed') {
    return { error: 'La invitación venció o fue revocada. Pide a la persona administradora que la reenvíe.' };
  }
  return { sessionClient, serviceClient, user: data.user, invitation };
}
