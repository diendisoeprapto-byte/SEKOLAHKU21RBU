import { SchoolProfile, Teacher, Student, Subject, KaldikDay, AssessmentData, CBTExam, CBTExamResult, ActiveUser, StudentReportNotes, TKACpTp, TKAQuestion } from '../types';
import { DEFAULT_SCHOOL_PROFILE, DEFAULT_TEACHERS, DEFAULT_STUDENTS, DEFAULT_SUBJECTS, DEFAULT_KALDIK_HOLIDAYS, DEFAULT_CBT_EXAM, DEFAULT_TKA_CP_TP, DEFAULT_TKA_QUESTIONS } from '../data/defaultData';

const STORAGE_KEYS = {
  PROFILE: 'sekolahku_school_profile',
  TEACHERS: 'sekolahku_teachers',
  STUDENTS: 'sekolahku_students',
  SUBJECTS: 'sekolahku_subjects',
  KALDIK: 'sekolahku_kaldik_holidays',
  ATTENDANCE: 'sekolahku_attendance_records',
  ASSESSMENTS: 'sekolahku_assessments_data',
  AS_COUNT: 'sekolahku_assessment_counts', // subject/class -> number of AS columns
  NOTES: 'sekolahku_report_notes',
  CBT_EXAMS: 'sekolahku_cbt_exams',
  CBT_RESULTS: 'sekolahku_cbt_results',
  TKA_CP_TP: 'sekolahku_tka_cp_tp',
  TKA_QUESTIONS: 'sekolahku_tka_questions',
  TKA_RESULTS: 'sekolahku_tka_results',
  TKA_SUBMISSIONS: 'sekolahku_tka_submissions',
  ACTIVE_USER: 'sekolahku_active_user',
  ACTIVE_YEAR: 'sekolahku_active_year',
  ACTIVE_SEMESTER: 'sekolahku_active_semester',
  ACTIVE_CLASS: 'sekolahku_active_class',
  ADMIN_PASSWORD: 'sekolahku_admin_password',
};

export const getStoredAdminPassword = (): string => {
  return localStorage.getItem(STORAGE_KEYS.ADMIN_PASSWORD) || 'admin';
};

export const saveStoredAdminPassword = (password: string) => {
  localStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD, password);
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
  localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
};

export const getStoredTeachers = (): Teacher[] => {
  const data = localStorage.getItem(STORAGE_KEYS.TEACHERS);
  if (!data) return DEFAULT_TEACHERS;
  try {
    return JSON.parse(data);
  } catch {
    return DEFAULT_TEACHERS;
  }
};

export const saveStoredTeachers = (teachers: Teacher[]) => {
  localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(teachers));
};

export const getStoredStudents = (): Student[] => {
  const data = localStorage.getItem(STORAGE_KEYS.STUDENTS);
  if (!data) return DEFAULT_STUDENTS;
  try {
    return JSON.parse(data);
  } catch {
    return DEFAULT_STUDENTS;
  }
};

export const saveStoredStudents = (students: Student[]) => {
  localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
};

export const getStoredSubjects = (): Subject[] => {
  const data = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
  if (!data) return DEFAULT_SUBJECTS;
  try {
    return JSON.parse(data);
  } catch {
    return DEFAULT_SUBJECTS;
  }
};

export const saveStoredSubjects = (subjects: Subject[]) => {
  localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
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
  localStorage.setItem(STORAGE_KEYS.KALDIK, JSON.stringify(days));
};

export interface AttendanceRecordItem {
  id: string; // date_studentId
  studentId: string;
  date: string;
  status: 'H' | 'S' | 'I' | 'A';
  time: string;
}

export const getStoredAttendance = (): Record<string, AttendanceRecordItem> => {
  const data = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
  if (!data) {
    // Generate initial sample attendance records for students today
    const today = new Date().toISOString().split('T')[0];
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
  }
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
};

export const saveStoredAttendance = (records: Record<string, AttendanceRecordItem>) => {
  localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(records));
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
  localStorage.setItem(STORAGE_KEYS.AS_COUNT, JSON.stringify(parsed));
};

// Assessment data: key is `${year}_${semester}_${kelas}_${subjectId}`
export const getStoredAssessments = (key: string): AssessmentData => {
  const data = localStorage.getItem(`${STORAGE_KEYS.ASSESSMENTS}_${key}`);
  if (!data) {
    // Generate default sample grades for students
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
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
};

export const saveStoredAssessments = (key: string, data: AssessmentData) => {
  localStorage.setItem(`${STORAGE_KEYS.ASSESSMENTS}_${key}`, JSON.stringify(data));
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
  localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
};

export const getStoredCBTExams = (): CBTExam[] => {
  const data = localStorage.getItem(STORAGE_KEYS.CBT_EXAMS);
  if (!data) return [DEFAULT_CBT_EXAM];
  try {
    return JSON.parse(data);
  } catch {
    return [DEFAULT_CBT_EXAM];
  }
};

export const saveStoredCBTExams = (exams: CBTExam[]) => {
  localStorage.setItem(STORAGE_KEYS.CBT_EXAMS, JSON.stringify(exams));
};

export const getStoredCBTResults = (): CBTExamResult[] => {
  const data = localStorage.getItem(STORAGE_KEYS.CBT_RESULTS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveStoredCBTResults = (results: CBTExamResult[]) => {
  localStorage.setItem(STORAGE_KEYS.CBT_RESULTS, JSON.stringify(results));
};

export const getStoredTKACpTp = (): TKACpTp[] => {
  const data = localStorage.getItem(STORAGE_KEYS.TKA_CP_TP);
  if (!data) return DEFAULT_TKA_CP_TP;
  try {
    return JSON.parse(data);
  } catch {
    return DEFAULT_TKA_CP_TP;
  }
};

export const saveStoredTKACpTp = (cpList: TKACpTp[]) => {
  localStorage.setItem(STORAGE_KEYS.TKA_CP_TP, JSON.stringify(cpList));
};

export const getStoredTKAQuestions = (): TKAQuestion[] => {
  const data = localStorage.getItem(STORAGE_KEYS.TKA_QUESTIONS);
  if (!data) return DEFAULT_TKA_QUESTIONS;
  try {
    return JSON.parse(data);
  } catch {
    return DEFAULT_TKA_QUESTIONS;
  }
};

export const saveStoredTKAQuestions = (questions: TKAQuestion[]) => {
  localStorage.setItem(STORAGE_KEYS.TKA_QUESTIONS, JSON.stringify(questions));
};

export const getStoredTKAResults = (): CBTExamResult[] => {
  const data = localStorage.getItem(STORAGE_KEYS.TKA_RESULTS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveStoredTKAResults = (results: CBTExamResult[]) => {
  localStorage.setItem(STORAGE_KEYS.TKA_RESULTS, JSON.stringify(results));
};

export interface TKASubmissionItem {
  id: string;
  studentId: string;
  studentName: string;
  nisn: string;
  kelas: string;
  fotoUrl: string;
  paket: string;
  answers: Record<string, any>;
  scoresPerMapel: {
    'Bahasa Indonesia': number;
    'Matematika': number;
    'IPAS': number;
    'Bahasa Inggris': number;
  };
  skorTotal: number;
  predikat: 'A' | 'B' | 'C' | 'D';
  status: 'Tuntas' | 'Remedial';
  tanggalUjian: string;
  durasiPengerjaan?: string;
}

export const getStoredTKASubmissions = (): TKASubmissionItem[] => {
  const data = localStorage.getItem(STORAGE_KEYS.TKA_SUBMISSIONS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveStoredTKASubmissions = (submissions: TKASubmissionItem[]) => {
  localStorage.setItem(STORAGE_KEYS.TKA_SUBMISSIONS, JSON.stringify(submissions));
};

export const clearStoredTKASubmissions = () => {
  localStorage.removeItem(STORAGE_KEYS.TKA_SUBMISSIONS);
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
  localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(user));
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
  localStorage.setItem(STORAGE_KEYS.ACTIVE_YEAR, year);
  localStorage.setItem(STORAGE_KEYS.ACTIVE_SEMESTER, semester);
  localStorage.setItem(STORAGE_KEYS.ACTIVE_CLASS, kelas);
};

// Backup and Restore
export const exportFullSystemJSON = () => {
  const backupData: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sekolahku_')) {
      try {
        backupData[key] = JSON.parse(localStorage.getItem(key) || 'null');
      } catch {
        backupData[key] = localStorage.getItem(key);
      }
    }
  }
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BACKUP_SEKOLAHKU_SDN_RBU_21_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const restoreFullSystemJSON = (jsonString: string) => {
  try {
    const data = JSON.parse(jsonString);
    Object.keys(data).forEach((key) => {
      if (typeof data[key] === 'object') {
        localStorage.setItem(key, JSON.stringify(data[key]));
      } else {
        localStorage.setItem(key, String(data[key]));
      }
    });
    return true;
  } catch (err) {
    console.error('Failed to restore backup:', err);
    return false;
  }
};
