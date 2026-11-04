import { headers } from 'next/headers';
import Link from 'next/link';
import { getMobileReleases } from '@/lib/mobile-release';

export const metadata = { title: 'Instalar Elixir Clinic' };

const platforms = {
  android: { label: 'Android', action: 'Descargar APK', help: 'Abre el archivo descargado y confirma la instalación en Android.' },
  ios: { label: 'iPhone', action: 'Abrir enlace de instalación', help: 'Sigue las instrucciones de Apple para instalar la app.' },
};

export default async function AppDownloadPage() {
  const agent = (await headers()).get('user-agent') || '';
  const order = /iPhone|iPad|iPod/i.test(agent) ? ['ios', 'android'] : ['android', 'ios'];
  const releases = getMobileReleases();

  return <main className="auth-page">
    <article className="auth-card">
      <h1>Instalar Elixir Clinic</h1>
      <p>Elige tu dispositivo. Después de instalar la app, inicia sesión con tu cuenta del CRM.</p>
      <div className="form-stack">
        {order.map(platform => {
          const { label, action, help } = platforms[platform];
          const release = releases[platform];
          return <section key={platform}>
            <h2>{label}</h2>
            {platform === 'ios' && !release ? <>
              <p>Agrega el CRM a la pantalla de inicio desde Safari.</p>
              <ol>
                <li>Abre el CRM en Safari.</li>
                <li>Toca <strong>Compartir</strong> y elige <strong>Agregar a pantalla de inicio</strong>.</li>
                <li>Si aparece <strong>Abrir como app web</strong>, actívalo y toca <strong>Agregar</strong>.</li>
              </ol>
              <Link className="button primary" href="/">Abrir CRM</Link>
            </> : release ? <>
              <a className="button primary" href={release.url}>{action}</a>
              <p>{help}</p>
            </> : <p>La descarga todavía no está disponible.</p>}
          </section>;
        })}
      </div>
    </article>
  </main>;
}
