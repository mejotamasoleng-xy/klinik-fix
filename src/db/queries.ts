/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  wbp,
  kunjungan,
  daftarPenyakit,
  referensiIcd10,
  pengaturanApp,
  auditLogs,
  sidbHistory,
  masterObat,
  resepObat,
} from './schema.ts';

type WbpRow = typeof wbp.$inferSelect;
export type WbpInsert = typeof wbp.$inferInsert;
type KunjunganRow = typeof kunjungan.$inferSelect;
export type KunjunganInsert = typeof kunjungan.$inferInsert;
type PenyakitRow = typeof daftarPenyakit.$inferSelect;
export type PenyakitInsert = typeof daftarPenyakit.$inferInsert;
type ReferensiRow = typeof referensiIcd10.$inferSelect;
export type ReferensiInsert = typeof referensiIcd10.$inferInsert;
type AuditLogRow = typeof auditLogs.$inferSelect;
export type AuditLogInsert = typeof auditLogs.$inferInsert;
type SidbHistoryRow = typeof sidbHistory.$inferSelect;
export type SidbHistoryInsert = typeof sidbHistory.$inferInsert;
type MasterObatRow = typeof masterObat.$inferSelect;
export type MasterObatInsert = typeof masterObat.$inferInsert;
type ResepObatRow = typeof resepObat.$inferSelect;
export type ResepObatInsert = typeof resepObat.$inferInsert;

const memoryStore = {
  wbp: [] as WbpRow[],
  kunjungan: [] as KunjunganRow[],
  penyakit: [] as PenyakitRow[],
  referensi: [] as ReferensiRow[],
  pengaturan: new Map<string, any>(),
  auditLogs: [] as AuditLogRow[],
  sidbHistory: [] as SidbHistoryRow[],
  masterObat: [] as MasterObatRow[],
  resepObat: [] as ResepObatRow[],
};

function toWbpRow(r: WbpInsert): WbpRow {
  return {
    id: r.id,
    no: r.no ?? null,
    nik: r.nik ?? null,
    noRegInstansi: r.noRegInstansi ?? null,
    nama: r.nama,
    jenisKelamin: r.jenisKelamin ?? 'Laki-laki',
    tempatLahir: r.tempatLahir ?? null,
    tanggalLahir: r.tanggalLahir ?? null,
    alamat: r.alamat ?? null,
    namaAyah: r.namaAyah ?? null,
    namaIbu: r.namaIbu ?? null,
    pekerjaan: r.pekerjaan ?? null,
    jenisKejahatan: r.jenisKejahatan ?? null,
    kategori: r.kategori ?? 'Narapidana',
    lamaPidana: r.lamaPidana ?? null,
    tanggalMasuk: r.tanggalMasuk ?? null,
    tglEkspirasi: r.tglEkspirasi ?? null,
    blok: r.blok ?? '',
    kamar: r.kamar ?? '',
    kamarSidb: r.kamarSidb ?? '',
    lokasiSel: r.lokasiSel ?? null,
    tglSuratPenahanan: r.tglSuratPenahanan ?? null,
    nomorSuratPenahanan: r.nomorSuratPenahanan ?? null,
    statusData: r.statusData ?? 'Aktif',
    batchBpjs: r.batchBpjs ?? 'Belum masuk batch',
    statusSkrining: r.statusSkrining ?? null,
    kendalaBpjs: r.kendalaBpjs ?? null,
    dasarPbi: r.dasarPbi ?? null,
    catatanPenggabungan: r.catatanPenggabungan ?? null,
    perluDicek: r.perluDicek ?? false,
    sumberUpdate: r.sumberUpdate ?? null,
    terakhirDiperbarui: r.terakhirDiperbarui ?? null,
    dibuatPada: r.dibuatPada ?? null,
    createdAt: r.createdAt ?? new Date(),
  };
}

function toKunjunganRow(r: KunjunganInsert): KunjunganRow {
  return {
    id: r.id,
    tanggal: r.tanggal,
    wbpId: r.wbpId ?? null,
    nama: r.nama,
    nik: r.nik ?? null,
    kamar: r.kamar ?? '',
    keluhan1: r.keluhan1 ?? null,
    keluhan2: r.keluhan2 ?? null,
    keluhan3: r.keluhan3 ?? null,
    penyakit1: r.penyakit1 ?? null,
    jenis1: r.jenis1 ?? null,
    penyakit2: r.penyakit2 ?? null,
    jenis2: r.jenis2 ?? null,
    penyakit3: r.penyakit3 ?? null,
    jenis3: r.jenis3 ?? null,
    terapi: r.terapi ?? null,
    dokterPemeriksa: r.dokterPemeriksa ?? null,
    perawat: r.perawat ?? null,
    catatan: r.catatan ?? null,
    dihapus: r.dihapus ?? false,
    arsip: r.arsip ?? false,
    arsipTahun: r.arsipTahun ?? null,
    dibuatPada: r.dibuatPada ?? new Date().toISOString(),
    diubahPada: r.diubahPada ?? null,
    createdAt: r.createdAt ?? new Date(),
  };
}

// Seed helpers
export async function seedPenyakitIfEmpty(records: PenyakitInsert[]) {
  if (!db) {
    if (memoryStore.penyakit.length === 0) {
      memoryStore.penyakit = records.map((r) => ({ ...r }));
    }
    return;
  }
  const existing = await db.select({ id: daftarPenyakit.id }).from(daftarPenyakit).limit(1);
  if (existing.length === 0 && records.length > 0) {
    await db.insert(daftarPenyakit).values(records).onConflictDoNothing();
  }
}

export async function seedReferensiIfEmpty(records: ReferensiInsert[]) {
  if (!db) {
    if (memoryStore.referensi.length === 0) {
      memoryStore.referensi = records.map((r) => ({
        id: r.id,
        keluhan: r.keluhan,
        masukPenyakit: r.masukPenyakit ?? null,
        kodeIcd10: r.kodeIcd10 ?? null,
        namaIcd10: r.namaIcd10 ?? null,
        jenis: r.jenis ?? 'Tidak Menular',
        catatan: r.catatan ?? null,
      }));
    }
    return;
  }
  const existing = await db.select({ id: referensiIcd10.id }).from(referensiIcd10).limit(1);
  if (existing.length === 0 && records.length > 0) {
    await db.insert(referensiIcd10).values(records).onConflictDoNothing();
  }
}

export async function seedWbpIfEmpty(records: WbpInsert[]) {
  if (!db) {
    if (memoryStore.wbp.length === 0) {
      memoryStore.wbp = records.map(toWbpRow);
    }
    return;
  }
  const existing = await db.select({ id: wbp.id }).from(wbp).limit(1);
  if (existing.length === 0 && records.length > 0) {
    await db.insert(wbp).values(records).onConflictDoNothing();
  }
}

export async function seedKunjunganIfEmpty(records: KunjunganInsert[]) {
  if (!db) {
    if (memoryStore.kunjungan.length === 0) {
      memoryStore.kunjungan = records.map(toKunjunganRow);
    }
    return;
  }
  const existing = await db.select({ id: kunjungan.id }).from(kunjungan).limit(1);
  if (existing.length === 0 && records.length > 0) {
    await db.insert(kunjungan).values(records).onConflictDoNothing();
  }
}

// WBP Queries
export async function getAllWbp() {
  if (!db) {
    return memoryStore.wbp;
  }
  try {
    return await db.select().from(wbp);
  } catch (error) {
    console.error('Failed to fetch WBP:', error);
    throw new Error('Failed to fetch WBP records from Cloud SQL.', { cause: error });
  }
}

export async function upsertWbpSingle(record: WbpInsert) {
  const res = await upsertWbpBatch([record]);
  return res[0];
}

export async function upsertWbpBatch(records: WbpInsert[]) {
  if (!records.length) return [];
  if (!db) {
    const updated: WbpRow[] = [];
    for (const r of records) {
      const idx = memoryStore.wbp.findIndex((item) => item.id === r.id);
      const row = toWbpRow(r);
      if (idx !== -1) {
        memoryStore.wbp[idx] = { ...memoryStore.wbp[idx], ...row };
        updated.push(memoryStore.wbp[idx]);
      } else {
        memoryStore.wbp.push(row);
        updated.push(row);
      }
    }
    return updated;
  }
  try {
    const chunkSize = 100;
    const results: WbpRow[] = [];
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const res = await db
        .insert(wbp)
        .values(chunk)
        .onConflictDoUpdate({
          target: wbp.id,
          set: {
            no: sql`excluded.no`,
            nama: sql`excluded.nama`,
            nik: sql`excluded.nik`,
            noRegInstansi: sql`excluded.no_reg_instansi`,
            jenisKelamin: sql`excluded.jenis_kelamin`,
            tempatLahir: sql`excluded.tempat_lahir`,
            tanggalLahir: sql`excluded.tanggal_lahir`,
            alamat: sql`excluded.alamat`,
            namaAyah: sql`excluded.nama_ayah`,
            namaIbu: sql`excluded.nama_ibu`,
            pekerjaan: sql`excluded.pekerjaan`,
            jenisKejahatan: sql`excluded.jenis_kejahatan`,
            kategori: sql`excluded.kategori`,
            lamaPidana: sql`excluded.lama_pidana`,
            tanggalMasuk: sql`excluded.tanggal_masuk`,
            tglEkspirasi: sql`excluded.tgl_ekspirasi`,
            blok: sql`excluded.blok`,
            kamar: sql`excluded.kamar`,
            kamarSidb: sql`excluded.kamar_sidb`,
            lokasiSel: sql`excluded.lokasi_sel`,
            tglSuratPenahanan: sql`excluded.tgl_surat_penahanan`,
            nomorSuratPenahanan: sql`excluded.nomor_surat_penahanan`,
            statusData: sql`excluded.status_data`,
            batchBpjs: sql`excluded.batch_bpjs`,
            statusSkrining: sql`excluded.status_skrining`,
            kendalaBpjs: sql`excluded.kendala_bpjs`,
            dasarPbi: sql`excluded.dasar_pbi`,
            catatanPenggabungan: sql`excluded.catatan_penggabungan`,
            perluDicek: sql`excluded.perlu_dicek`,
            sumberUpdate: sql`excluded.sumber_update`,
            terakhirDiperbarui: sql`excluded.terakhir_diperbarui`,
            dibuatPada: sql`COALESCE(wbp.dibuat_pada, excluded.dibuat_pada)`,
          },
        })
        .returning();
      results.push(...res);
    }
    return results;
  } catch (error) {
    console.error('Failed to upsert WBP:', error);
    throw new Error('Failed to save WBP records.', { cause: error });
  }
}

export async function deleteWbpById(id: string) {
  if (!db) {
    const idx = memoryStore.wbp.findIndex((w) => w.id === id);
    if (idx === -1) return [];
    return memoryStore.wbp.splice(idx, 1);
  }
  try {
    return await db.delete(wbp).where(eq(wbp.id, id)).returning();
  } catch (error) {
    console.error('Failed to delete WBP:', error);
    throw new Error('Failed to delete WBP record.', { cause: error });
  }
}

// Kunjungan Queries
export function extractVisitYear(tanggal: string | null | undefined, arsipTahun?: number | null): number | null {
  if (typeof arsipTahun === 'number' && Number.isInteger(arsipTahun) && arsipTahun >= 2000 && arsipTahun <= 2100) {
    return arsipTahun;
  }
  const str = String(tanggal || '').trim();
  if (!str) return null;
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let y = parseInt(parts[2], 10);
      if (!Number.isNaN(y)) {
        if (y < 100) y += 2000;
        if (y >= 2000 && y <= 2100) return y;
      }
    }
  }
  if (str.includes('-')) {
    const clean = str.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      if (!Number.isNaN(y) && y >= 2000 && y <= 2100) return y;
    }
  }
  return null;
}

export async function getAllKunjungan() {
  if (!db) {
    return [...memoryStore.kunjungan].sort(
      (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }
  try {
    return await db.select().from(kunjungan).orderBy(desc(kunjungan.createdAt));
  } catch (error) {
    console.error('Failed to fetch Kunjungan:', error);
    throw new Error('Failed to fetch Kunjungan records from Cloud SQL.', { cause: error });
  }
}

export async function getActiveKunjungan() {
  if (!db) {
    return [...memoryStore.kunjungan]
      .filter((k) => !k.arsip)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }
  try {
    return await db
      .select()
      .from(kunjungan)
      .where(or(eq(kunjungan.arsip, false), isNull(kunjungan.arsip)))
      .orderBy(desc(kunjungan.createdAt));
  } catch (error) {
    console.error('Failed to fetch active Kunjungan:', error);
    throw new Error('Failed to fetch active Kunjungan records from Cloud SQL.', { cause: error });
  }
}

export async function getActiveResepObat() {
  if (!db) {
    const archivedIds = new Set(memoryStore.kunjungan.filter((k) => k.arsip).map((k) => k.id));
    return memoryStore.resepObat.filter((r) => !archivedIds.has(r.kunjunganId));
  }
  try {
    const rows = await db
      .select({ resep: resepObat })
      .from(resepObat)
      .innerJoin(kunjungan, eq(resepObat.kunjunganId, kunjungan.id))
      .where(or(eq(kunjungan.arsip, false), isNull(kunjungan.arsip)))
      .orderBy(desc(resepObat.createdAt));
    return rows.map((r) => r.resep);
  } catch (error) {
    console.error('Failed to fetch active Resep Obat:', error);
    throw new Error('Failed to fetch active Resep Obat records from Cloud SQL.', { cause: error });
  }
}

export async function getArchiveYearSummary() {
  const rows = !db
    ? memoryStore.kunjungan.map((k) => ({
        id: k.id,
        tanggal: k.tanggal,
        dihapus: k.dihapus,
        arsip: k.arsip,
        arsipTahun: k.arsipTahun,
      }))
    : await db
        .select({
          id: kunjungan.id,
          tanggal: kunjungan.tanggal,
          dihapus: kunjungan.dihapus,
          arsip: kunjungan.arsip,
          arsipTahun: kunjungan.arsipTahun,
        })
        .from(kunjungan);

  const byYear = new Map<
    number,
    { year: number; activeCount: number; archivedCount: number; deletedCount: number }
  >();

  for (const r of rows) {
    const yr = extractVisitYear(r.tanggal, r.arsipTahun);
    if (!yr) continue;
    let bucket = byYear.get(yr);
    if (!bucket) {
      bucket = { year: yr, activeCount: 0, archivedCount: 0, deletedCount: 0 };
      byYear.set(yr, bucket);
    }
    if (r.dihapus) {
      bucket.deletedCount += 1;
    } else if (r.arsip) {
      bucket.archivedCount += 1;
    } else {
      bucket.activeCount += 1;
    }
  }

  return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
}

async function fetchResepForKunjunganIds(kunjunganIds: string[]): Promise<ResepObatRow[]> {
  if (kunjunganIds.length === 0) return [];
  if (!db) {
    const idSet = new Set(kunjunganIds);
    return memoryStore.resepObat.filter((r) => idSet.has(r.kunjunganId));
  }
  const results: ResepObatRow[] = [];
  const chunkSize = 200;
  for (let i = 0; i < kunjunganIds.length; i += chunkSize) {
    const chunk = kunjunganIds.slice(i, i + chunkSize);
    const rows = await db
      .select()
      .from(resepObat)
      .where(inArray(resepObat.kunjunganId, chunk))
      .orderBy(desc(resepObat.createdAt));
    results.push(...rows);
  }
  return results;
}

export async function archiveKunjunganByYear(year: number) {
  const nowIso = new Date().toISOString();
  if (!db) {
    let archivedCount = 0;
    for (const k of memoryStore.kunjungan) {
      if (!k.arsip && extractVisitYear(k.tanggal) === year) {
        k.arsip = true;
        k.arsipTahun = year;
        k.diubahPada = nowIso;
        archivedCount += 1;
      }
    }
    return { year, archivedCount };
  }
  try {
    const candidates = await db
      .select({ id: kunjungan.id, tanggal: kunjungan.tanggal })
      .from(kunjungan)
      .where(or(eq(kunjungan.arsip, false), isNull(kunjungan.arsip)));
    const idsToArchive = candidates
      .filter((row) => extractVisitYear(row.tanggal) === year)
      .map((row) => row.id);

    const chunkSize = 200;
    for (let i = 0; i < idsToArchive.length; i += chunkSize) {
      const chunk = idsToArchive.slice(i, i + chunkSize);
      await db
        .update(kunjungan)
        .set({ arsip: true, arsipTahun: year, diubahPada: nowIso })
        .where(inArray(kunjungan.id, chunk));
    }
    return { year, archivedCount: idsToArchive.length };
  } catch (error) {
    console.error(`Failed to archive kunjungan for year ${year}:`, error);
    throw new Error(`Failed to archive kunjungan for year ${year}.`, { cause: error });
  }
}

export async function restoreArchivedKunjunganByYear(year: number) {
  const nowIso = new Date().toISOString();
  if (!db) {
    let restoredCount = 0;
    for (const k of memoryStore.kunjungan) {
      if (k.arsip && (k.arsipTahun ?? extractVisitYear(k.tanggal)) === year) {
        k.arsip = false;
        k.arsipTahun = null;
        k.diubahPada = nowIso;
        restoredCount += 1;
      }
    }
    return { year, restoredCount };
  }
  try {
    const candidates = await db
      .select({ id: kunjungan.id, tanggal: kunjungan.tanggal, arsipTahun: kunjungan.arsipTahun })
      .from(kunjungan)
      .where(eq(kunjungan.arsip, true));
    const idsToRestore = candidates
      .filter((row) => (row.arsipTahun ?? extractVisitYear(row.tanggal)) === year)
      .map((row) => row.id);

    const chunkSize = 200;
    for (let i = 0; i < idsToRestore.length; i += chunkSize) {
      const chunk = idsToRestore.slice(i, i + chunkSize);
      await db
        .update(kunjungan)
        .set({ arsip: false, arsipTahun: null, diubahPada: nowIso })
        .where(inArray(kunjungan.id, chunk));
    }
    return { year, restoredCount: idsToRestore.length };
  } catch (error) {
    console.error(`Failed to restore archived kunjungan for year ${year}:`, error);
    throw new Error(`Failed to restore archived kunjungan for year ${year}.`, { cause: error });
  }
}

export async function getArchivedKunjunganByYear(year: number) {
  const rows = !db
    ? memoryStore.kunjungan
        .filter((k) => Boolean(k.arsip) && !k.dihapus)
        .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
    : await db
        .select()
        .from(kunjungan)
        .where(and(eq(kunjungan.arsip, true), or(eq(kunjungan.dihapus, false), isNull(kunjungan.dihapus))))
        .orderBy(desc(kunjungan.createdAt));

  const matched = rows.filter((row) => (row.arsipTahun ?? extractVisitYear(row.tanggal)) === year);
  const resep = await fetchResepForKunjunganIds(matched.map((r) => r.id));
  return { kunjungan: matched, resep };
}

export async function getArchivedKunjunganForPatient(params: {
  wbpId?: string;
  nik?: string;
  nama?: string;
}) {
  const cleanWbpId = (params.wbpId || '').trim();
  const cleanNik = (params.nik || '').trim().toLowerCase();
  const cleanNama = (params.nama || '').trim().toLowerCase();
  if (!cleanWbpId && !cleanNik && !cleanNama) {
    return { kunjungan: [], resep: [] };
  }

  let matched: KunjunganRow[] = [];
  if (!db) {
    matched = memoryStore.kunjungan.filter((k) => {
      if (!k.arsip || k.dihapus) return false;
      const kNik = (k.nik || '').trim().toLowerCase();
      const kNama = (k.nama || '').trim().toLowerCase();
      return (
        (cleanWbpId !== '' && k.wbpId === cleanWbpId) ||
        (cleanNik !== '' && kNik === cleanNik) ||
        (cleanNama !== '' && kNama === cleanNama)
      );
    });
  } else {
    const filters = [];
    if (cleanWbpId) filters.push(eq(kunjungan.wbpId, cleanWbpId));
    if (cleanNik) filters.push(sql`LOWER(TRIM(${kunjungan.nik})) = ${cleanNik}`);
    if (cleanNama) filters.push(sql`LOWER(TRIM(${kunjungan.nama})) = ${cleanNama}`);

    matched = await db
      .select()
      .from(kunjungan)
      .where(
        and(
          eq(kunjungan.arsip, true),
          or(eq(kunjungan.dihapus, false), isNull(kunjungan.dihapus)),
          or(...filters)
        )
      )
      .orderBy(desc(kunjungan.createdAt));
  }

  const resep = await fetchResepForKunjunganIds(matched.map((r) => r.id));
  return { kunjungan: matched, resep };
}

export async function insertKunjungan(record: KunjunganInsert) {
  if (!db) {
    const row = toKunjunganRow(record);
    memoryStore.kunjungan.unshift(row);
    return row;
  }
  try {
    const result = await db
      .insert(kunjungan)
      .values(record)
      .onConflictDoUpdate({
        target: kunjungan.id,
        set: {
          tanggal: sql`excluded.tanggal`,
          wbpId: sql`excluded.wbp_id`,
          nama: sql`excluded.nama`,
          nik: sql`excluded.nik`,
          kamar: sql`excluded.kamar`,
          keluhan1: sql`excluded.keluhan1`,
          keluhan2: sql`excluded.keluhan2`,
          keluhan3: sql`excluded.keluhan3`,
          penyakit1: sql`excluded.penyakit1`,
          jenis1: sql`excluded.jenis1`,
          penyakit2: sql`excluded.penyakit2`,
          jenis2: sql`excluded.jenis2`,
          penyakit3: sql`excluded.penyakit3`,
          jenis3: sql`excluded.jenis3`,
          terapi: sql`excluded.terapi`,
          dokterPemeriksa: sql`excluded.dokter_pemeriksa`,
          perawat: sql`excluded.perawat`,
          catatan: sql`excluded.catatan`,
          dihapus: sql`excluded.dihapus`,
          arsip: sql`excluded.arsip`,
          arsipTahun: sql`excluded.arsip_tahun`,
          diubahPada: sql`excluded.diubah_pada`,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to insert Kunjungan:', error);
    throw new Error('Failed to record visit.', { cause: error });
  }
}

export async function updateKunjunganById(id: string, updates: Partial<KunjunganInsert>) {
  if (!db) {
    const idx = memoryStore.kunjungan.findIndex((k) => k.id === id);
    if (idx === -1) return null;
    memoryStore.kunjungan[idx] = { ...memoryStore.kunjungan[idx], ...updates };
    return memoryStore.kunjungan[idx];
  }
  try {
    const result = await db
      .update(kunjungan)
      .set(updates)
      .where(eq(kunjungan.id, id))
      .returning();
    return result[0] || null;
  } catch (error) {
    console.error('Failed to update Kunjungan:', error);
    throw new Error('Failed to update visit.', { cause: error });
  }
}

export async function insertKunjunganBatch(records: KunjunganInsert[]) {
  if (!records.length) return [];
  if (!db) {
    const existingIds = new Set(memoryStore.kunjungan.map((k) => k.id));
    const inserted: KunjunganRow[] = [];
    for (const r of records) {
      if (!existingIds.has(r.id)) {
        const row = toKunjunganRow(r);
        memoryStore.kunjungan.push(row);
        existingIds.add(row.id);
        inserted.push(row);
      }
    }
    return inserted;
  }
  try {
    const chunkSize = 100;
    const results = [];
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const res = await db.insert(kunjungan).values(chunk).onConflictDoNothing().returning();
      results.push(...res);
    }
    return results;
  } catch (error) {
    console.error('Failed to batch insert Kunjungan:', error);
    throw new Error('Failed to record batch visits.', { cause: error });
  }
}

export async function clearAllKunjunganFromDb() {
  if (!db) {
    const deleted = [...memoryStore.kunjungan];
    memoryStore.kunjungan = [];
    memoryStore.resepObat = [];
    return deleted;
  }
  try {
    await db.delete(resepObat);
    return await db.delete(kunjungan).returning();
  } catch (error) {
    console.error('Failed to clear kunjungan from db:', error);
    throw new Error('Failed to clear kunjungan records.', { cause: error });
  }
}

export async function clearAllWbpFromDb() {
  if (!db) {
    const deleted = [...memoryStore.wbp];
    memoryStore.resepObat = [];
    memoryStore.kunjungan = [];
    memoryStore.wbp = [];
    return deleted;
  }
  try {
    await db.delete(resepObat);
    await db.delete(kunjungan);
    return await db.delete(wbp).returning();
  } catch (error) {
    console.error('Failed to clear wbp from db:', error);
    throw new Error('Failed to clear WBP records.', { cause: error });
  }
}

export async function softDeleteKunjungan(id: string) {
  if (!db) {
    const idx = memoryStore.kunjungan.findIndex((k) => k.id === id);
    if (idx !== -1) {
      memoryStore.kunjungan[idx].dihapus = true;
      memoryStore.kunjungan[idx].diubahPada = new Date().toISOString();
      return [memoryStore.kunjungan[idx]];
    }
    return [];
  }
  try {
    return await db
      .update(kunjungan)
      .set({ dihapus: true, diubahPada: new Date().toISOString() })
      .where(eq(kunjungan.id, id))
      .returning();
  } catch (error) {
    console.error('Failed to delete visit:', error);
    throw new Error('Failed to delete visit.', { cause: error });
  }
}

export async function restoreKunjunganById(id: string) {
  if (!db) {
    const idx = memoryStore.kunjungan.findIndex((k) => k.id === id);
    if (idx !== -1) {
      memoryStore.kunjungan[idx].dihapus = false;
      memoryStore.kunjungan[idx].diubahPada = new Date().toISOString();
      return [memoryStore.kunjungan[idx]];
    }
    return [];
  }
  try {
    return await db
      .update(kunjungan)
      .set({ dihapus: false, diubahPada: new Date().toISOString() })
      .where(eq(kunjungan.id, id))
      .returning();
  } catch (error) {
    console.error('Failed to restore visit:', error);
    throw new Error('Failed to restore visit.', { cause: error });
  }
}

export async function permanentDeleteKunjunganById(id: string) {
  if (!db) {
    const idx = memoryStore.kunjungan.findIndex((k) => k.id === id);
    if (idx === -1) return [];
    return memoryStore.kunjungan.splice(idx, 1);
  }
  try {
    return await db.delete(kunjungan).where(eq(kunjungan.id, id)).returning();
  } catch (error) {
    console.error('Failed to permanently delete visit:', error);
    throw new Error('Failed to permanently delete visit.', { cause: error });
  }
}

// Penyakit & Referensi
export async function getAllPenyakit() {
  if (!db) {
    return [...memoryStore.penyakit].sort((a, b) => a.urutan - b.urutan);
  }
  try {
    return await db.select().from(daftarPenyakit).orderBy(daftarPenyakit.urutan);
  } catch (error) {
    console.error('Failed to fetch Penyakit:', error);
    throw new Error('Failed to fetch Penyakit records from Cloud SQL.', { cause: error });
  }
}

export async function upsertPenyakit(record: PenyakitInsert) {
  if (!db) {
    const idx = memoryStore.penyakit.findIndex((p) => p.id === record.id);
    if (idx !== -1) {
      memoryStore.penyakit[idx] = { ...memoryStore.penyakit[idx], ...record };
      return memoryStore.penyakit[idx];
    }
    memoryStore.penyakit.push({ ...record });
    return record;
  }
  try {
    const res = await db
      .insert(daftarPenyakit)
      .values(record)
      .onConflictDoUpdate({
        target: daftarPenyakit.id,
        set: {
          kategori: record.kategori,
          penyakit: record.penyakit,
          jenis: record.jenis,
          urutan: record.urutan,
        },
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to upsert penyakit:', error);
    throw new Error('Failed to save disease master.', { cause: error });
  }
}

export async function getAllReferensi() {
  if (!db) {
    return memoryStore.referensi;
  }
  try {
    return await db.select().from(referensiIcd10);
  } catch (error) {
    console.error('Failed to fetch Referensi:', error);
    throw new Error('Failed to fetch Referensi records from Cloud SQL.', { cause: error });
  }
}

export async function upsertReferensi(record: ReferensiInsert) {
  if (!db) {
    const idx = memoryStore.referensi.findIndex((r) => r.id === record.id);
    const row: ReferensiRow = {
      id: record.id,
      keluhan: record.keluhan,
      masukPenyakit: record.masukPenyakit ?? null,
      kodeIcd10: record.kodeIcd10 ?? null,
      namaIcd10: record.namaIcd10 ?? null,
      jenis: record.jenis ?? 'Tidak Menular',
      catatan: record.catatan ?? null,
    };
    if (idx !== -1) {
      memoryStore.referensi[idx] = { ...memoryStore.referensi[idx], ...row };
      return memoryStore.referensi[idx];
    }
    memoryStore.referensi.push(row);
    return row;
  }
  try {
    const res = await db
      .insert(referensiIcd10)
      .values(record)
      .onConflictDoUpdate({
        target: referensiIcd10.id,
        set: {
          keluhan: record.keluhan,
          masukPenyakit: record.masukPenyakit,
          kodeIcd10: record.kodeIcd10,
          namaIcd10: record.namaIcd10,
          jenis: record.jenis,
          catatan: record.catatan,
        },
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to upsert referensi:', error);
    throw new Error('Failed to save ICD-10 reference.', { cause: error });
  }
}

export async function deleteReferensiById(id: string) {
  if (!db) {
    const idx = memoryStore.referensi.findIndex((r) => r.id === id);
    if (idx === -1) return [];
    return memoryStore.referensi.splice(idx, 1);
  }
  try {
    return await db.delete(referensiIcd10).where(eq(referensiIcd10.id, id)).returning();
  } catch (error) {
    console.error('Failed to delete referensi:', error);
    throw new Error('Failed to delete ICD-10 reference.', { cause: error });
  }
}

export async function updateReferensiJenisByPenyakit(penyakitName: string, jenis: string) {
  const lower = penyakitName.trim().toLowerCase();
  if (!db) {
    memoryStore.referensi.forEach((r) => {
      if ((r.masukPenyakit || '').trim().toLowerCase() === lower) {
        r.jenis = jenis;
      }
    });
    return;
  }
  try {
    await db
      .update(referensiIcd10)
      .set({ jenis })
      .where(sql`LOWER(TRIM(${referensiIcd10.masukPenyakit})) = ${lower}`);
  } catch (error) {
    console.error('Failed to cascade disease jenis to referensi:', error);
  }
}

// Pengaturan
export async function getSetting(key: string) {
  if (!db) {
    return memoryStore.pengaturan.get(key) ?? null;
  }
  try {
    const result = await db
      .select()
      .from(pengaturanApp)
      .where(eq(pengaturanApp.key, key));
    return result[0]?.value ?? null;
  } catch (error) {
    console.error(`Failed to get setting ${key}:`, error);
    throw new Error(`Failed to load setting ${key} from Cloud SQL.`, { cause: error });
  }
}

export async function setSetting(key: string, value: any) {
  if (!db) {
    memoryStore.pengaturan.set(key, value);
    return [{ key, value }];
  }
  try {
    return await db
      .insert(pengaturanApp)
      .values({ key, value })
      .onConflictDoUpdate({
        target: pengaturanApp.key,
        set: { value },
      })
      .returning();
  } catch (error) {
    console.error(`Failed to set setting ${key}:`, error);
    throw new Error('Failed to save settings.', { cause: error });
  }
}

// Audit Logs
export async function addAuditLog(entry: AuditLogInsert) {
  if (!db) {
    const row: AuditLogRow = {
      id: entry.id,
      waktu: entry.waktu,
      aksi: entry.aksi,
      rincian: entry.rincian,
      perangkat: entry.perangkat ?? null,
      createdAt: entry.createdAt ?? new Date(),
    };
    memoryStore.auditLogs.unshift(row);
    if (memoryStore.auditLogs.length > 500) {
      memoryStore.auditLogs = memoryStore.auditLogs.slice(0, 500);
    }
    return [row];
  }
  try {
    return await db.insert(auditLogs).values(entry).onConflictDoNothing().returning();
  } catch (error) {
    console.error('Failed to add audit log:', error);
    return [];
  }
}

export async function getAuditLogs(limitCount = 500) {
  if (!db) {
    return memoryStore.auditLogs.slice(0, limitCount);
  }
  try {
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limitCount);
  } catch (error) {
    console.error('Failed to get audit logs:', error);
    throw new Error('Failed to fetch audit logs from Cloud SQL.', { cause: error });
  }
}

// SIDB History
export async function getSidbHistoryList() {
  if (!db) {
    return memoryStore.sidbHistory;
  }
  try {
    return await db.select().from(sidbHistory).orderBy(desc(sidbHistory.createdAt));
  } catch (error) {
    console.error('Failed to get SIDB history:', error);
    throw new Error('Failed to fetch SIDB history from Cloud SQL.', { cause: error });
  }
}

export async function addSidbHistoryEntry(entry: SidbHistoryInsert) {
  if (!db) {
    const row: SidbHistoryRow = {
      id: entry.id,
      tanggal: entry.tanggal,
      namaFile: entry.namaFile,
      totalBaris: entry.totalBaris ?? 0,
      wbpBaru: entry.wbpBaru ?? 0,
      wbpDiperbarui: entry.wbpDiperbarui ?? 0,
      wbpDitandaiCek: entry.wbpDitandaiCek ?? 0,
      createdAt: entry.createdAt ?? new Date(),
    };
    memoryStore.sidbHistory.unshift(row);
    return row;
  }
  try {
    const res = await db.insert(sidbHistory).values(entry).onConflictDoNothing().returning();
    return res[0];
  } catch (error) {
    console.error('Failed to add SIDB history:', error);
    throw new Error('Failed to save SIDB update history.', { cause: error });
  }
}

// Master Obat & Resep Obat Queries
export async function seedMasterObatIfEmpty(records: MasterObatInsert[]) {
  if (!db) {
    if (memoryStore.masterObat.length === 0) {
      memoryStore.masterObat = records.map((r) => ({
        id: r.id,
        nama: r.nama,
        kekuatan: r.kekuatan,
        satuanTerkecil: r.satuanTerkecil,
        isiPerKotak: r.isiPerKotak,
        isiPerStrip: r.isiPerStrip ?? 0,
        aktif: r.aktif ?? true,
        createdAt: r.createdAt ?? new Date(),
      }));
    }
    return;
  }
  const existing = await db.select({ id: masterObat.id }).from(masterObat).limit(1);
  if (existing.length === 0 && records.length > 0) {
    await db.insert(masterObat).values(records).onConflictDoNothing();
  }
}

export async function getAllMasterObat() {
  if (!db) {
    return memoryStore.masterObat;
  }
  try {
    return await db.select().from(masterObat).orderBy(masterObat.nama);
  } catch (error) {
    console.error('Failed to fetch Master Obat:', error);
    throw new Error('Failed to fetch Master Obat records from Cloud SQL.', { cause: error });
  }
}

export async function upsertMasterObat(record: MasterObatInsert) {
  if (!db) {
    const idx = memoryStore.masterObat.findIndex((o) => o.id === record.id);
    const row: MasterObatRow = {
      id: record.id,
      nama: record.nama,
      kekuatan: record.kekuatan,
      satuanTerkecil: record.satuanTerkecil,
      isiPerKotak: record.isiPerKotak,
      isiPerStrip: record.isiPerStrip ?? 0,
      aktif: record.aktif ?? true,
      createdAt: record.createdAt ?? new Date(),
    };
    if (idx !== -1) {
      memoryStore.masterObat[idx] = { ...memoryStore.masterObat[idx], ...row };
      return memoryStore.masterObat[idx];
    }
    memoryStore.masterObat.unshift(row);
    return row;
  }
  try {
    const res = await db
      .insert(masterObat)
      .values(record)
      .onConflictDoUpdate({
        target: masterObat.id,
        set: {
          nama: record.nama,
          kekuatan: record.kekuatan,
          satuanTerkecil: record.satuanTerkecil,
          isiPerKotak: record.isiPerKotak,
          isiPerStrip: record.isiPerStrip ?? 0,
          aktif: record.aktif ?? true,
        },
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to upsert master obat:', error);
    throw new Error('Failed to save master obat.', { cause: error });
  }
}

export async function deleteMasterObatById(id: string) {
  if (!db) {
    const idx = memoryStore.masterObat.findIndex((o) => o.id === id);
    if (idx === -1) return [];
    memoryStore.resepObat = memoryStore.resepObat.filter((r) => r.obatId !== id);
    return memoryStore.masterObat.splice(idx, 1);
  }
  try {
    await db.delete(resepObat).where(eq(resepObat.obatId, id));
    return await db.delete(masterObat).where(eq(masterObat.id, id)).returning();
  } catch (error) {
    console.error('Failed to delete master obat:', error);
    throw new Error('Failed to delete master obat.', { cause: error });
  }
}

export async function getAllResepObat() {
  if (!db) {
    return memoryStore.resepObat;
  }
  try {
    return await db.select().from(resepObat).orderBy(desc(resepObat.createdAt));
  } catch (error) {
    console.error('Failed to fetch Resep Obat:', error);
    throw new Error('Failed to fetch Resep Obat records from Cloud SQL.', { cause: error });
  }
}

export async function replaceReferensiBatch(records: ReferensiInsert[], replaceAll = false) {
  if (!db) {
    if (replaceAll) {
      memoryStore.referensi = records.map((r) => ({
        id: r.id,
        keluhan: r.keluhan,
        masukPenyakit: r.masukPenyakit ?? null,
        kodeIcd10: r.kodeIcd10 ?? null,
        namaIcd10: r.namaIcd10 ?? null,
        jenis: r.jenis ?? 'Tidak Menular',
        catatan: r.catatan ?? null,
      }));
    } else {
      for (const r of records) {
        await upsertReferensi(r);
      }
    }
    return memoryStore.referensi;
  }
  try {
    await db.transaction(async (tx) => {
      if (replaceAll) {
        await tx.delete(referensiIcd10);
      }
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        await tx
          .insert(referensiIcd10)
          .values(chunk)
          .onConflictDoUpdate({
            target: referensiIcd10.id,
            set: {
              keluhan: sql`excluded.keluhan`,
              masukPenyakit: sql`excluded.masuk_penyakit`,
              kodeIcd10: sql`excluded.kode_icd10`,
              namaIcd10: sql`excluded.nama_icd10`,
              jenis: sql`excluded.jenis`,
              catatan: sql`excluded.catatan`,
            },
          });
      }
    });
    return await db.select().from(referensiIcd10);
  } catch (error) {
    console.error('Failed to batch upsert referensi:', error);
    throw new Error('Failed to batch import referensi ICD-10.', { cause: error });
  }
}

export async function replacePenyakitBatch(records: PenyakitInsert[], replaceAll = false) {
  if (!db) {
    if (replaceAll) {
      memoryStore.penyakit = records.map((p) => ({ ...p }));
    } else {
      for (const p of records) {
        await upsertPenyakit(p);
      }
    }
    return memoryStore.penyakit;
  }
  try {
    await db.transaction(async (tx) => {
      if (replaceAll) {
        await tx.delete(daftarPenyakit);
      }
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        await tx
          .insert(daftarPenyakit)
          .values(chunk)
          .onConflictDoUpdate({
            target: daftarPenyakit.id,
            set: {
              kategori: sql`excluded.kategori`,
              penyakit: sql`excluded.penyakit`,
              jenis: sql`excluded.jenis`,
              urutan: sql`excluded.urutan`,
            },
          });
      }
    });
    return await db.select().from(daftarPenyakit).orderBy(daftarPenyakit.urutan);
  } catch (error) {
    console.error('Failed to batch upsert penyakit:', error);
    throw new Error('Failed to batch import daftar penyakit.', { cause: error });
  }
}

export async function replaceMasterObatBatch(records: MasterObatInsert[], replaceAll = false) {
  if (!db) {
    if (replaceAll) {
      memoryStore.resepObat = [];
      memoryStore.masterObat = records.map((o) => ({
        id: o.id,
        nama: o.nama,
        kekuatan: o.kekuatan,
        satuanTerkecil: o.satuanTerkecil,
        isiPerKotak: o.isiPerKotak,
        isiPerStrip: o.isiPerStrip ?? 0,
        aktif: o.aktif ?? true,
        createdAt: o.createdAt ?? new Date(),
      }));
    } else {
      for (const o of records) {
        await upsertMasterObat(o);
      }
    }
    return memoryStore.masterObat;
  }
  try {
    await db.transaction(async (tx) => {
      if (replaceAll) {
        await tx.delete(resepObat);
        await tx.delete(masterObat);
      }
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        await tx
          .insert(masterObat)
          .values(chunk)
          .onConflictDoUpdate({
            target: masterObat.id,
            set: {
              nama: sql`excluded.nama`,
              kekuatan: sql`excluded.kekuatan`,
              satuanTerkecil: sql`excluded.satuan_terkecil`,
              isiPerKotak: sql`excluded.isi_per_kotak`,
              isiPerStrip: sql`excluded.isi_per_strip`,
              aktif: sql`excluded.aktif`,
            },
          });
      }
    });
    return await db.select().from(masterObat).orderBy(masterObat.nama);
  } catch (error) {
    console.error('Failed to batch upsert master obat:', error);
    throw new Error('Failed to batch import master obat.', { cause: error });
  }
}

// Shared multi-instance sync stamp stored in pengaturan_app
let localSyncVersion = Date.now();

export async function getSharedSyncVersion(): Promise<number> {
  if (!db) {
    return localSyncVersion;
  }
  try {
    const val = await getSetting('sync_stamp');
    if (val && typeof val.version === 'number') {
      if (val.version > localSyncVersion) {
        localSyncVersion = val.version;
      }
      return val.version;
    }
    return localSyncVersion;
  } catch {
    return localSyncVersion;
  }
}

export async function touchSharedSyncVersion(scope = 'data'): Promise<number> {
  const nextVersion = Math.max(Date.now(), localSyncVersion + 1);
  localSyncVersion = nextVersion;
  if (!db) {
    return nextVersion;
  }
  try {
    await setSetting('sync_stamp', {
      version: nextVersion,
      scope,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Could not persist sync_stamp to Cloud SQL:', err);
  }
  return nextVersion;
}

export async function replaceResepForKunjungan(kunjunganId: string, items: ResepObatInsert[]) {
  if (!db) {
    memoryStore.resepObat = memoryStore.resepObat.filter((r) => r.kunjunganId !== kunjunganId);
    const rows: ResepObatRow[] = items.map((i) => ({
      id: i.id,
      kunjunganId,
      obatId: i.obatId,
      jumlahPerMinum: i.jumlahPerMinum ?? null,
      frekuensiPerHari: i.frekuensiPerHari ?? null,
      lamaHari: i.lamaHari ?? null,
      jumlahDiberikan: i.jumlahDiberikan,
      aturanPakai: i.aturanPakai ?? null,
      catatan: i.catatan ?? null,
      createdAt: i.createdAt ?? new Date(),
    }));
    memoryStore.resepObat.push(...rows);
    return rows;
  }
  try {
    await db.transaction(async (tx) => {
      await tx.delete(resepObat).where(eq(resepObat.kunjunganId, kunjunganId));
      if (items.length > 0) {
        await tx.insert(resepObat).values(items);
      }
    });
    return await db.select().from(resepObat).where(eq(resepObat.kunjunganId, kunjunganId));
  } catch (error) {
    console.error('Failed to save resep for kunjungan:', error);
    throw new Error('Failed to save prescription.', { cause: error });
  }
}

export async function deleteResepByKunjunganId(kunjunganId: string) {
  if (!db) {
    memoryStore.resepObat = memoryStore.resepObat.filter((r) => r.kunjunganId !== kunjunganId);
    return;
  }
  try {
    await db.delete(resepObat).where(eq(resepObat.kunjunganId, kunjunganId));
  } catch (error) {
    console.error('Failed to delete resep by kunjunganId:', error);
  }
}

// Full Restore across all tables (atomic replacement)
export async function restoreAllTables(payload: {
  wbp: WbpInsert[];
  kunjungan: KunjunganInsert[];
  referensi: ReferensiInsert[];
  penyakit: PenyakitInsert[];
  pengaturan?: any;
  sidbHistory: SidbHistoryInsert[];
  auditLogs: AuditLogInsert[];
  masterObat?: MasterObatInsert[];
  resepObat?: ResepObatInsert[];
}) {
  if (!db) {
    memoryStore.wbp = payload.wbp.map(toWbpRow);
    memoryStore.kunjungan = payload.kunjungan.map(toKunjunganRow);
    memoryStore.referensi = payload.referensi.map((r) => ({
      id: r.id,
      keluhan: r.keluhan,
      masukPenyakit: r.masukPenyakit ?? null,
      kodeIcd10: r.kodeIcd10 ?? null,
      namaIcd10: r.namaIcd10 ?? null,
      jenis: r.jenis ?? 'Tidak Menular',
      catatan: r.catatan ?? null,
    }));
    memoryStore.penyakit = payload.penyakit.map((p) => ({ ...p }));
    if (payload.pengaturan) {
      memoryStore.pengaturan.set('app_settings', payload.pengaturan);
    }
    memoryStore.sidbHistory = payload.sidbHistory.map((h) => ({
      id: h.id,
      tanggal: h.tanggal,
      namaFile: h.namaFile,
      totalBaris: h.totalBaris ?? 0,
      wbpBaru: h.wbpBaru ?? 0,
      wbpDiperbarui: h.wbpDiperbarui ?? 0,
      wbpDitandaiCek: h.wbpDitandaiCek ?? 0,
      createdAt: h.createdAt ?? new Date(),
    }));
    memoryStore.auditLogs = payload.auditLogs.map((a) => ({
      id: a.id,
      waktu: a.waktu,
      aksi: a.aksi,
      rincian: a.rincian,
      perangkat: a.perangkat ?? null,
      createdAt: a.createdAt ?? new Date(),
    }));
    if (payload.masterObat) {
      memoryStore.masterObat = payload.masterObat.map((o) => ({
        id: o.id,
        nama: o.nama,
        kekuatan: o.kekuatan,
        satuanTerkecil: o.satuanTerkecil,
        isiPerKotak: o.isiPerKotak,
        isiPerStrip: o.isiPerStrip ?? 0,
        aktif: o.aktif ?? true,
        createdAt: o.createdAt ?? new Date(),
      }));
    }
    if (payload.resepObat) {
      memoryStore.resepObat = payload.resepObat.map((r) => ({
        id: r.id,
        kunjunganId: r.kunjunganId,
        obatId: r.obatId,
        jumlahPerMinum: r.jumlahPerMinum ?? null,
        frekuensiPerHari: r.frekuensiPerHari ?? null,
        lamaHari: r.lamaHari ?? null,
        jumlahDiberikan: r.jumlahDiberikan,
        aturanPakai: r.aturanPakai ?? null,
        catatan: r.catatan ?? null,
        createdAt: r.createdAt ?? new Date(),
      }));
    }
    return true;
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(resepObat);
      await tx.delete(kunjungan);
      await tx.delete(wbp);
      await tx.delete(referensiIcd10);
      await tx.delete(daftarPenyakit);
      await tx.delete(sidbHistory);
      await tx.delete(auditLogs);
      if (payload.masterObat) {
        await tx.delete(masterObat);
      }

      const insertInChunks = async <T extends any[]>(
        table: any,
        rows: T,
        chunkSize = 100
      ) => {
        for (let i = 0; i < rows.length; i += chunkSize) {
          await tx.insert(table).values(rows.slice(i, i + chunkSize)).onConflictDoNothing();
        }
      };

      if (payload.wbp.length > 0) await insertInChunks(wbp, payload.wbp);
      if (payload.kunjungan.length > 0) await insertInChunks(kunjungan, payload.kunjungan);
      if (payload.referensi.length > 0) await insertInChunks(referensiIcd10, payload.referensi);
      if (payload.penyakit.length > 0) await insertInChunks(daftarPenyakit, payload.penyakit);
      if (payload.sidbHistory.length > 0) await insertInChunks(sidbHistory, payload.sidbHistory);
      if (payload.auditLogs.length > 0) await insertInChunks(auditLogs, payload.auditLogs);
      if (payload.masterObat && payload.masterObat.length > 0) {
        await insertInChunks(masterObat, payload.masterObat);
      }
      if (payload.resepObat && payload.resepObat.length > 0) {
        await insertInChunks(resepObat, payload.resepObat);
      }

      if (payload.pengaturan) {
        await tx
          .insert(pengaturanApp)
          .values({ key: 'app_settings', value: payload.pengaturan })
          .onConflictDoUpdate({
            target: pengaturanApp.key,
            set: { value: payload.pengaturan },
          });
      }

      await tx
        .insert(pengaturanApp)
        .values({ key: 'seeded_v1', value: true })
        .onConflictDoUpdate({
          target: pengaturanApp.key,
          set: { value: true },
        });
    });
    return true;
  } catch (error) {
    console.error('Failed to restore full backup to DB:', error);
    throw new Error('Failed to restore full backup.', { cause: error });
  }
}
