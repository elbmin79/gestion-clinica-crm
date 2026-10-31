'use client';
import {useEffect,useRef,useState} from 'react';
import {CalendarDays,Check,CheckCircle2,CircleAlert,ExternalLink,Plus,RefreshCw,Save,Trash2,X} from 'lucide-react';
import {createClient} from '../lib/supabase/client';
import {hasClinicPermission} from '../lib/clinic-permissions.js';

const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const minuteText=value=>value===null||value===''?'':`${String(Math.floor(Number(value)/60)%24).padStart(2,'0')}:${String(Number(value)%60).padStart(2,'0')}`;
const minuteValue=(value,end=false)=>{if(!value)return null;const [hour,minute]=value.split(':').map(Number);return end&&hour===0&&minute===0?1440:hour*60+minute;};
const slugFor=name=>(name||'mi-clinica').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);

export default function PublicAgendaSettings({clinicId,clinicName,role,permissions={},sharedMode,branches=[],providers=[],services=[],patients=[],timeZone,onApproved}){
  const [settings,setSettings]=useState({slug:slugFor(clinicName),published:false,min_notice_minutes:1440,max_days:90,buffer_minutes:0,require_email:false});
  const [offers,setOffers]=useState([]),[hours,setHours]=useState([]),[requests,setRequests]=useState([]),[patientLinks,setPatientLinks]=useState({});
  const [status,setStatus]=useState('loading'),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState('pending');
  const [readiness,setReadiness]=useState({configured:false});
  const loadVersion=useRef(0);
  const canRead=sharedMode&&clinicId,canManage=!sharedMode||hasClinicPermission(role,permissions,'public_agenda.manage');
  const canReview=action=>!sharedMode||hasClinicPermission(role,permissions,action);
  async function load(){
    if(!canRead)return;const version=++loadVersion.current;setError('');setStatus('loading');
    const client=createClient();
    const results=await Promise.all([
      client.from('public_agenda_settings').select('*').eq('clinic_id',clinicId).maybeSingle(),
      client.from('public_agenda_offers').select('*').eq('clinic_id',clinicId).eq('active',true).order('id'),
      client.from('public_agenda_hours').select('*').eq('clinic_id',clinicId).order('day_of_week').order('on_date').order('opens_minute'),
      client.from('public_booking_requests').select('id,offer_id,full_name,phone,email,starts_at,ends_at,service_name,deposit_amount,status,appointment_id,created_at').eq('clinic_id',clinicId).order('created_at',{ascending:false}).limit(100),
      fetch(`/api/public-agenda-status?clinicId=${clinicId}`,{cache:'no-store'}).then(async response=>({data:await response.json(),error:response.ok?null:true})).catch(()=>({error:true})),
    ]);
    if(version!==loadVersion.current)return;
    if(results.some(result=>result.error)){setError('No se pudo cargar la agenda pública. Revisa la conexión y la migración de este módulo.');setStatus('error');return;}
    if(results[0].data)setSettings(results[0].data);
    setReadiness(results[4].data);
    setOffers(results[1].data.map(o=>({...o,saved:true})));setHours(results[2].data);setRequests(results[3].data);setStatus('ready');
  }
  useEffect(()=>{load();return()=>{loadVersion.current++;};},[clinicId,role,sharedMode]);
  async function refreshRequests(){
    try{
      const {data,error}=await createClient().from('public_booking_requests').select('id,offer_id,full_name,phone,email,starts_at,ends_at,service_name,deposit_amount,status,appointment_id,created_at').eq('clinic_id',clinicId).order('created_at',{ascending:false}).limit(100);
      if(error)throw error;
      setRequests(data);
    }catch{setError('No se pudieron actualizar las solicitudes. Vuelve a intentarlo.');}
  }
  const updateSetting=(key,value)=>setSettings(current=>({...current,[key]:value}));
  const updateOffer=(id,key,value)=>setOffers(current=>current.map(o=>{
    if(o.id!==id)return o;
    const next={...o,[key]:value};
    if(key==='service_id'){
      const service=services.find(s=>s.id===value);
      next.duration_minutes=service?.durationMin&&service.durationMin===service.durationMax?service.durationMin:'';
    }
    return next;
  }));
  const updateHour=(id,values)=>setHours(current=>current.map(h=>h.id===id?{...h,...values}:h));
  const combinations=Array.from(new Map(offers.filter(o=>o.branch_id&&o.provider_id).map(o=>[`${o.branch_id}:${o.provider_id}`,o])).entries());
  const branchName=id=>branches.find(b=>b.id===id)?.name||'Sucursal';
  const providerName=id=>providers.find(p=>p.id===id)?.name||'Profesional';
  async function save(event){
    event.preventDefault();if(busy)return;setBusy('save');setError('');setNotice('');
    try{
      if(settings.published&&!readiness.configured)throw new Error('El servidor todavía no está configurado para recibir solicitudes públicas. Revisa el aviso de configuración de esta página.');
      if(new Set(offers.map(o=>`${o.service_id}:${o.branch_id}:${o.provider_id}`)).size!==offers.length)throw new Error('No repitas la misma combinación de servicio, sucursal y profesional.');
      const {error}=await createClient().rpc('save_public_agenda',{p_clinic:clinicId,p_settings:settings,p_offers:offers.map(({saved,...offer})=>offer),p_hours:hours});
      if(error)throw new Error(error.message.includes('duplicate key')?'El enlace o una combinación de servicio, sucursal y profesional ya existe.':error.message);
      await load();setNotice('Configuración de agenda pública guardada.');
    }catch(cause){setError(cause.message||'No se pudo guardar la configuración.');}finally{setBusy('');}
  }
  async function review(request,action){
    const requiredPermission=action==='approve'?'agenda.create':'agenda.cancel';
    if(!canReview(requiredPermission)){setError('Tu cuenta no tiene permiso para realizar esta acción de agenda.');return;}
    if(busy)return;setBusy(request.id);setError('');setNotice('');
    try{
      const {data,error}=await createClient().rpc('review_public_booking',{p_request:request.id,p_action:action,p_patient:patientLinks[request.id]||null});
      if(error)throw new Error(error.message);
      if(action==='approve'){
        onApproved?.();
        void fetch('/api/integrations/google-calendar/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clinicId})}).catch(()=>{});
      }
      await refreshRequests();setNotice(action==='approve'?'Cita pendiente creada. Registra el anticipo antes de confirmar.':'Solicitud rechazada. No se creó una cita.');
      window.dispatchEvent(new Event('crm-staff-alerts'));
      return data;
    }catch(cause){setError(cause.message||'No se pudo revisar la solicitud.');}finally{setBusy('');}
  }
  if(!canRead)return <div className="settings-preview-content"><div className="settings-preview-banner"><CalendarDays size={17}/><div><strong>Agenda pública de la clínica</strong><span>{sharedMode?'Administración y recepción pueden revisar solicitudes. Solo administración configura la página.':'Conecta una clínica compartida para configurar horarios y recibir solicitudes reales.'}</span></div></div></div>;
  const dateText=value=>new Intl.DateTimeFormat('es-MX',{timeZone:timeZone||'America/Tijuana',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  if(!canManage){
    const formatDate=value=>new Intl.DateTimeFormat('es-MX',{timeZone:timeZone||'America/Tijuana',dateStyle:'medium'}).format(new Date(`${value}T12:00:00`));
    const selectedRequests=requests;
    return <div className="public-agenda-settings public-agenda-read-only" aria-busy={status==='loading'}>
      <div className="settings-preview-banner"><CalendarDays size={17}/><div><strong>Agenda pública · Solo lectura</strong><span>Puedes consultar la configuración y las solicitudes. No tienes acceso para hacer cambios.</span></div></div>
      {error&&<p className="professional-error" role="alert"><CircleAlert size={15}/>{error}</p>}
      {status==='loading'&&<p className="public-agenda-hint" role="status">Cargando agenda pública…</p>}
      {status==='error'&&<p className="professional-error" role="status"><CircleAlert size={15}/>No se pudo cargar la agenda pública.</p>}
      {status==='ready'&&<>
        {settings.published&&!readiness.configured&&<p className="professional-error" role="status"><CircleAlert size={15}/>La agenda figura como publicada, pero el servidor no puede recibir solicitudes ahora. El equipo administrador debe revisar la configuración del servidor.</p>}
        <section className="public-agenda-section">
          <div className="google-calendar-section-heading"><div><strong>Página de reservas</strong><span>Configuración vigente</span></div><span className={`public-agenda-read-status${settings.published&&readiness.configured?' is-available':''}`}>{settings.published?(readiness.configured?'Disponible':'No disponible'):'No publicada'}</span></div>
          <dl className="public-agenda-read-grid">
            <div><dt>Enlace público</dt><dd>/reservar/{settings.slug||'—'}</dd></div>
            <div><dt>Anticipación mínima</dt><dd>{settings.min_notice_minutes} min</dd></div>
            <div><dt>Días por adelantado</dt><dd>{settings.max_days}</dd></div>
            <div><dt>Separación entre citas</dt><dd>{settings.buffer_minutes} min</dd></div>
            <div><dt>Correo obligatorio</dt><dd>{settings.require_email?'Sí':'No'}</dd></div>
            <div><dt>Zona horaria</dt><dd>{timeZone||'America/Tijuana'}</dd></div>
          </dl>
        </section>
        <section className="public-agenda-section">
          <div className="google-calendar-section-heading"><div><strong>Servicios, profesionales y sucursales visibles</strong><span>{offers.length} {offers.length===1?'opción':'opciones'}</span></div></div>
          {offers.length?offers.map((offer,index)=><div className="public-agenda-read-row" key={offer.id}><strong>{services.find(service=>service.id===offer.service_id)?.name||`Servicio ${index+1}`}</strong><span>{branchName(offer.branch_id)} · {providerName(offer.provider_id)}</span><span>{offer.duration_minutes} min · Anticipo {Number(offer.deposit_amount).toFixed(2)} MXN</span></div>):<p className="public-agenda-hint">No hay servicios configurados para la página pública.</p>}
        </section>
        <section className="public-agenda-section">
          <div className="google-calendar-section-heading"><div><strong>Horarios para pacientes</strong><span>Los bloqueos de disponibilidad y las citas existentes se respetan.</span></div></div>
          {hours.length?hours.map(hour=><div className="public-agenda-read-row" key={hour.id}><strong>{hour.on_date?formatDate(hour.on_date):days[hour.day_of_week]||'Horario'}</strong><span>{branchName(hour.branch_id)} · {providerName(hour.provider_id)}</span><span>{hour.closed?'Cerrado':`${minuteText(hour.opens_minute)}–${minuteText(hour.closes_minute)}`}</span></div>):<p className="public-agenda-hint">No hay horarios configurados.</p>}
        </section>
        <section className="public-agenda-requests" aria-labelledby="public-requests-title"><div className="google-calendar-section-heading"><div><strong id="public-requests-title">Solicitudes de pacientes</strong><span>Últimas {selectedRequests.length} solicitudes</span></div></div>
          {selectedRequests.map(request=><article className="public-agenda-request" key={request.id}><div><strong>{request.full_name}</strong><span>{request.service_name} · {dateText(request.starts_at)}</span><span>{request.phone}{request.email?` · ${request.email}`:''}</span><span>Anticipo requerido: {Number(request.deposit_amount).toFixed(2)} MXN · Folio {request.id.slice(0,8)}</span></div><span className="settings-option-status">{request.status==='pending'?'Por revisar':request.status==='approved'?'Aprobada':'Rechazada'}</span>{request.appointment_id&&<a className="text-link" href={`/agenda?clinic=${clinicId}&appointment=${request.appointment_id}`}>Ver cita en agenda</a>}</article>)}
          {!selectedRequests.length&&<p className="public-agenda-hint">No hay solicitudes de pacientes.</p>}
        </section>
      </>}
    </div>;
  }
  return <div className="public-agenda-settings" aria-busy={Boolean(busy)||status==='loading'}>
    <div className="settings-preview-banner"><CalendarDays size={17}/><div><strong>Solicitudes con revisión del equipo</strong><span>La página muestra horarios disponibles. Enviar una solicitud no reserva el espacio ni confirma una cita. La aprobación vuelve a comprobar el horario.</span></div></div>
    {error&&<p className="professional-error" role="alert"><CircleAlert size={15}/>{error}</p>}
    {notice&&<p className="form-note" role="status"><CheckCircle2 size={15}/>{notice}</p>}
    {status==='loading'&&<p className="public-agenda-hint" role="status">Cargando agenda pública…</p>}
    {status==='ready'&&!readiness.configured&&<p className="professional-error" role="status"><CircleAlert size={15}/>La agenda no puede recibir solicitudes en este despliegue. Configuración faltante: {[!readiness.secretConfigured&&'PUBLIC_BOOKING_SECRET (mínimo 32 caracteres)',!readiness.databaseConfigured&&'SUPABASE_SERVICE_ROLE_KEY',readiness.requiresCaptcha&&!readiness.captchaSiteConfigured&&'TURNSTILE_SITE_KEY',readiness.requiresCaptcha&&!readiness.captchaSecretConfigured&&'TURNSTILE_SECRET_KEY'].filter(Boolean).join(', ')}.</p>}
    {status==='error'&&<button className="button secondary compact" type="button" onClick={load}><RefreshCw size={14}/> Reintentar</button>}
    <form onSubmit={save}>
      <fieldset className="public-agenda-fields" disabled={!canManage||status!=='ready'||Boolean(busy)}>
        <section className="public-agenda-section"><div className="google-calendar-section-heading"><div><strong>Página de reservas</strong><span>Define el enlace y cuándo puede usarse.</span></div><label className="public-agenda-toggle"><input type="checkbox" checked={settings.published} onChange={e=>updateSetting('published',e.target.checked)}/> Publicada</label></div>
          <div className="public-agenda-grid"><label>Identificador del enlace<input name="slug" required minLength={3} maxLength={60} pattern="[a-z0-9][a-z0-9\\-]{2,59}" value={settings.slug} onChange={e=>updateSetting('slug',e.target.value)} placeholder="mi-clinica"/></label>
          <label>Anticipación mínima (minutos)<input name="minNotice" type="number" required min={0} max={43200} value={settings.min_notice_minutes} onChange={e=>updateSetting('min_notice_minutes',e.target.value)}/></label>
          <label>Días por adelantado<input name="maxDays" type="number" required min={1} max={365} value={settings.max_days} onChange={e=>updateSetting('max_days',e.target.value)}/></label>
          <label>Separación entre citas (minutos)<input name="buffer" type="number" required min={0} max={120} value={settings.buffer_minutes} onChange={e=>updateSetting('buffer_minutes',e.target.value)}/></label></div>
          <label className="public-agenda-toggle public-agenda-email"><input type="checkbox" checked={settings.require_email} onChange={e=>updateSetting('require_email',e.target.checked)}/> Solicitar correo electrónico obligatorio</label>
          <p className="public-agenda-hint">Nombre, teléfono internacional y autorización de contacto son obligatorios. La capacidad pública es una cita por profesional a la vez. Zona horaria: {timeZone}.</p>
        </section>
        <section className="public-agenda-section"><div className="google-calendar-section-heading"><div><strong>Servicios, profesionales y sucursales visibles</strong><span>Cada opción necesita una duración y un anticipo definidos por la clínica.</span></div><button type="button" className="button outline compact" onClick={()=>setOffers(current=>[...current,{id:crypto.randomUUID(),service_id:'',branch_id:'',provider_id:'',duration_minutes:'',deposit_amount:''}])}><Plus size={14}/> Agregar opción</button></div>
          {!offers.length&&<p className="public-agenda-hint">No hay opciones públicas. Agrega los servicios que quieres ofrecer.</p>}
          {offers.map((o,index)=><div className="public-agenda-offer" key={o.id}>
            <label>Servicio {index+1}<select aria-label={`Servicio público ${index+1}`} required value={o.service_id} disabled={o.saved} onChange={e=>updateOffer(o.id,'service_id',e.target.value)}><option value="">Seleccionar servicio</option>{services.filter(s=>s.active!==false||s.id===o.service_id).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>Sucursal<select aria-label={`Sucursal pública ${index+1}`} required value={o.branch_id} disabled={o.saved} onChange={e=>updateOffer(o.id,'branch_id',e.target.value)}><option value="">Seleccionar sucursal</option>{branches.filter(b=>b.active!==false||b.id===o.branch_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label>Profesional<select aria-label={`Profesional público ${index+1}`} required value={o.provider_id} disabled={o.saved} onChange={e=>updateOffer(o.id,'provider_id',e.target.value)}><option value="">Seleccionar profesional</option>{providers.filter(p=>(p.active!==false&&(!o.branch_id||p.branchIds?.includes(o.branch_id)))||p.id===o.provider_id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Duración (min)<input aria-label={`Duración pública ${index+1}`} required type="number" min={15} max={720} step={15} value={o.duration_minutes} onChange={e=>updateOffer(o.id,'duration_minutes',e.target.value)}/></label>
            <label>Anticipo (MXN)<input aria-label={`Anticipo público ${index+1}`} required type="number" min="0.01" step="0.01" value={o.deposit_amount} onChange={e=>updateOffer(o.id,'deposit_amount',e.target.value)}/></label>
            <button className="icon-button" type="button" aria-label={`Quitar opción pública ${index+1}`} onClick={()=>setOffers(current=>current.filter(item=>item.id!==o.id))}><Trash2 size={15}/></button>
          </div>)}
          <p className="public-agenda-hint">Para cambiar las asignaciones de una opción guardada, quítala y agrega una nueva. Los servicios sin duración en el catálogo requieren que la captures aquí.</p>
        </section>
        <section className="public-agenda-section"><div className="google-calendar-section-heading"><div><strong>Horarios para pacientes</strong><span>Define ventanas semanales o excepciones por fecha. Los bloqueos de Disponibilidad y las citas existentes se respetan automáticamente.</span></div><button type="button" className="button outline compact" onClick={()=>setHours(current=>[...current,{id:crypto.randomUUID(),branch_id:combinations[0]?.[1].branch_id||'',provider_id:combinations[0]?.[1].provider_id||'',day_of_week:1,on_date:null,closed:false,opens_minute:540,closes_minute:1020}])}><Plus size={14}/> Agregar horario</button></div>
          {hours.map((h,index)=><div className="public-agenda-hour" key={h.id}>
            <label>Sucursal y profesional<select aria-label={`Asignación de horario ${index+1}`} required value={h.branch_id&&h.provider_id?`${h.branch_id}:${h.provider_id}`:''} onChange={e=>{const [branch_id,provider_id]=e.target.value.split(':');updateHour(h.id,{branch_id,provider_id});}}><option value="">Seleccionar asignación</option>{combinations.map(([key,o])=><option key={key} value={key}>{branchName(o.branch_id)} · {providerName(o.provider_id)}</option>)}</select></label>
            <label>Tipo<select aria-label={`Tipo de horario ${index+1}`} value={h.on_date!==null?'date':'weekly'} onChange={e=>updateHour(h.id,e.target.value==='weekly'?{day_of_week:1,on_date:null,closed:false,opens_minute:540,closes_minute:1020}:{day_of_week:null,on_date:'',closed:false,opens_minute:540,closes_minute:1020})}><option value="weekly">Semanal</option><option value="date">Fecha específica</option></select></label>
            {h.on_date!==null?<label>Fecha<input aria-label={`Fecha de excepción ${index+1}`} required type="date" value={h.on_date||''} onChange={e=>updateHour(h.id,{on_date:e.target.value})}/></label>:<label>Día<select aria-label={`Día de horario ${index+1}`} value={h.day_of_week} onChange={e=>updateHour(h.id,{day_of_week:Number(e.target.value)})}>{days.map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label>}
            {h.on_date!==null&&<label className="public-agenda-toggle"><input type="checkbox" checked={h.closed} onChange={e=>updateHour(h.id,e.target.checked?{closed:true,opens_minute:null,closes_minute:null}:{closed:false,opens_minute:540,closes_minute:1020})}/> Cerrado</label>}
            {!h.closed&&<><label>Desde<input aria-label={`Inicio de horario ${index+1}`} type="time" required step={900} value={minuteText(h.opens_minute)} onChange={e=>updateHour(h.id,{opens_minute:minuteValue(e.target.value)})}/></label><label>Hasta<input aria-label={`Fin de horario ${index+1}`} type="time" required step={900} value={minuteText(h.closes_minute)} onChange={e=>updateHour(h.id,{closes_minute:minuteValue(e.target.value,true)})}/></label></>}
            <button className="icon-button" type="button" aria-label={`Quitar horario público ${index+1}`} onClick={()=>setHours(current=>current.filter(item=>item.id!==h.id))}><Trash2 size={15}/></button>
          </div>)}
          <p className="public-agenda-hint">Una fecha específica reemplaza los horarios semanales de ese día para esa asignación. 00:00 en “Hasta” indica cierre a medianoche. Los inicios usan intervalos de 15 minutos entre 06:00 y medianoche.</p>
        </section>
        <div className="public-agenda-actions"><div className="public-agenda-link"><span>Enlace público: <code>/reservar/{settings.slug}</code></span>{settings.published&&<a className="button outline compact" href={`/reservar/${settings.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Abrir página</a>}</div><button className="button primary compact" type="submit"><Save size={15}/>{busy==='save'?'Guardando…':'Guardar agenda pública'}</button></div>
      </fieldset>
    </form>
    <section className="public-agenda-requests" aria-labelledby="public-requests-title"><div className="google-calendar-section-heading"><div><strong id="public-requests-title">Solicitudes de pacientes</strong><span>Últimas 100 solicitudes. Revisa los datos y el expediente antes de aprobar.</span></div><button className="button outline compact" type="button" disabled={Boolean(busy)} onClick={()=>{setBusy('refresh');void refreshRequests().finally(()=>setBusy(''));}}><RefreshCw size={14}/> Actualizar solicitudes</button></div>
      <label className="public-agenda-request-filter">Estado<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">Por revisar</option><option value="approved">Aprobadas</option><option value="rejected">Rechazadas</option><option value="all">Todas</option></select></label>
      {requests.filter(r=>filter==='all'||r.status===filter).map(r=><article className="public-agenda-request" key={r.id}><div><strong>{r.full_name}</strong><span>{r.service_name} · {dateText(r.starts_at)}</span><span>{r.phone}{r.email?` · ${r.email}`:''}</span><span>Anticipo requerido: {Number(r.deposit_amount).toFixed(2)} MXN · Folio {r.id.slice(0,8)}</span></div>
        {r.status==='pending'?<div className="public-agenda-review">{canReview('agenda.create')&&<label>Expediente<select aria-label={`Expediente para ${r.full_name}`} value={patientLinks[r.id]||''} onChange={e=>setPatientLinks(current=>({...current,[r.id]:e.target.value}))}><option value="">Crear nuevo expediente al aprobar</option>{patients.filter(p=>p.databaseId).map(p=><option key={p.databaseId} value={p.databaseId}>{p.name} · {p.id}</option>)}</select></label>}<div>{canReview('agenda.create')&&<button className="button primary compact" type="button" disabled={Boolean(busy)} onClick={()=>review(r,'approve')}><Check size={14}/> Crear cita pendiente</button>}{canReview('agenda.cancel')&&<button className="button secondary compact" type="button" disabled={Boolean(busy)} onClick={()=>review(r,'reject')}><X size={14}/> Rechazar</button>}</div></div>:<span className="settings-option-status">{r.status==='approved'?'Aprobada':'Rechazada'}</span>}
        {r.appointment_id&&<a className="text-link" href={`/agenda?clinic=${clinicId}&appointment=${r.appointment_id}`}>Ver cita en agenda</a>}
      </article>)}
      {!requests.some(r=>filter==='all'||r.status===filter)&&<p className="public-agenda-hint">No hay solicitudes en este estado.</p>}
      <p className="public-agenda-hint">La aprobación crea una cita “Por confirmar”. El anticipo se registra en Pagos. Esta página no envía confirmaciones automáticas al paciente ni concede autorización para WhatsApp.</p>
    </section>
  </div>;
}
