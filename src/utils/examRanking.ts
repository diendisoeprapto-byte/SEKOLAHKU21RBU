import { CBTQuestion } from '../types';

export type ExamDifficultyLevel = 'Mudah' | 'Sedang' | 'Sulit' | 'Sukar';

/**
 * Mengidentifikasi apakah sebuah butir soal termasuk kategori Sulit (HOTS).
 * Mendukung field eksplisit `tingkatKesulitan` maupun format teks `pembahasan` legacy
 * (mis. "Level: Sukar (...)" atau "Level Sulit").
 */
export function isQuestionHots(question?: Partial<CBTQuestion> | null): boolean {
  if (!question) return false;
  const level = String(question.tingkatKesulitan || '').trim().toLowerCase();
  if (level === 'sulit' || level === 'sukar' || level.includes('hots')) {
    return true;
  }
  const pembahasan = String(question.pembahasan || '');
  if (/level\s*:?\s*(sulit|sukar|hots)/i.test(pembahasan)) {
    return true;
  }
  if (/tingkat\s*(?:kesulitan|kesukaran)\s*:?\s*(sulit|sukar|hots)/i.test(pembahasan)) {
    return true;
  }
  return false;
}

/**
 * Menormalkan label tingkat kesulitan ke bentuk UI standar ('Mudah' | 'Sedang' | 'Sulit').
 */
export function normalizeDifficultyForForm(
  question?: Partial<CBTQuestion> | null
): 'Mudah' | 'Sedang' | 'Sulit' {
  if (!question) return 'Sedang';
  if (isQuestionHots(question)) return 'Sulit';
  const raw = `${question.tingkatKesulitan || ''} ${question.pembahasan || ''}`.toLowerCase();
  if (/\bmudah\b/.test(raw)) return 'Mudah';
  return 'Sedang';
}

export function computeExamHotsStats<T extends CBTQuestion>(
  questions: T[],
  answers: Record<string, any> | undefined,
  isAnswerCorrectFn: (question: T, studentAnswer: any) => boolean
): { benarHots: number; totalHots: number } {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { benarHots: 0, totalHots: 0 };
  }
  let totalHots = 0;
  let benarHots = 0;
  const safeAnswers = answers || {};

  questions.forEach((q) => {
    if (!isQuestionHots(q)) return;
    totalHots += 1;
    if (isAnswerCorrectFn(q, safeAnswers[q.id])) {
      benarHots += 1;
    }
  });

  return { benarHots, totalHots };
}

/**
 * Mengonversi label durasi lama (misal "45 Menit" atau "38m 24d") menjadi detik.
 */
export function parseDurasiToSeconds(
  durasiDetik?: number | null,
  fallbackDurationLabel?: string | null
): number | undefined {
  if (typeof durasiDetik === 'number' && Number.isFinite(durasiDetik) && durasiDetik > 0) {
    return Math.round(durasiDetik);
  }
  const label = String(fallbackDurationLabel || '').trim();
  if (!label) return undefined;

  const minSecMatch = label.match(/(\d+)\s*m(?:enit)?\s*(?:(\d+)\s*d(?:etik)?)?/i);
  if (minSecMatch) {
    const m = Number(minSecMatch[1] || 0);
    const s = Number(minSecMatch[2] || 0);
    const total = m * 60 + s;
    return total > 0 ? total : undefined;
  }
  const numOnly = label.match(/(\d+)/);
  if (numOnly) {
    const mins = Number(numOnly[1]);
    return mins > 0 ? mins * 60 : undefined;
  }
  return undefined;
}

/**
 * Memformat durasi detik menjadi "XXm YYd" (contoh: "38m 24d" atau "00m 45d").
 */
export function formatDurasiDetik(
  durasiDetik?: number | null,
  fallbackDurationLabel?: string | null
): string {
  const sec = parseDurasiToSeconds(durasiDetik, fallbackDurationLabel);
  if (sec === undefined || !Number.isFinite(sec) || sec <= 0) {
    return fallbackDurationLabel ? String(fallbackDurationLabel) : '-';
  }
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${mins}m ${String(remSec).padStart(2, '0')}d`;
}

export interface TieBreakerAccessors<T> {
  getScore: (row: T) => number;
  getBenarHots: (row: T) => number;
  getDurasiDetik: (row: T) => number | undefined | null;
  getName: (row: T) => string;
}

/**
 * Pemeringkatan berjenjang (Tie-Breaker):
 * 1. Nilai Akhir / Skor Total tertinggi (DESC)
 * 2. Jumlah Benar Soal Sulit / HOTS terbanyak (DESC)
 * 3. Durasi Waktu Pengerjaan tercepat dalam detik (ASC)
 * 4. Nama Siswa secara alfabetis (ASC)
 */
export function sortExamRankingsWithTieBreaker<T>(
  rows: T[],
  accessors: TieBreakerAccessors<T>
): T[] {
  return [...rows].sort((a, b) => {
    const scoreA = Number(accessors.getScore(a)) || 0;
    const scoreB = Number(accessors.getScore(b)) || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;

    const hotsA = Number(accessors.getBenarHots(a)) || 0;
    const hotsB = Number(accessors.getBenarHots(b)) || 0;
    if (hotsB !== hotsA) return hotsB - hotsA;

    const rawDurA = accessors.getDurasiDetik(a);
    const rawDurB = accessors.getDurasiDetik(b);
    const durA = typeof rawDurA === 'number' && Number.isFinite(rawDurA) && rawDurA > 0 ? rawDurA : Number.POSITIVE_INFINITY;
    const durB = typeof rawDurB === 'number' && Number.isFinite(rawDurB) && rawDurB > 0 ? rawDurB : Number.POSITIVE_INFINITY;
    if (durA !== durB) return durA - durB;

    return String(accessors.getName(a) || '').localeCompare(String(accessors.getName(b) || ''), 'id');
  });
}

export type TieBreakerReason = 'Unggul HOTS' | 'Lebih Cepat' | null;

/**
 * Menghasilkan badge keterangan tie-breaker jika siswa memiliki Nilai Akhir sama persis
 * dengan peserta berdekatan dan posisinya diputuskan oleh jumlah benar HOTS atau durasi tercepat.
 */
export function computeTieBreakerBadges<T>(
  sortedRows: T[],
  accessors: TieBreakerAccessors<T>
): TieBreakerReason[] {
  return sortedRows.map((row, idx) => {
    const score = Number(accessors.getScore(row)) || 0;
    const hots = Number(accessors.getBenarHots(row)) || 0;
    const rawDur = accessors.getDurasiDetik(row);
    const dur = typeof rawDur === 'number' && Number.isFinite(rawDur) && rawDur > 0 ? rawDur : Number.POSITIVE_INFINITY;

    const neighbors: T[] = [];
    if (idx > 0) neighbors.push(sortedRows[idx - 1]);
    if (idx < sortedRows.length - 1) neighbors.push(sortedRows[idx + 1]);

    const sameScoreNeighbors = neighbors.filter(
      (n) => (Number(accessors.getScore(n)) || 0) === score
    );
    if (sameScoreNeighbors.length === 0) return null;

    // Jika mengungguli peserta di bawah (atau kalah dari atas) karena HOTS
    const nextRow = idx < sortedRows.length - 1 ? sortedRows[idx + 1] : null;
    if (nextRow && (Number(accessors.getScore(nextRow)) || 0) === score) {
      const nextHots = Number(accessors.getBenarHots(nextRow)) || 0;
      if (hots > nextHots) return 'Unggul HOTS';
      const nextRawDur = accessors.getDurasiDetik(nextRow);
      const nextDur =
        typeof nextRawDur === 'number' && Number.isFinite(nextRawDur) && nextRawDur > 0
          ? nextRawDur
          : Number.POSITIVE_INFINITY;
      if (hots === nextHots && dur < nextDur) return 'Lebih Cepat';
    }

    const prevRow = idx > 0 ? sortedRows[idx - 1] : null;
    if (prevRow && (Number(accessors.getScore(prevRow)) || 0) === score) {
      const prevHots = Number(accessors.getBenarHots(prevRow)) || 0;
      if (hots > prevHots) return 'Unggul HOTS';
    }

    return null;
  });
}
