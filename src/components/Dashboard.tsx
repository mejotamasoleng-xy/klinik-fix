/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Stethoscope,
  AlertTriangle,
  Flame,
  Shield,
  Clock,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Activity,
  Search,
  X,
  Building2,
  Layers,
  ArrowRight,
  Copy,
  Check,
  HeartPulse,
  Pill,
  Plus,
  FileText,
  UserCheck,
  Grid3X3,
  ArrowUpDown,
} from 'lucide-react';
import {
  parseDate,
  parseDateMs,
  store,
  determineBlokByKamar,
  useStoreSync,
  getWitaDateParts,
  getWitaTodayDate,
  formatSetaraKotak,
  getEkspirasiStatus,
} from '../lib/storage';
import { copyToClipboard } from '../lib/feedback';
import { WbpItem, CalculatedKunjungan, PenyakitItem, ResepObatItem } from '../types';

interface DashboardProps {
  onNavigateToTab: (tab: any) => void;
  onSelectWbp: (wbp: WbpItem) => void;
}

interface DrillDownState {
  isOpen: boolean;
  title: string;
  subtitle: string;
  badgeLabel?: string;
  badgeColor?: string;
  visits: CalculatedKunjungan[];
  wbpList?: WbpItem[];
  isWbpMode?: boolean;
}

type FilterMode = 'hariIni' | 'bulan' | 'tahun' | 'custom';
type HeatmapMetric = 'kunjungan' | 'pasienUnik';
type ClinicFocusTab = 'sering' | 'bpjs';

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Pemetaan nama kategori resmi ke istilah klinik yang sederhana & mudah dipahami
function simplifyCategoryName(rawCategory: string): string {
  const upper = rawCategory.trim().toUpperCase();
  const map: Record<string, string> = {
    'PENYAKIT SALURAN PERNAPASAN': 'Saluran Napas (Batuk, Pilek, Sesak)',
    'PENYAKIT KULIT DAN JARINGAN BAWAH KULIT': 'Kulit & Gatal',
    'PENYAKIT SISTEM OTOT, TULANG DAN JARINGAN IKAT': 'Otot, Pegal & Sendi',
    'PENYAKIT SISTEM PENCERNAAN': 'Lambung & Pencernaan',
    'PENYAKIT SISTEM SARAF': 'Kepala & Saraf',
    'PENYAKIT MATA DAN ADNEKSA': 'Mata',
    'PENYAKIT SISTEM SIRKULASI': 'Tekanan Darah & Jantung',
    'PENYAKIT TELINGA DAN MASTOID': 'Telinga',
    'PENYAKIT INFEKSI DAN PARASIT TERTENTU': 'Infeksi & Penyakit Menular',
    'CEDERA, KERACUNAN DAN KONSEKUENSI LAIN': 'Luka & Cedera',
    'PENYAKIT RONGGA MULUT, KELENJAR LUDAH DAN RAHANG': 'Gigi & Mulut',
    'PENYAKIT SISTEM KEMIH DAN KELAMIN': 'Saluran Kemih',
    'GEJALA, TANDA DAN PENEMUAN KLINIS LAIN': 'Keluhan Umum (Demam, Lemas)',
    'PENYAKIT ENDOKRIN, NUTRISI DAN METABOLIK': 'Gula Darah & Gizi',
  };
  if (map[upper]) return map[upper];
  return rawCategory
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export default function Dashboard({ onNavigateToTab, onSelectWbp }: DashboardProps) {
  useStoreSync();

  const witaNow = getWitaDateParts();
  const currentYearNow = witaNow.year;
  const currentMonthNow = witaNow.month;
  const padDate = (n: number) => String(n).padStart(2, '0');
  const lastDayOfCurrentMonth = new Date(currentYearNow, currentMonthNow, 0).getDate();
  const defaultMonthStart = `${currentYearNow}-${padDate(currentMonthNow)}-01`;
  const defaultMonthEnd = `${currentYearNow}-${padDate(currentMonthNow)}-${padDate(lastDayOfCurrentMonth)}`;

  const [filterMode, setFilterMode] = useState<FilterMode>('bulan');
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthNow);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearNow);
  const [customStartDate, setCustomStartDate] = useState<string>(defaultMonthStart);
  const [customEndDate, setCustomEndDate] = useState<string>(defaultMonthEnd);
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>('kunjungan');
  const [clinicFocusTab, setClinicFocusTab] = useState<ClinicFocusTab>('sering');

  const [drillDown, setDrillDown] = useState<DrillDownState>({
    isOpen: false,
    title: '',
    subtitle: '',
    visits: [],
  });
  const [drillSearch, setDrillSearch] = useState<string>('');
  const [drillSort, setDrillSort] = useState<'terbaru' | 'terlama' | 'nama'>('terbaru');
  const [drillStatusFilter, setDrillStatusFilter] = useState<'semua' | 'menular' | 'perhatian'>('semua');
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!drillDown.isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrillDown((prev) => ({ ...prev, isOpen: false }));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [drillDown.isOpen]);

  const monthName = MONTHS[selectedMonth - 1];

  const periodeLabel = useMemo(() => {
    if (filterMode === 'hariIni') {
      const todayWita = getWitaDateParts();
      return `Hari Ini (${padDate(todayWita.day)} ${MONTHS[todayWita.month - 1]} ${todayWita.year})`;
    }
    if (filterMode === 'bulan') {
      return `${monthName} ${selectedYear}`;
    }
    if (filterMode === 'tahun') {
      return `Tahun ${selectedYear}`;
    }
    const startParts = customStartDate.split('-');
    const endParts = customEndDate.split('-');
    const formattedStart = startParts.length === 3 ? `${startParts[2]}/${startParts[1]}/${startParts[0]}` : customStartDate;
    const formattedEnd = endParts.length === 3 ? `${endParts[2]}/${endParts[1]}/${endParts[0]}` : customEndDate;
    return `${formattedStart} – ${formattedEnd}`;
  }, [filterMode, monthName, selectedYear, customStartDate, customEndDate]);

  const allVisits = store.getCalculatedKunjungan(false);
  const wbpList = store.getWbpList();
  const pengaturan = store.getPengaturan();
  const penyakitMaster = store.getPenyakit();
  const masterObatList = store.getMasterObatList(false);
  const allResepList = store.getResepObatList();

  const wbpLookups = useMemo(() => {
    const byId = new Map<string, WbpItem>();
    const byNik = new Map<string, WbpItem>();
    const byName = new Map<string, WbpItem>();
    for (const w of wbpList) {
      byId.set(w.id, w);
      if (w.nik && w.nik.trim()) byNik.set(w.nik.trim().toLowerCase(), w);
      if (w.nama && w.nama.trim()) byName.set(w.nama.trim().toLowerCase(), w);
    }
    return { byId, byNik, byName };
  }, [wbpList]);

  const resolveWbpForVisit = (v: CalculatedKunjungan): WbpItem | undefined => {
    if (v.wbp) return wbpLookups.byId.get(v.wbp.id) || v.wbp;
    if (v.wbp_id) {
      const hit = wbpLookups.byId.get(v.wbp_id);
      if (hit) return hit;
    }
    if (v.nik && v.nik.trim()) {
      const hit = wbpLookups.byNik.get(v.nik.trim().toLowerCase());
      if (hit) return hit;
    }
    if (v.nama && v.nama.trim()) {
      return wbpLookups.byName.get(v.nama.trim().toLowerCase());
    }
    return undefined;
  };

  const penyakitMasterMap = useMemo(() => {
    const map = new Map<string, PenyakitItem>();
    for (const p of penyakitMaster) {
      map.set(p.penyakit.trim().toLowerCase(), p);
    }
    const hpertensi = map.get('hpertensi');
    if (hpertensi && !map.has('hipertensi')) {
      map.set('hipertensi', hpertensi);
    }
    return map;
  }, [penyakitMaster]);

  const resepByKunjunganMap = useMemo(() => {
    const map = new Map<string, ResepObatItem[]>();
    for (const r of allResepList) {
      let arr = map.get(r.kunjungan_id);
      if (!arr) {
        arr = [];
        map.set(r.kunjungan_id, arr);
      }
      arr.push(r);
    }
    return map;
  }, [allResepList]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>([
      currentYearNow - 2,
      currentYearNow - 1,
      currentYearNow,
      currentYearNow + 1,
      selectedYear,
    ]);
    allVisits.forEach((k) => {
      const d = parseDate(k.tanggal);
      if (d && !isNaN(d.getTime())) {
        years.add(d.getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [allVisits, currentYearNow, selectedYear]);

  const activeVisits = useMemo(() => {
    const parseIsoLocal = (iso: string) => {
      const parts = iso.split('-').map(Number);
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
      return new Date(iso);
    };

    const todayWita = getWitaDateParts();
    const tYear = todayWita.year;
    const tMonth = todayWita.month - 1;
    const tDate = todayWita.day;

    return allVisits.filter((k) => {
      const d = parseDate(k.tanggal);
      if (!d) return false;

      if (filterMode === 'hariIni') {
        return d.getFullYear() === tYear && d.getMonth() === tMonth && d.getDate() === tDate;
      }
      if (filterMode === 'bulan') {
        return d.getFullYear() === selectedYear && d.getMonth() + 1 === selectedMonth;
      }
      if (filterMode === 'tahun') {
        return d.getFullYear() === selectedYear;
      }
      if (filterMode === 'custom') {
        if (!customStartDate || !customEndDate) return true;
        const start = parseIsoLocal(customStartDate);
        start.setHours(0, 0, 0, 0);
        const end = parseIsoLocal(customEndDate);
        end.setHours(23, 59, 59, 999);
        return d >= start && d <= end;
      }
      return true;
    });
  }, [allVisits, filterMode, selectedMonth, selectedYear, customStartDate, customEndDate]);

  const prevComparisonVisits = useMemo(() => {
    if (filterMode === 'hariIni') {
      const yesterday = getWitaTodayDate();
      yesterday.setDate(yesterday.getDate() - 1);
      return allVisits.filter((k) => {
        const d = parseDate(k.tanggal);
        return (
          d &&
          d.getFullYear() === yesterday.getFullYear() &&
          d.getMonth() === yesterday.getMonth() &&
          d.getDate() === yesterday.getDate()
        );
      });
    }
    if (filterMode === 'bulan') {
      const prevM = selectedMonth === 1 ? 12 : selectedMonth - 1;
      const prevY = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
      return allVisits.filter((k) => {
        const d = parseDate(k.tanggal);
        return d && d.getMonth() + 1 === prevM && d.getFullYear() === prevY;
      });
    }
    if (filterMode === 'tahun') {
      return allVisits.filter((k) => {
        const d = parseDate(k.tanggal);
        return d && d.getFullYear() === selectedYear - 1;
      });
    }
    return [];
  }, [allVisits, filterMode, selectedMonth, selectedYear]);

  const prevPeriodLabel = useMemo(() => {
    if (filterMode === 'hariIni') return 'kemarin';
    if (filterMode === 'bulan') return 'bulan lalu';
    if (filterMode === 'tahun') return 'tahun lalu';
    return '';
  }, [filterMode]);

  const currentMetrics = useMemo(() => store.calculateMetrics(activeVisits), [activeVisits]);
  const prevMetrics = useMemo(() => store.calculateMetrics(prevComparisonVisits), [prevComparisonVisits]);

  const totalKunjungan = currentMetrics.totalKunjungan;
  const pasienUnik = currentMetrics.pasienUnikCount;
  const kunjunganPerPasien = currentMetrics.kunjunganPerPasien.toFixed(1);
  const kunjunganDiff = totalKunjungan - prevMetrics.totalKunjungan;

  const serviceDays = useMemo(() => new Set(activeVisits.map((v) => v.tanggal)).size, [activeVisits]);
  const avgVisitsPerDayNum = serviceDays > 0 ? totalKunjungan / serviceDays : 0;
  const avgVisitsPerDay = avgVisitsPerDayNum.toFixed(1);

  const totalSemuaKasus = currentMetrics.totalDiagnosa;
  const totalKasusMenularCount = currentMetrics.totalDiagnosaMenular;
  const totalKasusTidakMenular = currentMetrics.totalDiagnosaTidakMenular;

  const contagiousVisits = useMemo(() => {
    return activeVisits.filter(
      (v) => v.jenis1 === 'Menular' || v.jenis2 === 'Menular' || v.jenis3 === 'Menular'
    );
  }, [activeVisits]);

  const nonContagiousVisits = useMemo(() => {
    return activeVisits.filter(
      (v) => v.jenis1 !== 'Menular' && v.jenis2 !== 'Menular' && v.jenis3 !== 'Menular'
    );
  }, [activeVisits]);

  const attentionVisits = useMemo(() => {
    return activeVisits.filter((v) => v.is_frequent || v.is_duplicate);
  }, [activeVisits]);

  const contagiousDiseaseBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    activeVisits.forEach((v) => {
      if (v.jenis1 === 'Menular' && v.penyakit1) counts[v.penyakit1] = (counts[v.penyakit1] || 0) + 1;
      if (v.jenis2 === 'Menular' && v.penyakit2) counts[v.penyakit2] = (counts[v.penyakit2] || 0) + 1;
      if (v.jenis3 === 'Menular' && v.penyakit3) counts[v.penyakit3] = (counts[v.penyakit3] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [activeVisits]);

  // =========================================================================
  // PETA KAMAR WARGA BINAAN (HEATMAP KAMAR & BLOK - BEBAS DUPLIKAT)
  // =========================================================================
  const roomHeatmapData = useMemo(() => {
    const normalizeKamar = (rawKamar: string | undefined | null) => {
      let cleaned = String(rawKamar || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (!cleaned) return null;

      cleaned = cleaned.replace(/^(?:kamar|kmr|ruang|rg|sel)\s+/i, '').trim();
      cleaned = cleaned.replace(/^(?:no\.?)\s*/i, '').trim();

      const lower = cleaned.toLowerCase();
      if (
        !lower ||
        lower === '-' ||
        lower === 'kosong' ||
        lower === 'tidak ada' ||
        lower === 'null' ||
        lower === 'undefined'
      ) {
        return null;
      }

      if (/^\d+$/.test(cleaned)) {
        const canonicalNum = String(parseInt(cleaned, 10));
        return { key: canonicalNum, label: canonicalNum };
      }

      if (/^(?:max|maks|maksimum|maximum)$/i.test(cleaned)) {
        return { key: 'MAXIMUM', label: 'MAXIMUM' };
      }

      const upperLabel = cleaned.toUpperCase();
      return { key: upperLabel, label: upperLabel };
    };

    const normalizeBlok = (rawBlok: string | undefined | null) => {
      const b = String(rawBlok || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (!b || b === '-' || b.toLowerCase() === 'kosong') return '';
      if (/atas/i.test(b)) return 'Blok Atas';
      if (/bawah/i.test(b)) return 'Blok Bawah';
      return b.replace(/\b\w/g, (ch) => ch.toUpperCase());
    };

    interface RoomAcc {
      key: string;
      blok: string;
      kamar: string;
      visits: CalculatedKunjungan[];
      visitIdSet: Set<string>;
      uniqueWbpSet: Set<string>;
      wbpInmates: WbpItem[];
      wbpIdSet: Set<string>;
      hasContagious: boolean;
    }

    const globalRoomsMap = new Map<string, RoomAcc>();

    const getOrCreateRoom = (
      rawKamar: string | undefined | null,
      fallbackBlok: string | undefined | null
    ): RoomAcc | null => {
      const norm = normalizeKamar(rawKamar);
      if (!norm) return null;

      const resolvedBlok = normalizeBlok(determineBlokByKamar(norm.label) || fallbackBlok);
      if (!resolvedBlok) return null;

      const existing = globalRoomsMap.get(norm.key);
      if (existing) {
        if (!existing.blok && resolvedBlok) existing.blok = resolvedBlok;
        return existing;
      }

      const created: RoomAcc = {
        key: norm.key,
        blok: resolvedBlok,
        kamar: norm.label,
        visits: [],
        visitIdSet: new Set<string>(),
        uniqueWbpSet: new Set<string>(),
        wbpInmates: [],
        wbpIdSet: new Set<string>(),
        hasContagious: false,
      };
      globalRoomsMap.set(norm.key, created);
      return created;
    };

    wbpList.forEach((w) => {
      const roomAcc = getOrCreateRoom(w.kamar || w.kamar_sidb, w.blok);
      if (!roomAcc) return;
      const wbpDedupKey = w.id || `${w.nik || ''}_${w.nama.trim().toLowerCase()}`;
      if (!roomAcc.wbpIdSet.has(wbpDedupKey)) {
        roomAcc.wbpIdSet.add(wbpDedupKey);
        roomAcc.wbpInmates.push(w);
      }
    });

    activeVisits.forEach((v) => {
      const roomAcc = getOrCreateRoom(v.kamar || v.wbp?.kamar, v.wbp?.blok);
      if (!roomAcc) return;
      if (!roomAcc.visitIdSet.has(v.id)) {
        roomAcc.visitIdSet.add(v.id);
        roomAcc.visits.push(v);
      }
      const pKey = store.getCanonicalPatientKey(v);
      if (pKey) {
        roomAcc.uniqueWbpSet.add(pKey);
      }
      if (v.jenis1 === 'Menular' || v.jenis2 === 'Menular' || v.jenis3 === 'Menular') {
        roomAcc.hasContagious = true;
      }
    });

    const blockMap = new Map<string, RoomAcc[]>();
    globalRoomsMap.forEach((roomAcc) => {
      if (!blockMap.has(roomAcc.blok)) {
        blockMap.set(roomAcc.blok, []);
      }
      blockMap.get(roomAcc.blok)!.push(roomAcc);
    });

    const sortRooms = (a: RoomAcc, b: RoomAcc) => {
      const numA = /^\d+$/.test(a.kamar) ? parseInt(a.kamar, 10) : NaN;
      const numB = /^\d+$/.test(b.kamar) ? parseInt(b.kamar, 10) : NaN;
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      if (!isNaN(numA)) return -1;
      if (!isNaN(numB)) return 1;
      return a.kamar.localeCompare(b.kamar, 'id', { numeric: true });
    };

    const sortedBlockNames = Array.from(blockMap.keys()).sort((a, b) => {
      if (/atas/i.test(a)) return -1;
      if (/atas/i.test(b)) return 1;
      if (/bawah/i.test(a)) return -1;
      if (/bawah/i.test(b)) return 1;
      return a.localeCompare(b);
    });

    return sortedBlockNames.map((bName) => {
      const sortedRoomAccs = (blockMap.get(bName) || []).sort(sortRooms);

      const rooms = sortedRoomAccs.map((item) => {
        const kCount = item.visits.length;
        const uCount = item.uniqueWbpSet.size;
        const totalPenghuni = item.wbpInmates.length;

        const compCounts: Record<string, number> = {};
        item.visits.forEach((v) => {
          [v.keluhan1, v.keluhan2, v.keluhan3].forEach((c) => {
            if (c && c !== '-') compCounts[c] = (compCounts[c] || 0) + 1;
          });
        });
        const topComplaints = Object.entries(compCounts)
          .sort((x, y) => y[1] - x[1])
          .slice(0, 2)
          .map(([n, cnt]) => `${n} (${cnt})`)
          .join(', ');

        return {
          blok: bName,
          kamar: item.kamar,
          visits: item.visits,
          kunjunganCount: kCount,
          uniquePatients: uCount,
          totalPenghuni,
          hasContagious: item.hasContagious,
          topComplaints: topComplaints || 'Tidak ada keluhan',
        };
      });

      const totalBlockKunjungan = rooms.reduce((acc, r) => acc + r.kunjunganCount, 0);
      const totalBlockUnik = new Set(
        sortedRoomAccs.flatMap((acc) => Array.from(acc.uniqueWbpSet))
      ).size;
      const totalBlockPenghuni = rooms.reduce((acc, r) => acc + r.totalPenghuni, 0);

      return {
        blockName: bName,
        rooms,
        totalBlockKunjungan,
        totalBlockUnik,
        totalBlockPenghuni,
      };
    });
  }, [wbpList, activeVisits]);

  // Kamar dengan kunjungan terbanyak atau kasus menular untuk sorotan cepat
  const priorityRooms = useMemo(() => {
    const allRooms = roomHeatmapData.flatMap((b) => b.rooms);
    return allRooms
      .filter((r) => r.kunjunganCount > 0 && (r.hasContagious || r.kunjunganCount >= 3))
      .sort((a, b) => {
        if (a.hasContagious !== b.hasContagious) return a.hasContagious ? -1 : 1;
        return b.kunjunganCount - a.kunjunganCount;
      })
      .slice(0, 5);
  }, [roomHeatmapData]);

  // Pemakaian Obat Periode Ini (data nyata dari resep_obat)
  const topMedicines = useMemo(() => {
    const activeVisitIds = new Set(activeVisits.map((v) => v.id));
    const obatMap = new Map(masterObatList.map((o) => [o.id, o]));
    const totals = new Map<
      string,
      {
        obatId: string;
        nama: string;
        satuan: string;
        isiPerKotak: number;
        isiPerStrip: number;
        totalQty: number;
        resepCount: number;
      }
    >();

    let totalResepItems = 0;

    allResepList.forEach((r) => {
      if (!activeVisitIds.has(r.kunjungan_id)) return;
      const qty = Number(r.jumlah_diberikan) || 0;
      if (qty <= 0) return;
      totalResepItems += 1;

      const obat = obatMap.get(r.obat_id);
      const nama = r.obat_nama || (obat ? `${obat.nama} ${obat.kekuatan}`.trim() : 'Obat');
      const satuan = r.satuan_terkecil || obat?.satuan_terkecil || 'pcs';
      const isiPerKotak = r.isi_per_kotak || obat?.isi_per_kotak || 1;
      const isiPerStrip = r.isi_per_strip ?? obat?.isi_per_strip ?? 0;

      const existing = totals.get(r.obat_id);
      if (existing) {
        existing.totalQty += qty;
        existing.resepCount += 1;
      } else {
        totals.set(r.obat_id, {
          obatId: r.obat_id,
          nama,
          satuan,
          isiPerKotak,
          isiPerStrip,
          totalQty: qty,
          resepCount: 1,
        });
      }
    });

    const list = Array.from(totals.values()).sort((a, b) => b.totalQty - a.totalQty);
    const maxQty = list[0]?.totalQty || 1;

    return {
      items: list.slice(0, 6).map((item) => ({
        ...item,
        widthPct: Math.max(8, Math.round((item.totalQty / maxQty) * 100)),
        setaraText: formatSetaraKotak(item.totalQty, item.isiPerKotak, item.satuan, item.isiPerStrip),
      })),
      totalJenisObat: list.length,
      totalResepItems,
    };
  }, [activeVisits, allResepList, masterObatList]);

  // Kelompok Penyakit Berdasarkan Bagian Tubuh (bahasa klinik yang sederhana)
  const categorySpectrum = useMemo(() => {
    const catMap: Record<string, { kasus: number; visits: CalculatedKunjungan[]; patientSet: Set<string> }> = {};

    activeVisits.forEach((v) => {
      const pKey = store.getCanonicalPatientKey(v);
      [v.penyakit1, v.penyakit2, v.penyakit3].forEach((p) => {
        if (p && p !== 'CEK REFERENSI' && p.trim()) {
          const matched = penyakitMasterMap.get(p.trim().toLowerCase());
          const cat = matched?.kategori || 'LAIN - LAIN';
          if (!catMap[cat]) {
            catMap[cat] = { kasus: 0, visits: [], patientSet: new Set() };
          }
          catMap[cat].kasus++;
          if (!catMap[cat].visits.some((existing) => existing.id === v.id)) {
            catMap[cat].visits.push(v);
          }
          if (pKey) catMap[cat].patientSet.add(pKey);
        }
      });
    });

    const list = Object.entries(catMap)
      .map(([catName, data]) => {
        const pctNum = totalSemuaKasus > 0 ? (data.kasus / totalSemuaKasus) * 100 : 0;
        return {
          catName,
          simpleName: simplifyCategoryName(catName),
          kasus: data.kasus,
          uniquePatients: data.patientSet.size,
          visits: data.visits,
          percentage: pctNum.toFixed(1),
          pctNum,
        };
      })
      .sort((a, b) => b.kasus - a.kasus);

    const maxKasus = list[0]?.kasus || 1;
    return list.map((item) => ({
      ...item,
      barWidthPct: Math.max(6, Math.round((item.kasus / maxKasus) * 100)),
    }));
  }, [activeVisits, totalSemuaKasus, penyakitMasterMap]);

  // Tren Kunjungan (Diagram Batang Ganda)
  const chartTrendData = useMemo(() => {
    const countUniquePatients = (list: CalculatedKunjungan[]) => {
      const set = new Set<string>();
      for (const v of list) {
        const k = store.getCanonicalPatientKey(v);
        if (k) set.add(k);
      }
      return set.size;
    };

    if (filterMode === 'hariIni') {
      const todayWita = getWitaDateParts();
      const todayStr = `${padDate(todayWita.day)}/${padDate(todayWita.month)}/${todayWita.year}`;
      return [
        {
          key: `today-${todayStr}`,
          label: `${padDate(todayWita.day)}/${padDate(todayWita.month)}`,
          tooltipTitle: `Hari Ini · ${todayStr}`,
          kunjungan: activeVisits.length,
          pasienUnik: countUniquePatients(activeVisits),
          visits: activeVisits,
        },
      ];
    }

    if (filterMode === 'bulan') {
      const stats = [];
      const days = new Date(selectedYear, selectedMonth, 0).getDate();
      for (let day = 1; day <= days; day++) {
        const dayVisits = activeVisits.filter((v) => {
          const d = parseDate(v.tanggal);
          return d && d.getDate() === day;
        });
        stats.push({
          key: `day-${day}`,
          label: `${day}`,
          tooltipTitle: `Tanggal ${day} ${monthName} ${selectedYear}`,
          kunjungan: dayVisits.length,
          pasienUnik: countUniquePatients(dayVisits),
          visits: dayVisits,
        });
      }
      return stats;
    }

    if (filterMode === 'tahun') {
      return MONTHS.map((mName, idx) => {
        const mNum = idx + 1;
        const mVisits = allVisits.filter((k) => {
          const d = parseDate(k.tanggal);
          return d && d.getFullYear() === selectedYear && d.getMonth() + 1 === mNum;
        });
        return {
          key: `month-${mNum}`,
          label: SHORT_MONTHS[idx],
          tooltipTitle: `Bulan ${mName} ${selectedYear}`,
          kunjungan: mVisits.length,
          pasienUnik: countUniquePatients(mVisits),
          visits: mVisits,
        };
      });
    }

    const dateMap = new Map<string, CalculatedKunjungan[]>();
    activeVisits.forEach((v) => {
      const t = v.tanggal || 'Tanpa Tanggal';
      if (!dateMap.has(t)) dateMap.set(t, []);
      dateMap.get(t)!.push(v);
    });

    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => {
      const da = parseDate(a)?.getTime() || 0;
      const db = parseDate(b)?.getTime() || 0;
      return da - db;
    });

    return sortedDates.map((dt) => {
      const vList = dateMap.get(dt) || [];
      const parts = dt.split('/');
      const shortLabel = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : dt;
      return {
        key: `custom-${dt}`,
        label: shortLabel,
        tooltipTitle: `Tanggal ${dt}`,
        kunjungan: vList.length,
        pasienUnik: countUniquePatients(vList),
        visits: vList,
      };
    });
  }, [filterMode, activeVisits, allVisits, selectedYear, selectedMonth, monthName]);

  const maxTrendValue = useMemo(() => {
    return Math.max(...chartTrendData.map((d) => Math.max(d.kunjungan, d.pasienUnik)), 5);
  }, [chartTrendData]);

  const peakTrendDay = useMemo(() => {
    let best: (typeof chartTrendData)[number] | null = null;
    for (const d of chartTrendData) {
      if (d.kunjungan > 0 && (!best || d.kunjungan > best.kunjungan)) {
        best = d;
      }
    }
    return best;
  }, [chartTrendData]);

  // Top 10 Penyakit Terbanyak
  const topDiseases = useMemo(() => {
    const diseaseList = Object.entries(currentMetrics.casesByDisease).map(([name, kasusCount]) => {
      const matched = penyakitMasterMap.get(name.trim().toLowerCase());
      const jenis = matched?.jenis || 'Tidak Menular';
      const patientSet = currentMetrics.patientsByDisease[name] || new Set();
      const pctKasus = totalKunjungan > 0 ? ((kasusCount / totalKunjungan) * 100).toFixed(1) : '0';

      const diseaseVisits = activeVisits.filter(
        (v) =>
          (v.penyakit1 && v.penyakit1.toLowerCase() === name.toLowerCase()) ||
          (v.penyakit2 && v.penyakit2.toLowerCase() === name.toLowerCase()) ||
          (v.penyakit3 && v.penyakit3.toLowerCase() === name.toLowerCase())
      );

      return {
        name,
        kategoriSimple: simplifyCategoryName(matched?.kategori || 'Umum'),
        kasus: kasusCount,
        pasienUnik: patientSet.size,
        jenis,
        percentage: pctKasus,
        visits: diseaseVisits,
      };
    });

    const sorted = diseaseList.sort((a, b) => b.kasus - a.kasus).slice(0, 10);
    const maxKasus = sorted[0]?.kasus || 1;
    return sorted.map((d) => ({
      ...d,
      barWidthPct: Math.max(8, Math.round((d.kasus / maxKasus) * 100)),
    }));
  }, [currentMetrics, totalKunjungan, activeVisits, penyakitMasterMap]);

  // Pasien paling sering berobat
  const topFrequentPatients = useMemo(() => {
    const map = new Map<
      string,
      { wbp?: WbpItem; nama: string; kunjunganCount: number; kamar: string; blok: string; visits: CalculatedKunjungan[] }
    >();

    activeVisits.forEach((v) => {
      const resolvedWbp = resolveWbpForVisit(v);
      const key = store.getCanonicalPatientKey(v) || v.id;
      if (!map.has(key)) {
        map.set(key, {
          wbp: resolvedWbp,
          nama: resolvedWbp?.nama || v.nama,
          kunjunganCount: 0,
          kamar: v.kamar || resolvedWbp?.kamar || '-',
          blok: resolvedWbp?.blok || '-',
          visits: [],
        });
      }
      map.get(key)!.kunjunganCount++;
      map.get(key)!.visits.push(v);
    });

    return Array.from(map.values())
      .sort((a, b) => b.kunjunganCount - a.kunjunganCount)
      .slice(0, 6);
  }, [activeVisits, wbpLookups]);

  // Ringkasan BPJS & Data WBP (untuk panel perhatian klinik)
  const bpjsSummary = useMemo(() => {
    const pendingList = wbpList.filter((w) => w.batch_bpjs === 'Belum masuk batch');
    const needCheckList = wbpList.filter((w) => w.perlu_dicek);
    const activeBatchList = wbpList.filter(
      (w) => w.batch_bpjs && w.batch_bpjs !== 'Belum masuk batch' && w.batch_bpjs !== 'Tidak masuk batch'
    );
    return {
      totalWbp: wbpList.length,
      activeBatchCount: activeBatchList.length,
      pendingList,
      needCheckList,
    };
  }, [wbpList]);

  // Rekap tahunan per bulan
  const monthlyAnnualSummary = useMemo(() => {
    const rows = MONTHS.map((mName, idx) => {
      const mNum = idx + 1;
      const mVisits = allVisits.filter((k) => {
        const d = parseDate(k.tanggal);
        return d && d.getFullYear() === selectedYear && d.getMonth() + 1 === mNum;
      });

      const metrics = store.calculateMetrics(mVisits);
      return {
        monthName: mName,
        monthNum: mNum,
        kunjungan: metrics.totalKunjungan,
        pasienUnik: metrics.pasienUnikCount,
        rasio: metrics.kunjunganPerPasien.toFixed(1),
        visits: mVisits,
      };
    });
    const maxK = Math.max(...rows.map((r) => r.kunjungan), 1);
    return rows.map((r) => ({
      ...r,
      barWidthPct: r.kunjungan > 0 ? Math.max(4, Math.round((r.kunjungan / maxK) * 100)) : 0,
    }));
  }, [allVisits, selectedYear]);

  const fullYearVisits = useMemo(() => {
    return allVisits.filter((k) => {
      const d = parseDate(k.tanggal);
      return d && d.getFullYear() === selectedYear;
    });
  }, [allVisits, selectedYear]);

  const fullYearMetrics = useMemo(() => store.calculateMetrics(fullYearVisits), [fullYearVisits]);

  const openDrillDownVisits = (
    title: string,
    subtitle: string,
    visits: CalculatedKunjungan[],
    badgeLabel?: string,
    badgeColor?: string
  ) => {
    setDrillSearch('');
    setDrillSort('terbaru');
    setDrillStatusFilter('semua');
    setDrillDown({
      isOpen: true,
      title,
      subtitle,
      badgeLabel,
      badgeColor,
      visits,
      isWbpMode: false,
    });
  };

  const openDrillDownWbp = (
    title: string,
    subtitle: string,
    list: WbpItem[],
    badgeLabel?: string,
    badgeColor?: string
  ) => {
    setDrillSearch('');
    setDrillSort('nama');
    setDrillStatusFilter('semua');
    setDrillDown({
      isOpen: true,
      title,
      subtitle,
      badgeLabel,
      badgeColor,
      visits: [],
      wbpList: list,
      isWbpMode: true,
    });
  };

  const setQuickRange = (preset: '7hari' | '30hari' | 'bulanIni' | 'tahunIni') => {
    const today = getWitaTodayDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    setFilterMode('custom');
    if (preset === '7hari') {
      const past = getWitaTodayDate();
      past.setDate(today.getDate() - 7);
      setCustomStartDate(toIso(past));
      setCustomEndDate(toIso(today));
    } else if (preset === '30hari') {
      const past = getWitaTodayDate();
      past.setDate(today.getDate() - 30);
      setCustomStartDate(toIso(past));
      setCustomEndDate(toIso(today));
    } else if (preset === 'bulanIni') {
      const start = new Date(selectedYear, selectedMonth - 1, 1);
      const end = new Date(selectedYear, selectedMonth, 0);
      setCustomStartDate(toIso(start));
      setCustomEndDate(toIso(end));
    } else if (preset === 'tahunIni') {
      const start = new Date(selectedYear, 0, 1);
      const end = new Date(selectedYear, 11, 31);
      setCustomStartDate(toIso(start));
      setCustomEndDate(toIso(end));
    }
  };

  const filteredVisits = useMemo(() => {
    let list = drillDown.visits;

    if (drillStatusFilter === 'menular') {
      list = list.filter(
        (v) => v.jenis1 === 'Menular' || v.jenis2 === 'Menular' || v.jenis3 === 'Menular'
      );
    } else if (drillStatusFilter === 'perhatian') {
      list = list.filter((v) => v.is_frequent || v.is_duplicate);
    }

    if (drillSearch.trim()) {
      const q = drillSearch.toLowerCase();
      list = list.filter((v) => {
        const resepItems = resepByKunjunganMap.get(v.id) || [];
        const resepText = resepItems.map((r) => r.obat_nama || r.nama_obat || '').join(' ').toLowerCase();
        return (
          v.nama.toLowerCase().includes(q) ||
          (v.wbp?.no_reg_instansi || '').toLowerCase().includes(q) ||
          (v.wbp?.blok || '').toLowerCase().includes(q) ||
          (v.kamar || '').toLowerCase().includes(q) ||
          (v.penyakit1 || '').toLowerCase().includes(q) ||
          (v.penyakit2 || '').toLowerCase().includes(q) ||
          (v.penyakit3 || '').toLowerCase().includes(q) ||
          (v.keluhan1 || '').toLowerCase().includes(q) ||
          (v.icd10_1 || '').toLowerCase().includes(q) ||
          (v.terapi || '').toLowerCase().includes(q) ||
          resepText.includes(q)
        );
      });
    }

    const sorted = [...list];
    if (drillSort === 'nama') {
      sorted.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    } else if (drillSort === 'terlama') {
      sorted.sort((a, b) => (parseDateMs(a.tanggal) || 0) - (parseDateMs(b.tanggal) || 0));
    } else {
      sorted.sort((a, b) => (parseDateMs(b.tanggal) || 0) - (parseDateMs(a.tanggal) || 0));
    }
    return sorted;
  }, [drillDown.visits, drillSearch, drillStatusFilter, drillSort, resepByKunjunganMap]);

  const filteredWbpList = useMemo(() => {
    if (!drillDown.wbpList) return [];
    let list = drillDown.wbpList;
    if (drillSearch.trim()) {
      const q = drillSearch.toLowerCase();
      list = list.filter((w) => {
        return (
          w.nama.toLowerCase().includes(q) ||
          w.nik.toLowerCase().includes(q) ||
          w.no_reg_instansi.toLowerCase().includes(q) ||
          w.blok.toLowerCase().includes(q) ||
          w.kamar.toLowerCase().includes(q) ||
          (w.kendala_bpjs || '').toLowerCase().includes(q) ||
          (w.batch_bpjs || '').toLowerCase().includes(q)
        );
      });
    }
    return [...list].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [drillDown.wbpList, drillSearch]);

  const drillSummary = useMemo(() => {
    if (drillDown.isWbpMode) {
      const pending = filteredWbpList.filter((w) => w.batch_bpjs === 'Belum masuk batch').length;
      const flagged = filteredWbpList.filter((w) => w.perlu_dicek).length;
      return { total: filteredWbpList.length, pending, flagged };
    }
    const uniqueSet = new Set<string>();
    let menularCount = 0;
    let perhatianCount = 0;
    filteredVisits.forEach((v) => {
      const pk = store.getCanonicalPatientKey(v);
      if (pk) uniqueSet.add(pk);
      if (v.jenis1 === 'Menular' || v.jenis2 === 'Menular' || v.jenis3 === 'Menular') {
        menularCount += 1;
      }
      if (v.is_frequent || v.is_duplicate) {
        perhatianCount += 1;
      }
    });
    return {
      total: filteredVisits.length,
      uniquePatients: uniqueSet.size,
      menularCount,
      perhatianCount,
    };
  }, [drillDown.isWbpMode, filteredWbpList, filteredVisits]);

  const handleCopyDrilldownText = async () => {
    let text = `${drillDown.title}\n${drillDown.subtitle}\n`;
    text += `=================================================\n`;
    if (drillDown.isWbpMode && drillDown.wbpList) {
      filteredWbpList.forEach((w, idx) => {
        text += `${idx + 1}. ${w.nama} (Reg: ${w.no_reg_instansi || '-'}) | NIK: ${w.nik || '-'} | Blok: ${w.blok} Kamar ${w.kamar} | BPJS: ${w.batch_bpjs || '-'}${w.kendala_bpjs ? ` | Kendala: ${w.kendala_bpjs}` : ''}\n`;
      });
    } else {
      filteredVisits.forEach((v, idx) => {
        const resepItems = resepByKunjunganMap.get(v.id) || [];
        const obatText =
          resepItems.length > 0
            ? resepItems
                .map(
                  (r) =>
                    `${r.obat_nama || r.nama_obat} (${r.jumlah_diberikan} ${r.satuan_terkecil || r.satuan || 'satuan'})`
                )
                .join(', ')
            : v.terapi || '-';
        text += `${idx + 1}. [${v.tanggal}] ${v.nama} (${v.wbp?.blok || '-'} Kamar ${v.kamar || '-'}) | Keluhan: ${v.keluhan1} | Diagnosa: ${v.penyakit1} | Obat: ${obatText}\n`;
      });
    }

    const ok = await copyToClipboard(text, 'Daftar rincian disalin ke clipboard');
    if (ok) {
      setCopiedSuccess(true);
      window.setTimeout(() => setCopiedSuccess(false), 2000);
    }
  };

  const pctMenular = totalSemuaKasus > 0 ? ((totalKasusMenularCount / totalSemuaKasus) * 100).toFixed(1) : '0';
  const pctTidakMenular = totalSemuaKasus > 0 ? ((totalKasusTidakMenular / totalSemuaKasus) * 100).toFixed(1) : '100';

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* HEADER & FILTER PERIODE                                               */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Ringkasan Layanan Klinik
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Pantauan kunjungan pasien, sebaran kamar, penyakit terbanyak, dan pengeluaran obat ·{' '}
              <span className="font-semibold text-teal-700 dark:text-teal-400">{periodeLabel}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
              {(
                [
                  { id: 'hariIni', label: 'Hari Ini' },
                  { id: 'bulan', label: 'Per Bulan' },
                  { id: 'tahun', label: '1 Tahun' },
                  { id: 'custom', label: 'Pilih Tanggal' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilterMode(item.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    filterMode === item.id
                      ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 font-semibold shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onNavigateToTab('input')}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Catat Kunjungan</span>
            </button>
          </div>
        </div>

        {/* Sub-kontrol periode aktif */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {filterMode === 'hariIni' && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="font-semibold text-slate-900 dark:text-white">{periodeLabel}</span>
              <span className="text-slate-400">·</span>
              <span className="tabular-nums">
                {totalKunjungan} kunjungan dari {pasienUnik} warga binaan
              </span>
            </div>
          )}

          {filterMode === 'bulan' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Bulan &amp; Tahun:</span>
              <div className="inline-flex items-center bg-slate-50 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  aria-label="Bulan sebelumnya"
                  onClick={() => {
                    if (selectedMonth === 1) {
                      setSelectedMonth(12);
                      setSelectedYear((y) => y - 1);
                    } else {
                      setSelectedMonth((m) => m - 1);
                    }
                  }}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <select
                  aria-label="Pilih bulan"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-2 py-1 text-xs font-semibold bg-transparent text-slate-900 dark:text-white focus:outline-none"
                >
                  {MONTHS.map((m, idx) => (
                    <option key={m} value={idx + 1} className="dark:bg-slate-900">
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Bulan berikutnya"
                  onClick={() => {
                    if (selectedMonth === 12) {
                      setSelectedMonth(1);
                      setSelectedYear((y) => y + 1);
                    } else {
                      setSelectedMonth((m) => m + 1);
                    }
                  }}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <select
                aria-label="Pilih tahun"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-3 py-1.5 text-xs font-semibold tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          {filterMode === 'tahun' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tahun Laporan:</span>
              <select
                aria-label="Pilih tahun"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-3 py-1.5 text-xs font-semibold tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    Tahun {y}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Gabungan data Januari – Desember {selectedYear}
              </span>
            </div>
          )}

          {filterMode === 'custom' && (
            <div className="flex flex-wrap items-center gap-2.5 w-full">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Dari:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Sampai:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                {(
                  [
                    { id: '7hari', label: '7 Hari' },
                    { id: '30hari', label: '30 Hari' },
                    { id: 'bulanIni', label: 'Bulan Ini' },
                    { id: 'tahunIni', label: 'Tahun Ini' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setQuickRange(preset.id)}
                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 text-slate-700 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:block">
            Klik angka, grafik, kamar, atau nama penyakit untuk melihat daftar pasien
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 5 RINGKASAN UTAMA KLINIK (UNIFIED STRIP WITH HAIRLINE DIVIDERS)       */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          {/* 1. Total Kunjungan */}
          <button
            type="button"
            onClick={() =>
              openDrillDownVisits(
                `Semua Kunjungan (${periodeLabel})`,
                `Menampilkan ${totalKunjungan} catatan kunjungan pasien`,
                activeVisits,
                'Total Kunjungan',
                'bg-teal-700 text-white'
              )
            }
            className="p-4 sm:p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Total Kunjungan</span>
              <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {totalKunjungan}
              </span>
              {prevPeriodLabel && prevComparisonVisits.length > 0 && (
                <span
                  className={`text-[11px] font-medium tabular-nums ${
                    kunjunganDiff > 0
                      ? 'text-teal-700 dark:text-teal-400'
                      : kunjunganDiff < 0
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'text-slate-400'
                  }`}
                >
                  {kunjunganDiff > 0 ? `+${kunjunganDiff}` : kunjunganDiff} vs {prevPeriodLabel}
                </span>
              )}
            </div>
            <div className="mt-1.5 text-[11px] text-teal-700 dark:text-teal-400 font-medium group-hover:underline">
              Lihat daftar kunjungan →
            </div>
          </button>

          {/* 2. Orang yang Berobat */}
          <button
            type="button"
            onClick={() =>
              openDrillDownVisits(
                `Warga Binaan yang Berobat (${periodeLabel})`,
                `Tercatat ${pasienUnik} orang berbeda dari total ${totalKunjungan} kunjungan`,
                activeVisits,
                `${pasienUnik} Orang`,
                'bg-indigo-600 text-white'
              )
            }
            className="p-4 sm:p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Orang yang Berobat</span>
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {pasienUnik}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                rata-rata {kunjunganPerPasien}x/orang
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-indigo-700 dark:text-indigo-400 font-medium group-hover:underline">
              Lihat daftar pasien →
            </div>
          </button>

          {/* 3. Rata-rata Harian */}
          <div className="p-4 sm:p-5 text-left">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Rata-rata Harian</span>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {avgVisitsPerDay}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">pasien / hari</span>
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {serviceDays} hari layanan tercatat
            </div>
          </div>

          {/* 4. Penyakit Menular */}
          <button
            type="button"
            onClick={() =>
              openDrillDownVisits(
                `Kasus Penyakit Menular (${periodeLabel})`,
                `Menampilkan ${contagiousVisits.length} kunjungan dengan keluhan penyakit menular`,
                contagiousVisits,
                'Menular',
                'bg-rose-600 text-white'
              )
            }
            className="p-4 sm:p-5 text-left hover:bg-rose-50/40 dark:hover:bg-rose-950/20 transition-colors group"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Kasus Menular</span>
              <Shield
                className={`w-4 h-4 ${
                  totalKasusMenularCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                }`}
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold font-mono tabular-nums ${
                  totalKasusMenularCount > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {totalKasusMenularCount}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {pctMenular}% ({contagiousVisits.length} kunjungan)
              </span>
            </div>
            <div className="mt-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400 group-hover:underline">
              {totalKasusMenularCount > 0 ? 'Periksa pasien & kamar →' : 'Tidak ada kasus menular'}
            </div>
          </button>

          {/* 5. Perlu Perhatian (Sering Berobat / Dobel) */}
          <button
            type="button"
            onClick={() =>
              openDrillDownVisits(
                `Pasien Perlu Perhatian (${periodeLabel})`,
                `Kunjungan dengan catatan sering berobat (>= ${pengaturan.batas_sering_berobat_kali}x/${pengaturan.periode_sering_hari} hari) atau kunjungan ganda di hari sama`,
                attentionVisits,
                'Perlu Perhatian',
                'bg-amber-600 text-white'
              )
            }
            className="col-span-2 lg:col-span-1 p-4 sm:p-5 text-left hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors group"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Perlu Perhatian</span>
              <AlertTriangle
                className={`w-4 h-4 ${
                  attentionVisits.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                }`}
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold font-mono tabular-nums ${
                  attentionVisits.length > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {attentionVisits.length}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                sering berobat / dobel
              </span>
            </div>
            <div className="mt-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 group-hover:underline">
              {attentionVisits.length > 0 ? 'Lihat daftar pasien →' : 'Semua kunjungan normal'}
            </div>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TREN KUNJUNGAN (DIPERTAHANKAN & DIPERJELAS)                           */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Tren Kunjungan &amp; Orang yang Berobat
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              Periode {periodeLabel}
              {peakTrendDay && (
                <>
                  {' · '}
                  Hari paling ramai:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {peakTrendDay.tooltipTitle} ({peakTrendDay.kunjungan} kunjungan)
                  </strong>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-teal-600" />
              <span className="text-slate-700 dark:text-slate-300">Total Kunjungan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-indigo-500" />
              <span className="text-slate-700 dark:text-slate-300">Orang Berbeda</span>
            </div>
            {avgVisitsPerDayNum > 0 && chartTrendData.length > 1 && (
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 tabular-nums">
                <span className="w-4 border-t border-dashed border-amber-500" />
                <span>Rata-rata ({avgVisitsPerDay}/hari)</span>
              </div>
            )}
          </div>
        </div>

        {/* Chart Area */}
        <div className="relative pt-6">
          {/* Y-Axis Guides + Average Line */}
          <div className="flex gap-2">
            <div className="w-7 h-52 flex flex-col justify-between text-[10px] font-mono tabular-nums text-slate-400 text-right pr-1 select-none">
              <span>{maxTrendValue}</span>
              <span>{Math.round(maxTrendValue / 2)}</span>
              <span>0</span>
            </div>

            <div className="relative flex-1 h-52 flex items-end gap-1 sm:gap-1.5 pb-2 border-b border-l border-slate-200 dark:border-slate-800 pl-1.5">
              {/* Subtle horizontal mid gridline */}
              <div className="absolute left-0 right-0 top-1/2 border-t border-slate-100 dark:border-slate-800/80 pointer-events-none" />

              {/* Daily average dashed reference line */}
              {avgVisitsPerDayNum > 0 && chartTrendData.length > 1 && maxTrendValue > 0 && (
                <div
                  style={{
                    bottom: `${Math.min(96, Math.max(4, (avgVisitsPerDayNum / maxTrendValue) * 100))}%`,
                  }}
                  className="absolute left-0 right-0 border-t border-dashed border-amber-500/70 pointer-events-none z-10"
                />
              )}

              {chartTrendData.map((d) => {
                const hKunjungan = maxTrendValue > 0 ? (d.kunjungan / maxTrendValue) * 100 : 0;
                const hPasien = maxTrendValue > 0 ? (d.pasienUnik / maxTrendValue) * 100 : 0;
                const hasData = d.kunjungan > 0 || d.pasienUnik > 0;

                return (
                  <div
                    key={d.key}
                    onClick={() => {
                      if (hasData) {
                        openDrillDownVisits(
                          d.tooltipTitle,
                          `Menampilkan ${d.kunjungan} kunjungan (${d.pasienUnik} orang berbeda)`,
                          d.visits,
                          d.label,
                          'bg-teal-700 text-white'
                        );
                      }
                    }}
                    className={`flex-1 flex flex-col items-center h-full justify-end group relative ${
                      hasData ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    {hasData && (
                      <div className="absolute -top-14 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 pointer-events-none z-30 whitespace-nowrap shadow-lg border border-slate-700">
                        <div className="font-semibold text-slate-100">{d.tooltipTitle}</div>
                        <div className="flex items-center gap-2.5 mt-0.5 tabular-nums">
                          <span className="text-teal-300">{d.kunjungan} kunjungan</span>
                          <span className="text-indigo-300">{d.pasienUnik} orang</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-end justify-center gap-0.5 w-full h-full pb-0.5">
                      <div
                        style={{ height: `${Math.max(hKunjungan, d.kunjungan > 0 ? 7 : 2)}%` }}
                        className={`flex-1 max-w-[13px] rounded-t transition-colors ${
                          d.kunjungan > 0
                            ? 'bg-teal-600 group-hover:bg-teal-500'
                            : 'bg-slate-100 dark:bg-slate-800/40'
                        }`}
                      />
                      <div
                        style={{ height: `${Math.max(hPasien, d.pasienUnik > 0 ? 7 : 2)}%` }}
                        className={`flex-1 max-w-[13px] rounded-t transition-colors ${
                          d.pasienUnik > 0
                            ? 'bg-indigo-500 group-hover:bg-indigo-400'
                            : 'bg-slate-100 dark:bg-slate-800/40'
                        }`}
                      />
                    </div>

                    <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono tabular-nums truncate max-w-full">
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PETA KAMAR HUNIAN (DIPERTAHANKAN & DITINGKATKAN)                      */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Peta Kamar Warga Binaan Sakit
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sebaran keluhan per blok dan kamar hunian · Klik kotak kamar untuk melihat daftar pasiennya
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setHeatmapMetric('kunjungan')}
                className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                  heatmapMetric === 'kunjungan'
                    ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 font-semibold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Jumlah Kunjungan
              </button>
              <button
                type="button"
                onClick={() => setHeatmapMetric('pasienUnik')}
                className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                  heatmapMetric === 'pasienUnik'
                    ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 font-semibold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Jumlah Orang Sakit
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700" />
                0
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800" />
                1–2
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800" />
                3–5
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-600" />
                &ge; 6
              </span>
            </div>
          </div>
        </div>

        {/* Sorotan Cepat Kamar yang Perlu Dipantau */}
        {priorityRooms.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300 mr-1">
              Kamar perlu pantauan:
            </span>
            {priorityRooms.map((r) => (
              <button
                key={`${r.blok}-${r.kamar}`}
                type="button"
                onClick={() =>
                  openDrillDownVisits(
                    `Kamar ${r.kamar} (${r.blok})`,
                    `Menampilkan ${r.kunjunganCount} kunjungan (${r.uniquePatients} orang) dari Kamar ${r.kamar}`,
                    r.visits,
                    `Kamar ${r.kamar}`,
                    r.hasContagious ? 'bg-rose-600 text-white' : 'bg-teal-700 text-white'
                  )
                }
                className={`px-2.5 py-1 rounded-md text-xs font-medium tabular-nums inline-flex items-center gap-1.5 border transition-colors ${
                  r.hasContagious
                    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                }`}
              >
                {r.hasContagious && <Shield className="w-3 h-3 shrink-0" />}
                <span>
                  Kamar {r.kamar} ({r.kunjunganCount}x{r.hasContagious ? ' · Menular' : ''})
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Blok & Kotak Kamar */}
        <div className="space-y-4">
          {roomHeatmapData.map((b) => (
            <div
              key={b.blockName}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/25"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 text-xs">
                  <Building2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span className="font-bold text-slate-900 dark:text-white">{b.blockName}</span>
                  <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                    · {b.rooms.length} kamar · {b.totalBlockPenghuni} penghuni
                  </span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  Total:{' '}
                  <strong className="font-mono text-teal-700 dark:text-teal-400">
                    {b.totalBlockKunjungan} kunjungan
                  </strong>{' '}
                  ({b.totalBlockUnik} orang)
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {b.rooms.map((r) => {
                  const val = heatmapMetric === 'kunjungan' ? r.kunjunganCount : r.uniquePatients;

                  let colorClass =
                    'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300';
                  let valClass = 'text-slate-400 dark:text-slate-500 font-mono';
                  if (val >= 6) {
                    colorClass = 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700';
                    valClass = 'text-white font-mono font-bold';
                  } else if (val >= 3) {
                    colorClass =
                      'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 hover:border-amber-400';
                    valClass = 'text-amber-800 dark:text-amber-300 font-mono font-bold';
                  } else if (val >= 1) {
                    colorClass =
                      'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 hover:border-emerald-400';
                    valClass = 'text-emerald-800 dark:text-emerald-300 font-mono font-bold';
                  }

                  return (
                    <div
                      key={r.kamar}
                      onClick={() => {
                        if (r.kunjunganCount > 0) {
                          openDrillDownVisits(
                            `Kamar ${r.kamar} (${b.blockName})`,
                            `Menampilkan ${r.kunjunganCount} kunjungan (${r.uniquePatients} orang) dari Kamar ${r.kamar} · Keluhan terbanyak: ${r.topComplaints}`,
                            r.visits,
                            `Kamar ${r.kamar}`,
                            r.hasContagious ? 'bg-rose-600 text-white' : 'bg-teal-700 text-white'
                          );
                        }
                      }}
                      className={`p-2.5 rounded-lg border transition-colors flex flex-col justify-between group ${colorClass} ${
                        r.kunjunganCount > 0 ? 'cursor-pointer' : 'cursor-default opacity-80'
                      }`}
                      title={`${b.blockName} - Kamar ${r.kamar}: ${r.kunjunganCount} kunjungan, ${r.uniquePatients} orang.${
                        r.hasContagious ? ' Ada kasus penyakit menular.' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-semibold truncate">Kmr {r.kamar}</span>
                        {r.hasContagious && (
                          <span
                            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                              val >= 6 ? 'text-rose-100' : 'text-rose-600 dark:text-rose-400'
                            }`}
                            title="Ada penyakit menular di kamar ini"
                          >
                            <Shield className="w-3 h-3 shrink-0" />
                          </span>
                        )}
                      </div>

                      <div className="my-1 flex items-baseline justify-between tabular-nums">
                        <span className={`text-lg leading-none ${valClass}`}>{val}</span>
                        {r.totalPenghuni > 0 && (
                          <span className="text-[10px] opacity-70">/{r.totalPenghuni}</span>
                        )}
                      </div>

                      <div className="text-[10px] truncate opacity-75">
                        {r.kunjunganCount > 0 ? r.topComplaints : 'Tidak ada sakit'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PERBANDINGAN MENULAR VS TIDAK MENULAR (RINGKAS & LANGSUNG)            */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Penyakit Menular vs Tidak Menular
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Memantau penyakit yang berisiko menular di dalam kamar hunian (flu, gatal kulit, diare)
            </p>
          </div>
          <div className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
            Total {totalSemuaKasus} keluhan terdiagnosis
          </div>
        </div>

        {/* Bar Proporsi */}
        <div className="space-y-2">
          <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
            <div
              style={{ width: `${pctMenular}%` }}
              className="bg-rose-500 h-full transition-all duration-300"
            />
            <div
              style={{ width: `${pctTidakMenular}%` }}
              className="bg-teal-600 h-full transition-all duration-300"
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            <span>
              Menular: <strong className="font-mono text-rose-600 dark:text-rose-400">{totalKasusMenularCount}</strong> ({pctMenular}%)
            </span>
            <span>
              Tidak Menular: <strong className="font-mono text-teal-700 dark:text-teal-400">{totalKasusTidakMenular}</strong> ({pctTidakMenular}%)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() =>
              openDrillDownVisits(
                'Daftar Kasus Penyakit Menular',
                `Menampilkan ${contagiousVisits.length} kunjungan penyakit menular (${periodeLabel})`,
                contagiousVisits,
                'Menular',
                'bg-rose-600 text-white'
              )
            }
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-800 bg-slate-50/50 dark:bg-slate-800/30 text-left transition-colors group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                  <Shield className="w-4 h-4" />
                  <span>Penyakit Menular</span>
                </span>
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400 group-hover:underline">
                  Lihat pasien →
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2 tabular-nums">
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                  {totalKasusMenularCount}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  kasus ({contagiousVisits.length} kunjungan)
                </span>
              </div>
              <div className="mt-2.5 text-xs text-slate-600 dark:text-slate-300">
                {contagiousDiseaseBreakdown.length > 0 ? (
                  <span>
                    Terbanyak:{' '}
                    {contagiousDiseaseBreakdown
                      .slice(0, 3)
                      .map(([name, count]) => `${name} (${count})`)
                      .join(' · ')}
                  </span>
                ) : (
                  <span className="text-slate-400">Tidak ada kasus menular pada periode ini.</span>
                )}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              openDrillDownVisits(
                'Daftar Kasus Penyakit Tidak Menular',
                `Menampilkan ${nonContagiousVisits.length} kunjungan penyakit tidak menular (${periodeLabel})`,
                nonContagiousVisits,
                'Tidak Menular',
                'bg-teal-700 text-white'
              )
            }
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-800 bg-slate-50/50 dark:bg-slate-800/30 text-left transition-colors group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-400">
                  <HeartPulse className="w-4 h-4" />
                  <span>Penyakit Tidak Menular</span>
                </span>
                <span className="text-xs font-medium text-teal-700 dark:text-teal-400 group-hover:underline">
                  Lihat pasien →
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2 tabular-nums">
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                  {totalKasusTidakMenular}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  kasus ({nonContagiousVisits.length} kunjungan)
                </span>
              </div>
              <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400">
                Termasuk pegal/nyeri otot, sakit maag/lambung, tekanan darah tinggi, dan sakit kepala biasa.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BARIS INFORMASI KLINIK: PEMAKAIAN OBAT + KELUHAN PER BAGIAN TUBUH     */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pemakaian Obat Terbanyak */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Pill className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Pemakaian Obat Terbanyak
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  {topMedicines.totalJenisObat > 0
                    ? `${topMedicines.totalJenisObat} jenis obat keluar dari ${topMedicines.totalResepItems} resep pada periode ini`
                    : 'Pengeluaran obat berdasarkan resep kunjungan'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToTab('laporan_obat')}
                className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
              >
                Laporan Obat →
              </button>
            </div>

            {topMedicines.items.length > 0 ? (
              <div className="space-y-3">
                {topMedicines.items.map((med, idx) => (
                  <div key={med.obatId} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        <span className="font-mono text-slate-400 mr-1.5">{idx + 1}.</span>
                        {med.nama}
                      </div>
                      <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap shrink-0">
                        {med.totalQty} {med.satuan}
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${med.widthPct}%` }}
                        className="h-full bg-teal-600 dark:bg-teal-500 rounded-full"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>Diberikan pada {med.resepCount} kunjungan</span>
                      <span>Setara: {med.setaraText}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center space-y-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Belum ada catatan pengeluaran obat pada periode ini
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Pilih obat saat mengisi formulir Input Harian agar pemakaian obat tercatat otomatis di sini.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Keluhan per Bagian Tubuh */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Keluhan per Bagian Tubuh
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Kelompok keluhan terbanyak · Klik baris untuk melihat nama pasien
              </p>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
              {totalSemuaKasus} kasus
            </span>
          </div>

          {categorySpectrum.length > 0 ? (
            <div className="space-y-2.5">
              {categorySpectrum.slice(0, 8).map((cat) => (
                <button
                  key={cat.catName}
                  type="button"
                  onClick={() =>
                    openDrillDownVisits(
                      cat.simpleName,
                      `Menampilkan ${cat.kasus} kasus (${cat.uniquePatients} orang) pada kelompok ${cat.simpleName}`,
                      cat.visits,
                      `${cat.percentage}%`,
                      'bg-indigo-600 text-white'
                    )
                  }
                  className="w-full text-left group space-y-1 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 -mx-2 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-400 truncate">
                      {cat.simpleName}
                    </span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0">
                      <strong>{cat.kasus}</strong> kasus ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${cat.barWidthPct}%` }}
                      className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full transition-all"
                    />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              Belum ada data diagnosis penyakit pada periode ini.
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 10 PENYAKIT TERBANYAK & PANEL PANTAUAN PASIEN / BPJS                  */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 10 Penyakit Terbanyak (2/3 lebar) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                10 Penyakit Paling Sering Muncul
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Klik salah satu penyakit untuk melihat siapa saja yang berobat
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab('rekap')}
              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              Buka Rekap Bulanan →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 pl-4 pr-2 w-10 text-center">No</th>
                  <th className="py-2.5 px-3">Penyakit</th>
                  <th className="py-2.5 px-3 w-36">Jumlah Kasus</th>
                  <th className="py-2.5 px-3 text-center">Orang Sakit</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Sifat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {topDiseases.length > 0 ? (
                  topDiseases.map((d, idx) => (
                    <tr
                      key={d.name}
                      onClick={() =>
                        openDrillDownVisits(
                          `Penyakit: ${d.name}`,
                          `Menampilkan ${d.kasus} kasus (${d.pasienUnik} orang berbeda)`,
                          d.visits,
                          d.name,
                          d.jenis === 'Menular' ? 'bg-rose-600 text-white' : 'bg-teal-700 text-white'
                        )
                      }
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                    >
                      <td className="py-2.5 pl-4 pr-2 text-center font-mono tabular-nums text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white group-hover:text-teal-700 dark:group-hover:text-teal-400">
                          {d.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">
                          {d.kategoriSimple}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className="font-mono font-bold text-slate-900 dark:text-white w-7">
                            {d.kasus}
                          </span>
                          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden min-w-[48px]">
                            <div
                              style={{ width: `${d.barWidthPct}%` }}
                              className={`h-full rounded-full ${
                                d.jenis === 'Menular' ? 'bg-rose-500' : 'bg-teal-600'
                              }`}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {d.pasienUnik} org
                      </td>
                      <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                        {d.jenis === 'Menular' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                            <Shield className="w-3 h-3" />
                            <span>Menular</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">Tidak Menular</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      Belum ada data penyakit pada periode ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel Kanan: Pantauan Pasien & BPJS */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Pantauan Pasien &amp; BPJS
              </h3>
              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                <button
                  type="button"
                  onClick={() => setClinicFocusTab('sering')}
                  className={`px-2 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                    clinicFocusTab === 'sering'
                      ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 font-semibold shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Sering Berobat
                </button>
                <button
                  type="button"
                  onClick={() => setClinicFocusTab('bpjs')}
                  className={`px-2 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                    clinicFocusTab === 'bpjs'
                      ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 font-semibold shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Data &amp; BPJS
                </button>
              </div>
            </div>

            {clinicFocusTab === 'sering' ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Warga binaan dengan kunjungan terbanyak pada periode ini
                </p>

                {topFrequentPatients.length > 0 ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {topFrequentPatients.map((p, idx) => (
                      <div
                        key={p.nama}
                        onClick={() =>
                          openDrillDownVisits(
                            `Riwayat Berobat: ${p.nama}`,
                            `Menampilkan ${p.kunjunganCount} kunjungan dari ${p.nama} (${p.blok} Kamar ${p.kamar})`,
                            p.visits,
                            `${p.kunjunganCount}x`,
                            'bg-amber-600 text-white'
                          )
                        }
                        className="py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 -mx-2 px-2 rounded-lg transition-colors group"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate group-hover:text-teal-700 dark:group-hover:text-teal-400">
                            <span className="font-mono text-slate-400 mr-1.5">{idx + 1}.</span>
                            {p.nama}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {p.blok} · Kamar {p.kamar}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono tabular-nums text-xs font-bold text-teal-700 dark:text-teal-400">
                            {p.kunjunganCount}x
                          </span>
                          {p.wbp && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectWbp(p.wbp!);
                              }}
                              title="Buka rekam medis"
                              className="p-1 text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 rounded"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-xs text-slate-400">
                    Belum ada data kunjungan pada periode ini.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ringkasan status kepesertaan BPJS dan kelengkapan data warga binaan
                </p>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Total Warga Binaan Terdata</span>
                    <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                      {bpjsSummary.totalWbp} orang
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Sudah Masuk Batch BPJS</span>
                    <span className="font-mono tabular-nums font-bold text-teal-700 dark:text-teal-400">
                      {bpjsSummary.activeBatchCount} orang
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      openDrillDownWbp(
                        'Warga Binaan Belum Masuk Batch BPJS',
                        `Menampilkan ${bpjsSummary.pendingList.length} warga binaan yang perlu dipanggil untuk pengalihan faskes BPJS`,
                        bpjsSummary.pendingList,
                        'Perlu Dipanggil',
                        'bg-amber-600 text-white'
                      )
                    }
                    className="w-full py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 -mx-2 px-2 rounded-lg transition-colors text-left group"
                  >
                    <span className="text-amber-700 dark:text-amber-400 font-medium group-hover:underline">
                      Belum Masuk Batch BPJS
                    </span>
                    <span className="font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400">
                      {bpjsSummary.pendingList.length} orang →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      openDrillDownWbp(
                        'Data Warga Binaan Perlu Dicek (SIDB)',
                        `Menampilkan ${bpjsSummary.needCheckList.length} data yang tidak muncul pada pembaruan SIDB terakhir`,
                        bpjsSummary.needCheckList,
                        'Cek SIDB',
                        'bg-rose-600 text-white'
                      )
                    }
                    className="w-full py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 -mx-2 px-2 rounded-lg transition-colors text-left group"
                  >
                    <span className="text-slate-600 dark:text-slate-300 group-hover:underline">
                      Perlu Cek Ulang SIDB
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                      {bpjsSummary.needCheckList.length} orang →
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            {clinicFocusTab === 'sering' ? (
              <span>
                Batas sering: {pengaturan.batas_sering_berobat_kali}x dalam {pengaturan.periode_sering_hari} hari
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateToTab('bpjs')}
                className="font-semibold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Buka Dashboard BPJS Lengkap</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* RINGKASAN TAHUNAN JANUARI - DESEMBER                                  */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Rekap Kunjungan per Bulan ({selectedYear})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              Total sepanjang {selectedYear}: {fullYearMetrics.totalKunjungan} kunjungan dari{' '}
              {fullYearMetrics.pasienUnikCount} orang berbeda · Klik bulan untuk melihat daftar pasien
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider">
                <th className="py-2.5 pl-4 pr-3">Bulan</th>
                <th className="py-2.5 px-3">Kepadatan Kunjungan</th>
                <th className="py-2.5 px-3 text-right">Kunjungan</th>
                <th className="py-2.5 px-3 text-right">Orang Berobat</th>
                <th className="py-2.5 px-3 text-right">Rata-rata/Orang</th>
                <th className="py-2.5 pl-3 pr-4 text-right">Porsi Tahun</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {monthlyAnnualSummary.map((m) => {
                const pct =
                  fullYearMetrics.totalKunjungan > 0
                    ? ((m.kunjungan / fullYearMetrics.totalKunjungan) * 100).toFixed(1)
                    : '0';
                const isSelected = m.monthNum === selectedMonth && filterMode === 'bulan';
                return (
                  <tr
                    key={m.monthName}
                    onClick={() => {
                      if (m.kunjungan > 0) {
                        openDrillDownVisits(
                          `Kunjungan Bulan ${m.monthName} ${selectedYear}`,
                          `Menampilkan ${m.kunjungan} kunjungan (${m.pasienUnik} orang berbeda)`,
                          m.visits,
                          m.monthName,
                          'bg-teal-700 text-white'
                        );
                      }
                    }}
                    className={`transition-colors ${
                      m.kunjungan > 0 ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isSelected
                        ? 'bg-teal-50/70 dark:bg-teal-950/30 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 pl-4 pr-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                      <span>{m.monthName}</span>
                      {isSelected && (
                        <span className="ml-2 text-[10px] font-semibold text-teal-700 dark:text-teal-400">
                          (Dipilih)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 min-w-[140px]">
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${m.barWidthPct}%` }}
                          className={`h-full rounded-full ${
                            isSelected ? 'bg-teal-700 dark:bg-teal-400' : 'bg-teal-600/80 dark:bg-teal-500/80'
                          }`}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {m.kunjungan}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {m.pasienUnik} org
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {m.rasio}x
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-800/70 font-bold border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
              <tr
                onClick={() =>
                  openDrillDownVisits(
                    `Seluruh Kunjungan Tahun ${selectedYear}`,
                    `Menampilkan total ${fullYearMetrics.totalKunjungan} kunjungan (${fullYearMetrics.pasienUnikCount} orang berbeda)`,
                    fullYearVisits,
                    `Tahun ${selectedYear}`,
                    'bg-slate-900 text-white'
                  )
                }
                className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <td colSpan={2} className="py-2.5 pl-4 pr-3 text-xs">
                  Total Tahun {selectedYear} (Klik untuk rincian lengkap)
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-teal-700 dark:text-teal-300">
                  {fullYearMetrics.totalKunjungan}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                  {fullYearMetrics.pasienUnikCount} org
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                  {fullYearMetrics.kunjunganPerPasien.toFixed(1)}x
                </td>
                <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL RINCIAN DATA (DRILL-DOWN)                                       */}
      {/* ===================================================================== */}
      {drillDown.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-slate-950/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrillDown((prev) => ({ ...prev, isOpen: false }));
          }}
          role="dialog"
          aria-modal="true"
          aria-label={drillDown.title}
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50/80 dark:bg-slate-950/40 shrink-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {drillDown.title}
                  </h3>
                  {drillDown.badgeLabel && (
                    <span
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                        drillDown.badgeColor || 'bg-teal-700 text-white'
                      }`}
                    >
                      {drillDown.badgeLabel}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{drillDown.subtitle}</p>
              </div>

              <button
                type="button"
                aria-label="Tutup rincian"
                onClick={() => setDrillDown((prev) => ({ ...prev, isOpen: false }))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Metrics Strip + Controls */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-900 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                {drillDown.isWbpMode ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      Total: <strong className="font-mono text-slate-900 dark:text-white">{drillSummary.total}</strong> WBP
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <span>
                      Belum Batch BPJS: <strong className="font-mono text-amber-700 dark:text-amber-400">{drillSummary.pending}</strong>
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <span>
                      Perlu Cek SIDB: <strong className="font-mono text-rose-600 dark:text-rose-400">{drillSummary.flagged}</strong>
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      Menampilkan <strong className="font-mono text-slate-900 dark:text-white">{drillSummary.total}</strong> kunjungan
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <span>
                      <strong className="font-mono text-teal-700 dark:text-teal-400">{drillSummary.uniquePatients}</strong> pasien unik
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <span>
                      <strong className="font-mono text-rose-600 dark:text-rose-400">{drillSummary.menularCount}</strong> menular
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <span>
                      <strong className="font-mono text-amber-700 dark:text-amber-400">{drillSummary.perhatianCount}</strong> perlu perhatian
                    </span>
                  </div>
                )}

                <span className="text-slate-400 hidden sm:inline">Klik nama pasien untuk membuka rekam medis lengkap</span>
              </div>

              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder={
                      drillDown.isWbpMode
                        ? 'Cari nama, NIK, kamar, atau kendala BPJS...'
                        : 'Cari nama, kamar, keluhan, ICD-10, atau obat...'
                    }
                    value={drillSearch}
                    onChange={(e) => setDrillSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!drillDown.isWbpMode && (
                    <>
                      <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                        {(
                          [
                            { id: 'semua', label: 'Semua' },
                            { id: 'menular', label: 'Menular' },
                            { id: 'perhatian', label: 'Perhatian' },
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setDrillStatusFilter(f.id)}
                            className={`px-2 py-1 rounded-md font-medium transition-colors ${
                              drillStatusFilter === f.id
                                ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 font-semibold shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px]">
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        <select
                          aria-label="Urutkan daftar"
                          value={drillSort}
                          onChange={(e) => setDrillSort(e.target.value as 'terbaru' | 'terlama' | 'nama')}
                          className="bg-transparent text-slate-700 dark:text-slate-200 font-medium focus:outline-none"
                        >
                          <option value="terbaru" className="dark:bg-slate-900">Terbaru</option>
                          <option value="terlama" className="dark:bg-slate-900">Terlama</option>
                          <option value="nama" className="dark:bg-slate-900">Nama A–Z</option>
                        </select>
                      </div>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyDrilldownText}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    {copiedSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Daftar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Data Table / Cards */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              {drillDown.isWbpMode ? (
                <>
                  {/* Desktop WBP Table */}
                  <div className="hidden md:block border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">No</th>
                          <th className="py-2.5 px-3">Nama Lengkap</th>
                          <th className="py-2.5 px-3">No. Register / NIK</th>
                          <th className="py-2.5 px-3">Kamar</th>
                          <th className="py-2.5 px-3">Batch & Kendala BPJS</th>
                          <th className="py-2.5 px-3">Ekspirasi</th>
                          <th className="py-2.5 px-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredWbpList.length > 0 ? (
                          filteredWbpList.map((w, idx) => {
                            const eksp = getEkspirasiStatus(w.tgl_ekspirasi);
                            return (
                              <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-400">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDrillDown((prev) => ({ ...prev, isOpen: false }));
                                      onSelectWbp(w);
                                    }}
                                    className="font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 hover:underline text-left"
                                  >
                                    {w.nama}
                                  </button>
                                </td>
                                <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-400">
                                  <div>{w.no_reg_instansi || '-'}</div>
                                  <div className="text-slate-400">{w.nik || 'NIK kosong'}</div>
                                </td>
                                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                                  {w.blok || '-'} · Kamar {w.kamar || '-'}
                                </td>
                                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                                  <div className="font-medium">{w.batch_bpjs || 'Belum masuk batch'}</div>
                                  {w.kendala_bpjs && (
                                    <div className="text-[11px] text-amber-700 dark:text-amber-400">
                                      Kendala: {w.kendala_bpjs}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-[11px]">
                                  <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                    {w.tgl_ekspirasi || '-'}
                                  </div>
                                  {eksp.hasDate && (
                                    <div
                                      className={
                                        eksp.isExpired
                                          ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                          : 'text-slate-500 dark:text-slate-400'
                                      }
                                    >
                                      {eksp.label}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDrillDown((prev) => ({ ...prev, isOpen: false }));
                                      onSelectWbp(w);
                                    }}
                                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors"
                                  >
                                    Rekam Medis →
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-slate-400">
                              Tidak ditemukan data warga binaan yang cocok dengan pencarian.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile WBP Cards */}
                  <div className="md:hidden space-y-2.5">
                    {filteredWbpList.length > 0 ? (
                      filteredWbpList.map((w, idx) => {
                        const eksp = getEkspirasiStatus(w.tgl_ekspirasi);
                        return (
                          <div
                            key={w.id}
                            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-1.5 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setDrillDown((prev) => ({ ...prev, isOpen: false }));
                                  onSelectWbp(w);
                                }}
                                className="font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 text-left"
                              >
                                {idx + 1}. {w.nama}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDrillDown((prev) => ({ ...prev, isOpen: false }));
                                  onSelectWbp(w);
                                }}
                                className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 shrink-0"
                              >
                                Rekam Medis →
                              </button>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300">
                              {w.blok || '-'} · Kamar {w.kamar || '-'} · BPJS: {w.batch_bpjs || 'Belum masuk batch'}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              NIK: {w.nik || '-'} · Ekspirasi: {w.tgl_ekspirasi || '-'}
                              {eksp.hasDate ? ` (${eksp.label})` : ''}
                            </div>
                            {w.kendala_bpjs && (
                              <div className="text-[11px] text-amber-700 dark:text-amber-400">
                                Kendala: {w.kendala_bpjs}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="py-8 text-center text-xs text-slate-400">
                        Tidak ditemukan data warga binaan yang cocok dengan pencarian.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Desktop Visit Table */}
                  <div className="hidden md:block border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-2.5 px-3 w-8 text-center">No</th>
                          <th className="py-2.5 px-3 w-24">Tanggal</th>
                          <th className="py-2.5 px-3">Pasien &amp; Kamar</th>
                          <th className="py-2.5 px-3">Keluhan &amp; Penyakit (ICD-10)</th>
                          <th className="py-2.5 px-3">Resep Obat / Terapi</th>
                          <th className="py-2.5 px-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredVisits.length > 0 ? (
                          filteredVisits.map((v, idx) => {
                            const linkedWbp = resolveWbpForVisit(v);
                            const resepItems = resepByKunjunganMap.get(v.id) || [];
                            const diagSlots = [
                              { c: v.keluhan1, p: v.penyakit1, icd: v.icd10_1, j: v.jenis1 },
                              { c: v.keluhan2, p: v.penyakit2, icd: v.icd10_2, j: v.jenis2 },
                              { c: v.keluhan3, p: v.penyakit3, icd: v.icd10_3, j: v.jenis3 },
                            ].filter((d) => (d.c && d.c.trim()) || (d.p && d.p.trim()));
                            const isContagious = diagSlots.some((d) => d.j === 'Menular');

                            return (
                              <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top">
                                <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-400">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-3 font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                  {v.tanggal}
                                  {(v.is_frequent || v.is_duplicate) && (
                                    <div className="text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-400 mt-0.5">
                                      {v.is_duplicate ? 'Dobel hari sama' : `Sering (${v.frequent_count}x)`}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  {linkedWbp ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDrillDown((prev) => ({ ...prev, isOpen: false }));
                                        onSelectWbp(linkedWbp);
                                      }}
                                      className="font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 hover:underline text-left"
                                    >
                                      {v.nama}
                                    </button>
                                  ) : (
                                    <div className="font-semibold text-slate-900 dark:text-white">{v.nama}</div>
                                  )}
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    {linkedWbp?.blok || v.wbp?.blok || '-'} · Kamar{' '}
                                    {v.kamar || linkedWbp?.kamar || '-'}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="space-y-1">
                                    {diagSlots.map((d, dIdx) => (
                                      <div key={dIdx} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                        <span className="font-medium text-slate-800 dark:text-slate-200">
                                          {d.c}
                                        </span>
                                        <span className="text-slate-400">→</span>
                                        <span className="font-semibold text-teal-800 dark:text-teal-300">
                                          {d.p}
                                        </span>
                                        {d.icd && d.icd !== 'CEK REFERENSI' && (
                                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                                            {d.icd}
                                          </span>
                                        )}
                                        {d.j === 'Menular' && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-semibold">
                                            Menular
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                    {isContagious && diagSlots.length === 0 && (
                                      <span className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                                        Menular
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-[11px] text-slate-700 dark:text-slate-300">
                                  {resepItems.length > 0 ? (
                                    <div className="space-y-0.5">
                                      {resepItems.map((r) => (
                                        <div key={r.id} className="flex flex-wrap items-center gap-1">
                                          <span className="font-medium text-slate-800 dark:text-slate-200">
                                            {r.obat_nama || r.nama_obat}
                                          </span>
                                          <span className="font-mono tabular-nums text-[10px] text-teal-700 dark:text-teal-300">
                                            ({r.jumlah_diberikan} {r.satuan_terkecil || r.satuan || 'pcs'})
                                          </span>
                                        </div>
                                      ))}
                                      {v.terapi && (
                                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                          {v.terapi}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span>{v.terapi || '-'}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {linkedWbp ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDrillDown((prev) => ({ ...prev, isOpen: false }));
                                        onSelectWbp(linkedWbp);
                                      }}
                                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors"
                                    >
                                      Rekam Medis →
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">Non-WBP</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-slate-400">
                              Tidak ditemukan data kunjungan yang cocok dengan pencarian.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Visit Cards */}
                  <div className="md:hidden space-y-2.5">
                    {filteredVisits.length > 0 ? (
                      filteredVisits.map((v) => {
                        const linkedWbp = resolveWbpForVisit(v);
                        const resepItems = resepByKunjunganMap.get(v.id) || [];
                        const diagSlots = [
                          { c: v.keluhan1, p: v.penyakit1, icd: v.icd10_1, j: v.jenis1 },
                          { c: v.keluhan2, p: v.penyakit2, icd: v.icd10_2, j: v.jenis2 },
                          { c: v.keluhan3, p: v.penyakit3, icd: v.icd10_3, j: v.jenis3 },
                        ].filter((d) => (d.c && d.c.trim()) || (d.p && d.p.trim()));
                        return (
                          <div
                            key={v.id}
                            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-2 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2 pb-1.5 border-b border-slate-200/70 dark:border-slate-700/70">
                              <div>
                                {linkedWbp ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDrillDown((prev) => ({ ...prev, isOpen: false }));
                                      onSelectWbp(linkedWbp);
                                    }}
                                    className="font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 text-left"
                                  >
                                    {v.nama}
                                  </button>
                                ) : (
                                  <div className="font-semibold text-slate-900 dark:text-white">{v.nama}</div>
                                )}
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                  {v.tanggal} · Kamar {v.kamar || linkedWbp?.kamar || '-'}
                                </div>
                              </div>
                              {linkedWbp ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDrillDown((prev) => ({ ...prev, isOpen: false }));
                                    onSelectWbp(linkedWbp);
                                  }}
                                  className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 shrink-0"
                                >
                                  Rekam Medis →
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400">Non-WBP</span>
                              )}
                            </div>

                            <div className="space-y-1">
                              {diagSlots.map((d, dIdx) => (
                                <div key={dIdx} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                  <span className="font-medium text-slate-800 dark:text-slate-200">{d.c}</span>
                                  <span className="text-slate-400">→</span>
                                  <span className="font-semibold text-teal-800 dark:text-teal-300">{d.p}</span>
                                  {d.icd && d.icd !== 'CEK REFERENSI' && (
                                    <span className="font-mono text-[10px] px-1 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                                      {d.icd}
                                    </span>
                                  )}
                                  {d.j === 'Menular' && (
                                    <span className="text-[10px] px-1 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-semibold">
                                      Menular
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="text-[11px] text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                              <span className="font-semibold">Obat: </span>
                              {resepItems.length > 0
                                ? resepItems
                                    .map(
                                      (r) =>
                                        `${r.obat_nama || r.nama_obat} (${r.jumlah_diberikan} ${r.satuan_terkecil || r.satuan || 'pcs'})`
                                    )
                                    .join(', ')
                                : v.terapi || '-'}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="py-8 text-center text-xs text-slate-400">
                        Tidak ditemukan data kunjungan yang cocok dengan pencarian.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span>Klinik Pratama Lapas Dompu</span>
              <button
                type="button"
                onClick={() => setDrillDown((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold hover:opacity-90 transition-opacity"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
