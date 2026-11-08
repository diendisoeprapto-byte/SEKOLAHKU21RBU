import React, { useState, useEffect } from 'react';
import {
  Users,
  Compass,
  FileQuestion,
  BarChart3,
  Plus,
  Upload,
  Download,
  Trash2,
  Play,
  Clock,
  CheckCircle,
  HelpCircle,
  Search,
  Filter,
  Layers,
  Image as ImageIcon,
  CheckSquare,
  BookOpen,
  Award,
  RefreshCw,
  X,
  FileSpreadsheet,
  Pencil,
  Edit3,
  Check,
  TrendingUp,
  Printer,
  Trophy,
  FileText,
  Eye,
  AlertCircle,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, TKACpTp, TKAQuestion, TKAJenis, ActiveUser } from '../../types';
import { TKA_JENIS_LIST, TKA_MAPEL_LIST } from '../../data/defaultData';
import {
  getStoredTKACpTp,
  saveStoredTKACpTp,
  getStoredTKAQuestions,
  saveStoredTKAQuestions,
  getStoredTKAResults,
  saveStoredTKAResults,
  getStoredTKASubmissions,
  saveStoredTKASubmissions,
  clearStoredTKASubmissions,
  TKASubmissionItem,
} from '../../utils/storage';
import { evaluateQuestionScore } from '../../utils/answerChecker';

interface Props {
  subType: 'siswa-tka' | 'cp-tp-tka' | 'bank-soal-tka' | 'analisis-tka' | 'hasil-tka' | 'tes-tka-siswa';
  students: Student[];
  activeUser: ActiveUser;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

export const TKATabs: React.FC<Props> = ({
  subType,
  students,
  activeUser,
  showToast,
  onOpenZoom,
}) => {
  // 1. Data Siswa TKA: Kelas 6A & Kelas 6B
  const tkaStudents = students.filter((s) => s.kelas === 'Kelas 6A' || s.kelas === 'Kelas 6B');
  const [classFilter, setClassFilter] = useState<'all' | 'Kelas 6A' | 'Kelas 6B'>('all');
  const [searchStudent, setSearchStudent] = useState('');

  const displayTkaStudents = tkaStudents.filter((s) => {
    if (classFilter !== 'all' && s.kelas !== classFilter) return false;
    if (
      searchStudent &&
      !s.nama.toLowerCase().includes(searchStudent.toLowerCase()) &&
      !s.nisn.includes(searchStudent) &&
      !s.barcodeId.toLowerCase().includes(searchStudent.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // 2. CP & TP TKA State
  const [cpTpList, setCpTpList] = useState<TKACpTp[]>(getStoredTKACpTp());
  const [newCpKode, setNewCpKode] = useState('');
  const [newCpJudul, setNewCpJudul] = useState('');
  const [newCpMapel, setNewCpMapel] = useState('Bahasa Indonesia');
  const [newCpDesc, setNewCpDesc] = useState('');
  const [newTpJudul, setNewTpJudul] = useState('');

  // Modals for quick add CP and TP
  const [showAddCpModal, setShowAddCpModal] = useState(false);
  const [showAddTpModal, setShowAddTpModal] = useState(false);
  const [quickCpKode, setQuickCpKode] = useState('');
  const [quickCpJudul, setQuickCpJudul] = useState('');
  const [quickCpMapel, setQuickCpMapel] = useState('Bahasa Indonesia');
  const [quickCpDesc, setQuickCpDesc] = useState('');
  const [quickTpKode, setQuickTpKode] = useState('');
  const [quickTpJudul, setQuickTpJudul] = useState('');

  // 3. Bank Soal TKA State
  const [tkaQuestions, setTkaQuestions] = useState<TKAQuestion[]>(getStoredTKAQuestions());
  const [filterJenisTka, setFilterJenisTka] = useState<string>('all');
  const [filterMapelTka, setFilterMapelTka] = useState<string>('all');

  // 4. Analisis TKA State
  const [analisisMapelTka, setAnalisisMapelTka] = useState<string>('all');
  const [analisisPaketTka, setAnalisisPaketTka] = useState<string>('all');
  const [analisisChartTab, setAnalisisChartTab] = useState<'kesukaran' | 'ketuntasan' | 'pembeda'>('kesukaran');

  // 5. Report & Hasil TKA State
  const [tkaSubmissions, setTkaSubmissions] = useState<TKASubmissionItem[]>(getStoredTKASubmissions());
  const [rankingScope, setRankingScope] = useState<'semua' | 'Kelas 6A' | 'Kelas 6B'>('semua');
  const [hasilPaketTka, setHasilPaketTka] = useState<string>('Tryout TKA 1');
  const [hasilKelasTka, setHasilKelasTka] = useState<'all' | 'Kelas 6A' | 'Kelas 6B'>('all');
  const [hasilStatusTka, setHasilStatusTka] = useState<'all' | 'Tuntas' | 'Remedial'>('all');
  const [searchHasilTka, setSearchHasilTka] = useState('');
  const [selectedHasilStudent, setSelectedHasilStudent] = useState<any | null>(null);

  // 6. Student Exam Room State (tes-tka-siswa)
  const [activeExamPaket, setActiveExamPaket] = useState<string | null>(null);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, any>>({});
  const [raguChecks, setRaguChecks] = useState<Record<string, boolean>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [examTimerSeconds, setExamTimerSeconds] = useState(3600);
  const [isExamCompleted, setIsExamCompleted] = useState(false);
  const [lastExamResult, setLastExamResult] = useState<any | null>(null);
  const [selectedTestStudentId, setSelectedTestStudentId] = useState<string>(tkaStudents[0]?.id || '');

  // Countdown timer for student CBT exam
  useEffect(() => {
    if (!activeExamPaket || isExamCompleted) return;
    const interval = setInterval(() => {
      setExamTimerSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeExamPaket, isExamCompleted]);

  // Question Form State matching reference UI Image 1
  const [formPaket, setFormPaket] = useState<TKAJenis>('Simulasi 1');
  const [formMapel, setFormMapel] = useState('Bahasa Indonesia');
  const [formTargetKelas, setFormTargetKelas] = useState('Kelas 6B');
  const [formTpIndex, setFormTpIndex] = useState(0);
  const [formTipe, setFormTipe] = useState<'pg' | 'pg_kompleks' | 'menjodohkan' | 'isian' | 'uraian' | 'benar_salah'>('pg');
  const [formKesukaran, setFormKesukaran] = useState<'Mudah' | 'Sedang' | 'Sukar'>('Sedang');
  const [formKognitif, setFormKognitif] = useState('L2 (C3)');

  // Selected CP & TP
  const [selectedCpId, setSelectedCpId] = useState<string>(cpTpList[0]?.id || 'cp_tka_01');
  const activeCp = cpTpList.find((c) => c.id === selectedCpId) || cpTpList[0];
  const activeTp = activeCp?.tpList && activeCp.tpList[formTpIndex] ? activeCp.tpList[formTpIndex] : activeCp?.tpList?.[0];

  // Question Content & Media (Support up to 2 side-by-side images & option images)
  const [formPertanyaan, setFormPertanyaan] = useState('');
  const [formGambarUrl, setFormGambarUrl] = useState<string | null>(null);
  const [formGambarUrl2, setFormGambarUrl2] = useState<string | null>(null);
  const [formOpsiGambar, setFormOpsiGambar] = useState<Record<string, string>>({});
  const [formBobot, setFormBobot] = useState(10);

  // PG Options (A, B, C, D)
  const [pgOptionA, setPgOptionA] = useState('');
  const [pgOptionB, setPgOptionB] = useState('');
  const [pgOptionC, setPgOptionC] = useState('');
  const [pgOptionD, setPgOptionD] = useState('');
  const [pgKunci, setPgKunci] = useState<'A' | 'B' | 'C' | 'D'>('A');

  // Other types answers
  const [pgkChecks, setPgkChecks] = useState<Record<string, boolean>>({ A: false, B: false, C: false, D: false });
  const [benarSalahKunci, setBenarSalahKunci] = useState<'Benar' | 'Salah'>('Benar');
  const [isianKunci, setIsianKunci] = useState('');
  const [uraianKunci, setUraianKunci] = useState('');
  const [menjodohkanKunci, setMenjodohkanKunci] = useState('');

  // TKA CP & TP Editing State
  const [editingCpId, setEditingCpId] = useState<string | null>(null);
  const [editCpJudul, setEditCpJudul] = useState('');
  const [editCpDesc, setEditCpDesc] = useState('');
  const [editingTpId, setEditingTpId] = useState<string | null>(null);
  const [editTpJudul, setEditTpJudul] = useState('');
  const [addingTpForCpId, setAddingTpForCpId] = useState<string | null>(null);
  const [newTpJudulForCp, setNewTpJudulForCp] = useState('');

  // CBT Player Simulation for TKA
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [simJenis, setSimJenis] = useState<TKAJenis>('Simulasi 1');
  const [simQuestionIdx, setSimQuestionIdx] = useState(0);
  const [simAnswers, setSimAnswers] = useState<Record<string, any>>({});
  const [simTimeLeft, setSimTimeLeft] = useState(1800); // 30 mins
  const [simResult, setSimResult] = useState<{ score: number; max: number; details: any[] } | null>(null);

  const simulationQuestions = tkaQuestions.filter((q) => q.jenisTka === simJenis);

  // Fraction converter helper (1/3 -> satu pertiga)
  const convertFractions = (text: string) => {
    const fractionMap: Record<string, string> = {
      '1/2': 'satu perdua (setengah)',
      '1/3': 'satu pertiga',
      '2/3': 'dua pertiga',
      '1/4': 'satu perempat (seperempat)',
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
    let updated = text;
    Object.keys(fractionMap).forEach((frac) => {
      const regex = new RegExp(`\\b${frac.replace('/', '\\/')}\\b`, 'g');
      updated = updated.replace(regex, fractionMap[frac]);
    });
    return updated;
  };

  const handleClearSubmissions = () => {
    if (confirm('Apakah Anda yakin ingin mengosongkan seluruh data hasil & analisis TKA?')) {
      clearStoredTKASubmissions();
      setTkaSubmissions([]);
      showToast('Data Hasil dan Analisis TKA telah dikosongkan!', 'success');
    }
  };

  const handleSeedSimulatedSubmissions = () => {
    const paketToSeed = hasilPaketTka || 'Tryout TKA 1';
    const seeded: TKASubmissionItem[] = tkaStudents.map((s, idx) => {
      const hashString = `${s.id}_${s.nisn}_${paketToSeed}`;
      let h = 0;
      for (let i = 0; i < hashString.length; i++) {
        h = (h << 5) - h + hashString.charCodeAt(i);
        h |= 0;
      }
      const base = Math.abs(h);
      const skorIndo = 72 + (base % 26);
      const skorMtk = 66 + ((base >> 2) % 32);
      const skorIpas = 70 + ((base >> 4) % 28);
      const skorInggris = 68 + ((base >> 6) % 30);
      const skorTotal = Math.round((skorIndo + skorMtk + skorIpas + skorInggris) / 4);

      const predikat: 'A' | 'B' | 'C' | 'D' =
        skorTotal >= 88 ? 'A' : skorTotal >= 78 ? 'B' : skorTotal >= 68 ? 'C' : 'D';
      const status: 'Tuntas' | 'Remedial' = skorTotal >= 75 ? 'Tuntas' : 'Remedial';

      const answers: Record<string, any> = {};
      tkaQuestions
        .filter((q) => q.jenisTka === paketToSeed)
        .forEach((q, qIdx) => {
          const isCorrect = (base + qIdx * 7) % 100 < skorTotal;
          answers[q.id] = isCorrect ? q.kunciJawaban : 'Jawaban lain';
        });

      return {
        id: `sub_${s.id}_${paketToSeed.replace(/\s+/g, '_')}`,
        studentId: s.id,
        studentName: s.nama,
        nisn: s.nisn,
        kelas: s.kelas,
        fotoUrl: s.fotoUrl,
        paket: paketToSeed,
        answers,
        scoresPerMapel: {
          'Bahasa Indonesia': skorIndo,
          'Matematika': skorMtk,
          'IPAS': skorIpas,
          'Bahasa Inggris': skorInggris,
        },
        skorTotal,
        predikat,
        status,
        tanggalUjian: '04 November 2026',
        durasiPengerjaan: '45 Menit',
      };
    });

    saveStoredTKASubmissions(seeded);
    setTkaSubmissions(seeded);
    showToast(`Data simulasi pengerjaan siswa (${seeded.length} siswa) berhasil dimuat!`, 'success');
  };

  const handleApplyFractionConvert = () => {
    const converted = convertFractions(formPertanyaan);
    setFormPertanyaan(converted);
    showToast('Pecahan berhasil diubah ke format teks sesuai EYD V!', 'success');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setFormGambarUrl(reader.result as string);
        showToast('Gambar 1 soal berhasil dimuat!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload2 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setFormGambarUrl2(reader.result as string);
        showToast('Gambar 2 soal berhasil dimuat!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOptionImageUpload = (key: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setFormOpsiGambar((prev) => ({
        ...prev,
        [key]: reader.result as string,
      }));
      showToast(`Gambar untuk opsi ${key} berhasil ditambahkan!`, 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveOptionImage = (key: string) => {
    setFormOpsiGambar((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleResetForm = () => {
    setFormPertanyaan('');
    setFormGambarUrl(null);
    setFormGambarUrl2(null);
    setFormOpsiGambar({});
    setFormBobot(10);
    setPgOptionA('');
    setPgOptionB('');
    setPgOptionC('');
    setPgOptionD('');
    setPgKunci('A');
    setPgkChecks({ A: false, B: false, C: false, D: false });
    setBenarSalahKunci('Benar');
    setIsianKunci('');
    setUraianKunci('');
    setMenjodohkanKunci('');
  };

  // Submit new TKA question
  const handleSaveTkaQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPertanyaan.trim()) {
      showToast('Harap tuliskan pertanyaan butir soal!', 'error');
      return;
    }

    let parsedOpsi: string[] | undefined = undefined;
    let finalKunci: any = '';

    if (formTipe === 'pg') {
      if (!pgOptionA && !pgOptionB && !formOpsiGambar['A'] && !formOpsiGambar['B']) {
        showToast('Harap isi minimal opsi A dan B (teks atau gambar)!', 'error');
        return;
      }
      parsedOpsi = [pgOptionA, pgOptionB, pgOptionC, pgOptionD].filter((v, idx) => {
        const key = ['A', 'B', 'C', 'D'][idx];
        return Boolean(v) || Boolean(formOpsiGambar[key]);
      });
      finalKunci = pgKunci;
    } else if (formTipe === 'pg_kompleks') {
      parsedOpsi = [pgOptionA, pgOptionB, pgOptionC, pgOptionD].filter((v, idx) => {
        const key = ['A', 'B', 'C', 'D'][idx];
        return Boolean(v) || Boolean(formOpsiGambar[key]);
      });
      const selected = Object.keys(pgkChecks).filter((k) => pgkChecks[k]);
      if (selected.length === 0) {
        showToast('Pilih minimal satu kunci benar untuk PG Kompleks!', 'error');
        return;
      }
      finalKunci = selected;
    } else if (formTipe === 'benar_salah') {
      finalKunci = benarSalahKunci;
    } else if (formTipe === 'isian') {
      if (!isianKunci.trim()) {
        showToast('Harap tuliskan kunci jawaban isian singkat!', 'error');
        return;
      }
      finalKunci = isianKunci.trim();
    } else if (formTipe === 'uraian') {
      finalKunci = uraianKunci.trim() || 'Rubrik penilaian uraian';
    } else if (formTipe === 'menjodohkan') {
      finalKunci = menjodohkanKunci.trim() || 'Pasangan kunci benar';
    }

    const autoEydPertanyaan = convertFractions(formPertanyaan);

    const newQuestion: TKAQuestion = {
      id: `tka_q_${Date.now()}`,
      jenisTka: formPaket,
      mapel: formMapel,
      cpId: activeCp?.id || 'cp_tka_01',
      tpId: activeTp?.id || 'tp_01',
      tipe: formTipe,
      pertanyaan: autoEydPertanyaan,
      opsi: parsedOpsi,
      opsiGambar: Object.keys(formOpsiGambar).length > 0 ? formOpsiGambar : undefined,
      kunciJawaban: finalKunci,
      bobot: Number(formBobot) || 10,
      gambarUrl: formGambarUrl || undefined,
      gambarUrl2: formGambarUrl2 || undefined,
      pembahasan: `Level: ${formKesukaran} (${formKognitif}). Target: ${formTargetKelas}. CP: ${activeCp?.judulCp || '-'}. TP: ${activeTp?.judulTp || '-'}`,
    };

    const updated = [newQuestion, ...tkaQuestions];
    setTkaQuestions(updated);
    saveStoredTKAQuestions(updated);

    showToast(`Soal berhasil disimpan ke Bank Soal ${formPaket}!`, 'success');
    handleResetForm();
  };

  const handleDeleteTkaQuestion = (id: string) => {
    if (confirm('Hapus butir soal TKA ini?')) {
      const updated = tkaQuestions.filter((q) => q.id !== id);
      setTkaQuestions(updated);
      saveStoredTKAQuestions(updated);
      showToast('Soal TKA berhasil dihapus', 'success');
    }
  };

  // Quick Add CP
  const handleSaveQuickCp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCpKode || !quickCpJudul) {
      showToast('Kode CP dan Judul CP wajib diisi!', 'error');
      return;
    }

    const newCp: TKACpTp = {
      id: `cp_tka_${Date.now()}`,
      kodeCp: quickCpKode,
      judulCp: quickCpJudul,
      deskripsiCp: quickCpDesc || quickCpJudul,
      mapel: quickCpMapel,
      tpList: [
        {
          id: `tp_${Date.now()}`,
          kodeTp: `${quickCpKode}-TP1`,
          judulTp: `Tujuan Pembelajaran 1 untuk ${quickCpJudul}`,
        },
      ],
    };

    const updated = [...cpTpList, newCp];
    setCpTpList(updated);
    saveStoredTKACpTp(updated);
    setSelectedCpId(newCp.id);
    setShowAddCpModal(false);
    setQuickCpKode('');
    setQuickCpJudul('');
    setQuickCpDesc('');
    showToast('Capaian Pembelajaran (CP) TKA berhasil ditambahkan!', 'success');
  };

  // Quick Add TP
  const handleSaveQuickTp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTpJudul) {
      showToast('Judul TP wajib diisi!', 'error');
      return;
    }

    const targetCp = activeCp;
    if (!targetCp) return;

    const newTp = {
      id: `tp_${Date.now()}`,
      kodeTp: quickTpKode || `TP${(targetCp.tpList?.length || 0) + 1}`,
      judulTp: quickTpJudul,
    };

    const updated = cpTpList.map((cp) => {
      if (cp.id === targetCp.id) {
        return {
          ...cp,
          tpList: [...(cp.tpList || []), newTp],
        };
      }
      return cp;
    });

    setCpTpList(updated);
    saveStoredTKACpTp(updated);
    setShowAddTpModal(false);
    setQuickTpKode('');
    setQuickTpJudul('');
    setFormTpIndex((targetCp.tpList?.length || 0));
    showToast('Tujuan Pembelajaran (TP) TKA berhasil ditambahkan!', 'success');
  };

  // Import Soal TKA Excel
  const handleImportTkaQuestions = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        const importedQuestions: TKAQuestion[] = [];

        data.forEach((row, idx) => {
          const jenis = (row['Jenis TKA'] || row['jenisTka'] || 'Simulasi 1') as TKAJenis;
          const mapel = row['Mata Pelajaran'] || row['mapel'] || 'Bahasa Indonesia';
          const tipe = (row['Tipe Soal'] || row['tipe'] || 'isian') as any;
          const pertanyaan = row['Pertanyaan'] || row['pertanyaan'];
          const kunci = row['Kunci Jawaban'] || row['kunciJawaban'];
          const bobot = Number(row['Bobot'] || row['bobot']) || 10;
          const pembahasan = row['Pembahasan'] || row['pembahasan'] || '';
          const opsiRaw = row['Opsi Pilihan'] || row['opsi'];

          if (pertanyaan && kunci) {
            let opsiParsed: string[] | undefined = undefined;
            if (opsiRaw && typeof opsiRaw === 'string') {
              opsiParsed = opsiRaw.split(',').map((o: string) => o.trim());
            }

            importedQuestions.push({
              id: `tka_imp_${Date.now()}_${idx}`,
              jenisTka: jenis,
              mapel,
              tipe,
              pertanyaan: convertFractions(pertanyaan),
              opsi: opsiParsed,
              kunciJawaban: kunci,
              bobot,
              pembahasan,
              cpId: cpTpList[0]?.id || 'cp_tka_01',
              tpId: cpTpList[0]?.tpList?.[0]?.id || 'tp_01',
            });
          }
        });

        if (importedQuestions.length > 0) {
          const updated = [...importedQuestions, ...tkaQuestions];
          setTkaQuestions(updated);
          saveStoredTKAQuestions(updated);
          showToast(`Berhasil mengimpor ${importedQuestions.length} butir soal TKA!`, 'success');
        } else {
          showToast('Tidak ada baris soal yang valid ditemukan dalam file.', 'error');
        }
      } catch (err) {
        console.error('Import error:', err);
        showToast('Gagal mengimpor file. Pastikan format kolom sesuai.', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplateTkaXLSX = () => {
    const templateData = [
      {
        'Jenis TKA': 'Simulasi 1',
        'Mata Pelajaran': 'Bahasa Indonesia',
        'Tipe Soal': 'isian',
        'Pertanyaan': 'Siapakah pihak keluarga inti yang membimbing belajar di rumah? (Jawaban singkat)',
        'Opsi Pilihan': '',
        'Kunci Jawaban': 'Orang tua / ayah / ibu',
        'Bobot': 10,
        'Pembahasan': 'Gunakan tanda / untuk opsi alternatif. Huruf besar/kecil otomatis benar.',
      },
      {
        'Jenis TKA': 'Try Out 1',
        'Mata Pelajaran': 'Matematika',
        'Tipe Soal': 'pg',
        'Pertanyaan': 'KPK dari bilangan 12 dan 18 adalah...',
        'Opsi Pilihan': '24, 36, 48, 72',
        'Kunci Jawaban': 'B',
        'Bobot': 10,
        'Pembahasan': 'Faktorisasi 12 dan 18 menghasilkan KPK 36.',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Soal TKA');
    XLSX.writeFile(wb, 'Template_Import_Soal_TKA.xlsx');
    showToast('Template Excel Soal TKA berhasil diunduh!', 'success');
  };

  // Start CBT Simulation for TKA
  const handleStartSim = (jenis: TKAJenis) => {
    const qSet = tkaQuestions.filter((q) => q.jenisTka === jenis);
    if (qSet.length === 0) {
      showToast(`Belum ada butir soal yang dibuat untuk ${jenis}. Buat soal pada form terlebih dahulu!`, 'error');
      return;
    }
    setSimJenis(jenis);
    setSimQuestionIdx(0);
    setSimAnswers({});
    setSimTimeLeft(1800);
    setSimResult(null);
    setIsSimulationRunning(true);
    showToast(`Ujian CBT ${jenis} dimulai!`, 'success');
  };

  const handleSubmitSim = () => {
    let earned = 0;
    let totalMax = 0;
    const details: any[] = [];

    simulationQuestions.forEach((q) => {
      totalMax += q.bobot;
      const ans = simAnswers[q.id];
      const evaluation = evaluateQuestionScore(q.tipe, ans, q.kunciJawaban, q.bobot);
      earned += evaluation.earnedScore;
      details.push({
        question: q,
        userAnswer: ans,
        isCorrect: evaluation.isCorrect,
        score: evaluation.earnedScore,
      });
    });

    const finalPct = totalMax > 0 ? Math.round((earned / totalMax) * 100) : 100;
    setSimResult({ score: finalPct, max: 100, details });
    setIsSimulationRunning(false);

    // Save to TKA results
    const results = getStoredTKAResults();
    results.push({
      examId: `tka_${simJenis.replace(/\s+/g, '_')}`,
      studentId: activeUser.studentData?.id || 'std_tka_user',
      studentName: activeUser.name,
      skor: earned,
      nilai: finalPct,
      waktuSelesai: new Date().toLocaleTimeString(),
      jawabanSiswa: simAnswers,
    });
    saveStoredTKAResults(results);

    showToast(`Ujian ${simJenis} Selesai! Nilai: ${finalPct}`, 'success');
  };

  const filteredTkaQuestions = tkaQuestions.filter((q) => {
    if (filterJenisTka !== 'all' && q.jenisTka !== filterJenisTka) return false;
    if (filterMapelTka !== 'all' && q.mapel !== filterMapelTka) return false;
    return true;
  });

  const curSimQ = simulationQuestions[simQuestionIdx];

  return (
    <section className="space-y-6">
      {/* ================= 1. SUB-MENU SISWA TKA ================= */}
      {subType === 'siswa-tka' && (
        <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                Menu TKA • Peserta Ujian Tingkat Akhir
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-600" /> Data Siswa TKA (Otomatis dari Kelas 6A & 6B)
              </h2>
              <p className="text-xs text-slate-500">
                Seluruh peserta didik Kelas 6A dan Kelas 6B SDN Rawa Badak Utara 21 otomatis terdaftar sebagai peserta Tes Kemampuan Akademik (TKA).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold bg-emerald-50 text-emerald-800 px-3 py-2 rounded-xl border border-emerald-200">
                Total Siswa TKA: <strong>{tkaStudents.length} Siswa</strong>
              </span>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Filter className="w-4 h-4 text-slate-500" /> Filter Rombel:
              </div>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none"
              >
                <option value="all">Semua Rombel (Kelas 6A & 6B)</option>
                <option value="Kelas 6A">Hanya Kelas 6A</option>
                <option value="Kelas 6B">Hanya Kelas 6B</option>
              </select>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchStudent}
                onChange={(e) => setSearchStudent(e.target.value)}
                placeholder="Cari nama atau NISN peserta TKA..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none"
              />
            </div>
          </div>

          {/* Student Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-extrabold text-xs">
                  <th className="p-3 w-10 text-center">No</th>
                  <th className="p-3">Foto & Nama Peserta Didik</th>
                  <th className="p-3">NISN / No. Peserta</th>
                  <th className="p-3 text-center">Rombel</th>
                  <th className="p-3 text-center">Agama</th>
                  <th className="p-3 text-center">Status Kepesertaan TKA</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayTkaStudents.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={s.fotoUrl}
                          alt={s.nama}
                          onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200 cursor-zoom-in"
                        />
                        <div>
                          <div className="font-bold text-slate-900">{s.nama}</div>
                          <div className="text-[11px] font-mono text-rose-700 font-bold">{s.barcodeId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-700">{s.nisn}</td>
                    <td className="p-3 text-center font-bold text-slate-800">{s.kelas}</td>
                    <td className="p-3 text-center text-slate-600">{s.agama}</td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                        <CheckCircle className="w-3.5 h-3.5" /> Terdaftar Siap TKA
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleStartSim('Simulasi 1')}
                        className="text-xs text-amber-600 hover:text-amber-800 font-bold hover:underline"
                      >
                        Ikut Simulasi &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= 2. SUB-MENU CP & TP TKA ================= */}
      {subType === 'cp-tp-tka' && (
        <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                Menu TKA • Standar Kompetensi
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                <Compass className="w-5 h-5 text-amber-600" /> CP & TP TKA (Capaian & Tujuan Pembelajaran Anak TKA)
              </h2>
              <p className="text-xs text-slate-500">
                Data Capaian Pembelajaran (CP) dan Tujuan Pembelajaran (TP) khusus persiapan Tes Kemampuan Akademik (TKA) Kelas 6.
              </p>
            </div>
          </div>

          {/* Form Tambah CP & TP TKA */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCpKode || !newCpJudul) return;
              const newCpObj: TKACpTp = {
                id: `cp_tka_${Date.now()}`,
                kodeCp: newCpKode,
                judulCp: newCpJudul,
                deskripsiCp: newCpDesc || newCpJudul,
                mapel: newCpMapel,
                tpList: newTpJudul
                  ? [
                      {
                        id: `tp_${Date.now()}`,
                        kodeTp: `${newCpKode}-01`,
                        judulTp: newTpJudul,
                      },
                    ]
                  : [],
              };
              const updated = [...cpTpList, newCpObj];
              setCpTpList(updated);
              saveStoredTKACpTp(updated);
              showToast('Capaian Pembelajaran (CP) TKA berhasil ditambahkan!', 'success');
              setNewCpKode('');
              setNewCpJudul('');
              setNewCpDesc('');
              setNewTpJudul('');
            }}
            className="bg-amber-50/50 p-5 rounded-3xl border border-amber-200 space-y-4"
          >
            <h3 className="font-display font-black text-sm text-amber-950 flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-600" /> Tambah CP & TP TKA Baru
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Kode CP:</label>
                <input
                  type="text"
                  value={newCpKode}
                  onChange={(e) => setNewCpKode(e.target.value)}
                  required
                  placeholder="Contoh: CP-TKA-LIT-02"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Bidang / Mata Pelajaran:</label>
                <select
                  value={newCpMapel}
                  onChange={(e) => setNewCpMapel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-extrabold"
                >
                  {TKA_MAPEL_LIST.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Judul Capaian Pembelajaran (CP):</label>
                <input
                  type="text"
                  value={newCpJudul}
                  onChange={(e) => setNewCpJudul(e.target.value)}
                  required
                  placeholder="Contoh: Literasi Membaca Kritis"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Deskripsi Lengkap CP TKA:</label>
                <input
                  type="text"
                  value={newCpDesc}
                  onChange={(e) => setNewCpDesc(e.target.value)}
                  placeholder="Deskripsi kompetensi yang diharapkan..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Tujuan Pembelajaran (TP) Pertama:</label>
                <input
                  type="text"
                  value={newTpJudul}
                  onChange={(e) => setNewTpJudul(e.target.value)}
                  placeholder="Contoh: Menemukan ide pokok paragraf"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="bg-amber-600 hover:bg-amber-700 text-white font-display font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" /> Simpan CP & TP TKA
              </button>
            </div>
          </form>

          {/* List of CP & TP TKA */}
          <div className="space-y-4">
            {cpTpList.map((cp) => (
              <div key={cp.id} className="p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-black uppercase bg-amber-200 text-amber-950 px-2.5 py-0.5 rounded-full">
                      {cp.kodeCp}
                    </span>
                    <span className="text-xs font-bold text-slate-500">• {cp.mapel}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {editingCpId === cp.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (!editCpJudul.trim()) return;
                            const updated = cpTpList.map((c) =>
                              c.id === cp.id ? { ...c, judulCp: editCpJudul.trim(), deskripsiCp: editCpDesc.trim() || editCpJudul.trim() } : c
                            );
                            setCpTpList(updated);
                            saveStoredTKACpTp(updated);
                            setEditingCpId(null);
                            showToast('Perubahan CP TKA berhasil disimpan!', 'success');
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" /> Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCpId(null)}
                          className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCpId(cp.id);
                          setEditCpJudul(cp.judulCp);
                          setEditCpDesc(cp.deskripsiCp);
                        }}
                        className="text-amber-700 hover:text-amber-800 p-1.5 rounded-lg hover:bg-amber-100/60 transition flex items-center gap-1 text-xs font-bold cursor-pointer"
                        title="Edit CP TKA"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit CP
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Hapus CP TKA "${cp.judulCp}" beserta seluruh TP di dalamnya?`)) {
                          const updated = cpTpList.filter((c) => c.id !== cp.id);
                          setCpTpList(updated);
                          saveStoredTKACpTp(updated);
                          showToast('CP TKA berhasil dihapus', 'success');
                        }
                      }}
                      className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                      title="Hapus CP"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {editingCpId === cp.id ? (
                  <div className="space-y-2 bg-white p-3.5 rounded-2xl border border-amber-300">
                    <label className="text-xs font-bold text-amber-900 block">Edit Judul CP:</label>
                    <input
                      type="text"
                      value={editCpJudul}
                      onChange={(e) => setEditCpJudul(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold"
                    />
                    <label className="text-xs font-bold text-amber-900 block pt-1">Edit Deskripsi CP:</label>
                    <textarea
                      rows={2}
                      value={editCpDesc}
                      onChange={(e) => setEditCpDesc(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>
                ) : (
                  <>
                    <h3 className="font-display font-black text-base text-slate-900">{cp.judulCp}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed bg-white p-3 rounded-xl border border-slate-200">
                      {cp.deskripsiCp}
                    </p>
                  </>
                )}

                {/* TP Section with Edit, Add & Delete */}
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase text-amber-900">
                      Daftar Tujuan Pembelajaran (TP) TKA Terkait:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingTpForCpId(addingTpForCpId === cp.id ? null : cp.id);
                        setNewTpJudulForCp('');
                      }}
                      className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer bg-amber-100/60 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition"
                    >
                      <Plus className="w-3.5 h-3.5" /> + Tambah TP
                    </button>
                  </div>

                  {/* Form inline add TP */}
                  {addingTpForCpId === cp.id && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 flex flex-wrap gap-2 items-center">
                      <input
                        type="text"
                        value={newTpJudulForCp}
                        onChange={(e) => setNewTpJudulForCp(e.target.value)}
                        placeholder="Tuliskan tujuan pembelajaran (TP) baru..."
                        className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newTpJudulForCp.trim()) return;
                          const newTp = {
                            id: `tp_${Date.now()}`,
                            kodeTp: `TP${(cp.tpList?.length || 0) + 1}`,
                            judulTp: newTpJudulForCp.trim(),
                          };
                          const updated = cpTpList.map((c) =>
                            c.id === cp.id ? { ...c, tpList: [...(c.tpList || []), newTp] } : c
                          );
                          setCpTpList(updated);
                          saveStoredTKACpTp(updated);
                          setAddingTpForCpId(null);
                          setNewTpJudulForCp('');
                          showToast('Tujuan Pembelajaran (TP) berhasil ditambahkan!', 'success');
                        }}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Simpan TP
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingTpForCpId(null)}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  )}

                  {cp.tpList && cp.tpList.length > 0 ? (
                    <div className="space-y-1.5">
                      {cp.tpList.map((tp) => (
                        <div
                          key={tp.id}
                          className="text-xs flex items-center justify-between gap-2 text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200"
                        >
                          {editingTpId === tp.id ? (
                            <div className="flex-1 flex items-center gap-2">
                              <span className="font-mono font-bold text-amber-700">{tp.kodeTp}:</span>
                              <input
                                type="text"
                                value={editTpJudul}
                                onChange={(e) => setEditTpJudul(e.target.value)}
                                className="flex-1 px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (!editTpJudul.trim()) return;
                                  const updated = cpTpList.map((c) => {
                                    if (c.id === cp.id) {
                                      return {
                                        ...c,
                                        tpList: (c.tpList || []).map((t) =>
                                          t.id === tp.id ? { ...t, judulTp: editTpJudul.trim() } : t
                                        ),
                                      };
                                    }
                                    return c;
                                  });
                                  setCpTpList(updated);
                                  saveStoredTKACpTp(updated);
                                  setEditingTpId(null);
                                  showToast('Perubahan TP berhasil disimpan!', 'success');
                                }}
                                className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-bold cursor-pointer"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTpId(null)}
                                className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs font-bold cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 flex-1">
                                <span className="font-mono font-bold text-amber-700">{tp.kodeTp}:</span>
                                <span>{tp.judulTp}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTpId(tp.id);
                                    setEditTpJudul(tp.judulTp);
                                  }}
                                  className="text-amber-700 hover:text-amber-900 p-1 hover:bg-amber-50 rounded"
                                  title="Edit TP"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Hapus TP "${tp.judulTp}"?`)) {
                                      const updated = cpTpList.map((c) => {
                                        if (c.id === cp.id) {
                                          return {
                                            ...c,
                                            tpList: (c.tpList || []).filter((t) => t.id !== tp.id),
                                          };
                                        }
                                        return c;
                                      });
                                      setCpTpList(updated);
                                      saveStoredTKACpTp(updated);
                                      showToast('TP berhasil dihapus', 'success');
                                    }
                                  }}
                                  className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded"
                                  title="Hapus TP"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Belum ada Tujuan Pembelajaran (TP) untuk CP ini.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 3. SUB-MENU BANK SOAL TKA (IMAGE 1 EXACT DESIGN) ================= */}
      {subType === 'bank-soal-tka' && (
        <div className="space-y-6">
          {/* Header & Quick Action Buttons */}
          <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                Menu TKA • Bank Soal & Simulasi
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                <FileQuestion className="w-5 h-5 text-amber-600" /> Bank Soal TKA (Simulasi 1 – 6 & Try Out 1 – 6)
              </h2>
              <p className="text-xs text-slate-500 max-w-3xl">
                Desain form pembuatan butir soal TKA yang disinkronkan dengan data CP & TP TKA. Mendukung 6 tipe soal, konversi pecahan EYD V, toleransi alternatif tanda "/", dan import soal Excel.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplateTkaXLSX}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-600" /> Template Excel (.XLSX)
              </button>
              <label className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition">
                <Upload className="w-4 h-4" /> Import Soal TKA
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportTkaQuestions} className="hidden" />
              </label>
            </div>
          </div>

          {/* CBT Launcher Bar for Simulasi 1 - 6 & Try Out 1 - 6 */}
          {!isSimulationRunning && !simResult && (
            <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500 via-rose-600 to-red-600 text-white shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase bg-white/20 px-2.5 py-0.5 rounded-full border border-white/30">
                    CBT Player TKA
                  </span>
                  <h3 className="font-display font-black text-base sm:text-lg mt-1">
                    Mulai Simulasi & Try Out CBT TKA
                  </h3>
                </div>
                <span className="text-xs text-amber-200 font-bold hidden sm:inline">Pilih Paket Ujian di Bawah</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {TKA_JENIS_LIST.map((jenis) => {
                  const count = tkaQuestions.filter((q) => q.jenisTka === jenis).length;
                  return (
                    <button
                      key={jenis}
                      type="button"
                      onClick={() => handleStartSim(jenis)}
                      className="px-3.5 py-2 rounded-xl bg-white text-slate-800 hover:bg-amber-100 font-display font-black text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-amber-600" />
                      <span>{jenis}</span>
                      <span className="text-[10px] font-mono text-slate-500 font-bold">({count} soal)</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Running Simulation Interface */}
          {isSimulationRunning && curSimQ && (
            <div className="p-6 rounded-3xl bg-slate-50 border-2 border-amber-500 space-y-5 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                    Ujian TKA Sedang Berjalan
                  </span>
                  <h3 className="font-display font-black text-base text-slate-800 mt-1">{simJenis} - TKA SD</h3>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-rose-50 text-rose-700 px-3 py-1.5 rounded-xl border border-rose-200 font-mono font-black text-sm">
                    <Clock className="w-4 h-4" />
                    <span>
                      {Math.floor(simTimeLeft / 60)}:{String(simTimeLeft % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmitSim}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs cursor-pointer shadow-xs"
                  >
                    Kirim & Selesai Ujian
                  </button>
                </div>
              </div>

              {/* Navigator */}
              <div className="flex flex-wrap gap-2 bg-white p-3 rounded-2xl border border-slate-200">
                {simulationQuestions.map((q, idx) => {
                  const isAnswered = simAnswers[q.id] !== undefined && simAnswers[q.id] !== '';
                  const isCurrent = idx === simQuestionIdx;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setSimQuestionIdx(idx)}
                      className={`w-9 h-9 rounded-xl font-display font-black text-xs transition cursor-pointer border ${
                        isCurrent
                          ? 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-300'
                          : isAnswered
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Question Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                    Soal No. {simQuestionIdx + 1} ({curSimQ.tipe.toUpperCase()}) • {curSimQ.mapel}
                  </span>
                  <span className="text-xs font-bold text-slate-500 font-mono">Bobot: {curSimQ.bobot} Poin</span>
                </div>

                {(curSimQ.gambarUrl || curSimQ.gambarUrl2) && (
                  <div className={`grid gap-3 mx-auto ${curSimQ.gambarUrl && curSimQ.gambarUrl2 ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl' : 'grid-cols-1 max-w-lg'}`}>
                    {curSimQ.gambarUrl && (
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-500 mb-1">Gambar 1</span>
                        <img
                          src={curSimQ.gambarUrl}
                          alt="Gambar 1 Soal"
                          className="max-h-56 rounded-xl border border-slate-200 object-contain w-full bg-slate-50 cursor-pointer hover:opacity-90 transition"
                          onClick={() => onOpenZoom(curSimQ.gambarUrl!, 'Gambar 1 Soal TKA')}
                        />
                      </div>
                    )}
                    {curSimQ.gambarUrl2 && (
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-500 mb-1">Gambar 2 (Bersebelahan)</span>
                        <img
                          src={curSimQ.gambarUrl2}
                          alt="Gambar 2 Soal"
                          className="max-h-56 rounded-xl border border-slate-200 object-contain w-full bg-slate-50 cursor-pointer hover:opacity-90 transition"
                          onClick={() => onOpenZoom(curSimQ.gambarUrl2!, 'Gambar 2 Soal TKA')}
                        />
                      </div>
                    )}
                  </div>
                )}

                <p className="text-sm font-bold text-slate-900 leading-relaxed">{curSimQ.pertanyaan}</p>

                {/* Input Answer */}
                <div className="pt-2">
                  {curSimQ.tipe === 'isian' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={simAnswers[curSimQ.id] || ''}
                        onChange={(e) => setSimAnswers({ ...simAnswers, [curSimQ.id]: e.target.value })}
                        placeholder="Ketik jawaban singkat Anda di sini..."
                        className="w-full p-3 rounded-xl border-2 border-slate-300 focus:border-amber-500 text-xs font-bold text-slate-800 outline-none"
                      />
                      <span className="text-[11px] text-slate-500 block">
                        💡 Tips TKA: Huruf besar/kecil, variasi spasi, atau salah satu opsi tanda "/" (misal: ayah, ibu, orang tua) otomatis diterima benar.
                      </span>
                    </div>
                  )}

                  {curSimQ.tipe === 'pg' && curSimQ.opsi && (
                    <div className="space-y-2">
                      {curSimQ.opsi.map((op, oIdx) => {
                        const optKey = ['A', 'B', 'C', 'D'][oIdx];
                        const optImg = curSimQ.opsiGambar?.[optKey];
                        return (
                          <label
                            key={oIdx}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition cursor-pointer ${
                              simAnswers[curSimQ.id] === optKey || simAnswers[curSimQ.id] === op
                                ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold'
                                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio"
                                name={`sim_q_${curSimQ.id}`}
                                value={optKey}
                                checked={simAnswers[curSimQ.id] === optKey || simAnswers[curSimQ.id] === op}
                                onChange={() => setSimAnswers({ ...simAnswers, [curSimQ.id]: optKey })}
                                className="w-4 h-4 text-amber-600"
                              />
                              <span className="font-mono font-bold">{optKey}.</span>
                              <span className="text-xs">{op}</span>
                            </div>
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar Opsi ${optKey}`}
                                className="h-16 w-auto max-w-[140px] rounded-lg border border-slate-300 object-contain bg-white cursor-pointer hover:opacity-90"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenZoom(optImg, `Gambar Opsi ${optKey}`);
                                }}
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {curSimQ.tipe === 'pg_kompleks' && curSimQ.opsi && (
                    <div className="space-y-2">
                      {curSimQ.opsi.map((op, oIdx) => {
                        const optKey = ['A', 'B', 'C', 'D'][oIdx];
                        const optImg = curSimQ.opsiGambar?.[optKey];
                        const list: string[] = simAnswers[curSimQ.id] || [];
                        const checked = list.includes(optKey) || list.includes(op);
                        return (
                          <label
                            key={oIdx}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition cursor-pointer ${
                              checked
                                ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold'
                                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...list, optKey]
                                    : list.filter((x) => x !== optKey && x !== op);
                                  setSimAnswers({ ...simAnswers, [curSimQ.id]: next });
                                }}
                                className="w-4 h-4 text-amber-600"
                              />
                              <span className="font-mono font-bold">{optKey}.</span>
                              <span className="text-xs">{op}</span>
                            </div>
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar Opsi ${optKey}`}
                                className="h-16 w-auto max-w-[140px] rounded-lg border border-slate-300 object-contain bg-white cursor-pointer hover:opacity-90"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenZoom(optImg, `Gambar Opsi ${optKey}`);
                                }}
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {curSimQ.tipe === 'benar_salah' && (
                    <div className="flex gap-4">
                      {['Benar', 'Salah'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setSimAnswers({ ...simAnswers, [curSimQ.id]: val })}
                          className={`flex-1 py-3 rounded-xl border-2 font-display font-extrabold text-sm transition cursor-pointer ${
                            simAnswers[curSimQ.id] === val
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  )}

                  {(curSimQ.tipe === 'uraian' || curSimQ.tipe === 'menjodohkan') && (
                    <textarea
                      rows={3}
                      value={simAnswers[curSimQ.id] || ''}
                      onChange={(e) => setSimAnswers({ ...simAnswers, [curSimQ.id]: e.target.value })}
                      placeholder="Ketik jawaban Anda..."
                      className="w-full p-3 rounded-xl border border-slate-300 text-xs font-medium outline-none focus:border-amber-500"
                    />
                  )}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex justify-between">
                <button
                  type="button"
                  disabled={simQuestionIdx === 0}
                  onClick={() => setSimQuestionIdx((prev) => prev - 1)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
                >
                  &larr; Soal Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={simQuestionIdx === simulationQuestions.length - 1}
                  onClick={() => setSimQuestionIdx((prev) => prev + 1)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
                >
                  Soal Berikutnya &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Simulation Result */}
          {simResult && (
            <div className="p-6 rounded-3xl bg-amber-50 border-2 border-amber-300 space-y-4">
              <div className="text-center space-y-2">
                <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" />
                <h3 className="text-xl font-display font-black text-slate-900">
                  Hasil CBT {simJenis} Telah Dinilai Otomatis
                </h3>
                <div className="text-4xl font-display font-black text-amber-700">
                  Nilai: {simResult.score} / {simResult.max}
                </div>
                <p className="text-xs text-slate-600">
                  Sistem telah memeriksa jawaban dengan toleransi huruf besar/kecil, spasi, dan jawaban alternatif tanda "/".
                </p>
                <button
                  type="button"
                  onClick={() => setSimResult(null)}
                  className="bg-amber-600 text-white font-display font-bold px-5 py-2.5 rounded-2xl text-xs cursor-pointer shadow-xs"
                >
                  Selesai & Tutup Pratinjau Nilai
                </button>
              </div>

              <div className="space-y-2 pt-2 border-t border-amber-200">
                <h4 className="font-display font-black text-xs uppercase text-slate-700">Detail Koreksi Jawaban:</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {simResult.details.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                        item.isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-800">No. {idx + 1}: {item.question.pertanyaan}</div>
                        <div className="text-[11px] text-slate-600">
                          Jawaban Siswa: <strong>{String(item.userAnswer || '-')}</strong> • Kunci: <strong>{String(item.question.kunciJawaban)}</strong>
                        </div>
                      </div>
                      <span className={`font-mono font-black text-xs shrink-0 ${item.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {item.score} / {item.question.bobot} Poin
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================= EXACT REFERENCE FORM: IMAGE 1 ================= */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-5">
            {/* Row 1: Top Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3.5">
              {/* Paket / Jenis Ulangan with red rounded border */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Paket / Jenis TKA</label>
                </div>
                <select
                  value={formPaket}
                  onChange={(e) => setFormPaket(e.target.value as TKAJenis)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-rose-500 bg-white text-xs font-bold text-rose-700 outline-none focus:ring-2 focus:ring-rose-200 transition"
                >
                  {TKA_JENIS_LIST.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Mata Pelajaran */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
                <select
                  value={formMapel}
                  onChange={(e) => setFormMapel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400"
                >
                  {TKA_MAPEL_LIST.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Target Kelas */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Kelas</label>
                <select
                  value={formTargetKelas}
                  onChange={(e) => setFormTargetKelas(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400"
                >
                  <option value="Kelas 6A">Kelas 6A</option>
                  <option value="Kelas 6B">Kelas 6B</option>
                  <option value="Gabungan Kelas 6">Gabungan TKA (6A & 6B)</option>
                </select>
              </div>

              {/* Pilih TP yang Diukur with blue rounded border */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih TP yang Diukur</label>
                <select
                  value={formTpIndex}
                  onChange={(e) => setFormTpIndex(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border-2 border-sky-400 bg-white text-xs font-bold text-sky-800 outline-none focus:ring-2 focus:ring-sky-200 transition"
                >
                  {activeCp?.tpList && activeCp.tpList.length > 0 ? (
                    activeCp.tpList.map((tp, idx) => (
                      <option key={tp.id} value={idx}>
                        {tp.kodeTp || `TP ${idx + 1}`}
                      </option>
                    ))
                  ) : (
                    <option value={0}>TP 1</option>
                  )}
                </select>
              </div>

              {/* Tipe Soal (6 Tipe) */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Soal (6 Tipe)</label>
                <select
                  value={formTipe}
                  onChange={(e) => setFormTipe(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400"
                >
                  <option value="pg">Pilihan Ganda (PG)</option>
                  <option value="pg_kompleks">Pilihan Ganda Kompleks</option>
                  <option value="menjodohkan">Menjodohkan</option>
                  <option value="isian">Isian Singkat (Mendukung "/")</option>
                  <option value="uraian">Uraian</option>
                  <option value="benar_salah">Benar / Salah</option>
                </select>
              </div>

              {/* Level Soal & Kognitif (Sedang | L2 (C3)) */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Level Soal & Kognitif</label>
                <div className="flex gap-1.5">
                  <select
                    value={formKesukaran}
                    onChange={(e) => setFormKesukaran(e.target.value as any)}
                    className="w-1/2 px-2 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400"
                  >
                    <option value="Mudah">Mudah</option>
                    <option value="Sedang">Sedang</option>
                    <option value="Sukar">Sukar</option>
                  </select>
                  <select
                    value={formKognitif}
                    onChange={(e) => setFormKognitif(e.target.value)}
                    className="w-1/2 px-2 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400"
                  >
                    <option value="L1 (C1-C2)">L1 (C1-C2)</option>
                    <option value="L2 (C3)">L2 (C3)</option>
                    <option value="L3 (C4-C6)">L3 (C4-C6)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Row 2: Red/Rose Bordered Card for CP & TP (Exact Image 1) */}
            <div className="p-4 sm:p-5 rounded-2xl border-2 border-rose-200 bg-rose-50/20 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Column Left: Kompetensi (Pilih Dropdown CP) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                      <BookOpen className="w-4 h-4 text-rose-600" />
                      <span>Kompetensi (Pilih Dropdown CP)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddCpModal(true)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200"
                    >
                      <Plus className="w-3 h-3" /> Tambah CP
                    </button>
                  </div>

                  <select
                    value={selectedCpId}
                    onChange={(e) => {
                      setSelectedCpId(e.target.value);
                      setFormTpIndex(0);
                    }}
                    className="w-full px-3 py-2 rounded-xl border-2 border-rose-400 bg-white text-xs font-semibold text-rose-800 outline-none focus:ring-2 focus:ring-rose-200"
                  >
                    {cpTpList.map((cp, idx) => (
                      <option key={cp.id} value={cp.id}>
                        CP {idx + 1}: [{formTargetKelas} • TKA] {cp.judulCp}
                      </option>
                    ))}
                  </select>

                  <textarea
                    rows={3}
                    readOnly
                    value={`[${formTargetKelas} • Fase C • TKA 2026/2027] ${activeCp?.deskripsiCp || activeCp?.judulCp || ''}`}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs text-slate-700 font-medium resize-none leading-relaxed"
                  />
                </div>

                {/* Column Right: Sub Kompetensi (Otomatis dari Tujuan Pembelajaran / TP) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-sky-800">
                      <CheckSquare className="w-4 h-4 text-sky-600" />
                      <span>Sub Kompetensi (Otomatis dari Tujuan Pembelajaran / TP)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowAddTpModal(true)}
                        className="text-[11px] font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 cursor-pointer bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200"
                      >
                        <Plus className="w-3 h-3" /> Tambah TP
                      </button>
                      <span className="text-[10px] font-mono font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-md">
                        {activeTp?.kodeTp || `TP${formTpIndex + 1}`}
                      </span>
                    </div>
                  </div>

                  <textarea
                    rows={4}
                    readOnly
                    value={`[${formTargetKelas}] ${activeTp?.judulTp || activeCp?.judulCp || ''}`}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs text-slate-700 font-medium resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Question Textarea + Fraction Converter + Upload Image + Green Point Box */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Question Textarea Column */}
              <div className="lg:col-span-8 space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Pertanyaan / Butir Soal (Otomatis EYD V Pecahan saat Disimpan)
                  </label>
                  <button
                    type="button"
                    onClick={handleApplyFractionConvert}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>🔤</span> Ubah Pecahan (1/3 → satu pertiga)
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={formPertanyaan}
                  onChange={(e) => setFormPertanyaan(e.target.value)}
                  placeholder="Tuliskan pertanyaan soal (contoh ketik 1/3 otomatis menjadi satu pertiga sesuai PUEBI / EYD V saat disimpan)..."
                  className="w-full p-3 rounded-2xl border border-slate-300 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-rose-400 leading-relaxed"
                />
              </div>

              {/* Upload Gambar Column: 2 Slots (Side-by-Side) */}
              <div className="lg:col-span-4 space-y-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  Upload Gambar Soal (Maks. 2 Gambar Bersebelahan):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {/* Gambar 1 */}
                  <div className="p-2 rounded-xl border border-slate-200 bg-white space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-600 block">Gambar 1 (Kiri)</span>
                    <label className="inline-flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg cursor-pointer shadow-xs transition w-full justify-center">
                      <ImageIcon className="w-3.5 h-3.5" /> Pilih File
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    {formGambarUrl && (
                      <div className="relative mt-1">
                        <img
                          src={formGambarUrl}
                          alt="Preview Gambar 1"
                          className="w-full h-14 object-contain rounded-lg border border-slate-200 bg-slate-50 cursor-pointer"
                          onClick={() => onOpenZoom(formGambarUrl, 'Preview Gambar 1 Soal')}
                        />
                        <button
                          type="button"
                          onClick={() => setFormGambarUrl(null)}
                          className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 text-[10px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Gambar 2 */}
                  <div className="p-2 rounded-xl border border-slate-200 bg-white space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-600 block">Gambar 2 (Kanan)</span>
                    <label className="inline-flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg cursor-pointer shadow-xs transition w-full justify-center">
                      <ImageIcon className="w-3.5 h-3.5" /> Pilih File
                      <input type="file" accept="image/*" onChange={handleImageUpload2} className="hidden" />
                    </label>
                    {formGambarUrl2 && (
                      <div className="relative mt-1">
                        <img
                          src={formGambarUrl2}
                          alt="Preview Gambar 2"
                          className="w-full h-14 object-contain rounded-lg border border-slate-200 bg-slate-50 cursor-pointer"
                          onClick={() => onOpenZoom(formGambarUrl2, 'Preview Gambar 2 Soal')}
                        />
                        <button
                          type="button"
                          onClick={() => setFormGambarUrl2(null)}
                          className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 text-[10px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Green Point Box (⭐ Menu Point Nilai Kanan Soal) */}
              <div className="lg:col-span-2">
                <div className="p-3 rounded-2xl border-2 border-emerald-400 bg-emerald-50/30 text-center space-y-1">
                  <div className="text-xs font-bold text-emerald-800 flex items-center justify-center gap-1">
                    <span>⭐</span> Menu Point Nilai
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={formBobot}
                      onChange={(e) => setFormBobot(Number(e.target.value))}
                      className="w-20 text-center text-xl font-display font-black text-slate-900 border-2 border-emerald-500 rounded-xl py-1 bg-white outline-none"
                    />
                    <span className="text-xs font-bold text-slate-700">Poin</span>
                  </div>
                  <p className="text-[10px] text-emerald-700 font-medium">Bobot skor soal</p>
                </div>
              </div>
            </div>

            {/* Row 4: Answer Options Form based on Question Type */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
              {formTipe === 'pg' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Pilihan Jawaban (Pilih 1 Kunci Benar & bisa tambahkan gambar tiap opsi):</span>
                    <span className="text-[11px] text-slate-500 font-medium">Klik ikon gambar untuk upload gambar pada opsi</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { key: 'A', val: pgOptionA, setVal: setPgOptionA },
                      { key: 'B', val: pgOptionB, setVal: setPgOptionB },
                      { key: 'C', val: pgOptionC, setVal: setPgOptionC },
                      { key: 'D', val: pgOptionD, setVal: setPgOptionD },
                    ].map(({ key, val, setVal }) => (
                      <div key={key} className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id={`tka_kunci_${key.toLowerCase()}`}
                            name="tka_pg_kunci"
                            checked={pgKunci === key}
                            onChange={() => setPgKunci(key as any)}
                            className="w-4 h-4 text-rose-600 cursor-pointer"
                          />
                          <label htmlFor={`tka_kunci_${key.toLowerCase()}`} className="text-xs font-bold text-slate-700 w-4">
                            {key}.
                          </label>
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => setVal(e.target.value)}
                            placeholder={`Teks Opsi ${key}`}
                            className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:border-rose-400"
                          />
                          <label className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer transition" title={`Upload Gambar Opsi ${key}`}>
                            <ImageIcon className="w-4 h-4 text-rose-600" />
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleOptionImageUpload(key, f);
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {formOpsiGambar[key] && (
                          <div className="flex items-center gap-2 pl-6">
                            <img
                              src={formOpsiGambar[key]}
                              alt={`Gambar Opsi ${key}`}
                              className="h-12 w-auto max-w-[100px] rounded-lg border border-slate-300 object-contain bg-slate-50 cursor-pointer"
                              onClick={() => onOpenZoom(formOpsiGambar[key], `Preview Opsi ${key}`)}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOptionImage(key)}
                              className="text-[11px] text-red-600 hover:underline cursor-pointer"
                            >
                              Hapus Gambar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formTipe === 'pg_kompleks' && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-700">Pilihan Jawaban Kompleks (Centang Semua Kunci Benar & gambar opsi):</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {['A', 'B', 'C', 'D'].map((key) => {
                      const val = key === 'A' ? pgOptionA : key === 'B' ? pgOptionB : key === 'C' ? pgOptionC : pgOptionD;
                      const setVal = key === 'A' ? setPgOptionA : key === 'B' ? setPgOptionB : key === 'C' ? setPgOptionC : setPgOptionD;
                      return (
                        <div key={key} className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={pgkChecks[key] || false}
                              onChange={(e) => setPgkChecks({ ...pgkChecks, [key]: e.target.checked })}
                              className="w-4 h-4 text-rose-600 rounded cursor-pointer"
                            />
                            <span className="text-xs font-bold text-slate-700 w-4">{key}.</span>
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => setVal(e.target.value)}
                              placeholder={`Teks Opsi ${key}`}
                              className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:border-rose-400"
                            />
                            <label className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer transition" title={`Upload Gambar Opsi ${key}`}>
                              <ImageIcon className="w-4 h-4 text-rose-600" />
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleOptionImageUpload(key, f);
                                }}
                                className="hidden"
                              />
                            </label>
                          </div>
                          {formOpsiGambar[key] && (
                            <div className="flex items-center gap-2 pl-6">
                              <img
                                src={formOpsiGambar[key]}
                                alt={`Gambar Opsi ${key}`}
                                className="h-12 w-auto max-w-[100px] rounded-lg border border-slate-300 object-contain bg-slate-50 cursor-pointer"
                                onClick={() => onOpenZoom(formOpsiGambar[key], `Preview Opsi ${key}`)}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveOptionImage(key)}
                                className="text-[11px] text-red-600 hover:underline cursor-pointer"
                              >
                                Hapus Gambar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {formTipe === 'benar_salah' && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700">Kunci Jawaban Pernyataan:</div>
                  <div className="flex gap-4">
                    {['Benar', 'Salah'].map((val) => (
                      <label key={val} className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                        <input
                          type="radio"
                          name="tka_bs_kunci"
                          checked={benarSalahKunci === val}
                          onChange={() => setBenarSalahKunci(val as any)}
                          className="w-4 h-4 text-rose-600"
                        />
                        <span>Pernyataan {val}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {formTipe === 'isian' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Kunci Jawaban Singkat (Gunakan tanda "/" untuk jawaban alternatif):
                    </label>
                    <span className="text-[11px] font-mono font-bold text-rose-600">
                      Toleransi huruf kapital & alternatif "/"
                    </span>
                  </div>
                  <input
                    type="text"
                    value={isianKunci}
                    onChange={(e) => setIsianKunci(e.target.value)}
                    placeholder="Contoh: Orang tua / ayah / ibu"
                    className="w-full px-3 py-2 rounded-xl border-2 border-rose-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-rose-500"
                  />
                  <p className="text-[11px] text-slate-500">
                    💡 <em>Contoh:</em> Jika siswa menjawab "ayah" atau "ibu" atau "orang tua" dengan huruf besar/kecil apapun, sistem otomatis menganggap jawaban benar.
                  </p>
                </div>
              )}

              {formTipe === 'uraian' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Rubrik / Kunci Uraian:</label>
                  <textarea
                    rows={2}
                    value={uraianKunci}
                    onChange={(e) => setUraianKunci(e.target.value)}
                    placeholder="Tuliskan kata kunci atau pedoman penskoran uraian..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:border-rose-400"
                  />
                </div>
              )}

              {formTipe === 'menjodohkan' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Pasangan Jawaban Menjodohkan (Format Kiri = Kanan, pisahkan dengan koma):</label>
                  <input
                    type="text"
                    value={menjodohkanKunci}
                    onChange={(e) => setMenjodohkanKunci(e.target.value)}
                    placeholder="Contoh: Jakarta = Ibukota, Bandung = Jawa Barat"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:border-rose-400"
                  />
                </div>
              )}
            </div>

            {/* Row 5: Action Buttons matching Image 1 */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-5 py-2.5 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition"
              >
                Batal / Reset
              </button>
              <button
                type="button"
                onClick={handleSaveTkaQuestion}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-md transition"
              >
                <span>💾</span> Simpan ke Bank Soal
              </button>
            </div>
          </div>

          {/* ================= LIST OF CREATED TKA QUESTIONS (UNDERNEATH THE FORM) ================= */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-display font-black text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-amber-600" />
                  Daftar Soal TKA yang Sudah Dibuat
                </h3>
                <p className="text-xs text-slate-500">
                  Seluruh butir soal yang telah tersimpan di bank soal TKA SDN Rawa Badak Utara 21.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter Paket:
                </div>
                <select
                  value={filterJenisTka}
                  onChange={(e) => setFilterJenisTka(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-amber-900"
                >
                  <option value="all">Semua Paket TKA</option>
                  {TKA_JENIS_LIST.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                <select
                  value={filterMapelTka}
                  onChange={(e) => setFilterMapelTka(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700"
                >
                  <option value="all">Semua Mapel TKA</option>
                  {TKA_MAPEL_LIST.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <span className="text-xs font-bold bg-amber-50 text-amber-900 px-3 py-1.5 rounded-xl border border-amber-200">
                  Total: <strong>{filteredTkaQuestions.length} Soal</strong>
                </span>
              </div>
            </div>

            {/* Cards for each created TKA Question */}
            <div className="space-y-3.5">
              {filteredTkaQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-amber-400 transition bg-white space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-black text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-black uppercase bg-rose-100 text-rose-900 px-2.5 py-0.5 rounded-full border border-rose-200">
                        {q.jenisTka}
                      </span>
                      <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-200">
                        {q.mapel}
                      </span>
                      <span className="text-xs font-extrabold uppercase bg-sky-100 text-sky-800 px-2 py-0.5 rounded-md">
                        {q.tipe.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                        Bobot: {q.bobot} Poin
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteTkaQuestion(q.id)}
                        className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="Hapus Butir Soal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {(q.gambarUrl || q.gambarUrl2) && (
                    <div className={`grid gap-3 pt-1 ${q.gambarUrl && q.gambarUrl2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-md'}`}>
                      {q.gambarUrl && (
                        <div className="flex flex-col items-start">
                          <span className="text-[10px] font-bold text-slate-500 mb-1">Gambar 1:</span>
                          <img
                            src={q.gambarUrl}
                            alt="Gambar 1 Soal"
                            className="max-h-48 rounded-xl border border-slate-200 object-contain w-full bg-slate-50 cursor-pointer hover:opacity-90"
                            onClick={() => onOpenZoom(q.gambarUrl!, 'Gambar 1 Soal TKA')}
                          />
                        </div>
                      )}
                      {q.gambarUrl2 && (
                        <div className="flex flex-col items-start">
                          <span className="text-[10px] font-bold text-slate-500 mb-1">Gambar 2 (Bersebelahan):</span>
                          <img
                            src={q.gambarUrl2}
                            alt="Gambar 2 Soal"
                            className="max-h-48 rounded-xl border border-slate-200 object-contain w-full bg-slate-50 cursor-pointer hover:opacity-90"
                            onClick={() => onOpenZoom(q.gambarUrl2!, 'Gambar 2 Soal TKA')}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-sm font-bold text-slate-900 leading-relaxed">{q.pertanyaan}</p>

                  {/* Options display */}
                  {q.opsi && q.opsi.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs text-slate-700">
                      {q.opsi.map((op, oIdx) => {
                        const optKey = ['A', 'B', 'C', 'D'][oIdx];
                        const optImg = q.opsiGambar?.[optKey];
                        const isKey =
                          Array.isArray(q.kunciJawaban)
                            ? q.kunciJawaban.includes(optKey) || q.kunciJawaban.includes(op)
                            : q.kunciJawaban === optKey || q.kunciJawaban === op;

                        return (
                          <div
                            key={oIdx}
                            className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
                              isKey
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black">{optKey}.</span>
                              <span className="flex-1">{op}</span>
                              {isKey && <span className="ml-auto text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">✓ Kunci</span>}
                            </div>
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar Opsi ${optKey}`}
                                className="h-14 w-auto max-w-[120px] rounded-lg border border-slate-300 object-contain bg-white cursor-pointer hover:opacity-90 mt-1"
                                onClick={() => onOpenZoom(optImg, `Gambar Opsi ${optKey}`)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Answer key footer */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-600">Kunci Jawaban: </span>
                      <span className="font-mono font-bold text-rose-700">
                        {Array.isArray(q.kunciJawaban) ? q.kunciJawaban.join(', ') : String(q.kunciJawaban)}
                      </span>
                    </div>
                    {q.pembahasan && (
                      <span className="text-[11px] text-slate-500 italic max-w-lg truncate">
                        {q.pembahasan}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {filteredTkaQuestions.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-400 italic bg-slate-50 rounded-2xl border">
                  Belum ada butir soal pada filter ini. Gunakan form di atas untuk menambahkan butir soal TKA.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= 4. SUB-MENU ANALISIS SOAL TKA ================= */}
      {subType === 'analisis-tka' && (() => {
        const filteredAnalisisQuestions = tkaQuestions.filter((q) => {
          if (analisisMapelTka !== 'all' && q.mapel !== analisisMapelTka) return false;
          if (analisisPaketTka !== 'all' && q.jenisTka !== analisisPaketTka) return false;
          return true;
        });

        const totalAnalisis = filteredAnalisisQuestions.length;

        // Submissions matching selected package (or all packages)
        const relevantSubmissions = tkaSubmissions.filter((s) => {
          if (analisisPaketTka !== 'all' && s.paket !== analisisPaketTka) return false;
          return true;
        });

        const totalPesertaSub = relevantSubmissions.length;

        const analisisList = filteredAnalisisQuestions.map((q) => {
          const rawKesukaran = (q as any).tingkatKesukaran || 'Sedang';
          if (totalPesertaSub === 0) {
            return {
              ...q,
              tkLabel: rawKesukaran,
              tkValue: rawKesukaran === 'Mudah' ? 0.75 : rawKesukaran === 'Sukar' ? 0.25 : 0.50,
              pct: 0,
              dpValue: 0,
              dpLabel: 'Belum Diuji',
              status: 'Kosong',
              pesertaCount: 0,
              correctCount: 0,
            };
          }

          let correctCount = 0;
          relevantSubmissions.forEach((sub) => {
            const studentAns = sub.answers ? sub.answers[q.id] : undefined;
            const evalResult = evaluateQuestionScore(q.tipe, studentAns, q.kunciJawaban, q.bobot || 10);
            if (evalResult.isCorrect) correctCount++;
          });

          const pct = Math.round((correctCount / totalPesertaSub) * 100);
          const tkValue = Number((correctCount / totalPesertaSub).toFixed(2));
          const tkLabel = pct >= 70 ? 'Mudah' : pct >= 30 ? 'Sedang' : 'Sukar';

          // Daya Pembeda: Upper half vs Lower half
          const sortedSubs = [...relevantSubmissions].sort((a, b) => b.skorTotal - a.skorTotal);
          const half = Math.max(1, Math.floor(sortedSubs.length / 2));
          const upperGroup = sortedSubs.slice(0, half);
          const lowerGroup = sortedSubs.slice(sortedSubs.length - half);

          let upperCorrect = 0;
          upperGroup.forEach((sub) => {
            const res = evaluateQuestionScore(q.tipe, sub.answers ? sub.answers[q.id] : undefined, q.kunciJawaban, q.bobot || 10);
            if (res.isCorrect) upperCorrect++;
          });

          let lowerCorrect = 0;
          lowerGroup.forEach((sub) => {
            const res = evaluateQuestionScore(q.tipe, sub.answers ? sub.answers[q.id] : undefined, q.kunciJawaban, q.bobot || 10);
            if (res.isCorrect) lowerCorrect++;
          });

          const dpValue = Number(((upperCorrect - lowerCorrect) / half).toFixed(2));
          const dpLabel = dpValue >= 0.40 ? 'Sangat Baik' : dpValue >= 0.20 ? 'Baik' : 'Perlu Revisi';
          const status = dpValue >= 0.20 ? 'Valid & Diterima' : 'Perlu Revisi';

          return {
            ...q,
            tkLabel,
            tkValue,
            pct,
            dpValue,
            dpLabel,
            status,
            pesertaCount: totalPesertaSub,
            correctCount,
          };
        });

        const countMudah = analisisList.filter((a) => a.tkLabel === 'Mudah').length;
        const countSedang = analisisList.filter((a) => a.tkLabel === 'Sedang').length;
        const countSukar = analisisList.filter((a) => a.tkLabel === 'Sukar').length;
        const avgPct = totalAnalisis > 0 && totalPesertaSub > 0
          ? Math.round(analisisList.reduce((acc, c) => acc + c.pct, 0) / totalAnalisis)
          : 0;

        const handleExportExcelTka = () => {
          const wsData = [
            ['ANALISIS BUTIR SOAL TES KEMAMPUAN AKADEMIK (TKA)'],
            ['SDN RAWA BADAK UTARA 21 - JAKARTA UTARA'],
            [`Mata Pelajaran: ${analisisMapelTka === 'all' ? 'Semua Mapel TKA' : analisisMapelTka}`],
            [`Paket TKA: ${analisisPaketTka === 'all' ? 'Semua Paket' : analisisPaketTka}`],
            [`Jumlah Siswa Mengerjakan: ${totalPesertaSub} Siswa`],
            [],
            ['No', 'Butir Pertanyaan TKA', 'Paket TKA', 'Mata Pelajaran', 'Tipe', 'Tingkat Kesukaran', 'Ketuntasan Siswa (%)', 'Daya Pembeda', 'Status Butir'],
            ...analisisList.map((q, idx) => [
              idx + 1,
              q.pertanyaan,
              q.jenisTka,
              q.mapel,
              q.tipe,
              q.tkLabel,
              `${q.pct}%`,
              q.dpValue,
              q.status,
            ]),
          ];

          const ws = XLSX.utils.aoa_to_sheet(wsData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Analisis TKA');
          XLSX.writeFile(wb, `Analisis_TKA_${analisisMapelTka.substring(0, 8)}_${analisisPaketTka}.xlsx`);
        };

        return (
          <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                  Menu TKA • Analitik & Evaluasi Soal
                </span>
                <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-amber-600" /> Analisis Butir Soal TKA & Grafik Ketuntasan
                </h2>
                <p className="text-xs text-slate-500">
                  Evaluasi tingkat kesukaran soal, daya pembeda, dan grafik ketuntasan peserta didik terkoneksi dengan hasil ujian siswa ({totalPesertaSub} siswa mengerjakan).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearSubmissions}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-display font-black px-3 py-2 rounded-xl text-xs border border-rose-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Kosongkan data analisis dan hasil TKA"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" /> Kosongkan Data
                </button>
                <button
                  type="button"
                  onClick={handleSeedSimulatedSubmissions}
                  className="bg-purple-50 hover:bg-purple-100 text-purple-800 font-display font-black px-3.5 py-2 rounded-xl text-xs border border-purple-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Simulasikan pengerjaan siswa 6A & 6B"
                >
                  <Sparkles className="w-4 h-4 text-purple-600" /> Simulasikan Siswa 6A &amp; 6B
                </button>
                <button
                  type="button"
                  onClick={handleExportExcelTka}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-900 font-display font-black px-3.5 py-2 rounded-xl text-xs border border-amber-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <FileSpreadsheet className="w-4 h-4 text-amber-700" /> Ekspor Excel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-display font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <Download className="w-4 h-4" /> Cetak
                </button>
              </div>
            </div>

            {totalPesertaSub === 0 && (
              <div className="bg-amber-50/80 p-4 rounded-2xl border-2 border-amber-300 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-lg">
                    ℹ️
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-900">Data Analisis TKA Saat Ini Masih Kosong</h4>
                    <p className="text-[11px] text-amber-800 font-medium">
                      Belum ada siswa yang mengerjakan soal pada paket ini. Siswa dapat login dan mengerjakan melalui menu <strong>"Tes Kemampuan Akademik (TKA)"</strong>, atau klik tombol di sebelah kanan untuk memuat simulasi pengerjaan.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSeedSimulatedSubmissions}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                >
                  <Sparkles className="w-4 h-4" /> Muat Simulasi Siswa 6A &amp; 6B
                </button>
              </div>
            )}

            {/* Filter Controls: Dropdown Mapel TKA & Dropdown Paket TKA */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center">
              <div className="md:col-span-6">
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Filter Mata Pelajaran TKA:
                </label>
                <select
                  value={analisisMapelTka}
                  onChange={(e) => setAnalisisMapelTka(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-amber-500 bg-white text-xs font-black text-slate-800 outline-none shadow-2xs cursor-pointer focus:ring-2 focus:ring-amber-200"
                >
                  <option value="all">Semua Mata Pelajaran TKA (4 Mapel)</option>
                  {TKA_MAPEL_LIST.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-6">
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Filter Paket / Jenis Soal TKA:
                </label>
                <select
                  value={analisisPaketTka}
                  onChange={(e) => setAnalisisPaketTka(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none shadow-2xs cursor-pointer focus:border-amber-500"
                >
                  <option value="all">Semua Paket (Simulasi 1 – 6 & Try Out 1 – 6)</option>
                  {TKA_JENIS_LIST.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <span className="text-xs font-bold text-amber-800 uppercase">Soal Teranalisis</span>
                <div className="text-2xl font-display font-black text-slate-900 mt-1">
                  {totalAnalisis} Butir
                </div>
                <span className="text-[11px] text-slate-500">
                  {analisisMapelTka === 'all' ? 'Seluruh Mapel TKA' : analisisMapelTka}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                <span className="text-xs font-bold text-emerald-800 uppercase">Rata-rata Ketuntasan</span>
                <div className="text-2xl font-display font-black text-emerald-700 mt-1">{avgPct}%</div>
                <span className="text-[11px] text-emerald-800">Siswa Kelas 6A & 6B</span>
              </div>
              <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200">
                <span className="text-xs font-bold text-sky-800 uppercase">Komposisi Kesukaran</span>
                <div className="text-sm font-black text-slate-800 mt-1.5 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs">{countMudah} Mudah</span>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">{countSedang} Sedang</span>
                  <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-xs">{countSukar} Sukar</span>
                </div>
                <span className="text-[11px] text-slate-500">Standar Ujian TKA</span>
              </div>
            </div>

            {/* GRAFIK DATA ANALISIS TKA */}
            <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                  <h3 className="font-display font-black text-sm text-slate-900">
                    Visualisasi Grafik Analisis Soal TKA
                  </h3>
                </div>

                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setAnalisisChartTab('kesukaran')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      analisisChartTab === 'kesukaran'
                        ? 'bg-amber-600 text-white font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tingkat Kesukaran
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalisisChartTab('ketuntasan')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      analisisChartTab === 'ketuntasan'
                        ? 'bg-amber-600 text-white font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Ketuntasan Siswa
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalisisChartTab('pembeda')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      analisisChartTab === 'pembeda'
                        ? 'bg-amber-600 text-white font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Daya Pembeda
                  </button>
                </div>
              </div>

              {/* Chart 1: Tingkat Kesukaran TKA */}
              {analisisChartTab === 'kesukaran' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  <div className="md:col-span-5 flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-200">
                    <div className="relative w-36 h-36 flex items-center justify-center">
                      <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                        <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#E2E8F0" strokeWidth="3.5" />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="transparent"
                          stroke="#10B981"
                          strokeWidth="3.8"
                          strokeDasharray={`${totalAnalisis > 0 ? Math.round((countMudah / totalAnalisis) * 100) : 0} 100`}
                          strokeDashoffset="0"
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="transparent"
                          stroke="#F59E0B"
                          strokeWidth="3.8"
                          strokeDasharray={`${totalAnalisis > 0 ? Math.round((countSedang / totalAnalisis) * 100) : 0} 100`}
                          strokeDashoffset={`-${totalAnalisis > 0 ? Math.round((countMudah / totalAnalisis) * 100) : 0}`}
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="transparent"
                          stroke="#F43F5E"
                          strokeWidth="3.8"
                          strokeDasharray={`${totalAnalisis > 0 ? Math.round((countSukar / totalAnalisis) * 100) : 0} 100`}
                          strokeDashoffset={`-${totalAnalisis > 0 ? Math.round(((countMudah + countSedang) / totalAnalisis) * 100) : 0}`}
                        />
                      </svg>
                      <div className="absolute text-center">
                        <span className="text-xl font-display font-black text-slate-800">{totalAnalisis}</span>
                        <span className="block text-[10px] font-bold text-slate-400">Soal TKA</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-3 mt-3 text-xs font-bold">
                      <span className="flex items-center gap-1 text-emerald-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Mudah ({countMudah})
                      </span>
                      <span className="flex items-center gap-1 text-amber-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Sedang ({countSedang})
                      </span>
                      <span className="flex items-center gap-1 text-rose-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Sukar ({countSukar})
                      </span>
                    </div>
                  </div>

                  <div className="md:col-span-7 space-y-3 bg-white p-4 rounded-2xl border border-slate-200">
                    <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                      Distribusi Tingkat Kesukaran Soal TKA:
                    </h4>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Soal Mudah
                        </span>
                        <span className="font-mono text-emerald-700 font-extrabold">
                          {countMudah} Soal ({totalAnalisis > 0 ? Math.round((countMudah / totalAnalisis) * 100) : 0}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${totalAnalisis > 0 ? (countMudah / totalAnalisis) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span> Soal Sedang
                        </span>
                        <span className="font-mono text-amber-700 font-extrabold">
                          {countSedang} Soal ({totalAnalisis > 0 ? Math.round((countSedang / totalAnalisis) * 100) : 0}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-amber-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${totalAnalisis > 0 ? (countSedang / totalAnalisis) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span> Soal Sukar / Penalaran
                        </span>
                        <span className="font-mono text-rose-700 font-extrabold">
                          {countSukar} Soal ({totalAnalisis > 0 ? Math.round((countSukar / totalAnalisis) * 100) : 0}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-rose-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${totalAnalisis > 0 ? (countSukar / totalAnalisis) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Chart 2: Ketuntasan Siswa TKA Per Nomor Soal */}
              {analisisChartTab === 'ketuntasan' && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                      Grafik Batang Ketuntasan Siswa TKA Per Butir Soal:
                    </h4>
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Target Kelulusan TKA: 80%
                    </span>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    {analisisList.map((a, idx) => {
                      const isHigh = a.pct >= 80;
                      return (
                        <div key={a.id || idx} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-800">
                              No. {idx + 1} ({a.jenisTka} • {a.mapel})
                            </span>
                            <span
                              className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                                isHigh ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {a.pct}% Tuntas
                            </span>
                          </div>
                          <div className="relative w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                            <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-slate-400 z-10" title="Target 80%"></div>
                            <div
                              className={`h-3.5 rounded-full transition-all duration-500 ${
                                isHigh ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${a.pct}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chart 3: Daya Pembeda TKA */}
              {analisisChartTab === 'pembeda' && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-900 uppercase">Sangat Baik (DP ≥ 0.40)</span>
                      <span className="text-xl font-display font-black text-emerald-700">
                        {analisisList.filter((a) => a.dpValue >= 0.40).length} Soal
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      Butir soal mampu menyaring dan membedakan kemampuan akademik siswa kelas 6 dengan sangat tajam.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-amber-900 uppercase">Baik & Cukup (DP &lt; 0.40)</span>
                      <span className="text-xl font-display font-black text-amber-700">
                        {analisisList.filter((a) => a.dpValue < 0.40).length} Soal
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Dapat dipertahankan atau disempurnakan dengan memperkuat opsi distraktor/pengecoh.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Analysis Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-black text-sm text-slate-800">
                  Tabel Rincian Analisis Butir Soal TKA ({totalAnalisis} Butir)
                </h3>
              </div>

              <div className="overflow-x-auto border-2 border-slate-200 rounded-3xl shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
                      <th className="p-3 w-10 text-center">No</th>
                      <th className="p-3 min-w-[200px]">Butir Pertanyaan TKA</th>
                      <th className="p-3 text-center">Paket TKA</th>
                      <th className="p-3 text-center">Mapel</th>
                      <th className="p-3 text-center">Tipe</th>
                      <th className="p-3 text-center">Tingkat Kesukaran</th>
                      <th className="p-3 text-center">Ketuntasan Siswa</th>
                      <th className="p-3 text-center">Status Analisis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analisisList.map((q, idx) => (
                      <tr key={q.id || idx} className="hover:bg-slate-50 transition">
                        <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="p-3 font-medium text-slate-800 max-w-md truncate" title={q.pertanyaan}>
                          {q.pertanyaan}
                        </td>
                        <td className="p-3 text-center font-bold text-amber-900">{q.jenisTka}</td>
                        <td className="p-3 text-center font-semibold text-slate-700">{q.mapel}</td>
                        <td className="p-3 text-center uppercase font-bold text-slate-600">{q.tipe}</td>
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
                            {q.tkLabel}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-black text-emerald-700">
                          {q.pct}%
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                            {q.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {analisisList.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                          Tidak ada butir soal TKA yang cocok dengan filter Mata Pelajaran & Paket yang dipilih.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ============================================================== */}
      {/* 5. MENU REPORT & HASIL TKA SISWA                               */}
      {/* ============================================================== */}
      {/* ============================================================== */}
      {/* 5. MENU REPORT & HASIL TKA SISWA                               */}
      {/* ============================================================== */}
      {subType === 'hasil-tka' && (() => {
        // Read directly from real student test submissions
        const recordsForPaket = tkaSubmissions
          .filter((sub) => {
            if (hasilPaketTka !== 'all' && sub.paket !== hasilPaketTka) return false;
            return true;
          })
          .map((sub) => ({
            ...sub,
            id: sub.id,
            studentId: sub.studentId,
            nama: sub.studentName,
            nisn: sub.nisn,
            kelas: sub.kelas,
            fotoUrl: sub.fotoUrl,
            paket: sub.paket,
            skorIndo: sub.scoresPerMapel?.['Bahasa Indonesia'] ?? 0,
            skorMtk: sub.scoresPerMapel?.['Matematika'] ?? 0,
            skorIpas: sub.scoresPerMapel?.['IPAS'] ?? 0,
            skorInggris: sub.scoresPerMapel?.['Bahasa Inggris'] ?? 0,
            skorTotal: sub.skorTotal,
            predikat: sub.predikat,
            status: sub.status,
            tanggalUjian: sub.tanggalUjian || '04 November 2026',
            durasiPengerjaan: sub.durasiPengerjaan || '45 Menit',
          }));

        // Ranking Calculation according to selected scope (Semua, Kelas 6A, Kelas 6B)
        const rankedPool = recordsForPaket
          .filter((r) => {
            if (rankingScope === 'Kelas 6A') return r.kelas === 'Kelas 6A';
            if (rankingScope === 'Kelas 6B') return r.kelas === 'Kelas 6B';
            return true;
          })
          .sort((a, b) => b.skorTotal - a.skorTotal);

        // Filter for table view
        const filteredRecords = rankedPool.filter((r) => {
          if (hasilKelasTka !== 'all' && r.kelas !== hasilKelasTka) return false;
          if (hasilStatusTka !== 'all' && r.status !== hasilStatusTka) return false;
          if (
            searchHasilTka &&
            !r.nama.toLowerCase().includes(searchHasilTka.toLowerCase()) &&
            !r.nisn.includes(searchHasilTka)
          ) {
            return false;
          }
          return true;
        });

        // Top 10 Honors from the ranked pool (User requested ranking 1 - 10)
        const top10Students = rankedPool.slice(0, 10);

        // Summary Statistics from rankedPool
        const totalPeserta = rankedPool.length;
        const avgScore = totalPeserta > 0
          ? (rankedPool.reduce((acc, r) => acc + r.skorTotal, 0) / totalPeserta).toFixed(1)
          : '0';
        const highestScore = totalPeserta > 0 ? Math.max(...rankedPool.map((r) => r.skorTotal)) : 0;
        const lowestScore = totalPeserta > 0 ? Math.min(...rankedPool.map((r) => r.skorTotal)) : 0;
        const tuntasCount = rankedPool.filter((r) => r.status === 'Tuntas').length;
        const tuntasPercent = totalPeserta > 0 ? Math.round((tuntasCount / totalPeserta) * 100) : 0;

        // Subject averages for chart
        const avgIndo = totalPeserta > 0
          ? Math.round(rankedPool.reduce((acc, r) => acc + r.skorIndo, 0) / totalPeserta)
          : 0;
        const avgMtk = totalPeserta > 0
          ? Math.round(rankedPool.reduce((acc, r) => acc + r.skorMtk, 0) / totalPeserta)
          : 0;
        const avgIpas = totalPeserta > 0
          ? Math.round(rankedPool.reduce((acc, r) => acc + r.skorIpas, 0) / totalPeserta)
          : 0;
        const avgInggris = totalPeserta > 0
          ? Math.round(rankedPool.reduce((acc, r) => acc + r.skorInggris, 0) / totalPeserta)
          : 0;

        // Predicate distribution for chart
        const countA = rankedPool.filter((r) => r.predikat === 'A').length;
        const countB = rankedPool.filter((r) => r.predikat === 'B').length;
        const countC = rankedPool.filter((r) => r.predikat === 'C').length;
        const countD = rankedPool.filter((r) => r.predikat === 'D').length;

        // Export to Excel
        const handleExportExcel = () => {
          const exportData = filteredRecords.map((r, idx) => ({
            'Peringkat': idx + 1,
            'NISN': r.nisn,
            'Nama Siswa': r.nama,
            'Kelas': r.kelas,
            'Paket Ujian TKA': r.paket,
            'Bahasa Indonesia': r.skorIndo,
            'Matematika': r.skorMtk,
            'IPAS': r.skorIpas,
            'Bahasa Inggris': r.skorInggris,
            'Rata-rata Skor': r.skorTotal,
            'Predikat': r.predikat,
            'Status (KKTP 75)': r.status,
            'Tanggal Pengerjaan': r.tanggalUjian,
          }));
          const ws = XLSX.utils.json_to_sheet(exportData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Hasil TKA');
          XLSX.writeFile(wb, `Report_Hasil_TKA_${hasilPaketTka.replace(/\s+/g, '_')}_SDN_RBU21.xlsx`);
          showToast('Data Report Hasil TKA berhasil diekspor ke Excel!', 'success');
        };

        const handlePrint = () => {
          window.print();
        };

        return (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-black uppercase bg-purple-100 text-purple-800 px-3 py-1 rounded-full border border-purple-200">
                  Modul TKA • Hasil &amp; Evaluasi Akademik
                </span>
                <h2 className="text-xl font-display font-black text-slate-800 mt-2 flex items-center gap-2">
                  <Award className="w-6 h-6 text-purple-600" /> Report &amp; Rekapitulasi Hasil Ujian TKA
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Terkoneksi langsung dengan ujian siswa. Dilengkapi pemeringkatan (Ranking 1 - 10), grafik komparasi mapel, serta cetak rapor hasil TKA.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearSubmissions}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-display font-black px-3.5 py-2.5 rounded-xl text-xs border border-rose-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Kosongkan seluruh data hasil & analisis TKA"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" /> Kosongkan Data
                </button>
                <button
                  type="button"
                  onClick={handleSeedSimulatedSubmissions}
                  className="bg-purple-50 hover:bg-purple-100 text-purple-800 font-display font-black px-3.5 py-2.5 rounded-xl text-xs border border-purple-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Simulasikan pengerjaan siswa Kelas 6A & 6B secara instan"
                >
                  <Sparkles className="w-4 h-4 text-purple-600" /> Simulasikan Siswa 6A &amp; 6B
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export Excel
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="bg-slate-700 hover:bg-slate-800 text-white font-display font-black px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Cetak Rekap
                </button>
              </div>
            </div>

            {/* Empty State Banner if no submissions */}
            {totalPeserta === 0 && (
              <div className="bg-amber-50 p-6 rounded-3xl border-2 border-amber-300 shadow-sm space-y-3">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs font-black">
                    ℹ️
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-display font-black text-sm text-amber-900">
                      Data Hasil Ujian TKA Masih Kosong
                    </h3>
                    <p className="text-xs text-amber-800">
                      Belum ada pengerjaan siswa yang tersimpan untuk paket <strong>"{hasilPaketTka}"</strong>.
                      Siswa dapat mengerjakan melalui menu <strong>"Tes Kemampuan Akademik (TKA)"</strong>, atau Anda dapat mengeklik tombol simulasi di bawah untuk mengisinya secara instan untuk kelas 6A dan 6B.
                    </p>
                  </div>
                </div>
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSeedSimulatedSubmissions}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" /> Muat Simulasi Siswa Kelas 6A &amp; 6B
                  </button>
                </div>
              </div>
            )}

            {/* Filter & Ranking Controls Bar */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">Pilih Paket Ujian TKA:</label>
                  <select
                    value={hasilPaketTka}
                    onChange={(e) => setHasilPaketTka(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                  >
                    {TKA_JENIS_LIST.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">Filter Rombel / Kelas:</label>
                  <select
                    value={hasilKelasTka}
                    onChange={(e) => setHasilKelasTka(e.target.value as any)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                  >
                    <option value="all">Semua Kelas (6A &amp; 6B)</option>
                    <option value="Kelas 6A">Hanya Kelas 6A</option>
                    <option value="Kelas 6B">Hanya Kelas 6B</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">Status Ketuntasan (KKTP 75):</label>
                  <select
                    value={hasilStatusTka}
                    onChange={(e) => setHasilStatusTka(e.target.value as any)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                  >
                    <option value="all">Semua Status (Tuntas &amp; Remedial)</option>
                    <option value="Tuntas">Hanya Tuntas (&gt;= 75)</option>
                    <option value="Remedial">Perlu Remedial (&lt; 75)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">Cari Nama / NISN Siswa:</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchHasilTka}
                      onChange={(e) => setSearchHasilTka(e.target.value)}
                      placeholder="Ketik nama atau NISN..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 focus:bg-white focus:border-purple-600 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Ranking Scope Selector Buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-700">Skup Pemeringkatan (Ranking):</span>
                  <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setRankingScope('semua')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                        rankingScope === 'semua'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Trophy className="w-3.5 h-3.5" /> Semua Siswa (Angkatan 6)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRankingScope('Kelas 6A')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                        rankingScope === 'Kelas 6A'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>🥇</span> Ranking Kelas 6A Saja
                    </button>
                    <button
                      type="button"
                      onClick={() => setRankingScope('Kelas 6B')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                        rankingScope === 'Kelas 6B'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>🥈</span> Ranking Kelas 6B Saja
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  Menampilkan: <strong className="text-purple-700">{filteredRecords.length}</strong> dari <strong>{totalPeserta}</strong> siswa
                </div>
              </div>
            </div>

            {/* Metric KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-purple-50 to-white p-5 rounded-3xl border border-purple-200 shadow-xs space-y-1">
                <span className="text-[11px] font-black uppercase text-purple-700">Total Peserta Ujian</span>
                <div className="text-3xl font-display font-black text-purple-900">{totalPeserta} Siswa</div>
                <p className="text-[11px] text-slate-500">
                  {rankingScope === 'semua' ? 'Gabungan Kelas 6A & 6B' : `Khusus ${rankingScope}`}
                </p>
              </div>

              <div className="bg-gradient-to-br from-sky-50 to-white p-5 rounded-3xl border border-sky-200 shadow-xs space-y-1">
                <span className="text-[11px] font-black uppercase text-sky-700">Rata-rata Skor TKA</span>
                <div className="text-3xl font-display font-black text-sky-900">{avgScore}</div>
                <p className="text-[11px] text-slate-500">Standar KKTP: 75.00 Poin</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-white p-5 rounded-3xl border border-emerald-200 shadow-xs space-y-1">
                <span className="text-[11px] font-black uppercase text-emerald-700">Ketuntasan Siswa</span>
                <div className="text-3xl font-display font-black text-emerald-900">{tuntasPercent}%</div>
                <p className="text-[11px] text-emerald-700 font-bold">{tuntasCount} dari {totalPeserta} siswa tuntas</p>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-white p-5 rounded-3xl border border-amber-200 shadow-xs space-y-1">
                <span className="text-[11px] font-black uppercase text-amber-700">Skor Tertinggi / Terendah</span>
                <div className="text-3xl font-display font-black text-amber-900">
                  {highestScore} <span className="text-xs font-bold text-slate-400">/ min {lowestScore}</span>
                </div>
                <p className="text-[11px] text-slate-500">Nilai maksimum skala 100</p>
              </div>
            </div>

            {/* VISUAL CHARTS SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Chart 1: Rata-Rata Skor per Mata Pelajaran */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-600" />
                    <div>
                      <h3 className="font-display font-black text-sm text-slate-800">
                        Grafik Rata-rata Skor per Mata Pelajaran TKA
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Perbandingan 4 mapel dengan garis ambang KKTP (75)
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full border border-purple-200">
                    4 Mapel
                  </span>
                </div>

                <div className="space-y-3.5 pt-1">
                  {/* Bahasa Indonesia */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-slate-700 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                        Bahasa Indonesia (Literasi)
                      </span>
                      <span className="font-mono font-black text-emerald-700">{avgIndo} / 100</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, avgIndo))}%` }}
                      ></div>
                      {/* KKTP 75 indicator line */}
                      <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-rose-500 z-10" title="KKTP 75"></div>
                    </div>
                  </div>

                  {/* Matematika */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-slate-700 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block"></span>
                        Matematika (Numerasi &amp; Logika)
                      </span>
                      <span className="font-mono font-black text-sky-700">{avgMtk} / 100</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-sky-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, avgMtk))}%` }}
                      ></div>
                      <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-rose-500 z-10" title="KKTP 75"></div>
                    </div>
                  </div>

                  {/* IPAS */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-slate-700 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                        IPAS (Sains Alam &amp; Sosial)
                      </span>
                      <span className="font-mono font-black text-amber-700">{avgIpas} / 100</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, avgIpas))}%` }}
                      ></div>
                      <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-rose-500 z-10" title="KKTP 75"></div>
                    </div>
                  </div>

                  {/* Bahasa Inggris */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-slate-700 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block"></span>
                        Bahasa Inggris (Literasi Global)
                      </span>
                      <span className="font-mono font-black text-purple-700">{avgInggris} / 100</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, avgInggris))}%` }}
                      ></div>
                      <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-rose-500 z-10" title="KKTP 75"></div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-rose-500 inline-block"></span> Garis Merah = Standar KKTP (75)
                  </span>
                  <span>Skala Penilaian: 0 - 100</span>
                </div>
              </div>

              {/* Chart 2: Distribusi Predikat & Ketuntasan */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                    <div>
                      <h3 className="font-display font-black text-sm text-slate-800">
                        Distribusi Predikat &amp; Ketuntasan Belajar
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Proporsi capaian predikat A, B, C, D dan ketuntasan siswa
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    KKTP: 75
                  </span>
                </div>

                {/* Progress bar for Ketuntasan */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-700">Persentase Ketuntasan</span>
                    <span className="text-emerald-700 font-mono font-black">{tuntasPercent}% Tuntas</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-500"
                      style={{ width: `${tuntasPercent}%` }}
                      title={`Tuntas: ${tuntasCount} siswa`}
                    ></div>
                    <div
                      className="bg-rose-400 h-full transition-all duration-500"
                      style={{ width: `${100 - tuntasPercent}%` }}
                      title={`Remedial: ${totalPeserta - tuntasCount} siswa`}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span className="text-emerald-700 font-bold">✓ Tuntas: {tuntasCount} siswa</span>
                    <span className="text-rose-600 font-bold">✗ Remedial: {totalPeserta - tuntasCount} siswa</span>
                  </div>
                </div>

                {/* Predicate Breakdown Bar Grid */}
                <div className="grid grid-cols-4 gap-2 pt-2">
                  <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-emerald-700 block">Predikat A</span>
                    <div className="text-lg font-black text-emerald-900">{countA}</div>
                    <span className="text-[9px] text-slate-500 block">&gt;= 88 Poin</span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-sky-50 border border-sky-200 text-center space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-sky-700 block">Predikat B</span>
                    <div className="text-lg font-black text-sky-900">{countB}</div>
                    <span className="text-[9px] text-slate-500 block">78 - 87 Poin</span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-amber-700 block">Predikat C</span>
                    <div className="text-lg font-black text-amber-900">{countC}</div>
                    <span className="text-[9px] text-slate-500 block">68 - 77 Poin</span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-rose-700 block">Predikat D</span>
                    <div className="text-lg font-black text-rose-900">{countD}</div>
                    <span className="text-[9px] text-slate-500 block">&lt; 68 Poin</span>
                  </div>
                </div>
              </div>
            </div>

            {/* TOP 10 PERINGKAT SISWA TERBAIK (HONORS CARDS) */}
            <div className="bg-gradient-to-br from-amber-500/10 via-white to-purple-500/10 p-6 rounded-3xl border-2 border-amber-300 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-base text-slate-800">
                      Peringkat 1 s/d 10 Siswa Terbaik ({rankingScope === 'semua' ? 'Semua Siswa Angkatan 6' : rankingScope})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Peraih nilai skor TKA tertinggi gabungan 4 mata pelajaran ({hasilPaketTka})
                    </p>
                  </div>
                </div>
                <span className="text-xs font-black bg-amber-100 text-amber-900 px-3 py-1 rounded-full border border-amber-300 flex items-center gap-1">
                  <span>🏆</span> Top 10 Honors
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
                {top10Students.map((s, idx) => {
                  const medals = [
                    '🥇 Juara 1',
                    '🥈 Juara 2',
                    '🥉 Juara 3',
                    '🎖️ Rank 4',
                    '🎖️ Rank 5',
                    '🎖️ Rank 6',
                    '🎖️ Rank 7',
                    '🎖️ Rank 8',
                    '🎖️ Rank 9',
                    '🎖️ Rank 10',
                  ];
                  const medalColors = [
                    'bg-amber-100 text-amber-900 border-amber-300 font-black',
                    'bg-slate-100 text-slate-800 border-slate-300 font-black',
                    'bg-orange-100 text-orange-900 border-orange-300 font-black',
                    'bg-purple-100 text-purple-900 border-purple-200',
                    'bg-purple-100 text-purple-900 border-purple-200',
                    'bg-slate-100 text-slate-700 border-slate-200',
                    'bg-slate-100 text-slate-700 border-slate-200',
                    'bg-slate-100 text-slate-700 border-slate-200',
                    'bg-slate-100 text-slate-700 border-slate-200',
                    'bg-slate-100 text-slate-700 border-slate-200',
                  ];

                  return (
                    <div
                      key={s.id}
                      className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-400 hover:shadow-md transition text-center space-y-2 relative"
                    >
                      <div className="flex justify-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${medalColors[idx]}`}>
                          {medals[idx]}
                        </span>
                      </div>
                      <img
                        src={s.fotoUrl}
                        alt={s.nama}
                        onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                        className="w-12 h-12 rounded-2xl object-cover mx-auto border-2 border-amber-300 shadow-xs cursor-zoom-in"
                      />
                      <div>
                        <h4 className="font-display font-black text-xs text-slate-800 truncate" title={s.nama}>
                          {s.nama}
                        </h4>
                        <div className="text-[11px] font-bold text-slate-500">{s.kelas}</div>
                      </div>
                      <div className="pt-1 border-t border-slate-100">
                        <div className="text-base font-black text-purple-700">{s.skorTotal}</div>
                        <div className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 rounded-lg py-0.5">
                          Predikat {s.predikat} ({s.status})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedHasilStudent(s)}
                        className="w-full mt-1 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] font-black transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Rapor TKA
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Main Table of All Student TKA Results */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" /> Rekapitulasi Nilai &amp; Pemeringkatan ({filteredRecords.length} Siswa)
                </h3>
                <span className="text-xs text-slate-500 font-bold">
                  Skup Peringkat: <strong className="text-purple-700">{rankingScope === 'semua' ? 'Semua Siswa Angkatan 6' : rankingScope}</strong>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-purple-50/70 text-purple-950 font-black uppercase text-[11px] border-b border-purple-100">
                      <th className="p-3 text-center rounded-l-xl w-14">Rank</th>
                      <th className="p-3">Identitas Siswa</th>
                      <th className="p-3 text-center">Kelas</th>
                      <th className="p-3 text-center">B. Indonesia</th>
                      <th className="p-3 text-center">Matematika</th>
                      <th className="p-3 text-center">IPAS</th>
                      <th className="p-3 text-center">B. Inggris</th>
                      <th className="p-3 text-center bg-purple-100/50">Skor Akhir</th>
                      <th className="p-3 text-center">Predikat</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right rounded-r-xl">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map((r, idx) => (
                      <tr key={r.id} className="hover:bg-purple-50/30 transition">
                        <td className="p-3 text-center font-mono font-black text-slate-600">
                          {idx === 0 && <span className="inline-block px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-xs font-black shadow-xs">#1</span>}
                          {idx === 1 && <span className="inline-block px-2 py-0.5 rounded-full bg-slate-300 text-slate-900 text-xs font-black">#2</span>}
                          {idx === 2 && <span className="inline-block px-2 py-0.5 rounded-full bg-orange-300 text-slate-900 text-xs font-black">#3</span>}
                          {idx > 2 && <span className="font-bold">#{idx + 1}</span>}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={r.fotoUrl}
                              alt={r.nama}
                              onClick={() => onOpenZoom(r.fotoUrl, r.nama)}
                              className="w-8 h-8 rounded-xl object-cover border border-slate-200 cursor-zoom-in"
                            />
                            <div>
                              <div className="font-bold text-slate-800">{r.nama}</div>
                              <div className="text-[10px] text-slate-400 font-mono">NISN: {r.nisn}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg">
                            {r.kelas}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700">{r.skorIndo}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700">{r.skorMtk}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700">{r.skorIpas}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700">{r.skorInggris}</td>
                        <td className="p-3 text-center font-mono font-black text-sm text-purple-700 bg-purple-50/60">
                          {r.skorTotal}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full font-black text-[11px] ${
                              r.predikat === 'A'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : r.predikat === 'B'
                                ? 'bg-sky-100 text-sky-800 border border-sky-300'
                                : r.predikat === 'C'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}
                          >
                            {r.predikat}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full font-black text-[10px] ${
                              r.status === 'Tuntas'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedHasilStudent(r)}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1.5 rounded-xl font-display font-extrabold text-[11px] shadow-2xs transition cursor-pointer flex items-center gap-1 ml-auto"
                          >
                            <Eye className="w-3 h-3" /> Lihat Rapor
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredRecords.length === 0 && (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-400 italic">
                          Tidak ada data pengerjaan siswa yang sesuai dengan filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ============================================================== */}
      {/* 6. MENU RUANG TES KEMAMPUAN AKADEMIK (TKA) SISWA                */}
      {/* ============================================================== */}
      {subType === 'tes-tka-siswa' && (() => {
        // Active student context
        const currentStudent = activeUser.role === 'siswa' && activeUser.studentData
          ? activeUser.studentData
          : tkaStudents.find((s) => s.id === selectedTestStudentId) || tkaStudents[0] || students[0];

        // Format countdown timer display
        const formatTimer = (totalSeconds: number) => {
          const m = Math.floor(totalSeconds / 60);
          const s = totalSeconds % 60;
          return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };

        // Active exam questions
        const examQuestions = activeExamPaket
          ? tkaQuestions.filter((q) => q.jenisTka === activeExamPaket)
          : [];
        // Fallback questions if none for that exact packet label
        const displayExamQuestions = examQuestions.length > 0 ? examQuestions : tkaQuestions.slice(0, 20);
        const activeQuestion = displayExamQuestions[currentQuestionIdx] || displayExamQuestions[0];

        // Start Exam Handler
        const handleStartExam = (paketName: string) => {
          setActiveExamPaket(paketName);
          setStudentAnswers({});
          setRaguChecks({});
          setCurrentQuestionIdx(0);
          setExamTimerSeconds(3600); // 60 minutes
          setIsExamCompleted(false);
          setLastExamResult(null);
          showToast(`Ujian ${paketName} dimulai! Waktu Anda 60 menit.`, 'success');
        };

        // Submit & Grade Exam
        const handleFinishExam = () => {
          if (!confirm('Apakah kamu yakin ingin menyelesaikan dan mengumpulkan lembar jawaban ujian TKA ini?')) {
            return;
          }

          let totalScoreEarned = 0;
          let totalMaxScore = 0;

          const subjectScores: Record<string, { earned: number; max: number }> = {
            'Bahasa Indonesia': { earned: 0, max: 0 },
            'Matematika': { earned: 0, max: 0 },
            'IPAS': { earned: 0, max: 0 },
            'Bahasa Inggris': { earned: 0, max: 0 },
          };

          displayExamQuestions.forEach((q) => {
            const studentAns = studentAnswers[q.id];
            const weight = q.bobot || 10;
            const res = evaluateQuestionScore(q.tipe, studentAns, q.kunciJawaban, weight);
            totalScoreEarned += res.earnedScore;
            totalMaxScore += weight;

            const mapelKey = subjectScores[q.mapel] ? q.mapel : 'Bahasa Indonesia';
            subjectScores[mapelKey].earned += res.earnedScore;
            subjectScores[mapelKey].max += weight;
          });

          const finalIndo = subjectScores['Bahasa Indonesia'].max > 0
            ? Math.round((subjectScores['Bahasa Indonesia'].earned / subjectScores['Bahasa Indonesia'].max) * 100)
            : 82;
          const finalMtk = subjectScores['Matematika'].max > 0
            ? Math.round((subjectScores['Matematika'].earned / subjectScores['Matematika'].max) * 100)
            : 78;
          const finalIpas = subjectScores['IPAS'].max > 0
            ? Math.round((subjectScores['IPAS'].earned / subjectScores['IPAS'].max) * 100)
            : 80;
          const finalInggris = subjectScores['Bahasa Inggris'].max > 0
            ? Math.round((subjectScores['Bahasa Inggris'].earned / subjectScores['Bahasa Inggris'].max) * 100)
            : 84;

          const finalTotalScore = totalMaxScore > 0
            ? Math.round((totalScoreEarned / totalMaxScore) * 100)
            : Math.round((finalIndo + finalMtk + finalIpas + finalInggris) / 4);

          const predikat: 'A' | 'B' | 'C' | 'D' =
            finalTotalScore >= 88 ? 'A' : finalTotalScore >= 78 ? 'B' : finalTotalScore >= 68 ? 'C' : 'D';
          const status: 'Tuntas' | 'Remedial' = finalTotalScore >= 75 ? 'Tuntas' : 'Remedial';

          const durationUsedMinutes = Math.max(1, Math.ceil((3600 - examTimerSeconds) / 60));

          const newSubmission: TKASubmissionItem = {
            id: `sub_${currentStudent.id}_${(activeExamPaket || 'TKA').replace(/\s+/g, '_')}_${Date.now()}`,
            studentId: currentStudent.id,
            studentName: currentStudent.nama,
            nisn: currentStudent.nisn,
            kelas: currentStudent.kelas,
            fotoUrl: currentStudent.fotoUrl,
            paket: activeExamPaket || 'Tryout TKA 1',
            answers: studentAnswers,
            scoresPerMapel: {
              'Bahasa Indonesia': finalIndo,
              'Matematika': finalMtk,
              'IPAS': finalIpas,
              'Bahasa Inggris': finalInggris,
            },
            skorTotal: finalTotalScore,
            predikat,
            status,
            tanggalUjian: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
            durasiPengerjaan: `${durationUsedMinutes} Menit`,
          };

          // Save submission
          const otherSubs = tkaSubmissions.filter(
            (s) => !(s.studentId === currentStudent.id && s.paket === activeExamPaket)
          );
          const updated = [newSubmission, ...otherSubs];
          setTkaSubmissions(updated);
          saveStoredTKASubmissions(updated);

          setLastExamResult(newSubmission);
          setIsExamCompleted(true);
          showToast(`Selamat! Ujian TKA selesai dengan skor: ${finalTotalScore} (Predikat ${predikat})`, 'success');
        };

        // MODE 1: Active CBT Exam Room
        if (activeExamPaket && !isExamCompleted) {
          const answeredCount = Object.keys(studentAnswers).length;
          const totalQ = displayExamQuestions.length;
          const isTimerWarning = examTimerSeconds <= 300; // 5 mins

          return (
            <div className="space-y-4">
              {/* CBT Top Bar */}
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-black">
                    📝
                  </div>
                  <div>
                    <h2 className="font-display font-black text-sm text-slate-800">
                      {activeExamPaket} • CBT Tes Kemampuan Akademik
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Siswa: <strong className="text-purple-700">{currentStudent.nama}</strong> ({currentStudent.kelas}) • NISN: {currentStudent.nisn}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Timer Badge */}
                  <div
                    className={`px-4 py-2 rounded-2xl flex items-center gap-2 border font-mono font-black text-sm ${
                      isTimerWarning
                        ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                        : 'bg-purple-50 text-purple-800 border-purple-200'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>Sisa Waktu: {formatTimer(examTimerSeconds)}</span>
                  </div>

                  {/* Kumpulkan Ujian Button */}
                  <button
                    type="button"
                    onClick={handleFinishExam}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2 rounded-2xl text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition"
                  >
                    <CheckCircle className="w-4 h-4" /> Kumpulkan Ujian
                  </button>
                </div>
              </div>

              {/* CBT Main Layout: 2 Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left: Question Pane */}
                <div className="lg:col-span-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-5">
                  {/* Question Header & Meta */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black text-xs">
                        {currentQuestionIdx + 1}
                      </span>
                      <span className="text-xs font-black text-slate-700 uppercase bg-slate-100 px-3 py-1 rounded-xl">
                        {activeQuestion?.mapel || 'Bahasa Indonesia'}
                      </span>
                      <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl">
                        Tipe: {activeQuestion?.tipe || 'Pilihan Ganda'}
                      </span>
                    </div>
                    <span className="text-xs font-black text-slate-500">
                      Soal {currentQuestionIdx + 1} dari {totalQ}
                    </span>
                  </div>

                  {/* Question Text */}
                  <div className="text-slate-800 font-medium text-sm leading-relaxed whitespace-pre-wrap">
                    {activeQuestion?.pertanyaan}
                  </div>

                  {/* Question Images (Supports 2 images side-by-side) */}
                  {(activeQuestion?.gambarUrl || activeQuestion?.gambarUrl2) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                      {activeQuestion?.gambarUrl && (
                        <div className="space-y-1 text-center">
                          <img
                            src={activeQuestion.gambarUrl}
                            alt="Gambar 1 Soal"
                            onClick={() => onOpenZoom(activeQuestion.gambarUrl!, 'Gambar 1 Soal TKA')}
                            className="max-h-48 w-full object-contain rounded-xl border border-slate-200 bg-white cursor-zoom-in"
                          />
                          <span className="text-[10px] text-slate-500 font-bold block">Klik untuk perbesar (Gambar 1)</span>
                        </div>
                      )}
                      {activeQuestion?.gambarUrl2 && (
                        <div className="space-y-1 text-center">
                          <img
                            src={activeQuestion.gambarUrl2}
                            alt="Gambar 2 Soal"
                            onClick={() => onOpenZoom(activeQuestion.gambarUrl2!, 'Gambar 2 Soal TKA')}
                            className="max-h-48 w-full object-contain rounded-xl border border-slate-200 bg-white cursor-zoom-in"
                          />
                          <span className="text-[10px] text-slate-500 font-bold block">Klik untuk perbesar (Gambar 2)</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Answer Input depending on type */}
                  <div className="space-y-2.5 pt-2">
                    {/* PG */}
                    {(!activeQuestion?.tipe || activeQuestion?.tipe === 'pg') && (
                      <div className="space-y-2">
                        {['A', 'B', 'C', 'D'].map((optKey, idx) => {
                          const optText = activeQuestion?.opsi?.[idx] || `Pilihan Jawaban ${optKey}`;
                          const optImg = activeQuestion?.opsiGambar?.[optKey];
                          const isSelected = studentAnswers[activeQuestion.id] === optKey;

                          return (
                            <label
                              key={optKey}
                              onClick={() => {
                                setStudentAnswers((prev) => ({ ...prev, [activeQuestion.id]: optKey }));
                              }}
                              className={`p-3.5 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition ${
                                isSelected
                                  ? 'bg-purple-50/70 border-purple-600 text-purple-950 font-bold shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
                              }`}
                            >
                              <div
                                className={`w-6 h-6 rounded-xl flex items-center justify-center font-black text-xs shrink-0 mt-0.5 ${
                                  isSelected ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {optKey}
                              </div>
                              <div className="space-y-1.5 flex-1">
                                <span className="text-xs leading-relaxed">{optText}</span>
                                {optImg && (
                                  <img
                                    src={optImg}
                                    alt={`Opsi ${optKey}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenZoom(optImg, `Gambar Opsi ${optKey}`);
                                    }}
                                    className="max-h-28 rounded-lg border border-slate-200 bg-white object-contain"
                                  />
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* PG Kompleks */}
                    {activeQuestion?.tipe === 'pg_kompleks' && (
                      <div className="space-y-2">
                        <div className="text-[11px] text-purple-700 font-bold">
                          ✓ Pilih satu atau lebih jawaban yang benar:
                        </div>
                        {['A', 'B', 'C', 'D'].map((optKey, idx) => {
                          const optText = activeQuestion?.opsi?.[idx] || `Pernyataan Pilihan ${optKey}`;
                          const selectedArr: string[] = studentAnswers[activeQuestion.id] || [];
                          const isChecked = selectedArr.includes(optKey);

                          return (
                            <label
                              key={optKey}
                              onClick={() => {
                                const currentList: string[] = studentAnswers[activeQuestion.id] || [];
                                const updated = isChecked
                                  ? currentList.filter((k) => k !== optKey)
                                  : [...currentList, optKey];
                                setStudentAnswers((prev) => ({ ...prev, [activeQuestion.id]: updated }));
                              }}
                              className={`p-3.5 rounded-2xl border-2 flex items-center gap-3 cursor-pointer transition ${
                                isChecked
                                  ? 'bg-purple-50/70 border-purple-600 text-purple-950 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                              />
                              <span className="text-xs">{optKey}. {optText}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Benar / Salah */}
                    {activeQuestion?.tipe === 'benar_salah' && (
                      <div className="grid grid-cols-2 gap-3">
                        {['Benar', 'Salah'].map((val) => {
                          const isSelected = studentAnswers[activeQuestion.id] === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                setStudentAnswers((prev) => ({ ...prev, [activeQuestion.id]: val }));
                              }}
                              className={`p-4 rounded-2xl border-2 font-display font-black text-sm transition cursor-pointer ${
                                isSelected
                                  ? val === 'Benar'
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                    : 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {val === 'Benar' ? '✓ Benar' : '✗ Salah'}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Isian Singkat */}
                    {(activeQuestion?.tipe === 'isian' || activeQuestion?.tipe === 'uraian' || activeQuestion?.tipe === 'menjodohkan') && (
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700">
                          Tuliskan Jawaban Anda:
                        </label>
                        <input
                          type="text"
                          value={studentAnswers[activeQuestion?.id] || ''}
                          onChange={(e) => {
                            setStudentAnswers((prev) => ({
                              ...prev,
                              [activeQuestion.id]: e.target.value,
                            }));
                          }}
                          placeholder="Ketik jawaban Anda di sini..."
                          className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 text-xs font-bold focus:border-purple-600 outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={currentQuestionIdx === 0}
                      onClick={() => setCurrentQuestionIdx((p) => Math.max(0, p - 1))}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      ← Soal Sebelumnya
                    </button>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                      <input
                        type="checkbox"
                        checked={Boolean(raguChecks[activeQuestion?.id])}
                        onChange={(e) => {
                          setRaguChecks((prev) => ({
                            ...prev,
                            [activeQuestion.id]: e.target.checked,
                          }));
                        }}
                        className="w-4 h-4 rounded text-amber-500 cursor-pointer"
                      />
                      <span>Ragu-Ragu</span>
                    </label>

                    <button
                      type="button"
                      disabled={currentQuestionIdx === totalQ - 1}
                      onClick={() => setCurrentQuestionIdx((p) => Math.min(totalQ - 1, p + 1))}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Soal Berikutnya →
                    </button>
                  </div>
                </div>

                {/* Right: Question Number Grid Palette */}
                <div className="lg:col-span-4 bg-white p-5 rounded-3xl shadow-sm border border-slate-200 space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="font-display font-black text-sm text-slate-800">
                      Daftar Nomor Soal TKA
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Terjawab: <strong className="text-emerald-600">{answeredCount}</strong> dari {totalQ} Soal
                    </p>
                  </div>

                  {/* Number Grid */}
                  <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto p-1">
                    {displayExamQuestions.map((q, idx) => {
                      const isAnswered = studentAnswers[q.id] !== undefined && studentAnswers[q.id] !== '';
                      const isRagu = Boolean(raguChecks[q.id]);
                      const isActive = idx === currentQuestionIdx;

                      let btnStyle = 'bg-slate-100 text-slate-700 hover:bg-slate-200';
                      if (isRagu) {
                        btnStyle = 'bg-amber-400 text-slate-900 font-black shadow-xs';
                      } else if (isAnswered) {
                        btnStyle = 'bg-emerald-500 text-white font-black shadow-xs';
                      }

                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setCurrentQuestionIdx(idx)}
                          className={`h-10 rounded-xl font-mono text-xs font-bold transition cursor-pointer relative ${btnStyle} ${
                            isActive ? 'ring-2 ring-purple-600 ring-offset-2 scale-105' : ''
                          }`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-md bg-emerald-500"></span>
                      <span className="text-slate-600 font-bold">Hijau: Sudah Dijawab</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-md bg-amber-400"></span>
                      <span className="text-slate-600 font-bold">Kuning: Ragu-Ragu</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-md bg-slate-200"></span>
                      <span className="text-slate-600 font-bold">Abu-abu: Belum Dijawab</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleFinishExam}
                    className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-display font-black text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" /> Selesai &amp; Kumpulkan Ujian
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // MODE 2: Exam Completed Celebration / Score View
        if (isExamCompleted && lastExamResult) {
          return (
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-2xl mx-auto space-y-6 text-center animate-in fade-in">
              <div className="w-20 h-20 rounded-3xl bg-purple-100 text-purple-700 mx-auto flex items-center justify-center text-3xl shadow-sm">
                🏆
              </div>

              <div>
                <span className="text-xs font-black uppercase bg-purple-100 text-purple-800 px-3 py-1 rounded-full">
                  Ujian Berhasil Diselesaikan!
                </span>
                <h2 className="text-2xl font-display font-black text-slate-800 mt-2">
                  Hasil Ujian: {lastExamResult.paket}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Selamat <strong className="text-purple-700">{lastExamResult.studentName}</strong> ({lastExamResult.kelas}), lembar jawaban Anda telah diperiksa otomatis.
                </p>
              </div>

              {/* Total Score Badge */}
              <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-50 via-white to-sky-50 border-2 border-purple-200 space-y-2">
                <span className="text-xs font-black uppercase text-purple-700">Skor Akhir Komposit TKA</span>
                <div className="text-5xl font-display font-black text-purple-900">{lastExamResult.skorTotal}</div>
                <div className="flex justify-center items-center gap-2 pt-1">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black ${
                      lastExamResult.predikat === 'A'
                        ? 'bg-emerald-100 text-emerald-800'
                        : lastExamResult.predikat === 'B'
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    Predikat {lastExamResult.predikat}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black ${
                      lastExamResult.status === 'Tuntas'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                        : 'bg-rose-50 text-rose-700 border border-rose-300'
                    }`}
                  >
                    {lastExamResult.status} (KKTP 75)
                  </span>
                </div>
              </div>

              {/* Subject Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block">B. INDONESIA</span>
                  <span className="text-lg font-black text-slate-800 font-mono">
                    {lastExamResult.scoresPerMapel?.['Bahasa Indonesia']}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block">MATEMATIKA</span>
                  <span className="text-lg font-black text-slate-800 font-mono">
                    {lastExamResult.scoresPerMapel?.['Matematika']}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block">IPAS</span>
                  <span className="text-lg font-black text-slate-800 font-mono">
                    {lastExamResult.scoresPerMapel?.['IPAS']}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block">B. INGGRIS</span>
                  <span className="text-lg font-black text-slate-800 font-mono">
                    {lastExamResult.scoresPerMapel?.['Bahasa Inggris']}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedHasilStudent(lastExamResult);
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-display font-black text-xs shadow-md transition cursor-pointer flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" /> Lihat Rapor Lengkap TKA
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveExamPaket(null);
                    setIsExamCompleted(false);
                    setLastExamResult(null);
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-black text-xs transition cursor-pointer"
                >
                  Kembali ke Daftar Paket Ujian
                </button>
              </div>
            </div>
          );
        }

        // MODE 3: Default Package Selection Dashboard
        return (
          <div className="space-y-6">
            {/* Student Header Card */}
            <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 sm:p-7 rounded-3xl shadow-md space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={currentStudent.fotoUrl}
                    alt={currentStudent.nama}
                    onClick={() => onOpenZoom(currentStudent.fotoUrl, currentStudent.nama)}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-white/60 shadow-md cursor-zoom-in"
                  />
                  <div>
                    <span className="text-xs font-black uppercase bg-white/20 text-white px-3 py-1 rounded-full border border-white/30">
                      Ruang Ujian Siswa • CBT TKA
                    </span>
                    <h2 className="text-xl sm:text-2xl font-display font-black mt-1">
                      {currentStudent.nama}
                    </h2>
                    <p className="text-xs text-purple-200 font-medium">
                      Kelas: <strong>{currentStudent.kelas}</strong> • NISN: {currentStudent.nisn} • SDN Rawa Badak Utara 21
                    </p>
                  </div>
                </div>

                {/* If logged in as admin/guru, show student switcher */}
                {activeUser.role !== 'siswa' && (
                  <div className="bg-white/10 p-3 rounded-2xl border border-white/20">
                    <label className="block text-[10px] font-bold uppercase text-purple-200 mb-1">
                      Ganti Akun Siswa (Mode Preview Guru/Admin):
                    </label>
                    <select
                      value={selectedTestStudentId}
                      onChange={(e) => setSelectedTestStudentId(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-white text-slate-800 text-xs font-bold outline-none cursor-pointer"
                    >
                      {tkaStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nama} ({s.kelas})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Instructions banner */}
              <div className="p-4 rounded-2xl bg-white/10 border border-white/20 text-xs space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300" /> Ketentuan Ujian Tes Kemampuan Akademik (TKA):
                </div>
                <p className="text-purple-100 text-[11px] leading-relaxed">
                  1. Soal terdiri dari 4 Mata Pelajaran: Bahasa Indonesia, Matematika, IPAS, dan Bahasa Inggris.<br />
                  2. Durasi pengerjaan 60 Menit dengan sistem pengawasan CBT otomatis.<br />
                  3. Nilai KKTP ketuntasan adalah 75.00 poin. Hasil ujian langsung tersimpan dan terhubung ke Rapor TKA.
                </p>
              </div>
            </div>

            {/* List of 12 TKA Exam Packages (Simulasi 1-6 & Try Out 1-6) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-purple-600" /> Paket Soal Ujian TKA Tersedia (12 Paket)
                </h3>
                <span className="text-xs text-slate-400 font-bold">
                  Simulasi 1 - 6 &amp; Try Out 1 - 6
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {TKA_JENIS_LIST.map((paketName) => {
                  // Check if student already submitted this exam
                  const existingSub = tkaSubmissions.find(
                    (s) => s.studentId === currentStudent.id && s.paket === paketName
                  );
                  const qCount = tkaQuestions.filter((q) => q.jenisTka === paketName).length || 20;

                  return (
                    <div
                      key={paketName}
                      className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-purple-300 hover:shadow-md transition space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full border border-purple-200">
                            Standar Kemendikbud
                          </span>
                          {existingSub ? (
                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                              ✓ Selesai
                            </span>
                          ) : (
                            <span className="text-[10px] font-black bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full border border-amber-200">
                              Belum Dikerjakan
                            </span>
                          )}
                        </div>

                        <h4 className="font-display font-black text-base text-slate-800">
                          {paketName}
                        </h4>
                        <p className="text-xs text-slate-500">
                          4 Mapel: Bahasa Indonesia, Matematika, IPAS, Bahasa Inggris.
                        </p>

                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                          <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 block text-[10px]">Jumlah Soal</span>
                            <span className="font-bold text-slate-700 font-mono">{qCount} Butir</span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 block text-[10px]">Waktu Ujian</span>
                            <span className="font-bold text-slate-700 font-mono">60 Menit</span>
                          </div>
                        </div>

                        {existingSub && (
                          <div className="p-2.5 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-between text-xs">
                            <div>
                              <span className="text-[10px] text-purple-600 font-bold block">Skor Capaian:</span>
                              <span className="font-black text-purple-900 text-base font-mono">
                                {existingSub.skorTotal} / 100
                              </span>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  existingSub.status === 'Tuntas'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {existingSub.status}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                        {existingSub ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setSelectedHasilStudent(existingSub)}
                              className="flex-1 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-display font-black text-xs transition cursor-pointer flex items-center justify-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" /> Lihat Rapor
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartExam(paketName)}
                              className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-display font-black text-xs transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                            >
                              <Play className="w-3.5 h-3.5" /> Kerjakan Ulang
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartExam(paketName)}
                            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-display font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                          >
                            <Play className="w-4 h-4" /> Mulai Tes TKA Sekarang
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= MODAL RAPOR TKA INDIVIDU SISWA ================= */}
      {selectedHasilStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl space-y-5 border-2 border-purple-200 animate-in fade-in zoom-in-95 my-8">
            {/* Header Sekolah */}
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xl">
                  🎓
                </div>
                <div>
                  <h3 className="font-display font-black text-base sm:text-lg text-slate-800">
                    LEMBAR LAPORAN HASIL TES KEMAMPUAN AKADEMIK (TKA)
                  </h3>
                  <p className="text-xs text-slate-500 font-bold">
                    SDN Rawa Badak Utara 21 • Tahun Pelajaran 2026/2027
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHasilStudent(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center font-bold text-sm cursor-pointer transition"
              >
                ✕
              </button>
            </div>

            {/* Biodata Siswa */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 font-extrabold text-[10px] uppercase block">Nama Lengkap</span>
                <span className="font-black text-slate-800">{selectedHasilStudent.nama}</span>
              </div>
              <div>
                <span className="text-slate-400 font-extrabold text-[10px] uppercase block">NISN / No. Induk</span>
                <span className="font-mono font-bold text-slate-700">{selectedHasilStudent.nisn}</span>
              </div>
              <div>
                <span className="text-slate-400 font-extrabold text-[10px] uppercase block">Rombel / Kelas</span>
                <span className="font-bold text-purple-700">{selectedHasilStudent.kelas}</span>
              </div>
              <div>
                <span className="text-slate-400 font-extrabold text-[10px] uppercase block">Paket Ujian</span>
                <span className="font-bold text-slate-800">{selectedHasilStudent.paket}</span>
              </div>
            </div>

            {/* Tabel Rincian Skor per Mapel */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-purple-600 text-white font-extrabold text-[11px] uppercase">
                    <th className="p-3">No</th>
                    <th className="p-3">Mata Pelajaran yang Diuji</th>
                    <th className="p-3 text-center">Bobot</th>
                    <th className="p-3 text-center">Nilai Capaian</th>
                    <th className="p-3 text-center">Predikat</th>
                    <th className="p-3">Deskripsi Capaian Kompetensi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-3 text-center font-bold">1</td>
                    <td className="p-3 font-bold text-slate-800">Bahasa Indonesia (Literasi Membaca)</td>
                    <td className="p-3 text-center text-slate-500 font-mono">25%</td>
                    <td className="p-3 text-center font-mono font-black text-sm text-purple-700">{selectedHasilStudent.skorIndo}</td>
                    <td className="p-3 text-center font-black">{selectedHasilStudent.skorIndo >= 85 ? 'A' : 'B'}</td>
                    <td className="p-3 text-slate-600 text-[11px]">Sangat terampil menemukan gagasan pokok dan menganalisis simpulan teks informatif.</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-center font-bold">2</td>
                    <td className="p-3 font-bold text-slate-800">Matematika (Numerasi &amp; Penalaran)</td>
                    <td className="p-3 text-center text-slate-500 font-mono">25%</td>
                    <td className="p-3 text-center font-mono font-black text-sm text-purple-700">{selectedHasilStudent.skorMtk}</td>
                    <td className="p-3 text-center font-black">{selectedHasilStudent.skorMtk >= 85 ? 'A' : 'B'}</td>
                    <td className="p-3 text-slate-600 text-[11px]">Mampu menyelesaikan soal aplikasi operasi pecahan, perbandingan, dan bangun ruang.</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-center font-bold">3</td>
                    <td className="p-3 font-bold text-slate-800">IPAS (Sains &amp; Lingkungan Sosial)</td>
                    <td className="p-3 text-center text-slate-500 font-mono">25%</td>
                    <td className="p-3 text-center font-mono font-black text-sm text-purple-700">{selectedHasilStudent.skorIpas}</td>
                    <td className="p-3 text-center font-black">{selectedHasilStudent.skorIpas >= 85 ? 'A' : 'B'}</td>
                    <td className="p-3 text-slate-600 text-[11px]">Memahami siklus ekosistem, sifat energi, serta interaksi sosial kemasyarakatan.</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-center font-bold">4</td>
                    <td className="p-3 font-bold text-slate-800">Bahasa Inggris (Literasi Global)</td>
                    <td className="p-3 text-center text-slate-500 font-mono">25%</td>
                    <td className="p-3 text-center font-mono font-black text-sm text-purple-700">{selectedHasilStudent.skorInggris}</td>
                    <td className="p-3 text-center font-black">{selectedHasilStudent.skorInggris >= 85 ? 'A' : 'B'}</td>
                    <td className="p-3 text-slate-600 text-[11px]">Mampu memahami ungkapan kontekstual, deskripsi harian, dan kosa kata fungsional.</td>
                  </tr>
                  <tr className="bg-purple-50 font-black">
                    <td colSpan={3} className="p-3 text-right uppercase text-purple-900">
                      Rata-Rata Nilai Akhir Komposit TKA:
                    </td>
                    <td className="p-3 text-center font-mono text-base text-purple-800">
                      {selectedHasilStudent.skorTotal}
                    </td>
                    <td className="p-3 text-center text-purple-800">
                      {selectedHasilStudent.predikat}
                    </td>
                    <td className="p-3 text-emerald-800 font-extrabold">
                      Status: {selectedHasilStudent.status} (KKTP &gt;= 75)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tanda Tangan */}
            <div className="grid grid-cols-3 gap-4 pt-4 text-xs text-center border-t border-slate-200">
              <div>
                <p className="font-medium text-slate-700 mb-14">Mengetahui,<br />Orang Tua / Wali Murid</p>
                <div className="w-36 border-b border-slate-400 mx-auto mb-1"></div>
                <p className="text-[10px] text-slate-500">(Nama Terang Orang Tua)</p>
              </div>
              <div>
                <p className="font-medium text-slate-700 mb-14">Mengetahui,<br />Kepala SDN Rawa Badak Utara 21</p>
                <p className="font-black text-slate-800 underline">Darti Isyanti, M.Pd.</p>
                <p className="text-[10px] font-mono text-slate-500">NIP. 197710102017082001</p>
              </div>
              <div>
                <div className="text-[11px] mb-1 text-slate-700 font-medium">Jakarta, 19 Desember 2026</div>
                <p className="font-medium text-slate-700 mb-10">Mengetahui,<br />Wali Kelas {selectedHasilStudent.kelas}</p>
                <p className="font-black text-slate-800 underline">Siti Aminah, S.Pd.</p>
                <p className="text-[10px] font-mono text-slate-500">NIP. 198504122010012008</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedHasilStudent(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-display font-black text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" /> Cetak Lembar Rapor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL TAMBAH CP TKA ================= */}
      {showAddCpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-rose-600" /> Tambah CP TKA Baru
              </h3>
              <button
                type="button"
                onClick={() => setShowAddCpModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickCp} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kode CP:</label>
                <input
                  type="text"
                  value={quickCpKode}
                  onChange={(e) => setQuickCpKode(e.target.value)}
                  placeholder="Contoh: CP-TKA-03"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mata Pelajaran:</label>
                <select
                  value={quickCpMapel}
                  onChange={(e) => setQuickCpMapel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                >
                  {TKA_MAPEL_LIST.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Judul Capaian Pembelajaran (CP):</label>
                <input
                  type="text"
                  value={quickCpJudul}
                  onChange={(e) => setQuickCpJudul(e.target.value)}
                  placeholder="Contoh: Pemahaman Teks Deskripsi & Fakta"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Deskripsi Lengkap CP:</label>
                <textarea
                  rows={3}
                  value={quickCpDesc}
                  onChange={(e) => setQuickCpDesc(e.target.value)}
                  placeholder="Deskripsi standar kompetensi CP..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCpModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer shadow-sm"
                >
                  Simpan CP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL TAMBAH TP TKA ================= */}
      {showAddTpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-sky-600" /> Tambah TP TKA Baru
              </h3>
              <button
                type="button"
                onClick={() => setShowAddTpModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickTp} className="space-y-3">
              <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900">
                Untuk CP: <strong>{activeCp?.judulCp}</strong>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kode TP (Opsional):</label>
                <input
                  type="text"
                  value={quickTpKode}
                  onChange={(e) => setQuickTpKode(e.target.value)}
                  placeholder={`Contoh: TP${(activeCp?.tpList?.length || 0) + 1}`}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tujuan Pembelajaran (TP):</label>
                <textarea
                  rows={3}
                  value={quickTpJudul}
                  onChange={(e) => setQuickTpJudul(e.target.value)}
                  placeholder="Contoh: Peserta didik mampu menganalisis hubungan sebab akibat dalam teks..."
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTpModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black cursor-pointer shadow-sm"
                >
                  Simpan TP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
