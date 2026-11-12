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
} from 'lucide-react';
import { Student, SchoolProfile, ReligionType, KEBUTUHAN_KHUSUS_OPTIONS, isSiswaInklusi } from '../../types';
import {
  downloadTemplateStudentsXLSX,
  exportStudentsToXLSX,
  parseImportStudentsXLSX,
  generateAccountUsername,
} from '../../utils/excel';
import { renderBarcodeToCanvas } from '../../utils/barcode';
import { CLASSES_LIST, ACADEMIC_YEARS } from '../../utils/storage';
import {
  saveStudentsToFirestoreBatch,
  saveSingleStudentToFirestore,
  deleteStudentFromFirestore,
  deleteMultipleStudentsFromFirestore,
} from '../../utils/studentFirestore';

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
  const [newAlamat, setNewAlamat] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('123');
  const [newFoto, setNewFoto] = useState('https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150');

  // Loading state proses import
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importStatusMessage, setImportStatusMessage] = useState<string>('');

  // Filter kelas, pencarian & pengurutan siswa (default A -> Z)
  const [selectedFilterClass, setSelectedFilterClass] = useState<string>(activeClass);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<StudentSortOption>('nama-asc');

  // State konfirmasi hapus (menghindari window.confirm yang diblokir iframe)
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

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

  const filteredStudents = useMemo(() => {
    const filtered = students.filter((s) => {
      const matchesClass = selectedFilterClass === 'SEMUA' ? true : s.kelas === selectedFilterClass;
      if (!matchesClass) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        s.nama.toLowerCase().includes(q) ||
        s.nisn.toLowerCase().includes(q) ||
        (s.nik && s.nik.toLowerCase().includes(q)) ||
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
  }, [students, selectedFilterClass, searchQuery, sortBy]);

  const handleToggleColumnSort = (col: 'nama' | 'nisn' | 'jk' | 'kelas') => {
    setSortBy((prev) => {
      if (col === 'nama') return prev === 'nama-asc' ? 'nama-desc' : 'nama-asc';
      if (col === 'nisn') return prev === 'nisn-asc' ? 'nisn-desc' : 'nisn-asc';
      if (col === 'jk') return prev === 'jk-asc' ? 'jk-desc' : 'jk-asc';
      if (col === 'kelas') return prev === 'kelas-asc' ? 'kelas-desc' : 'kelas-asc';
      return 'nama-asc';
    });
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

            <div className="lg:col-span-2">
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
                {CLASSES_LIST.map((c) => (
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
                filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={s.fotoUrl}
                          alt={s.nama}
                          onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 cursor-zoom-in"
                        />
                        <div>
                          <div className="font-bold text-slate-800">{s.nama}</div>
                          <div className="text-[11px] font-mono text-rose-700 font-bold">{s.barcodeId}</div>
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
                    <td className="p-3 max-w-[180px]">
                      <div className="text-xs text-slate-700 font-semibold truncate">
                        Ayah: {s.namaAyah || '-'} | Ibu: {s.namaIbu || '-'}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate" title={s.alamat}>
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
                ))
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
            <QrCode className="w-5 h-5 text-rose-600" /> Kartu Barcode Absensi Siswa ({activeClass})
          </h3>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Cetak Kartu Barcode
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredStudents.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-3xl p-5 shadow-md border-2 border-slate-200 relative overflow-hidden flex flex-col justify-between"
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

              {/* Barcode Canvas */}
              <div className="pt-2 border-t border-slate-100 flex flex-col items-center justify-center bg-white rounded-2xl p-2">
                <canvas id={`barcode_canvas_${s.id}`} className="max-w-full h-auto"></canvas>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
