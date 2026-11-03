import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CrmText as Text } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { useCrmRouter } from '@/lib/use-crm-router';
import { createClient } from '@/lib/supabase';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';

function safeNext(value: string | null) {
  const match = value?.match(/^\/accept-invite\?id=([0-9a-f-]{36})$/i);
  return match ? `/accept-invite?id=${match[1]}` : '';
}

export default function AuthCallbackScreen() {
  const router = useCrmRouter();
  const palette = Colors[useCrmColorScheme() === 'dark' ? 'dark' : 'light'];
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let handled = '';
    const handle = async (rawUrl: string | null) => {
      if (!rawUrl || rawUrl === handled) return;
      handled = rawUrl;
      try {
        const url = new URL(rawUrl);
        const query = new URLSearchParams(url.search);
        const next = safeNext(query.get('next'));
        const client = createClient();
        if (!client) throw new Error('La conexión de la clínica no está configurada.');
        if (query.get('error') || query.get('error_description')) {
          throw new Error(query.get('error_description') || 'El enlace de invitación no es válido o ya venció.');
        }
        const code = query.get('code');
        const tokenHash = query.get('token_hash');
        if (code) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash && ['invite', 'magiclink'].includes(query.get('type') || '')) {
          const { error: verifyError } = await client.auth.verifyOtp({ token_hash: tokenHash, type: query.get('type') as 'invite' | 'magiclink' });
          if (verifyError) throw verifyError;
        } else {
          const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
          const accessToken = hash.get('access_token');
          const refreshToken = hash.get('refresh_token');
          if (!accessToken || !refreshToken) throw new Error('El enlace no es válido o ya venció. Pide que te envíen una invitación nueva.');
          const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (sessionError) throw sessionError;
        }
        if (!alive) return;
        if (!next) throw new Error('El enlace no incluye una invitación válida.');
        router.replace(next as never);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'No se pudo abrir la invitación.');
      }
    };
    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener('url', event => void handle(event.url));
    return () => { alive = false; subscription.remove(); };
  }, [router]);

  return <SafeAreaView style={[styles.page, { backgroundColor: palette.background }]}>
    <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
      {error ? <>
        <Text style={[styles.title, { color: palette.text }]}>No se pudo abrir la invitación</Text>
        <Text accessibilityRole="alert" style={[styles.copy, { color: palette.textSecondary }]}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={styles.buttonText}>Ir al inicio</Text></Pressable>
      </> : <>
        <ActivityIndicator color={palette.primary} />
        <Text style={[styles.title, { color: palette.text }]}>Verificando invitación</Text>
        <Text style={[styles.copy, { color: palette.textSecondary }]}>Estamos preparando el acceso seguro a la clínica.</Text>
      </>}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 500, alignSelf: 'center', borderWidth: 1, borderRadius: 18, padding: 24, gap: 14, alignItems: 'flex-start' },
  title: { fontSize: 24, lineHeight: 31, fontWeight: '700' },
  copy: { fontSize: 14, lineHeight: 21 },
  button: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, alignSelf: 'stretch' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
