import {
  collection,
  doc,
  writeBatch,
  onSnapshot,
  getDocs,
  getDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { CBTExamResult, ExamResultsResetMeta, Student, TKAQuestion } from '../types';
import { DEFAULT_STUDENTS } from '../data/defaultData';
import {
  runWithoutStorageSync,
  saveStoredTKAQuestions,
  getStoredTKASubmissions,
  saveStoredTKASubmissions,
  getStoredCBTResults,
  getStoredTKAResults,
  getStoredExamResultsResetMeta,
  saveStoredExamResultsResetMeta,
  getStoredStudents,
  filterExamResultsByResetMeta,
  isKelas6Class,
  isTkaResultEntry,
  normalizeTkaMapelKey,
  safeSetLocalStorage,
  sanitizeSubmissionFotoUrl,
  TKASubmissionItem,
  TKAMapelScoreKey,
  extractBaseTkaPaket,
} from './storage';
import { compressDataUrlImage } from './imageUtils';

export const TKA_QUESTIONS_COLLECTION = 'tka_questions';
export const TKA_SUBMISSIONS_COLLECTION = 'tka_submissions';

const normalizeStudentName = (name?: string): string =>
  String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const normalizeNisn = (nisn?: string): string => String(nisn || '').trim();

const isPlaceholderStudentName = (name?: string): boolean => {
  const n = normalizeStudentName(name);
  return !n || n === 'siswa' || n === 'peserta didik' || n === '-' || n === 'anonim';
};

export function hasRealNonDefaultStudents(students: Student[]): boolean {
  if (!Array.isArray(students) || students.length === 0) return false;
  const defaultIds = new Set(DEFAULT_STUDENTS.map((d) => d.id));
  const defaultNames = new Set(DEFAULT_STUDENTS.map((d) => normalizeStudentName(d.nama)));
  return students.some(
    (s) => !defaultIds.has(s.id) && !defaultNames.has(normalizeStudentName(s.nama))
  );
}

export function isSyntheticDefaultStudentRecord(
  ref: { studentId?: string; nisn?: string; studentName?: string; nama?: string },
  liveStudents: Student[]
): boolean {
  if (!hasRealNonDefaultStudents(liveStudents)) return false;
  const refId = String(ref.studentId || '').trim();
  const refName = normalizeStudentName(ref.studentName ?? ref.nama);
  const refNisn = normalizeNisn(ref.nisn);

  // Pastikan record benar-benar cocok dengan entri dummy DEFAULT_STUDENTS dan tidak ada di liveStudents
  const matchesLiveByNisn =
    Boolean(refNisn && refNisn !== '-') &&
    liveStudents.some((s) => normalizeNisn(s.nisn) === refNisn);
  const matchesLiveByName =
    !isPlaceholderStudentName(refName) &&
    liveStudents.some((s) => normalizeStudentName(s.nama) === refName);
  if (matchesLiveByNisn || matchesLiveByName) return false;

  return DEFAULT_STUDENTS.some((d) => {
    const dName = normalizeStudentName(d.nama);
    const dNisn = normalizeNisn(d.nisn);
    const idMatch = Boolean(refId && d.id === refId);
    const nameMatch = Boolean(refName && dName === refName);
    const nisnMatch = Boolean(refNisn && dNisn === refNisn);
    return (idMatch && nameMatch) || (nisnMatch && nameMatch) || (idMatch && !refName);
  });
}

/**
 * Mencocokkan record hasil ujian/submission dengan data peserta didik live (`Data Siswa`)
 * dengan memprioritaskan kecocokan NISN & nama dibandingkan kecocokan ID mentah,
 * sehingga tidak tertukar apabila ID pernah bergeser atau bentrok saat impor ulang.
 */
export function findLiveStudentForRecord(
  students: Student[],
  ref: { studentId?: string; nisn?: string; studentName?: string; nama?: string; username?: string }
): Student | undefined {
  if (!Array.isArray(students) || students.length === 0) return undefined;

  const refId = String(ref.studentId || '').trim();
  const refNisn = normalizeNisn(ref.nisn);
  const rawName = ref.studentName ?? ref.nama;
  const refName = normalizeStudentName(rawName);
  const refUser = String(ref.username || '').trim().toLowerCase();
  const hasValidNisn = refNisn.length > 0 && refNisn !== '-';
  const hasValidName = !isPlaceholderStudentName(rawName);

  const pickBest = (candidates: Student[]): Student | undefined => {
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];
    return [...candidates].sort((a, b) => {
      const score = (s: Student) =>
        (refId && s.id === refId ? 4 : 0) +
        (isKelas6Class(s.kelas) ? 2 : 0) +
        (hasValidNisn && normalizeNisn(s.nisn) === refNisn ? 1 : 0);
      return score(b) - score(a);
    })[0];
  };

  // 1. NISN + Nama cocok persis
  if (hasValidNisn && hasValidName) {
    const m1 = students.filter(
      (s) => normalizeNisn(s.nisn) === refNisn && normalizeStudentName(s.nama) === refName
    );
    if (m1.length > 0) return pickBest(m1);
  }

  // 2. Student ID + Nama cocok persis
  if (refId && hasValidName) {
    const m2 = students.filter(
      (s) => s.id === refId && normalizeStudentName(s.nama) === refName
    );
    if (m2.length > 0) return pickBest(m2);
  }

  // 3. NISN cocok persis
  if (hasValidNisn) {
    const m3 = students.filter((s) => normalizeNisn(s.nisn) === refNisn);
    if (m3.length > 0) return pickBest(m3);
  }

  // 4. Username cocok persis
  if (refUser) {
    const m4 = students.filter((s) => String(s.username || '').trim().toLowerCase() === refUser);
    if (m4.length > 0) return pickBest(m4);
  }

  // 5. Nama ternormalisasi cocok persis
  if (hasValidName) {
    const m5 = students.filter((s) => normalizeStudentName(s.nama) === refName);
    if (m5.length > 0) return pickBest(m5);
  }

  // 6. Fallback ID saja (misal guru mengedit ejaan nama siswa sementara NISN kosong)
  if (refId) {
    return students.find((s) => s.id === refId);
  }

  return undefined;
}

export function alignTkaSubmissionsWithStudents(
  submissions: TKASubmissionItem[],
  students: Student[]
): {
  alignedSubmissions: TKASubmissionItem[];
  updatedItems: TKASubmissionItem[];
  staleDocIds: string[];
  hasChanges: boolean;
} {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return { alignedSubmissions: [], updatedItems: [], staleDocIds: [], hasChanges: false };
  }
  if (!Array.isArray(students) || students.length === 0) {
    return {
      alignedSubmissions: submissions,
      updatedItems: [],
      staleDocIds: [],
      hasChanges: false,
    };
  }

  const dedupMap = new Map<string, TKASubmissionItem>();
  const staleDocIdSet = new Set<string>();
  const changedKeySet = new Set<string>();
  let hasChanges = false;

  submissions.forEach((sub) => {
    if (!sub || typeof sub !== 'object') return;

    if (isSyntheticDefaultStudentRecord(sub, students)) {
      hasChanges = true;
      if (sub.id) staleDocIdSet.add(sub.id);
      return;
    }

    const basePaket = sub.paketDasar || extractBaseTkaPaket(sub.paket);
    const liveStudent = findLiveStudentForRecord(students, sub);
    const canonicalStudentId = liveStudent?.id || sub.studentId;
    const canonicalId = makeSubmissionDocId(canonicalStudentId, basePaket, sub.id);

    const alignedStudentName = liveStudent?.nama || sub.studentName;
    const alignedNisn = liveStudent?.nisn ?? sub.nisn ?? '';
    const alignedKelas = liveStudent?.kelas || sub.kelas;
    const alignedFotoUrl = sanitizeSubmissionFotoUrl(liveStudent?.fotoUrl || sub.fotoUrl);

    const metadataChanged = Boolean(
      liveStudent &&
        (sub.id !== canonicalId ||
          sub.studentId !== liveStudent.id ||
          sub.studentName !== alignedStudentName ||
          (sub.nisn || '') !== (alignedNisn || '') ||
          sub.kelas !== alignedKelas)
    );

    if (sub.id && sub.id !== canonicalId) {
      staleDocIdSet.add(sub.id);
      hasChanges = true;
    }

    const normalizedSub: TKASubmissionItem = {
      ...sub,
      id: canonicalId,
      studentId: canonicalStudentId,
      studentName: alignedStudentName,
      nisn: alignedNisn,
      kelas: alignedKelas,
      fotoUrl: alignedFotoUrl,
      paket: basePaket,
      paketDasar: basePaket,
    };

    const existing = dedupMap.get(canonicalId);
    if (existing) {
      hasChanges = true;
      const merged = mergeTwoTkaSubmissions(existing, normalizedSub);
      const finalMerged: TKASubmissionItem = {
        ...merged,
        id: canonicalId,
        studentId: canonicalStudentId,
        studentName: alignedStudentName,
        nisn: alignedNisn,
        kelas: alignedKelas,
        fotoUrl: alignedFotoUrl,
      };
      dedupMap.set(canonicalId, finalMerged);
      changedKeySet.add(canonicalId);
    } else {
      dedupMap.set(canonicalId, normalizedSub);
      if (metadataChanged) {
        hasChanges = true;
        changedKeySet.add(canonicalId);
      }
    }
  });

  const alignedSubmissions = Array.from(dedupMap.values()).sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );
  const updatedItems = alignedSubmissions.filter((item) => changedKeySet.has(item.id));
  const activeIds = new Set(alignedSubmissions.map((s) => s.id));
  const staleDocIds = Array.from(staleDocIdSet).filter((id) => !activeIds.has(id));

  return {
    alignedSubmissions,
    updatedItems,
    staleDocIds,
    hasChanges,
  };
}

export async function deleteTkaSubmissionDocsInFirestore(docIds: string[]): Promise<void> {
  if (!docIds || docIds.length === 0) return;
  try {
    const CHUNK_SIZE = 350;
    for (let i = 0; i < docIds.length; i += CHUNK_SIZE) {
      const chunk = docIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((id) => batch.delete(doc(db, TKA_SUBMISSIONS_COLLECTION, id)));
      await batch.commit();
    }
  } catch (err) {
    console.warn('Hapus dokumen TKA duplikat/lama warning:', err);
  }
}

export async function syncTkaSubmissionsWithLiveStudents(
  studentsOverride?: Student[]
): Promise<TKASubmissionItem[]> {
  const studentsList =
    studentsOverride && studentsOverride.length > 0 ? studentsOverride : getStoredStudents();
  const currentSubs = getStoredTKASubmissions();
  if (studentsList.length === 0 || currentSubs.length === 0) return currentSubs;

  // Jangan menimpa data TKA sekolah asli apabila studentsList masih berupa DEFAULT_STUDENTS sebelum cloud terhidrasi
  if (!hasRealNonDefaultStudents(studentsList)) {
    const subsLookReal = currentSubs.some((s) => {
      const defaultIds = new Set(DEFAULT_STUDENTS.map((d) => d.id));
      const defaultNames = new Set(DEFAULT_STUDENTS.map((d) => normalizeStudentName(d.nama)));
      return !defaultIds.has(s.studentId) && !defaultNames.has(normalizeStudentName(s.studentName));
    });
    if (subsLookReal) return currentSubs;
  }

  const { alignedSubmissions, updatedItems, staleDocIds, hasChanges } =
    alignTkaSubmissionsWithStudents(currentSubs, studentsList);
  if (!hasChanges) return alignedSubmissions;

  runWithoutStorageSync(() => {
    saveStoredTKASubmissions(alignedSubmissions);
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-exam-results-updated'));
  }

  if (staleDocIds.length > 0) {
    await deleteTkaSubmissionDocsInFirestore(staleDocIds);
  }
  if (updatedItems.length > 0) {
    await saveTkaSubmissionsBatchToFirestore(updatedItems);
  }

  return alignedSubmissions;
}

function sanitizeQuestionId(rawId?: string, fallbackIdx: number = 0): string {
  const base = (rawId || `tka_q_${Date.now()}_${fallbackIdx}`).trim();
  return base.replace(/\//g, '_') || `tka_q_${Date.now()}_${fallbackIdx}`;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([k, v]) => {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    });
    return out as T;
  }
  return value;
}

export function sortTkaQuestionsOrder(list: Array<TKAQuestion & { orderIndex?: number; updatedAt?: string }>): TKAQuestion[] {
  return [...list]
    .sort((a, b) => {
      const hasOrdA = typeof a.orderIndex === 'number';
      const hasOrdB = typeof b.orderIndex === 'number';
      if (hasOrdA && hasOrdB && a.orderIndex !== b.orderIndex) {
        return (a.orderIndex as number) - (b.orderIndex as number);
      }
      if (hasOrdA !== hasOrdB) return hasOrdA ? -1 : 1;
      return String(a.id || '').localeCompare(String(b.id || ''));
    })
    .map(({ orderIndex: _oi, updatedAt: _ua, serverTime: _st, ...q }: any) => q as TKAQuestion);
}

async function ensureTkaQuestionWithinFirestoreLimit(question: TKAQuestion): Promise<TKAQuestion> {
  const SAFE_DOC_BYTES = 820_000;
  const estimateBytes = (obj: unknown) => {
    const str = JSON.stringify(obj);
    return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(str).length : str.length * 2;
  };

  if (estimateBytes(question) <= SAFE_DOC_BYTES) {
    return question;
  }

  let candidate: TKAQuestion = { ...question };
  const passes = [
    { maxWidth: 720, maxHeight: 540, quality: 0.65 },
    { maxWidth: 480, maxHeight: 360, quality: 0.5 },
  ];

  for (const opts of passes) {
    if (candidate.gambarUrl) {
      candidate.gambarUrl = await compressDataUrlImage(candidate.gambarUrl, opts);
    }
    if (candidate.gambarUrl2) {
      candidate.gambarUrl2 = await compressDataUrlImage(candidate.gambarUrl2, opts);
    }
    if (candidate.opsiGambar && typeof candidate.opsiGambar === 'object') {
      const nextOpsiGambar: Record<string, string> = {};
      for (const [k, v] of Object.entries(candidate.opsiGambar)) {
        nextOpsiGambar[k] = v ? await compressDataUrlImage(v, opts) : v;
      }
      candidate.opsiGambar = nextOpsiGambar;
    }
    if (estimateBytes(candidate) <= SAFE_DOC_BYTES) {
      return candidate;
    }
  }

  return candidate;
}

/**
 * Menyimpan satu butir soal TKA secara langsung dan real-time ke koleksi 'tka_questions' di Firestore.
 */
export async function saveSingleTkaQuestionToFirestore(
  question: TKAQuestion,
  orderIndex?: number
): Promise<boolean> {
  try {
    const questionId = sanitizeQuestionId(question.id);
    const sizeSafeQuestion = await ensureTkaQuestionWithinFirestoreLimit(question);
    const docRef = doc(db, TKA_QUESTIONS_COLLECTION, questionId);
    const cleanQuestion = stripUndefinedDeep({
      ...sizeSafeQuestion,
      id: questionId,
      ...(typeof orderIndex === 'number' ? { orderIndex } : {}),
      updatedAt: new Date().toISOString(),
      serverTime: serverTimestamp(),
    });
    await setDoc(docRef, cleanQuestion, { merge: true });
    safeSetLocalStorage('sekolahku_tka_questions_seeded', 'true');
    return true;
  } catch (error) {
    console.error(`Gagal menyimpan soal TKA ${question.id} ke Firestore:`, error);
    return false;
  }
}

/**
 * Menghapus satu butir soal TKA dari koleksi 'tka_questions' di Firestore secara real-time.
 */
export async function deleteTkaQuestionFromFirestore(questionId: string): Promise<boolean> {
  try {
    const safeId = sanitizeQuestionId(questionId);
    await deleteDoc(doc(db, TKA_QUESTIONS_COLLECTION, safeId));
    safeSetLocalStorage('sekolahku_tka_questions_seeded', 'true');
    return true;
  } catch (error) {
    console.error(`Gagal menghapus soal TKA ${questionId} dari Firestore:`, error);
    return false;
  }
}

/**
 * Menyimpan daftar soal TKA dalam batch ke koleksi 'tka_questions' di Firestore.
 */
export async function saveTkaQuestionsBatchToFirestore(
  questions: TKAQuestion[],
  startOrderIndex: number = 0
): Promise<boolean> {
  try {
    if (questions && questions.length > 0) {
      const sizeSafeQuestions = await Promise.all(
        questions.map((q) => ensureTkaQuestionWithinFirestoreLimit(q))
      );
      const CHUNK_SIZE = 20;
      for (let i = 0; i < sizeSafeQuestions.length; i += CHUNK_SIZE) {
        const chunk = sizeSafeQuestions.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((q, offset) => {
          const orderIndex = startOrderIndex + i + offset;
          const questionId = sanitizeQuestionId(q.id, orderIndex);
          const docRef = doc(db, TKA_QUESTIONS_COLLECTION, questionId);
          const cleanQuestion = stripUndefinedDeep({
            ...q,
            id: questionId,
            orderIndex,
            updatedAt: new Date().toISOString(),
            serverTime: serverTimestamp(),
          });
          batch.set(docRef, cleanQuestion, { merge: true });
        });
        await batch.commit();
      }
    }
    safeSetLocalStorage('sekolahku_tka_questions_seeded', 'true');
    return true;
  } catch (error) {
    console.error('Gagal menyimpan batch soal TKA ke Firestore:', error);
    return false;
  }
}

/**
 * Mengganti penuh isi koleksi 'tka_questions' di Firestore (dipakai saat Restore Backup).
 */
export async function replaceTkaQuestionsInFirestore(
  questions: TKAQuestion[]
): Promise<boolean> {
  try {
    const normalized = (questions || []).map((q, idx) => ({
      ...q,
      id: sanitizeQuestionId(q.id, idx),
    }));
    const targetIds = new Set(normalized.map((q) => q.id));

    const existingSnap = await getDocs(collection(db, TKA_QUESTIONS_COLLECTION));
    const staleIds: string[] = [];
    existingSnap.forEach((docSnap) => {
      if (!targetIds.has(docSnap.id)) {
        staleIds.push(docSnap.id);
      }
    });

    if (staleIds.length > 0) {
      const CHUNK_SIZE = 350;
      for (let i = 0; i < staleIds.length; i += CHUNK_SIZE) {
        const chunk = staleIds.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, TKA_QUESTIONS_COLLECTION, id)));
        await batch.commit();
      }
    }

    if (normalized.length > 0) {
      await saveTkaQuestionsBatchToFirestore(normalized);
    }

    safeSetLocalStorage('sekolahku_tka_questions_seeded', 'true');
    runWithoutStorageSync(() => {
      saveStoredTKAQuestions(normalized);
    });
    return true;
  } catch (error) {
    console.error('Gagal mengganti koleksi soal TKA di Firestore:', error);
    throw error;
  }
}

/**
 * Mengambil seluruh soal TKA dari koleksi 'tka_questions' di Firestore.
 */
export async function fetchTkaQuestionsFromFirestore(): Promise<TKAQuestion[]> {
  try {
    const snapshot = await getDocs(collection(db, TKA_QUESTIONS_COLLECTION));
    const rawList: Array<TKAQuestion & { orderIndex?: number; updatedAt?: string }> = [];
    snapshot.forEach((docSnap) => {
      rawList.push({ ...(docSnap.data() as TKAQuestion), id: docSnap.id });
    });
    return sortTkaQuestionsOrder(rawList);
  } catch (error) {
    console.error('Gagal mengambil soal TKA dari Firestore:', error);
    return [];
  }
}

/**
 * Memasang real-time onSnapshot listener untuk koleksi 'tka_questions' di Firestore.
 */
export function subscribeToTkaQuestionsCollection(
  onUpdate: (questions: TKAQuestion[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const colRef = collection(db, TKA_QUESTIONS_COLLECTION);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const rawList: Array<TKAQuestion & { orderIndex?: number; updatedAt?: string }> = [];
        snapshot.forEach((docSnap) => {
          rawList.push({ ...(docSnap.data() as TKAQuestion), id: docSnap.id });
        });
        onUpdate(sortTkaQuestionsOrder(rawList));
      },
      (error) => {
        console.warn('TKA questions onSnapshot listener info:', error?.message);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.warn('Gagal memasang listener tka_questions:', error);
    return () => {};
  }
}

// ============================================================================
// TKA SUBMISSIONS (ANALISIS & REKAP HASIL TKA REAL-TIME FIRESTORE)
// ============================================================================

export function makeSubmissionDocId(studentId: string, basePaket: string, fallbackId?: string): string {
  const cleanStudent = (studentId || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
  const cleanPaket = (basePaket || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
  if (cleanStudent && cleanPaket) {
    return `sub_${cleanStudent}_${cleanPaket}`;
  }
  return sanitizeQuestionId(fallbackId, 0);
}

function estimateJsonBytes(obj: unknown): number {
  const str = JSON.stringify(obj);
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(str).length : str.length * 2;
}

function sanitizeSubmissionForStorage(
  submission: TKASubmissionItem,
  fallbackId?: string
): Record<string, any> {
  const basePaket = submission.paketDasar || extractBaseTkaPaket(submission.paket);
  const docId = makeSubmissionDocId(submission.studentId, basePaket, fallbackId || submission.id);

  // Jangan gandakan base64 foto siswa berukuran besar ke setiap dokumen hasil TKA;
  // UI Report TKA akan mengambil foto asli siswa secara dinamis dari koleksi students.
  const safeFotoUrl = sanitizeSubmissionFotoUrl(submission.fotoUrl);

  // Pastikan setiap entri jawaban tidak menyimpan payload tak wajar (> 10 KB/butir)
  const rawAnswers = submission.answers && typeof submission.answers === 'object' ? submission.answers : {};
  const safeAnswers: Record<string, any> = {};
  Object.entries(rawAnswers).forEach(([qId, val]) => {
    if (val === undefined) return;
    if (typeof val === 'string' && val.length > 10_000) {
      safeAnswers[qId] = val.slice(0, 10_000);
    } else {
      safeAnswers[qId] = val;
    }
  });

  const candidate = stripUndefinedDeep({
    ...submission,
    id: docId,
    fotoUrl: safeFotoUrl,
    paket: basePaket,
    paketDasar: basePaket,
    answers: safeAnswers,
    updatedAt: submission.updatedAt || new Date().toISOString(),
  });

  // Pengaman batas 1 MiB dokumen Firestore (target <= 800 KB)
  if (estimateJsonBytes(candidate) > 800_000) {
    candidate.answers = {};
  }

  return candidate;
}

const PENDING_TKA_SUBMISSIONS_KEY = 'sekolahku_pending_tka_submissions_v1';

const ALL_TKA_MAPEL_KEYS: TKAMapelScoreKey[] = [
  'Bahasa Indonesia',
  'Matematika',
  'IPAS',
  'Bahasa Inggris',
  'Koding dan Kecerdasan Artifisial (KKA)',
];

export function getPendingTkaSubmissions(): TKASubmissionItem[] {
  try {
    const raw = localStorage.getItem(PENDING_TKA_SUBMISSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueuePendingTkaSubmission(sub: TKASubmissionItem): void {
  try {
    const clean = sanitizeSubmissionForStorage(sub, sub.id) as TKASubmissionItem;
    const current = getPendingTkaSubmissions().filter((item) => item.id !== clean.id);
    safeSetLocalStorage(PENDING_TKA_SUBMISSIONS_KEY, JSON.stringify([clean, ...current]));
  } catch {
    // Ignore local pending queue storage errors
  }
}

export function removePendingTkaSubmission(docId: string): void {
  try {
    const current = getPendingTkaSubmissions();
    const filtered = current.filter((item) => item.id !== docId);
    if (filtered.length === 0) {
      localStorage.removeItem(PENDING_TKA_SUBMISSIONS_KEY);
    } else if (filtered.length !== current.length) {
      safeSetLocalStorage(PENDING_TKA_SUBMISSIONS_KEY, JSON.stringify(filtered));
    }
  } catch {
    // Ignore
  }
}

export function clearPendingTkaSubmissions(): void {
  try {
    localStorage.removeItem(PENDING_TKA_SUBMISSIONS_KEY);
  } catch {
    // Ignore
  }
}

export function mergeTwoTkaSubmissions(
  older: TKASubmissionItem,
  newer: TKASubmissionItem
): TKASubmissionItem {
  const basePaket = newer.paketDasar || extractBaseTkaPaket(newer.paket) || older.paketDasar || extractBaseTkaPaket(older.paket);
  const olderCompleted: TKAMapelScoreKey[] = Array.isArray(older.completedMapels)
    ? (older.completedMapels as TKAMapelScoreKey[])
    : ALL_TKA_MAPEL_KEYS.filter((k) => Number(older.scoresPerMapel?.[k] || 0) > 0);
  const newerCompleted: TKAMapelScoreKey[] = Array.isArray(newer.completedMapels)
    ? (newer.completedMapels as TKAMapelScoreKey[])
    : ALL_TKA_MAPEL_KEYS.filter((k) => Number(newer.scoresPerMapel?.[k] || 0) > 0);

  const mergedCompleted = Array.from(new Set<TKAMapelScoreKey>([...olderCompleted, ...newerCompleted]));
  const olderSet = new Set(olderCompleted);
  const newerSet = new Set(newerCompleted);

  const pickMapelScore = (key: TKAMapelScoreKey): number => {
    const newerAttempted = newerSet.has(key);
    const olderAttempted = olderSet.has(key);
    const nVal = Number(newer.scoresPerMapel?.[key] ?? 0);
    const oVal = Number(older.scoresPerMapel?.[key] ?? 0);
    if (newerAttempted && (!olderAttempted || (newer.updatedAt || '') >= (older.updatedAt || ''))) {
      return Number.isFinite(nVal) ? nVal : 0;
    }
    if (olderAttempted) {
      return Number.isFinite(oVal) ? oVal : 0;
    }
    const fallback = nVal || oVal || 0;
    return Number.isFinite(fallback) ? fallback : 0;
  };

  const mergedScores: TKASubmissionItem['scoresPerMapel'] = {
    'Bahasa Indonesia': pickMapelScore('Bahasa Indonesia'),
    'Matematika': pickMapelScore('Matematika'),
    'IPAS': pickMapelScore('IPAS'),
    'Bahasa Inggris': pickMapelScore('Bahasa Inggris'),
    'Koding dan Kecerdasan Artifisial (KKA)': pickMapelScore('Koding dan Kecerdasan Artifisial (KKA)'),
  };

  const keysForAvg = mergedCompleted.length > 0 ? mergedCompleted : ALL_TKA_MAPEL_KEYS;
  const sum = keysForAvg.reduce((acc, k) => acc + Number(mergedScores[k] || 0), 0);
  const avgTotal = keysForAvg.length > 0 ? Math.round(sum / keysForAvg.length) : 0;
  const predikat: 'A' | 'B' | 'C' | 'D' =
    avgTotal >= 88 ? 'A' : avgTotal >= 78 ? 'B' : avgTotal >= 68 ? 'C' : 'D';
  const status: 'Tuntas' | 'Remedial' = avgTotal >= 75 ? 'Tuntas' : 'Remedial';

  return {
    ...older,
    ...newer,
    id: makeSubmissionDocId(newer.studentId || older.studentId, basePaket, newer.id || older.id),
    fotoUrl: sanitizeSubmissionFotoUrl(newer.fotoUrl || older.fotoUrl),
    paket: basePaket,
    paketDasar: basePaket,
    completedMapels: mergedCompleted,
    answers: {
      ...(older.answers || {}),
      ...(newer.answers || {}),
    },
    scoresPerMapel: mergedScores,
    skorTotal: avgTotal,
    predikat,
    status,
    tahunPelajaran: newer.tahunPelajaran || older.tahunPelajaran,
    semester: newer.semester || older.semester,
    updatedAt:
      (newer.updatedAt || '') >= (older.updatedAt || '')
        ? newer.updatedAt || new Date().toISOString()
        : older.updatedAt || new Date().toISOString(),
  };
}

export function mergeTkaSubmissionLists(
  baseList: TKASubmissionItem[],
  incomingList: TKASubmissionItem[]
): TKASubmissionItem[] {
  const map = new Map<string, TKASubmissionItem>();
  const keyOf = (s: TKASubmissionItem) =>
    makeSubmissionDocId(s.studentId, s.paketDasar || extractBaseTkaPaket(s.paket), s.id);

  (Array.isArray(baseList) ? baseList : []).forEach((s) => {
    const k = keyOf(s);
    const prev = map.get(k);
    map.set(k, prev ? mergeTwoTkaSubmissions(prev, s) : s);
  });

  (Array.isArray(incomingList) ? incomingList : []).forEach((s) => {
    const k = keyOf(s);
    const prev = map.get(k);
    map.set(k, prev ? mergeTwoTkaSubmissions(prev, s) : s);
  });

  return Array.from(map.values()).sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );
}

export async function saveTkaSubmissionToFirestore(submission: TKASubmissionItem): Promise<boolean> {
  const cleanBase = sanitizeSubmissionForStorage(submission);
  const docId = cleanBase.id;
  try {
    const meta = getStoredExamResultsResetMeta();
    if (meta?.deletedTkaIds && docId in meta.deletedTkaIds) {
      const nextDeleted = { ...meta.deletedTkaIds };
      delete nextDeleted[docId];
      const nextMeta: ExamResultsResetMeta = { ...meta, deletedTkaIds: nextDeleted };
      if (Object.keys(nextDeleted).length === 0) {
        delete nextMeta.deletedTkaIds;
      }
      runWithoutStorageSync(() => {
        saveStoredExamResultsResetMeta(nextMeta);
      });
    }
  } catch {}
  enqueuePendingTkaSubmission(cleanBase as TKASubmissionItem);
  try {
    await setDoc(
      doc(db, TKA_SUBMISSIONS_COLLECTION, docId),
      {
        ...cleanBase,
        updatedAt: cleanBase.updatedAt || new Date().toISOString(),
        serverTime: serverTimestamp(),
      },
      { merge: true }
    );
    removePendingTkaSubmission(docId);
    safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
    return true;
  } catch (error) {
    console.error('Gagal menyimpan hasil TKA ke Firestore:', error);
    return false;
  }
}

export async function flushPendingTkaSubmissionsToFirestore(): Promise<number> {
  const pending = getPendingTkaSubmissions();
  if (pending.length === 0) return 0;

  let uploaded = 0;
  for (const item of pending) {
    try {
      const basePaket = item.paketDasar || extractBaseTkaPaket(item.paket);
      const docId = makeSubmissionDocId(item.studentId, basePaket, item.id);
      let finalItem = item;
      try {
        const snap = await getDoc(doc(db, TKA_SUBMISSIONS_COLLECTION, docId));
        if (snap.exists()) {
          const remote = { ...(snap.data() as TKASubmissionItem), id: snap.id };
          finalItem = mergeTwoTkaSubmissions(remote, item);
        }
      } catch {
        // Proceed with local item if offline/read fails
      }
      const ok = await saveTkaSubmissionToFirestore(finalItem);
      if (ok) uploaded++;
    } catch {
      // Keep remaining items in queue for next retry
    }
  }
  return uploaded;
}

export async function saveTkaSubmissionsBatchToFirestore(
  submissions: TKASubmissionItem[]
): Promise<boolean> {
  try {
    if (!submissions || submissions.length === 0) return true;
    const MAX_DOCS_PER_BATCH = 40;
    const MAX_BYTES_PER_BATCH = 2_500_000;
    const nowIso = new Date().toISOString();
    const cleanedSubmissions = submissions.map((sub, i) =>
      sanitizeSubmissionForStorage(sub, sub.id || `sim_${i}`)
    );

    try {
      const meta = getStoredExamResultsResetMeta();
      if (meta?.deletedTkaIds) {
        const nextDeleted = { ...meta.deletedTkaIds };
        let changed = false;
        cleanedSubmissions.forEach((cleanSub) => {
          if (cleanSub.id in nextDeleted) {
            delete nextDeleted[cleanSub.id];
            changed = true;
          }
        });
        if (changed) {
          const nextMeta: ExamResultsResetMeta = { ...meta, deletedTkaIds: nextDeleted };
          if (Object.keys(nextDeleted).length === 0) {
            delete nextMeta.deletedTkaIds;
          }
          runWithoutStorageSync(() => {
            saveStoredExamResultsResetMeta(nextMeta);
          });
        }
      }
    } catch {}

    let batch = writeBatch(db);
    let batchDocs = 0;
    let batchBytes = 0;

    for (let i = 0; i < cleanedSubmissions.length; i++) {
      const cleanSub = cleanedSubmissions[i];
      const approxBytes = estimateJsonBytes(cleanSub) + 512;

      if (
        batchDocs > 0 &&
        (batchDocs >= MAX_DOCS_PER_BATCH || batchBytes + approxBytes > MAX_BYTES_PER_BATCH)
      ) {
        await batch.commit();
        batch = writeBatch(db);
        batchDocs = 0;
        batchBytes = 0;
      }

      batch.set(
        doc(db, TKA_SUBMISSIONS_COLLECTION, cleanSub.id),
        {
          ...cleanSub,
          updatedAt: nowIso,
          serverTime: serverTimestamp(),
        },
        { merge: true }
      );
      batchDocs++;
      batchBytes += approxBytes;
    }

    if (batchDocs > 0) {
      await batch.commit();
    }

    safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
    return true;
  } catch (error) {
    console.error('Gagal menyimpan batch hasil TKA ke Firestore:', error);
    return false;
  }
}

export async function fetchTkaSubmissionsFromFirestore(): Promise<TKASubmissionItem[]> {
  try {
    const snapshot = await getDocs(collection(db, TKA_SUBMISSIONS_COLLECTION));
    const list: TKASubmissionItem[] = [];
    snapshot.forEach((docSnap) => {
      const raw = docSnap.data() as any;
      const { serverTime: _st, ...rest } = raw || {};
      list.push({
        ...(rest as TKASubmissionItem),
        id: docSnap.id,
        fotoUrl: sanitizeSubmissionFotoUrl(rest?.fotoUrl),
      });
    });
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return list;
  } catch (error) {
    console.error('Gagal mengambil hasil TKA dari Firestore:', error);
    return [];
  }
}

export async function replaceTkaSubmissionsInFirestore(
  submissions: TKASubmissionItem[]
): Promise<boolean> {
  try {
    const sanitized = (submissions || []).map((sub, idx) =>
      sanitizeSubmissionForStorage(sub, sub.id || `rest_${idx}`) as TKASubmissionItem
    );
    const targetIds = new Set(sanitized.map((s) => s.id));

    const existingSnap = await getDocs(collection(db, TKA_SUBMISSIONS_COLLECTION));
    const staleIds: string[] = [];
    existingSnap.forEach((d) => {
      if (!targetIds.has(d.id)) {
        staleIds.push(d.id);
      }
    });

    if (staleIds.length > 0) {
      const CHUNK_SIZE = 350;
      for (let i = 0; i < staleIds.length; i += CHUNK_SIZE) {
        const chunk = staleIds.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, TKA_SUBMISSIONS_COLLECTION, id)));
        await batch.commit();
      }
    }

    if (sanitized.length > 0) {
      await saveTkaSubmissionsBatchToFirestore(sanitized);
    }

    safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
    runWithoutStorageSync(() => {
      saveStoredTKASubmissions(sanitized);
    });
    return true;
  } catch (error) {
    console.error('Gagal mengganti koleksi tka_submissions di Firestore:', error);
    return false;
  }
}

export async function clearTkaSubmissionsInFirestore(): Promise<boolean> {
  try {
    clearPendingTkaSubmissions();
    const snap = await getDocs(collection(db, TKA_SUBMISSIONS_COLLECTION));
    const ids: string[] = [];
    snap.forEach((d) => ids.push(d.id));
    if (ids.length > 0) {
      const CHUNK_SIZE = 350;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, TKA_SUBMISSIONS_COLLECTION, id)));
        await batch.commit();
      }
    }
    safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
    return true;
  } catch (error) {
    console.error('Gagal menghapus koleksi tka_submissions di Firestore:', error);
    return false;
  }
}

export async function deleteTkaSubmissionsByPaketInFirestore(paketName: string): Promise<boolean> {
  try {
    const baseTarget = extractBaseTkaPaket(paketName);
    const snap = await getDocs(collection(db, TKA_SUBMISSIONS_COLLECTION));
    const idsToDelete: string[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      const subPaketBase = data?.paketDasar || extractBaseTkaPaket(data?.paket);
      if (subPaketBase === baseTarget || data?.paket === paketName) {
        idsToDelete.push(d.id);
      }
    });
    if (idsToDelete.length > 0) {
      const CHUNK_SIZE = 350;
      for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
        const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, TKA_SUBMISSIONS_COLLECTION, id)));
        await batch.commit();
      }
    }
    safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
    return true;
  } catch (error) {
    console.error(`Gagal menghapus submission paket ${paketName} di Firestore:`, error);
    return false;
  }
}

export async function deleteSingleTkaSubmissionFromFirestore(docId: string): Promise<boolean> {
  if (!docId) return false;
  try {
    removePendingTkaSubmission(docId);
    await deleteDoc(doc(db, TKA_SUBMISSIONS_COLLECTION, docId));
    safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
    return true;
  } catch (error) {
    console.error(`Gagal menghapus submission TKA (${docId}) di Firestore:`, error);
    return false;
  }
}

export function subscribeToTkaSubmissionsCollection(
  onUpdate: (submissions: TKASubmissionItem[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const colRef = collection(db, TKA_SUBMISSIONS_COLLECTION);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: TKASubmissionItem[] = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as any;
          const { serverTime: _st, ...rest } = raw || {};
          list.push({
            ...(rest as TKASubmissionItem),
            id: docSnap.id,
            fotoUrl: sanitizeSubmissionFotoUrl(rest?.fotoUrl),
          });
        });
        list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        onUpdate(list);
      },
      (error) => {
        console.warn('TKA submissions onSnapshot listener info:', error?.message);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.warn('Gagal memasang listener tka_submissions:', error);
    return () => {};
  }
}

export interface UpsertTkaSubmissionParams {
  student: {
    id: string;
    nama: string;
    nisn: string;
    kelas: string;
    fotoUrl: string;
  };
  paketName: string;
  mapelScores: Partial<Record<TKAMapelScoreKey, number>>;
  completedMapelKeys: TKAMapelScoreKey[];
  questionAnswers: Record<string, any>;
  durasiMenitUsed: number;
  tahunPelajaran?: string;
  semester?: string;
}

function buildMergedTkaSubmissionState(
  params: UpsertTkaSubmissionParams,
  existingSubs: TKASubmissionItem[],
  remoteSub?: TKASubmissionItem | null
): {
  mergedSub: TKASubmissionItem;
  updatedList: TKASubmissionItem[];
} {
  const { student, paketName, mapelScores, completedMapelKeys, questionAnswers, durasiMenitUsed, tahunPelajaran, semester } = params;
  const basePaket = extractBaseTkaPaket(paketName);
  const stableStudentId = student.id || student.nisn || 'siswa_anon';

  const localPrev = existingSubs.find(
    (s) =>
      (s.studentId === stableStudentId || (student.nisn && s.nisn === student.nisn)) &&
      (s.paket === basePaket || s.paketDasar === basePaket || extractBaseTkaPaket(s.paket) === basePaket)
  );

  const prevSub =
    localPrev && remoteSub
      ? mergeTwoTkaSubmissions(remoteSub, localPrev)
      : localPrev || remoteSub || undefined;

  const prevCompleted: TKAMapelScoreKey[] = Array.isArray(prevSub?.completedMapels)
    ? (prevSub!.completedMapels as TKAMapelScoreKey[])
    : prevSub?.scoresPerMapel
    ? ALL_TKA_MAPEL_KEYS.filter((k) => Number(prevSub.scoresPerMapel?.[k] || 0) > 0)
    : [];

  const mergedCompleted = Array.from(new Set<TKAMapelScoreKey>([...prevCompleted, ...completedMapelKeys]));

  const pickVal = (key: TKAMapelScoreKey): number => {
    const raw = mapelScores[key] ?? prevSub?.scoresPerMapel?.[key] ?? 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const updatedScores: TKASubmissionItem['scoresPerMapel'] = {
    'Bahasa Indonesia': pickVal('Bahasa Indonesia'),
    'Matematika': pickVal('Matematika'),
    'IPAS': pickVal('IPAS'),
    'Bahasa Inggris': pickVal('Bahasa Inggris'),
    'Koding dan Kecerdasan Artifisial (KKA)': pickVal('Koding dan Kecerdasan Artifisial (KKA)'),
  };

  const keysForAvg: TKAMapelScoreKey[] =
    mergedCompleted.length > 0 ? mergedCompleted : ALL_TKA_MAPEL_KEYS;

  const sumScores = keysForAvg.reduce((acc, k) => acc + Number(updatedScores[k] || 0), 0);
  const avgTotal = keysForAvg.length > 0 ? Math.round(sumScores / keysForAvg.length) : 0;

  const predikat: 'A' | 'B' | 'C' | 'D' =
    avgTotal >= 88 ? 'A' : avgTotal >= 78 ? 'B' : avgTotal >= 68 ? 'C' : 'D';
  const status: 'Tuntas' | 'Remedial' = avgTotal >= 75 ? 'Tuntas' : 'Remedial';

  const docId = makeSubmissionDocId(stableStudentId, basePaket);
  const mergedSub: TKASubmissionItem = {
    id: docId,
    studentId: stableStudentId,
    studentName: student.nama,
    nisn: student.nisn,
    kelas: student.kelas,
    fotoUrl: sanitizeSubmissionFotoUrl(student.fotoUrl),
    paket: basePaket,
    paketDasar: basePaket,
    completedMapels: mergedCompleted,
    answers: {
      ...(prevSub?.answers || {}),
      ...questionAnswers,
    },
    scoresPerMapel: updatedScores,
    skorTotal: avgTotal,
    predikat,
    status,
    tanggalUjian: new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    durasiPengerjaan: `${Math.max(1, durasiMenitUsed)} Menit`,
    ...(tahunPelajaran || prevSub?.tahunPelajaran
      ? { tahunPelajaran: tahunPelajaran || prevSub?.tahunPelajaran }
      : {}),
    ...(semester || prevSub?.semester
      ? { semester: semester || prevSub?.semester }
      : {}),
    updatedAt: new Date().toISOString(),
  };

  const otherSubs = existingSubs.filter(
    (s) =>
      !(
        s.id === docId ||
        ((s.studentId === stableStudentId || (student.nisn && s.nisn === student.nisn)) &&
          (s.paket === basePaket || s.paketDasar === basePaket || extractBaseTkaPaket(s.paket) === basePaket))
      )
  );
  const updatedList = [mergedSub, ...otherSubs];
  return { mergedSub, updatedList };
}

/**
 * Menggabungkan & menyimpan hasil pengerjaan TKA siswa ke localStorage/IDB dan Firestore
 * sehingga langsung masuk ke Menu Analisis TKA maupun Report & Rekapitulasi Hasil TKA.
 */
export function upsertTkaSubmission(params: UpsertTkaSubmissionParams): {
  mergedSub: TKASubmissionItem;
  updatedList: TKASubmissionItem[];
  syncPromise: Promise<boolean>;
} {
  const existingSubs = getStoredTKASubmissions();
  const { mergedSub, updatedList } = buildMergedTkaSubmissionState(params, existingSubs);
  enqueuePendingTkaSubmission(mergedSub);
  saveStoredTKASubmissions(updatedList);
  const syncPromise = saveTkaSubmissionToFirestore(mergedSub);
  return { mergedSub, updatedList, syncPromise };
}

/**
 * Versi async yang menarik data remote doc `tka_submissions/{docId}` lebih dulu bila tersedia
 * lalu menunggu (`await`) penulisan ke Firestore selesai agar siswa tidak kehilangan hasil antar-mapel/perangkat.
 */
export async function upsertTkaSubmissionAsync(params: UpsertTkaSubmissionParams): Promise<{
  mergedSub: TKASubmissionItem;
  updatedList: TKASubmissionItem[];
  cloudSaved: boolean;
}> {
  const basePaket = extractBaseTkaPaket(params.paketName);
  const stableStudentId = params.student.id || params.student.nisn || 'siswa_anon';
  const docId = makeSubmissionDocId(stableStudentId, basePaket);

  let remoteSub: TKASubmissionItem | null = null;
  try {
    const snapPromise = getDoc(doc(db, TKA_SUBMISSIONS_COLLECTION, docId));
    const snap = await Promise.race([
      snapPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (snap && snap.exists()) {
      remoteSub = { ...(snap.data() as TKASubmissionItem), id: snap.id };
    }
  } catch {
    // Tetap lanjutkan pakai data lokal jika getDoc offline/timeout
  }

  const existingSubs = getStoredTKASubmissions();
  const { mergedSub, updatedList } = buildMergedTkaSubmissionState(params, existingSubs, remoteSub);
  enqueuePendingTkaSubmission(mergedSub);
  saveStoredTKASubmissions(updatedList);
  const cloudSaved = await saveTkaSubmissionToFirestore(mergedSub);
  return { mergedSub, updatedList, cloudSaved };
}

/**
 * Merekonsiliasi hasil TKA yang tersimpan di `cbt_results` / `tka_results` (misalnya dari perangkat siswa)
 * agar otomatis masuk ke `tka_submissions` apabila sebelumnya gagal terkirim atau belum tersinkron.
 * Tetap mematuhi timestamp pengosongan data (`resetMeta`).
 */
export function reconcileTkaResultsToSubmissions(options: {
  cbtResults: CBTExamResult[];
  tkaResults?: CBTExamResult[];
  existingSubmissions: TKASubmissionItem[];
  students: Student[];
  resetMeta?: ExamResultsResetMeta;
}): {
  mergedSubmissions: TKASubmissionItem[];
  recoveredItems: TKASubmissionItem[];
} {
  const { cbtResults, tkaResults = [], existingSubmissions, students, resetMeta } = options;
  const activeMeta = resetMeta || getStoredExamResultsResetMeta();

  const rawCombined = [...(Array.isArray(cbtResults) ? cbtResults : []), ...(Array.isArray(tkaResults) ? tkaResults : [])];
  const tkaOnly = rawCombined.filter((r) => isTkaResultEntry(r));
  const validTkaResults = filterExamResultsByResetMeta(tkaOnly, 'tka', activeMeta);

  if (validTkaResults.length === 0) {
    return { mergedSubmissions: existingSubmissions, recoveredItems: [] };
  }

  const subMap = new Map<string, TKASubmissionItem>();
  (Array.isArray(existingSubmissions) ? existingSubmissions : []).forEach((s) => {
    const basePaket = s.paketDasar || extractBaseTkaPaket(s.paket);
    const key = makeSubmissionDocId(s.studentId, basePaket, s.id);
    subMap.set(key, s);
  });

  const recoveredMap = new Map<string, TKASubmissionItem>();

  validTkaResults.forEach((res) => {
    const matchedStudent = findLiveStudentForRecord(students, {
      studentId: res.studentId,
      nisn: res.nisn,
      studentName: res.studentName,
    });
    if (
      !matchedStudent &&
      isSyntheticDefaultStudentRecord(
        { studentId: res.studentId, nisn: res.nisn, studentName: res.studentName },
        students
      )
    ) {
      return;
    }

    const sid = matchedStudent?.id || res.studentId;
    if (!sid) return;

    const rawPaket =
      res.paketName ||
      (res.judul && res.judul.includes(' - ') ? res.judul.split(' - ')[0].trim() : '') ||
      'Simulasi 1';
    const basePaket = extractBaseTkaPaket(rawPaket);
    const docId = makeSubmissionDocId(sid, basePaket);
    const deletedTs = Number(activeMeta?.deletedTkaIds?.[docId] || 0);
    const resTs = typeof res.recordedAt === 'number' && Number.isFinite(res.recordedAt) ? res.recordedAt : 0;
    if (deletedTs > 0 && resTs <= deletedTs) {
      return;
    }
    const mapelKey = normalizeTkaMapelKey(res.mapel || res.judul || 'Bahasa Indonesia');
    const numericGrade = Number.isFinite(Number(res.nilai)) ? Math.round(Number(res.nilai)) : 0;

    // Cari existing baik berdasarkan docId baru maupun kecocokan studentId/nama/nisn lama
    let existing = subMap.get(docId);
    if (!existing && matchedStudent) {
      for (const [k, s] of subMap.entries()) {
        const sPaket = s.paketDasar || extractBaseTkaPaket(s.paket);
        if (sPaket !== basePaket) continue;
        const matchedExistingStudent = findLiveStudentForRecord(students, s);
        if (matchedExistingStudent?.id === matchedStudent.id) {
          existing = s;
          if (k !== docId) subMap.delete(k);
          break;
        }
      }
    }

    if (existing) {
      const completed = Array.isArray(existing.completedMapels) ? existing.completedMapels : [];
      const studentMetaChanged = Boolean(
        matchedStudent &&
          (existing.id !== docId ||
            existing.studentId !== matchedStudent.id ||
            existing.studentName !== matchedStudent.nama ||
            (existing.nisn || '') !== (matchedStudent.nisn || '') ||
            existing.kelas !== matchedStudent.kelas)
      );
      if (completed.includes(mapelKey)) {
        if (studentMetaChanged && matchedStudent) {
          const syncedItem: TKASubmissionItem = {
            ...existing,
            id: docId,
            studentId: matchedStudent.id,
            studentName: matchedStudent.nama,
            nisn: matchedStudent.nisn,
            kelas: matchedStudent.kelas,
            fotoUrl: sanitizeSubmissionFotoUrl(matchedStudent.fotoUrl || existing.fotoUrl),
            paket: basePaket,
            paketDasar: basePaket,
          };
          subMap.set(docId, syncedItem);
          recoveredMap.set(docId, syncedItem);
        } else {
          subMap.set(existing.id || docId, existing);
        }
        return;
      }
      // Mapel ini ada di hasil CBT siswa tapi belum masuk di completedMapels submission
      const updatedCompleted = Array.from(new Set([...completed, mapelKey])) as TKAMapelScoreKey[];
      const nextScores = {
        'Bahasa Indonesia': existing.scoresPerMapel?.['Bahasa Indonesia'] ?? 0,
        'Matematika': existing.scoresPerMapel?.['Matematika'] ?? 0,
        'IPAS': existing.scoresPerMapel?.['IPAS'] ?? 0,
        'Bahasa Inggris': existing.scoresPerMapel?.['Bahasa Inggris'] ?? 0,
        'Koding dan Kecerdasan Artifisial (KKA)':
          existing.scoresPerMapel?.['Koding dan Kecerdasan Artifisial (KKA)'] ?? 0,
        [mapelKey]: numericGrade,
      };
      const avg = Math.round(
        updatedCompleted.reduce((acc, k) => acc + Number(nextScores[k] || 0), 0) /
          updatedCompleted.length
      );
      const updatedItem: TKASubmissionItem = {
        ...existing,
        id: docId,
        studentId: matchedStudent?.id || existing.studentId,
        studentName: matchedStudent?.nama || existing.studentName,
        nisn: matchedStudent?.nisn ?? existing.nisn,
        kelas: matchedStudent?.kelas || existing.kelas || res.kelas || '',
        fotoUrl: sanitizeSubmissionFotoUrl(matchedStudent?.fotoUrl || existing.fotoUrl),
        paket: basePaket,
        paketDasar: basePaket,
        completedMapels: updatedCompleted,
        scoresPerMapel: nextScores,
        answers: {
          ...(existing.answers || {}),
          ...(res.jawabanSiswa || {}),
        },
        skorTotal: avg,
        predikat: avg >= 88 ? 'A' : avg >= 78 ? 'B' : avg >= 68 ? 'C' : 'D',
        status: avg >= 75 ? 'Tuntas' : 'Remedial',
        ...(res.tahunPelajaran || existing.tahunPelajaran
          ? { tahunPelajaran: res.tahunPelajaran || existing.tahunPelajaran }
          : {}),
        ...(res.semester || existing.semester
          ? { semester: res.semester || existing.semester }
          : {}),
        updatedAt: res.recordedAt ? new Date(res.recordedAt).toISOString() : new Date().toISOString(),
      };
      subMap.set(docId, updatedItem);
      recoveredMap.set(docId, updatedItem);
      return;
    }

    const newItem: TKASubmissionItem = {
      id: docId,
      studentId: sid,
      studentName: matchedStudent?.nama || res.studentName || 'Siswa',
      nisn: matchedStudent?.nisn || res.nisn || '',
      kelas: matchedStudent?.kelas || res.kelas || '',
      fotoUrl: sanitizeSubmissionFotoUrl(matchedStudent?.fotoUrl),
      paket: basePaket,
      paketDasar: basePaket,
      completedMapels: [mapelKey],
      answers: res.jawabanSiswa || {},
      scoresPerMapel: {
        'Bahasa Indonesia': mapelKey === 'Bahasa Indonesia' ? numericGrade : 0,
        'Matematika': mapelKey === 'Matematika' ? numericGrade : 0,
        'IPAS': mapelKey === 'IPAS' ? numericGrade : 0,
        'Bahasa Inggris': mapelKey === 'Bahasa Inggris' ? numericGrade : 0,
        'Koding dan Kecerdasan Artifisial (KKA)':
          mapelKey === 'Koding dan Kecerdasan Artifisial (KKA)' ? numericGrade : 0,
      },
      skorTotal: numericGrade,
      predikat: numericGrade >= 88 ? 'A' : numericGrade >= 78 ? 'B' : numericGrade >= 68 ? 'C' : 'D',
      status: numericGrade >= 75 ? 'Tuntas' : 'Remedial',
      tanggalUjian:
        res.tanggal ||
        new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
      durasiPengerjaan: '45 Menit',
      ...(res.tahunPelajaran ? { tahunPelajaran: res.tahunPelajaran } : {}),
      ...(res.semester ? { semester: res.semester } : {}),
      updatedAt: res.recordedAt ? new Date(res.recordedAt).toISOString() : new Date().toISOString(),
    };
    subMap.set(docId, newItem);
    recoveredMap.set(docId, newItem);
  });

  const { alignedSubmissions } = alignTkaSubmissionsWithStudents(Array.from(subMap.values()), students);
  const mergedSubmissions = alignedSubmissions.sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );
  return {
    mergedSubmissions,
    recoveredItems: Array.from(recoveredMap.values()),
  };
}

export async function reconcileAndSyncLocalTkaSubmissions(
  studentsOverride?: Student[]
): Promise<TKASubmissionItem[]> {
  try {
    const cbtRes = getStoredCBTResults();
    const tkaRes = getStoredTKAResults();
    const existing = getStoredTKASubmissions();
    const studentsList = studentsOverride && studentsOverride.length > 0 ? studentsOverride : getStoredStudents();
    const { mergedSubmissions, recoveredItems } = reconcileTkaResultsToSubmissions({
      cbtResults: cbtRes,
      tkaResults: tkaRes,
      existingSubmissions: existing,
      students: studentsList,
    });
    if (recoveredItems.length === 0) return [];
    recoveredItems.forEach((item) => enqueuePendingTkaSubmission(item));
    runWithoutStorageSync(() => {
      saveStoredTKASubmissions(mergedSubmissions);
    });
    await saveTkaSubmissionsBatchToFirestore(recoveredItems);
    recoveredItems.forEach((item) => removePendingTkaSubmission(item.id));
    return recoveredItems;
  } catch (err) {
    console.warn('Reconcile local TKA submissions warning:', err);
    return [];
  }
}

