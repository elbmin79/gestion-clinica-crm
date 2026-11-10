const currencies = new Set(['MXN', 'USD']);

export function parseSessionPrice(amount, currency) {
  const value = String(amount ?? '').trim();
  if (!value) return null;
  if (!currencies.has(currency) || !/^(?:\d{1,10}(?:\.\d{0,2})?|\.\d{1,2})$/.test(value)) {
    throw new Error('Indica un costo válido en MXN o USD, con hasta dos decimales.');
  }
  return { amount: Number(value), currency };
}

export function suggestSessionPrice(services) {
  if (!services.length) return null;
  const offers = services.map(service => service?.offers?.filter(offer => offer.kind === 'single') || []);
  if (offers.some(items => items.length !== 1)) return null;
  const currency = offers[0][0].currency;
  if (offers.some(([offer]) => offer.currency !== currency || offer.amount == null)) return null;
  try {
    const cents = offers.reduce((sum, [offer]) => sum + Math.round(parseSessionPrice(offer.amount, currency).amount * 100), 0);
    return parseSessionPrice(cents / 100, currency);
  } catch {
    return null;
  }
}
