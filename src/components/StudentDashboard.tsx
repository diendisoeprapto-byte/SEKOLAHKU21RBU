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
  getStoredAssessments,
  saveStoredAssessments,
  getActiveFilters,
  CLASSES_LIST,
} from '../utils/storage';
import { evaluateQuestionScore } from '../utils/answerChecker';


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

  // State untuk alur ujian
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [isExamRunning, setIsExamRunning] = useState<boolean>(false);
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
    new Date().toISOString().split('T')[0]
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


  // Daftar Ujian CBT Tersedia untuk Kelas Siswa
  const cbtExamList: ExamOptionItem[] = useMemo(() => {
    return [
      {
        id: 'cbt_ipas_as1',
        category: 'cbt',
        mapel: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        judul: 'Sumatif 1 (AS 1) - Organ Tubuh & Sistem Pernapasan Manusia',
        durasiMenit: 60,
        paketName: 'Sumatif 1 (AS 1)',
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
        judul: 'Sumatif 2 (AS 2) - Operasi Hitung Campuran Bilangan Bulat',
        durasiMenit: 60,
        paketName: 'Sumatif 2 (AS 2)',
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
        judul: 'ASTS (Sumatif Tengah Semester) - Membaca Kritis & Teks Eksplanasi',
        durasiMenit: 90,
        paketName: 'ASTS (Sumatif Tengah Semester)',
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
        judul: 'ASAS (Sumatif Akhir Semester) - Hak, Kewajiban & Musyawarah Mufakat',
        durasiMenit: 90,
        paketName: 'ASAS (Sumatif Akhir Semester)',
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
  }, []);

  // Daftar Ujian TKA (Tes Kemampuan Akademik berbasis C3/C4)
  const tkaExamList: ExamOptionItem[] = useMemo(() => {
    return [
      {
        id: 'tka_indo_tp612',
        category: 'tka',
        mapel: 'Bahasa Indonesia',
        judul: 'TKA Bahasa Indonesia - TP 6.1.2: Analisis Argumen & Ide Pokok (C3/C4)',
        durasiMenit: 90,
        paketName: 'Tryout TKA 1',
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
        judul: 'TKA Matematika - TP 6.2.1: Pemecahan Masalah Rasio & Geometri Ruang (C4)',
        durasiMenit: 90,
        paketName: 'Tryout TKA 2',
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
        judul: 'TKA IPAS - TP 6.3.1: Analisis Ekosistem & Perpindahan Energi (C4)',
        durasiMenit: 90,
        paketName: 'Tryout TKA 3',
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
  }, []);

  // Daftar ujian yang aktif tergantung mode (CBT atau TKA)
  const currentAvailableExams = viewMode === 'tka' ? tkaExamList : cbtExamList;

  // Ujian yang sedang dipilih di panel dropdown
  const currentExam = useMemo(() => {
    return currentAvailableExams.find((e) => e.id === selectedExamId) || null;
  }, [currentAvailableExams, selectedExamId]);

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
      showToast('Pilih ujian terlebih dahulu dari menu dropdown di atas!', 'error');
      return;
    }
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

    let earned = 0;
    let max = 0;

    currentExam.soalList.forEach((q) => {
      max += q.bobot;
      const ans = answers[q.id];
      const evalRes = evaluateQuestionScore(q.tipe, ans, q.kunciJawaban, q.bobot);
      earned += evalRes.earnedScore;
    });

    const finalGrade = max > 0 ? Math.round((earned / max) * 100) : 100;
    setExamResult({ score: finalGrade, maxScore: 100 });
    setIsExamRunning(false);

    // Rekam ke CBT / TKA Results di storage
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

    // Sinkronisasi ke asesmen siswa secara otomatis
    try {
      const filters = getActiveFilters();
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
      };
      const subId = subjectMap[currentExam.mapel] || 's_bindonesia';
      const assessKey = `${filters.year}_${filters.semester}_${activeClass}_${subId}`;
      const existing = getStoredAssessments(assessKey);

      if (!existing[currentStudent.id]) {
        existing[currentStudent.id] = { sumatif: {}, remedial: {}, asts: 0, asas: 0 };
      }

      if (currentExam.paketName.includes('ASTS')) {
        existing[currentStudent.id].asts = finalGrade;
      } else if (currentExam.paketName.includes('ASAS')) {
        existing[currentStudent.id].asas = finalGrade;
      } else {
        const asMatch = currentExam.paketName.match(/(?:Sumatif|AS|UH)\s*(\d+)/i);
        if (asMatch) {
          const idx = parseInt(asMatch[1]);
          existing[currentStudent.id].sumatif[idx] = finalGrade;
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

      {/* TAHAP A: PANEL PEMILIHAN UJIAN (DROPDOWN TUNGGAL) */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${viewMode === 'tka' ? 'bg-purple-600' : 'bg-rose-600'}`}></span>
            Panel Pemilihan Ujian (Pilih Ujian Aktif):
          </label>
          <p className="text-xs text-slate-500 mb-2">
            Pilihlah salah satu nama ujian dari menu dropdown di bawah ini. Waktu dan butir soal akan otomatis disesuaikan.
          </p>

          <select
            value={selectedExamId}
            disabled={isExamRunning}
            onChange={(e) => {
              setSelectedExamId(e.target.value);
              setExamResult(null);
            }}
            className={`w-full p-3.5 rounded-2xl border-2 font-display font-extrabold text-sm outline-none transition cursor-pointer shadow-xs ${
              isExamRunning
                ? 'bg-slate-100 border-slate-300 text-slate-500 cursor-not-allowed'
                : selectedExamId
                ? viewMode === 'tka'
                  ? 'border-purple-600 bg-purple-50/50 text-purple-950 focus:ring-3 focus:ring-purple-200'
                  : 'border-rose-600 bg-rose-50/50 text-rose-950 focus:ring-3 focus:ring-rose-200'
                : 'border-slate-300 bg-white text-slate-800 focus:border-rose-500'
            }`}
          >
            <option value="">-- Silakan Pilih Ujian yang Sedang Aktif --</option>
            {currentAvailableExams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.judul} • [Waktu: {exam.durasiMenit} Menit]
              </option>
            ))}
          </select>
          {isExamRunning && (
            <p className="text-[11px] text-amber-600 font-bold mt-1.5 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Pilihan dropdown terkunci selama ujian sedang berlangsung.
            </p>
          )}
        </div>

        {/* JIKA BELUM ADA UJIAN DIPILIH: AREA SOAL DAN WAKTU TERKUNCI */}
        {!selectedExamId && (
          <div className="p-8 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-500 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h4 className="font-display font-black text-slate-700 text-sm">
              Area Soal &amp; Menu Waktu Terkunci
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Silakan pilih salah satu paket ujian dari menu dropdown di atas terlebih dahulu untuk memunculkan detail ujian, durasi waktu pengerjaan, dan tombol mulai.
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
                <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                  viewMode === 'tka' ? 'bg-purple-200 text-purple-900' : 'bg-rose-200 text-rose-900'
                }`}>
                  {currentExam.mapel}
                </span>
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
                    {currentQIndex + 1} dari {currentExam.soalList.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Butir Soal & Pilihan Jawaban */}
            {(() => {
              const q = currentExam.soalList[currentQIndex];
              if (!q) return null;
              const selectedAnswer = answers[q.id];

              return (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                  {/* Nomor Soal & Bobot */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="font-display font-black text-sm text-slate-800">
                      Soal Nomor #{currentQIndex + 1}
                    </span>
                    <span className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-xl">
                      Bobot: {q.bobot} Poin
                    </span>
                  </div>

                  {/* Pertanyaan */}
                  <div className="text-sm font-semibold text-slate-800 leading-relaxed whitespace-pre-line">
                    {q.pertanyaan}
                  </div>

                  {/* Pilihan Opsi Jawaban (A, B, C, D) */}
                  <div className="space-y-2.5">
                    {q.opsi && q.opsi.length > 0 ? (
                      q.opsi.map((opsi, oIdx) => {
                        const optKey = opsi.charAt(0); // 'A', 'B', 'C', 'D'
                        const isChosen = selectedAnswer === optKey || selectedAnswer === opsi;

                        return (
                          <div
                            key={oIdx}
                            onClick={() => {
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: optKey,
                              }));
                            }}
                            className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-center gap-3.5 ${
                              isChosen
                                ? viewMode === 'tka'
                                  ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold shadow-xs'
                                  : 'border-rose-600 bg-rose-50 text-rose-950 font-bold shadow-xs'
                                : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
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
                        );
                      })
                    ) : (
                      <textarea
                        rows={3}
                        value={selectedAnswer || ''}
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
                      {currentQIndex < currentExam.soalList.length - 1 ? (
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
