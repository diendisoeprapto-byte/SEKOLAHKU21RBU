import React, { useEffect, useState } from 'react';
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

export const LoginScreen: React.FC<Props> = ({
  profile,
  teachers,
  students,
  onLoginSuccess,
  showToast,
  onOpenGoogleSitesGuide,
  onLogoSecretClick,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [illustrationError, setIllustrationError] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);

  useEffect(() => {
    const res = checkAndBumpAppVersionCache();
    if (res.upgraded) {
      showToast(`Aplikasi berhasil diperbarui ke versi ${res.currentVersion}`, 'success');
    }
  }, [showToast]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const u = username.trim().toLowerCase();
    const p = password.trim();

    if (!u || !p) {
      const msg = 'Username dan password wajib diisi sesuai data aplikasi SERBU 21.';
      setLoginError(msg);
      showToast(msg, 'error');
      return;
    }

    // 1. Verifikasi Akun Administrator (default 'admin'/'123' saat belum diubah, atau sesuai password tersimpan)
    const storedAdminPass = getStoredAdminPassword().trim();
    const isAdminPassCustomized = localStorage.getItem('sekolahku_admin_password') !== null;
    if (u === 'admin') {
      if (p === storedAdminPass || (!isAdminPassCustomized && (p === 'admin' || p === '123'))) {
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

    // 2. Verifikasi Akun Guru / Pegawai (username & password harus sesuai data Guru & Pegawai)
    const matchedTeacherByUsername = teachers.find(
      (t) => Boolean(t.username?.trim()) && t.username.trim().toLowerCase() === u
    );
    if (matchedTeacherByUsername) {
      const expectedTeacherPass = (matchedTeacherByUsername.password || '').trim();
      if (expectedTeacherPass && p === expectedTeacherPass) {
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

    // 3. Verifikasi Akun Siswa (username / NISN / barcodeId & password harus sesuai data Siswa)
    const matchedStudents = students.filter((s) => {
      const sUser = (s.username || '').trim().toLowerCase();
      const sNisn = (s.nisn || '').trim().toLowerCase();
      const sBarcode = (s.barcodeId || '').trim().toLowerCase();
      return (sUser !== '' && sUser === u) || (sNisn !== '' && sNisn === u) || (sBarcode !== '' && sBarcode === u);
    });

    if (matchedStudents.length > 0) {
      const validStudent = matchedStudents.find((s) => {
        const expectedStudentPass = (s.password || '').trim();
        return expectedStudentPass !== '' && p === expectedStudentPass;
      });
      if (validStudent) {
        onLoginSuccess({
          role: 'siswa',
          username: validStudent.username,
          name: validStudent.nama,
          detail: `${validStudent.kelas} • ${validStudent.nisn}`,
          fotoUrl: validStudent.fotoUrl,
          studentData: validStudent,
        });
        showToast(`Selamat datang, ${validStudent.nama}!`, 'success');
        return;
      }
      const msg = 'Password Siswa tidak sesuai dengan data aplikasi SERBU 21.';
      setLoginError(msg);
      showToast(msg, 'error');
      return;
    }

    // Tidak ada akun yang terdaftar di data aplikasi SERBU 21 -> Tolak login
    const msg = 'Login ditolak! Username atau password tidak terdaftar di data aplikasi SERBU 21.';
    setLoginError(msg);
    showToast(msg, 'error');
  };

  return (
    <section className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 gap-4">
      <div className="max-w-4xl w-full bg-white rounded-[2.5rem] shadow-2xl border-4 border-rose-100 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Side: Minimalist School Branding & Illustration */}
        <div className="lg:col-span-6 bg-gradient-to-br from-rose-600 via-rose-700 to-amber-500 p-8 sm:p-10 text-white flex flex-col justify-between gap-6 relative overflow-hidden">
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>

          <div className="relative z-10">
            <div
              onClick={onLogoSecretClick}
              className="flex items-center gap-3.5 select-none"
            >
              <img
                src={profile.logoKemendikbudUrl}
                alt="Logo Kemendikbud"
                className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-xl border-2 border-yellow-300 object-contain shrink-0"
              />
              <img
                src={profile.logoSekolahUrl}
                alt="Logo SDN RBU 21 Monas"
                className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-xl border-2 border-yellow-300 object-contain shrink-0"
              />
              <div>
                <h1 className="text-3xl sm:text-4xl font-display font-black leading-tight">SERBU 21</h1>
                <p className="text-[11px] font-bold text-yellow-200 leading-snug">
                  Sistem Edukasi, Rapor, dan Basis Data Utama
                </p>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex-1 flex items-center justify-center">
            {!illustrationError ? (
              <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden bg-white/15 p-2 border border-white/25 shadow-xl">
                <img
                  src={schoolIllustration}
                  alt="Ilustrasi kegiatan belajar siswa sekolah dasar"
                  referrerPolicy="no-referrer"
                  onError={() => setIllustrationError(true)}
                  className="w-full h-full object-cover rounded-2xl"
                />
              </div>
            ) : (
              <div className="w-full aspect-[4/3] rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center p-6 text-center">
                <span className="text-sm font-display font-bold text-yellow-100">
                  SERBU 21 · Portal Pembelajaran &amp; Penilaian
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="lg:col-span-6 p-8 sm:p-10 flex flex-col justify-center bg-white">
          <div className="mb-6">
            <span className="text-xs font-extrabold uppercase bg-rose-100 text-rose-700 px-3 py-1 rounded-full">
              Portal Masuk Resmi
            </span>
            <h2 className="text-2xl font-display font-black text-slate-800 mt-2">
              Selamat Datang di SERBU 21
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Silakan masuk menggunakan akun Administrator, Guru / Wali Kelas, atau Akun Siswa{' '}
              <strong className="text-slate-700">{profile.name}</strong> yang terdaftar.
            </p>
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
                Username Pengguna
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  required
                  placeholder="admin / username guru / username atau NISN siswa..."
                  className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-rose-600 outline-none text-sm font-bold text-slate-800 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                Kata Sandi (Password)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  required
                  placeholder="Masukkan password sesuai data akun..."
                  className="w-full pl-11 pr-11 py-3 rounded-2xl border-2 border-slate-200 focus:border-rose-600 outline-none text-sm font-bold text-slate-800 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-red-700 text-white font-display font-black py-3.5 rounded-2xl shadow-lg shadow-rose-500/30 transition flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <span>Masuk ke Aplikasi SERBU 21</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-8 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1 font-semibold">
              <ShieldCheck className="w-4 h-4 text-rose-600" /> {profile.name}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenGoogleSitesGuide}
                className="text-rose-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" /> Panduan Google Sites
              </button>
            </div>
          </div>

          {/* Minimalist Clickable App Version Badge */}
          <div className="mt-3 flex justify-center sm:justify-start">
            <button
              type="button"
              onClick={() => setShowChangelogModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-[11px] font-semibold text-slate-600 hover:text-rose-700 transition cursor-pointer"
              title="Klik untuk melihat riwayat pembaruan aplikasi SERBU 21"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
              <span>
                SERBU 21 • <strong className="font-mono">{APP_VERSION}</strong> (Update:{' '}
                {RELEASE_DATE_SHORT})
              </span>
              <History className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Minimalist Credit Footer */}
      <footer className="text-center text-[11px] font-semibold text-slate-500 px-3 tracking-wide">
        {SYSTEM_CREDIT_TEXT}
      </footer>

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
