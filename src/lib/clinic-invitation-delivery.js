import { invitationCallbackUrl, invitationErrorMessage, nativeInvitationCallbackUrl, validateInvitationInput } from './clinic-invitations.js';

// Dependency injection keeps email behavior testable without sending real email.
export async function deliverClinicInvitation({ input, context, origin, native = false }) {
  const validated = validateInvitationInput(input);
  if (validated.error) return { ok: false, message: validated.error };
  if (context.error) return { ok: false, message: context.error };
  const { serviceClient, user } = context;
  // Validate the configured origin before reserving or sending anything.
  invitationCallbackUrl(origin, '00000000-0000-0000-0000-000000000000');
  const { data: invitation, error } = await serviceClient.rpc('prepare_clinic_invitation', {
    p_clinic: validated.clinicId, p_inviter: user.id, p_email: validated.email,
    p_role: validated.role, p_permissions: validated.permissions,
  });
  if (error || !invitation) return { ok: false, message: invitationErrorMessage(error) };
  const redirectTo = native ? nativeInvitationCallbackUrl(invitation.id) : invitationCallbackUrl(origin, invitation.id);
  let sendError;
  try {
    // Existing accounts keep their password. Unconfirmed/new accounts use an invite.
    const result = invitation.user_exists && invitation.email_confirmed
      ? await serviceClient.auth.signInWithOtp({ email: invitation.email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } })
      : await serviceClient.auth.admin.inviteUserByEmail(invitation.email, { redirectTo });
    sendError = result.error;
  } catch {
    sendError = { message: 'email_delivery_failed' };
  }
  // Do not revive an invitation revoked while the email request was running.
  const { error: saveError } = await serviceClient.from('clinic_invitations')
    .update({ delivery_status: sendError ? 'failed' : 'sent' }).eq('id', invitation.id).eq('status', 'pending');
  if (sendError) return { ok: false, message: invitationErrorMessage(sendError) };
  if (saveError) return { ok: false, message: 'El correo se envió, pero no se pudo actualizar su estado. Actualiza la lista antes de reenviar.' };
  return { ok: true, message: 'Invitación enviada. La persona podrá aceptar el acceso desde su correo.' };
}
