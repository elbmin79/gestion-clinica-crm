'use client';

import { useEffect, useRef, useState } from 'react';
import AgendaBranchSettings, { readBranchSettings } from './agenda-branch-settings';
import { Check, Plus, ShieldCheck } from 'lucide-react';
import { loadProfessionalAccounts } from './clinic-access/professional-actions';
import { matchingUnlinkedProfessional, professionalAccountOptions, validateProfessional } from '../lib/professional-accounts';

export function useProfessionalAccounts(clinicId, enabled, revision) {
  const [state, setState] = useState({ accounts: [], loading: enabled, error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (!enabled) { setState({ accounts: [], loading: false, error: '' }); return; }
    setState({ accounts: [], loading: true, error: '' });
    loadProfessionalAccounts(clinicId).then(result => {
      if (active) setState({ accounts: result.accounts || [], loading: false, error: result.ok ? '' : result.message });
    }).catch(() => { if (active) setState({ accounts: [], loading: false, error: 'No se pudieron cargar las cuentas.' }); });
    return () => { active = false; };
  }, [clinicId, enabled, revision, retry]);
  return { ...state, reload: () => setRetry(value => value + 1) };
}

export default function ProfessionalEditor({ Modal, provider, providers, branches, sharedMode, clinicId, onSave, onSelectExisting, close }) {
  const directory = useProfessionalAccounts(clinicId, sharedMode);
  const [mode, setMode] = useState(provider?.userId || (sharedMode && !provider) ? 'account' : 'manual');
  const [userId, setUserId] = useState(provider?.userId || '');
  const [query, setQuery] = useState('');
  const [name, setName] = useState(provider?.name || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const account = directory.accounts.find(item => item.userId === userId);
  const existingMatch = !provider && matchingUnlinkedProfessional(account, providers);
  const options = professionalAccountOptions(directory.accounts, providers, provider?.id).filter(item => `${item.name} ${item.email}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
  const closeEditor = () => { if (!savingRef.current) close(); };
  useEffect(() => {
    const dialog = document.querySelector('.professional-editor');
    const previousFocus = document.activeElement;
    dialog?.querySelector('input, button')?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); if (!savingRef.current) close(); }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [close]);
  const submit = async event => {
    event.preventDefault();
    if (savingRef.current) return;
    const form = new FormData(event.currentTarget);
    const input = { name: mode === 'account' ? account?.name || provider?.name || '' : name, userId: mode === 'account' ? userId : '', role: String(form.get('role') || '').trim() || 'Profesional', branchIds: form.getAll('branchIds').map(String) };
    if (mode === 'account' && (!account || (!provider?.userId && !professionalAccountOptions(directory.accounts, providers, provider?.id).some(item => item.userId === userId)))) { setError('Selecciona una cuenta disponible de esta clínica.'); return; }
    try { input.branchSettings = readBranchSettings(form, input.branchIds); } catch (failure) { setError(failure.message); return; }
    const validation = validateProfessional(input, branches);
    if (validation) { setError(validation); return; }
    setError(''); savingRef.current = true; setSaving(true);
    try { await onSave(input); } catch (failure) { setError(failure.message || 'No se pudo guardar el profesional.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <Modal title={provider ? 'Editar profesional' : 'Agregar profesional'} subtitle="Identidad, cargo clínico y sucursales de atención." close={closeEditor} className="professional-editor">
    <form className="form-stack" onSubmit={submit} aria-busy={saving} onInvalidCapture={event => { const details = event.target.closest('details'); if (details) details.open = true; }}>
      <fieldset disabled={saving} className="professional-fields">
        {sharedMode && !provider?.userId && <fieldset className="professional-modes"><legend>¿Cómo quieres agregar al profesional?</legend>
          <label><input type="radio" name="identityMode" value="account" checked={mode === 'account'} onChange={() => { setMode('account'); setError(''); }}/><span><strong>Vincular cuenta existente</strong><small>Usa el perfil de una persona con acceso a esta clínica.</small></span></label>
          <label><input type="radio" name="identityMode" value="manual" checked={mode === 'manual'} onChange={() => { setMode('manual'); setError(''); }}/><span><strong>Agregar sin cuenta</strong><small>Permite asignarle citas sin darle acceso al CRM.</small></span></label>
        </fieldset>}
        {mode === 'account' ? <section className="professional-account-section" aria-label="Cuenta del profesional">
          {directory.loading ? <p role="status">Cargando cuentas de la clínica…</p> : directory.error ? <div className="professional-error" role="alert">{directory.error} <button type="button" className="button outline compact" onClick={directory.reload}>Reintentar</button></div> : <>
            {!provider?.userId && <><label>Buscar cuenta<input type="search" value={query} onChange={event => { setQuery(event.target.value); setUserId(''); }} placeholder="Nombre o correo electrónico"/></label>
              <label>Cuenta con acceso<select value={userId} onChange={event => setUserId(event.target.value)} required><option value="">Selecciona una cuenta</option>{options.map(item => <option key={item.userId} value={item.userId}>{item.name} · {item.email}</option>)}</select></label>
              {!options.length && <p className="professional-help">No hay cuentas disponibles{query ? ' para esta búsqueda' : ''}. Revisa «Acceso a la clínica» o agrega al profesional sin cuenta.</p>}
            </>}
            {account && <div className="professional-account-preview">{account.avatarUrl && <img src={account.avatarUrl} width="42" height="42" alt=""/>}<div><strong>{account.name}</strong><span>{account.email}</span><small>{provider?.userId ? account.hasAccess ? 'Cuenta vinculada' : 'Cuenta vinculada · sin acceso a la clínica' : 'Cuenta seleccionada · se vinculará al guardar'}</small></div></div>}
            {existingMatch && <div className="professional-match"><p>Ya existe un profesional sin cuenta con este nombre: <strong>{existingMatch.name}</strong>. Si es la misma persona, vincula su registro para conservar sus citas y pacientes.</p><button type="button" className="button outline compact" onClick={() => onSelectExisting(existingMatch)}>Revisar registro existente</button></div>}
            {provider?.userId && !account && <p className="professional-error" role="alert">No se pudo consultar la cuenta vinculada. Recarga las cuentas antes de guardar.</p>}
            <p className="professional-help">El nombre y la foto provienen del perfil. Los permisos se administran en «Acceso a la clínica».</p>
          </>}
        </section> : <><label>Nombre<input name="name" value={name} onChange={event => setName(event.target.value)} placeholder="Nombre completo del profesional" maxLength={160} required/></label><p className="professional-help">Sin acceso al CRM. Podrás vincular una cuenta más adelante desde este registro.</p></>}
        <label>Cargo o especialidad<input name="role" defaultValue={provider?.role || ''} placeholder="Ej. Médica estética" maxLength={160}/></label>
        <AgendaBranchSettings branches={branches} provider={provider}/>
        {!branches.some(item => item.active !== false) && <p className="professional-error">Agrega una sucursal activa antes de guardar al profesional.</p>}
        <div className="form-note"><ShieldCheck size={15}/>{sharedMode ? 'Esta configuración no cambia los permisos de la cuenta.' : 'Solo se guarda en este navegador de demostración.'}</div>
      </fieldset>
      {error && <p className="professional-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={closeEditor} disabled={saving}>Cancelar</button><button className="button primary" disabled={saving || (mode === 'account' && (directory.loading || !!directory.error || !account)) || !branches.some(item => item.active !== false)}>{provider ? <Check size={15}/> : <Plus size={15}/>} {saving ? 'Guardando…' : provider ? 'Guardar cambios' : 'Agregar profesional'}</button></div>
    </form>
  </Modal>;
}
