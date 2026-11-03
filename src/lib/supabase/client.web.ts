import Constants from 'expo-constants';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

let webClient: SupabaseClient<any> | null | undefined;

export function createClient() {
  if (webClient !== undefined) return webClient;
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.supabaseUrl || '').trim();
  const publishableKey = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || Constants.expoConfig?.extra?.supabasePublishableKey || '').trim();
  if (!url && !publishableKey) return (webClient = null);
  if (!url || !publishableKey) throw new Error('Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  webClient = createSupabaseClient<any>(url, publishableKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
  return webClient;
}
