'use client';

import { useEffect, useRef } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';
import { agendaPalette, colorStyle } from '../lib/agenda-colors';

const toggle = (values, value) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];

export default function AgendaIdentityFilters({ providers, providerIds, setProviderIds, colorOptions, colors, setColors, query, setQuery, availabilityControls }) {
  const root = useRef(null);
  useEffect(() => {
    const closeOutside = event => { root.current?.querySelectorAll('details[open]').forEach(details => { if (!details.contains(event.target)) details.open = false; }); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const closeOnEscape = event => { if (event.key === 'Escape') event.currentTarget.open = false; };
  return <div className="agenda-identity-filters" ref={root}>
    <div className="agenda-identity-controls">
      <details className="agenda-multiselect" onKeyDown={closeOnEscape}><summary>Profesionales{providerIds.length > 0 && <span>{providerIds.length}</span>}<ChevronDown size={14}/></summary><div className="agenda-filter-menu"><strong>Quién atiende</strong><button type="button" className="text-link" onClick={() => setProviderIds([])}>Todas las personas</button>{providers.filter(item => item.id).map(provider => <label key={provider.id}><input type="checkbox" checked={providerIds.includes(provider.id)} onChange={() => setProviderIds(toggle(providerIds,provider.id))}/><span>{provider.name}</span></label>)}</div></details>
      <details className="agenda-multiselect" onKeyDown={closeOnEscape}><summary>Colores{colors.length > 0 && <span>{colors.length}</span>}<ChevronDown size={14}/></summary><div className="agenda-filter-menu agenda-color-menu"><strong>Colores de esta agenda</strong><button type="button" className="text-link" onClick={() => setColors([])}>Todos los colores</button>{colorOptions.map(option => <label key={option.id}><input type="checkbox" checked={colors.includes(option.id)} onChange={() => setColors(toggle(colors,option.id))}/><i className="agenda-color-dot" style={{'--appointment-color':option.hex}}/><span><strong>{option.label}</strong>{option.meaning&&<small>{option.meaning}</small>}</span></label>)}</div></details>
      {availabilityControls}
      <label className="agenda-search"><Search size={15}/><input type="search" aria-label="Buscar citas" placeholder="Buscar paciente, servicio o profesional" value={query} onChange={event => setQuery(event.target.value)}/></label>
    </div>
    {(providerIds.length > 0 || colors.length > 0 || query) && <div className="agenda-active-filters" aria-label="Filtros activos">
      {providerIds.map(id => <button type="button" key={id} onClick={() => setProviderIds(providerIds.filter(item => item !== id))} aria-label={`Quitar filtro de ${providers.find(item => item.id === id)?.name}`}><span>{providers.find(item => item.id === id)?.name}</span><X size={12}/></button>)}
      {colors.map(id => {
        const color = colorOptions.find(item => item.id === id) || agendaPalette.find(item => item.id === id);
        return <button type="button" key={id} onClick={() => setColors(colors.filter(item => item !== id))} aria-label={`Quitar filtro de color ${color?.label}`}><i className="agenda-color-dot" style={color ? {'--appointment-color':color.hex} : colorStyle(id)}/>{color?.label}<X size={12}/></button>;
      })}
      {query && <button type="button" onClick={() => setQuery('')}>Búsqueda: {query}<X size={12}/></button>}
    </div>}
  </div>;
}
