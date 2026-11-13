import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowRightLeft,
  Download,
  Edit3,
  Eye,
  GraduationCap,
  Link2,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Minus,
  Users,
  X,
  FolderCheck,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { ActiveUser, SchoolProfile, Student } from '../../types';
import { formatTanggalIndo } from '../../utils/dateUtils';

interface Props {
  activeUser: ActiveUser;
  profile: SchoolProfile;
  students: Student[];
  activeYear: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export interface AlumniBiodata {
  nama: string;
  nis: string;
  nisn: string;
  nik: string;
  jenisKelamin: 'L' | 'P';
  tempatLahir: string;
  tanggalLahir: string;
  agama: string;
  alamat: string;
  namaAyah: string;
  namaIbu: string;
  namaWali?: string;
  rombelAsal: string;
  fotoUrl?: string;
}

export interface AlumniKelulusan {
  tahunLulus: string;
  noIjazah: string;
  noSKL: string;
  tanggalLulus: string;
  smpTujuan: string;
  statusKelulusan: 'LULUS' | 'TIDAK LULUS';
  nilaiAsaj: number;
  nilaiAkhirIjazah: number;
}

export interface AlumniRiwayatNilai {
  sem1: Record<string, number>;
  sem2: Record<string, number>;
  sem3: Record<string, number>;
  sem4: Record<string, number>;
  sem5: Record<string, number>;
  sem6: Record<string, number>;
  sem7: Record<string, number>;
  sem8: Record<string, number>;
  sem9: Record<string, number>;
  sem10: Record<string, number>;
  sem11: Record<string, number>;
  sem12: Record<string, number>;
  asajPerMapel: Record<string, number>;
  nilaiIjazah: Record<string, number>;
  rataRataIjazah: number;
}

export type SemKey = keyof Pick<
  AlumniRiwayatNilai,
  'sem1' | 'sem2' | 'sem3' | 'sem4' | 'sem5' | 'sem6' | 'sem7' | 'sem8' | 'sem9' | 'sem10' | 'sem11' | 'sem12'
>;

export interface AlumniDokumen {
  raporSemester1: string;
  raporSemester2: string;
  raporSemester3: string;
  raporSemester4: string;
  raporSemester5: string;
  raporSemester6: string;
  raporSemester7: string;
  raporSemester8: string;
  raporSemester9: string;
  raporSemester10: string;
  raporSemester11: string;
  raporSemester12: string;
  ijazahDepan: string;
  ijazahBelakang: string;
  skl: string;
}

export interface AlumniRecord {
  id: string;
  biodata: AlumniBiodata;
  kelulusan: AlumniKelulusan;
  riwayatNilai: AlumniRiwayatNilai;
  dokumen: AlumniDokumen;
  sourceStudentId?: string;
  migratedAt?: string;
  updatedAt?: string;
}

const MAPEL_LIST = [
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

const SEMESTER_META: Array<{
  num: number;
  key: SemKey;
  docKey: keyof AlumniDokumen;
  shortLabel: string;
  fullLabel: string;
}> = Array.from({ length: 12 }, (_, idx) => {
  const num = idx + 1;
  const kelas = Math.ceil(num / 2);
  const smt = num % 2 === 1 ? 1 : 2;
  return {
    num,
    key: `sem${num}` as SemKey,
    docKey: `raporSemester${num}` as keyof AlumniDokumen,
    shortLabel: `K${kelas}S${smt}`,
    fullLabel: `Kelas ${kelas} Semester ${smt}`,
  };
});

const REQUIRED_DOC_KEYS: Array<keyof AlumniDokumen> = [
  ...SEMESTER_META.map((s) => s.docKey),
  'ijazahDepan',
  'ijazahBelakang',
  'skl',
];

const AVATAR_FALLBACK =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="%23ffe4e6"/><circle cx="50" cy="37" r="18" fill="%23e11d48"/><path d="M20 88 C20 65 80 65 80 88 Z" fill="%23fb7185"/></svg>';

function extractDriveFileId(url: string): string | null {
  const str = String(url || '').trim();
  if (!str) return null;
  const m1 = str.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = str.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  const m3 = str.match(/drive\.google\.com\/uc\?(?:export=[^&]+&)?id=([a-zA-Z0-9_-]+)/);
  if (m3) return m3[1];
  return null;
}

function toPreviewUrl(url: string): string {
  const clean = String(url || '').trim();
  if (!clean) return '';
  const driveId = extractDriveFileId(clean);
  return driveId ? `https://drive.google.com/file/d/${driveId}/preview` : clean;
}

function toDownloadUrl(url: string): string {
  const clean = String(url || '').trim();
  if (!clean) return '';
  const driveId = extractDriveFileId(clean);
  return driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : clean;
}

function isImageUrl(url: string): boolean {
  const lower = String(url || '').trim().toLowerCase();
  return lower.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/.test(lower);
}

function escHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getArchiveProgress(a: AlumniRecord) {
  let filled = 0;
  REQUIRED_DOC_KEYS.forEach((k) => {
    if (String(a.dokumen?.[k] || '').trim() !== '') filled += 1;
  });
  return {
    filled,
    total: REQUIRED_DOC_KEYS.length,
    isComplete: filled === REQUIRED_DOC_KEYS.length,
    pct: Math.round((filled / REQUIRED_DOC_KEYS.length) * 100),
  };
}

function getAvgIjazah(a: AlumniRecord): number {
  const perMapel = a.riwayatNilai?.nilaiIjazah || {};
  const vals = MAPEL_LIST.map((m) => Number(perMapel[m] || 0)).filter((v) => v > 0);
  if (vals.length > 0) {
    return Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100) / 100;
  }
  if (Number(a.riwayatNilai?.rataRataIjazah) > 0) return Number(a.riwayatNilai.rataRataIjazah);
  return Number(a.kelulusan?.nilaiAkhirIjazah || 0);
}

function getSemesterAvg(a: AlumniRecord, key: SemKey): number | null {
  const obj = a.riwayatNilai?.[key] || {};
  const vals = MAPEL_LIST.map((m) => Number(obj[m] || 0)).filter((v) => v > 0);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100) / 100;
}

function getGradeProgression(a: AlumniRecord) {
  const semAvgs = SEMESTER_META.map((s) => ({
    label: s.shortLabel,
    avg: getSemesterAvg(a, s.key),
  })).filter((item): item is { label: string; avg: number } => item.avg !== null);

  if (semAvgs.length === 0) {
    return {
      overallAvg: getAvgIjazah(a),
      trendType: 'neutral' as const,
      trendLabel: 'Belum Ada Riwayat Rapor',
      semAvgs: [],
    };
  }
  const overallAvg = Math.round((semAvgs.reduce((acc, x) => acc + x.avg, 0) / semAvgs.length) * 100) / 100;
  if (semAvgs.length < 2) {
    return {
      overallAvg,
      trendType: 'neutral' as const,
      trendLabel: 'Data Minimal (1 Sem)',
      semAvgs,
    };
  }
  const delta = Math.round((semAvgs[semAvgs.length - 1].avg - semAvgs[0].avg) * 100) / 100;
  if (delta >= 1) {
    return {
      overallAvg,
      trendType: 'up' as const,
      trendLabel: `Meningkat +${delta.toFixed(2)} poin (${semAvgs[0].label} → ${semAvgs[semAvgs.length - 1].label})`,
      semAvgs,
    };
  }
  if (delta <= -1) {
    return {
      overallAvg,
      trendType: 'down' as const,
      trendLabel: `Menurun ${delta.toFixed(2)} poin (${semAvgs[0].label} → ${semAvgs[semAvgs.length - 1].label})`,
      semAvgs,
    };
  }
  return {
    overallAvg,
    trendType: 'stable' as const,
    trendLabel: `Stabil (${semAvgs[0].label} → ${semAvgs[semAvgs.length - 1].label})`,
    semAvgs,
  };
}

function normalizeAlumni(id: string, data: any): AlumniRecord {
  const bio = data?.biodata || {};
  const kel = data?.kelulusan || {};
  const rn = data?.riwayatNilai || {};
  const dok = data?.dokumen || {};
  return {
    id,
    biodata: {
      nama: bio.nama || data?.nama || '-',
      nis: bio.nis || data?.nis || '',
      nisn: bio.nisn || data?.nisn || '',
      nik: bio.nik || '',
      jenisKelamin: bio.jenisKelamin === 'P' ? 'P' : 'L',
      tempatLahir: bio.tempatLahir || 'Jakarta',
      tanggalLahir: bio.tanggalLahir || '',
      agama: bio.agama || 'Islam',
      alamat: bio.alamat || '',
      namaAyah: bio.namaAyah || '',
      namaIbu: bio.namaIbu || '',
      namaWali: bio.namaWali || '',
      rombelAsal: bio.rombelAsal || 'Kelas 6A',
      fotoUrl: bio.fotoUrl || '',
    },
    kelulusan: {
      tahunLulus: kel.tahunLulus || '2026/2027',
      noIjazah: kel.noIjazah || '',
      noSKL: kel.noSKL || '',
      tanggalLulus: kel.tanggalLulus || '',
      smpTujuan: kel.smpTujuan || '',
      statusKelulusan: kel.statusKelulusan === 'TIDAK LULUS' ? 'TIDAK LULUS' : 'LULUS',
      nilaiAsaj: Number(kel.nilaiAsaj || 0),
      nilaiAkhirIjazah: Number(kel.nilaiAkhirIjazah || 0),
    },
    riwayatNilai: {
      sem1: rn.sem1 || {},
      sem2: rn.sem2 || {},
      sem3: rn.sem3 || {},
      sem4: rn.sem4 || {},
      sem5: rn.sem5 || {},
      sem6: rn.sem6 || {},
      sem7: rn.sem7 || {},
      sem8: rn.sem8 || {},
      sem9: rn.sem9 || {},
      sem10: rn.sem10 || {},
      sem11: rn.sem11 || {},
      sem12: rn.sem12 || {},
      asajPerMapel: rn.asajPerMapel || {},
      nilaiIjazah: rn.nilaiIjazah || {},
      rataRataIjazah: Number(rn.rataRataIjazah || kel.nilaiAkhirIjazah || 0),
    },
    dokumen: {
      raporSemester1: dok.raporSemester1 || '',
      raporSemester2: dok.raporSemester2 || '',
      raporSemester3: dok.raporSemester3 || '',
      raporSemester4: dok.raporSemester4 || '',
      raporSemester5: dok.raporSemester5 || '',
      raporSemester6: dok.raporSemester6 || '',
      raporSemester7: dok.raporSemester7 || '',
      raporSemester8: dok.raporSemester8 || '',
      raporSemester9: dok.raporSemester9 || '',
      raporSemester10: dok.raporSemester10 || '',
      raporSemester11: dok.raporSemester11 || '',
      raporSemester12: dok.raporSemester12 || '',
      ijazahDepan: dok.ijazahDepan || '',
      ijazahBelakang: dok.ijazahBelakang || '',
      skl: dok.skl || '',
    },
    sourceStudentId: data?.sourceStudentId || '',
    migratedAt: data?.migratedAt || '',
    updatedAt: data?.updatedAt || '',
  };
}

interface MigrationCandidate {
  student: Student;
  asaj: any;
  statusAsaj: 'LULUS' | 'TIDAK LULUS';
  alreadyMigrated: boolean;
}

export const PortalAlumniTab: React.FC<Props> = ({
  activeUser,
  profile,
  students,
  activeYear,
  showToast,
}) => {
  const isAdmin = activeUser.role === 'admin';

  const [alumniList, setAlumniList] = useState<AlumniRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal Detail Buku Induk (4 Tab)
  const [selectedAlumniId, setSelectedAlumniId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'biodata' | 'nilai' | 'rapor' | 'ijazah'>('biodata');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState<AlumniBiodata | null>(null);
  const [kelDraft, setKelDraft] = useState<AlumniKelulusan | null>(null);
  const [isEditingNilai, setIsEditingNilai] = useState(false);
  const [nilaiDraft, setNilaiDraft] = useState<AlumniRiwayatNilai | null>(null);

  // Modal Input/Edit URL Dokumen
  const [docEditTarget, setDocEditTarget] = useState<{
    alumniId: string;
    docKey: keyof AlumniDokumen;
    label: string;
    url: string;
  } | null>(null);

  // Modal Pratinjau Dokumen
  const [previewDoc, setPreviewDoc] = useState<{ url: string; title: string } | null>(null);

  // Modal Tambah Manual
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    nama: '',
    nis: '',
    nisn: '',
    nik: '',
    jenisKelamin: 'L' as 'L' | 'P',
    agama: 'Islam',
    tempatLahir: 'Jakarta',
    tanggalLahir: '2014-05-12',
    namaAyah: '',
    namaIbu: '',
    alamat: '',
    rombelAsal: 'Kelas 6A',
    tahunLulus: activeYear || '2025/2026',
    tanggalLulus: new Date().toISOString().split('T')[0],
    noSKL: '',
    noIjazah: '',
    smpTujuan: '',
    nilaiAsaj: 85,
    nilaiAkhirIjazah: 86,
    fotoUrl: '',
  });

  // Modal Migrasi Lulusan Kelas 6
  const [isMigModalOpen, setIsMigModalOpen] = useState(false);
  const [migLoading, setMigLoading] = useState(false);
  const [migCandidates, setMigCandidates] = useState<MigrationCandidate[]>([]);
  const [migSelectedIds, setMigSelectedIds] = useState<Set<string>>(new Set());
  const [migOnlyLulus, setMigOnlyLulus] = useState(true);
  const [migTahunLulus, setMigTahunLulus] = useState(activeYear || '2026/2027');
  const [migTanggalLulus, setMigTanggalLulus] = useState(new Date().toISOString().split('T')[0]);

  // Modal Konfirmasi Hapus
  const [deleteTarget, setDeleteTarget] = useState<AlumniRecord | null>(null);

  // Print Area HTML
  const [printHtml, setPrintHtml] = useState<string>('');

  // Realtime Firestore Listener on `alumni`
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'alumni'),
      (snap) => {
        const list: AlumniRecord[] = [];
        snap.forEach((d) => {
          list.push(normalizeAlumni(d.id, d.data()));
        });
        list.sort((a, b) => {
          const yrCmp = (b.kelulusan.tahunLulus || '').localeCompare(a.kelulusan.tahunLulus || '');
          if (yrCmp !== 0) return yrCmp;
          return (a.biodata.nama || '').localeCompare(b.biodata.nama || '', 'id', { sensitivity: 'base' });
        });
        setAlumniList(list);
        setLoading(false);
      },
      (err) => {
        console.error('Firestore alumni listener error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const uniqueYears = useMemo(() => {
    return Array.from(new Set(alumniList.map((a) => a.kelulusan.tahunLulus).filter(Boolean))).sort((a, b) =>
      b.localeCompare(a)
    );
  }, [alumniList]);

  const kpiStats = useMemo(() => {
    const total = alumniList.length;
    const latestYear = uniqueYears[0] || '-';
    const latestCount = latestYear !== '-' ? alumniList.filter((a) => a.kelulusan.tahunLulus === latestYear).length : 0;
    let sumFilled = 0;
    let completeCount = 0;
    alumniList.forEach((a) => {
      const prog = getArchiveProgress(a);
      sumFilled += prog.filled;
      if (prog.isComplete) completeCount += 1;
    });
    const totalSlots = total * REQUIRED_DOC_KEYS.length;
    const pctDocs = totalSlots > 0 ? Math.round((sumFilled / totalSlots) * 100) : 0;
    return { total, yearsCount: uniqueYears.length, latestYear, latestCount, completeCount, pctDocs };
  }, [alumniList, uniqueYears]);

  const filteredAlumni = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return alumniList.filter((a) => {
      if (filterYear !== 'ALL' && a.kelulusan.tahunLulus !== filterYear) return false;
      if (!q) return true;
      return (
        a.biodata.nama.toLowerCase().includes(q) ||
        a.biodata.nis.toLowerCase().includes(q) ||
        a.biodata.nisn.toLowerCase().includes(q)
      );
    });
  }, [alumniList, filterYear, searchQuery]);

  const selectedAlumni = useMemo(
    () => alumniList.find((a) => a.id === selectedAlumniId) || null,
    [alumniList, selectedAlumniId]
  );

  const openDetailModal = (a: AlumniRecord) => {
    setSelectedAlumniId(a.id);
    setDetailTab('biodata');
    setIsEditingBio(false);
    setIsEditingNilai(false);
  };

  // Load Candidates for Migration Modal
  const handleOpenMigrasi = async () => {
    if (!isAdmin) return;
    setIsMigModalOpen(true);
    setMigLoading(true);
    try {
      const sMap = new Map<string, Student>();
      students.forEach((s) => {
        if (String(s.kelas || '').includes('6')) sMap.set(s.id, s);
      });
      for (const colName of ['students', 'siswa']) {
        try {
          const snap = await getDocs(collection(db, colName));
          snap.forEach((d) => {
            const data = d.data() as Student;
            if (String(data.kelas || '').includes('6')) {
              sMap.set(d.id, { ...data, id: d.id });
            }
          });
        } catch {}
      }

      const asajMap = new Map<string, any>();
      try {
        const snapAsaj = await getDocs(collection(db, 'nilai_asaj'));
        snapAsaj.forEach((d) => asajMap.set(d.id, { ...d.data(), studentId: d.id }));
      } catch {}
      try {
        const localRaw = localStorage.getItem('sekolahku_asaj_nilai_v1');
        if (localRaw) {
          Object.values(JSON.parse(localRaw)).forEach((r: any) => {
            if (r?.studentId && !asajMap.has(r.studentId)) asajMap.set(r.studentId, r);
          });
        }
      } catch {}

      const existingNisns = new Set(alumniList.map((a) => a.biodata.nisn).filter(Boolean));
      const existingSources = new Set(alumniList.map((a) => a.sourceStudentId).filter(Boolean));

      const candidates: MigrationCandidate[] = Array.from(sMap.values())
        .map((s) => {
          const asaj =
            asajMap.get(s.id) ||
            Array.from(asajMap.values()).find((x) => s.nisn && x.nisn === s.nisn) ||
            null;
          const statusAsaj: 'LULUS' | 'TIDAK LULUS' = asaj?.status === 'TIDAK LULUS' ? 'TIDAK LULUS' : 'LULUS';
          const alreadyMigrated = existingSources.has(s.id) || (Boolean(s.nisn) && existingNisns.has(s.nisn));
          return { student: s, asaj, statusAsaj, alreadyMigrated };
        })
        .sort((a, b) => (a.student.nama || '').localeCompare(b.student.nama || '', 'id'));

      setMigCandidates(candidates);
      const initialSel = new Set<string>();
      candidates.forEach((c) => {
        if (!c.alreadyMigrated && c.statusAsaj === 'LULUS') {
          initialSel.add(c.student.id);
        }
      });
      setMigSelectedIds(initialSel);
    } finally {
      setMigLoading(false);
    }
  };

  const handleConfirmMigrasi = async () => {
    if (!isAdmin) return;
    if (migSelectedIds.size === 0) {
      showToast('Pilih minimal 1 siswa Kelas 6 untuk dimigrasi.', 'error');
      return;
    }

    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();

      migSelectedIds.forEach((sid) => {
        const cand = migCandidates.find((c) => c.student.id === sid);
        if (!cand) return;
        const s = cand.student;
        const a = cand.asaj || {};
        const docId = s.nisn
          ? `alu_${String(s.nisn).replace(/[^a-zA-Z0-9_-]/g, '')}`
          : `alu_${String(s.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const existing = alumniList.find((x) => x.id === docId);

        const semMap = a.raporSemesterMapel || {};
        const asajPerMapel: Record<string, number> = {};
        const nilaiIjazah: Record<string, number> = { ...(a.mapelScores || {}) };

        MAPEL_LIST.forEach((m) => {
          const tVal = Number(a.asajTertulisMapel?.[m] ?? a.nilaiTertulis ?? 0);
          const pVal = Number(a.asajPraktikMapel?.[m] ?? a.nilaiPraktik ?? 0);
          if (tVal > 0 || pVal > 0) {
            asajPerMapel[m] = Math.round(((tVal + pVal) / 2) * 100) / 100;
          } else if (Number(a.nilaiAsaj) > 0) {
            asajPerMapel[m] = Number(a.nilaiAsaj);
          }
        });

        const payload: AlumniRecord = {
          id: docId,
          biodata: {
            nama: s.nama || a.nama || '-',
            nis: s.barcodeId || '',
            nisn: s.nisn || a.nisn || '',
            nik: s.nik || '',
            jenisKelamin: s.jenisKelamin === 'P' ? 'P' : 'L',
            tempatLahir: s.tempatLahir || 'Jakarta',
            tanggalLahir: s.tanggalLahir || '',
            agama: s.agama || 'Islam',
            alamat: s.alamat || '',
            namaAyah: s.namaAyah || '',
            namaIbu: s.namaIbu || '',
            namaWali: existing?.biodata?.namaWali || '',
            rombelAsal: s.kelas || a.kelas || 'Kelas 6A',
            fotoUrl: s.fotoUrl || existing?.biodata?.fotoUrl || '',
          },
          kelulusan: {
            tahunLulus: migTahunLulus.trim() || '2026/2027',
            noIjazah: a.noIjazah || existing?.kelulusan?.noIjazah || '',
            noSKL: a.noSkl || existing?.kelulusan?.noSKL || '',
            tanggalLulus: migTanggalLulus,
            smpTujuan: existing?.kelulusan?.smpTujuan || '',
            statusKelulusan: cand.statusAsaj,
            nilaiAsaj: Number(a.nilaiAsaj || 0),
            nilaiAkhirIjazah: Number(a.nilaiAkhir || 0),
          },
          riwayatNilai: {
            sem1: existing?.riwayatNilai?.sem1 || {},
            sem2: existing?.riwayatNilai?.sem2 || {},
            sem3: existing?.riwayatNilai?.sem3 || {},
            sem4: existing?.riwayatNilai?.sem4 || {},
            sem5: existing?.riwayatNilai?.sem5 || {},
            sem6: existing?.riwayatNilai?.sem6 || {},
            sem7: semMap.k4s1 || existing?.riwayatNilai?.sem7 || {},
            sem8: semMap.k4s2 || existing?.riwayatNilai?.sem8 || {},
            sem9: semMap.k5s1 || existing?.riwayatNilai?.sem9 || {},
            sem10: semMap.k5s2 || existing?.riwayatNilai?.sem10 || {},
            sem11: semMap.k6s1 || existing?.riwayatNilai?.sem11 || {},
            sem12: semMap.k6s2 || existing?.riwayatNilai?.sem12 || {},
            asajPerMapel,
            nilaiIjazah,
            rataRataIjazah: Number(a.nilaiAkhir || 0),
          },
          dokumen: existing?.dokumen || {
            raporSemester1: '', raporSemester2: '', raporSemester3: '', raporSemester4: '',
            raporSemester5: '', raporSemester6: '', raporSemester7: '', raporSemester8: '',
            raporSemester9: '', raporSemester10: '', raporSemester11: '', raporSemester12: '',
            ijazahDepan: '', ijazahBelakang: '', skl: '',
          },
          sourceStudentId: s.id,
          migratedAt: nowIso,
          updatedAt: nowIso,
        };

        batch.set(doc(db, 'alumni', docId), payload, { merge: true });
      });

      await batch.commit();
      setIsMigModalOpen(false);
      showToast(`Berhasil memigrasikan ${migSelectedIds.size} lulusan Kelas 6 ke koleksi alumni!`, 'success');
    } catch (err) {
      console.error('Migration error:', err);
      showToast('Gagal memigrasikan data lulusan.', 'error');
    }
  };

  // Add Manual Alumni
  const handleAddManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const cleanNisn = manualForm.nisn.trim();
    const docId = `alu_${cleanNisn.replace(/[^a-zA-Z0-9_-]/g, '') || Date.now()}`;
    const ijMapel: Record<string, number> = {};
    if (manualForm.nilaiAkhirIjazah > 0) {
      MAPEL_LIST.forEach((m) => {
        ijMapel[m] = Number(manualForm.nilaiAkhirIjazah);
      });
    }

    const payload: AlumniRecord = {
      id: docId,
      biodata: {
        nama: manualForm.nama.trim(),
        nis: manualForm.nis.trim(),
        nisn: cleanNisn,
        nik: manualForm.nik.trim(),
        jenisKelamin: manualForm.jenisKelamin,
        tempatLahir: manualForm.tempatLahir.trim(),
        tanggalLahir: manualForm.tanggalLahir,
        agama: manualForm.agama,
        alamat: manualForm.alamat.trim(),
        namaAyah: manualForm.namaAyah.trim(),
        namaIbu: manualForm.namaIbu.trim(),
        namaWali: '',
        rombelAsal: manualForm.rombelAsal.trim(),
        fotoUrl: manualForm.fotoUrl.trim(),
      },
      kelulusan: {
        tahunLulus: manualForm.tahunLulus.trim(),
        noIjazah: manualForm.noIjazah.trim(),
        noSKL: manualForm.noSKL.trim(),
        tanggalLulus: manualForm.tanggalLulus,
        smpTujuan: manualForm.smpTujuan.trim(),
        statusKelulusan: 'LULUS',
        nilaiAsaj: Number(manualForm.nilaiAsaj || 0),
        nilaiAkhirIjazah: Number(manualForm.nilaiAkhirIjazah || 0),
      },
      riwayatNilai: {
        sem1: {}, sem2: {}, sem3: {}, sem4: {}, sem5: {}, sem6: {},
        sem7: {}, sem8: {}, sem9: {}, sem10: {}, sem11: {}, sem12: {},
        asajPerMapel: {},
        nilaiIjazah: ijMapel,
        rataRataIjazah: Number(manualForm.nilaiAkhirIjazah || 0),
      },
      dokumen: {
        raporSemester1: '', raporSemester2: '', raporSemester3: '', raporSemester4: '',
        raporSemester5: '', raporSemester6: '', raporSemester7: '', raporSemester8: '',
        raporSemester9: '', raporSemester10: '', raporSemester11: '', raporSemester12: '',
        ijazahDepan: '', ijazahBelakang: '', skl: '',
      },
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'alumni', docId), payload, { merge: true });
      setIsAddModalOpen(false);
      showToast(`Alumni ${payload.biodata.nama} berhasil ditambahkan ke arsip!`, 'success');
    } catch (err) {
      console.error('Add alumni error:', err);
      showToast('Gagal menyimpan alumni baru.', 'error');
    }
  };

  // Save Biodata Edit
  const handleSaveBiodataEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !selectedAlumni || !bioDraft || !kelDraft) return;
    try {
      await updateDoc(doc(db, 'alumni', selectedAlumni.id), {
        biodata: bioDraft,
        kelulusan: kelDraft,
        updatedAt: new Date().toISOString(),
      });
      setIsEditingBio(false);
      showToast('Biodata & data kelulusan alumni berhasil diperbarui!', 'success');
    } catch (err) {
      console.error('Update bio error:', err);
      showToast('Gagal memperbarui biodata alumni.', 'error');
    }
  };

  // Save Grade Matrix Edit
  const handleSaveNilaiEdit = async () => {
    if (!isAdmin || !selectedAlumni || !nilaiDraft) return;
    const ijVals = Object.values(nilaiDraft.nilaiIjazah || {}).filter((v) => Number(v) > 0);
    const asajVals = Object.values(nilaiDraft.asajPerMapel || {}).filter((v) => Number(v) > 0);
    const avgIj =
      ijVals.length > 0
        ? Math.round((ijVals.reduce((x, y) => x + y, 0) / ijVals.length) * 100) / 100
        : selectedAlumni.kelulusan.nilaiAkhirIjazah;
    const avgAsaj =
      asajVals.length > 0
        ? Math.round((asajVals.reduce((x, y) => x + y, 0) / asajVals.length) * 100) / 100
        : selectedAlumni.kelulusan.nilaiAsaj;

    try {
      await updateDoc(doc(db, 'alumni', selectedAlumni.id), {
        riwayatNilai: { ...nilaiDraft, rataRataIjazah: avgIj },
        kelulusan: { ...selectedAlumni.kelulusan, nilaiAsaj: avgAsaj, nilaiAkhirIjazah: avgIj },
        updatedAt: new Date().toISOString(),
      });
      setIsEditingNilai(false);
      showToast('Rekap nilai Kelas 1–6 & Nilai Ijazah tersimpan ke Firestore!', 'success');
    } catch (err) {
      console.error('Save nilai error:', err);
      showToast('Gagal menyimpan rekap nilai.', 'error');
    }
  };

  // Save Document URL
  const handleSaveDocUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !docEditTarget || !selectedAlumni) return;
    try {
      await updateDoc(doc(db, 'alumni', selectedAlumni.id), {
        dokumen: {
          ...selectedAlumni.dokumen,
          [docEditTarget.docKey]: docEditTarget.url.trim(),
        },
        updatedAt: new Date().toISOString(),
      });
      showToast(
        docEditTarget.url.trim()
          ? `Tautan ${docEditTarget.label} berhasil disimpan!`
          : `Tautan ${docEditTarget.label} dikosongkan.`,
        'success'
      );
      setDocEditTarget(null);
    } catch (err) {
      console.error('Save doc url error:', err);
      showToast('Gagal menyimpan tautan dokumen.', 'error');
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!isAdmin || !deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'alumni', deleteTarget.id));
      if (selectedAlumniId === deleteTarget.id) setSelectedAlumniId(null);
      setDeleteTarget(null);
      showToast('Data arsip alumni berhasil dihapus.', 'success');
    } catch (err) {
      console.error('Delete alumni error:', err);
      showToast('Gagal menghapus arsip alumni.', 'error');
    }
  };

  // Print Buku Induk Digital Alumni
  const handlePrintBukuInduk = (a: AlumniRecord) => {
    const b = a.biodata;
    const k = a.kelulusan;
    const rn = a.riwayatNilai;
    const prog = getArchiveProgress(a);
    const avgIj = getAvgIjazah(a);
    const todayFormatted = formatTanggalIndo(new Date().toISOString().split('T')[0]);

    const html = `
      <div style="padding: 10px 14px; color: #000; font-family: 'Times New Roman', Times, serif; font-size: 11px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 3px double #000; padding-bottom: 8px; margin-bottom: 12px;">
          <img src="${escHtml(profile.logoKemendikbudUrl)}" style="width: 56px; height: 56px; object-fit: contain;" />
          <div style="text-align: center; flex: 1; padding: 0 10px;">
            <div style="font-size: 10.5px; font-weight: bold; text-transform: uppercase;">Pemerintah Provinsi ${escHtml(profile.provinsi)} • Dinas Pendidikan</div>
            <div style="font-size: 16px; font-weight: 900; text-transform: uppercase;">${escHtml(profile.name)}</div>
            <div style="font-size: 10px;">NPSN: ${escHtml(profile.npsn)} • ${escHtml(profile.alamat)}</div>
          </div>
          <img src="${escHtml(profile.logoSekolahUrl)}" style="width: 56px; height: 56px; object-fit: contain;" />
        </div>

        <div style="text-align: center; margin-bottom: 12px;">
          <div style="font-size: 14px; font-weight: bold; text-decoration: underline; text-transform: uppercase;">RINGKASAN BUKU INDUK DIGITAL ALUMNI</div>
          <div style="font-size: 10.5px; margin-top: 2px;">Tahun Pelajaran Lulus: <strong>${escHtml(k.tahunLulus || '-')}</strong> • Status Arsip: <strong>${prog.filled}/${prog.total} Dokumen</strong></div>
        </div>

        <div style="display: flex; gap: 14px; margin-bottom: 12px; align-items: flex-start;">
          <div style="width: 84px; height: 108px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
            ${b.fotoUrl ? `<img src="${escHtml(b.fotoUrl)}" style="width: 100%; height: 100%; object-fit: cover;" />` : '<span style="font-size: 9px; text-align: center;">Foto<br/>3x4</span>'}
          </div>
          <table style="flex: 1; border-collapse: collapse; font-size: 11px;">
            <tr><td style="width: 145px; padding: 2px 0;">Nama Lengkap</td><td style="width: 12px;">:</td><td><strong>${escHtml(b.nama)}</strong></td></tr>
            <tr><td style="padding: 2px 0;">NIS / NISN</td><td>:</td><td>${escHtml(b.nis || '-')} / <strong>${escHtml(b.nisn || '-')}</strong></td></tr>
            <tr><td style="padding: 2px 0;">NIK</td><td>:</td><td>${escHtml(b.nik || '-')}</td></tr>
            <tr><td style="padding: 2px 0;">Tempat, Tgl Lahir</td><td>:</td><td>${escHtml(b.tempatLahir || '-')}, ${escHtml(b.tanggalLahir ? formatTanggalIndo(b.tanggalLahir) : '-')}</td></tr>
            <tr><td style="padding: 2px 0;">Jenis Kelamin / Agama</td><td>:</td><td>${b.jenisKelamin === 'P' ? 'Perempuan' : 'Laki-laki'} / ${escHtml(b.agama || '-')}</td></tr>
            <tr><td style="padding: 2px 0;">Orang Tua (Ayah / Ibu)</td><td>:</td><td>${escHtml(b.namaAyah || '-')} / ${escHtml(b.namaIbu || '-')}</td></tr>
            <tr><td style="padding: 2px 0;">Alamat</td><td>:</td><td>${escHtml(b.alamat || '-')}</td></tr>
          </table>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10.5px;">
          <tr style="background: #f1f5f9;">
            <th style="border: 1px solid #000; padding: 5px; text-align: left;">Rombel Asal</th>
            <th style="border: 1px solid #000; padding: 5px; text-align: left;">No. Surat SKL</th>
            <th style="border: 1px solid #000; padding: 5px; text-align: left;">Nomor Seri Ijazah</th>
            <th style="border: 1px solid #000; padding: 5px; text-align: left;">SMP Tujuan</th>
            <th style="border: 1px solid #000; padding: 5px; text-align: center;">Rata-rata Ijazah</th>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 5px;">${escHtml(b.rombelAsal || '-')}</td>
            <td style="border: 1px solid #000; padding: 5px; font-family: monospace;">${escHtml(k.noSKL || '-')}</td>
            <td style="border: 1px solid #000; padding: 5px; font-family: monospace; font-weight: bold;">${escHtml(k.noIjazah || '-')}</td>
            <td style="border: 1px solid #000; padding: 5px;">${escHtml(k.smpTujuan || '-')}</td>
            <td style="border: 1px solid #000; padding: 5px; text-align: center; font-weight: bold;">${avgIj > 0 ? avgIj.toFixed(2) : '-'}</td>
          </tr>
        </table>

        <div style="font-weight: bold; margin-bottom: 4px; font-size: 11px;">REKAP NILAI AKADEMIK KELAS 1 – KELAS 6, ASAJ, DAN NILAI AKHIR IJAZAH</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 14px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="border: 1px solid #000; padding: 4px; text-align: left;">Mata Pelajaran</th>
              ${SEMESTER_META.map((s) => `<th style="border: 1px solid #000; padding: 3px; text-align: center;">${s.shortLabel}</th>`).join('')}
              <th style="border: 1px solid #000; padding: 3px; text-align: center;">ASAJ</th>
              <th style="border: 1px solid #000; padding: 3px; text-align: center;">Ijazah</th>
            </tr>
          </thead>
          <tbody>
            ${MAPEL_LIST.map(
              (m) => `
              <tr>
                <td style="border: 1px solid #000; padding: 3px 4px;">${escHtml(m)}</td>
                ${SEMESTER_META.map((s) => {
                  const v = rn[s.key]?.[m];
                  return `<td style="border: 1px solid #000; padding: 3px; text-align: center;">${Number(v) > 0 ? Number(v).toFixed(0) : '-'}</td>`;
                }).join('')}
                <td style="border: 1px solid #000; padding: 3px; text-align: center;">${Number(rn.asajPerMapel?.[m]) > 0 ? Number(rn.asajPerMapel[m]).toFixed(1) : '-'}</td>
                <td style="border: 1px solid #000; padding: 3px; text-align: center; font-weight: bold;">${Number(rn.nilaiIjazah?.[m]) > 0 ? Number(rn.nilaiIjazah[m]).toFixed(2) : '-'}</td>
              </tr>`
            ).join('')}
          </tbody>
        </table>

        <div style="display: flex; justify-content: flex-end; margin-top: 18px;">
          <div style="width: 240px; font-size: 11px;">
            <div>${escHtml(profile.kota)}, ${escHtml(todayFormatted)}</div>
            <div>Kepala ${escHtml(profile.name)},</div>
            <div style="height: 58px;"></div>
            <div style="font-weight: bold; text-decoration: underline;">${escHtml(profile.kepalaSekolah?.nama || '-')}</div>
            <div>NIP. ${escHtml(profile.kepalaSekolah?.nip || '-')}</div>
          </div>
        </div>
      </div>
    `;
    setPrintHtml(html);
    setTimeout(() => {
      window.print();
    }, 120);
  };

  return (
    <div className="space-y-6">
      {/* Screen Workspace (hidden during print) */}
      <div className="no-print space-y-6">
        {/* Header Banner */}
        <div className="bg-white rounded-[2rem] p-5 sm:p-6 shadow-md border-2 border-rose-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-700 border border-rose-200">
                JANGKAR 21 • Buku Induk Digital
              </span>
              {!isAdmin && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-100 text-sky-800 border border-sky-200">
                  Mode Read-Only (Lihat &amp; Cetak)
                </span>
              )}
            </div>
            <h2 className="font-display font-black text-2xl sm:text-3xl text-slate-800 tracking-tight">
              Portal Alumni &amp; Arsip Lulusan
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Arsip permanen Buku Induk Siswa, rekap nilai Kelas 1–6, serta pindaian Rapor, Ijazah, dan SKL {profile.name}.
            </p>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleOpenMigrasi}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-display font-extrabold text-xs sm:text-sm shadow-md flex items-center gap-2 cursor-pointer transition"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Migrasi Lulusan Kelas 6</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white font-display font-extrabold text-xs sm:text-sm shadow-md flex items-center gap-2 cursor-pointer transition"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Alumni Manual</span>
              </button>
            </div>
          )}
        </div>

        {/* 3 KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl p-5 shadow-sm border-2 border-rose-100 flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total Alumni Terdata</div>
              <div className="font-display font-black text-3xl text-slate-800 mt-1">{kpiStats.total}</div>
              <div className="text-xs font-semibold text-slate-500 mt-0.5">
                {kpiStats.yearsCount > 0 ? `Tersebar di ${kpiStats.yearsCount} angkatan` : 'Belum ada alumni tersimpan'}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 shadow-sm border-2 border-amber-100 flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Angkatan Terbaru</div>
              <div className="font-display font-black text-2xl sm:text-3xl text-amber-700 mt-1">{kpiStats.latestYear}</div>
              <div className="text-xs font-semibold text-slate-500 mt-0.5">
                {kpiStats.latestYear !== '-' ? `${kpiStats.latestCount} lulusan terarsip` : 'Jalankan migrasi Kelas 6'}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 shadow-sm border-2 border-emerald-100 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Kelengkapan Dokumen</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display font-black text-3xl text-emerald-700">{kpiStats.pctDocs}%</span>
                <span className="text-xs font-bold text-slate-500">({kpiStats.completeCount} lengkap)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                  style={{ width: `${kpiStats.pctDocs}%` }}
                />
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <FolderCheck className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filter & Responsive Table */}
        <div className="bg-white rounded-[2rem] p-5 sm:p-6 shadow-md border-2 border-rose-100 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-extrabold text-slate-600">Tahun Pelajaran Lulus:</span>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="px-3.5 py-2 rounded-2xl border-2 border-rose-100 bg-rose-50/40 focus:bg-white focus:border-rose-500 outline-none text-xs font-extrabold text-slate-700 cursor-pointer"
              >
                <option value="ALL">Semua Tahun Lulus</option>
                {uniqueYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span className="text-xs font-bold text-slate-400 px-2">{filteredAlumni.length} alumni ditampilkan</span>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Nama, NIS, atau NISN..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-slate-200 focus:border-rose-500 outline-none text-xs font-bold text-slate-700 bg-slate-50/60 focus:bg-white transition"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[11px] border-b border-slate-200">
                  <th className="p-3.5 text-center w-12">No</th>
                  <th className="p-3.5 min-w-[210px]">Nama Siswa</th>
                  <th className="p-3.5 min-w-[145px]">NIS / NISN</th>
                  <th className="p-3.5 text-center">Rombel Asal</th>
                  <th className="p-3.5 text-center">Tahun Lulus</th>
                  <th className="p-3.5 text-center">Rata-rata Ijazah</th>
                  <th className="p-3.5 text-center">Status Arsip</th>
                  <th className="p-3.5 text-center min-w-[140px]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-400 font-bold">
                      Memuat data alumni dari Firestore...
                    </td>
                  </tr>
                ) : filteredAlumni.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-400 font-bold">
                      {alumniList.length === 0
                        ? 'Belum ada data di koleksi alumni. Admin dapat klik "Migrasi Lulusan Kelas 6" atau "Tambah Alumni Manual".'
                        : 'Tidak ada alumni yang cocok dengan filter atau pencarian.'}
                    </td>
                  </tr>
                ) : (
                  filteredAlumni.map((a, idx) => {
                    const avgIj = getAvgIjazah(a);
                    const prog = getArchiveProgress(a);
                    return (
                      <tr key={a.id} className="hover:bg-rose-50/40 transition">
                        <td className="p-3.5 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <img
                              src={a.biodata.fotoUrl || AVATAR_FALLBACK}
                              alt=""
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = AVATAR_FALLBACK;
                              }}
                              className="w-9 h-9 rounded-xl object-cover border border-rose-200 bg-rose-50 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-display font-extrabold text-slate-800 truncate">{a.biodata.nama}</div>
                              <div className="text-[11px] text-slate-400 font-semibold truncate">
                                No. Ijazah: {a.kelulusan.noIjazah || '-'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-xs text-slate-700">
                          <div>
                            NIS: <strong>{a.biodata.nis || '-'}</strong>
                          </div>
                          <div className="text-slate-500">NISN: {a.biodata.nisn || '-'}</div>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                            {a.biodata.rombelAsal || '-'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-700">{a.kelulusan.tahunLulus || '-'}</td>
                        <td className="p-3.5 text-center font-mono font-black text-indigo-700">
                          {avgIj > 0 ? avgIj.toFixed(2) : '-'}
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black border ${
                              prog.isComplete
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}
                          >
                            {prog.isComplete ? 'Lengkap' : `Belum Lengkap (${prog.filled}/${prog.total})`}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openDetailModal(a)}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-[11px] shadow-xs cursor-pointer transition"
                            >
                              Detail Arsip
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(a)}
                                title="Hapus Data Alumni"
                                className="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 cursor-pointer transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
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

      {/* MODAL: MIGRASI LULUSAN KELAS 6 */}
      {isMigModalOpen && isAdmin && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-4xl w-full p-6 shadow-2xl border-2 border-emerald-200 flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                  Sinkronisasi Otomatis Koleksi ASAJ &amp; Siswa
                </span>
                <h3 className="font-display font-black text-xl text-slate-800 mt-1">
                  Migrasi Lulusan Kelas 6 ke Arsip Alumni
                </h3>
                <p className="text-xs text-slate-500">
                  Memindahkan biodata, nilai ASAJ, rata-rata rapor semester, Nomor SKL, dan Nomor Seri Ijazah ke koleksi{' '}
                  <code className="font-mono font-bold">alumni</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMigModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-extrabold text-slate-700">Tahun Lulus:</span>
                <input
                  type="text"
                  value={migTahunLulus}
                  onChange={(e) => setMigTahunLulus(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 font-bold w-32"
                />
                <span className="font-extrabold text-slate-700 ml-2">Tanggal Lulus:</span>
                <input
                  type="date"
                  value={migTanggalLulus}
                  onChange={(e) => setMigTanggalLulus(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 font-bold"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={migOnlyLulus}
                  onChange={(e) => setMigOnlyLulus(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span>Hanya siswa berstatus LULUS</span>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto my-3 border border-slate-200 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                  <tr className="text-slate-600 font-extrabold uppercase text-[10px]">
                    <th className="p-3 text-center w-10">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            const next = new Set<string>();
                            migCandidates
                              .filter((c) => !migOnlyLulus || c.statusAsaj === 'LULUS')
                              .forEach((c) => next.add(c.student.id));
                            setMigSelectedIds(next);
                          } else {
                            setMigSelectedIds(new Set());
                          }
                        }}
                        className="rounded text-emerald-600"
                      />
                    </th>
                    <th className="p-3">Nama &amp; NISN</th>
                    <th className="p-3 text-center">Rombel</th>
                    <th className="p-3 text-center">Nilai Ijazah</th>
                    <th className="p-3 text-center">Status ASAJ</th>
                    <th className="p-3">No. Seri Ijazah / SKL</th>
                    <th className="p-3 text-center">Status Arsip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {migLoading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                        Mengambil data siswa Kelas 6 &amp; nilai ASAJ...
                      </td>
                    </tr>
                  ) : (
                    migCandidates
                      .filter((c) => !migOnlyLulus || c.statusAsaj === 'LULUS')
                      .map((c) => {
                        const s = c.student;
                        const avgIj = Number(c.asaj?.nilaiAkhir || 0);
                        return (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="p-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={migSelectedIds.has(s.id)}
                                onChange={(e) => {
                                  const next = new Set(migSelectedIds);
                                  if (e.target.checked) next.add(s.id);
                                  else next.delete(s.id);
                                  setMigSelectedIds(next);
                                }}
                                className="rounded text-emerald-600"
                              />
                            </td>
                            <td className="p-2.5">
                              <div className="font-bold text-slate-800">{s.nama}</div>
                              <div className="text-[10px] font-mono text-slate-500">
                                NIS: {s.barcodeId || '-'} • NISN: {s.nisn || '-'}
                              </div>
                            </td>
                            <td className="p-2.5 text-center font-bold">{s.kelas}</td>
                            <td className="p-2.5 text-center font-mono font-black text-indigo-700">
                              {avgIj > 0 ? avgIj.toFixed(2) : '-'}
                            </td>
                            <td className="p-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  c.statusAsaj === 'LULUS'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {c.statusAsaj}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-[10px] text-slate-600">
                              <div>Ijazah: {c.asaj?.noIjazah || '-'}</div>
                              <div>SKL: {c.asaj?.noSkl || '-'}</div>
                            </td>
                            <td className="p-2.5 text-center">
                              {c.alreadyMigrated ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                  Sudah Terdata
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                                  Siap Migrasi
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-600">
                {migSelectedIds.size} lulusan dipilih untuk dimigrasi
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMigModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMigrasi}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold text-xs shadow-sm cursor-pointer"
                >
                  Jalankan Migrasi ke Firestore
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH ALUMNI MANUAL */}
      {isAddModalOpen && isAdmin && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAddManualSubmit}
            className="bg-white rounded-[2rem] max-w-3xl w-full p-6 shadow-2xl border-2 border-rose-200 flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-700">
                  Input Manual Admin
                </span>
                <h3 className="font-display font-black text-xl text-slate-800 mt-1">Tambah Data Alumni Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Nama Lengkap *</label>
                  <input
                    required
                    value={manualForm.nama}
                    onChange={(e) => setManualForm({ ...manualForm, nama: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">NISN *</label>
                  <input
                    required
                    value={manualForm.nisn}
                    onChange={(e) => setManualForm({ ...manualForm, nisn: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">NIS</label>
                  <input
                    value={manualForm.nis}
                    onChange={(e) => setManualForm({ ...manualForm, nis: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">NIK</label>
                  <input
                    value={manualForm.nik}
                    onChange={(e) => setManualForm({ ...manualForm, nik: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Jenis Kelamin</label>
                  <select
                    value={manualForm.jenisKelamin}
                    onChange={(e) => setManualForm({ ...manualForm, jenisKelamin: e.target.value as 'L' | 'P' })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Agama</label>
                  <input
                    value={manualForm.agama}
                    onChange={(e) => setManualForm({ ...manualForm, agama: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Tempat Lahir</label>
                  <input
                    value={manualForm.tempatLahir}
                    onChange={(e) => setManualForm({ ...manualForm, tempatLahir: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={manualForm.tanggalLahir}
                    onChange={(e) => setManualForm({ ...manualForm, tanggalLahir: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Nama Ayah</label>
                  <input
                    value={manualForm.namaAyah}
                    onChange={(e) => setManualForm({ ...manualForm, namaAyah: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Nama Ibu</label>
                  <input
                    value={manualForm.namaIbu}
                    onChange={(e) => setManualForm({ ...manualForm, namaIbu: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-extrabold text-slate-700 mb-1">Alamat Lengkap</label>
                  <input
                    value={manualForm.alamat}
                    onChange={(e) => setManualForm({ ...manualForm, alamat: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Rombel Asal</label>
                  <input
                    value={manualForm.rombelAsal}
                    onChange={(e) => setManualForm({ ...manualForm, rombelAsal: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Tahun Pelajaran Lulus *</label>
                  <input
                    required
                    value={manualForm.tahunLulus}
                    onChange={(e) => setManualForm({ ...manualForm, tahunLulus: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Tanggal Lulus</label>
                  <input
                    type="date"
                    value={manualForm.tanggalLulus}
                    onChange={(e) => setManualForm({ ...manualForm, tanggalLulus: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Nomor SKL</label>
                  <input
                    value={manualForm.noSKL}
                    onChange={(e) => setManualForm({ ...manualForm, noSKL: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Nomor Seri Ijazah</label>
                  <input
                    value={manualForm.noIjazah}
                    onChange={(e) => setManualForm({ ...manualForm, noIjazah: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">SMP Tujuan</label>
                  <input
                    value={manualForm.smpTujuan}
                    onChange={(e) => setManualForm({ ...manualForm, smpTujuan: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Rata-rata Nilai ASAJ</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={manualForm.nilaiAsaj}
                    onChange={(e) => setManualForm({ ...manualForm, nilaiAsaj: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">Rata-rata Nilai Ijazah</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={manualForm.nilaiAkhirIjazah}
                    onChange={(e) => setManualForm({ ...manualForm, nilaiAkhirIjazah: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">URL Foto Siswa</label>
                  <input
                    type="url"
                    value={manualForm.fotoUrl}
                    onChange={(e) => setManualForm({ ...manualForm, fotoUrl: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs shadow-sm cursor-pointer"
              >
                Simpan Alumni ke Firestore
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: KONFIRMASI HAPUS */}
      {deleteTarget && isAdmin && (
        <div className="no-print fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-display font-black text-base text-slate-800">Hapus Arsip Alumni?</h4>
                <p className="text-xs text-slate-500">Tindakan ini permanen di Firestore.</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Anda akan menghapus arsip buku induk alumni <strong className="text-rose-700">{deleteTarget.biodata.nama}</strong>. Data yang dihapus tidak dapat dikembalikan.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs cursor-pointer"
              >
                Ya, Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BUKU INDUK DIGITAL ALUMNI (4 TAB) */}
      {selectedAlumni && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-[2rem] max-w-6xl w-full shadow-2xl border-2 border-rose-200 flex flex-col max-h-[94vh] overflow-hidden">
            {/* Profile Header */}
            <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-red-600 text-white p-5 sm:p-6 shrink-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <img
                    src={selectedAlumni.biodata.fotoUrl || AVATAR_FALLBACK}
                    alt={selectedAlumni.biodata.nama}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = AVATAR_FALLBACK;
                    }}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-yellow-300 bg-white shrink-0 shadow-md"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-yellow-300 text-slate-900">
                        Buku Induk Digital Alumni
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-white/20 text-white">
                        {(() => {
                          const p = getArchiveProgress(selectedAlumni);
                          return p.isComplete ? `Arsip Lengkap (${p.filled}/${p.total})` : `Arsip ${p.filled}/${p.total}`;
                        })()}
                      </span>
                    </div>
                    <h2 className="font-display font-black text-xl sm:text-2xl truncate mt-1">
                      {selectedAlumni.biodata.nama}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-rose-100 font-semibold mt-1">
                      <span>
                        NISN: <strong className="font-mono text-white">{selectedAlumni.biodata.nisn || '-'}</strong>
                      </span>
                      <span>
                        Lulus: <strong className="text-white">{selectedAlumni.kelulusan.tahunLulus || '-'}</strong>
                      </span>
                      <span>
                        No. Seri Ijazah:{' '}
                        <strong className="font-mono text-yellow-200">{selectedAlumni.kelulusan.noIjazah || 'Belum Diinput'}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handlePrintBukuInduk(selectedAlumni)}
                    className="px-4 py-2.5 rounded-2xl bg-white hover:bg-rose-50 text-rose-700 font-display font-extrabold text-xs shadow-sm flex items-center gap-2 cursor-pointer transition"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Cetak Ringkasan Buku Induk</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAlumniId(null)}
                    className="w-10 h-10 rounded-2xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 4 Tab Navigation */}
              <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-white/20">
                {[
                  { id: 'biodata' as const, label: '1. Data Siswa' },
                  { id: 'nilai' as const, label: '2. Rekap Nilai Kelas 1–6' },
                  { id: 'rapor' as const, label: '3. Arsip Rapor (12 Sem)' },
                  { id: 'ijazah' as const, label: '4. Arsip Ijazah & SKL' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setDetailTab(t.id);
                      setIsEditingBio(false);
                      setIsEditingNilai(false);
                    }}
                    className={`px-4 py-2 rounded-xl font-display font-extrabold text-xs cursor-pointer transition ${
                      detailTab === t.id
                        ? 'bg-white text-rose-700 shadow-sm'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Panels */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-slate-50/50 space-y-5">
              {/* TAB 1: DATA SISWA */}
              {detailTab === 'biodata' && (
                !isEditingBio ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display font-black text-base text-slate-800">
                          Biodata Siswa, Orang Tua &amp; Data Kelulusan
                        </h3>
                        <p className="text-xs text-slate-500">
                          Informasi identitas permanen peserta didik alumni {profile.name}.
                        </p>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setBioDraft({ ...selectedAlumni.biodata });
                            setKelDraft({ ...selectedAlumni.kelulusan });
                            setIsEditingBio(true);
                          }}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-display font-extrabold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit Data Siswa</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
                        <div className="text-xs font-black uppercase text-rose-600 border-b border-slate-100 pb-2">
                          Identitas Peserta Didik
                        </div>
                        <dl className="grid grid-cols-3 gap-y-2.5 text-xs">
                          <dt className="text-slate-500 font-semibold">Nama Lengkap</dt>
                          <dd className="col-span-2 font-bold text-slate-800">{selectedAlumni.biodata.nama}</dd>
                          <dt className="text-slate-500 font-semibold">NIS / NISN</dt>
                          <dd className="col-span-2 font-mono font-bold text-slate-800">
                            {selectedAlumni.biodata.nis || '-'} / {selectedAlumni.biodata.nisn || '-'}
                          </dd>
                          <dt className="text-slate-500 font-semibold">NIK</dt>
                          <dd className="col-span-2 font-mono font-bold text-slate-800">{selectedAlumni.biodata.nik || '-'}</dd>
                          <dt className="text-slate-500 font-semibold">Jenis Kelamin</dt>
                          <dd className="col-span-2 font-bold text-slate-800">
                            {selectedAlumni.biodata.jenisKelamin === 'P' ? 'Perempuan' : 'Laki-laki'}
                          </dd>
                          <dt className="text-slate-500 font-semibold">Tempat, Tgl Lahir</dt>
                          <dd className="col-span-2 font-bold text-slate-800">
                            {selectedAlumni.biodata.tempatLahir || '-'},{' '}
                            {selectedAlumni.biodata.tanggalLahir
                              ? formatTanggalIndo(selectedAlumni.biodata.tanggalLahir)
                              : '-'}
                          </dd>
                          <dt className="text-slate-500 font-semibold">Agama</dt>
                          <dd className="col-span-2 font-bold text-slate-800">{selectedAlumni.biodata.agama || '-'}</dd>
                          <dt className="text-slate-500 font-semibold">Alamat</dt>
                          <dd className="col-span-2 font-semibold text-slate-700">{selectedAlumni.biodata.alamat || '-'}</dd>
                        </dl>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
                          <div className="text-xs font-black uppercase text-sky-700 border-b border-slate-100 pb-2">
                            Data Orang Tua / Wali
                          </div>
                          <dl className="grid grid-cols-3 gap-y-2.5 text-xs">
                            <dt className="text-slate-500 font-semibold">Nama Ayah</dt>
                            <dd className="col-span-2 font-bold text-slate-800">{selectedAlumni.biodata.namaAyah || '-'}</dd>
                            <dt className="text-slate-500 font-semibold">Nama Ibu</dt>
                            <dd className="col-span-2 font-bold text-slate-800">{selectedAlumni.biodata.namaIbu || '-'}</dd>
                            <dt className="text-slate-500 font-semibold">Nama Wali</dt>
                            <dd className="col-span-2 font-bold text-slate-800">{selectedAlumni.biodata.namaWali || '-'}</dd>
                          </dl>
                        </div>

                        <div className="bg-white rounded-2xl p-5 border border-emerald-200 space-y-3">
                          <div className="text-xs font-black uppercase text-emerald-700 border-b border-slate-100 pb-2">
                            Data Kelulusan &amp; Lanjutan Studi
                          </div>
                          <dl className="grid grid-cols-3 gap-y-2.5 text-xs">
                            <dt className="text-slate-500 font-semibold">Rombel Asal</dt>
                            <dd className="col-span-2 font-bold text-slate-800">{selectedAlumni.biodata.rombelAsal || '-'}</dd>
                            <dt className="text-slate-500 font-semibold">Tahun Lulus</dt>
                            <dd className="col-span-2 font-bold text-slate-800">{selectedAlumni.kelulusan.tahunLulus || '-'}</dd>
                            <dt className="text-slate-500 font-semibold">Tanggal Lulus</dt>
                            <dd className="col-span-2 font-bold text-slate-800">
                              {selectedAlumni.kelulusan.tanggalLulus
                                ? formatTanggalIndo(selectedAlumni.kelulusan.tanggalLulus)
                                : '-'}
                            </dd>
                            <dt className="text-slate-500 font-semibold">Nomor SKL</dt>
                            <dd className="col-span-2 font-mono font-bold text-emerald-800">
                              {selectedAlumni.kelulusan.noSKL || '-'}
                            </dd>
                            <dt className="text-slate-500 font-semibold">No. Seri Ijazah</dt>
                            <dd className="col-span-2 font-mono font-bold text-indigo-800">
                              {selectedAlumni.kelulusan.noIjazah || '-'}
                            </dd>
                            <dt className="text-slate-500 font-semibold">SMP Tujuan</dt>
                            <dd className="col-span-2 font-extrabold text-rose-700">
                              {selectedAlumni.kelulusan.smpTujuan || 'Belum Diisi'}
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  bioDraft &&
                  kelDraft && (
                    <form
                      onSubmit={handleSaveBiodataEdit}
                      className="bg-white rounded-2xl p-5 border-2 border-amber-300 space-y-4 text-xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h4 className="font-display font-black text-base text-amber-800">Mode Edit Data Alumni</h4>
                        <button
                          type="button"
                          onClick={() => setIsEditingBio(false)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-bold mb-1">Nama Lengkap</label>
                          <input
                            required
                            value={bioDraft.nama}
                            onChange={(e) => setBioDraft({ ...bioDraft, nama: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">NIS</label>
                          <input
                            value={bioDraft.nis}
                            onChange={(e) => setBioDraft({ ...bioDraft, nis: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">NISN</label>
                          <input
                            required
                            value={bioDraft.nisn}
                            onChange={(e) => setBioDraft({ ...bioDraft, nisn: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">NIK</label>
                          <input
                            value={bioDraft.nik}
                            onChange={(e) => setBioDraft({ ...bioDraft, nik: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Jenis Kelamin</label>
                          <select
                            value={bioDraft.jenisKelamin}
                            onChange={(e) => setBioDraft({ ...bioDraft, jenisKelamin: e.target.value as 'L' | 'P' })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                          >
                            <option value="L">Laki-laki</option>
                            <option value="P">Perempuan</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Agama</label>
                          <input
                            value={bioDraft.agama}
                            onChange={(e) => setBioDraft({ ...bioDraft, agama: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Tempat Lahir</label>
                          <input
                            value={bioDraft.tempatLahir}
                            onChange={(e) => setBioDraft({ ...bioDraft, tempatLahir: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Tanggal Lahir</label>
                          <input
                            type="date"
                            value={bioDraft.tanggalLahir}
                            onChange={(e) => setBioDraft({ ...bioDraft, tanggalLahir: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Rombel Asal</label>
                          <input
                            value={bioDraft.rombelAsal}
                            onChange={(e) => setBioDraft({ ...bioDraft, rombelAsal: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Nama Ayah</label>
                          <input
                            value={bioDraft.namaAyah}
                            onChange={(e) => setBioDraft({ ...bioDraft, namaAyah: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Nama Ibu</label>
                          <input
                            value={bioDraft.namaIbu}
                            onChange={(e) => setBioDraft({ ...bioDraft, namaIbu: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Nama Wali</label>
                          <input
                            value={bioDraft.namaWali || ''}
                            onChange={(e) => setBioDraft({ ...bioDraft, namaWali: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block font-bold mb-1">Alamat</label>
                          <input
                            value={bioDraft.alamat}
                            onChange={(e) => setBioDraft({ ...bioDraft, alamat: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">URL Foto Siswa</label>
                          <input
                            value={bioDraft.fotoUrl || ''}
                            onChange={(e) => setBioDraft({ ...bioDraft, fotoUrl: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Tahun Pelajaran Lulus</label>
                          <input
                            value={kelDraft.tahunLulus}
                            onChange={(e) => setKelDraft({ ...kelDraft, tahunLulus: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Tanggal Lulus</label>
                          <input
                            type="date"
                            value={kelDraft.tanggalLulus}
                            onChange={(e) => setKelDraft({ ...kelDraft, tanggalLulus: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">SMP Tujuan</label>
                          <input
                            value={kelDraft.smpTujuan}
                            onChange={(e) => setKelDraft({ ...kelDraft, smpTujuan: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Nomor SKL</label>
                          <input
                            value={kelDraft.noSKL}
                            onChange={(e) => setKelDraft({ ...kelDraft, noSKL: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block font-bold mb-1">Nomor Seri Ijazah</label>
                          <input
                            value={kelDraft.noIjazah}
                            onChange={(e) => setKelDraft({ ...kelDraft, noIjazah: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-3 border-t border-slate-100">
                        <button
                          type="submit"
                          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer"
                        >
                          <Save className="w-4 h-4" />
                          <span>Simpan Perubahan ke Firestore</span>
                        </button>
                      </div>
                    </form>
                  )
                )
              )}

              {/* TAB 2: REKAP NILAI KELAS 1-6 */}
              {detailTab === 'nilai' && (() => {
                const prog = getGradeProgression(selectedAlumni);
                const avgIj = getAvgIjazah(selectedAlumni);
                const activeRn = isEditingNilai && nilaiDraft ? nilaiDraft : selectedAlumni.riwayatNilai;
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-white rounded-2xl p-4 border border-slate-200">
                        <div className="text-[10px] font-black uppercase text-slate-400">Rata-rata Rapor (K1–K6)</div>
                        <div className="font-display font-black text-2xl text-indigo-700 mt-1">
                          {prog.semAvgs.length ? prog.overallAvg.toFixed(2) : '-'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Berdasarkan {prog.semAvgs.length} semester terisi
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl p-4 border border-slate-200">
                        <div className="text-[10px] font-black uppercase text-slate-400">Rata-rata Nilai Akhir Ijazah</div>
                        <div className="font-display font-black text-2xl text-rose-700 mt-1">
                          {avgIj > 0 ? avgIj.toFixed(2) : '-'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Nilai ASAJ Rata-rata: <strong>{Number(selectedAlumni.kelulusan.nilaiAsaj || 0).toFixed(2)}</strong>
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl p-4 border border-slate-200">
                        <div className="text-[10px] font-black uppercase text-slate-400">Indikator Perkembangan Nilai</div>
                        <div className="mt-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border ${
                              prog.trendType === 'up'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : prog.trendType === 'down'
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : 'bg-sky-100 text-sky-800 border-sky-300'
                            }`}
                          >
                            {prog.trendType === 'up' && <TrendingUp className="w-3.5 h-3.5" />}
                            {prog.trendType === 'down' && <TrendingDown className="w-3.5 h-3.5" />}
                            {(prog.trendType === 'stable' || prog.trendType === 'neutral') && <Minus className="w-3.5 h-3.5" />}
                            {prog.trendLabel}
                          </span>
                        </div>
                        <div className="flex items-end gap-1 h-5 mt-2">
                          {SEMESTER_META.map((s) => {
                            const v = getSemesterAvg(selectedAlumni, s.key);
                            const h = v ? Math.max(18, Math.min(100, v)) : 8;
                            return (
                              <div
                                key={s.key}
                                title={`${s.fullLabel}: ${v ? v.toFixed(1) : 'Kosong'}`}
                                className={`flex-1 rounded-t ${v ? 'bg-indigo-500' : 'bg-slate-200'}`}
                                style={{ height: `${h}%` }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-display font-black text-sm sm:text-base text-slate-800">
                            Matriks Nilai Akademik Kelas 1 – Kelas 6
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Menampilkan capaian seluruh mata pelajaran dari Semester 1 (K1S1) hingga Semester 12 (K6S2), Nilai ASAJ, dan Nilai Akhir Ijazah.
                          </p>
                        </div>
                        {isAdmin &&
                          (isEditingNilai ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setIsEditingNilai(false)}
                                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveNilaiEdit}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>Simpan Rekap Nilai</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setNilaiDraft(JSON.parse(JSON.stringify(selectedAlumni.riwayatNilai)));
                                setIsEditingNilai(true);
                              }}
                              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-display font-extrabold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit Matriks Nilai</span>
                            </button>
                          ))}
                      </div>

                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                              <th className="p-2.5 min-w-[200px] sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                                Mata Pelajaran
                              </th>
                              {SEMESTER_META.map((s) => (
                                <th key={s.key} className="p-2 text-center min-w-[54px]" title={s.fullLabel}>
                                  {s.shortLabel}
                                </th>
                              ))}
                              <th className="p-2 text-center min-w-[64px] bg-sky-50 text-sky-900 border-l border-slate-200">
                                ASAJ
                              </th>
                              <th className="p-2 text-center min-w-[70px] bg-rose-50 text-rose-900">Ijazah</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {MAPEL_LIST.map((m) => {
                              const asajVal = Number(activeRn.asajPerMapel?.[m] || 0);
                              const ijVal = Number(activeRn.nilaiIjazah?.[m] || 0);
                              return (
                                <tr key={m} className="hover:bg-slate-50">
                                  <td className="p-2.5 font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-200">
                                    {m}
                                  </td>
                                  {SEMESTER_META.map((s) => {
                                    const raw = activeRn[s.key]?.[m];
                                    const val = raw !== undefined && Number(raw) > 0 ? Number(raw) : '';
                                    return isEditingNilai ? (
                                      <td key={s.key} className="p-1 text-center">
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="0.01"
                                          value={val}
                                          onChange={(e) => {
                                            if (!nilaiDraft) return;
                                            const num = Number(e.target.value);
                                            const nextSem = { ...(nilaiDraft[s.key] || {}) };
                                            if (!e.target.value || Number.isNaN(num) || num <= 0) delete nextSem[m];
                                            else nextSem[m] = Math.min(100, Math.max(0, num));
                                            setNilaiDraft({ ...nilaiDraft, [s.key]: nextSem });
                                          }}
                                          className="w-12 px-1 py-1 rounded border border-slate-300 text-center font-mono text-[11px]"
                                        />
                                      </td>
                                    ) : (
                                      <td
                                        key={s.key}
                                        className={`p-2 text-center font-mono ${
                                          val !== '' ? 'font-bold text-slate-700' : 'text-slate-300'
                                        }`}
                                      >
                                        {val !== '' ? Number(val).toFixed(0) : '-'}
                                      </td>
                                    );
                                  })}

                                  {isEditingNilai ? (
                                    <>
                                      <td className="p-1 text-center bg-sky-50/50 border-l border-slate-200">
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="0.01"
                                          value={asajVal > 0 ? asajVal : ''}
                                          onChange={(e) => {
                                            if (!nilaiDraft) return;
                                            const next = { ...(nilaiDraft.asajPerMapel || {}) };
                                            const num = Number(e.target.value);
                                            if (!e.target.value || Number.isNaN(num) || num <= 0) delete next[m];
                                            else next[m] = Math.min(100, Math.max(0, num));
                                            setNilaiDraft({ ...nilaiDraft, asajPerMapel: next });
                                          }}
                                          className="w-14 px-1 py-1 rounded border border-sky-300 bg-white text-center font-mono font-bold text-sky-800 text-[11px]"
                                        />
                                      </td>
                                      <td className="p-1 text-center bg-rose-50/50">
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="0.01"
                                          value={ijVal > 0 ? ijVal : ''}
                                          onChange={(e) => {
                                            if (!nilaiDraft) return;
                                            const next = { ...(nilaiDraft.nilaiIjazah || {}) };
                                            const num = Number(e.target.value);
                                            if (!e.target.value || Number.isNaN(num) || num <= 0) delete next[m];
                                            else next[m] = Math.min(100, Math.max(0, num));
                                            setNilaiDraft({ ...nilaiDraft, nilaiIjazah: next });
                                          }}
                                          className="w-14 px-1 py-1 rounded border border-rose-300 bg-white text-center font-mono font-black text-rose-800 text-[11px]"
                                        />
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="p-2 text-center font-mono font-bold bg-sky-50/50 text-sky-800 border-l border-slate-200">
                                        {asajVal > 0 ? asajVal.toFixed(2) : '-'}
                                      </td>
                                      <td className="p-2 text-center font-mono font-black bg-rose-50/50 text-rose-700">
                                        {ijVal > 0 ? ijVal.toFixed(2) : '-'}
                                      </td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* TAB 3: ARSIP RAPOR (GRID 12 KARTU) */}
              {detailTab === 'rapor' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-display font-black text-base text-slate-800">Arsip Pindaian Rapor Semester 1 – 12</h3>
                    <p className="text-xs text-slate-500">
                      Koleksi file PDF atau pindaian Google Drive rapor dari Kelas 1 Semester 1 hingga Kelas 6 Semester 2.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                    {SEMESTER_META.map((s) => {
                      const url = String(selectedAlumni.dokumen?.[s.docKey] || '').trim();
                      const hasFile = Boolean(url);
                      return (
                        <div
                          key={s.docKey}
                          className={`bg-white rounded-2xl p-4 border-2 ${
                            hasFile ? 'border-emerald-200' : 'border-slate-200'
                          } flex flex-col justify-between gap-3 shadow-2xs`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                {s.shortLabel}
                              </span>
                              <span
                                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  hasFile ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {hasFile ? 'Tersedia' : 'Belum Ada'}
                              </span>
                            </div>
                            <h4 className="font-display font-black text-sm text-slate-800 mt-2">{s.fullLabel}</h4>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {hasFile ? url : 'Belum ada tautan file rapor'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                            <button
                              type="button"
                              disabled={!hasFile}
                              onClick={() =>
                                hasFile &&
                                setPreviewDoc({
                                  url,
                                  title: `Rapor ${s.fullLabel} — ${selectedAlumni.biodata.nama}`,
                                })
                              }
                              className={`flex-1 px-2.5 py-1.5 rounded-xl font-display font-extrabold text-[11px] flex items-center justify-center gap-1 transition ${
                                hasFile
                                  ? 'bg-sky-600 hover:bg-sky-700 text-white cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Pratinjau</span>
                            </button>
                            {hasFile && (
                              <a
                                href={toDownloadUrl(url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold text-[11px] flex items-center gap-1 transition"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Unduh</span>
                              </a>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDocEditTarget({
                                    alumniId: selectedAlumni.id,
                                    docKey: s.docKey,
                                    label: `Rapor ${s.fullLabel}`,
                                    url,
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-display font-extrabold text-[11px] cursor-pointer transition"
                              >
                                {hasFile ? 'Ubah URL' : '+ Input URL'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: ARSIP IJAZAH & SKL */}
              {detailTab === 'ijazah' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-display font-black text-base text-slate-800">Arsip Pindaian Resmi Ijazah &amp; SKL</h3>
                    <p className="text-xs text-slate-500">
                      Pratinjau langsung dokumen kelulusan di layar atau unduh arsip digital.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {[
                      {
                        key: 'ijazahDepan' as const,
                        title: 'Ijazah Halaman Depan',
                        subtitle: `No. Seri: ${selectedAlumni.kelulusan.noIjazah || '-'}`,
                      },
                      {
                        key: 'ijazahBelakang' as const,
                        title: 'Ijazah Halaman Belakang (Daftar Nilai)',
                        subtitle: `Rata-rata Ijazah: ${getAvgIjazah(selectedAlumni).toFixed(2)}`,
                      },
                      {
                        key: 'skl' as const,
                        title: 'Surat Keterangan Lulus (SKL)',
                        subtitle: `No. SKL: ${selectedAlumni.kelulusan.noSKL || '-'}`,
                      },
                    ].map((c) => {
                      const url = String(selectedAlumni.dokumen?.[c.key] || '').trim();
                      const hasFile = Boolean(url);
                      return (
                        <div
                          key={c.key}
                          className={`bg-white rounded-3xl p-4 border-2 ${
                            hasFile ? 'border-emerald-200' : 'border-slate-200'
                          } flex flex-col gap-3 shadow-xs`}
                        >
                          <div className="min-w-0">
                            <span
                              className={`inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                hasFile ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {hasFile ? 'Dokumen Tersedia' : 'Belum Diunggah'}
                            </span>
                            <h4 className="font-display font-black text-sm text-slate-800 mt-1.5">{c.title}</h4>
                            <p className="text-[11px] font-mono text-slate-500 truncate">{c.subtitle}</p>
                          </div>

                          <div className="h-60 rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
                            {hasFile ? (
                              isImageUrl(url) ? (
                                <img src={url} alt={c.title} className="w-full h-full object-contain bg-white" />
                              ) : (
                                <iframe
                                  src={toPreviewUrl(url)}
                                  title={c.title}
                                  className="w-full h-full border-0 bg-white"
                                  loading="lazy"
                                />
                              )
                            ) : (
                              <div className="text-center p-4 text-slate-400 text-xs font-bold">
                                Belum ada file ditautkan.
                                {isAdmin && (
                                  <>
                                    <br />
                                    Klik &quot;+ Input URL&quot; di bawah untuk menautkan file.
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={!hasFile}
                              onClick={() =>
                                hasFile &&
                                setPreviewDoc({
                                  url,
                                  title: `${c.title} — ${selectedAlumni.biodata.nama}`,
                                })
                              }
                              className={`flex-1 px-3 py-2 rounded-xl font-display font-extrabold text-xs flex items-center justify-center gap-1 transition ${
                                hasFile
                                  ? 'bg-sky-600 hover:bg-sky-700 text-white cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Perbesar</span>
                            </button>
                            {hasFile && (
                              <a
                                href={toDownloadUrl(url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold text-xs flex items-center gap-1 transition"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Unduh</span>
                              </a>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDocEditTarget({
                                    alumniId: selectedAlumni.id,
                                    docKey: c.key,
                                    label: c.title,
                                    url,
                                  })
                                }
                                className="px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-display font-extrabold text-xs flex items-center gap-1 cursor-pointer transition"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                                <span>{hasFile ? 'Ubah URL' : '+ Input URL'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INPUT / EDIT URL DOKUMEN */}
      {docEditTarget && isAdmin && (
        <div className="no-print fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveDocUrl}
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border-2 border-indigo-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-600">Tautkan Arsip Digital</span>
                <h4 className="font-display font-black text-base text-slate-800">{docEditTarget.label}</h4>
              </div>
              <button
                type="button"
                onClick={() => setDocEditTarget(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <label className="block font-extrabold text-slate-700">
                URL Dokumen (Google Drive / Link PDF / Gambar)
              </label>
              <input
                type="url"
                value={docEditTarget.url}
                onChange={(e) => setDocEditTarget({ ...docEditTarget, url: e.target.value })}
                placeholder="https://drive.google.com/file/d/.../view atau link PDF"
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-mono text-xs"
              />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Tips: Link berbagi Google Drive otomatis dikonversi agar dapat langsung dipratinjau di layar dan diunduh.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDocEditTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-display font-extrabold text-xs cursor-pointer"
              >
                Simpan Tautan Dokumen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: PRATINJAU DOKUMEN */}
      {previewDoc && (
        <div className="no-print fixed inset-0 z-[65] bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl max-w-5xl w-full h-[88vh] shadow-2xl border-2 border-slate-200 flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase text-amber-300">Pratinjau Dokumen Arsip</div>
                <h4 className="font-display font-extrabold text-sm truncate">{previewDoc.title}</h4>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={toDownloadUrl(previewDoc.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-display font-extrabold text-xs flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Dokumen</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-auto p-2">
              {isImageUrl(previewDoc.url) ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.title}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-md bg-white"
                />
              ) : (
                <iframe
                  src={toPreviewUrl(previewDoc.url)}
                  title={previewDoc.title}
                  className="w-full h-full rounded-xl border-0 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN PRINT AREA */}
      {printHtml && (
        <div
          className="hidden print:block"
          dangerouslySetInnerHTML={{ __html: printHtml }}
        />
      )}
    </div>
  );
};
