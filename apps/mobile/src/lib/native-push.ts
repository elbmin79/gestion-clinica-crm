import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getMobileAccessToken, mobileApiBaseUrl } from '@/lib/clinic-access-api';

const tokenStorageKey = 'crm-native-expo-push-token';
type PushApiResult = { ok?: boolean; error?: string; devices?: { id: string; platform: string; created_at: string }[]; currentDeviceRegistered?: boolean; deviceCount?: number; counts?: { sent?: number; skipped?: number } };

export function isNativePushSupported() { return Platform.OS === 'ios' || Platform.OS === 'android'; }
export function hasNativePushProject() { return Boolean(Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId); }

export async function getSavedNativePushToken() {
  if (!isNativePushSupported()) return '';
  try { return await SecureStore.getItemAsync(tokenStorageKey) || ''; } catch { return ''; }
}

export async function loadNativePushStatus(clinicId: string, token = '') {
  const result = await request<PushApiResult>(clinicId, 'POST', { action: 'status', token: token || undefined });
  return { currentDeviceRegistered: result.currentDeviceRegistered === true, deviceCount: result.deviceCount || 0 };
}

export async function enableNativePush(clinicId: string) {
  if (!isNativePushSupported()) throw new Error('La entrega push nativa está disponible en iPhone y Android.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Falta vincular la app con un proyecto EAS para activar notificaciones push.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', {
    name: 'Avisos de la clínica', importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250], lightColor: '#B85D84',
  });
  const permissions = await Notifications.getPermissionsAsync();
  const finalStatus = permissions.status === 'granted' ? permissions.status : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== 'granted') throw new Error('El sistema no autorizó las notificaciones. Actívalas desde Ajustes del dispositivo.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const result = await request<PushApiResult>(clinicId, 'POST', { action: 'register', token, platform: Platform.OS });
  await SecureStore.setItemAsync(tokenStorageKey, token);
  return { token, deviceCount: result.deviceCount || 1 };
}

export async function disableNativePush(clinicId: string) {
  const token = await getSavedNativePushToken();
  if (!token) throw new Error('No se encontró el token de este dispositivo.');
  await request<PushApiResult>(clinicId, 'DELETE', { token });
  await SecureStore.deleteItemAsync(tokenStorageKey);
}

export async function sendNativePushTest(clinicId: string) {
  const token = await getSavedNativePushToken();
  if (!token) throw new Error('Activa este dispositivo primero.');
  return request<PushApiResult>(clinicId, 'POST', { action: 'test', token });
}

export async function unlinkNativePushBeforeSignOut() {
  const token = await getSavedNativePushToken();
  if (!token) return;
  try {
    await request<PushApiResult>('', 'DELETE', { action: 'unlink-all', token });
    await SecureStore.deleteItemAsync(tokenStorageKey);
  } catch {
    // Sign-out must remain available when the device is offline.
  }
}

async function request<T extends PushApiResult>(clinicId: string, method: 'POST' | 'DELETE', body: Record<string, unknown>): Promise<T> {
  const baseUrl = mobileApiBaseUrl();
  if (!baseUrl) throw new Error('Configura EXPO_PUBLIC_CRM_API_URL para conectar con el CRM.');
  const accessToken = await getMobileAccessToken();
  const url = new URL(`${baseUrl}/api/mobile/notifications`);
  if (clinicId) url.searchParams.set('clinicId', clinicId);
  const response = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store',
  });
  const result = await response.json().catch(() => ({})) as T;
  if (!response.ok) throw new Error(result.error || 'No se pudo configurar este dispositivo.');
  return result;
}

export function nativeNotificationRoute(value: unknown) {
  if (typeof value !== 'string') return '';
  if (value === '/whatsapp' || value === '/public-agenda' || value === '/(tabs)/agenda') return value;
  if (/^\/appointment\/[\da-f-]{36}$/i.test(value)) return value;
  return '';
}
