export type TemplateKey =
  | 'fasum'
  | 'satker'
  | 'sumbangan'
  | 'ckg'
  | 'ckg_daftar_hadir'
  | 'rehab';

export type ReportKey = 'fasum' | 'satker' | 'sumbangan' | 'ckg' | 'rehab';

export interface RehabTableTemplate {
  tblOpen: string;
  header: string;
  firstRow: string;
  middleRow: string;
  lastRow: string;
  konselorParagraph: string;
  tblClose: string;
  catatan?: string;
}

export interface TemplatesBundle {
  versi: number;
  template: Record<TemplateKey, string>; // base64-encoded .docx
  rehab_tabel_peserta: RehabTableTemplate;
}

export interface TemplateLoadState {
  bundle: TemplatesBundle | null;
  source: 'embedded_json' | 'indexeddb' | 'incomplete';
  errorMessage?: string;
  presentKeys: TemplateKey[];
  hasRehabTable: boolean;
}

export interface DetectedPhotoSlot {
  name: string; // e.g., "FOTO_1" | "KOLASE"
  index: number; // 1..N (or 0 for KOLASE)
  cx: number;
  cy: number;
  aspectRatio: number; // cx / cy
  rId: string;
  targetPath: string; // e.g., "word/media/image4.jpeg"
}

export interface TemplateInspection {
  variables: string[]; // normalized variable names without {{}} or @
  photoSlots: DetectedPhotoSlot[];
  hasKolase: boolean;
}

export interface SlotPhotoFile {
  id: string;
  file: File;
  previewUrl: string;
}

export interface FasumFormState {
  tanggal: string;
  lokasi: string;
  objek: string;
  daftar_petugas: string;
}

export interface SatkerFormState {
  tanggal: string;
  lokasi: string;
  daftar_petugas: string;
}

export interface SumbanganFormState {
  tanggal: string;
  jumlah_paket: string;
  daftar_petugas: string;
}

export interface CkgFormState {
  tanggal: string;
  jumlah_peserta: string;
  nama_perawat: string;
}

export interface RehabFormState {
  tanggal: string;
  jumlah_ringan: string;
  jumlah_sedang: string;
  peserta_text: string;
  konselor_text: string;
}

export interface KolaseState {
  mode: 'auto' | 'ready';
  photos: (SlotPhotoFile | null)[]; // 4 slots for auto 2x2
  readyFile: SlotPhotoFile | null; // 1 file for "Unggah kolase jadi"
  customWatermarkFile: SlotPhotoFile | null;
  previewUrl: string | null;
}

export interface ReportFormsMap {
  fasum: FasumFormState;
  satker: SatkerFormState;
  sumbangan: SumbanganFormState;
  ckg: CkgFormState;
  rehab: RehabFormState;
}

export interface GeneratedDocFile {
  fileName: string;
  blob: Blob;
  label: string;
}
