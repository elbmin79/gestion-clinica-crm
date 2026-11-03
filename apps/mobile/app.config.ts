import * as nextEnv from '@next/env';
import type { ConfigContext, ExpoConfig } from 'expo/config';

// Local development reuses the clinic-owned, browser-safe Supabase values from
// the repository's ignored .env.local. EAS builds use EXPO_PUBLIC_* variables.
const repositoryRoot = process.cwd().replace(/[\\/]+apps[\\/]+mobile[\\/]?$/i, '');
nextEnv.loadEnvConfig(repositoryRoot || process.cwd());
process.env.EXPO_PUBLIC_SUPABASE_URL ||= process.env.NEXT_PUBLIC_SUPABASE_URL || '';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

export default ({ config }: ConfigContext): ExpoConfig => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || config.extra?.supabaseUrl || '';
  const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || config.extra?.supabasePublishableKey || '';
  const crmApiUrl = process.env.EXPO_PUBLIC_CRM_API_URL || process.env.NEXT_PUBLIC_CRM_API_URL || config.extra?.crmApiUrl || '';

  if (process.env.CRM_NATIVE_BUILD === '1') {
    const missing = [
      !supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
      !supabasePublishableKey && 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      !crmApiUrl && 'EXPO_PUBLIC_CRM_API_URL',
    ].filter(Boolean);
    if (missing.length) throw new Error(`Configura estas variables para la compilación nativa: ${missing.join(', ')}.`);
  }

  return {
    ...config,
    name: config.name || 'Elixir Clinic',
    slug: config.slug || 'elixir-clinic',
    version: config.version || '1.0.0',
    extra: {
      ...config.extra,
      supabaseUrl,
      supabasePublishableKey,
      crmApiUrl,
    },
  };
};
