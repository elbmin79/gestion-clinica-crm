import { useEffect } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { nativeBuildVersion } from 'expo-application';
import { mobileApiBaseUrl } from './clinic-access-api';

const CHECK_INTERVAL = 15 * 60 * 1000;

async function fetchReleaseBuild(base: string, platform: 'android' | 'ios') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${base}/api/mobile/release`, { signal: controller.signal });
    if (!response.ok) return null;
    const build = (await response.json())?.[platform];
    return Number.isSafeInteger(build) ? Number(build) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function useReleaseUpdates(ready: boolean) {
  useEffect(() => {
    if (!ready || __DEV__ || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return;
    const platform = Platform.OS;

    const base = mobileApiBaseUrl();
    let active = true;
    let checking = false;
    let updateReady = false;
    let promptOpen = false;
    let lastCheck = -Infinity;

    function notify(title: string, message: string, action: string, apply: () => Promise<unknown>) {
      if (!active || promptOpen || AppState.currentState !== 'active') return;
      promptOpen = true;
      Alert.alert(title, message, [
        { text: 'Más tarde', style: 'cancel', onPress: () => { promptOpen = false; } },
        { text: action, onPress: () => {
          promptOpen = false;
          void apply().catch(() => {
            Alert.alert('No se pudo aplicar la actualización', 'Inténtalo de nuevo más tarde.');
          });
        } },
      ], { cancelable: true, onDismiss: () => { promptOpen = false; } });
    }

    async function check() {
      if (checking || Date.now() - lastCheck < CHECK_INTERVAL) return;
      checking = true;
      lastCheck = Date.now();
      try {
        const current = Number(nativeBuildVersion);
        if (Number.isSafeInteger(current) && current > 0) {
          const latest = await fetchReleaseBuild(base, platform);
          if (!active) return;
          if (latest !== null && latest > current) {
            notify('Nueva versión de Elixir Clinic', 'Hay una nueva versión disponible para instalar.', 'Actualizar app',
              () => Linking.openURL(`${base}/app-download`));
            return;
          }
        }

        const Updates = await import('expo-updates');
        if (!active || !Updates.isEnabled) return;
        if (!updateReady) {
          const result = await Updates.checkForUpdateAsync();
          if (!active || (!result.isAvailable && !result.isRollBackToEmbedded)) return;
          const update = await Updates.fetchUpdateAsync();
          updateReady = update.isNew || update.isRollBackToEmbedded;
        }
        if (updateReady) {
          notify('Actualización disponible', 'La actualización está lista. Termina de guardar tus cambios antes de reiniciar.', 'Reiniciar ahora',
            () => Updates.reloadAsync());
        }
      } catch {
        // Keep the installed app available when update services cannot be reached.
      } finally {
        checking = false;
        if (AppState.currentState !== 'active') lastCheck = -Infinity;
      }
    }

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
    });
    if (AppState.currentState === 'active') void check();
    return () => {
      active = false;
      subscription.remove();
    };
  }, [ready]);
}
