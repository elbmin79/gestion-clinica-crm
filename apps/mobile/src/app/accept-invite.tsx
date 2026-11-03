import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { acceptMobileClinicInvitation, loadMobileClinicInvitation, type MobileClinicInvitation } from '@/lib/clinic-invitation-api';
import { useCrmRouter } from '@/lib/use-crm-router';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';

export default function AcceptInviteScreen() {
  const router = useCrmRouter();
  const { id: routeId } = useLocalSearchParams<{ id?: string }>();
  const id = typeof routeId === 'string' ? routeId : '';
  const { session } = useAuth();
  const { chooseClinic, memberships, refresh } = useClinicWorkspace();
  const palette = Colors[useCrmColorScheme() === 'dark' ? 'dark' : 'light'];
  const [invitation, setInvitation] = useState<MobileClinicInvitation | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [acceptedClinicId, setAcceptedClinicId] = useState('');

  useEffect(() => {
    if (!acceptedClinicId || !memberships.some(item => item.clinicId === acceptedClinicId)) return;
    void chooseClinic(acceptedClinicId).then(() => router.replace('/'));
  }, [acceptedClinicId, chooseClinic, memberships, router]);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); setError('El enlace no incluye una invitación válida.'); return; }
    if (!session) { setLoading(false); setError('Abre la invitación desde el enlace recibido por correo.'); return; }
    setLoading(true); setError('');
    try {
      const result = await loadMobileClinicInvitation(id);
      if ('accepted' in result) {
        refresh();
        setAcceptedClinicId(result.clinicId);
        return;
      }
      setInvitation(result.invitation);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo verificar la invitación.'); }
    finally { setLoading(false); }
  }, [chooseClinic, id, refresh, router, session]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!session || !invitation) return;
    if (invitation.requiresPassword) {
      if (password.length < 8) { setError('Usa al menos 8 caracteres para tu contraseña.'); return; }
      if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    }
    setBusy(true); setError('');
    try {
      const client = createClient();
      if (!client) throw new Error('La conexión de la clínica no está configurada.');
      if (invitation.requiresPassword) {
        const { error: passwordError } = await client.auth.updateUser({ password });
        if (passwordError && passwordError.code !== 'same_password') throw new Error('No se pudo guardar la contraseña. Prueba una contraseña distinta e inténtalo de nuevo.');
      }
      const result = await acceptMobileClinicInvitation(invitation.id);
      refresh();
      setAcceptedClinicId(result.clinicId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo activar el acceso.'); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={[styles.page, { backgroundColor: palette.background }]}>
    <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
      <Text style={[styles.eyebrow, { color: palette.primary }]}>ELIXIR CLINIC</Text>
      <Text style={[styles.title, { color: palette.text }]}>{invitation?.requiresPassword ? 'Crea tu contraseña' : 'Acepta tu invitación'}</Text>
      <Text style={[styles.copy, { color: palette.textSecondary }]}>{invitation?.requiresPassword ? 'Elige una contraseña para activar tu acceso a la clínica.' : 'Confirma para activar tu acceso a la clínica.'}</Text>
      {loading ? <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Verificando invitación…</Text></View> : invitation ? <>
        <View style={[styles.emailCard, { backgroundColor: palette.backgroundSelected }]}><Text style={[styles.emailLabel, { color: palette.textSecondary }]}>INVITACIÓN PARA</Text><Text style={[styles.email, { color: palette.text }]}>{invitation.email}</Text></View>
        {invitation.requiresPassword && <>
          <Text style={[styles.label, { color: palette.text }]}>Contraseña</Text>
          <TextInput accessibilityLabel="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="Mínimo 8 caracteres" placeholderTextColor={palette.textSecondary} style={[styles.input, { color: palette.text, backgroundColor: palette.background, borderColor: palette.line }]} />
          <Text style={[styles.label, { color: palette.text }]}>Confirmar contraseña</Text>
          <TextInput accessibilityLabel="Confirmar contraseña" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="Repite tu contraseña" placeholderTextColor={palette.textSecondary} style={[styles.input, { color: palette.text, backgroundColor: palette.background, borderColor: palette.line }]} />
        </>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={({ pressed }) => [styles.button, { backgroundColor: palette.primary, opacity: busy ? 0.65 : pressed ? 0.82 : 1 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{invitation.requiresPassword ? 'Crear contraseña y entrar' : 'Aceptar invitación'}</Text>}
        </Pressable>
      </> : <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={styles.buttonText}>Ir al inicio</Text></Pressable>}
      {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 520, alignSelf: 'center', borderWidth: 1, borderRadius: 20, padding: 24, gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '700', letterSpacing: -0.5 },
  copy: { fontSize: 14, lineHeight: 21 },
  emailCard: { borderRadius: 12, padding: 13, gap: 3, marginVertical: 5 },
  emailLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  email: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 },
  button: { minHeight: 52, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 6 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  error: { fontSize: 13, lineHeight: 19 },
  loading: { minHeight: 86, alignItems: 'center', justifyContent: 'center', gap: 10 },
});
