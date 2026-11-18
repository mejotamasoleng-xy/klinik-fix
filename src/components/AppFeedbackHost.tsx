/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  ConfirmRequest,
  subscribeConfirms,
  subscribeToasts,
  ToastPayload,
  ToastTone,
} from '../lib/feedback';

export default function AppFeedbackHost() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const [confirmQueue, setConfirmQueue] = useState<ConfirmRequest[]>([]);

  useEffect(() => {
    const unsubToast = subscribeToasts((toast) => {
      setToasts((prev) => [...prev.slice(-3), toast]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }, toast.durationMs);
    });

    const unsubConfirm = subscribeConfirms((req) => {
      setConfirmQueue((prev) => [...prev, req]);
    });

    return () => {
      unsubToast();
      unsubConfirm();
    };
  }, []);

  const activeConfirm = confirmQueue[0] || null;

  useEffect(() => {
    if (!activeConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        activeConfirm.resolve(false);
        setConfirmQueue((prev) => prev.slice(1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeConfirm]);

  const handleResolveConfirm = (accepted: boolean) => {
    if (!activeConfirm) return;
    activeConfirm.resolve(accepted);
    setConfirmQueue((prev) => prev.slice(1));
  };

  const renderToastIcon = (tone: ToastTone) => {
    switch (tone) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />;
    }
  };

  return (
    <>
      {/* In-App Toast Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none print:hidden"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3.5 py-2.5 shadow-lg text-xs text-slate-800 dark:text-slate-100"
            >
              {renderToastIcon(toast.tone)}
              <div className="flex-1 min-w-0 leading-relaxed">
                {toast.title && (
                  <p className="font-semibold text-slate-900 dark:text-white mb-0.5">{toast.title}</p>
                )}
                <p className="whitespace-pre-line">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Tutup notifikasi"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* In-App Confirm Dialog */}
      {activeConfirm && (
        <div
          className="fixed inset-0 z-[95] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start gap-3">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  activeConfirm.tone === 'danger'
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                    : activeConfirm.tone === 'warning'
                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                    : 'bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  id="app-confirm-title"
                  className="text-sm font-bold text-slate-900 dark:text-white leading-snug"
                >
                  {activeConfirm.title}
                </h3>
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {activeConfirm.message}
              </p>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleResolveConfirm(false)}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {activeConfirm.cancelLabel || 'Batal'}
              </button>
              <button
                type="button"
                onClick={() => handleResolveConfirm(true)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold text-white transition-colors ${
                  activeConfirm.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : activeConfirm.tone === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                {activeConfirm.confirmLabel || 'Ya, Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
