import Link from 'next/link';
import { sendPasswordReset } from '../login/actions';
import { isSupabaseConfigured } from '../../lib/supabase/config';

export default async function ForgotPasswordPage({ searchParams }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-mark">C</span><span>clínica<span>.</span></span></div>
      <div className="eyebrow">RECUPERAR ACCESO</div>
      <h1>Configura tu contraseña</h1>
      <p>Te enviaremos un enlace seguro para crear o cambiar tu contraseña.</p>
      {!configured ? <div className="form-note">La conexión de autenticación no está disponible.</div> : params?.sent === '1' ? <div className="form-note" role="status">Si el correo está registrado, recibirás un enlace para continuar. Revisa también tu carpeta de spam.</div> : <form action={sendPasswordReset} className="form-stack">
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required autoFocus /></label>
        {params?.error === 'invalid' && <p className="auth-error" role="alert">Escribe un correo válido.</p>}
        {params?.error === 'send-failed' && <p className="auth-error" role="alert">No se pudo enviar el enlace. Revisa la configuración de Auth e inténtalo de nuevo.</p>}
        <button className="button primary" type="submit">Enviar enlace</button>
      </form>}
      <Link className="auth-link" href="/login">Volver a iniciar sesión</Link>
    </section>
  </main>;
}
