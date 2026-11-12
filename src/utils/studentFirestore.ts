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
import { Student } from '../types';
import { saveStoredStudents } from './storage';
import { pushAllDataToCloud } from './cloudSync';

export const STUDENTS_COLLECTION = 'students';

/**
 * Menyimpan array siswa dalam batch ke koleksi 'students' di Firebase Firestore.
 * Menggunakan writeBatch(db) dan await batch.commit() dengan pembagian chunk
 * untuk menghindari batas maksimal 500 operasi Firestore per batch.
 */
export async function saveStudentsToFirestoreBatch(
  students: Student[],
  updatedBy: string = 'admin'
): Promise<boolean> {
  if (!students || students.length === 0) return true;

  try {
    const CHUNK_SIZE = 400;
    const totalChunks = Math.ceil(students.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = students.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const batch = writeBatch(db);

      chunk.forEach((student, idx) => {
        const studentId = student.id || (student.nisn ? `std_${student.nisn.trim()}` : `std_${Date.now()}_${i}_${idx}`);
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

    // Perbarui juga data lokal dan dokumen sinkronisasi sentral
    saveStoredStudents(students);
    pushAllDataToCloud({ students }, updatedBy).catch((e) =>
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
export async function saveSingleStudentToFirestore(student: Student): Promise<boolean> {
  try {
    const studentId = student.id || (student.nisn ? `std_${student.nisn.trim()}` : `std_${Date.now()}`);
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
    return true;
  } catch (error) {
    console.error(`Gagal menyimpan siswa ${student.nama} ke Firestore:`, error);
    throw error;
  }
}

/**
 * Menghapus data satu siswa secara permanen dari Firestore
 */
export async function deleteStudentFromFirestore(studentId: string): Promise<boolean> {
  try {
    const docRef = doc(db, STUDENTS_COLLECTION, studentId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error(`Gagal menghapus siswa ${studentId} dari Firestore:`, error);
    throw error;
  }
}

/**
 * Mendapatkan seluruh data siswa dari koleksi Firestore secara langsung (sekali panggil)
 */
export async function fetchStudentsFromFirestore(): Promise<Student[]> {
  try {
    const colRef = collection(db, STUDENTS_COLLECTION);
    const snapshot = await getDocs(colRef);
    const students: Student[] = [];
    snapshot.forEach((docSnap) => {
      students.push({ id: docSnap.id, ...docSnap.data() } as Student);
    });
    return students;
  } catch (error) {
    console.error('Gagal mengambil data siswa dari Firestore:', error);
    return [];
  }
}

/**
 * Memasang realtime listener onSnapshot pada koleksi 'students'
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
          students.push({ id: docSnap.id, ...docSnap.data() } as Student);
        });
        onUpdate(students);
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
