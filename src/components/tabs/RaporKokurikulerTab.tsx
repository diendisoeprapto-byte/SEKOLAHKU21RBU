import React, { useState, useEffect } from 'react';
import { Printer, Sprout, UserCheck } from 'lucide-react';
import { SchoolProfile, Student, Teacher } from '../../types';
import { formatNipLabel, resolveKepalaSekolah, resolveWaliKelas } from '../../utils/teacherSync';
import { isSemesterOneLabel } from '../../utils/semesterUtils';

interface Props {
  profile: SchoolProfile;
  students: Student[];
  teachers: Teacher[];
  activeClass: string;
  activeYear: string;
  activeSemester?: string;
}

export const RaporKokurikulerTab: React.FC<Props> = ({
  profile,
  students,
  teachers,
  activeClass,
  activeYear,
  activeSemester = 'Semester 1',
}) => {
  const filteredStudents = students.filter((s) => s.kelas === activeClass);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(filteredStudents[0]?.id || '');

  useEffect(() => {
    if (filteredStudents.length > 0 && !filteredStudents.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(filteredStudents[0].id);
    }
  }, [activeClass, filteredStudents, selectedStudentId]);

  const student = filteredStudents.find((s) => s.id === selectedStudentId) || filteredStudents[0];
  const wali = resolveWaliKelas(teachers, activeClass);
  const kepsek = resolveKepalaSekolah(teachers, profile);

  const hasSavedTermKokurikuler = (() => {
    try {
      const raw = localStorage.getItem(`sekolahku_kokurikuler_${activeYear}_${activeSemester}`);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length > 0 : Boolean(parsed && Object.keys(parsed).length > 0);
    } catch {
      return false;
    }
  })();

  const hasKokurikulerData =
    hasSavedTermKokurikuler || (activeYear === '2026/2027' && isSemesterOneLabel(activeSemester));

  const formattedDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
            Rapor Kokurikuler • {activeSemester} • {activeYear}
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
                RAPOR KOKURIKULER PROJEK PENGUATAN PROFIL PELAJAR PANCASILA
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
                Tahun / Semester: <strong>{activeYear} ({activeSemester})</strong>
              </div>
            </div>
          )}

          {hasKokurikulerData ? (
            <>
              {/* Project 1 */}
              <div className="border border-slate-900 rounded-lg p-3 mb-4 space-y-2">
                <div className="bg-emerald-100 p-2 rounded font-black text-xs text-emerald-950 uppercase">
                  Projek 1: Gaya Hidup Berkelanjutan - &quot;Pilah Sampah Jadi Berkah di SDN RBU 21&quot;
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
                  Projek 2: Kearifan Lokal - &quot;Melestarikan Budaya &amp; Kuliner Khas Betawi&quot;
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
            </>
          ) : (
            <div className="border border-dashed border-slate-400 rounded-xl p-8 mb-6 text-center bg-slate-50">
              <Sprout className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-black text-slate-700">
                Belum Ada Data Projek Kokurikuler untuk {activeSemester} ({activeYear})
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Data capaian projek kokurikuler akan tampil setelah penilaian kokurikuler semester ini diisi.
              </p>
            </div>
          )}

          {/* Signatures */}
          <div className="pt-4 border-t border-slate-300">
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              <div>
                <p className="font-medium text-slate-700">Orang Tua / Wali</p>
                <div style={{ height: '4cm' }} />
                <div className="sig-name-line w-40 mx-auto"></div>
                <p className="text-[10px] text-slate-500">(Nama Orang Tua)</p>
              </div>

              <div>
                <p className="font-medium text-slate-700">Mengetahui,<br />Kepala Sekolah</p>
                <div style={{ height: '4cm' }} />
                <div className="sig-name-line w-44 mx-auto font-black text-slate-900">
                  {kepsek.nama}
                </div>
                <p className="text-[10px] font-mono text-slate-600">
                  {formatNipLabel(kepsek.status, kepsek.nip)}
                </p>
              </div>

              <div>
                <div className="text-xs mb-1 text-slate-800">Jakarta, {formattedDate}</div>
                <p className="font-medium text-slate-700">Mengetahui,<br />Wali Kelas</p>
                <div style={{ height: '4cm' }} />
                <div className="sig-name-line w-44 mx-auto font-black text-slate-900">
                  {wali?.nama || 'Belum Ditugaskan'}
                </div>
                <p className="text-[10px] font-mono text-slate-600">
                  {formatNipLabel(wali?.statusPegawai, wali?.nip)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
