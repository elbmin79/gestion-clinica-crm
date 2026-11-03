const DEFAULT_PAGE_SIZE = 500;

export async function fetchAllPages(fetchPage, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('El tamaño de página debe ser un entero positivo.');
  const rows = [];
  let expectedCount = null;
  let offset = 0;

  while (expectedCount === null || rows.length < expectedCount) {
    const result = await fetchPage({ from: offset, to: offset + pageSize - 1, includeCount: offset === 0 });
    if (result.error) throw result.error;
    const page = result.data || [];
    if (offset === 0 && Number.isSafeInteger(result.count) && result.count >= 0) expectedCount = result.count;
    rows.push(...page);
    if (!page.length) break;
    if (expectedCount !== null && rows.length >= expectedCount) break;
    if (expectedCount === null && page.length < pageSize) break;
    offset += page.length;
  }
  return rows;
}
