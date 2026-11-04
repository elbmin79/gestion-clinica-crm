import { headers } from 'next/headers';
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
            {release ? <>
              <a className="button primary" href={release.url}>{action}</a>
              <p>{help}</p>
            </> : <p>La descarga todavía no está disponible.</p>}
          </section>;
        })}
      </div>
    </article>
  </main>;
}
