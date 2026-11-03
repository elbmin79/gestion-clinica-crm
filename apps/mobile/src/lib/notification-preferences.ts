export type NotificationPreferences = {
  new_appointment: boolean;
  agenda_change: boolean;
  include_self: boolean;
  push_enabled: boolean;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  new_appointment: true,
  agenda_change: true,
  include_self: false,
  push_enabled: true,
};

export function notificationPreferencesForRole(role: string): NotificationPreferences {
  if (role === 'billing') return { ...defaultNotificationPreferences, new_appointment: false, agenda_change: false };
  return { ...defaultNotificationPreferences };
}

export function normalizeNotificationPreferences(role: string, stored: Partial<NotificationPreferences> | null): NotificationPreferences {
  return { ...notificationPreferencesForRole(role), ...(stored || {}) };
}
