import React, { useMemo, useEffect, useState, useRef } from 'react';
import { Menu, Calendar, Clock, GraduationCap, Power, KeyRound, Lock, Camera, MapPin, Compass, ChevronDown } from 'lucide-react';
import { SchoolProfile, ActiveUser, ActiveExamHeaderStatus, hasAdminMenuAccess } from '../types';
import { ACADEMIC_YEARS, CLASSES_LIST } from '../utils/storage';
import { useLiveLocation } from '../utils/liveLocation';
import { LiveLocationModal } from './modals/LiveLocationModal';

interface Props {
  profile: SchoolProfile;
  activeUser: ActiveUser;
  year: string;
  semester: string;
  kelas: string;
  onFilterChange: (year: string, semester: string, kelas: string) => void;
  onToggleSidebar: () => void;
  onLogout: () => void;
  onOpenChangePassword?: () => void;
  onOpenAdminProfile?: () => void;
  activeExamStatus?: ActiveExamHeaderStatus | null;
  onLogoSecretClick?: () => void;
  isExamActive?: boolean;
}

export const Header: React.FC<Props> = ({
  profile,
  activeUser,
  year,
  semester,
  kelas,
  onFilterChange,
  onToggleSidebar,
  onLogout,
  onOpenChangePassword,
  onOpenAdminProfile,
  activeExamStatus,
  onLogoSecretClick,
  isExamActive = false,
}) => {
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { location, isCalibrating, refreshLocation } = useLiveLocation();

  // Kunci tombol keluar HANYA berlaku jika siswa sedang aktif mengerjakan soal ujian (timer & soal berjalan).
  // Ketika belum masuk/mulai ujian atau sedang membuka menu lain, tombol keluar selalu aktif.
  const isStudentTakingExam =
    activeUser.role === 'siswa' &&
    Boolean(isExamActive) &&
    Boolean(activeExamStatus?.isRunning);

  const isAdminAccess = hasAdminMenuAccess(activeUser);

  // Tutup menu profil user saat klik di luar atau tekan tombol Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  // Deteksi peran user: Kepsek, Administrator, Guru Mata Pelajaran, Tata Usaha, atau Guru Kelas
  const isGuruKelas = useMemo(() => {
    if (activeUser.role !== 'guru') return false;
    const detailLower = (activeUser.detail || '').toLowerCase();
    const usernameLower = (activeUser.username || '').toLowerCase();

    // Kepala Sekolah
    if (detailLower.includes('kepala sekolah') || detailLower.includes('kepsek') || usernameLower.includes('kepsek')) {
      return false;
    }
    // Tata Usaha
    if (detailLower.includes('tata usaha') || detailLower.includes('tu') || usernameLower.includes('tu')) {
      return false;
    }
    // Guru Mata Pelajaran
    if (
      detailLower.includes('mata pelajaran') ||
      detailLower.includes('mapel') ||
      detailLower.includes('paibp') ||
      detailLower.includes('agama') ||
      detailLower.includes('pjok') ||
      detailLower.includes('inggris')
    ) {
      return false;
    }

    // Jika memiliki penugasan kelas spesifik (e.g. "Kelas 6A", "Kelas 1B")
    return Boolean(activeUser.kelasDiampu || detailLower.startsWith('kelas'));
  }, [activeUser]);

  const assignedClass = activeUser.kelasDiampu || (activeUser.detail?.match(/Kelas\s*[1-6][A-B]/i)?.[0]) || kelas;

  // Pastikan kelas aktif guru kelas otomatis terkunci ke kelas yang diampunya
  useEffect(() => {
    if (isGuruKelas && assignedClass && kelas !== assignedClass) {
      onFilterChange(year, semester, assignedClass);
    }
  }, [isGuruKelas, assignedClass, kelas, year, semester, onFilterChange]);

  return (
    <header className="bg-gradient-to-r from-rose-600 via-rose-700 to-red-600 text-white shadow-lg sticky top-0 z-40 no-print">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Left Side: Brand, Logo & Sidebar Toggle */}
        <div className="flex items-center gap-3">
          {!isStudentTakingExam && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="flex w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 text-white items-center justify-center text-lg border border-white/30 transition cursor-pointer"
              title="Klik untuk Buka/Tutup Menu Samping Kiri"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div
            onClick={onLogoSecretClick}
            className="flex items-center gap-3 select-none cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <img
                src={profile.logoKemendikbudUrl}
                alt="Logo Kemendikbud"
                className="w-10 h-10 rounded-2xl bg-white p-1 object-contain shadow-md border-2 border-sky-300 shrink-0"
              />
              <img
                src={profile.logoSekolahUrl}
                alt="Logo Sekolah"
                className="w-10 h-10 rounded-2xl bg-white p-1 object-contain shadow-md border-2 border-yellow-300 shrink-0"
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-black text-lg sm:text-xl tracking-tight">
                  SERBU 21 • {profile.name}
                </span>
                <span className="bg-yellow-300 text-slate-900 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                  {activeUser.role}
                </span>
              </div>
              <p className="text-xs text-rose-100">
                Sistem Edukasi, Rapor, dan Basis Data Utama • {profile.provinsi} • Kurikulum Merdeka
              </p>
            </div>
          </div>
        </div>

        {/* Center: Tahun Ajaran, Semester, & Kelas Filters */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 my-1 sm:my-0">
          {activeUser.role !== 'siswa' && (
            <div className="flex flex-wrap items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/25 shadow-inner">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-yellow-300" />
                <select
                  value={year}
                  onChange={(e) => onFilterChange(e.target.value, semester, kelas)}
                  className="bg-white text-slate-800 font-display font-extrabold text-xs px-2.5 py-1 rounded-xl outline-none cursor-pointer"
                >
                  {ACADEMIC_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-yellow-300" />
                <select
                  value={semester}
                  onChange={(e) => onFilterChange(year, e.target.value, kelas)}
                  className="bg-white text-slate-800 font-display font-extrabold text-xs px-2.5 py-1 rounded-xl outline-none cursor-pointer"
                >
                  <option value="Semester 1">Semester 1 (Ganjil)</option>
                  <option value="Semester 2">Semester 2 (Genap)</option>
                </select>
              </div>

              {/* Dropdown Kelas: Guru Kelas hanya melihat kelasnya dan terkunci, Kepsek / Admin / Guru Mapel / TU bebas memilih kelas */}
              {isGuruKelas ? (
                <div
                  className="flex items-center gap-1.5 bg-yellow-300/25 px-2.5 py-1 rounded-xl border border-yellow-300/60 cursor-not-allowed shadow-2xs select-none"
                  title={`Menu kelas terkunci: Anda login sebagai Guru Kelas ${assignedClass}. Guru Kelas hanya dapat mengampu dan mengakses kelasnya.`}
                >
                  <Lock className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                  <span className="font-display font-extrabold text-xs text-yellow-100 whitespace-nowrap">
                    {assignedClass}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-yellow-300" />
                  <select
                    value={kelas}
                    onChange={(e) => onFilterChange(year, semester, e.target.value)}
                    className="bg-white text-slate-800 font-display font-extrabold text-xs px-2.5 py-1 rounded-xl outline-none cursor-pointer"
                    title="Pilih Kelas (Akses Terbuka untuk Kepsek, Administrator, Guru Mapel, dan Tata Usaha)"
                  >
                    {CLASSES_LIST.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Live Location (above user) + User Profile on the Far Right */}
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {activeExamStatus?.isRunning && (
            <div className="flex items-center gap-3 bg-slate-900/95 text-white px-3.5 py-1.5 rounded-2xl border-2 border-yellow-400 shadow-md">
              <div className="flex items-center gap-2 font-mono">
                <Clock
                  className={`w-4 h-4 shrink-0 ${
                    activeExamStatus.timeLeft <= 300 ? 'text-rose-400 animate-pulse' : 'text-yellow-400'
                  }`}
                />
                <div className="leading-tight">
                  <span className="text-[9px] font-bold text-yellow-200 uppercase block leading-none">
                    Sisa Waktu
                  </span>
                  <span
                    className={`text-base sm:text-lg font-black leading-tight ${
                      activeExamStatus.timeLeft <= 300 ? 'text-rose-400 animate-pulse' : 'text-yellow-400'
                    }`}
                  >
                    {String(Math.floor(activeExamStatus.timeLeft / 60)).padStart(2, '0')}:
                    {String(activeExamStatus.timeLeft % 60).padStart(2, '0')}
                  </span>
                </div>
              </div>
              <div className="h-7 w-px bg-white/20" />
              <div className="leading-tight">
                <span className="text-[9px] font-bold text-slate-300 uppercase block leading-none">
                  Nomor Soal
                </span>
                <span className="text-xs sm:text-sm font-black text-white whitespace-nowrap">
                  {activeExamStatus.currentQuestion} dari {activeExamStatus.totalQuestions}
                </span>
              </div>
            </div>
          )}

          {/* Stack: Location Badge (Above) & User Profile Button (Below) */}
          <div className="flex flex-col items-end gap-1.5">
            {!isStudentTakingExam && (
              <button
                type="button"
                onClick={() => setIsLocationModalOpen(true)}
                className="group flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white transition cursor-pointer text-[11px] font-bold shadow-2xs active:scale-95"
                title="Klik untuk melihat detail GPS Live, koordinat presisi, dan jadwal sholat realtime"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300"></span>
                </span>
                <MapPin className="w-3 h-3 text-yellow-300 group-hover:scale-110 transition shrink-0" />
                <span className="truncate max-w-[120px] sm:max-w-[160px] font-semibold text-white">
                  {location.locationName}
                </span>
                <span className="hidden sm:inline text-[9px] bg-black/25 px-1.5 py-0.5 rounded font-mono text-yellow-200">
                  {location.activePrayer
                    ? `Sholat ${location.activePrayer}`
                    : location.nextPrayer
                    ? `${location.nextPrayer.name} ${location.nextPrayer.time}`
                    : 'Live'}
                </span>
              </button>
            )}

            {/* User Profile */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((prev) => !prev)}
                className={`group flex items-center gap-2 sm:gap-2.5 px-3 py-1.5 rounded-2xl border transition cursor-pointer select-none text-left ${
                  isUserMenuOpen
                    ? 'bg-white/25 border-yellow-300 shadow-md ring-2 ring-yellow-300/40'
                    : 'bg-white/15 hover:bg-white/25 border-white/25'
                }`}
                title="Klik nama user untuk membuka menu akun & pilihan keluar"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="true"
              >
                <div className="relative shrink-0">
                  <img
                    src={
                      activeUser.role === 'admin'
                        ? profile.adminFotoUrl || activeUser.fotoUrl || profile.logoSekolahUrl
                        : activeUser.fotoUrl || profile.adminFotoUrl || profile.logoSekolahUrl
                    }
                    alt={activeUser.name}
                    className="w-8 h-8 rounded-xl object-cover bg-white border border-yellow-300 shadow-2xs"
                  />
                  <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[8px] font-bold shadow-2xs ring-1 ring-white">
                    ✓
                  </span>
                </div>
                <div className="text-left leading-tight max-w-[120px] sm:max-w-[150px]">
                  <div className="font-display font-extrabold text-xs text-white truncate group-hover:text-yellow-200 transition">
                    {activeUser.name}
                  </div>
                  <div className="text-[10px] text-yellow-200 font-semibold truncate">
                    {activeUser.detail || (activeUser.role === 'admin' ? 'Administrator' : activeUser.role)}
                  </div>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-white/80 transition-transform duration-200 shrink-0 ${
                    isUserMenuOpen ? 'rotate-180 text-yellow-300' : 'group-hover:translate-y-0.5'
                  }`}
                />
              </button>

              {/* Dropdown Menu Pilihan Akun & Keluar */}
              {isUserMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-3xl shadow-2xl border-2 border-rose-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-slate-800">
                  {/* Header Profil User */}
                  <div className="p-4 bg-gradient-to-br from-rose-50 via-white to-amber-50/70 border-b border-rose-100">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          activeUser.role === 'admin'
                            ? profile.adminFotoUrl || activeUser.fotoUrl || profile.logoSekolahUrl
                            : activeUser.fotoUrl || profile.adminFotoUrl || profile.logoSekolahUrl
                        }
                        alt={activeUser.name}
                        className="w-12 h-12 rounded-2xl object-cover bg-white border-2 border-rose-500 shadow-xs shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-block text-[10px] font-black uppercase bg-rose-600 text-white px-2 py-0.5 rounded-full tracking-wider leading-none">
                            {activeUser.role}
                          </span>
                          {activeUser.kelasDiampu && (
                            <span className="inline-block text-[10px] font-black uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full leading-none">
                              {activeUser.kelasDiampu}
                            </span>
                          )}
                        </div>
                        <h4 className="font-display font-black text-sm text-slate-800 truncate mt-1.5" title={activeUser.name}>
                          {activeUser.name}
                        </h4>
                        <p className="text-xs text-slate-500 truncate">{activeUser.detail || activeUser.username}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-rose-100/80 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="truncate">{profile.name}</span>
                      <span className="font-bold text-rose-600 shrink-0">{year} • {semester}</span>
                    </div>
                  </div>

                  {/* Daftar Pilihan Menu Akun */}
                  <div className="p-2 space-y-1">
                    {isAdminAccess && onOpenAdminProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenAdminProfile();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                          <Camera className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-slate-800">Ubah Logo & Foto Profil</div>
                          <div className="text-[10px] text-slate-400 font-medium">Pengaturan logo sekolah & avatar</div>
                        </div>
                      </button>
                    )}

                    {isAdminAccess && onOpenChangePassword && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenChangePassword();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-800 transition cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                          <KeyRound className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-slate-800">Rubah Password Admin</div>
                          <div className="text-[10px] text-slate-400 font-medium">Perbarui kata sandi administrator</div>
                        </div>
                      </button>
                    )}

                    {isAdminAccess && (
                      <div className="my-1 border-t border-slate-100" />
                    )}

                    {/* Pilihan Menu Keluar: Terkunci HANYA saat siswa sedang aktif mengerjakan ujian */}
                    {!isStudentTakingExam ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left text-xs font-bold text-rose-600 hover:bg-rose-600 hover:text-white transition group cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 group-hover:bg-white group-hover:text-rose-600 flex items-center justify-center shrink-0 transition">
                          <Power className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-rose-700 group-hover:text-white transition">
                            Keluar dari Akun
                          </div>
                          <div className="text-[10px] text-rose-400 group-hover:text-rose-100 font-medium transition">
                            Akhiri sesi login aplikasi SERBU 21
                          </div>
                        </div>
                      </button>
                    ) : (
                      <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 text-xs">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Keluar Terkunci</span>
                        </div>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Sesi ujian sedang aktif. Selesaikan atau kumpulkan ujian terlebih dahulu.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Detail Lokasi Live & Jadwal Sholat */}
      <LiveLocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        location={location}
        isCalibrating={isCalibrating}
        onRefresh={refreshLocation}
      />
    </header>
  );
};
