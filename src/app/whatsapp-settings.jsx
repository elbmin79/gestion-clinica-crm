'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, MessageCircle, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { loadAvailableWhatsAppSenders, loadClinicWhatsAppSettings, saveClinicWhatsAppSettings } from './whatsapp-settings-actions.js';

const templateKinds = [
  ['confirmation_2d', 'Confirmación · 2 días antes'],
  ['reminder_1d', 'Recordatorio · 1 día antes'],
  ['reminder_5h', 'Recordatorio · 5 horas antes'],
];

const initialSettings = {
  providerMode: 'twilio',
  templateReadiness: { confirmation_2d: false, reminder_1d: false, reminder_5h: false },
};
const initialAvailableTemplates = { confirmation_2d: false, reminder_1d: false, reminder_5h: false };
const initialTemplateStatuses = { confirmation_2d: 'not_configured', reminder_1d: 'not_configured', reminder_5h: 'not_configured' };
const templateStatusLabels = {
  approved: 'Aprobada',
  received: 'Enviada para revisión',
  pending: 'En revisión',
  rejected: 'Rechazada',
  paused: 'Pausada',
  disabled: 'Desactivada',
  not_configured: 'Falta configurar el identificador',
  unavailable: 'No se pudo verificar',
};

export default function WhatsAppSettings({ clinicId, role, branches = [], sharedMode }) {
  const [loading, setLoading] = useState(true);
  const [loadingAvailableSenders, setLoadingAvailableSenders] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [senderLookupError, setSenderLookupError] = useState('');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(initialSettings);
  const [senders, setSenders] = useState([]);
  const [availableSenders, setAvailableSenders] = useState([]);
  const [inboxSender, setInboxSender] = useState(null);
  const [availableTemplates, setAvailableTemplates] = useState(initialAvailableTemplates);
  const [templateStatuses, setTemplateStatuses] = useState(initialTemplateStatuses);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (!clinicId || !sharedMode || role !== 'admin') {
      setLoading(false);
      return () => { active = false; };
    }
    loadClinicWhatsAppSettings(clinicId).then(result => {
      if (!active) return;
      if (!result.ok) setError(result.message);
      else {
        setSettings({ ...result.settings, providerMode: 'twilio' });
        setSenders(result.senders);
      }
      setLoading(false);
    }).catch(() => {
      if (active) { setError('No se pudo cargar la configuración de WhatsApp.'); setLoading(false); }
    });
    loadAvailableWhatsAppSenders(clinicId).then(result => {
      if (!active) return;
      setInboxSender(result.inboxSender || null);
      if (result.ok) setAvailableSenders(result.senders);
      else setSenderLookupError(result.message);
      setAvailableTemplates(result.availableTemplates || initialAvailableTemplates);
      setTemplateStatuses({ ...initialTemplateStatuses, ...(result.templateStatuses || {}) });
      setDeliveryEnabled(result.deliveryEnabled === true);
      setLoadingAvailableSenders(false);
    }).catch(() => {
      if (active) { setInboxSender(null); setSenderLookupError('No se pudieron consultar los números registrados.'); setAvailableSenders([]); setAvailableTemplates(initialAvailableTemplates); setTemplateStatuses(initialTemplateStatuses); setDeliveryEnabled(false); setLoadingAvailableSenders(false); }
    });
    return () => { active = false; };
  }, [clinicId, role, sharedMode]);

  const updateSender = (senderKey, field, value) => {
    setSenders(current => current.map(sender => sender.senderKey === senderKey
      ? { ...sender, [field]: value }
      : sender));
  };

  const addSender = () => {
    const senderKey = `form:${globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10)}`;
    setSenders(current => [...current, { senderKey, whatsappNumber: '', displayLabel: `WhatsApp ${current.length + 1}`, branchId: '', active: true }]);
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    const templateReadiness = Object.fromEntries(templateKinds.map(([kind]) => [kind, settings.templateReadiness[kind] === true && availableTemplates[kind] === true]));
    const result = await saveClinicWhatsAppSettings({ clinicId, ...settings, providerMode: 'twilio', templateReadiness, senders });
    if (!result.ok) setError(result.message);
    else {
      setSettings({ ...result.settings, providerMode: 'twilio' });
      setSenders(result.senders);
      setNotice(result.message);
    }
    setSaving(false);
  };

  if (!sharedMode || !clinicId) {
    return <div className="whatsapp-settings-content"><header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Configura confirmaciones y recordatorios de citas.</p></header><div className="whatsapp-settings-pending-notice"><ShieldCheck size={18}/><div><strong>Configuración no disponible</strong><span>Conecta una clínica compartida para guardar los números y plantillas de WhatsApp.</span></div></div></div>;
  }
  if (role !== 'admin') {
    return <div className="whatsapp-settings-content"><header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Configura confirmaciones y recordatorios de citas.</p></header><div className="whatsapp-settings-pending-notice"><ShieldCheck size={18}/><div><strong>Configuración solo para administración</strong><span>Una persona administradora de la clínica puede configurar los números y plantillas.</span></div></div></div>;
  }

  const validSender = sender => sender.active
    && availableSenders.some(available => available.phoneNumber === sender.whatsappNumber)
    && sender.branchId;
  const readySenderCount = senders.filter(validSender).length;
  const connectedInboxNumber = senders.find(sender => sender.active && sender.branchId)?.whatsappNumber || inboxSender?.phoneNumber || '';
  const whatsappReady = deliveryEnabled && readySenderCount > 0
    && templateKinds.some(([kind]) => settings.templateReadiness[kind] && availableTemplates[kind]);

  return <div className="whatsapp-settings-content" aria-busy={loading || saving || loadingAvailableSenders}>
    <header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Configura confirmaciones y recordatorios de citas.</p></header>
    {connectedInboxNumber ? <div className="whatsapp-settings-connection-notice"><MessageCircle size={18}/><div><strong>La bandeja de conversaciones está conectada</strong><span>La bandeja recibe y responde mensajes con {connectedInboxNumber}.{whatsappReady ? ' Los avisos automáticos de citas también están configurados.' : ' Para activar avisos automáticos, asigna un número activo a cada sucursal y configura plantillas aprobadas.'}</span></div></div>
      : <div className={whatsappReady ? 'whatsapp-settings-live-notice' : 'whatsapp-settings-pending-notice'}><ShieldCheck size={18}/><div><strong>{whatsappReady ? 'Notificaciones configuradas' : 'Configura tus notificaciones'}</strong><span>Vincula remitentes ya registrados y activa las plantillas aprobadas que usarás para citas.</span></div></div>}
    <div className="whatsapp-settings-summary"><div><span>Bandeja de conversaciones</span><strong>{loading ? 'Cargando…' : connectedInboxNumber ? 'Conectada' : 'No conectada'}</strong></div><div><span>Número conectado</span><strong>{loading ? '—' : connectedInboxNumber || 'Sin configurar'}</strong></div><div><span>Números asignables</span><strong>{loading || loadingAvailableSenders ? 'Cargando…' : availableSenders.length ? `${readySenderCount} de ${availableSenders.length} asignados` : 'Sin números disponibles para asignar'}</strong></div><div><span>Avisos automáticos de citas</span><strong>{loading ? 'Cargando…' : whatsappReady ? 'Activos' : 'En configuración'}</strong></div></div>
    {loading ? <p className="whatsapp-settings-loading"><LoaderCircle size={16}/> Cargando configuración…</p> : <form className="whatsapp-settings-form" onSubmit={save}>
      <section className="whatsapp-settings-section"><div className="whatsapp-settings-heading"><div><h3>Números de WhatsApp</h3><p>Asigna a cada sucursal el número que usará para responder y enviar avisos.</p></div>{availableSenders.length > 0 && <button className="button outline compact" type="button" onClick={addSender}><Plus size={15}/> Vincular remitente</button>}</div>
        <p className="whatsapp-settings-helper">Aquí eliges números de WhatsApp activos y asignas cada uno a una sucursal. Cada sucursal necesita su propio número para los avisos automáticos.</p>
        {connectedInboxNumber && <div className="whatsapp-connected-number-row"><span><MessageCircle size={16}/></span><div><strong>Número conectado a la bandeja</strong><small>{connectedInboxNumber} · Recibe y responde conversaciones</small></div><b>Conectado</b></div>}
        {senderLookupError && <p className="whatsapp-settings-error" role="status"><CircleAlert size={15}/>{senderLookupError}</p>}
        {!senderLookupError && !loadingAvailableSenders && availableSenders.length === 0 && <p className="whatsapp-settings-empty">{connectedInboxNumber ? 'El número conectado a la bandeja recibe y responde mensajes, pero no está disponible para asignarlo a una sucursal. Los números asignables aparecerán aquí cuando estén activos para WhatsApp.' : 'No hay números disponibles para asignar. Cuando haya un número activo para WhatsApp, aparecerá aquí.'}</p>}
        {senders.length ? <div className="whatsapp-sender-list">{senders.map((sender, index) => <div className="whatsapp-sender-row" key={sender.senderKey}>
          <label className="whatsapp-sender-label">Etiqueta<input maxLength={120} value={sender.displayLabel} onChange={event => updateSender(sender.senderKey, 'displayLabel', event.target.value)} placeholder={`Número WhatsApp ${index + 1}`} required/></label>
          <label className="whatsapp-sender-address">Número registrado<select value={sender.whatsappNumber || ''} onChange={event => updateSender(sender.senderKey, 'whatsappNumber', event.target.value)} required><option value="">Selecciona un número activo</option>{sender.whatsappNumber && !availableSenders.some(item => item.phoneNumber === sender.whatsappNumber) && <option value={sender.whatsappNumber}>{sender.whatsappNumber} · no disponible</option>}{availableSenders.map(item => <option key={item.phoneNumber} value={item.phoneNumber}>{item.phoneNumber}</option>)}</select></label>
          <label className="whatsapp-sender-branch">Sucursal<select value={sender.branchId} onChange={event => updateSender(sender.senderKey, 'branchId', event.target.value)} required><option value="">Selecciona una sucursal</option>{branches.map(branch => <option key={branch.id} value={branch.id} disabled={senders.some(other => other.senderKey !== sender.senderKey && other.branchId === branch.id)}>{branch.name}</option>)}</select></label>
          <button className="icon-button outline" type="button" aria-label={`Quitar ${sender.displayLabel || `número ${index + 1}`}`} onClick={() => setSenders(current => current.filter(item => item.senderKey !== sender.senderKey))}><Trash2 size={15}/></button>
        </div>)}</div> : availableSenders.length > 0 && <p className="whatsapp-settings-empty">Aún no hay remitentes vinculados. Selecciona uno para asignarlo a una sucursal.</p>}
      </section>
      <section className="whatsapp-settings-section"><div className="whatsapp-settings-heading"><div><h3>Plantillas aprobadas</h3><p>El estado se consulta automáticamente. Las plantillas activas se usan para avisos automáticos de citas.</p></div></div><div className="whatsapp-template-list">{templateKinds.map(([key, label]) => <label key={key}><input type="checkbox" disabled={!availableTemplates[key]} checked={settings.templateReadiness[key] === true && availableTemplates[key] === true} onChange={event => setSettings(current => ({ ...current, templateReadiness: { ...current.templateReadiness, [key]: event.target.checked } }))}/><span className="whatsapp-template-copy"><strong>{label}</strong><small>{templateStatusLabels[templateStatuses[key]] || templateStatusLabels.unavailable}</small></span></label>)}</div></section>
      {error && <p className="whatsapp-settings-error" role="alert"><CircleAlert size={15}/>{error}</p>}{notice && <p className="whatsapp-settings-success" role="status"><CircleCheck size={15}/>{notice}</p>}
      <div className="whatsapp-settings-actions"><button className="button primary" type="submit" disabled={saving || loading}><Save size={15}/>{saving ? 'Guardando…' : 'Guardar configuración'}</button></div>
    </form>}
  </div>;
}
