/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Calendar,
  User,
  Plus,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  Stethoscope,
  Trash2,
  Edit2,
  Printer,
  ChevronRight,
  Flame,
  Shield,
  X,
  FileText,
  Search,
  Pill,
  RefreshCw,
} from 'lucide-react';
import {
  CalculatedKunjungan,
  KunjunganItem,
  MasterObatItem,
  ReferensiItem,
  ResepObatItem,
  WbpItem,
} from '../types';
import {
  calculateUsia,
  dateToInputFormat,
  determineBlokByKamar,
  formatSetaraKotak,
  getTodayFormatted,
  getWitaTodayDate,
  inputFormatToDate,
  parseDate,
  store,
  useStoreSync,
} from '../lib/storage';
import { TOP_QUICK_CHIPS } from '../data/initialData';
import { confirmDialog, showToast } from '../lib/feedback';

interface DailyInputProps {
  onOpenMedicalRecord: (wbp: WbpItem) => void;
  onRefreshData?: () => void;
}

export default function DailyInput({ onOpenMedicalRecord }: DailyInputProps) {
  const storeVersion = useStoreSync();
  // Form fields
  const [tanggal, setTanggal] = useState<string>(getTodayFormatted());
  const [namaInput, setNamaInput] = useState<string>('');
  const [selectedWbp, setSelectedWbp] = useState<WbpItem | null>(null);
  const [keluhan1, setKeluhan1] = useState<string>('');
  const [keluhan2, setKeluhan2] = useState<string>('');
  const [keluhan3, setKeluhan3] = useState<string>('');
  const [kamar, setKamar] = useState<string>('');
  const [terapi, setTerapi] = useState<string>('');
  const [terapiManualTouched, setTerapiManualTouched] = useState<boolean>(false);
  const [resepItems, setResepItems] = useState<ResepObatItem[]>([]);
  const [obatSearch, setObatSearch] = useState<string>('');
  const [showObatDropdown, setShowObatDropdown] = useState<boolean>(false);

  // UI States
  const [searchSuggestions, setSearchSuggestions] = useState<WbpItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeComplaintDropdown, setActiveComplaintDropdown] = useState<1 | 2 | 3 | null>(null);
  const [showQuickChips, setShowQuickChips] = useState<boolean>(false);
  const [undoItem, setUndoItem] = useState<{ id: string; action: 'save' | 'delete'; data?: KunjunganItem } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Complaint modal state (Inline Referensi Adder)
  const [inlineRefModal, setInlineRefModal] = useState<{ open: boolean; targetSlot: 1 | 2 | 3; initialQuery: string }>({
    open: false,
    targetSlot: 1,
    initialQuery: '',
  });
  const [newKeluhanName, setNewKeluhanName] = useState('');
  const [newMasukPenyakit, setNewMasukPenyakit] = useState('');
  const [newKodeIcd10, setNewKodeIcd10] = useState('');
  const [newNamaIcd10, setNewNamaIcd10] = useState('');
  const [newJenis, setNewJenis] = useState<'Menular' | 'Tidak Menular'>('Tidak Menular');
  const [inlineRefError, setInlineRefError] = useState<string | null>(null);

  // Table filter state
  const [tableFilterDate, setTableFilterDate] = useState<string>(getTodayFormatted());
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'menular' | 'attention' | 'resep'>('all');

  // Refs for keyboard navigation
  const namaInputRef = useRef<HTMLInputElement>(null);
  const keluhan1InputRef = useRef<HTMLInputElement>(null);
  const terapiInputRef = useRef<HTMLInputElement>(null);

  // Data cache
  const [allKunjungan, setAllKunjungan] = useState<CalculatedKunjungan[]>([]);
  const [referensiList, setReferensiList] = useState<ReferensiItem[]>([]);
  const [wbpList, setWbpList] = useState<WbpItem[]>([]);
  const [masterObatList, setMasterObatList] = useState<MasterObatItem[]>([]);
  const [allResepList, setAllResepList] = useState<ResepObatItem[]>([]);
  const [pengaturan, setPengaturan] = useState(store.getPengaturan());

  const reloadData = () => {
    setAllKunjungan(store.getCalculatedKunjungan(false));
    setReferensiList(store.getReferensi());
    setWbpList(store.getWbpList());
    setMasterObatList(store.getMasterObatList(false));
    setAllResepList(store.getResepObatList());
    setPengaturan(store.getPengaturan());
  };

  useEffect(() => {
    reloadData();
  }, [storeVersion]);

  const [showAllLimit, setShowAllLimit] = useState<number>(100);

  useEffect(() => {
    setShowAllLimit(100);
  }, [tableFilterDate, tableSearch, tableStatusFilter]);

  const activeObatList = useMemo(() => masterObatList.filter((o) => o.aktif), [masterObatList]);

  const masterObatMap = useMemo(() => {
    const map = new Map<string, MasterObatItem>();
    for (let i = 0; i < masterObatList.length; i++) {
      map.set(masterObatList[i].id, masterObatList[i]);
    }
    return map;
  }, [masterObatList]);

  const resepByKunjunganId = useMemo(() => {
    const map = new Map<string, ResepObatItem[]>();
    allResepList.forEach((r) => {
      if (!r.kunjungan_id) return;
      if (!map.has(r.kunjungan_id)) map.set(r.kunjungan_id, []);
      map.get(r.kunjungan_id)!.push(r);
    });
    return map;
  }, [allResepList]);

  const formatResepSummary = (items: ResepObatItem[]): string => {
    return items
      .filter((i) => i.obat_id && Number(i.jumlah_diberikan) > 0)
      .map((item) => {
        const obat = masterObatMap.get(item.obat_id);
        const labelNama = item.obat_nama || (obat ? `${obat.nama} ${obat.kekuatan}`.trim() : 'Obat');
        const satuan = item.satuan_terkecil || obat?.satuan_terkecil || 'satuan';
        return `${labelNama} (${item.jumlah_diberikan} ${satuan})`;
      })
      .join('; ');
  };

  const syncTerapiFromResep = (items: ResepObatItem[], force = false) => {
    if (!force && terapiManualTouched) return;
    setTerapi(formatResepSummary(items));
  };

  const handleAddObatToResep = (obat: MasterObatItem) => {
    const alreadyExists = resepItems.some((r) => r.obat_id === obat.id);
    if (alreadyExists) {
      setToastMessage(`Obat "${obat.nama} ${obat.kekuatan}" sudah ada di daftar resep.`);
      setObatSearch('');
      setShowObatDropdown(false);
      return;
    }

    const newItem: ResepObatItem = {
      id: `resep-tmp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      kunjungan_id: editingVisitId || '',
      obat_id: obat.id,
      jumlah_diberikan: 1,
      is_manual_edited: true,
      nama_obat: obat.nama,
      obat_nama: `${obat.nama} ${obat.kekuatan}`.trim(),
      kekuatan: obat.kekuatan,
      obat_kekuatan: obat.kekuatan,
      satuan_terkecil: obat.satuan_terkecil,
      satuan: obat.satuan_terkecil,
      isi_per_kotak: obat.isi_per_kotak,
      isi_per_strip: obat.isi_per_strip ?? 0,
    };

    const next = [...resepItems, newItem];
    setResepItems(next);
    syncTerapiFromResep(next);
    setObatSearch('');
    setShowObatDropdown(false);
  };

  const handleUpdateResepItem = (idx: number, patch: Partial<ResepObatItem>) => {
    const next = resepItems.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    setResepItems(next);
    syncTerapiFromResep(next);
  };

  const handleRemoveResepItem = (idx: number) => {
    const next = resepItems.filter((_, i) => i !== idx);
    setResepItems(next);
    syncTerapiFromResep(next);
  };

  // Filter today's or selected date's visits (memoized to avoid re-sorting on every form keystroke)
  const baseFilteredVisits = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return allKunjungan
      .filter((k) => {
        const matchDate = tableFilterDate ? k.tanggal === tableFilterDate : true;
        if (!matchDate) return false;
        if (!q) return true;
        return (
          k.nama.toLowerCase().includes(q) ||
          (k.nik && k.nik.toLowerCase().includes(q)) ||
          (k.kamar && k.kamar.toLowerCase().includes(q)) ||
          (k.wbp?.blok && k.wbp.blok.toLowerCase().includes(q)) ||
          k.keluhan1.toLowerCase().includes(q) ||
          (k.keluhan2 && k.keluhan2.toLowerCase().includes(q)) ||
          (k.keluhan3 && k.keluhan3.toLowerCase().includes(q)) ||
          (k.penyakit1 && k.penyakit1.toLowerCase().includes(q)) ||
          (k.penyakit2 && k.penyakit2.toLowerCase().includes(q)) ||
          (k.penyakit3 && k.penyakit3.toLowerCase().includes(q)) ||
          (k.icd10_1 && k.icd10_1.toLowerCase().includes(q)) ||
          (k.icd10_2 && k.icd10_2.toLowerCase().includes(q)) ||
          (k.icd10_3 && k.icd10_3.toLowerCase().includes(q)) ||
          (k.terapi && k.terapi.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const timeA = a.dibuat_pada ? Date.parse(a.dibuat_pada) || 0 : 0;
        const timeB = b.dibuat_pada ? Date.parse(b.dibuat_pada) || 0 : 0;
        return timeB - timeA;
      });
  }, [allKunjungan, tableFilterDate, tableSearch]);

  const tableSummaryCounts = useMemo(() => {
    let menular = 0;
    let attention = 0;
    let resep = 0;
    for (let i = 0; i < baseFilteredVisits.length; i++) {
      const k = baseFilteredVisits[i];
      if (k.jenis1 === 'Menular' || k.jenis2 === 'Menular' || k.jenis3 === 'Menular') {
        menular += 1;
      }
      const hasUnmapped =
        (Boolean(k.keluhan1) && k.penyakit1 === 'CEK REFERENSI') ||
        (Boolean(k.keluhan2) && k.penyakit2 === 'CEK REFERENSI') ||
        (Boolean(k.keluhan3) && k.penyakit3 === 'CEK REFERENSI');
      if (k.is_duplicate || k.is_frequent || k.status_wbp === 'TIDAK DITEMUKAN' || hasUnmapped) {
        attention += 1;
      }
      if ((resepByKunjunganId.get(k.id)?.length || 0) > 0 || Boolean(k.terapi?.trim())) {
        resep += 1;
      }
    }
    return {
      total: baseFilteredVisits.length,
      menular,
      attention,
      resep,
    };
  }, [baseFilteredVisits, resepByKunjunganId]);

  const filteredVisits = useMemo(() => {
    if (tableStatusFilter === 'all') return baseFilteredVisits;
    return baseFilteredVisits.filter((k) => {
      if (tableStatusFilter === 'menular') {
        return k.jenis1 === 'Menular' || k.jenis2 === 'Menular' || k.jenis3 === 'Menular';
      }
      if (tableStatusFilter === 'attention') {
        const hasUnmapped =
          (Boolean(k.keluhan1) && k.penyakit1 === 'CEK REFERENSI') ||
          (Boolean(k.keluhan2) && k.penyakit2 === 'CEK REFERENSI') ||
          (Boolean(k.keluhan3) && k.penyakit3 === 'CEK REFERENSI');
        return k.is_duplicate || k.is_frequent || k.status_wbp === 'TIDAK DITEMUKAN' || hasUnmapped;
      }
      if (tableStatusFilter === 'resep') {
        return (resepByKunjunganId.get(k.id)?.length || 0) > 0 || Boolean(k.terapi?.trim());
      }
      return true;
    });
  }, [baseFilteredVisits, tableStatusFilter, resepByKunjunganId]);

  const displayedVisits = useMemo(() => {
    if (tableFilterDate) return filteredVisits;
    return filteredVisits.slice(0, showAllLimit);
  }, [filteredVisits, tableFilterDate, showAllLimit]);

  // Handle typing name
  const handleNamaChange = (val: string) => {
    setNamaInput(val);
    if (!val.trim()) {
      setSelectedWbp(null);
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const clean = val.trim().toLowerCase();
    const matches = wbpList.filter(
      (w) =>
        w.nama.toLowerCase().includes(clean) ||
        (w.nik && w.nik.toLowerCase().includes(clean)) ||
        (w.no_reg_instansi && w.no_reg_instansi.toLowerCase().includes(clean))
    );
    setSearchSuggestions(matches.slice(0, 6));
    setShowSuggestions(true);
  };

  const handleSelectWbp = (w: WbpItem) => {
    setSelectedWbp(w);
    setNamaInput(w.nama);
    setShowSuggestions(false);
    // Autofill Room with current room
    setKamar(w.kamar || w.kamar_sidb || '');
    // Focus to complaint
    setTimeout(() => {
      keluhan1InputRef.current?.focus();
    }, 100);
  };

  // Pre-save validations (memoized)
  const isDuplicateWarning = useMemo(() => {
    if (!selectedWbp && !namaInput.trim()) return false;
    const cleanName = namaInput.trim().toLowerCase();
    return allKunjungan.some(
      (k) =>
        k.tanggal === tanggal &&
        k.id !== editingVisitId &&
        ((selectedWbp && k.wbp_id === selectedWbp.id) || k.nama.trim().toLowerCase() === cleanName)
    );
  }, [allKunjungan, tanggal, editingVisitId, selectedWbp, namaInput]);

  const frequentWarning = useMemo(() => {
    const cleanName = namaInput.trim().toLowerCase();
    const patient = selectedWbp || wbpList.find((w) => w.nama.trim().toLowerCase() === cleanName);
    if (!patient) return null;
    const patientCleanName = patient.nama.trim().toLowerCase();
    const targetDate = parseDate(tanggal) || getWitaTodayDate();
    const targetMs = targetDate.getTime();
    const limitDays = pengaturan.periode_sering_hari || 7;
    const limitCount = pengaturan.batas_sering_berobat_kali || 7;
    const windowStart = targetMs - limitDays * 24 * 60 * 60 * 1000;

    let count = 0;
    for (let i = 0; i < allKunjungan.length; i++) {
      const k = allKunjungan[i];
      if (k.id === editingVisitId) continue;
      const isSame =
        (k.wbp_id && k.wbp_id === patient.id) || k.nama.trim().toLowerCase() === patientCleanName;
      if (!isSame) continue;
      const kDate = parseDate(k.tanggal);
      if (!kDate) continue;
      const t = kDate.getTime();
      if (t >= windowStart && t <= targetMs) {
        count += 1;
      }
    }

    if (count >= limitCount) {
      return { count, days: limitDays };
    }
    return null;
  }, [allKunjungan, wbpList, tanggal, editingVisitId, selectedWbp, namaInput, pengaturan]);

  // Check if any selected complaint is Contagious (Menular)
  const contagiousAlert = useMemo(() => {
    const complaints = [keluhan1, keluhan2, keluhan3].filter(Boolean);
    const contagiousFound: string[] = [];
    complaints.forEach((c) => {
      const resolved = store.resolveComplaint(c);
      if (resolved.jenis === 'Menular') {
        contagiousFound.push(`${c} (${resolved.penyakit})`);
      }
    });
    return contagiousFound.length > 0 ? contagiousFound : null;
  }, [keluhan1, keluhan2, keluhan3, storeVersion]);

  const obatSuggestions = useMemo(() => {
    if (!showObatDropdown) return [];
    const q = obatSearch.trim().toLowerCase();
    if (!q) return activeObatList.slice(0, 12);
    return activeObatList
      .filter(
        (o) =>
          o.nama.toLowerCase().includes(q) ||
          o.kekuatan.toLowerCase().includes(q) ||
          o.satuan_terkecil.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [showObatDropdown, obatSearch, activeObatList]);

  // Handle Quick Chips
  const handleQuickChip = (chip: string) => {
    if (!keluhan1) {
      setKeluhan1(chip);
    } else if (!keluhan2) {
      setKeluhan2(chip);
    } else if (!keluhan3) {
      setKeluhan3(chip);
    } else {
      setKeluhan1(chip);
    }
  };

  // Submit visit
  const handleSaveVisit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaInput.trim()) {
      showToast('Nama pasien wajib diisi.', 'warning');
      namaInputRef.current?.focus();
      return;
    }
    if (!keluhan1.trim()) {
      showToast('Keluhan 1 wajib diisi.', 'warning');
      keluhan1InputRef.current?.focus();
      return;
    }

    setSaveStatus('saving');

    const wbpIdToSave = selectedWbp ? selectedWbp.id : '';
    const validResep = resepItems.filter((r) => r.obat_id && Number(r.jumlah_diberikan) > 0);
    const finalTerapi = terapi.trim() || formatResepSummary(validResep);

    if (editingVisitId) {
      const updated = store.updateKunjungan(editingVisitId, {
        tanggal,
        wbp_id: wbpIdToSave,
        nama: selectedWbp ? selectedWbp.nama : namaInput.trim(),
        keluhan1: keluhan1.trim(),
        keluhan2: keluhan2.trim(),
        keluhan3: keluhan3.trim(),
        kamar: kamar.trim(),
        terapi: finalTerapi,
      });
      if (updated) {
        store.saveResepForKunjungan(editingVisitId, validResep);
        setToastMessage(`Kunjungan pasien ${namaInput} berhasil diperbarui.`);
        setEditingVisitId(null);
      }
    } else {
      const saved = store.addKunjungan({
        tanggal,
        wbp_id: wbpIdToSave,
        nama: selectedWbp ? selectedWbp.nama : namaInput.trim(),
        keluhan1: keluhan1.trim(),
        keluhan2: keluhan2.trim(),
        keluhan3: keluhan3.trim(),
        kamar: kamar.trim(),
        terapi: finalTerapi,
      });

      if (validResep.length > 0) {
        store.saveResepForKunjungan(saved.id, validResep);
      }

      setUndoItem({ id: saved.id, action: 'save' });
      setToastMessage(`Kunjungan ${saved.nama} tersimpan.`);
    }

    // Reset Form & Return focus to name
    setNamaInput('');
    setSelectedWbp(null);
    setKeluhan1('');
    setKeluhan2('');
    setKeluhan3('');
    setKamar('');
    setTerapi('');
    setTerapiManualTouched(false);
    setResepItems([]);
    setObatSearch('');
    setSaveStatus('saved');
    reloadData();

    setTimeout(() => {
      namaInputRef.current?.focus();
      setSaveStatus('idle');
    }, 200);
  };

  const handleEditVisit = (visit: CalculatedKunjungan) => {
    setEditingVisitId(visit.id);
    setTanggal(visit.tanggal);
    setNamaInput(visit.nama);
    const matched = wbpList.find((w) => w.id === visit.wbp_id || w.nama.toLowerCase() === visit.nama.toLowerCase());
    setSelectedWbp(matched || null);
    setKeluhan1(visit.keluhan1 || '');
    setKeluhan2(visit.keluhan2 || '');
    setKeluhan3(visit.keluhan3 || '');
    setKamar(visit.kamar || '');
    setTerapi(visit.terapi || '');
    const existingResep = store.getResepByKunjunganId(visit.id);
    setResepItems(existingResep);
    const generated = formatResepSummary(existingResep);
    setTerapiManualTouched(Boolean(visit.terapi && visit.terapi.trim() !== generated.trim()));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    namaInputRef.current?.focus();
  };

  const handleDeleteVisit = async (visit: CalculatedKunjungan) => {
    const ok = await confirmDialog({
      title: 'Hapus Kunjungan Pasien',
      message: `Hapus kunjungan pasien ${visit.nama} pada tanggal ${visit.tanggal}? Data masih dapat dipulihkan dari Kotak Sampah.`,
      confirmLabel: 'Hapus',
      tone: 'danger',
    });
    if (ok) {
      store.softDeleteKunjungan(visit.id);
      setUndoItem({ id: visit.id, action: 'delete' });
      setToastMessage(`Kunjungan ${visit.nama} dihapus.`);
      reloadData();
    }
  };

  const handleUndo = () => {
    if (!undoItem) return;
    if (undoItem.action === 'save') {
      store.permanentDeleteKunjungan(undoItem.id);
      setToastMessage('Penyimpanan kunjungan berhasil dibatalkan.');
    } else if (undoItem.action === 'delete') {
      store.restoreKunjungan(undoItem.id);
      setToastMessage('Kunjungan berhasil dipulihkan kembali.');
    }
    setUndoItem(null);
    reloadData();
  };

  // Open inline modal to add complaint to referensi
  const handleOpenInlineRef = (slot: 1 | 2 | 3, query: string) => {
    setInlineRefModal({ open: true, targetSlot: slot, initialQuery: query });
    setNewKeluhanName(query);
    setNewMasukPenyakit(query);
    setNewKodeIcd10('');
    setNewNamaIcd10('');
    setNewJenis('Tidak Menular');
    setInlineRefError(null);
  };

  const handleSaveInlineRef = (e: React.FormEvent) => {
    e.preventDefault();
    setInlineRefError(null);
    const cleanKeluhan = newKeluhanName.trim();
    const cleanPenyakit = newMasukPenyakit.trim();
    if (!cleanKeluhan || !cleanPenyakit) {
      setInlineRefError('Nama keluhan dan penyakit wajib diisi.');
      return;
    }

    const existing = referensiList.find(
      (r) => r.keluhan.trim().toLowerCase() === cleanKeluhan.toLowerCase()
    );
    if (existing) {
      if (inlineRefModal.targetSlot === 1) setKeluhan1(existing.keluhan);
      if (inlineRefModal.targetSlot === 2) setKeluhan2(existing.keluhan);
      if (inlineRefModal.targetSlot === 3) setKeluhan3(existing.keluhan);
      setInlineRefModal({ open: false, targetSlot: 1, initialQuery: '' });
      setToastMessage(
        `Keluhan "${existing.keluhan}" sudah terdaftar (${existing.masuk_penyakit} / ${existing.kode_icd10 || '-'}).`
      );
      return;
    }

    try {
      const added = store.addReferensi({
        keluhan: cleanKeluhan,
        masuk_penyakit: cleanPenyakit,
        kode_icd10: newKodeIcd10.trim() || 'R69',
        nama_icd10: newNamaIcd10.trim() || cleanPenyakit,
        jenis: newJenis,
      });

      if (inlineRefModal.targetSlot === 1) setKeluhan1(added.keluhan);
      if (inlineRefModal.targetSlot === 2) setKeluhan2(added.keluhan);
      if (inlineRefModal.targetSlot === 3) setKeluhan3(added.keluhan);

      setInlineRefModal({ open: false, targetSlot: 1, initialQuery: '' });
      reloadData();
    } catch (err: any) {
      setInlineRefError(err?.message || 'Gagal menambahkan referensi keluhan.');
    }
  };

  // Selected Patient Clinical Record preview (memoized so typing complaints/therapy doesn't recompute)
  const patientMedicalSummary = useMemo(
    () => (selectedWbp ? store.getPatientMedicalRecord(selectedWbp.id) : null),
    [selectedWbp, storeVersion]
  );

  return (
    <div className="space-y-6">
      {/* Toast Notification with Undo */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl border border-slate-700 flex items-center gap-3 animate-in fade-in duration-200">
          <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="text-xs">{toastMessage}</span>
          {undoItem && (
            <button
              type="button"
              onClick={handleUndo}
              className="ml-2 px-2 py-1 bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-semibold rounded flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Urungkan</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid: Form on Left, Medical Record on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form & Quick Chips */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {editingVisitId ? 'Ubah Data Kunjungan' : 'Form Input Kunjungan Harian Pasien'}
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Tekan Tab / Enter untuk berpindah & simpan</span>
              </div>
            </div>

            {/* LIVE PRE-SAVE WARNINGS */}
            <div className="space-y-2 mb-4">
              {isDuplicateWarning && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    <strong>Peringatan DUPLIKAT:</strong> Pasien ini sudah tercatat berkunjung pada tanggal {tanggal}.
                  </span>
                </div>
              )}

              {frequentWarning && (
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-800/80 text-purple-900 dark:text-purple-200 text-xs flex items-center gap-2 font-medium">
                  <Flame className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span>
                    <strong>Peringatan SERING BEROBAT:</strong> Pasien sudah berobat {frequentWarning.count} kali dalam{' '}
                    {frequentWarning.days} hari terakhir.
                  </span>
                </div>
              )}

              {contagiousAlert && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/80 text-rose-900 dark:text-rose-200 text-xs flex items-center gap-2 font-medium">
                  <Shield className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>
                    <strong>Penyakit Menular Terdeteksi:</strong> {contagiousAlert.join(', ')}. Periksa kebersihan dan
                    kondisi kamar/blok sekitar ({selectedWbp?.blok || '-'}, Kamar {kamar || selectedWbp?.kamar || '-'}).
                  </span>
                </div>
              )}
            </div>

            {/* Form */}
            <form onSubmit={handleSaveVisit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Tanggal */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Layanan
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={dateToInputFormat(tanggal)}
                      onChange={(e) => setTanggal(inputFormatToDate(e.target.value))}
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                {/* Nama Pasien (Search-as-you-type) */}
                <div className="sm:col-span-2 relative">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>Nama Pasien (WBP) *</span>
                    {selectedWbp && (
                      <span className="text-[11px] font-normal text-teal-600 dark:text-teal-400">
                        {selectedWbp.kategori} · Usia {calculateUsia(selectedWbp.tanggal_lahir)} thn
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      ref={namaInputRef}
                      type="text"
                      required
                      value={namaInput}
                      onChange={(e) => handleNamaChange(e.target.value)}
                      onFocus={() => namaInput.trim() && setShowSuggestions(true)}
                      placeholder="Ketik nama atau 4 digit NIK..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
                    />
                  </div>

                  {/* Suggestions dropdown */}
                  {showSuggestions && searchSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 z-30 max-h-56 overflow-y-auto">
                      {searchSuggestions.map((w) => {
                        const last4Nik = w.nik ? w.nik.slice(-4) : '----';
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => handleSelectWbp(w)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between transition-colors border-b last:border-0 border-slate-100 dark:border-slate-800"
                          >
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white">{w.nama}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                NIK: ...{last4Nik} · {w.blok} (Kamar {w.kamar})
                              </div>
                            </div>
                            <span
                              className="px-2 py-0.5 text-[10px] font-semibold rounded"
                              style={{
                                backgroundColor:
                                  w.batch_bpjs === 'Juli' ? '#FFFF99' :
                                  w.batch_bpjs === 'Agustus' ? '#9FC5E8' :
                                  w.batch_bpjs === 'September' ? '#B6D7A8' :
                                  w.batch_bpjs === 'Oktober' ? '#FFB3DA' :
                                  w.batch_bpjs === 'November' ? '#F9CB9C' : '#E2E8F0',
                                color: '#1E293B',
                              }}
                            >
                              {w.batch_bpjs}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Keluhan Section Header with Optional Quick Helper */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                    <span>Keluhan Utama Pasien (1-3 Keluhan)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickChips(!showQuickChips)}
                    className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:text-teal-800 flex items-center gap-1 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-950/30 transition-colors"
                  >
                    <span>⚡ {showQuickChips ? 'Tutup Pilihan Cepat' : 'Pilihan Cepat Populer'}</span>
                  </button>
                </div>

                {/* Collapsible Quick Chips (Only visible when requested) */}
                {showQuickChips && (
                  <div className="mb-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap gap-1.5">
                    {TOP_QUICK_CHIPS.map((chip) => {
                      const res = store.resolveComplaint(chip);
                      const isMenular = res.jenis === 'Menular';
                      return (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => {
                            handleQuickChip(chip);
                            setShowQuickChips(false);
                          }}
                          className={`px-2 py-0.5 text-xs rounded border transition-all flex items-center gap-1 ${
                            isMenular
                              ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <span>+ {chip}</span>
                          {isMenular && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Keluhan 1, 2, 3 Grid with Compact Floating Autocomplete */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Keluhan 1 */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Keluhan 1 *
                    </label>
                    {keluhan1 && (
                      <span className="text-[10px] text-teal-700 dark:text-teal-400 font-semibold truncate max-w-[130px]">
                        {store.resolveComplaint(keluhan1).penyakit || 'CEK REFERENSI'}
                      </span>
                    )}
                  </div>
                  <input
                    ref={keluhan1InputRef}
                    type="text"
                    required
                    value={keluhan1}
                    onChange={(e) => {
                      setKeluhan1(e.target.value);
                      setActiveComplaintDropdown(1);
                    }}
                    onFocus={() => {
                      if (keluhan1.trim().length >= 1) setActiveComplaintDropdown(1);
                    }}
                    onBlur={() => setTimeout(() => setActiveComplaintDropdown(null), 200)}
                    placeholder="Ketik keluhan 1..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
                  />

                  {/* Sleek Floating Suggestions (Max 5 items, only on typing) */}
                  {activeComplaintDropdown === 1 && keluhan1.trim().length >= 1 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 z-40 max-h-44 overflow-y-auto">
                      {referensiList
                        .filter(
                          (r) =>
                            r.keluhan.toLowerCase().includes(keluhan1.trim().toLowerCase()) ||
                            r.masuk_penyakit.toLowerCase().includes(keluhan1.trim().toLowerCase())
                        )
                        .slice(0, 5)
                        .map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setKeluhan1(r.keluhan);
                              setActiveComplaintDropdown(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-teal-50 dark:hover:bg-slate-800 flex items-center justify-between border-b last:border-0 border-slate-100 dark:border-slate-800 transition-colors"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{r.keluhan}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                r.jenis === 'Menular'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {r.masuk_penyakit} {r.jenis === 'Menular' ? '⚡' : ''}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}

                  {keluhan1 && store.resolveComplaint(keluhan1).penyakit === 'CEK REFERENSI' && (
                    <button
                      type="button"
                      onClick={() => handleOpenInlineRef(1, keluhan1)}
                      className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 font-semibold hover:underline block"
                    >
                      + Tambah "{keluhan1}" ke Referensi ICD-10
                    </button>
                  )}
                </div>

                {/* Keluhan 2 */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Keluhan 2
                    </label>
                    {keluhan2 && (
                      <span className="text-[10px] text-teal-700 dark:text-teal-400 font-semibold truncate max-w-[130px]">
                        {store.resolveComplaint(keluhan2).penyakit || 'CEK REFERENSI'}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={keluhan2}
                    onChange={(e) => {
                      setKeluhan2(e.target.value);
                      setActiveComplaintDropdown(2);
                    }}
                    onFocus={() => {
                      if (keluhan2.trim().length >= 1) setActiveComplaintDropdown(2);
                    }}
                    onBlur={() => setTimeout(() => setActiveComplaintDropdown(null), 200)}
                    placeholder="Opsional (misal: pilek)"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
                  />

                  {/* Sleek Floating Suggestions */}
                  {activeComplaintDropdown === 2 && keluhan2.trim().length >= 1 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 z-40 max-h-44 overflow-y-auto">
                      {referensiList
                        .filter(
                          (r) =>
                            r.keluhan.toLowerCase().includes(keluhan2.trim().toLowerCase()) ||
                            r.masuk_penyakit.toLowerCase().includes(keluhan2.trim().toLowerCase())
                        )
                        .slice(0, 5)
                        .map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setKeluhan2(r.keluhan);
                              setActiveComplaintDropdown(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-teal-50 dark:hover:bg-slate-800 flex items-center justify-between border-b last:border-0 border-slate-100 dark:border-slate-800 transition-colors"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{r.keluhan}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                r.jenis === 'Menular'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {r.masuk_penyakit} {r.jenis === 'Menular' ? '⚡' : ''}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}

                  {keluhan2 && store.resolveComplaint(keluhan2).penyakit === 'CEK REFERENSI' && (
                    <button
                      type="button"
                      onClick={() => handleOpenInlineRef(2, keluhan2)}
                      className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 font-semibold hover:underline block"
                    >
                      + Tambah "{keluhan2}" ke Referensi
                    </button>
                  )}
                </div>

                {/* Keluhan 3 */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Keluhan 3
                    </label>
                    {keluhan3 && (
                      <span className="text-[10px] text-teal-700 dark:text-teal-400 font-semibold truncate max-w-[130px]">
                        {store.resolveComplaint(keluhan3).penyakit || 'CEK REFERENSI'}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={keluhan3}
                    onChange={(e) => {
                      setKeluhan3(e.target.value);
                      setActiveComplaintDropdown(3);
                    }}
                    onFocus={() => {
                      if (keluhan3.trim().length >= 1) setActiveComplaintDropdown(3);
                    }}
                    onBlur={() => setTimeout(() => setActiveComplaintDropdown(null), 200)}
                    placeholder="Opsional (misal: demam)"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
                  />

                  {/* Sleek Floating Suggestions */}
                  {activeComplaintDropdown === 3 && keluhan3.trim().length >= 1 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 z-40 max-h-44 overflow-y-auto">
                      {referensiList
                        .filter(
                          (r) =>
                            r.keluhan.toLowerCase().includes(keluhan3.trim().toLowerCase()) ||
                            r.masuk_penyakit.toLowerCase().includes(keluhan3.trim().toLowerCase())
                        )
                        .slice(0, 5)
                        .map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setKeluhan3(r.keluhan);
                              setActiveComplaintDropdown(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-teal-50 dark:hover:bg-slate-800 flex items-center justify-between border-b last:border-0 border-slate-100 dark:border-slate-800 transition-colors"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{r.keluhan}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                r.jenis === 'Menular'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {r.masuk_penyakit} {r.jenis === 'Menular' ? '⚡' : ''}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}

                  {keluhan3 && store.resolveComplaint(keluhan3).penyakit === 'CEK REFERENSI' && (
                    <button
                      type="button"
                      onClick={() => handleOpenInlineRef(3, keluhan3)}
                      className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 font-semibold hover:underline block"
                    >
                      + Tambah "{keluhan3}" ke Referensi
                    </button>
                  )}
                </div>
              </div>

              {/* Kamar & Terapi */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Kamar Saat Kunjungan
                    </label>
                    {kamar.trim() && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        determineBlokByKamar(kamar) === 'Blok Atas'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : determineBlokByKamar(kamar) === 'Blok Bawah'
                          ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {determineBlokByKamar(kamar) || 'Tanpa Blok'}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={kamar}
                    onChange={(e) => setKamar(e.target.value)}
                    placeholder="Contoh: 1, 14, LANSIA, TAMPING"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                    {kamar.trim()
                      ? `Otomatis memperbarui Kamar & ${determineBlokByKamar(kamar) || 'Blok kosong'}`
                      : 'Otomatis: Blok Atas (Tamping, 8-14), Blok Bawah (Lansia, 1-7, Max)'}
                  </span>
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Ringkasan Terapi & Tindakan (Otomatis / Catatan Tambahan)
                    </label>
                    {resepItems.length > 0 && terapiManualTouched && (
                      <button
                        type="button"
                        onClick={() => {
                          setTerapiManualTouched(false);
                          syncTerapiFromResep(resepItems, true);
                        }}
                        className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Sinkronkan dari Obat</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={terapiInputRef}
                    type="text"
                    value={terapi}
                    onChange={(e) => {
                      setTerapi(e.target.value);
                      setTerapiManualTouched(true);
                    }}
                    placeholder="Otomatis terisi saat memilih obat di bawah, atau ketik tindakan..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              {/* RESEP OBAT TERSTRUKTUR (DARI MASTER OBAT) */}
              <div className="rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/40 dark:bg-teal-950/20 p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                        Pemberian Obat (Dari Master Obat)
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Pilih obat untuk menghitung pemakaian obat harian & bulanan otomatis
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 self-start sm:self-auto">
                    {resepItems.length} item obat dipilih
                  </span>
                </div>

                {/* Picker Obat: Search + Select */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-7 relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={obatSearch}
                      onChange={(e) => {
                        setObatSearch(e.target.value);
                        setShowObatDropdown(true);
                      }}
                      onFocus={() => setShowObatDropdown(true)}
                      onBlur={() => setTimeout(() => setShowObatDropdown(false), 180)}
                      placeholder="Ketik nama obat dari Master Obat (misal: Paracetamol, Amoxicillin)..."
                      className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />

                    {showObatDropdown && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 z-40 max-h-52 overflow-y-auto">
                        {obatSuggestions.map((o) => {
                          const selected = resepItems.some((r) => r.obat_id === o.id);
                          return (
                            <button
                              key={o.id}
                              type="button"
                              disabled={selected}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleAddObatToResep(o);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between border-b last:border-0 border-slate-100 dark:border-slate-800 transition-colors ${
                                selected
                                  ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/40'
                                  : 'hover:bg-teal-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white">{o.nama}</span>{' '}
                                <span className="text-teal-700 dark:text-teal-400 font-semibold">{o.kekuatan}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                {selected
                                  ? 'Sudah dipilih'
                                  : `${o.satuan_terkecil} · ${o.isi_per_strip && o.isi_per_strip > 1 ? `1 strip = ${o.isi_per_strip} · ` : ''}1 kotak = ${o.isi_per_kotak}`}
                              </span>
                            </button>
                          );
                        })}
                        {obatSuggestions.length === 0 && (
                          <div className="px-3 py-2 text-xs text-slate-400 text-center">
                            Obat tidak ditemukan di Master Obat aktif.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Direct Dropdown Selector (convenient on mobile/tablet) */}
                  <div className="sm:col-span-5">
                    <select
                      value=""
                      onChange={(e) => {
                        const found = activeObatList.find((o) => o.id === e.target.value);
                        if (found) handleAddObatToResep(found);
                      }}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="">+ Pilih Cepat dari Master Obat ({activeObatList.length})</option>
                      {activeObatList.map((o) => (
                        <option key={o.id} value={o.id} disabled={resepItems.some((r) => r.obat_id === o.id)}>
                          {o.nama} {o.kekuatan} ({o.satuan_terkecil})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Selected Medicines List (Default 1, without dosage fields) */}
                {resepItems.length > 0 && (
                  <div className="space-y-2">
                    {resepItems.map((item, idx) => {
                      const obat = masterObatMap.get(item.obat_id);
                      const namaObat = item.obat_nama || (obat ? `${obat.nama} ${obat.kekuatan}`.trim() : 'Obat Master');
                      const satuan = item.satuan_terkecil || obat?.satuan_terkecil || 'tablet';
                      const isiKotak = item.isi_per_kotak || obat?.isi_per_kotak || 1;
                      const isiStrip = item.isi_per_strip ?? obat?.isi_per_strip ?? 0;
                      const currentQty = Math.max(1, Number(item.jumlah_diberikan) || 1);

                      return (
                        <div
                          key={item.id || `${item.obat_id}-${idx}`}
                          className="p-2.5 sm:p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs"
                        >
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span className="w-5 h-5 rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 text-[11px] font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                              {namaObat}
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {formatSetaraKotak(currentQty, isiKotak, satuan, isiStrip)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                Jumlah:
                              </span>
                              <div className="flex items-center rounded-lg border border-teal-300 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateResepItem(idx, {
                                      jumlah_diberikan: Math.max(1, currentQty - 1),
                                    })
                                  }
                                  className="px-2 py-1 text-xs font-bold text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
                                  title="Kurangi jumlah"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={currentQty}
                                  onChange={(e) =>
                                    handleUpdateResepItem(idx, {
                                      jumlah_diberikan: Math.max(1, parseInt(e.target.value, 10) || 1),
                                    })
                                  }
                                  className="w-12 px-1 py-1 text-xs text-center font-mono font-bold bg-transparent text-teal-900 dark:text-teal-200 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateResepItem(idx, {
                                      jumlah_diberikan: currentQty + 1,
                                    })
                                  }
                                  className="px-2 py-1 text-xs font-bold text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
                                  title="Tambah jumlah"
                                >
                                  +
                                </button>
                              </div>
                              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                {satuan}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveResepItem(idx)}
                              title="Hapus obat ini"
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {editingVisitId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingVisitId(null);
                      setNamaInput('');
                      setSelectedWbp(null);
                      setKeluhan1('');
                      setKeluhan2('');
                      setKeluhan3('');
                      setKamar('');
                      setTerapi('');
                      setTerapiManualTouched(false);
                      setResepItems([]);
                      setObatSearch('');
                    }}
                    className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Batal Ubah
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saveStatus === 'saving'}
                  className="px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs rounded-lg transition-colors shadow-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>{editingVisitId ? 'Simpan Pembaruan' : 'Simpan Kunjungan (Enter)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Instant Patient Medical Record Drawer/Panel */}
        <div className="lg:col-span-5 xl:col-span-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs sticky top-20">
            {selectedWbp && patientMedicalSummary ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {selectedWbp.nama}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      NIK: {selectedWbp.nik || '-'} · Usia {calculateUsia(selectedWbp.tanggal_lahir)} thn
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedWbp.blok} / Kamar {selectedWbp.kamar}
                    </p>
                  </div>
                  <span
                    className="px-2 py-0.5 text-[10px] font-semibold rounded border"
                    style={{
                      backgroundColor:
                        selectedWbp.batch_bpjs === 'Juli' ? '#FFFF99' :
                        selectedWbp.batch_bpjs === 'Agustus' ? '#9FC5E8' :
                        selectedWbp.batch_bpjs === 'September' ? '#B6D7A8' :
                        selectedWbp.batch_bpjs === 'Oktober' ? '#FFB3DA' :
                        selectedWbp.batch_bpjs === 'November' ? '#F9CB9C' : '#E2E8F0',
                      color: '#1E293B',
                    }}
                  >
                    BPJS: {selectedWbp.batch_bpjs}
                  </span>
                </div>

                {/* Quick Clinical Dossier Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Berobat</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                      {patientMedicalSummary.totalVisits}x
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/50">
                    <div className="text-[10px] text-teal-700 dark:text-teal-400 uppercase font-semibold">Bulan Ini</div>
                    <div className="text-base font-bold text-teal-800 dark:text-teal-300 mt-0.5 font-mono">
                      {patientMedicalSummary.thisMonthVisitsCount}x
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Sebelumnya</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                      {patientMedicalSummary.previousVisitDaysAgo || 'Baru'}
                    </div>
                  </div>
                </div>

                {/* Contagious Summary This Month */}
                {patientMedicalSummary.contagiousIllnessesThisMonth.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-200">
                    <div className="font-semibold flex items-center gap-1.5 text-[11px]">
                      <Shield className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>Kasus Menular Bulan Ini ({patientMedicalSummary.contagiousIllnessesThisMonth.length}):</span>
                    </div>
                    <p className="mt-1 text-[11px] font-medium">
                      {patientMedicalSummary.contagiousIllnessesThisMonth.join(', ')}
                    </p>
                  </div>
                )}

                {/* Sakit Apa Saja Bulan Ini */}
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                    Sakit Bulan Ini (Frekuensi)
                  </div>
                  {patientMedicalSummary.sortedIllnesses.length > 0 ? (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {patientMedicalSummary.sortedIllnesses.map((item) => (
                        <div
                          key={item.penyakit}
                          className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-800/60"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {item.penyakit}
                            </span>
                            <span
                              className={`text-[9px] px-1 py-0.5 rounded font-semibold ${
                                item.jenis === 'Menular'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {item.jenis}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                            {item.count}x
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Belum ada catatan penyakit di bulan ini</p>
                  )}
                </div>

                {/* 10 Kedatangan Terakhir */}
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                    Riwayat 10 Kunjungan Terakhir
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {patientMedicalSummary.last10Visits.map((v) => (
                      <div
                        key={v.id}
                        className="p-2 rounded border border-slate-100 dark:border-slate-800 text-xs bg-slate-50/50 dark:bg-slate-800/40"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {v.tanggal}
                          </span>
                          <span>Kamar {v.kamar || '-'}</span>
                        </div>
                        <div className="text-xs text-slate-800 dark:text-slate-200 font-medium mt-1">
                          {[v.keluhan1, v.keluhan2, v.keluhan3].filter(Boolean).join(', ')}
                        </div>
                        {v.terapi && (
                          <div className="text-[11px] text-teal-700 dark:text-teal-400 mt-0.5 truncate">
                            Rx: {v.terapi}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* View Full Dossier / Print */}
                <button
                  type="button"
                  onClick={() => onOpenMedicalRecord(selectedWbp)}
                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-teal-600" />
                  <span>Buka Rekam Medis Lengkap & Cetak</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <Stethoscope className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Panel Rekam Medis Otomatis
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
                  Pilih atau cari nama warga binaan di formulir sebelah kiri untuk melihat riwayat kunjungan 10 kedatangan terakhir.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TODAY'S VISITS TABLE (Bottom section) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Table Toolbar */}
        <div className="px-4 py-3.5 sm:px-5 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                  Daftar Kunjungan Pasien
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <strong className="font-semibold text-slate-800 dark:text-slate-200">
                    {tableSummaryCounts.total}
                  </strong>{' '}
                  kunjungan
                  {tableSummaryCounts.menular > 0 && (
                    <>
                      {' · '}
                      <span className="text-rose-600 dark:text-rose-400 font-medium">
                        {tableSummaryCounts.menular} menular
                      </span>
                    </>
                  )}
                  {tableSummaryCounts.attention > 0 && (
                    <>
                      {' · '}
                      <span className="text-amber-700 dark:text-amber-400 font-medium">
                        {tableSummaryCounts.attention} perlu perhatian
                      </span>
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tableFilterDate
                  ? `Menampilkan catatan berobat tanggal ${tableFilterDate}`
                  : 'Menampilkan seluruh riwayat kunjungan terbaru'}
              </p>
            </div>

            {/* Date & Search Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-0.5">
                <button
                  type="button"
                  onClick={() => setTableFilterDate(getTodayFormatted())}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    tableFilterDate === getTodayFormatted()
                      ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilterDate('')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    tableFilterDate === ''
                      ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Semua Tanggal
                </button>
              </div>

              <div className="relative flex items-center">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="date"
                  aria-label="Filter tanggal kunjungan"
                  value={dateToInputFormat(tableFilterDate)}
                  onChange={(e) => setTableFilterDate(inputFormatToDate(e.target.value))}
                  className="pl-8 pr-2.5 py-1.5 text-xs font-mono tabular-nums bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600"
                />
              </div>

              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Cari nama, NIK, keluhan, ICD..."
                  className="w-full sm:w-56 pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600"
                />
                {tableSearch && (
                  <button
                    type="button"
                    onClick={() => setTableSearch('')}
                    title="Hapus pencarian"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Segmented Status Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'Semua', count: tableSummaryCounts.total },
                  { id: 'menular', label: 'Menular', count: tableSummaryCounts.menular },
                  { id: 'attention', label: 'Perlu Perhatian', count: tableSummaryCounts.attention },
                  { id: 'resep', label: 'Ada Terapi', count: tableSummaryCounts.resep },
                ] as const
              ).map((tab) => {
                const isActive = tableStatusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTableStatusFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors tabular-nums ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}{' '}
                    <span
                      className={`ml-1 ${
                        isActive ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {editingVisitId && (
              <span className="text-xs font-medium text-teal-700 dark:text-teal-400">
                Sedang mengubah 1 data kunjungan di formulir atas
              </span>
            )}
          </div>
        </div>

        {/* Desktop Data Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pl-4 pr-2 w-12 text-center">No</th>
                <th className="py-2.5 px-3 w-28 whitespace-nowrap">Tanggal</th>
                <th className="py-2.5 px-3 min-w-[210px]">Pasien (WBP)</th>
                <th className="py-2.5 px-3 min-w-[290px]">Keluhan &amp; Diagnosa (ICD-10)</th>
                <th className="py-2.5 px-3 min-w-[210px]">Terapi &amp; Obat</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                <th className="py-2.5 pl-3 pr-4 w-28 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {displayedVisits.length > 0 ? (
                displayedVisits.map((v, idx) => {
                  const rowResep = resepByKunjunganId.get(v.id) || [];
                  const autoTerapi = rowResep.length > 0 ? formatResepSummary(rowResep) : '';
                  const hasCustomTerapiNote = Boolean(
                    v.terapi && v.terapi.trim() && v.terapi.trim() !== autoTerapi.trim()
                  );
                  const isEditingRow = editingVisitId === v.id;
                  const complaintItems = [
                    v.keluhan1
                      ? {
                          slot: 1 as const,
                          keluhan: v.keluhan1,
                          penyakit: v.penyakit1,
                          icd10: v.icd10_1,
                          jenis: v.jenis1,
                        }
                      : null,
                    v.keluhan2
                      ? {
                          slot: 2 as const,
                          keluhan: v.keluhan2,
                          penyakit: v.penyakit2,
                          icd10: v.icd10_2,
                          jenis: v.jenis2,
                        }
                      : null,
                    v.keluhan3
                      ? {
                          slot: 3 as const,
                          keluhan: v.keluhan3,
                          penyakit: v.penyakit3,
                          icd10: v.icd10_3,
                          jenis: v.jenis3,
                        }
                      : null,
                  ].filter((item): item is NonNullable<typeof item> => item !== null);

                  const lokasiText = [v.wbp?.blok, v.kamar || v.wbp?.kamar ? `Kamar ${v.kamar || v.wbp?.kamar}` : null]
                    .filter(Boolean)
                    .join(' / ');
                  const nikText = v.wbp?.nik || v.nik;

                  return (
                    <tr
                      key={v.id}
                      className={`align-top transition-colors ${
                        isEditingRow
                          ? 'bg-teal-50/70 dark:bg-teal-950/25'
                          : 'bg-white dark:bg-slate-900 hover:bg-slate-50/90 dark:hover:bg-slate-800/45'
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2 text-center font-mono tabular-nums text-slate-400 dark:text-slate-500">
                        {idx + 1}
                      </td>

                      <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {v.tanggal}
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {v.wbp ? (
                            <button
                              type="button"
                              onClick={() => onOpenMedicalRecord(v.wbp!)}
                              title="Buka rekam medis pasien"
                              className="font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 text-left transition-colors"
                            >
                              {v.nama}
                            </button>
                          ) : (
                            <span className="font-semibold text-slate-900 dark:text-white">{v.nama}</span>
                          )}
                          {isEditingRow && (
                            <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                              · Diedit
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums leading-relaxed">
                          {nikText && <span className="font-mono">NIK {nikText}</span>}
                          {nikText && lokasiText && <span> · </span>}
                          {lokasiText && <span>{lokasiText}</span>}
                          {(nikText || lokasiText) && v.batch_bpjs && <span> · </span>}
                          {v.batch_bpjs && <span>BPJS {v.batch_bpjs}</span>}
                        </div>

                        {v.status_wbp === 'TIDAK DITEMUKAN' && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>Tidak ditemukan di master WBP</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div className="space-y-1.5">
                          {complaintItems.map((c) => {
                            const isUnmapped = c.penyakit === 'CEK REFERENSI';
                            const isContagious = c.jenis === 'Menular';
                            return (
                              <div key={c.slot} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 leading-snug">
                                <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                                  {c.slot}.
                                </span>
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {c.keluhan}
                                </span>
                                <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
                                  →
                                </span>
                                {isUnmapped ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenInlineRef(c.slot, c.keluhan)}
                                    title="Klik untuk memetakan keluhan ini ke referensi ICD-10"
                                    className="font-semibold text-rose-600 dark:text-rose-400 hover:underline text-left"
                                  >
                                    Belum terpetakan (+ Referensi)
                                  </button>
                                ) : (
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {c.penyakit}
                                  </span>
                                )}
                                {c.icd10 && c.icd10 !== 'CEK REFERENSI' && (
                                  <span className="font-mono text-[11px] text-teal-700 dark:text-teal-400">
                                    [{c.icd10}]
                                  </span>
                                )}
                                {isContagious && (
                                  <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                                    <Shield className="w-3 h-3 shrink-0" />
                                    <span>Menular</span>
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {rowResep.length > 0 || v.terapi ? (
                          <div className="space-y-1 leading-snug">
                            {rowResep.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-baseline justify-between gap-2 text-slate-800 dark:text-slate-200"
                              >
                                <span className="font-medium">{r.obat_nama || r.nama_obat}</span>
                                <span className="font-mono tabular-nums text-[11px] font-semibold text-teal-700 dark:text-teal-400 whitespace-nowrap">
                                  {r.jumlah_diberikan} {r.satuan_terkecil || r.satuan || 'pcs'}
                                </span>
                              </div>
                            ))}
                            {(rowResep.length === 0 ? Boolean(v.terapi?.trim()) : hasCustomTerapiNote) && (
                              <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                {v.terapi}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {v.is_duplicate || v.is_frequent ? (
                          <div className="space-y-1">
                            {v.is_duplicate && (
                              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Duplikat hari sama</span>
                              </div>
                            )}
                            {v.is_frequent && (
                              <div className="flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-400 tabular-nums">
                                <Flame className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  Sering ({v.frequent_count}x/{v.frequent_days}hr)
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Normal</span>
                        )}
                      </td>

                      <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          {v.wbp && (
                            <button
                              type="button"
                              onClick={() => onOpenMedicalRecord(v.wbp!)}
                              title="Rekam Medis Pasien"
                              aria-label={`Rekam medis ${v.nama}`}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEditVisit(v)}
                            title="Ubah Kunjungan"
                            aria-label={`Ubah kunjungan ${v.nama}`}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50 rounded-md transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVisit(v)}
                            title="Hapus Kunjungan"
                            aria-label={`Hapus kunjungan ${v.nama}`}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md transition-colors"
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
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Tidak ada kunjungan yang cocok dengan filter saat ini
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {tableSearch
                        ? `Tidak ditemukan data untuk kata kunci "${tableSearch}".`
                        : `Belum ada kunjungan tercatat${tableFilterDate ? ` pada tanggal ${tableFilterDate}` : ''}.`}
                    </p>
                    {(tableSearch || tableStatusFilter !== 'all' || tableFilterDate) && (
                      <div className="mt-3 flex items-center justify-center gap-2">
                        {(tableSearch || tableStatusFilter !== 'all') && (
                          <button
                            type="button"
                            onClick={() => {
                              setTableSearch('');
                              setTableStatusFilter('all');
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            Reset Pencarian &amp; Filter
                          </button>
                        )}
                        {tableFilterDate && (
                          <button
                            type="button"
                            onClick={() => setTableFilterDate('')}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-700 hover:bg-teal-800 text-white transition-colors"
                          >
                            Tampilkan Semua Tanggal
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Compact List View */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {displayedVisits.length > 0 ? (
            displayedVisits.map((v, idx) => {
              const rowResep = resepByKunjunganId.get(v.id) || [];
              const autoTerapi = rowResep.length > 0 ? formatResepSummary(rowResep) : '';
              const hasCustomTerapiNote = Boolean(
                v.terapi && v.terapi.trim() && v.terapi.trim() !== autoTerapi.trim()
              );
              const lokasiText = [v.wbp?.blok, v.kamar || v.wbp?.kamar ? `Kamar ${v.kamar || v.wbp?.kamar}` : null]
                .filter(Boolean)
                .join(' / ');

              return (
                <div
                  key={v.id}
                  className={`p-4 space-y-2.5 text-xs ${
                    editingVisitId === v.id ? 'bg-teal-50/70 dark:bg-teal-950/25' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-[11px] text-slate-400">#{idx + 1}</span>
                        {v.wbp ? (
                          <button
                            type="button"
                            onClick={() => onOpenMedicalRecord(v.wbp!)}
                            className="font-semibold text-sm text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 truncate text-left"
                          >
                            {v.nama}
                          </button>
                        ) : (
                          <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                            {v.nama}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                        <span className="font-mono">{v.tanggal}</span>
                        {lokasiText && <span> · {lokasiText}</span>}
                        {v.batch_bpjs && <span> · BPJS {v.batch_bpjs}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditVisit(v)}
                        title="Ubah Kunjungan"
                        className="p-1.5 text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 rounded-md"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteVisit(v)}
                        title="Hapus Kunjungan"
                        className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Complaints */}
                  <div className="space-y-1 text-xs">
                    {[
                      { slot: 1 as const, keluhan: v.keluhan1, penyakit: v.penyakit1, icd10: v.icd10_1, jenis: v.jenis1 },
                      { slot: 2 as const, keluhan: v.keluhan2, penyakit: v.penyakit2, icd10: v.icd10_2, jenis: v.jenis2 },
                      { slot: 3 as const, keluhan: v.keluhan3, penyakit: v.penyakit3, icd10: v.icd10_3, jenis: v.jenis3 },
                    ]
                      .filter((c) => Boolean(c.keluhan))
                      .map((c) => (
                        <div key={c.slot} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{c.keluhan}</span>
                          <span className="text-slate-400">→</span>
                          <span
                            className={
                              c.penyakit === 'CEK REFERENSI'
                                ? 'font-semibold text-rose-600 dark:text-rose-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }
                          >
                            {c.penyakit}
                          </span>
                          {c.icd10 && c.icd10 !== 'CEK REFERENSI' && (
                            <span className="font-mono text-[11px] text-teal-700 dark:text-teal-400">
                              [{c.icd10}]
                            </span>
                          )}
                          {c.jenis === 'Menular' && (
                            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                              · Menular
                            </span>
                          )}
                        </div>
                      ))}
                  </div>

                  {/* Therapy & Alerts */}
                  {(rowResep.length > 0 || v.terapi || v.is_duplicate || v.is_frequent || v.status_wbp === 'TIDAK DITEMUKAN') && (
                    <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1 text-[11px]">
                      {rowResep.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                          <span>{r.obat_nama || r.nama_obat}</span>
                          <span className="font-mono tabular-nums font-semibold text-teal-700 dark:text-teal-400">
                            {r.jumlah_diberikan} {r.satuan_terkecil || r.satuan || 'pcs'}
                          </span>
                        </div>
                      ))}
                      {(rowResep.length === 0 ? Boolean(v.terapi?.trim()) : hasCustomTerapiNote) && (
                        <div className="text-slate-500 dark:text-slate-400">Terapi: {v.terapi}</div>
                      )}
                      {(v.is_duplicate || v.is_frequent || v.status_wbp === 'TIDAK DITEMUKAN') && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                          {v.is_duplicate && (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              Duplikat hari sama
                            </span>
                          )}
                          {v.is_frequent && (
                            <span className="font-semibold text-violet-700 dark:text-violet-400 tabular-nums">
                              Sering ({v.frequent_count}x/{v.frequent_days}hr)
                            </span>
                          )}
                          {v.status_wbp === 'TIDAK DITEMUKAN' && (
                            <span className="font-semibold text-rose-600 dark:text-rose-400">
                              WBP tidak ditemukan
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-10 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
              Tidak ada kunjungan yang cocok dengan filter saat ini.
            </div>
          )}
        </div>

        {!tableFilterDate && filteredVisits.length > displayedVisits.length && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400 tabular-nums">
              Menampilkan <strong className="font-mono text-slate-900 dark:text-white">{displayedVisits.length}</strong> dari{' '}
              <strong className="font-mono text-slate-900 dark:text-white">{filteredVisits.length}</strong> riwayat kunjungan
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAllLimit((prev) => prev + 100)}
                className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold transition-colors"
              >
                Tampilkan 100 Lagi
              </button>
              <button
                type="button"
                onClick={() => setShowAllLimit(filteredVisits.length)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold transition-colors"
              >
                Tampilkan Semua
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL INLINE REFERENSI ADDER */}
      {inlineRefModal.open && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-teal-600" />
                <span>Tambah Keluhan ke Referensi ICD-10</span>
              </h3>
              <button
                type="button"
                onClick={() => setInlineRefModal({ open: false, targetSlot: 1, initialQuery: '' })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInlineRef} className="space-y-3">
              {inlineRefError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {inlineRefError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Keluhan Pasien *
                </label>
                <input
                  type="text"
                  required
                  value={newKeluhanName}
                  onChange={(e) => {
                    setNewKeluhanName(e.target.value);
                    if (inlineRefError) setInlineRefError(null);
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Masuk ke Penyakit (Kolom Rekap) *
                </label>
                <input
                  type="text"
                  required
                  value={newMasukPenyakit}
                  onChange={(e) => setNewMasukPenyakit(e.target.value)}
                  placeholder="Contoh: ISPA, Gastritis, Scabies..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kode ICD-10
                  </label>
                  <input
                    type="text"
                    value={newKodeIcd10}
                    onChange={(e) => setNewKodeIcd10(e.target.value)}
                    placeholder="Contoh: J06.9"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Jenis Penyakit *
                  </label>
                  <select
                    value={newJenis}
                    onChange={(e) => setNewJenis(e.target.value as any)}
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
                  value={newNamaIcd10}
                  onChange={(e) => setNewNamaIcd10(e.target.value)}
                  placeholder="Contoh: Infeksi saluran napas atas akut"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setInlineRefModal({ open: false, targetSlot: 1, initialQuery: '' })}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  Simpan ke Referensi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
