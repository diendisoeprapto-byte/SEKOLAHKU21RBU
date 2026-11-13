import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  Save,
  Printer,
  Sparkles,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Users,
  Sliders,
  BarChart3,
  MailOpen,
  X,
  ExternalLink,
  BookOpen,
  Table,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Upload,
  Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { ActiveUser, SchoolProfile, Student, Subject } from '../../types';
import { formatTanggalIndo } from '../../utils/dateUtils';
import {
  getStoredSubjectsForClass,
  getAssessmentCount,
  getActiveFilters,
} from '../../utils/storage';

interface Props {
  activeUser: ActiveUser;
  profile: SchoolProfile;
  students: Student[];
  activeYear: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export interface KospSettingsAsaj {
  bobotRapor: number;
  bobotAsaj: number;
  bobotTertulis: number;
  bobotPraktik: number;
  kkm: number;
  tahunPelajaran: string;
  jadwalPengumuman: string; // YYYY-MM-DDTHH:mm
  // Penomoran SKL (dapat disesuaikan)
  kodeAwalSkl?: string;
  kodeInstansiSkl?: string;
  nomorUrutAwalSkl?: number;
  suffixTahunSkl?: string;
  // Format Nomor Seri Ijazah (contoh: DN-01/D-SD/26/0012301) atau NIN 15-Digit
  formatIjazah?: 'seri' | 'nin';
  kodeWilayahIjazah?: string; // mis. DN-01
  kodeJenjangSeriIjazah?: string; // mis. D-SD
  tahunSeriIjazah?: string; // mis. 26
  nomorSeriAwalIjazah?: number; // mis. 12301 -> 0012301
  // Penomoran Ijazah Kemendikdasmen (NIN 15 digit - Permendikbudristek 58/2024)
  kodeNegaraIjazah?: string; // 1 = Dalam Negeri, 2 = Luar Negeri
  kodeJenjangIjazah?: string; // 11 = SD, 12 = SDLB, 13 = SD SPK, 14 = Paket A
  tahunLulusIjazah?: string; // 4 digit tahun lulus, mis. 2027
  nomorUrutAwalIjazah?: number; // 7 digit nomor urut awal
}

export type SikapP5Type = 'Sangat Baik' | 'Baik' | 'Cukup' | 'Kurang';

export type RaporSemesterKey = 'k4s1' | 'k4s2' | 'k5s1' | 'k5s2' | 'k6s1' | 'k6s2';

export interface NilaiAsajRecord {
  studentId: string;
  nama: string;
  nisn: string;
  kelas: string;
  raporK4S1?: number;
  raporK4S2?: number;
  raporK5S1?: number;
  raporK5S2?: number;
  raporK6S1?: number;
  raporK6S2?: number;
  raporSemesterMapel?: Partial<Record<RaporSemesterKey, Record<string, number>>>;
  nilaiRapor: number;
  nilaiRaporManual?: boolean;
  nilaiTertulis: number;
  nilaiPraktik: number;
  sikapP5: SikapP5Type;
  nilaiAsaj: number;
  nilaiAkhir: number;
  status: 'LULUS' | 'TIDAK LULUS';
  noSkl?: string;
  noIjazah?: string;
  mapelScores?: Record<string, number>;
  raporMapelScores?: Record<string, number>;
  raporMapelManual?: Record<string, boolean>;
  asajTertulisMapel?: Record<string, number>;
  asajPraktikMapel?: Record<string, number>;
  updatedAt?: string;
}

const MAPEL_IJAZAH_SD = [
  'Pendidikan Agama dan Budi Pekerti',
  'Pendidikan Pancasila',
  'Bahasa Indonesia',
  'Matematika',
  'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
  'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
  'Seni Budaya dan Prakarya',
  'Bahasa Inggris',
  'Muatan Lokal (PLBJ)',
  'Koding dan Kecerdasan Artifisial (KKA)',
];

const MAPEL_SHORT_LABELS: Record<string, string> = {
  'Pendidikan Agama dan Budi Pekerti': 'PAI & BP',
  'Pendidikan Pancasila': 'Pancasila',
  'Bahasa Indonesia': 'B. Indo',
  'Matematika': 'MTK',
  'Ilmu Pengetahuan Alam dan Sosial (IPAS)': 'IPAS',
  'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)': 'PJOK',
  'Seni Budaya dan Prakarya': 'Seni',
  'Bahasa Inggris': 'B. Ing',
  'Muatan Lokal (PLBJ)': 'PLBJ',
  'Koding dan Kecerdasan Artifisial (KKA)': 'KKA',
};

const DEFAULT_KOSP: KospSettingsAsaj = {
  bobotRapor: 60,
  bobotAsaj: 40,
  bobotTertulis: 50,
  bobotPraktik: 50,
  kkm: 70,
  tahunPelajaran: '2026/2027',
  jadwalPengumuman: '',
  kodeAwalSkl: '421.2',
  kodeInstansiSkl: 'SKL-SDNRBU21',
  nomorUrutAwalSkl: 1,
  suffixTahunSkl: '2027',
  formatIjazah: 'seri',
  kodeWilayahIjazah: 'DN-01',
  kodeJenjangSeriIjazah: 'D-SD',
  tahunSeriIjazah: '26',
  nomorSeriAwalIjazah: 12301,
  kodeNegaraIjazah: '1',
  kodeJenjangIjazah: '11',
  tahunLulusIjazah: '2027',
  nomorUrutAwalIjazah: 1,
};

function computeAvgRapor6Sem(
  rec: Partial<Pick<NilaiAsajRecord, 'raporK4S1' | 'raporK4S2' | 'raporK5S1' | 'raporK5S2' | 'raporK6S1' | 'raporK6S2'>>,
  fallback = 82
): number {
  const vals = [rec.raporK4S1, rec.raporK4S2, rec.raporK5S1, rec.raporK5S2, rec.raporK6S1, rec.raporK6S2]
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n) && n > 0);
  if (vals.length === 0) return fallback;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function hasAnyRapor6Sem(
  rec?: Partial<Pick<NilaiAsajRecord, 'raporK4S1' | 'raporK4S2' | 'raporK5S1' | 'raporK5S2' | 'raporK6S1' | 'raporK6S2'>>
): boolean {
  if (!rec) return false;
  return [rec.raporK4S1, rec.raporK4S2, rec.raporK5S1, rec.raporK5S2, rec.raporK6S1, rec.raporK6S2].some(
    (v) => Number(v) > 0
  );
}

/**
 * Menghitung 1 digit Check Digit (Luhn Mod-10) untuk 14 digit awal Nomor Ijazah Nasional (NIN)
 * sesuai struktur 15 digit Kemendikdasmen (Permendikbudristek No. 58 Tahun 2024).
 */
function computeNinCheckDigit(first14: string): string {
  const digits = first14.replace(/\D/g, '').padStart(14, '0').slice(0, 14);
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = parseInt(digits[13 - i], 10);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Membuat Nomor Seri Ijazah sesuai format contoh: DN-01/D-SD/26/0012301
 */
function generateNoIjazahSeri(kosp: KospSettingsAsaj, seqOffset: number): string {
  const wilayah = (kosp.kodeWilayahIjazah ?? 'DN-01').trim() || 'DN-01';
  const jenjang = (kosp.kodeJenjangSeriIjazah ?? 'D-SD').trim() || 'D-SD';
  const tahun2 = (kosp.tahunSeriIjazah ?? '26').trim() || '26';
  const baseUrut = Math.max(1, Number(kosp.nomorSeriAwalIjazah) || 12301);
  const urut7 = String(baseUrut + seqOffset).padStart(7, '0');
  return [wilayah, jenjang, tahun2, urut7].filter(Boolean).join('/');
}

/**
 * Membuat 15 digit Nomor Ijazah Nasional (NIN) Kemendikdasmen:
 * [1 digit Kode Negara][2 digit Kode Satuan Pendidikan][4 digit Tahun Lulus][7 digit No Urut][1 digit Check Digit]
 */
function generateNoIjazahNin(kosp: KospSettingsAsaj, seqOffset: number): string {
  const negara = String(kosp.kodeNegaraIjazah || '1').replace(/\D/g, '').slice(0, 1) || '1';
  const jenjang = String(kosp.kodeJenjangIjazah || '11').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
  const tahun = String(kosp.tahunLulusIjazah || '2027').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  const baseUrut = Math.max(1, Number(kosp.nomorUrutAwalIjazah) || 1);
  const urut7 = String(baseUrut + seqOffset).padStart(7, '0').slice(-7);
  const first14 = `${negara}${jenjang}${tahun}${urut7}`;
  return `${first14}${computeNinCheckDigit(first14)}`;
}

function generateNoIjazah(kosp: KospSettingsAsaj, seqOffset: number): string {
  return (kosp.formatIjazah || 'seri') === 'nin'
    ? generateNoIjazahNin(kosp, seqOffset)
    : generateNoIjazahSeri(kosp, seqOffset);
}

/**
 * Membuat Nomor Surat SKL yang kode awal, instansi, nomor urut, dan suffix tahunnya dapat disesuaikan.
 */
function generateNoSkl(kosp: KospSettingsAsaj, seqOffset: number): string {
  const kodeAwal = (kosp.kodeAwalSkl ?? '421.2').trim();
  const baseUrut = Math.max(1, Number(kosp.nomorUrutAwalSkl) || 1);
  const urut = String(baseUrut + seqOffset).padStart(3, '0');
  const kodeInstansi = (kosp.kodeInstansiSkl ?? 'SKL-SDNRBU21').trim();
  const suffixTahun = (kosp.suffixTahunSkl ?? '2027').trim();
  return [kodeAwal, urut, kodeInstansi, suffixTahun].filter(Boolean).join('/');
}

function buildDefaultMapelScores(nilaiAkhir: number): Record<string, number> {
  const base = Math.round(Number(nilaiAkhir) || 80);
  const res: Record<string, number> = {};
  MAPEL_IJAZAH_SD.forEach((m, idx) => {
    const offset = (idx % 3) - 1;
    res[m] = Math.min(100, Math.max(50, base + offset));
  });
  return res;
}

interface RaporSubjectMeta {
  code: string;
  name: string;
  shortDesc: string;
  minGrade: number;
}

const RAPOR_SUBJECTS: RaporSubjectMeta[] = [
  { code: 'PAI', name: 'Pendidikan Agama dan Budi Pekerti', shortDesc: 'PENDIDIKAN AGAMA...', minGrade: 4 },
  { code: 'PKN', name: 'Pendidikan Pancasila', shortDesc: 'PENDIDIKAN PA...', minGrade: 4 },
  { code: 'BIND', name: 'Bahasa Indonesia', shortDesc: 'BAHASA INDON...', minGrade: 4 },
  { code: 'MTK', name: 'Matematika', shortDesc: 'MATEMATIKA', minGrade: 4 },
  { code: 'IPAS', name: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)', shortDesc: 'ILMU PENGETA...', minGrade: 4 },
  { code: 'SBDP', name: 'Seni Budaya dan Prakarya', shortDesc: 'SENI BUDAYA D...', minGrade: 4 },
  { code: 'PJOK', name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)', shortDesc: 'PENDIDIKAN JA...', minGrade: 4 },
  { code: 'BING', name: 'Bahasa Inggris', shortDesc: 'BAHASA INGGRIS', minGrade: 4 },
  { code: 'PLBJ', name: 'Muatan Lokal (PLBJ)', shortDesc: 'PENDIDIKAN LIN...', minGrade: 4 },
  { code: 'KKA', name: 'Koding dan Kecerdasan Artifisial (KKA)', shortDesc: 'KODING & KA...', minGrade: 5 },
];

interface RaporSemesterConfig {
  key: RaporSemesterKey;
  fieldKey: 'raporK4S1' | 'raporK4S2' | 'raporK5S1' | 'raporK5S2' | 'raporK6S1' | 'raporK6S2';
  label: string;
  shortLabel: string;
  grade: number;
  semesterName: string;
  altSemester: string;
  academicYear: string;
}

function shiftAcademicYear(baseYear: string, offset: number): string {
  const m = String(baseYear || '2026/2027').match(/(\d{4})\s*\/\s*(\d{4})/);
  const startY = m ? parseInt(m[1], 10) : 2026;
  const endY = m ? parseInt(m[2], 10) : startY + 1;
  return `${startY + offset}/${endY + offset}`;
}

function getRaporSemestersConfig(activeYear: string): RaporSemesterConfig[] {
  const baseYear = activeYear || '2026/2027';
  const yK4 = shiftAcademicYear(baseYear, -2);
  const yK5 = shiftAcademicYear(baseYear, -1);
  const yK6 = shiftAcademicYear(baseYear, 0);
  return [
    { key: 'k4s1', fieldKey: 'raporK4S1', label: `Kelas 4 Semester 1 (${yK4})`, shortLabel: 'K4 Sem 1', grade: 4, semesterName: 'Semester 1', altSemester: 'Ganjil', academicYear: yK4 },
    { key: 'k4s2', fieldKey: 'raporK4S2', label: `Kelas 4 Semester 2 (${yK4})`, shortLabel: 'K4 Sem 2', grade: 4, semesterName: 'Semester 2', altSemester: 'Genap', academicYear: yK4 },
    { key: 'k5s1', fieldKey: 'raporK5S1', label: `Kelas 5 Semester 1 (${yK5})`, shortLabel: 'K5 Sem 1', grade: 5, semesterName: 'Semester 1', altSemester: 'Ganjil', academicYear: yK5 },
    { key: 'k5s2', fieldKey: 'raporK5S2', label: `Kelas 5 Semester 2 (${yK5})`, shortLabel: 'K5 Sem 2', grade: 5, semesterName: 'Semester 2', altSemester: 'Genap', academicYear: yK5 },
    { key: 'k6s1', fieldKey: 'raporK6S1', label: `Kelas 6 Semester 1 (${yK6})`, shortLabel: 'K6 Sem 1', grade: 6, semesterName: 'Semester 1', altSemester: 'Ganjil', academicYear: yK6 },
    { key: 'k6s2', fieldKey: 'raporK6S2', label: `Kelas 6 Semester 2 (${yK6})`, shortLabel: 'K6 Sem 2', grade: 6, semesterName: 'Semester 2', altSemester: 'Genap', academicYear: yK6 },
  ];
}

function matchSubjectForIjazahMapel(mapelName: string, subjects: Subject[], religion?: string): Subject | undefined {
  const lower = mapelName.toLowerCase();
  if (lower.includes('agama')) {
    const rel = (religion || 'Islam').toLowerCase();
    return (
      subjects.find((s) => s.kategori === 'agama' && (s.agamaKhusus || '').toLowerCase() === rel) ||
      subjects.find((s) => s.code.toUpperCase().startsWith('PAI') || s.name.toLowerCase().includes('agama'))
    );
  }
  if (lower.includes('pancasila')) {
    return subjects.find((s) => s.code.toUpperCase().startsWith('PANCASILA') || s.name.toLowerCase().includes('pancasila'));
  }
  if (lower.includes('indonesia')) {
    return subjects.find((s) => s.code.toUpperCase().startsWith('BINDO') || s.name.toLowerCase().includes('indonesia'));
  }
  if (lower.includes('matematika')) {
    return subjects.find((s) => s.code.toUpperCase().startsWith('MTK') || s.name.toLowerCase().includes('matematika'));
  }
  if (lower.includes('ipas')) {
    return subjects.find((s) => s.code.toUpperCase().startsWith('IPAS') || s.name.toLowerCase().includes('ipas'));
  }
  if (lower.includes('pjok')) {
    return subjects.find((s) => s.code.toUpperCase().startsWith('PJOK') || s.name.toLowerCase().includes('jasmani'));
  }
  if (lower.includes('seni')) {
    return subjects.find((s) => s.code.toUpperCase().startsWith('SENI') || s.name.toLowerCase().includes('seni'));
  }
  if (lower.includes('inggris')) {
    return subjects.find((s) => s.code.toUpperCase().startsWith('BING') || s.name.toLowerCase().includes('inggris'));
  }
  if (lower.includes('plbj')) {
    return subjects.find((s) => s.code.toUpperCase().startsWith('PLBJ') || s.name.toLowerCase().includes('plbj'));
  }
  if (lower.includes('koding') || lower.includes('kka')) {
    return subjects.find(
      (s) =>
        s.code.toUpperCase().startsWith('KKA') ||
        s.name.toLowerCase().includes('koding') ||
        s.name.toLowerCase().includes('kka')
    );
  }
  return undefined;
}

const LEGACY_SUBJECT_IDS: Record<string, string> = {
  'Pendidikan Agama dan Budi Pekerti': 's_pabp_islam',
  'Pendidikan Pancasila': 's_pancasila',
  'Bahasa Indonesia': 's_bindonesia',
  'Matematika': 's_matematika',
  'Ilmu Pengetahuan Alam dan Sosial (IPAS)': 's_ipas',
  'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)': 's_pjok',
  'Seni Budaya dan Prakarya': 's_senirupa',
  'Bahasa Inggris': 's_binggris',
  'Muatan Lokal (PLBJ)': 's_plbj',
  'Koding dan Kecerdasan Artifisial (KKA)': 's_kka',
};

const SUBJECT_SUFFIX_BY_NAME: Record<string, string[]> = {
  'Pendidikan Agama dan Budi Pekerti': ['pai', 'pabp_islam'],
  'Pendidikan Pancasila': ['pancasila'],
  'Bahasa Indonesia': ['bindo', 'bindonesia'],
  'Matematika': ['mtk', 'matematika'],
  'Ilmu Pengetahuan Alam dan Sosial (IPAS)': ['ipas'],
  'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)': ['pjok'],
  'Seni Budaya dan Prakarya': ['seni', 'senirupa'],
  'Bahasa Inggris': ['bing', 'binggris'],
  'Muatan Lokal (PLBJ)': ['plbj'],
  'Koding dan Kecerdasan Artifisial (KKA)': ['kka'],
};

/**
 * Membaca nilai rapor yang benar-benar tersimpan dari semester & tahun ajaran sebelumnya
 * di localStorage (`sekolahku_assessments_data_*`). Jika tidak ada data tersimpan, mengembalikan {}.
 */
function readStoredSemesterGradesForStudent(
  student: Student,
  semCfg: RaporSemesterConfig,
  activeYear: string
): Record<string, number> {
  const rombelRaw = String(student.kelas || 'Kelas 6A');
  const sectionMatch = rombelRaw.match(/([A-Z])$/i);
  const section = sectionMatch ? sectionMatch[1].toUpperCase() : 'A';
  const candidateClasses = Array.from(
    new Set([
      `Kelas ${semCfg.grade}${section}`,
      `Kelas ${semCfg.grade}A`,
      `Kelas ${semCfg.grade}B`,
      `Kelas ${semCfg.grade}`,
    ])
  );
  const filters = getActiveFilters();
  const candidateYears = Array.from(
    new Set([semCfg.academicYear, activeYear, filters.year || '2026/2027'].filter(Boolean))
  );
  const candidateSemesters = Array.from(new Set([semCfg.semesterName, semCfg.altSemester]));

  const activeSubjectsForSem = RAPOR_SUBJECTS.filter((m) => semCfg.grade >= m.minGrade);
  const result: Record<string, number> = {};

  activeSubjectsForSem.forEach((subjMeta) => {
    const scoresFound: number[] = [];

    for (const targetKelas of candidateClasses) {
      const classSubjects = getStoredSubjectsForClass(targetKelas);
      const matched = matchSubjectForIjazahMapel(subjMeta.name, classSubjects, student.agama);
      const kktp = matched?.kktp || 75;
      const kPrefix = `${semCfg.grade}${section.toLowerCase()}`;
      const suffixes = SUBJECT_SUFFIX_BY_NAME[subjMeta.name] || [];
      const candidateIds = Array.from(
        new Set(
          [
            matched?.id,
            ...suffixes.map((sf) => `s_${kPrefix}_${sf}`),
            ...suffixes.map((sf) => `s_${semCfg.grade}a_${sf}`),
            ...suffixes.map((sf) => `s_${semCfg.grade}_${sf}`),
            LEGACY_SUBJECT_IDS[subjMeta.name],
          ].filter(Boolean) as string[]
        )
      );

      for (const targetYear of candidateYears) {
        for (const targetSem of candidateSemesters) {
          for (const subId of candidateIds) {
            const key = `${targetYear}_${targetSem}_${targetKelas}_${subId}`;
            const raw = localStorage.getItem(`sekolahku_assessments_data_${key}`);
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              const g = parsed[student.id];
              if (!g) continue;
              const count = getAssessmentCount(key);
              let totalAs = 0;
              let filledSumatif = 0;
              for (let i = 1; i <= count; i++) {
                const pure = Number(g.sumatif?.[i] ?? 0);
                const rem = Number(g.remedial?.[i] ?? 0);
                const eff = rem > 0 ? Math.max(pure, Math.min(rem, kktp)) : pure;
                if (eff > 0) filledSumatif++;
                totalAs += eff;
              }
              const avgAs = count > 0 ? totalAs / count : 0;
              const asts = Number(g.asts || 0);
              const asas = Number(g.asas || 0);
              if (filledSumatif > 0 || asts > 0 || asas > 0) {
                const na = Math.round(((2 * avgAs + asts + asas) / 4) * 100) / 100;
                if (na > 0) scoresFound.push(na);
              }
            } catch {}
          }
          if (scoresFound.length > 0) break;
        }
        if (scoresFound.length > 0) break;
      }
      if (scoresFound.length > 0) break;
    }

    if (scoresFound.length > 0) {
      const avg = scoresFound.reduce((a, b) => a + b, 0) / scoresFound.length;
      result[subjMeta.name] = Math.round(avg * 100) / 100;
    }
  });

  return result;
}

function computeSemesterAvgFromMapel(
  scoresObj: Record<string, number> | undefined,
  grade: number
): number | undefined {
  if (!scoresObj) return undefined;
  const activeSubjects = RAPOR_SUBJECTS.filter((m) => grade >= m.minGrade);
  const vals = activeSubjects
    .map((m) => Number(scoresObj[m.name] ?? 0))
    .filter((n) => !Number.isNaN(n) && n > 0);
  if (vals.length === 0) return undefined;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function countFilledSemesters(rec?: Partial<NilaiAsajRecord>): number {
  if (!rec) return 0;
  return [rec.raporK4S1, rec.raporK4S2, rec.raporK5S1, rec.raporK5S2, rec.raporK6S1, rec.raporK6S2].filter(
    (v) => Number(v) > 0
  ).length;
}

function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const clean: Record<string, any> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined) clean[k] = v;
  });
  return clean as Partial<T>;
}

export const ManajemenASAJTab: React.FC<Props> = ({
  activeUser,
  profile,
  students,
  activeYear,
  showToast,
}) => {
  const [subTab, setSubTab] = useState<'rekap' | 'rapor' | 'input' | 'rekap-ijazah' | 'cetak'>('rekap');
  const [rombelFilter, setRombelFilter] = useState<'ALL' | 'Kelas 6A' | 'Kelas 6B'>('ALL');
  const [activeRaporSem, setActiveRaporSem] = useState<RaporSemesterKey>('k4s1');
  const [activeAsajMapel, setActiveAsajMapel] = useState<string>(MAPEL_IJAZAH_SD[0]);
  const [rekapIjazahViewMode, setRekapIjazahViewMode] = useState<'ijazah' | 'rapor' | 'asaj'>('ijazah');
  const [rekapSearch, setRekapSearch] = useState<string>('');
  const raporFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [kosp, setKosp] = useState<KospSettingsAsaj>({
    ...DEFAULT_KOSP,
    tahunPelajaran: activeYear || '2026/2027',
  });
  const [nilaiMap, setNilaiMap] = useState<Record<string, NilaiAsajRecord>>({});
  const [firestoreLoaded, setFirestoreLoaded] = useState(false);
  const [hasAutoConnectedPrev, setHasAutoConnectedPrev] = useState(false);
  const [isSavingKosp, setIsSavingKosp] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  // Modal Detail Nilai Mapel
  const [editingMapelStudentId, setEditingMapelStudentId] = useState<string | null>(null);
  const [mapelDraft, setMapelDraft] = useState<Record<string, number>>({});

  // Print State (SKL / Draf Ijazah / Rapor Semester / Rekap Ijazah)
  const [printPayload, setPrintPayload] = useState<
    | { type: 'skl' | 'ijazah'; record: NilaiAsajRecord; student?: Student }
    | { type: 'rapor-sem'; semCfg: RaporSemesterConfig; rows: { student: Student; rec: NilaiAsajRecord }[] }
    | { type: 'rekap-ijazah'; rows: { student: Student; rec: NilaiAsajRecord; ms: Record<string, number>; avgMapel: number }[] }
    | null
  >(null);

  // Student Portal Countdown & Envelope State
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isEnvelopeOpened, setIsEnvelopeOpened] = useState(false);
  const [studentResult, setStudentResult] = useState<NilaiAsajRecord | null>(null);

  // Sync KOSP settings & nilai_asaj realtime from Firestore
  useEffect(() => {
    const unsubKosp = onSnapshot(
      doc(db, 'settings_asaj', 'config'),
      (snap) => {
        if (snap.exists()) {
          setKosp((prev) => ({ ...prev, ...(snap.data() as Partial<KospSettingsAsaj>) }));
        }
      },
      (err) => console.warn('settings_asaj listener warning:', err)
    );

    const unsubNilai = onSnapshot(
      collection(db, 'nilai_asaj'),
      (snap) => {
        const next: Record<string, NilaiAsajRecord> = {};
        snap.forEach((docSnap) => {
          next[docSnap.id] = { ...(docSnap.data() as NilaiAsajRecord), studentId: docSnap.id };
        });
        setNilaiMap(next);
        setFirestoreLoaded(true);
      },
      (err) => {
        console.warn('nilai_asaj listener warning:', err);
        setFirestoreLoaded(true);
      }
    );

    return () => {
      unsubKosp();
      unsubNilai();
    };
  }, []);

  // Live 1s clock for student countdown
  useEffect(() => {
    if (activeUser.role !== 'siswa') return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeUser.role]);

  // Filter Kelas 6 students
  const kelas6Students = useMemo(() => {
    return students
      .filter((s) => String(s.kelas || '').includes('6'))
      .sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'id', { sensitivity: 'base' }));
  }, [students]);

  const filteredStudents = useMemo(() => {
    return kelas6Students.filter((s) => rombelFilter === 'ALL' || s.kelas === rombelFilter);
  }, [kelas6Students, rombelFilter]);

  const calculateRow = (
    rapor: number,
    tertulis: number,
    praktik: number,
    sikap: SikapP5Type,
    customKosp: KospSettingsAsaj = kosp
  ) => {
    // Nilai ASAJ dihitung langsung dari rata-rata US Tertulis & US Praktek
    const nilaiAsaj = Math.round(((Number(tertulis) + Number(praktik)) / 2) * 100) / 100;

    const bRapor = Number(customKosp.bobotRapor) || 60;
    const bAsaj = Number(customKosp.bobotAsaj) || 40;
    const divMain = bRapor + bAsaj || 100;
    const nilaiAkhir = Math.round((((rapor * bRapor + nilaiAsaj * bAsaj) / divMain) * 100)) / 100;

    const kkm = Number(customKosp.kkm) || 70;
    const sikapLolos = sikap === 'Sangat Baik' || sikap === 'Baik';
    const status: 'LULUS' | 'TIDAK LULUS' = sikapLolos && nilaiAkhir >= kkm ? 'LULUS' : 'TIDAK LULUS';
    return { nilaiAsaj, nilaiAkhir, status };
  };

  const raporSemesters = useMemo(
    () => getRaporSemestersConfig(kosp.tahunPelajaran || activeYear || '2026/2027'),
    [kosp.tahunPelajaran, activeYear]
  );

  const recomputeRecordFromRapor = (
    rawRec: NilaiAsajRecord,
    customKosp: KospSettingsAsaj = kosp
  ): NilaiAsajRecord => {
    const nextRec: NilaiAsajRecord = { ...rawRec };
    const semMap = { ...(nextRec.raporSemesterMapel || {}) };
    const manualMapelFlags = { ...(nextRec.raporMapelManual || {}) };

    // 1. Update rata-rata masing-masing semester (k4s1..k6s2) dari raporSemesterMapel
    raporSemesters.forEach((cfg) => {
      const mapScores = semMap[cfg.key];
      if (mapScores) {
        const semAvg = computeSemesterAvgFromMapel(mapScores, cfg.grade);
        if (semAvg !== undefined && semAvg > 0) {
          nextRec[cfg.fieldKey] = semAvg;
        } else {
          delete nextRec[cfg.fieldKey];
        }
      }
    });

    // 2. Hitung rata-rata rapor per mata pelajaran lintas 6 semester (kecuali jika diinput manual per mapel)
    const raporMapelScores: Record<string, number> = { ...(nextRec.raporMapelScores || {}) };
    MAPEL_IJAZAH_SD.forEach((mName) => {
      if (manualMapelFlags[mName]) {
        return;
      }
      const vals = raporSemesters
        .map((cfg) => Number(semMap[cfg.key]?.[mName] ?? 0))
        .filter((n) => !Number.isNaN(n) && n > 0);
      if (vals.length > 0) {
        raporMapelScores[mName] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      }
    });
    nextRec.raporMapelScores = raporMapelScores;

    // 3. Hitung Rata-rata Rapor keseluruhan (dari rata-rata 6 semester atau rata-rata rapor per mapel jika ada input manual per mapel)
    const hasManualMapelRapor = Object.values(manualMapelFlags).some(Boolean);
    const filledRaporMapelVals = MAPEL_IJAZAH_SD.map((m) => Number(raporMapelScores[m] ?? 0)).filter((v) => v > 0);
    const nilaiRapor =
      nextRec.nilaiRaporManual
        ? Number(nextRec.nilaiRapor) || 0
        : hasManualMapelRapor && filledRaporMapelVals.length > 0
        ? Math.round((filledRaporMapelVals.reduce((a, b) => a + b, 0) / filledRaporMapelVals.length) * 100) / 100
        : hasAnyRapor6Sem(nextRec)
        ? computeAvgRapor6Sem(nextRec, nextRec.nilaiRapor || 82)
        : filledRaporMapelVals.length > 0
        ? Math.round((filledRaporMapelVals.reduce((a, b) => a + b, 0) / filledRaporMapelVals.length) * 100) / 100
        : Number(nextRec.nilaiRapor) || 82;
    nextRec.nilaiRapor = nilaiRapor;

    // 4. Hitung US Tertulis, US Praktek, Nilai ASAJ, dan Nilai Ijazah Per Mapel
    const bR = Number(customKosp.bobotRapor) || 60;
    const bA = Number(customKosp.bobotAsaj) || 40;
    const divMain = bR + bA || 100;
    const baseTertulis = Number(nextRec.nilaiTertulis) || 78;
    const basePraktik = Number(nextRec.nilaiPraktik) || 84;
    const tMapel = { ...(nextRec.asajTertulisMapel || {}) };
    const pMapel = { ...(nextRec.asajPraktikMapel || {}) };
    const nextMapelScores: Record<string, number> = { ...(nextRec.mapelScores || {}) };

    let sumTertulis = 0;
    let sumPraktik = 0;
    let sumMapelIjazah = 0;

    MAPEL_IJAZAH_SD.forEach((mName) => {
      const tVal = tMapel[mName] !== undefined ? Number(tMapel[mName]) : baseTertulis;
      const pVal = pMapel[mName] !== undefined ? Number(pMapel[mName]) : basePraktik;
      const asajM = Math.round(((tVal + pVal) / 2) * 100) / 100;
      const rMapel = Number(raporMapelScores[mName] ?? 0);
      const effectiveRaporMapel = rMapel > 0 ? rMapel : nilaiRapor;
      const ijM = Math.round(((effectiveRaporMapel * bR + asajM * bA) / divMain) * 100) / 100;
      nextMapelScores[mName] = ijM;
      sumTertulis += tVal;
      sumPraktik += pVal;
      sumMapelIjazah += ijM;
    });
    nextRec.mapelScores = nextMapelScores;

    // 5. Kalkulasi Nilai Tertulis/Praktik/ASAJ/Akhir Global & Status Kelulusan
    const hasPerMapelAsaj = Object.keys(tMapel).length > 0 || Object.keys(pMapel).length > 0;
    const globalTertulis = hasPerMapelAsaj
      ? Math.round((sumTertulis / MAPEL_IJAZAH_SD.length) * 100) / 100
      : Number(nextRec.nilaiTertulis) || 0;
    const globalPraktik = hasPerMapelAsaj
      ? Math.round((sumPraktik / MAPEL_IJAZAH_SD.length) * 100) / 100
      : Number(nextRec.nilaiPraktik) || 0;
    nextRec.nilaiTertulis = globalTertulis;
    nextRec.nilaiPraktik = globalPraktik;

    const calc = calculateRow(nilaiRapor, globalTertulis, globalPraktik, nextRec.sikapP5 || 'Baik', customKosp);
    nextRec.nilaiAsaj = calc.nilaiAsaj;
    nextRec.nilaiAkhir =
      hasManualMapelRapor || hasPerMapelAsaj
        ? Math.round((sumMapelIjazah / MAPEL_IJAZAH_SD.length) * 100) / 100
        : calc.nilaiAkhir;

    const kkm = Number(customKosp.kkm) || 70;
    const sikapLolos = (nextRec.sikapP5 || 'Baik') === 'Sangat Baik' || (nextRec.sikapP5 || 'Baik') === 'Baik';
    nextRec.status = sikapLolos && nextRec.nilaiAkhir >= kkm ? 'LULUS' : 'TIDAK LULUS';

    return nextRec;
  };

  const getRowRecord = (s: Student): NilaiAsajRecord => {
    const existing = nilaiMap[s.id];
    const baseRec: NilaiAsajRecord = existing || {
      studentId: s.id,
      nama: s.nama,
      nisn: s.nisn,
      kelas: s.kelas,
      nilaiRapor: 82,
      nilaiTertulis: 78,
      nilaiPraktik: 84,
      sikapP5: 'Baik',
      nilaiAsaj: 81,
      nilaiAkhir: 81.6,
      status: 'LULUS',
    };
    return recomputeRecordFromRapor(
      {
        ...baseRec,
        studentId: s.id,
        nama: s.nama,
        nisn: s.nisn,
        kelas: s.kelas,
      },
      kosp
    );
  };

  const updateRowField = (
    student: Student,
    field:
      | 'nilaiRapor'
      | 'nilaiTertulis'
      | 'nilaiPraktik'
      | 'sikapP5'
      | 'noSkl'
      | 'noIjazah'
      | 'raporK4S1'
      | 'raporK4S2'
      | 'raporK5S1'
      | 'raporK5S2'
      | 'raporK6S1'
      | 'raporK6S2',
    value: number | SikapP5Type | string | undefined
  ) => {
    setNilaiMap((prev) => {
      const cur = prev[student.id] || getRowRecord(student);
      const nextRaw: NilaiAsajRecord = {
        ...cur,
        [field]: value,
        ...(field === 'nilaiRapor' ? { nilaiRaporManual: true } : {}),
      };
      return {
        ...prev,
        [student.id]: recomputeRecordFromRapor(nextRaw, kosp),
      };
    });
  };

  // Update nilai per mata pelajaran pada Menu 3 (Input Nilai ASAJ & KOSP per Mapel)
  const updateAsajPerMapelField = (
    student: Student,
    mapelName: string,
    field: 'rapor' | 'tertulis' | 'praktik',
    rawVal: string
  ) => {
    const trimmed = rawVal.trim();
    const numVal = trimmed === '' ? 0 : Math.min(100, Math.max(0, Number(trimmed) || 0));
    setNilaiMap((prev) => {
      const cur = prev[student.id] || getRowRecord(student);
      const nextRaw: NilaiAsajRecord = { ...cur };

      if (field === 'rapor') {
        const nextRaporMapel = { ...(cur.raporMapelScores || {}) };
        const nextManualFlags = { ...(cur.raporMapelManual || {}) };
        if (trimmed === '') {
          delete nextRaporMapel[mapelName];
          delete nextManualFlags[mapelName];
        } else {
          nextRaporMapel[mapelName] = numVal;
          nextManualFlags[mapelName] = true;
        }
        nextRaw.raporMapelScores = nextRaporMapel;
        nextRaw.raporMapelManual = nextManualFlags;
        nextRaw.nilaiRaporManual = false;
      } else if (field === 'tertulis') {
        nextRaw.asajTertulisMapel = {
          ...(cur.asajTertulisMapel || {}),
          [mapelName]: numVal,
        };
      } else if (field === 'praktik') {
        nextRaw.asajPraktikMapel = {
          ...(cur.asajPraktikMapel || {}),
          [mapelName]: numVal,
        };
      }

      return {
        ...prev,
        [student.id]: recomputeRecordFromRapor(nextRaw, kosp),
      };
    });
  };

  // Update nilai per mapel pada semester aktif (k4s1..k6s2) -> otomatis hitung semester avg, 6-sem rata rapor, ASAJ & Rekap Ijazah
  const updateRaporMapelCell = (
    student: Student,
    semKey: RaporSemesterKey,
    mapelName: string,
    rawVal: string
  ) => {
    const trimmed = rawVal.trim();
    const numVal = trimmed === '' ? 0 : Math.min(100, Math.max(0, Number(trimmed) || 0));
    setNilaiMap((prev) => {
      const cur = prev[student.id] || getRowRecord(student);
      const nextSemMapel = { ...(cur.raporSemesterMapel || {}) };
      const curSemScores = { ...(nextSemMapel[semKey] || {}) };
      if (trimmed === '' || numVal <= 0) {
        delete curSemScores[mapelName];
      } else {
        curSemScores[mapelName] = numVal;
      }
      nextSemMapel[semKey] = curSemScores;
      const nextManualFlags = { ...(cur.raporMapelManual || {}) };
      delete nextManualFlags[mapelName];
      const updated = recomputeRecordFromRapor(
        { ...cur, raporSemesterMapel: nextSemMapel, raporMapelManual: nextManualFlags, nilaiRaporManual: false },
        kosp
      );
      return {
        ...prev,
        [student.id]: updated,
      };
    });
  };

  // Save KOSP Settings (Formula Bobot Rapor vs ASAJ / Format Penomoran) to Firestore settings_asaj/config
  const handleSaveKosp = async () => {
    if (Number(kosp.bobotRapor) + Number(kosp.bobotAsaj) !== 100) {
      showToast('Total bobot Rata-rata Rapor + ASAJ harus 100%!', 'error');
      return;
    }

    setIsSavingKosp(true);
    try {
      await setDoc(
        doc(db, 'settings_asaj', 'config'),
        { ...kosp, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      setNilaiMap((prev) => {
        const next: Record<string, NilaiAsajRecord> = {};
        Object.entries(prev).forEach(([id, rec]) => {
          next[id] = recomputeRecordFromRapor(rec, kosp);
        });
        return next;
      });
      showToast('Pengaturan bobot & format ASAJ tersimpan ke Firestore (settings_asaj)!', 'success');
    } catch (err) {
      console.error('Gagal menyimpan KOSP ASAJ:', err);
      showToast('Gagal menyimpan pengaturan KOSP ke Cloud Firestore.', 'error');
    } finally {
      setIsSavingKosp(false);
    }
  };

  // Sinkronisasi otomatis & manual dari semester dan tahun ajaran sebelumnya (K4 Sem 1 - K6 Sem 2)
  const syncPreviousSemestersFromStorage = async (onlyFillEmpty: boolean, showNotification: boolean) => {
    if (kelas6Students.length === 0) {
      if (showNotification) showToast('Belum ada data siswa Kelas 6.', 'error');
      return;
    }

    // Baca juga Firestore collections 'assessments' & 'rapor' jika ada nilai tersimpan per semester/tahun
    const firestoreSemMap: Record<string, Partial<Record<RaporSemesterKey, Record<string, number>>>> = {};
    for (const colName of ['assessments', 'rapor']) {
      try {
        const snap = await getDocs(collection(db, colName));
        snap.forEach((d) => {
          const data = d.data() as any;
          const sid = data.studentId;
          if (!sid) return;
          const kelasStr = String(data.kelas || '');
          const semStr = String(data.semester || '').toLowerCase();
          let matchedSemKey: RaporSemesterKey | null = null;
          if (kelasStr.includes('4')) matchedSemKey = semStr.includes('2') || semStr.includes('genap') ? 'k4s2' : 'k4s1';
          else if (kelasStr.includes('5')) matchedSemKey = semStr.includes('2') || semStr.includes('genap') ? 'k5s2' : 'k5s1';
          else if (kelasStr.includes('6')) matchedSemKey = semStr.includes('2') || semStr.includes('genap') ? 'k6s2' : 'k6s1';

          if (matchedSemKey && data.mapel && typeof (data.nilaiAkhir ?? data.rataRata) === 'number') {
            if (!firestoreSemMap[sid]) firestoreSemMap[sid] = {};
            if (!firestoreSemMap[sid][matchedSemKey]) firestoreSemMap[sid][matchedSemKey] = {};
            const val = Number(data.nilaiAkhir ?? data.rataRata);
            if (val > 0) firestoreSemMap[sid][matchedSemKey]![data.mapel] = val;
          }
        });
      } catch {}
    }

    let populatedCellsCount = 0;
    setNilaiMap((prev) => {
      const next = { ...prev };
      kelas6Students.forEach((s) => {
        const cur = next[s.id] || getRowRecord(s);
        const semMap = { ...(cur.raporSemesterMapel || {}) };

        raporSemesters.forEach((cfg) => {
          const existingScores = { ...(semMap[cfg.key] || {}) };
          const localScores = readStoredSemesterGradesForStudent(s, cfg, activeYear);
          const fsScores = firestoreSemMap[s.id]?.[cfg.key] || {};
          const mergedSource = { ...fsScores, ...localScores };

          Object.entries(mergedSource).forEach(([mapelName, score]) => {
            if (score > 0 && (!onlyFillEmpty || !existingScores[mapelName])) {
              existingScores[mapelName] = score;
              populatedCellsCount++;
            }
          });
          if (Object.keys(existingScores).length > 0) {
            semMap[cfg.key] = existingScores;
          }
        });

        next[s.id] = recomputeRecordFromRapor(
          {
            ...cur,
            raporSemesterMapel: semMap,
            ...(onlyFillEmpty ? {} : { nilaiRaporManual: false, raporMapelManual: {} }),
          },
          kosp
        );
      });
      return next;
    });

    if (showNotification) {
      showToast(
        populatedCellsCount > 0
          ? `Berhasil menarik ${populatedCellsCount} nilai dari semester & tahun ajaran sebelumnya!`
          : 'Tidak ada data nilai semester/tahun sebelumnya yang tersimpan. Silakan input manual atau Import Excel.',
        'success'
      );
    }
  };

  // Auto-connect sekali setelah Firestore selesai dimuat agar nilai sebelumnya otomatis muncul bila belum diisi manual
  useEffect(() => {
    if (!firestoreLoaded || hasAutoConnectedPrev || kelas6Students.length === 0) return;
    setHasAutoConnectedPrev(true);
    syncPreviousSemestersFromStorage(true, false);
  }, [firestoreLoaded, hasAutoConnectedPrev, kelas6Students.length]);

  // Download Template Excel untuk semester yang sedang dipilih
  const handleExportRaporTemplate = () => {
    const semCfg = raporSemesters.find((c) => c.key === activeRaporSem) || raporSemesters[0];
    const activeSubjs = RAPOR_SUBJECTS.filter((m) => semCfg.grade >= m.minGrade);
    const rows = filteredStudents.map((s, idx) => {
      const rec = getRowRecord(s);
      const semScores = rec.raporSemesterMapel?.[activeRaporSem] || {};
      const rowObj: Record<string, any> = {
        NO: idx + 1,
        NISN: s.nisn || '-',
        NAMA: s.nama,
      };
      activeSubjs.forEach((m) => {
        rowObj[m.code] = semScores[m.name] && semScores[m.name] > 0 ? semScores[m.name] : '';
      });
      return rowObj;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, semCfg.shortLabel);
    XLSX.writeFile(wb, `Template_Rapor_${semCfg.shortLabel.replace(/\s+/g, '_')}.xlsx`);
    showToast(`Template Excel ${semCfg.label} berhasil diunduh!`, 'success');
  };

  // Import Excel untuk semester yang sedang dipilih
  const handleImportRaporExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
      if (jsonRows.length === 0) {
        showToast('File Excel kosong.', 'error');
        return;
      }

      const semCfg = raporSemesters.find((c) => c.key === activeRaporSem) || raporSemesters[0];
      const activeSubjs = RAPOR_SUBJECTS.filter((m) => semCfg.grade >= m.minGrade);
      let matchedStudents = 0;

      setNilaiMap((prev) => {
        const next = { ...prev };
        jsonRows.forEach((row) => {
          const rowNisn = String(row.NISN ?? row.nisn ?? '').trim();
          const rowNama = String(row.NAMA ?? row.Nama ?? row.nama ?? '').trim().toLowerCase();
          const student = kelas6Students.find(
            (st) => (rowNisn && st.nisn === rowNisn) || (rowNama && st.nama.toLowerCase() === rowNama)
          );
          if (!student) return;

          const cur = next[student.id] || getRowRecord(student);
          const nextSemMapel = { ...(cur.raporSemesterMapel || {}) };
          const semScores = { ...(nextSemMapel[activeRaporSem] || {}) };

          activeSubjs.forEach((m) => {
            const rawVal = row[m.code] ?? row[m.name];
            if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
              const num = Number(rawVal);
              if (!Number.isNaN(num) && num > 0) {
                semScores[m.name] = Math.min(100, Math.max(0, num));
              }
            }
          });

          nextSemMapel[activeRaporSem] = semScores;
          next[student.id] = recomputeRecordFromRapor({ ...cur, raporSemesterMapel: nextSemMapel }, kosp);
          matchedStudents++;
        });
        return next;
      });

      showToast(
        matchedStudents > 0
          ? `Berhasil import nilai ${matchedStudents} siswa ke ${semCfg.label}! Klik Simpan Nilai untuk permanen ke Firestore.`
          : 'Tidak ada nama/NISN siswa Kelas 6 yang cocok pada file Excel.',
        matchedStudents > 0 ? 'success' : 'error'
      );
    } catch (err) {
      console.error('Import Excel rapor error:', err);
      showToast('Gagal membaca file Excel. Pastikan format kolom sesuai Template Excel.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Batch Save ke Firestore nilai_asaj
  const handleSaveBatch = async () => {
    if (filteredStudents.length === 0) {
      showToast('Tidak ada data siswa Kelas 6 untuk disimpan.', 'error');
      return;
    }

    setIsSavingBatch(true);
    try {
      const batch = writeBatch(db);
      const savedRecords: Record<string, NilaiAsajRecord> = {};

      filteredStudents.forEach((s) => {
        const rec = recomputeRecordFromRapor(getRowRecord(s), kosp);
        const payload: NilaiAsajRecord = {
          ...rec,
          mapelScores: rec.mapelScores || buildDefaultMapelScores(rec.nilaiAkhir),
          updatedAt: new Date().toISOString(),
        };
        savedRecords[s.id] = payload;
        batch.set(doc(db, 'nilai_asaj', s.id), stripUndefined(payload), { merge: true });
      });

      await batch.commit();
      setNilaiMap((prev) => ({ ...prev, ...savedRecords }));
      showToast(`Berhasil menyimpan ${filteredStudents.length} nilai siswa ke koleksi nilai_asaj!`, 'success');
    } catch (err) {
      console.error('Batch save ASAJ error:', err);
      showToast('Gagal menyimpan nilai ke Cloud Firestore.', 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Auto-Generate Nomor SKL berurutan + simpan ke Firestore
  const handleAutoGenerateSkl = async () => {
    const targetList = filteredStudents.length > 0 ? filteredStudents : kelas6Students;
    if (targetList.length === 0) {
      showToast('Belum ada data siswa Kelas 6 untuk digenerate No. SKL.', 'error');
      return;
    }

    setIsSavingBatch(true);
    try {
      const batch = writeBatch(db);
      const updatedRecords: Record<string, NilaiAsajRecord> = {};

      targetList.forEach((s, idx) => {
        const rec = getRowRecord(s);
        const generatedSkl = generateNoSkl(kosp, idx);
        const payload: NilaiAsajRecord = {
          ...rec,
          noSkl: generatedSkl,
          mapelScores: rec.mapelScores || buildDefaultMapelScores(rec.nilaiAkhir),
          updatedAt: new Date().toISOString(),
        };
        updatedRecords[s.id] = payload;
        batch.set(doc(db, 'nilai_asaj', s.id), stripUndefined(payload), { merge: true });
      });

      batch.set(
        doc(db, 'settings_asaj', 'config'),
        stripUndefined({ ...kosp, updatedAt: new Date().toISOString() }),
        { merge: true }
      );

      await batch.commit();
      setNilaiMap((prev) => ({ ...prev, ...updatedRecords }));
      showToast(
        `Berhasil Auto-Generate ${targetList.length} Nomor SKL (${generateNoSkl(kosp, 0)} s.d. ${generateNoSkl(kosp, targetList.length - 1)}) dan tersimpan ke Firestore!`,
        'success'
      );
    } catch (err) {
      console.error('Auto-generate SKL error:', err);
      showToast('Gagal menyimpan Nomor SKL hasil generate ke Firestore.', 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Auto-Generate Nomor Seri Ijazah / NIN + simpan ke Firestore
  const handleAutoGenerateIjazah = async () => {
    const targetList = filteredStudents.length > 0 ? filteredStudents : kelas6Students;
    if (targetList.length === 0) {
      showToast('Belum ada data siswa Kelas 6 untuk digenerate No. Ijazah.', 'error');
      return;
    }

    setIsSavingBatch(true);
    try {
      const batch = writeBatch(db);
      const updatedRecords: Record<string, NilaiAsajRecord> = {};

      targetList.forEach((s, idx) => {
        const rec = getRowRecord(s);
        const generatedNo = generateNoIjazah(kosp, idx);
        const payload: NilaiAsajRecord = {
          ...rec,
          noIjazah: generatedNo,
          mapelScores: rec.mapelScores || buildDefaultMapelScores(rec.nilaiAkhir),
          updatedAt: new Date().toISOString(),
        };
        updatedRecords[s.id] = payload;
        batch.set(doc(db, 'nilai_asaj', s.id), stripUndefined(payload), { merge: true });
      });

      batch.set(
        doc(db, 'settings_asaj', 'config'),
        stripUndefined({ ...kosp, updatedAt: new Date().toISOString() }),
        { merge: true }
      );

      await batch.commit();
      setNilaiMap((prev) => ({ ...prev, ...updatedRecords }));
      showToast(
        `Berhasil Auto-Generate ${targetList.length} Nomor Seri Ijazah (${generateNoIjazah(kosp, 0)} s.d. ${generateNoIjazah(kosp, targetList.length - 1)}) ke Firestore!`,
        'success'
      );
    } catch (err) {
      console.error('Auto-generate Nomor Seri Ijazah error:', err);
      showToast('Gagal menyimpan Nomor Seri Ijazah ke Firestore.', 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Trigger A4 print cleanly after state mounts
  const triggerPrint = (type: 'skl' | 'ijazah', record: NilaiAsajRecord, student?: Student, idxOffset = 0) => {
    const enriched: NilaiAsajRecord = {
      ...record,
      noSkl: record.noSkl || generateNoSkl(kosp, idxOffset),
      noIjazah: record.noIjazah || generateNoIjazah(kosp, idxOffset),
    };
    setPrintPayload({ type, record: enriched, student });
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const triggerPrintRaporSem = (semCfg: RaporSemesterConfig) => {
    const rows = filteredStudents.map((s) => ({ student: s, rec: getRowRecord(s) }));
    setPrintPayload({ type: 'rapor-sem', semCfg, rows });
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const triggerPrintRekapIjazah = (
    rows: { student: Student; rec: NilaiAsajRecord; ms: Record<string, number>; avgMapel: number }[]
  ) => {
    setPrintPayload({ type: 'rekap-ijazah', rows });
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Analytics for Tab 1: Rekapitulasi ASAJ (berdasarkan rata-rata nilai ijazah tiap mata pelajaran)
  const analytics = useMemo(() => {
    const sourceRows =
      filteredStudents.length > 0
        ? filteredStudents.map((s) => getRowRecord(s))
        : Object.values(nilaiMap).map((r) => {
            const calc = calculateRow(r.nilaiRapor, r.nilaiTertulis, r.nilaiPraktik, r.sikapP5);
            return { ...r, ...calc };
          });

    const records = sourceRows.map((r) => {
      const ms = r.mapelScores || buildDefaultMapelScores(r.nilaiAkhir);
      const avgMapelIjazah =
        Math.round(
          (MAPEL_IJAZAH_SD.reduce((acc, m) => acc + Number(ms[m] ?? r.nilaiAkhir ?? 80), 0) /
            MAPEL_IJAZAH_SD.length) *
            100
        ) / 100;
      return { ...r, ms, avgMapelIjazah };
    });

    const total = records.length;
    const avgTertulis = total ? records.reduce((a, r) => a + r.nilaiTertulis, 0) / total : 0;
    const avgPraktik = total ? records.reduce((a, r) => a + r.nilaiPraktik, 0) / total : 0;
    const avgIjazah = total ? records.reduce((a, r) => a + r.avgMapelIjazah, 0) / total : 0;
    const avgRapor = total ? records.reduce((a, r) => a + r.nilaiRapor, 0) / total : 0;
    const lulusCount = records.filter((r) => r.status === 'LULUS').length;
    const tidakLulusCount = total - lulusCount;
    const pctLulus = total ? Math.round((lulusCount / total) * 100) : 0;
    const pctTidak = total ? 100 - pctLulus : 0;
    const top10 = [...records].sort((a, b) => b.avgMapelIjazah - a.avgMapelIjazah).slice(0, 10);

    const mapelAvgs = MAPEL_IJAZAH_SD.map((m) => {
      const avg = total
        ? records.reduce((acc, r) => acc + Number(r.ms[m] ?? r.nilaiAkhir ?? 80), 0) / total
        : 0;
      return { name: m, short: MAPEL_SHORT_LABELS[m] || m, avg };
    });

    return {
      total,
      avgTertulis,
      avgPraktik,
      avgIjazah,
      avgRapor,
      lulusCount,
      tidakLulusCount,
      pctLulus,
      pctTidak,
      top10,
      mapelAvgs,
    };
  }, [nilaiMap, filteredStudents, kosp]);

  // Student Portal Handler
  const handleStudentOpenEnvelope = async () => {
    setIsEnvelopeOpened(true);
    const nisn = activeUser.studentData?.nisn || '';
    const uid = activeUser.studentData?.id || '';

    let found: NilaiAsajRecord | null = (uid && nilaiMap[uid]) ? nilaiMap[uid] : null;
    if (!found && nisn) {
      try {
        const q = query(collection(db, 'nilai_asaj'), where('nisn', '==', nisn));
        const snap = await getDocs(q);
        snap.forEach((d) => {
          found = { ...(d.data() as NilaiAsajRecord), studentId: d.id };
        });
      } catch {}
    }

    if (!found) {
      found =
        Object.values(nilaiMap).find(
          (r) =>
            (nisn && r.nisn === nisn) ||
            r.nama?.toLowerCase() === activeUser.name.toLowerCase()
        ) || null;
    }

    if (!found) {
      showToast('Data nilai kelulusan Anda belum diinput oleh wali kelas 6.', 'error');
      return;
    }

    const calc = calculateRow(found.nilaiRapor, found.nilaiTertulis, found.nilaiPraktik, found.sikapP5);
    setStudentResult({ ...found, ...calc });
  };

  // RENDER: STUDENT PORTAL VIEW
  if (activeUser.role === 'siswa') {
    const jadwalMs = kosp.jadwalPengumuman ? new Date(kosp.jadwalPengumuman).getTime() : 0;
    const isBeforeSchedule = Boolean(jadwalMs && nowMs < jadwalMs);
    const diff = Math.max(0, jadwalMs - nowMs);
    const cdDays = Math.floor(diff / (1000 * 60 * 60 * 24));
    const cdHours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const cdMinutes = Math.floor((diff / (1000 * 60)) % 60);
    const cdSeconds = Math.floor((diff / 1000) % 60);

    return (
      <section className="space-y-6">
        {isBeforeSchedule ? (
          <div className="no-print bg-white rounded-[2rem] p-8 shadow-xl border-2 border-rose-200 text-center max-w-2xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-black uppercase border border-amber-200">
              <Clock className="w-4 h-4 animate-spin" /> Pengumuman Belum Dibuka
            </div>
            <div>
              <h2 className="font-display font-black text-2xl text-slate-800">
                Pengumuman Kelulusan ASAJ Kelas 6
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                Dibuka resmi pada:{' '}
                <strong className="text-rose-700">
                  {new Date(jadwalMs).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}
                </strong>
              </p>
            </div>
            <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
              {[
                { val: cdDays, label: 'Hari' },
                { val: cdHours, label: 'Jam' },
                { val: cdMinutes, label: 'Menit' },
                { val: cdSeconds, label: 'Detik' },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-2xl bg-rose-50 border-2 border-rose-200">
                  <div className="font-display font-black text-3xl text-rose-700">
                    {String(item.val).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] font-extrabold uppercase text-slate-500">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="no-print bg-white rounded-[2rem] p-8 shadow-xl border-2 border-emerald-200 text-center max-w-2xl mx-auto space-y-6">
            <div>
              <span className="inline-block px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black uppercase border border-emerald-200">
                Portal Pengumuman Kelulusan Resmi
              </span>
              <h2 className="font-display font-black text-2xl text-slate-800 mt-2">
                Amplop Hasil Kelulusan Anda
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Klik kartu amplop di bawah untuk membuka hasil kelulusan dan mengunduh SKL Anda.
              </p>
            </div>

            {!isEnvelopeOpened && (
              <button
                type="button"
                onClick={handleStudentOpenEnvelope}
                className="mx-auto w-72 h-44 rounded-3xl bg-gradient-to-br from-rose-600 via-rose-700 to-amber-500 text-white shadow-2xl hover:scale-105 transition-transform flex flex-col items-center justify-center gap-3 cursor-pointer border-4 border-amber-200"
              >
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  <MailOpen className="w-8 h-8 text-amber-200 animate-bounce" />
                </div>
                <div>
                  <div className="font-display font-black text-base">BUKA AMPLOP KELULUSAN</div>
                  <div className="text-xs text-rose-100">{activeUser.name}</div>
                </div>
              </button>
            )}

            {isEnvelopeOpened && studentResult && (
              <div className="text-left bg-slate-50 rounded-3xl p-6 border-2 border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase text-slate-500">Peserta Didik</div>
                    <h3 className="font-display font-black text-lg text-slate-900">{studentResult.nama}</h3>
                    <p className="text-xs text-slate-600 font-mono">
                      NISN: {studentResult.nisn || '-'} • {studentResult.kelas}
                    </p>
                  </div>
                  <span
                    className={`px-5 py-2.5 rounded-2xl font-display font-black text-base text-white shadow-sm ${
                      studentResult.status === 'LULUS' ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}
                  >
                    {studentResult.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-white p-3 rounded-2xl border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Rata Rapor</div>
                    <div className="font-display font-black text-lg text-slate-800">
                      {Number(studentResult.nilaiRapor || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Nilai ASAJ</div>
                    <div className="font-display font-black text-lg text-slate-800">
                      {Number(studentResult.nilaiAsaj || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Nilai Akhir</div>
                    <div className="font-display font-black text-xl text-rose-700">
                      {Number(studentResult.nilaiAkhir || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Sikap P5</div>
                    <div className="font-display font-black text-sm text-emerald-700 pt-1">
                      {studentResult.sikapP5}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => triggerPrint('skl', studentResult, activeUser.studentData)}
                    className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold text-xs shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" /> Unduh SKL (PDF A4)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Print Template Portal Siswa */}
        {printPayload && <PrintASAJTemplate payload={printPayload} profile={profile} kosp={kosp} />}
      </section>
    );
  }

  // RENDER: ADMIN / GURU DASHBOARD
  return (
    <section className="space-y-6">
      {/* Header Bar */}
      <div className="no-print bg-white p-4 rounded-3xl shadow-xs border border-rose-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-200">
            <GraduationCap className="w-5 h-5" />
          </span>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-rose-700 tracking-wider">
              Manajemen ASAJ &amp; Kelulusan Kelas 6 • Firestore Real-time
            </span>
            <h3 className="font-display font-black text-sm sm:text-base text-slate-800">
              Nilai ASAJ, Pengaturan KOSP, Rekapitulasi, SKL &amp; Draf Ijazah
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/asaj.html"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 font-display font-extrabold text-xs flex items-center gap-1.5 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Buka Versi Standalone (asaj.html)
          </a>
        </div>
      </div>

      {/* Navigation Tabs (Urutan Sesuai Permintaan: 1. Rekapitulasi ASAJ, 2. Input Nilai Rapor, 3. Input Nilai ASAJ & KOSP, 4. Rekap Nilai Ijazah, 5. Cetak SKL & Ijazah) */}
      <div className="no-print bg-white p-3 rounded-3xl shadow-xs border border-slate-100 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSubTab('rekap')}
          className={`px-3.5 py-2.5 rounded-2xl font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition ${
            subTab === 'rekap'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-rose-50'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> 1. Rekapitulasi ASAJ
        </button>
        <button
          type="button"
          onClick={() => setSubTab('rapor')}
          className={`px-3.5 py-2.5 rounded-2xl font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition ${
            subTab === 'rapor'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-rose-50'
          }`}
        >
          <BookOpen className="w-4 h-4" /> 2. Input Nilai Rapor
        </button>
        <button
          type="button"
          onClick={() => setSubTab('input')}
          className={`px-3.5 py-2.5 rounded-2xl font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition ${
            subTab === 'input'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-rose-50'
          }`}
        >
          <Sliders className="w-4 h-4" /> 3. Input Nilai ASAJ &amp; KOSP
        </button>
        <button
          type="button"
          onClick={() => setSubTab('rekap-ijazah')}
          className={`px-3.5 py-2.5 rounded-2xl font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition ${
            subTab === 'rekap-ijazah'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-rose-50'
          }`}
        >
          <Table className="w-4 h-4" /> 4. Rekap Nilai Ijazah (Semua Mapel)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('cetak')}
          className={`px-3.5 py-2.5 rounded-2xl font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition ${
            subTab === 'cetak'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-rose-50'
          }`}
        >
          <Printer className="w-4 h-4" /> 5. Cetak SKL &amp; Ijazah
        </button>
      </div>

      {/* TAB 1: REKAPITULASI ASAJ (Visualisasi Rata-rata Nilai Ijazah, Grafik Lulus & Tidak Lulus, Top 10 dari Rata-rata Mapel Ijazah) */}
      {subTab === 'rekap' && (
        <div className="no-print space-y-6">
          <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-display font-black text-base text-slate-800">
                Visualisasi Rekapitulasi Nilai Ijazah &amp; Kelulusan ASAJ Kelas 6
              </h4>
              <p className="text-xs text-slate-500">
                Rata-rata nilai ijazah &amp; peringkat 10 lulusan terbaik dihitung dari rata-rata nilai ijazah tiap mata pelajaran (10 mapel).
              </p>
            </div>
            <select
              value={rombelFilter}
              onChange={(e) => setRombelFilter(e.target.value as any)}
              className="px-3.5 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-extrabold text-slate-700 outline-none cursor-pointer"
            >
              <option value="ALL">Semua Kelas 6 (6A &amp; 6B)</option>
              <option value="Kelas 6A">Kelas 6A</option>
              <option value="Kelas 6B">Kelas 6B</option>
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Card 1: Visualisasi Bar Rata-rata Nilai Ijazah Tiap Mata Pelajaran */}
            <div className="lg:col-span-2 bg-white rounded-3xl p-5 shadow-md border border-sky-100 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full">
                  Visualisasi Rata-rata Nilai Ijazah Tiap Mata Pelajaran (10 Mapel)
                </span>
                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500">
                  <span>US Tertulis: <strong className="text-sky-700">{analytics.avgTertulis.toFixed(1)}</strong></span>
                  <span>US Praktek: <strong className="text-indigo-700">{analytics.avgPraktik.toFixed(1)}</strong></span>
                </div>
              </div>
              <div className="space-y-2 pt-1">
                {analytics.mapelAvgs.map((m) => (
                  <div key={m.name} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-700 truncate pr-2">{m.name}</span>
                      <span className="font-mono font-black text-indigo-800 shrink-0">{m.avg.toFixed(2)}</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-rose-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, m.avg))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2 & 3 Stacked: Rata-rata Nilai Ijazah Angkatan + Grafik Lulus & Tidak Lulus */}
            <div className="space-y-5 flex flex-col justify-between">
              <div className="bg-gradient-to-br from-rose-600 via-rose-700 to-amber-500 text-white rounded-3xl p-6 shadow-md flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase bg-white/20 px-2.5 py-1 rounded-full">
                    Rata-rata Nilai Ijazah Angkatan
                  </span>
                  <div className="mt-4">
                    <div className="text-xs font-bold text-rose-100">Rata-rata Nilai Ijazah Tiap Mapel</div>
                    <div className="font-display font-black text-5xl mt-1">
                      {analytics.avgIjazah.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/25 flex items-center justify-between text-xs font-bold">
                  <span>Total Peserta: <strong>{analytics.total}</strong></span>
                  <span>Rata Rapor: <strong>{analytics.avgRapor.toFixed(1)}</strong></span>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 shadow-md border border-emerald-100 flex-1 flex flex-col justify-between space-y-3">
                <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full w-fit">
                  Grafik Lulus &amp; Tidak Lulus
                </span>
                <div className="flex items-center gap-4">
                  <div
                    className="w-24 h-24 rounded-full shrink-0 flex items-center justify-center shadow-inner border-4 border-white"
                    style={{
                      background:
                        analytics.total > 0
                          ? `conic-gradient(#10b981 0% ${analytics.pctLulus}%, #e11d48 ${analytics.pctLulus}% 100%)`
                          : 'conic-gradient(#cbd5e1 0% 100%)',
                    }}
                  >
                    <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center font-display font-black text-xs text-slate-800 shadow-xs">
                      {analytics.pctLulus}%
                    </div>
                  </div>
                  <div className="space-y-2 text-xs flex-1">
                    <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                      <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Lulus
                      </span>
                      <span className="font-black text-emerald-900">
                        {analytics.pctLulus}% ({analytics.lulusCount})
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-rose-50 border border-rose-200">
                      <span className="font-bold text-rose-800 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" /> Tidak Lulus
                      </span>
                      <span className="font-black text-rose-900">
                        {analytics.pctTidak}% ({analytics.tidakLulusCount})
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-full h-3 rounded-full bg-rose-100 overflow-hidden flex">
                  <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${analytics.pctLulus}%` }} />
                  <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${analytics.pctTidak}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Top 10 Lulusan Terbaik (diambil dari rata-rata nilai ijazah tiap mata pelajaran) */}
          <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-black uppercase bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                  Peringkat Prestasi Akademik (Dari Rata-rata Nilai Ijazah 10 Mapel)
                </span>
                <h4 className="font-display font-black text-lg text-slate-800 mt-1">
                  10 Besar Peserta Didik Lulusan Terbaik
                </h4>
              </div>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[11px] border-b border-slate-200">
                    <th className="p-3 text-center w-14">Rank</th>
                    <th className="p-3">Nama Peserta Didik</th>
                    <th className="p-3 text-center">Kelas</th>
                    <th className="p-3 text-center">Rata Rapor</th>
                    <th className="p-3 text-center">Nilai ASAJ</th>
                    <th className="p-3 text-center">Rata Nilai Ijazah (10 Mapel)</th>
                    <th className="p-3 text-center">Sikap P5</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.top10.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                        Belum ada data siswa Kelas 6.
                      </td>
                    </tr>
                  ) : (
                    analytics.top10.map((r, i) => (
                      <tr key={r.studentId} className="hover:bg-slate-50">
                        <td className="p-3 text-center font-display font-black">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${
                              i === 0
                                ? 'bg-amber-400 text-amber-950'
                                : i === 1
                                ? 'bg-slate-300 text-slate-800'
                                : i === 2
                                ? 'bg-orange-300 text-orange-950'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {i + 1}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-800">
                          {r.nama}
                          <div className="text-[10px] font-mono text-slate-500">NISN: {r.nisn}</div>
                        </td>
                        <td className="p-3 text-center font-bold">{r.kelas}</td>
                        <td className="p-3 text-center font-mono">{r.nilaiRapor.toFixed(2)}</td>
                        <td className="p-3 text-center font-mono font-bold text-sky-700">{r.nilaiAsaj.toFixed(2)}</td>
                        <td className="p-3 text-center font-mono font-black text-rose-700">{r.avgMapelIjazah.toFixed(2)}</td>
                        <td className="p-3 text-center font-bold">{r.sikapP5}</td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                              r.status === 'LULUS'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INPUT NILAI RAPOR (KELAS 4 SEM 1 - KELAS 6 SEM 2) */}
      {subTab === 'rapor' && (() => {
        const semCfg = raporSemesters.find((c) => c.key === activeRaporSem) || raporSemesters[0];
        const activeSubjs = RAPOR_SUBJECTS.filter((m) => semCfg.grade >= m.minGrade);

        return (
          <div className="no-print bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-5">
            {/* Header + Action Buttons */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <h4 className="font-display font-black text-xl text-slate-900">
                  Input Nilai Rapor (Kelas 4 Sem 1 – Kelas 6 Sem 2)
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                  Seluruh mapel aktif untuk 6 semester. Digunakan untuk perhitungan <strong>Rata-rata Rapor ASAJ</strong> &amp; <strong>Rekap Nilai Ijazah</strong>. Nilai <strong>0 atau kosong</strong> tidak dihitung ke rata-rata.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportRaporTemplate}
                  className="px-4 py-2 rounded-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Download className="w-3.5 h-3.5" /> Template Excel
                </button>
                <input
                  ref={raporFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportRaporExcel}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => raporFileInputRef.current?.click()}
                  className="px-4 py-2 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-xs font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Upload className="w-3.5 h-3.5" /> Import Excel
                </button>
                <button
                  type="button"
                  onClick={() => triggerPrintRaporSem(semCfg)}
                  className="px-4 py-2 rounded-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Printer className="w-3.5 h-3.5" /> Download PDF (A4)
                </button>
                <button
                  type="button"
                  onClick={() => syncPreviousSemestersFromStorage(false, true)}
                  className="px-4 py-2 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 shadow-xs font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Tarik Nilai Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={handleSaveBatch}
                  disabled={isSavingBatch}
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white shadow-md font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Save className="w-3.5 h-3.5" /> {isSavingBatch ? 'Menyimpan...' : 'Simpan Nilai'}
                </button>
              </div>
            </div>

            {/* Selector Bar: Dropdown Kelas/Semester (termasuk Kelas 6 Sem 2) + Quick Pills */}
            <div className="p-3.5 rounded-3xl bg-slate-50/90 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-bold text-slate-600 pl-1">Kelas / Semester:</span>
                <select
                  value={activeRaporSem}
                  onChange={(e) => setActiveRaporSem(e.target.value as RaporSemesterKey)}
                  className="px-4 py-2 rounded-2xl border-2 border-indigo-400 bg-white font-display font-extrabold text-xs sm:text-sm text-slate-800 outline-none shadow-2xs cursor-pointer"
                >
                  {raporSemesters.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select
                  value={rombelFilter}
                  onChange={(e) => setRombelFilter(e.target.value as any)}
                  className="px-3.5 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-extrabold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="ALL">Semua Kelas 6 (6A &amp; 6B)</option>
                  <option value="Kelas 6A">Kelas 6A</option>
                  <option value="Kelas 6B">Kelas 6B</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {raporSemesters.map((c) => {
                  const isActive = c.key === activeRaporSem;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setActiveRaporSem(c.key)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-display font-extrabold transition cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-700'
                      }`}
                    >
                      {c.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tabel Input Per Mapel Per Semester */}
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/90 text-slate-600 border-b border-slate-200">
                    <th className="p-3 text-center font-extrabold uppercase text-[11px] w-10">NO</th>
                    <th className="p-3 font-extrabold uppercase text-[11px] min-w-[185px] sticky left-0 bg-slate-50 z-10">
                      NAMA
                    </th>
                    {activeSubjs.map((m) => (
                      <th key={m.code} className="p-2.5 text-center min-w-[82px]" title={m.name}>
                        <div className="font-extrabold text-[11px] text-slate-700 uppercase">{m.code}</div>
                        <div className="text-[9px] font-semibold text-slate-400 truncate max-w-[82px] mx-auto">
                          {m.shortDesc}
                        </div>
                      </th>
                    ))}
                    <th className="p-3 text-center font-extrabold uppercase text-[11px] text-indigo-700 min-w-[88px]">
                      RATA-RATA
                    </th>
                    <th className="p-3 text-center font-extrabold uppercase text-[11px] text-rose-700 min-w-[92px]">
                      RATA 6 SEM
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={activeSubjs.length + 4} className="p-8 text-center text-slate-400 font-bold">
                        Belum ada data siswa Kelas 6A/6B.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s, idx) => {
                      const rec = getRowRecord(s);
                      const semScores = rec.raporSemesterMapel?.[activeRaporSem] || {};
                      const semAvg = computeSemesterAvgFromMapel(semScores, semCfg.grade) ?? rec[semCfg.fieldKey];

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition">
                          <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                          <td className="p-3 sticky left-0 bg-white z-10 border-r border-slate-100">
                            <div className="font-bold text-slate-800 leading-snug">{s.nama}</div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">{s.nisn || '-'}</div>
                          </td>
                          {activeSubjs.map((m) => {
                            const val = semScores[m.name];
                            return (
                              <td key={m.code} className="p-2 text-center">
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  max={100}
                                  placeholder="-"
                                  value={val && val > 0 ? val : ''}
                                  onChange={(e) => updateRaporMapelCell(s, activeRaporSem, m.name, e.target.value)}
                                  className="w-16 px-2 py-1.5 rounded-full border border-slate-200 bg-white shadow-2xs text-center font-mono font-bold text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                                />
                              </td>
                            );
                          })}
                          <td className="p-2.5 text-center">
                            <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-mono font-black text-xs border border-indigo-100">
                              {semAvg && semAvg > 0 ? Number(semAvg).toFixed(1) : '-'}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="inline-block px-3 py-1 rounded-full bg-rose-50 text-rose-700 font-mono font-black text-xs border border-rose-100">
                              {rec.nilaiRapor.toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* TAB 3: INPUT NILAI ASAJ & KOSP PER MATA PELAJARAN (Menu Dropdown Mapel -> Terkoneksi ke Rekap Nilai Ijazah) */}
      {subTab === 'input' && (() => {
        const shortMapel = MAPEL_SHORT_LABELS[activeAsajMapel] || activeAsajMapel;
        const bR = Number(kosp.bobotRapor) || 60;
        const bA = Number(kosp.bobotAsaj) || 40;
        const divMain = bR + bA || 100;
        const subjMeta = RAPOR_SUBJECTS.find((m) => m.name === activeAsajMapel);
        const totalExpectedSem = subjMeta && subjMeta.minGrade >= 5 ? 4 : 6;

        return (
          <div className="no-print space-y-6">
            <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase bg-rose-100 text-rose-700 px-3 py-1 rounded-full">
                    Input Nilai ASAJ &amp; KOSP Per Mata Pelajaran
                  </span>
                  <h4 className="font-display font-black text-lg text-slate-800 mt-1">
                    {activeAsajMapel} ({filteredStudents.length} Siswa)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Pilih mata pelajaran pada menu dropdown. <strong>Rata-rata Rapor per mapel</strong> otomatis terhitung dari 6 semester (atau input manual) dan langsung terekap ke <strong>Menu 4 (Rekap Nilai Ijazah)</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => syncPreviousSemestersFromStorage(false, true)}
                    className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Sinkron Rapor (6 Sem)
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBatch}
                    disabled={isSavingBatch}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Save className="w-4 h-4" /> {isSavingBatch ? 'Menyimpan...' : 'Simpan Batch ke Firestore'}
                  </button>
                </div>
              </div>

              {/* Dropdown Mata Pelajaran + Rombel + Quick Mapel Pills */}
              <div className="p-3.5 rounded-3xl bg-slate-50/90 border border-slate-200/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-xs font-extrabold text-slate-600 pl-1">Mata Pelajaran:</span>
                    <select
                      value={activeAsajMapel}
                      onChange={(e) => setActiveAsajMapel(e.target.value)}
                      className="px-4 py-2 rounded-2xl border-2 border-rose-400 bg-white font-display font-extrabold text-xs sm:text-sm text-slate-800 outline-none shadow-2xs cursor-pointer"
                    >
                      {MAPEL_IJAZAH_SD.map((m, idx) => (
                        <option key={m} value={m}>
                          {idx + 1}. {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={rombelFilter}
                    onChange={(e) => setRombelFilter(e.target.value as any)}
                    className="px-3.5 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-extrabold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="ALL">Semua Kelas 6 (6A &amp; 6B)</option>
                    <option value="Kelas 6A">Kelas 6A</option>
                    <option value="Kelas 6B">Kelas 6B</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {MAPEL_IJAZAH_SD.map((m) => {
                    const isActive = m === activeAsajMapel;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setActiveAsajMapel(m)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-display font-extrabold transition cursor-pointer ${
                          isActive
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-rose-50 hover:text-rose-700'
                        }`}
                      >
                        {MAPEL_SHORT_LABELS[m] || m}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[11px] border-b border-slate-200">
                      <th className="p-3 text-center w-10">No</th>
                      <th className="p-3 min-w-[170px]">Nama Siswa &amp; NISN</th>
                      <th className="p-3 text-center">Kelas</th>
                      <th className="p-3 text-center">
                        Rata Rapor ({shortMapel})
                        <div className="text-[9px] font-semibold text-slate-500 normal-case">Auto / Manual</div>
                      </th>
                      <th className="p-3 text-center">US Tertulis ({shortMapel})</th>
                      <th className="p-3 text-center">US Praktek ({shortMapel})</th>
                      <th className="p-3 text-center">Sikap P5</th>
                      <th className="p-3 text-center">Nilai ASAJ ({shortMapel})</th>
                      <th className="p-3 text-center">Ijazah ({shortMapel})</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-400 font-bold">
                          Belum ada data siswa Kelas 6A/6B.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((s, idx) => {
                        const rec = getRowRecord(s);
                        const semFilledForMapel = raporSemesters.filter(
                          (cfg) => Number(rec.raporSemesterMapel?.[cfg.key]?.[activeAsajMapel] ?? 0) > 0
                        ).length;
                        const isManualMapelRapor = Boolean(rec.raporMapelManual?.[activeAsajMapel]);
                        const raporMapelVal = Number(rec.raporMapelScores?.[activeAsajMapel] ?? rec.nilaiRapor ?? 82);
                        const tertulisMapelVal =
                          rec.asajTertulisMapel?.[activeAsajMapel] !== undefined
                            ? Number(rec.asajTertulisMapel[activeAsajMapel])
                            : rec.nilaiTertulis;
                        const praktikMapelVal =
                          rec.asajPraktikMapel?.[activeAsajMapel] !== undefined
                            ? Number(rec.asajPraktikMapel[activeAsajMapel])
                            : rec.nilaiPraktik;
                        const asajMapelVal = Math.round(((tertulisMapelVal + praktikMapelVal) / 2) * 100) / 100;
                        const ijazahMapelVal =
                          Math.round(((raporMapelVal * bR + asajMapelVal * bA) / divMain) * 100) / 100;

                        return (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-3">
                              <div className="font-bold text-slate-800">{s.nama}</div>
                              <div className="text-[10px] font-mono text-slate-500">NISN: {s.nisn}</div>
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                {s.kelas}
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={100}
                                value={raporMapelVal}
                                onChange={(e) =>
                                  updateAsajPerMapelField(s, activeAsajMapel, 'rapor', e.target.value)
                                }
                                className="w-20 px-2 py-1.5 rounded-xl border border-indigo-300 bg-indigo-50/30 text-center font-mono font-bold text-indigo-950"
                              />
                              {isManualMapelRapor ? (
                                <div className="text-[9px] font-bold text-amber-700 mt-0.5">Input Manual</div>
                              ) : semFilledForMapel > 0 ? (
                                <div className="text-[9px] font-bold text-indigo-700 mt-0.5">
                                  Otomatis ({semFilledForMapel}/{totalExpectedSem} Sem)
                                </div>
                              ) : (
                                <div className="text-[9px] font-semibold text-slate-400 mt-0.5">Default Rapor</div>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={100}
                                value={tertulisMapelVal}
                                onChange={(e) =>
                                  updateAsajPerMapelField(s, activeAsajMapel, 'tertulis', e.target.value)
                                }
                                className="w-20 px-2 py-1.5 rounded-xl border border-slate-300 text-center font-mono font-bold"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={100}
                                value={praktikMapelVal}
                                onChange={(e) =>
                                  updateAsajPerMapelField(s, activeAsajMapel, 'praktik', e.target.value)
                                }
                                className="w-20 px-2 py-1.5 rounded-xl border border-slate-300 text-center font-mono font-bold"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <select
                                value={rec.sikapP5}
                                onChange={(e) => updateRowField(s, 'sikapP5', e.target.value as SikapP5Type)}
                                className="px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-xs"
                              >
                                <option value="Sangat Baik">Sangat Baik</option>
                                <option value="Baik">Baik</option>
                                <option value="Cukup">Cukup</option>
                                <option value="Kurang">Kurang</option>
                              </select>
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-sky-700">
                              {asajMapelVal.toFixed(2)}
                            </td>
                            <td className="p-3 text-center font-mono font-black text-rose-700">
                              {ijazahMapelVal.toFixed(2)}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black border ${
                                  rec.status === 'LULUS'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-rose-100 text-rose-800 border-rose-300'
                                }`}
                              >
                                {rec.status}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMapelStudentId(s.id);
                                  setMapelDraft(rec.mapelScores || buildDefaultMapelScores(rec.nilaiAkhir));
                                }}
                                className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] cursor-pointer"
                              >
                                Detail
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TAB 4: REKAP NILAI IJAZAH SEMUA MATA PELAJARAN (Terintegrasi Formula Bobot Rata-rata Rapor vs ASAJ) */}
      {subTab === 'rekap-ijazah' && (() => {
        const displayRows = filteredStudents
          .filter((s) => {
            if (!rekapSearch.trim()) return true;
            const q = rekapSearch.trim().toLowerCase();
            return (s.nama || '').toLowerCase().includes(q) || (s.nisn || '').toLowerCase().includes(q);
          })
          .map((s) => {
            const rec = getRowRecord(s);
            const ms = rec.mapelScores || buildDefaultMapelScores(rec.nilaiAkhir);
            const raporMs: Record<string, number> = {};
            const asajMs: Record<string, number> = {};
            MAPEL_IJAZAH_SD.forEach((m) => {
              raporMs[m] = Number(rec.raporMapelScores?.[m] ?? rec.nilaiRapor ?? 80);
              const tVal =
                rec.asajTertulisMapel?.[m] !== undefined ? Number(rec.asajTertulisMapel[m]) : rec.nilaiTertulis;
              const pVal =
                rec.asajPraktikMapel?.[m] !== undefined ? Number(rec.asajPraktikMapel[m]) : rec.nilaiPraktik;
              asajMs[m] = Math.round(((tVal + pVal) / 2) * 100) / 100;
            });
            const activeMatrix =
              rekapIjazahViewMode === 'rapor' ? raporMs : rekapIjazahViewMode === 'asaj' ? asajMs : ms;
            const avgMapel =
              MAPEL_IJAZAH_SD.reduce((acc, m) => acc + Number(activeMatrix[m] ?? rec.nilaiAkhir ?? 80), 0) /
              MAPEL_IJAZAH_SD.length;
            const avgRaporPerMapel =
              MAPEL_IJAZAH_SD.reduce((acc, m) => acc + Number(raporMs[m] ?? 0), 0) / MAPEL_IJAZAH_SD.length;
            const avgAsajPerMapel =
              MAPEL_IJAZAH_SD.reduce((acc, m) => acc + Number(asajMs[m] ?? 0), 0) / MAPEL_IJAZAH_SD.length;
            return {
              student: s,
              rec,
              ms,
              raporMs,
              asajMs,
              activeMatrix,
              avgMapel,
              avgRaporPerMapel,
              avgAsajPerMapel,
            };
          });

        const mapelCohortAvgs = MAPEL_IJAZAH_SD.map((m) => {
          if (displayRows.length === 0) return 0;
          return (
            displayRows.reduce((acc, row) => acc + Number(row.activeMatrix[m] ?? row.rec.nilaiAkhir ?? 80), 0) /
            displayRows.length
          );
        });
        const overallAvg =
          displayRows.length > 0
            ? displayRows.reduce((acc, r) => acc + r.avgMapel, 0) / displayRows.length
            : 0;

        const handleExportRekapIjazahExcel = () => {
          const rowsExcel = displayRows.map((row, idx) => {
            const obj: Record<string, any> = {
              No: idx + 1,
              NISN: row.student.nisn || '-',
              'Nama Peserta Didik': row.student.nama,
              Kelas: row.student.kelas,
              'No. Seri Ijazah': row.rec.noIjazah || '-',
            };
            MAPEL_IJAZAH_SD.forEach((m) => {
              obj[`Ijazah - ${m}`] = Number(row.ms[m] ?? row.rec.nilaiAkhir ?? 80).toFixed(2);
              obj[`Rapor - ${m}`] = Number(row.raporMs[m] ?? row.rec.nilaiRapor ?? 80).toFixed(2);
            });
            obj['Rata-rata Rapor'] = row.avgRaporPerMapel.toFixed(2);
            obj['Nilai ASAJ'] = row.avgAsajPerMapel.toFixed(2);
            obj['Rata-rata Nilai Ijazah'] = (
              MAPEL_IJAZAH_SD.reduce((acc, m) => acc + Number(row.ms[m] ?? 80), 0) / MAPEL_IJAZAH_SD.length
            ).toFixed(2);
            obj['Status Kelulusan'] = row.rec.status;
            return obj;
          });
          const ws = XLSX.utils.json_to_sheet(rowsExcel);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Rekap Ijazah 10 Mapel');
          XLSX.writeFile(wb, `Rekap_Nilai_Ijazah_Semua_Mapel_${kosp.tahunPelajaran.replace('/', '-')}.xlsx`);
          showToast('Rekap Nilai Ijazah & Rata-rata Rapor Per Mapel berhasil diekspor ke Excel!', 'success');
        };

        return (
          <div className="no-print space-y-5">
            {/* Formula Pembobotan Rapor vs Nilai ASAJ (Dipindahkan ke Menu Rekap Nilai Ijazah) */}
            <div className="bg-white rounded-3xl p-5 shadow-md border border-rose-100 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase bg-rose-100 text-rose-700 px-2.5 py-1 rounded-full">
                  Formula Nilai Ijazah (Rata-rata Rapor Per Mapel vs Nilai ASAJ)
                </span>
                <h5 className="font-display font-black text-sm sm:text-base text-slate-800">
                  Pengaturan Bobot Pembentuk Nilai Ijazah Per Mata Pelajaran
                </h5>
                <p className="text-xs text-slate-500">
                  Nilai tiap mapel otomatis dihitung: <strong>({kosp.bobotRapor}% × Rata Rapor Mapel) + ({kosp.bobotAsaj}% × Nilai ASAJ Mapel)</strong>. Total bobot harus 100%.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Bobot Rapor (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={kosp.bobotRapor}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setKosp({ ...kosp, bobotRapor: val, bobotAsaj: 100 - val });
                    }}
                    className="w-24 px-3 py-2 rounded-xl border border-rose-300 bg-rose-50/40 font-mono font-bold text-sm text-center"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Bobot ASAJ (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={kosp.bobotAsaj}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setKosp({ ...kosp, bobotAsaj: val, bobotRapor: 100 - val });
                    }}
                    className="w-24 px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50/40 font-mono font-bold text-sm text-center"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveKosp}
                  disabled={isSavingKosp}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="w-4 h-4" /> {isSavingKosp ? 'Menyimpan...' : 'Simpan Formula Bobot'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
                    Matriks Rekapitulasi Lengkap ({MAPEL_IJAZAH_SD.length} Mata Pelajaran termasuk KKA)
                  </span>
                  <h4 className="font-display font-black text-lg text-slate-800 mt-1">
                    Rekap Nilai Ijazah Semua Mata Pelajaran Kelas 6
                  </h4>
                  <p className="text-xs text-slate-500">
                    Terkoneksi langsung dengan rata-rata nilai Rapor &amp; nilai ASAJ per mata pelajaran dari Menu 2 dan Menu 3.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* View Mode Toggle: Nilai Ijazah | Rata-rata Rapor Per Mapel | Nilai ASAJ Per Mapel */}
                  <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 gap-1">
                    <button
                      type="button"
                      onClick={() => setRekapIjazahViewMode('ijazah')}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-display font-extrabold cursor-pointer transition ${
                        rekapIjazahViewMode === 'ijazah'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Nilai Ijazah
                    </button>
                    <button
                      type="button"
                      onClick={() => setRekapIjazahViewMode('rapor')}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-display font-extrabold cursor-pointer transition ${
                        rekapIjazahViewMode === 'rapor'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Rata Rapor / Mapel
                    </button>
                    <button
                      type="button"
                      onClick={() => setRekapIjazahViewMode('asaj')}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-display font-extrabold cursor-pointer transition ${
                        rekapIjazahViewMode === 'asaj'
                          ? 'bg-sky-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Nilai ASAJ / Mapel
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={rekapSearch}
                      onChange={(e) => setRekapSearch(e.target.value)}
                      placeholder="Cari nama / NISN..."
                      className="pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold outline-none"
                    />
                  </div>
                  <select
                    value={rombelFilter}
                    onChange={(e) => setRombelFilter(e.target.value as any)}
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-extrabold text-slate-700"
                  >
                    <option value="ALL">Semua Kelas 6</option>
                    <option value="Kelas 6A">Kelas 6A</option>
                    <option value="Kelas 6B">Kelas 6B</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => syncPreviousSemestersFromStorage(false, true)}
                    className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Sinkron Rapor (6 Sem)
                  </button>
                  <button
                    type="button"
                    onClick={handleExportRekapIjazahExcel}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Export Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerPrintRekapIjazah(displayRows)}
                    className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Printer className="w-4 h-4" /> Cetak
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase border-b border-slate-200">
                      <th className="p-2.5 text-center w-9">No</th>
                      <th className="p-2.5 min-w-[165px] sticky left-0 bg-slate-100 z-10">Nama Siswa</th>
                      <th className="p-2.5 text-center">Kls</th>
                      {MAPEL_IJAZAH_SD.map((m) => (
                        <th key={m} className="p-2.5 text-center min-w-[64px]" title={m}>
                          {MAPEL_SHORT_LABELS[m] || m}
                        </th>
                      ))}
                      <th className="p-2.5 text-center bg-sky-50 text-sky-900">Rapor ({kosp.bobotRapor}%)</th>
                      <th className="p-2.5 text-center bg-indigo-50 text-indigo-900">ASAJ ({kosp.bobotAsaj}%)</th>
                      <th className="p-2.5 text-center bg-rose-50 text-rose-900">
                        {rekapIjazahViewMode === 'rapor'
                          ? 'Rata Rapor'
                          : rekapIjazahViewMode === 'asaj'
                          ? 'Rata ASAJ'
                          : 'Rata Ijazah'}
                      </th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={MAPEL_IJAZAH_SD.length + 7} className="p-8 text-center text-slate-400 font-bold">
                          Tidak ada data siswa yang cocok.
                        </td>
                      </tr>
                    ) : (
                      displayRows.map((row, idx) => (
                        <tr key={row.student.id} className="hover:bg-slate-50">
                          <td className="p-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                          <td className="p-2.5 sticky left-0 bg-white z-10 border-r border-slate-100">
                            <div className="font-bold text-slate-800 truncate max-w-[175px]">{row.student.nama}</div>
                            <div className="text-[9px] font-mono text-slate-500">NISN: {row.student.nisn || '-'}</div>
                          </td>
                          <td className="p-2.5 text-center font-bold text-slate-600">{row.student.kelas.replace('Kelas ', '')}</td>
                          {MAPEL_IJAZAH_SD.map((m) => (
                            <td
                              key={m}
                              className="p-2.5 text-center font-mono font-bold text-slate-700"
                              title={`Rapor: ${row.raporMs[m].toFixed(1)} | ASAJ: ${row.asajMs[m].toFixed(1)} | Ijazah: ${Number(row.ms[m] ?? 80).toFixed(1)}`}
                            >
                              <div>{Number(row.activeMatrix[m] ?? row.rec.nilaiAkhir ?? 80).toFixed(1)}</div>
                              {rekapIjazahViewMode === 'ijazah' && (
                                <div className="text-[8.5px] font-semibold text-indigo-600/80">
                                  R:{row.raporMs[m].toFixed(0)}
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="p-2.5 text-center font-mono font-bold bg-sky-50/50 text-sky-800">
                            {row.avgRaporPerMapel.toFixed(1)}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold bg-indigo-50/50 text-indigo-800">
                            {row.avgAsajPerMapel.toFixed(1)}
                          </td>
                          <td className="p-2.5 text-center font-mono font-black bg-rose-50/60 text-rose-700">
                            {row.avgMapel.toFixed(2)}
                          </td>
                          <td className="p-2.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${
                                row.rec.status === 'LULUS'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-rose-100 text-rose-800 border-rose-300'
                              }`}
                            >
                              {row.rec.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {displayRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-900 text-white font-bold">
                        <td colSpan={3} className="p-2.5 text-right uppercase text-[10px]">
                          Rata-rata Kelas / Angkatan:
                        </td>
                        {mapelCohortAvgs.map((avg, idx) => (
                          <td key={MAPEL_IJAZAH_SD[idx]} className="p-2.5 text-center font-mono text-amber-300">
                            {avg.toFixed(1)}
                          </td>
                        ))}
                        <td className="p-2.5 text-center font-mono text-sky-300">
                          {(displayRows.reduce((a, r) => a + r.avgRaporPerMapel, 0) / displayRows.length).toFixed(1)}
                        </td>
                        <td className="p-2.5 text-center font-mono text-indigo-300">
                          {(displayRows.reduce((a, r) => a + r.avgAsajPerMapel, 0) / displayRows.length).toFixed(1)}
                        </td>
                        <td className="p-2.5 text-center font-mono font-black text-emerald-300">
                          {overallAvg.toFixed(2)}
                        </td>
                        <td className="p-2.5 text-center text-[10px] text-emerald-300">
                          {displayRows.filter((r) => r.rec.status === 'LULUS').length}/{displayRows.length} Lulus
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TAB 5: CETAK SKL & DRAF IJAZAH (Format Penomoran SKL & Nomor Seri Ijazah dipindahkan ke sini) */}
      {subTab === 'cetak' && (
        <div className="no-print space-y-6">
          {/* Format Penomoran SKL & Nomor Seri Ijazah Kemendikdasmen */}
          <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
                  Pengaturan Format Nomor SKL &amp; Nomor Seri Ijazah
                </span>
                <h4 className="font-display font-black text-base text-slate-800 mt-1">
                  Penomoran Surat Keterangan Lulus (SKL) &amp; Blangko Ijazah Kemendikdasmen
                </h4>
              </div>
              <button
                type="button"
                onClick={handleSaveKosp}
                disabled={isSavingKosp}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4" /> {isSavingKosp ? 'Menyimpan...' : 'Simpan Format Nomor'}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Penomoran SKL */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black uppercase text-emerald-800">
                      Format Nomor Surat SKL (Dapat Disesuaikan)
                    </div>
                    <p className="text-[11px] text-emerald-700 font-semibold">
                      Pratinjau: <code className="bg-white px-2 py-0.5 rounded border border-emerald-200 font-mono text-emerald-900">{generateNoSkl(kosp, 0)}</code>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoGenerateSkl}
                    disabled={isSavingBatch}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-display font-extrabold text-[11px] flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Auto-Generate No. SKL
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Kode Awal Surat</label>
                    <input
                      type="text"
                      value={kosp.kodeAwalSkl ?? '421.2'}
                      onChange={(e) => setKosp({ ...kosp, kodeAwalSkl: e.target.value })}
                      placeholder="421.2"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-white font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">No. Urut Awal</label>
                    <input
                      type="number"
                      min={1}
                      value={kosp.nomorUrutAwalSkl ?? 1}
                      onChange={(e) => setKosp({ ...kosp, nomorUrutAwalSkl: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-white font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Kode Instansi/Unit</label>
                    <input
                      type="text"
                      value={kosp.kodeInstansiSkl ?? 'SKL-SDNRBU21'}
                      onChange={(e) => setKosp({ ...kosp, kodeInstansiSkl: e.target.value })}
                      placeholder="SKL-SDNRBU21"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-white font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Bulan / Tahun</label>
                    <input
                      type="text"
                      value={kosp.suffixTahunSkl ?? '2027'}
                      onChange={(e) => setKosp({ ...kosp, suffixTahunSkl: e.target.value })}
                      placeholder="VI/2027"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-white font-mono font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Penomoran Seri Ijazah */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black uppercase text-indigo-900">
                      NOMOR SERI IJAZAH (Format Kemendikdasmen)
                    </div>
                    <p className="text-[11px] text-indigo-700 font-semibold mt-0.5">
                      Pratinjau:{' '}
                      <code className="bg-white px-2.5 py-0.5 rounded-full border border-indigo-200 font-mono text-indigo-950 font-bold">
                        {generateNoIjazah(kosp, 0)}
                      </code>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={kosp.formatIjazah ?? 'seri'}
                      onChange={(e) => setKosp({ ...kosp, formatIjazah: e.target.value as 'seri' | 'nin' })}
                      className="px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-white font-bold text-[11px] text-indigo-900"
                    >
                      <option value="seri">Format Seri (DN-01/D-SD/26/0012301)</option>
                      <option value="nin">Format NIN 15-Digit (e-Ijazah)</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAutoGenerateIjazah}
                      disabled={isSavingBatch}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-display font-extrabold text-[11px] flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Auto-Generate No. Ijazah
                    </button>
                  </div>
                </div>

                {(kosp.formatIjazah ?? 'seri') === 'seri' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">Kode Wilayah</label>
                      <input
                        type="text"
                        value={kosp.kodeWilayahIjazah ?? 'DN-01'}
                        onChange={(e) => setKosp({ ...kosp, kodeWilayahIjazah: e.target.value })}
                        placeholder="DN-01"
                        className="w-full px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-white font-mono font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">Kode Jenjang</label>
                      <input
                        type="text"
                        value={kosp.kodeJenjangSeriIjazah ?? 'D-SD'}
                        onChange={(e) => setKosp({ ...kosp, kodeJenjangSeriIjazah: e.target.value })}
                        placeholder="D-SD"
                        className="w-full px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-white font-mono font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">Tahun (2 Digit)</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={kosp.tahunSeriIjazah ?? '26'}
                        onChange={(e) => setKosp({ ...kosp, tahunSeriIjazah: e.target.value })}
                        placeholder="26"
                        className="w-full px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-white font-mono font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">No. Seri Awal (7 Digit)</label>
                      <input
                        type="number"
                        min={1}
                        value={kosp.nomorSeriAwalIjazah ?? 12301}
                        onChange={(e) =>
                          setKosp({ ...kosp, nomorSeriAwalIjazah: Math.max(1, Number(e.target.value) || 1) })
                        }
                        className="w-full px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-white font-mono font-bold text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">Kode Negara</label>
                      <select
                        value={kosp.kodeNegaraIjazah ?? '1'}
                        onChange={(e) => setKosp({ ...kosp, kodeNegaraIjazah: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-xl border border-indigo-300 bg-white font-bold text-[11px]"
                      >
                        <option value="1">1 - Dalam Negeri</option>
                        <option value="2">2 - Luar Negeri</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">Kode Jenjang</label>
                      <select
                        value={kosp.kodeJenjangIjazah ?? '11'}
                        onChange={(e) => setKosp({ ...kosp, kodeJenjangIjazah: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-xl border border-indigo-300 bg-white font-bold text-[11px]"
                      >
                        <option value="11">11 - SD</option>
                        <option value="12">12 - SDLB</option>
                        <option value="13">13 - SD SPK</option>
                        <option value="14">14 - Paket A</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">Tahun Lulus</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={kosp.tahunLulusIjazah ?? '2027'}
                        onChange={(e) => setKosp({ ...kosp, tahunLulusIjazah: e.target.value.replace(/\D/g, '') })}
                        placeholder="2027"
                        className="w-full px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-white font-mono font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">No. Urut Awal (7 Digit)</label>
                      <input
                        type="number"
                        min={1}
                        value={kosp.nomorUrutAwalIjazah ?? 1}
                        onChange={(e) => setKosp({ ...kosp, nomorUrutAwalIjazah: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-white font-mono font-bold text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
                  Standar Kemendikdasmen Terbaru (Kertas A4)
                </span>
                <h4 className="font-display font-black text-lg text-slate-800 mt-1">
                  Cetak Surat Keterangan Lulus (SKL) &amp; Draf Ijazah SD
                </h4>
                <p className="text-xs text-slate-500">
                  Nomor Surat SKL &amp; Nomor Seri Ijazah di bawah ini terkoneksi langsung pada cetakan SKL dan Draf Ijazah.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={rombelFilter}
                  onChange={(e) => setRombelFilter(e.target.value as any)}
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-extrabold text-slate-700"
                >
                  <option value="ALL">Semua Kelas 6</option>
                  <option value="Kelas 6A">Kelas 6A</option>
                  <option value="Kelas 6B">Kelas 6B</option>
                </select>
                <button
                  type="button"
                  onClick={handleSaveBatch}
                  disabled={isSavingBatch}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" /> {isSavingBatch ? 'Menyimpan...' : 'Simpan Nomor'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[11px] border-b border-slate-200">
                    <th className="p-3 text-center w-10">No</th>
                    <th className="p-3 min-w-[160px]">Nama Peserta Didik</th>
                    <th className="p-3 text-center">Kelas</th>
                    <th className="p-3 min-w-[210px]">No. Surat SKL</th>
                    <th className="p-3 min-w-[210px]">Nomor Seri Ijazah</th>
                    <th className="p-3 text-center">Nilai &amp; Status</th>
                    <th className="p-3 text-center">Aksi Cetak (A4)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((s, idx) => {
                    const rec = getRowRecord(s);
                    const savedRec = nilaiMap[s.id];
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{s.nama}</div>
                          <div className="text-[10px] font-mono text-slate-500">NISN: {s.nisn || '-'}</div>
                        </td>
                        <td className="p-3 text-center font-bold">{s.kelas}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={rec.noSkl || ''}
                            placeholder={generateNoSkl(kosp, idx)}
                            onChange={(e) => updateRowField(s, 'noSkl', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-white font-mono text-[11px] font-bold text-slate-800"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            maxLength={32}
                            value={rec.noIjazah || ''}
                            placeholder={generateNoIjazah(kosp, idx)}
                            onChange={(e) => updateRowField(s, 'noIjazah', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-white font-mono text-[11px] font-bold text-slate-800"
                          />
                        </td>
                        <td className="p-3 text-center">
                          <div className="font-mono font-black text-rose-700 text-xs mb-1">
                            {savedRec ? savedRec.nilaiAkhir.toFixed(2) : rec.nilaiAkhir.toFixed(2)}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                              rec.status === 'LULUS'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => triggerPrint('skl', rec, s, idx)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" /> SKL
                            </button>
                            <button
                              type="button"
                              onClick={() => triggerPrint('ijazah', rec, s, idx)}
                              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <Award className="w-3.5 h-3.5" /> Ijazah
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Nilai Per Mapel */}
      {editingMapelStudentId && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border-2 border-rose-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-rose-600">
                  Rincian Nilai Mata Pelajaran Ijazah
                </span>
                <h3 className="font-display font-black text-base text-slate-800">
                  {students.find((s) => s.id === editingMapelStudentId)?.nama}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingMapelStudentId(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {MAPEL_IJAZAH_SD.map((m) => (
                <div key={m} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700 text-[11px]">{m}</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={mapelDraft[m] ?? 80}
                    onChange={(e) =>
                      setMapelDraft((prev) => ({ ...prev, [m]: Number(e.target.value) }))
                    }
                    className="w-20 px-2 py-1 rounded-lg border border-slate-300 text-center font-mono font-bold bg-white"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const s = students.find((st) => st.id === editingMapelStudentId);
                  if (s) {
                    setNilaiMap((prev) => ({
                      ...prev,
                      [s.id]: {
                        ...(prev[s.id] || getRowRecord(s)),
                        mapelScores: mapelDraft,
                      },
                    }));
                    showToast('Nilai per mapel diterapkan (klik Simpan Batch untuk permanen ke Firestore).', 'success');
                  }
                  setEditingMapelStudentId(null);
                }}
                className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs cursor-pointer"
              >
                Terapkan Nilai Mapel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable A4 Area (Hidden on screen, visible on print) */}
      {printPayload && <PrintASAJTemplate payload={printPayload} profile={profile} kosp={kosp} />}
    </section>
  );
};

const PrintASAJTemplate: React.FC<{
  payload:
    | { type: 'skl' | 'ijazah'; record: NilaiAsajRecord; student?: Student }
    | { type: 'rapor-sem'; semCfg: RaporSemesterConfig; rows: { student: Student; rec: NilaiAsajRecord }[] }
    | { type: 'rekap-ijazah'; rows: { student: Student; rec: NilaiAsajRecord; ms: Record<string, number>; avgMapel: number }[] };
  profile: SchoolProfile;
  kosp: KospSettingsAsaj;
}> = ({ payload, profile, kosp }) => {
  const todayIndo = formatTanggalIndo(new Date().toISOString().split('T')[0], false);

  if (payload.type === 'rapor-sem') {
    const { semCfg, rows } = payload;
    const activeSubjs = RAPOR_SUBJECTS.filter((m) => semCfg.grade >= m.minGrade);
    return (
      <div className="hidden print:block bg-white text-black p-4 font-sans">
        <div className="text-center border-b-2 border-black pb-2 mb-3">
          <div className="text-sm font-black uppercase">{profile.name}</div>
          <div className="text-xs font-bold uppercase">
            DAFTAR NILAI RAPOR — {semCfg.label}
          </div>
          <div className="text-[10px]">Tahun Pelajaran {kosp.tahunPelajaran} • NPSN: {profile.npsn}</div>
        </div>
        <table className="w-full border-collapse text-[9px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-700 p-1 text-center">No</th>
              <th className="border border-slate-700 p-1 text-left">Nama Peserta Didik</th>
              <th className="border border-slate-700 p-1 text-center">NISN</th>
              {activeSubjs.map((m) => (
                <th key={m.code} className="border border-slate-700 p-1 text-center">{m.code}</th>
              ))}
              <th className="border border-slate-700 p-1 text-center">Rata-rata</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, rec }, idx) => {
              const semScores = rec.raporSemesterMapel?.[semCfg.key] || {};
              const avg = computeSemesterAvgFromMapel(semScores, semCfg.grade) ?? rec[semCfg.fieldKey];
              return (
                <tr key={student.id}>
                  <td className="border border-slate-700 p-1 text-center">{idx + 1}</td>
                  <td className="border border-slate-700 p-1 font-semibold">{student.nama}</td>
                  <td className="border border-slate-700 p-1 text-center font-mono">{student.nisn || '-'}</td>
                  {activeSubjs.map((m) => (
                    <td key={m.code} className="border border-slate-700 p-1 text-center font-mono">
                      {semScores[m.name] && semScores[m.name] > 0 ? semScores[m.name] : '-'}
                    </td>
                  ))}
                  <td className="border border-slate-700 p-1 text-center font-bold font-mono">
                    {avg && avg > 0 ? Number(avg).toFixed(2) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex justify-end mt-6 text-[10px]">
          <div className="w-56">
            <div>{profile.kota}, {todayIndo}</div>
            <div>Kepala Sekolah,</div>
            <div className="h-12" />
            <div className="font-bold underline">{profile.kepalaSekolah.nama}</div>
            <div>NIP. {profile.kepalaSekolah.nip}</div>
          </div>
        </div>
      </div>
    );
  }

  if (payload.type === 'rekap-ijazah') {
    const { rows } = payload;
    return (
      <div className="hidden print:block bg-white text-black p-4 font-sans">
        <div className="text-center border-b-2 border-black pb-2 mb-3">
          <div className="text-sm font-black uppercase">{profile.name}</div>
          <div className="text-xs font-bold uppercase">
            REKAPITULASI NILAI IJAZAH SEMUA MATA PELAJARAN (10 MAPEL TERMASUK KKA)
          </div>
          <div className="text-[10px]">Tahun Pelajaran {kosp.tahunPelajaran} • NPSN: {profile.npsn}</div>
        </div>
        <table className="w-full border-collapse text-[8.5px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-700 p-1 text-center">No</th>
              <th className="border border-slate-700 p-1 text-left">Nama</th>
              <th className="border border-slate-700 p-1 text-center">Kls</th>
              {MAPEL_IJAZAH_SD.map((m) => (
                <th key={m} className="border border-slate-700 p-1 text-center">{MAPEL_SHORT_LABELS[m] || m}</th>
              ))}
              <th className="border border-slate-700 p-1 text-center">Rapor</th>
              <th className="border border-slate-700 p-1 text-center">ASAJ</th>
              <th className="border border-slate-700 p-1 text-center">Rata</th>
              <th className="border border-slate-700 p-1 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.student.id}>
                <td className="border border-slate-700 p-1 text-center">{idx + 1}</td>
                <td className="border border-slate-700 p-1 font-semibold">{r.student.nama}</td>
                <td className="border border-slate-700 p-1 text-center">{r.student.kelas.replace('Kelas ', '')}</td>
                {MAPEL_IJAZAH_SD.map((m) => (
                  <td key={m} className="border border-slate-700 p-1 text-center font-mono">
                    {Number(r.ms[m] ?? r.rec.nilaiAkhir ?? 80).toFixed(1)}
                  </td>
                ))}
                <td className="border border-slate-700 p-1 text-center font-mono">{r.rec.nilaiRapor.toFixed(1)}</td>
                <td className="border border-slate-700 p-1 text-center font-mono">{r.rec.nilaiAsaj.toFixed(1)}</td>
                <td className="border border-slate-700 p-1 text-center font-bold font-mono">{r.avgMapel.toFixed(2)}</td>
                <td className="border border-slate-700 p-1 text-center font-bold">{r.rec.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const { type, record, student } = payload;
  const ttl = `${student?.tempatLahir || 'Jakarta'}, ${formatTanggalIndo(student?.tanggalLahir || '2014-05-12', false)}`;
  const mapelScores = record.mapelScores || buildDefaultMapelScores(record.nilaiAkhir);
  const noSkl = record.noSkl || generateNoSkl(kosp, 0);
  const noIjazah = record.noIjazah || generateNoIjazah(kosp, 0);

  if (type === 'skl') {
    const isLulus = record.status === 'LULUS';
    return (
      <div className="hidden print:block bg-white text-black p-4 font-serif">
        <div className="flex items-center justify-between border-b-4 border-double border-black pb-3 mb-4">
          <img src={profile.logoKemendikbudUrl} alt="Kemendikbud" className="w-16 h-16 object-contain" />
          <div className="text-center flex-1 px-3">
            <div className="text-xs font-bold uppercase">Pemerintah Provinsi {profile.provinsi} • Dinas Pendidikan</div>
            <div className="text-lg font-black uppercase">{profile.name}</div>
            <div className="text-[11px]">NPSN: {profile.npsn} • {profile.alamat}</div>
          </div>
          <img src={profile.logoSekolahUrl} alt="Sekolah" className="w-16 h-16 object-contain" />
        </div>

        <div className="text-center mb-5">
          <div className="text-base font-bold underline uppercase">SURAT KETERANGAN LULUS (SKL)</div>
          <div className="text-xs font-semibold mt-0.5">Nomor: {noSkl}</div>
        </div>

        <p className="text-xs leading-relaxed text-justify mb-3">
          Kepala {profile.name} {profile.kecamatan}, {profile.kota}, menerangkan dengan sesungguhnya bahwa peserta didik di bawah ini:
        </p>

        <table className="w-full text-xs mb-4">
          <tbody>
            <tr><td className="w-48 py-1">Nama Peserta Didik</td><td className="w-4">:</td><td className="font-bold">{record.nama}</td></tr>
            <tr><td className="py-1">Tempat, Tanggal Lahir</td><td>:</td><td>{ttl}</td></tr>
            <tr><td className="py-1">NIS / NISN</td><td>:</td><td>{student?.barcodeId || '-'} / {record.nisn}</td></tr>
            <tr><td className="py-1">Kelas / Tahun Pelajaran</td><td>:</td><td>{record.kelas} / {kosp.tahunPelajaran}</td></tr>
          </tbody>
        </table>

        <table className="w-full border-collapse text-xs mb-5">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-black p-2 text-left">Komponen Penilaian Kelulusan</th>
              <th className="border border-black p-2 text-center w-28">Bobot KOSP</th>
              <th className="border border-black p-2 text-center w-24">Nilai</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-black p-2">Rata-rata Nilai Rapor</td>
              <td className="border border-black p-2 text-center">{kosp.bobotRapor}%</td>
              <td className="border border-black p-2 text-center font-bold">{record.nilaiRapor.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="border border-black p-2">Nilai ASAJ (Tertulis: {record.nilaiTertulis} | Praktik: {record.nilaiPraktik})</td>
              <td className="border border-black p-2 text-center">{kosp.bobotAsaj}%</td>
              <td className="border border-black p-2 text-center font-bold">{record.nilaiAsaj.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="border border-black p-2">Nilai Sikap &amp; Karakter (P5)</td>
              <td className="border border-black p-2 text-center">Minimal Baik</td>
              <td className="border border-black p-2 text-center font-bold">{record.sikapP5}</td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-black p-2 font-bold text-right">NILAI AKHIR IJAZAH</td>
              <td className="border border-black p-2 text-center font-black text-sm">{record.nilaiAkhir.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div className={`border-2 p-3 text-center mb-6 ${isLulus ? 'border-emerald-700' : 'border-rose-700'}`}>
          <div className="text-xs">Berdasarkan rapat dewan guru, peserta didik tersebut dinyatakan:</div>
          <div className={`text-xl font-black tracking-widest mt-1 ${isLulus ? 'text-emerald-700' : 'text-rose-700'}`}>
            {record.status}
          </div>
        </div>

        <div className="flex justify-end">
          <div className="w-64 text-xs">
            <div>Jakarta, {todayIndo}</div>
            <div>Kepala {profile.name},</div>
            <div className="h-16" />
            <div className="font-bold underline">{profile.kepalaSekolah.nama}</div>
            <div>NIP. {profile.kepalaSekolah.nip}</div>
          </div>
        </div>
      </div>
    );
  }

  const avgMapel = (
    MAPEL_IJAZAH_SD.reduce((acc, m) => acc + Number(mapelScores[m] ?? record.nilaiAkhir ?? 80), 0) /
    MAPEL_IJAZAH_SD.length
  ).toFixed(2);

  return (
    <div className="hidden print:block bg-white text-black font-serif">
      {/* Tampak Depan */}
      <div className="border-4 border-double border-black p-6 min-h-[250mm] flex flex-col justify-between" style={{ pageBreakAfter: 'always' }}>
        <div>
          <div className="text-center mb-5">
            <img src={profile.logoKemendikbudUrl} alt="Kemendikdasmen" className="w-16 h-16 mx-auto mb-2 object-contain" />
            <div className="text-xs font-bold uppercase">Kementerian Pendidikan Dasar dan Menengah</div>
            <div className="text-xs font-bold uppercase">Republik Indonesia</div>
            <div className="text-2xl font-black tracking-widest mt-2">IJAZAH</div>
            <div className="text-sm font-bold uppercase">Sekolah Dasar (SD)</div>
            <div className="text-xs">Tahun Pelajaran {kosp.tahunPelajaran}</div>
            <div className="text-xs font-mono font-bold mt-2 tracking-wider border border-black inline-block px-3 py-0.5">
              Nomor Seri Ijazah: {noIjazah}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-justify my-4">
            Yang bertanda tangan di bawah ini, Kepala <strong>{profile.name}</strong>, NPSN: <strong>{profile.npsn}</strong>, {profile.kota}, Provinsi {profile.provinsi} menerangkan bahwa:
          </p>

          <table className="w-full text-xs leading-loose my-4">
            <tbody>
              <tr><td className="w-52">nama</td><td className="w-4">:</td><td className="font-bold uppercase">{record.nama}</td></tr>
              <tr><td>tempat dan tanggal lahir</td><td>:</td><td>{ttl}</td></tr>
              <tr><td>nama orang tua / wali</td><td>:</td><td>{student?.namaAyah || student?.namaIbu || 'Orang Tua / Wali'}</td></tr>
              <tr><td>Nomor Induk Siswa (NIS)</td><td>:</td><td>{student?.barcodeId || '-'}</td></tr>
              <tr><td>Nomor Induk Siswa Nasional (NISN)</td><td>:</td><td>{record.nisn}</td></tr>
            </tbody>
          </table>

          <div className="text-center my-6">
            <div className="text-xl font-black tracking-widest border-y-2 border-black inline-block px-8 py-2">
              {record.status === 'LULUS' ? 'L U L U S' : 'TIDAK LULUS'}
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between mt-6">
          <div className="w-24 h-32 border border-black flex items-center justify-center text-[10px] text-center">
            Pas Foto<br />3 x 4 cm
          </div>
          <div className="w-64 text-xs">
            <div>{profile.kota}, {todayIndo}</div>
            <div>Kepala Sekolah,</div>
            <div className="h-16" />
            <div className="font-bold underline">{profile.kepalaSekolah.nama}</div>
            <div>NIP. {profile.kepalaSekolah.nip}</div>
          </div>
        </div>
      </div>

      {/* Tampak Belakang */}
      <div className="border-4 border-double border-black p-6 min-h-[250mm] flex flex-col justify-between">
        <div>
          <div className="text-center mb-4">
            <div className="text-base font-black uppercase">DAFTAR NILAI SEKOLAH DASAR</div>
            <div className="text-xs font-bold">Tahun Pelajaran {kosp.tahunPelajaran}</div>
          </div>

          <table className="w-full text-xs mb-4">
            <tbody>
              <tr><td className="w-44 py-0.5">Nama</td><td className="w-4">:</td><td className="font-bold">{record.nama}</td></tr>
              <tr><td className="py-0.5">Tempat dan Tanggal Lahir</td><td>:</td><td>{ttl}</td></tr>
              <tr><td className="py-0.5">NISN</td><td>:</td><td>{record.nisn}</td></tr>
              <tr><td className="py-0.5">Nomor Seri Ijazah</td><td>:</td><td className="font-mono font-bold">{noIjazah}</td></tr>
              <tr><td className="py-0.5">Sekolah</td><td>:</td><td>{profile.name} (NPSN: {profile.npsn})</td></tr>
            </tbody>
          </table>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-black p-2 w-10 text-center">No</th>
                <th className="border border-black p-2 text-left">Mata Pelajaran</th>
                <th className="border border-black p-2 w-28 text-center">Nilai Ijazah</th>
              </tr>
            </thead>
            <tbody>
              {MAPEL_IJAZAH_SD.map((m, i) => (
                <tr key={m}>
                  <td className="border border-black p-1.5 text-center">{i + 1}</td>
                  <td className="border border-black p-1.5">{m}</td>
                  <td className="border border-black p-1.5 text-center font-bold">
                    {Number(mapelScores[m] ?? record.nilaiAkhir ?? 80).toFixed(2)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50">
                <td colSpan={2} className="border border-black p-2 text-right font-bold">
                  Rata-rata Nilai Ijazah
                </td>
                <td className="border border-black p-2 text-center font-black">{avgMapel}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mt-6">
          <div className="w-64 text-xs">
            <div>{profile.kota}, {todayIndo}</div>
            <div>Kepala Sekolah,</div>
            <div className="h-16" />
            <div className="font-bold underline">{profile.kepalaSekolah.nama}</div>
            <div>NIP. {profile.kepalaSekolah.nip}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
