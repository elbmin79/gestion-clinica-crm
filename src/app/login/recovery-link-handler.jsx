'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';

export default function RecoveryLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    if (hash.get('type') !== 'recovery') return;

    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (!accessToken || !refreshToken) return;

    // Remove credentials from browser history before exchanging them.
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (!active) return;
        if (error) {
          console.error('[auth:recovery] Session exchange failed', { message: error.message });
          router.replace('/login?error=auth-link');
          return;
        }
        router.replace('/update-password');
      })
      .catch((error) => {
        if (!active) return;
        console.error('[auth:recovery] Session exchange failed', { message: error?.message });
        router.replace('/login?error=auth-link');
      });

    return () => { active = false; };
  }, [router]);

  return null;
}
