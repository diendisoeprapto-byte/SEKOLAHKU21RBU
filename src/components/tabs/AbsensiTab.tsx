import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  QrCode,
  CheckCheck,
  Calendar,
  Clock,
  UserCheck,
  Upload,
  Link as LinkIcon,
  Video,
} from 'lucide-react';
import { Student, KaldikDay } from '../../types';
import { AttendanceRecordItem } from '../../utils/storage';
import { TabId } from '../Sidebar';

interface Props {
  students: Student[];
  activeClass: string;
  attendanceRecords: Record<string, AttendanceRecordItem>;
  onSaveAttendance: (records: Record<string, AttendanceRecordItem>) => void;
  kaldikDays: KaldikDay[];
  onNavigateTab: (tab: TabId) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

export const AbsensiTab: React.FC<Props> = ({
  students,
  activeClass,
  attendanceRecords,
  onSaveAttendance,
  kaldikDays,
  onNavigateTab,
  showToast,
  onOpenZoom,
}) => {
  const [activeDate, setActiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [cameraActive, setCameraActive] = useState(false);
  const [lastScannedStudent, setLastScannedStudent] = useState<string>('Siap menerima scan barcode siswa...');
  const [lastScannedTime, setLastScannedTime] = useState<string>('--:--');
  const [manualCode, setManualCode] = useState('');
  const [selectedStudentDropdown, setSelectedStudentDropdown] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const filteredStudents = students.filter((s) => s.kelas === activeClass);

  const activeDayKaldik = kaldikDays.find((k) => k.date === activeDate);
  const isSunday = new Date(activeDate).getDay() === 0;
  const isHoliday = isSunday || (activeDayKaldik ? activeDayKaldik.isHoliday : false);

  const toggleCamera = async () => {
    if (cameraActive) {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      setCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        showToast('Kamera pemindai barcode aktif!', 'success');
      } catch (err) {
        console.error('Camera access failed:', err);
        showToast('Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.', 'error');
      }
    }
  };

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const recordAttendance = (student: Student, status: 'H' | 'S' | 'I' | 'A' = 'H') => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const key = `${activeDate}_${student.id}`;

    const updated = {
      ...attendanceRecords,
      [key]: {
        id: key,
        studentId: student.id,
        date: activeDate,
        status,
        time: timeStr,
      },
    };

    onSaveAttendance(updated);
    setLastScannedStudent(`${student.nama} (${student.barcodeId}) - ${status === 'H' ? 'HADIR' : status}`);
    setLastScannedTime(timeStr);
    showToast(`${student.nama} tercatat: ${status}`, 'success');
  };

  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    const query = manualCode.trim().toLowerCase();
    const student = filteredStudents.find(
      (s) =>
        s.barcodeId.toLowerCase() === query ||
        s.nisn.toLowerCase() === query ||
        s.nama.toLowerCase().includes(query)
    );

    if (student) {
      recordAttendance(student, 'H');
      setManualCode('');
    } else {
      showToast(`Siswa dengan kode/nama "${manualCode}" tidak ditemukan di rombel ini`, 'error');
    }
  };

  const handleStatusChange = (studentId: string, newStatus: 'H' | 'S' | 'I' | 'A') => {
    const student = students.find((s) => s.id === studentId);
    if (student) {
      recordAttendance(student, newStatus);
    }
  };

  const markAllPresent = () => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const updated = { ...attendanceRecords };

    filteredStudents.forEach((s) => {
      const key = `${activeDate}_${s.id}`;
      updated[key] = {
        id: key,
        studentId: s.id,
        date: activeDate,
        status: 'H',
        time: timeStr,
      };
    });

    onSaveAttendance(updated);
    showToast(`Seluruh ${filteredStudents.length} siswa berhasil ditandai Hadir hari ini!`, 'success');
  };

  return (
    <section className="space-y-6">
      {/* Sub-menu Navigation Bar */}
      <div className="bg-white p-4 rounded-3xl shadow-xs border border-sky-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-sm font-bold">
            <QrCode className="w-5 h-5" />
          </span>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-emerald-700">
              Sub-Menu 2.2 • Terhubung ke Kalender & Laporan
            </span>
            <h3 className="font-display font-black text-sm sm:text-base text-slate-800">
              Scan Barcode & Pendataan Absensi Harian ({activeClass})
            </h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab('kalender')}
            className="bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-800 border border-rose-200 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4" /> Buka Kalender Pendidikan
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('laporan-absensi')}
            className="bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-4 h-4" /> Buka Laporan Kehadiran
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Camera & Scanner */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">
                Scanner Kamera & Barcode Otomatis
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1.5">
                Scan Kamera & Barcode Siswa
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <LinkIcon className="w-3 h-3 text-emerald-600" /> Terkoneksi Tabel
            </span>
          </div>

          {/* Date Picker */}
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-extrabold text-rose-900 block">
                <Calendar className="w-3.5 h-3.5 inline mr-1" /> Tanggal Absensi:
              </span>
              <span className={`text-[10px] font-bold ${isHoliday ? 'text-rose-600' : 'text-emerald-700'}`}>
                {isHoliday
                  ? `Hari Libur: ${activeDayKaldik?.keterangan || 'Minggu'}`
                  : 'Hari Efektif Belajar'}
              </span>
            </div>
            <input
              type="date"
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-rose-300 bg-white font-mono font-bold text-xs"
            />
          </div>

          {/* Camera View */}
          <div className="flex items-center justify-between bg-slate-100 p-2.5 rounded-2xl border border-slate-200">
            <span className="text-xs font-bold text-slate-700">Kamera Scanner Barcode (CODE-128)</span>
            <button
              type="button"
              onClick={toggleCamera}
              className={`text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer ${
                cameraActive
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>{cameraActive ? 'Matikan Kamera' : 'Aktifkan Kamera'}</span>
            </button>
          </div>

          <div className="relative rounded-3xl overflow-hidden bg-slate-900 min-h-[220px] border-4 border-rose-200 flex flex-col items-center justify-center text-white">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
            />
            {cameraActive && <div className="laser-line z-10 pointer-events-none" />}
            {!cameraActive && (
              <div className="relative z-10 text-center p-4 space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-white/10 mx-auto flex items-center justify-center text-2xl text-rose-400">
                  <QrCode className="w-6 h-6" />
                </div>
                <p className="font-display font-extrabold text-xs">
                  Arahkan Kartu Barcode Siswa (CODE-128) ke Kamera
                </p>
                <p className="text-[11px] text-slate-400">
                  Atau klik salah satu tombol nama siswa di bawah untuk simulasi scan
                </p>
              </div>
            )}
          </div>

          {/* Last scanned box */}
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase text-emerald-700">Status Scan Terakhir</div>
                <div className="font-display font-black text-slate-800 truncate">{lastScannedStudent}</div>
              </div>
            </div>
            <span className="font-mono font-bold text-[11px] bg-white px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-800 shrink-0">
              {lastScannedTime}
            </span>
          </div>

          {/* Manual input */}
          <form onSubmit={handleManualScan} className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Scan USB Barcode / Ketik Kode, NISN, atau Nama..."
              className="flex-1 px-3.5 py-2 rounded-2xl border-2 border-slate-200 focus:border-rose-600 outline-none text-xs font-mono font-bold"
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-4 py-2 rounded-2xl text-xs cursor-pointer"
            >
              Scan
            </button>
          </form>

          {/* Quick simulation buttons */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase block mb-2">
              Simulasi Klik Cepat Scan Siswa:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {filteredStudents.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => recordAttendance(s, 'H')}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-100 hover:text-rose-700 border border-slate-200 text-[11px] font-bold text-slate-700 transition cursor-pointer"
                >
                  + {s.nama.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Daily Table */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-extrabold text-lg text-slate-800">
                Daftar Pendataan Kehadiran Harian ({activeClass})
              </h3>
              <p className="text-xs text-slate-500">
                Tanggal: <strong>{activeDate}</strong> • Terkoneksi ke e-Rapor dan Rekap Absensi
              </p>
            </div>
            <button
              type="button"
              onClick={markAllPresent}
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <CheckCheck className="w-4 h-4" /> Hadirkan Semua
            </button>
          </div>

          {/* Dropdown pilih siswa */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-rose-600" />
              <label className="text-xs font-extrabold text-slate-700">Pilih Siswa (Dropdown):</label>
            </div>
            <select
              value={selectedStudentDropdown}
              onChange={(e) => {
                setSelectedStudentDropdown(e.target.value);
                const s = students.find((st) => st.id === e.target.value);
                if (s) recordAttendance(s, 'H');
              }}
              className="flex-1 max-w-md px-3.5 py-2 rounded-xl border-2 border-rose-600 bg-white text-xs font-display font-extrabold text-slate-800 cursor-pointer outline-none"
            >
              <option value="">-- Pilih Nama Siswa untuk Catat Hadir --</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama} ({s.barcodeId})
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-xs uppercase font-extrabold">
                  <th className="p-3 rounded-l-xl">ID Barcode</th>
                  <th className="p-3">Foto & Nama Siswa</th>
                  <th className="p-3 text-center">Waktu Scan</th>
                  <th className="p-3 text-center">Status Kehadiran</th>
                  <th className="p-3 rounded-r-xl text-center">Ubah Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((s) => {
                  const rec = attendanceRecords[`${activeDate}_${s.id}`];
                  const status = rec ? rec.status : '-';
                  const time = rec ? rec.time : '--:--';

                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-rose-700">{s.barcodeId}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <img
                            src={s.fotoUrl}
                            alt={s.nama}
                            onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                            className="w-8 h-8 rounded-lg object-cover border cursor-zoom-in"
                          />
                          <span className="font-bold text-slate-800">{s.nama}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center font-mono text-xs">{time}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                            status === 'H'
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
                          {status === 'H'
                            ? 'Hadir'
                            : status === 'S'
                            ? 'Sakit'
                            : status === 'I'
                            ? 'Izin'
                            : status === 'A'
                            ? 'Alfa'
                            : 'Belum Scan'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => handleStatusChange(s.id, 'H')}
                            className={`px-2 py-1 ${
                              status === 'H' ? 'bg-emerald-600 text-white' : 'bg-white hover:bg-slate-100'
                            }`}
                          >
                            H
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(s.id, 'S')}
                            className={`px-2 py-1 border-l border-slate-200 ${
                              status === 'S' ? 'bg-sky-600 text-white' : 'bg-white hover:bg-slate-100'
                            }`}
                          >
                            S
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(s.id, 'I')}
                            className={`px-2 py-1 border-l border-slate-200 ${
                              status === 'I' ? 'bg-amber-500 text-white' : 'bg-white hover:bg-slate-100'
                            }`}
                          >
                            I
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(s.id, 'A')}
                            className={`px-2 py-1 border-l border-slate-200 ${
                              status === 'A' ? 'bg-rose-600 text-white' : 'bg-white hover:bg-slate-100'
                            }`}
                          >
                            A
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
