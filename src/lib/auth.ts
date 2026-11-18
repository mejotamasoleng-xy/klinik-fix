/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const SESSION_STORAGE_KEY = 'klinik_dompu_auth_session';
const FAILED_ATTEMPTS_KEY = 'klinik_dompu_auth_lockout';
export const AUTH_CHANGED_EVENT = 'klinik:auth-changed';

export interface AuthState {
  isAuthenticated: boolean;
  username: string;
  token: string;
  expiresAt: number;
  loginTime: number;
  rememberMe: boolean;
}

export interface LockoutState {
  count: number;
  lockedUntil: number; // timestamp in ms
}

function dispatchAuthChanged(isAuthenticated: boolean, reason?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(AUTH_CHANGED_EVENT, {
      detail: { isAuthenticated, reason },
    })
  );
}

export function getLockoutState(): LockoutState {
  try {
    const raw = localStorage.getItem(FAILED_ATTEMPTS_KEY);
    if (!raw) return { count: 0, lockedUntil: 0 };
    return JSON.parse(raw);
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

export function recordFailedAttempt(): { count: number; lockedUntil: number; isLocked: boolean } {
  const current = getLockoutState();
  const newCount = current.count + 1;
  let lockedUntil = current.lockedUntil;

  if (newCount >= 5) {
    lockedUntil = Date.now() + 60 * 1000;
  }

  const newState: LockoutState = { count: newCount, lockedUntil };
  try {
    localStorage.setItem(FAILED_ATTEMPTS_KEY, JSON.stringify(newState));
  } catch {
    // ignore storage restriction
  }
  return {
    count: newCount,
    lockedUntil,
    isLocked: lockedUntil > Date.now(),
  };
}

export function resetFailedAttempts() {
  try {
    localStorage.removeItem(FAILED_ATTEMPTS_KEY);
  } catch {
    // ignore
  }
}

export async function loginWithCredentials(
  usernameInput: string,
  passwordInput: string,
  rememberMe: boolean
): Promise<{ success: boolean; message?: string }> {
  const lockout = getLockoutState();
  const now = Date.now();
  if (lockout.lockedUntil && lockout.lockedUntil > now) {
    const remainingSec = Math.ceil((lockout.lockedUntil - now) / 1000);
    return {
      success: false,
      message: `Terlalu banyak percobaan gagal. Silakan tunggu ${remainingSec} detik sebelum mencoba kembali.`,
    };
  }

  const cleanUser = usernameInput.trim();
  const cleanPass = passwordInput.trim();

  if (!cleanUser || !cleanPass) {
    return { success: false, message: 'Username dan password wajib diisi.' };
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        username: cleanUser,
        password: cleanPass,
        rememberMe,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.token) {
      recordFailedAttempt();
      return {
        success: false,
        message: data?.error || 'Kombinasi username atau password tidak sesuai.',
      };
    }

    resetFailedAttempts();
    const session: AuthState = {
      isAuthenticated: true,
      username: data.username || cleanUser,
      token: String(data.token),
      expiresAt: Number(data.expiresAt) || now + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000),
      loginTime: now,
      rememberMe,
    };

    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      const storageToUse = rememberMe ? localStorage : sessionStorage;
      storageToUse.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Fallback to sessionStorage if localStorage full
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }

    dispatchAuthChanged(true, 'login');
    return { success: true };
  } catch {
    return {
      success: false,
      message: 'Tidak dapat menghubungi server klinik. Periksa koneksi jaringan Anda.',
    };
  }
}

export function getCurrentSession(): AuthState | null {
  try {
    let raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    }
    if (!raw) return null;

    const parsed: Partial<AuthState> = JSON.parse(raw);
    if (!parsed || !parsed.token || typeof parsed.token !== 'string') {
      logoutSession('Sesi lama perlu diperbarui');
      return null;
    }

    const now = Date.now();
    const expiresAt =
      typeof parsed.expiresAt === 'number'
        ? parsed.expiresAt
        : (parsed.loginTime || 0) + (parsed.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000);

    if (now > expiresAt) {
      logoutSession('Sesi telah berakhir');
      return null;
    }

    return {
      isAuthenticated: true,
      username: parsed.username || 'klinik',
      token: parsed.token,
      expiresAt,
      loginTime: parsed.loginTime || now,
      rememberMe: Boolean(parsed.rememberMe),
    };
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  return getCurrentSession()?.token || null;
}

export function logoutSession(reason?: string) {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
  dispatchAuthChanged(false, reason);
}

