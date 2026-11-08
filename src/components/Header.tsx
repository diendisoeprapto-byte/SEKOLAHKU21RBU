import { Menu, Calendar, Clock, GraduationCap, Power, KeyRound } from 'lucide-react';
import { SchoolProfile, ActiveUser } from '../types';
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
}) => {
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
                SEKOLAHKU • {profile.name}
              </span>
              <span className="bg-yellow-300 text-slate-900 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                {activeUser.role}
              </span>
            </div>
            <p className="text-xs text-rose-100">
              {profile.name} • {profile.provinsi} • Kurikulum Merdeka
            </p>
          </div>
        </div>

        {/* Filters and Profile */}
        <div className="flex flex-wrap items-center gap-2.5">
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

              <div className="flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-yellow-300" />
                <select
                  value={kelas}
                  onChange={(e) => onFilterChange(year, semester, e.target.value)}
                  className="bg-white text-slate-800 font-display font-extrabold text-xs px-2.5 py-1 rounded-xl outline-none cursor-pointer"
                >
                  {CLASSES_LIST.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* User profile with photo */}
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

          {activeUser.role === 'admin' && onOpenChangePassword && (
            <button
              type="button"
              onClick={onOpenChangePassword}
              className="bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-display font-black text-xs px-3 py-2 rounded-2xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              title="Ganti Password Administrator"
            >
              <KeyRound className="w-3.5 h-3.5 text-slate-900" />
              <span className="hidden sm:inline">Ganti Password</span>
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
