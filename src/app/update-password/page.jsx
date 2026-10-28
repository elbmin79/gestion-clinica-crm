import { redirect } from 'next/navigation';
import { updatePassword } from './actions';
import { createClient } from '../../lib/supabase/server';
import AuthBrand from '../auth/auth-brand';

const errors = {
  'weak-password': 'La contraseña debe tener al menos 8 caracteres.',
  mismatch: 'Las contraseñas no coinciden.',
  'update-failed': 'No se pudo guardar la contraseña. Solicita otro enlace e inténtalo de nuevo.',
};

export default async function UpdatePasswordPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  if (!supabase) redirect('/login?error=not-configured');
  const { data, error } = await supabase.auth.getUser();
  if (!data?.user || error) redirect('/login?error=auth-link');
  return <main className="auth-page auth-recovery-page"><section className="auth-card">
    <AuthBrand className="auth-brand--compact" />
    <h1>Crea tu contraseña</h1>
    <p>Elige una contraseña para entrar a Elixir Clinic.</p>
    <form action={updatePassword} className="form-stack">
      <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus /></label>
      <label>Repite la contraseña<input name="confirmation" type="password" autoComplete="new-password" minLength={8} required /></label>
      {errors[params?.error] && <p className="auth-error" role="alert">{errors[params.error]}</p>}
      <button className="button primary" type="submit">Guardar contraseña</button>
    </form>
  </section></main>;
}