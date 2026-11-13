import React, { useState, useEffect } from 'react';
import {
  Users,
  QrCode,
  GraduationCap,
  Award,
  Cloud,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  HardDrive,
  ShieldCheck,
  Heart,
  PieChart,
  Calendar,
  Layers,
  ArrowRight,
  Activity,
  Smile,
  AlertCircle,
  Server,
  X,
} from 'lucide-react';
import { SchoolProfile, Student, Teacher, KaldikDay, isSiswaInklusi } from '../../types';
import { AttendanceRecordItem, CLASSES_LIST } from '../../utils/storage';
import { TabId } from '../Sidebar';
import { getStorageStats, syncAllLocalToCloud } from '../../utils/cloudSync';
import { parseLocalDate } from '../../utils/dateUtils';

interface Props {
  profile: SchoolProfile;
  activeClass: string;
  activeYear: string;
  students: Student[];
  teachers: Teacher[];
  attendanceRecords: Record<string, AttendanceRecordItem>;
  todayDate: string;
  kaldikDays?: KaldikDay[];
  onNavigateTab: (tab: TabId) => void;
  onOpenZoom: (url: string, title: string) => void;
  onSelectClass?: (kelas: string) => void;
  onTriggerSync?: () => Promise<void>;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export const DashboardTab: React.FC<Props> = ({
  profile,
  activeClass,
  activeYear,
  students,
  teachers,
  attendanceRecords,
  todayDate,
  kaldikDays = [],
  onNavigateTab,
  onOpenZoom,
  onSelectClass,
  onTriggerSync,
  showToast,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [storageStats, setStorageStats] = useState(getStorageStats());
  const [showInklusiModal, setShowInklusiModal] = useState(false);

  useEffect(() => {
    setStorageStats(getStorageStats());
  }, [students, teachers, attendanceRecords]);

  // 1. Total Siswa (Seluruh 12 Rombel 1A - 6B)
  const totalSiswaAll = students.length;

  // 2. Total Guru & Tenaga Kependidikan
  const totalGuruAll = teachers.length;

  // 3. Jumlah Siswa Laki-Laki dan Perempuan dari Kelas 1A - 6B
  const totalLaki = students.filter(
    (s) => s.jenisKelamin === 'L' || s.jenisKelamin?.toUpperCase().startsWith('L')
  ).length;
  const totalPerempuan = students.filter(
    (s) => s.jenisKelamin === 'P' || s.jenisKelamin?.toUpperCase().startsWith('P')
  ).length;
  const pctLaki = totalSiswaAll > 0 ? Math.round((totalLaki / totalSiswaAll) * 100) : 0;
  const pctPerempuan = totalSiswaAll > 0 ? Math.round((totalPerempuan / totalSiswaAll) * 100) : 0;

  // 4. Jumlah Siswa Inklusi / Kebutuhan Khusus dari Kelas 1A - 6B
  // Siswa reguler ("Tidak Ada", "Reguler", "Tidak Ada (Reguler)", "Siswa Reguler", "-", dll.)
  // secara mutlak TIDAK terhitung sebagai siswa inklusi.
  const siswaInklusiList = students.filter((s) => isSiswaInklusi(s.kebutuhanKhusus));
  const totalInklusi = siswaInklusiList.length;
  const totalReguler = totalSiswaAll - totalInklusi;

  // Breakdown kategori inklusi
  const inklusiCategoriesMap: Record<string, number> = {};
  siswaInklusiList.forEach((s) => {
    const kat = s.kebutuhanKhusus?.trim() || 'Kebutuhan Khusus Lainnya';
    inklusiCategoriesMap[kat] = (inklusiCategoriesMap[kat] || 0) + 1;
  });

  // 5. Persentase Kehadiran Hari Ini
  const todayKaldik = kaldikDays.find((k) => k.date === todayDate);
  const isTodaySunday = parseLocalDate(todayDate).getDay() === 0;
  const isTodayHoliday = isTodaySunday || (todayKaldik ? todayKaldik.isHoliday : false);
  const holidayName = isTodaySunday
    ? 'Hari Minggu (Libur)'
    : todayKaldik?.keterangan || 'Hari Libur Nasional / Cuti Bersama';

  let totalHadirHariIni = 0;
  if (!isTodayHoliday) {
    students.forEach((s) => {
      const rec = attendanceRecords[`${todayDate}_${s.id}`];
      if (rec && rec.status === 'H') totalHadirHariIni++;
    });
  }
  const persentaseKehadiranTotal =
    totalSiswaAll > 0 && !isTodayHoliday
      ? Math.round((totalHadirHariIni / totalSiswaAll) * 100)
      : 0;

  // Kehadiran Rombel Aktif
  const activeClassStudents = students.filter((s) => s.kelas === activeClass);
  let activeClassHadir = 0;
  if (!isTodayHoliday) {
    activeClassStudents.forEach((s) => {
      const rec = attendanceRecords[`${todayDate}_${s.id}`];
      if (rec && rec.status === 'H') activeClassHadir++;
    });
  }
  const activeClassPct =
    activeClassStudents.length > 0 && !isTodayHoliday
      ? Math.round((activeClassHadir / activeClassStudents.length) * 100)
      : 0;

  const homeroomTeacher = teachers.find((t) => t.penugasan === activeClass);

  // Manual Trigger Sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      if (onTriggerSync) {
        await onTriggerSync();
      } else {
        await syncAllLocalToCloud();
      }
      setStorageStats(getStorageStats());
      if (showToast) {
        showToast('Sinkronisasi cloud Firestore selesai! Data tersinkron ke semua perangkat.', 'success');
      }
    } catch {
      if (showToast) {
        showToast('Gagal melakukan sinkronisasi cloud.', 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* ============================================================== */}
      {/* 1. TOP BANNER EKSEKUTIF BERANDA SEKOLAH                        */}
      {/* ============================================================== */}
      <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-amber-500 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 bg-white/20 px-3.5 py-1 rounded-full text-xs font-extrabold uppercase backdrop-blur-md">
            <Award className="w-3.5 h-3.5 text-yellow-300" /> Beranda Resmi • {profile.name}
          </span>
          <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight">
            Sistem Informasi Akademik & Kurikulum Merdeka
          </h2>
          <p className="text-xs sm:text-sm text-rose-100 max-w-3xl leading-relaxed">
            Menampilkan data kunci seluruh rombel (1A – 6B), monitoring profil tenaga pendidik,
            kehadiran barcode real-time, kesetaraan gender, layanan inklusi, serta status sinkronisasi
            cloud multi-perangkat.
          </p>
        </div>

        <div className="bg-white/15 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-white/25 text-center shrink-0 min-w-[220px]">
          <span className="text-[11px] uppercase font-bold text-yellow-200 block">Rombel Aktif Pilihan</span>
          <div className="text-xl sm:text-2xl font-display font-black mt-0.5">
            {activeClass}
          </div>
          <span className="text-xs text-rose-100 block mt-1">
            Tahun Ajaran: <strong>{activeYear}</strong>
          </span>
          <span className="text-[11px] text-yellow-100 block mt-0.5">
            Wali Kelas: {homeroomTeacher ? homeroomTeacher.nama : 'Belum Ditugaskan'}
          </span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. ANGKA KUNCI DI BAGIAN ATAS (KEY METRICS CARDS)              */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Siswa Keseluruhan 12 Rombel */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 flex flex-col justify-between hover:border-rose-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Siswa (12 Rombel)
            </span>
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-lg group-hover:scale-105 transition">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-display font-black text-slate-800">
              {totalSiswaAll} <span className="text-sm font-bold text-slate-500">Siswa</span>
            </div>
            <p className="text-[11px] text-emerald-700 font-bold mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Keseluruhan Rombel 1A s.d. 6B
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10.5px] text-slate-500 flex justify-between">
            <span>Rombel Aktif: {activeClass}</span>
            <strong className="text-rose-700">{activeClassStudents.length} Siswa</strong>
          </div>
        </div>

        {/* Card 2: Total Guru & Tendik */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 flex flex-col justify-between hover:border-emerald-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Guru & Tendik
            </span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg group-hover:scale-105 transition">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-display font-black text-slate-800">
              {totalGuruAll} <span className="text-sm font-bold text-slate-500">GTK</span>
            </div>
            <p className="text-[11px] text-emerald-700 font-bold mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Pendidik & Tenaga Kependidikan
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10.5px] text-slate-500 flex justify-between">
            <span>Kepsek & Wali Kelas</span>
            <strong className="text-emerald-700">Terdaftar Resmi</strong>
          </div>
        </div>

        {/* Card 3: Jumlah Laki-Laki & Perempuan (Kelas 1A - 6B) */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 flex flex-col justify-between hover:border-sky-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Gender (1A – 6B)
            </span>
            <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center text-lg group-hover:scale-105 transition">
              <PieChart className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-2xl font-display font-black text-slate-800 flex items-center gap-2">
              <span className="text-sky-700">{totalLaki} <small className="text-xs font-bold text-slate-500">L</small></span>
              <span className="text-slate-300">•</span>
              <span className="text-rose-600">{totalPerempuan} <small className="text-xs font-bold text-slate-500">P</small></span>
            </div>
            {/* Visual ratio bar */}
            <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden flex">
              <div
                style={{ width: `${pctLaki}%` }}
                className="bg-sky-500 h-full"
                title={`Laki-Laki: ${pctLaki}%`}
              />
              <div
                style={{ width: `${pctPerempuan}%` }}
                className="bg-rose-400 h-full"
                title={`Perempuan: ${pctPerempuan}%`}
              />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10.5px] text-slate-500 flex justify-between">
            <span className="text-sky-700 font-bold">L: {pctLaki}%</span>
            <span className="text-rose-600 font-bold">P: {pctPerempuan}%</span>
          </div>
        </div>

        {/* Card 4: Jumlah Siswa Inklusi (Kelas 1A - 6B) */}
        <div
          onClick={() => setShowInklusiModal(true)}
          className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 flex flex-col justify-between hover:border-amber-400 hover:shadow-md transition group cursor-pointer"
          title="Klik untuk melihat rincian verifikasi siswa inklusi vs reguler"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Siswa Inklusi (ABK)
            </span>
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg group-hover:scale-105 transition">
              <Heart className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-display font-black text-amber-700">
              {totalInklusi} <span className="text-sm font-bold text-slate-500">Siswa</span>
            </div>
            <p className="text-[11px] text-amber-800 font-bold mt-1 flex items-center gap-1">
              <Smile className="w-3.5 h-3.5" />
              {totalInklusi > 0 ? `${totalInklusi} Siswa Berkebutuhan Khusus` : '0 Siswa ABK (Semua Reguler)'}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10.5px] text-slate-500 flex justify-between items-center">
            <span>Siswa Reguler</span>
            <strong className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md font-bold">
              {totalReguler} Siswa (Non-ABK)
            </strong>
          </div>
        </div>

        {/* Card 5: Persentase Kehadiran Hari Ini */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 flex flex-col justify-between hover:border-teal-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Kehadiran Hari Ini
            </span>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg group-hover:scale-105 transition ${
              isTodayHoliday ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'
            }`}>
              {isTodayHoliday ? <Calendar className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
            </div>
          </div>
          <div className="mt-2">
            <div className={`text-2xl sm:text-3xl font-display font-black ${
              isTodayHoliday ? 'text-amber-700' : 'text-teal-700'
            }`}>
              {isTodayHoliday ? '0%' : `${persentaseKehadiranTotal}%`}
            </div>
            <p className="text-[11px] font-bold mt-1 truncate text-slate-600">
              {isTodayHoliday ? holidayName : `${totalHadirHariIni} / ${totalSiswaAll} Siswa Hadir`}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10.5px] text-slate-500 flex justify-between">
            <span>Kelas {activeClass}</span>
            <strong className="text-teal-800">{isTodayHoliday ? 'Libur' : `${activeClassPct}% Hadir`}</strong>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. STATUS SISTEM & SINKRONISASI CLOUD MULTI-PERANGKAT          */}
      {/* ============================================================== */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-display font-black text-slate-800">
                  Status Sistem & Indikator Ruang Penyimpanan Cloud
                </h3>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10.5px] font-black uppercase">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Online • Cloud Terhubung
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Koneksi Firebase Cloud Firestore aktif dengan sinkronisasi instan antar perangkat (Laptop, Tablet, & Smartphone).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2 transition shadow-md shadow-emerald-500/20 cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Data Sekarang'}
          </button>
        </div>

        {/* 3 Status Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Status 1: Kuota & Ruang Penyimpanan Cloud Firebase */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                <Cloud className="w-4 h-4 text-emerald-600" /> Ruang Penyimpanan Cloud
              </span>
              <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                Tier Gratis (Spark)
              </span>
            </div>

            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-2xl font-display font-black text-slate-800">
                  {storageStats.remainingPercent}%
                </span>
                <span className="text-xs font-bold text-emerald-700">
                  Tersisa (Sangat Aman)
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${storageStats.usedPercent}%` }}
                  className="bg-emerald-500 h-full min-w-[6px]"
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 mt-1.5">
                <span>Terpakai: <strong>~{storageStats.usedKB} KB</strong></span>
                <span>Alokasi: <strong>1.0 GiB</strong></span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-200/60 pt-2">
              Kapasitas gratis Firebase Firestore sebesar 1 GiB mampu menampung puluhan ribu data siswa, nilai rapor, dan absensi tanpa batas waktu.
            </p>
          </div>

          {/* Status 2: Kuota Operasi Harian & Latensi */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-sky-600" /> Kuota Operasi Firebase
              </span>
              <span className="text-[10px] font-black uppercase bg-sky-100 text-sky-800 px-2 py-0.5 rounded-md">
                Harian
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs p-2 rounded-xl bg-white border border-slate-200">
                <span className="text-slate-600">Batas Baca (Reads):</span>
                <strong className="text-slate-800 font-mono">50.000 / Hari</strong>
              </div>
              <div className="flex justify-between items-center text-xs p-2 rounded-xl bg-white border border-slate-200">
                <span className="text-slate-600">Batas Tulis (Writes):</span>
                <strong className="text-slate-800 font-mono">20.000 / Hari</strong>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-200/60 pt-2">
              <span>Database ID:</span>
              <strong className="font-mono text-slate-700 truncate max-w-[170px]" title="ai-studio-sekolahkusdnrawa-2c2c24f0-83a4-4b8f-9f8e-269a8e95de29">
                sekolahku-sdnrawa
              </strong>
            </div>
          </div>

          {/* Status 3: Multi-Perangkat Real-Time Synchronizer */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600" /> Sinkronisasi Multi-Device
              </span>
              <span className="text-[10px] font-black uppercase bg-teal-100 text-teal-800 px-2 py-0.5 rounded-md">
                Real-Time
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-slate-700">
                Waktu Sinkron Terakhir:
              </div>
              <div className="text-xs font-mono font-black text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                {storageStats.lastSyncTime}
              </div>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed border-t border-slate-200/60 pt-2">
              💡 <strong>Solusi Multi-Perangkat:</strong> Data siswa yang dihapus atau ditambah di laptop langsung dikirim ke Cloud Firestore dan otomatis terupdate di tablet secara real-time.
            </p>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. DISTRIBUSI SISWA SELURUH 12 ROMBEL (KELAS 1A s.d. 6B)       */}
      {/* ============================================================== */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-display font-black text-slate-800 text-base sm:text-lg flex items-center gap-2">
              <Layers className="w-5 h-5 text-rose-600" /> Persebaran Peserta Didik per Rombongan Belajar (12 Rombel)
            </h3>
            <p className="text-xs text-slate-500">
              Klik pada salah satu rombel di bawah untuk langsung mengganti rombel aktif yang sedang dianalisis.
            </p>
          </div>
          <span className="text-xs font-extrabold bg-rose-50 text-rose-800 px-3 py-1 rounded-xl border border-rose-200 self-start sm:self-auto">
            Total Sekolah: <strong>{totalSiswaAll} Siswa</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {CLASSES_LIST.map((cls) => {
            const classStudents = students.filter((s) => s.kelas === cls);
            const count = classStudents.length;
            const lCount = classStudents.filter(
              (s) => s.jenisKelamin === 'L' || s.jenisKelamin?.toUpperCase().startsWith('L')
            ).length;
            const pCount = classStudents.filter(
              (s) => s.jenisKelamin === 'P' || s.jenisKelamin?.toUpperCase().startsWith('P')
            ).length;
            const isCurrent = cls === activeClass;
            const wali = teachers.find((t) => t.penugasan === cls);

            return (
              <button
                key={cls}
                type="button"
                onClick={() => {
                  if (onSelectClass) onSelectClass(cls);
                }}
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-rose-50 border-rose-400 shadow-sm ring-2 ring-rose-300'
                    : 'bg-slate-50 hover:bg-white hover:border-slate-300 border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black ${isCurrent ? 'text-rose-900' : 'text-slate-800'}`}>
                      {cls}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] font-black uppercase bg-rose-200 text-rose-950 px-1.5 py-0.5 rounded">
                        Aktif
                      </span>
                    )}
                  </div>
                  <div className="text-xl font-display font-black text-slate-800 mt-1">
                    {count} <span className="text-[11px] font-semibold text-slate-400">Siswa</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-200/60 text-[10.5px]">
                  <div className="flex justify-between text-slate-500 font-medium">
                    <span className="text-sky-700 font-bold">{lCount} L</span>
                    <span className="text-rose-600 font-bold">{pCount} P</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5" title={wali?.nama || 'Belum ada wali'}>
                    {wali ? wali.nama.split(',')[0] : '-'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 5. MENU PINTAS & AKSI CEPAT SISTEM                             */}
      {/* ============================================================== */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
        <div>
          <h4 className="font-display font-black text-sm flex items-center gap-2 text-yellow-300">
            <Sparkles className="w-4 h-4 text-yellow-300" /> Akses Cepat Menu Akademik
          </h4>
          <p className="text-xs text-slate-300 mt-0.5">
            Pilih menu untuk melanjutkan penginputan data nilai, absensi, atau pencetakan laporan:
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab('absensi')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" /> Scan Absensi
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('penilaian')}
            className="bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5"
          >
            Input Penilaian
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('penilaian-ekskul')}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5"
          >
            Penilaian Ekskul
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('rapor')}
            className="bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5"
          >
            Cetak e-Rapor
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('ujian')}
            className="bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5"
          >
            Bank Soal CBT
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 6. MODAL RINCIAN VERIFIKASI SISWA INKLUSI VS SISWA REGULER     */}
      {/* ============================================================== */}
      {showInklusiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md">
                  <Heart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-black text-slate-800 text-base">
                    Verifikasi Siswa Inklusi (ABK) vs Siswa Reguler
                  </h3>
                  <p className="text-xs text-slate-600">
                    SDN Rawa Badak Utara 21 • Tahun Ajaran {activeYear}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInklusiModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-white/80 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Stat Badges */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Total Seluruh Siswa</span>
                  <div className="text-xl font-black text-slate-800 mt-0.5">{totalSiswaAll}</div>
                  <span className="text-[10px] text-slate-500">12 Rombel (1A - 6B)</span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 text-center">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Siswa Reguler</span>
                  <div className="text-xl font-black text-emerald-800 mt-0.5">{totalReguler}</div>
                  <span className="text-[10px] text-emerald-600 font-semibold">TIDAK Masuk Inklusi</span>
                </div>
                <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-center">
                  <span className="text-[10px] font-bold text-amber-700 uppercase">Siswa Inklusi (ABK)</span>
                  <div className="text-xl font-black text-amber-800 mt-0.5">{totalInklusi}</div>
                  <span className="text-[10px] text-amber-600 font-semibold">Angka Kunci Inklusi</span>
                </div>
              </div>

              {/* Informative Alert */}
              <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Aturan Filter Inklusi:</strong> Siswa reguler dengan data kebutuhan khusus bernilai <em>"Tidak Ada (Reguler)"</em>, <em>"Reguler"</em>, <em>"Siswa Reguler"</em>, atau kosong <strong>secara otomatis tidak dimasukkan</strong> ke dalam hitungan angka kunci utama Siswa Inklusi. Hanya siswa dengan diagnosis 12 kebutuhan khusus resmi yang dihitung.
                </div>
              </div>

              {/* Inklusi Students Table or Empty State */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
                  <span>Daftar Siswa Kebutuhan Khusus ({totalInklusi})</span>
                  {totalInklusi > 0 && (
                    <span className="text-[10px] text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-md">
                      {Object.keys(inklusiCategoriesMap).length} Kategori
                    </span>
                  )}
                </h4>

                {totalInklusi === 0 ? (
                  <div className="text-center py-8 px-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <Smile className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-sm">Tidak Ada Siswa Berkebutuhan Khusus (ABK)</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Seluruh {totalSiswaAll} siswa berstatus sebagai Siswa Reguler dan tidak terhitung ke angka kunci inklusi.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">No</th>
                          <th className="p-2.5">Nama Siswa</th>
                          <th className="p-2.5">Kelas</th>
                          <th className="p-2.5">L/P</th>
                          <th className="p-2.5">Kebutuhan Khusus (ABK)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {siswaInklusiList.map((s, idx) => (
                          <tr key={s.id} className="hover:bg-amber-50/50">
                            <td className="p-2.5 text-slate-500 font-mono">{idx + 1}</td>
                            <td className="p-2.5 font-bold text-slate-800">{s.nama}</td>
                            <td className="p-2.5">
                              <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold text-[11px]">
                                {s.kelas}
                              </span>
                            </td>
                            <td className="p-2.5 font-bold">{s.jenisKelamin}</td>
                            <td className="p-2.5">
                              <span className="bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-lg text-[10.5px] font-bold">
                                {s.kebutuhanKhusus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInklusiModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
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
