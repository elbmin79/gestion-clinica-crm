import { NativeTabs } from 'expo-router/native-tabs';
import { Tabs as JavaScriptTabs } from 'expo-router/js-tabs';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Image } from 'expo-image';
import { Platform, type ColorValue } from 'react-native';
import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';
import IndexScreen from '../index';

const whatsappMark = require('../../../assets/images/whatsapp-mark.png');

export default function CrmTabs() {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const canViewWhatsApp = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'whatsapp.view'));
  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <IndexScreen />;
  if (Platform.OS === 'web') return (
    <JavaScriptTabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textSecondary, tabBarLabelStyle: { fontFamily: 'Nunito-SemiBold', fontSize: 10 }, tabBarStyle: { height: 62, paddingTop: 5, paddingBottom: 7, backgroundColor: colors.backgroundElement, borderTopColor: colors.line } }}>
      <JavaScriptTabs.Screen name="index" options={{ title: 'Resumen', tabBarLabel: 'Resumen', tabBarIcon: tabIcon('square.grid.2x2', 'space_dashboard') }} />
      <JavaScriptTabs.Screen name="agenda" options={{ title: 'Agenda', tabBarLabel: 'Agenda', tabBarIcon: tabIcon('calendar', 'calendar_month') }} />
      {canViewWhatsApp ? <JavaScriptTabs.Screen name="whatsapp" options={{ title: 'WhatsApp', tabBarLabel: 'WhatsApp', tabBarIcon: ({ color, size }) => <Image contentFit="contain" source={whatsappMark} style={{ width: size, height: size, tintColor: color }} /> }} /> : null}
      <JavaScriptTabs.Screen name="patients" options={{ title: 'Pacientes', tabBarLabel: 'Pacientes', tabBarIcon: tabIcon('person.2', 'groups') }} />
      <JavaScriptTabs.Screen name="more" options={{ title: 'Más', tabBarLabel: 'Más', tabBarIcon: tabIcon('ellipsis', 'more_horiz') }} />
    </JavaScriptTabs>
  );
  return (
    <NativeTabs backgroundColor={colors.backgroundElement} iconColor={{ default: colors.textSecondary, selected: colors.primary }} indicatorColor={colors.backgroundSelected} labelStyle={{ selected: { color: colors.primary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Resumen</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md={{ default: 'space_dashboard', selected: 'space_dashboard' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="agenda">
        <NativeTabs.Trigger.Label>Agenda</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar' }} md={{ default: 'calendar_month', selected: 'calendar_month' }} />
      </NativeTabs.Trigger>
      {canViewWhatsApp ? <NativeTabs.Trigger name="whatsapp">
        <NativeTabs.Trigger.Label>WhatsApp</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={whatsappMark} renderingMode="template" />
      </NativeTabs.Trigger> : null}
      <NativeTabs.Trigger name="patients">
        <NativeTabs.Trigger.Label>Pacientes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md={{ default: 'groups', selected: 'groups' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>Más</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'ellipsis', selected: 'ellipsis' }} md={{ default: 'more_horiz', selected: 'more_horiz' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function tabIcon(ios: SFSymbol, material: AndroidSymbol) {
  return ({ color, size }: { focused: boolean; color: ColorValue; size: number }) => <SymbolView name={{ ios, android: material, web: material }} tintColor={color} size={size} />;
}
