/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Printer,
  ShieldCheck,
  AlertCircle,
  Pill,
  FileText,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { WbpItem } from '../types';
import {
  calculateUsia,
  formatLongDateWita,
  getEkspirasiStatus,
  getRelativeTime,
  store,
  useStoreSync,
} from '../lib/storage';

interface MedicalRecordModalProps {
  wbp: WbpItem | null;
  onClose: () => void;
}

function getReadableBatchTextColor(hexBg?: string): string {
  if (!hexBg || !/^#?[0-9a-f]{6}$/i.test(hexBg.trim())) return '#0f172a';
  const clean = hexBg.trim().replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0f172a' : '#ffffff';
}

export default function MedicalRecordModal({ wbp, onClose }: MedicalRecordModalProps) {
  useStoreSync();
  const [showAllVisits, setShowAllVisits] = useState(false);

  useEffect(() => {
    setShowAllVisits(false);
  }, [wbp?.id]);

  useEffect(() => {
    if (!wbp) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [wbp, onClose]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('medical-record-printing');
    };
  }, []);

  if (!wbp) return null;

  const currentWbp = store.getWbpById(wbp.id) || wbp;
  const dossier = store.getPatientMedicalRecord(currentWbp.id || currentWbp.nama);
  const usia = calculateUsia(currentWbp.tanggal_lahir);
  const ekspirasi = getEkspirasiStatus(currentWbp.tgl_ekspirasi);
  const pengaturan = store.getPengaturan();

  const batchColor =
    pengaturan.batches?.find(
      (b) => b.nama.trim().toLowerCase() === (currentWbp.batch_bpjs || '').trim().toLowerCase()
    )?.warna || '#E2E8F0';
  const batchTextColor = getReadableBatchTextColor(batchColor);

  const displayedVisits = showAllVisits ? dossier.allVisits : dossier.last10Visits;
  const hasMoreThan10 = dossier.allVisits.length > 10;

  const handlePrint = () => {
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('medical-record-printing');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    document.body.classList.add('medical-record-printing');
    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1200);
    }, 60);
  };

  const renderVisitDiagnoses = (v: (typeof displayedVisits)[number]) => {
    return [
      { c: v.keluhan1, p: v.penyakit1, icd: v.icd10_1, j: v.jenis1 },
      { c: v.keluhan2, p: v.penyakit2, icd: v.icd10_2, j: v.jenis2 },
      { c: v.keluhan3, p: v.penyakit3, icd: v.icd10_3, j: v.jenis3 },
    ].filter((x) => (x.c && x.c.trim()) || (x.p && x.p.trim()));
  };

  const renderVisitPrescriptions = (visitId: string, fallbackTerapi?: string) => {
    const items = store.getResepByKunjunganId(visitId);
    if (items.length === 0) {
      return (
        <span className="text-slate-700 dark:text-slate-300 text-[11px]">
          {fallbackTerapi && fallbackTerapi.trim() ? fallbackTerapi : '-'}
        </span>
      );
    }
    return (
      <div className="space-y-1">
        {items.map((item) => {
          const namaObat = item.obat_nama || item.nama_obat || 'Obat';
          const satuan = item.satuan_terkecil || item.satuan || 'satuan';
          const aturan =
            item.aturan_pakai ||
            (item.jumlah_per_minum && item.frekuensi_per_hari
              ? `${item.frekuensi_per_hari}x${item.jumlah_per_minum}`
              : '');
          return (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-800 dark:text-slate-200"
            >
              <Pill className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="font-semibold">{namaObat}</span>
              <span className="font-mono tabular-nums text-[10px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/70">
                {item.jumlah_diberikan} {satuan}
              </span>
              {aturan && <span className="text-[10px] text-slate-500 dark:text-slate-400">({aturan})</span>}
            </div>
          );
        })}
        {fallbackTerapi && fallbackTerapi.trim() && (
          <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">{fallbackTerapi}</p>
        )}
      </div>
    );
  };

  const printPortal =
    typeof document !== 'undefined'
      ? createPortal(
          <div id="medical-record-print-root" className="hidden bg-white text-slate-900">
            <div className="space-y-4">
              {/* Printable Letterhead */}
              <div className="text-center border-b-2 border-slate-900 pb-3">
                <img
                  src="/logo.png"
                  alt="Logo Klinik Pratama Lapas Dompu"
                  className="h-14 w-auto mx-auto object-contain mb-1.5"
                />
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-700">
                  Kementerian Imigrasi dan Pemasyarakatan Republik Indonesia
                </div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-700">
                  Kantor Wilayah Nusa Tenggara Barat
                </div>
                <h1 className="text-base font-bold text-slate-900 uppercase tracking-tight mt-0.5">
                  LEMBAGA PEMASYARAKATAN KELAS IIB DOMPU
                </h1>
                <p className="text-[11px] text-slate-600">
                  Klinik Pratama Lapas Dompu · Jl. Letkol M. Suharmadji No. 1, Dompu, NTB
                </p>
              </div>

              <div className="flex items-start justify-between border-b border-slate-300 pb-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800">
                    KARTU REKAM MEDIS PASIEN RAWAT JALAN
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-0.5">{currentWbp.nama}</h2>
                </div>
                <span
                  className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-400"
                  style={{ backgroundColor: batchColor, color: batchTextColor }}
                >
                  BPJS: {currentWbp.batch_bpjs || 'Belum masuk batch'}
                </span>
              </div>

              {/* Demographics */}
              <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-300 mr-break-avoid">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">NIK</span>
                  <span className="font-mono tabular-nums font-semibold">{currentWbp.nik || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">No. Registrasi</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {currentWbp.no_reg_instansi || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                    Tempat & Tanggal Lahir
                  </span>
                  <span className="font-medium">
                    {currentWbp.tempat_lahir || '-'}, {currentWbp.tanggal_lahir || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                    Usia / Jenis Kelamin
                  </span>
                  <span className="font-medium">
                    {usia > 0 ? `${usia} Tahun` : '-'} · {currentWbp.jenis_kelamin}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Blok / Kamar</span>
                  <span className="font-semibold">
                    {currentWbp.blok || '-'} / Kamar {currentWbp.kamar || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Kategori / Perkara</span>
                  <span className="font-medium">
                    {currentWbp.kategori} · {currentWbp.jenis_kejahatan || '-'}
                  </span>
                </div>
                {currentWbp.tgl_ekspirasi && (
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                      Tanggal Ekspirasi
                    </span>
                    <span className="font-mono tabular-nums font-medium">
                      {currentWbp.tgl_ekspirasi} ({ekspirasi.label})
                    </span>
                  </div>
                )}
                {currentWbp.kendala_bpjs && (
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                      Kendala BPJS
                    </span>
                    <span className="font-medium text-amber-800">{currentWbp.kendala_bpjs}</span>
                  </div>
                )}
                {currentWbp.alamat && (
                  <div className="col-span-3">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Alamat Asal</span>
                    <span className="font-medium">{currentWbp.alamat}</span>
                  </div>
                )}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs mr-break-avoid">
                <div className="p-2 rounded border border-slate-300">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Total Kunjungan</span>
                  <span className="text-sm font-bold font-mono tabular-nums mt-0.5 block">
                    {dossier.totalKunjungan} Kali
                  </span>
                </div>
                <div className="p-2 rounded border border-slate-300">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Bulan Ini</span>
                  <span className="text-sm font-bold font-mono tabular-nums mt-0.5 block">
                    {dossier.kunjunganBulanIni} Kali
                  </span>
                </div>
                <div className="p-2 rounded border border-slate-300">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">7 Hari Terakhir</span>
                  <span className="text-sm font-bold font-mono tabular-nums mt-0.5 block">
                    {dossier.kunjungan7HariTerakhir} Kali
                  </span>
                </div>
                <div className="p-2 rounded border border-slate-300">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Terakhir Berobat</span>
                  <span className="text-xs font-semibold mt-0.5 block">
                    {dossier.previousVisitDate || 'Belum ada'}
                  </span>
                </div>
              </div>

              {dossier.contagiousIllnessesThisMonth.length > 0 && (
                <div className="p-2.5 rounded border border-rose-300 bg-rose-50 text-rose-900 text-xs mr-break-avoid">
                  <strong>Kasus Menular Bulan Ini ({dossier.contagiousIllnessesThisMonth.length} jenis):</strong>{' '}
                  {dossier.contagiousIllnessesThisMonth.join(', ')}.
                </div>
              )}

              {/* Visit Table (Full History on Print) */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2">
                  Riwayat Kunjungan & Pemberian Obat ({displayedVisits.length} dari {dossier.allVisits.length}{' '}
                  kunjungan)
                </h4>
                <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
                  <thead className="bg-slate-100 font-semibold">
                    <tr>
                      <th className="py-1.5 px-2.5 border border-slate-300">Tanggal</th>
                      <th className="py-1.5 px-2.5 border border-slate-300">Kamar</th>
                      <th className="py-1.5 px-2.5 border border-slate-300">Keluhan & Diagnosa (ICD-10)</th>
                      <th className="py-1.5 px-2.5 border border-slate-300">Resep / Terapi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedVisits.length > 0 ? (
                      displayedVisits.map((v) => {
                        const diags = renderVisitDiagnoses(v);
                        const items = store.getResepByKunjunganId(v.id);
                        return (
                          <tr key={v.id} className="mr-break-avoid align-top">
                            <td className="py-1.5 px-2.5 border border-slate-300 font-mono tabular-nums whitespace-nowrap">
                              {v.tanggal}
                            </td>
                            <td className="py-1.5 px-2.5 border border-slate-300 whitespace-nowrap">
                              {v.kamar || '-'}
                            </td>
                            <td className="py-1.5 px-2.5 border border-slate-300">
                              <div className="space-y-0.5">
                                {diags.map((x, idx) => (
                                  <div key={idx}>
                                    <span className="font-medium">{x.c}</span> → <span>{x.p}</span>
                                    {x.icd && x.icd !== 'CEK REFERENSI' && (
                                      <span className="ml-1 font-mono text-[10px]">[{x.icd}]</span>
                                    )}
                                    {x.j === 'Menular' && (
                                      <span className="ml-1 text-[10px] font-bold text-rose-700">(Menular)</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="py-1.5 px-2.5 border border-slate-300">
                              {items.length > 0 ? (
                                <div className="space-y-0.5">
                                  {items.map((item) => (
                                    <div key={item.id}>
                                      {item.obat_nama || item.nama_obat} ({item.jumlah_diberikan}{' '}
                                      {item.satuan_terkecil || item.satuan || 'satuan'}
                                      {item.aturan_pakai ? `, ${item.aturan_pakai}` : ''})
                                    </div>
                                  ))}
                                  {v.terapi && <div className="text-[10px] text-slate-600">{v.terapi}</div>}
                                </div>
                              ) : (
                                v.terapi || '-'
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-3 text-center text-slate-500 border border-slate-300">
                          Belum ada riwayat kunjungan tercatat
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 pt-6 text-xs text-center mr-break-avoid">
                <div>
                  <p>Mengetahui,</p>
                  <p className="font-semibold">Kepala Lapas Kelas IIB Dompu</p>
                  <div className="h-14" />
                  <p className="font-bold underline">(........................................................)</p>
                  <p className="text-[10px]">NIP. ..................................................</p>
                </div>
                <div>
                  <p>Dompu, {formatLongDateWita()}</p>
                  <p className="font-semibold">Dokter / Petugas Perawatan Lapas</p>
                  <div className="h-14" />
                  <p className="font-bold underline">
                    ({pengaturan.dokter_penanggung_jawab || '........................................................'})
                  </p>
                  <p className="text-[10px]">Petugas Medis Klinik Pratama</p>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto print:hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`Rekam Medis ${currentWbp.nama}`}
      >
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
          {/* Modal Toolbar */}
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200/70 dark:border-teal-800/70">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  Rekam Medis Rawat Jalan
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {currentWbp.nama} · Blok {currentWbp.blok || '-'} / Kamar {currentWbp.kamar || '-'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cetak Rekam Medis</span>
                <span className="sm:hidden">Cetak</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Tutup Rekam Medis"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
            {/* Clinical Letterhead (Dark Mode Safe) */}
            <div className="text-center border-b border-slate-200 dark:border-slate-800 pb-4">
              <img
                src="/logo.png"
                alt="Logo Klinik Pratama Lapas Dompu"
                className="h-12 w-auto mx-auto object-contain mb-2"
              />
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-400">
                Kementerian Imigrasi dan Pemasyarakatan Republik Indonesia · Kanwil NTB
              </div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight mt-0.5">
                LEMBAGA PEMASYARAKATAN KELAS IIB DOMPU
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Klinik Pratama Lapas Dompu · Jl. Letkol M. Suharmadji No. 1, Dompu, NTB
              </p>
            </div>

            {/* Identity Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                  Kartu Rekam Medis Pasien
                </span>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    {currentWbp.nama}
                  </h2>
                  {currentWbp.perlu_dicek && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300/70 dark:border-amber-800 font-semibold">
                      Perlu Verifikasi SIDB
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300/60 dark:border-slate-700 shrink-0"
                  style={{ backgroundColor: batchColor, color: batchTextColor }}
                >
                  BPJS: {currentWbp.batch_bpjs || 'Belum masuk batch'}
                </span>
              </div>
            </div>

            {/* Demographic Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                  Nomor Induk Kependudukan (NIK)
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {currentWbp.nik || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                  Nomor Registrasi Instansi
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {currentWbp.no_reg_instansi || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                  Tempat & Tanggal Lahir
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {currentWbp.tempat_lahir || '-'},{' '}
                  <span className="font-mono tabular-nums">{currentWbp.tanggal_lahir || '-'}</span>
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                  Usia / Jenis Kelamin
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {usia > 0 ? `${usia} Tahun` : '-'} · {currentWbp.jenis_kelamin}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                  Penempatan Blok / Kamar
                </span>
                <span className="font-semibold text-teal-700 dark:text-teal-400">
                  {currentWbp.blok || '-'} / Kamar {currentWbp.kamar || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                  Status / Kategori
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {currentWbp.kategori} · {currentWbp.jenis_kejahatan || '-'}
                </span>
              </div>
              {currentWbp.tgl_ekspirasi && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                    Tanggal Ekspirasi (Bebas)
                  </span>
                  <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                    {currentWbp.tgl_ekspirasi}
                  </span>{' '}
                  <span
                    className={`text-[11px] font-semibold ${
                      ekspirasi.isExpired
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-teal-700 dark:text-teal-400'
                    }`}
                  >
                    ({ekspirasi.label})
                  </span>
                </div>
              )}
              {currentWbp.kendala_bpjs && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                    Kendala BPJS
                  </span>
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {currentWbp.kendala_bpjs}
                  </span>
                </div>
              )}
              {currentWbp.alamat && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                    Alamat Asal
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{currentWbp.alamat}</span>
                </div>
              )}
            </div>

            {/* Clinical Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-semibold">
                  Total Kunjungan
                </span>
                <span className="text-lg font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5 block">
                  {dossier.totalKunjungan} Kali
                </span>
              </div>
              <div className="p-3 rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/40 dark:bg-teal-950/20">
                <span className="text-[10px] text-teal-700 dark:text-teal-400 block uppercase font-semibold">
                  Kunjungan Bulan Ini
                </span>
                <span className="text-lg font-bold text-teal-800 dark:text-teal-300 font-mono tabular-nums mt-0.5 block">
                  {dossier.kunjunganBulanIni} Kali
                </span>
              </div>
              <div className="p-3 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20">
                <span className="text-[10px] text-indigo-700 dark:text-indigo-400 block uppercase font-semibold">
                  7 Hari Terakhir
                </span>
                <span className="text-lg font-bold text-indigo-800 dark:text-indigo-300 font-mono tabular-nums mt-0.5 block">
                  {dossier.kunjungan7HariTerakhir} Kali
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-semibold">
                  Terakhir Sebelumnya
                </span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 block">
                  {dossier.previousVisitDaysAgo || 'Belum ada'}
                </span>
              </div>
            </div>

            {/* Contagious Notice */}
            {dossier.contagiousIllnessesThisMonth.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Kasus Menular Bulan Ini ({dossier.contagiousIllnessesThisMonth.length} jenis):</strong>{' '}
                  {dossier.contagiousIllnessesThisMonth.join(', ')}.
                </span>
              </div>
            )}

            {/* Monthly Diagnosis Summary */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>Diagnosa Bulan Ini (Berdasarkan Frekuensi)</span>
              </h4>
              {dossier.sortedIllnesses.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {dossier.sortedIllnesses.map((item) => (
                    <div
                      key={item.penyakit}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.penyakit}
                        </span>
                        {item.icd10 && item.icd10 !== 'CEK REFERENSI' && (
                          <span className="ml-1.5 font-mono text-[10px] text-teal-700 dark:text-teal-400">
                            ({item.icd10})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            item.jenis === 'Menular'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {item.jenis || 'Tidak Menular'}
                        </span>
                        <span className="font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
                          {item.count}x
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  Tidak ada kunjungan pada bulan ini.
                </p>
              )}
            </div>

            {/* Visit History Section */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>
                    {showAllVisits
                      ? `Seluruh Riwayat Kunjungan (${dossier.allVisits.length})`
                      : `Riwayat 10 Kunjungan Terakhir (${displayedVisits.length} dari ${dossier.allVisits.length})`}
                  </span>
                </h4>
                {hasMoreThan10 && (
                  <button
                    type="button"
                    onClick={() => setShowAllVisits((prev) => !prev)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    {showAllVisits ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        <span>Tampilkan 10 Terakhir</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>Tampilkan Semua ({dossier.allVisits.length})</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">Kamar</th>
                      <th className="py-2.5 px-3">Keluhan & Diagnosa (ICD-10)</th>
                      <th className="py-2.5 px-3">Resep & Terapi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {displayedVisits.length > 0 ? (
                      displayedVisits.map((v) => {
                        const diags = renderVisitDiagnoses(v);
                        return (
                          <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top">
                            <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap text-slate-800 dark:text-slate-200">
                              {v.tanggal}
                              <span className="block text-[10px] text-slate-400 font-sans">
                                {getRelativeTime(v.tanggal)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {v.kamar || '-'}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="space-y-1">
                                {diags.map((x, idx) => (
                                  <div key={idx} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className="font-medium text-slate-800 dark:text-slate-200">
                                      {x.c}
                                    </span>
                                    <span className="text-slate-400">→</span>
                                    <span className="text-slate-700 dark:text-slate-300">{x.p}</span>
                                    {x.icd && x.icd !== 'CEK REFERENSI' && (
                                      <span className="font-mono text-[10px] text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.5 rounded">
                                        {x.icd}
                                      </span>
                                    )}
                                    {x.j === 'Menular' && (
                                      <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-semibold rounded">
                                        Menular
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">{renderVisitPrescriptions(v.id, v.terapi)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400">
                          Belum ada riwayat kunjungan tercatat
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Cards */}
              <div className="md:hidden space-y-2.5">
                {displayedVisits.length > 0 ? (
                  displayedVisits.map((v) => {
                    const diags = renderVisitDiagnoses(v);
                    return (
                      <div
                        key={v.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200/80 dark:border-slate-700/70">
                          <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                            {v.tanggal}{' '}
                            <span className="font-sans font-normal text-[11px] text-slate-500">
                              ({getRelativeTime(v.tanggal)})
                            </span>
                          </span>
                          <span className="text-[11px] text-slate-600 dark:text-slate-300">
                            Kamar {v.kamar || '-'}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {diags.map((x, idx) => (
                            <div key={idx} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="font-medium text-slate-800 dark:text-slate-200">{x.c}</span>
                              <span className="text-slate-400">→</span>
                              <span className="text-slate-700 dark:text-slate-300">{x.p}</span>
                              {x.icd && x.icd !== 'CEK REFERENSI' && (
                                <span className="font-mono text-[10px] text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.5 rounded">
                                  {x.icd}
                                </span>
                              )}
                              {x.j === 'Menular' && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-semibold rounded">
                                  Menular
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800">
                          {renderVisitPrescriptions(v.id, v.terapi)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-6 text-center text-xs text-slate-400">
                    Belum ada riwayat kunjungan tercatat
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {printPortal}
    </>
  );
}

