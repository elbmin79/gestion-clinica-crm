"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { createClient } from '../lib/supabase/client';
import { demoNotificationKey } from '../lib/staff-notifications';

// Keep session notices separate for each clinic; never persist patient text in storage.
export function useNotificationFeed(scope,clinicId) {
  const [feed, setFeed] = useState({ scope, items: [] });
  const [saved,setSaved]=useState({scope,items:[]});
  const [error,setError]=useState('');
  const activeScope=useRef(scope);activeScope.current=scope;
  useEffect(()=>{
    let active=true;
    const refresh=async()=>{
      try{
        let items=[];
        if(scope==='demo')items=JSON.parse(localStorage.getItem(demoNotificationKey)||'[]');
        else if(clinicId){
          const result=await createClient().from('staff_notifications').select('id,message,kind,created_at,read_at,appointment_id').eq('clinic_id',clinicId).order('created_at',{ascending:false}).limit(100);
          if(result.error)throw new Error();
          items=(result.data||[]).map(item=>({id:item.id,message:item.message,kind:item.kind,createdAt:new Date(item.created_at).getTime(),read:Boolean(item.read_at),appointmentAlert:true,href:item.kind==='whatsapp_message'||item.kind==='whatsapp_confirmation'?`/whatsapp?clinic=${encodeURIComponent(clinicId)}`:item.message==='Nueva solicitud de cita'?`/configuracion?tab=public-agenda&clinic=${encodeURIComponent(clinicId)}`:`/agenda?clinic=${encodeURIComponent(clinicId)}${item.appointment_id?`&appointment=${encodeURIComponent(item.appointment_id)}`:''}`}));
        }
        if(active){setSaved({scope,items});setError('');}
      }catch{if(active)setError('No se pudieron cargar los avisos guardados. Revisa la conexión.');}
    };
    refresh();
    const interval=setInterval(refresh,15000);
    window.addEventListener('focus',refresh);window.addEventListener('crm-staff-alerts',refresh);window.addEventListener('storage',refresh);
    return()=>{active=false;clearInterval(interval);window.removeEventListener('focus',refresh);window.removeEventListener('crm-staff-alerts',refresh);window.removeEventListener('storage',refresh);};
  },[scope,clinicId]);
  const items=[...(feed.scope===scope?feed.items:[]),...(saved.scope===scope?saved.items:[])].sort((a,b)=>b.createdAt-a.createdAt);
  const update = transform => setFeed(current => ({ scope, items: transform(current.scope === scope ? current.items : []) }));
  const changeSaved=async(action,id)=>{
    try{
      if(scope==='demo'){
        const values=JSON.parse(localStorage.getItem(demoNotificationKey)||'[]');
        const next=action==='clear'?[]:values.map(item=>!id||item.id===id?{...item,read:true}:item);
        localStorage.setItem(demoNotificationKey,JSON.stringify(next));setSaved({scope,items:next});
      }else if(clinicId){
        const {data:{user}}=await createClient().auth.getUser();
        if(!user)throw new Error();
        let query=action==='clear'?createClient().from('staff_notifications').delete():createClient().from('staff_notifications').update({read_at:new Date().toISOString()});
        query=query.eq('clinic_id',clinicId).eq('user_id',user.id);if(id)query=query.eq('id',id);
        const result=await query;if(result.error)throw new Error();
        if(activeScope.current===scope)setSaved(current=>({scope,items:action==='clear'?[]:current.items.map(item=>!id||item.id===id?{...item,read:true}:item)}));
      }
    }catch{if(activeScope.current===scope)setError('No se pudo actualizar el aviso. Vuelve a intentarlo.');}
  };
  return {
    items,
    error,
    persistent:true,
    add: message => update(current => [{ id: crypto.randomUUID(), message, createdAt: Date.now(), read: false }, ...current].slice(0, 100)),
    markRead: id => {update(current => current.map(item => item.id === id ? { ...item, read: true } : item));if(items.find(item=>item.id===id)?.appointmentAlert)void changeSaved('read',id);},
    markAllRead: () => {update(current => current.map(item => ({ ...item, read: true })));void changeSaved('read');},
    clear: () => {update(() => []);void changeSaved('clear');},
  };
}

export default function NotificationCenter({ items, markRead, markAllRead, clear,error }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [position, setPosition] = useState({ right: -8, arrow: 20 });
  const root = useRef(null);
  const panel = useRef(null);
  const trigger = useRef(null);
  const heading = useRef(null);
  const id = useId();
  const unread = items.filter(item => !item.read).length;
  const visible = filter === 'unread' ? items.filter(item => !item.read) : items;

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bell = trigger.current.getBoundingClientRect();
      const width = panel.current.getBoundingClientRect().width;
      const edge = Math.min(document.documentElement.clientWidth - 12, Math.max(width + 12, bell.right + 8));
      setPosition({ right: bell.right - edge, arrow: edge - bell.left - bell.width / 2 - 6 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    heading.current?.focus({ preventScroll: true });
    const onPointerDown = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onFocusIn = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    root.current?.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    const element = root.current;
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      element?.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  return <div className="notification-center" ref={root}>
    <button ref={trigger} type="button" className="icon-button notification-button" aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <Bell size={18}/>
      {unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section ref={panel} id={id} className="notification-popover" style={{ right: position.right, '--notification-arrow': `${position.arrow}px` }} role="dialog" aria-labelledby={`${id}-title`}>
      <header className="notification-heading">
        <div><h2 id={`${id}-title`} ref={heading} tabIndex={-1}>Notificaciones</h2><p>{unread ? `${unread} ${unread === 1 ? 'notificación sin leer' : 'notificaciones sin leer'}` : 'Estás al día'}</p></div>
        <button type="button" className="icon-button" aria-label="Cerrar notificaciones" onClick={() => close(true)}><X size={18}/></button>
      </header>
      <div className="notification-toolbar">
        <div className="notification-filters" role="group" aria-label="Filtrar notificaciones">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas <span>{items.length}</span></button>
          <button type="button" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Sin leer <span>{unread}</span></button>
        </div>
        <button type="button" className="notification-mark-all" disabled={!unread} aria-label="Marcar todas como leídas" title="Marcar todas como leídas" onClick={markAllRead}><CheckCheck size={18}/></button>
      </div>
      <div className="notification-scroll" tabIndex={0} role="region" aria-label="Lista de notificaciones">
        {error&&<p role="alert" className="push-error">{error}</p>}
        {visible.length > 0 ? <ul className="notification-list">{visible.map(item => <li key={item.id} className={item.read ? '' : 'is-unread'}>
          <span className="notification-item-icon" aria-hidden="true"><Bell size={16}/></span>
          <div className="notification-item-copy"><p>{item.message}</p><time dateTime={new Date(item.createdAt).toISOString()}>{new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(item.createdAt)}</time>{item.href&&<a className="notification-agenda-link" href={item.href} onClick={()=>markRead(item.id)}>{item.kind==='whatsapp_message'||item.kind==='whatsapp_confirmation'?'Abrir WhatsApp':item.message==='Nueva solicitud de cita'?'Revisar solicitudes':'Ver cita en agenda'}</a>}</div>
          <button type="button" className="notification-read" disabled={item.read} aria-label={item.read ? 'Leída' : `Marcar como leída: ${item.message}`} title={item.read ? 'Leída' : 'Marcar como leída'} onClick={() => markRead(item.id)}><Check size={16}/></button>
        </li>)}</ul> : <div className="notification-empty"><span><Bell size={24}/></span><h3>{filter === 'unread' && items.length ? 'Todo al día' : 'Sin notificaciones'}</h3><p>{filter === 'unread' && items.length ? 'Ya leíste todas tus notificaciones.' : 'Los nuevos avisos de tu actividad aparecerán aquí.'}</p></div>}
      </div>
      <footer className="notification-footer"><span>Avisos guardados y actividad de sesión</span><button type="button" disabled={!items.length} onClick={clear}>Borrar todas</button></footer>
    </section>}
  </div>;
}
