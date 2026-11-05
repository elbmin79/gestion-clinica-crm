export function defaultAgendaProvider(
  linkedProviderId: string | undefined,
  appointments: readonly { providerId: string }[],
): string {
  return linkedProviderId && appointments.some(item => item.providerId === linkedProviderId)
    ? linkedProviderId
    : '';
}
