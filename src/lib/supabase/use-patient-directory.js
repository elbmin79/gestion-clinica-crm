'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from './client';
import { createPatientDirectoryStore } from './patient-directory';

const emptyDirectory = { patients: [], businesses: [], branches: [], providers: [], activities: [], templates: [] };
const selectedClinicStorageKey = 'crm-selected-clinic-v1';

export function usePatientDirectory(enabled) {
  const [clinicId, setClinicId] = useState('');
  const [memberships, setMemberships] = useState([]);
  const [role, setRole] = useState('');
  const [timeZone, setTimeZone] = useState('America/Tijuana');
  const [directory, setDirectory] = useState(emptyDirectory);
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle');
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey(value => value + 1), []);
  const chooseClinic = useCallback((id) => {
    if (!memberships.some(membership => membership.clinicId === id)) return;
    try { window.sessionStorage.setItem(selectedClinicStorageKey, id); } catch { /* Session selection remains available in memory. */ }
    setClinicId(id);
  }, [memberships]);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      setClinicId('');
      setMemberships([]);
      setRole('');
      setTimeZone('America/Tijuana');
      setDirectory(emptyDirectory);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setStatus('loading');
      const client = createClient();
      if (!client) { if (!cancelled) setStatus('not_configured'); return; }

      const userResult = await client.auth.getUser();
      if (userResult.error || !userResult.data.user) {
        try { window.sessionStorage.removeItem(selectedClinicStorageKey); } catch { /* Ignore unavailable browser storage. */ }
        if (!cancelled) { setClinicId(''); setMemberships([]); setRole(''); setTimeZone('America/Tijuana'); setDirectory(emptyDirectory); setStatus('signed_out'); }
        return;
      }

      const membershipResult = await client.from('clinic_memberships')
        .select('clinic_id, role')
        .eq('user_id', userResult.data.user.id)
        .order('created_at', { ascending: true });
      if (membershipResult.error) {
        if (!cancelled) { setDirectory(emptyDirectory); setStatus('error'); }
        return;
      }

      const membershipRows = membershipResult.data || [];
      const clinicIds = membershipRows.map(row => row.clinic_id);
      let clinicNames = new Map();
      if (clinicIds.length) {
        const clinicResult = await client.from('clinics').select('id, name, timezone').in('id', clinicIds);
        if (clinicResult.error) {
          if (!cancelled) { setDirectory(emptyDirectory); setStatus('error'); }
          return;
        }
        clinicNames = new Map((clinicResult.data || []).map(row => [row.id, row]));
      }
      const nextMemberships = membershipRows.map(row => ({ clinicId: row.clinic_id, role: row.role, name: clinicNames.get(row.clinic_id)?.name || 'Clínica', timeZone: clinicNames.get(row.clinic_id)?.timezone || 'America/Tijuana' }));
      if (cancelled) return;
      setMemberships(nextMemberships);

      let rememberedClinicId = '';
      try { rememberedClinicId = window.sessionStorage.getItem(selectedClinicStorageKey) || ''; } catch { /* Continue without a remembered selection. */ }
      const inMemoryMembership = nextMemberships.find(item => item.clinicId === clinicId);
      const rememberedMembership = nextMemberships.find(item => item.clinicId === rememberedClinicId);
      const activeMembership = inMemoryMembership || rememberedMembership;

      if (!nextMemberships.length) {
        try { window.sessionStorage.removeItem(selectedClinicStorageKey); } catch { /* Ignore unavailable browser storage. */ }
        setClinicId(''); setRole(''); setDirectory(emptyDirectory); setStatus('no_membership');
        return;
      }
      if (rememberedClinicId && !rememberedMembership) {
        try { window.sessionStorage.removeItem(selectedClinicStorageKey); } catch { /* Ignore unavailable browser storage. */ }
      }
      if (clinicId && !inMemoryMembership && !rememberedMembership && nextMemberships.length > 1) {
        setClinicId(''); setRole(''); setDirectory(emptyDirectory); setStatus('choose_clinic');
        return;
      }
      if (!activeMembership && nextMemberships.length > 1) {
        setRole(''); setDirectory(emptyDirectory); setStatus('choose_clinic');
        return;
      }
      const selected = activeMembership || nextMemberships[0];
      if (clinicId !== selected.clinicId) setClinicId(selected.clinicId);
      try { window.sessionStorage.setItem(selectedClinicStorageKey, selected.clinicId); } catch { /* Session selection remains available in memory. */ }
      setRole(selected.role);
      setTimeZone(selected.timeZone);
      if (!['admin', 'clinician', 'receptionist'].includes(selected.role)) {
        setDirectory(emptyDirectory); setStatus('no_patient_access');
        return;
      }

      try {
        const store = createPatientDirectoryStore();
        const result = await store.load(selected.clinicId, selected.role);
        if (!cancelled) { setDirectory(result); setStatus('ready'); }
      } catch {
        if (!cancelled) { setDirectory(emptyDirectory); setStatus('error'); }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [enabled, clinicId, reloadKey]);

  return { ...directory, clinicId, memberships, role, timeZone, status, refresh, chooseClinic };
}
