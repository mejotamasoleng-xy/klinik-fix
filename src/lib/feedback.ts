/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface ToastPayload {
  id: string;
  message: string;
  title?: string;
  tone: ToastTone;
  durationMs: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
}

export interface ConfirmRequest extends ConfirmOptions {
  id: string;
  resolve: (accepted: boolean) => void;
}

const TOAST_EVENT = 'klinik:toast';
const CONFIRM_EVENT = 'klinik:confirm';

export function showToast(
  message: string,
  tone: ToastTone = 'info',
  options?: { title?: string; durationMs?: number }
): void {
  if (typeof window === 'undefined') return;
  const payload: ToastPayload = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    message,
    title: options?.title,
    tone,
    durationMs: options?.durationMs ?? (tone === 'error' ? 5000 : 3500),
  };
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const request: ConfirmRequest = {
      id: `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...options,
      resolve,
    };
    window.dispatchEvent(new CustomEvent<ConfirmRequest>(CONFIRM_EVENT, { detail: request }));
  });
}

export function subscribeToasts(listener: (toast: ToastPayload) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<ToastPayload>;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(TOAST_EVENT, handler);
  return () => window.removeEventListener(TOAST_EVENT, handler);
}

export function subscribeConfirms(listener: (req: ConfirmRequest) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<ConfirmRequest>;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(CONFIRM_EVENT, handler);
  return () => window.removeEventListener(CONFIRM_EVENT, handler);
}

export async function copyToClipboard(text: string, successMessage = 'Disalin ke clipboard'): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!ok) throw new Error('Copy command failed');
    }
    if (successMessage) {
      showToast(successMessage, 'success');
    }
    return true;
  } catch {
    showToast('Gagal menyalin ke clipboard browser.', 'error');
    return false;
  }
}
