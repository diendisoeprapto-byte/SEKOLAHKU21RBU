import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Printer,
  FileText,
  Sparkles,
  ShieldCheck,
  Calendar,
  Layers,
  CheckSquare,
  FileSpreadsheet,
  X,
  Edit3,
  Trash2,
  ExternalLink,
  Eye,
  Users,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Search,
  Share2,
} from 'lucide-react';
import { ActiveUser, SchoolProfile, Student, Subject, Teacher } from '../../types';
import { isEndiSoepraptoUser } from '../../utils/sarahAttachments';
import { publishItemToKkgLibrary } from '../../utils/kkgFirestore';
import { sanitizeInput } from '../../utils/sanitize';
import { getLocalTodayStr, getLocalYearMonthStr } from '../../utils/dateUtils';
import {
  AttendanceRecordItem,
  CLASSES_LIST,
  getStoredAttendance,
  getStoredSubjectsForClass,
} from '../../utils/storage';
import {
  LearningAdminDoc,
  LearningDocStatus,
  LearningDocType,
  StudentRemedialRecord,
  TeachingJournal,
  cleanSchoolNpsn,
  deleteLearningDocFromFirestore,
  deleteStudentRemedialFromFirestore,
  deleteTeachingJournalFromFirestore,
  saveLearningDocToFirestore,
  saveLearningDocsBatchToFirestore,
  saveStudentRemedialToFirestore,
  saveTeachingJournalToFirestore,
  saveTeachingJournalsBatchToFirestore,
  subscribeLearningDocsFromFirestore,
  subscribeStudentRemedialsFromFirestore,
  subscribeTeachingJournalsFromFirestore,
} from '../../utils/learningAdminFirestore';

export type { LearningAdminDoc, TeachingJournal, StudentRemedialRecord };
export type LearningAdminSubTab = 'repositori' | 'jurnal' | 'remedial' | 'supervisi';

interface Props {
  activeUser: ActiveUser;
  profile: SchoolProfile;
  teachers: Teacher[];
  students: Student[];
  attendanceRecords?: Record<string, AttendanceRecordItem>;
  subjects?: Subject[];
  activeYear: string;
  activeClass: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onUpdateSchoolProfile?: (updated: Partial<SchoolProfile>) => void;
}

const DOC_TYPES: { key: LearningDocType; shortLabel: string; label: string; desc: string }[] = [
  {
    key: 'atp',
    shortLabel: 'ATP',
    label: 'ATP (Alur Tujuan Pembelajaran)',
    desc: 'Rangkaian tujuan pembelajaran terstruktur dari fase awal hingga akhir.',
  },
  {
    key: 'prota',
    shortLabel: 'Prota',
    label: 'Program Tahunan (Prota)',
    desc: 'Rencana alokasi waktu pembelajaran selama satu tahun ajaran penuh.',
  },
  {
    key: 'promes',
    shortLabel: 'Promes',
    label: 'Program Semester (Promes)',
    desc: 'Rencana kegiatan pembelajaran per semester / paruh tahun ajaran.',
  },
  {
    key: 'modul_ajar',
    shortLabel: 'Modul Ajar',
    label: 'Modul Ajar',
    desc: 'Perencanaan pelaksanaan pembelajaran lengkap dengan langkah kegiatan & asesmen.',
  },
  {
    key: 'ppi_lkpd',
    shortLabel: 'PPI & LKPD',
    label: 'PPI & LKPD Adaptif (Inklusi)',
    desc: 'Program Pembelajaran Individual & Lembar Kerja Peserta Didik khusus ABK.',
  },
];

interface ComputedAttendanceSummary {
  totalStudents: number;
  recordedCount: number;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  recorded: boolean;
  summaryText: string;
  absentNames: string[];
}

function buildAttendanceSummaryText(
  total: number,
  hadir: number,
  sakit: number,
  izin: number,
  alpa: number,
  recorded: boolean
): string {
  if (!recorded) {
    if (hadir > 0 || sakit > 0 || izin > 0 || alpa > 0) {
      const effectiveTotal = total > 0 ? total : hadir + sakit + izin + alpa;
      const absentParts: string[] = [];
      if (sakit > 0) absentParts.push(`${sakit} Sakit`);
      if (izin > 0) absentParts.push(`${izin} Izin`);
      if (alpa > 0) absentParts.push(`${alpa} Alpa`);
      if (absentParts.length === 0) {
        return `${hadir} dari ${effectiveTotal} siswa hadir (Nihil / Hadir Semua)`;
      }
      return `${hadir} dari ${effectiveTotal} siswa hadir (Tidak hadir: ${absentParts.join(', ')})`;
    }
    return 'Data presensi tanggal ini belum diinput';
  }
  const effectiveTotal = Math.max(total, hadir + sakit + izin + alpa);
  const absentParts: string[] = [];
  if (sakit > 0) absentParts.push(`${sakit} Sakit`);
  if (izin > 0) absentParts.push(`${izin} Izin`);
  if (alpa > 0) absentParts.push(`${alpa} Alpa`);
  if (absentParts.length === 0) {
    return `${hadir} dari ${effectiveTotal} siswa hadir (Nihil / Hadir Semua)`;
  }
  return `${hadir} dari ${effectiveTotal} siswa hadir (Tidak hadir: ${absentParts.join(', ')})`;
}

export const AdministrasiPembelajaranTab: React.FC<Props> = ({
  activeUser,
  profile,
  teachers,
  students,
  attendanceRecords,
  subjects,
  activeYear,
  activeClass,
  showToast,
  onUpdateSchoolProfile,
}) => {
  const [subTab, setSubTab] = useState<LearningAdminSubTab>('repositori');
  const npsnKey = cleanSchoolNpsn(profile?.npsn);
  const defaultYear = activeYear || '2026/2027';
  const defaultClass = activeClass || CLASSES_LIST[0] || 'Kelas 6A';

  // Local cache & seeded marker keys (per NPSN tenant)
  const DOCS_KEY = `serbu21_learning_docs_${npsnKey}`;
  const DOCS_SEEDED_KEY = `serbu21_learning_docs_seeded_${npsnKey}`;
  const JOURNALS_KEY = `serbu21_learning_journals_${npsnKey}`;
  const JOURNALS_SEEDED_KEY = `serbu21_learning_journals_seeded_${npsnKey}`;
  const REMEDIAL_KEY = `serbu21_learning_remedial_${npsnKey}`;

  const [docs, setDocs] = useState<LearningAdminDoc[]>(() => {
    try {
      const cached = localStorage.getItem(DOCS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
      if (localStorage.getItem(DOCS_SEEDED_KEY) === 'true') {
        return [];
      }
    } catch {
      // ignore storage errors
    }
    return [
      {
        id: 'doc_init_1',
        teacherId: 't_endi',
        teacherName: 'Endi Soeprapto, S.Pd., Gr.',
        academicYear: defaultYear,
        kelas: defaultClass,
        type: 'modul_ajar',
        title: 'Modul Ajar Bahasa Indonesia - Teks Eksplanasi & Pesan Moral',
        driveUrl: 'https://docs.google.com/document/d/example/edit',
        status: 'Disetujui & Terverifikasi (QR)',
        supervisorNote: 'Sangat baik, metode kontekstual sudah sesuai dengan Kurikulum Merdeka.',
        verifiedAt: '2026-11-20',
        updatedAt: '2026-11-20',
      },
      {
        id: 'doc_init_2',
        teacherId: 't_endi',
        teacherName: 'Endi Soeprapto, S.Pd., Gr.',
        academicYear: defaultYear,
        kelas: defaultClass,
        type: 'atp',
        title: 'ATP Bahasa Indonesia Fase C Kelas 6',
        driveUrl: 'https://docs.google.com/document/d/example2/edit',
        status: 'Menunggu Verifikasi',
        updatedAt: '2026-11-25',
      },
    ];
  });

  const [journals, setJournals] = useState<TeachingJournal[]>(() => {
    try {
      const cached = localStorage.getItem(JOURNALS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
      if (localStorage.getItem(JOURNALS_SEEDED_KEY) === 'true') {
        return [];
      }
    } catch {
      // ignore storage errors
    }
    return [
      {
        id: 'jrn_init_1',
        teacherId: 't_endi',
        teacherName: 'Endi Soeprapto, S.Pd., Gr.',
        academicYear: defaultYear,
        kelas: defaultClass,
        date: getLocalTodayStr(),
        mapel: 'Bahasa Indonesia',
        tpCode: 'TP 1',
        tpText: 'Mengidentifikasi informasi penting dalam teks eksplanasi ilmiah.',
        objective: 'Mengidentifikasi informasi penting dalam teks eksplanasi ilmiah.',
        achievement: 'Tercapai',
        reflection: 'Sebagian besar siswa aktif berdiskusi kelompok.',
        createdAt: new Date().toISOString(),
      },
    ];
  });

  const [remedials, setRemedials] = useState<StudentRemedialRecord[]>(() => {
    try {
      const cached = localStorage.getItem(REMEDIAL_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  // Real-time Firestore subscriptions isolated per schools/{npsn}
  useEffect(() => {
    let docsInitialSeedTried = false;
    const unsubDocs = subscribeLearningDocsFromFirestore(npsnKey, (remoteDocs, meta) => {
      if (remoteDocs.length > 0) {
        localStorage.setItem(DOCS_SEEDED_KEY, 'true');
        setDocs(remoteDocs);
        return;
      }
      if (!meta.fromCache && !meta.hasPendingWrites) {
        const alreadySeeded = localStorage.getItem(DOCS_SEEDED_KEY) === 'true';
        if (alreadySeeded) {
          setDocs([]);
        } else if (!docsInitialSeedTried) {
          docsInitialSeedTried = true;
          localStorage.setItem(DOCS_SEEDED_KEY, 'true');
          setDocs((current) => {
            if (current.length > 0) {
              void saveLearningDocsBatchToFirestore(npsnKey, current).catch((err) =>
                console.warn('Gagal inisialisasi perangkat ajar awal ke Firestore:', err)
              );
            }
            return current;
          });
        }
      }
    });

    let journalsInitialSeedTried = false;
    const unsubJournals = subscribeTeachingJournalsFromFirestore(npsnKey, (remoteJournals, meta) => {
      if (remoteJournals.length > 0) {
        localStorage.setItem(JOURNALS_SEEDED_KEY, 'true');
        setJournals(remoteJournals);
        return;
      }
      if (!meta.fromCache && !meta.hasPendingWrites) {
        const alreadySeeded = localStorage.getItem(JOURNALS_SEEDED_KEY) === 'true';
        if (alreadySeeded) {
          setJournals([]);
        } else if (!journalsInitialSeedTried) {
          journalsInitialSeedTried = true;
          localStorage.setItem(JOURNALS_SEEDED_KEY, 'true');
          setJournals((current) => {
            if (current.length > 0) {
              void saveTeachingJournalsBatchToFirestore(npsnKey, current).catch((err) =>
                console.warn('Gagal inisialisasi jurnal awal ke Firestore:', err)
              );
            }
            return current;
          });
        }
      }
    });

    const unsubRemedials = subscribeStudentRemedialsFromFirestore(npsnKey, (remoteRemedials, meta) => {
      if (remoteRemedials.length > 0 || (!meta.fromCache && !meta.hasPendingWrites)) {
        setRemedials(remoteRemedials);
      }
    });

    return () => {
      unsubDocs();
      unsubJournals();
      unsubRemedials();
    };
  }, [npsnKey, DOCS_SEEDED_KEY, JOURNALS_SEEDED_KEY]);

  // Sync to localStorage cache
  useEffect(() => {
    try {
      localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
    } catch {
      // ignore storage errors
    }
  }, [docs, DOCS_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(JOURNALS_KEY, JSON.stringify(journals));
    } catch {
      // ignore storage errors
    }
  }, [journals, JOURNALS_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(REMEDIAL_KEY, JSON.stringify(remedials));
    } catch {
      // ignore storage errors
    }
  }, [remedials, REMEDIAL_KEY]);

  // Role & permissions
  const currentTeacherId = activeUser.username || activeUser.name || 't_current';
  const currentTeacherName = activeUser.name || activeUser.username || 'Guru Pengajar';
  const isEndi =
    isEndiSoepraptoUser(activeUser) ||
    currentTeacherName.toLowerCase().includes('endi soeprapto') ||
    (activeUser.username || '').toLowerCase().includes('endi');
  const isAdmin = activeUser.role === 'admin';
  const isHeadmaster =
    (activeUser.detail || '').toLowerCase().includes('kepala sekolah') ||
    currentTeacherName.toLowerCase().includes('kepala sekolah');
  const canSupervise = isAdmin || isHeadmaster || isEndi;

  const canManageDoc = (item: LearningAdminDoc) =>
    isAdmin ||
    isHeadmaster ||
    isEndi ||
    item.teacherId === currentTeacherId ||
    item.teacherName === currentTeacherName;

  // Scoped by active academic year
  const yearFilteredDocs = useMemo(() => {
    return docs.filter((d) => !d.academicYear || !activeYear || d.academicYear === activeYear);
  }, [docs, activeYear]);

  const yearFilteredJournals = useMemo(() => {
    return journals.filter((j) => !j.academicYear || !activeYear || j.academicYear === activeYear);
  }, [journals, activeYear]);

  const yearFilteredRemedials = useMemo(() => {
    return remedials.filter((r) => !r.academicYear || !activeYear || r.academicYear === activeYear);
  }, [remedials, activeYear]);

  // Repositori filters & Modals state
  const [docFilterType, setDocFilterType] = useState<string>('all');
  const [docSearchQuery, setDocSearchQuery] = useState<string>('');
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docForm, setDocForm] = useState({
    type: 'modul_ajar' as LearningDocType,
    title: '',
    driveUrl: '',
    contentDraft: '',
    kelas: defaultClass,
    academicYear: defaultYear,
  });
  const [shareToKkg, setShareToKkg] = useState(false);
  const [sharingKkgDocId, setSharingKkgDocId] = useState<string | null>(null);

  const [previewDoc, setPreviewDoc] = useState<LearningAdminDoc | null>(null);
  const [deletingDocTarget, setDeletingDocTarget] = useState<LearningAdminDoc | null>(null);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);
  const [deletingJournalTarget, setDeletingJournalTarget] = useState<TeachingJournal | null>(null);

  // Journal Modal & Live Attendance + TP state
  const [showAddJournalModal, setShowAddJournalModal] = useState(false);
  const [journalForm, setJournalForm] = useState({
    date: getLocalTodayStr(),
    kelas: defaultClass,
    mapel: 'Bahasa Indonesia',
    tpSelection: '', // 'TP 1', 'TP 2', '__custom__', or ''
    tpCode: '',
    tpText: '',
    objective: '',
    achievement: 'Tercapai' as TeachingJournal['achievement'],
    reflection: '',
    academicYear: defaultYear,
    manualPresent: 0,
    manualSakit: 0,
    manualIzin: 0,
    manualAlpa: 0,
    useManualAttendance: false,
    manualSummaryNote: '',
  });
  const [attendanceRefreshTick, setAttendanceRefreshTick] = useState(0);

  // Subjects available for the selected class in Journal modal
  const journalClassSubjects = useMemo(() => {
    return getStoredSubjectsForClass(journalForm.kelas || defaultClass);
  }, [journalForm.kelas, defaultClass, subjects]);

  const selectedJournalSubject = useMemo(() => {
    return (
      journalClassSubjects.find(
        (s) => s.name.toLowerCase() === (journalForm.mapel || '').toLowerCase()
      ) || journalClassSubjects[0]
    );
  }, [journalClassSubjects, journalForm.mapel]);

  const availableTpList = useMemo(() => {
    return (selectedJournalSubject?.tujuanPembelajaran || []).filter((tp) => String(tp || '').trim().length > 0);
  }, [selectedJournalSubject]);

  // Compute live student attendance summary for selected date & class
  const computedAttendance: ComputedAttendanceSummary = useMemo(() => {
    const targetDate = journalForm.date || getLocalTodayStr();
    const targetClass = journalForm.kelas || defaultClass;

    const classStudentsAll = students.filter((s) => s.kelas === targetClass);
    const classStudentsByYear = activeYear
      ? classStudentsAll.filter((s) => !s.tahunPelajaran || s.tahunPelajaran === activeYear)
      : classStudentsAll;
    const targetStudents = classStudentsByYear.length > 0 ? classStudentsByYear : classStudentsAll;

    const storedMap = getStoredAttendance();
    const mergedRecords: Record<string, AttendanceRecordItem> = {
      ...storedMap,
      ...(attendanceRecords || {}),
    };

    const studentIdsSet = new Set(targetStudents.map((s) => s.id));
    let hadir = 0;
    let sakit = 0;
    let izin = 0;
    let alpa = 0;
    let recordedCount = 0;
    const absentNames: string[] = [];

    if (targetStudents.length > 0) {
      targetStudents.forEach((student) => {
        const directRec = mergedRecords[`${targetDate}_${student.id}`];
        const rec =
          directRec ||
          Object.values(mergedRecords).find(
            (r) => r && r.date === targetDate && r.studentId === student.id
          );
        if (rec) {
          recordedCount += 1;
          if (rec.status === 'H') hadir += 1;
          else if (rec.status === 'S') {
            sakit += 1;
            absentNames.push(`${student.nama} (S)`);
          } else if (rec.status === 'I') {
            izin += 1;
            absentNames.push(`${student.nama} (I)`);
          } else if (rec.status === 'A') {
            alpa += 1;
            absentNames.push(`${student.nama} (A)`);
          }
        }
      });
    } else {
      Object.values(mergedRecords).forEach((rec) => {
        if (rec && rec.date === targetDate && (studentIdsSet.size === 0 || studentIdsSet.has(rec.studentId))) {
          recordedCount += 1;
          if (rec.status === 'H') hadir += 1;
          else if (rec.status === 'S') sakit += 1;
          else if (rec.status === 'I') izin += 1;
          else if (rec.status === 'A') alpa += 1;
        }
      });
    }

    const totalStudents = targetStudents.length > 0 ? targetStudents.length : recordedCount;
    const recorded = recordedCount > 0;
    const summaryText = buildAttendanceSummaryText(totalStudents, hadir, sakit, izin, alpa, recorded);

    return {
      totalStudents,
      recordedCount,
      hadir,
      sakit,
      izin,
      alpa,
      recorded,
      summaryText,
      absentNames,
    };
  }, [
    journalForm.date,
    journalForm.kelas,
    defaultClass,
    students,
    activeYear,
    attendanceRecords,
    attendanceRefreshTick,
  ]);

  // Keep manual fallback fields pre-populated when date/class changes & not yet manually edited
  useEffect(() => {
    if (!showAddJournalModal) return;
    setJournalForm((prev) => {
      if (prev.useManualAttendance) return prev;
      return {
        ...prev,
        manualPresent: computedAttendance.recorded ? computedAttendance.hadir : computedAttendance.totalStudents,
        manualSakit: computedAttendance.recorded ? computedAttendance.sakit : 0,
        manualIzin: computedAttendance.recorded ? computedAttendance.izin : 0,
        manualAlpa: computedAttendance.recorded ? computedAttendance.alpa : 0,
      };
    });
  }, [
    showAddJournalModal,
    computedAttendance.recorded,
    computedAttendance.hadir,
    computedAttendance.sakit,
    computedAttendance.izin,
    computedAttendance.alpa,
    computedAttendance.totalStudents,
  ]);

  // Remedial Modal
  const [showAddRemedialModal, setShowAddRemedialModal] = useState(false);
  const [remedialForm, setRemedialForm] = useState({
    studentName: '',
    subject: 'Bahasa Indonesia',
    type: 'Remedial' as StudentRemedialRecord['type'],
    description: '',
    actionTaken: '',
    date: getLocalTodayStr(),
    kelas: defaultClass,
    academicYear: defaultYear,
  });

  // Supervisor modal
  const [reviewingDoc, setReviewingDoc] = useState<LearningAdminDoc | null>(null);
  const [supervisorNoteInput, setSupervisorNoteInput] = useState('');

  // Journal filter & download state
  const [journalFilterTeacher, setJournalFilterTeacher] = useState<string>('all');
  const [journalFilterPeriod, setJournalFilterPeriod] = useState<string>('all');
  const [journalFilterMonth, setJournalFilterMonth] = useState<string>(getLocalYearMonthStr());

  // Print view state for journal
  const [isPrintingJournal, setIsPrintingJournal] = useState(false);

  // Filtered Repositori Docs
  const visibleDocs = useMemo(() => {
    return yearFilteredDocs.filter((d) => {
      if (docFilterType !== 'all' && d.type !== docFilterType) return false;
      if (docSearchQuery.trim()) {
        const q = docSearchQuery.trim().toLowerCase();
        const match =
          (d.title || '').toLowerCase().includes(q) ||
          (d.teacherName || '').toLowerCase().includes(q) ||
          (d.kelas || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [yearFilteredDocs, docFilterType, docSearchQuery]);

  // Handle toggle public learning admin
  const handleTogglePublic = () => {
    const nextVal = !profile?.isLearningAdminPublic;
    if (onUpdateSchoolProfile) {
      onUpdateSchoolProfile({ isLearningAdminPublic: nextVal });
      showToast(
        nextVal
          ? 'Menu Administrasi Pembelajaran kini diaktifkan untuk semua guru.'
          : 'Menu Administrasi Pembelajaran kini dibatasi khusus.',
        'success'
      );
    }
  };

  // Open Create/Edit Document Modal
  const openCreateDocModal = () => {
    setEditingDocId(null);
    setDocForm({
      type: 'modul_ajar',
      title: '',
      driveUrl: '',
      contentDraft: '',
      kelas: defaultClass,
      academicYear: defaultYear,
    });
    setShareToKkg(false);
    setShowAddDocModal(true);
  };

  const openEditDocModal = (item: LearningAdminDoc) => {
    setEditingDocId(item.id);
    setDocForm({
      type: item.type,
      title: item.title,
      driveUrl: item.driveUrl,
      contentDraft: item.contentDraft || '',
      kelas: item.kelas || defaultClass,
      academicYear: item.academicYear || defaultYear,
    });
    setShareToKkg(false);
    setShowAddDocModal(true);
  };

  const handleShareDocToKkg = async (item: LearningAdminDoc) => {
    setSharingKkgDocId(item.id);
    try {
      await publishItemToKkgLibrary({
        npsn: profile.npsn,
        schoolName: profile.name,
        authorName: item.teacherName || currentTeacherName,
        type: 'modul_ajar',
        title: sanitizeInput(item.title, 180),
        mapel: 'Pembelajaran Terpadu',
        kelas: sanitizeInput(item.kelas || defaultClass, 40),
        topik: sanitizeInput((item.contentDraft || item.title).slice(0, 240), 250),
        contentData: {
          driveUrl: item.driveUrl,
          contentDraft: item.contentDraft || '',
          academicYear: item.academicYear,
        },
      });
      showToast(`"${item.title}" berhasil dibagikan ke Pustaka KKG Lintas Sekolah!`, 'success');
    } catch (err: any) {
      showToast('Gagal membagikan ke Pustaka KKG: ' + (err?.message || err), 'error');
    } finally {
      setSharingKkgDocId(null);
    }
  };

  // Save Document (Create or Edit -> Firestore)
  const handleSaveDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.title.trim()) {
      showToast('Judul dokumen wajib diisi!', 'error');
      return;
    }
    const existingDoc = editingDocId ? docs.find((d) => d.id === editingDocId) : undefined;
    const savedDoc: LearningAdminDoc = {
      id: existingDoc?.id || `doc_${Date.now()}`,
      teacherId: existingDoc?.teacherId || currentTeacherId,
      teacherName: existingDoc?.teacherName || currentTeacherName,
      academicYear: docForm.academicYear || defaultYear,
      kelas: docForm.kelas || defaultClass,
      type: docForm.type,
      title: docForm.title.trim(),
      driveUrl: docForm.driveUrl.trim() || 'https://docs.google.com/',
      contentDraft: docForm.contentDraft.trim() || existingDoc?.contentDraft,
      status: existingDoc ? existingDoc.status : 'Menunggu Verifikasi',
      supervisorNote: existingDoc?.supervisorNote,
      verifiedAt: existingDoc?.verifiedAt,
      updatedAt: getLocalTodayStr(),
    };

    localStorage.setItem(DOCS_SEEDED_KEY, 'true');
    setDocs((prev) => {
      if (editingDocId) {
        return prev.map((d) => (d.id === editingDocId ? savedDoc : d));
      }
      return [savedDoc, ...prev];
    });
    const shouldShareKkg = savedDoc.type === 'modul_ajar' && shareToKkg;
    setShowAddDocModal(false);
    setEditingDocId(null);
    setShareToKkg(false);

    try {
      await saveLearningDocToFirestore(npsnKey, savedDoc);
      if (shouldShareKkg) {
        await publishItemToKkgLibrary({
          npsn: profile.npsn,
          schoolName: profile.name,
          authorName: savedDoc.teacherName || currentTeacherName,
          type: 'modul_ajar',
          title: sanitizeInput(savedDoc.title, 180),
          mapel: 'Pembelajaran Terpadu',
          kelas: sanitizeInput(savedDoc.kelas || defaultClass, 40),
          topik: sanitizeInput((savedDoc.contentDraft || savedDoc.title).slice(0, 240), 250),
          contentData: {
            driveUrl: savedDoc.driveUrl,
            contentDraft: savedDoc.contentDraft || '',
            academicYear: savedDoc.academicYear,
          },
        });
      }
      showToast(
        shouldShareKkg
          ? 'Perangkat ajar disimpan & langsung dibagikan ke Pustaka KKG Lintas Sekolah!'
          : editingDocId
          ? 'Perangkat ajar berhasil diperbarui!'
          : 'Perangkat ajar berhasil diunggah & menunggu verifikasi kepala sekolah!',
        'success'
      );
    } catch (err) {
      console.error('Gagal menyimpan perangkat ajar ke Firestore:', err);
      showToast('Tersimpan lokal, namun sinkronisasi cloud gagal. Periksa koneksi internet.', 'error');
    }
  };

  // Delete Document Confirmed -> Firestore + real-time update
  const handleConfirmDeleteDoc = async () => {
    if (!deletingDocTarget) return;
    const target = deletingDocTarget;
    setIsDeletingDoc(true);
    try {
      localStorage.setItem(DOCS_SEEDED_KEY, 'true');
      setDocs((prev) => prev.filter((d) => d.id !== target.id));
      if (reviewingDoc?.id === target.id) setReviewingDoc(null);
      if (previewDoc?.id === target.id) setPreviewDoc(null);

      await deleteLearningDocFromFirestore(npsnKey, target.id);

      setDeletingDocTarget(null);
      showToast(
        target.type === 'modul_ajar' ? 'Modul Ajar berhasil dihapus!' : 'Perangkat ajar berhasil dihapus!',
        'success'
      );
    } catch (err) {
      console.error('Gagal menghapus perangkat ajar dari Firestore:', err);
      showToast('Gagal menghapus perangkat ajar dari server. Silakan coba lagi.', 'error');
    } finally {
      setIsDeletingDoc(false);
    }
  };

  // Generate AI Draft for Modul Ajar
  const handleGenerateAiSarahDraft = () => {
    setDocForm((prev) => ({
      ...prev,
      type: 'modul_ajar',
      title: `Modul Ajar Berdiferensiasi & Kontekstual (${prev.kelas}) - Kurikulum Merdeka`,
      driveUrl: 'https://docs.google.com/document/d/ai_sarah_generated_draft/edit',
      contentDraft:
        'Identitas Modul: Kurikulum Merdeka\nTujuan Pembelajaran: Siswa mampu menganalisis konsep inti secara kontekstual.\nLangkah Kegiatan: Pendahuluan (Pemantik), Inti (Eksplorasi Berdiferensiasi), Penutup (Refleksi & Asesmen Formatif).',
    }));
    showToast('Asisten AI SARAH berhasil membuatkan draf Modul Ajar adaptif!', 'success');
  };

  // Open Journal Modal with synced defaults
  const handleOpenAddJournalModal = () => {
    const initialSubjects = getStoredSubjectsForClass(defaultClass);
    const initialMapel = initialSubjects[0]?.name || 'Bahasa Indonesia';
    setAttendanceRefreshTick((t) => t + 1);
    setJournalForm({
      date: getLocalTodayStr(),
      kelas: defaultClass,
      mapel: initialMapel,
      tpSelection: '',
      tpCode: '',
      tpText: '',
      objective: '',
      achievement: 'Tercapai',
      reflection: '',
      academicYear: defaultYear,
      manualPresent: 0,
      manualSakit: 0,
      manualIzin: 0,
      manualAlpa: 0,
      useManualAttendance: false,
      manualSummaryNote: '',
    });
    setShowAddJournalModal(true);
  };

  const handleJournalClassChange = (newKelas: string) => {
    const classSubjects = getStoredSubjectsForClass(newKelas);
    const hasCurrentMapel = classSubjects.some(
      (s) => s.name.toLowerCase() === (journalForm.mapel || '').toLowerCase()
    );
    const nextMapel = hasCurrentMapel ? journalForm.mapel : classSubjects[0]?.name || 'Bahasa Indonesia';
    setJournalForm((prev) => ({
      ...prev,
      kelas: newKelas,
      mapel: nextMapel,
      tpSelection: '',
      tpCode: '',
      tpText: '',
      useManualAttendance: false,
    }));
  };

  const handleJournalMapelChange = (newMapel: string) => {
    setJournalForm((prev) => ({
      ...prev,
      mapel: newMapel,
      tpSelection: '',
      tpCode: '',
      tpText: '',
    }));
  };

  const handleJournalTpSelectChange = (val: string) => {
    if (val === '__custom__') {
      setJournalForm((prev) => ({
        ...prev,
        tpSelection: '__custom__',
        tpCode: 'Kustom',
        tpText: '',
      }));
      return;
    }
    if (!val) {
      setJournalForm((prev) => ({
        ...prev,
        tpSelection: '',
        tpCode: '',
        tpText: '',
      }));
      return;
    }
    const idx = parseInt(val.replace('TP ', ''), 10) - 1;
    const chosenText = availableTpList[idx] || '';
    setJournalForm((prev) => ({
      ...prev,
      tpSelection: val,
      tpCode: val,
      tpText: chosenText,
      objective: chosenText || prev.objective,
    }));
  };

  // Save Journal -> Firestore
  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalForm.objective.trim()) {
      showToast('Tujuan Pembelajaran (TP) / Materi pokok wajib diisi!', 'error');
      return;
    }

    const useManual = journalForm.useManualAttendance || !computedAttendance.recorded;
    const present = useManual ? Math.max(0, Number(journalForm.manualPresent) || 0) : computedAttendance.hadir;
    const sakit = useManual ? Math.max(0, Number(journalForm.manualSakit) || 0) : computedAttendance.sakit;
    const izin = useManual ? Math.max(0, Number(journalForm.manualIzin) || 0) : computedAttendance.izin;
    const alpa = useManual ? Math.max(0, Number(journalForm.manualAlpa) || 0) : computedAttendance.alpa;
    const total = Math.max(computedAttendance.totalStudents, present + sakit + izin + alpa);

    let summaryText = computedAttendance.summaryText;
    if (useManual) {
      if (journalForm.manualSummaryNote.trim()) {
        summaryText = journalForm.manualSummaryNote.trim();
      } else if (present === 0 && sakit === 0 && izin === 0 && alpa === 0 && !computedAttendance.recorded) {
        summaryText = 'Data presensi tanggal ini belum diinput';
      } else {
        summaryText = buildAttendanceSummaryText(total, present, sakit, izin, alpa, false);
      }
    }

    const newJournal: TeachingJournal = {
      id: `jrn_${Date.now()}`,
      teacherId: currentTeacherId,
      teacherName: currentTeacherName,
      academicYear: journalForm.academicYear || defaultYear,
      kelas: journalForm.kelas || defaultClass,
      date: journalForm.date,
      mapel: journalForm.mapel,
      tpCode: journalForm.tpCode || (journalForm.tpSelection === '__custom__' ? 'Kustom' : undefined),
      tpText: journalForm.tpText || undefined,
      objective: journalForm.objective.trim(),
      attendanceTotal: total,
      attendancePresent: present,
      attendanceSakit: sakit,
      attendanceIzin: izin,
      attendanceAlpa: alpa,
      attendanceSummary: summaryText,
      attendanceRecorded: computedAttendance.recorded || present > 0 || sakit > 0 || izin > 0 || alpa > 0,
      achievement: journalForm.achievement,
      reflection: journalForm.reflection.trim(),
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(JOURNALS_SEEDED_KEY, 'true');
    setJournals((prev) => [newJournal, ...prev]);
    setShowAddJournalModal(false);

    try {
      await saveTeachingJournalToFirestore(npsnKey, newJournal);
      showToast('Jurnal mengajar harian berhasil disimpan!', 'success');
    } catch (err) {
      console.error('Gagal menyimpan jurnal mengajar ke Firestore:', err);
      showToast('Jurnal tersimpan lokal, namun sinkronisasi cloud gagal.', 'error');
    }
  };

  const handleConfirmDeleteJournal = async () => {
    if (!deletingJournalTarget) return;
    const target = deletingJournalTarget;
    localStorage.setItem(JOURNALS_SEEDED_KEY, 'true');
    setJournals((prev) => prev.filter((j) => j.id !== target.id));
    setDeletingJournalTarget(null);
    try {
      await deleteTeachingJournalFromFirestore(npsnKey, target.id);
      showToast('Catatan jurnal mengajar berhasil dihapus!', 'success');
    } catch (err) {
      console.error('Gagal menghapus jurnal mengajar dari Firestore:', err);
      showToast('Gagal menghapus jurnal dari server.', 'error');
    }
  };

  // Save Remedial -> Firestore
  const handleSaveRemedial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remedialForm.studentName.trim() || !remedialForm.description.trim()) {
      showToast('Nama siswa dan keterangan wajib diisi!', 'error');
      return;
    }
    const item: StudentRemedialRecord = {
      id: `rem_${Date.now()}`,
      teacherId: currentTeacherId,
      teacherName: currentTeacherName,
      academicYear: remedialForm.academicYear || defaultYear,
      kelas: remedialForm.kelas || defaultClass,
      studentName: remedialForm.studentName.trim(),
      subject: remedialForm.subject,
      type: remedialForm.type,
      description: remedialForm.description.trim(),
      actionTaken: remedialForm.actionTaken.trim(),
      date: remedialForm.date,
      createdAt: new Date().toISOString(),
    };
    setRemedials((prev) => [item, ...prev]);
    setShowAddRemedialModal(false);
    setRemedialForm({
      studentName: '',
      subject: 'Bahasa Indonesia',
      type: 'Remedial',
      description: '',
      actionTaken: '',
      date: getLocalTodayStr(),
      kelas: defaultClass,
      academicYear: defaultYear,
    });
    try {
      await saveStudentRemedialToFirestore(npsnKey, item);
      showToast('Catatan tindak lanjut berhasil dicatat!', 'success');
    } catch (err) {
      console.error('Gagal menyimpan catatan remedial ke Firestore:', err);
      showToast('Catatan tersimpan lokal, namun sinkronisasi cloud gagal.', 'error');
    }
  };

  const handleDeleteRemedial = async (id: string) => {
    setRemedials((prev) => prev.filter((r) => r.id !== id));
    try {
      await deleteStudentRemedialFromFirestore(npsnKey, id);
      showToast('Catatan tindak lanjut berhasil dihapus.', 'success');
    } catch (err) {
      console.error('Gagal menghapus catatan remedial:', err);
    }
  };

  // Supervisor verification action -> Firestore
  const handleVerifyDoc = async (docId: string, status: LearningDocStatus) => {
    const existing = docs.find((d) => d.id === docId);
    if (!existing) return;
    const updatedDoc: LearningAdminDoc = {
      ...existing,
      status,
      supervisorNote: supervisorNoteInput.trim() || existing.supervisorNote,
      verifiedAt: getLocalTodayStr(),
      updatedAt: getLocalTodayStr(),
    };

    setDocs((prev) => prev.map((d) => (d.id === docId ? updatedDoc : d)));
    setReviewingDoc(null);
    setSupervisorNoteInput('');

    try {
      await saveLearningDocToFirestore(npsnKey, updatedDoc);
      showToast(`Dokumen berhasil diperbarui statusnya menjadi: ${status}`, 'success');
    } catch (err) {
      console.error('Gagal menyimpan verifikasi ke Firestore:', err);
      showToast('Status diperbarui lokal, gagal sinkronisasi cloud.', 'error');
    }
  };

  // Filtered journals for export / view
  const filteredJournals = useMemo(() => {
    let result = yearFilteredJournals;
    if (!canSupervise) {
      result = result.filter(
        (j) => j.teacherId === currentTeacherId || j.teacherName === currentTeacherName
      );
    } else if (journalFilterTeacher !== 'all') {
      result = result.filter(
        (j) => j.teacherName === journalFilterTeacher || j.teacherId === journalFilterTeacher
      );
    }

    if (journalFilterPeriod === 'month_current' && journalFilterMonth) {
      result = result.filter((j) => (j.date || '').startsWith(journalFilterMonth));
    }

    return [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [
    yearFilteredJournals,
    canSupervise,
    currentTeacherId,
    currentTeacherName,
    journalFilterTeacher,
    journalFilterPeriod,
    journalFilterMonth,
  ]);

  // Helper format attendance badge text for table/print/csv
  const formatJournalAttendanceDisplay = (j: TeachingJournal): string => {
    if (j.attendanceSummary && j.attendanceSummary.trim()) {
      return j.attendanceSummary;
    }
    if (typeof j.attendancePresent === 'number' && typeof j.attendanceTotal === 'number') {
      return buildAttendanceSummaryText(
        j.attendanceTotal,
        j.attendancePresent,
        j.attendanceSakit || 0,
        j.attendanceIzin || 0,
        j.attendanceAlpa || 0,
        Boolean(j.attendanceRecorded)
      );
    }
    return 'Data presensi belum tercatat';
  };

  // Teacher completeness breakdown for Kepsek Supervision Dashboard
  const teacherSupervisionStats = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        atp: number;
        prota: number;
        promes: number;
        modul_ajar: number;
        ppi_lkpd: number;
        verified: number;
        totalDocs: number;
        totalJournals: number;
      }
    >();

    const ensureTeacher = (name: string) => {
      const key = name.trim();
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          atp: 0,
          prota: 0,
          promes: 0,
          modul_ajar: 0,
          ppi_lkpd: 0,
          verified: 0,
          totalDocs: 0,
          totalJournals: 0,
        });
      }
      return map.get(key)!;
    };

    teachers.forEach((t) => {
      if (t.nama && !t.penugasan?.toLowerCase().includes('kepala sekolah')) {
        ensureTeacher(t.nama);
      }
    });

    yearFilteredDocs.forEach((d) => {
      const entry = ensureTeacher(d.teacherName || 'Guru');
      entry.totalDocs += 1;
      if (d.type === 'atp') entry.atp += 1;
      if (d.type === 'prota') entry.prota += 1;
      if (d.type === 'promes') entry.promes += 1;
      if (d.type === 'modul_ajar') entry.modul_ajar += 1;
      if (d.type === 'ppi_lkpd') entry.ppi_lkpd += 1;
      if (d.status.includes('Disetujui')) entry.verified += 1;
    });

    yearFilteredJournals.forEach((j) => {
      const entry = ensureTeacher(j.teacherName || 'Guru');
      entry.totalJournals += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.totalDocs + b.totalJournals - (a.totalDocs + a.totalJournals));
  }, [teachers, yearFilteredDocs, yearFilteredJournals]);

  // Download Excel / CSV (including TP & Kehadiran Murid)
  const handleDownloadCsv = () => {
    if (filteredJournals.length === 0) {
      showToast('Tidak ada data jurnal mengajar untuk diexport.', 'error');
      return;
    }
    const headers = [
      'No',
      'Hari / Tanggal',
      'Nama Guru',
      'Kelas',
      'Mata Pelajaran',
      'Kode TP',
      'Tujuan Pembelajaran (TP) / Materi Pokok',
      'Kehadiran Murid',
      'Ketercapaian',
      'Catatan Refleksi',
    ];
    const rows = filteredJournals.map((j, idx) => [
      idx + 1,
      j.date,
      `"${(j.teacherName || '').replace(/"/g, '""')}"`,
      `"${(j.kelas || '').replace(/"/g, '""')}"`,
      `"${(j.mapel || '').replace(/"/g, '""')}"`,
      `"${(j.tpCode || '-').replace(/"/g, '""')}"`,
      `"${(j.objective || '').replace(/"/g, '""')}"`,
      `"${formatJournalAttendanceDisplay(j).replace(/"/g, '""')}"`,
      j.achievement,
      `"${(j.reflection || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Jurnal_Mengajar_${
      journalFilterTeacher !== 'all' ? journalFilterTeacher.replace(/\s+/g, '_') : 'SemuaGuru'
    }_${defaultYear.replace('/', '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('File laporan jurnal mengajar (.csv) berhasil diunduh!', 'success');
  };

  // Remedial class subjects & students
  const remedialClassSubjects = useMemo(
    () => getStoredSubjectsForClass(remedialForm.kelas || defaultClass),
    [remedialForm.kelas, defaultClass, subjects]
  );
  const remedialClassStudents = useMemo(
    () => students.filter((s) => s.kelas === (remedialForm.kelas || defaultClass)),
    [students, remedialForm.kelas, defaultClass]
  );

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-700 via-rose-600 to-amber-600 rounded-[2.5rem] p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-white/10 rounded-full blur-3xl pointer-events-none transform translate-x-20 -translate-y-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold tracking-wide">
              <BookOpen className="w-4 h-4 text-amber-300" />
              <span>Modul Resmi SERBU 21 • Tahun Ajaran {defaultYear}</span>
            </div>
            <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight">
              Administrasi Pembelajaran & Supervisi
            </h1>
            <p className="text-rose-100 text-xs sm:text-sm max-w-2xl leading-relaxed">
              Repositori Perangkat Ajar (ATP, Prota, Promes, Modul Ajar, PPI), Jurnal Mengajar Harian (Agenda Kelas) terintegrasi Kehadiran Murid & Tujuan Pembelajaran (TP) lengkap dengan laporan siap cetak ber-QR Code, serta dasbor pemantauan Kepala Sekolah.
            </p>
          </div>

          {(isAdmin || isEndi) && (
            <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-3xl flex items-center justify-between gap-4 shrink-0">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-amber-200 block">
                  Aktifkan Menu Administrasi Pembelajaran untuk Semua Guru
                </span>
                <span className="text-[11px] text-rose-100">
                  {profile?.isLearningAdminPublic
                    ? 'Terbuka untuk seluruh guru di sekolah'
                    : 'Tahap awal: Khusus Endi Soeprapto & Kepala Sekolah'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(profile?.isLearningAdminPublic)}
                onClick={handleTogglePublic}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  profile?.isLearningAdminPublic ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    profile?.isLearningAdminPublic ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}
        </div>

        {/* Sub-Tabs Navigation */}
        <div className="mt-8 flex flex-wrap gap-2 border-t border-white/20 pt-6">
          <button
            onClick={() => setSubTab('repositori')}
            className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer ${
              subTab === 'repositori' ? 'bg-white text-rose-900 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>1. Repositori Perangkat Ajar</span>
          </button>
          <button
            onClick={() => setSubTab('jurnal')}
            className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer ${
              subTab === 'jurnal' ? 'bg-white text-rose-900 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>2. Jurnal Mengajar Harian</span>
          </button>
          <button
            onClick={() => setSubTab('remedial')}
            className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer ${
              subTab === 'remedial' ? 'bg-white text-rose-900 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>3. Remedial & Pembinaan</span>
          </button>
          {canSupervise && (
            <button
              onClick={() => setSubTab('supervisi')}
              className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer ${
                subTab === 'supervisi' ? 'bg-amber-400 text-slate-900 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-amber-900" />
              <span>4. Pemantauan & Supervisi Kepsek</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= TAB 1: REPOSITORI PERANGKAT AJAR ================= */}
      {subTab === 'repositori' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 bg-white p-6 rounded-3xl border border-rose-100 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-black text-lg text-slate-800">Repositori Perangkat Ajar Guru</h2>
                <p className="text-xs text-slate-500">
                  Unggah dan kelola ATP, Prota, Promes, Modul Ajar, dan PPI Inklusi Anda per tahun ajaran ({defaultYear}).
                </p>
              </div>
              <button
                onClick={openCreateDocModal}
                className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-bold text-xs flex items-center gap-2 shadow-md cursor-pointer transition active:scale-95 shrink-0"
              >
                <Plus className="w-4 h-4" /> Upload Perangkat Ajar
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setDocFilterType('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    docFilterType === 'all'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua ({yearFilteredDocs.length})
                </button>
                {DOC_TYPES.map((dt) => {
                  const count = yearFilteredDocs.filter((d) => d.type === dt.key).length;
                  return (
                    <button
                      key={dt.key}
                      type="button"
                      onClick={() => setDocFilterType(dt.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                        docFilterType === dt.key
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {dt.shortLabel} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={docSearchQuery}
                  onChange={(e) => setDocSearchQuery(e.target.value)}
                  placeholder="Cari Modul Ajar / guru..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:border-rose-400"
                />
              </div>
            </div>
          </div>

          {visibleDocs.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-2">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="font-display font-bold text-sm text-slate-700">
                Belum ada perangkat ajar yang sesuai filter
              </div>
              <p className="text-xs text-slate-500">
                Klik tombol &ldquo;Upload Perangkat Ajar&rdquo; untuk menambahkan Modul Ajar, ATP, Prota, Promes, atau PPI.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleDocs.map((item) => {
                const docTypeMeta = DOC_TYPES.find((d) => d.key === item.type);
                const allowModify = canManageDoc(item);
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 font-display font-bold text-[10px] uppercase">
                          {docTypeMeta?.label || item.type}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            item.status === 'Disetujui & Terverifikasi (QR)'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'Perlu Revisi'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <h3 className="font-display font-bold text-sm text-slate-900 line-clamp-2">{item.title}</h3>
                      <div className="text-xs text-slate-500 space-y-1">
                        <div>
                          Guru: <span className="font-semibold text-slate-700">{item.teacherName}</span>
                        </div>
                        <div>
                          Kelas / TA:{' '}
                          <span className="font-semibold text-slate-700">
                            {item.kelas} ({item.academicYear})
                          </span>
                        </div>
                        {item.supervisorNote && (
                          <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 mt-2">
                            <strong>Catatan Kepsek:</strong> {item.supervisorNote}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                          title="Pratinjau Dokumen"
                        >
                          <Eye className="w-3.5 h-3.5" /> Pratinjau
                        </button>
                        {allowModify && (
                          <button
                            type="button"
                            onClick={() => openEditDocModal(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold transition cursor-pointer"
                            title="Edit Perangkat Ajar"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                        )}
                        {allowModify && (
                          <button
                            type="button"
                            onClick={() => setDeletingDocTarget(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs font-bold transition cursor-pointer"
                            title={`Hapus ${docTypeMeta?.shortLabel || 'Dokumen'}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Hapus
                          </button>
                        )}
                        {item.type === 'modul_ajar' && (
                          <button
                            type="button"
                            disabled={sharingKkgDocId === item.id}
                            onClick={() => void handleShareDocToKkg(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                            title="Bagikan ke Pustaka KKG (Lintas Sekolah)"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>{sharingKkgDocId === item.id ? 'Membagikan...' : 'Bagikan KKG'}</span>
                          </button>
                        )}
                      </div>

                      {canSupervise && (
                        <button
                          type="button"
                          onClick={() => {
                            setReviewingDoc(item);
                            setSupervisorNoteInput(item.supervisorNote || '');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> Verifikasi
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: JURNAL MENGAJAR HARIAN ================= */}
      {subTab === 'jurnal' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-rose-100 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-black text-lg text-slate-800">
                  Jurnal Mengajar Harian (Agenda Kelas)
                </h2>
                <p className="text-xs text-slate-500">
                  Catat agenda pembelajaran harian terintegrasi Kehadiran Murid & Tujuan Pembelajaran (TP), serta unduh laporan resmi siap cetak.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleOpenAddJournalModal}
                  className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Catat Jurnal Baru
                </button>
                <button
                  onClick={() => setIsPrintingJournal(true)}
                  className="px-4 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-display font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Download / Cetak PDF
                </button>
                <button
                  onClick={handleDownloadCsv}
                  className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Download Excel (.csv)
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
              {canSupervise && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600">Pilih Guru:</label>
                  <select
                    value={journalFilterTeacher}
                    onChange={(e) => setJournalFilterTeacher(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                  >
                    <option value="all">Semua Guru</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.nama}>
                        {t.nama}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600">Periode Jurnal:</label>
                <select
                  value={journalFilterPeriod}
                  onChange={(e) => setJournalFilterPeriod(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                >
                  <option value="all">Semua Jurnal Tahun Ajaran Ini</option>
                  <option value="month_current">Filter per Bulan</option>
                </select>
              </div>

              {journalFilterPeriod === 'month_current' && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600">Bulan:</label>
                  <input
                    type="month"
                    value={journalFilterMonth}
                    onChange={(e) => setJournalFilterMonth(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Journals Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-display font-black text-xs">
                    <th className="p-4 w-12 text-center">No</th>
                    <th className="p-4">Tanggal</th>
                    <th className="p-4">Guru & Kelas</th>
                    <th className="p-4">Mata Pelajaran</th>
                    <th className="p-4">Tujuan Pembelajaran (TP)</th>
                    <th className="p-4">Kehadiran Murid</th>
                    <th className="p-4 text-center">Ketercapaian</th>
                    <th className="p-4">Refleksi & Tindak Lanjut</th>
                    <th className="p-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {filteredJournals.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        Belum ada catatan jurnal mengajar yang ditemukan.
                      </td>
                    </tr>
                  ) : (
                    filteredJournals.map((j, idx) => {
                      const attendanceText = formatJournalAttendanceDisplay(j);
                      const isUnrecorded = attendanceText.toLowerCase().includes('belum');
                      const allowDeleteJournal =
                        canSupervise ||
                        j.teacherId === currentTeacherId ||
                        j.teacherName === currentTeacherName;
                      return (
                        <tr key={j.id} className="hover:bg-slate-50/80 transition align-top">
                          <td className="p-4 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-4 font-mono font-bold text-slate-800 whitespace-nowrap">{j.date}</td>
                          <td className="p-4 font-semibold text-slate-900">
                            <div>{j.teacherName}</div>
                            <div className="text-[11px] font-normal text-slate-500">{j.kelas}</div>
                          </td>
                          <td className="p-4 font-bold text-rose-700">{j.mapel}</td>
                          <td className="p-4 font-medium text-slate-800 max-w-xs space-y-1">
                            {j.tpCode && (
                              <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px] mr-1.5">
                                {j.tpCode}
                              </span>
                            )}
                            <span>{j.objective}</span>
                          </td>
                          <td className="p-4 max-w-[210px]">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold text-[11px] ${
                                isUnrecorded
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              <Users className="w-3 h-3 shrink-0" />
                              <span>{attendanceText}</span>
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span
                              className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                                j.achievement === 'Tercapai'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : j.achievement === 'Sebagian'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {j.achievement}
                            </span>
                          </td>
                          <td className="p-4 text-slate-600 max-w-xs">{j.reflection || '-'}</td>
                          <td className="p-4 text-center">
                            {allowDeleteJournal && (
                              <button
                                type="button"
                                onClick={() => setDeletingJournalTarget(j)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Hapus Jurnal"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: REMEDIAL & PEMBINAAN ================= */}
      {subTab === 'remedial' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-rose-100 shadow-sm">
            <div>
              <h2 className="font-display font-black text-lg text-slate-800">
                Tindak Lanjut Remedial, Pengayaan & Pembinaan Siswa
              </h2>
              <p className="text-xs text-slate-500">
                Catat bimbingan khusus untuk siswa yang memerlukan perhatian akademik maupun karakter.
              </p>
            </div>
            <button
              onClick={() => setShowAddRemedialModal(true)}
              className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-bold text-xs flex items-center gap-2 shadow-md cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" /> Catat Tindak Lanjut
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-display font-black text-xs">
                    <th className="p-4 w-12 text-center">No</th>
                    <th className="p-4">Tanggal</th>
                    <th className="p-4">Nama Siswa & Kelas</th>
                    <th className="p-4">Jenis Layanan</th>
                    <th className="p-4">Mata Pelajaran</th>
                    <th className="p-4">Kendala / Deskripsi</th>
                    <th className="p-4">Tindakan / Solusi</th>
                    <th className="p-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {yearFilteredRemedials.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        Belum ada catatan remedial atau pembinaan siswa.
                      </td>
                    </tr>
                  ) : (
                    yearFilteredRemedials.map((r, idx) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-4 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="p-4 font-mono font-bold text-slate-800">{r.date}</td>
                        <td className="p-4 font-bold text-slate-900">
                          {r.studentName}{' '}
                          <span className="text-[11px] font-normal text-slate-500">({r.kelas})</span>
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-rose-100 text-rose-800">
                            {r.type}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-slate-700">{r.subject}</td>
                        <td className="p-4 text-slate-600">{r.description}</td>
                        <td className="p-4 text-slate-800 font-medium">{r.actionTaken || '-'}</td>
                        <td className="p-4 text-center">
                          {(canSupervise || r.teacherId === currentTeacherId) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRemedial(r.id)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Hapus Catatan"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: PEMANTAUAN & SUPERVISI KEPSEK ================= */}
      {subTab === 'supervisi' && canSupervise && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-amber-200 shadow-sm space-y-2">
            <h2 className="font-display font-black text-lg text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" /> Dasbor Pemantauan & Supervisi Kepala Sekolah
            </h2>
            <p className="text-xs text-slate-500">
              Pantau kelengkapan perangkat ajar (ATP, Prota, Promes, Modul Ajar, PPI) dan jurnal harian terintegrasi kehadiran murid seluruh guru secara real-time, serta berikan verifikasi digital ber-QR Code.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Total Perangkat Ajar</span>
              <div className="font-display font-black text-3xl text-slate-900">
                {yearFilteredDocs.length} Dokumen
              </div>
              <div className="text-xs text-emerald-600 font-bold">
                Terverifikasi QR: {yearFilteredDocs.filter((d) => d.status.includes('Disetujui')).length}
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Koleksi Modul Ajar</span>
              <div className="font-display font-black text-3xl text-rose-700">
                {yearFilteredDocs.filter((d) => d.type === 'modul_ajar').length} Modul Ajar
              </div>
              <div className="text-xs text-slate-500 font-semibold">
                ATP: {yearFilteredDocs.filter((d) => d.type === 'atp').length} • Prota/Promes:{' '}
                {yearFilteredDocs.filter((d) => d.type === 'prota' || d.type === 'promes').length}
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Total Jurnal Mengajar</span>
              <div className="font-display font-black text-3xl text-slate-900">
                {yearFilteredJournals.length} Agenda
              </div>
              <div className="text-xs text-sky-600 font-bold">
                Tercapai: {yearFilteredJournals.filter((j) => j.achievement === 'Tercapai').length} sesi
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Status Isolasi Data</span>
              <div className="font-display font-black text-lg text-emerald-600">Aktif Real-Time</div>
              <div className="text-xs text-slate-500">
                Multi-tenant (NPSN: {npsnKey}) • TA {defaultYear}
              </div>
            </div>
          </div>

          {/* Indikator Kelengkapan Perangkat Ajar per Guru */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-display font-black text-sm text-slate-800">
                  Indikator Kelengkapan Perangkat Ajar & Modul Ajar per Guru
                </h3>
                <p className="text-[11px] text-slate-500">
                  Otomatis diperbarui secara real-time saat guru mengunggah, memperbarui, atau menghapus Modul Ajar.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-display font-black text-xs">
                    <th className="p-3.5">Nama Guru</th>
                    <th className="p-3.5 text-center">ATP</th>
                    <th className="p-3.5 text-center">Prota</th>
                    <th className="p-3.5 text-center">Promes</th>
                    <th className="p-3.5 text-center">Modul Ajar</th>
                    <th className="p-3.5 text-center">PPI & LKPD</th>
                    <th className="p-3.5 text-center">Terverifikasi QR</th>
                    <th className="p-3.5 text-center">Jurnal Mengajar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {teacherSupervisionStats.map((st) => (
                    <tr key={st.name} className="hover:bg-slate-50/70">
                      <td className="p-3.5 font-bold text-slate-900">{st.name}</td>
                      <td className="p-3.5 text-center font-semibold">{st.atp}</td>
                      <td className="p-3.5 text-center font-semibold">{st.prota}</td>
                      <td className="p-3.5 text-center font-semibold">{st.promes}</td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                            st.modul_ajar > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {st.modul_ajar} Modul Ajar
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-semibold">{st.ppi_lkpd}</td>
                      <td className="p-3.5 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px]">
                          {st.verified} / {st.totalDocs}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-bold text-sky-700">{st.totalJournals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daftar Modul Ajar & Perangkat Ajar untuk Supervisi Langsung */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-display font-black text-sm text-slate-800">
                Daftar Perangkat Ajar & Modul Ajar Masuk (Supervisi & Verifikasi)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-display font-black text-xs">
                    <th className="p-3.5">Jenis</th>
                    <th className="p-3.5">Judul Dokumen</th>
                    <th className="p-3.5">Guru & Kelas</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-center">Aksi Supervisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {yearFilteredDocs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        Belum ada perangkat ajar yang diunggah pada tahun ajaran ini.
                      </td>
                    </tr>
                  ) : (
                    yearFilteredDocs.map((d) => {
                      const meta = DOC_TYPES.find((dt) => dt.key === d.type);
                      return (
                        <tr key={d.id} className="hover:bg-slate-50/70">
                          <td className="p-3.5">
                            <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px]">
                              {meta?.shortLabel || d.type}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold text-slate-900">{d.title}</td>
                          <td className="p-3.5 text-slate-600">
                            {d.teacherName} • {d.kelas}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                                d.status.includes('Disetujui')
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : d.status === 'Perlu Revisi'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-sky-100 text-sky-800'
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(d)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
                              >
                                Pratinjau
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewingDoc(d);
                                  setSupervisorNoteInput(d.supervisorNote || '');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] cursor-pointer"
                              >
                                Verifikasi
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingDocTarget(d)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white font-bold text-[11px] cursor-pointer transition"
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pantauan Jurnal Mengajar Terbaru (TP & Kehadiran Murid) */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-display font-black text-sm text-slate-800">
                Pantauan Jurnal Mengajar Terbaru (Kehadiran Murid & TP)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-display font-black text-xs">
                    <th className="p-3.5">Tanggal</th>
                    <th className="p-3.5">Guru & Kelas</th>
                    <th className="p-3.5">Mapel & TP</th>
                    <th className="p-3.5">Kehadiran Murid</th>
                    <th className="p-3.5 text-center">Ketercapaian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {yearFilteredJournals.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        Belum ada jurnal mengajar harian tercatat.
                      </td>
                    </tr>
                  ) : (
                    yearFilteredJournals.slice(0, 10).map((j) => (
                      <tr key={j.id} className="hover:bg-slate-50/70">
                        <td className="p-3.5 font-mono font-bold text-slate-800">{j.date}</td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900">{j.teacherName}</div>
                          <div className="text-[11px] text-slate-500">{j.kelas}</div>
                        </td>
                        <td className="p-3.5 max-w-sm">
                          <div className="font-bold text-rose-700">{j.mapel}</div>
                          <div className="text-slate-700">
                            {j.tpCode && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[10px] mr-1">
                                {j.tpCode}
                              </span>
                            )}
                            {j.objective}
                          </div>
                        </td>
                        <td className="p-3.5 text-emerald-800 font-semibold">
                          {formatJournalAttendanceDisplay(j)}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-[10px]">
                            {j.achievement}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL UPLOAD / EDIT PERANGKAT AJAR ================= */}
      {showAddDocModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-rose-600" />
                {editingDocId
                  ? 'Edit Perangkat Ajar / Modul Ajar'
                  : 'Upload Perangkat Ajar / Draf Modul Ajar'}
              </h3>
              <button
                onClick={() => {
                  setShowAddDocModal(false);
                  setEditingDocId(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDoc} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Jenis Perangkat Ajar:
                  </label>
                  <select
                    value={docForm.type}
                    onChange={(e) =>
                      setDocForm({ ...docForm, type: e.target.value as LearningDocType })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    {DOC_TYPES.map((dt) => (
                      <option key={dt.key} value={dt.key}>
                        {dt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kelas:</label>
                  <select
                    value={docForm.kelas}
                    onChange={(e) => setDocForm({ ...docForm, kelas: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    {Array.from(new Set([...CLASSES_LIST, docForm.kelas].filter(Boolean))).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Judul Dokumen:</label>
                <input
                  type="text"
                  value={docForm.title}
                  onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                  placeholder="Contoh: Modul Ajar Matematika Pecahan Kelas 6"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tautan Google Drive (URL):
                </label>
                <input
                  type="url"
                  value={docForm.driveUrl}
                  onChange={(e) => setDocForm({ ...docForm, driveUrl: e.target.value })}
                  placeholder="https://docs.google.com/document/d/..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ringkasan / Draf Modul Ajar (Opsional):
                </label>
                <textarea
                  rows={3}
                  value={docForm.contentDraft}
                  onChange={(e) => setDocForm({ ...docForm, contentDraft: e.target.value })}
                  placeholder="Ringkasan komponen inti, langkah pembelajaran, atau catatan..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              {docForm.type === 'modul_ajar' && (
                <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={shareToKkg}
                    onChange={(e) => setShareToKkg(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-display font-black text-emerald-950 flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                      Bagikan ke Pustaka KKG (Lintas Sekolah)
                    </span>
                    <span className="text-[11px] text-emerald-800 block mt-0.5">
                      Izinkan guru dari sekolah lain meninjau dan menyalin draf Modul Ajar ini melalui Ekosistem KKG SERBU 21.
                    </span>
                  </div>
                </label>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleGenerateAiSarahDraft}
                  className="px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Sparkles className="w-4 h-4 text-amber-700" /> Buat Draf AI SARAH
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddDocModal(false);
                      setEditingDocId(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer shadow-sm"
                  >
                    {editingDocId ? 'Simpan Perubahan' : 'Simpan & Upload'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL PRATINJAU PERANGKAT AJAR ================= */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-rose-600" />
                <h3 className="font-display font-black text-base text-slate-800">
                  Pratinjau {DOC_TYPES.find((d) => d.key === previewDoc.type)?.shortLabel || 'Perangkat Ajar'}
                </h3>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 font-bold text-[11px]">
                  {DOC_TYPES.find((d) => d.key === previewDoc.type)?.label || previewDoc.type}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                    previewDoc.status.includes('Disetujui')
                      ? 'bg-emerald-100 text-emerald-800'
                      : previewDoc.status === 'Perlu Revisi'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-sky-100 text-sky-800'
                  }`}
                >
                  {previewDoc.status}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="font-display font-black text-sm text-slate-900">{previewDoc.title}</div>
                <div>
                  <strong>Guru Penyusun:</strong> {previewDoc.teacherName}
                </div>
                <div>
                  <strong>Kelas / Tahun Ajaran:</strong> {previewDoc.kelas} ({previewDoc.academicYear})
                </div>
                <div>
                  <strong>Terakhir Diperbarui:</strong> {previewDoc.updatedAt}
                </div>
              </div>

              {previewDoc.contentDraft && (
                <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-700">Ringkasan / Draf Dokumen:</div>
                  <p className="text-slate-600 whitespace-pre-line leading-relaxed">
                    {previewDoc.contentDraft}
                  </p>
                </div>
              )}

              {previewDoc.supervisorNote && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
                  <strong>Catatan Supervisi Kepala Sekolah:</strong> {previewDoc.supervisorNote}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <a
                  href={previewDoc.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Buka Tautan Google Drive
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI HAPUS PERANGKAT AJAR ================= */}
      {deletingDocTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-rose-100 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-black text-base text-slate-900">
                  Konfirmasi Hapus{' '}
                  {deletingDocTarget.type === 'modul_ajar'
                    ? 'Modul Ajar'
                    : DOC_TYPES.find((d) => d.key === deletingDocTarget.type)?.shortLabel || 'Perangkat Ajar'}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {deletingDocTarget.type === 'modul_ajar'
                    ? `Apakah Anda yakin ingin menghapus Modul Ajar '${deletingDocTarget.title}'?`
                    : `Apakah Anda yakin ingin menghapus ${
                        DOC_TYPES.find((d) => d.key === deletingDocTarget.type)?.label || 'Perangkat Ajar'
                      } '${deletingDocTarget.title}'?`}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingDoc}
                onClick={() => setDeletingDocTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingDoc}
                onClick={handleConfirmDeleteDoc}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer shadow-sm disabled:opacity-60"
              >
                {isDeletingDoc ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI HAPUS JURNAL ================= */}
      {deletingJournalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-rose-100 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-black text-base text-slate-900">Hapus Catatan Jurnal</h3>
                <p className="text-xs text-slate-600">
                  Apakah Anda yakin ingin menghapus jurnal mengajar {deletingJournalTarget.mapel} tanggal{' '}
                  <strong>{deletingJournalTarget.date}</strong>?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingJournalTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteJournal}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL CATAT JURNAL HARIAN (TERINTEGRASI ABSENSI & TP) ================= */}
      {showAddJournalModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-rose-600" /> Catat Jurnal Mengajar Harian
              </h3>
              <button
                onClick={() => setShowAddJournalModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveJournal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Mengajar:</label>
                  <input
                    type="date"
                    value={journalForm.date}
                    onChange={(e) =>
                      setJournalForm({
                        ...journalForm,
                        date: e.target.value,
                        useManualAttendance: false,
                      })
                    }
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kelas:</label>
                  <select
                    value={journalForm.kelas}
                    onChange={(e) => handleJournalClassChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    {Array.from(new Set([...CLASSES_LIST, journalForm.kelas].filter(Boolean))).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mata Pelajaran:</label>
                  <select
                    value={journalForm.mapel}
                    onChange={(e) => handleJournalMapelChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    {journalClassSubjects.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                    {!journalClassSubjects.some(
                      (s) => s.name.toLowerCase() === (journalForm.mapel || '').toLowerCase()
                    ) && (
                      <option value={journalForm.mapel}>{journalForm.mapel}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Box Ringkasan Kehadiran Murid Otomatis */}
              <div
                className={`p-3.5 rounded-2xl border space-y-2.5 ${
                  computedAttendance.recorded
                    ? 'bg-emerald-50/80 border-emerald-200'
                    : 'bg-amber-50/80 border-amber-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                    {computedAttendance.recorded ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>Ringkasan Kehadiran Murid ({journalForm.kelas})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAttendanceRefreshTick((t) => t + 1);
                        setJournalForm((prev) => ({ ...prev, useManualAttendance: false }));
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Tarik Ulang Absensi
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setJournalForm((prev) => ({
                          ...prev,
                          useManualAttendance: !prev.useManualAttendance,
                        }))
                      }
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      {journalForm.useManualAttendance ? 'Gunakan Otomatis' : 'Isi / Ubah Manual'}
                    </button>
                  </div>
                </div>

                {computedAttendance.recorded && !journalForm.useManualAttendance ? (
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-emerald-900">
                      {computedAttendance.summaryText}
                    </div>
                    {computedAttendance.absentNames.length > 0 && (
                      <div className="text-[11px] text-emerald-800">
                        Rincian: {computedAttendance.absentNames.join(', ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {!computedAttendance.recorded && (
                      <div className="font-bold text-amber-900">
                        Data presensi tanggal ini belum diinput. Anda dapat mengisi jumlah kehadiran secara manual di bawah ini:
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Hadir (H)</label>
                        <input
                          type="number"
                          min={0}
                          value={journalForm.manualPresent}
                          onChange={(e) =>
                            setJournalForm({
                              ...journalForm,
                              useManualAttendance: true,
                              manualPresent: Number(e.target.value),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Sakit (S)</label>
                        <input
                          type="number"
                          min={0}
                          value={journalForm.manualSakit}
                          onChange={(e) =>
                            setJournalForm({
                              ...journalForm,
                              useManualAttendance: true,
                              manualSakit: Number(e.target.value),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Izin (I)</label>
                        <input
                          type="number"
                          min={0}
                          value={journalForm.manualIzin}
                          onChange={(e) =>
                            setJournalForm({
                              ...journalForm,
                              useManualAttendance: true,
                              manualIzin: Number(e.target.value),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Alpa (A)</label>
                        <input
                          type="number"
                          min={0}
                          value={journalForm.manualAlpa}
                          onChange={(e) =>
                            setJournalForm({
                              ...journalForm,
                              useManualAttendance: true,
                              manualAlpa: Number(e.target.value),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pilih Tujuan Pembelajaran (TP) dari Modul Kurikulum */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Pilih Tujuan Pembelajaran (TP) — {journalForm.mapel} ({journalForm.kelas}):
                </label>
                <select
                  value={journalForm.tpSelection}
                  onChange={(e) => handleJournalTpSelectChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                >
                  <option value="">-- Pilih Tujuan Pembelajaran (TP) dari Kurikulum --</option>
                  {availableTpList.map((tpText, idx) => (
                    <option key={`${selectedJournalSubject?.id}_tp_${idx}`} value={`TP ${idx + 1}`}>
                      {`TP ${idx + 1}: ${tpText.length > 100 ? `${tpText.slice(0, 100)}...` : tpText}`}
                    </option>
                  ))}
                  <option value="__custom__">Tulis Tujuan Pembelajaran (TP) Kustom</option>
                </select>
                {availableTpList.length === 0 && (
                  <p className="text-[11px] text-amber-700">
                    Belum ada daftar TP tersimpan pada menu Kurikulum untuk mapel ini. Anda tetap dapat mengetik TP secara manual di bawah.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tujuan Pembelajaran (TP) / Materi Pokok Pertemuan Ini:
                </label>
                <textarea
                  rows={2}
                  value={journalForm.objective}
                  onChange={(e) => setJournalForm({ ...journalForm, objective: e.target.value })}
                  placeholder="Pilih TP dari dropdown di atas atau tuliskan Tujuan Pembelajaran / materi pokok..."
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status Ketercapaian:</label>
                  <select
                    value={journalForm.achievement}
                    onChange={(e) =>
                      setJournalForm({
                        ...journalForm,
                        achievement: e.target.value as TeachingJournal['achievement'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="Tercapai">Tercapai</option>
                    <option value="Sebagian">Sebagian</option>
                    <option value="Tertunda">Tertunda</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Catatan Refleksi & Tindak Lanjut:
                  </label>
                  <input
                    type="text"
                    value={journalForm.reflection}
                    onChange={(e) => setJournalForm({ ...journalForm, reflection: e.target.value })}
                    placeholder="Refleksi pembelajaran hari ini..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddJournalModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer shadow-sm"
                >
                  Simpan Jurnal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL CATAT REMEDIAL / PEMBINAAN ================= */}
      {showAddRemedialModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-rose-600" /> Catat Tindak Lanjut Siswa
              </h3>
              <button
                onClick={() => setShowAddRemedialModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRemedial} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal:</label>
                  <input
                    type="date"
                    value={remedialForm.date}
                    onChange={(e) => setRemedialForm({ ...remedialForm, date: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kelas:</label>
                  <select
                    value={remedialForm.kelas}
                    onChange={(e) => setRemedialForm({ ...remedialForm, kelas: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    {Array.from(new Set([...CLASSES_LIST, remedialForm.kelas].filter(Boolean))).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Siswa:</label>
                <input
                  type="text"
                  list="remedial-student-suggestions"
                  value={remedialForm.studentName}
                  onChange={(e) => setRemedialForm({ ...remedialForm, studentName: e.target.value })}
                  placeholder="Pilih atau ketik nama siswa..."
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
                <datalist id="remedial-student-suggestions">
                  {remedialClassStudents.map((s) => (
                    <option key={s.id} value={s.nama} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jenis Layanan:</label>
                  <select
                    value={remedialForm.type}
                    onChange={(e) =>
                      setRemedialForm({
                        ...remedialForm,
                        type: e.target.value as StudentRemedialRecord['type'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="Remedial">Remedial</option>
                    <option value="Pengayaan">Pengayaan</option>
                    <option value="Pembinaan Khusus">Pembinaan Khusus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mata Pelajaran:</label>
                  <select
                    value={remedialForm.subject}
                    onChange={(e) => setRemedialForm({ ...remedialForm, subject: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    {remedialClassSubjects.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kendala / Deskripsi:</label>
                <textarea
                  rows={2}
                  value={remedialForm.description}
                  onChange={(e) => setRemedialForm({ ...remedialForm, description: e.target.value })}
                  placeholder="Jelaskan materi yang perlu pendampingan atau catatan pembinaan..."
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tindakan / Solusi:</label>
                <textarea
                  rows={2}
                  value={remedialForm.actionTaken}
                  onChange={(e) => setRemedialForm({ ...remedialForm, actionTaken: e.target.value })}
                  placeholder="Contoh: Bimbingan ulang soal cerita pecahan + latihan terbimbing..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddRemedialModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
                >
                  Simpan Catatan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL SUPERVISI KEPSEK ================= */}
      {reviewingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600" /> Verifikasi Dokumen Perangkat Ajar
              </h3>
              <button
                onClick={() => setReviewingDoc(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <div>
                  <strong>Jenis:</strong>{' '}
                  {DOC_TYPES.find((d) => d.key === reviewingDoc.type)?.label || reviewingDoc.type}
                </div>
                <div>
                  <strong>Dokumen:</strong> {reviewingDoc.title}
                </div>
                <div>
                  <strong>Guru:</strong> {reviewingDoc.teacherName}
                </div>
                <div>
                  <strong>Kelas:</strong> {reviewingDoc.kelas}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Catatan Umpan Balik / Supervisi:
                </label>
                <textarea
                  rows={3}
                  value={supervisorNoteInput}
                  onChange={(e) => setSupervisorNoteInput(e.target.value)}
                  placeholder="Tuliskan catatan supervisi atau arahan revisi..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleVerifyDoc(reviewingDoc.id, 'Perlu Revisi')}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-display font-bold text-xs cursor-pointer shadow-sm"
                >
                  Minta Revisi
                </button>
                <button
                  type="button"
                  onClick={() => handleVerifyDoc(reviewingDoc.id, 'Disetujui & Terverifikasi (QR)')}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-xs cursor-pointer shadow-sm"
                >
                  Setujui & Validasi QR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= PRINT VIEW / PDF REPORT MODAL UNTUK JURNAL ================= */}
      {isPrintingJournal && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-start p-4 overflow-y-auto print:p-0 print:bg-white">
          <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl p-8 space-y-6 print:shadow-none print:rounded-none my-8 print:my-0">
            {/* Header Control for Web */}
            <div className="flex items-center justify-between border-b pb-4 no-print">
              <div className="flex items-center gap-2">
                <Printer className="w-6 h-6 text-rose-600" />
                <h3 className="font-display font-black text-lg text-slate-800">
                  Pratinjau Resmi Cetak Laporan Jurnal Mengajar
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md cursor-pointer"
                >
                  Cetak / Save as PDF
                </button>
                <button
                  onClick={() => setIsPrintingJournal(false)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Report Document */}
            <div className="space-y-6 text-slate-900 print:text-black">
              {/* Kop Surat */}
              <div className="border-b-4 border-double border-slate-900 pb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {profile?.logoSekolahUrl && (
                    <img
                      src={profile.logoSekolahUrl}
                      alt="Logo Sekolah"
                      className="w-16 h-16 object-contain"
                    />
                  )}
                  <div>
                    <h2 className="font-display font-black text-xl uppercase tracking-wider">
                      {profile?.name || 'SDN RAWA BADAK UTARA 21'}
                    </h2>
                    <p className="text-xs font-semibold text-slate-700">
                      {profile?.alamat || 'Kecamatan Koja, Kota Administrasi Jakarta Utara, Provinsi DKI Jakarta'}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      NPSN: {profile?.npsn || '20104321'} • {profile?.kota || 'Jakarta Utara'}, {profile?.provinsi || 'DKI Jakarta'}
                    </p>
                  </div>
                </div>
                {profile?.logoKemendikbudUrl && (
                  <img
                    src={profile.logoKemendikbudUrl}
                    alt="Logo Tut Wuri Handayani"
                    className="w-16 h-16 object-contain"
                  />
                )}
              </div>

              {/* Title & Metadata */}
              <div className="text-center space-y-1">
                <h1 className="font-display font-black text-base uppercase underline">
                  LAPORAN JURNAL MENGAJAR HARIAN (AGENDA KELAS)
                </h1>
                <p className="text-xs font-semibold">
                  Tahun Ajaran: {defaultYear} • Terintegrasi Kehadiran Murid & Tujuan Pembelajaran (TP)
                </p>
              </div>

              <div className="grid grid-cols-2 text-xs font-semibold bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  Nama Guru: {journalFilterTeacher !== 'all' ? journalFilterTeacher : currentTeacherName}
                </div>
                <div>Kelas: {defaultClass}</div>
              </div>

              {/* Table */}
              <table className="w-full border-collapse border border-slate-800 text-xs">
                <thead>
                  <tr className="bg-slate-200 text-slate-900 font-bold text-center">
                    <th className="border border-slate-800 p-2 w-10">No</th>
                    <th className="border border-slate-800 p-2 w-24">Tanggal</th>
                    <th className="border border-slate-800 p-2 w-28">Mapel</th>
                    <th className="border border-slate-800 p-2">Tujuan Pembelajaran (TP) / Materi Pokok</th>
                    <th className="border border-slate-800 p-2 w-44">Kehadiran Murid</th>
                    <th className="border border-slate-800 p-2 w-24">Ketercapaian</th>
                    <th className="border border-slate-800 p-2">Catatan Refleksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJournals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border border-slate-800 p-4 text-center text-slate-500">
                        Tidak ada data jurnal.
                      </td>
                    </tr>
                  ) : (
                    filteredJournals.map((j, idx) => (
                      <tr key={j.id} className="align-top">
                        <td className="border border-slate-800 p-2 text-center font-bold">{idx + 1}</td>
                        <td className="border border-slate-800 p-2 text-center font-mono">{j.date}</td>
                        <td className="border border-slate-800 p-2 font-semibold">{j.mapel}</td>
                        <td className="border border-slate-800 p-2">
                          {j.tpCode ? <span className="font-bold">[{j.tpCode}] </span> : null}
                          {j.objective}
                        </td>
                        <td className="border border-slate-800 p-2">{formatJournalAttendanceDisplay(j)}</td>
                        <td className="border border-slate-800 p-2 text-center font-bold">{j.achievement}</td>
                        <td className="border border-slate-800 p-2">{j.reflection || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Signatures Block */}
              <div className="pt-8 flex justify-between items-end text-xs font-semibold">
                <div className="space-y-16 text-center">
                  <div>
                    <div>Mengetahui,</div>
                    <div>Kepala Sekolah</div>
                  </div>
                  <div className="space-y-1">
                    <div className="w-24 h-24 mx-auto border border-dashed border-slate-400 flex items-center justify-center p-1 bg-slate-50">
                      <div className="text-[9px] font-mono text-center text-slate-600">
                        [QR VALIDASI KEPSEK]
                        <br />
                        SERBU21-QR-VERIFIED
                      </div>
                    </div>
                    <div className="font-black uppercase">
                      {profile?.kepalaSekolah?.nama || 'Darti Isyanti, M.Pd'}
                    </div>
                    <div>NIP. {profile?.kepalaSekolah?.nip || '197405121998032005'}</div>
                  </div>
                </div>

                <div className="space-y-16 text-center">
                  <div>
                    <div>
                      Jakarta,{' '}
                      {new Date().toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </div>
                    <div>Guru Kelas / Mata Pelajaran</div>
                  </div>
                  <div className="space-y-1">
                    <div className="h-16" />
                    <div className="font-black uppercase">
                      {journalFilterTeacher !== 'all' ? journalFilterTeacher : currentTeacherName}
                    </div>
                    <div>NIP / NUPTK. Terdaftar</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
