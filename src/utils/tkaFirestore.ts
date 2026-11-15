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
import { runWithoutStorageSync, saveStoredTKAQuestions } from './storage';

export const TKA_QUESTIONS_COLLECTION = 'tka_questions';

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

/**
 * Menyimpan satu butir soal TKA secara langsung dan real-time ke koleksi 'tka_questions' di Firestore.
 */
export async function saveSingleTkaQuestionToFirestore(
  question: TKAQuestion,
  orderIndex?: number
): Promise<boolean> {
  try {
    const questionId = sanitizeQuestionId(question.id);
    const docRef = doc(db, TKA_QUESTIONS_COLLECTION, questionId);
    const cleanQuestion = stripUndefinedDeep({
      ...question,
      id: questionId,
      ...(typeof orderIndex === 'number' ? { orderIndex } : {}),
      updatedAt: new Date().toISOString(),
      serverTime: serverTimestamp(),
    });
    await setDoc(docRef, cleanQuestion, { merge: true });
    localStorage.setItem('sekolahku_tka_questions_seeded', 'true');
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
    localStorage.setItem('sekolahku_tka_questions_seeded', 'true');
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
  questions: TKAQuestion[]
): Promise<boolean> {
  try {
    if (questions && questions.length > 0) {
      const CHUNK_SIZE = 25;
      for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
        const chunk = questions.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((q, offset) => {
          const orderIndex = i + offset;
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
    localStorage.setItem('sekolahku_tka_questions_seeded', 'true');
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

    localStorage.setItem('sekolahku_tka_questions_seeded', 'true');
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
