import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthBrand from '../auth/auth-brand';
import InvitationForm from './invitation-form';
import { recipientInvitationContext } from '../../lib/clinic-invitations.server';

export default async function AcceptInvitePage({ searchParams }) {
  const params = await searchParams;
  const id = typeof params?.id === 'string' ? params.id : '';
  const context = await recipientInvitationContext(id);
  if (context.login) redirect(`/login?next=${encodeURIComponent(`/accept-invite?id=${id}`)}`);
  if (context.accepted) redirect(`/?clinic=${context.invitation.clinic_id}`);
  return <main className="auth-page auth-recovery-page"><section className="auth-card">
    <AuthBrand className="auth-brand--compact"/>
    <h1>{context.error ? 'Revisa tu invitación' : context.invitation.requires_password ? 'Crea tu contraseña' : 'Acepta tu invitación'}</h1>
    {context.error ? <><p role="alert">{context.error}</p><Link className="auth-link" href="/login">Volver a iniciar sesión</Link></> : <>
      <p>{context.invitation.requires_password ? 'Elige una contraseña para activar tu acceso. Entrarás al CRM al guardarla.' : 'Tu cuenta conservará su contraseña. Acepta para entrar a la clínica.'}</p>
      <p className="invitation-recipient">{context.invitation.email}</p>
      <InvitationForm invitation={{ id, requires_password: context.invitation.requires_password }}/>
    </>}
  </section></main>;
}
