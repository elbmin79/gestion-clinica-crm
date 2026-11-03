import * as SecureStore from 'expo-secure-store';
import type { PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { Colors, type AppPalette } from '@/constants/theme';

export type CrmTheme = 'light' | 'dark';
type ThemeValue = { theme: CrmTheme; palette: AppPalette; ready: boolean; toggleTheme: () => void; setTheme: (value: CrmTheme) => void };
const ThemeContext = createContext<ThemeValue | null>(null);
const THEME_KEY = 'crm-theme-v1';

export function CrmThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<CrmTheme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const storedTheme = Platform.OS === 'web'
      ? Promise.resolve(typeof localStorage === 'undefined' ? null : localStorage.getItem(THEME_KEY))
      : SecureStore.getItemAsync(THEME_KEY);
    void storedTheme.then(value => {
      if (mounted && (value === 'light' || value === 'dark')) setThemeState(value);
    }).catch(() => {}).finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    }
  }, [ready, theme]);

  const setTheme = useCallback((value: CrmTheme) => {
    setThemeState(value);
    const save = Platform.OS === 'web'
      ? Promise.resolve().then(() => { if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, value); })
      : SecureStore.setItemAsync(THEME_KEY, value);
    void save.catch(() => {});
  }, []);
  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [setTheme, theme]);
  const value = useMemo(() => ({ theme, palette: Colors[theme], ready, toggleTheme, setTheme }), [theme, ready, toggleTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useCrmTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useCrmTheme debe usarse dentro de CrmThemeProvider.');
  return value;
}

export function useCrmColorScheme() {
  return useCrmTheme().theme;
}
