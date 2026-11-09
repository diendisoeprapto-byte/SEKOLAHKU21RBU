import React from 'react';
import { Users, QrCode, TrendingUp, Database, Camera, CloudDownload, Award } from 'lucide-react';
import { SchoolProfile, Student, Teacher, KaldikDay } from '../../types';
import { AttendanceRecordItem } from '../../utils/storage';
import { TabId } from '../Sidebar';

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
}) => {
  const filteredStudents = students.filter((s) => s.kelas === activeClass);

  const todayKaldik = kaldikDays.find((k) => k.date === todayDate);
  const isTodaySunday = new Date(todayDate).getDay() === 0;
  const isTodayHoliday = isTodaySunday || (todayKaldik ? todayKaldik.isHoliday : false);
  const holidayName = isTodaySunday ? 'Hari Minggu (Libur)' : (todayKaldik?.keterangan || 'Hari Libur');

  let presentCount = 0;
  if (!isTodayHoliday) {
    filteredStudents.forEach((s) => {
      const rec = attendanceRecords[`${todayDate}_${s.id}`];
      if (rec && rec.status === 'H') presentCount++;
    });
  }

  const homeroomTeacher = teachers.find((t) => t.penugasan === activeClass);

  return (
    <section className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-amber-500 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-xs font-extrabold uppercase">
            <Award className="w-3.5 h-3.5 text-yellow-300" /> Aplikasi Akademik SEKOLAHKU • {profile.name}
          </span>
          <h2 className="text-2xl sm:text-3xl font-display font-black">
            Dashboard Akademik & Kurikulum Merdeka
          </h2>
          <p className="text-xs sm:text-sm text-rose-100 max-w-2xl leading-relaxed">
            Kelola Profil Sekolah, Data Guru & Kepala Sekolah, Siswa Berfoto, Kartu Barcode, Scan Kamera,
            Grafik Kehadiran, Asesmen Sumatif (AS1, AS2, dst.), Remedial, ASTS, ASAS, hingga Cetak e-Rapor &
            Rapor Kokurikuler P5.
          </p>
        </div>

        <div className="bg-white/15 backdrop-blur-md p-4 rounded-2xl border border-white/25 text-center shrink-0 min-w-[200px]">
          <span className="text-[11px] uppercase font-bold text-yellow-200 block">Rombel Aktif</span>
          <div className="text-xl font-display font-black mt-0.5">
            {activeClass} • {activeYear}
          </div>
          <span className="text-xs text-rose-100 block mt-1">
            Wali Kelas: {homeroomTeacher ? homeroomTeacher.nama : 'Belum Ditugaskan'}
          </span>
        </div>
      </div>

      {/* 4 Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase">Siswa Kelas Aktif</span>
            <div className="text-2xl font-display font-black text-slate-800 mt-1">
              {filteredStudents.length} Siswa
            </div>
            <span className="text-[11px] text-emerald-600 font-bold">Terdaftar di Barcode & Akun</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-xl">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase">Kehadiran Hari Ini</span>
            <div className={`text-2xl font-display font-black mt-1 ${isTodayHoliday ? 'text-slate-400' : 'text-emerald-600'}`}>
              {isTodayHoliday ? '0 Hadir' : `${presentCount} / ${filteredStudents.length} Hadir`}
            </div>
            <span className={`text-[11px] font-bold ${isTodayHoliday ? 'text-amber-600' : 'text-slate-500'}`}>
              {isTodayHoliday ? `(Libur: ${holidayName})` : 'Hasil Scan Barcode'}
            </span>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${isTodayHoliday ? 'bg-slate-100 text-slate-400' : 'bg-emerald-100 text-emerald-600'}`}>
            <QrCode className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase">Rata-Rata Kelas</span>
            <div className="text-2xl font-display font-black text-sky-600 mt-1">84.5</div>
            <span className="text-[11px] text-sky-600 font-bold">10 Mapel Kurikulum Merdeka</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center text-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase">Data Guru & Bank Soal</span>
            <div className="text-2xl font-display font-black text-amber-600 mt-1">
              {teachers.length} Guru / 12 Soal
            </div>
            <span className="text-[11px] text-amber-700 font-bold">Tersimpan Permanen</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-xl">
            <Database className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-extrabold text-lg text-slate-800">
            Ringkasan Peserta Didik ({activeClass})
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onNavigateTab('absensi')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Camera className="w-4 h-4" /> Scan Barcode
            </button>
            <button
              onClick={() => onNavigateTab('backup')}
              className="bg-amber-400 hover:bg-amber-500 text-slate-900 text-xs font-extrabold px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <CloudDownload className="w-4 h-4" /> Backup Data
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-xs uppercase font-extrabold">
                <th className="p-3 rounded-l-xl">ID Barcode</th>
                <th className="p-3">Foto & Nama Siswa</th>
                <th className="p-3">Agama / Mapel</th>
                <th className="p-3 text-center">Status Hari Ini</th>
                <th className="p-3 text-center">Rata-Rata Nilai</th>
                <th className="p-3 rounded-r-xl text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((s, idx) => {
                const rec = attendanceRecords[`${todayDate}_${s.id}`];
                const status = isTodayHoliday ? 'LIBUR' : (rec ? rec.status : 'BELUM');
                const baseScore = 80 + (idx % 15);

                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-rose-700">{s.barcodeId}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={s.fotoUrl}
                          alt={s.nama}
                          onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200 cursor-zoom-in"
                        />
                        <div>
                          <div className="font-bold text-slate-800">{s.nama}</div>
                          <div className="text-[11px] text-slate-500">NISN: {s.nisn}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-700">{s.agama}</span>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                          status === 'LIBUR'
                            ? 'bg-amber-100 text-amber-800'
                            : status === 'H'
                            ? 'bg-emerald-100 text-emerald-800'
                            : status === 'S'
                            ? 'bg-sky-100 text-sky-800'
                            : status === 'I'
                            ? 'bg-amber-100 text-amber-800'
                            : status === 'A'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {status === 'LIBUR' ? 'Libur' : status === 'H' ? 'Hadir' : status === 'S' ? 'Sakit' : status === 'I' ? 'Izin' : status === 'A' ? 'Alfa' : 'Belum Absen'}
                      </span>
                    </td>
                    <td className="p-3 text-center font-display font-extrabold text-sky-700">
                      {baseScore}.0
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => onNavigateTab('penilaian')}
                        className="text-xs text-rose-600 hover:text-rose-800 font-bold hover:underline"
                      >
                        Buka Nilai &rarr;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
