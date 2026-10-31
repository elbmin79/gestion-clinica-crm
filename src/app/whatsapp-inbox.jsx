'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Ban, Check, CheckCheck, ChevronDown, ChevronRight, ChevronUp, Clock3, Download, EllipsisVertical, Expand, MessageCircle, Paperclip, PencilLine, Search, Send, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { buildWhatsAppTimeline, formatWhatsAppMessageTime, formatWhatsAppThreadTime } from '@/lib/whatsapp/time-format.js';
import './whatsapp-inbox.css';

function initials(name = '') { return String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'W'; }
function readableMediaName(name = '') {
  const value = String(name || '').trim();
  if (!value || /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(?:jpe?g|png|webp)$/i.test(value) || /^image-[\da-f]{6}\.(?:jpe?g|png|webp)$/i.test(value)) return 'Imagen compartida';
  return value;
}
function formatAudioTime(seconds = 0) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function WhatsAppDeliveryStatus({ status, errorCode, errorMessage }) {
  const states = {
    queued: { label: 'En cola', Icon: Clock3, tone: 'pending' },
    sending: { label: 'Enviando', Icon: Clock3, tone: 'pending' },
    sent: { label: 'Enviado', Icon: Check, tone: 'sent' },
    delivered: { label: 'Entregado', Icon: CheckCheck, tone: 'delivered' },
    read: { label: 'Visto', Icon: CheckCheck, tone: 'read' },
    failed: { label: 'Falló el envío', Icon: AlertCircle, tone: 'failed' },
    undelivered: { label: 'No entregado', Icon: AlertCircle, tone: 'failed' },
    canceled: { label: 'Cancelado', Icon: AlertCircle, tone: 'failed' },
  };
  const state = states[status] || { label: 'Enviado', Icon: Check, tone: 'sent' };
  const title = errorCode || errorMessage
    ? [state.label, errorCode && `Código ${errorCode}`, errorMessage].filter(Boolean).join(' · ')
    : state.label;
  const { Icon } = state;
  return <span className={`whatsapp-message-status is-${state.tone}`} title={title} aria-label={title}><Icon size={12}/><span>{state.label}</span></span>;
}
function highlightSearchText(text, query) {
  const value = String(text || '');
  const term = query.trim();
  if (!term) return value;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.split(new RegExp(`(${escaped})`, 'ig')).map((part, index) => part.toLowerCase() === term.toLowerCase()
    ? <mark className="whatsapp-search-highlight" key={`${part}-${index}`}>{part}</mark>
    : part);
}
function WhatsAppMessageImage({ src, filename, onExpand, onMediaLoad }) {
  const imageRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) { setLoaded(true); onMediaLoad?.(); }
  }, [src, onMediaLoad]);

  return <div className="whatsapp-message-image-wrap">
    <button type="button" className="whatsapp-message-image-open" onClick={onExpand} aria-label="Ampliar imagen" disabled={!loaded}>
      <img ref={imageRef} className="whatsapp-message-media" src={src} alt={filename} loading="lazy" onLoad={() => { setLoaded(true); onMediaLoad?.(); }} onError={() => setLoaded(false)}/>
    </button>
    {loaded && <div className="whatsapp-message-image-actions">
      <button type="button" onClick={onExpand} aria-label="Ampliar imagen" title="Ampliar"><Expand size={15}/></button>
      <a href={`${src}&download=1`} aria-label="Descargar imagen" title="Descargar"><Download size={15}/></a>
    </div>}
  </div>;
}
const audioWaveform = [32, 52, 39, 70, 45, 61, 84, 48, 32, 72, 56, 91, 44, 66, 36, 76, 52, 87, 40, 62, 48, 78, 34, 59, 82, 44, 68, 38, 73, 50, 91, 42, 64, 35, 77, 49];
function WhatsAppAudioPlayer({ src, filename = 'audio' }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const progress = duration ? currentTime / duration : 0;
  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  };
  return <div className="whatsapp-audio-player" role="group" aria-label="Mensaje de audio">
    <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => { setPlaybackError(false); setPlaying(true); }} onPause={() => setPlaying(false)} onError={() => { setPlaybackError(true); setPlaying(false); }} onEnded={() => { setPlaying(false); setCurrentTime(0); }}/>
    <button className="whatsapp-audio-play" type="button" onClick={togglePlayback} aria-label={playing ? 'Pausar audio' : 'Reproducir audio'}>{playing ? <span className="whatsapp-audio-pause-icon" aria-hidden="true"/> : <span className="whatsapp-audio-play-icon" aria-hidden="true"/>}</button>
    <div className="whatsapp-audio-track">
      <div className="whatsapp-audio-waveform" aria-hidden="true">{audioWaveform.map((height, index) => <span className={progress >= (index + 1) / audioWaveform.length ? 'is-played' : ''} style={{ height: `${height}%` }} key={index}/>)}</div>
      <input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 0)} disabled={!duration} onChange={event => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); }} aria-label="Posición del audio" style={{ '--audio-progress': `${progress * 100}%` }}/>
      <div className="whatsapp-audio-time"><time>{formatAudioTime(currentTime)}</time><time>{formatAudioTime(duration)}</time></div>
      {playbackError && <span className="whatsapp-audio-error">No se pudo reproducir este audio.</span>}
    </div>
    <a className="whatsapp-audio-download" href={`${src}&download=1`} aria-label={`Descargar ${filename}`} title="Descargar audio"><Download size={15}/></a>
  </div>;
}

export default function WhatsAppInbox({ clinicId = '', sharedMode = false, role = '' }) {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageHistoryConversationId, setMessageHistoryConversationId] = useState('');
  const [isAtLatestMessage, setIsAtLatestMessage] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [collapsedSenders, setCollapsedSenders] = useState(() => new Set());
  const [draft, setDraft] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendOutcomeUncertain, setSendOutcomeUncertain] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [openMenuId, setOpenMenuId] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const fileInputRef = useRef(null);
  const composerInputRef = useRef(null);
  const imageDialogRef = useRef(null);
  const actionDialogRef = useRef(null);
  const messageSearchRef = useRef(null);
  const messageHistoryRef = useRef(null);
  const shouldFollowLatestRef = useRef(true);
  const observedMessagesRef = useRef({ conversationId: '', ids: new Set() });
  const selectedIdRef = useRef('');
  const canReply = ['admin', 'receptionist'].includes(role);
  const scrollToLatest = useCallback((behavior = 'smooth') => {
    const history = messageHistoryRef.current;
    if (!history) return;
    const motionSafeBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior;
    history.scrollTo({ top: history.scrollHeight, behavior: motionSafeBehavior });
    shouldFollowLatestRef.current = true;
    setIsAtLatestMessage(true);
    setNewMessageCount(0);
  }, []);
  const handleMessageHistoryScroll = useCallback(event => {
    const history = event.currentTarget;
    const atLatest = history.scrollHeight - history.scrollTop - history.clientHeight < 72;
    shouldFollowLatestRef.current = atLatest;
    setIsAtLatestMessage(atLatest);
    if (atLatest) setNewMessageCount(0);
  }, []);
  const keepLatestVisible = useCallback(() => {
    if (shouldFollowLatestRef.current) scrollToLatest('auto');
  }, [scrollToLatest]);

  const refresh = useCallback(async () => {
    if (!sharedMode || !clinicId) { setStatus('idle'); return; }
    const client = createClient();
    if (!client) { setStatus('error'); setError('La conexión con la clínica no está configurada.'); return; }
    const result = await client.from('clinic_whatsapp_conversations')
      .select('id,contact_phone,contact_name,sender_phone,last_inbound_at,last_message_at,blocked_at')
      .eq('clinic_id', clinicId).order('last_message_at', { ascending: false }).limit(100);
    if (result.error) { setStatus('error'); setError('No se pudieron cargar las conversaciones.'); return; }
    setConversations(result.data || []);
    setError('');
    setStatus('ready');
  }, [clinicId, sharedMode]);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 8000); return () => window.clearInterval(timer); }, [refresh]);

  const visibleConversations = useMemo(() => conversations.filter(item => `${item.contact_name || ''} ${item.contact_phone}`.toLowerCase().includes(query.trim().toLowerCase())), [conversations, query]);
  const conversationGroups = useMemo(() => {
    const groups = new Map();
    for (const conversation of visibleConversations) {
      const sender = String(conversation.sender_phone || '').trim() || 'Número no identificado';
      if (!groups.has(sender)) groups.set(sender, []);
      groups.get(sender).push(conversation);
    }
    return [...groups.entries()]
      .map(([sender, items]) => ({ sender, items: items.sort((a, b) => Date.parse(b.last_message_at || '') - Date.parse(a.last_message_at || '')),
        latestAt: Math.max(...items.map(item => Date.parse(item.last_message_at || '') || 0)) }))
      .sort((a, b) => b.latestAt - a.latestAt || a.sender.localeCompare(b.sender));
  }, [visibleConversations]);
  const selected = visibleConversations.find(item => item.id === selectedId) || visibleConversations[0] || null;
  const messageMatches = useMemo(() => {
    const term = messageQuery.trim().toLocaleLowerCase();
    return term ? messages.filter(message => `${message.body || ''} ${message.media_filename || ''}`.toLocaleLowerCase().includes(term)) : [];
  }, [messageQuery, messages]);
  const activeMessageMatch = messageMatches.length ? messageMatches[Math.min(activeMatchIndex, messageMatches.length - 1)] : null;

  useEffect(() => {
    if (!searchOpen) return;
    messageSearchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (composerOpen) requestAnimationFrame(() => {
      composerInputRef.current?.focus();
      scrollToLatest('smooth');
    });
  }, [composerOpen, scrollToLatest]);

  useEffect(() => {
    if (!searchOpen || !activeMessageMatch) return;
    messageHistoryRef.current?.querySelector(`[data-message-id="${activeMessageMatch.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMessageMatch?.id, searchOpen]);

  useEffect(() => {
    const dialog = actionDialogRef.current;
    if (pendingAction && dialog && !dialog.open) dialog.showModal();
    if (!pendingAction && dialog?.open) dialog.close();
  }, [pendingAction]);

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && event.target.closest?.('.whatsapp-conversation-menu')) return;
      setOpenMenuId('');
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [openMenuId]);

  useEffect(() => {
    selectedIdRef.current = selected?.id || '';
    shouldFollowLatestRef.current = true;
    observedMessagesRef.current = { conversationId: '', ids: new Set() };
    setMessageHistoryConversationId('');
    setIsAtLatestMessage(true);
    setNewMessageCount(0);
    setMessages([]);
    setSearchOpen(false);
    setMessageQuery('');
    setActiveMatchIndex(0);
    setOpenMenuId('');
    setAttachment(current => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }, [selected?.id]);

  useEffect(() => {
    const dialog = imageDialogRef.current;
    if (expandedImage && dialog && !dialog.open) dialog.showModal();
    if (!expandedImage && dialog?.open) dialog.close();
  }, [expandedImage]);

  useEffect(() => {
    if (!selected) { setMessages([]); setMessageHistoryConversationId(''); return; }
    let active = true;
    const load = async () => {
      const result = await createClient().from('clinic_whatsapp_messages').select('id,direction,body,delivery_status,delivery_error_code,delivery_error_message,created_at,media_object_path,media_content_type,media_filename,media_size_bytes')
        .eq('clinic_id', clinicId).eq('conversation_id', selected.id).order('created_at', { ascending: true }).limit(300);
      if (!active) return;
      if (result.error) { setError('No se pudieron cargar los mensajes.'); return; }
      setMessages(result.data || []);
      setMessageHistoryConversationId(selected.id);
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [clinicId, selected?.id]);

  useEffect(() => {
    if (!selected?.id || messageHistoryConversationId !== selected.id) return;
    const currentIds = new Set(messages.map(message => message.id));
    const observed = observedMessagesRef.current;
    if (observed.conversationId !== selected.id) {
      observedMessagesRef.current = { conversationId: selected.id, ids: currentIds };
      requestAnimationFrame(() => scrollToLatest('auto'));
      return;
    }
    const newlyLoaded = messages.filter(message => !observed.ids.has(message.id));
    observedMessagesRef.current = { conversationId: selected.id, ids: currentIds };
    if (!newlyLoaded.length) return;
    const newestMessage = messages[messages.length - 1];
    if (shouldFollowLatestRef.current || newlyLoaded.some(message => message.direction === 'outbound' && message.id === newestMessage?.id)) {
      requestAnimationFrame(() => scrollToLatest('smooth'));
      return;
    }
    const inboundCount = newlyLoaded.filter(message => message.direction === 'inbound').length;
    if (inboundCount) setNewMessageCount(current => current + inboundCount);
  }, [messages, messageHistoryConversationId, scrollToLatest, selected?.id]);

  const windowOpen = selected?.last_inbound_at && Date.now() - Date.parse(selected.last_inbound_at) < 24 * 60 * 60 * 1000;
  const showNextMatch = direction => {
    if (!messageMatches.length) return;
    setActiveMatchIndex(current => (current + direction + messageMatches.length) % messageMatches.length);
  };
  const confirmConversationAction = (action, conversation) => {
    setActionError(''); setOpenMenuId('');
    setPendingAction({ action, conversation });
  };
  const runConversationAction = async () => {
    if (!pendingAction || actionBusy) return;
    const { action, conversation } = pendingAction;
    setActionBusy(true); setActionError('');
    try {
      const response = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(conversation.id)}`, {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar la conversación.');
      if (action === 'delete') {
        setConversations(current => current.filter(item => item.id !== conversation.id));
        if (selected?.id === conversation.id) {
          setSelectedId(conversations.find(item => item.id !== conversation.id)?.id || '');
          setDraft(''); setAttachment(null);
        }
      } else {
        setConversations(current => current.map(item => item.id === conversation.id ? { ...item, blocked_at: result.blockedAt } : item));
      }
      setPendingAction(null);
    } catch (actionFailure) { setActionError(actionFailure.message); }
    finally { setActionBusy(false); }
  };
  const renderConversationMenu = (conversation, source) => {
    const menuKey = `${source}:${conversation.id}`;
    return <div className={`whatsapp-conversation-menu${openMenuId === menuKey ? ' is-open' : ''}`}>
    <button type="button" className="whatsapp-icon-action" aria-label={`Acciones para ${conversation.contact_name || conversation.contact_phone}`} aria-haspopup="menu" aria-expanded={openMenuId === menuKey} onClick={event => { event.stopPropagation(); setOpenMenuId(current => current === menuKey ? '' : menuKey); }}><EllipsisVertical size={19}/></button>
    {openMenuId === menuKey && <div className="whatsapp-conversation-menu-list" role="menu">
      <button type="button" role="menuitem" onClick={event => { event.stopPropagation(); confirmConversationAction(conversation.blocked_at ? 'unblock' : 'block', conversation); }}><Ban size={15}/>{conversation.blocked_at ? 'Desbloquear en el CRM' : 'Bloquear en el CRM'}</button>
      <button type="button" role="menuitem" className="is-destructive" onClick={event => { event.stopPropagation(); confirmConversationAction('delete', conversation); }}><Trash2 size={15}/>Eliminar conversación</button>
    </div>}
  </div>;
  };
  async function chooseAttachment(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected || uploadingAttachment) return;
    const kind = file.type.toLowerCase();
    const limit = kind === 'video/mp4' ? 16 * 1024 * 1024 : ['image/jpeg', 'image/png'].includes(kind) ? 5 * 1024 * 1024 : 0;
    if (!limit) { setError('Adjunta una imagen JPG o PNG, o un video MP4.'); return; }
    if (file.size < 1 || file.size > limit) { setError(kind === 'video/mp4' ? 'El video no puede superar 16 MB.' : 'La imagen no puede superar 5 MB.'); return; }
    const conversationId = selected.id;
    setUploadingAttachment(true); setError('');
    try {
      const response = await fetch('/api/whatsapp/media/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId, conversationId, contentType: kind, size: file.size }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo preparar el archivo.');
      const upload = await createClient().storage.from('clinic-whatsapp-media').uploadToSignedUrl(result.path, result.token, file, { contentType: kind, upsert: false });
      if (upload.error) throw new Error('No se pudo cargar el archivo. Inténtalo de nuevo.');
      if (selectedIdRef.current !== conversationId) return;
      const previewUrl = URL.createObjectURL(file);
      setAttachment({ path: result.path, name: file.name, type: kind, size: file.size, previewUrl });
    } catch (uploadError) { setError(uploadError.message); }
    finally { setUploadingAttachment(false); }
  }
  function removeAttachment() {
    setAttachment(current => { if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl); return null; });
  }
  async function sendMessage(event) {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !attachment) || !selected || sending || uploadingAttachment) return;
    setSending(true); setError('');
    try {
      const conversationId = selected.id;
      const response = await fetch('/api/whatsapp/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId, conversationId, body, ...(attachment ? { mediaPath: attachment.path, mediaFilename: attachment.name } : {}) }) });
      const result = await response.json();
      if (!response.ok) {
        if (result.uncertain || result.sent) setSendOutcomeUncertain(true);
        throw new Error(result.error || 'No se pudo enviar el mensaje.');
      }
      setDraft('');
      removeAttachment();
      setSendOutcomeUncertain(false);
      await Promise.all([refresh(), (async () => {
        const data = await createClient().from('clinic_whatsapp_messages').select('id,direction,body,delivery_status,delivery_error_code,delivery_error_message,created_at,media_object_path,media_content_type,media_filename,media_size_bytes').eq('clinic_id', clinicId).eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(300);
        if (!data.error) { setMessages(data.data || []); setMessageHistoryConversationId(conversationId); }
      })()]);
    } catch (sendError) { setError(sendError.message); }
    finally { setSending(false); }
  }
  function handleComposerKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
  function toggleSenderGroup(sender) {
    setCollapsedSenders(current => {
      const next = new Set(current);
      if (next.has(sender)) next.delete(sender);
      else next.add(sender);
      return next;
    });
  }

  return <section className="whatsapp-inbox-page" aria-label="Conversaciones de WhatsApp">
    <header className="whatsapp-inbox-heading"><div><h1>WhatsApp</h1><p>Conversaciones con tus contactos</p></div></header>
    <div className="whatsapp-inbox-shell">
      <aside className="whatsapp-thread-list" aria-label="Conversaciones">
        <div className="whatsapp-thread-search"><Search size={16}/><input aria-label="Buscar conversación" placeholder="Buscar conversación" value={query} onChange={event => setQuery(event.target.value)}/></div>
        <div className="whatsapp-thread-groups">
          {conversationGroups.map(group => <section className="whatsapp-sender-group" key={group.sender}>
            <h2 className="whatsapp-sender-heading"><button type="button" aria-expanded={!collapsedSenders.has(group.sender)} onClick={() => toggleSenderGroup(group.sender)} aria-label={`${collapsedSenders.has(group.sender) ? 'Mostrar' : 'Ocultar'} conversaciones de ${group.sender}`}>
              {collapsedSenders.has(group.sender) ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<span>Recibidos en</span><strong>{group.sender}</strong><small>{group.items.length}</small>
            </button></h2>
            {!collapsedSenders.has(group.sender) && group.items.map(item => <div className="whatsapp-thread-entry" key={item.id}>
              <button className={`whatsapp-thread-item${selected?.id === item.id ? ' is-selected' : ''}`} type="button" onClick={() => setSelectedId(item.id)}>
                <span className="whatsapp-thread-avatar">{initials(item.contact_name || item.contact_phone)}</span>
                <span className="whatsapp-thread-copy"><strong>{item.contact_name || item.contact_phone}{item.blocked_at && <span className="whatsapp-blocked-badge">Bloqueado</span>}</strong><span>{item.contact_phone}</span></span>
                <span className="whatsapp-thread-meta"><time>{formatWhatsAppThreadTime(item.last_message_at)}</time></span>
              </button>
              {renderConversationMenu(item, 'thread')}
            </div>)}
          </section>)}
        </div>
        {status === 'loading' && <p className="whatsapp-inbox-empty-list">Cargando conversaciones…</p>}
        {status === 'idle' && <p className="whatsapp-inbox-empty-list">Conecta la clínica para recibir mensajes.</p>}
        {status === 'ready' && !visibleConversations.length && <p className="whatsapp-inbox-empty-list">Aún no hay mensajes.</p>}
      </aside>
      <main className="whatsapp-conversation">
        {selected ? <>
          <header className="whatsapp-conversation-header"><span className="whatsapp-thread-avatar">{initials(selected.contact_name || selected.contact_phone)}</span><div className="whatsapp-conversation-contact"><strong>{selected.contact_name || selected.contact_phone}</strong><span>{selected.contact_phone}</span></div><div className="whatsapp-conversation-actions">
            <button type="button" className={`whatsapp-icon-action${searchOpen ? ' is-active' : ''}`} aria-label="Buscar mensajes" aria-expanded={searchOpen} onClick={() => { setSearchOpen(current => !current); setMessageQuery(''); setActiveMatchIndex(0); }}><Search size={18}/></button>
            {renderConversationMenu(selected, 'header')}
          </div></header>
          {searchOpen && <div className="whatsapp-message-search"><Search size={16}/><input ref={messageSearchRef} type="search" placeholder="Buscar en esta conversación" value={messageQuery} onChange={event => { setMessageQuery(event.target.value); setActiveMatchIndex(0); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); showNextMatch(event.shiftKey ? -1 : 1); } if (event.key === 'Escape') setSearchOpen(false); }} aria-label="Buscar mensajes en esta conversación"/><span className="whatsapp-message-search-count">{messageQuery.trim() ? `${messageMatches.length ? activeMatchIndex + 1 : 0} de ${messageMatches.length}` : '300 mensajes recientes'}</span><button type="button" className="whatsapp-icon-action" aria-label="Coincidencia anterior" disabled={!messageMatches.length} onClick={() => showNextMatch(-1)}><ChevronUp size={17}/></button><button type="button" className="whatsapp-icon-action" aria-label="Coincidencia siguiente" disabled={!messageMatches.length} onClick={() => showNextMatch(1)}><ChevronDown size={17}/></button><button type="button" className="whatsapp-icon-action" aria-label="Cerrar búsqueda" onClick={() => setSearchOpen(false)}><X size={17}/></button></div>}
          <div ref={messageHistoryRef} className="whatsapp-message-history" aria-live="polite" onScroll={handleMessageHistoryScroll}>
            {messages.length ? buildWhatsAppTimeline(messages).map(item => item.type === 'day'
              ? <div className="whatsapp-day-divider" role="separator" key={item.key}><span>{item.label}</span></div>
              : <article className={`whatsapp-message-row is-${item.message.direction}${activeMessageMatch?.id === item.message.id ? ' is-search-match' : ''}`} key={item.key} data-message-id={item.message.id}>
                <div className="whatsapp-message-bubble">{item.message.media_content_type?.startsWith('image/') && (() => {
                  const mediaUrl = `/api/whatsapp/media?clinicId=${encodeURIComponent(clinicId)}&messageId=${encodeURIComponent(item.message.id)}`;
                  const filename = readableMediaName(item.message.media_filename);
                  return <WhatsAppMessageImage src={mediaUrl} filename={filename} onExpand={() => setExpandedImage({ src: mediaUrl, filename })} onMediaLoad={keepLatestVisible}/>;
                })()}{item.message.media_content_type?.startsWith('video/') && <video className="whatsapp-message-media" src={`/api/whatsapp/media?clinicId=${encodeURIComponent(clinicId)}&messageId=${encodeURIComponent(item.message.id)}`} aria-label={item.message.media_filename || 'Video compartido'} controls playsInline preload="metadata" onLoadedMetadata={keepLatestVisible}/ >}{item.message.media_content_type?.startsWith('audio/') && <WhatsAppAudioPlayer src={`/api/whatsapp/media?clinicId=${encodeURIComponent(clinicId)}&messageId=${encodeURIComponent(item.message.id)}`} filename={item.message.media_filename || 'audio'}/>}{item.message.body && <p>{highlightSearchText(item.message.body, messageQuery)}</p>}<div className="whatsapp-message-details"><time dateTime={item.message.created_at}>{formatWhatsAppMessageTime(item.message.created_at)}</time>{item.message.direction === 'outbound' && <WhatsAppDeliveryStatus status={item.message.delivery_status} errorCode={item.message.delivery_error_code} errorMessage={item.message.delivery_error_message}/>}</div></div>
              </article>) : <div className="whatsapp-conversation-empty"><MessageCircle size={28}/><strong>Conversación nueva</strong><span>Los mensajes que se reciban aparecerán aquí.</span></div>}
          </div>
          {(!isAtLatestMessage || newMessageCount > 0) && <button type="button" className="whatsapp-jump-to-latest" onClick={() => scrollToLatest('smooth')} aria-label={newMessageCount ? `Ver ${newMessageCount} mensajes nuevos` : 'Ir al último mensaje'}>
            <ChevronDown size={17}/><span>{newMessageCount ? `${newMessageCount} mensaje${newMessageCount === 1 ? '' : 's'} nuevo${newMessageCount === 1 ? '' : 's'}` : 'Ir al último mensaje'}</span>{newMessageCount > 0 && <small>{newMessageCount}</small>}
          </button>}
          {selected.blocked_at ? <footer className="whatsapp-composer-disabled is-blocked"><Ban size={16}/><span>Conversación bloqueada en el CRM. No se pueden enviar mensajes ni generar avisos para este contacto.</span></footer>
            : canReply ? windowOpen ? composerOpen ? <form id="whatsapp-message-composer" className="whatsapp-composer is-revealing" onSubmit={sendMessage}>
            <input ref={fileInputRef} className="whatsapp-file-input" type="file" accept="image/jpeg,image/png,video/mp4" onChange={chooseAttachment} aria-label="Adjuntar imagen o video"/>
            <div className="whatsapp-composer-heading"><span>Responder a <strong>{selected.contact_name || selected.contact_phone}</strong></span><button type="button" className="whatsapp-composer-close" onClick={() => setComposerOpen(false)} aria-label="Cerrar redacción"><X size={16}/></button></div>
            {attachment && <div className="whatsapp-attachment-preview">{attachment.type.startsWith('image/') ? <img src={attachment.previewUrl} alt="Vista previa del archivo"/> : <span className="whatsapp-video-preview">Video</span>}<span className="whatsapp-attachment-name">{attachment.name}</span><button type="button" className="whatsapp-attachment-remove" onClick={removeAttachment} aria-label="Quitar archivo"><X size={15}/></button></div>}
            {sendOutcomeUncertain && <p className="whatsapp-send-uncertain">Comprueba si llegó antes de intentar enviarlo otra vez.</p>}
            <div className="whatsapp-composer-entry"><button type="button" className="whatsapp-attach-button" onClick={() => fileInputRef.current?.click()} disabled={sending || uploadingAttachment || sendOutcomeUncertain} aria-label="Adjuntar imagen o video"><Paperclip size={18}/></button><textarea ref={composerInputRef} aria-label="Escribe un mensaje" placeholder="Escribe un mensaje" rows={1} maxLength={4096} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown}/><button type="submit" disabled={(!draft.trim() && !attachment) || sending || uploadingAttachment || sendOutcomeUncertain} aria-label="Enviar mensaje"><Send size={17}/>{uploadingAttachment ? 'Cargando…' : sending ? 'Enviando…' : 'Enviar'}</button></div>
          </form>
            : <footer className="whatsapp-composer-dock"><span className="whatsapp-composer-dock-copy"><MessageCircle size={16}/><span>{draft || attachment ? 'Tienes un borrador pendiente' : 'La conversación está en modo lectura'}</span></span><button type="button" className="whatsapp-composer-open" onClick={() => setComposerOpen(true)} aria-expanded={false} aria-controls="whatsapp-message-composer"><PencilLine size={16}/><span>{draft || attachment ? 'Continuar escribiendo' : 'Escribir mensaje'}</span></button></footer>
            : <footer className="whatsapp-composer-disabled"><MessageCircle size={16}/><span>Para responder, espera a que el contacto envíe un nuevo mensaje.</span></footer>
            : <footer className="whatsapp-composer-disabled"><MessageCircle size={16}/><span>Tu perfil puede consultar esta conversación.</span></footer>}
        </> : <div className="whatsapp-conversation-empty"><MessageCircle size={28}/><strong>Tu bandeja de WhatsApp</strong><span>{sharedMode ? 'Envía un WhatsApp al número del Sandbox para iniciar una conversación.' : 'Conecta la clínica para recibir mensajes.'}</span></div>}
      </main>
    </div>
    <dialog ref={imageDialogRef} className="whatsapp-image-dialog" aria-label="Vista ampliada de imagen" onClose={() => setExpandedImage(null)} onClick={event => { if (event.target === imageDialogRef.current) imageDialogRef.current.close(); }}>
      {expandedImage && <section className="whatsapp-image-dialog-frame">
        <header className="whatsapp-image-dialog-header">
          <div className="whatsapp-image-dialog-heading"><strong>Vista previa</strong><span>{expandedImage.filename}</span></div>
          <div className="whatsapp-image-dialog-actions">
            <a href={`${expandedImage.src}&download=1`}><Download size={16}/>Descargar</a>
            <button type="button" onClick={() => imageDialogRef.current?.close()}><ArrowLeft size={16}/>Volver</button>
          </div>
        </header>
        <div className="whatsapp-image-dialog-canvas"><img src={expandedImage.src} alt={expandedImage.filename}/></div>
      </section>}
    </dialog>
    <dialog ref={actionDialogRef} className="whatsapp-action-dialog" aria-labelledby="whatsapp-action-title" onCancel={event => { if (actionBusy) event.preventDefault(); }} onClose={() => { if (pendingAction) setPendingAction(null); }}>
      {pendingAction && <form method="dialog" onSubmit={event => event.preventDefault()}>
        <span className={`whatsapp-action-dialog-icon${pendingAction.action === 'delete' ? ' is-destructive' : ''}`}>{pendingAction.action === 'delete' ? <Trash2 size={19}/> : <Ban size={19}/>}</span>
        <h2 id="whatsapp-action-title">{pendingAction.action === 'delete' ? '¿Eliminar esta conversación?' : pendingAction.action === 'unblock' ? '¿Desbloquear este contacto?' : '¿Bloquear este contacto en el CRM?'}</h2>
        <p>{pendingAction.action === 'delete' ? 'Se eliminarán del CRM el historial y los archivos de esta conversación. Twilio conservará sus propios registros.' : pendingAction.action === 'unblock' ? 'El personal podrá volver a responder y recibir avisos de este contacto desde el CRM.' : 'El personal no podrá responder ni recibirá avisos de este contacto en el CRM. Los mensajes entrantes aún podrán llegar desde WhatsApp.'}</p>
        {actionError && <p className="whatsapp-action-error" role="alert">{actionError}</p>}
        <div className="whatsapp-action-dialog-buttons"><button type="button" disabled={actionBusy} onClick={() => setPendingAction(null)}>Cancelar</button><button type="button" className={pendingAction.action === 'delete' ? 'is-destructive' : 'is-primary'} disabled={actionBusy} onClick={runConversationAction}>{actionBusy ? 'Procesando…' : pendingAction.action === 'delete' ? 'Eliminar conversación' : pendingAction.action === 'unblock' ? 'Desbloquear' : 'Bloquear en el CRM'}</button></div>
      </form>}
    </dialog>
    {error && <p role="alert" className="whatsapp-inbox-error">{error}</p>}
  </section>;
}
