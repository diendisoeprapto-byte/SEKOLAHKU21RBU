import React, { useState, useRef, useMemo } from 'react';
import {
  Users,
  FileDown,
  Upload,
  FileSpreadsheet,
  Plus,
  Edit,
  Trash2,
  Filter,
  Briefcase,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
} from 'lucide-react';
import { Teacher } from '../../types';
import {
  downloadTemplateTeachersXLSX,
  exportTeachersToXLSX,
  parseImportTeachersXLSX,
  generateAccountUsername,
} from '../../utils/excel';

type TeacherSortOption =
  | 'nama-asc'
  | 'nama-desc'
  | 'status-asc'
  | 'status-desc'
  | 'nip-asc'
  | 'nip-desc'
  | 'tmt-asc'
  | 'tmt-desc'
  | 'jabatan-asc'
  | 'jabatan-desc';

const STATUS_PEGAWAI_ORDER: Record<string, number> = {
  PNS: 1,
  PPPK: 2,
  KKI: 3,
  Honor: 4,
};

interface Props {
  teachers: Teacher[];
  onSaveTeachers: (teachers: Teacher[]) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

export const GuruTab: React.FC<Props> = ({
  teachers,
  onSaveTeachers,
  showToast,
  onOpenZoom,
}) => {
  const [filterJabatan, setFilterJabatan] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<TeacherSortOption>('nama-asc');
  const [editId, setEditId] = useState<string | null>(null);
  const [nama, setNama] = useState('');
  const [statusPegawai, setStatusPegawai] = useState<'PNS' | 'PPPK' | 'KKI' | 'Honor'>('PNS');
  const [nip, setNip] = useState('');
  const [tempatLahir, setTempatLahir] = useState('');
  const [tanggalLahir, setTanggalLahir] = useState('');
  const [tmtPertama, setTmtPertama] = useState('');
  const [statusPernikahan, setStatusPernikahan] = useState<'Menikah' | 'Belum Menikah' | 'Janda' | 'Duda'>('Menikah');
  const [penugasan, setPenugasan] = useState('Tata Usaha');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('123');
  const [fotoUrl, setFotoUrl] = useState('https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportTeachers = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { newTeachers, count } = await parseImportTeachersXLSX(file, teachers);
      if (count === 0) {
        showToast('Tidak ada data guru yang valid di dalam file Excel!', 'error');
        return;
      }
      onSaveTeachers([...teachers, ...newTeachers]);
      showToast(`Berhasil mengimpor ${count} data guru! Akun login (username & password otomatis) siap digunakan.`, 'success');
    } catch (err: any) {
      showToast(`Gagal membaca file Excel: ${err?.message || 'Format data tidak valid'}`, 'error');
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setFotoUrl(reader.result as string);
        showToast('Foto guru berhasil dimuat!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = (t: Teacher) => {
    setEditId(t.id);
    setNama(t.nama);
    setStatusPegawai(t.statusPegawai);
    setNip(t.nip);
    setTempatLahir(t.tempatLahir);
    setTanggalLahir(t.tanggalLahir);
    setTmtPertama(t.tmtPertama);
    setStatusPernikahan(t.statusPernikahan);
    setPenugasan(t.penugasan);
    setUsername(t.username);
    setPassword(t.password);
    setFotoUrl(t.fotoUrl);
  };

  const handleReset = () => {
    setEditId(null);
    setNama('');
    setStatusPegawai('PNS');
    setNip('');
    setTempatLahir('');
    setTanggalLahir('');
    setTmtPertama('');
    setStatusPernikahan('Menikah');
    setPenugasan('Kelas 6A');
    setUsername('');
    setPassword('123');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim()) {
      showToast('Harap isi nama guru!', 'error');
      return;
    }

    const finalUsername = username.trim() || generateAccountUsername(nama, nip);
    const finalPassword = password.trim() || '123';

    if (editId) {
      const updated = teachers.map((t) =>
        t.id === editId
          ? {
              ...t,
              nama,
              statusPegawai,
              nip,
              tempatLahir,
              tanggalLahir,
              tmtPertama,
              statusPernikahan,
              penugasan,
              username: finalUsername,
              password: finalPassword,
              fotoUrl,
            }
          : t
      );
      onSaveTeachers(updated);
      showToast(`Data guru ${nama} berhasil diperbarui!`, 'success');
    } else {
      const newTeacher: Teacher = {
        id: `t_${Date.now()}`,
        nama,
        statusPegawai,
        nip,
        tempatLahir,
        tanggalLahir,
        tmtPertama,
        statusPernikahan,
        penugasan,
        username: finalUsername,
        password: finalPassword,
        fotoUrl,
      };
      onSaveTeachers([...teachers, newTeacher]);
      showToast(`Guru ${nama} berhasil ditambahkan! Akun: ${finalUsername}`, 'success');
    }
    handleReset();
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Yakin ingin menghapus guru ${name}?`)) {
      onSaveTeachers(teachers.filter((t) => t.id !== id));
      showToast(`Guru ${name} berhasil dihapus`, 'success');
    }
  };

  const filteredAndSortedTeachers = useMemo(() => {
    const filtered = teachers.filter((t) => {
      const matchesJabatan =
        filterJabatan === 'all'
          ? true
          : filterJabatan === 'guru'
          ? !['Tata Usaha', 'Penjaga Sekolah', 'Laboran', 'Petugas Kebersihan', 'Kepala Sekolah'].includes(t.penugasan)
          : t.penugasan === filterJabatan;
      if (!matchesJabatan) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (t.nama || '').toLowerCase().includes(q) ||
        (t.nip || '').toLowerCase().includes(q) ||
        (t.penugasan || '').toLowerCase().includes(q) ||
        (t.statusPegawai || '').toLowerCase().includes(q) ||
        (t.username || '').toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const compareName = () =>
        (a.nama || '').localeCompare(b.nama || '', 'id', { sensitivity: 'base' });

      switch (sortBy) {
        case 'nama-desc':
          return (b.nama || '').localeCompare(a.nama || '', 'id', { sensitivity: 'base' });
        case 'status-asc': {
          const rankA = STATUS_PEGAWAI_ORDER[a.statusPegawai] ?? 99;
          const rankB = STATUS_PEGAWAI_ORDER[b.statusPegawai] ?? 99;
          return rankA !== rankB ? rankA - rankB : compareName();
        }
        case 'status-desc': {
          const rankA = STATUS_PEGAWAI_ORDER[a.statusPegawai] ?? 0;
          const rankB = STATUS_PEGAWAI_ORDER[b.statusPegawai] ?? 0;
          return rankA !== rankB ? rankB - rankA : compareName();
        }
        case 'nip-asc': {
          const cmp = (a.nip || '').localeCompare(b.nip || '', undefined, { numeric: true });
          return cmp !== 0 ? cmp : compareName();
        }
        case 'nip-desc': {
          const cmp = (b.nip || '').localeCompare(a.nip || '', undefined, { numeric: true });
          return cmp !== 0 ? cmp : compareName();
        }
        case 'tmt-asc': {
          const tA = a.tmtPertama || '9999-99-99';
          const tB = b.tmtPertama || '9999-99-99';
          const cmp = tA.localeCompare(tB);
          return cmp !== 0 ? cmp : compareName();
        }
        case 'tmt-desc': {
          const tA = a.tmtPertama || '';
          const tB = b.tmtPertama || '';
          const cmp = tB.localeCompare(tA);
          return cmp !== 0 ? cmp : compareName();
        }
        case 'jabatan-asc': {
          const cmp = (a.penugasan || '').localeCompare(b.penugasan || '', 'id', { numeric: true, sensitivity: 'base' });
          return cmp !== 0 ? cmp : compareName();
        }
        case 'jabatan-desc': {
          const cmp = (b.penugasan || '').localeCompare(a.penugasan || '', 'id', { numeric: true, sensitivity: 'base' });
          return cmp !== 0 ? cmp : compareName();
        }
        case 'nama-asc':
        default:
          return compareName();
      }
    });
  }, [teachers, filterJabatan, searchQuery, sortBy]);

  const handleToggleColumnSort = (col: 'nama' | 'status' | 'nip' | 'tmt' | 'jabatan') => {
    setSortBy((prev) => {
      if (col === 'nama') return prev === 'nama-asc' ? 'nama-desc' : 'nama-asc';
      if (col === 'status') return prev === 'status-asc' ? 'status-desc' : 'status-asc';
      if (col === 'nip') return prev === 'nip-asc' ? 'nip-desc' : 'nip-asc';
      if (col === 'tmt') return prev === 'tmt-asc' ? 'tmt-desc' : 'tmt-asc';
      if (col === 'jabatan') return prev === 'jabatan-asc' ? 'jabatan-desc' : 'jabatan-asc';
      return 'nama-asc';
    });
  };

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase bg-rose-100 text-rose-700 px-3 py-1 rounded-full">
              Kepegawaian SDN Rawa Badak Utara 21
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1">
              Manajemen Data, Akun Login & Foto Guru
            </h2>
            <p className="text-xs text-slate-500">
              Dilengkapi Nama, NIP/NIPPPK, TTL, TMT Pertama, Status Pernikahan, Penugasan (Wali Kelas, Guru Mapel, Tendik),
              serta Akun Login Otomatis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls, .csv"
              onChange={handleImportTeachers}
              className="hidden"
            />
            <button
              type="button"
              onClick={downloadTemplateTeachersXLSX}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Download format Excel untuk import data guru"
            >
              <FileDown className="w-4 h-4 text-sky-600" /> Template Guru (.XLSX)
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Import file Excel data guru dengan akun otomatis"
            >
              <Upload className="w-4 h-4" /> Import Guru (.XLSX)
            </button>
            <button
              type="button"
              onClick={() => exportTeachersToXLSX(teachers)}
              className="bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Guru (.XLSX)
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 bg-slate-50 p-5 rounded-3xl border border-slate-200">
          <div>
            <label className="block text-xs font-extrabold text-slate-600 mb-1">Nama Lengkap & Gelar</label>
            <input
              type="text"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              required
              placeholder="Contoh: Hj. Siti Aminah, S.Pd."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-600 mb-1">Status Pegawai</label>
            <select
              value={statusPegawai}
              onChange={(e) => setStatusPegawai(e.target.value as any)}
              className="w-full px-3.5 py-2 rounded-xl border-2 border-rose-600 text-xs font-extrabold bg-rose-50 text-rose-900"
            >
              <option value="PNS">1. PNS (NIP.)</option>
              <option value="PPPK">2. PPPK (NIPPPK.)</option>
              <option value="KKI">3. KKI (NIKKI.)</option>
              <option value="Honor">4. Honor ("-")</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-600 mb-1">NIP / NIPPPK / NIKKI</label>
            <input
              type="text"
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              placeholder="19850412 201001 2 008"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-600 mb-1">Tempat Lahir</label>
            <input
              type="text"
              value={tempatLahir}
              onChange={(e) => setTempatLahir(e.target.value)}
              placeholder="Jakarta"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-600 mb-1">Tanggal Lahir</label>
            <input
              type="date"
              value={tanggalLahir}
              onChange={(e) => setTanggalLahir(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-600 mb-1">TMT Pertama</label>
            <input
              type="date"
              value={tmtPertama}
              onChange={(e) => setTmtPertama(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-600 mb-1">Status Pernikahan</label>
            <select
              value={statusPernikahan}
              onChange={(e) => setStatusPernikahan(e.target.value as any)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            >
              <option value="Menikah">Menikah</option>
              <option value="Belum Menikah">Belum Menikah</option>
              <option value="Janda">Janda</option>
              <option value="Duda">Duda</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-600 mb-1">Penugasan / Jabatan</label>
            <select
              value={penugasan}
              onChange={(e) => setPenugasan(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            >
              <optgroup label="Tenaga Kependidikan & Penunjang">
                <option value="Tata Usaha">Tata Usaha</option>
                <option value="Penjaga Sekolah">Penjaga Sekolah</option>
                <option value="Laboran">Laboran</option>
                <option value="Petugas Kebersihan">Petugas Kebersihan</option>
              </optgroup>
              <optgroup label="Pimpinan">
                <option value="Kepala Sekolah">Kepala Sekolah</option>
              </optgroup>
              <optgroup label="Wali Kelas">
                <option value="Kelas 1A">Wali Kelas 1A</option>
                <option value="Kelas 1B">Wali Kelas 1B</option>
                <option value="Kelas 2A">Wali Kelas 2A</option>
                <option value="Kelas 2B">Wali Kelas 2B</option>
                <option value="Kelas 3A">Wali Kelas 3A</option>
                <option value="Kelas 3B">Wali Kelas 3B</option>
                <option value="Kelas 4A">Wali Kelas 4A</option>
                <option value="Kelas 4B">Wali Kelas 4B</option>
                <option value="Kelas 5A">Wali Kelas 5A</option>
                <option value="Kelas 5B">Wali Kelas 5B</option>
                <option value="Kelas 6A">Wali Kelas 6A</option>
                <option value="Kelas 6B">Wali Kelas 6B</option>
              </optgroup>
              <optgroup label="Guru Mata Pelajaran">
                <option value="Guru PAIBP">Guru PAIBP</option>
                <option value="Guru PJOK">Guru PJOK</option>
                <option value="Guru Bahasa Inggris">Guru Bahasa Inggris</option>
                <option value="Guru PAKBP">Guru PAKBP</option>
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-600 mb-1">
              Username Login <span className="text-[10px] text-emerald-600 font-bold">(Otomatis jika kosong)</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Otomatis: nama_depan.belakang"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-600 mb-1">
              Password Login <span className="text-[10px] text-slate-400 font-normal">(Default 123)</span>
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="123"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-extrabold text-slate-600 mb-1">Upload Foto Guru / Tendik</label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-rose-600 file:text-white cursor-pointer"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-6 flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Reset Form
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> {editId ? 'Perbarui Data Pegawai' : 'Simpan Data Pegawai'}
            </button>
          </div>
        </form>

        {/* Filter Jabatan & Sort Data Bar */}
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs font-black text-slate-700">
              <Filter className="w-4 h-4 text-rose-600" />
              <span>Filter Jabatan / Bagian:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Sort Data Dropdown */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
                <ArrowUpDown className="w-3.5 h-3.5 text-rose-600" />
                <label htmlFor="guru-sort-select" className="text-xs font-bold text-slate-600">
                  Urutkan:
                </label>
                <select
                  id="guru-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as TeacherSortOption)}
                  className="bg-transparent text-xs font-black text-slate-800 focus:outline-hidden cursor-pointer"
                >
                  <option value="nama-asc">Nama Pegawai (A → Z)</option>
                  <option value="nama-desc">Nama Pegawai (Z → A)</option>
                  <option value="jabatan-asc">Jabatan / Penugasan (A → Z)</option>
                  <option value="jabatan-desc">Jabatan / Penugasan (Z → A)</option>
                  <option value="status-asc">Status Pegawai (PNS → Honor)</option>
                  <option value="status-desc">Status Pegawai (Honor → PNS)</option>
                  <option value="nip-asc">NIP / NIPPPK (Terkecil → Terbesar)</option>
                  <option value="nip-desc">NIP / NIPPPK (Terbesar → Terkecil)</option>
                  <option value="tmt-asc">TMT Pertama (Terlama → Terbaru)</option>
                  <option value="tmt-desc">TMT Pertama (Terbaru → Terlama)</option>
                </select>
              </div>

              {/* Pencarian Pegawai */}
              <div className="relative min-w-[210px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, NIP, jabatan..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Hapus pencarian"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold pt-1 border-t border-slate-200/70">
            <button
              type="button"
              onClick={() => setFilterJabatan('all')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterJabatan === 'all'
                  ? 'bg-rose-600 text-white font-black shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Semua ({teachers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterJabatan('Tata Usaha')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterJabatan === 'Tata Usaha'
                  ? 'bg-sky-600 text-white font-black shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-sky-50'
              }`}
            >
              Tata Usaha ({teachers.filter((t) => t.penugasan === 'Tata Usaha').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterJabatan('Penjaga Sekolah')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterJabatan === 'Penjaga Sekolah'
                  ? 'bg-amber-600 text-white font-black shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-amber-50'
              }`}
            >
              Penjaga Sekolah ({teachers.filter((t) => t.penugasan === 'Penjaga Sekolah').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterJabatan('Laboran')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterJabatan === 'Laboran'
                  ? 'bg-purple-600 text-white font-black shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-purple-50'
              }`}
            >
              Laboran ({teachers.filter((t) => t.penugasan === 'Laboran').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterJabatan('Petugas Kebersihan')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterJabatan === 'Petugas Kebersihan'
                  ? 'bg-teal-600 text-white font-black shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-teal-50'
              }`}
            >
              Petugas Kebersihan ({teachers.filter((t) => t.penugasan === 'Petugas Kebersihan').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterJabatan('guru')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterJabatan === 'guru'
                  ? 'bg-emerald-600 text-white font-black shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-emerald-50'
              }`}
            >
              Guru & Wali Kelas ({teachers.filter((t) => !['Tata Usaha', 'Penjaga Sekolah', 'Laboran', 'Petugas Kebersihan', 'Kepala Sekolah'].includes(t.penugasan)).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterJabatan('Kepala Sekolah')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterJabatan === 'Kepala Sekolah'
                  ? 'bg-rose-700 text-white font-black shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-rose-50'
              }`}
            >
              Kepala Sekolah ({teachers.filter((t) => t.penugasan === 'Kepala Sekolah').length})
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-xs uppercase font-extrabold">
                <th className="p-3 rounded-l-xl">
                  <button
                    type="button"
                    onClick={() => handleToggleColumnSort('nama')}
                    className="flex items-center gap-1 hover:text-rose-700 cursor-pointer uppercase font-extrabold"
                    title="Klik untuk mengurutkan Nama Pegawai A-Z / Z-A"
                  >
                    <span>Foto & Nama Pegawai</span>
                    {sortBy === 'nama-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-rose-600" />
                    ) : sortBy === 'nama-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggleColumnSort('status')}
                    className="inline-flex items-center justify-center gap-1 hover:text-rose-700 cursor-pointer uppercase font-extrabold"
                    title="Klik untuk mengurutkan berdasarkan Status Pegawai"
                  >
                    <span>Status Pegawai</span>
                    {sortBy === 'status-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-rose-600" />
                    ) : sortBy === 'status-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-3">
                  <button
                    type="button"
                    onClick={() => handleToggleColumnSort('nip')}
                    className="flex items-center gap-1 hover:text-rose-700 cursor-pointer uppercase font-extrabold"
                    title="Klik untuk mengurutkan berdasarkan NIP / NIPPPK / NIKKI"
                  >
                    <span>NIP / NIPPPK / NIKKI</span>
                    {sortBy === 'nip-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-rose-600" />
                    ) : sortBy === 'nip-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-3">
                  <button
                    type="button"
                    onClick={() => handleToggleColumnSort('tmt')}
                    className="flex items-center gap-1 hover:text-rose-700 cursor-pointer uppercase font-extrabold"
                    title="Klik untuk mengurutkan berdasarkan TMT Pertama"
                  >
                    <span>TTL & TMT</span>
                    {sortBy === 'tmt-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-rose-600" />
                    ) : sortBy === 'tmt-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggleColumnSort('jabatan')}
                    className="inline-flex items-center justify-center gap-1 hover:text-rose-700 cursor-pointer uppercase font-extrabold"
                    title="Klik untuk mengurutkan berdasarkan Jabatan / Penugasan"
                  >
                    <span>Jabatan / Penugasan</span>
                    {sortBy === 'jabatan-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-rose-600" />
                    ) : sortBy === 'jabatan-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-3 text-center">Akun Login</th>
                <th className="p-3 rounded-r-xl text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedTeachers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 text-xs font-bold">
                    {searchQuery
                      ? `Tidak ditemukan pegawai dengan kata kunci "${searchQuery}".`
                      : 'Belum ada data pegawai yang cocok dengan filter ini.'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedTeachers.map((t) => {
                  const getJabatanBadge = (pos: string) => {
                    switch (pos) {
                      case 'Tata Usaha':
                        return 'bg-sky-50 text-sky-800 border-sky-300 font-extrabold';
                      case 'Penjaga Sekolah':
                        return 'bg-amber-50 text-amber-800 border-amber-300 font-extrabold';
                      case 'Laboran':
                        return 'bg-purple-50 text-purple-800 border-purple-300 font-extrabold';
                      case 'Petugas Kebersihan':
                        return 'bg-teal-50 text-teal-800 border-teal-300 font-extrabold';
                      case 'Kepala Sekolah':
                        return 'bg-rose-50 text-rose-800 border-rose-300 font-extrabold';
                      default:
                        return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
                    }
                  };

                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={t.fotoUrl}
                            alt={t.nama}
                            onClick={() => onOpenZoom(t.fotoUrl, t.nama)}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-200 cursor-zoom-in"
                          />
                          <div>
                            <div className="font-bold text-slate-800">{t.nama}</div>
                            <div className="text-[11px] text-slate-500">{t.statusPernikahan}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-800 border border-rose-200">
                          {t.statusPegawai}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700">{t.nip || '-'}</td>
                      <td className="p-3 text-slate-600 text-xs">
                        <div>{t.tempatLahir}, {t.tanggalLahir}</div>
                        <div className="text-[11px] text-slate-400">TMT: {t.tmtPertama}</div>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs border shadow-2xs ${getJabatanBadge(t.penugasan)}`}>
                          {t.penugasan}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono text-xs">
                        <span className="font-bold text-slate-800">{t.username}</span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(t)}
                            className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50"
                            title="Edit Data"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id, t.nama)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                            title="Hapus Data"
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
    </section>
  );
};
