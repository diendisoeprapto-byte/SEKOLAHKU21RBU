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
  QuerySnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { CBTExam, CBTQuestion } from '../types';
import { runWithoutStorageSync, saveStoredCBTExams, safeSetLocalStorage } from './storage';

export const CBT_EXAMS_COLLECTION = 'cbt_exams';
const SOAL_CHUNK_MARKER = '__soalchunk_';
const SAFE_EXAM_DOC_BYTES = 450_000;
const SAFE_CHUNK_BYTES = 350_000;

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

function getUtf8ByteLength(obj: unknown): number {
  const str = JSON.stringify(obj);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  return str.length * 2;
}

function partitionQuestionsIntoSafeChunks(questions: CBTQuestion[]): CBTQuestion[][] {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  const chunks: CBTQuestion[][] = [];
  let current: CBTQuestion[] = [];
  let currentBytes = 2;

  for (const q of questions) {
    const qBytes = getUtf8ByteLength(q) + 2;
    if (current.length > 0 && currentBytes + qBytes > SAFE_CHUNK_BYTES) {
      chunks.push(current);
      current = [q];
      currentBytes = 2 + qBytes;
    } else {
      current.push(q);
      currentBytes += qBytes;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

async function deleteChunkDocsRange(examId: string, fromIdx: number, toExclusive: number): Promise<void> {
  if (toExclusive <= fromIdx) return;
  const deletes: Promise<void>[] = [];
  for (let i = fromIdx; i < toExclusive; i++) {
    deletes.push(deleteDoc(doc(db, CBT_EXAMS_COLLECTION, `${examId}${SOAL_CHUNK_MARKER}${i}`)).catch(() => {}));
  }
  await Promise.all(deletes);
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
    .map(
      ({
        orderIndex: _oi,
        updatedAt: _ua,
        serverTime: _st,
        isSoalChunk: _isc,
        soalChunkCount: _scc,
        parentExamId: _pid,
        chunkIndex: _ci,
        ...ex
      }: any) => ex as CBTExam
    );
}

function assembleCbtExamsFromSnapshot(snapshot: QuerySnapshot<DocumentData>): CBTExam[] {
  const parents: Array<CBTExam & { orderIndex?: number; updatedAt?: string; soalChunkCount?: number }> = [];
  const chunksByParent = new Map<string, Array<{ chunkIndex: number; soalList: CBTQuestion[] }>>();

  snapshot.forEach((docSnap) => {
    const raw = docSnap.data() as any;
    const isChunk = raw?.isSoalChunk === true || docSnap.id.includes(SOAL_CHUNK_MARKER);
    if (isChunk) {
      const parentId = String(raw?.parentExamId || docSnap.id.split(SOAL_CHUNK_MARKER)[0] || '');
      const chunkIdx =
        typeof raw?.chunkIndex === 'number'
          ? raw.chunkIndex
          : Number(docSnap.id.split(SOAL_CHUNK_MARKER)[1] || 0);
      if (parentId) {
        const list = chunksByParent.get(parentId) || [];
        list.push({
          chunkIndex: Number.isFinite(chunkIdx) ? chunkIdx : 0,
          soalList: Array.isArray(raw?.soalList) ? (raw.soalList as CBTQuestion[]) : [],
        });
        chunksByParent.set(parentId, list);
      }
      return;
    }

    parents.push({ ...(raw as CBTExam), id: docSnap.id });
  });

  const assembled = parents.map((parent) => {
    const chunkEntries = chunksByParent.get(parent.id);
    if (
      chunkEntries &&
      chunkEntries.length > 0 &&
      ((parent.soalChunkCount && parent.soalChunkCount > 0) ||
        !Array.isArray(parent.soalList) ||
        parent.soalList.length === 0)
    ) {
      const mergedSoal = [...chunkEntries]
        .sort((a, b) => a.chunkIndex - b.chunkIndex)
        .flatMap((entry) => entry.soalList);
      return {
        ...parent,
        soalList: mergedSoal,
      };
    }
    return {
      ...parent,
      soalList: Array.isArray(parent.soalList) ? parent.soalList : [],
    };
  });

  return sortCbtExamsOrder(assembled);
}

/**
 * Menyimpan satu paket ujian CBT secara langsung dan real-time ke koleksi 'cbt_exams' di Firestore.
 * Secara otomatis memecah soalList ke dokumen chunk jika ukuran mendekati batas 1 MiB Firestore
 * agar mampu menampung 50+ butir soal per paket beserta gambar.
 */
export async function saveCbtExamToFirestore(
  exam: CBTExam,
  orderIndex?: number
): Promise<boolean> {
  try {
    const examId = sanitizeExamId(exam.id);
    const docRef = doc(db, CBT_EXAMS_COLLECTION, examId);
    const nowIso = new Date().toISOString();

    let prevChunkCount = 0;
    try {
      const prevSnap = await getDoc(docRef);
      if (prevSnap.exists()) {
        prevChunkCount = Number(prevSnap.data()?.soalChunkCount || 0);
      }
    } catch {
      prevChunkCount = 0;
    }

    const cleanExam = stripUndefinedDeep({
      ...exam,
      id: examId,
      ...(typeof orderIndex === 'number' ? { orderIndex } : {}),
      isSoalChunk: false,
      updatedAt: nowIso,
    });

    const byteSize = getUtf8ByteLength(cleanExam);

    if (byteSize <= SAFE_EXAM_DOC_BYTES) {
      await setDoc(
        docRef,
        {
          ...cleanExam,
          soalChunkCount: 0,
          serverTime: serverTimestamp(),
        },
        { merge: true }
      );
      if (prevChunkCount > 0) {
        await deleteChunkDocsRange(examId, 0, prevChunkCount);
      }
    } else {
      const chunks = partitionQuestionsIntoSafeChunks(cleanExam.soalList || []);
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = `${examId}${SOAL_CHUNK_MARKER}${i}`;
        const chunkDoc = stripUndefinedDeep({
          id: chunkId,
          isSoalChunk: true,
          parentExamId: examId,
          chunkIndex: i,
          soalList: chunks[i],
          updatedAt: nowIso,
        });
        await setDoc(doc(db, CBT_EXAMS_COLLECTION, chunkId), {
          ...chunkDoc,
          serverTime: serverTimestamp(),
        });
      }

      const { soalList: _omitted, ...headerWithoutSoal } = cleanExam;
      await setDoc(
        docRef,
        {
          ...headerWithoutSoal,
          soalList: [],
          soalChunkCount: chunks.length,
          serverTime: serverTimestamp(),
        },
        { merge: true }
      );

      if (prevChunkCount > chunks.length) {
        await deleteChunkDocsRange(examId, chunks.length, prevChunkCount);
      }
    }

    safeSetLocalStorage('sekolahku_cbt_exams_seeded', 'true');
    return true;
  } catch (error) {
    console.error(`Gagal menyimpan paket CBT ${exam.id} ke Firestore:`, error);
    return false;
  }
}

/**
 * Menghapus satu paket ujian CBT (beserta dokumen chunk soal jika ada) dari koleksi 'cbt_exams' di Firestore.
 */
export async function deleteCbtExamFromFirestore(examId: string): Promise<boolean> {
  try {
    const safeId = sanitizeExamId(examId);
    let prevChunkCount = 0;
    try {
      const prevSnap = await getDoc(doc(db, CBT_EXAMS_COLLECTION, safeId));
      if (prevSnap.exists()) {
        prevChunkCount = Number(prevSnap.data()?.soalChunkCount || 0);
      }
    } catch {
      prevChunkCount = 0;
    }

    await deleteDoc(doc(db, CBT_EXAMS_COLLECTION, safeId));
    if (prevChunkCount > 0) {
      await deleteChunkDocsRange(safeId, 0, prevChunkCount);
    }
    safeSetLocalStorage('sekolahku_cbt_exams_seeded', 'true');
    return true;
  } catch (error) {
    console.error(`Gagal menghapus paket CBT ${examId} dari Firestore:`, error);
    return false;
  }
}

/**
 * Menyimpan daftar paket ujian CBT ke koleksi 'cbt_exams' di Firestore dengan proteksi chunking otomatis.
 */
export async function saveCbtExamsBatchToFirestore(exams: CBTExam[]): Promise<boolean> {
  try {
    if (exams && exams.length > 0) {
      for (let i = 0; i < exams.length; i++) {
        const ok = await saveCbtExamToFirestore(exams[i], i);
        if (!ok) {
          return false;
        }
      }
    }
    safeSetLocalStorage('sekolahku_cbt_exams_seeded', 'true');
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
      const raw = docSnap.data() as any;
      const parentId = raw?.isSoalChunk ? String(raw?.parentExamId || '') : docSnap.id;
      if (!targetIds.has(docSnap.id) && !(parentId && targetIds.has(parentId))) {
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

    safeSetLocalStorage('sekolahku_cbt_exams_seeded', 'true');
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
    return assembleCbtExamsFromSnapshot(snapshot);
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
        onUpdate(assembleCbtExamsFromSnapshot(snapshot));
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
