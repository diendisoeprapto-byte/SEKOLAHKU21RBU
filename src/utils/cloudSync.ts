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
  AttendanceRecord,
} from '../types';
import {
  getStoredProfile,
  getStoredTeachers,
  getStoredStudents,
  getStoredSubjects,
  getStoredKaldik,
  getStoredAttendance,
} from './storage';

export interface CloudSyncPayload {
  version: number;
  lastUpdated: string;
  updatedBy: string;
  profile?: SchoolProfile;
  teachers?: Teacher[];
  students?: Student[];
  subjects?: Subject[];
  subjectsByClass?: Record<string, Subject[]>;
  kaldikDays?: KaldikDay[];
  attendance?: Record<string, any>;
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
      predikat: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Kurang';
      keterangan: string;
    }>
  >;
  cbtAcakSoal?: boolean;
  cbtAcakJawaban?: boolean;
  tkaAcakSoal?: boolean;
  tkaAcakJawaban?: boolean;
}

const PRIMARY_DOC_PATH = 'school_data';
const PRIMARY_DOC_ID = 'primary_data';

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
 * Listener realtime untuk perubahan data di perangkat lain
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
 * Mengirim seluruh data localStorage (profile, teachers, students, subjects, kaldik, attendance, ekskul, settings)
 * ke cloud Firestore agar tersinkron sempurna di laptop, tablet, dan smartphone
 */
export async function syncAllLocalToCloud(username: string = 'admin'): Promise<boolean> {
  try {
    const profile = getStoredProfile();
    const teachers = getStoredTeachers();
    const students = getStoredStudents();
    const subjects = getStoredSubjects();
    const kaldikDays = getStoredKaldik();
    const attendance = getStoredAttendance();

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

    return await pushAllDataToCloud(
      {
        profile,
        teachers,
        students,
        subjects,
        subjectsByClass,
        kaldikDays,
        attendance,
        ekskulList,
        penilaianEkskul,
        cbtAcakSoal,
        cbtAcakJawaban,
        tkaAcakSoal,
        tkaAcakJawaban,
      },
      username
    );
  } catch (err) {
    console.error('Gagal sinkron penuh ke cloud:', err);
    return false;
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

  // Firebase Spark tier free limit: 1 GiB (1,073,741,824 bytes)
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
