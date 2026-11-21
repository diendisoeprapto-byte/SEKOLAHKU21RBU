import React, { useMemo, useEffect } from 'react';
import { Menu, Calendar, Clock, GraduationCap, Power, KeyRound, Lock, Camera } from 'lucide-react';
import { SchoolProfile, ActiveUser, ActiveExamHeaderStatus } from '../types';
import { ACADEMIC_YEARS, CLASSES_LIST } from '../utils/storage';

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
}) => {
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
        {/* Brand & Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 text-white items-center justify-center text-lg border border-white/30 transition cursor-pointer"
            title="Klik untuk Buka/Tutup Menu Samping Kiri"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div
            onClick={onLogoSecretClick}
            className="flex items-center gap-3 select-none"
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

        {/* Filters and Profile */}
        <div className="flex flex-wrap items-center gap-2.5">
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

          {activeUser.role !== 'siswa' && (
            <div className="flex flex-wrap items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/25">
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

          {/* User profile with photo */}
          {activeUser.role === 'admin' && onOpenAdminProfile ? (
            <button
              type="button"
              onClick={onOpenAdminProfile}
              className="group flex items-center gap-2.5 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-2xl border border-white/25 transition cursor-pointer"
              title="Ubah Logo & Foto Profil Admin"
            >
              <div className="relative shrink-0">
                <img
                  src={profile.adminFotoUrl || activeUser.fotoUrl || profile.logoSekolahUrl}
                  alt="Foto User"
                  className="w-8 h-8 rounded-xl object-cover bg-white border border-yellow-300"
                />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-yellow-400 text-slate-900 flex items-center justify-center shadow-xs group-hover:scale-110 transition">
                  <Camera className="w-2.5 h-2.5" />
                </span>
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <div className="font-display font-extrabold text-xs text-white truncate max-w-[120px]">
                  {activeUser.name}
                </div>
                <div className="text-[10px] text-yellow-200 font-semibold truncate max-w-[120px]">
                  Ubah Logo / Foto
                </div>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2.5 bg-white/15 px-3 py-1.5 rounded-2xl border border-white/25">
              <img
                src={activeUser.fotoUrl || profile.logoSekolahUrl}
                alt="Foto User"
                className="w-8 h-8 rounded-xl object-cover bg-white border border-yellow-300"
              />
              <div className="hidden sm:block text-left leading-tight">
                <div className="font-display font-extrabold text-xs text-white truncate max-w-[120px]">
                  {activeUser.name}
                </div>
                <div className="text-[10px] text-yellow-200 font-semibold truncate max-w-[120px]">
                  {activeUser.detail}
                </div>
              </div>
            </div>
          )}

          {activeUser.role === 'admin' && onOpenChangePassword && (
            <button
              type="button"
              onClick={onOpenChangePassword}
              className="bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-display font-black text-xs px-3 py-2 rounded-2xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              title="Rubah Password Administrator"
            >
              <KeyRound className="w-3.5 h-3.5 text-slate-900 shrink-0" />
              <span>Rubah Password</span>
            </button>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="bg-white text-rose-700 hover:bg-rose-50 font-display font-extrabold text-xs px-3.5 py-2 rounded-2xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Power className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </div>
    </header>
  );
};
