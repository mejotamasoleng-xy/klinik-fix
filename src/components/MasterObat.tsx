/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Pill,
  Plus,
  Search,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle,
  X,
  Package,
  Layers,
  ArrowUpDown,
  Filter,
  Check,
  Power,
  Info,
  Printer,
  Download,
} from 'lucide-react';
import { MasterObatItem } from '../types';
import { store } from '../lib/storage';
import { exportReportToPdf, printIsolatedReport, CleanReportOptions } from '../lib/pdfReport';
import KopSurat from './KopSurat';

const DEFAULT_UNITS = [
  'tablet',
  'kapsul',
  'botol',
  'tube',
  'ampul',
  'vial',
  'sachet',
  'ml',
  'gram',
];

export default function MasterObat() {
  const [obatList, setObatList] = useState<MasterObatItem[]>(() => store.getMasterObatList());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'unit' | 'box_size'>('name_asc');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingObat, setEditingObat] = useState<MasterObatItem | null>(null);

  // Form Fields
  const [nama, setNama] = useState('');
  const [kekuatan, setKekuatan] = useState('');
  const [satuanTerkecil, setSatuanTerkecil] = useState('tablet');
  const [customUnit, setCustomUnit] = useState('');
  const [isAddingCustomUnit, setIsAddingCustomUnit] = useState(false);
  const [isiPerKotak, setIsiPerKotak] = useState<number | string>(100);
  const [isiPerStrip, setIsiPerStrip] = useState<number | string>(10);
  const [aktif, setAktif] = useState(true);

  // Feedback & Validation
  const [formError, setFormError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Confirmation Modal for Changing isi_per_kotak on used medicine
  const [confirmBoxChangeOpen, setConfirmBoxChangeOpen] = useState(false);
  const [pendingSavePayload, setPendingSavePayload] = useState<any | null>(null);

  // Delete modal states
  const [deleteConfirmObat, setDeleteConfirmObat] = useState<MasterObatItem | null>(null);
  const [cannotDeleteObat, setCannotDeleteObat] = useState<{ obat: MasterObatItem; count: number } | null>(null);

  const refreshList = () => {
    setObatList([...store.getMasterObatList()]);
  };

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      refreshList();
    });
    return unsubscribe;
  }, []);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  const getDefaultStripByUnit = (unit: string) =>
    ['tablet', 'kapsul', 'kaplet'].includes(unit.trim().toLowerCase()) ? 10 : 0;

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingObat(null);
    setNama('');
    setKekuatan('');
    setSatuanTerkecil('tablet');
    setCustomUnit('');
    setIsAddingCustomUnit(false);
    setIsiPerKotak(100);
    setIsiPerStrip(10);
    setAktif(true);
    setFormError(null);
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (obat: MasterObatItem) => {
    setEditingObat(obat);
    setNama(obat.nama);
    setKekuatan(obat.kekuatan);
    if (DEFAULT_UNITS.includes(obat.satuan_terkecil.toLowerCase())) {
      setSatuanTerkecil(obat.satuan_terkecil.toLowerCase());
      setIsAddingCustomUnit(false);
    } else {
      setSatuanTerkecil('custom');
      setCustomUnit(obat.satuan_terkecil);
      setIsAddingCustomUnit(true);
    }
    setIsiPerKotak(obat.isi_per_kotak);
    setIsiPerStrip(obat.isi_per_strip ?? 0);
    setAktif(obat.aktif);
    setFormError(null);
    setModalOpen(true);
  };

  // Submit Handler
  const handleSaveObat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    const cleanNama = nama.trim();
    const cleanKekuatan = kekuatan.trim();
    const finalUnit = (isAddingCustomUnit ? customUnit.trim() : satuanTerkecil).trim().toLowerCase();
    const numIsiPerKotak = Math.round(Number(isiPerKotak));
    const parsedStripRaw = isiPerStrip === '' ? 0 : Number(isiPerStrip);
    const numIsiPerStrip = Math.round(parsedStripRaw);

    if (!cleanNama) {
      setFormError('Nama obat wajib diisi.');
      return;
    }
    if (!cleanKekuatan) {
      setFormError('Kekuatan atau sediaan obat wajib diisi (contoh: 500 mg, sirup 60 ml, salep 5 g).');
      return;
    }
    if (!finalUnit) {
      setFormError('Satuan terkecil wajib ditentukan.');
      return;
    }
    if (isNaN(numIsiPerKotak) || numIsiPerKotak <= 0) {
      setFormError('Isi per 1 kotak wajib berupa bilangan bulat lebih dari 0.');
      return;
    }
    if (isNaN(parsedStripRaw) || numIsiPerStrip < 0) {
      setFormError('Isi per 1 strip tidak boleh negatif (isi 0 jika obat tidak memakai strip).');
      return;
    }
    if (numIsiPerStrip === 1) {
      setFormError('Isi per 1 strip tidak boleh bernilai 1 (isi 0 jika tidak memakai kemasan strip).');
      return;
    }
    if (numIsiPerStrip > 0 && numIsiPerStrip >= numIsiPerKotak) {
      setFormError('Isi per 1 strip harus lebih kecil dari isi per 1 kotak (atau isi 0 jika tanpa strip).');
      return;
    }

    const payload = {
      id: editingObat ? editingObat.id : undefined,
      nama: cleanNama,
      kekuatan: cleanKekuatan,
      satuan_terkecil: finalUnit,
      isi_per_kotak: numIsiPerKotak,
      isi_per_strip: numIsiPerStrip,
      aktif,
    };

    // If editing existing obat and isi_per_kotak or isi_per_strip changed, check if used in resep
    if (
      editingObat &&
      (editingObat.isi_per_kotak !== numIsiPerKotak ||
        (editingObat.isi_per_strip ?? 0) !== numIsiPerStrip)
    ) {
      const isUsed = store.isObatUsedInResep(editingObat.id);
      if (isUsed) {
        setPendingSavePayload(payload);
        setConfirmBoxChangeOpen(true);
        return;
      }
    }

    executeSave(payload);
  };

  const executeSave = (payload: any) => {
    try {
      store.saveMasterObat(payload);
      refreshList();
      setModalOpen(false);
      setConfirmBoxChangeOpen(false);
      setPendingSavePayload(null);
      notify(`Data obat "${payload.nama} ${payload.kekuatan}" berhasil disimpan.`);
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan data obat.');
    }
  };

  // Delete / Deactivate logic
  const handleRequestDelete = (obat: MasterObatItem) => {
    const isUsed = store.isObatUsedInResep(obat.id);
    if (isUsed) {
      const count = store.getResepCountByObatId(obat.id);
      setCannotDeleteObat({ obat, count });
      return;
    }
    setDeleteConfirmObat(obat);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmObat) return;
    const targetName = `${deleteConfirmObat.nama} ${deleteConfirmObat.kekuatan}`;
    try {
      const ok = store.deleteMasterObat(deleteConfirmObat.id);
      setDeleteConfirmObat(null);
      refreshList();
      if (ok) {
        notify(`Obat "${targetName}" berhasil dihapus dari Master Obat.`);
      } else {
        notify(`Obat "${targetName}" tidak ditemukan atau sudah terhapus.`, 'error');
      }
    } catch (err: any) {
      notify(err.message || 'Gagal menghapus obat.', 'error');
      setDeleteConfirmObat(null);
    }
  };

  const handleDeactivateFromModal = () => {
    if (!cannotDeleteObat) return;
    const { obat } = cannotDeleteObat;
    try {
      store.saveMasterObat({ ...obat, aktif: false });
      setCannotDeleteObat(null);
      refreshList();
      notify(`Obat "${obat.nama} ${obat.kekuatan}" telah dinonaktifkan (riwayat laporan tetap aman).`);
    } catch (err: any) {
      notify(err.message || 'Gagal menonaktifkan obat.', 'error');
    }
  };

  const handleToggleAktif = (obat: MasterObatItem) => {
    try {
      store.saveMasterObat({
        ...obat,
        aktif: !obat.aktif,
      });
      refreshList();
      notify(`Status obat "${obat.nama} ${obat.kekuatan}" diubah menjadi ${!obat.aktif ? 'Aktif' : 'Nonaktif'}.`);
    } catch (err: any) {
      notify(err.message || 'Gagal mengubah status obat.', 'error');
    }
  };

  // Filter and Sort
  const filteredAndSortedList = useMemo(() => {
    let list = [...obatList];

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.nama.toLowerCase().includes(q) ||
          o.kekuatan.toLowerCase().includes(q) ||
          o.satuan_terkecil.toLowerCase().includes(q)
      );
    }

    // Status Filter
    if (filterStatus === 'active') {
      list = list.filter((o) => o.aktif);
    } else if (filterStatus === 'inactive') {
      list = list.filter((o) => !o.aktif);
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'name_asc') {
        return `${a.nama} ${a.kekuatan}`.localeCompare(`${b.nama} ${b.kekuatan}`);
      }
      if (sortBy === 'name_desc') {
        return `${b.nama} ${b.kekuatan}`.localeCompare(`${a.nama} ${a.kekuatan}`);
      }
      if (sortBy === 'unit') {
        return a.satuan_terkecil.localeCompare(b.satuan_terkecil);
      }
      if (sortBy === 'box_size') {
        return b.isi_per_kotak - a.isi_per_kotak;
      }
      return 0;
    });

    return list;
  }, [obatList, searchTerm, filterStatus, sortBy]);

  const getMasterObatReportOptions = (): CleanReportOptions => ({
    title: 'DAFTAR KATALOG MASTER OBAT & SEDIAAN KLINIK',
    subtitle: 'Daftar resmi sediaan obat yang tercatat pada Klinik Pratama Lapas Kelas IIB Dompu',
    periode: `Total Obat Ditampilkan: ${filteredAndSortedList.length} Item`,
    orientation: 'portrait',
    fileName: `MASTER_DATA_OBAT_${new Date().toISOString().slice(0, 10)}`,
    tables: [
      {
        headers: [
          'No',
          'Nama Tampilan Obat',
          'Nama Dasar',
          'Kekuatan / Sediaan',
          'Satuan Terkecil',
          'Isi / Strip',
          'Isi / Kotak',
          'Status',
        ],
        rows: filteredAndSortedList.map((o, idx) => [
          idx + 1,
          `${o.nama} ${o.kekuatan}`.trim(),
          o.nama,
          o.kekuatan,
          o.satuan_terkecil,
          o.isi_per_strip && o.isi_per_strip > 1
            ? `${o.isi_per_strip.toLocaleString('id-ID')} ${o.satuan_terkecil}`
            : '-',
          `${o.isi_per_kotak.toLocaleString('id-ID')} ${o.satuan_terkecil}`,
          o.aktif ? 'Aktif' : 'Nonaktif',
        ]),
        alignCenterCols: [0, 4, 7],
        alignRightCols: [5, 6],
        emptyMessage: 'Tidak ada data Master Obat.',
      },
    ],
    signature: {
      rightRole: 'Dokter / Petugas Farmasi Klinik',
      rightNip: 'Klinik Pratama Lapas Kelas IIB Dompu',
    },
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="no-print print:hidden bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 rounded-xl border border-teal-200/60 dark:border-teal-800/60">
              <Pill className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                Master Data Obat & Sediaan
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Katalog resmi sediaan obat klinik Lapas Dompu. Mencatat satuan terkecil, isi per strip, dan isi per kotak untuk konversi laporan pengeluaran obat.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void exportReportToPdf(getMasterObatReportOptions())}
              className="px-3 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh PDF</span>
            </button>
            <button
              type="button"
              onClick={() => printIsolatedReport(getMasterObatReportOptions())}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-teal-600" />
              <span>Cetak</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Obat Baru</span>
            </button>
          </div>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs flex items-center justify-between transition-all ${
              notification.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{notification.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="text-xs opacity-70 hover:opacity-100 font-bold ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3">
          <div className="w-full sm:flex-1 sm:min-w-[240px] relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama obat, kekuatan, atau satuan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Status Filter */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filterStatus === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Semua ({obatList.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('active')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filterStatus === 'active'
                    ? 'bg-teal-700 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Aktif ({obatList.filter((o) => o.aktif).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('inactive')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filterStatus === 'inactive'
                    ? 'bg-slate-300 dark:bg-slate-600 text-slate-900 dark:text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Nonaktif ({obatList.filter((o) => !o.aktif).length})
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none font-medium cursor-pointer"
              >
                <option value="name_asc">Nama (A - Z)</option>
                <option value="name_desc">Nama (Z - A)</option>
                <option value="unit">Satuan Terkecil</option>
                <option value="box_size">Isi per Kotak Terbanyak</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table / Grid of Medicines */}
      <div className="print-sheet bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden print:border-0 print:rounded-none print:overflow-visible">
        <KopSurat
          className="hidden print:block mb-4"
          subTitle="DAFTAR KATALOG MASTER OBAT & SEDIAAN KLINIK"
          periode={`Total Obat Terdaftar: ${filteredAndSortedList.length} Item`}
        />

        {/* Mobile Cards View */}
        <div className="md:hidden print:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filteredAndSortedList.length > 0 ? (
            filteredAndSortedList.map((obat, idx) => {
              const isUsed = store.isObatUsedInResep(obat.id);
              return (
                <div
                  key={obat.id}
                  className={`p-3.5 space-y-2.5 ${
                    !obat.aktif ? 'opacity-65 bg-slate-50/40 dark:bg-slate-900/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono text-slate-400">#{idx + 1}</span>
                        <Pill className={`w-3.5 h-3.5 shrink-0 ${obat.aktif ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
                        <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {obat.nama} {obat.kekuatan}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                          Satuan: {obat.satuan_terkecil}
                        </span>
                        {(obat.isi_per_strip ?? 0) > 1 && (
                          <span className="font-mono font-semibold text-teal-700 dark:text-teal-300 text-[11px]">
                            1 strip = {obat.isi_per_strip!.toLocaleString('id-ID')} {obat.satuan_terkecil}
                          </span>
                        )}
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                          1 kotak = {obat.isi_per_kotak.toLocaleString('id-ID')} {obat.satuan_terkecil}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleAktif(obat)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 transition-colors ${
                        obat.aktif
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{obat.aktif ? 'Aktif' : 'Nonaktif'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(obat)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 flex items-center gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Ubah</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRequestDelete(obat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                        isUsed
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isUsed ? 'Nonaktifkan' : 'Hapus'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-10 px-4 text-center text-xs text-slate-400 italic">
              {searchTerm
                ? `Tidak ada obat yang cocok dengan pencarian "${searchTerm}".`
                : 'Belum ada data Master Obat. Klik "Tambah Obat Baru" untuk menambahkan.'}
            </div>
          )}
        </div>

        {/* Desktop & Print Table */}
        <div className="hidden md:block print:block overflow-x-auto print:overflow-visible">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">No</th>
                <th className="py-2.5 px-4">Nama Tampilan Obat</th>
                <th className="py-2.5 px-3">Nama Dasar</th>
                <th className="py-2.5 px-3">Kekuatan / Sediaan</th>
                <th className="py-2.5 px-3">Satuan Terkecil</th>
                <th className="py-2.5 px-3 text-right">Isi per 1 Strip</th>
                <th className="py-2.5 px-3 text-right">Isi per 1 Kotak</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center no-print print:hidden">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
              {filteredAndSortedList.length > 0 ? (
                filteredAndSortedList.map((obat, idx) => {
                  const isUsed = store.isObatUsedInResep(obat.id);
                  return (
                    <tr
                      key={obat.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        !obat.aktif ? 'opacity-60 bg-slate-50/30 dark:bg-slate-900/30' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <Pill className={`w-3.5 h-3.5 ${obat.aktif ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
                          <span>{obat.nama} {obat.kekuatan}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                        {obat.nama}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">
                        {obat.kekuatan}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                          {obat.satuan_terkecil}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {(obat.isi_per_strip ?? 0) > 1
                          ? `${obat.isi_per_strip!.toLocaleString('id-ID')} ${obat.satuan_terkecil}`
                          : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                        {obat.isi_per_kotak.toLocaleString('id-ID')} {obat.satuan_terkecil}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleAktif(obat)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                            obat.aktif
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-200'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-300'
                          }`}
                          title={obat.aktif ? 'Klik untuk nonaktifkan obat' : 'Klik untuk aktifkan obat'}
                        >
                          <Power className="w-2.5 h-2.5" />
                          <span>{obat.aktif ? 'Aktif' : 'Nonaktif'}</span>
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-center no-print print:hidden">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(obat)}
                            className="p-1 rounded text-slate-500 hover:text-teal-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit data obat"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestDelete(obat)}
                            className={`p-1 rounded transition-colors ${
                              isUsed
                                ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                            }`}
                            title={
                              isUsed
                                ? 'Obat sudah dipakai di resep (klik untuk opsi nonaktifkan)'
                                : 'Hapus obat'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                    {searchTerm
                      ? `Tidak ada obat yang cocok dengan pencarian "${searchTerm}".`
                      : 'Belum ada data Master Obat. Klik "Tambah Obat Baru" untuk menambahkan.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>
              Total terdaftar: <strong>{obatList.length} obat</strong> ({obatList.filter((o) => o.aktif).length} aktif).
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            *Obat yang pernah diberikan dalam kunjungan dikunci dari penghapusan permanen demi integritas rekam medis.
          </span>
        </div>
      </div>

      {/* MODAL: Tambah / Ubah Obat */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-5 shadow-xl animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Pill className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {editingObat ? 'Ubah Data Obat' : 'Tambah Obat Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveObat} className="mt-4 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Nama Obat */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Obat <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Paracetamol, Amoxicillin, Antasida"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  required
                />
              </div>

              {/* Kekuatan / Sediaan */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Kekuatan / Sediaan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 500 mg, sirup 60 ml, salep 5 g, 4 mg"
                  value={kekuatan}
                  onChange={(e) => setKekuatan(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Nama tampilan otomatis: <strong>{nama ? nama.trim() : 'Nama'} {kekuatan ? kekuatan.trim() : 'Kekuatan'}</strong>
                </p>
              </div>

              {/* Satuan Terkecil */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Satuan Terkecil <span className="text-rose-500">*</span>
                </label>
                {!isAddingCustomUnit ? (
                  <div className="flex gap-2">
                    <select
                      value={satuanTerkecil}
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setIsAddingCustomUnit(true);
                          setCustomUnit('');
                        } else {
                          const nextUnit = e.target.value;
                          setSatuanTerkecil(nextUnit);
                          if (!editingObat) {
                            setIsiPerStrip(getDefaultStripByUnit(nextUnit));
                          }
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      {DEFAULT_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                      <option value="custom">+ Tambah Satuan Lainnya...</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ketik satuan baru (contoh: patch, suppositoria)..."
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setIsAddingCustomUnit(false)}
                      className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
                    >
                      Pilih Standar
                    </button>
                  </div>
                )}
              </div>

              {/* Isi per 1 Kotak & Isi per 1 Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Isi per 1 Strip <span className="text-slate-400 font-normal">(0 = tanpa strip)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="10"
                      value={isiPerStrip}
                      onChange={(e) => setIsiPerStrip(e.target.value)}
                      className="w-full px-3 py-2 pr-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                    />
                    <span className="absolute right-3 top-2 text-slate-400 text-xs">
                      {isAddingCustomUnit ? customUnit || 'satuan' : satuanTerkecil}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Isi per 1 Kotak <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="100"
                      value={isiPerKotak}
                      onChange={(e) => setIsiPerKotak(e.target.value)}
                      className="w-full px-3 py-2 pr-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                      required
                    />
                    <span className="absolute right-3 top-2 text-slate-400 text-xs">
                      {isAddingCustomUnit ? customUnit || 'satuan' : satuanTerkecil}
                    </span>
                  </div>
                </div>
              </div>
              {(() => {
                const u = isAddingCustomUnit ? customUnit.trim() || 'satuan' : satuanTerkecil;
                const k = Math.round(Number(isiPerKotak) || 0);
                const s = Math.round(Number(isiPerStrip) || 0);
                if (k > 0 && s > 1 && s < k) {
                  const stripCount = Math.floor(k / s);
                  const rem = k % s;
                  return (
                    <p className="text-[11px] text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 px-2.5 py-1.5 rounded-lg border border-teal-200/70 dark:border-teal-800/60 -mt-2">
                      Aturan konversi pengeluaran: <strong>{s} {u} = 1 strip</strong> ·{' '}
                      {rem === 0
                        ? <><strong>{stripCount} strip = 1 kotak</strong> ({k} {u})</>
                        : <><strong>1 kotak = {k} {u}</strong></>}
                    </p>
                  );
                }
                return (
                  <p className="text-[11px] text-slate-400 -mt-2">
                    Isi 0 pada strip jika obat (misal botol, tube, sachet) tidak memakai kemasan strip.
                  </p>
                );
              })()}

              {/* Status Aktif */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aktif}
                    onChange={(e) => setAktif(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Status Obat Aktif (Tersedia untuk dipilih pada Input Harian)
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 ml-6 mt-0.5">
                  Jika dinonaktifkan, obat tidak akan muncul di form Input Harian, namun riwayat lama tetap aman di laporan.
                </p>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-bold shadow-xs transition-colors"
                >
                  {editingObat ? 'Simpan Perubahan' : 'Tambah Obat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: Isi per 1 Kotak Diubah pada Obat yang Pernah Digunakan */}
      {confirmBoxChangeOpen && pendingSavePayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-300 dark:border-amber-800 max-w-md w-full p-5 shadow-xl animate-in fade-in duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 rounded-lg shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Peringatan Perubahan Konversi Kemasan
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  Obat <strong>{pendingSavePayload.nama} {pendingSavePayload.kekuatan}</strong> sudah pernah digunakan dalam pencatatan resep/kunjungan sebelumnya.
                </p>
                <div className="mt-2.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
                  {editingObat?.isi_per_kotak !== pendingSavePayload.isi_per_kotak && (
                    <div>
                      Isi per 1 kotak: <strong>{editingObat?.isi_per_kotak}</strong> &rarr; <strong>{pendingSavePayload.isi_per_kotak}</strong>
                    </div>
                  )}
                  {(editingObat?.isi_per_strip ?? 0) !== (pendingSavePayload.isi_per_strip ?? 0) && (
                    <div>
                      Isi per 1 strip: <strong>{editingObat?.isi_per_strip ?? 0}</strong> &rarr; <strong>{pendingSavePayload.isi_per_strip ?? 0}</strong>
                    </div>
                  )}
                  <div>
                    Perubahan ini akan mempengaruhi konversi kotak/strip pada laporan pengeluaran obat periode lama.
                  </div>
                </div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-3">
                  Apakah Anda yakin ingin tetap menyimpan perubahan ini?
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmBoxChangeOpen(false);
                  setPendingSavePayload(null);
                }}
                className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => executeSave(pendingSavePayload)}
                className="px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-xs"
              >
                Ya, Tetap Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: Hapus Obat yang Belum Pernah Dipakai */}
      {deleteConfirmObat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-rose-300 dark:border-rose-800 max-w-md w-full p-5 shadow-xl animate-in fade-in duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 rounded-lg shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Konfirmasi Hapus Obat
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">
                  Apakah Anda yakin ingin menghapus data obat <strong>"{deleteConfirmObat.nama} {deleteConfirmObat.kekuatan}"</strong> dari Master Obat?
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Obat ini belum pernah digunakan di resep manapun sehingga aman untuk dihapus.
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmObat(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-xs"
              >
                Ya, Hapus Obat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INFO MODAL: Obat Sudah Digunakan (Tawarkan Nonaktifkan) */}
      {cannotDeleteObat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-300 dark:border-amber-800 max-w-md w-full p-5 shadow-xl animate-in fade-in duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 rounded-lg shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Obat Tidak Dapat Dihapus Permanen
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  Obat <strong>"{cannotDeleteObat.obat.nama} {cannotDeleteObat.obat.kekuatan}"</strong> sudah tercatat dipakai pada <strong>{cannotDeleteObat.count} resep</strong> kunjungan aktif.
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Demi integritas riwayat rekam medis & laporan farmasi periode lama, obat yang sudah dipakai hanya boleh <strong>dinonaktifkan</strong> (tidak muncul lagi di pilihan Input Harian).
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCannotDeleteObat(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-semibold"
              >
                Tutup
              </button>
              {cannotDeleteObat.obat.aktif && (
                <button
                  type="button"
                  onClick={handleDeactivateFromModal}
                  className="px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Nonaktifkan Obat Ini</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
