import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  SchoolProfile,
  Teacher,
  Student,
  Subject,
  KaldikDay,
  StudentReportNotes,
} from '../types';
import {
  getStoredProfile,
  getStoredTeachers,
  getStoredStudents,
  getStoredSubjects,
  getStoredKaldik,
  getStoredAttendance,
  getStoredReportNotes,
  getStoredTKADurations,
  saveStoredTKADurations,
  AttendanceRecordItem,
} from './storage';
import { saveStudentsToFirestoreBatch, fetchStudentsFromFirestore } from './studentFirestore';
import { saveBatchAttendanceToFirestore, saveKaldikToFirestore, fetchKaldikFromFirestore } from './attendanceFirestore';

export interface CloudSyncPayload {
  version: number;
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
  localStorageSnapshot?: Record<string, any>;
}

export interface CloudBackupDocMeta {
  id: string;
  timestamp: string;
  version: string;
  updatedBy?: string;
  totalKeys?: number;
  dataJson?: string;
  studentsStoredInCollection?: boolean;
}

const PRIMARY_DOC_PATH = 'school_data';
const PRIMARY_DOC_ID = 'primary_data';
const BACKUP_DOC_PATH = 'backups';
const BACKUP_DOC_ID = 'latest';

const SESSION_ONLY_KEYS = new Set([
  'sekolahku_active_user',
  'sekolahku_last_activity',
  'sekolahku_last_tab',
  'sekolahku_last_cloud_sync',
  'sekolahku_last_restore_version',
]);

/**
 * Mengumpulkan seluruh key persistent `sekolahku_*` dari localStorage
 */
export function collectPersistentLocalBackup(options?: { excludeLargeCollections?: boolean }): Record<string, any> {
  const backupData: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('sekolahku_') || SESSION_ONLY_KEYS.has(key)) continue;
    if (
      options?.excludeLargeCollections &&
      (key === 'sekolahku_students' || key === 'sekolahku_attendance_records')
    ) {
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
  return backupData;
}

/**
 * Menerapkan map key-value hasil cadangan ke localStorage tanpa menghapus sesi login aktif
 */
export function applyBackupMapToLocalStorage(dataMap: Record<string, any>): number {
  if (!dataMap || typeof dataMap !== 'object') return 0;
  let count = 0;
  Object.keys(dataMap).forEach((key) => {
    if (!key.startsWith('sekolahku_') || SESSION_ONLY_KEYS.has(key)) return;
    const val = dataMap[key];
    if (val === undefined || val === null) return;
    if (typeof val === 'object') {
      localStorage.setItem(key, JSON.stringify(val));
    } else {
      localStorage.setItem(key, String(val));
    }
    count++;
  });
  return count;
}

/**
 * Mengirim seluruh data lokal ke cloud Firestore agar tersinkronisasi di semua perangkat
 */
export async function pushAllDataToCloud(
  payload: Partial<CloudSyncPayload>,
  username: string = 'admin'
): Promise<boolean> {
  try {
    const docRef = doc(db, PRIMARY_DOC_PATH, PRIMARY_DOC_ID);
    const dataToSave = {
      ...payload,
      version: Date.now(),
      lastUpdated: new Date().toISOString(),
      updatedBy: username,
      serverTime: serverTimestamp(),
    };
    await setDoc(docRef, dataToSave, { merge: true });
    localStorage.setItem('sekolahku_last_cloud_sync', new Date().toISOString());
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
      localStorage.setItem('sekolahku_last_cloud_sync', new Date().toISOString());
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
 * Mengirim seluruh data localStorage (termasuk snapshot semua modul: nilai, CBT, TKA, ekskul, catatan wali)
 * ke cloud Firestore agar tersinkron sempurna secara real-time di semua perangkat
 */
export async function syncAllLocalToCloud(username: string = 'admin'): Promise<boolean> {
  try {
    const profile = getStoredProfile();
    const teachers = getStoredTeachers();
    const students = getStoredStudents();
    const subjects = getStoredSubjects();
    const kaldikDays = getStoredKaldik();
    const attendance = getStoredAttendance();
    const reportNotes = getStoredReportNotes();

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
    const tkaDurations = getStoredTKADurations();
    const localStorageSnapshot = collectPersistentLocalBackup({ excludeLargeCollections: true });

    // Pastikan dokumen backups/latest juga ter-update aman (jaga batas 1 MiB)
    const fullBackupMap = collectPersistentLocalBackup();
    let backupJson = JSON.stringify(fullBackupMap);
    let studentsStoredInCollection = false;
    if (backupJson.length > 820000) {
      backupJson = JSON.stringify(localStorageSnapshot);
      studentsStoredInCollection = true;
    }

    await setDoc(doc(db, BACKUP_DOC_PATH, BACKUP_DOC_ID), {
      id: BACKUP_DOC_ID,
      timestamp: new Date().toISOString(),
      version: '2.0',
      updatedBy: username,
      totalKeys: Object.keys(fullBackupMap).length,
      studentsStoredInCollection,
      dataJson: backupJson,
    });

    return await pushAllDataToCloud(
      {
        profile,
        teachers,
        students,
        subjects,
        subjectsByClass,
        kaldikDays,
        attendance,
        reportNotes,
        ekskulList,
        penilaianEkskul,
        cbtAcakSoal,
        cbtAcakJawaban,
        tkaAcakSoal,
        tkaAcakJawaban,
        tkaDurations,
        localStorageSnapshot,
      },
      username
    );
  } catch (err) {
    console.error('Gagal sinkron penuh ke cloud:', err);
    return false;
  }
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
 * secara real-time ke Firebase Firestore (students, attendance, settings/kaldik_days,
 * school_data/primary_data, dan backups/latest) sehingga seluruh perangkat ikut terupdate real-time.
 */
export async function restoreBackupJsonToCloudRealtime(
  jsonString: string,
  username: string = 'admin'
): Promise<RestoreCloudResult> {
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Format file cadangan JSON tidak valid.');
  }

  // 1. Terapkan seluruh kunci persistent ke localStorage lokal
  const restoredKeysCount = applyBackupMapToLocalStorage(parsed);
  const restoreVersion = Date.now();
  localStorage.setItem('sekolahku_last_restore_version', String(restoreVersion));

  // 2. Sinkronkan koleksi 'students' secara real-time ke Firestore
  const restoredStudents: Student[] = Array.isArray(parsed.sekolahku_students)
    ? parsed.sekolahku_students
    : getStoredStudents();
  if (Array.isArray(parsed.sekolahku_students) && restoredStudents.length > 0) {
    await saveStudentsToFirestoreBatch(restoredStudents, username);
  }

  // 3. Sinkronkan koleksi 'attendance' secara real-time ke Firestore
  const rawAttendance = parsed.sekolahku_attendance_records;
  let attendanceList: AttendanceRecordItem[] = [];
  if (rawAttendance && typeof rawAttendance === 'object') {
    attendanceList = Object.entries(rawAttendance)
      .map(([key, val]: [string, any]) => ({
        id: val?.id || key,
        studentId: val?.studentId || '',
        date: val?.date || '',
        status: val?.status || 'H',
        time: val?.time || '07:00',
      }))
      .filter((r) => Boolean(r.studentId && r.date));
    if (attendanceList.length > 0) {
      await saveBatchAttendanceToFirestore(attendanceList);
    }
  }

  // 4. Sinkronkan Kaldik ke settings/kaldik_days
  const restoredKaldik: KaldikDay[] = Array.isArray(parsed.sekolahku_kaldik_holidays)
    ? parsed.sekolahku_kaldik_holidays
    : getStoredKaldik();
  if (Array.isArray(parsed.sekolahku_kaldik_holidays) && restoredKaldik.length > 0) {
    await saveKaldikToFirestore(restoredKaldik);
  }

  // 5. Bangun snapshot ringan (< 1 MiB) untuk school_data/primary_data & backups/latest
  const slimSnapshot = collectPersistentLocalBackup({ excludeLargeCollections: true });
  let backupJson = JSON.stringify(parsed);
  let studentsStoredInCollection = false;
  if (backupJson.length > 820000) {
    backupJson = JSON.stringify(slimSnapshot);
    studentsStoredInCollection = true;
  }

  await setDoc(doc(db, BACKUP_DOC_PATH, BACKUP_DOC_ID), {
    id: BACKUP_DOC_ID,
    timestamp: new Date().toISOString(),
    version: '2.0',
    updatedBy: username,
    totalKeys: Object.keys(parsed).length,
    studentsStoredInCollection,
    dataJson: backupJson,
  });

  await pushAllDataToCloud(
    {
      profile: parsed.sekolahku_school_profile || getStoredProfile(),
      teachers: parsed.sekolahku_teachers || getStoredTeachers(),
      students: restoredStudents,
      subjects: parsed.sekolahku_subjects || getStoredSubjects(),
      subjectsByClass: parsed.sekolahku_subjects_by_class || undefined,
      kaldikDays: restoredKaldik,
      attendance: rawAttendance || getStoredAttendance(),
      reportNotes: parsed.sekolahku_report_notes || getStoredReportNotes(),
      ekskulList: parsed.sekolahku_ekskul_list || undefined,
      penilaianEkskul: parsed.sekolahku_penilaian_ekskul || undefined,
      cbtAcakSoal: parsed.sekolahku_cbt_acak_soal === true || parsed.sekolahku_cbt_acak_soal === 'true',
      cbtAcakJawaban: parsed.sekolahku_cbt_acak_jawaban === true || parsed.sekolahku_cbt_acak_jawaban === 'true',
      tkaAcakSoal: parsed.sekolahku_tka_acak_soal === true || parsed.sekolahku_tka_acak_soal === 'true',
      tkaAcakJawaban: parsed.sekolahku_tka_acak_jawaban === true || parsed.sekolahku_tka_acak_jawaban === 'true',
      tkaDurations: parsed.sekolahku_tka_durations || getStoredTKADurations(),
      localStorageSnapshot: slimSnapshot,
      restoreVersion,
    },
    username
  );

  return {
    restoredKeysCount,
    studentsCount: restoredStudents.length,
    attendanceCount: attendanceList.length,
    kaldikCount: restoredKaldik.length,
    restoreVersion,
  };
}

/**
 * Menarik cadangan terbaru langsung dari Firebase Firestore (backups/latest + school_data + students + kaldik)
 * dan menerapkannya secara real-time ke aplikasi.
 */
export async function pullBackupFromCloudRealtime(): Promise<{
  restoredKeysCount: number;
  studentsCount: number;
}> {
  let restoredKeysCount = 0;

  const [backupSnap, primaryCloud, firestoreStudents, firestoreKaldik] = await Promise.all([
    getDoc(doc(db, BACKUP_DOC_PATH, BACKUP_DOC_ID)),
    pullAllDataFromCloud(),
    fetchStudentsFromFirestore(),
    fetchKaldikFromFirestore(),
  ]);

  if (backupSnap.exists()) {
    const bData = backupSnap.data() as CloudBackupDocMeta;
    if (bData?.dataJson) {
      const parsed = JSON.parse(bData.dataJson);
      restoredKeysCount += applyBackupMapToLocalStorage(parsed);
    }
  }

  if (primaryCloud?.localStorageSnapshot) {
    restoredKeysCount += applyBackupMapToLocalStorage(primaryCloud.localStorageSnapshot);
  }
  if (primaryCloud?.profile) {
    localStorage.setItem('sekolahku_school_profile', JSON.stringify(primaryCloud.profile));
    restoredKeysCount++;
  }
  if (primaryCloud?.teachers) {
    localStorage.setItem('sekolahku_teachers', JSON.stringify(primaryCloud.teachers));
    restoredKeysCount++;
  }
  if (primaryCloud?.subjectsByClass) {
    localStorage.setItem('sekolahku_subjects_by_class', JSON.stringify(primaryCloud.subjectsByClass));
    restoredKeysCount++;
  }
  if (primaryCloud?.reportNotes) {
    localStorage.setItem('sekolahku_report_notes', JSON.stringify(primaryCloud.reportNotes));
    restoredKeysCount++;
  }
  if (primaryCloud?.tkaDurations) {
    saveStoredTKADurations(primaryCloud.tkaDurations);
    restoredKeysCount++;
  }
  if (firestoreStudents.length > 0) {
    localStorage.setItem('sekolahku_students', JSON.stringify(firestoreStudents));
    localStorage.setItem('sekolahku_students_seeded', 'true');
  }
  if (firestoreKaldik && firestoreKaldik.length > 0) {
    localStorage.setItem('sekolahku_kaldik_holidays', JSON.stringify(firestoreKaldik));
  }

  return {
    restoredKeysCount,
    studentsCount: firestoreStudents.length,
  };
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
