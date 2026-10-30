'use client';

import { useEffect, useState } from 'react';
import { CalendarOff, Check, CircleAlert, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { createClinicAvailabilityStore } from '../lib/supabase/clinic-availability';

function todayInZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatBlockRange(block, timeZone) {
  const date = new Intl.DateTimeFormat('es-MX', { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = new Intl.DateTimeFormat('es-MX', { timeZone, hour: '2-digit', minute: '2-digit' });
  const start = new Date(block.starts_at), end = new Date(block.ends_at);
  return `${date.format(start)} · ${time.format(start)}–${date.format(end) === date.format(start) ? time.format(end) : `${date.format(end)} · ${time.format(end)}`}`;
}

export default function ClinicAvailabilitySettings({ clinicId, role, branches = [], providers = [], timeZone = 'America/Tijuana', sharedMode = true }) {
  const [data, setData] = useState({ allowProviderOverlaps: false, blocks: [] });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState('clinic');
  const [today, setToday] = useState(() => todayInZone(timeZone));
  const [form, setForm] = useState({ title: '', startDate: '', startTime: '09:00', endDate: '', endTime: '10:00', branchId: '', providerId: '' });
  const canManageBlocks = ['admin', 'clinician', 'receptionist'].includes(role);
  const canManageSettings = role === 'admin';

  const refresh = async () => {
    if (!sharedMode || !clinicId) { setStatus('unavailable'); return; }
    setStatus('loading'); setError('');
    try { setData(await createClinicAvailabilityStore().load(clinicId)); setStatus('ready'); }
    catch (cause) { setError(cause.message || 'No se pudo cargar la disponibilidad.'); setStatus('error'); }
  };
  useEffect(() => { const date = todayInZone(timeZone); setToday(date); setForm(current => ({ ...current, startDate: date, endDate: date })); refresh(); }, [clinicId, sharedMode, timeZone]);

  const updateForm = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const saveOverlaps = async value => {
    if (!canManageSettings || saving) return;
    setSaving(true); setError('');
    try {
      await createClinicAvailabilityStore().saveProviderOverlaps(clinicId, value);
      setData(current => ({ ...current, allowProviderOverlaps: value }));
    } catch (cause) { setError(cause.message || 'No se pudo guardar la regla.'); }
    finally { setSaving(false); }
  };
  const addBlock = async event => {
    event.preventDefault();
    if (!canManageBlocks || saving) return;
    setSaving(true); setError('');
    try {
      const block = await createClinicAvailabilityStore().createBlock(clinicId, { ...form, scope }, timeZone);
      setData(current => ({ ...current, blocks: [...current.blocks, block].sort((a, b) => a.starts_at.localeCompare(b.starts_at)) }));
      setScope('clinic');
      setForm({ title: '', startDate: today, startTime: '09:00', endDate: today, endTime: '10:00', branchId: '', providerId: '' });
    } catch (cause) { setError(cause.message || 'No se pudo bloquear ese horario.'); }
    finally { setSaving(false); }
  };
  const removeBlock = async id => {
    if (!canManageBlocks || saving) return;
    setSaving(true); setError('');
    try {
      await createClinicAvailabilityStore().deleteBlock(clinicId, id);
      setData(current => ({ ...current, blocks: current.blocks.filter(block => block.id !== id) }));
    } catch (cause) { setError(cause.message || 'No se pudo eliminar el horario bloqueado.'); }
    finally { setSaving(false); }
  };

  if (status === 'loading') return <div className="settings-preview-content"><div className="empty-inline">Cargando disponibilidad…</div></div>;
  if (status === 'unavailable') return <div className="settings-preview-content"><div className="settings-preview-banner"><CircleAlert size={17}/><div><strong>Conecta una clínica para administrar disponibilidad</strong><span>Los horarios bloqueados y las reglas se guardan por clínica en Supabase.</span></div></div></div>;
  if (status === 'error' && !data.blocks.length) return <div className="settings-preview-content"><div className="form-note" role="alert"><CircleAlert size={16}/>{error}</div><button className="button secondary" type="button" onClick={refresh}><RotateCcw size={15}/> Reintentar</button></div>;

  return <div className="clinic-availability-content" aria-busy={saving}>
    {error && <div className="clinic-availability-error" role="alert"><CircleAlert size={15}/>{error}</div>}
    <section className="clinic-availability-section">
      <div className="clinic-availability-heading"><div><strong>Permitir citas simultáneas</strong><span>Permite que un mismo profesional tenga citas que se traslapen. Los conflictos de horario de cada paciente siguen bloqueados.</span></div>
        <label className="clinic-availability-toggle"><input aria-label="Permitir citas simultáneas del mismo profesional" type="checkbox" checked={data.allowProviderOverlaps} disabled={!canManageSettings || saving} onChange={event => saveOverlaps(event.target.checked)}/><span>{data.allowProviderOverlaps ? 'Activadas' : 'Desactivadas'}</span></label>
      </div>
      {!canManageSettings && <p className="clinic-availability-hint">Solo una persona administradora puede cambiar esta regla.</p>}
    </section>

    <section className="clinic-availability-section">
      <div className="clinic-availability-section-title"><div><strong>Bloquear un horario</strong><span>Las citas nuevas y las citas movidas respetarán estos bloqueos.</span></div></div>
      {canManageBlocks ? <form className="clinic-availability-form" onSubmit={addBlock}>
        <label className="clinic-availability-field clinic-availability-title">Motivo<input maxLength={100} required value={form.title} onChange={event => updateForm('title', event.target.value)} placeholder="Ej. Vacaciones, comida, capacitación"/></label>
        <label className="clinic-availability-field">Aplicar a<select value={scope} onChange={event => setScope(event.target.value)}><option value="clinic">Toda la clínica</option><option value="branch">Una sucursal</option><option value="provider">Un profesional</option></select></label>
        {scope === 'branch' && <label className="clinic-availability-field">Sucursal<select required value={form.branchId} onChange={event => updateForm('branchId', event.target.value)}><option value="">Seleccionar sucursal</option>{branches.filter(branch => branch.active !== false).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
        {scope === 'provider' && <label className="clinic-availability-field">Profesional<select required value={form.providerId} onChange={event => updateForm('providerId', event.target.value)}><option value="">Seleccionar profesional</option>{providers.filter(provider => provider.active !== false).map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
        <fieldset className="clinic-availability-range"><legend>Desde</legend><label className="clinic-availability-field">Fecha<input type="date" min={today} required value={form.startDate} onChange={event => { updateForm('startDate', event.target.value); if (form.endDate < event.target.value) updateForm('endDate', event.target.value); }}/></label><label className="clinic-availability-field">Hora<input type="time" required value={form.startTime} onChange={event => updateForm('startTime', event.target.value)}/></label></fieldset>
        <fieldset className="clinic-availability-range"><legend>Hasta</legend><label className="clinic-availability-field">Fecha<input type="date" min={form.startDate || today} required value={form.endDate} onChange={event => updateForm('endDate', event.target.value)}/></label><label className="clinic-availability-field">Hora<input type="time" required value={form.endTime} onChange={event => updateForm('endTime', event.target.value)}/></label></fieldset>
        <button className="button primary clinic-availability-submit" type="submit" disabled={saving}><Plus size={15}/> Bloquear horario</button>
      </form> : <p className="clinic-availability-hint">Tu rol no permite crear ni eliminar bloqueos de horario.</p>}
    </section>

    <section className="clinic-availability-section clinic-availability-block-list">
      <div className="clinic-availability-section-title"><div><strong>Horarios bloqueados</strong><span>{data.blocks.length ? `${data.blocks.length} bloqueo${data.blocks.length === 1 ? '' : 's'} guardado${data.blocks.length === 1 ? '' : 's'}` : 'No hay horarios bloqueados.'}</span></div></div>
      {data.blocks.map(block => <div className="clinic-availability-block" key={block.id}><span className="clinic-availability-block-icon"><CalendarOff size={16}/></span><div><strong>{block.title}</strong><span>{formatBlockRange(block, timeZone)}</span><small>{block.scope === 'clinic' ? 'Toda la clínica' : block.scope === 'branch' ? `Sucursal: ${branches.find(branch => branch.id === block.branch_id)?.name || 'Sucursal'}` : `Profesional: ${providers.find(provider => provider.id === block.provider_id)?.name || 'Profesional'}`}</small></div>{canManageBlocks && <button className="icon-button" type="button" aria-label={`Eliminar bloqueo ${block.title}`} title="Eliminar bloqueo" disabled={saving} onClick={() => removeBlock(block.id)}><Trash2 size={15}/></button>}</div>)}
      {!data.blocks.length && <div className="clinic-availability-empty"><Check size={16}/> No hay bloqueos activos; la agenda usa las reglas normales de citas.</div>}
    </section>
  </div>;
}
