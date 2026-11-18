import { agendaClock } from '../lib/agenda-availability';
import { packAgendaAppointments } from '../lib/agenda-compact';

export default function AgendaCompact({ appointments, colors, currentTime, canCreate, onCreate, onOpen }) {
  const events = packAgendaAppointments(appointments, 6 * 60, 24 * 60);
  const start = Math.floor(Math.min(9 * 60, events[0]?.start ?? Infinity) / 60) * 60;
  const end = Math.ceil(Math.max(18 * 60, ...events.map(event => event.end)) / 60) * 60;
  const colorByProvider = new Map(colors.map(color => [color.id, color.hex]));
  const usedProviders = new Set(events.map(({ appointment }) => appointment.providerId));
  const legend = colors.filter(color => usedProviders.has(color.id));
  const position = minute => `calc(${(minute - start) / 60} * var(--compact-hour))`;
  return <>
    {legend.length > 0 && <ul className="compact-agenda-legend" aria-label="Colores por profesional">
      {legend.map(color => <li key={color.id}><i className="agenda-color-dot" style={{ '--appointment-color':color.hex }} aria-hidden="true"/>{color.label}</li>)}
    </ul>}
    {!events.length && <p className="compact-agenda-empty">No hay citas para este día con los filtros actuales.</p>}
    <div className="compact-agenda" aria-label="Agenda compacta">
      <div className="compact-agenda-hours" aria-hidden="true">
        {Array.from({length:(end-start)/60}, (_, index) => <div key={index}>{agendaClock(start+index*60)}</div>)}
      </div>
      <div className="compact-agenda-track">
        {Array.from({length:(end-start)/60}, (_, index) => <div className="compact-agenda-hour" key={index}/>)}
        {canCreate && Array.from({length:(end-start-45)/15+1}, (_, index) => {
          const minute = start + index * 15;
          const time = agendaClock(minute);
          return <button type="button" key={minute} className="compact-agenda-slot" style={{ top:position(minute) }}
            aria-label={`Agendar cita a las ${time}`} onClick={() => onCreate(time)}>+ Agendar cita</button>;
        })}
        {events.map(({ appointment, start: top, end: bottom, column, span, columnCount }, index) => {
          const details = [appointment.time, appointment.patient, appointment.clinician, appointment.service, appointment.status].filter(Boolean).join(' · ');
          return <button type="button" key={appointment.id || index}
            className="compact-agenda-event agenda-colored-event" data-cancelled={appointment.status === 'Cancelada'}
            style={{
              '--appointment-color': colorByProvider.get(appointment.providerId) ?? '#66717f',
              top: position(top),
              height: `calc(${(bottom-top)/60} * var(--compact-hour) - 1px)`,
              left: `calc(${100*column/columnCount}% + 1px)`,
              width: `calc(${100*span/columnCount}% - 2px)`,
            }}
            aria-label={`Abrir cita: ${details}`} title={details} onClick={() => onOpen(appointment)}>
            <strong>{appointment.patient}</strong>
            {bottom-top >= 30 && <small>{appointment.time} · {appointment.service}</small>}
          </button>;
        })}
        {currentTime != null && currentTime >= start && currentTime < end && <div className="compact-agenda-now" style={{top:position(currentTime)}} aria-hidden="true"/>}
      </div>
    </div>
  </>;
}
