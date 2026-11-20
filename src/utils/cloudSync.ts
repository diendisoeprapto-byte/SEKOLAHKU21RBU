import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  SchoolProfile,
  Teacher,
  Student,
  Subject,
  KaldikDay,
  StudentReportNotes,
  ExamResultsResetMeta,
} from '../types';
import {
  getStoredProfile,
  getStoredTeachers,
  saveStoredTeachers,
  getStoredStudents,
  saveStoredStudents,
  getStoredSubjects,
  getStoredKaldik,
  saveStoredKaldik,
  getStoredAttendance,
  saveStoredAttendance,
  getStoredReportNotes,
  getStoredTKADurations,
  saveStoredTKADurations,
  getStoredCBTDurations,
  getStoredTKAActivePackages,
  getStoredCBTActivePackages,
  getStoredCBTExams,
  saveStoredCBTExams,
  getStoredTKAQuestions,
  saveStoredTKAQuestions,
  getStoredTKASubmissions,
  saveStoredTKASubmissions,
  getStoredCBTResults,
  saveStoredCBTResults,
  getStoredTKAResults,
  saveStoredTKAResults,
  getStoredExamResultsResetMeta,
  mergeExamResultsResetMeta,
  filterExamResultsByResetMeta,
  extractBaseTkaPaket,
  saveStoredExamResultsResetMeta,
  runWithoutStorageSync,
  safeSetLocalStorage,
  safeRemoveLocalStorage,
  AttendanceRecordItem,
  TKASubmissionItem,
} from './storage';
import {
  replaceStudentsInFirestore,
  fetchStudentsFromFirestore,
} from './studentFirestore';
import {
  replaceAttendanceInFirestore,
  fetchAttendanceFromFirestore,
  saveKaldikToFirestore,
  fetchKaldikFromFirestore,
} from './attendanceFirestore';
import {
  replaceTkaQuestionsInFirestore,
  fetchTkaQuestionsFromFirestore,
  replaceTkaSubmissionsInFirestore,
  fetchTkaSubmissionsFromFirestore,
  saveTkaSubmissionsBatchToFirestore,
  mergeTkaSubmissionLists,
  reconcileTkaResultsToSubmissions,
  getPendingTkaSubmissions,
  flushPendingTkaSubmissionsToFirestore,
} from './tkaFirestore';
import {
  replaceCbtExamsInFirestore,
  fetchCbtExamsFromFirestore,
} from './cbtFirestore';
import {
  replaceTeachersInFirestore,
  fetchTeachersFromFirestore,
} from './teacherFirestore';

export interface CloudSyncPayload {
  version: number;
  snapshotRevision?: number;
  snapshotChunkCount?: number;
  restoreVersion?: number;
  lastUpdated: string;
  updatedBy: string;
  profile?: SchoolProfile;
  teachers?: Teacher[];
  students?: Student[];
  subjects?: Subject[];
  subjectsByClass?: Record<string, Subject[]>;
  kaldikDays?: KaldikDay[];
  attendance?: Record<string, any>;
  reportNotes?: Record<string, StudentReportNotes>;
  ekskulList?: Array<{
    id?: string;
    nama: string;
    pembina: string;
    hari: string;
    waktu: string;
    anggotaIds?: string[];
  }>;
  penilaianEkskul?: Record<
    string,
    Array<{
      studentId: string;
      predikat: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Kurang' | 'Perlu Bimbingan';
      keterangan: string;
    }>
  >;
  cbtAcakSoal?: boolean;
  cbtAcakJawaban?: boolean;
  tkaAcakSoal?: boolean;
  tkaAcakJawaban?: boolean;
  tkaDurations?: Record<string, number>;
  cbtDurations?: Record<string, number>;
  cbtActivePackages?: Record<string, boolean>;
  tkaActivePackages?: Record<string, boolean>;
  examResultsResetMeta?: ExamResultsResetMeta;
  localStorageSnapshot?: Record<string, any>;
}

export interface CloudBackupDocMeta {
  id: string;
  timestamp: string;
  version: string;
  updatedBy?: string;
  totalKeys?: number;
  chunkCount?: number;
  dataJson?: string;
  studentsStoredInCollection?: boolean;
}

const PRIMARY_DOC_PATH = 'school_data';
const PRIMARY_DOC_ID = 'primary_data';
const SNAPSHOT_CHUNK_PREFIX = 'snapshot_chunk';
const BACKUP_DOC_PATH = 'backups';
const BACKUP_DOC_ID = 'latest';
const BACKUP_CHUNK_PREFIX = 'latest_chunk';
const CHUNK_CHAR_LIMIT = 250000;
const PRIMARY_DOC_SAFE_CHAR_LIMIT = 620000;

export const LAST_SNAPSHOT_REV_KEY = 'sekolahku_last_snapshot_revision';
export const LAST_PUSHED_VERSION_KEY = 'sekolahku_last_pushed_version';
export const LAST_RESTORE_VERSION_KEY = 'sekolahku_last_restore_version';

const SESSION_ONLY_KEYS = new Set([
  'sekolahku_active_user',
  'sekolahku_last_activity',
  'sekolahku_last_tab',
  'sekolahku_last_cloud_sync',
  LAST_RESTORE_VERSION_KEY,
  LAST_SNAPSHOT_REV_KEY,
  LAST_PUSHED_VERSION_KEY,
  'sekolahku_students_seeded',
  'sekolahku_teachers_seeded',
  'sekolahku_attendance_seeded',
  'sekolahku_tka_questions_seeded',
  'sekolahku_cbt_exams_seeded',
]);

function dispatchCloudSyncEvents() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-cloud-sync-updated'));
    window.dispatchEvent(new Event('sekolahku-exam-results-updated'));
    window.dispatchEvent(new Event('sekolahku-cbt-exams-updated'));
    window.dispatchEvent(new Event('sekolahku-cbt-durations-updated'));
    window.dispatchEvent(new Event('sekolahku-tka-durations-updated'));
    window.dispatchEvent(new Event('sekolahku-tka-active-updated'));
    window.dispatchEvent(new Event('sekolahku-tka-questions-updated'));
  }
}

/**
 * Memecah objek JSON besar menjadi dokumen chunk Firestore agar selalu aman di bawah batas 1 MiB.
 */
async function writeChunkedJsonDocs(
  collectionName: string,
  prefix: string,
  dataObj: Record<string, any>
): Promise<number> {
  const jsonStr = JSON.stringify(dataObj || {});
  const totalChunks = Math.max(1, Math.ceil(jsonStr.length / CHUNK_CHAR_LIMIT));
  const writes: Promise<void>[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const slice = jsonStr.slice(i * CHUNK_CHAR_LIMIT, (i + 1) * CHUNK_CHAR_LIMIT);
    writes.push(
      setDoc(doc(db, collectionName, `${prefix}_${i}`), {
        index: i,
        totalChunks,
        data: slice,
        updatedAt: new Date().toISOString(),
      })
    );
  }

  await Promise.all(writes);
  return totalChunks;
}

/**
 * Membaca dan menggabungkan kembali dokumen chunk JSON dari Firestore.
 */
export async function readChunkedJsonDocs(
  collectionName: string,
  prefix: string,
  chunkCount: number
): Promise<Record<string, any> | null> {
  if (!chunkCount || chunkCount <= 0) return null;
  try {
    const snaps = await Promise.all(
      Array.from({ length: chunkCount }, (_, i) =>
        getDoc(doc(db, collectionName, `${prefix}_${i}`))
      )
    );
    let combined = '';
    for (const snap of snaps) {
      if (!snap.exists()) return null;
      const chunkData = snap.data()?.data;
      if (typeof chunkData !== 'string') return null;
      combined += chunkData;
    }
    if (!combined) return null;
    const parsed = JSON.parse(combined);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.error(`Gagal membaca chunk ${collectionName}/${prefix}:`, err);
    return null;
  }
}

export async function pullSnapshotChunksFromCloud(
  chunkCount: number
): Promise<Record<string, any> | null> {
  return readChunkedJsonDocs(PRIMARY_DOC_PATH, SNAPSHOT_CHUNK_PREFIX, chunkCount);
}

/**
 * Mengumpulkan seluruh key persistent `sekolahku_*` dari localStorage
 */
export function collectPersistentLocalBackup(options?: {
  excludeLargeCollections?: boolean;
}): Record<string, any> {
  const backupData: Record<string, any> = {};
  const largeKeys = new Set([
    'sekolahku_students',
    'sekolahku_teachers',
    'sekolahku_attendance_records',
    'sekolahku_cbt_exams',
    'sekolahku_tka_questions',
    'sekolahku_tka_submissions',
  ]);

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('sekolahku_') || SESSION_ONLY_KEYS.has(key) || key.endsWith('_in_idb')) {
      continue;
    }
    if (options?.excludeLargeCollections && largeKeys.has(key)) {
      continue;
    }
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      backupData[key] = JSON.parse(raw);
    } catch {
      backupData[key] = raw;
    }
  }

  backupData.sekolahku_cbt_results = getStoredCBTResults();
  backupData.sekolahku_tka_results = getStoredTKAResults();

  if (!options?.excludeLargeCollections) {
    backupData.sekolahku_students = getStoredStudents();
    backupData.sekolahku_teachers = getStoredTeachers();
    backupData.sekolahku_attendance_records = getStoredAttendance();
    backupData.sekolahku_cbt_exams = getStoredCBTExams();
    backupData.sekolahku_tka_questions = getStoredTKAQuestions();
    backupData.sekolahku_tka_submissions = getStoredTKASubmissions();
  }

  return backupData;
}

/**
 * Menggabungkan array hasil ujian (CBT/TKA) tanpa menghilangkan hasil siswa lain yang submit bersamaan
 */
function mergeExamResultsArrays(localArr: any[], incomingArr: any[]): any[] {
  const map = new Map<string, any>();
  const makeKey = (item: any, idx: number) =>
    item && (item.examId || item.studentId)
      ? `${item.examId || ''}__${item.studentId || ''}__${item.tanggal || ''}__${item.waktuSelesai || ''}`
      : `idx_${idx}_${JSON.stringify(item)}`;

  (Array.isArray(localArr) ? localArr : []).forEach((item, idx) => {
    map.set(makeKey(item, idx), item);
  });
  (Array.isArray(incomingArr) ? incomingArr : []).forEach((item, idx) => {
    const k = makeKey(item, idx);
    if (!map.has(k)) {
      map.set(k, item);
    }
  });
  return Array.from(map.values());
}

/**
 * Menggabungkan bucket draft ujian per studentId agar draft siswa lain tidak terhapus saat sinkronisasi
 */
function mergeDraftBucketsMap(
  localBuckets: Record<string, any>,
  incomingBuckets: Record<string, any>,
  nestedField: 'draftsByExam' | 'draftsByKey',
  currentStudentId?: string
): Record<string, any> {
  const merged: Record<string, any> = {
    ...(incomingBuckets && typeof incomingBuckets === 'object' ? incomingBuckets : {}),
  };

  if (localBuckets && typeof localBuckets === 'object') {
    Object.keys(localBuckets).forEach((sid) => {
      const localBucket = localBuckets[sid];
      const remoteBucket = merged[sid];
      if (!remoteBucket) {
        merged[sid] = localBucket;
        return;
      }

      // Selalu lindungi bucket milik siswa yang sedang aktif login di perangkat ini
      if (currentStudentId && sid === currentStudentId) {
        merged[sid] = localBucket;
        return;
      }

      const localNested = localBucket?.[nestedField] || {};
      const remoteNested = remoteBucket?.[nestedField] || {};
      const combinedNested: Record<string, any> = { ...remoteNested };

      Object.keys(localNested).forEach((draftId) => {
        const lDraft = localNested[draftId];
        const rDraft = combinedNested[draftId];
        if (!rDraft || (lDraft?.updatedAt || '') > (rDraft?.updatedAt || '')) {
          combinedNested[draftId] = lDraft;
        }
      });

      merged[sid] = {
        ...remoteBucket,
        ...localBucket,
        [nestedField]: combinedNested,
      };
    });
  }

  return merged;
}

/**
 * Menerapkan map key-value hasil cadangan ke localStorage tanpa menghapus sesi login aktif
 */
export function applyBackupMapToLocalStorage(
  dataMap: Record<string, any>,
  options?: { replaceAllNonSession?: boolean; currentStudentId?: string }
): number {
  if (!dataMap || typeof dataMap !== 'object') return 0;
  return runWithoutStorageSync(() => {
    if (options?.replaceAllNonSession) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('sekolahku_') || SESSION_ONLY_KEYS.has(k) || k.endsWith('_in_idb')) continue;
        if (k === 'sekolahku_admin_password' && dataMap[k] === undefined) continue;
        if (dataMap[k] === undefined) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => safeRemoveLocalStorage(k));
    }

    const isPartialRealtimeSync = !options?.replaceAllNonSession;
    const tkaSubmissionsSeeded = localStorage.getItem('sekolahku_tka_submissions_seeded') === 'true';
    const tkaQuestionsSeeded = localStorage.getItem('sekolahku_tka_questions_seeded') === 'true';
    const cbtExamsSeeded = localStorage.getItem('sekolahku_cbt_exams_seeded') === 'true';

    // Gabungkan & terapkan reset metadata TERLEBIH DAHULU sebelum memproses array hasil ujian
    const incomingResetMeta =
      dataMap.sekolahku_exam_results_reset_meta &&
      typeof dataMap.sekolahku_exam_results_reset_meta === 'object' &&
      !Array.isArray(dataMap.sekolahku_exam_results_reset_meta)
        ? (dataMap.sekolahku_exam_results_reset_meta as ExamResultsResetMeta)
        : undefined;
    const effectiveResetMeta = isPartialRealtimeSync
      ? mergeExamResultsResetMeta(getStoredExamResultsResetMeta(), incomingResetMeta)
      : incomingResetMeta || {};
    if (Object.keys(effectiveResetMeta).length > 0) {
      safeSetLocalStorage('sekolahku_exam_results_reset_meta', JSON.stringify(effectiveResetMeta));
      // Pangkas langsung hasil lokal lama yang sudah di-reset dari perangkat lain
      try {
        const localCbt = getStoredCBTResults();
        if (localCbt.length > 0) {
          saveStoredCBTResults(filterExamResultsByResetMeta(localCbt, undefined, effectiveResetMeta));
        }
        const localTka = getStoredTKAResults();
        if (localTka.length > 0) {
          saveStoredTKAResults(filterExamResultsByResetMeta(localTka, 'tka', effectiveResetMeta));
        }
      } catch {}
    }

    let count = 0;
    Object.keys(dataMap).forEach((key) => {
      if (!key.startsWith('sekolahku_') || SESSION_ONLY_KEYS.has(key) || key.endsWith('_in_idb')) return;
      if (key === 'sekolahku_exam_results_reset_meta' && isPartialRealtimeSync) return;
      const val = dataMap[key];
      if (val === undefined || val === null) return;

      if (isPartialRealtimeSync) {
        // Koleksi dedicated Firestore tetap menjadi single source of truth
        if (key === 'sekolahku_tka_submissions' && tkaSubmissionsSeeded) return;
        if (key === 'sekolahku_tka_questions' && tkaQuestionsSeeded) return;
        if (key === 'sekolahku_cbt_exams' && cbtExamsSeeded) return;

        // Gabungkan draft ujian per studentId agar siswa lain yang sedang ujian tidak terganggu
        if (
          (key === 'sekolahku_student_exam_drafts_v1' || key === 'sekolahku_tka_exam_drafts_v1') &&
          typeof val === 'object' &&
          !Array.isArray(val)
        ) {
          let localParsed: Record<string, any> = {};
          try {
            const rawLocal = localStorage.getItem(key);
            if (rawLocal) localParsed = JSON.parse(rawLocal) || {};
          } catch {}
          const nestedKey =
            key === 'sekolahku_student_exam_drafts_v1' ? 'draftsByExam' : 'draftsByKey';
          const merged = mergeDraftBucketsMap(
            localParsed,
            val,
            nestedKey,
            options?.currentStudentId
          );
          safeSetLocalStorage(key, JSON.stringify(merged));
          count++;
          return;
        }

        // Gabungkan hasil ujian CBT & TKA agar submit bersamaan tidak saling menimpa,
        // namun tetap mematuhi stempel waktu pengosongan data (effectiveResetMeta)
        if (
          (key === 'sekolahku_cbt_results' || key === 'sekolahku_tka_results') &&
          Array.isArray(val)
        ) {
          const isTkaKey = key === 'sekolahku_tka_results';
          const localArr = isTkaKey ? getStoredTKAResults() : getStoredCBTResults();
          const catHint = isTkaKey ? 'tka' : undefined;
          const cleanLocal = filterExamResultsByResetMeta(localArr, catHint, effectiveResetMeta);
          const cleanIncoming = filterExamResultsByResetMeta(val, catHint, effectiveResetMeta);
          const mergedArr = mergeExamResultsArrays(cleanLocal, cleanIncoming);
          if (isTkaKey) {
            saveStoredTKAResults(mergedArr);
          } else {
            saveStoredCBTResults(mergedArr);
          }
          count++;
          return;
        }

        // Gabungkan nilai asesmen per studentId agar submit mapel yang sama oleh siswa berbeda tetap utuh
        if (
          key.startsWith('sekolahku_assessments_data_') &&
          typeof val === 'object' &&
          !Array.isArray(val)
        ) {
          let localAssess: Record<string, any> = {};
          try {
            const rawLocal = localStorage.getItem(key);
            if (rawLocal) localAssess = JSON.parse(rawLocal) || {};
          } catch {}
          const mergedAssess: Record<string, any> = { ...localAssess };
          Object.keys(val).forEach((sid) => {
            const incomingStudent = val[sid];
            const localStudent = mergedAssess[sid];
            if (!localStudent) {
              mergedAssess[sid] = incomingStudent;
            } else {
              mergedAssess[sid] = {
                ...localStudent,
                ...incomingStudent,
                sumatif: { ...(localStudent.sumatif || {}), ...(incomingStudent.sumatif || {}) },
                remedial: { ...(localStudent.remedial || {}), ...(incomingStudent.remedial || {}) },
              };
            }
          });
          safeSetLocalStorage(key, JSON.stringify(mergedAssess));
          count++;
          return;
        }
      }

      if (key === 'sekolahku_tka_questions' && Array.isArray(val)) {
        saveStoredTKAQuestions(val);
        count++;
        return;
      }
      if (key === 'sekolahku_cbt_exams' && Array.isArray(val)) {
        saveStoredCBTExams(val);
        count++;
        return;
      }
      if (key === 'sekolahku_students' && Array.isArray(val)) {
        saveStoredStudents(val);
        count++;
        return;
      }
      if (key === 'sekolahku_teachers' && Array.isArray(val)) {
        saveStoredTeachers(val);
        count++;
        return;
      }
      if (key === 'sekolahku_attendance_records' && typeof val === 'object') {
        saveStoredAttendance(val);
        count++;
        return;
      }
      if (key === 'sekolahku_tka_submissions' && Array.isArray(val)) {
        saveStoredTKASubmissions(val);
        count++;
        return;
      }
      if (key === 'sekolahku_cbt_results' && Array.isArray(val)) {
        saveStoredCBTResults(val);
        count++;
        return;
      }
      if (key === 'sekolahku_tka_results' && Array.isArray(val)) {
        saveStoredTKAResults(val);
        count++;
        return;
      }

      if (typeof val === 'object') {
        safeSetLocalStorage(key, JSON.stringify(val));
      } else {
        safeSetLocalStorage(key, String(val));
      }
      count++;
    });
    return count;
  });
}

/**
 * Menjaga payload `school_data/primary_data` selalu aman di bawah batas 1 MiB Firestore.
 * Data siswa dan absensi selalu disimpan di koleksinya masing-masing, tidak di dokumen sentral.
 */
function buildSizeSafePrimaryPayload(basePayload: Record<string, any>): Record<string, any> {
  const cleanPayload: Record<string, any> = { ...basePayload };
  delete cleanPayload.students;
  delete cleanPayload.teachers;
  delete cleanPayload.attendance;
  delete cleanPayload.localStorageSnapshot;

  // Urutan prioritas field opsional bila ukuran mendekati batas 620 KB (datanya tetap aman di snapshot_chunk_*)
  const optionalLargeKeys = [
    'penilaianEkskul',
    'reportNotes',
    'subjectsByClass',
    'subjects',
    'profile',
    'kaldikDays',
  ];

  for (const key of optionalLargeKeys) {
    if (JSON.stringify(cleanPayload).length <= PRIMARY_DOC_SAFE_CHAR_LIMIT) {
      break;
    }
    delete cleanPayload[key];
  }

  return cleanPayload;
}

/**
 * Mengirim data ringan ke dokumen sentral `school_data/primary_data`.
 */
export async function pushAllDataToCloud(
  payload: Partial<CloudSyncPayload>,
  username: string = 'admin'
): Promise<boolean> {
  try {
    const docRef = doc(db, PRIMARY_DOC_PATH, PRIMARY_DOC_ID);
    const nextVersion = Date.now();
    const safeBody = buildSizeSafePrimaryPayload({
      ...payload,
      version: nextVersion,
      lastUpdated: new Date().toISOString(),
      updatedBy: username,
    });

    safeSetLocalStorage(LAST_PUSHED_VERSION_KEY, String(nextVersion));

    await setDoc(
      docRef,
      {
        ...safeBody,
        students: deleteField(),
        teachers: deleteField(),
        attendance: deleteField(),
        localStorageSnapshot: deleteField(),
        serverTime: serverTimestamp(),
      },
      { merge: true }
    );
    safeSetLocalStorage('sekolahku_last_cloud_sync', new Date().toISOString());
    return true;
  } catch (error) {
    console.error('Gagal mengirim data ke cloud:', error);
    return false;
  }
}

/**
 * Menarik data terbaru dari cloud Firestore untuk disinkronkan ke perangkat ini
 */
export async function pullAllDataFromCloud(): Promise<CloudSyncPayload | null> {
  try {
    const docRef = doc(db, PRIMARY_DOC_PATH, PRIMARY_DOC_ID);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data() as CloudSyncPayload;
      safeSetLocalStorage('sekolahku_last_cloud_sync', new Date().toISOString());
      return data;
    }
    return null;
  } catch (error) {
    console.error('Gagal menarik data dari cloud:', error);
    return null;
  }
}

/**
 * Listener realtime untuk perubahan data di perangkat lain (school_data/primary_data)
 */
export function subscribeToCloudChanges(
  onDataChanged: (data: CloudSyncPayload) => void
): () => void {
  try {
    const docRef = doc(db, PRIMARY_DOC_PATH, PRIMARY_DOC_ID);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as CloudSyncPayload;
          onDataChanged(data);
        }
      },
      (error) => {
        console.warn('Realtime cloud listener info:', error.message);
      }
    );
    return unsubscribe;
  } catch (e) {
    console.warn('Gagal memasang realtime sync:', e);
    return () => {};
  }
}

/**
 * Listener realtime untuk dokumen cadangan cloud (backups/latest)
 */
export function subscribeToCloudBackupDoc(
  onUpdate: (meta: CloudBackupDocMeta | null) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const docRef = doc(db, BACKUP_DOC_PATH, BACKUP_DOC_ID);
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          onUpdate(snapshot.data() as CloudBackupDocMeta);
        } else {
          onUpdate(null);
        }
      },
      (error) => {
        console.warn('Backup listener info:', error?.message);
        if (onError) onError(error);
      }
    );
  } catch (e) {
    if (onError) onError(e);
    return () => {};
  }
}

/**
 * Menulis cadangan penuh ke `backups/latest` (dengan chunking otomatis bila besar).
 */
async function writeCloudBackupDocs(
  backupMap: Record<string, any>,
  username: string
): Promise<void> {
  const jsonStr = JSON.stringify(backupMap || {});
  const totalKeys = Object.keys(backupMap || {}).length;

  if (jsonStr.length <= CHUNK_CHAR_LIMIT) {
    await setDoc(doc(db, BACKUP_DOC_PATH, BACKUP_DOC_ID), {
      id: BACKUP_DOC_ID,
      timestamp: new Date().toISOString(),
      version: '3.0',
      updatedBy: username,
      totalKeys,
      chunkCount: 0,
      studentsStoredInCollection: true,
      dataJson: jsonStr,
    });
  } else {
    const chunkCount = await writeChunkedJsonDocs(
      BACKUP_DOC_PATH,
      BACKUP_CHUNK_PREFIX,
      backupMap
    );
    await setDoc(doc(db, BACKUP_DOC_PATH, BACKUP_DOC_ID), {
      id: BACKUP_DOC_ID,
      timestamp: new Date().toISOString(),
      version: '3.0',
      updatedBy: username,
      totalKeys,
      chunkCount,
      studentsStoredInCollection: true,
      dataJson: '',
    });
  }
}

/**
 * Mengumpulkan semua metadata non-koleksi dan mengirimkannya secara aman (chunked) ke Firestore.
 */
async function pushSnapshotAndPrimaryDocs(
  username: string,
  options?: { restoreVersion?: number }
): Promise<number> {
  const profile = getStoredProfile();
  const teachers = getStoredTeachers();
  const subjects = getStoredSubjects();
  const kaldikDays = getStoredKaldik();
  const reportNotes = getStoredReportNotes();
  const tkaDurations = getStoredTKADurations();
  const cbtDurations = getStoredCBTDurations();
  const cbtActivePackages = getStoredCBTActivePackages();
  const tkaActivePackages = getStoredTKAActivePackages();
  const examResultsResetMeta = getStoredExamResultsResetMeta();

  let ekskulList: any = [];
  try {
    const ek = localStorage.getItem('sekolahku_ekskul_list');
    if (ek) ekskulList = JSON.parse(ek);
  } catch {}

  let penilaianEkskul: any = {};
  try {
    const pe = localStorage.getItem('sekolahku_penilaian_ekskul');
    if (pe) penilaianEkskul = JSON.parse(pe);
  } catch {}

  let subjectsByClass: any = {};
  try {
    const sbc = localStorage.getItem('sekolahku_subjects_by_class');
    if (sbc) subjectsByClass = JSON.parse(sbc);
  } catch {}

  const cbtAcakSoal = localStorage.getItem('sekolahku_cbt_acak_soal') === 'true';
  const cbtAcakJawaban = localStorage.getItem('sekolahku_cbt_acak_jawaban') === 'true';
  const tkaAcakSoal = localStorage.getItem('sekolahku_tka_acak_soal') === 'true';
  const tkaAcakJawaban = localStorage.getItem('sekolahku_tka_acak_jawaban') === 'true';

  const slimSnapshot = collectPersistentLocalBackup({ excludeLargeCollections: true });
  const snapshotChunkCount = await writeChunkedJsonDocs(
    PRIMARY_DOC_PATH,
    SNAPSHOT_CHUNK_PREFIX,
    slimSnapshot
  );

  const prevRev = Number(localStorage.getItem(LAST_SNAPSHOT_REV_KEY) || 0);
  const revision = Math.max(Date.now(), prevRev + 1);
  safeSetLocalStorage(LAST_SNAPSHOT_REV_KEY, String(revision));
  safeSetLocalStorage(LAST_PUSHED_VERSION_KEY, String(revision));
  if (options?.restoreVersion) {
    safeSetLocalStorage(LAST_RESTORE_VERSION_KEY, String(options.restoreVersion));
  }

  const primaryPayload = buildSizeSafePrimaryPayload({
    profile,
    teachers,
    subjects,
    subjectsByClass,
    kaldikDays,
    reportNotes,
    ekskulList,
    penilaianEkskul,
    cbtAcakSoal,
    cbtAcakJawaban,
    tkaAcakSoal,
    tkaAcakJawaban,
    tkaDurations,
    cbtDurations,
    cbtActivePackages,
    tkaActivePackages,
    examResultsResetMeta,
    snapshotChunkCount,
    snapshotRevision: revision,
    ...(options?.restoreVersion ? { restoreVersion: options.restoreVersion } : {}),
    version: revision,
    lastUpdated: new Date().toISOString(),
    updatedBy: username,
  });

  await setDoc(
    doc(db, PRIMARY_DOC_PATH, PRIMARY_DOC_ID),
    {
      ...primaryPayload,
      students: deleteField(),
      teachers: deleteField(),
      attendance: deleteField(),
      localStorageSnapshot: deleteField(),
      serverTime: serverTimestamp(),
    },
    { merge: true }
  );

  safeSetLocalStorage('sekolahku_last_cloud_sync', new Date().toISOString());
  return revision;
}

/**
 * Mengirim seluruh data localStorage (termasuk koleksi siswa, absensi, kaldik,
 * serta snapshot chunked untuk seluruh modul) ke cloud Firestore secara aman & real-time.
 */
export async function syncAllLocalToCloud(username: string = 'admin'): Promise<boolean> {
  try {
    const fullBackupMap = collectPersistentLocalBackup();
    await writeCloudBackupDocs(fullBackupMap, username);
    await pushSnapshotAndPrimaryDocs(username);
    return true;
  } catch (err) {
    console.error('Gagal sinkron penuh ke cloud:', err);
    return false;
  }
}

let moduleSyncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Menjadwalkan sinkronisasi real-time otomatis (debounced) setiap kali ada perubahan data modul lokal
 * seperti Penilaian, CBT, TKA, Catatan Wali, Kurikulum, Ekskul, dsb.
 */
export function scheduleRealtimeModuleSync(username?: string) {
  if (moduleSyncTimer) {
    clearTimeout(moduleSyncTimer);
  }
  moduleSyncTimer = setTimeout(async () => {
    try {
      const actor =
        username ||
        (() => {
          try {
            const raw = localStorage.getItem('sekolahku_active_user');
            return raw ? JSON.parse(raw).name || 'admin' : 'admin';
          } catch {
            return 'admin';
          }
        })();
      const slimBackupMap = collectPersistentLocalBackup({ excludeLargeCollections: true });
      await writeCloudBackupDocs(slimBackupMap, actor);
      await pushSnapshotAndPrimaryDocs(actor);
    } catch (err) {
      console.warn('Auto module realtime sync warning:', err);
    }
  }, 1000);
}

export interface RestoreCloudResult {
  restoredKeysCount: number;
  studentsCount: number;
  attendanceCount: number;
  kaldikCount: number;
  restoreVersion: number;
}

/**
 * Memulihkan file cadangan JSON ke localStorage DAN langsung menyinkronkan seluruh koleksi
 * secara real-time ke Firebase Firestore (replace koleksi students & attendance agar bersih,
 * update settings/kaldik_days, tulis snapshot chunked ke school_data, dan backups/latest).
 */
export async function restoreBackupJsonToCloudRealtime(
  jsonString: string,
  username: string = 'admin'
): Promise<RestoreCloudResult> {
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Format file cadangan JSON tidak valid.');
  }

  // Batalkan auto-sync tertunda sebelum restore agar tidak menimpa data cadangan
  if (moduleSyncTimer) {
    clearTimeout(moduleSyncTimer);
    moduleSyncTimer = null;
  }

  const restoreVersion = Date.now();

  // 1. Terapkan seluruh kunci persistent ke localStorage lokal tanpa memicu hook auto-sync
  const isFullBackup = Object.keys(parsed).length >= 3;
  const restoredKeysCount = applyBackupMapToLocalStorage(parsed, {
    replaceAllNonSession: isFullBackup,
  });

  // 2. Ganti penuh koleksi 'students' di Firestore (hapus siswa usang + tulis siswa cadangan)
  const restoredStudents: Student[] = Array.isArray(parsed.sekolahku_students)
    ? parsed.sekolahku_students
    : getStoredStudents();
  await replaceStudentsInFirestore(restoredStudents, username);

  // 2b. Ganti penuh koleksi 'teachers' di Firestore (maksimal 60 guru/pegawai)
  const restoredTeachers: Teacher[] = Array.isArray(parsed.sekolahku_teachers)
    ? parsed.sekolahku_teachers
    : getStoredTeachers();
  await replaceTeachersInFirestore(restoredTeachers);

  // 3. Ganti penuh koleksi 'attendance' di Firestore (hapus absensi usang + tulis absensi cadangan)
  const rawAttendance = parsed.sekolahku_attendance_records;
  let attendanceList: AttendanceRecordItem[] = [];
  if (rawAttendance && typeof rawAttendance === 'object' && !Array.isArray(rawAttendance)) {
    attendanceList = Object.entries(rawAttendance)
      .map(([key, val]: [string, any]) => ({
        id: val?.id || key,
        studentId: val?.studentId || '',
        date: val?.date || '',
        status: val?.status || 'H',
        time: val?.time || '07:00',
      }))
      .filter((r) => Boolean(r.studentId && r.date));
    await replaceAttendanceInFirestore(attendanceList);
  } else {
    const existingAtt = getStoredAttendance();
    attendanceList = Object.values(existingAtt);
  }

  // 4. Sinkronkan Kaldik ke settings/kaldik_days
  const restoredKaldik: KaldikDay[] = Array.isArray(parsed.sekolahku_kaldik_holidays)
    ? parsed.sekolahku_kaldik_holidays
    : getStoredKaldik();
  await saveKaldikToFirestore(restoredKaldik);

  // 4b. Ganti penuh koleksi 'tka_questions' di Firestore agar Bank Soal TKA ikut realtime
  const restoredTkaQuestions = Array.isArray(parsed.sekolahku_tka_questions)
    ? parsed.sekolahku_tka_questions
    : getStoredTKAQuestions();
  await replaceTkaQuestionsInFirestore(restoredTkaQuestions);

  // 4c. Ganti penuh koleksi 'cbt_exams' di Firestore agar Paket Soal CBT ikut realtime
  const restoredCbtExams = Array.isArray(parsed.sekolahku_cbt_exams)
    ? parsed.sekolahku_cbt_exams
    : getStoredCBTExams();
  await replaceCbtExamsInFirestore(restoredCbtExams);

  // 4d. Ganti penuh koleksi 'tka_submissions' di Firestore agar Rekap & Hasil TKA (120+ siswa) ikut realtime
  const restoredTkaSubs = Array.isArray(parsed.sekolahku_tka_submissions)
    ? parsed.sekolahku_tka_submissions
    : getStoredTKASubmissions();
  await replaceTkaSubmissionsInFirestore(restoredTkaSubs);

  // 5. Simpan cadangan penuh ke backups/latest (chunked otomatis bila > 250 KB)
  const fullBackupMap = collectPersistentLocalBackup();
  await writeCloudBackupDocs(fullBackupMap, username);

  // 6. Tulis snapshot chunked + dokumen sentral ringan school_data/primary_data (memicu onSnapshot di semua perangkat!)
  await pushSnapshotAndPrimaryDocs(username, { restoreVersion });

  dispatchCloudSyncEvents();

  return {
    restoredKeysCount,
    studentsCount: restoredStudents.length,
    attendanceCount: attendanceList.length,
    kaldikCount: restoredKaldik.length,
    restoreVersion,
  };
}

/**
 * Menarik cadangan terbaru langsung dari Firebase Firestore
 * (backups/latest + chunks + school_data + snapshot chunks + students + attendance + kaldik)
 * dan menerapkannya secara real-time ke aplikasi.
 */
export async function pullBackupFromCloudRealtime(): Promise<{
  restoredKeysCount: number;
  studentsCount: number;
  attendanceCount: number;
}> {
  let restoredKeysCount = 0;

  const [
    backupSnap,
    primaryCloud,
    firestoreStudents,
    firestoreTeachers,
    firestoreAttendance,
    firestoreKaldik,
    firestoreTkaQuestions,
    firestoreCbtExams,
    firestoreTkaSubmissions,
  ] = await Promise.all([
    getDoc(doc(db, BACKUP_DOC_PATH, BACKUP_DOC_ID)),
    pullAllDataFromCloud(),
    fetchStudentsFromFirestore(),
    fetchTeachersFromFirestore(),
    fetchAttendanceFromFirestore(),
    fetchKaldikFromFirestore(),
    fetchTkaQuestionsFromFirestore(),
    fetchCbtExamsFromFirestore(),
    fetchTkaSubmissionsFromFirestore(),
  ]);

  runWithoutStorageSync(() => {
    // Akan diisi dari async chunks di bawah sebelum blok ini tidak perlu async
  });

  if (backupSnap.exists()) {
    const bData = backupSnap.data() as CloudBackupDocMeta;
    let parsedBackup: Record<string, any> | null = null;
    if (bData?.chunkCount && bData.chunkCount > 0) {
      parsedBackup = await readChunkedJsonDocs(
        BACKUP_DOC_PATH,
        BACKUP_CHUNK_PREFIX,
        bData.chunkCount
      );
    } else if (bData?.dataJson) {
      try {
        parsedBackup = JSON.parse(bData.dataJson);
      } catch {}
    }
    if (parsedBackup) {
      restoredKeysCount += applyBackupMapToLocalStorage(parsedBackup);
    }
  }

  if (primaryCloud?.snapshotChunkCount && primaryCloud.snapshotChunkCount > 0) {
    const snapshotMap = await pullSnapshotChunksFromCloud(primaryCloud.snapshotChunkCount);
    if (snapshotMap) {
      restoredKeysCount += applyBackupMapToLocalStorage(snapshotMap);
    }
  }

  runWithoutStorageSync(() => {
    if (primaryCloud?.localStorageSnapshot) {
      restoredKeysCount += applyBackupMapToLocalStorage(primaryCloud.localStorageSnapshot);
    }
    if (primaryCloud?.profile) {
      safeSetLocalStorage('sekolahku_school_profile', JSON.stringify(primaryCloud.profile));
      restoredKeysCount++;
    }
    if (primaryCloud?.teachers) {
      saveStoredTeachers(primaryCloud.teachers);
      restoredKeysCount++;
    }
    if (primaryCloud?.subjectsByClass) {
      safeSetLocalStorage(
        'sekolahku_subjects_by_class',
        JSON.stringify(primaryCloud.subjectsByClass)
      );
      restoredKeysCount++;
    }
    if (primaryCloud?.reportNotes) {
      safeSetLocalStorage('sekolahku_report_notes', JSON.stringify(primaryCloud.reportNotes));
      restoredKeysCount++;
    }
    if (primaryCloud?.ekskulList) {
      safeSetLocalStorage('sekolahku_ekskul_list', JSON.stringify(primaryCloud.ekskulList));
      restoredKeysCount++;
    }
    if (primaryCloud?.penilaianEkskul) {
      safeSetLocalStorage(
        'sekolahku_penilaian_ekskul',
        JSON.stringify(primaryCloud.penilaianEkskul)
      );
      restoredKeysCount++;
    }
    if (primaryCloud?.tkaDurations) {
      saveStoredTKADurations(primaryCloud.tkaDurations);
      restoredKeysCount++;
    }

    if (firestoreStudents.length > 0) {
      saveStoredStudents(firestoreStudents);
      safeSetLocalStorage('sekolahku_students_seeded', 'true');
    }
    if (firestoreTeachers.length > 0) {
      saveStoredTeachers(firestoreTeachers);
      safeSetLocalStorage('sekolahku_teachers_seeded', 'true');
    }
    if (Object.keys(firestoreAttendance).length > 0) {
      saveStoredAttendance(firestoreAttendance);
      safeSetLocalStorage('sekolahku_attendance_seeded', 'true');
    }
    if (firestoreKaldik && firestoreKaldik.length > 0) {
      saveStoredKaldik(firestoreKaldik);
    }
    if (firestoreTkaQuestions && firestoreTkaQuestions.length > 0) {
      saveStoredTKAQuestions(firestoreTkaQuestions);
      safeSetLocalStorage('sekolahku_tka_questions_seeded', 'true');
    }
    if (firestoreCbtExams && firestoreCbtExams.length > 0) {
      saveStoredCBTExams(firestoreCbtExams);
      safeSetLocalStorage('sekolahku_cbt_exams_seeded', 'true');
    }
    if (firestoreTkaSubmissions && firestoreTkaSubmissions.length > 0) {
      const pendingSubs = getPendingTkaSubmissions();
      const mergedSubs = mergeTkaSubmissionLists(firestoreTkaSubmissions, pendingSubs);
      saveStoredTKASubmissions(mergedSubs);
      safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
    }

    const rev = primaryCloud?.snapshotRevision || primaryCloud?.restoreVersion || primaryCloud?.version;
    if (rev) {
      safeSetLocalStorage(LAST_SNAPSHOT_REV_KEY, String(rev));
      safeSetLocalStorage(LAST_PUSHED_VERSION_KEY, String(rev));
    }
  });

  // Rekonsiliasi hasil TKA yang tersimpan di cbt_results/backups apabila belum masuk ke koleksi tka_submissions
  await reconcileTkaFromCloudBackup().catch(() => {});

  dispatchCloudSyncEvents();

  return {
    restoredKeysCount,
    studentsCount: firestoreStudents.length,
    attendanceCount: Object.keys(firestoreAttendance).length,
  };
}

function filterTkaSubmissionsByResetMeta(
  subs: TKASubmissionItem[],
  resetMeta: ExamResultsResetMeta
): TKASubmissionItem[] {
  const list = Array.isArray(subs) ? subs : [];
  const tkaClearedAt = Number(resetMeta?.tkaClearedAt || 0);
  const paketEntries = Object.entries(resetMeta?.paketClearedAt || {});
  if (!tkaClearedAt && paketEntries.length === 0) return list;

  return list.filter((sub) => {
    if (!sub || typeof sub !== 'object') return false;
    const parsedTs = sub.updatedAt ? Date.parse(sub.updatedAt) : 0;
    const ts = Number.isFinite(parsedTs) ? parsedTs : 0;
    if (tkaClearedAt > 0 && ts <= tkaClearedAt) {
      return false;
    }
    const basePaket = sub.paketDasar || extractBaseTkaPaket(sub.paket);
    for (const [key, clearedTs] of paketEntries) {
      const clearTime = Number(clearedTs || 0);
      if (clearTime <= 0 || ts > clearTime) continue;
      const parts = key.split('::');
      if (parts[0] === 'tka' && parts[1] && parts[1] === basePaket) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Memulihkan & menggabungkan hasil pengerjaan TKA siswa yang mungkin tersimpan
 * di `backups/latest`, `school_data` snapshot, antrean pending lokal, atau `sekolahku_cbt_results`
 * ke koleksi dedicated `tka_submissions` di Firestore (tetap mematuhi timestamp pengosongan data).
 */
export async function reconcileTkaFromCloudBackup(): Promise<{
  recoveredCount: number;
  syncedCount: number;
}> {
  try {
    await flushPendingTkaSubmissionsToFirestore().catch(() => 0);

    const [backupSnap, primaryCloud, firestoreTkaSubs, firestoreStudents] = await Promise.all([
      getDoc(doc(db, BACKUP_DOC_PATH, BACKUP_DOC_ID)),
      pullAllDataFromCloud(),
      fetchTkaSubmissionsFromFirestore(),
      fetchStudentsFromFirestore(),
    ]);

    let parsedBackup: Record<string, any> | null = null;
    if (backupSnap.exists()) {
      const bData = backupSnap.data() as CloudBackupDocMeta;
      if (bData?.chunkCount && bData.chunkCount > 0) {
        parsedBackup = await readChunkedJsonDocs(
          BACKUP_DOC_PATH,
          BACKUP_CHUNK_PREFIX,
          bData.chunkCount
        );
      } else if (bData?.dataJson) {
        try {
          parsedBackup = JSON.parse(bData.dataJson);
        } catch {}
      }
    }

    let snapshotMap: Record<string, any> | null = null;
    if (primaryCloud?.snapshotChunkCount && primaryCloud.snapshotChunkCount > 0) {
      snapshotMap = await pullSnapshotChunksFromCloud(primaryCloud.snapshotChunkCount);
    }

    let effectiveResetMeta = mergeExamResultsResetMeta(
      getStoredExamResultsResetMeta(),
      primaryCloud?.examResultsResetMeta
    );
    if (snapshotMap?.sekolahku_exam_results_reset_meta) {
      effectiveResetMeta = mergeExamResultsResetMeta(
        effectiveResetMeta,
        snapshotMap.sekolahku_exam_results_reset_meta
      );
    }
    if (parsedBackup?.sekolahku_exam_results_reset_meta) {
      effectiveResetMeta = mergeExamResultsResetMeta(
        effectiveResetMeta,
        parsedBackup.sekolahku_exam_results_reset_meta
      );
    }
    if (Object.keys(effectiveResetMeta).length > 0) {
      runWithoutStorageSync(() => {
        saveStoredExamResultsResetMeta(effectiveResetMeta);
      });
    }

    const studentsList = firestoreStudents.length > 0 ? firestoreStudents : getStoredStudents();

    const allCbtResults = [
      ...getStoredCBTResults(),
      ...(Array.isArray(parsedBackup?.sekolahku_cbt_results) ? parsedBackup!.sekolahku_cbt_results : []),
      ...(Array.isArray(snapshotMap?.sekolahku_cbt_results) ? snapshotMap!.sekolahku_cbt_results : []),
    ];
    const allTkaResults = [
      ...getStoredTKAResults(),
      ...(Array.isArray(parsedBackup?.sekolahku_tka_results) ? parsedBackup!.sekolahku_tka_results : []),
      ...(Array.isArray(snapshotMap?.sekolahku_tka_results) ? snapshotMap!.sekolahku_tka_results : []),
    ];

    const candidateBackupSubs: TKASubmissionItem[] = [
      ...getPendingTkaSubmissions(),
      ...getStoredTKASubmissions(),
      ...(Array.isArray(parsedBackup?.sekolahku_tka_submissions) ? parsedBackup!.sekolahku_tka_submissions : []),
      ...(Array.isArray(snapshotMap?.sekolahku_tka_submissions) ? snapshotMap!.sekolahku_tka_submissions : []),
    ];
    const validBackupSubs = filterTkaSubmissionsByResetMeta(candidateBackupSubs, effectiveResetMeta);

    const { recoveredItems } = reconcileTkaResultsToSubmissions({
      cbtResults: allCbtResults,
      tkaResults: allTkaResults,
      existingSubmissions: firestoreTkaSubs,
      students: studentsList,
      resetMeta: effectiveResetMeta,
    });

    const mergedAll = mergeTkaSubmissionLists(firestoreTkaSubs, [
      ...validBackupSubs,
      ...recoveredItems,
    ]);

    const firestoreMap = new Map(firestoreTkaSubs.map((s) => [s.id, s]));
    const itemsToUpload = mergedAll.filter((item) => {
      const existing = firestoreMap.get(item.id);
      if (!existing) return true;
      const existingCompletedLen = Array.isArray(existing.completedMapels) ? existing.completedMapels.length : 0;
      const newCompletedLen = Array.isArray(item.completedMapels) ? item.completedMapels.length : 0;
      if (newCompletedLen > existingCompletedLen) return true;
      if ((item.updatedAt || '') > (existing.updatedAt || '') && item.skorTotal !== existing.skorTotal) {
        return true;
      }
      return false;
    });

    if (itemsToUpload.length > 0) {
      await saveTkaSubmissionsBatchToFirestore(itemsToUpload);
    }

    if (mergedAll.length > 0 || firestoreTkaSubs.length > 0) {
      runWithoutStorageSync(() => {
        saveStoredTKASubmissions(mergedAll);
      });
      safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
      dispatchCloudSyncEvents();
    }

    return {
      recoveredCount: itemsToUpload.length,
      syncedCount: mergedAll.length,
    };
  } catch (err) {
    console.warn('Reconcile TKA from cloud backup warning:', err);
    return { recoveredCount: 0, syncedCount: 0 };
  }
}

/**
 * Menghitung estimasi ukuran data yang tersimpan dan informasi tier Firebase Firestore
 */
export function getStorageStats() {
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sekolahku_')) {
      const val = localStorage.getItem(key) || '';
      totalBytes += (key.length + val.length) * 2; // UTF-16 approx
    }
  }

  const FIREBASE_FREE_TIER_BYTES = 1073741824;
  const usedKB = Math.round(totalBytes / 1024);
  const usedMB = (totalBytes / (1024 * 1024)).toFixed(2);
  const usedPercent = Math.max(0.01, (totalBytes / FIREBASE_FREE_TIER_BYTES) * 100).toFixed(3);
  const remainingPercent = (100 - parseFloat(usedPercent)).toFixed(2);

  const lastSyncStr = localStorage.getItem('sekolahku_last_cloud_sync');

  return {
    usedBytes: totalBytes,
    usedKB,
    usedMB,
    usedPercent,
    remainingPercent,
    limitStr: '1.0 GiB (Firebase Spark Tier Gratis)',
    dailyQuotaReads: '50.000 Dokumen / Hari',
    dailyQuotaWrites: '20.000 Dokumen / Hari',
    lastSyncTime: lastSyncStr ? new Date(lastSyncStr).toLocaleString('id-ID') : 'Baru saja tersinkron',
  };
}
