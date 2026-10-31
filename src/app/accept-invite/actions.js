'use server';

import { redirect } from 'next/navigation';
import { recipientInvitationContext } from '../../lib/clinic-invitations.server';

export async function acceptInvitation(previousState, formData) {
  const id = String(formData.get('invitationId') || '');
  const context = await recipientInvitationContext(id);
  if (context.login) redirect(`/login?next=${encodeURIComponent(`/accept-invite?id=${id}`)}`);
  if (context.accepted) redirect(`/?clinic=${context.invitation.clinic_id}`);
  if (context.error) return { error: context.error };
  if (context.invitation.requires_password) {
    const password = String(formData.get('password') || '');
    if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
    if (password !== String(formData.get('confirmation') || '')) return { error: 'Las contraseñas no coinciden.' };
    const { error } = await context.sessionClient.auth.updateUser({ password });
    if (error && error.code !== 'same_password') return { error: 'No se pudo guardar la contraseña. Prueba una contraseña distinta e inténtalo de nuevo.' };
    const { error: completionError } = await context.serviceClient.from('clinic_invitations')
      .update({ password_set_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending').eq('email', context.user.email.toLowerCase());
    if (completionError) return { error: 'Tu contraseña se guardó, pero no se pudo activar el acceso. Inténtalo de nuevo con la misma contraseña.' };
  }
  const { error } = await context.serviceClient.rpc('accept_clinic_invitation', { p_invitation: id, p_user: context.user.id });
  if (error) return { error: 'No se pudo activar el acceso. La invitación pudo vencer o ser revocada. Inténtalo de nuevo o contacta a la persona administradora.' };
  redirect(`/?clinic=${context.invitation.clinic_id}`);
}
