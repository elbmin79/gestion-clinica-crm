import { ThemeToggle } from '@/components/theme-toggle';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';

import { useCrmTheme } from '@/providers/crm-theme-provider';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCrmRouter } from '@/lib/use-crm-router';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';

const brandLogos = {
  light: require('../../../../public/elixirclinic-logo.png'),
  dark: require('../../../../public/elixirclinic-logo-dark.png'),
};

function Brand({ dark }: { dark: boolean }) {
  return <Image source={dark ? brandLogos.dark : brandLogos.light} contentFit="contain"
    accessibilityLabel="Elixir Clinic" accessible style={styles.brandLogo} />;
}

export default function IndexScreen() {
  const { theme: scheme, palette, toggleTheme } = useCrmTheme();
  const router = useCrmRouter();
  const { session, loading: authLoading, configured, signIn, signOut } = useAuth();
  const { memberships, clinic, loading: workspaceLoading, error: workspaceError, chooseClinic, refresh } = useClinicWorkspace();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (authLoading || (session && workspaceLoading)) {
    return <View style={[styles.centered, { backgroundColor: palette.background }]}><ActivityIndicator color={palette.primary} size="large" /></View>;
  }
  if (session && clinic) return <Redirect href="/(tabs)" />;

  if (session && memberships.length > 1) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: palette.background }]}>
        <ScrollView contentContainerStyle={styles.selectPage}>
          <Brand dark={scheme === 'dark'} />
          <Text style={[styles.heading, { color: palette.text }]}>Elige tu clínica</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>Selecciona el espacio al que quieres entrar.</Text>
          <View style={styles.membershipList}>
            {memberships.map(item => (
              <Pressable key={item.clinicId} accessibilityRole="button" onPress={() => void chooseClinic(item.clinicId)} style={({ pressed }) => [styles.membership, { backgroundColor: palette.backgroundElement, borderColor: palette.line, opacity: pressed ? 0.75 : 1 }]}>
                <View style={[styles.clinicDot, { backgroundColor: palette.primary }]} />
                <View style={styles.membershipCopy}><Text style={[styles.membershipTitle, { color: palette.text }]}>{item.name}</Text><Text style={[styles.membershipRole, { color: palette.textSecondary }]}>{item.role}</Text></View>
                <Text style={[styles.chevron, { color: palette.textSecondary }]}>›</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={() => void signOut()}><Text style={[styles.textButton, { color: palette.primary }]}>Cerrar sesión</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (session) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: palette.background }]}>
        <View style={styles.selectPage}>
          <Brand dark={scheme === 'dark'} />
          <Text style={[styles.heading, { color: palette.text }]}>No hay una clínica asignada</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>{workspaceError || 'Pide a una persona administradora que te invite al equipo de la clínica.'}</Text>
          {!!workspaceError && <Pressable onPress={refresh}><Text style={[styles.textButton, { color: palette.primary }]}>Intentar de nuevo</Text></Pressable>}
          <Pressable onPress={() => void signOut()}><Text style={[styles.textButton, { color: palette.primary }]}>Cerrar sesión</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const submit = async () => {
    setBusy(true); setError('');
    try { await signIn(email, password); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.loginPage} keyboardShouldPersistTaps="handled">
          <ThemeToggle dark={scheme === 'dark'} onPress={toggleTheme} />
          <Brand dark={scheme === 'dark'} />
          <View style={styles.loginIntro}>
            <Text style={[styles.heading, { color: palette.text }]}>Inicia sesión</Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>Ingresa tus credenciales para continuar.</Text>
          </View>
          <View style={styles.form}>
            {!configured && <View style={[styles.message, { backgroundColor: palette.primarySoft }]}><Text style={[styles.messageText, { color: palette.text }]}>Falta configurar la conexión de la clínica para esta app.</Text></View>}
            {!!error && <View accessibilityRole="alert" style={[styles.message, { backgroundColor: palette.primarySoft }]}><Text style={[styles.messageText, { color: palette.danger }]}>{error}</Text></View>}
            <Text style={[styles.label, { color: palette.text }]}>Correo electrónico</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="nombre@clinica.com" placeholderTextColor={palette.textSecondary} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" accessibilityLabel="Correo electrónico" style={[styles.input, { backgroundColor: palette.backgroundElement, borderColor: palette.line, color: palette.text }]} />
            <Text style={[styles.label, { color: palette.text }]}>Contraseña</Text>
            <TextInput value={password} onChangeText={setPassword} placeholder="Tu contraseña" placeholderTextColor={palette.textSecondary} autoCapitalize="none" autoComplete="current-password" textContentType="password" secureTextEntry returnKeyType="go" onSubmitEditing={() => void submit()} accessibilityLabel="Contraseña" style={[styles.input, { backgroundColor: palette.backgroundElement, borderColor: palette.line, color: palette.text }]} />
            <Pressable accessibilityRole="button" onPress={() => router.push('/forgot-password')} style={styles.forgot}><Text style={[styles.textButton, { color: palette.primary }]}>¿Olvidaste tu contraseña?</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={!configured || busy || !email.trim() || !password} onPress={() => void submit()} style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.primary, opacity: !configured || busy || !email.trim() || !password ? 0.55 : pressed ? 0.82 : 1 }]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Entrar a Elixir Clinic</Text>}
            </Pressable>
          </View>
          <Text style={[styles.footer, { color: palette.textSecondary }]}>Acceso seguro al espacio de trabajo de tu clínica.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginPage: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 26, paddingTop: 30, paddingBottom: 26 },
  selectPage: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 26, paddingTop: 30, gap: 18 },
  brandLogo: { width: 180, height: 150, alignSelf: 'center', marginBottom: 20 },
  loginIntro: { gap: 9, marginBottom: 31 },
  heading: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.7 },
  body: { fontSize: 16, lineHeight: 23 },
  form: { gap: 10 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 8 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, fontSize: 16 },
  forgot: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  textButton: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  primaryButton: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  footer: { marginTop: 'auto', paddingTop: 38, fontSize: 13, textAlign: 'center' },
  message: { padding: 13, borderRadius: 12 },
  messageText: { fontSize: 14, lineHeight: 20 },
  membershipList: { gap: 10, marginTop: 8, marginBottom: 12 },
  membership: { minHeight: 72, borderWidth: 1, borderRadius: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  clinicDot: { width: 10, height: 10, borderRadius: 6 },
  membershipCopy: { flex: 1, gap: 3 },
  membershipTitle: { fontSize: 16, fontWeight: '700' },
  membershipRole: { fontSize: 13, textTransform: 'capitalize' },
  chevron: { fontSize: 25 },
});
