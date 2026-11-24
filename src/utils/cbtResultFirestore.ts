import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { CBTExamResult, ExamResultsResetMeta } from '../types';
import { db } from './firebase';
import {
  filterExamResultsByResetMeta,
  getStoredCBTResults,
  getStoredExamResultsResetMeta,
  isTkaResultEntry,
  runWithoutStorageSync,
  safeSetLocalStorage,
  saveStoredCBTResults,
  saveStoredExamResultsResetMeta,
} from './storage';

export const CBT_RESULTS_COLLECTION = 'cbt_results';
export const PENDING_CBT_RESULTS_KEY = 'sekolahku_pending_cbt_results_v1';

const RETRY_DELAYS_MS = [500, 1000, 2000]; // 4 attempts total (initial + 3 retries)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function writeDocWithRetry(writeFn: () => Promise<void>): Promise<boolean> {
  const maxAttempts = RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await writeFn();
      return true;
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) {
        console.warn('Firestore write failed after exponential backoff retries:', err);
        return false;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  return false;
}

export function buildCbtResultDocId(examId: string, nisnOrStudentId: string): string {
  const cleanExam = String(examId || 'cbt_exam')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanStudent = String(nisnOrStudentId || 'siswa')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${cleanExam}_${cleanStudent}`.slice(0, 150);
}

function sanitizeCbtResultPayload(result: CBTExamResult): CBTExamResult {
  const safeAnswers =
    result.jawabanSiswa && typeof result.jawabanSiswa === 'object' ? result.jawabanSiswa : {};
  return {
    ...result,
    examId: String(result.examId || ''),
    studentId: String(result.studentId || result.nisn || 'siswa'),
    studentName: String(result.studentName || 'Siswa'),
    nisn: result.nisn ? String(result.nisn) : undefined,
    kelas: result.kelas ? String(result.kelas) : undefined,
    skor: Number.isFinite(Number(result.skor)) ? Number(result.skor) : 0,
    nilai: Number.isFinite(Number(result.nilai)) ? Number(result.nilai) : 0,
    waktuSelesai: String(result.waktuSelesai || ''),
    jawabanSiswa: safeAnswers,
    category: result.category || 'cbt',
    recordedAt:
      typeof result.recordedAt === 'number' && Number.isFinite(result.recordedAt)
        ? result.recordedAt
        : Date.now(),
    statusPengerjaan: result.statusPengerjaan || 'selesai',
    updatedAt: result.updatedAt || new Date().toISOString(),
  };
}

export function getPendingCbtResults(): CBTExamResult[] {
  try {
    const raw = localStorage.getItem(PENDING_CBT_RESULTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueuePendingCbtResult(result: CBTExamResult): void {
  try {
    const clean = sanitizeCbtResultPayload(result);
    const key = buildCbtResultDocId(clean.examId, clean.nisn || clean.studentId);
    const current = getPendingCbtResults().filter(
      (r) => buildCbtResultDocId(r.examId, r.nisn || r.studentId) !== key
    );
    safeSetLocalStorage(PENDING_CBT_RESULTS_KEY, JSON.stringify([clean, ...current]));
  } catch {
    // Ignore local storage errors
  }
}

export function removePendingCbtResult(docId: string): void {
  try {
    const current = getPendingCbtResults();
    const filtered = current.filter(
      (r) => buildCbtResultDocId(r.examId, r.nisn || r.studentId) !== docId
    );
    if (filtered.length === 0) {
      localStorage.removeItem(PENDING_CBT_RESULTS_KEY);
    } else if (filtered.length !== current.length) {
      safeSetLocalStorage(PENDING_CBT_RESULTS_KEY, JSON.stringify(filtered));
    }
  } catch {
    // Ignore
  }
}

export function clearPendingCbtResults(): void {
  try {
    localStorage.removeItem(PENDING_CBT_RESULTS_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Menyimpan hasil akhir ujian CBT ke dokumen Firestore terisolasi `cbt_results/{examId}_{nisn}`
 * dengan exponential backoff (4x percobaan) & antrean fallback offline.
 */
export async function saveCbtResultToFirestore(result: CBTExamResult): Promise<boolean> {
  const clean = sanitizeCbtResultPayload({
    ...result,
    statusPengerjaan: 'selesai',
    updatedAt: result.updatedAt || new Date().toISOString(),
  });
  const docId = buildCbtResultDocId(clean.examId, clean.nisn || clean.studentId);

  try {
    const meta = getStoredExamResultsResetMeta();
    if (meta?.deletedCbtKeys) {
      const legacyKey = `${clean.examId}::${clean.studentId}::${clean.recordedAt || 0}`;
      if (legacyKey in meta.deletedCbtKeys || docId in meta.deletedCbtKeys) {
        const nextDeleted = { ...meta.deletedCbtKeys };
        delete nextDeleted[legacyKey];
        delete nextDeleted[docId];
        const nextMeta: ExamResultsResetMeta = { ...meta, deletedCbtKeys: nextDeleted };
        runWithoutStorageSync(() => {
          saveStoredExamResultsResetMeta(nextMeta);
        });
      }
    }
  } catch {
    // Ignore reset meta cleanup warning
  }

  enqueuePendingCbtResult(clean);

  const ok = await writeDocWithRetry(async () => {
    const firestorePayload = Object.fromEntries(
      Object.entries({
        ...clean,
        docId,
        serverTime: serverTimestamp(),
      }).filter(([, v]) => v !== undefined)
    );
    await setDoc(doc(db, CBT_RESULTS_COLLECTION, docId), firestorePayload, { merge: true });
  });

  if (ok) {
    removePendingCbtResult(docId);
  }
  return ok;
}

/**
 * Checkpoint auto-save berkala saat siswa sedang mengerjakan ujian CBT (non-final).
 * Tidak menimpa hasil final jika status sudah 'selesai'.
 */
export async function savePeriodicCbtDraftToFirestore(params: {
  examId: string;
  studentId: string;
  nisn?: string;
  studentName: string;
  kelas?: string;
  mapel?: string;
  judul?: string;
  paketName?: string;
  jawabanSiswa: Record<string, any>;
  timeLeft: number;
  examStartTimestamp?: number;
}): Promise<void> {
  if (!params.examId || (!params.studentId && !params.nisn)) return;
  const docId = buildCbtResultDocId(params.examId, params.nisn || params.studentId);
  try {
    const payload = Object.fromEntries(
      Object.entries({
        docId,
        examId: params.examId,
        studentId: params.studentId,
        nisn: params.nisn || params.studentId,
        studentName: params.studentName,
        kelas: params.kelas || '',
        mapel: params.mapel || '',
        judul: params.judul || '',
        paketName: params.paketName || '',
        category: 'cbt',
        jawabanSiswa: params.jawabanSiswa || {},
        timeLeft: params.timeLeft,
        examStartTimestamp: params.examStartTimestamp,
        statusPengerjaan: 'sedang_mengerjakan',
        updatedAt: new Date().toISOString(),
        serverTime: serverTimestamp(),
      }).filter(([, v]) => v !== undefined)
    );
    await setDoc(doc(db, CBT_RESULTS_COLLECTION, docId), payload, { merge: true });
  } catch {
    // Checkpoint bersifat best-effort agar tidak mengganggu pengerjaan siswa
  }
}

export async function flushPendingCbtResultsToFirestore(): Promise<number> {
  const pending = getPendingCbtResults();
  if (pending.length === 0) return 0;

  let uploaded = 0;
  for (const item of pending) {
    const ok = await saveCbtResultToFirestore(item);
    if (ok) uploaded += 1;
  }
  return uploaded;
}

export async function deleteSingleCbtResultFromFirestore(params: {
  examId: string;
  studentId: string;
  nisn?: string;
}): Promise<boolean> {
  if (!params.examId) return false;
  const keysToTry = Array.from(
    new Set(
      [
        params.nisn ? buildCbtResultDocId(params.examId, params.nisn) : '',
        params.studentId ? buildCbtResultDocId(params.examId, params.studentId) : '',
      ].filter(Boolean)
    )
  );
  if (keysToTry.length === 0) return false;

  try {
    await Promise.allSettled(
      keysToTry.map(async (docId) => {
        removePendingCbtResult(docId);
        await deleteDoc(doc(db, CBT_RESULTS_COLLECTION, docId));
      })
    );
    return true;
  } catch (err) {
    console.warn('Gagal menghapus dokumen cbt_results di Firestore:', err);
    return false;
  }
}

export async function clearCbtResultsInFirestore(options?: {
  targetPaket?: string;
  targetMapel?: string;
}): Promise<boolean> {
  try {
    if (!options?.targetPaket && !options?.targetMapel) {
      clearPendingCbtResults();
    }
    const snap = await getDocs(collection(db, CBT_RESULTS_COLLECTION));
    const idsToDelete: string[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as any;
      if (options?.targetPaket && options.targetPaket !== 'all') {
        if ((data?.paketName || '') !== options.targetPaket) return;
      }
      if (options?.targetMapel && options.targetMapel !== 'all') {
        if ((data?.mapel || '') !== options.targetMapel) return;
      }
      idsToDelete.push(docSnap.id);
    });

    if (idsToDelete.length > 0) {
      const CHUNK = 350;
      for (let i = 0; i < idsToDelete.length; i += CHUNK) {
        const batch = writeBatch(db);
        idsToDelete.slice(i, i + CHUNK).forEach((id) => {
          batch.delete(doc(db, CBT_RESULTS_COLLECTION, id));
        });
        await batch.commit();
      }
    }
    return true;
  } catch (err) {
    console.warn('Gagal membersihkan cbt_results di Firestore:', err);
    return false;
  }
}

/**
 * Menggabungkan hasil CBT dari koleksi terisolasi `cbt_results` + antrean pending + cache lokal.
 * Dokumen draft `statusPengerjaan === 'sedang_mengerjakan'` otomatis diabaikan dari rekap nilai akhir.
 */
export function mergeCbtResultsLists(
  baseList: CBTExamResult[],
  incomingList: CBTExamResult[]
): CBTExamResult[] {
  const map = new Map<string, CBTExamResult>();
  const keyOf = (r: CBTExamResult) => {
    if (isTkaResultEntry(r)) {
      return `tka::${r.examId}::${r.studentId}::${r.recordedAt || 0}`;
    }
    return buildCbtResultDocId(r.examId, r.nisn || r.studentId);
  };

  const upsertItem = (item: CBTExamResult) => {
    if (item.statusPengerjaan === 'sedang_mengerjakan') return;
    const key = keyOf(item);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
      return;
    }
    const prevTs = Number(prev.recordedAt || 0);
    const nextTs = Number(item.recordedAt || 0);
    const prevIso = prev.updatedAt || '';
    const nextIso = item.updatedAt || '';
    if (nextTs > prevTs || (nextTs === prevTs && nextIso >= prevIso)) {
      map.set(key, { ...prev, ...item });
    }
  };

  (Array.isArray(baseList) ? baseList : []).forEach(upsertItem);
  (Array.isArray(incomingList) ? incomingList : []).forEach(upsertItem);

  return Array.from(map.values()).sort(
    (a, b) => Number(b.recordedAt || 0) - Number(a.recordedAt || 0)
  );
}

export function subscribeToCbtResultsCollection(
  onUpdate: (results: CBTExamResult[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const colRef = collection(db, CBT_RESULTS_COLLECTION);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: CBTExamResult[] = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as any;
          if (!raw || raw.statusPengerjaan === 'sedang_mengerjakan') return;
          const { serverTime: _st, docId: _did, ...rest } = raw;
          list.push(rest as CBTExamResult);
        });
        const filtered = filterExamResultsByResetMeta(list);
        onUpdate(filtered);
      },
      (err) => {
        console.warn('cbt_results onSnapshot listener info:', err?.message);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('Gagal memasang listener cbt_results:', err);
    return () => {};
  }
}

export function applyMergedCbtResultsToLocal(cloudResults: CBTExamResult[]): CBTExamResult[] {
  const resetMeta = getStoredExamResultsResetMeta();
  const localCurrent = getStoredCBTResults();
  const pendingValid = filterExamResultsByResetMeta(getPendingCbtResults(), undefined, resetMeta);
  const cloudValid = filterExamResultsByResetMeta(cloudResults, undefined, resetMeta);
  const merged = mergeCbtResultsLists(
    localCurrent,
    mergeCbtResultsLists(cloudValid, pendingValid)
  );
  runWithoutStorageSync(() => {
    saveStoredCBTResults(merged);
  });
  return merged;
}
