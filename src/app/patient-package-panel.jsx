'use client';

import { useRef, useState } from 'react';
import { datePartsInZone } from '@elixir-clinic/crm-core/clinic-time';
import { findClinicPromotion } from '../lib/clinic-promotions';
import { parsePackagePurchase } from '../lib/patient-packages';
import { createPatientPackageStore } from '../lib/supabase/patient-packages';
import { usePatientPackages } from './use-patient-packages';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', currencyDisplay: 'code' });

export default function PatientPackagePanel({ patient, clinicId, sharedMode, timeZone, canCreate, services, promotions = [], demoPurchases, appointments, payments, onDemoPurchase }) {
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [sessions, setSessions] = useState('');
  const [amount, setAmount] = useState('');
  const request = useRef(null);
  const patientId = patient.databaseId;

  const loaded = usePatientPackages({ patient, clinicId, sharedMode, demoPurchases, appointments, payments, reload });
  const availableServices = services.filter(service => service.active !== false);
  const packages = loaded?.rows || [];
  const canRegister = canCreate && availableServices.length > 0 && (!sharedMode || Boolean(loaded?.rows));
  const today = datePartsInZone(new Date(), timeZone);
  const selectedPromotion = findClinicPromotion(promotions, serviceId, 'package', today);

  function selectService(id) {
    setServiceId(id);
    const service = availableServices.find(item => item.id === id);
    const offer = findClinicPromotion(promotions, id, 'package', today) || service?.offers?.find(item => item.kind === 'package');
    setSessions(offer?.sessions ?? '');
    setAmount(offer?.currency === 'MXN' ? offer.amount ?? '' : '');
  }

  async function save(event) {
    event.preventDefault();
    if (!canRegister || saving) return;
    setError('');
    try {
      const service = availableServices.find(item => item.id === serviceId);
      if (!service) throw new Error('Selecciona un servicio activo.');
      const terms = parsePackagePurchase(sessions, amount);
      const draftKey = `${service.id}:${terms.totalSessions}:${terms.agreedAmount}`;
      if (request.current?.draftKey !== draftKey) request.current = { draftKey, id: crypto.randomUUID() };
      const purchase = { ...terms, id: request.current.id, serviceId, serviceName: service.name };
      setSaving(true);
      if (sharedMode) {
        await createPatientPackageStore().create(clinicId, patientId, purchase);
        setReload(value => value + 1);
      } else onDemoPurchase({ ...purchase, patientId: patient.id, createdAt: new Date().toISOString() });
      setEditing(false);
      request.current = null;
      selectService('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el paquete. Revisa tus permisos e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="patient-appointments" aria-label="Paquetes del paciente">
    <div className="panel-title">Paquetes del paciente
      {canRegister && !editing && <button type="button" className="button outline compact" onClick={() => setEditing(true)}>Registrar paquete</button>}
    </div>
    {sharedMode && !loaded && <p className="empty-inline" role="status">Consultando paquetes…</p>}
    {sharedMode && loaded?.error && <p className="empty-inline" role="status">No se pudieron consultar los paquetes.</p>}
    {(!sharedMode || loaded?.rows) && packages.length === 0 && <p className="empty-inline">Sin paquetes registrados.</p>}
    {packages.map(purchase => <div className="patient-appointment-row" key={purchase.id}>
      <div>
        <strong>{purchase.serviceName}</strong>
        <span>{purchase.completedSessions} de {purchase.totalSessions} completadas · {purchase.remainingSessions} restantes · {purchase.reservedSessions} reservadas</span>
        <span>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone }).format(new Date(purchase.createdAt))}</span>
      </div>
      <div>
        <strong>{purchase.outstandingAmount === 0 ? 'Liquidado' : `Pendiente ${money.format(purchase.outstandingAmount)}`}</strong>
        <span>Pagado {money.format(purchase.paidAmount)} de {money.format(purchase.agreedAmount)}</span>
      </div>
    </div>)}
    {editing && <form className="form-stack patient-package-form" onSubmit={save}>
      <label>Servicio del paquete<select required value={serviceId} onChange={event => selectService(event.target.value)}>
        <option value="">Seleccionar servicio</option>
        {availableServices.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
      </select></label>
      <div className="form-grid">
        <label>Sesiones del paquete<input type="number" min="1" max="1000" step="1" required value={sessions} onChange={event => setSessions(event.target.value)}/></label>
        <label>Precio acordado (MXN)<input type="number" min="0" max="9999999999.99" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)}/></label>
      </div>
      {selectedPromotion && Number(amount) === selectedPromotion.amount && Number(sessions) === selectedPromotion.sessions
        && <div className="form-note">Precio promocional · {selectedPromotion.name}</div>}
      {error && <p role="alert" className="form-note">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button secondary compact" disabled={saving} onClick={() => { setEditing(false); setError(''); }}>Cancelar</button>
        <button type="submit" className="button primary compact" disabled={saving}>{saving ? 'Guardando…' : 'Guardar paquete'}</button>
      </div>
    </form>}
  </section>;
}
