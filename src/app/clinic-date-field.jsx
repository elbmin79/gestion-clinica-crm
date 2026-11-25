'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';

function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function isoFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localISODate(date = new Date()) {
  return isoFromDate(date);
}

function formatLabel(value) {
  const date = parseISODate(value);
  if (!date) return 'Elegir fecha';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function titleCase(value) {
  return String(value || '').replace(/^./, letter => letter.toUpperCase());
}

function useFieldPopover(estimateHeight) {
  const buttonRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = event => {
      if (buttonRef.current?.contains(event.target) || popRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const show = () => {
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 292;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const top = window.innerHeight - rect.bottom < estimateHeight && rect.top > estimateHeight ? rect.top - estimateHeight + 8 : rect.bottom + 6;
    setBox({ top, left, width });
    setOpen(true);
  };
  return { buttonRef, popRef, open, setOpen, box, show };
}

export function ClinicDateField({ name, value, defaultValue = '', onChange, required = false, min, max, disabled = false, 'aria-label': ariaLabel }) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue || '');
  const selected = controlled ? (value || '') : inner;
  const [cursor, setCursor] = useState(() => parseISODate(selected) || new Date());
  const [view, setView] = useState('days');
  const { buttonRef, popRef, open, setOpen, box, show } = useFieldPopover(360);
  const commit = next => {
    if (!controlled) setInner(next);
    onChange?.({ target: { name, value: next } });
    setOpen(false);
    setView('days');
  };
  const openPicker = () => {
    setCursor(parseISODate(selected) || new Date());
    setView('days');
    show();
  };
  const shift = direction => {
    if (view === 'years') setCursor(new Date(cursor.getFullYear() + direction * 12, cursor.getMonth(), 1));
    else if (view === 'months') setCursor(new Date(cursor.getFullYear() + direction, cursor.getMonth(), 1));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1));
  };
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startPad = (monthStart.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) => new Date(monthStart.getFullYear(), monthStart.getMonth(), index - startPad + 1));
  const yearPage = Math.floor(cursor.getFullYear() / 12) * 12;
  const today = localISODate();
  const heading = view === 'years'
    ? `${yearPage} – ${yearPage + 11}`
    : view === 'months'
      ? String(cursor.getFullYear())
      : titleCase(new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(cursor));
  const popover = open && box ? createPortal(
    <div ref={popRef} className="clinic-date-popover" style={{ top: box.top, left: box.left, width: box.width }} role="dialog" aria-label="Calendario">
      <div className="clinic-date-head">
        <button type="button" aria-label="Anterior" onClick={() => shift(-1)}><ChevronLeft size={16}/></button>
        <button type="button" className="clinic-date-title" onClick={() => setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'months')}>{heading}</button>
        <button type="button" aria-label="Siguiente" onClick={() => shift(1)}><ChevronRight size={16}/></button>
      </div>
      {view === 'days' && <>
        <div className="clinic-date-week">{['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="clinic-date-grid">
          {days.map(day => {
            const iso = isoFromDate(day);
            const blocked = (min && iso < min) || (max && iso > max);
            return <button type="button" key={iso} disabled={blocked} className={`${iso === selected ? 'is-selected' : ''} ${iso === today ? 'is-today' : ''} ${day.getMonth() !== cursor.getMonth() ? 'is-outside' : ''}`} onClick={() => commit(iso)}>{day.getDate()}</button>;
          })}
        </div>
      </>}
      {view === 'months' && <div className="clinic-date-choices">
        {Array.from({ length: 12 }, (_, month) => {
          const label = titleCase(new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(new Date(2026, month, 1))).replace('.', '');
          return <button type="button" key={month} className={month === cursor.getMonth() ? 'is-selected' : ''} onClick={() => { setCursor(new Date(cursor.getFullYear(), month, 1)); setView('days'); }}>{label}</button>;
        })}
      </div>}
      {view === 'years' && <div className="clinic-date-choices">
        {Array.from({ length: 12 }, (_, index) => yearPage + index).map(year => <button type="button" key={year} className={year === cursor.getFullYear() ? 'is-selected' : ''} onClick={() => { setCursor(new Date(year, cursor.getMonth(), 1)); setView('months'); }}>{year}</button>)}
      </div>}
      <div className="clinic-date-foot">
        {!required && <button type="button" onClick={() => commit('')}>Quitar</button>}
        <button type="button" onClick={() => commit(today)} disabled={(min && today < min) || (max && today > max)}>Hoy</button>
      </div>
    </div>,
    document.body,
  ) : null;

  return <div className="clinic-date">
    <button ref={buttonRef} type="button" className="clinic-date-button" aria-label={ariaLabel || 'Elegir fecha'} aria-expanded={open} disabled={disabled} onClick={() => (open ? setOpen(false) : openPicker())}>
      <CalendarDays size={15}/><span>{formatLabel(selected)}</span>
    </button>
    <input className="clinic-date-value" name={name} value={selected} required={required} aria-label={ariaLabel} onChange={() => {}}/>
    {popover}
  </div>;
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function timeValue(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function chooseValue(hour12, minute, period) {
  let hour = hour12 % 12;
  if (period === 'pm') hour += 12;
  return timeValue(hour, minute);
}

function formatTime(value) {
  const parsed = parseTime(value);
  if (!parsed) return 'Elegir hora';
  return new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, parsed.hour, parsed.minute));
}

export function ClinicTimeField({ name, value, defaultValue = '', onChange, required = false, min, max, step = 300, disabled = false, 'aria-label': ariaLabel }) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue || '');
  const selected = controlled ? (value || '') : inner;
  const parsed = parseTime(selected) || { hour: 9, minute: 0 };
  const minuteStep = Math.max(1, Math.round(Number(step || 300) / 60));
  const { buttonRef, popRef, open, setOpen, box, show } = useFieldPopover(280);
  const commit = next => {
    if ((min && next < min) || (max && next > max)) return;
    if (!controlled) setInner(next);
    onChange?.({ target: { name, value: next } });
  };
  const hours = Array.from({ length: 12 }, (_, index) => index + 1);
  const minutes = [...new Set([...Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) => index * minuteStep).filter(minute => minute < 60), parsed.minute])].sort((a, b) => a - b);
  const allowed = next => (!min || next >= min) && (!max || next <= max);
  const hasTime = Boolean(parseTime(selected));
  const period = parsed.hour >= 12 ? 'pm' : 'am';
  const hour12 = parsed.hour % 12 || 12;
  const choose = (nextHour12, nextMinute, nextPeriod) => commit(chooseValue(nextHour12, nextMinute, nextPeriod));
  const popover = open && box ? createPortal(
    <div ref={popRef} className="clinic-date-popover clinic-time-popover" style={{ top: box.top, left: box.left, width: box.width }} role="dialog" aria-label="Hora">
      <div className="clinic-time-cols">
        <div>{hours.map(hour => { const next = chooseValue(hour, parsed.minute, period); return <button type="button" key={hour} className={hasTime && hour === hour12 ? 'is-selected' : ''} disabled={!allowed(next)} onClick={() => choose(hour, parsed.minute, period)}>{String(hour).padStart(2, '0')}</button>; })}</div>
        <div>{minutes.map(minute => { const next = chooseValue(hour12, minute, period); return <button type="button" key={minute} className={hasTime && minute === parsed.minute ? 'is-selected' : ''} disabled={!allowed(next)} onClick={() => choose(hour12, minute, period)}>{String(minute).padStart(2, '0')}</button>; })}</div>
        <div>{['am', 'pm'].map(item => { const next = chooseValue(hour12, parsed.minute, item); return <button type="button" key={item} className={hasTime && item === period ? 'is-selected' : ''} disabled={!allowed(next)} onClick={() => choose(hour12, parsed.minute, item)}>{item === 'am' ? 'a.m.' : 'p.m.'}</button>; })}</div>
      </div>
      <div className="clinic-date-foot"><button type="button" onClick={() => setOpen(false)}>Listo</button></div>
    </div>,
    document.body,
  ) : null;
  return <div className="clinic-date">
    <button ref={buttonRef} type="button" className="clinic-date-button" aria-label={ariaLabel || 'Elegir hora'} aria-expanded={open} disabled={disabled} onClick={() => (open ? setOpen(false) : show())}>
      <Clock3 size={15}/><span>{formatTime(selected)}</span>
    </button>
    <input className="clinic-date-value" name={name} value={selected} required={required} aria-label={ariaLabel} onChange={() => {}}/>
    {popover}
  </div>;
}
