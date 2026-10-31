'use client';
import {useEffect,useRef,useState} from 'react';
import {CalendarDays,CheckCircle2,Clock3,MapPin,ShieldCheck,ArrowLeft,Send,LoaderCircle} from 'lucide-react';

export default function PublicBooking({slug}){
  const [catalog,setCatalog]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [branch,setBranch]=useState(''),[service,setService]=useState(''),[provider,setProvider]=useState(''),[date,setDate]=useState('');
  const [slots,setSlots]=useState([]),[slotsLoading,setSlotsLoading]=useState(false),[slotError,setSlotError]=useState(''),[selected,setSelected]=useState(null);
  const [sending,setSending]=useState(false),[receipt,setReceipt]=useState('');
  const formLoadedAt=useRef(0);
  const api=`/api/public-agenda/${encodeURIComponent(slug)}`;
  useEffect(()=>{const controller=new AbortController();setLoading(true);setCatalog(null);setError('');setReceipt('');setBranch('');setService('');setProvider('');fetch(api,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);formLoadedAt.current=Date.now();setCatalog(data);setDate(data.today);}).catch(cause=>{if(cause.name!=='AbortError')setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[slug]);
  const offers=catalog?.offers||[];
  const branches=Array.from(new Map(offers.map(o=>[o.branchId,o.branch])).entries());
  const services=Array.from(new Map(offers.filter(o=>o.branchId===branch).map(o=>[o.serviceId,o.service])).entries());
  const providers=Array.from(new Map(offers.filter(o=>o.branchId===branch&&o.serviceId===service).map(o=>[o.providerId,o.provider])).entries());
  const offer=offers.find(o=>o.branchId===branch&&o.serviceId===service&&o.providerId===provider);
  useEffect(()=>{
    setSelected(null);setSlots([]);setSlotError('');
    if(!offer||!date){setSlotsLoading(false);return;}
    const controller=new AbortController();setSlotsLoading(true);
    fetch(`${api}?offer=${offer.id}&date=${date}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);setSlots(data.slots);}).catch(cause=>{if(cause.name!=='AbortError')setSlotError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setSlotsLoading(false);});
    return()=>controller.abort();
  },[offer?.id,date,slug]);
  async function submit(event){
    event.preventDefault();if(sending)return;setError('');
    if(!selected||!offer){setError('Selecciona un horario disponible.');return;}
    const fields=new FormData(event.currentTarget);setSending(true);
    try{
      // Autofill can complete immediately. Honor the server's brief challenge
      // delay here instead of rejecting a legitimate fast submission.
      const delay=2200-(Date.now()-formLoadedAt.current);
      if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
      const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge:catalog.challenge,offerId:offer.id,startsAt:selected.starts_at,name:fields.get('name'),phone:fields.get('phone'),email:fields.get('email'),consent:fields.get('consent')==='on',website:fields.get('website')})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setReceipt(data.id);
    }catch(cause){setError(cause.message||'No se pudo enviar tu solicitud. Vuelve a intentarlo.');}
    finally{setSending(false);}
  }
  const time=value=>new Intl.DateTimeFormat('es-MX',{timeZone:catalog.timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  return <main className="public-booking">
    <header className="public-booking-brand"><span><CalendarDays size={22}/></span><div><strong>{catalog?.name||'Agenda de citas'}</strong><p>Solicitudes de citas en línea</p></div></header>
    {loading?<section className="public-booking-panel" role="status"><LoaderCircle size={18}/> Consultando la agenda…</section>:!catalog?<section className="public-booking-panel"><h1>Agenda no disponible</h1><p role="alert">{error}</p><button type="button" className="button secondary compact" onClick={()=>window.location.reload()}>Volver a intentar</button></section>:receipt?<section className="public-booking-panel public-booking-receipt" role="status"><CheckCircle2 size={32}/><h1>Recibimos tu solicitud</h1><p>La clínica revisará el horario y te contactará por los datos que proporcionaste.</p><strong>Tu cita todavía no está confirmada.</strong><p>No se ha reservado el horario ni realizado ningún cobro.</p><p className="public-booking-reference">Folio: {receipt}</p><a className="button secondary compact" href={`/reservar/${slug}`}><ArrowLeft size={14}/> Volver a la agenda</a></section>:<>
      {!offers.length?<section className="public-booking-panel"><h1>No hay servicios disponibles</h1><p className="public-booking-description">La clínica no tiene opciones habilitadas para solicitudes en línea en este momento. Intenta más tarde.</p></section>:<section className="public-booking-panel">
        <h1>Solicitar una cita</h1><p className="public-booking-description">Elige dónde quieres atenderte y consulta los horarios disponibles. La solicitud queda sujeta a revisión de la clínica.</p>
        <form onSubmit={submit}>
          <fieldset disabled={sending}><legend>Servicio y horario</legend><div className="public-booking-fields">
            <label>Sucursal<select required value={branch} onChange={e=>{setBranch(e.target.value);setService('');setProvider('');}}><option value="">Seleccionar sucursal</option>{branches.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
            <label>Servicio<select required disabled={!branch} value={service} onChange={e=>{setService(e.target.value);setProvider('');}}><option value="">Seleccionar servicio</option>{services.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
            <label>Profesional<select required disabled={!service} value={provider} onChange={e=>setProvider(e.target.value)}><option value="">Seleccionar profesional</option>{providers.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
            <label>Fecha<input required type="date" value={date} min={catalog.today} max={catalog.lastDate} onChange={e=>setDate(e.target.value)}/></label>
          </div>
          {offer&&<div className="public-booking-summary"><span><Clock3 size={15}/> {offer.duration} minutos</span><span><MapPin size={15}/> {offer.branch}</span><span>Anticipo requerido: {new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(offer.deposit)} MXN</span></div>}
          {offer&&<div className="public-booking-slots" role="group" aria-label="Horarios disponibles">{slotsLoading?<p role="status">Consultando horarios…</p>:slotError?<p role="alert">{slotError}</p>:!slots.length?<p>No hay horarios disponibles para esta selección. Prueba otra fecha o profesional.</p>:slots.map(slot=><button type="button" key={slot.starts_at} aria-pressed={selected?.starts_at===slot.starts_at} onClick={()=>setSelected(slot)}>{time(slot.starts_at)}</button>)}</div>}
          <p className="public-booking-hint">Horarios en {catalog.timezone}. Anticipación mínima: {catalog.minNotice} minutos. Puedes solicitar hasta {catalog.maxDays} días por adelantado.</p>
          </fieldset>
          <fieldset disabled={sending}><legend>Tus datos de contacto</legend><div className="public-booking-fields">
            <label>Nombre completo<input name="name" autoComplete="name" required minLength={2} maxLength={160}/></label>
            <label>Teléfono internacional<input name="phone" type="tel" autoComplete="tel" required pattern="\+[1-9][0-9]{7,14}" placeholder="+526641234567" maxLength={16}/></label>
            <label>Correo electrónico{!catalog.requireEmail?' (opcional)':''}<input name="email" type="email" autoComplete="email" required={catalog.requireEmail} maxLength={254}/></label>
          </div><label className="public-booking-consent"><input name="consent" type="checkbox" required/> Acepto que la clínica me contacte para atender esta solicitud.</label>
          <div className="public-booking-honeypot" aria-hidden="true"><label>Sitio web<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
          </fieldset>
          {error&&<p className="public-booking-error" role="alert">{error}</p>}
          <div className="public-booking-submit"><p><ShieldCheck size={16}/> Enviar la solicitud no confirma la cita ni realiza un cobro. La clínica te indicará cómo registrar el anticipo.</p><button type="submit" className="button primary" disabled={sending||!selected}><Send size={15}/>{sending?'Enviando…':'Enviar solicitud'}</button></div>
        </form>
      </section>}
    </>}
  </main>;
}
