import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { createClient } from '@/lib/supabase';
import { unlinkNativePushBeforeSignOut } from '@/lib/native-push';

type AuthValue = {
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendRecovery: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const client = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let alive = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (alive) {
        if (!error) setSession(data.session);
        setLoading(false);
      }
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthValue>(() => ({
    session,
    loading,
    configured: Boolean(client),
    async signIn(email, password) {
      if (!client) throw new Error('La conexión de la clínica no está configurada.');
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    },
    async signOut() {
      if (!client) return;
      await unlinkNativePushBeforeSignOut();
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    async sendRecovery(email) {
      if (!client) throw new Error('La conexión de la clínica no está configurada.');
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'elixirclinic://reset-password',
      });
      if (error) throw error;
    },
  }), [client, loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return value;
}
