import React, { useState, useEffect } from 'react';
import {
  Home,
  Building,
  School,
  Users,
  CalendarDays,
  QrCode,
  PieChart,
  BookOpen,
  Compass,
  Target,
  CheckSquare,
  Award,
  Sprout,
  GraduationCap,
  Edit3,
  MessageSquare,
  Table,
  Laptop,
  BarChart3,
  Printer,
  Settings,
  Database,
  Search,
  ChevronDown,
  ChevronRight,
  FileQuestion,
  Sparkles,
  KeyRound,
  HeartHandshake,
  Archive,
  Camera,
  Presentation,
  MessageCircleHeart,
  ShieldAlert,
} from 'lucide-react';
import {
  ActiveExamHeaderStatus,
  ActiveUser,
  SchoolProfile,
  Student,
  hasAdminMenuAccess,
  isAbkExcludedFromTka,
} from '../types';
import { isEndiSoepraptoUser } from '../utils/sarahAttachments';

export const canAccessLearningAdmin = (user: ActiveUser, profile?: SchoolProfile): boolean => {
  if (user.role === 'siswa') return false;
  if (user.role === 'admin') return true;
  if (isEndiSoepraptoUser(user) || (user.name || '').toLowerCase().includes('endi soeprapto') || (user.username || '').toLowerCase().includes('endi')) return true;
  if ((user.detail || '').toLowerCase().includes('kepala sekolah')) return true;
  if (profile?.isLearningAdminPublic) return true;
  return false;
};

export type TabId =
  | 'dashboard'
  | 'profil-sekolah'
  | 'guru'
  | 'rombel'
  | 'siswa'
  | 'verifikasi-inklusi'
  | 'absensi'
  | 'kalender'
  | 'laporan-absensi'
  | 'laporan-kebiasaan'
  | 'cp'
  | 'tp'
  | 'kktp'
  | 'ekskul'
  | 'kokurikuler'
  | 'media-ajar'
  | 'penilaian'
  | 'penilaian-ekskul'
  | 'catatan'
  | 'leger'
  | 'ujian'
  | 'pengaturan-cbt'
  | 'analisis-soal'
  | 'rapor'
  | 'backup'
  | 'siswa-tka'
  | 'cp-tp-tka'
  | 'bank-soal-tka'
  | 'pengaturan-tka'
  | 'analisis-tka'
  | 'hasil-tka'
  | 'tes-tka-siswa'
  | 'manajemen-asaj'
  | 'portal-alumni'
  | 'perpustakaan'
  | 'asisten-sarah'
  | 'administrasi-pembelajaran'
  | 'super-access-endi';

interface Props {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  activeUser: ActiveUser;
  profile?: SchoolProfile;
  students?: Student[];
  isOpen: boolean;
  onOpenZoom: (url: string, title: string) => void;
  onOpenChangePassword?: () => void;
  onOpenAdminProfile?: () => void;
  activeExamStatus?: ActiveExamHeaderStatus | null;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  activeUser,
  profile,
  students = [],
  isOpen,
  onOpenZoom,
  onOpenChangePassword,
  onOpenAdminProfile,
  activeExamStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    group1: false,
    group2: false,
    group3: false,
    group4: false,
    groupTka: false,
    group5: false,
  });

  useEffect(() => {
    setOpenGroups((prev) => ({ ...prev, group5: false }));
  }, [activeUser.role, activeUser.username]);

  const toggleGroup = (grp: string) => {
    setOpenGroups((prev) => ({ ...prev, [grp]: !prev[grp] }));
  };

  const isStudent = activeUser.role === 'siswa';
  const isAdminAccess = hasAdminMenuAccess(activeUser);
  const isStudentTakingExam = isStudent && Boolean(activeExamStatus?.isRunning);

  if (!isOpen) return null;

  return (
    <aside className="w-full lg:w-72 shrink-0 no-print transition-all duration-300">
      <div className="bg-white rounded-[2rem] shadow-md border-2 border-rose-100 p-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto sidebar-scroll space-y-3.5">
        {/* User profile card */}
        <div className="p-4 rounded-3xl bg-gradient-to-br from-rose-50/90 via-white to-amber-50/70 border border-rose-200 space-y-2.5">
          <div className="flex items-center gap-3">
            <img
              src={
                activeUser.role === 'admin'
                  ? profile?.adminFotoUrl || activeUser.fotoUrl || profile?.logoSekolahUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                  : activeUser.fotoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
              }
              alt="Foto Profil"
              onClick={() =>
                onOpenZoom(
                  activeUser.role === 'admin'
                    ? profile?.adminFotoUrl || activeUser.fotoUrl || profile?.logoSekolahUrl || ''
                    : activeUser.fotoUrl,
                  'Foto Profil Pengguna'
                )
              }
              className="w-12 h-12 rounded-2xl object-cover border-2 border-rose-600 shadow-xs bg-white cursor-zoom-in shrink-0"
            />
            <div className="min-w-0 flex-1">
              <span className="inline-block text-[10px] font-extrabold uppercase bg-rose-600 text-white px-2.5 py-0.5 rounded-full leading-tight">
                {activeUser.role}
              </span>
              <h4 className="font-display font-black text-sm text-slate-800 truncate mt-1">
                {activeUser.name}
              </h4>
              <p className="text-xs text-slate-500 truncate">{activeUser.detail}</p>
            </div>
          </div>
          {isAdminAccess && onOpenAdminProfile && (
            <button
              type="button"
              onClick={onOpenAdminProfile}
              className="w-full px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-display font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-rose-600" />
              <span>Ubah Logo / Foto Profil Admin</span>
            </button>
          )}
        </div>

        {/* Quick Access: Asisten SARAH (di atas Cari Menu, di bawah Nama User; dihilangkan saat siswa ujian CBT/TKA) */}
        {isStudent ? (
          !isStudentTakingExam && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('serbu21-open-tanya-sarah'))}
              className="w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center justify-between gap-2 text-left transition bg-gradient-to-r from-rose-50 via-pink-50 to-indigo-50 border-2 border-rose-200 text-rose-900 hover:from-rose-100 hover:to-indigo-100 shadow-2xs cursor-pointer"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <MessageCircleHeart className="w-5 h-5 text-rose-600 shrink-0" />
                <span className="truncate">Tanya SARAH (Tutor AI)</span>
              </span>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-600 text-white shrink-0">
                AI
              </span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => onSelectTab('asisten-sarah')}
            className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center justify-between gap-2 text-left transition border-2 cursor-pointer ${
              activeTab === 'asisten-sarah'
                ? 'bg-gradient-to-r from-rose-600 via-rose-700 to-indigo-700 text-white shadow-md border-transparent'
                : 'border-rose-200 bg-gradient-to-r from-rose-50/90 via-pink-50/80 to-indigo-50/90 text-indigo-950 hover:from-rose-100 hover:to-indigo-100'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Sparkles
                className={`w-5 h-5 shrink-0 ${
                  activeTab === 'asisten-sarah' ? 'text-amber-300' : 'text-rose-600'
                }`}
              />
              <span className="truncate">Asisten SARAH (AI)</span>
            </span>
            <span
              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                activeTab === 'asisten-sarah'
                  ? 'bg-white/20 text-white'
                  : 'bg-rose-600 text-white'
              }`}
            >
              AI
            </span>
          </button>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
            placeholder="Cari menu atau sub-menu..."
            className="w-full pl-9 pr-3 py-2 rounded-2xl border border-rose-200 bg-rose-50/30 focus:bg-white focus:border-rose-600 outline-none text-xs font-bold text-slate-700"
          />
        </div>

        {/* Student Navigation */}
        {isStudent ? (
          <nav className="space-y-1.5">
            <button
              onClick={() => onSelectTab('dashboard')}
              className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-md'
                  : 'text-slate-700 hover:bg-rose-50'
              }`}
            >
              <Home className="w-5 h-5 text-rose-500" />
              <span>Beranda Siswa (Dashboard)</span>
            </button>

            <button
              onClick={() => onSelectTab('ujian')}
              className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition ${
                activeTab === 'ujian'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-md'
                  : 'text-slate-700 hover:bg-rose-50'
              }`}
            >
              <Laptop className="w-5 h-5 text-rose-500" />
              <span>Ujian CBT Siswa</span>
            </button>

            <button
              onClick={() => onSelectTab('rapor')}
              className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition ${
                activeTab === 'rapor'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-md'
                  : 'text-slate-700 hover:bg-rose-50'
              }`}
            >
              <Award className="w-5 h-5 text-amber-500" />
              <span>Hasil e-Rapor Saya</span>
            </button>

            {(() => {
              const ad = activeUser.studentData;
              const liveStudent =
                students.find(
                  (s) =>
                    (ad?.id && s.id === ad.id) ||
                    (ad?.nisn && s.nisn === ad.nisn) ||
                    (activeUser.username &&
                      (s.username || '').toLowerCase() === activeUser.username.toLowerCase())
                ) || ad;
              if (isAbkExcludedFromTka(liveStudent)) return null;
              return (
                <button
                  onClick={() => onSelectTab('tes-tka-siswa')}
                  className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition ${
                    activeTab === 'tes-tka-siswa'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                      : 'text-slate-700 hover:bg-purple-50'
                  }`}
                >
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  <span>Tes Kemampuan Akademik (TKA)</span>
                </button>
              );
            })()}

            <button
              onClick={() => onSelectTab('laporan-kebiasaan')}
              className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition ${
                activeTab === 'laporan-kebiasaan'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md'
                  : 'text-slate-700 hover:bg-amber-50'
              }`}
            >
              <HeartHandshake className="w-5 h-5 text-amber-500" />
              <span>Laporan 7 Kebiasaan</span>
            </button>

            <button
              onClick={() => onSelectTab('manajemen-asaj')}
              className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition ${
                activeTab === 'manajemen-asaj'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-700 hover:bg-emerald-50'
              }`}
            >
              <GraduationCap className="w-5 h-5 text-emerald-600" />
              <span>Pengumuman Kelulusan (ASAJ)</span>
            </button>

            <button
              onClick={() => onSelectTab('perpustakaan')}
              className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition ${
                activeTab === 'perpustakaan'
                  ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-md'
                  : 'text-slate-700 hover:bg-rose-50'
              }`}
            >
              <BookOpen className={`w-5 h-5 ${activeTab === 'perpustakaan' ? 'text-white' : 'text-rose-600'}`} />
              <span>Perpustakaan Digital</span>
            </button>

            <button
              onClick={() => onSelectTab('media-ajar')}
              className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition ${
                activeTab === 'media-ajar'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-md'
                  : 'text-slate-700 hover:bg-rose-50'
              }`}
            >
              <Presentation className={`w-5 h-5 ${activeTab === 'media-ajar' ? 'text-white' : 'text-rose-600'}`} />
              <span>Bank Media Ajar (PPT)</span>
            </button>

            {canAccessLearningAdmin(activeUser, profile) && (!searchQuery || 'administrasi pembelajaran supervisi perangkat ajar jurnal'.includes(searchQuery)) && (
              <button
                onClick={() => onSelectTab('administrasi-pembelajaran')}
                className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition ${
                  activeTab === 'administrasi-pembelajaran'
                    ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-md'
                    : 'text-slate-700 hover:bg-rose-50 border border-rose-200 bg-rose-50/40'
                }`}
              >
                <BookOpen className={`w-5 h-5 ${activeTab === 'administrasi-pembelajaran' ? 'text-white' : 'text-rose-600'}`} />
                <span>Administrasi Pembelajaran</span>
              </button>
            )}
          </nav>
        ) : (
          /* Admin / Guru Navigation */
          <nav className="space-y-2.5">
            {/* Top Standalone: Beranda Sekolah */}
            {(!searchQuery || 'beranda sekolah dashboard'.includes(searchQuery)) && (
              <button
                onClick={() => onSelectTab('dashboard')}
                className={`w-full px-4 py-3.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition border ${
                  activeTab === 'dashboard'
                    ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-md border-transparent'
                    : 'border-rose-200 bg-rose-50/70 text-rose-900 hover:bg-rose-100'
                }`}
              >
                <Home className="w-5 h-5" />
                <span>Beranda Sekolah</span>
              </button>
            )}

            {/* GRUP 1: 1. MANAJEMEN */}
            <div className="rounded-2xl border border-rose-100 bg-rose-50/50 overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => toggleGroup('group1')}
                className="w-full px-4 py-3 bg-rose-50/80 hover:bg-rose-100/70 flex items-center justify-between text-left transition"
              >
                <span className="font-display font-black text-xs uppercase tracking-wider text-rose-900 flex items-center gap-2">
                  <Building className="w-4 h-4 text-rose-600" />
                  <span>1. MANAJEMEN</span>
                </span>
                {openGroups.group1 ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>
              {openGroups.group1 && (
                <div className="p-2 space-y-1 bg-white/80 border-t border-rose-100">
                  {(!searchQuery || 'profil sekolah identitas npsn kepala sekolah'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('profil-sekolah')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'profil-sekolah'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-rose-50'
                      }`}
                    >
                      <School className="w-4 h-4" />
                      <span>Data Profil Sekolah</span>
                    </button>
                  )}
                  {(!searchQuery || 'guru kepegawaian foto nip'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('guru')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'guru'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-rose-50'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Data & Foto Guru</span>
                    </button>
                  )}
                  {(!searchQuery || 'rombel kelas rombongan belajar wali'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('rombel')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'rombel'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-rose-50'
                      }`}
                    >
                      <School className="w-4 h-4" />
                      <span>Rombel Kelas</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* GRUP 2: 2. SISWA & KEHADIRAN */}
            <div className="rounded-2xl border border-sky-200/80 bg-sky-50/60 overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => toggleGroup('group2')}
                className="w-full px-4 py-3 bg-sky-50/90 hover:bg-sky-100/70 flex items-center justify-between text-left transition"
              >
                <span className="font-display font-black text-xs uppercase tracking-wider text-sky-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-600" />
                  <span>2. SISWA & KEHADIRAN</span>
                </span>
                {openGroups.group2 ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>
              {openGroups.group2 && (
                <div className="p-2 space-y-1 bg-white/80 border-t border-sky-100">
                  {(!searchQuery || 'data siswa akun barcode nisn foto verifikasi inklusi abk'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('siswa')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'siswa' || activeTab === 'verifikasi-inklusi'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-sky-50'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Data Siswa</span>
                    </button>
                  )}
                  {(!searchQuery || 'scan absensi barcode wajah kamera face id'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('absensi')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'absensi'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-sky-50'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Scan Absensi</span>
                    </button>
                  )}
                  {(!searchQuery || 'kalender pendidikan kaldik libur dki jakarta'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('kalender')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'kalender'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-sky-50'
                      }`}
                    >
                      <CalendarDays className="w-4 h-4" />
                      <span>Kalender Pendidikan</span>
                    </button>
                  )}
                  {(!searchQuery || 'laporan kehadiran grafik persentase bulanan'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('laporan-absensi')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'laporan-absensi'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-sky-50'
                      }`}
                    >
                      <PieChart className="w-4 h-4" />
                      <span>Laporan Kehadiran</span>
                    </button>
                  )}
                  {(!searchQuery || 'laporan 7 kebiasaan siswa dashboard realtime onsnapshot'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('laporan-kebiasaan')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'laporan-kebiasaan'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-sky-50'
                      }`}
                    >
                      <CheckSquare className="w-4 h-4" />
                      <div className="flex items-center justify-between flex-1">
                        <span>Laporan 7 Kebiasaan</span>
                        <span className="text-[9px] bg-emerald-500 text-white font-black px-1.5 py-0.5 rounded-full">
                          Live
                        </span>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* GRUP 3: 3. KURIKULUM & PERANGKAT */}
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => toggleGroup('group3')}
                className="w-full px-4 py-3 bg-amber-50/90 hover:bg-amber-100/70 flex items-center justify-between text-left transition"
              >
                <span className="font-display font-black text-xs uppercase tracking-wider text-amber-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-600" />
                  <span>3. KURIKULUM & PERANGKAT</span>
                </span>
                {openGroups.group3 ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>
              {openGroups.group3 && (
                <div className="p-2 space-y-1 bg-white/80 border-t border-amber-100">
                  {(!searchQuery || 'cp capaian pembelajaran'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('cp')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'cp'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-amber-50'
                      }`}
                    >
                      <Compass className="w-4 h-4" />
                      <span>Capaian Pembelajaran (CP)</span>
                    </button>
                  )}
                  {(!searchQuery || 'tp tujuan pembelajaran'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('tp')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'tp'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-amber-50'
                      }`}
                    >
                      <Target className="w-4 h-4" />
                      <span>Tujuan Pembelajaran (TP)</span>
                    </button>
                  )}
                  {(!searchQuery || 'kktp kriteria ketercapaian merdeka'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('kktp')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'kktp'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-amber-50'
                      }`}
                    >
                      <CheckSquare className="w-4 h-4" />
                      <span>KKTP Kurikulum Merdeka</span>
                    </button>
                  )}
                  {(!searchQuery || 'ekskul ekstrakurikuler pramuka tari'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('ekskul')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'ekskul'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-amber-50'
                      }`}
                    >
                      <Award className="w-4 h-4" />
                      <span>Menu Ekstrakurikuler</span>
                    </button>
                  )}
                  {(!searchQuery || 'kokurikuler projek profil pelajar pancasila'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('kokurikuler')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'kokurikuler'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-amber-50'
                      }`}
                    >
                      <Sprout className="w-4 h-4" />
                      <span>Menu Kokurikuler</span>
                    </button>
                  )}
                  {(!searchQuery || 'bank media ajar ppt slide presentasi powerpoint materi drive'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('media-ajar')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'media-ajar'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-amber-50'
                      }`}
                    >
                      <Presentation className="w-4 h-4" />
                      <span>Bank Media Ajar (PPT)</span>
                    </button>
                  )}

                  {canAccessLearningAdmin(activeUser, profile) && (!searchQuery || 'administrasi pembelajaran supervisi perangkat ajar jurnal'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('administrasi-pembelajaran')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'administrasi-pembelajaran'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-amber-50'
                      }`}
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Administrasi Pembelajaran</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* GRUP 4: 4. PENILAIAN & PELAPORAN */}
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => toggleGroup('group4')}
                className="w-full px-4 py-3 bg-emerald-50/90 hover:bg-emerald-100/70 flex items-center justify-between text-left transition"
              >
                <span className="font-display font-black text-xs uppercase tracking-wider text-emerald-900 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                  <span>4. PENILAIAN & PELAPORAN</span>
                </span>
                {openGroups.group4 ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>
              {openGroups.group4 && (
                <div className="p-2 space-y-1 bg-white/80 border-t border-emerald-100">
                  {(!searchQuery || 'penilaian sumatif as remedial asts asas na'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('penilaian')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'penilaian'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Penilaian & Remedial</span>
                    </button>
                  )}
                  {(!searchQuery || 'penilaian ekstrakurikuler ekskul predikat kualitatif pencapaian'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('penilaian-ekskul')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'penilaian-ekskul'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Award className="w-4 h-4" />
                      <span>Penilaian Ekstrakurikuler</span>
                    </button>
                  )}
                  {(!searchQuery || 'catatan wali kelas kenaikan'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('catatan')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'catatan'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Catatan Wali Kelas</span>
                    </button>
                  )}
                  {(!searchQuery || 'leger rekap nilai ranking xlsx analisis butir soal grafik'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('leger')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'leger' || activeTab === 'analisis-soal'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Table className="w-4 h-4" />
                      <span>Leger &amp; Analisis Soal</span>
                    </button>
                  )}
                  {(!searchQuery || 'bank soal ujian cbt online pengaturan sesi aktivasi waktu acak jawaban'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('ujian')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'ujian' || activeTab === 'pengaturan-cbt'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Laptop className="w-4 h-4" />
                      <span>Bank Soal &amp; Sesi CBT</span>
                    </button>
                  )}
                  {(!searchQuery || 'rapor e-rapor cetak a4 f4'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('rapor')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'rapor'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Printer className="w-4 h-4" />
                      <span>e-Rapor Merdeka</span>
                    </button>
                  )}
                  {(!searchQuery || 'manajemen asaj skl ijazah kelulusan kosp'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('manajemen-asaj')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'manajemen-asaj'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <GraduationCap className="w-4 h-4" />
                      <span>Manajemen ASAJ</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* GRUP 5: 5. TES KEMAMPUAN AKADEMIK (TKA) */}
            <div className="rounded-2xl border border-purple-200/80 bg-purple-50/60 overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => toggleGroup('groupTka')}
                className="w-full px-4 py-3 bg-purple-50/90 hover:bg-purple-100/70 flex items-center justify-between text-left transition"
              >
                <span className="font-display font-black text-xs uppercase tracking-wider text-purple-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>5. TKA (TES KEMAMPUAN AKADEMIK)</span>
                </span>
                {openGroups.groupTka ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>
              {openGroups.groupTka && (
                <div className="p-2 space-y-1 bg-white/80 border-t border-purple-100">
                  {(!searchQuery || 'siswa tka kelas 6 6a 6b 6c 6d tes kemampuan akademik'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('siswa-tka')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'siswa-tka'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Siswa TKA (Kelas 6)</span>
                    </button>
                  )}
                  {(!searchQuery || 'cp dan tp tka kompetensi sub kompetensi capaian tujuan tka literasi numerasi sains ipas'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('cp-tp-tka')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'cp-tp-tka'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      <Compass className="w-4 h-4" />
                      <span>Kompetensi TKA</span>
                    </button>
                  )}
                  {(!searchQuery || 'bank soal tka simulasi 1 6 tryout tka 1 5 import xlsx csv pengaturan soal waktu ujian acak jawaban'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('bank-soal-tka')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'bank-soal-tka' || activeTab === 'pengaturan-tka'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      <FileQuestion className="w-4 h-4" />
                      <span>Bank Soal &amp; Pengaturan TKA</span>
                    </button>
                  )}
                  {(!searchQuery || 'analisis soal tka butir daya beda tingkat kesukaran report hasil nilai tka skor siswa ujian peringkat'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('analisis-tka')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'analisis-tka' || activeTab === 'hasil-tka'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>Analisis &amp; Report Hasil TKA</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* MENU 6 (TERPISAH DI BAWAH TKA): 6. PORTAL ALUMNI & ARSIP LULUSAN */}
            {(!searchQuery || '6 portal alumni arsip lulusan buku induk ijazah skl rapor migrasi'.includes(searchQuery)) && (
              <button
                type="button"
                onClick={() => onSelectTab('portal-alumni')}
                className={`w-full px-4 py-3 rounded-2xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-between text-left transition border shadow-2xs cursor-pointer ${
                  activeTab === 'portal-alumni'
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white border-transparent shadow-md'
                    : 'border-teal-200/80 bg-teal-50/70 text-teal-900 hover:bg-teal-100/70'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Archive className={`w-4 h-4 ${activeTab === 'portal-alumni' ? 'text-white' : 'text-teal-600'}`} />
                  <span>6. PORTAL ALUMNI &amp; ARSIP</span>
                </span>
                <ChevronRight className={`w-4 h-4 ${activeTab === 'portal-alumni' ? 'text-white/90' : 'text-teal-600/70'}`} />
              </button>
            )}

            {/* MENU 7: 7. PERPUSTAKAAN DIGITAL */}
            {(!searchQuery || '7 perpustakaan digital buku literasi duta baca peminjaman barcode sibi'.includes(searchQuery)) && (
              <button
                type="button"
                onClick={() => onSelectTab('perpustakaan')}
                className={`w-full px-4 py-3 rounded-2xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-between text-left transition border shadow-2xs cursor-pointer ${
                  activeTab === 'perpustakaan'
                    ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white border-transparent shadow-md'
                    : 'border-rose-200/80 bg-rose-50/70 text-rose-900 hover:bg-rose-100/70'
                }`}
              >
                <span className="flex items-center gap-2">
                  <BookOpen className={`w-4 h-4 ${activeTab === 'perpustakaan' ? 'text-white' : 'text-rose-600'}`} />
                  <span>7. PERPUSTAKAAN DIGITAL</span>
                </span>
                <ChevronRight className={`w-4 h-4 ${activeTab === 'perpustakaan' ? 'text-white/90' : 'text-rose-600/70'}`} />
              </button>
            )}

            {/* GRUP 8: 8. PENGATURAN & SISTEM */}
            <div className="rounded-2xl border border-slate-200 bg-slate-100/80 overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => toggleGroup('group5')}
                className="w-full px-4 py-3 bg-slate-200/70 hover:bg-slate-200 flex items-center justify-between text-left transition"
              >
                <span className="font-display font-black text-xs uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-600" />
                  <span>8. PENGATURAN &amp; SISTEM</span>
                </span>
                {openGroups.group5 || Boolean(searchQuery) ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>
              {(openGroups.group5 || Boolean(searchQuery)) && (
                <div className="p-2 space-y-1 bg-white/80 border-t border-slate-200">
                  {(!searchQuery || 'backup logo restore kemendikbud monas pemulihan data hapus riwayat tka cbt'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('backup')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'backup'
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Database className="w-4 h-4" />
                      <span>2 Logo & Backup Data</span>
                    </button>
                  )}
                  {isAdminAccess && onOpenAdminProfile && (!searchQuery || 'ubah ganti logo foto profil admin avatar sekolah kemendikbud'.includes(searchQuery)) && (
                    <button
                      type="button"
                      onClick={onOpenAdminProfile}
                      className="w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition text-sky-800 bg-sky-50/80 hover:bg-sky-100 border border-sky-200 cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-sky-600" />
                      <span>Ubah Logo &amp; Foto Profil Admin</span>
                    </button>
                  )}
                  {isAdminAccess && onOpenChangePassword && (!searchQuery || 'rubah ganti ubah password sandi admin administrator'.includes(searchQuery)) && (
                    <button
                      type="button"
                      onClick={onOpenChangePassword}
                      className="w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition text-rose-700 bg-rose-50/70 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4 text-rose-600" />
                      <span>Rubah Password Admin</span>
                    </button>
                  )}
                  {isEndiSoepraptoUser(activeUser) && activeUser.role !== 'siswa' && (!searchQuery || 'pengaturan sistem cadangan admin endi soeprapto foto login screen pemulihan reset super akses'.includes(searchQuery)) && (
                    <button
                      type="button"
                      onClick={() => onSelectTab('super-access-endi')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition cursor-pointer ${
                        activeTab === 'super-access-endi'
                          ? 'bg-gradient-to-r from-indigo-700 to-purple-700 text-white shadow-sm'
                          : 'text-indigo-900 bg-indigo-50/90 hover:bg-indigo-100 border border-indigo-200'
                      }`}
                    >
                      <ShieldAlert className={`w-4 h-4 shrink-0 ${activeTab === 'super-access-endi' ? 'text-amber-300' : 'text-indigo-600'}`} />
                      <span className="leading-snug">Pengaturan Sistem &amp; Cadangan Admin (Khusus Endi Soeprapto)</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {isAdminAccess && onOpenChangePassword && (!searchQuery || 'rubah ganti ubah password sandi admin administrator'.includes(searchQuery)) && (
              <button
                type="button"
                onClick={onOpenChangePassword}
                className="w-full px-4 py-3 rounded-2xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-between text-left transition border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 shadow-2xs cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-700" />
                  <span>RUBAH PASSWORD ADMIN</span>
                </span>
                <ChevronRight className="w-4 h-4 text-amber-700/80" />
              </button>
            )}
          </nav>
        )}
      </div>
    </aside>
  );
};
