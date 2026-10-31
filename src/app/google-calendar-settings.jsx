'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CircleAlert, CircleCheck, ExternalLink, LoaderCircle, Link2, RefreshCw, Unlink } from 'lucide-react';
import { hasClinicPermission } from '../lib/clinic-permissions.js';

function callbackMessage() {
  const result = new URLSearchParams(window.location.search).get('googleCalendar');
  if (result === 'connected') return 'Tu cuenta de Google quedó conectada.';
  if (result === 'cancelled') return 'Se canceló la autorización de Google.';
  if (result === 'error') return 'No se pudo terminar la conexión. Revisa la configuración de Google y vuelve a intentarlo.';
  if (result === 'unauthorized') return 'Tu cuenta no tiene permiso para administrar este calendario.';
  return '';
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function GoogleCalendarSettings({ clinicId, role, permissions = {}, sharedMode }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connection, setConnection] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [calendars, setCalendars] = useState([]);
  const [calendarError, setCalendarError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStatus = useCallback(async () => {
    if (!clinicId || !sharedMode) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/integrations/google-calendar/status?clinicId=${encodeURIComponent(clinicId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar la conexión.');
      setConnection(result.connection || null);
      setHistory(result.history || []);
      const callbackNotice = callbackMessage();
      if (callbackNotice) setNotice(callbackNotice);
    } catch (loadError) {
      setError(loadError.message || 'No se pudo cargar la conexión con Google Calendar.');
    } finally { setLoading(false); }
  }, [clinicId, role, sharedMode, permissions]);

  const loadCalendars = useCallback(async () => {
    if (!connection || !clinicId) { setCalendars([]); return; }
    try {
      const response = await fetch(`/api/integrations/google-calendar/calendar?clinicId=${encodeURIComponent(clinicId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudieron consultar tus calendarios.');
      setCalendars(result.calendars || []);
      setCalendarError('');
    } catch (loadError) { setCalendarError(loadError.message || 'No se pudieron consultar tus calendarios.'); }
  }, [clinicId, connection?.connected_at, connection?.calendar_id]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { loadCalendars(); }, [loadCalendars]);

  const connect = replacing => {
    if (!clinicId) return;
    if (replacing && !window.confirm('Al cambiar la cuenta, los eventos ya creados permanecerán en el calendario anterior. ¿Continuar?')) return;
    window.location.assign(`/api/integrations/google-calendar/connect?clinicId=${encodeURIComponent(clinicId)}`);
  };

  const sync = async initial => {
    setSyncing(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/integrations/google-calendar/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, initial }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo sincronizar Google Calendar.');
      setNotice(`Sincronización ejecutada: ${result.succeeded} actualizadas, ${result.failed} con error${result.queued ? ` y ${result.queued} pendientes` : ''}.`);
      await loadStatus();
    } catch (syncError) { setError(syncError.message || 'No se pudo sincronizar Google Calendar.'); }
    finally { setSyncing(false); }
  };

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar tu cuenta de Google? Los eventos ya creados permanecerán en Google Calendar.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/integrations/google-calendar/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo desconectar Google Calendar.');
      setNotice('Tu cuenta de Google quedó desconectada.');
      setConnection(null);
      setCalendars([]);
    } catch (disconnectError) { setError(disconnectError.message || 'No se pudo desconectar Google Calendar.'); }
    finally { setBusy(false); }
  };

  const chooseCalendar = async event => {
    const calendarId = event.target.value;
    if (!calendarId || calendarId === connection?.calendar_id) return;
    setBusy(true); setCalendarError('');
    try {
      const response = await fetch('/api/integrations/google-calendar/calendar', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, calendarId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo cambiar el calendario.');
      await loadStatus();
      await sync(false);
    } catch (changeError) { setCalendarError(changeError.message || 'No se pudo cambiar el calendario.'); }
    finally { setBusy(false); }
  };

  if (!sharedMode || !clinicId) return <div className="settings-preview-content"><div className="settings-preview-banner"><CircleAlert size={17}/><div><strong>Selecciona una clínica conectada</strong><span>Conecta tu cuenta de Google a esta clínica.</span></div></div></div>;
  if (!role) return <div className="settings-preview-content"><div className="settings-preview-banner"><CircleAlert size={17}/><div><strong>Inicia sesión para configurar Google Calendar</strong></div></div></div>;

  return <div className="settings-preview-content" aria-busy={loading || busy || syncing}>
    {notice && <p className="form-note" role="status"><CircleCheck size={15}/>{notice}</p>}
    {error && <p className="professional-error" role="alert"><CircleAlert size={15}/>{error}</p>}
    <div className="settings-preview-banner"><CalendarDays size={17}/><div><strong>Tu cuenta de Google Calendar</strong><span>Solo tú ves y administras la cuenta que conectes. Cada cuenta CRM configura su propia conexión; puedes elegir un calendario compartido si Google te dio permiso de edición. Los eventos usan títulos genéricos.</span></div></div>
    {loading ? <p className="whatsapp-settings-loading"><LoaderCircle size={16}/> Consultando tu conexión…</p> : <section className="google-provider-calendar-section">
      <div className="google-calendar-section-heading"><div><strong>Mi cuenta</strong><span>{connection ? 'Calendario asociado a tu cuenta CRM.' : 'Conecta tu Google Calendar para sincronizar las citas de la clínica.'}</span></div><span className="settings-option-status">{connection ? 'Conectada' : 'Sin conectar'}</span></div>
      {connection ? <div className="google-provider-calendar-row">
        <div className="google-provider-calendar-main">
          <strong>{connection.google_email}</strong>
          <label className="google-calendar-picker">Calendario de destino
            <select value={connection.calendar_id} onChange={chooseCalendar} disabled={busy || syncing || calendars.length === 0}>
              {calendars.length === 0 && <option value={connection.calendar_id}>Cargando calendarios…</option>}
              {calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? ' · Principal' : ''}</option>)}
            </select>
          </label>
          {connection.last_sync_error && <span className="google-provider-calendar-error"><CircleAlert size={13}/>{connection.last_sync_error}</span>}
          {calendarError && <span className="google-provider-calendar-error" role="alert"><CircleAlert size={13}/>{calendarError}</span>}
          <small>{connection.last_synced_at ? `Última sincronización: ${formatDate(connection.last_synced_at)}` : 'Aún no hay una sincronización registrada.'}</small>
        </div>
        <div className="google-provider-calendar-actions">
          <button className="button outline compact" type="button" onClick={() => sync(true)} disabled={busy || syncing}><RefreshCw size={14}/>{syncing ? 'Sincronizando…' : 'Resincronizar citas'}</button>
          <button className="button secondary compact" type="button" onClick={() => connect(true)} disabled={busy || syncing}><Link2 size={14}/> Cambiar cuenta</button>
          <button className="button secondary compact" type="button" onClick={disconnect} disabled={busy || syncing}><Unlink size={14}/> Desconectar</button>
          <a className="button outline compact" href="https://calendar.google.com" target="_blank" rel="noreferrer"><ExternalLink size={14}/> Abrir Google Calendar</a>
        </div>
      </div> : <div className="google-provider-calendar-row"><div className="google-provider-calendar-main"><span>Conecta la cuenta de Google que quieres usar con este usuario del CRM.</span></div><div className="google-provider-calendar-actions"><button className="button primary compact" type="button" onClick={() => connect(false)} disabled={busy}><Link2 size={14}/> Conectar Google</button></div></div>}
    </section>}
    {history.length > 0 && <div className="settings-option-list google-calendar-history">
      <div className="settings-option-row"><div><strong>Últimos intentos</strong><span>{history.slice(0, historyOpen ? 8 : 2).map((item, index) => <span key={`${item.created_at}-${index}`} className="google-sync-history-item">{item.status === 'succeeded' ? 'Correcta' : item.status === 'failed' ? 'Fallida' : item.status === 'processing' ? 'En curso' : 'Pendiente'} · {formatDate(item.updated_at || item.created_at)}{item.last_error ? ` · ${item.last_error}` : ''}</span>)}</span></div><button className="settings-option-status" type="button" onClick={() => setHistoryOpen(value => !value)}>{historyOpen ? 'Cerrar historial' : 'Historial'}</button></div>
    </div>}
  </div>;
}
