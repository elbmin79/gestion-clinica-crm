'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClinicAgendaStore } from './clinic-agenda';

export function useClinicAgenda(enabled, clinicId, date, period, timeZone, catalogs, listEnd) {
  const [appointments, setAppointments] = useState([]);
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle');
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey(value => value + 1), []);

  useEffect(() => {
    if (!enabled || !clinicId || !date || !timeZone) {
      setAppointments([]);
      setStatus(enabled ? 'loading' : 'idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    createClinicAgendaStore().load(clinicId, date, period, timeZone, catalogs, listEnd)
      .then(result => {
        if (!cancelled) { setAppointments(result); setStatus('ready'); }
      })
      .catch(() => {
        if (!cancelled) { setAppointments([]); setStatus('error'); }
      });
    return () => { cancelled = true; };
  }, [enabled, clinicId, date, period, timeZone, catalogs.patients, catalogs.branches, catalogs.providers, catalogs.businesses, listEnd, reloadKey]);

  return { appointments, status, refresh };
}
