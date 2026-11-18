/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type JenisPenyakit = 'Menular' | 'Tidak Menular';

export interface PenyakitItem {
  id: string;
  kategori: string;
  penyakit: string;
  jenis: JenisPenyakit;
  urutan?: number;
}

export interface ReferensiItem {
  id: string;
  keluhan: string;
  masuk_penyakit: string;
  catatan?: string;
  kode_icd10: string;
  nama_icd10: string;
  jenis: JenisPenyakit;
}

export interface WbpItem {
  id: string;
  no: number;
  nik: string;
  no_reg_instansi: string;
  nama: string;
  jenis_kelamin: 'Laki-laki' | 'Perempuan';
  tempat_lahir: string;
  tanggal_lahir: string; // dd/mm/yyyy
  alamat: string;
  nama_ayah?: string;
  nama_ibu?: string;
  pekerjaan?: string;
  jenis_kejahatan: string;
  kategori: 'Narapidana' | 'Tahanan' | string;
  lama_pidana?: string;
  tanggal_masuk?: string; // dd/mm/yyyy
  tgl_ekspirasi?: string; // dd/mm/yyyy
  blok: string;
  kamar: string; // Dynamic latest room (or kamar_sidb if no visits)
  kamar_sidb: string;
  lokasi_sel?: string;
  tgl_surat_penahanan?: string;
  nomor_surat_penahanan?: string;
  status_data: string;
  batch_bpjs: string; // e.g. Juli, Agustus, September, Oktober, November, Belum masuk batch, Tidak masuk batch
  status_skrining?: string;
  kendala_bpjs?: string;
  dasar_pbi?: string;
  catatan_penggabungan?: string;
  perlu_dicek?: boolean; // Flagged when missing from recent SIDB update
  sumber_update?: string;
  terakhir_diperbarui?: string;
  dibuat_pada?: string;
}

export interface KunjunganItem {
  id: string;
  tanggal: string; // dd/mm/yyyy
  wbp_id: string;
  nama: string;
  nik?: string;
  keluhan1: string;
  keluhan2?: string;
  keluhan3?: string;
  penyakit1?: string;
  penyakit2?: string;
  penyakit3?: string;
  jenis1?: JenisPenyakit;
  jenis2?: JenisPenyakit;
  jenis3?: JenisPenyakit;
  kamar?: string;
  terapi?: string;
  dokter_pemeriksa?: string;
  perawat?: string;
  catatan?: string;
  dihapus?: boolean;
  arsip?: boolean;
  arsip_tahun?: number;
  dibuat_pada: string;
  diubah_pada?: string;
}

export interface ArchiveYearSummary {
  year: number;
  activeCount: number;
  archivedCount: number;
  deletedCount: number;
}

export interface CalculatedKunjungan extends KunjunganItem {
  penyakit1: string;
  penyakit2?: string;
  penyakit3?: string;
  jenis1?: JenisPenyakit;
  jenis2?: JenisPenyakit;
  jenis3?: JenisPenyakit;
  icd10_1?: string;
  icd10_2?: string;
  icd10_3?: string;
  nama_icd10_1?: string;
  nama_icd10_2?: string;
  nama_icd10_3?: string;
  status_wbp: 'Aktif' | 'TIDAK DITEMUKAN';
  batch_bpjs: string;
  is_duplicate: boolean;
  is_frequent: boolean;
  frequent_count?: number;
  frequent_days?: number;
  wbp?: WbpItem;
}

export interface BatchConfig {
  nama: string;
  warna: string; // Hex color e.g. #FFFF99
  keterangan?: string;
}

export interface PengaturanApp {
  batas_sering_berobat_kali: number;
  periode_sering_hari: number;
  batches: BatchConfig[];
  password_hash: string;
  supabase_url?: string;
  supabase_anon_key?: string;
  nama_klinik: string;
  dokter_penanggung_jawab: string;
  perawat_pemeriksa: string;
}

export interface AuditLog {
  id: string;
  waktu: string;
  aksi: string;
  rincian: string;
  perangkat?: string;
}

export interface SidbUpdateHistory {
  id: string;
  tanggal: string;
  nama_file: string;
  total_baris: number;
  wbp_baru: number;
  wbp_diperbarui: number;
  wbp_ditandai_cek: number;
}

export interface MasterObatItem {
  id: string;
  nama: string; // e.g. Paracetamol
  kekuatan: string; // e.g. 500 mg, sirup 60 ml, salep 5 g
  satuan_terkecil: string; // tablet, kapsul, botol, tube, ampul, vial, sachet, ml, gram, etc.
  isi_per_kotak: number; // integer > 0
  isi_per_strip?: number; // integer >= 0 (0 = tidak dikemas per strip, misal sirup/tube)
  aktif: boolean;
  dibuat_pada?: string;
  diubah_pada?: string;
}

export interface ResepObatItem {
  id: string;
  kunjungan_id: string;
  obat_id: string;
  jumlah_per_minum?: number; // e.g. 0.5 (boleh desimal)
  frekuensi_per_hari?: number; // e.g. 3 (untuk 3 x 1)
  lama_hari?: number; // e.g. 5
  jumlah_diberikan: number; // wajib > 0 dalam satuan_terkecil
  aturan_pakai?: string; // sesudah makan, sebelum makan, sebelum tidur, bila perlu, dll
  catatan?: string;
  is_manual_edited?: boolean; // penanda jika diubah manual
  // enriched helper fields:
  nama_obat?: string;
  obat_nama?: string;
  kekuatan?: string;
  obat_kekuatan?: string;
  satuan_terkecil?: string;
  satuan?: string;
  isi_per_kotak?: number;
  isi_per_strip?: number;
}
