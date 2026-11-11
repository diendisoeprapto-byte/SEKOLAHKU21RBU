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
  namaAyah: string;
  namaIbu: string;
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

export interface CBTQuestion {
  id: string;
  tipe: 'pg' | 'pg_kompleks' | 'benar_salah' | 'menjodohkan' | 'isian' | 'uraian';
  pertanyaan: string;
  opsi?: string[]; // for pg, pg_kompleks
  kunciJawaban: string | string[]; // string or array for multiselect
  bobot: number;
  pembahasan?: string;
  cpId?: string; // Capaian Pembelajaran referensi
  tpId?: string; // Tujuan Pembelajaran referensi
  gambarUrl?: string;
  gambarUrl2?: string;
  opsiGambar?: { [key: string]: string };
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
  durasiMenit: number;
  aktif: boolean;
  soalList: CBTQuestion[];
}

export interface CBTExamResult {
  examId: string;
  studentId: string;
  studentName: string;
  skor: number;
  nilai: number; // 0-100
  waktuSelesai: string;
  jawabanSiswa: Record<string, any>;
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

export const TUJUH_KEBIASAAN_LIST = [
  {
    id: 'bangunPagi',
    nomor: 1,
    label: '1. Bangun pagi dan merapikan tempat tidur',
    shortLabel: 'Bangun Pagi & Rapikan Tempat Tidur',
    icon: '🌅',
    deskripsi: 'Membiasakan disiplin bangun tepat waktu dan menjaga kerapihan kamar tidur',
    placeholder: 'Contoh: Bangun pukul 05.00 WIB, merapikan selimut, bantal dan sprei',
  },
  {
    id: 'ibadah',
    nomor: 2,
    label: '2. Melaksanakan ibadah',
    shortLabel: 'Melaksanakan Ibadah',
    icon: '🕌',
    deskripsi: 'Melaksanakan kewajiban ibadah sesuai ajaran agama masing-masing',
    placeholder: 'Contoh: Sholat Subuh berjamaah / Doa Pagi bersama keluarga',
  },
  {
    id: 'mandiGosokGigi',
    nomor: 3,
    label: '3. Mandi dan menggosok gigi',
    shortLabel: 'Mandi & Menggosok Gigi',
    icon: '🚿',
    deskripsi: 'Menjaga kebersihan diri, kesegaran badan, dan kesehatan gigi',
    placeholder: 'Contoh: Mandi pagi bersih dan menggosok gigi sebelum berpakaian',
  },
  {
    id: 'sarapanSehat',
    nomor: 4,
    label: '4. Sarapan sehat',
    shortLabel: 'Sarapan Sehat Bergizi',
    icon: '🥗',
    deskripsi: 'Mengonsumsi sarapan bergizi seimbang untuk energi belajar',
    placeholder: 'Contoh: Nasi, telur mata sapi, sayur bayam, dan minum air putih/susu',
  },
  {
    id: 'berpamitan',
    nomor: 5,
    label: '5. Berpamitan sebelum berangkat',
    shortLabel: 'Berpamitan Sebelum Berangkat',
    icon: '🤝',
    deskripsi: 'Mencium tangan orang tua dan mengucapkan salam sopan santun',
    placeholder: 'Contoh: Mencium tangan ayah dan ibu serta memohon doa restu',
  },
  {
    id: 'membacaBuku',
    nomor: 6,
    label: '6. Membaca buku',
    shortLabel: 'Membaca Buku (Literasi)',
    icon: '📚',
    deskripsi: 'Melakukan kegiatan literasi membaca buku pelajaran atau cerita inspiratif',
    placeholder: 'Contoh: Membaca buku cerita nusantara halaman 10-25',
  },
  {
    id: 'membantuOrangTua',
    nomor: 7,
    label: '7. Membantu orang tua',
    shortLabel: 'Membantu Orang Tua',
    icon: '🧹',
    deskripsi: 'Meringankan pekerjaan orang tua di rumah dengan rasa tanggung jawab',
    placeholder: 'Contoh: Menyapu lantai ruang tamu, mencuci piring bekas makan',
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

