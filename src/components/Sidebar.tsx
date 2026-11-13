import React, { useState } from 'react';
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
} from 'lucide-react';
import { ActiveUser } from '../types';

export type TabId =
  | 'dashboard'
  | 'profil-sekolah'
  | 'guru'
  | 'rombel'
  | 'siswa'
  | 'absensi'
  | 'kalender'
  | 'laporan-absensi'
  | 'laporan-kebiasaan'
  | 'cp'
  | 'tp'
  | 'kktp'
  | 'ekskul'
  | 'kokurikuler'
  | 'penilaian'
  | 'penilaian-ekskul'
  | 'catatan'
  | 'leger'
  | 'ujian'
  | 'analisis-soal'
  | 'rapor'
  | 'rapor-kokurikuler'
  | 'backup'
  | 'siswa-tka'
  | 'cp-tp-tka'
  | 'bank-soal-tka'
  | 'analisis-tka'
  | 'hasil-tka'
  | 'tes-tka-siswa'
  | 'manajemen-asaj'
  | 'portal-alumni';

interface Props {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  activeUser: ActiveUser;
  isOpen: boolean;
  onOpenZoom: (url: string, title: string) => void;
  onOpenChangePassword?: () => void;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  activeUser,
  isOpen,
  onOpenZoom,
  onOpenChangePassword,
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

  const toggleGroup = (grp: string) => {
    setOpenGroups((prev) => ({ ...prev, [grp]: !prev[grp] }));
  };

  const isStudent = activeUser.role === 'siswa';

  if (!isOpen) return null;

  return (
    <aside className="w-full lg:w-72 shrink-0 no-print transition-all duration-300">
      <div className="bg-white rounded-[2rem] shadow-md border-2 border-rose-100 p-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto sidebar-scroll space-y-3.5">
        {/* User profile card */}
        <div className="p-4 rounded-3xl bg-gradient-to-br from-rose-50/90 via-white to-amber-50/70 border border-rose-200 flex items-center gap-3">
          <img
            src={activeUser.fotoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
            alt="Foto Profil"
            onClick={() => onOpenZoom(activeUser.fotoUrl, 'Foto Profil Pengguna')}
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

            <button
              onClick={() => onSelectTab('rapor-kokurikuler')}
              className={`w-full px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-3 text-left transition ${
                activeTab === 'rapor-kokurikuler'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-md'
                  : 'text-slate-700 hover:bg-rose-50'
              }`}
            >
              <Sprout className="w-5 h-5 text-emerald-500" />
              <span>Rapor Kokurikuler (P5)</span>
            </button>

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
                  {(!searchQuery || 'siswa akun barcode nisn foto'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('siswa')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'siswa'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-sky-50'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Siswa, Akun & Barcode</span>
                    </button>
                  )}
                  {(!searchQuery || 'scan absensi barcode kamera'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('absensi')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'absensi'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-sky-50'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Scan Absensi Barcode</span>
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
                  {(!searchQuery || 'kokurikuler p5 projek profil pelajar pancasila'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('kokurikuler')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'kokurikuler'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-amber-50'
                      }`}
                    >
                      <Sprout className="w-4 h-4" />
                      <span>Menu Kokurikuler (P5)</span>
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
                  {(!searchQuery || 'leger rekap nilai ranking xlsx'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('leger')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'leger'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Table className="w-4 h-4" />
                      <span>Leger / Rekap Nilai</span>
                    </button>
                  )}
                  {(!searchQuery || 'bank soal ujian cbt online'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('ujian')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'ujian'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Laptop className="w-4 h-4" />
                      <span>Bank Soal & Ujian CBT</span>
                    </button>
                  )}
                  {(!searchQuery || 'analisis butir soal grafik'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('analisis-soal')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'analisis-soal'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>Analisis Soal & Grafik</span>
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
                  {(!searchQuery || 'rapor kokurikuler p5 cetak'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('rapor-kokurikuler')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'rapor-kokurikuler'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Award className="w-4 h-4" />
                      <span>Rapor Kokurikuler (P5)</span>
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
                  {(!searchQuery || 'portal alumni arsip lulusan buku induk ijazah skl rapor migrasi'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('portal-alumni')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'portal-alumni'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Archive className="w-4 h-4" />
                      <span>Portal Alumni &amp; Arsip Lulusan</span>
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
                  {(!searchQuery || 'siswa tka kelas 6a 6b tes kemampuan akademik'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('siswa-tka')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'siswa-tka'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Siswa TKA (Kelas 6A & 6B)</span>
                    </button>
                  )}
                  {(!searchQuery || 'cp dan tp tka capaian tujuan tka literasi numerasi sains ipas'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('cp-tp-tka')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'cp-tp-tka'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      <Compass className="w-4 h-4" />
                      <span>CP dan TP TKA</span>
                    </button>
                  )}
                  {(!searchQuery || 'bank soal tka simulasi 1 6 tryout tka 1 5 import xlsx csv'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('bank-soal-tka')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'bank-soal-tka'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      <FileQuestion className="w-4 h-4" />
                      <span>Bank Soal TKA & Simulasi</span>
                    </button>
                  )}
                  {(!searchQuery || 'analisis soal tka butir daya beda tingkat kesukaran'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('analisis-tka')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'analisis-tka'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>Analisis Soal TKA</span>
                    </button>
                  )}
                  {(!searchQuery || 'report hasil nilai tka skor siswa ujian peringkat'.includes(searchQuery)) && (
                    <button
                      onClick={() => onSelectTab('hasil-tka')}
                      className={`w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition ${
                        activeTab === 'hasil-tka'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      <Award className="w-4 h-4" />
                      <span>Report & Hasil TKA</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* GRUP 6: 6. PENGATURAN & SISTEM */}
            <div className="rounded-2xl border border-slate-200 bg-slate-100/80 overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => toggleGroup('group5')}
                className="w-full px-4 py-3 bg-slate-200/70 hover:bg-slate-200 flex items-center justify-between text-left transition"
              >
                <span className="font-display font-black text-xs uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-600" />
                  <span>6. PENGATURAN & SISTEM</span>
                </span>
                {openGroups.group5 ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>
              {openGroups.group5 && (
                <div className="p-2 space-y-1 bg-white/80 border-t border-slate-200">
                  {(!searchQuery || 'backup logo restore kemendikbud monas'.includes(searchQuery)) && (
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
                  {activeUser.role === 'admin' && onOpenChangePassword && (!searchQuery || 'ganti password sandi admin administrator'.includes(searchQuery)) && (
                    <button
                      type="button"
                      onClick={onOpenChangePassword}
                      className="w-full px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-2.5 text-left transition text-rose-700 bg-rose-50/70 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4 text-rose-600" />
                      <span>Ganti Password Admin</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </nav>
        )}
      </div>
    </aside>
  );
};
