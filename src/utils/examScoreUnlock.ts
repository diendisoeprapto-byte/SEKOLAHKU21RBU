import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  ActiveUser,
  CBTExam,
  CBTExamResult,
  TKAQuestion,
} from '../types';
import { db } from './firebase';
import { isEndiSoepraptoUser } from './sarahAttachments';
import { calculateTotalExamScore, evaluateStudentAnswer } from './scoreEvaluator';
import { computeExamHotsStats } from './examRanking';
import {
  buildCbtResultDocId,
  CBT_RESULTS_COLLECTION,
  removePendingCbtResult,
} from './cbtResultFirestore';

export const ALL_TKA_MAPEL_KEYS: TKAMapelScoreKey[] = [
  'Bahasa Indonesia',
  'Matematika',
  'IPAS',
  'Bahasa Inggris',
  'Koding dan Kecerdasan Artifisial (KKA)',
];
import {
  makeSubmissionDocId,
  removePendingTkaSubmission,
  TKA_SUBMISSIONS_COLLECTION,
} from './tkaFirestore';
import {
  deleteSingleCbtResultFromStorage,
  deleteSingleTkaSubmissionFromStorage,
  extractBaseTkaPaket,
  getActiveFilters,
  getStoredAssessments,
  getStoredCBTResults,
  getStoredExamResultsResetMeta,
  getStoredSubjectsForClass,
  getStoredTKAResults,
  getStoredTKASubmissions,
  isTkaResultEntry,
  markExamResultsResetMeta,
  normalizeTkaMapelKey,
  notifyStorageMutation,
  saveStoredAssessments,
  saveStoredCBTResults,
  saveStoredTKAResults,
  saveStoredTKASubmissions,
  TKAMapelScoreKey,
  TKASubmissionItem,
} from './storage';
import { clearStudentExamDraft } from './examDraft';
import {
  buildHasilUjianDocId,
  removeLocalHasilUjianCacheEntries,
} from './sarahExamAccess';
import { pushAllDataToCloud } from './cloudSync';

/**
 * Validasi hak akses ketat untuk Buka Kunci Nilai, Koreksi Ulang, & Hapus Nilai Terkunci.
 * Bernilai TRUE hanya untuk:
 * 1) Akun Admin / Super Admin (`role === 'admin'`), ATAU
 * 2) Akun guru yang nama lengkap / username-nya mengandung "Endi Soeprapto".
 */
export function canManageLockedScores(
  user?: Pick<ActiveUser, 'role' | 'username' | 'name'> | null
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'siswa' && isEndiSoepraptoUser(user)) return true;
  return false;
}

export const canUnlockScores = canManageLockedScores;

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const stripUndefined = (obj: Record<string, any>): Record<string, any> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const slugifyExamPart = (v: string): string =>
  String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const matchCbtExamForResult = (
  res: CBTExamResult,
  exams: CBTExam[]
): CBTExam | undefined => {
  const byId = exams.find((ex) => ex.id === res.examId && Array.isArray(ex.soalList) && ex.soalList.length > 0);
  if (byId) return byId;

  const mapelLower = String(res.mapel || '').trim().toLowerCase();
  const paketLower = String(res.paketName || res.judul || '').trim().toLowerCase();
  const kelasLower = String(res.kelas || '').trim().toLowerCase();

  const candidates = exams.filter((ex) => {
    if (!Array.isArray(ex.soalList) || ex.soalList.length === 0) return false;
    const exMapel = String(ex.mapel || '').trim().toLowerCase();
    const mapelOk =
      !mapelLower ||
      exMapel === mapelLower ||
      exMapel.includes(mapelLower) ||
      mapelLower.includes(exMapel);
    if (!mapelOk) return false;
    if (!paketLower) return true;
    const exPaket = String(ex.paketName || ex.subPaket || ex.judul || '').trim().toLowerCase();
    return (
      exPaket === paketLower ||
      exPaket.includes(paketLower) ||
      paketLower.includes(exPaket)
    );
  });

  if (candidates.length === 0) return undefined;
  return (
    candidates.find((c) => String(c.kelas || '').trim().toLowerCase() === kelasLower) ||
    candidates[0]
  );
};

const syncCbtScoresToAssessments = (entries: CBTExamResult[]): void => {
  if (entries.length === 0) return;
  try {
    const filters = getActiveFilters();
    const subjectMap: Record<string, string> = {
      'Pendidikan Agama Islam': 's_pabp_islam',
      'Pendidikan Pancasila': 's_pancasila',
      'Bahasa Indonesia': 's_bindonesia',
      'Matematika': 's_matematika',
      'Ilmu Pengetahuan Alam dan Sosial (IPAS)': 's_ipas',
      'Seni Rupa': 's_senirupa',
      'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)': 's_pjok',
      'Bahasa Inggris': 's_binggris',
      'Muatan Lokal (PLBJ)': 's_plbj',
      'Koding dan Kecerdasan Artifisial (KKA)': 's_k6_kka',
    };

    const grouped = new Map<string, CBTExamResult[]>();
    entries.forEach((entry) => {
      const cls = entry.kelas || 'Kelas 6A';
      const mapel = entry.mapel || '';
      const paket = entry.paketName || entry.judul || '';
      if (!mapel || !paket) return;
      const gKey = `${cls}::${mapel}::${paket}`;
      const arr = grouped.get(gKey) || [];
      arr.push(entry);
      grouped.set(gKey, arr);
    });

    grouped.forEach((groupEntries, gKey) => {
      const [cls, mapel, paket] = gKey.split('::');
      const normMapel = mapel.toLowerCase();
      const targetSubjects = getStoredSubjectsForClass(cls);
      const matchedSubject = targetSubjects.find((s) => {
        const sn = (s.name || '').toLowerCase();
        const sc = (s.code || '').toUpperCase();
        return (
          sn === normMapel ||
          sn.includes(normMapel) ||
          normMapel.includes(sn) ||
          ((normMapel.includes('koding') || normMapel.includes('kka')) &&
            (sc.startsWith('KKA') || sn.includes('koding') || sn.includes('kka')))
        );
      });
      const subId = matchedSubject?.id || subjectMap[mapel] || 's_bindonesia';
      const assessKey = `${filters.year}_${filters.semester}_${cls}_${subId}`;
      const existing = getStoredAssessments(assessKey);

      groupEntries.forEach((entry) => {
        if (!existing[entry.studentId]) {
          existing[entry.studentId] = { sumatif: {}, remedial: {}, asts: 0, asas: 0 };
        }
        const isRemedial = paket.toLowerCase().includes('remedial');
        if (paket.toUpperCase().includes('ASTS')) {
          existing[entry.studentId].asts = entry.nilai;
        } else if (paket.toUpperCase().includes('ASAS')) {
          existing[entry.studentId].asas = entry.nilai;
        } else {
          const asMatch = paket.match(/(?:Sumatif|Remedial|AS|UH)\s*(?:Inklusi\s*)?(\d+)/i);
          if (asMatch) {
            const idx = parseInt(asMatch[1], 10);
            if (isRemedial) {
              existing[entry.studentId].remedial[idx] = entry.nilai;
            } else {
              existing[entry.studentId].sumatif[idx] = entry.nilai;
            }
          }
        }
      });

      saveStoredAssessments(assessKey, existing);
    });
  } catch {
    // Non-critical assessment sync
  }
};

/**
 * OPSI A (CBT): Buka kunci sementara -> hitung ulang seluruh jawaban siswa menggunakan
 * kunci jawaban terbaru -> perbarui skor, nilai akhir, HOTS, & matriks -> kunci kembali.
 */
export async function unlockAndRecalculateCbtResults(params: {
  targets: CBTExamResult[];
  exams: CBTExam[];
  unlockedBy: string;
}): Promise<{
  updatedAllNonTkaResults: CBTExamResult[];
  recalculatedCount: number;
  skippedNoAnswersCount: number;
}> {
  const { targets, exams, unlockedBy } = params;
  const nowIso = new Date().toISOString();
  let recalculatedCount = 0;
  let skippedNoAnswersCount = 0;

  const updatedByKey = new Map<string, CBTExamResult>();

  for (const res of targets) {
    const docId = buildCbtResultDocId(res.examId, res.nisn || res.studentId);
    const linkedExam = matchCbtExamForResult(res, exams);
    const hasAnswers =
      res.jawabanSiswa &&
      typeof res.jawabanSiswa === 'object' &&
      Object.keys(res.jawabanSiswa).length > 0;

    let nextResult: CBTExamResult = {
      ...res,
      isLocked: true,
      isScoreLocked: true,
      isCompleted: true,
      hasAttempted: true,
      unlockedAndRecalculatedBy: unlockedBy,
      recalculatedAt: nowIso,
      updatedAt: nowIso,
    };

    if (linkedExam && linkedExam.soalList.length > 0 && hasAnswers) {
      const calc = calculateTotalExamScore(linkedExam.soalList, res.jawabanSiswa);
      const { benarHots, totalHots } = computeExamHotsStats(
        linkedExam.soalList,
        res.jawabanSiswa,
        (q, ans) => evaluateStudentAnswer(q, ans).isCorrect
      );
      nextResult = {
        ...nextResult,
        skor: calc.rawScore,
        nilai: calc.finalScore,
        benarHots,
        totalHots,
      };
      recalculatedCount++;
    } else {
      skippedNoAnswersCount++;
    }

    updatedByKey.set(docId, nextResult);
  }

  // Update Firestore via writeBatch
  const entriesToWrite = Array.from(updatedByKey.entries());
  for (const chunk of chunkArray(entriesToWrite, 300)) {
    try {
      const batch = writeBatch(db);
      chunk.forEach(([docId, item]) => {
        const payload = stripUndefined({
          ...item,
          docId,
          statusPengerjaan: 'selesai',
          serverTime: serverTimestamp(),
        });
        batch.set(doc(db, CBT_RESULTS_COLLECTION, docId), payload, { merge: true });
      });
      await batch.commit();
    } catch (err) {
      console.warn('[examScoreUnlock] Batch recalculate CBT warning:', err);
    }
  }

  // Sync local storage & state
  const currentAll = getStoredCBTResults();
  const mergedAll = currentAll.map((item) => {
    if (isTkaResultEntry(item)) return item;
    const docId = buildCbtResultDocId(item.examId, item.nisn || item.studentId);
    return updatedByKey.get(docId) || item;
  });

  saveStoredCBTResults(mergedAll);
  syncCbtScoresToAssessments(Array.from(updatedByKey.values()));
  notifyStorageMutation('sekolahku-cbt-results-updated');
  notifyStorageMutation('sekolahku-exam-results-updated');

  return {
    updatedAllNonTkaResults: mergedAll.filter((r) => !isTkaResultEntry(r)),
    recalculatedCount,
    skippedNoAnswersCount,
  };
}

/**
 * OPSI C (CBT): Buka kunci nilai agar Admin/Endi dapat mengubah nilai secara manual.
 */
export async function unlockCbtForManualEdit(params: {
  targets: CBTExamResult[];
  unlockedBy: string;
}): Promise<CBTExamResult[]> {
  const { targets, unlockedBy } = params;
  const nowIso = new Date().toISOString();
  const updatedByKey = new Map<string, CBTExamResult>();

  targets.forEach((res) => {
    const docId = buildCbtResultDocId(res.examId, res.nisn || res.studentId);
    updatedByKey.set(docId, {
      ...res,
      isLocked: false,
      isScoreLocked: false,
      unlockedAt: nowIso,
      unlockedAndRecalculatedBy: unlockedBy,
      updatedAt: nowIso,
    });
  });

  for (const chunk of chunkArray(Array.from(updatedByKey.entries()), 300)) {
    try {
      const batch = writeBatch(db);
      chunk.forEach(([docId, item]) => {
        batch.set(
          doc(db, CBT_RESULTS_COLLECTION, docId),
          stripUndefined({
            ...item,
            docId,
            serverTime: serverTimestamp(),
          }),
          { merge: true }
        );
      });
      await batch.commit();
    } catch (err) {
      console.warn('[examScoreUnlock] Batch unlock manual CBT warning:', err);
    }
  }

  const currentAll = getStoredCBTResults();
  const mergedAll = currentAll.map((item) => {
    if (isTkaResultEntry(item)) return item;
    const docId = buildCbtResultDocId(item.examId, item.nisn || item.studentId);
    return updatedByKey.get(docId) || item;
  });
  saveStoredCBTResults(mergedAll);
  notifyStorageMutation('sekolahku-cbt-results-updated');
  notifyStorageMutation('sekolahku-exam-results-updated');
  return mergedAll.filter((r) => !isTkaResultEntry(r));
}

/**
 * OPSI B (CBT): Buka kunci & hapus nilai dari Firestore (`cbt_results` & `hasil_ujian`)
 * serta penyimpanan lokal agar siswa dapat langsung mengerjakan ujian ulang.
 */
export async function unlockAndDeleteCbtForReexam(params: {
  targets: CBTExamResult[];
  unlockedBy: string;
}): Promise<CBTExamResult[]> {
  const { targets, unlockedBy } = params;
  const hasilDocIdsToClear: string[] = [];
  const docRefsToDelete: Array<{ col: string; id: string }> = [];

  targets.forEach((res) => {
    const docIdByNisn = res.nisn ? buildCbtResultDocId(res.examId, res.nisn) : '';
    const docIdByStudentId = res.studentId ? buildCbtResultDocId(res.examId, res.studentId) : '';
    if (docIdByNisn) {
      docRefsToDelete.push({ col: CBT_RESULTS_COLLECTION, id: docIdByNisn });
      removePendingCbtResult(docIdByNisn);
    }
    if (docIdByStudentId && docIdByStudentId !== docIdByNisn) {
      docRefsToDelete.push({ col: CBT_RESULTS_COLLECTION, id: docIdByStudentId });
      removePendingCbtResult(docIdByStudentId);
    }

    const h1 = res.nisn ? buildHasilUjianDocId(res.nisn, res.examId) : '';
    const h2 = res.studentId ? buildHasilUjianDocId(res.studentId, res.examId) : '';
    if (h1) {
      docRefsToDelete.push({ col: 'hasil_ujian', id: h1 });
      hasilDocIdsToClear.push(h1);
    }
    if (h2 && h2 !== h1) {
      docRefsToDelete.push({ col: 'hasil_ujian', id: h2 });
      hasilDocIdsToClear.push(h2);
    }

    if (res.studentId && res.examId) {
      clearStudentExamDraft(res.studentId, res.examId);
    }
  });

  removeLocalHasilUjianCacheEntries(hasilDocIdsToClear);

  // Batch delete in Firestore
  for (const chunk of chunkArray(docRefsToDelete, 300)) {
    try {
      const batch = writeBatch(db);
      chunk.forEach(({ col, id }) => {
        batch.delete(doc(db, col, id));
      });
      await batch.commit();
    } catch (err) {
      console.warn('[examScoreUnlock] Batch delete CBT for re-exam warning:', err);
    }
  }

  // Delete locally & record deletion log + reset meta
  let remainingAll = getStoredCBTResults();
  targets.forEach((res) => {
    remainingAll = deleteSingleCbtResultFromStorage({
      examId: res.examId,
      studentId: res.studentId,
      recordedAt: res.recordedAt,
      tanggal: res.tanggal,
      waktuSelesai: res.waktuSelesai,
      studentName: res.studentName,
      mapel: res.mapel,
      paketName: res.paketName,
    });
  });

  pushAllDataToCloud({ examResultsResetMeta: getStoredExamResultsResetMeta() }, unlockedBy);
  notifyStorageMutation('sekolahku-cbt-results-updated');
  notifyStorageMutation('sekolahku-exam-results-updated');

  return remainingAll.filter((r) => !isTkaResultEntry(r));
}

const resolveTargetTkaMapelSet = (
  targetMapels?: string[],
  targetMapel?: string
): Set<TKAMapelScoreKey> | null => {
  if (Array.isArray(targetMapels) && targetMapels.length > 0) {
    const cleaned = targetMapels
      .map((m) => String(m || '').trim())
      .filter((m) => m !== '' && m !== 'all')
      .map((m) => normalizeTkaMapelKey(m));
    if (cleaned.length > 0) {
      return new Set(cleaned);
    }
  }
  if (targetMapel && targetMapel !== 'all') {
    return new Set([normalizeTkaMapelKey(targetMapel)]);
  }
  return null;
};

export const getEffectiveCompletedTkaMapels = (
  sub: TKASubmissionItem
): TKAMapelScoreKey[] => {
  const seen = new Set<TKAMapelScoreKey>();
  if (Array.isArray(sub.completedMapels)) {
    sub.completedMapels.forEach((m) => {
      if (String(m || '').trim()) seen.add(normalizeTkaMapelKey(m));
    });
  }
  if (sub.lockedMapels && typeof sub.lockedMapels === 'object') {
    Object.keys(sub.lockedMapels).forEach((m) => {
      if (String(m || '').trim()) seen.add(normalizeTkaMapelKey(m));
    });
  }
  if (sub.scoresPerMapel && typeof sub.scoresPerMapel === 'object') {
    ALL_TKA_MAPEL_KEYS.forEach((k) => {
      if (Number(sub.scoresPerMapel?.[k] || 0) > 0) {
        seen.add(k);
      }
    });
  }
  return ALL_TKA_MAPEL_KEYS.filter((k) => seen.has(k));
};

const getTkaQuestionsForPaketAndMapel = (
  allQuestions: TKAQuestion[],
  basePaket: string,
  mapelKey: TKAMapelScoreKey
): TKAQuestion[] => {
  const cleanPaket = basePaket.trim().toLowerCase();
  const exact = allQuestions.filter(
    (q) =>
      String(q.jenisTka || '').trim().toLowerCase() === cleanPaket &&
      normalizeTkaMapelKey(q.mapel) === mapelKey
  );
  if (exact.length > 0) return exact;
  return allQuestions.filter((q) => normalizeTkaMapelKey(q.mapel) === mapelKey);
};

/**
 * OPSI A (TKA): Buka kunci sementara -> evaluasi ulang seluruh jawaban tersimpan siswa
 * terhadap kunci jawaban soal TKA terbaru -> perbarui nilai per mapel, skor total, HOTS,
 * dan matriks -> kunci kembali via writeBatch Firestore.
 */
export async function unlockAndRecalculateTkaSubmissions(params: {
  targets: TKASubmissionItem[];
  tkaQuestions: TKAQuestion[];
  unlockedBy: string;
  targetMapel?: string;
  targetMapels?: string[];
}): Promise<{
  updatedAllSubmissions: TKASubmissionItem[];
  recalculatedCount: number;
  skippedNoAnswersCount: number;
}> {
  const { targets, tkaQuestions, unlockedBy, targetMapel, targetMapels } = params;
  const nowIso = new Date().toISOString();
  const filterMapelSet = resolveTargetTkaMapelSet(targetMapels, targetMapel);

  let recalculatedCount = 0;
  let skippedNoAnswersCount = 0;
  const updatedMap = new Map<string, TKASubmissionItem>();

  targets.forEach((sub) => {
    const basePaket = sub.paketDasar || extractBaseTkaPaket(sub.paket);
    const answers = sub.answers || {};
    const nextScores = {
      'Bahasa Indonesia': Number(sub.scoresPerMapel?.['Bahasa Indonesia'] ?? 0),
      'Matematika': Number(sub.scoresPerMapel?.['Matematika'] ?? 0),
      'IPAS': Number(sub.scoresPerMapel?.['IPAS'] ?? 0),
      'Bahasa Inggris': Number(sub.scoresPerMapel?.['Bahasa Inggris'] ?? 0),
      'Koding dan Kecerdasan Artifisial (KKA)': Number(
        sub.scoresPerMapel?.['Koding dan Kecerdasan Artifisial (KKA)'] ?? 0
      ),
    };
    const nextLockedMapels: NonNullable<TKASubmissionItem['lockedMapels']> = {
      ...(sub.lockedMapels || {}),
    };
    const nextCompletedSet = new Set<string>(
      Array.isArray(sub.completedMapels) ? sub.completedMapels : []
    );
    const nextHotsByMapel: Record<string, { benar: number; total: number }> = {
      ...((sub as any).hotsByMapel || {}),
    };

    let subHadRecalculation = false;

    ALL_TKA_MAPEL_KEYS.forEach((mKey) => {
      if (filterMapelSet && !filterMapelSet.has(mKey)) return;
      const mapelQs = getTkaQuestionsForPaketAndMapel(tkaQuestions, basePaket, mKey);
      if (mapelQs.length === 0) return;

      const hasMapelAnswers = mapelQs.some((q) => {
        const val = answers[q.id];
        if (val === undefined || val === null) return false;
        if (typeof val === 'string') return val.trim() !== '';
        if (Array.isArray(val)) return val.length > 0;
        if (typeof val === 'object') return Object.keys(val).length > 0;
        return true;
      });

      if (!hasMapelAnswers) return;

      const calc = calculateTotalExamScore(mapelQs, answers);
      const hots = computeExamHotsStats(
        mapelQs,
        answers,
        (q, ans) => evaluateStudentAnswer(q, ans).isCorrect
      );

      nextScores[mKey] = calc.finalScore;
      nextCompletedSet.add(mKey);
      nextHotsByMapel[mKey] = { benar: hots.benarHots, total: hots.totalHots };
      nextLockedMapels[mKey] = {
        score: calc.finalScore,
        waktuTerkunci: sub.lockedMapels?.[mKey]?.waktuTerkunci || sub.waktuTerkunci || nowIso,
        sumberNilai: 'UJIAN_TKA',
      };
      subHadRecalculation = true;
    });

    if (subHadRecalculation) {
      recalculatedCount++;
    } else {
      skippedNoAnswersCount++;
    }

    const completedList = Array.from(nextCompletedSet);
    const keysForAvg: TKAMapelScoreKey[] =
      completedList.length > 0
        ? (completedList.map((m) => normalizeTkaMapelKey(m)) as TKAMapelScoreKey[])
        : ALL_TKA_MAPEL_KEYS.filter((k) => Number(nextScores[k] || 0) > 0);
    const uniqueAvgKeys = Array.from(new Set(keysForAvg));
    const skorTotal =
      uniqueAvgKeys.length > 0
        ? Math.round(
            uniqueAvgKeys.reduce((acc, k) => acc + Number(nextScores[k] || 0), 0) /
              uniqueAvgKeys.length
          )
        : Number(sub.skorTotal || 0);
    const predikat: 'A' | 'B' | 'C' | 'D' =
      skorTotal >= 88 ? 'A' : skorTotal >= 78 ? 'B' : skorTotal >= 68 ? 'C' : 'D';
    const status: 'Tuntas' | 'Remedial' = skorTotal >= 75 ? 'Tuntas' : 'Remedial';

    const hasHotsMap = Object.keys(nextHotsByMapel).length > 0;
    const benarHots = hasHotsMap
      ? Object.values(nextHotsByMapel).reduce((acc, v) => acc + (Number(v?.benar) || 0), 0)
      : Number(sub.benarHots || 0);
    const totalHots = hasHotsMap
      ? Object.values(nextHotsByMapel).reduce((acc, v) => acc + (Number(v?.total) || 0), 0)
      : Number(sub.totalHots || 0);

    const docId = makeSubmissionDocId(sub.studentId, basePaket, sub.id);
    const updatedSub: TKASubmissionItem = {
      ...sub,
      id: docId,
      completedMapels: completedList,
      scoresPerMapel: nextScores,
      skorTotal,
      predikat,
      status,
      benarHots,
      totalHots,
      ...(hasHotsMap ? { hotsByMapel: nextHotsByMapel } : {}),
      lockedMapels: nextLockedMapels,
      isLocked: Object.keys(nextLockedMapels).length > 0 || sub.isLocked,
      isScoreLocked: Object.keys(nextLockedMapels).length > 0 || sub.isLocked,
      isCompleted: true,
      hasAttempted: true,
      unlockedAndRecalculatedBy: unlockedBy,
      recalculatedAt: nowIso,
      updatedAt: nowIso,
    } as TKASubmissionItem;

    updatedMap.set(docId, updatedSub);
  });

  // Persist to Firestore using writeBatch (without merge on lockedMapels to keep clean map)
  for (const chunk of chunkArray(Array.from(updatedMap.entries()), 250)) {
    try {
      const batch = writeBatch(db);
      chunk.forEach(([docId, item]) => {
        batch.set(
          doc(db, TKA_SUBMISSIONS_COLLECTION, docId),
          stripUndefined({
            ...item,
            serverTime: serverTimestamp(),
          })
        );
      });
      await batch.commit();
    } catch (err) {
      console.warn('[examScoreUnlock] Batch recalculate TKA warning:', err);
    }
  }

  const currentSubs = getStoredTKASubmissions();
  const mergedSubs = currentSubs.map((s) => {
    const basePaket = s.paketDasar || extractBaseTkaPaket(s.paket);
    const docId = makeSubmissionDocId(s.studentId, basePaket, s.id);
    return updatedMap.get(s.id) || updatedMap.get(docId) || s;
  });
  saveStoredTKASubmissions(mergedSubs);

  return {
    updatedAllSubmissions: mergedSubs,
    recalculatedCount,
    skippedNoAnswersCount,
  };
}

/**
 * OPSI C (TKA): Membuka kunci pengeditan manual (`lockedMapels` / `isLocked`) pada TKA
 * agar Admin/Endi dapat mengubah nilai langsung melalui Edit Manual.
 */
export async function unlockTkaForManualEdit(params: {
  targets: TKASubmissionItem[];
  unlockedBy: string;
  targetMapel?: string;
  targetMapels?: string[];
}): Promise<TKASubmissionItem[]> {
  const { targets, unlockedBy, targetMapel, targetMapels } = params;
  const nowIso = new Date().toISOString();
  const filterMapelSet = resolveTargetTkaMapelSet(targetMapels, targetMapel);

  const updatedMap = new Map<string, TKASubmissionItem>();

  targets.forEach((sub) => {
    const basePaket = sub.paketDasar || extractBaseTkaPaket(sub.paket);
    const docId = makeSubmissionDocId(sub.studentId, basePaket, sub.id);
    const nextLockedMapels: NonNullable<TKASubmissionItem['lockedMapels']> = {
      ...(sub.lockedMapels || {}),
    };

    if (filterMapelSet) {
      filterMapelSet.forEach((mKey) => {
        delete nextLockedMapels[mKey];
      });
    } else {
      Object.keys(nextLockedMapels).forEach((k) => delete nextLockedMapels[k]);
    }

    const stillLockedAny = Object.values(nextLockedMapels).some(
      (v) => v?.sumberNilai === 'UJIAN_TKA'
    );

    const updatedSub: TKASubmissionItem = {
      ...sub,
      id: docId,
      lockedMapels: nextLockedMapels,
      isLocked: stillLockedAny,
      isScoreLocked: stillLockedAny,
      sumberNilai: stillLockedAny ? 'UJIAN_TKA' : 'INPUT_MANUAL',
      unlockedAt: nowIso,
      unlockedAndRecalculatedBy: unlockedBy,
      updatedAt: nowIso,
    };
    updatedMap.set(docId, updatedSub);
  });

  // Overwrite document cleanly so deleted keys inside `lockedMapels` are removed in Firestore
  for (const chunk of chunkArray(Array.from(updatedMap.entries()), 250)) {
    try {
      const batch = writeBatch(db);
      chunk.forEach(([docId, item]) => {
        batch.set(
          doc(db, TKA_SUBMISSIONS_COLLECTION, docId),
          stripUndefined({
            ...item,
            serverTime: serverTimestamp(),
          })
        );
      });
      await batch.commit();
    } catch (err) {
      console.warn('[examScoreUnlock] Batch unlock manual TKA warning:', err);
    }
  }

  const currentSubs = getStoredTKASubmissions();
  const mergedSubs = currentSubs.map((s) => {
    const basePaket = s.paketDasar || extractBaseTkaPaket(s.paket);
    const docId = makeSubmissionDocId(s.studentId, basePaket, s.id);
    return updatedMap.get(s.id) || updatedMap.get(docId) || s;
  });
  saveStoredTKASubmissions(mergedSubs);
  return mergedSubs;
}

/**
 * OPSI B (TKA): Buka kunci & hapus nilai TKA siswa dari Firestore & localStorage
 * agar siswa dapat kembali mengerjakan ujian TKA pada paket/mapel tersebut (ujian ulang).
 */
export async function unlockAndDeleteTkaForReexam(params: {
  targets: TKASubmissionItem[];
  tkaQuestions: TKAQuestion[];
  unlockedBy: string;
  targetMapel?: string;
  targetMapels?: string[];
}): Promise<TKASubmissionItem[]> {
  const { targets, tkaQuestions, unlockedBy, targetMapel, targetMapels } = params;
  const nowIso = new Date().toISOString();
  const filterMapelSet = resolveTargetTkaMapelSet(targetMapels, targetMapel);

  const docsToDelete: Array<{ col: string; id: string }> = [];
  const docsToOverwrite: Array<{ id: string; item: TKASubmissionItem }> = [];
  const fullDeleteSubs: TKASubmissionItem[] = [];
  const partialDeleteSubs: TKASubmissionItem[] = [];
  const hasilDocIdsToClear: string[] = [];

  targets.forEach((sub) => {
    const basePaket = sub.paketDasar || extractBaseTkaPaket(sub.paket);
    const docId = makeSubmissionDocId(sub.studentId, basePaket, sub.id);
    const effectiveCompleted = getEffectiveCompletedTkaMapels(sub);

    // Bersihkan cache hasil_ujian & draft siswa lokal hanya untuk mapel yang dipilih
    const mapelsToReset: TKAMapelScoreKey[] = filterMapelSet
      ? Array.from(filterMapelSet)
      : effectiveCompleted.length > 0
      ? effectiveCompleted
      : ALL_TKA_MAPEL_KEYS;

    mapelsToReset.forEach((mKey) => {
      const idUjian = `tka_live_${slugifyExamPart(basePaket)}_${slugifyExamPart(mKey)}`;
      const h1 = sub.nisn ? buildHasilUjianDocId(sub.nisn, idUjian) : '';
      const h2 = sub.studentId ? buildHasilUjianDocId(sub.studentId, idUjian) : '';
      if (h1) {
        docsToDelete.push({ col: 'hasil_ujian', id: h1 });
        hasilDocIdsToClear.push(h1);
      }
      if (h2 && h2 !== h1) {
        docsToDelete.push({ col: 'hasil_ujian', id: h2 });
        hasilDocIdsToClear.push(h2);
      }
      // Bersihkan draft jika ada di perangkat yang sama
      clearStudentExamDraft(sub.studentId, `tka_${basePaket}_${mKey}`);
    });

    const remainingCompleted = filterMapelSet
      ? effectiveCompleted.filter((m) => !filterMapelSet.has(m))
      : [];

    if (!filterMapelSet || remainingCompleted.length === 0) {
      // Hapus dokumen TKA submission secara penuh
      fullDeleteSubs.push(sub);
      docsToDelete.push({ col: TKA_SUBMISSIONS_COLLECTION, id: docId });
      if (sub.id && sub.id !== docId) {
        docsToDelete.push({ col: TKA_SUBMISSIONS_COLLECTION, id: sub.id });
      }
      removePendingTkaSubmission(docId);
      if (sub.id) removePendingTkaSubmission(sub.id);
    } else {
      // Hapus spesifik mapel yang dipilih, pertahankan mata pelajaran lain pada paket yang sama
      partialDeleteSubs.push(sub);
      const nextScores = { ...sub.scoresPerMapel };
      const nextLockedMapels = { ...(sub.lockedMapels || {}) };
      const nextHotsByMapel: Record<string, { benar: number; total: number }> = {
        ...((sub as any).hotsByMapel || {}),
      };
      const nextAnswers = { ...(sub.answers || {}) };

      filterMapelSet.forEach((mKey) => {
        nextScores[mKey] = 0;
        delete nextLockedMapels[mKey];
        delete nextHotsByMapel[mKey];
        const mapelQuestionIds = new Set(
          getTkaQuestionsForPaketAndMapel(tkaQuestions, basePaket, mKey).map((q) => q.id)
        );
        mapelQuestionIds.forEach((qid) => {
          delete nextAnswers[qid];
        });
      });

      const skorTotal =
        remainingCompleted.length > 0
          ? Math.round(
              remainingCompleted.reduce((acc, k) => acc + Number(nextScores[k] || 0), 0) /
                remainingCompleted.length
            )
          : 0;
      const predikat: 'A' | 'B' | 'C' | 'D' =
        skorTotal >= 88 ? 'A' : skorTotal >= 78 ? 'B' : skorTotal >= 68 ? 'C' : 'D';
      const status: 'Tuntas' | 'Remedial' = skorTotal >= 75 ? 'Tuntas' : 'Remedial';
      const stillLocked = Object.values(nextLockedMapels).some(
        (v) => v?.sumberNilai === 'UJIAN_TKA'
      );

      const remainingHotsEntries = Object.values(nextHotsByMapel);
      const benarHots =
        remainingHotsEntries.length > 0
          ? remainingHotsEntries.reduce((acc, v) => acc + (Number(v?.benar) || 0), 0)
          : 0;
      const totalHots =
        remainingHotsEntries.length > 0
          ? remainingHotsEntries.reduce((acc, v) => acc + (Number(v?.total) || 0), 0)
          : 0;

      const updatedSub: TKASubmissionItem = {
        ...sub,
        id: docId,
        completedMapels: remainingCompleted,
        answers: nextAnswers,
        scoresPerMapel: nextScores,
        skorTotal,
        predikat,
        status,
        benarHots,
        totalHots,
        hotsByMapel: nextHotsByMapel,
        lockedMapels: nextLockedMapels,
        isLocked: stillLocked,
        isScoreLocked: stillLocked,
        unlockedAt: nowIso,
        unlockedAndRecalculatedBy: unlockedBy,
        updatedAt: nowIso,
      } as TKASubmissionItem;
      docsToOverwrite.push({ id: docId, item: updatedSub });
    }
  });

  removeLocalHasilUjianCacheEntries(hasilDocIdsToClear);

  // Also clear matching legacy tkaResults / cbt_results TKA mirrors in Firestore (both full delete & partial mapel delete)
  if (fullDeleteSubs.length > 0 || (filterMapelSet && partialDeleteSubs.length > 0)) {
    try {
      const cbtSnap = await getDocs(collection(db, CBT_RESULTS_COLLECTION));
      const fullStudentIds = new Set(fullDeleteSubs.map((s) => s.studentId));
      const fullNisns = new Set(fullDeleteSubs.map((s) => s.nisn).filter(Boolean));
      const fullPakets = new Set(
        fullDeleteSubs.map((s) => (s.paketDasar || extractBaseTkaPaket(s.paket)).toLowerCase())
      );

      const partialStudentIds = new Set(partialDeleteSubs.map((s) => s.studentId));
      const partialNisns = new Set(partialDeleteSubs.map((s) => s.nisn).filter(Boolean));
      const partialPakets = new Set(
        partialDeleteSubs.map((s) => (s.paketDasar || extractBaseTkaPaket(s.paket)).toLowerCase())
      );

      cbtSnap.forEach((d) => {
        const data = d.data() as any;
        if (data?.category !== 'tka') return;
        const paketBase = extractBaseTkaPaket(data.paketName || data.judul || '').toLowerCase();

        const isFullMatch =
          fullDeleteSubs.length > 0 &&
          (fullStudentIds.has(data.studentId) || (data.nisn && fullNisns.has(data.nisn))) &&
          fullPakets.has(paketBase);

        const isPartialMatch =
          Boolean(filterMapelSet) &&
          partialDeleteSubs.length > 0 &&
          (partialStudentIds.has(data.studentId) || (data.nisn && partialNisns.has(data.nisn))) &&
          partialPakets.has(paketBase) &&
          filterMapelSet!.has(normalizeTkaMapelKey(data.mapel || ''));

        if (isFullMatch || isPartialMatch) {
          docsToDelete.push({ col: CBT_RESULTS_COLLECTION, id: d.id });
        }
      });
    } catch {
      // Non-critical lookup
    }
  }

  for (const chunk of chunkArray(docsToDelete, 300)) {
    try {
      const batch = writeBatch(db);
      chunk.forEach(({ col, id }) => batch.delete(doc(db, col, id)));
      await batch.commit();
    } catch (err) {
      console.warn('[examScoreUnlock] Batch delete TKA for re-exam warning:', err);
    }
  }

  for (const chunk of chunkArray(docsToOverwrite, 250)) {
    try {
      const batch = writeBatch(db);
      chunk.forEach(({ id, item }) => {
        batch.set(
          doc(db, TKA_SUBMISSIONS_COLLECTION, id),
          stripUndefined({
            ...item,
            serverTime: serverTimestamp(),
          })
        );
      });
      await batch.commit();
    } catch (err) {
      console.warn('[examScoreUnlock] Batch overwrite partial TKA warning:', err);
    }
  }

  // Update local storage
  fullDeleteSubs.forEach((sub) => {
    deleteSingleTkaSubmissionFromStorage({
      id: sub.id,
      studentId: sub.studentId,
      nisn: sub.nisn,
      studentName: sub.studentName,
      paket: sub.paketDasar || extractBaseTkaPaket(sub.paket),
    });
  });

  let remainingSubs = getStoredTKASubmissions();
  if (docsToOverwrite.length > 0) {
    const overwriteMap = new Map(docsToOverwrite.map((o) => [o.id, o.item]));
    remainingSubs = remainingSubs.map((s) => {
      const basePaket = s.paketDasar || extractBaseTkaPaket(s.paket);
      const docId = makeSubmissionDocId(s.studentId, basePaket, s.id);
      return overwriteMap.get(s.id) || overwriteMap.get(docId) || s;
    });
    saveStoredTKASubmissions(remainingSubs);
  }

  // Clear local tka_results / cbt_results TKA mirrors for deleted mapels as well
  if (filterMapelSet && docsToOverwrite.length > 0) {
    const targetIds = new Set(partialDeleteSubs.map((t) => t.studentId));
    const targetPakets = new Set(
      partialDeleteSubs.map((t) => (t.paketDasar || extractBaseTkaPaket(t.paket)).toLowerCase())
    );
    const cleanedTkaRes = getStoredTKAResults().filter((r) => {
      if (!targetIds.has(r.studentId)) return true;
      const rPaket = extractBaseTkaPaket(r.paketName || r.judul || '').toLowerCase();
      if (rPaket && !targetPakets.has(rPaket)) return true;
      return !filterMapelSet.has(normalizeTkaMapelKey(r.mapel || ''));
    });
    saveStoredTKAResults(cleanedTkaRes);
    const cleanedCbtRes = getStoredCBTResults().filter((r) => {
      if (!isTkaResultEntry(r) || !targetIds.has(r.studentId)) return true;
      const rPaket = extractBaseTkaPaket(r.paketName || r.judul || '').toLowerCase();
      if (rPaket && !targetPakets.has(rPaket)) return true;
      return !filterMapelSet.has(normalizeTkaMapelKey(r.mapel || ''));
    });
    saveStoredCBTResults(cleanedCbtRes);
  }

  pushAllDataToCloud({ examResultsResetMeta: getStoredExamResultsResetMeta() }, unlockedBy);
  notifyStorageMutation('sekolahku-exam-results-updated');
  return remainingSubs;
}

// Re-export convenience helper
export { markExamResultsResetMeta };
