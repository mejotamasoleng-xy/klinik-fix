import {
  centerCropToJpegBytes,
  generateCollageBlob,
  inspectDocxTemplate,
} from './imageProcessor';
import { REPORT_DEFINITIONS } from './reportConfig';
import { base64ToUint8Array } from './templateStore';
import { terbilang } from './terbilang';
import {
  DetectedPhotoSlot,
  GeneratedDocFile,
  KolaseState,
  RehabTableTemplate,
  ReportFormsMap,
  ReportKey,
  SlotPhotoFile,
  TemplateKey,
  TemplatesBundle,
} from './types';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = [
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

export interface FormattedIndonesianDate {
  tanggal: string; // "09 Oktober 2026"
  hari: string; // "Jumat"
  bulanUpper: string; // "OKTOBER"
  tahun: string; // "2026"
}

/**
 * Mengurai tanggal input YYYY-MM-DD memakai komponen waktu lokal (tanpa toISOString).
 */
export function formatIndonesianDate(dateStr: string): FormattedIndonesianDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const localDate = new Date(year, month - 1, day);
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return null;
  }

  const dayStr = String(day).padStart(2, '0');
  const monthName = BULAN_ID[month - 1];
  const dayName = HARI_ID[localDate.getDay()];

  return {
    tanggal: `${dayStr} ${monthName} ${year}`,
    hari: dayName,
    bulanUpper: monthName.toUpperCase(),
    tahun: String(year),
  };
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function normalizeParticipants(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase())
    .filter((line) => line.length > 0);
}

export function normalizeCounselors(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function parseNonNegativeInt(raw: string): number | null {
  if (raw.trim() === '') return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  const val = Number(raw.trim());
  return Number.isInteger(val) && val >= 0 ? val : null;
}

/**
 * Merakit raw XML tabel peserta rehabilitasi sesuai struktur rehab_tabel_peserta.
 * Menangani N = 1, N = 2, dan N >= 3.
 */
export function buildRehabTableXml(
  participants: string[],
  counselors: string[],
  tpl: RehabTableTemplate
): string {
  if (participants.length === 0) {
    throw new Error('Daftar nama peserta rehabilitasi tidak boleh kosong.');
  }
  if (counselors.length === 0) {
    throw new Error('Daftar nama konselor tidak boleh kosong.');
  }

  const konselorXml = counselors
    .map((c) => tpl.konselorParagraph.replace(/\{KONSELOR\}/g, escapeXml(c)))
    .join('');

  const buildRow = (templateRow: string, nama: string, includeKonselor: boolean): string => {
    let row = templateRow.replace(/\{NAMA\}/g, escapeXml(nama));
    if (includeKonselor) {
      row = row.replace(/\{KONSELOR_PARAGRAPHS\}/g, konselorXml);
    }
    return row;
  };

  const rows: string[] = [];
  const total = participants.length;
  if (total === 1) {
    rows.push(buildRow(tpl.firstRow, participants[0], true));
  } else if (total === 2) {
    rows.push(buildRow(tpl.firstRow, participants[0], true));
    rows.push(buildRow(tpl.lastRow, participants[1], false));
  } else {
    rows.push(buildRow(tpl.firstRow, participants[0], true));
    for (let i = 1; i < total - 1; i++) {
      rows.push(buildRow(tpl.middleRow, participants[i], false));
    }
    rows.push(buildRow(tpl.lastRow, participants[total - 1], false));
  }

  return `${tpl.tblOpen}${tpl.header}${rows.join('')}${tpl.tblClose}`;
}

export interface ReportValidationResult {
  errors: string[];
  missingPhotoSlots: string[];
}

export function validateReportInputs(params: {
  reportKey: ReportKey;
  forms: ReportFormsMap;
  photosByReport: Record<ReportKey, Record<string, SlotPhotoFile | null>>;
  kolaseByReport: Record<'fasum' | 'sumbangan', KolaseState>;
  detectedSlots: DetectedPhotoSlot[];
}): ReportValidationResult {
  const { reportKey, forms, photosByReport, kolaseByReport, detectedSlots } = params;
  const errors: string[] = [];
  const missingPhotoSlots: string[] = [];

  const form = forms[reportKey];
  const parsedDate = formatIndonesianDate(form.tanggal);
  if (!parsedDate) {
    errors.push('Tanggal kegiatan wajib diisi dengan format tanggal yang valid.');
  }

  if (reportKey === 'fasum') {
    const f = forms.fasum;
    if (!f.lokasi.trim()) errors.push('Lokasi wajib diisi.');
    if (!f.objek.trim()) errors.push('Objek kegiatan wajib diisi.');
    if (!f.daftar_petugas.trim()) errors.push('Daftar petugas wajib diisi.');
    if (f.daftar_petugas.trim().startsWith('.') || f.daftar_petugas.trim().endsWith('.')) {
      errors.push('Daftar petugas tidak boleh diawali atau diakhiri tanda titik.');
    }
  } else if (reportKey === 'satker') {
    const f = forms.satker;
    if (!f.lokasi.trim()) errors.push('Lokasi wajib diisi.');
    if (!f.daftar_petugas.trim()) errors.push('Daftar petugas wajib diisi.');
    if (f.daftar_petugas.trim().startsWith('.') || f.daftar_petugas.trim().endsWith('.')) {
      errors.push('Daftar petugas tidak boleh diawali atau diakhiri tanda titik.');
    }
  } else if (reportKey === 'sumbangan') {
    const f = forms.sumbangan;
    const paket = parseNonNegativeInt(f.jumlah_paket);
    if (paket === null) errors.push('Jumlah paket harus berupa bilangan bulat >= 0.');
    if (!f.daftar_petugas.trim()) errors.push('Daftar petugas wajib diisi.');
    if (f.daftar_petugas.trim().startsWith('.') || f.daftar_petugas.trim().endsWith('.')) {
      errors.push('Daftar petugas tidak boleh diawali atau diakhiri tanda titik.');
    }
  } else if (reportKey === 'ckg') {
    const f = forms.ckg;
    const peserta = parseNonNegativeInt(f.jumlah_peserta);
    if (peserta === null) errors.push('Jumlah peserta harus berupa bilangan bulat >= 0.');
    if (!f.nama_perawat.trim()) errors.push('Nama perawat wajib diisi.');
  } else if (reportKey === 'rehab') {
    const f = forms.rehab;
    const ringan = parseNonNegativeInt(f.jumlah_ringan);
    const sedang = parseNonNegativeInt(f.jumlah_sedang);
    if (ringan === null) errors.push('Jumlah peserta ringan harus bilangan bulat >= 0.');
    if (sedang === null) errors.push('Jumlah peserta sedang harus bilangan bulat >= 0.');
    const names = normalizeParticipants(f.peserta_text);
    const counselors = normalizeCounselors(f.konselor_text);
    if (counselors.length === 0) errors.push('Daftar konselor minimal 1 nama.');
    if (ringan !== null && sedang !== null) {
      const total = ringan + sedang;
      if (total <= 0) {
        errors.push('Total peserta rehabilitasi (ringan + sedang) harus minimal 1.');
      } else if (names.length !== total) {
        errors.push(
          `Jumlah baris nama peserta (${names.length}) harus sama persis dengan jumlah peserta (${total}).`
        );
      }
    } else if (names.length === 0) {
      errors.push('Daftar nama peserta wajib diisi.');
    }
  }

  // Cek kelengkapan foto
  if (reportKey === 'fasum' || reportKey === 'sumbangan') {
    const kState = kolaseByReport[reportKey];
    if (kState.mode === 'ready') {
      if (!kState.readyFile) missingPhotoSlots.push('Kolase jadi (1 gambar)');
    } else {
      kState.photos.forEach((p, idx) => {
        if (!p) missingPhotoSlots.push(`Foto Kolase ${idx + 1}`);
      });
    }
  } else {
    const slotMap = photosByReport[reportKey] || {};
    detectedSlots.forEach((slot) => {
      if (!slotMap[slot.name]) {
        const num = slot.name.replace('FOTO_', '');
        missingPhotoSlots.push(`Foto ${num}`);
      }
    });
  }

  return { errors, missingPhotoSlots };
}

/**
 * Validasi kecocokan variabel template dan merender DOCX bersih (hanya menyalin entri FILE ke PizZip baru).
 */
async function renderCleanDocxBlob(params: {
  templateKey: TemplateKey;
  bundle: TemplatesBundle;
  data: Record<string, string | number>;
  requiredVars: string[];
  imageReplacements: { slot: DetectedPhotoSlot; jpegBytes: Uint8Array }[];
  expectedSlotNames?: string[];
}): Promise<Blob> {
  const {
    templateKey,
    bundle,
    data,
    requiredVars,
    imageReplacements,
    expectedSlotNames,
  } = params;

  const base64 = bundle.template[templateKey];
  if (!base64) {
    throw new Error(`Template "${templateKey}" tidak ditemukan.`);
  }

  const rawBytes = base64ToUint8Array(base64);
  const inspection = await inspectDocxTemplate(rawBytes);

  // Validasi variabel yang wajib ada pada template
  const missingVars = requiredVars.filter((v) => !inspection.variables.includes(v));
  if (missingVars.length > 0) {
    throw new Error(
      `Template "${templateKey}" tidak memiliki variabel yang diperlukan: ${missingVars
        .map((v) => `{{${v}}}`)
        .join(', ')}.`
    );
  }

  // Validasi slot foto bila disyaratkan
  if (expectedSlotNames && expectedSlotNames.length > 0) {
    const foundNames = inspection.photoSlots.map((s) => s.name);
    const missingSlots = expectedSlotNames.filter((name) => !foundNames.includes(name));
    if (missingSlots.length > 0) {
      throw new Error(
        `Template "${templateKey}" tidak memiliki slot foto yang diharapkan: ${missingSlots.join(', ')}.`
      );
    }
  }

  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import('pizzip'),
    import('docxtemplater'),
  ]);
  const zip = new PizZip(rawBytes);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render(data);

  const renderedZip = doc.getZip();

  // Ganti binary media tepat pada targetPath masing-masing slot
  for (const rep of imageReplacements) {
    if (!renderedZip.file(rep.slot.targetPath)) {
      throw new Error(
        `Path media "${rep.slot.targetPath}" untuk slot "${rep.slot.name}" tidak ditemukan di dalam template "${templateKey}".`
      );
    }
    renderedZip.file(rep.slot.targetPath, rep.jpegBytes, { binary: true });
  }

  // Salin hanya entri BERUPA FILE (bukan folder) ke PizZip baru agar Word tidak menolak file
  const cleanZip = new PizZip();
  Object.keys(renderedZip.files).forEach((entryName) => {
    const entry = renderedZip.files[entryName];
    if (entry && !entry.dir) {
      cleanZip.file(entryName, entry.asUint8Array(), { binary: true });
    }
  });

  return cleanZip.generate({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

/**
 * Menghasilkan satu atau dua file .docx (khusus CKG: Laporan CKG + Daftar Hadir CKG) untuk laporan yang dipilih.
 */
export async function generateReportDocuments(params: {
  reportKey: ReportKey;
  bundle: TemplatesBundle;
  forms: ReportFormsMap;
  photosByReport: Record<ReportKey, Record<string, SlotPhotoFile | null>>;
  kolaseByReport: Record<'fasum' | 'sumbangan', KolaseState>;
}): Promise<GeneratedDocFile[]> {
  const { reportKey, bundle, forms, photosByReport, kolaseByReport } = params;
  const def = REPORT_DEFINITIONS.find((d) => d.key === reportKey)!;
  const dateInfo = formatIndonesianDate(forms[reportKey].tanggal);
  if (!dateInfo) {
    throw new Error(`Tanggal pada laporan ${def.title} belum diisi.`);
  }

  const suffix = `${dateInfo.bulanUpper}_${dateInfo.tahun}`;

  // Inspeksi slot foto di template utama laporan ini
  const tplBytes = base64ToUint8Array(bundle.template[reportKey]);
  const inspection = await inspectDocxTemplate(tplBytes);

  if (reportKey === 'fasum') {
    const kolaseSlot = inspection.photoSlots.find((s) => s.name === 'KOLASE');
    if (!kolaseSlot) {
      throw new Error('Template "fasum" tidak memiliki slot gambar bernama "KOLASE".');
    }

    const kState = kolaseByReport.fasum;
    const imageReplacements: { slot: DetectedPhotoSlot; jpegBytes: Uint8Array }[] = [];
    const hasAnyKolaseInput =
      kState.mode === 'ready'
        ? Boolean(kState.readyFile)
        : kState.photos.some((p) => Boolean(p));

    if (hasAnyKolaseInput) {
      let kolaseSource: Blob;
      if (kState.mode === 'ready' && kState.readyFile) {
        kolaseSource = kState.readyFile.file;
      } else {
        kolaseSource = await generateCollageBlob({
          files: kState.photos.map((p) => p?.file || null),
          size: 1080,
          customWatermarkFile: kState.customWatermarkFile?.file || null,
        });
      }
      const jpegBytes = await centerCropToJpegBytes(
        kolaseSource,
        kolaseSlot.aspectRatio,
        1600,
        0.9
      );
      imageReplacements.push({ slot: kolaseSlot, jpegBytes });
    }

    const f = forms.fasum;
    const blob = await renderCleanDocxBlob({
      templateKey: 'fasum',
      bundle,
      requiredVars: ['tanggal', 'hari', 'lokasi', 'objek', 'daftar_petugas'],
      expectedSlotNames: ['KOLASE'],
      data: {
        tanggal: dateInfo.tanggal,
        hari: dateInfo.hari,
        lokasi: f.lokasi.trim(),
        objek: f.objek.trim(),
        daftar_petugas: f.daftar_petugas.trim().replace(/^\.+|\.+$/g, ''),
      },
      imageReplacements,
    });

    return [
      {
        fileName: `BAKSOS_FASUM_${suffix}.docx`,
        blob,
        label: 'Baksos Fasum',
      },
    ];
  }

  if (reportKey === 'sumbangan') {
    const kolaseSlot = inspection.photoSlots.find((s) => s.name === 'KOLASE');
    if (!kolaseSlot) {
      throw new Error('Template "sumbangan" tidak memiliki slot gambar bernama "KOLASE".');
    }

    const kState = kolaseByReport.sumbangan;
    const imageReplacements: { slot: DetectedPhotoSlot; jpegBytes: Uint8Array }[] = [];
    const hasAnyKolaseInput =
      kState.mode === 'ready'
        ? Boolean(kState.readyFile)
        : kState.photos.some((p) => Boolean(p));

    if (hasAnyKolaseInput) {
      let kolaseSource: Blob;
      if (kState.mode === 'ready' && kState.readyFile) {
        kolaseSource = kState.readyFile.file;
      } else {
        kolaseSource = await generateCollageBlob({
          files: kState.photos.map((p) => p?.file || null),
          size: 1476,
          customWatermarkFile: kState.customWatermarkFile?.file || null,
        });
      }
      const jpegBytes = await centerCropToJpegBytes(
        kolaseSource,
        kolaseSlot.aspectRatio,
        1600,
        0.9
      );
      imageReplacements.push({ slot: kolaseSlot, jpegBytes });
    }

    const f = forms.sumbangan;
    const paket = parseNonNegativeInt(f.jumlah_paket);
    if (paket === null) {
      throw new Error('Jumlah paket sumbangan harus bilangan bulat >= 0.');
    }

    const blob = await renderCleanDocxBlob({
      templateKey: 'sumbangan',
      bundle,
      requiredVars: ['tanggal', 'hari', 'jumlah_paket', 'daftar_petugas'],
      expectedSlotNames: ['KOLASE'],
      data: {
        tanggal: dateInfo.tanggal,
        hari: dateInfo.hari,
        jumlah_paket: paket,
        daftar_petugas: f.daftar_petugas.trim().replace(/^\.+|\.+$/g, ''),
      },
      imageReplacements,
    });

    return [
      {
        fileName: `BAKSOS_SUMBANGAN_${suffix}.docx`,
        blob,
        label: 'Baksos Sumbangan',
      },
    ];
  }

  if (reportKey === 'satker') {
    const slotMap = photosByReport.satker || {};
    const imageReplacements: { slot: DetectedPhotoSlot; jpegBytes: Uint8Array }[] = [];
    for (const slot of inspection.photoSlots) {
      const uploaded = slotMap[slot.name];
      if (uploaded) {
        const jpegBytes = await centerCropToJpegBytes(
          uploaded.file,
          slot.aspectRatio,
          1600,
          0.9
        );
        imageReplacements.push({ slot, jpegBytes });
      }
    }

    const f = forms.satker;
    const blob = await renderCleanDocxBlob({
      templateKey: 'satker',
      bundle,
      requiredVars: ['tanggal', 'hari', 'lokasi', 'daftar_petugas'],
      expectedSlotNames: inspection.photoSlots.map((s) => s.name),
      data: {
        tanggal: dateInfo.tanggal,
        hari: dateInfo.hari,
        lokasi: f.lokasi.trim(),
        daftar_petugas: f.daftar_petugas.trim().replace(/^\.+|\.+$/g, ''),
      },
      imageReplacements,
    });

    return [
      {
        fileName: `BAKSOS_SATKER_${suffix}.docx`,
        blob,
        label: 'Baksos Satker',
      },
    ];
  }

  if (reportKey === 'ckg') {
    const slotMap = photosByReport.ckg || {};
    const imageReplacements: { slot: DetectedPhotoSlot; jpegBytes: Uint8Array }[] = [];
    for (const slot of inspection.photoSlots) {
      const uploaded = slotMap[slot.name];
      if (uploaded) {
        const jpegBytes = await centerCropToJpegBytes(
          uploaded.file,
          slot.aspectRatio,
          1600,
          0.9
        );
        imageReplacements.push({ slot, jpegBytes });
      }
    }

    const f = forms.ckg;
    const peserta = parseNonNegativeInt(f.jumlah_peserta);
    if (peserta === null) {
      throw new Error('Jumlah peserta CKG harus bilangan bulat >= 0.');
    }

    const laporanBlob = await renderCleanDocxBlob({
      templateKey: 'ckg',
      bundle,
      requiredVars: ['tanggal', 'hari', 'jumlah_peserta', 'nama_perawat'],
      expectedSlotNames: inspection.photoSlots.map((s) => s.name),
      data: {
        tanggal: dateInfo.tanggal,
        hari: dateInfo.hari,
        jumlah_peserta: peserta,
        nama_perawat: f.nama_perawat.trim(),
      },
      imageReplacements,
    });

    const daftarHadirBlob = await renderCleanDocxBlob({
      templateKey: 'ckg_daftar_hadir',
      bundle,
      requiredVars: ['tanggal'],
      data: {
        tanggal: dateInfo.tanggal,
      },
      imageReplacements: [],
    });

    return [
      {
        fileName: `CKG_${suffix}.docx`,
        blob: laporanBlob,
        label: 'Laporan CKG',
      },
      {
        fileName: `CKG_DAFTAR_HADIR_${suffix}.docx`,
        blob: daftarHadirBlob,
        label: 'Daftar Hadir CKG',
      },
    ];
  }

  // Rehabilitasi
  const slotMap = photosByReport.rehab || {};
  const imageReplacements: { slot: DetectedPhotoSlot; jpegBytes: Uint8Array }[] = [];
  for (const slot of inspection.photoSlots) {
    const uploaded = slotMap[slot.name];
    if (uploaded) {
      const jpegBytes = await centerCropToJpegBytes(
        uploaded.file,
        slot.aspectRatio,
        1600,
        0.9
      );
      imageReplacements.push({ slot, jpegBytes });
    }
  }

  const f = forms.rehab;
  const ringan = parseNonNegativeInt(f.jumlah_ringan);
  const sedang = parseNonNegativeInt(f.jumlah_sedang);
  if (ringan === null || sedang === null) {
    throw new Error('Jumlah peserta ringan dan sedang harus bilangan bulat >= 0.');
  }
  const totalPeserta = ringan + sedang;
  const participants = normalizeParticipants(f.peserta_text);
  const counselors = normalizeCounselors(f.konselor_text);

  if (totalPeserta <= 0) {
    throw new Error('Total peserta rehabilitasi harus minimal 1.');
  }
  if (participants.length !== totalPeserta) {
    throw new Error(
      `Jumlah nama peserta (${participants.length}) tidak sama dengan jumlah peserta (${totalPeserta}).`
    );
  }
  if (counselors.length === 0) {
    throw new Error('Daftar konselor tidak boleh kosong.');
  }

  const tabelXml = buildRehabTableXml(
    participants,
    counselors,
    bundle.rehab_tabel_peserta
  );

  const rehabBlob = await renderCleanDocxBlob({
    templateKey: 'rehab',
    bundle,
    requiredVars: [
      'tanggal',
      'jumlah_peserta',
      'jumlah_ringan',
      'jumlah_sedang',
      'ringan_terbilang',
      'sedang_terbilang',
      'tabel_peserta',
    ],
    expectedSlotNames: inspection.photoSlots.map((s) => s.name),
    data: {
      tanggal: dateInfo.tanggal,
      jumlah_peserta: totalPeserta,
      jumlah_ringan: ringan,
      jumlah_sedang: sedang,
      ringan_terbilang: terbilang(ringan),
      sedang_terbilang: terbilang(sedang),
      tabel_peserta: tabelXml,
    },
    imageReplacements,
  });

  return [
    {
      fileName: `REHABILITASI_${suffix}.docx`,
      blob: rehabBlob,
      label: 'Rehabilitasi',
    },
  ];
}

export async function buildMonthlyReportsZip(
  docs: GeneratedDocFile[]
): Promise<{ zipBlob: Blob; zipFileName: string }> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const doc of docs) {
    const bytes = await doc.blob.arrayBuffer();
    zip.file(doc.fileName, bytes);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  // Ambil bulan-tahun dari nama file pertama bila tersedia
  const firstMatch = docs[0]?.fileName.match(/_([A-Z]+_\d{4})\.docx$/);
  const suffix = firstMatch ? firstMatch[1] : 'BULAN_INI';

  return {
    zipBlob,
    zipFileName: `LAPORAN_BULANAN_${suffix}.zip`,
  };
}
