export interface SchoolProfile {
  name: string;
  npsn: string;
  kecamatan: string;
  kota: string;
  provinsi: string;
  alamat: string;
  kepalaSekolah: {
    nama: string;
    status: 'PNS' | 'PPPK' | 'KKI' | 'Honor';
    nip: string;
  };
  logoKemendikbudUrl: string;
  logoSekolahUrl: string;
  adminFotoUrl?: string;
}

export interface Teacher {
  id: string;
  nama: string;
  statusPegawai: 'PNS' | 'PPPK' | 'KKI' | 'Honor';
  nip: string;
  tempatLahir: string;
  tanggalLahir: string;
  tmtPertama: string;
  statusPernikahan: 'Menikah' | 'Belum Menikah' | 'Janda' | 'Duda';
  penugasan: string; // e.g. "Kelas 6A", "Guru PAIBP", "Kepala Sekolah"
  username: string;
  password: string;
  fotoUrl: string;
}

export type ReligionType = 'Islam' | 'Kristen' | 'Katolik' | 'Buddha' | 'Hindu' | 'Konghucu';

export const KEBUTUHAN_KHUSUS_OPTIONS = [
  'Tidak Ada (Reguler)',
  'Tunanetra (Hambatan penglihatan)',
  'Tunarungu (Hambatan pendengaran)',
  'Tunawicara (Hambatan bicara)',
  'Tunagrahita (Hambatan intelektual)',
  'Tunadaksa (Hambatan fisik dan motorik)',
  'Tunalaras (Hambatan emosi dan perilaku)',
  'Tunaganda (Hambatan majemuk/lebih dari satu hambatan)',
  'Lamban Belajar (Slow Learner)',
  'Kesulitan Belajar Spesifik (Disleksia, Disgrafia, Diskalkulia)',
  'Autisme (Autism Spectrum Disorder / ASD)',
  'ADHD (Attention Deficit Hyperactivity Disorder / Gangguan Pemusatan Perhatian dan Hiperaktivitas)',
  'Cerdas Istimewa dan Bakat Istimewa (Gifted & Talented)',
] as const;

export type KebutuhanKhususType = typeof KEBUTUHAN_KHUSUS_OPTIONS[number];

/**
 * Memvalidasi apakah seorang siswa tergolong Siswa Inklusi / Berkebutuhan Khusus (ABK).
 * Siswa reguler ("Tidak Ada", "Reguler", "Tidak Ada (Reguler)", "Siswa Reguler", "-", dll)
 * secara mutlak TIDAK terhitung sebagai siswa inklusi.
 */
export const isSiswaInklusi = (val?: string | null): boolean => {
  if (!val) return false;
  const clean = val.trim().toLowerCase();
  if (
    clean === '' ||
    clean === '-' ||
    clean === 'none' ||
    clean === 'normal' ||
    clean === 'bukan abk' ||
    clean === 'tanpa kebutuhan khusus' ||
    clean.includes('tidak ada') ||
    clean.includes('reguler')
  ) {
    return false;
  }
  return true;
};

export const isAbkExcludedFromTka = (
  student?: Pick<Student, 'kebutuhanKhusus' | 'ikutTka'> | null
): boolean => {
  if (!student) return false;
  return isSiswaInklusi(student.kebutuhanKhusus) && student.ikutTka === false;
};

export const isTataUsahaUser = (
  user?: { role?: string; detail?: string; username?: string } | null
): boolean => {
  if (!user || user.role !== 'guru') return false;
  const detailLower = (user.detail || '').trim().toLowerCase();
  const usernameLower = (user.username || '').trim().toLowerCase();

  if (detailLower.includes('tata usaha')) return true;
  if (/(?:^|[\s._\-\/])tu(?:$|[\s._\-\/])/.test(detailLower)) return true;
  if (
    usernameLower.includes('tatausaha') ||
    usernameLower.includes('tata_usaha') ||
    usernameLower.includes('tata.usaha') ||
    /(?:^|[._\-])tu(?:$|[._\-])/.test(usernameLower)
  ) {
    return true;
  }
  return false;
};

export const hasAdminMenuAccess = (
  user?: { role?: string; detail?: string; username?: string } | null
): boolean => {
  if (!user) return false;
  return user.role === 'admin' || isTataUsahaUser(user);
};

export interface Student {
  id: string;
  barcodeId: string;
  nama: string;
  jenisKelamin: 'L' | 'P';
  tempatLahir: string;
  tanggalLahir: string; // YYYY-MM-DD
  nik: string; // 16 digit NIK
  nisn: string; // 10 digit NISN
  kebutuhanKhusus: string;
  ikutTka?: boolean; // Khusus siswa ABK/Inklusi: true/undefined = ikut TKA, false = tidak masuk TKA
  namaAyah: string;
  namaIbu: string;
  noTelpOrtu?: string; // Nomor Telepon / WhatsApp Orang Tua / Wali
  alamat: string;
  agama: ReligionType;
  kelas: string; // e.g. "Kelas 6A"
  tahunPelajaran: string; // e.g. "2026/2027"
  username: string;
  password: string;
  fotoUrl: string;
}

export type AttendanceStatus = 'H' | 'S' | 'I' | 'A' | '-';

export interface AttendanceRecord {
  studentId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  time: string; // HH:MM
}

export interface KaldikDay {
  date: string; // YYYY-MM-DD
  isHoliday: boolean;
  keterangan: string;
  isCustom?: boolean;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  kategori: 'umum' | 'agama' | 'muatan_lokal';
  agamaKhusus?: ReligionType; // If set, only applies to students of that religion
  kktp: number;
  description?: string;
  tujuanPembelajaran?: string[];
  kelas?: string;
}

export interface AssessmentData {
  // Key: studentId
  [studentId: string]: {
    sumatif: { [asIndex: number]: number }; // AS1: number, AS2: number, etc.
    remedial: { [asIndex: number]: number }; // Rem1: number, Rem2: number, etc.
    asts: number; // Asesmen Sumatif Tengah Semester
    asas: number; // Asesmen Sumatif Akhir Semester
    catatan?: string;
  };
}

export interface ExtracurricularGrade {
  nama: string;
  predikat: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Kurang';
  keterangan: string;
}

export interface P5Score {
  dimensi: string;
  elemen: string;
  capaian: 'BB' | 'MB' | 'BSH' | 'SB'; // Belum Berkembang, Mulai Berkembang, Berkembang Sesuai Harapan, Sangat Berkembang
  catatan: string;
}

export interface StudentReportNotes {
  studentId: string;
  catatanWali: string;
  keputusanKenaikan: string; // e.g. "Naik ke Kelas VII" or "Naik ke Kelas 6"
  ekskul: ExtracurricularGrade[];
  p5: P5Score[];
}

export interface BenarSalahItem {
  id: string;
  pernyataan: string;
  kunci: 'Benar' | 'Salah';
}

export interface MenjodohkanData {
  kolomKiri: string[];
  kolomKanan: string[];
  pasangan: Record<string, string>; // key: '1','2',... -> value: 'A','B',...
}

export interface CBTQuestion {
  id: string;
  tipe: 'pg' | 'pg_kompleks' | 'benar_salah' | 'menjodohkan' | 'isian' | 'uraian';
  pertanyaan: string;
  opsi?: string[]; // for pg, pg_kompleks
  benarSalahItems?: BenarSalahItem[]; // tabel pernyataan Benar / Salah
  menjodohkanData?: MenjodohkanData; // dua kolom menjodohkan (Kolom Kiri & Kolom Kanan)
  kunciJawaban: string | string[]; // string or array for multiselect
  bobot: number;
  pembahasan?: string;
  cpId?: string; // Capaian Pembelajaran referensi
  tpId?: string; // Tujuan Pembelajaran referensi
  gambarUrl?: string;
  gambarUrl2?: string;
  posisiGambar?: 'bawah_judul' | 'bawah_pertanyaan' | 'kanan_teks';
  judulTeks?: string;
  opsiGambar?: { [key: string]: string };
  paket?: string;
  subPaket?: string;
  mapel?: string;
  kelas?: string;
}

export type TKAJenis =
  | 'Simulasi 1'
  | 'Simulasi 2'
  | 'Simulasi 3'
  | 'Simulasi 4'
  | 'Simulasi 5'
  | 'Simulasi 6'
  | 'Try Out 1'
  | 'Try Out 2'
  | 'Try Out 3'
  | 'Try Out 4'
  | 'Try Out 5'
  | 'Try Out 6'
  | 'Tryout TKA 1'
  | 'Tryout TKA 2'
  | 'Tryout TKA 3'
  | 'Tryout TKA 4'
  | 'Tryout TKA 5'
  | 'Tryout TKA 6';

export interface TKACpTp {
  id: string;
  kodeCp: string;
  judulCp: string;
  deskripsiCp: string;
  mapel: string;
  tpList: {
    id: string;
    kodeTp: string;
    judulTp: string;
  }[];
}

export interface TKAQuestion extends CBTQuestion {
  jenisTka: TKAJenis;
  mapel: string;
}

export interface TKAExam {
  id: string;
  judul: string;
  jenisTka: TKAJenis;
  mapel: string;
  durasiMenit: number;
  aktif: boolean;
  soalList: TKAQuestion[];
}

export interface CBTExam {
  id: string;
  judul: string;
  mapel: string;
  kelas: string;
  paketName?: string;
  subPaket?: string;
  durasiMenit: number;
  aktif: boolean;
  soalList: CBTQuestion[];
}

export interface CBTExamResult {
  examId: string;
  studentId: string;
  studentName: string;
  nisn?: string;
  kelas?: string;
  skor: number;
  nilai: number; // 0-100
  waktuSelesai: string;
  jawabanSiswa: Record<string, any>;
  category?: 'cbt' | 'tka';
  mapel?: string;
  judul?: string;
  paketName?: string;
  tanggal?: string;
  recordedAt?: number;
  tahunPelajaran?: string;
  semester?: string;
}

export interface ExamResultsResetMeta {
  cbtClearedAt?: number;
  tkaClearedAt?: number;
  paketClearedAt?: Record<string, number>;
  deletedTkaIds?: Record<string, number>;
  deletedCbtKeys?: Record<string, number>;
}

export interface ExamDeletionLogEntry {
  logId: string;
  category: 'tka' | 'cbt';
  actionType: 'single' | 'paket' | 'all';
  studentId: string;
  studentName: string;
  nisn?: string;
  kelas?: string;
  paket: string;
  mapel?: string;
  skorRingkas?: number;
  deletedAt: number;
  deletedAtIso: string;
  deletedBy?: string;
  targetKey: string;
  restoredAt?: number;
  restoredBy?: string;
  snapshotTkaSubmission?: Record<string, any>;
  snapshotTkaResults?: CBTExamResult[];
  snapshotCbtResult?: CBTExamResult;
}

export interface ActiveUser {
  role: 'admin' | 'guru' | 'siswa';
  username: string;
  name: string;
  detail: string;
  fotoUrl: string;
  kelasDiampu?: string;
  studentData?: Student;
}

export interface KebiasaanIndikatorItem {
  id: string;
  title: string;
  detail: string;
}

export const TUJUH_KEBIASAAN_LIST = [
  {
    id: 'bangunPagi',
    nomor: 1,
    kodePendek: 'BP',
    label: '1. Bangun Pagi',
    shortLabel: 'Bangun Pagi',
    icon: '🌅',
    deskripsi:
      'Melatih kedisiplinan waktu dan kesiapan anak memulai aktivitas pada rentang pukul 04.00–06.00 pagi.',
    placeholder: 'Catatan tambahan kegiatan bangun pagi (opsional)...',
    indikator: [
      {
        id: 'bp_1',
        title: 'Bangun mandiri tanpa dibangunkan',
        detail: 'Anak bangun tepat waktu menggunakan alarm atau kesadaran sendiri.',
      },
      {
        id: 'bp_2',
        title: 'Merapikan tempat tidur',
        detail: 'Anak melipat selimut dan menata bantal segera setelah bangun.',
      },
      {
        id: 'bp_3',
        title: 'Menyiapkan perlengkapan sekolah',
        detail: 'Anak memeriksa kembali buku pelajaran dan seragam sebelum berangkat.',
      },
      {
        id: 'bp_4',
        title: 'Mandi dan berpakaian rapi tepat waktu',
        detail: 'Anak menjaga kebersihan diri di pagi hari agar segar berangkat ke sekolah.',
      },
    ],
  },
  {
    id: 'ibadah',
    nomor: 2,
    kodePendek: 'IB',
    label: '2. Beribadah',
    shortLabel: 'Beribadah',
    icon: '🕌',
    deskripsi:
      'Memperkuat nilai spiritual, moral, dan kedekatan anak dengan Tuhan sesuai agama masing-masing.',
    placeholder: 'Catatan tambahan kegiatan beribadah (opsional)...',
    indikator: [
      {
        id: 'ib_1',
        title: 'Melaksanakan ibadah wajib tepat waktu',
        detail: 'Anak menjalankan salat lima waktu (bagi Muslim) atau ibadah harian sesuai keyakinannya.',
      },
      {
        id: 'ib_2',
        title: 'Membaca doa sebelum dan sesudah beraktivitas',
        detail: 'Anak terbiasa berdoa saat bangun tidur, sebelum makan, sebelum belajar, dan hendak tidur.',
      },
      {
        id: 'ib_3',
        title: 'Membaca kitab suci atau hafalan doa pendek',
        detail: 'Anak meluangkan waktu membaca Al-Qur\'an, Iqra, Alkitab, atau kitab suci lainnya.',
      },
      {
        id: 'ib_4',
        title: 'Mengikuti kegiatan keagamaan bersama keluarga atau di lingkungan',
        detail: 'Anak mengikuti salat berjamaah, sekolah minggu, atau kegiatan di tempat ibadah.',
      },
    ],
  },
  {
    id: 'mandiGosokGigi',
    nomor: 3,
    kodePendek: 'BO',
    label: '3. Berolahraga',
    shortLabel: 'Berolahraga',
    icon: '🏃',
    deskripsi:
      'Menjaga kebugaran fisik, kesehatan mental, dan sportivitas dengan target aktivitas fisik minimal 2 kali seminggu.',
    placeholder: 'Catatan tambahan kegiatan olahraga hari ini (opsional)...',
    indikator: [
      {
        id: 'bo_1',
        title: 'Mengikuti Senam Anak Indonesia Hebat',
        detail: 'Anak melakukan gerakan senam resmi program Kemendikdasmen di sekolah atau di rumah.',
      },
      {
        id: 'bo_2',
        title: 'Melakukan peregangan ringan di pagi hari',
        detail: 'Anak melakukan pemanasan otot selama 5–10 menit setelah bangun tidur.',
      },
      {
        id: 'bo_3',
        title: 'Bermain permainan tradisional yang aktif bergerak',
        detail: 'Anak bermain lompat tali, petak umpet, gobak sodor, atau kejar-kejaran bersama teman.',
      },
      {
        id: 'bo_4',
        title: 'Berolahraga bersama keluarga atau teman',
        detail: 'Anak bersepeda, jalan santai, lari pagi, berenang, atau bermain bola.',
      },
    ],
  },
  {
    id: 'sarapanSehat',
    nomor: 4,
    kodePendek: 'MS',
    label: '4. Makan Sehat dan Bergizi',
    shortLabel: 'Makan Sehat & Bergizi',
    icon: '🥗',
    deskripsi:
      'Membiasakan anak mengonsumsi nutrisi seimbang sesuai pedoman Isi Piringku dan menghindari jajanan sembarangan.',
    placeholder: 'Catatan tambahan menu makanan bergizi hari ini (opsional)...',
    indikator: [
      {
        id: 'ms_1',
        title: 'Sarapan pagi sebelum berangkat sekolah',
        detail: 'Anak makan pagi dengan menu bergizi agar fokus saat belajar di kelas.',
      },
      {
        id: 'ms_2',
        title: 'Mengkonsumsi makanan pokok, lauk pauk, sayur, dan buah',
        detail: 'Anak menghabiskan porsi makan seimbang dalam satu piring.',
      },
      {
        id: 'ms_3',
        title: 'Minum air putih yang cukup',
        detail: 'Anak membiasakan minum air putih minimal 6–8 gelas sehari dan mengurangi minuman manis kemasan.',
      },
      {
        id: 'ms_4',
        title: 'Membawa bekal sehat dari rumah',
        detail: 'Anak membawa makanan buatan orang tua ke sekolah untuk mengurangi konsumsi makanan instan.',
      },
    ],
  },
  {
    id: 'berpamitan',
    nomor: 5,
    kodePendek: 'GB',
    label: '5. Gemar Belajar',
    shortLabel: 'Gemar Belajar',
    icon: '📚',
    deskripsi:
      'Menumbuhkan rasa ingin tahu, kreativitas, dan kemandirian anak dalam mencari ilmu.',
    placeholder: 'Catatan tambahan kegiatan belajar atau hobi (opsional)...',
    indikator: [
      {
        id: 'gb_1',
        title: 'Mengulang pelajaran dan mengerjakan PR',
        detail: 'Anak meluangkan waktu khusus di sore atau malam hari untuk belajar mandiri.',
      },
      {
        id: 'gb_2',
        title: 'Membaca buku bacaan non-pelajaran',
        detail: 'Anak membaca buku cerita, ensiklopedia anak, atau majalah edukasi minimal 15 menit sehari.',
      },
      {
        id: 'gb_3',
        title: 'Berdiskusi atau bertanya tentang hal baru',
        detail: 'Anak aktif bertanya kepada orang tua atau guru mengenai fenomena di sekitarnya.',
      },
      {
        id: 'gb_4',
        title: 'Mengasah bakat atau hobi positif',
        detail: 'Anak berlatih menggambar, menulis cerita, bermain alat musik, atau membuat prakarya.',
      },
    ],
  },
  {
    id: 'membacaBuku',
    nomor: 6,
    kodePendek: 'BM',
    label: '6. Bermasyarakat',
    shortLabel: 'Bermasyarakat',
    icon: '🤝',
    deskripsi:
      'Membangun empati, gotong royong, toleransi, dan kepedulian anak terhadap lingkungan sekitar.',
    placeholder: 'Catatan tambahan kegiatan bermasyarakat & tolong-menolong (opsional)...',
    indikator: [
      {
        id: 'bm_1',
        title: 'Membantu pekerjaan rumah tangga orang tua',
        detail: 'Anak menyapu lantai, mencuci piring sendiri, atau menyiram tanaman di rumah.',
      },
      {
        id: 'bm_2',
        title: 'Melaksanakan piket kelas dan menjaga kebersihan sekolah',
        detail: 'Anak bekerja sama dengan teman membersihkan ruang kelas dan membuang sampah pada tempatnya.',
      },
      {
        id: 'bm_3',
        title: 'Berbagi dan bertutur kata santun',
        detail: 'Anak membiasakan mengucapkan kata tolong, maaf, terima kasih, serta berbagi dengan teman atau adik.',
      },
      {
        id: 'bm_4',
        title: 'Mengikuti kegiatan sosial di lingkungan rumah',
        detail: 'Anak ikut kerja bakti ringan di lingkungan RT atau menjenguk teman yang sakit.',
      },
    ],
  },
  {
    id: 'membantuOrangTua',
    nomor: 7,
    kodePendek: 'TC',
    label: '7. Tidur Cepat',
    shortLabel: 'Tidur Cepat',
    icon: '🌙',
    deskripsi:
      'Memastikan anak mendapatkan waktu istirahat cukup (sekitar 8–10 jam untuk usia SD) agar tubuh bugar dan siap bangun pagi.',
    placeholder: 'Catatan tambahan waktu & persiapan tidur malam (opsional)...',
    indikator: [
      {
        id: 'tc_1',
        title: 'Tidur malam maksimal pukul 21.00 WIB',
        detail: 'Anak sudah berada di tempat tidur sebelum jam 9 malam.',
      },
      {
        id: 'tc_2',
        title: 'Menerapkan prinsip 3S (Screen Time, Screen Break, Screen Zone)',
        detail: 'Anak berhenti menggunakan gawai atau menonton TV minimal 30–60 menit sebelum tidur.',
      },
      {
        id: 'tc_3',
        title: 'Membersihkan diri sebelum tidur',
        detail: 'Anak mencuci kaki, mencuci tangan, dan menggosok gigi sebelum naik ke tempat tidur.',
      },
      {
        id: 'tc_4',
        title: 'Menyiapkan jadwal dan seragam untuk esok hari',
        detail: 'Anak memastikan semua keperluan sekolah beres sebelum beristirahat.',
      },
    ],
  },
] as const;

export type KebiasaanKey = typeof TUJUH_KEBIASAAN_LIST[number]['id'];

export interface KebiasaanReportItem {
  id?: string;
  namaSiswa: string;
  studentId?: string;
  kelas: string;
  tanggal: string; // YYYY-MM-DD
  waktuKirim?: string; // e.g. 06:45:12 WIB
  kebiasaan: {
    bangunPagi: boolean;
    ibadah: boolean;
    mandiGosokGigi: boolean;
    sarapanSehat: boolean;
    berpamitan: boolean;
    membacaBuku: boolean;
    membantuOrangTua: boolean;
  };
  indikatorTerpilih?: {
    bangunPagi?: string[];
    ibadah?: string[];
    mandiGosokGigi?: string[];
    sarapanSehat?: string[];
    berpamitan?: string[];
    membacaBuku?: string[];
    membantuOrangTua?: string[];
  };
  catatan?: {
    bangunPagi?: string;
    ibadah?: string;
    mandiGosokGigi?: string;
    sarapanSehat?: string;
    berpamitan?: string;
    membacaBuku?: string;
    membantuOrangTua?: string;
  };
  skor: number; // 0 - 7
  catatanSiswa?: string;
  createdAt?: string;
}

export type PerpustakaanKategori =
  | 'Buku Pelajaran'
  | 'Buku Cerita/Literasi'
  | 'Modul Ajar Guru'
  | 'Buku Referensi';

export type PerpustakaanKelas = 'Semua' | '1' | '2' | '3' | '4' | '5' | '6';

export interface PerpustakaanBook {
  id: string;
  judul: string;
  penulis: string;
  kategori: PerpustakaanKategori;
  kelas: PerpustakaanKelas;
  cover_url: string;
  file_url: string;
  sumber: string;
  dibaca_count: number;
  createdAt?: any;
}

export interface LogLiterasiItem {
  id?: string;
  nisn: string;
  nama_siswa: string;
  kelas: string;
  buku_id: string;
  judul_buku: string;
  kategori_buku: string;
  waktu_baca?: any;
  tanggal: string; // YYYY-MM-DD
  bulan_tahun: string; // YYYY-MM
}

export interface PeminjamanPerpustakaanItem {
  id: string;
  student_id: string;
  barcode_id: string;
  nisn: string;
  nama_siswa: string;
  kelas: string;
  buku_id: string;
  judul_buku: string;
  kode_eksemplar?: string;
  tanggal_pinjam: string; // YYYY-MM-DD
  tanggal_kembali_rencana: string; // YYYY-MM-DD
  tanggal_dikembalikan?: string | null;
  status: 'Dipinjam' | 'Dikembalikan';
  petugas: string;
  catatan?: string;
  createdAt?: any;
  sourceCollection?: 'pinjaman' | 'peminjaman_perpustakaan';
}

export interface ActiveExamHeaderStatus {
  isRunning: boolean;
  timeLeft: number;
  currentQuestion: number;
  totalQuestions: number;
}
