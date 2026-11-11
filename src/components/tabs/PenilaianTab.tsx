import React, { useState, useEffect, useMemo } from 'react';
import {
  Edit3,
  PlusCircle,
  MinusCircle,
  Save,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle,
  HelpCircle,
  Filter,
  Trash2,
  Eraser,
  AlertTriangle,
  X,
  Trophy,
  Award,
  Crown,
  Medal,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Star,
  Target,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Subject, Student, AssessmentData } from '../../types';
import {
  getAssessmentCount,
  setAssessmentCount,
  getStoredAssessments,
  saveStoredAssessments,
} from '../../utils/storage';

interface Props {
  subjects: Subject[];
  students: Student[];
  activeClass: string;
  activeYear: string;
  activeSemester: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

export const PenilaianTab: React.FC<Props> = ({
  subjects,
  students,
  activeClass,
  activeYear,
  activeSemester,
  showToast,
  onOpenZoom,
}) => {
  // Default selected subject: restore last visited subject or fallback to Bahasa Indonesia / first subject
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('sekolahku_last_penilaian_mapel');
      if (saved && subjects.some((s) => s.id === saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return subjects.find((s) => s.code === 'BINDO')?.id || subjects[0]?.id || '';
  });

  // Save active subject to localStorage whenever it changes
  useEffect(() => {
    if (selectedSubjectId) {
      try {
        localStorage.setItem('sekolahku_last_penilaian_mapel', selectedSubjectId);
      } catch {
        // ignore
      }
    }
  }, [selectedSubjectId]);

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) || subjects[0];

  // Storage key for current context
  const assessmentKey = `${activeYear}_${activeSemester}_${activeClass}_${selectedSubjectId}`;

  // Dynamic number of Sumatif Asesmen (AS1, AS2, AS3, AS4, ...)
  const [asCount, setAsCountState] = useState<number>(4);

  // State to toggle connected CP & TP summary
  const [showCpTpInfo, setShowCpTpInfo] = useState<boolean>(false);

  // Peringkat 1 - 10 States
  const [showTop10Leaderboard, setShowTop10Leaderboard] = useState<boolean>(true);
  const [sortByRank, setSortByRank] = useState<boolean>(false);

  // Assessment data: { [studentId]: { sumatif: { [asIdx]: number }, remedial: { [asIdx]: number }, asts: number, asas: number } }
  const [grades, setGrades] = useState<AssessmentData>({});

  // Filter students by active class
  // If subject is religion-specific (e.g. PAIBP for Islam, PAKBP for Kristen), filter to students of that religion or list all with note
  const currentClassStudents = students.filter((s) => {
    if (s.kelas !== activeClass) return false;
    if (selectedSubject?.agamaKhusus) {
      return s.agama === selectedSubject.agamaKhusus;
    }
    return true;
  });

  // Load count and grades when subject/class/year/semester changes
  useEffect(() => {
    const count = getAssessmentCount(assessmentKey);
    setAsCountState(count);
    const data = getStoredAssessments(assessmentKey);
    setGrades(data);
  }, [assessmentKey]);

  // Handler for adding an assessment column
  const handleAddAs = () => {
    const nextCount = asCount + 1;
    setAsCountState(nextCount);
    setAssessmentCount(assessmentKey, nextCount);
    showToast(`Asesmen Sumatif (AS${nextCount}) berhasil ditambahkan!`, 'success');
  };

  // Handler for removing an assessment column
  const handleRemoveAs = () => {
    if (asCount <= 1) {
      showToast('Minimal harus ada 1 Asesmen Sumatif (AS1)', 'error');
      return;
    }
    const nextCount = asCount - 1;
    setAsCountState(nextCount);
    setAssessmentCount(assessmentKey, nextCount);
    showToast(`Asesmen Sumatif dikurangi menjadi ${nextCount} asesmen`, 'success');
  };

  // Handler for grade changes
  const handleGradeChange = (
    studentId: string,
    field: 'sumatif' | 'remedial' | 'asts' | 'asas',
    value: number,
    asIndex?: number
  ) => {
    setGrades((prev) => {
      const studentGrade = prev[studentId] || {
        sumatif: {},
        remedial: {},
        asts: 0,
        asas: 0,
      };

      if (field === 'sumatif' && asIndex !== undefined) {
        return {
          ...prev,
          [studentId]: {
            ...studentGrade,
            sumatif: {
              ...studentGrade.sumatif,
              [asIndex]: value,
            },
          },
        };
      } else if (field === 'remedial' && asIndex !== undefined) {
        return {
          ...prev,
          [studentId]: {
            ...studentGrade,
            remedial: {
              ...studentGrade.remedial,
              [asIndex]: value,
            },
          },
        };
      } else if (field === 'asts') {
        return {
          ...prev,
          [studentId]: {
            ...studentGrade,
            asts: value,
          },
        };
      } else if (field === 'asas') {
        return {
          ...prev,
          [studentId]: {
            ...studentGrade,
            asas: value,
          },
        };
      }

      return prev;
    });
  };

  // Delete Nilai Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<'all' | 'column' | 'remedial'>('all');
  const [selectedColumnToDelete, setSelectedColumnToDelete] = useState<string>('AS1');

  // Handle delete all grades for this subject and class
  const handleDeleteAllGrades = () => {
    const cleared: AssessmentData = {};
    currentClassStudents.forEach((s) => {
      cleared[s.id] = { sumatif: {}, remedial: {}, asts: 0, asas: 0 };
    });
    setGrades(cleared);
    saveStoredAssessments(assessmentKey, cleared);
    showToast(`Seluruh nilai ${selectedSubject?.name} (${activeClass}) berhasil dihapus / dikosongkan!`, 'success');
    setIsDeleteModalOpen(false);
  };

  // Handle delete specific column
  const handleDeleteColumnGrades = () => {
    const updated = { ...grades };
    currentClassStudents.forEach((s) => {
      if (!updated[s.id]) updated[s.id] = { sumatif: {}, remedial: {}, asts: 0, asas: 0 };
      if (selectedColumnToDelete.startsWith('AS')) {
        const asIdx = Number(selectedColumnToDelete.replace('AS', ''));
        delete updated[s.id].sumatif[asIdx];
        delete updated[s.id].remedial[asIdx];
      } else if (selectedColumnToDelete === 'ASTS') {
        updated[s.id].asts = 0;
      } else if (selectedColumnToDelete === 'ASAS') {
        updated[s.id].asas = 0;
      }
    });
    setGrades(updated);
    saveStoredAssessments(assessmentKey, updated);
    showToast(`Nilai kolom ${selectedColumnToDelete} berhasil dihapus untuk seluruh siswa!`, 'success');
    setIsDeleteModalOpen(false);
  };

  // Handle delete remedial only
  const handleDeleteRemedialOnly = () => {
    const updated = { ...grades };
    currentClassStudents.forEach((s) => {
      if (updated[s.id]) {
        updated[s.id].remedial = {};
      }
    });
    setGrades(updated);
    saveStoredAssessments(assessmentKey, updated);
    showToast(`Seluruh nilai remedial ${selectedSubject?.name} berhasil dikosongkan!`, 'success');
    setIsDeleteModalOpen(false);
  };

  // Handle single student grade reset
  const handleDeleteStudentGrades = (studentId: string, studentName: string) => {
    if (confirm(`Kosongkan / hapus seluruh nilai untuk ${studentName}?`)) {
      const updated = { ...grades };
      updated[studentId] = { sumatif: {}, remedial: {}, asts: 0, asas: 0 };
      setGrades(updated);
      saveStoredAssessments(assessmentKey, updated);
      showToast(`Nilai ${studentName} berhasil dikosongkan!`, 'success');
    }
  };

  // Save all grades
  const handleSaveGrades = () => {
    saveStoredAssessments(assessmentKey, grades);
    showToast(
      `Seluruh Nilai Sumatif (AS1-AS${asCount}), Remedial, ASTS & ASAS untuk ${selectedSubject?.name} berhasil disimpan!`,
      'success'
    );
  };

  // Calculate Average AS, and Final Grade (NA Rapor)
  const calculateStudentFinal = (studentId: string) => {
    const studentGrade = grades[studentId] || { sumatif: {}, remedial: {}, asts: 0, asas: 0 };
    let totalAsScore = 0;
    const kktp = selectedSubject?.kktp || 75;

    for (let i = 1; i <= asCount; i++) {
      const pureScore = studentGrade.sumatif?.[i] ?? 0;
      const remScore = studentGrade.remedial?.[i] ?? 0;
      // If remedial was taken and is positive, effective score can replace or reach KKTP
      const effectiveScore = remScore > 0 ? Math.max(pureScore, Math.min(remScore, kktp)) : pureScore;
      totalAsScore += effectiveScore;
    }

    const avgAs = asCount > 0 ? totalAsScore / asCount : 0;
    const asts = studentGrade.asts || 0;
    const asas = studentGrade.asas || 0;

    // Standard Kurikulum Merdeka formula: 2*Rata AS + ASTS + ASAS / 4
    let naRapor = 0;
    if (avgAs > 0 || asts > 0 || asas > 0) {
      naRapor = Math.round((2 * avgAs + asts + asas) / 4);
    }

    return {
      avgAs: Math.round(avgAs * 10) / 10,
      naRapor,
    };
  };

  // Compute student rankings for current subject & class (Peringkat 1 - 10)
  const studentRankings = useMemo(() => {
    const list = currentClassStudents.map((s) => {
      const { avgAs, naRapor } = calculateStudentFinal(s.id);
      const studentGrade = grades[s.id] || { sumatif: {}, remedial: {}, asts: 0, asas: 0 };
      return {
        student: s,
        avgAs,
        naRapor,
        asts: studentGrade.asts || 0,
        asas: studentGrade.asas || 0,
      };
    });

    // Sort descending by naRapor, then by avgAs, then alphabetically
    list.sort((a, b) => {
      if (b.naRapor !== a.naRapor) return b.naRapor - a.naRapor;
      if (b.avgAs !== a.avgAs) return b.avgAs - a.avgAs;
      return a.student.nama.localeCompare(b.student.nama);
    });

    const rankMap: Record<string, number> = {};
    list.forEach((item, index) => {
      rankMap[item.student.id] = index + 1;
    });

    const top10 = list.slice(0, 10);

    return {
      sortedList: list,
      rankMap,
      top10,
    };
  }, [currentClassStudents, grades, asCount, selectedSubject]);

  // Students to render in table (either sorted by rank or original order)
  const displayStudents = useMemo(() => {
    if (sortByRank) {
      return [...currentClassStudents].sort((a, b) => {
        const rankA = studentRankings.rankMap[a.id] || 999;
        const rankB = studentRankings.rankMap[b.id] || 999;
        return rankA - rankB;
      });
    }
    return currentClassStudents;
  }, [currentClassStudents, sortByRank, studentRankings.rankMap]);

  // Export Penilaian to Excel (including Peringkat)
  const handleExportXLSX = () => {
    const rows = currentClassStudents.map((s, idx) => {
      const studentGrade = grades[s.id] || { sumatif: {}, remedial: {}, asts: 0, asas: 0 };
      const { avgAs, naRapor } = calculateStudentFinal(s.id);

      const rowData: Record<string, any> = {
        'No': idx + 1,
        'Peringkat': studentRankings.rankMap[s.id] ? `Peringkat ${studentRankings.rankMap[s.id]}` : '-',
        'ID Barcode': s.barcodeId,
        'NISN': s.nisn,
        'Nama Peserta Didik': s.nama,
        'Agama': s.agama,
        'Mata Pelajaran': selectedSubject?.name,
      };

      for (let i = 1; i <= asCount; i++) {
        rowData[`Sumatif (AS${i})`] = studentGrade.sumatif?.[i] ?? 0;
        rowData[`Rem (AS${i})`] = studentGrade.remedial?.[i] ?? 0;
      }

      rowData['Rata-Rata AS'] = avgAs;
      rowData['ASTS'] = studentGrade.asts ?? 0;
      rowData['ASAS'] = studentGrade.asas ?? 0;
      rowData['Nilai Akhir (NA)'] = naRapor;

      return rowData;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Penilaian');
    XLSX.writeFile(
      wb,
      `Penilaian_${selectedSubject?.code}_${activeClass.replace(' ', '_')}_${activeYear.replace('/', '-')}.xlsx`
    );
    showToast('File Excel Penilaian (dengan kolom Peringkat) berhasil diunduh!', 'success');
  };

  // Export Peringkat 10 Besar to Excel
  const handleExportTop10XLSX = () => {
    const rows = studentRankings.top10.map((item, idx) => ({
      'Peringkat': idx + 1,
      'Nama Peserta Didik': item.student.nama,
      'NISN': item.student.nisn,
      'Kelas': activeClass,
      'Mata Pelajaran': selectedSubject?.name,
      'Rata-Rata AS': item.avgAs,
      'ASTS': item.asts,
      'ASAS': item.asas,
      'Nilai Akhir (NA)': item.naRapor,
      'Predikat':
        item.naRapor >= 90
          ? 'A (Sangat Baik)'
          : item.naRapor >= 80
          ? 'B (Baik)'
          : item.naRapor >= 70
          ? 'C (Cukup)'
          : 'D (Perlu Bimbingan)',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Peringkat 10 Besar');
    XLSX.writeFile(
      wb,
      `Peringkat_10_Besar_${selectedSubject?.code}_${activeClass.replace(' ', '_')}.xlsx`
    );
    showToast('Laporan Excel Peringkat 10 Besar berhasil diunduh!', 'success');
  };

  // Import from Excel
  const handleImportXLSX = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        const updatedGrades = { ...grades };

        data.forEach((row) => {
          const barcode = row['ID Barcode'];
          const nisn = row['NISN'];
          const student = currentClassStudents.find(
            (s) => s.barcodeId === barcode || s.nisn === String(nisn)
          );

          if (student) {
            const sumatif: Record<number, number> = {};
            const remedial: Record<number, number> = {};

            for (let i = 1; i <= asCount; i++) {
              if (row[`Sumatif (AS${i})`] !== undefined) {
                sumatif[i] = Number(row[`Sumatif (AS${i})`]) || 0;
              }
              if (row[`Rem (AS${i})`] !== undefined) {
                remedial[i] = Number(row[`Rem (AS${i})`]) || 0;
              }
            }

            updatedGrades[student.id] = {
              sumatif,
              remedial,
              asts: Number(row['ASTS']) || 0,
              asas: Number(row['ASAS']) || 0,
            };
          }
        });

        setGrades(updatedGrades);
        saveStoredAssessments(assessmentKey, updatedGrades);
        showToast('Berhasil mengimpor nilai dari file Excel!', 'success');
      } catch (err) {
        console.error('Import error:', err);
        showToast('Gagal membaca file Excel. Pastikan format kolom sesuai.', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
              Menu 4. Penilaian & Pelaporan • Kurikulum Merdeka
            </span>
            <h2 className="text-xl sm:text-2xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
              <Edit3 className="w-6 h-6 text-emerald-600" /> Penilaian & Remedial (Sumatif AS, ASTS & ASAS)
            </h2>
            <p className="text-xs text-slate-500 max-w-3xl mt-0.5">
              Label asesmen harian: <strong>Sumatif (AS1), Sumatif (AS2), dst.</strong> dan{' '}
              <strong>Rem (AS1), Rem (AS2), dst.</strong> Dilengkapi tombol tambah/kurang asesmen sumatif secara langsung,
              serta kolom <strong>ASTS</strong> dan <strong>ASAS</strong> yang otomatis memperbarui Nilai Akhir (NA) Rapor.
            </p>
          </div>

          {/* Quick Action Buttons: Add/Remove AS & Save */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAddAs}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 transition cursor-pointer"
              title="Tambah kolom Sumatif (AS) berikutnya"
            >
              <PlusCircle className="w-4 h-4" /> + Tambah Sumatif (AS)
            </button>

            <button
              type="button"
              onClick={handleRemoveAs}
              className="bg-rose-100 hover:bg-rose-200 text-rose-800 font-display font-extrabold px-3.5 py-2.5 rounded-2xl text-xs border border-rose-200 flex items-center gap-1.5 transition cursor-pointer"
              title="Kurangi kolom Asesmen Sumatif terakhir"
            >
              <MinusCircle className="w-4 h-4 text-rose-600" /> - Kurangi AS
            </button>

            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-display font-extrabold px-3.5 py-2.5 rounded-2xl text-xs border border-rose-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="Menu Kosongkan Nilai (Seluruh Mapel atau Kolom Tertentu)"
            >
              <Eraser className="w-4 h-4 text-rose-600" /> Kosongkan Nilai
            </button>

            <button
              type="button"
              onClick={handleSaveGrades}
              className="bg-rose-600 hover:bg-rose-700 text-white font-display font-black px-5 py-2.5 rounded-2xl text-xs shadow-md shadow-rose-500/20 flex items-center gap-2 transition cursor-pointer"
            >
              <Save className="w-4 h-4" /> Simpan Nilai
            </button>
          </div>
        </div>

        {/* Filter Bar: Subject Selector, Active Class info & Excel Tools */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <label className="text-xs font-extrabold text-slate-700">Mata Pelajaran:</label>
            </div>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="px-3.5 py-2 rounded-xl border-2 border-emerald-500 bg-white font-display font-extrabold text-xs text-slate-800 cursor-pointer outline-none shadow-2xs"
            >
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({sub.code}) {sub.agamaKhusus ? `• Khusus ${sub.agamaKhusus}` : ''}
                </option>
              ))}
            </select>

            <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
              KKTP: <strong>{selectedSubject?.kktp || 75}</strong>
            </span>

            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              Jumlah Sumatif Aktif: <strong>{asCount} Kolom (AS1 s.d. AS{asCount})</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTop10Leaderboard(!showTop10Leaderboard)}
              className={`font-display font-extrabold px-3 py-2 rounded-xl text-xs border flex items-center gap-1.5 transition cursor-pointer shadow-2xs ${
                showTop10Leaderboard
                  ? 'bg-amber-100 text-amber-950 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title="Tampilkan / sembunyikan papan peringkat 1 - 10"
            >
              <Trophy className="w-4 h-4 text-amber-600" />
              Peringkat 1 - 10 {showTop10Leaderboard ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => setSortByRank(!sortByRank)}
              className={`font-display font-extrabold px-3 py-2 rounded-xl text-xs border flex items-center gap-1.5 transition cursor-pointer shadow-2xs ${
                sortByRank
                  ? 'bg-sky-100 text-sky-950 border-sky-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title={sortByRank ? 'Kembalikan ke urutan absen asli' : 'Urutkan siswa dari peringkat 1 ke bawah'}
            >
              <ArrowUpDown className="w-4 h-4 text-sky-600" />
              {sortByRank ? 'Urutan: Peringkat (1 - N)' : 'Urutkan Peringkat'}
            </button>

            <label className="bg-white hover:bg-slate-100 text-slate-700 font-display font-extrabold px-3 py-2 rounded-xl text-xs border border-slate-300 shadow-2xs flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-4 h-4 text-emerald-600" /> Import Nilai (.XLSX)
              <input type="file" accept=".xlsx,.xls" onChange={handleImportXLSX} className="hidden" />
            </label>
            <button
              type="button"
              onClick={handleExportXLSX}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs border border-emerald-200 flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export Nilai (.XLSX)
            </button>
          </div>
        </div>

        {/* Notice for Religion-specific subjects */}
        {selectedSubject?.agamaKhusus && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-semibold flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Mata pelajaran ini khusus untuk peserta didik beragama <strong>{selectedSubject.agamaKhusus}</strong>.
              Hanya peserta didik yang beragama {selectedSubject.agamaKhusus} yang ditampilkan pada tabel di bawah.
            </span>
          </div>
        )}

        {/* ================= PAPAN PERINGKAT 10 BESAR SISWA (PERINGKAT 1 - 10) ================= */}
        {showTop10Leaderboard && (
          <div className="bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 p-5 rounded-3xl border-2 border-amber-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-black text-slate-900 text-base">
                      Papan Peringkat 10 Besar Siswa (Peringkat 1 – 10)
                    </h3>
                    <span className="text-[10px] font-black uppercase bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full">
                      Top 10
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Berdasarkan perolehan <strong>Nilai Akhir (NA) Rapor</strong> & Rata-rata Sumatif mata pelajaran <strong>{selectedSubject?.name}</strong> di {activeClass}.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportTop10XLSX}
                  className="bg-white hover:bg-amber-50 text-amber-900 font-display font-bold px-3 py-1.5 rounded-xl border border-amber-300 text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Unduh Rekap Excel Peringkat 10 Besar"
                >
                  <Download className="w-3.5 h-3.5 text-amber-600" /> Download Top 10 (.XLSX)
                </button>
                <button
                  type="button"
                  onClick={() => setShowTop10Leaderboard(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                  title="Sembunyikan Papan Peringkat"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Podium Juara 1, 2, 3 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Juara 1 */}
              {studentRankings.top10[0] && (
                <div className="order-1 md:order-2 p-4 rounded-2xl bg-gradient-to-b from-amber-100/70 via-amber-50/50 to-white border-2 border-amber-400 shadow-sm relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 bg-amber-400 text-amber-950 text-[10px] font-black uppercase px-3 py-0.5 rounded-bl-xl flex items-center gap-1">
                    <Crown className="w-3 h-3 text-amber-950" /> Peringkat 1
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <div className="relative">
                      <img
                        src={studentRankings.top10[0].student.fotoUrl}
                        alt={studentRankings.top10[0].student.nama}
                        onClick={() => onOpenZoom(studentRankings.top10[0].student.fotoUrl, studentRankings.top10[0].student.nama)}
                        className="w-13 h-13 rounded-2xl object-cover border-2 border-amber-400 ring-4 ring-amber-200/60 cursor-zoom-in"
                      />
                      <span className="absolute -bottom-1 -right-1 text-base">🥇</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-mono font-bold text-amber-800 uppercase block">Juara 1 Terbaik</span>
                      <h4 className="font-display font-black text-sm text-slate-900 truncate" title={studentRankings.top10[0].student.nama}>
                        {studentRankings.top10[0].student.nama}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono">{studentRankings.top10[0].student.nisn}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-amber-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Rata AS / ASTS / ASAS</span>
                      <span className="text-xs font-mono font-bold text-slate-700">
                        {studentRankings.top10[0].avgAs} / {studentRankings.top10[0].asts} / {studentRankings.top10[0].asas}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-amber-800 block">NA Rapor</span>
                      <span className="text-2xl font-display font-black text-amber-950">
                        {studentRankings.top10[0].naRapor}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Juara 2 */}
              {studentRankings.top10[1] && (
                <div className="order-2 md:order-1 p-4 rounded-2xl bg-gradient-to-b from-slate-100/70 via-slate-50/50 to-white border border-slate-300 shadow-2xs relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 bg-slate-300 text-slate-800 text-[10px] font-black uppercase px-3 py-0.5 rounded-bl-xl flex items-center gap-1">
                    <Medal className="w-3 h-3 text-slate-700" /> Peringkat 2
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <div className="relative">
                      <img
                        src={studentRankings.top10[1].student.fotoUrl}
                        alt={studentRankings.top10[1].student.nama}
                        onClick={() => onOpenZoom(studentRankings.top10[1].student.fotoUrl, studentRankings.top10[1].student.nama)}
                        className="w-11 h-11 rounded-2xl object-cover border border-slate-300 ring-2 ring-slate-200 cursor-zoom-in"
                      />
                      <span className="absolute -bottom-1 -right-1 text-sm">🥈</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase block">Juara 2</span>
                      <h4 className="font-display font-black text-sm text-slate-900 truncate" title={studentRankings.top10[1].student.nama}>
                        {studentRankings.top10[1].student.nama}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono">{studentRankings.top10[1].student.nisn}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Rata AS / ASTS / ASAS</span>
                      <span className="text-xs font-mono font-bold text-slate-700">
                        {studentRankings.top10[1].avgAs} / {studentRankings.top10[1].asts} / {studentRankings.top10[1].asas}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-600 block">NA Rapor</span>
                      <span className="text-xl font-display font-black text-slate-800">
                        {studentRankings.top10[1].naRapor}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Juara 3 */}
              {studentRankings.top10[2] && (
                <div className="order-3 md:order-3 p-4 rounded-2xl bg-gradient-to-b from-orange-100/60 via-orange-50/40 to-white border border-orange-300 shadow-2xs relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 bg-orange-300 text-orange-950 text-[10px] font-black uppercase px-3 py-0.5 rounded-bl-xl flex items-center gap-1">
                    <Medal className="w-3 h-3 text-orange-900" /> Peringkat 3
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <div className="relative">
                      <img
                        src={studentRankings.top10[2].student.fotoUrl}
                        alt={studentRankings.top10[2].student.nama}
                        onClick={() => onOpenZoom(studentRankings.top10[2].student.fotoUrl, studentRankings.top10[2].student.nama)}
                        className="w-11 h-11 rounded-2xl object-cover border border-orange-300 ring-2 ring-orange-200 cursor-zoom-in"
                      />
                      <span className="absolute -bottom-1 -right-1 text-sm">🥉</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-mono font-bold text-orange-800 uppercase block">Juara 3</span>
                      <h4 className="font-display font-black text-sm text-slate-900 truncate" title={studentRankings.top10[2].student.nama}>
                        {studentRankings.top10[2].student.nama}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono">{studentRankings.top10[2].student.nisn}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-orange-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Rata AS / ASTS / ASAS</span>
                      <span className="text-xs font-mono font-bold text-slate-700">
                        {studentRankings.top10[2].avgAs} / {studentRankings.top10[2].asts} / {studentRankings.top10[2].asas}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-orange-800 block">NA Rapor</span>
                      <span className="text-xl font-display font-black text-orange-950">
                        {studentRankings.top10[2].naRapor}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Peringkat 4 - 10 */}
            {studentRankings.top10.length > 3 && (
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-extrabold uppercase text-slate-600 block">
                  Peringkat 4 s.d. 10 Besar:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {studentRankings.top10.slice(3, 10).map((item, idx) => {
                    const rankNum = idx + 4;
                    return (
                      <div
                        key={item.student.id}
                        className="p-3 rounded-xl bg-white border border-slate-200 hover:border-amber-300 transition flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-black text-[11px] px-2 py-0.5 rounded-lg bg-sky-100 text-sky-900 border border-sky-200 shrink-0">
                            #{rankNum}
                          </span>
                          <img
                            src={item.student.fotoUrl}
                            alt={item.student.nama}
                            onClick={() => onOpenZoom(item.student.fotoUrl, item.student.nama)}
                            className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0 cursor-zoom-in"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate" title={item.student.nama}>
                              {item.student.nama}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Rata AS: {item.avgAs}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-slate-400 block">NA</span>
                          <span className="text-sm font-display font-black text-emerald-700">
                            {item.naRapor}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CP & TP Connection Card for current class and subject */}
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-display font-black text-indigo-950 text-sm">
                    Koneksi Capaian & Tujuan Pembelajaran (CP & TP)
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-900">
                    {activeClass} &bull; {selectedSubject?.name}
                  </span>
                </div>
                <p className="text-xs text-indigo-700/90">
                  Setiap kolom Asesmen Sumatif (AS1, AS2, ...) terhubung langsung ke Tujuan Pembelajaran (TP) kelas {activeClass}.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCpTpInfo(!showCpTpInfo)}
              className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 rounded-xl hover:bg-indigo-50 transition cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
            >
              {showCpTpInfo ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" /> Sembunyikan Pemetaan
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" /> Lihat Pemetaan TP &rarr; AS
                </>
              )}
            </button>
          </div>

          {showCpTpInfo && (
            <div className="mt-3.5 pt-3.5 border-t border-indigo-200/70 space-y-3 text-xs">
              <div>
                <span className="font-black text-indigo-950 uppercase tracking-wider text-[10px] block mb-1">
                  Capaian Pembelajaran (CP) {selectedSubject?.name} [{activeClass}]:
                </span>
                <p className="text-slate-700 bg-white p-2.5 rounded-xl border border-indigo-100 text-xs italic">
                  &ldquo;{selectedSubject?.description || 'Belum ada CP yang ditetapkan'}&rdquo;
                </p>
              </div>

              <div>
                <span className="font-black text-indigo-950 uppercase tracking-wider text-[10px] block mb-1.5">
                  Pemetaan Asesmen Sumatif (AS) terhadap Butir TP:
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Array.from({ length: asCount }, (_, i) => i + 1).map((idx) => {
                    const tpText = selectedSubject?.tujuanPembelajaran?.[idx - 1];
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-2 bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs"
                      >
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-mono font-bold text-[11px] shrink-0">
                          AS{idx}
                        </span>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-800 block text-[11px]">
                            {tpText ? `Tujuan Pembelajaran ${idx}:` : `Tujuan Pembelajaran ${idx} (Belum diset):`}
                          </span>
                          <span className="text-slate-600 text-xs">
                            {tpText || 'Dapat disunting di menu Kurikulum > Tujuan Pembelajaran'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* The Master Grade Table */}
        <div className="overflow-x-auto border-2 border-slate-200 rounded-3xl shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              {/* Row 1: Group Headers */}
              <tr className="bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
                <th rowSpan={2} className="p-3 w-10 text-center border-r border-slate-200">
                  No
                </th>
                <th rowSpan={2} className="p-3 w-24 text-center border-r border-slate-200 bg-amber-50 text-amber-950 font-black">
                  Peringkat
                </th>
                <th rowSpan={2} className="p-3 min-w-[180px] border-r border-slate-200">
                  Foto & Nama Peserta Didik
                </th>
                <th rowSpan={2} className="p-3 text-center border-r border-slate-200 w-20">
                  Agama
                </th>

                {/* Dynamic Sumatif & Remedial Column Groups */}
                {Array.from({ length: asCount }, (_, i) => i + 1).map((idx) => {
                  const tpText = selectedSubject?.tujuanPembelajaran?.[idx - 1];
                  return (
                    <th
                      key={idx}
                      colSpan={2}
                      className="p-2.5 text-center border-r border-slate-200 bg-emerald-50/80 text-emerald-950 font-black"
                      title={tpText ? `TP ${idx}: ${tpText}` : `Asesmen Sumatif ${idx}`}
                    >
                      <div>Sumatif (AS{idx})</div>
                      {tpText && (
                        <div
                          className="text-[10px] font-medium text-emerald-800 truncate max-w-[130px] mx-auto opacity-90 normal-case"
                          title={`Tujuan Pembelajaran ${idx}: ${tpText}`}
                        >
                          TP {idx}: {tpText}
                        </div>
                      )}
                    </th>
                  );
                })}

                <th rowSpan={2} className="p-3 text-center border-r border-slate-200 bg-sky-50 text-sky-950 w-20">
                  Rata-rata AS
                </th>
                <th rowSpan={2} className="p-3 text-center border-r border-slate-200 bg-amber-50 text-amber-950 w-20">
                  ASTS
                </th>
                <th rowSpan={2} className="p-3 text-center border-r border-slate-200 bg-amber-50 text-amber-950 w-20">
                  ASAS
                </th>
                <th rowSpan={2} className="p-3 text-center bg-rose-50 text-rose-950 font-black w-24 border-r border-slate-200">
                  NA Rapor
                </th>
                <th rowSpan={2} className="p-3 text-center bg-slate-100 text-slate-800 font-black w-14">
                  Aksi
                </th>
              </tr>

              {/* Row 2: Sub-headers for each AS (Nilai & Rem) */}
              <tr className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200 text-[11px]">
                {Array.from({ length: asCount }, (_, i) => i + 1).map((idx) => (
                  <React.Fragment key={idx}>
                    <th className="p-2 text-center border-r border-slate-200 bg-emerald-100/40 text-emerald-900 w-16">
                      AS{idx}
                    </th>
                    <th className="p-2 text-center border-r border-slate-200 bg-rose-100/40 text-rose-900 w-16">
                      Rem (AS{idx})
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {displayStudents.map((student, sIdx) => {
                const studentGrade = grades[student.id] || {
                  sumatif: {},
                  remedial: {},
                  asts: 0,
                  asas: 0,
                };

                const { avgAs, naRapor } = calculateStudentFinal(student.id);
                const rank = studentRankings.rankMap[student.id];

                return (
                  <tr key={student.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 text-center font-bold text-slate-500 border-r border-slate-200">
                      {sIdx + 1}
                    </td>

                    {/* Kolom Peringkat Siswa */}
                    <td className="p-2 text-center border-r border-slate-200 font-bold bg-amber-50/20">
                      {rank === 1 ? (
                        <span className="inline-flex items-center gap-1 font-black px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">
                          🥇 Ke-1
                        </span>
                      ) : rank === 2 ? (
                        <span className="inline-flex items-center gap-1 font-black px-2 py-0.5 rounded-full text-[11px] bg-slate-200 text-slate-800 border border-slate-300 shadow-2xs">
                          🥈 Ke-2
                        </span>
                      ) : rank === 3 ? (
                        <span className="inline-flex items-center gap-1 font-black px-2 py-0.5 rounded-full text-[11px] bg-orange-100 text-orange-950 border border-orange-300 shadow-2xs">
                          🥉 Ke-3
                        </span>
                      ) : rank && rank >= 4 && rank <= 10 ? (
                        <span className="inline-flex items-center gap-1 font-black px-2 py-0.5 rounded-full text-[11px] bg-sky-100 text-sky-900 border border-sky-300">
                          🏅 Ke-{rank}
                        </span>
                      ) : (
                        <span className="font-mono font-bold text-xs text-slate-400">
                          #{rank || '-'}
                        </span>
                      )}
                    </td>

                    <td className="p-3 border-r border-slate-200">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={student.fotoUrl}
                          alt={student.nama}
                          onClick={() => onOpenZoom(student.fotoUrl, student.nama)}
                          className="w-8 h-8 rounded-lg object-cover border border-slate-200 cursor-zoom-in shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">{student.nama}</div>
                          <div className="text-[10px] font-mono text-slate-500">{student.nisn}</div>
                        </div>
                      </div>
                    </td>

                    <td className="p-3 text-center border-r border-slate-200 text-slate-600 font-semibold">
                      {student.agama}
                    </td>

                    {/* Asesmen Sumatif (AS1, AS2, ...) & Rem (AS1, AS2, ...) inputs */}
                    {Array.from({ length: asCount }, (_, i) => i + 1).map((asIdx) => {
                      const valAs = studentGrade.sumatif?.[asIdx] ?? '';
                      const valRem = studentGrade.remedial?.[asIdx] ?? '';
                      const isBelowKktp = Number(valAs) > 0 && Number(valAs) < (selectedSubject?.kktp || 75);

                      return (
                        <React.Fragment key={asIdx}>
                          {/* Pure Sumatif score */}
                          <td className="p-1.5 text-center border-r border-slate-200 bg-emerald-50/20">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={valAs}
                              onChange={(e) =>
                                handleGradeChange(
                                  student.id,
                                  'sumatif',
                                  e.target.value === '' ? 0 : Number(e.target.value),
                                  asIdx
                                )
                              }
                              placeholder="0"
                              className={`w-14 text-center py-1.5 px-1 rounded-lg border font-mono font-bold text-xs outline-none transition ${
                                isBelowKktp
                                  ? 'border-rose-400 bg-rose-50 text-rose-700'
                                  : 'border-slate-300 bg-white text-slate-800 focus:border-emerald-500'
                              }`}
                            />
                          </td>

                          {/* Remedial score */}
                          <td className="p-1.5 text-center border-r border-slate-200 bg-rose-50/20">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={valRem}
                              onChange={(e) =>
                                handleGradeChange(
                                  student.id,
                                  'remedial',
                                  e.target.value === '' ? 0 : Number(e.target.value),
                                  asIdx
                                )
                              }
                              placeholder="-"
                              className="w-14 text-center py-1.5 px-1 rounded-lg border border-slate-300 bg-white font-mono font-bold text-xs text-rose-700 focus:border-rose-500 outline-none"
                            />
                          </td>
                        </React.Fragment>
                      );
                    })}

                    {/* Rata-rata Sumatif AS */}
                    <td className="p-2.5 text-center border-r border-slate-200 font-mono font-black text-sky-800 bg-sky-50/40">
                      {avgAs > 0 ? avgAs : '-'}
                    </td>

                    {/* ASTS (Asesmen Sumatif Tengah Semester) */}
                    <td className="p-1.5 text-center border-r border-slate-200 bg-amber-50/20">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={studentGrade.asts ?? ''}
                        onChange={(e) =>
                          handleGradeChange(
                            student.id,
                            'asts',
                            e.target.value === '' ? 0 : Number(e.target.value)
                          )
                        }
                        placeholder="0"
                        className="w-14 text-center py-1.5 px-1 rounded-lg border border-slate-300 bg-white font-mono font-bold text-xs text-amber-900 focus:border-amber-500 outline-none"
                      />
                    </td>

                    {/* ASAS (Asesmen Sumatif Akhir Semester) */}
                    <td className="p-1.5 text-center border-r border-slate-200 bg-amber-50/20">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={studentGrade.asas ?? ''}
                        onChange={(e) =>
                          handleGradeChange(
                            student.id,
                            'asas',
                            e.target.value === '' ? 0 : Number(e.target.value)
                          )
                        }
                        placeholder="0"
                        className="w-14 text-center py-1.5 px-1 rounded-lg border border-slate-300 bg-white font-mono font-bold text-xs text-amber-900 focus:border-amber-500 outline-none"
                      />
                    </td>

                    {/* NA Rapor (Nilai Akhir) */}
                    <td className="p-2.5 text-center font-display font-black text-base text-rose-700 bg-rose-50/40 border-r border-slate-200">
                      {naRapor > 0 ? naRapor : '-'}
                    </td>

                    {/* Aksi Baris */}
                    <td className="p-2 text-center bg-white">
                      <button
                        type="button"
                        onClick={() => handleDeleteStudentGrades(student.id, student.nama)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title={`Kosongkan nilai ${student.nama}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {currentClassStudents.length === 0 && (
                <tr>
                  <td colSpan={7 + asCount * 2} className="p-8 text-center text-slate-400 italic">
                    Tidak ada peserta didik terdaftar pada rombel ini yang cocok dengan kriteria mata pelajaran.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom instructions and formula explanation */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
          <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Petunjuk Perhitungan Nilai Kurikulum Merdeka (SDN Rawa Badak Utara 21):</span>
          </div>
          <p>
            1. <strong>Sumatif (AS1, AS2, AS3, AS4, dst.):</strong> Asesmen sumatif lingkup materi/tujuan pembelajaran harian.
            Gunakan tombol <strong>+ Tambah Sumatif (AS)</strong> untuk menambah AS5, AS6, dst.
          </p>
          <p>
            2. <strong>Rem (AS1, AS2, dst.):</strong> Kolom remedial opsional jika nilai asesmen peserta didik berada di bawah KKTP ({selectedSubject?.kktp || 75}).
          </p>
          <p>
            3. <strong>ASTS & ASAS:</strong> Nilai Asesmen Sumatif Tengah Semester dan Asesmen Sumatif Akhir Semester.
          </p>
          <p>
            4. <strong>Nilai Akhir (NA) Rapor:</strong> Dihitung otomatis dengan pembobotan: <code className="bg-white px-2 py-0.5 rounded border font-mono font-bold text-rose-700">NA = (2 × Rata-rata AS + ASTS + ASAS) / 4</code>.
          </p>
        </div>
      </div>

      {/* Modal Hapus / Kosongkan Nilai */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Eraser className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-black text-base text-slate-900">
                    Menu Kosongkan Nilai Siswa
                  </h3>
                  <p className="text-xs text-slate-500">{selectedSubject?.name} • {activeClass}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 block">Pilih Opsi Kosongkan Nilai:</label>

              <label className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition ${deleteType === 'all' ? 'border-rose-500 bg-rose-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input
                  type="radio"
                  name="del_opt"
                  checked={deleteType === 'all'}
                  onChange={() => setDeleteType('all')}
                  className="mt-1 text-rose-600"
                />
                <div>
                  <div className="font-bold text-xs text-slate-900">Kosongkan Seluruh Nilai Mata Pelajaran Ini</div>
                  <div className="text-[11px] text-slate-500">Mengosongkan semua nilai Sumatif (AS1 s.d. AS{asCount}), Remedial, ASTS, dan ASAS untuk seluruh siswa di {activeClass}.</div>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition ${deleteType === 'column' ? 'border-red-500 bg-red-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input
                  type="radio"
                  name="del_opt"
                  checked={deleteType === 'column'}
                  onChange={() => setDeleteType('column')}
                  className="mt-1 text-red-600"
                />
                <div className="flex-1">
                  <div className="font-bold text-xs text-slate-900">Hapus Nilai Kolom Tertentu</div>
                  <div className="text-[11px] text-slate-500 mb-2">Pilih satu kolom yang ingin dikosongkan nilainya untuk semua siswa:</div>
                  <select
                    disabled={deleteType !== 'column'}
                    value={selectedColumnToDelete}
                    onChange={(e) => setSelectedColumnToDelete(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-white outline-none"
                  >
                    {Array.from({ length: asCount }, (_, i) => `AS${i + 1}`).map((asKey) => (
                      <option key={asKey} value={asKey}>Sumatif & Remedial ({asKey})</option>
                    ))}
                    <option value="ASTS">Asesmen Sumatif Tengah Semester (ASTS)</option>
                    <option value="ASAS">Asesmen Sumatif Akhir Semester (ASAS)</option>
                  </select>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition ${deleteType === 'remedial' ? 'border-red-500 bg-red-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input
                  type="radio"
                  name="del_opt"
                  checked={deleteType === 'remedial'}
                  onChange={() => setDeleteType('remedial')}
                  className="mt-1 text-red-600"
                />
                <div>
                  <div className="font-bold text-xs text-slate-900">Hapus Nilai Remedial Saja</div>
                  <div className="text-[11px] text-slate-500">Hanya mengosongkan nilai remedial tanpa menghapus nilai murni asesmen sumatif.</div>
                </div>
              </label>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-center gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Tindakan ini tidak dapat dibatalkan setelah dikonfirmasi. Pastikan Anda telah mengekspor leger nilai jika diperlukan.</span>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteType === 'all') handleDeleteAllGrades();
                  else if (deleteType === 'column') handleDeleteColumnGrades();
                  else if (deleteType === 'remedial') handleDeleteRemedialOnly();
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Eraser className="w-3.5 h-3.5" /> Konfirmasi Kosongkan Nilai
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
