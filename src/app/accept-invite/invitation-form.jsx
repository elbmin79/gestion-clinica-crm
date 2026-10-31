'use client';

import { useActionState } from 'react';
import { acceptInvitation } from './actions';

export default function InvitationForm({ invitation }) {
  const [state, action, pending] = useActionState(acceptInvitation, {});
  return <form action={action} className="form-stack">
    <input name="invitationId" type="hidden" value={invitation.id}/>
    {invitation.requires_password && <>
      <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus disabled={pending}/></label>
      <label>Repite la contraseña<input name="confirmation" type="password" autoComplete="new-password" minLength={8} required disabled={pending}/></label>
    </>}
    {state.error && <p className="auth-error" role="alert">{state.error}</p>}
    <button className="button primary" type="submit" disabled={pending}>{pending ? 'Activando acceso…' : invitation.requires_password ? 'Crear contraseña y entrar' : 'Aceptar invitación y entrar'}</button>
  </form>;
}
