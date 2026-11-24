import React, { useEffect, useRef, useState } from 'react';
import {
  User,
  Lock,
  ArrowRight,
  ShieldCheck,
  Globe,
  Eye,
  EyeOff,
  AlertCircle,
  History,
  X,
  CheckCircle2,
  Sparkles,
  GraduationCap,
  Users,
  Briefcase,
} from 'lucide-react';
import { SchoolProfile, Teacher, Student, ActiveUser } from '../types';
import { getStoredAdminPassword } from '../utils/storage';
import { SYSTEM_CREDIT_TEXT } from '../utils/ownershipWatermark';
import {
  APP_VERSION,
  RELEASE_DATE_SHORT,
  CHANGELOG_LIST,
  checkAndBumpAppVersionCache,
} from '../utils/appVersion';
import schoolIllustration from '../assets/images/school_education_illustration_1795173778080.jpg';

interface Props {
  profile: SchoolProfile;
  teachers: Teacher[];
  students: Student[];
  onLoginSuccess: (user: ActiveUser) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenGoogleSitesGuide: () => void;
  onLogoSecretClick?: () => void;
}

type LoginRoleTab = 'siswa' | 'guru' | 'wali_murid' | 'admin';

const REMEMBER_LOGIN_STORAGE_KEY = 'serbu21_remember_login_v1';

const HERO_IMAGE_CANDIDATES = [
  '/assets/image_13.png',
  '/image_13.png',
  schoolIllustration,
];

const ROLE_OPTIONS: Array<{
  id: LoginRoleTab;
  label: string;
  hint: string;
}> = [
  { id: 'siswa', label: 'Siswa', hint: 'Username / NISN siswa' },
  { id: 'guru', label: 'Guru', hint: 'Username guru / pegawai' },
  { id: 'wali_murid', label: 'Wali Murid', hint: 'Username / NISN ananda' },
  { id: 'admin', label: 'Admin', hint: 'Username admin sistem' },
];

export const LoginScreen: React.FC<Props> = ({
  profile,
  teachers,
  students,
  onLoginSuccess,
  showToast,
  onOpenGoogleSitesGuide,
  onLogoSecretClick,
}) => {
  const [selectedRole, setSelectedRole] = useState<LoginRoleTab>(() => {
    try {
      const raw = localStorage.getItem(REMEMBER_LOGIN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (['siswa', 'guru', 'wali_murid', 'admin'].includes(parsed?.role)) {
          return parsed.role as LoginRoleTab;
        }
      }
    } catch {
      // ignore storage errors
    }
    return 'siswa';
  });

  const [username, setUsername] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(REMEMBER_LOGIN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.username === 'string') return parsed.username;
      }
    } catch {
      // ignore
    }
    return '';
  });

  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REMEMBER_LOGIN_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  });

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [heroSrcIdx, setHeroSrcIdx] = useState(0);
  const [heroAllFailed, setHeroAllFailed] = useState(false);
  const [schoolLogoSrc, setSchoolLogoSrc] = useState<string>(
    profile.logoSekolahUrl || '/assets/image_7.png'
  );
  const [parallaxOffset, setParallaxOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const visualPaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSchoolLogoSrc(profile.logoSekolahUrl || '/assets/image_7.png');
  }, [profile.logoSekolahUrl]);

  useEffect(() => {
    const res = checkAndBumpAppVersionCache();
    if (res.upgraded) {
      showToast(`Aplikasi berhasil diperbarui ke versi ${res.currentVersion}`, 'success');
    }
  }, [showToast]);

  useEffect(() => {
    const handleScrollParallax = () => {
      const scrollY = window.scrollY || 0;
      setParallaxOffset((prev) => ({ ...prev, y: Math.min(28, scrollY * 0.14) }));
    };
    window.addEventListener('scroll', handleScrollParallax, { passive: true });
    return () => window.removeEventListener('scroll', handleScrollParallax);
  }, []);

  const persistRememberPreference = (shouldRemember: boolean, uname: string, role: LoginRoleTab) => {
    try {
      if (shouldRemember && uname.trim()) {
        localStorage.setItem(
          REMEMBER_LOGIN_STORAGE_KEY,
          JSON.stringify({ username: uname.trim(), role })
        );
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  };

  const handleHeroError = () => {
    if (heroSrcIdx + 1 < HERO_IMAGE_CANDIDATES.length) {
      setHeroSrcIdx((prev) => prev + 1);
    } else {
      setHeroAllFailed(true);
    }
  };

  const handleMouseMoveVisual = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = visualPaneRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const normX = (e.clientX - rect.left) / rect.width - 0.5;
    const normY = (e.clientY - rect.top) / rect.height - 0.5;
    setParallaxOffset({
      x: Math.round(normX * -10),
      y: Math.round(normY * -10),
    });
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const u = username.trim().toLowerCase();
    const p = password.trim();

    if (!u || !p) {
      const msg = 'Username/NISN dan password wajib diisi sesuai data aplikasi SERBU 21.';
      setLoginError(msg);
      showToast(msg, 'error');
      return;
    }

    // 1. Verifikasi Akun Administrator
    const storedAdminPass = getStoredAdminPassword().trim();
    const isAdminPassCustomized = localStorage.getItem('sekolahku_admin_password') !== null;
    if (u === 'admin') {
      if (selectedRole !== 'admin' && selectedRole !== 'guru') {
        const msg = 'Akun Administrator menggunakan pilihan peran "Admin". Silakan pilih peran Admin.';
        setLoginError(msg);
        showToast(msg, 'error');
        return;
      }
      if (p === storedAdminPass || (!isAdminPassCustomized && (p === 'admin' || p === '123'))) {
        persistRememberPreference(rememberMe, username, 'admin');
        onLoginSuccess({
          role: 'admin',
          username: 'admin',
          name: 'Administrator Utama',
          detail: `Admin ${profile.name}`,
          fotoUrl: profile.adminFotoUrl || profile.logoSekolahUrl,
        });
        showToast('Berhasil masuk sebagai Administrator!', 'success');
        return;
      }
      const msg = 'Password Administrator tidak sesuai dengan data aplikasi SERBU 21.';
      setLoginError(msg);
      showToast(msg, 'error');
      return;
    }

    // 2. Verifikasi Akun Guru / Pegawai
    const matchedTeacherByUsername = teachers.find(
      (t) => Boolean(t.username?.trim()) && t.username.trim().toLowerCase() === u
    );
    if (matchedTeacherByUsername) {
      if (selectedRole === 'siswa' || selectedRole === 'wali_murid') {
        const msg = 'Username ini terdaftar sebagai Guru/Pegawai. Silakan pilih peran "Guru".';
        setLoginError(msg);
        showToast(msg, 'error');
        return;
      }
      const expectedTeacherPass = (matchedTeacherByUsername.password || '').trim();
      if (expectedTeacherPass && p === expectedTeacherPass) {
        persistRememberPreference(rememberMe, username, 'guru');
        onLoginSuccess({
          role: 'guru',
          username: matchedTeacherByUsername.username,
          name: matchedTeacherByUsername.nama,
          detail: matchedTeacherByUsername.penugasan,
          fotoUrl: matchedTeacherByUsername.fotoUrl,
          kelasDiampu: matchedTeacherByUsername.penugasan.startsWith('Kelas')
            ? matchedTeacherByUsername.penugasan
            : undefined,
        });
        showToast(`Selamat datang, ${matchedTeacherByUsername.nama}!`, 'success');
        return;
      }
      const msg = 'Password Guru/Pegawai tidak sesuai dengan data aplikasi SERBU 21.';
      setLoginError(msg);
      showToast(msg, 'error');
      return;
    }

    // 3. Verifikasi Akun Siswa / Wali Murid
    const matchedStudents = students.filter((s) => {
      const sUser = (s.username || '').trim().toLowerCase();
      const sNisn = (s.nisn || '').trim().toLowerCase();
      const sBarcode = (s.barcodeId || '').trim().toLowerCase();
      return (
        (sUser !== '' && sUser === u) ||
        (sNisn !== '' && sNisn === u) ||
        (sBarcode !== '' && sBarcode === u)
      );
    });

    if (matchedStudents.length > 0) {
      const validStudent = matchedStudents.find((s) => {
        const expectedStudentPass = (s.password || '').trim();
        return expectedStudentPass !== '' && p === expectedStudentPass;
      });
      if (validStudent) {
        persistRememberPreference(rememberMe, username, selectedRole);
        const isWali = selectedRole === 'wali_murid';
        onLoginSuccess({
          role: 'siswa',
          username: validStudent.username,
          name: validStudent.nama,
          detail: isWali
            ? `Wali Murid · ${validStudent.kelas} • ${validStudent.nisn}`
            : `${validStudent.kelas} • ${validStudent.nisn}`,
          fotoUrl: validStudent.fotoUrl,
          studentData: validStudent,
        });
        showToast(
          isWali
            ? `Selamat datang, Wali Murid dari ${validStudent.nama}!`
            : `Selamat datang, ${validStudent.nama}!`,
          'success'
        );
        return;
      }
      const msg = 'Password Siswa/Wali Murid tidak sesuai dengan data aplikasi SERBU 21.';
      setLoginError(msg);
      showToast(msg, 'error');
      return;
    }

    const msg = 'Login ditolak! Username/NISN atau password tidak terdaftar di data aplikasi SERBU 21.';
    setLoginError(msg);
    showToast(msg, 'error');
  };

  const activeRoleHint =
    ROLE_OPTIONS.find((r) => r.id === selectedRole)?.hint || 'Username / NISN';

  return (
    <section className="min-h-screen w-full flex flex-col md:flex-row bg-white">
      {/* LEFT COLUMN: Visual Pendopo Hero (Hidden on mobile < md) */}
      <div
        ref={visualPaneRef}
        onMouseMove={handleMouseMoveVisual}
        onMouseLeave={() => setParallaxOffset({ x: 0, y: 0 })}
        className="hidden md:block md:w-[58%] lg:w-[60%] relative overflow-hidden bg-slate-900 min-h-screen select-none"
      >
        {!heroAllFailed ? (
          <img
            src={HERO_IMAGE_CANDIDATES[heroSrcIdx]}
            alt="Anak-anak SD belajar bersama di pendopo SDN Rawa Badak Utara 21"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={handleHeroError}
            style={{
              transform: `translate3d(${parallaxOffset.x}px, ${parallaxOffset.y}px, 0) scale(1.04)`,
            }}
            className="h-full w-full object-cover object-[42%_center] transition-transform duration-300 ease-out"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-900 via-rose-950 to-slate-900" />
        )}

        {/* Scrim overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-black/35 pointer-events-none"
          aria-hidden="true"
        />

        {/* Top Official Logos Bar */}
        <div className="absolute top-7 left-8 right-8 z-10 flex items-center justify-between gap-4">
          <div
            onClick={onLogoSecretClick}
            className="flex items-center gap-3 cursor-pointer"
            title={profile.name}
          >
            <img
              src={profile.logoKemendikbudUrl}
              alt="Logo Tut Wuri Handayani"
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl bg-white/95 p-1.5 shadow-lg object-contain shrink-0"
            />
            <img
              src={schoolLogoSrc}
              alt="Logo SDN Rawa Badak Utara 21"
              referrerPolicy="no-referrer"
              onError={() => setSchoolLogoSrc('/assets/image_7.png')}
              className="w-12 h-12 rounded-xl bg-white/95 p-1.5 shadow-lg object-contain shrink-0"
            />
            <div className="text-white drop-shadow">
              <div className="text-xs font-extrabold uppercase tracking-wider text-amber-200">
                Pemerintah Provinsi DKI Jakarta
              </div>
              <div className="text-sm font-display font-black tracking-tight">
                {profile.name}
              </div>
            </div>
          </div>

          <span className="px-3 py-1 rounded-lg bg-black/35 backdrop-blur-xs border border-white/20 text-[11px] font-bold text-white/95">
            NPSN {profile.npsn || '20100759'}
          </span>
        </div>

        {/* Bottom Welcome Text Overlay */}
        <div className="absolute bottom-9 left-8 right-8 z-10 max-w-2xl space-y-2">
          <div className="inline-block px-3 py-1 rounded-lg bg-rose-600/90 text-white text-[11px] font-extrabold uppercase tracking-wider shadow-sm">
            Portal Edukasi &amp; Evaluasi Sekolah Dasar
          </div>
          <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight text-white leading-tight drop-shadow-md">
            SELAMAT DATANG DI WEB SERBU 21
          </h1>
          <p className="text-sm lg:text-base font-bold text-amber-100 drop-shadow">
            (Sistem Digital Terpadu SDN Rawa Badak Utara 21)
          </p>
          <p className="text-xs text-white/85 max-w-xl leading-relaxed">
            Terintegrasi layanan Presensi Harian, CBT &amp; Simulasi TKA Kelas 6, Rapor Kurikulum Merdeka, Perpustakaan Digital, dan Asisten Virtual SARAH.
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN: Clean Compact Login Form */}
      <div className="w-full md:w-[42%] lg:w-[40%] min-h-screen bg-slate-50 flex flex-col justify-between px-6 py-7 sm:px-10 lg:px-12 border-l border-slate-200">
        {/* Top Mobile Brand Strip */}
        <div className="flex items-center justify-between md:hidden pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5" onClick={onLogoSecretClick}>
            <img
              src={profile.logoKemendikbudUrl}
              alt="Logo Tut Wuri Handayani"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-xl bg-white p-1 border border-slate-200 object-contain"
            />
            <img
              src={schoolLogoSrc}
              alt="Logo SDN Rawa Badak Utara 21"
              referrerPolicy="no-referrer"
              onError={() => setSchoolLogoSrc('/assets/image_7.png')}
              className="w-9 h-9 rounded-xl bg-white p-1 border border-slate-200 object-contain"
            />
            <div>
              <div className="text-xs font-display font-black text-slate-900">SERBU 21</div>
              <div className="text-[10px] font-semibold text-slate-500">{profile.name}</div>
            </div>
          </div>
        </div>

        {/* Main Center Form Area */}
        <div className="my-auto py-6 max-w-md w-full mx-auto space-y-5">
          <div className="space-y-2.5">
            <div className="hidden md:flex items-center gap-3">
              <img
                src={schoolLogoSrc}
                alt="Logo SDN Rawa Badak Utara 21"
                referrerPolicy="no-referrer"
                onClick={onLogoSecretClick}
                onError={() => setSchoolLogoSrc('/assets/image_7.png')}
                className="w-12 h-12 rounded-2xl bg-white p-1.5 border border-slate-200 shadow-xs object-contain cursor-pointer shrink-0"
              />
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700 block">
                  Portal Masuk Resmi
                </span>
                <span className="text-xs font-bold text-slate-500">{profile.name}</span>
              </div>
            </div>
            <h2 className="text-2xl sm:text-[26px] font-display font-black text-slate-900 tracking-tight">
              Login SERBU 21
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Pilih peran Anda dan masuk menggunakan akun resmi yang terdaftar di basis data sekolah.
            </p>
          </div>

          {/* Role Selector */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
              Masuk Sebagai
            </span>
            <div className="grid grid-cols-4 gap-1.5 bg-slate-200/70 p-1 rounded-2xl border border-slate-200">
              {ROLE_OPTIONS.map((roleOpt) => {
                const active = selectedRole === roleOpt.id;
                const IconComp =
                  roleOpt.id === 'siswa'
                    ? GraduationCap
                    : roleOpt.id === 'guru'
                    ? Briefcase
                    : roleOpt.id === 'wali_murid'
                    ? Users
                    : ShieldCheck;
                return (
                  <button
                    key={roleOpt.id}
                    type="button"
                    onClick={() => {
                      setSelectedRole(roleOpt.id);
                      if (loginError) setLoginError('');
                    }}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-display font-black flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                      active
                        ? 'bg-white text-rose-700 shadow-xs border border-rose-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                    <span className="truncate max-w-full">{roleOpt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                Username / NISN
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  required
                  placeholder={activeRoleHint}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white focus:border-rose-600 focus:ring-2 focus:ring-rose-100 outline-none text-sm font-bold text-slate-900 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  required
                  placeholder="Masukkan password akun..."
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 bg-white focus:border-rose-600 focus:ring-2 focus:ring-rose-100 outline-none text-sm font-bold text-slate-900 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRememberMe(checked);
                    if (!checked) {
                      try {
                        localStorage.removeItem(REMEMBER_LOGIN_STORAGE_KEY);
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  className="w-4 h-4 rounded accent-rose-600 cursor-pointer"
                />
                <span>Ingat Saya</span>
              </label>

              <button
                type="button"
                onClick={onOpenGoogleSitesGuide}
                className="text-xs text-rose-700 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" /> Panduan Google Sites
              </button>
            </div>

            <button
              type="submit"
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-display font-black py-3 rounded-xl shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <span>Masuk ke Sistem</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Bottom Footer + Interactive Version Badge */}
        <div className="pt-4 border-t border-slate-200 flex flex-col items-center gap-2.5 text-center">
          <button
            type="button"
            onClick={() => setShowChangelogModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-[11px] font-semibold text-slate-700 hover:text-rose-700 transition cursor-pointer shadow-2xs"
            title="Klik untuk melihat riwayat pembaruan aplikasi SERBU 21"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
            <span>
              SERBU 21 • <strong className="font-mono">{APP_VERSION}</strong> (Update:{' '}
              {RELEASE_DATE_SHORT})
            </span>
            <History className="w-3 h-3 text-slate-400" />
          </button>

          <footer className="text-[11px] font-semibold text-slate-500 tracking-wide">
            {SYSTEM_CREDIT_TEXT}
          </footer>
        </div>
      </div>

      {/* Changelog / Riwayat Pembaruan Modal */}
      {showChangelogModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowChangelogModal(false)}
        >
          <div
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[86vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-gradient-to-r from-rose-600 to-rose-700 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-200" />
                </div>
                <div>
                  <h3 className="font-display font-black text-base leading-tight">
                    Catatan Pembaruan Sistem SERBU 21
                  </h3>
                  <p className="text-[11px] text-rose-100">
                    Versi Aktif {APP_VERSION} · Pembaruan Terakhir {RELEASE_DATE_SHORT}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer transition"
                aria-label="Tutup catatan pembaruan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
              {CHANGELOG_LIST.map((item, idx) => (
                <div
                  key={item.version}
                  className={`p-4 rounded-2xl border ${
                    idx === 0
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : 'bg-slate-50/70 border-slate-200'
                  } space-y-2.5`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg font-mono font-black text-xs ${
                          idx === 0
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-800'
                        }`}
                      >
                        {item.version}
                      </span>
                      {idx === 0 && (
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                          Terbaru
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">{item.date}</span>
                  </div>
                  <h4 className="font-display font-bold text-sm text-slate-900">{item.title}</h4>
                  <ul className="space-y-1.5">
                    {item.highlights.map((hl, hIdx) => (
                      <li
                        key={hIdx}
                        className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed"
                      >
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                            idx === 0 ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        />
                        <span>{hl}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
              <span className="text-[11px] text-slate-500">
                Draft ujian &amp; antrean sinkronisasi siswa tetap aman selama pembaruan versi.
              </span>
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-rose-600 text-white font-display font-bold text-xs cursor-pointer transition whitespace-nowrap"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
