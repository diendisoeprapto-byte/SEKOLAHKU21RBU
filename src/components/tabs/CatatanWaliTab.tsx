import React, { useState, useMemo } from 'react';
import { MessageSquare, Save, User, Sparkles, Trophy, Award, Medal, CheckCircle2 } from 'lucide-react';
import { Student, StudentReportNotes, Subject } from '../../types';
import {
  getStoredReportNotes,
  saveStoredReportNotes,
  getStoredAssessments,
  getAssessmentCount,
} from '../../utils/storage';
import { pushAllDataToCloud } from '../../utils/cloudSync';

interface Props {
  students: Student[];
  subjects?: Subject[];
  activeClass: string;
  activeYear?: string;
  activeSemester?: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

/**
 * Template Catatan Wali Kelas Berdasarkan Peringkat Akademik Siswa
 * Kategori 1: Peringkat 1
 * Kategori 2: Peringkat 2 - 3
 * Kategori 3: Peringkat 4 - 10
 * Kategori 4: Peringkat 11 - 20
 * Kategori 5: Peringkat 21 - 32
 */
export const getCatatanWaliOtomatisByRank = (rank: number): string => {
  if (rank === 1) {
    return 'Selamat atas pencapaian luar biasamu semester ini! Prestasimu adalah hasil nyata dari kerja keras, dedikasi, dan keberanianmu merangkul tantangan belajar. Teruslah kembangkan rasa ingin tahumu dan jadikan proses belajar sebagai perjalanan tanpa henti. Ingat, menjadi yang terbaik bukanlah akhir, melainkan pembuktian bahwa dengan strategi dan ketekunan, kamu selalu bisa melampaui batasanmu sebelumnya.';
  }
  if (rank >= 2 && rank <= 3) {
    return 'Pencapaianmu sangat membanggakan! Kamu telah membuktikan bahwa konsistensi dan kemauan untuk terus berproses selalu membuahkan hasil yang manis. Pertahankan semangat belajarmu dan jangan pernah berhenti mengeksplorasi potensi dirimu. Teruslah asah kemampuanmu, karena selalu ada ruang yang luas untuk tumbuh menjadi versi dirimu yang lebih hebat lagi.';
  }
  if (rank >= 4 && rank <= 10) {
    return 'Selamat atas hasil belajarmu yang sangat baik! Bapak mengapresiasi kegigihanmu dan caramu bangkit setiap kali menghadapi materi yang menantang. Teruslah berani mengambil risiko dalam belajar. Ingatlah bahwa tantangan dan kesalahan adalah latihan terbaik bagi otak untuk berkembang. Jadikan pencapaian ini sebagai batu pijakan untuk melompat lebih tinggi di semester depan.';
  }
  if (rank >= 11 && rank <= 20) {
    return "Semester ini kamu telah menunjukkan progres dan usaha yang patut diapresiasi. Ingatlah bahwa kecerdasan dan kemampuan bukanlah sesuatu yang statis, melainkan otot yang akan semakin kuat jika terus dilatih. Mari tingkatkan fokus, jangan pernah ragu atau malu untuk bertanya jika ada yang 'belum' dipahami, dan yakini bahwa setiap usaha ekstra hari ini akan membentukmu menjadi pribadi yang lebih tangguh.";
  }
  // Peringkat 21 - 32 atau seterusnya
  return 'Bapak sangat menghargai setiap usaha dan kehadiranmu sepanjang semester ini. Setiap orang memiliki ritme dan jalan berjalannya masing-masing. Jika saat ini ada materi yang terasa sulit, itu hanya berarti kamu "belum" menguasainya, bukan tidak bisa. Mari jadikan semester depan sebagai lembaran baru untuk mencoba strategi belajar yang berbeda, lebih berani bertanya, dan pantang menyerah. Potensimu masih sangat besar untuk digali!';
};

export const getRankBadgeInfo = (rank: number): { label: string; bg: string; text: string; border: string } => {
  if (rank === 1) {
    return { label: 'Peringkat 1 (Juara 1)', bg: 'bg-amber-100', text: 'text-amber-950', border: 'border-amber-300' };
  }
  if (rank >= 2 && rank <= 3) {
    return { label: `Peringkat ${rank} (Top 3)`, bg: 'bg-sky-100', text: 'text-sky-950', border: 'border-sky-300' };
  }
  if (rank >= 4 && rank <= 10) {
    return { label: `Peringkat ${rank} (Top 10)`, bg: 'bg-emerald-100', text: 'text-emerald-950', border: 'border-emerald-300' };
  }
  if (rank >= 11 && rank <= 20) {
    return { label: `Peringkat ${rank} (11-20)`, bg: 'bg-indigo-100', text: 'text-indigo-950', border: 'border-indigo-300' };
  }
  return { label: `Peringkat ${rank} (21-32)`, bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' };
};

export const CatatanWaliTab: React.FC<Props> = ({
  students,
  subjects,
  activeClass,
  activeYear = '2026/2027',
  activeSemester = 'Ganjil',
  showToast,
  onOpenZoom,
}) => {
  const [reportNotes, setReportNotes] = useState<Record<string, StudentReportNotes>>(getStoredReportNotes());

  const filteredStudents = useMemo(() => {
    return students.filter((s) => s.kelas === activeClass);
  }, [students, activeClass]);

  // Hitung peringkat akademik siswa di kelas berdasarkan skor NA Rapor
  const studentRankMap = useMemo(() => {
    const list = filteredStudents.map((s, sIdx) => {
      let total = 0;
      let count = 0;
      if (subjects && subjects.length > 0) {
        subjects.forEach((sub) => {
          const key = `${activeYear}_${activeSemester}_${activeClass}_${sub.id}`;
          const assessmentData = getStoredAssessments(key);
          const asCount = getAssessmentCount(key);
          const grade = assessmentData[s.id];
          if (grade) {
            let sumAs = 0;
            const kktp = sub.kktp || 75;
            for (let i = 1; i <= asCount; i++) {
              const pure = grade.sumatif?.[i] ?? 0;
              const rem = grade.remedial?.[i] ?? 0;
              const effective = rem > 0 ? Math.max(pure, Math.min(rem, kktp)) : pure;
              sumAs += effective;
            }
            const avgAs = asCount > 0 ? sumAs / asCount : 0;
            const asts = grade.asts || 0;
            const asas = grade.asas || 0;
            if (avgAs > 0 || asts > 0 || asas > 0) {
              const naRapor = Math.round((2 * avgAs + asts + asas) / 4);
              total += naRapor;
              count++;
            }
          }
        });
      }
      // Baseline jika belum ada penilaian tersimpan agar urutan ranking tetap konsisten
      if (count === 0) {
        const seed = ((s.nama.charCodeAt(0) + sIdx * 7) % 20) + 78;
        total = seed * 8;
      }
      return { student: s, total };
    });

    list.sort((a, b) => b.total - a.total);

    const rankMap: Record<string, { rank: number; total: number }> = {};
    list.forEach((item, idx) => {
      rankMap[item.student.id] = { rank: idx + 1, total: item.total };
    });
    return rankMap;
  }, [filteredStudents, subjects, activeYear, activeSemester, activeClass]);

  const handleNoteChange = (studentId: string, field: 'catatanWali' | 'keputusanKenaikan', value: string) => {
    setReportNotes((prev) => {
      const current = prev[studentId] || {
        studentId,
        catatanWali: '',
        keputusanKenaikan: '',
        ekskul: [],
        p5: [],
      };
      return {
        ...prev,
        [studentId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const handleSave = () => {
    saveStoredReportNotes(reportNotes);
    pushAllDataToCloud({ reportNotes });
    showToast('Catatan Wali Kelas & Keputusan Kenaikan berhasil disimpan!', 'success');
  };

  const DAFTAR_PILIHAN_KEPUTUSAN = [
    'Naik ke Kelas I (Satu)',
    'Naik ke Kelas II (Dua)',
    'Naik ke Kelas III (Tiga)',
    'Naik ke Kelas IV (Empat)',
    'Naik ke Kelas V (Lima)',
    'Naik ke Kelas VI (Enam)',
    'Lulus ke Jenjang SMP',
    'Tinggal di Kelas 1 (Satu)',
    'Tinggal di Kelas 2 (Dua)',
    'Tinggal di Kelas 3 (Tiga)',
    'Tinggal di Kelas 4 (Empat)',
    'Tinggal di Kelas 5 (Lima)',
    'Tinggal di Kelas 6 (Enam)',
    'Tinggal di Kelas',
  ] as const;

  const getDefaultDecision = (kelas: string) => {
    if (kelas.startsWith('Kelas 6') || kelas.includes('6')) return 'Lulus ke Jenjang SMP';
    if (kelas.includes('1') || kelas.toUpperCase().includes(' I')) return 'Naik ke Kelas II (Dua)';
    if (kelas.includes('2') || kelas.toUpperCase().includes(' II')) return 'Naik ke Kelas III (Tiga)';
    if (kelas.includes('3') || kelas.toUpperCase().includes(' III')) return 'Naik ke Kelas IV (Empat)';
    if (kelas.includes('4') || kelas.toUpperCase().includes(' IV')) return 'Naik ke Kelas V (Lima)';
    if (kelas.includes('5') || kelas.toUpperCase().includes(' V')) return 'Naik ke Kelas VI (Enam)';
    return 'Lulus ke Jenjang SMP';
  };

  // Generate Catatan Otomatis untuk Seluruh Siswa Sesuai Peringkat
  const handleAutoGenerateAllNotesByRank = () => {
    const updated = { ...reportNotes };
    let count = 0;
    filteredStudents.forEach((s) => {
      const rankInfo = studentRankMap[s.id] || { rank: 1, total: 0 };
      const noteText = getCatatanWaliOtomatisByRank(rankInfo.rank);
      const prev = updated[s.id] || {
        studentId: s.id,
        catatanWali: '',
        keputusanKenaikan: getDefaultDecision(s.kelas),
        ekskul: [],
        p5: [],
      };
      updated[s.id] = {
        ...prev,
        catatanWali: noteText,
      };
      count++;
    });
    setReportNotes(updated);
    saveStoredReportNotes(updated);
    pushAllDataToCloud({ reportNotes: updated });
    showToast(`Berhasil! Catatan wali kelas untuk seluruh ${count} siswa berhasil di-generate otomatis sesuai peringkat (Peringkat 1 s.d. 32).`, 'success');
  };

  // Terapkan Template Peringkat untuk 1 Siswa Tertentu
  const handleApplySingleStudentTemplate = (studentId: string, rank: number, studentName: string) => {
    const noteText = getCatatanWaliOtomatisByRank(rank);
    handleNoteChange(studentId, 'catatanWali', noteText);
    showToast(`Catatan otomatis sesuai Peringkat #${rank} berhasil diterapkan untuk ${studentName}!`, 'success');
  };

  const handleAutoPromoteAll = () => {
    const updated = { ...reportNotes };
    let count = 0;
    filteredStudents.forEach((s) => {
      const decision = getDefaultDecision(s.kelas);
      const prevNote = updated[s.id] || {
        studentId: s.id,
        catatanWali: '',
        keputusanKenaikan: decision,
        ekskul: [],
        p5: [],
      };
      updated[s.id] = {
        ...prevNote,
        keputusanKenaikan: decision,
      };
      count++;
    });
    setReportNotes(updated);
    saveStoredReportNotes(updated);
    pushAllDataToCloud({ reportNotes: updated });
    showToast(`Berhasil! Seluruh ${count} siswa otomatis diset naik kelas / lulus sesuai jenjang kelas masing-masing.`, 'success');
  };

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
              Menu 4. Penilaian &amp; Pelaporan • Evaluasi Perkembangan
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" /> Catatan Wali Kelas &amp; Keputusan Kenaikan / Kelulusan
            </h2>
            <p className="text-xs text-slate-500">
              Catatan disusun otomatis berdasarkan peringkat capaian akademik siswa (Peringkat 1, 2-3, 4-10, 11-20, 21-32). Tetap dapat diedit secara leluasa dan langsung tercetak pada <strong>e-Rapor Merdeka</strong> ({activeClass}).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAutoGenerateAllNotesByRank}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs shadow-md shadow-indigo-500/20 flex items-center gap-1.5 transition cursor-pointer"
              title="Otomatis isi catatan seluruh siswa di kelas ini sesuai peringkat akademiknya"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>⚡ Generate Catatan Sesuai Peringkat (Semua)</span>
            </button>

            <button
              type="button"
              onClick={handleAutoPromoteAll}
              className="bg-amber-500 hover:bg-amber-600 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition cursor-pointer"
              title="Otomatis tentukan keputusan naik kelas ke jenjang berikutnya untuk seluruh siswa di kelas ini"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Otomatis Naikkan Semua</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-5 py-2.5 rounded-2xl text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Seluruh Catatan</span>
            </button>
          </div>
        </div>

        {/* Info Banner Kategori Catatan Wali Kelas */}
        <div className="bg-gradient-to-r from-amber-50/70 via-sky-50/60 to-indigo-50/60 p-4 rounded-2xl border border-amber-200/80 text-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-800 font-extrabold">
            <Trophy className="w-4 h-4 text-amber-600" />
            <span>Kategori Catatan Otomatis Berdasarkan Peringkat Kelas:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-white border border-amber-300 shadow-2xs">
              <span className="font-black text-amber-950 block">1. Peringkat 1</span>
              <span className="text-slate-600 text-[10px] leading-snug block mt-0.5">Apresiasi pencapaian luar biasa &amp; pelampauan batas diri.</span>
            </div>
            <div className="p-2 rounded-xl bg-white border border-sky-300 shadow-2xs">
              <span className="font-black text-sky-950 block">2. Peringkat 2 - 3</span>
              <span className="text-slate-600 text-[10px] leading-snug block mt-0.5">Pencapaian membanggakan &amp; konsistensi berproses.</span>
            </div>
            <div className="p-2 rounded-xl bg-white border border-emerald-300 shadow-2xs">
              <span className="font-black text-emerald-950 block">3. Peringkat 4 - 10</span>
              <span className="text-slate-600 text-[10px] leading-snug block mt-0.5">Kegigihan menghadapi tantangan materi &amp; batu pijakan.</span>
            </div>
            <div className="p-2 rounded-xl bg-white border border-indigo-300 shadow-2xs">
              <span className="font-black text-indigo-950 block">4. Peringkat 11 - 20</span>
              <span className="text-slate-600 text-[10px] leading-snug block mt-0.5">Apresiasi progres, melatih kecerdasan &amp; ketangguhan.</span>
            </div>
            <div className="p-2 rounded-xl bg-white border border-slate-300 shadow-2xs">
              <span className="font-black text-slate-900 block">5. Peringkat 21 - 32</span>
              <span className="text-slate-600 text-[10px] leading-snug block mt-0.5">Motivasi bertumbuh, ritme belajar &amp; pantang menyerah.</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {filteredStudents.map((s, idx) => {
            const defaultDecision = getDefaultDecision(activeClass);
            const savedData = reportNotes[s.id];
            const rankInfo = studentRankMap[s.id] || { rank: idx + 1, total: 0 };
            const rank = rankInfo.rank;
            const badge = getRankBadgeInfo(rank);

            // Default catatan wali: jika belum pernah diedit, gunakan catatan otomatis sesuai peringkat
            const currentNote = savedData?.catatanWali !== undefined && savedData?.catatanWali !== ''
              ? savedData.catatanWali
              : getCatatanWaliOtomatisByRank(rank);

            const data = {
              studentId: s.id,
              catatanWali: currentNote,
              keputusanKenaikan: savedData?.keputusanKenaikan || defaultDecision,
              ekskul: savedData?.ekskul ?? [],
              p5: savedData?.p5 ?? [],
            };

            return (
              <div key={s.id} className="p-4 sm:p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <img
                      src={s.fotoUrl}
                      alt={s.nama}
                      onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                      className="w-10 h-10 rounded-xl object-cover border border-slate-300 cursor-zoom-in"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-display font-black text-sm text-slate-800">{s.nama}</h4>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
                          {badge.label}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">NISN: {s.nisn} • {s.barcodeId}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplySingleStudentTemplate(s.id, rank, s.nama)}
                      className="px-2.5 py-1 rounded-xl bg-white hover:bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition shadow-2xs"
                      title={`Terapkan template resmi untuk Peringkat #${rank}`}
                    >
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      <span>Reset ke Template Peringkat #{rank}</span>
                    </button>
                    <span className="text-[11px] font-extrabold bg-white px-2.5 py-1 rounded-lg border text-slate-600">
                      No. Urut: {idx + 1}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-8">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-extrabold text-slate-700">
                        Catatan Perkembangan Karakter &amp; Akademik Wali Kelas:
                      </label>
                      <span className="text-[10px] font-bold text-slate-500">
                        Dapat disunting bebas
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      value={data.catatanWali}
                      onChange={(e) => handleNoteChange(s.id, 'catatanWali', e.target.value)}
                      placeholder="Tuliskan catatan perkembangan karakter, budi pekerti, dan motivasi belajar peserta didik..."
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-emerald-500 leading-relaxed"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-extrabold text-slate-700">
                        Keputusan Kenaikan / Kelulusan:
                      </label>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200">
                        Dropdown Menu
                      </span>
                    </div>
                    <select
                      value={data.keputusanKenaikan.includes('VII') ? 'Lulus ke Jenjang SMP' : data.keputusanKenaikan}
                      onChange={(e) => handleNoteChange(s.id, 'keputusanKenaikan', e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-emerald-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer shadow-2xs"
                    >
                      <option value="Naik ke Kelas I (Satu)">Naik ke Kelas I (Satu)</option>
                      <option value="Naik ke Kelas II (Dua)">Naik ke Kelas II (Dua)</option>
                      <option value="Naik ke Kelas III (Tiga)">Naik ke Kelas III (Tiga)</option>
                      <option value="Naik ke Kelas IV (Empat)">Naik ke Kelas IV (Empat)</option>
                      <option value="Naik ke Kelas V (Lima)">Naik ke Kelas V (Lima)</option>
                      <option value="Naik ke Kelas VI (Enam)">Naik ke Kelas VI (Enam)</option>
                      <option value="Lulus ke Jenjang SMP">Lulus ke Jenjang SMP</option>
                      <option value="Tinggal di Kelas">Tinggal di Kelas</option>
                      {data.keputusanKenaikan &&
                        !data.keputusanKenaikan.includes('VII') &&
                        !DAFTAR_PILIHAN_KEPUTUSAN.includes(data.keputusanKenaikan as any) && (
                          <option value={data.keputusanKenaikan}>{data.keputusanKenaikan}</option>
                        )}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Pilihan ini otomatis tercetak pada lembar e-Rapor resmi peserta didik.
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

