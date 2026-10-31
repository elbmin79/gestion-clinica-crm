'use server';

import { headers } from 'next/headers';
import { invitationAdminContext } from '../../lib/clinic-invitations.server';
import { deliverClinicInvitation } from '../../lib/clinic-invitation-delivery.js';
import { invitationIdPattern } from '../../lib/clinic-invitations.js';

export async function loadClinicInvitations(clinicId) {
  try {
    const context = await invitationAdminContext(clinicId);
    if (context.error) return { ok: false, message: context.error };
    const { data, error } = await context.serviceClient.from('clinic_invitations')
      .select('id,email,role,permissions,status,delivery_status,expires_at,last_sent_at')
      .eq('clinic_id', clinicId).eq('status', 'pending').order('created_at', { ascending: false });
    return error ? { ok: false, message: 'No se pudieron cargar las invitaciones.' } : { ok: true, invitations: data || [] };
  } catch { return { ok: false, message: 'No se pudieron cargar las invitaciones.' }; }
}

export async function inviteClinicMember(input) {
  try {
    const context = await invitationAdminContext(input?.clinicId);
    if (context.error) return { ok: false, message: context.error };
    const requestHeaders = await headers();
    // A canonical URL is preferred; Next validates Origin against Host for this action.
    const origin = process.env.APP_URL?.trim() || requestHeaders.get('origin');
    if (!origin) return { ok: false, message: 'Configura la dirección del CRM antes de enviar invitaciones.' };
    return await deliverClinicInvitation({ input, context, origin });
  } catch { return { ok: false, message: 'No se pudo enviar la invitación. Inténtalo de nuevo.' }; }
}

export async function revokeClinicInvitation({ clinicId, invitationId }) {
  try {
    const context = await invitationAdminContext(clinicId);
    if (context.error) return { ok: false, message: context.error };
    if (!invitationIdPattern.test(invitationId || '')) return { ok: false, message: 'Selecciona una invitación válida.' };
    const { data, error } = await context.serviceClient.from('clinic_invitations').update({ status: 'revoked' })
      .eq('id', invitationId).eq('clinic_id', clinicId).eq('status', 'pending').select('id');
    return error || !data?.length ? { ok: false, message: 'No se pudo revocar; actualiza la lista y revisa si ya fue aceptada.' }
      : { ok: true, message: 'Invitación revocada. El enlace ya no otorga acceso a la clínica.' };
  } catch { return { ok: false, message: 'No se pudo revocar la invitación.' }; }
}
