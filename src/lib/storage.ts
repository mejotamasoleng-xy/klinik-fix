/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import {
  CalculatedKunjungan,
  JenisPenyakit,
  KunjunganItem,
  PengaturanApp,
  PenyakitItem,
  ReferensiItem,
  WbpItem,
  AuditLog,
  SidbUpdateHistory,
  MasterObatItem,
  ResepObatItem,
} from '../types';
import {
  INITIAL_KUNJUNGAN,
  INITIAL_MASTER_OBAT,
  INITIAL_PENGATURAN,
  INITIAL_PENYAKIT,
  INITIAL_REFERENSI,
  INITIAL_WBP,
} from '../data/initialData';
import { getAuthToken, logoutSession } from './auth';
import { showToast } from './feedback';

const STORAGE_KEYS = {
  WBP: 'klinik_dompu_wbp_v1',
  KUNJUNGAN: 'klinik_dompu_kunjungan_v1',
  REFERENSI: 'klinik_dompu_referensi_v1',
  PENYAKIT: 'klinik_dompu_penyakit_v1',
  PENGATURAN: 'klinik_dompu_pengaturan_v1',
  AUDIT_LOG: 'klinik_dompu_audit_log_v1',
  SIDB_HISTORY: 'klinik_dompu_sidb_history_v1',
  MASTER_OBAT: 'klinik_dompu_master_obat_v1',
  RESEP_OBAT: 'klinik_dompu_resep_obat_v1',
  SESSION: 'klinik_dompu_session_v1',
  FAILED_ATTEMPTS: 'klinik_dompu_failed_login_v1',
  THEME: 'klinik_dompu_theme',
};

// SHA-256 helper
export async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Date helpers for dd/mm/yyyy
const parseDateMsCache = new Map<string, number>();

export function parseDateMs(str: string): number | null {
  if (!str) return null;
  const cached = parseDateMsCache.get(str);
  if (cached !== undefined) {
    return Number.isNaN(cached) ? null : cached;
  }

  let ms = NaN;
  const parts = str.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    ms = new Date(year, month, day).getTime();
  } else {
    ms = new Date(str).getTime();
  }

  if (parseDateMsCache.size > 5000) {
    parseDateMsCache.clear();
  }
  parseDateMsCache.set(str, ms);
  return Number.isNaN(ms) ? null : ms;
}

export function parseDate(str: string): Date | null {
  const ms = parseDateMs(str);
  return ms === null ? null : new Date(ms);
}

export function formatDateIndo(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

const DD_MM_YYYY_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

export function normalizeDateIndo(raw: any): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    return formatDateIndo(raw);
  }
  const str = String(raw).trim();
  if (!str) return '';

  if (DD_MM_YYYY_REGEX.test(str)) {
    return str;
  }

  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      let year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;

      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }
  }

  if (str.includes('-')) {
    const cleanDate = str.split('T')[0];
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);

      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }
  }

  const parsed = parseDate(str);
  if (parsed && !isNaN(parsed.getTime())) {
    return formatDateIndo(parsed);
  }

  return str;
}

export const WITA_TIMEZONE = 'Asia/Makassar';

const witaPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: WITA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
let cachedNowWitaParts: { atMs: number; parts: { year: number; month: number; day: number } } | null = null;

export function getWitaDateParts(date?: Date): { year: number; month: number; day: number } {
  if (!date) {
    const nowMs = Date.now();
    if (cachedNowWitaParts && nowMs - cachedNowWitaParts.atMs < 1000) {
      return cachedNowWitaParts.parts;
    }
    const target = new Date(nowMs);
    const formatted = witaPartsFormatter.formatToParts(target);
    const parts = {
      year: Number(formatted.find((p) => p.type === 'year')?.value || target.getFullYear()),
      month: Number(formatted.find((p) => p.type === 'month')?.value || target.getMonth() + 1),
      day: Number(formatted.find((p) => p.type === 'day')?.value || target.getDate()),
    };
    cachedNowWitaParts = { atMs: nowMs, parts };
    return parts;
  }

  const parts = witaPartsFormatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value || date.getFullYear());
  const month = Number(parts.find((p) => p.type === 'month')?.value || date.getMonth() + 1);
  const day = Number(parts.find((p) => p.type === 'day')?.value || date.getDate());
  return { year, month, day };
}

export function getWitaTodayDate(): Date {
  const { year, month, day } = getWitaDateParts();
  return new Date(year, month - 1, day);
}

export function getWitaTodayIso(): string {
  const { year, month, day } = getWitaDateParts();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatLongDateWita(date: Date = new Date()): string {
  return date.toLocaleDateString('id-ID', {
    timeZone: WITA_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateTimeWita(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return String(dateInput || '-');
  return `${d.toLocaleString('id-ID', { timeZone: WITA_TIMEZONE })} WITA`;
}

export function getTodayFormatted(): string {
  const { year, month, day } = getWitaDateParts();
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

export function determineBlokByKamar(kamar: string | undefined | null): string {
  if (!kamar) return '';
  const clean = String(kamar).trim().toLowerCase();
  if (
    !clean ||
    clean === '-' ||
    clean === 'kosong' ||
    clean === 'tidak ada' ||
    clean === 'null' ||
    clean === 'undefined'
  ) {
    return '';
  }

  if (clean.includes('tamping')) {
    return 'Blok Atas';
  }

  if (clean.includes('lansia')) {
    return 'Blok Bawah';
  }

  if (clean.includes('maximum') || clean.includes('maksim') || clean.includes('max')) {
    return 'Blok Bawah';
  }

  const numMatch = clean.match(/\b\d+\b/) || clean.match(/\d+/);
  if (numMatch) {
    const num = parseInt(numMatch[0], 10);
    if (num >= 8 && num <= 14) {
      return 'Blok Atas';
    }
    if (num >= 1 && num <= 7) {
      return 'Blok Bawah';
    }
  }

  return '';
}

export function dateToInputFormat(str: string): string {
  if (!str) return '';
  const parts = str.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return str;
}

export function inputFormatToDate(str: string): string {
  if (!str) return '';
  const parts = str.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
}

export function calculateUsia(tanggal_lahir: string): number {
  const birth = parseDate(tanggal_lahir);
  if (!birth) return 0;
  const today = getWitaTodayDate();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

export function calculateSisaBulan(tgl_ekspirasi: string): number {
  const exp = parseDate(tgl_ekspirasi);
  if (!exp) return 0;
  const today = getWitaTodayDate();
  let months = (exp.getFullYear() - today.getFullYear()) * 12 + (exp.getMonth() - today.getMonth());
  if (exp.getDate() < today.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

export function getEkspirasiStatus(tgl_ekspirasi?: string): {
  hasDate: boolean;
  isExpired: boolean;
  monthsRemaining: number;
  daysRemaining: number;
  label: string;
} {
  if (!tgl_ekspirasi || !tgl_ekspirasi.trim()) {
    return {
      hasDate: false,
      isExpired: false,
      monthsRemaining: 0,
      daysRemaining: 0,
      label: 'Belum tercatat',
    };
  }
  const exp = parseDate(tgl_ekspirasi);
  if (!exp) {
    return {
      hasDate: false,
      isExpired: false,
      monthsRemaining: 0,
      daysRemaining: 0,
      label: tgl_ekspirasi,
    };
  }
  const today = getWitaTodayDate();
  const expMidnight = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate()).getTime();
  const todayMidnight = today.getTime();
  const daysRemaining = Math.round((expMidnight - todayMidnight) / 86400000);

  if (daysRemaining < 0) {
    return {
      hasDate: true,
      isExpired: true,
      monthsRemaining: 0,
      daysRemaining,
      label: `Sudah Ekspirasi (${Math.abs(daysRemaining)} hari lalu)`,
    };
  }

  const monthsRemaining = calculateSisaBulan(tgl_ekspirasi);
  if (monthsRemaining === 0) {
    return {
      hasDate: true,
      isExpired: false,
      monthsRemaining: 0,
      daysRemaining,
      label: daysRemaining === 0 ? 'Ekspirasi Hari Ini' : `${daysRemaining} hari lagi`,
    };
  }

  return {
    hasDate: true,
    isExpired: false,
    monthsRemaining,
    daysRemaining,
    label: `Sisa ${monthsRemaining} bulan`,
  };
}

export function getRelativeTime(dateStr: string): string {
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  const today = getWitaTodayDate();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - date.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hari ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays > 1 && diffDays < 30) return `${diffDays} hari lalu`;
  if (diffDays >= 30 && diffDays < 365) return `${Math.floor(diffDays / 30)} bulan lalu`;
  return `${Math.floor(diffDays / 365)} tahun lalu`;
}

// Storage & Cross-Device Real-Time Sync Manager
class DataStore {
  private wbpList: WbpItem[] = [];
  private kunjunganList: KunjunganItem[] = [];
  private referensiList: ReferensiItem[] = [];
  private penyakitList: PenyakitItem[] = [];
  private pengaturan: PengaturanApp = INITIAL_PENGATURAN;
  private auditLogs: AuditLog[] = [];
  private sidbHistory: SidbUpdateHistory[] = [];
  private masterObatList: MasterObatItem[] = [];
  private resepObatList: ResepObatItem[] = [];
  private listeners = new Set<() => void>();
  private version = 0;
  private syncInFlight: Promise<boolean> | null = null;
  private lastKnownServerVersion = 0;
  private eventSource: EventSource | null = null;
  private hasConnectedSseOnce = false;
  private pendingMutations = 0;
  private mutationSeq = 0;
  private needsResyncAfterWrite = false;
  private writeQueue: Promise<void> = Promise.resolve();
  private clientId: string;

  // Derived data memoization caches (invalidated when `this.version` increments)
  private cachedWbpList: WbpItem[] | null = null;
  private cachedWbpVersion = -1;
  private cachedCalcActive: CalculatedKunjungan[] | null = null;
  private cachedCalcActiveVersion = -1;
  private cachedCalcAll: CalculatedKunjungan[] | null = null;
  private cachedCalcAllVersion = -1;
  private cachedResepList: ResepObatItem[] | null = null;
  private cachedResepVersion = -1;
  private refLookupMap: Map<
    string,
    { penyakit: string; icd10?: string; nama_icd10?: string; jenis?: JenisPenyakit }
  > | null = null;
  private refLookupVersion = -1;

  // Coalesced localStorage persistence so rapid mutations don't freeze the UI thread
  private dirtyStorageKeys = new Set<string>();
  private storageFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private isAuthenticated = false;
  private sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private quotaToastShown = false;

  constructor() {
    this.clientId =
      typeof window !== 'undefined'
        ? 'client-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
        : 'ssr';
    this.loadFromLocalStorage();
    if (typeof window !== 'undefined') {
      this.isAuthenticated = Boolean(getAuthToken());
      this.initRealtimeSync();
    }
  }

  public setAuthenticated(active: boolean) {
    this.isAuthenticated = active;
    if (typeof window === 'undefined') return;
    if (active) {
      void this.syncFromDatabase();
      this.connectSse();
    } else {
      this.disconnectSse();
    }
  }

  private handleUnauthorized() {
    if (!this.isAuthenticated) return;
    this.isAuthenticated = false;
    this.disconnectSse();
    logoutSession('Sesi telah berakhir. Silakan login kembali.');
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getVersion(): number {
    return this.version;
  }

  private notifyListeners() {
    this.version += 1;
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Store listener error:', err);
      }
    });
  }

  private async apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
      'X-Client-Id': this.clientId,
    };
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { cache: 'no-store', ...options, headers });
    if (res.status === 401 && !url.startsWith('/api/auth/login')) {
      this.handleUnauthorized();
    }
    return res;
  }

  private async apiFetchChecked(url: string, options: RequestInit = {}): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await this.apiFetch(url, options);
        if (res.ok) return res;
        let errText = `HTTP ${res.status}`;
        try {
          const parsed = await res.clone().json();
          if (parsed?.error) errText = parsed.error;
        } catch {
          // ignore non-json error body
        }
        const err = new Error(errText);
        if (res.status >= 500 && attempt < 2) {
          lastError = err;
          await new Promise((r) => setTimeout(r, 900));
          continue;
        }
        throw err;
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 900));
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Gagal terhubung ke server Cloud SQL');
  }

  private enqueueServerWrite(taskName: string, runner: () => Promise<Response>): Promise<boolean> {
    if (typeof window === 'undefined' || !this.isAuthenticated) return Promise.resolve(true);
    this.pendingMutations += 1;
    this.mutationSeq += 1;

    const task = this.writeQueue.then(async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await runner();
          if (res.ok) {
            return true;
          }
          if (res.status === 401) {
            return false;
          }
          let errMsg = `HTTP ${res.status}`;
          try {
            const parsed = await res.clone().json();
            if (parsed?.error) errMsg = parsed.error;
          } catch {
            // ignore
          }
          lastError = new Error(errMsg);
          if (res.status >= 500 && attempt < 2) {
            await new Promise((r) => setTimeout(r, 900));
            continue;
          }
          break;
        } catch (err) {
          lastError = err;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 900));
            continue;
          }
        }
      }
      console.error(`Failed to sync ${taskName}:`, lastError);
      return false;
    });

    this.writeQueue = task.then(
      () => undefined,
      () => undefined
    );

    return task.finally(() => {
      this.pendingMutations = Math.max(0, this.pendingMutations - 1);
      if (this.pendingMutations === 0 && this.needsResyncAfterWrite) {
        this.needsResyncAfterWrite = false;
        void this.syncFromDatabase();
      }
    });
  }

  private enqueueBatchWrite<T>(runner: () => Promise<T>): Promise<T> {
    this.pendingMutations += 1;
    this.mutationSeq += 1;

    const task = this.writeQueue.then(() => runner());
    this.writeQueue = task.then(
      () => undefined,
      () => undefined
    );

    return task.finally(() => {
      this.pendingMutations = Math.max(0, this.pendingMutations - 1);
      if (this.pendingMutations === 0 && this.needsResyncAfterWrite) {
        this.needsResyncAfterWrite = false;
        void this.syncFromDatabase();
      }
    });
  }

  private async checkForRemoteUpdates(): Promise<void> {
    if (typeof window === 'undefined' || !this.isAuthenticated || !getAuthToken()) return;
    if (this.pendingMutations > 0) {
      this.needsResyncAfterWrite = true;
      return;
    }
    try {
      const res = await this.apiFetch('/api/sync/version');
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data?.version === 'number' && data.version !== this.lastKnownServerVersion) {
        await this.syncFromDatabase();
      }
    } catch {
      // ignore transient offline poll
    }
  }

  private disconnectSse() {
    if (this.sseReconnectTimer) {
      clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private connectSse() {
    if (typeof window === 'undefined' || !this.isAuthenticated) return;
    const token = getAuthToken();
    if (!token) return;

    this.disconnectSse();
    try {
      const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
      this.eventSource = es;

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'connected') {
            const shouldSync =
              this.hasConnectedSseOnce ||
              !this.lastKnownServerVersion ||
              (msg.version && msg.version !== this.lastKnownServerVersion);
            this.hasConnectedSseOnce = true;
            if (shouldSync) {
              void this.syncFromDatabase();
            }
          } else if (msg.type === 'sync') {
            if (msg.sourceClientId !== this.clientId) {
              void this.syncFromDatabase();
            } else if (typeof msg.version === 'number') {
              this.lastKnownServerVersion = msg.version;
            }
          }
        } catch {
          // ignore malformed heartbeat
        }
      };

      es.onerror = () => {
        es.close();
        this.eventSource = null;
        if (this.isAuthenticated && getAuthToken()) {
          this.sseReconnectTimer = setTimeout(() => this.connectSse(), 4000);
        }
      };
    } catch {
      // ignore if EventSource unavailable
    }
  }

  private initRealtimeSync() {
    if (this.isAuthenticated && getAuthToken()) {
      void this.syncFromDatabase();
      this.connectSse();
    }

    window.addEventListener('focus', () => {
      void this.checkForRemoteUpdates();
    });
    window.addEventListener('online', () => {
      if (this.isAuthenticated && getAuthToken()) {
        void this.syncFromDatabase();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.checkForRemoteUpdates();
      }
    });

    setInterval(() => {
      if (document.visibilityState === 'visible') {
        void this.checkForRemoteUpdates();
      }
    }, 12000);

    window.addEventListener('beforeunload', () => this.flushLocalStorage());
    window.addEventListener('pagehide', () => this.flushLocalStorage());
  }

  private loadFromLocalStorage() {
    try {
      const storedWbp = localStorage.getItem(STORAGE_KEYS.WBP);
      const rawWbp: WbpItem[] = storedWbp ? JSON.parse(storedWbp) : INITIAL_WBP;
      this.wbpList = rawWbp.map((w) => {
        const room = (w.kamar || w.kamar_sidb || '').trim();
        return {
          ...w,
          kamar: room,
          blok: determineBlokByKamar(room),
        };
      });

      const storedKunjungan = localStorage.getItem(STORAGE_KEYS.KUNJUNGAN);
      this.kunjunganList = (storedKunjungan ? JSON.parse(storedKunjungan) : INITIAL_KUNJUNGAN).map(
        (k: KunjunganItem) => ({
          ...k,
          tanggal: normalizeDateIndo(k.tanggal),
        })
      );

      const storedRef = localStorage.getItem(STORAGE_KEYS.REFERENSI);
      this.referensiList = storedRef ? JSON.parse(storedRef) : INITIAL_REFERENSI;

      const storedPenyakit = localStorage.getItem(STORAGE_KEYS.PENYAKIT);
      this.penyakitList = storedPenyakit ? JSON.parse(storedPenyakit) : INITIAL_PENYAKIT;

      const storedPengaturan = localStorage.getItem(STORAGE_KEYS.PENGATURAN);
      this.pengaturan = storedPengaturan
        ? { ...INITIAL_PENGATURAN, ...JSON.parse(storedPengaturan) }
        : INITIAL_PENGATURAN;

      const storedAudit = localStorage.getItem(STORAGE_KEYS.AUDIT_LOG);
      this.auditLogs = storedAudit ? JSON.parse(storedAudit) : [];

      const storedSidbHistory = localStorage.getItem(STORAGE_KEYS.SIDB_HISTORY);
      this.sidbHistory = storedSidbHistory ? JSON.parse(storedSidbHistory) : [];

      const storedObat = localStorage.getItem(STORAGE_KEYS.MASTER_OBAT);
      this.masterObatList = storedObat ? JSON.parse(storedObat) : INITIAL_MASTER_OBAT;

      const storedResep = localStorage.getItem(STORAGE_KEYS.RESEP_OBAT);
      this.resepObatList = storedResep ? JSON.parse(storedResep) : [];
    } catch (e) {
      console.error('Failed to load storage, initializing with defaults', e);
      this.wbpList = INITIAL_WBP;
      this.kunjunganList = INITIAL_KUNJUNGAN;
      this.referensiList = INITIAL_REFERENSI;
      this.penyakitList = INITIAL_PENYAKIT;
      this.pengaturan = INITIAL_PENGATURAN;
      this.masterObatList = INITIAL_MASTER_OBAT;
      this.resepObatList = [];
    }
  }

  public async syncFromDatabase(): Promise<boolean> {
    if (typeof window === 'undefined' || !getAuthToken()) return false;
    if (this.pendingMutations > 0) {
      this.needsResyncAfterWrite = true;
      return false;
    }
    if (this.syncInFlight) return this.syncInFlight;

    const seqAtStart = this.mutationSeq;

    this.syncInFlight = (async () => {
      try {
        const res = await this.apiFetch('/api/sync/state');
        if (!res.ok) return false;
        const snapshot = await res.json();

        if (!snapshot || typeof snapshot !== 'object') return false;
        if (!Array.isArray(snapshot.wbp) || !Array.isArray(snapshot.kunjungan)) return false;

        // Abort overwriting if a local write started while this snapshot was in flight
        if (this.pendingMutations > 0 || this.mutationSeq !== seqAtStart) {
          this.needsResyncAfterWrite = true;
          return false;
        }

        if (snapshot.version) {
          this.lastKnownServerVersion = snapshot.version;
        }

        this.wbpList = snapshot.wbp.map((w: WbpItem) => {
          const room = (w.kamar || w.kamar_sidb || '').trim();
          return {
            ...w,
            kamar: room,
            blok: w.blok || determineBlokByKamar(room),
          };
        });

        this.kunjunganList = snapshot.kunjungan.map((k: KunjunganItem) => ({
          ...k,
          tanggal: normalizeDateIndo(k.tanggal),
        }));

        if (Array.isArray(snapshot.referensi) && snapshot.referensi.length > 0) {
          this.referensiList = snapshot.referensi;
        }

        if (Array.isArray(snapshot.penyakit) && snapshot.penyakit.length > 0) {
          this.penyakitList = snapshot.penyakit;
        }

        if (snapshot.pengaturan && typeof snapshot.pengaturan === 'object') {
          this.pengaturan = { ...INITIAL_PENGATURAN, ...snapshot.pengaturan };
        }

        if (Array.isArray(snapshot.sidb_history)) {
          this.sidbHistory = snapshot.sidb_history;
        }

        if (Array.isArray(snapshot.audit_logs)) {
          this.auditLogs = snapshot.audit_logs;
        }

        if (Array.isArray(snapshot.master_obat) && snapshot.master_obat.length > 0) {
          this.masterObatList = snapshot.master_obat;
        }

        if (Array.isArray(snapshot.resep_obat)) {
          this.resepObatList = snapshot.resep_obat;
        }

        this.saveToLocalStorage();
        this.notifyListeners();
        return true;
      } catch {
        // Silently continue with cached local data if offline
        return false;
      } finally {
        this.syncInFlight = null;
      }
    })();

    return this.syncInFlight;
  }

  private writeStorageKey(key: string): void {
    switch (key) {
      case STORAGE_KEYS.WBP:
        localStorage.setItem(STORAGE_KEYS.WBP, JSON.stringify(this.wbpList));
        break;
      case STORAGE_KEYS.KUNJUNGAN:
        localStorage.setItem(STORAGE_KEYS.KUNJUNGAN, JSON.stringify(this.kunjunganList));
        break;
      case STORAGE_KEYS.REFERENSI:
        localStorage.setItem(STORAGE_KEYS.REFERENSI, JSON.stringify(this.referensiList));
        break;
      case STORAGE_KEYS.PENYAKIT:
        localStorage.setItem(STORAGE_KEYS.PENYAKIT, JSON.stringify(this.penyakitList));
        break;
      case STORAGE_KEYS.PENGATURAN: {
        const { password_hash: _omit, ...safePengaturan } = this.pengaturan as PengaturanApp;
        localStorage.setItem(STORAGE_KEYS.PENGATURAN, JSON.stringify(safePengaturan));
        break;
      }
      case STORAGE_KEYS.AUDIT_LOG:
        localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(this.auditLogs.slice(0, 200)));
        break;
      case STORAGE_KEYS.SIDB_HISTORY:
        localStorage.setItem(STORAGE_KEYS.SIDB_HISTORY, JSON.stringify(this.sidbHistory));
        break;
      case STORAGE_KEYS.MASTER_OBAT:
        localStorage.setItem(STORAGE_KEYS.MASTER_OBAT, JSON.stringify(this.masterObatList));
        break;
      case STORAGE_KEYS.RESEP_OBAT:
        localStorage.setItem(STORAGE_KEYS.RESEP_OBAT, JSON.stringify(this.resepObatList));
        break;
    }
  }

  private flushLocalStorage() {
    if (this.storageFlushTimer) {
      clearTimeout(this.storageFlushTimer);
      this.storageFlushTimer = null;
    }
    if (this.dirtyStorageKeys.size === 0 || typeof window === 'undefined') return;
    const keys = Array.from(this.dirtyStorageKeys);
    this.dirtyStorageKeys.clear();

    const criticalOrder = [
      STORAGE_KEYS.WBP,
      STORAGE_KEYS.KUNJUNGAN,
      STORAGE_KEYS.RESEP_OBAT,
      STORAGE_KEYS.PENGATURAN,
      STORAGE_KEYS.REFERENSI,
      STORAGE_KEYS.PENYAKIT,
      STORAGE_KEYS.MASTER_OBAT,
      STORAGE_KEYS.SIDB_HISTORY,
      STORAGE_KEYS.AUDIT_LOG,
    ];
    keys.sort((a, b) => criticalOrder.indexOf(a) - criticalOrder.indexOf(b));

    for (const key of keys) {
      try {
        this.writeStorageKey(key);
      } catch (e: any) {
        const isQuota =
          e?.name === 'QuotaExceededError' ||
          e?.code === 22 ||
          String(e?.message || '').toLowerCase().includes('quota');
        if (isQuota) {
          try {
            localStorage.removeItem(STORAGE_KEYS.AUDIT_LOG);
            localStorage.removeItem(STORAGE_KEYS.SIDB_HISTORY);
            if (key !== STORAGE_KEYS.AUDIT_LOG && key !== STORAGE_KEYS.SIDB_HISTORY) {
              this.writeStorageKey(key);
              continue;
            }
          } catch {
            // still full after eviction
          }
          if (!this.quotaToastShown) {
            this.quotaToastShown = true;
            showToast(
              'Kapasitas cache browser penuh. Data tetap tersimpan di Cloud SQL server.',
              'warning'
            );
          }
        }
        console.error(`Failed to save ${key} to localStorage`, e);
      }
    }
  }

  private saveToLocalStorage(keys?: string[]) {
    if (typeof window === 'undefined') return;
    const targets = keys && keys.length > 0
      ? keys
      : [
          STORAGE_KEYS.WBP,
          STORAGE_KEYS.KUNJUNGAN,
          STORAGE_KEYS.REFERENSI,
          STORAGE_KEYS.PENYAKIT,
          STORAGE_KEYS.PENGATURAN,
          STORAGE_KEYS.AUDIT_LOG,
          STORAGE_KEYS.SIDB_HISTORY,
          STORAGE_KEYS.MASTER_OBAT,
          STORAGE_KEYS.RESEP_OBAT,
        ];
    for (const k of targets) {
      this.dirtyStorageKeys.add(k);
    }
    if (!this.storageFlushTimer) {
      this.storageFlushTimer = setTimeout(() => {
        this.flushLocalStorage();
      }, 150);
    }
  }

  public logAudit(aksi: string, rincian: string) {
    const log: AuditLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      waktu: new Date().toISOString(),
      aksi,
      rincian,
      perangkat: navigator.userAgent.includes('Mobile') ? 'Smartphone' : 'Komputer Desktop',
    };
    this.auditLogs.unshift(log);
    if (this.auditLogs.length > 500) {
      this.auditLogs = this.auditLogs.slice(0, 500);
    }
    this.saveToLocalStorage([STORAGE_KEYS.AUDIT_LOG]);
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('logAudit', () =>
        this.apiFetch('/api/audit', {
          method: 'POST',
          body: JSON.stringify(log),
        })
      );
    }
  }

  // WBP Methods
  public getWbpList(): WbpItem[] {
    if (this.cachedWbpList && this.cachedWbpVersion === this.version) {
      return this.cachedWbpList;
    }

    // Single O(K) pass to resolve the latest non-empty room per patient
    const latestById = new Map<string, { time: number; kamar: string }>();
    const latestByName = new Map<string, { time: number; kamar: string }>();

    for (let i = 0; i < this.kunjunganList.length; i++) {
      const k = this.kunjunganList[i];
      if (k.dihapus) continue;
      const room = k.kamar ? k.kamar.trim() : '';
      if (!room || room === '-') continue;
      const time = parseDateMs(k.tanggal) ?? 0;

      if (k.wbp_id) {
        const prev = latestById.get(k.wbp_id);
        if (!prev || time > prev.time) {
          latestById.set(k.wbp_id, { time, kamar: room });
        }
      }
      if (k.nama) {
        const cleanName = k.nama.trim().toLowerCase();
        if (cleanName) {
          const prev = latestByName.get(cleanName);
          if (!prev || time > prev.time) {
            latestByName.set(cleanName, { time, kamar: room });
          }
        }
      }
    }

    const result = this.wbpList.map((w) => {
      const cleanName = w.nama ? w.nama.trim().toLowerCase() : '';
      const fromId = latestById.get(w.id);
      const fromName = cleanName ? latestByName.get(cleanName) : undefined;
      let latestRoom = '';
      if (fromId && fromName) {
        latestRoom = fromId.time >= fromName.time ? fromId.kamar : fromName.kamar;
      } else {
        latestRoom = fromId?.kamar || fromName?.kamar || '';
      }

      const currentRoom = (latestRoom || w.kamar_sidb || w.kamar || '').trim();
      const currentBlok = determineBlokByKamar(currentRoom);
      return {
        ...w,
        kamar: currentRoom,
        blok: currentBlok,
      };
    });

    this.cachedWbpList = result;
    this.cachedWbpVersion = this.version;
    return result;
  }

  public getWbpById(id: string): WbpItem | undefined {
    return this.getWbpList().find((w) => w.id === id);
  }

  public findWbpByNameOrNik(query: string): WbpItem[] {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];
    return this.getWbpList().filter(
      (w) =>
        w.nama.toLowerCase().includes(clean) ||
        (w.nik && w.nik.toLowerCase().includes(clean)) ||
        (w.no_reg_instansi && w.no_reg_instansi.toLowerCase().includes(clean))
    );
  }

  public addWbp(item: Omit<WbpItem, 'id' | 'no'>): WbpItem {
    const newId = 'wbp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const newNo = this.wbpList.length > 0 ? Math.max(...this.wbpList.map((w) => w.no || 0)) + 1 : 1;
    const cleanRoom = (item.kamar || item.kamar_sidb || '').trim();
    const autoBlok = determineBlokByKamar(cleanRoom);
    const newItem: WbpItem = {
      ...item,
      id: newId,
      no: newNo,
      kamar: cleanRoom,
      blok: autoBlok,
      kamar_sidb: item.kamar_sidb || cleanRoom,
      dibuat_pada: new Date().toISOString(),
      terakhir_diperbarui: new Date().toISOString(),
    };
    this.wbpList.push(newItem);
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('addWbp', () =>
        this.apiFetch('/api/wbp', {
          method: 'POST',
          body: JSON.stringify(newItem),
        })
      );
    }

    this.logAudit('Tambah WBP', `Menambah data WBP: ${newItem.nama} (NIK: ${newItem.nik})`);
    return newItem;
  }

  public updateWbp(id: string, updates: Partial<WbpItem>, syncToServer = true): WbpItem | null {
    const idx = this.wbpList.findIndex((w) => w.id === id);
    if (idx === -1) return null;
    const finalKamar = updates.kamar !== undefined ? updates.kamar.trim() : (this.wbpList[idx].kamar || '').trim();
    const finalBlok =
      updates.kamar !== undefined
        ? determineBlokByKamar(finalKamar)
        : updates.blok !== undefined
          ? updates.blok
          : determineBlokByKamar(finalKamar);

    this.wbpList[idx] = {
      ...this.wbpList[idx],
      ...updates,
      kamar: finalKamar,
      blok: finalBlok,
      terakhir_diperbarui: new Date().toISOString(),
    };
    this.saveToLocalStorage();
    this.notifyListeners();

    if (syncToServer && typeof window !== 'undefined') {
      const itemSnapshot = { ...this.wbpList[idx] };
      void this.enqueueServerWrite('updateWbp', () =>
        this.apiFetch(`/api/wbp/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(itemSnapshot),
        })
      );
    }

    this.logAudit('Ubah WBP', `Memperbarui data WBP: ${this.wbpList[idx].nama}`);
    return this.wbpList[idx];
  }

  public deleteWbp(id: string): boolean {
    const idx = this.wbpList.findIndex((w) => w.id === id);
    if (idx === -1) return false;
    const deleted = this.wbpList.splice(idx, 1)[0];
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('deleteWbp', () =>
        this.apiFetch(`/api/wbp/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
      );
    }

    this.logAudit('Hapus WBP', `Menghapus WBP: ${deleted.nama}`);
    return true;
  }

  public async applySidbUpdates(params: {
    newWbp: WbpItem[];
    updatedWbp: WbpItem[];
    missingIds: string[];
    history: Omit<SidbUpdateHistory, 'id'>;
  }) {
    const nowIso = new Date().toISOString();
    const changedItems: WbpItem[] = [];

    params.newWbp.forEach((w) => {
      const cleanRoom = (w.kamar || w.kamar_sidb || '').trim();
      const item: WbpItem = {
        ...w,
        kamar: cleanRoom,
        blok: determineBlokByKamar(cleanRoom),
        sumber_update: 'SIDB',
        terakhir_diperbarui: nowIso,
        dibuat_pada: w.dibuat_pada || nowIso,
      };
      this.wbpList.push(item);
      changedItems.push(item);
    });

    params.updatedWbp.forEach((u) => {
      const idx = this.wbpList.findIndex((w) => w.id === u.id);
      if (idx !== -1) {
        const cleanRoom = (u.kamar || u.kamar_sidb || '').trim();
        this.wbpList[idx] = {
          ...this.wbpList[idx],
          ...u,
          kamar: cleanRoom,
          blok: determineBlokByKamar(cleanRoom),
          sumber_update: 'SIDB',
          terakhir_diperbarui: nowIso,
        };
        changedItems.push(this.wbpList[idx]);
      }
    });

    params.missingIds.forEach((id) => {
      const idx = this.wbpList.findIndex((w) => w.id === id);
      if (idx !== -1) {
        this.wbpList[idx] = {
          ...this.wbpList[idx],
          perlu_dicek: true,
          sumber_update: 'SIDB',
          terakhir_diperbarui: nowIso,
        };
        changedItems.push(this.wbpList[idx]);
      }
    });

    const histItem: SidbUpdateHistory = {
      ...params.history,
      id: 'sidb-' + Date.now(),
    };
    this.sidbHistory.unshift(histItem);
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      await this.enqueueBatchWrite(async () => {
        if (changedItems.length > 0) {
          await this.apiFetchChecked('/api/wbp/batch', {
            method: 'POST',
            body: JSON.stringify(changedItems),
          });
        }
        await this.apiFetchChecked('/api/sidb-history', {
          method: 'POST',
          body: JSON.stringify(histItem),
        });
      });
    }

    this.logAudit(
      'Update SIDB',
      `Sinkronisasi SIDB "${params.history.nama_file}": +${params.newWbp.length} baru, ${params.updatedWbp.length} diperbarui, ${params.missingIds.length} dicek`
    );
  }

  public async bulkImportWbp(items: WbpItem[], replaceAll = false) {
    const nowIso = new Date().toISOString();
    const normalizedItems = items.map((w) => {
      const room = (w.kamar || w.kamar_sidb || '').trim();
      return {
        ...w,
        kamar: room,
        blok: determineBlokByKamar(room),
        sumber_update: w.sumber_update || 'Impor',
        terakhir_diperbarui: nowIso,
        dibuat_pada: w.dibuat_pada || nowIso,
      };
    });

    if (replaceAll) {
      this.wbpList = normalizedItems;
    } else {
      for (const item of normalizedItems) {
        const existingIdx = this.wbpList.findIndex(
          (w) =>
            (w.nik && item.nik && w.nik === item.nik) ||
            w.nama.trim().toLowerCase() === item.nama.trim().toLowerCase()
        );
        if (existingIdx !== -1) {
          this.wbpList[existingIdx] = { ...this.wbpList[existingIdx], ...item };
        } else {
          this.wbpList.push(item);
        }
      }
    }
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      const payload = [...this.wbpList];
      await this.enqueueBatchWrite(async () => {
        if (replaceAll) {
          await this.apiFetchChecked('/api/wbp/all', { method: 'DELETE' });
        }
        await this.apiFetchChecked('/api/wbp/batch', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      });
    }

    this.logAudit(
      'Impor WBP',
      `Mengimpor ${items.length} WBP (${replaceAll ? 'Timpa Semua' : 'Tambah/Perbarui'})`
    );
  }

  // Kunjungan Methods
  public getRawKunjungan(): KunjunganItem[] {
    return this.kunjunganList;
  }

  public getCalculatedKunjungan(includeDeleted = false): CalculatedKunjungan[] {
    if (!includeDeleted && this.cachedCalcActive && this.cachedCalcActiveVersion === this.version) {
      return this.cachedCalcActive;
    }
    if (includeDeleted && this.cachedCalcAll && this.cachedCalcAllVersion === this.version) {
      return this.cachedCalcAll;
    }

    const list = this.getWbpList();
    const wbpMap = new Map<string, WbpItem>();
    const wbpNikMap = new Map<string, WbpItem>();
    const wbpNameMap = new Map<string, WbpItem>();
    for (const w of list) {
      wbpMap.set(w.id, w);
      if (w.nik && w.nik.trim()) {
        wbpNikMap.set(w.nik.trim().toLowerCase(), w);
      }
      if (w.nama && w.nama.trim()) {
        wbpNameMap.set(w.nama.trim().toLowerCase(), w);
      }
    }

    // Group active visits once by wbp_id, nik, and lowercased name for O(1) per-patient lookups
    type VisitMeta = { id: string; tanggal: string; timeMs: number | null };
    const activeByWbpId = new Map<string, VisitMeta[]>();
    const activeByNik = new Map<string, VisitMeta[]>();
    const activeByName = new Map<string, VisitMeta[]>();

    for (let i = 0; i < this.kunjunganList.length; i++) {
      const item = this.kunjunganList[i];
      if (item.dihapus) continue;
      const meta: VisitMeta = {
        id: item.id,
        tanggal: item.tanggal,
        timeMs: parseDateMs(item.tanggal),
      };
      if (item.wbp_id) {
        let arr = activeByWbpId.get(item.wbp_id);
        if (!arr) {
          arr = [];
          activeByWbpId.set(item.wbp_id, arr);
        }
        arr.push(meta);
      }
      if (item.nik && item.nik.trim()) {
        const cleanNik = item.nik.trim().toLowerCase();
        let arr = activeByNik.get(cleanNik);
        if (!arr) {
          arr = [];
          activeByNik.set(cleanNik, arr);
        }
        arr.push(meta);
      }
      if (item.nama) {
        const cleanName = item.nama.trim().toLowerCase();
        if (cleanName) {
          let arr = activeByName.get(cleanName);
          if (!arr) {
            arr = [];
            activeByName.set(cleanName, arr);
          }
          arr.push(meta);
        }
      }
    }

    const limitDays = this.pengaturan.periode_sering_hari || 7;
    const limitCount = this.pengaturan.batas_sering_berobat_kali || 7;
    const windowMs = limitDays * 24 * 60 * 60 * 1000;

    const filtered = includeDeleted ? this.kunjunganList : this.kunjunganList.filter((k) => !k.dihapus);

    const calculated = filtered.map((k) => {
      const cleanName = k.nama ? k.nama.trim().toLowerCase() : '';
      const cleanNik = k.nik ? k.nik.trim().toLowerCase() : '';
      let wbp = k.wbp_id ? wbpMap.get(k.wbp_id) : undefined;
      if (!wbp && cleanNik) {
        wbp = wbpNikMap.get(cleanNik);
      }
      if (!wbp && cleanName) {
        wbp = wbpNameMap.get(cleanName);
      }

      const ref1 = this.resolveComplaint(k.keluhan1);
      const ref2 = this.resolveComplaint(k.keluhan2);
      const ref3 = this.resolveComplaint(k.keluhan3);

      const resolvedWbpId = wbp?.id || k.wbp_id;
      const idMatches = resolvedWbpId ? activeByWbpId.get(resolvedWbpId) : undefined;
      const nikMatches = cleanNik ? activeByNik.get(cleanNik) : undefined;
      const nameMatches = cleanName ? activeByName.get(cleanName) : undefined;

      const kTime = parseDateMs(k.tanggal);
      const timeWindowStart = kTime !== null ? kTime - windowMs : 0;

      let is_duplicate = false;
      let frequent_count = 0;

      const groupCount = (idMatches ? 1 : 0) + (nikMatches ? 1 : 0) + (nameMatches ? 1 : 0);
      const seenIds = groupCount > 1 ? new Set<string>() : null;

      const checkGroup = (group: VisitMeta[] | undefined) => {
        if (!group) return;
        for (let i = 0; i < group.length; i++) {
          const other = group[i];
          if (seenIds) {
            if (seenIds.has(other.id)) continue;
            seenIds.add(other.id);
          }
          if (!is_duplicate && other.id !== k.id && other.tanggal === k.tanggal) {
            is_duplicate = true;
          }
          if (kTime !== null && other.timeMs !== null && other.timeMs >= timeWindowStart && other.timeMs <= kTime) {
            frequent_count += 1;
          }
        }
      };

      checkGroup(idMatches);
      checkGroup(nikMatches);
      checkGroup(nameMatches);

      const is_frequent = kTime !== null && frequent_count >= limitCount;
      const status_wbp: 'Aktif' | 'TIDAK DITEMUKAN' = wbp ? 'Aktif' : 'TIDAK DITEMUKAN';
      const batch_bpjs = wbp?.batch_bpjs || 'Belum masuk batch';

      return {
        ...k,
        penyakit1: ref1.penyakit,
        penyakit2: ref2.penyakit,
        penyakit3: ref3.penyakit,
        jenis1: ref1.jenis,
        jenis2: ref2.jenis,
        jenis3: ref3.jenis,
        icd10_1: ref1.icd10,
        icd10_2: ref2.icd10,
        icd10_3: ref3.icd10,
        nama_icd10_1: ref1.nama_icd10,
        nama_icd10_2: ref2.nama_icd10,
        nama_icd10_3: ref3.nama_icd10,
        status_wbp,
        batch_bpjs,
        is_duplicate,
        is_frequent,
        frequent_count,
        frequent_days: limitDays,
        wbp,
      };
    });

    if (includeDeleted) {
      this.cachedCalcAll = calculated;
      this.cachedCalcAllVersion = this.version;
    } else {
      this.cachedCalcActive = calculated;
      this.cachedCalcActiveVersion = this.version;
    }

    return calculated;
  }

  private getRefLookupMap() {
    if (this.refLookupMap && this.refLookupVersion === this.version) {
      return this.refLookupMap;
    }
    const penyakitByName = new Map<string, PenyakitItem>();
    for (let i = 0; i < this.penyakitList.length; i++) {
      const p = this.penyakitList[i];
      penyakitByName.set(p.penyakit.trim().toLowerCase(), p);
    }
    const map = new Map<
      string,
      { penyakit: string; icd10?: string; nama_icd10?: string; jenis?: JenisPenyakit }
    >();
    for (let i = 0; i < this.referensiList.length; i++) {
      const r = this.referensiList[i];
      const key = r.keluhan.trim().toLowerCase();
      if (map.has(key)) continue;
      let currentJenis = r.jenis;
      if (r.masuk_penyakit) {
        const pen = penyakitByName.get(r.masuk_penyakit.trim().toLowerCase());
        if (pen) currentJenis = pen.jenis;
      }
      map.set(key, {
        penyakit: r.masuk_penyakit || '',
        icd10: r.kode_icd10 || '',
        nama_icd10: r.nama_icd10 || '',
        jenis: currentJenis,
      });
    }
    this.refLookupMap = map;
    this.refLookupVersion = this.version;
    return map;
  }

  public resolveComplaint(keluhan?: string): {
    penyakit: string;
    icd10?: string;
    nama_icd10?: string;
    jenis?: JenisPenyakit;
  } {
    if (!keluhan || !keluhan.trim()) {
      return { penyakit: '' };
    }
    const clean = keluhan.trim().toLowerCase();
    const found = this.getRefLookupMap().get(clean);
    if (found) {
      return found;
    }

    return {
      penyakit: 'CEK REFERENSI',
      icd10: 'CEK REFERENSI',
      nama_icd10: 'Keluhan belum terdaftar di referensi ICD-10',
    };
  }

  private resolveMatchingWbp(wbpId?: string, nik?: string, nama?: string): WbpItem | undefined {
    if (wbpId) {
      const byId = this.wbpList.find((w) => w.id === wbpId);
      if (byId) return byId;
    }
    const cleanNik = (nik || '').trim().toLowerCase();
    if (cleanNik) {
      const byNik = this.wbpList.find((w) => (w.nik || '').trim().toLowerCase() === cleanNik);
      if (byNik) return byNik;
    }
    const cleanName = (nama || '').trim().toLowerCase();
    if (cleanName) {
      return this.wbpList.find((w) => w.nama.trim().toLowerCase() === cleanName);
    }
    return undefined;
  }

  public addKunjungan(k: Omit<KunjunganItem, 'id' | 'dibuat_pada' | 'dihapus'>): KunjunganItem {
    const newId = 'k-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const matchedWbp = this.resolveMatchingWbp(k.wbp_id, k.nik, k.nama);
    const item: KunjunganItem = {
      ...k,
      wbp_id: matchedWbp ? matchedWbp.id : k.wbp_id || '',
      nik: (k.nik || matchedWbp?.nik || '').trim(),
      id: newId,
      dihapus: false,
      dibuat_pada: new Date().toISOString(),
    };
    this.kunjunganList.unshift(item);

    const cleanKamar = (k.kamar || '').trim();
    if (cleanKamar && matchedWbp) {
      const autoBlok = determineBlokByKamar(cleanKamar);
      this.updateWbp(matchedWbp.id, { kamar: cleanKamar, blok: autoBlok });
    }

    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('addKunjungan', () =>
        this.apiFetch('/api/kunjungan', {
          method: 'POST',
          body: JSON.stringify(item),
        })
      );
    }

    this.logAudit('Tambah Kunjungan', `Kunjungan pasien: ${k.nama} pada tanggal ${k.tanggal}`);
    return item;
  }

  public updateKunjungan(id: string, updates: Partial<KunjunganItem>): KunjunganItem | null {
    const idx = this.kunjunganList.findIndex((k) => k.id === id);
    if (idx === -1) return null;
    const merged = {
      ...this.kunjunganList[idx],
      ...updates,
    };
    const matchedWbp = this.resolveMatchingWbp(merged.wbp_id, merged.nik, merged.nama);
    this.kunjunganList[idx] = {
      ...merged,
      wbp_id: matchedWbp ? matchedWbp.id : merged.wbp_id || '',
      nik: (merged.nik || matchedWbp?.nik || '').trim(),
      diubah_pada: new Date().toISOString(),
    };
    if (updates.kamar !== undefined && matchedWbp) {
      const cleanKamar = updates.kamar.trim();
      const autoBlok = determineBlokByKamar(cleanKamar);
      this.updateWbp(matchedWbp.id, { kamar: cleanKamar, blok: autoBlok });
    }
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      const itemSnapshot = { ...this.kunjunganList[idx] };
      void this.enqueueServerWrite('updateKunjungan', () =>
        this.apiFetch(`/api/kunjungan/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(itemSnapshot),
        })
      );
    }

    this.logAudit('Ubah Kunjungan', `Memperbarui kunjungan ID ${id} (${this.kunjunganList[idx].nama})`);
    return this.kunjunganList[idx];
  }

  public softDeleteKunjungan(id: string): boolean {
    const idx = this.kunjunganList.findIndex((k) => k.id === id);
    if (idx === -1) return false;
    this.kunjunganList[idx].dihapus = true;
    this.kunjunganList[idx].diubah_pada = new Date().toISOString();
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('softDeleteKunjungan', () =>
        this.apiFetch(`/api/kunjungan/${encodeURIComponent(id)}`, { method: 'DELETE' })
      );
    }

    this.logAudit(
      'Hapus Kunjungan',
      `Menghapus (soft delete) kunjungan pasien ${this.kunjunganList[idx].nama}`
    );
    return true;
  }

  public restoreKunjungan(id: string): boolean {
    const idx = this.kunjunganList.findIndex((k) => k.id === id);
    if (idx === -1) return false;
    this.kunjunganList[idx].dihapus = false;
    this.kunjunganList[idx].diubah_pada = new Date().toISOString();
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('restoreKunjungan', () =>
        this.apiFetch(`/api/kunjungan/${encodeURIComponent(id)}/restore`, {
          method: 'PATCH',
        })
      );
    }

    this.logAudit('Pulihkan Kunjungan', `Memulihkan kunjungan pasien ${this.kunjunganList[idx].nama}`);
    return true;
  }

  public permanentDeleteKunjungan(id: string): boolean {
    const idx = this.kunjunganList.findIndex((k) => k.id === id);
    if (idx === -1) return false;
    const item = this.kunjunganList.splice(idx, 1)[0];
    this.resepObatList = this.resepObatList.filter((r) => r.kunjungan_id !== id);
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('permanentDeleteKunjungan', () =>
        this.apiFetch(`/api/kunjungan/${encodeURIComponent(id)}/permanent`, {
          method: 'DELETE',
        })
      );
    }

    this.logAudit('Hapus Permanen Kunjungan', `Menghapus permanen kunjungan pasien ${item.nama}`);
    return true;
  }

  public async bulkImportKunjungan(items: KunjunganItem[], replaceAll = false) {
    const normalized = items.map((item) => ({
      ...item,
      tanggal: normalizeDateIndo(item.tanggal),
      dihapus: false,
      dibuat_pada: item.dibuat_pada || new Date().toISOString(),
    }));

    if (replaceAll) {
      this.kunjunganList = normalized;
    } else {
      for (const item of normalized) {
        this.kunjunganList.push(item);
      }
    }

    const updatedWbps: WbpItem[] = [];
    normalized.forEach((k) => {
      const cleanRoom = (k.kamar || '').trim();
      if (cleanRoom) {
        const autoBlok = determineBlokByKamar(cleanRoom);
        if (k.wbp_id) {
          const wbpIdx = this.wbpList.findIndex((w) => w.id === k.wbp_id);
          if (wbpIdx !== -1) {
            this.wbpList[wbpIdx].kamar = cleanRoom;
            this.wbpList[wbpIdx].blok = autoBlok;
            updatedWbps.push(this.wbpList[wbpIdx]);
          }
        } else if (k.nama) {
          const wbpIdx = this.wbpList.findIndex(
            (w) => w.nama.trim().toLowerCase() === k.nama.trim().toLowerCase()
          );
          if (wbpIdx !== -1) {
            this.wbpList[wbpIdx].kamar = cleanRoom;
            this.wbpList[wbpIdx].blok = autoBlok;
            updatedWbps.push(this.wbpList[wbpIdx]);
          }
        }
      }
    });

    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      await this.enqueueBatchWrite(async () => {
        if (replaceAll) {
          await this.apiFetchChecked('/api/kunjungan/all', { method: 'DELETE' });
        }
        await this.apiFetchChecked('/api/kunjungan/batch', {
          method: 'POST',
          body: JSON.stringify(normalized),
        });
        if (updatedWbps.length > 0) {
          await this.apiFetchChecked('/api/wbp/batch', {
            method: 'POST',
            body: JSON.stringify(updatedWbps),
          });
        }
      });
    }

    this.logAudit(
      'Impor Kunjungan',
      `Mengimpor ${items.length} kunjungan (${replaceAll ? 'Timpa Semua' : 'Tambah/Perbarui'})`
    );
  }

  public async clearAllKunjungan(): Promise<void> {
    this.kunjunganList = [];
    this.resepObatList = [];
    this.saveToLocalStorage();
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      await this.enqueueBatchWrite(async () => {
        await this.apiFetchChecked('/api/kunjungan/all', { method: 'DELETE' });
      });
    }
    this.logAudit('Hapus Semua Kunjungan', 'Mengosongkan seluruh data kunjungan berobat');
  }

  public async clearAllWbp(): Promise<void> {
    this.wbpList = [];
    this.kunjunganList = [];
    this.resepObatList = [];
    this.saveToLocalStorage();
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      await this.enqueueBatchWrite(async () => {
        await this.apiFetchChecked('/api/wbp/all', { method: 'DELETE' });
      });
    }
    this.logAudit('Hapus Semua WBP', 'Mengosongkan seluruh direktori WBP dan data kunjungan terkait');
  }

  public async resetAllData(): Promise<void> {
    this.wbpList = INITIAL_WBP;
    this.kunjunganList = INITIAL_KUNJUNGAN.map((k) => ({
      ...k,
      tanggal: normalizeDateIndo(k.tanggal),
    }));
    this.referensiList = INITIAL_REFERENSI;
    this.penyakitList = INITIAL_PENYAKIT;
    this.pengaturan = INITIAL_PENGATURAN;
    this.sidbHistory = [];
    this.auditLogs = [];
    this.masterObatList = INITIAL_MASTER_OBAT;
    this.resepObatList = [];
    this.saveToLocalStorage();
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      await this.enqueueBatchWrite(async () => {
        await this.apiFetchChecked('/api/system/factory-reset', { method: 'POST' });
      });
    }
    this.logAudit('Reset Data Pabrik', 'Mengembalikan seluruh data ke konfigurasi awal bawaan');
  }

  // Referensi & Penyakit Methods
  public getReferensi(): ReferensiItem[] {
    return this.referensiList;
  }

  public addReferensi(item: Omit<ReferensiItem, 'id'>): ReferensiItem {
    const normalizedKeluhan = (item.keluhan || '').trim().toLowerCase();
    if (!normalizedKeluhan) {
      throw new Error('Nama keluhan wajib diisi.');
    }
    const existing = this.referensiList.find(
      (r) => r.keluhan.trim().toLowerCase() === normalizedKeluhan
    );
    if (existing) {
      throw new Error(
        `Keluhan "${existing.keluhan}" sudah terdaftar pada referensi (${existing.masuk_penyakit || '-'} / ${existing.kode_icd10 || '-'}).`
      );
    }

    const newId = 'ref-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const newItem: ReferensiItem = {
      ...item,
      id: newId,
      keluhan: item.keluhan.trim(),
      masuk_penyakit: (item.masuk_penyakit || '').trim(),
      kode_icd10: (item.kode_icd10 || '').trim(),
      nama_icd10: (item.nama_icd10 || '').trim(),
    };
    this.referensiList.push(newItem);
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('addReferensi', () =>
        this.apiFetch('/api/referensi', {
          method: 'POST',
          body: JSON.stringify(newItem),
        })
      );
    }

    this.logAudit('Tambah Referensi', `Menambah keluhan: ${newItem.keluhan} -> ${newItem.masuk_penyakit}`);
    return newItem;
  }

  public updateReferensi(id: string, updates: Partial<ReferensiItem>): ReferensiItem | null {
    const idx = this.referensiList.findIndex((r) => r.id === id);
    if (idx === -1) return null;

    if (updates.keluhan !== undefined) {
      const normalizedKeluhan = updates.keluhan.trim().toLowerCase();
      if (!normalizedKeluhan) {
        throw new Error('Nama keluhan wajib diisi.');
      }
      const duplicate = this.referensiList.find(
        (r) => r.id !== id && r.keluhan.trim().toLowerCase() === normalizedKeluhan
      );
      if (duplicate) {
        throw new Error(
          `Keluhan "${duplicate.keluhan}" sudah terdaftar pada referensi lain (${duplicate.masuk_penyakit || '-'} / ${duplicate.kode_icd10 || '-'}).`
        );
      }
    }

    this.referensiList[idx] = {
      ...this.referensiList[idx],
      ...updates,
      keluhan: updates.keluhan !== undefined ? updates.keluhan.trim() : this.referensiList[idx].keluhan,
      masuk_penyakit:
        updates.masuk_penyakit !== undefined
          ? updates.masuk_penyakit.trim()
          : this.referensiList[idx].masuk_penyakit,
      kode_icd10:
        updates.kode_icd10 !== undefined ? updates.kode_icd10.trim() : this.referensiList[idx].kode_icd10,
      nama_icd10:
        updates.nama_icd10 !== undefined ? updates.nama_icd10.trim() : this.referensiList[idx].nama_icd10,
    };
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      const snapshot = { ...this.referensiList[idx] };
      void this.enqueueServerWrite('updateReferensi', () =>
        this.apiFetch(`/api/referensi/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(snapshot),
        })
      );
    }

    this.logAudit('Ubah Referensi', `Memperbarui referensi keluhan ${this.referensiList[idx].keluhan}`);
    return this.referensiList[idx];
  }

  public deleteReferensi(id: string): boolean {
    const idx = this.referensiList.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    const deleted = this.referensiList.splice(idx, 1)[0];
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('deleteReferensi', () =>
        this.apiFetch(`/api/referensi/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
      );
    }

    this.logAudit('Hapus Referensi', `Menghapus referensi keluhan: ${deleted.keluhan}`);
    return true;
  }

  public getPenyakit(): PenyakitItem[] {
    return this.penyakitList;
  }

  public updatePenyakit(id: string, updates: Partial<PenyakitItem>): PenyakitItem | null {
    const idx = this.penyakitList.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    this.penyakitList[idx] = { ...this.penyakitList[idx], ...updates };

    if (updates.jenis) {
      const diseaseName = this.penyakitList[idx].penyakit.toLowerCase();
      this.referensiList.forEach((r) => {
        if (r.masuk_penyakit.toLowerCase() === diseaseName) {
          r.jenis = updates.jenis!;
        }
      });
    }

    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      const snapshot = { ...this.penyakitList[idx] };
      void this.enqueueServerWrite('updatePenyakit', () =>
        this.apiFetch(`/api/penyakit/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(snapshot),
        })
      );
    }

    this.logAudit(
      'Ubah Penyakit',
      `Memperbarui penyakit ${this.penyakitList[idx].penyakit} (Jenis: ${this.penyakitList[idx].jenis})`
    );
    return this.penyakitList[idx];
  }

  public addPenyakit(item: Omit<PenyakitItem, 'id'>): PenyakitItem {
    const newId = 'pen-' + Date.now();
    const newItem: PenyakitItem = {
      ...item,
      id: newId,
      urutan: item.urutan ?? this.penyakitList.length + 1,
    };
    this.penyakitList.push(newItem);
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('addPenyakit', () =>
        this.apiFetch('/api/penyakit', {
          method: 'POST',
          body: JSON.stringify(newItem),
        })
      );
    }

    this.logAudit('Tambah Penyakit', `Menambah penyakit baru: ${newItem.penyakit}`);
    return newItem;
  }

  public async bulkImportReferensi(items: Omit<ReferensiItem, 'id'>[], replaceAll = false) {
    const dedupedIncomingMap = new Map<string, ReferensiItem>();
    items.forEach((item, idx) => {
      const keluhanTrim = (item.keluhan || '').trim();
      if (!keluhanTrim) return;
      const key = keluhanTrim.toLowerCase();
      dedupedIncomingMap.set(key, {
        ...item,
        keluhan: keluhanTrim,
        masuk_penyakit: (item.masuk_penyakit || '').trim(),
        kode_icd10: (item.kode_icd10 || '').trim(),
        nama_icd10: (item.nama_icd10 || '').trim(),
        id: (item as any).id || `ref-imp-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      });
    });
    const newItems: ReferensiItem[] = Array.from(dedupedIncomingMap.values());

    if (replaceAll) {
      this.referensiList = newItems;
    } else {
      const existingByKeluhan = new Map<string, number>();
      this.referensiList.forEach((r, idx) => {
        existingByKeluhan.set(r.keluhan.trim().toLowerCase(), idx);
      });
      newItems.forEach((item) => {
        const key = item.keluhan.trim().toLowerCase();
        if (existingByKeluhan.has(key)) {
          const idx = existingByKeluhan.get(key)!;
          this.referensiList[idx] = { ...item, id: this.referensiList[idx].id };
        } else {
          this.referensiList.push(item);
          existingByKeluhan.set(key, this.referensiList.length - 1);
        }
      });
    }

    const payloadItems = replaceAll ? this.referensiList : newItems;
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      await this.enqueueBatchWrite(async () => {
        await this.apiFetchChecked('/api/referensi/batch', {
          method: 'POST',
          body: JSON.stringify({ items: this.referensiList, replaceAll }),
        });
      });
    }

    this.logAudit(
      'Impor Referensi ICD-10',
      `Mengimpor ${payloadItems.length} referensi keluhan (${replaceAll ? 'Timpa Semua' : 'Tambah/Gabung'})`
    );
  }

  public async bulkImportPenyakit(items: Omit<PenyakitItem, 'id'>[], replaceAll = false) {
    const newItems: PenyakitItem[] = items.map((item, idx) => ({
      ...item,
      id: (item as any).id || `pen-imp-${Date.now()}-${idx}`,
      urutan: item.urutan ?? idx + 1,
    }));

    if (replaceAll) {
      this.penyakitList = newItems;
    } else {
      const existingByName = new Map<string, number>();
      this.penyakitList.forEach((p, idx) => {
        existingByName.set(p.penyakit.trim().toLowerCase(), idx);
      });
      newItems.forEach((item) => {
        const key = item.penyakit.trim().toLowerCase();
        if (existingByName.has(key)) {
          const idx = existingByName.get(key)!;
          this.penyakitList[idx] = {
            ...item,
            id: this.penyakitList[idx].id,
            urutan: this.penyakitList[idx].urutan ?? item.urutan,
          };
        } else {
          this.penyakitList.push({ ...item, urutan: this.penyakitList.length + 1 });
          existingByName.set(key, this.penyakitList.length - 1);
        }
      });
    }

    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      await this.enqueueBatchWrite(async () => {
        await this.apiFetchChecked('/api/penyakit/batch', {
          method: 'POST',
          body: JSON.stringify({ items: this.penyakitList, replaceAll }),
        });
      });
    }

    this.logAudit(
      'Impor Daftar Penyakit',
      `Mengimpor ${items.length} daftar penyakit (${replaceAll ? 'Timpa Semua' : 'Tambah/Gabung'})`
    );
  }

  public async bulkImportMasterObat(items: Omit<MasterObatItem, 'id'>[], replaceAll = false) {
    const newItems: MasterObatItem[] = items.map((item, idx) => ({
      ...item,
      id: (item as any).id || `obat-imp-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      nama: String(item.nama || '').trim(),
      kekuatan: String(item.kekuatan || '').trim(),
      satuan_terkecil: String(item.satuan_terkecil || 'tablet').trim().toLowerCase(),
      isi_per_kotak: Math.max(1, Math.round(Number(item.isi_per_kotak || 1))),
      isi_per_strip: Math.max(0, Math.round(Number(item.isi_per_strip || 0))),
      aktif: item.aktif ?? true,
      dibuat_pada: item.dibuat_pada || new Date().toISOString(),
    }));

    if (replaceAll) {
      this.masterObatList = newItems;
      this.resepObatList = [];
    } else {
      const keyOf = (o: { nama: string; kekuatan: string }) =>
        `${o.nama.trim().toLowerCase().replace(/\s+/g, ' ')}_${o.kekuatan.trim().toLowerCase().replace(/\s+/g, ' ')}`;
      const existingByKey = new Map<string, number>();
      this.masterObatList.forEach((o, idx) => existingByKey.set(keyOf(o), idx));

      newItems.forEach((item) => {
        const key = keyOf(item);
        if (existingByKey.has(key)) {
          const idx = existingByKey.get(key)!;
          this.masterObatList[idx] = {
            ...this.masterObatList[idx],
            ...item,
            id: this.masterObatList[idx].id,
          };
        } else {
          this.masterObatList.push(item);
          existingByKey.set(key, this.masterObatList.length - 1);
        }
      });
    }

    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      await this.enqueueBatchWrite(async () => {
        await this.apiFetchChecked('/api/obat/batch', {
          method: 'POST',
          body: JSON.stringify({ items: this.masterObatList, replaceAll }),
        });
      });
    }

    this.logAudit(
      'Impor Master Obat',
      `Mengimpor ${items.length} item obat (${replaceAll ? 'Timpa Semua' : 'Tambah/Gabung'})`
    );
  }

  // Pengaturan Methods
  public getPengaturan(): PengaturanApp {
    return this.pengaturan;
  }

  public updatePengaturan(updates: Partial<PengaturanApp>): Promise<boolean> {
    const next = { ...this.pengaturan, ...updates };
    const { password_hash: _omitHash, ...safeSnapshot } = next;
    this.pengaturan = next;
    this.saveToLocalStorage();
    this.notifyListeners();

    this.logAudit('Ubah Pengaturan', 'Memperbarui konfigurasi sistem');

    if (typeof window !== 'undefined') {
      return this.enqueueServerWrite('updatePengaturan', () =>
        this.apiFetch('/api/pengaturan/app_settings', {
          method: 'POST',
          body: JSON.stringify(safeSnapshot),
        })
      );
    }
    return Promise.resolve(true);
  }

  public async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.apiFetch('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          message: data?.error || 'Gagal memperbarui kata sandi.',
        };
      }
      this.logAudit('Ubah Password', 'Mengubah kata sandi akses login klinik');
      return {
        success: true,
        message: data?.message || 'Kata sandi berhasil diperbarui!',
      };
    } catch {
      return {
        success: false,
        message: 'Gagal menghubungi server untuk mengubah kata sandi.',
      };
    }
  }

  public getAuditLogs(): AuditLog[] {
    return this.auditLogs;
  }

  public getSidbHistory(): SidbUpdateHistory[] {
    return this.sidbHistory;
  }

  public addSidbHistory(history: Omit<SidbUpdateHistory, 'id'>) {
    const item: SidbUpdateHistory = {
      ...history,
      id: 'sidb-' + Date.now(),
    };
    this.sidbHistory.unshift(item);
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('addSidbHistory', () =>
        this.apiFetch('/api/sidb-history', {
          method: 'POST',
          body: JSON.stringify(item),
        })
      );
    }
  }

  // Comprehensive Full Backup Export & Restore (All Entities + Settings + Logs + Preferences)
  private readLocalPreferences() {
    if (typeof window === 'undefined') {
      return { theme: 'light', signature_defaults: null as any };
    }
    const theme = localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
    let signature_defaults: any = null;
    try {
      const rawSig = localStorage.getItem('klinik_dompu_signature_defaults_v1');
      if (rawSig) signature_defaults = JSON.parse(rawSig);
    } catch {
      signature_defaults = null;
    }
    return { theme, signature_defaults };
  }

  public exportFullBackup(): string {
    const prefs = this.readLocalPreferences();
    const data = {
      version: '2.0',
      app_name: 'Klinik Pratama Lapas Kelas IIB Dompu',
      exported_at: new Date().toISOString(),
      counts: {
        wbp: this.wbpList.length,
        kunjungan_total: this.kunjunganList.length,
        kunjungan_aktif: this.kunjunganList.filter((k) => !k.dihapus).length,
        kunjungan_sampah: this.kunjunganList.filter((k) => k.dihapus).length,
        referensi: this.referensiList.length,
        penyakit: this.penyakitList.length,
        sidb_history: this.sidbHistory.length,
        audit_logs: this.auditLogs.length,
        master_obat: this.masterObatList.length,
        resep_obat: this.resepObatList.length,
      },
      wbp: this.wbpList,
      kunjungan: this.kunjunganList,
      referensi: this.referensiList,
      penyakit: this.penyakitList,
      pengaturan: this.pengaturan,
      sidb_history: this.sidbHistory,
      audit_logs: this.auditLogs,
      master_obat: this.masterObatList,
      resep_obat: this.resepObatList,
      preferences: prefs,
    };
    return JSON.stringify(data, null, 2);
  }

  public async exportFullBackupAsync(): Promise<string> {
    const prefs = this.readLocalPreferences();
    try {
      const res = await this.apiFetch('/api/backup/export');
      if (res.ok) {
        const serverBackup = await res.json();
        serverBackup.preferences = prefs;
        return JSON.stringify(serverBackup, null, 2);
      }
    } catch {
      // fallback to local
    }
    return this.exportFullBackup();
  }

  public async importFullBackupAsync(jsonString: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') return false;
      if (
        !Array.isArray(data.wbp) &&
        !Array.isArray(data.kunjungan) &&
        !Array.isArray(data.referensi) &&
        !Array.isArray(data.penyakit) &&
        !Array.isArray(data.master_obat)
      ) {
        return false;
      }

      if (Array.isArray(data.wbp)) this.wbpList = data.wbp;
      if (Array.isArray(data.kunjungan)) {
        this.kunjunganList = data.kunjungan.map((k: KunjunganItem) => ({
          ...k,
          tanggal: normalizeDateIndo(k.tanggal),
        }));
      }
      if (Array.isArray(data.referensi)) this.referensiList = data.referensi;
      if (Array.isArray(data.penyakit)) this.penyakitList = data.penyakit;
      if (data.pengaturan) this.pengaturan = { ...INITIAL_PENGATURAN, ...data.pengaturan };
      if (Array.isArray(data.sidb_history)) this.sidbHistory = data.sidb_history;
      if (Array.isArray(data.audit_logs)) this.auditLogs = data.audit_logs;
      if (Array.isArray(data.master_obat)) this.masterObatList = data.master_obat;
      if (Array.isArray(data.resep_obat)) this.resepObatList = data.resep_obat;
      if (typeof window !== 'undefined') {
        if (data.preferences?.theme) {
          localStorage.setItem(STORAGE_KEYS.THEME, data.preferences.theme);
          document.documentElement.classList.toggle('dark', data.preferences.theme === 'dark');
        }
        if (data.preferences?.signature_defaults) {
          localStorage.setItem(
            'klinik_dompu_signature_defaults_v1',
            JSON.stringify(data.preferences.signature_defaults)
          );
          window.dispatchEvent(new CustomEvent('klinik:signature-defaults-updated'));
        }
      }

      this.saveToLocalStorage();
      this.notifyListeners();

      if (typeof window !== 'undefined') {
        const payload = {
          wbp: this.wbpList,
          kunjungan: this.kunjunganList,
          referensi: this.referensiList,
          penyakit: this.penyakitList,
          pengaturan: this.pengaturan,
          sidb_history: this.sidbHistory,
          audit_logs: this.auditLogs,
          master_obat: this.masterObatList,
          resep_obat: this.resepObatList,
        };
        await this.enqueueBatchWrite(async () => {
          await this.apiFetchChecked('/api/backup/restore', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        });
      }

      this.logAudit('Pulihkan Backup', 'Memulihkan cadangan menyeluruh sistem ke Cloud SQL');
      return true;
    } catch (e) {
      console.error('Invalid backup file', e);
      return false;
    }
  }

  public importFullBackup(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') return false;
      void this.importFullBackupAsync(jsonString);
      return true;
    } catch {
      return false;
    }
  }

  // Patient Medical Record (Rekam Medis) aggregator
  public getPatientMedicalRecord(patientIdOrName: string) {
    const list = this.getWbpList();
    const cleanQuery = patientIdOrName.trim().toLowerCase();
    let patient = list.find((w) => w.id === patientIdOrName);
    if (!patient && cleanQuery) {
      patient = list.find((w) => (w.nik || '').trim().toLowerCase() === cleanQuery);
    }
    if (!patient && cleanQuery) {
      patient = list.find((w) => w.nama.trim().toLowerCase() === cleanQuery);
    }

    const calculated = this.getCalculatedKunjungan(false);
    const patientCleanName = patient ? patient.nama.trim().toLowerCase() : cleanQuery;
    const patientCleanNik = patient?.nik ? patient.nik.trim().toLowerCase() : '';

    const patientVisits = calculated
      .filter((k) => {
        if (patient) {
          const kName = (k.nama || '').trim().toLowerCase();
          const kNik = (k.nik || '').trim().toLowerCase();
          return (
            k.wbp_id === patient.id ||
            (patientCleanNik !== '' && kNik === patientCleanNik) ||
            (patientCleanName !== '' && kName === patientCleanName)
          );
        }
        return (k.nama || '').trim().toLowerCase() === cleanQuery;
      })
      .sort((a, b) => {
        const dateA = parseDateMs(a.tanggal) || 0;
        const dateB = parseDateMs(b.tanggal) || 0;
        return dateB - dateA;
      });

    const totalVisits = patientVisits.length;

    const witaNow = getWitaDateParts();
    const currentMonth = witaNow.month;
    const currentYear = witaNow.year;

    const thisMonthVisits = patientVisits.filter((k) => {
      const d = parseDate(k.tanggal);
      return d && d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
    });

    const illnessCounts: Record<
      string,
      { label: string; count: number; jenis?: JenisPenyakit; icd10?: string }
    > = {};
    const contagiousIllnessMap = new Map<string, string>();

    thisMonthVisits.forEach((v) => {
      [
        { name: v.penyakit1, jenis: v.jenis1, icd10: v.icd10_1 },
        { name: v.penyakit2, jenis: v.jenis2, icd10: v.icd10_2 },
        { name: v.penyakit3, jenis: v.jenis3, icd10: v.icd10_3 },
      ].forEach((p) => {
        const trimmedName = (p.name || '').trim();
        if (trimmedName && trimmedName !== 'CEK REFERENSI') {
          const key = trimmedName.toLowerCase();
          if (!illnessCounts[key]) {
            illnessCounts[key] = {
              label: trimmedName,
              count: 0,
              jenis: p.jenis,
              icd10: p.icd10,
            };
          }
          illnessCounts[key].count++;
          if (p.jenis === 'Menular' && !contagiousIllnessMap.has(key)) {
            contagiousIllnessMap.set(key, trimmedName);
          }
        }
      });
    });

    const sortedIllnesses = Object.values(illnessCounts)
      .map((data) => ({
        penyakit: data.label,
        count: data.count,
        jenis: data.jenis,
        icd10: data.icd10,
      }))
      .sort((a, b) => b.count - a.count);

    const contagiousIllnessesThisMonth = Array.from(contagiousIllnessMap.values());
    const last10Visits = patientVisits.slice(0, 10);
    const firstVisit = patientVisits.length > 0 ? patientVisits[patientVisits.length - 1] : null;
    const previousVisit = patientVisits.length > 1 ? patientVisits[1] : null;

    const todayStartMs = getWitaTodayDate().getTime();
    const sevenDaysAgoStart = todayStartMs - 6 * 86400000;
    const todayEndMs = todayStartMs + 86400000 - 1;
    const last7DaysVisits = patientVisits.filter((k) => {
      const ms = parseDateMs(k.tanggal);
      return ms !== null && ms >= sevenDaysAgoStart && ms <= todayEndMs;
    });

    return {
      patient,
      totalKunjungan: totalVisits,
      totalVisits,
      kunjunganBulanIni: thisMonthVisits.length,
      thisMonthVisitsCount: thisMonthVisits.length,
      kunjungan7HariTerakhir: last7DaysVisits.length,
      firstVisitDate: firstVisit?.tanggal || null,
      previousVisitDate: previousVisit?.tanggal || null,
      previousVisitDaysAgo: previousVisit ? getRelativeTime(previousVisit.tanggal) : null,
      sortedIllnesses,
      contagiousIllnessesThisMonth,
      last10Visits,
      allVisits: patientVisits,
    };
  }

  public getCanonicalPatientKey(v: {
    wbp?: { id?: string } | null;
    wbp_id?: string;
    nik?: string;
    nama?: string;
  }): string {
    if (v.wbp?.id) return v.wbp.id;
    if (v.wbp_id && v.wbp_id.trim()) return v.wbp_id.trim();
    if (v.nik && v.nik.trim()) return `nik:${v.nik.trim().toLowerCase()}`;
    if (v.nama && v.nama.trim()) return `name:${v.nama.trim().toLowerCase()}`;
    return '';
  }

  public calculateMetrics(visits: CalculatedKunjungan[]) {
    const totalKunjungan = visits.length;
    const uniquePatients = new Set<string>();
    let unregisteredCount = 0;

    const casesByDisease: Record<string, number> = {};
    const patientsByDisease: Record<string, Set<string>> = {};
    const contagiousCasesVisits = new Set<string>();
    const contagiousPatients = new Set<string>();

    let totalDiagnosa = 0;
    let totalDiagnosaMenular = 0;
    let totalDiagnosaTidakMenular = 0;

    visits.forEach((v) => {
      const patientKey = this.getCanonicalPatientKey(v);
      if (patientKey) {
        uniquePatients.add(patientKey);
      }
      if (!v.wbp_id && !v.wbp) {
        unregisteredCount++;
      }

      const diseasesInVisit = new Set<string>();
      let hasContagious = false;

      [
        { name: v.penyakit1, jenis: v.jenis1 },
        { name: v.penyakit2, jenis: v.jenis2 },
        { name: v.penyakit3, jenis: v.jenis3 },
      ].forEach((p) => {
        const cleanDisease = (p.name || '').trim();
        if (cleanDisease && cleanDisease !== 'CEK REFERENSI') {
          totalDiagnosa += 1;
          if (p.jenis === 'Menular') {
            totalDiagnosaMenular += 1;
            hasContagious = true;
          } else {
            totalDiagnosaTidakMenular += 1;
          }
          diseasesInVisit.add(cleanDisease);
        }
      });

      diseasesInVisit.forEach((diseaseName) => {
        casesByDisease[diseaseName] = (casesByDisease[diseaseName] || 0) + 1;
        if (!patientsByDisease[diseaseName]) {
          patientsByDisease[diseaseName] = new Set();
        }
        if (patientKey) {
          patientsByDisease[diseaseName].add(patientKey);
        }
      });

      if (hasContagious) {
        contagiousCasesVisits.add(v.id);
        if (patientKey) {
          contagiousPatients.add(patientKey);
        }
      }
    });

    const pasienUnikCount = uniquePatients.size;
    const kunjunganPerPasien = pasienUnikCount > 0 ? totalKunjungan / pasienUnikCount : 0;

    return {
      totalKunjungan,
      pasienUnikCount,
      unregisteredCount,
      kunjunganPerPasien,
      casesByDisease,
      patientsByDisease,
      totalKasusMenular: contagiousCasesVisits.size,
      pasienUnikMenular: contagiousPatients.size,
      totalDiagnosa,
      totalDiagnosaMenular,
      totalDiagnosaTidakMenular,
    };
  }

  // =========================================================================
  // MASTER OBAT & RESEP OBAT METHODS
  // =========================================================================

  public getMasterObatList(onlyActive = false): MasterObatItem[] {
    if (onlyActive) {
      return this.masterObatList.filter((o) => o.aktif);
    }
    return this.masterObatList;
  }

  public getMasterObatById(id: string): MasterObatItem | undefined {
    return this.masterObatList.find((o) => o.id === id);
  }

  public isObatUsedInResep(obatId: string): boolean {
    const activeVisitIds = new Set(this.kunjunganList.filter((k) => !k.dihapus).map((k) => k.id));
    return this.resepObatList.some((r) => r.obat_id === obatId && activeVisitIds.has(r.kunjungan_id));
  }

  public getResepCountByObatId(obatId: string): number {
    const activeVisitIds = new Set(this.kunjunganList.filter((k) => !k.dihapus).map((k) => k.id));
    return this.resepObatList.filter((r) => r.obat_id === obatId && activeVisitIds.has(r.kunjungan_id)).length;
  }

  public deleteMasterObat(id: string, force = false): boolean {
    const isUsed = this.isObatUsedInResep(id);
    if (isUsed && !force) {
      throw new Error(
        'Obat yang sudah pernah dipakai di kunjungan TIDAK boleh dihapus, hanya boleh dinonaktifkan.'
      );
    }
    const idx = this.masterObatList.findIndex((o) => o.id === id);
    if (idx === -1) return false;
    const deleted = this.masterObatList.splice(idx, 1)[0];
    this.resepObatList = this.resepObatList.filter((r) => r.obat_id !== id);
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('deleteMasterObat', () =>
        this.apiFetch(`/api/obat/${encodeURIComponent(id)}`, { method: 'DELETE' })
      );
    }

    this.logAudit(
      'Hapus Master Obat',
      `Menghapus obat: ${deleted.nama} ${deleted.kekuatan}${force ? ' (termasuk riwayat resep)' : ''}`
    );
    return true;
  }

  public saveMasterObat(obat: Omit<MasterObatItem, 'id'> & { id?: string }): {
    success: boolean;
    data: MasterObatItem;
  } {
    const cleanNama = obat.nama.trim().replace(/\s+/g, ' ');
    const cleanKekuatan = obat.kekuatan.trim().replace(/\s+/g, ' ');

    if (!cleanNama) throw new Error('Nama obat wajib diisi.');
    if (!cleanKekuatan) throw new Error('Kekuatan/sediaan obat wajib diisi.');
    if (!obat.satuan_terkecil) throw new Error('Satuan terkecil wajib dipilih.');
    const isiPerKotak = Math.round(Number(obat.isi_per_kotak));
    if (isNaN(isiPerKotak) || isiPerKotak <= 0) {
      throw new Error('Isi per 1 kotak wajib berupa bilangan bulat lebih dari 0.');
    }
    const rawStrip = obat.isi_per_strip !== undefined && obat.isi_per_strip !== null ? Math.round(Number(obat.isi_per_strip)) : 0;
    if (isNaN(rawStrip) || rawStrip < 0) {
      throw new Error('Isi per 1 strip tidak boleh bernilai negatif.');
    }
    if (rawStrip === 1) {
      throw new Error('Isi per 1 strip minimal 2, atau isi 0 jika obat tidak dikemas per strip.');
    }
    if (rawStrip > 0 && rawStrip >= isiPerKotak) {
      throw new Error('Isi per 1 strip harus lebih kecil dari isi per 1 kotak (atau isi 0 jika tidak memakai strip).');
    }

    const newKey = `${cleanNama.toLowerCase()}_${cleanKekuatan.toLowerCase()}`;
    const duplicate = this.masterObatList.find(
      (o) =>
        o.id !== obat.id &&
        `${o.nama.trim().toLowerCase().replace(/\s+/g, ' ')}_${o.kekuatan.trim().toLowerCase().replace(/\s+/g, ' ')}` ===
          newKey
    );

    if (duplicate) {
      throw new Error(`Obat "${cleanNama} ${cleanKekuatan}" sudah terdaftar dalam Master Obat.`);
    }

    if (obat.id) {
      const idx = this.masterObatList.findIndex((o) => o.id === obat.id);
      if (idx === -1) throw new Error('Data obat tidak ditemukan.');

      const updated: MasterObatItem = {
        ...this.masterObatList[idx],
        nama: cleanNama,
        kekuatan: cleanKekuatan,
        satuan_terkecil: obat.satuan_terkecil.trim(),
        isi_per_kotak: isiPerKotak,
        isi_per_strip: rawStrip,
        aktif: obat.aktif ?? true,
        diubah_pada: new Date().toISOString(),
      };
      this.masterObatList[idx] = updated;
      this.saveToLocalStorage();
      this.notifyListeners();

      if (typeof window !== 'undefined') {
        void this.enqueueServerWrite('saveMasterObat', () =>
          this.apiFetch('/api/obat', {
            method: 'POST',
            body: JSON.stringify(updated),
          })
        );
      }

      this.logAudit('Ubah Master Obat', `Memperbarui obat: ${cleanNama} ${cleanKekuatan}`);
      return { success: true, data: updated };
    } else {
      const newId = 'obat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const created: MasterObatItem = {
        id: newId,
        nama: cleanNama,
        kekuatan: cleanKekuatan,
        satuan_terkecil: obat.satuan_terkecil.trim(),
        isi_per_kotak: isiPerKotak,
        isi_per_strip: rawStrip,
        aktif: obat.aktif ?? true,
        dibuat_pada: new Date().toISOString(),
      };
      this.masterObatList.unshift(created);
      this.saveToLocalStorage();
      this.notifyListeners();

      if (typeof window !== 'undefined') {
        void this.enqueueServerWrite('saveMasterObat', () =>
          this.apiFetch('/api/obat', {
            method: 'POST',
            body: JSON.stringify(created),
          })
        );
      }

      this.logAudit('Tambah Master Obat', `Menambahkan obat baru: ${cleanNama} ${cleanKekuatan}`);
      return { success: true, data: created };
    }
  }

  public getResepObatList(): ResepObatItem[] {
    if (this.cachedResepList && this.cachedResepVersion === this.version) {
      return this.cachedResepList;
    }
    const obatMap = new Map<string, MasterObatItem>();
    for (let i = 0; i < this.masterObatList.length; i++) {
      obatMap.set(this.masterObatList[i].id, this.masterObatList[i]);
    }
    const enriched = this.resepObatList.map((r) => {
      const obat = obatMap.get(r.obat_id);
      const nama = obat ? obat.nama : 'Obat Tidak Dikenal';
      const kekuatan = obat ? obat.kekuatan : '';
      const satuan = obat ? obat.satuan_terkecil : 'satuan';
      return {
        ...r,
        nama_obat: nama,
        obat_nama: kekuatan ? `${nama} ${kekuatan}` : nama,
        kekuatan,
        obat_kekuatan: kekuatan,
        satuan_terkecil: satuan,
        satuan,
        isi_per_kotak: obat ? obat.isi_per_kotak : 1,
        isi_per_strip: obat ? (obat.isi_per_strip ?? 0) : 0,
      };
    });
    this.cachedResepList = enriched;
    this.cachedResepVersion = this.version;
    return enriched;
  }

  public getResepByKunjunganId(kunjunganId: string): ResepObatItem[] {
    return this.getResepObatList().filter((r) => r.kunjungan_id === kunjunganId);
  }

  public saveResepForKunjungan(kunjunganId: string, items: ResepObatItem[]): void {
    this.resepObatList = this.resepObatList.filter((r) => r.kunjungan_id !== kunjunganId);

    const valid = items
      .filter((i) => i.obat_id && Number(i.jumlah_diberikan) > 0)
      .map((i, idx) => ({
        ...i,
        id: i.id || `resep-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        kunjungan_id: kunjunganId,
        jumlah_diberikan: Math.max(1, Math.round(Number(i.jumlah_diberikan))),
      }));

    this.resepObatList.push(...valid);
    this.saveToLocalStorage();
    this.notifyListeners();

    if (typeof window !== 'undefined') {
      void this.enqueueServerWrite('saveResepForKunjungan', () =>
        this.apiFetch(`/api/resep/kunjungan/${encodeURIComponent(kunjunganId)}`, {
          method: 'PUT',
          body: JSON.stringify(valid),
        })
      );
    }
  }
}

export function formatSetaraKotak(
  total: number,
  isiPerKotak: number,
  satuan: string,
  isiPerStrip = 0
): string {
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  const kotakSize = Math.round(Number(isiPerKotak) || 0);
  const stripSize = Math.round(Number(isiPerStrip) || 0);

  const hasKotak = kotakSize > 0;
  const hasStrip = stripSize > 1 && (!hasKotak || stripSize < kotakSize);

  let remaining = safeTotal;
  const parts: string[] = [];

  if (hasKotak) {
    const kotak = Math.floor(remaining / kotakSize);
    if (kotak > 0) {
      parts.push(`${kotak} kotak`);
      remaining = remaining % kotakSize;
    }
  }

  if (hasStrip && remaining > 0) {
    const strip = Math.floor(remaining / stripSize);
    if (strip > 0) {
      parts.push(`${strip} strip`);
      remaining = remaining % stripSize;
    }
  }

  if (remaining > 0 || parts.length === 0) {
    parts.push(`${remaining} ${satuan}`);
  }

  return parts.join(' + ');
}

export const store = new DataStore();

export function useStoreSync(): number {
  const [version, setVersion] = useState(() => store.getVersion());
  useEffect(() => {
    return store.subscribe(() => {
      setVersion(store.getVersion());
    });
  }, []);
  return version;
}
