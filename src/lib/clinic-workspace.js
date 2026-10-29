function branchNameFor(item) {
  return item.branch || item.branchName || '';
}

function branchFor(item, branches) {
  return branches.find(branch => branch.id === item.branchId)
    || branches.find(branch => branch.name === branchNameFor(item));
}

export function buildWorkspaceGroups(businesses, branches) {
  return businesses
    .filter(business => business.active !== false)
    .map(business => ({
      ...business,
      branches: branches
        .filter(branch => branch.active !== false && branch.businessId === business.id)
        .sort((left, right) => left.name.localeCompare(right.name, 'es-MX')),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es-MX'));
}

export function buildClinicGroups(businesses, branches) {
  return buildWorkspaceGroups(businesses, branches)
    .filter(business => business.name.trim().toLocaleLowerCase('es-MX') !== 'elixir clinic');
}

export function normalizeWorkspaceSelection(selection, businesses, branches) {
  const business = businesses.find(item => item.id === selection?.businessId && item.active !== false);
  if (!business) return { businessId: '', branchId: '' };

  const branch = branches.find(item => item.id === selection?.branchId && item.active !== false && item.businessId === business.id);
  return { businessId: business.id, branchId: branch?.id || '' };
}

export function filterByWorkspace(items, selection, branches) {
  const { businessId, branchId } = selection || {};
  if (!businessId) return items;

  return items.filter(item => {
    if (Array.isArray(item.branchIds)) {
      // The agenda treats providers without branch assignments as clinic-wide.
      if (!item.branchIds.length) return true;
      if (branchId) return item.branchIds.includes(branchId);
      return item.branchIds.some(id => branches.some(branch => branch.id === id && branch.businessId === businessId));
    }
    const branch = branchFor(item, branches);
    if (branchId) return item.id === branchId || branch?.id === branchId;
    return item.businessId === businessId || branch?.businessId === businessId;
  });
}
