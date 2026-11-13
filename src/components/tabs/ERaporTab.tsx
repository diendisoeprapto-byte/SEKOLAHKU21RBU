import React, { useState } from 'react';
import { Printer, Download, UserCheck, FileText, CheckCircle2 } from 'lucide-react';
import { Student, SchoolProfile, Teacher, Subject } from '../../types';
import { getStoredReportNotes, getStoredAssessments, getAssessmentCount } from '../../utils/storage';
import { getGradeNumberFromClass } from '../../data/classCurriculumData';
import { getStoredPenilaianEkskul } from './PenilaianEkskulTab';
import { getCatatanWaliOtomatisByRank } from './CatatanWaliTab';

interface Props {
  profile: SchoolProfile;
  students: Student[];
  teachers: Teacher[];
  subjects?: Subject[];
  activeClass: string;
  activeYear: string;
  activeSemester: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const ERaporTab: React.FC<Props> = ({
  profile,
  students,
  teachers,
  subjects,
  activeClass,
  activeYear,
  activeSemester,
  showToast,
}) => {
  const filteredStudents = students.filter((s) => s.kelas === activeClass);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(filteredStudents[0]?.id || '');
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>('A4');
  const [withKop, setWithKop] = useState(true);

  const student = filteredStudents.find((s) => s.id === selectedStudentId) || filteredStudents[0];
  const wali = teachers.find((t) => t.penugasan === activeClass);
  const kepsek = profile.kepalaSekolah;

  const notesMap = getStoredReportNotes();
  const currentNotes = student ? notesMap[student.id] : null;

  const getDefaultDecision = (kelas: string) => {
    if (kelas.startsWith('Kelas 6') || kelas.includes('6')) return 'Lulus ke Jenjang SMP';
    if (kelas.includes('1') || kelas.toUpperCase().includes(' I')) return 'Naik ke Kelas II (Dua)';
    if (kelas.includes('2') || kelas.toUpperCase().includes(' II')) return 'Naik ke Kelas III (Tiga)';
    if (kelas.includes('3') || kelas.toUpperCase().includes(' III')) return 'Naik ke Kelas IV (Empat)';
    if (kelas.includes('4') || kelas.toUpperCase().includes(' IV')) return 'Naik ke Kelas V (Lima)';
    if (kelas.includes('5') || kelas.toUpperCase().includes(' V')) return 'Naik ke Kelas VI (Enam)';
    return 'Lulus ke Jenjang SMP';
  };

  const rawDecision = currentNotes?.keputusanKenaikan || getDefaultDecision(activeClass);
  const currentDecision = rawDecision.includes('VII') ? 'Lulus ke Jenjang SMP' : rawDecision;

  // Subjects adapted to student religion with dynamic NA Rapor lookup
  const getSubjectList = () => {
    const agamaLabel =
      student?.agama === 'Kristen'
        ? 'Pendidikan Agama Kristen dan Budi Pekerti'
        : student?.agama === 'Katolik'
        ? 'Pendidikan Agama Katolik dan Budi Pekerti'
        : student?.agama === 'Buddha'
        ? 'Pendidikan Agama Buddha dan Budi Pekerti'
        : student?.agama === 'Hindu'
        ? 'Pendidikan Agama Hindu dan Budi Pekerti'
        : student?.agama === 'Konghucu'
        ? 'Pendidikan Agama Konghucu dan Budi Pekerti'
        : 'Pendidikan Agama Islam dan Budi Pekerti';

    const baseList = [
      { name: agamaLabel, defaultScore: 88, cap: 'Menunjukkan pemahaman yang sangat baik dalam memahami makna ayat/nilai keagamaan, serta berakhlak mulia.' },
      { name: 'Pendidikan Pancasila', defaultScore: 85, cap: 'Sangat baik dalam memahami hak dan kewajiban sebagai warga negara, serta gotong royong di lingkungan sekolah.' },
      { name: 'Bahasa Indonesia', defaultScore: 87, cap: 'Sangat mahir dalam menyusun teks deskripsi, membaca pemahaman teks informatif, dan mengekspresikan gagasan.' },
      { name: 'Matematika', defaultScore: 83, cap: 'Menunjukkan kemampuan baik dalam operasi hitung pecahan dan desimal. Perlu bimbingan dalam pemecahan soal cerita volume bangun ruang.' },
      { name: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)', defaultScore: 86, cap: 'Menunjukkan penguasaan sangat baik dalam materi peredaran darah manusia dan interaksi sosial masyarakat.' },
      { name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)', defaultScore: 84, cap: 'Sangat baik dalam mempraktikkan gerak dasar manipulatif dan kerja sama dalam permainan bola besar.' },
      { name: 'Seni dan Budaya (Seni Rupa)', defaultScore: 88, cap: 'Sangat kreatif dalam membuat karya rupa dua dimensi dan ornamen ragam hias khas Betawi.' },
      { name: 'Bahasa Inggris', defaultScore: 85, cap: 'Mampu berkomunikasi menggunakan kalimat sederhana sehari-hari dengan lafal yang baik.' },
      { name: 'Muatan Lokal: Pendidikan Lingkungan dan Budaya Jakarta (PLBJ)', defaultScore: 89, cap: 'Sangat menguasai materi pelestarian lingkungan kota Jakarta, kuliner Betawi, dan transportasi umum Jakarta.' },
    ];

    const gradeNum = getGradeNumberFromClass(activeClass);
    const hasKka =
      gradeNum >= 5 ||
      (subjects || []).some(
        (s) => s.code.toUpperCase().startsWith('KKA') || s.name.toLowerCase().includes('koding')
      );
    if (hasKka) {
      baseList.push({
        name: 'Koding dan Kecerdasan Artifisial (KKA)',
        defaultScore: 86,
        cap: 'Sangat baik dalam menerapkan berpikir komputasional, menyusun algoritma pemrograman blok visual, serta memahami etika penggunaan Kecerdasan Artifisial (AI).',
      });
    }

    return baseList.map((item) => {
      let finalScore = item.defaultScore;
      let dynamicCap = item.cap;

      if (subjects && student) {
        const matched = subjects.find(
          (s) =>
            s.name.toLowerCase().includes(item.name.toLowerCase()) ||
            item.name.toLowerCase().includes(s.name.toLowerCase()) ||
            (item.name.includes('PLBJ') && s.name.toLowerCase().includes('plbj')) ||
            (item.name.includes('KKA') && (s.code.toUpperCase().startsWith('KKA') || s.name.toLowerCase().includes('koding'))) ||
            (item.name.includes('Agama') && (s.code.startsWith('PAI') || s.code.startsWith('PAK') || s.name.toLowerCase().includes('agama')))
        );

        if (matched) {
          const key = `${activeYear}_${activeSemester}_${activeClass}_${matched.id}`;
          const assessmentData = getStoredAssessments(key);
          const count = getAssessmentCount(key);
          const grade = assessmentData[student.id];

          if (grade) {
            let totalAs = 0;
            const kktp = matched.kktp || 75;
            let highestScore = -1;
            let highestTpText = '';
            let lowestScore = 999;
            let lowestTpText = '';

            for (let i = 1; i <= count; i++) {
              const pure = grade.sumatif?.[i] ?? 0;
              const rem = grade.remedial?.[i] ?? 0;
              const effective = rem > 0 ? Math.max(pure, Math.min(rem, kktp)) : pure;
              totalAs += effective;

              const tpText = matched.tujuanPembelajaran?.[i - 1] || `tujuan pembelajaran ke-${i}`;
              if (effective > highestScore) {
                highestScore = effective;
                highestTpText = tpText;
              }
              if (effective > 0 && effective < lowestScore) {
                lowestScore = effective;
                lowestTpText = tpText;
              }
            }
            const avgAs = count > 0 ? totalAs / count : 0;
            const asts = grade.asts || 0;
            const asas = grade.asas || 0;
            if (avgAs > 0 || asts > 0 || asas > 0) {
              finalScore = Math.round((2 * avgAs + asts + asas) / 4);
            }

            // Kurikulum Merdeka dynamic report description from active TP:
            if (highestScore >= 80 && lowestScore > 0 && lowestScore < kktp && highestTpText && lowestTpText) {
              dynamicCap = `Menunjukkan penguasaan yang sangat baik dalam ${highestTpText}. Perlu bimbingan dan peningkatan dalam ${lowestTpText}.`;
            } else if (highestScore >= 75 && highestTpText) {
              dynamicCap = `Menunjukkan penguasaan yang sangat baik dalam ${highestTpText}, serta mampu menyelesaikan tugas dengan disiplin.`;
            } else if (lowestScore > 0 && lowestScore < kktp && lowestTpText) {
              dynamicCap = `Cukup menguasai materi pembelajaran, namun perlu bimbingan lebih lanjut dalam ${lowestTpText}.`;
            } else if (matched.description) {
              dynamicCap = `Menunjukkan pemahaman yang baik sesuai Capaian Pembelajaran: ${matched.description}`;
            }
          } else if (matched.tujuanPembelajaran && matched.tujuanPembelajaran.length > 0) {
            dynamicCap = `Menunjukkan penguasaan yang baik dalam ${matched.tujuanPembelajaran[0]}.`;
          } else if (matched.description) {
            dynamicCap = `Menunjukkan pemahaman yang baik sesuai Capaian Pembelajaran: ${matched.description}`;
          }
        }
      }

      return {
        name: item.name,
        score: finalScore,
        cap: dynamicCap,
      };
    });
  };

  // Dynamic extracurricular ratings for the current student
  const getStudentEkskuls = () => {
    if (!student) return [];
    try {
      const ekskulListRaw = localStorage.getItem('sekolahku_ekskul_list');
      const ekskulList: Array<{ id: string; nama: string; anggotaIds?: string[] }> = ekskulListRaw
        ? JSON.parse(ekskulListRaw)
        : [];
      const store = getStoredPenilaianEkskul();

      const results: Array<{ nama: string; predikat: string; keterangan: string }> = [];

      ekskulList.forEach((ek) => {
        const ratings = store[ek.id] || [];
        const studentRating = ratings.find((r) => r.studentId === student.id);
        const isEnrolled = ek.anggotaIds && ek.anggotaIds.includes(student.id);

        if (studentRating) {
          results.push({
            nama: ek.nama,
            predikat: studentRating.predikat,
            keterangan: studentRating.keterangan || `Menunjukkan keaktifan dan penguasaan teknik yang baik dalam kegiatan ${ek.nama}.`,
          });
        } else if (isEnrolled) {
          results.push({
            nama: ek.nama,
            predikat: 'Baik',
            keterangan: `Aktif mengikuti kegiatan ${ek.nama} dengan tertib dan berdisiplin tinggi.`,
          });
        }
      });

      if (results.length > 0) return results;
    } catch (e) {
      console.error(e);
    }

    // Default fallback so Rapor stays complete
    return [
      {
        nama: 'Pramuka Siaga / Penggalang',
        predikat: 'Sangat Baik',
        keterangan: 'Menunjukkan sikap kemandirian, kepemimpinan, dan gotong royong dalam kepramukaan.',
      },
      {
        nama: 'Seni Tari Tradisional Betawi',
        predikat: 'Baik',
        keterangan: 'Mampu menampilkan gerak tari tradisional Betawi dengan percaya diri.',
      },
    ];
  };

  const subjectsWithGrades = getSubjectList();

  const handlePrint = () => {
    window.print();
  };

  return (
    <section className="space-y-6">
      {/* Control bar */}
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
            e-Rapor Kurikulum Merdeka • SDN Rawa Badak Utara 21
          </span>
          <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" /> Lembar e-Rapor Peserta Didik
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

          <select
            value={paperSize}
            onChange={(e) => setPaperSize(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold bg-slate-50"
          >
            <option value="A4">Ukuran Kertas: A4</option>
            <option value="F4">Ukuran Kertas: F4 (Folio)</option>
          </select>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-100 px-3 py-2 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={withKop}
              onChange={(e) => setWithKop(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded"
            />
            Pakai Kop Resmi
          </label>

          <button
            type="button"
            onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer transition"
          >
            <Printer className="w-4 h-4" /> Cetak / Download PDF
          </button>
        </div>
      </div>

      {/* Printable Sheet */}
      <div className="flex justify-center bg-slate-200/60 p-4 sm:p-8 rounded-3xl overflow-x-auto">
        <div
          className={`${
            paperSize === 'A4' ? 'a4-rapor-sheet' : 'f4-rapor-sheet'
          } shadow-2xl rounded-sm text-slate-900 font-sans border border-slate-300 bg-white`}
        >
          {/* KOP RESMI SEKOLAH with 2 LOGOS */}
          {withKop && (
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
                <div className="text-[11px] font-extrabold uppercase text-slate-700">
                  DINAS PENDIDIKAN DASAR & MENENGAH
                </div>
                <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-slate-900 uppercase">
                  {profile.name}
                </h1>
                <p className="text-[10px] text-slate-600 font-medium">
                  NPSN: {profile.npsn} • {profile.alamat}
                </p>
                <p className="text-[10px] text-slate-600 font-medium">
                  {profile.kecamatan}, {profile.kota}, {profile.provinsi}
                </p>
              </div>
              <img
                src={profile.logoSekolahUrl}
                alt="Logo Sekolah"
                className="w-16 h-16 object-contain shrink-0"
              />
            </div>
          )}

          {/* Rapor Header Title */}
          <div className="text-center mb-3">
            <h2 className="font-display font-black text-base uppercase tracking-wider text-slate-900">
              LAPORAN HASIL BELAJAR (E-RAPOR)
            </h2>
            <span className="text-[11px] font-bold text-slate-600 uppercase">
              KURIKULUM MERDEKA • {activeSemester} • TAHUN PELAJARAN {activeYear}
            </span>
          </div>

          {/* Identity Grid */}
          {student && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs border border-slate-900 p-2.5 rounded-lg mb-3 bg-slate-50/50">
              <div className="flex">
                <span className="w-32 font-bold text-slate-700">Nama Peserta Didik</span>
                <span className="mr-2 font-bold">:</span>
                <span className="font-bold text-slate-900 uppercase">{student.nama}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-slate-700">Kelas / Rombel</span>
                <span className="mr-2 font-bold">:</span>
                <span className="font-bold text-slate-900">{student.kelas}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-slate-700">NISN / ID Barcode</span>
                <span className="mr-2 font-bold">:</span>
                <span className="font-mono font-bold text-slate-900">
                  {student.nisn} / {student.barcodeId}
                </span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-slate-700">Fase</span>
                <span className="mr-2 font-bold">:</span>
                <span className="font-bold text-slate-900">
                  {student.kelas.includes('1') || student.kelas.includes('2')
                    ? 'Fase A'
                    : student.kelas.includes('3') || student.kelas.includes('4')
                    ? 'Fase B'
                    : 'Fase C'}
                </span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-slate-700">Agama</span>
                <span className="mr-2 font-bold">:</span>
                <span className="font-bold text-slate-900">{student.agama}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-slate-700">Sekolah</span>
                <span className="mr-2 font-bold">:</span>
                <span className="font-bold text-slate-900">{profile.name}</span>
              </div>
            </div>
          )}

          {/* Table Capaian Kompetensi */}
          <div className="mb-3">
            <table className="w-full text-left border-collapse border border-slate-900 text-xs">
              <thead>
                <tr className="bg-slate-200 text-slate-900 font-black border-b border-slate-900 text-center">
                  <th className="p-2 border-r border-slate-900 w-8">No</th>
                  <th className="p-2 border-r border-slate-900 w-44">Muatan Pembelajaran</th>
                  <th className="p-2 border-r border-slate-900 w-16">Nilai Akhir</th>
                  <th className="p-2">Capaian Kompetensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {subjectsWithGrades.map((sub, idx) => (
                  <tr key={idx} className="border-b border-slate-900">
                    <td className="p-2 border-r border-slate-900 text-center font-bold">{idx + 1}</td>
                    <td className="p-2 border-r border-slate-900 font-bold leading-tight">{sub.name}</td>
                    <td className="p-2 border-r border-slate-900 text-center font-mono font-black text-sm">
                      {sub.score}
                    </td>
                    <td className="p-2 text-[11px] leading-relaxed text-slate-800">{sub.cap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* HASIL KOKURIKULER (PROJEK PENGUATAN PROFIL PELAJAR PANCASILA - P5) */}
          <div className="border border-slate-900 rounded-lg p-2.5 mb-3 text-xs bg-slate-50/30">
            <div className="flex items-center justify-between font-black text-slate-900 uppercase text-[11px] mb-1.5 pb-1 border-b border-slate-900">
              <span className="flex items-center gap-1.5">
                Hasil Kokurikuler (Projek Penguatan Profil Pelajar Pancasila)
              </span>
              <span className="text-[10px] font-bold text-slate-600 normal-case">
                Tema: Gerakan 7 Kebiasaan Anak Indonesia Hebat & Gaya Hidup Berkelanjutan
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-bold text-slate-900">
                  Nama Projek: "Napas Hijau: Tanam, Kompos, Lestari!"
                </span>
                <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                  Predikat: Sangat Berkembang (SB)
                </span>
              </div>
              <p className="text-[10.5px] text-slate-700 leading-relaxed italic">
                "{currentNotes?.catatanWali
                  ? `Ananda ${student?.nama || 'peserta didik'} menunjukkan partisipasi aktif, kemandirian, gotong royong, dan nalar kritis yang tinggi dalam pelaksanaan kegiatan penghijauan dan pembiasaan karakter Profil Pelajar Pancasila.`
                  : `Peserta didik aktif berkolaborasi, bertanggung jawab dalam pengelolaan lingkungan sekolah, serta mengamalkan nilai-nilai luhur Pancasila secara nyata.`}"
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-0.5 text-[10px]">
                <div className="p-1.5 bg-white border border-slate-300 rounded text-center">
                  <div className="text-[9px] text-slate-500 font-bold leading-tight">1. Beriman & Bertakwa</div>
                  <div className="font-black text-emerald-800 text-[9.5px]">Berkembang Sesuai Harapan</div>
                </div>
                <div className="p-1.5 bg-white border border-slate-300 rounded text-center">
                  <div className="text-[9px] text-slate-500 font-bold leading-tight">2. Bergotong Royong</div>
                  <div className="font-black text-emerald-800 text-[9.5px]">Sangat Berkembang</div>
                </div>
                <div className="p-1.5 bg-white border border-slate-300 rounded text-center">
                  <div className="text-[9px] text-slate-500 font-bold leading-tight">3. Bernalar Kritis</div>
                  <div className="font-black text-emerald-800 text-[9.5px]">Sangat Berkembang</div>
                </div>
                <div className="p-1.5 bg-white border border-slate-300 rounded text-center">
                  <div className="text-[9px] text-slate-500 font-bold leading-tight">4. Mandiri & Kreatif</div>
                  <div className="font-black text-emerald-800 text-[9.5px]">Berkembang Sesuai Harapan</div>
                </div>
              </div>
            </div>
          </div>

          {/* Ekstrakurikuler & Kehadiran in 2 columns */}
          <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
            {/* Ekskul */}
            <div className="border border-slate-900 rounded-lg p-2 bg-slate-50/30">
              <div className="font-black text-slate-900 uppercase text-[11px] mb-1.5 pb-1 border-b border-slate-900 flex items-center justify-between">
                <span>Kegiatan Ekstrakurikuler</span>
                <span className="text-[9px] font-normal text-slate-500">Terkoneksi Penilaian Ekskul</span>
              </div>
              <table className="w-full text-left text-[10.5px]">
                <thead>
                  <tr className="border-b border-slate-300 font-bold text-slate-800">
                    <th className="pb-1 w-2/5">Kegiatan</th>
                    <th className="pb-1 text-center w-1/5">Predikat</th>
                    <th className="pb-1 w-2/5">Keterangan / Pencapaian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {getStudentEkskuls().map((ek, i) => (
                    <tr key={i}>
                      <td className="py-1 font-semibold text-slate-900">{ek.nama}</td>
                      <td className="py-1 text-center font-black text-emerald-800">{ek.predikat}</td>
                      <td className="py-1 text-[9.5px] text-slate-600 leading-tight">{ek.keterangan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Kehadiran */}
            <div className="border border-slate-900 rounded-lg p-2 bg-slate-50/30">
              <div className="font-black text-slate-900 uppercase text-[11px] mb-1.5 pb-1 border-b border-slate-900">
                Ketidakhadiran (Semester Ini)
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Sakit (S)</span>
                  <span className="font-bold">0 Hari</span>
                </div>
                <div className="flex justify-between">
                  <span>Izin (I)</span>
                  <span className="font-bold">1 Hari</span>
                </div>
                <div className="flex justify-between">
                  <span>Tanpa Keterangan (A)</span>
                  <span className="font-bold">0 Hari</span>
                </div>
              </div>
            </div>
          </div>

          {/* Catatan Wali Kelas */}
          <div className="border border-slate-900 rounded-lg p-2.5 mb-4 text-xs bg-slate-50/30">
            <span className="font-black text-slate-900 uppercase text-[11px] block mb-1">
              Catatan Wali Kelas:
            </span>
            <p className="italic text-slate-800 text-[11px] leading-relaxed">
              "{currentNotes?.catatanWali || getCatatanWaliOtomatisByRank((filteredStudents.findIndex((st) => st.id === student?.id) >= 0 ? filteredStudents.findIndex((st) => st.id === student?.id) + 1 : 1))}"
            </p>
            <div className="mt-2 pt-1 border-t border-slate-300 font-bold text-slate-900 text-xs">
              Keputusan: <span className="font-black text-emerald-900">{currentDecision}</span>
            </div>
          </div>

          {/* Signatures */}
          <div className="pt-2">
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              <div>
                <p className="font-medium text-slate-700 mb-16">Mengetahui,<br />Orang Tua / Wali Murid</p>
                <div className="sig-name-line w-40 mx-auto"></div>
                <p className="text-[10px] text-slate-500">(Nama Terang Orang Tua)</p>
              </div>

              <div>
                <p className="font-medium text-slate-700 mb-16">Mengetahui,<br />Kepala Sekolah<br />{profile.name}</p>
                <div className="sig-name-line w-44 mx-auto font-black text-slate-900">
                  {kepsek.nama}
                </div>
                <p className="text-[10px] font-mono text-slate-600">
                  {kepsek.status === 'PPPK' ? 'NIPPPK. ' : kepsek.status === 'KKI' ? 'NIKKI. ' : 'NIP. '}
                  {kepsek.nip}
                </p>
              </div>

              <div>
                <div className="text-xs mb-1 text-slate-800 font-medium">
                  Jakarta, 19 Desember 2026
                </div>
                <p className="font-medium text-slate-700 mb-12">Mengetahui,<br />Wali Kelas</p>
                <div className="sig-name-line w-44 mx-auto font-black text-slate-900">
                  {wali?.nama || 'Siti Aminah, S.Pd.'}
                </div>
                <p className="text-[10px] font-mono text-slate-600">
                  {wali?.statusPegawai === 'PPPK' ? 'NIPPPK. ' : 'NIP. '}
                  {wali?.nip || '198504122010012008'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
