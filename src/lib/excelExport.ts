/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { CalculatedKunjungan, PenyakitItem, WbpItem } from '../types';
import { formatLongDateWita, getWitaTodayIso } from './storage';

export function exportTableToExcel(data: any[], fileName: string, sheetName = 'Data') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

export function exportRekapBulananToExcel(
  bulanTahun: string,
  patients: {
    nama: string;
    kamar: string;
    blok: string;
    jumlahKunjungan: number;
    counts: Record<string, number>;
    totalMenular: number;
    totalTidakMenular: number;
    totalSemua: number;
  }[],
  penyakitList: PenyakitItem[],
  totalsPerPenyakit: Record<string, number>,
  grandTotalMenular: number,
  grandTotalTidakMenular: number,
  grandTotalSemua: number
) {
  // Build structured 2D array for clean Excel formatting
  const rows: any[][] = [];

  // Title headers
  rows.push([`LAPORAN REKAPITULASI PENYAKIT RAWAT JALAN KLINIK LAPAS KELAS IIB DOMPU`]);
  rows.push([`PERIODE: ${bulanTahun.toUpperCase()}`]);
  rows.push([]);

  // Column header row:
  const headerRow = ['NO', 'NAMA WARGA BINAAN', 'BLOK/KAMAR', 'JUMLAH KUNJUNGAN'];
  penyakitList.forEach((p) => {
    headerRow.push(`${p.penyakit} [${p.jenis.toUpperCase()}]`);
  });
  headerRow.push('TOTAL KASUS MENULAR', 'TOTAL KASUS TDK MENULAR', 'TOTAL SEMUA KASUS');
  rows.push(headerRow);

  // Patient rows (Each row = 1 unique patient)
  patients.forEach((p, idx) => {
    const row: any[] = [
      idx + 1,
      p.nama,
      `${p.blok || ''} ${p.kamar ? `Kamar ${p.kamar}` : ''}`.trim(),
      p.jumlahKunjungan,
    ];
    penyakitList.forEach((pen) => {
      row.push(p.counts[pen.penyakit] ? 1 : 0);
    });
    row.push(p.totalMenular);
    row.push(p.totalTidakMenular);
    row.push(p.totalSemua);
    rows.push(row);
  });

  // Total summary row: TOTAL KASUS
  const totalKunjunganSemua = patients.reduce((acc, p) => acc + p.jumlahKunjungan, 0);
  const totalRow: any[] = ['TOTAL KASUS', 'JUMLAH KASUS KELUHAN', '', totalKunjunganSemua];
  penyakitList.forEach((pen) => {
    totalRow.push(totalsPerPenyakit[pen.penyakit] || 0);
  });
  totalRow.push(grandTotalMenular);
  totalRow.push(grandTotalTidakMenular);
  totalRow.push(grandTotalSemua);
  rows.push(totalRow);

  // Pasien Unik per penyakit row
  const unikRow: any[] = ['PASIEN UNIK', `${patients.length} ORANG BERBEDA`, '', ''];
  penyakitList.forEach((pen) => {
    const countUnik = patients.filter((p) => (p.counts[pen.penyakit] || 0) > 0).length;
    unikRow.push(countUnik);
  });
  rows.push(unikRow);

  // Footnote definitions
  rows.push([]);
  rows.push(['CATATAN DEFINISI RESMI KLINIS:']);
  rows.push(['1. KUNJUNGAN = Jumlah baris kedatangan pasien di Input Harian (berapa kali pasien datang berobat).']);
  rows.push(['2. PASIEN UNIK = Jumlah orang berbeda dari DATA_WBP yang berobat (tiap orang dihitung 1 kali per periode).']);
  rows.push(['3. REKAP PENYAKIT = Dihitung unik per pasien per bulan (meskipun kunjungan sakit untuk penyakit yang sama >1 kali dalam bulan tersebut, tetap ditulis 1).']);
  rows.push(['4. Kunjungan per pasien = Total Kunjungan dibagi Pasien Unik.']);

  // Blank rows before signature space
  rows.push([]);
  rows.push(['', '', '', '', 'Dompu, ' + formatLongDateWita()]);
  rows.push(['', '', '', '', 'Dokter Penanggung Jawab / Petugas Medis']);
  rows.push([]);
  rows.push([]);
  rows.push(['', '', '', '', '(.......................................................)']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Penyakit');
  XLSX.writeFile(wb, `REKAP_PENYAKIT_${bulanTahun.replace(/\s+/g, '_')}.xlsx`);
}

export function exportDaftarPanggilBpjsToExcel(wbpList: WbpItem[]) {
  const filtered = wbpList.filter((w) => w.batch_bpjs === 'Belum masuk batch');
  const mapped = filtered.map((w, idx) => ({
    'No': idx + 1,
    'Nama WBP': w.nama,
    'NIK': w.nik || '-',
    'No Reg Instansi': w.no_reg_instansi || '-',
    'Blok': w.blok || '-',
    'Kamar': w.kamar || '-',
    'Alamat Asal': w.alamat || '-',
    'Tempat, Tgl Lahir': `${w.tempat_lahir || ''}, ${w.tanggal_lahir || ''}`,
    'Status Data': w.status_data || 'Aktif',
    'Kendala BPJS': w.kendala_bpjs || '',
    'Dasar Pendaftaran PBI': w.dasar_pbi || '',
  }));

  const ws = XLSX.utils.json_to_sheet(mapped);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Panggil BPJS');
  XLSX.writeFile(wb, `DAFTAR_PANGGIL_BPJS_BELUM_MASUK_BATCH_${getWitaTodayIso()}.xlsx`);
}

export function exportFormPenyakitMenularNtb(
  bulanTahun: string,
  visits: CalculatedKunjungan[]
) {
  // Unique patients with Ispa, Scabies, Diare in this month
  const targetIllnesses = ['ISPA', 'SCABIES', 'DIARE/KONSTIPASI', 'FLU', 'TBC'];
  const patientMap = new Map<string, { wbp?: WbpItem; nama: string; illnesses: Set<string>; tanggalKunjungan: string }>();

  visits.forEach((v) => {
    const p1 = (v.penyakit1 || '').toUpperCase();
    const p2 = (v.penyakit2 || '').toUpperCase();
    const p3 = (v.penyakit3 || '').toUpperCase();

    const matches = targetIllnesses.filter((t) => p1.includes(t) || p2.includes(t) || p3.includes(t));
    if (matches.length > 0) {
      const key = v.wbp_id || v.nama.trim().toLowerCase();
      if (!patientMap.has(key)) {
        patientMap.set(key, {
          wbp: v.wbp,
          nama: v.nama,
          illnesses: new Set(),
          tanggalKunjungan: v.tanggal,
        });
      }
      matches.forEach((m) => patientMap.get(key)!.illnesses.add(m));
    }
  });

  const exportData = Array.from(patientMap.values()).map((item, idx) => ({
    'No': idx + 1,
    'Nama WBP': item.nama,
    'NIK': item.wbp?.nik || '-',
    'No Reg': item.wbp?.no_reg_instansi || '-',
    'Jenis Kelamin': item.wbp?.jenis_kelamin || 'Laki-laki',
    'Tanggal Lahir': item.wbp?.tanggal_lahir || '-',
    'Tanggal Masuk': item.wbp?.tanggal_masuk || '-',
    'Blok / Kamar': `${item.wbp?.blok || ''} / ${item.wbp?.kamar || ''}`,
    'Penyakit Menular Terdeteksi': Array.from(item.illnesses).join(', '),
    'Tanggal Berobat Terakhir': item.tanggalKunjungan,
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'LP Dompu - Menular');
  XLSX.writeFile(wb, `FORM_PENYAKIT_MENULAR_NTB_LP_DOMPU_${bulanTahun.replace(/\s+/g, '_')}.xlsx`);
}

export function exportComprehensiveBackupToExcel(backupData: {
  exported_at?: string;
  version?: string;
  wbp: WbpItem[];
  kunjungan: any[];
  referensi: any[];
  penyakit: PenyakitItem[];
  pengaturan: any;
  sidb_history: any[];
  audit_logs: any[];
  master_obat?: any[];
  resep_obat?: any[];
  preferences?: { theme?: string; signature_defaults?: any };
}) {
  const wb = XLSX.utils.book_new();
  const safeStr = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.length > 32000 ? s.slice(0, 32000) : s;
  };

  // 1. RINGKASAN_BACKUP
  const summaryRows = [
    { Bagian: 'Nama Aplikasi', Keterangan: 'Klinik Pratama Lapas Kelas IIB Dompu', Jumlah_Data: '' },
    { Bagian: 'Versi Cadangan', Keterangan: backupData.version || '2.0', Jumlah_Data: '' },
    { Bagian: 'Waktu Ekspor', Keterangan: backupData.exported_at || new Date().toISOString(), Jumlah_Data: '' },
    { Bagian: 'DATA_WBP', Keterangan: 'Seluruh master data warga binaan (30+ kolom)', Jumlah_Data: backupData.wbp?.length || 0 },
    { Bagian: 'INPUT_HARIAN (Aktif)', Keterangan: 'Catatan kunjungan pelayanan medis aktif', Jumlah_Data: (backupData.kunjungan || []).filter((k) => !k.dihapus).length },
    { Bagian: 'KOTAK_SAMPAH_KUNJUNGAN', Keterangan: 'Catatan kunjungan yang dihapus lunak', Jumlah_Data: (backupData.kunjungan || []).filter((k) => k.dihapus).length },
    { Bagian: 'REFERENSI_ICD10', Keterangan: 'Kamus pemetaan keluhan ke penyakit & ICD-10', Jumlah_Data: backupData.referensi?.length || 0 },
    { Bagian: 'DAFTAR_PENYAKIT', Keterangan: 'Master kategori dan jenis penyakit', Jumlah_Data: backupData.penyakit?.length || 0 },
    { Bagian: 'MASTER_OBAT', Keterangan: 'Daftar master obat, kekuatan sediaan, satuan & isi kotak', Jumlah_Data: backupData.master_obat?.length || 0 },
    { Bagian: 'RESEP_OBAT', Keterangan: 'Catatan pengeluaran & dosis obat per kunjungan', Jumlah_Data: backupData.resep_obat?.length || 0 },
    { Bagian: 'PENGATURAN_SISTEM', Keterangan: 'Konfigurasi klinik, batch BPJS, tanda tangan & preferensi', Jumlah_Data: backupData.pengaturan?.batches?.length || 0 },
    { Bagian: 'RIWAYAT_SIDB', Keterangan: 'Riwayat pembaruan file SIDB', Jumlah_Data: backupData.sidb_history?.length || 0 },
    { Bagian: 'AUDIT_LOG', Keterangan: 'Riwayat aktivitas petugas lintas perangkat', Jumlah_Data: backupData.audit_logs?.length || 0 },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'RINGKASAN_BACKUP');

  // 2. DATA_WBP (All 30+ fields)
  const wbpRows = (backupData.wbp || []).map((w, idx) => ({
    No: w.no ?? idx + 1,
    ID: safeStr(w.id),
    NIK: safeStr(w.nik),
    'No Reg Instansi': safeStr(w.no_reg_instansi),
    Nama: safeStr(w.nama),
    'Jenis Kelamin': safeStr(w.jenis_kelamin),
    'Tempat Lahir': safeStr(w.tempat_lahir),
    'Tanggal Lahir': safeStr(w.tanggal_lahir),
    Alamat: safeStr(w.alamat),
    'Nama Ayah': safeStr(w.nama_ayah),
    'Nama Ibu': safeStr(w.nama_ibu),
    Pekerjaan: safeStr(w.pekerjaan),
    'Jenis Kejahatan': safeStr(w.jenis_kejahatan),
    Kategori: safeStr(w.kategori),
    'Lama Pidana': safeStr(w.lama_pidana),
    'Tanggal Masuk': safeStr(w.tanggal_masuk),
    'Tgl Ekspirasi': safeStr(w.tgl_ekspirasi),
    Blok: safeStr(w.blok),
    Kamar: safeStr(w.kamar),
    'Kamar asli (data SIDB)': safeStr(w.kamar_sidb),
    'Lokasi Sel': safeStr(w.lokasi_sel),
    'Tgl Surat Penahanan': safeStr(w.tgl_surat_penahanan),
    'Nomor Surat Penahanan': safeStr(w.nomor_surat_penahanan),
    'Status Data': safeStr(w.status_data),
    'Batch Pengalihan Faskes BPJS': safeStr(w.batch_bpjs),
    'Status Skrining': safeStr(w.status_skrining),
    'Kendala / Catatan BPJS': safeStr(w.kendala_bpjs),
    'Dasar Pendaftaran PBI': safeStr(w.dasar_pbi),
    'Catatan Penggabungan': safeStr(w.catatan_penggabungan),
    'Perlu Dicek SIDB': w.perlu_dicek ? 'Ya' : 'Tidak',
    'Sumber Update': safeStr(w.sumber_update),
    'Terakhir Diperbarui': safeStr(w.terakhir_diperbarui),
    'Dibuat Pada': safeStr(w.dibuat_pada),
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(wbpRows.length > 0 ? wbpRows : [{ Info: 'Tidak ada data WBP' }]),
    'DATA_WBP'
  );

  // 3. INPUT_HARIAN (All active + soft-deleted kunjungan)
  const kunjunganRows = (backupData.kunjungan || []).map((k, idx) => ({
    No: idx + 1,
    ID: safeStr(k.id),
    Tanggal: safeStr(k.tanggal),
    'WBP ID': safeStr(k.wbp_id),
    Nama: safeStr(k.nama),
    NIK: safeStr(k.nik),
    Kamar: safeStr(k.kamar),
    'Keluhan 1': safeStr(k.keluhan1),
    'Keluhan 2': safeStr(k.keluhan2),
    'Keluhan 3': safeStr(k.keluhan3),
    'Penyakit 1': safeStr(k.penyakit1),
    'Jenis 1': safeStr(k.jenis1),
    'Penyakit 2': safeStr(k.penyakit2),
    'Jenis 2': safeStr(k.jenis2),
    'Penyakit 3': safeStr(k.penyakit3),
    'Jenis 3': safeStr(k.jenis3),
    Terapi: safeStr(k.terapi),
    'Dokter Pemeriksa': safeStr(k.dokter_pemeriksa),
    Perawat: safeStr(k.perawat),
    Catatan: safeStr(k.catatan),
    Status: k.dihapus ? 'Dihapus (Kotak Sampah)' : 'Aktif',
    Arsip: k.arsip ? 'Ya' : 'Tidak',
    'Tahun Arsip': k.arsip_tahun ?? '',
    'Dibuat Pada': safeStr(k.dibuat_pada),
    'Diubah Pada': safeStr(k.diubah_pada),
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(kunjunganRows.length > 0 ? kunjunganRows : [{ Info: 'Tidak ada data kunjungan' }]),
    'INPUT_HARIAN'
  );

  // 4. REFERENSI_ICD10
  const refRows = (backupData.referensi || []).map((r, idx) => ({
    No: idx + 1,
    ID: safeStr(r.id),
    Keluhan: safeStr(r.keluhan),
    'Masuk ke kolom penyakit': safeStr(r.masuk_penyakit),
    Catatan: safeStr(r.catatan),
    'Kode ICD-10': safeStr(r.kode_icd10),
    'Nama ICD-10': safeStr(r.nama_icd10),
    'Jenis (Menular/Tidak Menular)': safeStr(r.jenis),
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(refRows.length > 0 ? refRows : [{ Info: 'Tidak ada data referensi' }]),
    'REFERENSI_ICD10'
  );

  // 5. DAFTAR_PENYAKIT
  const penyakitRows = (backupData.penyakit || []).map((p, idx) => ({
    No: p.urutan ?? idx + 1,
    ID: safeStr(p.id),
    Kategori: safeStr(p.kategori),
    Penyakit: safeStr(p.penyakit),
    Jenis: safeStr(p.jenis),
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(penyakitRows.length > 0 ? penyakitRows : [{ Info: 'Tidak ada daftar penyakit' }]),
    'DAFTAR_PENYAKIT'
  );

  // 6. MASTER_OBAT
  const masterObatMap = new Map<string, any>();
  (backupData.master_obat || []).forEach((o: any) => masterObatMap.set(o.id, o));
  const masterObatRows = (backupData.master_obat || []).map((o: any, idx: number) => ({
    No: idx + 1,
    ID: safeStr(o.id),
    'Nama Obat': safeStr(o.nama),
    'Kekuatan / Sediaan': safeStr(o.kekuatan),
    'Satuan Terkecil': safeStr(o.satuan_terkecil),
    'Isi Per Kotak': Number(o.isi_per_kotak ?? 1),
    'Isi Per Strip': Number(o.isi_per_strip ?? 0),
    Aktif: o.aktif === false ? 'Nonaktif' : 'Aktif',
    'Dibuat Pada': safeStr(o.dibuat_pada),
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(masterObatRows.length > 0 ? masterObatRows : [{ Info: 'Tidak ada data master obat' }]),
    'MASTER_OBAT'
  );

  // 7. RESEP_OBAT
  const resepRows = (backupData.resep_obat || []).map((r: any, idx: number) => {
    const obat = masterObatMap.get(r.obat_id);
    return {
      No: idx + 1,
      ID: safeStr(r.id),
      'Kunjungan ID': safeStr(r.kunjungan_id),
      'Obat ID': safeStr(r.obat_id),
      'Nama Obat': obat ? `${obat.nama} ${obat.kekuatan}`.trim() : safeStr(r.obat_nama || r.nama_obat || ''),
      'Jumlah per Minum': r.jumlah_per_minum ?? '',
      'Frekuensi per Hari': r.frekuensi_per_hari ?? '',
      'Lama (Hari)': r.lama_hari ?? '',
      'Jumlah Diberikan': Number(r.jumlah_diberikan ?? 1),
      Satuan: obat ? safeStr(obat.satuan_terkecil) : safeStr(r.satuan_terkecil || ''),
      'Aturan Pakai': safeStr(r.aturan_pakai),
      Catatan: safeStr(r.catatan),
    };
  });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(resepRows.length > 0 ? resepRows : [{ Info: 'Tidak ada data resep obat' }]),
    'RESEP_OBAT'
  );

  // 8. PENGATURAN_SISTEM
  const peng = backupData.pengaturan || {};
  const settingsRows = [
    { Kunci: 'batas_sering_berobat_kali', Nilai: safeStr(peng.batas_sering_berobat_kali ?? 7) },
    { Kunci: 'periode_sering_hari', Nilai: safeStr(peng.periode_sering_hari ?? 7) },
    { Kunci: 'nama_klinik', Nilai: safeStr(peng.nama_klinik || 'Klinik Pratama Lapas Kelas IIB Dompu') },
    { Kunci: 'dokter_penanggung_jawab', Nilai: safeStr(peng.dokter_penanggung_jawab || '') },
    { Kunci: 'perawat_pemeriksa', Nilai: safeStr(peng.perawat_pemeriksa || '') },
    { Kunci: 'preferensi_tema', Nilai: safeStr(backupData.preferences?.theme || 'light') },
    {
      Kunci: 'signature_defaults_json',
      Nilai: backupData.preferences?.signature_defaults
        ? safeStr(JSON.stringify(backupData.preferences.signature_defaults))
        : '',
    },
    { Kunci: 'batches_json', Nilai: safeStr(JSON.stringify(peng.batches || [])) },
    ...(Array.isArray(peng.batches)
      ? peng.batches.map((b: any, idx: number) => ({
          Kunci: `batch_${idx + 1}`,
          Nilai: `${b.nama} (${b.warna})`,
        }))
      : []),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settingsRows), 'PENGATURAN_SISTEM');

  // 9. RIWAYAT_SIDB
  const sidbRows = (backupData.sidb_history || []).map((s, idx) => ({
    No: idx + 1,
    ID: safeStr(s.id),
    Tanggal: safeStr(s.tanggal),
    'Nama File': safeStr(s.nama_file),
    'Total Baris': s.total_baris ?? 0,
    'WBP Baru': s.wbp_baru ?? 0,
    'WBP Diperbarui': s.wbp_diperbarui ?? 0,
    'Ditandai Cek': s.wbp_ditandai_cek ?? 0,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(sidbRows.length > 0 ? sidbRows : [{ Info: 'Belum ada riwayat update SIDB' }]),
    'RIWAYAT_SIDB'
  );

  // 10. AUDIT_LOG
  const auditRows = (backupData.audit_logs || []).map((a, idx) => ({
    No: idx + 1,
    ID: safeStr(a.id),
    Waktu: safeStr(a.waktu),
    Aksi: safeStr(a.aksi),
    Rincian: safeStr(a.rincian),
    Perangkat: safeStr(a.perangkat),
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(auditRows.length > 0 ? auditRows : [{ Info: 'Belum ada audit log' }]),
    'AUDIT_LOG'
  );

  const dateTag = getWitaTodayIso();
  XLSX.writeFile(wb, `BACKUP_EXCEL_MENYELURUH_KLINIK_DOMPU_${dateTag}.xlsx`);
}

export function parseComprehensiveExcelBackup(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: false, raw: false });
        const readSheet = (name: string): any[] => {
          const ws = workbook.Sheets[name];
          if (!ws) return [];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as any[];
          return rows.filter((r) => !('Info' in r && Object.keys(r).length === 1));
        };

        const summary = readSheet('RINGKASAN_BACKUP');
        const versionRow = summary.find((r) => r.Bagian === 'Versi Cadangan');
        const timeRow = summary.find((r) => r.Bagian === 'Waktu Ekspor');

        const wbp = readSheet('DATA_WBP')
          .filter((r) => String(r.Nama || r.nama || '').trim() !== '')
          .map((r, idx) => ({
            id: String(r.ID || r.id || `wbp-xls-${Date.now()}-${idx}`),
            no: Number(r.No || idx + 1),
            nik: String(r.NIK || r.nik || ''),
            no_reg_instansi: String(r['No Reg Instansi'] || r.no_reg_instansi || ''),
            nama: String(r.Nama || r.nama || '').trim(),
            jenis_kelamin: String(r['Jenis Kelamin'] || 'Laki-laki') === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
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
            blok: String(r.Blok || ''),
            kamar: String(r.Kamar || ''),
            kamar_sidb: String(r['Kamar asli (data SIDB)'] || r.Kamar || ''),
            lokasi_sel: String(r['Lokasi Sel'] || ''),
            tgl_surat_penahanan: String(r['Tgl Surat Penahanan'] || ''),
            nomor_surat_penahanan: String(r['Nomor Surat Penahanan'] || ''),
            status_data: String(r['Status Data'] || 'Aktif'),
            batch_bpjs: String(r['Batch Pengalihan Faskes BPJS'] || 'Belum masuk batch'),
            status_skrining: String(r['Status Skrining'] || ''),
            kendala_bpjs: String(r['Kendala / Catatan BPJS'] || ''),
            dasar_pbi: String(r['Dasar Pendaftaran PBI'] || ''),
            catatan_penggabungan: String(r['Catatan Penggabungan'] || ''),
            perlu_dicek: String(r['Perlu Dicek SIDB'] || '').toLowerCase() === 'ya',
            sumber_update: String(r['Sumber Update'] || ''),
            terakhir_diperbarui: String(r['Terakhir Diperbarui'] || ''),
            dibuat_pada: String(r['Dibuat Pada'] || ''),
          }));

        const kunjungan = readSheet('INPUT_HARIAN')
          .filter((r) => String(r.Nama || r.nama || '').trim() !== '')
          .map((r, idx) => ({
            id: String(r.ID || r.id || `k-xls-${Date.now()}-${idx}`),
            tanggal: String(r.Tanggal || r.tanggal || ''),
            wbp_id: String(r['WBP ID'] || r.wbp_id || ''),
            nama: String(r.Nama || r.nama || '').trim(),
            nik: String(r.NIK || r.nik || ''),
            kamar: String(r.Kamar || r.kamar || ''),
            keluhan1: String(r['Keluhan 1'] || r.keluhan1 || ''),
            keluhan2: String(r['Keluhan 2'] || r.keluhan2 || ''),
            keluhan3: String(r['Keluhan 3'] || r.keluhan3 || ''),
            penyakit1: String(r['Penyakit 1'] || r.penyakit1 || ''),
            jenis1: r['Jenis 1'] || undefined,
            penyakit2: String(r['Penyakit 2'] || r.penyakit2 || ''),
            jenis2: r['Jenis 2'] || undefined,
            penyakit3: String(r['Penyakit 3'] || r.penyakit3 || ''),
            jenis3: r['Jenis 3'] || undefined,
            terapi: String(r.Terapi || r.terapi || ''),
            dokter_pemeriksa: String(r['Dokter Pemeriksa'] || ''),
            perawat: String(r.Perawat || ''),
            catatan: String(r.Catatan || ''),
            dihapus: String(r.Status || '').toLowerCase().includes('hapus') || String(r.Status || '').toLowerCase().includes('sampah'),
            arsip: String(r.Arsip || '').trim().toLowerCase() === 'ya',
            arsip_tahun: r['Tahun Arsip'] ? Number(r['Tahun Arsip']) || undefined : undefined,
            dibuat_pada: String(r['Dibuat Pada'] || new Date().toISOString()),
            diubah_pada: r['Diubah Pada'] ? String(r['Diubah Pada']) : undefined,
          }));

        const referensi = readSheet('REFERENSI_ICD10')
          .filter((r) => String(r.Keluhan || r.keluhan || '').trim() !== '')
          .map((r, idx) => ({
            id: String(r.ID || r.id || `ref-xls-${Date.now()}-${idx}`),
            keluhan: String(r.Keluhan || r.keluhan || '').trim(),
            masuk_penyakit: String(r['Masuk ke kolom penyakit'] || r.masuk_penyakit || ''),
            catatan: String(r.Catatan || r.catatan || ''),
            kode_icd10: String(r['Kode ICD-10'] || r.kode_icd10 || ''),
            nama_icd10: String(r['Nama ICD-10'] || r.nama_icd10 || ''),
            jenis:
              String(r['Jenis (Menular/Tidak Menular)'] || r.jenis || '').toLowerCase() === 'menular'
                ? 'Menular'
                : 'Tidak Menular',
          }));

        const penyakit = readSheet('DAFTAR_PENYAKIT')
          .filter((r) => String(r.Penyakit || r.penyakit || '').trim() !== '')
          .map((r, idx) => ({
            id: String(r.ID || r.id || `pen-xls-${Date.now()}-${idx}`),
            urutan: Number(r.No || idx + 1),
            kategori: String(r.Kategori || 'LAIN - LAIN').trim(),
            penyakit: String(r.Penyakit || '').trim(),
            jenis: String(r.Jenis || '').toLowerCase() === 'menular' ? 'Menular' : 'Tidak Menular',
          }));

        const masterObatSheet = readSheet('MASTER_OBAT');
        const master_obat = masterObatSheet.length > 0
          ? masterObatSheet
              .filter((r) => String(r['Nama Obat'] || r.Nama || r.nama || '').trim() !== '')
              .map((r, idx) => ({
                id: String(r.ID || r.id || `obat-xls-${Date.now()}-${idx}`),
                nama: String(r['Nama Obat'] || r.Nama || r.nama || '').trim(),
                kekuatan: String(r['Kekuatan / Sediaan'] || r.Kekuatan || r.kekuatan || '').trim(),
                satuan_terkecil: String(r['Satuan Terkecil'] || r.Satuan || r.satuan_terkecil || 'tablet').trim().toLowerCase(),
                isi_per_kotak: Math.max(1, Math.round(Number(r['Isi Per Kotak'] || r.isi_per_kotak || 1))),
                isi_per_strip: Math.max(0, Math.round(Number(r['Isi Per Strip'] ?? r.isi_per_strip ?? 0))),
                aktif: String(r.Aktif ?? r.Status ?? 'Aktif').toLowerCase() !== 'nonaktif',
                dibuat_pada: String(r['Dibuat Pada'] || new Date().toISOString()),
              }))
          : undefined;

        const resepSheet = readSheet('RESEP_OBAT');
        const resep_obat = resepSheet.length > 0
          ? resepSheet
              .filter((r) => String(r['Kunjungan ID'] || r.kunjungan_id || '').trim() !== '' && String(r['Obat ID'] || r.obat_id || '').trim() !== '')
              .map((r, idx) => ({
                id: String(r.ID || r.id || `resep-xls-${Date.now()}-${idx}`),
                kunjungan_id: String(r['Kunjungan ID'] || r.kunjungan_id || '').trim(),
                obat_id: String(r['Obat ID'] || r.obat_id || '').trim(),
                jumlah_per_minum: r['Jumlah per Minum'] !== '' ? Number(r['Jumlah per Minum']) : undefined,
                frekuensi_per_hari: r['Frekuensi per Hari'] !== '' ? Number(r['Frekuensi per Hari']) : undefined,
                lama_hari: r['Lama (Hari)'] !== '' ? Number(r['Lama (Hari)']) : undefined,
                jumlah_diberikan: Math.max(1, Math.round(Number(r['Jumlah Diberikan'] || 1))),
                aturan_pakai: r['Aturan Pakai'] ? String(r['Aturan Pakai']) : undefined,
                catatan: r.Catatan ? String(r.Catatan) : undefined,
              }))
          : undefined;

        const settingsSheet = readSheet('PENGATURAN_SISTEM');
        const settingsMap = new Map<string, string>();
        const fallbackBatches: { nama: string; warna: string }[] = [];
        settingsSheet.forEach((r) => {
          const k = String(r.Kunci || '').trim();
          const v = String(r.Nilai ?? '');
          if (k) settingsMap.set(k, v);
          if (/^batch_\d+$/i.test(k)) {
            const match = v.match(/^(.*?)\s*\((#[0-9A-Fa-f]{3,8})\)$/);
            if (match) {
              fallbackBatches.push({ nama: match[1].trim(), warna: match[2].trim() });
            }
          }
        });

        let parsedBatches = fallbackBatches;
        const batchesJson = settingsMap.get('batches_json');
        if (batchesJson) {
          try {
            const arr = JSON.parse(batchesJson);
            if (Array.isArray(arr)) parsedBatches = arr;
          } catch {
            // fallback
          }
        }

        let signatureDefaults: any = undefined;
        const sigJson = settingsMap.get('signature_defaults_json');
        if (sigJson) {
          try {
            signatureDefaults = JSON.parse(sigJson);
          } catch {
            signatureDefaults = undefined;
          }
        }

        const pengaturan: any = {};
        if (settingsMap.has('batas_sering_berobat_kali')) {
          pengaturan.batas_sering_berobat_kali = Number(settingsMap.get('batas_sering_berobat_kali')) || 7;
        }
        if (settingsMap.has('periode_sering_hari')) {
          pengaturan.periode_sering_hari = Number(settingsMap.get('periode_sering_hari')) || 7;
        }
        if (settingsMap.has('nama_klinik')) {
          pengaturan.nama_klinik = settingsMap.get('nama_klinik');
        }
        if (settingsMap.has('dokter_penanggung_jawab')) {
          pengaturan.dokter_penanggung_jawab = settingsMap.get('dokter_penanggung_jawab');
        }
        if (settingsMap.has('perawat_pemeriksa')) {
          pengaturan.perawat_pemeriksa = settingsMap.get('perawat_pemeriksa');
        }
        if (parsedBatches.length > 0) {
          pengaturan.batches = parsedBatches;
        }

        const sidb_history = readSheet('RIWAYAT_SIDB')
          .filter((r) => String(r['Nama File'] || r.nama_file || '').trim() !== '')
          .map((r, idx) => ({
            id: String(r.ID || r.id || `sidb-xls-${Date.now()}-${idx}`),
            tanggal: String(r.Tanggal || ''),
            nama_file: String(r['Nama File'] || ''),
            total_baris: Number(r['Total Baris'] || 0),
            wbp_baru: Number(r['WBP Baru'] || 0),
            wbp_diperbarui: Number(r['WBP Diperbarui'] || 0),
            wbp_ditandai_cek: Number(r['Ditandai Cek'] || 0),
          }));

        const audit_logs = readSheet('AUDIT_LOG')
          .filter((r) => String(r.Aksi || r.aksi || '').trim() !== '')
          .map((r, idx) => ({
            id: String(r.ID || r.id || `aud-xls-${Date.now()}-${idx}`),
            waktu: String(r.Waktu || ''),
            aksi: String(r.Aksi || ''),
            rincian: String(r.Rincian || ''),
            perangkat: String(r.Perangkat || ''),
          }));

        resolve({
          version: versionRow ? String(versionRow.Keterangan || '2.0') : '2.0',
          app_name: 'Klinik Pratama Lapas Kelas IIB Dompu',
          exported_at: timeRow ? String(timeRow.Keterangan || new Date().toISOString()) : new Date().toISOString(),
          wbp,
          kunjungan,
          referensi,
          penyakit,
          ...(master_obat !== undefined ? { master_obat } : {}),
          ...(resep_obat !== undefined ? { resep_obat } : {}),
          pengaturan,
          sidb_history,
          audit_logs,
          preferences: {
            theme: settingsMap.get('preferensi_tema') || 'light',
            ...(signatureDefaults ? { signature_defaults: signatureDefaults } : {}),
          },
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}

export function parseFileInBrowser(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        // cellDates: false ensures date text strings like "01/10/2026" remain as string "01/10/2026" and are not flipped by US MM/DD/YYYY logic
        const workbook = XLSX.read(data, { type: 'binary', cellDates: false, raw: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}
