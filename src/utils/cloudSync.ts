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

export interface CloudSyncPayload {
  version: number;
  lastUpdated: string;
  updatedBy: string;
  profile?: SchoolProfile;
  teachers?: Teacher[];
  students?: Student[];
  subjects?: Subject[];
  kaldikDays?: KaldikDay[];
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
