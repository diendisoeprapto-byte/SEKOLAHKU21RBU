import React, { useState } from 'react';
import {
  Compass,
  Target,
  CheckSquare,
  Award,
  Sprout,
  Plus,
  Save,
  Check,
  CheckCircle2,
  RotateCcw,
  User,
  Sparkles,
  Edit2,
  Trash2,
  X,
  Calendar,
  Clock,
} from 'lucide-react';
import { Subject, Student, Teacher } from '../../types';
import { saveStoredSubjects, getStoredTeachers } from '../../utils/storage';

interface Props {
  subType: 'cp' | 'tp' | 'kktp' | 'ekskul' | 'kokurikuler';
  subjects: Subject[];
  teachers?: Teacher[];
  onUpdateSubjects?: (updated: Subject[]) => void;
  activeClass: string;
  students?: Student[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

interface DimensiItem {
  id: string;
  no: number;
  judul: string;
  tag: string;
  elemen: string;
  checked: boolean;
}

export const KurikulumTabs: React.FC<Props> = ({
  subType,
  subjects,
  teachers,
  onUpdateSubjects,
  activeClass,
  students = [],
  showToast,
}) => {
  const teacherList = teachers && teachers.length > 0 ? teachers : getStoredTeachers();
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.id || '');
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) || subjects[0];

  // CP Editing & Adding States
  const [isEditingCp, setIsEditingCp] = useState(false);
  const [cpEditText, setCpEditText] = useState('');
  const [isAddCpModalOpen, setIsAddCpModalOpen] = useState(false);
  const [newCpCode, setNewCpCode] = useState('');
  const [newCpName, setNewCpName] = useState('');
  const [newCpDescription, setNewCpDescription] = useState('');
  const [isCustomMapel, setIsCustomMapel] = useState(false);
  const [customMapelName, setCustomMapelName] = useState('');

  // TP Editing & Adding States
  const [isAddTpModalOpen, setIsAddTpModalOpen] = useState(false);
  const [newTpText, setNewTpText] = useState('');
  const [editingTpIndex, setEditingTpIndex] = useState<number | null>(null);
  const [editingTpText, setEditingTpText] = useState('');

  // Ekstrakurikuler list with persistence
  const [ekskulList, setEkskulList] = useState<Array<{ id?: string; nama: string; pembina: string; hari: string; waktu: string }>>(() => {
    const saved = localStorage.getItem('sekolahku_ekskul_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return [
      { id: 'ek_1', nama: 'Pramuka Siaga / Penggalang', pembina: 'Budi Santoso, M.Pd.', hari: 'Jumat', waktu: '13.00 - 15.00 WIB' },
      { id: 'ek_2', nama: 'Seni Tari Tradisional Betawi', pembina: 'Hj. Siti Aminah, S.Pd.', hari: 'Sabtu', waktu: '08.00 - 10.00 WIB' },
      { id: 'ek_3', nama: 'Dokter Kecil / PMR SD', pembina: 'Dewi Lestari, S.Pd.', hari: 'Sabtu', waktu: '10.00 - 11.30 WIB' },
      { id: 'ek_4', nama: 'Futsal & Olahraga Atletik', pembina: 'Budi Santoso, M.Pd.', hari: 'Selasa', waktu: '15.00 - 17.00 WIB' },
      { id: 'ek_5', nama: 'Seni Musik & Marawis', pembina: 'Ahmad Fauzi, S.Pd.I', hari: 'Kamis', waktu: '14.00 - 15.30 WIB' },
    ];
  });
  const [newEkskulNama, setNewEkskulNama] = useState('');
  const [newEkskulPembina, setNewEkskulPembina] = useState('');
  const [newEkskulHari, setNewEkskulHari] = useState('Jumat');
  const [newEkskulWaktu, setNewEkskulWaktu] = useState('13.00 - 15.00 WIB');

  // -------------------------------------------------------------
  // KOKURIKULER (P5) STATES (FAITHFUL TO USER IMAGE 2)
  // -------------------------------------------------------------
  const [temaProyek, setTemaProyek] = useState(
    'Gerakan 7 Kebiasaan Anak Indonesia Hebat & Gaya Hidup Berkelanjutan'
  );
  const [namaProyek, setNamaProyek] = useState('Napas Hijau: Tanam, Kompos, Lestari!');
  const [deskripsiProyek, setDeskripsiProyek] = useState(
    'Peserta didik melaksanakan kegiatan penghijauan lingkungan sekolah, pengelolaan sampah organik menjadi kompos, serta pembiasaan karakter 7 Kebiasaan Anak Indonesia Hebat secara kolaboratif.'
  );

  // 8 Dimensi Profil Pelajar Pancasila matching Image 2
  const [dimensiList, setDimensiList] = useState<DimensiItem[]>([
    {
      id: 'dim_1',
      no: 1,
      judul: '1. Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia',
      tag: 'Keimanan dan Ketakwaan terhadap Tuhan Yang Maha Esa',
      elemen: 'Elemen Akhlak Beragama: Mengenali sifat-sifat Tuhan dan memahami ajaran agama/kepercayaannya.',
      checked: true,
    },
    {
      id: 'dim_2',
      no: 2,
      judul: '2. Berkebinekaan Global',
      tag: 'Kewargaan',
      elemen: 'Elemen Mengenal dan Menghargai Budaya: Mengenali identitas diri, kebiasaan budaya, dan keragaman budaya di Indonesia maupun dunia.',
      checked: false,
    },
    {
      id: 'dim_3',
      no: 3,
      judul: '3. Bergotong Royong',
      tag: 'Kolaborasi',
      elemen: 'Elemen Kolaborasi: Mampu bekerja bersama-sama dengan orang lain untuk mencapai tujuan bersama yang dicanangkan.',
      checked: true,
    },
    {
      id: 'dim_4',
      no: 4,
      judul: '4. Mandiri',
      tag: 'Kemandirian',
      elemen: 'Elemen Kesadaran Diri dan Situasi yang Dihadapi: Mengenali emosi, kekuatan, serta kelemahan diri sendiri dan menyadari kebutuhan belajarnya.',
      checked: false,
    },
    {
      id: 'dim_5',
      no: 5,
      judul: '5. Bernalar Kritis',
      tag: 'Penalaran Kritis',
      elemen: 'Elemen Memperoleh dan Memproses Informasi/Gagasan: Mengajukan pertanyaan, mencari, dan mengolah informasi dari berbagai sumber.',
      checked: true,
    },
    {
      id: 'dim_6',
      no: 6,
      judul: '6. Kreatif',
      tag: 'Kreativitas',
      elemen: 'Elemen Menghasilkan Gagasan yang Orisinal: Mampu mencetuskan ide-ide baru atau cara-cara baru dalam menyelesaikan masalah.',
      checked: true,
    },
    {
      id: 'dim_7',
      no: 7,
      judul: '7. Kesehatan Jasmani, Rohani & Hidup Bersih',
      tag: 'Kesehatan',
      elemen: 'Elemen Pembiasaan Hidup Sehat: Menjaga kebugaran tubuh, memilih makanan bergizi seimbang, istirahat cukup, dan menerapkan Gerakan 7 Kebiasaan Anak Indonesia Hebat.',
      checked: false,
    },
    {
      id: 'dim_8',
      no: 8,
      judul: '8. Komunikasi Efektif & Santun',
      tag: 'Komunikasi',
      elemen: 'Elemen Menyampaikan Gagasan & Menyimak Aktif: Mampu menyampaikan pendapat secara lisan maupun tulisan dengan bahasa yang santun, runtut, dan menghargai lawan bicara.',
      checked: false,
    },
  ]);

  // Dropdown selector state inside Card 1
  const [selectedDimensiDropdown, setSelectedDimensiDropdown] = useState('dim_1');

  // Student assessment state
  const classStudents = students.filter((s) => s.kelas === activeClass);
  const activeStudentList = classStudents.length > 0 ? classStudents : students;
  const [selectedStudentId, setSelectedStudentId] = useState(
    activeStudentList[0]?.id || 'std_01'
  );

  const selectedStudent =
    activeStudentList.find((s) => s.id === selectedStudentId) ||
    activeStudentList[0] || {
      id: 'std_demo',
      nama: 'AIRA RAHMA NUR MAULIDA',
      nisn: '0123456789',
      kelas: activeClass,
      barcodeId: 'SDN21-6B-001',
      fotoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
    };

  // Student ratings: studentId_dimensiId -> 'MB' | 'SB' | 'BSH' | 'SAB'
  const [ratings, setRatings] = useState<Record<string, string>>({
    [`${selectedStudent.id}_dim_1`]: 'BSH',
    [`${selectedStudent.id}_dim_3`]: 'BSH',
    [`${selectedStudent.id}_dim_5`]: 'SAB',
    [`${selectedStudent.id}_dim_6`]: 'BSH',
  });

  const [studentNotes, setStudentNotes] = useState<Record<string, string>>({});
  const currentStudentNote =
    studentNotes[selectedStudent.id] ??
    `Ananda ${selectedStudent.nama} menunjukkan partisipasi aktif, antusiasme tinggi, serta kolaborasi yang sangat baik dalam menyelesaikan proyek kokurikuler dan pembiasaan Profil Pelajar Pancasila semester ini.`;

  const activeCheckedDimensions = dimensiList.filter((d) => d.checked);

  // Toggle single dimension checkbox
  const handleToggleDimensi = (dimId: string) => {
    setDimensiList((prev) =>
      prev.map((d) => (d.id === dimId ? { ...d, checked: !d.checked } : d))
    );
  };

  // Ceklis Semua
  const handleCheckAll = () => {
    setDimensiList((prev) => prev.map((d) => ({ ...d, checked: true })));
    showToast('Seluruh 8 Dimensi berhasil diceklis!', 'success');
  };

  // Reset Default (4 Dimensi)
  const handleResetDefaultDimensi = () => {
    const defaults = ['dim_1', 'dim_3', 'dim_5', 'dim_6'];
    setDimensiList((prev) =>
      prev.map((d) => ({ ...d, checked: defaults.includes(d.id) }))
    );
    showToast('Dimensi berhasil di-reset ke standar 4 Dimensi!', 'success');
  };

  // Terapkan & Ceklis from dropdown
  const handleApplyDropdownDimensi = () => {
    setDimensiList((prev) =>
      prev.map((d) => (d.id === selectedDimensiDropdown ? { ...d, checked: true } : d))
    );
    showToast('Dimensi berhasil diterapkan dan diceklis!', 'success');
  };

  // Set Semua Mahir (BSH)
  const handleSetSemuaMahir = () => {
    const newRatings = { ...ratings };
    activeCheckedDimensions.forEach((dim) => {
      newRatings[`${selectedStudent.id}_${dim.id}`] = 'BSH';
    });
    setRatings(newRatings);
    showToast(`Seluruh dimensi aktif untuk ${selectedStudent.nama} diset BSH (Mahir)!`, 'success');
  };

  // Save assessment for current student
  const handleSaveStudentAssessment = () => {
    showToast(`Penilaian Kokurikuler ${selectedStudent.nama} berhasil disimpan ke e-Rapor!`, 'success');
  };

  const handleAddEkskul = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEkskulNama.trim()) {
      showToast('Harap masukkan nama ekstrakurikuler!', 'error');
      return;
    }
    const pembinaToSave = newEkskulPembina || (teacherList[0]?.nama ?? 'Budi Santoso, M.Pd.');
    const newItem = {
      id: `ek_${Date.now()}`,
      nama: newEkskulNama.trim(),
      pembina: pembinaToSave,
      hari: newEkskulHari,
      waktu: newEkskulWaktu.trim() || '13.00 - 15.00 WIB',
    };
    const updated = [...ekskulList, newItem];
    setEkskulList(updated);
    localStorage.setItem('sekolahku_ekskul_list', JSON.stringify(updated));
    setNewEkskulNama('');
    setNewEkskulPembina('');
    showToast(`Ekstrakurikuler ${newItem.nama} berhasil ditambahkan!`, 'success');
  };

  const handleDeleteEkskul = (index: number, nama: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus ekstrakurikuler "${nama}"?`)) {
      const updated = ekskulList.filter((_, i) => i !== index);
      setEkskulList(updated);
      localStorage.setItem('sekolahku_ekskul_list', JSON.stringify(updated));
      showToast(`Ekstrakurikuler ${nama} berhasil dihapus!`, 'success');
    }
  };

  // Handlers for CP & TP editing & adding
  const handleSaveCpEdit = () => {
    const updated = subjects.map((s) => {
      if (s.id === selectedSubjectId) {
        return {
          ...s,
          description: cpEditText,
        };
      }
      return s;
    });
    saveStoredSubjects(updated);
    onUpdateSubjects?.(updated);
    setIsEditingCp(false);
    showToast(`Deskripsi Capaian Pembelajaran (CP) untuk ${selectedSubject?.name} berhasil disimpan!`, 'success');
  };

  const handleOpenAddCpModal = () => {
    const currentSub = selectedSubject || subjects[0];
    if (currentSub) {
      setNewCpName(currentSub.name);
      const tpCount = currentSub.tujuanPembelajaran ? currentSub.tujuanPembelajaran.length : 0;
      setNewCpCode(`${currentSub.code}-TP${tpCount + 1}`);
      setNewCpDescription(currentSub.description || '');
    } else {
      setNewCpName('');
      setNewCpCode('');
      setNewCpDescription('');
    }
    setIsCustomMapel(false);
    setCustomMapelName('');
    setIsAddCpModalOpen(true);
  };

  const handleSelectSubjectForCp = (subjName: string) => {
    if (subjName === '__CUSTOM__') {
      setIsCustomMapel(true);
      setNewCpName('');
      setNewCpCode('CUSTOM-TP1');
      setNewCpDescription('');
      return;
    }
    setIsCustomMapel(false);
    setNewCpName(subjName);
    const found = subjects.find((s) => s.name === subjName);
    if (found) {
      const tpCount = found.tujuanPembelajaran?.length || 0;
      setNewCpCode(`${found.code}-TP${tpCount + 1}`);
      setNewCpDescription(found.description || '');
    }
  };

  const handleAddNewCp = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMapelName = isCustomMapel ? customMapelName.trim() : newCpName.trim();
    if (!targetMapelName || !newCpDescription.trim()) {
      showToast('Nama Mata Pelajaran dan Deskripsi CP wajib diisi!', 'error');
      return;
    }

    const existingSubject = subjects.find(
      (s) => s.name.toLowerCase() === targetMapelName.toLowerCase()
    );

    if (existingSubject) {
      // Perbarui CP mata pelajaran yang sudah ada
      const updated = subjects.map((s) => {
        if (s.id === existingSubject.id) {
          return {
            ...s,
            code: newCpCode.trim() || s.code,
            description: newCpDescription.trim(),
          };
        }
        return s;
      });
      saveStoredSubjects(updated);
      onUpdateSubjects?.(updated);
      setSelectedSubjectId(existingSubject.id);
      showToast(`Capaian Pembelajaran (CP) untuk ${existingSubject.name} (${newCpCode.trim() || existingSubject.code}) berhasil diperbarui!`, 'success');
    } else {
      // Tambah Mapel & CP baru
      const code = newCpCode.trim() || targetMapelName.substring(0, 4).toUpperCase();
      const newSubject: Subject = {
        id: `s_custom_${Date.now()}`,
        code: code,
        name: targetMapelName,
        kategori: 'umum',
        kktp: 75,
        description: newCpDescription.trim(),
        tujuanPembelajaran: [
          `Tujuan Pembelajaran 1 untuk ${targetMapelName}`,
        ],
      };
      const updated = [...subjects, newSubject];
      saveStoredSubjects(updated);
      onUpdateSubjects?.(updated);
      setSelectedSubjectId(newSubject.id);
      showToast(`Capaian Pembelajaran (CP) baru untuk ${newSubject.name} (${code}) berhasil ditambahkan!`, 'success');
    }

    setIsAddCpModalOpen(false);
    setNewCpCode('');
    setNewCpName('');
    setNewCpDescription('');
    setIsCustomMapel(false);
    setCustomMapelName('');
  };

  const handleAddNewTp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTpText.trim()) {
      showToast('Teks Tujuan Pembelajaran (TP) tidak boleh kosong!', 'error');
      return;
    }
    const target = selectedSubject;
    if (!target) return;

    const updated = subjects.map((s) => {
      if (s.id === target.id) {
        return {
          ...s,
          tujuanPembelajaran: [...(s.tujuanPembelajaran || []), newTpText.trim()],
        };
      }
      return s;
    });
    saveStoredSubjects(updated);
    onUpdateSubjects?.(updated);
    setIsAddTpModalOpen(false);
    setNewTpText('');
    showToast(`Tujuan Pembelajaran (TP) baru untuk ${target.name} berhasil ditambahkan!`, 'success');
  };

  const handleSaveEditTp = (idx: number) => {
    if (!editingTpText.trim()) return;
    const target = selectedSubject;
    if (!target) return;

    const updated = subjects.map((s) => {
      if (s.id === target.id) {
        const nextTpList = [...(s.tujuanPembelajaran || [])];
        nextTpList[idx] = editingTpText.trim();
        return {
          ...s,
          tujuanPembelajaran: nextTpList,
        };
      }
      return s;
    });
    saveStoredSubjects(updated);
    onUpdateSubjects?.(updated);
    setEditingTpIndex(null);
    setEditingTpText('');
    showToast(`Tujuan Pembelajaran (TP ke-${idx + 1}) berhasil diperbarui!`, 'success');
  };

  const handleDeleteTp = (idx: number) => {
    if (confirm(`Hapus Tujuan Pembelajaran (TP ke-${idx + 1}) ini?`)) {
      const target = selectedSubject;
      if (!target) return;

      const updated = subjects.map((s) => {
        if (s.id === target.id) {
          const nextTpList = (s.tujuanPembelajaran || []).filter((_, i) => i !== idx);
          return {
            ...s,
            tujuanPembelajaran: nextTpList,
          };
        }
        return s;
      });
      saveStoredSubjects(updated);
      onUpdateSubjects?.(updated);
      showToast(`Tujuan Pembelajaran (TP) berhasil dihapus!`, 'success');
    }
  };

  return (
    <section className="space-y-6">
      {/* 3.1 Capaian Pembelajaran (CP) */}
      {subType === 'cp' && (
        <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                Menu 3. Kurikulum & Perangkat
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                <Compass className="w-5 h-5 text-amber-600" /> Capaian Pembelajaran (CP) Kurikulum Merdeka
              </h2>
              <p className="text-xs text-slate-500">
                Fase A (Kelas 1-2), Fase B (Kelas 3-4), dan Fase C (Kelas 5-6) SDN Rawa Badak Utara 21. Dapat diedit & disesuaikan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedSubjectId}
                onChange={(e) => {
                  setSelectedSubjectId(e.target.value);
                  setIsEditingCp(false);
                }}
                className="px-3.5 py-2 rounded-xl border-2 border-amber-500 text-xs font-extrabold bg-white outline-none shadow-2xs"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleOpenAddCpModal}
                className="bg-amber-600 hover:bg-amber-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
              >
                <Plus className="w-4 h-4" /> + Tambah CP / Mapel
              </button>
            </div>
          </div>

          {/* CP Detail & Edit Card */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold text-slate-500">Mata Pelajaran:</span>
                <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                  <span>{selectedSubject?.name}</span>
                  <span className="text-xs font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md">
                    {selectedSubject?.code}
                  </span>
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                  Fase C ({activeClass})
                </span>
                {!isEditingCp ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCpEditText(selectedSubject?.description || '');
                      setIsEditingCp(true);
                    }}
                    className="bg-white hover:bg-slate-100 text-slate-800 font-display font-black px-3.5 py-1.5 rounded-xl text-xs border border-slate-300 shadow-2xs flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-amber-600" /> Edit CP
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingCp(false)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-3 py-1.5 rounded-xl text-xs cursor-pointer"
                  >
                    Batal
                  </button>
                )}
              </div>
            </div>

            {/* View or Edit mode */}
            {isEditingCp ? (
              <div className="space-y-3 animate-in fade-in">
                <label className="text-xs font-bold text-slate-700 block">
                  Ubah Deskripsi Capaian Pembelajaran (CP) untuk {selectedSubject?.name}:
                </label>
                <textarea
                  rows={6}
                  value={cpEditText}
                  onChange={(e) => setCpEditText(e.target.value)}
                  placeholder="Ketik deskripsi Capaian Pembelajaran (CP) lengkap..."
                  className="w-full p-4 rounded-2xl border-2 border-amber-400 bg-white text-xs text-slate-800 font-medium leading-relaxed outline-none focus:ring-2 focus:ring-amber-200"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingCp(false)}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCpEdit}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" /> Simpan Perubahan CP
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-xs font-extrabold text-amber-900 block uppercase tracking-wide">
                  Deskripsi Capaian Pembelajaran:
                </span>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                  {selectedSubject?.description ||
                    'Peserta didik memahami konsep dasar dan kompetensi inti mata pelajaran sesuai dengan Capaian Pembelajaran Fase C Kurikulum Merdeka.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3.2 Tujuan Pembelajaran (TP) */}
      {subType === 'tp' && (
        <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                Menu 3. Kurikulum & Perangkat
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-600" /> Tujuan Pembelajaran (TP) Berbasis CP
              </h2>
              <p className="text-xs text-slate-500">
                Daftar butir tujuan pembelajaran per lingkup materi ({activeClass}). Guru dapat mengedit, menambah, dan menghapus TP.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedSubjectId}
                onChange={(e) => {
                  setSelectedSubjectId(e.target.value);
                  setEditingTpIndex(null);
                }}
                className="px-3.5 py-2 rounded-xl border-2 border-amber-500 text-xs font-extrabold bg-white outline-none shadow-2xs"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setIsAddTpModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
              >
                <Plus className="w-4 h-4" /> + Tambah TP Baru
              </button>
            </div>
          </div>

          {/* List of TP items with Edit & Delete */}
          <div className="space-y-3">
            {(selectedSubject?.tujuanPembelajaran || []).map((tp: string, idx: number) => {
              const isEditingThis = editingTpIndex === idx;

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border transition ${
                    isEditingThis ? 'bg-amber-50/60 border-amber-400' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {isEditingThis ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-xl bg-amber-600 text-white flex items-center justify-center text-xs font-black shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-700">Edit Tujuan Pembelajaran {idx + 1}:</span>
                      </div>
                      <textarea
                        rows={2}
                        value={editingTpText}
                        onChange={(e) => setEditingTpText(e.target.value)}
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:border-amber-500"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingTpIndex(null)}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEditTp(idx)}
                          className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer shadow-xs"
                        >
                          Simpan TP
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md mr-2">
                            TP {idx + 1}
                          </span>
                          <p className="text-xs sm:text-sm font-semibold text-slate-800 pt-1 leading-relaxed">
                            {tp}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTpIndex(idx);
                            setEditingTpText(tp);
                          }}
                          className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-100/50 rounded-lg transition cursor-pointer"
                          title="Edit TP ini"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTp(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Hapus TP ini"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {(!selectedSubject?.tujuanPembelajaran || selectedSubject.tujuanPembelajaran.length === 0) && (
              <div className="p-8 text-center text-xs text-slate-400 italic bg-slate-50 rounded-2xl border">
                Belum ada butir Tujuan Pembelajaran (TP) untuk mata pelajaran ini. Klik tombol "+ Tambah TP Baru" di atas.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Tambah CP Baru */}
      {isAddCpModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-600" /> Tambah Capaian Pembelajaran (CP) Baru
              </h3>
              <button
                type="button"
                onClick={() => setIsAddCpModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewCp} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Mata Pelajaran / Kompetensi:
                </label>
                <select
                  value={isCustomMapel ? '__CUSTOM__' : newCpName}
                  onChange={(e) => handleSelectSubjectForCp(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                >
                  <option value="">-- Pilih Mata Pelajaran yang Sudah Ada --</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} ({s.code}) — {s.tujuanPembelajaran?.length || 0} TP Terdaftar
                    </option>
                  ))}
                  <option value="__CUSTOM__">+ Tambah Mata Pelajaran Baru Lainnya...</option>
                </select>

                {isCustomMapel && (
                  <div className="mt-2 animate-in fade-in">
                    <input
                      type="text"
                      value={customMapelName}
                      onChange={(e) => {
                        setCustomMapelName(e.target.value);
                        if (!newCpCode || newCpCode.startsWith('CUSTOM')) {
                          setNewCpCode(e.target.value ? e.target.value.substring(0, 4).toUpperCase() + '-TP1' : '');
                        }
                      }}
                      placeholder="Ketik nama mata pelajaran baru..."
                      required
                      className="w-full px-3 py-2 rounded-xl border-2 border-amber-400 text-xs font-bold text-slate-900 focus:outline-none bg-amber-50/30"
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Kode Singkat Mapel:</label>
                  <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                    ⚡ Otomatis sesuai TP ({newCpCode || '-'})
                  </span>
                </div>
                <input
                  type="text"
                  value={newCpCode}
                  onChange={(e) => setNewCpCode(e.target.value)}
                  placeholder="Contoh: PAI-TP4 / KODING-TP1"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold uppercase bg-slate-50 text-slate-800 focus:bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Kode otomatis disesuaikan dengan kode mapel dan urutan TP berikutnya yang ada.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Deskripsi Lengkap CP:</label>
                <textarea
                  rows={4}
                  value={newCpDescription}
                  onChange={(e) => setNewCpDescription(e.target.value)}
                  placeholder="Tuliskan capaian pembelajaran yang diharapkan untuk peserta didik..."
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCpModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black cursor-pointer shadow-sm"
                >
                  Simpan CP Baru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah TP Baru */}
      {isAddTpModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" /> Tambah Tujuan Pembelajaran (TP) Baru
              </h3>
              <button
                type="button"
                onClick={() => setIsAddTpModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewTp} className="space-y-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                Mata Pelajaran: <strong>{selectedSubject?.name}</strong>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Butir Tujuan Pembelajaran (TP Ke-{(selectedSubject?.tujuanPembelajaran?.length || 0) + 1}):
                </label>
                <textarea
                  rows={4}
                  value={newTpText}
                  onChange={(e) => setNewTpText(e.target.value)}
                  placeholder="Contoh: Peserta didik mampu mengidentifikasi dan membedakan jenis-jenis sudut..."
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-medium leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddTpModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer shadow-sm"
                >
                  Simpan TP Baru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3.3 KKTP */}
      {subType === 'kktp' && (
        <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                Menu 3. Kurikulum & Perangkat
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-amber-600" /> KKTP Kurikulum Merdeka ({activeClass})
              </h2>
              <p className="text-xs text-slate-500">
                Kriteria Ketercapaian Tujuan Pembelajaran interval nilai (0-60: Belum Mencapai, 61-74: Cukup, 75-84: Baik, 85-100: Sangat Baik).
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-extrabold border-b">
                <tr>
                  <th className="p-3">Mata Pelajaran</th>
                  <th className="p-3 text-center">KKTP Target</th>
                  <th className="p-3">Interval 0-60</th>
                  <th className="p-3">Interval 61-74</th>
                  <th className="p-3">Interval 75-84</th>
                  <th className="p-3">Interval 85-100</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjects.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-800">{s.name}</td>
                    <td className="p-3 text-center font-mono font-bold text-rose-700">{s.kktp}</td>
                    <td className="p-3 text-slate-500">Perlu Bimbingan</td>
                    <td className="p-3 text-amber-700">Cukup Mampu</td>
                    <td className="p-3 text-sky-700 font-bold">Mampu &amp; Terampil</td>
                    <td className="p-3 text-emerald-700 font-bold">Sangat Mahir</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3.4 Menu Ekstrakurikuler */}
      {subType === 'ekskul' && (
        <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                Menu 3. Kurikulum & Perangkat
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-600" /> Ekstrakurikuler SDN Rawa Badak Utara 21
              </h2>
              <p className="text-xs text-slate-500">
                Kegiatan pengembangan minat, bakat, dan karakter siswa di luar jam pembelajaran intrakurikuler.
              </p>
            </div>
          </div>

          <form onSubmit={handleAddEkskul} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-amber-50/60 p-4 rounded-2xl border border-amber-200">
            <div>
              <label className="block text-[11px] font-black text-slate-700 mb-1">Nama Ekstrakurikuler:</label>
              <input
                type="text"
                value={newEkskulNama}
                onChange={(e) => setNewEkskulNama(e.target.value)}
                placeholder="Contoh: Seni Musik Marawis"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-700 mb-1">Nama Pembina (Dropdown Guru):</label>
              <select
                value={newEkskulPembina}
                onChange={(e) => setNewEkskulPembina(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white focus:border-amber-500 outline-none cursor-pointer"
              >
                <option value="">-- Pilih Guru Pembina --</option>
                {teacherList.map((t) => (
                  <option key={t.id || t.nama} value={t.nama}>
                    {t.nama} ({t.penugasan})
                  </option>
                ))}
                <option value="Pelatih Profesional Luar">Pelatih Profesional Luar / Mitra</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-700 mb-1">Jadwal (Dropdown Hari):</label>
              <select
                value={newEkskulHari}
                onChange={(e) => setNewEkskulHari(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white focus:border-amber-500 outline-none cursor-pointer"
              >
                <option value="Senin">Hari Senin</option>
                <option value="Selasa">Hari Selasa</option>
                <option value="Rabu">Hari Rabu</option>
                <option value="Kamis">Hari Kamis</option>
                <option value="Jumat">Hari Jumat</option>
                <option value="Sabtu">Hari Sabtu</option>
                <option value="Minggu">Hari Minggu</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-700 mb-1">Waktu (Disebelah Jadwal):</label>
              <input
                type="text"
                value={newEkskulWaktu}
                onChange={(e) => setNewEkskulWaktu(e.target.value)}
                placeholder="Contoh: 13.00 - 15.00 WIB"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white focus:border-amber-500 outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-display font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition"
              >
                <Plus className="w-4 h-4" /> Tambah Ekskul
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ekskulList.map((ek, idx) => (
              <div key={ek.id || idx} className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-amber-300 hover:shadow-md transition space-y-2.5 relative group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200">
                    Ekskul {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteEkskul(idx, ek.nama)}
                    className="px-2.5 py-1 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer flex items-center gap-1 text-[11px] font-black"
                    title={`Hapus Ekskul ${ek.nama}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                </div>
                <h4 className="font-display font-black text-sm text-slate-800 leading-snug">{ek.nama}</h4>
                <div className="text-xs text-slate-600 flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <span className="font-extrabold text-amber-700">Pembina:</span>
                  <span className="font-bold text-slate-700 truncate">{ek.pembina}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1 bg-amber-50 text-amber-800 font-extrabold px-2 py-0.5 rounded-lg border border-amber-200/60">
                    <Calendar className="w-3 h-3 text-amber-600" /> {ek.hari}
                  </span>
                  <span className="flex items-center gap-1 bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-lg border border-slate-200">
                    <Clock className="w-3 h-3 text-slate-500" /> {ek.waktu || '13.00 - 15.00 WIB'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3.5 MENU KOKURIKULER (P5) - EXACT MATCH WITH USER'S IMAGE 2     */}
      {/* ============================================================== */}
      {subType === 'kokurikuler' && (
        <div className="space-y-6">
          {/* CARD 1: PENGATURAN NAMA PROYEK, PILIHAN DIMENSI & INDIKATOR (GREEN BORDER MATCHING IMAGE 2) */}
          <div className="bg-white rounded-3xl p-6 border-2 border-emerald-400 shadow-sm space-y-5">
            {/* Header with pill counter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 pb-3">
              <h3 className="font-display font-black text-sm sm:text-base text-slate-900 flex items-center gap-2">
                <span className="text-emerald-600">🌱</span> 1. Pengaturan Nama Proyek, Pilihan Dimensi &amp; Indikator (Metode Dropdown)
              </h3>
              <span className="text-xs font-display font-black text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-3 py-1 rounded-full self-start sm:self-auto">
                {activeCheckedDimensions.length} dari {dimensiList.length} Dimensi Diceklis
              </span>
            </div>

            {/* Row 1: Tema & Deskripsi */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tema Kokurikuler (Dropdown):
                  </label>
                  <select
                    value={temaProyek}
                    onChange={(e) => setTemaProyek(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none truncate"
                  >
                    <option value="Gerakan 7 Kebiasaan Anak Indonesia Hebat & Gaya Hidup Berkelanjutan">
                      Gerakan 7 Kebiasaan Anak Indonesia Hebat &amp; Gaya Hidup Berkelanjutan
                    </option>
                    <option value="Kearifan Lokal - Pelestarian Ondel-Ondel & Budaya Betawi Pesisir">
                      Kearifan Lokal - Pelestarian Ondel-Ondel &amp; Budaya Betawi Pesisir
                    </option>
                    <option value="Bhinneka Tunggal Ika - Menjaga Toleransi & Kerukunan Warga Sekolah">
                      Bhinneka Tunggal Ika - Menjaga Toleransi &amp; Kerukunan Warga Sekolah
                    </option>
                    <option value="Bangunlah Jiwa dan Raganya - Stop Bullying & Hidup Bersih">
                      Bangunlah Jiwa dan Raganya - Stop Bullying &amp; Hidup Bersih
                    </option>
                    <option value="Suara Demokrasi - Pemilihan Ketua Kelas & Musyawarah">
                      Suara Demokrasi - Pemilihan Ketua Kelas &amp; Musyawarah
                    </option>
                    <option value="Rekayasa dan Teknologi - Pemanfaatan Sampah & Hidroponik">
                      Rekayasa dan Teknologi - Pemanfaatan Sampah &amp; Hidroponik
                    </option>
                    <option value="Kewirausahaan - Kreasi Kerajinan Daur Ulang Ramah Lingkungan">
                      Kewirausahaan - Kreasi Kerajinan Daur Ulang Ramah Lingkungan
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Proyek Kokurikuler:
                  </label>
                  <input
                    type="text"
                    value={namaProyek}
                    onChange={(e) => setNamaProyek(e.target.value)}
                    placeholder="Contoh: Napas Hijau: Tanam, Kompos, Lestari!"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div className="lg:col-span-7">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Deskripsi Ringkas Kegiatan Proyek:
                </label>
                <textarea
                  rows={4}
                  value={deskripsiProyek}
                  onChange={(e) => setDeskripsiProyek(e.target.value)}
                  placeholder="Peserta didik melaksanakan kegiatan..."
                  className="w-full p-3 rounded-2xl border border-slate-300 bg-white text-xs text-slate-800 leading-relaxed outline-none resize-none font-medium"
                />
              </div>
            </div>

            {/* SUB-CARD: CEKLIS DIMENSI & PILIH INDIKATOR (MATCHING IMAGE 2) */}
            <div className="p-4 sm:p-5 rounded-3xl border border-emerald-300 bg-emerald-50/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-2.5">
                <span className="font-display font-black text-xs text-emerald-950 flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-emerald-700" />
                  Ceklis Dimensi &amp; Pilih Indikator yang Dinilai pada Proyek Ini (Hanya yang Diceklis yang Masuk Rapor):
                </span>
                <div className="flex items-center gap-3 text-xs font-display font-black text-emerald-700 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleCheckAll}
                    className="hover:underline cursor-pointer"
                  >
                    Ceklis Semua
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={handleResetDefaultDimensi}
                    className="hover:underline cursor-pointer"
                  >
                    Reset Default (4 Dimensi)
                  </button>
                </div>
              </div>

              {/* Selector Row: Pilih Dimensi, Pilih Elemen, Button Terapkan */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-5">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Pilih Dimensi (Dropdown):
                  </label>
                  <select
                    value={selectedDimensiDropdown}
                    onChange={(e) => setSelectedDimensiDropdown(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none truncate"
                  >
                    {dimensiList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.judul}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-5">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Pilih Elemen / Indikator (Dropdown):
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none truncate"
                  >
                    <option>
                      {dimensiList.find((d) => d.id === selectedDimensiDropdown)?.elemen}
                    </option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={handleApplyDropdownDimensi}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2 rounded-2xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition"
                  >
                    <Check className="w-4 h-4" /> Terapkan &amp; Ceklis
                  </button>
                </div>
              </div>

              {/* 8 Dimensi Items List (Matching Image 2) */}
              <div className="space-y-2.5 pt-2">
                {dimensiList.map((dim) => (
                  <div
                    key={dim.id}
                    onClick={() => handleToggleDimensi(dim.id)}
                    className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                      dim.checked
                        ? 'bg-white border-emerald-400 shadow-xs ring-1 ring-emerald-200'
                        : 'bg-slate-50/70 border-slate-200 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={dim.checked}
                        onChange={() => {}} // Handled by container onClick
                        className="w-4 h-4 mt-1 rounded text-emerald-600 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-display font-black text-xs text-slate-900 truncate">
                            {dim.judul}
                          </h4>
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            {dim.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {dim.elemen}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {dim.checked ? (
                        <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-xl flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Dipakai
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-3 py-1 rounded-xl">
                          Tidak Dipakai
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 2: PENILAIAN SISWA KOKURIKULER (BOTTOM CONTAINER MATCHING IMAGE 2) */}
          <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm space-y-5">
            {/* Row: Pilih Siswa Dropdown with Red Border */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-6">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4 text-rose-600" />
                  <label className="text-xs font-display font-black text-slate-900">
                    Pilih Siswa (Dropdown):
                  </label>
                </div>
                <select
                  value={selectedStudent.id}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl border-2 border-rose-500 bg-white font-display font-black text-xs text-rose-800 outline-none shadow-xs"
                >
                  {activeStudentList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama} ({s.kelas})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-display font-bold text-slate-700 mb-1">
                  Pilih Dimensi yang Dinilai (Dropdown):
                </label>
                <div className="h-10 px-3.5 rounded-2xl border border-slate-300 bg-slate-50 flex items-center text-xs font-bold text-slate-700 truncate">
                  📑 Tampilkan Semua Dimensi yang Diceklis ({activeCheckedDimensions.length})
                </div>
              </div>

              <div className="md:col-span-2 pt-5 md:pt-0">
                <button
                  type="button"
                  onClick={handleSetSemuaMahir}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition"
                >
                  <Check className="w-4 h-4" /> Set Semua Mahir
                </button>
              </div>
            </div>

            {/* Assessment per active dimension */}
            <div className="space-y-3 pt-1">
              <h4 className="font-display font-black text-xs uppercase tracking-wider text-slate-700">
                Rubrik Capaian Perkembangan Karakter ({selectedStudent.nama}):
              </h4>

              {activeCheckedDimensions.map((dim) => {
                const currentRating = ratings[`${selectedStudent.id}_${dim.id}`] || 'BSH';
                return (
                  <div
                    key={dim.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <h5 className="font-display font-black text-xs text-slate-900">{dim.judul}</h5>
                      <p className="text-[11px] text-slate-600 mt-0.5">{dim.elemen}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {[
                        { code: 'MB', label: 'Mulai Berkembang' },
                        { code: 'SB', label: 'Sedang Berkembang' },
                        { code: 'BSH', label: 'Berkembang Sesuai Harapan' },
                        { code: 'SAB', label: 'Sangat Berkembang' },
                      ].map((lvl) => (
                        <button
                          key={lvl.code}
                          type="button"
                          onClick={() =>
                            setRatings({
                              ...ratings,
                              [`${selectedStudent.id}_${dim.id}`]: lvl.code,
                            })
                          }
                          title={lvl.label}
                          className={`px-3 py-1.5 rounded-xl font-display font-black text-xs transition cursor-pointer border ${
                            currentRating === lvl.code
                              ? lvl.code === 'SAB'
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : lvl.code === 'BSH'
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : lvl.code === 'SB'
                                ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                                : 'bg-amber-500 text-white border-amber-500 shadow-xs'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {lvl.code}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {activeCheckedDimensions.length === 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 text-amber-900 text-xs text-center border border-amber-200">
                  Belum ada dimensi yang diceklis pada Card 1 di atas. Silakan centang minimal 1 dimensi!
                </div>
              )}
            </div>

            {/* Textarea: Catatan Proses & Apresiasi Proyek Kokurikuler */}
            <div className="space-y-1.5 pt-2">
              <label className="block text-xs font-display font-black text-slate-800">
                Catatan Proses &amp; Apresiasi Proyek Kokurikuler ({selectedStudent.nama}):
              </label>
              <textarea
                rows={3}
                value={currentStudentNote}
                onChange={(e) =>
                  setStudentNotes({
                    ...studentNotes,
                    [selectedStudent.id]: e.target.value,
                  })
                }
                className="w-full p-3 rounded-2xl border border-slate-300 bg-white text-xs text-slate-800 leading-relaxed outline-none font-medium resize-none"
              />
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSaveStudentAssessment}
                className="bg-rose-600 hover:bg-rose-700 text-white font-display font-black px-6 py-2.5 rounded-2xl text-xs flex items-center gap-2 cursor-pointer shadow-md transition"
              >
                <Save className="w-4 h-4" /> Simpan Penilaian Kokurikuler Siswa
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
