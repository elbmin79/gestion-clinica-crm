'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CircleAlert, CircleCheck, ExternalLink, LoaderCircle, Link2, RefreshCw, Unlink } from 'lucide-react';

function callbackMessage() {
  const result = new URLSearchParams(window.location.search).get('googleCalendar');
  if (result === 'connected') return 'La cuenta de Google quedó conectada.';
  if (result === 'cancelled') return 'Se canceló la autorización de Google.';
  if (result === 'error') return 'No se pudo terminar la conexión. Revisa la configuración de Google y vuelve a intentarlo.';
  if (result === 'unauthorized') return 'La cuenta actual ya no tiene permisos de administración para esta clínica.';
  return '';
}

export default function GoogleCalendarSettings({ clinicId, role, sharedMode }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connection, setConnection] = useState(null);
  const [history, setHistory] = useState([]);
  const [queued, setQueued] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStatus = useCallback(async () => {
    if (!clinicId || !sharedMode || role !== 'admin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/integrations/google-calendar/status?clinicId=${encodeURIComponent(clinicId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar la conexión.');
      setConnection(result.connection);
      setHistory(result.history || []);
      setQueued(result.queued || 0);
      setNotice(callbackMessage());
    } catch (loadError) {
      setError(loadError.message || 'No se pudo cargar la conexión con Google Calendar.');
    } finally {
      setLoading(false);
    }
  }, [clinicId, role, sharedMode]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const connect = () => {
    if (!clinicId) return;
    window.location.assign(`/api/integrations/google-calendar/connect?clinicId=${encodeURIComponent(clinicId)}`);
  };

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar Google Calendar de esta clínica? Se detendrán las sincronizaciones. Los eventos ya creados permanecerán en Google Calendar.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/integrations/google-calendar/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo desconectar Google Calendar.');
      setConnection(null);
      setNotice('La cuenta de Google quedó desconectada.');
    } catch (disconnectError) {
      setError(disconnectError.message || 'No se pudo desconectar Google Calendar.');
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/integrations/google-calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, initial: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo sincronizar Google Calendar.');
      setNotice(`Sincronización ejecutada: ${result.succeeded} actualizadas, ${result.failed} con error${result.queued ? ` y ${result.queued} pendientes` : ''}.`);
      await loadStatus();
    } catch (syncError) {
      setError(syncError.message || 'No se pudo sincronizar Google Calendar.');
    } finally {
      setSyncing(false);
    }
  };

  if (!sharedMode || !clinicId) {
    return <div className="settings-preview-content"><div className="settings-preview-banner"><CircleAlert size={17}/><div><strong>Selecciona una clínica conectada</strong><span>Google Calendar se conecta a una clínica y queda disponible para su equipo.</span></div></div></div>;
  }
  if (role !== 'admin') {
    return <div className="settings-preview-content"><div className="settings-preview-banner"><CircleAlert size={17}/><div><strong>Configuración solo para administración</strong><span>Una persona administradora de la clínica puede conectar o desconectar su calendario.</span></div></div></div>;
  }

  return <div className="settings-preview-content" aria-busy={loading || busy}>
    {notice && <p className="form-note" role="status"><CircleCheck size={15}/>{notice}</p>}
    {error && <p className="professional-error" role="alert"><CircleAlert size={15}/>{error}</p>}
    <div className="settings-preview-banner"><CalendarDays size={17}/><div><strong>Sincronización en una dirección</strong><span>El CRM crea y actualiza citas en el calendario principal de Google; las ediciones hechas en Google no cambian la agenda del CRM. Los eventos usan un título genérico y no incluyen nombres, notas ni diagnósticos.</span></div></div>
    {loading ? <p className="whatsapp-settings-loading"><LoaderCircle size={16}/> Consultando conexión…</p> : connection ? <>
      <div className="settings-option-list">
        <div className="settings-option-row"><div><strong>Cuenta conectada</strong><span>{connection.google_email}</span></div><span className="settings-option-status">Conectada</span></div>
        <div className="settings-option-row"><div><strong>Calendario</strong><span>{connection.calendar_id === 'primary' ? 'Principal' : connection.calendar_id}</span></div><span className="settings-option-status">Google Calendar</span></div>
        <div className="settings-option-row"><div><strong>Conectada el</strong><span>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(connection.connected_at))}</span></div><span className="settings-option-status">{connection.last_synced_at ? `Última sync: ${new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(connection.last_synced_at))}` : 'Lista para sincronizar'}</span></div>
      </div>
      {connection.last_sync_error && <p className="professional-error" role="alert"><CircleAlert size={15}/>{connection.last_sync_error}</p>}
      {queued > 0 && <p className="form-note" role="status">{queued} {queued === 1 ? 'cita pendiente' : 'citas pendientes'} de sincronización. La sincronización automática reintenta los errores.</p>}
      <div className="modal-actions"><button className="button primary" type="button" onClick={syncNow} disabled={syncing}><RefreshCw size={15}/> {syncing ? 'Sincronizando…' : 'Sincronizar citas'}</button><a className="button outline" href="https://calendar.google.com" target="_blank" rel="noreferrer"><ExternalLink size={15}/> Abrir Google Calendar</a><button className="button secondary" type="button" onClick={disconnect} disabled={busy || syncing}><Unlink size={15}/> Desconectar</button></div>
      {history.length > 0 && <div className="settings-option-list google-calendar-history"><div className="settings-option-row"><div><strong>Últimos intentos</strong><span>{history.slice(0, 5).map((item, index) => <span key={`${item.created_at}-${index}`} className="google-sync-history-item">{item.status === 'succeeded' ? 'Correcta' : item.status === 'failed' ? 'Fallida' : item.status === 'processing' ? 'En curso' : 'Pendiente'} · {new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.updated_at || item.created_at))}{item.last_error ? ` · ${item.last_error}` : ''}</span>)}</span></div><span className="settings-option-status">Historial</span></div></div>}
    </> : <>
      <div className="settings-option-list"><div className="settings-option-row"><div><strong>Conectar cuenta de Google</strong><span>Autoriza la cuenta que administra el calendario de la clínica.</span></div><span className="settings-option-status">Desconectada</span></div></div>
      <div className="modal-actions"><button className="button primary" type="button" onClick={connect}><Link2 size={15}/> Conectar Google Calendar</button></div>
    </>}
  </div>;
}
