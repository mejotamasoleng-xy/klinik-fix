/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  X,
  Filter,
} from 'lucide-react';
import { PenyakitItem, ReferensiItem } from '../types';
import { store, useStoreSync } from '../lib/storage';

export default function ReferencesManager() {
  const storeVersion = useStoreSync();
  const [activeTab, setActiveTab] = useState<'keluhan' | 'penyakit'>('keluhan');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPenyakitFilter, setSelectedPenyakitFilter] = useState<string>('');
  const [referensiList, setReferensiList] = useState<ReferensiItem[]>(() => store.getReferensi());
  const [penyakitList, setPenyakitList] = useState<PenyakitItem[]>(() => store.getPenyakit());

  // Modal Add/Edit
  const [modalRef, setModalRef] = useState<{ open: boolean; item?: ReferensiItem }>({ open: false });
  const [formRef, setFormRef] = useState<Partial<ReferensiItem>>({});
  const [refError, setRefError] = useState<string | null>(null);

  const [modalPenyakit, setModalPenyakit] = useState<{ open: boolean; item?: PenyakitItem }>({ open: false });
  const [formPenyakit, setFormPenyakit] = useState<Partial<PenyakitItem>>({});
  const [penyakitError, setPenyakitError] = useState<string | null>(null);

  const [deleteConfirmRef, setDeleteConfirmRef] = useState<ReferensiItem | null>(null);

  const reloadData = () => {
    setReferensiList(store.getReferensi());
    setPenyakitList(store.getPenyakit());
  };

  useEffect(() => {
    reloadData();
  }, [storeVersion]);

  // All visits for counting ICD-10 usage dynamically
  const allVisits = store.getCalculatedKunjungan(false);

  const icdUsageCount = useMemo(() => {
    const map: Record<string, number> = {};
    allVisits.forEach((v) => {
      [v.icd10_1, v.icd10_2, v.icd10_3].forEach((code) => {
        if (code && code !== 'CEK REFERENSI') {
          map[code] = (map[code] || 0) + 1;
        }
      });
    });
    return map;
  }, [allVisits]);

  // Duplicate detection & per-disease complaint index
  const { duplicateKeluhanSet, refsByDiseaseMap, coveredPenyakitCount } = useMemo(() => {
    const counts = new Map<string, number>();
    const byDisease = new Map<string, ReferensiItem[]>();

    referensiList.forEach((r) => {
      const k = r.keluhan.trim().toLowerCase();
      if (k) {
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      const d = (r.masuk_penyakit || '').trim().toLowerCase();
      if (d) {
        const arr = byDisease.get(d) || [];
        arr.push(r);
        byDisease.set(d, arr);
      }
    });

    const dups = new Set<string>();
    counts.forEach((count, key) => {
      if (count > 1) dups.add(key);
    });

    let covered = 0;
    penyakitList.forEach((p) => {
      const list = byDisease.get(p.penyakit.trim().toLowerCase());
      if (list && list.length > 0) covered += 1;
    });

    return {
      duplicateKeluhanSet: dups,
      refsByDiseaseMap: byDisease,
      coveredPenyakitCount: covered,
    };
  }, [referensiList, penyakitList]);

  // Filtered lists
  const filteredReferensi = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const diseaseFilter = selectedPenyakitFilter.trim().toLowerCase();
    return referensiList.filter((r) => {
      if (diseaseFilter && r.masuk_penyakit.trim().toLowerCase() !== diseaseFilter) {
        return false;
      }
      if (!q) return true;
      return (
        r.keluhan.toLowerCase().includes(q) ||
        r.masuk_penyakit.toLowerCase().includes(q) ||
        r.kode_icd10.toLowerCase().includes(q) ||
        r.nama_icd10.toLowerCase().includes(q)
      );
    });
  }, [referensiList, searchQuery, selectedPenyakitFilter]);

  const filteredPenyakit = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return penyakitList;
    return penyakitList.filter((p) => {
      if (
        p.penyakit.toLowerCase().includes(q) ||
        p.kategori.toLowerCase().includes(q) ||
        p.jenis.toLowerCase().includes(q)
      ) {
        return true;
      }
      const mappedRefs = refsByDiseaseMap.get(p.penyakit.trim().toLowerCase()) || [];
      return mappedRefs.some(
        (r) =>
          r.keluhan.toLowerCase().includes(q) ||
          r.kode_icd10.toLowerCase().includes(q) ||
          r.nama_icd10.toLowerCase().includes(q)
      );
    });
  }, [penyakitList, searchQuery, refsByDiseaseMap]);

  // Categories list
  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(penyakitList.map((p) => p.kategori)));
  }, [penyakitList]);

  // Referensi Handlers
  const handleOpenAddRef = () => {
    const matchedDisease = selectedPenyakitFilter
      ? penyakitList.find((p) => p.penyakit.toLowerCase() === selectedPenyakitFilter.toLowerCase())
      : undefined;

    setRefError(null);
    setFormRef({
      keluhan: '',
      masuk_penyakit: matchedDisease ? matchedDisease.penyakit : '',
      catatan: '',
      kode_icd10: '',
      nama_icd10: '',
      jenis: matchedDisease ? matchedDisease.jenis : 'Tidak Menular',
    });
    setModalRef({ open: true });
  };

  const handleOpenEditRef = (r: ReferensiItem) => {
    setRefError(null);
    setFormRef({ ...r });
    setModalRef({ open: true, item: r });
  };

  const handleChangeMasukPenyakit = (value: string) => {
    const matched = penyakitList.find(
      (p) => p.penyakit.trim().toLowerCase() === value.trim().toLowerCase()
    );
    setFormRef((prev) => ({
      ...prev,
      masuk_penyakit: value,
      jenis: matched ? matched.jenis : prev.jenis,
    }));
  };

  const handleSaveRef = (e: React.FormEvent) => {
    e.preventDefault();
    setRefError(null);
    const cleanKeluhan = (formRef.keluhan || '').trim();
    if (!cleanKeluhan) {
      setRefError('Nama keluhan wajib diisi.');
      return;
    }

    const duplicate = referensiList.find(
      (r) =>
        r.id !== modalRef.item?.id &&
        r.keluhan.trim().toLowerCase() === cleanKeluhan.toLowerCase()
    );
    if (duplicate) {
      setRefError(
        `Keluhan "${duplicate.keluhan}" sudah terdaftar (${duplicate.masuk_penyakit || '-'} / ${duplicate.kode_icd10 || '-'}). Gunakan kalimat keluhan yang lebih spesifik agar tidak ganda.`
      );
      return;
    }

    try {
      if (modalRef.item) {
        store.updateReferensi(modalRef.item.id, formRef);
      } else {
        store.addReferensi(formRef as any);
      }
      setModalRef({ open: false });
      reloadData();
    } catch (err: any) {
      setRefError(err?.message || 'Gagal menyimpan referensi keluhan.');
    }
  };

  const handleConfirmDeleteRef = () => {
    if (!deleteConfirmRef) return;
    store.deleteReferensi(deleteConfirmRef.id);
    setDeleteConfirmRef(null);
    reloadData();
  };

  // Penyakit Handlers
  const handleOpenEditPenyakit = (p: PenyakitItem) => {
    setPenyakitError(null);
    setFormPenyakit({ ...p });
    setModalPenyakit({ open: true, item: p });
  };

  const handleOpenAddPenyakit = () => {
    setPenyakitError(null);
    setFormPenyakit({
      penyakit: '',
      kategori: uniqueCategories[0] || 'LAIN - LAIN',
      jenis: 'Tidak Menular',
    });
    setModalPenyakit({ open: true });
  };

  const handleSavePenyakit = (e: React.FormEvent) => {
    e.preventDefault();
    setPenyakitError(null);
    if (!formPenyakit.penyakit?.trim()) {
      setPenyakitError('Nama penyakit wajib diisi.');
      return;
    }

    if (modalPenyakit.item) {
      store.updatePenyakit(modalPenyakit.item.id, formPenyakit);
    } else {
      store.addPenyakit(formPenyakit as any);
    }
    setModalPenyakit({ open: false });
    reloadData();
  };

  const handleJumpToDiseaseComplaints = (diseaseName: string) => {
    setSelectedPenyakitFilter(diseaseName);
    setSearchQuery('');
    setActiveTab('keluhan');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-teal-700 dark:text-teal-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Master Referensi Keluhan & Standarisasi ICD-10
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pemetaan otomatis keluhan ke diagnosa ICD-10 dan klasifikasi Menular / Tidak Menular
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border ${
                coveredPenyakitCount === penyakitList.length
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>
                Cakupan Penyakit: {coveredPenyakitCount}/{penyakitList.length}
              </span>
            </span>

            {duplicateKeluhanSet.size > 0 ? (
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{duplicateKeluhanSet.size} Keluhan Ganda</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                <CheckCircle className="w-3.5 h-3.5 text-teal-600" />
                <span>0 Duplikat Keluhan</span>
              </span>
            )}

            {activeTab === 'keluhan' ? (
              <button
                type="button"
                onClick={handleOpenAddRef}
                className="px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Keluhan ICD-10</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenAddPenyakit}
                className="px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Penyakit Baru</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab & Search Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('keluhan')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'keluhan'
                  ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Referensi Keluhan ({referensiList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('penyakit')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'penyakit'
                  ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Daftar Penyakit & Kategori ({penyakitList.length})
            </button>

            {activeTab === 'keluhan' && selectedPenyakitFilter && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-700 text-white text-[11px] font-semibold">
                <Filter className="w-3 h-3" />
                <span>Penyakit: {selectedPenyakitFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedPenyakitFilter('')}
                  className="hover:text-teal-200"
                  title="Hapus filter penyakit"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'keluhan' && (
              <select
                value={selectedPenyakitFilter}
                onChange={(e) => setSelectedPenyakitFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 max-w-[200px]"
              >
                <option value="">Semua Penyakit ({penyakitList.length})</option>
                {penyakitList.map((p) => (
                  <option key={p.id} value={p.penyakit}>
                    {p.penyakit} ({(refsByDiseaseMap.get(p.penyakit.trim().toLowerCase()) || []).length})
                  </option>
                ))}
              </select>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari keluhan / diagnosa..."
                className="pl-8 pr-3 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white w-56"
              />
            </div>
          </div>
        </div>
      </div>

      {/* TAB 1: REFERENSI KELUHAN TABLE */}
      {activeTab === 'keluhan' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold sticky top-0 z-20 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">No</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Keluhan Pasien</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Masuk ke Kolom Penyakit</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Kode ICD-10</th>
                  <th className="py-2.5 px-4">Nama Resmi Diagnosa ICD-10</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Jenis Penyakit</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Penggunaan</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredReferensi.map((r, idx) => {
                  const usage = r.kode_icd10 ? icdUsageCount[r.kode_icd10] || 0 : 0;
                  const isDup = duplicateKeluhanSet.has(r.keluhan.trim().toLowerCase());
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                        isDup ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      <td className="py-2 px-3 text-center text-slate-400 font-mono">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-4 font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{r.keluhan}</span>
                          {isDup && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                              GANDA
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 font-medium text-teal-800 dark:text-teal-300 whitespace-nowrap">
                        {r.masuk_penyakit || (
                          <span className="text-slate-400 italic">Dikosongkan</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          {r.kode_icd10 || '-'}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-slate-600 dark:text-slate-400">
                        {r.nama_icd10 || '-'}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.jenis === 'Menular'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {r.jenis}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700 dark:text-slate-300">
                        {usage > 0 ? `${usage}x` : '-'}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditRef(r)}
                            className="p-1 text-slate-500 hover:text-teal-700 rounded"
                            title="Edit keluhan ICD-10"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmRef(r)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Hapus keluhan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredReferensi.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Tidak ada referensi keluhan yang cocok dengan filter pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DAFTAR PENYAKIT & KATEGORI TABLE */}
      {activeTab === 'penyakit' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Perubahan Klasifikasi:</strong> Mengubah status 'Menular' atau 'Tidak Menular' di sini akan langsung
              berlaku ke seluruh data riwayat kunjungan dan rekapitulasi bulanan secara otomatis. Klik badge jumlah keluhan
              untuk melihat daftar keluhan & kode ICD-10 penyakit tersebut.
            </span>
          </div>

          <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold sticky top-0 z-20 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">No</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Kategori Diagnosa</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Nama Penyakit (Kolom Rekap)</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Kode ICD-10</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Keluhan Terpetakan</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Jenis Penyakit</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPenyakit.map((p, idx) => {
                  const mappedRefs = refsByDiseaseMap.get(p.penyakit.trim().toLowerCase()) || [];
                  const uniqueIcdCodes = Array.from(
                    new Set(mappedRefs.map((r) => r.kode_icd10).filter(Boolean))
                  );
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 text-center text-slate-400 font-mono">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-4 font-semibold text-teal-800 dark:text-teal-300">
                        {p.kategori}
                      </td>
                      <td className="py-2 px-4 font-bold text-slate-900 dark:text-white">
                        {p.penyakit}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {uniqueIcdCodes.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {uniqueIcdCodes.slice(0, 3).map((code) => (
                              <span
                                key={code}
                                className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                              >
                                {code}
                              </span>
                            ))}
                            {uniqueIcdCodes.length > 3 && (
                              <span className="text-slate-400">+{uniqueIcdCodes.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-rose-500 italic">Belum ada</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleJumpToDiseaseComplaints(p.penyakit)}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                            mappedRefs.length > 0
                              ? 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                          }`}
                          title="Klik untuk melihat/kelola keluhan penyakit ini"
                        >
                          {mappedRefs.length} keluhan
                        </button>
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.jenis === 'Menular'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {p.jenis}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenEditPenyakit(p)}
                          className="px-2 py-1 text-slate-600 hover:text-teal-700 hover:bg-slate-100 rounded text-xs flex items-center gap-1 ml-auto"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Ubah Jenis / Kategori</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL EDIT REFERENSI */}
      {modalRef.open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {modalRef.item ? 'Ubah Referensi Keluhan' : 'Tambah Referensi Keluhan'}
              </h3>
              <button
                type="button"
                onClick={() => setModalRef({ open: false })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRef} className="space-y-3">
              {refError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {refError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Keluhan Pasien *
                </label>
                <input
                  type="text"
                  required
                  value={formRef.keluhan || ''}
                  onChange={(e) => {
                    setFormRef({ ...formRef, keluhan: e.target.value });
                    if (refError) setRefError(null);
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Masuk ke Kolom Penyakit
                </label>
                <input
                  type="text"
                  list="penyakit-list-options"
                  value={formRef.masuk_penyakit || ''}
                  onChange={(e) => handleChangeMasukPenyakit(e.target.value)}
                  placeholder="Contoh: ISPA, Gastritis..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
                <datalist id="penyakit-list-options">
                  {penyakitList.map((p) => (
                    <option key={p.id} value={p.penyakit}>
                      {p.kategori} ({p.jenis})
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kode ICD-10
                  </label>
                  <input
                    type="text"
                    value={formRef.kode_icd10 || ''}
                    onChange={(e) => setFormRef({ ...formRef, kode_icd10: e.target.value })}
                    placeholder="Contoh: J06.9"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Jenis Penyakit
                  </label>
                  <select
                    value={formRef.jenis || 'Tidak Menular'}
                    onChange={(e) => setFormRef({ ...formRef, jenis: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="Tidak Menular">Tidak Menular</option>
                    <option value="Menular">Menular</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Resmi Diagnosa ICD-10
                </label>
                <input
                  type="text"
                  value={formRef.nama_icd10 || ''}
                  onChange={(e) => setFormRef({ ...formRef, nama_icd10: e.target.value })}
                  placeholder="Contoh: Infeksi saluran napas atas akut, tidak spesifik"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan
                </label>
                <input
                  type="text"
                  value={formRef.catatan || ''}
                  onChange={(e) => setFormRef({ ...formRef, catatan: e.target.value })}
                  placeholder="Opsional"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalRef({ open: false })}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS REFERENSI */}
      {deleteConfirmRef && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Hapus Referensi Keluhan?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Keluhan <strong>"{deleteConfirmRef.keluhan}"</strong> ({deleteConfirmRef.masuk_penyakit} /{' '}
                  {deleteConfirmRef.kode_icd10 || '-'}) akan dihapus dari daftar referensi.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteConfirmRef(null)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRef}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT PENYAKIT */}
      {modalPenyakit.open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {modalPenyakit.item ? 'Ubah Penyakit Master' : 'Tambah Penyakit Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalPenyakit({ open: false })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePenyakit} className="space-y-3">
              {penyakitError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {penyakitError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kategori Penyakit
                </label>
                <input
                  type="text"
                  list="kategori-list-options"
                  required
                  value={formPenyakit.kategori || ''}
                  onChange={(e) => setFormPenyakit({ ...formPenyakit, kategori: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
                <datalist id="kategori-list-options">
                  {uniqueCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Penyakit (Kolom Rekap) *
                </label>
                <input
                  type="text"
                  required
                  value={formPenyakit.penyakit || ''}
                  onChange={(e) => setFormPenyakit({ ...formPenyakit, penyakit: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Jenis Penyakit (Menular / Tidak Menular) *
                </label>
                <select
                  value={formPenyakit.jenis || 'Tidak Menular'}
                  onChange={(e) => setFormPenyakit({ ...formPenyakit, jenis: e.target.value as any })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-semibold"
                >
                  <option value="Tidak Menular">Tidak Menular</option>
                  <option value="Menular">Menular</option>
                </select>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Perubahan akan diterapkan secara instan ke seluruh laporan masa lalu dan kunjungan baru.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalPenyakit({ open: false })}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
