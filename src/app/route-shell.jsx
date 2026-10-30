'use client';
import {usePathname} from 'next/navigation';
import App from './app-shell';

export default function RouteShell({children}){
  const pathname=usePathname();
  // Public booking must never mount the authenticated CRM's data hooks or shell.
  return pathname.startsWith('/reservar/')?<>{children}</>:<App>{children}</App>;
}
