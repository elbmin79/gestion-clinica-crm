'use client';

import { useEffect, useState } from 'react';
import { demoPackageBalances } from '../lib/patient-packages';
import { createPatientPackageStore } from '../lib/supabase/patient-packages';

export function usePatientPackages({ patient, clinicId, sharedMode, demoPurchases, appointments, payments, reload = 0 }) {
  const patientId = patient?.databaseId;
  const key = sharedMode && clinicId && patientId ? `${clinicId}:${patientId}:${reload}` : null;
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    createPatientPackageStore().load(clinicId, patientId).then(
      rows => { if (active) setLoaded({ key, rows }); },
      () => { if (active) setLoaded({ key, error: true }); },
    );
    return () => { active = false; };
  }, [key, clinicId, patientId]);
  if (!sharedMode) return { rows: patient ? demoPackageBalances(demoPurchases, patient.id, appointments, payments) : [] };
  if (!key) return { error: true };
  return loaded?.key === key ? loaded : null;
}
