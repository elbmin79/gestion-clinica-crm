'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { demoCompletedVisits, summarizeAppointmentHistory } from '../lib/appointment-history';
import { createClinicAgendaStore } from '../lib/supabase/clinic-agenda';

export default function AppointmentHistory({ patient, sharedMode, clinicId, appointments, treatments, date, time, timeZone }) {
  const patientId = patient.databaseId;
  const [history, setHistory] = useState(null);
  useEffect(() => {
    if (!sharedMode || !clinicId || !patientId) return;
    let active = true;
    createClinicAgendaStore().loadCompletedHistory(clinicId, patientId).then(
      visits => { if (active) setHistory({ visits }); },
      () => { if (active) setHistory({ error: true }); },
    );
    return () => { active = false; };
  }, [sharedMode, clinicId, patientId]);

  let content;
  if (sharedMode && (!clinicId || !patientId || history?.error)) content = 'No se pudo consultar el historial de citas.';
  else if (sharedMode && !history) content = 'Consultando historial de citas…';
  else {
    const visits = sharedMode ? history.visits : demoCompletedVisits(appointments, patient.id, timeZone);
    const summary = summarizeAppointmentHistory(visits, treatments, { date, time, timeZone });
    content = <>
      <strong>{summary.completedVisits === 0 ? 'Primera visita registrada'
        : summary.completedVisits === 1 ? '1 visita completada en la clínica'
        : `${summary.completedVisits} visitas completadas en la clínica`}</strong>
      {summary.treatments.map(({ id, name, sessions }) => <div key={id || name}>
        {name} · {sessions === 1 ? '1 sesión completada' : `${sessions} sesiones completadas`}
      </div>)}
    </>;
  }
  return <section className="form-note" aria-label="Historial de citas" aria-live="polite">
    <History size={15} aria-hidden="true"/>
    <div>{content}</div>
  </section>;
}
