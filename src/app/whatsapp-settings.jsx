'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, MessageCircle, Save, ShieldCheck, Trash2 } from 'lucide-react';
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

  useEffect(() => {
    if (loading || loadingAvailableSenders) return;
    setSenders(current => {
      const retained = current
        .filter(sender => sender.whatsappNumber || !String(sender.senderKey).startsWith('form:'))
        .filter((sender, index, rows) => rows.findIndex(row => row.whatsappNumber === sender.whatsappNumber) === index);
      const existingNumbers = new Set(retained.map(sender => sender.whatsappNumber));
      const missing = availableSenders
        .filter(sender => !existingNumbers.has(sender.phoneNumber))
        .map(sender => ({
          senderKey: `available:${sender.phoneNumber}`,
          whatsappNumber: sender.phoneNumber,
          displayLabel: sender.displayLabel || sender.phoneNumber,
          branchId: '',
          active: true,
        }));
      return missing.length || retained.length !== current.length ? [...retained, ...missing] : current;
    });
  }, [loading, loadingAvailableSenders, availableSenders]);

  const updateSender = (senderKey, field, value) => {
    setSenders(current => current.map(sender => sender.senderKey === senderKey
      ? { ...sender, [field]: value }
      : sender));
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
  const connectedInboxNumber = inboxSender?.phoneNumber || senders.find(sender => sender.active && sender.branchId)?.whatsappNumber || '';
  const whatsappReady = deliveryEnabled && readySenderCount > 0
    && templateKinds.some(([kind]) => settings.templateReadiness[kind] && availableTemplates[kind]);

  return <div className="whatsapp-settings-content" aria-busy={loading || saving || loadingAvailableSenders}>
    <header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Configura confirmaciones y recordatorios de citas.</p></header>
    {connectedInboxNumber ? <div className="whatsapp-settings-connection-notice"><MessageCircle size={18}/><div><strong>La bandeja de conversaciones está conectada</strong><span>La bandeja recibe y responde mensajes con {connectedInboxNumber}.{whatsappReady ? ' Los avisos automáticos de citas también están configurados.' : ' Para activar avisos automáticos, asigna un número activo a cada sucursal y configura plantillas aprobadas.'}</span></div></div>
      : <div className={whatsappReady ? 'whatsapp-settings-live-notice' : 'whatsapp-settings-pending-notice'}><ShieldCheck size={18}/><div><strong>{whatsappReady ? 'Notificaciones configuradas' : 'Configura tus notificaciones'}</strong><span>Vincula remitentes ya registrados y activa las plantillas aprobadas que usarás para citas.</span></div></div>}
    <div className="whatsapp-settings-summary"><div><span>Bandeja de conversaciones</span><strong>{loading ? 'Cargando…' : connectedInboxNumber ? 'Conectada' : 'No conectada'}</strong></div><div><span>Número conectado</span><strong>{loading ? '—' : connectedInboxNumber || 'Sin configurar'}</strong></div><div><span>Números asignables</span><strong>{loading || loadingAvailableSenders ? 'Cargando…' : availableSenders.length ? `${readySenderCount} de ${availableSenders.length} asignados` : 'Sin números disponibles para asignar'}</strong></div><div><span>Avisos automáticos de citas</span><strong>{loading ? 'Cargando…' : whatsappReady ? 'Activos' : 'En configuración'}</strong></div></div>
    {loading ? <p className="whatsapp-settings-loading"><LoaderCircle size={16}/> Cargando configuración…</p> : <form className="whatsapp-settings-form" onSubmit={save}>
      <section className="whatsapp-settings-section"><div className="whatsapp-settings-heading"><div><h3>Números de WhatsApp</h3><p>Asigna cada número disponible a su sucursal.</p></div></div>
        <p className="whatsapp-settings-helper">Asigna el número conectado a la sucursal que lo usará. Puedes cambiar esta asignación después.</p>
        {connectedInboxNumber && <div className="whatsapp-connected-number-row"><span><MessageCircle size={16}/></span><div><strong>Número conectado a la bandeja</strong><small>{connectedInboxNumber} · Recibe y responde conversaciones</small></div><b>Conectado</b></div>}
        {senderLookupError && <p className="whatsapp-settings-error" role="status"><CircleAlert size={15}/>{senderLookupError}</p>}
        {!senderLookupError && !loadingAvailableSenders && availableSenders.length === 0 && <p className="whatsapp-settings-empty">No se encontraron números de WhatsApp disponibles para asignar.</p>}
        {senders.length ? <div className="whatsapp-sender-list">{senders.map(sender => <div className="whatsapp-sender-row" key={sender.senderKey}>
          <div className="whatsapp-sender-label"><span>Número de WhatsApp</span><strong>{sender.whatsappNumber || sender.displayLabel}</strong></div>
          <label className="whatsapp-sender-branch">Sucursal<select value={sender.branchId} onChange={event => updateSender(sender.senderKey, 'branchId', event.target.value)} required><option value="">Selecciona una sucursal</option>{branches.map(branch => <option key={branch.id} value={branch.id} disabled={senders.some(other => other.senderKey !== sender.senderKey && other.branchId === branch.id)}>{branch.name}</option>)}</select></label>
          {!availableSenders.some(item => item.phoneNumber === sender.whatsappNumber) && <button className="icon-button outline" type="button" aria-label={`Quitar el número no disponible ${sender.whatsappNumber}`} onClick={() => setSenders(current => current.filter(item => item.senderKey !== sender.senderKey))}><Trash2 size={15}/></button>}
        </div>)}</div> : null}
      </section>
      <section className="whatsapp-settings-section"><div className="whatsapp-settings-heading"><div><h3>Plantillas aprobadas</h3><p>El estado se consulta automáticamente. Las plantillas activas se usan para avisos automáticos de citas.</p></div></div><div className="whatsapp-template-list">{templateKinds.map(([key, label]) => <label key={key}><input type="checkbox" disabled={!availableTemplates[key]} checked={settings.templateReadiness[key] === true && availableTemplates[key] === true} onChange={event => setSettings(current => ({ ...current, templateReadiness: { ...current.templateReadiness, [key]: event.target.checked } }))}/><span className="whatsapp-template-copy"><strong>{label}</strong><small>{templateStatusLabels[templateStatuses[key]] || templateStatusLabels.unavailable}</small></span></label>)}</div></section>
      {error && <p className="whatsapp-settings-error" role="alert"><CircleAlert size={15}/>{error}</p>}{notice && <p className="whatsapp-settings-success" role="status"><CircleCheck size={15}/>{notice}</p>}
      <div className="whatsapp-settings-actions"><button className="button primary" type="submit" disabled={saving || loading}><Save size={15}/>{saving ? 'Guardando…' : 'Guardar configuración'}</button></div>
    </form>}
  </div>;
}
