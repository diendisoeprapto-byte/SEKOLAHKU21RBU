/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  SchoolProfile,
  Teacher,
  Student,
  Subject,
  KaldikDay,
  ActiveUser,
  ActiveExamHeaderStatus,
} from './types';
import {
  getStoredProfile,
  saveStoredProfile,
  getStoredTeachers,
  saveStoredTeachers,
  getStoredStudents,
  saveStoredStudents,
  getStoredSubjects,
  saveStoredSubjects,
  getStoredSubjectsForClass,
  saveStoredSubjectsForClass,
  getStoredSubjectsByClass,
  getStoredKaldik,
  saveStoredKaldik,
  getStoredAttendance,
  saveStoredAttendance,
  getActiveFilters,
  saveActiveFilters,
  saveStoredReportNotes,
  saveStoredTKADurations,
  saveStoredCBTDurations,
  saveStoredCBTActivePackages,
  saveStoredTKAActivePackages,
  getStoredCBTExams,
  saveStoredCBTExams,
  getStoredTKAQuestions,
  saveStoredTKAQuestions,
  getStoredTKASubmissions,
  saveStoredTKASubmissions,
  getStoredCBTResults,
  saveStoredCBTResults,
  getStoredTKAResults,
  saveStoredTKAResults,
  getStoredExamResultsResetMeta,
  saveStoredExamResultsResetMeta,
  mergeExamResultsResetMeta,
  filterExamResultsByResetMeta,
  registerStorageMutationHook,
  runWithoutStorageSync,
  safeSetLocalStorage,
  hasStoredTKAQuestionsLocal,
  hasStoredCBTExamsLocal,
  hydrateLargeCollectionsFromIDB,
  markLargeCollectionHydratedFromCloud,
  AttendanceRecordItem,
} from './utils/storage';
import { DEFAULT_SCHOOL_PROFILE, DEFAULT_TEACHERS, DEFAULT_STUDENTS, DEFAULT_SUBJECTS, DEFAULT_KALDIK_HOLIDAYS } from './data/defaultData';

import { Header } from './components/Header';
import { Sidebar, TabId } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';

// Modals
import { ImageZoomModal } from './components/modals/ImageZoomModal';
import { CustomHolidayModal } from './components/modals/CustomHolidayModal';
import { MonthlyAttendanceModal } from './components/modals/MonthlyAttendanceModal';
import { ChangePasswordModal } from './components/modals/ChangePasswordModal';

// Tabs
import { DashboardTab } from './components/tabs/DashboardTab';
import { ProfilSekolahTab } from './components/tabs/ProfilSekolahTab';
import { GuruTab } from './components/tabs/GuruTab';
import { RombelTab } from './components/tabs/RombelTab';
import { SiswaTab } from './components/tabs/SiswaTab';
import { AbsensiTab } from './components/tabs/AbsensiTab';
import { KalenderTab } from './components/tabs/KalenderTab';
import { LaporanAbsensiTab } from './components/tabs/LaporanAbsensiTab';
import { KurikulumTabs } from './components/tabs/KurikulumTabs';
import { PenilaianTab } from './components/tabs/PenilaianTab';
import { CatatanWaliTab } from './components/tabs/CatatanWaliTab';
import { LegerTab } from './components/tabs/LegerTab';
import { CBTTab } from './components/tabs/CBTTab';
import { AnalisisSoalTab } from './components/tabs/AnalisisSoalTab';
import { ERaporTab } from './components/tabs/ERaporTab';
import { RaporKokurikulerTab } from './components/tabs/RaporKokurikulerTab';
import { BackupTab } from './components/tabs/BackupTab';
import { TKATabs } from './components/tabs/TKATabs';
import { PenilaianEkskulTab } from './components/tabs/PenilaianEkskulTab';
import { DashboardKebiasaanTab } from './components/tabs/DashboardKebiasaanTab';
import { ManajemenASAJTab } from './components/tabs/ManajemenASAJTab';
import { PortalAlumniTab } from './components/tabs/PortalAlumniTab';
import { PerpustakaanTab } from './components/tabs/PerpustakaanTab';
import { StudentDashboard } from './components/StudentDashboard';
import { testConnection } from './utils/firebase';
import {
  applyBackupMapToLocalStorage,
  pullAllDataFromCloud,
  pullSnapshotChunksFromCloud,
  pushAllDataToCloud,
  scheduleRealtimeModuleSync,
  subscribeToCloudChanges,
  syncAllLocalToCloud,
  reconcileTkaFromCloudBackup,
  LAST_PUSHED_VERSION_KEY,
  LAST_RESTORE_VERSION_KEY,
  LAST_SNAPSHOT_REV_KEY,
} from './utils/cloudSync';
import {
  subscribeToStudentsCollection,
  saveStudentsToFirestoreBatch,
  sortStudentsAlphabetically,
} from './utils/studentFirestore';
import {
  subscribeToAttendanceCollection,
  saveSingleAttendanceToFirestore,
  saveBatchAttendanceToFirestore,
  deleteAttendanceRecordsFromFirestore,
  subscribeToKaldikDoc,
  saveKaldikToFirestore,
} from './utils/attendanceFirestore';
import {
  subscribeToTkaQuestionsCollection,
  saveTkaQuestionsBatchToFirestore,
  subscribeToTkaSubmissionsCollection,
  saveTkaSubmissionsBatchToFirestore,
  getPendingTkaSubmissions,
  mergeTkaSubmissionLists,
  flushPendingTkaSubmissionsToFirestore,
  reconcileAndSyncLocalTkaSubmissions,
} from './utils/tkaFirestore';
import {
  subscribeToCbtExamsCollection,
  saveCbtExamsBatchToFirestore,
} from './utils/cbtFirestore';
import {
  subscribeToTeachersCollection,
  saveTeachersToFirestoreBatch,
  replaceTeachersInFirestore,
  sortTeachersAlphabetically,
} from './utils/teacherFirestore';
import { getLocalTodayStr } from './utils/dateUtils';

export default function App() {
  // Database States
  const [profile, setProfile] = useState<SchoolProfile>(getStoredProfile());
  const [teachers, setTeachers] = useState<Teacher[]>(() => sortTeachersAlphabetically(getStoredTeachers()));
  const [students, setStudents] = useState<Student[]>(() => sortStudentsAlphabetically(getStoredStudents()));
  const studentsCollectionLoadedRef = React.useRef(false);
  const teachersCollectionLoadedRef = React.useRef(false);
  const attendanceCollectionLoadedRef = React.useRef(false);
  const kaldikDocLoadedRef = React.useRef(false);
  const tkaQuestionsCollectionLoadedRef = React.useRef(false);
  const tkaSubmissionsCollectionLoadedRef = React.useRef(false);
  const cbtExamsCollectionLoadedRef = React.useRef(false);
  const adminTkaReconciledRef = React.useRef(false);
  const activeUserRef = React.useRef<ActiveUser | null>(null);
  const [restoreTick, setRestoreTick] = useState(0);
  const [activeExamStatus, setActiveExamStatus] = useState<ActiveExamHeaderStatus | null>(null);
  const initialFilters = getActiveFilters();
  const activeClassRef = React.useRef<string>(initialFilters.kelas);
  const [subjects, setSubjects] = useState<Subject[]>(() => getStoredSubjectsForClass(initialFilters.kelas));
  const [kaldikDays, setKaldikDays] = useState<KaldikDay[]>(getStoredKaldik());
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecordItem>>(
    getStoredAttendance()
  );

  // Real-time local date state (otomatis berubah saat pergantian hari tengah malam)
  const [liveTodayStr, setLiveTodayStr] = useState<string>(() => getLocalTodayStr());
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState<string>(() => getLocalTodayStr());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => getLocalTodayStr());

  useEffect(() => {
    const checkDateRollover = () => {
      const currentToday = getLocalTodayStr();
      setLiveTodayStr((prevToday) => {
        if (prevToday !== currentToday) {
          setSelectedAttendanceDate((prevSel) => (prevSel === prevToday ? currentToday : prevSel));
          setSelectedCalendarDate((prevCal) => (prevCal === prevToday ? currentToday : prevCal));
          return currentToday;
        }
        return prevToday;
      });
    };
    const timer = setInterval(checkDateRollover, 15000);
    return () => clearInterval(timer);
  }, []);

  // Test Firebase connection & Multi-device Cloud Sync
  useEffect(() => {
    testConnection();

    let isMounted = true;
    const idbHydrationPromise = hydrateLargeCollectionsFromIDB({
      onStudents: (idbStudents) => {
        if (!isMounted || studentsCollectionLoadedRef.current) return;
        setStudents(sortStudentsAlphabetically(idbStudents));
      },
      onTeachers: (idbTeachers) => {
        if (!isMounted || teachersCollectionLoadedRef.current) return;
        setTeachers(sortTeachersAlphabetically(idbTeachers));
      },
      onAttendance: (idbAttendance) => {
        if (!isMounted || attendanceCollectionLoadedRef.current) return;
        setAttendanceRecords(idbAttendance);
      },
    });

    // Sinkronkan perubahan modul non-koleksi (Penilaian, e-Rapor, Ekskul, Catatan, Durasi, Aktivasi) secara realtime ke cloud.
    // Koleksi dedicated Firestore (tka_questions, cbt_exams, tka_submissions, students, teachers, attendance) sudah tersinkron langsung ke koleksinya.
    registerStorageMutationHook((storageKey) => {
      if (
        storageKey === 'sekolahku_tka_questions' ||
        storageKey === 'sekolahku_cbt_exams' ||
        storageKey === 'sekolahku_tka_submissions'
      ) {
        return;
      }
      if (
        activeUserRef.current?.role === 'siswa' &&
        (storageKey === 'sekolahku_student_exam_drafts_v1' ||
          storageKey === 'sekolahku_tka_exam_drafts_v1')
      ) {
        return;
      }
      scheduleRealtimeModuleSync(activeUserRef.current?.name || 'admin');
    });

    let applyQueue: Promise<void> = Promise.resolve();

    const applyCloudPayload = async (cloudData: any) => {
      if (!cloudData) return;

      const incomingVersion = cloudData.version ? String(cloudData.version) : '';
      const lastPushedVer = localStorage.getItem(LAST_PUSHED_VERSION_KEY) || '';
      const isLocalEcho = Boolean(incomingVersion && lastPushedVer && incomingVersion === lastPushedVer);
      const activeStudentId =
        activeUserRef.current?.role === 'siswa' ? activeUserRef.current?.studentData?.id : undefined;

      let didMutateFromRemote = false;

      // 1. Terapkan snapshot chunked bila ada revisi snapshot baru dari perangkat lain / restore backup
      const incomingSnapRev = cloudData.snapshotRevision ? String(cloudData.snapshotRevision) : '';
      const lastSnapRev = localStorage.getItem(LAST_SNAPSHOT_REV_KEY) || '';
      const chunkCount = Number(cloudData.snapshotChunkCount || 0);

      if (chunkCount > 0 && incomingSnapRev && !isLocalEcho && incomingSnapRev !== lastSnapRev) {
        try {
          const snapshotMap = await pullSnapshotChunksFromCloud(chunkCount);
          if (snapshotMap && Object.keys(snapshotMap).length > 0) {
            const incomingRestoreVer = cloudData.restoreVersion ? String(cloudData.restoreVersion) : '';
            const lastRestoreVer = localStorage.getItem(LAST_RESTORE_VERSION_KEY) || '';
            const isFullRestoreEvent = Boolean(incomingRestoreVer && incomingRestoreVer !== lastRestoreVer);

            runWithoutStorageSync(() => {
              applyBackupMapToLocalStorage(snapshotMap, {
                replaceAllNonSession: isFullRestoreEvent,
                currentStudentId: activeStudentId,
              });
              safeSetLocalStorage(LAST_SNAPSHOT_REV_KEY, incomingSnapRev);
              if (incomingRestoreVer) {
                safeSetLocalStorage(LAST_RESTORE_VERSION_KEY, incomingRestoreVer);
              }
            });
            didMutateFromRemote = true;
          }
        } catch (err) {
          console.warn('Gagal mengambil snapshot chunked dari Firestore:', err);
        }
      } else if (cloudData.localStorageSnapshot && typeof cloudData.localStorageSnapshot === 'object') {
        const incomingRestoreVer = cloudData.restoreVersion ? String(cloudData.restoreVersion) : '';
        const lastRestoreVer = localStorage.getItem(LAST_RESTORE_VERSION_KEY) || '';
        if (incomingRestoreVer && !isLocalEcho && incomingRestoreVer !== lastRestoreVer) {
          runWithoutStorageSync(() => {
            applyBackupMapToLocalStorage(cloudData.localStorageSnapshot, {
              currentStudentId: activeStudentId,
            });
            safeSetLocalStorage(LAST_RESTORE_VERSION_KEY, incomingRestoreVer);
          });
          didMutateFromRemote = true;
        }
      }

      // 2. Terapkan field dokumen utama dalam mode suppressed agar tidak memantul balik ke Firestore
      runWithoutStorageSync(() => {
        if (cloudData.profile) {
          setProfile(cloudData.profile);
          saveStoredProfile(cloudData.profile);
        }
        if (cloudData.teachers && !teachersCollectionLoadedRef.current) {
          const sortedCloudTeachers = sortTeachersAlphabetically(cloudData.teachers);
          setTeachers(sortedCloudTeachers);
          saveStoredTeachers(sortedCloudTeachers);
        }
        if (cloudData.students && !studentsCollectionLoadedRef.current) {
          const sortedCloudStudents = sortStudentsAlphabetically(cloudData.students);
          setStudents(sortedCloudStudents);
          saveStoredStudents(sortedCloudStudents);
        }
        if (cloudData.subjectsByClass) {
          safeSetLocalStorage('sekolahku_subjects_by_class', JSON.stringify(cloudData.subjectsByClass));
          const currentClassSubjects = getStoredSubjectsForClass(activeClassRef.current);
          setSubjects(currentClassSubjects);
        } else if (cloudData.subjects) {
          setSubjects(cloudData.subjects);
          saveStoredSubjects(cloudData.subjects);
        } else if (didMutateFromRemote) {
          setSubjects(getStoredSubjectsForClass(activeClassRef.current));
        }
        if (cloudData.kaldikDays && !kaldikDocLoadedRef.current) {
          setKaldikDays(cloudData.kaldikDays);
          saveStoredKaldik(cloudData.kaldikDays);
        }
        if (cloudData.attendance && !attendanceCollectionLoadedRef.current) {
          setAttendanceRecords(cloudData.attendance);
          saveStoredAttendance(cloudData.attendance);
        }
        if (cloudData.ekskulList) {
          safeSetLocalStorage('sekolahku_ekskul_list', JSON.stringify(cloudData.ekskulList));
        }
        if (cloudData.penilaianEkskul) {
          safeSetLocalStorage('sekolahku_penilaian_ekskul', JSON.stringify(cloudData.penilaianEkskul));
        }
        if (cloudData.reportNotes) {
          saveStoredReportNotes(cloudData.reportNotes);
        }
        if (typeof cloudData.cbtAcakSoal === 'boolean') {
          safeSetLocalStorage('sekolahku_cbt_acak_soal', String(cloudData.cbtAcakSoal));
        }
        if (typeof cloudData.cbtAcakJawaban === 'boolean') {
          safeSetLocalStorage('sekolahku_cbt_acak_jawaban', String(cloudData.cbtAcakJawaban));
        }
        if (typeof cloudData.tkaAcakSoal === 'boolean') {
          safeSetLocalStorage('sekolahku_tka_acak_soal', String(cloudData.tkaAcakSoal));
        }
        if (typeof cloudData.tkaAcakJawaban === 'boolean') {
          safeSetLocalStorage('sekolahku_tka_acak_jawaban', String(cloudData.tkaAcakJawaban));
        }
        if (cloudData.tkaDurations && typeof cloudData.tkaDurations === 'object') {
          saveStoredTKADurations(cloudData.tkaDurations);
        }
        if (cloudData.cbtDurations && typeof cloudData.cbtDurations === 'object') {
          saveStoredCBTDurations(cloudData.cbtDurations);
        }
        if (cloudData.cbtActivePackages && typeof cloudData.cbtActivePackages === 'object') {
          saveStoredCBTActivePackages(cloudData.cbtActivePackages);
        }
        if (cloudData.tkaActivePackages && typeof cloudData.tkaActivePackages === 'object') {
          saveStoredTKAActivePackages(cloudData.tkaActivePackages);
        }
        if (cloudData.examResultsResetMeta && typeof cloudData.examResultsResetMeta === 'object') {
          const mergedMeta = mergeExamResultsResetMeta(
            getStoredExamResultsResetMeta(),
            cloudData.examResultsResetMeta
          );
          saveStoredExamResultsResetMeta(mergedMeta);
          try {
            const localCbt = getStoredCBTResults();
            if (localCbt.length > 0) {
              saveStoredCBTResults(
                filterExamResultsByResetMeta(localCbt, undefined, mergedMeta)
              );
            }
            const localTka = getStoredTKAResults();
            if (localTka.length > 0) {
              saveStoredTKAResults(
                filterExamResultsByResetMeta(localTka, 'tka', mergedMeta)
              );
            }
          } catch {}
        }
      });

      if (didMutateFromRemote && !tkaQuestionsCollectionLoadedRef.current) {
        const pulledQuestions = getStoredTKAQuestions();
        if (pulledQuestions.length > 0 && hasStoredTKAQuestionsLocal()) {
          tkaQuestionsCollectionLoadedRef.current = true;
          safeSetLocalStorage('sekolahku_tka_questions_seeded', 'true');
          saveTkaQuestionsBatchToFirestore(pulledQuestions).catch((err) =>
            console.warn('Migrate snapshot TKA questions to collection warning:', err)
          );
        }
      }

      if (didMutateFromRemote && !cbtExamsCollectionLoadedRef.current) {
        const pulledCbtExams = getStoredCBTExams();
        if (pulledCbtExams.length > 0 && hasStoredCBTExamsLocal()) {
          cbtExamsCollectionLoadedRef.current = true;
          safeSetLocalStorage('sekolahku_cbt_exams_seeded', 'true');
          saveCbtExamsBatchToFirestore(pulledCbtExams).catch((err) =>
            console.warn('Migrate snapshot CBT exams to collection warning:', err)
          );
        }
      }

      if (!isLocalEcho) {
        window.dispatchEvent(new Event('sekolahku-cloud-sync-updated'));
        window.dispatchEvent(new Event('sekolahku-exam-results-updated'));
        window.dispatchEvent(new Event('sekolahku-cbt-exams-updated'));
        window.dispatchEvent(new Event('sekolahku-cbt-durations-updated'));
        window.dispatchEvent(new Event('sekolahku-tka-durations-updated'));
        window.dispatchEvent(new Event('sekolahku-tka-active-updated'));
        window.dispatchEvent(new Event('sekolahku-tka-questions-updated'));
      }
    };

    const enqueueCloudPayload = (cloudData: any) => {
      applyQueue = applyQueue.then(() => applyCloudPayload(cloudData)).catch((err) => {
        console.warn('Cloud sync queue error:', err);
      });
    };

    // Pull initial cloud state if available
    pullAllDataFromCloud().then(async (cloudData) => {
      await idbHydrationPromise;
      if (!isMounted) return;
      if (
        cloudData &&
        (cloudData.profile ||
          cloudData.teachers ||
          cloudData.snapshotChunkCount ||
          cloudData.snapshotRevision ||
          cloudData.students)
      ) {
        enqueueCloudPayload(cloudData);
      } else if (activeUserRef.current?.role !== 'siswa') {
        // Seed initial local data into cloud ONLY jika login sebagai guru/admin
        syncAllLocalToCloud('initial_seed');
        if (!tkaQuestionsCollectionLoadedRef.current) {
          const initialQ = getStoredTKAQuestions();
          if (initialQ.length > 0) {
            tkaQuestionsCollectionLoadedRef.current = true;
            safeSetLocalStorage('sekolahku_tka_questions_seeded', 'true');
            saveTkaQuestionsBatchToFirestore(initialQ).catch(() => {});
          }
        }
        if (!cbtExamsCollectionLoadedRef.current) {
          const initialCbt = getStoredCBTExams();
          if (initialCbt.length > 0 && hasStoredCBTExamsLocal()) {
            cbtExamsCollectionLoadedRef.current = true;
            safeSetLocalStorage('sekolahku_cbt_exams_seeded', 'true');
            saveCbtExamsBatchToFirestore(initialCbt).catch(() => {});
          }
        }
      }
    });

    // Realtime listener for cross-device updates (Laptop <-> Tablet)
    const unsubscribe = subscribeToCloudChanges((cloudData) => {
      if (cloudData) {
        enqueueCloudPayload(cloudData);
      }
    });

    // Realtime listener langsung untuk koleksi 'students' di Firestore (single source of truth)
    const unsubStudents = subscribeToStudentsCollection(async (firestoreStudents) => {
      await idbHydrationPromise;
      if (!isMounted) return;
      const alreadySeeded = localStorage.getItem('sekolahku_students_seeded') === 'true';

      if (firestoreStudents.length > 0) {
        studentsCollectionLoadedRef.current = true;
        markLargeCollectionHydratedFromCloud('sekolahku_students');
        safeSetLocalStorage('sekolahku_students_seeded', 'true');
        setStudents(firestoreStudents);
        saveStoredStudents(firestoreStudents);
      } else if (!studentsCollectionLoadedRef.current && !alreadySeeded) {
        const localStudents = getStoredStudents();
        if (localStudents.length > 0) {
          studentsCollectionLoadedRef.current = true;
          safeSetLocalStorage('sekolahku_students_seeded', 'true');
          saveStudentsToFirestoreBatch(localStudents, 'initial_seed').catch((err) =>
            console.warn('Initial student seed warning:', err)
          );
        }
      } else {
        // Semua siswa telah dihapus oleh user -> kosongkan state agar tidak muncul kembali
        studentsCollectionLoadedRef.current = true;
        markLargeCollectionHydratedFromCloud('sekolahku_students');
        setStudents([]);
        saveStoredStudents([]);
      }
    });

    // Realtime listener langsung untuk koleksi 'teachers' di Firestore (single source of truth hingga 60 guru/pegawai)
    const unsubTeachers = subscribeToTeachersCollection(async (firestoreTeachers) => {
      await idbHydrationPromise;
      if (!isMounted) return;
      const alreadySeeded = localStorage.getItem('sekolahku_teachers_seeded') === 'true';

      if (firestoreTeachers.length > 0) {
        teachersCollectionLoadedRef.current = true;
        markLargeCollectionHydratedFromCloud('sekolahku_teachers');
        safeSetLocalStorage('sekolahku_teachers_seeded', 'true');
        setTeachers(firestoreTeachers);
        saveStoredTeachers(firestoreTeachers);
      } else if (!teachersCollectionLoadedRef.current && !alreadySeeded) {
        teachersCollectionLoadedRef.current = true;
        safeSetLocalStorage('sekolahku_teachers_seeded', 'true');
        let seedSource = getStoredTeachers();
        try {
          const legacyCloud = await pullAllDataFromCloud();
          if (legacyCloud?.teachers && legacyCloud.teachers.length > 0) {
            seedSource = legacyCloud.teachers;
          }
        } catch {
          // Fallback to local teachers
        }
        if (seedSource.length > 0) {
          saveTeachersToFirestoreBatch(seedSource).catch((err) =>
            console.warn('Initial teachers seed warning:', err)
          );
        }
      } else {
        teachersCollectionLoadedRef.current = true;
        markLargeCollectionHydratedFromCloud('sekolahku_teachers');
        setTeachers([]);
        saveStoredTeachers([]);
      }
    });

    // Realtime listener langsung untuk koleksi 'attendance' di Firestore (single source of truth)
    const unsubAttendance = subscribeToAttendanceCollection(
      async (firestoreAttendance) => {
        await idbHydrationPromise;
        if (!isMounted) return;
        const alreadySeeded = localStorage.getItem('sekolahku_attendance_seeded') === 'true';
        const recordList = Object.values(firestoreAttendance);

        if (recordList.length > 0) {
          attendanceCollectionLoadedRef.current = true;
          markLargeCollectionHydratedFromCloud('sekolahku_attendance_records');
          safeSetLocalStorage('sekolahku_attendance_seeded', 'true');
          setAttendanceRecords(firestoreAttendance);
          saveStoredAttendance(firestoreAttendance);
        } else if (!attendanceCollectionLoadedRef.current && !alreadySeeded) {
          attendanceCollectionLoadedRef.current = true;
          safeSetLocalStorage('sekolahku_attendance_seeded', 'true');
          const localAtt = getStoredAttendance();
          const localList = Object.values(localAtt);
          if (localList.length > 0) {
            saveBatchAttendanceToFirestore(localList).catch((err) =>
              console.warn('Initial attendance seed warning:', err)
            );
          }
        } else {
          attendanceCollectionLoadedRef.current = true;
          markLargeCollectionHydratedFromCloud('sekolahku_attendance_records');
          setAttendanceRecords({});
          saveStoredAttendance({});
        }
      },
      (err) => {
        console.warn('Attendance listener warning:', err);
      }
    );

    // Realtime listener langsung untuk Kaldik (settings/kaldik_days)
    const unsubKaldik = subscribeToKaldikDoc((firestoreKaldik) => {
      if (firestoreKaldik.length > 0) {
        kaldikDocLoadedRef.current = true;
        setKaldikDays(firestoreKaldik);
        saveStoredKaldik(firestoreKaldik);
      }
    });

    // Realtime listener langsung untuk koleksi 'tka_questions' di Firestore (single source of truth Bank Soal TKA)
    const unsubTkaQuestions = subscribeToTkaQuestionsCollection(
      async (firestoreTkaQuestions) => {
        await idbHydrationPromise;
        if (!isMounted) return;
        const alreadySeeded = localStorage.getItem('sekolahku_tka_questions_seeded') === 'true';

        if (firestoreTkaQuestions.length > 0) {
          tkaQuestionsCollectionLoadedRef.current = true;
          markLargeCollectionHydratedFromCloud('sekolahku_tka_questions');
          safeSetLocalStorage('sekolahku_tka_questions_seeded', 'true');
          runWithoutStorageSync(() => {
            saveStoredTKAQuestions(firestoreTkaQuestions);
          });
        } else if (!tkaQuestionsCollectionLoadedRef.current && !alreadySeeded) {
          const hasStoredLocal = hasStoredTKAQuestionsLocal();
          if (hasStoredLocal) {
            const localQuestions = getStoredTKAQuestions();
            if (localQuestions.length > 0) {
              tkaQuestionsCollectionLoadedRef.current = true;
              safeSetLocalStorage('sekolahku_tka_questions_seeded', 'true');
              saveTkaQuestionsBatchToFirestore(localQuestions).catch((err) =>
                console.warn('Initial TKA questions seed warning:', err)
              );
            }
          }
        } else {
          tkaQuestionsCollectionLoadedRef.current = true;
          markLargeCollectionHydratedFromCloud('sekolahku_tka_questions');
          runWithoutStorageSync(() => {
            saveStoredTKAQuestions([]);
          });
        }
      },
      (err) => {
        console.warn('TKA questions listener warning:', err);
      }
    );

    // Realtime listener langsung untuk koleksi 'tka_submissions' (Analisis & Rekap Hasil TKA real-time lintas perangkat)
    const unsubTkaSubmissions = subscribeToTkaSubmissionsCollection(
      async (firestoreSubs) => {
        await idbHydrationPromise;
        if (!isMounted) return;
        const alreadySeeded = localStorage.getItem('sekolahku_tka_submissions_seeded') === 'true';
        const resetMeta = getStoredExamResultsResetMeta();
        const tkaClearedAt = Number(resetMeta?.tkaClearedAt || 0);
        const validPending = getPendingTkaSubmissions().filter((item) => {
          const ts = item.updatedAt ? Date.parse(item.updatedAt) : 0;
          if (tkaClearedAt > 0 && (!Number.isFinite(ts) || ts <= tkaClearedAt)) return false;
          return true;
        });
        const mergedSubs = mergeTkaSubmissionLists(firestoreSubs, validPending);

        if (mergedSubs.length > 0) {
          tkaSubmissionsCollectionLoadedRef.current = true;
          markLargeCollectionHydratedFromCloud('sekolahku_tka_submissions');
          safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
          runWithoutStorageSync(() => {
            saveStoredTKASubmissions(mergedSubs);
          });
          if (validPending.length > 0) {
            flushPendingTkaSubmissionsToFirestore().catch(() => {});
          }
        } else if (
          !tkaSubmissionsCollectionLoadedRef.current &&
          !alreadySeeded &&
          !resetMeta.tkaClearedAt &&
          activeUserRef.current?.role !== 'siswa'
        ) {
          const localSubs = getStoredTKASubmissions();
          if (localSubs.length > 0) {
            tkaSubmissionsCollectionLoadedRef.current = true;
            safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
            saveTkaSubmissionsBatchToFirestore(localSubs).catch((err) =>
              console.warn('Initial TKA submissions seed warning:', err)
            );
          } else {
            tkaSubmissionsCollectionLoadedRef.current = true;
          }
        } else {
          tkaSubmissionsCollectionLoadedRef.current = true;
          markLargeCollectionHydratedFromCloud('sekolahku_tka_submissions');
          safeSetLocalStorage('sekolahku_tka_submissions_seeded', 'true');
          runWithoutStorageSync(() => {
            saveStoredTKASubmissions([]);
          });
        }
      },
      (err) => {
        console.warn('TKA submissions listener warning:', err);
      }
    );

    // Realtime listener langsung untuk koleksi 'cbt_exams' di Firestore (single source of truth Paket Soal CBT)
    const unsubCbtExams = subscribeToCbtExamsCollection(
      async (firestoreCbtExams) => {
        await idbHydrationPromise;
        if (!isMounted) return;
        const alreadySeeded = localStorage.getItem('sekolahku_cbt_exams_seeded') === 'true';

        if (firestoreCbtExams.length > 0) {
          cbtExamsCollectionLoadedRef.current = true;
          markLargeCollectionHydratedFromCloud('sekolahku_cbt_exams');
          safeSetLocalStorage('sekolahku_cbt_exams_seeded', 'true');
          runWithoutStorageSync(() => {
            saveStoredCBTExams(firestoreCbtExams);
          });
        } else if (!cbtExamsCollectionLoadedRef.current && !alreadySeeded) {
          const hasStoredLocal = hasStoredCBTExamsLocal();
          if (hasStoredLocal && activeUserRef.current?.role !== 'siswa') {
            const localExams = getStoredCBTExams();
            if (localExams.length > 0) {
              cbtExamsCollectionLoadedRef.current = true;
              safeSetLocalStorage('sekolahku_cbt_exams_seeded', 'true');
              saveCbtExamsBatchToFirestore(localExams).catch((err) =>
                console.warn('Initial CBT exams seed warning:', err)
              );
            }
          }
        } else {
          cbtExamsCollectionLoadedRef.current = true;
          markLargeCollectionHydratedFromCloud('sekolahku_cbt_exams');
          runWithoutStorageSync(() => {
            saveStoredCBTExams([]);
          });
        }
      },
      (err) => {
        console.warn('CBT exams listener warning:', err);
      }
    );

    idbHydrationPromise.then(() => {
      if (!isMounted) return;
      flushPendingTkaSubmissionsToFirestore().catch(() => {});
      reconcileAndSyncLocalTkaSubmissions().catch(() => {});
    });

    const handleOnlineSync = () => {
      flushPendingTkaSubmissionsToFirestore().catch(() => {});
      reconcileAndSyncLocalTkaSubmissions().catch(() => {});
    };
    window.addEventListener('online', handleOnlineSync);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnlineSync);
      unsubscribe();
      unsubStudents();
      unsubTeachers();
      unsubAttendance();
      unsubKaldik();
      unsubTkaQuestions();
      unsubTkaSubmissions();
      unsubCbtExams();
    };
  }, []);

  // Authentication & Session Persistence with 30-minute auto-logout
  const getInitialSession = (): { user: ActiveUser | null; tab: TabId } => {
    try {
      const storedUser = localStorage.getItem('sekolahku_active_user');
      const lastActivity = localStorage.getItem('sekolahku_last_activity');
      const storedTab = (localStorage.getItem('sekolahku_last_tab') as TabId) || 'dashboard';

      if (storedUser && lastActivity) {
        const timeDiff = Date.now() - Number(lastActivity);
        const THIRTY_MINUTES = 30 * 60 * 1000;
        if (timeDiff < THIRTY_MINUTES) {
          const user = JSON.parse(storedUser);
          return { user, tab: storedTab };
        }
      }
    } catch (e) {
      console.error(e);
    }
    return { user: null, tab: 'dashboard' };
  };

  const initialSession = getInitialSession();
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(initialSession.user);

  useEffect(() => {
    activeUserRef.current = activeUser;
    if (!activeUser) return;
    flushPendingTkaSubmissionsToFirestore().catch(() => {});
    if (students.length > 0) {
      reconcileAndSyncLocalTkaSubmissions(students).catch(() => {});
    }
    if (activeUser.role !== 'siswa' && !adminTkaReconciledRef.current) {
      adminTkaReconciledRef.current = true;
      reconcileTkaFromCloudBackup().catch(() => {});
    }
  }, [activeUser, students]);

  // Filters State
  const [activeYear, setActiveYear] = useState<string>(initialFilters.year);
  const [activeSemester, setActiveSemester] = useState<string>(initialFilters.semester);
  const [activeClass, setActiveClass] = useState<string>(initialFilters.kelas);

  // Sync subjects & activeClassRef whenever activeClass changes to ensure grade-specific CP & TP
  useEffect(() => {
    activeClassRef.current = activeClass;
    setSubjects(getStoredSubjectsForClass(activeClass));
  }, [activeClass]);

  // Navigation State (Menu starts minimized when logged in)
  const [activeTab, setActiveTabState] = useState<TabId>(initialSession.tab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const setActiveTab = (tab: TabId) => {
    setActiveTabState(tab);
    localStorage.setItem('sekolahku_last_tab', tab);
  };

  // Activity tracking and 30-minute inactivity auto-logout
  useEffect(() => {
    if (!activeUser) return;

    const recordActivity = () => {
      localStorage.setItem('sekolahku_last_activity', String(Date.now()));
    };

    const checkInactivity = () => {
      const lastActivity = Number(localStorage.getItem('sekolahku_last_activity') || 0);
      const THIRTY_MINUTES = 30 * 60 * 1000;
      if (lastActivity && Date.now() - lastActivity > THIRTY_MINUTES) {
        setActiveUser(null);
        localStorage.removeItem('sekolahku_active_user');
        localStorage.removeItem('sekolahku_last_activity');
        showToast('Sesi telah berakhir (tidak ada aktivitas selama lebih dari 30 menit). Silakan login kembali.', 'error');
      }
    };

    recordActivity();
    const interval = setInterval(checkInactivity, 15000);
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));

    return () => {
      clearInterval(interval);
      events.forEach((evt) => window.removeEventListener(evt, recordActivity));
    };
  }, [activeUser]);

  // Modals State
  const [zoomModal, setZoomModal] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: '',
  });
  const [isCustomHolidayOpen, setIsCustomHolidayOpen] = useState(false);
  const [monthlyModalYm, setMonthlyModalYm] = useState<string | null>(null);
  const [isGoogleSitesModalOpen, setIsGoogleSitesModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  // Toast System
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; type: 'success' | 'error' }>>([]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  // Sync profile update with cloud
  const handleSaveProfile = (newProfile: SchoolProfile) => {
    setProfile(newProfile);
    saveStoredProfile(newProfile);
    pushAllDataToCloud({ profile: newProfile }, activeUser?.name || 'admin');
  };

  // Sync teachers update directly to dedicated Firestore /teachers collection (supports up to 60 GTK)
  const handleSaveTeachers = (newTeachers: Teacher[]) => {
    const sorted = sortTeachersAlphabetically(newTeachers);
    setTeachers(sorted);
    saveStoredTeachers(sorted);
    replaceTeachersInFirestore(sorted).catch((e) =>
      console.warn('replaceTeachersInFirestore sync warning:', e)
    );
  };

  // Sync students update with cloud (instantly syncs deletions and additions across laptop & tablet)
  const handleSaveStudents = (newStudents: Student[], skipCloudWrite: boolean = false) => {
    const sorted = sortStudentsAlphabetically(newStudents);
    setStudents(sorted);
    saveStoredStudents(sorted);
    if (!skipCloudWrite) {
      saveStudentsToFirestoreBatch(sorted, activeUser?.name || 'admin').catch((e) =>
        console.warn('saveStudentsToFirestoreBatch background sync warning:', e)
      );
    }
  };

  // Sync kaldik update with cloud (dedicated settings/kaldik_days + primary cloud doc)
  const handleSaveKaldik = (newDays: KaldikDay[]) => {
    setKaldikDays(newDays);
    saveStoredKaldik(newDays);
    saveKaldikToFirestore(newDays);
    pushAllDataToCloud({ kaldikDays: newDays }, activeUser?.name || 'admin');
  };

  // Simpan satu catatan kehadiran secara permanen ke koleksi Firestore 'attendance'
  const handleRecordSingleAttendance = async (record: AttendanceRecordItem) => {
    const key = `${record.date}_${record.studentId}`;
    const cleanRecord: AttendanceRecordItem = { ...record, id: key };
    setAttendanceRecords((prev) => {
      const next = { ...prev, [key]: cleanRecord };
      saveStoredAttendance(next);
      return next;
    });
    await saveSingleAttendanceToFirestore(cleanRecord);
  };

  // Simpan banyak catatan kehadiran sekaligus (Tandai Semua Hadir) ke koleksi Firestore 'attendance'
  const handleSaveBatchAttendance = async (records: AttendanceRecordItem[]) => {
    const cleanRecords = records.map((rec) => {
      const key = `${rec.date}_${rec.studentId}`;
      return { ...rec, id: key };
    });
    setAttendanceRecords((prev) => {
      const next = { ...prev };
      cleanRecords.forEach((rec) => {
        next[rec.id] = rec;
      });
      saveStoredAttendance(next);
      return next;
    });
    await saveBatchAttendanceToFirestore(cleanRecords);
  };

  // Hapus catatan kehadiran (Reset Harian / Reset Bulanan di Kalender)
  const handleDeleteAttendanceRecords = async (recordsToDelete: AttendanceRecordItem[]) => {
    const ids = Array.from(
      new Set(
        recordsToDelete
          .flatMap((r) => [r.id, `${r.date}_${r.studentId}`])
          .filter(Boolean)
      )
    );
    setAttendanceRecords((prev) => {
      const next = { ...prev };
      recordsToDelete.forEach((r) => {
        delete next[`${r.date}_${r.studentId}`];
        if (r.id) delete next[r.id];
      });
      saveStoredAttendance(next);
      return next;
    });
    await deleteAttendanceRecordsFromFirestore(ids);
  };

  const handleOpenAttendanceForDate = (dateStr: string) => {
    setSelectedAttendanceDate(dateStr);
    setActiveTab('absensi');
  };

  const handleOpenCalendarForDate = (dateStr: string) => {
    setSelectedCalendarDate(dateStr);
    setActiveTab('kalender');
  };

  // Global filters
  const handleFilterChange = (y: string, s: string, c: string) => {
    setActiveYear(y);
    setActiveSemester(s);
    setActiveClass(c);
    saveActiveFilters(y, s, c);
  };

  // Login & Logout: default always opens Beranda Sekolah ('dashboard')
  const handleLoginSuccess = (user: ActiveUser) => {
    setActiveUser(user);
    localStorage.setItem('sekolahku_active_user', JSON.stringify(user));
    localStorage.setItem('sekolahku_last_activity', String(Date.now()));
    // Bridge userRole & identitas untuk modul standalone asaj.html
    const mappedRole =
      user.role === 'guru'
        ? user.kelasDiampu?.includes('6')
          ? 'guru_kelas_6'
          : 'guru_mapel'
        : user.role;
    localStorage.setItem('userRole', mappedRole);
    localStorage.setItem('userName', user.name || '');
    localStorage.setItem('userNisn', user.studentData?.nisn || '');
    localStorage.setItem('userUid', user.studentData?.id || '');
    setIsSidebarOpen(false); // Menu tampil dalam posisi minimize saat login
    if (user.role === 'siswa') {
      // Selalu tampilkan portal dashboard kartu utama siswa saat baru login
      setActiveTab('dashboard');
      if (user.studentData?.kelas) {
        setActiveClass(user.studentData.kelas);
      }
    } else {
      // Selalu tampilkan menu beranda sekolah saat baru login
      setActiveTab('dashboard');
      if (user.kelasDiampu) {
        setActiveClass(user.kelasDiampu);
      }
    }
  };

  const handleLogout = () => {
    setActiveUser(null);
    setActiveExamStatus(null);
    localStorage.removeItem('sekolahku_active_user');
    localStorage.removeItem('sekolahku_last_activity');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userNisn');
    localStorage.removeItem('userUid');
    showToast('Anda telah keluar dari aplikasi SEKOLAHKU', 'success');
  };

  // Refresh seluruh React state secara langsung setelah restore realtime tanpa reload paksa
  const handleRefreshStateAfterRestore = () => {
    studentsCollectionLoadedRef.current = true;
    teachersCollectionLoadedRef.current = true;
    attendanceCollectionLoadedRef.current = true;
    kaldikDocLoadedRef.current = true;
    tkaQuestionsCollectionLoadedRef.current = true;
    cbtExamsCollectionLoadedRef.current = true;
    localStorage.setItem('sekolahku_students_seeded', 'true');
    localStorage.setItem('sekolahku_teachers_seeded', 'true');
    localStorage.setItem('sekolahku_attendance_seeded', 'true');
    localStorage.setItem('sekolahku_tka_questions_seeded', 'true');
    localStorage.setItem('sekolahku_cbt_exams_seeded', 'true');
    setProfile(getStoredProfile());
    setTeachers(sortTeachersAlphabetically(getStoredTeachers()));
    setStudents(sortStudentsAlphabetically(getStoredStudents()));
    setSubjects(getStoredSubjectsForClass(activeClassRef.current));
    setKaldikDays(getStoredKaldik());
    setAttendanceRecords(getStoredAttendance());
    setRestoreTick((t) => t + 1);
  };

  // Reset to Factory Default
  const handleResetAll = () => {
    if (confirm('Apakah Anda yakin ingin mereset seluruh data ke setelan awal resmi SDN Rawa Badak Utara 21?')) {
      localStorage.clear();
      setProfile(DEFAULT_SCHOOL_PROFILE);
      setTeachers(DEFAULT_TEACHERS);
      setStudents(DEFAULT_STUDENTS);
      setSubjects(DEFAULT_SUBJECTS);
      setKaldikDays(DEFAULT_KALDIK_HOLIDAYS);
      showToast('Seluruh data berhasil di-reset ke standar SDN Rawa Badak Utara 21!', 'success');
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  const todayStr = liveTodayStr;

  return (
    <div className="min-h-screen flex flex-col antialiased selection:bg-rose-500 selection:text-white">
      {/* Toast Notification Stack */}
      <div className="fixed top-4 right-4 z-[999] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`p-3.5 rounded-2xl shadow-xl border-2 text-xs font-display font-extrabold flex items-center gap-2 pointer-events-auto transition-all ${
              t.type === 'error'
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-emerald-600 text-white border-emerald-700'
            }`}
          >
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Modals */}
      <ImageZoomModal
        isOpen={zoomModal.isOpen}
        imageUrl={zoomModal.url}
        title={zoomModal.title}
        onClose={() => setZoomModal({ isOpen: false, url: '', title: '' })}
      />

      <CustomHolidayModal
        isOpen={isCustomHolidayOpen}
        onClose={() => setIsCustomHolidayOpen(false)}
        kaldikDays={kaldikDays}
        onSaveDays={handleSaveKaldik}
        showToast={showToast}
      />

      {monthlyModalYm && (
        <MonthlyAttendanceModal
          isOpen={true}
          onClose={() => setMonthlyModalYm(null)}
          yearMonth={monthlyModalYm}
          students={students.filter((s) => s.kelas === activeClass)}
          attendanceRecords={attendanceRecords}
          kaldikDays={kaldikDays}
        />
      )}

      {/* Change Password Modal for Administrator */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        showToast={showToast}
      />

      {/* Google Sites Guide Modal */}
      {isGoogleSitesModalOpen && (
        <div className="fixed inset-0 z-[900] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-3xl p-6 shadow-2xl border-2 border-rose-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-black text-lg text-slate-800 flex items-center gap-2">
                Panduan Pasang di Google Sites
              </h3>
              <button
                type="button"
                onClick={() => setIsGoogleSitesModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>
            <ol className="text-xs sm:text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>Buka <strong>Google Sites</strong> sekolah Anda, lalu pilih menu <strong>Sisipkan (Insert) &rarr; Sematkan (Embed)</strong>.</li>
              <li>Pilih tab <strong>Sematkan URL (Embed URL)</strong> atau salin URL aplikasi ini.</li>
              <li>Atur ukuran bingkai secara penuh agar tampilan responsif di HP, Tablet, maupun Laptop.</li>
              <li>Aplikasi SEKOLAHKU siap digunakan oleh seluruh guru, murid, dan wali murid!</li>
            </ol>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsGoogleSitesModalOpen(false)}
                className="bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-5 py-2.5 rounded-2xl text-xs cursor-pointer shadow-xs"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* If Not Logged In -> Show Login Screen */}
      {!activeUser ? (
        <LoginScreen
          profile={profile}
          teachers={teachers}
          students={students}
          onLoginSuccess={handleLoginSuccess}
          showToast={showToast}
          onOpenGoogleSitesGuide={() => setIsGoogleSitesModalOpen(true)}
        />
      ) : (
        /* Main App Interface */
        <div className="flex flex-col min-h-screen">
          <Header
            profile={profile}
            activeUser={activeUser}
            year={activeYear}
            semester={activeSemester}
            kelas={activeClass}
            onFilterChange={handleFilterChange}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onLogout={handleLogout}
            onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
            activeExamStatus={activeExamStatus}
          />

          <div className="max-w-[1600px] w-full mx-auto flex-1 flex flex-col lg:flex-row gap-6 p-4 sm:p-6">
            <Sidebar
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              activeUser={activeUser}
              isOpen={isSidebarOpen}
              onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
              onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
            />

            <main className="flex-1 min-w-0 space-y-6">
              <React.Fragment key={`restore_${restoreTick}`}>
              {/* Portal Siswa Khusus: Dashboard Cards, Alur Ujian (CBT & TKA), & Form Laporan 7 Kebiasaan */}
              {activeUser.role === 'siswa' &&
                (activeTab === 'dashboard' ||
                  activeTab === 'ujian' ||
                  activeTab === 'tes-tka-siswa' ||
                  activeTab === 'laporan-kebiasaan') && (
                  <StudentDashboard
                    activeUser={activeUser}
                    students={students}
                    subjects={subjects}
                    activeClass={activeClass}
                    activeYear={activeYear}
                    activeSemester={activeSemester}
                    profile={profile}
                    showToast={showToast}
                    onNavigateTab={setActiveTab}
                    initialTab={activeTab}
                    onExamStatusChange={setActiveExamStatus}
                  />
                )}

              {/* Tab 1: Beranda Sekolah (Khusus Guru / Admin / Kepsek / TU) */}
              {activeUser.role !== 'siswa' && activeTab === 'dashboard' && (
                <DashboardTab
                  profile={profile}
                  activeClass={activeClass}
                  activeYear={activeYear}
                  students={students}
                  teachers={teachers}
                  attendanceRecords={attendanceRecords}
                  todayDate={todayStr}
                  kaldikDays={kaldikDays}
                  onNavigateTab={setActiveTab}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                  onSelectClass={setActiveClass}
                  showToast={showToast}
                  onTriggerSync={async () => {
                    const success = await syncAllLocalToCloud(activeUser?.name || 'admin');
                    if (success) {
                      showToast('Data berhasil disinkronkan ke Cloud Firestore!', 'success');
                    } else {
                      showToast('Sinkronisasi cloud gagal. Cek koneksi internet.', 'error');
                    }
                  }}
                />
              )}

              {/* Tab 1.1: Profil Sekolah */}
              {activeTab === 'profil-sekolah' && (
                <ProfilSekolahTab
                  profile={profile}
                  onSaveProfile={handleSaveProfile}
                  showToast={showToast}
                />
              )}

              {/* Tab 1.2: Guru */}
              {activeTab === 'guru' && (
                <GuruTab
                  teachers={teachers}
                  onSaveTeachers={handleSaveTeachers}
                  showToast={showToast}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                />
              )}

              {/* Tab 2.5: Dashboard Laporan 7 Kebiasaan Siswa (Real-time onSnapshot) */}
              {activeUser.role !== 'siswa' && activeTab === 'laporan-kebiasaan' && (
                <DashboardKebiasaanTab
                  students={students}
                  teachers={teachers}
                  profile={profile}
                  activeClass={activeClass}
                  showToast={showToast}
                />
              )}

              {/* Tab 1.3: Rombel */}
              {activeTab === 'rombel' && (
                <RombelTab
                  activeClass={activeClass}
                  onSelectClass={setActiveClass}
                  students={students}
                  teachers={teachers}
                  onNavigateTab={setActiveTab}
                />
              )}

              {/* Tab 2.1: Siswa */}
              {activeTab === 'siswa' && (
                <SiswaTab
                  students={students}
                  onSaveStudents={handleSaveStudents}
                  profile={profile}
                  activeClass={activeClass}
                  activeYear={activeYear}
                  showToast={showToast}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                  onSelectClass={setActiveClass}
                />
              )}

              {/* Tab 2.2: Scan Absensi Barcode */}
              {activeTab === 'absensi' && (
                <AbsensiTab
                  students={students}
                  activeClass={activeClass}
                  attendanceRecords={attendanceRecords}
                  selectedDate={selectedAttendanceDate}
                  onChangeDate={setSelectedAttendanceDate}
                  liveTodayStr={liveTodayStr}
                  onRecordSingleAttendance={handleRecordSingleAttendance}
                  onSaveBatchAttendance={handleSaveBatchAttendance}
                  onDeleteAttendanceRecords={handleDeleteAttendanceRecords}
                  kaldikDays={kaldikDays}
                  onOpenCalendarForDate={handleOpenCalendarForDate}
                  onNavigateTab={setActiveTab}
                  showToast={showToast}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                />
              )}

              {/* Tab 2.3: Kalender */}
              {activeTab === 'kalender' && (
                <KalenderTab
                  students={students}
                  activeClass={activeClass}
                  attendanceRecords={attendanceRecords}
                  selectedDateProp={selectedCalendarDate}
                  onChangeSelectedDate={setSelectedCalendarDate}
                  liveTodayStr={liveTodayStr}
                  onDeleteAttendanceRecords={handleDeleteAttendanceRecords}
                  onOpenAttendanceForDate={handleOpenAttendanceForDate}
                  kaldikDays={kaldikDays}
                  onSaveKaldik={handleSaveKaldik}
                  onOpenCustomModal={() => setIsCustomHolidayOpen(true)}
                  onNavigateTab={setActiveTab}
                  showToast={showToast}
                />
              )}

              {/* Tab 2.4: Laporan Kehadiran */}
              {activeTab === 'laporan-absensi' && (
                <LaporanAbsensiTab
                  students={students}
                  activeClass={activeClass}
                  activeSemester={activeSemester}
                  attendanceRecords={attendanceRecords}
                  kaldikDays={kaldikDays}
                  onOpenMonthlyModal={(ym) => setMonthlyModalYm(ym)}
                  onNavigateTab={setActiveTab}
                  showToast={showToast}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                />
              )}

              {/* Tab 3: Kurikulum (CP, TP, KKTP, Ekskul, Kokurikuler) */}
              {(activeTab === 'cp' ||
                activeTab === 'tp' ||
                activeTab === 'kktp' ||
                activeTab === 'ekskul' ||
                activeTab === 'kokurikuler') && (
                <KurikulumTabs
                  subType={activeTab}
                  subjects={subjects}
                  teachers={teachers}
                  onUpdateSubjects={(updated, targetClass) => {
                    const cls = targetClass || activeClass;
                    saveStoredSubjectsForClass(cls, updated);
                    if (cls === activeClass) {
                      setSubjects(updated);
                    }
                    const allByClass = getStoredSubjectsByClass();
                    pushAllDataToCloud({ subjects: updated, subjectsByClass: allByClass }, activeUser?.name || 'admin');
                  }}
                  activeClass={activeClass}
                  students={students}
                  showToast={showToast}
                />
              )}

              {/* Tab 4.1: Penilaian & Remedial (Sumatif AS, Rem, ASTS, ASAS) */}
              {activeTab === 'penilaian' && (
                <PenilaianTab
                  subjects={subjects}
                  students={students}
                  activeClass={activeClass}
                  activeYear={activeYear}
                  activeSemester={activeSemester}
                  showToast={showToast}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                />
              )}

              {/* Tab 4.1b: Penilaian Ekstrakurikuler */}
              {activeTab === 'penilaian-ekskul' && (
                <PenilaianEkskulTab
                  students={students}
                  showToast={showToast}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                />
              )}

              {/* Tab 4.2: Catatan Wali */}
              {activeTab === 'catatan' && (
                <CatatanWaliTab
                  students={students}
                  subjects={subjects}
                  activeClass={activeClass}
                  activeYear={activeYear}
                  activeSemester={activeSemester}
                  showToast={showToast}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                />
              )}

              {/* Tab 4.3: Leger */}
              {activeTab === 'leger' && (
                <LegerTab
                  profile={profile}
                  subjects={subjects}
                  students={students}
                  activeClass={activeClass}
                  activeYear={activeYear}
                  activeSemester={activeSemester}
                  showToast={showToast}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                />
              )}

              {/* Tab 4.4: CBT Exam (Bank Soal & Pengaturan untuk Guru/Admin) */}
              {activeUser.role !== 'siswa' && activeTab === 'ujian' && (
                <CBTTab
                  activeUser={activeUser}
                  activeClass={activeClass}
                  students={students}
                  subjects={subjects}
                  onUpdateSubjects={(updated, targetClass) => {
                    const cls = targetClass || activeClass;
                    saveStoredSubjectsForClass(cls, updated);
                    if (cls === activeClass) {
                      setSubjects(updated);
                    }
                    const allByClass = getStoredSubjectsByClass();
                    pushAllDataToCloud({ subjects: updated, subjectsByClass: allByClass }, activeUser?.name || 'admin');
                  }}
                  showToast={showToast}
                />
              )}

              {/* Tab 4.5: Analisis Soal */}
              {activeTab === 'analisis-soal' && (
                <AnalisisSoalTab
                  students={students}
                  activeClass={activeClass}
                  activeYear={activeYear}
                  activeSemester={activeSemester}
                  showToast={showToast}
                />
              )}

              {/* Tab 4.6: e-Rapor Merdeka */}
              {activeTab === 'rapor' && (
                <ERaporTab
                  profile={profile}
                  students={students}
                  teachers={teachers}
                  subjects={subjects}
                  activeClass={activeClass}
                  activeYear={activeYear}
                  activeSemester={activeSemester}
                  showToast={showToast}
                />
              )}

              {/* Tab 4.7: Rapor Kokurikuler P5 */}
              {activeTab === 'rapor-kokurikuler' && (
                <RaporKokurikulerTab
                  profile={profile}
                  students={students}
                  teachers={teachers}
                  activeClass={activeClass}
                  activeYear={activeYear}
                />
              )}

              {/* Tab 4.8: Manajemen ASAJ, Rekapitulasi, SKL & Ijazah / Pengumuman Siswa */}
              {activeTab === 'manajemen-asaj' && (
                <ManajemenASAJTab
                  activeUser={activeUser}
                  profile={profile}
                  students={students}
                  activeYear={activeYear}
                  showToast={showToast}
                />
              )}

              {/* Tab 4.9: Portal Alumni & Arsip Lulusan */}
              {activeUser.role !== 'siswa' && activeTab === 'portal-alumni' && (
                <PortalAlumniTab
                  activeUser={activeUser}
                  profile={profile}
                  students={students}
                  activeYear={activeYear}
                  showToast={showToast}
                />
              )}

              {/* Tab 4.10: Perpustakaan Digital & Literasi (Semua Peran) */}
              {activeTab === 'perpustakaan' && (
                <PerpustakaanTab
                  activeUser={activeUser}
                  profile={profile}
                  students={students}
                  activeClass={activeClass}
                  showToast={showToast}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                />
              )}

              {/* Tab 5: Modul TKA (Siswa TKA, CP & TP TKA, Bank Soal TKA, Analisis Soal TKA) */}
              {activeUser.role !== 'siswa' &&
                (activeTab === 'siswa-tka' ||
                  activeTab === 'cp-tp-tka' ||
                  activeTab === 'bank-soal-tka' ||
                  activeTab === 'analisis-tka' ||
                  activeTab === 'hasil-tka' ||
                  activeTab === 'tes-tka-siswa') && (
                <TKATabs
                  subType={activeTab}
                  students={students}
                  activeUser={activeUser}
                  showToast={showToast}
                  onOpenZoom={(url, title) => setZoomModal({ isOpen: true, url, title })}
                />
              )}
              </React.Fragment>

              {/* Tab 6: 2 Logo & Backup Data */}
              {activeTab === 'backup' && (
                <BackupTab
                  profile={profile}
                  onSaveProfile={handleSaveProfile}
                  showToast={showToast}
                  onResetAll={handleResetAll}
                  activeUserName={activeUser.name}
                  onBackupRestored={handleRefreshStateAfterRestore}
                  isAdmin={activeUser.role === 'admin'}
                  onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
                />
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
