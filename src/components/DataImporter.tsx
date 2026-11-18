/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Users,
  ClipboardList,
  BookOpen,
  Database,
  ShieldCheck,
  Pill,
  Stethoscope,
  X,
} from 'lucide-react';
import {
  exportComprehensiveBackupToExcel,
  parseComprehensiveExcelBackup,
  parseFileInBrowser,
} from '../lib/excelExport';
import { store, normalizeDateIndo, determineBlokByKamar, useStoreSync, getWitaTodayIso, formatDateTimeWita } from '../lib/storage';
import { KunjunganItem, MasterObatItem, PenyakitItem, ReferensiItem, WbpItem } from '../types';

type ImportEntityType = 'wbp' | 'kunjungan' | 'referensi' | 'master_obat' | 'penyakit';

interface BackupPreview {
  rawText: string;
  fileName: string;
  version: string;
  exportedAt: string;
  counts: {
    wbp: number;
    kunjunganAktif: number;
    kunjunganSampah: number;
    referensi: number;
    penyakit: number;
    masterObat: number;
    resepObat: number;
    batches: number;
    sidbHistory: number;
    auditLogs: number;
    theme: string;
  };
}

export default function DataImporter() {
  useStoreSync();
  const [activeImportType, setActiveImportType] = useState<ImportEntityType | null>(null);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Full backup & restore state
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);

  const existingWbp = store.getWbpList();
  const rawVisits = store.getRawKunjungan();
  const activeVisitsCount = rawVisits.filter((k) => !k.dihapus).length;
  const trashVisitsCount = rawVisits.filter((k) => k.dihapus).length;
  const referensiCount = store.getReferensi().length;
  const penyakitCount = store.getPenyakit().length;
  const masterObatCount = store.getMasterObatList().length;
  const resepObatCount = store.getResepObatList().length;
  const batchesCount = store.getPengaturan().batches.length;
  const sidbHistoryCount = store.getSidbHistory().length;
  const auditLogsCount = store.getAuditLogs().length;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: ImportEntityType) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const rows = await parseFileInBrowser(file);
      if (rows.length === 0) {
        setErrorMsg('File yang dipilih kosong atau tidak memiliki baris data.');
        return;
      }

      setActiveImportType(type);
      setPreviewRows(rows);
      setPreviewHeaders(Object.keys(rows[0]));

      // Validate rows
      const issues: string[] = [];
      if (type === 'kunjungan') {
        const wbpNames = new Set(existingWbp.map((w) => w.nama.trim().toLowerCase()));
        rows.forEach((r, idx) => {
          const nama = String(r.Nama || r.nama || '').trim();
          if (!nama) {
            issues.push(`Baris ${idx + 2}: Nama pasien kosong.`);
          } else if (!wbpNames.has(nama.toLowerCase())) {
            issues.push(`Baris ${idx + 2}: Pasien "${nama}" belum terdaftar di DATA_WBP.`);
          }
        });
      } else if (type === 'wbp') {
        rows.forEach((r, idx) => {
          const nama = String(r.Nama || r.nama || '').trim();
          if (!nama) {
            issues.push(`Baris ${idx + 2}: Nama WBP kosong.`);
          }
        });
      } else if (type === 'referensi') {
        rows.forEach((r, idx) => {
          const keluhan = String(r.Keluhan || r.keluhan || '').trim();
          if (!keluhan) {
            issues.push(`Baris ${idx + 2}: Kolom Keluhan kosong.`);
          }
        });
      } else if (type === 'master_obat') {
        rows.forEach((r, idx) => {
          const nama = String(r['Nama Obat'] || r.Nama || r.nama || '').trim();
          if (!nama) {
            issues.push(`Baris ${idx + 2}: Kolom Nama Obat kosong.`);
          }
        });
      } else if (type === 'penyakit') {
        rows.forEach((r, idx) => {
          const penyakit = String(r.Penyakit || r.penyakit || r['Nama Penyakit'] || '').trim();
          if (!penyakit) {
            issues.push(`Baris ${idx + 2}: Kolom Nama Penyakit kosong.`);
          }
        });
      }

      setValidationIssues(issues);
    } catch (err: any) {
      setErrorMsg('Gagal membaca file: ' + err.message);
    }
  };

  const handleConfirmImport = async () => {
    if (!activeImportType || previewRows.length === 0 || isImporting) return;
    setIsImporting(true);
    setErrorMsg(null);

    try {
      if (activeImportType === 'wbp') {
        const mapped: WbpItem[] = previewRows.map((r, idx) => ({
          id: String(r.ID || r.id || `wbp-imp-${Date.now()}-${idx}`),
          no: Number(r.No || idx + 1),
          nik: String(r.NIK || r.nik || ''),
          no_reg_instansi: String(r['No Reg Instansi'] || r.no_reg_instansi || ''),
          nama: String(r.Nama || r.nama || '').trim(),
          jenis_kelamin: (r['Jenis Kelamin'] || 'Laki-laki') as any,
          tempat_lahir: String(r['Tempat Lahir'] || ''),
          tanggal_lahir: String(r['Tanggal Lahir'] || ''),
          alamat: String(r.Alamat || ''),
          nama_ayah: String(r['Nama Ayah'] || ''),
          nama_ibu: String(r['Nama Ibu'] || ''),
          pekerjaan: String(r.Pekerjaan || ''),
          jenis_kejahatan: String(r['Jenis Kejahatan'] || ''),
          kategori: String(r.Kategori || 'Narapidana'),
          lama_pidana: String(r['Lama Pidana'] || ''),
          tanggal_masuk: String(r['Tanggal Masuk'] || ''),
          tgl_ekspirasi: String(r['Tgl Ekspirasi'] || ''),
          blok: determineBlokByKamar(String(r.Kamar || r.kamar || r['Kamar asli (data SIDB)'] || '').trim()),
          kamar: String(r.Kamar || r.kamar || '').trim(),
          kamar_sidb: String(r['Kamar asli (data SIDB)'] || r.Kamar || r.kamar || '').trim(),
          lokasi_sel: String(r['Lokasi Sel'] || ''),
          tgl_surat_penahanan: String(r['Tgl Surat Penahanan'] || ''),
          nomor_surat_penahanan: String(r['Nomor Surat Penahanan'] || ''),
          status_data: String(r['Status Data'] || 'Aktif'),
          batch_bpjs: String(r['Batch Pengalihan Faskes BPJS'] || 'Belum masuk batch'),
          status_skrining: String(r['Status Skrining'] || ''),
          kendala_bpjs: String(r['Kendala / Catatan BPJS'] || ''),
          dasar_pbi: String(r['Dasar Pendaftaran PBI'] || ''),
          catatan_penggabungan: String(r['Catatan Penggabungan'] || ''),
        }));

        await store.bulkImportWbp(mapped, importMode === 'replace');
        setSuccessMsg(`Berhasil mengimpor ${mapped.length} data WBP ke Cloud SQL (${importMode === 'replace' ? 'Timpa Semua' : 'Tambah/Gabung'}).`);
      } else if (activeImportType === 'kunjungan') {
        const mapped: KunjunganItem[] = previewRows.map((r, idx) => {
          const nama = String(r.Nama || r.nama || '').trim();
          const matched = existingWbp.find((w) => w.nama.trim().toLowerCase() === nama.toLowerCase());
          return {
            id: String(r.ID || r.id || `k-imp-${Date.now()}-${idx}`),
            tanggal: normalizeDateIndo(r.Tanggal || r.tanggal || ''),
            wbp_id: matched ? matched.id : '',
            nama,
            nik: matched?.nik || String(r.NIK || r.nik || ''),
            keluhan1: String(r['Keluhan 1'] || r.keluhan1 || '').trim(),
            keluhan2: String(r['Keluhan 2'] || r.keluhan2 || '').trim(),
            keluhan3: String(r['Keluhan 3'] || r.keluhan3 || '').trim(),
            kamar: String(r.Kamar || r.kamar || '').trim(),
            terapi: String(r.Terapi || r.terapi || '').trim(),
            dihapus: false,
            dibuat_pada: new Date().toISOString(),
          };
        });

        await store.bulkImportKunjungan(mapped, importMode === 'replace');
        setSuccessMsg(`Berhasil mengimpor ${mapped.length} kunjungan ke Cloud SQL (${importMode === 'replace' ? 'Timpa Semua' : 'Tambah/Gabung'}).`);
      } else if (activeImportType === 'referensi') {
        const mapped: Omit<ReferensiItem, 'id'>[] = previewRows
          .map((r) => ({
            keluhan: String(r.Keluhan || r.keluhan || '').trim(),
            masuk_penyakit: String(r['Masuk ke kolom penyakit'] || r.masuk_penyakit || '').trim(),
            catatan: String(r.Catatan || r.catatan || '').trim(),
            kode_icd10: String(r['Kode ICD-10'] || r.kode_icd10 || '').trim(),
            nama_icd10: String(r['Nama ICD-10'] || r.nama_icd10 || '').trim(),
            jenis: (
              String(r['Jenis (Menular/Tidak Menular)'] || r.jenis || '').toLowerCase() === 'menular'
                ? 'Menular'
                : 'Tidak Menular'
            ) as any,
          }))
          .filter((r) => Boolean(r.keluhan));

        await store.bulkImportReferensi(mapped, importMode === 'replace');
        setSuccessMsg(
          `Berhasil mengimpor ${mapped.length} referensi keluhan ICD-10 ke Cloud SQL (${importMode === 'replace' ? 'Timpa Semua' : 'Tambah/Gabung'}).`
        );
      } else if (activeImportType === 'master_obat') {
        const mapped: Omit<MasterObatItem, 'id'>[] = previewRows
          .map((r) => ({
            nama: String(r['Nama Obat'] || r.Nama || r.nama || '').trim(),
            kekuatan: String(r['Kekuatan / Sediaan'] || r.Kekuatan || r.kekuatan || 'Standar').trim(),
            satuan_terkecil: String(
              r['Satuan Terkecil'] || r.Satuan || r.satuan_terkecil || 'tablet'
            )
              .trim()
              .toLowerCase(),
            isi_per_kotak: Math.max(
              1,
              Math.round(Number(r['Isi Per Kotak'] || r['Isi per Kotak'] || r.isi_per_kotak || 100))
            ),
            isi_per_strip: Math.max(
              0,
              Math.round(Number(r['Isi Per Strip'] ?? r['Isi per Strip'] ?? r.isi_per_strip ?? 0))
            ),
            aktif: String(r.Aktif ?? r.Status ?? 'Aktif').toLowerCase() !== 'nonaktif',
          }))
          .filter((o) => Boolean(o.nama));

        await store.bulkImportMasterObat(mapped, importMode === 'replace');
        setSuccessMsg(
          `Berhasil mengimpor ${mapped.length} item Master Obat ke Cloud SQL (${importMode === 'replace' ? 'Timpa Semua' : 'Tambah/Gabung'}).`
        );
      } else if (activeImportType === 'penyakit') {
        const mapped: Omit<PenyakitItem, 'id'>[] = previewRows
          .map((r, idx) => ({
            kategori: String(r.Kategori || r.kategori || 'LAIN - LAIN').trim(),
            penyakit: String(r.Penyakit || r.penyakit || r['Nama Penyakit'] || '').trim(),
            jenis: (
              String(r.Jenis || r.jenis || '').toLowerCase() === 'menular' ? 'Menular' : 'Tidak Menular'
            ) as any,
            urutan: Number(r.No || r.urutan || idx + 1),
          }))
          .filter((p) => Boolean(p.penyakit));

        await store.bulkImportPenyakit(mapped, importMode === 'replace');
        setSuccessMsg(
          `Berhasil mengimpor ${mapped.length} daftar penyakit ke Cloud SQL (${importMode === 'replace' ? 'Timpa Semua' : 'Tambah/Gabung'}).`
        );
      }

      setPreviewRows([]);
      setActiveImportType(null);
    } catch (err: any) {
      setErrorMsg('Gagal mengimpor data: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadFullBackupJson = async () => {
    if (isExportingJson) return;
    setIsExportingJson(true);
    setErrorMsg(null);
    try {
      const jsonStr = await store.exportFullBackupAsync();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CADANGAN_MENYELURUH_KLINIK_DOMPU_${getWitaTodayIso()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMsg('Cadangan menyeluruh (.json) berhasil diunduh langsung dari Cloud SQL.');
    } catch (err: any) {
      setErrorMsg('Gagal mengunduh cadangan JSON: ' + err.message);
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleDownloadFullBackupExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    setErrorMsg(null);
    try {
      const jsonStr = await store.exportFullBackupAsync();
      const parsed = JSON.parse(jsonStr);
      exportComprehensiveBackupToExcel(parsed);
      setSuccessMsg('Buku kerja cadangan Excel lengkap (.xlsx, 10 sheet) berhasil diunduh.');
    } catch (err: any) {
      setErrorMsg('Gagal mengunduh cadangan Excel: ' + err.message);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const applyParsedBackupPreview = (parsed: any, rawText: string, fileName: string) => {
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (!Array.isArray(parsed.wbp) &&
        !Array.isArray(parsed.kunjungan) &&
        !Array.isArray(parsed.referensi) &&
        !Array.isArray(parsed.penyakit) &&
        !Array.isArray(parsed.master_obat))
    ) {
      setErrorMsg('Format file cadangan tidak valid atau bukan file cadangan Klinik Dompu.');
      return;
    }

    const kunjunganArr = Array.isArray(parsed.kunjungan) ? parsed.kunjungan : [];
    setBackupPreview({
      rawText,
      fileName,
      version: parsed.version || '2.0',
      exportedAt: parsed.exported_at || '-',
      counts: {
        wbp: Array.isArray(parsed.wbp) ? parsed.wbp.length : 0,
        kunjunganAktif: kunjunganArr.filter((k: any) => !k.dihapus).length,
        kunjunganSampah: kunjunganArr.filter((k: any) => k.dihapus).length,
        referensi: Array.isArray(parsed.referensi) ? parsed.referensi.length : 0,
        penyakit: Array.isArray(parsed.penyakit) ? parsed.penyakit.length : 0,
        masterObat: Array.isArray(parsed.master_obat) ? parsed.master_obat.length : 0,
        resepObat: Array.isArray(parsed.resep_obat) ? parsed.resep_obat.length : 0,
        batches: Array.isArray(parsed.pengaturan?.batches) ? parsed.pengaturan.batches.length : 0,
        sidbHistory: Array.isArray(parsed.sidb_history) ? parsed.sidb_history.length : 0,
        auditLogs: Array.isArray(parsed.audit_logs) ? parsed.audit_logs.length : 0,
        theme: parsed.preferences?.theme || 'light',
      },
    });
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setErrorMsg(null);
    setSuccessMsg(null);

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (isExcel) {
      try {
        const parsed = await parseComprehensiveExcelBackup(file);
        applyParsedBackupPreview(parsed, JSON.stringify(parsed), file.name);
      } catch (err: any) {
        setErrorMsg('Gagal membaca file cadangan Excel (.xlsx): ' + err.message);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        applyParsedBackupPreview(parsed, text, file.name);
      } catch (err: any) {
        setErrorMsg('Gagal membaca file cadangan JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestoreBackup = async () => {
    if (!backupPreview || isRestoring) return;
    setIsRestoring(true);
    setErrorMsg(null);
    try {
      const ok = await store.importFullBackupAsync(backupPreview.rawText);
      if (ok) {
        setSuccessMsg(
          `Seluruh data dari "${backupPreview.fileName}" berhasil dipulihkan secara atomik ke Cloud SQL dan disinkronkan ke semua perangkat yang aktif.`
        );
        setBackupPreview(null);
      } else {
        setErrorMsg('Pemulihan gagal: struktur file cadangan tidak valid.');
      }
    } catch (err: any) {
      setErrorMsg('Terjadi kesalahan saat memulihkan cadangan: ' + err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  const backupModules = [
    { label: 'Data WBP (30+ Kolom)', count: `${existingWbp.length} Orang` },
    { label: 'Kunjungan Harian Aktif', count: `${activeVisitsCount} Baris` },
    { label: 'Kotak Sampah Kunjungan', count: `${trashVisitsCount} Baris` },
    { label: 'Referensi Keluhan ICD-10', count: `${referensiCount} Entri` },
    { label: 'Master Daftar Penyakit', count: `${penyakitCount} Penyakit` },
    { label: 'Master Obat & Sediaan', count: `${masterObatCount} Item` },
    { label: 'Resep / Pengeluaran Obat', count: `${resepObatCount} Resep` },
    { label: 'Pengaturan, Sandi & Batch', count: `${batchesCount} Batch` },
    { label: 'Riwayat Sinkronisasi SIDB', count: `${sidbHistoryCount} Sesi` },
    { label: 'Audit Log Aktivitas', count: `${auditLogsCount} Log` },
  ];

  const importLabelMap: Record<ImportEntityType, string> = {
    wbp: 'DATA WBP',
    kunjungan: 'INPUT HARIAN KUNJUNGAN',
    referensi: 'REFERENSI ICD-10',
    master_obat: 'MASTER OBAT & SEDIAAN',
    penyakit: 'MASTER DAFTAR PENYAKIT',
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-teal-700 dark:text-teal-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Pusat Impor Data & Pencadangan Sistem Lengkap
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Impor data per fitur (.csv / .xlsx) atau ekspor & pulihkan seluruh data aplikasi (WBP, Kunjungan, Referensi, Penyakit, Master Obat, Resep Obat, Pengaturan, SIDB, & Audit Log)
        </p>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-teal-800 dark:text-teal-200 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}

      {/* INDIVIDUAL FEATURE IMPORTERS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Impor DATA_WBP */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-teal-700 dark:text-teal-400 mb-3">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              1. Impor DATA_WBP
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Data warga binaan pemasyarakatan lengkap dengan NIK, tanggal lahir, blok, dan kamar.
            </p>
          </div>

          <label className="mt-4 w-full py-2.5 px-3 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg text-center cursor-pointer transition-colors shadow-xs">
            <span>Pilih File WBP (.csv / .xlsx)</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFileUpload(e, 'wbp')}
              className="hidden"
            />
          </label>
        </div>

        {/* Card 2: Impor Input Harian */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-teal-700 dark:text-teal-400 mb-3">
              <ClipboardList className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              2. Impor Input Harian
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Riwayat kunjungan pasien. Kolom Tanggal, Nama, Keluhan 1-3, Kamar, dan Terapi.
            </p>
          </div>

          <label className="mt-4 w-full py-2.5 px-3 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg text-center cursor-pointer transition-colors shadow-xs">
            <span>Pilih File Kunjungan (.csv / .xlsx)</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFileUpload(e, 'kunjungan')}
              className="hidden"
            />
          </label>
        </div>

        {/* Card 3: Impor Referensi */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-teal-700 dark:text-teal-400 mb-3">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              3. Impor Referensi ICD-10
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Pemetaan master keluhan ke diagnosa ICD-10 dan klasifikasi menular / tidak menular.
            </p>
          </div>

          <label className="mt-4 w-full py-2.5 px-3 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg text-center cursor-pointer transition-colors shadow-xs">
            <span>Pilih File Referensi (.csv / .xlsx)</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFileUpload(e, 'referensi')}
              className="hidden"
            />
          </label>
        </div>

        {/* Card 4: Impor Master Obat */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-teal-700 dark:text-teal-400 mb-3">
              <Pill className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              4. Impor Master Obat
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Daftar obat (Nama Obat, Kekuatan / Sediaan, Satuan Terkecil, Isi Per Kotak, Aktif).
            </p>
          </div>

          <label className="mt-4 w-full py-2.5 px-3 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg text-center cursor-pointer transition-colors shadow-xs">
            <span>Pilih File Master Obat (.csv / .xlsx)</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFileUpload(e, 'master_obat')}
              className="hidden"
            />
          </label>
        </div>

        {/* Card 5: Impor Daftar Penyakit */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-teal-700 dark:text-teal-400 mb-3">
              <Stethoscope className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              5. Impor Daftar Penyakit
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Master klasifikasi penyakit (Kategori, Penyakit, Jenis Menular / Tidak Menular).
            </p>
          </div>

          <label className="mt-4 w-full py-2.5 px-3 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg text-center cursor-pointer transition-colors shadow-xs">
            <span>Pilih File Penyakit (.csv / .xlsx)</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFileUpload(e, 'penyakit')}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* PREVIEW & VALIDATION SECTION */}
      {previewRows.length > 0 && activeImportType && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Pratinjau Impor: {importLabelMap[activeImportType]} ({previewRows.length} Baris Data)
              </h3>
              <p className="text-xs text-slate-500">
                Periksa data dan catatan validasi sebelum menekan simpan
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPreviewRows([]);
                setActiveImportType(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Batal
            </button>
          </div>

          {/* Validation alerts */}
          {validationIssues.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-1 max-h-40 overflow-y-auto">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Ditemukan {validationIssues.length} Catatan Validasi:</span>
              </div>
              {validationIssues.map((issue, idx) => (
                <div key={idx} className="pl-5 text-[11px]">
                  • {issue}
                </div>
              ))}
            </div>
          )}

          {/* First 10 rows preview table */}
          <div className="overflow-x-auto max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 font-semibold sticky top-0">
                <tr>
                  {previewHeaders.map((h) => (
                    <th key={h} className="py-2 px-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {previewRows.slice(0, 10).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {previewHeaders.map((h) => (
                      <td key={h} className="py-1.5 px-3 whitespace-nowrap">
                        {String(row[h] || '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Import Mode Selection Toggle (Append vs Clean Replace) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Pilihan Penggabungan Data:
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {importMode === 'append'
                  ? 'Data baru akan digabungkan atau diperbarui jika kunci sama. Data lama tetap utuh.'
                  : 'PERINGATAN: Seluruh data sebelumnya pada modul ini akan dihapus bersih dan digantikan total oleh file baru ini.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setImportMode('append')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                  importMode === 'append'
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                }`}
              >
                <span>➕ Tambah / Perbarui (Gabung)</span>
              </button>
              <button
                type="button"
                onClick={() => setImportMode('replace')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                  importMode === 'replace'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60'
                }`}
              >
                <span>🔄 Timpa Semua Data (Replace)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={isImporting}
              onClick={handleConfirmImport}
              className={`px-5 py-2 text-white text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-60 ${
                importMode === 'replace' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-700 hover:bg-teal-800'
              }`}
            >
              {isImporting
                ? 'Menyimpan ke Cloud SQL...'
                : importMode === 'replace'
                  ? 'Konfirmasi Timpa & Ganti Semua Data'
                  : 'Simpan & Gabungkan Data'}
            </button>
          </div>
        </div>
      )}

      {/* COMPREHENSIVE FULL BACKUP & RESTORE SECTION */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-teal-600" />
              <span>Cadangan Menyeluruh & Pemulihan Sistem (Full Backup)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Mencadangkan dan memulihkan 100% seluruh isi aplikasi langsung dari Cloud SQL (WBP, Kunjungan, Kotak Sampah, Referensi, Penyakit, Master Obat, Resep Obat, Pengaturan Batch & Tanda Tangan, Kata Sandi, Riwayat SIDB, Audit Log, dan Preferensi).
            </p>
          </div>
        </div>

        {/* Coverage grid showing every backed-up module */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {backupModules.map((mod) => (
            <div
              key={mod.label}
              className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70"
            >
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{mod.label}</div>
              <div className="text-xs font-bold font-mono text-slate-900 dark:text-white mt-0.5">{mod.count}</div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={isExportingJson}
            onClick={handleDownloadFullBackupJson}
            className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingJson ? 'Menyiapkan JSON...' : 'Unduh Cadangan Lengkap Sistem (.json)'}</span>
          </button>

          <button
            type="button"
            disabled={isExportingExcel}
            onClick={handleDownloadFullBackupExcel}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors border border-slate-200 dark:border-slate-700"
          >
            <FileSpreadsheet className="w-4 h-4 text-teal-600" />
            <span>{isExportingExcel ? 'Menyiapkan Excel...' : 'Unduh Buku Kerja Excel Lengkap (.xlsx)'}</span>
          </button>

          <label className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700">
            <RotateCcw className="w-4 h-4 text-amber-600" />
            <span>Pulihkan dari File Cadangan (.json / .xlsx)</span>
            <input
              type="file"
              accept=".json,.xlsx,.xls"
              onChange={handleSelectRestoreFile}
              className="hidden"
            />
          </label>
        </div>

        {/* Restore Preview & Confirmation Card */}
        {backupPreview && (
          <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Pratinjau Pemulihan Cadangan: {backupPreview.fileName}
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    Versi {backupPreview.version} · Diekspor pada{' '}
                    {backupPreview.exportedAt !== '-'
                      ? formatDateTimeWita(backupPreview.exportedAt)
                      : '-'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBackupPreview(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
              <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-amber-200/80 dark:border-amber-900/50">
                WBP: <strong>{backupPreview.counts.wbp}</strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-amber-200/80 dark:border-amber-900/50">
                Kunjungan Aktif: <strong>{backupPreview.counts.kunjunganAktif}</strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-amber-200/80 dark:border-amber-900/50">
                Kotak Sampah: <strong>{backupPreview.counts.kunjunganSampah}</strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-amber-200/80 dark:border-amber-900/50">
                Referensi ICD-10: <strong>{backupPreview.counts.referensi}</strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-amber-200/80 dark:border-amber-900/50">
                Daftar Penyakit: <strong>{backupPreview.counts.penyakit}</strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-amber-200/80 dark:border-amber-900/50">
                Master Obat: <strong>{backupPreview.counts.masterObat}</strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-amber-200/80 dark:border-amber-900/50">
                Resep Obat: <strong>{backupPreview.counts.resepObat}</strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-amber-200/80 dark:border-amber-900/50">
                Batch BPJS: <strong>{backupPreview.counts.batches}</strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-amber-200/80 dark:border-amber-900/50">
                Riwayat SIDB: <strong>{backupPreview.counts.sidbHistory}</strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-amber-200/80 dark:border-amber-900/50">
                Audit Log: <strong>{backupPreview.counts.auditLogs}</strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-amber-800 dark:text-amber-300">
                Pemulihan akan mengganti seluruh isi Cloud SQL dengan data cadangan ini dan memperbarui semua perangkat yang terhubung secara langsung.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBackupPreview(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-white/60 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isRestoring}
                  onClick={handleConfirmRestoreBackup}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg shadow-xs"
                >
                  {isRestoring ? 'Memulihkan ke Cloud SQL...' : 'Konfirmasi Pulihkan Seluruh Data'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
