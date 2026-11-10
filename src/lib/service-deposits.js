import { parseSessionPrice } from './appointment-pricing.js';
import { quoteSessionPrice } from './clinic-promotions.js';

export function serviceDepositRule(service) {
  if (service.depositMode) return { mode:service.depositMode, amount:service.depositFixedAmount ?? null };
  const name = service.name.trim().toLocaleLowerCase('es-MX');
  if (['consulta-valoracion','lipo-assessment'].includes(service.code)
    || ['valoración','valoracion','consulta de valoración','valoración médica','valoracion medica','valoración lipoláser'].includes(name)) {
    return { mode:'fixed',amount:500 };
  }
  if (service.category === 'Lipoláser' || /^lipo(?:láser|laser)(?:\s|$)/.test(name)) return { mode:'fixed',amount:2000 };
  if (service.code === 'fac-morpheus8' || /^morpheus(?:\s|8|$)/.test(name)) return { mode:'fixed',amount:1000 };
  return { mode:'tier',amount:null };
}

export function calculateServiceDeposit(services, promotions, date) {
  let cents = 0;
  const pending = [];
  for (const service of services) {
    const rule = serviceDepositRule(service);
    let amount;
    if (rule.mode === 'fixed') amount = rule.amount;
    else if (rule.mode === 'tier' || rule.mode === 'full') {
      const { price } = quoteSessionPrice([service],promotions,date);
      if (price?.currency === 'MXN') {
        if (rule.mode === 'full') amount = price.amount;
        else if (price.amount >= 500) amount = price.amount <= 1000 ? 200 : price.amount <= 3000 ? 500 : 1000;
      }
    }
    if (Number.isFinite(amount) && amount > 0) cents += Math.round(amount * 100);
    else pending.push(service.name);
  }
  const subtotal = cents / 100;
  const amount = services.length && !pending.length && cents <= 999999999999 ? subtotal : null;
  return { amount, subtotal, pending };
}

export function parseFixedDeposit(value) {
  const amount = parseSessionPrice(value,'MXN')?.amount;
  if (!amount) throw new Error('Indica un anticipo fijo mayor a cero.');
  return amount;
}
