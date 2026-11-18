import { CBTQuestion, TKAQuestion } from '../types';
import { notifyStorageMutation } from './storage';

export const CBT_EXAM_DRAFT_STORAGE_KEY = 'sekolahku_student_exam_drafts_v1';
export const TKA_EXAM_DRAFT_STORAGE_KEY = 'sekolahku_tka_exam_drafts_v1';

export interface QuestionOrderSnapshot {
  id: string;
  opsi?: string[];
}

export interface StudentExamDraft {
  studentId: string;
  examId: string;
  category: 'cbt' | 'tka';
  judul: string;
  mapel: string;
  paketName: string;
  selectedPaketFilter: string;
  selectedMapelFilter: string;
  currentQIndex: number;
  answers: Record<string, any>;
  timeLeft: number;
  totalSeconds: number;
  runningQuestionOrder: QuestionOrderSnapshot[];
  isActiveSession: boolean;
  updatedAt: string;
}

interface StudentExamDraftBucket {
  lastActiveExamId?: string;
  lastActiveCategory?: 'cbt' | 'tka';
  draftsByExam: Record<string, StudentExamDraft>;
}

export interface TKAExamRoomDraft {
  studentId: string;
  paketName: string;
  mapelName: string | null;
  currentQuestionIdx: number;
  studentAnswers: Record<string, any>;
  raguChecks: Record<string, boolean>;
  examTimerSeconds: number;
  activeExamDurationSeconds: number;
  runningQuestionOrder: QuestionOrderSnapshot[];
  isActiveSession: boolean;
  updatedAt: string;
}

interface TKAExamRoomDraftBucket {
  lastActiveKey?: string;
  draftsByKey: Record<string, TKAExamRoomDraft>;
}

let lastCloudSyncPingAt = 0;

const notifyDraftMutation = (storageKey: string, immediate: boolean) => {
  const now = Date.now();
  if (immediate || now - lastCloudSyncPingAt >= 12000) {
    lastCloudSyncPingAt = now;
    notifyStorageMutation(storageKey);
  }
};

export const isQuestionAnswerFilled = (val: any): boolean => {
  if (val === undefined || val === null || val === '') return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object') {
    if ('key' in val || 'text' in val) {
      return Boolean(val.key || val.text);
    }
    return Object.values(val).some((v) => String(v ?? '').trim().length > 0);
  }
  return String(val).trim().length > 0;
};

export const countAnsweredQuestions = (answers: Record<string, any>): number => {
  if (!answers) return 0;
  return Object.values(answers).filter(isQuestionAnswerFilled).length;
};

export const buildQuestionOrderSnapshot = (
  list: Array<{ id: string; opsi?: string[] }>
): QuestionOrderSnapshot[] => {
  return list.map((q) => ({
    id: q.id,
    ...(q.opsi && q.opsi.length > 0 ? { opsi: [...q.opsi] } : {}),
  }));
};

export const restoreQuestionsFromSnapshot = <T extends CBTQuestion | TKAQuestion>(
  catalogQuestions: T[],
  snapshot: QuestionOrderSnapshot[]
): T[] => {
  if (!snapshot || snapshot.length === 0) return [...catalogQuestions];
  const mapById = new Map<string, T>();
  catalogQuestions.forEach((q) => mapById.set(q.id, q));

  const restored: T[] = [];
  const usedIds = new Set<string>();

  snapshot.forEach((snap) => {
    const found = mapById.get(snap.id);
    if (found) {
      usedIds.add(found.id);
      restored.push({
        ...found,
        ...(snap.opsi && snap.opsi.length > 0 ? { opsi: [...snap.opsi] } : {}),
      });
    }
  });

  // Sertakan soal tambahan jika guru baru menambahkan soal setelah draft dibuat
  catalogQuestions.forEach((q) => {
    if (!usedIds.has(q.id)) {
      restored.push(q);
    }
  });

  return restored;
};

// ============================================================================
// 1. STUDENT DASHBOARD EXAM DRAFTS (CBT & TKA PORTAL SISWA)
// ============================================================================

const readAllStudentDraftBuckets = (): Record<string, StudentExamDraftBucket> => {
  try {
    const raw = localStorage.getItem(CBT_EXAM_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeAllStudentDraftBuckets = (
  buckets: Record<string, StudentExamDraftBucket>,
  immediateSync: boolean
) => {
  try {
    localStorage.setItem(CBT_EXAM_DRAFT_STORAGE_KEY, JSON.stringify(buckets));
    notifyDraftMutation(CBT_EXAM_DRAFT_STORAGE_KEY, immediateSync);
  } catch (err) {
    console.warn('Gagal menyimpan draft ujian siswa ke localStorage:', err);
  }
};

export const saveStudentExamDraft = (
  draft: StudentExamDraft,
  options?: { immediateSync?: boolean }
) => {
  if (!draft.studentId || !draft.examId) return;
  const buckets = readAllStudentDraftBuckets();
  const bucket: StudentExamDraftBucket = buckets[draft.studentId] || { draftsByExam: {} };
  bucket.draftsByExam = {
    ...(bucket.draftsByExam || {}),
    [draft.examId]: {
      ...draft,
      updatedAt: new Date().toISOString(),
    },
  };
  if (draft.isActiveSession) {
    bucket.lastActiveExamId = draft.examId;
    bucket.lastActiveCategory = draft.category;
  }
  buckets[draft.studentId] = bucket;
  writeAllStudentDraftBuckets(buckets, Boolean(options?.immediateSync));
};

export const markStudentExamSessionPaused = (studentId: string, examId: string) => {
  if (!studentId || !examId) return;
  const buckets = readAllStudentDraftBuckets();
  const bucket = buckets[studentId];
  if (!bucket || !bucket.draftsByExam?.[examId]) return;
  bucket.draftsByExam[examId] = {
    ...bucket.draftsByExam[examId],
    isActiveSession: false,
    updatedAt: new Date().toISOString(),
  };
  if (bucket.lastActiveExamId === examId) {
    delete bucket.lastActiveExamId;
    delete bucket.lastActiveCategory;
  }
  writeAllStudentDraftBuckets(buckets, true);
};

export const getStudentExamDraftById = (
  studentId: string,
  examId: string
): StudentExamDraft | null => {
  if (!studentId || !examId) return null;
  const buckets = readAllStudentDraftBuckets();
  return buckets[studentId]?.draftsByExam?.[examId] || null;
};

export const getLastActiveStudentExamDraft = (
  studentId: string,
  category?: 'cbt' | 'tka'
): StudentExamDraft | null => {
  if (!studentId) return null;
  const buckets = readAllStudentDraftBuckets();
  const bucket = buckets[studentId];
  if (!bucket || !bucket.draftsByExam) return null;

  if (bucket.lastActiveExamId) {
    const primary = bucket.draftsByExam[bucket.lastActiveExamId];
    if (primary && primary.isActiveSession && primary.timeLeft > 0) {
      if (!category || primary.category === category) {
        return primary;
      }
    }
  }

  // Fallback cari draft aktif terbaru sesuai kategori
  const candidates = Object.values(bucket.draftsByExam)
    .filter(
      (d) =>
        d &&
        d.isActiveSession &&
        d.timeLeft > 0 &&
        (!category || d.category === category)
    )
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  return candidates[0] || null;
};

export const clearStudentExamDraft = (studentId: string, examId: string) => {
  if (!studentId || !examId) return;
  const buckets = readAllStudentDraftBuckets();
  const bucket = buckets[studentId];
  if (!bucket) return;
  if (bucket.draftsByExam) {
    delete bucket.draftsByExam[examId];
  }
  if (bucket.lastActiveExamId === examId) {
    delete bucket.lastActiveExamId;
    delete bucket.lastActiveCategory;
  }
  writeAllStudentDraftBuckets(buckets, true);
};

// ============================================================================
// 2. TKA TAB EXAM ROOM DRAFTS (tes-tka-siswa DI TKATabs.tsx)
// ============================================================================

export const makeTkaRoomDraftKey = (paketName: string, mapelName?: string | null): string => {
  return `${paketName}__${mapelName && mapelName !== 'all' ? mapelName : 'ALL'}`;
};

const readAllTkaRoomDraftBuckets = (): Record<string, TKAExamRoomDraftBucket> => {
  try {
    const raw = localStorage.getItem(TKA_EXAM_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeAllTkaRoomDraftBuckets = (
  buckets: Record<string, TKAExamRoomDraftBucket>,
  immediateSync: boolean
) => {
  try {
    localStorage.setItem(TKA_EXAM_DRAFT_STORAGE_KEY, JSON.stringify(buckets));
    notifyDraftMutation(TKA_EXAM_DRAFT_STORAGE_KEY, immediateSync);
  } catch (err) {
    console.warn('Gagal menyimpan draft TKA ke localStorage:', err);
  }
};

export const saveTkaRoomDraft = (
  draft: TKAExamRoomDraft,
  options?: { immediateSync?: boolean }
) => {
  if (!draft.studentId || !draft.paketName) return;
  const key = makeTkaRoomDraftKey(draft.paketName, draft.mapelName);
  const buckets = readAllTkaRoomDraftBuckets();
  const bucket: TKAExamRoomDraftBucket = buckets[draft.studentId] || { draftsByKey: {} };
  bucket.draftsByKey = {
    ...(bucket.draftsByKey || {}),
    [key]: {
      ...draft,
      updatedAt: new Date().toISOString(),
    },
  };
  if (draft.isActiveSession) {
    bucket.lastActiveKey = key;
  }
  buckets[draft.studentId] = bucket;
  writeAllTkaRoomDraftBuckets(buckets, Boolean(options?.immediateSync));
};

export const getTkaRoomDraft = (
  studentId: string,
  paketName: string,
  mapelName?: string | null
): TKAExamRoomDraft | null => {
  if (!studentId || !paketName) return null;
  const key = makeTkaRoomDraftKey(paketName, mapelName);
  const buckets = readAllTkaRoomDraftBuckets();
  return buckets[studentId]?.draftsByKey?.[key] || null;
};

export const getLastActiveTkaRoomDraft = (studentId: string): TKAExamRoomDraft | null => {
  if (!studentId) return null;
  const buckets = readAllTkaRoomDraftBuckets();
  const bucket = buckets[studentId];
  if (!bucket || !bucket.draftsByKey) return null;
  if (bucket.lastActiveKey) {
    const primary = bucket.draftsByKey[bucket.lastActiveKey];
    if (primary && primary.isActiveSession && primary.examTimerSeconds > 0) {
      return primary;
    }
  }
  const candidates = Object.values(bucket.draftsByKey)
    .filter((d) => d && d.isActiveSession && d.examTimerSeconds > 0)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return candidates[0] || null;
};

export const clearTkaRoomDraft = (
  studentId: string,
  paketName: string,
  mapelName?: string | null
) => {
  if (!studentId || !paketName) return;
  const key = makeTkaRoomDraftKey(paketName, mapelName);
  const buckets = readAllTkaRoomDraftBuckets();
  const bucket = buckets[studentId];
  if (!bucket) return;
  if (bucket.draftsByKey) {
    delete bucket.draftsByKey[key];
  }
  if (bucket.lastActiveKey === key) {
    delete bucket.lastActiveKey;
  }
  writeAllTkaRoomDraftBuckets(buckets, true);
};
