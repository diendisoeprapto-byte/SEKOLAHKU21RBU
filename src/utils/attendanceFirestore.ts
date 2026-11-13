import {
  collection,
  doc,
  writeBatch,
  onSnapshot,
  setDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { AttendanceRecordItem, saveStoredAttendance } from './storage';
import { KaldikDay } from '../types';

export const ATTENDANCE_COLLECTION = 'attendance';
export const KALDIK_DOC_COLLECTION = 'settings';
export const KALDIK_DOC_ID = 'kaldik_days';

/**
 * Menyimpan satu catatan kehadiran siswa secara langsung ke koleksi 'attendance' di Firestore
 */
export async function saveSingleAttendanceToFirestore(
  record: AttendanceRecordItem
): Promise<boolean> {
  try {
    const docId = record.id || `${record.date}_${record.studentId}`;
    const docRef = doc(db, ATTENDANCE_COLLECTION, docId);
    await setDoc(
      docRef,
      {
        ...record,
        id: docId,
        updatedAt: new Date().toISOString(),
        serverTime: serverTimestamp(),
      },
      { merge: true }
    );
    localStorage.setItem('sekolahku_attendance_seeded', 'true');
    return true;
  } catch (error) {
    console.error('Gagal menyimpan kehadiran siswa ke Firestore:', error);
    throw error;
  }
}

/**
 * Menyimpan banyak catatan kehadiran sekaligus menggunakan writeBatch (Tandai Semua Hadir / seed)
 */
export async function saveBatchAttendanceToFirestore(
  records: AttendanceRecordItem[]
): Promise<boolean> {
  try {
    if (records && records.length > 0) {
      const CHUNK_SIZE = 400;
      const totalChunks = Math.ceil(records.length / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = records.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((rec) => {
          const docId = rec.id || `${rec.date}_${rec.studentId}`;
          const docRef = doc(db, ATTENDANCE_COLLECTION, docId);
          batch.set(
            docRef,
            {
              ...rec,
              id: docId,
              updatedAt: new Date().toISOString(),
              serverTime: serverTimestamp(),
            },
            { merge: true }
          );
        });

        await batch.commit();
      }
    }
    localStorage.setItem('sekolahku_attendance_seeded', 'true');
    return true;
  } catch (error) {
    console.error('Gagal menyimpan batch kehadiran ke Firestore:', error);
    throw error;
  }
}

/**
 * Menghapus beberapa catatan kehadiran dari Firestore (reset harian / reset bulanan)
 */
export async function deleteAttendanceRecordsFromFirestore(
  recordIds: string[]
): Promise<boolean> {
  try {
    if (recordIds.length > 0) {
      const CHUNK_SIZE = 400;
      const totalChunks = Math.ceil(recordIds.length / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = recordIds.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => {
          const docRef = doc(db, ATTENDANCE_COLLECTION, id);
          batch.delete(docRef);
        });
        await batch.commit();
      }
    }
    localStorage.setItem('sekolahku_attendance_seeded', 'true');
    return true;
  } catch (error) {
    console.error('Gagal menghapus data kehadiran dari Firestore:', error);
    throw error;
  }
}

/**
 * Realtime listener onSnapshot untuk koleksi 'attendance' di Firestore
 */
export function subscribeToAttendanceCollection(
  onUpdate: (records: Record<string, AttendanceRecordItem>) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const colRef = collection(db, ATTENDANCE_COLLECTION);
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const map: Record<string, AttendanceRecordItem> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as AttendanceRecordItem;
          const key = data.date && data.studentId ? `${data.date}_${data.studentId}` : docSnap.id;
          map[key] = {
            id: docSnap.id,
            studentId: data.studentId,
            date: data.date,
            status: data.status,
            time: data.time || '07:00',
          };
        });
        saveStoredAttendance(map);
        onUpdate(map);
      },
      (error) => {
        console.error('Error listener onSnapshot attendance:', error);
        if (onError) onError(error);
      }
    );
    return unsubscribe;
  } catch (e) {
    console.error('Gagal mendaftarkan listener attendance:', e);
    return () => {};
  }
}

/**
 * Menyimpan Kaldik langsung ke dokumen dedicated settings/kaldik_days
 * agar sinkron real-time dengan AbsensiTab & KalenderTab tanpa terhambat ukuran dokumen utama.
 */
export async function saveKaldikToFirestore(days: KaldikDay[]): Promise<boolean> {
  try {
    const docRef = doc(db, KALDIK_DOC_COLLECTION, KALDIK_DOC_ID);
    await setDoc(
      docRef,
      {
        days,
        updatedAt: new Date().toISOString(),
        serverTime: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Gagal menyimpan kaldik ke Firestore:', error);
    return false;
  }
}

export async function fetchKaldikFromFirestore(): Promise<KaldikDay[] | null> {
  try {
    const docRef = doc(db, KALDIK_DOC_COLLECTION, KALDIK_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as { days?: KaldikDay[] };
      if (Array.isArray(data.days)) return data.days;
    }
    return null;
  } catch {
    return null;
  }
}

export function subscribeToKaldikDoc(
  onUpdate: (days: KaldikDay[]) => void
): () => void {
  try {
    const docRef = doc(db, KALDIK_DOC_COLLECTION, KALDIK_DOC_ID);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { days?: KaldikDay[] };
          if (Array.isArray(data.days)) {
            onUpdate(data.days);
          }
        }
      },
      (err) => {
        console.warn('Kaldik listener warning:', err);
      }
    );
  } catch {
    return () => {};
  }
}
