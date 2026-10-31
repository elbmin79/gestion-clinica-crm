'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthBrand from '../auth-brand';
import { createClient } from '../../../lib/supabase/client';
import { authLinkDestination } from '../../../lib/clinic-invitations.js';

export default function AuthCallbackClient({ next }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const completion = useRef(null);

  useEffect(() => {
    let active = true;
    const finish = async () => {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const type = url.searchParams.get('type');
      const hash = new URLSearchParams(url.hash.slice(1));
      const destination = authLinkDestination(next, type || hash.get('type'));

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return destination;
        console.error('[auth:callback] PKCE exchange failed', { message: error?.message });
      } else if (tokenHash && (type === 'recovery' || type === 'invite' || type === 'signup' || type === 'email')) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (!error) return destination;
        console.error('[auth:callback] OTP verification failed', { type, message: error?.message });
      } else {
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (accessToken && refreshToken) {
          window.history.replaceState(null, '', `${url.pathname}${url.search}`);
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (!error) return destination;
        }
      }

      throw new Error('auth_link_failed');
    };

    // Strict Mode replays effects in development. A one-use token must be
    // exchanged once, while the current effect subscribes to that same result.
    completion.current ??= finish();
    completion.current.then(destination => { if (active) router.replace(destination); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [next, router]);

  return <main className="auth-page">
    <section className="auth-card">
      <AuthBrand className="auth-brand--compact" />
      <h1>{failed ? 'Enlace no válido' : 'Verificando tu enlace'}</h1>
      {failed ? next.startsWith('/accept-invite?')
        ? <><p>Este enlace pudo vencer o ya fue utilizado. Pide a la persona administradora que reenvíe la invitación desde el CRM.</p><Link className="auth-link" href="/login">Volver a iniciar sesión</Link></>
        : <><p>Este enlace pudo haber vencido o ya fue utilizado.</p><Link className="auth-link" href="/forgot-password">Solicitar un enlace nuevo</Link></>
        : <p>Esto solo tomará un momento…</p>}
    </section>
  </main>;
}
