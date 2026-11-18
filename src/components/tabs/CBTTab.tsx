import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Laptop,
  CheckCircle,
  Clock,
  Maximize2,
  FileText,
  AlertTriangle,
  Play,
  RotateCcw,
  Plus,
  Compass,
  Filter,
  HelpCircle,
  Trash2,
  Image as ImageIcon,
  RefreshCw,
  Sparkles,
  Layers,
  X,
  Target,
  FileUp,
  Edit3,
  Save,
  Shuffle,
  AlignCenter,
  Power,
  Lock,
  Eye,
  EyeOff,
  Download,
  FileSpreadsheet,
  ChevronDown,
  BarChart3,
  Printer,
  Search,
  Trophy,
  Award,
  Users,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  Subject,
  CBTExam,
  CBTQuestion,
  CBTExamResult,
  Student,
  Teacher,
  SchoolProfile,
  ActiveUser,
  isSiswaInklusi,
} from '../../types';
import {
  CLASSES_LIST,
  getStoredCBTExams,
  saveStoredCBTExams,
  getStoredCBTDurations,
  saveStoredCBTDurations,
  getCBTDurationKey,
  getCBTDurationMinutes,
  getStoredCBTActivePackages,
  saveStoredCBTActivePackages,
  getStoredCBTResults,
  saveStoredCBTResults,
  getStoredAssessments,
  saveStoredAssessments,
  getActiveFilters,
  getStoredSubjectsForClass,
  saveStoredSubjectsForClass,
  isTkaResultEntry,
  notifyStorageMutation,
  MAX_QUESTIONS_PER_PACKAGE,
} from '../../utils/storage';
import { getLocalTodayStr } from '../../utils/dateUtils';
import { formatNipLabel, resolveKepalaSekolah, resolveWaliKelas } from '../../utils/teacherSync';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { pushAllDataToCloud, syncAllLocalToCloud } from '../../utils/cloudSync';
import { saveCbtExamToFirestore, saveCbtExamsBatchToFirestore } from '../../utils/cbtFirestore';
import { evaluateQuestionScore } from '../../utils/answerChecker';
import { parseQuestionsFromDocx } from '../../utils/docxImporter';
import { compressQuestionImage } from '../../utils/imageUtils';
import { QuestionContent } from '../QuestionContent';
import { FractionBuilderBar } from '../FormattedMathText';
import { MathRenderer } from '../MathRenderer';
import { MathPreviewPanel } from '../MathPreviewPanel';
import {
  PosisiGambar,
  extractPastedQuestionText,
  toggleCenterTagOnSelection,
  insertFractionAtSelection,
  convertPlainFractionsToTags,
} from '../../utils/questionFormat';
import {
  exportQuestionsToWord,
  exportCbtQuestionsToExcel,
} from '../../utils/questionExport';
import {
  exportIndividualCbtReportToWord,
  exportClassCbtReportToWord,
  exportIndividualCbtReportToPdf,
  exportClassCbtReportToPdf,
  CbtReportExportOptions,
  CbtReportRecordInput,
} from '../../utils/cbtReportExport';
import { doesRecordMatchTerm } from '../../utils/semesterUtils';

interface Props {
  activeUser: ActiveUser;
  activeClass: string;
  students: Student[];
  teachers?: Teacher[];
  profile?: SchoolProfile;
  activeYear?: string;
  activeSemester?: string;
  subjects?: Subject[];
  onUpdateSubjects?: (updated: Subject[], targetClass?: string) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const CBTTab: React.FC<Props> = ({
  activeUser,
  activeClass,
  students,
  teachers = [],
  profile,
  activeYear = '2026/2027',
  activeSemester = 'Ganjil',
  subjects,
  onUpdateSubjects,
  showToast,
}) => {
  const [exams, setExams] = useState<CBTExam[]>(getStoredCBTExams());
  const [cbtDurations, setCbtDurations] = useState<Record<string, number>>(() =>
    getStoredCBTDurations()
  );
  const [cbtActivePackages, setCbtActivePackages] = useState<Record<string, boolean>>(() =>
    getStoredCBTActivePackages()
  );
  const [isExamRunning, setIsExamRunning] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState(3600); // 60 mins
  const [examResult, setExamResult] = useState<{ score: number; total: number } | null>(null);
  const [timeUpModal, setTimeUpModal] = useState<{
    isOpen: boolean;
    status: 'submitting' | 'done';
    examTitle: string;
    answeredCount: number;
    totalQuestions: number;
    score: number | null;
    cloudSaved: boolean;
  } | null>(null);
  const isSubmittingExamRef = useRef<boolean>(false);
  const handleSubmitExamRef = useRef<(isTimeOut?: boolean) => void>(() => {});

  useEffect(() => {
    const syncExams = () => {
      setExams(getStoredCBTExams());
      setCbtDurations(getStoredCBTDurations());
      setCbtActivePackages(getStoredCBTActivePackages());
    };
    const syncDurations = () => setCbtDurations(getStoredCBTDurations());
    window.addEventListener('sekolahku-cbt-exams-updated', syncExams);
    window.addEventListener('sekolahku-cbt-durations-updated', syncDurations);
    window.addEventListener('sekolahku-cloud-sync-updated', syncExams);
    window.addEventListener('storage', syncExams);
    return () => {
      window.removeEventListener('sekolahku-cbt-exams-updated', syncExams);
      window.removeEventListener('sekolahku-cbt-durations-updated', syncDurations);
      window.removeEventListener('sekolahku-cloud-sync-updated', syncExams);
      window.removeEventListener('storage', syncExams);
    };
  }, []);

  // Tab mode for teacher: "bank-soal" (default), "ujian", or "laporan-cbt"
  const [subTab, setSubTab] = useState<'bank-soal' | 'ujian' | 'laporan-cbt'>('bank-soal');
  const [cbtResultsList, setCbtResultsList] = useState<CBTExamResult[]>(() =>
    getStoredCBTResults().filter((r) => !isTkaResultEntry(r))
  );
  const [reportPaketFilter, setReportPaketFilter] = useState<string>('all');
  const [reportMapelFilter, setReportMapelFilter] = useState<string>('all');
  const [reportClassFilter, setReportClassFilter] = useState<string>('all');
  const [reportStatusFilter, setReportStatusFilter] = useState<'all' | 'Tuntas' | 'Remedial'>('all');
  const [reportSearch, setReportSearch] = useState<string>('');
  const [selectedCbtReportRow, setSelectedCbtReportRow] = useState<any | null>(null);

  useEffect(() => {
    const syncResults = () => {
      setCbtResultsList(getStoredCBTResults().filter((r) => !isTkaResultEntry(r)));
    };
    window.addEventListener('sekolahku-cbt-results-updated', syncResults);
    window.addEventListener('sekolahku-cloud-sync-updated', syncResults);
    window.addEventListener('storage', syncResults);
    return () => {
      window.removeEventListener('sekolahku-cbt-results-updated', syncResults);
      window.removeEventListener('sekolahku-cloud-sync-updated', syncResults);
      window.removeEventListener('storage', syncResults);
    };
  }, []);

  // Exam packages (Paket Sumatif, Remedial, Inklusi Kurikulum Merdeka)
  const [paketList, setPaketList] = useState<string[]>([
    'Sumatif 1 (AS 1)',
    'Sumatif 2 (AS 2)',
    'Sumatif 3 (AS 3)',
    'Sumatif 4 (AS 4)',
    'Sumatif 5 (AS 5)',
    'Sumatif 6 (AS 6)',
    'Remedial 1',
    'Remedial 2',
    'Remedial 3',
    'Remedial 4',
    'Remedial 5',
    'Remedial 6',
    'ASTS (Sumatif Tengah Semester)',
    'ASAS (Sumatif Akhir Semester)',
    'Sumatif Inklusi 1',
    'Sumatif Inklusi 2',
    'Sumatif Inklusi 3',
    'Sumatif Inklusi 4',
    'Sumatif Inklusi 5',
    'Sumatif Inklusi 6',
    'Remedial Inklusi 1',
    'Remedial Inklusi 2',
    'Remedial Inklusi 3',
    'Remedial Inklusi 4',
    'Remedial Inklusi 5',
    'Remedial Inklusi 6',
    'ASTS Inklusi',
    'ASAS Inklusi',
  ]);
  const [selectedPaket, setSelectedPaket] = useState<string>('Sumatif 1 (AS 1)');
  const [subPaketList, setSubPaketList] = useState<string[]>(['Paket 1', 'Paket 2', 'Paket 3']);
  const [selectedSubPaket, setSelectedSubPaket] = useState<string>('Paket 1');
  const [examDurationMinutes, setExamDurationMinutes] = useState<number>(() =>
    getCBTDurationMinutes(getStoredCBTDurations(), {
      paket: 'Sumatif 1 (AS 1)',
      mapel: 'Pendidikan Agama Islam',
      fallback: 60,
    })
  );
  const [durPanelPaket, setDurPanelPaket] = useState<string>('Sumatif 1 (AS 1)');
  const [durPanelMapel, setDurPanelMapel] = useState<string>('all');
  const [durPanelMinutes, setDurPanelMinutes] = useState<number>(() =>
    getCBTDurationMinutes(getStoredCBTDurations(), {
      paket: 'Sumatif 1 (AS 1)',
      mapel: 'all',
      fallback: 60,
    })
  );
  const [isAddUHOpen, setIsAddUHOpen] = useState(false);
  const [newUHName, setNewUHName] = useState('');

  // Editing question state & DOCX file ref
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [confirmDeleteQId, setConfirmDeleteQId] = useState<string | null>(null);
  const [downloadMenuPos, setDownloadMenuPos] = useState<'toolbar' | 'list' | null>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadCbtQuestions = (mode: 'word_only' | 'word_key' | 'excel') => {
    setDownloadMenuPos(null);
    const listToExport = allCreatedQuestions.length > 0 && filterTipe !== 'all'
      ? allCreatedQuestions
      : activeExam.soalList;

    if (!listToExport || listToExport.length === 0) {
      showToast(
        `Belum ada butir soal di paket ${selectedPaket} • ${selectedMapel} (${selectedSubPaket}) untuk diunduh.`,
        'error'
      );
      return;
    }

    const fileBase = `Soal_CBT_${selectedPaket}_${selectedMapel}_${selectedSubPaket}_${targetKelas}`;
    if (mode === 'excel') {
      exportCbtQuestionsToExcel(listToExport, {
        title: `Bank Soal CBT - ${selectedPaket}`,
        paket: `${selectedPaket} (${selectedSubPaket})`,
        mapel: selectedMapel,
        kelas: targetKelas,
        fileNameBase: fileBase,
      });
      showToast(`Berhasil mengunduh ${listToExport.length} soal CBT ke Excel (.XLSX)!`, 'success');
      return;
    }

    const withKey = mode === 'word_key';
    exportQuestionsToWord(listToExport, {
      title: `Naskah Soal Asesmen CBT - ${selectedPaket}`,
      subtitle: `${selectedMapel} • ${selectedSubPaket}`,
      paket: `${selectedPaket} (${selectedSubPaket})`,
      mapel: selectedMapel,
      kelas: targetKelas,
      includeAnswerKey: withKey,
      fileNameBase: fileBase,
    });
    showToast(
      `Berhasil mengunduh ${listToExport.length} soal CBT (.DOC${withKey ? ' + Kunci Jawaban' : ''})!`,
      'success'
    );
  };

  // Form Fields matching Image 1
  const [selectedMapel, setSelectedMapel] = useState<string>('Pendidikan Agama Islam');
  const [targetKelas, setTargetKelas] = useState<string>(activeClass || 'Kelas 6A');
  const [selectedTipeSoal, setSelectedTipeSoal] = useState<'pg' | 'pg_kompleks' | 'benar_salah' | 'menjodohkan' | 'isian' | 'uraian'>('pg');
  const [levelKesukaran, setLevelKesukaran] = useState<'Mudah' | 'Sedang' | 'Sukar'>('Sedang');
  const [levelKognitif, setLevelKognitif] = useState<'L1 (C1-C2)' | 'L2 (C3)' | 'L3 (C4-C6)'>('L2 (C3)');

  // Setting Acak Soal & Acak Jawaban (tersimpan otomatis)
  const [acakSoal, setAcakSoal] = useState<boolean>(() => {
    return localStorage.getItem('sekolahku_cbt_acak_soal') === 'true';
  });
  const [acakJawaban, setAcakJawaban] = useState<boolean>(() => {
    return localStorage.getItem('sekolahku_cbt_acak_jawaban') === 'true';
  });

  useEffect(() => {
    const val = String(acakSoal);
    if (localStorage.getItem('sekolahku_cbt_acak_soal') !== val) {
      localStorage.setItem('sekolahku_cbt_acak_soal', val);
      notifyStorageMutation('sekolahku_cbt_acak_soal');
    }
  }, [acakSoal]);

  useEffect(() => {
    const val = String(acakJawaban);
    if (localStorage.getItem('sekolahku_cbt_acak_jawaban') !== val) {
      localStorage.setItem('sekolahku_cbt_acak_jawaban', val);
      notifyStorageMutation('sekolahku_cbt_acak_jawaban');
    }
  }, [acakJawaban]);

  // Exam runtime questions list (shuffled if acakSoal is active)
  const [runningExamQuestions, setRunningExamQuestions] = useState<CBTQuestion[]>([]);

  // Dynamic class-based subjects (synchronized with active class & Kurikulum)
  const classSubjects = useMemo(() => {
    return subjects && subjects.length > 0 ? subjects : getStoredSubjectsForClass(activeClass);
  }, [subjects, activeClass]);

  // Derived CP & TP list connected directly to the active class's subjects
  const cpList = useMemo(() => {
    return classSubjects.map((s, idx) => ({
      id: s.id,
      kode: s.code || `CP ${idx + 1}`,
      judul: `CP ${idx + 1}: [${s.name}] ${s.description ? s.description.substring(0, 75) + '...' : ''}`,
      deskripsi: `[${activeClass}] ${s.description || 'Capaian Pembelajaran mata pelajaran ' + s.name}`,
      mapel: s.name,
      tpList: (s.tujuanPembelajaran && s.tujuanPembelajaran.length > 0)
        ? s.tujuanPembelajaran.map((tp, tpIdx) => ({
            id: `TP ${tpIdx + 1}`,
            judul: tp,
          }))
        : [
            { id: 'TP 1', judul: `Tujuan Pembelajaran 1 untuk ${s.name} ${activeClass}` }
          ],
    }));
  }, [classSubjects, activeClass]);

  // CPs filtered by selectedMapel so only relevant CP/TP appears
  const filteredCps = useMemo(() => {
    const list = cpList.filter(
      (c) =>
        c.mapel.toLowerCase() === selectedMapel.toLowerCase() ||
        c.mapel.toLowerCase().includes(selectedMapel.toLowerCase()) ||
        selectedMapel.toLowerCase().includes(c.mapel.toLowerCase())
    );
    return list.length > 0 ? list : cpList;
  }, [cpList, selectedMapel]);

  const [selectedCpId, setSelectedCpId] = useState<string>('');
  const [selectedTpId, setSelectedTpId] = useState<string>('TP 1');

  useEffect(() => {
    if (filteredCps.length > 0) {
      if (!filteredCps.some((c) => c.id === selectedCpId)) {
        setSelectedCpId(filteredCps[0].id);
        setSelectedTpId(filteredCps[0].tpList[0]?.id || 'TP 1');
      }
    }
  }, [filteredCps, selectedCpId]);

  // Auto-connect CP and TP when mapel changes
  const handleMapelChange = (newMapel: string) => {
    setSelectedMapel(newMapel);
    const matching = cpList.filter(
      (c) =>
        c.mapel.toLowerCase() === newMapel.toLowerCase() ||
        c.mapel.toLowerCase().includes(newMapel.toLowerCase()) ||
        newMapel.toLowerCase().includes(c.mapel.toLowerCase())
    );
    if (matching.length > 0) {
      setSelectedCpId(matching[0].id);
      setSelectedTpId(matching[0].tpList[0]?.id || 'TP 1');
    }
  };

  // Quick modals for adding CP & TP
  const [isAddCpOpen, setIsAddCpOpen] = useState(false);
  const [newCpTitle, setNewCpTitle] = useState('');
  const [newCpDesc, setNewCpDesc] = useState('');

  const [isAddTpOpen, setIsAddTpOpen] = useState(false);
  const [newTpIdInput, setNewTpIdInput] = useState('');
  const [newTpDescInput, setNewTpDescInput] = useState('');

  // Question Inputs
  const [judulTeks, setJudulTeks] = useState('');
  const [pertanyaan, setPertanyaan] = useState('');
  const [gambarUrl, setGambarUrl] = useState<string | null>(null);
  const [gambarUrl2, setGambarUrl2] = useState<string | null>(null);
  const [posisiGambar, setPosisiGambar] = useState<PosisiGambar>('bawah_judul');
  const [bobotPoin, setBobotPoin] = useState(10);
  const [showFractionBuilder, setShowFractionBuilder] = useState(false);
  const pertanyaanTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Options for PG & images for options
  const [opsiA, setOpsiA] = useState('');
  const [opsiB, setOpsiB] = useState('');
  const [opsiC, setOpsiC] = useState('');
  const [opsiD, setOpsiD] = useState('');
  const [opsiGambar, setOpsiGambar] = useState<{ A?: string; B?: string; C?: string; D?: string }>({});
  const [kunciPG, setKunciPG] = useState<'A' | 'B' | 'C' | 'D'>('A');

  // Input for other types
  const [kunciLain, setKunciLain] = useState('');
  const [pgKompleksKeys, setPgKompleksKeys] = useState<string[]>([]);
  const [pembahasan, setPembahasan] = useState('');

  // Filter for created questions list underneath
  const [filterTipe, setFilterTipe] = useState<string>('all');

  // Helper infer paket from legacy CBTExam title if paketName missing
  const inferPaketFromExam = (exam: CBTExam): string => {
    if (exam.paketName) return exam.paketName;
    const j = (exam.judul || '').toLowerCase();
    if (j.includes('asts')) return 'ASTS (Sumatif Tengah Semester)';
    if (j.includes('asas')) return 'ASAS (Sumatif Akhir Semester)';
    const sumatifMatch = exam.judul?.match(/Sumatif\s*\d+\s*\(AS\s*\d+\)/i);
    if (sumatifMatch) return sumatifMatch[0];
    const remMatch = exam.judul?.match(/Remedial\s*\d+/i);
    if (remMatch) return remMatch[0];
    return 'ASAS (Sumatif Akhir Semester)';
  };

  const makeExamBucketId = (paket: string, subPaket: string, mapel: string, kelas: string) => {
    const slug = (v: string) =>
      v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `cbt_${slug(paket)}_${slug(subPaket)}_${slug(mapel)}_${slug(kelas)}`;
  };

  const upsertExamInList = (list: CBTExam[], updated: CBTExam): CBTExam[] => {
    const exists = list.some((e) => e.id === updated.id);
    if (exists) {
      return list.map((e) => (e.id === updated.id ? updated : e));
    }
    return [updated, ...list];
  };

  const activeExam: CBTExam = useMemo(() => {
    const found = exams.find((e) => {
      const ePaket = inferPaketFromExam(e);
      const eSub = e.subPaket || 'Paket 1';
      return (
        ePaket === selectedPaket &&
        eSub === selectedSubPaket &&
        e.mapel === selectedMapel &&
        e.kelas === targetKelas
      );
    });
    if (found) return found;
    return {
      id: makeExamBucketId(selectedPaket, selectedSubPaket, selectedMapel, targetKelas),
      judul: `${selectedPaket} - ${selectedMapel} (${selectedSubPaket})`,
      mapel: selectedMapel,
      kelas: targetKelas,
      paketName: selectedPaket,
      subPaket: selectedSubPaket,
      durasiMenit: examDurationMinutes || 60,
      aktif: false,
      soalList: [],
    };
  }, [exams, selectedPaket, selectedSubPaket, selectedMapel, targetKelas, examDurationMinutes]);

  useEffect(() => {
    const found = exams.find((e) => e.id === activeExam.id);
    const resolved = getCBTDurationMinutes(cbtDurations, {
      examId: activeExam.id,
      paket: selectedPaket,
      mapel: selectedMapel,
      fallback: found?.durasiMenit || 60,
    });
    setExamDurationMinutes(resolved);
  }, [activeExam.id, selectedPaket, selectedMapel, cbtDurations, exams]);

  useEffect(() => {
    const matchedSaved = exams.find(
      (ex) =>
        inferPaketFromExam(ex) === durPanelPaket &&
        (durPanelMapel === 'all' || ex.mapel === durPanelMapel)
    );
    setDurPanelMinutes(
      getCBTDurationMinutes(cbtDurations, {
        paket: durPanelPaket,
        mapel: durPanelMapel,
        fallback: matchedSaved?.durasiMenit || 60,
      })
    );
  }, [cbtDurations, durPanelPaket, durPanelMapel, exams]);

  // Daftar semua bucket ujian yang sudah terisi minimal 1 soal
  const savedExamBuckets = useMemo(() => {
    return exams.filter((e) => Array.isArray(e.soalList) && e.soalList.length > 0);
  }, [exams]);

  const SAMPLE_CBT_DEFAULTS_META = [
    {
      id: 'cbt_ipas_as1',
      paket: 'Sumatif 1 (AS 1)',
      mapel: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
      defaultDurasi: 60,
      label: 'Sumatif 1 (AS 1) • IPAS (Contoh Bawaan)',
    },
    {
      id: 'cbt_mtk_as2',
      paket: 'Sumatif 2 (AS 2)',
      mapel: 'Matematika',
      defaultDurasi: 60,
      label: 'Sumatif 2 (AS 2) • Matematika (Contoh Bawaan)',
    },
    {
      id: 'cbt_asts_indo',
      paket: 'ASTS (Sumatif Tengah Semester)',
      mapel: 'Bahasa Indonesia',
      defaultDurasi: 90,
      label: 'ASTS • Bahasa Indonesia (Contoh Bawaan)',
    },
    {
      id: 'cbt_asas_pancasila',
      paket: 'ASAS (Sumatif Akhir Semester)',
      mapel: 'Pendidikan Pancasila',
      defaultDurasi: 90,
      label: 'ASAS • Pendidikan Pancasila (Contoh Bawaan)',
    },
  ];

  const syncCbtActivationToCloud = (nextActiveMap: Record<string, boolean>) => {
    pushAllDataToCloud(
      {
        cbtActivePackages: nextActiveMap,
      },
      activeUser?.name || 'admin'
    );
  };

  const handleSaveCbtDuration = (
    paket: string,
    mapel: string | null,
    minutes: number,
    silent: boolean = false,
    explicitExamId?: string
  ) => {
    const safeMins = Math.max(1, Math.min(300, Math.round(Number(minutes) || 60)));
    const nextDurations: Record<string, number> = { ...cbtDurations };

    if (explicitExamId) {
      nextDurations[explicitExamId] = safeMins;
    } else {
      nextDurations[getCBTDurationKey(paket, mapel)] = safeMins;
      SAMPLE_CBT_DEFAULTS_META.forEach((smp) => {
        if (smp.paket === paket && (!mapel || mapel === 'all' || smp.mapel === mapel)) {
          nextDurations[smp.id] = safeMins;
        }
      });
    }

    const updatedMatchingExams: CBTExam[] = [];
    const newExams = exams.map((ex) => {
      const matchesById = explicitExamId && ex.id === explicitExamId;
      const matchesByPaket =
        !explicitExamId &&
        inferPaketFromExam(ex) === paket &&
        (!mapel || mapel === 'all' || ex.mapel === mapel);
      if (matchesById || matchesByPaket) {
        nextDurations[ex.id] = safeMins;
        const updated = { ...ex, durasiMenit: safeMins };
        updatedMatchingExams.push(updated);
        return updated;
      }
      return ex;
    });

    if (updatedMatchingExams.length > 0) {
      setExams(newExams);
      saveStoredCBTExams(newExams);
      saveCbtExamsBatchToFirestore(updatedMatchingExams).catch(() => {});
    }

    setCbtDurations(nextDurations);
    saveStoredCBTDurations(nextDurations);
    pushAllDataToCloud(
      {
        cbtDurations: nextDurations,
      },
      activeUser?.name || 'admin'
    );

    if (!silent) {
      showToast(
        `Waktu pengerjaan CBT ${paket}${mapel && mapel !== 'all' ? ` (${mapel})` : ' (Semua Mapel)'} diatur menjadi ${safeMins} menit!`,
        'success'
      );
    }
  };

  const handleToggleExamActive = (targetExam: CBTExam, forceNext?: boolean) => {
    const existingRecord = exams.find((e) => e.id === targetExam.id);
    const nextState = typeof forceNext === 'boolean' ? forceNext : !Boolean(existingRecord?.aktif);

    if (nextState && (!targetExam.soalList || targetExam.soalList.length === 0)) {
      showToast(
        'Tambahkan minimal 1 butir soal terlebih dahulu sebelum mengaktifkan paket soal CBT ini.',
        'error'
      );
      return;
    }

    const updatedExam: CBTExam = {
      ...targetExam,
      paketName: targetExam.paketName || inferPaketFromExam(targetExam),
      subPaket: targetExam.subPaket || 'Paket 1',
      aktif: nextState,
    };
    const newExams = upsertExamInList(exams, updatedExam);
    const nextMap = { ...cbtActivePackages, [updatedExam.id]: nextState };
    setExams(newExams);
    setCbtActivePackages(nextMap);
    saveStoredCBTExams(newExams);
    saveStoredCBTActivePackages(nextMap);
    saveCbtExamToFirestore(updatedExam).catch(() => {});
    syncCbtActivationToCloud(nextMap);

    showToast(
      nextState
        ? `Paket "${targetExam.paketName || targetExam.judul} • ${targetExam.mapel}" DIAKTIFKAN dan kini muncul di dashboard siswa!`
        : `Paket "${targetExam.paketName || targetExam.judul} • ${targetExam.mapel}" DINONAKTIFKAN (belum muncul di siswa).`,
      'success'
    );
  };

  const handleSetAllSavedExamsActive = (nextState: boolean) => {
    if (savedExamBuckets.length === 0) {
      showToast('Belum ada paket soal CBT tersimpan untuk diatur.', 'error');
      return;
    }
    const nextMap = { ...cbtActivePackages };
    const newExams = exams.map((ex) => {
      if (Array.isArray(ex.soalList) && ex.soalList.length > 0) {
        nextMap[ex.id] = nextState;
        return {
          ...ex,
          paketName: ex.paketName || inferPaketFromExam(ex),
          subPaket: ex.subPaket || 'Paket 1',
          aktif: nextState,
        };
      }
      return ex;
    });
    setExams(newExams);
    setCbtActivePackages(nextMap);
    saveStoredCBTExams(newExams);
    saveStoredCBTActivePackages(nextMap);
    saveCbtExamsBatchToFirestore(newExams.filter((ex) => Array.isArray(ex.soalList) && ex.soalList.length > 0)).catch(
      () => {}
    );
    syncCbtActivationToCloud(nextMap);
    showToast(
      nextState
        ? `Semua ${savedExamBuckets.length} paket soal CBT tersimpan DIAKTIFKAN untuk siswa.`
        : `Semua ${savedExamBuckets.length} paket soal CBT tersimpan DINONAKTIFKAN.`,
      'success'
    );
  };

  const handleToggleSampleCbtActive = (sampleId: string, label: string) => {
    const nextVal = !Boolean(cbtActivePackages[sampleId]);
    const nextMap = { ...cbtActivePackages, [sampleId]: nextVal };
    setCbtActivePackages(nextMap);
    saveStoredCBTActivePackages(nextMap);
    syncCbtActivationToCloud(nextMap);
    showToast(
      nextVal
        ? `${label} DIAKTIFKAN untuk siswa.`
        : `${label} DINONAKTIFKAN dari halaman siswa.`,
      'success'
    );
  };

  // Find currently selected CP & TP
  const currentCp = cpList.find((c) => c.id === selectedCpId) || cpList[0];
  const currentTp = currentCp?.tpList.find((t) => t.id === selectedTpId) || currentCp?.tpList[0];

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

  useEffect(() => {
    if (isExamRunning && timeLeft <= 0 && !isSubmittingExamRef.current) {
      handleSubmitExamRef.current(true);
    }
  }, [isExamRunning, timeLeft]);

  // Sisipkan pecahan susun ke posisi kursor di textarea soal CBT
  const handleInsertCbtFraction = (numerator: string, denominator: string, whole?: string) => {
    const el = pertanyaanTextareaRef.current;
    const start = el?.selectionStart ?? pertanyaan.length;
    const end = el?.selectionEnd ?? pertanyaan.length;
    const { nextValue, nextCursor } = insertFractionAtSelection(pertanyaan, start, end, numerator, denominator, whole);
    setPertanyaan(nextValue);
    setTimeout(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    }, 0);
  };

  const handleConvertAllCbtFractions = () => {
    const next = convertPlainFractionsToTags(pertanyaan);
    setPertanyaan(next);
    showToast('Semua pecahan angka di soal diformat menjadi pecahan susun!', 'success');
  };

  const handleInsertCbtFractionToOption = (
    optKey: 'A' | 'B' | 'C' | 'D',
    numerator: string,
    denominator: string,
    whole?: string
  ) => {
    const payload = whole ? `${whole} ${numerator}/${denominator}` : `${numerator}/${denominator}`;
    const tag = `[pecahan]${payload}[/pecahan]`;
    const appendVal = (prev: string) => (prev ? `${prev} ${tag}` : tag);
    if (optKey === 'A') setOpsiA(appendVal);
    else if (optKey === 'B') setOpsiB(appendVal);
    else if (optKey === 'C') setOpsiC(appendVal);
    else setOpsiD(appendVal);
    showToast(`Pecahan susun disisipkan ke Opsi ${optKey}!`, 'success');
  };

  const handleInsertCbtSymbol = (symbol: string) => {
    const el = pertanyaanTextareaRef.current;
    const start = el?.selectionStart ?? pertanyaan.length;
    const end = el?.selectionEnd ?? pertanyaan.length;
    const nextValue = pertanyaan.slice(0, start) + symbol + pertanyaan.slice(end);
    const nextCursor = start + (symbol === '\\sqrt{}' ? symbol.length - 1 : symbol.length);
    setPertanyaan(nextValue);
    setTimeout(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    }, 0);
  };

  const handleInsertCbtSymbolToOption = (optKey: 'A' | 'B' | 'C' | 'D', symbol: string) => {
    const appendSym = (prev: string) => `${prev}${symbol}`;
    if (optKey === 'A') setOpsiA(appendSym);
    else if (optKey === 'B') setOpsiB(appendSym);
    else if (optKey === 'C') setOpsiC(appendSym);
    else setOpsiD(appendSym);
    showToast(`Simbol "${symbol.trim()}" disisipkan ke Opsi ${optKey}!`, 'success');
  };

  // Handle image upload 1 (compressed for 50-question package safety)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressQuestionImage(file, { maxWidth: 960, maxHeight: 720, quality: 0.78 });
      setGambarUrl(compressed);
      showToast('Gambar 1 soal berhasil diunggah & dioptimalkan!', 'success');
    } catch {
      showToast('Gagal memproses gambar 1 soal.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Handle image upload 2 (side-by-side)
  const handleImageUpload2 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressQuestionImage(file, { maxWidth: 960, maxHeight: 720, quality: 0.78 });
      setGambarUrl2(compressed);
      showToast('Gambar 2 soal berhasil diunggah & dioptimalkan!', 'success');
    } catch {
      showToast('Gagal memproses gambar 2 soal.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Handle option image upload
  const handleOptionImageUpload = async (key: 'A' | 'B' | 'C' | 'D', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressQuestionImage(file, { maxWidth: 640, maxHeight: 480, quality: 0.78 });
      setOpsiGambar((prev) => ({ ...prev, [key]: compressed }));
      showToast(`Gambar untuk Opsi ${key} berhasil diunggah!`, 'success');
    } catch {
      showToast(`Gagal memproses gambar untuk Opsi ${key}.`, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleRemoveOptionImage = (key: 'A' | 'B' | 'C' | 'D') => {
    setOpsiGambar((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  // Save or update question in Bank Soal (up to 50 questions per package)
  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pertanyaan.trim()) {
      showToast('Harap masukkan butir pertanyaan soal!', 'error');
      return;
    }

    if (!editingQuestionId && activeExam.soalList.length >= MAX_QUESTIONS_PER_PACKAGE) {
      showToast(
        `Paket ${selectedPaket} • ${selectedMapel} (${selectedSubPaket}) sudah mencapai batas maksimal ${MAX_QUESTIONS_PER_PACKAGE} soal.`,
        'error'
      );
      return;
    }

    let parsedOpsi: string[] | undefined = undefined;
    let parsedKunci: any = '';

    if (selectedTipeSoal === 'pg') {
      if (!opsiA || !opsiB || !opsiC || !opsiD) {
        showToast('Harap lengkapi semua opsi pilihan A, B, C, dan D!', 'error');
        return;
      }
      parsedOpsi = [opsiA.trim(), opsiB.trim(), opsiC.trim(), opsiD.trim()];
      const keyMap: Record<string, string> = { A: opsiA.trim(), B: opsiB.trim(), C: opsiC.trim(), D: opsiD.trim() };
      parsedKunci = keyMap[kunciPG];
    } else if (selectedTipeSoal === 'pg_kompleks') {
      parsedOpsi = [opsiA.trim(), opsiB.trim(), opsiC.trim(), opsiD.trim()].filter(Boolean);
      parsedKunci = pgKompleksKeys.length > 0 ? pgKompleksKeys : [opsiA.trim()];
    } else {
      if (!kunciLain.trim()) {
        showToast('Harap isi kunci jawaban soal!', 'error');
        return;
      }
      parsedKunci = kunciLain.trim();
    }

    const questionData: CBTQuestion = {
      id: editingQuestionId || `soal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      cpId: currentCp.id,
      tpId: currentTp?.id || 'TP 1',
      tipe: selectedTipeSoal,
      judulTeks: judulTeks.trim() || undefined,
      pertanyaan: pertanyaan.replace(/^\n+|\n+$/g, ''),
      opsi: parsedOpsi,
      kunciJawaban: parsedKunci,
      bobot: Number(bobotPoin) || 10,
      gambarUrl: gambarUrl || undefined,
      gambarUrl2: gambarUrl2 || undefined,
      posisiGambar,
      opsiGambar: Object.keys(opsiGambar).length > 0 ? opsiGambar : undefined,
      pembahasan: pembahasan.trim() || `Level ${levelKesukaran} • ${levelKognitif} • ${selectedPaket} (${selectedSubPaket})`,
      paket: selectedPaket,
      subPaket: selectedSubPaket,
      mapel: selectedMapel,
      kelas: targetKelas,
    };

    const isEditing = Boolean(editingQuestionId);
    let updatedQuestions: CBTQuestion[];
    if (isEditing) {
      updatedQuestions = activeExam.soalList.map((q) =>
        q.id === editingQuestionId ? questionData : q
      );
      setEditingQuestionId(null);
    } else {
      updatedQuestions = [...activeExam.soalList, questionData];
    }

    const updatedExam: CBTExam = {
      ...activeExam,
      judul: `${selectedPaket} - ${selectedMapel} (${selectedSubPaket})`,
      mapel: selectedMapel,
      kelas: targetKelas,
      paketName: selectedPaket,
      subPaket: selectedSubPaket,
      durasiMenit: examDurationMinutes || activeExam.durasiMenit || 60,
      aktif: exams.some((e) => e.id === activeExam.id) ? Boolean(activeExam.aktif) : false,
      soalList: updatedQuestions,
    };

    const newExams = upsertExamInList(exams, updatedExam);
    setExams(newExams);
    saveStoredCBTExams(newExams);
    handleResetForm();

    const cloudOk = await saveCbtExamToFirestore(updatedExam);
    if (!cloudOk) {
      showToast('Soal tersimpan di browser, tetapi gagal sinkron ke cloud Firestore. Coba simpan ulang saat koneksi stabil.', 'error');
      return;
    }

    if (isEditing) {
      showToast(`Soal berhasil diperbarui (${updatedQuestions.length}/${MAX_QUESTIONS_PER_PACKAGE} soal)!`, 'success');
    } else {
      showToast(
        `Soal #${updatedQuestions.length}/${MAX_QUESTIONS_PER_PACKAGE} disimpan ke ${selectedPaket} • ${selectedMapel} (${selectedSubPaket})!`,
        'success'
      );
    }
  };

  const handleResetForm = () => {
    setEditingQuestionId(null);
    setJudulTeks('');
    setPertanyaan('');
    setOpsiA('');
    setOpsiB('');
    setOpsiC('');
    setOpsiD('');
    setOpsiGambar({});
    setKunciLain('');
    setPgKompleksKeys([]);
    setGambarUrl(null);
    setGambarUrl2(null);
    setPosisiGambar('bawah_judul');
    setPembahasan('');
  };

  const handleEditQuestion = (q: CBTQuestion) => {
    setEditingQuestionId(q.id);
    setSelectedTipeSoal(q.tipe);
    setJudulTeks(q.judulTeks || '');
    setPertanyaan(q.pertanyaan);
    setBobotPoin(q.bobot || 10);
    setGambarUrl(q.gambarUrl || null);
    setGambarUrl2(q.gambarUrl2 || null);
    setPosisiGambar(q.posisiGambar || 'bawah_judul');
    setOpsiGambar(q.opsiGambar || {});
    setPembahasan(q.pembahasan || '');

    if (q.tipe === 'pg') {
      const oA = q.opsi?.[0] || '';
      const oB = q.opsi?.[1] || '';
      const oC = q.opsi?.[2] || '';
      const oD = q.opsi?.[3] || '';
      setOpsiA(oA);
      setOpsiB(oB);
      setOpsiC(oC);
      setOpsiD(oD);
      if (q.kunciJawaban === oA || q.kunciJawaban === 'A') setKunciPG('A');
      else if (q.kunciJawaban === oB || q.kunciJawaban === 'B') setKunciPG('B');
      else if (q.kunciJawaban === oC || q.kunciJawaban === 'C') setKunciPG('C');
      else if (q.kunciJawaban === oD || q.kunciJawaban === 'D') setKunciPG('D');
    } else if (q.tipe === 'pg_kompleks') {
      setOpsiA(q.opsi?.[0] || '');
      setOpsiB(q.opsi?.[1] || '');
      setOpsiC(q.opsi?.[2] || '');
      setOpsiD(q.opsi?.[3] || '');
      setPgKompleksKeys(Array.isArray(q.kunciJawaban) ? q.kunciJawaban : [String(q.kunciJawaban)]);
    } else {
      setKunciLain(String(q.kunciJawaban || ''));
    }

    window.scrollTo({ top: 180, behavior: 'smooth' });
    showToast(`Soal #${q.id.slice(-4)} siap diedit. Silakan ubah dan klik Simpan.`, 'success');
  };

  const handleDeleteQuestion = (qId: string) => {
    const updatedExam: CBTExam = {
      ...activeExam,
      soalList: activeExam.soalList.filter((q) => q.id !== qId),
    };
    const newExams = upsertExamInList(exams, updatedExam);
    setExams(newExams);
    saveStoredCBTExams(newExams);
    saveCbtExamToFirestore(updatedExam).catch(() => {});
    if (editingQuestionId === qId) {
      handleResetForm();
    }
    setConfirmDeleteQId(null);
    showToast('Soal berhasil dihapus dari Bank Soal.', 'success');
  };

  const handleImportDocx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const remainingSlots = Math.max(0, MAX_QUESTIONS_PER_PACKAGE - activeExam.soalList.length);
      if (remainingSlots <= 0) {
        showToast(
          `Paket ${selectedPaket} • ${selectedMapel} (${selectedSubPaket}) sudah penuh (${MAX_QUESTIONS_PER_PACKAGE}/${MAX_QUESTIONS_PER_PACKAGE} soal).`,
          'error'
        );
        return;
      }

      const res = await parseQuestionsFromDocx(file);
      if (!res.success || res.questions.length === 0) {
        showToast(res.error || 'Tidak ditemukan butir soal di dalam berkas Word (.docx)', 'error');
        return;
      }

      const importSalt = Math.random().toString(36).slice(2, 6);
      const importTs = Date.now();
      const importedWithMeta = res.questions.slice(0, remainingSlots).map((q, idx) => ({
        ...q,
        id: `soal_docx_${importTs}_${idx + 1}_${importSalt}`,
        cpId: currentCp.id,
        tpId: currentTp?.id || 'TP 1',
        pembahasan: q.pembahasan || `Impor Word (.docx) • ${selectedPaket} (${selectedSubPaket})`,
        paket: selectedPaket,
        subPaket: selectedSubPaket,
        mapel: selectedMapel,
        kelas: targetKelas,
      }));

      const updatedExam: CBTExam = {
        ...activeExam,
        judul: `${selectedPaket} - ${selectedMapel} (${selectedSubPaket})`,
        mapel: selectedMapel,
        kelas: targetKelas,
        paketName: selectedPaket,
        subPaket: selectedSubPaket,
        durasiMenit: examDurationMinutes || activeExam.durasiMenit || 60,
        aktif: exams.some((e) => e.id === activeExam.id) ? Boolean(activeExam.aktif) : false,
        soalList: [...activeExam.soalList, ...importedWithMeta],
      };

      const newExams = upsertExamInList(exams, updatedExam);
      setExams(newExams);
      saveStoredCBTExams(newExams);
      const cloudOk = await saveCbtExamToFirestore(updatedExam);

      const skippedCount = res.questions.length - importedWithMeta.length;
      if (!cloudOk) {
        showToast(
          `Berhasil mengimpor ${importedWithMeta.length} soal secara lokal, tetapi gagal sinkron ke cloud.`,
          'error'
        );
      } else if (skippedCount > 0) {
        showToast(
          `Berhasil mengimpor ${importedWithMeta.length} soal (mencapai batas ${MAX_QUESTIONS_PER_PACKAGE} soal/paket; ${skippedCount} soal berlebih dilewati).`,
          'success'
        );
      } else {
        showToast(
          `Berhasil mengimpor ${importedWithMeta.length} soal (${updatedExam.soalList.length}/${MAX_QUESTIONS_PER_PACKAGE}) ke ${selectedPaket} • ${selectedMapel} (${selectedSubPaket})!`,
          'success'
        );
      }
    } catch (err: any) {
      showToast(`Gagal membaca berkas docx: ${err?.message || 'Format tidak sesuai'}`, 'error');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  // Filter questions for display
  const allCreatedQuestions = activeExam.soalList.filter((q) => {
    if (filterTipe !== 'all' && q.tipe !== filterTipe) return false;
    return true;
  });

  const totalPoints = activeExam.soalList.reduce((acc, q) => acc + (q.bobot || 10), 0);

  // CBT Exam Runner with Acak Soal and Acak Jawaban
  const startExam = () => {
    isSubmittingExamRef.current = false;
    setTimeUpModal(null);
    setIsExamRunning(true);
    setExamResult(null);
    setStudentAnswers({});
    const duration = getCBTDurationMinutes(cbtDurations, {
      examId: activeExam?.id,
      paket: selectedPaket,
      mapel: selectedMapel,
      fallback: examDurationMinutes || activeExam?.durasiMenit || 60,
    });
    setTimeLeft(duration * 60);
    setCurrentQuestionIndex(0);

    let qList = [...activeExam.soalList];
    if (acakSoal) {
      qList = [...qList].sort(() => Math.random() - 0.5);
    }
    if (acakJawaban) {
      qList = qList.map((q) => {
        if (q.opsi && q.opsi.length > 0) {
          return {
            ...q,
            opsi: [...q.opsi].sort(() => Math.random() - 0.5),
          };
        }
        return q;
      });
    }
    setRunningExamQuestions(qList);

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    showToast(
      `Ujian CBT dimulai (${duration} Menit)! ${acakSoal ? '[Acak Soal Aktif] ' : ''}${acakJawaban ? '[Acak Jawaban Aktif]' : ''}`,
      'success'
    );
  };

  const handleAnswerChange = (questionId: string, answer: any) => {
    setStudentAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  const handleSubmitExam = async (isTimeOut: boolean = false) => {
    if (!activeExam || isSubmittingExamRef.current) return;
    isSubmittingExamRef.current = true;

    const evaluatedQuestions =
      runningExamQuestions.length > 0 ? runningExamQuestions : activeExam.soalList;
    const answeredCount = Object.values(studentAnswers).filter(
      (v) => v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0)
    ).length;

    let totalScore = 0;
    let maxScore = 0;

    evaluatedQuestions.forEach((q) => {
      maxScore += q.bobot;
      const ans = studentAnswers[q.id];
      const evalRes = evaluateQuestionScore(q.tipe, ans, q.kunciJawaban, q.bobot);
      totalScore += evalRes.earnedScore;
    });

    const finalGrade = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 100;

    if (isTimeOut) {
      setTimeUpModal({
        isOpen: true,
        status: 'submitting',
        examTitle: activeExam.judul,
        answeredCount,
        totalQuestions: evaluatedQuestions.length,
        score: null,
        cloudSaved: false,
      });
      showToast(
        'Waktu ujian CBT telah berakhir! Jawaban sedang dikirim otomatis ke database sebelum sesi ditutup...',
        'error'
      );
    }

    const results = getStoredCBTResults();
    results.push({
      examId: activeExam.id,
      studentId: activeUser.studentData?.id || 'std_demo',
      studentName: activeUser.name,
      skor: totalScore,
      nilai: finalGrade,
      waktuSelesai: new Date().toLocaleTimeString(),
      jawabanSiswa: studentAnswers,
      category: 'cbt',
      mapel: selectedMapel,
      judul: activeExam.judul,
      paketName: selectedPaket,
      tanggal: getLocalTodayStr(),
      recordedAt: Date.now(),
      tahunPelajaran: activeYear,
      semester: activeSemester,
    });
    saveStoredCBTResults(results);

    // Synchronize to Penilaian, Remedial, Leger, and Analisis Soal
    let assessKeyWritten = '';
    let assessPayloadWritten: Record<string, any> | null = null;
    try {
      const filters = getActiveFilters();
      const targetSubjects = getStoredSubjectsForClass(activeClass);
      const normMapel = selectedMapel.toLowerCase();
      const matchedSubject = targetSubjects.find((s) => {
        const sn = (s.name || '').toLowerCase();
        const sc = (s.code || '').toUpperCase();
        return (
          sn.includes(normMapel) ||
          normMapel.includes(sn) ||
          (normMapel.includes('agama') && (sc.startsWith('PAI') || sn.includes('agama'))) ||
          (normMapel.includes('seni') && (sc.startsWith('SENI') || sn.includes('seni'))) ||
          (normMapel.includes('plbj') && (sc.startsWith('PLBJ') || sn.includes('plbj'))) ||
          (normMapel.includes('koding') || normMapel.includes('kka')
            ? sc.startsWith('KKA') || sn.includes('koding') || sn.includes('kka')
            : false)
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
      const subId = matchedSubject?.id || subjectMap[selectedMapel] || 's_bindonesia';
      const assessKey = `${filters.year}_${filters.semester}_${activeClass}_${subId}`;
      const existingAssessments = getStoredAssessments(assessKey);

      // Identifikasi paket inklusif vs reguler
      const isInclusivePackage = selectedPaket.toLowerCase().includes('inklusi');
      let targetStudentIds: string[] = [];

      if (activeUser.role === 'siswa' && activeUser.studentData?.id) {
        targetStudentIds = [activeUser.studentData.id];
      } else if (isInclusivePackage) {
        // Otomatis masuk ke nilai siswa inklusif di kelas ini
        const inclusiveStudents = students.filter(
          (s) => s.kelas === activeClass && isSiswaInklusi(s.kebutuhanKhusus)
        );
        targetStudentIds = inclusiveStudents.length > 0
          ? inclusiveStudents.map((s) => s.id)
          : [students.find((s) => s.kelas === activeClass)?.id || 'std_01'];
      } else {
        const regularStudents = students.filter(
          (s) => s.kelas === activeClass && !isSiswaInklusi(s.kebutuhanKhusus)
        );
        targetStudentIds = regularStudents.length > 0
          ? [regularStudents[0].id]
          : [students.find((s) => s.kelas === activeClass)?.id || 'std_01'];
      }

      targetStudentIds.forEach((targetId) => {
        if (!existingAssessments[targetId]) {
          existingAssessments[targetId] = {
            sumatif: {},
            remedial: {},
            asts: 0,
            asas: 0,
          };
        }

        const isRemedial = selectedPaket.toLowerCase().includes('remedial');
        const asMatch = selectedPaket.match(/(?:Sumatif|Remedial|AS|UH)\s*(?:Inklusi\s*)?(\d+)/i);

        if (asMatch) {
          const asIdx = parseInt(asMatch[1]);
          if (isRemedial) {
            existingAssessments[targetId].remedial[asIdx] = finalGrade;
          } else {
            existingAssessments[targetId].sumatif[asIdx] = finalGrade;
          }
        } else if (selectedPaket.toUpperCase().includes('ASTS')) {
          existingAssessments[targetId].asts = finalGrade;
        } else if (selectedPaket.toUpperCase().includes('ASAS')) {
          existingAssessments[targetId].asas = finalGrade;
        }
      });

      saveStoredAssessments(assessKey, existingAssessments);
      assessKeyWritten = assessKey;
      assessPayloadWritten = existingAssessments;
    } catch (err) {
      console.warn('Sync to assessment error:', err);
    }

    // Kirim langsung ke database Firestore sebelum sesi ujian ditutup
    let cloudSaved = false;
    try {
      const dbTasks: Promise<any>[] = [syncAllLocalToCloud(activeUser.name || 'siswa')];
      if (assessKeyWritten && assessPayloadWritten) {
        dbTasks.push(
          setDoc(
            doc(db, 'assessments', assessKeyWritten.replace(/\//g, '_')),
            {
              assessKey: assessKeyWritten,
              data: assessPayloadWritten,
              updatedAt: new Date().toISOString(),
              updatedBy: activeUser.name || 'siswa',
              serverTime: serverTimestamp(),
            },
            { merge: true }
          )
        );
      }
      const resSync = await Promise.race([
        Promise.allSettled(dbTasks),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      cloudSaved = Array.isArray(resSync) && resSync.some((r) => r.status === 'fulfilled' && r.value !== false);
    } catch (dbErr) {
      console.warn('Immediate CBT database flush warning:', dbErr);
    }

    setExamResult({ score: finalGrade, total: 100 });
    setIsExamRunning(false);
    isSubmittingExamRef.current = false;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    if (isTimeOut) {
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
        cloudSaved
          ? `Waktu Ujian Telah Habis! Nilai Anda: ${finalGrade}. Jawaban otomatis terkirim ke database.`
          : `Waktu Ujian Telah Habis! Nilai Anda: ${finalGrade}. Jawaban tersimpan & masuk antrean sinkronisasi.`,
        'success'
      );
    } else {
      showToast(`Ujian Selesai! Nilai Anda: ${finalGrade} (Tersinkron ke Penilaian & Leger)`, 'success');
    }
  };
  handleSubmitExamRef.current = handleSubmitExam;

  const currentExamQuestions = runningExamQuestions.length > 0 ? runningExamQuestions : activeExam?.soalList || [];
  const currentQ = currentExamQuestions[currentQuestionIndex];

  return (
    <section className="space-y-6">
      {/* Top Banner Navigation */}
      <div
        className={`bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5 print:shadow-none print:border-0 print:p-0 print:rounded-none ${
          selectedCbtReportRow ? 'no-print' : ''
        }`}
      >
        <div
          className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 ${
            subTab === 'laporan-cbt' ? 'no-print' : ''
          }`}
        >
          <div>
            <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
              Menu 4. Penilaian & Pelaporan • Bank Soal & Ujian CBT
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
              <Laptop className="w-5 h-5 text-emerald-600" /> Bank Soal Kurikulum Merdeka, Ujian &amp; Report CBT
            </h2>
            <p className="text-xs text-slate-500">
              Form Pembuatan Soal Standar (6 Tipe Soal), Simulasi Ujian CBT, serta Report &amp; Rekapitulasi Hasil Ujian CBT.
            </p>
          </div>

          {activeUser.role !== 'siswa' && !isExamRunning && (
            <div className="flex flex-wrap bg-slate-100 p-1 rounded-2xl border border-slate-200 gap-1">
              <button
                type="button"
                onClick={() => setSubTab('bank-soal')}
                className={`px-3.5 py-2 rounded-xl text-xs font-display font-black transition cursor-pointer whitespace-nowrap ${
                  subTab === 'bank-soal' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Form Bank Soal
              </button>
              <button
                type="button"
                onClick={() => setSubTab('ujian')}
                className={`px-3.5 py-2 rounded-xl text-xs font-display font-black transition cursor-pointer whitespace-nowrap ${
                  subTab === 'ujian' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Simulasi / Ujian CBT Siswa
              </button>
              <button
                type="button"
                onClick={() => setSubTab('laporan-cbt')}
                className={`px-3.5 py-2 rounded-xl text-xs font-display font-black transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  subTab === 'laporan-cbt' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-700 hover:text-emerald-800'
                }`}
              >
                <Award className="w-3.5 h-3.5" /> Report &amp; Hasil CBT ({cbtResultsList.length})
              </button>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* SUBTAB 1: BANK SOAL VIEW (EXACT MATCH WITH USER'S IMAGE 1)      */}
        {/* ============================================================== */}
        {subTab === 'bank-soal' && activeUser.role !== 'siswa' && !isExamRunning && (
          <div className="space-y-6">
            {/* Top Toolbar for Bank Soal: DOCX Import & Status */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <input
                type="file"
                ref={docxInputRef}
                accept=".docx"
                onChange={handleImportDocx}
                className="hidden"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Bank Soal Aktif:</span>
                <span className="px-2.5 py-0.5 rounded-lg bg-rose-100 text-rose-800 font-black text-xs font-mono">
                  {selectedPaket}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-indigo-100 text-indigo-800 font-black text-xs">
                  {selectedMapel}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs">
                  {selectedSubPaket}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-lg font-mono font-black text-xs border ${
                    activeExam.soalList.length >= MAX_QUESTIONS_PER_PACKAGE
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : activeExam.soalList.length >= 40
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-sky-100 text-sky-800 border-sky-200'
                  }`}
                >
                  {activeExam.soalList.length} / {MAX_QUESTIONS_PER_PACKAGE} Soal
                </span>
                {editingQuestionId && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[11px] animate-pulse">
                    ✏ Sedang Mengedit Soal
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleExamActive(activeExam)}
                  className={`font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap ${
                    activeExam.aktif && activeExam.soalList.length > 0
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300'
                  }`}
                  title="Aktifkan atau nonaktifkan paket soal ini agar muncul atau tersembunyi di dashboard siswa"
                >
                  {activeExam.aktif && activeExam.soalList.length > 0 ? (
                    <>
                      <Eye className="w-4 h-4" />
                      <span>Paket Aktif di Siswa</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Belum Diaktifkan</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => docxInputRef.current?.click()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  title="Import butir soal dari dokumen Microsoft Word (.docx)"
                >
                  <FileUp className="w-4 h-4" /> Import Soal (.DOCX)
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setDownloadMenuPos((prev) => (prev === 'toolbar' ? null : 'toolbar'))
                    }
                    className="bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    title="Unduh kumpulan soal yang sudah dibuat pada paket ini (Word atau Excel)"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Soal</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {downloadMenuPos === 'toolbar' && (
                    <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50 space-y-1">
                      <button
                        type="button"
                        onClick={() => handleDownloadCbtQuestions('word_only')}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-sky-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                        <div>
                          <span className="block">Naskah Soal (.DOC Word)</span>
                          <span className="text-[10px] font-normal text-slate-500">Siap cetak tanpa kunci jawaban</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadCbtQuestions('word_key')}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <span className="block">Soal + Kunci &amp; Pembahasan (.DOC)</span>
                          <span className="text-[10px] font-normal text-slate-500">Arsip guru &amp; kisi-kisi lengkap</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadCbtQuestions('excel')}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-amber-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" />
                        <div>
                          <span className="block">Bank Soal (.XLSX Excel)</span>
                          <span className="text-[10px] font-normal text-slate-500">Rekap tabel butir soal CBT</span>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              {/* ROW 1: TOP BAR DROPDOWNS (2 CLEAN ROWS OF 4) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Paket / Jenis Ulangan (Sumatif) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-extrabold text-slate-700">Jenis / Asesmen CBT</label>
                    <button
                      type="button"
                      onClick={() => setIsAddUHOpen(true)}
                      className="text-[11px] font-extrabold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                    >
                      + Tambah Sumatif
                    </button>
                  </div>
                  <select
                    value={selectedPaket}
                    onChange={(e) => setSelectedPaket(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border-2 border-rose-500 bg-white text-xs font-extrabold text-rose-800 outline-none shadow-xs"
                  >
                    {paketList.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 1b. Paket Soal (Paket 1, Paket 2, Paket 3) */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Paket Soal</label>
                  <select
                    value={selectedSubPaket}
                    onChange={(e) => setSelectedSubPaket(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border-2 border-indigo-400 bg-white text-xs font-extrabold text-indigo-900 outline-none shadow-xs"
                  >
                    {subPaketList.map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Mata Pelajaran */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Mata Pelajaran</label>
                  <select
                    value={selectedMapel}
                    onChange={(e) => handleMapelChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-extrabold text-slate-800 outline-none"
                  >
                    <option value="Pendidikan Agama Islam">Pendidikan Agama Islam</option>
                    <option value="Pendidikan Pancasila">Pendidikan Pancasila</option>
                    <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                    <option value="Matematika">Matematika</option>
                    <option value="Ilmu Pengetahuan Alam dan Sosial (IPAS)">IPAS</option>
                    <option value="Seni Rupa">Seni Rupa</option>
                    <option value="Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)">PJOK</option>
                    <option value="Bahasa Inggris">Bahasa Inggris</option>
                    <option value="Muatan Lokal (PLBJ)">Muatan Lokal (PLBJ)</option>
                    <option value="Koding dan Kecerdasan Artifisial (KKA)">Koding &amp; Kecerdasan Artifisial (KKA) [Kls 5–6]</option>
                  </select>
                </div>

                {/* 3. Target Kelas */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Target Kelas</label>
                  <select
                    value={targetKelas}
                    onChange={(e) => setTargetKelas(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-extrabold text-slate-800 outline-none"
                  >
                    <option value="Kelas 6B">Kelas 6B</option>
                    <option value="Kelas 6A">Kelas 6A</option>
                    <option value="Kelas 5B">Kelas 5B</option>
                    <option value="Kelas 5A">Kelas 5A</option>
                    <option value="Kelas 4B">Kelas 4B</option>
                    <option value="Kelas 4A">Kelas 4A</option>
                    <option value="Kelas 3B">Kelas 3B</option>
                    <option value="Kelas 3A">Kelas 3A</option>
                    <option value="Kelas 2B">Kelas 2B</option>
                    <option value="Kelas 2A">Kelas 2A</option>
                    <option value="Kelas 1B">Kelas 1B</option>
                    <option value="Kelas 1A">Kelas 1A</option>
                  </select>
                </div>

                {/* 3b. Setting Timer Durasi Ujian */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    ⏱ Timer Ujian (Menit • Auto-Submit)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={examDurationMinutes || ''}
                      onChange={(e) => setExamDurationMinutes(Number(e.target.value))}
                      onBlur={() => {
                        const clamped = Math.max(1, Math.min(300, Math.round(Number(examDurationMinutes) || 60)));
                        setExamDurationMinutes(clamped);
                        handleSaveCbtDuration(
                          selectedPaket,
                          selectedMapel,
                          clamped,
                          false,
                          exams.some((ex) => ex.id === activeExam.id) ? activeExam.id : undefined
                        );
                      }}
                      className="w-20 px-2.5 py-2 rounded-2xl border-2 border-amber-400 bg-amber-50/60 text-xs font-black text-center text-amber-950 outline-none shadow-xs"
                      title="Ketik durasi waktu ujian CBT (1-300 menit). Otomatis auto-submit saat waktu habis."
                    />
                    <select
                      value={[15, 30, 45, 60, 90, 120].includes(examDurationMinutes) ? examDurationMinutes : ''}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const mins = Number(e.target.value);
                        setExamDurationMinutes(mins);
                        handleSaveCbtDuration(
                          selectedPaket,
                          selectedMapel,
                          mins,
                          false,
                          exams.some((ex) => ex.id === activeExam.id) ? activeExam.id : undefined
                        );
                      }}
                      className="flex-1 px-2.5 py-2 rounded-2xl border-2 border-amber-400 bg-amber-50/60 text-xs font-black text-amber-950 outline-none shadow-xs cursor-pointer"
                      title="Pilih durasi cepat ujian CBT"
                    >
                      <option value="">Kustom ({examDurationMinutes || 60}m)</option>
                      <option value={15}>15 Menit</option>
                      <option value={30}>30 Menit</option>
                      <option value={45}>45 Menit</option>
                      <option value={60}>60 Menit</option>
                      <option value={90}>90 Menit</option>
                      <option value={120}>120 Menit</option>
                    </select>
                  </div>
                </div>

                {/* 4. Pilih TP yang Diukur (Blue border matching Image 1) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-extrabold text-slate-700">Pilih TP yang Diukur</label>
                    <button
                      type="button"
                      onClick={() => setIsAddTpOpen(true)}
                      className="text-[10px] font-bold text-sky-600 hover:underline"
                    >
                      + TP
                    </button>
                  </div>
                  <select
                    value={selectedTpId}
                    onChange={(e) => setSelectedTpId(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border-2 border-sky-500 bg-white text-xs font-extrabold text-sky-900 outline-none shadow-xs"
                  >
                    {currentCp.tpList.map((tp) => (
                      <option key={tp.id} value={tp.id}>
                        {tp.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Tipe Soal (6 Tipe) */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Tipe Soal (6 Tipe)</label>
                  <select
                    value={selectedTipeSoal}
                    onChange={(e) => setSelectedTipeSoal(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-extrabold text-slate-800 outline-none"
                  >
                    <option value="pg">Pilihan Ganda (PG)</option>
                    <option value="pg_kompleks">Pilihan Ganda Kompleks</option>
                    <option value="benar_salah">Benar / Salah</option>
                    <option value="menjodohkan">Menjodohkan</option>
                    <option value="isian">Isian Singkat</option>
                    <option value="uraian">Uraian</option>
                  </select>
                </div>

                {/* 6. Level Soal & Kognitif (2 Dropdowns side by side) */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Level Soal & Kognitif</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={levelKesukaran}
                      onChange={(e) => setLevelKesukaran(e.target.value as any)}
                      className="w-full px-2 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none"
                    >
                      <option value="Mudah">Mudah</option>
                      <option value="Sedang">Sedang</option>
                      <option value="Sukar">Sukar</option>
                    </select>
                    <select
                      value={levelKognitif}
                      onChange={(e) => setLevelKognitif(e.target.value as any)}
                      className="w-full px-2 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none"
                    >
                      <option value="L1 (C1-C2)">L1 (C1-C2)</option>
                      <option value="L2 (C3)">L2 (C3)</option>
                      <option value="L3 (C4-C6)">L3 (C4-C6)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* CARD: KOMPETENSI (CP) & SUB KOMPETENSI (TP) (MATCHING IMAGE 1) */}
              <div className="p-4 rounded-3xl border border-rose-200 bg-rose-50/20 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Kompetensi (Pilih Dropdown CP) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-black text-rose-700 flex items-center gap-1.5">
                      🚩 Kompetensi (Pilih Dropdown CP)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddCpOpen(true)}
                        className="text-[11px] font-extrabold text-rose-700 hover:underline"
                      >
                        + Tambah CP
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast('Data CP tersinkron otomatis dari Kurikulum!', 'success')}
                        className="text-[11px] font-extrabold text-sky-700 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Sinkron dari Menu CP
                      </button>
                    </div>
                  </div>
                  <select
                    value={selectedCpId}
                    onChange={(e) => {
                      setSelectedCpId(e.target.value);
                      const cp = filteredCps.find((c: any) => c.id === e.target.value) || cpList.find((c: any) => c.id === e.target.value);
                      if (cp && cp.tpList[0]) setSelectedTpId(cp.tpList[0].id);
                    }}
                    className="w-full px-3 py-2 rounded-2xl border-2 border-rose-400 bg-white text-xs font-bold text-slate-800 outline-none truncate"
                  >
                    {filteredCps.map((cp: any) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.judul}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={3}
                    readOnly
                    value={currentCp.deskripsi}
                    className="w-full p-2.5 rounded-2xl border border-slate-200 bg-white/80 text-xs text-slate-700 leading-relaxed outline-none resize-none font-medium"
                  />
                </div>

                {/* Right: Sub Kompetensi (Otomatis dari TP) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-black text-sky-800 flex items-center gap-1.5">
                      🎯 Sub Kompetensi (Otomatis dari Tujuan Pembelajaran / TP)
                    </span>
                    <span className="text-[10px] font-black uppercase bg-sky-100 text-sky-800 px-2 py-0.5 rounded-md border border-sky-200">
                      {selectedTpId}
                    </span>
                  </div>
                  <div className="h-9 flex items-center px-3 rounded-2xl bg-sky-50 border border-sky-200 text-xs font-extrabold text-sky-950">
                    Tujuan Pembelajaran ({selectedTpId})
                  </div>
                  <textarea
                    rows={3}
                    readOnly
                    value={currentTp?.judul || 'Memahami konsep pembelajaran'}
                    className="w-full p-2.5 rounded-2xl border border-slate-200 bg-white/80 text-xs text-slate-700 leading-relaxed outline-none resize-none font-medium"
                  />
                </div>
              </div>

              {/* ROW 3: PERTANYAAN, UPLOAD 2 GAMBAR BERSEBELAHAN & MENU POINT NILAI (MATCHING IMAGE 1) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left: Pertanyaan / Butir Soal */}
                <div className="lg:col-span-6 space-y-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-display font-extrabold text-slate-700 flex items-center gap-1.5">
                      <AlignCenter className="w-3.5 h-3.5 text-rose-600" />
                      Judul Teks / Bacaan (Opsional • Otomatis Ditengah & Terpisah dari Paragraf)
                    </label>
                    <input
                      type="text"
                      value={judulTeks}
                      onChange={(e) => setJudulTeks(e.target.value)}
                      placeholder="Contoh: Kisah Semut dan Belalang (tampil di tengah, tidak menyatu dengan paragraf)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 text-center font-bold outline-none focus:border-rose-500"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <label className="font-display font-black text-slate-800">
                      Pertanyaan / Butir Soal (Mendukung Pecahan Susun &amp; Jarak Paragraf)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const el = pertanyaanTextareaRef.current;
                          const start = el?.selectionStart ?? pertanyaan.length;
                          const end = el?.selectionEnd ?? pertanyaan.length;
                          const { nextValue, nextCursor } = toggleCenterTagOnSelection(pertanyaan, start, end);
                          setPertanyaan(nextValue);
                          setTimeout(() => {
                            if (el) {
                              el.focus();
                              el.setSelectionRange(nextCursor, nextCursor);
                            }
                          }, 0);
                        }}
                        className="text-[11px] font-extrabold text-rose-700 hover:underline flex items-center gap-1 cursor-pointer bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200"
                        title="Jadikan baris terpilih sebagai Judul (rata tengah dan terpisah dari paragraf)"
                      >
                        <AlignCenter className="w-3 h-3 text-rose-600" /> Tengah / Judul
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCbtSymbol('°')}
                        className="text-[11px] font-extrabold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg cursor-pointer transition flex items-center gap-1"
                        title="Sisipkan simbol derajat (°) ke posisi kursor di soal"
                      >
                        <span className="font-black text-xs leading-none">°</span> Derajat
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFractionBuilder((prev) => !prev)}
                        className={`text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer px-2.5 py-0.5 rounded-lg border transition ${
                          showFractionBuilder
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
                  {showFractionBuilder && (
                    <FractionBuilderBar
                      onInsertToQuestion={handleInsertCbtFraction}
                      onConvertAllInQuestion={handleConvertAllCbtFractions}
                      onInsertToOption={handleInsertCbtFractionToOption}
                      onInsertSymbolToQuestion={handleInsertCbtSymbol}
                      onInsertSymbolToOption={handleInsertCbtSymbolToOption}
                      showOptionsTargets={selectedTipeSoal === 'pg' || selectedTipeSoal === 'pg_kompleks'}
                      onClose={() => setShowFractionBuilder(false)}
                    />
                  )}
                  <textarea
                    ref={pertanyaanTextareaRef}
                    rows={5}
                    value={pertanyaan}
                    onChange={(e) => setPertanyaan(e.target.value)}
                    onPaste={(e) => {
                      const extracted = extractPastedQuestionText(e);
                      if (extracted !== null) {
                        e.preventDefault();
                        const el = e.currentTarget;
                        const start = el.selectionStart ?? pertanyaan.length;
                        const end = el.selectionEnd ?? pertanyaan.length;
                        const nextVal = pertanyaan.slice(0, start) + extracted + pertanyaan.slice(end);
                        setPertanyaan(nextVal);
                        showToast('Teks rata tengah dari salinan otomatis terdeteksi sebagai Judul terpisah!', 'success');
                      }
                    }}
                    required
                    placeholder="Tuliskan soal atau bacaan. Tekan Enter beberapa kali untuk jarak antar paragraf, ketik 2/5 atau gunakan Format Pecahan / ° Derajat agar tampil rapi..."
                    className="w-full p-3 rounded-2xl border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:border-rose-500 font-medium leading-relaxed"
                  />
                </div>

                {/* Middle: Upload Gambar Soal (Hingga 2 Gambar Bersebelahan) + Posisi Gambar */}
                <div className="lg:col-span-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-display font-black text-slate-800">
                      Upload Gambar Soal
                    </label>
                    {(gambarUrl || gambarUrl2) && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {gambarUrl && gambarUrl2 ? '2 Gambar Bersebelahan' : '1 Gambar'}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 rounded-2xl border border-slate-200 bg-white grid grid-cols-2 gap-2 min-h-[100px]">
                    {/* Slot 1: Gambar 1 */}
                    <div className="flex flex-col items-center justify-center p-1 rounded-xl bg-slate-50 border border-dashed border-slate-300 relative text-center">
                      {gambarUrl ? (
                        <div className="relative group w-full h-full flex flex-col items-center justify-center">
                          <img src={gambarUrl} alt="Gambar 1" className="h-14 w-auto max-w-full rounded object-contain" />
                          <button
                            type="button"
                            onClick={() => setGambarUrl(null)}
                            className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 text-[9px] shadow cursor-pointer"
                            title="Hapus Gambar 1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <span className="text-[9px] font-bold text-slate-600 mt-0.5">Gambar 1</span>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center cursor-pointer p-1">
                          <ImageIcon className="w-4 h-4 text-slate-400 mb-0.5" />
                          <span className="text-[10px] font-bold text-rose-600 hover:underline">+ Gambar 1</span>
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                      )}
                    </div>

                    {/* Slot 2: Gambar 2 (Bersebelahan) */}
                    <div className="flex flex-col items-center justify-center p-1 rounded-xl bg-slate-50 border border-dashed border-slate-300 relative text-center">
                      {gambarUrl2 ? (
                        <div className="relative group w-full h-full flex flex-col items-center justify-center">
                          <img src={gambarUrl2} alt="Gambar 2" className="h-14 w-auto max-w-full rounded object-contain" />
                          <button
                            type="button"
                            onClick={() => setGambarUrl2(null)}
                            className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 text-[9px] shadow cursor-pointer"
                            title="Hapus Gambar 2"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <span className="text-[9px] font-bold text-slate-600 mt-0.5">Gambar 2</span>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center cursor-pointer p-1">
                          <ImageIcon className="w-4 h-4 text-slate-400 mb-0.5" />
                          <span className="text-[10px] font-bold text-rose-600 hover:underline">+ Gambar 2</span>
                          <input type="file" accept="image/*" onChange={handleImageUpload2} className="hidden" />
                        </label>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-display font-bold text-slate-600 block">
                      Posisi Tampil Gambar:
                    </label>
                    <select
                      value={posisiGambar}
                      onChange={(e) => setPosisiGambar(e.target.value as PosisiGambar)}
                      className="w-full px-3 py-2 rounded-xl text-xs font-extrabold border border-slate-300 bg-white text-slate-800 outline-none focus:border-rose-500 cursor-pointer"
                    >
                      <option value="bawah_judul">Di Bawah Judul</option>
                      <option value="bawah_pertanyaan">Di Bawah Pertanyaan</option>
                      <option value="kanan_teks">Di Kanan Teks</option>
                    </select>
                  </div>
                </div>

                {/* Right: Menu Point Nilai & Waktu Pengerjaan CBT */}
                <div className="lg:col-span-3 space-y-2.5">
                  <div className="p-3 rounded-3xl border-2 border-emerald-400 bg-emerald-50/40 text-center space-y-1 flex flex-col justify-center">
                    <span className="text-xs font-display font-black text-emerald-900 flex items-center justify-center gap-1">
                      ⭐ Menu Point Nilai (Kanan Soal)
                    </span>
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={bobotPoin}
                        onChange={(e) => setBobotPoin(Number(e.target.value))}
                        className="w-20 text-center text-xl font-display font-black text-emerald-950 bg-white rounded-xl border-2 border-emerald-500 py-1"
                      />
                      <span className="text-xs font-display font-extrabold text-emerald-900">Poin</span>
                    </div>
                    <p className="text-[10px] text-emerald-700">Bobot skor soal ini saat dianalisis</p>
                  </div>

                  {/* Waktu Pengerjaan Soal CBT (Auto-Submit) */}
                  <div className="p-3 rounded-3xl border-2 border-amber-400 bg-amber-50/50 text-center space-y-1.5">
                    <div className="text-xs font-display font-black text-amber-900 flex items-center justify-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-600" /> Waktu Pengerjaan CBT
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={examDurationMinutes || ''}
                        onChange={(e) => setExamDurationMinutes(Number(e.target.value))}
                        onBlur={() => {
                          const clamped = Math.max(1, Math.min(300, Math.round(Number(examDurationMinutes) || 60)));
                          setExamDurationMinutes(clamped);
                          handleSaveCbtDuration(
                            selectedPaket,
                            selectedMapel,
                            clamped,
                            false,
                            exams.some((ex) => ex.id === activeExam.id) ? activeExam.id : undefined
                          );
                        }}
                        className="w-20 text-center text-lg font-display font-black text-slate-900 border-2 border-amber-500 rounded-xl py-1 bg-white outline-none"
                        title="Setting waktu pengerjaan ujian CBT (dalam menit). Otomatis auto-submit saat waktu habis."
                      />
                      <span className="text-xs font-bold text-slate-700">Mnt</span>
                    </div>
                    <div className="flex flex-wrap justify-center gap-1">
                      {[30, 45, 60, 90].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setExamDurationMinutes(m);
                            handleSaveCbtDuration(
                              selectedPaket,
                              selectedMapel,
                              m,
                              false,
                              exams.some((ex) => ex.id === activeExam.id) ? activeExam.id : undefined
                            );
                          }}
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-black border cursor-pointer transition ${
                            examDurationMinutes === m
                              ? 'bg-amber-600 text-white border-amber-700'
                              : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                          }`}
                        >
                          {m}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ROW 4: PILIHAN JAWABAN DENGAN DUKUNGAN GAMBAR JAWABAN */}
              <div className="p-5 rounded-3xl border border-slate-200 bg-white space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-display font-black text-sm text-slate-800">
                      Pilihan Jawaban {selectedTipeSoal === 'pg' && '(Pilih 1 Kunci Benar):'}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Dapat menambahkan teks jawaban dan/atau gambar pada tiap pilihan jawaban (A, B, C, D).
                    </p>
                  </div>
                  {selectedTipeSoal === 'isian' && (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      Toleran &quot;/&quot; &amp; Case-Insensitive
                    </span>
                  )}
                </div>

                {/* TIPE 1: PILIHAN GANDA DENGAN DUKUNGAN GAMBAR PADA OPSI A, B, C, D */}
                {selectedTipeSoal === 'pg' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(['A', 'B', 'C', 'D'] as const).map((key) => {
                      const val = key === 'A' ? opsiA : key === 'B' ? opsiB : key === 'C' ? opsiC : opsiD;
                      const setVal = key === 'A' ? setOpsiA : key === 'B' ? setOpsiB : key === 'C' ? setOpsiC : setOpsiD;
                      const optImg = opsiGambar[key];

                      return (
                        <div key={key} className="p-2.5 rounded-2xl border border-slate-200 bg-slate-50/40 space-y-2">
                          <div className="flex items-center gap-2.5">
                            <input
                              type="radio"
                              id={`kunci_${key}`}
                              name="kunciPG"
                              checked={kunciPG === key}
                              onChange={() => setKunciPG(key)}
                              className="w-4 h-4 text-rose-600 cursor-pointer"
                            />
                            <label htmlFor={`kunci_${key}`} className="font-display font-black text-xs text-slate-700 w-4">
                              {key}.
                            </label>
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => setVal(e.target.value)}
                              placeholder={`Teks Opsi ${key}`}
                              className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:border-rose-400"
                            />
                            {/* Upload Gambar Jawaban */}
                            <label
                              className={`p-1.5 rounded-xl border flex items-center justify-center cursor-pointer transition shrink-0 ${
                                optImg ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white hover:bg-slate-100 text-slate-500 border-slate-300'
                              }`}
                              title={`Upload Gambar untuk Opsi ${key}`}
                            >
                              <ImageIcon className="w-4 h-4" />
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleOptionImageUpload(key, e)}
                                className="hidden"
                              />
                            </label>
                          </div>

                          {/* Preview Option Image */}
                          {optImg && (
                            <div className="ml-8 flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 w-fit">
                              <img src={optImg} alt={`Gbr ${key}`} className="h-12 w-auto object-contain rounded" />
                              <button
                                type="button"
                                onClick={() => handleRemoveOptionImage(key)}
                                className="text-slate-400 hover:text-red-600 p-1 text-xs cursor-pointer"
                                title="Hapus gambar opsi ini"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* TIPE 2: ISIAN SINGKAT (DENGAN TANDA /) */}
                {selectedTipeSoal === 'isian' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-slate-700">
                      Kunci Jawaban Isian Singkat:
                    </label>
                    <input
                      type="text"
                      value={kunciLain}
                      onChange={(e) => setKunciLain(e.target.value)}
                      placeholder="Contoh: Orang tua / ayah / ibu"
                      className="w-full px-4 py-2.5 rounded-2xl border-2 border-emerald-500 bg-white font-mono font-bold text-xs text-emerald-950 outline-none"
                    />
                    <p className="text-[11px] text-slate-500">
                      💡 <strong>Aturan Koreksi Otomatis:</strong> Jika ada tanda <code>&quot;/&quot;</code>, maka jika siswa menjawab salah satu alternatif (misal: <em>ayah</em>, <em>ibu</em>, atau <em>orang tua</em>/<em>orangtua</em>), sistem otomatis menganggapnya <strong>BENAR</strong>, tidak sensitif huruf kapital maupun spasi.
                    </p>
                  </div>
                )}

                {/* TIPE 3: PILIHAN GANDA KOMPLEKS */}
                {selectedTipeSoal === 'pg_kompleks' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600">Isi opsi pilihan dan centang semua kunci jawaban yang benar:</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { key: 'A', val: opsiA, set: setOpsiA },
                        { key: 'B', val: opsiB, set: setOpsiB },
                        { key: 'C', val: opsiC, set: setOpsiC },
                        { key: 'D', val: opsiD, set: setOpsiD },
                      ].map((item) => {
                        const isChecked = pgKompleksKeys.includes(item.val);
                        return (
                          <div key={item.key} className="flex items-center gap-3 p-2 rounded-2xl border bg-slate-50/40">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setPgKompleksKeys(pgKompleksKeys.filter((k) => k !== item.val));
                                } else if (item.val) {
                                  setPgKompleksKeys([...pgKompleksKeys, item.val]);
                                }
                              }}
                              className="w-4 h-4 text-emerald-600 cursor-pointer"
                            />
                            <span className="font-black text-xs w-4">{item.key}.</span>
                            <input
                              type="text"
                              value={item.val}
                              onChange={(e) => item.set(e.target.value)}
                              placeholder={`Teks Opsi ${item.key}`}
                              className="flex-1 px-3 py-1.5 rounded-xl border text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TIPE 4: BENAR / SALAH */}
                {selectedTipeSoal === 'benar_salah' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-slate-700">Tentukan Kunci Kebenaran Pernyataan:</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-2xl border">
                        <input
                          type="radio"
                          name="bsKey"
                          checked={kunciLain === 'Benar'}
                          onChange={() => setKunciLain('Benar')}
                        />
                        <span className="text-xs font-bold text-emerald-800">Benar</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-2xl border">
                        <input
                          type="radio"
                          name="bsKey"
                          checked={kunciLain === 'Salah'}
                          onChange={() => setKunciLain('Salah')}
                        />
                        <span className="text-xs font-bold text-rose-800">Salah</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* TIPE 5 & 6: MENJODOHKAN & URAIAN */}
                {(selectedTipeSoal === 'menjodohkan' || selectedTipeSoal === 'uraian') && (
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-slate-700">
                      Kunci Jawaban / Pedoman Penskoran:
                    </label>
                    <textarea
                      rows={2}
                      value={kunciLain}
                      onChange={(e) => setKunciLain(e.target.value)}
                      placeholder="Masukkan kunci jawaban atau pedoman penskoran uraian..."
                      className="w-full p-2.5 rounded-xl border text-xs"
                    />
                  </div>
                )}
              </div>

              {/* PANEL PRATINJAU MATEMATIKA LIVE SEBELUM SIMPAN */}
              <MathPreviewPanel
                judulTeks={judulTeks}
                pertanyaan={pertanyaan}
                gambarUrl={gambarUrl}
                gambarUrl2={gambarUrl2}
                posisiGambar={posisiGambar}
                tipeSoal={selectedTipeSoal}
                options={[
                  { key: 'A', text: opsiA, isKey: selectedTipeSoal === 'pg' ? kunciPG === 'A' : pgKompleksKeys.includes(opsiA) && Boolean(opsiA), imageUrl: opsiGambar.A },
                  { key: 'B', text: opsiB, isKey: selectedTipeSoal === 'pg' ? kunciPG === 'B' : pgKompleksKeys.includes(opsiB) && Boolean(opsiB), imageUrl: opsiGambar.B },
                  { key: 'C', text: opsiC, isKey: selectedTipeSoal === 'pg' ? kunciPG === 'C' : pgKompleksKeys.includes(opsiC) && Boolean(opsiC), imageUrl: opsiGambar.C },
                  { key: 'D', text: opsiD, isKey: selectedTipeSoal === 'pg' ? kunciPG === 'D' : pgKompleksKeys.includes(opsiD) && Boolean(opsiD), imageUrl: opsiGambar.D },
                ]}
                kunciText={kunciLain}
                pembahasan={pembahasan}
                accentTheme="rose"
              />

              {/* ACTION BUTTONS (Simpan dan Batal) */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-display font-extrabold px-5 py-2.5 rounded-2xl text-xs cursor-pointer shadow-xs transition flex items-center gap-1.5"
                >
                  <X className="w-4 h-4" /> Batal
                </button>
                <button
                  type="submit"
                  className="bg-rose-600 hover:bg-rose-700 text-white font-display font-black px-6 py-2.5 rounded-2xl text-xs flex items-center gap-2 cursor-pointer shadow-md transition"
                >
                  <Save className="w-4 h-4" /> {editingQuestionId ? 'Simpan Perubahan' : 'Simpan Soal'}
                </button>
              </div>
            </form>

            {/* ============================================================== */}
            {/* DAFTAR SOAL YANG SUDAH DIBUAT (UNDERNEATH THE FORM)             */}
            {/* ============================================================== */}
            <div className="mt-8 pt-6 border-t-2 border-slate-200 space-y-4">
              {savedExamBuckets.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-2">
                  <span className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-wider block">
                    Daftar Paket &amp; Mapel CBT Tersimpan ({savedExamBuckets.filter((e) => e.aktif).length} Aktif dari {savedExamBuckets.length} Paket):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {savedExamBuckets.map((ex) => {
                      const exPaket = inferPaketFromExam(ex);
                      const exSub = ex.subPaket || 'Paket 1';
                      const isCurrent = ex.id === activeExam.id;
                      return (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => {
                            if (!paketList.includes(exPaket)) setPaketList((prev) => [...prev, exPaket]);
                            if (!subPaketList.includes(exSub)) setSubPaketList((prev) => [...prev, exSub]);
                            setSelectedPaket(exPaket);
                            setSelectedSubPaket(exSub);
                            handleMapelChange(ex.mapel);
                            setTargetKelas(ex.kelas);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border inline-flex items-center gap-2 ${
                            isCurrent
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              ex.aktif ? 'bg-emerald-400' : 'bg-slate-400'
                            }`}
                          />
                          <span>
                            {exPaket} • {ex.mapel} ({exSub}) [{ex.kelas}] — {ex.soalList.length}/{MAX_QUESTIONS_PER_PACKAGE} Soal (
                            {ex.aktif ? 'Aktif' : 'Nonaktif'})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-3xl border border-slate-200">
                <div className="space-y-1.5 flex-1">
                  <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-emerald-600" /> Daftar Soal: {selectedPaket} • {selectedMapel} ({selectedSubPaket})
                  </h3>
                  <p className="text-xs text-slate-600">
                    Kelas: <strong>{targetKelas}</strong> • Tersimpan: <strong>{activeExam.soalList.length} / {MAX_QUESTIONS_PER_PACKAGE} Butir Soal</strong> • Total Bobot: <strong>{totalPoints} Poin</strong>
                  </p>
                  <div className="w-full max-w-md h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        activeExam.soalList.length >= MAX_QUESTIONS_PER_PACKAGE
                          ? 'bg-rose-500'
                          : activeExam.soalList.length >= 40
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.round((activeExam.soalList.length / MAX_QUESTIONS_PER_PACKAGE) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Filter & Download controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filterTipe}
                    onChange={(e) => setFilterTipe(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700"
                  >
                    <option value="all">Semua Tipe Soal</option>
                    <option value="pg">Pilihan Ganda (PG)</option>
                    <option value="pg_kompleks">PG Kompleks</option>
                    <option value="isian">Isian Singkat</option>
                    <option value="benar_salah">Benar/Salah</option>
                    <option value="menjodohkan">Menjodohkan</option>
                    <option value="uraian">Uraian</option>
                  </select>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setDownloadMenuPos((prev) => (prev === 'list' ? null : 'list'))
                      }
                      className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Soal</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {downloadMenuPos === 'list' && (
                      <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50 space-y-1">
                        <button
                          type="button"
                          onClick={() => handleDownloadCbtQuestions('word_only')}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-sky-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                        >
                          <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                          <span>Naskah Soal (.DOC Word)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadCbtQuestions('word_key')}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 text-xs font-bold text-slate-800 flex items-center gap-2 transition cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Soal + Kunci (.DOC Word)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadCbtQuestions('excel')}
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

              {/* Questions List */}
              <div className="space-y-3">
                {allCreatedQuestions.map((q, qIdx) => {
                  const cpMatch = cpList.find((c) => c.id === q.cpId);
                  return (
                    <div
                      key={q.id}
                      className="p-5 rounded-3xl bg-white border border-slate-200 hover:border-emerald-300 shadow-xs space-y-3 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display font-black text-xs text-white bg-slate-900 px-3 py-1 rounded-xl">
                            Soal #{qIdx + 1}
                          </span>
                          <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg">
                            {q.tipe.toUpperCase()}
                          </span>
                          {q.tpId && (
                            <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-2.5 py-1 rounded-lg">
                              {q.tpId}
                            </span>
                          )}
                          {cpMatch && (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg">
                              {cpMatch.kode}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-display font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
                            {q.bobot} Poin
                          </span>
                          <button
                            type="button"
                            onClick={() => handleEditQuestion(q)}
                            className="w-8 h-8 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-600 flex items-center justify-center transition cursor-pointer"
                            title="Edit Butir Soal"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {confirmDeleteQId === q.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="px-2.5 py-1 rounded-xl bg-rose-600 text-white text-[11px] font-black cursor-pointer"
                              >
                                Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteQId(null)}
                                className="px-2 py-1 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteQId(q.id)}
                              className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition cursor-pointer"
                              title="Hapus Soal"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Question Text & Images (Judul terpisah & posisi gambar fleksibel) */}
                      <QuestionContent
                        pertanyaan={q.pertanyaan}
                        judulTeks={q.judulTeks}
                        gambarUrl={q.gambarUrl}
                        gambarUrl2={q.gambarUrl2}
                        posisiGambar={q.posisiGambar}
                        compact
                      />

                      {/* Options / Answer key with Option Image */}
                      {q.opsi && q.opsi.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                          {q.opsi.map((opt, oIdx) => {
                            const optLetter = String.fromCharCode(65 + oIdx);
                            const optImg = q.opsiGambar?.[optLetter];
                            const isCorrect =
                              q.kunciJawaban === opt ||
                              q.kunciJawaban === optLetter ||
                              (Array.isArray(q.kunciJawaban) && (q.kunciJawaban.includes(opt) || q.kunciJawaban.includes(optLetter)));

                            return (
                              <div
                                key={oIdx}
                                className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
                                  isCorrect
                                    ? 'bg-emerald-50 border-emerald-400 font-bold text-emerald-950'
                                    : 'bg-slate-50/50 border-slate-200 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-[11px] w-4">{optLetter}.</span>
                                  <span className="flex-1 whitespace-pre-wrap">
                                    <MathRenderer text={opt} fontFamily="plus-jakarta" />
                                  </span>
                                  {isCorrect && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                                </div>
                                {optImg && (
                                  <img
                                    src={optImg}
                                    alt={`Gambar Opsi ${optLetter}`}
                                    className="h-16 rounded-lg border border-slate-200 object-contain bg-white mx-auto mt-1"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Key for Isian / Uraian */}
                      {(!q.opsi || q.opsi.length === 0) && (
                        <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-xs">
                          <span className="font-bold text-emerald-900">Kunci Jawaban: </span>
                          <strong className="font-mono text-emerald-950">
                            <MathRenderer
                              text={Array.isArray(q.kunciJawaban) ? q.kunciJawaban.join(', ') : String(q.kunciJawaban)}
                              fontFamily="plus-jakarta"
                            />
                          </strong>
                        </div>
                      )}

                      {q.pembahasan && (
                        <div className="text-[11px] text-slate-500 italic bg-slate-50 p-2.5 rounded-xl whitespace-pre-wrap">
                          ℹ️ <MathRenderer text={q.pembahasan} fontFamily="plus-jakarta" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {allCreatedQuestions.length === 0 && (
                  <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-3xl border border-dashed">
                    Belum ada soal pada filter ini. Buat soal menggunakan form di atas!
                  </div>
                )}

                {/* Setting Aktivasi Paket Soal CBT (Wajib Diaktifkan Agar Muncul di Siswa) */}
                <div className="p-5 rounded-3xl bg-gradient-to-r from-sky-50 via-white to-indigo-50 border-2 border-sky-300 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-md shrink-0 ${
                          activeExam.aktif && activeExam.soalList.length > 0
                            ? 'bg-emerald-600 shadow-emerald-500/20'
                            : 'bg-slate-700 shadow-slate-500/20'
                        }`}
                      >
                        <Power className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-display font-black text-slate-800 flex flex-wrap items-center gap-2">
                          <span>Pengaturan Aktivasi Paket Soal CBT</span>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                              activeExam.aktif && activeExam.soalList.length > 0
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {activeExam.aktif && activeExam.soalList.length > 0
                              ? 'Aktif di Siswa'
                              : 'Belum Diaktifkan'}
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Paket soal yang belum diaktifkan tidak akan muncul di halaman ujian siswa. Aktifkan saat ujian siap dilaksanakan.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleExamActive(activeExam)}
                        className={`px-4 py-2.5 rounded-2xl text-xs font-display font-black inline-flex items-center gap-2 transition cursor-pointer shadow-xs whitespace-nowrap ${
                          activeExam.aktif && activeExam.soalList.length > 0
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {activeExam.aktif && activeExam.soalList.length > 0 ? (
                          <>
                            <EyeOff className="w-4 h-4" />
                            <span>Nonaktifkan Paket Ini</span>
                          </>
                        ) : (
                          <>
                            <Power className="w-4 h-4" />
                            <span>Aktifkan Paket Ini</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Daftar Status Paket Soal CBT Tersimpan */}
                  {savedExamBuckets.length > 0 && (
                    <div className="pt-3 border-t border-sky-200/80 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-extrabold text-slate-700">
                          Kelola Status Tampil Paket Soal CBT ({savedExamBuckets.filter((e) => e.aktif).length}/{savedExamBuckets.length} Aktif):
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSetAllSavedExamsActive(true)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-bold transition cursor-pointer"
                          >
                            Aktifkan Semua
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetAllSavedExamsActive(false)}
                            className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] font-bold transition cursor-pointer"
                          >
                            Nonaktifkan Semua
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {savedExamBuckets.map((ex) => {
                          const exPaket = inferPaketFromExam(ex);
                          const exSub = ex.subPaket || 'Paket 1';
                          return (
                            <div
                              key={`act_${ex.id}`}
                              className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                                ex.aktif
                                  ? 'bg-emerald-50/70 border-emerald-300'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">
                                  {exPaket} · {ex.mapel}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {exSub} · {ex.kelas} · {ex.soalList.length} Soal · {ex.durasiMenit} Menit
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleToggleExamActive(ex)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold shrink-0 whitespace-nowrap cursor-pointer transition ${
                                  ex.aktif
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                }`}
                              >
                                {ex.aktif ? 'Aktif ✓' : 'Nonaktif'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Paket Contoh Bawaan CBT */}
                  <div className="pt-2 border-t border-sky-200/70 space-y-2">
                    <span className="text-[11px] font-bold text-slate-600 block">
                      Paket Soal Contoh Bawaan (Default Nonaktif agar tidak muncul sebelum diaktifkan):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SAMPLE_CBT_DEFAULTS_META.map((smp) => {
                        const isSampleOn = Boolean(cbtActivePackages[smp.id]);
                        const sampleMins = getCBTDurationMinutes(cbtDurations, {
                          examId: smp.id,
                          paket: smp.paket,
                          mapel: smp.mapel,
                          fallback: smp.defaultDurasi,
                        });
                        return (
                          <div
                            key={smp.id}
                            className={`px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2 text-[11px] ${
                              isSampleOn
                                ? 'bg-emerald-50/70 border-emerald-300'
                                : 'bg-white/80 border-slate-200'
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-700 truncate block">{smp.label}</span>
                              <span className="text-[10px] font-bold text-amber-700">⏱ {sampleMins} Menit</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleSampleCbtActive(smp.id, smp.label)}
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

                {/* Setting Waktu Pengerjaan Ujian CBT (Auto-Submit) */}
                <div className="p-5 rounded-3xl bg-gradient-to-r from-rose-50 via-white to-amber-50 border-2 border-rose-300 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-500/20 shrink-0">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-display font-black text-slate-800 flex items-center gap-2">
                          Pengaturan Waktu Pengerjaan Ujian CBT
                          <span className="text-[10px] font-extrabold uppercase bg-rose-100 text-rose-900 px-2 py-0.5 rounded-full">
                            Auto-Submit Timer
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Atur batas waktu pengerjaan per jenis asesmen dan mata pelajaran CBT (tersinkron otomatis ke ruang ujian siswa).
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1">
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Paket / Asesmen CBT</label>
                      <select
                        value={durPanelPaket}
                        onChange={(e) => setDurPanelPaket(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-rose-500"
                      >
                        {paketList.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Mata Pelajaran</label>
                      <select
                        value={durPanelMapel}
                        onChange={(e) => setDurPanelMapel(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-rose-500"
                      >
                        <option value="all">Semua Mapel (Paket Ini)</option>
                        <option value="Pendidikan Agama Islam">Pendidikan Agama Islam</option>
                        <option value="Pendidikan Pancasila">Pendidikan Pancasila</option>
                        <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                        <option value="Matematika">Matematika</option>
                        <option value="Ilmu Pengetahuan Alam dan Sosial (IPAS)">IPAS</option>
                        <option value="Seni Rupa">Seni Rupa</option>
                        <option value="Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)">PJOK</option>
                        <option value="Bahasa Inggris">Bahasa Inggris</option>
                        <option value="Muatan Lokal (PLBJ)">Muatan Lokal (PLBJ)</option>
                        <option value="Koding dan Kecerdasan Artifisial (KKA)">
                          Koding &amp; Kecerdasan Artifisial (KKA)
                        </option>
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
                        className="w-full px-3 py-2 rounded-xl border-2 border-amber-400 bg-white text-xs font-black text-center text-slate-900 outline-none focus:border-rose-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => handleSaveCbtDuration(durPanelPaket, durPanelMapel, durPanelMinutes)}
                        className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs shadow-xs cursor-pointer transition"
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
                          handleSaveCbtDuration(durPanelPaket, durPanelMapel, m);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer transition ${
                          durPanelMinutes === m
                            ? 'bg-rose-600 text-white border-rose-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50'
                        }`}
                      >
                        {m} Menit
                      </button>
                    ))}
                  </div>
                </div>

                {/* Setting Acak Soal & Acak Jawaban */}
                <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-50 via-white to-teal-50 border-2 border-emerald-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
                      <Shuffle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-display font-black text-slate-800 flex items-center gap-2">
                        Pengaturan Acak Soal & Pilihan Jawaban CBT
                        <span className="text-[10px] font-extrabold uppercase bg-emerald-200 text-emerald-950 px-2 py-0.5 rounded-full">
                          Siswa CBT
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Ketika diaktifkan guru/admin, soal dan opsi pilihan jawaban otomatis teracak secara unik saat dikerjakan oleh siswa.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className={`px-4 py-2.5 rounded-2xl border-2 text-xs font-display font-extrabold flex items-center gap-2 cursor-pointer transition select-none shadow-2xs ${
                      acakSoal ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={acakSoal}
                        onChange={(e) => {
                          setAcakSoal(e.target.checked);
                          showToast(`Setting Acak Soal CBT: ${e.target.checked ? 'AKTIF' : 'NONAKTIF'}`, 'success');
                        }}
                        className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                      />
                      <span>Acak Soal</span>
                    </label>

                    <label className={`px-4 py-2.5 rounded-2xl border-2 text-xs font-display font-extrabold flex items-center gap-2 cursor-pointer transition select-none shadow-2xs ${
                      acakJawaban ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={acakJawaban}
                        onChange={(e) => {
                          setAcakJawaban(e.target.checked);
                          showToast(`Setting Acak Jawaban CBT: ${e.target.checked ? 'AKTIF' : 'NONAKTIF'}`, 'success');
                        }}
                        className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                      />
                      <span>Acak Jawaban</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SUBTAB 2: UJIAN CBT SISWA & SIMULASI INTERAKTIF                 */}
        {/* ============================================================== */}
        {subTab === 'ujian' && (
          <div className="space-y-6">
            {/* If Exam is NOT running */}
            {!isExamRunning && (
              <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
                      CBT Ready
                    </span>
                    <h3 className="text-lg font-display font-black text-slate-800 mt-1">
                      {activeExam.judul} ({targetKelas})
                    </h3>
                    <p className="text-xs text-slate-600">
                      Total Soal: <strong>{activeExam.soalList.length} Butir</strong> • Durasi:{' '}
                      <strong>
                        {getCBTDurationMinutes(cbtDurations, {
                          examId: activeExam.id,
                          paket: selectedPaket,
                          mapel: selectedMapel,
                          fallback: examDurationMinutes || activeExam.durasiMenit,
                        })}{' '}
                        Menit
                      </strong>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={startExam}
                    disabled={activeExam.soalList.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-display font-black px-6 py-3 rounded-2xl text-xs flex items-center gap-2 cursor-pointer shadow-md transition"
                  >
                    <Play className="w-4 h-4" /> Mulai Ujian CBT Sekarang
                  </button>
                </div>

                {examResult && (
                  <div className="p-4 rounded-2xl bg-emerald-100/70 border border-emerald-300 text-center space-y-1">
                    <span className="text-xs font-bold text-emerald-800">Hasil Ujian Terakhir:</span>
                    <h4 className="text-3xl font-display font-black text-emerald-950">{examResult.score} / 100</h4>
                  </div>
                )}
              </div>
            )}

            {/* If Exam IS Running */}
            {isExamRunning && activeExam && currentQ && (
              <div className="bg-slate-50 p-6 rounded-3xl border-2 border-emerald-500 space-y-5 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
                  <div>
                    <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Soal {currentQuestionIndex + 1} dari {currentExamQuestions.length}
                    </span>
                    <h4 className="font-display font-black text-slate-800 text-sm mt-1">{activeExam.judul}</h4>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-mono font-black ${
                        timeLeft <= 300
                          ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      <span>
                        Sisa Waktu: {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:
                        {String(timeLeft % 60).padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Navigasi Nomor Soal */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-display font-black text-slate-800">
                      Navigasi Nomor Soal ({Object.keys(studentAnswers).filter((k) => {
                        const v = studentAnswers[k];
                        return v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0);
                      }).length} / {currentExamQuestions.length} Terjawab)
                    </span>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-bold">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span> Terjawab</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-600 inline-block"></span> Sedang Dibuka</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-200 inline-block"></span> Belum</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto p-0.5">
                    {currentExamQuestions.map((qItem, idx) => {
                      const ansVal = studentAnswers[qItem.id];
                      const isAns =
                        ansVal !== undefined &&
                        ansVal !== null &&
                        ansVal !== '' &&
                        (!Array.isArray(ansVal) || ansVal.length > 0);
                      const isCurr = idx === currentQuestionIndex;
                      return (
                        <button
                          key={qItem.id}
                          type="button"
                          onClick={() => setCurrentQuestionIndex(idx)}
                          className={`w-8 h-8 rounded-xl font-mono text-xs font-black transition cursor-pointer ${
                            isCurr
                              ? 'bg-rose-600 text-white ring-2 ring-rose-300 shadow-xs scale-105'
                              : isAns
                              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Question Display */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>Tipe: {currentQ.tipe.toUpperCase()}</span>
                    <span>Bobot: {currentQ.bobot} Poin</span>
                  </div>

                  {/* Question Text & Images (Judul terpisah & posisi gambar fleksibel) */}
                  <QuestionContent
                    pertanyaan={currentQ.pertanyaan}
                    judulTeks={currentQ.judulTeks}
                    gambarUrl={currentQ.gambarUrl}
                    gambarUrl2={currentQ.gambarUrl2}
                    posisiGambar={currentQ.posisiGambar}
                    titleClassName="text-base sm:text-lg font-display font-black text-slate-900"
                    bodyClassName="text-sm sm:text-base font-bold text-slate-900 leading-relaxed"
                  />

                  {/* Options with Option Images */}
                  {currentQ.opsi && currentQ.opsi.length > 0 && (
                    <div className="space-y-2.5 pt-2">
                      {currentQ.opsi.map((opt, oIdx) => {
                        const optLetter = String.fromCharCode(65 + oIdx);
                        const optImg = currentQ.opsiGambar?.[optLetter];
                        const isSelected = studentAnswers[currentQ.id] === opt || studentAnswers[currentQ.id] === optLetter;
                        return (
                          <button
                            key={oIdx}
                            type="button"
                            onClick={() => handleAnswerChange(currentQ.id, opt)}
                            className={`w-full p-3.5 rounded-2xl border text-left text-xs font-bold transition flex flex-col gap-2 cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs ring-2 ring-emerald-300'
                                : 'bg-slate-50/50 hover:bg-slate-100 border-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-white border border-slate-300 flex items-center justify-center text-xs font-black shrink-0">
                                {optLetter}
                              </span>
                              <span className="flex-1 whitespace-pre-wrap">
                                <MathRenderer text={opt} fontFamily="plus-jakarta" />
                              </span>
                            </div>
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar Opsi ${optLetter}`}
                                className="h-20 rounded-xl border border-slate-200 object-contain bg-white ml-9"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Isian Singkat Answer Field */}
                  {currentQ.tipe === 'isian' && (
                    <div className="pt-2">
                      <input
                        type="text"
                        value={studentAnswers[currentQ.id] || ''}
                        onChange={(e) => handleAnswerChange(currentQ.id, e.target.value)}
                        placeholder="Ketik jawaban singkat Anda di sini..."
                        className="w-full p-3.5 rounded-2xl border-2 border-emerald-500 bg-white font-bold text-sm text-slate-900 outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Nav buttons */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-xs font-bold cursor-pointer"
                  >
                    Sebelumnya
                  </button>

                  {currentQuestionIndex < activeExam.soalList.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Selanjutnya
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSubmitExam(false)}
                      className="px-6 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md cursor-pointer"
                    >
                      Selesai &amp; Kirim Ujian
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* SUBTAB 3: REPORT & REKAPITULASI HASIL UJIAN CBT                */}
        {/* ============================================================== */}
        {subTab === 'laporan-cbt' && activeUser.role !== 'siswa' && !isExamRunning && (() => {
          const examLookup = new Map<string, CBTExam>();
          exams.forEach((ex) => examLookup.set(ex.id, ex));

          const studentLookup = new Map<string, Student>();
          students.forEach((st) => studentLookup.set(st.id, st));

          const enrichedRows = cbtResultsList
            .filter((res) => doesRecordMatchTerm(res, activeYear, activeSemester))
            .map((res, idx) => {
              const linkedExam = examLookup.get(res.examId);
              const linkedStudent = studentLookup.get(res.studentId);
              const nama = linkedStudent?.nama || res.studentName || 'Siswa';
              const nisn = linkedStudent?.nisn || '-';
              const kelas = linkedStudent?.kelas || linkedExam?.kelas || activeClass || '-';
              const fotoUrl = linkedStudent?.fotoUrl || '';
              const mapel = res.mapel || linkedExam?.mapel || 'Umum';
              const paket = res.paketName || linkedExam?.paketName || 'Reguler';
              const judul = res.judul || linkedExam?.judul || `${paket} - ${mapel}`;
              const nilai = Number.isFinite(Number(res.nilai)) ? Number(res.nilai) : 0;
              const predikat = nilai >= 90 ? 'A' : nilai >= 75 ? 'B' : nilai >= 60 ? 'C' : 'D';
              const status: 'Tuntas' | 'Remedial' = nilai >= 75 ? 'Tuntas' : 'Remedial';
              return {
                id: `${res.examId}_${res.studentId}_${res.recordedAt || idx}`,
                raw: res,
                nama,
                nisn,
                kelas,
                fotoUrl,
                mapel,
                paket,
                judul,
                nilai,
                skor: res.skor ?? nilai,
                predikat,
                status,
                waktuSelesai: res.waktuSelesai || '-',
                tanggal: res.tanggal || '-',
                recordedAt: res.recordedAt || 0,
              };
            })
            .sort((a, b) => {
              if (b.nilai !== a.nilai) return b.nilai - a.nilai;
              return (b.recordedAt || 0) - (a.recordedAt || 0);
            });

          const availableReportPakets = Array.from(
            new Set(enrichedRows.map((r) => r.paket).filter(Boolean))
          );
          const availableReportMapels = Array.from(
            new Set(enrichedRows.map((r) => r.mapel).filter(Boolean))
          );
          const availableReportClasses = Array.from(
            new Set(enrichedRows.map((r) => r.kelas).filter(Boolean))
          ).sort();

          const filteredCbtRows = enrichedRows.filter((row) => {
            if (reportPaketFilter !== 'all' && row.paket !== reportPaketFilter) return false;
            if (reportMapelFilter !== 'all' && row.mapel !== reportMapelFilter) return false;
            if (reportClassFilter !== 'all' && row.kelas !== reportClassFilter) return false;
            if (reportStatusFilter !== 'all' && row.status !== reportStatusFilter) return false;
            if (reportSearch.trim()) {
              const q = reportSearch.trim().toLowerCase();
              const match =
                row.nama.toLowerCase().includes(q) ||
                row.nisn.toLowerCase().includes(q) ||
                row.mapel.toLowerCase().includes(q) ||
                row.judul.toLowerCase().includes(q);
              if (!match) return false;
            }
            return true;
          });

          const totalSubmissions = filteredCbtRows.length;
          const avgCbtScore =
            totalSubmissions > 0
              ? (filteredCbtRows.reduce((acc, r) => acc + r.nilai, 0) / totalSubmissions).toFixed(1)
              : '0.0';
          const tuntasCbtCount = filteredCbtRows.filter((r) => r.status === 'Tuntas').length;
          const tuntasCbtPct =
            totalSubmissions > 0 ? Math.round((tuntasCbtCount / totalSubmissions) * 100) : 0;
          const highestCbt =
            totalSubmissions > 0 ? Math.max(...filteredCbtRows.map((r) => r.nilai)) : 0;
          const lowestCbt =
            totalSubmissions > 0 ? Math.min(...filteredCbtRows.map((r) => r.nilai)) : 0;

          // Mapel average chart data
          const mapelStatMap = new Map<string, { sum: number; count: number }>();
          filteredCbtRows.forEach((r) => {
            const cur = mapelStatMap.get(r.mapel) || { sum: 0, count: 0 };
            mapelStatMap.set(r.mapel, { sum: cur.sum + r.nilai, count: cur.count + 1 });
          });
          const cbtMapelChartData = Array.from(mapelStatMap.entries()).map(([mapelName, stat]) => {
            const avg = Math.round(stat.sum / stat.count);
            return {
              mapel: mapelName.length > 18 ? `${mapelName.slice(0, 16)}...` : mapelName,
              fullMapel: mapelName,
              rataRata: avg,
              peserta: stat.count,
              fill: avg >= 75 ? '#059669' : '#f59e0b',
            };
          });

          const topCbtStudents = filteredCbtRows.slice(0, 5);
          const kepsekCbt = resolveKepalaSekolah(teachers, profile);
          const waliCbt =
            reportClassFilter !== 'all'
              ? resolveWaliKelas(teachers, reportClassFilter)
              : resolveWaliKelas(teachers, activeClass);
          const tanggalCetakCbt = new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });

          const buildCbtExportOptions = (): CbtReportExportOptions => ({
            schoolName: profile?.name || 'SDN Rawa Badak Utara 21',
            schoolAddress: profile?.alamat || '',
            schoolNpsn: profile?.npsn || '',
            logoKemendikbudUrl: profile?.logoKemendikbudUrl,
            logoSekolahUrl: profile?.logoSekolahUrl,
            tahunPelajaran: activeYear,
            semester: activeSemester,
            filterSummary: `Paket: ${reportPaketFilter === 'all' ? 'Semua Paket' : reportPaketFilter} • Mapel: ${
              reportMapelFilter === 'all' ? 'Semua Mapel' : reportMapelFilter
            } • Kelas: ${reportClassFilter === 'all' ? 'Semua Kelas' : reportClassFilter}`,
            kepsekNama: kepsekCbt.nama,
            kepsekNipLabel: formatNipLabel(kepsekCbt.status, kepsekCbt.nip),
            waliKelasLabel:
              reportClassFilter !== 'all'
                ? `Wali Kelas ${reportClassFilter}`
                : `Wali Kelas / Guru ${activeClass}`,
            waliNama: waliCbt?.nama || activeUser.name || 'Guru Mata Pelajaran',
            waliNipLabel: formatNipLabel(waliCbt?.statusPegawai, waliCbt?.nip),
          });

          const toCbtExportRecord = (r: (typeof filteredCbtRows)[number]): CbtReportRecordInput => ({
            id: r.id,
            nama: r.nama,
            nisn: r.nisn,
            kelas: r.kelas,
            mapel: r.mapel,
            paket: r.paket,
            judul: r.judul,
            nilai: r.nilai,
            predikat: r.predikat,
            status: r.status,
            tanggal: r.tanggal,
            waktuSelesai: r.waktuSelesai,
          });

          const handleDownloadCbtPdf = async () => {
            if (filteredCbtRows.length === 0) {
              showToast('Belum ada data hasil CBT pada semester ini untuk diunduh.', 'error');
              return;
            }
            await exportClassCbtReportToPdf(
              filteredCbtRows.map(toCbtExportRecord),
              buildCbtExportOptions()
            );
            showToast(`Report Hasil CBT (${filteredCbtRows.length} data, .PDF) berhasil diunduh!`, 'success');
          };

          const handleDownloadCbtWord = () => {
            if (filteredCbtRows.length === 0) {
              showToast('Belum ada data hasil CBT pada semester ini untuk diunduh.', 'error');
              return;
            }
            exportClassCbtReportToWord(
              filteredCbtRows.map(toCbtExportRecord),
              buildCbtExportOptions()
            );
            showToast(`Report Hasil CBT (${filteredCbtRows.length} data, .DOC Word) berhasil diunduh!`, 'success');
          };

          const handleDownloadIndividualCbtPdf = async (row: (typeof filteredCbtRows)[number]) => {
            const waliRow = resolveWaliKelas(teachers, row.kelas);
            await exportIndividualCbtReportToPdf(toCbtExportRecord(row), {
              ...buildCbtExportOptions(),
              waliKelasLabel: `Wali Kelas ${row.kelas}`,
              waliNama: waliRow?.nama || activeUser.name || 'Guru Mata Pelajaran',
              waliNipLabel: formatNipLabel(waliRow?.statusPegawai, waliRow?.nip),
            });
            showToast(`Rapor CBT "${row.nama}" (.PDF) berhasil diunduh.`, 'success');
          };

          return (
            <div className="space-y-6">
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
                    LAPORAN REKAPITULASI HASIL UJIAN BERBASIS KOMPUTER (CBT)
                  </h2>
                  <p className="text-[11px] text-slate-700 mt-0.5 tabular-nums">
                    Paket: <strong>{reportPaketFilter === 'all' ? 'Semua Paket' : reportPaketFilter}</strong> · Mapel:{' '}
                    <strong>{reportMapelFilter === 'all' ? 'Semua Mapel' : reportMapelFilter}</strong> · Kelas:{' '}
                    <strong>{reportClassFilter === 'all' ? 'Semua Kelas' : reportClassFilter}</strong> · Tahun Pelajaran {activeYear} ({activeSemester})
                  </p>
                </div>
              </div>

              {/* Eye-Catching Editorial Header Banner (Layar) */}
              <div className="no-print bg-gradient-to-br from-slate-900 via-emerald-950 to-cyan-950 text-white p-6 sm:p-7 rounded-3xl shadow-md border border-emerald-900/40 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-200 font-medium">
                    <span>Rekapitulasi Evaluasi CBT</span>
                    <span aria-hidden="true">·</span>
                    <span>{reportClassFilter === 'all' ? 'Semua Kelas' : reportClassFilter}</span>
                    <span aria-hidden="true">·</span>
                    <span>Tahun Pelajaran {activeYear} ({activeSemester})</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-display font-black tracking-tight flex items-center gap-2.5 text-white">
                    <span className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                      <Award className="w-5 h-5 text-emerald-300" />
                    </span>
                    <span>Report &amp; Rekapitulasi Hasil Ujian CBT</span>
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Rekapitulasi nilai hasil pengerjaan ujian CBT siswa per paket dan mata pelajaran, grafik rata-rata per mapel, rapor individu CBT, dan cetak laporan standar A4.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setCbtResultsList(getStoredCBTResults().filter((r) => !isTkaResultEntry(r)));
                      showToast('Data hasil CBT diperbarui.', 'success');
                    }}
                    className="bg-white/10 hover:bg-white/20 text-white font-display font-bold px-3.5 py-2.5 rounded-xl text-xs border border-white/15 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-4 h-4 text-sky-300" />
                    <span>Segarkan Data</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadCbtPdf()}
                    className="bg-rose-500 hover:bg-rose-400 text-white font-display font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
                    title="Unduh Report Rekapitulasi CBT (.PDF)"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCbtWord}
                    className="bg-sky-500 hover:bg-sky-400 text-white font-display font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
                    title="Unduh Report Rekapitulasi CBT (.DOC Word) dengan Kop Logo & spasi tanda tangan 4 cm"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Word (.DOC)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="bg-white hover:bg-slate-100 text-slate-900 font-display font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Printer className="w-4 h-4 text-emerald-700" />
                    <span>Cetak Rekap A4</span>
                  </button>
                </div>
              </div>

              {/* Filter Bar (Layar) */}
              <div className="no-print bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">Paket Ujian CBT</label>
                  <select
                    value={reportPaketFilter}
                    onChange={(e) => setReportPaketFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="all">Semua Paket CBT</option>
                    {availableReportPakets.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">Mata Pelajaran</label>
                  <select
                    value={reportMapelFilter}
                    onChange={(e) => setReportMapelFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="all">Semua Mata Pelajaran</option>
                    {availableReportMapels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">Filter Kelas</label>
                  <select
                    value={reportClassFilter}
                    onChange={(e) => setReportClassFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="all">Semua Kelas</option>
                    {(availableReportClasses.length > 0 ? availableReportClasses : CLASSES_LIST).map((cls) => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">Ketuntasan (KKTP 75)</label>
                  <select
                    value={reportStatusFilter}
                    onChange={(e) => setReportStatusFilter(e.target.value as 'all' | 'Tuntas' | 'Remedial')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="all">Semua Status</option>
                    <option value="Tuntas">Hanya Tuntas (&gt;= 75)</option>
                    <option value="Remedial">Perlu Remedial (&lt; 75)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">Cari Nama / NISN</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                      placeholder="Cari siswa..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-3.5 print:gap-2 print-avoid-break">
                <div className="bg-white p-4 print:p-3 rounded-2xl border border-slate-200 space-y-1">
                  <div className="text-[11px] font-bold text-emerald-700">Total Pengerjaan CBT</div>
                  <div className="text-2xl print:text-xl font-display font-black text-slate-900 tabular-nums">
                    {totalSubmissions} <span className="text-xs font-bold text-slate-500">Sesi</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Hasil ujian terekam sistem</p>
                </div>
                <div className="bg-white p-4 print:p-3 rounded-2xl border border-slate-200 space-y-1">
                  <div className="text-[11px] font-bold text-sky-700">Rata-rata Nilai CBT</div>
                  <div className="text-2xl print:text-xl font-display font-black text-slate-900 tabular-nums">
                    {avgCbtScore}
                  </div>
                  <p className="text-[11px] text-slate-500 tabular-nums">Standar KKTP: 75.0 Poin</p>
                </div>
                <div className="bg-white p-4 print:p-3 rounded-2xl border border-slate-200 space-y-1">
                  <div className="text-[11px] font-bold text-teal-700">Persentase Ketuntasan</div>
                  <div className="text-2xl print:text-xl font-display font-black text-emerald-700 tabular-nums">
                    {tuntasCbtPct}%
                  </div>
                  <p className="text-[11px] text-slate-600 tabular-nums">
                    {tuntasCbtCount} dari {totalSubmissions} hasil tuntas
                  </p>
                </div>
                <div className="bg-white p-4 print:p-3 rounded-2xl border border-slate-200 space-y-1">
                  <div className="text-[11px] font-bold text-amber-700">Nilai Tertinggi / Terendah</div>
                  <div className="text-2xl print:text-xl font-display font-black text-slate-900 tabular-nums">
                    {highestCbt} <span className="text-xs font-bold text-slate-400">/ min {lowestCbt}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 tabular-nums">Skala penilaian 0–100</p>
                </div>
              </div>

              {totalSubmissions === 0 ? (
                <div className="p-8 rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
                    <Laptop className="w-6 h-6" />
                  </div>
                  <div className="space-y-1 max-w-md mx-auto">
                    <h3 className="font-display font-black text-sm text-slate-800">
                      Belum Ada Data Hasil Ujian CBT
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Rekapitulasi nilai dan peringkat CBT akan tampil otomatis setelah siswa menyelesaikan ujian CBT atau guru menjalankan Simulasi Ujian CBT.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubTab('ujian')}
                    className="no-print px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-display font-black cursor-pointer inline-flex items-center gap-1.5 transition"
                  >
                    <Play className="w-3.5 h-3.5" /> Buka Simulasi / Ujian CBT
                  </button>
                </div>
              ) : (
                <>
                  {/* Chart + Top 5 Students */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 print-avoid-break">
                    <div className="lg:col-span-7 bg-white p-5 print:p-3 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div>
                          <h3 className="font-display font-black text-sm text-slate-900 flex items-center gap-1.5">
                            <BarChart3 className="w-4 h-4 text-emerald-600" /> Rata-rata Nilai CBT per Mata Pelajaran
                          </h3>
                          <p className="text-[11px] text-slate-500">Perbandingan capaian mapel terhadap ambang KKTP (75)</p>
                        </div>
                      </div>
                      <div className="w-full h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={cbtMapelChartData} margin={{ top: 10, right: 12, left: -16, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                            <XAxis dataKey="mapel" tick={{ fontSize: 10, fontWeight: 700, fill: '#334155' }} tickLine={false} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                            <ReferenceLine y={75} stroke="#e11d48" strokeDasharray="4 4" />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload || !payload.length) return null;
                                const d = payload[0].payload as (typeof cbtMapelChartData)[number];
                                return (
                                  <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-md text-xs space-y-1">
                                    <div className="font-bold text-slate-900">{d.fullMapel}</div>
                                    <div className="text-emerald-700 font-mono font-black tabular-nums">
                                      Rata-rata: {d.rataRata} ({d.peserta} pengerjaan)
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Bar dataKey="rataRata" radius={[6, 6, 0, 0]} maxBarSize={40}>
                              {cbtMapelChartData.map((entry) => (
                                <Cell key={`cbt-bar-${entry.fullMapel}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="lg:col-span-5 bg-white p-5 print:p-3 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <h3 className="font-display font-black text-sm text-slate-900 flex items-center gap-1.5">
                          <Trophy className="w-4 h-4 text-amber-500" /> Peringkat 5 Terbaik CBT
                        </h3>
                        <span className="text-[11px] font-bold text-slate-500">Top 5 Scores</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {topCbtStudents.map((item, idx) => (
                          <div key={`top-cbt-${item.id}`} className="py-2.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-6 h-6 rounded-lg font-mono text-xs font-black flex items-center justify-center shrink-0 tabular-nums ${
                                  idx === 0
                                    ? 'bg-amber-300 text-slate-900'
                                    : idx === 1
                                    ? 'bg-slate-200 text-slate-900'
                                    : idx === 2
                                    ? 'bg-orange-200 text-slate-900'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 truncate">{item.nama}</div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {item.kelas} · {item.mapel}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono font-black text-sm text-emerald-700 tabular-nums">{item.nilai}</div>
                              <div className="text-[10px] font-bold text-slate-500">Predikat {item.predikat}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Tabel Rekapitulasi Nilai CBT */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                      <h3 className="font-display font-black text-sm text-slate-900 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <span>Daftar Rekapitulasi Nilai Ujian CBT ({filteredCbtRows.length} Data)</span>
                      </h3>
                      <span className="text-xs text-slate-500 font-semibold tabular-nums">KKTP: 75</span>
                    </div>
                    <div className="overflow-x-auto print-expand-scroll">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-emerald-50 text-emerald-950 font-black uppercase text-[11px] border-b-2 border-emerald-200">
                            <th className="p-3 text-center w-12">No</th>
                            <th className="p-3">Identitas Siswa</th>
                            <th className="p-3 text-center">Kelas</th>
                            <th className="p-3">Mata Pelajaran &amp; Paket</th>
                            <th className="p-3 text-center">Nilai</th>
                            <th className="p-3 text-center">Predikat</th>
                            <th className="p-3 text-center">Status</th>
                            <th className="p-3 text-center">Waktu</th>
                            <th className="no-print p-3 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredCbtRows.map((row, idx) => (
                            <tr key={row.id} className="hover:bg-emerald-50/30 even:bg-slate-50/40 transition">
                              <td className="p-3 text-center font-mono font-bold text-slate-600 tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-900">{row.nama}</div>
                                <div className="text-[10px] font-mono text-slate-500 tabular-nums">NISN: {row.nisn}</div>
                              </td>
                              <td className="p-3 text-center font-bold text-slate-700 whitespace-nowrap">
                                {row.kelas}
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-800">{row.mapel}</div>
                                <div className="text-[10px] text-slate-500">{row.paket}</div>
                              </td>
                              <td className="p-3 text-center font-mono font-black text-sm text-emerald-800 tabular-nums">
                                {row.nilai}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-md font-black text-[11px] ${
                                    row.predikat === 'A'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : row.predikat === 'B'
                                      ? 'bg-sky-100 text-sky-800'
                                      : row.predikat === 'C'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {row.predikat}
                                </span>
                              </td>
                              <td className="p-3 text-center font-bold text-[11px] whitespace-nowrap">
                                <span className={row.status === 'Tuntas' ? 'text-emerald-700' : 'text-rose-700'}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="p-3 text-center text-[11px] text-slate-600 font-mono tabular-nums whitespace-nowrap">
                                {row.tanggal} · {row.waktuSelesai}
                              </td>
                              <td className="no-print p-3 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void handleDownloadIndividualCbtPdf(row)}
                                    className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-display font-extrabold inline-flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                                    title={`Unduh Rapor CBT ${row.nama} (.PDF)`}
                                  >
                                    <Download className="w-3 h-3" /> Unduh PDF
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedCbtReportRow(row)}
                                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-display font-extrabold inline-flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                                  >
                                    <Eye className="w-3 h-3" /> Rapor CBT
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* Blok Pengesahan Resmi Kepala Sekolah & Wali Kelas (Khusus Cetak / PDF) */}
              <div className="hidden print-only print-avoid-break pt-6 mt-4 text-xs text-slate-900">
                <div className="grid grid-cols-2 gap-8 text-center">
                  <div>
                    <p className="font-medium text-slate-700">
                      Mengetahui,<br />Kepala {profile?.name || 'SDN Rawa Badak Utara 21'}
                    </p>
                    <div style={{ height: '4cm' }} />
                    <p className="font-black text-slate-900 underline">{kepsekCbt.nama}</p>
                    <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                      {formatNipLabel(kepsekCbt.status, kepsekCbt.nip)}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">
                      Jakarta, {tanggalCetakCbt}<br />
                      {reportClassFilter !== 'all' ? `Wali Kelas ${reportClassFilter}` : `Wali Kelas / Guru ${activeClass}`}
                    </p>
                    <div style={{ height: '4cm' }} />
                    <p className="font-black text-slate-900 underline">
                      {waliCbt?.nama || activeUser.name || 'Guru Mata Pelajaran'}
                    </p>
                    <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                      {formatNipLabel(waliCbt?.statusPegawai, waliCbt?.nip)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* MODAL LEMBAR RAPOR CBT INDIVIDU (PRINT-READY A4) */}
      {selectedCbtReportRow && (() => {
        const kepsekModal = resolveKepalaSekolah(teachers, profile);
        const waliModal = resolveWaliKelas(teachers, selectedCbtReportRow.kelas);
        const tglModal = new Date().toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:static print:inset-auto print:z-auto print:bg-white print:p-0 print:overflow-visible print:block">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-5 border border-slate-200 my-8 print:shadow-none print:border-0 print:rounded-none print:max-w-none print:w-full print:my-0 print:p-1">
              {/* Kop Surat Resmi */}
              <div className="flex items-center justify-between gap-4 border-b-4 border-double border-slate-900 pb-3">
                {profile?.logoKemendikbudUrl ? (
                  <img
                    src={profile.logoKemendikbudUrl}
                    alt="Logo Dinas"
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 object-contain shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
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
                    onClick={() => setSelectedCbtReportRow(null)}
                    className="no-print w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center cursor-pointer transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-center space-y-0.5">
                <h4 className="font-display font-black text-sm sm:text-base uppercase tracking-wide text-slate-900">
                  LEMBAR HASIL UJIAN BERBASIS KOMPUTER (CBT)
                </h4>
                <p className="text-xs text-slate-500 font-medium">
                  Tahun Pelajaran {activeYear} ({activeSemester}) · {selectedCbtReportRow.paket}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-2xl print:rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Nama Lengkap</span>
                  <span className="font-black text-slate-900">{selectedCbtReportRow.nama}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">NISN</span>
                  <span className="font-mono font-bold text-slate-800 tabular-nums">{selectedCbtReportRow.nisn}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Kelas / Rombel</span>
                  <span className="font-bold text-emerald-800">{selectedCbtReportRow.kelas}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Waktu Selesai</span>
                  <span className="font-mono font-bold text-slate-700 tabular-nums">
                    {selectedCbtReportRow.tanggal} · {selectedCbtReportRow.waktuSelesai}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl print:rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-emerald-700 text-white uppercase text-[11px] font-black">
                      <th className="p-3">Mata Pelajaran</th>
                      <th className="p-3">Judul / Paket Asesmen</th>
                      <th className="p-3 text-center">Nilai Akhir</th>
                      <th className="p-3 text-center">Predikat</th>
                      <th className="p-3 text-center">Ketuntasan (KKTP 75)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white font-semibold">
                      <td className="p-3 text-slate-900 font-bold">{selectedCbtReportRow.mapel}</td>
                      <td className="p-3 text-slate-700">{selectedCbtReportRow.judul}</td>
                      <td className="p-3 text-center font-mono font-black text-lg text-emerald-800 tabular-nums">
                        {selectedCbtReportRow.nilai}
                      </td>
                      <td className="p-3 text-center font-black text-base text-slate-900">
                        {selectedCbtReportRow.predikat}
                      </td>
                      <td className="p-3 text-center font-black">
                        <span className={selectedCbtReportRow.status === 'Tuntas' ? 'text-emerald-700' : 'text-rose-700'}>
                          {selectedCbtReportRow.status}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 text-xs text-center border-t border-slate-200 print-avoid-break">
                <div>
                  <p className="font-medium text-slate-700">Mengetahui,<br />Orang Tua / Wali Murid</p>
                  <div style={{ height: '4cm' }} />
                  <div className="w-36 border-b border-slate-400 mx-auto mb-1" />
                  <p className="text-[10px] text-slate-500">(Nama Terang Orang Tua)</p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">
                    Mengetahui,<br />Kepala {profile?.name || 'SDN Rawa Badak Utara 21'}
                  </p>
                  <div style={{ height: '4cm' }} />
                  <p className="font-black text-slate-900 underline">{kepsekModal.nama}</p>
                  <p className="text-[10px] font-mono text-slate-500 tabular-nums">
                    {formatNipLabel(kepsekModal.status, kepsekModal.nip)}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">
                    Jakarta, {tglModal}<br />Wali Kelas {selectedCbtReportRow.kelas}
                  </p>
                  <div style={{ height: '4cm' }} />
                  <p className="font-black text-slate-900 underline">
                    {waliModal?.nama || 'Belum Ditugaskan'}
                  </p>
                  <p className="text-[10px] font-mono text-slate-500 tabular-nums">
                    {formatNipLabel(waliModal?.statusPegawai, waliModal?.nip)}
                  </p>
                </div>
              </div>

              <div className="no-print flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedCbtReportRow(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const opts: CbtReportExportOptions = {
                      schoolName: profile?.name || 'SDN Rawa Badak Utara 21',
                      schoolAddress: profile?.alamat || '',
                      schoolNpsn: profile?.npsn || '',
                      logoKemendikbudUrl: profile?.logoKemendikbudUrl,
                      logoSekolahUrl: profile?.logoSekolahUrl,
                      tahunPelajaran: activeYear,
                      semester: activeSemester,
                      filterSummary: `${selectedCbtReportRow.paket} • ${selectedCbtReportRow.mapel}`,
                      kepsekNama: kepsekModal.nama,
                      kepsekNipLabel: formatNipLabel(kepsekModal.status, kepsekModal.nip),
                      waliKelasLabel: `Wali Kelas ${selectedCbtReportRow.kelas}`,
                      waliNama: waliModal?.nama || activeUser.name || 'Guru Mata Pelajaran',
                      waliNipLabel: formatNipLabel(waliModal?.statusPegawai, waliModal?.nip),
                    };
                    exportIndividualCbtReportToWord(
                      {
                        id: selectedCbtReportRow.id,
                        nama: selectedCbtReportRow.nama,
                        nisn: selectedCbtReportRow.nisn,
                        kelas: selectedCbtReportRow.kelas,
                        mapel: selectedCbtReportRow.mapel,
                        paket: selectedCbtReportRow.paket,
                        judul: selectedCbtReportRow.judul,
                        nilai: selectedCbtReportRow.nilai,
                        predikat: selectedCbtReportRow.predikat,
                        status: selectedCbtReportRow.status,
                        tanggal: selectedCbtReportRow.tanggal,
                        waktuSelesai: selectedCbtReportRow.waktuSelesai,
                      },
                      opts
                    );
                    showToast(`Rapor CBT "${selectedCbtReportRow.nama}" (.DOC Word) berhasil diunduh.`, 'success');
                  }}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-display font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FileText className="w-4 h-4" /> Word (.DOC)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const opts: CbtReportExportOptions = {
                      schoolName: profile?.name || 'SDN Rawa Badak Utara 21',
                      schoolAddress: profile?.alamat || '',
                      schoolNpsn: profile?.npsn || '',
                      logoKemendikbudUrl: profile?.logoKemendikbudUrl,
                      logoSekolahUrl: profile?.logoSekolahUrl,
                      tahunPelajaran: activeYear,
                      semester: activeSemester,
                      filterSummary: `${selectedCbtReportRow.paket} • ${selectedCbtReportRow.mapel}`,
                      kepsekNama: kepsekModal.nama,
                      kepsekNipLabel: formatNipLabel(kepsekModal.status, kepsekModal.nip),
                      waliKelasLabel: `Wali Kelas ${selectedCbtReportRow.kelas}`,
                      waliNama: waliModal?.nama || activeUser.name || 'Guru Mata Pelajaran',
                      waliNipLabel: formatNipLabel(waliModal?.statusPegawai, waliModal?.nip),
                    };
                    await exportIndividualCbtReportToPdf(
                      {
                        id: selectedCbtReportRow.id,
                        nama: selectedCbtReportRow.nama,
                        nisn: selectedCbtReportRow.nisn,
                        kelas: selectedCbtReportRow.kelas,
                        mapel: selectedCbtReportRow.mapel,
                        paket: selectedCbtReportRow.paket,
                        judul: selectedCbtReportRow.judul,
                        nilai: selectedCbtReportRow.nilai,
                        predikat: selectedCbtReportRow.predikat,
                        status: selectedCbtReportRow.status,
                        tanggal: selectedCbtReportRow.tanggal,
                        waktuSelesai: selectedCbtReportRow.waktuSelesai,
                      },
                      opts
                    );
                    showToast(`Rapor CBT "${selectedCbtReportRow.nama}" (.PDF) berhasil diunduh.`, 'success');
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Download className="w-4 h-4" /> Unduh PDF
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" /> Cetak Lembar CBT
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: TAMBAH PAKET SUMATIF */}
      {isAddUHOpen && (
        <div className="fixed inset-0 z-[950] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-5 shadow-2xl border space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-display font-black text-sm text-slate-900">Tambah Paket Sumatif</h4>
              <button onClick={() => setIsAddUHOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={newUHName}
              onChange={(e) => setNewUHName(e.target.value)}
              placeholder="Contoh: Sumatif 7 (AS 7)"
              className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddUHOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newUHName.trim()) {
                    setPaketList([...paketList, newUHName.trim()]);
                    setSelectedPaket(newUHName.trim());
                    setIsAddUHOpen(false);
                    setNewUHName('');
                    showToast('Paket Sumatif berhasil ditambahkan!', 'success');
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-black"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH CP */}
      {isAddCpOpen && (
        <div className="fixed inset-0 z-[950] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-5 shadow-2xl border space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-display font-black text-sm text-slate-900">Tambah Capaian Pembelajaran (CP)</h4>
              <button onClick={() => setIsAddCpOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Judul / Kode CP:</label>
              <input
                type="text"
                value={newCpTitle}
                onChange={(e) => setNewCpTitle(e.target.value)}
                placeholder="Contoh: CP 4: Bilangan Cacah & Geometri"
                className="w-full px-3 py-2 rounded-xl border text-xs"
              />
              <label className="text-xs font-bold text-slate-700">Deskripsi Lengkap CP:</label>
              <textarea
                rows={3}
                value={newCpDesc}
                onChange={(e) => setNewCpDesc(e.target.value)}
                placeholder="Deskripsi capaian pembelajaran fase..."
                className="w-full p-2.5 rounded-xl border text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddCpOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newCpTitle.trim() && newCpDesc.trim()) {
                    const newSubj: Subject = {
                      id: `s_${activeClass.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`,
                      code: `CP-${Date.now().toString().slice(-4)}`,
                      name: selectedMapel,
                      kategori: 'umum',
                      kktp: 75,
                      kelas: activeClass,
                      description: newCpDesc.trim(),
                      tujuanPembelajaran: [newCpTitle.trim()],
                    };
                    const updated = [...classSubjects, newSubj];
                    saveStoredSubjectsForClass(activeClass, updated);
                    onUpdateSubjects?.(updated, activeClass);
                    setSelectedCpId(newSubj.id);
                    setIsAddCpOpen(false);
                    setNewCpTitle('');
                    setNewCpDesc('');
                    showToast(`Capaian Pembelajaran (CP) baru untuk [${activeClass}] berhasil disimpan dan terkoneksi!`, 'success');
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer shadow-xs"
              >
                Simpan CP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH TP */}
      {isAddTpOpen && (
        <div className="fixed inset-0 z-[950] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-5 shadow-2xl border space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-display font-black text-sm text-slate-900">Tambah Tujuan Pembelajaran (TP) - {activeClass}</h4>
              <button onClick={() => setIsAddTpOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Kode TP (e.g. TP 4):</label>
              <input
                type="text"
                value={newTpIdInput}
                onChange={(e) => setNewTpIdInput(e.target.value)}
                placeholder={`TP ${(currentCp.tpList?.length || 0) + 1}`}
                className="w-full px-3 py-2 rounded-xl border text-xs"
              />
              <label className="text-xs font-bold text-slate-700">Teks Tujuan Pembelajaran:</label>
              <textarea
                rows={3}
                value={newTpDescInput}
                onChange={(e) => setNewTpDescInput(e.target.value)}
                placeholder="Tuliskan butir tujuan pembelajaran..."
                className="w-full p-2.5 rounded-xl border text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddTpOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newTpDescInput.trim()) {
                    const tpText = newTpDescInput.trim();
                    const updated = classSubjects.map((s) => {
                      if (s.id === currentCp.id) {
                        return {
                          ...s,
                          tujuanPembelajaran: [...(s.tujuanPembelajaran || []), tpText],
                        };
                      }
                      return s;
                    });
                    saveStoredSubjectsForClass(activeClass, updated);
                    onUpdateSubjects?.(updated, activeClass);
                    const newIdx = (currentCp.tpList?.length || 0) + 1;
                    setSelectedTpId(`TP ${newIdx}`);
                    setIsAddTpOpen(false);
                    setNewTpIdInput('');
                    setNewTpDescInput('');
                    showToast(`Tujuan Pembelajaran (TP) baru untuk [${activeClass}] berhasil ditambahkan dan terkoneksi!`, 'success');
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-black cursor-pointer shadow-xs"
              >
                Simpan TP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SEDERHANA: NOTIFIKASI WAKTU UJIAN CBT BERAKHIR */}
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
                <CheckCircle className="w-8 h-8" />
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
                  ? 'Waktu Ujian CBT Berakhir'
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
                  Durasi ujian CBT telah habis. Sistem sedang mengirimkan{' '}
                  <strong>
                    {timeUpModal.answeredCount} dari {timeUpModal.totalQuestions}
                  </strong>{' '}
                  jawaban ke database secara otomatis sebelum sesi ditutup...
                </p>
              ) : (
                <>
                  <p className="leading-relaxed">
                    {timeUpModal.cloudSaved
                      ? 'Seluruh jawaban telah otomatis terkirim dan tersimpan aman ke database sekolah.'
                      : 'Seluruh jawaban telah tersimpan di sistem sekolah dan masuk antrean sinkronisasi database.'}
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
                <span>Mohon tunggu sebentar...</span>
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
    </section>
  );
};
