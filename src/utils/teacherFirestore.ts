import {
  collection,
  doc,
  writeBatch,
  onSnapshot,
  getDocs,
  deleteDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Teacher } from '../types';
import { saveStoredTeachers } from './storage';

export const TEACHERS_COLLECTION = 'teachers';
export const MAX_TEACHERS = 60;

export function sortTeachersAlphabetically(list: Teacher[]): Teacher[] {
  return [...list].sort((a, b) =>
    (a.nama || '').localeCompare(b.nama || '', 'id', { sensitivity: 'base' })
  );
}

export async function saveSingleTeacherToFirestore(
  teacher: Teacher,
  updatedAllTeachers?: Teacher[]
): Promise<void> {
  const teacherId = teacher.id || `t_${Date.now()}`;
  await setDoc(
    doc(db, TEACHERS_COLLECTION, teacherId),
    {
      ...teacher,
      id: teacherId,
      updatedAt: new Date().toISOString(),
      serverTime: serverTimestamp(),
    },
    { merge: true }
  );

  if (updatedAllTeachers) {
    localStorage.setItem('sekolahku_teachers_seeded', 'true');
    saveStoredTeachers(updatedAllTeachers);
  }
}

export async function deleteTeacherFromFirestore(
  teacherId: string,
  remainingTeachers?: Teacher[]
): Promise<void> {
  if (!teacherId) return;
  await deleteDoc(doc(db, TEACHERS_COLLECTION, teacherId));

  if (remainingTeachers) {
    localStorage.setItem('sekolahku_teachers_seeded', 'true');
    saveStoredTeachers(remainingTeachers);
  }
}

export async function saveTeachersToFirestoreBatch(teachers: Teacher[]): Promise<boolean> {
  try {
    const capped = (teachers || []).slice(0, MAX_TEACHERS);
    if (capped.length > 0) {
      const batch = writeBatch(db);
      capped.forEach((teacher, idx) => {
        const teacherId = teacher.id || `t_${Date.now()}_${idx}`;
        batch.set(
          doc(db, TEACHERS_COLLECTION, teacherId),
          {
            ...teacher,
            id: teacherId,
            updatedAt: new Date().toISOString(),
            serverTime: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    localStorage.setItem('sekolahku_teachers_seeded', 'true');
    saveStoredTeachers(capped);
    return true;
  } catch (error) {
    console.error('Gagal menyimpan batch guru/pegawai ke Firestore:', error);
    throw error;
  }
}

export async function replaceTeachersInFirestore(teachers: Teacher[]): Promise<boolean> {
  try {
    const colRef = collection(db, TEACHERS_COLLECTION);
    const normalized = (teachers || []).slice(0, MAX_TEACHERS).map((t, idx) => ({
      ...t,
      id: t.id || `t_${Date.now()}_${idx}`,
    }));

    const targetIds = new Set(normalized.map((t) => t.id));
    const existingSnap = await getDocs(colRef);
    const staleIds: string[] = [];
    existingSnap.forEach((docSnap) => {
      if (!targetIds.has(docSnap.id)) {
        staleIds.push(docSnap.id);
      }
    });

    if (staleIds.length > 0) {
      const batch = writeBatch(db);
      staleIds.forEach((id) => batch.delete(doc(db, TEACHERS_COLLECTION, id)));
      await batch.commit();
    }

    if (normalized.length > 0) {
      const batch = writeBatch(db);
      normalized.forEach((teacher) => {
        batch.set(
          doc(db, TEACHERS_COLLECTION, teacher.id),
          {
            ...teacher,
            updatedAt: new Date().toISOString(),
            serverTime: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    localStorage.setItem('sekolahku_teachers_seeded', 'true');
    saveStoredTeachers(normalized);
    return true;
  } catch (error) {
    console.error('Gagal mengganti koleksi guru/pegawai di Firestore:', error);
    throw error;
  }
}

export async function fetchTeachersFromFirestore(): Promise<Teacher[]> {
  try {
    const snap = await getDocs(collection(db, TEACHERS_COLLECTION));
    const list: Teacher[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Teacher;
      if (data && data.nama) {
        list.push({ ...data, id: docSnap.id });
      }
    });
    return sortTeachersAlphabetically(list);
  } catch (error) {
    console.warn('Gagal mengambil data guru/pegawai dari Firestore:', error);
    return [];
  }
}

export function subscribeToTeachersCollection(
  onUpdate: (teachers: Teacher[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    return onSnapshot(
      collection(db, TEACHERS_COLLECTION),
      (snapshot) => {
        const list: Teacher[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Teacher;
          if (data && data.nama) {
            list.push({ ...data, id: docSnap.id });
          }
        });
        onUpdate(sortTeachersAlphabetically(list));
      },
      (error) => {
        console.warn('Realtime teachers listener warning:', error?.message || error);
        if (onError) onError(error);
      }
    );
  } catch (e) {
    if (onError) onError(e);
    return () => {};
  }
}
