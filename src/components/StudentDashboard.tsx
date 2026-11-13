import React, { useState, useEffect, useMemo } from 'react';
import {
  Laptop,
  Sparkles,
  Award,
  Sprout,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Send,
  HelpCircle,
  FileText,
  User,
  GraduationCap,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  CheckCircle,
  Lock,
  HeartHandshake,
  BookOpen,
  Sun,
  Coffee,
  Smile,
  ThumbsUp,
  Save,
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { ActiveUser, Student, Subject, SchoolProfile, CBTQuestion, TUJUH_KEBIASAAN_LIST, KebiasaanReportItem } from '../types';
import {
  getStoredCBTExams,
  getStoredCBTResults,
  saveStoredCBTResults,
  getStoredTKAQuestions,
  getStoredTKASubmissions,
  saveStoredTKASubmissions,
  getStoredAssessments,
  saveStoredAssessments,
  getActiveFilters,
  CLASSES_LIST,
} from '../utils/storage';
import { TKA_JENIS_LIST, TKA_MAPEL_LIST } from '../data/defaultData';
import { evaluateQuestionScore, normalizeString } from '../utils/answerChecker';
import { getLocalTodayStr } from '../utils/dateUtils';


interface Props {
  activeUser: ActiveUser;
  students: Student[];
  subjects: Subject[];
  activeClass: string;
  activeYear?: string;
  activeSemester?: string;
  profile: SchoolProfile;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onNavigateTab: (tab: any) => void;
  initialTab?: string;
}

interface ExamOptionItem {
  id: string;
  category: 'cbt' | 'tka';
  mapel: string;
  judul: string;
  durasiMenit: number;
  paketName: string;
  subPaket?: string;
  kelas?: string;
  isTeacherCreated?: boolean;
  soalList: CBTQuestion[];
}

export const StudentDashboard: React.FC<Props> = ({
  activeUser,
  students,
  subjects,
  activeClass,
  activeYear = '2026/2027',
  activeSemester = 'Ganjil',
  profile,
  showToast,
  onNavigateTab,
  initialTab,
}) => {
  // Mode tampilan siswa: 'home' (cards), 'cbt' (flow ujian CBT), 'tka' (flow ujian TKA), 'kebiasaan' (Form Laporan 7 Kebiasaan)
  const [viewMode, setViewMode] = useState<'home' | 'cbt' | 'tka' | 'kebiasaan'>(() => {
    if (initialTab === 'laporan-kebiasaan') return 'kebiasaan';
    if (initialTab === 'ujian') return 'cbt';
    if (initialTab === 'tes-tka-siswa') return 'tka';
    return 'home';
  });

  useEffect(() => {
    if (initialTab === 'laporan-kebiasaan') {
      setViewMode('kebiasaan');
    } else if (initialTab === 'ujian') {
      setViewMode('cbt');
    } else if (initialTab === 'tes-tka-siswa') {
      setViewMode('tka');
    } else if (initialTab === 'dashboard') {
      setViewMode('home');
    }
  }, [initialTab]);

  // State untuk alur ujian & filter dropdown Paket Soal + Mata Pelajaran
  const [selectedPaketFilter, setSelectedPaketFilter] = useState<string>('');
  const [selectedMapelFilter, setSelectedMapelFilter] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [isExamRunning, setIsExamRunning] = useState<boolean>(false);
  const [runningSoalList, setRunningSoalList] = useState<CBTQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [examResult, setExamResult] = useState<{ score: number; maxScore: number } | null>(null);

  // Cari data siswa saat ini
  const currentStudent = useMemo(() => {
    if (activeUser.studentData) return activeUser.studentData;
    return students.find((s) => s.username === activeUser.username || s.nama === activeUser.name) || students[0];
  }, [activeUser, students]);

  // State Form Input 7 Kebiasaan Siswa
  const [kebiasaanFormNama, setKebiasaanFormNama] = useState<string>('');
  const [kebiasaanFormKelas, setKebiasaanFormKelas] = useState<string>(activeClass);
  const [kebiasaanFormTanggal, setKebiasaanFormTanggal] = useState<string>(
    getLocalTodayStr()
  );
  const [kebiasaanStatus, setKebiasaanStatus] = useState<Record<string, boolean>>({
    bangunPagi: true,
    ibadah: true,
    mandiGosokGigi: true,
    sarapanSehat: true,
    berpamitan: true,
    membacaBuku: true,
    membantuOrangTua: true,
  });
  const [kebiasaanNotes, setKebiasaanNotes] = useState<Record<string, string>>({
    bangunPagi: '',
    ibadah: '',
    mandiGosokGigi: '',
    sarapanSehat: '',
    berpamitan: '',
    membacaBuku: '',
    membantuOrangTua: '',
  });
  const [kebiasaanCatatanSiswa, setKebiasaanCatatanSiswa] = useState<string>('');
  const [isSubmittingKebiasaan, setIsSubmittingKebiasaan] = useState<boolean>(false);
  const [kebiasaanSuccessModal, setKebiasaanSuccessModal] = useState<boolean>(false);
  const [studentPastReports, setStudentPastReports] = useState<KebiasaanReportItem[]>(() => {
    try {
      const saved = localStorage.getItem('sekolahku_student_kebiasaan_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (currentStudent) {
      setKebiasaanFormNama(currentStudent.nama);
      setKebiasaanFormKelas(currentStudent.kelas || activeClass);
    }
  }, [currentStudent, activeClass]);

  // Handler tandai semua kebiasaan sudah dilakukan
  const handleMarkAllKebiasaan = (val: boolean) => {
    const updated: Record<string, boolean> = {};
    TUJUH_KEBIASAAN_LIST.forEach((h) => {
      updated[h.id] = val;
    });
    setKebiasaanStatus(updated);
    showToast(val ? 'Semua kebiasaan ditandai Sudah Dilakukan!' : 'Semua kebiasaan direset.', 'success');
  };

  // Handler kirim laporan ke Firestore collection 'laporan_kebiasaan'
  const handleSubmitKebiasaan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kebiasaanFormNama.trim()) {
      showToast('Nama siswa wajib diisi atau dipilih!', 'error');
      return;
    }

    setIsSubmittingKebiasaan(true);
    const completedCount = Object.values(kebiasaanStatus).filter(Boolean).length;
    const now = new Date();
    const waktuKirim = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

    const newReport: KebiasaanReportItem = {
      namaSiswa: kebiasaanFormNama.trim(),
      studentId: currentStudent?.id || `std_${Date.now()}`,
      kelas: kebiasaanFormKelas,
      tanggal: kebiasaanFormTanggal,
      waktuKirim,
      kebiasaan: {
        bangunPagi: Boolean(kebiasaanStatus.bangunPagi),
        ibadah: Boolean(kebiasaanStatus.ibadah),
        mandiGosokGigi: Boolean(kebiasaanStatus.mandiGosokGigi),
        sarapanSehat: Boolean(kebiasaanStatus.sarapanSehat),
        berpamitan: Boolean(kebiasaanStatus.berpamitan),
        membacaBuku: Boolean(kebiasaanStatus.membacaBuku),
        membantuOrangTua: Boolean(kebiasaanStatus.membantuOrangTua),
      },
      catatan: kebiasaanNotes,
      skor: completedCount,
      catatanSiswa: kebiasaanCatatanSiswa.trim(),
      createdAt: now.toISOString(),
    };

    try {
      // 1. Kirim ke Firestore collection 'laporan_kebiasaan'
      const docRef = await addDoc(collection(db, 'laporan_kebiasaan'), {
        ...newReport,
        timestamp: serverTimestamp(),
      });
      newReport.id = docRef.id;

      // 2. Simpan ke local history siswa
      const updatedHistory = [newReport, ...studentPastReports.slice(0, 19)];
      setStudentPastReports(updatedHistory);
      localStorage.setItem('sekolahku_student_kebiasaan_history', JSON.stringify(updatedHistory));

      setKebiasaanSuccessModal(true);
      showToast(
        `Alhamdulillah! Laporan 7 Kebiasaan berhasil dikirim ke Firestore. Skor Anda: ${completedCount}/7`,
        'success'
      );
    } catch (err: any) {
      console.warn('Submit Firestore warning (saved locally):', err);
      const updatedHistory = [newReport, ...studentPastReports.slice(0, 19)];
      setStudentPastReports(updatedHistory);
      localStorage.setItem('sekolahku_student_kebiasaan_history', JSON.stringify(updatedHistory));
      setKebiasaanSuccessModal(true);
      showToast('Laporan 7 Kebiasaan berhasil disimpan di sistem lokal sekolah!', 'success');
    } finally {
      setIsSubmittingKebiasaan(false);
    }
  };


  // Reset dropdown filters saat berpindah mode ujian (CBT <-> TKA)
  useEffect(() => {
    if (!isExamRunning) {
      setSelectedPaketFilter('');
      setSelectedMapelFilter('');
      setSelectedExamId('');
      setExamResult(null);
      setRunningSoalList([]);
    }
  }, [viewMode]);

  // Helper infer paketName dari CBTExam bila exam belum memiliki properti paketName
  const inferCbtPaketName = (judul: string, explicitPaket?: string): string => {
    if (explicitPaket) return explicitPaket;
    const j = (judul || '').toLowerCase();
    if (j.includes('asts')) return 'ASTS (Sumatif Tengah Semester)';
    if (j.includes('asas')) return 'ASAS (Sumatif Akhir Semester)';
    const sumatifMatch = judul?.match(/Sumatif\s*\d+\s*\(AS\s*\d+\)/i);
    if (sumatifMatch) return sumatifMatch[0];
    const remMatch = judul?.match(/Remedial\s*\d+/i);
    if (remMatch) return remMatch[0];
    return 'ASAS (Sumatif Akhir Semester)';
  };

  // Daftar Ujian CBT Tersedia (Dinamis dari Bank Soal Guru + Paket Contoh Bawaan)
  const cbtExamList: ExamOptionItem[] = useMemo(() => {
    const storedExams = getStoredCBTExams();
    const dynamicTeacherExams: ExamOptionItem[] = [];

    storedExams.forEach((ex) => {
      if (!Array.isArray(ex.soalList) || ex.soalList.length === 0) return;
      const paketName = inferCbtPaketName(ex.judul, ex.paketName);
      const subPaket = ex.subPaket || 'Paket 1';
      dynamicTeacherExams.push({
        id: ex.id,
        category: 'cbt',
        mapel: ex.mapel,
        judul: `${paketName} - ${ex.mapel} (${subPaket})`,
        durasiMenit: ex.durasiMenit || 60,
        paketName,
        subPaket,
        kelas: ex.kelas,
        isTeacherCreated: true,
        soalList: ex.soalList,
      });
    });

    const sampleCbtDefaults: ExamOptionItem[] = [
      {
        id: 'cbt_ipas_as1',
        category: 'cbt',
        mapel: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        judul: 'Sumatif 1 (AS 1) - Organ Tubuh & Sistem Pernapasan Manusia (Paket 1)',
        durasiMenit: 60,
        paketName: 'Sumatif 1 (AS 1)',
        subPaket: 'Paket 1',
        kelas: currentStudent?.kelas || activeClass,
        soalList: [
          {
            id: 'cbt_q1',
            tipe: 'pg',
            pertanyaan: 'Organ tubuh manusia yang berfungsi sebagai organ utama pernapasan dan tempat pertukaran oksigen dengan karbondioksida adalah...',
            opsi: ['A. Paru-paru', 'B. Jantung', 'C. Lambung', 'D. Ginjal'],
            kunciJawaban: 'A',
            bobot: 20,
            pembahasan: 'Paru-paru adalah organ utama sistem pernapasan manusia tempat terjadinya difusi O2 dan CO2 di alveolus.',
          },
          {
            id: 'cbt_q2',
            tipe: 'pg',
            pertanyaan: 'Bagian darah yang bertugas mengangkut oksigen ke seluruh sel-sel tubuh adalah...',
            opsi: ['A. Sel darah putih (Leukosit)', 'B. Sel darah merah (Eritrosit)', 'C. Keping darah (Trombosit)', 'D. Plasma darah'],
            kunciJawaban: 'B',
            bobot: 20,
            pembahasan: 'Eritrosit mengandung hemoglobin yang mengikat oksigen untuk diedarkan ke seluruh tubuh.',
          },
          {
            id: 'cbt_q3',
            tipe: 'pg',
            pertanyaan: 'Hewan berikut ini bernapas menggunakan trakea adalah...',
            opsi: ['A. Ikan mas', 'B. Belalang', 'C. Katak dewasa', 'D. Cacing tanah'],
            kunciJawaban: 'B',
            bobot: 20,
            pembahasan: 'Serangga seperti belalang bernapas menggunakan pembuluh trakea.',
          },
          {
            id: 'cbt_q4',
            tipe: 'pg',
            pertanyaan: 'Peredaran darah dari jantung menuju ke seluruh tubuh dan kembali lagi ke jantung disebut...',
            opsi: ['A. Peredaran darah kecil', 'B. Peredaran darah besar', 'C. Peredaran darah terbuka', 'D. Peredaran getah bening'],
            kunciJawaban: 'B',
            bobot: 20,
            pembahasan: 'Peredaran darah sistemik (besar) mengalirkan darah dari ventrikel kiri jantung ke seluruh tubuh lalu kembali ke atrium kanan.',
          },
          {
            id: 'cbt_q5',
            tipe: 'pg',
            pertanyaan: 'Upaya menjaga kesehatan sistem pernapasan pada masa pancaroba adalah...',
            opsi: ['A. Merokok di ruangan tertutup', 'B. Menggunakan masker saat berdebu dan berolahraga rutin', 'C. Tidur larut malam setiap hari', 'D. Mengonsumsi makanan berpengawet tinggi'],
            kunciJawaban: 'B',
            bobot: 20,
            pembahasan: 'Menggunakan masker dan berolahraga secara teratur menjaga imunitas dan saluran pernapasan tetap bersih.',
          },
        ],
      },
      {
        id: 'cbt_mtk_as2',
        category: 'cbt',
        mapel: 'Matematika',
        judul: 'Sumatif 2 (AS 2) - Operasi Hitung Campuran Bilangan Bulat (Paket 1)',
        durasiMenit: 60,
        paketName: 'Sumatif 2 (AS 2)',
        subPaket: 'Paket 1',
        kelas: currentStudent?.kelas || activeClass,
        soalList: [
          {
            id: 'cbt_m1',
            tipe: 'pg',
            pertanyaan: 'Hasil dari 150 + 25 × 4 - 100 adalah...',
            opsi: ['A. 150', 'B. 600', 'C. 175', 'D. 250'],
            kunciJawaban: 'A',
            bobot: 25,
            pembahasan: 'Dahulukan perkalian: 25 x 4 = 100. Kemudian 150 + 100 - 100 = 150.',
          },
          {
            id: 'cbt_m2',
            tipe: 'pg',
            pertanyaan: 'Suhu di dalam lemari es mula-mula -4°C. Ketika listrik padam, suhu naik 2°C setiap 10 menit. Setelah 30 menit, suhu lemari es menjadi...',
            opsi: ['A. 2°C', 'B. -2°C', 'C. 6°C', 'D. 0°C'],
            kunciJawaban: 'A',
            bobot: 25,
            pembahasan: 'Kenaikan suhu = (30 / 10) x 2°C = 6°C. Suhu akhir = -4°C + 6°C = 2°C.',
          },
          {
            id: 'cbt_m3',
            tipe: 'pg',
            pertanyaan: 'FPB dari bilangan 36, 54, dan 72 adalah...',
            opsi: ['A. 9', 'B. 12', 'C. 18', 'D. 24'],
            kunciJawaban: 'C',
            bobot: 25,
            pembahasan: 'Faktor persekutuan terbesar dari 36, 54, dan 72 adalah 18.',
          },
          {
            id: 'cbt_m4',
            tipe: 'pg',
            pertanyaan: 'Ibu memiliki 3 kantong beras, masing-masing berisi 2,5 kg. Beras tersebut dibagikan kepada 5 orang tetangga sama rata. Setiap tetangga menerima...',
            opsi: ['A. 1,5 kg', 'B. 1,2 kg', 'C. 1,8 kg', 'D. 2,0 kg'],
            kunciJawaban: 'A',
            bobot: 25,
            pembahasan: 'Total beras = 3 x 2,5 = 7,5 kg. Dibagi 5 orang = 7,5 / 5 = 1,5 kg.',
          },
        ],
      },
      {
        id: 'cbt_asts_indo',
        category: 'cbt',
        mapel: 'Bahasa Indonesia',
        judul: 'ASTS (Sumatif Tengah Semester) - Bahasa Indonesia (Paket 1)',
        durasiMenit: 90,
        paketName: 'ASTS (Sumatif Tengah Semester)',
        subPaket: 'Paket 1',
        kelas: currentStudent?.kelas || activeClass,
        soalList: [
          {
            id: 'cbt_bi1',
            tipe: 'pg',
            pertanyaan: 'Teks yang berisi penjelasan mengenai peristiwa alam, sosial, atau budaya secara ilmiah disebut teks...',
            opsi: ['A. Narasi', 'B. Eksplanasi', 'C. Fiksi', 'D. Deskripsi'],
            kunciJawaban: 'B',
            bobot: 33,
            pembahasan: 'Teks eksplanasi menjelaskan proses terjadinya suatu fenomena alam atau sosial dengan kausalitas.',
          },
          {
            id: 'cbt_bi2',
            tipe: 'pg',
            pertanyaan: 'Ide pokok pada paragraf induktif berada di...',
            opsi: ['A. Awal paragraf', 'B. Akhir paragraf', 'C. Awal dan akhir paragraf', 'D. Tengah paragraf'],
            kunciJawaban: 'B',
            bobot: 33,
            pembahasan: 'Paragraf induktif menyajikan kalimat-kalimat penjelas terlebih dahulu kemudian disimpulkan di akhir paragraf.',
          },
          {
            id: 'cbt_bi3',
            tipe: 'pg',
            pertanyaan: 'Kata tanya yang tepat untuk menggali alasan atau penyebab terjadinya suatu fenomena adalah...',
            opsi: ['A. Siapa', 'B. Kapan', 'C. Mengapa', 'D. Dimana'],
            kunciJawaban: 'C',
            bobot: 34,
            pembahasan: 'Kata tanya "Mengapa" menanyakan sebab atau alasan peristiwa terjadi.',
          },
        ],
      },
      {
        id: 'cbt_asas_pancasila',
        category: 'cbt',
        mapel: 'Pendidikan Pancasila',
        judul: 'ASAS (Sumatif Akhir Semester) - Pendidikan Pancasila (Paket 1)',
        durasiMenit: 90,
        paketName: 'ASAS (Sumatif Akhir Semester)',
        subPaket: 'Paket 1',
        kelas: currentStudent?.kelas || activeClass,
        soalList: [
          {
            id: 'cbt_p1',
            tipe: 'pg',
            pertanyaan: 'Sila dalam Pancasila yang mendasari pentingnya musyawarah untuk mencapai mufakat adalah sila ke-...',
            opsi: ['A. 2', 'B. 3', 'C. 4', 'D. 5'],
            kunciJawaban: 'C',
            bobot: 34,
            pembahasan: 'Sila ke-4: Kerakyatan yang Dipimpin oleh Hikmat Kebijaksanaan dalam Permusyawaratan/Perwakilan.',
          },
          {
            id: 'cbt_p2',
            tipe: 'pg',
            pertanyaan: 'Mendapatkan kasih sayang dan pendidikan yang layak dari orang tua di rumah merupakan contoh...',
            opsi: ['A. Hak anak', 'B. Kewajiban anak', 'C. Hukuman anak', 'D. Paksaan anak'],
            kunciJawaban: 'A',
            bobot: 33,
            pembahasan: 'Kasih sayang dan pendidikan adalah hak dasar yang wajib dipenuhi orang tua untuk anak.',
          },
          {
            id: 'cbt_p3',
            tipe: 'pg',
            pertanyaan: 'Sikap yang harus kita tunjukkan ketika pendapat kita tidak diterima dalam musyawarah kelas adalah...',
            opsi: ['A. Marah dan meninggalkan ruangan', 'B. Menerima dengan lapang dada demi kepentingan bersama', 'C. Memaksa teman agar sependapat', 'D. Mogok belajar'],
            kunciJawaban: 'B',
            bobot: 33,
            pembahasan: 'Musyawarah menuntut sikap lapang dada menghargai keputusan mufakat bersama.',
          },
        ],
      },
    ];

    const merged = [...dynamicTeacherExams];
    sampleCbtDefaults.forEach((sample) => {
      const alreadyHasSameBucket = dynamicTeacherExams.some(
        (d) =>
          d.paketName === sample.paketName &&
          d.mapel === sample.mapel &&
          (d.subPaket || 'Paket 1') === (sample.subPaket || 'Paket 1')
      );
      if (!alreadyHasSameBucket) {
        merged.push(sample);
      }
    });

    return merged;
  }, [viewMode, currentStudent?.kelas, activeClass]);

  // Daftar Ujian TKA (Dinamis dikelompokkan per Jenis TKA + Mata Pelajaran dari Bank Soal TKA Guru)
  const tkaExamList: ExamOptionItem[] = useMemo(() => {
    const storedTkaQuestions = getStoredTKAQuestions();
    const groupedMap = new Map<string, { jenisTka: string; mapel: string; list: CBTQuestion[] }>();

    storedTkaQuestions.forEach((q) => {
      const jenis = q.jenisTka || 'Simulasi 1';
      const mapel = q.mapel || 'Bahasa Indonesia';
      const key = `${jenis}__${mapel}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, { jenisTka: jenis, mapel, list: [] });
      }
      groupedMap.get(key)!.list.push(q);
    });

    const slug = (v: string) =>
      v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    const dynamicTkaExams: ExamOptionItem[] = Array.from(groupedMap.values()).map((grp) => ({
      id: `tka_live_${slug(grp.jenisTka)}_${slug(grp.mapel)}`,
      category: 'tka',
      mapel: grp.mapel,
      judul: `${grp.jenisTka} - ${grp.mapel}`,
      durasiMenit: 60,
      paketName: grp.jenisTka,
      subPaket: 'Paket 1',
      isTeacherCreated: true,
      soalList: grp.list,
    }));

    const sampleTkaDefaults: ExamOptionItem[] = [
      {
        id: 'tka_indo_tp612',
        category: 'tka',
        mapel: 'Bahasa Indonesia',
        judul: 'Tryout TKA 1 - Bahasa Indonesia',
        durasiMenit: 90,
        paketName: 'Tryout TKA 1',
        subPaket: 'Paket 1',
        soalList: [
          {
            id: 'tka_bi1',
            tipe: 'pg',
            pertanyaan: 'Bacalah teks berikut:\n"Penggunaan gawai tanpa pengawasan dapat memicu kecanduan serta menurunkan interaksi sosial anak dengan lingkungan nyata. Oleh karena itu, batasan waktu pemakaian gawai wajib diterapkan orang tua secara konsisten."\n\nSimpulan logis paling tepat dari argumen di atas adalah...',
            opsi: [
              'A. Pengawasan gawai secara konsisten oleh orang tua mencegah kecanduan dan menjaga interaksi sosial anak.',
              'B. Anak tidak boleh menyentuh gawai sama sekali di lingkungan sekolah maupun rumah.',
              'C. Gawai adalah penyebab tunggal rusaknya interaksi antar teman sebaya.',
              'D. Orang tua tidak perlu membatasi waktu jika anak berprestasi.',
            ],
            kunciJawaban: 'A',
            bobot: 50,
            pembahasan: 'Simpulan merangkum sebab akibat teks: pengawasan batasan waktu mengatasi dampak kecanduan.',
          },
          {
            id: 'tka_bi2',
            tipe: 'pg',
            pertanyaan: 'Manakah dari kalimat berikut yang mengandung fakta dan bukan sekadar opini subjektif?',
            opsi: [
              'A. Cuaca Jakarta hari ini terasa paling indah dibandingkan kota lain di dunia.',
              'B. Berdasarkan data BMKG, suhu udara Jakarta Utara pada pukul 12.00 mencapai 32 derajat Celsius.',
              'C. Makanan di kantin sekolah adalah makanan paling lezat di seluruh nusantara.',
              'D. Pelajaran Matematika selalu menyenangkan bagi semua peserta didik tanpa kecuali.',
            ],
            kunciJawaban: 'B',
            bobot: 50,
            pembahasan: 'Kalimat B dapat dibuktikan dengan data empiris BMKG yang obyektif sehingga berstatus fakta.',
          },
        ],
      },
      {
        id: 'tka_mtk_tp621',
        category: 'tka',
        mapel: 'Matematika',
        judul: 'Tryout TKA 2 - Matematika',
        durasiMenit: 90,
        paketName: 'Tryout TKA 2',
        subPaket: 'Paket 1',
        soalList: [
          {
            id: 'tka_mtk1',
            tipe: 'pg',
            pertanyaan: 'Sebuah denah ruang kelas digambar dengan skala 1 : 100. Jika panjang kelas pada denah adalah 8 cm dan lebar 6 cm, maka luas sebenarnya ruang kelas tersebut adalah...',
            opsi: ['A. 48 meter persegi', 'B. 480 meter persegi', 'C. 24 meter persegi', 'D. 14 meter persegi'],
            kunciJawaban: 'A',
            bobot: 50,
            pembahasan: 'Panjang asli = 8 x 100 cm = 8 m. Lebar asli = 6 x 100 cm = 6 m. Luas = 8 m x 6 m = 48 m².',
          },
          {
            id: 'tka_mtk2',
            tipe: 'pg',
            pertanyaan: 'Sebuah akuarium berbentuk balok dengan panjang 80 cm, lebar 50 cm, dan tinggi 60 cm terisi air 3/4 bagian. Volume air di dalam akuarium tersebut adalah...',
            opsi: ['A. 180 liter', 'B. 240 liter', 'C. 120 liter', 'D. 360 liter'],
            kunciJawaban: 'A',
            bobot: 50,
            pembahasan: 'Volume penuh = 80 x 50 x 60 = 240.000 cm³ = 240 liter. Terisi 3/4 bagian = 3/4 x 240 liter = 180 liter.',
          },
        ],
      },
      {
        id: 'tka_ipas_tp631',
        category: 'tka',
        mapel: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        judul: 'Tryout TKA 3 - Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        durasiMenit: 90,
        paketName: 'Tryout TKA 3',
        subPaket: 'Paket 1',
        soalList: [
          {
            id: 'tka_ip1',
            tipe: 'pg',
            pertanyaan: 'Dalam rantai makanan sawah: Padi -> Belalang -> Katak -> Ular -> Elang. Jika populasi katak menurun drastis akibat perburuan liar, dampak langsung yang terjadi pada ekosistem adalah...',
            opsi: [
              'A. Populasi belalang meningkat pesat dan produksi padi terancam rusak',
              'B. Populasi ular bertambah banyak dengan cepat',
              'C. Populasi elang meningkat berlipat ganda',
              'D. Populasi padi menjadi berlimpah ruah tanpa gangguan',
            ],
            kunciJawaban: 'A',
            bobot: 50,
            pembahasan: 'Katak adalah predator belalang. Jika katak berkurang, belalang berkembang biak tanpa kendali dan memangsa padi.',
          },
          {
            id: 'tka_ip2',
            tipe: 'pg',
            pertanyaan: 'Manakah tindakan konservasi energi terbarukan berikut yang paling berdampak langsung mengurangi emisi karbon jangka panjang?',
            opsi: [
              'A. Menggunakan pembangkit listrik tenaga surya (solar panel) mandiri di sekolah',
              'B. Menyalakan lampu halaman saat siang hari',
              'C. Membakar sampah plastik di pekarangan belakang',
              'D. Menggunakan kendaraan bermotor bahan bakar fosil untuk jarak 100 meter',
            ],
            kunciJawaban: 'A',
            bobot: 50,
            pembahasan: 'Pembangkit listrik tenaga surya memanfaatkan sinar matahari bebas emisi karbon.',
          },
        ],
      },
    ];

    const merged = [...dynamicTkaExams];
    sampleTkaDefaults.forEach((sample) => {
      const exists = dynamicTkaExams.some(
        (d) => d.paketName === sample.paketName && d.mapel === sample.mapel
      );
      if (!exists) {
        merged.push(sample);
      }
    });

    return merged;
  }, [viewMode]);

  // Daftar ujian yang aktif tergantung mode (CBT atau TKA)
  const currentAvailableExams = viewMode === 'tka' ? tkaExamList : cbtExamList;

  // Daftar opsi unik Paket Soal & Mata Pelajaran untuk dropdown
  const availablePaketOptions = useMemo(() => {
    const set = new Set<string>();
    if (viewMode === 'tka') {
      TKA_JENIS_LIST.forEach((j) => set.add(j));
    }
    currentAvailableExams.forEach((e) => set.add(e.paketName));
    return Array.from(set);
  }, [currentAvailableExams, viewMode]);

  const availableMapelOptions = useMemo(() => {
    const set = new Set<string>();
    if (viewMode === 'tka') {
      TKA_MAPEL_LIST.forEach((m) => set.add(m));
    }
    currentAvailableExams
      .filter((e) => !selectedPaketFilter || e.paketName === selectedPaketFilter)
      .forEach((e) => set.add(e.mapel));
    if (set.size === 0) {
      currentAvailableExams.forEach((e) => set.add(e.mapel));
    }
    return Array.from(set);
  }, [currentAvailableExams, selectedPaketFilter, viewMode]);

  // Daftar ujian tersaring sesuai Paket Soal & Mapel yang dipilih siswa
  const filteredExamsForDropdown = useMemo(() => {
    return currentAvailableExams.filter((e) => {
      if (selectedPaketFilter && e.paketName !== selectedPaketFilter) return false;
      if (selectedMapelFilter && e.mapel !== selectedMapelFilter) return false;
      return true;
    });
  }, [currentAvailableExams, selectedPaketFilter, selectedMapelFilter]);

  // Otomatis pilih ujian jika paket & mapel sudah dipilih dan tersedia
  useEffect(() => {
    if (isExamRunning) return;
    if (selectedPaketFilter && selectedMapelFilter) {
      if (filteredExamsForDropdown.length > 0) {
        const stillValid = filteredExamsForDropdown.some((e) => e.id === selectedExamId);
        if (!stillValid) {
          setSelectedExamId(filteredExamsForDropdown[0].id);
        }
      } else {
        setSelectedExamId('');
      }
    } else if (selectedExamId && !filteredExamsForDropdown.some((e) => e.id === selectedExamId)) {
      setSelectedExamId('');
    }
  }, [selectedPaketFilter, selectedMapelFilter, filteredExamsForDropdown, isExamRunning]);

  // Ujian yang sedang dipilih
  const currentExam = useMemo(() => {
    return currentAvailableExams.find((e) => e.id === selectedExamId) || null;
  }, [currentAvailableExams, selectedExamId]);

  const activeExamSoalList = useMemo(() => {
    if (isExamRunning && runningSoalList.length > 0) return runningSoalList;
    return currentExam?.soalList || [];
  }, [isExamRunning, runningSoalList, currentExam]);

  // Evaluasi skor mendukung baik format kunci huruf ("A"/"B") maupun teks penuh opsi ("Jantung")
  const gradeQuestionAnswer = (q: CBTQuestion, studentAns: any): { isCorrect: boolean; earnedScore: number } => {
    if (studentAns === undefined || studentAns === null || studentAns === '') {
      return { isCorrect: false, earnedScore: 0 };
    }
    if (q.tipe === 'pg' && q.opsi && q.opsi.length > 0) {
      const ansStr = typeof studentAns === 'object' ? studentAns.text || studentAns.key || '' : String(studentAns);
      const ansKey = typeof studentAns === 'object' ? studentAns.key || '' : '';
      const keyNorm = normalizeString(String(q.kunciJawaban || ''));

      // Cocokkan teks langsung ATAU huruf opsi ('A','B','C','D') ATAU awalan 'A. ...'
      const optIdx = q.opsi.findIndex((o) => normalizeString(o) === normalizeString(ansStr));
      const derivedKey = optIdx >= 0 ? String.fromCharCode(65 + optIdx).toLowerCase() : normalizeString(ansKey);

      const isDirectText = normalizeString(ansStr) === keyNorm;
      const isLetterKey = derivedKey !== '' && derivedKey === keyNorm;
      const isOptionAtKeyLetter =
        keyNorm.length === 1 &&
        keyNorm >= 'a' &&
        keyNorm <= 'z' &&
        optIdx >= 0 &&
        optIdx === keyNorm.charCodeAt(0) - 97;
      const isPrefixMatch =
        ansStr.trim().charAt(1) === '.' &&
        normalizeString(ansStr.trim().charAt(0)) === keyNorm;

      const correct = isDirectText || isLetterKey || isOptionAtKeyLetter || isPrefixMatch;
      return { isCorrect: correct, earnedScore: correct ? q.bobot : 0 };
    }
    if (q.tipe === 'pg_kompleks') {
      const selectedArr: string[] = Array.isArray(studentAns) ? studentAns : [String(studentAns)];
      const directRes = evaluateQuestionScore('pg_kompleks', selectedArr, q.kunciJawaban, q.bobot);
      if (directRes.earnedScore > 0) return directRes;
      // Fallback jika kunci disimpan dalam huruf A/B/C/D dan jawaban disimpan sebagai teks opsi
      if (q.opsi && q.opsi.length > 0) {
        const mappedLetters = selectedArr.map((txt) => {
          const idx = q.opsi!.findIndex((o) => normalizeString(o) === normalizeString(txt));
          return idx >= 0 ? String.fromCharCode(65 + idx) : txt;
        });
        return evaluateQuestionScore('pg_kompleks', mappedLetters, q.kunciJawaban, q.bobot);
      }
      return directRes;
    }
    return evaluateQuestionScore(q.tipe, studentAns, q.kunciJawaban, q.bobot);
  };

  // Timer interval saat ujian berlangsung
  useEffect(() => {
    let timer: any;
    if (isExamRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleFinishExam(true); // Auto-submit ketika waktu habis!
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isExamRunning, timeLeft]);

  // Handler mulai ujian (mengunci dropdown dan memunculkan soal)
  const handleStartExam = () => {
    if (!currentExam) {
      showToast('Pilih paket soal dan mata pelajaran terlebih dahulu!', 'error');
      return;
    }
    if (currentExam.soalList.length === 0) {
      showToast('Belum ada butir soal pada paket yang dipilih.', 'error');
      return;
    }

    const acakSoal =
      viewMode === 'tka'
        ? localStorage.getItem('sekolahku_tka_acak_soal') === 'true'
        : localStorage.getItem('sekolahku_cbt_acak_soal') === 'true';
    const acakJawaban =
      viewMode === 'tka'
        ? localStorage.getItem('sekolahku_tka_acak_jawaban') === 'true'
        : localStorage.getItem('sekolahku_cbt_acak_jawaban') === 'true';

    let preparedList = [...currentExam.soalList];
    if (acakSoal) {
      preparedList = [...preparedList].sort(() => Math.random() - 0.5);
    }
    if (acakJawaban) {
      preparedList = preparedList.map((q) => {
        if (q.opsi && q.opsi.length > 0) {
          return {
            ...q,
            opsi: [...q.opsi].sort(() => Math.random() - 0.5),
          };
        }
        return q;
      });
    }

    setRunningSoalList(preparedList);
    setTimeLeft(currentExam.durasiMenit * 60);
    setCurrentQIndex(0);
    setAnswers({});
    setExamResult(null);
    setIsExamRunning(true);
    showToast(`Ujian "${currentExam.judul}" dimulai! Waktu Anda: ${currentExam.durasiMenit} Menit.`, 'success');
  };

  // Handler submit ujian (manual atau auto-submit ketika timer 0)
  const handleFinishExam = (isAutoSubmit: boolean = false) => {
    if (!currentExam) return;

    const evaluatedQuestions = activeExamSoalList.length > 0 ? activeExamSoalList : currentExam.soalList;
    let earned = 0;
    let max = 0;

    evaluatedQuestions.forEach((q) => {
      max += q.bobot || 10;
      const ans = answers[q.id];
      const evalRes = gradeQuestionAnswer(q, ans);
      earned += evalRes.earnedScore;
    });

    const finalGrade = max > 0 ? Math.round((earned / max) * 100) : 100;
    setExamResult({ score: finalGrade, maxScore: 100 });
    setIsExamRunning(false);

    // Rekam ke CBT Results di storage
    const storedRes = getStoredCBTResults();
    storedRes.push({
      examId: currentExam.id,
      studentId: currentStudent.id,
      studentName: currentStudent.nama,
      skor: earned,
      nilai: finalGrade,
      waktuSelesai: new Date().toLocaleTimeString(),
      jawabanSiswa: answers,
    });
    saveStoredCBTResults(storedRes);

    // Jika TKA, rekam juga ke TKA Submissions agar muncul di Hasil/Rapor TKA
    if (currentExam.category === 'tka') {
      try {
        const existingSubs = getStoredTKASubmissions();
        const normMapelKey: 'Bahasa Indonesia' | 'Matematika' | 'IPAS' | 'Bahasa Inggris' | 'Koding dan Kecerdasan Artifisial (KKA)' =
          currentExam.mapel.includes('IPAS')
            ? 'IPAS'
            : currentExam.mapel.includes('Koding') || currentExam.mapel.includes('KKA')
            ? 'Koding dan Kecerdasan Artifisial (KKA)'
            : currentExam.mapel === 'Matematika'
            ? 'Matematika'
            : currentExam.mapel === 'Bahasa Inggris'
            ? 'Bahasa Inggris'
            : 'Bahasa Indonesia';

        const prevSub = existingSubs.find(
          (s) => s.studentId === currentStudent.id && s.paket === currentExam.paketName
        );
        const updatedScores = {
          'Bahasa Indonesia': prevSub?.scoresPerMapel?.['Bahasa Indonesia'] ?? 80,
          'Matematika': prevSub?.scoresPerMapel?.['Matematika'] ?? 80,
          'IPAS': prevSub?.scoresPerMapel?.['IPAS'] ?? 80,
          'Bahasa Inggris': prevSub?.scoresPerMapel?.['Bahasa Inggris'] ?? 80,
          'Koding dan Kecerdasan Artifisial (KKA)': prevSub?.scoresPerMapel?.['Koding dan Kecerdasan Artifisial (KKA)'] ?? 80,
          [normMapelKey]: finalGrade,
        };
        const avgTotal = Math.round(
          (updatedScores['Bahasa Indonesia'] +
            updatedScores['Matematika'] +
            updatedScores['IPAS'] +
            updatedScores['Bahasa Inggris'] +
            updatedScores['Koding dan Kecerdasan Artifisial (KKA)']) /
            5
        );
        const predikat: 'A' | 'B' | 'C' | 'D' =
          avgTotal >= 88 ? 'A' : avgTotal >= 78 ? 'B' : avgTotal >= 68 ? 'C' : 'D';
        const newSub = {
          id: `sub_${currentStudent.id}_${currentExam.paketName.replace(/\s+/g, '_')}_${Date.now()}`,
          studentId: currentStudent.id,
          studentName: currentStudent.nama,
          nisn: currentStudent.nisn,
          kelas: currentStudent.kelas,
          fotoUrl: currentStudent.fotoUrl,
          paket: currentExam.paketName,
          answers,
          scoresPerMapel: updatedScores,
          skorTotal: avgTotal,
          predikat,
          status: (avgTotal >= 75 ? 'Tuntas' : 'Remedial') as 'Tuntas' | 'Remedial',
          tanggalUjian: new Date().toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          }),
          durasiPengerjaan: `${Math.max(1, currentExam.durasiMenit - Math.floor(timeLeft / 60))} Menit`,
        };
        const otherSubs = existingSubs.filter(
          (s) => !(s.studentId === currentStudent.id && s.paket === currentExam.paketName)
        );
        saveStoredTKASubmissions([newSub, ...otherSubs]);
      } catch (tkaErr) {
        console.warn('Sync TKA submission error:', tkaErr);
      }
    }

    // Sinkronisasi ke asesmen siswa secara otomatis
    try {
      const filters = getActiveFilters();
      const targetClass = currentStudent?.kelas || activeClass;
      const normMapel = currentExam.mapel.toLowerCase();
      const matchedSubject = subjects.find((s) => {
        const sn = (s.name || '').toLowerCase();
        const sc = (s.code || '').toUpperCase();
        return (
          sn === normMapel ||
          sn.includes(normMapel) ||
          normMapel.includes(sn) ||
          ((normMapel.includes('koding') || normMapel.includes('kka')) &&
            (sc.startsWith('KKA') || sn.includes('koding') || sn.includes('kka')))
        );
      });
      const subjectMap: Record<string, string> = {
        'Pendidikan Agama Islam': 's_pabp_islam',
        'Pendidikan Pancasila': 's_pancasila',
        'Bahasa Indonesia': 's_bindonesia',
        'Matematika': 's_matematika',
        'Ilmu Pengetahuan Alam dan Sosial (IPAS)': 's_ipas',
        'Seni Rupa': 's_senirupa',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)': 's_pjok',
        'Bahasa Inggris': 's_binggris',
        'Muatan Lokal (PLBJ)': 's_plbj',
        'Koding dan Kecerdasan Artifisial (KKA)': 's_k6_kka',
      };
      const subId = matchedSubject?.id || subjectMap[currentExam.mapel] || 's_bindonesia';
      const assessKey = `${filters.year}_${filters.semester}_${targetClass}_${subId}`;
      const existing = getStoredAssessments(assessKey);

      if (!existing[currentStudent.id]) {
        existing[currentStudent.id] = { sumatif: {}, remedial: {}, asts: 0, asas: 0 };
      }

      const isRemedial = currentExam.paketName.toLowerCase().includes('remedial');
      if (currentExam.paketName.toUpperCase().includes('ASTS')) {
        existing[currentStudent.id].asts = finalGrade;
      } else if (currentExam.paketName.toUpperCase().includes('ASAS')) {
        existing[currentStudent.id].asas = finalGrade;
      } else {
        const asMatch = currentExam.paketName.match(/(?:Sumatif|Remedial|AS|UH)\s*(?:Inklusi\s*)?(\d+)/i);
        if (asMatch) {
          const idx = parseInt(asMatch[1]);
          if (isRemedial) {
            existing[currentStudent.id].remedial[idx] = finalGrade;
          } else {
            existing[currentStudent.id].sumatif[idx] = finalGrade;
          }
        }
      }
      saveStoredAssessments(assessKey, existing);
    } catch (e) {
      console.warn('Sync assessment error:', e);
    }

    if (isAutoSubmit) {
      showToast(
        `Waktu telah habis! Jawaban Anda otomatis terkirim. Nilai Anda: ${finalGrade}`,
        'error'
      );
    } else {
      showToast(
        `Selamat! Ujian telah selesai dikerjakan. Nilai Akhir: ${finalGrade}`,
        'success'
      );
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // =========================================================================
  // VIEW 1: DASHBOARD CARDS UTAMA SISWA (4 MENU KARTU GRID)
  // =========================================================================
  if (viewMode === 'home') {
    return (
      <section className="space-y-6">
        {/* Hero Greeting Siswa */}
        <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-amber-600 p-6 sm:p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
              <img
                src={currentStudent.fotoUrl}
                alt={currentStudent.nama}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl object-cover bg-white p-1 border-3 border-yellow-300 shadow-xl shrink-0"
              />
              <div>
                <span className="inline-block bg-yellow-300 text-slate-900 text-xs font-black px-3.5 py-1 rounded-full uppercase tracking-wider mb-2">
                  Portal Pembelajaran Digital Siswa
                </span>
                <h1 className="text-2xl sm:text-3xl font-display font-black leading-tight">
                  Halo, {currentStudent.nama}!
                </h1>
                <p className="text-rose-100 text-xs sm:text-sm mt-1">
                  {currentStudent.kelas} • NISN: {currentStudent.nisn} • No. Barcode: {currentStudent.barcodeId}
                </p>
                <p className="text-yellow-200 text-xs font-semibold mt-1">
                  {profile.name} • Kurikulum Merdeka • TA {activeYear} ({activeSemester})
                </p>
              </div>
            </div>

            <div className="bg-white/15 backdrop-blur-md p-4 rounded-3xl border border-white/20 text-center sm:text-right shrink-0">
              <span className="text-[11px] font-extrabold uppercase text-yellow-200 block">Status Siswa</span>
              <span className="text-base font-black text-white block mt-0.5">
                {currentStudent.kebutuhanKhusus && currentStudent.kebutuhanKhusus !== 'Tidak Ada (Reguler)'
                  ? `Inklusi (${currentStudent.kebutuhanKhusus})`
                  : 'Siswa Reguler Aktif'}
              </span>
              <span className="text-[10px] text-rose-100 block mt-1">
                Akses Ujian CBT, TKA &amp; Laporan Rapor
              </span>
            </div>
          </div>
        </div>

        {/* 4 MENU UTAMA SISWA (DASHBOARD CARDS GRID) */}
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-display font-black text-slate-800 flex items-center gap-2">
              <Layers className="w-5 h-5 text-rose-600" /> Fitur Pembelajaran &amp; Evaluasi Siswa
            </h2>
            <p className="text-xs text-slate-500">
              Pilih salah satu dari 4 modul utama di bawah ini untuk memulai asesmen atau memantau capaian belajar:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1: Ujian CBT */}
            <div
              onClick={() => {
                setViewMode('cbt');
                setSelectedExamId('');
                setIsExamRunning(false);
              }}
              className="group bg-white p-6 rounded-3xl border-2 border-rose-200 hover:border-rose-500 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden"
            >
              <div className="space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 group-hover:bg-rose-600 text-rose-600 group-hover:text-white flex items-center justify-center transition shadow-xs">
                  <Laptop className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-rose-600 tracking-wider">Modul Asesmen 1</span>
                  <h3 className="font-display font-black text-lg text-slate-800 group-hover:text-rose-600 transition">
                    Ujian CBT
                  </h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Akses ujian harian formatif/sumatif (AS 1 - AS 6), Asesmen Sumatif Tengah Semester (ASTS), dan Akhir Semester (ASAS).
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-rose-100 flex items-center justify-between text-xs font-black text-rose-600 group-hover:text-rose-700">
                <span>Mulai Ujian CBT</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
              </div>
            </div>

            {/* Card 2: TKA (Tes Kemampuan Akademik) */}
            <div
              onClick={() => {
                setViewMode('tka');
                setSelectedExamId('');
                setIsExamRunning(false);
              }}
              className="group bg-white p-6 rounded-3xl border-2 border-purple-200 hover:border-purple-500 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden"
            >
              <div className="space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-purple-50 group-hover:bg-purple-600 text-purple-600 group-hover:text-white flex items-center justify-center transition shadow-xs">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-purple-600 tracking-wider">Modul Asesmen 2</span>
                  <h3 className="font-display font-black text-lg text-slate-800 group-hover:text-purple-600 transition">
                    TKA (Tes Kemampuan Akademik)
                  </h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Uji target capaian belajar tingkat tinggi (C3/C4/C6), pemecahan masalah kontekstual, dan simulasi soal AKM/Tryout.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-purple-100 flex items-center justify-between text-xs font-black text-purple-600 group-hover:text-purple-700">
                <span>Buka Menu TKA</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
              </div>
            </div>

            {/* Card 3: Hasil E-Rapor */}
            <div
              onClick={() => onNavigateTab('rapor')}
              className="group bg-white p-6 rounded-3xl border-2 border-amber-200 hover:border-amber-500 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden"
            >
              <div className="space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 group-hover:bg-amber-500 text-amber-600 group-hover:text-white flex items-center justify-center transition shadow-xs">
                  <Award className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider">Modul Pelaporan 1</span>
                  <h3 className="font-display font-black text-lg text-slate-800 group-hover:text-amber-600 transition">
                    Hasil E-Rapor
                  </h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Lihat nilai akhir akademik intrakurikuler seluruh mata pelajaran, catatan wali kelas, predikat, dan cetak pratinjau lembar rapor.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-amber-100 flex items-center justify-between text-xs font-black text-amber-600 group-hover:text-amber-700">
                <span>Buka Lembar e-Rapor</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
              </div>
            </div>

            {/* Card 4: Raport Kurikulum (P5) */}
            <div
              onClick={() => onNavigateTab('rapor-kokurikuler')}
              className="group bg-white p-6 rounded-3xl border-2 border-emerald-200 hover:border-emerald-500 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden"
            >
              <div className="space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 group-hover:bg-emerald-600 text-emerald-600 group-hover:text-white flex items-center justify-center transition shadow-xs">
                  <Sprout className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Modul Pelaporan 2</span>
                  <h3 className="font-display font-black text-lg text-slate-800 group-hover:text-emerald-600 transition">
                    Raport Kurikulum (P5)
                  </h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Periksa penilaian Projek Penguatan Profil Pelajar Pancasila (P5), dimensi karakter beriman, gotong royong, dan bernalar kritis.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-emerald-100 flex items-center justify-between text-xs font-black text-emerald-600 group-hover:text-emerald-700">
                <span>Buka Rapor P5</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
              </div>
            </div>

            {/* Card 5: Laporan 7 Kebiasaan */}
            <div
              onClick={() => setViewMode('kebiasaan')}
              className="group bg-white p-6 rounded-3xl border-2 border-amber-300 hover:border-amber-500 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden ring-4 ring-amber-100/50"
            >
              <div className="space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 group-hover:bg-amber-500 text-amber-600 group-hover:text-white flex items-center justify-center transition shadow-xs">
                  <HeartHandshake className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider">Karakter &amp; Pembiasaan</span>
                  <h3 className="font-display font-black text-lg text-slate-800 group-hover:text-amber-600 transition">
                    Laporan 7 Kebiasaan
                  </h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Isi formulir 7 kebiasaan baik harianmu: bangun pagi, ibadah, sarapan, berpamitan, membaca buku, dan membantu orang tua.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-amber-100 flex items-center justify-between text-xs font-black text-amber-600 group-hover:text-amber-700">
                <span>Isi Form Laporan</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // VIEW: FORM INPUT DATA LAPORAN 7 KEBIASAAN SISWA
  // =========================================================================
  if (viewMode === 'kebiasaan') {
    const currentCompletedCount = Object.values(kebiasaanStatus).filter(Boolean).length;
    const completionPercentage = Math.round((currentCompletedCount / 7) * 100);

    return (
      <section className="space-y-6">
        {/* Top Breadcrumb & Tombol Kembali */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('home')}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center gap-2 text-xs font-black"
              title="Kembali ke Beranda Siswa"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Beranda</span>
            </button>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider block">
                Formulir Pembiasaan Mandiri
              </span>
              <h2 className="text-base font-display font-black text-slate-800">
                Laporan 7 Kebiasaan Anak Sholeh / Karakter Pelajar Pancasila
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Tersambung ke Firestore (laporan_kebiasaan)
            </span>
          </div>
        </div>

        {/* Hero Banner Form */}
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 p-6 md:p-8 text-white shadow-lg">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase bg-white/20 backdrop-blur-md text-amber-100 border border-white/30">
                <HeartHandshake className="w-3.5 h-3.5" /> Pembiasaan Karakter Positif Harian
              </span>
              <h1 className="text-2xl md:text-3xl font-display font-black tracking-tight text-white drop-shadow-xs">
                Ayo Laporkan 7 Kebiasaan Baikmu Hari Ini!
              </h1>
              <p className="text-xs md:text-sm text-amber-100/90 leading-relaxed font-medium">
                Setiap kebiasaan baik yang kamu jalankan membentuk akhlak mulia dan kedisiplinan.
                Laporan ini akan langsung tersimpan secara real-time ke akun Guru dan Kepala Sekolah.
              </p>
            </div>

            <div className="bg-white/15 backdrop-blur-md p-4 rounded-3xl border border-white/25 text-center shrink-0 min-w-[200px]">
              <span className="text-[11px] font-extrabold uppercase text-amber-200 block">Kepatuhan Hari Ini</span>
              <div className="flex items-baseline justify-center gap-1 mt-1">
                <span className="text-3xl font-black text-white">{currentCompletedCount}</span>
                <span className="text-base font-bold text-amber-200">/ 7</span>
              </div>
              <div className="w-full bg-white/20 h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-yellow-300 h-full rounded-full transition-all duration-500"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <span className="text-[10px] text-amber-100 block mt-1 font-semibold">
                {currentCompletedCount === 7
                  ? '🌟 Sempurna! Kamu Hebat!'
                  : `${completionPercentage}% Terpenuhi`}
              </span>
            </div>
          </div>
        </div>

        {/* FORMULIR UTAMA */}
        <form onSubmit={handleSubmitKebiasaan} className="space-y-6">
          {/* Card 1: Data Identitas Pelapor */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <User className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-display font-black text-slate-800">
                  Data Identitas Peserta Didik
                </h3>
                <p className="text-[11px] text-slate-500">
                  Pastikan nama, rombel kelas, dan tanggal pelaporan sudah sesuai.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Nama Siswa (Dropdown/Text) */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Nama Siswa <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={kebiasaanFormNama}
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      setKebiasaanFormNama(selectedVal);
                      const matched = students.find((s) => s.nama === selectedVal);
                      if (matched && matched.kelas) {
                        setKebiasaanFormKelas(matched.kelas);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none text-xs font-bold text-slate-800 transition cursor-pointer"
                  >
                    <option value="">-- Pilih Nama Siswa --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.nama}>
                        {s.nama} ({s.kelas} - NISN: {s.nisn})
                      </option>
                    ))}
                  </select>
                </div>
                {/* Fallback input text jika ingin ketik manual */}
                <input
                  type="text"
                  value={kebiasaanFormNama}
                  onChange={(e) => setKebiasaanFormNama(e.target.value)}
                  placeholder="Atau ketik nama lengkap di sini jika berbeda"
                  className="w-full mt-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 outline-none focus:border-amber-500"
                />
              </div>

              {/* Kelas (Dropdown) */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Rombel / Kelas <span className="text-rose-500">*</span>
                </label>
                <select
                  value={kebiasaanFormKelas}
                  onChange={(e) => setKebiasaanFormKelas(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none text-xs font-bold text-slate-800 transition cursor-pointer"
                >
                  {CLASSES_LIST.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Kelas tempat siswa terdaftar</p>
              </div>

              {/* Tanggal (Input Date) */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Tanggal Pelaporan <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={kebiasaanFormTanggal}
                    onChange={(e) => setKebiasaanFormTanggal(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none text-xs font-bold text-slate-800 transition cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Format: YYYY-MM-DD</p>
              </div>
            </div>
          </div>

          {/* Card 2: Checklist 7 Kebiasaan */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-display font-black text-slate-800">
                    Checklist &amp; Status 7 Kebiasaan
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Pilih status &quot;Sudah Dilakukan&quot; atau &quot;Belum&quot; serta tulis rincian singkat pada setiap kebiasaan.
                  </p>
                </div>
              </div>

              {/* Quick actions: Centang Semua / Reset */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleMarkAllKebiasaan(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs transition border border-emerald-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Tandai Semua Sudah (7/7)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkAllKebiasaan(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* List 7 Kebiasaan */}
            <div className="space-y-3">
              {TUJUH_KEBIASAAN_LIST.map((item) => {
                const isChecked = Boolean(kebiasaanStatus[item.id]);

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition-all duration-200 ${
                      isChecked
                        ? 'bg-emerald-50/50 border-emerald-300 shadow-2xs'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Icon, Number, Title & Description */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className="text-2xl shrink-0 p-2 rounded-xl bg-white shadow-2xs border border-slate-100">
                          {item.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-900 text-white font-black text-[11px] flex items-center justify-center shrink-0">
                              {item.nomor}
                            </span>
                            <h4 className="font-display font-black text-sm text-slate-800">
                              {item.label}
                            </h4>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{item.deskripsi}</p>
                        </div>
                      </div>

                      {/* Right: Button Toggle Status */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() =>
                            setKebiasaanStatus((prev) => ({
                              ...prev,
                              [item.id]: !prev[item.id],
                            }))
                          }
                          className={`px-4 py-2 rounded-2xl font-display font-black text-xs transition flex items-center gap-2 cursor-pointer ${
                            isChecked
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                              : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                          }`}
                        >
                          {isChecked ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Sudah Dilakukan (+1)</span>
                            </>
                          ) : (
                            <>
                              <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-400 block" />
                              <span>Belum Dilakukan (0)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Catatan / Keterangan Tambahan untuk kebiasaan ini */}
                    <div className="mt-3 pt-2.5 border-t border-slate-200/60">
                      <input
                        type="text"
                        value={kebiasaanNotes[item.id] || ''}
                        onChange={(e) =>
                          setKebiasaanNotes((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder={item.placeholder}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:border-emerald-500 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 3: Refleksi Diri / Catatan Tambahan Siswa */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-display font-black text-slate-800">
                  Catatan Refleksi &amp; Pesan untuk Guru (Opsional)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Tuliskan pengalaman menyenangkan atau hal positif yang kamu rasakan saat menjalankan pembiasaan hari ini.
                </p>
              </div>
            </div>

            <textarea
              rows={3}
              value={kebiasaanCatatanSiswa}
              onChange={(e) => setKebiasaanCatatanSiswa(e.target.value)}
              placeholder="Contoh: Hari ini saya senang sekali bisa bangun jam 5 pagi dan membantu ibu menyiram tanaman sebelum berangkat ke sekolah..."
              className="w-full p-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none text-xs text-slate-800 transition"
            />
          </div>

          {/* Action Button: Kirim Laporan ke Firestore */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <ThumbsUp className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Ringkasan Kesiapan Laporan
                </span>
                <span className="text-sm font-black text-slate-800">
                  {currentCompletedCount} dari 7 Kebiasaan Terpenuhi (Skor: {currentCompletedCount}/7)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('home')}
                className="px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-black text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmittingKebiasaan}
                className="px-7 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-display font-black text-xs shadow-md shadow-amber-500/25 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmittingKebiasaan ? 'Menyimpan ke Firestore...' : 'Kirim Laporan 7 Kebiasaan'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* RIWAYAT LAPORAN SEBELUMNYA SISWA */}
        {studentPastReports.length > 0 && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-600" />
                <h3 className="text-sm font-display font-black text-slate-800">
                  Riwayat Laporan 7 Kebiasaan Kamu
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {studentPastReports.length} Laporan Terakhir
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {studentPastReports.slice(0, 6).map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white transition space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {item.tanggal}
                    </span>
                    <span
                      className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                        item.skor === 7
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                          : 'bg-amber-100 text-amber-700 border border-amber-300'
                      }`}
                    >
                      Skor {item.skor}/7
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-2">
                    {item.catatanSiswa || 'Laporan pembiasaan diri harian peserta didik.'}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" /> Dikirim pukul {item.waktuKirim}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODAL SUKSES PENGIRIMAN */}
        {kebiasaanSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border-2 border-emerald-400 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Tersimpan di Firestore (laporan_kebiasaan)
                </span>
                <h3 className="text-xl font-display font-black text-slate-800 mt-2">
                  Laporan Berhasil Terkirim!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Terima kasih, <strong className="text-slate-700">{kebiasaanFormNama}</strong> ({kebiasaanFormKelas}).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                🎉 Skor Kepatuhan: {currentCompletedCount} dari 7 Kebiasaan Terlaksana dengan Baik!
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Guru wali kelas dan kepala sekolah dapat langsung memantau laporanmu secara real-time di Dasbor Administrator.
              </p>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setKebiasaanSuccessModal(false)}
                  className="px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs transition cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKebiasaanSuccessModal(false);
                    setViewMode('home');
                  }}
                  className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition cursor-pointer"
                >
                  Kembali ke Beranda
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  // =========================================================================
  // VIEW 2 & 3: ALUR MENU UJIAN (KHUSUS CBT & TKA)
  // Sesuai Tahapan:
  // A. Panel Pemilihan Ujian (Dropdown Tunggal)
  // B. Panel Detail & Menu Waktu (Muncul setelah memilih)
  // C. Antarmuka Saat Ujian Berlangsung (Sticky Header Timer, Soal, Auto Submit)
  // =========================================================================
  const themeColor = viewMode === 'tka' ? 'purple' : 'rose';

  return (
    <section className="space-y-6">
      {/* Top Breadcrumb & Tombol Kembali */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isExamRunning}
            onClick={() => {
              setViewMode('home');
              setSelectedExamId('');
              setIsExamRunning(false);
            }}
            className="p-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            title="Kembali ke Halaman Beranda Kartu Siswa"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
              viewMode === 'tka' ? 'bg-purple-100 text-purple-900' : 'bg-rose-100 text-rose-900'
            }`}>
              {viewMode === 'tka' ? 'Modul TKA (Tes Kemampuan Akademik)' : 'Modul CBT (Computer Based Test)'}
            </span>
            <h2 className="text-base sm:text-lg font-display font-black text-slate-800">
              {viewMode === 'tka' ? 'Persiapan Ujian TKA Siswa' : 'Persiapan Ujian CBT Siswa'}
            </h2>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-bold text-slate-500 block">Siswa Peserta:</span>
          <span className="text-xs font-display font-black text-slate-800 block">
            {currentStudent.nama} ({currentStudent.kelas})
          </span>
        </div>
      </div>

      {/* TAHAP A: PANEL PEMILIHAN PAKET SOAL & MATA PELAJARAN */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${viewMode === 'tka' ? 'bg-purple-600' : 'bg-rose-600'}`}></span>
              {viewMode === 'tka'
                ? 'Pilih Jenis Soal TKA & Mata Pelajaran'
                : 'Pilih Paket Soal CBT & Mata Pelajaran'}
            </label>
            <p className="text-xs text-slate-500">
              {viewMode === 'tka'
                ? 'Pilih jenis TKA (misal: Simulasi 1 / Try Out 1) dan mata pelajaran yang diinginkan. Soal akan tampil sesuai paket & mapel yang dibuat guru.'
                : 'Pilih jenis/paket soal (misal: Sumatif 1) dan mata pelajaran. Daftar paket soal yang tersedia akan otomatis muncul sesuai pilihan.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* DROPDOWN 1: PAKET / JENIS SOAL */}
            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1.5">
                {viewMode === 'tka' ? '1. Jenis Soal / Simulasi TKA' : '1. Jenis / Paket Soal CBT'}
              </label>
              <select
                value={selectedPaketFilter}
                disabled={isExamRunning}
                onChange={(e) => {
                  const newPaket = e.target.value;
                  setSelectedPaketFilter(newPaket);
                  setExamResult(null);
                  if (!newPaket) {
                    setSelectedExamId('');
                  }
                }}
                className={`w-full p-3 rounded-2xl border-2 font-display font-extrabold text-xs sm:text-sm outline-none transition cursor-pointer shadow-xs ${
                  isExamRunning
                    ? 'bg-slate-100 border-slate-300 text-slate-500 cursor-not-allowed'
                    : selectedPaketFilter
                    ? viewMode === 'tka'
                      ? 'border-purple-600 bg-purple-50/40 text-purple-950'
                      : 'border-rose-600 bg-rose-50/40 text-rose-950'
                    : 'border-slate-300 bg-white text-slate-800'
                }`}
              >
                <option value="">
                  {viewMode === 'tka' ? '-- Semua / Pilih Jenis Soal TKA --' : '-- Semua / Pilih Jenis Soal CBT --'}
                </option>
                {availablePaketOptions.map((paket) => {
                  const matchingInPaket = currentAvailableExams.filter((ex) => ex.paketName === paket);
                  const qTotal = matchingInPaket.reduce((sum, ex) => sum + ex.soalList.length, 0);
                  return (
                    <option key={paket} value={paket}>
                      {paket} {qTotal > 0 ? `(${matchingInPaket.length} Paket Mapel • ${qTotal} Soal)` : '(Belum ada soal)'}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* DROPDOWN 2: MATA PELAJARAN */}
            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1.5">
                2. Mata Pelajaran
              </label>
              <select
                value={selectedMapelFilter}
                disabled={isExamRunning}
                onChange={(e) => {
                  setSelectedMapelFilter(e.target.value);
                  setExamResult(null);
                }}
                className={`w-full p-3 rounded-2xl border-2 font-display font-extrabold text-xs sm:text-sm outline-none transition cursor-pointer shadow-xs ${
                  isExamRunning
                    ? 'bg-slate-100 border-slate-300 text-slate-500 cursor-not-allowed'
                    : selectedMapelFilter
                    ? viewMode === 'tka'
                      ? 'border-purple-600 bg-purple-50/40 text-purple-950'
                      : 'border-rose-600 bg-rose-50/40 text-rose-950'
                    : 'border-slate-300 bg-white text-slate-800'
                }`}
              >
                <option value="">-- Semua / Pilih Mata Pelajaran --</option>
                {availableMapelOptions.map((mapel) => {
                  const qCount = currentAvailableExams
                    .filter((ex) => (!selectedPaketFilter || ex.paketName === selectedPaketFilter) && ex.mapel === mapel)
                    .reduce((sum, ex) => sum + ex.soalList.length, 0);
                  return (
                    <option key={mapel} value={mapel}>
                      {mapel} {qCount > 0 ? `(${qCount} Soal)` : '(Belum ada soal)'}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* DROPDOWN / KARTU PAKET YANG SESUAI HASIL FILTER */}
          {!isExamRunning && (
            <div className="space-y-2.5 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-700">
                  {selectedPaketFilter || selectedMapelFilter
                    ? `Daftar Soal Tersedia (${filteredExamsForDropdown.length} Paket Cocok):`
                    : `Pilih Paket Soal Tersedia (${filteredExamsForDropdown.length} Paket Aktif):`}
                </span>
                {(selectedPaketFilter || selectedMapelFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPaketFilter('');
                      setSelectedMapelFilter('');
                      setSelectedExamId('');
                      setExamResult(null);
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}
              </div>

              {filteredExamsForDropdown.length > 0 ? (
                <>
                  <select
                    value={selectedExamId}
                    onChange={(e) => {
                      setSelectedExamId(e.target.value);
                      setExamResult(null);
                    }}
                    className={`w-full p-3 rounded-2xl border-2 font-display font-extrabold text-xs sm:text-sm outline-none transition cursor-pointer ${
                      selectedExamId
                        ? viewMode === 'tka'
                          ? 'border-purple-500 bg-purple-50/30 text-purple-950'
                          : 'border-rose-500 bg-rose-50/30 text-rose-950'
                        : 'border-slate-300 bg-slate-50 text-slate-800'
                    }`}
                  >
                    <option value="">-- Pilih Paket Soal yang Akan Dikerjakan --</option>
                    {filteredExamsForDropdown.map((exam) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.paketName} • {exam.mapel}
                        {exam.subPaket ? ` (${exam.subPaket})` : ''}
                        {exam.kelas ? ` [${exam.kelas}]` : ''} • {exam.soalList.length} Soal • {exam.durasiMenit} Menit
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {filteredExamsForDropdown.map((exam) => {
                      const isPicked = selectedExamId === exam.id;
                      return (
                        <button
                          key={exam.id}
                          type="button"
                          onClick={() => {
                            setSelectedExamId(exam.id);
                            setExamResult(null);
                          }}
                          className={`p-3.5 rounded-2xl border-2 text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                            isPicked
                              ? viewMode === 'tka'
                                ? 'border-purple-600 bg-purple-50 shadow-xs'
                                : 'border-rose-600 bg-rose-50 shadow-xs'
                              : 'border-slate-200 bg-slate-50/70 hover:bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span
                                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                  viewMode === 'tka'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {exam.paketName}
                              </span>
                              {exam.subPaket && (
                                <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                                  {exam.subPaket}
                                </span>
                              )}
                            </div>
                            <h4 className="font-display font-black text-xs text-slate-800 leading-snug">
                              {exam.mapel}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {exam.soalList.length} Butir Soal • {exam.durasiMenit} Menit
                              {exam.kelas ? ` • ${exam.kelas}` : ''}
                            </p>
                          </div>
                          <span
                            className={`text-[11px] font-extrabold ${
                              isPicked
                                ? viewMode === 'tka'
                                  ? 'text-purple-700'
                                  : 'text-rose-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {isPicked ? '✓ Paket Terpilih' : 'Klik untuk Memilih →'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-1">
                  <h4 className="font-display font-black text-xs sm:text-sm text-amber-900">
                    Belum Ada Soal untuk Pilihan Ini
                  </h4>
                  <p className="text-xs text-amber-800">
                    Guru belum membuat butir soal untuk{' '}
                    <strong>{selectedPaketFilter || 'Paket Ini'}</strong> —{' '}
                    <strong>{selectedMapelFilter || 'Mata Pelajaran Ini'}</strong>. Silakan pilih kombinasi paket soal &amp; mata pelajaran lainnya.
                  </p>
                </div>
              )}
            </div>
          )}

          {isExamRunning && (
            <p className="text-[11px] text-amber-600 font-bold mt-1.5 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Pilihan paket &amp; mata pelajaran terkunci selama ujian berlangsung.
            </p>
          )}
        </div>

        {/* JIKA BELUM ADA UJIAN DIPILIH: AREA SOAL DAN WAKTU TERKUNCI */}
        {!selectedExamId && filteredExamsForDropdown.length > 0 && (
          <div className="p-8 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-500 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h4 className="font-display font-black text-slate-700 text-sm">
              Area Soal &amp; Menu Waktu Terkunci
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Silakan pilih paket soal &amp; mata pelajaran di atas untuk memunculkan detail ujian, durasi waktu pengerjaan, dan tombol mulai.
            </p>
          </div>
        )}

        {/* TAHAP B: PANEL DETAIL & MENU WAKTU (MUNCUL SETELAH MEMILIH & BELUM MULAI) */}
        {selectedExamId && currentExam && !isExamRunning && !examResult && (
          <div className={`p-6 rounded-3xl border-2 ${
            viewMode === 'tka' ? 'border-purple-200 bg-purple-50/30' : 'border-rose-200 bg-rose-50/30'
          } space-y-5 animate-in fade-in duration-300`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                    viewMode === 'tka' ? 'bg-purple-200 text-purple-900' : 'bg-rose-200 text-rose-900'
                  }`}>
                    {currentExam.mapel}
                  </span>
                  <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800">
                    {currentExam.paketName}{currentExam.subPaket ? ` • ${currentExam.subPaket}` : ''}
                  </span>
                </div>
                <h3 className="font-display font-black text-lg text-slate-800 mt-1">
                  {currentExam.judul}
                </h3>
              </div>

              {/* Menu Waktu (Timer) */}
              <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-2xs">
                <Clock className={`w-5 h-5 ${viewMode === 'tka' ? 'text-purple-600' : 'text-rose-600'}`} />
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block leading-tight">Durasi Ujian:</span>
                  <span className="font-display font-black text-sm text-slate-800">
                    Waktu: {currentExam.durasiMenit} Menit
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-slate-500 text-[11px] block">Jumlah Butir Soal</span>
                <span className="text-base font-black text-slate-800 block mt-0.5">
                  {currentExam.soalList.length} Soal Pilihan
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-slate-500 text-[11px] block">Sistem Penilaian</span>
                <span className="text-base font-black text-emerald-700 block mt-0.5">
                  Skala Nilai 0 - 100
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-slate-500 text-[11px] block">Batas Waktu Timer</span>
                <span className="text-base font-black text-amber-700 block mt-0.5">
                  Auto-Submit Otomatis
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed font-medium">
              💡 <strong>Petunjuk Pengerjaan:</strong> Pastikan Anda membaca setiap butir soal dengan teliti. Ketika tombol "Mulai Ujian" ditekan, timer hitungan mundur akan langsung berjalan. Jika waktu habis, seluruh jawaban yang telah dipilih akan otomatis tersimpan dan terkirim ke sistem sekolah.
            </div>

            {/* Tombol Mulai Ujian */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleStartExam}
                className={`font-display font-black text-white px-8 py-3.5 rounded-2xl text-sm shadow-lg flex items-center gap-2 cursor-pointer transition transform active:scale-95 ${
                  viewMode === 'tka'
                    ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/25'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/25'
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Mulai Ujian Sekarang</span>
              </button>
            </div>
          </div>
        )}

        {/* TAHAP C: ANTARMUKA SAAT UJIAN BERLANGSUNG */}
        {isExamRunning && currentExam && (
          <div className="space-y-4 pt-2">
            {/* Header Atas: Sticky Countdown Timer Bar */}
            <div className="sticky top-16 z-30 bg-slate-900 text-white p-4 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-3 border-2 border-yellow-400">
              <div>
                <span className="text-[10px] font-black uppercase text-yellow-300 tracking-wider">
                  Sedang Mengerjakan: {currentExam.mapel}
                </span>
                <h4 className="font-display font-black text-sm text-white truncate max-w-sm">
                  {currentExam.judul}
                </h4>
              </div>

              {/* Digital Countdown Timer */}
              <div className="flex items-center gap-3">
                <div className="bg-black/60 px-4 py-2 rounded-2xl border border-yellow-400/80 flex items-center gap-2 font-mono">
                  <Clock className="w-5 h-5 text-yellow-400 animate-pulse" />
                  <div>
                    <span className="text-[9px] font-bold text-yellow-200 uppercase block leading-none">
                      Sisa Waktu
                    </span>
                    <span className={`text-xl font-black ${
                      timeLeft <= 300 ? 'text-rose-400 animate-ping' : 'text-yellow-400'
                    }`}>
                      {formatTimer(timeLeft)}
                    </span>
                  </div>
                </div>

                <div className="text-right hidden sm:block">
                  <span className="text-[10px] font-bold text-slate-300 block">Nomor Soal</span>
                  <span className="text-xs font-black text-white">
                    {currentQIndex + 1} dari {activeExamSoalList.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Butir Soal & Pilihan Jawaban */}
            {(() => {
              const q = activeExamSoalList[currentQIndex];
              if (!q) return null;
              const selectedAnswer = answers[q.id];

              return (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                  {/* Nomor Soal & Bobot */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-black text-sm text-slate-800">
                        Soal Nomor #{currentQIndex + 1}
                      </span>
                      <span className="text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg">
                        {q.tipe === 'pg'
                          ? 'Pilihan Ganda'
                          : q.tipe === 'pg_kompleks'
                          ? 'PG Kompleks'
                          : q.tipe === 'benar_salah'
                          ? 'Benar / Salah'
                          : q.tipe === 'isian'
                          ? 'Isian Singkat'
                          : q.tipe === 'menjodohkan'
                          ? 'Menjodohkan'
                          : 'Uraian'}
                      </span>
                    </div>
                    <span className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-xl">
                      Bobot: {q.bobot} Poin
                    </span>
                  </div>

                  {/* Gambar Soal (Jika ada) */}
                  {(q.gambarUrl || q.gambarUrl2) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                      {q.gambarUrl && (
                        <img
                          src={q.gambarUrl}
                          alt="Gambar Soal 1"
                          className="max-h-56 w-full object-contain rounded-xl bg-white border border-slate-100"
                        />
                      )}
                      {q.gambarUrl2 && (
                        <img
                          src={q.gambarUrl2}
                          alt="Gambar Soal 2"
                          className="max-h-56 w-full object-contain rounded-xl bg-white border border-slate-100"
                        />
                      )}
                    </div>
                  )}

                  {/* Pertanyaan */}
                  <div className="text-sm font-semibold text-slate-800 leading-relaxed whitespace-pre-line">
                    {q.pertanyaan}
                  </div>

                  {/* Pilihan Opsi Jawaban sesuai Tipe Soal */}
                  <div className="space-y-2.5">
                    {q.tipe === 'pg_kompleks' && q.opsi && q.opsi.length > 0 ? (
                      <>
                        <p className="text-[11px] font-bold text-slate-500">
                          ✓ Pilih satu atau lebih jawaban yang benar:
                        </p>
                        {q.opsi.map((opsi, oIdx) => {
                          const optKey = String.fromCharCode(65 + oIdx);
                          const selectedArr: string[] = Array.isArray(selectedAnswer) ? selectedAnswer : [];
                          const isChosen = selectedArr.includes(opsi) || selectedArr.includes(optKey);
                          const optImg = q.opsiGambar?.[optKey];

                          return (
                            <div
                              key={oIdx}
                              onClick={() => {
                                const updated = isChosen
                                  ? selectedArr.filter((v) => v !== opsi && v !== optKey)
                                  : [...selectedArr, opsi];
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: updated,
                                }));
                              }}
                              className={`p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col gap-2 ${
                                isChosen
                                  ? viewMode === 'tka'
                                    ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold shadow-xs'
                                    : 'border-rose-600 bg-rose-50 text-rose-950 font-bold shadow-xs'
                                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-3.5">
                                <input
                                  type="checkbox"
                                  checked={isChosen}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded cursor-pointer"
                                />
                                <span className="w-7 h-7 rounded-lg font-mono font-black text-xs flex items-center justify-center shrink-0 bg-slate-100 text-slate-700 border border-slate-200">
                                  {optKey}
                                </span>
                                <span className="text-xs leading-normal">{opsi}</span>
                              </div>
                              {optImg && (
                                <img
                                  src={optImg}
                                  alt={`Gambar Opsi ${optKey}`}
                                  className="h-20 w-auto object-contain rounded-lg border border-slate-200 bg-white ml-11"
                                />
                              )}
                            </div>
                          );
                        })}
                      </>
                    ) : q.tipe === 'benar_salah' ? (
                      <div className="grid grid-cols-2 gap-3">
                        {['Benar', 'Salah'].map((val) => {
                          const isChosen = selectedAnswer === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: val,
                                }))
                              }
                              className={`p-4 rounded-2xl border-2 font-display font-black text-sm transition cursor-pointer ${
                                isChosen
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
                    ) : q.opsi && q.opsi.length > 0 ? (
                      q.opsi.map((opsi, oIdx) => {
                        const optKey = String.fromCharCode(65 + oIdx); // 'A', 'B', 'C', 'D'
                        const optImg = q.opsiGambar?.[optKey];
                        const isChosen =
                          selectedAnswer === opsi ||
                          selectedAnswer === optKey ||
                          (typeof selectedAnswer === 'object' &&
                            (selectedAnswer?.text === opsi || selectedAnswer?.key === optKey));

                        return (
                          <div
                            key={oIdx}
                            onClick={() => {
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: { key: optKey, text: opsi },
                              }));
                            }}
                            className={`p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col gap-2 ${
                              isChosen
                                ? viewMode === 'tka'
                                  ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold shadow-xs'
                                  : 'border-rose-600 bg-rose-50 text-rose-950 font-bold shadow-xs'
                                : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3.5">
                              <span className={`w-8 h-8 rounded-xl font-mono font-black text-xs flex items-center justify-center shrink-0 border ${
                                isChosen
                                  ? viewMode === 'tka'
                                    ? 'bg-purple-600 text-white border-purple-600'
                                    : 'bg-rose-600 text-white border-rose-600'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {optKey}
                              </span>
                              <span className="text-xs leading-normal">{opsi}</span>
                            </div>
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar Opsi ${optKey}`}
                                className="h-20 w-auto object-contain rounded-lg border border-slate-200 bg-white ml-11"
                              />
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <textarea
                        rows={3}
                        value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
                        onChange={(e) => {
                          setAnswers((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }));
                        }}
                        placeholder="Tuliskan jawaban Anda di sini..."
                        className="w-full p-3 rounded-2xl border border-slate-300 text-xs font-medium outline-none focus:border-rose-500"
                      />
                    )}
                  </div>

                  {/* Navigasi Soal: Sebelumnya, Selanjutnya, Selesai */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={currentQIndex === 0}
                      onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
                      className="px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Sebelumnya</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {currentQIndex < activeExamSoalList.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => setCurrentQIndex((prev) => prev + 1)}
                          className={`px-6 py-2.5 rounded-2xl text-white font-display font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md ${
                            viewMode === 'tka' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-rose-600 hover:bg-rose-700'
                          }`}
                        >
                          <span>Selanjutnya</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleFinishExam(false)}
                          className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-600/20"
                        >
                          <Send className="w-4 h-4" />
                          <span>Selesai &amp; Kumpulkan Jawaban</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* HASIL UJIAN (MUNCUL SETELAH SELESAI / AUTO SUBMIT) */}
        {examResult && currentExam && (
          <div className="p-8 rounded-3xl bg-white border-2 border-emerald-300 shadow-lg text-center space-y-4 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <span className="text-xs font-black uppercase text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Ujian Berhasil Diselesaikan &amp; Tersinkronisasi
              </span>
              <h3 className="font-display font-black text-2xl text-slate-800 mt-2">
                Nilai Akhir: {examResult.score} / 100
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {currentExam.judul} • Peserta: {currentStudent.nama}
              </p>
            </div>

            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Nilai Anda telah otomatis tersimpan ke data penilaian sekolah dan langsung terintegrasi dengan Rekap Nilai (Leger) serta e-Rapor resmi.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedExamId('');
                  setExamResult(null);
                  setViewMode('home');
                }}
                className="px-6 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-display font-black text-xs shadow-md transition cursor-pointer"
              >
                Kembali ke Beranda Siswa
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('rapor')}
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
              >
                Lihat Hasil di e-Rapor
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
