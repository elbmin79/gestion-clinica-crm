'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, CircleCheck, MessageCircle, Pencil, Save, ShieldCheck, Trash2, MessageSquareText, CalendarCheck2 } from 'lucide-react';
import { loadAvailableWhatsAppSenders, loadClinicWhatsAppSettings, saveClinicWhatsAppSettings } from './whatsapp-settings-actions.js';
import { hasClinicPermission } from '../lib/clinic-permissions.js';

const initialSettings = {
  providerMode: 'twilio',
  notifyWhatsAppMessages: true,
  notifyWhatsAppConfirmations: true,
};

function WhatsAppSettingsSkeleton() {
  return <div className="whatsapp-settings-skeleton" role="status" aria-label="Cargando configuración de WhatsApp">
    <div className="whatsapp-skeleton-banner"><span className="whatsapp-skeleton-icon"/><span className="whatsapp-skeleton-copy"><i className="whatsapp-skeleton-block"/><i className="whatsapp-skeleton-block"/></span></div>
    <div className="whatsapp-settings-summary whatsapp-skeleton-summary">
      {['Bandeja de conversaciones', 'Números conectados', 'Números asignables', 'Avisos en el CRM'].map(label => <div key={label}><span>{label}</span><i className="whatsapp-skeleton-block"/></div>)}
    </div>
    <section className="whatsapp-settings-section whatsapp-skeleton-section"><div className="whatsapp-settings-heading"><div><i className="whatsapp-skeleton-block is-title"/><i className="whatsapp-skeleton-block is-description"/></div><i className="whatsapp-skeleton-block is-action"/></div><i className="whatsapp-skeleton-block is-helper"/><div className="whatsapp-skeleton-sender"><i className="whatsapp-skeleton-block is-number"/><i className="whatsapp-skeleton-block is-branches"/><i className="whatsapp-skeleton-block is-action"/></div></section>
    <section className="whatsapp-settings-section whatsapp-skeleton-section"><div className="whatsapp-settings-heading"><div><i className="whatsapp-skeleton-block is-title"/><i className="whatsapp-skeleton-block is-description"/></div></div><div className="whatsapp-skeleton-options"><i className="whatsapp-skeleton-block is-option"/><i className="whatsapp-skeleton-block is-option"/></div></section>
    <div className="whatsapp-skeleton-actions"><i className="whatsapp-skeleton-block is-action"/></div>
  </div>;
}

export default function WhatsAppSettings({ clinicId, role, permissions = {}, branches = [], sharedMode }) {
  const canView = !sharedMode || hasClinicPermission(role, permissions, 'whatsapp.view');
  const canManage = !sharedMode || hasClinicPermission(role, permissions, 'whatsapp.manage');
  const [loading, setLoading] = useState(true);
  const [loadingAvailableSenders, setLoadingAvailableSenders] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [senderLookupError, setSenderLookupError] = useState('');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(initialSettings);
  const [senders, setSenders] = useState([]);
  const [editingAssignments, setEditingAssignments] = useState(() => new Set());
  const [availableSenders, setAvailableSenders] = useState([]);
  const [inboxSender, setInboxSender] = useState(null);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const rootRef = useRef(null);
  const baselineRef = useRef(null);
  const baselineReadyRef = useRef(false);
  const pendingNavigationRef = useRef(null);
  const replayingNavigationRef = useRef(false);
  const revertingPopstateRef = useRef(false);

  const snapshotFor = (nextSettings, nextSenders) => JSON.stringify({
    settings: {
      notifyWhatsAppMessages: nextSettings.notifyWhatsAppMessages !== false,
      notifyWhatsAppConfirmations: nextSettings.notifyWhatsAppConfirmations !== false,
    },
    senders: [...(nextSenders || [])]
      .map(sender => ({
        whatsappNumber: sender.whatsappNumber,
        active: sender.active !== false,
        branchIds: [...(sender.branchIds || [])].map(String).sort(),
      }))
      .sort((a, b) => String(a.whatsappNumber).localeCompare(String(b.whatsappNumber))),
  });
  const currentSnapshot = snapshotFor(settings, senders);
  const hasUnsavedChanges = Boolean(baselineRef.current && baselineRef.current.snapshot !== currentSnapshot);

  useEffect(() => {
    let active = true;
    baselineReadyRef.current = false;
    baselineRef.current = null;
    setLoading(true);
    setLoadingAvailableSenders(true);
    setAvailableSenders([]);
    setInboxSender(null);
    setError('');
    if (!clinicId || !sharedMode || !canView) {
      setLoading(false);
      return () => { active = false; };
    }
    loadClinicWhatsAppSettings(clinicId).then(result => {
      if (!active) return;
      if (!result.ok) setError(result.message);
      else {
        setSettings({ ...result.settings, providerMode: 'twilio' });
        setSenders(result.senders);
        setEditingAssignments(new Set());
      }
      setLoading(false);
    }).catch(() => {
      if (active) { setError('No se pudo cargar la configuración de WhatsApp.'); setLoading(false); }
    });
    if (!canManage) { setLoadingAvailableSenders(false); return () => { active = false; }; }
    loadAvailableWhatsAppSenders(clinicId).then(result => {
      if (!active) return;
      setInboxSender(result.inboxSender || null);
      if (result.ok) setAvailableSenders(result.senders);
      setSenderLookupError(result.senderLookupError || (result.ok ? '' : result.message));
      setLoadingAvailableSenders(false);
    }).catch(() => {
      if (active) { setInboxSender(null); setSenderLookupError('No se pudieron consultar los números registrados.'); setAvailableSenders([]); setLoadingAvailableSenders(false); }
    });
    return () => { active = false; };
  }, [clinicId, role, permissions, sharedMode, canView, canManage]);

  useEffect(() => {
    if (loading || loadingAvailableSenders) return;
    const retained = senders
        .filter(sender => sender.whatsappNumber || !String(sender.senderKey).startsWith('form:'))
        .filter((sender, index, rows) => rows.findIndex(row => row.whatsappNumber === sender.whatsappNumber) === index);
      const existingNumbers = new Set(retained.map(sender => sender.whatsappNumber));
      const missing = availableSenders
        .filter(sender => !existingNumbers.has(sender.phoneNumber))
        .map(sender => ({
          senderKey: `available:${sender.phoneNumber}`,
          whatsappNumber: sender.phoneNumber,
          displayLabel: sender.displayLabel || sender.phoneNumber,
          branchIds: [],
          active: true,
        }));
    const nextSenders = missing.length ? [...retained, ...missing] : retained;
    if (!baselineReadyRef.current) {
      baselineRef.current = { snapshot: snapshotFor(settings, nextSenders), settings: { ...settings }, senders: nextSenders };
      baselineReadyRef.current = true;
    }
    if (snapshotFor(settings, nextSenders) !== snapshotFor(settings, senders)) setSenders(nextSenders);
  }, [loading, loadingAvailableSenders, availableSenders, senders, settings]);

  const updateSender = (senderKey, field, value) => {
    setSenders(current => current.map(sender => sender.senderKey === senderKey
      ? { ...sender, [field]: value }
      : sender));
  };

  const persistSettings = async () => {
    setSaving(true); setError(''); setNotice('');
    const result = await saveClinicWhatsAppSettings({ clinicId, ...settings, providerMode: 'twilio', senders });
    if (!result.ok) { setError(result.message); setSaving(false); return false; }
    else {
      const nextSettings = { ...result.settings, providerMode: 'twilio' };
      baselineRef.current = { snapshot: snapshotFor(nextSettings, result.senders), settings: nextSettings, senders: result.senders };
      baselineReadyRef.current = true;
      setSettings(nextSettings);
      setSenders(result.senders);
      setEditingAssignments(new Set());
      setNotice(result.message);
    }
    setSaving(false);
    return true;
  };

  const save = async event => { event.preventDefault(); await persistSettings(); };

  const replayPendingNavigation = () => {
    const navigate = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setLeavePromptOpen(false);
    if (!navigate) return;
    replayingNavigationRef.current = true;
    navigate();
    window.setTimeout(() => { replayingNavigationRef.current = false; }, 0);
  };

  const discardChanges = () => {
    const baseline = baselineRef.current;
    if (baseline) {
      setSettings({ ...baseline.settings });
      setSenders([...baseline.senders]);
      setEditingAssignments(new Set());
      setError(''); setNotice('');
    }
    replayPendingNavigation();
  };

  useEffect(() => {
    const onNavigationClick = event => {
      if (!hasUnsavedChanges || replayingNavigationRef.current || event.defaultPrevented) return;
      const origin = event.target instanceof Element ? event.target : null;
      const control = origin?.closest('a[href], .side-nav .nav-item, .sidebar-bottom button, .settings-tabs button, .workspace-menu button, .topbar-actions .search-shortcut, .topbar-profile-button');
      if (!control || rootRef.current?.contains(control)) return;
      if (control instanceof HTMLAnchorElement && (control.target === '_blank' || control.hasAttribute('download'))) return;
      event.preventDefault();
      event.stopPropagation();
      pendingNavigationRef.current = () => {
        if (control instanceof HTMLAnchorElement) window.location.assign(control.href);
        else control.click();
      };
      setLeavePromptOpen(true);
    };
    const onBeforeUnload = event => {
      if (replayingNavigationRef.current || !hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const onPopState = event => {
      if (revertingPopstateRef.current) { revertingPopstateRef.current = false; return; }
      if (!hasUnsavedChanges || replayingNavigationRef.current) return;
      const destination = window.location.href;
      event.stopImmediatePropagation();
      revertingPopstateRef.current = true;
      window.history.forward();
      window.setTimeout(() => { revertingPopstateRef.current = false; }, 500);
      pendingNavigationRef.current = () => window.location.assign(destination);
      setLeavePromptOpen(true);
    };
    document.addEventListener('click', onNavigationClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState, true);
    return () => {
      document.removeEventListener('click', onNavigationClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState, true);
    };
  }, [hasUnsavedChanges]);

  if (!sharedMode || !clinicId) {
    return <div className="whatsapp-settings-content"><header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Asigna números y elige qué avisos internos recibir en el CRM.</p></header><div className="whatsapp-settings-pending-notice"><ShieldCheck size={18}/><div><strong>Configuración no disponible</strong><span>Conecta una clínica compartida para administrar los números y avisos.</span></div></div></div>;
  }
  if (!canManage) {
    return <div className="whatsapp-settings-content"><header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Asigna números y elige qué avisos internos recibir en el CRM.</p></header><div className="whatsapp-settings-pending-notice"><ShieldCheck size={18}/><div><strong>Solo lectura</strong><span>Puedes consultar la configuración; solicita a una persona con permisos que la cambie.</span></div></div></div>;
  }

  const validSender = sender => sender.active
    && availableSenders.some(available => available.phoneNumber === sender.whatsappNumber)
    && sender.branchIds?.length > 0;
  const readySenderCount = senders.filter(validSender).length;
  const isInitialLoading = loading || loadingAvailableSenders;
  const connectedNumbers = new Set([
    inboxSender?.phoneNumber,
    ...availableSenders.map(sender => sender.phoneNumber),
  ].filter(Boolean));
  const inboxConnected = connectedNumbers.size > 0;
  const crmNotificationsEnabled = settings.notifyWhatsAppMessages || settings.notifyWhatsAppConfirmations;

  return <div className="whatsapp-settings-content" ref={rootRef} aria-busy={loading || saving || loadingAvailableSenders}>
    <header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Asigna números y elige qué avisos internos recibir en el CRM.</p></header>
    {isInitialLoading ? <WhatsAppSettingsSkeleton/> : <>
    {inboxConnected ? <div className="whatsapp-settings-connection-notice"><MessageCircle size={18}/><div><strong>La bandeja de conversaciones está conectada</strong><span>Administra aquí los números y las sucursales que los usan. Los avisos seleccionados aparecerán en el centro de notificaciones del CRM.</span></div></div>
      : <div className="whatsapp-settings-pending-notice"><ShieldCheck size={18}/><div><strong>Configura WhatsApp</strong><span>Vincula los números a sus sucursales y configura los avisos internos del CRM.</span></div></div>}
    <div className="whatsapp-settings-summary"><div><span>Bandeja de conversaciones</span><strong>{inboxConnected ? 'Conectada' : 'No conectada'}</strong></div><div><span>Números conectados</span><strong>{connectedNumbers.size}</strong></div><div><span>Números asignables</span><strong>{availableSenders.length ? `${readySenderCount} de ${availableSenders.length} asignados` : 'Sin números disponibles para asignar'}</strong></div><div><span>Avisos en el CRM</span><strong>{crmNotificationsEnabled ? 'Activados' : 'Desactivados'}</strong></div></div>
    <form className="whatsapp-settings-form" onSubmit={save}>
      <section className="whatsapp-settings-section"><div className="whatsapp-settings-heading"><div><h3>Números de WhatsApp</h3><p>Asigna un número a una o varias sucursales.</p></div></div>
        <p className="whatsapp-settings-helper">Pulsa «Editar sucursales» para cambiar dónde se usa cada número.</p>
        {senderLookupError && <p className="whatsapp-settings-error" role="status"><CircleAlert size={15}/>{senderLookupError}</p>}
        {!senderLookupError && !loadingAvailableSenders && availableSenders.length === 0 && <p className="whatsapp-settings-empty">No se encontraron números de WhatsApp disponibles para asignar.</p>}
        {senders.length ? <div className="whatsapp-sender-list">{senders.map(sender => {
          const isEditing = editingAssignments.has(sender.senderKey);
          const assignedBranches = branches.filter(branch => sender.branchIds?.includes(branch.id));
          return <article className={`whatsapp-sender-row${isEditing ? ' is-editing' : ''}`} key={sender.senderKey}>
            <div className="whatsapp-sender-row-heading">
              <div className="whatsapp-sender-label"><span>Número de WhatsApp</span><strong>{sender.whatsappNumber || sender.displayLabel}</strong></div>
              <button className="button outline compact whatsapp-assignment-edit" type="button" aria-pressed={isEditing} onClick={() => setEditingAssignments(current => { const next = new Set(current); if (next.has(sender.senderKey)) next.delete(sender.senderKey); else next.add(sender.senderKey); return next; })}>{isEditing ? <><Check size={14}/> Listo</> : <><Pencil size={14}/> Editar sucursales</>}</button>
              {!availableSenders.some(item => item.phoneNumber === sender.whatsappNumber) && <button className="icon-button outline" type="button" aria-label={`Quitar el número no disponible ${sender.whatsappNumber}`} onClick={() => setSenders(current => current.filter(item => item.senderKey !== sender.senderKey))}><Trash2 size={15}/></button>}
            </div>
            <div className="whatsapp-branch-assignments">
              <div className="whatsapp-branch-assignments-heading"><strong>Sucursales</strong></div>
              {isEditing ? <fieldset className="whatsapp-branch-checklist" aria-label={`Sucursales asignadas a ${sender.whatsappNumber || sender.displayLabel}`}>
                {branches.map(branch => {
                  const checked = sender.branchIds?.includes(branch.id) || false;
                  const assignedElsewhere = senders.some(other => other.senderKey !== sender.senderKey && other.branchIds?.includes(branch.id));
                  return <label key={branch.id} className={assignedElsewhere && !checked ? 'is-unavailable' : ''}><input type="checkbox" checked={checked} disabled={assignedElsewhere && !checked} onChange={event => updateSender(sender.senderKey, 'branchIds', event.target.checked ? [...(sender.branchIds || []), branch.id] : (sender.branchIds || []).filter(id => id !== branch.id))}/><span>{branch.name}</span>{assignedElsewhere && !checked && <small>Asignada a otro número</small>}</label>;
                })}
              </fieldset> : <div className="whatsapp-assigned-branches">{assignedBranches.length ? assignedBranches.map(branch => <span className="whatsapp-branch-chip" key={branch.id}>{branch.name}</span>) : <span className="whatsapp-branch-empty">Pulsa «Editar sucursales» para elegir dónde se usará este número.</span>}</div>}
            </div>
          </article>})}</div> : null}
      </section>
      <section className="whatsapp-settings-section"><div className="whatsapp-settings-heading"><div><h3>Avisos dentro del CRM</h3><p>Elige qué actividad de WhatsApp debe aparecer en el centro de notificaciones.</p></div></div>
        <div className="whatsapp-crm-notification-options">
          <label className="whatsapp-crm-notification-option"><span className="whatsapp-crm-notification-icon"><MessageSquareText size={17}/></span><span><strong>Nuevos mensajes</strong><small>Recibir un aviso cuando llegue un mensaje nuevo a la bandeja.</small></span><input type="checkbox" checked={settings.notifyWhatsAppMessages} onChange={event => setSettings(current => ({ ...current, notifyWhatsAppMessages: event.target.checked }))}/></label>
          <label className="whatsapp-crm-notification-option"><span className="whatsapp-crm-notification-icon"><CalendarCheck2 size={17}/></span><span><strong>Confirmaciones de citas</strong><small>Recibir un aviso cuando un paciente confirme su cita por WhatsApp.</small></span><input type="checkbox" checked={settings.notifyWhatsAppConfirmations} onChange={event => setSettings(current => ({ ...current, notifyWhatsAppConfirmations: event.target.checked }))}/></label>
        </div>
      </section>
      {error && <p className="whatsapp-settings-error" role="alert"><CircleAlert size={15}/>{error}</p>}{notice && <p className="whatsapp-settings-success" role="status"><CircleCheck size={15}/>{notice}</p>}
      <div className="whatsapp-settings-actions"><button className="button primary" type="submit" disabled={saving || loading || !hasUnsavedChanges}><Save size={15}/>{saving ? 'Guardando…' : 'Guardar configuración'}</button></div>
    </form>
    </>}
    {leavePromptOpen && <div className="whatsapp-unsaved-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { pendingNavigationRef.current = null; setLeavePromptOpen(false); } }} onKeyDown={event => { if (event.key === 'Escape') { pendingNavigationRef.current = null; setLeavePromptOpen(false); } }}>
      <section className="whatsapp-unsaved-dialog" role="alertdialog" aria-modal="true" aria-labelledby="whatsapp-unsaved-title" aria-describedby="whatsapp-unsaved-description">
        <span className="whatsapp-unsaved-icon"><CircleAlert size={19}/></span>
        <h2 id="whatsapp-unsaved-title">Tienes cambios sin guardar</h2>
        <p id="whatsapp-unsaved-description">Guarda tus cambios antes de salir de la configuración de WhatsApp.</p>
        {error && <p className="whatsapp-settings-error" role="alert">{error}</p>}
        <div className="whatsapp-unsaved-actions">
          <button type="button" className="button outline compact" onClick={() => { pendingNavigationRef.current = null; setLeavePromptOpen(false); }}>Seguir editando</button>
          <button type="button" className="button secondary compact" disabled={saving} onClick={discardChanges}>Descartar y salir</button>
          <button type="button" className="button primary compact" disabled={saving} onClick={async () => { if (await persistSettings()) replayPendingNavigation(); }}>{saving ? 'Guardando…' : 'Guardar y salir'}</button>
        </div>
      </section>
    </div>}
  </div>;
}
