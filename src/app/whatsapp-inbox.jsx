'use client';

import { useMemo, useState } from 'react';
import { CheckCheck, MessageCircle, Search, ShieldCheck } from 'lucide-react';

const statusLabels = {
  pending: 'Programado',
  sending: 'En proceso',
  sent: 'Aceptado · simulado',
  failed: 'Falló · simulado',
  unknown: 'Incierto · simulado',
};

function initials(name = '') {
  return String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'P';
}

function previewFor(reminder) {
  const service = reminder.service || 'tu cita';
  const time = reminder.appointmentLabel || '';
  return `Hola ${reminder.patientName || ''}, te recordamos ${service === 'tu cita' ? 'tu cita' : `tu cita de ${service}`}${time ? `, programada para ${time}` : ''}.`;
}

function statusFor(reminder) {
  if (!reminder.deliveryEligible) return '';
  if (reminder.simulated || ['sent', 'failed', 'unknown'].includes(reminder.status)) return statusLabels[reminder.status] || 'Simulado';
  return statusLabels[reminder.status] || 'Programado';
}

export default function WhatsAppInbox({ reminders = [], sharedMode = false }) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const threads = useMemo(() => {
    const grouped = new Map();
    reminders.filter(item => item.deliveryEligible || ['sent', 'failed', 'unknown'].includes(item.status)).forEach(item => {
      const key = `${item.patientName || 'Paciente'}:${item.branchName || ''}`;
      if (!grouped.has(key)) grouped.set(key, { key, name: item.patientName || 'Paciente', branch: item.branchName || '', messages: [] });
      grouped.get(key).messages.push(item);
    });
    return [...grouped.values()].map(thread => ({
      ...thread,
      messages: thread.messages.slice().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    })).sort((a, b) => (b.messages.at(-1)?.scheduledAt || '').localeCompare(a.messages.at(-1)?.scheduledAt || ''));
  }, [reminders]);
  const filteredThreads = threads.filter(thread => thread.name.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedThread = filteredThreads.find(thread => thread.key === selectedKey) || filteredThreads[0] || null;

  return <section className="whatsapp-inbox-page" aria-label="Mensajes de WhatsApp">
    <header className="whatsapp-inbox-heading">
      <div><h1>WhatsApp</h1><p>Mensajes de cita en modo de prueba</p></div>
      <span className="whatsapp-inbox-mode"><ShieldCheck size={15}/> Simulación</span>
    </header>
    <div className="whatsapp-inbox-shell">
      <aside className="whatsapp-thread-list" aria-label="Conversaciones">
        <div className="whatsapp-thread-search"><Search size={16}/><input aria-label="Buscar conversación" placeholder="Buscar conversación" value={query} onChange={event => setQuery(event.target.value)}/></div>
        {filteredThreads.length ? filteredThreads.map(thread => {
          const latest = thread.messages.at(-1);
          return <button className={`whatsapp-thread-item${selectedThread?.key === thread.key ? ' is-selected' : ''}`} type="button" key={thread.key} onClick={() => setSelectedKey(thread.key)}>
            <span className="whatsapp-thread-avatar">{initials(thread.name)}</span>
            <span className="whatsapp-thread-copy"><strong>{thread.name}</strong><span>{previewFor(latest)}</span></span>
            <span className="whatsapp-thread-meta"><time>{latest.scheduledLabel}</time><small>{thread.messages.length}</small></span>
          </button>;
        }) : <p className="whatsapp-inbox-empty-list">{query ? 'No se encontraron conversaciones.' : 'Aún no hay mensajes elegibles.'}</p>}
      </aside>
      <main className="whatsapp-conversation">
        {selectedThread ? <>
          <header className="whatsapp-conversation-header"><span className="whatsapp-thread-avatar">{initials(selectedThread.name)}</span><div><strong>{selectedThread.name}</strong><span>{selectedThread.branch || 'Clínica'}</span></div><span className="whatsapp-conversation-readonly">Vista de prueba</span></header>
          <div className="whatsapp-message-history">
            <p className="whatsapp-history-note"><ShieldCheck size={14}/> Vista previa; estos mensajes no se enviaron por WhatsApp.</p>
            {selectedThread.messages.map(item => <article className="whatsapp-message-row" key={item.id}>
              <div className="whatsapp-message-bubble"><span className="whatsapp-message-kind">{item.label}</span><p>{previewFor(item)}</p><div className="whatsapp-message-details"><span>{item.appointmentLabel}{item.branchName ? ` · ${item.branchName}` : ''}</span><span>{item.scheduledLabel} <CheckCheck size={14}/></span></div></div>
              <span className={`whatsapp-message-status is-${item.status || 'pending'}`}>{statusFor(item)}</span>
            </article>)}
          </div>
          <footer className="whatsapp-composer-disabled"><MessageCircle size={16}/><span>Los mensajes solo se muestran en esta vista de prueba.</span></footer>
        </> : <div className="whatsapp-conversation-empty"><MessageCircle size={28}/><strong>Tu bandeja de WhatsApp</strong><span>{sharedMode ? 'Los recordatorios elegibles aparecerán aquí como vistas previas simuladas.' : 'Las citas confirmadas con autorización y teléfono válido aparecerán aquí.'}</span></div>}
      </main>
    </div>
  </section>;
}
