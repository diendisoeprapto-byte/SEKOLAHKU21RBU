import {
  collection,
  doc,
  writeBatch,
  onSnapshot,
  getDocs,
  deleteDoc,
  setDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Student } from '../types';
import { saveStoredStudents } from './storage';
import { pushAllDataToCloud } from './cloudSync';

export const STUDENTS_COLLECTION = 'students';

/**
 * Mengurutkan array siswa berdasarkan Nama secara alfabetis (A -> Z)
 */
export function sortStudentsAlphabetically(list: Student[]): Student[] {
  return [...list].sort((a, b) =>
    (a.nama || '').localeCompare(b.nama || '', 'id', { sensitivity: 'base' })
  );
}

/**
 * Menyimpan array siswa dalam batch ke koleksi 'students' di Firebase Firestore.
 * Menggunakan writeBatch(db) dan await batch.commit() dengan pembagian chunk
 * untuk menghindari batas maksimal 500 operasi Firestore per batch.
 */
export async function saveStudentsToFirestoreBatch(
  students: Student[],
  updatedBy: string = 'admin'
): Promise<boolean> {
  try {
    if (students && students.length > 0) {
      const CHUNK_SIZE = 400;
      const totalChunks = Math.ceil(students.length / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = students.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((student, idx) => {
          const studentId =
            student.id ||
            (student.nisn ? `std_${student.nisn.trim()}` : `std_${Date.now()}_${i}_${idx}`);
          const docRef = doc(db, STUDENTS_COLLECTION, studentId);

          batch.set(
            docRef,
            {
              ...student,
              id: studentId,
              updatedAt: new Date().toISOString(),
              serverTime: serverTimestamp(),
            },
            { merge: true }
          );
        });

        await batch.commit();
      }
    }

    const sorted = sortStudentsAlphabetically(students || []);
    localStorage.setItem('sekolahku_students_seeded', 'true');
    saveStoredStudents(sorted);
    pushAllDataToCloud({ students: sorted }, updatedBy).catch((e) =>
      console.warn('Sync central school_data non-blocking warning:', e)
    );

    return true;
  } catch (error) {
    console.error('Gagal menyimpan batch siswa ke Firestore:', error);
    throw error;
  }
}

/**
 * Menyimpan atau memperbarui data satu siswa secara permanen di Firestore
 */
export async function saveSingleStudentToFirestore(
  student: Student,
  remainingStudents?: Student[],
  updatedBy: string = 'admin'
): Promise<boolean> {
  try {
    const studentId =
      student.id || (student.nisn ? `std_${student.nisn.trim()}` : `std_${Date.now()}`);
    const docRef = doc(db, STUDENTS_COLLECTION, studentId);
    await setDoc(
      docRef,
      {
        ...student,
        id: studentId,
        updatedAt: new Date().toISOString(),
        serverTime: serverTimestamp(),
      },
      { merge: true }
    );

    if (remainingStudents) {
      const sorted = sortStudentsAlphabetically(remainingStudents);
      saveStoredStudents(sorted);
      pushAllDataToCloud({ students: sorted }, updatedBy).catch((e) =>
        console.warn('Sync central school_data non-blocking warning:', e)
      );
    }
    return true;
  } catch (error) {
    console.error(`Gagal menyimpan siswa ${student.nama} ke Firestore:`, error);
    throw error;
  }
}

/**
 * Menghapus data satu siswa secara permanen dari Firestore (termasuk membersihkan doc legacy jika ada)
 */
export async function deleteStudentFromFirestore(
  studentId: string,
  remainingStudents?: Student[],
  updatedBy: string = 'admin'
): Promise<boolean> {
  try {
    // 1. Hapus dokumen berdasarkan document ID langsung
    const docRef = doc(db, STUDENTS_COLLECTION, studentId);
    await deleteDoc(docRef);

    // 2. Pastikan tidak ada dokumen legacy dengan field id == studentId tetapi docId berbeda
    try {
      const colRef = collection(db, STUDENTS_COLLECTION);
      const q = query(colRef, where('id', '==', studentId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (cleanupErr) {
      console.warn('Secondary cleanup query warning:', cleanupErr);
    }

    // 3. Sinkronkan ke localStorage dan dokumen sentral school_data agar tidak muncul kembali
    localStorage.setItem('sekolahku_students_seeded', 'true');
    if (remainingStudents) {
      const sorted = sortStudentsAlphabetically(remainingStudents);
      saveStoredStudents(sorted);
      await pushAllDataToCloud({ students: sorted }, updatedBy);
    }

    return true;
  } catch (error) {
    console.error(`Gagal menghapus siswa ${studentId} dari Firestore:`, error);
    throw error;
  }
}

/**
 * Menghapus beberapa siswa sekaligus menggunakan writeBatch di Firestore
 */
export async function deleteMultipleStudentsFromFirestore(
  studentIds: string[],
  remainingStudents: Student[],
  updatedBy: string = 'admin'
): Promise<boolean> {
  try {
    if (studentIds.length > 0) {
      const CHUNK_SIZE = 400;
      const totalChunks = Math.ceil(studentIds.length / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = studentIds.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => {
          const docRef = doc(db, STUDENTS_COLLECTION, id);
          batch.delete(docRef);
        });
        await batch.commit();
      }
    }

    const sorted = sortStudentsAlphabetically(remainingStudents);
    localStorage.setItem('sekolahku_students_seeded', 'true');
    saveStoredStudents(sorted);
    await pushAllDataToCloud({ students: sorted }, updatedBy);

    return true;
  } catch (error) {
    console.error('Gagal menghapus batch siswa dari Firestore:', error);
    throw error;
  }
}

/**
 * Mendapatkan seluruh data siswa dari koleksi Firestore secara langsung (terurut A-Z)
 */
export async function fetchStudentsFromFirestore(): Promise<Student[]> {
  try {
    const colRef = collection(db, STUDENTS_COLLECTION);
    const snapshot = await getDocs(colRef);
    const students: Student[] = [];
    snapshot.forEach((docSnap) => {
      students.push({ ...(docSnap.data() as Student), id: docSnap.id });
    });
    return sortStudentsAlphabetically(students);
  } catch (error) {
    console.error('Gagal mengambil data siswa dari Firestore:', error);
    return [];
  }
}

/**
 * Memasang realtime listener onSnapshot pada koleksi 'students' (selalu terurut A-Z)
 */
export function subscribeToStudentsCollection(
  onUpdate: (students: Student[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const colRef = collection(db, STUDENTS_COLLECTION);
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const students: Student[] = [];
        snapshot.forEach((docSnap) => {
          students.push({ ...(docSnap.data() as Student), id: docSnap.id });
        });
        onUpdate(sortStudentsAlphabetically(students));
      },
      (error) => {
        console.error('Error pada listener onSnapshot students:', error);
        if (onError) onError(error);
      }
    );
    return unsubscribe;
  } catch (e) {
    console.error('Gagal mendaftarkan realtime listener students:', e);
    return () => {};
  }
}
