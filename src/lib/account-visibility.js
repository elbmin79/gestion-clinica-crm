// Internal accounts retain authentication and audit attribution, but are omitted
// from shared staff directories. Match the stable ID even if the email changes.
const internalAccounts = [{
  userId: '2bb8b5a1-b652-4db7-8070-8e0a5ee7897e',
  email: 'admin@mkzsolutions.com.mx',
  hiddenFromDirectory: true,
}];

export const hiddenDirectoryUserIds = internalAccounts.filter(account => account.hiddenFromDirectory).map(account => account.userId);

export function isHiddenDirectoryAccount(account) {
  if (!account) return false;
  const email = typeof account.email === 'string' ? account.email.trim().toLowerCase() : '';
  const userId = account.id || account.userId || account.user_id;
  return internalAccounts.some(internal => internal.hiddenFromDirectory &&
    (internal.userId === userId || internal.email === email));
}

// Preserve unlinked professionals (NULL user_id) while omitting internal users.
export const visibleProviderFilter = `user_id.is.null,user_id.not.in.(${hiddenDirectoryUserIds.join(',')})`;
