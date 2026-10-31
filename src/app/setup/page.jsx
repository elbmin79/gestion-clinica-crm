import Link from 'next/link';

export const metadata = {
  title: 'Primeros pasos · CRM clínico',
  description: 'Recorre las funciones principales del CRM clínico y conoce los siguientes pasos para el espacio compartido.',
};

export default function SetupPage() {
  return <main className="setup-page"><article className="setup-card">
    <div className="eyebrow">CRM CLÍNICO · PRIMEROS PASOS</div>
    <h1>Revisa el CRM de la clínica</h1>
    <p>La demo local ya permite recorrer los flujos principales con expedientes ficticios. No necesitas configurar una base de datos compartida para revisar el proyecto.</p>
    <section className="setup-review">
      <h2>Empieza por las prioridades del equipo</h2>
      <ol className="setup-steps">
        <li><h3>Diagnóstico y contrato</h3><p>Abre un expediente de demostración en Pacientes, registra y acepta un diagnóstico ficticio y sigue el paso para preparar el contrato. El texto de muestra es provisional y la firma es simulada.</p><Link className="setup-action" href="/pacientes">Abrir pacientes</Link></li>
        <li><h3>Consentimientos informados</h3><p>Revisa la biblioteca, sustituye las muestras con formatos que proporcione la clínica y prepara una copia desde el expediente del paciente. Cada copia conserva el texto de su versión.</p><Link className="setup-action" href="/consentimientos">Abrir consentimientos</Link></li>
        <li><h3>Agenda por profesional y ubicación</h3><p>Prueba los filtros combinados de profesional, sucursal y negocio; también puedes recorrer las vistas de día, semana, mes, año y lista.</p><Link className="setup-action" href="/agenda">Abrir agenda</Link></li>
      </ol>
      <aside className="setup-note"><strong>Usa únicamente datos ficticios en la demo.</strong><p>Los cambios locales se guardan en este navegador. Los formatos de muestra no son documentos legales y las firmas no son electrónicas.</p></aside>
    </section>
    <section className="setup-shared">
      <h2>Después: preparar el espacio compartido</h2>
      <p>Cuando el equipo esté listo para usar cuentas y datos comunes, la clínica debe crear y controlar su propio proyecto de Supabase. Los pasos de conexión están aquí para esa etapa posterior.</p>
    <ol className="setup-steps">
      <li><h3>Crea el proyecto de la clínica</h3><p>La clínica debe ser propietaria del proyecto de Supabase y elegir la región de alojamiento.</p></li>
      <li><h3>Aplica las migraciones</h3><p>En el SQL Editor del proyecto vacío, aplica todos los archivos de <code>supabase/migrations</code> en orden alfabético.</p></li>
      <li><h3>Crea el primer administrador</h3><p>En Supabase Auth, invita o crea la cuenta y confirma su correo. Usa el correo confirmado al generar el alta.</p><pre>npm run clinic:setup -- --admin-email 'admin@clinica.mx' --clinic-name 'Nombre de la clínica' --time-zone 'America/Tijuana'</pre><p>Revisa <code>supabase/bootstrap/clinic-admin.generated.sql</code> y ejecútalo una sola vez en el proyecto vacío. Crea la clínica, su membresía administradora, el negocio y la sucursal principal.</p></li>
      <li><h3>Conecta la aplicación</h3><p>Copia <code>.env.example</code> como <code>.env.local</code> y configura <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. Reinicia el servidor local y entra con la cuenta administradora.</p></li>
      <li><h3>Configura los materiales de atención</h3><p>Agrega el contrato de prestación de servicios y los consentimientos informados que la clínica proporcione. Cada versión preparada conserva su copia. La firma y el envío no están conectados en esta base.</p></li>
      <li><h3>Completa el equipo y la agenda</h3><p>Agrega profesionales, sucursales y negocios; después configura citas, duración y anticipo requerido. La base impide confirmar una cita antes de registrar el anticipo.</p></li>
    </ol>
    </section>
    <aside className="setup-note"><strong>Avisos de WhatsApp</strong><p>Desde Configuración puedes asignar números a sucursales y elegir qué avisos internos aparecen en el CRM. Los mensajes automáticos para pacientes se definirán después con la automatización de IA.</p></aside>
    <p className="setup-back"><Link href="/login">Volver al inicio de sesión</Link> · <Link href="/">Abrir el CRM</Link></p>
  </article></main>;
}
