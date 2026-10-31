'use client';
import {usePathname} from 'next/navigation';
import {useEffect, useState} from 'react';
import App from './app-shell';

export default function RouteShell({children}){
  const pathname=usePathname();
  const [checkedPath, setCheckedPath] = useState('');
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    // Dashboard-generated legacy links may land on the Site URL rather than callback.
    if (pathname !== '/auth/callback' && ['invite','recovery'].includes(hash.get('type')) && hash.get('access_token') && hash.get('refresh_token')) {
      window.location.replace(`/auth/callback?next=/update-password${window.location.hash}`);
      return;
    }
    setCheckedPath(pathname);
  }, [pathname]);
  // Auth and public booking must never mount the CRM's data hooks or shell.
  const standalone = pathname.startsWith('/reservar/') || ['/login','/forgot-password','/update-password','/auth/callback','/accept-invite','/setup'].includes(pathname);
  if (standalone) return <>{children}</>;
  if (checkedPath !== pathname) return null;
  return <App>{children}</App>;
}
