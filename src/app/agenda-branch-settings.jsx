'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { agendaPalette, normalizeService } from '../lib/agenda-colors';

export function readBranchSettings(form, branchIds) {
  return Object.fromEntries(branchIds.map(id => {
    const keywords = form.getAll(`ruleService:${id}`).map(normalizeService);
    const colors = form.getAll(`ruleColor:${id}`);
    if (keywords.some((keyword, index) => !keyword || keywords.indexOf(keyword) !== index)) throw new Error('Revisa los procedimientos: escribe un nombre distinto en cada regla.');
    return [id, { color: String(form.get(`color:${id}`) || ''), serviceColors: Object.fromEntries(keywords.map((keyword, index) => [keyword, colors[index]])) }];
  }));
}

function BranchSettings({ branch, settings = {} }) {
  const [rules, setRules] = useState(Object.entries(settings.serviceColors || {}).map(([service, color], index) => ({ key: index, service, color })));
  return <details className="branch-agenda-settings"><summary>Color de agenda y reglas por procedimiento</summary>
    <label>Color predeterminado · {branch.name}<select name={`color:${branch.id}`} defaultValue={settings.color || ''}><option value="">Sin color asignado</option>{agendaPalette.filter(color => color.id !== 'unassigned').map(color => <option value={color.id} key={color.id}>{color.label}</option>)}</select></label>
    <p>Las reglas se aplican al nombre del servicio. Una revisión tiene prioridad sobre el procedimiento.</p>
    {rules.map((rule, index) => <div className="agenda-rule" key={rule.key}>
      <label>Procedimiento {index + 1}<input name={`ruleService:${branch.id}`} aria-label={`Procedimiento ${index + 1} · ${branch.name}`} defaultValue={rule.service} placeholder="Ej. Morpheus" maxLength={80} required/></label>
      <label>Color<select name={`ruleColor:${branch.id}`} aria-label={`Color del procedimiento ${index + 1} · ${branch.name}`} defaultValue={rule.color}>{agendaPalette.filter(color => color.id !== 'unassigned').map(color => <option value={color.id} key={color.id}>{color.label}</option>)}</select></label>
      <button type="button" className="icon-button" aria-label={`Eliminar regla ${index + 1} · ${branch.name}`} onClick={() => setRules(previous => previous.filter(item => item.key !== rule.key))}><X size={15}/></button>
    </div>)}
    <button type="button" className="button outline compact" disabled={rules.length >= 20} onClick={() => setRules(previous => [...previous, { key: Math.max(-1,...previous.map(item => item.key)) + 1, service: '', color: settings.color || 'red' }])}><Plus size={14}/> Agregar regla</button>
  </details>;
}

export default function AgendaBranchSettings({ branches, provider }) {
  const [selectedIds, setSelectedIds] = useState(provider?.branchIds || []);
  return <fieldset className="professional-branches"><legend>Sucursales de atención</legend>{branches.filter(item => item.active !== false).map(branch => <div className="professional-branch" key={branch.id}>
    <label className="professional-branch-check"><input type="checkbox" name="branchIds" value={branch.id} checked={selectedIds.includes(branch.id)} onChange={event => setSelectedIds(previous => event.target.checked ? [...previous, branch.id] : previous.filter(id => id !== branch.id))}/>{branch.name}</label>
    {selectedIds.includes(branch.id) && <BranchSettings branch={branch} settings={provider?.branchSettings?.[branch.id]}/>}
  </div>)}</fieldset>;
}
