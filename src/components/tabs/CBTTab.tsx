import React, { useState, useEffect } from 'react';
import {
  Laptop,
  CheckCircle,
  Clock,
  Maximize2,
  FileText,
  AlertTriangle,
  Play,
  RotateCcw,
  Plus,
  Compass,
  Filter,
  HelpCircle,
  Trash2,
  Image as ImageIcon,
  RefreshCw,
  Sparkles,
  Layers,
  X,
  Target,
} from 'lucide-react';
import { CBTExam, CBTQuestion, Student, ActiveUser } from '../../types';
import { getStoredCBTExams, saveStoredCBTExams, getStoredCBTResults, saveStoredCBTResults } from '../../utils/storage';
import { evaluateQuestionScore } from '../../utils/answerChecker';

interface Props {
  activeUser: ActiveUser;
  activeClass: string;
  students: Student[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const CBTTab: React.FC<Props> = ({
  activeUser,
  activeClass,
  students,
  showToast,
}) => {
  const [exams, setExams] = useState<CBTExam[]>(getStoredCBTExams());
  const [isExamRunning, setIsExamRunning] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState(3600); // 60 mins
  const [examResult, setExamResult] = useState<{ score: number; total: number } | null>(null);

  // Tab mode for teacher: "bank-soal" (default for teacher) or "ujian"
  const [subTab, setSubTab] = useState<'bank-soal' | 'ujian'>('bank-soal');

  // Exam packages (Paket / Jenis Ulangan)
  const [paketList, setPaketList] = useState<string[]>([
    'Ulangan Harian 1 (UH 1)',
    'Ulangan Harian 2 (UH 2)',
    'Ulangan Harian 3 (UH 3)',
    'Ulangan Harian 4 (UH 4)',
    'Ulangan Harian 5 (UH 5)',
    'Ulangan Harian 6 (UH 6)',
    'ASTS (Sumatif Tengah Semester)',
    'ASAS (Sumatif Akhir Semester)',
  ]);
  const [selectedPaket, setSelectedPaket] = useState<string>('Ulangan Harian 1 (UH 1)');
  const [isAddUHOpen, setIsAddUHOpen] = useState(false);
  const [newUHName, setNewUHName] = useState('');

  // Form Fields matching Image 1
  const [selectedMapel, setSelectedMapel] = useState<string>('Pendidikan Agama Islam');
  const [targetKelas, setTargetKelas] = useState<string>(activeClass || 'Kelas 6B');
  const [selectedTpId, setSelectedTpId] = useState<string>('TP 1');
  const [selectedTipeSoal, setSelectedTipeSoal] = useState<'pg' | 'pg_kompleks' | 'benar_salah' | 'menjodohkan' | 'isian' | 'uraian'>('pg');
  const [levelKesukaran, setLevelKesukaran] = useState<'Mudah' | 'Sedang' | 'Sukar'>('Sedang');
  const [levelKognitif, setLevelKognitif] = useState<'L1 (C1-C2)' | 'L2 (C3)' | 'L3 (C4-C6)'>('L2 (C3)');

  // CP & TP State
  const [cpList, setCpList] = useState([
    {
      id: 'cp_1',
      kode: 'CP 1',
      judul: 'CP 1: [Kelas 6B - Fase C • Semester 1 TP 2026/2027] Peserta didik memahami pesan pokok Al-Qur\'an dan Hadis',
      deskripsi: '[Kelas 6B - Fase C • Semester 1 TP 2026/2027] Peserta didik memahami pesan pokok Al-Qur\'an dan Hadis, menerapkan akhlak karimah, melaksanakan ibadah sesuai ketentuan fikih, serta meneladani sejarah peradaban Islam dalam kehidupan sehari-hari.',
      mapel: 'Pendidikan Agama Islam',
      tpList: [
        { id: 'TP 1', judul: '[Kelas 6B] Memahami pesan pokok surah pendek Al-Qur\'an serta hadis tentang keutamaan ilmu.' },
        { id: 'TP 2', judul: '[Kelas 6B] Menjelaskan hukum bacaan tajwid nun mati/tanwin dan mim mati.' },
        { id: 'TP 3', judul: '[Kelas 6B] Meneladani akhlak terpuji terhadap sesama dan lingkungan.' },
      ]
    },
    {
      id: 'cp_2',
      kode: 'CP 2',
      judul: 'CP 2: [Kelas 6B - Fase C • IPAS] Sistem Organ Tubuh Manusia & Siklus Hidup',
      deskripsi: '[Kelas 6B - Fase C • Semester 1 TP 2026/2027] Peserta didik menganalisis hubungan antar sistem organ tubuh manusia, proses peredaran darah, pernapasan, serta pencernaan makanan dan menjaga kesehatannya.',
      mapel: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
      tpList: [
        { id: 'TP 1', judul: '[Kelas 6B] Menganalisis fungsi jantung, pembuluh darah, dan paru-paru pada peredaran darah manusia.' },
        { id: 'TP 2', judul: '[Kelas 6B] Mengidentifikasi penyakit yang menyerang sistem organ dan cara pencegahannya.' },
      ]
    },
    {
      id: 'cp_3',
      kode: 'CP 3',
      judul: 'CP 3: [Kelas 6B - Fase C • Matematika] Bilangan Cacah, Pecahan & Operasi Hitung',
      deskripsi: '[Kelas 6B - Fase C • Semester 1 TP 2026/2027] Peserta didik dapat menyelesaikan masalah berkaitan dengan operasi hitung campuran bilangan bulat, pecahan, desimal, dan persentase.',
      mapel: 'Matematika',
      tpList: [
        { id: 'TP 1', judul: '[Kelas 6B] Menghitung operasi hitung campuran perkalian dan pembagian pecahan.' },
        { id: 'TP 2', judul: '[Kelas 6B] Memecahkan soal cerita matematika FPB dan KPK dalam kehidupan sehari-hari.' },
      ]
    }
  ]);

  const [selectedCpId, setSelectedCpId] = useState<string>(cpList[0].id);

  // Quick modals for adding CP & TP
  const [isAddCpOpen, setIsAddCpOpen] = useState(false);
  const [newCpTitle, setNewCpTitle] = useState('');
  const [newCpDesc, setNewCpDesc] = useState('');

  const [isAddTpOpen, setIsAddTpOpen] = useState(false);
  const [newTpIdInput, setNewTpIdInput] = useState('');
  const [newTpDescInput, setNewTpDescInput] = useState('');

  // Question Inputs
  const [pertanyaan, setPertanyaan] = useState('');
  const [gambarUrl, setGambarUrl] = useState<string | null>(null);
  const [gambarUrl2, setGambarUrl2] = useState<string | null>(null);
  const [bobotPoin, setBobotPoin] = useState(10);

  // Options for PG & images for options
  const [opsiA, setOpsiA] = useState('');
  const [opsiB, setOpsiB] = useState('');
  const [opsiC, setOpsiC] = useState('');
  const [opsiD, setOpsiD] = useState('');
  const [opsiGambar, setOpsiGambar] = useState<{ A?: string; B?: string; C?: string; D?: string }>({});
  const [kunciPG, setKunciPG] = useState<'A' | 'B' | 'C' | 'D'>('A');

  // Input for other types
  const [kunciLain, setKunciLain] = useState('');
  const [pgKompleksKeys, setPgKompleksKeys] = useState<string[]>([]);
  const [pembahasan, setPembahasan] = useState('');

  // Filter for created questions list underneath
  const [filterTipe, setFilterTipe] = useState<string>('all');

  const activeExam = exams[0] || {
    id: 'exam_default',
    judul: 'Bank Soal CBT Sekolah',
    mapel: 'Pendidikan Agama Islam',
    kelas: activeClass || 'Kelas 6B',
    durasiMenit: 60,
    aktif: true,
    soalList: [],
  };

  // Find currently selected CP & TP
  const currentCp = cpList.find((c) => c.id === selectedCpId) || cpList[0];
  const currentTp = currentCp?.tpList.find((t) => t.id === selectedTpId) || currentCp?.tpList[0];

  useEffect(() => {
    let timer: any;
    if (isExamRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleSubmitExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isExamRunning, timeLeft]);

  // Convert fractions helper: 1/3 -> satu pertiga
  const handleConvertFractions = () => {
    let text = pertanyaan;
    const fractionMap: Record<string, string> = {
      '1/2': 'satu perdua (setengah)',
      '1/3': 'satu pertiga',
      '2/3': 'dua pertiga',
      '1/4': 'satu perempat (seperempat)',
      '2/4': 'dua perempat',
      '3/4': 'tiga perempat',
      '1/5': 'satu perlima',
      '2/5': 'dua perlima',
      '3/5': 'tiga perlima',
      '4/5': 'empat perlima',
      '1/6': 'satu perenam',
      '5/6': 'lima perenam',
      '1/8': 'satu perdelapan',
      '3/8': 'tiga perdelapan',
      '5/8': 'lima perdelapan',
      '7/8': 'tujuh perdelapan',
      '1/10': 'satu persepuluh',
    };

    Object.entries(fractionMap).forEach(([frac, textRep]) => {
      text = text.replace(new RegExp(frac, 'g'), textRep);
    });

    setPertanyaan(text);
    showToast('Pecahan otomatis dikonversi ke kata PUEBI / EYD V!', 'success');
  };

  // Handle image upload 1
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGambarUrl(reader.result as string);
        showToast('Gambar 1 soal berhasil diunggah!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle image upload 2 (side-by-side)
  const handleImageUpload2 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGambarUrl2(reader.result as string);
        showToast('Gambar 2 soal berhasil diunggah!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle option image upload
  const handleOptionImageUpload = (key: 'A' | 'B' | 'C' | 'D', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setOpsiGambar((prev) => ({ ...prev, [key]: reader.result as string }));
        showToast(`Gambar untuk Opsi ${key} berhasil diunggah!`, 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveOptionImage = (key: 'A' | 'B' | 'C' | 'D') => {
    setOpsiGambar((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  // Save new question to Bank Soal
  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pertanyaan.trim()) {
      showToast('Harap masukkan butir pertanyaan soal!', 'error');
      return;
    }

    let parsedOpsi: string[] | undefined = undefined;
    let parsedKunci: any = '';

    if (selectedTipeSoal === 'pg') {
      if (!opsiA || !opsiB || !opsiC || !opsiD) {
        showToast('Harap lengkapi semua opsi pilihan A, B, C, dan D!', 'error');
        return;
      }
      parsedOpsi = [opsiA.trim(), opsiB.trim(), opsiC.trim(), opsiD.trim()];
      const keyMap: Record<string, string> = { A: opsiA.trim(), B: opsiB.trim(), C: opsiC.trim(), D: opsiD.trim() };
      parsedKunci = keyMap[kunciPG];
    } else if (selectedTipeSoal === 'pg_kompleks') {
      parsedOpsi = [opsiA.trim(), opsiB.trim(), opsiC.trim(), opsiD.trim()].filter(Boolean);
      parsedKunci = pgKompleksKeys.length > 0 ? pgKompleksKeys : [opsiA.trim()];
    } else {
      if (!kunciLain.trim()) {
        showToast('Harap isi kunci jawaban soal!', 'error');
        return;
      }
      parsedKunci = kunciLain.trim();
    }

    const newQuestion: CBTQuestion = {
      id: `soal_${Date.now()}`,
      cpId: currentCp.id,
      tpId: currentTp?.id || 'TP 1',
      tipe: selectedTipeSoal,
      pertanyaan: pertanyaan.trim(),
      opsi: parsedOpsi,
      kunciJawaban: parsedKunci,
      bobot: Number(bobotPoin) || 10,
      gambarUrl: gambarUrl || undefined,
      gambarUrl2: gambarUrl2 || undefined,
      opsiGambar: Object.keys(opsiGambar).length > 0 ? opsiGambar : undefined,
      pembahasan: pembahasan.trim() || `Level ${levelKesukaran} • ${levelKognitif} • Paket ${selectedPaket}`,
    };

    const updatedExam: CBTExam = {
      ...activeExam,
      soalList: [newQuestion, ...activeExam.soalList],
    };

    const newExams = [updatedExam, ...exams.slice(1)];
    setExams(newExams);
    saveStoredCBTExams(newExams);

    showToast('Soal berhasil disimpan ke Bank Soal!', 'success');

    // Reset fields
    setPertanyaan('');
    setOpsiA('');
    setOpsiB('');
    setOpsiC('');
    setOpsiD('');
    setOpsiGambar({});
    setKunciLain('');
    setGambarUrl(null);
    setGambarUrl2(null);
    setPembahasan('');
  };

  const handleResetForm = () => {
    setPertanyaan('');
    setOpsiA('');
    setOpsiB('');
    setOpsiC('');
    setOpsiD('');
    setOpsiGambar({});
    setKunciLain('');
    setGambarUrl(null);
    setGambarUrl2(null);
    setPembahasan('');
    showToast('Form berhasil di-reset.', 'success');
  };

  const handleDeleteQuestion = (qId: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus butir soal ini dari Bank Soal?')) {
      const updatedExam: CBTExam = {
        ...activeExam,
        soalList: activeExam.soalList.filter((q) => q.id !== qId),
      };
      const newExams = [updatedExam, ...exams.slice(1)];
      setExams(newExams);
      saveStoredCBTExams(newExams);
      showToast('Soal berhasil dihapus dari Bank Soal.', 'success');
    }
  };

  // Filter questions for display
  const allCreatedQuestions = activeExam.soalList.filter((q) => {
    if (filterTipe !== 'all' && q.tipe !== filterTipe) return false;
    return true;
  });

  const totalPoints = activeExam.soalList.reduce((acc, q) => acc + (q.bobot || 10), 0);

  // CBT Exam Runner
  const startExam = () => {
    setIsExamRunning(true);
    setExamResult(null);
    setStudentAnswers({});
    setTimeLeft(activeExam?.durasiMenit ? activeExam.durasiMenit * 60 : 3600);
    setCurrentQuestionIndex(0);

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    showToast('Ujian CBT dimulai! Waktu berjalan.', 'success');
  };

  const handleAnswerChange = (questionId: string, answer: any) => {
    setStudentAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  const handleSubmitExam = () => {
    if (!activeExam) return;

    let totalScore = 0;
    let maxScore = 0;

    activeExam.soalList.forEach((q) => {
      maxScore += q.bobot;
      const ans = studentAnswers[q.id];
      const evalRes = evaluateQuestionScore(q.tipe, ans, q.kunciJawaban, q.bobot);
      totalScore += evalRes.earnedScore;
    });

    const finalGrade = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 100;
    setExamResult({ score: finalGrade, total: 100 });
    setIsExamRunning(false);

    const results = getStoredCBTResults();
    results.push({
      examId: activeExam.id,
      studentId: activeUser.studentData?.id || 'std_demo',
      studentName: activeUser.name,
      skor: totalScore,
      nilai: finalGrade,
      waktuSelesai: new Date().toLocaleTimeString(),
      jawabanSiswa: studentAnswers,
    });
    saveStoredCBTResults(results);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    showToast(`Ujian Selesai! Nilai Anda: ${finalGrade}`, 'success');
  };

  const currentQ = activeExam?.soalList[currentQuestionIndex];

  return (
    <section className="space-y-6">
      {/* Top Banner Navigation */}
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
              Menu 4. Penilaian & Pelaporan • Bank Soal & Ujian CBT
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
              <Laptop className="w-5 h-5 text-emerald-600" /> Bank Soal Kurikulum Merdeka & Ujian CBT
            </h2>
            <p className="text-xs text-slate-500">
              Form Pembuatan Soal Standar (6 Tipe Soal), Dropdown CP & TP, Bobot Nilai, serta Daftar Soal Tersimpan.
            </p>
          </div>

          {activeUser.role !== 'siswa' && !isExamRunning && (
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setSubTab('bank-soal')}
                className={`px-4 py-2 rounded-xl text-xs font-display font-black transition cursor-pointer ${
                  subTab === 'bank-soal' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Form Bank Soal
              </button>
              <button
                type="button"
                onClick={() => setSubTab('ujian')}
                className={`px-4 py-2 rounded-xl text-xs font-display font-black transition cursor-pointer ${
                  subTab === 'ujian' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Simulasi / Ujian CBT Siswa
              </button>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* SUBTAB 1: BANK SOAL VIEW (EXACT MATCH WITH USER'S IMAGE 1)      */}
        {/* ============================================================== */}
        {subTab === 'bank-soal' && activeUser.role !== 'siswa' && !isExamRunning && (
          <div className="space-y-6">
            <form onSubmit={handleSaveQuestion} className="space-y-4">
              {/* ROW 1: TOP BAR DROPDOWNS (MATCHING IMAGE 1) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 1. Paket / Jenis Ulangan */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-extrabold text-slate-700">Paket / Jenis Ulangan</label>
                    <button
                      type="button"
                      onClick={() => setIsAddUHOpen(true)}
                      className="text-[11px] font-extrabold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                    >
                      + Tambah UH
                    </button>
                  </div>
                  <select
                    value={selectedPaket}
                    onChange={(e) => setSelectedPaket(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border-2 border-rose-500 bg-white text-xs font-extrabold text-rose-800 outline-none shadow-xs"
                  >
                    {paketList.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Mata Pelajaran */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Mata Pelajaran</label>
                  <select
                    value={selectedMapel}
                    onChange={(e) => setSelectedMapel(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-extrabold text-slate-800 outline-none"
                  >
                    <option value="Pendidikan Agama Islam">Pendidikan Agama Islam</option>
                    <option value="Pendidikan Pancasila">Pendidikan Pancasila</option>
                    <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                    <option value="Matematika">Matematika</option>
                    <option value="Ilmu Pengetahuan Alam dan Sosial (IPAS)">IPAS</option>
                    <option value="Seni Rupa">Seni Rupa</option>
                    <option value="Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)">PJOK</option>
                    <option value="Bahasa Inggris">Bahasa Inggris</option>
                    <option value="Muatan Lokal (PLBJ)">Muatan Lokal (PLBJ)</option>
                  </select>
                </div>

                {/* 3. Target Kelas */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Target Kelas</label>
                  <select
                    value={targetKelas}
                    onChange={(e) => setTargetKelas(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-extrabold text-slate-800 outline-none"
                  >
                    <option value="Kelas 6B">Kelas 6B</option>
                    <option value="Kelas 6A">Kelas 6A</option>
                    <option value="Kelas 5A">Kelas 5A</option>
                    <option value="Kelas 4A">Kelas 4A</option>
                    <option value="Kelas 3A">Kelas 3A</option>
                    <option value="Kelas 2A">Kelas 2A</option>
                    <option value="Kelas 1A">Kelas 1A</option>
                  </select>
                </div>

                {/* 4. Pilih TP yang Diukur (Blue border matching Image 1) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-extrabold text-slate-700">Pilih TP yang Diukur</label>
                    <button
                      type="button"
                      onClick={() => setIsAddTpOpen(true)}
                      className="text-[10px] font-bold text-sky-600 hover:underline"
                    >
                      + TP
                    </button>
                  </div>
                  <select
                    value={selectedTpId}
                    onChange={(e) => setSelectedTpId(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border-2 border-sky-500 bg-white text-xs font-extrabold text-sky-900 outline-none shadow-xs"
                  >
                    {currentCp.tpList.map((tp) => (
                      <option key={tp.id} value={tp.id}>
                        {tp.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Tipe Soal (6 Tipe) */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Tipe Soal (6 Tipe)</label>
                  <select
                    value={selectedTipeSoal}
                    onChange={(e) => setSelectedTipeSoal(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-extrabold text-slate-800 outline-none"
                  >
                    <option value="pg">Pilihan Ganda (PG)</option>
                    <option value="pg_kompleks">Pilihan Ganda Kompleks</option>
                    <option value="benar_salah">Benar / Salah</option>
                    <option value="menjodohkan">Menjodohkan</option>
                    <option value="isian">Isian Singkat</option>
                    <option value="uraian">Uraian</option>
                  </select>
                </div>

                {/* 6. Level Soal & Kognitif (2 Dropdowns side by side) */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Level Soal & Kognitif</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={levelKesukaran}
                      onChange={(e) => setLevelKesukaran(e.target.value as any)}
                      className="w-full px-2 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none"
                    >
                      <option value="Mudah">Mudah</option>
                      <option value="Sedang">Sedang</option>
                      <option value="Sukar">Sukar</option>
                    </select>
                    <select
                      value={levelKognitif}
                      onChange={(e) => setLevelKognitif(e.target.value as any)}
                      className="w-full px-2 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none"
                    >
                      <option value="L1 (C1-C2)">L1 (C1-C2)</option>
                      <option value="L2 (C3)">L2 (C3)</option>
                      <option value="L3 (C4-C6)">L3 (C4-C6)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* CARD: KOMPETENSI (CP) & SUB KOMPETENSI (TP) (MATCHING IMAGE 1) */}
              <div className="p-4 rounded-3xl border border-rose-200 bg-rose-50/20 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Kompetensi (Pilih Dropdown CP) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-black text-rose-700 flex items-center gap-1.5">
                      🚩 Kompetensi (Pilih Dropdown CP)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddCpOpen(true)}
                        className="text-[11px] font-extrabold text-rose-700 hover:underline"
                      >
                        + Tambah CP
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast('Data CP tersinkron otomatis dari Kurikulum!', 'success')}
                        className="text-[11px] font-extrabold text-sky-700 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Sinkron dari Menu CP
                      </button>
                    </div>
                  </div>
                  <select
                    value={selectedCpId}
                    onChange={(e) => {
                      setSelectedCpId(e.target.value);
                      const cp = cpList.find((c) => c.id === e.target.value);
                      if (cp && cp.tpList[0]) setSelectedTpId(cp.tpList[0].id);
                    }}
                    className="w-full px-3 py-2 rounded-2xl border-2 border-rose-400 bg-white text-xs font-bold text-slate-800 outline-none truncate"
                  >
                    {cpList.map((cp) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.judul}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={3}
                    readOnly
                    value={currentCp.deskripsi}
                    className="w-full p-2.5 rounded-2xl border border-slate-200 bg-white/80 text-xs text-slate-700 leading-relaxed outline-none resize-none font-medium"
                  />
                </div>

                {/* Right: Sub Kompetensi (Otomatis dari TP) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-black text-sky-800 flex items-center gap-1.5">
                      🎯 Sub Kompetensi (Otomatis dari Tujuan Pembelajaran / TP)
                    </span>
                    <span className="text-[10px] font-black uppercase bg-sky-100 text-sky-800 px-2 py-0.5 rounded-md border border-sky-200">
                      {selectedTpId}
                    </span>
                  </div>
                  <div className="h-9 flex items-center px-3 rounded-2xl bg-sky-50 border border-sky-200 text-xs font-extrabold text-sky-950">
                    Tujuan Pembelajaran ({selectedTpId})
                  </div>
                  <textarea
                    rows={3}
                    readOnly
                    value={currentTp?.judul || 'Memahami konsep pembelajaran'}
                    className="w-full p-2.5 rounded-2xl border border-slate-200 bg-white/80 text-xs text-slate-700 leading-relaxed outline-none resize-none font-medium"
                  />
                </div>
              </div>

              {/* ROW 3: PERTANYAAN, UPLOAD 2 GAMBAR BERSEBELAHAN & MENU POINT NILAI (MATCHING IMAGE 1) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left: Pertanyaan / Butir Soal */}
                <div className="lg:col-span-6 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-display font-black text-slate-800">
                      Pertanyaan / Butir Soal (Otomatis EYD V Pecahan saat Disimpan)
                    </label>
                    <button
                      type="button"
                      onClick={handleConvertFractions}
                      className="text-[11px] font-extrabold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-emerald-600" /> Ubah Pecahan (1/3 → satu pertiga)
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={pertanyaan}
                    onChange={(e) => setPertanyaan(e.target.value)}
                    required
                    placeholder="Tuliskan pertanyaan soal (contoh ketik 1/3 otomatis menjadi satu pertiga sesuai PUEBI / EYD V saat disimpan)..."
                    className="w-full p-3 rounded-2xl border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:border-rose-500 font-medium leading-relaxed"
                  />
                </div>

                {/* Middle: Upload Gambar Soal (Hingga 2 Gambar Bersebelahan) */}
                <div className="lg:col-span-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-display font-black text-slate-800">
                      Upload Gambar Soal
                    </label>
                    {(gambarUrl || gambarUrl2) && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {gambarUrl && gambarUrl2 ? '2 Gambar Bersebelahan' : '1 Gambar'}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 rounded-2xl border border-slate-200 bg-white grid grid-cols-2 gap-2 min-h-[108px]">
                    {/* Slot 1: Gambar 1 */}
                    <div className="flex flex-col items-center justify-center p-1 rounded-xl bg-slate-50 border border-dashed border-slate-300 relative text-center">
                      {gambarUrl ? (
                        <div className="relative group w-full h-full flex flex-col items-center justify-center">
                          <img src={gambarUrl} alt="Gambar 1" className="h-14 w-auto max-w-full rounded object-contain" />
                          <button
                            type="button"
                            onClick={() => setGambarUrl(null)}
                            className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 text-[9px] shadow cursor-pointer"
                            title="Hapus Gambar 1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <span className="text-[9px] font-bold text-slate-600 mt-0.5">Gambar 1</span>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center cursor-pointer p-1">
                          <ImageIcon className="w-4 h-4 text-slate-400 mb-0.5" />
                          <span className="text-[10px] font-bold text-rose-600 hover:underline">+ Gambar 1</span>
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                      )}
                    </div>

                    {/* Slot 2: Gambar 2 (Bersebelahan) */}
                    <div className="flex flex-col items-center justify-center p-1 rounded-xl bg-slate-50 border border-dashed border-slate-300 relative text-center">
                      {gambarUrl2 ? (
                        <div className="relative group w-full h-full flex flex-col items-center justify-center">
                          <img src={gambarUrl2} alt="Gambar 2" className="h-14 w-auto max-w-full rounded object-contain" />
                          <button
                            type="button"
                            onClick={() => setGambarUrl2(null)}
                            className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 text-[9px] shadow cursor-pointer"
                            title="Hapus Gambar 2"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <span className="text-[9px] font-bold text-slate-600 mt-0.5">Gambar 2</span>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center cursor-pointer p-1">
                          <ImageIcon className="w-4 h-4 text-slate-400 mb-0.5" />
                          <span className="text-[10px] font-bold text-rose-600 hover:underline">+ Gambar 2</span>
                          <input type="file" accept="image/*" onChange={handleImageUpload2} className="hidden" />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Menu Point Nilai (Kanan Soal) (Green box matching Image 1) */}
                <div className="lg:col-span-3">
                  <div className="p-4 rounded-3xl border-2 border-emerald-400 bg-emerald-50/40 text-center space-y-1 h-[128px] flex flex-col justify-center">
                    <span className="text-xs font-display font-black text-emerald-900 flex items-center justify-center gap-1">
                      ⭐ Menu Point Nilai (Kanan Soal)
                    </span>
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={bobotPoin}
                        onChange={(e) => setBobotPoin(Number(e.target.value))}
                        className="w-20 text-center text-2xl font-display font-black text-emerald-950 bg-white rounded-xl border-2 border-emerald-500 py-1"
                      />
                      <span className="text-sm font-display font-extrabold text-emerald-900">Poin</span>
                    </div>
                    <p className="text-[10px] text-emerald-700">Bobot skor soal ini saat dianalisis</p>
                  </div>
                </div>
              </div>

              {/* ROW 4: PILIHAN JAWABAN DENGAN DUKUNGAN GAMBAR JAWABAN */}
              <div className="p-5 rounded-3xl border border-slate-200 bg-white space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-display font-black text-sm text-slate-800">
                      Pilihan Jawaban {selectedTipeSoal === 'pg' && '(Pilih 1 Kunci Benar):'}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Dapat menambahkan teks jawaban dan/atau gambar pada tiap pilihan jawaban (A, B, C, D).
                    </p>
                  </div>
                  {selectedTipeSoal === 'isian' && (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      Toleran &quot;/&quot; &amp; Case-Insensitive
                    </span>
                  )}
                </div>

                {/* TIPE 1: PILIHAN GANDA DENGAN DUKUNGAN GAMBAR PADA OPSI A, B, C, D */}
                {selectedTipeSoal === 'pg' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(['A', 'B', 'C', 'D'] as const).map((key) => {
                      const val = key === 'A' ? opsiA : key === 'B' ? opsiB : key === 'C' ? opsiC : opsiD;
                      const setVal = key === 'A' ? setOpsiA : key === 'B' ? setOpsiB : key === 'C' ? setOpsiC : setOpsiD;
                      const optImg = opsiGambar[key];

                      return (
                        <div key={key} className="p-2.5 rounded-2xl border border-slate-200 bg-slate-50/40 space-y-2">
                          <div className="flex items-center gap-2.5">
                            <input
                              type="radio"
                              id={`kunci_${key}`}
                              name="kunciPG"
                              checked={kunciPG === key}
                              onChange={() => setKunciPG(key)}
                              className="w-4 h-4 text-rose-600 cursor-pointer"
                            />
                            <label htmlFor={`kunci_${key}`} className="font-display font-black text-xs text-slate-700 w-4">
                              {key}.
                            </label>
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => setVal(e.target.value)}
                              placeholder={`Teks Opsi ${key}`}
                              className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:border-rose-400"
                            />
                            {/* Upload Gambar Jawaban */}
                            <label
                              className={`p-1.5 rounded-xl border flex items-center justify-center cursor-pointer transition shrink-0 ${
                                optImg ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white hover:bg-slate-100 text-slate-500 border-slate-300'
                              }`}
                              title={`Upload Gambar untuk Opsi ${key}`}
                            >
                              <ImageIcon className="w-4 h-4" />
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleOptionImageUpload(key, e)}
                                className="hidden"
                              />
                            </label>
                          </div>

                          {/* Preview Option Image */}
                          {optImg && (
                            <div className="ml-8 flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 w-fit">
                              <img src={optImg} alt={`Gbr ${key}`} className="h-12 w-auto object-contain rounded" />
                              <button
                                type="button"
                                onClick={() => handleRemoveOptionImage(key)}
                                className="text-slate-400 hover:text-red-600 p-1 text-xs cursor-pointer"
                                title="Hapus gambar opsi ini"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* TIPE 2: ISIAN SINGKAT (DENGAN TANDA /) */}
                {selectedTipeSoal === 'isian' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-slate-700">
                      Kunci Jawaban Isian Singkat:
                    </label>
                    <input
                      type="text"
                      value={kunciLain}
                      onChange={(e) => setKunciLain(e.target.value)}
                      placeholder="Contoh: Orang tua / ayah / ibu"
                      className="w-full px-4 py-2.5 rounded-2xl border-2 border-emerald-500 bg-white font-mono font-bold text-xs text-emerald-950 outline-none"
                    />
                    <p className="text-[11px] text-slate-500">
                      💡 <strong>Aturan Koreksi Otomatis:</strong> Jika ada tanda <code>&quot;/&quot;</code>, maka jika siswa menjawab salah satu alternatif (misal: <em>ayah</em>, <em>ibu</em>, atau <em>orang tua</em>/<em>orangtua</em>), sistem otomatis menganggapnya <strong>BENAR</strong>, tidak sensitif huruf kapital maupun spasi.
                    </p>
                  </div>
                )}

                {/* TIPE 3: PILIHAN GANDA KOMPLEKS */}
                {selectedTipeSoal === 'pg_kompleks' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600">Isi opsi pilihan dan centang semua kunci jawaban yang benar:</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { key: 'A', val: opsiA, set: setOpsiA },
                        { key: 'B', val: opsiB, set: setOpsiB },
                        { key: 'C', val: opsiC, set: setOpsiC },
                        { key: 'D', val: opsiD, set: setOpsiD },
                      ].map((item) => {
                        const isChecked = pgKompleksKeys.includes(item.val);
                        return (
                          <div key={item.key} className="flex items-center gap-3 p-2 rounded-2xl border bg-slate-50/40">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setPgKompleksKeys(pgKompleksKeys.filter((k) => k !== item.val));
                                } else if (item.val) {
                                  setPgKompleksKeys([...pgKompleksKeys, item.val]);
                                }
                              }}
                              className="w-4 h-4 text-emerald-600 cursor-pointer"
                            />
                            <span className="font-black text-xs w-4">{item.key}.</span>
                            <input
                              type="text"
                              value={item.val}
                              onChange={(e) => item.set(e.target.value)}
                              placeholder={`Teks Opsi ${item.key}`}
                              className="flex-1 px-3 py-1.5 rounded-xl border text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TIPE 4: BENAR / SALAH */}
                {selectedTipeSoal === 'benar_salah' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-slate-700">Tentukan Kunci Kebenaran Pernyataan:</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-2xl border">
                        <input
                          type="radio"
                          name="bsKey"
                          checked={kunciLain === 'Benar'}
                          onChange={() => setKunciLain('Benar')}
                        />
                        <span className="text-xs font-bold text-emerald-800">Benar</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-2xl border">
                        <input
                          type="radio"
                          name="bsKey"
                          checked={kunciLain === 'Salah'}
                          onChange={() => setKunciLain('Salah')}
                        />
                        <span className="text-xs font-bold text-rose-800">Salah</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* TIPE 5 & 6: MENJODOHKAN & URAIAN */}
                {(selectedTipeSoal === 'menjodohkan' || selectedTipeSoal === 'uraian') && (
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-slate-700">
                      Kunci Jawaban / Pedoman Penskoran:
                    </label>
                    <textarea
                      rows={2}
                      value={kunciLain}
                      onChange={(e) => setKunciLain(e.target.value)}
                      placeholder="Masukkan kunci jawaban atau pedoman penskoran uraian..."
                      className="w-full p-2.5 rounded-xl border text-xs"
                    />
                  </div>
                )}
              </div>

              {/* ACTION BUTTONS (MATCHING IMAGE 1) */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-display font-extrabold px-5 py-2.5 rounded-2xl text-xs cursor-pointer shadow-xs transition"
                >
                  Batal / Reset
                </button>
                <button
                  type="submit"
                  className="bg-rose-600 hover:bg-rose-700 text-white font-display font-black px-6 py-2.5 rounded-2xl text-xs flex items-center gap-2 cursor-pointer shadow-md transition"
                >
                  💾 Simpan ke Bank Soal
                </button>
              </div>
            </form>

            {/* ============================================================== */}
            {/* DAFTAR SOAL YANG SUDAH DIBUAT (UNDERNEATH THE FORM)             */}
            {/* ============================================================== */}
            <div className="mt-8 pt-6 border-t-2 border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-3xl border border-slate-200">
                <div>
                  <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-emerald-600" /> Daftar Soal yang Sudah Dibuat
                  </h3>
                  <p className="text-xs text-slate-600">
                    Total: <strong>{activeExam.soalList.length} Butir Soal</strong> • Total Bobot: <strong>{totalPoints} Poin</strong>
                  </p>
                </div>

                {/* Filter controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filterTipe}
                    onChange={(e) => setFilterTipe(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700"
                  >
                    <option value="all">Semua Tipe Soal</option>
                    <option value="pg">Pilihan Ganda (PG)</option>
                    <option value="pg_kompleks">PG Kompleks</option>
                    <option value="isian">Isian Singkat</option>
                    <option value="benar_salah">Benar/Salah</option>
                    <option value="menjodohkan">Menjodohkan</option>
                    <option value="uraian">Uraian</option>
                  </select>
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-3">
                {allCreatedQuestions.map((q, qIdx) => {
                  const cpMatch = cpList.find((c) => c.id === q.cpId);
                  return (
                    <div
                      key={q.id}
                      className="p-5 rounded-3xl bg-white border border-slate-200 hover:border-emerald-300 shadow-xs space-y-3 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display font-black text-xs text-white bg-slate-900 px-3 py-1 rounded-xl">
                            Soal #{qIdx + 1}
                          </span>
                          <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg">
                            {q.tipe.toUpperCase()}
                          </span>
                          {q.tpId && (
                            <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-2.5 py-1 rounded-lg">
                              {q.tpId}
                            </span>
                          )}
                          {cpMatch && (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg">
                              {cpMatch.kode}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs font-display font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
                            {q.bobot} Poin
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition cursor-pointer"
                            title="Hapus Soal"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Question Text & Images (Up to 2 Side-by-Side) */}
                      <div className="space-y-2">
                        {q.gambarUrl && q.gambarUrl2 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2">
                            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-center">
                              <span className="text-[10px] text-slate-500 font-bold block mb-1">Gambar 1</span>
                              <img src={q.gambarUrl} alt="Gambar 1" className="max-h-48 rounded-lg object-contain mx-auto" />
                            </div>
                            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-center">
                              <span className="text-[10px] text-slate-500 font-bold block mb-1">Gambar 2</span>
                              <img src={q.gambarUrl2} alt="Gambar 2" className="max-h-48 rounded-lg object-contain mx-auto" />
                            </div>
                          </div>
                        ) : q.gambarUrl ? (
                          <img src={q.gambarUrl} alt="Gambar Soal" className="max-h-48 rounded-xl border border-slate-200 object-contain my-2" />
                        ) : null}

                        <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-relaxed">
                          {q.pertanyaan}
                        </p>
                      </div>

                      {/* Options / Answer key with Option Image */}
                      {q.opsi && q.opsi.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                          {q.opsi.map((opt, oIdx) => {
                            const optLetter = String.fromCharCode(65 + oIdx);
                            const optImg = q.opsiGambar?.[optLetter];
                            const isCorrect =
                              q.kunciJawaban === opt ||
                              q.kunciJawaban === optLetter ||
                              (Array.isArray(q.kunciJawaban) && (q.kunciJawaban.includes(opt) || q.kunciJawaban.includes(optLetter)));

                            return (
                              <div
                                key={oIdx}
                                className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
                                  isCorrect
                                    ? 'bg-emerald-50 border-emerald-400 font-bold text-emerald-950'
                                    : 'bg-slate-50/50 border-slate-200 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-[11px] w-4">{optLetter}.</span>
                                  <span className="flex-1">{opt}</span>
                                  {isCorrect && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                                </div>
                                {optImg && (
                                  <img
                                    src={optImg}
                                    alt={`Gambar Opsi ${optLetter}`}
                                    className="h-16 rounded-lg border border-slate-200 object-contain bg-white mx-auto mt-1"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Key for Isian / Uraian */}
                      {(!q.opsi || q.opsi.length === 0) && (
                        <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-xs">
                          <span className="font-bold text-emerald-900">Kunci Jawaban: </span>
                          <strong className="font-mono text-emerald-950">
                            {Array.isArray(q.kunciJawaban) ? q.kunciJawaban.join(', ') : q.kunciJawaban}
                          </strong>
                        </div>
                      )}

                      {q.pembahasan && (
                        <div className="text-[11px] text-slate-500 italic bg-slate-50 p-2.5 rounded-xl">
                          ℹ️ {q.pembahasan}
                        </div>
                      )}
                    </div>
                  );
                })}

                {allCreatedQuestions.length === 0 && (
                  <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-3xl border border-dashed">
                    Belum ada soal pada filter ini. Buat soal menggunakan form di atas!
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SUBTAB 2: UJIAN CBT SISWA & SIMULASI INTERAKTIF                 */}
        {/* ============================================================== */}
        {subTab === 'ujian' && (
          <div className="space-y-6">
            {/* If Exam is NOT running */}
            {!isExamRunning && (
              <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
                      CBT Ready
                    </span>
                    <h3 className="text-lg font-display font-black text-slate-800 mt-1">
                      {activeExam.judul} ({targetKelas})
                    </h3>
                    <p className="text-xs text-slate-600">
                      Total Soal: <strong>{activeExam.soalList.length} Butir</strong> • Durasi: <strong>{activeExam.durasiMenit} Menit</strong>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={startExam}
                    disabled={activeExam.soalList.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-display font-black px-6 py-3 rounded-2xl text-xs flex items-center gap-2 cursor-pointer shadow-md transition"
                  >
                    <Play className="w-4 h-4" /> Mulai Ujian CBT Sekarang
                  </button>
                </div>

                {examResult && (
                  <div className="p-4 rounded-2xl bg-emerald-100/70 border border-emerald-300 text-center space-y-1">
                    <span className="text-xs font-bold text-emerald-800">Hasil Ujian Terakhir:</span>
                    <h4 className="text-3xl font-display font-black text-emerald-950">{examResult.score} / 100</h4>
                  </div>
                )}
              </div>
            )}

            {/* If Exam IS Running */}
            {isExamRunning && activeExam && currentQ && (
              <div className="bg-slate-50 p-6 rounded-3xl border-2 border-emerald-500 space-y-5 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
                  <div>
                    <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Soal {currentQuestionIndex + 1} dari {activeExam.soalList.length}
                    </span>
                    <h4 className="font-display font-black text-slate-800 text-sm mt-1">{activeExam.judul}</h4>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-rose-50 text-rose-700 px-3.5 py-1.5 rounded-xl border border-rose-200 text-xs font-mono font-black">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</span>
                    </div>
                  </div>
                </div>

                {/* Question Display */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>Tipe: {currentQ.tipe.toUpperCase()}</span>
                    <span>Bobot: {currentQ.bobot} Poin</span>
                  </div>

                  {/* Question Images: Up to 2 side-by-side */}
                  {currentQ.gambarUrl && currentQ.gambarUrl2 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2">
                      <div className="p-2 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">Gambar 1</span>
                        <img src={currentQ.gambarUrl} alt="Gambar 1" className="max-h-56 rounded-xl object-contain mx-auto" />
                      </div>
                      <div className="p-2 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">Gambar 2</span>
                        <img src={currentQ.gambarUrl2} alt="Gambar 2" className="max-h-56 rounded-xl object-contain mx-auto" />
                      </div>
                    </div>
                  ) : currentQ.gambarUrl ? (
                    <img src={currentQ.gambarUrl} alt="Gambar Soal" className="max-h-56 rounded-2xl border border-slate-200 object-contain my-2" />
                  ) : null}

                  <p className="text-sm sm:text-base font-bold text-slate-900 leading-relaxed">
                    {currentQ.pertanyaan}
                  </p>

                  {/* Options with Option Images */}
                  {currentQ.opsi && currentQ.opsi.length > 0 && (
                    <div className="space-y-2.5 pt-2">
                      {currentQ.opsi.map((opt, oIdx) => {
                        const optLetter = String.fromCharCode(65 + oIdx);
                        const optImg = currentQ.opsiGambar?.[optLetter];
                        const isSelected = studentAnswers[currentQ.id] === opt || studentAnswers[currentQ.id] === optLetter;
                        return (
                          <button
                            key={oIdx}
                            type="button"
                            onClick={() => handleAnswerChange(currentQ.id, opt)}
                            className={`w-full p-3.5 rounded-2xl border text-left text-xs font-bold transition flex flex-col gap-2 cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs ring-2 ring-emerald-300'
                                : 'bg-slate-50/50 hover:bg-slate-100 border-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-white border border-slate-300 flex items-center justify-center text-xs font-black shrink-0">
                                {optLetter}
                              </span>
                              <span className="flex-1">{opt}</span>
                            </div>
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar Opsi ${optLetter}`}
                                className="h-20 rounded-xl border border-slate-200 object-contain bg-white ml-9"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Isian Singkat Answer Field */}
                  {currentQ.tipe === 'isian' && (
                    <div className="pt-2">
                      <input
                        type="text"
                        value={studentAnswers[currentQ.id] || ''}
                        onChange={(e) => handleAnswerChange(currentQ.id, e.target.value)}
                        placeholder="Ketik jawaban singkat Anda di sini..."
                        className="w-full p-3.5 rounded-2xl border-2 border-emerald-500 bg-white font-bold text-sm text-slate-900 outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Nav buttons */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-xs font-bold cursor-pointer"
                  >
                    Sebelumnya
                  </button>

                  {currentQuestionIndex < activeExam.soalList.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Selanjutnya
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmitExam}
                      className="px-6 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md cursor-pointer"
                    >
                      Selesai &amp; Kirim Ujian
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: TAMBAH PAKET UH */}
      {isAddUHOpen && (
        <div className="fixed inset-0 z-[950] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-5 shadow-2xl border space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-display font-black text-sm text-slate-900">Tambah Paket Ulangan</h4>
              <button onClick={() => setIsAddUHOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={newUHName}
              onChange={(e) => setNewUHName(e.target.value)}
              placeholder="Contoh: Ulangan Harian 7 (UH 7)"
              className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddUHOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newUHName.trim()) {
                    setPaketList([...paketList, newUHName.trim()]);
                    setSelectedPaket(newUHName.trim());
                    setIsAddUHOpen(false);
                    setNewUHName('');
                    showToast('Paket Ulangan berhasil ditambahkan!', 'success');
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-black"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH CP */}
      {isAddCpOpen && (
        <div className="fixed inset-0 z-[950] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-5 shadow-2xl border space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-display font-black text-sm text-slate-900">Tambah Capaian Pembelajaran (CP)</h4>
              <button onClick={() => setIsAddCpOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Judul / Kode CP:</label>
              <input
                type="text"
                value={newCpTitle}
                onChange={(e) => setNewCpTitle(e.target.value)}
                placeholder="Contoh: CP 4: Bilangan Cacah & Geometri"
                className="w-full px-3 py-2 rounded-xl border text-xs"
              />
              <label className="text-xs font-bold text-slate-700">Deskripsi Lengkap CP:</label>
              <textarea
                rows={3}
                value={newCpDesc}
                onChange={(e) => setNewCpDesc(e.target.value)}
                placeholder="Deskripsi capaian pembelajaran fase..."
                className="w-full p-2.5 rounded-xl border text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddCpOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newCpTitle.trim() && newCpDesc.trim()) {
                    const newId = `cp_${Date.now()}`;
                    const newCpObj = {
                      id: newId,
                      kode: `CP ${cpList.length + 1}`,
                      judul: newCpTitle.trim(),
                      deskripsi: newCpDesc.trim(),
                      mapel: selectedMapel,
                      tpList: [{ id: 'TP 1', judul: 'Memahami kompetensi dasar materi pembelajaran.' }]
                    };
                    setCpList([...cpList, newCpObj]);
                    setSelectedCpId(newId);
                    setIsAddCpOpen(false);
                    setNewCpTitle('');
                    setNewCpDesc('');
                    showToast('Capaian Pembelajaran (CP) baru berhasil ditambahkan!', 'success');
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black"
              >
                Simpan CP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH TP */}
      {isAddTpOpen && (
        <div className="fixed inset-0 z-[950] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-5 shadow-2xl border space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-display font-black text-sm text-slate-900">Tambah Tujuan Pembelajaran (TP)</h4>
              <button onClick={() => setIsAddTpOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Kode TP (e.g. TP 4):</label>
              <input
                type="text"
                value={newTpIdInput}
                onChange={(e) => setNewTpIdInput(e.target.value)}
                placeholder={`TP ${currentCp.tpList.length + 1}`}
                className="w-full px-3 py-2 rounded-xl border text-xs"
              />
              <label className="text-xs font-bold text-slate-700">Teks Tujuan Pembelajaran:</label>
              <textarea
                rows={3}
                value={newTpDescInput}
                onChange={(e) => setNewTpDescInput(e.target.value)}
                placeholder="Tuliskan butir tujuan pembelajaran..."
                className="w-full p-2.5 rounded-xl border text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddTpOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newTpDescInput.trim()) {
                    const tpKey = newTpIdInput.trim() || `TP ${currentCp.tpList.length + 1}`;
                    const updatedCpList = cpList.map((c) => {
                      if (c.id === currentCp.id) {
                        return {
                          ...c,
                          tpList: [...c.tpList, { id: tpKey, judul: newTpDescInput.trim() }]
                        };
                      }
                      return c;
                    });
                    setCpList(updatedCpList);
                    setSelectedTpId(tpKey);
                    setIsAddTpOpen(false);
                    setNewTpIdInput('');
                    setNewTpDescInput('');
                    showToast('Tujuan Pembelajaran (TP) baru berhasil ditambahkan!', 'success');
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-black"
              >
                Simpan TP
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
