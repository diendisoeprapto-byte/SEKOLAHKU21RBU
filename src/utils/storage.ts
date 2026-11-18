import { SchoolProfile, Teacher, Student, Subject, KaldikDay, AssessmentData, CBTExam, CBTExamResult, ExamResultsResetMeta, ActiveUser, StudentReportNotes, TKACpTp, TKAQuestion } from '../types';
import { DEFAULT_SCHOOL_PROFILE, DEFAULT_TEACHERS, DEFAULT_STUDENTS, DEFAULT_SUBJECTS, DEFAULT_KALDIK_HOLIDAYS, DEFAULT_CBT_EXAM, DEFAULT_TKA_CP_TP, DEFAULT_TKA_QUESTIONS } from '../data/defaultData';
import { getDefaultSubjectsForGrade, getGradeNumberFromClass } from '../data/classCurriculumData';
import { getLocalTodayStr } from './dateUtils';
import { idbGet, idbRemove, idbSet } from './idbStorage';
import { isSemesterOneLabel } from './semesterUtils';

const STORAGE_KEYS = {
  PROFILE: 'sekolahku_school_profile',
  TEACHERS: 'sekolahku_teachers',
  STUDENTS: 'sekolahku_students',
  SUBJECTS: 'sekolahku_subjects',
  SUBJECTS_BY_CLASS: 'sekolahku_subjects_by_class',
  KALDIK: 'sekolahku_kaldik_holidays',
  ATTENDANCE: 'sekolahku_attendance_records',
  ASSESSMENTS: 'sekolahku_assessments_data',
  AS_COUNT: 'sekolahku_assessment_counts', // subject/class -> number of AS columns
  NOTES: 'sekolahku_report_notes',
  CBT_EXAMS: 'sekolahku_cbt_exams',
  CBT_DURATIONS: 'sekolahku_cbt_durations',
  CBT_ACTIVE_PACKAGES: 'sekolahku_cbt_active_packages',
  CBT_RESULTS: 'sekolahku_cbt_results',
  TKA_CP_TP: 'sekolahku_tka_cp_tp',
  TKA_QUESTIONS: 'sekolahku_tka_questions',
  TKA_DURATIONS: 'sekolahku_tka_durations',
  TKA_ACTIVE_PACKAGES: 'sekolahku_tka_active_packages',
  TKA_RESULTS: 'sekolahku_tka_results',
  TKA_SUBMISSIONS: 'sekolahku_tka_submissions',
  EXAM_RESET_META: 'sekolahku_exam_results_reset_meta',
  ACTIVE_USER: 'sekolahku_active_user',
  ACTIVE_YEAR: 'sekolahku_active_year',
  ACTIVE_SEMESTER: 'sekolahku_active_semester',
  ACTIVE_CLASS: 'sekolahku_active_class',
  ADMIN_PASSWORD: 'sekolahku_admin_password',
};

export const MAX_QUESTIONS_PER_PACKAGE = 50;
export const DEFAULT_STUDENT_AVATAR_URL =
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150';

export const isKelas6Class = (kelas?: string): boolean => {
  const k = String(kelas || '').trim().toUpperCase();
  if (!k) return false;
  return /^(KELAS\s*)?6(\s*[A-Z0-9-]+)?$/i.test(k) || /\bVI\s*[A-Z]?\b/.test(k);
};

export const sanitizeSubmissionFotoUrl = (fotoUrl?: string): string => {
  const val = String(fotoUrl || '').trim();
  if (!val) return '';
  if (val.startsWith('data:image/') && val.length > 2000) {
    return '';
  }
  return val;
};

const LARGE_COLLECTION_THRESHOLD_CHARS = 750_000;
const LARGE_COLLECTION_KEYS = [
  STORAGE_KEYS.TKA_QUESTIONS,
  STORAGE_KEYS.CBT_EXAMS,
  STORAGE_KEYS.STUDENTS,
  STORAGE_KEYS.TEACHERS,
  STORAGE_KEYS.ATTENDANCE,
  STORAGE_KEYS.TKA_SUBMISSIONS,
  STORAGE_KEYS.CBT_RESULTS,
  STORAGE_KEYS.TKA_RESULTS,
] as const;

const inMemoryLargeCache: Record<string, any> = {};
const cloudHydratedLargeKeys = new Set<string>();

export const safeSetLocalStorage = (key: string, serialized: string): boolean => {
  try {
    localStorage.setItem(key, serialized);
    return true;
  } catch (err) {
    console.warn(`Penyimpanan lokal penuh untuk ${key}, data tetap dilanjutkan:`, err);
    return false;
  }
};

export const safeRemoveLocalStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage removal failures
  }
};

const idbMarkerForKey = (key: string) => `${key}_in_idb`;

const saveHeavyCollection = <T>(key: string, value: T): boolean => {
  inMemoryLargeCache[key] = value;
  void idbSet(key, value);

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= LARGE_COLLECTION_THRESHOLD_CHARS) {
      const ok = safeSetLocalStorage(key, serialized);
      if (ok) {
        safeRemoveLocalStorage(idbMarkerForKey(key));
        return true;
      }
    }
    // Data besar (>750 KB) atau localStorage hampir penuh -> kosongkan key berat dari localStorage agar kuota lega
    safeRemoveLocalStorage(key);
    safeSetLocalStorage(idbMarkerForKey(key), 'true');
  } catch (err) {
    console.warn(`Gagal serialisasi cache lokal ${key}, disimpan di memori & IndexedDB:`, err);
    safeRemoveLocalStorage(key);
    safeSetLocalStorage(idbMarkerForKey(key), 'true');
  }
  return true;
};

const getHeavyCollection = <T>(key: string, fallback: T | (() => T), emptyIfOffloaded: T): T => {
  if (Object.prototype.hasOwnProperty.call(inMemoryLargeCache, key)) {
    return inMemoryLargeCache[key] as T;
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as T;
      inMemoryLargeCache[key] = parsed;
      return parsed;
    }
    if (localStorage.getItem(idbMarkerForKey(key)) === 'true') {
      return emptyIfOffloaded;
    }
  } catch {
    // Fallback to default below
  }
  return typeof fallback === 'function' ? (fallback as () => T)() : fallback;
};

export const markLargeCollectionHydratedFromCloud = (key: string) => {
  cloudHydratedLargeKeys.add(key);
};

export const hasStoredTKAQuestionsLocal = (): boolean => {
  return (
    Object.prototype.hasOwnProperty.call(inMemoryLargeCache, STORAGE_KEYS.TKA_QUESTIONS) ||
    localStorage.getItem(STORAGE_KEYS.TKA_QUESTIONS) !== null ||
    localStorage.getItem(idbMarkerForKey(STORAGE_KEYS.TKA_QUESTIONS)) === 'true'
  );
};

export const hasStoredCBTExamsLocal = (): boolean => {
  return (
    Object.prototype.hasOwnProperty.call(inMemoryLargeCache, STORAGE_KEYS.CBT_EXAMS) ||
    localStorage.getItem(STORAGE_KEYS.CBT_EXAMS) !== null ||
    localStorage.getItem(idbMarkerForKey(STORAGE_KEYS.CBT_EXAMS)) === 'true'
  );
};

export interface HydrateIDBCallbacks {
  onStudents?: (students: Student[]) => void;
  onTeachers?: (teachers: Teacher[]) => void;
  onAttendance?: (records: Record<string, AttendanceRecordItem>) => void;
  onTkaQuestions?: (questions: TKAQuestion[]) => void;
  onCbtExams?: (exams: CBTExam[]) => void;
  onTkaSubmissions?: (subs: TKASubmissionItem[]) => void;
}

export const hydrateLargeCollectionsFromIDB = async (callbacks?: HydrateIDBCallbacks): Promise<void> => {
  const results = await Promise.all(LARGE_COLLECTION_KEYS.map((key) => idbGet<any>(key)));

  LARGE_COLLECTION_KEYS.forEach((key, idx) => {
    const idbVal = results[idx];
    if (idbVal === null || idbVal === undefined) return;
    if (cloudHydratedLargeKeys.has(key)) return;

    const isOffloaded = localStorage.getItem(idbMarkerForKey(key)) === 'true';
    const hasMemory = Object.prototype.hasOwnProperty.call(inMemoryLargeCache, key);
    if (hasMemory && !isOffloaded) return;

    inMemoryLargeCache[key] = idbVal;

    if (key === STORAGE_KEYS.TKA_QUESTIONS && Array.isArray(idbVal)) {
      callbacks?.onTkaQuestions?.(idbVal);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('sekolahku-tka-questions-updated'));
      }
    } else if (key === STORAGE_KEYS.CBT_EXAMS && Array.isArray(idbVal)) {
      callbacks?.onCbtExams?.(idbVal);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('sekolahku-cbt-exams-updated'));
      }
    } else if (key === STORAGE_KEYS.STUDENTS && Array.isArray(idbVal)) {
      callbacks?.onStudents?.(idbVal);
    } else if (key === STORAGE_KEYS.TEACHERS && Array.isArray(idbVal)) {
      callbacks?.onTeachers?.(idbVal);
    } else if (key === STORAGE_KEYS.ATTENDANCE && idbVal && typeof idbVal === 'object') {
      callbacks?.onAttendance?.(idbVal);
    } else if (key === STORAGE_KEYS.TKA_SUBMISSIONS && Array.isArray(idbVal)) {
      callbacks?.onTkaSubmissions?.(idbVal);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('sekolahku-exam-results-updated'));
      }
    } else if (
      (key === STORAGE_KEYS.CBT_RESULTS || key === STORAGE_KEYS.TKA_RESULTS) &&
      Array.isArray(idbVal)
    ) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('sekolahku-exam-results-updated'));
      }
    }
  });
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key.endsWith('_in_idb')) {
      const baseKey = e.key.slice(0, -'_in_idb'.length);
      delete inMemoryLargeCache[baseKey];
      cloudHydratedLargeKeys.delete(baseKey);
      void hydrateLargeCollectionsFromIDB();
      return;
    }
    if ((LARGE_COLLECTION_KEYS as readonly string[]).includes(e.key)) {
      delete inMemoryLargeCache[e.key];
      if (e.key === STORAGE_KEYS.TKA_QUESTIONS) {
        window.dispatchEvent(new Event('sekolahku-tka-questions-updated'));
      } else if (e.key === STORAGE_KEYS.CBT_EXAMS) {
        window.dispatchEvent(new Event('sekolahku-cbt-exams-updated'));
      }
    }
  });
}

let storageMutationHook: ((key: string) => void) | null = null;
let suppressStorageMutationHook = false;

export const registerStorageMutationHook = (hook: (key: string) => void) => {
  storageMutationHook = hook;
};

export const runWithoutStorageSync = <T>(fn: () => T): T => {
  const prev = suppressStorageMutationHook;
  suppressStorageMutationHook = true;
  try {
    return fn();
  } finally {
    suppressStorageMutationHook = prev;
  }
};

export const notifyStorageMutation = (key: string) => {
  if (suppressStorageMutationHook || !storageMutationHook) return;
  storageMutationHook(key);
};

export const getStoredAdminPassword = (): string => {
  return localStorage.getItem(STORAGE_KEYS.ADMIN_PASSWORD) || 'admin';
};

export const saveStoredAdminPassword = (password: string) => {
  safeSetLocalStorage(STORAGE_KEYS.ADMIN_PASSWORD, password);
  notifyStorageMutation(STORAGE_KEYS.ADMIN_PASSWORD);
};

export const resetStoredAdminPassword = () => {
  safeSetLocalStorage(STORAGE_KEYS.ADMIN_PASSWORD, 'admin');
  notifyStorageMutation(STORAGE_KEYS.ADMIN_PASSWORD);
};

export const getStoredProfile = (): SchoolProfile => {
  const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
  if (!data) return DEFAULT_SCHOOL_PROFILE;
  try {
    return JSON.parse(data);
  } catch {
    return DEFAULT_SCHOOL_PROFILE;
  }
};

export const saveStoredProfile = (profile: SchoolProfile) => {
  safeSetLocalStorage(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
};

export const getStoredTeachers = (): Teacher[] => {
  return getHeavyCollection<Teacher[]>(STORAGE_KEYS.TEACHERS, DEFAULT_TEACHERS, []);
};

export const saveStoredTeachers = (teachers: Teacher[]) => {
  saveHeavyCollection(STORAGE_KEYS.TEACHERS, teachers);
};

export const getStoredStudents = (): Student[] => {
  return getHeavyCollection<Student[]>(STORAGE_KEYS.STUDENTS, DEFAULT_STUDENTS, []);
};

export const saveStoredStudents = (students: Student[]) => {
  saveHeavyCollection(STORAGE_KEYS.STUDENTS, students);
};

export const getStoredSubjectsByClass = (): Record<string, Subject[]> => {
  const data = localStorage.getItem(STORAGE_KEYS.SUBJECTS_BY_CLASS);
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse subjects by class:', e);
    }
  }
  return {};
};

export const getStoredSubjectsForClass = (kelasName: string): Subject[] => {
  const targetClass = kelasName || 'Kelas 6A';
  const allByClass = getStoredSubjectsByClass();
  const grade = getGradeNumberFromClass(targetClass);
  const defaultList = getDefaultSubjectsForGrade(grade, targetClass);

  if (allByClass[targetClass] && Array.isArray(allByClass[targetClass]) && allByClass[targetClass].length > 0) {
    const existing = allByClass[targetClass];
    // Pastikan mapel Koding dan Kecerdasan Artifisial (KKA) otomatis tersedia untuk Kelas 5 & 6
    if (grade === 5 || grade === 6) {
      const hasKka = existing.some(
        (s) =>
          (s.code || '').toUpperCase().startsWith('KKA') ||
          (s.name || '').toLowerCase().includes('koding') ||
          (s.name || '').toLowerCase().includes('kka')
      );
      if (!hasKka) {
        const kkaDefault = defaultList.find((s) => (s.code || '').toUpperCase().startsWith('KKA'));
        if (kkaDefault) {
          const updated = [...existing, kkaDefault];
          allByClass[targetClass] = updated;
          safeSetLocalStorage(STORAGE_KEYS.SUBJECTS_BY_CLASS, JSON.stringify(allByClass));
          return updated;
        }
      }
    }
    return existing;
  }
  // Fallback to tailored default for this grade
  allByClass[targetClass] = defaultList;
  safeSetLocalStorage(STORAGE_KEYS.SUBJECTS_BY_CLASS, JSON.stringify(allByClass));
  return defaultList;
};

export const saveStoredSubjectsForClass = (kelasName: string, subjects: Subject[]) => {
  const targetClass = kelasName || 'Kelas 6A';
  const allByClass = getStoredSubjectsByClass();
  allByClass[targetClass] = subjects;
  safeSetLocalStorage(STORAGE_KEYS.SUBJECTS_BY_CLASS, JSON.stringify(allByClass));
  safeSetLocalStorage(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
  notifyStorageMutation(STORAGE_KEYS.SUBJECTS_BY_CLASS);
};

export const getStoredSubjects = (kelasName?: string): Subject[] => {
  if (kelasName) {
    return getStoredSubjectsForClass(kelasName);
  }
  const activeClass = localStorage.getItem(STORAGE_KEYS.ACTIVE_CLASS) || 'Kelas 6A';
  return getStoredSubjectsForClass(activeClass);
};

export const saveStoredSubjects = (subjects: Subject[], kelasName?: string) => {
  const targetClass = kelasName || localStorage.getItem(STORAGE_KEYS.ACTIVE_CLASS) || 'Kelas 6A';
  saveStoredSubjectsForClass(targetClass, subjects);
};

export const getStoredKaldik = (): KaldikDay[] => {
  const data = localStorage.getItem(STORAGE_KEYS.KALDIK);
  if (!data) return DEFAULT_KALDIK_HOLIDAYS;
  try {
    return JSON.parse(data);
  } catch {
    return DEFAULT_KALDIK_HOLIDAYS;
  }
};

export const saveStoredKaldik = (days: KaldikDay[]) => {
  safeSetLocalStorage(STORAGE_KEYS.KALDIK, JSON.stringify(days));
};

export interface AttendanceRecordItem {
  id: string; // date_studentId
  studentId: string;
  date: string;
  status: 'H' | 'S' | 'I' | 'A';
  time: string;
}

const buildInitialAttendance = (): Record<string, AttendanceRecordItem> => {
  if (localStorage.getItem('sekolahku_attendance_seeded') === 'true') {
    return {};
  }
  const today = getLocalTodayStr();
  const initial: Record<string, AttendanceRecordItem> = {};
  DEFAULT_STUDENTS.forEach((s, idx) => {
    const status = idx === 3 ? 'S' : idx === 5 ? 'I' : 'H';
    initial[`${today}_${s.id}`] = {
      id: `${today}_${s.id}`,
      studentId: s.id,
      date: today,
      status,
      time: '06:45',
    };
  });
  return initial;
};

export const getStoredAttendance = (): Record<string, AttendanceRecordItem> => {
  return getHeavyCollection<Record<string, AttendanceRecordItem>>(
    STORAGE_KEYS.ATTENDANCE,
    buildInitialAttendance,
    {}
  );
};

export const saveStoredAttendance = (records: Record<string, AttendanceRecordItem>) => {
  saveHeavyCollection(STORAGE_KEYS.ATTENDANCE, records);
};

// Assessment counts map: key is `${year}_${semester}_${kelas}_${subjectId}`, value is number of AS (default 4)
export const getAssessmentCount = (key: string): number => {
  const data = localStorage.getItem(STORAGE_KEYS.AS_COUNT);
  if (!data) return 4;
  try {
    const parsed = JSON.parse(data);
    return parsed[key] || 4;
  } catch {
    return 4;
  }
};

export const setAssessmentCount = (key: string, count: number) => {
  const data = localStorage.getItem(STORAGE_KEYS.AS_COUNT);
  let parsed: Record<string, number> = {};
  if (data) {
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = {};
    }
  }
  parsed[key] = Math.max(1, count);
  safeSetLocalStorage(STORAGE_KEYS.AS_COUNT, JSON.stringify(parsed));
  notifyStorageMutation(STORAGE_KEYS.AS_COUNT);
};

// Assessment data: key is `${year}_${semester}_${kelas}_${subjectId}`
export const getStoredAssessments = (key: string): AssessmentData => {
  const data = localStorage.getItem(`${STORAGE_KEYS.ASSESSMENTS}_${key}`);
  if (!data) {
    const parts = String(key || '').split('_');
    const yearPart = parts[0] || '';
    const semPart = parts[1] || '';
    // Generate default sample grades ONLY for the initial default term (2026/2027 Semester 1)
    if (yearPart === '2026/2027' && isSemesterOneLabel(semPart)) {
      const initial: AssessmentData = {};
      DEFAULT_STUDENTS.forEach((s, idx) => {
        const base = 78 + (idx % 12);
        initial[s.id] = {
          sumatif: {
            1: base + 2,
            2: base,
            3: Math.max(70, base - 3),
            4: base + 4,
          },
          remedial: {
            3: base >= 75 ? 0 : 75,
          },
          asts: base + 1,
          asas: base + 3,
          catatan: 'Menunjukkan penguasaan materi yang sangat baik.',
        };
      });
      return initial;
    }
    return {};
  }
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
};

export const saveStoredAssessments = (key: string, data: AssessmentData) => {
  const storageKey = `${STORAGE_KEYS.ASSESSMENTS}_${key}`;
  safeSetLocalStorage(storageKey, JSON.stringify(data));
  notifyStorageMutation(storageKey);
};

// Report notes per student
export const getStoredReportNotes = (): Record<string, StudentReportNotes> => {
  const data = localStorage.getItem(STORAGE_KEYS.NOTES);
  if (!data) {
    const initial: Record<string, StudentReportNotes> = {};
    DEFAULT_STUDENTS.forEach((s) => {
      initial[s.id] = {
        studentId: s.id,
        catatanWali: 'Pertahankan prestasi belajar, sikap disiplin dan budi pekerti yang luhur.',
        keputusanKenaikan: 'Naik ke Kelas VII (Tujuh) SMP',
        ekskul: [
          { nama: 'Pramuka Siaga/Penggalang', predikat: 'Sangat Baik', keterangan: 'Aktif dalam kegiatan regu dan kepanduan' },
          { nama: 'Seni Tari Betawi', predikat: 'Baik', keterangan: 'Mampu menampilkan tarian daerah dengan gemulai' },
        ],
        p5: [
          { dimensi: 'Beriman, Bertakwa kepada Tuhan YME', elemen: 'Akhlak Pribadi', capaian: 'SB', catatan: 'Selalu menjaga amanah dan berakhlak mulia' },
          { dimensi: 'Gotong Royong', elemen: 'Kolaborasi', capaian: 'BSH', catatan: 'Mampu bekerja sama dalam proyek rekayasa teknologi' },
          { dimensi: 'Bernalar Kritis', elemen: 'Memperoleh dan memproses informasi', capaian: 'BSH', catatan: 'Kritis dalam menganalisis data lingkungan hidup' },
        ],
      };
    });
    return initial;
  }
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
};

export const saveStoredReportNotes = (notes: Record<string, StudentReportNotes>) => {
  safeSetLocalStorage(STORAGE_KEYS.NOTES, JSON.stringify(notes));
  notifyStorageMutation(STORAGE_KEYS.NOTES);
};

export const getStoredReportNotesForTerm = (
  year: string = '2026/2027',
  semester: string = 'Semester 1'
): Record<string, StudentReportNotes> => {
  const termKey = `${STORAGE_KEYS.NOTES}_${year}_${semester}`;
  const termRaw = localStorage.getItem(termKey);
  if (termRaw) {
    try {
      return JSON.parse(termRaw);
    } catch {
      return {};
    }
  }
  if (year === '2026/2027' && isSemesterOneLabel(semester)) {
    return getStoredReportNotes();
  }
  return {};
};

export const saveStoredReportNotesForTerm = (
  year: string,
  semester: string,
  notes: Record<string, StudentReportNotes>
) => {
  const termKey = `${STORAGE_KEYS.NOTES}_${year}_${semester}`;
  safeSetLocalStorage(termKey, JSON.stringify(notes));
  notifyStorageMutation(termKey);
  if (year === '2026/2027' && isSemesterOneLabel(semester)) {
    saveStoredReportNotes(notes);
  }
};

export const getStoredCBTExams = (): CBTExam[] => {
  return getHeavyCollection<CBTExam[]>(STORAGE_KEYS.CBT_EXAMS, () => [DEFAULT_CBT_EXAM], []);
};

export const saveStoredCBTExams = (exams: CBTExam[]): boolean => {
  const ok = saveHeavyCollection(STORAGE_KEYS.CBT_EXAMS, exams);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-cbt-exams-updated'));
  }
  notifyStorageMutation(STORAGE_KEYS.CBT_EXAMS);
  return ok;
};

export const getStoredCBTActivePackages = (): Record<string, boolean> => {
  const data = localStorage.getItem(STORAGE_KEYS.CBT_ACTIVE_PACKAGES);
  if (!data) return {};
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const saveStoredCBTActivePackages = (activeMap: Record<string, boolean>) => {
  safeSetLocalStorage(STORAGE_KEYS.CBT_ACTIVE_PACKAGES, JSON.stringify(activeMap));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-cbt-exams-updated'));
  }
  notifyStorageMutation(STORAGE_KEYS.CBT_ACTIVE_PACKAGES);
};

export const getStoredCBTDurations = (): Record<string, number> => {
  const data = localStorage.getItem(STORAGE_KEYS.CBT_DURATIONS);
  if (!data) return {};
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const saveStoredCBTDurations = (durations: Record<string, number>) => {
  safeSetLocalStorage(STORAGE_KEYS.CBT_DURATIONS, JSON.stringify(durations));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-cbt-durations-updated'));
    window.dispatchEvent(new Event('sekolahku-cbt-exams-updated'));
  }
  notifyStorageMutation(STORAGE_KEYS.CBT_DURATIONS);
};

export const getCBTDurationKey = (paket: string, mapel?: string | null): string => {
  return mapel && mapel !== 'all' ? `${paket}__${mapel}` : `${paket}__ALL`;
};

export const getCBTDurationMinutes = (
  durations: Record<string, number>,
  options: { examId?: string; paket?: string; mapel?: string | null; fallback?: number }
): number => {
  const { examId, paket, mapel, fallback } = options;
  if (examId && typeof durations[examId] === 'number' && durations[examId] > 0) {
    return durations[examId];
  }
  if (paket && mapel && mapel !== 'all') {
    const exact = durations[`${paket}__${mapel}`];
    if (typeof exact === 'number' && exact > 0) return exact;
  }
  if (paket) {
    const pkgAll = durations[`${paket}__ALL`];
    if (typeof pkgAll === 'number' && pkgAll > 0) return pkgAll;
  }
  if (typeof fallback === 'number' && fallback > 0) return fallback;
  return 60;
};

export const isTkaResultEntry = (res?: Partial<CBTExamResult> | null): boolean => {
  if (!res) return false;
  if (res.category === 'tka') return true;
  if (res.category === 'cbt') return false;
  return String(res.examId || '').toLowerCase().startsWith('tka_');
};

const toSlugToken = (val?: string): string =>
  String(val || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const hasSlugToken = (haystackSlug: string, needleSlug: string): boolean => {
  if (!haystackSlug || !needleSlug) return false;
  return (
    haystackSlug === needleSlug ||
    haystackSlug.startsWith(`${needleSlug}_`) ||
    haystackSlug.endsWith(`_${needleSlug}`) ||
    haystackSlug.includes(`_${needleSlug}_`)
  );
};

export const doesExamResultMatchTarget = (
  res: CBTExamResult,
  targetPaket: string,
  targetMapel?: string
): boolean => {
  if (targetMapel && targetMapel !== 'all') {
    const mTarget = targetMapel.trim().toLowerCase();
    const resMapel = (res.mapel || '').trim().toLowerCase();
    const resJudul = (res.judul || '').trim().toLowerCase();
    const resExamSlug = toSlugToken(res.examId);
    const targetMapelSlug = toSlugToken(targetMapel);
    const mapelMatched =
      (resMapel && (resMapel === mTarget || resMapel.includes(mTarget) || mTarget.includes(resMapel))) ||
      (resJudul && resJudul.includes(mTarget)) ||
      hasSlugToken(resExamSlug, targetMapelSlug);
    if (!mapelMatched) return false;
  }

  if (!targetPaket || targetPaket === 'all') return true;

  const targetLower = targetPaket.trim().toLowerCase();
  const baseTarget = extractBaseTkaPaket(targetPaket).toLowerCase();
  const baseTargetSlug = toSlugToken(baseTarget);
  const fullTargetSlug = toSlugToken(targetPaket);

  const candidates = [res.paketName || '', res.judul || '']
    .map((s) => s.trim())
    .filter(Boolean);

  for (const cand of candidates) {
    const candLower = cand.toLowerCase();
    const candBase = extractBaseTkaPaket(cand).toLowerCase();
    if (
      candLower === targetLower ||
      candLower === baseTarget ||
      candBase === baseTarget ||
      candLower.startsWith(`${baseTarget} -`) ||
      candLower.startsWith(`${targetLower} -`)
    ) {
      return true;
    }
    const candSlug = toSlugToken(cand);
    if (hasSlugToken(candSlug, baseTargetSlug) || hasSlugToken(candSlug, fullTargetSlug)) {
      return true;
    }
  }

  const examSlug = toSlugToken(res.examId);
  if (hasSlugToken(examSlug, baseTargetSlug) || hasSlugToken(examSlug, fullTargetSlug)) {
    return true;
  }

  // Fallback untuk alias ASAS / ASTS (mis. "Asesmen Sumatif Akhir Semester (ASAS)" vs "ASAS ...")
  if (targetLower.includes('asas') && (toSlugToken(res.paketName).includes('asas') || toSlugToken(res.judul).includes('asas') || hasSlugToken(examSlug, 'asas'))) {
    return true;
  }
  if (targetLower.includes('asts') && (toSlugToken(res.paketName).includes('asts') || toSlugToken(res.judul).includes('asts') || hasSlugToken(examSlug, 'asts'))) {
    return true;
  }

  return false;
};

export const getStoredExamResultsResetMeta = (): ExamResultsResetMeta => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EXAM_RESET_META);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const saveStoredExamResultsResetMeta = (meta: ExamResultsResetMeta) => {
  safeSetLocalStorage(STORAGE_KEYS.EXAM_RESET_META, JSON.stringify(meta || {}));
  notifyStorageMutation(STORAGE_KEYS.EXAM_RESET_META);
};

export const mergeExamResultsResetMeta = (
  a?: ExamResultsResetMeta,
  b?: ExamResultsResetMeta
): ExamResultsResetMeta => {
  const merged: ExamResultsResetMeta = {};
  const cbtTs = Math.max(Number(a?.cbtClearedAt || 0), Number(b?.cbtClearedAt || 0));
  if (cbtTs > 0) merged.cbtClearedAt = cbtTs;
  const tkaTs = Math.max(Number(a?.tkaClearedAt || 0), Number(b?.tkaClearedAt || 0));
  if (tkaTs > 0) merged.tkaClearedAt = tkaTs;

  const paketMap: Record<string, number> = {};
  [a?.paketClearedAt, b?.paketClearedAt].forEach((src) => {
    if (!src || typeof src !== 'object') return;
    Object.entries(src).forEach(([k, v]) => {
      const ts = Number(v || 0);
      if (ts > 0) {
        paketMap[k] = Math.max(paketMap[k] || 0, ts);
      }
    });
  });
  if (Object.keys(paketMap).length > 0) {
    merged.paketClearedAt = paketMap;
  }
  return merged;
};

export const markExamResultsResetMeta = (update: {
  clearAllCbt?: boolean;
  clearAllTka?: boolean;
  paketKeys?: Array<{ category: 'cbt' | 'tka'; paket: string; mapel?: string }>;
  timestamp?: number;
}): ExamResultsResetMeta => {
  const now = update.timestamp || Date.now();
  const prev = getStoredExamResultsResetMeta();
  const next: ExamResultsResetMeta = {
    ...prev,
    paketClearedAt: { ...(prev.paketClearedAt || {}) },
  };
  if (update.clearAllCbt) {
    next.cbtClearedAt = Math.max(Number(next.cbtClearedAt || 0), now);
  }
  if (update.clearAllTka) {
    next.tkaClearedAt = Math.max(Number(next.tkaClearedAt || 0), now);
  }
  if (update.paketKeys && update.paketKeys.length > 0) {
    update.paketKeys.forEach(({ category, paket, mapel }) => {
      const base = extractBaseTkaPaket(paket);
      const key = `${category}::${base}::${mapel && mapel !== 'all' ? mapel : 'ALL'}`;
      next.paketClearedAt![key] = Math.max(Number(next.paketClearedAt![key] || 0), now);
    });
  }
  if (Object.keys(next.paketClearedAt || {}).length === 0) {
    delete next.paketClearedAt;
  }
  saveStoredExamResultsResetMeta(next);
  return next;
};

export const filterExamResultsByResetMeta = (
  results: CBTExamResult[],
  categoryHint?: 'cbt' | 'tka',
  metaOverride?: ExamResultsResetMeta
): CBTExamResult[] => {
  const list = Array.isArray(results) ? results : [];
  const meta = metaOverride || getStoredExamResultsResetMeta();
  const cbtClearedAt = Number(meta.cbtClearedAt || 0);
  const tkaClearedAt = Number(meta.tkaClearedAt || 0);
  const paketEntries = Object.entries(meta.paketClearedAt || {});

  if (!cbtClearedAt && !tkaClearedAt && paketEntries.length === 0) {
    return list;
  }

  return list.filter((res) => {
    if (!res || typeof res !== 'object') return false;
    const isTka = categoryHint === 'tka' || isTkaResultEntry(res);
    const ts =
      typeof res.recordedAt === 'number' && Number.isFinite(res.recordedAt) ? res.recordedAt : 0;

    if (isTka && tkaClearedAt > 0 && ts <= tkaClearedAt) {
      return false;
    }
    if (!isTka && cbtClearedAt > 0 && ts <= cbtClearedAt) {
      return false;
    }

    for (const [key, clearedTs] of paketEntries) {
      const clearTime = Number(clearedTs || 0);
      if (clearTime <= 0 || ts > clearTime) continue;
      const parts = key.split('::');
      const cat = parts[0] as 'cbt' | 'tka';
      const pkt = parts[1] || '';
      const mapelPart = parts[2] && parts[2] !== 'ALL' ? parts[2] : undefined;
      if ((cat === 'tka') !== isTka) continue;
      if (doesExamResultMatchTarget(res, pkt, mapelPart)) {
        return false;
      }
    }

    return true;
  });
};

export const getStoredCBTResults = (): CBTExamResult[] => {
  const list = getHeavyCollection<CBTExamResult[]>(STORAGE_KEYS.CBT_RESULTS, [], []);
  return filterExamResultsByResetMeta(Array.isArray(list) ? list : []);
};

export const saveStoredCBTResults = (results: CBTExamResult[]) => {
  saveHeavyCollection(STORAGE_KEYS.CBT_RESULTS, Array.isArray(results) ? results : []);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-exam-results-updated'));
  }
  notifyStorageMutation(STORAGE_KEYS.CBT_RESULTS);
};

export const getStoredTKACpTp = (): TKACpTp[] => {
  const data = localStorage.getItem(STORAGE_KEYS.TKA_CP_TP);
  if (!data) return DEFAULT_TKA_CP_TP;
  try {
    const parsed: TKACpTp[] = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const hasKka = parsed.some(
        (c) => (c.mapel || '').toLowerCase().includes('koding') || (c.kodeCp || '').includes('KKA')
      );
      if (!hasKka) {
        const kkaCp = DEFAULT_TKA_CP_TP.find((c) => c.id === 'cp_tka_05');
        if (kkaCp) {
          const merged = [...parsed, kkaCp];
          safeSetLocalStorage(STORAGE_KEYS.TKA_CP_TP, JSON.stringify(merged));
          return merged;
        }
      }
      return parsed;
    }
    return DEFAULT_TKA_CP_TP;
  } catch {
    return DEFAULT_TKA_CP_TP;
  }
};

export const saveStoredTKACpTp = (cpList: TKACpTp[]) => {
  safeSetLocalStorage(STORAGE_KEYS.TKA_CP_TP, JSON.stringify(cpList));
  notifyStorageMutation(STORAGE_KEYS.TKA_CP_TP);
};

export const getStoredTKAQuestions = (): TKAQuestion[] => {
  return getHeavyCollection<TKAQuestion[]>(STORAGE_KEYS.TKA_QUESTIONS, DEFAULT_TKA_QUESTIONS, []);
};

export const saveStoredTKAQuestions = (questions: TKAQuestion[]): boolean => {
  const ok = saveHeavyCollection(STORAGE_KEYS.TKA_QUESTIONS, questions);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-tka-questions-updated'));
  }
  notifyStorageMutation(STORAGE_KEYS.TKA_QUESTIONS);
  return ok;
};

export const getStoredTKADurations = (): Record<string, number> => {
  const data = localStorage.getItem(STORAGE_KEYS.TKA_DURATIONS);
  if (!data) return {};
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const saveStoredTKADurations = (durations: Record<string, number>) => {
  safeSetLocalStorage(STORAGE_KEYS.TKA_DURATIONS, JSON.stringify(durations));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-tka-durations-updated'));
  }
  notifyStorageMutation(STORAGE_KEYS.TKA_DURATIONS);
};

export const getTKADurationKey = (jenisTka: string, mapel?: string | null): string => {
  return mapel && mapel !== 'all' ? `${jenisTka}__${mapel}` : `${jenisTka}__ALL`;
};

export const getTKADurationMinutes = (
  durations: Record<string, number>,
  jenisTka: string,
  mapel?: string | null
): number => {
  if (mapel && mapel !== 'all') {
    const exact = durations[`${jenisTka}__${mapel}`];
    if (typeof exact === 'number' && exact > 0) return exact;
  }
  const pkgAll = durations[`${jenisTka}__ALL`];
  if (typeof pkgAll === 'number' && pkgAll > 0) return pkgAll;
  if (!mapel || mapel === 'all') {
    const matchingValues = Object.entries(durations)
      .filter(([k, v]) => k.startsWith(`${jenisTka}__`) && typeof v === 'number' && v > 0)
      .map(([, v]) => v);
    if (matchingValues.length === 1) {
      return matchingValues[0];
    }
  }
  return 60;
};

export const getStoredTKAActivePackages = (): Record<string, boolean> => {
  const data = localStorage.getItem(STORAGE_KEYS.TKA_ACTIVE_PACKAGES);
  if (!data) return {};
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const saveStoredTKAActivePackages = (activeMap: Record<string, boolean>) => {
  safeSetLocalStorage(STORAGE_KEYS.TKA_ACTIVE_PACKAGES, JSON.stringify(activeMap));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-tka-active-updated'));
  }
  notifyStorageMutation(STORAGE_KEYS.TKA_ACTIVE_PACKAGES);
};

export const isTKAPackageActive = (
  activeMap: Record<string, boolean>,
  jenisTka: string,
  mapel?: string | null
): boolean => {
  if (mapel && mapel !== 'all') {
    const exact = activeMap[`${jenisTka}__${mapel}`];
    if (typeof exact === 'boolean') return exact;
  }
  const pkgAll = activeMap[`${jenisTka}__ALL`];
  if (typeof pkgAll === 'boolean') return pkgAll;
  return false;
};

export const getStoredTKAResults = (): CBTExamResult[] => {
  const list = getHeavyCollection<CBTExamResult[]>(STORAGE_KEYS.TKA_RESULTS, [], []);
  return filterExamResultsByResetMeta(Array.isArray(list) ? list : [], 'tka');
};

export const saveStoredTKAResults = (results: CBTExamResult[]) => {
  saveHeavyCollection(STORAGE_KEYS.TKA_RESULTS, Array.isArray(results) ? results : []);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-exam-results-updated'));
  }
  notifyStorageMutation(STORAGE_KEYS.TKA_RESULTS);
};

export type TKAMapelScoreKey =
  | 'Bahasa Indonesia'
  | 'Matematika'
  | 'IPAS'
  | 'Bahasa Inggris'
  | 'Koding dan Kecerdasan Artifisial (KKA)';

export const normalizeTkaMapelKey = (mapel: string): TKAMapelScoreKey => {
  const m = (mapel || '').toLowerCase();
  if (m.includes('ipas') || m.includes('alam dan sosial')) return 'IPAS';
  if (m.includes('koding') || m.includes('kka') || m.includes('artifisial')) {
    return 'Koding dan Kecerdasan Artifisial (KKA)';
  }
  if (m.includes('matematika')) return 'Matematika';
  if (m.includes('inggris')) return 'Bahasa Inggris';
  return 'Bahasa Indonesia';
};

export const extractBaseTkaPaket = (paket: string): string => {
  return (paket || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || 'Simulasi 1';
};

export interface TKASubmissionItem {
  id: string;
  studentId: string;
  studentName: string;
  nisn: string;
  kelas: string;
  fotoUrl: string;
  paket: string;
  paketDasar?: string;
  completedMapels?: string[];
  answers: Record<string, any>;
  scoresPerMapel: {
    'Bahasa Indonesia': number;
    'Matematika': number;
    'IPAS': number;
    'Bahasa Inggris': number;
    'Koding dan Kecerdasan Artifisial (KKA)'?: number;
  };
  skorTotal: number;
  predikat: 'A' | 'B' | 'C' | 'D';
  status: 'Tuntas' | 'Remedial';
  tanggalUjian: string;
  durasiPengerjaan?: string;
  updatedAt?: string;
}

export const sanitizeTkaSubmissionsList = (
  submissions: TKASubmissionItem[]
): TKASubmissionItem[] => {
  return (Array.isArray(submissions) ? submissions : []).map((sub) => ({
    ...sub,
    fotoUrl: sanitizeSubmissionFotoUrl(sub.fotoUrl),
  }));
};

export const getStoredTKASubmissions = (): TKASubmissionItem[] => {
  const list = getHeavyCollection<TKASubmissionItem[]>(STORAGE_KEYS.TKA_SUBMISSIONS, [], []);
  return Array.isArray(list) ? list : [];
};

export const saveStoredTKASubmissions = (submissions: TKASubmissionItem[]) => {
  saveHeavyCollection(STORAGE_KEYS.TKA_SUBMISSIONS, sanitizeTkaSubmissionsList(submissions));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-exam-results-updated'));
  }
  notifyStorageMutation(STORAGE_KEYS.TKA_SUBMISSIONS);
};

export const clearStoredTKASubmissions = () => {
  inMemoryLargeCache[STORAGE_KEYS.TKA_SUBMISSIONS] = [];
  void idbRemove(STORAGE_KEYS.TKA_SUBMISSIONS);
  safeRemoveLocalStorage(STORAGE_KEYS.TKA_SUBMISSIONS);
  safeRemoveLocalStorage(idbMarkerForKey(STORAGE_KEYS.TKA_SUBMISSIONS));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sekolahku-exam-results-updated'));
  }
  notifyStorageMutation(STORAGE_KEYS.TKA_SUBMISSIONS);
};

export const clearTKAResultsFromStorage = (options?: {
  scope?: 'paket' | 'all';
  targetPaket?: string;
}): TKASubmissionItem[] => {
  const scope = options?.scope || 'all';
  const targetPaket = options?.targetPaket || 'all';
  const now = Date.now();

  if (scope === 'paket' && targetPaket && targetPaket !== 'all') {
    const baseTarget = extractBaseTkaPaket(targetPaket);
    markExamResultsResetMeta({
      paketKeys: [{ category: 'tka', paket: baseTarget }],
      timestamp: now,
    });

    const remainingSubs = getStoredTKASubmissions().filter((s) => {
      const subBase = s.paketDasar || extractBaseTkaPaket(s.paket);
      return subBase !== baseTarget && s.paket !== targetPaket;
    });
    saveStoredTKASubmissions(remainingSubs);

    const remainingTkaRes = getStoredTKAResults().filter(
      (r) => !doesExamResultMatchTarget(r, targetPaket)
    );
    saveStoredTKAResults(remainingTkaRes);

    const remainingCbtRes = getStoredCBTResults().filter(
      (r) => !(isTkaResultEntry(r) && doesExamResultMatchTarget(r, targetPaket))
    );
    saveStoredCBTResults(remainingCbtRes);
    return remainingSubs;
  }

  markExamResultsResetMeta({ clearAllTka: true, timestamp: now });
  clearStoredTKASubmissions();
  saveStoredTKAResults([]);

  const remainingCbtRes = getStoredCBTResults().filter((r) => !isTkaResultEntry(r));
  saveStoredCBTResults(remainingCbtRes);
  return [];
};

export const clearCBTResultsFromStorage = (options?: {
  scope?: 'paket' | 'all';
  targetPaket?: string;
  targetMapel?: string;
  studentIds?: string[];
}): CBTExamResult[] => {
  const scope = options?.scope || 'all';
  const targetPaket = options?.targetPaket || 'all';
  const targetMapel = options?.targetMapel;
  const studentIdSet =
    options?.studentIds && options.studentIds.length > 0 ? new Set(options.studentIds) : null;
  const now = Date.now();

  if (scope === 'paket' && targetPaket && targetPaket !== 'all') {
    if (!studentIdSet) {
      markExamResultsResetMeta({
        paketKeys: [{ category: 'cbt', paket: targetPaket, mapel: targetMapel }],
        timestamp: now,
      });
    }
    const existing = getStoredCBTResults();
    const remaining = existing.filter((r) => {
      if (isTkaResultEntry(r)) return true;
      if (studentIdSet && !studentIdSet.has(r.studentId)) return true;
      return !doesExamResultMatchTarget(r, targetPaket, targetMapel);
    });
    saveStoredCBTResults(remaining);
    return remaining;
  }

  if (!studentIdSet && (!targetMapel || targetMapel === 'all')) {
    markExamResultsResetMeta({ clearAllCbt: true, timestamp: now });
  }
  const existing = getStoredCBTResults();
  const remaining = existing.filter((r) => {
    if (isTkaResultEntry(r)) return true;
    if (studentIdSet && !studentIdSet.has(r.studentId)) return true;
    if (targetMapel && targetMapel !== 'all') {
      return !doesExamResultMatchTarget(r, 'all', targetMapel);
    }
    return false;
  });
  saveStoredCBTResults(remaining);
  return remaining;
};

export const getStoredActiveUser = (): ActiveUser => {
  const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
  if (!data) {
    return {
      role: 'admin',
      username: 'admin',
      name: 'Administrator Sekolah',
      detail: 'Admin Utama SDN RBU 21',
      fotoUrl: DEFAULT_SCHOOL_PROFILE.logoSekolahUrl,
    };
  }
  try {
    return JSON.parse(data);
  } catch {
    return {
      role: 'admin',
      username: 'admin',
      name: 'Administrator Sekolah',
      detail: 'Admin Utama SDN RBU 21',
      fotoUrl: DEFAULT_SCHOOL_PROFILE.logoSekolahUrl,
    };
  }
};

export const saveStoredActiveUser = (user: ActiveUser) => {
  safeSetLocalStorage(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(user));
};

// 20 Academic Years: 2020/2021 to 2039/2040
export const ACADEMIC_YEARS: string[] = Array.from({ length: 20 }, (_, i) => {
  const start = 2020 + i;
  return `${start}/${start + 1}`;
});

export const CLASSES_LIST: string[] = [
  'Kelas 1A', 'Kelas 1B',
  'Kelas 2A', 'Kelas 2B',
  'Kelas 3A', 'Kelas 3B',
  'Kelas 4A', 'Kelas 4B',
  'Kelas 5A', 'Kelas 5B',
  'Kelas 6A', 'Kelas 6B',
];

export const getActiveFilters = () => {
  return {
    year: localStorage.getItem(STORAGE_KEYS.ACTIVE_YEAR) || '2026/2027',
    semester: localStorage.getItem(STORAGE_KEYS.ACTIVE_SEMESTER) || 'Semester 1',
    kelas: localStorage.getItem(STORAGE_KEYS.ACTIVE_CLASS) || 'Kelas 6A',
  };
};

export const saveActiveFilters = (year: string, semester: string, kelas: string) => {
  safeSetLocalStorage(STORAGE_KEYS.ACTIVE_YEAR, year);
  safeSetLocalStorage(STORAGE_KEYS.ACTIVE_SEMESTER, semester);
  safeSetLocalStorage(STORAGE_KEYS.ACTIVE_CLASS, kelas);
};

// Backup and Restore
export const exportFullSystemJSON = () => {
  const backupData: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sekolahku_') && !key.endsWith('_in_idb')) {
      try {
        backupData[key] = JSON.parse(localStorage.getItem(key) || 'null');
      } catch {
        backupData[key] = localStorage.getItem(key);
      }
    }
  }
  // Pastikan koleksi besar yang tersimpan di IndexedDB / memori ikut ter-ekspor utuh
  backupData[STORAGE_KEYS.TKA_QUESTIONS] = getStoredTKAQuestions();
  backupData[STORAGE_KEYS.CBT_EXAMS] = getStoredCBTExams();
  backupData[STORAGE_KEYS.STUDENTS] = getStoredStudents();
  backupData[STORAGE_KEYS.TEACHERS] = getStoredTeachers();
  backupData[STORAGE_KEYS.ATTENDANCE] = getStoredAttendance();
  backupData[STORAGE_KEYS.TKA_SUBMISSIONS] = getStoredTKASubmissions();
  backupData[STORAGE_KEYS.CBT_RESULTS] = getStoredCBTResults();
  backupData[STORAGE_KEYS.TKA_RESULTS] = getStoredTKAResults();

  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BACKUP_SEKOLAHKU_SDN_RBU_21_${getLocalTodayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const restoreFullSystemJSON = (jsonString: string) => {
  try {
    const data = JSON.parse(jsonString);
    Object.keys(data).forEach((key) => {
      if (key.endsWith('_in_idb')) return;
      if (key === STORAGE_KEYS.TKA_QUESTIONS && Array.isArray(data[key])) {
        saveHeavyCollection(key, data[key]);
        return;
      }
      if (key === STORAGE_KEYS.CBT_EXAMS && Array.isArray(data[key])) {
        saveHeavyCollection(key, data[key]);
        return;
      }
      if (key === STORAGE_KEYS.STUDENTS && Array.isArray(data[key])) {
        saveHeavyCollection(key, data[key]);
        return;
      }
      if (key === STORAGE_KEYS.TEACHERS && Array.isArray(data[key])) {
        saveHeavyCollection(key, data[key]);
        return;
      }
      if (key === STORAGE_KEYS.ATTENDANCE && data[key] && typeof data[key] === 'object') {
        saveHeavyCollection(key, data[key]);
        return;
      }
      if (key === STORAGE_KEYS.TKA_SUBMISSIONS && Array.isArray(data[key])) {
        saveHeavyCollection(key, sanitizeTkaSubmissionsList(data[key]));
        return;
      }
      if ((key === STORAGE_KEYS.CBT_RESULTS || key === STORAGE_KEYS.TKA_RESULTS) && Array.isArray(data[key])) {
        saveHeavyCollection(key, data[key]);
        return;
      }
      if (typeof data[key] === 'object') {
        safeSetLocalStorage(key, JSON.stringify(data[key]));
      } else {
        safeSetLocalStorage(key, String(data[key]));
      }
    });
    return true;
  } catch (err) {
    console.error('Failed to restore backup:', err);
    return false;
  }
};
