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
import { CBTExam } from '../types';
import { runWithoutStorageSync, saveStoredCBTExams } from './storage';

export const CBT_EXAMS_COLLECTION = 'cbt_exams';

function sanitizeExamId(rawId?: string, fallbackIdx: number = 0): string {
  const base = (rawId || `cbt_exam_${Date.now()}_${fallbackIdx}`).trim();
  return base.replace(/\//g, '_') || `cbt_exam_${Date.now()}_${fallbackIdx}`;
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

export function sortCbtExamsOrder(
  list: Array<CBTExam & { orderIndex?: number; updatedAt?: string }>
): CBTExam[] {
  return [...list]
    .sort((a, b) => {
      const hasOrdA = typeof a.orderIndex === 'number';
      const hasOrdB = typeof b.orderIndex === 'number';
      if (hasOrdA && hasOrdB && a.orderIndex !== b.orderIndex) {
        return (a.orderIndex as number) - (b.orderIndex as number);
      }
      if (hasOrdA !== hasOrdB) return hasOrdA ? -1 : 1;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    })
    .map(({ orderIndex: _oi, updatedAt: _ua, serverTime: _st, ...ex }: any) => ex as CBTExam);
}

/**
 * Menyimpan satu paket ujian CBT secara langsung dan real-time ke koleksi 'cbt_exams' di Firestore.
 */
export async function saveCbtExamToFirestore(
  exam: CBTExam,
  orderIndex?: number
): Promise<boolean> {
  try {
    const examId = sanitizeExamId(exam.id);
    const docRef = doc(db, CBT_EXAMS_COLLECTION, examId);
    const cleanExam = stripUndefinedDeep({
      ...exam,
      id: examId,
      ...(typeof orderIndex === 'number' ? { orderIndex } : {}),
      updatedAt: new Date().toISOString(),
      serverTime: serverTimestamp(),
    });
    await setDoc(docRef, cleanExam, { merge: true });
    localStorage.setItem('sekolahku_cbt_exams_seeded', 'true');
    return true;
  } catch (error) {
    console.error(`Gagal menyimpan paket CBT ${exam.id} ke Firestore:`, error);
    return false;
  }
}

/**
 * Menghapus satu paket ujian CBT dari koleksi 'cbt_exams' di Firestore.
 */
export async function deleteCbtExamFromFirestore(examId: string): Promise<boolean> {
  try {
    const safeId = sanitizeExamId(examId);
    await deleteDoc(doc(db, CBT_EXAMS_COLLECTION, safeId));
    localStorage.setItem('sekolahku_cbt_exams_seeded', 'true');
    return true;
  } catch (error) {
    console.error(`Gagal menghapus paket CBT ${examId} dari Firestore:`, error);
    return false;
  }
}

/**
 * Menyimpan daftar paket ujian CBT dalam batch ke koleksi 'cbt_exams' di Firestore.
 */
export async function saveCbtExamsBatchToFirestore(exams: CBTExam[]): Promise<boolean> {
  try {
    if (exams && exams.length > 0) {
      const CHUNK_SIZE = 5;
      for (let i = 0; i < exams.length; i += CHUNK_SIZE) {
        const chunk = exams.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((ex, offset) => {
          const orderIndex = i + offset;
          const examId = sanitizeExamId(ex.id, orderIndex);
          const docRef = doc(db, CBT_EXAMS_COLLECTION, examId);
          const cleanExam = stripUndefinedDeep({
            ...ex,
            id: examId,
            orderIndex,
            updatedAt: new Date().toISOString(),
            serverTime: serverTimestamp(),
          });
          batch.set(docRef, cleanExam, { merge: true });
        });
        await batch.commit();
      }
    }
    localStorage.setItem('sekolahku_cbt_exams_seeded', 'true');
    return true;
  } catch (error) {
    console.error('Gagal menyimpan batch paket CBT ke Firestore:', error);
    return false;
  }
}

/**
 * Mengganti penuh isi koleksi 'cbt_exams' di Firestore (dipakai saat Restore Backup).
 */
export async function replaceCbtExamsInFirestore(exams: CBTExam[]): Promise<boolean> {
  try {
    const normalized = (exams || []).map((ex, idx) => ({
      ...ex,
      id: sanitizeExamId(ex.id, idx),
    }));
    const targetIds = new Set(normalized.map((ex) => ex.id));

    const existingSnap = await getDocs(collection(db, CBT_EXAMS_COLLECTION));
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
        chunk.forEach((id) => batch.delete(doc(db, CBT_EXAMS_COLLECTION, id)));
        await batch.commit();
      }
    }

    if (normalized.length > 0) {
      await saveCbtExamsBatchToFirestore(normalized);
    }

    localStorage.setItem('sekolahku_cbt_exams_seeded', 'true');
    runWithoutStorageSync(() => {
      saveStoredCBTExams(normalized);
    });
    return true;
  } catch (error) {
    console.error('Gagal mengganti koleksi CBT di Firestore:', error);
    throw error;
  }
}

/**
 * Mengambil seluruh paket ujian CBT dari koleksi 'cbt_exams' di Firestore.
 */
export async function fetchCbtExamsFromFirestore(): Promise<CBTExam[]> {
  try {
    const snapshot = await getDocs(collection(db, CBT_EXAMS_COLLECTION));
    const rawList: Array<CBTExam & { orderIndex?: number; updatedAt?: string }> = [];
    snapshot.forEach((docSnap) => {
      rawList.push({ ...(docSnap.data() as CBTExam), id: docSnap.id });
    });
    return sortCbtExamsOrder(rawList);
  } catch (error) {
    console.error('Gagal mengambil paket CBT dari Firestore:', error);
    return [];
  }
}

/**
 * Memasang real-time onSnapshot listener untuk koleksi 'cbt_exams' di Firestore.
 */
export function subscribeToCbtExamsCollection(
  onUpdate: (exams: CBTExam[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const colRef = collection(db, CBT_EXAMS_COLLECTION);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const rawList: Array<CBTExam & { orderIndex?: number; updatedAt?: string }> = [];
        snapshot.forEach((docSnap) => {
          rawList.push({ ...(docSnap.data() as CBTExam), id: docSnap.id });
        });
        onUpdate(sortCbtExamsOrder(rawList));
      },
      (error) => {
        console.warn('CBT exams onSnapshot listener info:', error?.message);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.warn('Gagal memasang listener cbt_exams:', error);
    return () => {};
  }
}
