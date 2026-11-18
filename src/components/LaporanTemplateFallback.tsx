import React, { useState } from 'react';
import {
  CheckCircle2,
  FileUp,
  AlertTriangle,
  RefreshCw,
  Trash2,
  FileJson,
  FileText,
} from 'lucide-react';
import {
  ALL_TEMPLATE_KEYS,
  TEMPLATE_LABELS,
  clearFallbackTemplates,
  saveFallbackDocx,
  saveFallbackRehabTableJson,
} from '../lib/laporan/templateStore';
import { TemplateKey, TemplateLoadState } from '../lib/laporan/types';

interface LaporanTemplateFallbackProps {
  templateState: TemplateLoadState;
  onReloadTemplates: () => Promise<void>;
}

export default function LaporanTemplateFallback({
  templateState,
  onReloadTemplates,
}: LaporanTemplateFallbackProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleUploadDocx = async (key: TemplateKey, file: File | undefined) => {
    if (!file) return;
    setBusyKey(key);
    setStatusMsg(null);
    try {
      await saveFallbackDocx(key, file);
      await onReloadTemplates();
      setStatusMsg({
        type: 'success',
        text: `Template ${TEMPLATE_LABELS[key].title} berhasil disimpan ke IndexedDB.`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan file template.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleUploadRehabJson = async (file: File | undefined) => {
    if (!file) return;
    setBusyKey('rehab_json');
    setStatusMsg(null);
    try {
      await saveFallbackRehabTableJson(file);
      await onReloadTemplates();
      setStatusMsg({
        type: 'success',
        text: 'Konfigurasi rehab_tabel_peserta.json berhasil disimpan ke IndexedDB.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membaca file JSON.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleClearAll = async () => {
    setBusyKey('clear');
    setStatusMsg(null);
    try {
      await clearFallbackTemplates();
      await onReloadTemplates();
      setStatusMsg({
        type: 'success',
        text: 'Seluruh template cadangan di IndexedDB berhasil dihapus.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus data IndexedDB.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const totalReady =
    templateState.presentKeys.length + (templateState.hasRehabTable ? 1 : 0);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Mode Cadangan Template (IndexedDB)
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {templateState.errorMessage ||
                'File /templates.json tidak ditemukan atau rusak. Unggah 6 file Word (.docx) dan rehab_tabel_peserta.json di bawah ini agar fitur Laporan dapat digunakan.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void onReloadTemplates()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Muat Ulang
          </button>
          <button
            type="button"
            onClick={() => void handleClearAll()}
            disabled={busyKey === 'clear'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-rose-200 dark:border-rose-900/70 bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Hapus Semua
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`rounded-lg px-3.5 py-2.5 text-xs font-medium border ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Kelengkapan Berkas Template</span>
        <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
          {totalReady} / 7 berkas tersimpan
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ALL_TEMPLATE_KEYS.map((key) => {
          const info = TEMPLATE_LABELS[key];
          const isReady = templateState.presentKeys.includes(key);
          return (
            <div
              key={key}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isReady
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  {isReady ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {info.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Kode: <span className="font-mono">{key}</span> · {info.fileHint}
                  </div>
                </div>
              </div>

              <label className="shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50">
                <FileUp className="w-3.5 h-3.5" />
                {busyKey === key ? 'Menyimpan…' : isReady ? 'Ganti' : 'Unggah'}
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    void handleUploadDocx(key, f);
                  }}
                />
              </label>
            </div>
          );
        })}

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-3 md:col-span-2">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                templateState.hasRehabTable
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}
            >
              {templateState.hasRehabTable ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <FileJson className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Konfigurasi Tabel Peserta Rehabilitasi
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Berkas <span className="font-mono">rehab_tabel_peserta.json</span> (tblOpen, header, firstRow, middleRow, lastRow, konselorParagraph, tblClose)
              </div>
            </div>
          </div>

          <label className="shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50">
            <FileUp className="w-3.5 h-3.5" />
            {busyKey === 'rehab_json'
              ? 'Menyimpan…'
              : templateState.hasRehabTable
              ? 'Ganti'
              : 'Unggah JSON'}
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                void handleUploadRehabJson(f);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
