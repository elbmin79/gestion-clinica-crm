import * as SecureStore from 'expo-secure-store';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export type ClinicMembership = {
  clinicId: string;
  name: string;
  role: string;
  permissions: Record<string, unknown>;
  timeZone: string;
};

type WorkspaceValue = {
  memberships: ClinicMembership[];
  clinic: ClinicMembership | null;
  loading: boolean;
  error: string;
  chooseClinic: (clinicId: string) => Promise<void>;
  refresh: () => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const SELECTED_CLINIC_KEY = 'crm-selected-clinic-v1';

export function ClinicWorkspaceProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [memberships, setMemberships] = useState<ClinicMembership[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!session?.user.id) {
      setMemberships([]);
      setSelectedClinicId('');
      setError('');
      setLoading(false);
      return () => { cancelled = true; };
    }

    const load = async () => {
      setLoading(true);
      setError('');
      const client = createClient();
      if (!client) {
        if (!cancelled) { setError('La conexión de la clínica no está configurada.'); setLoading(false); }
        return;
      }
      const result = await client.from('clinic_memberships')
        .select('clinic_id, role, permissions')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });
      if (result.error) {
        if (!cancelled) { setError('No se pudieron cargar tus clínicas. Intenta de nuevo.'); setLoading(false); }
        return;
      }
      const rows = result.data || [];
      const clinicIds = rows.map(row => row.clinic_id);
      const clinicResult = clinicIds.length
        ? await client.from('clinics').select('id, name, timezone').in('id', clinicIds)
        : { data: [], error: null };
      if (clinicResult.error) {
        if (!cancelled) { setError('No se pudieron cargar los datos de la clínica. Intenta de nuevo.'); setLoading(false); }
        return;
      }
      const clinicById = new Map((clinicResult.data || []).map(item => [item.id, item]));
      const next = rows.map(row => ({
        clinicId: row.clinic_id,
        name: clinicById.get(row.clinic_id)?.name || 'Clínica',
        role: row.role,
        permissions: row.permissions || {},
        timeZone: clinicById.get(row.clinic_id)?.timezone || 'America/Tijuana',
      }));
      const remembered = await SecureStore.getItemAsync(SELECTED_CLINIC_KEY).catch(() => '');
      const selected = next.find(item => item.clinicId === remembered) || (next.length === 1 ? next[0] : null);
      if (!cancelled) {
        setMemberships(next);
        setSelectedClinicId(selected?.clinicId || '');
        setLoading(false);
      }
    };
    void load().catch(() => {
      if (!cancelled) { setError('No se pudieron cargar tus clínicas. Intenta de nuevo.'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [session?.user.id, reloadKey]);

  const clinic = memberships.find(item => item.clinicId === selectedClinicId) || null;
  const value = useMemo<WorkspaceValue>(() => ({
    memberships,
    clinic,
    loading,
    error,
    async chooseClinic(clinicId) {
      if (!memberships.some(item => item.clinicId === clinicId)) return;
      await SecureStore.setItemAsync(SELECTED_CLINIC_KEY, clinicId);
      setSelectedClinicId(clinicId);
    },
    refresh() { setReloadKey(key => key + 1); },
  }), [clinic, error, loading, memberships]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useClinicWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useClinicWorkspace debe usarse dentro de ClinicWorkspaceProvider.');
  return value;
}
