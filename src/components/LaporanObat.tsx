/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Calendar,
  Download,
  Copy,
  Printer,
  Check,
  Search,
  Filter,
  Layers,
  ArrowUpDown,
  CheckSquare,
  Square,
  Sparkles,
  Info,
  ChevronRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { store, parseDate, formatSetaraKotak, getWitaDateParts, getWitaTodayDate, getWitaTodayIso, formatLongDateWita } from '../lib/storage';
import { MasterObatItem, ResepObatItem, CalculatedKunjungan } from '../types';
import { exportReportToPdf, printIsolatedReport, CleanReportOptions } from '../lib/pdfReport';
import { copyToClipboard, showToast } from '../lib/feedback';
import KopSurat from './KopSurat';

type LaporanTab = 'ringkasan' | 'harian';

export default function LaporanObat() {
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setDataVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  const [activeTab, setActiveTab] = useState<LaporanTab>('ringkasan');
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Date Filters (default: Bulan ini WITA)
  const witaNow = getWitaDateParts();
  const currentYear = witaNow.year;
  const currentMonth = witaNow.month;
  const todayStr = getWitaTodayIso();
  const firstDayOfMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;

  const [startDate, setStartDate] = useState<string>(firstDayOfMonthStr);
  const [endDate, setEndDate] = useState<string>(todayStr);

  // Medicine Filter (Multiselect)
  const [selectedObatIds, setSelectedObatIds] = useState<string[]>([]);
  const [obatDropdownOpen, setObatDropdownOpen] = useState(false);
  const [obatSearchQuery, setObatSearchQuery] = useState('');

  // Sorting for Tab A (Ringkasan per Obat)
  const [sortBy, setSortBy] = useState<'name_asc' | 'total_desc' | 'recipes_desc'>('name_asc');

  // Print Mode State
  const [isPrintPreview, setIsPrintPreview] = useState(false);

  // Master Data (auto-refreshes when dataVersion increments)
  const masterObatList = useMemo(() => store.getMasterObatList(), [dataVersion]);
  const allVisits = useMemo(() => store.getCalculatedKunjungan(false), [dataVersion]);
  const allResep = useMemo(() => store.getResepObatList(), [dataVersion]);

  // Helper date shortcuts (WITA)
  const handleShortcut = (type: 'today' | 'yesterday' | 'this_month' | 'last_month') => {
    const today = getWitaTodayDate();
    const pad = (n: number) => String(n).padStart(2, '0');

    if (type === 'today') {
      const d = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      setStartDate(d);
      setEndDate(d);
    } else if (type === 'yesterday') {
      const y = getWitaTodayDate();
      y.setDate(today.getDate() - 1);
      const d = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
      setStartDate(d);
      setEndDate(d);
    } else if (type === 'this_month') {
      const start = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
      const end = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      setStartDate(start);
      setEndDate(end);
    } else if (type === 'last_month') {
      const prevM = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
      const prevY = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
      const lastDay = new Date(prevY, prevM + 1, 0).getDate();
      setStartDate(`${prevY}-${pad(prevM + 1)}-01`);
      setEndDate(`${prevY}-${pad(prevM + 1)}-${pad(lastDay)}`);
    }
  };

  // Human readable period label
  const readablePeriodLabel = useMemo(() => {
    if (!startDate || !endDate) return 'Semua Periode';
    const sParts = startDate.split('-');
    const eParts = endDate.split('-');
    const formatIndo = (parts: string[]) => {
      if (parts.length !== 3) return '';
      const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
      ];
      const mIdx = parseInt(parts[1], 10) - 1;
      return `${parseInt(parts[2], 10)} ${months[mIdx] || ''} ${parts[0]}`;
    };
    if (startDate === endDate) {
      return formatIndo(sParts);
    }
    return `${formatIndo(sParts)} s/d ${formatIndo(eParts)}`;
  }, [startDate, endDate]);

  // Filtered Visits based on TANGGAL KUNJUNGAN
  const visitsInDateRange = useMemo(() => {
    if (!startDate || !endDate) return allVisits;
    const parseIsoLocal = (iso: string) => {
      const parts = iso.split('-').map(Number);
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
      return new Date(iso);
    };
    const start = parseIsoLocal(startDate);
    start.setHours(0, 0, 0, 0);
    const end = parseIsoLocal(endDate);
    end.setHours(23, 59, 59, 999);

    return allVisits.filter((v) => {
      const d = parseDate(v.tanggal);
      if (!d) return false;
      return d >= start && d <= end;
    });
  }, [allVisits, startDate, endDate]);

  // Map of valid visit IDs in period
  const visitMap = useMemo(() => {
    const map = new Map<string, CalculatedKunjungan>();
    visitsInDateRange.forEach((v) => map.set(v.id, v));
    return map;
  }, [visitsInDateRange]);

  // Resep entries that belong to visits in the date range
  const filteredResepEntries = useMemo(() => {
    return allResep.filter((r) => {
      if (!visitMap.has(r.kunjungan_id)) return false;
      if (selectedObatIds.length > 0 && !selectedObatIds.includes(r.obat_id)) return false;
      return r.jumlah_diberikan > 0;
    });
  }, [allResep, visitMap, selectedObatIds]);

  // =========================================================================
  // TAB A: RINGKASAN PER OBAT
  // =========================================================================
  const ringkasanData = useMemo(() => {
    // Group by obat_id
    const grouped = new Map<
      string,
      {
        obatId: string;
        namaObat: string;
        kekuatan: string;
        satuan: string;
        isiPerKotak: number;
        isiPerStrip: number;
        totalKeluar: number; // sum of jumlah_diberikan
        jumlahResep: number; // count of prescription lines
        uniquePatients: Set<string>; // unique patients
      }
    >();

    filteredResepEntries.forEach((r) => {
      const visit = visitMap.get(r.kunjungan_id);
      if (!visit) return;

      const obat = masterObatList.find((o) => o.id === r.obat_id);
      const namaObat = obat ? obat.nama : (r.nama_obat || 'Obat');
      const kekuatan = obat ? obat.kekuatan : (r.kekuatan || '');
      const satuan = obat ? obat.satuan_terkecil : (r.satuan_terkecil || 'satuan');
      const isiPerKotak = obat ? obat.isi_per_kotak : (r.isi_per_kotak || 1);
      const isiPerStrip = obat ? (obat.isi_per_strip ?? 0) : (r.isi_per_strip ?? 0);

      if (!grouped.has(r.obat_id)) {
        grouped.set(r.obat_id, {
          obatId: r.obat_id,
          namaObat,
          kekuatan,
          satuan,
          isiPerKotak,
          isiPerStrip,
          totalKeluar: 0,
          jumlahResep: 0,
          uniquePatients: new Set<string>(),
        });
      }

      const item = grouped.get(r.obat_id)!;
      // Yang dijumlahkan adalah "Jumlah diberikan", bukan hasil rumus
      item.totalKeluar += r.jumlah_diberikan;
      item.jumlahResep += 1;

      // Unique patient identification (canonical NIK / WBP ID / normalized name)
      const patientKey = store.getCanonicalPatientKey(visit) || `nama_${visit.nama.trim().toLowerCase()}`;
      item.uniquePatients.add(patientKey);
    });

    // Only medicines with totalKeluar > 0
    let result = Array.from(grouped.values()).filter((item) => item.totalKeluar > 0);

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'name_asc') {
        return `${a.namaObat} ${a.kekuatan}`.localeCompare(`${b.namaObat} ${b.kekuatan}`);
      }
      if (sortBy === 'total_desc') {
        return b.totalKeluar - a.totalKeluar;
      }
      if (sortBy === 'recipes_desc') {
        return b.jumlahResep - a.jumlahResep;
      }
      return 0;
    });

    return result.map((item, idx) => ({
      no: idx + 1,
      namaObatLengkap: `${item.namaObat} ${item.kekuatan}`.trim(),
      satuan: item.satuan,
      totalKeluar: item.totalKeluar,
      setaraKotak: formatSetaraKotak(item.totalKeluar, item.isiPerKotak, item.satuan, item.isiPerStrip),
      jumlahResep: item.jumlahResep,
      jumlahPasienUnik: item.uniquePatients.size,
    }));
  }, [filteredResepEntries, visitMap, masterObatList, sortBy]);

  // =========================================================================
  // TAB B: RINCIAN PER HARI
  // =========================================================================
  const harianData = useMemo(() => {
    // Group by tanggal (dd/mm/yyyy) + obat_id
    const grouped = new Map<
      string,
      {
        tanggal: string;
        dateObj: Date | null;
        obatId: string;
        namaObat: string;
        kekuatan: string;
        satuan: string;
        isiPerKotak: number;
        isiPerStrip: number;
        totalKeluar: number;
        jumlahResep: number;
        uniquePatients: Set<string>;
      }
    >();

    filteredResepEntries.forEach((r) => {
      const visit = visitMap.get(r.kunjungan_id);
      if (!visit) return;

      const obat = masterObatList.find((o) => o.id === r.obat_id);
      const namaObat = obat ? obat.nama : (r.nama_obat || 'Obat');
      const kekuatan = obat ? obat.kekuatan : (r.kekuatan || '');
      const satuan = obat ? obat.satuan_terkecil : (r.satuan_terkecil || 'satuan');
      const isiPerKotak = obat ? obat.isi_per_kotak : (r.isi_per_kotak || 1);
      const isiPerStrip = obat ? (obat.isi_per_strip ?? 0) : (r.isi_per_strip ?? 0);

      const groupKey = `${visit.tanggal}___${r.obat_id}`;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          tanggal: visit.tanggal,
          dateObj: parseDate(visit.tanggal),
          obatId: r.obat_id,
          namaObat,
          kekuatan,
          satuan,
          isiPerKotak,
          isiPerStrip,
          totalKeluar: 0,
          jumlahResep: 0,
          uniquePatients: new Set<string>(),
        });
      }

      const item = grouped.get(groupKey)!;
      item.totalKeluar += r.jumlah_diberikan;
      item.jumlahResep += 1;

      const patientKey = store.getCanonicalPatientKey(visit) || `nama_${visit.nama.trim().toLowerCase()}`;
      item.uniquePatients.add(patientKey);
    });

    let result = Array.from(grouped.values()).filter((item) => item.totalKeluar > 0);

    // Urut tanggal lalu nama obat
    result.sort((a, b) => {
      const timeA = a.dateObj ? a.dateObj.getTime() : 0;
      const timeB = b.dateObj ? b.dateObj.getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return `${a.namaObat} ${a.kekuatan}`.localeCompare(`${b.namaObat} ${b.kekuatan}`);
    });

    return result.map((item, idx) => ({
      no: idx + 1,
      tanggal: item.tanggal,
      namaObatLengkap: `${item.namaObat} ${item.kekuatan}`.trim(),
      satuan: item.satuan,
      totalKeluar: item.totalKeluar,
      setaraKotak: formatSetaraKotak(item.totalKeluar, item.isiPerKotak, item.satuan, item.isiPerStrip),
      jumlahResep: item.jumlahResep,
      jumlahPasienUnik: item.uniquePatients.size,
    }));
  }, [filteredResepEntries, visitMap, masterObatList]);

  // =========================================================================
  // ACTIONS: COPY TABLE (TSV FOR GOOGLE SHEETS)
  // =========================================================================
  const handleCopyTable = async () => {
    try {
      const lines: string[] = [];

      if (activeTab === 'ringkasan') {
        lines.push(['No', 'Nama Obat', 'Satuan', 'Total Keluar', 'Setara Kotak / Strip', 'Jumlah Resep', 'Jumlah Pasien Unik'].join('\t'));
        ringkasanData.forEach((row) => {
          lines.push([
            row.no,
            row.namaObatLengkap,
            row.satuan,
            row.totalKeluar,
            row.setaraKotak,
            row.jumlahResep,
            row.jumlahPasienUnik,
          ].join('\t'));
        });
      } else {
        lines.push(['No', 'Tanggal', 'Nama Obat', 'Satuan', 'Total Keluar', 'Setara Kotak / Strip', 'Jumlah Resep', 'Jumlah Pasien Unik'].join('\t'));
        harianData.forEach((row) => {
          lines.push([
            row.no,
            row.tanggal,
            row.namaObatLengkap,
            row.satuan,
            row.totalKeluar,
            row.setaraKotak,
            row.jumlahResep,
            row.jumlahPasienUnik,
          ].join('\t'));
        });
      }

      const copied = await copyToClipboard(lines.join('\r\n'));
      if (copied) {
        setCopySuccess(true);
        showToast('Tabel pengeluaran obat berhasil disalin ke clipboard.', 'success');
        setTimeout(() => setCopySuccess(false), 3500);
      } else {
        showToast('Gagal menyalin otomatis. Gunakan tombol Unduh CSV / Excel.', 'error');
      }
    } catch (err) {
      console.error('Copy failed', err);
      showToast('Gagal menyalin otomatis. Gunakan tombol Unduh CSV / Excel.', 'error');
    }
  };

  // =========================================================================
  // ACTIONS: DOWNLOAD CSV (UTF-8 WITH BOM FOR EXCEL)
  // =========================================================================
  const handleDownloadCsv = () => {
    const lines: string[] = [];
    const escapeCsv = (str: any) => {
      const text = String(str ?? '').replace(/"/g, '""');
      return `"${text}"`;
    };

    if (activeTab === 'ringkasan') {
      lines.push(['No', 'Nama Obat', 'Satuan', 'Total Keluar', 'Setara Kotak / Strip', 'Jumlah Resep', 'Jumlah Pasien Unik'].map(escapeCsv).join(','));
      ringkasanData.forEach((row) => {
        lines.push([
          row.no,
          row.namaObatLengkap,
          row.satuan,
          row.totalKeluar,
          row.setaraKotak,
          row.jumlahResep,
          row.jumlahPasienUnik,
        ].map(escapeCsv).join(','));
      });
    } else {
      lines.push(['No', 'Tanggal', 'Nama Obat', 'Satuan', 'Total Keluar', 'Setara Kotak / Strip', 'Jumlah Resep', 'Jumlah Pasien Unik'].map(escapeCsv).join(','));
      harianData.forEach((row) => {
        lines.push([
          row.no,
          row.tanggal,
          row.namaObatLengkap,
          row.satuan,
          row.totalKeluar,
          row.setaraKotak,
          row.jumlahResep,
          row.jumlahPasienUnik,
        ].map(escapeCsv).join(','));
      });
    }

    // Prepend UTF-8 BOM (\uFEFF) so Excel opens UTF-8 Indonesian text correctly
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LAPORAN_OBAT_${activeTab.toUpperCase()}_${startDate}_sd_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  // ACTIONS: DOWNLOAD EXCEL (.XLSX)
  // =========================================================================
  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();

    const titleRow = [`LAPORAN PEMAKAIAN OBAT KLINIK LAPAS KELAS IIB DOMPU`];
    const periodRow = [`PERIODE: ${readablePeriodLabel.toUpperCase()}`];
    const emptyRow: any[] = [];

    if (activeTab === 'ringkasan') {
      const rows: any[][] = [
        titleRow,
        periodRow,
        [`TABEL RINGKASAN PEMAKAIAN PER OBAT`],
        emptyRow,
        ['NO', 'NAMA OBAT', 'SATUAN', 'TOTAL KELUAR', 'SETARA KOTAK / STRIP', 'JUMLAH RESEP', 'PASIEN UNIK'],
      ];

      ringkasanData.forEach((r) => {
        rows.push([r.no, r.namaObatLengkap, r.satuan, r.totalKeluar, r.setaraKotak, r.jumlahResep, r.jumlahPasienUnik]);
      });

      rows.push(emptyRow);
      rows.push(['', '', '', '', 'Dompu, ' + formatLongDateWita()]);
      rows.push(['', '', '', '', 'Dokter Penanggung Jawab / Petugas Medis']);
      rows.push(emptyRow);
      rows.push(emptyRow);
      rows.push(['', '', '', '', '(.......................................................)']);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Ringkasan Obat');
    } else {
      const rows: any[][] = [
        titleRow,
        periodRow,
        [`TABEL RINCIAN PENGELUARAN OBAT HARIAN`],
        emptyRow,
        ['NO', 'TANGGAL KUNJUNGAN', 'NAMA OBAT', 'SATUAN', 'TOTAL KELUAR', 'SETARA KOTAK / STRIP', 'JUMLAH RESEP', 'PASIEN UNIK'],
      ];

      harianData.forEach((r) => {
        rows.push([r.no, r.tanggal, r.namaObatLengkap, r.satuan, r.totalKeluar, r.setaraKotak, r.jumlahResep, r.jumlahPasienUnik]);
      });

      rows.push(emptyRow);
      rows.push(['', '', '', '', 'Dompu, ' + formatLongDateWita()]);
      rows.push(['', '', '', '', 'Dokter Penanggung Jawab / Petugas Medis']);
      rows.push(emptyRow);
      rows.push(emptyRow);
      rows.push(['', '', '', '', '(.......................................................)']);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Rincian Harian');
    }

    XLSX.writeFile(wb, `LAPORAN_OBAT_${activeTab.toUpperCase()}_${startDate}_sd_${endDate}.xlsx`);
  };

  // =========================================================================
  // ACTIONS: CLEAN REPORT OPTIONS (ISOLATED PRINT & PDF EXPORT)
  // =========================================================================
  const getReportOptions = (): CleanReportOptions => {
    const baseNotes = [
      '1. Data dihitung murni dari jumlah riil pengeluaran obat kepada pasien pada Input Harian Pelayanan Medis.',
      '2. Konversi pengeluaran obat ke kotak & strip dihitung berdasarkan pembagian bulat isi per kotak dan isi per strip tanpa pembulatan ke atas.',
    ];

    if (activeTab === 'ringkasan') {
      return {
        title: 'LAPORAN REKAPITULASI PENGELUARAN & PEMAKAIAN OBAT RAWAT JALAN',
        subtitle: 'Sumber Data: Catatan Input Harian Pelayanan Medis Klinik Pratama Lapas Kelas IIB Dompu',
        periode: `PERIODE: ${readablePeriodLabel.toUpperCase()}`,
        orientation: 'portrait',
        fileName: `LAPORAN_OBAT_RINGKASAN_${startDate}_sd_${endDate}`,
        tables: [
          {
            headers: [
              'No',
              'Nama Obat (Nama + Kekuatan)',
              'Satuan',
              'Total Keluar',
              'Setara Kotak / Strip',
              'Jumlah Resep',
              'Pasien Unik',
            ],
            rows: ringkasanData.map((r) => [
              r.no,
              r.namaObatLengkap,
              r.satuan,
              r.totalKeluar.toLocaleString('id-ID'),
              r.setaraKotak,
              r.jumlahResep,
              `${r.jumlahPasienUnik} orang`,
            ]),
            alignCenterCols: [0, 2, 5, 6],
            alignRightCols: [3],
            emptyMessage: `Tidak ada obat yang keluar pada periode ${readablePeriodLabel}.`,
          },
        ],
        notes: baseNotes,
        signature: {
          rightRole: 'Dokter Penanggung Jawab Klinik / Petugas Farmasi',
          rightNip: 'Klinik Pratama Lapas Kelas IIB Dompu',
        },
      };
    }

    return {
      title: 'LAPORAN RINCIAN PENGELUARAN OBAT HARIAN RAWAT JALAN',
      subtitle: 'Sumber Data: Catatan Input Harian Pelayanan Medis Klinik Pratama Lapas Kelas IIB Dompu',
      periode: `PERIODE: ${readablePeriodLabel.toUpperCase()}`,
      orientation: 'landscape',
      fileName: `LAPORAN_OBAT_HARIAN_${startDate}_sd_${endDate}`,
      tables: [
        {
          headers: [
            'No',
            'Tanggal',
            'Nama Obat',
            'Satuan',
            'Total Keluar',
            'Setara Kotak / Strip',
            'Jumlah Resep',
            'Pasien Unik',
          ],
          rows: harianData.map((r) => [
            r.no,
            r.tanggal,
            r.namaObatLengkap,
            r.satuan,
            r.totalKeluar.toLocaleString('id-ID'),
            r.setaraKotak,
            r.jumlahResep,
            `${r.jumlahPasienUnik} orang`,
          ]),
          alignCenterCols: [0, 1, 3, 6, 7],
          alignRightCols: [4],
          emptyMessage: `Tidak ada rincian obat yang keluar pada periode ${readablePeriodLabel}.`,
        },
      ],
      notes: baseNotes,
      signature: {
        rightRole: 'Dokter Penanggung Jawab Klinik / Petugas Farmasi',
        rightNip: 'Klinik Pratama Lapas Kelas IIB Dompu',
      },
    };
  };

  const handlePrint = () => {
    setIsPrintPreview(true);
    printIsolatedReport(getReportOptions());
  };

  const handleDownloadPdf = () => {
    void exportReportToPdf(getReportOptions());
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Area (Hidden in Print Mode) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 rounded-xl border border-teal-200/60 dark:border-teal-800/60">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                Laporan Pengeluaran & Pemakaian Obat
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rekapitulasi resmi pengeluaran sediaan obat berdasarkan tanggal kunjungan pasien. Menampilkan konversi setara kotak / strip dan pasien unik.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Copy for Google Sheets */}
            <button
              type="button"
              onClick={handleCopyTable}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              title="Salin tabel tab-separated untuk langsung di-paste ke Google Sheets"
            >
              {copySuccess ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copySuccess ? 'Tersalin ke Clipboard!' : 'Salin Tabel Google Sheets'}</span>
            </button>

            {/* Download CSV */}
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 transition-colors"
              title="Unduh format CSV dengan encoding UTF-8 BOM"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh CSV</span>
            </button>

            {/* Download Excel */}
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh .xlsx</span>
            </button>

            {/* Download PDF */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              title="Unduh langsung dokumen laporan resmi berformat .pdf dengan Kop Surat"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh PDF</span>
            </button>

            {/* Print Isolated Report with Kop Surat */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              title="Cetak laporan bersih dengan Kop Surat Resmi"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Laporan</span>
            </button>
          </div>
        </div>

        {/* Copy Toast */}
        {copySuccess && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Tabel berhasil disalin!</strong> Anda dapat langsung menekan <strong>Ctrl + V</strong> pada Google Sheets atau Excel.
            </span>
          </div>
        )}

        {/* Filter Section */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Date Range Inputs */}
          <div className="md:col-span-5 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                Dari Tanggal (Kunjungan)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
              />
            </div>
            <span className="hidden sm:inline text-slate-400 mt-4">s/d</span>
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
              />
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="md:col-span-4 flex flex-col justify-end">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Pintasan Periode
            </label>
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <button
                type="button"
                onClick={() => handleShortcut('today')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium"
              >
                Hari ini
              </button>
              <button
                type="button"
                onClick={() => handleShortcut('yesterday')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium"
              >
                Kemarin
              </button>
              <button
                type="button"
                onClick={() => handleShortcut('this_month')}
                className="px-2 py-1 rounded bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-300 font-bold border border-teal-200 dark:border-teal-800"
              >
                Bulan ini
              </button>
              <button
                type="button"
                onClick={() => handleShortcut('last_month')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium"
              >
                Bulan lalu
              </button>
            </div>
          </div>

          {/* Filter Obat (Multiselect Dropdown) */}
          <div className="md:col-span-3 flex flex-col justify-end relative">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Filter Obat ({selectedObatIds.length ? `${selectedObatIds.length} dipilih` : 'Semua'})
            </label>
            <button
              type="button"
              onClick={() => setObatDropdownOpen(!obatDropdownOpen)}
              className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs text-left bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg flex items-center justify-between text-slate-800 dark:text-slate-200"
            >
              <span className="truncate">
                {selectedObatIds.length === 0
                  ? 'Semua Obat'
                  : `${selectedObatIds.length} Obat Terpilih`}
              </span>
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
            </button>

            {/* Dropdown Menu */}
            {obatDropdownOpen && (
              <div className="absolute left-0 sm:left-auto right-0 top-full mt-1 w-full sm:w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-30 p-2.5 text-xs">
                <input
                  type="text"
                  placeholder="Cari obat..."
                  value={obatSearchQuery}
                  onChange={(e) => setObatSearchQuery(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 mb-2 focus:outline-none"
                />
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedObatIds([])}
                    className="text-[11px] text-teal-700 dark:text-teal-400 font-semibold hover:underline"
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setObatDropdownOpen(false)}
                    className="text-[11px] text-slate-500 hover:text-slate-700"
                  >
                    Tutup
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {masterObatList
                    .filter((o) =>
                      `${o.nama} ${o.kekuatan}`.toLowerCase().includes(obatSearchQuery.toLowerCase())
                    )
                    .map((obat) => {
                      const isSelected = selectedObatIds.includes(obat.id);
                      return (
                        <label
                          key={obat.id}
                          className="flex items-center gap-2 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-slate-800 dark:text-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedObatIds([...selectedObatIds, obat.id]);
                              } else {
                                setSelectedObatIds(selectedObatIds.filter((id) => id !== obat.id));
                              }
                            }}
                            className="w-3.5 h-3.5 text-teal-600 rounded border-slate-300"
                          />
                          <span className="truncate">
                            {obat.nama} {obat.kekuatan}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Selector & Active Period Summary (Hidden in Print Mode) */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 text-xs w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('ringkasan')}
            className={`flex-1 sm:flex-initial px-3 py-2 sm:py-1.5 rounded-md font-bold transition-all ${
              activeTab === 'ringkasan'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            A. Ringkasan per Obat ({ringkasanData.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('harian')}
            className={`flex-1 sm:flex-initial px-3 py-2 sm:py-1.5 rounded-md font-bold transition-all ${
              activeTab === 'harian'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            B. Rincian per Hari ({harianData.length})
          </button>
        </div>

        {/* Sort Selector for Tab A */}
        {activeTab === 'ringkasan' && (
          <div className="flex items-center gap-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500">Urutkan:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="name_asc">Nama Obat (A - Z)</option>
              <option value="total_desc">Total Keluar Terbanyak</option>
              <option value="recipes_desc">Jumlah Resep Terbanyak</option>
            </select>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PRINTABLE REPORT WRAPPER (Includes Official Kop Surat) */}
      {/* ========================================================================= */}
      <div className="print-sheet bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden p-4 md:p-6 print:p-0 print:border-none print:shadow-none print:bg-white print:text-black print:overflow-visible">
        {/* OFFICIAL KOP SURAT (Shown in Print & At Top of Document) */}
        <KopSurat
          className="mb-4"
          subTitle={
            activeTab === 'ringkasan'
              ? 'LAPORAN REKAPITULASI PEMAKAIAN OBAT RAWAT JALAN'
              : 'LAPORAN RINCIAN PENGELUARAN OBAT HARIAN RAWAT JALAN'
          }
        />

        {/* Document Period & Metadata */}
        <div className="text-center text-xs mb-4 text-slate-600 dark:text-slate-400 print:text-black">
          <p className="font-semibold">
            PERIODE: {readablePeriodLabel.toUpperCase()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Sumber Data: Catatan Input Harian Pelayanan Medis Klinik Lapas Dompu
          </p>
        </div>

        {/* TAB A: RINGKASAN PER OBAT */}
        {activeTab === 'ringkasan' && (
          <>
            {/* Mobile Cards View */}
            <div className="md:hidden print:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {ringkasanData.length > 0 ? (
                ringkasanData.map((row) => (
                  <div key={row.no} className="py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-mono text-slate-400 mr-1.5">#{row.no}</span>
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {row.namaObatLengkap}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-sm text-teal-800 dark:text-teal-300 whitespace-nowrap shrink-0">
                        {row.totalKeluar.toLocaleString('id-ID')} {row.satuan}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                        Setara: {row.setaraKotak}
                      </span>
                      <span className="font-mono text-[11px]">
                        {row.jumlahResep} resep · {row.jumlahPasienUnik} pasien
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-xs text-slate-400 italic">
                  Tidak ada obat yang keluar pada periode {readablePeriodLabel}.
                </div>
              )}
            </div>

            {/* Desktop & Print Plain Table */}
            <div className="hidden md:block print:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse select-all print:text-[11px]">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 print:bg-gray-100 print:text-black font-semibold border-b-2 border-slate-300 dark:border-slate-700 print:border-black">
                <tr>
                  <th className="py-2 px-2 w-10 text-center border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    No
                  </th>
                  <th className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Nama Obat (Nama + Kekuatan)
                  </th>
                  <th className="py-2 px-2.5 text-center border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Satuan
                  </th>
                  <th className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Total Keluar
                  </th>
                  <th className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Setara Kotak / Strip
                  </th>
                  <th className="py-2 px-3 text-center border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Jumlah Resep
                  </th>
                  <th className="py-2 px-3 text-center">
                    Jumlah Pasien Unik
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-gray-200 font-sans">
                {ringkasanData.length > 0 ? (
                  ringkasanData.map((row) => (
                    <tr
                      key={row.no}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 print:hover:bg-transparent"
                    >
                      <td className="py-2 px-2 text-center text-slate-400 font-mono border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.no}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.namaObatLengkap}
                      </td>
                      <td className="py-2 px-2.5 text-center text-slate-600 dark:text-slate-300 print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.satuan}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-teal-800 dark:text-teal-300 print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.totalKeluar.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300 print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.setaraKotak}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700 dark:text-slate-300 print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.jumlahResep}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 dark:text-white print:text-black">
                        {row.jumlahPasienUnik} orang
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                      Tidak ada obat yang keluar pada periode {readablePeriodLabel}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </>
        )}

        {/* TAB B: RINCIAN PER HARI */}
        {activeTab === 'harian' && (
          <>
            {/* Mobile Cards View */}
            <div className="md:hidden print:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {harianData.length > 0 ? (
                harianData.map((row) => (
                  <div key={row.no} className="py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-mono font-semibold text-teal-700 dark:text-teal-400">
                          {row.tanggal}
                        </div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          {row.namaObatLengkap}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-sm text-teal-800 dark:text-teal-300 whitespace-nowrap shrink-0">
                        {row.totalKeluar.toLocaleString('id-ID')} {row.satuan}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                        Setara: {row.setaraKotak}
                      </span>
                      <span className="font-mono text-[11px]">
                        {row.jumlahResep} resep · {row.jumlahPasienUnik} pasien
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-xs text-slate-400 italic">
                  Tidak ada rincian obat yang keluar pada periode {readablePeriodLabel}.
                </div>
              )}
            </div>

            {/* Desktop & Print Plain Table */}
            <div className="hidden md:block print:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse select-all print:text-[11px]">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 print:bg-gray-100 print:text-black font-semibold border-b-2 border-slate-300 dark:border-slate-700 print:border-black">
                <tr>
                  <th className="py-2 px-2 w-10 text-center border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    No
                  </th>
                  <th className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Tanggal
                  </th>
                  <th className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Nama Obat
                  </th>
                  <th className="py-2 px-2.5 text-center border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Satuan
                  </th>
                  <th className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Total Keluar
                  </th>
                  <th className="py-2 px-3 border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Setara Kotak / Strip
                  </th>
                  <th className="py-2 px-3 text-center border-r border-slate-200 dark:border-slate-700 print:border-gray-300">
                    Jumlah Resep
                  </th>
                  <th className="py-2 px-3 text-center">
                    Jumlah Pasien Unik
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-gray-200 font-sans">
                {harianData.length > 0 ? (
                  harianData.map((row) => (
                    <tr
                      key={row.no}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 print:hover:bg-transparent"
                    >
                      <td className="py-2 px-2 text-center text-slate-400 font-mono border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.no}
                      </td>
                      <td className="py-2 px-3 font-mono font-medium text-slate-800 dark:text-slate-200 print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200 whitespace-nowrap">
                        {row.tanggal}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.namaObatLengkap}
                      </td>
                      <td className="py-2 px-2.5 text-center text-slate-600 dark:text-slate-300 print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.satuan}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-teal-800 dark:text-teal-300 print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.totalKeluar.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300 print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.setaraKotak}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700 dark:text-slate-300 print:text-black border-r border-slate-100 dark:border-slate-800 print:border-gray-200">
                        {row.jumlahResep}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 dark:text-white print:text-black">
                        {row.jumlahPasienUnik} orang
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                      Tidak ada rincian obat yang keluar pada periode {readablePeriodLabel}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* OFFICIAL INSTITUTIONAL SIGNATURE SECTION */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 print:border-black flex flex-col md:flex-row justify-between items-start text-xs text-slate-700 dark:text-slate-300 print:text-black gap-6">
          <div className="text-[11px] text-slate-500 print:text-gray-600 max-w-sm">
            <p className="font-semibold mb-1">Catatan Pelaporan Pengeluaran Obat:</p>
            <p>1. Data dihitung murni dari jumlah riil pengeluaran obat kepada pasien pada Input Harian Pelayanan Medis.</p>
            <p>2. Konversi pengeluaran obat ke kotak & strip dihitung berdasarkan pembagian bulat isi per kotak dan isi per strip tanpa pembulatan ke atas.</p>
          </div>

          <div className="text-center w-64 self-end md:self-auto">
            <p>Dompu, {formatLongDateWita()}</p>
            <p className="font-bold mt-1">Dokter Penanggung Jawab Klinik / Petugas Farmasi</p>
            <div className="h-16"></div>
            <p className="font-bold underline">(.........................................................)</p>
            <p className="text-[11px] text-slate-500 print:text-black mt-0.5">Klinik Pratama Lapas Kelas IIB Dompu</p>
          </div>
        </div>
      </div>
    </div>
  );
}
