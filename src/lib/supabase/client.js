import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from './config.js';

let browserClient;

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  browserClient ??= createBrowserClient(config.url, config.publishableKey);
  return browserClient;
}
