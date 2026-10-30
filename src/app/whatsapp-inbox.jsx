'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Search, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import './whatsapp-inbox.css';

function initials(name = '') { return String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'W'; }
function displayTime(value) { return value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : ''; }

export default function WhatsAppInbox({ clinicId = '', sharedMode = false, role = '' }) {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const canReply = ['admin', 'receptionist'].includes(role);

  const refresh = useCallback(async () => {
    if (!sharedMode || !clinicId) { setStatus('idle'); return; }
    const client = createClient();
    if (!client) { setStatus('error'); setError('La conexión con la clínica no está configurada.'); return; }
    const result = await client.from('clinic_whatsapp_conversations')
      .select('id,contact_phone,contact_name,sender_phone,last_inbound_at,last_message_at')
      .eq('clinic_id', clinicId).order('last_message_at', { ascending: false }).limit(100);
    if (result.error) { setStatus('error'); setError('No se pudieron cargar las conversaciones.'); return; }
    setConversations(result.data || []);
    setStatus('ready');
  }, [clinicId, sharedMode]);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 8000); return () => window.clearInterval(timer); }, [refresh]);

  const visibleConversations = useMemo(() => conversations.filter(item => `${item.contact_name || ''} ${item.contact_phone}`.toLowerCase().includes(query.trim().toLowerCase())), [conversations, query]);
  const selected = visibleConversations.find(item => item.id === selectedId) || visibleConversations[0] || null;

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    let active = true;
    const load = async () => {
      const result = await createClient().from('clinic_whatsapp_messages').select('id,direction,body,delivery_status,created_at')
        .eq('clinic_id', clinicId).eq('conversation_id', selected.id).order('created_at', { ascending: true }).limit(300);
      if (!active) return;
      if (result.error) { setError('No se pudieron cargar los mensajes.'); return; }
      setMessages(result.data || []);
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [clinicId, selected?.id]);

  const windowOpen = selected?.last_inbound_at && Date.now() - Date.parse(selected.last_inbound_at) < 24 * 60 * 60 * 1000;
  async function sendMessage(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selected || sending) return;
    setSending(true); setError('');
    try {
      const response = await fetch('/api/whatsapp/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId, conversationId: selected.id, body }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo enviar el mensaje.');
      setDraft('');
      await Promise.all([refresh(), (async () => {
        const data = await createClient().from('clinic_whatsapp_messages').select('id,direction,body,delivery_status,created_at').eq('clinic_id', clinicId).eq('conversation_id', selected.id).order('created_at', { ascending: true }).limit(300);
        if (!data.error) setMessages(data.data || []);
      })()]);
    } catch (sendError) { setError(sendError.message); }
    finally { setSending(false); }
  }

  return <section className="whatsapp-inbox-page" aria-label="Conversaciones de WhatsApp">
    <header className="whatsapp-inbox-heading"><div><h1>WhatsApp</h1><p>Conversaciones con tus contactos</p></div></header>
    <div className="whatsapp-inbox-shell">
      <aside className="whatsapp-thread-list" aria-label="Conversaciones">
        <div className="whatsapp-thread-search"><Search size={16}/><input aria-label="Buscar conversación" placeholder="Buscar conversación" value={query} onChange={event => setQuery(event.target.value)}/></div>
        {visibleConversations.map(item => <button className={`whatsapp-thread-item${selected?.id === item.id ? ' is-selected' : ''}`} type="button" key={item.id} onClick={() => setSelectedId(item.id)}>
          <span className="whatsapp-thread-avatar">{initials(item.contact_name || item.contact_phone)}</span>
          <span className="whatsapp-thread-copy"><strong>{item.contact_name || item.contact_phone}</strong><span>{item.contact_phone}</span></span>
          <span className="whatsapp-thread-meta"><time>{displayTime(item.last_message_at)}</time></span>
        </button>)}
        {status === 'loading' && <p className="whatsapp-inbox-empty-list">Cargando conversaciones…</p>}
        {status === 'idle' && <p className="whatsapp-inbox-empty-list">Conecta la clínica para recibir mensajes.</p>}
        {status === 'ready' && !visibleConversations.length && <p className="whatsapp-inbox-empty-list">Aún no hay mensajes.</p>}
      </aside>
      <main className="whatsapp-conversation">
        {selected ? <>
          <header className="whatsapp-conversation-header"><span className="whatsapp-thread-avatar">{initials(selected.contact_name || selected.contact_phone)}</span><div><strong>{selected.contact_name || selected.contact_phone}</strong><span>{selected.contact_phone}</span></div><span className="whatsapp-conversation-readonly">{selected.sender_phone}</span></header>
          <div className="whatsapp-message-history" aria-live="polite">
            {messages.length ? messages.map(message => <article className={`whatsapp-message-row is-${message.direction}`} key={message.id}>
              <div className="whatsapp-message-bubble"><p>{message.body}</p><div className="whatsapp-message-details"><span>{displayTime(message.created_at)}</span>{message.direction === 'outbound' && <span>{message.delivery_status === 'failed' ? 'No enviado' : 'Enviado'}</span>}</div></div>
            </article>) : <div className="whatsapp-conversation-empty"><MessageCircle size={28}/><strong>Conversación nueva</strong><span>Los mensajes que se reciban aparecerán aquí.</span></div>}
          </div>
          {canReply ? windowOpen ? <form className="whatsapp-composer" onSubmit={sendMessage}><textarea aria-label="Escribe un mensaje" placeholder="Escribe un mensaje" rows={2} maxLength={4096} value={draft} onChange={event => setDraft(event.target.value)}/><button type="submit" disabled={!draft.trim() || sending} aria-label="Enviar mensaje"><Send size={17}/>{sending ? 'Enviando…' : 'Enviar'}</button></form>
            : <footer className="whatsapp-composer-disabled"><MessageCircle size={16}/><span>Para responder, espera a que el contacto envíe un nuevo mensaje.</span></footer>
            : <footer className="whatsapp-composer-disabled"><MessageCircle size={16}/><span>Tu perfil puede consultar esta conversación.</span></footer>}
        </> : <div className="whatsapp-conversation-empty"><MessageCircle size={28}/><strong>Tu bandeja de WhatsApp</strong><span>{sharedMode ? 'Envía un WhatsApp al número del Sandbox para iniciar una conversación.' : 'Conecta la clínica para recibir mensajes.'}</span></div>}
      </main>
    </div>
    {error && <p role="alert" className="whatsapp-inbox-error">{error}</p>}
  </section>;
}
