import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users,
  Compass,
  FileQuestion,
  BarChart3,
  Plus,
  Upload,
  Download,
  Trash2,
  Play,
  Clock,
  CheckCircle,
  HelpCircle,
  Search,
  Filter,
  Layers,
  Image as ImageIcon,
  CheckSquare,
  BookOpen,
  Award,
  RefreshCw,
  X,
  FileSpreadsheet,
  Pencil,
  Edit3,
  Check,
  TrendingUp,
  Printer,
  Trophy,
  FileText,
  Eye,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Shuffle,
  AlignCenter,
  Power,
  Lock,
  EyeOff,
  PauseCircle,
  RotateCcw,
  ChevronDown,
  User,
  Settings,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, TKACpTp, TKAQuestion, TKAJenis, ActiveUser, Teacher, SchoolProfile, isSiswaInklusi, isAbkExcludedFromTka, BenarSalahItem, MenjodohkanData } from '../../types';
import { TKA_JENIS_LIST, TKA_MAPEL_LIST } from '../../data/defaultData';
import {
  getStoredTKACpTp,
  saveStoredTKACpTp,
  getStoredTKAQuestions,
  saveStoredTKAQuestions,
  getStoredTKADurations,
  saveStoredTKADurations,
  getTKADurationKey,
  getTKADurationMinutes,
  getStoredTKAActivePackages,
  saveStoredTKAActivePackages,
  isTKAPackageActive,
  getStoredTKAResults,
  saveStoredTKAResults,
  getStoredTKASubmissions,
  saveStoredTKASubmissions,
  clearTKAResultsFromStorage,
  notifyStorageMutation,
  TKASubmissionItem,
  TKAMapelScoreKey,
  normalizeTkaMapelKey,
  extractBaseTkaPaket,
  MAX_QUESTIONS_PER_PACKAGE,
  isKelas6Class,
  sanitizeSubmissionFotoUrl,
  DEFAULT_STUDENT_AVATAR_URL,
} from '../../utils/storage';
import { getLocalTodayStr } from '../../utils/dateUtils';
import {
  collectPersistentLocalBackup,
  pushAllDataToCloud,
  syncAllLocalToCloud,
  reconcileTkaFromCloudBackup,
} from '../../utils/cloudSync';
import {
  exportQuestionsToWord,
  exportTkaQuestionsToExcel,
} from '../../utils/questionExport';
import {
  exportIndividualTkaReportToWord,
  exportIndividualTkaReportToPdf,
  exportClassTkaReportToWord,
  exportClassTkaReportToPdf,
  TkaReportExportOptions,
  TkaReportRecordInput,
} from '../../utils/tkaReportExport';
import { doesRecordMatchTerm, isSemesterOneLabel } from '../../utils/semesterUtils';
import {
  saveSingleTkaQuestionToFirestore,
  deleteTkaQuestionFromFirestore,
  saveTkaQuestionsBatchToFirestore,
  saveTkaSubmissionsBatchToFirestore,
  clearTkaSubmissionsInFirestore,
  deleteTkaSubmissionsByPaketInFirestore,
  upsertTkaSubmissionAsync,
  fetchTkaSubmissionsFromFirestore,
  flushPendingTkaSubmissionsToFirestore,
  mergeTkaSubmissionLists,
  getPendingTkaSubmissions,
} from '../../utils/tkaFirestore';
import { evaluateQuestionScore } from '../../utils/answerChecker';
import { parseQuestionsFromDocx, convertToTkaQuestions } from '../../utils/docxImporter';
import { compressQuestionImage } from '../../utils/imageUtils';
import { formatNipLabel, resolveKepalaSekolah, resolveWaliKelas } from '../../utils/teacherSync';
import { QuestionContent } from '../QuestionContent';
import { FormattedMathText, FractionBuilderBar } from '../FormattedMathText';
import { MathPreviewPanel } from '../MathPreviewPanel';
import {
  BenarSalahTableView,
  MenjodohkanColumnsView,
  BenarSalahEditor,
  MenjodohkanEditor,
} from '../StructuredQuestionViews';
import {
  PosisiGambar,
  extractPastedQuestionText,
  toggleCenterTagOnSelection,
  stripQuestionTags,
  insertFractionAtSelection,
  convertPlainFractionsToTags,
  resolveBenarSalahItems,
  formatBenarSalahKeySummary,
  resolveMenjodohkanData,
  formatMenjodohkanKeySummary,
} from '../../utils/questionFormat';
import {
  TKAExamRoomDraft,
  buildQuestionOrderSnapshot,
  restoreQuestionsFromSnapshot,
  saveTkaRoomDraft,
  getTkaRoomDraft,
  getLastActiveTkaRoomDraft,
  clearTkaRoomDraft,
  countAnsweredQuestions,
  isQuestionAnswerFilled,
} from '../../utils/examDraft';

interface Props {
  subType: 'siswa-tka' | 'cp-tp-tka' | 'bank-soal-tka' | 'pengaturan-tka' | 'analisis-tka' | 'hasil-tka' | 'tes-tka-siswa';
  students: Student[];
  teachers?: Teacher[];
  profile?: SchoolProfile;
  activeYear?: string;
  activeSemester?: string;
  activeUser: ActiveUser;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
  onSaveStudents?: (students: Student[], skipCloudWrite?: boolean) => void;
}

export const TKATabs: React.FC<Props> = ({
  subType,
  students,
  teachers = [],
  profile,
  activeYear = '2026/2027',
  activeSemester = 'Semester 1',
  activeUser,
  showToast,
  onOpenZoom,
  onSaveStudents,
}) => {
  // 1. Data Siswa TKA: Seluruh Kelas 6 yang mengikuti TKA (mengecualikan siswa berkebutuhan khusus jika diatur Tidak Masuk TKA)
  const allKelas6Students = useMemo(
    () => students.filter((s) => isKelas6Class(s.kelas)),
    [students]
  );
  const abkKelas6Students = useMemo(
    () => allKelas6Students.filter((s) => isSiswaInklusi(s.kebutuhanKhusus)),
    [allKelas6Students]
  );
  const excludedAbkStudents = useMemo(
    () => abkKelas6Students.filter((s) => isAbkExcludedFromTka(s)),
    [abkKelas6Students]
  );
  const excludedAbkIds = useMemo(
    () => new Set(excludedAbkStudents.map((s) => s.id).filter(Boolean)),
    [excludedAbkStudents]
  );
  const excludedAbkNisns = useMemo(
    () => new Set(excludedAbkStudents.map((s) => s.nisn).filter(Boolean)),
    [excludedAbkStudents]
  );
  const isExcludedTkaSubmission = (sub: { studentId?: string; nisn?: string }) =>
    Boolean(
      (sub.studentId && excludedAbkIds.has(sub.studentId)) ||
        (sub.nisn && excludedAbkNisns.has(sub.nisn))
    );
  const tkaStudents = useMemo(
    () => allKelas6Students.filter((s) => !isAbkExcludedFromTka(s)),
    [allKelas6Students]
  );
  const availableTkaStudentClasses = useMemo(() => {
    const set = new Set<string>(['Kelas 6A', 'Kelas 6B']);
    allKelas6Students.forEach((s) => {
      if (s.kelas) set.add(s.kelas);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  }, [allKelas6Students]);
  const studentPhotoMap = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((s) => {
      if (s.fotoUrl) {
        if (s.id) map.set(s.id, s.fotoUrl);
        if (s.nisn) map.set(s.nisn, s.fotoUrl);
      }
    });
    return map;
  }, [students]);

  const [classFilter, setClassFilter] = useState<string>('all');
  const [searchStudent, setSearchStudent] = useState('');

  const displayTkaStudents = tkaStudents.filter((s) => {
    if (classFilter !== 'all' && s.kelas !== classFilter) return false;
    if (
      searchStudent &&
      !s.nama.toLowerCase().includes(searchStudent.toLowerCase()) &&
      !s.nisn.includes(searchStudent) &&
      !s.barcodeId.toLowerCase().includes(searchStudent.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleSetAbkTkaParticipation = (targetIds: string[], masukTka: boolean) => {
    if (!onSaveStudents || targetIds.length === 0) return;
    const targetSet = new Set(targetIds);
    const updatedStudents = students.map((s) =>
      targetSet.has(s.id) ? { ...s, ikutTka: masukTka } : s
    );
    onSaveStudents(updatedStudents);
    if (targetIds.length === 1) {
      const target = students.find((s) => s.id === targetIds[0]);
      showToast(
        `${target?.nama || 'Siswa'} diatur menjadi ${masukTka ? 'Masuk Peserta TKA' : 'Tidak Masuk TKA'}.`,
        'success'
      );
    } else {
      showToast(
        `${targetIds.length} siswa berkebutuhan khusus diatur menjadi ${masukTka ? 'Masuk Peserta TKA' : 'Tidak Masuk TKA'}.`,
        'success'
      );
    }
  };

  // 2. CP & TP TKA State
  const [cpTpList, setCpTpList] = useState<TKACpTp[]>(getStoredTKACpTp());
  const [cpTpFilterMapel, setCpTpFilterMapel] = useState<string>(TKA_MAPEL_LIST[0]);
  const [showAddCpTpForm, setShowAddCpTpForm] = useState(false);
  const [confirmDeleteCpId, setConfirmDeleteCpId] = useState<string | null>(null);
  const [confirmDeleteTpId, setConfirmDeleteTpId] = useState<string | null>(null);
  const [newCpKode, setNewCpKode] = useState('');
  const [newCpJudul, setNewCpJudul] = useState('');
  const [newCpMapel, setNewCpMapel] = useState<string>(TKA_MAPEL_LIST[0]);
  const [newCpDesc, setNewCpDesc] = useState('');
  const [newTpJudul, setNewTpJudul] = useState('');

  // Modals for quick add CP and TP
  const [showAddCpModal, setShowAddCpModal] = useState(false);
  const [showAddTpModal, setShowAddTpModal] = useState(false);
  const [quickCpKode, setQuickCpKode] = useState('');
  const [quickCpJudul, setQuickCpJudul] = useState('');
  const [quickCpMapel, setQuickCpMapel] = useState('Bahasa Indonesia');
  const [quickCpDesc, setQuickCpDesc] = useState('');
  const [quickTpKode, setQuickTpKode] = useState('');
  const [quickTpJudul, setQuickTpJudul] = useState('');

  // 3. Bank Soal TKA State
  const [tkaQuestions, setTkaQuestions] = useState<TKAQuestion[]>(getStoredTKAQuestions());
  const [filterJenisTka, setFilterJenisTka] = useState<string>('all');
  const [filterMapelTka, setFilterMapelTka] = useState<string>('all');
  const [editingTkaQuestionId, setEditingTkaQuestionId] = useState<string | null>(null);
  const [confirmDeleteTkaQId, setConfirmDeleteTkaQId] = useState<string | null>(null);
  const docxTkaInputRef = useRef<HTMLInputElement | null>(null);

  // 4. Analisis TKA State (Multi-Select Mata Pelajaran)
  const [selectedAnalisisMapels, setSelectedAnalisisMapels] = useState<string[]>([
    'Bahasa Indonesia',
    'Matematika',
    'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
    'Bahasa Inggris',
    'Koding dan Kecerdasan Artifisial (KKA)',
  ]);
  const [analisisMapelTka, setAnalisisMapelTka] = useState<string>('all');
  const [analisisPaketTka, setAnalisisPaketTka] = useState<string>('all');
  const [analisisChartTab, setAnalisisChartTab] = useState<'kesukaran' | 'ketuntasan' | 'pembeda'>('kesukaran');

  // 5. Report & Hasil TKA State (mendukung 120+ siswa & multi-rombel)
  const [tkaSubmissions, setTkaSubmissions] = useState<TKASubmissionItem[]>(getStoredTKASubmissions());
  const [rankingScope, setRankingScope] = useState<string>('semua');
  const [hasilPaketTka, setHasilPaketTka] = useState<string>('all');
  const [hasilKelasTka, setHasilKelasTka] = useState<string>('all');
  const [hasilStatusTka, setHasilStatusTka] = useState<'all' | 'Tuntas' | 'Remedial'>('all');
  const [searchHasilTka, setSearchHasilTka] = useState('');
  const [hasilRowsPerPage, setHasilRowsPerPage] = useState<'all' | 30 | 60 | 120>('all');
  const [hasilPage, setHasilPage] = useState<number>(1);
  const [isSeedingTka, setIsSeedingTka] = useState<boolean>(false);
  const [isSyncingTkaCloud, setIsSyncingTkaCloud] = useState<boolean>(false);
  const [selectedHasilStudent, setSelectedHasilStudent] = useState<any | null>(null);
  const [showDownloadReportModal, setShowDownloadReportModal] = useState<boolean>(false);
  const [downloadReportMode, setDownloadReportMode] = useState<'per_orang' | 'per_kelas'>('per_orang');
  const [downloadSelectedStudentId, setDownloadSelectedStudentId] = useState<string>('');
  const [downloadStudentSearch, setDownloadStudentSearch] = useState<string>('');
  const [downloadSelectedClass, setDownloadSelectedClass] = useState<string>('all');

  // 6. Student Exam Room State (tes-tka-siswa)
  const [activeExamPaket, setActiveExamPaket] = useState<string | null>(null);
  const [activeExamMapel, setActiveExamMapel] = useState<string | null>(null);
  const [studentTkaFilterPaket, setStudentTkaFilterPaket] = useState<string>('all');
  const [studentTkaFilterMapel, setStudentTkaFilterMapel] = useState<string>('all');
  const [confirmFinishTkaExam, setConfirmFinishTkaExam] = useState<boolean>(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, any>>({});
  const [raguChecks, setRaguChecks] = useState<Record<string, boolean>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [examTimerSeconds, setExamTimerSeconds] = useState(3600);
  const [activeExamDurationSeconds, setActiveExamDurationSeconds] = useState(3600);
  const [isExamCompleted, setIsExamCompleted] = useState(false);
  const [lastExamResult, setLastExamResult] = useState<any | null>(null);
  const [selectedTestStudentId, setSelectedTestStudentId] = useState<string>(tkaStudents[0]?.id || '');
  const handleFinishTkaExamRef = useRef<() => void>(() => {});
  const handleSubmitSimRef = useRef<() => void>(() => {});

  // Pengaturan Waktu Pengerjaan & Aktivasi Paket Soal TKA
  const [tkaDurations, setTkaDurations] = useState<Record<string, number>>(() => getStoredTKADurations());
  const [tkaActivePackages, setTkaActivePackages] = useState<Record<string, boolean>>(() =>
    getStoredTKAActivePackages()
  );
  const [durPanelPaket, setDurPanelPaket] = useState<string>(TKA_JENIS_LIST[0]);
  const [durPanelMapel, setDurPanelMapel] = useState<string>('all');
  const [durPanelMinutes, setDurPanelMinutes] = useState<number>(() =>
    getTKADurationMinutes(getStoredTKADurations(), TKA_JENIS_LIST[0], 'all')
  );

  useEffect(() => {
    const syncDurations = () => setTkaDurations(getStoredTKADurations());
    const syncActivePackages = () => setTkaActivePackages(getStoredTKAActivePackages());
    const syncTkaQuestions = () => setTkaQuestions(getStoredTKAQuestions());
    const syncSubmissions = () => setTkaSubmissions(getStoredTKASubmissions());
    const syncCloudAll = () => {
      setTkaQuestions(getStoredTKAQuestions());
      setCpTpList(getStoredTKACpTp());
      setTkaSubmissions(getStoredTKASubmissions());
      setTkaDurations(getStoredTKADurations());
      setTkaActivePackages(getStoredTKAActivePackages());
    };
    window.addEventListener('sekolahku-tka-durations-updated', syncDurations);
    window.addEventListener('sekolahku-tka-active-updated', syncActivePackages);
    window.addEventListener('sekolahku-tka-questions-updated', syncTkaQuestions);
    window.addEventListener('sekolahku-exam-results-updated', syncSubmissions);
    window.addEventListener('sekolahku-cloud-sync-updated', syncCloudAll);
    return () => {
      window.removeEventListener('sekolahku-tka-durations-updated', syncDurations);
      window.removeEventListener('sekolahku-tka-active-updated', syncActivePackages);
      window.removeEventListener('sekolahku-tka-questions-updated', syncTkaQuestions);
      window.removeEventListener('sekolahku-exam-results-updated', syncSubmissions);
      window.removeEventListener('sekolahku-cloud-sync-updated', syncCloudAll);
    };
  }, []);

  useEffect(() => {
    if (subType === 'analisis-tka' || subType === 'hasil-tka' || subType === 'tes-tka-siswa') {
      setTkaSubmissions(getStoredTKASubmissions());
    }
  }, [subType]);

  useEffect(() => {
    setDurPanelMinutes(getTKADurationMinutes(tkaDurations, durPanelPaket, durPanelMapel));
  }, [tkaDurations, durPanelPaket, durPanelMapel]);

  useEffect(() => {
    setHasilPage(1);
  }, [hasilPaketTka, rankingScope, hasilKelasTka, hasilStatusTka, searchHasilTka, hasilRowsPerPage]);

  // Countdown timer for student TKA exam (with auto-submit)
  useEffect(() => {
    if (!activeExamPaket || isExamCompleted) return;
    const interval = setInterval(() => {
      setExamTimerSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          showToast('Waktu pengerjaan TKA habis! Jawaban Anda otomatis dikumpulkan.', 'error');
          setTimeout(() => handleFinishTkaExamRef.current(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeExamPaket, isExamCompleted]);

  // Setting Acak Soal & Acak Jawaban TKA (Tersimpan otomatis)
  const [acakSoalTka, setAcakSoalTka] = useState<boolean>(() => {
    return localStorage.getItem('sekolahku_tka_acak_soal') === 'true';
  });
  const [acakJawabanTka, setAcakJawabanTka] = useState<boolean>(() => {
    return localStorage.getItem('sekolahku_tka_acak_jawaban') === 'true';
  });

  useEffect(() => {
    const val = String(acakSoalTka);
    if (localStorage.getItem('sekolahku_tka_acak_soal') !== val) {
      localStorage.setItem('sekolahku_tka_acak_soal', val);
      notifyStorageMutation('sekolahku_tka_acak_soal');
    }
  }, [acakSoalTka]);

  useEffect(() => {
    const val = String(acakJawabanTka);
    if (localStorage.getItem('sekolahku_tka_acak_jawaban') !== val) {
      localStorage.setItem('sekolahku_tka_acak_jawaban', val);
      notifyStorageMutation('sekolahku_tka_acak_jawaban');
    }
  }, [acakJawabanTka]);

  // Exam runtime questions list (shuffled if acakSoalTka is active)
  const [tkaRunningQuestions, setTkaRunningQuestions] = useState<TKAQuestion[]>([]);
  const [tkaResumedNotice, setTkaResumedNotice] = useState<string | null>(null);
  const [tkaDraftRevision, setTkaDraftRevision] = useState<number>(0);
  const autoResumedTkaRef = useRef<string>('');
  const latestTkaRoomRef = useRef<{
    studentId: string;
    activeExamPaket: string | null;
    activeExamMapel: string | null;
    currentQuestionIdx: number;
    studentAnswers: Record<string, any>;
    raguChecks: Record<string, boolean>;
    examTimerSeconds: number;
    activeExamDurationSeconds: number;
    tkaRunningQuestions: TKAQuestion[];
    isExamCompleted: boolean;
  }>({
    studentId: '',
    activeExamPaket: null,
    activeExamMapel: null,
    currentQuestionIdx: 0,
    studentAnswers: {},
    raguChecks: {},
    examTimerSeconds: 3600,
    activeExamDurationSeconds: 3600,
    tkaRunningQuestions: [],
    isExamCompleted: false,
  });

  const activeTkaRoomStudent = useMemo(() => {
    if (activeUser.role === 'siswa' && activeUser.studentData) return activeUser.studentData;
    return tkaStudents.find((s) => s.id === selectedTestStudentId) || tkaStudents[0] || students[0];
  }, [activeUser, tkaStudents, selectedTestStudentId, students]);

  latestTkaRoomRef.current = {
    studentId: activeTkaRoomStudent?.id || '',
    activeExamPaket,
    activeExamMapel,
    currentQuestionIdx,
    studentAnswers,
    raguChecks,
    examTimerSeconds,
    activeExamDurationSeconds,
    tkaRunningQuestions,
    isExamCompleted,
  };

  const resumeFromTkaDraft = (draft: TKAExamRoomDraft) => {
    const baseQuestions = tkaQuestions.filter((q) => {
      if (q.jenisTka !== draft.paketName) return false;
      if (draft.mapelName && draft.mapelName !== 'all' && q.mapel !== draft.mapelName) return false;
      return true;
    });
    if (baseQuestions.length === 0) return;

    const restoredList = restoreQuestionsFromSnapshot(baseQuestions, draft.runningQuestionOrder);
    const safeIdx = Math.min(Math.max(0, draft.currentQuestionIdx || 0), Math.max(0, restoredList.length - 1));
    const safeTimer = draft.examTimerSeconds > 0 ? draft.examTimerSeconds : draft.activeExamDurationSeconds || 3600;

    setActiveExamPaket(draft.paketName);
    setActiveExamMapel(draft.mapelName || null);
    setConfirmFinishTkaExam(false);
    setStudentAnswers(draft.studentAnswers || {});
    setRaguChecks(draft.raguChecks || {});
    setCurrentQuestionIdx(safeIdx);
    setActiveExamDurationSeconds(draft.activeExamDurationSeconds || safeTimer);
    setExamTimerSeconds(safeTimer);
    setIsExamCompleted(false);
    setLastExamResult(null);
    setTkaRunningQuestions(restoredList);

    saveTkaRoomDraft(
      {
        ...draft,
        currentQuestionIdx: safeIdx,
        examTimerSeconds: safeTimer,
        isActiveSession: true,
        runningQuestionOrder: buildQuestionOrderSnapshot(restoredList),
      },
      { immediateSync: true }
    );

    const ansCount = countAnsweredQuestions(draft.studentAnswers || {});
    setTkaResumedNotice(
      `Melanjutkan terakhir dikerjakan: Soal #${safeIdx + 1} (${ansCount} jawaban tersimpan otomatis dipulihkan).`
    );
    showToast(`Melanjutkan TKA ${draft.paketName} di Soal #${safeIdx + 1}!`, 'success');
  };

  // Auto-save jawaban, ragu-ragu, & posisi soal TKA tiap perubahan
  useEffect(() => {
    if (subType !== 'tes-tka-siswa' || !activeExamPaket || isExamCompleted || !activeTkaRoomStudent?.id) return;
    saveTkaRoomDraft(
      {
        studentId: activeTkaRoomStudent.id,
        paketName: activeExamPaket,
        mapelName: activeExamMapel,
        currentQuestionIdx,
        studentAnswers,
        raguChecks,
        examTimerSeconds: latestTkaRoomRef.current.examTimerSeconds,
        activeExamDurationSeconds,
        runningQuestionOrder: buildQuestionOrderSnapshot(tkaRunningQuestions),
        isActiveSession: true,
        updatedAt: new Date().toISOString(),
      },
      { immediateSync: true }
    );
  }, [
    subType,
    activeExamPaket,
    activeExamMapel,
    isExamCompleted,
    activeTkaRoomStudent?.id,
    currentQuestionIdx,
    studentAnswers,
    raguChecks,
    tkaRunningQuestions,
  ]);

  // Auto-save timer TKA tiap detik (localStorage cepat, cloud sync periodik)
  useEffect(() => {
    if (
      subType !== 'tes-tka-siswa' ||
      !activeExamPaket ||
      isExamCompleted ||
      !activeTkaRoomStudent?.id ||
      examTimerSeconds <= 0
    ) {
      return;
    }
    saveTkaRoomDraft(
      {
        studentId: activeTkaRoomStudent.id,
        paketName: activeExamPaket,
        mapelName: activeExamMapel,
        currentQuestionIdx,
        studentAnswers,
        raguChecks,
        examTimerSeconds,
        activeExamDurationSeconds,
        runningQuestionOrder: buildQuestionOrderSnapshot(tkaRunningQuestions),
        isActiveSession: true,
        updatedAt: new Date().toISOString(),
      },
      { immediateSync: false }
    );
  }, [examTimerSeconds]);

  // Flush draft TKA saat logout / unmount / tutup browser
  useEffect(() => {
    const flushTkaDraft = () => {
      const snap = latestTkaRoomRef.current;
      if (!snap.activeExamPaket || snap.isExamCompleted || !snap.studentId) return;
      saveTkaRoomDraft(
        {
          studentId: snap.studentId,
          paketName: snap.activeExamPaket,
          mapelName: snap.activeExamMapel,
          currentQuestionIdx: snap.currentQuestionIdx,
          studentAnswers: snap.studentAnswers,
          raguChecks: snap.raguChecks,
          examTimerSeconds: snap.examTimerSeconds,
          activeExamDurationSeconds: snap.activeExamDurationSeconds,
          runningQuestionOrder: buildQuestionOrderSnapshot(snap.tkaRunningQuestions),
          isActiveSession: true,
          updatedAt: new Date().toISOString(),
        },
        { immediateSync: true }
      );
    };

    window.addEventListener('beforeunload', flushTkaDraft);
    window.addEventListener('pagehide', flushTkaDraft);
    return () => {
      flushTkaDraft();
      window.removeEventListener('beforeunload', flushTkaDraft);
      window.removeEventListener('pagehide', flushTkaDraft);
    };
  }, []);

  // Auto-resume otomatis saat masuk kembali ke ruang tes TKA siswa
  useEffect(() => {
    if (subType !== 'tes-tka-siswa') {
      autoResumedTkaRef.current = '';
      return;
    }
    if (activeExamPaket || isExamCompleted || !activeTkaRoomStudent?.id) return;
    if (autoResumedTkaRef.current === activeTkaRoomStudent.id) return;

    const draft = getLastActiveTkaRoomDraft(activeTkaRoomStudent.id);
    if (!draft || draft.examTimerSeconds <= 0) return;

    autoResumedTkaRef.current = activeTkaRoomStudent.id;
    resumeFromTkaDraft(draft);
  }, [subType, activeExamPaket, isExamCompleted, activeTkaRoomStudent?.id, tkaQuestions]);

  // Question Form State matching reference UI Image 1
  const [formPaket, setFormPaket] = useState<TKAJenis>('Simulasi 1');
  const [formMapel, setFormMapel] = useState('Bahasa Indonesia');
  const [formTargetKelas, setFormTargetKelas] = useState('Kelas 6B');
  const [formTpIndex, setFormTpIndex] = useState(0);
  const [formTipe, setFormTipe] = useState<'pg' | 'pg_kompleks' | 'menjodohkan' | 'isian' | 'uraian' | 'benar_salah'>('pg');
  const [formKesukaran, setFormKesukaran] = useState<'Mudah' | 'Sedang' | 'Sukar'>('Sedang');
  const [formKognitif, setFormKognitif] = useState('L2 (C3)');

  // Filter CP TKA according to formMapel
  const filteredTkaCps = useMemo(() => {
    const list = cpTpList.filter(
      (c) =>
        c.mapel.toLowerCase() === formMapel.toLowerCase() ||
        c.mapel.toLowerCase().includes(formMapel.toLowerCase()) ||
        formMapel.toLowerCase().includes(c.mapel.toLowerCase())
    );
    return list.length > 0 ? list : cpTpList;
  }, [cpTpList, formMapel]);

  // Selected CP & TP
  const [selectedCpId, setSelectedCpId] = useState<string>(cpTpList[0]?.id || 'cp_tka_01');

  // Change Mapel and sync matching CP & TP automatically
  const handleFormMapelChange = (newMapel: string) => {
    setFormMapel(newMapel);
    const matching = cpTpList.filter(
      (c) =>
        c.mapel.toLowerCase() === newMapel.toLowerCase() ||
        c.mapel.toLowerCase().includes(newMapel.toLowerCase()) ||
        newMapel.toLowerCase().includes(c.mapel.toLowerCase())
    );
    if (matching.length > 0) {
      setSelectedCpId(matching[0].id);
      setFormTpIndex(0);
    }
  };

  const activeCp = filteredTkaCps.find((c: any) => c.id === selectedCpId) || filteredTkaCps[0] || cpTpList[0];
  const activeTp = activeCp?.tpList && activeCp.tpList[formTpIndex] ? activeCp.tpList[formTpIndex] : activeCp?.tpList?.[0];

  // Question Content & Media (Support up to 2 side-by-side images & option images)
  const [formJudulTeks, setFormJudulTeks] = useState('');
  const [formPertanyaan, setFormPertanyaan] = useState('');
  const [formGambarUrl, setFormGambarUrl] = useState<string | null>(null);
  const [formGambarUrl2, setFormGambarUrl2] = useState<string | null>(null);
  const [formPosisiGambar, setFormPosisiGambar] = useState<PosisiGambar>('bawah_judul');
  const [formOpsiGambar, setFormOpsiGambar] = useState<Record<string, string>>({});
  const [formBobot, setFormBobot] = useState(10);
  const [showTkaFractionBuilder, setShowTkaFractionBuilder] = useState(false);
  const [formDurasiMenit, setFormDurasiMenit] = useState<number>(() =>
    getTKADurationMinutes(getStoredTKADurations(), 'Simulasi 1', 'Bahasa Indonesia')
  );
  const tkaPertanyaanTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setFormDurasiMenit(getTKADurationMinutes(tkaDurations, formPaket, formMapel));
  }, [formPaket, formMapel, tkaDurations]);

  const handleSaveTkaDuration = (
    paket: string,
    mapel: string | null,
    minutes: number,
    silent: boolean = false
  ) => {
    const safeMins = Math.max(1, Math.min(300, Math.round(Number(minutes) || 60)));
    const key = getTKADurationKey(paket, mapel);
    const next = { ...tkaDurations, [key]: safeMins };
    setTkaDurations(next);
    saveStoredTKADurations(next);
    pushAllDataToCloud(
      {
        tkaDurations: next,
        localStorageSnapshot: collectPersistentLocalBackup({ excludeLargeCollections: true }),
      },
      activeUser?.name || 'admin'
    ).catch(() => {});
    if (!silent) {
      showToast(
        `Waktu pengerjaan ${paket}${mapel && mapel !== 'all' ? ` (${mapel})` : ' (Semua Mapel)'} diatur menjadi ${safeMins} menit!`,
        'success'
      );
    }
  };

  const SAMPLE_TKA_DEFAULTS_META = [
    { jenisTka: 'Tryout TKA 1', mapel: 'Bahasa Indonesia', label: 'Tryout TKA 1 · Bahasa Indonesia (Contoh Bawaan)' },
    { jenisTka: 'Tryout TKA 2', mapel: 'Matematika', label: 'Tryout TKA 2 · Matematika (Contoh Bawaan)' },
    { jenisTka: 'Tryout TKA 3', mapel: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)', label: 'Tryout TKA 3 · IPAS (Contoh Bawaan)' },
  ];

  const tkaPackageBuckets = useMemo(() => {
    const map = new Map<string, { jenisTka: string; mapel: string; count: number }>();
    tkaQuestions.forEach((q) => {
      const jenis = q.jenisTka || 'Simulasi 1';
      const mapel = q.mapel || 'Bahasa Indonesia';
      const key = `${jenis}__${mapel}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { jenisTka: jenis, mapel, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      `${a.jenisTka} ${a.mapel}`.localeCompare(`${b.jenisTka} ${b.mapel}`, 'id')
    );
  }, [tkaQuestions]);

  const handleToggleTkaPackageActive = (
    jenis: string,
    mapel: string | null,
    forceNext?: boolean
  ) => {
    const isAllMapel = !mapel || mapel === 'all';
    const currentActive = isAllMapel
      ? tkaActivePackages[`${jenis}__ALL`] === true
      : isTKAPackageActive(tkaActivePackages, jenis, mapel);
    const nextState = typeof forceNext === 'boolean' ? forceNext : !currentActive;

    if (nextState) {
      const hasBankQuestions = tkaQuestions.some(
        (q) => (q.jenisTka || 'Simulasi 1') === jenis && (isAllMapel || q.mapel === mapel)
      );
      const isSampleBuiltIn = SAMPLE_TKA_DEFAULTS_META.some(
        (s) => s.jenisTka === jenis && (isAllMapel || s.mapel === mapel)
      );
      if (!hasBankQuestions && !isSampleBuiltIn) {
        showToast(
          `Belum ada butir soal untuk ${jenis}${!isAllMapel ? ` (${mapel})` : ''}. Tambahkan minimal 1 soal terlebih dahulu sebelum mengaktifkan paket ini.`,
          'error'
        );
        return;
      }
    }

    setTkaActivePackages((prev) => {
      const next = { ...prev };
      if (isAllMapel) {
        next[`${jenis}__ALL`] = nextState;
        Object.keys(next).forEach((k) => {
          if (k.startsWith(`${jenis}__`) && k !== `${jenis}__ALL`) {
            next[k] = nextState;
          }
        });
      } else {
        next[`${jenis}__${mapel}`] = nextState;
      }
      saveStoredTKAActivePackages(next);
      pushAllDataToCloud(
        {
          tkaActivePackages: next,
          localStorageSnapshot: collectPersistentLocalBackup({ excludeLargeCollections: true }),
        },
        activeUser?.name || 'admin'
      );
      return next;
    });

    showToast(
      nextState
        ? `Paket TKA "${jenis}${!isAllMapel ? ` • ${mapel}` : ' (Semua Mapel)'}" DIAKTIFKAN dan kini muncul di dashboard siswa!`
        : `Paket TKA "${jenis}${!isAllMapel ? ` • ${mapel}` : ' (Semua Mapel)'}" DINONAKTIFKAN (belum muncul di siswa).`,
      'success'
    );
  };

  const handleSetAllTkaPackagesActive = (nextState: boolean) => {
    if (tkaPackageBuckets.length === 0) {
      showToast('Belum ada paket soal TKA di Bank Soal untuk diatur.', 'error');
      return;
    }
    setTkaActivePackages((prev) => {
      const next = { ...prev };
      tkaPackageBuckets.forEach((b) => {
        next[`${b.jenisTka}__${b.mapel}`] = nextState;
      });
      saveStoredTKAActivePackages(next);
      pushAllDataToCloud(
        {
          tkaActivePackages: next,
          localStorageSnapshot: collectPersistentLocalBackup({ excludeLargeCollections: true }),
        },
        activeUser?.name || 'admin'
      );
      return next;
    });
    showToast(
      nextState
        ? `Semua ${tkaPackageBuckets.length} paket soal TKA di Bank Soal DIAKTIFKAN untuk siswa.`
        : `Semua ${tkaPackageBuckets.length} paket soal TKA di Bank Soal DINONAKTIFKAN.`,
      'success'
    );
  };

  // PG Options (A, B, C, D)
  const [pgOptionA, setPgOptionA] = useState('');
  const [pgOptionB, setPgOptionB] = useState('');
  const [pgOptionC, setPgOptionC] = useState('');
  const [pgOptionD, setPgOptionD] = useState('');
  const [pgKunci, setPgKunci] = useState<'A' | 'B' | 'C' | 'D'>('A');

  // Other types answers
  const [pgkChecks, setPgkChecks] = useState<Record<string, boolean>>({ A: false, B: false, C: false, D: false });
  const [benarSalahKunci, setBenarSalahKunci] = useState<'Benar' | 'Salah'>('Benar');
  const [formBenarSalahItems, setFormBenarSalahItems] = useState<BenarSalahItem[]>([
    { id: 'bs_1', pernyataan: '', kunci: 'Benar' },
    { id: 'bs_2', pernyataan: '', kunci: 'Salah' },
    { id: 'bs_3', pernyataan: '', kunci: 'Benar' },
  ]);
  const [isianKunci, setIsianKunci] = useState('');
  const [uraianKunci, setUraianKunci] = useState('');
  const [menjodohkanKunci, setMenjodohkanKunci] = useState('');
  const [formMenjodohkanData, setFormMenjodohkanData] = useState<MenjodohkanData>({
    kolomKiri: ['', '', ''],
    kolomKanan: ['', '', ''],
    pasangan: { '1': 'A', '2': 'B', '3': 'C' },
  });

  // TKA CP & TP Editing State
  const [editingCpId, setEditingCpId] = useState<string | null>(null);
  const [editCpJudul, setEditCpJudul] = useState('');
  const [editCpDesc, setEditCpDesc] = useState('');
  const [editingTpId, setEditingTpId] = useState<string | null>(null);
  const [editTpJudul, setEditTpJudul] = useState('');
  const [addingTpForCpId, setAddingTpForCpId] = useState<string | null>(null);
  const [newTpJudulForCp, setNewTpJudulForCp] = useState('');

  // CBT Player Simulation for TKA
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [simJenis, setSimJenis] = useState<TKAJenis>('Simulasi 1');
  const [simQuestionIdx, setSimQuestionIdx] = useState(0);
  const [simAnswers, setSimAnswers] = useState<Record<string, any>>({});
  const [simTimeLeft, setSimTimeLeft] = useState(3600);
  const [simResult, setSimResult] = useState<{ score: number; max: number; details: any[] } | null>(null);
  const [tkaDownloadMenuPos, setTkaDownloadMenuPos] = useState<'header' | 'list' | null>(null);

  const handleDownloadTkaQuestions = (
    mode: 'word_only' | 'word_key' | 'excel',
    useFilteredScope: boolean = true
  ) => {
    setTkaDownloadMenuPos(null);
    const listToExport = useFilteredScope
      ? filteredTkaQuestions
      : tkaQuestions.filter((q) => q.jenisTka === formPaket && q.mapel === formMapel);

    const activeList = listToExport.length > 0 ? listToExport : filteredTkaQuestions;
    if (!activeList || activeList.length === 0) {
      showToast('Belum ada butir soal TKA pada filter/paket yang dipilih untuk diunduh.', 'error');
      return;
    }

    const paketLabel =
      filterJenisTka !== 'all'
        ? filterJenisTka
        : useFilteredScope
        ? 'Semua Paket TKA'
        : formPaket;
    const mapelLabel =
      filterMapelTka !== 'all'
        ? filterMapelTka
        : useFilteredScope
        ? 'Semua Mapel TKA'
        : formMapel;
    const fileBase = `Soal_TKA_${paketLabel}_${mapelLabel}`;

    if (mode === 'excel') {
      exportTkaQuestionsToExcel(activeList, {
        title: `Bank Soal TKA - ${paketLabel}`,
        paket: paketLabel,
        mapel: mapelLabel,
        kelas: 'Kelas 6 SD',
        fileNameBase: fileBase,
      });
      showToast(`Berhasil mengunduh ${activeList.length} soal TKA ke Excel (.XLSX)!`, 'success');
      return;
    }

    const withKey = mode === 'word_key';
    exportQuestionsToWord(activeList, {
      title: `Naskah Soal Tes Kemampuan Akademik (TKA) - ${paketLabel}`,
      subtitle: `Mata Pelajaran: ${mapelLabel}`,
      paket: paketLabel,
      mapel: mapelLabel,
      kelas: 'Kelas 6 SD',
      includeAnswerKey: withKey,
      fileNameBase: fileBase,
    });
    showToast(
      `Berhasil mengunduh ${activeList.length} soal TKA (.DOC${withKey ? ' + Kunci Jawaban' : ''})!`,
      'success'
    );
  };

  const simulationQuestions = tkaQuestions.filter((q) => q.jenisTka === simJenis);

  // Countdown timer for Bank Soal TKA CBT Simulation (auto-submit)
  useEffect(() => {
    if (!isSimulationRunning) return;
    const interval = setInterval(() => {
      setSimTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          showToast('Waktu simulasi TKA habis! Jawaban Anda otomatis dikumpulkan.', 'error');
          setTimeout(() => handleSubmitSimRef.current(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSimulationRunning]);

  const [clearTkaModalContext, setClearTkaModalContext] = useState<{
    source: 'analisis' | 'rekap';
    targetPaket: string;
  } | null>(null);

  const handleClearSubmissions = (
    source: 'analisis' | 'rekap' = 'rekap',
    targetPaket: string = 'all'
  ) => {
    setClearTkaModalContext({ source, targetPaket });
  };

  const executeClearTkaData = (scope: 'paket' | 'all') => {
    const targetPaket = clearTkaModalContext?.targetPaket || 'all';
    if (scope === 'paket' && targetPaket !== 'all') {
      const remaining = clearTKAResultsFromStorage({ scope: 'paket', targetPaket });
      deleteTkaSubmissionsByPaketInFirestore(targetPaket).catch(() => {});
      syncAllLocalToCloud(activeUser.name || 'admin').catch(() => {});

      setTkaSubmissions(remaining);
      setClearTkaModalContext(null);
      showToast(`Data TKA untuk paket "${targetPaket}" berhasil dikosongkan!`, 'success');
      return;
    }

    clearTKAResultsFromStorage({ scope: 'all' });
    clearTkaSubmissionsInFirestore().catch(() => {});
    syncAllLocalToCloud(activeUser.name || 'admin').catch(() => {});

    setTkaSubmissions([]);
    setClearTkaModalContext(null);
    showToast('Seluruh data Analisis & Rekap Hasil TKA telah dikosongkan!', 'success');
  };

  const handleRefreshTkaFromCloud = async () => {
    if (isSyncingTkaCloud) return;
    setIsSyncingTkaCloud(true);
    try {
      await flushPendingTkaSubmissionsToFirestore().catch(() => 0);
      const rec = await reconcileTkaFromCloudBackup().catch(() => ({
        recoveredCount: 0,
        syncedCount: 0,
      }));
      const freshSubs = await fetchTkaSubmissionsFromFirestore();
      const pendingSubs = getPendingTkaSubmissions();
      const merged = mergeTkaSubmissionLists(freshSubs, pendingSubs);
      saveStoredTKASubmissions(merged);
      setTkaSubmissions(merged);
      if (rec.recoveredCount > 0) {
        showToast(
          `Sinkronisasi berhasil! ${rec.recoveredCount} hasil ujian siswa dipulihkan & ${merged.length} data TKA dimuat.`,
          'success'
        );
      } else {
        showToast(
          `Data TKA berhasil disegarkan dari Cloud (${merged.length} data peserta tersinkron).`,
          'success'
        );
      }
    } catch {
      showToast('Gagal menyegarkan data TKA dari Cloud. Periksa koneksi internet Anda.', 'error');
    } finally {
      setIsSyncingTkaCloud(false);
    }
  };

  const handleSeedSimulatedSubmissions = async () => {
    if (isSeedingTka) return;
    if (tkaStudents.length === 0) {
      showToast('Belum ada data peserta didik Kelas 6 di menu Data Siswa.', 'error');
      return;
    }
    setIsSeedingTka(true);
    try {
      const paketToSeed = hasilPaketTka && hasilPaketTka !== 'all' ? hasilPaketTka : 'Simulasi 1';
      const nowIso = new Date().toISOString();
      const seeded: TKASubmissionItem[] = tkaStudents.map((s) => {
        const hashString = `${s.id}_${s.nisn}_${paketToSeed}`;
        let h = 0;
        for (let i = 0; i < hashString.length; i++) {
          h = (h << 5) - h + hashString.charCodeAt(i);
          h |= 0;
        }
        const base = Math.abs(h);
        const skorIndo = 72 + (base % 26);
        const skorMtk = 66 + ((base >> 2) % 32);
        const skorIpas = 70 + ((base >> 4) % 28);
        const skorInggris = 68 + ((base >> 6) % 30);
        const skorKka = 74 + ((base >> 8) % 24);
        const skorTotal = Math.round((skorIndo + skorMtk + skorIpas + skorInggris + skorKka) / 5);

        const predikat: 'A' | 'B' | 'C' | 'D' =
          skorTotal >= 88 ? 'A' : skorTotal >= 78 ? 'B' : skorTotal >= 68 ? 'C' : 'D';
        const status: 'Tuntas' | 'Remedial' = skorTotal >= 75 ? 'Tuntas' : 'Remedial';

        const answers: Record<string, any> = {};
        tkaQuestions
          .filter((q) => q.jenisTka === paketToSeed)
          .forEach((q, qIdx) => {
            const isCorrect = (base + qIdx * 7) % 100 < skorTotal;
            answers[q.id] = isCorrect ? q.kunciJawaban : 'Jawaban lain';
          });

        return {
          id: `sub_${s.id}_${paketToSeed.replace(/\s+/g, '_')}`,
          studentId: s.id,
          studentName: s.nama,
          nisn: s.nisn,
          kelas: s.kelas,
          fotoUrl: sanitizeSubmissionFotoUrl(s.fotoUrl),
          paket: paketToSeed,
          paketDasar: paketToSeed,
          completedMapels: [
            'Bahasa Indonesia',
            'Matematika',
            'IPAS',
            'Bahasa Inggris',
            'Koding dan Kecerdasan Artifisial (KKA)',
          ],
          answers,
          scoresPerMapel: {
            'Bahasa Indonesia': skorIndo,
            'Matematika': skorMtk,
            'IPAS': skorIpas,
            'Bahasa Inggris': skorInggris,
            'Koding dan Kecerdasan Artifisial (KKA)': skorKka,
          },
          skorTotal,
          predikat,
          status,
          tanggalUjian: '04 November 2026',
          durasiPengerjaan: '45 Menit',
          updatedAt: nowIso,
        };
      });

      const otherExisting = tkaSubmissions.filter((s) => extractBaseTkaPaket(s.paket) !== paketToSeed);
      const mergedAll = [...seeded, ...otherExisting];
      saveStoredTKASubmissions(mergedAll);
      setTkaSubmissions(mergedAll);

      const cloudOk = await saveTkaSubmissionsBatchToFirestore(seeded);
      if (cloudOk) {
        showToast(
          `Data simulasi pengerjaan (${seeded.length} siswa) untuk ${paketToSeed} berhasil dimuat & tersinkron ke Cloud!`,
          'success'
        );
      } else {
        showToast(
          `Data simulasi (${seeded.length} siswa) dimuat secara lokal, namun sinkronisasi Cloud terkendala jaringan.`,
          'error'
        );
      }
    } finally {
      setIsSeedingTka(false);
    }
  };

  const handleInsertTkaFraction = (numerator: string, denominator: string, whole?: string) => {
    const el = tkaPertanyaanTextareaRef.current;
    const start = el?.selectionStart ?? formPertanyaan.length;
    const end = el?.selectionEnd ?? formPertanyaan.length;
    const { nextValue, nextCursor } = insertFractionAtSelection(
      formPertanyaan,
      start,
      end,
      numerator,
      denominator,
      whole
    );
    setFormPertanyaan(nextValue);
    setTimeout(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    }, 0);
  };

  const handleConvertAllTkaFractions = () => {
    setFormPertanyaan(convertPlainFractionsToTags(formPertanyaan));
    showToast('Semua pecahan angka pada soal diformat menjadi pecahan susun!', 'success');
  };

  const handleInsertTkaFractionToOption = (
    optKey: 'A' | 'B' | 'C' | 'D',
    numerator: string,
    denominator: string,
    whole?: string
  ) => {
    const payload = whole ? `${whole} ${numerator}/${denominator}` : `${numerator}/${denominator}`;
    const tag = `[pecahan]${payload}[/pecahan]`;
    const appendVal = (prev: string) => (prev ? `${prev} ${tag}` : tag);
    if (optKey === 'A') setPgOptionA(appendVal);
    else if (optKey === 'B') setPgOptionB(appendVal);
    else if (optKey === 'C') setPgOptionC(appendVal);
    else setPgOptionD(appendVal);
    showToast(`Pecahan susun disisipkan ke Opsi ${optKey}!`, 'success');
  };

  const handleInsertTkaSymbol = (symbol: string) => {
    const el = tkaPertanyaanTextareaRef.current;
    const start = el?.selectionStart ?? formPertanyaan.length;
    const end = el?.selectionEnd ?? formPertanyaan.length;
    const nextValue = formPertanyaan.slice(0, start) + symbol + formPertanyaan.slice(end);
    const nextCursor = start + (symbol === '\\sqrt{}' ? symbol.length - 1 : symbol.length);
    setFormPertanyaan(nextValue);
    setTimeout(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    }, 0);
  };

  const handleInsertTkaSymbolToOption = (optKey: 'A' | 'B' | 'C' | 'D', symbol: string) => {
    const appendSym = (prev: string) => `${prev}${symbol}`;
    if (optKey === 'A') setPgOptionA(appendSym);
    else if (optKey === 'B') setPgOptionB(appendSym);
    else if (optKey === 'C') setPgOptionC(appendSym);
    else setPgOptionD(appendSym);
    showToast(`Simbol "${symbol.trim()}" disisipkan ke Opsi ${optKey}!`, 'success');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressQuestionImage(file, { maxWidth: 960, maxHeight: 720, quality: 0.78 });
      setFormGambarUrl(compressed);
      showToast('Gambar 1 soal berhasil dimuat & dioptimalkan!', 'success');
    } catch {
      showToast('Gagal memproses gambar 1 soal.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleImageUpload2 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressQuestionImage(file, { maxWidth: 960, maxHeight: 720, quality: 0.78 });
      setFormGambarUrl2(compressed);
      showToast('Gambar 2 soal berhasil dimuat & dioptimalkan!', 'success');
    } catch {
      showToast('Gagal memproses gambar 2 soal.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleOptionImageUpload = async (key: string, file: File) => {
    try {
      const compressed = await compressQuestionImage(file, { maxWidth: 640, maxHeight: 480, quality: 0.78 });
      setFormOpsiGambar((prev) => ({
        ...prev,
        [key]: compressed,
      }));
      showToast(`Gambar untuk opsi ${key} berhasil ditambahkan!`, 'success');
    } catch {
      showToast(`Gagal memproses gambar untuk opsi ${key}.`, 'error');
    }
  };

  const handleRemoveOptionImage = (key: string) => {
    setFormOpsiGambar((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleResetForm = () => {
    setEditingTkaQuestionId(null);
    setFormJudulTeks('');
    setFormPertanyaan('');
    setFormGambarUrl(null);
    setFormGambarUrl2(null);
    setFormPosisiGambar('bawah_judul');
    setFormOpsiGambar({});
    setFormBobot(10);
    setPgOptionA('');
    setPgOptionB('');
    setPgOptionC('');
    setPgOptionD('');
    setPgKunci('A');
    setPgkChecks({ A: false, B: false, C: false, D: false });
    setBenarSalahKunci('Benar');
    setFormBenarSalahItems([
      { id: 'bs_1', pernyataan: '', kunci: 'Benar' },
      { id: 'bs_2', pernyataan: '', kunci: 'Salah' },
      { id: 'bs_3', pernyataan: '', kunci: 'Benar' },
    ]);
    setIsianKunci('');
    setUraianKunci('');
    setMenjodohkanKunci('');
    setFormMenjodohkanData({
      kolomKiri: ['', '', ''],
      kolomKanan: ['', '', ''],
      pasangan: { '1': 'A', '2': 'B', '3': 'C' },
    });
  };

  const handleEditTkaQuestion = (q: TKAQuestion) => {
    setEditingTkaQuestionId(q.id);
    setFormPaket(q.jenisTka);
    setFormMapel(q.mapel);
    setFormTipe(q.tipe);
    setFormJudulTeks(q.judulTeks || '');
    setFormPertanyaan(q.pertanyaan);
    setFormBobot(q.bobot || 10);
    setFormGambarUrl(q.gambarUrl || null);
    setFormGambarUrl2(q.gambarUrl2 || null);
    setFormPosisiGambar(q.posisiGambar || 'bawah_judul');
    setFormOpsiGambar(q.opsiGambar || {});

    // Options
    setPgOptionA(q.opsi?.[0] || '');
    setPgOptionB(q.opsi?.[1] || '');
    setPgOptionC(q.opsi?.[2] || '');
    setPgOptionD(q.opsi?.[3] || '');

    // Kunci
    if (q.tipe === 'pg') {
      const k = typeof q.kunciJawaban === 'string' && ['A', 'B', 'C', 'D'].includes(q.kunciJawaban)
        ? (q.kunciJawaban as 'A' | 'B' | 'C' | 'D')
        : 'A';
      setPgKunci(k);
    } else if (q.tipe === 'pg_kompleks') {
      const keys = Array.isArray(q.kunciJawaban) ? q.kunciJawaban : [String(q.kunciJawaban)];
      setPgkChecks({
        A: keys.includes('A') || (Boolean(q.opsi?.[0]) && keys.includes(q.opsi![0])),
        B: keys.includes('B') || (Boolean(q.opsi?.[1]) && keys.includes(q.opsi![1])),
        C: keys.includes('C') || (Boolean(q.opsi?.[2]) && keys.includes(q.opsi![2])),
        D: keys.includes('D') || (Boolean(q.opsi?.[3]) && keys.includes(q.opsi![3])),
      });
    } else if (q.tipe === 'benar_salah') {
      const resolved = resolveBenarSalahItems(q);
      setBenarSalahKunci(q.kunciJawaban === 'Salah' ? 'Salah' : 'Benar');
      setFormBenarSalahItems(
        resolved.length > 0
          ? resolved
          : [
              { id: 'bs_1', pernyataan: '', kunci: 'Benar' },
              { id: 'bs_2', pernyataan: '', kunci: 'Salah' },
            ]
      );
    } else if (q.tipe === 'isian') {
      setIsianKunci(String(q.kunciJawaban || ''));
    } else if (q.tipe === 'uraian') {
      setUraianKunci(String(q.kunciJawaban || ''));
    } else if (q.tipe === 'menjodohkan') {
      const resolved = resolveMenjodohkanData(q);
      setMenjodohkanKunci(String(q.kunciJawaban || ''));
      setFormMenjodohkanData(
        resolved || {
          kolomKiri: ['', '', ''],
          kolomKanan: ['', '', ''],
          pasangan: { '1': 'A', '2': 'B', '3': 'C' },
        }
      );
    }

    window.scrollTo({ top: 380, behavior: 'smooth' });
    showToast(`Mode edit aktif untuk butir soal #${q.id}. Perbarui data lalu klik 'Simpan Perubahan'.`, 'success');
  };

  // Submit or update TKA question (up to 50 questions per paket + mapel)
  const handleSaveTkaQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPertanyaan.trim()) {
      showToast('Harap tuliskan pertanyaan butir soal!', 'error');
      return;
    }

    const currentBucketCount = tkaQuestions.filter(
      (q) => q.jenisTka === formPaket && q.mapel === formMapel
    ).length;

    if (!editingTkaQuestionId && currentBucketCount >= MAX_QUESTIONS_PER_PACKAGE) {
      showToast(
        `Paket ${formPaket} • ${formMapel} sudah mencapai batas maksimal ${MAX_QUESTIONS_PER_PACKAGE} soal.`,
        'error'
      );
      return;
    }

    let parsedOpsi: string[] | undefined = undefined;
    let finalKunci: any = '';
    let savedBenarSalahItems: BenarSalahItem[] | undefined = undefined;
    let savedMenjodohkanData: MenjodohkanData | undefined = undefined;

    if (formTipe === 'pg') {
      if (!pgOptionA && !pgOptionB && !formOpsiGambar['A'] && !formOpsiGambar['B']) {
        showToast('Harap isi minimal opsi A dan B (teks atau gambar)!', 'error');
        return;
      }
      parsedOpsi = [pgOptionA, pgOptionB, pgOptionC, pgOptionD].filter((v, idx) => {
        const key = ['A', 'B', 'C', 'D'][idx];
        return Boolean(v) || Boolean(formOpsiGambar[key]);
      });
      finalKunci = pgKunci;
    } else if (formTipe === 'pg_kompleks') {
      parsedOpsi = [pgOptionA, pgOptionB, pgOptionC, pgOptionD].filter((v, idx) => {
        const key = ['A', 'B', 'C', 'D'][idx];
        return Boolean(v) || Boolean(formOpsiGambar[key]);
      });
      const selected = Object.keys(pgkChecks).filter((k) => pgkChecks[k]);
      if (selected.length === 0) {
        showToast('Pilih minimal satu kunci benar untuk PG Kompleks!', 'error');
        return;
      }
      finalKunci = selected;
    } else if (formTipe === 'benar_salah') {
      const cleanedItems = formBenarSalahItems
        .map((it, idx) => ({
          id: it.id || `bs_${idx + 1}`,
          pernyataan: it.pernyataan.trim(),
          kunci: (it.kunci === 'Salah' ? 'Salah' : 'Benar') as 'Benar' | 'Salah',
        }))
        .filter((it) => it.pernyataan.length > 0);
      if (cleanedItems.length === 0) {
        showToast('Harap isi minimal 1 baris pernyataan Benar/Salah pada tabel!', 'error');
        return;
      }
      savedBenarSalahItems = cleanedItems;
      parsedOpsi = cleanedItems.map((it) => it.pernyataan);
      finalKunci = formatBenarSalahKeySummary(cleanedItems);
    } else if (formTipe === 'isian') {
      if (!isianKunci.trim()) {
        showToast('Harap tuliskan kunci jawaban isian singkat!', 'error');
        return;
      }
      finalKunci = isianKunci.trim();
    } else if (formTipe === 'uraian') {
      finalKunci = uraianKunci.trim() || 'Rubrik penilaian uraian';
    } else if (formTipe === 'menjodohkan') {
      const cleanKiri = formMenjodohkanData.kolomKiri.map((v) => v.trim()).filter(Boolean);
      const cleanKanan = formMenjodohkanData.kolomKanan.map((v) => v.trim()).filter(Boolean);
      if (cleanKiri.length === 0 || cleanKanan.length === 0) {
        showToast('Harap isi pernyataan di Kolom Kiri dan pilihan jawaban di Kolom Kanan!', 'error');
        return;
      }
      const cleanPasangan: Record<string, string> = {};
      for (let i = 0; i < cleanKiri.length; i++) {
        const numKey = String(i + 1);
        const mapped = formMenjodohkanData.pasangan[numKey] || '';
        if (!mapped) {
          showToast(`Harap pilih kunci huruf pasangan untuk Kolom Kiri nomor ${numKey}!`, 'error');
          return;
        }
        cleanPasangan[numKey] = mapped;
      }
      savedMenjodohkanData = {
        kolomKiri: cleanKiri,
        kolomKanan: cleanKanan,
        pasangan: cleanPasangan,
      };
      finalKunci = formatMenjodohkanKeySummary(savedMenjodohkanData);
    }

    const formattedPertanyaan = formPertanyaan.replace(/^\n+|\n+$/g, '');
    const cleanJudulTeks = formJudulTeks.trim() || undefined;

    const existingSavedDuration = getTKADurationMinutes(tkaDurations, formPaket, formMapel);

    if (editingTkaQuestionId) {
      const updated = tkaQuestions.map((q) => {
        if (q.id === editingTkaQuestionId) {
          return {
            ...q,
            jenisTka: formPaket,
            mapel: formMapel,
            cpId: activeCp?.id || q.cpId || 'cp_tka_01',
            tpId: activeTp?.id || q.tpId || 'tp_01',
            tipe: formTipe,
            judulTeks: cleanJudulTeks,
            pertanyaan: formattedPertanyaan,
            opsi: parsedOpsi,
            benarSalahItems: savedBenarSalahItems,
            menjodohkanData: savedMenjodohkanData,
            opsiGambar: Object.keys(formOpsiGambar).length > 0 ? formOpsiGambar : undefined,
            kunciJawaban: finalKunci,
            bobot: Number(formBobot) || 10,
            gambarUrl: formGambarUrl || undefined,
            gambarUrl2: formGambarUrl2 || undefined,
            posisiGambar: formPosisiGambar,
            pembahasan: `Level: ${formKesukaran} (${formKognitif}). Target: ${formTargetKelas}. CP: ${activeCp?.judulCp || '-'}. TP: ${activeTp?.judulTp || '-'}`,
          };
        }
        return q;
      });
      const editedIdx = updated.findIndex((q) => q.id === editingTkaQuestionId);
      const editedItem = editedIdx >= 0 ? updated[editedIdx] : undefined;
      setTkaQuestions(updated);
      saveStoredTKAQuestions(updated);
      if (existingSavedDuration !== formDurasiMenit) {
        handleSaveTkaDuration(formPaket, formMapel, formDurasiMenit, true);
      }
      if (filterJenisTka !== 'all' && filterJenisTka !== formPaket) {
        setFilterJenisTka(formPaket);
      }
      if (filterMapelTka !== 'all' && filterMapelTka !== formMapel) {
        setFilterMapelTka(formMapel);
      }
      handleResetForm();

      const cloudOk = editedItem
        ? await saveSingleTkaQuestionToFirestore(editedItem, editedIdx)
        : true;
      if (!cloudOk) {
        showToast('Perubahan tersimpan lokal, tetapi gagal sinkron ke cloud Firestore.', 'error');
        return;
      }
      showToast('Perubahan butir soal TKA & waktu pengerjaan berhasil diperbarui!', 'success');
    } else {
      const newQuestion: TKAQuestion = {
        id: `tka_q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        jenisTka: formPaket,
        mapel: formMapel,
        cpId: activeCp?.id || 'cp_tka_01',
        tpId: activeTp?.id || 'tp_01',
        tipe: formTipe,
        judulTeks: cleanJudulTeks,
        pertanyaan: formattedPertanyaan,
        opsi: parsedOpsi,
        benarSalahItems: savedBenarSalahItems,
        menjodohkanData: savedMenjodohkanData,
        opsiGambar: Object.keys(formOpsiGambar).length > 0 ? formOpsiGambar : undefined,
        kunciJawaban: finalKunci,
        bobot: Number(formBobot) || 10,
        gambarUrl: formGambarUrl || undefined,
        gambarUrl2: formGambarUrl2 || undefined,
        posisiGambar: formPosisiGambar,
        pembahasan: `Level: ${formKesukaran} (${formKognitif}). Target: ${formTargetKelas}. CP: ${activeCp?.judulCp || '-'}. TP: ${activeTp?.judulTp || '-'}`,
      };

      const updated = [...tkaQuestions, newQuestion];
      const nextBucketCount = updated.filter(
        (q) => q.jenisTka === formPaket && q.mapel === formMapel
      ).length;
      setTkaQuestions(updated);
      saveStoredTKAQuestions(updated);
      if (existingSavedDuration !== formDurasiMenit) {
        handleSaveTkaDuration(formPaket, formMapel, formDurasiMenit, true);
      }
      if (filterJenisTka !== 'all' && filterJenisTka !== formPaket) {
        setFilterJenisTka(formPaket);
      }
      if (filterMapelTka !== 'all' && filterMapelTka !== formMapel) {
        setFilterMapelTka(formMapel);
      }
      handleResetForm();

      const cloudOk = await saveSingleTkaQuestionToFirestore(newQuestion, updated.length - 1);
      if (!cloudOk) {
        showToast('Soal tersimpan lokal, tetapi gagal sinkron ke cloud Firestore.', 'error');
        return;
      }

      showToast(
        `Soal #${nextBucketCount}/${MAX_QUESTIONS_PER_PACKAGE} berhasil disimpan ke ${formPaket} • ${formMapel} (Waktu: ${formDurasiMenit} Menit)!`,
        'success'
      );
    }
  };

  const handleDeleteTkaQuestion = (id: string) => {
    const updated = tkaQuestions.filter((q) => q.id !== id);
    setTkaQuestions(updated);
    saveStoredTKAQuestions(updated);
    deleteTkaQuestionFromFirestore(id).catch(() => {});
    if (editingTkaQuestionId === id) {
      handleResetForm();
    }
    setConfirmDeleteTkaQId(null);
    showToast('Soal TKA berhasil dihapus', 'success');
  };

  const handleImportDocxTka = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const existingCount = tkaQuestions.filter(
        (q) => q.jenisTka === formPaket && q.mapel === formMapel
      ).length;
      const remainingSlots = Math.max(0, MAX_QUESTIONS_PER_PACKAGE - existingCount);
      if (remainingSlots <= 0) {
        showToast(
          `Paket ${formPaket} • ${formMapel} sudah mencapai batas maksimal ${MAX_QUESTIONS_PER_PACKAGE} soal.`,
          'error'
        );
        return;
      }

      showToast('Membaca berkas DOCX soal TKA...', 'success');
      const res = await parseQuestionsFromDocx(file);
      if (!res.success || res.questions.length === 0) {
        showToast(res.error || 'Gagal membaca butir soal dari berkas Word (.docx)', 'error');
        return;
      }
      const convertedAll = convertToTkaQuestions(res.questions, formMapel, formPaket);
      const accepted = convertedAll.slice(0, remainingSlots);
      const startIndex = tkaQuestions.length;
      const updated = [...tkaQuestions, ...accepted];
      setTkaQuestions(updated);
      saveStoredTKAQuestions(updated);
      if (filterJenisTka !== 'all' && filterJenisTka !== formPaket) {
        setFilterJenisTka(formPaket);
      }
      if (filterMapelTka !== 'all' && filterMapelTka !== formMapel) {
        setFilterMapelTka(formMapel);
      }

      const cloudOk = await saveTkaQuestionsBatchToFirestore(accepted, startIndex);
      const skippedCount = convertedAll.length - accepted.length;
      if (!cloudOk) {
        showToast(
          `Berhasil mengimpor ${accepted.length} soal secara lokal, tetapi gagal sinkron ke cloud.`,
          'error'
        );
      } else if (skippedCount > 0) {
        showToast(
          `Berhasil mengimpor ${accepted.length} soal TKA (mencapai batas ${MAX_QUESTIONS_PER_PACKAGE} soal/paket; ${skippedCount} soal berlebih dilewati).`,
          'success'
        );
      } else {
        showToast(
          `Berhasil mengimpor ${accepted.length} soal TKA (${existingCount + accepted.length}/${MAX_QUESTIONS_PER_PACKAGE}) ke ${formPaket} • ${formMapel}!`,
          'success'
        );
      }
    } catch (err: any) {
      showToast('Gagal memproses berkas DOCX: ' + (err?.message || ''), 'error');
    } finally {
      if (docxTkaInputRef.current) {
        docxTkaInputRef.current.value = '';
      }
    }
  };

  // Quick Add CP
  const handleSaveQuickCp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCpKode || !quickCpJudul) {
      showToast('Kode CP dan Judul CP wajib diisi!', 'error');
      return;
    }

    const newCp: TKACpTp = {
      id: `cp_tka_${Date.now()}`,
      kodeCp: quickCpKode,
      judulCp: quickCpJudul,
      deskripsiCp: quickCpDesc || quickCpJudul,
      mapel: quickCpMapel,
      tpList: [
        {
          id: `tp_${Date.now()}`,
          kodeTp: `${quickCpKode}-TP1`,
          judulTp: `Tujuan Pembelajaran 1 untuk ${quickCpJudul}`,
        },
      ],
    };

    const updated = [...cpTpList, newCp];
    setCpTpList(updated);
    saveStoredTKACpTp(updated);
    setSelectedCpId(newCp.id);
    setShowAddCpModal(false);
    setQuickCpKode('');
    setQuickCpJudul('');
    setQuickCpDesc('');
    showToast('Capaian Pembelajaran (CP) TKA berhasil ditambahkan!', 'success');
  };

  // Quick Add TP
  const handleSaveQuickTp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTpJudul) {
      showToast('Judul TP wajib diisi!', 'error');
      return;
    }

    const targetCp = activeCp;
    if (!targetCp) return;

    const newTp = {
      id: `tp_${Date.now()}`,
      kodeTp: quickTpKode || `TP${(targetCp.tpList?.length || 0) + 1}`,
      judulTp: quickTpJudul,
    };

    const updated = cpTpList.map((cp) => {
      if (cp.id === targetCp.id) {
        return {
          ...cp,
          tpList: [...(cp.tpList || []), newTp],
        };
      }
      return cp;
    });

    setCpTpList(updated);
    saveStoredTKACpTp(updated);
    setShowAddTpModal(false);
    setQuickTpKode('');
    setQuickTpJudul('');
    setFormTpIndex((targetCp.tpList?.length || 0));
    showToast('Tujuan Pembelajaran (TP) TKA berhasil ditambahkan!', 'success');
  };

  // Import Soal TKA Excel (mendukung hingga 50 soal per paket & mapel)
  const handleImportTkaQuestions = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        const bucketCounts = new Map<string, number>();
        tkaQuestions.forEach((q) => {
          const bk = `${q.jenisTka}__${q.mapel}`;
          bucketCounts.set(bk, (bucketCounts.get(bk) || 0) + 1);
        });

        const importedQuestions: TKAQuestion[] = [];
        let skippedOverLimit = 0;

        data.forEach((row, idx) => {
          const jenis = (row['Jenis TKA'] || row['jenisTka'] || formPaket) as TKAJenis;
          const mapel = row['Mata Pelajaran'] || row['mapel'] || formMapel;
          const tipe = (row['Tipe Soal'] || row['tipe'] || 'isian') as any;
          const judulRaw = String(row['Judul Teks'] || row['Judul'] || row['judulTeks'] || '').trim();
          const pertanyaan = row['Pertanyaan'] || row['pertanyaan'];
          const kunci = row['Kunci Jawaban'] || row['kunciJawaban'];
          const bobot = Number(row['Bobot'] || row['bobot']) || 10;
          const pembahasan = row['Pembahasan'] || row['pembahasan'] || '';
          const opsiRaw = row['Opsi Pilihan'] || row['opsi'];
          const posisiRaw = String(row['Posisi Gambar'] || row['posisiGambar'] || '').toLowerCase();
          const posisiGambar: PosisiGambar = /bawah[\s_]*pertanyaan/.test(posisiRaw)
            ? 'bawah_pertanyaan'
            : /kanan[\s_]*teks/.test(posisiRaw)
            ? 'kanan_teks'
            : 'bawah_judul';

          if (pertanyaan && kunci) {
            const bk = `${jenis}__${mapel}`;
            const curCount = bucketCounts.get(bk) || 0;
            if (curCount >= MAX_QUESTIONS_PER_PACKAGE) {
              skippedOverLimit++;
              return;
            }
            bucketCounts.set(bk, curCount + 1);

            let opsiParsed: string[] | undefined = undefined;
            if (opsiRaw && typeof opsiRaw === 'string') {
              opsiParsed = opsiRaw.split(',').map((o: string) => o.trim());
            }

            importedQuestions.push({
              id: `tka_imp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
              jenisTka: jenis,
              mapel,
              tipe,
              judulTeks: judulRaw || undefined,
              pertanyaan,
              opsi: opsiParsed,
              kunciJawaban: kunci,
              bobot,
              posisiGambar,
              pembahasan,
              cpId: cpTpList[0]?.id || 'cp_tka_01',
              tpId: cpTpList[0]?.tpList?.[0]?.id || 'tp_01',
            });
          }
        });

        if (importedQuestions.length > 0) {
          const startIndex = tkaQuestions.length;
          const updated = [...tkaQuestions, ...importedQuestions];
          setTkaQuestions(updated);
          saveStoredTKAQuestions(updated);
          setFilterJenisTka('all');
          setFilterMapelTka('all');
          const cloudOk = await saveTkaQuestionsBatchToFirestore(importedQuestions, startIndex);
          if (!cloudOk) {
            showToast(
              `Berhasil mengimpor ${importedQuestions.length} butir soal secara lokal, tetapi gagal sinkron ke cloud.`,
              'error'
            );
          } else if (skippedOverLimit > 0) {
            showToast(
              `Berhasil mengimpor ${importedQuestions.length} soal TKA! (${skippedOverLimit} soal dilewati karena paket telah mencapai batas ${MAX_QUESTIONS_PER_PACKAGE} soal).`,
              'success'
            );
          } else {
            showToast(`Berhasil mengimpor ${importedQuestions.length} butir soal TKA!`, 'success');
          }
        } else if (skippedOverLimit > 0) {
          showToast(
            `Tidak ada soal ditambahkan karena paket tujuan sudah mencapai batas maksimal ${MAX_QUESTIONS_PER_PACKAGE} soal.`,
            'error'
          );
        } else {
          showToast('Tidak ada baris soal yang valid ditemukan dalam file.', 'error');
        }
      } catch (err) {
        console.error('Import error:', err);
        showToast('Gagal mengimpor file. Pastikan format kolom sesuai.', 'error');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplateTkaXLSX = () => {
    const templateData = [
      {
        'Jenis TKA': 'Simulasi 1',
        'Mata Pelajaran': 'Bahasa Indonesia',
        'Tipe Soal': 'isian',
        'Judul Teks': 'Belajar Mandiri di Rumah',
        'Pertanyaan': 'Siapakah pihak keluarga inti yang membimbing belajar di rumah? (Jawaban singkat)',
        'Opsi Pilihan': '',
        'Kunci Jawaban': 'Orang tua / ayah / ibu',
        'Posisi Gambar': 'bawah_judul',
        'Bobot': 10,
        'Pembahasan': 'Gunakan tanda / untuk opsi alternatif. Huruf besar/kecil otomatis benar.',
      },
      {
        'Jenis TKA': 'Try Out 1',
        'Mata Pelajaran': 'Matematika',
        'Tipe Soal': 'pg',
        'Judul Teks': '',
        'Pertanyaan': 'KPK dari bilangan 12 dan 18 adalah...',
        'Opsi Pilihan': '24, 36, 48, 72',
        'Kunci Jawaban': 'B',
        'Posisi Gambar': 'bawah_pertanyaan',
        'Bobot': 10,
        'Pembahasan': 'Faktorisasi 12 dan 18 menghasilkan KPK 36.',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Soal TKA');
    XLSX.writeFile(wb, 'Template_Import_Soal_TKA.xlsx');
    showToast('Template Excel Soal TKA berhasil diunduh!', 'success');
  };

  // Start CBT Simulation for TKA
  const handleStartSim = (jenis: TKAJenis) => {
    const qSet = tkaQuestions.filter((q) => q.jenisTka === jenis);
    if (qSet.length === 0) {
      showToast(`Belum ada butir soal yang dibuat untuk ${jenis}. Buat soal pada form terlebih dahulu!`, 'error');
      return;
    }
    const simDurMins = getTKADurationMinutes(tkaDurations, jenis, null);
    setSimJenis(jenis);
    setSimQuestionIdx(0);
    setSimAnswers({});
    setSimTimeLeft(simDurMins * 60);
    setSimResult(null);
    setIsSimulationRunning(true);
    showToast(`Ujian CBT ${jenis} dimulai! (Waktu pengerjaan: ${simDurMins} Menit)`, 'success');
  };

  const handleSubmitSim = () => {
    let earned = 0;
    let totalMax = 0;
    const details: any[] = [];

    simulationQuestions.forEach((q) => {
      totalMax += q.bobot;
      const ans = simAnswers[q.id];
      const evaluation = evaluateQuestionScore(q.tipe, ans, q.kunciJawaban, q.bobot, q.opsi, q);
      earned += evaluation.earnedScore;
      details.push({
        question: q,
        userAnswer: ans,
        isCorrect: evaluation.isCorrect,
        score: evaluation.earnedScore,
      });
    });

    const finalPct = totalMax > 0 ? Math.round((earned / totalMax) * 100) : 100;
    setSimResult({ score: finalPct, max: 100, details });
    setIsSimulationRunning(false);

    // Save to TKA results
    const simMapelName = simulationQuestions[0]?.mapel || 'TKA Terpadu';
    const results = getStoredTKAResults();
    results.push({
      examId: `tka_${simJenis.replace(/\s+/g, '_')}`,
      studentId: activeUser.studentData?.id || 'std_tka_user',
      studentName: activeUser.name,
      skor: earned,
      nilai: finalPct,
      waktuSelesai: new Date().toLocaleTimeString(),
      jawabanSiswa: simAnswers,
      category: 'tka',
      mapel: simMapelName,
      judul: `${simJenis} - ${simMapelName}`,
      paketName: simJenis,
      tanggal: getLocalTodayStr(),
      recordedAt: Date.now(),
    });
    saveStoredTKAResults(results);

    showToast(`Ujian ${simJenis} Selesai! Nilai: ${finalPct}`, 'success');
  };
  handleSubmitSimRef.current = handleSubmitSim;

  const filteredTkaQuestions = tkaQuestions.filter((q) => {
    if (filterJenisTka !== 'all' && q.jenisTka !== filterJenisTka) return false;
    if (filterMapelTka !== 'all' && q.mapel !== filterMapelTka) return false;
    return true;
  });

  const activeFormBucketCount = useMemo(
    () => tkaQuestions.filter((q) => q.jenisTka === formPaket && q.mapel === formMapel).length,
    [tkaQuestions, formPaket, formMapel]
  );

  const curSimQ = simulationQuestions[simQuestionIdx];

  return (
    <section className="space-y-6">
      {/* ================= 1. SUB-MENU SISWA TKA ================= */}
      {subType === 'siswa-tka' && (
        <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                Menu TKA • Peserta Ujian Tingkat Akhir
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-600" /> Data Peserta TKA (Rombel Kelas 6)
              </h2>
              <p className="text-xs text-slate-500">
                Peserta didik Kelas 6 ({availableTkaStudentClasses.join(', ')}) terdaftar sebagai peserta TKA. Untuk siswa berkebutuhan khusus (inklusi), Anda dapat menentukan apakah siswa tersebut masuk TKA atau tidak.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold bg-emerald-50 text-emerald-800 px-3 py-2 rounded-xl border border-emerald-200">
                Peserta Aktif TKA: <strong>{tkaStudents.length} Siswa</strong>
              </span>
              {excludedAbkStudents.length > 0 && (
                <span className="text-xs font-bold bg-amber-50 text-amber-800 px-3 py-2 rounded-xl border border-amber-200">
                  ABK Tidak Masuk TKA: <strong>{excludedAbkStudents.length} Siswa</strong>
                </span>
              )}
            </div>
          </div>

          {/* Panel Pengaturan Kepesertaan TKA Siswa Berkebutuhan Khusus (Inklusi) */}
          <div className="p-4 sm:p-5 rounded-2xl border-2 border-teal-200 bg-gradient-to-br from-teal-50/70 via-white to-amber-50/40 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-black text-sm text-teal-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-teal-700" />
                  Pilihan Kepesertaan TKA Siswa Berkebutuhan Khusus (Inklusi)
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Tentukan apakah siswa berkebutuhan khusus di Kelas 6 masuk daftar peserta TKA atau tidak. Jika dipilih <strong>Tidak Masuk TKA</strong>, namanya tidak akan muncul di daftar peserta, simulasi, analisis soal, maupun rapor/rekap TKA.
                </p>
              </div>
              {abkKelas6Students.length > 0 && onSaveStudents && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      handleSetAbkTkaParticipation(
                        abkKelas6Students.map((s) => s.id),
                        true
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition cursor-pointer shadow-xs"
                  >
                    Semua ABK Masuk TKA
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSetAbkTkaParticipation(
                        abkKelas6Students.map((s) => s.id),
                        false
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-black transition cursor-pointer shadow-xs"
                  >
                    Semua ABK Tidak Masuk TKA
                  </button>
                </div>
              )}
            </div>

            {abkKelas6Students.length === 0 ? (
              <div className="p-3 rounded-xl bg-white border border-teal-100 text-xs text-slate-500">
                Belum ada siswa Kelas 6 yang memiliki status kebutuhan khusus (inklusi) di Data Siswa.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {abkKelas6Students.map((s) => {
                  const masukTka = !isAbkExcludedFromTka(s);
                  return (
                    <div
                      key={s.id}
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition ${
                        masukTka
                          ? 'bg-white border-emerald-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={s.fotoUrl}
                          alt={s.nama}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-slate-800 truncate">{s.nama}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {s.kelas} • NISN: {s.nisn}
                          </div>
                          <span className="inline-block mt-0.5 text-[10px] font-extrabold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
                            {s.kebutuhanKhusus}
                          </span>
                        </div>
                      </div>

                      <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0 self-start sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleSetAbkTkaParticipation([s.id], true)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center gap-1 ${
                            masukTka
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Check className="w-3 h-3" /> Masuk TKA
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetAbkTkaParticipation([s.id], false)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center gap-1 ${
                            !masukTka
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <EyeOff className="w-3 h-3" /> Tidak Masuk TKA
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Filter className="w-4 h-4 text-slate-500" /> Filter Rombel:
              </div>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none"
              >
                <option value="all">Semua Rombel Kelas 6 ({tkaStudents.length} Siswa)</option>
                {availableTkaStudentClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    Hanya {cls} ({tkaStudents.filter((s) => s.kelas === cls).length} Siswa)
                  </option>
                ))}
              </select>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchStudent}
                onChange={(e) => setSearchStudent(e.target.value)}
                placeholder="Cari nama atau NISN peserta TKA..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none"
              />
            </div>
          </div>

          {/* Student Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-extrabold text-xs">
                  <th className="p-3 w-10 text-center">No</th>
                  <th className="p-3">Foto &amp; Nama Peserta Didik</th>
                  <th className="p-3">NISN / No. Peserta</th>
                  <th className="p-3 text-center">Rombel</th>
                  <th className="p-3 text-center">Agama</th>
                  <th className="p-3 text-center">Status Kepesertaan TKA</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayTkaStudents.map((s, idx) => {
                  const isAbk = isSiswaInklusi(s.kebutuhanKhusus);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={s.fotoUrl}
                            alt={s.nama}
                            onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                            className="w-9 h-9 rounded-xl object-cover border border-slate-200 cursor-zoom-in"
                          />
                          <div>
                            <div className="font-bold text-slate-900">{s.nama}</div>
                            <div className="text-[11px] font-mono text-rose-700 font-bold">{s.barcodeId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700">{s.nisn}</td>
                      <td className="p-3 text-center font-bold text-slate-800">{s.kelas}</td>
                      <td className="p-3 text-center text-slate-600">{s.agama}</td>
                      <td className="p-3 text-center">
                        {isAbk ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-teal-100 text-teal-800 px-2.5 py-0.5 rounded-full">
                            <CheckCircle className="w-3.5 h-3.5" /> Inklusi ({s.kebutuhanKhusus}) • Masuk TKA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                            <CheckCircle className="w-3.5 h-3.5" /> Terdaftar Siap TKA
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleStartSim('Simulasi 1')}
                          className="text-xs text-amber-600 hover:text-amber-800 font-bold hover:underline"
                        >
                          Ikut Simulasi &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {displayTkaStudents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                      Tidak ada peserta TKA yang cocok dengan filter pencarian atau seluruh siswa berkebutuhan khusus diatur Tidak Masuk TKA.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= 2. SUB-MENU CP & TP TKA ================= */}
      {subType === 'cp-tp-tka' && (() => {
        const mapelOptions = Array.from(
          new Set<string>([
            ...TKA_MAPEL_LIST,
            ...cpTpList.map((c) => c.mapel).filter(Boolean),
          ])
        );
        const filteredCpTpByMapel = cpTpList.filter(
          (cp) => cp.mapel.trim().toLowerCase() === cpTpFilterMapel.trim().toLowerCase()
        );

        return (
          <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
            {/* Header + Dropdown Pilih Mapel (Sederhana) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-display font-black text-slate-800 flex items-center gap-2">
                  <Compass className="w-5 h-5 text-amber-600" /> CP &amp; TP TKA
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih mata pelajaran pada dropdown untuk menampilkan Capaian Pembelajaran (CP) dan Tujuan Pembelajaran (TP).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2 bg-amber-50/70 border border-amber-200 px-3 py-1.5 rounded-2xl">
                  <span className="text-xs font-extrabold text-amber-950">Mata Pelajaran:</span>
                  <select
                    value={cpTpFilterMapel}
                    onChange={(e) => {
                      setCpTpFilterMapel(e.target.value);
                      setEditingCpId(null);
                      setEditingTpId(null);
                      setAddingTpForCpId(null);
                      setConfirmDeleteCpId(null);
                      setConfirmDeleteTpId(null);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-amber-300 bg-white text-xs sm:text-sm font-extrabold text-slate-800 outline-none cursor-pointer focus:ring-2 focus:ring-amber-300"
                  >
                    {mapelOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setNewCpMapel(cpTpFilterMapel);
                    setShowAddCpTpForm((prev) => !prev);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                >
                  {showAddCpTpForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {showAddCpTpForm ? 'Tutup Form' : '+ Tambah CP'}
                </button>
              </div>
            </div>

            {/* Collapsible Form Tambah CP & TP TKA */}
            {showAddCpTpForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newCpKode.trim() || !newCpJudul.trim()) return;
                  const newCpObj: TKACpTp = {
                    id: `cp_tka_${Date.now()}`,
                    kodeCp: newCpKode.trim(),
                    judulCp: newCpJudul.trim(),
                    deskripsiCp: newCpDesc.trim() || newCpJudul.trim(),
                    mapel: newCpMapel,
                    tpList: newTpJudul.trim()
                      ? [
                          {
                            id: `tp_${Date.now()}`,
                            kodeTp: `${newCpKode.trim()}-01`,
                            judulTp: newTpJudul.trim(),
                          },
                        ]
                      : [],
                  };
                  const updated = [...cpTpList, newCpObj];
                  setCpTpList(updated);
                  saveStoredTKACpTp(updated);
                  setCpTpFilterMapel(newCpMapel);
                  setShowAddCpTpForm(false);
                  showToast(`CP & TP untuk ${newCpMapel} berhasil ditambahkan!`, 'success');
                  setNewCpKode('');
                  setNewCpJudul('');
                  setNewCpDesc('');
                  setNewTpJudul('');
                }}
                className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-black text-sm text-amber-950 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-amber-600" /> Tambah CP &amp; TP Baru
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddCpTpForm(false)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    Batal
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">Mata Pelajaran:</label>
                    <select
                      value={newCpMapel}
                      onChange={(e) => setNewCpMapel(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-extrabold"
                    >
                      {mapelOptions.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">Kode CP:</label>
                    <input
                      type="text"
                      value={newCpKode}
                      onChange={(e) => setNewCpKode(e.target.value)}
                      required
                      placeholder="Contoh: CP-TKA-01"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">Judul CP:</label>
                    <input
                      type="text"
                      value={newCpJudul}
                      onChange={(e) => setNewCpJudul(e.target.value)}
                      required
                      placeholder="Contoh: Pemahaman Teks & Literasi"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">Deskripsi CP:</label>
                    <input
                      type="text"
                      value={newCpDesc}
                      onChange={(e) => setNewCpDesc(e.target.value)}
                      placeholder="Deskripsi ringkas capaian pembelajaran..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">TP Awal (Opsional):</label>
                    <input
                      type="text"
                      value={newTpJudul}
                      onChange={(e) => setNewTpJudul(e.target.value)}
                      placeholder="Tujuan pembelajaran pertama..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-amber-600 hover:bg-amber-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Check className="w-4 h-4" /> Simpan CP &amp; TP
                  </button>
                </div>
              </form>
            )}

            {/* Daftar CP & TP Hanya untuk Mata Pelajaran Terpilih */}
            {filteredCpTpByMapel.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 space-y-2">
                <p className="text-sm font-bold text-slate-600">
                  Belum ada data CP &amp; TP untuk mata pelajaran {cpTpFilterMapel}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setNewCpMapel(cpTpFilterMapel);
                    setShowAddCpTpForm(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah CP {cpTpFilterMapel}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCpTpByMapel.map((cp) => (
                  <div key={cp.id} className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-4">
                    {/* Baris CP */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-mono font-black uppercase bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-lg border border-amber-200">
                            {cp.kodeCp}
                          </span>
                          <span className="text-xs font-bold text-slate-500">{cp.mapel}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {editingCpId === cp.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!editCpJudul.trim()) return;
                                  const updated = cpTpList.map((c) =>
                                    c.id === cp.id
                                      ? { ...c, judulCp: editCpJudul.trim(), deskripsiCp: editCpDesc.trim() || editCpJudul.trim() }
                                      : c
                                  );
                                  setCpTpList(updated);
                                  saveStoredTKACpTp(updated);
                                  setEditingCpId(null);
                                  showToast('Perubahan CP berhasil disimpan!', 'success');
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" /> Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCpId(null)}
                                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Batal
                              </button>
                            </>
                          ) : confirmDeleteCpId === cp.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = cpTpList.filter((c) => c.id !== cp.id);
                                  setCpTpList(updated);
                                  saveStoredTKACpTp(updated);
                                  setConfirmDeleteCpId(null);
                                  showToast('CP berhasil dihapus', 'success');
                                }}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCpId(null)}
                                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Batal
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCpId(cp.id);
                                  setEditCpJudul(cp.judulCp);
                                  setEditCpDesc(cp.deskripsiCp);
                                }}
                                className="text-slate-600 hover:text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-100/60 transition flex items-center gap-1 text-xs font-bold cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCpId(cp.id)}
                                className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                                title="Hapus CP"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {editingCpId === cp.id ? (
                        <div className="space-y-2 bg-white p-3.5 rounded-xl border border-amber-300">
                          <input
                            type="text"
                            value={editCpJudul}
                            onChange={(e) => setEditCpJudul(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                            placeholder="Judul CP"
                          />
                          <textarea
                            rows={2}
                            value={editCpDesc}
                            onChange={(e) => setEditCpDesc(e.target.value)}
                            className="w-full p-2.5 rounded-lg border border-slate-300 text-xs"
                            placeholder="Deskripsi CP"
                          />
                        </div>
                      ) : (
                        <div className="bg-white p-4 rounded-xl border border-slate-200/90 space-y-1">
                          <div className="text-[10px] font-black uppercase tracking-wide text-amber-700">
                            Capaian Pembelajaran (CP)
                          </div>
                          <h3 className="font-display font-black text-sm sm:text-base text-slate-900">
                            {cp.judulCp}
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                            {cp.deskripsiCp}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Baris TP */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-700">
                          Tujuan Pembelajaran ({cp.tpList?.length || 0})
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingTpForCpId(addingTpForCpId === cp.id ? null : cp.id);
                            setNewTpJudulForCp('');
                          }}
                          className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer bg-amber-100/70 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition"
                        >
                          <Plus className="w-3.5 h-3.5" /> Tambah TP
                        </button>
                      </div>

                      {addingTpForCpId === cp.id && (
                        <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-300 flex flex-wrap gap-2 items-center">
                          <input
                            type="text"
                            value={newTpJudulForCp}
                            onChange={(e) => setNewTpJudulForCp(e.target.value)}
                            placeholder="Tuliskan tujuan pembelajaran (TP) baru..."
                            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!newTpJudulForCp.trim()) return;
                              const newTp = {
                                id: `tp_${Date.now()}`,
                                kodeTp: `TP-${(cp.tpList?.length || 0) + 1}`,
                                judulTp: newTpJudulForCp.trim(),
                              };
                              const updated = cpTpList.map((c) =>
                                c.id === cp.id ? { ...c, tpList: [...(c.tpList || []), newTp] } : c
                              );
                              setCpTpList(updated);
                              saveStoredTKACpTp(updated);
                              setAddingTpForCpId(null);
                              setNewTpJudulForCp('');
                              showToast('Tujuan Pembelajaran (TP) berhasil ditambahkan!', 'success');
                            }}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                          >
                            Simpan
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddingTpForCpId(null)}
                            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      )}

                      {cp.tpList && cp.tpList.length > 0 ? (
                        <div className="space-y-1.5">
                          {cp.tpList.map((tp, tpIdx) => (
                            <div
                              key={tp.id}
                              className="text-xs sm:text-sm flex items-center justify-between gap-3 text-slate-700 bg-white px-3.5 py-2.5 rounded-xl border border-slate-200"
                            >
                              {editingTpId === tp.id ? (
                                <div className="flex-1 flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-xs text-amber-700">{tp.kodeTp}</span>
                                  <input
                                    type="text"
                                    value={editTpJudul}
                                    onChange={(e) => setEditTpJudul(e.target.value)}
                                    className="flex-1 min-w-[180px] px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!editTpJudul.trim()) return;
                                      const updated = cpTpList.map((c) =>
                                        c.id === cp.id
                                          ? {
                                              ...c,
                                              tpList: (c.tpList || []).map((t) =>
                                                t.id === tp.id ? { ...t, judulTp: editTpJudul.trim() } : t
                                              ),
                                            }
                                          : c
                                      );
                                      setCpTpList(updated);
                                      saveStoredTKACpTp(updated);
                                      setEditingTpId(null);
                                      showToast('Perubahan TP berhasil disimpan!', 'success');
                                    }}
                                    className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                                  >
                                    Simpan
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTpId(null)}
                                    className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-start gap-2.5 flex-1">
                                    <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 font-mono font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                                      {tpIdx + 1}
                                    </span>
                                    <div className="leading-relaxed">
                                      <span className="font-mono font-bold text-[11px] text-amber-700 mr-2">
                                        {tp.kodeTp}
                                      </span>
                                      <span className="text-slate-800 font-medium">{tp.judulTp}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {confirmDeleteTpId === tp.id ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = cpTpList.map((c) =>
                                              c.id === cp.id
                                                ? { ...c, tpList: (c.tpList || []).filter((t) => t.id !== tp.id) }
                                                : c
                                            );
                                            setCpTpList(updated);
                                            saveStoredTKACpTp(updated);
                                            setConfirmDeleteTpId(null);
                                            showToast('TP berhasil dihapus', 'success');
                                          }}
                                          className="px-2 py-0.5 bg-rose-600 text-white rounded text-[11px] font-bold cursor-pointer"
                                        >
                                          Hapus
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteTpId(null)}
                                          className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[11px] font-bold cursor-pointer"
                                        >
                                          Batal
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingTpId(tp.id);
                                            setEditTpJudul(tp.judulTp);
                                          }}
                                          className="text-slate-400 hover:text-amber-700 p-1 hover:bg-amber-50 rounded cursor-pointer"
                                          title="Edit TP"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteTpId(tp.id)}
                                          className="text-slate-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded cursor-pointer"
                                          title="Hapus TP"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">
                          Belum ada Tujuan Pembelajaran (TP) untuk CP ini.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ================= 3. SUB-MENU BANK SOAL TKA (IMAGE 1 EXACT DESIGN) ================= */}
      {subType === 'bank-soal-tka' && (
        <div className="space-y-6">
          {/* Header & Quick Action Buttons */}
          <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                Menu TKA • Bank Soal & Simulasi
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                <FileQuestion className="w-5 h-5 text-amber-600" /> Bank Soal TKA (Simulasi 1 – 6 & Try Out 1 – 6)
              </h2>
              <p className="text-xs text-slate-500 max-w-3xl">
                Desain form pembuatan butir soal TKA yang disinkronkan dengan data CP & TP TKA. Mendukung 6 tipe soal, konversi pecahan EYD V, toleransi alternatif tanda "/", dan import soal Excel.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplateTkaXLSX}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-600" /> Template Excel (.XLSX)
              </button>
              <label className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition">
                <Upload className="w-4 h-4" /> Import Excel (.XLSX)
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportTkaQuestions} className="hidden" />
              </label>
              <button
                type="button"
                onClick={() => docxTkaInputRef.current?.click()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                title="Import bank soal TKA dari dokumen Microsoft Word (.docx)"
              >
                <FileText className="w-4 h-4" /> Import Soal TKA (.DOCX)
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setTkaDownloadMenuPos((prev) => (prev === 'header' ? null : 'header'))
                  }
                  className="bg-sky-600 hover:bg-sky-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                  title="Download kumpulan soal TKA yang sudah dibuat (Word atau Excel)"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Soal TKA</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {tkaDownloadMenuPos === 'header' && (
                  <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50 space-y-1 text-left">
                    <button
                      type="button"
                      onClick={() => handleDownloadTkaQuestions('word_only', true)}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-sky-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                      <div>
                        <span className="block">Naskah Soal TKA (.DOC Word)</span>
                        <span className="text-[10px] font-normal text-slate-500">Siap cetak sesuai filter aktif</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTkaQuestions('word_key', true)}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="block">Soal + Kunci &amp; Pembahasan (.DOC)</span>
                        <span className="text-[10px] font-normal text-slate-500">Lengkap kunci &amp; pembahasan</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTkaQuestions('excel', true)}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-amber-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <span className="block">Bank Soal TKA (.XLSX Excel)</span>
                        <span className="text-[10px] font-normal text-slate-500">Kompatibel untuk re-import Excel</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={docxTkaInputRef}
                type="file"
                accept=".docx"
                onChange={handleImportDocxTka}
                className="hidden"
              />
            </div>
          </div>

          {/* CBT Launcher Bar for Simulasi 1 - 6 & Try Out 1 - 6 */}
          {!isSimulationRunning && !simResult && (
            <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500 via-rose-600 to-red-600 text-white shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase bg-white/20 px-2.5 py-0.5 rounded-full border border-white/30">
                    CBT Player TKA
                  </span>
                  <h3 className="font-display font-black text-base sm:text-lg mt-1">
                    Mulai Simulasi & Try Out CBT TKA
                  </h3>
                </div>
                <span className="text-xs text-amber-200 font-bold hidden sm:inline">Pilih Paket Ujian di Bawah</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {TKA_JENIS_LIST.map((jenis) => {
                  const count = tkaQuestions.filter((q) => q.jenisTka === jenis).length;
                  const durMins = getTKADurationMinutes(tkaDurations, jenis, null);
                  return (
                    <button
                      key={jenis}
                      type="button"
                      onClick={() => handleStartSim(jenis)}
                      className="px-3.5 py-2 rounded-xl bg-white text-slate-800 hover:bg-amber-100 font-display font-black text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-amber-600" />
                      <span>{jenis}</span>
                      <span className="text-[10px] font-mono text-slate-500 font-bold">
                        ({count} soal • {durMins} mnt)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Running Simulation Interface */}
          {isSimulationRunning && curSimQ && (
            <div className="p-6 rounded-3xl bg-slate-50 border-2 border-amber-500 space-y-5 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                    Ujian TKA Sedang Berjalan
                  </span>
                  <h3 className="font-display font-black text-base text-slate-800 mt-1">{simJenis} - TKA SD</h3>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-rose-50 text-rose-700 px-3 py-1.5 rounded-xl border border-rose-200 font-mono font-black text-sm">
                    <Clock className="w-4 h-4" />
                    <span>
                      {Math.floor(simTimeLeft / 60)}:{String(simTimeLeft % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmitSim}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs cursor-pointer shadow-xs"
                  >
                    Kirim & Selesai Ujian
                  </button>
                </div>
              </div>

              {/* Navigator */}
              <div className="flex flex-wrap gap-2 bg-white p-3 rounded-2xl border border-slate-200 max-h-44 overflow-y-auto">
                {simulationQuestions.map((q, idx) => {
                  const isAnswered = simAnswers[q.id] !== undefined && simAnswers[q.id] !== '';
                  const isCurrent = idx === simQuestionIdx;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setSimQuestionIdx(idx)}
                      className={`w-9 h-9 rounded-xl font-display font-black text-xs transition cursor-pointer border ${
                        isCurrent
                          ? 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-300'
                          : isAnswered
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Question Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                    Soal No. {simQuestionIdx + 1} ({curSimQ.tipe.toUpperCase()}) • {curSimQ.mapel}
                  </span>
                  <span className="text-xs font-bold text-slate-500 font-mono">Bobot: {curSimQ.bobot} Poin</span>
                </div>

                <QuestionContent
                  pertanyaan={curSimQ.pertanyaan}
                  judulTeks={curSimQ.judulTeks}
                  gambarUrl={curSimQ.gambarUrl}
                  gambarUrl2={curSimQ.gambarUrl2}
                  posisiGambar={curSimQ.posisiGambar}
                  onOpenZoom={onOpenZoom}
                  titleClassName="text-base sm:text-lg font-display font-black text-slate-900"
                  bodyClassName="text-sm font-bold text-slate-900 leading-relaxed"
                />

                {/* Input Answer */}
                <div className="pt-2">
                  {curSimQ.tipe === 'isian' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={simAnswers[curSimQ.id] || ''}
                        onChange={(e) => setSimAnswers({ ...simAnswers, [curSimQ.id]: e.target.value })}
                        placeholder="Ketik jawaban singkat Anda di sini..."
                        className="w-full p-3 rounded-xl border-2 border-slate-300 focus:border-amber-500 text-xs font-bold text-slate-800 outline-none"
                      />
                      <span className="text-[11px] text-slate-500 block">
                        💡 Tips TKA: Huruf besar/kecil, variasi spasi, atau salah satu opsi tanda "/" (misal: ayah, ibu, orang tua) otomatis diterima benar.
                      </span>
                    </div>
                  )}

                  {curSimQ.tipe === 'pg' && curSimQ.opsi && (
                    <div className="space-y-2">
                      {curSimQ.opsi.map((op, oIdx) => {
                        const optKey = ['A', 'B', 'C', 'D'][oIdx];
                        const optImg = curSimQ.opsiGambar?.[optKey];
                        return (
                          <label
                            key={oIdx}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition cursor-pointer ${
                              simAnswers[curSimQ.id] === optKey || simAnswers[curSimQ.id] === op
                                ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold'
                                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio"
                                name={`sim_q_${curSimQ.id}`}
                                value={optKey}
                                checked={simAnswers[curSimQ.id] === optKey || simAnswers[curSimQ.id] === op}
                                onChange={() => setSimAnswers({ ...simAnswers, [curSimQ.id]: optKey })}
                                className="w-4 h-4 text-amber-600"
                              />
                              <span className="font-mono font-bold">{optKey}.</span>
                              <span className="text-xs whitespace-pre-wrap">
                                <FormattedMathText text={op} />
                              </span>
                            </div>
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar Opsi ${optKey}`}
                                className="h-16 w-auto max-w-[140px] rounded-lg border border-slate-300 object-contain bg-white cursor-pointer hover:opacity-90"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenZoom(optImg, `Gambar Opsi ${optKey}`);
                                }}
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {curSimQ.tipe === 'pg_kompleks' && curSimQ.opsi && (
                    <div className="space-y-2">
                      {curSimQ.opsi.map((op, oIdx) => {
                        const optKey = ['A', 'B', 'C', 'D'][oIdx];
                        const optImg = curSimQ.opsiGambar?.[optKey];
                        const list: string[] = simAnswers[curSimQ.id] || [];
                        const checked = list.includes(optKey) || list.includes(op);
                        return (
                          <label
                            key={oIdx}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition cursor-pointer ${
                              checked
                                ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold'
                                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...list, optKey]
                                    : list.filter((x) => x !== optKey && x !== op);
                                  setSimAnswers({ ...simAnswers, [curSimQ.id]: next });
                                }}
                                className="w-4 h-4 text-amber-600"
                              />
                              <span className="font-mono font-bold">{optKey}.</span>
                              <span className="text-xs whitespace-pre-wrap">
                                <FormattedMathText text={op} />
                              </span>
                            </div>
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar Opsi ${optKey}`}
                                className="h-16 w-auto max-w-[140px] rounded-lg border border-slate-300 object-contain bg-white cursor-pointer hover:opacity-90"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenZoom(optImg, `Gambar Opsi ${optKey}`);
                                }}
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {curSimQ.tipe === 'benar_salah' && (
                    <BenarSalahTableView
                      items={resolveBenarSalahItems(curSimQ)}
                      interactive
                      value={simAnswers[curSimQ.id]}
                      onChange={(nextMap) => setSimAnswers({ ...simAnswers, [curSimQ.id]: nextMap })}
                      accentTheme="amber"
                    />
                  )}

                  {curSimQ.tipe === 'menjodohkan' && (
                    (() => {
                      const matchData = resolveMenjodohkanData(curSimQ);
                      return matchData ? (
                        <MenjodohkanColumnsView
                          data={matchData}
                          interactive
                          value={simAnswers[curSimQ.id]}
                          onChange={(nextMap) => setSimAnswers({ ...simAnswers, [curSimQ.id]: nextMap })}
                          accentTheme="amber"
                        />
                      ) : (
                        <textarea
                          rows={3}
                          value={simAnswers[curSimQ.id] || ''}
                          onChange={(e) => setSimAnswers({ ...simAnswers, [curSimQ.id]: e.target.value })}
                          placeholder="Ketik jawaban Anda..."
                          className="w-full p-3 rounded-xl border border-slate-300 text-xs font-medium outline-none focus:border-amber-500"
                        />
                      );
                    })()
                  )}

                  {(curSimQ.tipe === 'isian' || curSimQ.tipe === 'uraian') && (
                    <textarea
                      rows={curSimQ.tipe === 'isian' ? 2 : 3}
                      value={simAnswers[curSimQ.id] || ''}
                      onChange={(e) => setSimAnswers({ ...simAnswers, [curSimQ.id]: e.target.value })}
                      placeholder="Ketik jawaban Anda..."
                      className="w-full p-3 rounded-xl border border-slate-300 text-xs font-medium outline-none focus:border-amber-500"
                    />
                  )}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex justify-between">
                <button
                  type="button"
                  disabled={simQuestionIdx === 0}
                  onClick={() => setSimQuestionIdx((prev) => prev - 1)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
                >
                  &larr; Soal Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={simQuestionIdx === simulationQuestions.length - 1}
                  onClick={() => setSimQuestionIdx((prev) => prev + 1)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
                >
                  Soal Berikutnya &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Simulation Result */}
          {simResult && (
            <div className="p-6 rounded-3xl bg-amber-50 border-2 border-amber-300 space-y-4">
              <div className="text-center space-y-2">
                <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" />
                <h3 className="text-xl font-display font-black text-slate-900">
                  Hasil CBT {simJenis} Telah Dinilai Otomatis
                </h3>
                <div className="text-4xl font-display font-black text-amber-700">
                  Nilai: {simResult.score} / {simResult.max}
                </div>
                <p className="text-xs text-slate-600">
                  Sistem telah memeriksa jawaban dengan toleransi huruf besar/kecil, spasi, dan jawaban alternatif tanda "/".
                </p>
                <button
                  type="button"
                  onClick={() => setSimResult(null)}
                  className="bg-amber-600 text-white font-display font-bold px-5 py-2.5 rounded-2xl text-xs cursor-pointer shadow-xs"
                >
                  Selesai & Tutup Pratinjau Nilai
                </button>
              </div>

              <div className="space-y-2 pt-2 border-t border-amber-200">
                <h4 className="font-display font-black text-xs uppercase text-slate-700">Detail Koreksi Jawaban:</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {simResult.details.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                        item.isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-800">No. {idx + 1}: {item.question.pertanyaan}</div>
                        <div className="text-[11px] text-slate-600">
                          Jawaban Siswa: <strong>{String(item.userAnswer || '-')}</strong> • Kunci: <strong>{String(item.question.kunciJawaban)}</strong>
                        </div>
                      </div>
                      <span className={`font-mono font-black text-xs shrink-0 ${item.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {item.score} / {item.question.bobot} Poin
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================= EXACT REFERENCE FORM: IMAGE 1 ================= */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-5">
            {/* Capacity Banner (50 Soal per Paket & Mapel) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-700">Kapasitas Paket Aktif:</span>
                <span className="px-2.5 py-0.5 rounded-lg bg-rose-100 text-rose-800 font-black">
                  {formPaket}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-indigo-100 text-indigo-800 font-black">
                  {formMapel}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-lg font-mono font-black border ${
                    activeFormBucketCount >= MAX_QUESTIONS_PER_PACKAGE
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : activeFormBucketCount >= 40
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}
                >
                  {activeFormBucketCount} / {MAX_QUESTIONS_PER_PACKAGE} Soal
                </span>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-56">
                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      activeFormBucketCount >= MAX_QUESTIONS_PER_PACKAGE
                        ? 'bg-rose-500'
                        : activeFormBucketCount >= 40
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((activeFormBucketCount / MAX_QUESTIONS_PER_PACKAGE) * 100))}%`,
                    }}
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-500 shrink-0">
                  Sisa {Math.max(0, MAX_QUESTIONS_PER_PACKAGE - activeFormBucketCount)}
                </span>
              </div>
            </div>

            {/* Row 1: Top Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3.5">
              {/* Paket / Jenis Ulangan with red rounded border */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Paket / Jenis TKA</label>
                </div>
                <select
                  value={formPaket}
                  onChange={(e) => setFormPaket(e.target.value as TKAJenis)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-rose-500 bg-white text-xs font-bold text-rose-700 outline-none focus:ring-2 focus:ring-rose-200 transition"
                >
                  {TKA_JENIS_LIST.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Mata Pelajaran */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
                <select
                  value={formMapel}
                  onChange={(e) => handleFormMapelChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400"
                >
                  {TKA_MAPEL_LIST.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Target Kelas */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Kelas</label>
                <select
                  value={formTargetKelas}
                  onChange={(e) => setFormTargetKelas(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400"
                >
                  {availableTkaStudentClasses.map((cls) => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                  <option value="Gabungan Kelas 6">Gabungan TKA (Seluruh Kelas 6)</option>
                </select>
              </div>

              {/* Pilih TP yang Diukur with blue rounded border */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih TP yang Diukur</label>
                <select
                  value={formTpIndex}
                  onChange={(e) => setFormTpIndex(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border-2 border-sky-400 bg-white text-xs font-bold text-sky-800 outline-none focus:ring-2 focus:ring-sky-200 transition"
                >
                  {activeCp?.tpList && activeCp.tpList.length > 0 ? (
                    activeCp.tpList.map((tp: any, idx: number) => (
                      <option key={tp.id} value={idx}>
                        {tp.kodeTp || `TP ${idx + 1}`}
                      </option>
                    ))
                  ) : (
                    <option value={0}>TP 1</option>
                  )}
                </select>
              </div>

              {/* Tipe Soal (6 Tipe) */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Soal (6 Tipe)</label>
                <select
                  value={formTipe}
                  onChange={(e) => setFormTipe(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400"
                >
                  <option value="pg">Pilihan Ganda (PG)</option>
                  <option value="pg_kompleks">Pilihan Ganda Kompleks</option>
                  <option value="menjodohkan">Menjodohkan</option>
                  <option value="isian">Isian Singkat (Mendukung "/")</option>
                  <option value="uraian">Uraian</option>
                  <option value="benar_salah">Benar / Salah</option>
                </select>
              </div>

              {/* Level Soal & Kognitif (Sedang | L2 (C3)) */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Level Soal & Kognitif</label>
                <div className="flex gap-1.5">
                  <select
                    value={formKesukaran}
                    onChange={(e) => setFormKesukaran(e.target.value as any)}
                    className="w-1/2 px-2 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400"
                  >
                    <option value="Mudah">Mudah</option>
                    <option value="Sedang">Sedang</option>
                    <option value="Sukar">Sukar</option>
                  </select>
                  <select
                    value={formKognitif}
                    onChange={(e) => setFormKognitif(e.target.value)}
                    className="w-1/2 px-2 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400"
                  >
                    <option value="L1 (C1-C2)">L1 (C1-C2)</option>
                    <option value="L2 (C3)">L2 (C3)</option>
                    <option value="L3 (C4-C6)">L3 (C4-C6)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Row 2: Red/Rose Bordered Card for CP & TP (Exact Image 1) */}
            <div className="p-4 sm:p-5 rounded-2xl border-2 border-rose-200 bg-rose-50/20 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Column Left: Kompetensi (Pilih Dropdown CP) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                      <BookOpen className="w-4 h-4 text-rose-600" />
                      <span>Kompetensi (Pilih Dropdown CP)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddCpModal(true)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200"
                    >
                      <Plus className="w-3 h-3" /> Tambah CP
                    </button>
                  </div>

                  <select
                    value={selectedCpId}
                    onChange={(e) => {
                      setSelectedCpId(e.target.value);
                      setFormTpIndex(0);
                    }}
                    className="w-full px-3 py-2 rounded-xl border-2 border-rose-400 bg-white text-xs font-semibold text-rose-800 outline-none focus:ring-2 focus:ring-rose-200"
                  >
                    {filteredTkaCps.map((cp: any, idx: number) => (
                      <option key={cp.id} value={cp.id}>
                        CP {idx + 1}: [{formTargetKelas} • TKA] {cp.judulCp}
                      </option>
                    ))}
                  </select>

                  <textarea
                    rows={3}
                    readOnly
                    value={`[${formTargetKelas} • Fase C • TKA 2026/2027] ${activeCp?.deskripsiCp || activeCp?.judulCp || ''}`}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs text-slate-700 font-medium resize-none leading-relaxed"
                  />
                </div>

                {/* Column Right: Sub Kompetensi (Otomatis dari Tujuan Pembelajaran / TP) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-sky-800">
                      <CheckSquare className="w-4 h-4 text-sky-600" />
                      <span>Sub Kompetensi (Otomatis dari Tujuan Pembelajaran / TP)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowAddTpModal(true)}
                        className="text-[11px] font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 cursor-pointer bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200"
                      >
                        <Plus className="w-3 h-3" /> Tambah TP
                      </button>
                      <span className="text-[10px] font-mono font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-md">
                        {activeTp?.kodeTp || `TP${formTpIndex + 1}`}
                      </span>
                    </div>
                  </div>

                  <textarea
                    rows={4}
                    readOnly
                    value={`[${formTargetKelas}] ${activeTp?.judulTp || activeCp?.judulCp || ''}`}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs text-slate-700 font-medium resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Question Textarea + Fraction Converter + Upload Image + Green Point Box */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Question Textarea Column */}
              <div className="lg:col-span-6 space-y-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <AlignCenter className="w-3.5 h-3.5 text-rose-600" />
                    Judul Teks / Bacaan (Opsional • Ditengah & Terpisah dari Paragraf)
                  </label>
                  <input
                    type="text"
                    value={formJudulTeks}
                    onChange={(e) => setFormJudulTeks(e.target.value)}
                    placeholder="Contoh: Ekosistem Hutan Bakau (otomatis rata tengah, tidak menyatu dengan paragraf)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 text-center font-bold placeholder:text-slate-400 outline-none focus:border-rose-400 bg-white"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Pertanyaan / Butir Soal (Mendukung Pecahan Susun &amp; Jarak Paragraf)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const el = tkaPertanyaanTextareaRef.current;
                        const start = el?.selectionStart ?? formPertanyaan.length;
                        const end = el?.selectionEnd ?? formPertanyaan.length;
                        const { nextValue, nextCursor } = toggleCenterTagOnSelection(formPertanyaan, start, end);
                        setFormPertanyaan(nextValue);
                        setTimeout(() => {
                          if (el) {
                            el.focus();
                            el.setSelectionRange(nextCursor, nextCursor);
                          }
                        }, 0);
                      }}
                      className="text-xs font-bold text-rose-700 hover:underline flex items-center gap-1 cursor-pointer bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200"
                      title="Jadikan baris terpilih sebagai Judul (rata tengah dan terpisah dari paragraf)"
                    >
                      <AlignCenter className="w-3 h-3 text-rose-600" /> Tengah / Judul
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertTkaSymbol('°')}
                      className="text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg cursor-pointer transition flex items-center gap-1"
                      title="Sisipkan simbol derajat (°) ke posisi kursor di soal"
                    >
                      <span className="font-black text-xs leading-none">°</span> Derajat
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTkaFractionBuilder((prev) => !prev)}
                      className={`text-xs font-bold flex items-center gap-1.5 cursor-pointer px-2.5 py-0.5 rounded-lg border transition ${
                        showTkaFractionBuilder
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                      }`}
                      title="Buka pengaturan penulisan pecahan susun atas-bawah (misal 2/5)"
                    >
                      <span className="inline-flex flex-col items-center leading-none text-[8px] font-black">
                        <span className="border-b border-current px-0.5">2</span>
                        <span>5</span>
                      </span>
                      <span>Format Pecahan</span>
                    </button>
                  </div>
                </div>
                {showTkaFractionBuilder && (
                  <FractionBuilderBar
                    onInsertToQuestion={handleInsertTkaFraction}
                    onConvertAllInQuestion={handleConvertAllTkaFractions}
                    onInsertToOption={handleInsertTkaFractionToOption}
                    onInsertSymbolToQuestion={handleInsertTkaSymbol}
                    onInsertSymbolToOption={handleInsertTkaSymbolToOption}
                    showOptionsTargets={formTipe === 'pg' || formTipe === 'pg_kompleks'}
                    onClose={() => setShowTkaFractionBuilder(false)}
                  />
                )}
                <textarea
                  ref={tkaPertanyaanTextareaRef}
                  rows={5}
                  value={formPertanyaan}
                  onChange={(e) => setFormPertanyaan(e.target.value)}
                  onPaste={(e) => {
                    const extracted = extractPastedQuestionText(e);
                    if (extracted !== null) {
                      e.preventDefault();
                      const el = e.currentTarget;
                      const start = el.selectionStart ?? formPertanyaan.length;
                      const end = el.selectionEnd ?? formPertanyaan.length;
                      const nextVal = formPertanyaan.slice(0, start) + extracted + formPertanyaan.slice(end);
                      setFormPertanyaan(nextVal);
                      showToast('Teks rata tengah dari salinan otomatis terdeteksi sebagai Judul terpisah!', 'success');
                    }
                  }}
                  placeholder="Tuliskan soal atau bacaan. Tekan Enter beberapa kali untuk jarak antar paragraf, ketik 2/5 atau gunakan Format Pecahan / ° Derajat agar tampil rapi..."
                  className="w-full p-3 rounded-2xl border border-slate-300 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-rose-400 leading-relaxed"
                />
              </div>

              {/* Upload Gambar Column: 2 Slots (Side-by-Side) + Posisi Gambar */}
              <div className="lg:col-span-4 space-y-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  Upload Gambar Soal (Maks. 2 Gambar Bersebelahan):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {/* Gambar 1 */}
                  <div className="p-2 rounded-xl border border-slate-200 bg-white space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-600 block">Gambar 1 (Kiri)</span>
                    <label className="inline-flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg cursor-pointer shadow-xs transition w-full justify-center">
                      <ImageIcon className="w-3.5 h-3.5" /> Pilih File
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    {formGambarUrl && (
                      <div className="relative mt-1">
                        <img
                          src={formGambarUrl}
                          alt="Preview Gambar 1"
                          className="w-full h-14 object-contain rounded-lg border border-slate-200 bg-slate-50 cursor-pointer"
                          onClick={() => onOpenZoom(formGambarUrl, 'Preview Gambar 1 Soal')}
                        />
                        <button
                          type="button"
                          onClick={() => setFormGambarUrl(null)}
                          className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 text-[10px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Gambar 2 */}
                  <div className="p-2 rounded-xl border border-slate-200 bg-white space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-600 block">Gambar 2 (Kanan)</span>
                    <label className="inline-flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg cursor-pointer shadow-xs transition w-full justify-center">
                      <ImageIcon className="w-3.5 h-3.5" /> Pilih File
                      <input type="file" accept="image/*" onChange={handleImageUpload2} className="hidden" />
                    </label>
                    {formGambarUrl2 && (
                      <div className="relative mt-1">
                        <img
                          src={formGambarUrl2}
                          alt="Preview Gambar 2"
                          className="w-full h-14 object-contain rounded-lg border border-slate-200 bg-slate-50 cursor-pointer"
                          onClick={() => onOpenZoom(formGambarUrl2, 'Preview Gambar 2 Soal')}
                        />
                        <button
                          type="button"
                          onClick={() => setFormGambarUrl2(null)}
                          className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 text-[10px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">
                    Posisi Tampil Gambar:
                  </label>
                  <select
                    value={formPosisiGambar}
                    onChange={(e) => setFormPosisiGambar(e.target.value as PosisiGambar)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-extrabold border border-slate-300 bg-white text-slate-800 outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value="bawah_judul">Di Bawah Judul</option>
                    <option value="bawah_pertanyaan">Di Bawah Pertanyaan</option>
                    <option value="kanan_teks">Di Kanan Teks</option>
                  </select>
                </div>
              </div>

              {/* Green Point Box & Amber Waktu Pengerjaan Box */}
              <div className="lg:col-span-2 space-y-3">
                <div className="p-3 rounded-2xl border-2 border-emerald-400 bg-emerald-50/30 text-center space-y-1">
                  <div className="text-xs font-bold text-emerald-800 flex items-center justify-center gap-1">
                    <span>⭐</span> Menu Point Nilai
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={formBobot}
                      onChange={(e) => setFormBobot(Number(e.target.value))}
                      className="w-20 text-center text-xl font-display font-black text-slate-900 border-2 border-emerald-500 rounded-xl py-1 bg-white outline-none"
                    />
                    <span className="text-xs font-bold text-slate-700">Poin</span>
                  </div>
                  <p className="text-[10px] text-emerald-700 font-medium">Bobot skor soal</p>
                </div>

                {/* Waktu Pengerjaan Soal TKA (Auto-Submit) */}
                <div className="p-3 rounded-2xl border-2 border-amber-400 bg-amber-50/50 text-center space-y-1.5">
                  <div className="text-xs font-bold text-amber-900 flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-600" /> Waktu Pengerjaan
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={formDurasiMenit || ''}
                      onChange={(e) => setFormDurasiMenit(Number(e.target.value))}
                      onBlur={() => {
                        const saved = getTKADurationMinutes(tkaDurations, formPaket, formMapel);
                        const clamped = Math.max(1, Math.min(300, Math.round(Number(formDurasiMenit) || 60)));
                        setFormDurasiMenit(clamped);
                        if (clamped !== saved) {
                          handleSaveTkaDuration(formPaket, formMapel, clamped, false);
                        }
                      }}
                      className="w-20 text-center text-lg font-display font-black text-slate-900 border-2 border-amber-500 rounded-xl py-1 bg-white outline-none"
                      title="Setting waktu pengerjaan soal TKA (dalam menit). Otomatis auto-submit saat waktu habis."
                    />
                    <span className="text-xs font-bold text-slate-700">Mnt</span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1">
                    {[30, 45, 60, 90].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setFormDurasiMenit(m);
                          handleSaveTkaDuration(formPaket, formMapel, m, false);
                        }}
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-black border cursor-pointer transition ${
                          formDurasiMenit === m
                            ? 'bg-amber-600 text-white border-amber-700'
                            : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-800 font-medium leading-tight">
                    {formPaket} • {formMapel.split(' ')[0]}
                  </p>
                </div>
              </div>
            </div>

            {/* Row 4: Answer Options Form based on Question Type */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
              {formTipe === 'pg' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Pilihan Jawaban (Pilih 1 Kunci Benar & bisa tambahkan gambar tiap opsi):</span>
                    <span className="text-[11px] text-slate-500 font-medium">Klik ikon gambar untuk upload gambar pada opsi</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { key: 'A', val: pgOptionA, setVal: setPgOptionA },
                      { key: 'B', val: pgOptionB, setVal: setPgOptionB },
                      { key: 'C', val: pgOptionC, setVal: setPgOptionC },
                      { key: 'D', val: pgOptionD, setVal: setPgOptionD },
                    ].map(({ key, val, setVal }) => (
                      <div key={key} className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id={`tka_kunci_${key.toLowerCase()}`}
                            name="tka_pg_kunci"
                            checked={pgKunci === key}
                            onChange={() => setPgKunci(key as any)}
                            className="w-4 h-4 text-rose-600 cursor-pointer"
                          />
                          <label htmlFor={`tka_kunci_${key.toLowerCase()}`} className="text-xs font-bold text-slate-700 w-4">
                            {key}.
                          </label>
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => setVal(e.target.value)}
                            placeholder={`Teks Opsi ${key}`}
                            className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:border-rose-400"
                          />
                          <label className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer transition" title={`Upload Gambar Opsi ${key}`}>
                            <ImageIcon className="w-4 h-4 text-rose-600" />
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleOptionImageUpload(key, f);
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {formOpsiGambar[key] && (
                          <div className="flex items-center gap-2 pl-6">
                            <img
                              src={formOpsiGambar[key]}
                              alt={`Gambar Opsi ${key}`}
                              className="h-12 w-auto max-w-[100px] rounded-lg border border-slate-300 object-contain bg-slate-50 cursor-pointer"
                              onClick={() => onOpenZoom(formOpsiGambar[key], `Preview Opsi ${key}`)}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOptionImage(key)}
                              className="text-[11px] text-red-600 hover:underline cursor-pointer"
                            >
                              Hapus Gambar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formTipe === 'pg_kompleks' && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-700">Pilihan Jawaban Kompleks (Centang Semua Kunci Benar & gambar opsi):</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {['A', 'B', 'C', 'D'].map((key) => {
                      const val = key === 'A' ? pgOptionA : key === 'B' ? pgOptionB : key === 'C' ? pgOptionC : pgOptionD;
                      const setVal = key === 'A' ? setPgOptionA : key === 'B' ? setPgOptionB : key === 'C' ? setPgOptionC : setPgOptionD;
                      return (
                        <div key={key} className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={pgkChecks[key] || false}
                              onChange={(e) => setPgkChecks({ ...pgkChecks, [key]: e.target.checked })}
                              className="w-4 h-4 text-rose-600 rounded cursor-pointer"
                            />
                            <span className="text-xs font-bold text-slate-700 w-4">{key}.</span>
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => setVal(e.target.value)}
                              placeholder={`Teks Opsi ${key}`}
                              className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:border-rose-400"
                            />
                            <label className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer transition" title={`Upload Gambar Opsi ${key}`}>
                              <ImageIcon className="w-4 h-4 text-rose-600" />
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleOptionImageUpload(key, f);
                                }}
                                className="hidden"
                              />
                            </label>
                          </div>
                          {formOpsiGambar[key] && (
                            <div className="flex items-center gap-2 pl-6">
                              <img
                                src={formOpsiGambar[key]}
                                alt={`Gambar Opsi ${key}`}
                                className="h-12 w-auto max-w-[100px] rounded-lg border border-slate-300 object-contain bg-slate-50 cursor-pointer"
                                onClick={() => onOpenZoom(formOpsiGambar[key], `Preview Opsi ${key}`)}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveOptionImage(key)}
                                className="text-[11px] text-red-600 hover:underline cursor-pointer"
                              >
                                Hapus Gambar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {formTipe === 'benar_salah' && (
                <BenarSalahEditor
                  items={formBenarSalahItems}
                  onChange={setFormBenarSalahItems}
                />
              )}

              {formTipe === 'isian' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Kunci Jawaban Singkat (Gunakan tanda "/" untuk jawaban alternatif):
                    </label>
                    <span className="text-[11px] font-mono font-bold text-rose-600">
                      Toleransi huruf kapital & alternatif "/"
                    </span>
                  </div>
                  <input
                    type="text"
                    value={isianKunci}
                    onChange={(e) => setIsianKunci(e.target.value)}
                    placeholder="Contoh: Orang tua / ayah / ibu"
                    className="w-full px-3 py-2 rounded-xl border-2 border-rose-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-rose-500"
                  />
                  <p className="text-[11px] text-slate-500">
                    💡 <em>Contoh:</em> Jika siswa menjawab "ayah" atau "ibu" atau "orang tua" dengan huruf besar/kecil apapun, sistem otomatis menganggap jawaban benar.
                  </p>
                </div>
              )}

              {formTipe === 'uraian' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Rubrik / Kunci Uraian:</label>
                  <textarea
                    rows={2}
                    value={uraianKunci}
                    onChange={(e) => setUraianKunci(e.target.value)}
                    placeholder="Tuliskan kata kunci atau pedoman penskoran uraian..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:border-rose-400"
                  />
                </div>
              )}

              {formTipe === 'menjodohkan' && (
                <MenjodohkanEditor
                  data={formMenjodohkanData}
                  onChange={setFormMenjodohkanData}
                />
              )}
            </div>

            {/* Panel Pratinjau Matematika Live Sebelum Simpan */}
            <MathPreviewPanel
              judulTeks={formJudulTeks}
              pertanyaan={formPertanyaan}
              gambarUrl={formGambarUrl}
              gambarUrl2={formGambarUrl2}
              posisiGambar={formPosisiGambar}
              tipeSoal={formTipe}
              options={[
                { key: 'A', text: pgOptionA, isKey: formTipe === 'pg' ? pgKunci === 'A' : Boolean(pgkChecks.A), imageUrl: formOpsiGambar.A },
                { key: 'B', text: pgOptionB, isKey: formTipe === 'pg' ? pgKunci === 'B' : Boolean(pgkChecks.B), imageUrl: formOpsiGambar.B },
                { key: 'C', text: pgOptionC, isKey: formTipe === 'pg' ? pgKunci === 'C' : Boolean(pgkChecks.C), imageUrl: formOpsiGambar.C },
                { key: 'D', text: pgOptionD, isKey: formTipe === 'pg' ? pgKunci === 'D' : Boolean(pgkChecks.D), imageUrl: formOpsiGambar.D },
              ]}
              benarSalahItems={formBenarSalahItems}
              menjodohkanData={formMenjodohkanData}
              kunciText={
                formTipe === 'isian'
                  ? isianKunci
                  : formTipe === 'uraian'
                  ? uraianKunci
                  : undefined
              }
              accentTheme="indigo"
            />

            {/* Row 5: Action Buttons matching Image 1 */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div>
                {editingTkaQuestionId && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold text-xs border border-amber-300">
                    <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                    Sedang Mengedit Soal #{editingTkaQuestionId}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition"
                >
                  {editingTkaQuestionId ? 'Batal Edit' : 'Batal / Reset'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveTkaQuestion}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-md transition"
                >
                  <span>💾</span> {editingTkaQuestionId ? 'Simpan Perubahan Soal' : 'Simpan ke Bank Soal'}
                </button>
              </div>
            </div>
          </div>

          {/* ================= LIST OF CREATED TKA QUESTIONS (UNDERNEATH THE FORM) ================= */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            {tkaPackageBuckets.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider block">
                  Daftar Paket &amp; Mapel TKA Tersimpan (
                  {tkaPackageBuckets.filter((b) => isTKAPackageActive(tkaActivePackages, b.jenisTka, b.mapel)).length} Aktif dari {tkaPackageBuckets.length} Paket):
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterJenisTka('all');
                      setFilterMapelTka('all');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border inline-flex items-center gap-1.5 ${
                      filterJenisTka === 'all' && filterMapelTka === 'all'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300'
                    }`}
                  >
                    <span>Semua Paket ({tkaQuestions.length} Soal)</span>
                  </button>
                  {tkaPackageBuckets.map((b) => {
                    const isPkgOn = isTKAPackageActive(tkaActivePackages, b.jenisTka, b.mapel);
                    const isCurrentFilter =
                      filterJenisTka === b.jenisTka && filterMapelTka === b.mapel;
                    return (
                      <button
                        key={`top_chip_${b.jenisTka}_${b.mapel}`}
                        type="button"
                        onClick={() => {
                          setFilterJenisTka(b.jenisTka);
                          setFilterMapelTka(b.mapel);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border inline-flex items-center gap-2 ${
                          isCurrentFilter
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isPkgOn ? 'bg-emerald-400' : 'bg-slate-400'
                          }`}
                        />
                        <span>
                          {b.jenisTka} • {b.mapel} — {b.count}/{MAX_QUESTIONS_PER_PACKAGE} Soal (
                          {isPkgOn ? 'Aktif' : 'Nonaktif'})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-display font-black text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-amber-600" />
                  Daftar Soal TKA yang Sudah Dibuat
                </h3>
                <p className="text-xs text-slate-500">
                  Seluruh butir soal yang telah tersimpan di bank soal TKA SDN Rawa Badak Utara 21.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter Paket:
                </div>
                <select
                  value={filterJenisTka}
                  onChange={(e) => setFilterJenisTka(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-amber-900"
                >
                  <option value="all">Semua Paket TKA</option>
                  {TKA_JENIS_LIST.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                <select
                  value={filterMapelTka}
                  onChange={(e) => setFilterMapelTka(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700"
                >
                  <option value="all">Semua Mapel TKA</option>
                  {TKA_MAPEL_LIST.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <span className="text-xs font-bold bg-amber-50 text-amber-900 px-3 py-1.5 rounded-xl border border-amber-200">
                  Total:{' '}
                  <strong>
                    {filterJenisTka !== 'all' && filterMapelTka !== 'all'
                      ? `${filteredTkaQuestions.length} / ${MAX_QUESTIONS_PER_PACKAGE} Soal`
                      : `${filteredTkaQuestions.length} Soal`}
                  </strong>
                </span>
                {filterJenisTka !== 'all' && (
                  <>
                    <span className="text-xs font-bold bg-purple-50 text-purple-900 px-3 py-1.5 rounded-xl border border-purple-200 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-purple-600" />
                      Waktu: <strong>{getTKADurationMinutes(tkaDurations, filterJenisTka, filterMapelTka)} Menit</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleTkaPackageActive(filterJenisTka, filterMapelTka)}
                      className={`text-xs font-extrabold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                        (filterMapelTka === 'all'
                          ? tkaActivePackages[`${filterJenisTka}__ALL`] === true
                          : isTKAPackageActive(tkaActivePackages, filterJenisTka, filterMapelTka))
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                          : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                      }`}
                      title="Klik untuk mengaktifkan atau menonaktifkan paket TKA ini di halaman siswa"
                    >
                      {(filterMapelTka === 'all'
                        ? tkaActivePackages[`${filterJenisTka}__ALL`] === true
                        : isTKAPackageActive(tkaActivePackages, filterJenisTka, filterMapelTka)) ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Aktif di Siswa</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Belum Diaktifkan</span>
                        </>
                      )}
                    </button>
                  </>
                )}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setTkaDownloadMenuPos((prev) => (prev === 'list' ? null : 'list'))
                    }
                    className="text-xs font-extrabold px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1.5 transition cursor-pointer shadow-2xs whitespace-nowrap"
                    title="Unduh soal yang tampil pada filter saat ini"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Soal ({filteredTkaQuestions.length})</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {tkaDownloadMenuPos === 'list' && (
                    <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50 space-y-1 text-left">
                      <button
                        type="button"
                        onClick={() => handleDownloadTkaQuestions('word_only', true)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-sky-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>Naskah Soal (.DOC Word)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadTkaQuestions('word_key', true)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Soal + Kunci (.DOC Word)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadTkaQuestions('excel', true)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-amber-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Bank Soal (.XLSX Excel)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cards for each created TKA Question */}
            <div className="space-y-3.5">
              {filteredTkaQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-amber-400 transition bg-white space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-black text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-black uppercase bg-rose-100 text-rose-900 px-2.5 py-0.5 rounded-full border border-rose-200">
                        {q.jenisTka}
                      </span>
                      <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-200">
                        {q.mapel}
                      </span>
                      <span className="text-xs font-extrabold uppercase bg-sky-100 text-sky-800 px-2 py-0.5 rounded-md">
                        {q.tipe.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                        Bobot: {q.bobot} Poin
                      </span>
                      <button
                        type="button"
                        onClick={() => handleEditTkaQuestion(q)}
                        className="text-amber-600 hover:text-amber-800 p-1.5 rounded-lg hover:bg-amber-50 transition cursor-pointer"
                        title="Edit Butir Soal Ini"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {confirmDeleteTkaQId === q.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteTkaQuestion(q.id)}
                            className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-black cursor-pointer"
                          >
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTkaQId(null)}
                            className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTkaQId(q.id)}
                          className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                          title="Hapus Butir Soal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <QuestionContent
                    pertanyaan={q.pertanyaan}
                    judulTeks={q.judulTeks}
                    gambarUrl={q.gambarUrl}
                    gambarUrl2={q.gambarUrl2}
                    posisiGambar={q.posisiGambar}
                    onOpenZoom={onOpenZoom}
                    compact
                  />

                  {/* Options / Structured Tables display */}
                  {q.tipe === 'benar_salah' ? (
                    <div className="pt-1">
                      <BenarSalahTableView
                        items={resolveBenarSalahItems(q)}
                        showKeys
                        accentTheme="indigo"
                      />
                    </div>
                  ) : q.tipe === 'menjodohkan' ? (
                    (() => {
                      const matchData = resolveMenjodohkanData(q);
                      return matchData ? (
                        <div className="pt-1">
                          <MenjodohkanColumnsView
                            data={matchData}
                            showKeys
                            accentTheme="indigo"
                          />
                        </div>
                      ) : null;
                    })()
                  ) : q.opsi && q.opsi.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs text-slate-700">
                      {q.opsi.map((op, oIdx) => {
                        const optKey = ['A', 'B', 'C', 'D'][oIdx];
                        const optImg = q.opsiGambar?.[optKey];
                        const isKey =
                          Array.isArray(q.kunciJawaban)
                            ? q.kunciJawaban.includes(optKey) || q.kunciJawaban.includes(op)
                            : q.kunciJawaban === optKey || q.kunciJawaban === op;

                        return (
                          <div
                            key={oIdx}
                            className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
                              isKey
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black">{optKey}.</span>
                              <span className="flex-1 whitespace-pre-wrap">
                                <FormattedMathText text={op} />
                              </span>
                              {isKey && <span className="ml-auto text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">✓ Kunci</span>}
                            </div>
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar Opsi ${optKey}`}
                                className="h-14 w-auto max-w-[120px] rounded-lg border border-slate-300 object-contain bg-white cursor-pointer hover:opacity-90 mt-1"
                                onClick={() => onOpenZoom(optImg, `Gambar Opsi ${optKey}`)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {/* Answer key footer */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-600">Kunci Jawaban: </span>
                      <span className="font-mono font-bold text-rose-700">
                        <FormattedMathText
                          text={Array.isArray(q.kunciJawaban) ? q.kunciJawaban.join(', ') : String(q.kunciJawaban)}
                        />
                      </span>
                    </div>
                    {q.pembahasan && (
                      <span className="text-[11px] text-slate-500 italic max-w-lg truncate">
                        <FormattedMathText text={q.pembahasan} />
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {filteredTkaQuestions.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-400 italic bg-slate-50 rounded-2xl border">
                  Belum ada butir soal pada filter ini. Gunakan form di atas untuk menambahkan butir soal TKA.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= 3B. SUB-MENU PENGATURAN SOAL, WAKTU UJIAN & ACAK TKA ================= */}
      {subType === 'pengaturan-tka' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                  Menu TKA • Pengaturan Soal &amp; Ujian TKA
                </span>
                <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-600" /> Pengaturan Soal, Waktu Ujian &amp; Acak Soal TKA
                </h2>
                <p className="text-xs text-slate-500">
                  Kelola aktivasi paket soal TKA agar tampil di dashboard siswa, batas waktu pengerjaan (auto-submit), serta pengacakan soal dan pilihan jawaban.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={durPanelPaket}
                  onChange={(e) => setDurPanelPaket(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-amber-500"
                  title="Pilih Paket Target TKA"
                >
                  {TKA_JENIS_LIST.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={durPanelMapel}
                  onChange={(e) => setDurPanelMapel(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-amber-500"
                  title="Pilih Mata Pelajaran TKA"
                >
                  <option value="all">Semua Mapel (Gabungan Paket)</option>
                  {TKA_MAPEL_LIST.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-5">
              {/* Setting Aktivasi Paket Soal TKA (Wajib Diaktifkan Agar Muncul di Siswa) */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-sky-50 via-white to-purple-50 border-2 border-sky-300 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-md shrink-0 ${
                        (durPanelMapel === 'all'
                          ? tkaActivePackages[`${durPanelPaket}__ALL`] === true
                          : isTKAPackageActive(tkaActivePackages, durPanelPaket, durPanelMapel))
                          ? 'bg-emerald-600 shadow-emerald-500/20'
                          : 'bg-slate-700 shadow-slate-500/20'
                      }`}
                    >
                      <Power className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-display font-black text-slate-800 flex flex-wrap items-center gap-2">
                        <span>Pengaturan Aktivasi Paket Soal TKA</span>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                            (durPanelMapel === 'all'
                              ? tkaActivePackages[`${durPanelPaket}__ALL`] === true
                              : isTKAPackageActive(tkaActivePackages, durPanelPaket, durPanelMapel))
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {(durPanelMapel === 'all'
                            ? tkaActivePackages[`${durPanelPaket}__ALL`] === true
                            : isTKAPackageActive(tkaActivePackages, durPanelPaket, durPanelMapel))
                            ? 'Aktif di Siswa'
                            : 'Belum Diaktifkan'}
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Paket TKA yang belum diaktifkan tidak akan muncul di dashboard siswa. Aktifkan paket atau mata pelajaran yang siap dikerjakan.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleTkaPackageActive(durPanelPaket, durPanelMapel)}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-display font-black inline-flex items-center gap-2 transition cursor-pointer shadow-xs whitespace-nowrap shrink-0 ${
                      (durPanelMapel === 'all'
                        ? tkaActivePackages[`${durPanelPaket}__ALL`] === true
                        : isTKAPackageActive(tkaActivePackages, durPanelPaket, durPanelMapel))
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {(durPanelMapel === 'all'
                      ? tkaActivePackages[`${durPanelPaket}__ALL`] === true
                      : isTKAPackageActive(tkaActivePackages, durPanelPaket, durPanelMapel)) ? (
                      <>
                        <EyeOff className="w-4 h-4" />
                        <span>
                          Nonaktifkan {durPanelPaket}
                          {durPanelMapel !== 'all' ? ` (${durPanelMapel.split(' ')[0]})` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <Power className="w-4 h-4" />
                        <span>
                          Aktifkan {durPanelPaket}
                          {durPanelMapel !== 'all' ? ` (${durPanelMapel.split(' ')[0]})` : ''}
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {/* Daftar Status Paket TKA Tersedia di Bank Soal */}
                {tkaPackageBuckets.length > 0 && (
                  <div className="pt-3 border-t border-sky-200/80 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-slate-700">
                        Status Paket Soal TKA Tersedia (
                        {
                          tkaPackageBuckets.filter((b) =>
                            isTKAPackageActive(tkaActivePackages, b.jenisTka, b.mapel)
                          ).length
                        }
                        /{tkaPackageBuckets.length} Aktif):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSetAllTkaPackagesActive(true)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-bold transition cursor-pointer"
                        >
                          Aktifkan Semua
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetAllTkaPackagesActive(false)}
                          className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] font-bold transition cursor-pointer"
                        >
                          Nonaktifkan Semua
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {tkaPackageBuckets.map((b) => {
                        const isPkgOn = isTKAPackageActive(tkaActivePackages, b.jenisTka, b.mapel);
                        const mins = getTKADurationMinutes(tkaDurations, b.jenisTka, b.mapel);
                        return (
                          <div
                            key={`tka_act_${b.jenisTka}_${b.mapel}`}
                            className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                              isPkgOn ? 'bg-emerald-50/70 border-emerald-300' : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">
                                {b.jenisTka} · {b.mapel}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {b.count} Butir Soal · {mins} Menit
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleTkaPackageActive(b.jenisTka, b.mapel)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold shrink-0 whitespace-nowrap cursor-pointer transition ${
                                isPkgOn
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                              }`}
                            >
                              {isPkgOn ? 'Aktif ✓' : 'Nonaktif'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Paket Contoh Tryout TKA Bawaan */}
                <div className="pt-2 border-t border-sky-200/70 space-y-2">
                  <span className="text-[11px] font-bold text-slate-600 block">
                    Paket Contoh Tryout TKA Bawaan (Default Nonaktif agar tidak muncul sebelum diaktifkan):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {SAMPLE_TKA_DEFAULTS_META.map((smp) => {
                      const isSampleOn = isTKAPackageActive(tkaActivePackages, smp.jenisTka, smp.mapel);
                      return (
                        <div
                          key={`${smp.jenisTka}_${smp.mapel}`}
                          className={`px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2 text-[11px] ${
                            isSampleOn ? 'bg-emerald-50/70 border-emerald-300' : 'bg-white/80 border-slate-200'
                          }`}
                        >
                          <span className="font-semibold text-slate-700 truncate">{smp.label}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleTkaPackageActive(smp.jenisTka, smp.mapel)}
                            className={`px-2.5 py-1 rounded-lg font-extrabold shrink-0 cursor-pointer transition ${
                              isSampleOn
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                            }`}
                          >
                            {isSampleOn ? 'Aktif ✓' : 'Nonaktif'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Setting Waktu Pengerjaan Soal TKA (Auto-Submit) */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-purple-50 via-white to-amber-50 border-2 border-purple-300 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-display font-black text-slate-800 flex items-center gap-2">
                        Pengaturan Waktu Pengerjaan Soal TKA
                        <span className="text-[10px] font-extrabold uppercase bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full">
                          Auto-Submit Timer
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Atur batas waktu pengerjaan per paket dan mata pelajaran TKA (tersinkron otomatis ke ruang ujian siswa).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Paket / Jenis TKA</label>
                    <select
                      value={durPanelPaket}
                      onChange={(e) => setDurPanelPaket(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                    >
                      {TKA_JENIS_LIST.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Mata Pelajaran</label>
                    <select
                      value={durPanelMapel}
                      onChange={(e) => setDurPanelMapel(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                    >
                      <option value="all">Semua Mapel (Gabungan Paket)</option>
                      {TKA_MAPEL_LIST.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Durasi (Menit)</label>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={durPanelMinutes || ''}
                      onChange={(e) => setDurPanelMinutes(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border-2 border-amber-400 bg-white text-xs font-black text-center text-slate-900 outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => handleSaveTkaDuration(durPanelPaket, durPanelMapel, durPanelMinutes)}
                      className="w-full py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-display font-black text-xs shadow-xs cursor-pointer transition"
                    >
                      Simpan Waktu
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[11px] font-bold text-slate-500 mr-1">Pilihan Cepat:</span>
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setDurPanelMinutes(m);
                        handleSaveTkaDuration(durPanelPaket, durPanelMapel, m);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer transition ${
                        durPanelMinutes === m
                          ? 'bg-purple-600 text-white border-purple-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-purple-50'
                      }`}
                    >
                      {m} Menit
                    </button>
                  ))}
                </div>
              </div>

              {/* Setting Acak Soal & Acak Jawaban TKA */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-50 via-white to-rose-50 border-2 border-amber-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                    <Shuffle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-display font-black text-slate-800 flex items-center gap-2">
                      Pengaturan Acak Soal & Pilihan Jawaban TKA
                      <span className="text-[10px] font-extrabold uppercase bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full">
                        Tes Siswa
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Ketika diaktifkan guru/admin, susunan butir soal dan opsi pilihan jawaban otomatis teracak ketika siswa mengerjakan tes TKA & Simulasi.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className={`px-4 py-2.5 rounded-2xl border-2 text-xs font-display font-extrabold flex items-center gap-2 cursor-pointer transition select-none shadow-2xs ${
                    acakSoalTka ? 'bg-amber-600 border-amber-700 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}>
                    <input
                      type="checkbox"
                      checked={acakSoalTka}
                      onChange={(e) => {
                        setAcakSoalTka(e.target.checked);
                        showToast(`Setting Acak Soal TKA: ${e.target.checked ? 'AKTIF' : 'NONAKTIF'}`, 'success');
                      }}
                      className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                    />
                    <span>Acak Soal TKA</span>
                  </label>

                  <label className={`px-4 py-2.5 rounded-2xl border-2 text-xs font-display font-extrabold flex items-center gap-2 cursor-pointer transition select-none shadow-2xs ${
                    acakJawabanTka ? 'bg-amber-600 border-amber-700 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}>
                    <input
                      type="checkbox"
                      checked={acakJawabanTka}
                      onChange={(e) => {
                        setAcakJawabanTka(e.target.checked);
                        showToast(`Setting Acak Jawaban TKA: ${e.target.checked ? 'AKTIF' : 'NONAKTIF'}`, 'success');
                      }}
                      className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                    />
                    <span>Acak Jawaban TKA</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= 4. SUB-MENU ANALISIS SOAL TKA ================= */}
      {subType === 'analisis-tka' && (() => {
        const questionsForSelectedPaket = tkaQuestions.filter(
          (q) => analisisPaketTka === 'all' || q.jenisTka === analisisPaketTka
        );
        const availableAnalisisMapels = Array.from(
          new Set([...TKA_MAPEL_LIST, ...questionsForSelectedPaket.map((q) => q.mapel)])
        ).filter((m) => questionsForSelectedPaket.some((q) => q.mapel === m));
        const effectiveSelectedMapels = selectedAnalisisMapels.filter((m) =>
          availableAnalisisMapels.includes(m)
        );

        const filteredAnalisisQuestions = questionsForSelectedPaket.filter((q) => {
          if (effectiveSelectedMapels.length === 0) return false;
          if (!effectiveSelectedMapels.includes(q.mapel)) return false;
          return true;
        });

        // Submissions matching selected term, package & excluding ABK set to Tidak Masuk TKA
        const relevantSubmissions = tkaSubmissions.filter((s) => {
          if (isExcludedTkaSubmission(s)) return false;
          if (!doesRecordMatchTerm(s, activeYear, activeSemester)) return false;
          if (analisisPaketTka !== 'all') {
            const baseSubPaket = s.paketDasar || extractBaseTkaPaket(s.paket);
            if (baseSubPaket !== analisisPaketTka && s.paket !== analisisPaketTka) return false;
          }
          return true;
        });

        const totalPesertaSub = relevantSubmissions.length;
        const isDefaultTkaTerm = activeYear === '2026/2027' && isSemesterOneLabel(activeSemester);
        const rawAnalisisList =
          !isDefaultTkaTerm && totalPesertaSub === 0
            ? []
            : filteredAnalisisQuestions;
        const totalAnalisis = rawAnalisisList.length;

        const analisisList = rawAnalisisList.map((q) => {
          const rawKesukaran = (q as any).tingkatKesukaran || 'Sedang';
          const qNormMapel = normalizeTkaMapelKey(q.mapel);

          // Saring peserta yang mengerjakan butir/mapel soal ini
          const questionParticipants = relevantSubmissions.filter((sub) => {
            if (sub.answers && q.id in sub.answers) return true;
            if (!sub.completedMapels || sub.completedMapels.length === 0) return true;
            return sub.completedMapels.includes(qNormMapel);
          });

          if (questionParticipants.length === 0) {
            return {
              ...q,
              tkLabel: rawKesukaran,
              tkValue: rawKesukaran === 'Mudah' ? 0.75 : rawKesukaran === 'Sukar' ? 0.25 : 0.50,
              pct: 0,
              dpValue: 0,
              dpLabel: 'Belum Diuji',
              status: 'Kosong',
              pesertaCount: 0,
              correctCount: 0,
            };
          }

          let correctCount = 0;
          questionParticipants.forEach((sub) => {
            const studentAns = sub.answers ? sub.answers[q.id] : undefined;
            const evalResult = evaluateQuestionScore(
              q.tipe,
              studentAns,
              q.kunciJawaban,
              q.bobot || 10,
              q.opsi,
              q
            );
            if (evalResult.isCorrect) correctCount++;
          });

          const pesertaQ = questionParticipants.length;
          const pct = Math.round((correctCount / pesertaQ) * 100);
          const tkValue = Number((correctCount / pesertaQ).toFixed(2));
          const tkLabel = pct >= 70 ? 'Mudah' : pct >= 30 ? 'Sedang' : 'Sukar';

          // Daya Pembeda: Upper half vs Lower half
          const sortedSubs = [...questionParticipants].sort((a, b) => b.skorTotal - a.skorTotal);
          const half = Math.max(1, Math.floor(sortedSubs.length / 2));
          const upperGroup = sortedSubs.slice(0, half);
          const lowerGroup = sortedSubs.slice(sortedSubs.length - half);

          let upperCorrect = 0;
          upperGroup.forEach((sub) => {
            const res = evaluateQuestionScore(
              q.tipe,
              sub.answers ? sub.answers[q.id] : undefined,
              q.kunciJawaban,
              q.bobot || 10,
              q.opsi,
              q
            );
            if (res.isCorrect) upperCorrect++;
          });

          let lowerCorrect = 0;
          lowerGroup.forEach((sub) => {
            const res = evaluateQuestionScore(
              q.tipe,
              sub.answers ? sub.answers[q.id] : undefined,
              q.kunciJawaban,
              q.bobot || 10,
              q.opsi,
              q
            );
            if (res.isCorrect) lowerCorrect++;
          });

          const dpValue = Number(((upperCorrect - lowerCorrect) / half).toFixed(2));
          const dpLabel = dpValue >= 0.40 ? 'Sangat Baik' : dpValue >= 0.20 ? 'Baik' : 'Perlu Revisi';
          const status = dpValue >= 0.20 ? 'Valid & Diterima' : 'Perlu Revisi';

          return {
            ...q,
            tkLabel,
            tkValue,
            pct,
            dpValue,
            dpLabel,
            status,
            pesertaCount: pesertaQ,
            correctCount,
          };
        });

        const countMudah = analisisList.filter((a) => a.tkLabel === 'Mudah').length;
        const countSedang = analisisList.filter((a) => a.tkLabel === 'Sedang').length;
        const countSukar = analisisList.filter((a) => a.tkLabel === 'Sukar').length;
        const testedAnalisisList = analisisList.filter((a) => a.pesertaCount > 0);
        const avgPct = testedAnalisisList.length > 0
          ? Math.round(testedAnalisisList.reduce((acc, c) => acc + c.pct, 0) / testedAnalisisList.length)
          : 0;

        const handleExportExcelTka = () => {
          const mapelLabel = effectiveSelectedMapels.length === 0
            ? 'Tidak Ada Mapel Terpilih'
            : availableAnalisisMapels.length > 0 && effectiveSelectedMapels.length === availableAnalisisMapels.length
            ? `Semua Mapel Tersedia (${availableAnalisisMapels.length} Mapel)`
            : effectiveSelectedMapels.join(', ');
          const wsData = [
            ['ANALISIS BUTIR SOAL TES KEMAMPUAN AKADEMIK (TKA)'],
            ['SDN RAWA BADAK UTARA 21 - JAKARTA UTARA'],
            [`Mata Pelajaran: ${mapelLabel}`],
            [`Paket TKA: ${analisisPaketTka === 'all' ? 'Semua Paket' : analisisPaketTka}`],
            [`Jumlah Siswa Mengerjakan: ${totalPesertaSub} Siswa`],
            [],
            ['No', 'Butir Pertanyaan TKA', 'Paket TKA', 'Mata Pelajaran', 'Tipe', 'Tingkat Kesukaran', 'Ketuntasan Siswa (%)', 'Daya Pembeda', 'Status Butir'],
            ...analisisList.map((q, idx) => [
              idx + 1,
              q.pertanyaan,
              q.jenisTka,
              q.mapel,
              q.tipe,
              q.tkLabel,
              `${q.pct}%`,
              q.dpValue,
              q.status,
            ]),
          ];

          const ws = XLSX.utils.aoa_to_sheet(wsData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Analisis TKA');
          XLSX.writeFile(wb, `Analisis_TKA_${effectiveSelectedMapels.length}_Mapel_${analisisPaketTka}.xlsx`);
        };

        return (
          <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                  Menu TKA • Analitik & Evaluasi Soal
                </span>
                <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-amber-600" /> Analisis Butir Soal TKA & Grafik Ketuntasan
                </h2>
                <p className="text-xs text-slate-500">
                  Evaluasi tingkat kesukaran soal, daya pembeda, dan grafik ketuntasan peserta didik terkoneksi dengan hasil ujian siswa ({totalPesertaSub} siswa mengerjakan).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isSyncingTkaCloud}
                  onClick={handleRefreshTkaFromCloud}
                  className="bg-sky-50 hover:bg-sky-100 disabled:opacity-60 text-sky-800 font-display font-black px-3.5 py-2 rounded-xl text-xs border border-sky-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Tarik & sinkronkan hasil pengerjaan TKA terbaru dari Cloud Firestore"
                >
                  <RefreshCw className={`w-4 h-4 text-sky-600 ${isSyncingTkaCloud ? 'animate-spin' : ''}`} />{' '}
                  {isSyncingTkaCloud ? 'Menyinkronkan...' : 'Segarkan Cloud'}
                </button>
                <button
                  type="button"
                  onClick={() => handleClearSubmissions('analisis', analisisPaketTka)}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-display font-black px-3.5 py-2 rounded-xl text-xs border border-rose-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Kosongkan data analisis dan hasil TKA"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" /> Kosongkan Data
                </button>
                <button
                  type="button"
                  disabled={isSeedingTka}
                  onClick={handleSeedSimulatedSubmissions}
                  className="bg-purple-50 hover:bg-purple-100 disabled:opacity-60 text-purple-800 font-display font-black px-3.5 py-2 rounded-xl text-xs border border-purple-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Simulasikan pengerjaan seluruh siswa Kelas 6"
                >
                  <Sparkles className="w-4 h-4 text-purple-600" />{' '}
                  {isSeedingTka ? 'Memuat Simulasi...' : `Simulasikan Siswa (${tkaStudents.length})`}
                </button>
                <button
                  type="button"
                  onClick={handleExportExcelTka}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-900 font-display font-black px-3.5 py-2 rounded-xl text-xs border border-amber-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <FileSpreadsheet className="w-4 h-4 text-amber-700" /> Ekspor Excel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-display font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <Download className="w-4 h-4" /> Cetak
                </button>
              </div>
            </div>

            {totalPesertaSub === 0 && (
              <div className="bg-amber-50/80 p-4 rounded-2xl border-2 border-amber-300 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-lg">
                    ℹ️
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-900">Data Analisis TKA Saat Ini Masih Kosong</h4>
                    <p className="text-[11px] text-amber-800 font-medium">
                      Belum ada siswa yang mengerjakan soal pada paket ini. Siswa dapat login dan mengerjakan melalui menu <strong>"Tes Kemampuan Akademik (TKA)"</strong>, atau klik tombol di sebelah kanan untuk memuat simulasi pengerjaan.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSeedingTka}
                  onClick={handleSeedSimulatedSubmissions}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                >
                  <Sparkles className="w-4 h-4" />{' '}
                  {isSeedingTka ? 'Memuat Simulasi...' : `Muat Simulasi (${tkaStudents.length} Siswa)`}
                </button>
              </div>
            )}

            {/* Filter Controls: Multi-Select Checkboxes Mapel TKA & Dropdown Paket TKA */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div>
                    <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-amber-600" />
                      Filter Mata Pelajaran TKA (Centang untuk Memilih 1, 2, atau Semua Mapel):
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Jika mapel tidak dicentang, maka butir soal dan data analisis mapel tersebut tidak akan dimunculkan.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAnalisisMapels([...availableAnalisisMapels])}
                      className="text-[11px] font-bold text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      Pilih Semua ({availableAnalisisMapels.length} Mapel)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAnalisisMapels([])}
                      className="text-[11px] font-bold text-slate-600 hover:text-rose-700 bg-slate-200 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      Kosongkan Pilihan
                    </button>
                  </div>
                </div>

                {/* Checkbox cards hanya untuk mapel yang memiliki soal pada paket ini */}
                {availableAnalisisMapels.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-500 italic">
                    Belum ada butir soal TKA untuk paket ini.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    {availableAnalisisMapels.map((m) => {
                      const isChecked = effectiveSelectedMapels.includes(m);
                      const countQ = questionsForSelectedPaket.filter((q) => q.mapel === m).length;
                      return (
                        <label
                          key={m}
                          className={`flex items-center justify-between gap-2 p-3 rounded-xl border text-xs font-bold cursor-pointer transition select-none ${
                            isChecked
                              ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-amber-400'
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedAnalisisMapels(selectedAnalisisMapels.filter((x) => x !== m));
                                } else {
                                  setSelectedAnalisisMapels([...selectedAnalisisMapels, m]);
                                }
                              }}
                              className="w-4 h-4 rounded text-amber-600 accent-amber-600 shrink-0"
                            />
                            <span className="truncate">{m}</span>
                          </span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                              isChecked ? 'bg-amber-700 text-amber-50' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {countQ}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 max-w-md">
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Filter Paket / Jenis Soal TKA:
                  </label>
                  <select
                    value={analisisPaketTka}
                    onChange={(e) => setAnalisisPaketTka(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none shadow-2xs cursor-pointer focus:border-amber-500"
                  >
                    <option value="all">Semua Paket (Simulasi 1 – 6 & Try Out 1 – 6)</option>
                    {TKA_JENIS_LIST.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-right text-xs text-slate-500 font-medium">
                  Mapel Terpilih: <strong className="text-amber-800 font-black">{effectiveSelectedMapels.length} dari {availableAnalisisMapels.length} Mapel</strong>
                </div>
              </div>
            </div>

            {/* Jika tidak ada mapel yang dipilih */}
            {effectiveSelectedMapels.length === 0 && (
              <div className="p-8 text-center bg-amber-50 rounded-2xl border-2 border-amber-300 space-y-2">
                <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                <h3 className="font-display font-black text-sm text-amber-900">
                  Tidak Ada Mata Pelajaran yang Dipilih
                </h3>
                <p className="text-xs text-amber-800 max-w-md mx-auto">
                  Silakan centang minimal 1 mata pelajaran pada pilihan di atas untuk menampilkan hasil analisis butir soal, grafik ketuntasan, dan daya pembeda TKA.
                </p>
                {availableAnalisisMapels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAnalisisMapels([...availableAnalisisMapels])}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 cursor-pointer shadow-xs"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Pilih Semua Mata Pelajaran Tersedia
                  </button>
                )}
              </div>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <span className="text-xs font-bold text-amber-800 uppercase">Soal Teranalisis</span>
                <div className="text-2xl font-display font-black text-slate-900 mt-1">
                  {totalAnalisis} Butir
                </div>
                <span className="text-[11px] text-slate-500 truncate block">
                  {effectiveSelectedMapels.length === 0
                    ? 'Tidak ada mapel'
                    : availableAnalisisMapels.length > 0 && effectiveSelectedMapels.length === availableAnalisisMapels.length
                    ? `Seluruh Mapel Tersedia (${availableAnalisisMapels.length} Mapel)`
                    : effectiveSelectedMapels.join(', ')}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                <span className="text-xs font-bold text-emerald-800 uppercase">Rata-rata Ketuntasan</span>
                <div className="text-2xl font-display font-black text-emerald-700 mt-1">{avgPct}%</div>
                <span className="text-[11px] text-emerald-800">Seluruh Siswa Kelas 6 ({tkaStudents.length} Siswa)</span>
              </div>
              <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200">
                <span className="text-xs font-bold text-sky-800 uppercase">Komposisi Kesukaran</span>
                <div className="text-sm font-black text-slate-800 mt-1.5 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs">{countMudah} Mudah</span>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">{countSedang} Sedang</span>
                  <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-xs">{countSukar} Sukar</span>
                </div>
                <span className="text-[11px] text-slate-500">Standar Ujian TKA</span>
              </div>
            </div>

            {/* GRAFIK DATA ANALISIS TKA */}
            <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                  <h3 className="font-display font-black text-sm text-slate-900">
                    Visualisasi Grafik Analisis Soal TKA
                  </h3>
                </div>

                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setAnalisisChartTab('kesukaran')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      analisisChartTab === 'kesukaran'
                        ? 'bg-amber-600 text-white font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tingkat Kesukaran
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalisisChartTab('ketuntasan')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      analisisChartTab === 'ketuntasan'
                        ? 'bg-amber-600 text-white font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Ketuntasan Siswa
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalisisChartTab('pembeda')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      analisisChartTab === 'pembeda'
                        ? 'bg-amber-600 text-white font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Daya Pembeda
                  </button>
                </div>
              </div>

              {/* Chart 1: Tingkat Kesukaran TKA */}
              {analisisChartTab === 'kesukaran' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  <div className="md:col-span-5 flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-200">
                    <div className="relative w-36 h-36 flex items-center justify-center">
                      <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                        <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#E2E8F0" strokeWidth="3.5" />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="transparent"
                          stroke="#10B981"
                          strokeWidth="3.8"
                          strokeDasharray={`${totalAnalisis > 0 ? Math.round((countMudah / totalAnalisis) * 100) : 0} 100`}
                          strokeDashoffset="0"
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="transparent"
                          stroke="#F59E0B"
                          strokeWidth="3.8"
                          strokeDasharray={`${totalAnalisis > 0 ? Math.round((countSedang / totalAnalisis) * 100) : 0} 100`}
                          strokeDashoffset={`-${totalAnalisis > 0 ? Math.round((countMudah / totalAnalisis) * 100) : 0}`}
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="transparent"
                          stroke="#F43F5E"
                          strokeWidth="3.8"
                          strokeDasharray={`${totalAnalisis > 0 ? Math.round((countSukar / totalAnalisis) * 100) : 0} 100`}
                          strokeDashoffset={`-${totalAnalisis > 0 ? Math.round(((countMudah + countSedang) / totalAnalisis) * 100) : 0}`}
                        />
                      </svg>
                      <div className="absolute text-center">
                        <span className="text-xl font-display font-black text-slate-800">{totalAnalisis}</span>
                        <span className="block text-[10px] font-bold text-slate-400">Soal TKA</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-3 mt-3 text-xs font-bold">
                      <span className="flex items-center gap-1 text-emerald-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Mudah ({countMudah})
                      </span>
                      <span className="flex items-center gap-1 text-amber-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Sedang ({countSedang})
                      </span>
                      <span className="flex items-center gap-1 text-rose-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Sukar ({countSukar})
                      </span>
                    </div>
                  </div>

                  <div className="md:col-span-7 space-y-3 bg-white p-4 rounded-2xl border border-slate-200">
                    <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                      Distribusi Tingkat Kesukaran Soal TKA:
                    </h4>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Soal Mudah
                        </span>
                        <span className="font-mono text-emerald-700 font-extrabold">
                          {countMudah} Soal ({totalAnalisis > 0 ? Math.round((countMudah / totalAnalisis) * 100) : 0}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${totalAnalisis > 0 ? (countMudah / totalAnalisis) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span> Soal Sedang
                        </span>
                        <span className="font-mono text-amber-700 font-extrabold">
                          {countSedang} Soal ({totalAnalisis > 0 ? Math.round((countSedang / totalAnalisis) * 100) : 0}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-amber-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${totalAnalisis > 0 ? (countSedang / totalAnalisis) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span> Soal Sukar / Penalaran
                        </span>
                        <span className="font-mono text-rose-700 font-extrabold">
                          {countSukar} Soal ({totalAnalisis > 0 ? Math.round((countSukar / totalAnalisis) * 100) : 0}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-rose-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${totalAnalisis > 0 ? (countSukar / totalAnalisis) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Chart 2: Ketuntasan Siswa TKA Per Nomor Soal */}
              {analisisChartTab === 'ketuntasan' && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                      Grafik Batang Ketuntasan Siswa TKA Per Butir Soal:
                    </h4>
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Target Kelulusan TKA: 80%
                    </span>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    {analisisList.map((a, idx) => {
                      const isHigh = a.pct >= 80;
                      return (
                        <div key={a.id || idx} className="space-y-1">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-bold text-slate-800 truncate">
                              No. {idx + 1} ({a.jenisTka} • {a.mapel})
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                DP: {a.dpValue.toFixed(2)}
                              </span>
                              <span
                                className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                                  isHigh ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {a.pct}% Tuntas
                              </span>
                            </div>
                          </div>
                          <div className="relative w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                            <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-slate-400 z-10" title="Target 80%"></div>
                            <div
                              className={`h-3.5 rounded-full transition-all duration-500 ${
                                isHigh ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${a.pct}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chart 3: Daya Pembeda TKA */}
              {analisisChartTab === 'pembeda' && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-900 uppercase">Sangat Baik (DP ≥ 0.40)</span>
                        <span className="text-xl font-display font-black text-emerald-700">
                          {analisisList.filter((a) => a.dpValue >= 0.40).length} Soal
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 leading-relaxed">
                        Butir soal mampu menyaring dan membedakan kemampuan akademik siswa kelas 6 dengan sangat tajam.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-900 uppercase">Baik &amp; Perlu Tinjauan (DP &lt; 0.40)</span>
                        <span className="text-xl font-display font-black text-amber-700">
                          {analisisList.filter((a) => a.dpValue < 0.40).length} Soal
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        Dapat dipertahankan untuk DP ≥ 0.20 atau disempurnakan dengan memperkuat opsi distraktor/pengecoh.
                      </p>
                    </div>
                  </div>

                  {/* Per-Question DP Breakdown */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                        Nilai Daya Pembeda (DP) Tiap Butir Soal TKA:
                      </h4>
                      <span className="text-[11px] text-slate-500 font-semibold">
                        Skala DP: -1.00 s/d +1.00 (Ideal ≥ 0.20)
                      </span>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {analisisList.map((a, idx) => {
                        const dpBarWidth = Math.max(0, Math.min(100, Math.round(a.dpValue * 100)));
                        const dpBadgeClass =
                          a.pesertaCount === 0
                            ? 'bg-slate-100 text-slate-600'
                            : a.dpValue >= 0.4
                            ? 'bg-emerald-100 text-emerald-800'
                            : a.dpValue >= 0.2
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-rose-100 text-rose-800';
                        const dpBarClass =
                          a.pesertaCount === 0
                            ? 'bg-slate-300'
                            : a.dpValue >= 0.4
                            ? 'bg-emerald-500'
                            : a.dpValue >= 0.2
                            ? 'bg-sky-500'
                            : 'bg-rose-500';
                        return (
                          <div key={`dp_${a.id || idx}`} className="space-y-1">
                            <div className="flex items-center justify-between text-xs gap-2">
                              <span className="font-bold text-slate-800 truncate">
                                No. {idx + 1} ({a.jenisTka} • {a.mapel})
                              </span>
                              <span className={`font-mono font-black text-[11px] px-2 py-0.5 rounded-md shrink-0 ${dpBadgeClass}`}>
                                DP: {a.dpValue.toFixed(2)} • {a.dpLabel}
                              </span>
                            </div>
                            <div className="relative w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                              <div
                                className={`h-3 rounded-full transition-all duration-500 ${dpBarClass}`}
                                style={{ width: `${dpBarWidth}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Analysis Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-black text-sm text-slate-800">
                  Tabel Rincian Analisis Butir Soal TKA ({totalAnalisis} Butir)
                </h3>
              </div>

              <div className="overflow-x-auto border-2 border-slate-200 rounded-3xl shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
                      <th className="p-3 w-10 text-center">No</th>
                      <th className="p-3 min-w-[200px]">Butir Pertanyaan TKA</th>
                      <th className="p-3 text-center">Paket TKA</th>
                      <th className="p-3 text-center">Mapel</th>
                      <th className="p-3 text-center">Tipe</th>
                      <th className="p-3 text-center">Tingkat Kesukaran (TK)</th>
                      <th className="p-3 text-center">Daya Pembeda (DP)</th>
                      <th className="p-3 text-center">Ketuntasan Siswa</th>
                      <th className="p-3 text-center">Status Analisis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analisisList.map((q, idx) => (
                      <tr key={q.id || idx} className="hover:bg-slate-50 transition">
                        <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="p-3 font-medium text-slate-800 max-w-md truncate" title={stripQuestionTags(q.pertanyaan)}>
                          {stripQuestionTags(q.pertanyaan)}
                        </td>
                        <td className="p-3 text-center font-bold text-amber-900">{q.jenisTka}</td>
                        <td className="p-3 text-center font-semibold text-slate-700">{q.mapel}</td>
                        <td className="p-3 text-center uppercase font-bold text-slate-600">{q.tipe}</td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                              q.tkLabel === 'Mudah'
                                ? 'bg-emerald-100 text-emerald-800'
                                : q.tkLabel === 'Sedang'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {q.tkLabel} ({q.tkValue.toFixed(2)})
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                              q.pesertaCount === 0
                                ? 'bg-slate-100 text-slate-600'
                                : q.dpValue >= 0.4
                                ? 'bg-emerald-100 text-emerald-800'
                                : q.dpValue >= 0.2
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {q.dpValue.toFixed(2)} • {q.dpLabel}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-black text-emerald-700">
                          {q.pct}%
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                              q.pesertaCount === 0
                                ? 'bg-slate-100 text-slate-600'
                                : q.status.includes('Revisi')
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {q.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {analisisList.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                          {effectiveSelectedMapels.length === 0
                            ? 'Tidak ada mata pelajaran yang dipilih. Silakan centang minimal 1 mata pelajaran pada filter di atas.'
                            : !isDefaultTkaTerm && totalPesertaSub === 0
                            ? `Belum ada data analisis dan hasil tes TKA pada ${activeSemester} (${activeYear}).`
                            : 'Tidak ada butir soal TKA yang cocok dengan filter Mata Pelajaran & Paket yang dipilih.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ============================================================== */}
      {/* 5. MENU REPORT & HASIL TKA SISWA                               */}
      {/* ============================================================== */}
      {/* ============================================================== */}
      {/* 5. MENU REPORT & HASIL TKA SISWA                               */}
      {/* ============================================================== */}
      {subType === 'hasil-tka' && (() => {
        // Read directly from real student test submissions for active term, excluding ABK set to Tidak Masuk TKA
        const recordsForPaket = tkaSubmissions
          .filter((sub) => {
            if (isExcludedTkaSubmission(sub)) return false;
            if (!doesRecordMatchTerm(sub, activeYear, activeSemester)) return false;
            if (hasilPaketTka === 'all') return true;
            const baseSubPaket = sub.paketDasar || extractBaseTkaPaket(sub.paket);
            return baseSubPaket === hasilPaketTka || sub.paket === hasilPaketTka;
          })
          .map((sub) => {
            const completed = Array.isArray(sub.completedMapels)
              ? sub.completedMapels.map((m) => normalizeTkaMapelKey(m))
              : [];
            const hasMapel = (key: TKAMapelScoreKey) => {
              if (completed.length > 0) return completed.includes(key);
              return Number(sub.scoresPerMapel?.[key] ?? 0) > 0;
            };
            const resolvedFoto =
              sub.fotoUrl ||
              studentPhotoMap.get(sub.studentId) ||
              studentPhotoMap.get(sub.nisn) ||
              DEFAULT_STUDENT_AVATAR_URL;
            return {
              ...sub,
              id: sub.id,
              studentId: sub.studentId,
              nama: sub.studentName,
              nisn: sub.nisn,
              kelas: sub.kelas,
              fotoUrl: resolvedFoto,
              paket: sub.paketDasar || extractBaseTkaPaket(sub.paket),
              completedMapels: completed,
              skorIndo: hasMapel('Bahasa Indonesia') ? (sub.scoresPerMapel?.['Bahasa Indonesia'] ?? 0) : null,
              skorMtk: hasMapel('Matematika') ? (sub.scoresPerMapel?.['Matematika'] ?? 0) : null,
              skorIpas: hasMapel('IPAS') ? (sub.scoresPerMapel?.['IPAS'] ?? 0) : null,
              skorInggris: hasMapel('Bahasa Inggris') ? (sub.scoresPerMapel?.['Bahasa Inggris'] ?? 0) : null,
              skorKka: hasMapel('Koding dan Kecerdasan Artifisial (KKA)')
                ? (sub.scoresPerMapel?.['Koding dan Kecerdasan Artifisial (KKA)'] ?? 0)
                : null,
              skorTotal: sub.skorTotal,
              predikat: sub.predikat,
              status: sub.status,
              tanggalUjian: sub.tanggalUjian || '04 November 2026',
              durasiPengerjaan: sub.durasiPengerjaan || '45 Menit',
            };
          });

        const availableHasilClasses = Array.from(
          new Set([
            ...availableTkaStudentClasses,
            ...recordsForPaket.map((r) => r.kelas).filter(Boolean),
          ])
        ).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));

        // Ranking Calculation according to selected scope (Semua Angkatan 6, atau per rombel dinamis)
        const rankedPool = recordsForPaket
          .filter((r) => (rankingScope === 'semua' ? true : r.kelas === rankingScope))
          .sort((a, b) => {
            if (b.skorTotal !== a.skorTotal) return b.skorTotal - a.skorTotal;
            return (a.nama || '').localeCompare(b.nama || '', 'id');
          });

        const rankById = new Map<string, number>();
        rankedPool.forEach((r, idx) => {
          rankById.set(r.id, idx + 1);
        });

        // Filter for table view
        const filteredRecords = rankedPool.filter((r) => {
          if (hasilKelasTka !== 'all' && r.kelas !== hasilKelasTka) return false;
          if (hasilStatusTka !== 'all' && r.status !== hasilStatusTka) return false;
          if (
            searchHasilTka &&
            !r.nama.toLowerCase().includes(searchHasilTka.toLowerCase()) &&
            !r.nisn.includes(searchHasilTka)
          ) {
            return false;
          }
          return true;
        });

        // Pagination / Full view (Default 'all' agar 120+ siswa tampil penuh sekaligus)
        const totalFiltered = filteredRecords.length;
        const totalPages =
          hasilRowsPerPage === 'all' ? 1 : Math.max(1, Math.ceil(totalFiltered / hasilRowsPerPage));
        const safePage = Math.min(Math.max(1, hasilPage), totalPages);
        const visibleRecords =
          hasilRowsPerPage === 'all'
            ? filteredRecords
            : filteredRecords.slice(
                (safePage - 1) * hasilRowsPerPage,
                safePage * hasilRowsPerPage
              );

        // Top 10 Honors from the ranked pool (User requested ranking 1 - 10)
        const top10Students = rankedPool.slice(0, 10);

        // Summary Statistics from rankedPool
        const totalPeserta = rankedPool.length;
        const avgScore = totalPeserta > 0
          ? (rankedPool.reduce((acc, r) => acc + r.skorTotal, 0) / totalPeserta).toFixed(1)
          : '0';
        const highestScore = totalPeserta > 0 ? Math.max(...rankedPool.map((r) => r.skorTotal)) : 0;
        const lowestScore = totalPeserta > 0 ? Math.min(...rankedPool.map((r) => r.skorTotal)) : 0;
        const tuntasCount = rankedPool.filter((r) => r.status === 'Tuntas').length;
        const tuntasPercent = totalPeserta > 0 ? Math.round((tuntasCount / totalPeserta) * 100) : 0;

        // Tentukan mata pelajaran TKA yang benar-benar memiliki tes / soal atau nilai terdata
        const TKA_MAPEL_DEFS: Array<{
          key: TKAMapelScoreKey;
          field: 'skorIndo' | 'skorMtk' | 'skorIpas' | 'skorInggris' | 'skorKka';
          shortHeader: string;
          excelHeader: string;
          chartLabel: string;
          dotColor: string;
          barColor: string;
          textColor: string;
        }> = [
          {
            key: 'Bahasa Indonesia',
            field: 'skorIndo',
            shortHeader: 'B. Indonesia',
            excelHeader: 'Bahasa Indonesia',
            chartLabel: 'Bahasa Indonesia (Literasi)',
            dotColor: 'bg-emerald-500',
            barColor: 'bg-emerald-500',
            textColor: 'text-emerald-700',
          },
          {
            key: 'Matematika',
            field: 'skorMtk',
            shortHeader: 'Matematika',
            excelHeader: 'Matematika',
            chartLabel: 'Matematika (Numerasi & Logika)',
            dotColor: 'bg-sky-500',
            barColor: 'bg-sky-500',
            textColor: 'text-sky-700',
          },
          {
            key: 'IPAS',
            field: 'skorIpas',
            shortHeader: 'IPAS',
            excelHeader: 'IPAS',
            chartLabel: 'IPAS (Sains Alam & Sosial)',
            dotColor: 'bg-amber-500',
            barColor: 'bg-amber-500',
            textColor: 'text-amber-700',
          },
          {
            key: 'Bahasa Inggris',
            field: 'skorInggris',
            shortHeader: 'B. Inggris',
            excelHeader: 'Bahasa Inggris',
            chartLabel: 'Bahasa Inggris (Literasi Global)',
            dotColor: 'bg-purple-500',
            barColor: 'bg-purple-500',
            textColor: 'text-purple-700',
          },
          {
            key: 'Koding dan Kecerdasan Artifisial (KKA)',
            field: 'skorKka',
            shortHeader: 'KKA',
            excelHeader: 'Koding & Kecerdasan Artifisial (KKA)',
            chartLabel: 'Koding & Kecerdasan Artifisial (KKA)',
            dotColor: 'bg-indigo-500',
            barColor: 'bg-indigo-500',
            textColor: 'text-indigo-700',
          },
        ];

        const activeTestedMapels = TKA_MAPEL_DEFS.filter((def) => {
          const hasSubmissionData = recordsForPaket.some((r) => r[def.field] !== null);
          if (recordsForPaket.length > 0) {
            return hasSubmissionData;
          }
          return tkaQuestions.some(
            (q) =>
              (hasilPaketTka === 'all' || q.jenisTka === hasilPaketTka) &&
              normalizeTkaMapelKey(q.mapel) === def.key
          );
        });

        const chartTestedMapels =
          rankedPool.length > 0
            ? activeTestedMapels.filter((def) => rankedPool.some((r) => r[def.field] !== null))
            : [];

        // Subject averages across students who completed each mapel
        const calcMapelAvg = (vals: Array<number | null>) => {
          const valid = vals.filter((v): v is number => v !== null);
          return valid.length > 0 ? Math.round(valid.reduce((acc, v) => acc + v, 0) / valid.length) : 0;
        };
        const mapelAvgByKey: Record<TKAMapelScoreKey, number> = {
          'Bahasa Indonesia': calcMapelAvg(rankedPool.map((r) => r.skorIndo)),
          'Matematika': calcMapelAvg(rankedPool.map((r) => r.skorMtk)),
          'IPAS': calcMapelAvg(rankedPool.map((r) => r.skorIpas)),
          'Bahasa Inggris': calcMapelAvg(rankedPool.map((r) => r.skorInggris)),
          'Koding dan Kecerdasan Artifisial (KKA)': calcMapelAvg(rankedPool.map((r) => r.skorKka)),
        };

        // Predicate distribution for chart
        const countA = rankedPool.filter((r) => r.predikat === 'A').length;
        const countB = rankedPool.filter((r) => r.predikat === 'B').length;
        const countC = rankedPool.filter((r) => r.predikat === 'C').length;
        const countD = rankedPool.filter((r) => r.predikat === 'D').length;

        const kepsekForReport = resolveKepalaSekolah(teachers, profile);

        const buildReportExportOptions = (): TkaReportExportOptions => ({
          schoolName: profile?.name || 'SDN Rawa Badak Utara 21',
          schoolAddress: profile?.alamat || '',
          schoolNpsn: profile?.npsn || '',
          logoKemendikbudUrl: profile?.logoKemendikbudUrl,
          logoSekolahUrl: profile?.logoSekolahUrl,
          tahunPelajaran: activeYear,
          paketLabel: hasilPaketTka === 'all' ? 'Semua Paket TKA' : hasilPaketTka,
          kepsekNama: kepsekForReport.nama,
          kepsekNipLabel: formatNipLabel(kepsekForReport.status, kepsekForReport.nip),
          getWaliKelas: (cls: string) => {
            const wali = resolveWaliKelas(teachers, cls);
            return {
              nama: wali?.nama || 'Belum Ditugaskan',
              nipLabel: formatNipLabel(wali?.statusPegawai, wali?.nip),
            };
          },
          activeTestedMapels: activeTestedMapels.map((d) => ({
            key: d.key,
            field: d.field,
            shortHeader: d.shortHeader,
            excelHeader: d.excelHeader,
          })),
          tkaQuestions,
        });

        const toReportRecordInput = (r: any, customRank?: number): TkaReportRecordInput => ({
          id: r.id,
          studentId: r.studentId,
          nama: r.nama || r.studentName || '-',
          nisn: r.nisn || '-',
          kelas: r.kelas || '-',
          paket: r.paket || '-',
          paketDasar: r.paketDasar,
          completedMapels: r.completedMapels,
          scoresPerMapel: r.scoresPerMapel,
          skorIndo: r.skorIndo,
          skorMtk: r.skorMtk,
          skorIpas: r.skorIpas,
          skorInggris: r.skorInggris,
          skorKka: r.skorKka,
          skorTotal: r.skorTotal ?? 0,
          predikat: r.predikat || 'D',
          status: r.status || 'Remedial',
          tanggalUjian: r.tanggalUjian,
          durasiPengerjaan: r.durasiPengerjaan,
          rank: customRank ?? rankById.get(r.id),
        });

        const handleDownloadIndividualReport = async (record: any, format: 'word' | 'pdf') => {
          if (!record) {
            showToast('Pilih salah satu siswa terlebih dahulu.', 'error');
            return;
          }
          const payload = toReportRecordInput(record);
          const opts = buildReportExportOptions();
          if (format === 'word') {
            exportIndividualTkaReportToWord(payload, opts);
            showToast(`Report TKA individu "${payload.nama}" (.DOC Word) berhasil diunduh.`, 'success');
          } else {
            await exportIndividualTkaReportToPdf(payload, opts);
            showToast(`Report TKA individu "${payload.nama}" (.PDF) berhasil diunduh.`, 'success');
          }
        };

        const handleDownloadClassReport = async (
          targetClass: string,
          format: 'pdf_rekap' | 'pdf_bundel' | 'word_rekap' | 'word_bundel'
        ) => {
          const classLabel = targetClass === 'all' ? 'Semua Kelas 6' : targetClass;
          const pool = recordsForPaket
            .filter((r) => (targetClass === 'all' ? true : r.kelas === targetClass))
            .sort((a, b) => {
              if (b.skorTotal !== a.skorTotal) return b.skorTotal - a.skorTotal;
              return (a.nama || '').localeCompare(b.nama || '', 'id');
            })
            .map((r, idx) => toReportRecordInput(r, idx + 1));

          if (pool.length === 0) {
            showToast(`Belum ada data hasil ujian TKA untuk ${classLabel}.`, 'error');
            return;
          }

          const opts = buildReportExportOptions();
          if (format === 'pdf_rekap') {
            await exportClassTkaReportToPdf(pool, classLabel, opts, 'rekap');
            showToast(
              `Rekapitulasi Report TKA ${classLabel} (${pool.length} siswa, .PDF) berhasil diunduh!`,
              'success'
            );
          } else if (format === 'pdf_bundel') {
            await exportClassTkaReportToPdf(pool, classLabel, opts, 'rapor_bundel');
            showToast(
              `Bundel Rapor TKA ${classLabel} (${pool.length} halaman siswa, .PDF) berhasil diunduh!`,
              'success'
            );
          } else if (format === 'word_rekap') {
            exportClassTkaReportToWord(pool, classLabel, opts, 'rekap');
            showToast(
              `Rekapitulasi Report TKA ${classLabel} (.DOC Word) berhasil diunduh!`,
              'success'
            );
          } else {
            exportClassTkaReportToWord(pool, classLabel, opts, 'rapor_bundel');
            showToast(
              `Bundel Rapor TKA ${classLabel} (${pool.length} halaman siswa, .DOC Word) berhasil diunduh!`,
              'success'
            );
          }
        };

        const handlePrint = () => {
          window.print();
        };

        const tanggalCetakTka = new Date().toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        const waliKelasTkaReport =
          hasilKelasTka !== 'all' ? resolveWaliKelas(teachers, hasilKelasTka) : null;

        return (
          <div className={`space-y-6 ${selectedHasilStudent ? 'no-print' : ''}`}>
            {/* Formal Kop Surat Sekolah (Khusus Cetak / PDF) */}
            <div className="hidden print-only border-b-4 border-double border-slate-900 pb-3 mb-4 text-slate-900">
              <div className="flex items-center justify-between gap-4">
                {profile?.logoKemendikbudUrl ? (
                  <img
                    src={profile.logoKemendikbudUrl}
                    alt="Logo Dinas"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 object-contain shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 shrink-0" />
                )}
                <div className="text-center flex-1 px-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Pemerintah Provinsi DKI Jakarta · Suku Dinas Pendidikan Jakarta Utara
                  </div>
                  <h1 className="font-display font-black text-xl uppercase tracking-tight text-slate-950">
                    {profile?.name || 'SDN Rawa Badak Utara 21'}
                  </h1>
                  <p className="text-xs text-slate-700">
                    {profile?.alamat || 'Jl. Rawa Badak Utara'} · {profile?.kota || 'Jakarta Utara'}
                    {profile?.npsn ? ` · NPSN: ${profile.npsn}` : ''}
                  </p>
                </div>
                {profile?.logoSekolahUrl ? (
                  <img
                    src={profile.logoSekolahUrl}
                    alt="Logo Sekolah"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 object-contain shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 shrink-0" />
                )}
              </div>
              <div className="text-center mt-3 pt-2 border-t border-slate-300">
                <h2 className="font-display font-black text-sm uppercase tracking-wide text-slate-950">
                  LAPORAN REKAPITULASI HASIL TES KEMAMPUAN AKADEMIK (TKA)
                </h2>
                <p className="text-[11px] text-slate-700 mt-0.5 tabular-nums">
                  Paket: <strong>{hasilPaketTka === 'all' ? 'Semua Paket TKA' : hasilPaketTka}</strong> · Rombel:{' '}
                  <strong>{hasilKelasTka === 'all' ? 'Semua Kelas 6' : hasilKelasTka}</strong> · Tahun Pelajaran{' '}
                  <strong>{activeYear}</strong> · Dicetak: {tanggalCetakTka}
                </p>
              </div>
            </div>

            {/* Eye-Catching Editorial Header Card (Layar) */}
            <div className="no-print bg-gradient-to-br from-slate-900 via-purple-950 to-indigo-950 text-white p-6 sm:p-7 rounded-3xl shadow-md border border-purple-900/40 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
              <div className="space-y-2 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs text-purple-200 font-medium">
                  <span>Evaluasi Akademik Kelas 6</span>
                  <span aria-hidden="true">·</span>
                  <span>{hasilPaketTka === 'all' ? 'Semua Paket TKA' : hasilPaketTka}</span>
                  <span aria-hidden="true">·</span>
                  <span>Tahun Pelajaran {activeYear}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-display font-black tracking-tight flex items-center gap-2.5 text-white">
                  <span className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5 text-amber-300" />
                  </span>
                  <span>Report &amp; Rekapitulasi Hasil Ujian TKA</span>
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Pemeringkatan otomatis peserta didik Kelas 6, analisis capaian per mata pelajaran yang diujikan, serta cetak rapor individu dan rekapitulasi kelas berstandar A4.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isSyncingTkaCloud}
                  onClick={handleRefreshTkaFromCloud}
                  className="bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white font-display font-bold px-3.5 py-2.5 rounded-xl text-xs border border-white/15 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                  title="Tarik & pulihkan hasil pengerjaan TKA siswa terbaru dari Cloud Firestore"
                >
                  <RefreshCw className={`w-4 h-4 text-sky-300 ${isSyncingTkaCloud ? 'animate-spin' : ''}`} />
                  <span>{isSyncingTkaCloud ? 'Menyinkronkan...' : 'Segarkan Cloud'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSeedingTka}
                  onClick={handleSeedSimulatedSubmissions}
                  className="bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white font-display font-bold px-3.5 py-2.5 rounded-xl text-xs border border-white/15 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                  title="Simulasikan pengerjaan seluruh siswa Kelas 6 secara instan"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>{isSeedingTka ? 'Memuat...' : `Simulasikan (${tkaStudents.length})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDownloadSelectedClass(hasilKelasTka !== 'all' ? hasilKelasTka : 'all');
                    setDownloadSelectedStudentId(filteredRecords[0]?.id || rankedPool[0]?.id || '');
                    setDownloadStudentSearch('');
                    setShowDownloadReportModal(true);
                  }}
                  className="bg-purple-500 hover:bg-purple-400 text-white font-display font-black px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
                  title="Download Report TKA per orang (individu) atau per kelas (PDF / Word)"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadClassReport(hasilKelasTka, 'pdf_rekap')}
                  className="bg-rose-500 hover:bg-rose-400 text-white font-display font-black px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
                  title="Unduh langsung Rekap Report TKA dalam format PDF (.PDF)"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="bg-white hover:bg-slate-100 text-slate-900 font-display font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Printer className="w-4 h-4 text-purple-700" />
                  <span>Cetak Rekap A4</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleClearSubmissions('rekap', hasilPaketTka)}
                  className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-display font-bold px-3 py-2.5 rounded-xl text-xs border border-rose-400/30 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                  title="Kosongkan seluruh data hasil & analisis TKA"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Kosongkan</span>
                </button>
              </div>
            </div>

            {/* Empty State Banner if no submissions */}
            {totalPeserta === 0 && (
              <div className="bg-amber-50 p-6 rounded-3xl border-2 border-amber-300 shadow-sm space-y-3">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs font-black">
                    ℹ️
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-display font-black text-sm text-amber-900">
                      Data Hasil Ujian TKA Masih Kosong
                    </h3>
                    <p className="text-xs text-amber-800">
                      Belum ada pengerjaan siswa yang tersimpan untuk paket{' '}
                      <strong>"{hasilPaketTka === 'all' ? 'Semua Paket TKA' : hasilPaketTka}"</strong>.
                      Siswa dapat mengerjakan melalui menu <strong>"Tes Kemampuan Akademik (TKA)"</strong>, atau Anda dapat mengeklik tombol simulasi di bawah untuk mengisinya secara instan untuk seluruh siswa Kelas 6 ({tkaStudents.length} siswa).
                    </p>
                  </div>
                </div>
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isSyncingTkaCloud}
                    onClick={handleRefreshTkaFromCloud}
                    className="bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingTkaCloud ? 'animate-spin' : ''}`} />{' '}
                    {isSyncingTkaCloud ? 'Menyinkronkan Cloud...' : 'Segarkan / Sinkron dari Cloud'}
                  </button>
                  <button
                    type="button"
                    disabled={isSeedingTka}
                    onClick={handleSeedSimulatedSubmissions}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />{' '}
                    {isSeedingTka ? 'Memuat Simulasi...' : `Muat Simulasi Siswa Kelas 6 (${tkaStudents.length} Siswa)`}
                  </button>
                </div>
              </div>
            )}

            {/* Filter & Ranking Controls Bar */}
            <div className="no-print bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">Pilih Paket Ujian TKA:</label>
                  <select
                    value={hasilPaketTka}
                    onChange={(e) => setHasilPaketTka(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                  >
                    <option value="all">Semua Paket TKA ({tkaSubmissions.filter((s) => !isExcludedTkaSubmission(s)).length} Data)</option>
                    {TKA_JENIS_LIST.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">Filter Rombel / Kelas:</label>
                  <select
                    value={hasilKelasTka}
                    onChange={(e) => setHasilKelasTka(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                  >
                    <option value="all">Semua Rombel Kelas 6 ({availableHasilClasses.length} Kelas)</option>
                    {availableHasilClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        Hanya {cls}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">Status Ketuntasan (KKTP 75):</label>
                  <select
                    value={hasilStatusTka}
                    onChange={(e) => setHasilStatusTka(e.target.value as any)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                  >
                    <option value="all">Semua Status (Tuntas &amp; Remedial)</option>
                    <option value="Tuntas">Hanya Tuntas (&gt;= 75)</option>
                    <option value="Remedial">Perlu Remedial (&lt; 75)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">Cari Nama / NISN Siswa:</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchHasilTka}
                      onChange={(e) => setSearchHasilTka(e.target.value)}
                      placeholder="Ketik nama atau NISN..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Ranking Scope Selector Buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-slate-700">Skup Pemeringkatan (Ranking):</span>
                  <div className="inline-flex flex-wrap rounded-xl p-1 bg-slate-100 border border-slate-200 gap-1">
                    <button
                      type="button"
                      onClick={() => setRankingScope('semua')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                        rankingScope === 'semua'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Trophy className="w-3.5 h-3.5" /> Semua Siswa (Angkatan 6)
                    </button>
                    {availableHasilClasses.map((cls, cIdx) => (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => setRankingScope(cls)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                          rankingScope === cls
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>{cIdx === 0 ? '🥇' : cIdx === 1 ? '🥈' : '🥉'}</span> Ranking {cls}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  Menampilkan: <strong className="text-purple-700">{filteredRecords.length}</strong> dari <strong>{totalPeserta}</strong> siswa
                </div>
              </div>
            </div>

            {/* Metric KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-4 print:gap-2 print-avoid-break">
              <div className="bg-white p-5 print:p-3 rounded-2xl border border-slate-200 space-y-1">
                <div className="text-[11px] font-bold text-purple-700">Total Peserta Ujian</div>
                <div className="text-3xl print:text-xl font-display font-black text-slate-900 tabular-nums">
                  {totalPeserta} <span className="text-sm font-bold text-slate-500">Siswa</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {rankingScope === 'semua' ? `Gabungan ${availableHasilClasses.join(', ')}` : `Khusus ${rankingScope}`}
                </p>
              </div>

              <div className="bg-white p-5 print:p-3 rounded-2xl border border-slate-200 space-y-1">
                <div className="text-[11px] font-bold text-sky-700">Rata-rata Skor TKA</div>
                <div className="text-3xl print:text-xl font-display font-black text-slate-900 tabular-nums">
                  {avgScore}
                </div>
                <p className="text-[11px] text-slate-500 tabular-nums">Standar KKTP: 75.00 Poin</p>
              </div>

              <div className="bg-white p-5 print:p-3 rounded-2xl border border-slate-200 space-y-1">
                <div className="text-[11px] font-bold text-emerald-700">Ketuntasan Siswa</div>
                <div className="text-3xl print:text-xl font-display font-black text-emerald-700 tabular-nums">
                  {tuntasPercent}%
                </div>
                <p className="text-[11px] text-slate-600 font-semibold tabular-nums">
                  {tuntasCount} dari {totalPeserta} siswa tuntas
                </p>
              </div>

              <div className="bg-white p-5 print:p-3 rounded-2xl border border-slate-200 space-y-1">
                <div className="text-[11px] font-bold text-amber-700">Skor Tertinggi / Terendah</div>
                <div className="text-3xl print:text-xl font-display font-black text-slate-900 tabular-nums">
                  {highestScore} <span className="text-xs font-bold text-slate-400">/ min {lowestScore}</span>
                </div>
                <p className="text-[11px] text-slate-500 tabular-nums">Nilai maksimum skala 100</p>
              </div>
            </div>

            {/* VISUAL CHARTS SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-2 print:grid-cols-2 gap-5 print:gap-3 print-avoid-break">
              {/* Chart 1: Rata-Rata Skor per Mata Pelajaran */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-600" />
                    <div>
                      <h3 className="font-display font-black text-sm text-slate-800">
                        Grafik Rata-rata Skor per Mata Pelajaran TKA
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Menampilkan {chartTestedMapels.length} mapel yang memiliki hasil tes dengan garis ambang KKTP (75)
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full border border-purple-200">
                    {chartTestedMapels.length} Mapel
                  </span>
                </div>

                <div className="space-y-3.5 pt-1">
                  {chartTestedMapels.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center italic">
                      Belum ada hasil tes mata pelajaran pada paket/rombel TKA yang dipilih.
                    </div>
                  ) : (
                    chartTestedMapels.map((def) => {
                      const avgVal = mapelAvgByKey[def.key] ?? 0;
                      return (
                        <div key={def.key}>
                          <div className="flex items-center justify-between text-xs font-bold mb-1">
                            <span className="text-slate-700 flex items-center gap-1.5">
                              <span className={`w-2.5 h-2.5 rounded-full ${def.dotColor} inline-block`}></span>
                              {def.chartLabel}
                            </span>
                            <span className={`font-mono font-black ${def.textColor}`}>{avgVal} / 100</span>
                          </div>
                          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden relative">
                            <div
                              className={`h-full ${def.barColor} rounded-full transition-all duration-500`}
                              style={{ width: `${Math.min(100, Math.max(0, avgVal))}%` }}
                            ></div>
                            <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-rose-500 z-10" title="KKTP 75"></div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-rose-500 inline-block"></span> Garis Merah = Standar KKTP (75)
                  </span>
                  <span>Skala Penilaian: 0 - 100</span>
                </div>
              </div>

              {/* Chart 2: Distribusi Predikat & Ketuntasan */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                    <div>
                      <h3 className="font-display font-black text-sm text-slate-800">
                        Distribusi Predikat &amp; Ketuntasan Belajar
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Proporsi capaian predikat A, B, C, D dan ketuntasan siswa
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    KKTP: 75
                  </span>
                </div>

                {/* Progress bar for Ketuntasan */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-700">Persentase Ketuntasan</span>
                    <span className="text-emerald-700 font-mono font-black">{tuntasPercent}% Tuntas</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-500"
                      style={{ width: `${tuntasPercent}%` }}
                      title={`Tuntas: ${tuntasCount} siswa`}
                    ></div>
                    <div
                      className="bg-rose-400 h-full transition-all duration-500"
                      style={{ width: `${100 - tuntasPercent}%` }}
                      title={`Remedial: ${totalPeserta - tuntasCount} siswa`}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span className="text-emerald-700 font-bold">✓ Tuntas: {tuntasCount} siswa</span>
                    <span className="text-rose-600 font-bold">✗ Remedial: {totalPeserta - tuntasCount} siswa</span>
                  </div>
                </div>

                {/* Predicate Breakdown Bar Grid */}
                <div className="grid grid-cols-4 gap-2 pt-2">
                  <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-emerald-700 block">Predikat A</span>
                    <div className="text-lg font-black text-emerald-900">{countA}</div>
                    <span className="text-[9px] text-slate-500 block">&gt;= 88 Poin</span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-sky-50 border border-sky-200 text-center space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-sky-700 block">Predikat B</span>
                    <div className="text-lg font-black text-sky-900">{countB}</div>
                    <span className="text-[9px] text-slate-500 block">78 - 87 Poin</span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-amber-700 block">Predikat C</span>
                    <div className="text-lg font-black text-amber-900">{countC}</div>
                    <span className="text-[9px] text-slate-500 block">68 - 77 Poin</span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-rose-700 block">Predikat D</span>
                    <div className="text-lg font-black text-rose-900">{countD}</div>
                    <span className="text-[9px] text-slate-500 block">&lt; 68 Poin</span>
                  </div>
                </div>
              </div>
            </div>

            {/* TOP 10 PERINGKAT SISWA TERBAIK (HONORS CARDS) */}
            <div className="bg-white p-6 print:p-4 rounded-3xl print:rounded-xl border border-slate-200 shadow-sm print:shadow-none space-y-4 print-avoid-break">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-base text-slate-900">
                      Peringkat 1 s/d 10 Siswa Terbaik
                    </h3>
                    <p className="text-xs text-slate-500">
                      {rankingScope === 'semua' ? 'Semua Siswa Angkatan 6' : rankingScope} · {hasilPaketTka === 'all' ? 'Semua Paket TKA' : hasilPaketTka}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-amber-800">
                  Top 10 Honors
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 print:grid-cols-5 gap-3.5 print:gap-2">
                {top10Students.map((s, idx) => {
                  const medals = [
                    'Juara 1',
                    'Juara 2',
                    'Juara 3',
                    'Rank 4',
                    'Rank 5',
                    'Rank 6',
                    'Rank 7',
                    'Rank 8',
                    'Rank 9',
                    'Rank 10',
                  ];
                  const cardAccent =
                    idx === 0
                      ? 'border-amber-300 bg-amber-50/40'
                      : idx === 1
                      ? 'border-slate-300 bg-slate-50/60'
                      : idx === 2
                      ? 'border-orange-300 bg-orange-50/40'
                      : 'border-slate-200 bg-white';

                  return (
                    <div
                      key={s.id}
                      className={`p-3 print:p-2 rounded-2xl border ${cardAccent} hover:border-purple-400 transition text-center space-y-2 relative print-avoid-break`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-black text-slate-700 border-b border-slate-100 pb-1">
                        <span className={idx === 0 ? 'text-amber-700' : idx === 1 ? 'text-slate-600' : idx === 2 ? 'text-orange-700' : 'text-purple-700'}>
                          #{idx + 1} {medals[idx]}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">{s.kelas}</span>
                      </div>
                      <img
                        src={s.fotoUrl}
                        alt={s.nama}
                        referrerPolicy="no-referrer"
                        onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                        className="w-11 h-11 print:w-9 print:h-9 rounded-xl object-cover mx-auto border border-slate-200 cursor-zoom-in"
                      />
                      <div>
                        <h4 className="font-display font-black text-xs text-slate-900 truncate" title={s.nama}>
                          {s.nama}
                        </h4>
                      </div>
                      <div className="pt-1 border-t border-slate-100">
                        <div className="text-lg print:text-sm font-mono font-black text-purple-700 tabular-nums">
                          {s.skorTotal}
                        </div>
                        <div className="text-[10px] font-bold text-emerald-700">
                          Predikat {s.predikat} · {s.status}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedHasilStudent(s)}
                        className="no-print w-full mt-1 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 text-[11px] font-black transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Rapor TKA
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Main Table of All Student TKA Results */}
            <div className="bg-white rounded-3xl print:rounded-none shadow-sm print:shadow-none border border-slate-200 print:border-slate-300 overflow-hidden space-y-3 p-5 print:p-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" /> Rekapitulasi Nilai &amp; Pemeringkatan ({filteredRecords.length} Siswa)
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="no-print flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500 font-bold">Tampilan baris:</span>
                    <select
                      value={hasilRowsPerPage}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHasilRowsPerPage(val === 'all' ? 'all' : (Number(val) as 30 | 60 | 120));
                      }}
                      className="px-2.5 py-1 rounded-xl border border-slate-300 bg-slate-50 text-xs font-extrabold text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="all">Semua ({filteredRecords.length} Siswa)</option>
                      <option value="30">30 / Halaman</option>
                      <option value="60">60 / Halaman</option>
                      <option value="120">120 / Halaman</option>
                    </select>
                  </div>
                  <span className="text-xs text-slate-500 font-bold">
                    Skup Peringkat: <strong className="text-purple-700">{rankingScope === 'semua' ? 'Semua Siswa Angkatan 6' : rankingScope}</strong>
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto print-expand-scroll">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-purple-50 text-purple-950 font-black uppercase text-[11px] border-b-2 border-purple-200">
                      <th className="p-3 text-center w-14">Rank</th>
                      <th className="p-3">Identitas Siswa</th>
                      <th className="p-3 text-center">Kelas</th>
                      {activeTestedMapels.map((def) => (
                        <th key={def.key} className="p-3 text-center">
                          {def.shortHeader}
                        </th>
                      ))}
                      <th className="p-3 text-center bg-purple-100/60">Skor Akhir</th>
                      <th className="p-3 text-center">Predikat</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="no-print p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {visibleRecords.map((r, idx) => {
                      const trueRank = rankById.get(r.id) ?? idx + 1;
                      return (
                      <tr key={r.id} className="hover:bg-purple-50/30 even:bg-slate-50/40 transition">
                        <td className="p-3 text-center font-mono font-black tabular-nums text-slate-700">
                          {trueRank <= 3 ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-xs font-black ${
                                trueRank === 1
                                  ? 'bg-amber-300 text-slate-900'
                                  : trueRank === 2
                                  ? 'bg-slate-300 text-slate-900'
                                  : 'bg-orange-200 text-slate-900'
                              }`}
                            >
                              #{trueRank}
                            </span>
                          ) : (
                            <span>#{trueRank}</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={r.fotoUrl}
                              alt={r.nama}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onClick={() => onOpenZoom(r.fotoUrl, r.nama)}
                              className="no-print w-8 h-8 rounded-xl object-cover border border-slate-200 cursor-zoom-in shrink-0"
                            />
                            <div>
                              <div className="font-bold text-slate-900">{r.nama}</div>
                              <div className="text-[10px] text-slate-500 font-mono tabular-nums">
                                NISN: {r.nisn} · {r.paket}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-700 whitespace-nowrap">
                          {r.kelas}
                        </td>
                        {activeTestedMapels.map((def) => (
                          <td
                            key={def.key}
                            className={`p-3 text-center font-mono font-bold tabular-nums ${
                              def.key === 'Koding dan Kecerdasan Artifisial (KKA)'
                                ? 'text-indigo-700'
                                : 'text-slate-800'
                            }`}
                          >
                            {r[def.field] ?? '—'}
                          </td>
                        ))}
                        <td className="p-3 text-center font-mono font-black tabular-nums text-sm text-purple-800 bg-purple-50/50">
                          {r.skorTotal}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md font-black text-[11px] ${
                              r.predikat === 'A'
                                ? 'bg-emerald-100 text-emerald-800'
                                : r.predikat === 'B'
                                ? 'bg-sky-100 text-sky-800'
                                : r.predikat === 'C'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {r.predikat}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-[11px] whitespace-nowrap">
                          <span className={r.status === 'Tuntas' ? 'text-emerald-700' : 'text-rose-700'}>
                            {r.status}
                          </span>
                        </td>
                        <td className="no-print p-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleDownloadIndividualReport(r, 'pdf')}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1.5 rounded-xl font-display font-extrabold text-[11px] transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                              title={`Download Report TKA ${r.nama} (.PDF)`}
                            >
                              <Download className="w-3 h-3" /> Unduh PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedHasilStudent(r)}
                              className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1.5 rounded-xl font-display font-extrabold text-[11px] shadow-2xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                            >
                              <Eye className="w-3 h-3" /> Lihat Rapor
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {visibleRecords.length === 0 && (
                      <tr>
                        <td colSpan={7 + activeTestedMapels.length} className="p-8 text-center text-slate-400 italic">
                          Tidak ada data pengerjaan siswa yang sesuai dengan filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {hasilRowsPerPage !== 'all' && totalPages > 1 && (
                <div className="no-print pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500 font-bold">
                    Halaman <strong>{safePage}</strong> dari <strong>{totalPages}</strong> ({totalFiltered} siswa)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setHasilPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 font-bold text-slate-700 cursor-pointer"
                    >
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setHasilPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 font-bold text-slate-700 cursor-pointer"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Blok Pengesahan Resmi Kepala Sekolah & Wali Kelas (Khusus Cetak / PDF) */}
            <div className="hidden print-only print-avoid-break mt-6 pt-4 text-xs text-slate-900">
              <div className="grid grid-cols-2 gap-8 text-center">
                <div>
                  <p className="font-medium text-slate-700">
                    Mengetahui,<br />Kepala {profile?.name || 'SDN Rawa Badak Utara 21'}
                  </p>
                  <div style={{ height: '4cm' }} />
                  <p className="font-black text-slate-900 underline">{kepsekForReport.nama}</p>
                  <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                    {formatNipLabel(kepsekForReport.status, kepsekForReport.nip)}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">
                    Jakarta, {tanggalCetakTka}<br />
                    {waliKelasTkaReport ? `Wali Kelas ${hasilKelasTka}` : 'Koordinator Evaluasi & TKA Kelas 6'}
                  </p>
                  <div style={{ height: '4cm' }} />
                  <p className="font-black text-slate-900 underline">
                    {waliKelasTkaReport ? waliKelasTkaReport.nama : activeUser?.name || 'Tim Evaluasi TKA'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                    {waliKelasTkaReport
                      ? formatNipLabel(waliKelasTkaReport.statusPegawai, waliKelasTkaReport.nip)
                      : 'NIP. -'}
                  </p>
                </div>
              </div>
            </div>

            {/* ================= MODAL DOWNLOAD REPORT TKA (PER ORANG / PER KELAS) ================= */}
            {showDownloadReportModal && (() => {
              const allDownloadPool = [...recordsForPaket].sort((a, b) => {
                if (b.skorTotal !== a.skorTotal) return b.skorTotal - a.skorTotal;
                return (a.nama || '').localeCompare(b.nama || '', 'id');
              });
              const searchedDownloadStudents = allDownloadPool.filter((r) => {
                if (!downloadStudentSearch.trim()) return true;
                const q = downloadStudentSearch.trim().toLowerCase();
                return (
                  (r.nama || '').toLowerCase().includes(q) ||
                  (r.nisn || '').includes(q) ||
                  (r.kelas || '').toLowerCase().includes(q)
                );
              });
              const activeDownloadStudent =
                allDownloadPool.find((r) => r.id === downloadSelectedStudentId) ||
                searchedDownloadStudents[0] ||
                null;

              const classTargetRecords = recordsForPaket.filter((r) =>
                downloadSelectedClass === 'all' ? true : r.kelas === downloadSelectedClass
              );
              const classAvg =
                classTargetRecords.length > 0
                  ? (
                      classTargetRecords.reduce((acc, r) => acc + r.skorTotal, 0) /
                      classTargetRecords.length
                    ).toFixed(1)
                  : '0';
              const classTuntas = classTargetRecords.filter((r) => r.status === 'Tuntas').length;

              return (
                <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 border-2 border-purple-200 animate-in fade-in zoom-in-95 my-8">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                          <Download className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-display font-black text-base text-slate-800">
                            Download Report Hasil Ujian TKA
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Unduh laporan hasil TKA <strong>per orang (individu)</strong> atau <strong>per kelas / rombel</strong> dalam format PDF (.PDF) atau Word (.DOC).
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDownloadReportModal(false)}
                        className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center cursor-pointer transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Switch Mode: Per Orang vs Per Kelas */}
                    <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100 border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setDownloadReportMode('per_orang')}
                        className={`py-2.5 px-3 rounded-xl font-display font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                          downloadReportMode === 'per_orang'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <User className="w-4 h-4" /> Download Per Orang (Individu)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDownloadReportMode('per_kelas')}
                        className={`py-2.5 px-3 rounded-xl font-display font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                          downloadReportMode === 'per_kelas'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Users className="w-4 h-4" /> Download Per Kelas / Rombel
                      </button>
                    </div>

                    {downloadReportMode === 'per_orang' ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-black text-slate-700 mb-1">
                              Cari Nama / NISN / Kelas Siswa:
                            </label>
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                value={downloadStudentSearch}
                                onChange={(e) => setDownloadStudentSearch(e.target.value)}
                                placeholder="Ketik nama atau kelas..."
                                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-black text-slate-700 mb-1">
                              Pilih Peserta TKA ({searchedDownloadStudents.length} Siswa):
                            </label>
                            <select
                              value={activeDownloadStudent?.id || ''}
                              onChange={(e) => setDownloadSelectedStudentId(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                            >
                              {searchedDownloadStudents.length === 0 ? (
                                <option value="">Tidak ada data siswa</option>
                              ) : (
                                searchedDownloadStudents.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.nama} ({s.kelas}) — Skor {s.skorTotal} [{s.predikat}]
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                        </div>

                        {activeDownloadStudent ? (
                          <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={activeDownloadStudent.fotoUrl}
                                  alt={activeDownloadStudent.nama}
                                  className="w-11 h-11 rounded-2xl object-cover border-2 border-purple-300"
                                />
                                <div>
                                  <div className="font-display font-black text-sm text-slate-800">
                                    {activeDownloadStudent.nama}
                                  </div>
                                  <div className="text-[11px] text-slate-600 font-semibold">
                                    {activeDownloadStudent.kelas} • NISN: {activeDownloadStudent.nisn} • Paket: {activeDownloadStudent.paket}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-black text-purple-800 block">
                                  Skor Akhir: {activeDownloadStudent.skorTotal} ({activeDownloadStudent.predikat})
                                </span>
                                <span className="text-[10px] font-extrabold text-emerald-700">
                                  Status: {activeDownloadStudent.status}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => void handleDownloadIndividualReport(activeDownloadStudent, 'pdf')}
                                className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                              >
                                <Download className="w-4 h-4" /> Unduh PDF (.PDF)
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDownloadIndividualReport(activeDownloadStudent, 'word')}
                                className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-display font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                              >
                                <FileText className="w-4 h-4" /> Word Rapor (.DOC)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowDownloadReportModal(false);
                                  setSelectedHasilStudent(activeDownloadStudent);
                                }}
                                className="py-2.5 px-3 rounded-xl bg-white hover:bg-purple-100 text-purple-800 border border-purple-300 font-display font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                              >
                                <Eye className="w-4 h-4" /> Pratinjau Rapor
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                            Belum ada data hasil ujian TKA siswa untuk diunduh.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-black text-slate-700 mb-1">
                              Pilih Kelas / Rombel TKA:
                            </label>
                            <select
                              value={downloadSelectedClass}
                              onChange={(e) => setDownloadSelectedClass(e.target.value)}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                            >
                              <option value="all">
                                Semua Kelas 6 ({recordsForPaket.length} Siswa)
                              </option>
                              {availableHasilClasses.map((cls) => {
                                const countCls = recordsForPaket.filter((r) => r.kelas === cls).length;
                                return (
                                  <option key={cls} value={cls}>
                                    {cls} ({countCls} Siswa)
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-center">
                            <span className="text-[10px] font-black uppercase text-slate-400">
                              Paket Ujian Aktif
                            </span>
                            <span className="text-xs font-black text-purple-800">
                              {hasilPaketTka === 'all' ? 'Semua Paket TKA' : hasilPaketTka}
                            </span>
                            <span className="text-[11px] text-slate-600 mt-0.5">
                              {classTargetRecords.length} Siswa • Rata-rata: <strong>{classAvg}</strong> • Tuntas: <strong>{classTuntas}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <button
                            type="button"
                            disabled={classTargetRecords.length === 0}
                            onClick={() => void handleDownloadClassReport(downloadSelectedClass, 'pdf_rekap')}
                            className="w-full p-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 disabled:opacity-50 border border-rose-200 text-left flex items-center justify-between gap-3 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                                <Download className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-display font-black text-xs text-rose-950">
                                  Download Rekapitulasi Nilai &amp; Statistik Kelas (.PDF)
                                </div>
                                <div className="text-[11px] text-rose-700">
                                  Berisi kop resmi berlogo sekolah &amp; tabel nilai lengkap {downloadSelectedClass === 'all' ? 'Semua Kelas 6' : downloadSelectedClass} dalam PDF A4 Landscape.
                                </div>
                              </div>
                            </div>
                            <Download className="w-4 h-4 text-rose-700 shrink-0" />
                          </button>

                          <button
                            type="button"
                            disabled={classTargetRecords.length === 0}
                            onClick={() => void handleDownloadClassReport(downloadSelectedClass, 'pdf_bundel')}
                            className="w-full p-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100 disabled:opacity-50 border border-amber-200 text-left flex items-center justify-between gap-3 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                                <Award className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-display font-black text-xs text-amber-950">
                                  Download Bundel Rapor TKA Sekelas (.PDF)
                                </div>
                                <div className="text-[11px] text-amber-800">
                                  Menghasilkan 1 halaman rapor PDF berlogo &amp; tanda tangan resmi (spasi 4 cm) untuk setiap siswa.
                                </div>
                              </div>
                            </div>
                            <Download className="w-4 h-4 text-amber-700 shrink-0" />
                          </button>

                          <button
                            type="button"
                            disabled={classTargetRecords.length === 0}
                            onClick={() => handleDownloadClassReport(downloadSelectedClass, 'word_rekap')}
                            className="w-full p-3.5 rounded-2xl bg-sky-50 hover:bg-sky-100 disabled:opacity-50 border border-sky-200 text-left flex items-center justify-between gap-3 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-display font-black text-xs text-sky-950">
                                  Download Rekapitulasi Kelas Siap Cetak (.DOC Word)
                                </div>
                                <div className="text-[11px] text-sky-700">
                                  Tabel rekap resmi lengkap dengan kop sekolah dan tanda tangan Kepala Sekolah &amp; Wali Kelas.
                                </div>
                              </div>
                            </div>
                            <Download className="w-4 h-4 text-sky-700 shrink-0" />
                          </button>

                          <button
                            type="button"
                            disabled={classTargetRecords.length === 0}
                            onClick={() => handleDownloadClassReport(downloadSelectedClass, 'word_bundel')}
                            className="w-full p-3.5 rounded-2xl bg-purple-50 hover:bg-purple-100 disabled:opacity-50 border border-purple-200 text-left flex items-center justify-between gap-3 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
                                <Award className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-display font-black text-xs text-purple-950">
                                  Download Bundel Lembar Rapor Individu Sekelas (.DOC Word)
                                </div>
                                <div className="text-[11px] text-purple-700">
                                  Menghasilkan 1 halaman rapor TKA terpisah untuk setiap siswa dalam satu dokumen siap cetak/dibagikan.
                                </div>
                              </div>
                            </div>
                            <Download className="w-4 h-4 text-purple-700 shrink-0" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowDownloadReportModal(false)}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                      >
                        Tutup
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ============================================================== */}
      {/* 6. MENU RUANG TES KEMAMPUAN AKADEMIK (TKA) SISWA                */}
      {/* ============================================================== */}
      {subType === 'tes-tka-siswa' && (() => {
        // Active student context
        const matchedActiveStudent = activeUser.role === 'siswa' && activeUser.studentData
          ? students.find(
              (s) =>
                (activeUser.studentData?.id && s.id === activeUser.studentData.id) ||
                (activeUser.studentData?.nisn && s.nisn === activeUser.studentData.nisn)
            ) || activeUser.studentData
          : null;

        if (activeUser.role === 'siswa' && matchedActiveStudent && isAbkExcludedFromTka(matchedActiveStudent)) {
          return (
            <div className="bg-white p-8 rounded-3xl border-2 border-amber-200 shadow-sm text-center max-w-2xl mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-display font-black text-slate-800">
                Status Kepesertaan TKA: Tidak Masuk TKA
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Akun siswa berkebutuhan khusus Anda diatur tidak mengikuti Tes Kemampuan Akademik (TKA) oleh admin/guru kelas. Anda tetap dapat mengikuti Ujian CBT dan modul belajar lainnya.
              </p>
            </div>
          );
        }

        const currentStudent = activeUser.role === 'siswa' && matchedActiveStudent
          ? matchedActiveStudent
          : tkaStudents.find((s) => s.id === selectedTestStudentId) || tkaStudents[0] || students[0];

        // Format countdown timer display
        const formatTimer = (totalSeconds: number) => {
          const m = Math.floor(totalSeconds / 60);
          const s = totalSeconds % 60;
          return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };

        // Active exam questions filtered by selected paket and optional mapel
        const getMatchingTkaQuestions = (paket: string, mapel?: string | null) => {
          return tkaQuestions.filter((q) => {
            if (q.jenisTka !== paket) return false;
            if (mapel && mapel !== 'all' && q.mapel !== mapel) return false;
            return true;
          });
        };

        const displayExamQuestions = tkaRunningQuestions.length > 0
          ? tkaRunningQuestions
          : (activeExamPaket ? getMatchingTkaQuestions(activeExamPaket, activeExamMapel) : []);
        const activeQuestion = displayExamQuestions[currentQuestionIdx] || displayExamQuestions[0];

        // Start Exam Handler
        const handleStartExam = (paketName: string, mapelName?: string | null, forceFresh: boolean = false) => {
          const targetMapel = mapelName && mapelName !== 'all' ? mapelName : null;
          const questions = getMatchingTkaQuestions(paketName, targetMapel);
          if (questions.length === 0) {
            showToast(
              `Belum ada soal yang dibuat guru untuk ${paketName}${targetMapel ? ` • ${targetMapel}` : ''}. Silakan tambah soal di Bank Soal TKA.`,
              'error'
            );
            return;
          }

          if (!forceFresh && currentStudent?.id) {
            const existingDraft = getTkaRoomDraft(currentStudent.id, paketName, targetMapel);
            if (existingDraft && existingDraft.examTimerSeconds > 0) {
              resumeFromTkaDraft(existingDraft);
              return;
            }
          }

          if (forceFresh && currentStudent?.id) {
            clearTkaRoomDraft(currentStudent.id, paketName, targetMapel);
            setTkaDraftRevision((v) => v + 1);
          }

          const durasiMenit = getTKADurationMinutes(tkaDurations, paketName, targetMapel);
          setActiveExamPaket(paketName);
          setActiveExamMapel(targetMapel);
          setConfirmFinishTkaExam(false);
          setStudentAnswers({});
          setRaguChecks({});
          setCurrentQuestionIdx(0);
          setActiveExamDurationSeconds(durasiMenit * 60);
          setExamTimerSeconds(durasiMenit * 60);
          setIsExamCompleted(false);
          setLastExamResult(null);
          setTkaResumedNotice(null);

          let list = [...questions];

          if (acakSoalTka) {
            list = [...list].sort(() => Math.random() - 0.5);
          }
          if (acakJawabanTka) {
            list = list.map((q) => {
              if (q.opsi && q.opsi.length > 0) {
                return {
                  ...q,
                  opsi: [...q.opsi].sort(() => Math.random() - 0.5),
                };
              }
              return q;
            });
          }
          setTkaRunningQuestions(list);

          if (currentStudent?.id) {
            saveTkaRoomDraft(
              {
                studentId: currentStudent.id,
                paketName,
                mapelName: targetMapel,
                currentQuestionIdx: 0,
                studentAnswers: {},
                raguChecks: {},
                examTimerSeconds: durasiMenit * 60,
                activeExamDurationSeconds: durasiMenit * 60,
                runningQuestionOrder: buildQuestionOrderSnapshot(list),
                isActiveSession: true,
                updatedAt: new Date().toISOString(),
              },
              { immediateSync: true }
            );
          }

          showToast(
            `Ujian ${paketName}${targetMapel ? ` (${targetMapel})` : ''} dimulai! Jawaban tersimpan otomatis.`,
            'success'
          );
        };

        // Submit & Grade Exam
        const handleFinishExam = async () => {
          let totalScoreEarned = 0;
          let totalMaxScore = 0;

          const subjectScores: Record<string, { earned: number; max: number }> = {
            'Bahasa Indonesia': { earned: 0, max: 0 },
            'Matematika': { earned: 0, max: 0 },
            'IPAS': { earned: 0, max: 0 },
            'Bahasa Inggris': { earned: 0, max: 0 },
            'Koding dan Kecerdasan Artifisial (KKA)': { earned: 0, max: 0 },
          };

          displayExamQuestions.forEach((q) => {
            const studentAns = studentAnswers[q.id];
            const weight = q.bobot || 10;
            const res = evaluateQuestionScore(q.tipe, studentAns, q.kunciJawaban, weight, q.opsi, q);
            totalScoreEarned += res.earnedScore;
            totalMaxScore += weight;

            const normalizedMapelKey = normalizeTkaMapelKey(q.mapel);
            subjectScores[normalizedMapelKey].earned += res.earnedScore;
            subjectScores[normalizedMapelKey].max += weight;
          });

          const completedMapelKeys: TKAMapelScoreKey[] = [];
          const mapelScores: Partial<Record<TKAMapelScoreKey, number>> = {};

          (Object.keys(subjectScores) as TKAMapelScoreKey[]).forEach((mKey) => {
            if (subjectScores[mKey].max > 0) {
              completedMapelKeys.push(mKey);
              const val = Math.round((subjectScores[mKey].earned / subjectScores[mKey].max) * 100);
              mapelScores[mKey] = Number.isFinite(val) ? val : 0;
            }
          });

          if (completedMapelKeys.length === 0 && activeExamMapel) {
            const fallbackKey = normalizeTkaMapelKey(activeExamMapel);
            completedMapelKeys.push(fallbackKey);
            const fallbackVal = totalMaxScore > 0 ? Math.round((totalScoreEarned / totalMaxScore) * 100) : 0;
            mapelScores[fallbackKey] = Number.isFinite(fallbackVal) ? fallbackVal : 0;
          }

          const durationUsedMinutes = Math.max(
            1,
            Math.ceil((activeExamDurationSeconds - examTimerSeconds) / 60)
          );

          const paketBase = activeExamPaket || 'Simulasi 1';
          const { mergedSub, updatedList, cloudSaved } = await upsertTkaSubmissionAsync({
            student: currentStudent,
            paketName: paketBase,
            mapelScores,
            completedMapelKeys,
            questionAnswers: studentAnswers,
            durasiMenitUsed: durationUsedMinutes,
          });
          setTkaSubmissions(updatedList);

          setConfirmFinishTkaExam(false);
          setLastExamResult(mergedSub);
          setIsExamCompleted(true);
          setTkaResumedNotice(null);
          if (currentStudent?.id && activeExamPaket) {
            clearTkaRoomDraft(currentStudent.id, activeExamPaket, activeExamMapel);
            setTkaDraftRevision((v) => v + 1);
          }
          showToast(
            cloudSaved
              ? `Selamat! Ujian TKA selesai dengan skor: ${mergedSub.skorTotal} (Predikat ${mergedSub.predikat}) — tersinkron ke Admin & Rekap TKA.`
              : `Ujian TKA selesai (Skor: ${mergedSub.skorTotal}). Nilai tersimpan & masuk antrean sinkronisasi ke Admin.`,
            'success'
          );
        };
        handleFinishTkaExamRef.current = handleFinishExam;

        // MODE 1: Active CBT Exam Room
        if (activeExamPaket && !isExamCompleted) {
          const answeredCount = Object.keys(studentAnswers).length;
          const totalQ = displayExamQuestions.length;
          const isTimerWarning = examTimerSeconds <= 300; // 5 mins

          return (
            <div className="space-y-4">
              {/* CBT Top Bar */}
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-black">
                    📝
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display font-black text-sm text-slate-800">
                        {activeExamPaket}{activeExamMapel ? ` • ${activeExamMapel}` : ''} • CBT Tes Kemampuan Akademik
                      </h2>
                      <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        ✓ Tersimpan Otomatis ({answeredCount}/{totalQ})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Siswa: <strong className="text-purple-700">{currentStudent.nama}</strong> ({currentStudent.kelas}) • NISN: {currentStudent.nisn}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Timer Badge */}
                  <div
                    className={`px-4 py-2 rounded-2xl flex items-center gap-2 border font-mono font-black text-sm ${
                      isTimerWarning
                        ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                        : 'bg-purple-50 text-purple-800 border-purple-200'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>Sisa Waktu: {formatTimer(examTimerSeconds)}</span>
                  </div>

                  {/* Simpan & Jeda */}
                  <button
                    type="button"
                    onClick={() => {
                      if (currentStudent?.id && activeExamPaket) {
                        saveTkaRoomDraft(
                          {
                            studentId: currentStudent.id,
                            paketName: activeExamPaket,
                            mapelName: activeExamMapel,
                            currentQuestionIdx,
                            studentAnswers,
                            raguChecks,
                            examTimerSeconds,
                            activeExamDurationSeconds,
                            runningQuestionOrder: buildQuestionOrderSnapshot(tkaRunningQuestions),
                            isActiveSession: false,
                            updatedAt: new Date().toISOString(),
                          },
                          { immediateSync: true }
                        );
                        setTkaDraftRevision((v) => v + 1);
                      }
                      setActiveExamPaket(null);
                      setActiveExamMapel(null);
                      setTkaResumedNotice(null);
                      showToast(
                        `Jawaban & posisi Soal #${currentQuestionIdx + 1} tersimpan otomatis.`,
                        'success'
                      );
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-bold px-3.5 py-2 rounded-2xl text-xs flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <PauseCircle className="w-4 h-4 text-purple-600" />
                    <span>Simpan &amp; Jeda</span>
                  </button>

                  {/* Kumpulkan Ujian Button (Inline Confirm) */}
                  {confirmFinishTkaExam ? (
                    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 px-2.5 py-1.5 rounded-2xl">
                      <span className="text-[11px] font-bold text-emerald-900">Yakin kumpulkan?</span>
                      <button
                        type="button"
                        onClick={handleFinishExam}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3 py-1 rounded-xl text-[11px] cursor-pointer"
                      >
                        Ya, Kumpulkan
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmFinishTkaExam(false)}
                        className="bg-white text-slate-600 border border-slate-200 font-bold px-2.5 py-1 rounded-xl text-[11px] cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmFinishTkaExam(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2 rounded-2xl text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition"
                    >
                      <CheckCircle className="w-4 h-4" /> Kumpulkan Ujian
                    </button>
                  )}
                </div>
              </div>

              {tkaResumedNotice && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between gap-3">
                  <span>✓ {tkaResumedNotice}</span>
                  <button
                    type="button"
                    onClick={() => setTkaResumedNotice(null)}
                    className="text-emerald-700 hover:text-emerald-950 font-black px-2 py-0.5 rounded-lg cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* CBT Main Layout: 2 Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left: Question Pane */}
                <div className="lg:col-span-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-5">
                  {/* Question Header & Meta */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black text-xs">
                        {currentQuestionIdx + 1}
                      </span>
                      <span className="text-xs font-black text-slate-700 uppercase bg-slate-100 px-3 py-1 rounded-xl">
                        {activeQuestion?.mapel || 'Bahasa Indonesia'}
                      </span>
                      <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl">
                        Tipe: {activeQuestion?.tipe || 'Pilihan Ganda'}
                      </span>
                    </div>
                    <span className="text-xs font-black text-slate-500">
                      Soal {currentQuestionIdx + 1} dari {totalQ}
                    </span>
                  </div>

                  {/* Question Text & Images (Judul terpisah & posisi gambar fleksibel) */}
                  <QuestionContent
                    pertanyaan={activeQuestion?.pertanyaan || ''}
                    judulTeks={activeQuestion?.judulTeks}
                    gambarUrl={activeQuestion?.gambarUrl}
                    gambarUrl2={activeQuestion?.gambarUrl2}
                    posisiGambar={activeQuestion?.posisiGambar}
                    onOpenZoom={onOpenZoom}
                    titleClassName="text-base sm:text-lg font-display font-black text-slate-900"
                    bodyClassName="text-slate-800 font-medium text-sm leading-relaxed"
                  />

                  {/* Answer Input depending on type */}
                  <div className="space-y-2.5 pt-2">
                    {/* PG */}
                    {(!activeQuestion?.tipe || activeQuestion?.tipe === 'pg') && (
                      <div className="space-y-2">
                        {['A', 'B', 'C', 'D'].map((optKey, idx) => {
                          const optText = activeQuestion?.opsi?.[idx] || `Pilihan Jawaban ${optKey}`;
                          const optImg = activeQuestion?.opsiGambar?.[optKey];
                          const isSelected = studentAnswers[activeQuestion.id] === optKey;

                          return (
                            <label
                              key={optKey}
                              onClick={() => {
                                setStudentAnswers((prev) => ({ ...prev, [activeQuestion.id]: optKey }));
                              }}
                              className={`p-3.5 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition ${
                                isSelected
                                  ? 'bg-purple-50/70 border-purple-600 text-purple-950 font-bold shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
                              }`}
                            >
                              <div
                                className={`w-6 h-6 rounded-xl flex items-center justify-center font-black text-xs shrink-0 mt-0.5 ${
                                  isSelected ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {optKey}
                              </div>
                              <div className="space-y-1.5 flex-1">
                                <span className="text-xs leading-relaxed whitespace-pre-wrap">
                                  <FormattedMathText text={optText} />
                                </span>
                                {optImg && (
                                  <img
                                    src={optImg}
                                    alt={`Opsi ${optKey}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenZoom(optImg, `Gambar Opsi ${optKey}`);
                                    }}
                                    className="max-h-28 rounded-lg border border-slate-200 bg-white object-contain"
                                  />
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* PG Kompleks */}
                    {activeQuestion?.tipe === 'pg_kompleks' && (
                      <div className="space-y-2">
                        <div className="text-[11px] text-purple-700 font-bold">
                          ✓ Pilih satu atau lebih jawaban yang benar:
                        </div>
                        {['A', 'B', 'C', 'D'].map((optKey, idx) => {
                          const optText = activeQuestion?.opsi?.[idx] || `Pernyataan Pilihan ${optKey}`;
                          const selectedArr: string[] = studentAnswers[activeQuestion.id] || [];
                          const isChecked = selectedArr.includes(optKey);

                          return (
                            <label
                              key={optKey}
                              onClick={() => {
                                const currentList: string[] = studentAnswers[activeQuestion.id] || [];
                                const updated = isChecked
                                  ? currentList.filter((k) => k !== optKey)
                                  : [...currentList, optKey];
                                setStudentAnswers((prev) => ({ ...prev, [activeQuestion.id]: updated }));
                              }}
                              className={`p-3.5 rounded-2xl border-2 flex items-center gap-3 cursor-pointer transition ${
                                isChecked
                                  ? 'bg-purple-50/70 border-purple-600 text-purple-950 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                              />
                              <span className="text-xs leading-relaxed whitespace-pre-wrap">
                                {optKey}. <FormattedMathText text={optText} />
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Benar / Salah (Tabel Pernyataan di Kiri & Benar/Salah di Kanan) */}
                    {activeQuestion?.tipe === 'benar_salah' && (
                      <BenarSalahTableView
                        items={resolveBenarSalahItems(activeQuestion)}
                        interactive
                        value={studentAnswers[activeQuestion.id]}
                        onChange={(nextMap) =>
                          setStudentAnswers((prev) => ({ ...prev, [activeQuestion.id]: nextMap }))
                        }
                        accentTheme="purple"
                      />
                    )}

                    {/* Menjodohkan (Kolom Kiri 1..N & Kolom Kanan A..M) */}
                    {activeQuestion?.tipe === 'menjodohkan' && (
                      (() => {
                        const matchData = resolveMenjodohkanData(activeQuestion);
                        return matchData ? (
                          <MenjodohkanColumnsView
                            data={matchData}
                            interactive
                            value={studentAnswers[activeQuestion.id]}
                            onChange={(nextMap) =>
                              setStudentAnswers((prev) => ({ ...prev, [activeQuestion.id]: nextMap }))
                            }
                            accentTheme="purple"
                          />
                        ) : (
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-700">
                              Tuliskan Jawaban Anda:
                            </label>
                            <input
                              type="text"
                              value={studentAnswers[activeQuestion?.id] || ''}
                              onChange={(e) => {
                                setStudentAnswers((prev) => ({
                                  ...prev,
                                  [activeQuestion.id]: e.target.value,
                                }));
                              }}
                              placeholder="Ketik jawaban Anda di sini..."
                              className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 text-xs font-bold focus:border-purple-600 outline-none"
                            />
                          </div>
                        );
                      })()
                    )}

                    {/* Isian Singkat & Uraian */}
                    {(activeQuestion?.tipe === 'isian' || activeQuestion?.tipe === 'uraian') && (
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700">
                          Tuliskan Jawaban Anda:
                        </label>
                        {activeQuestion.tipe === 'uraian' ? (
                          <textarea
                            rows={3}
                            value={studentAnswers[activeQuestion?.id] || ''}
                            onChange={(e) => {
                              setStudentAnswers((prev) => ({
                                ...prev,
                                [activeQuestion.id]: e.target.value,
                              }));
                            }}
                            placeholder="Ketik jawaban uraian Anda di sini..."
                            className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 text-xs font-bold focus:border-purple-600 outline-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={studentAnswers[activeQuestion?.id] || ''}
                            onChange={(e) => {
                              setStudentAnswers((prev) => ({
                                ...prev,
                                [activeQuestion.id]: e.target.value,
                              }));
                            }}
                            placeholder="Ketik jawaban Anda di sini..."
                            className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 text-xs font-bold focus:border-purple-600 outline-none"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={currentQuestionIdx === 0}
                      onClick={() => setCurrentQuestionIdx((p) => Math.max(0, p - 1))}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      ← Soal Sebelumnya
                    </button>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                      <input
                        type="checkbox"
                        checked={Boolean(raguChecks[activeQuestion?.id])}
                        onChange={(e) => {
                          setRaguChecks((prev) => ({
                            ...prev,
                            [activeQuestion.id]: e.target.checked,
                          }));
                        }}
                        className="w-4 h-4 rounded text-amber-500 cursor-pointer"
                      />
                      <span>Ragu-Ragu</span>
                    </label>

                    <button
                      type="button"
                      disabled={currentQuestionIdx === totalQ - 1}
                      onClick={() => setCurrentQuestionIdx((p) => Math.min(totalQ - 1, p + 1))}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Soal Berikutnya →
                    </button>
                  </div>
                </div>

                {/* Right: Question Number Grid Palette */}
                <div className="lg:col-span-4 bg-white p-5 rounded-3xl shadow-sm border border-slate-200 space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="font-display font-black text-sm text-slate-800">
                      Daftar Nomor Soal TKA
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Terjawab: <strong className="text-emerald-600">{answeredCount}</strong> dari {totalQ} Soal
                    </p>
                  </div>

                  {/* Number Grid */}
                  <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto p-1">
                    {displayExamQuestions.map((q, idx) => {
                      const isAnswered = isQuestionAnswerFilled(studentAnswers[q.id]);
                      const isRagu = Boolean(raguChecks[q.id]);
                      const isActive = idx === currentQuestionIdx;

                      let btnStyle = 'bg-slate-100 text-slate-700 hover:bg-slate-200';
                      if (isRagu) {
                        btnStyle = 'bg-amber-400 text-slate-900 font-black shadow-xs';
                      } else if (isAnswered) {
                        btnStyle = 'bg-emerald-500 text-white font-black shadow-xs';
                      }

                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setCurrentQuestionIdx(idx)}
                          className={`h-10 rounded-xl font-mono text-xs font-bold transition cursor-pointer relative ${btnStyle} ${
                            isActive ? 'ring-2 ring-purple-600 ring-offset-2 scale-105' : ''
                          }`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-md bg-emerald-500"></span>
                      <span className="text-slate-600 font-bold">Hijau: Sudah Dijawab</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-md bg-amber-400"></span>
                      <span className="text-slate-600 font-bold">Kuning: Ragu-Ragu</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-md bg-slate-200"></span>
                      <span className="text-slate-600 font-bold">Abu-abu: Belum Dijawab</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleFinishExam}
                    className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-display font-black text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" /> Selesai &amp; Kumpulkan Ujian
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // MODE 2: Exam Completed Celebration / Score View
        if (isExamCompleted && lastExamResult) {
          return (
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-2xl mx-auto space-y-6 text-center animate-in fade-in">
              <div className="w-20 h-20 rounded-3xl bg-purple-100 text-purple-700 mx-auto flex items-center justify-center text-3xl shadow-sm">
                🏆
              </div>

              <div>
                <span className="text-xs font-black uppercase bg-purple-100 text-purple-800 px-3 py-1 rounded-full">
                  Ujian Berhasil Diselesaikan!
                </span>
                <h2 className="text-2xl font-display font-black text-slate-800 mt-2">
                  Hasil Ujian: {lastExamResult.paket}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Selamat <strong className="text-purple-700">{lastExamResult.nama || lastExamResult.studentName}</strong> ({lastExamResult.kelas}), lembar jawaban Anda telah diperiksa otomatis dan masuk ke Analisis &amp; Rekap TKA.
                </p>
              </div>

              {/* Total Score Badge */}
              <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-50 via-white to-sky-50 border-2 border-purple-200 space-y-2">
                <span className="text-xs font-black uppercase text-purple-700">Skor Akhir Komposit TKA</span>
                <div className="text-5xl font-display font-black text-purple-900">{lastExamResult.skorTotal}</div>
                <div className="flex justify-center items-center gap-2 pt-1">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black ${
                      lastExamResult.predikat === 'A'
                        ? 'bg-emerald-100 text-emerald-800'
                        : lastExamResult.predikat === 'B'
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    Predikat {lastExamResult.predikat}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black ${
                      lastExamResult.status === 'Tuntas'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                        : 'bg-rose-50 text-rose-700 border border-rose-300'
                    }`}
                  >
                    {lastExamResult.status} (KKTP 75)
                  </span>
                </div>
              </div>

              {/* Subject Breakdown (Hanya Mapel yang Ada Tes / Dikerjakan) */}
              {(() => {
                const completedSet: string[] = Array.isArray(lastExamResult.completedMapels)
                  ? lastExamResult.completedMapels.map((m: string) => normalizeTkaMapelKey(m))
                  : [];
                const candidateCards = [
                  {
                    key: 'Bahasa Indonesia',
                    label: 'B. INDONESIA',
                    score: lastExamResult.scoresPerMapel?.['Bahasa Indonesia'] ?? lastExamResult.skorIndo,
                    isIndigo: false,
                  },
                  {
                    key: 'Matematika',
                    label: 'MATEMATIKA',
                    score: lastExamResult.scoresPerMapel?.['Matematika'] ?? lastExamResult.skorMtk,
                    isIndigo: false,
                  },
                  {
                    key: 'IPAS',
                    label: 'IPAS',
                    score: lastExamResult.scoresPerMapel?.['IPAS'] ?? lastExamResult.skorIpas,
                    isIndigo: false,
                  },
                  {
                    key: 'Bahasa Inggris',
                    label: 'B. INGGRIS',
                    score: lastExamResult.scoresPerMapel?.['Bahasa Inggris'] ?? lastExamResult.skorInggris,
                    isIndigo: false,
                  },
                  {
                    key: 'Koding dan Kecerdasan Artifisial (KKA)',
                    label: 'KKA (KODING/AI)',
                    score:
                      lastExamResult.scoresPerMapel?.['Koding dan Kecerdasan Artifisial (KKA)'] ??
                      lastExamResult.skorKka,
                    isIndigo: true,
                  },
                ].filter((card) => {
                  if (completedSet.length > 0) {
                    return completedSet.includes(card.key);
                  }
                  return Number(lastExamResult.scoresPerMapel?.[card.key] ?? 0) > 0;
                });

                if (candidateCards.length === 0) return null;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-left">
                    {candidateCards.map((card) => (
                      <div
                        key={card.key}
                        className={`p-3 rounded-2xl border ${
                          card.isIndigo
                            ? 'bg-indigo-50 border-indigo-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <span
                          className={`text-[10px] font-bold block ${
                            card.isIndigo ? 'text-indigo-500' : 'text-slate-400'
                          }`}
                        >
                          {card.label}
                        </span>
                        <span
                          className={`text-lg font-black font-mono ${
                            card.isIndigo ? 'text-indigo-800' : 'text-slate-800'
                          }`}
                        >
                          {card.score ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedHasilStudent(lastExamResult);
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-display font-black text-xs shadow-md transition cursor-pointer flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" /> Lihat Rapor Lengkap TKA
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveExamPaket(null);
                    setIsExamCompleted(false);
                    setLastExamResult(null);
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-black text-xs transition cursor-pointer"
                >
                  Kembali ke Daftar Paket Ujian
                </button>
              </div>
            </div>
          );
        }

        // MODE 3: Default Package Selection Dashboard
        return (
          <div className="space-y-6">
            {/* Student Header Card */}
            <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 sm:p-7 rounded-3xl shadow-md space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={currentStudent.fotoUrl}
                    alt={currentStudent.nama}
                    onClick={() => onOpenZoom(currentStudent.fotoUrl, currentStudent.nama)}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-white/60 shadow-md cursor-zoom-in"
                  />
                  <div>
                    <span className="text-xs font-black uppercase bg-white/20 text-white px-3 py-1 rounded-full border border-white/30">
                      Ruang Ujian Siswa • CBT TKA
                    </span>
                    <h2 className="text-xl sm:text-2xl font-display font-black mt-1">
                      {currentStudent.nama}
                    </h2>
                    <p className="text-xs text-purple-200 font-medium">
                      Kelas: <strong>{currentStudent.kelas}</strong> • NISN: {currentStudent.nisn} • SDN Rawa Badak Utara 21
                    </p>
                  </div>
                </div>

                {/* If logged in as admin/guru, show student switcher */}
                {activeUser.role !== 'siswa' && (
                  <div className="bg-white/10 p-3 rounded-2xl border border-white/20">
                    <label className="block text-[10px] font-bold uppercase text-purple-200 mb-1">
                      Ganti Akun Siswa (Mode Preview Guru/Admin):
                    </label>
                    <select
                      value={tkaStudents.some((s) => s.id === selectedTestStudentId) ? selectedTestStudentId : (tkaStudents[0]?.id || '')}
                      onChange={(e) => setSelectedTestStudentId(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-white text-slate-800 text-xs font-bold outline-none cursor-pointer"
                    >
                      {tkaStudents.length === 0 ? (
                        <option value="">Belum ada peserta TKA aktif</option>
                      ) : (
                        tkaStudents.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nama} ({s.kelas})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
              </div>

              {/* Instructions banner */}
              <div className="p-4 rounded-2xl bg-white/10 border border-white/20 text-xs space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300" /> Ketentuan Ujian Tes Kemampuan Akademik (TKA):
                </div>
                <p className="text-purple-100 text-[11px] leading-relaxed">
                  1. Soal terdiri dari 5 Mata Pelajaran: Bahasa Indonesia, Matematika, IPAS, Bahasa Inggris, dan Koding &amp; Kecerdasan Artifisial (KKA).<br />
                  2. Durasi pengerjaan mengikuti pengaturan waktu tiap paket/mapel oleh guru dengan timer &amp; auto-submit CBT otomatis.<br />
                  3. Nilai KKTP ketuntasan adalah 75.00 poin. Hasil ujian langsung tersimpan dan terhubung ke Rapor TKA.
                </p>
              </div>
            </div>

            {/* Filter Dropdown Jenis TKA & Mata Pelajaran + Daftar Paket TKA */}
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-purple-600" /> Pilih Paket Soal &amp; Mata Pelajaran TKA
                    </h3>
                    <p className="text-xs text-slate-500">
                      Pilih jenis simulasi / try out TKA dan mata pelajaran yang ingin dikerjakan. Soal disesuaikan persis dengan Bank Soal TKA yang dibuat guru.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      Jenis / Paket TKA
                    </label>
                    <select
                      value={studentTkaFilterPaket}
                      onChange={(e) => setStudentTkaFilterPaket(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl border-2 border-purple-400 bg-white text-xs font-extrabold text-purple-950 outline-none cursor-pointer"
                    >
                      <option value="all">-- Semua Paket TKA ({TKA_JENIS_LIST.length} Paket) --</option>
                      {Array.from(new Set([...TKA_JENIS_LIST, ...tkaQuestions.map((q) => q.jenisTka)])).map((jenis) => {
                        const count = tkaQuestions.filter((q) => q.jenisTka === jenis).length;
                        return (
                          <option key={jenis} value={jenis}>
                            {jenis} ({count} Soal)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      Mata Pelajaran TKA
                    </label>
                    <select
                      value={studentTkaFilterMapel}
                      onChange={(e) => setStudentTkaFilterMapel(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl border-2 border-indigo-400 bg-white text-xs font-extrabold text-indigo-950 outline-none cursor-pointer"
                    >
                      <option value="all">-- Semua Mata Pelajaran (Gabungan Paket) --</option>
                      {Array.from(new Set([...TKA_MAPEL_LIST, ...tkaQuestions.map((q) => q.mapel)])).map((m) => {
                        const count = tkaQuestions.filter(
                          (q) =>
                            (studentTkaFilterPaket === 'all' || q.jenisTka === studentTkaFilterPaket) &&
                            q.mapel === m
                        ).length;
                        return (
                          <option key={m} value={m}>
                            {m} ({count} Soal)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from(new Set([...TKA_JENIS_LIST, ...tkaQuestions.map((q) => q.jenisTka)]))
                  .filter((paketName) => studentTkaFilterPaket === 'all' || paketName === studentTkaFilterPaket)
                  .map((paketName) => {
                    const selectedMapel = studentTkaFilterMapel === 'all' ? null : studentTkaFilterMapel;
                    const paketLookupKey = selectedMapel ? `${paketName} (${selectedMapel})` : paketName;
                    const selectedMapelNorm = selectedMapel ? normalizeTkaMapelKey(selectedMapel) : null;
                    const existingSub = tkaSubmissions.find((s) => {
                      if (s.studentId !== currentStudent.id) return false;
                      const base = s.paketDasar || extractBaseTkaPaket(s.paket);
                      if (base !== paketName && s.paket !== paketLookupKey) return false;
                      if (!selectedMapelNorm) return true;
                      if (s.completedMapels && s.completedMapels.length > 0) {
                        return s.completedMapels.includes(selectedMapelNorm);
                      }
                      return s.paket === paketLookupKey || s.paket === paketName;
                    });
                    const qCount = tkaQuestions.filter(
                      (q) => q.jenisTka === paketName && (!selectedMapel || q.mapel === selectedMapel)
                    ).length;

                    return (
                      <div
                        key={paketLookupKey}
                        className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-purple-300 hover:shadow-md transition space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full border border-purple-200">
                              {selectedMapel || 'Gabungan Mapel TKA'}
                            </span>
                            {existingSub ? (
                              <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                ✓ Selesai
                              </span>
                            ) : (
                              <span className="text-[10px] font-black bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full border border-amber-200">
                                {qCount > 0 ? 'Siap Dikerjakan' : 'Belum Ada Soal'}
                              </span>
                            )}
                          </div>

                          <h4 className="font-display font-black text-base text-slate-800">
                            {paketName}{selectedMapel ? ` — ${selectedMapel}` : ''}
                          </h4>
                          <p className="text-xs text-slate-500">
                            {selectedMapel
                              ? `Soal TKA ${paketName} khusus mata pelajaran ${selectedMapel}.`
                              : '5 Mapel: B. Indonesia, Matematika, IPAS, B. Inggris, Koding & KA (KKA).'}
                          </p>

                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                            <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                              <span className="text-slate-400 block text-[10px]">Jumlah Soal</span>
                              <span className="font-bold text-slate-700 font-mono">{qCount} Butir</span>
                            </div>
                            <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                              <span className="text-slate-400 block text-[10px]">Waktu Ujian</span>
                              <span className="font-bold text-slate-700 font-mono">
                                {getTKADurationMinutes(tkaDurations, paketName, selectedMapel)} Menit
                              </span>
                            </div>
                          </div>

                          {existingSub && (
                            <div className="p-2.5 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-between text-xs">
                              <div>
                                <span className="text-[10px] text-purple-600 font-bold block">Skor Capaian:</span>
                                <span className="font-black text-purple-900 text-base font-mono">
                                  {existingSub.skorTotal} / 100
                                </span>
                              </div>
                              <div className="text-right">
                                <span
                                  className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    existingSub.status === 'Tuntas'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {existingSub.status}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                          {(() => {
                            void tkaDraftRevision;
                            const pausedDraft = currentStudent?.id
                              ? getTkaRoomDraft(currentStudent.id, paketName, selectedMapel)
                              : null;
                            if (pausedDraft && pausedDraft.examTimerSeconds > 0 && qCount > 0) {
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleStartExam(paketName, selectedMapel, true)}
                                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1"
                                    title="Mulai ulang dari soal pertama"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" /> Ulang
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => resumeFromTkaDraft(pausedDraft)}
                                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                                  >
                                    <Play className="w-4 h-4" /> Lanjutkan Soal #{pausedDraft.currentQuestionIdx + 1}
                                  </button>
                                </>
                              );
                            }
                            if (existingSub) {
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedHasilStudent(existingSub)}
                                    className="flex-1 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-display font-black text-xs transition cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    <Eye className="w-3.5 h-3.5" /> Lihat Rapor
                                  </button>
                                  <button
                                    type="button"
                                    disabled={qCount === 0}
                                    onClick={() => handleStartExam(paketName, selectedMapel)}
                                    className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-display font-black text-xs transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                                  >
                                    <Play className="w-3.5 h-3.5" /> Kerjakan Ulang
                                  </button>
                                </>
                              );
                            }
                            return (
                              <button
                                type="button"
                                disabled={qCount === 0}
                                onClick={() => handleStartExam(paketName, selectedMapel)}
                                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-display font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                              >
                                <Play className="w-4 h-4" /> Mulai Tes TKA Sekarang
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= MODAL RAPOR TKA INDIVIDU SISWA ================= */}
      {selectedHasilStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:static print:inset-auto print:z-auto print:bg-white print:p-0 print:overflow-visible print:block">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl space-y-5 border border-slate-200 animate-in fade-in zoom-in-95 my-8 print:shadow-none print:border-0 print:rounded-none print:max-w-none print:w-full print:my-0 print:p-1">
            {/* Kop Surat Resmi Sekolah */}
            <div className="flex items-center justify-between gap-4 border-b-4 border-double border-slate-900 pb-3">
              {profile?.logoKemendikbudUrl ? (
                <img
                  src={profile.logoKemendikbudUrl}
                  alt="Logo Dinas"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 object-contain shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-black shrink-0">
                  <Award className="w-6 h-6" />
                </div>
              )}
              <div className="text-center flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Pemerintah Provinsi DKI Jakarta · Suku Dinas Pendidikan Jakarta Utara
                </div>
                <h3 className="font-display font-black text-base sm:text-lg text-slate-950 uppercase">
                  {profile?.name || 'SDN Rawa Badak Utara 21'}
                </h3>
                <p className="text-[11px] text-slate-600">
                  {profile?.alamat || 'Jl. Rawa Badak Utara'} · {profile?.kota || 'Jakarta Utara'}
                  {profile?.npsn ? ` · NPSN: ${profile.npsn}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {profile?.logoSekolahUrl && (
                  <img
                    src={profile.logoSekolahUrl}
                    alt="Logo Sekolah"
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 object-contain shrink-0"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setSelectedHasilStudent(null)}
                  className="no-print w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center font-bold text-sm cursor-pointer transition"
                  aria-label="Tutup Rapor TKA"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Judul Rapor TKA */}
            <div className="text-center space-y-0.5">
              <h4 className="font-display font-black text-sm sm:text-base uppercase tracking-wide text-slate-900">
                LEMBAR LAPORAN HASIL TES KEMAMPUAN AKADEMIK (TKA)
              </h4>
              <p className="text-xs text-slate-500 font-medium">
                Tahun Pelajaran {activeYear} · Paket Ujian: <strong className="text-slate-700">{selectedHasilStudent.paket}</strong>
              </p>
            </div>

            {/* Biodata Siswa */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/90 p-3.5 rounded-2xl print:rounded-lg border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 font-bold text-[10px] uppercase block">Nama Lengkap</span>
                <span className="font-black text-slate-900">{selectedHasilStudent.nama || selectedHasilStudent.studentName}</span>
              </div>
              <div>
                <span className="text-slate-500 font-bold text-[10px] uppercase block">NISN / No. Induk</span>
                <span className="font-mono font-bold text-slate-800 tabular-nums">{selectedHasilStudent.nisn}</span>
              </div>
              <div>
                <span className="text-slate-500 font-bold text-[10px] uppercase block">Rombel / Kelas</span>
                <span className="font-bold text-purple-800">{selectedHasilStudent.kelas}</span>
              </div>
              <div>
                <span className="text-slate-500 font-bold text-[10px] uppercase block">Status Ketuntasan</span>
                <span className={`font-black ${selectedHasilStudent.status === 'Tuntas' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {selectedHasilStudent.status} (KKTP 75)
                </span>
              </div>
            </div>

            {/* Tabel Rincian Skor per Mapel (Hanya tampilkan mapel yang memiliki tes) */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-purple-600 text-white font-extrabold text-[11px] uppercase">
                    <th className="p-3">No</th>
                    <th className="p-3">Mata Pelajaran yang Diuji</th>
                    <th className="p-3 text-center">Bobot</th>
                    <th className="p-3 text-center">Nilai Capaian</th>
                    <th className="p-3 text-center">Predikat</th>
                    <th className="p-3">Deskripsi Capaian Kompetensi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const completedMapels: string[] = Array.isArray(selectedHasilStudent.completedMapels)
                      ? selectedHasilStudent.completedMapels.map((m: string) => normalizeTkaMapelKey(m))
                      : [];
                    const targetPaket =
                      selectedHasilStudent.paketDasar ||
                      extractBaseTkaPaket(selectedHasilStudent.paket || '');
                    const paketHasQuestions = (key: TKAMapelScoreKey) =>
                      tkaQuestions.some(
                        (q) =>
                          (!targetPaket || q.jenisTka === targetPaket) &&
                          normalizeTkaMapelKey(q.mapel) === key
                      );
                    const hasScoreMapEntry = (key: TKAMapelScoreKey) =>
                      Number(selectedHasilStudent.scoresPerMapel?.[key] ?? 0) > 0;
                    const predFromScore = (score: number) =>
                      score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';

                    const allRows: Array<{
                      key: TKAMapelScoreKey;
                      label: string;
                      score: number;
                      desc: string;
                      isIndigo: boolean;
                    }> = [
                      {
                        key: 'Bahasa Indonesia',
                        label: 'Bahasa Indonesia (Literasi Membaca)',
                        score:
                          selectedHasilStudent.scoresPerMapel?.['Bahasa Indonesia'] ??
                          selectedHasilStudent.skorIndo ??
                          0,
                        desc: 'Sangat terampil menemukan gagasan pokok dan menganalisis simpulan teks informatif.',
                        isIndigo: false,
                      },
                      {
                        key: 'Matematika',
                        label: 'Matematika (Numerasi & Penalaran)',
                        score:
                          selectedHasilStudent.scoresPerMapel?.['Matematika'] ??
                          selectedHasilStudent.skorMtk ??
                          0,
                        desc: 'Mampu menyelesaikan soal aplikasi operasi pecahan, perbandingan, dan bangun ruang.',
                        isIndigo: false,
                      },
                      {
                        key: 'IPAS',
                        label: 'IPAS (Sains & Lingkungan Sosial)',
                        score:
                          selectedHasilStudent.scoresPerMapel?.['IPAS'] ??
                          selectedHasilStudent.skorIpas ??
                          0,
                        desc: 'Memahami siklus ekosistem, sifat energi, serta interaksi sosial kemasyarakatan.',
                        isIndigo: false,
                      },
                      {
                        key: 'Bahasa Inggris',
                        label: 'Bahasa Inggris (Literasi Global)',
                        score:
                          selectedHasilStudent.scoresPerMapel?.['Bahasa Inggris'] ??
                          selectedHasilStudent.skorInggris ??
                          0,
                        desc: 'Mampu memahami ungkapan kontekstual, deskripsi harian, dan kosa kata fungsional.',
                        isIndigo: false,
                      },
                      {
                        key: 'Koding dan Kecerdasan Artifisial (KKA)',
                        label: 'Koding & Kecerdasan Artifisial (KKA)',
                        score:
                          selectedHasilStudent.scoresPerMapel?.['Koding dan Kecerdasan Artifisial (KKA)'] ??
                          selectedHasilStudent.skorKka ??
                          0,
                        desc: 'Menerapkan berpikir komputasional, logika blok algoritma, dan etika aman Kecerdasan Artifisial.',
                        isIndigo: true,
                      },
                    ];

                    const hasAnyPositiveScore = allRows.some((row) => hasScoreMapEntry(row.key));
                    const visibleRows = allRows.filter((row) => {
                      if (completedMapels.length > 0) {
                        return completedMapels.includes(row.key);
                      }
                      if (hasAnyPositiveScore) {
                        return hasScoreMapEntry(row.key);
                      }
                      return paketHasQuestions(row.key);
                    });

                    if (visibleRows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-500 italic">
                            Belum ada mata pelajaran yang memiliki tes pada paket TKA ini.
                          </td>
                        </tr>
                      );
                    }

                    const weightPct = Math.round(100 / visibleRows.length);
                    return visibleRows.map((row, idx) => (
                      <tr key={row.key}>
                        <td className="p-3 text-center font-bold">{idx + 1}</td>
                        <td className={`p-3 font-bold ${row.isIndigo ? 'text-indigo-800' : 'text-slate-800'}`}>
                          {row.label}
                        </td>
                        <td className="p-3 text-center text-slate-500 font-mono">{weightPct}%</td>
                        <td className={`p-3 text-center font-mono font-black text-sm ${row.isIndigo ? 'text-indigo-700' : 'text-purple-700'}`}>
                          {row.score}
                        </td>
                        <td className="p-3 text-center font-black">
                          {predFromScore(row.score)}
                        </td>
                        <td className="p-3 text-slate-600 text-[11px]">
                          {row.desc}
                        </td>
                      </tr>
                    ));
                  })()}
                  <tr className="bg-purple-50 font-black">
                    <td colSpan={3} className="p-3 text-right uppercase text-purple-900">
                      Rata-Rata Nilai Akhir Komposit TKA:
                    </td>
                    <td className="p-3 text-center font-mono text-base text-purple-800">
                      {selectedHasilStudent.skorTotal}
                    </td>
                    <td className="p-3 text-center text-purple-800">
                      {selectedHasilStudent.predikat}
                    </td>
                    <td className="p-3 text-emerald-800 font-extrabold">
                      Status: {selectedHasilStudent.status} (KKTP &gt;= 75)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tanda Tangan (Sinkron dengan Data Guru) */}
            {(() => {
              const kepsekRaporTka = resolveKepalaSekolah(teachers, profile);
              const waliRaporTka = resolveWaliKelas(teachers, selectedHasilStudent.kelas);
              const tglRapor = new Date().toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              });
              return (
                <div className="grid grid-cols-3 gap-4 pt-4 text-xs text-center border-t border-slate-200 print-avoid-break">
                  <div>
                    <p className="font-medium text-slate-700">Mengetahui,<br />Orang Tua / Wali Murid</p>
                    <div style={{ height: '4cm' }} />
                    <div className="w-36 border-b border-slate-400 mx-auto mb-1"></div>
                    <p className="text-[10px] text-slate-500">(Nama Terang Orang Tua)</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">
                      Mengetahui,<br />Kepala {profile?.name || 'SDN Rawa Badak Utara 21'}
                    </p>
                    <div style={{ height: '4cm' }} />
                    <p className="font-black text-slate-800 underline">{kepsekRaporTka.nama}</p>
                    <p className="text-[10px] font-mono text-slate-500 tabular-nums">
                      {formatNipLabel(kepsekRaporTka.status, kepsekRaporTka.nip)}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">
                      Jakarta, {tglRapor}<br />Wali Kelas {selectedHasilStudent.kelas}
                    </p>
                    <div style={{ height: '4cm' }} />
                    <p className="font-black text-slate-800 underline">
                      {waliRaporTka?.nama || 'Belum Ditugaskan'}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 tabular-nums">
                      {formatNipLabel(waliRaporTka?.statusPegawai, waliRaporTka?.nip)}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Modal Actions */}
            <div className="no-print flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedHasilStudent(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  const kepsekModal = resolveKepalaSekolah(teachers, profile);
                  const recordPayload: TkaReportRecordInput = {
                    id: selectedHasilStudent.id,
                    studentId: selectedHasilStudent.studentId,
                    nama: selectedHasilStudent.nama || selectedHasilStudent.studentName || '-',
                    nisn: selectedHasilStudent.nisn || '-',
                    kelas: selectedHasilStudent.kelas || '-',
                    paket: selectedHasilStudent.paket || selectedHasilStudent.paketDasar || '-',
                    paketDasar: selectedHasilStudent.paketDasar,
                    completedMapels: selectedHasilStudent.completedMapels,
                    scoresPerMapel: selectedHasilStudent.scoresPerMapel,
                    skorIndo: selectedHasilStudent.skorIndo,
                    skorMtk: selectedHasilStudent.skorMtk,
                    skorIpas: selectedHasilStudent.skorIpas,
                    skorInggris: selectedHasilStudent.skorInggris,
                    skorKka: selectedHasilStudent.skorKka,
                    skorTotal: selectedHasilStudent.skorTotal ?? 0,
                    predikat: selectedHasilStudent.predikat || 'D',
                    status: selectedHasilStudent.status || 'Remedial',
                    tanggalUjian: selectedHasilStudent.tanggalUjian,
                    durasiPengerjaan: selectedHasilStudent.durasiPengerjaan,
                  };
                  exportIndividualTkaReportToWord(recordPayload, {
                    schoolName: profile?.name || 'SDN Rawa Badak Utara 21',
                    schoolAddress: profile?.alamat || '',
                    schoolNpsn: profile?.npsn || '',
                    logoKemendikbudUrl: profile?.logoKemendikbudUrl,
                    logoSekolahUrl: profile?.logoSekolahUrl,
                    tahunPelajaran: activeYear,
                    paketLabel: recordPayload.paket,
                    kepsekNama: kepsekModal.nama,
                    kepsekNipLabel: formatNipLabel(kepsekModal.status, kepsekModal.nip),
                    getWaliKelas: (cls: string) => {
                      const wali = resolveWaliKelas(teachers, cls);
                      return {
                        nama: wali?.nama || 'Belum Ditugaskan',
                        nipLabel: formatNipLabel(wali?.statusPegawai, wali?.nip),
                      };
                    },
                    activeTestedMapels: [],
                    tkaQuestions,
                  });
                  showToast(`Report TKA "${recordPayload.nama}" (.DOC Word) berhasil diunduh.`, 'success');
                }}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-display font-black text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4" /> Download Word (.DOC)
              </button>
              <button
                type="button"
                onClick={async () => {
                  const kepsekModal = resolveKepalaSekolah(teachers, profile);
                  const recordPayload: TkaReportRecordInput = {
                    id: selectedHasilStudent.id,
                    studentId: selectedHasilStudent.studentId,
                    nama: selectedHasilStudent.nama || selectedHasilStudent.studentName || '-',
                    nisn: selectedHasilStudent.nisn || '-',
                    kelas: selectedHasilStudent.kelas || '-',
                    paket: selectedHasilStudent.paket || selectedHasilStudent.paketDasar || '-',
                    paketDasar: selectedHasilStudent.paketDasar,
                    completedMapels: selectedHasilStudent.completedMapels,
                    scoresPerMapel: selectedHasilStudent.scoresPerMapel,
                    skorIndo: selectedHasilStudent.skorIndo,
                    skorMtk: selectedHasilStudent.skorMtk,
                    skorIpas: selectedHasilStudent.skorIpas,
                    skorInggris: selectedHasilStudent.skorInggris,
                    skorKka: selectedHasilStudent.skorKka,
                    skorTotal: selectedHasilStudent.skorTotal ?? 0,
                    predikat: selectedHasilStudent.predikat || 'D',
                    status: selectedHasilStudent.status || 'Remedial',
                    tanggalUjian: selectedHasilStudent.tanggalUjian,
                    durasiPengerjaan: selectedHasilStudent.durasiPengerjaan,
                  };
                  await exportIndividualTkaReportToPdf(recordPayload, {
                    schoolName: profile?.name || 'SDN Rawa Badak Utara 21',
                    schoolAddress: profile?.alamat || '',
                    schoolNpsn: profile?.npsn || '',
                    logoKemendikbudUrl: profile?.logoKemendikbudUrl,
                    logoSekolahUrl: profile?.logoSekolahUrl,
                    tahunPelajaran: activeYear,
                    paketLabel: recordPayload.paket,
                    kepsekNama: kepsekModal.nama,
                    kepsekNipLabel: formatNipLabel(kepsekModal.status, kepsekModal.nip),
                    getWaliKelas: (cls: string) => {
                      const wali = resolveWaliKelas(teachers, cls);
                      return {
                        nama: wali?.nama || 'Belum Ditugaskan',
                        nipLabel: formatNipLabel(wali?.statusPegawai, wali?.nip),
                      };
                    },
                    activeTestedMapels: [],
                    tkaQuestions,
                  });
                  showToast(`Report TKA "${recordPayload.nama}" (.PDF) berhasil diunduh.`, 'success');
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Unduh PDF (.PDF)
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-display font-black text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" /> Cetak Lembar Rapor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL TAMBAH CP TKA ================= */}
      {showAddCpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-rose-600" /> Tambah CP TKA Baru
              </h3>
              <button
                type="button"
                onClick={() => setShowAddCpModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickCp} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kode CP:</label>
                <input
                  type="text"
                  value={quickCpKode}
                  onChange={(e) => setQuickCpKode(e.target.value)}
                  placeholder="Contoh: CP-TKA-03"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mata Pelajaran:</label>
                <select
                  value={quickCpMapel}
                  onChange={(e) => setQuickCpMapel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                >
                  {TKA_MAPEL_LIST.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Judul Capaian Pembelajaran (CP):</label>
                <input
                  type="text"
                  value={quickCpJudul}
                  onChange={(e) => setQuickCpJudul(e.target.value)}
                  placeholder="Contoh: Pemahaman Teks Deskripsi & Fakta"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Deskripsi Lengkap CP:</label>
                <textarea
                  rows={3}
                  value={quickCpDesc}
                  onChange={(e) => setQuickCpDesc(e.target.value)}
                  placeholder="Deskripsi standar kompetensi CP..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCpModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer shadow-sm"
                >
                  Simpan CP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL TAMBAH TP TKA ================= */}
      {showAddTpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-sky-600" /> Tambah TP TKA Baru
              </h3>
              <button
                type="button"
                onClick={() => setShowAddTpModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickTp} className="space-y-3">
              <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900">
                Untuk CP: <strong>{activeCp?.judulCp}</strong>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kode TP (Opsional):</label>
                <input
                  type="text"
                  value={quickTpKode}
                  onChange={(e) => setQuickTpKode(e.target.value)}
                  placeholder={`Contoh: TP${(activeCp?.tpList?.length || 0) + 1}`}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tujuan Pembelajaran (TP):</label>
                <textarea
                  rows={3}
                  value={quickTpJudul}
                  onChange={(e) => setQuickTpJudul(e.target.value)}
                  placeholder="Contoh: Peserta didik mampu menganalisis hubungan sebab akibat dalam teks..."
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTpModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black cursor-pointer shadow-sm"
                >
                  Simpan TP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ================= MODAL KONFIRMASI KOSONGKAN DATA TKA ================= */}
      {clearTkaModalContext && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-rose-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-600" /> Kosongkan Data{' '}
                {clearTkaModalContext.source === 'analisis' ? 'Analisis TKA' : 'Rekap TKA'}
              </h3>
              <button
                type="button"
                onClick={() => setClearTkaModalContext(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1.5 leading-relaxed">
              <p className="font-bold">
                Tindakan ini akan menghapus data hasil pengerjaan &amp; analisis siswa dari sistem sekolah (termasuk sinkronisasi Cloud Firestore).
              </p>
              <p className="text-[11px] text-rose-700">
                Bank Soal TKA tidak akan ikut terhapus, hanya data nilai &amp; jawaban hasil ujian siswa.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {clearTkaModalContext.targetPaket !== 'all' && (
                <button
                  type="button"
                  onClick={() => executeClearTkaData('paket')}
                  className="w-full px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-display font-black cursor-pointer shadow-xs transition flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Kosongkan Paket "{clearTkaModalContext.targetPaket}" Saja</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => executeClearTkaData('all')}
                className="w-full px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-display font-black cursor-pointer shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Kosongkan Semua Data Hasil &amp; Analisis TKA</span>
              </button>

              <button
                type="button"
                onClick={() => setClearTkaModalContext(null)}
                className="w-full px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
