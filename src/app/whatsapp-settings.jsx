'use client';

import { useEffect, useState } from 'react';
import { Check, CircleAlert, CircleCheck, LoaderCircle, MessageCircle, Pencil, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { loadAvailableWhatsAppSenders, loadClinicWhatsAppSettings, saveClinicWhatsAppSettings } from './whatsapp-settings-actions.js';

const templateKinds = [
  ['confirmation_2d', 'Confirmación · 2 días antes'],
  ['reminder_1d', 'Recordatorio · 1 día antes'],
  ['reminder_5h', 'Recordatorio · 5 horas antes'],
];

const initialSettings = {
  providerMode: 'twilio',
  templateReadiness: { confirmation_2d: false, reminder_1d: false, reminder_5h: false },
  templateContentSids: {},
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
  const [editingAssignments, setEditingAssignments] = useState(() => new Set());
  const [availableSenders, setAvailableSenders] = useState([]);
  const [inboxSender, setInboxSender] = useState(null);
  const [templates, setTemplates] = useState([]);
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
        setEditingAssignments(new Set());
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
      setTemplates(result.templates || []);
      setDeliveryEnabled(result.deliveryEnabled === true);
      setLoadingAvailableSenders(false);
    }).catch(() => {
      if (active) { setInboxSender(null); setSenderLookupError('No se pudieron consultar los números registrados.'); setAvailableSenders([]); setTemplates([]); setDeliveryEnabled(false); setLoadingAvailableSenders(false); }
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
          branchIds: [],
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
    const templateReadiness = Object.fromEntries(templateKinds.map(([kind]) => [kind,
      settings.templateReadiness[kind] === true && templates.some(template => template.status === 'approved' && template.sid === settings.templateContentSids?.[kind]),
    ]));
    const result = await saveClinicWhatsAppSettings({ clinicId, ...settings, providerMode: 'twilio', templateReadiness, senders });
    if (!result.ok) setError(result.message);
    else {
      setSettings({ ...result.settings, providerMode: 'twilio' });
      setSenders(result.senders);
      setEditingAssignments(new Set());
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
    && sender.branchIds?.length > 0;
  const readySenderCount = senders.filter(validSender).length;
  const connectedNumbers = new Set([
    inboxSender?.phoneNumber,
    ...availableSenders.map(sender => sender.phoneNumber),
  ].filter(Boolean));
  const inboxConnected = connectedNumbers.size > 0;
  const approvedTemplates = templates.filter(template => template.status === 'approved');
  const whatsappReady = deliveryEnabled && readySenderCount > 0
    && templateKinds.some(([kind]) => settings.templateReadiness[kind] && approvedTemplates.some(template => template.sid === settings.templateContentSids?.[kind]));

  return <div className="whatsapp-settings-content" aria-busy={loading || saving || loadingAvailableSenders}>
    <header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Configura confirmaciones y recordatorios de citas.</p></header>
    {inboxConnected ? <div className="whatsapp-settings-connection-notice"><MessageCircle size={18}/><div><strong>La bandeja de conversaciones está conectada</strong><span>Administra aquí los números que reciben y responden mensajes desde la bandeja.{whatsappReady ? ' Los avisos automáticos de citas también están configurados.' : ' Para activar avisos automáticos, asigna números a las sucursales y configura plantillas aprobadas.'}</span></div></div>
      : <div className={whatsappReady ? 'whatsapp-settings-live-notice' : 'whatsapp-settings-pending-notice'}><ShieldCheck size={18}/><div><strong>{whatsappReady ? 'Notificaciones configuradas' : 'Configura tus notificaciones'}</strong><span>Vincula remitentes ya registrados y activa las plantillas aprobadas que usarás para citas.</span></div></div>}
    <div className="whatsapp-settings-summary"><div><span>Bandeja de conversaciones</span><strong>{loading || loadingAvailableSenders ? 'Cargando…' : inboxConnected ? 'Conectada' : 'No conectada'}</strong></div><div><span>Números conectados</span><strong>{loadingAvailableSenders ? 'Cargando…' : connectedNumbers.size}</strong></div><div><span>Números asignables</span><strong>{loading || loadingAvailableSenders ? 'Cargando…' : availableSenders.length ? `${readySenderCount} de ${availableSenders.length} asignados` : 'Sin números disponibles para asignar'}</strong></div><div><span>Avisos automáticos de citas</span><strong>{loading ? 'Cargando…' : whatsappReady ? 'Activos' : 'En configuración'}</strong></div></div>
    {loading ? <p className="whatsapp-settings-loading"><LoaderCircle size={16}/> Cargando configuración…</p> : <form className="whatsapp-settings-form" onSubmit={save}>
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
      <section className="whatsapp-settings-section"><div className="whatsapp-settings-heading"><div><h3>Avisos automáticos de citas</h3><p>Elige una plantilla aprobada por WhatsApp para cada aviso. La lista se carga desde tu cuenta.</p></div></div>{!deliveryEnabled ? <p className="whatsapp-settings-empty">No se pudieron consultar las plantillas de Twilio. Revisa las credenciales del servidor.</p> : approvedTemplates.length === 0 ? <p className="whatsapp-settings-empty">No hay plantillas aprobadas disponibles en la cuenta.</p> : <div className="whatsapp-template-list">{templateKinds.map(([key, label]) => <div className="whatsapp-template-row" key={key}><label className="whatsapp-template-toggle"><input type="checkbox" disabled={!settings.templateContentSids?.[key] || !approvedTemplates.some(template => template.sid === settings.templateContentSids[key])} checked={settings.templateReadiness[key] === true && approvedTemplates.some(template => template.sid === settings.templateContentSids?.[key])} onChange={event => setSettings(current => ({ ...current, templateReadiness: { ...current.templateReadiness, [key]: event.target.checked } }))}/><span><strong>{label}</strong><small>{settings.templateReadiness[key] ? 'Activo' : 'Desactivado'}</small></span></label><select aria-label={`Plantilla para ${label}`} value={settings.templateContentSids?.[key] || ''} onChange={event => setSettings(current => ({ ...current, templateContentSids: { ...current.templateContentSids, [key]: event.target.value }, templateReadiness: { ...current.templateReadiness, [key]: false } }))}><option value="">Selecciona una plantilla aprobada</option>{approvedTemplates.map(template => <option value={template.sid} key={template.sid}>{template.name}{template.language ? ` · ${template.language}` : ''}</option>)}</select></div>)}</div>}</section>
      {error && <p className="whatsapp-settings-error" role="alert"><CircleAlert size={15}/>{error}</p>}{notice && <p className="whatsapp-settings-success" role="status"><CircleCheck size={15}/>{notice}</p>}
      <div className="whatsapp-settings-actions"><button className="button primary" type="submit" disabled={saving || loading}><Save size={15}/>{saving ? 'Guardando…' : 'Guardar configuración'}</button></div>
    </form>}
  </div>;
}
