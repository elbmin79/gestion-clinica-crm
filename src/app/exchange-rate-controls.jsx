'use client';

import { useState } from 'react';
import { convertCurrency } from '../lib/exchange-rates';

export async function confirmReferenceRate(date, quote) {
  const response = await fetch('/api/exchange-rate', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ date, rateDate:quote.date, rate:quote.rate }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo confirmar el tipo de cambio.');
  return data;
}

export function useReferenceRate(date = '') {
  const [state,setState] = useState(null);
  const selected = state?.date === date ? state : null;
  async function refresh() {
    setState({date,loading:true});
    try {
      const path = date ? `/api/exchange-rate?date=${encodeURIComponent(date)}` : '/api/exchange-rate';
      const response = await fetch(path);
      const quote = await response.json();
      if (!response.ok) throw new Error();
      setState(current => current?.date === date ? {date,quote} : current);
    } catch {
      setState(current => current?.date === date ? {date,error:'El tipo de cambio no está disponible. Intenta de nuevo.'} : current);
    }
  }
  return { ...selected,refresh };
}

export function ExchangeRatePreview({ rate, amount, currency, disabled }) {
  let conversion;
  let error;
  if (rate.quote) {
    try { conversion = convertCurrency(amount,currency,rate.quote); }
    catch (cause) { error = cause.message; }
  }
  return <div className="exchange-rate-preview">
    <button type="button" className="button outline compact" disabled={disabled || rate.loading} onClick={()=>void rate.refresh()}>
      {rate.loading ? 'Consultando…' : 'Consultar tipo de cambio'}
    </button>
    <div aria-live="polite">
      {(rate.error || error) && <p className="form-note" role="alert">{rate.error || error}</p>}
      {rate.quote && <div className="form-note">
        <div>
          {conversion && <strong>{new Intl.NumberFormat('es-MX',{style:'currency',currency:conversion.currency,currencyDisplay:'code'}).format(conversion.amount)}</strong>}
          <span>{rate.quote.rate} MXN por USD · {rate.quote.date} · {rate.quote.source} (referencia)</span>
        </div>
      </div>}
    </div>
  </div>;
}

export default function CurrencyConverter() {
  const [currency,setCurrency] = useState('MXN');
  const [amount,setAmount] = useState('');
  const rate = useReferenceRate();
  return <section className="panel form-stack expense-panel" aria-label="Conversor de moneda">
    <h1>Conversor MXN ↔ USD</h1>
    <div className="form-grid">
      <label>Importe<input type="number" min="0" step="0.01" max="9999999999.99" value={amount} onChange={event=>setAmount(event.target.value)}/></label>
      <label>Moneda de origen<select value={currency} onChange={event=>setCurrency(event.target.value)}><option>MXN</option><option>USD</option></select></label>
    </div>
    <ExchangeRatePreview rate={rate} amount={amount} currency={currency}/>
  </section>;
}
