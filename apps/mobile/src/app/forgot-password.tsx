import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCrmRouter } from '@/lib/use-crm-router';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

export default function ForgotPasswordScreen() {
  const router = useCrmRouter();
  const { sendRecovery } = useAuth();
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try { await sendRecovery(email); setSent(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo enviar el enlace. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: palette.background }]}>
      <View style={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹  Volver</Text></Pressable>
        <Text style={[styles.title, { color: palette.text }]}>Restablecer contraseña</Text>
        <Text style={[styles.copy, { color: palette.textSecondary }]}>Te enviaremos un enlace para elegir una contraseña nueva.</Text>
        {sent ? <Text accessibilityRole="alert" style={[styles.notice, { color: palette.primary }]}>Si el correo está registrado, recibirás un enlace para continuar.</Text> : <>
          <Text style={[styles.label, { color: palette.text }]}>Correo electrónico</Text>
          <TextInput accessibilityLabel="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="nombre@clinica.com" placeholderTextColor={palette.textSecondary} style={[styles.input, { color: palette.text, backgroundColor: palette.backgroundElement, borderColor: palette.line }]} />
          {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
          <Pressable accessibilityRole="button" disabled={busy || !email.trim()} onPress={() => void submit()} style={({ pressed }) => [styles.button, { backgroundColor: palette.primary, opacity: busy || !email.trim() ? 0.55 : pressed ? 0.8 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar enlace</Text>}
          </Pressable>
        </>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 26, paddingTop: 12 },
  back: { minHeight: 48, justifyContent: 'center', marginBottom: 30 }, backText: { fontSize: 16, fontWeight: '700' },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '700', letterSpacing: -0.5 }, copy: { fontSize: 16, lineHeight: 23, marginTop: 9, marginBottom: 27 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8 }, input: { minHeight: 54, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, fontSize: 16 },
  button: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { fontSize: 14, marginTop: 10 }, notice: { fontSize: 15, lineHeight: 23, marginTop: 22 },
});
