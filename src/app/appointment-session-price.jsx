'use client';

import { useState } from 'react';

export default function AppointmentSessionPrice({ price, promotionNames = [] }) {
  const [draft, setDraft] = useState(null);
  const quote = draft || { amount: price?.amount ?? '', currency: price?.currency || 'MXN' };
  return <>
  <div className="form-grid">
    <label>Costo de la sesión
      <input name="sessionPriceAmount" type="number" min="0" max="9999999999.99" step="0.01"
        placeholder="Por cotizar" value={quote.amount} onChange={event => setDraft({ ...quote, amount: event.target.value })}/>
    </label>
    <label>Moneda del costo
      <select name="sessionPriceCurrency" value={quote.currency} onChange={event => setDraft({ ...quote, currency: event.target.value })}>
        <option value="MXN">MXN</option>
        <option value="USD">USD</option>
      </select>
    </label>
  </div>
  {!draft && promotionNames.length > 0 && <div className="form-note">Precio promocional · {promotionNames.join(', ')}</div>}
  </>;
}
