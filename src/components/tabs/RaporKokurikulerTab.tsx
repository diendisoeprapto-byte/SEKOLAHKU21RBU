import React, { useState } from 'react';
import { Printer, Sprout, UserCheck } from 'lucide-react';
import { SchoolProfile, Student, Teacher } from '../../types';

interface Props {
  profile: SchoolProfile;
  students: Student[];
  teachers: Teacher[];
  activeClass: string;
  activeYear: string;
}

export const RaporKokurikulerTab: React.FC<Props> = ({
  profile,
  students,
  teachers,
  activeClass,
  activeYear,
}) => {
  const filteredStudents = students.filter((s) => s.kelas === activeClass);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(filteredStudents[0]?.id || '');

  const student = filteredStudents.find((s) => s.id === selectedStudentId) || filteredStudents[0];
  const wali = teachers.find((t) => t.penugasan === activeClass);
  const kepsek = profile.kepalaSekolah;

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
            Rapor Kokurikuler (P5) • Kurikulum Merdeka
          </span>
          <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
            <Sprout className="w-5 h-5 text-emerald-600" /> Rapor Projek Penguatan Profil Pelajar Pancasila
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-slate-500" />
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="px-3.5 py-2 rounded-xl border-2 border-emerald-500 bg-white font-display font-extrabold text-xs text-slate-800 outline-none cursor-pointer"
            >
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama} ({s.barcodeId})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer transition"
          >
            <Printer className="w-4 h-4" /> Cetak Rapor Kokurikuler
          </button>
        </div>
      </div>

      {/* Printable Sheet P5 */}
      <div className="flex justify-center bg-slate-200/60 p-4 sm:p-8 rounded-3xl overflow-x-auto">
        <div className="a4-rapor-sheet shadow-2xl rounded-sm text-slate-900 font-sans border border-slate-300 bg-white">
          {/* Header Kop with 2 Logos */}
          <div className="flex items-center justify-between border-b-4 border-slate-900 pb-3 mb-4">
            <img
              src={profile.logoKemendikbudUrl}
              alt="Logo Kemendikbud"
              className="w-16 h-16 object-contain shrink-0"
            />
            <div className="text-center px-2 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-700">
                PEMERINTAH PROVINSI DKI JAKARTA
              </div>
              <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-slate-900 uppercase">
                {profile.name}
              </h1>
              <p className="text-[10px] text-slate-600 font-medium">
                RAPOR PROJEK PENGUATAN PROFIL PELAJAR PANCASILA (P5)
              </p>
            </div>
            <img
              src={profile.logoSekolahUrl}
              alt="Logo Sekolah"
              className="w-16 h-16 object-contain shrink-0"
            />
          </div>

          {student && (
            <div className="grid grid-cols-2 gap-2 text-xs border border-slate-900 p-2.5 rounded-lg mb-4 bg-slate-50/40">
              <div>
                Nama: <strong>{student.nama}</strong>
              </div>
              <div>
                Kelas: <strong>{student.kelas}</strong>
              </div>
              <div>
                NISN: <strong className="font-mono">{student.nisn}</strong>
              </div>
              <div>
                Tahun Pelajaran: <strong>{activeYear}</strong>
              </div>
            </div>
          )}

          {/* Project 1 */}
          <div className="border border-slate-900 rounded-lg p-3 mb-4 space-y-2">
            <div className="bg-emerald-100 p-2 rounded font-black text-xs text-emerald-950 uppercase">
              Projek 1: Gaya Hidup Berkelanjutan - "Pilah Sampah Jadi Berkah di SDN RBU 21"
            </div>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              Peserta didik menunjukkan kemampuan luar biasa dalam memilah sampah organik dan non-organik di sekolah,
              serta bergotong royong mendaur ulang botol plastik menjadi pot tanaman hidroponik.
            </p>
            <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold pt-1">
              <div className="bg-slate-100 p-1 rounded">BB: -</div>
              <div className="bg-slate-100 p-1 rounded">MB: -</div>
              <div className="bg-slate-100 p-1 rounded">BSH: -</div>
              <div className="bg-emerald-600 text-white p-1 rounded font-black">
                SB (Sangat Berkembang) ✓
              </div>
            </div>
          </div>

          {/* Project 2 */}
          <div className="border border-slate-900 rounded-lg p-3 mb-6 space-y-2">
            <div className="bg-amber-100 p-2 rounded font-black text-xs text-amber-950 uppercase">
              Projek 2: Kearifan Lokal - "Melestarikan Budaya & Kuliner Khas Betawi"
            </div>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              Peserta didik aktif berkolaborasi dan berkebinekaan global dalam memperkenalkan kesenian ondel-ondel
              serta kuliner tradisional Betawi Jakarta Utara.
            </p>
            <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold pt-1">
              <div className="bg-slate-100 p-1 rounded">BB: -</div>
              <div className="bg-slate-100 p-1 rounded">MB: -</div>
              <div className="bg-emerald-600 text-white p-1 rounded font-black">
                BSH (Sesuai Harapan) ✓
              </div>
              <div className="bg-slate-100 p-1 rounded">SB: -</div>
            </div>
          </div>

          {/* Signatures */}
          <div className="pt-4 border-t border-slate-300">
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              <div>
                <p className="font-medium text-slate-700 mb-16">Orang Tua / Wali</p>
                <div className="sig-name-line w-40 mx-auto"></div>
                <p className="text-[10px] text-slate-500">(Nama Orang Tua)</p>
              </div>

              <div>
                <p className="font-medium text-slate-700 mb-16">Mengetahui,<br />Kepala Sekolah</p>
                <div className="sig-name-line w-44 mx-auto font-black text-slate-900">
                  {kepsek.nama}
                </div>
                <p className="text-[10px] font-mono text-slate-600">
                  {kepsek.status === 'PPPK' ? 'NIPPPK. ' : 'NIP. '}
                  {kepsek.nip}
                </p>
              </div>

              <div>
                <div className="text-xs mb-1 text-slate-800">Jakarta, 19 Desember 2026</div>
                <p className="font-medium text-slate-700 mb-12">Mengetahui,<br />Wali Kelas</p>
                <div className="sig-name-line w-44 mx-auto font-black text-slate-900">
                  {wali?.nama || 'Siti Aminah, S.Pd.'}
                </div>
                <p className="text-[10px] font-mono text-slate-600">NIP. {wali?.nip || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
