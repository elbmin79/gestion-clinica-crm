'use client';

import { useEffect, useState } from 'react';
import { Check, CircleAlert, CircleCheck, CircleHelp, LoaderCircle, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { dispatchClinicWhatsAppMockTest, loadClinicWhatsAppSettings, saveClinicWhatsAppSettings } from './whatsapp-settings-actions.js';

const templateKinds = [
  ['confirmation_2d', 'Confirmación · 2 días antes'],
  ['reminder_1d', 'Recordatorio · 1 día antes'],
  ['reminder_5h', 'Recordatorio · 5 horas antes'],
];

const initialSettings = {
  allowDefaultFallback: false,
  templateReadiness: { confirmation_2d: false, reminder_1d: false, reminder_5h: false },
};

function outcomeLabel(status) {
  if (status === 'accepted') return 'Aceptado · simulado';
  if (status === 'failed') return 'Falló · simulado';
  return 'Resultado incierto · simulado';
}

export default function WhatsAppSettings({ clinicId, role, branches = [], sharedMode }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [configured, setConfigured] = useState(false);
  const [settings, setSettings] = useState(initialSettings);
  const [senders, setSenders] = useState([]);
  const [testBranchId, setTestBranchId] = useState('');
  const [testKind, setTestKind] = useState('reminder_1d');
  const [testOutcome, setTestOutcome] = useState('accepted');
  const [testResult, setTestResult] = useState(null);

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
        setConfigured(result.configured);
        setSettings(result.settings);
        setSenders(result.senders);
      }
      setLoading(false);
    }).catch(() => {
      if (active) { setError('No se pudo cargar la configuración de WhatsApp.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [clinicId, role, sharedMode]);

  const updateSender = (senderKey, field, value) => {
    setSenders(current => current.map(sender => sender.senderKey === senderKey
      ? { ...sender, [field]: value }
      : field === 'isDefault' && value ? { ...sender, isDefault: false } : sender));
    setTestResult(null);
  };

  const addSender = () => {
    const senderKey = `mock:sender-${globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10)}`;
    setSenders(current => [...current, { senderKey, displayLabel: `Número simulado ${current.length + 1}`, branchId: '', isDefault: current.length === 0, active: true }]);
    setTestResult(null);
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice(''); setTestResult(null);
    const result = await saveClinicWhatsAppSettings({ clinicId, ...settings, senders });
    if (!result.ok) setError(result.message);
    else {
      setConfigured(result.configured);
      setSettings(result.settings);
      setSenders(result.senders);
      setNotice(result.message);
    }
    setSaving(false);
  };

  const runTest = async () => {
    setTesting(true); setError(''); setNotice(''); setTestResult(null);
    const result = await dispatchClinicWhatsAppMockTest({ clinicId, branchId: testBranchId || null, templateKind: testKind, outcome: testOutcome });
    if (!result.ok) setError(result.message);
    else setTestResult(result);
    setTesting(false);
  };

  if (!sharedMode || !clinicId) {
    return <div className="whatsapp-settings-content"><header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Configura confirmaciones y recordatorios de citas en modo de prueba.</p></header><div className="whatsapp-simulated-notice"><ShieldCheck size={18}/><div><strong>Modo de prueba</strong><span>La configuración de remitentes requiere una clínica compartida con Supabase. Aquí no se conecta a WhatsApp ni se envían mensajes.</span></div></div></div>;
  }
  if (role !== 'admin') {
    return <div className="whatsapp-settings-content"><header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Configura confirmaciones y recordatorios de citas en modo de prueba.</p></header><div className="whatsapp-simulated-notice"><ShieldCheck size={18}/><div><strong>Configuración solo para administración</strong><span>Una persona administradora de la clínica puede revisar y operar el modo simulado.</span></div></div></div>;
  }

  const statusLabel = configured ? 'Modo de prueba' : 'Sin conectar';
  const readySenderCount = senders.filter(sender => sender.active && (sender.branchId || sender.isDefault)).length;

  return <div className="whatsapp-settings-content" aria-busy={loading || saving || testing}>
    <header className="whatsapp-page-heading"><h1>WhatsApp</h1><p>Configura confirmaciones y recordatorios de citas en modo de prueba.</p></header>
    <div className="whatsapp-simulated-notice"><ShieldCheck size={18}/><div><strong>Solo simulación · no envía mensajes</strong><span>Este modo no se conecta a Meta ni a WhatsApp. Los resultados de prueba se generan localmente en el servidor.</span></div></div>
    <div className="whatsapp-settings-summary"><div><span>Estado</span><strong className={configured ? 'is-mock' : ''}>{loading ? 'Cargando…' : statusLabel}</strong></div><div><span>Números simulados activos</span><strong>{loading ? '—' : String(readySenderCount)}</strong></div></div>
    {loading ? <p className="whatsapp-settings-loading"><LoaderCircle size={16}/> Cargando configuración…</p> : <form className="whatsapp-settings-form" onSubmit={save}>
      <section className="whatsapp-settings-section"><div className="whatsapp-settings-heading"><div><h3>Números de prueba</h3><p>Asigna un remitente simulado a cada sucursal.</p></div><button className="button outline compact" type="button" onClick={addSender}><Plus size={15}/> Agregar número</button></div>
        {senders.length ? <div className="whatsapp-sender-list">{senders.map((sender, index) => <div className="whatsapp-sender-row" key={sender.senderKey}>
          <label className="whatsapp-sender-label">Etiqueta<input maxLength={120} value={sender.displayLabel} onChange={event => updateSender(sender.senderKey, 'displayLabel', event.target.value)} placeholder={`Número simulado ${index + 1}`} required/></label>
          <label className="whatsapp-sender-branch">Sucursal<select value={sender.branchId} onChange={event => updateSender(sender.senderKey, 'branchId', event.target.value)}><option value="">Sin sucursal asignada</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label className="whatsapp-sender-default"><input type="checkbox" checked={sender.isDefault} onChange={event => updateSender(sender.senderKey, 'isDefault', event.target.checked)}/> Predeterminado</label>
          <button className="icon-button outline" type="button" aria-label={`Quitar ${sender.displayLabel || `número ${index + 1}`}`} onClick={() => { setSenders(current => current.filter(item => item.senderKey !== sender.senderKey)); setTestResult(null); }}><Trash2 size={15}/></button>
        </div>)}</div> : <p className="whatsapp-settings-empty">Aún no hay remitentes de prueba. Agrega uno y asígnalo a una sucursal.</p>}
        <label className="whatsapp-default-fallback"><input type="checkbox" checked={settings.allowDefaultFallback} onChange={event => setSettings(current => ({ ...current, allowDefaultFallback: event.target.checked }))}/> Permitir el número predeterminado como respaldo cuando una sucursal no tenga remitente asignado</label>
      </section>
      <section className="whatsapp-settings-section"><div className="whatsapp-settings-heading"><div><h3>Plantillas de prueba</h3><p>Disponibilidad simulada para avisos de logística de citas.</p></div></div><div className="whatsapp-template-list">{templateKinds.map(([key, label]) => <label key={key}><input type="checkbox" checked={settings.templateReadiness[key] === true} onChange={event => setSettings(current => ({ ...current, templateReadiness: { ...current.templateReadiness, [key]: event.target.checked } }))}/>{label}</label>)}</div></section>
      {error && <p className="whatsapp-settings-error" role="alert"><CircleAlert size={15}/>{error}</p>}{notice && <p className="whatsapp-settings-success" role="status"><CircleCheck size={15}/>{notice}</p>}
      <div className="whatsapp-settings-actions"><button className="button primary" type="submit" disabled={saving || loading}><Save size={15}/>{saving ? 'Guardando…' : 'Guardar configuración simulada'}</button></div>
    </form>}
    <section className="whatsapp-settings-test"><div className="whatsapp-settings-heading"><div><h3>Probar resultado simulado</h3><p>Usa una cita sintética, sin nombre ni teléfono de paciente.</p></div></div>
      <div className="whatsapp-test-controls"><label>Sucursal<select value={testBranchId} onChange={event => setTestBranchId(event.target.value)}><option value="">Sin sucursal específica</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Tipo de aviso<select value={testKind} onChange={event => setTestKind(event.target.value)}>{templateKinds.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Resultado<select value={testOutcome} onChange={event => setTestOutcome(event.target.value)}><option value="accepted">Aceptado</option><option value="failed">Fallo</option><option value="unknown">Incierto</option></select></label><button className="button outline compact" type="button" onClick={runTest} disabled={testing || loading || !configured || readySenderCount === 0}><CircleHelp size={15}/>{testing ? 'Probando…' : 'Ejecutar prueba'}</button></div>
      {testResult && <p className={`whatsapp-test-result is-${testResult.status}`} role="status"><Check size={15}/>{outcomeLabel(testResult.status)} · {testResult.senderLabel} · {testResult.route === 'default' ? 'respaldo predeterminado' : 'asignación de sucursal'}. {testResult.message}</p>}
    </section>
    <p className="whatsapp-settings-footnote">Los números, estados de plantillas y resultados son ficticios. El modo simulado no utiliza credenciales, no guarda mensajes de prueba y no realiza solicitudes a Meta.</p>
  </div>;
}
