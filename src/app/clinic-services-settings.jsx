'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, Check, CircleAlert, Plus, RotateCcw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { initialClinicServices, serviceCategories, serviceSetupState } from '../lib/clinic-services';
import { hasClinicPermission } from '../lib/clinic-permissions.js';
import { createClinicServicesStore } from '../lib/supabase/clinic-services';

const money = amount => Number(amount).toLocaleString('es-MX', { maximumFractionDigits: 2 });
const readyForAgenda = item => item.active !== false && serviceSetupState(item) === 'ready';
const displayOffer = item => {
  const currency = item.currency === 'USD' ? 'USD' : item.currency === 'MXN' ? 'MXN' : 'Moneda por confirmar';
  const amount = item.amount == null ? 'Por cotizar' : `${currency} ${money(item.amount)}`;
  return `${item.kind === 'package' ? 'Paquete' : 'Sesión'} · ${amount}${item.sessions ? ` · ${item.sessions} sesiones` : item.kind === 'package' ? ' · sesiones por definir' : ''}`;
};

export default function ClinicServicesSettings({ clinicId, role, permissions = {}, branches = [], providers = [], sharedMode = true, onCatalogChange }) {
  const [services, setServices] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [lifecycle, setLifecycle] = useState('Activos');
  const [branchFilter, setBranchFilter] = useState('Todas');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const canManage = !sharedMode || hasClinicPermission(role, permissions, 'services.manage');

  const refresh = async () => {
    if (!sharedMode || !clinicId) { setServices(initialClinicServices); setStatus('ready'); return; }
    setStatus('loading'); setError('');
    try { const loaded=await createClinicServicesStore().load(clinicId); setServices(loaded); onCatalogChange?.(loaded); setStatus('ready'); }
    catch (cause) { setError(cause.message || 'No se pudo cargar el catálogo.'); setStatus('error'); }
  };
  useEffect(() => { refresh(); }, [clinicId, sharedMode]);

  const filtered = useMemo(() => services.filter(item => {
    const text = `${item.name} ${item.category} ${item.code} ${item.notes}`.toLocaleLowerCase('es-MX');
    return (!query || text.includes(query.toLocaleLowerCase('es-MX')))
      && (category === 'Todas' || item.category === category)
      && (lifecycle === 'Todos' || (lifecycle === 'Activos' ? item.active !== false : lifecycle === 'Inactivos' ? item.active === false : lifecycle === 'Pendientes de configuración' ? item.active !== false && !readyForAgenda(item) : readyForAgenda(item)))
      && (branchFilter === 'Todas' || !item.branchIds?.length || item.branchIds.includes(branchFilter));
  }), [services, query, category, lifecycle, branchFilter]);

  const persist = async record => {
    if (!canManage) return;
    setSaving(true); setError('');
    try {
      if (sharedMode) {
        const saved = await createClinicServicesStore().save(clinicId, record);
        const next=services.some(item => item.id === saved.id) ? services.map(item => item.id === saved.id ? saved : item) : [...services, saved];
        setServices(next); onCatalogChange?.(next);
      } else { const next=services.some(item => item.id === record.id) ? services.map(item => item.id === record.id ? record : item) : [...services, { ...record, id: `local-${Date.now()}` }]; setServices(next); onCatalogChange?.(next); }
      setEditing(null);
    } catch (cause) { setError(cause.message || 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const importInitial = async () => {
    setSaving(true); setError('');
    try { await createClinicServicesStore().seed(clinicId); await refresh(); }
    catch (cause) { setError(cause.message || 'No se pudo importar la lista.'); }
    finally { setSaving(false); }
  };

  if (status === 'loading') return <div className="settings-preview-content"><div className="empty-inline">Cargando catálogo de servicios…</div></div>;
  if (status === 'error' && !services.length) return <div className="settings-preview-content"><div className="form-note" role="alert"><CircleAlert size={16}/>{error}</div><button className="button secondary" onClick={refresh}><RotateCcw size={15}/> Reintentar</button></div>;

  return <div className="clinic-services-content">
    <div className="clinic-services-toolbar">
      <label className="clinic-services-search"><Search size={16}/><input aria-label="Buscar servicios" placeholder="Buscar por nombre, categoría o nota…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <label className="clinic-services-filter"><span>Categoría</span><select value={category} onChange={event=>setCategory(event.target.value)}><option>Todas</option>{serviceCategories.map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="clinic-services-filter"><span>Estado</span><select value={lifecycle} onChange={event=>setLifecycle(event.target.value)}><option>Activos</option><option>Todos</option><option>Listos para agenda</option><option>Pendientes de configuración</option><option>Inactivos</option></select></label>
      <label className="clinic-services-filter"><span>Sucursal</span><select value={branchFilter} onChange={event=>setBranchFilter(event.target.value)}><option value="Todas">Todas las sucursales</option>{branches.filter(branch=>branch.active).map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      {canManage&&<button className="button primary" onClick={()=>setEditing({ code:'', category:'Faciales', name:'', description:'', durationMin:'', durationMax:'', offers:[], variants:[], branchIds:[], providerIds:[], notes:'', source:'Capturado por la clínica', status:'setup_needed', active:true })}><Plus size={15}/> Nuevo servicio</button>}
    </div>
    {error&&<div className="form-note" role="alert"><CircleAlert size={16}/>{error}</div>}
    {sharedMode&&services.length===0&&canManage&&<div className="clinic-services-import"><div><strong>Lista clínica lista para revisar</strong><span>Importa {initialClinicServices.length} servicios. Los datos faltantes quedan marcados para configurar.</span></div><button className="button secondary" onClick={importInitial} disabled={saving}><Sparkles size={15}/> Importar lista inicial</button></div>}
    {!sharedMode&&<div className="clinic-services-import"><ShieldCheck size={16}/><span>Modo de demostración: los cambios se conservan en esta sesión del catálogo.</span></div>}
    {editing&&<ServiceEditor key={editing.id||'new'} service={editing} branches={branches.filter(branch=>branch.active)} providers={providers.filter(provider=>provider.active)} saving={saving} onCancel={()=>setEditing(null)} onSave={persist}/>}
    <p className="clinic-services-scroll-hint">En pantallas pequeñas, desliza la tabla horizontalmente para ver precios, disponibilidad y acciones.</p>
    <div className="clinic-services-table-wrap"><table className="clinic-services-table"><thead><tr><th>Servicio</th><th>Duración</th><th>Precios y paquetes</th><th>Disponibilidad</th><th>Estado de configuración</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>
      {filtered.map(item=>{
        const ready=readyForAgenda(item);
        return <tr key={item.id||item.code}><td><strong>{item.name}</strong><span>{item.category}{item.source?` · ${item.source}`:''}</span>{item.notes&&<small>{item.notes}</small>}</td>
          <td>{item.durationMin?`${item.durationMin}${item.durationMax&&item.durationMax!==item.durationMin?`–${item.durationMax}`:''} min`:'Por definir'}</td>
          <td>{item.offers?.length?item.offers.map((entry,index)=><span className="clinic-service-offer" key={`${entry.kind}-${index}`}>{displayOffer(entry)}</span>):<span>Por cotizar</span>}</td>
          <td>{item.branchIds?.length?item.branchIds.map(id=>branches.find(branch=>branch.id===id)?.name).filter(Boolean).join(', '):'Todas las sucursales'}<small>{item.providerIds?.length?`${item.providerIds.length} profesionales elegibles`:'Todos los profesionales de cada sucursal'}</small></td>
          <td><span className={`clinic-service-state${ready?' is-ready':''}`}>{item.active===false?'Inactivo':ready?'Listo para agendar':'Datos pendientes'}</span></td>
          <td><div className="clinic-service-actions">{canManage&&<><button className="button outline compact" onClick={()=>setEditing(item)}>Editar</button><button className="icon-button" title={item.active===false?'Reactivar servicio':'Archivar servicio'} aria-label={item.active===false?'Reactivar servicio':'Archivar servicio'} onClick={()=>persist({ ...item, active:item.active===false })}>{item.active===false?<RotateCcw size={15}/>:<Archive size={15}/>}</button></>}</div></td>
        </tr>;
      })}
      {!filtered.length&&<tr><td colSpan="6"><div className="empty-inline">No hay servicios que coincidan con estos filtros.</div></td></tr>}
    </tbody></table></div>
    <p className="clinic-services-footnote">Sin sucursales ni profesionales seleccionados, el servicio está disponible en toda la clínica. Las selecciones limitan la disponibilidad. Los importes de paquetes no equivalen al precio de una sesión y las monedas nunca se convierten automáticamente.</p>
  </div>;
}

function ServiceEditor({ service, branches, providers, onSave, onCancel, saving }) {
  const [record, setRecord] = useState(() => ({ ...service, offers: service.offers || [], variants: service.variants || [] }));
  const set = (field, value) => setRecord(current=>({ ...current, [field]:value }));
  const single = record.offers.find(item=>item.kind==='single') || {};
  const pack = record.offers.find(item=>item.kind==='package') || {};
  const save = event => {
    event.preventDefault();
    const offers=[
      ...(single.amount!==''&&single.amount!=null?[single]:[]),
      ...(pack.amount!==''&&pack.amount!=null?[pack]:[]),
    ];
    const min=record.durationMin?Number(record.durationMin):null, max=record.durationMax?Number(record.durationMax):min;
    const status=min&&offers.length&&offers.every(item=>item.currency!=='UNRESOLVED')?'ready':'setup_needed';
    onSave({ ...record, code:record.code||`custom-${crypto.randomUUID()}`, durationMin:min, durationMax:max, offers, status });
  };
  return <form className="clinic-service-editor" onSubmit={save}>
    <div className="clinic-service-editor-heading"><div><h3>{service.id?'Editar servicio':'Nuevo servicio'}</h3><p>La moneda y duración se guardan por separado. Deja el dato vacío si está por confirmar.</p></div><button type="button" className="button secondary compact" onClick={onCancel}>Cerrar</button></div>
    <div className="clinic-service-editor-grid"><label>Nombre<input required maxLength="180" value={record.name} onChange={event=>set('name',event.target.value)}/></label><label>Categoría<select value={record.category} onChange={event=>set('category',event.target.value)}>{serviceCategories.map(value=><option key={value}>{value}</option>)}</select></label><label>Duración mínima<input type="number" min="15" max="720" step="15" placeholder="Por definir" value={record.durationMin??''} onChange={event=>set('durationMin',event.target.value)}/></label><label>Duración máxima<input type="number" min="15" max="720" step="15" placeholder="Igual a la mínima" value={record.durationMax??''} onChange={event=>set('durationMax',event.target.value)}/></label></div>
    <label>Descripción<input maxLength="500" value={record.description||''} onChange={event=>set('description',event.target.value)} placeholder="Descripción opcional"/></label>
    <div className="clinic-service-editor-grid"><fieldset><legend>Sesión individual</legend><div className="clinic-service-money"><input aria-label="Precio por sesión" type="number" min="0.01" step="0.01" placeholder="Por cotizar" value={single.amount??''} onChange={event=>set('offers',[{...single,kind:'single',amount:event.target.value,currency:single.currency||'MXN'},...record.offers.filter(item=>item.kind!=='single')])}/><select aria-label="Moneda de sesión" value={single.currency||'MXN'} onChange={event=>set('offers',[{...single,kind:'single',currency:event.target.value},...record.offers.filter(item=>item.kind!=='single')])}><option value="MXN">MXN</option><option value="USD">USD</option><option value="UNRESOLVED">Por confirmar</option></select></div></fieldset><fieldset><legend>Paquete</legend><div className="clinic-service-money"><input aria-label="Precio del paquete" type="number" min="0.01" step="0.01" placeholder="No publicado" value={pack.amount??''} onChange={event=>set('offers',[...record.offers.filter(item=>item.kind!=='package'),{...pack,kind:'package',amount:event.target.value,currency:pack.currency||'MXN'}])}/><select aria-label="Moneda del paquete" value={pack.currency||'MXN'} onChange={event=>set('offers',[...record.offers.filter(item=>item.kind!=='package'),{...pack,kind:'package',currency:event.target.value}])}><option value="MXN">MXN</option><option value="USD">USD</option><option value="UNRESOLVED">Por confirmar</option></select><input aria-label="Sesiones por paquete" type="number" min="1" step="1" placeholder="Sesiones" value={pack.sessions??''} onChange={event=>set('offers',[...record.offers.filter(item=>item.kind!=='package'),{...pack,kind:'package',sessions:event.target.value?Number(event.target.value):null}])}/></div></fieldset></div>
    <fieldset className="clinic-service-branch-picker"><legend>Sucursales donde se ofrece</legend><small>Sin seleccionar significa todas las sucursales activas.</small>{branches.length?branches.map(branch=><label key={branch.id}><input type="checkbox" checked={(record.branchIds||[]).includes(branch.id)} onChange={event=>{const next=event.target.checked?[...(record.branchIds||[]),branch.id]:(record.branchIds||[]).filter(id=>id!==branch.id);set('branchIds',next);if(next.length)set('providerIds',(record.providerIds||[]).filter(id=>providers.some(provider=>provider.id===id&&provider.branchIds?.some(branchId=>next.includes(branchId)))))}}/>{branch.name}</label>):<span>No hay sucursales activas para asignar.</span>}</fieldset>
    <fieldset className="clinic-service-branch-picker"><legend>Profesionales autorizados</legend><small>Sin seleccionar significa todos los profesionales con acceso a la sucursal elegida.</small>{providers.filter(provider=>!(record.branchIds||[]).length||record.branchIds.some(id=>provider.branchIds?.includes(id))).length?providers.filter(provider=>!(record.branchIds||[]).length||record.branchIds.some(id=>provider.branchIds?.includes(id))).map(provider=><label key={provider.id}><input type="checkbox" checked={(record.providerIds||[]).includes(provider.id)} onChange={event=>set('providerIds',event.target.checked?[...(record.providerIds||[]),provider.id]:(record.providerIds||[]).filter(id=>id!==provider.id))}/>{provider.name}</label>):<span>Primero asigna una sucursal con profesionales activos.</span>}</fieldset>
    <label>Variantes y opciones<input value={(record.variants||[]).join(', ')} onChange={event=>set('variants',event.target.value.split(',').map(value=>value.trim()).filter(Boolean))} placeholder="Separadas por comas: área, producto, unidades"/></label>
    <label>Notas de configuración<textarea rows="2" maxLength="1000" value={record.notes||''} onChange={event=>set('notes',event.target.value)} placeholder="Datos faltantes, variantes o notas de origen"/></label>
    <div className="clinic-service-editor-actions"><span>Sin restricciones explícitas, aparece para toda la clínica. Si la duración está pendiente, se captura al agendar.</span><div><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={saving}><Check size={15}/>{saving?'Guardando…':'Guardar servicio'}</button></div></div>
  </form>;
}
