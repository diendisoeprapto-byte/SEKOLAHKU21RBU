import React from 'react';
import { X, FileSpreadsheet } from 'lucide-react';
import { Student, KaldikDay } from '../../types';
import { AttendanceRecordItem } from '../../utils/storage';
import { exportMonthlyMatrixToXLSX } from '../../utils/excel';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  yearMonth: string; // YYYY-MM
  students: Student[];
  attendanceRecords: Record<string, AttendanceRecordItem>;
  kaldikDays: KaldikDay[];
}

export const MonthlyAttendanceModal: React.FC<Props> = ({
  isOpen,
  onClose,
  yearMonth,
  students,
  attendanceRecords,
  kaldikDays,
}) => {
  if (!isOpen) return null;

  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr) || new Date().getFullYear();
  const month = parseInt(monthStr) || new Date().getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const kaldikMap: Record<string, boolean> = {};
  kaldikDays.forEach((k) => {
    if (k.isHoliday) kaldikMap[k.date] = true;
  });

  const attendanceMap: Record<string, string> = {};
  Object.values(attendanceRecords).forEach((r) => {
    attendanceMap[`${r.date}_${r.studentId}`] = r.status;
  });

  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const currentMonthName = monthNames[month - 1] || 'Bulan';

  const handleDownloadXLSX = () => {
    exportMonthlyMatrixToXLSX(
      monthStr,
      year,
      daysInMonth,
      students,
      attendanceMap,
      kaldikMap
    );
  };

  return (
    <div className="fixed inset-0 z-[920] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white max-w-[96vw] w-full max-h-[92vh] rounded-3xl shadow-2xl border-2 border-sky-200 flex flex-col overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-sky-600 via-sky-700 to-indigo-700 text-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-white/20 px-2.5 py-0.5 rounded-full">
              Matriks Kalender Pendidikan DKI Jakarta
            </span>
            <h3 className="font-display font-black text-base sm:text-lg mt-0.5">
              Detail Rekapitulasi Absensi Bulanan ({currentMonthName} {year})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadXLSX}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4" /> Download Matriks (.XLSX)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/20 hover:bg-rose-600 text-white flex items-center justify-center text-sm font-bold transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <span className="font-bold text-slate-700">
              Jumlah Siswa: <strong>{students.length} Siswa</strong>
            </span>
            <span className="font-bold text-slate-700">
              Hari Kalender: <strong>{daysInMonth} Hari</strong>
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                  <th className="p-2 border-r border-slate-200 w-8 text-center">No</th>
                  <th className="p-2 border-r border-slate-200 min-w-[140px]">Nama Siswa</th>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const isSunday = new Date(year, month - 1, d).getDay() === 0;
                    return (
                      <th
                        key={d}
                        className={`p-1.5 border-r border-slate-200 text-center w-7 ${
                          isSunday ? 'bg-rose-100 text-rose-700 font-black' : ''
                        }`}
                      >
                        {d}
                      </th>
                    );
                  })}
                  <th className="p-2 border-r border-slate-200 text-center w-8 bg-emerald-50 text-emerald-800">H</th>
                  <th className="p-2 border-r border-slate-200 text-center w-8 bg-sky-50 text-sky-800">S</th>
                  <th className="p-2 border-r border-slate-200 text-center w-8 bg-amber-50 text-amber-800">I</th>
                  <th className="p-2 border-r border-slate-200 text-center w-8 bg-rose-50 text-rose-800">A</th>
                  <th className="p-2 border-r border-slate-200 text-center w-12 bg-emerald-100 text-emerald-950 font-black">% Hadir</th>
                  <th className="p-2 border-r border-slate-200 text-center w-12 bg-sky-100 text-sky-950 font-black">% Sakit</th>
                  <th className="p-2 border-r border-slate-200 text-center w-12 bg-amber-100 text-amber-950 font-black">% Izin</th>
                  <th className="p-2 text-center w-12 bg-rose-100 text-rose-950 font-black">% Alfa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s, idx) => {
                  let hadir = 0;
                  let sakit = 0;
                  let izin = 0;
                  let alfa = 0;
                  let totalEfektif = 0;

                  const daysCells = Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const dayStr = String(d).padStart(2, '0');
                    const dateKey = `${year}-${monthStr}-${dayStr}`;
                    const isSunday = new Date(year, month - 1, d).getDay() === 0;
                    const isHoliday = isSunday || !!kaldikMap[dateKey];

                    if (isHoliday) {
                      return (
                        <td
                          key={d}
                          className="p-1 border-r border-slate-200 text-center bg-rose-50 text-rose-600 font-bold"
                        >
                          L
                        </td>
                      );
                    }

                    totalEfektif++;
                    const st = attendanceMap[`${dateKey}_${s.id}`] || 'H';
                    if (st === 'H') hadir++;
                    else if (st === 'S') sakit++;
                    else if (st === 'I') izin++;
                    else if (st === 'A') alfa++;

                    const colorClass =
                      st === 'H'
                        ? 'text-emerald-700 bg-emerald-50/50 font-bold'
                        : st === 'S'
                        ? 'text-sky-700 bg-sky-100 font-extrabold'
                        : st === 'I'
                        ? 'text-amber-800 bg-amber-100 font-extrabold'
                        : 'text-rose-700 bg-rose-100 font-extrabold';

                    return (
                      <td key={d} className={`p-1 border-r border-slate-200 text-center ${colorClass}`}>
                        {st}
                      </td>
                    );
                  });

                  const pctHadir = totalEfektif > 0 ? Math.round((hadir / totalEfektif) * 100) : 100;
                  const pctSakit = totalEfektif > 0 ? Math.round((sakit / totalEfektif) * 100) : 0;
                  const pctIzin = totalEfektif > 0 ? Math.round((izin / totalEfektif) * 100) : 0;
                  const pctAlfa = totalEfektif > 0 ? Math.round((alfa / totalEfektif) * 100) : 0;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800 whitespace-nowrap">
                        {s.nama}
                      </td>
                      {daysCells}
                      <td className="p-2 border-r border-slate-200 text-center font-bold text-emerald-700 bg-emerald-50/30">
                        {hadir}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center font-bold text-sky-700 bg-sky-50/30">
                        {sakit}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center font-bold text-amber-800 bg-amber-50/30">
                        {izin}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center font-bold text-rose-700 bg-rose-50/30">
                        {alfa}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center font-black text-emerald-800 bg-emerald-50">
                        {pctHadir}%
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center font-bold text-sky-800 bg-sky-50">
                        {pctSakit}%
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center font-bold text-amber-800 bg-amber-50">
                        {pctIzin}%
                      </td>
                      <td className="p-2 text-center font-bold text-rose-800 bg-rose-50">
                        {pctAlfa}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold text-slate-600 bg-amber-50/70 p-3 rounded-2xl border border-amber-200">
            <span>
              <strong className="inline-block w-5 h-5 rounded bg-emerald-100 text-emerald-700 text-center leading-5 mr-1">
                H
              </strong>
              Hadir
            </span>
            <span>
              <strong className="inline-block w-5 h-5 rounded bg-sky-100 text-sky-700 text-center leading-5 mr-1">
                S
              </strong>
              Sakit
            </span>
            <span>
              <strong className="inline-block w-5 h-5 rounded bg-amber-100 text-amber-800 text-center leading-5 mr-1">
                I
              </strong>
              Izin
            </span>
            <span>
              <strong className="inline-block w-5 h-5 rounded bg-rose-100 text-rose-700 text-center leading-5 mr-1">
                A
              </strong>
              Alfa
            </span>
            <span>
              <strong className="inline-block w-5 h-5 rounded bg-red-600 text-white text-center leading-5 mr-1">
                L
              </strong>
              Hari Libur Kaldik DKI Jakarta / Minggu
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
