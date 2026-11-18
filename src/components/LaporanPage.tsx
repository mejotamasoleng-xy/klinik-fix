import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  FileText,
  ImagePlus,
  Layers,
  Printer,
  RotateCcw,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  buildMonthlyReportsZip,
  formatIndonesianDate,
  generateReportDocuments,
  normalizeCounselors,
  normalizeParticipants,
  parseNonNegativeInt,
  validateReportInputs,
} from '../lib/laporan/docxGenerator';
import { generateCollageBlob, inspectDocxTemplate } from '../lib/laporan/imageProcessor';
import {
  REPORT_DEFINITIONS,
  loadSafeFormFields,
  resetSingleReportForm,
  saveSafeFormFields,
} from '../lib/laporan/reportConfig';
import { base64ToUint8Array, loadTemplatesBundle } from '../lib/laporan/templateStore';
import { terbilang } from '../lib/laporan/terbilang';
import { postProcessDocxPreview } from '../lib/laporan/docxPreviewFix';
import {
  DetectedPhotoSlot,
  GeneratedDocFile,
  KolaseState,
  ReportFormsMap,
  ReportKey,
  SlotPhotoFile,
  TemplateInspection,
  TemplateLoadState,
} from '../lib/laporan/types';
import LaporanPreviewModal from './LaporanPreviewModal';
import LaporanTemplateFallback from './LaporanTemplateFallback';

async function saveBlobFile(blob: Blob, fileName: string) {
  try {
    const mod = await import('file-saver');
    const FileSaver = mod.default ?? mod;
    const fn =
      typeof FileSaver === 'function'
        ? FileSaver
        : (FileSaver as unknown as { saveAs?: (b: Blob, n: string) => void }).saveAs;
    if (typeof fn === 'function') {
      fn(blob, fileName);
      return;
    }
  } catch {
    // Fallback ke anchor download
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type SubTabKey = ReportKey | 'template';

function createEmptyKolase(): KolaseState {
  return {
    mode: 'auto',
    photos: [null, null, null, null],
    readyFile: null,
    customWatermarkFile: null,
    previewUrl: null,
  };
}

function makeSlotPhoto(file: File): SlotPhotoFile {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

function revokePhoto(item: SlotPhotoFile | null | undefined) {
  if (item?.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

function formatRatioLabel(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return 'Bebas';
  if (Math.abs(ratio - 1) < 0.08) return '1:1';
  if (Math.abs(ratio - 16 / 9) < 0.12) return '16:9';
  if (Math.abs(ratio - 4 / 3) < 0.1) return '4:3';
  if (Math.abs(ratio - 3 / 2) < 0.1) return '3:2';
  return `${ratio.toFixed(2)}:1`;
}

export default function LaporanPage() {
  const [templateState, setTemplateState] = useState<TemplateLoadState>({
    bundle: null,
    source: 'incomplete',
    presentKeys: [],
    hasRehabTable: false,
  });
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>('fasum');

  const [forms, setForms] = useState<ReportFormsMap>(() => loadSafeFormFields());
  const [photosByReport, setPhotosByReport] = useState<
    Record<ReportKey, Record<string, SlotPhotoFile | null>>
  >({
    fasum: {},
    satker: {},
    sumbangan: {},
    ckg: {},
    rehab: {},
  });
  const [kolaseByReport, setKolaseByReport] = useState<
    Record<'fasum' | 'sumbangan', KolaseState>
  >({
    fasum: createEmptyKolase(),
    sumbangan: createEmptyKolase(),
  });

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [previewDocs, setPreviewDocs] = useState<GeneratedDocFile[] | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    details: string[];
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const printContainerRef = useRef<HTMLDivElement>(null);

  const reloadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const state = await loadTemplatesBundle();
      setTemplateState(state);
      if (state.source !== 'embedded_json' && state.bundle === null) {
        setActiveSubTab('template');
      } else if (state.source === 'embedded_json') {
        setActiveSubTab((prev) => (prev === 'template' ? 'fasum' : prev));
      }
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    void reloadTemplates();
  }, [reloadTemplates]);

  // Simpan field yang aman ke localStorage setiap kali forms berubah
  useEffect(() => {
    saveSafeFormFields(forms);
  }, [forms]);

  // Inspeksi template yang sudah dimuat secara asinkron untuk mendeteksi slot foto & variabel
  const [inspections, setInspections] = useState<Partial<Record<ReportKey, TemplateInspection>>>({});

  useEffect(() => {
    let cancelled = false;
    if (!templateState.bundle) {
      setInspections({});
      return;
    }
    const runInspect = async () => {
      const out: Partial<Record<ReportKey, TemplateInspection>> = {};
      for (const def of REPORT_DEFINITIONS) {
        try {
          const b64 = templateState.bundle?.template[def.key];
          if (b64) {
            out[def.key] = await inspectDocxTemplate(base64ToUint8Array(b64));
          }
        } catch {
          // Biarkan ditangani saat validasi generate
        }
      }
      if (!cancelled) {
        setInspections(out);
      }
    };
    void runInspect();
    return () => {
      cancelled = true;
    };
  }, [templateState.bundle]);

  // Perbarui pratinjau kanvas kolase otomatis saat foto/watermark fasum berubah
  useEffect(() => {
    let cancelled = false;
    const state = kolaseByReport.fasum;
    if (state.mode !== 'auto' || !state.photos.some(Boolean)) {
      setKolaseByReport((prev) => {
        if (!prev.fasum.previewUrl) return prev;
        URL.revokeObjectURL(prev.fasum.previewUrl);
        return { ...prev, fasum: { ...prev.fasum, previewUrl: null } };
      });
      return;
    }

    const buildPreview = async () => {
      try {
        const blob = await generateCollageBlob({
          files: state.photos.map((p) => p?.file || null),
          size: 1080,
          customWatermarkFile: state.customWatermarkFile?.file || null,
        });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setKolaseByReport((prev) => {
          if (prev.fasum.previewUrl) URL.revokeObjectURL(prev.fasum.previewUrl);
          return { ...prev, fasum: { ...prev.fasum, previewUrl: url } };
        });
      } catch {
        // Abaikan error pratinjau non-fatal
      }
    };
    void buildPreview();
    return () => {
      cancelled = true;
    };
  }, [
    kolaseByReport.fasum.mode,
    kolaseByReport.fasum.photos,
    kolaseByReport.fasum.customWatermarkFile,
  ]);

  // Perbarui pratinjau kanvas kolase otomatis untuk sumbangan
  useEffect(() => {
    let cancelled = false;
    const state = kolaseByReport.sumbangan;
    if (state.mode !== 'auto' || !state.photos.some(Boolean)) {
      setKolaseByReport((prev) => {
        if (!prev.sumbangan.previewUrl) return prev;
        URL.revokeObjectURL(prev.sumbangan.previewUrl);
        return { ...prev, sumbangan: { ...prev.sumbangan, previewUrl: null } };
      });
      return;
    }

    const buildPreview = async () => {
      try {
        const blob = await generateCollageBlob({
          files: state.photos.map((p) => p?.file || null),
          size: 1476,
          customWatermarkFile: state.customWatermarkFile?.file || null,
        });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setKolaseByReport((prev) => {
          if (prev.sumbangan.previewUrl) URL.revokeObjectURL(prev.sumbangan.previewUrl);
          return { ...prev, sumbangan: { ...prev.sumbangan, previewUrl: url } };
        });
      } catch {
        // Abaikan error pratinjau non-fatal
      }
    };
    void buildPreview();
    return () => {
      cancelled = true;
    };
  }, [
    kolaseByReport.sumbangan.mode,
    kolaseByReport.sumbangan.photos,
    kolaseByReport.sumbangan.customWatermarkFile,
  ]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const activeReportKey: ReportKey =
    activeSubTab === 'template' ? 'fasum' : activeSubTab;
  const activeDef =
    REPORT_DEFINITIONS.find((d) => d.key === activeReportKey) || REPORT_DEFINITIONS[0];

  const activeDetectedSlots: DetectedPhotoSlot[] = useMemo(() => {
    return inspections[activeReportKey]?.photoSlots || [];
  }, [inspections, activeReportKey]);

  const activeValidation = useMemo(() => {
    return validateReportInputs({
      reportKey: activeReportKey,
      forms,
      photosByReport,
      kolaseByReport,
      detectedSlots: activeDetectedSlots,
    });
  }, [activeReportKey, forms, photosByReport, kolaseByReport, activeDetectedSlots]);

  const showTemplateTab = templateState.source !== 'embedded_json';

  const updateField = <K extends ReportKey>(
    reportKey: K,
    patch: Partial<ReportFormsMap[K]>
  ) => {
    setErrorBanner(null);
    setForms((prev) => ({
      ...prev,
      [reportKey]: {
        ...prev[reportKey],
        ...patch,
      },
    }));
  };

  const handleResetActiveForm = () => {
    const fresh = resetSingleReportForm(activeReportKey);
    setForms((prev) => ({
      ...prev,
      [activeReportKey]: fresh,
    }));

    // Bersihkan foto di sesi aktif agar reset menyeluruh
    if (activeReportKey === 'fasum' || activeReportKey === 'sumbangan') {
      const k = kolaseByReport[activeReportKey];
      k.photos.forEach(revokePhoto);
      revokePhoto(k.readyFile);
      revokePhoto(k.customWatermarkFile);
      if (k.previewUrl) URL.revokeObjectURL(k.previewUrl);
      setKolaseByReport((prev) => ({
        ...prev,
        [activeReportKey]: createEmptyKolase(),
      }));
    } else {
      Object.values(photosByReport[activeReportKey] || {}).forEach(revokePhoto);
      setPhotosByReport((prev) => ({
        ...prev,
        [activeReportKey]: {},
      }));
    }

    setErrorBanner(null);
    setToastMsg(`Form ${activeDef.title} dikembalikan ke nilai awal.`);
  };

  // Manipulasi slot foto standar (FOTO_1..N)
  const setStandardSlotFile = (reportKey: ReportKey, slotName: string, file: File | null) => {
    setPhotosByReport((prev) => {
      const current = prev[reportKey] || {};
      revokePhoto(current[slotName]);
      return {
        ...prev,
        [reportKey]: {
          ...current,
          [slotName]: file ? makeSlotPhoto(file) : null,
        },
      };
    });
  };

  const swapStandardSlots = (reportKey: ReportKey, slotA: string, slotB: string) => {
    setPhotosByReport((prev) => {
      const current = prev[reportKey] || {};
      return {
        ...prev,
        [reportKey]: {
          ...current,
          [slotA]: current[slotB] || null,
          [slotB]: current[slotA] || null,
        },
      };
    });
  };

  const fillStandardSlotsBulk = (reportKey: ReportKey, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const slots = inspections[reportKey]?.photoSlots || [];
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setPhotosByReport((prev) => {
      const nextMap = { ...(prev[reportKey] || {}) };
      let fileIdx = 0;
      for (const s of slots) {
        if (!nextMap[s.name] && fileIdx < imageFiles.length) {
          nextMap[s.name] = makeSlotPhoto(imageFiles[fileIdx++]);
        }
      }
      // Jika masih ada sisa dan semua slot sudah terisi, timpa dari awal
      let slotIdx = 0;
      while (fileIdx < imageFiles.length && slotIdx < slots.length) {
        const s = slots[slotIdx++];
        revokePhoto(nextMap[s.name]);
        nextMap[s.name] = makeSlotPhoto(imageFiles[fileIdx++]);
      }
      return { ...prev, [reportKey]: nextMap };
    });
  };

  // Manipulasi slot foto Kolase
  const setKolasePhotoSlot = (
    reportKey: 'fasum' | 'sumbangan',
    index: number,
    file: File | null
  ) => {
    setKolaseByReport((prev) => {
      const k = prev[reportKey];
      const nextPhotos = [...k.photos];
      revokePhoto(nextPhotos[index]);
      nextPhotos[index] = file ? makeSlotPhoto(file) : null;
      return {
        ...prev,
        [reportKey]: { ...k, photos: nextPhotos },
      };
    });
  };

  const swapKolasePhotos = (
    reportKey: 'fasum' | 'sumbangan',
    idxA: number,
    idxB: number
  ) => {
    setKolaseByReport((prev) => {
      const k = prev[reportKey];
      const nextPhotos = [...k.photos];
      const temp = nextPhotos[idxA];
      nextPhotos[idxA] = nextPhotos[idxB];
      nextPhotos[idxB] = temp;
      return {
        ...prev,
        [reportKey]: { ...k, photos: nextPhotos },
      };
    });
  };

  const fillKolasePhotosBulk = (
    reportKey: 'fasum' | 'sumbangan',
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setKolaseByReport((prev) => {
      const k = prev[reportKey];
      const nextPhotos = [...k.photos];
      let fileIdx = 0;
      for (let i = 0; i < 4 && fileIdx < imageFiles.length; i++) {
        if (!nextPhotos[i]) {
          nextPhotos[i] = makeSlotPhoto(imageFiles[fileIdx++]);
        }
      }
      for (let i = 0; i < 4 && fileIdx < imageFiles.length; i++) {
        revokePhoto(nextPhotos[i]);
        nextPhotos[i] = makeSlotPhoto(imageFiles[fileIdx++]);
      }
      return {
        ...prev,
        [reportKey]: { ...k, photos: nextPhotos },
      };
    });
  };

  const printSingleGeneratedDoc = async (doc: GeneratedDocFile) => {
    const host = printContainerRef.current;
    if (!host) return;
    setBusyAction('print');
    setErrorBanner(null);
    try {
      host.innerHTML = '';
      host.removeAttribute('data-paper');
      const [{ renderAsync }, buf] = await Promise.all([
        import('docx-preview'),
        doc.blob.arrayBuffer(),
      ]);
      await renderAsync(buf, host, undefined, {
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        renderHeaders: true,
        renderFooters: true,
        useBase64URL: true,
      });

      const paperSize = await postProcessDocxPreview(host, doc.blob);
      host.setAttribute('data-paper', paperSize);

      // Tunggu semua gambar (termasuk logo HD Kop Surat & foto) selesai dimuat sebelum print
      const imgs = Array.from(host.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
        )
      );

      document.body.classList.add('laporan-printing');
      const cleanupPrint = () => {
        document.body.classList.remove('laporan-printing');
        host.innerHTML = '';
        host.removeAttribute('data-paper');
        window.removeEventListener('afterprint', cleanupPrint);
      };
      window.addEventListener('afterprint', cleanupPrint);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            window.print();
            // Fallback cleanup bila browser tidak memicu afterprint secara instan
            setTimeout(() => {
              if (document.body.classList.contains('laporan-printing')) {
                cleanupPrint();
              }
            }, 1500);
          }, 180);
        });
      });
    } catch (err) {
      document.body.classList.remove('laporan-printing');
      setErrorBanner(
        err instanceof Error ? err.message : 'Gagal menyiapkan cetak PDF.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const runActiveReportAction = async (mode: 'preview' | 'word' | 'pdf') => {
    if (!templateState.bundle) {
      setErrorBanner(
        'Template dokumen belum lengkap. Silakan lengkapi di tab Template terlebih dahulu.'
      );
      return;
    }

    if (activeValidation.errors.length > 0) {
      setErrorBanner(activeValidation.errors.join(' '));
      return;
    }

    const execute = async () => {
      setBusyAction(mode);
      setErrorBanner(null);
      try {
        const docs = await generateReportDocuments({
          reportKey: activeReportKey,
          bundle: templateState.bundle!,
          forms,
          photosByReport,
          kolaseByReport,
        });

        if (mode === 'preview') {
          setPreviewDocs(docs);
        } else if (mode === 'word') {
          for (const d of docs) {
            await saveBlobFile(d.blob, d.fileName);
          }
          setToastMsg(
            docs.length > 1
              ? `${docs.length} file Word berhasil dibuat (${docs
                  .map((d) => d.fileName)
                  .join(', ')}).`
              : `File ${docs[0].fileName} berhasil diunduh.`
          );
        } else if (mode === 'pdf') {
          // Untuk CKG yang memiliki 2 dokumen, arahkan pratinjau dulu agar user bisa pilih dokumen atau cetak yang utama
          if (docs.length > 1) {
            setPreviewDocs(docs);
            setToastMsg(
              'CKG menghasilkan 2 dokumen. Pilih tab dokumen di pratinjau lalu klik Simpan PDF.'
            );
          } else {
            await printSingleGeneratedDoc(docs[0]);
          }
        }
      } catch (err) {
        setErrorBanner(
          err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses dokumen.'
        );
      } finally {
        setBusyAction(null);
      }
    };

    if (activeValidation.missingPhotoSlots.length > 0) {
      setConfirmModal({
        title: `Foto ${activeDef.title} Belum Lengkap`,
        message:
          'Masih ada slot foto yang kosong. Jika dilanjutkan, gambar bawaan template pada slot kosong tidak akan diganti.',
        details: activeValidation.missingPhotoSlots.map((s) => `Belum diisi: ${s}`),
        confirmLabel: 'Lanjutkan Buat Dokumen',
        onConfirm: async () => {
          setConfirmModal(null);
          await execute();
        },
      });
      return;
    }

    await execute();
  };

  const handleGenerateAllMonthly = async () => {
    if (!templateState.bundle) {
      setErrorBanner(
        'Template dokumen belum lengkap. Silakan lengkapi di tab Template terlebih dahulu.'
      );
      return;
    }

    // Validasi kelima laporan sekaligus agar tidak ada dokumen setengah jadi
    const hardErrors: string[] = [];
    const incompletePhotoWarnings: string[] = [];

    for (const def of REPORT_DEFINITIONS) {
      const slots = inspections[def.key]?.photoSlots || [];
      const res = validateReportInputs({
        reportKey: def.key,
        forms,
        photosByReport,
        kolaseByReport,
        detectedSlots: slots,
      });
      if (res.errors.length > 0) {
        hardErrors.push(`${def.title}: ${res.errors.join('; ')}`);
      }
      if (res.missingPhotoSlots.length > 0) {
        incompletePhotoWarnings.push(
          `${def.title} (${res.missingPhotoSlots.join(', ')})`
        );
      }
    }

    if (hardErrors.length > 0) {
      setErrorBanner(
        `Tidak dapat membuat semua laporan karena masih ada data yang belum lengkap: ${hardErrors.join(
          ' | '
        )}`
      );
      return;
    }

    const executeBatch = async () => {
      setBusyAction('batch');
      setErrorBanner(null);
      try {
        const allDocs: GeneratedDocFile[] = [];
        for (const def of REPORT_DEFINITIONS) {
          const docs = await generateReportDocuments({
            reportKey: def.key,
            bundle: templateState.bundle!,
            forms,
            photosByReport,
            kolaseByReport,
          });
          allDocs.push(...docs);
        }
        const { zipBlob, zipFileName } = await buildMonthlyReportsZip(allDocs);
        await saveBlobFile(zipBlob, zipFileName);
        setToastMsg(
          `Paket ZIP berisi ${allDocs.length} dokumen berhasil diunduh (${zipFileName}).`
        );
      } catch (err) {
        setErrorBanner(
          err instanceof Error
            ? err.message
            : 'Gagal membuat paket ZIP semua laporan.'
        );
      } finally {
        setBusyAction(null);
      }
    };

    if (incompletePhotoWarnings.length > 0) {
      setConfirmModal({
        title: 'Beberapa Slot Foto Belum Penuh',
        message:
          'Semua form laporan sudah lengkap, namun beberapa slot foto masih kosong. Tetap buat file ZIP bulanan?',
        details: incompletePhotoWarnings,
        confirmLabel: 'Tetap Buat ZIP Bulanan',
        onConfirm: async () => {
          setConfirmModal(null);
          await executeBatch();
        },
      });
      return;
    }

    await executeBatch();
  };

  // Hitung ringkasan kesiapan semua laporan untuk lencana kecil di tab kiri
  const readinessByReport = useMemo(() => {
    const map: Record<ReportKey, { valid: boolean; photosFull: boolean }> = {
      fasum: { valid: false, photosFull: false },
      satker: { valid: false, photosFull: false },
      sumbangan: { valid: false, photosFull: false },
      ckg: { valid: false, photosFull: false },
      rehab: { valid: false, photosFull: false },
    };
    for (const def of REPORT_DEFINITIONS) {
      const slots = inspections[def.key]?.photoSlots || [];
      const res = validateReportInputs({
        reportKey: def.key,
        forms,
        photosByReport,
        kolaseByReport,
        detectedSlots: slots,
      });
      map[def.key] = {
        valid: res.errors.length === 0,
        photosFull: res.missingPhotoSlots.length === 0,
      };
    }
    return map;
  }, [forms, photosByReport, kolaseByReport, inspections]);

  const datePreview = formatIndonesianDate(forms[activeReportKey].tanggal);

  // Hitungan khusus Rehabilitasi
  const rehabRingan = parseNonNegativeInt(forms.rehab.jumlah_ringan);
  const rehabSedang = parseNonNegativeInt(forms.rehab.jumlah_sedang);
  const rehabTotal =
    rehabRingan !== null && rehabSedang !== null ? rehabRingan + rehabSedang : null;
  const rehabNames = useMemo(
    () => normalizeParticipants(forms.rehab.peserta_text),
    [forms.rehab.peserta_text]
  );
  const rehabCounselors = useMemo(
    () => normalizeCounselors(forms.rehab.konselor_text),
    [forms.rehab.konselor_text]
  );
  const rehabCountMismatch =
    rehabTotal !== null && rehabNames.length !== rehabTotal;

  return (
    <div className="space-y-5">
      {/* Header Atas & Tombol Utama Buat Semua Laporan */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Pembuat Laporan Bulanan (.docx)
            </h1>
            {templateState.bundle && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3" />
                Template Siap
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Seluruh pengisian teks, pemotongan foto, kolase, dan pembuatan dokumen Word berjalan 100% di browser tanpa mengirim data ke server.
          </p>
        </div>

        <button
          type="button"
          disabled={loadingTemplates || !templateState.bundle || busyAction !== null}
          onClick={() => void handleGenerateAllMonthly()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors shrink-0"
        >
          <FileArchive className="w-4 h-4" />
          {busyAction === 'batch'
            ? 'Menyusun Paket ZIP…'
            : 'Buat semua laporan bulan ini'}
        </button>
      </div>

      {/* Notifikasi / Error */}
      {toastMsg && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {errorBanner && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs font-medium text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{errorBanner}</div>
        </div>
      )}

      {/* Layout Utama: Sidebar Sub-Menu Laporan + Konten */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Sidebar Sub-Navigasi Laporan */}
        <aside className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Jenis Laporan (5)
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1">
            {REPORT_DEFINITIONS.map((def) => {
              const isSelected = activeSubTab === def.key;
              const status = readinessByReport[def.key];
              return (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => {
                    setActiveSubTab(def.key);
                    setErrorBanner(null);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 font-bold border border-teal-200/80 dark:border-teal-800/70'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 font-medium border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{def.title}</span>
                  </div>
                  <span
                    title={
                      status.valid
                        ? status.photosFull
                          ? 'Data & foto lengkap'
                          : 'Data siap, foto belum lengkap'
                        : 'Tanggal atau field wajib belum lengkap'
                    }
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      status.valid
                        ? status.photosFull
                          ? 'bg-emerald-500'
                          : 'bg-amber-400'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                </button>
              );
            })}

            {showTemplateTab && (
              <button
                type="button"
                onClick={() => {
                  setActiveSubTab('template');
                  setErrorBanner(null);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs transition-colors ${
                  activeSubTab === 'template'
                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800'
                    : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50/60 dark:hover:bg-amber-950/30 font-medium border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Settings2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">Template</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 tabular-nums">
                  {templateState.presentKeys.length}/6
                </span>
              </button>
            )}
          </div>

          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 px-2.5 pb-1 space-y-1 text-[11px] text-slate-400 dark:text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Data & foto lengkap</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Data siap, foto kurang</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
              <span>Belum siap dibuat</span>
            </div>
          </div>
        </aside>

        {/* Konten Kanan: Fallback Template ATAU Editor Laporan 2 Kolom */}
        <div className="lg:col-span-9">
          {activeSubTab === 'template' && showTemplateTab ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6">
              <LaporanTemplateFallback
                templateState={templateState}
                onReloadTemplates={reloadTemplates}
              />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Banner Peringatan bila bundle belum siap */}
              {!loadingTemplates && !templateState.bundle && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Template Word belum tersedia. Unggah template terlebih dahulu agar dokumen dapat dibuat.
                    </span>
                  </div>
                  {showTemplateTab && (
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('template')}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 shrink-0"
                    >
                      Buka Tab Template
                    </button>
                  )}
                </div>
              )}

              {/* Grid 2 Kolom: Form di Kiri, Slot Foto di Kanan */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* KOLOM KIRI: FORM DATA */}
                <div className="xl:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {activeDef.title}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {activeDef.subtitle}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetActiveForm}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset form
                    </button>
                  </div>

                  {/* Input Tanggal Tunggal */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Tanggal Kegiatan <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="relative flex-1">
                        <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="date"
                          value={forms[activeReportKey].tanggal}
                          onChange={(e) =>
                            updateField(activeReportKey, {
                              tanggal: e.target.value,
                            } as Partial<ReportFormsMap[typeof activeReportKey]>)
                          }
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                      </div>
                      {datePreview ? (
                        <div className="px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200/70 dark:border-teal-800/60 text-xs font-semibold text-teal-800 dark:text-teal-300 shrink-0">
                          {datePreview.hari}, {datePreview.tanggal}
                        </div>
                      ) : (
                        <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                          Pilih tanggal dahulu
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Field Khusus Baksos Fasum */}
                  {activeReportKey === 'fasum' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Lokasi Kegiatan <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={forms.fasum.lokasi}
                          onChange={(e) =>
                            updateField('fasum', { lokasi: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Objek Sasaran <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={forms.fasum.objek}
                          onChange={(e) =>
                            updateField('fasum', { objek: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Daftar Petugas <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={4}
                          value={forms.fasum.daftar_petugas}
                          onChange={(e) =>
                            updateField('fasum', { daftar_petugas: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                        <p className="text-[11px] text-slate-400">
                          Jangan diawali atau diakhiri tanda titik (dipakai setelah kata &ldquo;oleh ...&rdquo;).
                        </p>
                      </div>
                    </>
                  )}

                  {/* Field Khusus Baksos Satker */}
                  {activeReportKey === 'satker' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Lokasi Kegiatan <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={forms.satker.lokasi}
                          onChange={(e) =>
                            updateField('satker', { lokasi: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Daftar Petugas <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={4}
                          value={forms.satker.daftar_petugas}
                          onChange={(e) =>
                            updateField('satker', { daftar_petugas: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                        <p className="text-[11px] text-slate-400">
                          Jangan diawali atau diakhiri tanda titik.
                        </p>
                      </div>
                    </>
                  )}

                  {/* Field Khusus Baksos Sumbangan */}
                  {activeReportKey === 'sumbangan' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Jumlah Paket Bantuan <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={forms.sumbangan.jumlah_paket}
                          onChange={(e) =>
                            updateField('sumbangan', { jumlah_paket: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Daftar Petugas <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={4}
                          value={forms.sumbangan.daftar_petugas}
                          onChange={(e) =>
                            updateField('sumbangan', { daftar_petugas: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                        <p className="text-[11px] text-slate-400">
                          Jangan diawali atau diakhiri tanda titik.
                        </p>
                      </div>
                    </>
                  )}

                  {/* Field Khusus CKG */}
                  {activeReportKey === 'ckg' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Jumlah Peserta CKG <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={forms.ckg.jumlah_peserta}
                          onChange={(e) =>
                            updateField('ckg', { jumlah_peserta: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Nama Perawat Pelaksana <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={forms.ckg.nama_perawat}
                          onChange={(e) =>
                            updateField('ckg', { nama_perawat: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                      </div>

                      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 p-3 text-xs text-slate-600 dark:text-slate-300">
                        CKG otomatis menghasilkan <strong>2 dokumen Word</strong> sekaligus: Laporan CKG dan Daftar Hadir CKG memakai tanggal yang sama.
                      </div>
                    </>
                  )}

                  {/* Field Khusus Rehabilitasi */}
                  {activeReportKey === 'rehab' && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                            Peserta Ringan <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={forms.rehab.jumlah_ringan}
                            onChange={(e) =>
                              updateField('rehab', { jumlah_ringan: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                          />
                          {rehabRingan !== null && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              &ldquo;{terbilang(rehabRingan)}&rdquo;
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                            Peserta Sedang <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={forms.rehab.jumlah_sedang}
                            onChange={(e) =>
                              updateField('rehab', { jumlah_sedang: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                          />
                          {rehabSedang !== null && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              &ldquo;{terbilang(rehabSedang)}&rdquo;
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                            Total Peserta (Otomatis)
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={rehabTotal !== null ? String(rehabTotal) : '-'}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums cursor-default"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                            Nama peserta (satu nama per baris){' '}
                            <span className="text-rose-500">*</span>
                          </label>
                          <span
                            className={`text-[11px] font-bold tabular-nums px-2 py-0.5 rounded ${
                              rehabCountMismatch
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : rehabTotal !== null && rehabNames.length === rehabTotal
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {rehabNames.length} / {rehabTotal ?? '?'} nama
                          </span>
                        </div>
                        <textarea
                          rows={7}
                          placeholder="Tulis 1 nama per baris (otomatis HURUF KAPITAL)..."
                          value={forms.rehab.peserta_text}
                          onChange={(e) => {
                            const el = e.target;
                            const start = el.selectionStart;
                            const end = el.selectionEnd;
                            const upper = el.value.toUpperCase();
                            updateField('rehab', { peserta_text: upper });
                            requestAnimationFrame(() => {
                              try {
                                el.setSelectionRange(start, end);
                              } catch {
                                // Abaikan bila fokus berpindah
                              }
                            });
                          }}
                          className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 ${
                            rehabCountMismatch
                              ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30'
                              : 'border-slate-300 dark:border-slate-700 focus:ring-teal-500/40 focus:border-teal-500'
                          }`}
                        />
                        {rehabCountMismatch && (
                          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>
                              Jumlah baris nama ({rehabNames.length}) tidak cocok dengan jumlah peserta ({rehabTotal}). Perbaiki sebelum membuat dokumen.
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                            Konselor (satu nama per baris){' '}
                            <span className="text-rose-500">*</span>
                          </label>
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            {rehabCounselors.length} konselor
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          value={forms.rehab.konselor_text}
                          onChange={(e) =>
                            updateField('rehab', { konselor_text: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* KOLOM KANAN: SLOT FOTO / KOLASE */}
                <div className="xl:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
                  {(activeReportKey === 'fasum' || activeReportKey === 'sumbangan') ? (
                    <KolasePanel
                      reportKey={activeReportKey}
                      kolaseSize={activeReportKey === 'fasum' ? 1080 : 1476}
                      kolaseState={kolaseByReport[activeReportKey]}
                      onChangeMode={(mode) =>
                        setKolaseByReport((prev) => ({
                          ...prev,
                          [activeReportKey]: { ...prev[activeReportKey], mode },
                        }))
                      }
                      onSetPhoto={(idx, file) =>
                        setKolasePhotoSlot(activeReportKey, idx, file)
                      }
                      onSwapPhotos={(a, b) => swapKolasePhotos(activeReportKey, a, b)}
                      onBulkFill={(files) => fillKolasePhotosBulk(activeReportKey, files)}
                      onSetReadyFile={(file) =>
                        setKolaseByReport((prev) => {
                          revokePhoto(prev[activeReportKey].readyFile);
                          return {
                            ...prev,
                            [activeReportKey]: {
                              ...prev[activeReportKey],
                              readyFile: file ? makeSlotPhoto(file) : null,
                            },
                          };
                        })
                      }
                      onSetWatermarkFile={(file) =>
                        setKolaseByReport((prev) => {
                          revokePhoto(prev[activeReportKey].customWatermarkFile);
                          return {
                            ...prev,
                            [activeReportKey]: {
                              ...prev[activeReportKey],
                              customWatermarkFile: file ? makeSlotPhoto(file) : null,
                            },
                          };
                        })
                      }
                    />
                  ) : (
                    <StandardPhotoSlotsPanel
                      reportKey={activeReportKey}
                      slots={activeDetectedSlots}
                      uploadedMap={photosByReport[activeReportKey] || {}}
                      onSetSlotFile={(slotName, file) =>
                        setStandardSlotFile(activeReportKey, slotName, file)
                      }
                      onSwapSlots={(a, b) => swapStandardSlots(activeReportKey, a, b)}
                      onBulkFill={(files) =>
                        fillStandardSlotsBulk(activeReportKey, files)
                      }
                    />
                  )}
                </div>
              </div>

              {/* Footer Tombol Aksi Per Laporan */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col gap-3">
                {activeValidation.errors.length > 0 && (
                  <div className="text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{activeValidation.errors[0]}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {activeValidation.missingPhotoSlots.length === 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        Semua slot foto sudah terisi.
                      </span>
                    ) : (
                      <span>
                        Slot belum diisi: {activeValidation.missingPhotoSlots.join(', ')}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={
                        !templateState.bundle ||
                        activeValidation.errors.length > 0 ||
                        busyAction !== null
                      }
                      onClick={() => void runActiveReportAction('preview')}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Eye className="w-4 h-4" />
                      Pratinjau
                    </button>

                    <button
                      type="button"
                      disabled={
                        !templateState.bundle ||
                        activeValidation.errors.length > 0 ||
                        busyAction !== null
                      }
                      onClick={() => void runActiveReportAction('pdf')}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Printer className="w-4 h-4" />
                      {busyAction === 'pdf' ? 'Menyiapkan PDF…' : 'Simpan PDF'}
                    </button>

                    <button
                      type="button"
                      disabled={
                        !templateState.bundle ||
                        activeValidation.errors.length > 0 ||
                        busyAction !== null
                      }
                      onClick={() => void runActiveReportAction('word')}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-45 disabled:cursor-not-allowed shadow-xs"
                    >
                      <Download className="w-4 h-4" />
                      {busyAction === 'word' ? 'Membuat Word…' : 'Unduh Word'}
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                  Catatan Simpan PDF: Cetak PDF dari pratinjau browser menggunakan ukuran Letter dapat sedikit berbeda dari Microsoft Word. Untuk hasil yang identik 100%, unduh file .docx lalu buka di Microsoft Word dan pilih Simpan sebagai PDF.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Konfirmasi Foto Belum Penuh */}
      {confirmModal && (
        <div
          className="no-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {confirmModal.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
            </div>

            <ul className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 p-3 space-y-1 text-xs text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto">
              {confirmModal.details.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Kembali Lengkapi
              </button>
              <button
                type="button"
                onClick={() => void confirmModal.onConfirm()}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pratinjau docx-preview */}
      {previewDocs && (
        <LaporanPreviewModal
          docs={previewDocs}
          onClose={() => setPreviewDocs(null)}
          onDownloadDoc={(d) => void saveBlobFile(d.blob, d.fileName)}
          onPrintDoc={(d) => void printSingleGeneratedDoc(d)}
        />
      )}

      {/* Portal Kontainer Print Terisolasi untuk Simpan PDF (Letter / A4 sesuai template) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            id="laporan-print-root"
            ref={printContainerRef}
            className="laporan-print-host"
          />,
          document.body
        )}
    </div>
  );
}

// ==========================================
// Subkomponen Panel Slot Foto Standar (FOTO_1..N)
// ==========================================
function StandardPhotoSlotsPanel(props: {
  reportKey: ReportKey;
  slots: DetectedPhotoSlot[];
  uploadedMap: Record<string, SlotPhotoFile | null>;
  onSetSlotFile: (slotName: string, file: File | null) => void;
  onSwapSlots: (slotA: string, slotB: string) => void;
  onBulkFill: (files: FileList | null) => void;
}) {
  const { slots, uploadedMap, onSetSlotFile, onSwapSlots, onBulkFill } = props;
  const filledCount = slots.filter((s) => Boolean(uploadedMap[s.name])).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Slot Foto Dokumentasi ({filledCount}/{slots.length})
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Foto otomatis dipotong dari tengah (center-crop) mengikuti ukuran bingkai Word tanpa melar.
          </p>
        </div>

        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 hover:bg-teal-100">
          <ImagePlus className="w-3.5 h-3.5" />
          Pilih Banyak Foto
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              onBulkFill(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-slate-500">
          Memuat slot foto dari template Word…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {slots.map((slot, idx) => {
            const uploaded = uploadedMap[slot.name];
            const prevSlot = idx > 0 ? slots[idx - 1] : null;
            const nextSlot = idx < slots.length - 1 ? slots[idx + 1] : null;
            const displayLabel = `Foto ${slot.index || idx + 1}`;

            return (
              <PhotoDropCard
                key={slot.name}
                label={displayLabel}
                ratioHint={formatRatioLabel(slot.aspectRatio)}
                item={uploaded || null}
                onSelectFile={(file) => onSetSlotFile(slot.name, file)}
                onRemove={() => onSetSlotFile(slot.name, null)}
                onMovePrev={
                  prevSlot ? () => onSwapSlots(slot.name, prevSlot.name) : undefined
                }
                onMoveNext={
                  nextSlot ? () => onSwapSlots(slot.name, nextSlot.name) : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Subkomponen Panel Kolase 2x2 (Fasum & Sumbangan)
// ==========================================
function KolasePanel(props: {
  reportKey: 'fasum' | 'sumbangan';
  kolaseSize: number;
  kolaseState: KolaseState;
  onChangeMode: (mode: 'auto' | 'ready') => void;
  onSetPhoto: (index: number, file: File | null) => void;
  onSwapPhotos: (idxA: number, idxB: number) => void;
  onBulkFill: (files: FileList | null) => void;
  onSetReadyFile: (file: File | null) => void;
  onSetWatermarkFile: (file: File | null) => void;
}) {
  const {
    kolaseSize,
    kolaseState,
    onChangeMode,
    onSetPhoto,
    onSwapPhotos,
    onBulkFill,
    onSetReadyFile,
    onSetWatermarkFile,
  } = props;

  const filledCount = kolaseState.photos.filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Kolase Foto ({kolaseSize}×{kolaseSize} px)
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Susun otomatis 4 foto persegi 2×2 atau unggah kolase jadi langsung.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5">
          <button
            type="button"
            onClick={() => onChangeMode('auto')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              kolaseState.mode === 'auto'
                ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Susun Otomatis (4 Foto)
          </button>
          <button
            type="button"
            onClick={() => onChangeMode('ready')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              kolaseState.mode === 'ready'
                ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Unggah Kolase Jadi
          </button>
        </div>
      </div>

      {kolaseState.mode === 'ready' ? (
        <PhotoDropCard
          label="Gambar Kolase Siap Pakai"
          ratioHint="1:1"
          item={kolaseState.readyFile}
          onSelectFile={(file) => onSetReadyFile(file)}
          onRemove={() => onSetReadyFile(null)}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Foto Kolase ({filledCount}/4 terisi)
            </span>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 hover:bg-teal-100">
              <ImagePlus className="w-3.5 h-3.5" />
              Pilih 4 Foto Sekaligus
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  onBulkFill(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((idx) => (
              <PhotoDropCard
                key={idx}
                label={`Foto ${idx + 1}`}
                ratioHint="1:1"
                item={kolaseState.photos[idx]}
                onSelectFile={(file) => onSetPhoto(idx, file)}
                onRemove={() => onSetPhoto(idx, null)}
                onMovePrev={idx > 0 ? () => onSwapPhotos(idx, idx - 1) : undefined}
                onMoveNext={idx < 3 ? () => onSwapPhotos(idx, idx + 1) : undefined}
              />
            ))}
          </div>

          {/* Pengaturan Watermark */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-teal-600" />
                Watermark Tengah Atas
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {kolaseState.customWatermarkFile
                  ? `Custom: ${kolaseState.customWatermarkFile.file.name}`
                  : 'Default: Kapsul biru tua "DITJENPAS NTB LAPAS DOMPU"'}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {kolaseState.customWatermarkFile && (
                <button
                  type="button"
                  onClick={() => onSetWatermarkFile(null)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  Pakai Default
                </button>
              )}
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100">
                <Upload className="w-3.5 h-3.5" />
                {kolaseState.customWatermarkFile ? 'Ganti Gambar' : 'Unggah Watermark'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onSetWatermarkFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {/* Pratinjau Hasil Kolase Langsung */}
          {kolaseState.previewUrl && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Pratinjau Hasil Kolase ({kolaseSize}×{kolaseSize})
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-950 max-w-sm mx-auto">
                <img
                  src={kolaseState.previewUrl}
                  alt="Pratinjau Kolase"
                  className="w-full h-auto block"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Komponen Kartu Unggah Foto Drag-and-Drop
// ==========================================
function PhotoDropCard(props: {
  label: string;
  ratioHint: string;
  item: SlotPhotoFile | null;
  onSelectFile: (file: File) => void;
  onRemove: () => void;
  onMovePrev?: () => void;
  onMoveNext?: () => void;
}) {
  const { label, ratioHint, item, onSelectFile, onRemove, onMovePrev, onMoveNext } =
    props;
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f && f.type.startsWith('image/')) {
          onSelectFile(f);
        }
      }}
      className={`rounded-xl border transition-colors p-2.5 flex flex-col gap-2 ${
        dragging
          ? 'border-teal-500 bg-teal-50/70 dark:bg-teal-950/40'
          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
          {label}
        </span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 tabular-nums">
          Rasio {ratioHint}
        </span>
      </div>

      {item ? (
        <div className="space-y-2">
          <div className="relative rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 aspect-[4/3]">
            <img
              src={item.previewUrl}
              alt={label}
              className="w-full h-full object-cover block"
            />
          </div>
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              {onMovePrev && (
                <button
                  type="button"
                  title="Tukar ke posisi sebelumnya"
                  onClick={onMovePrev}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              )}
              {onMoveNext && (
                <button
                  type="button"
                  title="Tukar ke posisi berikutnya"
                  onClick={onMoveNext}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              <label className="cursor-pointer px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100">
                Ganti
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onSelectFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                title="Hapus foto"
                onClick={onRemove}
                className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-600 p-4 flex flex-col items-center justify-center gap-1.5 text-center min-h-[112px] bg-white/60 dark:bg-slate-900/40 transition-colors">
          <Upload className="w-5 h-5 text-slate-400" />
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Seret foto ke sini atau klik pilih
          </span>
          <span className="text-[10px] text-slate-400">JPG / PNG / WebP</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSelectFile(f);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}
