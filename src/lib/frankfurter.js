import { isLedgerDate } from './clinic-expenses.js';
import { normalizeUsdRate } from './exchange-rates.js';

export async function fetchReferenceRate(onDate = '', fetchRate = fetch) {
  if (onDate && !isLedgerDate(onDate)) throw new Error('Fecha de tipo de cambio inválida.');
  const url = new URL('https://api.frankfurter.dev/v2/rate/USD/MXN');
  if (onDate) url.searchParams.set('date', onDate);
  const response = await fetchRate(url, { next:{revalidate:3600}, signal:AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Tipo de cambio no disponible.');
  return normalizeUsdRate(await response.json(),onDate);
}
