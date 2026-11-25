const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';

export function fillDocumentPlaceholders(content, patient = {}) {
  const text = String(content || '');
  if (!text.includes('{{')) return text;
  const today = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const values = {
    paciente: patient.name || '',
    domicilio: patient.address || '',
    telefono: patient.phone || '',
    correo: patient.email || '',
    fecha: today,
    tratamiento: patient.treatment || patient.service || '',
  };
  return text.replace(/\{\{\s*(paciente|domicilio|telefono|correo|fecha|tratamiento)\s*\}\}/gi, (_, key) => values[key.toLowerCase()] || '');
}

export function suggestConsentTemplate(serviceName, templates = []) {
  const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const service = normalize(String(serviceName || '').split('+')[0]);
  if (service.length < 4) return null;
  const titled = templates.filter(template => template.kind !== 'contract' && template.content?.trim());
  return titled.find(template => {
    const title = normalize(template.title).replace(/^consentimiento informado( para)?\s+/, '').replace(/^consentimiento\s+/, '');
    return title && (service.includes(title) || title.includes(service));
  }) || null;
}

export function htmlConsentToTemplate(html) {
  const withBreaks = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|h4|li|div|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const decoded = withBreaks
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
  return decoded
    .replace(/Bersha(?:\s+Bersha){1,3}/gi, '{{paciente}}')
    .replace(/\bbersha\b/gi, '{{domicilio}}')
    .replace(/6862887006/g, '{{telefono}}')
    .replace(new RegExp(`\\d{1,2} de (?:${MONTHS}) de \\d{4}(?:,\\s*\\d{1,2}:\\d{2}\\s*[ap]\\.m\\.)?`, 'gi'), '{{fecha}}')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function consentTitleFromFilename(filename) {
  const base = filename.replace(/\.html?$/i, '').replace(/^\d+\s*-\s*/, '').trim();
  if (/^contrato$/i.test(base)) return 'Contrato de prestación de servicios';
  return base;
}
