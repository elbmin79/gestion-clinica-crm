import { parseSessionPrice } from './appointment-pricing.js';

export const BILL_NOTICE = 'Pago mensual pendiente';

export function isLedgerDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}

function textFields(form) {
  const name = String(form.get('name') || '').trim();
  const category = String(form.get('category') || '').trim();
  if (!name || name.length > 120 || !category || category.length > 80) throw new Error('Indica un concepto y una categoría.');
  return { name, category };
}

export function parseMonthlyBill(form) {
  const dueDay = Number(form.get('dueDay'));
  const startsMonth = `${form.get('startsMonth') || ''}-01`;
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31 || !isLedgerDate(startsMonth)) {
    throw new Error('Indica un mes de inicio y un día de vencimiento entre 1 y 31.');
  }
  return { ...textFields(form), dueDay, startsMonth, estimate: parseSessionPrice(form.get('estimate'),'MXN')?.amount ?? null };
}

export function parseExpense(form, today) {
  const amount = parseSessionPrice(form.get('amount'),'MXN')?.amount;
  const paidOn = String(form.get('paidOn') || '');
  const note = String(form.get('note') || '').trim();
  if (!amount || !isLedgerDate(paidOn) || paidOn > today) throw new Error('Indica un importe positivo y una fecha de pago válida.');
  if (note.length > 500) throw new Error('La nota puede tener hasta 500 caracteres.');
  return { ...textFields(form), amount, paidOn, note };
}

export function dueDateInMonth(month, dueDay) {
  const [year, number] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return `${month}-${String(Math.min(dueDay, lastDay)).padStart(2,'0')}`;
}

export function billOccurrences(bills, expenses, month, today) {
  const byBill = new Map(expenses.filter(item => item.billMonth === `${month}-01`).map(item => [item.billId,item]));
  return bills.filter(item => (item.active && item.startsMonth <= `${month}-01`) || byBill.has(item.id)).map(bill => {
    const dueOn = dueDateInMonth(month,bill.dueDay);
    const expense = byBill.get(bill.id);
    return { bill, dueOn, expense, status: expense ? 'Pagado' : dueOn < today ? 'Vencido' : dueOn === today ? 'Vence hoy' : 'Programado' };
  }).sort((a,b) => a.dueOn.localeCompare(b.dueOn) || a.bill.name.localeCompare(b.bill.name));
}

export function monthlyClose(payments, expenses, month) {
  const monthPayments = payments.filter(item => item.date?.startsWith(`${month}-`));
  const monthExpenses = expenses.filter(item => item.paidOn.startsWith(`${month}-`));
  const sum = items => items.reduce((total,item) => total + Math.round(item.amount * 100),0);
  const received = sum(monthPayments.filter(item => item.direction === 'Ingreso'));
  const refunded = sum(monthPayments.filter(item => item.direction === 'Reembolso'));
  const spent = sum(monthExpenses);
  return { received:received/100, refunded:refunded/100, spent:spent/100, net:(received-refunded-spent)/100, expenses:monthExpenses };
}
