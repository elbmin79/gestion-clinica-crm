import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCrmRouter } from '@/lib/use-crm-router';

import { Colors } from '@/constants/theme';
import { createClient } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useCrmRouter();
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Abriendo el enlace…');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const acceptUrl = async (url: string | null) => {
      if (!url) return;
      const client = createClient();
      if (!client) { if (alive) setError('La conexión de la clínica no está configurada.'); return; }
      try {
        const parsed = new URL(url);
        const query = new URLSearchParams(parsed.search);
        const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
        const code = query.get('code');
        if (code) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          const accessToken = hash.get('access_token');
          const refreshToken = hash.get('refresh_token');
          if (!accessToken || !refreshToken) throw new Error('El enlace no es válido o ya venció. Solicita uno nuevo.');
          const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (sessionError) throw sessionError;
        }
        if (alive) { setReady(true); setMessage('Elige una contraseña nueva para tu cuenta.'); }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'El enlace no es válido o ya venció.');
      }
    };
    void Linking.getInitialURL().then(acceptUrl);
    const subscription = Linking.addEventListener('url', event => void acceptUrl(event.url));
    return () => { alive = false; subscription.remove(); };
  }, []);

  const submit = async () => {
    if (password.length < 8) { setError('Usa al menos 8 caracteres.'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true); setError('');
    try {
      const client = createClient();
      if (!client) throw new Error('La conexión de la clínica no está configurada.');
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
      setReady(false);
      await client.auth.signOut();
      setTimeout(() => router.replace('/'), 1200);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la contraseña.'); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: palette.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: palette.text }]}>Nueva contraseña</Text>
        <Text style={[styles.copy, { color: palette.textSecondary }]}>{message}</Text>
        {ready && <>
          <Text style={[styles.label, { color: palette.text }]}>Contraseña nueva</Text>
          <TextInput accessibilityLabel="Contraseña nueva" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="Mínimo 8 caracteres" placeholderTextColor={palette.textSecondary} style={[styles.input, { color: palette.text, backgroundColor: palette.backgroundElement, borderColor: palette.line }]} />
          <Text style={[styles.label, { color: palette.text }]}>Confirmar contraseña</Text>
          <TextInput accessibilityLabel="Confirmar contraseña" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="Repite la contraseña" placeholderTextColor={palette.textSecondary} style={[styles.input, { color: palette.text, backgroundColor: palette.backgroundElement, borderColor: palette.line }]} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={({ pressed }) => [styles.button, { backgroundColor: palette.primary, opacity: busy ? 0.6 : pressed ? 0.8 : 1 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar contraseña</Text>}</Pressable>
        </>}
        {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
        {!ready && <Pressable onPress={() => router.replace('/')}><Text style={[styles.back, { color: palette.primary }]}>Volver al inicio</Text></Pressable>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 26, paddingTop: 48 },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '700' }, copy: { fontSize: 16, lineHeight: 23, marginTop: 9, marginBottom: 27 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 14 }, input: { minHeight: 54, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, fontSize: 16 },
  button: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { fontSize: 14, lineHeight: 20, marginTop: 16 }, back: { minHeight: 46, paddingTop: 17, fontSize: 15, fontWeight: '700' },
});
