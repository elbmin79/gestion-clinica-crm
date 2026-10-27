'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClinicRemindersStore } from './clinic-reminders';

export function useClinicReminders(enabled, clinicId, role, timeZone) {
  const [reminders, setReminders] = useState([]);
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle');
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey(value => value + 1), []);

  useEffect(() => {
    if (!enabled) { setReminders([]); setStatus('idle'); return; }
    if (!['admin', 'receptionist'].includes(role)) {
      setReminders([]);
      setStatus(clinicId ? 'no_access' : 'loading');
      return;
    }
    if (!clinicId || !timeZone) { setReminders([]); setStatus('loading'); return; }
    let cancelled = false;
    setStatus('loading');
    createClinicRemindersStore().load(clinicId, timeZone)
      .then(result => { if (!cancelled) { setReminders(result); setStatus('ready'); } })
      .catch(() => { if (!cancelled) { setReminders([]); setStatus('error'); } });
    return () => { cancelled = true; };
  }, [enabled, clinicId, role, timeZone, reloadKey]);

  return { reminders, status, refresh };
}
