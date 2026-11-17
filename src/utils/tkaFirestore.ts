import {
  collection,
  doc,
  writeBatch,
  onSnapshot,
  getDocs,
  deleteDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { TKAQuestion } from '../types';
import {
  runWithoutStorageSync,
  saveStoredTKAQuestions,
  getStoredTKASubmissions,
  saveStoredTKASubmissions,
  safeSetLocalStorage,
  TKASubmissionItem,
  TKAMapelScoreKey,
  extractBaseTkaPaket,
} from './storage';
import { compressDataUrlImage } from './imageUtils';

export const TKA_QUESTIONS_COLLECTION = 'tka_questions';
export const TKA_SUBMISSIONS_COLLECTION = 'tka_submissions';

function sanitizeQuestionId(rawId?: string, fallbackIdx: number = 0): string {
  const base = (rawId || `tka_q_${Date.now()}_${fallbackIdx}`).trim();
  return base.replace(/\//g, '_') || `tka_q_${Date.now()}_${fallbackIdx}`;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
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

function makeSubmissionDocId(studentId: string, basePaket: string, fallbackId?: string): string {
  const cleanStudent = (studentId || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
  const cleanPaket = (basePaket || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
  if (cleanStudent && cleanPaket) {
    return `sub_${cleanStudent}_${cleanPaket}`;
  }
  return sanitizeQuestionId(fallbackId, 0);
}

export async function saveTkaSubmissionToFirestore(submission: TKASubmissionItem): Promise<boolean> {
  try {
    const basePaket = submission.paketDasar || extractBaseTkaPaket(submission.paket);
    const docId = makeSubmissionDocId(submission.studentId, basePaket, submission.id);
    const cleanSub = stripUndefinedDeep({
      ...submission,
      id: docId,
      paket: basePaket,
      paketDasar: basePaket,
      updatedAt: new Date().toISOString(),
      serverTime: serverTimestamp(),
    });
    await setDoc(doc(db, TKA_SUBMISSIONS_COLLECTION, docId), cleanSub, { merge: true });
    safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
    return true;
  } catch (error) {
    console.error('Gagal menyimpan hasil TKA ke Firestore:', error);
    return false;
  }
}

export async function saveTkaSubmissionsBatchToFirestore(
  submissions: TKASubmissionItem[]
): Promise<boolean> {
  try {
    if (!submissions || submissions.length === 0) return true;
    const CHUNK_SIZE = 25;
    for (let i = 0; i < submissions.length; i += CHUNK_SIZE) {
      const chunk = submissions.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((sub, offset) => {
        const basePaket = sub.paketDasar || extractBaseTkaPaket(sub.paket);
        const docId = makeSubmissionDocId(sub.studentId, basePaket, sub.id || `sim_${i + offset}`);
        const cleanSub = stripUndefinedDeep({
          ...sub,
          id: docId,
          paket: basePaket,
          paketDasar: basePaket,
          updatedAt: new Date().toISOString(),
          serverTime: serverTimestamp(),
        });
        batch.set(doc(db, TKA_SUBMISSIONS_COLLECTION, docId), cleanSub, { merge: true });
      });
      await batch.commit();
    }
    safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
    return true;
  } catch (error) {
    console.error('Gagal menyimpan batch hasil TKA ke Firestore:', error);
    return false;
  }
}

export async function clearTkaSubmissionsInFirestore(): Promise<boolean> {
  try {
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
}

/**
 * Menggabungkan & menyimpan hasil pengerjaan TKA siswa ke localStorage dan Firestore
 * sehingga langsung masuk ke Menu Analisis TKA maupun Report & Rekapitulasi Hasil TKA.
 */
export function upsertTkaSubmission(params: UpsertTkaSubmissionParams): {
  mergedSub: TKASubmissionItem;
  updatedList: TKASubmissionItem[];
} {
  const { student, paketName, mapelScores, completedMapelKeys, questionAnswers, durasiMenitUsed } = params;
  const basePaket = extractBaseTkaPaket(paketName);
  const existingSubs = getStoredTKASubmissions();

  const prevSub = existingSubs.find(
    (s) =>
      s.studentId === student.id &&
      (s.paket === basePaket || s.paketDasar === basePaket || extractBaseTkaPaket(s.paket) === basePaket)
  );

  const prevCompleted: TKAMapelScoreKey[] = Array.isArray(prevSub?.completedMapels)
    ? (prevSub!.completedMapels as TKAMapelScoreKey[])
    : prevSub?.scoresPerMapel
    ? (
        [
          'Bahasa Indonesia',
          'Matematika',
          'IPAS',
          'Bahasa Inggris',
          'Koding dan Kecerdasan Artifisial (KKA)',
        ] as TKAMapelScoreKey[]
      ).filter((k) => Number(prevSub.scoresPerMapel?.[k] || 0) > 0)
    : [];

  const mergedCompleted = Array.from(new Set<TKAMapelScoreKey>([...prevCompleted, ...completedMapelKeys]));

  const updatedScores: TKASubmissionItem['scoresPerMapel'] = {
    'Bahasa Indonesia':
      mapelScores['Bahasa Indonesia'] ?? prevSub?.scoresPerMapel?.['Bahasa Indonesia'] ?? 0,
    'Matematika': mapelScores['Matematika'] ?? prevSub?.scoresPerMapel?.['Matematika'] ?? 0,
    'IPAS': mapelScores['IPAS'] ?? prevSub?.scoresPerMapel?.['IPAS'] ?? 0,
    'Bahasa Inggris':
      mapelScores['Bahasa Inggris'] ?? prevSub?.scoresPerMapel?.['Bahasa Inggris'] ?? 0,
    'Koding dan Kecerdasan Artifisial (KKA)':
      mapelScores['Koding dan Kecerdasan Artifisial (KKA)'] ??
      prevSub?.scoresPerMapel?.['Koding dan Kecerdasan Artifisial (KKA)'] ??
      0,
  };

  const keysForAvg: TKAMapelScoreKey[] =
    mergedCompleted.length > 0
      ? mergedCompleted
      : [
          'Bahasa Indonesia',
          'Matematika',
          'IPAS',
          'Bahasa Inggris',
          'Koding dan Kecerdasan Artifisial (KKA)',
        ];

  const sumScores = keysForAvg.reduce((acc, k) => acc + Number(updatedScores[k] || 0), 0);
  const avgTotal = keysForAvg.length > 0 ? Math.round(sumScores / keysForAvg.length) : 0;

  const predikat: 'A' | 'B' | 'C' | 'D' =
    avgTotal >= 88 ? 'A' : avgTotal >= 78 ? 'B' : avgTotal >= 68 ? 'C' : 'D';
  const status: 'Tuntas' | 'Remedial' = avgTotal >= 75 ? 'Tuntas' : 'Remedial';

  const docId = makeSubmissionDocId(student.id, basePaket);
  const mergedSub: TKASubmissionItem = {
    id: docId,
    studentId: student.id,
    studentName: student.nama,
    nisn: student.nisn,
    kelas: student.kelas,
    fotoUrl: student.fotoUrl,
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
    updatedAt: new Date().toISOString(),
  };

  const otherSubs = existingSubs.filter(
    (s) =>
      !(
        s.studentId === student.id &&
        (s.paket === basePaket || s.paketDasar === basePaket || extractBaseTkaPaket(s.paket) === basePaket)
      )
  );
  const updatedList = [mergedSub, ...otherSubs];
  saveStoredTKASubmissions(updatedList);
  saveTkaSubmissionToFirestore(mergedSub).catch(() => {});

  return { mergedSub, updatedList };
}

