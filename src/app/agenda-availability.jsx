'use client';

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { agendaClock } from '../lib/agenda-availability';
import { createClinicAvailabilityStore } from '../lib/supabase/clinic-availability';

const demoRules = { status: 'ready', hours: [], blocks: [] };
const loadingRules = { status: 'loading' };

export function useAgendaAvailability(enabled, sharedMode, clinicId, date, timeZone) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([clinicId, date, timeZone, attempt]);
  useEffect(() => {
    if (!enabled || !sharedMode || !clinicId || !date) return;
    let active = true;
    createClinicAvailabilityStore().loadAgendaDay(clinicId, date, timeZone)
      .then(rules => { if (active) setResult({ key, status: 'ready', ...rules }); })
      .catch(() => { if (active) setResult({ key, status: 'error' }); });
    return () => { active = false; };
  }, [enabled, sharedMode, clinicId, date, timeZone, key]);

  const rules = sharedMode ? (result?.key === key ? result : loadingRules) : demoRules;
  return { ...rules, retry: () => setAttempt(value => value + 1) };
}

export function AgendaAvailabilityControls({ active, onToggle, duration, onDurationChange }) {
  return <div className="agenda-availability-controls">
    <button type="button" className="agenda-availability-toggle" aria-pressed={active} onClick={onToggle}>
      <Clock3 size={16} aria-hidden="true" /> Horarios disponibles
    </button>
    {active && <label className="agenda-availability-duration">
      Duración
      <select aria-label="Duración" value={duration} onChange={event => onDurationChange(Number(event.target.value))}>
        {[15, 30, 45, 60, 75, 90, 105, 120].map(value => <option value={value} key={value}>{value} min</option>)}
      </select>
    </label>}
  </div>;
}

export function AgendaFreeBlock({ block, dayStartHour, provider, branch, onBook }) {
  const label = `${agendaClock(block.start)}–${agendaClock(block.end)}`;
  const minutes = block.end - block.start;
  const content = <><strong>{label}</strong><span>{minutes} min libres</span></>;
  const style = {
    top: `calc(${block.start / 60 - dayStartHour} * var(--hour) + 1px)`,
    height: `calc(${minutes / 60} * var(--hour) - 2px)`,
  };
  return onBook
    ? <button type="button" className="agenda-free-block" style={style} data-long={minutes >= 30}
        aria-label={`Agendar con ${provider.name}, ${branch.name}, ${label}, ${minutes} minutos libres`}
        onClick={() => onBook(agendaClock(block.start))}>{content}</button>
    : <div className="agenda-free-block" style={style} data-long={minutes >= 30}>{content}</div>;
}
