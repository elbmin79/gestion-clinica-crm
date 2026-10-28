import Link from 'next/link';
import { ArrowRight, CalendarDays, FileHeart, LockKeyhole, UsersRound } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase/config';
import AuthBrand from '../auth/auth-brand';
import { signIn } from './actions';
import RecoveryLinkHandler from './recovery-link-handler';

const messages = {
  invalid: 'No se pudo iniciar sesión. Revisa el correo y la contraseña.',
  'not-configured': 'La conexión de autenticación todavía no está configurada.',
  'auth-link': 'El enlace de acceso venció o ya se usó. Solicita uno nuevo.',
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  return <main className="auth-page auth-login-page">
    <RecoveryLinkHandler />
    <div className="auth-login-backdrop" aria-hidden="true">
      <span className="auth-backdrop-orbit auth-backdrop-orbit-one" />
      <span className="auth-backdrop-orbit auth-backdrop-orbit-two" />
    </div>
    <section className="auth-login-layout" aria-label="Acceso a Elixir Clinic">
      <aside className="auth-story">
        <span className="auth-story-orbit auth-story-orbit-one" aria-hidden="true" />
        <span className="auth-story-orbit auth-story-orbit-two" aria-hidden="true" />
        <div className="auth-story-main">
          <AuthBrand className="auth-brand--hero" light />
          <p>CRM para organizar la atención en clínicas de medicina estética.</p>
        </div>
        <div className="auth-capabilities" aria-label="Herramientas de Elixir Clinic">
          <span><CalendarDays aria-hidden="true" /> Agenda</span>
          <span><UsersRound aria-hidden="true" /> Pacientes</span>
          <span><FileHeart aria-hidden="true" /> Expedientes</span>
        </div>
      </aside>

      <section className="auth-login-panel">
        <div className="auth-login-content">
          <div className="auth-access-label"><LockKeyhole aria-hidden="true" /> Acceso del equipo</div>
          <h1>Inicia sesión</h1>
          <p className="auth-login-intro">Ingresa tus credenciales para continuar.</p>

          {!configured ? (
            <div className="form-note auth-setup-notice">
              {process.env.NODE_ENV === 'production'
                ? 'Este espacio todavía no está habilitado. El administrador debe conectar el proyecto de base de datos antes de iniciar operaciones.'
                : 'La autenticación estará disponible al conectar el proyecto de base de datos. El modo de demostración sigue disponible.'}
            </div>
          ) : (
            <form action={signIn} className="form-stack auth-login-form">
              <input type="hidden" name="next" value={typeof params?.next === 'string' ? params.next : '/'} />
              <label className="auth-field">
                <span>Correo electrónico</span>
                <input name="email" type="email" autoComplete="username" required autoFocus />
              </label>
              <label className="auth-field">
                <span className="auth-password-label"><span>Contraseña</span><Link href="/forgot-password">¿Olvidaste tu contraseña?</Link></span>
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              {messages[params?.error] && <p className="auth-error" role="alert">{messages[params.error]}</p>}
              <button className="button primary auth-submit" type="submit"><span>Entrar a Elixir Clinic</span><ArrowRight aria-hidden="true" /></button>
            </form>
          )}

          {!configured && <div className="clinic-setup">
            <h2>Preparar Elixir Clinic</h2>
            <ol>
              <li>Crear un proyecto de Supabase propiedad de la clínica.</li>
              <li>Aplicar las migraciones de <code>supabase/migrations</code> en orden.</li>
              <li>Crear y confirmar la cuenta del primer administrador.</li>
              <li>Generar el alta inicial y conectar las claves públicas del proyecto.</li>
            </ol>
            <p>Desde la carpeta del proyecto, ejecuta:</p>
            <pre>npm run clinic:setup -- --admin-email 'admin@clinica.mx' --clinic-name 'Elixir Clinic' --time-zone 'America/Tijuana'</pre>
            <p>Después revisa y ejecuta el SQL generado. La guía completa está en <Link href="/setup">Configuración de Supabase</Link>.</p>
          </div>}
          {!configured && process.env.NODE_ENV !== 'production' && <a className="button secondary auth-demo-link" href="/">Abrir demo</a>}
        </div>
      </section>
    </section>
  </main>;
}
