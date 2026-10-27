import Link from 'next/link';
import { isSupabaseConfigured } from '../../lib/supabase/config';
import { signIn } from './actions';

const messages = {
  invalid: 'No se pudo iniciar sesión. Revisa el correo y la contraseña.',
  'not-configured': 'La conexión de autenticación todavía no está configurada.',
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-mark">C</span><span>clínica<span>.</span></span></div>
      <div className="eyebrow">ESPACIO DE ATENCIÓN</div>
      <h1>Inicia sesión</h1>
      <p>Accede al espacio seguro de tu clínica.</p>
      {!configured ? <div className="form-note">{process.env.NODE_ENV === 'production'
        ? 'Este espacio todavía no está habilitado. El administrador debe conectar el proyecto de base de datos antes de iniciar operaciones.'
        : 'La autenticación estará disponible al conectar el proyecto de base de datos. El modo de demostración sigue disponible.'}</div> : <form action={signIn} className="form-stack">
        <input type="hidden" name="next" value={typeof params?.next === 'string' ? params.next : '/'} />
        <label>Correo electrónico<input name="email" type="email" autoComplete="username" required autoFocus /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
        {messages[params?.error] && <p className="auth-error" role="alert">{messages[params.error]}</p>}
        <button className="button primary" type="submit">Entrar</button>
      </form>}
      {!configured && <div className="clinic-setup"><h2>Preparar el espacio de la clínica</h2><ol>
        <li>Crear un proyecto de Supabase propiedad de la clínica.</li>
        <li>Aplicar las migraciones de <code>supabase/migrations</code> en orden.</li>
        <li>Crear y confirmar la cuenta del primer administrador.</li>
        <li>Generar el alta inicial y conectar las claves públicas del proyecto.</li>
      </ol><p>Desde la carpeta del proyecto, ejecuta:</p><pre>npm run clinic:setup -- --admin-email 'admin@clinica.mx' --clinic-name 'Nombre de la clínica' --time-zone 'America/Tijuana'</pre><p>Después revisa y ejecuta el SQL generado. La guía completa está en <Link href="/setup">Configuración de Supabase</Link>.</p></div>}
      {!configured && process.env.NODE_ENV !== 'production' && <a className="button primary auth-demo-link" href="/">Abrir demo</a>}
    </section>
  </main>;
}
