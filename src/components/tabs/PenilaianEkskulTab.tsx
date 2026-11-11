import React, { useState, useEffect } from 'react';
import {
  Award,
  Save,
  Printer,
  FileSpreadsheet,
  Users,
  Search,
  Filter,
  CheckCircle2,
  Sparkles,
  Info,
  Calendar,
  Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student } from '../../types';
import { pushAllDataToCloud } from '../../utils/cloudSync';

export interface EkskulAssessmentItem {
  studentId: string;
  predikat: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Kurang' | 'Perlu Bimbingan';
  keterangan: string;
}

export type PenilaianEkskulStore = Record<string, EkskulAssessmentItem[]>; // Key: ekskulId

/**
 * Template deskripsi pencapaian ekstrakurikuler Kurikulum Merdeka
 * Disesuaikan otomatis dengan nama peserta didik, nama ekstrakurikuler, dan nilai predikat (A, B, C, D)
 */
export const getEkskulDeskripsiTemplate = (
  predikat: string,
  namaSiswa: string,
  namaEkskul: string
): string => {
  const p = (predikat || '').toLowerCase();
  const ekskulLabel = namaEkskul ? `ekstrakurikuler ${namaEkskul}` : 'ekstrakurikuler';
  const siswa = namaSiswa || 'Peserta didik';

  if (p.includes('sangat') || p === 'a') {
    return `Peserta didik ${siswa} menunjukkan antusiasme, kedisiplinan, dan partisipasi yang sangat tinggi dalam setiap kegiatan. Mampu menjadi teladan bagi teman-temannya, memiliki inisiatif, serta menunjukkan penguasaan keterampilan yang sangat menonjol pada ${ekskulLabel} yang diikuti.`;
  }
  if (p === 'baik' || p === 'b') {
    return `Peserta didik ${siswa} menunjukkan minat, kedisiplinan, dan partisipasi yang baik secara konsisten. Mampu berkolaborasi, aktif mengikuti instruksi pembina, dan menunjukkan perkembangan keterampilan yang memadai pada ${ekskulLabel} yang diikuti.`;
  }
  if (p.includes('cukup') || p === 'c') {
    return `Peserta didik ${siswa} menunjukkan partisipasi yang cukup dalam kegiatan, namun masih membutuhkan motivasi untuk meningkatkan kedisiplinan dan antusiasme. Keterampilan dasar sudah mulai terlihat dan akan berkembang lebih optimal dengan bimbingan serta latihan yang lebih rutin pada ${ekskulLabel}.`;
  }
  // Nilai D (Perlu Bimbingan / Kurang)
  return `Peserta didik ${siswa} membutuhkan pendampingan dan dorongan yang lebih intensif untuk berpartisipasi dalam kegiatan ${ekskulLabel}. Kehadiran, kedisiplinan, serta fokus saat mengikuti arahan pembina masih perlu banyak ditingkatkan agar potensi yang dimiliki dapat tergali dengan baik di masa mendatang.`;
};

interface Props {
  students: Student[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom?: (url: string, title: string) => void;
}

export const getStoredPenilaianEkskul = (): PenilaianEkskulStore => {
  try {
    const saved = localStorage.getItem('sekolahku_penilaian_ekskul');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(e);
  }
  return {};
};

export const saveStoredPenilaianEkskul = (data: PenilaianEkskulStore) => {
  localStorage.setItem('sekolahku_penilaian_ekskul', JSON.stringify(data));
};

export const PenilaianEkskulTab: React.FC<Props> = ({
  students,
  showToast,
  onOpenZoom,
}) => {
  // Load ekskul list
  const [ekskulList, setEkskulList] = useState<
    Array<{
      id?: string;
      nama: string;
      pembina: string;
      hari: string;
      waktu: string;
      anggotaIds?: string[];
    }>
  >(() => {
    try {
      const saved = localStorage.getItem('sekolahku_ekskul_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [
      { id: 'ek_1', nama: 'Pramuka Siaga / Penggalang', pembina: 'Budi Santoso, M.Pd.', hari: 'Jumat', waktu: '13.00 - 15.00 WIB', anggotaIds: [] },
      { id: 'ek_2', nama: 'Seni Tari Tradisional Betawi', pembina: 'Hj. Siti Aminah, S.Pd.', hari: 'Sabtu', waktu: '08.00 - 10.00 WIB', anggotaIds: [] },
      { id: 'ek_3', nama: 'Dokter Kecil / PMR SD', pembina: 'Dewi Lestari, S.Pd.', hari: 'Sabtu', waktu: '10.00 - 11.30 WIB', anggotaIds: [] },
      { id: 'ek_4', nama: 'Futsal & Olahraga Atletik', pembina: 'Budi Santoso, M.Pd.', hari: 'Selasa', waktu: '15.00 - 17.00 WIB', anggotaIds: [] },
      { id: 'ek_5', nama: 'Seni Musik & Marawis', pembina: 'Ahmad Fauzi, S.Pd.I', hari: 'Kamis', waktu: '14.00 - 15.30 WIB', anggotaIds: [] },
    ];
  });

  const [selectedEkskulId, setSelectedEkskulId] = useState<string>(
    ekskulList[0]?.id || 'ek_1'
  );
  const [penilaianStore, setPenilaianStore] = useState<PenilaianEkskulStore>(
    getStoredPenilaianEkskul()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  const activeEkskul =
    ekskulList.find((e) => e.id === selectedEkskulId) || ekskulList[0];

  // Get enrolled students for this ekskul
  const enrolledStudentIds = activeEkskul?.anggotaIds || [];
  
  // If no enrolled members yet, allow evaluating students in school or show all
  const displayStudents = students.filter((s) => {
    if (enrolledStudentIds.length > 0 && !enrolledStudentIds.includes(s.id)) {
      return false;
    }
    if (classFilter !== 'all' && s.kelas !== classFilter) return false;
    if (
      searchQuery &&
      !s.nama.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !s.nisn.includes(searchQuery)
    ) {
      return false;
    }
    return true;
  });

  const currentEkskulGrades = penilaianStore[selectedEkskulId] || [];

  const getStudentGrade = (studentId: string): EkskulAssessmentItem => {
    const found = currentEkskulGrades.find((g) => g.studentId === studentId);
    if (found) return found;
    const sName = students.find((s) => s.id === studentId)?.nama || 'Peserta didik';
    return {
      studentId,
      predikat: 'Sangat Baik',
      keterangan: getEkskulDeskripsiTemplate('Sangat Baik', sName, activeEkskul?.nama || 'Ekstrakurikuler'),
    };
  };

  const handleUpdateStudentGrade = (
    studentId: string,
    field: 'predikat' | 'keterangan',
    value: any,
    studentName?: string
  ) => {
    const existing = getStudentGrade(studentId);
    let newKeterangan = existing.keterangan;

    // Jika predikat diubah, otomatis generate deskripsi sesuai predikat, nama siswa, dan ekskul
    if (field === 'predikat') {
      const sName = studentName || students.find((s) => s.id === studentId)?.nama || 'Peserta didik';
      newKeterangan = getEkskulDeskripsiTemplate(value, sName, activeEkskul?.nama || 'Ekstrakurikuler');
    } else {
      newKeterangan = value;
    }

    const updatedItem: EkskulAssessmentItem = {
      ...existing,
      predikat: field === 'predikat' ? value : existing.predikat,
      keterangan: newKeterangan,
    };

    const newGradeList = [
      ...currentEkskulGrades.filter((g) => g.studentId !== studentId),
      updatedItem,
    ];

    const newStore = {
      ...penilaianStore,
      [selectedEkskulId]: newGradeList,
    };

    setPenilaianStore(newStore);
  };

  const handleRegenerateDeskripsi = (studentId: string, predikat: string, studentName: string) => {
    const template = getEkskulDeskripsiTemplate(predikat, studentName, activeEkskul?.nama || 'Ekstrakurikuler');
    handleUpdateStudentGrade(studentId, 'keterangan', template, studentName);
    showToast(`Deskripsi otomatis untuk ${studentName} berhasil disesuaikan!`, 'success');
  };

  const handleSaveAll = () => {
    // Ensure all displayed students have an assessment entry
    const completedGrades = displayStudents.map((s) => getStudentGrade(s.id));
    const newStore = {
      ...penilaianStore,
      [selectedEkskulId]: completedGrades,
    };

    setPenilaianStore(newStore);
    saveStoredPenilaianEkskul(newStore);
    pushAllDataToCloud({ penilaianEkskul: newStore });
    showToast(
      `Penilaian untuk ekstrakurikuler ${activeEkskul?.nama} (${completedGrades.length} siswa) berhasil disimpan!`,
      'success'
    );
  };

  const handleAutoFillPredikat = (predikat: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Perlu Bimbingan') => {
    const autoList: EkskulAssessmentItem[] = displayStudents.map((s) => ({
      studentId: s.id,
      predikat,
      keterangan: getEkskulDeskripsiTemplate(predikat, s.nama, activeEkskul?.nama || 'Ekstrakurikuler'),
    }));

    const newStore = {
      ...penilaianStore,
      [selectedEkskulId]: autoList,
    };

    setPenilaianStore(newStore);
    showToast(`Seluruh siswa diisi ${predikat} beserta deskripsi otomatis! Klik 'Simpan Penilaian' untuk menyimpan permanen.`, 'success');
  };

  const handleExportExcel = () => {
    const wsData = [
      ['PENILAIAN EKSTRAKURIKULER SISWA'],
      ['SDN RAWA BADAK UTARA 21 - JAKARTA UTARA'],
      [`Ekstrakurikuler: ${activeEkskul?.nama}`],
      [`Pembina: ${activeEkskul?.pembina} | Hari: ${activeEkskul?.hari} | Waktu: ${activeEkskul?.waktu}`],
      [],
      ['No', 'NISN', 'Nama Peserta Didik', 'Kelas', 'Predikat Kualitatif', 'Deskripsi Pencapaian'],
      ...displayStudents.map((s, idx) => {
        const g = getStudentGrade(s.id);
        return [
          idx + 1,
          s.nisn,
          s.nama,
          s.kelas,
          g.predikat,
          g.keterangan,
        ];
      }),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Penilaian Ekskul');
    XLSX.writeFile(wb, `Penilaian_Ekskul_${activeEkskul?.nama.replace(/\s+/g, '_')}.xlsx`);
    showToast('Berkas Excel Penilaian Ekskul berhasil diunduh!', 'success');
  };

  return (
    <section className="space-y-6">
      {/* Header bar */}
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
            Menu 4. Penilaian & Pelaporan • Ekstrakurikuler
          </span>
          <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-600" /> Penilaian Ekstrakurikuler Siswa
          </h2>
          <p className="text-xs text-slate-500">
            Kelola nilai predikat kualitatif (Sangat Baik, Baik, Cukup, Kurang) dan deskripsi pencapaian bakat siswa. Terkoneksi otomatis dengan e-Rapor Kurikulum Merdeka.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-display font-extrabold px-3.5 py-2.5 rounded-2xl text-xs border border-emerald-200 flex items-center gap-2 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" /> Ekspor Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-display font-extrabold px-3.5 py-2.5 rounded-2xl text-xs flex items-center gap-2 transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" /> Cetak Lembar
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-5 py-2.5 rounded-2xl text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 transition cursor-pointer"
          >
            <Save className="w-4 h-4" /> Simpan Penilaian
          </button>
        </div>
      </div>

      {/* Selector & Filters */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center">
          {/* Ekskul Selector */}
          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Pilih Ekstrakurikuler yang Dinilai:
            </label>
            <select
              value={selectedEkskulId}
              onChange={(e) => setSelectedEkskulId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl border-2 border-emerald-500 bg-white font-display font-extrabold text-xs text-slate-800 outline-none cursor-pointer focus:ring-2 focus:ring-emerald-200"
            >
              {ekskulList.map((ek) => (
                <option key={ek.id} value={ek.id}>
                  {ek.nama} ({ek.anggotaIds?.length || 0} Anggota Terdaftar)
                </option>
              ))}
            </select>
          </div>

          {/* Class Filter */}
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Filter Kelas:
            </label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="all">Semua Kelas</option>
              {['Kelas 1A', 'Kelas 1B', 'Kelas 2A', 'Kelas 2B', 'Kelas 3A', 'Kelas 3B', 'Kelas 4A', 'Kelas 4B', 'Kelas 5A', 'Kelas 5B', 'Kelas 6A', 'Kelas 6B'].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Cari Nama / NISN Siswa:
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama siswa..."
                className="w-full pl-9 pr-3 py-2 rounded-2xl border border-slate-300 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Ekskul Info Card & Quick Fill */}
        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display font-black text-slate-900 text-sm">
                {activeEkskul?.nama}
              </div>
              <div className="text-[11px] text-slate-600 flex items-center gap-3 mt-0.5">
                <span>Pembina: <strong>{activeEkskul?.pembina}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-emerald-700" /> {activeEkskul?.hari}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-emerald-700" /> {activeEkskul?.waktu}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-600 mr-1">Isi Cepat Semua:</span>
            <button
              type="button"
              onClick={() => handleAutoFillPredikat('Sangat Baik')}
              className="px-2.5 py-1 rounded-xl bg-white hover:bg-emerald-100 text-emerald-800 text-[11px] font-extrabold border border-emerald-300 transition cursor-pointer shadow-2xs"
            >
              Semua Nilai A (Sangat Baik)
            </button>
            <button
              type="button"
              onClick={() => handleAutoFillPredikat('Baik')}
              className="px-2.5 py-1 rounded-xl bg-white hover:bg-sky-100 text-sky-800 text-[11px] font-extrabold border border-sky-300 transition cursor-pointer shadow-2xs"
            >
              Semua Nilai B (Baik)
            </button>
            <button
              type="button"
              onClick={() => handleAutoFillPredikat('Cukup')}
              className="px-2.5 py-1 rounded-xl bg-white hover:bg-amber-100 text-amber-800 text-[11px] font-extrabold border border-amber-300 transition cursor-pointer shadow-2xs"
            >
              Semua Nilai C (Cukup)
            </button>
            <button
              type="button"
              onClick={() => handleAutoFillPredikat('Perlu Bimbingan')}
              className="px-2.5 py-1 rounded-xl bg-white hover:bg-rose-100 text-rose-800 text-[11px] font-extrabold border border-rose-300 transition cursor-pointer shadow-2xs"
            >
              Semua Nilai D (Perlu Bimbingan)
            </button>
          </div>
        </div>
      </div>

      {/* Assessment Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-black text-slate-800">
            <Users className="w-4 h-4 text-emerald-600" />
            <span>Daftar Siswa Peserta ({displayStudents.length} Siswa)</span>
          </div>
          {enrolledStudentIds.length === 0 && (
            <span className="text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              Menampilkan seluruh siswa sekolah (Anggota ekskul belum dikunci di menu Kurikulum)
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200 text-center">
                <th className="p-3 w-12 border-r border-slate-200">No</th>
                <th className="p-3 min-w-[220px] text-left border-r border-slate-200">Peserta Didik</th>
                <th className="p-3 w-28 border-r border-slate-200">Kelas</th>
                <th className="p-3 w-48 border-r border-slate-200">Nilai Predikat</th>
                <th className="p-3 min-w-[340px] text-left">Deskripsi Pencapaian / Catatan Pembina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayStudents.map((s, idx) => {
                const grade = getStudentGrade(s.id);
                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 text-center font-mono font-bold text-slate-500 border-r border-slate-200">
                      {idx + 1}
                    </td>
                    <td className="p-3 border-r border-slate-200">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={s.fotoUrl || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=100'}
                          alt={s.nama}
                          onClick={() => onOpenZoom?.(s.fotoUrl, s.nama)}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0 cursor-zoom-in"
                        />
                        <div>
                          <div className="font-bold text-slate-900 leading-tight">{s.nama}</div>
                          <div className="text-[10px] font-mono text-slate-500">NISN: {s.nisn}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center font-bold text-slate-700 border-r border-slate-200">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                        {s.kelas}
                      </span>
                    </td>
                    <td className="p-3 border-r border-slate-200">
                      <select
                        value={grade.predikat}
                        onChange={(e) =>
                          handleUpdateStudentGrade(
                            s.id,
                            'predikat',
                            e.target.value as any,
                            s.nama
                          )
                        }
                        className={`w-full px-3 py-1.5 rounded-xl border text-xs font-black outline-none cursor-pointer ${
                          grade.predikat === 'Sangat Baik'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : grade.predikat === 'Baik'
                            ? 'bg-sky-50 text-sky-800 border-sky-300'
                            : grade.predikat === 'Cukup'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        <option value="Sangat Baik">Nilai A (Sangat Baik)</option>
                        <option value="Baik">Nilai B (Baik)</option>
                        <option value="Cukup">Nilai C (Cukup)</option>
                        <option value="Perlu Bimbingan">Nilai D (Perlu Bimbingan)</option>
                        <option value="Kurang">Nilai D (Kurang)</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <div className="flex items-start gap-2">
                        <textarea
                          rows={2}
                          value={grade.keterangan}
                          onChange={(e) =>
                            handleUpdateStudentGrade(s.id, 'keterangan', e.target.value, s.nama)
                          }
                          placeholder="Deskripsi pencapaian otomatis terisi sesuai predikat..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 leading-relaxed"
                        />
                        <button
                          type="button"
                          onClick={() => handleRegenerateDeskripsi(s.id, grade.predikat, s.nama)}
                          title="Generate Ulang Deskripsi Standar Sesuai Predikat"
                          className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 cursor-pointer transition shadow-2xs mt-0.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {displayStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-xs text-slate-400 italic">
                    Tidak ada siswa yang ditemukan pada filter ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Info className="w-4 h-4 text-emerald-600" />
            <span>
              Nilai yang disimpan di sini otomatis muncul pada lembar <strong>e-Rapor Merdeka</strong> masing-masing peserta didik.
            </span>
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-6 py-2.5 rounded-2xl text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 transition cursor-pointer"
          >
            <Save className="w-4 h-4" /> Simpan Penilaian Ekstrakurikuler
          </button>
        </div>
      </div>
    </section>
  );
};
