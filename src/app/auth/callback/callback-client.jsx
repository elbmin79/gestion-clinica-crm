'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthBrand from '../auth-brand';
import { createClient } from '../../../lib/supabase/client';

export default function AuthCallbackClient({ next }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const finish = async () => {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const type = url.searchParams.get('type');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && active) {
          router.replace(next);
          return;
        }
        console.error('[auth:callback] PKCE exchange failed', { message: error?.message });
      } else if (tokenHash && (type === 'recovery' || type === 'invite' || type === 'signup' || type === 'email')) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (!error && active) {
          router.replace(next);
          return;
        }
        console.error('[auth:callback] OTP verification failed', { type, message: error?.message });
      } else {
        const hash = new URLSearchParams(url.hash.slice(1));
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (accessToken && refreshToken) {
          window.history.replaceState(null, '', `${url.pathname}${url.search}`);
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (!error && active) {
            router.replace(next);
            return;
          }
        }
      }

      if (active) setFailed(true);
    };

    finish().catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [next, router]);

  return <main className="auth-page">
    <section className="auth-card">
      <AuthBrand className="auth-brand--compact" />
      <h1>{failed ? 'Enlace no válido' : 'Verificando tu enlace'}</h1>
      {failed ? <><p>Este enlace pudo haber vencido o ya fue utilizado.</p><Link className="auth-link" href="/forgot-password">Solicitar un enlace nuevo</Link></> : <p>Esto solo tomará un momento…</p>}
    </section>
  </main>;
}
