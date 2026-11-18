import {
  CkgFormState,
  FasumFormState,
  RehabFormState,
  ReportFormsMap,
  ReportKey,
  SatkerFormState,
  SumbanganFormState,
} from './types';

export const DEFAULT_DAFTAR_PETUGAS =
  'Jajaran Pegawai Lapas Kelas IIB Dompu, yaitu M. Syaripuddin Hazri selaku Kalapas, Lancur Ruktipriangga selaku Kasi Binadik, Sudirman selaku Ka. KPLP, M. Fahruroji selaku Kasi Kamtib, Lalu M. Hizbullah selaku Kasubag TU, beserta jajaran dan anak-anak magang';

export const DEFAULT_KONSELOR = ['MAYA', 'NURWULANDARI', 'WATI', 'ANDI', 'YUYUN'].join('\n');

export const REPORT_DEFINITIONS: {
  key: ReportKey;
  title: string;
  shortTitle: string;
  subtitle: string;
  filePrefix: string;
  usesKolase: boolean;
  kolaseSize?: number;
}[] = [
  {
    key: 'fasum',
    title: 'Baksos Fasum',
    shortTitle: 'Baksos Fasum',
    subtitle: 'Bakti sosial fasilitas umum + kolase foto 2x2',
    filePrefix: 'BAKSOS_FASUM',
    usesKolase: true,
    kolaseSize: 1080,
  },
  {
    key: 'satker',
    title: 'Baksos Satker',
    shortTitle: 'Baksos Satker',
    subtitle: 'Bakti sosial lingkungan satuan kerja (4 foto)',
    filePrefix: 'BAKSOS_SATKER',
    usesKolase: false,
  },
  {
    key: 'sumbangan',
    title: 'Baksos Sumbangan',
    shortTitle: 'Baksos Sumbangan',
    subtitle: 'Penyaluran bantuan paket + kolase foto 2x2',
    filePrefix: 'BAKSOS_SUMBANGAN',
    usesKolase: true,
    kolaseSize: 1476,
  },
  {
    key: 'ckg',
    title: 'CKG',
    shortTitle: 'CKG + Daftar Hadir',
    subtitle: 'Menghasilkan 2 dokumen: Laporan CKG & Daftar Hadir',
    filePrefix: 'CKG',
    usesKolase: false,
  },
  {
    key: 'rehab',
    title: 'Rehabilitasi',
    shortTitle: 'Rehabilitasi',
    subtitle: 'Laporan peserta rehabilitasi, konselor & tabel dinamis',
    filePrefix: 'REHABILITASI',
    usesKolase: false,
  },
];

export function createDefaultFasum(): FasumFormState {
  return {
    tanggal: '',
    lokasi: 'Masjid sekitar Lapas Kelas IIB Dompu',
    objek: 'masjid',
    daftar_petugas: DEFAULT_DAFTAR_PETUGAS,
  };
}

export function createDefaultSatker(): SatkerFormState {
  return {
    tanggal: '',
    lokasi: 'Depan Area Lapas Kelas IIB Dompu',
    daftar_petugas: DEFAULT_DAFTAR_PETUGAS,
  };
}

export function createDefaultSumbangan(): SumbanganFormState {
  return {
    tanggal: '',
    jumlah_paket: '40',
    daftar_petugas: DEFAULT_DAFTAR_PETUGAS,
  };
}

export function createDefaultCkg(): CkgFormState {
  return {
    tanggal: '',
    jumlah_peserta: '17',
    nama_perawat: 'M. Aminullah, Subhan, dan Mugi',
  };
}

export function createDefaultRehab(): RehabFormState {
  return {
    tanggal: '',
    jumlah_ringan: '',
    jumlah_sedang: '',
    peserta_text: '',
    konselor_text: DEFAULT_KONSELOR,
  };
}

export function createDefaultForms(): ReportFormsMap {
  return {
    fasum: createDefaultFasum(),
    satker: createDefaultSatker(),
    sumbangan: createDefaultSumbangan(),
    ckg: createDefaultCkg(),
    rehab: createDefaultRehab(),
  };
}

const STORAGE_KEY = 'klinik_dompu_laporan_fields_v1';

/**
 * Menyimpan hanya nilai field yang aman (bukan tanggal, bukan foto, bukan nama peserta rehabilitasi).
 */
export function saveSafeFormFields(forms: ReportFormsMap): void {
  try {
    const payload = {
      fasum: {
        lokasi: forms.fasum.lokasi,
        objek: forms.fasum.objek,
        daftar_petugas: forms.fasum.daftar_petugas,
      },
      satker: {
        lokasi: forms.satker.lokasi,
        daftar_petugas: forms.satker.daftar_petugas,
      },
      sumbangan: {
        jumlah_paket: forms.sumbangan.jumlah_paket,
        daftar_petugas: forms.sumbangan.daftar_petugas,
      },
      ckg: {
        jumlah_peserta: forms.ckg.jumlah_peserta,
        nama_perawat: forms.ckg.nama_perawat,
      },
      rehab: {
        jumlah_ringan: forms.rehab.jumlah_ringan,
        jumlah_sedang: forms.rehab.jumlah_sedang,
        konselor_text: forms.rehab.konselor_text,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Abaikan kegagalan storage (mode privat/kuota penuh), aplikasi tetap berjalan.
  }
}

export function loadSafeFormFields(): ReportFormsMap {
  const defaults = createDefaultForms();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;

    return {
      fasum: {
        tanggal: '',
        lokasi: typeof parsed.fasum?.lokasi === 'string' ? parsed.fasum.lokasi : defaults.fasum.lokasi,
        objek: typeof parsed.fasum?.objek === 'string' ? parsed.fasum.objek : defaults.fasum.objek,
        daftar_petugas:
          typeof parsed.fasum?.daftar_petugas === 'string'
            ? parsed.fasum.daftar_petugas
            : defaults.fasum.daftar_petugas,
      },
      satker: {
        tanggal: '',
        lokasi: typeof parsed.satker?.lokasi === 'string' ? parsed.satker.lokasi : defaults.satker.lokasi,
        daftar_petugas:
          typeof parsed.satker?.daftar_petugas === 'string'
            ? parsed.satker.daftar_petugas
            : defaults.satker.daftar_petugas,
      },
      sumbangan: {
        tanggal: '',
        jumlah_paket:
          typeof parsed.sumbangan?.jumlah_paket === 'string'
            ? parsed.sumbangan.jumlah_paket
            : defaults.sumbangan.jumlah_paket,
        daftar_petugas:
          typeof parsed.sumbangan?.daftar_petugas === 'string'
            ? parsed.sumbangan.daftar_petugas
            : defaults.sumbangan.daftar_petugas,
      },
      ckg: {
        tanggal: '',
        jumlah_peserta:
          typeof parsed.ckg?.jumlah_peserta === 'string'
            ? parsed.ckg.jumlah_peserta
            : defaults.ckg.jumlah_peserta,
        nama_perawat:
          typeof parsed.ckg?.nama_perawat === 'string'
            ? parsed.ckg.nama_perawat
            : defaults.ckg.nama_perawat,
      },
      rehab: {
        tanggal: '',
        jumlah_ringan:
          typeof parsed.rehab?.jumlah_ringan === 'string'
            ? parsed.rehab.jumlah_ringan
            : defaults.rehab.jumlah_ringan,
        jumlah_sedang:
          typeof parsed.rehab?.jumlah_sedang === 'string'
            ? parsed.rehab.jumlah_sedang
            : defaults.rehab.jumlah_sedang,
        peserta_text: '', // Jangan pernah simpan nama peserta
        konselor_text:
          typeof parsed.rehab?.konselor_text === 'string'
            ? parsed.rehab.konselor_text
            : defaults.rehab.konselor_text,
      },
    };
  } catch {
    return defaults;
  }
}

export function resetSingleReportForm(report: ReportKey): ReportFormsMap[ReportKey] {
  switch (report) {
    case 'fasum':
      return createDefaultFasum();
    case 'satker':
      return createDefaultSatker();
    case 'sumbangan':
      return createDefaultSumbangan();
    case 'ckg':
      return createDefaultCkg();
    case 'rehab':
      return createDefaultRehab();
  }
}
