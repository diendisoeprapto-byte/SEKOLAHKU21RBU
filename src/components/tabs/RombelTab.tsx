import React from 'react';
import { School, Users, CheckCircle, ArrowRight } from 'lucide-react';
import { Student, Teacher } from '../../types';
import { CLASSES_LIST } from '../../utils/storage';
import { TabId } from '../Sidebar';

interface Props {
  activeClass: string;
  onSelectClass: (c: string) => void;
  students: Student[];
  teachers: Teacher[];
  onNavigateTab: (tab: TabId) => void;
}

export const RombelTab: React.FC<Props> = ({
  activeClass,
  onSelectClass,
  students,
  teachers,
  onNavigateTab,
}) => {
  const currentClassStudents = students.filter((s) => s.kelas === activeClass);

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase bg-rose-100 text-rose-700 px-3 py-1 rounded-full">
              Menu 1. Manajemen • Manajemen Rombongan Belajar
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1">
              Menu Rombel Kelas & Pengaturan Wali Kelas
            </h2>
            <p className="text-xs text-slate-500">
              Kelola data Rombongan Belajar (Kelas 1 s.d. Kelas 6) dan Wali Kelas pengampu. Klik rombel untuk
              memilih rombel aktif.
            </p>
          </div>
          <span className="text-xs font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 px-3.5 py-2 rounded-xl flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-600" /> Terintegrasi Hak Akses Login Wali Kelas
          </span>
        </div>

        {/* Grid Rombel Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {CLASSES_LIST.map((cls) => {
            const count = students.filter((s) => s.kelas === cls).length;
            const wali = teachers.find((t) => t.penugasan === cls);
            const isSelected = cls === activeClass;

            return (
              <div
                key={cls}
                onClick={() => onSelectClass(cls)}
                className={`p-4 rounded-3xl border-2 transition cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? 'bg-rose-50/70 border-rose-600 shadow-md ring-2 ring-rose-300'
                    : 'bg-white border-slate-200 hover:border-rose-300 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-black text-base text-slate-800">{cls}</span>
                  <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                    {count} Siswa
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">
                  Wali: <strong className="text-slate-700">{wali ? wali.nama : 'Belum Ditugaskan'}</strong>
                </p>
                {isSelected && (
                  <span className="mt-2 inline-block text-[10px] font-black uppercase text-rose-700 bg-rose-200/60 px-2 py-0.5 rounded-md">
                    Sedang Dipilih
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Student list for active class */}
        <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-black text-base text-slate-800">
              Daftar Peserta Didik ({activeClass})
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('siswa')}
              className="bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Users className="w-4 h-4" /> Kelola Siswa Rombel Ini
            </button>
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-extrabold">
                  <th className="p-3 w-12 text-center">No</th>
                  <th className="p-3">ID Barcode / NISN</th>
                  <th className="p-3">Nama Peserta Didik</th>
                  <th className="p-3 text-center">Agama</th>
                  <th className="p-3 text-center">Rombel</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentClassStudents.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                    <td className="p-3 font-mono font-bold text-rose-700">{s.barcodeId}</td>
                    <td className="p-3 font-bold text-slate-800">{s.nama}</td>
                    <td className="p-3 text-center">{s.agama}</td>
                    <td className="p-3 text-center font-semibold text-slate-600">{s.kelas}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => onNavigateTab('penilaian')}
                        className="text-xs text-rose-600 hover:underline font-bold"
                      >
                        Nilai &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
