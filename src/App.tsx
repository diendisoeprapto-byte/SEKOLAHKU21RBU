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
import { StudentDashboard } from './components/StudentDashboard';
import { testConnection } from './utils/firebase';
import {
  pullAllDataFromCloud,
  pushAllDataToCloud,
  subscribeToCloudChanges,
  syncAllLocalToCloud,
} from './utils/cloudSync';

export default function App() {
  // Database States
  const [profile, setProfile] = useState<SchoolProfile>(getStoredProfile());
  const [teachers, setTeachers] = useState<Teacher[]>(getStoredTeachers());
  const [students, setStudents] = useState<Student[]>(getStoredStudents());
  const initialFilters = getActiveFilters();
  const [subjects, setSubjects] = useState<Subject[]>(() => getStoredSubjectsForClass(initialFilters.kelas));
  const [kaldikDays, setKaldikDays] = useState<KaldikDay[]>(getStoredKaldik());
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecordItem>>(
    getStoredAttendance()
  );

  // Test Firebase connection & Multi-device Cloud Sync
  useEffect(() => {
    testConnection();

    const applyCloudPayload = (cloudData: any) => {
      if (!cloudData) return;
      if (cloudData.profile) {
        setProfile(cloudData.profile);
        saveStoredProfile(cloudData.profile);
      }
      if (cloudData.teachers) {
        setTeachers(cloudData.teachers);
        saveStoredTeachers(cloudData.teachers);
      }
      if (cloudData.students) {
        setStudents(cloudData.students);
        saveStoredStudents(cloudData.students);
      }
      if (cloudData.subjectsByClass) {
        localStorage.setItem('sekolahku_subjects_by_class', JSON.stringify(cloudData.subjectsByClass));
        const currentClassSubjects = getStoredSubjectsForClass(initialFilters.kelas);
        setSubjects(currentClassSubjects);
      } else if (cloudData.subjects) {
        setSubjects(cloudData.subjects);
        saveStoredSubjects(cloudData.subjects);
      }
      if (cloudData.kaldikDays) {
        setKaldikDays(cloudData.kaldikDays);
        saveStoredKaldik(cloudData.kaldikDays);
      }
      if (cloudData.attendance) {
        setAttendanceRecords(cloudData.attendance);
        saveStoredAttendance(cloudData.attendance);
      }
      if (cloudData.ekskulList) {
        localStorage.setItem('sekolahku_ekskul_list', JSON.stringify(cloudData.ekskulList));
      }
      if (cloudData.penilaianEkskul) {
        localStorage.setItem('sekolahku_penilaian_ekskul', JSON.stringify(cloudData.penilaianEkskul));
      }
      if (cloudData.reportNotes) {
        saveStoredReportNotes(cloudData.reportNotes);
      }
    };

    // Pull initial cloud state if available
    pullAllDataFromCloud().then((cloudData) => {
      if (cloudData && (cloudData.students || cloudData.teachers || cloudData.profile)) {
        applyCloudPayload(cloudData);
      } else {
        // Seed initial local data into cloud if cloud is freshly created
        syncAllLocalToCloud('initial_seed');
      }
    });

    // Realtime listener for cross-device updates (Laptop <-> Tablet)
    const unsubscribe = subscribeToCloudChanges((cloudData) => {
      if (cloudData) {
        applyCloudPayload(cloudData);
      }
    });

    return () => unsubscribe();
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

  // Filters State
  const [activeYear, setActiveYear] = useState<string>(initialFilters.year);
  const [activeSemester, setActiveSemester] = useState<string>(initialFilters.semester);
  const [activeClass, setActiveClass] = useState<string>(initialFilters.kelas);

  // Sync subjects whenever activeClass changes to ensure grade-specific CP & TP
  useEffect(() => {
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

  // Sync teachers update with cloud
  const handleSaveTeachers = (newTeachers: Teacher[]) => {
    setTeachers(newTeachers);
    saveStoredTeachers(newTeachers);
    pushAllDataToCloud({ teachers: newTeachers }, activeUser?.name || 'admin');
  };

  // Sync students update with cloud (instantly syncs deletions and additions across laptop & tablet)
  const handleSaveStudents = (newStudents: Student[]) => {
    setStudents(newStudents);
    saveStoredStudents(newStudents);
    pushAllDataToCloud({ students: newStudents }, activeUser?.name || 'admin');
  };

  // Sync kaldik update with cloud
  const handleSaveKaldik = (newDays: KaldikDay[]) => {
    setKaldikDays(newDays);
    saveStoredKaldik(newDays);
    pushAllDataToCloud({ kaldikDays: newDays }, activeUser?.name || 'admin');
  };

  // Sync attendance update with cloud
  const handleSaveAttendance = (newRecords: Record<string, AttendanceRecordItem>) => {
    setAttendanceRecords(newRecords);
    saveStoredAttendance(newRecords);
    pushAllDataToCloud({ attendance: newRecords }, activeUser?.name || 'admin');
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
    localStorage.removeItem('sekolahku_active_user');
    localStorage.removeItem('sekolahku_last_activity');
    showToast('Anda telah keluar dari aplikasi SEKOLAHKU', 'success');
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

  const todayStr = new Date().toISOString().split('T')[0];

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
                />
              )}

              {/* Tab 2.2: Scan Absensi Barcode */}
              {activeTab === 'absensi' && (
                <AbsensiTab
                  students={students}
                  activeClass={activeClass}
                  attendanceRecords={attendanceRecords}
                  onSaveAttendance={handleSaveAttendance}
                  kaldikDays={kaldikDays}
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
                  onSaveAttendance={handleSaveAttendance}
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

              {/* Tab 6: 2 Logo & Backup Data */}
              {activeTab === 'backup' && (
                <BackupTab
                  profile={profile}
                  onSaveProfile={handleSaveProfile}
                  showToast={showToast}
                  onResetAll={handleResetAll}
                />
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
