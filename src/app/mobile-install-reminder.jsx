'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, X } from 'lucide-react';
import './mobile-install-reminder.css';

const dismissalKey = 'elixir-mobile-install-dismissed';

export default function MobileInstallReminder() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(dismissalKey)) return;
    } catch {
      // The reminder can still be dismissed when browser storage is disabled.
    }
    setVisible(true);
  }, []);

  function dismiss() {
    setVisible(false);
    try { sessionStorage.setItem(dismissalKey, '1'); } catch {}
  }

  if (!visible) return null;

  return <aside className="mobile-install-reminder" aria-label="Instalar Elixir Clinic">
    <Image src="/elixirclinic-app-icon.webp" alt="" width={44} height={44} unoptimized />
    <div>
      <strong>Elixir Clinic en tu teléfono</strong>
      <p>Instala la app y accede al CRM desde tu móvil.</p>
      <Link href="/app-download" onClick={dismiss}>Ver opciones de instalación <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </div>
    <button type="button" onClick={dismiss} aria-label="Cerrar recordatorio de instalación"><X size={19} aria-hidden="true" /></button>
  </aside>;
}
