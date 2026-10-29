"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, X } from 'lucide-react';

// Keep session notices separate for each clinic; never persist patient text in storage.
export function useNotificationFeed(scope) {
  const [feed, setFeed] = useState({ scope, items: [] });
  const items = feed.scope === scope ? feed.items : [];
  const update = transform => setFeed(current => ({ scope, items: transform(current.scope === scope ? current.items : []) }));
  return {
    items,
    add: message => update(current => [{ id: crypto.randomUUID(), message, createdAt: Date.now(), read: false }, ...current].slice(0, 100)),
    markRead: id => update(current => current.map(item => item.id === id ? { ...item, read: true } : item)),
    markAllRead: () => update(current => current.map(item => ({ ...item, read: true }))),
    clear: () => update(() => []),
  };
}

export default function NotificationCenter({ items, markRead, markAllRead, clear }) {
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
        {visible.length > 0 ? <ul className="notification-list">{visible.map(item => <li key={item.id} className={item.read ? '' : 'is-unread'}>
          <span className="notification-item-icon" aria-hidden="true"><Bell size={16}/></span>
          <div className="notification-item-copy"><p>{item.message}</p><time dateTime={new Date(item.createdAt).toISOString()}>{new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(item.createdAt)}</time></div>
          <button type="button" className="notification-read" disabled={item.read} aria-label={item.read ? 'Leída' : `Marcar como leída: ${item.message}`} title={item.read ? 'Leída' : 'Marcar como leída'} onClick={() => markRead(item.id)}><Check size={16}/></button>
        </li>)}</ul> : <div className="notification-empty"><span><Bell size={24}/></span><h3>{filter === 'unread' && items.length ? 'Todo al día' : 'Sin notificaciones'}</h3><p>{filter === 'unread' && items.length ? 'Ya leíste todas tus notificaciones.' : 'Los nuevos avisos de tu actividad aparecerán aquí.'}</p></div>}
      </div>
      <footer className="notification-footer"><span>Actividad de esta sesión</span><button type="button" disabled={!items.length} onClick={clear}>Borrar todas</button></footer>
    </section>}
  </div>;
}
