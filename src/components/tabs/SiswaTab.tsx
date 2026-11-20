import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users,
  UserPlus,
  FileDown,
  FileSpreadsheet,
  QrCode,
  Trash2,
  Printer,
  Upload,
  Edit,
  X,
  Save,
  CheckCircle2,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  GraduationCap,
  Phone,
  ShieldAlert,
  Sparkles,
  MessageCircle,
} from 'lucide-react';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { Student, SchoolProfile, ReligionType, KEBUTUHAN_KHUSUS_OPTIONS, isSiswaInklusi } from '../../types';
import { MAPEL_LIST } from '../../data/defaultData';
import { getLocalTodayStr, getLocalTimeStr } from '../../utils/dateUtils';
import {
  downloadTemplateStudentsXLSX,
  exportStudentsToXLSX,
  parseImportStudentsXLSX,
  generateAccountUsername,
} from '../../utils/excel';
import { renderBarcodeToCanvas } from '../../utils/barcode';
import { BarcodePrintModal } from '../BarcodePrintModal';
import {
  CLASSES_LIST,
  ACADEMIC_YEARS,
  isKelas6Class,
  AttendanceRecordItem,
  getStoredAttendance,
} from '../../utils/storage';
import { buildParentAttendanceWhatsAppLink } from '../../utils/attendanceNotifier';
import {
  saveStudentsToFirestoreBatch,
  saveSingleStudentToFirestore,
  deleteStudentFromFirestore,
  deleteMultipleStudentsFromFirestore,
} from '../../utils/studentFirestore';
import {
  validateStudentsAgainstKelasConfig,
  applyAutoFixStudentClassDiscrepancies,
} from '../../utils/studentClassValidation';

export type StudentSortOption =
  | 'nama-asc'
  | 'nama-desc'
  | 'nisn-asc'
  | 'nisn-desc'
  | 'kelas-asc'
  | 'kelas-desc'
  | 'jk-asc'
  | 'jk-desc'
  | 'inklusi-desc';

interface Props {
  students: Student[];
  onSaveStudents: (students: Student[], skipCloudWrite?: boolean) => void;
  profile: SchoolProfile;
  activeClass: string;
  activeYear: string;
  attendanceRecords?: Record<string, AttendanceRecordItem>;
  liveTodayStr?: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
  onSelectClass?: (kelas: string) => void;
}

export const SiswaTab: React.FC<Props> = ({
  students,
  onSaveStudents,
  profile,
  activeClass,
  activeYear,
  attendanceRecords,
  liveTodayStr,
  showToast,
  onOpenZoom,
  onSelectClass,
}) => {
  const [newNama, setNewNama] = useState('');
  const [newJk, setNewJk] = useState<'L' | 'P'>('L');
  const [newTempatLahir, setNewTempatLahir] = useState('Jakarta');
  const [newTanggalLahir, setNewTanggalLahir] = useState('2014-05-12');
  const [newNik, setNewNik] = useState('');
  const [newNisn, setNewNisn] = useState('');
  const [newAgama, setNewAgama] = useState<ReligionType>('Islam');
  const [newKebutuhanKhusus, setNewKebutuhanKhusus] = useState<string>('Tidak Ada (Reguler)');
  const [newNamaAyah, setNewNamaAyah] = useState('');
  const [newNamaIbu, setNewNamaIbu] = useState('');
  const [newNoTelpOrtu, setNewNoTelpOrtu] = useState('');
  const [newAlamat, setNewAlamat] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('123');
  const [newFoto, setNewFoto] = useState('https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150');

  // Loading state proses import
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importStatusMessage, setImportStatusMessage] = useState<string>('');

  // Filter kelas, pencarian, auto-flag validasi kelas & pengurutan siswa (default A -> Z)
  const [selectedFilterClass, setSelectedFilterClass] = useState<string>(activeClass);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<StudentSortOption>('nama-asc');
  const [onlyShowFlagged, setOnlyShowFlagged] = useState<boolean>(false);
  const [isAutoFixingClasses, setIsAutoFixingClasses] = useState<boolean>(false);

  // State konfirmasi hapus (menghindari window.confirm yang diblokir iframe)
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isBatchPrintOpen, setIsBatchPrintOpen] = useState<boolean>(false);

  // State Modal Kelulusan Kelas 6 (Luluskan -> Arsip ke Portal Alumni)
  const [isGraduateModalOpen, setIsGraduateModalOpen] = useState<boolean>(false);
  const [gradLoading, setGradLoading] = useState<boolean>(false);
  const [isGraduating, setIsGraduating] = useState<boolean>(false);
  const [gradSelectedIds, setGradSelectedIds] = useState<Set<string>>(new Set());
  const [gradFilterClass, setGradFilterClass] = useState<string>('SEMUA');
  const [gradSearch, setGradSearch] = useState<string>('');
  const [gradTahunLulus, setGradTahunLulus] = useState<string>(activeYear || '2026/2027');
  const [gradTanggalLulus, setGradTanggalLulus] = useState<string>(() => getLocalTodayStr());
  const [gradRemoveFromActive, setGradRemoveFromActive] = useState<boolean>(true);
  const [gradAsajByKey, setGradAsajByKey] = useState<Record<string, any>>({});
  const [gradExistingAlumniMap, setGradExistingAlumniMap] = useState<Record<string, any>>({});

  // Sinkronkan filter dengan activeClass jika berubah dari global header
  useEffect(() => {
    if (selectedFilterClass !== 'SEMUA') {
      setSelectedFilterClass(activeClass);
    }
  }, [activeClass]);

  // Hitung jumlah siswa per kelas untuk label filter
  const classStudentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    CLASSES_LIST.forEach((c) => {
      counts[c] = 0;
    });
    students.forEach((s) => {
      if (counts[s.kelas] !== undefined) {
        counts[s.kelas]++;
      } else {
        counts[s.kelas] = 1;
      }
    });
    return counts;
  }, [students]);

  // Edit modal state
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const todayDateStr = liveTodayStr || getLocalTodayStr();
  const resolvedAttendanceMap = useMemo(
    () => attendanceRecords || getStoredAttendance(),
    [attendanceRecords]
  );

  // Validasi otomatis keselarasan array students terhadap konfigurasi kelas resmi
  const classValidationReport = useMemo(
    () =>
      validateStudentsAgainstKelasConfig(students, {
        allowedClasses: CLASSES_LIST,
      }),
    [students]
  );

  const handleAutoFixFlaggedClasses = async () => {
    const { updatedStudents, fixedCount } = applyAutoFixStudentClassDiscrepancies(
      students,
      classValidationReport
    );
    if (fixedCount === 0) {
      showToast(
        'Ketidaksesuaian yang ter-flag memerlukan peninjauan manual (mis. duplikasi identitas lintas kelas).',
        'error'
      );
      return;
    }
    setIsAutoFixingClasses(true);
    try {
      await saveStudentsToFirestoreBatch(updatedStudents);
      onSaveStudents(updatedStudents, true);
      showToast(
        `Berhasil memperbaiki & menyinkronkan ${fixedCount} data kelas/barcode siswa ke Firestore!`,
        'success'
      );
    } catch (err: any) {
      showToast(`Gagal menyimpan perbaikan otomatis: ${err?.message || 'Kendala koneksi'}`, 'error');
    } finally {
      setIsAutoFixingClasses(false);
    }
  };

  const filteredStudents = useMemo(() => {
    const filtered = students.filter((s) => {
      if (onlyShowFlagged && !classValidationReport.flaggedStudentMap[s.id]) {
        return false;
      }
      const matchesClass = selectedFilterClass === 'SEMUA' ? true : s.kelas === selectedFilterClass;
      if (!matchesClass) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        s.nama.toLowerCase().includes(q) ||
        s.nisn.toLowerCase().includes(q) ||
        (s.nik && s.nik.toLowerCase().includes(q)) ||
        (s.noTelpOrtu && s.noTelpOrtu.toLowerCase().includes(q)) ||
        s.barcodeId.toLowerCase().includes(q) ||
        s.kelas.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const compareName = () =>
        (a.nama || '').localeCompare(b.nama || '', 'id', { sensitivity: 'base' });

      switch (sortBy) {
        case 'nama-desc':
          return (b.nama || '').localeCompare(a.nama || '', 'id', { sensitivity: 'base' });
        case 'nisn-asc': {
          const cmp = (a.nisn || '').localeCompare(b.nisn || '', undefined, { numeric: true });
          return cmp !== 0 ? cmp : compareName();
        }
        case 'nisn-desc': {
          const cmp = (b.nisn || '').localeCompare(a.nisn || '', undefined, { numeric: true });
          return cmp !== 0 ? cmp : compareName();
        }
        case 'kelas-asc': {
          const cmp = (a.kelas || '').localeCompare(b.kelas || '', undefined, { numeric: true });
          return cmp !== 0 ? cmp : compareName();
        }
        case 'kelas-desc': {
          const cmp = (b.kelas || '').localeCompare(a.kelas || '', undefined, { numeric: true });
          return cmp !== 0 ? cmp : compareName();
        }
        case 'jk-asc': {
          const cmp = (a.jenisKelamin || 'L').localeCompare(b.jenisKelamin || 'L');
          return cmp !== 0 ? cmp : compareName();
        }
        case 'jk-desc': {
          const cmp = (b.jenisKelamin || 'L').localeCompare(a.jenisKelamin || 'L');
          return cmp !== 0 ? cmp : compareName();
        }
        case 'inklusi-desc': {
          const aInklusi = isSiswaInklusi(a.kebutuhanKhusus) ? 1 : 0;
          const bInklusi = isSiswaInklusi(b.kebutuhanKhusus) ? 1 : 0;
          if (bInklusi !== aInklusi) return bInklusi - aInklusi;
          return compareName();
        }
        case 'nama-asc':
        default:
          return compareName();
      }
    });
  }, [students, selectedFilterClass, searchQuery, sortBy, onlyShowFlagged, classValidationReport]);

  const handleToggleColumnSort = (col: 'nama' | 'nisn' | 'jk' | 'kelas') => {
    setSortBy((prev) => {
      if (col === 'nama') return prev === 'nama-asc' ? 'nama-desc' : 'nama-asc';
      if (col === 'nisn') return prev === 'nisn-asc' ? 'nisn-desc' : 'nisn-asc';
      if (col === 'jk') return prev === 'jk-asc' ? 'jk-desc' : 'jk-asc';
      if (col === 'kelas') return prev === 'kelas-asc' ? 'kelas-desc' : 'kelas-asc';
      return 'nama-asc';
    });
  };

  // Daftar siswa Kelas 6 untuk menu Luluskan
  const grade6Students = useMemo(
    () =>
      students
        .filter((s) => isKelas6Class(s.kelas))
        .sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'id', { sensitivity: 'base' })),
    [students]
  );

  const grade6Classes = useMemo(
    () =>
      Array.from(new Set(grade6Students.map((s) => s.kelas).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'id', { numeric: true })
      ),
    [grade6Students]
  );

  const visibleGradCandidates = useMemo(() => {
    const q = gradSearch.trim().toLowerCase();
    return grade6Students.filter((s) => {
      if (gradFilterClass !== 'SEMUA' && s.kelas !== gradFilterClass) return false;
      if (!q) return true;
      return (
        (s.nama || '').toLowerCase().includes(q) ||
        (s.nisn || '').toLowerCase().includes(q) ||
        (s.kelas || '').toLowerCase().includes(q)
      );
    });
  }, [grade6Students, gradFilterClass, gradSearch]);

  const handleOpenGraduateModal = async (preselectedIds?: string[]) => {
    if (grade6Students.length === 0) {
      showToast('Belum ada peserta didik Kelas 6 yang terdaftar.', 'error');
      return;
    }

    const initialClassFilter =
      preselectedIds && preselectedIds.length === 1
        ? 'SEMUA'
        : isKelas6Class(selectedFilterClass)
        ? selectedFilterClass
        : 'SEMUA';

    setGradFilterClass(initialClassFilter);
    setGradSearch('');
    setGradTahunLulus(activeYear || '2026/2027');
    setGradTanggalLulus(getLocalTodayStr());
    setIsGraduateModalOpen(true);
    setGradLoading(true);

    try {
      const asajMap: Record<string, any> = {};
      try {
        const snapAsaj = await getDocs(collection(db, 'nilai_asaj'));
        snapAsaj.forEach((d) => {
          const data = d.data();
          asajMap[d.id] = { ...data, studentId: d.id };
          if (data?.nisn) asajMap[`nisn_${String(data.nisn).trim()}`] = { ...data, studentId: d.id };
        });
      } catch {}
      try {
        const localRaw = localStorage.getItem('sekolahku_asaj_nilai_v1');
        if (localRaw) {
          Object.values(JSON.parse(localRaw)).forEach((r: any) => {
            if (r?.studentId && !asajMap[r.studentId]) {
              asajMap[r.studentId] = r;
              if (r?.nisn) asajMap[`nisn_${String(r.nisn).trim()}`] = r;
            }
          });
        }
      } catch {}

      const existingAlumni: Record<string, any> = {};
      try {
        const snapAlu = await getDocs(collection(db, 'alumni'));
        snapAlu.forEach((d) => {
          const data = d.data();
          existingAlumni[d.id] = data;
          if (data?.sourceStudentId) existingAlumni[`src_${data.sourceStudentId}`] = data;
          if (data?.biodata?.nisn) existingAlumni[`nisn_${String(data.biodata.nisn).trim()}`] = data;
        });
      } catch {}

      setGradAsajByKey(asajMap);
      setGradExistingAlumniMap(existingAlumni);

      if (preselectedIds && preselectedIds.length > 0) {
        setGradSelectedIds(new Set(preselectedIds));
      } else {
        const defaults = grade6Students
          .filter((s) => (initialClassFilter === 'SEMUA' ? true : s.kelas === initialClassFilter))
          .map((s) => s.id);
        setGradSelectedIds(new Set(defaults));
      }
    } finally {
      setGradLoading(false);
    }
  };

  const handleConfirmGraduate = async () => {
    const selectedStudents = grade6Students.filter((s) => gradSelectedIds.has(s.id));
    if (selectedStudents.length === 0) {
      showToast('Pilih minimal 1 siswa Kelas 6 untuk diluluskan.', 'error');
      return;
    }

    setIsGraduating(true);
    try {
      const nowIso = new Date().toISOString();
      const CHUNK_SIZE = 350;

      for (let i = 0; i < selectedStudents.length; i += CHUNK_SIZE) {
        const chunk = selectedStudents.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((s) => {
          const docId = s.nisn
            ? `alu_${String(s.nisn).replace(/[^a-zA-Z0-9_-]/g, '')}`
            : `alu_${String(s.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
          const existing =
            gradExistingAlumniMap[docId] ||
            gradExistingAlumniMap[`src_${s.id}`] ||
            (s.nisn ? gradExistingAlumniMap[`nisn_${s.nisn.trim()}`] : null) ||
            null;
          const a =
            gradAsajByKey[s.id] ||
            (s.nisn ? gradAsajByKey[`nisn_${s.nisn.trim()}`] : null) ||
            {};

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

          const payload = {
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
              tahunLulus: gradTahunLulus.trim() || activeYear || '2026/2027',
              noIjazah: a.noIjazah || existing?.kelulusan?.noIjazah || '',
              noSKL: a.noSkl || existing?.kelulusan?.noSKL || '',
              tanggalLulus: gradTanggalLulus || getLocalTodayStr(),
              smpTujuan: existing?.kelulusan?.smpTujuan || '',
              statusKelulusan: 'LULUS' as const,
              nilaiAsaj: Number(a.nilaiAsaj || existing?.kelulusan?.nilaiAsaj || 0),
              nilaiAkhirIjazah: Number(a.nilaiAkhir || existing?.kelulusan?.nilaiAkhirIjazah || 0),
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
              rataRataIjazah: Number(a.nilaiAkhir || existing?.riwayatNilai?.rataRataIjazah || 0),
            },
            dokumen: existing?.dokumen || {
              raporSemester1: '',
              raporSemester2: '',
              raporSemester3: '',
              raporSemester4: '',
              raporSemester5: '',
              raporSemester6: '',
              raporSemester7: '',
              raporSemester8: '',
              raporSemester9: '',
              raporSemester10: '',
              raporSemester11: '',
              raporSemester12: '',
              ijazahDepan: '',
              ijazahBelakang: '',
              skl: '',
            },
            sourceStudentId: s.id,
            migratedAt: existing?.migratedAt || nowIso,
            updatedAt: nowIso,
          };

          batch.set(doc(db, 'alumni', docId), payload, { merge: true });
        });

        await batch.commit();
      }

      if (gradRemoveFromActive) {
        const graduatedIds = selectedStudents.map((s) => s.id);
        const graduatedIdSet = new Set(graduatedIds);
        const remainingStudents = students.filter((s) => !graduatedIdSet.has(s.id));
        await deleteMultipleStudentsFromFirestore(graduatedIds, remainingStudents);
        onSaveStudents(remainingStudents, true);
      }

      setIsGraduateModalOpen(false);
      showToast(
        gradRemoveFromActive
          ? `Berhasil meluluskan ${selectedStudents.length} siswa Kelas 6, mengarsipkan ke Portal Alumni, dan memperbarui daftar siswa aktif!`
          : `Berhasil mengarsipkan ${selectedStudents.length} lulusan Kelas 6 ke Portal Alumni!`,
        'success'
      );
    } catch (err) {
      console.error('Gagal meluluskan siswa Kelas 6:', err);
      showToast('Gagal memproses kelulusan siswa Kelas 6 ke Firebase Firestore.', 'error');
    } finally {
      setIsGraduating(false);
    }
  };

  const handleImportStudents = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatusMessage('Membaca dan memverifikasi berkas...');

    try {
      const defaultTargetClass = selectedFilterClass !== 'SEMUA' ? selectedFilterClass : activeClass;
      const { newStudents, count, importedClasses } = await parseImportStudentsXLSX(
        file,
        students,
        defaultTargetClass,
        activeYear
      );

      if (count === 0) {
        setIsImporting(false);
        showToast('File Excel tidak memuat data siswa yang valid. Pastikan terdapat kolom Nama Siswa!', 'error');
        return;
      }

      setImportStatusMessage(`Menyimpan ${count} peserta didik secara permanen ke Firebase Firestore...`);

      // Merge: Update jika NISN sudah ada, atau tambahkan jika baru
      const existingMap = new Map<string, Student>();
      students.forEach((s) => {
        const key = s.nisn ? s.nisn.trim() : s.id;
        existingMap.set(key, s);
      });

      newStudents.forEach((ns) => {
        const key = ns.nisn ? ns.nisn.trim() : ns.id;
        const existing = existingMap.get(key);
        if (existing) {
          existingMap.set(key, { ...ns, id: existing.id, barcodeId: existing.barcodeId || ns.barcodeId });
        } else {
          existingMap.set(key, ns);
        }
      });

      const mergedStudents = Array.from(existingMap.values());

      // INSTRUKSI #2 & #3: Gunakan writeBatch ke Firestore dan AWAIT batch.commit() selesai sebelum notifikasi
      await saveStudentsToFirestoreBatch(mergedStudents);

      // Perbarui state aplikasi tanpa memicu writeBatch ganda
      onSaveStudents(mergedStudents, true);

      // Auto-switch filter agar data siswa yang baru diimpor langsung terlihat
      if (importedClasses.length === 1) {
        setSelectedFilterClass(importedClasses[0]);
        if (onSelectClass) onSelectClass(importedClasses[0]);
      } else if (importedClasses.length > 1) {
        setSelectedFilterClass('SEMUA');
      }

      const classLabel = importedClasses.length > 0 ? ` ke ${importedClasses.join(', ')}` : '';
      showToast(
        `Berhasil mengimpor ${count} peserta didik${classLabel} ke database Firestore!`,
        'success'
      );
    } catch (err: any) {
      console.error('Gagal mengimpor siswa ke Firestore:', err);
      showToast(`Gagal menyimpan data ke database: ${err?.message || 'Kendala koneksi'}`, 'error');
    } finally {
      setIsImporting(false);
      setImportStatusMessage('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (isEdit && editingStudent) {
          setEditingStudent({ ...editingStudent, fotoUrl: reader.result as string });
        } else {
          setNewFoto(reader.result as string);
        }
        showToast('Foto siswa berhasil dimuat!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNama || !newNisn) {
      showToast('Harap lengkapi nama dan NISN siswa!', 'error');
      return;
    }

    const nextNum = String(students.length + 1).padStart(3, '0');
    const classCode = activeClass.replace(/\s+/g, '');
    const barcodeId = `RBU21-${classCode}-${nextNum}`;

    const existingUsernames = new Set<string>(students.map((s) => s.username.toLowerCase()));
    const finalUsername = newUser.trim() || generateAccountUsername(newNama, newNisn, existingUsernames);
    const finalPassword = newPass.trim() || '123';

    const newStudent: Student = {
      id: `std_${Date.now()}`,
      barcodeId,
      nama: newNama,
      jenisKelamin: newJk,
      tempatLahir: newTempatLahir || 'Jakarta',
      tanggalLahir: newTanggalLahir || '2014-01-01',
      nik: newNik || `317201${Date.now().toString().slice(-10)}`,
      nisn: newNisn,
      kebutuhanKhusus: newKebutuhanKhusus,
      namaAyah: newNamaAyah || '-',
      namaIbu: newNamaIbu || '-',
      noTelpOrtu: newNoTelpOrtu.trim(),
      alamat: newAlamat || 'Jakarta Utara',
      agama: newAgama,
      kelas: activeClass,
      tahunPelajaran: activeYear,
      username: finalUsername,
      password: finalPassword,
      fotoUrl: newFoto,
    };

    try {
      const updatedList = [...students, newStudent];
      await saveSingleStudentToFirestore(newStudent, updatedList);
      onSaveStudents(updatedList, true);
      showToast(`Peserta didik ${newNama} berhasil disimpan ke database Firestore! Akun: ${finalUsername}`, 'success');
      setNewNama('');
      setNewNik('');
      setNewNisn('');
      setNewNamaAyah('');
      setNewNamaIbu('');
      setNewNoTelpOrtu('');
      setNewAlamat('');
      setNewUser('');
      setNewPass('123');
    } catch (err: any) {
      showToast(`Gagal menyimpan ke database: ${err?.message || 'Kendala jaringan'}`, 'error');
    }
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    try {
      const updated = students.map((s) => (s.id === editingStudent.id ? editingStudent : s));
      await saveSingleStudentToFirestore(editingStudent, updated);
      onSaveStudents(updated, true);
      showToast(`Data peserta didik ${editingStudent.nama} berhasil diperbarui di database!`, 'success');
      setEditingStudent(null);
    } catch (err: any) {
      showToast(`Gagal memperbarui data siswa: ${err?.message || 'Kendala jaringan'}`, 'error');
    }
  };

  const confirmDeleteSingleStudent = async () => {
    if (!deletingStudent) return;
    setIsDeleting(true);
    const targetId = deletingStudent.id;
    const targetName = deletingStudent.nama;

    try {
      const remaining = students.filter((s) => s.id !== targetId);
      await deleteStudentFromFirestore(targetId, remaining);
      onSaveStudents(remaining, true);
      showToast(`Peserta didik ${targetName} berhasil dihapus permanen dari Firestore`, 'success');
      setDeletingStudent(null);
    } catch (err: any) {
      console.error('Gagal menghapus siswa:', err);
      showToast(`Gagal menghapus siswa: ${err?.message || 'Kendala jaringan'}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmDeleteBulkStudents = async () => {
    if (filteredStudents.length === 0) return;
    setIsDeleting(true);

    try {
      const idsToDelete = new Set(filteredStudents.map((s) => s.id));
      const remaining = students.filter((s) => !idsToDelete.has(s.id));
      await deleteMultipleStudentsFromFirestore(Array.from(idsToDelete), remaining);
      onSaveStudents(remaining, true);
      showToast(
        `${idsToDelete.size} data peserta didik berhasil dihapus permanen dari Firestore`,
        'success'
      );
      setIsBulkDeleteOpen(false);
    } catch (err: any) {
      console.error('Gagal menghapus massal siswa:', err);
      showToast(`Gagal menghapus data siswa: ${err?.message || 'Kendala jaringan'}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClassChange = async (id: string, targetClass: string) => {
    const targetStudent = students.find((s) => s.id === id);
    if (!targetStudent) return;
    const updatedStudent = { ...targetStudent, kelas: targetClass };

    try {
      const updated = students.map((s) => (s.id === id ? updatedStudent : s));
      await saveSingleStudentToFirestore(updatedStudent, updated);
      onSaveStudents(updated, true);
      showToast(`Berhasil memindahkan ${targetStudent.nama} ke ${targetClass}`, 'success');
    } catch (err: any) {
      showToast(`Gagal memindahkan kelas: ${err?.message || 'Kendala jaringan'}`, 'error');
    }
  };

  const handleYearChange = async (id: string, targetYear: string) => {
    const targetStudent = students.find((s) => s.id === id);
    if (!targetStudent) return;
    const updatedStudent = { ...targetStudent, tahunPelajaran: targetYear };

    try {
      const updated = students.map((s) => (s.id === id ? updatedStudent : s));
      await saveSingleStudentToFirestore(updatedStudent, updated);
      onSaveStudents(updated, true);
      showToast(`Berhasil memperbarui tahun pelajaran ${targetStudent.nama}`, 'success');
    } catch (err: any) {
      showToast(`Gagal memperbarui tahun pelajaran: ${err?.message || 'Kendala jaringan'}`, 'error');
    }
  };

  // Render barcode into canvas elements after mount
  useEffect(() => {
    filteredStudents.forEach((s) => {
      const canvas = document.getElementById(`barcode_canvas_${s.id}`) as HTMLCanvasElement;
      if (canvas) {
        renderBarcodeToCanvas(canvas, s.barcodeId);
      }
    });
  }, [filteredStudents]);

  return (
    <section className="space-y-6">
      {/* Form Tambah Siswa */}
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-extrabold uppercase bg-rose-100 text-rose-700 px-3 py-1 rounded-full">
              Manajemen Peserta Didik & Kebutuhan Khusus
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1">
              Data Lengkap Siswa, Orang Tua & Kebutuhan Khusus
            </h2>
            <p className="text-xs text-slate-500 max-w-3xl">
              Mencakup identitas lengkap: Nama, Jenis Kelamin, TTL, NIK, NISN, Kebutuhan Khusus (12 Kategori), Nama Ayah & Ibu, Alamat, serta Akun Login Siswa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls, .csv"
              onChange={handleImportStudents}
              onClick={(e) => {
                (e.target as HTMLInputElement).value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              disabled={isImporting}
              onClick={downloadTemplateStudentsXLSX}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title="Download format Excel untuk import data siswa"
            >
              <FileDown className="w-4 h-4 text-sky-600" /> Template Siswa (.XLSX)
            </button>
            <button
              type="button"
              disabled={isImporting}
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                  fileInputRef.current.click();
                }
              }}
              className={`bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition ${
                isImporting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
              }`}
              title="Import file Excel siswa langsung ke database Firebase Firestore"
            >
              {isImporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Sedang Menyimpan...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Import Siswa (.XLSX)</span>
                </>
              )}
            </button>
            <button
              type="button"
              disabled={isImporting}
              onClick={() => exportStudentsToXLSX(filteredStudents)}
              className="bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Siswa (.XLSX)
            </button>
          </div>
        </div>

        {/* Indikator Loading Proses Simpan ke Database */}
        {isImporting && (
          <div className="bg-amber-500/10 border-2 border-amber-500 text-amber-900 p-4 rounded-2xl flex items-center gap-3 animate-pulse">
            <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <div className="text-xs font-display font-extrabold">
              <div>{importStatusMessage || 'Sedang menyimpan data ke database...'}</div>
              <div className="text-[11px] font-medium text-amber-700">
                Mohon tunggu sejenak, data sedang ditulis secara permanen ke Firebase Firestore melalui writeBatch.
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleAddStudent} className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Nama Lengkap Siswa *</label>
              <input
                type="text"
                value={newNama}
                onChange={(e) => setNewNama(e.target.value)}
                required
                placeholder="Nama Lengkap Siswa"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Jenis Kelamin *</label>
              <select
                value={newJk}
                onChange={(e) => setNewJk(e.target.value as 'L' | 'P')}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold bg-white"
              >
                <option value="L">Laki-Laki (L)</option>
                <option value="P">Perempuan (P)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Tempat Lahir</label>
              <input
                type="text"
                value={newTempatLahir}
                onChange={(e) => setNewTempatLahir(e.target.value)}
                placeholder="Tempat Lahir (Contoh: Jakarta)"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Tanggal Lahir</label>
              <input
                type="date"
                value={newTanggalLahir}
                onChange={(e) => setNewTanggalLahir(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">NIK (16 Digit)</label>
              <input
                type="text"
                value={newNik}
                onChange={(e) => setNewNik(e.target.value)}
                maxLength={16}
                placeholder="317201..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">NISN (10 Digit) *</label>
              <input
                type="text"
                value={newNisn}
                onChange={(e) => setNewNisn(e.target.value)}
                required
                maxLength={10}
                placeholder="0134567890"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Agama</label>
              <select
                value={newAgama}
                onChange={(e) => setNewAgama(e.target.value as ReligionType)}
                className="w-full px-3 py-2 rounded-xl border-2 border-rose-500 text-xs font-extrabold bg-rose-50 text-rose-900"
              >
                <option value="Islam">Islam (PAIBP)</option>
                <option value="Kristen">Kristen (PAKBP)</option>
                <option value="Katolik">Katolik (PAKat)</option>
                <option value="Buddha">Buddha (PABBP)</option>
                <option value="Hindu">Hindu (PAHBP)</option>
                <option value="Konghucu">Konghucu (PAKBBP)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Kebutuhan Khusus</label>
              <select
                value={newKebutuhanKhusus}
                onChange={(e) => setNewKebutuhanKhusus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-amber-400 text-xs font-bold bg-amber-50 text-amber-900"
              >
                {KEBUTUHAN_KHUSUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Nama Ayah</label>
              <input
                type="text"
                value={newNamaAyah}
                onChange={(e) => setNewNamaAyah(e.target.value)}
                placeholder="Nama Ayah Kandung"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Nama Ibu</label>
              <input
                type="text"
                value={newNamaIbu}
                onChange={(e) => setNewNamaIbu(e.target.value)}
                placeholder="Nama Ibu Kandung"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-emerald-700 block mb-1">
                No. Telpon / WA Orang Tua
              </label>
              <input
                type="tel"
                value={newNoTelpOrtu}
                onChange={(e) => setNewNoTelpOrtu(e.target.value)}
                placeholder="0812xxxxxxxx / 62812..."
                className="w-full px-3.5 py-2 rounded-xl border border-emerald-400 text-xs font-mono font-bold bg-emerald-50/40"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Alamat Lengkap</label>
              <input
                type="text"
                value={newAlamat}
                onChange={(e) => setNewAlamat(e.target.value)}
                placeholder="Jl. ..., RT/RW, Kelurahan, Kecamatan"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Username Login</label>
              <input
                type="text"
                value={newUser}
                onChange={(e) => setNewUser(e.target.value)}
                placeholder="Otomatis jika kosong"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Password Login</label>
              <input
                type="text"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="Default 123"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Unggah Foto Siswa</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, false)}
                className="w-full text-xs text-slate-600 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-sky-600 file:text-white cursor-pointer"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold py-2 px-4 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer h-[38px]"
              >
                <UserPlus className="w-4 h-4" /> Simpan Siswa Baru
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Tabel Akun & Manajemen Siswa */}
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-extrabold text-base text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              Daftar Biodata, Kebutuhan Khusus & Akun Siswa
              <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {filteredStudents.length} Siswa
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Menampilkan {selectedFilterClass === 'SEMUA' ? 'seluruh kelas' : selectedFilterClass} ({filteredStudents.length} dari total {students.length} siswa terdaftar)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Dropdown Kelas */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <label className="text-xs font-bold text-slate-600">Pilih Kelas:</label>
              <select
                value={selectedFilterClass}
                onChange={(e) => {
                  setSelectedFilterClass(e.target.value);
                  if (e.target.value !== 'SEMUA' && onSelectClass) {
                    onSelectClass(e.target.value);
                  }
                }}
                className="bg-transparent text-xs font-black text-slate-800 focus:outline-hidden cursor-pointer"
              >
                <option value="SEMUA">Semua Kelas ({students.length} Siswa)</option>
                {Object.keys(classStudentCounts)
                  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                  .map((c) => (
                  <option key={c} value={c}>
                    {c} ({classStudentCounts[c] || 0} Siswa)
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Data Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-600" />
              <label className="text-xs font-bold text-slate-600">Urutkan:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as StudentSortOption)}
                className="bg-transparent text-xs font-black text-slate-800 focus:outline-hidden cursor-pointer"
              >
                <option value="nama-asc">Nama (A → Z)</option>
                <option value="nama-desc">Nama (Z → A)</option>
                <option value="nisn-asc">NISN (Terkecil → Terbesar)</option>
                <option value="nisn-desc">NISN (Terbesar → Terkecil)</option>
                <option value="kelas-asc">Kelas (1A → 6B)</option>
                <option value="kelas-desc">Kelas (6B → 1A)</option>
                <option value="jk-asc">Jenis Kelamin (L → P)</option>
                <option value="jk-desc">Jenis Kelamin (P → L)</option>
                <option value="inklusi-desc">Kebutuhan Khusus (Inklusi Dahulu)</option>
              </select>
            </div>

            {/* Pencarian Siswa */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, NISN, NIK..."
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Tombol Luluskan Kelas 6 */}
            {grade6Students.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenGraduateModal()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                title="Luluskan siswa Kelas 6 dan arsipkan ke Portal Alumni"
              >
                <GraduationCap className="w-4 h-4" /> Luluskan Kelas 6 ({grade6Students.length})
              </button>
            )}

            {/* Tombol Hapus Massal (Data Yang Tampil) */}
            {filteredStudents.length > 0 && (
              <button
                type="button"
                onClick={() => setIsBulkDeleteOpen(true)}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-display font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
                title="Hapus semua data siswa yang sedang tampil"
              >
                <Trash2 className="w-3.5 h-3.5" /> Hapus ({filteredStudents.length})
              </button>
            )}
          </div>
        </div>

        {/* Panel Peringatan Validasi Otomatis Ketidaksesuaian Kelas Siswa */}
        {classValidationReport.summary.flaggedStudents > 0 && (
          <div className="p-4 rounded-2xl border-2 border-amber-300 bg-amber-50/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="text-xs space-y-1">
                <div className="font-display font-black text-amber-950">
                  Validasi Otomatis Kelas: {classValidationReport.summary.flaggedStudents} Siswa Ter-Flag Memiliki Ketidaksesuaian Data Kelas/Barcode
                </div>
                <p className="text-amber-900">
                  Ditemukan {classValidationReport.summary.errorCount} error &amp; {classValidationReport.summary.warningCount} peringatan terhadap konfigurasi kelas resmi. Contoh:{' '}
                  <strong>{classValidationReport.discrepancies[0]?.message}</strong>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setOnlyShowFlagged((prev) => !prev);
                  if (!onlyShowFlagged) {
                    setSelectedFilterClass('SEMUA');
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                  onlyShowFlagged
                    ? 'bg-amber-600 text-white border-amber-700'
                    : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
              >
                {onlyShowFlagged
                  ? 'Tampilkan Semua Siswa'
                  : `Filter Siswa Ter-Flag (${classValidationReport.summary.flaggedStudents})`}
              </button>
              {classValidationReport.discrepancies.some((d) => d.autoFixable) && (
                <button
                  type="button"
                  onClick={handleAutoFixFlaggedClasses}
                  disabled={isAutoFixingClasses}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-display font-black bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isAutoFixingClasses ? 'Menyinkronkan...' : 'Perbaiki Otomatis'}</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-xs uppercase font-extrabold">
                <th className="p-3 rounded-l-xl">
                  <button
                    type="button"
                    onClick={() => handleToggleColumnSort('nama')}
                    className="flex items-center gap-1 hover:text-rose-700 cursor-pointer uppercase font-extrabold"
                    title="Klik untuk mengurutkan Nama A-Z / Z-A"
                  >
                    <span>Foto & Siswa</span>
                    {sortBy === 'nama-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-rose-600" />
                    ) : sortBy === 'nama-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-3">
                  <button
                    type="button"
                    onClick={() => handleToggleColumnSort('nisn')}
                    className="flex items-center gap-1 hover:text-rose-700 cursor-pointer uppercase font-extrabold"
                    title="Klik untuk mengurutkan berdasarkan NISN"
                  >
                    <span>NIK & NISN</span>
                    {sortBy === 'nisn-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-rose-600" />
                    ) : sortBy === 'nisn-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-3">
                  <button
                    type="button"
                    onClick={() => handleToggleColumnSort('jk')}
                    className="flex items-center gap-1 hover:text-rose-700 cursor-pointer uppercase font-extrabold"
                    title="Klik untuk mengurutkan berdasarkan Jenis Kelamin"
                  >
                    <span>JK / TTL</span>
                    {sortBy === 'jk-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-rose-600" />
                    ) : sortBy === 'jk-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-3">Kebutuhan Khusus</th>
                <th className="p-3">Orang Tua & Alamat</th>
                <th className="p-3">
                  <button
                    type="button"
                    onClick={() => handleToggleColumnSort('kelas')}
                    className="flex items-center gap-1 hover:text-rose-700 cursor-pointer uppercase font-extrabold"
                    title="Klik untuk mengurutkan berdasarkan Kelas"
                  >
                    <span>Pindah Kelas</span>
                    {sortBy === 'kelas-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-rose-600" />
                    ) : sortBy === 'kelas-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-3">Username & Pass</th>
                <th className="p-3 rounded-r-xl text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-3">
                      <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                        <Users className="w-6 h-6" />
                      </div>
                      <div className="font-display font-bold text-slate-800 text-sm">
                        {searchQuery
                          ? `Tidak ditemukan peserta didik dengan kata kunci "${searchQuery}"`
                          : `Belum ada data peserta didik untuk ${selectedFilterClass === 'SEMUA' ? 'semua kelas' : selectedFilterClass}`}
                      </div>
                      <p className="text-xs text-slate-500">
                        {students.length > 0 && selectedFilterClass !== 'SEMUA'
                          ? `Terdapat ${students.length} peserta didik di kelas lain. Anda dapat melihat semua kelas atau mengimpor file Excel.`
                          : 'Silakan klik tombol "Import Siswa (.XLSX)" di atas atau isi formulir untuk menambahkan peserta didik.'}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        {selectedFilterClass !== 'SEMUA' && students.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedFilterClass('SEMUA')}
                            className="text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 px-3 py-1.5 rounded-xl transition cursor-pointer"
                          >
                            Tampilkan Semua Kelas ({students.length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" /> Import Siswa (.XLSX)
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => {
                  const studentFlag = classValidationReport.flaggedStudentMap[s.id];
                  const todayRec = resolvedAttendanceMap[`${todayDateStr}_${s.id}`];
                  const attendanceStatusForWa: 'H' | 'S' | 'I' | 'A' =
                    todayRec?.status || 'H';
                  const waProofLink = buildParentAttendanceWhatsAppLink({
                    student: s,
                    date: todayDateStr,
                    time: todayRec?.time || getLocalTimeStr(new Date(), false),
                    status: attendanceStatusForWa,
                    methodLabel: todayRec
                      ? 'Presensi Harian Tercatat'
                      : 'Konfirmasi Kehadiran (Data Siswa)',
                  });
                  return (
                  <tr
                    key={s.id}
                    className={
                      studentFlag
                        ? studentFlag.highestSeverity === 'error'
                          ? 'bg-rose-50/70 hover:bg-rose-50'
                          : 'bg-amber-50/60 hover:bg-amber-50'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={s.fotoUrl}
                          alt={s.nama}
                          onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 cursor-zoom-in"
                        />
                        <div>
                          <div className="font-bold text-slate-800 flex flex-wrap items-center gap-1.5">
                            <span>{s.nama}</span>
                            {studentFlag && (
                              <span
                                title={studentFlag.reasons.join(' | ')}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                  studentFlag.highestSeverity === 'error'
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-amber-500 text-white'
                                }`}
                              >
                                <AlertTriangle className="w-2.5 h-2.5" /> Ter-Flag
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-rose-700 font-bold">{s.barcodeId}</div>
                          {studentFlag && (
                            <div className="text-[10px] font-semibold text-rose-700 mt-0.5 max-w-[240px]">
                              {studentFlag.reasons[0]}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-mono text-xs font-bold text-slate-700">NIK: {s.nik || '-'}</div>
                      <div className="font-mono text-[11px] text-slate-500">NISN: {s.nisn}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-800">
                        {s.jenisKelamin === 'P' ? 'Perempuan (P)' : 'Laki-Laki (L)'} • {s.agama}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {s.tempatLahir || '-'}, {s.tanggalLahir || '-'}
                      </div>
                    </td>
                    <td className="p-3 max-w-[200px]">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                          isSiswaInklusi(s.kebutuhanKhusus)
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {s.kebutuhanKhusus || 'Tidak Ada (Reguler)'}
                      </span>
                    </td>
                    <td className="p-3 max-w-[210px]">
                      <div className="text-xs text-slate-700 font-semibold truncate">
                        Ayah: {s.namaAyah || '-'} | Ibu: {s.namaIbu || '-'}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] font-mono">
                        <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                        {s.noTelpOrtu ? (
                          <span className="font-bold text-emerald-700">{s.noTelpOrtu}</span>
                        ) : (
                          <span className="text-slate-400 italic font-sans">No. WA Ortu belum diisi</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5" title={s.alamat}>
                        {s.alamat || '-'}
                      </div>
                    </td>
                    <td className="p-3">
                      <select
                        value={s.kelas}
                        onChange={(e) => handleClassChange(s.id, e.target.value)}
                        className="px-2 py-1 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                      >
                        {CLASSES_LIST.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      <div className="font-bold text-slate-700">{s.username}</div>
                      <div className="text-slate-500">{s.password}</div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {waProofLink.url ? (
                          <a
                            href={waProofLink.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              showToast(
                                `Membuka WhatsApp konfirmasi kehadiran untuk ${s.nama} (${s.noTelpOrtu})`,
                                'success'
                              )
                            }
                            className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold inline-flex items-center gap-1 shadow-2xs transition whitespace-nowrap"
                            title={`Kirim WhatsApp konfirmasi kehadiran ke orang tua (${s.noTelpOrtu})`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Kirim WA</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudent({ ...s });
                              showToast(
                                `No. Telpon / WA orang tua ${s.nama} belum diisi. Silakan lengkapi di form edit.`,
                                'error'
                              );
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-amber-50 text-slate-500 hover:text-amber-700 border border-slate-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                            title="No. Telpon / WA Orang Tua belum diisi — klik untuk mengisi"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Kirim WA</span>
                          </button>
                        )}
                        {isKelas6Class(s.kelas) && (
                          <button
                            type="button"
                            onClick={() => handleOpenGraduateModal([s.id])}
                            className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                            title="Luluskan Siswa Kelas 6 Ini ke Portal Alumni"
                          >
                            <GraduationCap className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingStudent({ ...s })}
                          className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 cursor-pointer"
                          title="Edit / Detail Siswa"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingStudent(s)}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Hapus Siswa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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

      {/* Modal Konfirmasi Hapus 1 Siswa */}
      {deletingStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display font-black text-base text-slate-900">
                  Hapus Data Siswa?
                </h3>
                <p className="text-xs text-slate-500">Tindakan ini menghapus data secara permanen.</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs space-y-1">
              <div className="font-bold text-slate-800">{deletingStudent.nama}</div>
              <div className="text-slate-600 font-mono">
                NISN: {deletingStudent.nisn} • {deletingStudent.kelas}
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Data siswa ini akan dihapus langsung dari database Firebase Firestore dan tidak akan muncul kembali.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingStudent(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteSingleStudent}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Permanen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kelulusan Siswa Kelas 6 */}
      {isGraduateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border-2 border-emerald-200 space-y-4 my-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-black text-base sm:text-lg text-slate-900">
                    Luluskan Peserta Didik Kelas 6
                  </h3>
                  <p className="text-xs text-slate-500">
                    Arsipkan lulusan Kelas 6 beserta riwayat nilai ASAJ/Ijazah ke Portal Alumni.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isGraduating}
                onClick={() => setIsGraduateModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadata Kelulusan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tahun Pelajaran / Tahun Lulus</label>
                <input
                  type="text"
                  value={gradTahunLulus}
                  onChange={(e) => setGradTahunLulus(e.target.value)}
                  placeholder="2026/2027"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tanggal Kelulusan</label>
                <input
                  type="date"
                  value={gradTanggalLulus}
                  onChange={(e) => setGradTanggalLulus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                />
              </div>
            </div>

            {/* Filter & Select All Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={gradFilterClass}
                  onChange={(e) => setGradFilterClass(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
                >
                  <option value="SEMUA">Semua Kelas 6 ({grade6Students.length})</option>
                  {grade6Classes.map((c) => (
                    <option key={c} value={c}>
                      {c} ({grade6Students.filter((s) => s.kelas === c).length})
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={gradSearch}
                    onChange={(e) => setGradSearch(e.target.value)}
                    placeholder="Cari nama/NISN..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white w-44"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(gradSelectedIds);
                    visibleGradCandidates.forEach((s) => next.add(s.id));
                    setGradSelectedIds(next);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-extrabold cursor-pointer"
                >
                  Pilih Tampil ({visibleGradCandidates.length})
                </button>
                <button
                  type="button"
                  onClick={() => setGradSelectedIds(new Set())}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            {/* Checklist Siswa Kelas 6 */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              {gradLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Memuat data siswa Kelas 6, nilai ASAJ, dan status arsip alumni...
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {visibleGradCandidates.map((s) => {
                    const checked = gradSelectedIds.has(s.id);
                    const docId = s.nisn
                      ? `alu_${String(s.nisn).replace(/[^a-zA-Z0-9_-]/g, '')}`
                      : `alu_${String(s.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
                    const alreadyInAlumni = Boolean(
                      gradExistingAlumniMap[docId] ||
                        gradExistingAlumniMap[`src_${s.id}`] ||
                        (s.nisn ? gradExistingAlumniMap[`nisn_${s.nisn.trim()}`] : false)
                    );
                    const hasAsaj = Boolean(
                      gradAsajByKey[s.id] || (s.nisn ? gradAsajByKey[`nisn_${s.nisn.trim()}`] : false)
                    );
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center justify-between gap-3 p-3 text-xs cursor-pointer transition ${
                          checked ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = new Set(gradSelectedIds);
                              if (checked) next.delete(s.id);
                              else next.add(s.id);
                              setGradSelectedIds(next);
                            }}
                            className="w-4 h-4 accent-emerald-600 rounded shrink-0"
                          />
                          <img
                            src={s.fotoUrl}
                            alt={s.nama}
                            className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate">{s.nama}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              NISN: {s.nisn || '-'} • {s.kelas}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasAsaj && (
                            <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold">
                              Nilai ASAJ Siap
                            </span>
                          )}
                          {alreadyInAlumni && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                              Sudah di Alumni
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                  {visibleGradCandidates.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Tidak ada siswa Kelas 6 yang cocok dengan filter pencarian.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Option: Remove from active Class 6 list after archiving */}
            <label className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 cursor-pointer">
              <input
                type="checkbox"
                checked={gradRemoveFromActive}
                onChange={(e) => setGradRemoveFromActive(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-emerald-600 rounded shrink-0"
              />
              <span>
                <strong>Keluarkan dari daftar siswa aktif Kelas 6</strong> setelah diarsipkan ke Portal Alumni
                (nonaktifkan centang ini bila hanya ingin menyalin data ke Portal Alumni sambil tetap mempertahankan siswa di Kelas 6).
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-600">
                Terpilih: <strong className="text-emerald-700">{gradSelectedIds.size} siswa</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isGraduating}
                  onClick={() => setIsGraduateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isGraduating || gradSelectedIds.size === 0}
                  onClick={handleConfirmGraduate}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-display font-extrabold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  {isGraduating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Memproses Kelulusan...</span>
                    </>
                  ) : (
                    <>
                      <GraduationCap className="w-4 h-4" />
                      <span>Luluskan ({gradSelectedIds.size} Siswa)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Massal Siswa */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display font-black text-base text-slate-900">
                  Hapus {filteredStudents.length} Data Siswa?
                </h3>
                <p className="text-xs text-slate-500">
                  Filter aktif: {selectedFilterClass === 'SEMUA' ? 'Semua Kelas' : selectedFilterClass}
                  {searchQuery ? ` (pencarian "${searchQuery}")` : ''}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Seluruh <strong>{filteredStudents.length} data siswa</strong> yang sedang ditampilkan di tabel akan dihapus secara permanen dari Firebase Firestore menggunakan batch delete.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsBulkDeleteOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteBulkStudents}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus {filteredStudents.length} Siswa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit / Detail Siswa */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display font-black text-lg text-slate-800 flex items-center gap-2">
                <Edit className="w-5 h-5 text-sky-600" /> Edit Detail Siswa: {editingStudent.nama}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStudent} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    value={editingStudent.nama}
                    onChange={(e) => setEditingStudent({ ...editingStudent, nama: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Jenis Kelamin</label>
                  <select
                    value={editingStudent.jenisKelamin || 'L'}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, jenisKelamin: e.target.value as 'L' | 'P' })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  >
                    <option value="L">Laki-Laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tempat Lahir</label>
                  <input
                    type="text"
                    value={editingStudent.tempatLahir || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, tempatLahir: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={editingStudent.tanggalLahir || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, tanggalLahir: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">NIK (16 Digit)</label>
                  <input
                    type="text"
                    value={editingStudent.nik || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, nik: e.target.value })}
                    maxLength={16}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">NISN (10 Digit)</label>
                  <input
                    type="text"
                    value={editingStudent.nisn}
                    onChange={(e) => setEditingStudent({ ...editingStudent, nisn: e.target.value })}
                    required
                    maxLength={10}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Agama</label>
                  <select
                    value={editingStudent.agama}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, agama: e.target.value as ReligionType })
                    }
                    className="w-full px-3 py-2 rounded-xl border-2 border-rose-500 font-bold bg-rose-50 text-rose-900"
                  >
                    <option value="Islam">Islam (PAIBP)</option>
                    <option value="Kristen">Kristen (PAKBP)</option>
                    <option value="Katolik">Katolik (PAKat)</option>
                    <option value="Buddha">Buddha (PABBP)</option>
                    <option value="Hindu">Hindu (PAHBP)</option>
                    <option value="Konghucu">Konghucu (PAKBBP)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kebutuhan Khusus</label>
                  <select
                    value={editingStudent.kebutuhanKhusus || 'Tidak Ada (Reguler)'}
                    onChange={(e) => setEditingStudent({ ...editingStudent, kebutuhanKhusus: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-amber-400 font-bold bg-amber-50 text-amber-900"
                  >
                    {KEBUTUHAN_KHUSUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nama Ayah</label>
                  <input
                    type="text"
                    value={editingStudent.namaAyah || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, namaAyah: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nama Ibu</label>
                  <input
                    type="text"
                    value={editingStudent.namaIbu || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, namaIbu: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-emerald-700 block mb-1">
                    No. Telpon / WhatsApp Orang Tua (untuk Bukti Kehadiran WA)
                  </label>
                  <input
                    type="tel"
                    value={editingStudent.noTelpOrtu || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, noTelpOrtu: e.target.value })}
                    placeholder="0812xxxxxxxx atau 62812xxxxxxxx"
                    className="w-full px-3 py-2 rounded-xl border border-emerald-400 bg-emerald-50/40 font-mono font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">Alamat Lengkap</label>
                  <input
                    type="text"
                    value={editingStudent.alamat || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, alamat: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Username Login</label>
                  <input
                    type="text"
                    value={editingStudent.username}
                    onChange={(e) => setEditingStudent({ ...editingStudent, username: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Password Login</label>
                  <input
                    type="text"
                    value={editingStudent.password}
                    onChange={(e) => setEditingStudent({ ...editingStudent, password: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">Ganti Foto Siswa</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, true)}
                    className="w-full text-xs text-slate-600 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-sky-600 file:text-white cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" /> Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grid Kartu Barcode Siswa with 2 Logos (Kemendikbud & Sekolah Monas) */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-extrabold text-lg text-slate-800 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-rose-600" /> Kartu Barcode Absensi Siswa ({selectedFilterClass === 'SEMUA' ? 'Semua Kelas' : selectedFilterClass})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedFilterClass}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedFilterClass(val);
                if (val !== 'SEMUA' && onSelectClass) {
                  onSelectClass(val);
                }
              }}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
              title="Pilih kelas untuk tampilan & cetak kartu"
            >
              {CLASSES_LIST.map((c) => (
                <option key={c} value={c}>
                  Kelas {c} ({classStudentCounts[c] || 0})
                </option>
              ))}
              <option value="SEMUA">Semua Kelas ({students.length})</option>
            </select>
            <a
              href={`/kartu-pelajar.html?sekolah=${encodeURIComponent(profile.name)}&tahun=${encodeURIComponent(activeYear)}&kelas=${encodeURIComponent(selectedFilterClass === 'SEMUA' ? activeClass : selectedFilterClass)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Cetak Satuan (KTP 85,6×53,98mm)
            </a>
            <button
              type="button"
              onClick={() => setIsBatchPrintOpen(true)}
              className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" /> Cetak Satu Lembar Per Kelas
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredStudents.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-3xl p-5 shadow-md border-2 border-slate-200 relative overflow-hidden flex flex-col justify-between break-inside-avoid"
            >
              {/* Card Header with 2 Logos */}
              <div className="flex items-center justify-between pb-3 border-b-2 border-rose-500">
                <img
                  src={profile.logoKemendikbudUrl}
                  alt="Logo Kemendikbud"
                  className="w-10 h-10 object-contain p-0.5 bg-white rounded-xl border border-sky-400"
                />
                <div className="text-center px-1">
                  <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider block">
                    KARTU ABSENSI SISWA
                  </span>
                  <div className="font-display font-black text-xs text-slate-900 leading-tight">
                    {profile.name}
                  </div>
                  <span className="text-[9px] text-slate-500 font-semibold block">{profile.kota}</span>
                </div>
                <img
                  src={profile.logoSekolahUrl}
                  alt="Logo Sekolah"
                  className="w-10 h-10 object-contain p-0.5 bg-white rounded-xl border border-rose-400"
                />
              </div>

              {/* Card Body */}
              <div className="flex items-center gap-4 my-4">
                <img
                  src={s.fotoUrl}
                  alt={s.nama}
                  onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                  className="w-16 h-20 rounded-xl object-cover border-2 border-slate-300 shadow-xs cursor-zoom-in shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-display font-black text-sm text-slate-900 truncate">{s.nama}</div>
                  <div className="text-xs text-slate-600 font-bold">
                    NISN: <span className="font-mono">{s.nisn}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Kelas: <strong>{s.kelas}</strong>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Agama: <strong>{s.agama}</strong>
                  </div>
                </div>
              </div>

              {/* Akses Login Siswa (User & Password) */}
              <div className="mb-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2 text-[11px]">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 block">
                    User
                  </span>
                  <span className="font-mono font-bold text-slate-900 truncate block" title={s.username}>
                    {s.username || '-'}
                  </span>
                </div>
                <div className="min-w-0 border-l border-slate-200 pl-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 block">
                    Password
                  </span>
                  <span className="font-mono font-bold text-rose-700 truncate block" title={s.password}>
                    {s.password || '-'}
                  </span>
                </div>
              </div>

              {/* Barcode Canvas */}
              <div className="pt-2 border-t border-slate-100 flex flex-col items-center justify-center bg-white rounded-2xl p-2">
                <canvas id={`barcode_canvas_${s.id}`} className="max-w-full h-auto"></canvas>
                <a
                  href={`/kartu-pelajar.html?sekolah=${encodeURIComponent(profile.name)}&nama=${encodeURIComponent(s.nama)}&nisn=${encodeURIComponent(s.nisn || s.barcodeId)}&kelas=${encodeURIComponent(s.kelas)}&tahun=${encodeURIComponent(activeYear)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="print:hidden mt-1.5 text-[11px] font-bold text-sky-700 hover:text-sky-900 hover:underline flex items-center gap-1"
                >
                  <Printer className="w-3 h-3" /> Cetak Ukuran KTP (85,6 × 53,98 mm)
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Cetak Massal Kartu Barcode Satu Lembar Per Kelas */}
      <BarcodePrintModal
        isOpen={isBatchPrintOpen}
        onClose={() => setIsBatchPrintOpen(false)}
        students={students}
        profile={profile}
        initialClass={selectedFilterClass === 'SEMUA' ? activeClass : selectedFilterClass}
        activeYear={activeYear}
      />
    </section>
  );
};
