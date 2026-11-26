/**
 * ============================================================================
 * SERBU 21 - Sistem Kunci Ujian (Exam Lock / Mode Proktor)
 * ============================================================================
 * Mengelola mode layar penuh otomatis, pencegahan klik kanan & copy-paste,
 * deteksi pelanggaran (Alt+Tab, pindah tab, keluar fullscreen), serta verifikasi
 * PIN pengawas default ("2121") atau PIN kustom sekolah via kombinasi Ctrl + C + B.
 */

export const DEFAULT_PROCTOR_PIN = "2121";

export interface ExamLockState {
  isLocked: boolean;
  violationCount: number;
  violationReason: string;
}

export function requestExamFullscreen(): void {
  if (typeof document === 'undefined') return;
  const docEl = document.documentElement as any;
  try {
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen().catch(() => {});
    } else if (docEl.webkitRequestFullscreen) {
      docEl.webkitRequestFullscreen();
    } else if (docEl.msRequestFullscreen) {
      docEl.msRequestFullscreen();
    }
  } catch {
    // Ignore fullscreen restriction errors
  }
}

export function exitExamFullscreen(): void {
  if (typeof document === 'undefined') return;
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  } catch {
    // Ignore
  }
}

export function verifyProctorPin(inputPin: string, schoolPin?: string): boolean {
  const cleanInput = String(inputPin || '').trim();
  const validPin = String(schoolPin || DEFAULT_PROCTOR_PIN).trim();
  return cleanInput === validPin || cleanInput === DEFAULT_PROCTOR_PIN;
}
