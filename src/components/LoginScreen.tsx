import React, { useState } from 'react';
import {
  User,
  Lock,
  ArrowRight,
  ShieldCheck,
  QrCode,
  BookOpen,
  Laptop,
  BarChart2,
  Globe,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';
import { SchoolProfile, Teacher, Student, ActiveUser } from '../types';
import { getStoredAdminPassword } from '../utils/storage';

interface Props {
  profile: SchoolProfile;
  teachers: Teacher[];
  students: Student[];
  onLoginSuccess: (user: ActiveUser) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenGoogleSitesGuide: () => void;
}

export const LoginScreen: React.FC<Props> = ({
  profile,
  teachers,
  students,
  onLoginSuccess,
  showToast,
  onOpenGoogleSitesGuide,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const u = username.trim().toLowerCase();
    const p = password.trim();

    if (!u || !p) {
      const msg = 'Username dan password wajib diisi sesuai data aplikasi SEKOLAHKU.';
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
      const msg = 'Password Administrator tidak sesuai dengan data aplikasi SEKOLAHKU.';
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
      const msg = 'Password Guru/Pegawai tidak sesuai dengan data aplikasi SEKOLAHKU.';
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
      const msg = 'Password Siswa tidak sesuai dengan data aplikasi SEKOLAHKU.';
      setLoginError(msg);
      showToast(msg, 'error');
      return;
    }

    // Tidak ada akun yang terdaftar di data aplikasi SEKOLAHKU -> Tolak login
    const msg = 'Login ditolak! Username atau password tidak terdaftar di data aplikasi SEKOLAHKU.';
    setLoginError(msg);
    showToast(msg, 'error');
  };

  return (
    <section className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-4xl w-full bg-white rounded-[2.5rem] shadow-2xl border-4 border-rose-100 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Side: School Branding */}
        <div className="lg:col-span-6 bg-gradient-to-br from-rose-600 via-rose-700 to-amber-500 p-8 sm:p-10 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>

          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3.5 mb-2">
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
                <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border border-white/30">
                  <ShieldCheck className="w-3.5 h-3.5 text-yellow-300" /> DKI Jakarta • Monas Edition
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-black leading-tight mt-1">SEKOLAHKU</h1>
              </div>
            </div>

            <div>
              <p className="text-white font-display font-black text-xl">{profile.name}</p>
              <p className="text-yellow-200 font-display font-extrabold text-xs uppercase tracking-wider mt-0.5">
                {profile.kecamatan} • {profile.kota} • {profile.provinsi}
              </p>
            </div>

            <p className="text-rose-100 text-xs leading-relaxed font-medium">
              Sistem Informasi Penilaian Pembelajaran Kurikulum Merdeka (Sumatif AS1-ASn, Remedial, ASTS & ASAS),
              Leger Nilai Kelas, Pembuatan e-Rapor, Kartu Absensi Barcode, serta Ujian CBT Terintegrasi.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-2.5 mt-8 text-xs">
            <div className="bg-white/15 backdrop-blur-xs p-3 rounded-2xl border border-white/20 flex items-center gap-2.5">
              <QrCode className="w-5 h-5 text-yellow-300 shrink-0" />
              <span className="font-bold leading-tight">Kartu Barcode & Foto Siswa</span>
            </div>
            <div className="bg-white/15 backdrop-blur-xs p-3 rounded-2xl border border-white/20 flex items-center gap-2.5">
              <BarChart2 className="w-5 h-5 text-yellow-300 shrink-0" />
              <span className="font-bold leading-tight">Grafik Absensi Harian & Bulanan</span>
            </div>
            <div className="bg-white/15 backdrop-blur-xs p-3 rounded-2xl border border-white/20 flex items-center gap-2.5">
              <Laptop className="w-5 h-5 text-yellow-300 shrink-0" />
              <span className="font-bold leading-tight">CBT 6 Tipe Soal & Fullscreen</span>
            </div>
            <div className="bg-white/15 backdrop-blur-xs p-3 rounded-2xl border border-white/20 flex items-center gap-2.5">
              <BookOpen className="w-5 h-5 text-yellow-300 shrink-0" />
              <span className="font-bold leading-tight">e-Rapor Merdeka 20 Tahun</span>
            </div>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="lg:col-span-6 p-8 sm:p-10 flex flex-col justify-center bg-white">
          <div className="mb-6">
            <span className="text-xs font-extrabold uppercase bg-rose-100 text-rose-700 px-3 py-1 rounded-full">
              Portal Masuk Resmi
            </span>
            <h2 className="text-2xl font-display font-black text-slate-800 mt-2">
              Selamat Datang di SEKOLAHKU
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
              <span>Masuk ke Aplikasi SEKOLAHKU</span>
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
        </div>
      </div>
    </section>
  );
};
