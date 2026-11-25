"use client";

import { useMemo, useRef, useState } from 'react';
import { AtSign, Camera, ImagePlus, MessageCircle, Paperclip, Search, Send, X } from 'lucide-react';

const portraits = {
  valeria: { bg: '#f6d7e4', skin: '#f3c7ae', hair: '#3b241c', shirt: '#c45b86', style: 'long' },
  camila: { bg: '#f8e7d8', skin: '#e8b89a', hair: '#1d1a18', shirt: '#8d5a73', style: 'bob' },
  renata: { bg: '#efe4f6', skin: '#f6d2bc', hair: '#6a3b24', shirt: '#7d6ea8', style: 'bun' },
  mariana: { bg: '#e7f0ea', skin: '#efc2a4', hair: '#241812', shirt: '#5f856c', style: 'wave' },
  diego: { bg: '#e7eef6', skin: '#e7b896', hair: '#2a211c', shirt: '#4d6f8a', style: 'short' },
  lucia: { bg: '#f8efe4', skin: '#f0c3aa', hair: '#8a4b2f', shirt: '#c47a4a', style: 'long' },
};

function ClientPhoto({ id, className = '' }) {
  const person = portraits[id] || portraits.valeria;
  const hair = {
    long: 'M16 30c0-14 8-24 16-24s16 10 16 24v8H16z',
    bob: 'M14 34c1-16 8-26 18-26s17 10 18 26v4H14z',
    bun: 'M20 28c0-12 6-20 12-20s12 8 12 20c6-2 10 2 10 8H18c0-6 2-10 2-8z',
    wave: 'M15 36c2-18 8-28 17-28 8 0 14 8 16 20 4 0 8 4 8 8H14c0-4 1-8 1 0z',
    short: 'M18 32c1-14 7-22 14-22s13 8 14 22c3 0 6 3 6 6H16c0-4 1-6 2-6z',
  }[person.style];
  return <svg className={`social-photo ${className}`} viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="32" fill={person.bg}/>
    <path d={hair} fill={person.hair}/>
    <circle cx="32" cy="30" r="11" fill={person.skin}/>
    <path d="M14 64c2-15 11-22 18-22s16 7 18 22" fill={person.shirt}/>
    <circle cx="28" cy="29" r="1.15" fill="#3a2a28"/>
    <circle cx="36" cy="29" r="1.15" fill="#3a2a28"/>
  </svg>;
}

const channels = [
  {
    id: 'instagram',
    label: 'Instagram',
    icon: AtSign,
    threads: [
      { id: 'ig-1', photo: 'valeria', name: 'Valeria M.', handle: '@valeria.skin', preview: '¿La valoración de hoy incluye el plan de cuidado?', time: '10:24', messages: [
        { from: 'them', text: 'Hola, quisiera confirmar si mañana puedo pasar a la valoración de toxina.', at: '10:18' },
        { from: 'them', text: '¿La valoración de hoy incluye el plan de cuidado?', at: '10:24' },
      ] },
      { id: 'ig-2', photo: 'camila', name: 'Camila Ortega', handle: '@camila.ortega', preview: 'Foto del área, con luz natural.', time: 'Ayer', messages: [
        { from: 'us', text: 'Camila, cuando puedas envíanos una foto con luz natural del área que revisamos.', at: 'Ayer 18:10' },
        { from: 'them', text: 'Ahí va.', image: '/flora-field.svg', at: 'Ayer 18:42' },
      ] },
      { id: 'ig-3', photo: 'lucia', name: 'Lucía Ferrer', handle: '@lucia.ferrer', preview: '¿Tienen promoción de hydrafacial?', time: 'Lun', messages: [
        { from: 'them', text: 'Buenas tardes, ¿tienen promoción de hydrafacial este mes?', at: 'Lun 16:02' },
        { from: 'us', text: 'Sí, el paquete de tres sesiones está activo. ¿Te aparto una valoración?', at: 'Lun 16:20' },
      ] },
    ],
  },
  {
    id: 'messenger',
    label: 'Messenger',
    icon: MessageCircle,
    threads: [
      { id: 'ms-1', photo: 'renata', name: 'Renata Castillo', handle: 'Facebook', preview: '¿Siguen teniendo horario el sábado?', time: '09:05', messages: [
        { from: 'them', text: 'Buenos días, vi el tratamiento de hydrafacial en su página.', at: '09:02' },
        { from: 'them', text: '¿Siguen teniendo horario el sábado?', at: '09:05' },
      ] },
      { id: 'ms-2', photo: 'mariana', name: 'Mariana Salas', handle: 'Facebook', preview: 'Perfecto, nos vemos a las 4:30.', time: 'Lun', messages: [
        { from: 'us', text: 'Tu seguimiento quedó para el lunes a las 4:30.', at: 'Lun 11:14' },
        { from: 'them', text: 'Perfecto, nos vemos a las 4:30.', at: 'Lun 11:21' },
      ] },
      { id: 'ms-3', photo: 'diego', name: 'Diego Navarro', handle: 'Facebook', preview: '¿Puedo reagendar la cita de las 5?', time: 'Dom', messages: [
        { from: 'them', text: 'Hola, ¿puedo reagendar la cita de las 5? Me sale un pendiente de trabajo.', at: 'Dom 13:40' },
      ] },
    ],
  },
];

export default function SocialInbox() {
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const [channelId, setChannelId] = useState('instagram');
  const [threadsByChannel, setThreadsByChannel] = useState(() => Object.fromEntries(channels.map(channel => [channel.id, channel.threads])));
  const [activeId, setActiveId] = useState(channels[0].threads[0].id);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState(null);
  const channel = channels.find(item => item.id === channelId) || channels[0];
  const threads = threadsByChannel[channel.id] || [];
  const visibleThreads = threads.filter(thread => `${thread.name} ${thread.preview}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = useMemo(() => threads.find(thread => thread.id === activeId) || threads[0], [threads, activeId]);

  const chooseChannel = (nextId) => {
    setChannelId(nextId);
    const nextThreads = threadsByChannel[nextId] || [];
    setActiveId(nextThreads[0]?.id || '');
    setDraft('');
    setAttachment(null);
    setQuery('');
  };

  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (attachment?.url) URL.revokeObjectURL(attachment.url);
    setAttachment({ name: file.name, url: URL.createObjectURL(file) });
  };

  const clearAttachment = () => {
    if (attachment?.url) URL.revokeObjectURL(attachment.url);
    setAttachment(null);
  };

  const send = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !attachment) || !active) return;
    const image = attachment?.url || '';
    setThreadsByChannel(current => ({
      ...current,
      [channel.id]: current[channel.id].map(thread => thread.id === active.id ? {
        ...thread,
        preview: text || 'Foto',
        time: 'Ahora',
        messages: [...thread.messages, { from: 'us', text, image, at: 'Ahora' }],
      } : thread),
    }));
    setDraft('');
    setAttachment(null);
  };

  const Icon = channel.icon;
  return <div className="social-inbox">
    <div className="social-inbox-heading">
      <div>
        <h1>Instagram y Messenger</h1>
        <p>Mensajes de las cuentas de la clínica, en la misma bandeja.</p>
      </div>
      <div className="social-channel-switch" role="tablist" aria-label="Canal">
        {channels.map(item => {
          const ItemIcon = item.icon;
          const selected = item.id === channel.id;
          return <button key={item.id} type="button" role="tab" aria-selected={selected} className={selected ? 'is-active' : ''} onClick={() => chooseChannel(item.id)}><ItemIcon size={16}/>{item.label}</button>;
        })}
      </div>
    </div>
    <div className="social-inbox-layout">
      <aside className="social-thread-list" aria-label={`Conversaciones de ${channel.label}`}>
        <label className="social-thread-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar conversación" aria-label="Buscar conversación"/></label>
        <div className="social-thread-scroll">
          {visibleThreads.map(thread => <button type="button" key={thread.id} className={`social-thread-item${thread.id === active?.id ? ' is-active' : ''}`} onClick={() => { setActiveId(thread.id); setDraft(''); clearAttachment(); }}>
            <ClientPhoto id={thread.photo}/>
            <span><strong>{thread.name}</strong><small>{thread.preview}</small></span>
            <time>{thread.time}</time>
          </button>)}
          {visibleThreads.length === 0 && <p className="social-thread-empty">No hay conversaciones con ese nombre.</p>}
        </div>
      </aside>
      {active && <section className="social-thread" aria-label={`Conversación con ${active.name}`}>
        <header>
          <ClientPhoto id={active.photo} className="is-header"/>
          <div><strong>{active.name}</strong><span>{channel.label} · {active.handle}</span></div>
          <Icon size={16}/>
        </header>
        <div className="social-messages">
          {active.messages.map((message, index) => <div key={`${message.at}-${index}`} className={`social-message${message.from === 'us' ? ' is-ours' : ''}`}>
            {message.from === 'them' && <ClientPhoto id={active.photo}/>}
            <p>
              {message.image && <img src={message.image} alt="Foto enviada en la conversación"/>}
              {message.text && <span>{message.text}</span>}
              <time>{message.at}</time>
            </p>
          </div>)}
        </div>
        <form className="social-compose" onSubmit={send}>
          <input ref={fileRef} className="social-file-input" type="file" accept="image/*" aria-label="Adjuntar imagen" onChange={chooseFile}/>
          <input ref={cameraRef} className="social-file-input" type="file" accept="image/*" capture="environment" aria-label="Tomar foto" onChange={chooseFile}/>
          {attachment && <div className="social-compose-preview"><img src={attachment.url} alt="Vista previa del adjunto"/><span>{attachment.name}</span><button type="button" className="social-icon-button" onClick={clearAttachment} aria-label="Quitar adjunto"><X size={16}/></button></div>}
          <div className="social-compose-tools">
            <button type="button" className="social-icon-button" aria-label="Adjuntar archivo" onClick={() => fileRef.current?.click()}><Paperclip size={18}/></button>
            <button type="button" className="social-icon-button" aria-label="Adjuntar imagen" onClick={() => fileRef.current?.click()}><ImagePlus size={18}/></button>
            <button type="button" className="social-icon-button" aria-label="Abrir cámara" onClick={() => cameraRef.current?.click()}><Camera size={18}/></button>
            <textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Escribe un mensaje por ${channel.label}`} aria-label={`Responder a ${active.name}`} maxLength={1000} rows={1} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/>
            <button className="button primary" type="submit" disabled={!draft.trim() && !attachment}><Send size={15}/> Enviar</button>
          </div>
        </form>
      </section>}
    </div>
  </div>;
}
