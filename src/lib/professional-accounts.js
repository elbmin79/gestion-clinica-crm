export function professionalAccountOptions(accounts, providers, providerId = '') {
  return accounts.filter(account => account.hasAccess && !providers.some(provider => provider.id !== providerId && provider.userId === account.userId));
}

export function matchingUnlinkedProfessional(account, providers) {
  const normalize = name => (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
  return account && providers.find(provider => !provider.userId && normalize(provider.name) === normalize(account.name));
}

export function validateProfessional(input, branches) {
  if (!input.name?.trim() || input.name.trim().length > 160) return 'Escribe un nombre de hasta 160 caracteres.';
  if ((input.role || '').trim().length > 160) return 'El cargo o especialidad debe tener hasta 160 caracteres.';
  if (!input.branchIds?.length) return 'Selecciona al menos una sucursal de atención.';
  if (input.branchIds.some(id => !branches.some(branch => branch.id === id && branch.active !== false))) return 'Revisa las sucursales seleccionadas.';
  return '';
}
