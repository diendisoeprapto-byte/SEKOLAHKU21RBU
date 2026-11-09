import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  CheckCircle2,
  TrendingUp,
  HelpCircle,
  Filter,
  Download,
  Printer,
  PieChart as PieIcon,
  Award,
  AlertTriangle,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { CBTExam, CBTQuestion } from '../../types';
import { DEFAULT_CBT_EXAM, MAPEL_LIST } from '../../data/defaultData';

export const PAKET_SOAL_LIST = [
  'Sumatif 1 (AS 1)',
  'Sumatif 2 (AS 2)',
  'Sumatif 3 (AS 3)',
  'Sumatif 4 (AS 4)',
  'Sumatif 5 (AS 5)',
  'Sumatif 6 (AS 6)',
  'Asesmen Sumatif Tengah Semester (ASTS)',
  'Asesmen Sumatif Akhir Semester (ASAS)',
  'Sumatif Lingkup Materi CBT',
] as const;

export const AnalisisSoalTab: React.FC = () => {
  const [selectedMapel, setSelectedMapel] = useState<string>('Ilmu Pengetahuan Alam dan Sosial (IPAS)');
  const [selectedPaket, setSelectedPaket] = useState<string>('Asesmen Sumatif Akhir Semester (ASAS)');
  const [selectedClass, setSelectedClass] = useState<string>('Kelas 6A');
  const [activeChartTab, setActiveChartTab] = useState<'kesukaran' | 'pembeda' | 'ketuntasan'>('kesukaran');

  // Generate dynamic questions tailored to the selected subject and packet
  const questionsData = useMemo(() => {
    const isIpas = selectedMapel.includes('IPAS');
    const isMat = selectedMapel.includes('Matematika');
    const isIndo = selectedMapel.includes('Indonesia');
    const isInggris = selectedMapel.includes('Inggris');

    const seed = (selectedMapel.length + selectedPaket.length) % 7;

    return [
      {
        no: 1,
        pertanyaan: isIpas
          ? 'Organ tubuh manusia yang berfungsi memompa darah ke seluruh tubuh adalah...'
          : isMat
          ? 'Hasil operasi hitung campuran dari 125 + 45 x 12 - 250 adalah...'
          : isIndo
          ? 'Ide pokok atau gagasan utama pada paragraf deduktif terletak pada...'
          : isInggris
          ? 'What is the main function of the digestive system in humans?'
          : `Soal butir 1 evaluasi capaian materi ${selectedMapel}...`,
        tipe: 'Pilihan Ganda (PG)',
        bobot: 15,
        tkValue: 0.78, // Tingkat Kesukaran (TK)
        tkLabel: 'Mudah',
        dpValue: 0.42, // Daya Pembeda (DP)
        dpLabel: 'Sangat Baik',
        ketuntasanPct: 92,
        pengecoh: 'Efektif',
        status: 'Diterima Tanpa Revisi',
      },
      {
        no: 2,
        pertanyaan: isIpas
          ? 'Manakah dari sumber energi berikut yang termasuk energi terbarukan ramah lingkungan?'
          : isMat
          ? 'Sebuah bak penampungan air berbentuk kubus memiliki panjang rusuk 80 cm. Volume air maksimal adalah...'
          : isIndo
          ? 'Watak tokoh kancil yang cerdik mencari jalan keluar saat terjebak dalam sumur mencerminkan nilai...'
          : isInggris
          ? 'Which of the following activities is best done during the morning?'
          : `Soal butir 2 pemahaman konseptual ${selectedMapel}...`,
        tipe: 'PG Kompleks',
        bobot: 20,
        tkValue: 0.54,
        tkLabel: 'Sedang',
        dpValue: 0.38,
        dpLabel: 'Baik',
        ketuntasanPct: 82,
        pengecoh: 'Efektif',
        status: 'Diterima Tanpa Revisi',
      },
      {
        no: 3,
        pertanyaan: isIpas
          ? 'Rotasi bumi mengakibatkan terjadinya peristiwa siang dan malam serta perbedaan zona waktu.'
          : isMat
          ? 'KPK dan FPB dari bilangan 24, 36, dan 48 berturut-turut adalah...'
          : isIndo
          ? 'Antonim dari kata "eksklusif" dan "statis" dalam teks artikel ilmiah di atas adalah...'
          : isInggris
          ? 'Fill in the blanks: My sister ... to the school library every Tuesday.'
          : `Soal butir 3 aplikasi penerapan prinsip ${selectedMapel}...`,
        tipe: 'Benar / Salah',
        bobot: 15,
        tkValue: 0.65,
        tkLabel: 'Sedang',
        dpValue: 0.45,
        dpLabel: 'Sangat Baik',
        ketuntasanPct: 88,
        pengecoh: 'Efektif',
        status: 'Diterima Tanpa Revisi',
      },
      {
        no: 4,
        pertanyaan: isIpas
          ? 'Jodohkan hewan berikut dengan cara perkembangbiakannya: Kucing, Ayam, Platypus.'
          : isMat
          ? 'Diagram lingkaran menunjukkan hobi 40 siswa. Jika bulutangkis 25%, banyak siswa penyuka bulutangkis adalah...'
          : isIndo
          ? 'Pasangkan kalimat berikut dengan jenis majas yang digunakan secara tepat.'
          : isInggris
          ? 'Match the animals with their habitats correctly: Camel, Penguin, Dolphin.'
          : `Soal butir 4 analisis komparasi indikator ${selectedMapel}...`,
        tipe: 'Menjodohkan',
        bobot: 15,
        tkValue: 0.48,
        tkLabel: 'Sedang',
        dpValue: 0.34,
        dpLabel: 'Baik',
        ketuntasanPct: 76,
        pengecoh: 'Cukup Efektif',
        status: 'Diterima Tanpa Revisi',
      },
      {
        no: 5,
        pertanyaan: isIpas
          ? 'Proses fotosintesis pada tumbuhan hijau menghasilkan zat glukosa dan...'
          : isMat
          ? 'Sebuah toko memberikan diskon 20% untuk tas seharga Rp150.000,00. Berapa harga setelah diskon?'
          : isIndo
          ? 'Tuliskan simpulan isi paragraf argumentatif mengenai pelestarian lingkungan kali bersih!'
          : isInggris
          ? 'What is the synonym of the word "tremendous" in paragraph two?'
          : `Soal butir 5 isian singkat kompetensi ${selectedMapel}...`,
        tipe: 'Isian Singkat',
        bobot: 15,
        tkValue: 0.28,
        tkLabel: 'Sukar',
        dpValue: 0.32,
        dpLabel: 'Baik',
        ketuntasanPct: 68,
        pengecoh: 'Perlu Revisi Pengecoh',
        status: 'Diterima dengan Revisi',
      },
      {
        no: 6,
        pertanyaan: isIpas
          ? 'Jelaskan mengapa rangkaian listrik di rumah tangga dipasang secara paralel dan bukan seri!'
          : isMat
          ? 'Hitunglah rata-rata (mean) dan median dari data nilai sumatif: 70, 80, 85, 90, 75, 80, 95!'
          : isIndo
          ? 'Susunlah sebuah teks pidato persuasif singkat bertema "Gerakan 7 Kebiasaan Anak Indonesia Hebat"!'
          : isInggris
          ? 'Write three sentences describing your daily morning routine before going to school.'
          : `Soal butir 6 penalaran tingkat tinggi (HOTS) ${selectedMapel}...`,
        tipe: 'Uraian / Penalaran',
        bobot: 20,
        tkValue: 0.24,
        tkLabel: 'Sukar',
        dpValue: 0.40,
        dpLabel: 'Sangat Baik',
        ketuntasanPct: 64,
        pengecoh: 'Efektif',
        status: 'Diterima Tanpa Revisi',
      },
    ];
  }, [selectedMapel, selectedPaket]);

  // Aggregate stats
  const totalQuestions = questionsData.length;
  const mudahCount = questionsData.filter((q) => q.tkLabel === 'Mudah').length;
  const sedangCount = questionsData.filter((q) => q.tkLabel === 'Sedang').length;
  const sukarCount = questionsData.filter((q) => q.tkLabel === 'Sukar').length;

  const sangatBaikCount = questionsData.filter((q) => q.dpLabel === 'Sangat Baik').length;
  const baikCount = questionsData.filter((q) => q.dpLabel === 'Baik').length;
  const revisiCount = questionsData.filter((q) => q.status.includes('Revisi')).length;

  const avgKetuntasan = Math.round(
    questionsData.reduce((acc, curr) => acc + curr.ketuntasanPct, 0) / totalQuestions
  );

  const handleExportExcel = () => {
    const wsData = [
      ['ANALISIS BUTIR SOAL & TINGKAT KESUKARAN CBT'],
      ['SDN RAWA BADAK UTARA 21 - JAKARTA UTARA'],
      [`Mata Pelajaran: ${selectedMapel}`],
      [`Paket / Jenis Soal: ${selectedPaket}`],
      [`Target Kelas: ${selectedClass}`],
      [],
      ['No', 'Pertanyaan Soal', 'Tipe Soal', 'Bobot Poin', 'Tingkat Kesukaran (TK)', 'Kategori TK', 'Daya Pembeda (DP)', 'Kategori DP', 'Ketuntasan Siswa (%)', 'Efektivitas Pengecoh', 'Status Butir'],
      ...questionsData.map((q) => [
        q.no,
        q.pertanyaan,
        q.tipe,
        q.bobot,
        q.tkValue,
        q.tkLabel,
        q.dpValue,
        q.dpLabel,
        `${q.ketuntasanPct}%`,
        q.pengecoh,
        q.status,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analisis Butir Soal');
    XLSX.writeFile(wb, `Analisis_Soal_${selectedMapel.substring(0, 10)}_${selectedClass}.xlsx`);
  };

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-6">
        {/* Header Title */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
              Menu 4. Penilaian & Pelaporan • Evaluasi Butir Soal
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600" /> Analisis Butir Soal CBT & Grafik Ketuntasan
            </h2>
            <p className="text-xs text-slate-500">
              Evaluasi daya pembeda, tingkat kesukaran soal, efektivitas pengecoh, dan grafik distribusi statistik butir asesmen.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-display font-black px-4 py-2 rounded-xl text-xs border border-emerald-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" /> Ekspor Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Printer className="w-4 h-4" /> Cetak Laporan
            </button>
          </div>
        </div>

        {/* Filter Bar: Dropdown Mapel & Dropdown Jenis Soal */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center">
          <div className="md:col-span-5">
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Pilih Mata Pelajaran:
            </label>
            <select
              value={selectedMapel}
              onChange={(e) => setSelectedMapel(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-emerald-500 bg-white text-xs font-black text-slate-800 outline-none shadow-2xs cursor-pointer focus:ring-2 focus:ring-emerald-200"
            >
              {MAPEL_LIST.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Pilih Paket / Jenis Soal:
            </label>
            <select
              value={selectedPaket}
              onChange={(e) => setSelectedPaket(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none shadow-2xs cursor-pointer focus:border-emerald-500"
            >
              {PAKET_SOAL_LIST.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Target Kelas:
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none shadow-2xs cursor-pointer focus:border-emerald-500"
            >
              <option value="Kelas 6A">Kelas 6A</option>
              <option value="Kelas 6B">Kelas 6B</option>
              <option value="Kelas 5">Kelas 5</option>
              <option value="Kelas 4">Kelas 4</option>
            </select>
          </div>
        </div>

        {/* Quick KPI Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[11px] font-extrabold uppercase text-emerald-800">Total Butir Soal</span>
            <div className="text-2xl font-display font-black text-emerald-950 mt-1">{totalQuestions} Butir</div>
            <span className="text-[10px] text-emerald-700">100% Teranalisis Sistem</span>
          </div>

          <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200">
            <span className="text-[11px] font-extrabold uppercase text-sky-800">Rata-rata Ketuntasan</span>
            <div className="text-2xl font-display font-black text-sky-950 mt-1">{avgKetuntasan}%</div>
            <span className="text-[10px] text-sky-700">Di atas KKTP Standar (75%)</span>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
            <span className="text-[11px] font-extrabold uppercase text-amber-800">Tingkat Kesukaran (TK)</span>
            <div className="text-sm font-bold text-slate-800 mt-1.5 flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-xs">{mudahCount} M</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-black text-xs">{sedangCount} S</span>
              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-black text-xs">{sukarCount} Sk</span>
            </div>
            <span className="text-[10px] text-amber-700">Proporsi ideal Kurikulum Merdeka</span>
          </div>

          <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200">
            <span className="text-[11px] font-extrabold uppercase text-purple-800">Daya Pembeda (DP)</span>
            <div className="text-2xl font-display font-black text-purple-950 mt-1">
              {sangatBaikCount + baikCount}/{totalQuestions}
            </div>
            <span className="text-[10px] text-purple-700">Butir Soal Valid & Baik</span>
          </div>
        </div>

        {/* GRAFIK DATA ANALISIS SOAL */}
        <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h3 className="font-display font-black text-sm text-slate-900">
                Visualisasi Grafik Analisis Soal ({selectedMapel})
              </h3>
            </div>

            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveChartTab('kesukaran')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  activeChartTab === 'kesukaran'
                    ? 'bg-emerald-600 text-white font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tingkat Kesukaran
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('ketuntasan')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  activeChartTab === 'ketuntasan'
                    ? 'bg-emerald-600 text-white font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ketuntasan Siswa
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('pembeda')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  activeChartTab === 'pembeda'
                    ? 'bg-emerald-600 text-white font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daya Pembeda
              </button>
            </div>
          </div>

          {/* Chart Content 1: Tingkat Kesukaran */}
          {activeChartTab === 'kesukaran' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
              {/* Donut representation */}
              <div className="md:col-span-5 flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-200">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    {/* Ring background */}
                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#E2E8F0" strokeWidth="3.5" />
                    {/* Segment 1: Mudah (green) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="transparent"
                      stroke="#10B981"
                      strokeWidth="3.8"
                      strokeDasharray={`${Math.round((mudahCount / totalQuestions) * 100)} 100`}
                      strokeDashoffset="0"
                    />
                    {/* Segment 2: Sedang (amber) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="transparent"
                      stroke="#F59E0B"
                      strokeWidth="3.8"
                      strokeDasharray={`${Math.round((sedangCount / totalQuestions) * 100)} 100`}
                      strokeDashoffset={`-${Math.round((mudahCount / totalQuestions) * 100)}`}
                    />
                    {/* Segment 3: Sukar (rose) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="transparent"
                      stroke="#F43F5E"
                      strokeWidth="3.8"
                      strokeDasharray={`${Math.round((sukarCount / totalQuestions) * 100)} 100`}
                      strokeDashoffset={`-${Math.round(((mudahCount + sedangCount) / totalQuestions) * 100)}`}
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-xl font-display font-black text-slate-800">{totalQuestions}</span>
                    <span className="block text-[10px] font-bold text-slate-400">Butir Soal</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 mt-3 text-xs font-bold">
                  <span className="flex items-center gap-1 text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Mudah ({mudahCount})
                  </span>
                  <span className="flex items-center gap-1 text-amber-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Sedang ({sedangCount})
                  </span>
                  <span className="flex items-center gap-1 text-rose-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Sukar ({sukarCount})
                  </span>
                </div>
              </div>

              {/* Progress bars & guidelines */}
              <div className="md:col-span-7 space-y-3 bg-white p-4 rounded-2xl border border-slate-200">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Distribusi Proporsi Tingkat Kesukaran (TK):
                </h4>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Soal Mudah (TK &gt; 0.70)
                    </span>
                    <span className="font-mono text-emerald-700 font-extrabold">
                      {mudahCount} Soal ({Math.round((mudahCount / totalQuestions) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${(mudahCount / totalQuestions) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> Soal Sedang (0.30 ≤ TK ≤ 0.70)
                    </span>
                    <span className="font-mono text-amber-700 font-extrabold">
                      {sedangCount} Soal ({Math.round((sedangCount / totalQuestions) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-amber-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${(sedangCount / totalQuestions) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span> Soal Sukar (TK &lt; 0.30)
                    </span>
                    <span className="font-mono text-rose-700 font-extrabold">
                      {sukarCount} Soal ({Math.round((sukarCount / totalQuestions) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-rose-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${(sukarCount / totalQuestions) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 pt-1 leading-relaxed">
                  💡 <strong>Catatan Kurikulum Merdeka:</strong> Sebaran tingkat kesukaran soal telah memenuhi kurva normal asesmen sekolah dasar (komposisi seimbang antara butir soal mudah, sedang, dan penalaran bertingkat/sukar).
                </p>
              </div>
            </div>
          )}

          {/* Chart Content 2: Ketuntasan Siswa Per Nomor Soal (Bar chart) */}
          {activeChartTab === 'ketuntasan' && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Grafik Batang Ketuntasan Siswa Per Nomor Soal ({selectedPaket}):
                </h4>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="flex items-center gap-1 text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> ≥ 75% Tuntas
                  </span>
                  <span className="flex items-center gap-1 text-rose-700">
                    <span className="w-2.5 h-2.5 rounded bg-rose-500"></span> &lt; 75% Perlu Pengayaan
                  </span>
                  <span className="text-[11px] text-slate-400">--- Garis Batas KKTP (75%)</span>
                </div>
              </div>

              {/* Bar Chart Container */}
              <div className="space-y-3 pt-2">
                {questionsData.map((q) => {
                  const isPass = q.ketuntasanPct >= 75;
                  return (
                    <div key={q.no} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          Soal No. {q.no} ({q.tipe})
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 font-mono">TK: {q.tkValue}</span>
                          <span
                            className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                              isPass ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {q.ketuntasanPct}% Tuntas
                          </span>
                        </div>
                      </div>
                      <div className="relative w-full bg-slate-100 rounded-full h-4 overflow-hidden">
                        {/* 75% benchmark marker */}
                        <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-slate-400 z-10" title="Batas KKTP 75%"></div>
                        <div
                          className={`h-4 rounded-full transition-all duration-500 ${
                            isPass ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${q.ketuntasanPct}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chart Content 3: Daya Pembeda */}
          {activeChartTab === 'pembeda' && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-900 uppercase">Sangat Baik (DP ≥ 0.40)</span>
                  <span className="text-xl font-display font-black text-emerald-700">{sangatBaikCount} Soal</span>
                </div>
                <div className="w-full bg-emerald-200/60 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-2.5 rounded-full"
                    style={{ width: `${(sangatBaikCount / totalQuestions) * 100}%` }}
                  ></div>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Soal mampu membedakan kelompok siswa pandai dan kelompok siswa yang belum tuntas secara tajam dan valid.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-blue-900 uppercase">Baik (0.30 ≤ DP &lt; 0.40)</span>
                  <span className="text-xl font-display font-black text-blue-700">{baikCount} Soal</span>
                </div>
                <div className="w-full bg-blue-200/60 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${(baikCount / totalQuestions) * 100}%` }}
                  ></div>
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Butir soal memiliki daya pembeda yang memuaskan dan dapat langsung disimpan ke Bank Soal Sekolah.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-900 uppercase">Perlu Revisi (DP &lt; 0.30)</span>
                  <span className="text-xl font-display font-black text-amber-700">{revisiCount} Soal</span>
                </div>
                <div className="w-full bg-amber-200/60 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-amber-600 h-2.5 rounded-full"
                    style={{ width: `${(revisiCount / totalQuestions) * 100}%` }}
                  ></div>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Dianjurkan merevisi opsi pengecoh atau merapikan redaksi kalimat soal agar tidak membingungkan peserta didik.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Detailed Table of Questions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-black text-sm text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              Tabel Rincian Analisis Butir Soal ({selectedPaket} • {selectedMapel})
            </h3>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
              Total: {totalQuestions} Butir Soal
            </span>
          </div>

          <div className="overflow-x-auto border-2 border-slate-200 rounded-3xl shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
                  <th className="p-3 w-10 text-center">No</th>
                  <th className="p-3 min-w-[220px]">Pertanyaan Butir Soal</th>
                  <th className="p-3 text-center">Tipe</th>
                  <th className="p-3 text-center">Bobot</th>
                  <th className="p-3 text-center">Tingkat Kesukaran (TK)</th>
                  <th className="p-3 text-center">Daya Pembeda (DP)</th>
                  <th className="p-3 text-center">Ketuntasan</th>
                  <th className="p-3 text-center">Pengecoh</th>
                  <th className="p-3 text-center">Status / Rekomendasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questionsData.map((q) => (
                  <tr key={q.no} className="hover:bg-slate-50 transition">
                    <td className="p-3 text-center font-bold text-slate-500">{q.no}</td>
                    <td className="p-3 font-medium text-slate-800 max-w-xs truncate" title={q.pertanyaan}>
                      {q.pertanyaan}
                    </td>
                    <td className="p-3 text-center font-semibold text-slate-600">{q.tipe}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-700">{q.bobot}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          q.tkLabel === 'Mudah'
                            ? 'bg-emerald-100 text-emerald-800'
                            : q.tkLabel === 'Sedang'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {q.tkLabel} ({q.tkValue})
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="font-mono font-bold text-slate-700">{q.dpValue}</span>
                    </td>
                    <td className="p-3 text-center font-mono font-black text-emerald-700">
                      {q.ketuntasanPct}%
                    </td>
                    <td className="p-3 text-center text-[11px] text-slate-600">
                      {q.pengecoh}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                          q.status.includes('Revisi')
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {q.status}
                      </span>
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
