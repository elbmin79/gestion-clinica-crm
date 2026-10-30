'use client';
import { useEffect,useState } from 'react';
import { Bell, BellOff, Save, Send, CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { createClient } from '../lib/supabase/client';
import { defaultNotificationPreferences,loadNotificationPreferences,saveNotificationPreferences,demoPreferenceKey } from '../lib/staff-notifications';

export default function PushSettings({clinicId,sharedMode,role}) {
  const [preferences,setPreferences]=useState(defaultNotificationPreferences);
  const [state,setState]=useState('loading');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [permission,setPermission]=useState('default');
  const [supported,setSupported]=useState(false);
  const [server,setServer]=useState({configured:false,publicKey:''});
  const [device,setDevice]=useState(null);
  const [registration,setRegistration]=useState(null);
  const endpoint=`/api/notifications/push?clinicId=${encodeURIComponent(clinicId || '')}`;
  useEffect(()=>{
    let active=true;
    setState('loading');setError('');setMessage('');setDevice(null);setServer({configured:false,publicKey:''});
    const available=window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(available);setPermission('Notification' in window?Notification.permission:'unsupported');
    (async()=>{
      try{
        if(!sharedMode){
          const saved=JSON.parse(localStorage.getItem(demoPreferenceKey)||'{}');
          if(active){setPreferences({...defaultNotificationPreferences,...saved});setState('ready');}return;
        }
        if(!clinicId)return;
        const prefs=await loadNotificationPreferences(clinicId);
        const response=await fetch(endpoint,{cache:'no-store'});const status=await response.json();
        if(!response.ok)throw new Error(status.error || 'No se pudo consultar la entrega push.');
        let reg=null,sub=null,linked=false;
        if(available){
          try{
          reg=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
          await navigator.serviceWorker.ready;
          sub=await reg.pushManager.getSubscription();
          if(sub){
            const result=await createClient().from('staff_push_subscriptions').select('id').eq('clinic_id',clinicId).eq('endpoint',sub.endpoint).maybeSingle();
            if(result.error)throw new Error('No se pudo consultar el dispositivo.');
            linked=Boolean(result.data);
          }
          }catch{if(active)setError('Las preferencias están disponibles, pero no se pudo consultar el dispositivo. Recarga la página para volver a intentarlo.');}
        }
        if(active){setPreferences(prefs);setServer(status);setRegistration(reg);setDevice(linked?sub:null);setState('ready');}
      }catch(cause){if(active){setError(cause.message);setState('error');}}
    })();
    return()=>{active=false;};
  },[clinicId,sharedMode]);
  async function save(event){
    event.preventDefault();setBusy(true);setMessage('');setError('');
    try{if(sharedMode)await saveNotificationPreferences(clinicId,preferences);else localStorage.setItem(demoPreferenceKey,JSON.stringify(preferences));setMessage('Preferencias guardadas.');}
    catch(cause){setError(cause.message);}finally{setBusy(false);}
  }
  async function deviceAction(action){
    setBusy(true);setMessage('');setError('');
    try{
      let sub=await registration.pushManager.getSubscription();
      if(action==='enable'){
        const permission=await Notification.requestPermission();setPermission(permission);
        if(permission!=='granted')throw new Error('El navegador no autorizó los avisos. Puedes cambiar el permiso en la configuración del sitio.');
        sub ||= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(atob(server.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))});
      }
      if(!sub)throw new Error('Este dispositivo aún no está registrado.');
      const response=await fetch(endpoint,{method:action==='disable'?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='disable'?{endpoint:sub.endpoint}:{subscription:sub.toJSON(),action})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      if(action==='disable'){await sub.unsubscribe();setDevice(null);setMessage('Notificaciones desactivadas en este dispositivo.');}
      else if(action==='enable'){setDevice(sub);setMessage('Dispositivo activado para esta clínica.');}
      else setMessage(result.counts?.sent?'Prueba enviada. Comprueba las notificaciones del dispositivo.':result.counts?.skipped?'La prueba no se envió. Revisa tus preferencias guardadas de entrega a dispositivos.':'Prueba en cola. La entrega depende de tus preferencias guardadas y del servicio de envío.');
    }catch(cause){setError(cause.message || 'No se pudo configurar el dispositivo. Vuelve a intentarlo.');}finally{setBusy(false);}
  }
  return <div className="settings-preview-content push-settings" aria-busy={state==='loading'||busy}>
    <div className="settings-preview-banner"><Bell size={17}/><div><strong>Preferencias por usuario</strong>
    <span>{sharedMode?'Tus preferencias se guardan por clínica y se aplican en todos tus dispositivos.':'Modo demo: las preferencias y los avisos de citas se guardan solo en este navegador. La entrega push requiere una cuenta compartida.'}</span></div></div>

    {state==='loading'&&<p role="status" className="whatsapp-settings-loading"><LoaderCircle size={16}/> Cargando preferencias…</p>}
    {error&&<p role="alert" className="professional-error"><CircleAlert size={15}/>{error}</p>}
    {message&&<p role="status" className="form-note"><CircleCheck size={15}/>{message}</p>}
    {state==='error'&&<button type="button" className="button secondary" onClick={()=>window.location.reload()}>Volver a cargar</button>}
    <form onSubmit={save}>
      <fieldset disabled={state!=='ready'||busy} className="push-fields">
        <legend>Qué avisos recibir</legend>
    <p className="push-hint">{role==='clinician'?'Recibes avisos de citas asignadas a tu perfil profesional.':role==='billing'?'El rol de pagos no recibe avisos de agenda.':'Administración y recepción reciben avisos de toda la clínica; los profesionales, de sus citas asignadas.'} Los avisos del dispositivo no muestran datos de pacientes.</p>
        {[
          ['new_appointment','Nuevas citas','Cuando se registra una nueva cita.'],
          ['agenda_change','Cambios en la agenda','Cancelaciones y cambios de horario, duración, sucursal o profesional.'],
          ['include_self','Incluir mis cambios','Recibir también los avisos de las citas que yo registro o modifico.'],
          ['push_enabled','Enviar a mis dispositivos','Además del centro de notificaciones, enviar a los dispositivos activados.'],
        ].map(([key,title,description])=><label className="push-option" key={key}><span><strong>{title}</strong><span>{description}</span></span><input type="checkbox" checked={preferences[key]} onChange={event=>setPreferences(current=>({...current,[key]:event.target.checked}))}/></label>)}
        <div className="push-form-actions"><button type="submit" className="button primary compact"><Save size={15}/>{busy?'Guardando…':'Guardar preferencias'}</button></div>
      </fieldset>
    </form>
    <section className="push-device" aria-labelledby="push-device-title"><div className="google-calendar-section-heading"><div><strong id="push-device-title">Este dispositivo</strong>
      <span>{!supported?'Este navegador no admite notificaciones push. Usa un navegador compatible y una conexión segura.':permission==='denied'?'Permiso bloqueado. Habilita las notificaciones desde la configuración del sitio en tu navegador.':device?'Dispositivo activado para esta clínica.':'Este dispositivo no está activado para esta clínica.'}</span></div><span className="settings-option-status">{device?'Activado':permission==='denied'?'Bloqueado':'Sin activar'}</span></div>
      {sharedMode&&!server.configured&&state==='ready'&&<p>Los avisos dentro del CRM están disponibles. Para entregar push, configura las claves VAPID y el proceso de envío del servidor.</p>}
      <p>En iPhone o iPad, agrega primero el CRM a la pantalla de inicio y ábrelo desde ahí.</p>
      <p>Activar este navegador en otra clínica mueve el registro de este dispositivo a esa clínica.</p>
      <div className="push-actions"><button type="button" className="button outline compact" disabled={busy||state!=='ready'||!sharedMode||!supported||!registration||!server.configured||permission==='denied'||Boolean(device)} onClick={()=>deviceAction('enable')}><Bell size={14}/> Activar este dispositivo</button>
      <button type="button" className="button secondary compact" disabled={busy||!device} onClick={()=>deviceAction('disable')}><BellOff size={14}/> Desactivar este dispositivo</button>
      <button type="button" className="button outline compact" disabled={busy||!device||!server.configured} onClick={()=>deviceAction('test')}><Send size={14}/> Enviar prueba</button></div>
    </section>
  </div>;
}
