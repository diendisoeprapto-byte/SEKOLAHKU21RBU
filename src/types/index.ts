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

export interface Student {
  id: string;
  barcodeId: string;
  nama: string;
  nisn: string;
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
