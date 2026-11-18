import React, { useEffect, useRef, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import { GeneratedDocFile } from '../lib/laporan/types';
import { postProcessDocxPreview } from '../lib/laporan/docxPreviewFix';

interface LaporanPreviewModalProps {
  docs: GeneratedDocFile[];
  onClose: () => void;
  onDownloadDoc: (doc: GeneratedDocFile) => void;
  onPrintDoc: (doc: GeneratedDocFile) => void;
}

export default function LaporanPreviewModal({
  docs,
  onClose,
  onDownloadDoc,
  onPrintDoc,
}: LaporanPreviewModalProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeDoc = docs[selectedIdx] || docs[0];

  useEffect(() => {
    let cancelled = false;
    const renderDoc = async () => {
      if (!activeDoc || !containerRef.current) return;
      setRenderError(null);
      containerRef.current.innerHTML = '';
      try {
        const [{ renderAsync }, buf] = await Promise.all([
          import('docx-preview'),
          activeDoc.blob.arrayBuffer(),
        ]);
        if (cancelled || !containerRef.current) return;
        await renderAsync(buf, containerRef.current, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true,
        });
        if (cancelled || !containerRef.current) return;
        await postProcessDocxPreview(containerRef.current, activeDoc.blob);
      } catch (err) {
        if (!cancelled) {
          setRenderError(
            err instanceof Error ? err.message : 'Gagal menampilkan pratinjau dokumen.'
          );
        }
      }
    };
    void renderDoc();
    return () => {
      cancelled = true;
    };
  }, [activeDoc]);

  if (!activeDoc) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950/60">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              Pratinjau Dokumen: {activeDoc.fileName}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Tampilan pratinjau di browser. Buka file .docx di Microsoft Word untuk tata letak final.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {docs.length > 1 && (
              <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
                {docs.map((d, idx) => (
                  <button
                    key={d.fileName}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      idx === selectedIdx
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => onPrintDoc(activeDoc)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <Printer className="w-3.5 h-3.5" />
              Simpan PDF
            </button>

            <button
              type="button"
              onClick={() => onDownloadDoc(activeDoc)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh Word
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Pratinjau"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-200/80 dark:bg-slate-950 p-3 sm:p-6">
          {renderError ? (
            <div className="max-w-lg mx-auto rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
              {renderError}
            </div>
          ) : (
            <div ref={containerRef} className="docx-preview-host mx-auto" />
          )}
        </div>
      </div>
    </div>
  );
}
