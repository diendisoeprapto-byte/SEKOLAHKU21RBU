import React, { useMemo, useState } from 'react';
import {
  Heart,
  Users,
  Smile,
  Layers,
  AlertCircle,
  Search,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { Student, isSiswaInklusi } from '../../types';
import { CLASSES_LIST } from '../../utils/storage';

interface Props {
  students: Student[];
  activeYear: string;
}

export const VerifikasiInklusiTab: React.FC<Props> = ({ students, activeYear }) => {
  const [selectedClass, setSelectedClass] = useState<string>('SEMUA');
  const [selectedCategory, setSelectedCategory] = useState<string>('SEMUA');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const totalSiswaAll = students.length;
  const siswaInklusiList = useMemo(
    () => students.filter((s) => isSiswaInklusi(s.kebutuhanKhusus)),
    [students]
  );
  const totalInklusi = siswaInklusiList.length;
  const totalReguler = totalSiswaAll - totalInklusi;

  const inklusiCategories = useMemo(() => {
    const map: Record<string, number> = {};
    siswaInklusiList.forEach((s) => {
      const kat = s.kebutuhanKhusus?.trim() || 'Kebutuhan Khusus Lainnya';
      map[kat] = (map[kat] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [siswaInklusiList]);

  const totalKategoriInklusi = inklusiCategories.length;

  const filteredInklusiStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return siswaInklusiList.filter((s) => {
      if (selectedClass !== 'SEMUA' && s.kelas !== selectedClass) return false;
      const kat = s.kebutuhanKhusus?.trim() || 'Kebutuhan Khusus Lainnya';
      if (selectedCategory !== 'SEMUA' && kat !== selectedCategory) return false;
      if (q) {
        const matchName = (s.nama || '').toLowerCase().includes(q);
        const matchNisn = (s.nisn || '').toLowerCase().includes(q);
        const matchKat = kat.toLowerCase().includes(q);
        if (!matchName && !matchNisn && !matchKat) return false;
      }
      return true;
    });
  }, [siswaInklusiList, selectedClass, selectedCategory, searchQuery]);

  const pctInklusi = totalSiswaAll > 0 ? Math.round((totalInklusi / totalSiswaAll) * 100) : 0;
  const pctReguler = totalSiswaAll > 0 ? Math.round((totalReguler / totalSiswaAll) * 100) : 0;

  return (
    <section className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 rounded-3xl p-6 sm:p-8 text-white shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="inline-block text-[10px] font-black uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full mb-1.5">
              Verifikasi Data Peserta Didik • TA {activeYear}
            </span>
            <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight">
              Verifikasi Siswa Inklusi (ABK) &amp; Reguler
            </h2>
            <p className="text-xs sm:text-sm text-amber-50 mt-1 max-w-2xl">
              Rekapitulasi jumlah siswa inklusi, siswa reguler, total seluruh siswa dari kelas 1A s.d. 6B, serta jumlah kategori kebutuhan khusus yang dimiliki sekolah.
            </p>
          </div>
        </div>
      </div>

      {/* 4 Kartu Ringkasan Utama */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Jumlah Siswa Inklusi */}
        <div className="bg-white p-5 rounded-3xl border-2 border-amber-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-700">
              Jumlah Siswa Inklusi
            </span>
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Heart className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-display font-black text-amber-800">
            {totalInklusi} <span className="text-sm font-bold text-slate-500">Siswa</span>
          </div>
          <p className="text-[11px] font-bold text-amber-700">
            {pctInklusi}% dari total seluruh peserta didik
          </p>
        </div>

        {/* Card 2: Jumlah Siswa Reguler */}
        <div className="bg-white p-5 rounded-3xl border-2 border-emerald-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
              Jumlah Siswa Reguler
            </span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-display font-black text-emerald-800">
            {totalReguler} <span className="text-sm font-bold text-slate-500">Siswa</span>
          </div>
          <p className="text-[11px] font-bold text-emerald-700">
            {pctReguler}% peserta didik reguler (Non-ABK)
          </p>
        </div>

        {/* Card 3: Total Siswa */}
        <div className="bg-white p-5 rounded-3xl border-2 border-sky-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-sky-700">
              Total Siswa
            </span>
            <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-display font-black text-slate-800">
            {totalSiswaAll} <span className="text-sm font-bold text-slate-500">Siswa</span>
          </div>
          <p className="text-[11px] font-bold text-sky-700">
            Gabungan seluruh 12 rombel (1A – 6B)
          </p>
        </div>

        {/* Card 4: Jumlah Kategori Inklusi yang Dimiliki */}
        <div className="bg-white p-5 rounded-3xl border-2 border-purple-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-purple-700">
              Jumlah Kategori Inklusi
            </span>
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-display font-black text-purple-800">
            {totalKategoriInklusi} <span className="text-sm font-bold text-slate-500">Kategori</span>
          </div>
          <p className="text-[11px] font-bold text-purple-700">
            {totalKategoriInklusi > 0
              ? 'Jenis kebutuhan khusus terdata aktif'
              : 'Belum ada kategori ABK terdata'}
          </p>
        </div>
      </div>

      {/* Rincian Kategori Inklusi yang Dimiliki */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-600" />
              Rincian Kategori Inklusi yang Dimiliki ({totalKategoriInklusi} Kategori)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik salah satu kategori di bawah untuk memfilter daftar peserta didik inklusi.
            </p>
          </div>
          {selectedCategory !== 'SEMUA' && (
            <button
              type="button"
              onClick={() => setSelectedCategory('SEMUA')}
              className="text-xs font-extrabold text-rose-600 hover:text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 cursor-pointer"
            >
              Tampilkan Semua Kategori
            </button>
          )}
        </div>

        {inklusiCategories.length === 0 ? (
          <div className="text-center py-6 px-4 rounded-2xl bg-slate-50 border border-slate-200">
            <Smile className="w-9 h-9 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-700 text-sm">
              0 Kategori Inklusi Terdata
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Seluruh {totalSiswaAll} peserta didik saat ini berstatus sebagai Siswa Reguler.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {inklusiCategories.map(([katName, count]) => {
              const isSelected = selectedCategory === katName;
              const pctKat = totalInklusi > 0 ? Math.round((count / totalInklusi) * 100) : 0;
              return (
                <button
                  key={katName}
                  type="button"
                  onClick={() => setSelectedCategory(isSelected ? 'SEMUA' : katName)}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300 shadow-xs'
                      : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-amber-300'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block text-xs font-black text-slate-800 truncate" title={katName}>
                      {katName}
                    </span>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      {pctKat}% dari total siswa inklusi
                    </span>
                  </div>
                  <span className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 font-display font-black text-xs border border-amber-200">
                    {count} Siswa
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Keterangan Aturan Verifikasi:</strong> Siswa dengan status{' '}
            <em>&quot;Tidak Ada (Reguler)&quot;</em>, <em>&quot;Reguler&quot;</em>, <em>&quot;Siswa Reguler&quot;</em>, atau kosong dihitung sebagai{' '}
            <strong>Siswa Reguler ({totalReguler} siswa)</strong>. Hanya siswa dengan kategori kebutuhan khusus resmi yang masuk ke hitungan{' '}
            <strong>Siswa Inklusi ({totalInklusi} siswa)</strong>.
          </div>
        </div>
      </div>

      {/* Daftar & Filter Siswa Inklusi */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-display font-black text-base text-slate-800">
              Daftar Peserta Didik Inklusi ({filteredInklusiStudents.length} Siswa)
            </h3>
            <p className="text-xs text-slate-500">
              Data terverifikasi langsung dari basis data peserta didik sekolah.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama / NISN..."
                className="pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none text-xs font-bold text-slate-700"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none text-xs font-bold text-slate-700 cursor-pointer"
              >
                <option value="SEMUA">Semua Rombel</option>
                {CLASSES_LIST.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filteredInklusiStudents.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-2xl bg-slate-50 border border-slate-200">
            <Smile className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-700 text-sm">
              Tidak ada siswa inklusi yang cocok dengan filter saat ini
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Total Siswa Reguler: {totalReguler} • Total Siswa Inklusi: {totalInklusi} • Total Keseluruhan: {totalSiswaAll} Siswa.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">No</th>
                  <th className="p-3">Nama Siswa</th>
                  <th className="p-3">NISN</th>
                  <th className="p-3">Kelas</th>
                  <th className="p-3">L/P</th>
                  <th className="p-3">Kategori Kebutuhan Khusus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInklusiStudents.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-amber-50/50 transition">
                    <td className="p-3 text-slate-500 font-mono">{idx + 1}</td>
                    <td className="p-3 font-bold text-slate-800">{s.nama}</td>
                    <td className="p-3 font-mono text-slate-600">{s.nisn || '-'}</td>
                    <td className="p-3">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-bold text-[11px]">
                        {s.kelas}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-700">{s.jenisKelamin}</td>
                    <td className="p-3">
                      <span className="bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg text-[11px] font-bold inline-block">
                        {s.kebutuhanKhusus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
