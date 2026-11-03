import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { AppState } from 'react-native';

const CHUNK_SIZE = 1800;
const MAX_CHUNKS = 12;

function createSecureStorage() {
  return {
    async getItem(key: string) {
      const manifest = await SecureStore.getItemAsync(`${key}.manifest`);
      if (!manifest) return SecureStore.getItemAsync(key);
      const count = Number(manifest);
      if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null;
      const parts = await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${key}.chunk.${index}`)));
      if (parts.some(part => part === null)) return null;
      return parts.join('');
    },
    async setItem(key: string, value: string) {
      const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) || [''];
      if (chunks.length > MAX_CHUNKS) throw new Error('La sesión excede el espacio seguro disponible en este dispositivo.');
      const prior = Number(await SecureStore.getItemAsync(`${key}.manifest`) || 0);
      await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(`${key}.chunk.${index}`, chunk)));
      await SecureStore.setItemAsync(`${key}.manifest`, String(chunks.length));
      await SecureStore.deleteItemAsync(key);
      await Promise.all(Array.from({ length: Math.max(0, prior - chunks.length) }, (_, offset) => SecureStore.deleteItemAsync(`${key}.chunk.${chunks.length + offset}`)));
    },
    async removeItem(key: string) {
      const count = Number(await SecureStore.getItemAsync(`${key}.manifest`) || 0);
      await Promise.all([
        SecureStore.deleteItemAsync(key),
        SecureStore.deleteItemAsync(`${key}.manifest`),
        ...Array.from({ length: Math.min(MAX_CHUNKS, count) }, (_, index) => SecureStore.deleteItemAsync(`${key}.chunk.${index}`)),
      ]);
    },
  };
}

let nativeClient: SupabaseClient<any> | null | undefined;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

export function createClient() {
  if (nativeClient !== undefined) return nativeClient;
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.supabaseUrl || '').trim();
  const publishableKey = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || Constants.expoConfig?.extra?.supabasePublishableKey || '').trim();
  if (!url && !publishableKey) return (nativeClient = null);
  if (!url || !publishableKey) throw new Error('Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  nativeClient = createSupabaseClient<any>(url, publishableKey, {
    auth: {
      storage: createSecureStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') nativeClient?.auth.startAutoRefresh();
      else nativeClient?.auth.stopAutoRefresh();
    });
    if (AppState.currentState !== 'active') nativeClient.auth.stopAutoRefresh();
  }
  return nativeClient;
}
