/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Download, Printer, X, FileSignature, RotateCcw, Check } from 'lucide-react';
import {
  CleanReportOptions,
  SIGNATURE_PROMPT_EVENT,
  SignatureConfig,
  SignaturePromptRequest,
  clearSavedSignatureDefaults,
  exportReportToPdfDirect,
  getDefaultIndoDate,
  printIsolatedReportDirect,
  registerSignaturePromptHandler,
  resolveSignatureWithDefaults,
  saveSignatureDefaults,
} from '../lib/pdfReport';

export default function ReportSignatureModalHost() {
  const [pendingRequest, setPendingRequest] = useState<SignaturePromptRequest | null>(null);
  const [sigForm, setSigForm] = useState<Required<SignatureConfig>>({
    showLeft: true,
    leftTitle: 'Mengetahui,',
    leftRole: 'Kepala Lembaga Pemasyarakatan Kelas IIB Dompu',
    leftName: '( .................................................... )',
    leftNip: 'NIP. .................................................',
    rightDate: `Dompu, ${getDefaultIndoDate()}`,
    rightRole: 'Dokter / Petugas Medis Klinik',
    rightName: '( .................................................... )',
    rightNip: 'Klinik Pratama Lapas Kelas IIB Dompu',
  });
  const [rememberAsDefault, setRememberAsDefault] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  useEffect(() => {
    const openPrompt = (req: SignaturePromptRequest) => {
      const resolved = resolveSignatureWithDefaults(req.options.signature);
      setSigForm(resolved);
      setPendingRequest(req);
      setIsExporting(false);
    };

    registerSignaturePromptHandler(openPrompt);
    (window as any).__klinikSignaturePromptReady = true;

    const handleCustomEvent = (e: Event) => {
      const custom = e as CustomEvent<SignaturePromptRequest>;
      if (custom.detail) {
        openPrompt(custom.detail);
      }
    };
    window.addEventListener(SIGNATURE_PROMPT_EVENT, handleCustomEvent);

    return () => {
      registerSignaturePromptHandler(null);
      (window as any).__klinikSignaturePromptReady = false;
      window.removeEventListener(SIGNATURE_PROMPT_EVENT, handleCustomEvent);
    };
  }, []);

  useEffect(() => {
    if (!pendingRequest) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPendingRequest(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingRequest]);

  if (!pendingRequest) return null;

  const buildFinalOptions = (): CleanReportOptions => {
    if (rememberAsDefault) {
      saveSignatureDefaults({
        leftTitle: sigForm.leftTitle,
        leftName: sigForm.leftName,
        leftNip: sigForm.leftNip,
        rightName: sigForm.rightName,
        rightNip: sigForm.rightNip,
      });
    }

    return {
      ...pendingRequest.options,
      signature: {
        showLeft: sigForm.showLeft,
        leftTitle: sigForm.leftTitle.trim() || 'Mengetahui,',
        leftRole: sigForm.leftRole.trim(),
        leftName: sigForm.leftName.trim() || '( .................................................... )',
        leftNip: sigForm.leftNip.trim() || 'NIP. .................................................',
        rightDate: sigForm.rightDate.trim() || `Dompu, ${getDefaultIndoDate()}`,
        rightRole: sigForm.rightRole.trim(),
        rightName: sigForm.rightName.trim() || '( .................................................... )',
        rightNip: sigForm.rightNip.trim() || 'Klinik Pratama Lapas Kelas IIB Dompu',
      },
    };
  };

  const handleConfirmPdf = async () => {
    setIsExporting(true);
    try {
      const finalOptions = buildFinalOptions();
      setPendingRequest(null);
      await exportReportToPdfDirect(finalOptions);
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmPrint = () => {
    const finalOptions = buildFinalOptions();
    setPendingRequest(null);
    printIsolatedReportDirect(finalOptions);
  };

  const handleResetDots = () => {
    clearSavedSignatureDefaults();
    setSigForm((prev) => ({
      ...prev,
      leftTitle: 'Mengetahui,',
      leftName: '( .................................................... )',
      leftNip: 'NIP. .................................................',
      rightName: '( .................................................... )',
      rightNip: 'Klinik Pratama Lapas Kelas IIB Dompu',
    }));
  };

  return (
    <div
      className="no-print print:hidden fixed inset-0 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signature-editor-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
              <FileSignature className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="signature-editor-title" className="text-sm font-bold text-slate-900 dark:text-white truncate">
                Edit Footer Tanda Tangan Sebelum {pendingRequest.mode === 'pdf' ? 'Unduh PDF' : 'Cetak'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {pendingRequest.options.title} · A4{' '}
                {pendingRequest.options.orientation === 'landscape' ? 'Landscape' : 'Portrait'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPendingRequest(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
            title="Tutup (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {/* Toggle left signature & reset */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sigForm.showLeft}
                onChange={(e) => setSigForm((prev) => ({ ...prev, showLeft: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>Tampilkan Kolom Tanda Tangan Kiri ("Mengetahui")</span>
            </label>

            <button
              type="button"
              onClick={handleResetDots}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors"
              title="Kembalikan nama dan NIP menjadi garis titik-titik untuk tanda tangan basah"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Kosongkan Nama (Titik-titik)</span>
            </button>
          </div>

          {/* Form 2 Columns */}
          <div className={`grid grid-cols-1 ${sigForm.showLeft ? 'sm:grid-cols-2' : ''} gap-4`}>
            {/* Left Signatory */}
            {sigForm.showLeft && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-teal-800 dark:text-teal-400">
                  Penanda Tangan Kiri (Mengetahui)
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Keterangan Atas
                  </label>
                  <input
                    type="text"
                    value={sigForm.leftTitle}
                    onChange={(e) => setSigForm((prev) => ({ ...prev, leftTitle: e.target.value }))}
                    placeholder="Mengetahui,"
                    className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Jabatan
                  </label>
                  <input
                    type="text"
                    value={sigForm.leftRole}
                    onChange={(e) => setSigForm((prev) => ({ ...prev, leftRole: e.target.value }))}
                    placeholder="Kepala Lapas Kelas IIB Dompu"
                    className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Nama Lengkap & Gelar
                  </label>
                  <input
                    type="text"
                    value={sigForm.leftName}
                    onChange={(e) => setSigForm((prev) => ({ ...prev, leftName: e.target.value }))}
                    placeholder="Nama Pejabat..."
                    className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    NIP / Keterangan Bawah
                  </label>
                  <input
                    type="text"
                    value={sigForm.leftNip}
                    onChange={(e) => setSigForm((prev) => ({ ...prev, leftNip: e.target.value }))}
                    placeholder="NIP. 19..."
                    className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>
            )}

            {/* Right Signatory */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-teal-800 dark:text-teal-400">
                Penanda Tangan Kanan (Pembuat Laporan)
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                  Tempat & Tanggal
                </label>
                <input
                  type="text"
                  value={sigForm.rightDate}
                  onChange={(e) => setSigForm((prev) => ({ ...prev, rightDate: e.target.value }))}
                  placeholder={`Dompu, ${getDefaultIndoDate()}`}
                  className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                  Jabatan
                </label>
                <input
                  type="text"
                  value={sigForm.rightRole}
                  onChange={(e) => setSigForm((prev) => ({ ...prev, rightRole: e.target.value }))}
                  placeholder="Dokter / Petugas Medis Klinik"
                  className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                  Nama Lengkap & Gelar
                </label>
                <input
                  type="text"
                  value={sigForm.rightName}
                  onChange={(e) => setSigForm((prev) => ({ ...prev, rightName: e.target.value }))}
                  placeholder="Nama Petugas / Dokter..."
                  className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                  NIP / Instansi
                </label>
                <input
                  type="text"
                  value={sigForm.rightNip}
                  onChange={(e) => setSigForm((prev) => ({ ...prev, rightNip: e.target.value }))}
                  placeholder="NIP. ... / Klinik Pratama Lapas Kelas IIB Dompu"
                  className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>
            </div>
          </div>

          {/* Live Mini Preview of Signature Block */}
          <div className="p-4 rounded-xl bg-white border border-slate-300 text-black text-[11px]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Pratinjau Footer Tanda Tangan
            </div>
            <div
              className={`grid grid-cols-1 ${sigForm.showLeft ? 'sm:grid-cols-2' : 'justify-items-end'} gap-6 text-center`}
            >
              {sigForm.showLeft && (
                <div>
                  <div>{sigForm.leftTitle || 'Mengetahui,'}</div>
                  <div className="font-bold">{sigForm.leftRole}</div>
                  <div className="h-10" />
                  <div className="font-bold underline">
                    {sigForm.leftName || '( .................................................... )'}
                  </div>
                  <div className="text-[10px] text-gray-700">
                    {sigForm.leftNip || 'NIP. .................................................'}
                  </div>
                </div>
              )}
              <div className={!sigForm.showLeft ? 'w-60' : ''}>
                <div>{sigForm.rightDate || `Dompu, ${getDefaultIndoDate()}`}</div>
                <div className="font-bold">{sigForm.rightRole}</div>
                <div className="h-10" />
                <div className="font-bold underline">
                  {sigForm.rightName || '( .................................................... )'}
                </div>
                <div className="text-[10px] text-gray-700">
                  {sigForm.rightNip || 'Klinik Pratama Lapas Kelas IIB Dompu'}
                </div>
              </div>
            </div>
          </div>

          {/* Remember Default Checkbox */}
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberAsDefault}
              onChange={(e) => setRememberAsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Simpan nama & NIP ini agar terisi otomatis di laporan berikutnya</span>
          </label>
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-5 py-3.5 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingRequest(null)}
            className="px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Batal
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={handleConfirmPrint}
            className={`flex-1 sm:flex-initial justify-center px-4 py-2.5 sm:py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs ${
              pendingRequest.mode === 'print'
                ? 'bg-teal-700 hover:bg-teal-800 text-white'
                : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Sekarang</span>
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={() => void handleConfirmPdf()}
            className={`flex-1 sm:flex-initial justify-center px-4 py-2.5 sm:py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs ${
              pendingRequest.mode === 'pdf'
                ? 'bg-rose-700 hover:bg-rose-800 text-white'
                : 'bg-rose-600/90 hover:bg-rose-700 text-white'
            }`}
          >
            {pendingRequest.mode === 'pdf' ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            <span>{isExporting ? 'Membuat PDF...' : 'Unduh PDF Sekarang'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
