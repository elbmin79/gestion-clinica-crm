const DB_NAME = 'medical-crm-private-files';
const STORE_NAME = 'files';
export const MAX_RECORD_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export function validatePatientRecordFile(file) {
  if (!file) return 'Selecciona un archivo.';
  if (!ALLOWED_TYPES.has(file.type)) return 'Solo se permiten archivos PDF, JPG o PNG.';
  if (file.size <= 0 || file.size > MAX_RECORD_FILE_BYTES) return 'El archivo debe pesar menos de 10 MB.';
  return '';
}

export async function validatePatientRecordFileContent(file) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const matches = file.type === 'application/pdf'
    ? String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
    : file.type === 'image/jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : file.type === 'image/png'
        ? [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte, index) => bytes[index] === byte)
        : false;
  return matches ? '' : 'El contenido no coincide con el tipo de archivo. Elige un PDF, JPG o PNG válido.';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDemoRecordFile(id, file) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(file, id);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  db.close();
}

export async function openDemoRecordFile(id) {
  const db = await openDb();
  const file = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return file || null;
}
