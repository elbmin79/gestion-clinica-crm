'use client';

import { useEffect, useState } from 'react';
import { datePartsInZone } from '@elixir-clinic/crm-core/clinic-time';
import { billOccurrences, monthlyClose, parseExpense, parseMonthlyBill } from '../lib/clinic-expenses';
import { createClinicExpensesStore } from '../lib/supabase/clinic-expenses';

const mxn = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'});

export default function ClinicExpenseLedger({ clinicId, sharedMode, timeZone, canWrite, payments, paymentsReady, demoBills, demoExpenses, onDemoBill, onDemoExpense }) {
  const today = datePartsInZone(new Date(), timeZone);
  const [month,setMonth] = useState(today.slice(0,7));
  const [shared,setShared] = useState(null);
  const [draft,setDraft] = useState(null);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');

  useEffect(() => {
    if (!sharedMode || !clinicId) return;
    let active = true;
    createClinicExpensesStore().load(clinicId).then(
      rows => { if (active) setShared({ clinicId, rows }); },
      () => { if (active) setShared({ clinicId, error:true }); },
    );
    return () => { active = false; };
  }, [sharedMode,clinicId]);

  const scoped = shared?.clinicId === clinicId ? shared : null;
  const data = sharedMode ? scoped?.rows : { bills:demoBills, expenses:demoExpenses };
  const editable = canWrite && Boolean(data);
  const close = monthlyClose(payments,data?.expenses || [],month);
  const occurrences = billOccurrences(data?.bills || [],data?.expenses || [],month,today);

  function open(type, item = {}) {
    setError('');
    setDraft({type,item});
  }

  async function save(type, value) {
    if (!editable || saving) return;
    setError('');
    setSaving(true);
    const bills = type === 'bill';
    const collection = bills ? 'bills' : 'expenses';
    try {
      if (sharedMode) {
        const store = createClinicExpensesStore();
        const saved = await (bills ? store.saveBill(clinicId,value) : store.saveExpense(clinicId,value));
        setShared(current => current?.clinicId === clinicId ? {
          ...current, rows:{ ...current.rows,[collection]:[saved,...current.rows[collection].filter(item=>item.id!==saved.id)] },
        } : current);
      } else {
        if (!value.id && value.billId && data.expenses.some(item=>item.billId===value.billId && item.billMonth===value.billMonth)) {
          throw new Error('Este pago mensual ya está registrado.');
        }
        const saved = { ...value,id:value.id || crypto.randomUUID() };
        if (bills) onDemoBill(saved);
        else onDemoExpense(saved);
      }
      setDraft(null);
    } catch (cause) {
      setError(cause.code === '23505' ? 'Este pago mensual ya está registrado.' :
        cause instanceof Error ? cause.message : 'No se pudo guardar. Revisa tus permisos y vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const fields = draft.type === 'bill' ? parseMonthlyBill(form) : parseExpense(form,today);
      void save(draft.type,{ ...draft.item,...fields,active:draft.item.active ?? true });
    } catch (cause) { setError(cause.message); }
  }

  const item = draft?.item;
  const showBillForm = draft?.type === 'bill';
  return <div className="expense-workspace">
    <header className="expense-toolbar">
      <div><h1>Gastos y corte mensual</h1><p>Registra gastos pagados y controla los vencimientos de la clínica.</p></div>
      <label>Mes del corte<input type="month" value={month} onChange={event=>{if(event.target.value)setMonth(event.target.value);}}/></label>
    </header>
    {sharedMode && !data && <p className="empty-inline" role="status">{scoped?.error
      ? 'No se pudo cargar el registro de gastos. Revisa la conexión y la migración de la base compartida.'
      : 'Consultando gastos…'}</p>}
    {data && <>
      <section className="panel expense-panel" aria-label="Corte mensual">
        <h2>Corte mensual</h2>
        {!paymentsReady && <p className="form-note" role="status">Los ingresos y reembolsos aún no están disponibles.</p>}
        <dl className="expense-close">
          <div><dt>Ingresos</dt><dd>{paymentsReady ? mxn.format(close.received) : '—'}</dd></div>
          <div><dt>Reembolsos</dt><dd>{paymentsReady ? mxn.format(close.refunded) : '—'}</dd></div>
          <div><dt>Gastos pagados</dt><dd>{mxn.format(close.spent)}</dd></div>
          <div><dt>Neto del mes</dt><dd>{paymentsReady ? mxn.format(close.net) : '—'}</dd></div>
        </dl>
      </section>
      {editable && <div className="expense-toolbar">
        <button type="button" className="button primary" onClick={()=>open('expense')}>Registrar gasto</button>
        <button type="button" className="button outline" onClick={()=>open('bill')}>Nuevo pago mensual</button>
      </div>}
      {draft && <form className="panel form-stack expense-panel" key={`${draft.type}:${item.id || item.billId || 'new'}`} onSubmit={submit}>
        <h2>{showBillForm ? item.id ? 'Editar pago mensual' : 'Nuevo pago mensual' : item.id ? 'Editar gasto' : 'Registrar gasto'}</h2>
        <div className="form-grid">
          <label>Concepto<input name="name" maxLength="120" required defaultValue={item.name || ''}/></label>
          <label>Categoría<input name="category" maxLength="80" required defaultValue={item.category || ''}/></label>
        </div>
        {showBillForm ? <>
          <div className="form-grid">
            <label>Día de vencimiento<input name="dueDay" type="number" min="1" max="31" required defaultValue={item.dueDay ?? ''}/></label>
            <label>Mes de inicio<input name="startsMonth" type="month" readOnly={Boolean(item.id)} required defaultValue={item.startsMonth?.slice(0,7) || today.slice(0,7)}/></label>
          </div>
          <label>Importe estimado (MXN)<input name="estimate" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={item.estimate ?? ''}/></label>
        </> : <>
          {item.billMonth && <p className="form-note">Pago mensual del periodo {item.billMonth.slice(0,7)}</p>}
          <div className="form-grid">
            <label>Importe pagado (MXN)<input name="amount" type="number" min="0.01" max="9999999999.99" step="0.01" required defaultValue={item.amount ?? ''}/></label>
            <label>Fecha de pago<input name="paidOn" type="date" max={today} required defaultValue={item.paidOn || today}/></label>
          </div>
          <label>Nota opcional<input name="note" maxLength="500" defaultValue={item.note || ''}/></label>
        </>}
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={saving} onClick={()=>{setDraft(null);setError('');}}>Cancelar</button>
          <button className="button primary" disabled={saving}>{saving ? 'Guardando…' : showBillForm ? 'Guardar pago mensual' : 'Guardar gasto'}</button>
        </div>
      </form>}
      {error && <p className="form-note" role="alert">{error}</p>}
      <section className="panel payment-ledger expense-panel" aria-label="Pagos mensuales">
        <h2>Pagos mensuales</h2>
        {occurrences.length ? <div className="table-wrap"><table>
          <thead><tr><th>Concepto</th><th>Vencimiento</th><th>Estimado</th><th>Estado</th>{editable && <th>Acciones</th>}</tr></thead>
          <tbody>{occurrences.map(({bill,dueOn,expense,status})=><tr key={bill.id}>
            <td>{bill.name}<small>{bill.category}</small></td><td>{dueOn}</td><td>{bill.estimate == null ? '—' : mxn.format(bill.estimate)}</td>
            <td>{status}{expense && <small>Pagado el {expense.paidOn}</small>}</td>
            {editable && <td><div className="clinic-service-actions">
              {bill.active && !expense && <button type="button" className="button outline compact" disabled={saving} onClick={()=>open('expense',{
                name:bill.name,category:bill.category,amount:bill.estimate,billId:bill.id,billMonth:`${month}-01`,
              })}>Registrar pago</button>}
              <button type="button" className="button outline compact" disabled={saving} onClick={()=>open('bill',bill)}>Editar</button>
              {bill.active && <button type="button" className="button outline compact" disabled={saving} onClick={()=>void save('bill',{...bill,active:false})}>Archivar</button>}
            </div></td>}
          </tr>)}</tbody>
        </table></div> : <p className="empty-inline">Sin pagos mensuales para este periodo.</p>}
        {editable && data.bills.some(bill=>!bill.active) && <details className="expense-archive">
          <summary>Pagos mensuales archivados</summary>
          {data.bills.filter(bill=>!bill.active).map(bill=><div key={bill.id}>{bill.name} <button type="button" className="button outline compact" disabled={saving} onClick={()=>void save('bill',{...bill,active:true})}>Reactivar</button></div>)}
        </details>}
      </section>
      <section className="panel payment-ledger expense-panel" aria-label="Registro de gastos">
        <h2>Registro de gastos</h2>
        {close.expenses.length ? <div className="table-wrap"><table>
          <thead><tr><th>Fecha de pago</th><th>Concepto</th><th>Categoría</th><th>Importe</th>{editable && <th>Acciones</th>}</tr></thead>
          <tbody>{close.expenses.slice().sort((a,b)=>b.paidOn.localeCompare(a.paidOn)).map(expense=><tr key={expense.id}>
            <td>{expense.paidOn}</td><td>{expense.name}{expense.note && <small>{expense.note}</small>}</td><td>{expense.category}</td><td>{mxn.format(expense.amount)}</td>
            {editable && <td><button type="button" className="button outline compact" disabled={saving} onClick={()=>open('expense',expense)}>Editar gasto</button></td>}
          </tr>)}</tbody>
        </table></div> : <p className="empty-inline">Sin gastos pagados en este mes.</p>}
      </section>
    </>}
  </div>;
}
