import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { ClinicWorkspaceProvider } from '@/providers/clinic-workspace-provider';
import { CrmThemeProvider, useCrmTheme } from '@/providers/crm-theme-provider';
import { nativeNotificationRoute } from '@/lib/native-push';
import { useReleaseUpdates } from '@/lib/release-updates';

void SplashScreen.preventAutoHideAsync();
if (Platform.OS === 'ios' || Platform.OS === 'android') Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

function Navigation() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    'Nunito-Regular': require('../../assets/fonts/Nunito-Regular.ttf'),
    'Nunito-Medium': require('../../assets/fonts/Nunito-Medium.ttf'),
    'Nunito-SemiBold': require('../../assets/fonts/Nunito-SemiBold.ttf'),
    'Nunito-Bold': require('../../assets/fonts/Nunito-Bold.ttf'),
    'Nunito-ExtraBold': require('../../assets/fonts/Nunito-ExtraBold.ttf'),
  });
  const { loading } = useAuth();
  const { theme, palette, ready: themeReady } = useCrmTheme();
  useReleaseUpdates(!loading && themeReady && fontsLoaded);
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    let handled = '';
    const openResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.notification.request.identifier === handled) return;
      handled = response.notification.request.identifier;
      const route = nativeNotificationRoute(response.notification.request.content.data?.route);
      if (route) router.push(route as never);
      void Notifications.clearLastNotificationResponseAsync();
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    void Notifications.getLastNotificationResponseAsync().then(openResponse);
    return () => subscription.remove();
  }, [router]);
  useEffect(() => {
    if (!loading && themeReady && fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded, loading, themeReady]);
  if (loading || !themeReady || !fontsLoaded) return null;
  const baseTheme = theme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: { ...baseTheme.colors, background: palette.background, card: palette.background },
  };
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="forgot-password" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reset-password" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth/callback" options={{ presentation: 'card' }} />
        <Stack.Screen name="accept-invite" options={{ presentation: 'modal' }} />
        <Stack.Screen name="appointment/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="appointment/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="patients/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="patients/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="payments" options={{ presentation: 'card' }} />
        <Stack.Screen name="google-calendar" options={{ presentation: 'card' }} />
        <Stack.Screen name="whatsapp-settings" options={{ presentation: 'card' }} />
        <Stack.Screen name="whatsapp/[conversationId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="notification-settings" options={{ presentation: 'card' }} />
        <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
        <Stack.Screen name="reminders" options={{ presentation: 'card' }} />
        <Stack.Screen name="team" options={{ presentation: 'card' }} />
        <Stack.Screen name="profile" options={{
          presentation: 'card',
          animation: Platform.OS === 'android' ? 'ios_from_right' : 'slide_from_right',
        }} />
        <Stack.Screen name="public-agenda" options={{ presentation: 'card' }} />
        <Stack.Screen name="reservar/[slug]" options={{ presentation: 'card' }} />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <CrmThemeProvider>
        <AuthProvider>
          <ClinicWorkspaceProvider>
            <Navigation />
          </ClinicWorkspaceProvider>
        </AuthProvider>
      </CrmThemeProvider>
    </SafeAreaProvider>
  );
}
