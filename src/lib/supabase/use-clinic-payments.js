'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClinicPaymentsStore } from './clinic-payments';

const emptyWorkspace = { payments: [], patients: [], appointments: [] };

export function useClinicPayments(enabled, clinicId, role, timeZone, catalogs, permissions = {}) {
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle');
  const [workspaceScope, setWorkspaceScope] = useState('');
  const [statusScope, setStatusScope] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey(value => value + 1), []);
  const scope = `${clinicId}:${role}`;

  useEffect(() => {
    if (!enabled) { setWorkspace(emptyWorkspace); setWorkspaceScope(''); setStatus('idle'); setStatusScope(''); return; }
    if (!clinicId || !timeZone) { setWorkspace(emptyWorkspace); setWorkspaceScope(''); setStatus('loading'); setStatusScope(scope); return; }
    let cancelled = false;
    setStatus('loading');
    setStatusScope(scope);
    createClinicPaymentsStore().load(clinicId, timeZone, catalogs)
      .then(result => { if (!cancelled) { setWorkspace(result); setWorkspaceScope(scope); setStatus('ready'); } })
      .catch(() => { if (!cancelled) { setWorkspace(emptyWorkspace); setWorkspaceScope(''); setStatus('error'); } });
    return () => { cancelled = true; };
  }, [enabled, clinicId, role, permissions, timeZone, catalogs.branches, catalogs.providers, catalogs.businesses, reloadKey, scope]);

  const visibleWorkspace = enabled && workspaceScope === scope ? workspace : emptyWorkspace;
  const visibleStatus = enabled ? (statusScope === scope ? status : 'loading') : 'idle';
  return { ...visibleWorkspace, status: visibleStatus, refresh };
}
