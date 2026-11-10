import { createClient } from './client.js';
import { fetchAllPages } from './paged-query.js';

const billsTable = 'clinic_monthly_bills';
const expensesTable = 'clinic_expenses';
const billColumns = 'id, name, category, due_day, starts_month, estimate, active';
const expenseColumns = 'id, name, category, amount, paid_on, note, bill_id, bill_month';
const mapBill = row => ({ id:row.id, name:row.name, category:row.category, dueDay:row.due_day,
  startsMonth:row.starts_month, estimate:row.estimate == null ? null : Number(row.estimate), active:row.active });
const mapExpense = row => ({ id:row.id, name:row.name, category:row.category, amount:Number(row.amount),
  paidOn:row.paid_on, note:row.note || '', billId:row.bill_id, billMonth:row.bill_month });

export function createClinicExpensesStore({ clientFactory = createClient } = {}) {
  async function write(table, columns, clinicId, id, fields, newFields) {
    const client = clientFactory();
    const query = id ? client.from(table).update(fields).eq('clinic_id',clinicId).eq('id',id)
      : client.from(table).insert({ ...fields,...newFields,clinic_id:clinicId });
    const result = await query.select(columns).single();
    if (result.error) throw result.error;
    return result.data;
  }
  return {
    async load(clinicId) {
      const client = clientFactory();
      const read = (table,columns,sort) => fetchAllPages(({from,to,includeCount}) => client.from(table)
        .select(columns,includeCount ? {count:'exact'} : undefined).eq('clinic_id',clinicId).order(sort).order('id').range(from,to));
      const [bills,expenses] = await Promise.all([read(billsTable,billColumns,'name'),read(expensesTable,expenseColumns,'paid_on')]);
      return { bills:bills.map(mapBill), expenses:expenses.map(mapExpense) };
    },
    async saveBill(clinicId,bill) {
      const fields = {name:bill.name,category:bill.category,due_day:bill.dueDay,estimate:bill.estimate,active:bill.active};
      return mapBill(await write(billsTable,billColumns,clinicId,bill.id,fields,{starts_month:bill.startsMonth}));
    },
    async saveExpense(clinicId,expense) {
      const fields = {name:expense.name,category:expense.category,amount:expense.amount,paid_on:expense.paidOn,note:expense.note || null};
      return mapExpense(await write(expensesTable,expenseColumns,clinicId,expense.id,fields,{bill_id:expense.billId || null,bill_month:expense.billMonth || null}));
    },
  };
}
