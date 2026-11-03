import { useMemo } from 'react';
import { useRouter as useExpoRouter } from 'expo-router';
import { Platform } from 'react-native';

function releaseWebFocus() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) activeElement.blur();
}

export function useCrmRouter() {
  const router = useExpoRouter();
  return useMemo(() => {
    const beforeNavigate = <TArgs extends unknown[]>(navigate: (...args: TArgs) => void) => (...args: TArgs) => {
      releaseWebFocus();
      navigate(...args);
    };
    return {
      ...router,
      back: beforeNavigate(router.back),
      dismiss: beforeNavigate(router.dismiss),
      dismissAll: beforeNavigate(router.dismissAll),
      dismissTo: beforeNavigate(router.dismissTo),
      navigate: beforeNavigate(router.navigate),
      push: beforeNavigate(router.push),
      replace: beforeNavigate(router.replace),
    };
  }, [router]);
}
