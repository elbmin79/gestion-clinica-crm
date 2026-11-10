import { parseSessionPrice } from './appointment-pricing.js';
import { isLedgerDate } from './clinic-expenses.js';

export const RATE_SOURCE = 'Frankfurter';

export function normalizeUsdRate(row, onDate = '') {
  const rate = String(row?.rate ?? '');
  if (row?.base !== 'USD' || row.quote !== 'MXN' || !isLedgerDate(row.date) || (onDate && row.date > onDate)
    || !/^\d{1,5}(?:\.\d{1,12})?$/.test(rate) || Number(rate) <= 0) {
    throw new Error('No se recibió un tipo de cambio válido.');
  }
  return { date:row.date, base:'USD', quote:'MXN', rate, source:RATE_SOURCE };
}

export function convertCurrency(amount, from, rate) {
  const parsed = parseSessionPrice(amount, from);
  if (!parsed) return null;
  const [whole, fraction = ''] = rate.rate.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const ratio = BigInt(whole + fraction);
  const [numerator, denominator] = from === 'USD' ? [ratio, scale] : [scale, ratio];
  const input = BigInt(Math.round(parsed.amount * 100));
  const cents = (2n * input * numerator + denominator) / (2n * denominator);
  if (cents > 999999999999n) throw new Error('El importe convertido supera el máximo permitido.');
  return { amount:Number(cents)/100, currency:from === 'USD' ? 'MXN' : 'USD' };
}

export function paymentExchangeLabel(exchange) {
  return `USD ${exchange.originalAmount.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})} · ${exchange.rate} MXN/USD · ${exchange.date} · ${RATE_SOURCE}`;
}
