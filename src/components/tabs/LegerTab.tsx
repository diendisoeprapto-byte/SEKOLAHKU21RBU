import React, { useMemo } from 'react';
import { Table, FileSpreadsheet, Printer, TrendingUp, Trophy } from 'lucide-react';
import { Subject, Student, SchoolProfile } from '../../types';
import { exportLegerToXLSX } from '../../utils/excel';
import { getStoredAssessments, getAssessmentCount } from '../../utils/storage';
import { calculateClassStudentRankings } from '../../utils/rankingHelper';

interface Props {
  profile: SchoolProfile;
  subjects: Subject[];
  students: Student[];
  activeClass: string;
  activeYear: string;
  activeSemester: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

export const LegerTab: React.FC<Props> = ({
  profile,
  subjects,
  students,
  activeClass,
  activeYear,
  activeSemester,
  showToast,
  onOpenZoom,
}) => {
  const { rankedMap, studentRows, displaySubjects } = useMemo(() => {
    return calculateClassStudentRankings(students, subjects, activeClass, activeYear, activeSemester);
  }, [students, subjects, activeClass, activeYear, activeSemester]);

  const handleExportXLSX = () => {
    const dataForExcel = studentRows.map((row, idx) => {
      const obj: Record<string, any> = {
        'No': idx + 1,
        'ID Barcode': row.student.barcodeId,
        'NISN': row.student.nisn,
        'Nama Peserta Didik': row.student.nama,
        'Agama': row.student.agama,
      };

      displaySubjects.forEach((sub) => {
        obj[sub.name] = row.scores[sub.code];
      });

      obj['Total Nilai'] = row.total;
      obj['Rata-Rata'] = row.average;
      obj['Peringkat'] = rankedMap[row.student.id];

      return obj;
    });

    exportLegerToXLSX(profile.name, activeClass, activeYear, activeSemester, dataForExcel);
    showToast('Leger Nilai Format .XLSX berhasil diunduh!', 'success');
  };

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
              Menu 4. Penilaian & Pelaporan • Rekapitulasi Rombel
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
              <Table className="w-5 h-5 text-emerald-600" /> Leger / Rekapitulasi Nilai Kelas ({activeClass})
            </h2>
            <p className="text-xs text-slate-500">
              Tahun Pelajaran: <strong>{activeYear}</strong> • <strong>{activeSemester}</strong> • Satuan Pendidikan:{' '}
              <strong>{profile.name}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportXLSX}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-4 py-2.5 rounded-2xl text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Ekspor Leger Format .XLSX Asli
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-display font-extrabold px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Cetak Leger
            </button>
          </div>
        </div>

        {/* Master Leger Table */}
        <div className="overflow-x-auto border-2 border-slate-200 rounded-3xl shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
                <th className="p-3 w-10 text-center border-r border-slate-200">No</th>
                <th className="p-3 min-w-[170px] border-r border-slate-200">Foto & Nama Peserta Didik</th>
                <th className="p-3 text-center border-r border-slate-200 w-20">Agama</th>
                {displaySubjects.map((sub) => (
                  <th key={sub.code} className="p-2.5 text-center border-r border-slate-200 font-black">
                    {sub.code}
                  </th>
                ))}
                <th className="p-3 text-center border-r border-slate-200 bg-sky-50 text-sky-950 font-black">
                  Total
                </th>
                <th className="p-3 text-center border-r border-slate-200 bg-emerald-50 text-emerald-950 font-black">
                  Rata-rata
                </th>
                <th className="p-3 text-center bg-amber-50 text-amber-950 font-black w-14">Rank</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {studentRows.map((row, idx) => {
                const rank = rankedMap[row.student.id];
                return (
                  <tr key={row.student.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 text-center font-bold text-slate-500 border-r border-slate-200">
                      {idx + 1}
                    </td>
                    <td className="p-3 border-r border-slate-200">
                      <div className="flex items-center gap-2">
                        <img
                          src={row.student.fotoUrl}
                          alt={row.student.nama}
                          onClick={() => onOpenZoom(row.student.fotoUrl, row.student.nama)}
                          className="w-8 h-8 rounded-lg object-cover border cursor-zoom-in"
                        />
                        <span className="font-bold text-slate-800">{row.student.nama}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center border-r border-slate-200 text-slate-600 font-medium">
                      {row.student.agama}
                    </td>
                    {displaySubjects.map((sub) => (
                      <td
                        key={sub.code}
                        className="p-2 text-center border-r border-slate-200 font-mono font-bold text-slate-700"
                      >
                        {row.scores[sub.code]}
                      </td>
                    ))}
                    <td className="p-3 text-center border-r border-slate-200 font-mono font-black text-sky-800 bg-sky-50/30">
                      {row.total}
                    </td>
                    <td className="p-3 text-center border-r border-slate-200 font-mono font-black text-emerald-800 bg-emerald-50/30">
                      {row.average}
                    </td>
                    <td className="p-3 text-center bg-amber-50/30">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-display font-black text-xs ${
                          rank === 1
                            ? 'bg-amber-400 text-slate-950 shadow-xs'
                            : rank === 2
                            ? 'bg-slate-300 text-slate-900'
                            : rank === 3
                            ? 'bg-amber-200 text-amber-900'
                            : 'text-slate-600'
                        }`}
                      >
                        {rank}
                      </span>
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
