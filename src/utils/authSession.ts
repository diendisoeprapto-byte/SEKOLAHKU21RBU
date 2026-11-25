import { signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { ActiveUser } from '../types';
import { auth, db } from './firebase';

export const LOGIN_BG_CACHE_KEY = 'serbu21_login_bg_cache';
export const ADMIN_LOCKOUT_CACHE_KEY = 'serbu21_admin_lockout';
export const ADMIN_CREDENTIAL_CACHE_KEY = 'serbu21_admin_credentials_cache';

export interface LoginAppearanceDoc {
  imageDataUrl?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AdminCredentialsDoc {
  password?: string;
  active?: boolean;
  failedAttempts?: number;
  lockedUntil?: number | null;
  lastAdminRecoveryBy?: string;
  lastAdminRecoveryAt?: string;
  updatedAt?: string;
}

export interface AdminLockoutState {
  failedAttempts: number;
  lockedUntil: number | null;
}

/**
 * Mengaktifkan Firebase Anonymous Auth di latar belakang agar Firestore Rules
 * mengenali sesi pengguna aktif, lalu menyinkronkan profil peran ke `/users/{uid}`.
 */
export async function ensureFirebaseSessionUser(user: ActiveUser): Promise<string | null> {
  try {
    let fbUser = auth.currentUser;
    if (!fbUser) {
      const cred = await signInAnonymously(auth);
      fbUser = cred.user;
    }
    if (!fbUser?.uid) return null;

    const payload = {
      uid: fbUser.uid,
      role: user.role,
      username: String(user.username || '').trim().slice(0, 100),
      nama: String(user.name || '').trim().slice(0, 160),
      kelas: String(user.studentData?.kelas || user.kelasDiampu || '').trim().slice(0, 40),
      nisn: String(user.studentData?.nisn || '').trim().slice(0, 40),
      detail: String(user.detail || '').trim().slice(0, 160),
      updatedAt: new Date().toISOString(),
      serverTime: serverTimestamp(),
    };

    await setDoc(doc(db, 'users', fbUser.uid), payload, { merge: true });
    return fbUser.uid;
  } catch (err) {
    console.warn('Sinkronisasi Firebase Anonymous Auth info:', err);
    return null;
  }
}

export function getCachedLoginAppearanceUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(LOGIN_BG_CACHE_KEY) || '';
  } catch {
    return '';
  }
}

export function setCachedLoginAppearanceUrl(dataUrl: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (dataUrl) {
      window.localStorage.setItem(LOGIN_BG_CACHE_KEY, dataUrl);
    } else {
      window.localStorage.removeItem(LOGIN_BG_CACHE_KEY);
    }
  } catch {
    // ignore storage quota errors
  }
}

export function subscribeToLoginAppearance(
  onChange: (data: LoginAppearanceDoc | null) => void
): () => void {
  try {
    return onSnapshot(
      doc(db, 'settings', 'login_appearance'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as LoginAppearanceDoc;
          const img = typeof data?.imageDataUrl === 'string' ? data.imageDataUrl : '';
          setCachedLoginAppearanceUrl(img);
          onChange({ ...data, imageDataUrl: img });
        } else {
          setCachedLoginAppearanceUrl('');
          onChange(null);
        }
      },
      () => {
        const cached = getCachedLoginAppearanceUrl();
        onChange(cached ? { imageDataUrl: cached } : null);
      }
    );
  } catch {
    return () => {};
  }
}

export function getLocalAdminLockout(): AdminLockoutState {
  if (typeof window === 'undefined') return { failedAttempts: 0, lockedUntil: null };
  try {
    const raw = window.localStorage.getItem(ADMIN_LOCKOUT_CACHE_KEY);
    if (!raw) return { failedAttempts: 0, lockedUntil: null };
    const parsed = JSON.parse(raw);
    return {
      failedAttempts: Number(parsed?.failedAttempts) || 0,
      lockedUntil:
        typeof parsed?.lockedUntil === 'number' && Number.isFinite(parsed.lockedUntil)
          ? parsed.lockedUntil
          : null,
    };
  } catch {
    return { failedAttempts: 0, lockedUntil: null };
  }
}

export function saveLocalAdminLockout(state: AdminLockoutState): void {
  if (typeof window === 'undefined') return;
  try {
    if (state.failedAttempts <= 0 && !state.lockedUntil) {
      window.localStorage.removeItem(ADMIN_LOCKOUT_CACHE_KEY);
    } else {
      window.localStorage.setItem(ADMIN_LOCKOUT_CACHE_KEY, JSON.stringify(state));
    }
  } catch {
    // ignore
  }
}

export function clearLocalAdminLockout(): void {
  saveLocalAdminLockout({ failedAttempts: 0, lockedUntil: null });
}

export function subscribeToAdminCredentials(
  onChange: (data: AdminCredentialsDoc | null) => void
): () => void {
  try {
    return onSnapshot(
      doc(db, 'settings', 'admin_credentials'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as AdminCredentialsDoc;
          try {
            window.localStorage.setItem(ADMIN_CREDENTIAL_CACHE_KEY, JSON.stringify(data));
          } catch {
            // ignore
          }
          onChange(data);
        } else {
          onChange(null);
        }
      },
      () => {
        try {
          const raw = window.localStorage.getItem(ADMIN_CREDENTIAL_CACHE_KEY);
          onChange(raw ? (JSON.parse(raw) as AdminCredentialsDoc) : null);
        } catch {
          onChange(null);
        }
      }
    );
  } catch {
    return () => {};
  }
}
