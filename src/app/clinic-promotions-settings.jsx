'use client';

import { useState } from 'react';
import { parseClinicPromotion, promotionStatus } from '../lib/clinic-promotions';

export default function ClinicPromotionsSettings({ promotions, services, today, status, canManage, onSave }) {
  const [draft, setDraft] = useState(null);
  const [kind, setKind] = useState('single');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = services.filter(service => service.active !== false);

  function edit(promotion) {
    setError('');
    setDraft(promotion);
    setKind(promotion.kind || 'single');
  }

  async function save(promotion) {
    if (busy || !canManage) return;
    setError('');
    setBusy(true);
    try { await onSave(promotion); setDraft(null); }
    catch { setError('No se pudo guardar la promoción. Revisa tu conexión y tus permisos.'); }
    finally { setBusy(false); }
  }

  function submit(event) {
    event.preventDefault();
    try {
      const terms = parseClinicPromotion(new FormData(event.currentTarget));
      void save({ ...draft, ...terms, active: draft.active ?? true });
    } catch (cause) {
      setError(cause.message);
    }
  }

  return <div className="clinic-services-content">
    {status === 'loading' && <p className="empty-inline" role="status">Consultando promociones…</p>}
    {status === 'error' && <p className="empty-inline" role="status">No se pudieron consultar las promociones. Revisa la conexión y la migración de la base compartida.</p>}
    {status === 'ready' && <>
      {canManage && !draft && <div className="clinic-services-toolbar">
        <button type="button" className="button primary" disabled={busy || !available.length} onClick={() => edit({})}>Nueva promoción</button>
      </div>}
      {draft && <form className="form-stack clinic-service-editor" key={draft.id || 'new'} onSubmit={submit}>
        <div className="form-grid">
          <label>Nombre de la promoción<input name="name" required maxLength="120" defaultValue={draft.name || ''}/></label>
          <label>Servicio<select name="serviceId" required defaultValue={draft.serviceId || ''}>
            <option value="">Seleccionar servicio</option>
            {services.filter(service => service.active !== false || service.id === draft.serviceId).map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select></label>
        </div>
        <div className="form-grid">
          <label>Aplica a<select name="kind" value={kind} onChange={event => setKind(event.target.value)}>
            <option value="single">Sesión individual</option><option value="package">Paquete</option>
          </select></label>
          <label>Precio promocional<input name="amount" type="number" min="0" max="9999999999.99" step="0.01" required defaultValue={draft.amount ?? ''}/></label>
          {kind === 'package' ? <>
            <label>Sesiones incluidas<input name="sessions" type="number" min="1" max="1000" step="1" required defaultValue={draft.sessions ?? ''}/></label>
            <label>Moneda<select value="MXN" disabled><option>MXN</option></select></label>
          </> : <label>Moneda<select name="currency" defaultValue={draft.currency || 'MXN'}><option>MXN</option><option>USD</option></select></label>}
        </div>
        <div className="form-grid">
          <label>Inicio de vigencia<input name="startsOn" type="date" required defaultValue={draft.startsOn || today}/></label>
          <label>Fin de vigencia<input name="endsOn" type="date" required defaultValue={draft.endsOn || today}/></label>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={() => { setError(''); setDraft(null); }}>Cancelar</button>
          <button className="button primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar promoción'}</button>
        </div>
      </form>}
      {error && <p className="form-note" role="alert">{error}</p>}
      {promotions.length > 0 ? <div className="clinic-services-table-wrap">
        <table className="clinic-services-table">
          <thead><tr><th>Promoción</th><th>Precio</th><th>Vigencia</th><th>Estado</th>{canManage && <th>Acciones</th>}</tr></thead>
          <tbody>{promotions.map(item => <tr key={item.id}>
            <td><strong>{item.name}</strong><span>{services.find(service => service.id === item.serviceId)?.name || 'Servicio no disponible'}</span></td>
            <td>{item.currency} {item.amount.toLocaleString('es-MX')}{item.kind === 'package' && <small>{item.sessions} sesiones</small>}</td>
            <td>{item.startsOn} a {item.endsOn}</td>
            <td>{promotionStatus(item, today)}</td>
            {canManage && <td><div className="clinic-service-actions">
              <button type="button" className="button outline compact" disabled={busy} onClick={() => edit(item)}>Editar</button>
              <button type="button" className="button outline compact" disabled={busy} onClick={() => void save({ ...item, active: !item.active })}>{item.active ? 'Archivar' : 'Reactivar'}</button>
            </div></td>}
          </tr>)}</tbody>
        </table>
      </div> : <p className="empty-inline">Sin promociones registradas.</p>}
      <p className="clinic-services-footnote">Para citas cuenta la fecha agendada. Para paquetes cuenta el día de compra. Si se superponen periodos, se sugiere la promoción con el inicio más reciente.</p>
    </>}
  </div>;
}
