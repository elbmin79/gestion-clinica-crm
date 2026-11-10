import { createClient } from './client.js';
import { fetchAllPages } from './paged-query.js';

const directionToDatabase = { Ingreso: 'income', Reembolso: 'refund' };
const directionToUi = { income: 'Ingreso', refund: 'Reembolso' };
const methodToDatabase = { Efectivo: 'cash', Tarjeta: 'card', Transferencia: 'transfer', Otro: 'other' };
const methodToUi = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' };

function dateInZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const entries = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${entries.year}-${entries.month}-${entries.day}`;
}

function timeInZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const entries = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${entries.hour}:${entries.minute}`;
}

function fail(result, message) {
  if (!result.error) return;
  const error = new Error(message);
  error.code = result.error.code;
  error.cause = result.error;
  throw error;
}

export function createClinicPaymentsStore({ clientFactory = createClient } = {}) {
  return {
    async load(clinicId, timeZone, catalogs) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');

      const now = new Date();
      const from = new Date(now); from.setFullYear(from.getFullYear() - 1);
      const to = new Date(now); to.setFullYear(to.getFullYear() + 1);
      const historySnapshot = new Date().toISOString();
      const columns = 'id, patient_id, appointment_id, direction, amount, method, transaction_date, note, created_at';
      const readPayments = select => fetchAllPages(({ from: pageFrom, to: pageTo, includeCount }) => client.from('payments')
        .select(select, includeCount ? { count: 'exact' } : undefined)
        .eq('clinic_id', clinicId)
        .lte('created_at', historySnapshot)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageFrom, pageTo));
      async function readAvailable(groups) {
        try { return await readPayments([columns,...groups.map(group=>group.columns)].join(', ')); }
        catch (cause) {
          const missing = ['42703','PGRST200','PGRST204'].includes(cause?.code)
            && groups.find(group=>group.pattern.test(cause.message || ''));
          if (missing) return readAvailable(groups.filter(group=>group!==missing));
          const error = new Error('No se pudo cargar el historial de pagos.');
          error.code = cause?.code;
          error.cause = cause;
          throw error;
        }
      }
      const paymentRowsPromise = readAvailable([
        { columns:'package_id',pattern:/package_id/ },
        { columns:'original_amount_usd, payment_exchange_rates(rate_date, rate)',pattern:/original_amount_usd|payment_exchange_rates/ },
      ]);
      const [patientResult, paymentResult] = await Promise.all([
        client.rpc('get_finance_patients', { target_clinic_id: clinicId }),
        paymentRowsPromise,
      ]);
      fail(patientResult, 'No se pudo cargar el directorio financiero.');
      const paymentRows = paymentResult;
      const appointmentIds = [...new Set(paymentRows.map(row => row.appointment_id).filter(Boolean))];
      const appointmentResult = await client.rpc('get_finance_appointments', {
        target_clinic_id: clinicId,
        from_at: from.toISOString(),
        to_at: to.toISOString(),
        appointment_ids: appointmentIds,
      });
      fail(appointmentResult, 'No se pudieron cargar las citas para conciliación.');

      const patientRows = patientResult.data || [];
      const patientsById = new Map(patientRows.map(row => [row.patient_id, row]));
      const patients = patientRows.map((row, index) => {
        const branch = catalogs.branches.find(item => item.id === row.primary_branch_id);
        const provider = catalogs.providers.find(item => item.id === row.primary_provider_id);
        return {
          id: row.record_number,
          databaseId: row.patient_id,
          name: row.full_name,
          initials: row.full_name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toLocaleUpperCase('es-MX'),
          treatment: '—',
          branch: branch?.name || '',
          branchId: row.primary_branch_id || '',
          clinician: provider?.name || '',
          providerId: row.primary_provider_id || '',
          status: 'Activo',
          tone: ['violet', 'peach', 'mint', 'blue', 'rose', 'sand'][index % 6],
        };
      });

      const appointmentById = new Map();
      for (const row of appointmentResult.data || []) {
        const patient = patientsById.get(row.patient_id);
        const branch = catalogs.branches.find(item => item.id === row.branch_id);
        const provider = catalogs.providers.find(item => item.id === row.provider_id);
        const business = catalogs.businesses.find(item => item.id === row.business_id);
        appointmentById.set(row.appointment_id || row.id, {
          id: row.appointment_id || row.id,
          patientId: patient?.record_number || '',
          patient: patient?.full_name || 'Paciente',
          date: dateInZone(row.starts_at, timeZone),
          time: timeInZone(row.starts_at, timeZone),
          service: row.service,
          duration: `${Math.round((new Date(row.ends_at) - new Date(row.starts_at)) / 60000)} min`,
          branchId: row.branch_id,
          branch: row.branch_name || branch?.name || '',
          providerId: row.provider_id,
          clinician: row.provider_name || provider?.name || '',
          businessId: row.business_id,
          business: row.business_name || business?.name || '',
          modality: row.modality === 'virtual' ? 'Virtual' : 'Presencial',
          status: row.status,
          depositRequired: Boolean(row.deposit_required),
          depositAmount: Number(row.deposit_amount || 0),
        });
      }
      const appointments = [...appointmentById.values()];
      const appointmentsById = new Map(appointments.map(item => [item.id, item]));
      const payments = paymentRows.map(row => {
        const patient = patientsById.get(row.patient_id);
        const appointment = row.appointment_id ? appointmentsById.get(row.appointment_id) : null;
        const branch = catalogs.branches.find(item => item.id === appointment?.branchId || item.id === patient?.primary_branch_id);
        const provider = catalogs.providers.find(item => item.id === appointment?.providerId || item.id === patient?.primary_provider_id);
        const business = catalogs.businesses.find(item => item.id === appointment?.businessId || item.id === branch?.businessId);
        return {
          id: row.id,
          patientId: patient?.record_number || row.patient_id,
          patientNameSnapshot: patient?.full_name || 'Paciente',
          appointmentId: row.appointment_id || '',
          packageId: row.package_id || '',
          exchange: row.payment_exchange_rates && row.original_amount_usd != null ? {
            originalAmount:Number(row.original_amount_usd), date:row.payment_exchange_rates.rate_date,
            rate:String(row.payment_exchange_rates.rate),
          } : null,
          date: row.transaction_date,
          direction: directionToUi[row.direction] || 'Ingreso',
          amount: Number(row.amount),
          method: methodToUi[row.method] || 'Otro',
          note: row.note || '',
          branchId: branch?.id || appointment?.branchId || patient?.primary_branch_id || '',
          providerId: provider?.id || appointment?.providerId || patient?.primary_provider_id || '',
          businessId: business?.id || appointment?.businessId || '',
          branchName: appointment?.branch || branch?.name || '',
          providerName: appointment?.clinician || provider?.name || '',
          businessName: appointment?.business || business?.name || '',
          createdAt: row.created_at,
        };
      });
      return { payments, patients, appointments };
    },

    async create(clinicId, patient, appointment, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const user = await client.auth.getUser();
      fail(user, 'No se pudo validar la sesión actual.');
      if (!user.data.user) throw new Error('La sesión ya no está disponible.');
      const result = await client.from('payments').insert({
        clinic_id: clinicId,
        patient_id: patient.databaseId,
        appointment_id: appointment?.id || null,
        ...(input.packageId ? { package_id: input.packageId } : {}),
        ...(input.exchange ? { original_amount_usd:input.exchange.originalAmount,fx_rate_id:input.exchange.id } : {}),
        direction: directionToDatabase[input.direction],
        amount: input.amount,
        method: methodToDatabase[input.method] || 'other',
        transaction_date: input.date,
        note: input.note || null,
        created_by: user.data.user.id,
      }).select('id').single();
      fail(result, 'No se pudo registrar el movimiento. El reembolso puede superar el saldo o tu rol no tiene permiso.');
      return result.data;
    },
  };
}
