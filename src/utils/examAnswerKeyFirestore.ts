import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { CBTExam, CBTQuestion, Student, TKAQuestion } from '../types';
import { db } from './firebase';
import { getStoredProfile, isKelas6Class } from './storage';
import { resolveBenarSalahItems, resolveMenjodohkanData } from './questionFormat';

export const SCHOOLS_COLLECTION = 'schools';
export const TENANT_EXAMS_SUBCOLLECTION = 'exams';
export const TENANT_ANSWER_KEYS_SUBCOLLECTION = 'exam_answer_keys';

const SOAL_CHUNK_MARKER = '__soalchunk_';
const SAFE_TENANT_EXAM_BYTES = 550_000;
const SAFE_TENANT_CHUNK_BYTES = 350_000;

export interface SeparatedAnswerKeyEntry {
  id: string;
  tipe: CBTQuestion['tipe'];
  kunciJawaban: string | string[];
  bobot: number;
  rubrik?: string;
  pembahasan?: string;
  benarSalahKunciMap?: Record<string, 'Benar' | 'Salah'>;
  menjodohkanPasangan?: Record<string, string>;
}

export interface ExamAnswerKeyDoc {
  examId: string;
  category: 'cbt' | 'tka';
  npsn: string;
  judul?: string;
  mapel?: string;
  paketName?: string;
  keysByQuestionId: Record<string, SeparatedAnswerKeyEntry>;
  updatedAt: string;
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

export function cleanTenantId(raw?: string | null, fallback: string = '20105060'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

export function getActiveSchoolNpsn(overrideNpsn?: string | null): string {
  if (overrideNpsn && overrideNpsn.trim()) {
    return cleanTenantId(overrideNpsn, '20105060');
  }
  try {
    const profile = getStoredProfile();
    return cleanTenantId(profile?.npsn, '20105060');
  } catch {
    return '20105060';
  }
}

export function slugifyExamSegment(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildTkaExamDocId(jenisTka: string, mapel: string): string {
  const jSlug = slugifyExamSegment(jenisTka || 'simulasi_1');
  const mSlug = slugifyExamSegment(mapel || 'bahasa_indonesia');
  return cleanTenantId(`tka_live_${jSlug}_${mSlug}`, `tka_live_${Date.now()}`);
}

function getUtf8ByteLength(obj: unknown): number {
  const str = JSON.stringify(obj);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  return str.length * 2;
}

/**
 * Membersihkan butir soal agar AMAN dimuat di browser siswa (Anti-Intip Inspect Element):
 * - Menghapus `kunciJawaban`, `bobot`, `rubrik`, `pembahasan`
 * - Mempertahankan daftar pernyataan `benarSalahItems` TANPA properti `kunci`
 * - Mempertahankan `menjodohkanData.kolomKiri` & `kolomKanan` dengan `pasangan: {}` kosong
 */
export function stripAnswerKeysFromQuestion<T extends Partial<CBTQuestion>>(q: T): T {
  if (!q || typeof q !== 'object') return q;

  const tipe = String(q.tipe || 'pg').toLowerCase().trim();
  const next: any = { ...q };

  if (tipe === 'benar_salah') {
    const resolvedItems = resolveBenarSalahItems({
      benarSalahItems: q.benarSalahItems,
      opsi: q.opsi,
      kunciJawaban: q.kunciJawaban,
    });
    if (resolvedItems.length > 0) {
      next.benarSalahItems = resolvedItems.map((it) => ({
        id: it.id,
        pernyataan: it.pernyataan,
      }));
    }
  } else if (Array.isArray(next.benarSalahItems)) {
    next.benarSalahItems = next.benarSalahItems.map((it: any) => ({
      id: it.id,
      pernyataan: it.pernyataan,
    }));
  }

  if (tipe === 'menjodohkan') {
    const resolvedMatching = resolveMenjodohkanData({
      menjodohkanData: q.menjodohkanData,
      kunciJawaban: q.kunciJawaban,
    });
    if (resolvedMatching) {
      next.menjodohkanData = {
        kolomKiri: [...resolvedMatching.kolomKiri],
        kolomKanan: [...resolvedMatching.kolomKanan],
        pasangan: {},
      };
    }
  } else if (next.menjodohkanData && typeof next.menjodohkanData === 'object') {
    next.menjodohkanData = {
      kolomKiri: Array.isArray(next.menjodohkanData.kolomKiri)
        ? [...next.menjodohkanData.kolomKiri]
        : [],
      kolomKanan: Array.isArray(next.menjodohkanData.kolomKanan)
        ? [...next.menjodohkanData.kolomKanan]
        : [],
      pasangan: {},
    };
  }

  next.kunciJawaban = Array.isArray(q.kunciJawaban) ? [] : '';
  next.bobot = 0;
  delete next.rubrik;
  delete next.pembahasan;

  return stripUndefinedDeep(next) as T;
}

export function stripAnswerKeysFromCbtExam(exam: CBTExam): CBTExam {
  if (!exam || typeof exam !== 'object') return exam;
  return {
    ...exam,
    soalList: Array.isArray(exam.soalList)
      ? exam.soalList.map((q) => stripAnswerKeysFromQuestion(q))
      : [],
  };
}

export function extractAnswerKeysFromQuestions(
  questions: Array<Partial<CBTQuestion>>
): Record<string, SeparatedAnswerKeyEntry> {
  const keysMap: Record<string, SeparatedAnswerKeyEntry> = {};
  (questions || []).forEach((q) => {
    if (!q || !q.id) return;
    const tipe = (q.tipe || 'pg') as CBTQuestion['tipe'];
    const bobot = Number(q.bobot) > 0 ? Number(q.bobot) : 10;

    let benarSalahKunciMap: Record<string, 'Benar' | 'Salah'> | undefined;
    if (tipe === 'benar_salah') {
      const items = resolveBenarSalahItems({
        benarSalahItems: q.benarSalahItems,
        opsi: q.opsi,
        kunciJawaban: q.kunciJawaban,
      });
      if (items.length > 0) {
        benarSalahKunciMap = {};
        items.forEach((it) => {
          benarSalahKunciMap![it.id] = it.kunci;
        });
      }
    }

    let menjodohkanPasangan: Record<string, string> | undefined;
    if (tipe === 'menjodohkan') {
      const md = resolveMenjodohkanData({
        menjodohkanData: q.menjodohkanData,
        kunciJawaban: q.kunciJawaban,
      });
      if (md && md.pasangan && Object.keys(md.pasangan).length > 0) {
        menjodohkanPasangan = { ...md.pasangan };
      }
    }

    const entry: SeparatedAnswerKeyEntry = {
      id: q.id,
      tipe,
      kunciJawaban: q.kunciJawaban ?? '',
      bobot,
      ...(q.rubrik ? { rubrik: q.rubrik } : {}),
      ...(q.pembahasan ? { pembahasan: q.pembahasan } : {}),
      ...(benarSalahKunciMap ? { benarSalahKunciMap } : {}),
      ...(menjodohkanPasangan ? { menjodohkanPasangan } : {}),
    };

    keysMap[q.id] = stripUndefinedDeep(entry);
  });

  return keysMap;
}

function remapOptionKeyIfShuffled(
  kunciJawaban: string | string[],
  optionShuffleMap?: Record<string, string>
): string | string[] {
  if (!optionShuffleMap || Object.keys(optionShuffleMap).length === 0) {
    return kunciJawaban;
  }
  // optionShuffleMap maps newLetter -> oldLetter; invert to oldLetter -> newLetter
  const oldToNew: Record<string, string> = {};
  Object.entries(optionShuffleMap).forEach(([newL, oldL]) => {
    const cleanNew = String(newL || '').trim().toUpperCase();
    const cleanOld = String(oldL || '').trim().toUpperCase();
    if (cleanNew && cleanOld) {
      oldToNew[cleanOld] = cleanNew;
    }
  });

  if (typeof kunciJawaban === 'string') {
    const trimmed = kunciJawaban.trim().toUpperCase();
    if (/^[A-F]$/.test(trimmed) && oldToNew[trimmed]) {
      return oldToNew[trimmed];
    }
    // Support comma-separated letters e.g. "A, C" for pg_kompleks
    if (/^[A-F](?:\s*[,;/]\s*[A-F])+$/i.test(kunciJawaban.trim())) {
      return kunciJawaban
        .split(/[,;/]+/)
        .map((part) => {
          const upper = part.trim().toUpperCase();
          return oldToNew[upper] || upper;
        })
        .join(', ');
    }
    return kunciJawaban;
  }

  if (Array.isArray(kunciJawaban)) {
    return kunciJawaban.map((k) => {
      const upper = String(k || '').trim().toUpperCase();
      return /^[A-F]$/.test(upper) && oldToNew[upper] ? oldToNew[upper] : k;
    });
  }

  return kunciJawaban;
}

/**
 * Menggabungkan soal bersih dari browser siswa / bank soal dengan dokumen kunci jawaban terproteksi,
 * sekaligus menangani pemetaan ulang opsi jika fitur acakJawaban aktif (`optionShuffleMap`).
 */
export function mergeQuestionsWithAnswerKeys<T extends CBTQuestion>(
  questions: T[],
  keyMap?: Record<string, SeparatedAnswerKeyEntry> | null,
  fallbackSourceQuestions?: Array<Partial<CBTQuestion>> | null
): T[] {
  const fallbackById = new Map<string, Partial<CBTQuestion>>();
  (fallbackSourceQuestions || []).forEach((fq) => {
    if (fq?.id) fallbackById.set(fq.id, fq);
  });

  return (questions || []).map((q) => {
    const sep = keyMap?.[q.id];
    const fb = fallbackById.get(q.id);

    const hasInlineKey =
      (Array.isArray(q.kunciJawaban) && q.kunciJawaban.length > 0) ||
      (typeof q.kunciJawaban === 'string' && q.kunciJawaban.trim() !== '');

    const rawKunci =
      sep?.kunciJawaban !== undefined &&
      ((Array.isArray(sep.kunciJawaban) && sep.kunciJawaban.length > 0) ||
        (typeof sep.kunciJawaban === 'string' && sep.kunciJawaban.trim() !== ''))
        ? sep.kunciJawaban
        : hasInlineKey
        ? q.kunciJawaban
        : fb?.kunciJawaban ?? q.kunciJawaban ?? '';

    const finalKunci = remapOptionKeyIfShuffled(rawKunci, q.optionShuffleMap);
    const finalBobot =
      sep?.bobot && sep.bobot > 0
        ? sep.bobot
        : Number(q.bobot) > 0
        ? Number(q.bobot)
        : fb?.bobot && Number(fb.bobot) > 0
        ? Number(fb.bobot)
        : 10;

    let nextBenarSalahItems = q.benarSalahItems;
    if (q.tipe === 'benar_salah') {
      const bsMap = sep?.benarSalahKunciMap;
      if (Array.isArray(q.benarSalahItems) && q.benarSalahItems.length > 0) {
        nextBenarSalahItems = q.benarSalahItems.map((it, idx) => {
          const fbItem = fb?.benarSalahItems?.[idx];
          const kunci =
            bsMap?.[it.id] ||
            (it as any).kunci ||
            fbItem?.kunci ||
            'Benar';
          return {
            id: it.id,
            pernyataan: it.pernyataan,
            kunci,
          };
        });
      } else if (fb?.benarSalahItems && fb.benarSalahItems.length > 0) {
        nextBenarSalahItems = fb.benarSalahItems;
      }
    }

    let nextMenjodohkanData = q.menjodohkanData;
    if (q.tipe === 'menjodohkan') {
      const sepPairs = sep?.menjodohkanPasangan;
      const existingPairs =
        q.menjodohkanData?.pasangan && Object.keys(q.menjodohkanData.pasangan).length > 0
          ? q.menjodohkanData.pasangan
          : undefined;
      const fbPairs =
        fb?.menjodohkanData?.pasangan && Object.keys(fb.menjodohkanData.pasangan).length > 0
          ? fb.menjodohkanData.pasangan
          : undefined;
      const chosenPairs = sepPairs || existingPairs || fbPairs;
      if (chosenPairs && (q.menjodohkanData || fb?.menjodohkanData)) {
        const baseMd = q.menjodohkanData || fb!.menjodohkanData!;
        nextMenjodohkanData = {
          kolomKiri: [...(baseMd.kolomKiri || [])],
          kolomKanan: [...(baseMd.kolomKanan || [])],
          pasangan: { ...chosenPairs },
        };
      }
    }

    return {
      ...q,
      kunciJawaban: finalKunci,
      bobot: finalBobot,
      ...(sep?.rubrik || q.rubrik || fb?.rubrik
        ? { rubrik: sep?.rubrik || q.rubrik || fb?.rubrik }
        : {}),
      ...(sep?.pembahasan || q.pembahasan || fb?.pembahasan
        ? { pembahasan: sep?.pembahasan || q.pembahasan || fb?.pembahasan }
        : {}),
      ...(nextBenarSalahItems ? { benarSalahItems: nextBenarSalahItems } : {}),
      ...(nextMenjodohkanData ? { menjodohkanData: nextMenjodohkanData } : {}),
    };
  });
}

function partitionQuestionsForTenant(questions: CBTQuestion[]): CBTQuestion[][] {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  const chunks: CBTQuestion[][] = [];
  let current: CBTQuestion[] = [];
  let currentBytes = 2;

  for (const q of questions) {
    const qBytes = getUtf8ByteLength(q) + 2;
    if (current.length > 0 && currentBytes + qBytes > SAFE_TENANT_CHUNK_BYTES) {
      chunks.push(current);
      current = [q];
      currentBytes = 2 + qBytes;
    } else {
      current.push(q);
      currentBytes += qBytes;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function deleteTenantExamChunksRange(
  npsn: string,
  examId: string,
  fromIdx: number,
  toExclusive: number
): Promise<void> {
  if (toExclusive <= fromIdx) return;
  const tasks: Promise<void>[] = [];
  for (let i = fromIdx; i < toExclusive; i++) {
    tasks.push(
      deleteDoc(
        doc(db, SCHOOLS_COLLECTION, npsn, TENANT_EXAMS_SUBCOLLECTION, `${examId}${SOAL_CHUNK_MARKER}${i}`)
      ).catch(() => {})
    );
  }
  await Promise.all(tasks);
}

/**
 * Menyimpan paket ujian CBT dalam arsitektur terpisah (v5.1.0):
 * 1) `schools/{npsn}/exams/{examId}` -> Soal bersih tanpa kunci jawaban / bobot / pembahasan.
 * 2) `schools/{npsn}/exam_answer_keys/{examId}` -> Kunci jawaban & pembobotan terproteksi.
 */
export async function saveSeparatedCbtExamToTenant(
  exam: CBTExam,
  overrideNpsn?: string
): Promise<boolean> {
  try {
    const npsn = getActiveSchoolNpsn(overrideNpsn);
    const examId = cleanTenantId(exam.id, `cbt_${Date.now()}`);
    const nowIso = new Date().toISOString();

    const sanitizedExam = stripAnswerKeysFromCbtExam({
      ...exam,
      id: examId,
    });
    const keysByQuestionId = extractAnswerKeysFromQuestions(exam.soalList || []);

    const examRef = doc(db, SCHOOLS_COLLECTION, npsn, TENANT_EXAMS_SUBCOLLECTION, examId);
    const keyRef = doc(db, SCHOOLS_COLLECTION, npsn, TENANT_ANSWER_KEYS_SUBCOLLECTION, examId);

    let prevChunkCount = 0;
    try {
      const prevSnap = await getDoc(examRef);
      if (prevSnap.exists()) {
        prevChunkCount = Number(prevSnap.data()?.soalChunkCount || 0);
      }
    } catch {
      prevChunkCount = 0;
    }

    const baseExamPayload = stripUndefinedDeep({
      id: examId,
      category: 'cbt' as const,
      judul: sanitizedExam.judul || `Ujian CBT ${sanitizedExam.mapel || ''}`.trim() || examId,
      mapel: sanitizedExam.mapel || 'Umum',
      kelas: sanitizedExam.kelas || 'Semua Kelas',
      paketName: sanitizedExam.paketName || '',
      subPaket: sanitizedExam.subPaket || 'Paket 1',
      durasiMenit: Number(sanitizedExam.durasiMenit) > 0 ? Number(sanitizedExam.durasiMenit) : 60,
      aktif: Boolean(sanitizedExam.aktif),
      isSoalChunk: false,
      soalList: sanitizedExam.soalList || [],
      updatedAt: nowIso,
    });

    if (getUtf8ByteLength(baseExamPayload) <= SAFE_TENANT_EXAM_BYTES) {
      await setDoc(examRef, {
        ...baseExamPayload,
        soalChunkCount: 0,
        serverTime: serverTimestamp(),
      });
      if (prevChunkCount > 0) {
        await deleteTenantExamChunksRange(npsn, examId, 0, prevChunkCount);
      }
    } else {
      const chunks = partitionQuestionsForTenant(sanitizedExam.soalList || []);
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = `${examId}${SOAL_CHUNK_MARKER}${i}`;
        await setDoc(
          doc(db, SCHOOLS_COLLECTION, npsn, TENANT_EXAMS_SUBCOLLECTION, chunkId),
          stripUndefinedDeep({
            id: chunkId,
            category: 'cbt' as const,
            judul: baseExamPayload.judul,
            mapel: baseExamPayload.mapel,
            isSoalChunk: true,
            parentExamId: examId,
            chunkIndex: i,
            soalList: chunks[i],
            updatedAt: nowIso,
            serverTime: serverTimestamp(),
          })
        );
      }
      await setDoc(examRef, {
        ...baseExamPayload,
        soalList: [],
        soalChunkCount: chunks.length,
        serverTime: serverTimestamp(),
      });
      if (prevChunkCount > chunks.length) {
        await deleteTenantExamChunksRange(npsn, examId, chunks.length, prevChunkCount);
      }
    }

    const keyPayload: ExamAnswerKeyDoc = stripUndefinedDeep({
      examId,
      category: 'cbt',
      npsn,
      judul: baseExamPayload.judul,
      mapel: baseExamPayload.mapel,
      paketName: baseExamPayload.paketName || baseExamPayload.judul,
      keysByQuestionId,
      updatedAt: nowIso,
    });

    await setDoc(keyRef, {
      ...keyPayload,
      serverTime: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.warn(`[examAnswerKeyFirestore] Gagal memisahkan kunci CBT ${exam?.id}:`, error);
    return false;
  }
}

export async function deleteSeparatedExamFromTenant(
  examId: string,
  overrideNpsn?: string
): Promise<boolean> {
  try {
    const npsn = getActiveSchoolNpsn(overrideNpsn);
    const safeId = cleanTenantId(examId);
    const examRef = doc(db, SCHOOLS_COLLECTION, npsn, TENANT_EXAMS_SUBCOLLECTION, safeId);
    const keyRef = doc(db, SCHOOLS_COLLECTION, npsn, TENANT_ANSWER_KEYS_SUBCOLLECTION, safeId);

    let prevChunkCount = 0;
    try {
      const snap = await getDoc(examRef);
      if (snap.exists()) {
        prevChunkCount = Number(snap.data()?.soalChunkCount || 0);
      }
    } catch {
      prevChunkCount = 0;
    }

    await Promise.all([deleteDoc(examRef).catch(() => {}), deleteDoc(keyRef).catch(() => {})]);
    if (prevChunkCount > 0) {
      await deleteTenantExamChunksRange(npsn, safeId, 0, prevChunkCount);
    }
    return true;
  } catch (error) {
    console.warn(`[examAnswerKeyFirestore] Gagal menghapus dokumen terpisah ${examId}:`, error);
    return false;
  }
}

/**
 * Menyinkronkan satu paket TKA (jenisTka + mapel) ke dokumen terpisah:
 * `schools/{npsn}/exams/{tkaExamId}` & `schools/{npsn}/exam_answer_keys/{tkaExamId}`.
 */
export async function syncSeparatedTkaBucketToTenant(
  questionsInBucket: TKAQuestion[],
  jenisTka: string,
  mapel: string,
  overrideNpsn?: string
): Promise<boolean> {
  const examId = buildTkaExamDocId(jenisTka, mapel);
  if (!questionsInBucket || questionsInBucket.length === 0) {
    return deleteSeparatedExamFromTenant(examId, overrideNpsn);
  }

  try {
    const npsn = getActiveSchoolNpsn(overrideNpsn);
    const nowIso = new Date().toISOString();
    const sanitizedSoal = questionsInBucket.map((q) => stripAnswerKeysFromQuestion(q));
    const keysByQuestionId = extractAnswerKeysFromQuestions(questionsInBucket);

    const examRef = doc(db, SCHOOLS_COLLECTION, npsn, TENANT_EXAMS_SUBCOLLECTION, examId);
    const keyRef = doc(db, SCHOOLS_COLLECTION, npsn, TENANT_ANSWER_KEYS_SUBCOLLECTION, examId);

    let prevChunkCount = 0;
    try {
      const prevSnap = await getDoc(examRef);
      if (prevSnap.exists()) {
        prevChunkCount = Number(prevSnap.data()?.soalChunkCount || 0);
      }
    } catch {
      prevChunkCount = 0;
    }

    const judul = `${jenisTka} - ${mapel}`;
    const baseExamPayload = stripUndefinedDeep({
      id: examId,
      category: 'tka' as const,
      judul,
      mapel: mapel || 'Bahasa Indonesia',
      kelas: 'Kelas 6',
      paketName: jenisTka || 'Simulasi 1',
      subPaket: 'Paket 1',
      durasiMenit: 90,
      aktif: true,
      isSoalChunk: false,
      soalList: sanitizedSoal,
      updatedAt: nowIso,
    });

    if (getUtf8ByteLength(baseExamPayload) <= SAFE_TENANT_EXAM_BYTES) {
      await setDoc(examRef, {
        ...baseExamPayload,
        soalChunkCount: 0,
        serverTime: serverTimestamp(),
      });
      if (prevChunkCount > 0) {
        await deleteTenantExamChunksRange(npsn, examId, 0, prevChunkCount);
      }
    } else {
      const chunks = partitionQuestionsForTenant(sanitizedSoal);
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = `${examId}${SOAL_CHUNK_MARKER}${i}`;
        await setDoc(
          doc(db, SCHOOLS_COLLECTION, npsn, TENANT_EXAMS_SUBCOLLECTION, chunkId),
          stripUndefinedDeep({
            id: chunkId,
            category: 'tka' as const,
            judul,
            mapel: baseExamPayload.mapel,
            isSoalChunk: true,
            parentExamId: examId,
            chunkIndex: i,
            soalList: chunks[i],
            updatedAt: nowIso,
            serverTime: serverTimestamp(),
          })
        );
      }
      await setDoc(examRef, {
        ...baseExamPayload,
        soalList: [],
        soalChunkCount: chunks.length,
        serverTime: serverTimestamp(),
      });
      if (prevChunkCount > chunks.length) {
        await deleteTenantExamChunksRange(npsn, examId, chunks.length, prevChunkCount);
      }
    }

    const keyPayload: ExamAnswerKeyDoc = stripUndefinedDeep({
      examId,
      category: 'tka',
      npsn,
      judul,
      mapel: baseExamPayload.mapel,
      paketName: baseExamPayload.paketName,
      keysByQuestionId,
      updatedAt: nowIso,
    });

    await setDoc(keyRef, {
      ...keyPayload,
      serverTime: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.warn(`[examAnswerKeyFirestore] Gagal sinkron TKA bucket ${examId}:`, error);
    return false;
  }
}

/**
 * Menyinkronkan seluruh soal TKA ke dokumen terpisah per paket & mapel di `schools/{npsn}/exams` & `exam_answer_keys`.
 */
export async function syncSeparatedAllTkaQuestionsToTenant(
  allQuestions: TKAQuestion[],
  overrideNpsn?: string
): Promise<boolean> {
  try {
    const npsn = getActiveSchoolNpsn(overrideNpsn);
    const buckets = new Map<string, { jenisTka: string; mapel: string; items: TKAQuestion[] }>();

    (allQuestions || []).forEach((q) => {
      const jenisTka = q.jenisTka || 'Simulasi 1';
      const mapel = q.mapel || 'Bahasa Indonesia';
      const id = buildTkaExamDocId(jenisTka, mapel);
      if (!buckets.has(id)) {
        buckets.set(id, { jenisTka, mapel, items: [] });
      }
      buckets.get(id)!.items.push(q);
    });

    // Clean up TKA tenant docs that no longer exist
    const existingKeysSnap = await getDocs(
      collection(db, SCHOOLS_COLLECTION, npsn, TENANT_ANSWER_KEYS_SUBCOLLECTION)
    );
    const staleTkaIds: string[] = [];
    existingKeysSnap.forEach((docSnap) => {
      const data = docSnap.data() as any;
      if (data?.category === 'tka' && !buckets.has(docSnap.id)) {
        staleTkaIds.push(docSnap.id);
      }
    });

    if (staleTkaIds.length > 0) {
      for (const staleId of staleTkaIds) {
        await deleteSeparatedExamFromTenant(staleId, npsn);
      }
    }

    for (const bucket of buckets.values()) {
      await syncSeparatedTkaBucketToTenant(bucket.items, bucket.jenisTka, bucket.mapel, npsn);
    }
    return true;
  } catch (error) {
    console.warn('[examAnswerKeyFirestore] Gagal sinkron penuh TKA terpisah:', error);
    return false;
  }
}

/**
 * Mengambil kunci jawaban terproteksi untuk satu ujian (`schools/{npsn}/exam_answer_keys/{examId}`).
 * Hanya dipanggil saat siswa klik "Selesai Ujian", saat Review setelah ujian selesai, atau oleh Guru/Admin.
 */
export async function fetchExamAnswerKeysFromFirestore(
  examId: string,
  overrideNpsn?: string
): Promise<Record<string, SeparatedAnswerKeyEntry> | null> {
  try {
    const npsn = getActiveSchoolNpsn(overrideNpsn);
    const safeId = cleanTenantId(examId);
    const snap = await Promise.race([
      getDoc(doc(db, SCHOOLS_COLLECTION, npsn, TENANT_ANSWER_KEYS_SUBCOLLECTION, safeId)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    if (snap && snap.exists()) {
      const data = snap.data() as ExamAnswerKeyDoc;
      if (data?.keysByQuestionId && typeof data.keysByQuestionId === 'object') {
        return data.keysByQuestionId;
      }
    }
  } catch (error) {
    console.warn(`[examAnswerKeyFirestore] Gagal mengambil kunci ${examId}:`, error);
  }
  return null;
}

/**
 * Mengambil seluruh dokumen kunci jawaban pada sekolah aktif untuk keperluan Buka Kunci / Hitung Ulang / TKA Multi-Mapel.
 */
export async function fetchAllExamAnswerKeysForTenant(overrideNpsn?: string): Promise<{
  byExamId: Record<string, Record<string, SeparatedAnswerKeyEntry>>;
  flatByQuestionId: Record<string, SeparatedAnswerKeyEntry>;
}> {
  const byExamId: Record<string, Record<string, SeparatedAnswerKeyEntry>> = {};
  const flatByQuestionId: Record<string, SeparatedAnswerKeyEntry> = {};

  try {
    const npsn = getActiveSchoolNpsn(overrideNpsn);
    const snap = await Promise.race([
      getDocs(collection(db, SCHOOLS_COLLECTION, npsn, TENANT_ANSWER_KEYS_SUBCOLLECTION)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (!snap) return { byExamId, flatByQuestionId };

    snap.forEach((docSnap) => {
      const data = docSnap.data() as ExamAnswerKeyDoc;
      if (data?.keysByQuestionId && typeof data.keysByQuestionId === 'object') {
        byExamId[docSnap.id] = data.keysByQuestionId;
        Object.entries(data.keysByQuestionId).forEach(([qId, entry]) => {
          flatByQuestionId[qId] = entry;
        });
      }
    });
  } catch (error) {
    console.warn('[examAnswerKeyFirestore] Gagal memuat daftar kunci ujian sekolah:', error);
  }

  return { byExamId, flatByQuestionId };
}

/**
 * Membaca daftar soal bersih langsung dari sub-koleksi `schools/{npsn}/exams`.
 */
export async function fetchSanitizedExamsFromTenant(overrideNpsn?: string): Promise<CBTExam[]> {
  try {
    const npsn = getActiveSchoolNpsn(overrideNpsn);
    const snap = await getDocs(
      collection(db, SCHOOLS_COLLECTION, npsn, TENANT_EXAMS_SUBCOLLECTION)
    );
    const parents: Array<CBTExam & { soalChunkCount?: number }> = [];
    const chunksByParent = new Map<string, Array<{ chunkIndex: number; soalList: CBTQuestion[] }>>();

    snap.forEach((docSnap) => {
      const raw = docSnap.data() as any;
      if (raw?.isSoalChunk || docSnap.id.includes(SOAL_CHUNK_MARKER)) {
        const parentId = String(raw?.parentExamId || docSnap.id.split(SOAL_CHUNK_MARKER)[0] || '');
        const chunkIdx = Number(raw?.chunkIndex ?? docSnap.id.split(SOAL_CHUNK_MARKER)[1] ?? 0);
        if (parentId) {
          const arr = chunksByParent.get(parentId) || [];
          arr.push({
            chunkIndex: Number.isFinite(chunkIdx) ? chunkIdx : 0,
            soalList: Array.isArray(raw?.soalList) ? raw.soalList : [],
          });
          chunksByParent.set(parentId, arr);
        }
        return;
      }
      parents.push({ ...(raw as CBTExam), id: docSnap.id });
    });

    return parents.map((p) => {
      const entries = chunksByParent.get(p.id);
      const soalList =
        entries && entries.length > 0 && (p.soalChunkCount || !p.soalList?.length)
          ? [...entries].sort((a, b) => a.chunkIndex - b.chunkIndex).flatMap((e) => e.soalList)
          : Array.isArray(p.soalList)
          ? p.soalList
          : [];
      return stripAnswerKeysFromCbtExam({ ...p, soalList });
    });
  } catch (error) {
    console.warn('[examAnswerKeyFirestore] Gagal membaca exams terpisah:', error);
    return [];
  }
}

export function subscribeToSanitizedTenantExams(
  onUpdate: (exams: CBTExam[]) => void,
  overrideNpsn?: string
): () => void {
  try {
    const npsn = getActiveSchoolNpsn(overrideNpsn);
    return onSnapshot(
      collection(db, SCHOOLS_COLLECTION, npsn, TENANT_EXAMS_SUBCOLLECTION),
      (snap) => {
        const parents: Array<CBTExam & { soalChunkCount?: number }> = [];
        const chunksByParent = new Map<string, Array<{ chunkIndex: number; soalList: CBTQuestion[] }>>();
        snap.forEach((docSnap) => {
          const raw = docSnap.data() as any;
          if (raw?.isSoalChunk || docSnap.id.includes(SOAL_CHUNK_MARKER)) {
            const parentId = String(raw?.parentExamId || docSnap.id.split(SOAL_CHUNK_MARKER)[0] || '');
            const chunkIdx = Number(raw?.chunkIndex ?? docSnap.id.split(SOAL_CHUNK_MARKER)[1] ?? 0);
            if (parentId) {
              const arr = chunksByParent.get(parentId) || [];
              arr.push({
                chunkIndex: Number.isFinite(chunkIdx) ? chunkIdx : 0,
                soalList: Array.isArray(raw?.soalList) ? raw.soalList : [],
              });
              chunksByParent.set(parentId, arr);
            }
            return;
          }
          parents.push({ ...(raw as CBTExam), id: docSnap.id });
        });

        const assembled = parents.map((p) => {
          const entries = chunksByParent.get(p.id);
          const soalList =
            entries && entries.length > 0 && (p.soalChunkCount || !p.soalList?.length)
              ? [...entries].sort((a, b) => a.chunkIndex - b.chunkIndex).flatMap((e) => e.soalList)
              : Array.isArray(p.soalList)
              ? p.soalList
              : [];
          return stripAnswerKeysFromCbtExam({ ...p, soalList });
        });
        onUpdate(assembled);
      },
      () => {}
    );
  } catch {
    return () => {};
  }
}

/**
 * Kunci jawaban bawaan untuk paket simulasi contoh internal (hanya dipanggil di-memory saat Submit).
 * Tidak pernah dimuat ke UI atau state soal siswa sebelum tombol Selesai Ujian diklik.
 */
const BUILT_IN_SAMPLE_KEYS: Record<string, Record<string, SeparatedAnswerKeyEntry>> = {
  cbt_ipas_as1: {
    cbt_q1: {
      id: 'cbt_q1',
      tipe: 'pg',
      kunciJawaban: 'A',
      bobot: 20,
      pembahasan: 'Paru-paru adalah organ utama sistem pernapasan manusia tempat terjadinya difusi O2 dan CO2 di alveolus.',
    },
    cbt_q2: {
      id: 'cbt_q2',
      tipe: 'pg',
      kunciJawaban: 'B',
      bobot: 20,
      pembahasan: 'Eritrosit mengandung hemoglobin yang mengikat oksigen untuk diedarkan ke seluruh tubuh.',
    },
    cbt_q3: {
      id: 'cbt_q3',
      tipe: 'pg',
      kunciJawaban: 'B',
      bobot: 20,
      pembahasan: 'Serangga seperti belalang bernapas menggunakan pembuluh trakea.',
    },
    cbt_q4: {
      id: 'cbt_q4',
      tipe: 'pg',
      kunciJawaban: 'B',
      bobot: 20,
      pembahasan: 'Peredaran darah sistemik (besar) mengalirkan darah dari ventrikel kiri jantung ke seluruh tubuh lalu kembali ke atrium kanan.',
    },
    cbt_q5: {
      id: 'cbt_q5',
      tipe: 'pg',
      kunciJawaban: 'B',
      bobot: 20,
      pembahasan: 'Menggunakan masker dan berolahraga secara teratur menjaga imunitas dan saluran pernapasan tetap bersih.',
    },
  },
  cbt_mtk_as2: {
    cbt_m1: {
      id: 'cbt_m1',
      tipe: 'pg',
      kunciJawaban: 'A',
      bobot: 25,
      pembahasan: 'Dahulukan perkalian: 25 x 4 = 100. Kemudian 150 + 100 - 100 = 150.',
    },
    cbt_m2: {
      id: 'cbt_m2',
      tipe: 'pg',
      kunciJawaban: 'A',
      bobot: 25,
      pembahasan: 'Kenaikan suhu = (30 / 10) x 2°C = 6°C. Suhu akhir = -4°C + 6°C = 2°C.',
    },
    cbt_m3: {
      id: 'cbt_m3',
      tipe: 'pg',
      kunciJawaban: 'C',
      bobot: 25,
      pembahasan: 'Faktor persekutuan terbesar dari 36, 54, dan 72 adalah 18.',
    },
    cbt_m4: {
      id: 'cbt_m4',
      tipe: 'pg',
      kunciJawaban: 'A',
      bobot: 25,
      pembahasan: 'Total beras = 3 x 2,5 = 7,5 kg. Dibagi 5 orang = 7,5 / 5 = 1,5 kg.',
    },
  },
  cbt_asts_indo: {
    cbt_bi1: {
      id: 'cbt_bi1',
      tipe: 'pg',
      kunciJawaban: 'B',
      bobot: 33,
      pembahasan: 'Teks eksplanasi menjelaskan proses terjadinya suatu fenomena alam atau sosial dengan kausalitas.',
    },
    cbt_bi2: {
      id: 'cbt_bi2',
      tipe: 'pg',
      kunciJawaban: 'B',
      bobot: 33,
      pembahasan: 'Paragraf induktif menyajikan kalimat-kalimat penjelas terlebih dahulu kemudian disimpulkan di akhir paragraf.',
    },
    cbt_bi3: {
      id: 'cbt_bi3',
      tipe: 'pg',
      kunciJawaban: 'C',
      bobot: 34,
      pembahasan: 'Kata tanya "Mengapa" menanyakan sebab atau alasan peristiwa terjadi.',
    },
  },
  cbt_asas_pancasila: {
    cbt_p1: {
      id: 'cbt_p1',
      tipe: 'pg',
      kunciJawaban: 'C',
      bobot: 34,
      pembahasan: 'Sila ke-4: Kerakyatan yang Dipimpin oleh Hikmat Kebijaksanaan dalam Permusyawaratan/Perwakilan.',
    },
    cbt_p2: {
      id: 'cbt_p2',
      tipe: 'pg',
      kunciJawaban: 'A',
      bobot: 33,
      pembahasan: 'Kasih sayang dan pendidikan adalah hak dasar yang wajib dipenuhi orang tua untuk anak.',
    },
    cbt_p3: {
      id: 'cbt_p3',
      tipe: 'pg',
      kunciJawaban: 'B',
      bobot: 33,
      pembahasan: 'Musyawarah menuntut sikap lapang dada menghargai keputusan mufakat bersama.',
    },
  },
  tka_indo_tp612: {
    tka_bi1: {
      id: 'tka_bi1',
      tipe: 'pg',
      kunciJawaban: 'A',
      bobot: 50,
      pembahasan: 'Simpulan merangkum sebab akibat teks: pengawasan batasan waktu mengatasi dampak kecanduan.',
    },
    tka_bi2: {
      id: 'tka_bi2',
      tipe: 'pg',
      kunciJawaban: 'B',
      bobot: 50,
      pembahasan: 'Kalimat B dapat dibuktikan dengan data empiris BMKG yang obyektif sehingga berstatus fakta.',
    },
  },
  tka_mtk_tp621: {
    tka_mtk1: {
      id: 'tka_mtk1',
      tipe: 'pg',
      kunciJawaban: 'A',
      bobot: 50,
      pembahasan: 'Panjang asli = 8 x 100 cm = 8 m. Lebar asli = 6 x 100 cm = 6 m. Luas = 8 m x 6 m = 48 m².',
    },
    tka_mtk2: {
      id: 'tka_mtk2',
      tipe: 'pg',
      kunciJawaban: 'A',
      bobot: 50,
      pembahasan: 'Volume penuh = 80 x 50 x 60 = 240.000 cm³ = 240 liter. Terisi 3/4 bagian = 3/4 x 240 liter = 180 liter.',
    },
  },
  tka_ipas_tp631: {
    tka_ip1: {
      id: 'tka_ip1',
      tipe: 'pg',
      kunciJawaban: 'A',
      bobot: 50,
      pembahasan: 'Katak adalah predator belalang. Jika katak berkurang, belalang berkembang biak tanpa kendali dan memangsa padi.',
    },
    tka_ip2: {
      id: 'tka_ip2',
      tipe: 'pg',
      kunciJawaban: 'A',
      bobot: 50,
      pembahasan: 'Pembangkit listrik tenaga surya memanfaatkan sinar matahari bebas emisi karbon.',
    },
  },
};

export function resolveBuiltInSampleExamKeys(
  examId: string
): Record<string, SeparatedAnswerKeyEntry> | null {
  return BUILT_IN_SAMPLE_KEYS[examId] || null;
}

/**
 * Mendeteksi ujian serentak berskala besar (>30 peserta) untuk mengaktifkan antrean jitter pengiriman.
 */
export function detectLargeConcurrentExam(params: {
  students: Student[];
  targetClass?: string;
  category: 'cbt' | 'tka';
}): { isLargeScale: boolean; estimatedParticipants: number } {
  const { students, targetClass, category } = params;
  const list = Array.isArray(students) ? students : [];
  if (list.length === 0) {
    return { isLargeScale: false, estimatedParticipants: 0 };
  }

  let estimated = 0;
  if (category === 'tka') {
    const kelas6 = list.filter((s) => isKelas6Class(s.kelas));
    estimated = kelas6.length > 0 ? kelas6.length : list.length;
  } else {
    const cls = String(targetClass || '').trim().toLowerCase();
    if (!cls || cls === 'semua' || cls === 'all' || cls.includes('semua')) {
      estimated = list.length;
    } else {
      const sameClass = list.filter((s) => String(s.kelas || '').trim().toLowerCase() === cls);
      const clsNum = cls.match(/([1-6])/)?.[1];
      const sameGrade = clsNum
        ? list.filter((s) => String(s.kelas || '').match(/([1-6])/)?.[1] === clsNum)
        : [];
      estimated = Math.max(sameClass.length, sameGrade.length);
    }
  }

  return {
    isLargeScale: estimated > 30 || list.length > 30,
    estimatedParticipants: Math.max(estimated, list.length > 30 ? list.length : estimated),
  };
}

/**
 * Menghasilkan jeda antrean acak 1.000 - 4.000 ms (1–4 detik) saat ujian serentak >30 peserta
 * guna mencegah write spike bersamaan ke kuota Firestore Spark.
 */
export function computeConcurrentSubmitJitterMs(isLargeScale: boolean): number {
  if (!isLargeScale) return 0;
  return 1000 + Math.floor(Math.random() * 3001);
}

/**
 * Utilitas migrasi satu kali atau sinkronisasi ulang seluruh CBT & TKA ke struktur terpisah.
 */
export async function syncAllExamsSeparatedToTenant(params: {
  cbtExams?: CBTExam[];
  tkaQuestions?: TKAQuestion[];
  overrideNpsn?: string;
}): Promise<void> {
  if (Array.isArray(params.cbtExams)) {
    for (const ex of params.cbtExams) {
      await saveSeparatedCbtExamToTenant(ex, params.overrideNpsn);
    }
  }
  if (Array.isArray(params.tkaQuestions)) {
    await syncSeparatedAllTkaQuestionsToTenant(params.tkaQuestions, params.overrideNpsn);
  }
}

export async function commitBatchedWrites(
  ops: Array<(batch: ReturnType<typeof writeBatch>) => void>,
  maxPerBatch: number = 400
): Promise<number> {
  if (ops.length === 0) return 0;
  let committed = 0;
  const limit = Math.min(400, Math.max(1, maxPerBatch));
  for (let i = 0; i < ops.length; i += limit) {
    const chunk = ops.slice(i, i + limit);
    const batch = writeBatch(db);
    chunk.forEach((fn) => fn(batch));
    await batch.commit();
    committed += chunk.length;
  }
  return committed;
}
