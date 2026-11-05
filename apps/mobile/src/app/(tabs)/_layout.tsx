import { useReducedMotion } from 'react-native-reanimated';
import { Tabs as JavaScriptTabs } from 'expo-router/js-tabs';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Image } from 'expo-image';
import { Easing, Platform, useWindowDimensions, type ColorValue } from 'react-native';
import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';
import IndexScreen from '../index';

const whatsappMark = require('../../../assets/images/whatsapp-mark.png');

export default function CrmTabs() {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const animateTabs = Platform.OS !== 'web' && !reduceMotion;
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const canViewWhatsApp = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'whatsapp.view'));
  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <IndexScreen />;
  return (
    <JavaScriptTabs screenOptions={{
      headerShown: false,
      sceneStyle: { backgroundColor: colors.background },
      ...(animateTabs && {
        animation: 'shift',
        transitionSpec: { animation: 'timing', config: { duration: 260, easing: Easing.inOut(Easing.cubic) } },
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
            transform: [{ translateX: current.progress.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [-width, 0, width],
            }) }],
          },
        }),
      }), tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textSecondary, tabBarLabelStyle: { fontFamily: 'Nunito-SemiBold', fontSize: 10 }, tabBarStyle: { height: 62, paddingTop: 5, paddingBottom: 7, backgroundColor: colors.backgroundElement, borderTopColor: colors.line } }}>
      <JavaScriptTabs.Screen name="index" options={{ title: 'Resumen', tabBarLabel: 'Resumen', tabBarIcon: tabIcon('square.grid.2x2', 'space_dashboard') }} />
      <JavaScriptTabs.Screen name="agenda" options={{ title: 'Agenda', tabBarLabel: 'Agenda', tabBarIcon: tabIcon('calendar', 'calendar_month') }} />
      <JavaScriptTabs.Screen name="whatsapp" options={{ href: canViewWhatsApp ? undefined : null, title: 'WhatsApp', tabBarLabel: 'WhatsApp', tabBarIcon: ({ color, size }) => <Image contentFit="contain" source={whatsappMark} style={{ width: size, height: size, tintColor: color }} /> }} />
      <JavaScriptTabs.Screen name="patients" options={{ title: 'Pacientes', tabBarLabel: 'Pacientes', tabBarIcon: tabIcon('person.2', 'groups') }} />
      <JavaScriptTabs.Screen name="more" options={{ title: 'Más', tabBarLabel: 'Más', tabBarIcon: tabIcon('ellipsis', 'more_horiz') }} />
    </JavaScriptTabs>
  );

}

function tabIcon(ios: SFSymbol, material: AndroidSymbol) {
  return ({ color, size }: { focused: boolean; color: ColorValue; size: number }) => <SymbolView name={{ ios, android: material, web: material }} tintColor={color} size={size} />;
}
