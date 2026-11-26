import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

export type LearningDocType = 'atp' | 'prota' | 'promes' | 'modul_ajar' | 'ppi_lkpd';
export type LearningDocStatus =
  | 'Menunggu Verifikasi'
  | 'Perlu Revisi'
  | 'Disetujui & Terverifikasi (QR)';

export interface LearningAdminDoc {
  id: string;
  teacherId: string;
  teacherName: string;
  academicYear: string;
  kelas: string;
  type: LearningDocType;
  title: string;
  driveUrl: string;
  contentDraft?: string;
  status: LearningDocStatus;
  supervisorNote?: string;
  verifiedAt?: string;
  updatedAt: string;
}

export interface TeachingJournal {
  id: string;
  teacherId: string;
  teacherName: string;
  academicYear: string;
  kelas: string;
  date: string; // YYYY-MM-DD
  mapel: string;
  tpCode?: string;
  tpText?: string;
  objective: string;
  attendanceTotal?: number;
  attendancePresent?: number;
  attendanceSakit?: number;
  attendanceIzin?: number;
  attendanceAlpa?: number;
  attendanceSummary?: string;
  attendanceRecorded?: boolean;
  achievement: 'Tercapai' | 'Sebagian' | 'Tertunda';
  reflection: string;
  createdAt: string;
}

export interface StudentRemedialRecord {
  id: string;
  teacherId: string;
  teacherName: string;
  academicYear: string;
  kelas: string;
  studentName: string;
  subject: string;
  type: 'Remedial' | 'Pengayaan' | 'Pembinaan Khusus';
  description: string;
  actionTaken: string;
  date: string;
  createdAt: string;
}

export function cleanSchoolNpsn(npsn?: string): string {
  const sanitized = String(npsn || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return sanitized || 'default';
}

export function cleanRecordId(id: string): string {
  const sanitized = String(id || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return sanitized || `rec_${Date.now()}`;
}

function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  Object.keys(obj).forEach((k) => {
    if (obj[k] !== undefined) {
      out[k] = obj[k];
    }
  });
  return out as Partial<T>;
}

function buildLearningDocPayload(item: LearningAdminDoc) {
  const id = cleanRecordId(item.id);
  return stripUndefined({
    id,
    teacherId: String(item.teacherId || 't_current').slice(0, 160),
    teacherName: String(item.teacherName || 'Guru Pengajar').slice(0, 200),
    academicYear: String(item.academicYear || '2026/2027').slice(0, 40),
    kelas: String(item.kelas || 'Kelas 6A').slice(0, 60),
    type: item.type,
    title: String(item.title || 'Modul Ajar').slice(0, 400),
    driveUrl: String(item.driveUrl || 'https://docs.google.com/').slice(0, 2000),
    contentDraft: item.contentDraft !== undefined ? String(item.contentDraft).slice(0, 20000) : undefined,
    status: item.status || 'Menunggu Verifikasi',
    supervisorNote: item.supervisorNote !== undefined ? String(item.supervisorNote).slice(0, 2000) : undefined,
    verifiedAt: item.verifiedAt !== undefined ? String(item.verifiedAt).slice(0, 60) : undefined,
    updatedAt: String(item.updatedAt || new Date().toISOString().split('T')[0]).slice(0, 60),
  });
}

function buildJournalPayload(item: TeachingJournal) {
  const id = cleanRecordId(item.id);
  return stripUndefined({
    id,
    teacherId: String(item.teacherId || 't_current').slice(0, 160),
    teacherName: String(item.teacherName || 'Guru Pengajar').slice(0, 200),
    academicYear: String(item.academicYear || '2026/2027').slice(0, 40),
    kelas: String(item.kelas || 'Kelas 6A').slice(0, 60),
    date: String(item.date || '').slice(0, 30),
    mapel: String(item.mapel || 'Umum').slice(0, 150),
    tpCode: item.tpCode !== undefined ? String(item.tpCode).slice(0, 40) : undefined,
    tpText: item.tpText !== undefined ? String(item.tpText).slice(0, 2000) : undefined,
    objective: String(item.objective || '').slice(0, 3000),
    attendanceTotal: typeof item.attendanceTotal === 'number' ? item.attendanceTotal : undefined,
    attendancePresent: typeof item.attendancePresent === 'number' ? item.attendancePresent : undefined,
    attendanceSakit: typeof item.attendanceSakit === 'number' ? item.attendanceSakit : undefined,
    attendanceIzin: typeof item.attendanceIzin === 'number' ? item.attendanceIzin : undefined,
    attendanceAlpa: typeof item.attendanceAlpa === 'number' ? item.attendanceAlpa : undefined,
    attendanceSummary: item.attendanceSummary !== undefined ? String(item.attendanceSummary).slice(0, 1000) : undefined,
    attendanceRecorded: typeof item.attendanceRecorded === 'boolean' ? item.attendanceRecorded : undefined,
    achievement: item.achievement || 'Tercapai',
    reflection: String(item.reflection || '').slice(0, 3000),
    createdAt: String(item.createdAt || new Date().toISOString()).slice(0, 60),
  });
}

function buildRemedialPayload(item: StudentRemedialRecord) {
  const id = cleanRecordId(item.id);
  return stripUndefined({
    id,
    teacherId: String(item.teacherId || 't_current').slice(0, 160),
    teacherName: String(item.teacherName || 'Guru Pengajar').slice(0, 200),
    academicYear: String(item.academicYear || '2026/2027').slice(0, 40),
    kelas: String(item.kelas || 'Kelas 6A').slice(0, 60),
    studentName: String(item.studentName || '').slice(0, 200),
    subject: String(item.subject || 'Umum').slice(0, 150),
    type: item.type || 'Remedial',
    description: String(item.description || '').slice(0, 3000),
    actionTaken: String(item.actionTaken || '').slice(0, 3000),
    date: String(item.date || '').slice(0, 30),
    createdAt: String(item.createdAt || new Date().toISOString()).slice(0, 60),
  });
}

async function ensureTenantDoc(npsnKey: string) {
  const tenantRef = doc(db, 'schools', npsnKey);
  await setDoc(
    tenantRef,
    { npsn: npsnKey, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ==================== LEARNING DOCS ====================
export async function saveLearningDocToFirestore(
  npsn: string | undefined,
  docItem: LearningAdminDoc
): Promise<void> {
  const npsnKey = cleanSchoolNpsn(npsn);
  const payload = buildLearningDocPayload(docItem);
  const ref = doc(db, 'schools', npsnKey, 'learning_docs', payload.id as string);
  await ensureTenantDoc(npsnKey);
  await setDoc(ref, payload, { merge: true });
}

export async function saveLearningDocsBatchToFirestore(
  npsn: string | undefined,
  items: LearningAdminDoc[]
): Promise<void> {
  if (!items || items.length === 0) return;
  const npsnKey = cleanSchoolNpsn(npsn);
  await ensureTenantDoc(npsnKey);
  const batch = writeBatch(db);
  items.forEach((item) => {
    const payload = buildLearningDocPayload(item);
    const ref = doc(db, 'schools', npsnKey, 'learning_docs', payload.id as string);
    batch.set(ref, payload, { merge: true });
  });
  await batch.commit();
}

export async function deleteLearningDocFromFirestore(
  npsn: string | undefined,
  docId: string
): Promise<void> {
  const npsnKey = cleanSchoolNpsn(npsn);
  const idKey = cleanRecordId(docId);
  const ref = doc(db, 'schools', npsnKey, 'learning_docs', idKey);
  await deleteDoc(ref);
}

export function subscribeLearningDocsFromFirestore(
  npsn: string | undefined,
  onUpdate: (docs: LearningAdminDoc[], meta: { fromCache: boolean; hasPendingWrites: boolean }) => void,
  onError?: (err: unknown) => void
): () => void {
  const npsnKey = cleanSchoolNpsn(npsn);
  const colRef = collection(db, 'schools', npsnKey, 'learning_docs');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: LearningAdminDoc[] = [];
      snapshot.forEach((snap) => {
        const data = snap.data() as LearningAdminDoc;
        if (data && data.id) list.push(data);
      });
      list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      onUpdate(list, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      });
    },
    (err) => {
      console.warn('Gagal menyinkronkan perangkat ajar dari Firestore:', err);
      onError?.(err);
    }
  );
}

// ==================== TEACHING JOURNALS ====================
export async function saveTeachingJournalToFirestore(
  npsn: string | undefined,
  journal: TeachingJournal
): Promise<void> {
  const npsnKey = cleanSchoolNpsn(npsn);
  const payload = buildJournalPayload(journal);
  const ref = doc(db, 'schools', npsnKey, 'learning_journals', payload.id as string);
  await ensureTenantDoc(npsnKey);
  await setDoc(ref, payload, { merge: true });
}

export async function saveTeachingJournalsBatchToFirestore(
  npsn: string | undefined,
  items: TeachingJournal[]
): Promise<void> {
  if (!items || items.length === 0) return;
  const npsnKey = cleanSchoolNpsn(npsn);
  await ensureTenantDoc(npsnKey);
  const batch = writeBatch(db);
  items.forEach((item) => {
    const payload = buildJournalPayload(item);
    const ref = doc(db, 'schools', npsnKey, 'learning_journals', payload.id as string);
    batch.set(ref, payload, { merge: true });
  });
  await batch.commit();
}

export async function deleteTeachingJournalFromFirestore(
  npsn: string | undefined,
  journalId: string
): Promise<void> {
  const npsnKey = cleanSchoolNpsn(npsn);
  const idKey = cleanRecordId(journalId);
  const ref = doc(db, 'schools', npsnKey, 'learning_journals', idKey);
  await deleteDoc(ref);
}

export function subscribeTeachingJournalsFromFirestore(
  npsn: string | undefined,
  onUpdate: (items: TeachingJournal[], meta: { fromCache: boolean; hasPendingWrites: boolean }) => void,
  onError?: (err: unknown) => void
): () => void {
  const npsnKey = cleanSchoolNpsn(npsn);
  const colRef = collection(db, 'schools', npsnKey, 'learning_journals');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: TeachingJournal[] = [];
      snapshot.forEach((snap) => {
        const data = snap.data() as TeachingJournal;
        if (data && data.id) list.push(data);
      });
      list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      onUpdate(list, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      });
    },
    (err) => {
      console.warn('Gagal menyinkronkan jurnal mengajar dari Firestore:', err);
      onError?.(err);
    }
  );
}

// ==================== REMEDIAL RECORDS ====================
export async function saveStudentRemedialToFirestore(
  npsn: string | undefined,
  item: StudentRemedialRecord
): Promise<void> {
  const npsnKey = cleanSchoolNpsn(npsn);
  const payload = buildRemedialPayload(item);
  const ref = doc(db, 'schools', npsnKey, 'learning_remedials', payload.id as string);
  await ensureTenantDoc(npsnKey);
  await setDoc(ref, payload, { merge: true });
}

export async function deleteStudentRemedialFromFirestore(
  npsn: string | undefined,
  recordId: string
): Promise<void> {
  const npsnKey = cleanSchoolNpsn(npsn);
  const idKey = cleanRecordId(recordId);
  const ref = doc(db, 'schools', npsnKey, 'learning_remedials', idKey);
  await deleteDoc(ref);
}

export function subscribeStudentRemedialsFromFirestore(
  npsn: string | undefined,
  onUpdate: (items: StudentRemedialRecord[], meta: { fromCache: boolean; hasPendingWrites: boolean }) => void,
  onError?: (err: unknown) => void
): () => void {
  const npsnKey = cleanSchoolNpsn(npsn);
  const colRef = collection(db, 'schools', npsnKey, 'learning_remedials');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: StudentRemedialRecord[] = [];
      snapshot.forEach((snap) => {
        const data = snap.data() as StudentRemedialRecord;
        if (data && data.id) list.push(data);
      });
      list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      onUpdate(list, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      });
    },
    (err) => {
      console.warn('Gagal menyinkronkan catatan remedial dari Firestore:', err);
      onError?.(err);
    }
  );
}
