'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CircleAlert, CircleCheck, ExternalLink, LoaderCircle, Link2, RefreshCw, Unlink } from 'lucide-react';

function callbackMessage() {
  const result = new URLSearchParams(window.location.search).get('googleCalendar');
  if (result === 'connected') return 'La cuenta de Google quedó conectada.';
  if (result === 'cancelled') return 'Se canceló la autorización de Google.';
  if (result === 'error') return 'No se pudo terminar la conexión. Revisa la configuración de Google y vuelve a intentarlo.';
  if (result === 'unauthorized') return 'Tu cuenta no tiene permiso para administrar ese calendario profesional.';
  return '';
}

function formatDate(value, style = 'short') {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: style, timeStyle: 'short' }).format(new Date(value));
}

function ProviderCalendarRow({ clinicId, provider, connect, disconnect, sync, syncing, busy }) {
  const connection = provider.connection;
  const [calendars, setCalendars] = useState([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState('');

  useEffect(() => {
    if (!connection) {
      setCalendars([]);
      setCalendarError('');
      return;
    }
    let cancelled = false;
    setLoadingCalendars(true);
    setCalendarError('');
    fetch(`/api/integrations/google-calendar/calendar?clinicId=${encodeURIComponent(clinicId)}&providerId=${encodeURIComponent(provider.id)}`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudieron cargar los calendarios.');
        if (!cancelled) setCalendars(result.calendars || []);
      })
      .catch(error => { if (!cancelled) setCalendarError(error.message || 'No se pudieron cargar los calendarios.'); })
      .finally(() => { if (!cancelled) setLoadingCalendars(false); });
    return () => { cancelled = true; };
  }, [clinicId, connection?.connected_at, connection?.calendar_id, provider.id]);

  const primaryCalendar = calendars.find(calendar => calendar.primary);
  const selectedCalendarId = connection?.calendar_id === 'primary'
    ? primaryCalendar?.id || 'primary'
    : connection?.calendar_id || '';

  const chooseCalendar = async event => {
    const calendarId = event.target.value;
    if (!calendarId || calendarId === selectedCalendarId) return;
    setSavingCalendar(true);
    setCalendarError('');
    try {
      const response = await fetch('/api/integrations/google-calendar/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, providerId: provider.id, calendarId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el calendario.');
      await sync(provider.id, false);
    } catch (error) {
      setCalendarError(error.message || 'No se pudo guardar el calendario.');
    } finally {
      setSavingCalendar(false);
    }
  };

  return <div className="google-provider-calendar-row">
    <div className="google-provider-calendar-main">
      <div className="google-provider-calendar-heading">
        <strong>{provider.name}</strong>
        <span className="settings-option-status">{connection ? 'Conectada' : provider.active ? 'Sin conectar' : 'Inactivo'}</span>
      </div>
      {connection ? <>
        <span>{connection.google_email}</span>
        <label className="google-calendar-picker">Calendario de destino
          <select value={selectedCalendarId} onChange={chooseCalendar} disabled={loadingCalendars || savingCalendar || calendars.length === 0}>
            {loadingCalendars && <option value={selectedCalendarId}>Cargando calendarios…</option>}
            {!loadingCalendars && calendars.length === 0 && <option value="">Sin calendarios con permiso de edición</option>}
            {calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? ' · Principal' : ''}</option>)}
          </select>
        </label>
        {connection.last_sync_error && <span className="google-provider-calendar-error"><CircleAlert size={13}/>{connection.last_sync_error}</span>}
        {calendarError && <span className="google-provider-calendar-error" role="alert"><CircleAlert size={13}/>{calendarError}</span>}
        <small>{connection.last_synced_at ? `Última sincronización: ${formatDate(connection.last_synced_at)}` : 'Conecta este calendario con las citas del profesional.'}</small>
      </> : <span>{provider.active ? 'Conecta tu cuenta para sincronizar las citas asignadas a este profesional.' : 'Profesional inactivo.'}</span>}
    </div>
    <div className="google-provider-calendar-actions">
      {connection && <button className="button outline compact" type="button" onClick={() => sync(provider.id, true)} disabled={busy || syncing || savingCalendar}><RefreshCw size={14}/>{syncing ? 'Sincronizando…' : 'Resincronizar citas'}</button>}
      <button className={`button ${connection ? 'secondary' : 'primary'} compact`} type="button" onClick={() => connect(provider.id, Boolean(connection))} disabled={busy || syncing || !provider.active}>
        {connection ? <><Link2 size={14}/> Cambiar cuenta</> : <><Link2 size={14}/> Conectar Google</>}
      </button>
      {connection && <button className="button secondary compact" type="button" onClick={() => disconnect(provider.id, provider.name)} disabled={busy || syncing}><Unlink size={14}/> Desconectar</button>}
      {connection && <a className="button outline compact" href="https://calendar.google.com" target="_blank" rel="noreferrer"><ExternalLink size={14}/> Abrir Google Calendar</a>}
    </div>
  </div>;
}

export default function GoogleCalendarSettings({ clinicId, role, sharedMode }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingProviderId, setSyncingProviderId] = useState('');
  const [providers, setProviders] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStatus = useCallback(async () => {
    if (!clinicId || !sharedMode || !['admin', 'clinician'].includes(role)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/integrations/google-calendar/status?clinicId=${encodeURIComponent(clinicId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar la conexión.');
      setProviders(result.providers || []);
      setHistory(result.history || []);
      setNotice(callbackMessage());
    } catch (loadError) {
      setError(loadError.message || 'No se pudo cargar la conexión con Google Calendar.');
    } finally {
      setLoading(false);
    }
  }, [clinicId, role, sharedMode]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const connect = (providerId = '', replacing = false) => {
    if (!clinicId) return;
    if (replacing && !window.confirm('Al cambiar la cuenta, los eventos ya creados en el calendario anterior permanecerán allí. ¿Continuar?')) return;
    if (!providerId) return;
    const providerQuery = `&providerId=${encodeURIComponent(providerId)}`;
    window.location.assign(`/api/integrations/google-calendar/connect?clinicId=${encodeURIComponent(clinicId)}${providerQuery}`);
  };

  const disconnect = async (providerId = '', providerName = '') => {
    if (!providerId) return;
    const label = `el calendario de ${providerName}`;
    if (!window.confirm(`¿Desconectar ${label}? Los eventos ya creados permanecerán en Google Calendar.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/integrations/google-calendar/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, providerId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo desconectar Google Calendar.');
      setNotice('La cuenta de Google quedó desconectada.');
      await loadStatus();
    } catch (disconnectError) {
      setError(disconnectError.message || 'No se pudo desconectar Google Calendar.');
    } finally {
      setBusy(false);
    }
  };

  const sync = async (providerId = '', initial = false) => {
    if (!providerId) return;
    setSyncing(true);
    setSyncingProviderId(providerId);
    setError(''); setNotice('');
    try {
      const response = await fetch('/api/integrations/google-calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, providerId, initial }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo sincronizar Google Calendar.');
      setNotice(`Sincronización ejecutada: ${result.succeeded} actualizadas, ${result.failed} con error${result.queued ? ` y ${result.queued} pendientes` : ''}.`);
      await loadStatus();
    } catch (syncError) {
      setError(syncError.message || 'No se pudo sincronizar Google Calendar.');
    } finally {
      setSyncing(false);
      setSyncingProviderId('');
    }
  };

  if (!sharedMode || !clinicId) {
    return <div className="settings-preview-content"><div className="settings-preview-banner"><CircleAlert size={17}/><div><strong>Selecciona una clínica conectada</strong><span>Conecta tu cuenta de Google a tu perfil profesional en la clínica.</span></div></div></div>;
  }
  if (!['admin', 'clinician'].includes(role)) {
    return <div className="settings-preview-content"><div className="settings-preview-banner"><CircleAlert size={17}/><div><strong>Configuración solo para profesionales</strong><span>Una persona administradora o profesional puede conectar un calendario.</span></div></div></div>;
  }

  return <div className="settings-preview-content" aria-busy={loading || busy}>
    {notice && <p className="form-note" role="status"><CircleCheck size={15}/>{notice}</p>}
    {error && <p className="professional-error" role="alert"><CircleAlert size={15}/>{error}</p>}
    <div className="settings-preview-banner"><CalendarDays size={17}/><div><strong>Conecta tu calendario de Google</strong><span>Solo verás y administrarás el calendario vinculado a tu cuenta CRM. Puedes elegir un calendario compartido si tu cuenta Google tiene permiso de edición. Los eventos usan títulos genéricos y no incluyen datos del paciente.</span></div></div>
    {loading ? <p className="whatsapp-settings-loading"><LoaderCircle size={16}/> Consultando conexiones…</p> : <>
      {(providers.length > 0 || ['admin', 'clinician'].includes(role)) && <section className="google-provider-calendar-section">
        <div className="google-calendar-section-heading"><div><strong>Mi perfil profesional</strong><span>Aquí solo aparecen los perfiles profesionales vinculados a tu cuenta.</span></div></div>
        {providers.length ? providers.map(provider => <ProviderCalendarRow
          key={provider.id}
          clinicId={clinicId}
          provider={provider}
          connect={connect}
          disconnect={disconnect}
          sync={sync}
          syncing={syncingProviderId === provider.id}
          busy={busy}
        />) : <p className="google-calendar-empty">{role === 'admin' ? 'Tu cuenta CRM aún no está vinculada a un perfil profesional. Vincúlala en Equipo y sucursales si también tienes citas asignadas a un perfil.' : 'Tu cuenta CRM aún no está vinculada a un perfil profesional. Pide a administración que vincule tu usuario para conectar tu calendario.'}</p>}
      </section>}

      {history.length > 0 && <div className="settings-option-list google-calendar-history"><div className="settings-option-row"><div><strong>Últimos intentos</strong><span>{history.slice(0, 5).map((item, index) => <span key={`${item.created_at}-${index}`} className="google-sync-history-item">{item.status === 'succeeded' ? 'Correcta' : item.status === 'failed' ? 'Fallida' : item.status === 'processing' ? 'En curso' : 'Pendiente'} · {formatDate(item.updated_at || item.created_at)}{item.last_error ? ` · ${item.last_error}` : ''}</span>)}</span></div><span className="settings-option-status">Historial</span></div></div>}
    </>}
  </div>;
}
