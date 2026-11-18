/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { checkDatabaseHealth } from './src/db/index.ts';
import {
  getAllWbp,
  upsertWbpSingle,
  upsertWbpBatch,
  deleteWbpById,
  clearAllWbpFromDb,
  getAllKunjungan,
  getActiveKunjungan,
  getArchiveYearSummary,
  archiveKunjunganByYear,
  restoreArchivedKunjunganByYear,
  getArchivedKunjunganByYear,
  getArchivedKunjunganForPatient,
  insertKunjungan,
  updateKunjunganById,
  insertKunjunganBatch,
  clearAllKunjunganFromDb,
  softDeleteKunjungan,
  restoreKunjunganById,
  permanentDeleteKunjunganById,
  getAllPenyakit,
  upsertPenyakit,
  getAllReferensi,
  upsertReferensi,
  deleteReferensiById,
  updateReferensiJenisByPenyakit,
  getSetting,
  setSetting,
  getAuditLogs,
  addAuditLog,
  getSidbHistoryList,
  addSidbHistoryEntry,
  seedPenyakitIfEmpty,
  seedReferensiIfEmpty,
  seedWbpIfEmpty,
  seedKunjunganIfEmpty,
  seedMasterObatIfEmpty,
  getAllMasterObat,
  upsertMasterObat,
  deleteMasterObatById,
  getAllResepObat,
  getActiveResepObat,
  replaceResepForKunjungan,
  deleteResepByKunjunganId,
  replaceReferensiBatch,
  replacePenyakitBatch,
  replaceMasterObatBatch,
  restoreAllTables,
  getSharedSyncVersion,
  touchSharedSyncVersion,
  type WbpInsert,
  type KunjunganInsert,
  type ReferensiInsert,
  type PenyakitInsert,
  type SidbHistoryInsert,
  type AuditLogInsert,
  type MasterObatInsert,
  type ResepObatInsert,
} from './src/db/queries.ts';
import {
  constantTimeEquals,
  createSessionToken,
  hashPasswordSha256,
  requireAuth,
} from './src/middleware/auth.ts';
import {
  INITIAL_KUNJUNGAN,
  INITIAL_MASTER_OBAT,
  INITIAL_PENGATURAN,
  INITIAL_PENYAKIT,
  INITIAL_REFERENSI,
  INITIAL_WBP,
} from './src/data/initialData.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);

// Built-in gzip compression for large JSON APIs and static text/JS/CSS responses
app.use((req, res, next) => {
  if (req.method === 'HEAD' || req.path === '/api/events') return next();
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!/\bgzip\b/i.test(acceptEncoding)) return next();

  const chunks: Buffer[] = [];
  let buffering = true;

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  const isCompressible = () => {
    if (res.statusCode === 204 || res.statusCode === 304) return false;
    if (res.getHeader('Content-Encoding')) return false;
    const ct = String(res.getHeader('Content-Type') || '').toLowerCase();
    if (!ct || ct.includes('text/event-stream')) return false;
    return (
      ct.includes('application/json') ||
      ct.includes('text/') ||
      ct.includes('javascript') ||
      ct.includes('xml') ||
      ct.includes('svg')
    );
  };

  const flushRaw = () => {
    buffering = false;
    for (const c of chunks) {
      origWrite(c);
    }
    chunks.length = 0;
  };

  (res as any).write = (chunk: any, encoding?: any, cb?: any) => {
    if (!buffering) {
      return origWrite(chunk, encoding, cb);
    }
    if (!isCompressible()) {
      flushRaw();
      return origWrite(chunk, encoding, cb);
    }
    if (chunk) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk, typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8')
      );
    }
    if (typeof encoding === 'function') encoding();
    else if (typeof cb === 'function') cb();
    return true;
  };

  (res as any).end = (chunk?: any, encoding?: any, cb?: any) => {
    if (typeof chunk === 'function') {
      cb = chunk;
      chunk = undefined;
    } else if (typeof encoding === 'function') {
      cb = encoding;
      encoding = undefined;
    }

    if (!buffering) {
      return origEnd(chunk, encoding, cb);
    }
    buffering = false;

    if (chunk) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk, typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8')
      );
    }

    if (chunks.length === 0) {
      return origEnd(cb);
    }

    const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    chunks.length = 0;

    if (!isCompressible() || body.length < 1024) {
      return origEnd(body, cb);
    }

    zlib.gzip(body, (err, compressed) => {
      if (err || !compressed || compressed.length >= body.length) {
        return origEnd(body, cb);
      }
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(compressed.length));
      return origEnd(compressed, cb);
    });

    return res;
  };

  next();
});

app.use(express.json({ limit: '50mb' }));

// Prevent proxies / mobile browsers from caching live API responses
app.use('/api', (req, res, next) => {
  if (req.path !== '/events') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// ============================================================================
// REAL-TIME MULTI-DEVICE BROADCAST (SSE + DB-SHARED VERSION)
// ============================================================================
let syncVersion = Date.now();
const sseClients = new Set<express.Response>();

async function broadcastSync(scope: string, sourceClientId?: string) {
  syncVersion = await touchSharedSyncVersion(scope);
  const payload = JSON.stringify({
    type: 'sync',
    version: syncVersion,
    scope,
    sourceClientId: sourceClientId || null,
    timestamp: new Date().toISOString(),
  });
  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

app.get('/api/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(
    `data: ${JSON.stringify({ type: 'connected', version: syncVersion, timestamp: new Date().toISOString() })}\n\n`
  );

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// ============================================================================
// DATA MAPPERS (DB <-> API/Frontend Canonical Shapes)
// ============================================================================
function mapWbpFromClient(w: any): WbpInsert {
  return {
    id: String(w.id),
    no: w.no !== undefined && w.no !== null ? Number(w.no) : null,
    nik: w.nik ?? '',
    noRegInstansi: w.no_reg_instansi ?? w.noRegInstansi ?? '',
    nama: String(w.nama || ''),
    jenisKelamin: w.jenis_kelamin ?? w.jenisKelamin ?? 'Laki-laki',
    tempatLahir: w.tempat_lahir ?? w.tempatLahir ?? '',
    tanggalLahir: w.tanggal_lahir ?? w.tanggalLahir ?? '',
    alamat: w.alamat ?? '',
    namaAyah: w.nama_ayah ?? w.namaAyah ?? '',
    namaIbu: w.nama_ibu ?? w.namaIbu ?? '',
    pekerjaan: w.pekerjaan ?? '',
    jenisKejahatan: w.jenis_kejahatan ?? w.jenisKejahatan ?? '',
    kategori: w.kategori ?? 'Narapidana',
    lamaPidana: w.lama_pidana ?? w.lamaPidana ?? '',
    tanggalMasuk: w.tanggal_masuk ?? w.tanggalMasuk ?? '',
    tglEkspirasi: w.tgl_ekspirasi ?? w.tglEkspirasi ?? '',
    blok: w.blok ?? '',
    kamar: w.kamar ?? '',
    kamarSidb: w.kamar_sidb ?? w.kamarSidb ?? w.kamar ?? '',
    lokasiSel: w.lokasi_sel ?? w.lokasiSel ?? '',
    tglSuratPenahanan: w.tgl_surat_penahanan ?? w.tglSuratPenahanan ?? '',
    nomorSuratPenahanan: w.nomor_surat_penahanan ?? w.nomorSuratPenahanan ?? '',
    statusData: w.status_data ?? w.statusData ?? 'Aktif',
    batchBpjs: w.batch_bpjs ?? w.batchBpjs ?? 'Belum masuk batch',
    statusSkrining: w.status_skrining ?? w.statusSkrining ?? '',
    kendalaBpjs: w.kendala_bpjs ?? w.kendalaBpjs ?? '',
    dasarPbi: w.dasar_pbi ?? w.dasarPbi ?? '',
    catatanPenggabungan: w.catatan_penggabungan ?? w.catatanPenggabungan ?? '',
    perluDicek: Boolean(w.perlu_dicek ?? w.perluDicek ?? false),
    sumberUpdate: w.sumber_update ?? w.sumberUpdate ?? '',
    terakhirDiperbarui: w.terakhir_diperbarui ?? w.terakhirDiperbarui ?? '',
    dibuatPada: w.dibuat_pada ?? w.dibuatPada ?? '',
  };
}

function mapWbpToClient(dw: any, idx: number) {
  return {
    id: dw.id,
    no: dw.no ?? idx + 1,
    nik: dw.nik || '',
    no_reg_instansi: dw.noRegInstansi || '',
    nama: dw.nama,
    jenis_kelamin: dw.jenisKelamin || 'Laki-laki',
    tempat_lahir: dw.tempatLahir || '',
    tanggal_lahir: dw.tanggalLahir || '',
    alamat: dw.alamat || '',
    nama_ayah: dw.namaAyah || '',
    nama_ibu: dw.namaIbu || '',
    pekerjaan: dw.pekerjaan || '',
    jenis_kejahatan: dw.jenisKejahatan || '',
    kategori: dw.kategori || 'Narapidana',
    lama_pidana: dw.lamaPidana || '',
    tanggal_masuk: dw.tanggalMasuk || '',
    tgl_ekspirasi: dw.tglEkspirasi || '',
    blok: dw.blok || '',
    kamar: dw.kamar || '',
    kamar_sidb: dw.kamarSidb || dw.kamar || '',
    lokasi_sel: dw.lokasiSel || '',
    tgl_surat_penahanan: dw.tglSuratPenahanan || '',
    nomor_surat_penahanan: dw.nomorSuratPenahanan || '',
    status_data: dw.statusData || 'Aktif',
    batch_bpjs: dw.batchBpjs || 'Belum masuk batch',
    status_skrining: dw.statusSkrining || '',
    kendala_bpjs: dw.kendalaBpjs || '',
    dasar_pbi: dw.dasarPbi || '',
    catatan_penggabungan: dw.catatanPenggabungan || '',
    perlu_dicek: Boolean(dw.perluDicek),
    sumber_update: dw.sumberUpdate || '',
    terakhir_diperbarui: dw.terakhirDiperbarui || '',
    dibuat_pada: dw.dibuatPada || (dw.createdAt ? new Date(dw.createdAt).toISOString() : ''),
  };
}

function mapKunjunganFromClient(k: any): KunjunganInsert {
  return {
    id: String(k.id),
    tanggal: String(k.tanggal || ''),
    wbpId: k.wbp_id ?? k.wbpId ?? null,
    nama: String(k.nama || ''),
    nik: k.nik ?? '',
    kamar: k.kamar ?? '',
    keluhan1: k.keluhan1 ?? '',
    keluhan2: k.keluhan2 ?? '',
    keluhan3: k.keluhan3 ?? '',
    penyakit1: k.penyakit1 ?? '',
    jenis1: k.jenis1 ?? '',
    penyakit2: k.penyakit2 ?? '',
    jenis2: k.jenis2 ?? '',
    penyakit3: k.penyakit3 ?? '',
    jenis3: k.jenis3 ?? '',
    terapi: k.terapi ?? '',
    dokterPemeriksa: k.dokter_pemeriksa ?? k.dokterPemeriksa ?? '',
    perawat: k.perawat ?? '',
    catatan: k.catatan ?? '',
    dihapus: Boolean(k.dihapus ?? false),
    arsip: Boolean(k.arsip ?? false),
    arsipTahun:
      k.arsip_tahun !== undefined && k.arsip_tahun !== null && k.arsip_tahun !== ''
        ? Number(k.arsip_tahun)
        : k.arsipTahun !== undefined && k.arsipTahun !== null && k.arsipTahun !== ''
        ? Number(k.arsipTahun)
        : null,
    dibuatPada: k.dibuat_pada ?? k.dibuatPada ?? new Date().toISOString(),
    diubahPada: k.diubah_pada ?? k.diubahPada ?? null,
  };
}

function mapKunjunganToClient(dk: any) {
  return {
    id: dk.id,
    tanggal: dk.tanggal,
    wbp_id: dk.wbpId || '',
    nama: dk.nama,
    nik: dk.nik || '',
    kamar: dk.kamar || '',
    keluhan1: dk.keluhan1 || '',
    keluhan2: dk.keluhan2 || '',
    keluhan3: dk.keluhan3 || '',
    penyakit1: dk.penyakit1 || '',
    jenis1: dk.jenis1 || undefined,
    penyakit2: dk.penyakit2 || '',
    jenis2: dk.jenis2 || undefined,
    penyakit3: dk.penyakit3 || '',
    jenis3: dk.jenis3 || undefined,
    terapi: dk.terapi || '',
    dokter_pemeriksa: dk.dokterPemeriksa || '',
    perawat: dk.perawat || '',
    catatan: dk.catatan || '',
    dihapus: Boolean(dk.dihapus),
    arsip: Boolean(dk.arsip),
    arsip_tahun: dk.arsipTahun ?? undefined,
    dibuat_pada: dk.dibuatPada || (dk.createdAt ? new Date(dk.createdAt).toISOString() : new Date().toISOString()),
    diubah_pada: dk.diubahPada || undefined,
  };
}

function mapReferensiFromClient(r: any): ReferensiInsert {
  return {
    id: String(r.id),
    keluhan: String(r.keluhan || ''),
    masukPenyakit: r.masuk_penyakit ?? r.masukPenyakit ?? '',
    kodeIcd10: r.kode_icd10 ?? r.kodeIcd10 ?? '',
    namaIcd10: r.nama_icd10 ?? r.namaIcd10 ?? '',
    jenis: r.jenis ?? 'Tidak Menular',
    catatan: r.catatan ?? '',
  };
}

function mapReferensiToClient(r: any) {
  return {
    id: r.id,
    keluhan: r.keluhan,
    masuk_penyakit: r.masukPenyakit || '',
    kode_icd10: r.kodeIcd10 || '',
    nama_icd10: r.namaIcd10 || '',
    jenis: r.jenis || 'Tidak Menular',
    catatan: r.catatan || '',
  };
}

function mapPenyakitFromClient(p: any, idx: number): PenyakitInsert {
  return {
    id: String(p.id),
    kategori: String(p.kategori || ''),
    penyakit: String(p.penyakit || ''),
    jenis: String(p.jenis || 'Tidak Menular'),
    urutan: p.urutan !== undefined ? Number(p.urutan) : idx + 1,
  };
}

function mapPenyakitToClient(p: any) {
  return {
    id: p.id,
    kategori: p.kategori,
    penyakit: p.penyakit,
    jenis: p.jenis,
    urutan: p.urutan,
  };
}

function mapSidbFromClient(h: any): SidbHistoryInsert {
  return {
    id: String(h.id),
    tanggal: String(h.tanggal || new Date().toISOString()),
    namaFile: String(h.nama_file ?? h.namaFile ?? ''),
    totalBaris: Number(h.total_baris ?? h.totalBaris ?? 0),
    wbpBaru: Number(h.wbp_baru ?? h.wbpBaru ?? 0),
    wbpDiperbarui: Number(h.wbp_diperbarui ?? h.wbpDiperbarui ?? 0),
    wbpDitandaiCek: Number(h.wbp_ditandai_cek ?? h.wbpDitandaiCek ?? 0),
  };
}

function mapSidbToClient(h: any) {
  return {
    id: h.id,
    tanggal: h.tanggal,
    nama_file: h.namaFile,
    total_baris: h.totalBaris ?? 0,
    wbp_baru: h.wbpBaru ?? 0,
    wbp_diperbarui: h.wbpDiperbarui ?? 0,
    wbp_ditandai_cek: h.wbpDitandaiCek ?? 0,
  };
}

function mapAuditToClient(a: any) {
  return {
    id: a.id,
    waktu: a.waktu,
    aksi: a.aksi,
    rincian: a.rincian,
    perangkat: a.perangkat || '',
  };
}

function mapMasterObatFromClient(o: any): MasterObatInsert {
  return {
    id: String(o.id),
    nama: String(o.nama || ''),
    kekuatan: String(o.kekuatan || ''),
    satuanTerkecil: String(o.satuan_terkecil ?? o.satuanTerkecil ?? 'tablet'),
    isiPerKotak: Math.max(1, Math.round(Number(o.isi_per_kotak ?? o.isiPerKotak ?? 1))),
    isiPerStrip: Math.max(0, Math.round(Number(o.isi_per_strip ?? o.isiPerStrip ?? 0))),
    aktif: o.aktif ?? true,
  };
}

function mapMasterObatToClient(o: any) {
  return {
    id: o.id,
    nama: o.nama,
    kekuatan: o.kekuatan,
    satuan_terkecil: o.satuanTerkecil || 'tablet',
    isi_per_kotak: o.isiPerKotak ?? 1,
    isi_per_strip: o.isiPerStrip ?? 0,
    aktif: o.aktif ?? true,
    dibuat_pada: o.createdAt ? new Date(o.createdAt).toISOString() : undefined,
  };
}

function mapResepObatFromClient(r: any, kunjunganIdOverride?: string): ResepObatInsert {
  return {
    id: String(r.id),
    kunjunganId: String(kunjunganIdOverride ?? r.kunjungan_id ?? r.kunjunganId ?? ''),
    obatId: String(r.obat_id ?? r.obatId ?? ''),
    jumlahPerMinum:
      r.jumlah_per_minum !== undefined && r.jumlah_per_minum !== null && r.jumlah_per_minum !== ''
        ? String(r.jumlah_per_minum)
        : null,
    frekuensiPerHari:
      r.frekuensi_per_hari !== undefined && r.frekuensi_per_hari !== null && r.frekuensi_per_hari !== ''
        ? Number(r.frekuensi_per_hari)
        : null,
    lamaHari:
      r.lama_hari !== undefined && r.lama_hari !== null && r.lama_hari !== ''
        ? Number(r.lama_hari)
        : null,
    jumlahDiberikan: Math.max(1, Math.round(Number(r.jumlah_diberikan ?? r.jumlahDiberikan ?? 1))),
    aturanPakai: r.aturan_pakai ?? r.aturanPakai ?? null,
    catatan: r.catatan ?? null,
  };
}

function mapResepObatToClient(r: any) {
  const numMinum = r.jumlahPerMinum !== null && r.jumlahPerMinum !== undefined && r.jumlahPerMinum !== ''
    ? Number(r.jumlahPerMinum)
    : undefined;
  return {
    id: r.id,
    kunjungan_id: r.kunjunganId,
    obat_id: r.obatId,
    jumlah_per_minum: numMinum !== undefined && !isNaN(numMinum) ? numMinum : undefined,
    frekuensi_per_hari: r.frekuensiPerHari ?? undefined,
    lama_hari: r.lamaHari ?? undefined,
    jumlah_diberikan: r.jumlahDiberikan,
    aturan_pakai: r.aturanPakai || undefined,
    catatan: r.catatan || undefined,
  };
}

// ============================================================================
// INITIAL SEEDING (ONLY ONCE ON FRESH DB, LAZY ON REQUEST)
// ============================================================================
let seedCompleted = false;
let seedInFlight: Promise<void> | null = null;

async function runSeedOnce() {
  const [seededFlag, existingSettings] = await Promise.all([
    getSetting('seeded_v1'),
    getSetting('app_settings'),
  ]);

  if (seededFlag) {
    if (!existingSettings) {
      await setSetting('app_settings', INITIAL_PENGATURAN);
    }
    syncVersion = await getSharedSyncVersion();
    seedCompleted = true;
    return;
  }

  await Promise.all([
    seedPenyakitIfEmpty(INITIAL_PENYAKIT.map((p, idx) => mapPenyakitFromClient(p, idx))),
    seedReferensiIfEmpty(INITIAL_REFERENSI.map(mapReferensiFromClient)),
    seedMasterObatIfEmpty(INITIAL_MASTER_OBAT.map(mapMasterObatFromClient)),
  ]);
  await seedWbpIfEmpty(INITIAL_WBP.map(mapWbpFromClient));
  await seedKunjunganIfEmpty(INITIAL_KUNJUNGAN.map(mapKunjunganFromClient));
  if (!existingSettings) {
    await setSetting('app_settings', INITIAL_PENGATURAN);
  }
  await setSetting('seeded_v1', true);

  syncVersion = await getSharedSyncVersion();
  seedCompleted = true;
}

async function ensureSeeded() {
  if (seedCompleted) return;
  if (!seedInFlight) {
    seedInFlight = runSeedOnce().finally(() => {
      seedInFlight = null;
    });
  }
  await seedInFlight;
}

async function buildFullSnapshot(options?: { includeArchived?: boolean }) {
  const includeArchived = Boolean(options?.includeArchived);
  await ensureSeeded();
  const appSettings = await getSetting('app_settings');
  const sharedVersion = await getSharedSyncVersion();
  const [
    wbpRows,
    kunjunganRows,
    referensiRows,
    penyakitRows,
    sidbRows,
    auditRows,
    obatRows,
    resepRows,
    archiveYears,
  ] = await Promise.all([
    getAllWbp(),
    includeArchived ? getAllKunjungan() : getActiveKunjungan(),
    getAllReferensi(),
    getAllPenyakit(),
    getSidbHistoryList(),
    getAuditLogs(500),
    getAllMasterObat(),
    includeArchived ? getAllResepObat() : getActiveResepObat(),
    getArchiveYearSummary(),
  ]);

  syncVersion = sharedVersion;

  const mergedSettings =
    appSettings && typeof appSettings === 'object'
      ? { ...INITIAL_PENGATURAN, ...appSettings }
      : { ...INITIAL_PENGATURAN };
  const { password_hash: _hiddenHash, ...safePengaturan } = mergedSettings as any;

  return {
    version: sharedVersion,
    wbp: wbpRows.map(mapWbpToClient),
    kunjungan: kunjunganRows.map(mapKunjunganToClient),
    referensi: referensiRows.map(mapReferensiToClient),
    penyakit: penyakitRows.map(mapPenyakitToClient),
    pengaturan: safePengaturan,
    sidb_history: sidbRows.map(mapSidbToClient),
    audit_logs: auditRows.map(mapAuditToClient),
    master_obat: obatRows.map(mapMasterObatToClient),
    resep_obat: resepRows.map(mapResepObatToClient),
    archive_years: archiveYears,
  };
}

function sanitizeAppSettings(raw: any) {
  const merged = raw && typeof raw === 'object' ? { ...INITIAL_PENGATURAN, ...raw } : { ...INITIAL_PENGATURAN };
  const { password_hash: _hiddenHash, ...safe } = merged as any;
  return safe;
}

// ============================================================================
// HEALTH, VERSION & FULL SNAPSHOT ENDPOINTS
// ============================================================================
app.get('/api/health', async (_req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const version =
    dbHealth.mode === 'memory' || dbHealth.connected
      ? await getSharedSyncVersion()
      : syncVersion;
  res.status(dbHealth.mode === 'cloudsql' && !dbHealth.connected ? 503 : 200).json({
    ok: dbHealth.mode === 'memory' || dbHealth.connected,
    database: dbHealth.mode,
    connected: dbHealth.connected,
    version,
    timestamp: new Date().toISOString(),
    ...(dbHealth.error ? { error: dbHealth.error } : {}),
  });
});

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================
const loginAttemptsByIp = new Map<string, { count: number; lockedUntil: number }>();

app.post('/api/auth/login', async (req, res) => {
  try {
    await ensureSeeded();
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    const now = Date.now();
    const record = loginAttemptsByIp.get(ip) || { count: 0, lockedUntil: 0 };

    if (record.lockedUntil > now) {
      const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
      return res.status(429).json({
        error: `Terlalu banyak percobaan gagal. Silakan tunggu ${remainingSec} detik sebelum mencoba kembali.`,
      });
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    const rememberMe = Boolean(req.body?.rememberMe);

    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi.' });
    }

    const storedSettings = (await getSetting('app_settings')) as Record<string, any> | null;
    const expectedHash =
      typeof storedSettings?.password_hash === 'string' && storedSettings.password_hash.length === 64
        ? storedSettings.password_hash
        : INITIAL_PENGATURAN.password_hash;

    const inputHash = hashPasswordSha256(password);
    const validUser = username === 'klinik';
    const validPass = constantTimeEquals(inputHash, expectedHash);

    if (!validUser || !validPass) {
      const nextCount = record.count + 1;
      const lockedUntil = nextCount >= 5 ? now + 60 * 1000 : 0;
      loginAttemptsByIp.set(ip, { count: nextCount, lockedUntil });
      if (lockedUntil > now) {
        return res.status(429).json({
          error: 'Salah password 5 kali berturut-turut. Akses ditahan selama 1 menit demi keamanan.',
        });
      }
      return res.status(401).json({ error: 'Kombinasi username atau password tidak sesuai.' });
    }

    loginAttemptsByIp.delete(ip);
    const ttlMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const { token, expiresAt } = await createSessionToken(username, ttlMs);

    res.json({
      success: true,
      username,
      token,
      expiresAt,
      rememberMe,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Gagal memproses login' });
  }
});

app.post('/api/auth/password', requireAuth, async (req, res) => {
  try {
    await ensureSeeded();
    const clientId = req.headers['x-client-id'] as string | undefined;
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword.trim() : '';

    if (!currentPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Kata sandi baru minimal harus 6 karakter.' });
    }

    const storedSettings = ((await getSetting('app_settings')) as Record<string, any> | null) || {
      ...INITIAL_PENGATURAN,
    };
    const expectedHash =
      typeof storedSettings.password_hash === 'string' && storedSettings.password_hash.length === 64
        ? storedSettings.password_hash
        : INITIAL_PENGATURAN.password_hash;

    if (!constantTimeEquals(hashPasswordSha256(currentPassword), expectedHash)) {
      return res.status(400).json({ error: 'Kata sandi saat ini tidak sesuai.' });
    }

    const nextHash = hashPasswordSha256(newPassword);
    await setSetting('app_settings', {
      ...INITIAL_PENGATURAN,
      ...storedSettings,
      password_hash: nextHash,
    });
    await broadcastSync('pengaturan', clientId);

    res.json({ success: true, message: 'Kata sandi berhasil diperbarui!' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Gagal mengubah kata sandi' });
  }
});

app.get('/api/sync/version', requireAuth, async (_req, res) => {
  try {
    const version = await getSharedSyncVersion();
    syncVersion = version;
    res.json({ version });
  } catch (error: any) {
    res.status(503).json({ error: error.message });
  }
});

app.get('/api/sync/state', requireAuth, async (_req, res) => {
  try {
    const snapshot = await buildFullSnapshot();
    res.json(snapshot);
  } catch (error: any) {
    res.status(503).json({ error: error.message });
  }
});

app.get('/api/backup/export', requireAuth, async (_req, res) => {
  try {
    const snapshot = await buildFullSnapshot({ includeArchived: true });
    res.json({
      version: '2.0',
      app_name: 'Klinik Pratama Lapas Kelas IIB Dompu',
      exported_at: new Date().toISOString(),
      counts: {
        wbp: snapshot.wbp.length,
        kunjungan_total: snapshot.kunjungan.length,
        kunjungan_aktif: snapshot.kunjungan.filter((k: any) => !k.dihapus).length,
        kunjungan_sampah: snapshot.kunjungan.filter((k: any) => k.dihapus).length,
        referensi: snapshot.referensi.length,
        penyakit: snapshot.penyakit.length,
        master_obat: snapshot.master_obat.length,
        resep_obat: snapshot.resep_obat.length,
        sidb_history: snapshot.sidb_history.length,
        audit_logs: snapshot.audit_logs.length,
      },
      wbp: snapshot.wbp,
      kunjungan: snapshot.kunjungan,
      referensi: snapshot.referensi,
      penyakit: snapshot.penyakit,
      pengaturan: snapshot.pengaturan,
      sidb_history: snapshot.sidb_history,
      audit_logs: snapshot.audit_logs,
      master_obat: snapshot.master_obat,
      resep_obat: snapshot.resep_obat,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/backup/restore', requireAuth, async (req, res) => {
  try {
    const data = req.body;
    const clientId = req.headers['x-client-id'] as string | undefined;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Format cadangan tidak valid' });
    }

    const wbpRows: WbpInsert[] = Array.isArray(data.wbp) ? data.wbp.map(mapWbpFromClient) : [];
    const wbpIdSet = new Set(wbpRows.map((w) => w.id));
    const kunjunganRows: KunjunganInsert[] = Array.isArray(data.kunjungan)
      ? data.kunjungan.map((k: any) => {
          const mapped = mapKunjunganFromClient(k);
          if (mapped.wbpId && !wbpIdSet.has(mapped.wbpId)) {
            mapped.wbpId = null;
          }
          return mapped;
        })
      : [];
    const kunjunganIdSet = new Set(kunjunganRows.map((k) => k.id));
    const referensiRows: ReferensiInsert[] = Array.isArray(data.referensi)
      ? data.referensi.map(mapReferensiFromClient)
      : INITIAL_REFERENSI.map(mapReferensiFromClient);
    const penyakitRows: PenyakitInsert[] = Array.isArray(data.penyakit)
      ? data.penyakit.map((p: any, idx: number) => mapPenyakitFromClient(p, idx))
      : INITIAL_PENYAKIT.map((p, idx) => mapPenyakitFromClient(p, idx));
    const sidbRows: SidbHistoryInsert[] = Array.isArray(data.sidb_history)
      ? data.sidb_history.map(mapSidbFromClient)
      : [];
    const auditRows: AuditLogInsert[] = Array.isArray(data.audit_logs)
      ? data.audit_logs.map((a: any) => ({
          id: String(a.id),
          waktu: String(a.waktu || new Date().toISOString()),
          aksi: String(a.aksi || 'Log'),
          rincian: String(a.rincian || ''),
          perangkat: a.perangkat ?? '',
        }))
      : [];
    const masterObatRows: MasterObatInsert[] | undefined = Array.isArray(data.master_obat)
      ? data.master_obat.map(mapMasterObatFromClient)
      : undefined;
    const validObatIdSet = new Set(
      (masterObatRows ?? (await getAllMasterObat())).map((o) => o.id)
    );
    const resepObatRows: ResepObatInsert[] | undefined = Array.isArray(data.resep_obat)
      ? data.resep_obat
          .map((r: any) => mapResepObatFromClient(r))
          .filter((r: ResepObatInsert) => kunjunganIdSet.has(r.kunjunganId) && validObatIdSet.has(r.obatId))
      : undefined;

    const existingSettings = (await getSetting('app_settings')) as Record<string, any> | null;
    const incomingSettings = data.pengaturan && typeof data.pengaturan === 'object' ? data.pengaturan : {};
    const preservedHash =
      typeof incomingSettings.password_hash === 'string' && incomingSettings.password_hash.length === 64
        ? incomingSettings.password_hash
        : typeof existingSettings?.password_hash === 'string' && existingSettings.password_hash.length === 64
        ? existingSettings.password_hash
        : INITIAL_PENGATURAN.password_hash;

    await restoreAllTables({
      wbp: wbpRows,
      kunjungan: kunjunganRows,
      referensi: referensiRows,
      penyakit: penyakitRows,
      pengaturan: { ...INITIAL_PENGATURAN, ...incomingSettings, password_hash: preservedHash },
      sidbHistory: sidbRows,
      auditLogs: auditRows,
      masterObat: masterObatRows,
      resepObat: resepObatRows,
    });

    await broadcastSync('full_restore', clientId);
    res.json({ success: true, version: syncVersion });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/system/factory-reset', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    await restoreAllTables({
      wbp: INITIAL_WBP.map(mapWbpFromClient),
      kunjungan: INITIAL_KUNJUNGAN.map(mapKunjunganFromClient),
      referensi: INITIAL_REFERENSI.map(mapReferensiFromClient),
      penyakit: INITIAL_PENYAKIT.map((p, idx) => mapPenyakitFromClient(p, idx)),
      pengaturan: INITIAL_PENGATURAN,
      sidbHistory: [],
      auditLogs: [],
      masterObat: INITIAL_MASTER_OBAT.map(mapMasterObatFromClient),
      resepObat: [],
    });
    await broadcastSync('factory_reset', clientId);
    res.json({ success: true, version: syncVersion });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WBP ENDPOINTS
// ============================================================================
app.get('/api/wbp', requireAuth, async (_req, res) => {
  try {
    const list = await getAllWbp();
    res.json(list.map(mapWbpToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wbp', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertWbpSingle(mapWbpFromClient(req.body));
    await broadcastSync('wbp', clientId);
    res.json(mapWbpToClient(saved, 0));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/wbp/:id', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertWbpSingle(mapWbpFromClient({ ...req.body, id: req.params.id }));
    await broadcastSync('wbp', clientId);
    res.json(mapWbpToClient(saved, 0));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/wbp/all', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await clearAllWbpFromDb();
    await broadcastSync('wbp', clientId);
    res.json({ message: 'All WBP deleted', count: result.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/wbp/:id', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await deleteWbpById(req.params.id);
    await broadcastSync('wbp', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wbp/batch', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const items = Array.isArray(req.body) ? req.body.map(mapWbpFromClient) : [];
    const result = await upsertWbpBatch(items);
    await broadcastSync('wbp', clientId);
    res.json(result.map(mapWbpToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ARCHIVE KUNJUNGAN PER TAHUN ENDPOINTS
// ============================================================================
app.get('/api/archive/years', requireAuth, async (_req, res) => {
  try {
    const years = await getArchiveYearSummary();
    res.json({ years });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/archive/year/:year', requireAuth, async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Tahun arsip tidak valid.' });
    }
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await archiveKunjunganByYear(year);
    const years = await getArchiveYearSummary();
    await broadcastSync('archive', clientId);
    res.json({ success: true, ...result, years });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/archive/year/:year/restore', requireAuth, async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Tahun arsip tidak valid.' });
    }
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await restoreArchivedKunjunganByYear(year);
    const years = await getArchiveYearSummary();
    await broadcastSync('archive', clientId);
    res.json({ success: true, ...result, years });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/archive/year/:year', requireAuth, async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Tahun arsip tidak valid.' });
    }
    const data = await getArchivedKunjunganByYear(year);
    res.json({
      year,
      kunjungan: data.kunjungan.map(mapKunjunganToClient),
      resep_obat: data.resep.map(mapResepObatToClient),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/archive/patient', requireAuth, async (req, res) => {
  try {
    const wbpId = typeof req.query.wbpId === 'string' ? req.query.wbpId : undefined;
    const nik = typeof req.query.nik === 'string' ? req.query.nik : undefined;
    const nama = typeof req.query.nama === 'string' ? req.query.nama : undefined;
    const data = await getArchivedKunjunganForPatient({ wbpId, nik, nama });
    res.json({
      kunjungan: data.kunjungan.map(mapKunjunganToClient),
      resep_obat: data.resep.map(mapResepObatToClient),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// KUNJUNGAN ENDPOINTS
// ============================================================================
app.get('/api/kunjungan', requireAuth, async (req, res) => {
  try {
    const includeArchived = String(req.query.includeArchived || '') === 'true';
    const list = includeArchived ? await getAllKunjungan() : await getActiveKunjungan();
    res.json(list.map(mapKunjunganToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/kunjungan', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const payload = mapKunjunganFromClient(req.body);
    if (payload.wbpId === '') payload.wbpId = null;
    const result = await insertKunjungan(payload);
    await broadcastSync('kunjungan', clientId);
    res.json(mapKunjunganToClient(result));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/kunjungan/:id', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const payload = mapKunjunganFromClient({ ...req.body, id: req.params.id });
    if (payload.wbpId === '') payload.wbpId = null;
    const result = await updateKunjunganById(req.params.id, {
      ...payload,
      diubahPada: new Date().toISOString(),
    });
    await broadcastSync('kunjungan', clientId);
    res.json(result ? mapKunjunganToClient(result) : null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/kunjungan/batch', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const items = Array.isArray(req.body)
      ? req.body.map((k) => {
          const mapped = mapKunjunganFromClient(k);
          if (mapped.wbpId === '') mapped.wbpId = null;
          return mapped;
        })
      : [];
    const result = await insertKunjunganBatch(items);
    await broadcastSync('kunjungan', clientId);
    res.json(result.map(mapKunjunganToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/kunjungan/all', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await clearAllKunjunganFromDb();
    await broadcastSync('kunjungan', clientId);
    res.json({ message: 'All visits deleted', count: result.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/kunjungan/:id/restore', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await restoreKunjunganById(req.params.id);
    await broadcastSync('kunjungan', clientId);
    res.json(result.map(mapKunjunganToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/kunjungan/:id/permanent', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    await deleteResepByKunjunganId(req.params.id);
    const result = await permanentDeleteKunjunganById(req.params.id);
    await broadcastSync('kunjungan', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/kunjungan/:id', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await softDeleteKunjungan(req.params.id);
    await broadcastSync('kunjungan', clientId);
    res.json(result.map(mapKunjunganToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PENYAKIT & REFERENSI ICD-10 ENDPOINTS
// ============================================================================
app.get('/api/penyakit', requireAuth, async (_req, res) => {
  try {
    const list = await getAllPenyakit();
    res.json(list.map(mapPenyakitToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/penyakit', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertPenyakit(mapPenyakitFromClient(req.body, 0));
    await broadcastSync('penyakit', clientId);
    res.json(mapPenyakitToClient(saved));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/penyakit/:id', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertPenyakit(mapPenyakitFromClient({ ...req.body, id: req.params.id }, 0));
    if (req.body.jenis && req.body.penyakit) {
      await updateReferensiJenisByPenyakit(req.body.penyakit, req.body.jenis);
    }
    await broadcastSync('penyakit', clientId);
    res.json(mapPenyakitToClient(saved));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/penyakit/batch', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const bodyItems = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : [];
    const replaceAll = Boolean(!Array.isArray(req.body) && req.body?.replaceAll);
    const mapped = bodyItems.map((p: any, idx: number) => mapPenyakitFromClient(p, idx));
    const saved = await replacePenyakitBatch(mapped, replaceAll);
    await broadcastSync('penyakit', clientId);
    res.json(saved.map(mapPenyakitToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/referensi', requireAuth, async (_req, res) => {
  try {
    const list = await getAllReferensi();
    res.json(list.map(mapReferensiToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/referensi/batch', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const bodyItems = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : [];
    const replaceAll = Boolean(!Array.isArray(req.body) && req.body?.replaceAll);
    const mapped = bodyItems.map(mapReferensiFromClient);
    const saved = await replaceReferensiBatch(mapped, replaceAll);
    await broadcastSync('referensi', clientId);
    res.json(saved.map(mapReferensiToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/referensi', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertReferensi(mapReferensiFromClient(req.body));
    await broadcastSync('referensi', clientId);
    res.json(mapReferensiToClient(saved));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/referensi/:id', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertReferensi(mapReferensiFromClient({ ...req.body, id: req.params.id }));
    await broadcastSync('referensi', clientId);
    res.json(mapReferensiToClient(saved));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/referensi/:id', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await deleteReferensiById(req.params.id);
    await broadcastSync('referensi', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PENGATURAN, SIDB HISTORY & AUDIT LOG ENDPOINTS
// ============================================================================
app.get('/api/pengaturan/:key', requireAuth, async (req, res) => {
  try {
    const value = await getSetting(req.params.key);
    if (req.params.key === 'app_settings') {
      return res.json(sanitizeAppSettings(value));
    }
    res.json(value);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pengaturan/:key', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    let payloadToSave = req.body;
    if (req.params.key === 'app_settings') {
      const existing = (await getSetting('app_settings')) as Record<string, any> | null;
      const incoming = req.body && typeof req.body === 'object' ? { ...req.body } : {};
      delete incoming.password_hash;
      const existingHash =
        typeof existing?.password_hash === 'string' && existing.password_hash.length === 64
          ? existing.password_hash
          : INITIAL_PENGATURAN.password_hash;
      payloadToSave = {
        ...INITIAL_PENGATURAN,
        ...(existing || {}),
        ...incoming,
        password_hash: existingHash,
      };
    }
    const result = await setSetting(req.params.key, payloadToSave);
    await broadcastSync('pengaturan', clientId);
    res.json(req.params.key === 'app_settings' ? sanitizeAppSettings(result) : result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sidb-history', requireAuth, async (_req, res) => {
  try {
    const list = await getSidbHistoryList();
    res.json(list.map(mapSidbToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sidb-history', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await addSidbHistoryEntry(mapSidbFromClient(req.body));
    await broadcastSync('sidb_history', clientId);
    res.json(saved ? mapSidbToClient(saved) : null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/audit', requireAuth, async (_req, res) => {
  try {
    const list = await getAuditLogs(500);
    res.json(list.map(mapAuditToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/audit', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await addAuditLog(req.body);
    await broadcastSync('audit', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MASTER OBAT & RESEP OBAT ENDPOINTS
// ============================================================================
app.get('/api/obat', requireAuth, async (_req, res) => {
  try {
    const list = await getAllMasterObat();
    res.json(list.map(mapMasterObatToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/obat/batch', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const bodyItems = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : [];
    const replaceAll = Boolean(!Array.isArray(req.body) && req.body?.replaceAll);
    const mapped = bodyItems.map(mapMasterObatFromClient);
    const saved = await replaceMasterObatBatch(mapped, replaceAll);
    await broadcastSync('obat', clientId);
    res.json(saved.map(mapMasterObatToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/obat', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertMasterObat(mapMasterObatFromClient(req.body));
    await broadcastSync('obat', clientId);
    res.json(mapMasterObatToClient(saved));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/obat/:id', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await deleteMasterObatById(req.params.id);
    await broadcastSync('obat', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/resep', requireAuth, async (_req, res) => {
  try {
    const list = await getAllResepObat();
    res.json(list.map(mapResepObatToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/resep/kunjungan/:kunjunganId', requireAuth, async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const items = Array.isArray(req.body)
      ? req.body.map((r: any) => mapResepObatFromClient(r, req.params.kunjunganId))
      : [];
    const saved = await replaceResepForKunjungan(req.params.kunjunganId, items);
    await broadcastSync('resep', clientId);
    res.json(saved.map(mapResepObatToClient));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Ensure unknown API routes always return JSON 404 instead of SPA index.html
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Setup Vite middlewares for Frontend SPA
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(path.resolve(__dirname, 'dist'), {
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server Klinik Lapas Dompu running on http://0.0.0.0:${port}`);
  });

  const shutdown = () => {
    for (const client of sseClients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    sseClients.clear();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
