import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Laptop,
  Sparkles,
  Award,
  Sprout,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Send,
  HelpCircle,
  FileText,
  User,
  GraduationCap,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  CheckCircle,
  Lock,
  HeartHandshake,
  BookOpen,
  Sun,
  Coffee,
  Smile,
  ThumbsUp,
  Save,
  Trash2,
  Presentation,
  MessageCircleHeart,
  Database,
  Loader2,
  Zap,
} from 'lucide-react';
import { collection, addDoc, doc, setDoc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { sanitizeInput } from '../utils/sanitize';
import {
  ActiveUser,
  ActiveExamHeaderStatus,
  Student,
  Subject,
  SchoolProfile,
  CBTExam,
  CBTQuestion,
  TKAQuestion,
  TUJUH_KEBIASAAN_LIST,
  KebiasaanReportItem,
  isAbkExcludedFromTka,
} from '../types';
import {
  getStoredCBTExams,
  getStoredCBTDurations,
  getCBTDurationMinutes,
  getStoredCBTActivePackages,
  getStoredCBTResults,
  saveStoredCBTResults,
  getStoredTKAQuestions,
  getStoredTKADurations,
  getTKADurationKey,
  getTKADurationMinutes,
  getStoredTKAActivePackages,
  isTKAPackageActive,
  normalizeTkaMapelKey,
  getStoredAssessments,
  saveStoredAssessments,
  getActiveFilters,
  CLASSES_LIST,
} from '../utils/storage';
import {
  upsertTkaSubmissionAsync,
  reconcileAndSyncLocalTkaSubmissions,
  findLiveStudentForRecord,
  savePeriodicTkaDraftToFirestore,
} from '../utils/tkaFirestore';
import {
  saveCbtResultToFirestore,
  savePeriodicCbtDraftToFirestore,
  buildCbtResultDocId,
  CBT_RESULTS_COLLECTION,
} from '../utils/cbtResultFirestore';
import { computeExamHotsStats, formatDurasiDetik } from '../utils/examRanking';
import { syncAllLocalToCloud } from '../utils/cloudSync';
import {
  StudentExamDraft,
  buildQuestionOrderSnapshot,
  restoreQuestionsFromSnapshot,
  saveStudentExamDraft,
  getStudentExamDraftById,
  getLastActiveStudentExamDraft,
  clearStudentExamDraft,
  countAnsweredQuestions,
  isQuestionAnswerFilled,
} from '../utils/examDraft';
import { TKA_JENIS_LIST, TKA_MAPEL_LIST } from '../data/defaultData';
import { evaluateQuestionScore, normalizeString } from '../utils/answerChecker';
import { evaluateStudentAnswer } from '../utils/examEngine';
import { getLocalTodayStr } from '../utils/dateUtils';
import { QuestionContent } from './QuestionContent';
import { MathRenderer } from './MathRenderer';
import { BenarSalahTableView, MenjodohkanColumnsView } from './StructuredQuestionViews';
import { resolveBenarSalahItems, resolveMenjodohkanData } from '../utils/questionFormat';
import { StudentPerformanceStats } from './StudentPerformanceStats';
import { saveHasilUjianToFirestore } from '../utils/sarahExamAccess';
import {
  buildTkaExamDocId,
  computeConcurrentSubmitJitterMs,
  detectLargeConcurrentExam,
  fetchExamAnswerKeysFromFirestore,
  mergeQuestionsWithAnswerKeys,
  resolveBuiltInSampleExamKeys,
  stripAnswerKeysFromQuestion,
} from '../utils/examAnswerKeyFirestore';


interface Props {
  activeUser: ActiveUser;
  students: Student[];
  subjects: Subject[];
  activeClass: string;
  activeYear?: string;
  activeSemester?: string;
  profile: SchoolProfile;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onNavigateTab: (tab: any) => void;
  initialTab?: string;
  onExamStatusChange?: (status: ActiveExamHeaderStatus | null) => void;
  onExamActiveChange?: (active: boolean) => void;
}

interface ExamOptionItem {
  id: string;
  category: 'cbt' | 'tka';
  mapel: string;
  judul: string;
  durasiMenit: number;
  paketName: string;
  subPaket?: string;
  kelas?: string;
  isTeacherCreated?: boolean;
  soalList: CBTQuestion[];
}

export const StudentDashboard: React.FC<Props> = ({
  activeUser,
  students,
  subjects,
  activeClass,
  activeYear = '2026/2027',
  activeSemester = 'Ganjil',
  profile,
  showToast,
  onNavigateTab,
  initialTab,
  onExamStatusChange,
  onExamActiveChange,
}) => {
  const [submittingModalState, setSubmittingModalState] = useState<{
    isOpen: boolean;
    status: 'submitting' | 'retry' | 'success';
    attemptCount: number;
    message: string;
  }>({
    isOpen: false,
    status: 'submitting',
    attemptCount: 1,
    message: 'Mengirim jawaban ke server...',
  });


  // Mode tampilan siswa: 'home' (cards), 'cbt' (flow ujian CBT), 'tka' (flow ujian TKA), 'kebiasaan' (Form Laporan 7 Kebiasaan)
  const [viewMode, setViewMode] = useState<'home' | 'cbt' | 'tka' | 'kebiasaan'>(() => {
    if (initialTab === 'laporan-kebiasaan') return 'kebiasaan';
    if (initialTab === 'ujian') return 'cbt';
    if (initialTab === 'tes-tka-siswa') return 'tka';
    return 'home';
  });

  const [cbtExamsState, setCbtExamsState] = useState<CBTExam[]>(() =>
    getStoredCBTExams().map((ex) => ({
      ...ex,
      soalList: Array.isArray(ex.soalList) ? ex.soalList.map((q) => stripAnswerKeysFromQuestion(q)) : [],
    }))
  );
  const [cbtDurations, setCbtDurations] = useState<Record<string, number>>(() => getStoredCBTDurations());
  const [cbtActivePackages, setCbtActivePackages] = useState<Record<string, boolean>>(() =>
    getStoredCBTActivePackages()
  );
  const [tkaDurations, setTkaDurations] = useState<Record<string, number>>(() => getStoredTKADurations());
  const [tkaActivePackages, setTkaActivePackages] = useState<Record<string, boolean>>(() =>
    getStoredTKAActivePackages()
  );
  const [tkaQuestionsState, setTkaQuestionsState] = useState<TKAQuestion[]>(() =>
    getStoredTKAQuestions().map((q) => stripAnswerKeysFromQuestion(q))
  );

  useEffect(() => {
    const syncCbt = () => {
      setCbtExamsState(
        getStoredCBTExams().map((ex) => ({
          ...ex,
          soalList: Array.isArray(ex.soalList) ? ex.soalList.map((q) => stripAnswerKeysFromQuestion(q)) : [],
        }))
      );
      setCbtDurations(getStoredCBTDurations());
      setCbtActivePackages(getStoredCBTActivePackages());
    };
    const syncCbtDurations = () => setCbtDurations(getStoredCBTDurations());
    const syncDurations = () => setTkaDurations(getStoredTKADurations());
    const syncTkaActive = () => setTkaActivePackages(getStoredTKAActivePackages());
    const syncTkaQuestions = () =>
      setTkaQuestionsState(getStoredTKAQuestions().map((q) => stripAnswerKeysFromQuestion(q)));
    const syncCloudAll = () => {
      syncCbt();
      syncDurations();
      syncTkaActive();
      syncTkaQuestions();
    };
    window.addEventListener('sekolahku-cbt-exams-updated', syncCbt);
    window.addEventListener('sekolahku-cbt-durations-updated', syncCbtDurations);
    window.addEventListener('sekolahku-tka-durations-updated', syncDurations);
    window.addEventListener('sekolahku-tka-active-updated', syncTkaActive);
    window.addEventListener('sekolahku-tka-questions-updated', syncTkaQuestions);
    window.addEventListener('sekolahku-cloud-sync-updated', syncCloudAll);
    window.addEventListener('storage', syncCloudAll);
    return () => {
      window.removeEventListener('sekolahku-cbt-exams-updated', syncCbt);
      window.removeEventListener('sekolahku-cbt-durations-updated', syncCbtDurations);
      window.removeEventListener('sekolahku-tka-durations-updated', syncDurations);
      window.removeEventListener('sekolahku-tka-active-updated', syncTkaActive);
      window.removeEventListener('sekolahku-tka-questions-updated', syncTkaQuestions);
      window.removeEventListener('sekolahku-cloud-sync-updated', syncCloudAll);
      window.removeEventListener('storage', syncCloudAll);
    };
  }, []);

  useEffect(() => {
    setCbtExamsState(
      getStoredCBTExams().map((ex) => ({
        ...ex,
        soalList: Array.isArray(ex.soalList) ? ex.soalList.map((q) => stripAnswerKeysFromQuestion(q)) : [],
      }))
    );
    setCbtDurations(getStoredCBTDurations());
    setCbtActivePackages(getStoredCBTActivePackages());
    setTkaDurations(getStoredTKADurations());
    setTkaActivePackages(getStoredTKAActivePackages());
    setTkaQuestionsState(getStoredTKAQuestions().map((q) => stripAnswerKeysFromQuestion(q)));
  }, [viewMode]);

  useEffect(() => {
    if (initialTab === 'laporan-kebiasaan') {
      setViewMode('kebiasaan');
      setIsExamRunning(false);
      onExamActiveChange?.(false);
      onExamStatusChange?.(null);
      setSubmittingModalState((prev) => ({ ...prev, isOpen: false }));
      setExamResult(null);
    } else if (initialTab === 'ujian') {
      setViewMode('cbt');
      setIsExamRunning(false);
      onExamActiveChange?.(false);
      onExamStatusChange?.(null);
      setSubmittingModalState((prev) => ({ ...prev, isOpen: false }));
      setExamResult(null);
      try {
        localStorage.removeItem('sekolahku_pending_submission_lock_v1');
      } catch {}
    } else if (initialTab === 'tes-tka-siswa') {
      setViewMode('tka');
      setIsExamRunning(false);
      onExamActiveChange?.(false);
      onExamStatusChange?.(null);
      setSubmittingModalState((prev) => ({ ...prev, isOpen: false }));
      setExamResult(null);
      try {
        localStorage.removeItem('sekolahku_pending_submission_lock_v1');
      } catch {}
    } else if (initialTab === 'dashboard') {
      setViewMode('home');
      setIsExamRunning(false);
      onExamActiveChange?.(false);
      onExamStatusChange?.(null);
      setSubmittingModalState((prev) => ({ ...prev, isOpen: false }));
      setExamResult(null);
    }
  }, [initialTab, onExamActiveChange, onExamStatusChange]);

  // State untuk alur ujian & filter dropdown Paket Soal + Mata Pelajaran
  const [selectedPaketFilter, setSelectedPaketFilter] = useState<string>('');
  const [selectedMapelFilter, setSelectedMapelFilter] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [isExamRunning, setIsExamRunning] = useState<boolean>(false);

  useEffect(() => {
    onExamActiveChange?.(isExamRunning);
    return () => {
      onExamActiveChange?.(false);
    };
  }, [isExamRunning, onExamActiveChange]);

  useEffect(() => {
    return () => {
      onExamActiveChange?.(false);
      onExamStatusChange?.(null);
    };
  }, [onExamActiveChange, onExamStatusChange]);

  // Sinkronisasi data tertunda di latar belakang secara senyap (silent background sync)
  // TIDAK memunculkan modal 'Pengiriman Nilai Berhasil' saat baru membuka menu ujian
  useEffect(() => {
    try {
      const pendingRaw = localStorage.getItem('sekolahku_pending_submission_lock_v1');
      if (pendingRaw) {
        const item = JSON.parse(pendingRaw);
        if (item && item.idUjian) {
          void (async () => {
            let recovered = false;
            let recAttempt = 0;
            const docId = buildCbtResultDocId(item.idUjian, item.nisn || item.nama);
            while (!recovered && recAttempt < 10) {
              recAttempt++;
              try {
                if (item.category === 'tka') {
                  const normMapelKey = normalizeTkaMapelKey(item.mapel);
                  const durationUsed = Math.max(1, Math.ceil((item.durasiDetik || 60) / 60));
                  const tkaRes = await upsertTkaSubmissionAsync({
                    student: {
                      id: item.nisn || 'siswa',
                      nama: item.nama,
                      kelas: item.kelas,
                      nisn: item.nisn,
                    } as any,
                    paketName: item.paketName,
                    mapelScores: { [normMapelKey]: item.nilaiAkhir },
                    completedMapelKeys: [normMapelKey],
                    questionAnswers: item.skorPerNomor || {},
                    durasiMenitUsed: durationUsed,
                    durasiDetik: item.durasiDetik || 60,
                    benarHots: item.benarHots || 0,
                    totalHots: item.totalHots || 0,
                    jenjang: item.kelas || 'Kelas 6',
                    tahunPelajaran: activeYear,
                    semester: activeSemester,
                  });
                  if (tkaRes && (tkaRes as any).cloudSaved) {
                    recovered = true;
                  }
                } else {
                  await saveCbtResultToFirestore({
                    examId: item.idUjian,
                    studentId: item.nisn || 'siswa',
                    studentName: item.nama,
                    nisn: item.nisn,
                    kelas: item.kelas,
                    skor: item.nilaiAkhir,
                    nilai: item.nilaiAkhir,
                    waktuSelesai: new Date().toLocaleTimeString(),
                    jawabanSiswa: item.skorPerNomor || {},
                    category: 'cbt',
                    mapel: item.mapel,
                    judul: item.judul,
                    paketName: item.paketName,
                    tanggal: getLocalTodayStr(),
                    recordedAt: item.recordedAt || Date.now(),
                    tahunPelajaran: activeYear,
                    semester: activeSemester,
                    statusPengerjaan: 'selesai',
                  });
                  const snap = (await Promise.race([
                    getDoc(doc(db, CBT_RESULTS_COLLECTION, docId)),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 8000)),
                  ])) as any;
                  if (snap && snap.exists()) {
                    recovered = true;
                  }
                }
              } catch {
                // ignore
              }
              if (!recovered) {
                await new Promise((res) => setTimeout(res, 4000));
              }
            }
            // Hapus data tertunda setelah tersinkronisasi agar tidak muncul kembali
            try {
              localStorage.removeItem('sekolahku_pending_submission_lock_v1');
            } catch {}
          })();
        } else {
          try {
            localStorage.removeItem('sekolahku_pending_submission_lock_v1');
          } catch {}
        }
      }
    } catch {
      try {
        localStorage.removeItem('sekolahku_pending_submission_lock_v1');
      } catch {}
    }
  }, [activeYear, activeSemester]);
  const [runningExamSnapshot, setRunningExamSnapshot] = useState<ExamOptionItem | null>(null);
  const [runningSoalList, setRunningSoalList] = useState<CBTQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [examResult, setExamResult] = useState<{
    score: number;
    maxScore: number;
    durasiDetik?: number;
    benarHots?: number;
    totalHots?: number;
    lockedPracticeOnly?: boolean;
    lockedScore?: number;
  } | null>(null);
  const [firestoreSaveStatus, setFirestoreSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isSavingSubmission, setIsSavingSubmission] = useState<boolean>(false);
  const [offlineQueueNotice, setOfflineQueueNotice] = useState<boolean>(false);
  const [resumedNotice, setResumedNotice] = useState<string | null>(null);
  const [draftRevisionTick, setDraftRevisionTick] = useState<number>(0);
  const [timeUpModal, setTimeUpModal] = useState<{
    isOpen: boolean;
    status: 'submitting' | 'done';
    examTitle: string;
    category: 'cbt' | 'tka';
    answeredCount: number;
    totalQuestions: number;
    score: number | null;
    cloudSaved: boolean;
  } | null>(null);

  const autoResumedModeRef = useRef<string>('');
  const isSubmittingExamRef = useRef<boolean>(false);
  const examStartTimestampRef = useRef<number>(Date.now());
  const lastCloudCheckpointAtRef = useRef<number>(0);
  const lastCloudCheckpointCountRef = useRef<number>(0);
  const handleFinishExamRef = useRef<(isAutoSubmit?: boolean) => void>(() => {});
  const latestExamStateRef = useRef<{
    studentId: string;
    exam: ExamOptionItem | null;
    selectedPaketFilter: string;
    selectedMapelFilter: string;
    currentQIndex: number;
    answers: Record<string, any>;
    timeLeft: number;
    runningSoalList: CBTQuestion[];
    isExamRunning: boolean;
  }>({
    studentId: '',
    exam: null,
    selectedPaketFilter: '',
    selectedMapelFilter: '',
    currentQIndex: 0,
    answers: {},
    timeLeft: 0,
    runningSoalList: [],
    isExamRunning: false,
  });

  // Cari data siswa saat ini (prioritaskan NISN & nama agar kebal terhadap perubahan ID siswa saat impor ulang)
  const currentStudent = useMemo(() => {
    const ad = activeUser.studentData;
    const liveMatch = findLiveStudentForRecord(students, {
      studentId: ad?.id,
      nisn: ad?.nisn,
      studentName: ad?.nama || activeUser.name,
      username: activeUser.username,
    });
    return liveMatch || ad || students[0];
  }, [activeUser, students]);
  const isExcludedFromTka = isAbkExcludedFromTka(currentStudent);

  // State Form Input 7 Kebiasaan Siswa
  const todayStrKebiasaan = getLocalTodayStr();
  const [kebiasaanFormNama, setKebiasaanFormNama] = useState<string>('');
  const [kebiasaanFormKelas, setKebiasaanFormKelas] = useState<string>(activeClass);
  const [kebiasaanFormTanggal, setKebiasaanFormTanggal] = useState<string>(todayStrKebiasaan);
  const [kebiasaanStatus, setKebiasaanStatus] = useState<Record<string, boolean>>({
    bangunPagi: false,
    ibadah: false,
    mandiGosokGigi: false,
    sarapanSehat: false,
    berpamitan: false,
    membacaBuku: false,
    membantuOrangTua: false,
  });
  const [kebiasaanNotes, setKebiasaanNotes] = useState<Record<string, string>>({
    bangunPagi: '',
    ibadah: '',
    mandiGosokGigi: '',
    sarapanSehat: '',
    berpamitan: '',
    membacaBuku: '',
    membantuOrangTua: '',
  });
  const [kebiasaanSelectedIndicators, setKebiasaanSelectedIndicators] = useState<
    Record<string, string[]>
  >({
    bangunPagi: [],
    ibadah: [],
    mandiGosokGigi: [],
    sarapanSehat: [],
    berpamitan: [],
    membacaBuku: [],
    membantuOrangTua: [],
  });
  const [kebiasaanCatatanSiswa, setKebiasaanCatatanSiswa] = useState<string>('');
  const [isSubmittingKebiasaan, setIsSubmittingKebiasaan] = useState<boolean>(false);
  const [kebiasaanSuccessModal, setKebiasaanSuccessModal] = useState<boolean>(false);
  const [hasKebiasaanUnsavedChanges, setHasKebiasaanUnsavedChanges] = useState<boolean>(false);
  const kebiasaanDirtyRef = useRef<boolean>(false);
  const hydratedKebiasaanKeyRef = useRef<string>('');
  const [cloudStudentKebiasaan, setCloudStudentKebiasaan] = useState<KebiasaanReportItem[]>([]);
  const [localStudentKebiasaan, setLocalStudentKebiasaan] = useState<KebiasaanReportItem[]>(() => {
    try {
      const saved = localStorage.getItem('sekolahku_student_kebiasaan_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (currentStudent) {
      setKebiasaanFormNama(currentStudent.nama);
      setKebiasaanFormKelas(currentStudent.kelas || activeClass);
    }
  }, [currentStudent, activeClass]);

  // Sinkronisasi real-time Firestore collection 'laporan_kebiasaan' khusus siswa yang login
  useEffect(() => {
    if (!currentStudent) return;
    const targetId = (currentStudent.id || '').trim();
    const targetName = (currentStudent.nama || '').trim().toLowerCase();

    const unsub = onSnapshot(
      collection(db, 'laporan_kebiasaan'),
      (snap) => {
        const items: KebiasaanReportItem[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const matchesStudent =
            (targetId && data.studentId === targetId) ||
            (targetName && (data.namaSiswa || '').trim().toLowerCase() === targetName);
          if (matchesStudent) {
            items.push({
              id: docSnap.id,
              namaSiswa: data.namaSiswa || currentStudent.nama,
              studentId: data.studentId || currentStudent.id,
              kelas: data.kelas || currentStudent.kelas,
              tanggal: data.tanggal || '',
              waktuKirim: data.waktuKirim || '-',
              kebiasaan: data.kebiasaan || {},
              indikatorTerpilih: data.indikatorTerpilih || undefined,
              catatan: data.catatan || {},
              skor: typeof data.skor === 'number' ? data.skor : 0,
              catatanSiswa: data.catatanSiswa || '',
              createdAt: data.createdAt || undefined,
            });
          }
        });
        items.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
        setCloudStudentKebiasaan(items);
      },
      (err) => {
        console.warn('Listener laporan_kebiasaan siswa warning:', err);
      }
    );

    return () => unsub();
  }, [currentStudent]);

  // Gabungkan laporan cloud & lokal khusus untuk siswa ini
  const studentPastReports = useMemo(() => {
    const targetId = (currentStudent?.id || '').trim();
    const targetName = (currentStudent?.nama || '').trim().toLowerCase();
    const filteredLocal = localStudentKebiasaan.filter(
      (r) =>
        (targetId && r.studentId === targetId) ||
        (targetName && (r.namaSiswa || '').trim().toLowerCase() === targetName)
    );
    const byKey = new Map<string, KebiasaanReportItem>();
    [...filteredLocal, ...cloudStudentKebiasaan].forEach((rep) => {
      if (!rep.tanggal) return;
      const prev = byKey.get(rep.tanggal);
      if (!prev) {
        byKey.set(rep.tanggal, rep);
        return;
      }
      const prevFromCloud = prev.id && !prev.id.startsWith('local_');
      const nextFromCloud = rep.id && !rep.id.startsWith('local_');
      const prevTime = prev.createdAt ? new Date(prev.createdAt).getTime() : 0;
      const nextTime = rep.createdAt ? new Date(rep.createdAt).getTime() : 0;
      if (nextTime > prevTime || (nextTime === prevTime && nextFromCloud && !prevFromCloud)) {
        byKey.set(rep.tanggal, rep);
      }
    });
    return Array.from(byKey.values()).sort((a, b) =>
      (b.tanggal || '').localeCompare(a.tanggal || '')
    );
  }, [cloudStudentKebiasaan, localStudentKebiasaan, currentStudent]);

  // Hidrasi otomatis status & indikator untuk tanggal pelaporan yang dipilih bila belum diedit pengguna
  useEffect(() => {
    const studentKey = `${currentStudent?.id || ''}_${kebiasaanFormTanggal}`;
    const savedForDate = studentPastReports.find((r) => r.tanggal === kebiasaanFormTanggal);
    if (!savedForDate) {
      if (hydratedKebiasaanKeyRef.current !== studentKey && !kebiasaanDirtyRef.current) {
        hydratedKebiasaanKeyRef.current = studentKey;
      }
      return;
    }
    if (kebiasaanDirtyRef.current && hydratedKebiasaanKeyRef.current === studentKey) {
      return;
    }
    hydratedKebiasaanKeyRef.current = studentKey;
    kebiasaanDirtyRef.current = false;
    setHasKebiasaanUnsavedChanges(false);

    const nextStatus: Record<string, boolean> = {};
    const nextIndicators: Record<string, string[]> = {};
    TUJUH_KEBIASAAN_LIST.forEach((h) => {
      const savedInd = savedForDate.indikatorTerpilih?.[h.id];
      const indList = Array.isArray(savedInd) ? savedInd : [];
      nextIndicators[h.id] = indList;
      nextStatus[h.id] = Boolean(savedForDate.kebiasaan?.[h.id]) || indList.length > 0;
    });
    setKebiasaanStatus(nextStatus);
    setKebiasaanSelectedIndicators(nextIndicators);
    if (savedForDate.catatanSiswa) {
      setKebiasaanCatatanSiswa(savedForDate.catatanSiswa);
    }
  }, [studentPastReports, kebiasaanFormTanggal, currentStudent?.id]);

  // Handler toggle indikator kegiatan spesifik per kebiasaan
  const handleToggleIndikator = (habitId: string, indikatorTitle: string) => {
    kebiasaanDirtyRef.current = true;
    setHasKebiasaanUnsavedChanges(true);
    setKebiasaanSelectedIndicators((prev) => {
      const currentList = prev[habitId] || [];
      const exists = currentList.includes(indikatorTitle);
      const nextList = exists
        ? currentList.filter((t) => t !== indikatorTitle)
        : [...currentList, indikatorTitle];

      setKebiasaanStatus((prevStatus) => ({
        ...prevStatus,
        [habitId]: nextList.length > 0,
      }));

      return {
        ...prev,
        [habitId]: nextList,
      };
    });
  };

  // Handler pilih seluruh indikator pada satu kebiasaan
  const handleSelectAllIndicatorsForHabit = (
    habitId: string,
    titles: string[]
  ) => {
    kebiasaanDirtyRef.current = true;
    setHasKebiasaanUnsavedChanges(true);
    const currentList = kebiasaanSelectedIndicators[habitId] || [];
    const allSelected = titles.every((t) => currentList.includes(t));
    const nextList = allSelected ? [] : titles;
    setKebiasaanSelectedIndicators((prev) => ({
      ...prev,
      [habitId]: nextList,
    }));
    setKebiasaanStatus((prev) => ({
      ...prev,
      [habitId]: nextList.length > 0,
    }));
  };

  // Handler tandai semua kebiasaan / seluruh indikator hari ini
  const handleMarkAllKebiasaan = (val: boolean, alsoFillIndicators: boolean = false) => {
    kebiasaanDirtyRef.current = true;
    setHasKebiasaanUnsavedChanges(true);
    const updated: Record<string, boolean> = {};
    const updatedIndikator: Record<string, string[]> = {};
    TUJUH_KEBIASAAN_LIST.forEach((h) => {
      updated[h.id] = val;
      if (val && alsoFillIndicators) {
        updatedIndikator[h.id] = h.indikator.map((ind) => ind.title);
      } else if (!val) {
        updatedIndikator[h.id] = [];
      }
    });
    setKebiasaanStatus(updated);
    if (!val || alsoFillIndicators) {
      setKebiasaanSelectedIndicators((prev) => ({ ...prev, ...updatedIndikator }));
    }
    showToast(
      val
        ? alsoFillIndicators
          ? 'Seluruh 28 indikator (7/7 kebiasaan) hari ini berhasil dicentang!'
          : 'Semua kebiasaan ditandai Sudah Dilakukan!'
        : 'Semua kebiasaan & indikator hari ini direset.',
      'success'
    );
  };

  // Simpan / perbarui progres 7 Kebiasaan ke Firestore & localStorage
  const saveKebiasaanProgress = async (options?: {
    targetDate?: string;
    openModal?: boolean;
  }) => {
    const targetNama = (kebiasaanFormNama || currentStudent?.nama || '').trim();
    const targetKelas = kebiasaanFormKelas || currentStudent?.kelas || activeClass;
    const targetDate = options?.targetDate || kebiasaanFormTanggal || getLocalTodayStr();

    if (!targetNama) {
      showToast('Nama siswa wajib diisi atau dipilih!', 'error');
      return;
    }

    setIsSubmittingKebiasaan(true);
    const completedCount = TUJUH_KEBIASAAN_LIST.filter((h) =>
      Boolean(kebiasaanStatus[h.id])
    ).length;
    const now = new Date();
    const waktuKirim =
      now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

    const mergedCatatan: Record<string, string> = {};
    TUJUH_KEBIASAAN_LIST.forEach((h) => {
      const chosen = kebiasaanSelectedIndicators[h.id] || [];
      const manual = sanitizeInput(kebiasaanNotes[h.id] || '', 500);
      if (chosen.length > 0 && manual) {
        mergedCatatan[h.id] = `${chosen.join('; ')} — ${manual}`;
      } else if (chosen.length > 0) {
        mergedCatatan[h.id] = chosen.join('; ');
      } else {
        mergedCatatan[h.id] = manual;
      }
    });

    const targetStudentId = currentStudent?.id || `std_${Date.now()}`;
    const existingDocForDate = cloudStudentKebiasaan.find(
      (r) => r.tanggal === targetDate && r.id && !r.id.startsWith('local_')
    );

    const newReport: KebiasaanReportItem = {
      namaSiswa: targetNama,
      studentId: targetStudentId,
      kelas: targetKelas,
      tanggal: targetDate,
      waktuKirim,
      kebiasaan: {
        bangunPagi: Boolean(kebiasaanStatus.bangunPagi),
        ibadah: Boolean(kebiasaanStatus.ibadah),
        mandiGosokGigi: Boolean(kebiasaanStatus.mandiGosokGigi),
        sarapanSehat: Boolean(kebiasaanStatus.sarapanSehat),
        berpamitan: Boolean(kebiasaanStatus.berpamitan),
        membacaBuku: Boolean(kebiasaanStatus.membacaBuku),
        membantuOrangTua: Boolean(kebiasaanStatus.membantuOrangTua),
      },
      indikatorTerpilih: {
        bangunPagi: kebiasaanSelectedIndicators.bangunPagi || [],
        ibadah: kebiasaanSelectedIndicators.ibadah || [],
        mandiGosokGigi: kebiasaanSelectedIndicators.mandiGosokGigi || [],
        sarapanSehat: kebiasaanSelectedIndicators.sarapanSehat || [],
        berpamitan: kebiasaanSelectedIndicators.berpamitan || [],
        membacaBuku: kebiasaanSelectedIndicators.membacaBuku || [],
        membantuOrangTua: kebiasaanSelectedIndicators.membantuOrangTua || [],
      },
      catatan: mergedCatatan,
      skor: completedCount,
      catatanSiswa: sanitizeInput(kebiasaanCatatanSiswa, 800),
      createdAt: now.toISOString(),
    };

    const persistLocal = (savedItem: KebiasaanReportItem) => {
      setLocalStudentKebiasaan((prev) => {
        const filtered = prev.filter(
          (r) => !(r.tanggal === savedItem.tanggal && r.studentId === savedItem.studentId)
        );
        const next = [savedItem, ...filtered].slice(0, 35);
        localStorage.setItem('sekolahku_student_kebiasaan_history', JSON.stringify(next));
        return next;
      });
    };

    try {
      if (existingDocForDate?.id) {
        await setDoc(
          doc(db, 'laporan_kebiasaan', existingDocForDate.id),
          {
            ...newReport,
            timestamp: serverTimestamp(),
          },
          { merge: true }
        );
        newReport.id = existingDocForDate.id;
      } else {
        const docRef = await addDoc(collection(db, 'laporan_kebiasaan'), {
          ...newReport,
          timestamp: serverTimestamp(),
        });
        newReport.id = docRef.id;
      }

      persistLocal(newReport);
      kebiasaanDirtyRef.current = false;
      setHasKebiasaanUnsavedChanges(false);

      if (options?.openModal) {
        setKebiasaanSuccessModal(true);
      }
      showToast(
        `Progres 7 Kebiasaan tersimpan (${completedCount}/7 kebiasaan)!`,
        'success'
      );
    } catch (err: any) {
      console.warn('Submit Firestore warning (saved locally):', err);
      newReport.id = `local_${targetDate}_${targetStudentId}`;
      persistLocal(newReport);
      kebiasaanDirtyRef.current = false;
      setHasKebiasaanUnsavedChanges(false);
      if (options?.openModal) {
        setKebiasaanSuccessModal(true);
      }
      showToast('Progres 7 Kebiasaan berhasil disimpan di sistem lokal sekolah!', 'success');
    } finally {
      setIsSubmittingKebiasaan(false);
    }
  };

  // Handler kirim laporan dari Formulir Lengkap 7 Kebiasaan
  const handleSubmitKebiasaan = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveKebiasaanProgress({ openModal: true });
  };


  // Reset dropdown filters saat berpindah mode ujian (CBT <-> TKA)
  useEffect(() => {
    if (!isExamRunning) {
      setSelectedPaketFilter('');
      setSelectedMapelFilter('');
      setSelectedExamId('');
      setExamResult(null);
      setRunningSoalList([]);
    }
  }, [viewMode]);

  // Helper infer paketName dari CBTExam bila exam belum memiliki properti paketName
  const inferCbtPaketName = (judul: string, explicitPaket?: string): string => {
    if (explicitPaket && explicitPaket.trim()) return explicitPaket.trim();
    const j = (judul || '').toLowerCase();
    if (j.includes('asts')) return 'ASTS (Sumatif Tengah Semester)';
    if (j.includes('asas')) return 'ASAS (Sumatif Akhir Semester)';
    const sumatifMatch = judul?.match(/Sumatif\s*\d+\s*\(AS\s*\d+\)/i);
    if (sumatifMatch) return sumatifMatch[0];
    const remMatch = judul?.match(/Remedial\s*\d+/i);
    if (remMatch) return remMatch[0];
    if (judul && judul.includes(' - ')) {
      return judul.split(' - ')[0].trim();
    }
    return 'ASAS (Sumatif Akhir Semester)';
  };

  // Daftar Ujian CBT Tersedia (Dinamis dari Bank Soal Guru + Paket Contoh Bawaan)
  const { allCbtExamsCatalog, cbtExamList } = useMemo(() => {
    const dynamicTeacherAll: Array<ExamOptionItem & { isActive: boolean }> = [];
    const studentClassNorm = (currentStudent?.kelas || activeClass || '').trim().toLowerCase();

    cbtExamsState.forEach((ex) => {
      if (!Array.isArray(ex.soalList) || ex.soalList.length === 0) return;
      const paketName = inferCbtPaketName(ex.judul, ex.paketName);
      const subPaket = ex.subPaket || 'Paket 1';
      const isExamActive =
        typeof ex.aktif === 'boolean'
          ? ex.aktif
          : cbtActivePackages[ex.id] === true;

      const resolvedDuration = getCBTDurationMinutes(cbtDurations, {
        examId: ex.id,
        paket: paketName,
        mapel: ex.mapel,
        fallback: ex.durasiMenit || 60,
      });

      dynamicTeacherAll.push({
        id: ex.id,
        category: 'cbt',
        mapel: ex.mapel,
        judul: `${paketName} - ${ex.mapel} (${subPaket})`,
        durasiMenit: resolvedDuration,
        paketName,
        subPaket,
        kelas: ex.kelas,
        isTeacherCreated: true,
        isActive: isExamActive,
        soalList: ex.soalList.map((q) => stripAnswerKeysFromQuestion(q)),
      });
    });

    // Prioritaskan paket CBT yang sesuai kelas siswa di urutan paling atas
    dynamicTeacherAll.sort((a, b) => {
      const aMatch = (a.kelas || '').trim().toLowerCase() === studentClassNorm ? 0 : 1;
      const bMatch = (b.kelas || '').trim().toLowerCase() === studentClassNorm ? 0 : 1;
      return aMatch - bMatch;
    });

    const sampleCbtDefaults: ExamOptionItem[] = [
      {
        id: 'cbt_ipas_as1',
        category: 'cbt',
        mapel: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        judul: 'Sumatif 1 (AS 1) - Organ Tubuh & Sistem Pernapasan Manusia (Paket 1)',
        durasiMenit: 60,
        paketName: 'Sumatif 1 (AS 1)',
        subPaket: 'Paket 1',
        kelas: currentStudent?.kelas || activeClass,
        soalList: [
          {
            id: 'cbt_q1',
            tipe: 'pg',
            pertanyaan: 'Organ tubuh manusia yang berfungsi sebagai organ utama pernapasan dan tempat pertukaran oksigen dengan karbondioksida adalah...',
            opsi: ['A. Paru-paru', 'B. Jantung', 'C. Lambung', 'D. Ginjal'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_q2',
            tipe: 'pg',
            pertanyaan: 'Bagian darah yang bertugas mengangkut oksigen ke seluruh sel-sel tubuh adalah...',
            opsi: ['A. Sel darah putih (Leukosit)', 'B. Sel darah merah (Eritrosit)', 'C. Keping darah (Trombosit)', 'D. Plasma darah'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_q3',
            tipe: 'pg',
            pertanyaan: 'Hewan berikut ini bernapas menggunakan trakea adalah...',
            opsi: ['A. Ikan mas', 'B. Belalang', 'C. Katak dewasa', 'D. Cacing tanah'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_q4',
            tipe: 'pg',
            pertanyaan: 'Peredaran darah dari jantung menuju ke seluruh tubuh dan kembali lagi ke jantung disebut...',
            opsi: ['A. Peredaran darah kecil', 'B. Peredaran darah besar', 'C. Peredaran darah terbuka', 'D. Peredaran getah bening'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_q5',
            tipe: 'pg',
            pertanyaan: 'Upaya menjaga kesehatan sistem pernapasan pada masa pancaroba adalah...',
            opsi: ['A. Merokok di ruangan tertutup', 'B. Menggunakan masker saat berdebu dan berolahraga rutin', 'C. Tidur larut malam setiap hari', 'D. Mengonsumsi makanan berpengawet tinggi'],
            kunciJawaban: '',
            bobot: 0,
          },
        ],
      },
      {
        id: 'cbt_mtk_as2',
        category: 'cbt',
        mapel: 'Matematika',
        judul: 'Sumatif 2 (AS 2) - Operasi Hitung Campuran Bilangan Bulat (Paket 1)',
        durasiMenit: 60,
        paketName: 'Sumatif 2 (AS 2)',
        subPaket: 'Paket 1',
        kelas: currentStudent?.kelas || activeClass,
        soalList: [
          {
            id: 'cbt_m1',
            tipe: 'pg',
            pertanyaan: 'Hasil dari 150 + 25 × 4 - 100 adalah...',
            opsi: ['A. 150', 'B. 600', 'C. 175', 'D. 250'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_m2',
            tipe: 'pg',
            pertanyaan: 'Suhu di dalam lemari es mula-mula -4°C. Ketika listrik padam, suhu naik 2°C setiap 10 menit. Setelah 30 menit, suhu lemari es menjadi...',
            opsi: ['A. 2°C', 'B. -2°C', 'C. 6°C', 'D. 0°C'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_m3',
            tipe: 'pg',
            pertanyaan: 'FPB dari bilangan 36, 54, dan 72 adalah...',
            opsi: ['A. 9', 'B. 12', 'C. 18', 'D. 24'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_m4',
            tipe: 'pg',
            pertanyaan: 'Ibu memiliki 3 kantong beras, masing-masing berisi 2,5 kg. Beras tersebut dibagikan kepada 5 orang tetangga sama rata. Setiap tetangga menerima...',
            opsi: ['A. 1,5 kg', 'B. 1,2 kg', 'C. 1,8 kg', 'D. 2,0 kg'],
            kunciJawaban: '',
            bobot: 0,
          },
        ],
      },
      {
        id: 'cbt_asts_indo',
        category: 'cbt',
        mapel: 'Bahasa Indonesia',
        judul: 'ASTS (Sumatif Tengah Semester) - Bahasa Indonesia (Paket 1)',
        durasiMenit: 90,
        paketName: 'ASTS (Sumatif Tengah Semester)',
        subPaket: 'Paket 1',
        kelas: currentStudent?.kelas || activeClass,
        soalList: [
          {
            id: 'cbt_bi1',
            tipe: 'pg',
            pertanyaan: 'Teks yang berisi penjelasan mengenai peristiwa alam, sosial, atau budaya secara ilmiah disebut teks...',
            opsi: ['A. Narasi', 'B. Eksplanasi', 'C. Fiksi', 'D. Deskripsi'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_bi2',
            tipe: 'pg',
            pertanyaan: 'Ide pokok pada paragraf induktif berada di...',
            opsi: ['A. Awal paragraf', 'B. Akhir paragraf', 'C. Awal dan akhir paragraf', 'D. Tengah paragraf'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_bi3',
            tipe: 'pg',
            pertanyaan: 'Kata tanya yang tepat untuk menggali alasan atau penyebab terjadinya suatu fenomena adalah...',
            opsi: ['A. Siapa', 'B. Kapan', 'C. Mengapa', 'D. Dimana'],
            kunciJawaban: '',
            bobot: 0,
          },
        ],
      },
      {
        id: 'cbt_asas_pancasila',
        category: 'cbt',
        mapel: 'Pendidikan Pancasila',
        judul: 'ASAS (Sumatif Akhir Semester) - Pendidikan Pancasila (Paket 1)',
        durasiMenit: 90,
        paketName: 'ASAS (Sumatif Akhir Semester)',
        subPaket: 'Paket 1',
        kelas: currentStudent?.kelas || activeClass,
        soalList: [
          {
            id: 'cbt_p1',
            tipe: 'pg',
            pertanyaan: 'Sila dalam Pancasila yang mendasari pentingnya musyawarah untuk mencapai mufakat adalah sila ke-...',
            opsi: ['A. 2', 'B. 3', 'C. 4', 'D. 5'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_p2',
            tipe: 'pg',
            pertanyaan: 'Mendapatkan kasih sayang dan pendidikan yang layak dari orang tua di rumah merupakan contoh...',
            opsi: ['A. Hak anak', 'B. Kewajiban anak', 'C. Hukuman anak', 'D. Paksaan anak'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'cbt_p3',
            tipe: 'pg',
            pertanyaan: 'Sikap yang harus kita tunjukkan ketika pendapat kita tidak diterima dalam musyawarah kelas adalah...',
            opsi: ['A. Marah dan meninggalkan ruangan', 'B. Menerima dengan lapang dada demi kepentingan bersama', 'C. Memaksa teman agar sependapat', 'D. Mogok belajar'],
            kunciJawaban: '',
            bobot: 0,
          },
        ],
      },
    ];

    const catalogAll: ExamOptionItem[] = [...dynamicTeacherAll];
    const activeOnly: ExamOptionItem[] = dynamicTeacherAll.filter((ex) => ex.isActive);

    sampleCbtDefaults.forEach((sample) => {
      const alreadyHasSameBucket = dynamicTeacherAll.some(
        (d) =>
          d.paketName === sample.paketName &&
          d.mapel === sample.mapel &&
          (d.subPaket || 'Paket 1') === (sample.subPaket || 'Paket 1')
      );
      if (!alreadyHasSameBucket) {
        const sampleItem: ExamOptionItem = {
          ...sample,
          durasiMenit: getCBTDurationMinutes(cbtDurations, {
            examId: sample.id,
            paket: sample.paketName,
            mapel: sample.mapel,
            fallback: sample.durasiMenit,
          }),
        };
        catalogAll.push(sampleItem);
        if (cbtActivePackages[sample.id] === true) {
          activeOnly.push(sampleItem);
        }
      }
    });

    return { allCbtExamsCatalog: catalogAll, cbtExamList: activeOnly };
  }, [cbtExamsState, cbtDurations, cbtActivePackages, currentStudent?.kelas, activeClass]);

  // Daftar Ujian TKA (Dinamis dikelompokkan per Jenis TKA + Mata Pelajaran dari Bank Soal TKA Guru)
  const { allTkaExamsCatalog, tkaExamList } = useMemo(() => {
    const storedTkaQuestions = tkaQuestionsState;
    const groupedMap = new Map<string, { jenisTka: string; mapel: string; list: CBTQuestion[] }>();

    storedTkaQuestions.forEach((q) => {
      const jenis = q.jenisTka || 'Simulasi 1';
      const mapel = q.mapel || 'Bahasa Indonesia';
      const key = `${jenis}__${mapel}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, { jenisTka: jenis, mapel, list: [] });
      }
      groupedMap.get(key)!.list.push(q);
    });

    const slug = (v: string) =>
      v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    const dynamicTkaExams: ExamOptionItem[] = Array.from(groupedMap.values()).map((grp) => ({
      id: `tka_live_${slug(grp.jenisTka)}_${slug(grp.mapel)}`,
      category: 'tka',
      mapel: grp.mapel,
      judul: `${grp.jenisTka} - ${grp.mapel}`,
      durasiMenit: getTKADurationMinutes(tkaDurations, grp.jenisTka, grp.mapel),
      paketName: grp.jenisTka,
      subPaket: 'Paket 1',
      isTeacherCreated: true,
      soalList: grp.list.map((q) => stripAnswerKeysFromQuestion(q)),
    }));

    const sampleTkaDefaults: ExamOptionItem[] = [
      {
        id: 'tka_indo_tp612',
        category: 'tka',
        mapel: 'Bahasa Indonesia',
        judul: 'Tryout TKA 1 - Bahasa Indonesia',
        durasiMenit: 90,
        paketName: 'Tryout TKA 1',
        subPaket: 'Paket 1',
        soalList: [
          {
            id: 'tka_bi1',
            tipe: 'pg',
            pertanyaan: 'Bacalah teks berikut:\n"Penggunaan gawai tanpa pengawasan dapat memicu kecanduan serta menurunkan interaksi sosial anak dengan lingkungan nyata. Oleh karena itu, batasan waktu pemakaian gawai wajib diterapkan orang tua secara konsisten."\n\nSimpulan logis paling tepat dari argumen di atas adalah...',
            opsi: [
              'A. Pengawasan gawai secara konsisten oleh orang tua mencegah kecanduan dan menjaga interaksi sosial anak.',
              'B. Anak tidak boleh menyentuh gawai sama sekali di lingkungan sekolah maupun rumah.',
              'C. Gawai adalah penyebab tunggal rusaknya interaksi antar teman sebaya.',
              'D. Orang tua tidak perlu membatasi waktu jika anak berprestasi.',
            ],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'tka_bi2',
            tipe: 'pg',
            pertanyaan: 'Manakah dari kalimat berikut yang mengandung fakta dan bukan sekadar opini subjektif?',
            opsi: [
              'A. Cuaca Jakarta hari ini terasa paling indah dibandingkan kota lain di dunia.',
              'B. Berdasarkan data BMKG, suhu udara Jakarta Utara pada pukul 12.00 mencapai 32 derajat Celsius.',
              'C. Makanan di kantin sekolah adalah makanan paling lezat di seluruh nusantara.',
              'D. Pelajaran Matematika selalu menyenangkan bagi semua peserta didik tanpa kecuali.',
            ],
            kunciJawaban: '',
            bobot: 0,
          },
        ],
      },
      {
        id: 'tka_mtk_tp621',
        category: 'tka',
        mapel: 'Matematika',
        judul: 'Tryout TKA 2 - Matematika',
        durasiMenit: 90,
        paketName: 'Tryout TKA 2',
        subPaket: 'Paket 1',
        soalList: [
          {
            id: 'tka_mtk1',
            tipe: 'pg',
            pertanyaan: 'Sebuah denah ruang kelas digambar dengan skala 1 : 100. Jika panjang kelas pada denah adalah 8 cm dan lebar 6 cm, maka luas sebenarnya ruang kelas tersebut adalah...',
            opsi: ['A. 48 meter persegi', 'B. 480 meter persegi', 'C. 24 meter persegi', 'D. 14 meter persegi'],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'tka_mtk2',
            tipe: 'pg',
            pertanyaan: 'Sebuah akuarium berbentuk balok dengan panjang 80 cm, lebar 50 cm, dan tinggi 60 cm terisi air 3/4 bagian. Volume air di dalam akuarium tersebut adalah...',
            opsi: ['A. 180 liter', 'B. 240 liter', 'C. 120 liter', 'D. 360 liter'],
            kunciJawaban: '',
            bobot: 0,
          },
        ],
      },
      {
        id: 'tka_ipas_tp631',
        category: 'tka',
        mapel: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        judul: 'Tryout TKA 3 - Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        durasiMenit: 90,
        paketName: 'Tryout TKA 3',
        subPaket: 'Paket 1',
        soalList: [
          {
            id: 'tka_ip1',
            tipe: 'pg',
            pertanyaan: 'Dalam rantai makanan sawah: Padi -> Belalang -> Katak -> Ular -> Elang. Jika populasi katak menurun drastis akibat perburuan liar, dampak langsung yang terjadi pada ekosistem adalah...',
            opsi: [
              'A. Populasi belalang meningkat pesat dan produksi padi terancam rusak',
              'B. Populasi ular bertambah banyak dengan cepat',
              'C. Populasi elang meningkat berlipat ganda',
              'D. Populasi padi menjadi berlimpah ruah tanpa gangguan',
            ],
            kunciJawaban: '',
            bobot: 0,
          },
          {
            id: 'tka_ip2',
            tipe: 'pg',
            pertanyaan: 'Manakah tindakan konservasi energi terbarukan berikut yang paling berdampak langsung mengurangi emisi karbon jangka panjang?',
            opsi: [
              'A. Menggunakan pembangkit listrik tenaga surya (solar panel) mandiri di sekolah',
              'B. Menyalakan lampu halaman saat siang hari',
              'C. Membakar sampah plastik di pekarangan belakang',
              'D. Menggunakan kendaraan bermotor bahan bakar fosil untuk jarak 100 meter',
            ],
            kunciJawaban: '',
            bobot: 0,
          },
        ],
      },
    ];

    const catalogAll: ExamOptionItem[] = [...dynamicTkaExams];
    const activeOnly: ExamOptionItem[] = dynamicTkaExams.filter((d) =>
      isTKAPackageActive(tkaActivePackages, d.paketName, d.mapel)
    );

    sampleTkaDefaults.forEach((sample) => {
      const exists = dynamicTkaExams.some(
        (d) => d.paketName === sample.paketName && d.mapel === sample.mapel
      );
      if (!exists) {
        const customOverride =
          tkaDurations[getTKADurationKey(sample.paketName, sample.mapel)] ||
          tkaDurations[getTKADurationKey(sample.paketName, null)];
        const item = {
          ...sample,
          durasiMenit: customOverride && customOverride > 0 ? customOverride : sample.durasiMenit,
        };
        catalogAll.push(item);
        if (isTKAPackageActive(tkaActivePackages, sample.paketName, sample.mapel)) {
          activeOnly.push(item);
        }
      }
    });

    return { allTkaExamsCatalog: catalogAll, tkaExamList: activeOnly };
  }, [tkaDurations, tkaActivePackages, tkaQuestionsState]);

  // Daftar ujian yang aktif tergantung mode (CBT atau TKA)
  const currentAvailableExams = viewMode === 'tka' ? tkaExamList : cbtExamList;

  // Daftar opsi unik Paket Soal & Mata Pelajaran untuk dropdown
  const availablePaketOptions = useMemo(() => {
    const set = new Set<string>();
    if (viewMode === 'tka') {
      TKA_JENIS_LIST.forEach((j) => set.add(j));
    }
    currentAvailableExams.forEach((e) => set.add(e.paketName));
    return Array.from(set);
  }, [currentAvailableExams, viewMode]);

  const availableMapelOptions = useMemo(() => {
    const set = new Set<string>();
    if (viewMode === 'tka') {
      TKA_MAPEL_LIST.forEach((m) => set.add(m));
    }
    currentAvailableExams
      .filter((e) => !selectedPaketFilter || e.paketName === selectedPaketFilter)
      .forEach((e) => set.add(e.mapel));
    if (set.size === 0) {
      currentAvailableExams.forEach((e) => set.add(e.mapel));
    }
    return Array.from(set);
  }, [currentAvailableExams, selectedPaketFilter, viewMode]);

  // Daftar ujian tersaring sesuai Paket Soal & Mapel yang dipilih siswa
  const filteredExamsForDropdown = useMemo(() => {
    return currentAvailableExams.filter((e) => {
      if (selectedPaketFilter && e.paketName !== selectedPaketFilter) return false;
      if (selectedMapelFilter && e.mapel !== selectedMapelFilter) return false;
      return true;
    });
  }, [currentAvailableExams, selectedPaketFilter, selectedMapelFilter]);

  // Otomatis pilih ujian jika paket & mapel sudah dipilih dan tersedia
  useEffect(() => {
    if (isExamRunning) return;
    if (selectedPaketFilter && selectedMapelFilter) {
      if (filteredExamsForDropdown.length > 0) {
        const stillValid = filteredExamsForDropdown.some((e) => e.id === selectedExamId);
        if (!stillValid) {
          setSelectedExamId(filteredExamsForDropdown[0].id);
        }
      } else {
        setSelectedExamId('');
      }
    } else if (selectedExamId && !filteredExamsForDropdown.some((e) => e.id === selectedExamId)) {
      setSelectedExamId('');
    }
  }, [selectedPaketFilter, selectedMapelFilter, filteredExamsForDropdown, isExamRunning]);

  // Ujian yang sedang dipilih (terkunci saat ujian berlangsung agar sync cloud tidak memutus ujian)
  const currentExam = useMemo(() => {
    return currentAvailableExams.find((e) => e.id === selectedExamId) || null;
  }, [currentAvailableExams, selectedExamId]);

  const activeExamObj = isExamRunning || examResult ? runningExamSnapshot || currentExam : currentExam;

  const activeExamSoalList = useMemo(() => {
    if (isExamRunning && runningSoalList.length > 0) return runningSoalList;
    return activeExamObj?.soalList || [];
  }, [isExamRunning, runningSoalList, activeExamObj]);

  // Sinkronkan timer ujian & nomor soal ke header merah aplikasi saat ujian berlangsung
  useEffect(() => {
    if (!onExamStatusChange) return;
    if (isExamRunning && activeExamObj) {
      onExamStatusChange({
        isRunning: true,
        timeLeft,
        currentQuestion: currentQIndex + 1,
        totalQuestions: activeExamSoalList.length,
      });
    } else {
      onExamStatusChange(null);
    }
  }, [isExamRunning, activeExamObj, timeLeft, currentQIndex, activeExamSoalList.length, onExamStatusChange]);

  useEffect(() => {
    return () => {
      onExamStatusChange?.(null);
    };
  }, [onExamStatusChange]);

  // Evaluasi skor menggunakan unified examEngine (mendukung seluruh 6 tipe soal)
  const gradeQuestionAnswer = (q: CBTQuestion, studentAns: any): { isCorrect: boolean; earnedScore: number } => {
    const qWeight = Number(q.bobot) > 0 ? Number(q.bobot) : 10;
    return evaluateStudentAnswer({ ...q, bobot: qWeight }, studentAns);
  };

  // Simpan referensi state ujian terbaru agar aman saat logout/unmount/beforeunload
  latestExamStateRef.current = {
    studentId: currentStudent?.id || '',
    exam: activeExamObj,
    selectedPaketFilter,
    selectedMapelFilter,
    currentQIndex,
    answers,
    timeLeft,
    runningSoalList: activeExamSoalList,
    isExamRunning,
  };

  // Fungsi memulihkan draft ujian ke posisi soal & jawaban terakhir
  const resumeFromDraft = (draft: StudentExamDraft, examObj: ExamOptionItem) => {
    const restoredList = restoreQuestionsFromSnapshot(examObj.soalList, draft.runningQuestionOrder);
    const safeIndex = Math.min(Math.max(0, draft.currentQIndex || 0), Math.max(0, restoredList.length - 1));
    const safeAnswers = draft.answers || {};
    const safeTimeLeft = draft.timeLeft > 0 ? draft.timeLeft : examObj.durasiMenit * 60;
    const answeredCount = countAnsweredQuestions(safeAnswers);

    const initialStartTs =
      typeof draft.examStartTimestamp === 'number' && draft.examStartTimestamp > 0
        ? draft.examStartTimestamp
        : Date.now() - Math.max(0, ((draft.totalSeconds || examObj.durasiMenit * 60) - safeTimeLeft) * 1000);
    examStartTimestampRef.current = initialStartTs;
    lastCloudCheckpointAtRef.current = Date.now();
    lastCloudCheckpointCountRef.current = answeredCount;

    isSubmittingExamRef.current = false;
    setIsSavingSubmission(false);
    setOfflineQueueNotice(false);
    setTimeUpModal(null);
    setViewMode(examObj.category);
    setSelectedPaketFilter(draft.selectedPaketFilter || examObj.paketName);
    setSelectedMapelFilter(draft.selectedMapelFilter || examObj.mapel);
    setSelectedExamId(examObj.id);
    setRunningExamSnapshot(examObj);
    setRunningSoalList(restoredList);
    setAnswers(safeAnswers);
    setCurrentQIndex(safeIndex);
    setTimeLeft(safeTimeLeft);
    setExamResult(null);
    setIsExamRunning(true);

    saveStudentExamDraft(
      {
        ...draft,
        currentQIndex: safeIndex,
        timeLeft: safeTimeLeft,
        isActiveSession: true,
        examStartTimestamp: initialStartTs,
        runningQuestionOrder: buildQuestionOrderSnapshot(restoredList),
      },
      { immediateSync: false }
    );

    const noticeMsg = `Melanjutkan terakhir dikerjakan: Soal #${safeIndex + 1} (${answeredCount} jawaban tersimpan otomatis dipulihkan).`;
    setResumedNotice(noticeMsg);
    showToast(`Melanjutkan "${examObj.judul}" pada Soal #${safeIndex + 1}!`, 'success');
  };

  // Auto-save jawaban, nomor soal terakhir, & urutan soal setiap kali berubah saat ujian berlangsung
  useEffect(() => {
    if (!isExamRunning || !activeExamObj || !currentStudent?.id) return;
    const soalToSave = activeExamSoalList.length > 0 ? activeExamSoalList : activeExamObj.soalList;
    saveStudentExamDraft(
      {
        studentId: currentStudent.id,
        examId: activeExamObj.id,
        category: activeExamObj.category,
        judul: activeExamObj.judul,
        mapel: activeExamObj.mapel,
        paketName: activeExamObj.paketName,
        selectedPaketFilter,
        selectedMapelFilter,
        currentQIndex,
        answers,
        timeLeft: latestExamStateRef.current.timeLeft || activeExamObj.durasiMenit * 60,
        totalSeconds: activeExamObj.durasiMenit * 60,
        runningQuestionOrder: buildQuestionOrderSnapshot(soalToSave),
        isActiveSession: true,
        examStartTimestamp: examStartTimestampRef.current,
        updatedAt: new Date().toISOString(),
      },
      { immediateSync: false }
    );
  }, [isExamRunning, activeExamObj?.id, currentStudent?.id, currentQIndex, answers, runningSoalList]);

  // Checkpoint Firestore berkala setiap 5 soal terjawab atau setiap 45 detik (anti-hilang 100+ siswa)
  useEffect(() => {
    if (!isExamRunning || !activeExamObj || !currentStudent?.id || isSavingSubmission) return;

    const triggerCheckpoint = () => {
      const snap = latestExamStateRef.current;
      if (!snap.isExamRunning || !snap.exam || !snap.studentId || isSubmittingExamRef.current) return;
      lastCloudCheckpointAtRef.current = Date.now();
      lastCloudCheckpointCountRef.current = countAnsweredQuestions(snap.answers);
      if (snap.exam.category === 'tka') {
        void savePeriodicTkaDraftToFirestore({
          student: {
            id: currentStudent.id,
            nama: currentStudent.nama,
            nisn: currentStudent.nisn,
            kelas: currentStudent.kelas,
            fotoUrl: currentStudent.fotoUrl,
          },
          paketName: snap.exam.paketName,
          questionAnswers: snap.answers,
        });
      } else {
        void savePeriodicCbtDraftToFirestore({
          examId: snap.exam.id,
          studentId: currentStudent.id,
          nisn: currentStudent.nisn,
          studentName: currentStudent.nama,
          kelas: currentStudent.kelas,
          mapel: snap.exam.mapel,
          judul: snap.exam.judul,
          paketName: snap.exam.paketName,
          jawabanSiswa: snap.answers,
          timeLeft: snap.timeLeft,
          examStartTimestamp: examStartTimestampRef.current,
        });
      }
    };

    const answeredNow = countAnsweredQuestions(answers);
    if (
      answeredNow > 0 &&
      answeredNow - lastCloudCheckpointCountRef.current >= 5 &&
      Date.now() - lastCloudCheckpointAtRef.current >= 3000
    ) {
      triggerCheckpoint();
    }

    const interval = setInterval(triggerCheckpoint, 45000);
    return () => clearInterval(interval);
  }, [isExamRunning, activeExamObj?.id, currentStudent?.id, answers, isSavingSubmission]);

  // Auto-save sisa waktu ke localStorage tiap detik
  useEffect(() => {
    if (!isExamRunning || !activeExamObj || !currentStudent?.id || timeLeft <= 0) return;
    const soalToSave = activeExamSoalList.length > 0 ? activeExamSoalList : activeExamObj.soalList;
    saveStudentExamDraft(
      {
        studentId: currentStudent.id,
        examId: activeExamObj.id,
        category: activeExamObj.category,
        judul: activeExamObj.judul,
        mapel: activeExamObj.mapel,
        paketName: activeExamObj.paketName,
        selectedPaketFilter,
        selectedMapelFilter,
        currentQIndex,
        answers,
        timeLeft,
        totalSeconds: activeExamObj.durasiMenit * 60,
        runningQuestionOrder: buildQuestionOrderSnapshot(soalToSave),
        isActiveSession: true,
        examStartTimestamp: examStartTimestampRef.current,
        updatedAt: new Date().toISOString(),
      },
      { immediateSync: false }
    );
  }, [timeLeft]);

  // Flush draft otomatis saat siswa klik Logout / unmount / menutup tab browser
  useEffect(() => {
    const flushActiveDraft = () => {
      const snap = latestExamStateRef.current;
      if (!snap.isExamRunning || !snap.exam || !snap.studentId) return;
      const soalToSave = snap.runningSoalList.length > 0 ? snap.runningSoalList : snap.exam.soalList;
      saveStudentExamDraft(
        {
          studentId: snap.studentId,
          examId: snap.exam.id,
          category: snap.exam.category,
          judul: snap.exam.judul,
          mapel: snap.exam.mapel,
          paketName: snap.exam.paketName,
          selectedPaketFilter: snap.selectedPaketFilter,
          selectedMapelFilter: snap.selectedMapelFilter,
          currentQIndex: snap.currentQIndex,
          answers: snap.answers,
          timeLeft: snap.timeLeft,
          totalSeconds: snap.exam.durasiMenit * 60,
          runningQuestionOrder: buildQuestionOrderSnapshot(soalToSave),
          isActiveSession: true,
          updatedAt: new Date().toISOString(),
        },
        { immediateSync: true }
      );
    };

    window.addEventListener('beforeunload', flushActiveDraft);
    window.addEventListener('pagehide', flushActiveDraft);
    return () => {
      flushActiveDraft();
      window.removeEventListener('beforeunload', flushActiveDraft);
      window.removeEventListener('pagehide', flushActiveDraft);
    };
  }, []);

  // Reset mode resume saat kembali ke home atau menu lain
  useEffect(() => {
    if (viewMode === 'home' || viewMode === 'kebiasaan') {
      autoResumedModeRef.current = '';
    }
  }, [viewMode]);

  // Timer interval saat ujian berlangsung
  useEffect(() => {
    if (!isExamRunning) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isExamRunning]);

  // Saat durasi ujian berakhir, tampilkan modal/toast dan kirim jawaban ke database sebelum sesi ditutup
  useEffect(() => {
    if (isExamRunning && timeLeft <= 0 && !isSubmittingExamRef.current) {
      handleFinishExamRef.current(true);
    }
  }, [isExamRunning, timeLeft]);

  // Handler mulai ujian (mengunci dropdown dan memunculkan soal)
  const handleStartExam = (forceFresh: boolean = false) => {
    if (!currentExam) {
      showToast('Paket soal belum dipilih atau belum diaktifkan oleh guru.', 'error');
      return;
    }
    if (currentExam.soalList.length === 0) {
      showToast('Belum ada butir soal pada paket yang dipilih.', 'error');
      return;
    }

    if (!forceFresh && currentStudent?.id) {
      const existingDraft = getStudentExamDraftById(currentStudent.id, currentExam.id);
      if (existingDraft && existingDraft.timeLeft > 0) {
        resumeFromDraft(existingDraft, currentExam);
        return;
      }
    }

    if (forceFresh && currentStudent?.id) {
      clearStudentExamDraft(currentStudent.id, currentExam.id);
      setDraftRevisionTick((t) => t + 1);
    }
    try {
      localStorage.removeItem('sekolahku_pending_submission_lock_v1');
    } catch {
      // ignore storage lock removal errors
    }

    const acakSoal =
      viewMode === 'tka'
        ? localStorage.getItem('sekolahku_tka_acak_soal') === 'true'
        : localStorage.getItem('sekolahku_cbt_acak_soal') === 'true';
    const acakJawaban =
      viewMode === 'tka'
        ? localStorage.getItem('sekolahku_tka_acak_jawaban') === 'true'
        : localStorage.getItem('sekolahku_cbt_acak_jawaban') === 'true';

    let preparedList = currentExam.soalList.map((q) => stripAnswerKeysFromQuestion(q));
    if (acakSoal) {
      preparedList = [...preparedList].sort(() => Math.random() - 0.5);
    }
    if (acakJawaban) {
      preparedList = preparedList.map((q) => {
        if ((q.tipe === 'pg' || q.tipe === 'pg_kompleks') && q.opsi && q.opsi.length > 0) {
          const indices = q.opsi.map((_, i) => i).sort(() => Math.random() - 0.5);
          const nextOpsi = indices.map((oldIdx) => q.opsi![oldIdx]);
          const newToOldLetter: Record<string, string> = {};
          const nextOpsiGambar: Record<string, string> = {};
          indices.forEach((oldIdx, newIdx) => {
            const oldL = String.fromCharCode(65 + oldIdx);
            const newL = String.fromCharCode(65 + newIdx);
            newToOldLetter[newL] = oldL;
            if (q.opsiGambar?.[oldL]) {
              nextOpsiGambar[newL] = q.opsiGambar[oldL];
            }
          });
          return {
            ...q,
            opsi: nextOpsi,
            optionShuffleMap: newToOldLetter,
            ...(q.opsiGambar ? { opsiGambar: nextOpsiGambar } : {}),
          };
        }
        return q;
      });
    }

    const initialSeconds = currentExam.durasiMenit * 60;
    const startTs = Date.now();
    examStartTimestampRef.current = startTs;
    lastCloudCheckpointAtRef.current = startTs;
    lastCloudCheckpointCountRef.current = 0;
    isSubmittingExamRef.current = false;
    setIsSavingSubmission(false);
    setOfflineQueueNotice(false);
    setTimeUpModal(null);
    setRunningExamSnapshot(currentExam);
    setRunningSoalList(preparedList);
    setTimeLeft(initialSeconds);
    setCurrentQIndex(0);
    setAnswers({});
    setExamResult(null);
    setResumedNotice(null);
    setIsExamRunning(true);

    if (currentStudent?.id) {
      saveStudentExamDraft(
        {
          studentId: currentStudent.id,
          examId: currentExam.id,
          category: currentExam.category,
          judul: currentExam.judul,
          mapel: currentExam.mapel,
          paketName: currentExam.paketName,
          selectedPaketFilter: selectedPaketFilter || currentExam.paketName,
          selectedMapelFilter: selectedMapelFilter || currentExam.mapel,
          currentQIndex: 0,
          answers: {},
          timeLeft: initialSeconds,
          totalSeconds: initialSeconds,
          runningQuestionOrder: buildQuestionOrderSnapshot(preparedList),
          isActiveSession: true,
          examStartTimestamp: startTs,
          updatedAt: new Date().toISOString(),
        },
        { immediateSync: false }
      );

      const alreadyDone = getStoredCBTResults().some(
        (r) =>
          r.examId === currentExam.id &&
          (r.studentId === currentStudent.id ||
            (currentStudent.nisn && r.nisn === currentStudent.nisn))
      );
      if (!alreadyDone) {
        void saveHasilUjianToFirestore({
          nisn: currentStudent.nisn || currentStudent.id,
          id_ujian: currentExam.id,
          studentId: currentStudent.id,
          nama_siswa: currentStudent.nama,
          kelas: currentStudent.kelas,
          category: currentExam.category === 'tka' ? 'tka' : 'cbt',
          mapel: currentExam.mapel,
          paketName: currentExam.paketName,
          judul: currentExam.judul,
          status: 'mengerjakan',
          skor: 0,
          total_soal: preparedList.length,
          no_soal_betul: [],
          no_soal_salah: [],
          jawaban_siswa: {},
        });
      }
    }

    showToast(`Ujian "${currentExam.judul}" dimulai! Jawaban tersimpan otomatis.`, 'success');
  };

  // Handler submit ujian (manual atau auto-submit ketika timer 0)
  const handleFinishExam = async (isAutoSubmit: boolean = false) => {
    const finishedExam = activeExamObj;
    if (!finishedExam || isSubmittingExamRef.current) return;
    isSubmittingExamRef.current = true;
    setIsSavingSubmission(true);
    setOfflineQueueNotice(false);

    const sanitizeAnswerValue = (value: unknown): any => {
      if (value === undefined || value === null) return '';
      if (typeof value === 'boolean' || typeof value === 'number') return value;
      if (Array.isArray(value)) return value.map((item) => sanitizeAnswerValue(item));
      if (typeof value === 'object') {
        const cleanObj: Record<string, any> = {};
        Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
          const cleanK = sanitizeInput(k, 120);
          if (cleanK) cleanObj[cleanK] = sanitizeAnswerValue(v);
        });
        return cleanObj;
      }
      return sanitizeInput(value, 2000);
    };

    const sanitizedAnswers: Record<string, any> = {};
    Object.entries(answers).forEach(([qId, val]) => {
      sanitizedAnswers[qId] = sanitizeAnswerValue(val);
    });

    const rawEvaluatedQuestions = activeExamSoalList.length > 0 ? activeExamSoalList : finishedExam.soalList;
    const answeredCount = countAnsweredQuestions(sanitizedAnswers);

    setSubmittingModalState({
      isOpen: true,
      status: 'submitting',
      attemptCount: 1,
      message: 'Mengamankan & Mengirim Jawaban ke Server...',
    });

    if (isAutoSubmit) {
      setTimeUpModal({
        isOpen: true,
        status: 'submitting',
        examTitle: finishedExam.judul,
        category: finishedExam.category,
        answeredCount,
        totalQuestions: rawEvaluatedQuestions.length,
        score: null,
        cloudSaved: false,
      });
      showToast(
        'Waktu ujian telah berakhir! Jawaban Anda sedang diamankan & dikirim otomatis ke server...',
        'error'
      );
    }

    // Jitter cerdas 1–4 detik untuk mencegah write spike pada ujian serentak berskala besar (>30 peserta)
    const concurrentCheck = detectLargeConcurrentExam({
      students,
      targetClass: finishedExam.kelas || activeClass,
      category: finishedExam.category,
    });
    const jitterMs = computeConcurrentSubmitJitterMs(concurrentCheck.isLargeScale);
    if (jitterMs > 0) {
      await new Promise((res) => setTimeout(res, jitterMs));
    }

    // Ambil kunci jawaban & pembobotan terproteksi secara in-memory sesaat sebelum penilaian
    const protectedKeyDocId =
      finishedExam.category === 'tka'
        ? buildTkaExamDocId(finishedExam.paketName, finishedExam.mapel)
        : finishedExam.id;
    let fetchedKeys = await fetchExamAnswerKeysFromFirestore(protectedKeyDocId);
    if (!fetchedKeys && finishedExam.category === 'tka') {
      fetchedKeys = await fetchExamAnswerKeysFromFirestore(finishedExam.id);
    }
    if (!fetchedKeys) {
      fetchedKeys = resolveBuiltInSampleExamKeys(finishedExam.id);
    }

    const evaluatedQuestions = fetchedKeys
      ? mergeQuestionsWithAnswerKeys(rawEvaluatedQuestions, fetchedKeys)
      : rawEvaluatedQuestions;
    const evaluatedById = new Map(evaluatedQuestions.map((eq) => [eq.id, eq]));

    let earned = 0;
    let max = 0;

    evaluatedQuestions.forEach((q) => {
      const w = Number(q.bobot) > 0 ? Number(q.bobot) : 10;
      max += w;
      const ans = sanitizedAnswers[q.id];
      const evalRes = gradeQuestionAnswer(q, ans);
      earned += evalRes.earnedScore;
    });

    const canonicalList =
      finishedExam.soalList && finishedExam.soalList.length > 0
        ? finishedExam.soalList.map((q) => evaluatedById.get(q.id) || q)
        : evaluatedQuestions;
    const noSoalBetul: number[] = [];
    const noSoalSalah: number[] = [];
    canonicalList.forEach((q, idx) => {
      const evalRes = gradeQuestionAnswer(q, sanitizedAnswers[q.id]);
      if (evalRes.isCorrect) {
        noSoalBetul.push(idx + 1);
      } else {
        noSoalSalah.push(idx + 1);
      }
    });

    const { benarHots, totalHots } = computeExamHotsStats(
      canonicalList,
      sanitizedAnswers,
      (q, ans) => gradeQuestionAnswer(q, ans).isCorrect
    );
    const durasiDetik = Math.max(
      1,
      Math.round((Date.now() - (examStartTimestampRef.current || Date.now())) / 1000)
    );
    const nowIso = new Date().toISOString();

    const rawGrade = max > 0 ? Math.round((earned / max) * 100) : 100;
    const finalGrade = Number.isFinite(rawGrade) ? rawGrade : 0;

    // Rekam ke CBT Results di storage (beserta metadata ujian & HOTS + durasiDetik)
    const activeFilters = getActiveFilters();
    const newResultEntry = {
      examId: finishedExam.id,
      studentId: currentStudent.id,
      studentName: currentStudent.nama,
      nisn: currentStudent.nisn,
      kelas: currentStudent.kelas,
      jenjang: currentStudent.kelas || activeClass || 'Umum',
      skor: Number.isFinite(earned) ? earned : 0,
      nilai: finalGrade,
      waktuSelesai: new Date().toLocaleTimeString(),
      jawabanSiswa: sanitizedAnswers,
      category: finishedExam.category,
      mapel: finishedExam.mapel,
      judul: finishedExam.judul,
      paketName: finishedExam.paketName,
      tanggal: getLocalTodayStr(),
      recordedAt: Date.now(),
      tahunPelajaran: activeFilters.year,
      semester: activeFilters.semester,
      benarHots,
      totalHots,
      durasiDetik,
      statusPengerjaan: 'selesai' as const,
      updatedAt: nowIso,
    };
    const storedRes = getStoredCBTResults();
    storedRes.push(newResultEntry);
    saveStoredCBTResults(storedRes);

    // Rekam status "selesai" ke koleksi Firestore `hasil_ujian/${nisn}_${id_ujian}`
    // agar Strict Access Control SARAH langsung terbuka setelah siswa selesai mengirim ujian.
    setFirestoreSaveStatus('saving');
    void saveHasilUjianToFirestore({
      nisn: currentStudent.nisn || currentStudent.id,
      id_ujian: finishedExam.id,
      studentId: currentStudent.id,
      nama_siswa: currentStudent.nama,
      kelas: currentStudent.kelas,
      category: finishedExam.category === 'tka' ? 'tka' : 'cbt',
      mapel: finishedExam.mapel,
      paketName: finishedExam.paketName,
      judul: finishedExam.judul,
      status: 'selesai',
      skor: finalGrade,
      total_soal: canonicalList.length,
      no_soal_betul: noSoalBetul,
      no_soal_salah: noSoalSalah,
      jawaban_siswa: sanitizedAnswers,
      waktu_selesai: new Date().toLocaleTimeString('id-ID'),
    }).finally(() => {
      setFirestoreSaveStatus('saved');
    });
    window.dispatchEvent(new Event('sekolahku-exam-results-updated'));

    const instantBackup = {
      nisn: currentStudent.nisn || currentStudent.id,
      nama: currentStudent.nama,
      kelas: currentStudent.kelas,
      idUjian: finishedExam.id,
      mapel: finishedExam.mapel,
      paketName: finishedExam.paketName,
      judul: finishedExam.judul,
      category: finishedExam.category,
      skorPerNomor: sanitizedAnswers,
      nilaiAkhir: finalGrade,
      benarHots,
      totalHots,
      durasiDetik,
      recordedAt: Date.now(),
    };
    try {
      localStorage.setItem('sekolahku_pending_submission_lock_v1', JSON.stringify(instantBackup));
    } catch {
      // ignore
    }

    const cbtResultDocId = buildCbtResultDocId(finishedExam.id, currentStudent.nisn || currentStudent.id);
    let success = false;
    let attempt = 0;
    let tkaLockedPracticeOnly = false;
    let tkaLockedScore: number | undefined = undefined;

    while (!success && attempt < 25) {
      attempt++;
      setSubmittingModalState({
        isOpen: true,
        status: attempt > 1 ? 'retry' : 'submitting',
        attemptCount: attempt,
        message:
          attempt > 1
            ? `Koneksi sedang lambat (Wait Response). Jawaban Anda aman, sistem sedang mengirim ulang otomatis... (Percobaan ke-${attempt}). Mohon jangan tutup halaman ini.`
            : 'Mengamankan & Mengirim Jawaban ke Server...',
      });

      try {
        if (finishedExam.category === 'tka') {
          const normMapelKey = normalizeTkaMapelKey(finishedExam.mapel);
          const durationUsed = Math.max(1, Math.ceil(durasiDetik / 60));
          const tkaPromise = upsertTkaSubmissionAsync({
            student: currentStudent,
            paketName: finishedExam.paketName,
            mapelScores: { [normMapelKey]: finalGrade },
            completedMapelKeys: [normMapelKey],
            questionAnswers: sanitizedAnswers,
            durasiMenitUsed: durationUsed,
            durasiDetik,
            benarHots,
            totalHots,
            jenjang: currentStudent.kelas || 'Kelas 6',
            tahunPelajaran: activeFilters.year,
            semester: activeFilters.semester,
          });
          const tkaRes = await Promise.race([
            tkaPromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
          ]);
          if (tkaRes && (tkaRes as any).cloudSaved) {
            success = true;
            tkaLockedPracticeOnly = Boolean((tkaRes as any).lockedPracticeOnly);
            if (typeof (tkaRes as any).lockedScore === 'number') {
              tkaLockedScore = (tkaRes as any).lockedScore;
            }
          }
        } else {
          await saveCbtResultToFirestore(newResultEntry);
          const snap = await Promise.race([
            getDoc(doc(db, CBT_RESULTS_COLLECTION, cbtResultDocId)),
            new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 8000)),
          ]) as any;
          if (snap && snap.exists()) {
            success = true;
          }
        }
      } catch (err) {
        console.warn(`Submission attempt ${attempt} warning:`, err);
      }

      if (!success) {
        await new Promise((res) => setTimeout(res, 4000));
      }
    }

    if (success) {
      try {
        localStorage.removeItem('sekolahku_pending_submission_lock_v1');
      } catch {}
    }

    setSubmittingModalState({
      isOpen: true,
      status: 'success',
      attemptCount: attempt,
      message: tkaLockedPracticeOnly
        ? `Latihan selesai! Skor latihan: ${finalGrade}. Nilai resmi TKA Anda (${tkaLockedScore ?? finalGrade}) tetap aman terkunci.`
        : 'BERHASIL! Nilai Anda sudah masuk ke sistem Guru & Admin.',
    });
    setIsSavingSubmission(false);

    // Sinkronisasi ke asesmen siswa secara otomatis & langsung kirim ke Firestore sebelum sesi ditutup
    // (Dilewati jika TKA berstatus latihan murni karena nilai resmi sudah terkunci 1x)
    let assessKeyWritten = '';
    let assessPayloadWritten: Record<string, any> | null = null;
    if (!tkaLockedPracticeOnly) try {
      const filters = getActiveFilters();
      const targetClass = currentStudent?.kelas || activeClass;
      const normMapel = finishedExam.mapel.toLowerCase();
      const matchedSubject = subjects.find((s) => {
        const sn = (s.name || '').toLowerCase();
        const sc = (s.code || '').toUpperCase();
        return (
          sn === normMapel ||
          sn.includes(normMapel) ||
          normMapel.includes(sn) ||
          ((normMapel.includes('koding') || normMapel.includes('kka')) &&
            (sc.startsWith('KKA') || sn.includes('koding') || sn.includes('kka')))
        );
      });
      const subjectMap: Record<string, string> = {
        'Pendidikan Agama Islam': 's_pabp_islam',
        'Pendidikan Pancasila': 's_pancasila',
        'Bahasa Indonesia': 's_bindonesia',
        'Matematika': 's_matematika',
        'Ilmu Pengetahuan Alam dan Sosial (IPAS)': 's_ipas',
        'Seni Rupa': 's_senirupa',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)': 's_pjok',
        'Bahasa Inggris': 's_binggris',
        'Muatan Lokal (PLBJ)': 's_plbj',
        'Koding dan Kecerdasan Artifisial (KKA)': 's_k6_kka',
      };
      const subId = matchedSubject?.id || subjectMap[finishedExam.mapel] || 's_bindonesia';
      const assessKey = `${filters.year}_${filters.semester}_${targetClass}_${subId}`;
      const existing = getStoredAssessments(assessKey);

      if (!existing[currentStudent.id]) {
        existing[currentStudent.id] = { sumatif: {}, remedial: {}, asts: 0, asas: 0 };
      }

      const isRemedial = finishedExam.paketName.toLowerCase().includes('remedial');
      if (finishedExam.paketName.toUpperCase().includes('ASTS')) {
        existing[currentStudent.id].asts = finalGrade;
      } else if (finishedExam.paketName.toUpperCase().includes('ASAS')) {
        existing[currentStudent.id].asas = finalGrade;
      } else {
        const asMatch = finishedExam.paketName.match(/(?:Sumatif|Remedial|AS|UH)\s*(?:Inklusi\s*)?(\d+)/i);
        if (asMatch) {
          const idx = parseInt(asMatch[1]);
          if (isRemedial) {
            existing[currentStudent.id].remedial[idx] = finalGrade;
          } else {
            existing[currentStudent.id].sumatif[idx] = finalGrade;
          }
        }
      }
      saveStoredAssessments(assessKey, existing);
      assessKeyWritten = assessKey;
      assessPayloadWritten = existing;
    } catch (e) {
      console.warn('Sync assessment error:', e);
    }

    // Kirim ke database Firestore (koleksi assessments + snapshot cloud penuh)
    let cloudSaved = success;
    try {
      const dbTasks: Promise<any>[] = [];
      if (assessKeyWritten && assessPayloadWritten) {
        dbTasks.push(
          setDoc(
            doc(db, 'assessments', assessKeyWritten.replace(/\//g, '_')),
            {
              assessKey: assessKeyWritten,
              data: assessPayloadWritten,
              updatedAt: new Date().toISOString(),
              updatedBy: currentStudent.nama || 'siswa',
              serverTime: serverTimestamp(),
            },
            { merge: true }
          )
        );
      }
      if (dbTasks.length > 0) {
        await Promise.race([
          Promise.allSettled(dbTasks),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
      }
      // Jalankan backup global ringan di latar belakang agar tidak memperlambat UI siswa
      syncAllLocalToCloud(currentStudent.nama || 'siswa').catch(() => {});
      if (finishedExam.category === 'tka') {
        reconcileAndSyncLocalTkaSubmissions(students).catch(() => {});
      }
    } catch (dbErr) {
      console.warn('Immediate database flush warning:', dbErr);
    }

    // Bersihkan draft & tutup sesi ujian aktif setelah pengiriman ke database selesai
    if (currentStudent?.id) {
      clearStudentExamDraft(currentStudent.id, finishedExam.id);
      setDraftRevisionTick((t) => t + 1);
    }

    setOfflineQueueNotice(!cloudSaved);
    setRunningExamSnapshot(finishedExam);
    setExamResult({
      score: finalGrade,
      maxScore: 100,
      durasiDetik,
      benarHots,
      totalHots,
      lockedPracticeOnly: tkaLockedPracticeOnly,
      lockedScore: tkaLockedScore,
    });
    setIsExamRunning(false);
    setResumedNotice(null);
    setIsSavingSubmission(false);
    isSubmittingExamRef.current = false;

    if (!cloudSaved && !isAutoSubmit) {
      showToast(
        'Koneksi internet terganggu! Jawaban tersimpan aman di perangkat & akan otomatis terkirim saat online.',
        'error'
      );
    }

    if (isAutoSubmit) {
      setTimeUpModal((prev) =>
        prev
          ? {
              ...prev,
              status: 'done',
              score: finalGrade,
              cloudSaved,
            }
          : null
      );
      showToast(
        tkaLockedPracticeOnly
          ? `Latihan Selesai! Skor percobaan latihan Anda: ${finalGrade}. Nilai resmi pertama (${tkaLockedScore ?? finalGrade}) tetap terkunci.`
          : cloudSaved
          ? `Waktu ujian habis! Jawaban otomatis terkirim ke database. Nilai Anda: ${finalGrade}`
          : `Waktu ujian habis! Jawaban tersimpan & masuk antrean sinkronisasi database. Nilai Anda: ${finalGrade}`,
        'success'
      );
    } else if (finishedExam.category === 'tka') {
      showToast(
        tkaLockedPracticeOnly
          ? `Latihan Selesai! Skor latihan: ${finalGrade}. Nilai resmi TKA (${tkaLockedScore ?? finalGrade}) tetap terkunci di sistem Guru.`
          : cloudSaved
          ? `Selamat! Ujian TKA selesai & nilai (${finalGrade}) berhasil terkirim ke Admin!`
          : `Ujian TKA selesai (Nilai: ${finalGrade}). Nilai tersimpan di perangkat & masuk antrean sinkronisasi ke Admin.`,
        'success'
      );
    } else {
      showToast(
        `Selamat! Ujian telah selesai dikerjakan. Nilai Akhir: ${finalGrade}`,
        'success'
      );
    }
  };
  handleFinishExamRef.current = handleFinishExam;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const pendingHomeDraft = useMemo(() => {
    void draftRevisionTick;
    if (!currentStudent?.id) return null;
    const draft = getLastActiveStudentExamDraft(currentStudent.id);
    if (!draft || draft.timeLeft <= 0) return null;
    if (isExcludedFromTka && draft.category === 'tka') return null;
    const catalog = draft.category === 'tka' ? tkaExamList : cbtExamList;
    const matchedExam = catalog.find((e) => e.id === draft.examId);
    if (!matchedExam || matchedExam.soalList.length === 0) return null;
    return { draft, exam: matchedExam };
  }, [currentStudent?.id, cbtExamList, tkaExamList, draftRevisionTick, viewMode, isExcludedFromTka]);

  // =========================================================================
  // VIEW 1: DASHBOARD CARDS UTAMA SISWA (4 MENU KARTU GRID)
  // =========================================================================
  if (viewMode === 'home') {
    return (
      <section className="space-y-6">
        {/* Hero Greeting Siswa */}
        <div className="no-print bg-gradient-to-r from-rose-600 via-rose-700 to-amber-600 p-6 sm:p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
              <img
                src={currentStudent.fotoUrl}
                alt={currentStudent.nama}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl object-cover bg-white p-1 border-3 border-yellow-300 shadow-xl shrink-0"
              />
              <div>
                <span className="inline-block bg-yellow-300 text-slate-900 text-xs font-black px-3.5 py-1 rounded-full uppercase tracking-wider mb-2">
                  Portal Pembelajaran Digital Siswa
                </span>
                <h1 className="text-2xl sm:text-3xl font-display font-black leading-tight">
                  Halo, {currentStudent.nama}!
                </h1>
                <p className="text-rose-100 text-xs sm:text-sm mt-1">
                  {currentStudent.kelas} • NISN: {currentStudent.nisn} • No. Barcode: {currentStudent.barcodeId}
                </p>
                <p className="text-yellow-200 text-xs font-semibold mt-1">
                  {profile.name} • Kurikulum Merdeka • TA {activeYear} ({activeSemester})
                </p>
              </div>
            </div>

            <div className="bg-white/15 backdrop-blur-md p-4 rounded-3xl border border-white/20 text-center sm:text-right shrink-0">
              <span className="text-[11px] font-extrabold uppercase text-yellow-200 block">Status Siswa</span>
              <span className="text-base font-black text-white block mt-0.5">
                {currentStudent.kebutuhanKhusus && currentStudent.kebutuhanKhusus !== 'Tidak Ada (Reguler)'
                  ? `Inklusi (${currentStudent.kebutuhanKhusus})`
                  : 'Siswa Reguler Aktif'}
              </span>
              <span className="text-[10px] text-rose-100 block mt-1">
                {isExcludedFromTka
                  ? 'Akses Ujian CBT & Laporan Rapor (Tidak Masuk TKA)'
                  : 'Akses Ujian CBT, TKA & Laporan Rapor'}
              </span>
            </div>
          </div>
        </div>

        {/* Banner Lanjutkan Ujian Terakhir (Muncul jika siswa sempat logout/keluar saat mengerjakan soal) */}
        {pendingHomeDraft && (
          <div className="no-print p-5 rounded-3xl bg-gradient-to-r from-amber-50 via-white to-emerald-50 border-2 border-amber-300 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Save className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-300">
                    Jawaban Tersimpan Otomatis
                  </span>
                  <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                    {pendingHomeDraft.exam.category === 'tka' ? 'Ujian TKA' : 'Ujian CBT'}
                  </span>
                </div>
                <h3 className="font-display font-black text-base text-slate-800 mt-1">
                  Lanjutkan Terakhir Dikerjakan: {pendingHomeDraft.exam.judul}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Posisi terakhir: <strong className="text-rose-700">Soal #{pendingHomeDraft.draft.currentQIndex + 1}</strong> dari {pendingHomeDraft.exam.soalList.length} soal •{' '}
                  <strong className="text-emerald-700">{countAnsweredQuestions(pendingHomeDraft.draft.answers)} jawaban tersimpan</strong> • Sisa waktu:{' '}
                  <strong className="font-mono text-slate-800">{formatTimer(pendingHomeDraft.draft.timeLeft)}</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  clearStudentExamDraft(currentStudent.id, pendingHomeDraft.exam.id);
                  setDraftRevisionTick((t) => t + 1);
                  showToast('Draft pengerjaan ujian dihapus.', 'success');
                }}
                className="px-3.5 py-2.5 rounded-2xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 font-display font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Draft</span>
              </button>
              <button
                type="button"
                onClick={() => resumeFromDraft(pendingHomeDraft.draft, pendingHomeDraft.exam)}
                className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs shadow-md shadow-emerald-600/20 flex items-center gap-2 transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Lanjutkan Soal #{pendingHomeDraft.draft.currentQIndex + 1}</span>
              </button>
            </div>
          </div>
        )}

        {/* MENU UTAMA BERANDA SISWA (MINIMALIS & DI ATAS STATISTIK PERFORMA) */}
        <div className="no-print space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-display font-black text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-rose-600" /> Menu Utama Siswa
            </h2>
            <span className="text-[11px] font-semibold text-slate-500">
              Pilih layanan belajar &amp; asesmen
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* 1. Ujian CBT */}
            <button
              type="button"
              onClick={() => {
                setViewMode('cbt');
                setSelectedExamId('');
                setIsExamRunning(false);
                onExamActiveChange?.(false);
                onExamStatusChange?.(null);
                setSubmittingModalState((prev) => ({ ...prev, isOpen: false }));
                setExamResult(null);
              }}
              className="group bg-white p-4 rounded-2xl border border-slate-200 hover:border-rose-300 shadow-2xs hover:shadow-sm transition text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white flex items-center justify-center transition shrink-0">
                  <Laptop className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-black text-sm text-slate-900 group-hover:text-rose-600 transition truncate">
                    Ujian CBT
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Sumatif harian, ASTS &amp; ASAS
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition shrink-0" />
            </button>

            {/* 2. TKA (disembunyikan jika ABK tidak masuk TKA) */}
            {!isExcludedFromTka && (
              <button
                type="button"
                onClick={() => {
                  setViewMode('tka');
                  setSelectedExamId('');
                  setIsExamRunning(false);
                  onExamActiveChange?.(false);
                  onExamStatusChange?.(null);
                  setSubmittingModalState((prev) => ({ ...prev, isOpen: false }));
                  setExamResult(null);
                }}
                className="group bg-white p-4 rounded-2xl border border-slate-200 hover:border-purple-300 shadow-2xs hover:shadow-sm transition text-left flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white flex items-center justify-center transition shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-black text-sm text-slate-900 group-hover:text-purple-600 transition truncate">
                      Ujian &amp; Simulasi TKA
                    </h3>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      Tes Kemampuan Akademik
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition shrink-0" />
              </button>
            )}

            {/* 3. Hasil e-Rapor */}
            <button
              type="button"
              onClick={() => onNavigateTab('rapor')}
              className="group bg-white p-4 rounded-2xl border border-slate-200 hover:border-amber-300 shadow-2xs hover:shadow-sm transition text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white flex items-center justify-center transition shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-black text-sm text-slate-900 group-hover:text-amber-600 transition truncate">
                    Hasil e-Rapor
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Rekap nilai &amp; cetak rapor
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition shrink-0" />
            </button>

            {/* 4. Laporan 7 Kebiasaan */}
            <button
              type="button"
              onClick={() => setViewMode('kebiasaan')}
              className="group bg-white p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 shadow-2xs hover:shadow-sm transition text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center transition shrink-0">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-black text-sm text-slate-900 group-hover:text-emerald-600 transition truncate">
                    Laporan 7 Kebiasaan
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Isi kebiasaan harian siswa
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition shrink-0" />
            </button>

            {/* 5. Perpustakaan Digital */}
            <button
              type="button"
              onClick={() => onNavigateTab('perpustakaan')}
              className="group bg-white p-4 rounded-2xl border border-slate-200 hover:border-sky-300 shadow-2xs hover:shadow-sm transition text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white flex items-center justify-center transition shrink-0">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-black text-sm text-slate-900 group-hover:text-sky-600 transition truncate">
                    Perpustakaan Digital
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Buku bacaan &amp; kartu pinjam
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-sky-600 group-hover:translate-x-0.5 transition shrink-0" />
            </button>

            {/* 6. Bank Media Ajar (PPT) */}
            <button
              type="button"
              onClick={() => onNavigateTab('media-ajar')}
              className="group bg-white p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 shadow-2xs hover:shadow-sm transition text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition shrink-0">
                  <Presentation className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-black text-sm text-slate-900 group-hover:text-indigo-600 transition truncate">
                    Bank Media Ajar (PPT)
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Slide materi sesuai kelasmu
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition shrink-0" />
            </button>

            {/* 7. Tanya SARAH (Tutor Sokratik) */}
            {!isExamRunning && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('serbu21-open-tanya-sarah'))}
                className="group bg-gradient-to-r from-rose-50 to-indigo-50 p-4 rounded-2xl border border-rose-200 hover:border-rose-400 shadow-2xs hover:shadow-sm transition text-left flex items-center justify-between gap-3 cursor-pointer sm:col-span-2 lg:col-span-3"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-600 to-indigo-600 text-white flex items-center justify-center transition shrink-0 shadow-xs">
                    <MessageCircleHeart className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-black text-sm text-rose-900 group-hover:text-rose-700 transition truncate">
                      Tanya SARAH (Asisten Belajar Sokratik)
                    </h3>
                    <p className="text-xs text-slate-600 truncate mt-0.5">
                      Bimbingan belajar langkah demi langkah sesuai materi kelasmu &amp; 7 Kebiasaan Anak Indonesia Hebat
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-rose-500 group-hover:translate-x-0.5 transition shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Statistik Performa Rekap Nilai Ujian CBT & TKA */}
        <StudentPerformanceStats
          student={currentStudent}
          cbtExams={allCbtExamsCatalog}
          tkaExams={allTkaExamsCatalog}
          profile={profile}
          activeYear={activeYear}
          activeSemester={activeSemester}
          showToast={showToast}
          onStartCbt={() => {
            setViewMode('cbt');
            setSelectedExamId('');
            setIsExamRunning(false);
            onExamActiveChange?.(false);
            onExamStatusChange?.(null);
            setSubmittingModalState((prev) => ({ ...prev, isOpen: false }));
            setExamResult(null);
          }}
          onStartTka={() => {
            setViewMode('tka');
            setSelectedExamId('');
            setIsExamRunning(false);
            onExamActiveChange?.(false);
            onExamStatusChange?.(null);
            setSubmittingModalState((prev) => ({ ...prev, isOpen: false }));
            setExamResult(null);
          }}
        />
      </section>
    );
  }

  // =========================================================================
  // VIEW: FORM INPUT DATA LAPORAN 7 KEBIASAAN SISWA
  // =========================================================================
  if (viewMode === 'kebiasaan') {
    const currentCompletedCount = Object.values(kebiasaanStatus).filter(Boolean).length;
    const completionPercentage = Math.round((currentCompletedCount / 7) * 100);

    return (
      <section className="space-y-6">
        {/* Top Breadcrumb & Tombol Kembali */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('home')}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center gap-2 text-xs font-black"
              title="Kembali ke Beranda Siswa"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Beranda</span>
            </button>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider block">
                Formulir Pembiasaan Mandiri
              </span>
              <h2 className="text-base font-display font-black text-slate-800">
                Laporan 7 Kebiasaan Anak Sholeh / Karakter Pelajar Pancasila
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Tersambung ke Firestore (laporan_kebiasaan)
            </span>
          </div>
        </div>

        {/* Hero Banner Form */}
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 p-6 md:p-8 text-white shadow-lg">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase bg-white/20 backdrop-blur-md text-amber-100 border border-white/30">
                <HeartHandshake className="w-3.5 h-3.5" /> Pembiasaan Karakter Positif Harian
              </span>
              <h1 className="text-2xl md:text-3xl font-display font-black tracking-tight text-white drop-shadow-xs">
                Ayo Laporkan 7 Kebiasaan Baikmu Hari Ini!
              </h1>
              <p className="text-xs md:text-sm text-amber-100/90 leading-relaxed font-medium">
                Setiap kebiasaan baik yang kamu jalankan membentuk akhlak mulia dan kedisiplinan.
                Laporan ini akan langsung tersimpan secara real-time ke akun Guru dan Kepala Sekolah.
              </p>
            </div>

            <div className="bg-white/15 backdrop-blur-md p-4 rounded-3xl border border-white/25 text-center shrink-0 min-w-[200px]">
              <span className="text-[11px] font-extrabold uppercase text-amber-200 block">Kepatuhan Hari Ini</span>
              <div className="flex items-baseline justify-center gap-1 mt-1">
                <span className="text-3xl font-black text-white">{currentCompletedCount}</span>
                <span className="text-base font-bold text-amber-200">/ 7</span>
              </div>
              <div className="w-full bg-white/20 h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-yellow-300 h-full rounded-full transition-all duration-500"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <span className="text-[10px] text-amber-100 block mt-1 font-semibold">
                {currentCompletedCount === 7
                  ? '🌟 Sempurna! Kamu Hebat!'
                  : `${completionPercentage}% Terpenuhi`}
              </span>
            </div>
          </div>
        </div>

        {/* FORMULIR UTAMA */}
        <form onSubmit={handleSubmitKebiasaan} className="space-y-6">
          {/* Card 1: Data Identitas Pelapor */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <User className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-display font-black text-slate-800">
                  Data Identitas Peserta Didik
                </h3>
                <p className="text-[11px] text-slate-500">
                  Pastikan nama, rombel kelas, dan tanggal pelaporan sudah sesuai.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Nama Siswa (Dropdown/Text) */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Nama Siswa <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={kebiasaanFormNama}
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      setKebiasaanFormNama(selectedVal);
                      const matched = students.find((s) => s.nama === selectedVal);
                      if (matched && matched.kelas) {
                        setKebiasaanFormKelas(matched.kelas);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none text-xs font-bold text-slate-800 transition cursor-pointer"
                  >
                    <option value="">-- Pilih Nama Siswa --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.nama}>
                        {s.nama} ({s.kelas} - NISN: {s.nisn})
                      </option>
                    ))}
                  </select>
                </div>
                {/* Fallback input text jika ingin ketik manual */}
                <input
                  type="text"
                  value={kebiasaanFormNama}
                  onChange={(e) => setKebiasaanFormNama(e.target.value)}
                  placeholder="Atau ketik nama lengkap di sini jika berbeda"
                  className="w-full mt-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 outline-none focus:border-amber-500"
                />
              </div>

              {/* Kelas (Dropdown) */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Rombel / Kelas <span className="text-rose-500">*</span>
                </label>
                <select
                  value={kebiasaanFormKelas}
                  onChange={(e) => setKebiasaanFormKelas(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none text-xs font-bold text-slate-800 transition cursor-pointer"
                >
                  {CLASSES_LIST.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Kelas tempat siswa terdaftar</p>
              </div>

              {/* Tanggal (Input Date) */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Tanggal Pelaporan <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={kebiasaanFormTanggal}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      kebiasaanDirtyRef.current = false;
                      setHasKebiasaanUnsavedChanges(false);
                      const saved = studentPastReports.find((r) => r.tanggal === nextDate);
                      const resetStatus: Record<string, boolean> = {};
                      const resetIndicators: Record<string, string[]> = {};
                      TUJUH_KEBIASAAN_LIST.forEach((h) => {
                        const savedInd = saved?.indikatorTerpilih?.[h.id];
                        const indArr = Array.isArray(savedInd) ? savedInd : [];
                        resetIndicators[h.id] = indArr;
                        resetStatus[h.id] = Boolean(saved?.kebiasaan?.[h.id]) || indArr.length > 0;
                      });
                      setKebiasaanStatus(resetStatus);
                      setKebiasaanSelectedIndicators(resetIndicators);
                      setKebiasaanFormTanggal(nextDate);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none text-xs font-bold text-slate-800 transition cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Format: YYYY-MM-DD</p>
              </div>
            </div>
          </div>

          {/* Card 2: Checklist 7 Kebiasaan */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-display font-black text-slate-800">
                    Checklist &amp; Status 7 Kebiasaan
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Pilih status &quot;Sudah Dilakukan&quot; atau &quot;Belum&quot; serta tulis rincian singkat pada setiap kebiasaan.
                  </p>
                </div>
              </div>

              {/* Quick actions: Centang Semua / Reset */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleMarkAllKebiasaan(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs transition border border-emerald-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Tandai Semua Sudah (7/7)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkAllKebiasaan(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* List 7 Kebiasaan + Indikator Kegiatan */}
            <div className="space-y-4">
              {TUJUH_KEBIASAAN_LIST.map((item) => {
                const isChecked = Boolean(kebiasaanStatus[item.id]);
                const selectedList = kebiasaanSelectedIndicators[item.id] || [];
                const allIndicatorTitles = item.indikator.map((ind) => ind.title);
                const isAllSelected =
                  allIndicatorTitles.length > 0 &&
                  allIndicatorTitles.every((t) => selectedList.includes(t));

                return (
                  <div
                    key={item.id}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 ${
                      isChecked
                        ? 'bg-emerald-50/50 border-emerald-300 shadow-2xs'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Icon, Number, Title & Description */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className="text-2xl shrink-0 p-2 rounded-xl bg-white shadow-2xs border border-slate-100">
                          {item.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-900 text-white font-black text-[11px] flex items-center justify-center shrink-0">
                              {item.nomor}
                            </span>
                            <h4 className="font-display font-black text-sm text-slate-800">
                              {item.label}
                            </h4>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                                selectedList.length > 0
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-white text-slate-500 border-slate-200'
                              }`}
                            >
                              {selectedList.length}/{item.indikator.length} Indikator
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            {item.deskripsi}
                          </p>
                        </div>
                      </div>

                      {/* Right: Button Toggle Status */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            kebiasaanDirtyRef.current = true;
                            setHasKebiasaanUnsavedChanges(true);
                            setKebiasaanStatus((prev) => ({
                              ...prev,
                              [item.id]: !prev[item.id],
                            }));
                          }}
                          className={`px-4 py-2 rounded-2xl font-display font-black text-xs transition flex items-center gap-2 cursor-pointer ${
                            isChecked
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                              : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                          }`}
                        >
                          {isChecked ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Sudah Dilakukan (+1)</span>
                            </>
                          ) : (
                            <>
                              <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-400 block" />
                              <span>Belum Dilakukan (0)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Indikator Pemilihan Kegiatan (4 butir per kebiasaan) */}
                    <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
                          Pilih Indikator Kegiatan yang Dilaksanakan:
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectAllIndicatorsForHabit(item.id, allIndicatorTitles)
                          }
                          className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                        >
                          {isAllSelected ? 'Batal Pilih Semua' : 'Pilih Semua (4 Indikator)'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {item.indikator.map((ind) => {
                          const isIndSelected = selectedList.includes(ind.title);
                          return (
                            <label
                              key={ind.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                                isIndSelected
                                  ? 'bg-white border-emerald-400 ring-1 ring-emerald-300 shadow-2xs'
                                  : 'bg-white/80 border-slate-200 hover:border-emerald-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isIndSelected}
                                onChange={() => handleToggleIndikator(item.id, ind.title)}
                                className="w-4 h-4 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                              />
                              <div className="min-w-0">
                                <span
                                  className={`block text-xs font-extrabold leading-snug ${
                                    isIndSelected ? 'text-emerald-950' : 'text-slate-800'
                                  }`}
                                >
                                  {ind.title}
                                </span>
                                <span className="block text-[11px] text-slate-500 leading-relaxed mt-0.5">
                                  {ind.detail}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Catatan / Keterangan Tambahan untuk kebiasaan ini */}
                    <div className="mt-2.5">
                      <input
                        type="text"
                        value={kebiasaanNotes[item.id] || ''}
                        onChange={(e) =>
                          setKebiasaanNotes((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder={item.placeholder}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:border-emerald-500 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 3: Refleksi Diri / Catatan Tambahan Siswa */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-display font-black text-slate-800">
                  Catatan Refleksi &amp; Pesan untuk Guru (Opsional)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Tuliskan pengalaman menyenangkan atau hal positif yang kamu rasakan saat menjalankan pembiasaan hari ini.
                </p>
              </div>
            </div>

            <textarea
              rows={3}
              value={kebiasaanCatatanSiswa}
              onChange={(e) => setKebiasaanCatatanSiswa(e.target.value)}
              placeholder="Contoh: Hari ini saya senang sekali bisa bangun jam 5 pagi dan membantu ibu menyiram tanaman sebelum berangkat ke sekolah..."
              className="w-full p-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none text-xs text-slate-800 transition"
            />
          </div>

          {/* Action Button: Kirim Laporan ke Firestore */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <ThumbsUp className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Ringkasan Kesiapan Laporan
                </span>
                <span className="text-sm font-black text-slate-800">
                  {currentCompletedCount} dari 7 Kebiasaan Terpenuhi (Skor: {currentCompletedCount}/7)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('home')}
                className="px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-black text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmittingKebiasaan}
                className="px-7 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-display font-black text-xs shadow-md shadow-amber-500/25 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmittingKebiasaan ? 'Menyimpan ke Firestore...' : 'Kirim Laporan 7 Kebiasaan'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* RIWAYAT LAPORAN SEBELUMNYA SISWA */}
        {studentPastReports.length > 0 && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-600" />
                <h3 className="text-sm font-display font-black text-slate-800">
                  Riwayat Laporan 7 Kebiasaan Kamu
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {studentPastReports.length} Laporan Terakhir
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {studentPastReports.slice(0, 6).map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white transition space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {item.tanggal}
                    </span>
                    <span
                      className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                        item.skor === 7
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                          : 'bg-amber-100 text-amber-700 border border-amber-300'
                      }`}
                    >
                      Skor {item.skor}/7
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-2">
                    {item.catatanSiswa || 'Laporan pembiasaan diri harian peserta didik.'}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" /> Dikirim pukul {item.waktuKirim}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODAL SUKSES PENGIRIMAN */}
        {kebiasaanSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border-2 border-emerald-400 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Tersimpan di Firestore (laporan_kebiasaan)
                </span>
                <h3 className="text-xl font-display font-black text-slate-800 mt-2">
                  Laporan Berhasil Terkirim!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Terima kasih, <strong className="text-slate-700">{kebiasaanFormNama}</strong> ({kebiasaanFormKelas}).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                🎉 Skor Kepatuhan: {currentCompletedCount} dari 7 Kebiasaan Terlaksana dengan Baik!
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Guru wali kelas dan kepala sekolah dapat langsung memantau laporanmu secara real-time di Dasbor Administrator.
              </p>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setKebiasaanSuccessModal(false)}
                  className="px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs transition cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKebiasaanSuccessModal(false);
                    setViewMode('home');
                  }}
                  className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition cursor-pointer"
                >
                  Kembali ke Beranda
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  // =========================================================================
  // VIEW 2 & 3: ALUR MENU UJIAN (KHUSUS CBT & TKA)
  // Sesuai Tahapan:
  // A. Panel Pemilihan Ujian (Dropdown Tunggal)
  // B. Panel Detail & Menu Waktu (Muncul setelah memilih)
  // C. Antarmuka Saat Ujian Berlangsung (Sticky Header Timer, Soal, Auto Submit)
  // =========================================================================
  if (viewMode === 'tka' && isExcludedFromTka) {
    return (
      <section className="space-y-6">
        <div className="bg-white p-8 rounded-3xl border-2 border-amber-200 shadow-sm text-center max-w-2xl mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <span className="inline-block text-[11px] font-black uppercase px-3 py-1 rounded-full bg-amber-100 text-amber-800">
            Status Kepesertaan TKA: Tidak Masuk TKA
          </span>
          <h2 className="text-xl font-display font-black text-slate-800">
            Modul TKA Tidak Aktif untuk Akun Anda
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Berdasarkan pengaturan kepesertaan TKA siswa berkebutuhan khusus oleh admin/guru, akun Anda diatur tidak mengikuti Tes Kemampuan Akademik (TKA) dan tetap dapat mengikuti Ujian CBT serta fitur rapor lainnya.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setViewMode('home');
                setSelectedExamId('');
                setIsExamRunning(false);
              }}
              className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs inline-flex items-center gap-2 transition cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Kembali ke Beranda Siswa
            </button>
          </div>
        </div>
      </section>
    );
  }

  const themeColor = viewMode === 'tka' ? 'purple' : 'rose';

  return (
    <section className="space-y-6">
      {/* Top Breadcrumb & Tombol Kembali */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          {!isExamRunning && (
            <button
              type="button"
              onClick={() => {
                setViewMode('home');
                setSelectedExamId('');
                setIsExamRunning(false);
              }}
              className="p-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              title="Kembali ke Halaman Beranda Kartu Siswa"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
              viewMode === 'tka' ? 'bg-purple-100 text-purple-900' : 'bg-rose-100 text-rose-900'
            }`}>
              {viewMode === 'tka' ? 'Modul TKA (Tes Kemampuan Akademik)' : 'Modul CBT (Computer Based Test)'}
            </span>
            <h2 className="text-base sm:text-lg font-display font-black text-slate-800">
              {isExamRunning
                ? viewMode === 'tka'
                  ? 'Ujian TKA Sedang Berlangsung'
                  : 'Ujian CBT Sedang Berlangsung'
                : viewMode === 'tka'
                ? 'Persiapan Ujian TKA Siswa'
                : 'Persiapan Ujian CBT Siswa'}
            </h2>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-bold text-slate-500 block">Siswa Peserta:</span>
          <span className="text-xs font-display font-black text-slate-800 block">
            {currentStudent.nama} ({currentStudent.kelas})
          </span>
        </div>
      </div>

      {/* TAHAP A: SAAT BELUM MULAI -> MENU PILIHAN JENIS SOAL & MAPEL; SAAT SUDAH MULAI -> DIGANTIKAN NAVIGASI NOMOR SOAL */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
        {isExamRunning && activeExamObj ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span
                    className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                      viewMode === 'tka' ? 'bg-purple-100 text-purple-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {activeExamObj.paketName}
                  </span>
                  <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
                    {activeExamObj.mapel}
                  </span>
                </div>
                <h3 className="text-xs sm:text-sm font-display font-black text-slate-800">
                  Navigasi Nomor Soal ({countAnsweredQuestions(answers)} / {activeExamSoalList.length} Terjawab)
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-bold">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-emerald-500 inline-block"></span> Terjawab
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className={`w-3 h-3 rounded inline-block ${
                      viewMode === 'tka' ? 'bg-purple-600' : 'bg-rose-600'
                    }`}
                  ></span>{' '}
                  Sedang Dibuka
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-slate-200 inline-block"></span> Belum Dijawab
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto p-0.5">
              {activeExamSoalList.map((item, idx) => {
                const isAnswered = isQuestionAnswerFilled(answers[item.id]);
                const isCurrent = idx === currentQIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCurrentQIndex(idx)}
                    className={`w-9 h-9 rounded-xl font-mono text-xs font-black transition cursor-pointer ${
                      isCurrent
                        ? viewMode === 'tka'
                          ? 'bg-purple-600 text-white ring-2 ring-purple-300 shadow-sm scale-105'
                          : 'bg-rose-600 text-white ring-2 ring-rose-300 shadow-sm scale-105'
                        : isAnswered
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        ) : !examResult ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-display font-black text-sm text-slate-800 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${viewMode === 'tka' ? 'bg-purple-600' : 'bg-rose-600'}`}></span>
                Daftar Paket Ujian {viewMode === 'tka' ? 'TKA' : 'CBT'} Aktif untuk Kelas Anda
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Pilih salah satu paket ujian di bawah ini untuk memulai pengerjaan soal.
              </p>
            </div>

            {currentAvailableExams.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentAvailableExams.map((exam) => {
                  const isPicked = selectedExamId === exam.id;
                  return (
                    <button
                      key={exam.id}
                      type="button"
                      onClick={() => {
                        setSelectedExamId(exam.id);
                        setExamResult(null);
                      }}
                      className={`p-4 rounded-2xl border-2 text-left transition cursor-pointer flex flex-col justify-between gap-3 shadow-2xs ${
                        isPicked
                          ? viewMode === 'tka'
                            ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-200'
                            : 'border-rose-600 bg-rose-50 ring-2 ring-rose-200'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span
                            className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                              viewMode === 'tka'
                                ? 'bg-purple-100 text-purple-900'
                                : 'bg-rose-100 text-rose-900'
                            }`}
                          >
                            {exam.paketName}
                          </span>
                          {exam.subPaket && (
                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                              {exam.subPaket}
                            </span>
                          )}
                        </div>
                        <h4 className="font-display font-black text-sm text-slate-900 leading-snug">
                          {exam.mapel}
                        </h4>
                        <p className="text-xs text-slate-600 font-medium">
                          {exam.judul}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {exam.soalList.length} Butir Soal • {exam.durasiMenit} Menit
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className={`text-xs font-black ${isPicked ? (viewMode === 'tka' ? 'text-purple-700' : 'text-rose-700') : 'text-slate-700'}`}>
                          {isPicked ? '✓ Dipilih' : 'Mulai Ujian →'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="font-display font-black text-sm text-amber-900">
                  Belum Ada Paket Soal {viewMode === 'tka' ? 'TKA' : 'CBT'} yang Aktif
                </h4>
                <p className="text-xs text-amber-800 max-w-md mx-auto">
                  Saat ini guru atau admin belum mengaktifkan paket soal untuk kelas Anda. Soal akan otomatis muncul di sini setelah diaktifkan.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* JIKA BELUM ADA UJIAN DIPILIH: AREA SOAL DAN WAKTU TERKUNCI */}
        {!isExamRunning && !examResult && !selectedExamId && filteredExamsForDropdown.length > 0 && (
          <div className="p-8 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-500 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h4 className="font-display font-black text-slate-700 text-sm">
              Area Soal &amp; Menu Waktu Terkunci
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Silakan pilih paket soal &amp; mata pelajaran di atas untuk memunculkan detail ujian, durasi waktu pengerjaan, dan tombol mulai.
            </p>
          </div>
        )}

        {/* TAHAP B: PANEL DETAIL & MENU WAKTU (MUNCUL SETELAH MEMILIH & BELUM MULAI) */}
        {selectedExamId && currentExam && !isExamRunning && !examResult && (
          <div className={`p-6 rounded-3xl border-2 ${
            viewMode === 'tka' ? 'border-purple-200 bg-purple-50/30' : 'border-rose-200 bg-rose-50/30'
          } space-y-5 animate-in fade-in duration-300`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                    viewMode === 'tka' ? 'bg-purple-200 text-purple-900' : 'bg-rose-200 text-rose-900'
                  }`}>
                    {currentExam.mapel}
                  </span>
                  <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800">
                    {currentExam.paketName}{currentExam.subPaket ? ` • ${currentExam.subPaket}` : ''}
                  </span>
                </div>
                <h3 className="font-display font-black text-lg text-slate-800 mt-1">
                  {currentExam.judul}
                </h3>
              </div>

              {/* Menu Waktu (Timer) */}
              <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-2xs">
                <Clock className={`w-5 h-5 ${viewMode === 'tka' ? 'text-purple-600' : 'text-rose-600'}`} />
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block leading-tight">Durasi Ujian:</span>
                  <span className="font-display font-black text-sm text-slate-800">
                    Waktu: {currentExam.durasiMenit} Menit
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-slate-500 text-[11px] block">Jumlah Butir Soal</span>
                <span className="text-base font-black text-slate-800 block mt-0.5">
                  {currentExam.soalList.length} Soal Pilihan
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-slate-500 text-[11px] block">Sistem Penilaian</span>
                <span className="text-base font-black text-emerald-700 block mt-0.5">
                  Skala Nilai 0 - 100
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-slate-500 text-[11px] block">Batas Waktu Timer</span>
                <span className="text-base font-black text-amber-700 block mt-0.5">
                  Auto-Submit Otomatis
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed font-medium">
              💡 <strong>Petunjuk Pengerjaan:</strong> Pastikan Anda membaca setiap butir soal dengan teliti. Ketika tombol "Mulai Ujian" ditekan, timer hitungan mundur akan langsung berjalan. Jika waktu habis, seluruh jawaban yang telah dipilih akan otomatis tersimpan dan terkirim ke sistem sekolah.
            </div>

            {/* Tombol Mulai Ujian / Lanjutkan Draft Tersimpan */}
            {(() => {
              const savedDraft = currentStudent?.id
                ? getStudentExamDraftById(currentStudent.id, currentExam.id)
                : null;
              const hasValidDraft = Boolean(savedDraft && savedDraft.timeLeft > 0);
              const savedAnsCount = hasValidDraft ? countAnsweredQuestions(savedDraft!.answers) : 0;

              return (
                <div className="space-y-3 pt-2">
                  {hasValidDraft && savedDraft && (
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900">
                      <div>
                        <strong className="font-black">✓ Progres Pengerjaan Sebelumnya Tersimpan:</strong>{' '}
                        Terakhir pada <strong>Soal #{savedDraft.currentQIndex + 1}</strong> • {savedAnsCount} dari {currentExam.soalList.length} soal terjawab • Sisa waktu{' '}
                        <span className="font-mono font-black">{formatTimer(savedDraft.timeLeft)}</span>.
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2.5">
                    {hasValidDraft && savedDraft ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartExam(true)}
                          className="font-display font-extrabold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-5 py-3 rounded-2xl text-xs flex items-center gap-2 cursor-pointer transition"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Mulai Ulang dari Awal</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => resumeFromDraft(savedDraft, currentExam)}
                          className="font-display font-black text-white bg-emerald-600 hover:bg-emerald-700 px-8 py-3.5 rounded-2xl text-sm shadow-lg shadow-emerald-600/25 flex items-center gap-2 cursor-pointer transition transform active:scale-95"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          <span>Lanjutkan Soal #{savedDraft.currentQIndex + 1}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartExam(false)}
                        className={`font-display font-black text-white px-8 py-3.5 rounded-2xl text-sm shadow-lg flex items-center gap-2 cursor-pointer transition transform active:scale-95 ${
                          viewMode === 'tka'
                            ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/25'
                            : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/25'
                        }`}
                      >
                        <Play className="w-5 h-5 fill-current" />
                        <span>Mulai Ujian Sekarang</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* TAHAP C: ANTARMUKA SAAT UJIAN BERLANGSUNG */}
        {isExamRunning && activeExamObj && (
          <div className="space-y-4 pt-2">
            {isSavingSubmission && (
              <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs font-black flex items-center justify-center gap-2.5 shadow-sm">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                <span>Sedang menyimpan jawaban... Jangan tutup halaman</span>
              </div>
            )}
            {/* Notice saat berhasil dipulihkan setelah logout / masuk kembali */}
            {resumedNotice && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{resumedNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setResumedNotice(null)}
                  className="text-emerald-700 hover:text-emerald-950 font-black px-2 py-0.5 rounded-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Butir Soal & Pilihan Jawaban */}
            {(() => {
              const q = activeExamSoalList[currentQIndex];
              if (!q) return null;
              const selectedAnswer = answers[q.id];

              return (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                  {/* Nomor Soal & Bobot */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-black text-sm text-slate-800">
                        Soal Nomor #{currentQIndex + 1}
                      </span>
                      <span className="text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg">
                        {q.tipe === 'pg'
                          ? 'Pilihan Ganda'
                          : q.tipe === 'pg_kompleks'
                          ? 'PG Kompleks'
                          : q.tipe === 'benar_salah'
                          ? 'Benar / Salah'
                          : q.tipe === 'isian'
                          ? 'Isian Singkat'
                          : q.tipe === 'menjodohkan'
                          ? 'Menjodohkan'
                          : 'Uraian'}
                      </span>
                    </div>
                    {Number(q.bobot) > 0 && (
                      <span className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-xl">
                        Bobot: {q.bobot} Poin
                      </span>
                    )}
                  </div>

                  {/* Pertanyaan & Gambar Soal (Judul terpisah & posisi gambar sesuai pengaturan) */}
                  <QuestionContent
                    pertanyaan={q.pertanyaan}
                    judulTeks={q.judulTeks}
                    gambarUrl={q.gambarUrl}
                    gambarUrl2={q.gambarUrl2}
                    posisiGambar={q.posisiGambar}
                    titleClassName="text-base sm:text-lg font-display font-black text-slate-900"
                    bodyClassName="text-sm font-semibold text-slate-800 leading-relaxed"
                  />

                  {/* Pilihan Opsi Jawaban sesuai Tipe Soal */}
                  <div className="space-y-2.5">
                    {q.tipe === 'pg_kompleks' && q.opsi && q.opsi.length > 0 ? (
                      <>
                        <p className="text-[11px] font-bold text-slate-500">
                          ✓ Pilih satu atau lebih jawaban yang benar:
                        </p>
                        {q.opsi.map((opsi, oIdx) => {
                          const optKey = String.fromCharCode(65 + oIdx);
                          const selectedArr: string[] = Array.isArray(selectedAnswer) ? selectedAnswer : [];
                          const isChosen = selectedArr.includes(opsi) || selectedArr.includes(optKey);
                          const optImg = q.opsiGambar?.[optKey];

                          return (
                            <div
                              key={oIdx}
                              onClick={() => {
                                const updated = isChosen
                                  ? selectedArr.filter((v) => v !== opsi && v !== optKey)
                                  : [...selectedArr, opsi];
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: updated,
                                }));
                              }}
                              className={`p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col gap-2 ${
                                isChosen
                                  ? viewMode === 'tka'
                                    ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold shadow-xs'
                                    : 'border-rose-600 bg-rose-50 text-rose-950 font-bold shadow-xs'
                                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-3.5">
                                <input
                                  type="checkbox"
                                  checked={isChosen}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded cursor-pointer"
                                />
                                <span className="w-7 h-7 rounded-lg font-mono font-black text-xs flex items-center justify-center shrink-0 bg-slate-100 text-slate-700 border border-slate-200">
                                  {optKey}
                                </span>
                                <span className="text-xs leading-relaxed whitespace-pre-wrap">
                                  <MathRenderer text={opsi} fontFamily="plus-jakarta" />
                                </span>
                              </div>
                              {optImg && (
                                <img
                                  src={optImg}
                                  alt={`Gambar Opsi ${optKey}`}
                                  className="h-20 w-auto object-contain rounded-lg border border-slate-200 bg-white ml-11"
                                />
                              )}
                            </div>
                          );
                        })}
                      </>
                    ) : q.tipe === 'benar_salah' ? (
                      <BenarSalahTableView
                        items={resolveBenarSalahItems(q)}
                        interactive
                        value={selectedAnswer}
                        onChange={(nextMap) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [q.id]: nextMap,
                          }))
                        }
                        accentTheme={viewMode === 'tka' ? 'purple' : 'rose'}
                      />
                    ) : q.tipe === 'menjodohkan' ? (
                      (() => {
                        const matchData = resolveMenjodohkanData(q);
                        return matchData ? (
                          <MenjodohkanColumnsView
                            data={matchData}
                            interactive
                            value={selectedAnswer}
                            onChange={(nextMap) =>
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: nextMap,
                              }))
                            }
                            accentTheme={viewMode === 'tka' ? 'purple' : 'rose'}
                          />
                        ) : (
                          <textarea
                            rows={3}
                            value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
                            onChange={(e) => {
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: e.target.value,
                              }));
                            }}
                            placeholder="Tuliskan pasangan jawaban Anda di sini..."
                            className="w-full p-3 rounded-2xl border border-slate-300 text-xs font-medium outline-none focus:border-rose-500"
                          />
                        );
                      })()
                    ) : q.opsi && q.opsi.length > 0 ? (
                      q.opsi.map((opsi, oIdx) => {
                        const optKey = String.fromCharCode(65 + oIdx); // 'A', 'B', 'C', 'D'
                        const optImg = q.opsiGambar?.[optKey];
                        const isChosen =
                          selectedAnswer === opsi ||
                          selectedAnswer === optKey ||
                          (typeof selectedAnswer === 'object' &&
                            (selectedAnswer?.text === opsi || selectedAnswer?.key === optKey));

                        return (
                          <div
                            key={oIdx}
                            onClick={() => {
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: { key: optKey, text: opsi },
                              }));
                            }}
                            className={`p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col gap-2 ${
                              isChosen
                                ? viewMode === 'tka'
                                  ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold shadow-xs'
                                  : 'border-rose-600 bg-rose-50 text-rose-950 font-bold shadow-xs'
                                : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3.5">
                              <span className={`w-8 h-8 rounded-xl font-mono font-black text-xs flex items-center justify-center shrink-0 border ${
                                isChosen
                                  ? viewMode === 'tka'
                                    ? 'bg-purple-600 text-white border-purple-600'
                                    : 'bg-rose-600 text-white border-rose-600'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {optKey}
                              </span>
                              <span className="text-xs leading-relaxed whitespace-pre-wrap">
                                <MathRenderer text={opsi} fontFamily="plus-jakarta" />
                              </span>
                            </div>
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar Opsi ${optKey}`}
                                className="h-20 w-auto object-contain rounded-lg border border-slate-200 bg-white ml-11"
                              />
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <textarea
                        rows={3}
                        value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
                        onChange={(e) => {
                          setAnswers((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }));
                        }}
                        placeholder="Tuliskan jawaban Anda di sini..."
                        className="w-full p-3 rounded-2xl border border-slate-300 text-xs font-medium outline-none focus:border-rose-500"
                      />
                    )}
                  </div>

                  {/* Navigasi Soal: Sebelumnya, Selanjutnya, Selesai */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={currentQIndex === 0}
                      onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
                      className="px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Sebelumnya</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {currentQIndex < activeExamSoalList.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => setCurrentQIndex((prev) => prev + 1)}
                          className={`px-6 py-2.5 rounded-2xl text-white font-display font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md ${
                            viewMode === 'tka' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-rose-600 hover:bg-rose-700'
                          }`}
                        >
                          <span>Selanjutnya</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isSavingSubmission}
                          onClick={() => handleFinishExam(false)}
                          className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-display font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-600/20"
                        >
                          {isSavingSubmission ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Sedang menyimpan jawaban...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4" />
                              <span>Selesai &amp; Kumpulkan Jawaban</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* HASIL UJIAN (MUNCUL SETELAH SELESAI / AUTO SUBMIT) */}
        {examResult && activeExamObj && (
          <div className="p-8 rounded-3xl bg-white border-2 border-emerald-300 shadow-lg text-center space-y-4 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <span
                className={`text-xs font-black uppercase px-3 py-1 rounded-full border ${
                  examResult.lockedPracticeOnly
                    ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                }`}
              >
                {examResult.lockedPracticeOnly
                  ? 'Mode Latihan Selesai • Nilai Resmi Tetap Terkunci'
                  : 'Ujian Berhasil Diselesaikan & Tersinkronisasi'}
              </span>
              <h3 className="font-display font-black text-2xl text-slate-800 mt-2">
                {examResult.lockedPracticeOnly
                  ? `Skor Percobaan Latihan: ${examResult.score} / 100`
                  : `Nilai Akhir: ${examResult.score} / 100`}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {activeExamObj.judul} • Peserta: {currentStudent.nama}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                {typeof examResult.durasiDetik === 'number' && (
                  <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg">
                    Durasi: {formatDurasiDetik(examResult.durasiDetik)}
                  </span>
                )}
                {typeof examResult.totalHots === 'number' && examResult.totalHots > 0 && (
                  <span className="text-[11px] font-bold bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-lg">
                    Benar Soal Sulit (HOTS): {examResult.benarHots ?? 0}/{examResult.totalHots}
                  </span>
                )}
              </div>
            </div>

            {examResult.lockedPracticeOnly ? (
              <div className="max-w-lg mx-auto p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold leading-relaxed">
                Latihan Selesai! Skor percobaan latihan Anda: <strong>{examResult.score}</strong>. Catatan: Nilai resmi TKA pertama Anda (<strong>{examResult.lockedScore ?? examResult.score}</strong>) sudah masuk &amp; terkunci di sistem Guru sehingga tidak berubah.
              </div>
            ) : (
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                Nilai Anda telah otomatis tersimpan ke data penilaian sekolah dan langsung terintegrasi dengan Rekap Nilai (Leger) serta e-Rapor resmi.
              </p>
            )}

            {/* Indikator Status Terpisah: Simpan Jawaban Firestore (Instan) vs Analisis SARAH AI (Async Queue) */}
            <div className="max-w-xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left pt-1">
              <div
                className={`px-3.5 py-2.5 rounded-2xl border flex items-center gap-2.5 ${
                  firestoreSaveStatus === 'saving' || offlineQueueNotice
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-emerald-50/80 border-emerald-200'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-white ${
                    firestoreSaveStatus === 'saving' || offlineQueueNotice ? 'bg-amber-500' : 'bg-emerald-600'
                  }`}
                >
                  {firestoreSaveStatus === 'saving' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Database className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-800">
                    1. Simpan Firestore ({offlineQueueNotice ? 'Antrean Offline' : 'Instan'})
                  </p>
                  <p className={`text-[11px] font-semibold truncate ${offlineQueueNotice ? 'text-amber-800' : 'text-emerald-800'}`}>
                    {firestoreSaveStatus === 'saving'
                      ? 'Mengirim jawaban ke Firestore...'
                      : offlineQueueNotice
                      ? 'Tersimpan aman lokal, otomatis terkirim saat online'
                      : '✓ Jawaban & status selesai tersimpan'}
                  </p>
                </div>
              </div>

              <div className="px-3.5 py-2.5 rounded-2xl border bg-indigo-50/70 border-indigo-200 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-indigo-950">
                    2. Analisis SARAH (Async)
                  </p>
                  <p className="text-[11px] font-semibold text-indigo-800 truncate">
                    Siap via antrean AbortController &amp; Cache
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('serbu21-open-tanya-sarah', {
                      detail: {
                        examId: activeExamObj.id,
                        paketName: activeExamObj.paketName,
                        mapel: activeExamObj.mapel,
                        category: activeExamObj.category,
                        autoRequestFeedback: true,
                      },
                    })
                  );
                }}
                className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white font-display font-black text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Tanya SARAH Soal yang Masih Salah</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedExamId('');
                  setExamResult(null);
                  setFirestoreSaveStatus('idle');
                  setRunningExamSnapshot(null);
                  setViewMode('home');
                }}
                className="px-6 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-display font-black text-xs shadow-md transition cursor-pointer"
              >
                Kembali ke Beranda Siswa
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('rapor')}
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
              >
                Lihat Hasil di e-Rapor
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL SEDERHANA: NOTIFIKASI WAKTU UJIAN BERAKHIR & AUTO-SUBMIT KE DATABASE */}
      {timeUpModal?.isOpen && (
        <div className="fixed inset-0 z-[1050] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-[2rem] p-6 sm:p-7 shadow-2xl border-2 border-rose-200 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div
              className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-lg ${
                timeUpModal.status === 'submitting'
                  ? 'bg-amber-500 text-white shadow-amber-500/30'
                  : 'bg-emerald-600 text-white shadow-emerald-600/25'
              }`}
            >
              {timeUpModal.status === 'submitting' ? (
                <Clock className="w-8 h-8 animate-pulse" />
              ) : (
                <CheckCircle2 className="w-8 h-8" />
              )}
            </div>

            <div className="space-y-1">
              <span
                className={`inline-block text-[10px] font-black uppercase px-3 py-1 rounded-full ${
                  timeUpModal.status === 'submitting'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-emerald-100 text-emerald-900'
                }`}
              >
                {timeUpModal.status === 'submitting'
                  ? `Waktu Ujian ${timeUpModal.category === 'tka' ? 'TKA' : 'CBT'} Berakhir`
                  : 'Pengiriman Otomatis Selesai'}
              </span>
              <h3 className="font-display font-black text-lg sm:text-xl text-slate-900">
                {timeUpModal.status === 'submitting'
                  ? 'Mengirim Jawaban ke Database...'
                  : 'Jawaban Berhasil Dikirim & Sesi Ditutup'}
              </h3>
              <p className="text-xs font-bold text-slate-500">{timeUpModal.examTitle}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
              {timeUpModal.status === 'submitting' ? (
                <p className="leading-relaxed">
                  Durasi pengerjaan ujian telah habis. Sistem sedang menyimpan dan mengirimkan{' '}
                  <strong>
                    {timeUpModal.answeredCount} dari {timeUpModal.totalQuestions}
                  </strong>{' '}
                  jawaban Anda secara otomatis ke database sekolah sebelum sesi ditutup...
                </p>
              ) : (
                <>
                  <p className="leading-relaxed">
                    {timeUpModal.cloudSaved
                      ? 'Seluruh jawaban Anda telah otomatis terkirim dan tersimpan aman di database sekolah sebelum sesi ujian ditutup.'
                      : 'Seluruh jawaban Anda telah tersimpan di sistem sekolah dan masuk antrean sinkronisasi database.'}
                  </p>
                  <div className="flex items-center justify-center gap-4 pt-1 font-display font-black text-slate-900">
                    <span>
                      Terjawab: {timeUpModal.answeredCount}/{timeUpModal.totalQuestions} Soal
                    </span>
                    <span className="text-emerald-700">Nilai Akhir: {timeUpModal.score ?? 0}/100</span>
                  </div>
                </>
              )}
            </div>

            {timeUpModal.status === 'submitting' ? (
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-700 py-1">
                <span className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin inline-block" />
                <span>Mohon tunggu sebentar, jangan tutup halaman...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setTimeUpModal(null)}
                className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs sm:text-sm shadow-md transition cursor-pointer"
              >
                Tutup &amp; Lihat Hasil Ujian
              </button>
            )}
          </div>
        </div>
      )}
      {timeUpModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span
                className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                  timeUpModal.status === 'submitting'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {timeUpModal.status === 'submitting'
                  ? `Waktu Ujian ${timeUpModal.category === 'tka' ? 'TKA' : 'CBT'} Berakhir`
                  : 'Pengiriman Otomatis Selesai'}
              </span>
              <h3 className="font-display font-black text-lg sm:text-xl text-slate-900">
                {timeUpModal.status === 'submitting'
                  ? 'Mengirim Jawaban ke Database...'
                  : 'Jawaban Berhasil Dikirim & Sesi Ditutup'}
              </h3>
              <p className="text-xs font-bold text-slate-500">{timeUpModal.examTitle}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
              {timeUpModal.status === 'submitting' ? (
                <p className="leading-relaxed">
                  Durasi pengerjaan ujian telah habis. Sistem sedang menyimpan dan mengirimkan{' '}
                  <strong>
                    {timeUpModal.answeredCount} dari {timeUpModal.totalQuestions}
                  </strong>{' '}
                  jawaban Anda secara otomatis ke database sekolah sebelum sesi ditutup...
                </p>
              ) : (
                <>
                  <p className="leading-relaxed">
                    {timeUpModal.cloudSaved
                      ? 'Seluruh jawaban Anda telah otomatis terkirim dan tersimpan aman di database sekolah sebelum sesi ujian ditutup.'
                      : 'Seluruh jawaban Anda telah tersimpan di sistem sekolah dan masuk antrean sinkronisasi database.'}
                  </p>
                  <div className="flex items-center justify-center gap-4 pt-1 font-display font-black text-slate-900">
                    <span>
                      Terjawab: {timeUpModal.answeredCount}/{timeUpModal.totalQuestions} Soal
                    </span>
                    <span className="text-emerald-700">Nilai Akhir: {timeUpModal.score ?? 0}/100</span>
                  </div>
                </>
              )}
            </div>

            {timeUpModal.status === 'submitting' ? (
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-700 py-1">
                <span className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin inline-block" />
                <span>Mohon tunggu sebentar, jangan tutup halaman...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setTimeUpModal(null)}
                className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs sm:text-sm shadow-md transition cursor-pointer"
              >
                Tutup &amp; Lihat Hasil Ujian
              </button>
            )}
          </div>
        </div>
      )}

      {submittingModalState.isOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl border-2 border-rose-200">
            {submittingModalState.status === 'success' ? (
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto animate-pulse">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}
            <h3 className="font-display font-black text-lg text-slate-900">
              {submittingModalState.status === 'success'
                ? 'Pengiriman Nilai Berhasil!'
                : submittingModalState.status === 'retry'
                ? 'Pengiriman Nilai (Tahan Wait Response)'
                : 'Mengamankan & Mengirim Jawaban ke Server...'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {submittingModalState.message}
            </p>
            {submittingModalState.status === 'success' ? (
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('sekolahku_pending_submission_lock_v1');
                  } catch {}
                  setSubmittingModalState((prev) => ({ ...prev, isOpen: false }));
                  setIsExamRunning(false);
                  onExamActiveChange?.(false);
                  setViewMode('home');
                  setSelectedExamId('');
                }}
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs shadow-lg cursor-pointer transition"
              >
                Selesai &amp; Kembali ke Beranda
              </button>
            ) : (
              <div className="text-[11px] text-amber-800 font-bold bg-amber-50 p-3 rounded-xl border border-amber-200">
                🔒 Layar dikunci demi keamanan data ujian Anda. Jangan tutup halaman ini.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
