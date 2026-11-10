import { packageBalance } from '../patient-packages.js';
import { createClient } from './client.js';
import { fetchAllPages } from './paged-query.js';

export function createPatientPackageStore({ clientFactory = createClient } = {}) {
  return {
    async load(clinicId, patientId) {
      const client = clientFactory();
      const rows = await fetchAllPages(({ from, to, includeCount }) => client.from('patient_package_balances')
        .select('id, service_id, service_name, sessions_total, agreed_amount, created_at, completed_sessions, reserved_sessions, paid_amount', includeCount ? { count: 'exact' } : undefined)
        .eq('clinic_id', clinicId)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to));
      return rows.map(row => packageBalance({
        id: row.id, patientId, serviceId: row.service_id, serviceName: row.service_name, createdAt: row.created_at,
        totalSessions: row.sessions_total, agreedAmount: Number(row.agreed_amount),
        completedSessions: row.completed_sessions, reservedSessions: row.reserved_sessions, paidAmount: Number(row.paid_amount),
      }));
    },
    async create(clinicId, patientId, purchase) {
      const client = clientFactory();
      const result = await client.from('patient_packages').insert({
        id: purchase.id, clinic_id: clinicId, patient_id: patientId, service_id: purchase.serviceId,
        sessions_total: purchase.totalSessions, agreed_amount: purchase.agreedAmount,
      });
      if (result.error) {
        if (result.error.code !== '23505') throw result.error;
        // A retry may follow a committed purchase whose response was lost.
        const existing = await client.from('patient_packages').select('id').eq('clinic_id', clinicId)
          .eq('patient_id', patientId).eq('id', purchase.id).single();
        if (existing.error || !existing.data) throw result.error;
      }
    },
  };
}
