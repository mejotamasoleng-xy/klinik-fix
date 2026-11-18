import {
  RehabTableTemplate,
  TemplateKey,
  TemplateLoadState,
  TemplatesBundle,
} from './types';

export const ALL_TEMPLATE_KEYS: TemplateKey[] = [
  'fasum',
  'satker',
  'sumbangan',
  'ckg',
  'ckg_daftar_hadir',
  'rehab',
];

export const TEMPLATE_LABELS: Record<
  TemplateKey,
  { title: string; fileHint: string }
> = {
  fasum: {
    title: 'Baksos Fasum',
    fileHint: 'TEMPLATE_baksos_fasum.docx',
  },
  satker: {
    title: 'Baksos Satker',
    fileHint: 'TEMPLATE_baksos_satker.docx',
  },
  sumbangan: {
    title: 'Baksos Sumbangan',
    fileHint: 'TEMPLATE_baksos_sumbangan.docx',
  },
  ckg: {
    title: 'Laporan CKG',
    fileHint: 'TEMPLATE_ckg.docx',
  },
  ckg_daftar_hadir: {
    title: 'Daftar Hadir CKG',
    fileHint: 'TEMPLATE_ckg_daftar_hadir.docx',
  },
  rehab: {
    title: 'Rehabilitasi',
    fileHint: 'TEMPLATE_rehabilitasi.docx',
  },
};

export function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.includes(',') ? base64.split(',').pop() || '' : base64;
  const binary = atob(cleaned.trim());
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

export async function isValidDocxBytes(bytes: Uint8Array): Promise<boolean> {
  try {
    const { default: PizZip } = await import('pizzip');
    const zip = new PizZip(bytes);
    return Boolean(zip.file('word/document.xml'));
  } catch {
    return false;
  }
}

export function isValidRehabTableTemplate(obj: unknown): obj is RehabTableTemplate {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Record<string, unknown>;
  const required = [
    'tblOpen',
    'header',
    'firstRow',
    'middleRow',
    'lastRow',
    'konselorParagraph',
    'tblClose',
  ];
  return required.every(
    (k) => typeof candidate[k] === 'string' && String(candidate[k]).length > 0
  );
}

async function isValidTemplatesBundle(data: unknown): Promise<boolean> {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Record<string, unknown>;
  if (!candidate.template || typeof candidate.template !== 'object') return false;
  const tplMap = candidate.template as Record<string, unknown>;

  for (const key of ALL_TEMPLATE_KEYS) {
    const b64 = tplMap[key];
    if (typeof b64 !== 'string' || b64.length < 100) return false;
    try {
      const bytes = base64ToUint8Array(b64);
      if (!(await isValidDocxBytes(bytes))) return false;
    } catch {
      return false;
    }
  }

  return isValidRehabTableTemplate(candidate.rehab_tabel_peserta);
}

// ==========================================
// IndexedDB Storage (Fallback Manual Upload)
// ==========================================
const DB_NAME = 'klinik_dompu_laporan_templates_db';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

function openTemplateDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Gagal membuka IndexedDB'));
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openTemplateDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openTemplateDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Gagal menyimpan ke IndexedDB'));
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openTemplateDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Gagal menghapus dari IndexedDB'));
  });
}

export async function saveFallbackDocx(key: TemplateKey, file: File): Promise<void> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!(await isValidDocxBytes(bytes))) {
    throw new Error(
      `File "${file.name}" bukan dokumen Word (.docx) yang valid atau tidak memiliki word/document.xml.`
    );
  }
  const b64 = arrayBufferToBase64(buf);
  await idbSet(`tpl_${key}`, b64);
}

export async function saveFallbackRehabTableJson(file: File): Promise<void> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`File "${file.name}" bukan format JSON yang valid.`);
  }

  // Mendukung langsung objek rehab_tabel_peserta atau file JSON yang membungkus kunci rehab_tabel_peserta
  const target =
    parsed &&
    typeof parsed === 'object' &&
    'rehab_tabel_peserta' in (parsed as Record<string, unknown>)
      ? (parsed as Record<string, unknown>).rehab_tabel_peserta
      : parsed;

  if (!isValidRehabTableTemplate(target)) {
    throw new Error(
      'Struktur rehab_tabel_peserta.json tidak lengkap. Harus memuat tblOpen, header, firstRow, middleRow, lastRow, konselorParagraph, dan tblClose.'
    );
  }

  await idbSet('rehab_tabel_peserta', target);
}

export async function clearFallbackTemplates(): Promise<void> {
  for (const key of ALL_TEMPLATE_KEYS) {
    await idbDelete(`tpl_${key}`);
  }
  await idbDelete('rehab_tabel_peserta');
}

export async function readFallbackState(): Promise<TemplateLoadState> {
  const presentKeys: TemplateKey[] = [];
  const tplRecord: Partial<Record<TemplateKey, string>> = {};

  for (const key of ALL_TEMPLATE_KEYS) {
    const b64 = await idbGet<string>(`tpl_${key}`);
    if (typeof b64 === 'string' && b64.length > 0) {
      try {
        if (await isValidDocxBytes(base64ToUint8Array(b64))) {
          tplRecord[key] = b64;
          presentKeys.push(key);
        }
      } catch {
        // Lewati entri rusak
      }
    }
  }

  const rehabTable = await idbGet<RehabTableTemplate>('rehab_tabel_peserta');
  const hasRehabTable = isValidRehabTableTemplate(rehabTable);

  if (presentKeys.length === ALL_TEMPLATE_KEYS.length && hasRehabTable && rehabTable) {
    return {
      bundle: {
        versi: 1,
        template: tplRecord as Record<TemplateKey, string>,
        rehab_tabel_peserta: rehabTable,
      },
      source: 'indexeddb',
      presentKeys,
      hasRehabTable: true,
    };
  }

  return {
    bundle: null,
    source: 'incomplete',
    presentKeys,
    hasRehabTable,
  };
}

/**
 * Mencoba memuat /templates.json terlebih dahulu.
 * Jika tidak ditemukan atau rusak, otomatis beralih ke fallback IndexedDB.
 */
export async function loadTemplatesBundle(): Promise<TemplateLoadState> {
  try {
    const res = await fetch('/templates.json', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!(await isValidTemplatesBundle(json))) {
      throw new Error('Struktur /templates.json rusak atau tidak lengkap.');
    }
    return {
      bundle: json as TemplatesBundle,
      source: 'embedded_json',
      presentKeys: [...ALL_TEMPLATE_KEYS],
      hasRehabTable: true,
    };
  } catch (err) {
    const fallback = await readFallbackState();
    const reason =
      err instanceof Error ? err.message : 'templates.json tidak dapat dibaca';
    return {
      ...fallback,
      errorMessage:
        fallback.bundle === null
          ? `File bawaan /templates.json tidak tersedia atau rusak (${reason}). Silakan unggah template manual di halaman Template.`
          : `Menggunakan template cadangan di IndexedDB (templates.json: ${reason}).`,
    };
  }
}
