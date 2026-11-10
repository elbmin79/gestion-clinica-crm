import { parseSessionPrice, suggestSessionPrice } from './appointment-pricing.js';
import { parsePackagePurchase } from './patient-packages.js';

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function parseClinicPromotion(form) {
  const name = String(form.get('name') || '').trim();
  const serviceId = String(form.get('serviceId') || '');
  const kind = form.get('kind');
  const startsOn = String(form.get('startsOn') || '');
  const endsOn = String(form.get('endsOn') || '');
  if (!name || name.length > 120 || !serviceId || !['single', 'package'].includes(kind)) throw new Error('Indica el nombre, tipo y servicio de la promoción.');
  if (!validDate(startsOn) || !validDate(endsOn) || startsOn > endsOn) throw new Error('Indica un periodo válido para la promoción.');
  if (kind === 'package') {
    const purchase = parsePackagePurchase(form.get('sessions'), form.get('amount'));
    return { name, serviceId, kind, startsOn, endsOn, amount: purchase.agreedAmount, sessions: purchase.totalSessions, currency: 'MXN' };
  }
  const price = parseSessionPrice(form.get('amount'), form.get('currency'));
  if (!price) throw new Error('Indica el precio promocional.');
  return { name, serviceId, kind, startsOn, endsOn, ...price, sessions: null };
}

export function promotionStatus(promotion, date) {
  if (!promotion.active) return 'Archivada';
  if (date < promotion.startsOn) return 'Programada';
  if (date > promotion.endsOn) return 'Terminada';
  return 'Vigente';
}

export function findClinicPromotion(promotions, serviceId, kind, date) {
  if (!validDate(date)) return null;
  return promotions.filter(item => item.serviceId === serviceId && item.kind === kind && promotionStatus(item, date) === 'Vigente')
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0] || null;
}

export function quoteSessionPrice(services, promotions, date) {
  const applied = [];
  const quotedServices = services.map(service => {
    const promotion = findClinicPromotion(promotions, service?.id, 'single', date);
    if (!promotion) return service;
    applied.push(promotion.name);
    return { ...service, offers: [{ kind: 'single', amount: promotion.amount, currency: promotion.currency }] };
  });
  const price = suggestSessionPrice(quotedServices);
  return { price, promotionNames: price ? applied : [] };
}
