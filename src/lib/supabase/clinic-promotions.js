import { createClient } from './client.js';
import { fetchAllPages } from './paged-query.js';

const columns = 'id, service_id, name, kind, amount, currency, sessions, starts_on, ends_on, active, created_at';

function mapPromotion(row) {
  return { id: row.id, serviceId: row.service_id, name: row.name, kind: row.kind, amount: Number(row.amount),
    currency: row.currency, sessions: row.sessions, startsOn: row.starts_on, endsOn: row.ends_on,
    active: row.active, createdAt: row.created_at };
}

export function createClinicPromotionsStore({ clientFactory = createClient } = {}) {
  return {
    async load(clinicId) {
      const client = clientFactory();
      const rows = await fetchAllPages(({ from, to, includeCount }) => client.from('clinic_promotions')
        .select(columns, includeCount ? { count: 'exact' } : undefined)
        .eq('clinic_id', clinicId).order('starts_on', { ascending: false }).order('id').range(from, to));
      return rows.map(mapPromotion);
    },
    async save(clinicId, promotion) {
      const client = clientFactory();
      const table = client.from('clinic_promotions');
      const row = { service_id: promotion.serviceId, name: promotion.name, kind: promotion.kind,
        amount: promotion.amount, currency: promotion.currency, sessions: promotion.sessions,
        starts_on: promotion.startsOn, ends_on: promotion.endsOn, active: promotion.active };
      const write = promotion.id ? table.update(row).eq('clinic_id', clinicId).eq('id', promotion.id)
        : table.insert({ ...row, clinic_id: clinicId });
      const result = await write.select(columns).single();
      if (result.error) throw result.error;
      return mapPromotion(result.data);
    },
  };
}
