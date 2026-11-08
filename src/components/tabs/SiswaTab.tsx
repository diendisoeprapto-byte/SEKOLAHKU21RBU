import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  UserPlus,
  FileDown,
  FileSpreadsheet,
  QrCode,
  Trash2,
  Printer,
  Upload,
} from 'lucide-react';
import { Student, SchoolProfile, ReligionType } from '../../types';
import {
  downloadTemplateStudentsXLSX,
  exportStudentsToXLSX,
  parseImportStudentsXLSX,
  generateAccountUsername,
} from '../../utils/excel';
import { renderBarcodeToCanvas } from '../../utils/barcode';
import { CLASSES_LIST, ACADEMIC_YEARS } from '../../utils/storage';

interface Props {
  students: Student[];
  onSaveStudents: (students: Student[]) => void;
  profile: SchoolProfile;
  activeClass: string;
  activeYear: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

export const SiswaTab: React.FC<Props> = ({
  students,
  onSaveStudents,
  profile,
  activeClass,
  activeYear,
  showToast,
  onOpenZoom,
}) => {
  const [newNama, setNewNama] = useState('');
  const [newNisn, setNewNisn] = useState('');
  const [newAgama, setNewAgama] = useState<ReligionType>('Islam');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('123');
  const [newFoto, setNewFoto] = useState('https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredStudents = students.filter((s) => s.kelas === activeClass);

  const handleImportStudents = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { newStudents, count } = await parseImportStudentsXLSX(
        file,
        students,
        activeClass,
        activeYear
      );

      if (count === 0) {
        showToast('Tidak ada data siswa yang valid di dalam file Excel!', 'error');
        return;
      }

      onSaveStudents([...students, ...newStudents]);
      showToast(
        `Berhasil mengimpor ${count} peserta didik! Akun login (username & password) telah dibuat otomatis.`,
        'success'
      );
    } catch (err: any) {
      showToast(`Gagal membaca file Excel: ${err?.message || 'Format file tidak sesuai'}`, 'error');
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
        setNewFoto(reader.result as string);
        showToast('Foto siswa berhasil dimuat!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddStudent = (e: React.FormEvent) => {
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
      nisn: newNisn,
      agama: newAgama,
      kelas: activeClass,
      tahunPelajaran: activeYear,
      username: finalUsername,
      password: finalPassword,
      fotoUrl: newFoto,
    };

    onSaveStudents([...students, newStudent]);
    showToast(`Peserta didik ${newNama} berhasil ditambahkan ke ${activeClass}! Akun: ${finalUsername}`, 'success');
    setNewNama('');
    setNewNisn('');
    setNewUser('');
    setNewPass('123');
  };

  const handleDeleteStudent = (id: string, name: string) => {
    if (confirm(`Yakin ingin menghapus peserta didik ${name}?`)) {
      onSaveStudents(students.filter((s) => s.id !== id));
      showToast(`Peserta didik ${name} berhasil dihapus`, 'success');
    }
  };

  const handleClassChange = (id: string, targetClass: string) => {
    const updated = students.map((s) => (s.id === id ? { ...s, kelas: targetClass } : s));
    onSaveStudents(updated);
    showToast('Berhasil memindahkan kelas siswa', 'success');
  };

  const handleYearChange = (id: string, targetYear: string) => {
    const updated = students.map((s) => (s.id === id ? { ...s, tahunPelajaran: targetYear } : s));
    onSaveStudents(updated);
    showToast('Berhasil memperbarui tahun pelajaran siswa', 'success');
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
              Manajemen Peserta Didik & Sinkronisasi Mapel Agama
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1">
              Tambah Siswa, Pilih Agama, Buat Akun & Kartu Barcode
            </h2>
            <p className="text-xs text-slate-500 max-w-3xl">
              Pilihan agama siswa otomatis menentukan mata pelajaran Pendidikan Agama yang dihitung pada{' '}
              <strong>Menu Penilaian, Leger, dan e-Rapor</strong> (Islam &rarr; PAIBP, Kristen &rarr; PAKBP,
              Katolik &rarr; PAKat, Buddha &rarr; PABBP, Hindu &rarr; PAHBP, Konghucu &rarr; PAKBBP).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls, .csv"
              onChange={handleImportStudents}
              className="hidden"
            />
            <button
              type="button"
              onClick={downloadTemplateStudentsXLSX}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Download format Excel untuk import data siswa"
            >
              <FileDown className="w-4 h-4 text-sky-600" /> Template Siswa (.XLSX)
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Import file Excel siswa dengan otomatisasi akun username & password"
            >
              <Upload className="w-4 h-4" /> Import Siswa (.XLSX)
            </button>
            <button
              type="button"
              onClick={() => exportStudentsToXLSX(filteredStudents)}
              className="bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Siswa (.XLSX)
            </button>
          </div>
        </div>

        <form onSubmit={handleAddStudent} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <input
            type="text"
            value={newNama}
            onChange={(e) => setNewNama(e.target.value)}
            required
            placeholder="Nama Lengkap Siswa"
            className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
          />
          <input
            type="text"
            value={newNisn}
            onChange={(e) => setNewNisn(e.target.value)}
            required
            placeholder="NISN (Contoh: 0134567890)"
            className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
          />
          <select
            value={newAgama}
            onChange={(e) => setNewAgama(e.target.value as ReligionType)}
            className="px-3 py-2 rounded-xl border-2 border-rose-600 text-xs font-extrabold bg-rose-50 text-rose-900"
          >
            <option value="Islam">Agama: Islam (PAIBP)</option>
            <option value="Kristen">Agama: Kristen (PAKBP)</option>
            <option value="Katolik">Agama: Katolik (PAKat)</option>
            <option value="Buddha">Agama: Buddha (PABBP)</option>
            <option value="Hindu">Agama: Hindu (PAHBP)</option>
            <option value="Konghucu">Agama: Konghucu (PAKBBP)</option>
          </select>
          <input
            type="text"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
            placeholder="Username (Otomatis jika kosong)"
            className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
          />
          <input
            type="text"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="Password (Default 123)"
            className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
          />
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="text-xs text-slate-600 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-sky-600 file:text-white cursor-pointer"
          />
          <button
            type="submit"
            className="bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold py-2 px-4 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> Tambah Siswa
          </button>
        </form>
      </div>

      {/* Tabel Akun & Manajemen Siswa */}
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-4">
        <h3 className="font-display font-extrabold text-base text-slate-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-500" /> Daftar Foto, Agama Siswa, Akun Login & Pindah Rombel ({activeClass})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-xs uppercase font-extrabold">
                <th className="p-3 rounded-l-xl">Foto & Nama Siswa</th>
                <th className="p-3">Agama & Mapel</th>
                <th className="p-3">Pindah Kelas</th>
                <th className="p-3">Tahun Pelajaran</th>
                <th className="p-3">Username</th>
                <th className="p-3">Password</th>
                <th className="p-3 rounded-r-xl text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((s) => (
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
                    <span className="font-semibold text-slate-700">{s.agama}</span>
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
                  <td className="p-3">
                    <select
                      value={s.tahunPelajaran}
                      onChange={(e) => handleYearChange(s.id, e.target.value)}
                      className="px-2 py-1 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                    >
                      {ACADEMIC_YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 font-mono font-bold text-slate-700">{s.username}</td>
                  <td className="p-3 font-mono text-slate-600">{s.password}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleDeleteStudent(s.id, s.nama)}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                      title="Hapus Siswa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
              <div className="pt-2 border-t border-slate-100 flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-2">
                <canvas id={`barcode_canvas_${s.id}`} className="max-w-full h-auto"></canvas>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
