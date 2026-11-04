'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { ArrowUpRight, Check, Copy, Smartphone } from 'lucide-react';
import './mobile-install-link.css';

export default function MobileInstallLink() {
  const [qr, setQr] = useState('');
  const [qrFailed, setQrFailed] = useState(false);
  const [status, setStatus] = useState('');
  const field = useRef(null);
  const origin = process.env.NEXT_PUBLIC_CRM_APP_ORIGIN || 'https://gestion-clinica-crm.vercel.app';
  const url = new URL('/app-download', origin).href;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, {
      scale: 8,
      margin: 4,
      errorCorrectionLevel: 'H',
      color: { dark: '#301827', light: '#ffffff' },
    }).then(value => {
      if (active) setQr(value);
    }).catch(() => { if (active) setQrFailed(true); });
    return () => { active = false; };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Enlace copiado.');
    } catch {
      field.current?.focus();
      field.current?.select();
      setStatus('Copia el enlace seleccionado.');
    }
  }

  const copied = status === 'Enlace copiado.';

  return <div className="mobile-install">
    <div className="mobile-install-scan">
      <div className="mobile-install-qr">
        {qr ? <>
          <img className="mobile-install-code" src={qr} width="240" height="240" alt="Código QR para instalar Elixir Clinic" />
          <div className="mobile-install-mark" aria-hidden="true">
            <Image src="/elixirclinic-app-icon.webp" alt="" width={42} height={42} unoptimized />
          </div>
        </>
          : <span>{qrFailed ? 'Usa el enlace de abajo.' : 'Preparando código…'}</span>}
      </div>
      <div className="mobile-install-guide">
        <Smartphone size={22} aria-hidden="true" />
        <strong>Escanea con tu cámara</strong>
        <span>Desde un teléfono Android o iPhone.</span>
      </div>
    </div>
    <div className="mobile-install-share">
      <div className="mobile-install-share-heading">
        <label htmlFor="mobile-install-url">Enlace de instalación</label>
        <a href={url}>Abrir enlace <ArrowUpRight size={15} aria-hidden="true" /></a>
      </div>
      <div className="mobile-install-controls">
        <input id="mobile-install-url" ref={field} value={url} readOnly />
        <button type="button" className="button primary" onClick={copy}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? 'Copiado' : 'Copiar enlace'}
        </button>
      </div>
      <span className="mobile-install-status" role="status">{status}</span>
    </div>
  </div>;
}
