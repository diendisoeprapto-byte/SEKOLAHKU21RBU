import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Search,
  Filter,
  Download,
  Printer,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Trash2,
  RefreshCw,
  Award,
  BookOpen,
  HeartHandshake,
  Layers,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  X,
  FileText,
  Check,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { KebiasaanReportItem, TUJUH_KEBIASAAN_LIST, Student, SchoolProfile, Teacher } from '../../types';
import { CLASSES_LIST } from '../../utils/storage';

export const MONTH_NAMES = [
  { value: '01', label: 'Januari' },
  { value: '02', label: 'Februari' },
  { value: '03', label: 'Maret' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mei' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'Agustus' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Desember' },
];

interface Props {
  students?: Student[];
  teachers?: Teacher[];
  profile?: SchoolProfile;
  activeClass?: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const DashboardKebiasaanTab: React.FC<Props> = ({
  students = [],
  teachers = [],
  profile,
  activeClass: initialClass = 'Semua Kelas',
  showToast,
}) => {
  const [reports, setReports] = useState<KebiasaanReportItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');

  // Filters
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('Semua Kelas');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Detail Modal State
  const [activeModalReport, setActiveModalReport] = useState<KebiasaanReportItem | null>(null);

  // Modal & Loading State Kosongkan Data
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  // Modal & Controls State Cetak Laporan Per Bulan
  const now = new Date();
  const [isMonthlyPrintModalOpen, setIsMonthlyPrintModalOpen] = useState<boolean>(false);
  const [printMonth, setPrintMonth] = useState<string>(String(now.getMonth() + 1).padStart(2, '0'));
  const [printYear, setPrintYear] = useState<string>(String(now.getFullYear()));
  const [printClass, setPrintClass] = useState<string>('Semua Kelas');
  const [printViewType, setPrintViewType] = useState<'rekap_siswa' | 'jurnal_harian'>('rekap_siswa');

  // Real-time listener menggunakan onSnapshot dari Firestore collection 'laporan_kebiasaan'
  useEffect(() => {
    setLoading(true);
    setRealtimeStatus('connecting');

    // Subscribe to Firestore collection 'laporan_kebiasaan' with onSnapshot
    let unsubscribe: () => void = () => {};

    try {
      const colRef = collection(db, 'laporan_kebiasaan');
      // Query dengan fallback jika index belum dibuat
      unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          const items: KebiasaanReportItem[] = [];
          snapshot.forEach((d) => {
            const data = d.data() as any;
            items.push({
              id: d.id,
              namaSiswa: data.namaSiswa || 'Siswa',
              studentId: data.studentId || '',
              kelas: data.kelas || 'Kelas 6A',
              tanggal: data.tanggal || new Date().toISOString().split('T')[0],
              waktuKirim: data.waktuKirim || '06:30 WIB',
              kebiasaan: data.kebiasaan || {
                bangunPagi: false,
                ibadah: false,
                mandiGosokGigi: false,
                sarapanSehat: false,
                berpamitan: false,
                membacaBuku: false,
                membantuOrangTua: false,
              },
              catatan: data.catatan || {},
              skor: typeof data.skor === 'number' ? data.skor : 7,
              catatanSiswa: data.catatanSiswa || '',
              createdAt: data.createdAt || new Date().toISOString(),
            });
          });

          // Urutkan berdasarkan tanggal & waktu kirim terbaru di sisi klien
          items.sort((a, b) => {
            const dateCmp = (b.tanggal || '').localeCompare(a.tanggal || '');
            if (dateCmp !== 0) return dateCmp;
            return (b.waktuKirim || '').localeCompare(a.waktuKirim || '');
          });

          setReports(items);
          setLoading(false);
          setRealtimeStatus('connected');
          setLastUpdatedTime(new Date().toLocaleTimeString('id-ID'));
        },
        (error) => {
          console.warn('onSnapshot error:', error);
          setRealtimeStatus('offline');
          setLoading(false);
        }
      );
    } catch (err) {
      console.error('Failed to initialize onSnapshot:', err);
      setRealtimeStatus('offline');
      setLoading(false);
    }

    return () => {
      unsubscribe();
    };
  }, []);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      if (selectedClassFilter !== 'Semua Kelas' && item.kelas !== selectedClassFilter) {
        return false;
      }
      if (selectedDateFilter && item.tanggal !== selectedDateFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.namaSiswa.toLowerCase().includes(q);
        const matchesClass = item.kelas.toLowerCase().includes(q);
        if (!matchesName && !matchesClass) return false;
      }
      return true;
    });
  }, [reports, selectedClassFilter, selectedDateFilter, searchQuery]);

  // Statistik Agregat
  const todayStr = new Date().toISOString().split('T')[0];
  const todayReportsCount = useMemo(() => {
    return reports.filter((r) => r.tanggal === todayStr).length;
  }, [reports, todayStr]);

  const avgScore = useMemo(() => {
    if (reports.length === 0) return 0;
    const total = reports.reduce((acc, curr) => acc + (curr.skor || 0), 0);
    return Math.round((total / reports.length) * 10) / 10;
  }, [reports]);

  const perfectScoreCount = useMemo(() => {
    return reports.filter((r) => r.skor === 7).length;
  }, [reports]);

  // Handler Hapus Laporan Tunggal
  const handleDeleteReport = async (reportId?: string) => {
    if (!reportId) return;
    if (!confirm('Apakah Anda yakin ingin menghapus data laporan kebiasaan ini?')) return;

    try {
      await deleteDoc(doc(db, 'laporan_kebiasaan', reportId));
      showToast('Laporan berhasil dihapus dari sistem Firestore!', 'success');
    } catch (err: any) {
      console.error('Delete error:', err);
      showToast(`Gagal menghapus laporan: ${err.message}`, 'error');
    }
  };

  // Handler Kosongkan Seluruh Data Laporan dari Firestore
  const handleClearAllReports = async () => {
    if (reports.length === 0) return;
    setIsClearing(true);
    try {
      const deletePromises = reports.map((r) => {
        if (r.id) {
          return deleteDoc(doc(db, 'laporan_kebiasaan', r.id));
        }
        return Promise.resolve();
      });
      await Promise.all(deletePromises);
      setIsClearAllModalOpen(false);
      showToast(`Seluruh data laporan 7 kebiasaan berhasil dikosongkan dari Firestore! (${reports.length} data dihapus)`, 'success');
    } catch (err: any) {
      console.error('Clear all error:', err);
      showToast(`Gagal mengosongkan data: ${err.message}`, 'error');
    } finally {
      setIsClearing(false);
    }
  };

  // Handler Seed Data Sampel (jika data masih kosong)
  const handleSeedSampleData = async () => {
    setLoading(true);
    const sampleNames = [
      { nama: 'Ahmad Faiz Pratama', kelas: 'Kelas 6A', skor: 7 },
      { nama: 'Siti Rahma Azzahra', kelas: 'Kelas 6A', skor: 7 },
      { nama: 'Budi Santoso', kelas: 'Kelas 6B', skor: 6 },
      { nama: 'Dewi Lestari', kelas: 'Kelas 5A', skor: 7 },
      { nama: 'Rian Hidayat', kelas: 'Kelas 5B', skor: 5 },
      { nama: 'Nadia Putri Maharani', kelas: 'Kelas 1A', skor: 7 },
    ];

    try {
      for (const s of sampleNames) {
        await addDoc(collection(db, 'laporan_kebiasaan'), {
          namaSiswa: s.nama,
          studentId: `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          kelas: s.kelas,
          tanggal: todayStr,
          waktuKirim: '06:45 WIB',
          kebiasaan: {
            bangunPagi: true,
            ibadah: true,
            mandiGosokGigi: true,
            sarapanSehat: true,
            berpamitan: true,
            membacaBuku: s.skor >= 6,
            membantuOrangTua: s.skor === 7,
          },
          catatan: {
            bangunPagi: 'Bangun pukul 05.00 WIB, merapikan selimut & bantal',
            ibadah: 'Sholat Subuh berjamaah bersama keluarga',
            mandiGosokGigi: 'Mandi pagi segar dan menggosok gigi teratur',
            sarapanSehat: 'Nasi, telur mata sapi, sayur bayam, air putih',
            berpamitan: 'Mencium tangan ayah dan ibu sebelum ke sekolah',
            membacaBuku: 'Membaca buku cerita nusantara 15 menit',
            membantuOrangTua: 'Menyapu lantai ruang tamu dan mencuci piring',
          },
          skor: s.skor,
          catatanSiswa: 'Hari ini saya sangat bersemangat berangkat sekolah tepat waktu!',
          createdAt: new Date().toISOString(),
        });
      }
      showToast('6 Data sampel Laporan 7 Kebiasaan berhasil ditambahkan ke Firestore!', 'success');
    } catch (err: any) {
      console.error('Seed error:', err);
      showToast(`Gagal menambahkan data sampel: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Export to Excel
  const handleExportXLSX = () => {
    if (filteredReports.length === 0) {
      showToast('Tidak ada data laporan untuk diekspor', 'error');
      return;
    }

    const dataForExcel = filteredReports.map((r, idx) => ({
      'No': idx + 1,
      'Tanggal': r.tanggal,
      'Waktu Kirim': r.waktuKirim || '-',
      'Nama Siswa': r.namaSiswa,
      'Kelas': r.kelas,
      '1. Bangun Pagi': r.kebiasaan?.bangunPagi ? 'Sudah' : 'Belum',
      '2. Melaksanakan Ibadah': r.kebiasaan?.ibadah ? 'Sudah' : 'Belum',
      '3. Mandi & Gosok Gigi': r.kebiasaan?.mandiGosokGigi ? 'Sudah' : 'Belum',
      '4. Sarapan Sehat': r.kebiasaan?.sarapanSehat ? 'Sudah' : 'Belum',
      '5. Berpamitan Ortu': r.kebiasaan?.berpamitan ? 'Sudah' : 'Belum',
      '6. Membaca Buku': r.kebiasaan?.membacaBuku ? 'Sudah' : 'Belum',
      '7. Membantu Orang Tua': r.kebiasaan?.membantuOrangTua ? 'Sudah' : 'Belum',
      'Total Skor': `${r.skor} / 7`,
      'Catatan Siswa': r.catatanSiswa || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan 7 Kebiasaan');
    XLSX.writeFile(wb, `Laporan_7_Kebiasaan_${selectedClassFilter.replace(/\s+/g, '_')}_${todayStr}.xlsx`);
    showToast('Berkas Excel Laporan 7 Kebiasaan berhasil diunduh!', 'success');
  };

  // =========================================================================
  // LOGIKA PENGHITUNGAN REKAPITULASI LAPORAN BULANAN
  // =========================================================================
  const monthlyReports = useMemo(() => {
    const prefix = `${printYear}-${printMonth}`;
    return reports.filter((r) => {
      if (!r.tanggal?.startsWith(prefix)) return false;
      if (printClass !== 'Semua Kelas' && r.kelas !== printClass) return false;
      return true;
    });
  }, [reports, printYear, printMonth, printClass]);

  const monthlyStudentSummaries = useMemo(() => {
    const map: Record<string, {
      studentId: string;
      namaSiswa: string;
      kelas: string;
      nisn?: string;
      totalHari: number;
      totalSkor: number;
      avgSkor: number;
      persentase: number;
      predikat: string;
      kebiasaanCount: {
        bangunPagi: number;
        ibadah: number;
        mandiGosokGigi: number;
        sarapanSehat: number;
        berpamitan: number;
        membacaBuku: number;
        membantuOrangTua: number;
      };
    }> = {};

    const classStudents = printClass === 'Semua Kelas'
      ? students
      : students.filter((s) => s.kelas === printClass);

    classStudents.forEach((s) => {
      map[s.nama.toLowerCase()] = {
        studentId: s.id,
        namaSiswa: s.nama,
        kelas: s.kelas || printClass,
        nisn: s.nisn,
        totalHari: 0,
        totalSkor: 0,
        avgSkor: 0,
        persentase: 0,
        predikat: 'Perlu Pendampingan (D)',
        kebiasaanCount: {
          bangunPagi: 0,
          ibadah: 0,
          mandiGosokGigi: 0,
          sarapanSehat: 0,
          berpamitan: 0,
          membacaBuku: 0,
          membantuOrangTua: 0,
        },
      };
    });

    monthlyReports.forEach((r) => {
      const key = r.namaSiswa.toLowerCase();
      if (!map[key]) {
        const matched = students.find((s) => s.nama.toLowerCase() === key || s.id === r.studentId);
        map[key] = {
          studentId: r.studentId || `std_${Date.now()}`,
          namaSiswa: r.namaSiswa,
          kelas: r.kelas,
          nisn: matched?.nisn,
          totalHari: 0,
          totalSkor: 0,
          avgSkor: 0,
          persentase: 0,
          predikat: 'Perlu Pendampingan (D)',
          kebiasaanCount: {
            bangunPagi: 0,
            ibadah: 0,
            mandiGosokGigi: 0,
            sarapanSehat: 0,
            berpamitan: 0,
            membacaBuku: 0,
            membantuOrangTua: 0,
          },
        };
      }

      const item = map[key];
      item.totalHari += 1;
      item.totalSkor += (r.skor || 0);

      if (r.kebiasaan?.bangunPagi) item.kebiasaanCount.bangunPagi += 1;
      if (r.kebiasaan?.ibadah) item.kebiasaanCount.ibadah += 1;
      if (r.kebiasaan?.mandiGosokGigi) item.kebiasaanCount.mandiGosokGigi += 1;
      if (r.kebiasaan?.sarapanSehat) item.kebiasaanCount.sarapanSehat += 1;
      if (r.kebiasaan?.berpamitan) item.kebiasaanCount.berpamitan += 1;
      if (r.kebiasaan?.membacaBuku) item.kebiasaanCount.membacaBuku += 1;
      if (r.kebiasaan?.membantuOrangTua) item.kebiasaanCount.membantuOrangTua += 1;
    });

    const list = Object.values(map).map((item) => {
      const avg = item.totalHari > 0 ? item.totalSkor / item.totalHari : 0;
      const pct = item.totalHari > 0 ? Math.round((avg / 7) * 100) : 0;
      let predikat = 'Perlu Pendampingan (D)';
      if (pct >= 90) predikat = 'Sangat Membudaya (A)';
      else if (pct >= 75) predikat = 'Membudaya (B)';
      else if (pct >= 60) predikat = 'Mulai Berkembang (C)';

      return {
        ...item,
        avgSkor: Math.round(avg * 10) / 10,
        persentase: pct,
        predikat,
      };
    });

    list.sort((a, b) => {
      if (b.persentase !== a.persentase) return b.persentase - a.persentase;
      return a.namaSiswa.localeCompare(b.namaSiswa);
    });

    return list;
  }, [monthlyReports, students, printClass]);

  const monthlySelectedMonthName = MONTH_NAMES.find((m) => m.value === printMonth)?.label || 'Bulan';
  const monthlyAvgScore = useMemo(() => {
    if (monthlyReports.length === 0) return 0;
    const total = monthlyReports.reduce((acc, c) => acc + (c.skor || 0), 0);
    return Math.round((total / monthlyReports.length) * 10) / 10;
  }, [monthlyReports]);
  const monthlyAvgPct = Math.round((monthlyAvgScore / 7) * 100);

  const countPredikatA = useMemo(() => {
    return monthlyStudentSummaries.filter((s) => s.persentase >= 90).length;
  }, [monthlyStudentSummaries]);

  const waliTeacher = useMemo(() => {
    if (!teachers || teachers.length === 0) return null;
    if (printClass !== 'Semua Kelas') {
      return teachers.find((t) => t.penugasan === printClass) || teachers[0];
    }
    return teachers.find((t) => t.penugasan?.includes('Kelas')) || teachers[0];
  }, [teachers, printClass]);

  const lastDayOfMonth = useMemo(() => {
    return new Date(parseInt(printYear), parseInt(printMonth), 0).getDate();
  }, [printYear, printMonth]);

  // Handler Unduh Excel Bulanan
  const handleExportMonthlyXLSX = () => {
    if (monthlyStudentSummaries.length === 0) {
      showToast('Tidak ada data laporan bulanan untuk diekspor', 'error');
      return;
    }

    const dataForExcel = monthlyStudentSummaries.map((s, idx) => ({
      'No': idx + 1,
      'NISN': s.nisn || '-',
      'Nama Peserta Didik': s.namaSiswa,
      'Kelas': s.kelas,
      'Hari Lapor (Frekuensi)': s.totalHari,
      'Rata-rata Skor (dari 7)': s.avgSkor,
      'Kepatuhan (%)': `${s.persentase}%`,
      'Predikat Karakter': s.predikat,
      '1. Bangun Pagi': s.kebiasaanCount.bangunPagi,
      '2. Melaksanakan Ibadah': s.kebiasaanCount.ibadah,
      '3. Mandi & Gigi': s.kebiasaanCount.mandiGosokGigi,
      '4. Sarapan Sehat': s.kebiasaanCount.sarapanSehat,
      '5. Berpamitan Ortu': s.kebiasaanCount.berpamitan,
      '6. Membaca Buku': s.kebiasaanCount.membacaBuku,
      '7. Membantu Ortu': s.kebiasaanCount.membantuOrangTua,
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Rekap_${monthlySelectedMonthName}`);
    XLSX.writeFile(wb, `Rekap_Bulanan_7_Kebiasaan_${monthlySelectedMonthName}_${printYear}_${printClass.replace(/\s+/g, '_')}.xlsx`);
    showToast(`Berkas Excel Rekap Bulanan ${monthlySelectedMonthName} ${printYear} berhasil diunduh!`, 'success');
  };

  return (
    <section className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase bg-amber-100 text-amber-900 px-3 py-1 rounded-full border border-amber-300">
                Menu Administrator • Pembiasaan Karakter
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Real-Time onSnapshot Aktif</span>
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-black text-slate-800 mt-2 flex items-center gap-2.5">
              <Sparkles className="w-6 h-6 text-amber-500" /> Dashboard Monitoring Laporan 7 Kebiasaan Siswa
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Data laporan harian pembiasaan 7 Kebiasaan Anak Indonesia Hebat yang dikirim siswa secara real-time dari collection Firestore <code>laporan_kebiasaan</code>.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {reports.length === 0 && (
              <button
                type="button"
                onClick={handleSeedSampleData}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-indigo-600/20"
                title="Isi data sampel awal laporan 7 kebiasaan ke Firestore"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>+ Data Sampel Awal</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportXLSX}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-display font-black px-4 py-2.5 rounded-2xl text-xs border border-emerald-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-emerald-700" />
              <span>Ekspor Excel (.xlsx)</span>
            </button>

            {/* Tombol Cetak Laporan Bulanan (Baru) */}
            <button
              type="button"
              onClick={() => setIsMonthlyPrintModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-600/20"
              title="Buka dialog dan cetak rekapitulasi laporan per bulan 7 kebiasaan siswa"
            >
              <Calendar className="w-4 h-4 text-amber-200" />
              <span>Cetak Per Bulan</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="bg-slate-900 hover:bg-slate-800 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Rekap Live</span>
            </button>

            {/* Tombol Kosongkan Data */}
            <button
              type="button"
              disabled={reports.length === 0 || isClearing}
              onClick={() => setIsClearAllModalOpen(true)}
              className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-display font-black px-4 py-2.5 rounded-2xl text-xs border border-rose-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
              title="Kosongkan seluruh data laporan 7 kebiasaan di Firestore"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Kosongkan Data</span>
            </button>
          </div>
        </div>

        {/* Aggregate Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/60 border border-amber-200 shadow-2xs">
            <span className="text-amber-800 font-bold block text-[11px]">Total Laporan Masuk</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-display font-black text-amber-950">{reports.length}</span>
              <span className="text-amber-700 text-[10px] font-semibold">laporan</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100/60 border border-sky-200 shadow-2xs">
            <span className="text-sky-800 font-bold block text-[11px]">Laporan Hari Ini ({todayStr})</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-display font-black text-sky-950">{todayReportsCount}</span>
              <span className="text-sky-700 text-[10px] font-semibold">siswa</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/60 border border-emerald-200 shadow-2xs">
            <span className="text-emerald-800 font-bold block text-[11px]">Rata-rata Kepatuhan</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-display font-black text-emerald-950">{avgScore}</span>
              <span className="text-emerald-700 text-[10px] font-semibold">/ 7 kebiasaan</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100/60 border border-purple-200 shadow-2xs">
            <span className="text-purple-800 font-bold block text-[11px]">Skor Sempurna (7/7)</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-display font-black text-purple-950">{perfectScoreCount}</span>
              <span className="text-purple-700 text-[10px] font-semibold">siswa teladan</span>
            </div>
          </div>
        </div>

        {/* Legend of the 7 Habits */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
            <span className="flex items-center gap-1.5 font-display font-black text-slate-800">
              <Layers className="w-3.5 h-3.5 text-amber-500" /> Daftar 7 Kebiasaan Anak Indonesia Hebat:
            </span>
            {lastUpdatedTime && (
              <span className="text-[10px] text-slate-500">
                Terakhir diperbarui: {lastUpdatedTime} WIB (Otomatis via onSnapshot)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px]">
            {TUJUH_KEBIASAAN_LIST.map((h) => (
              <div key={h.id} className="p-2 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 shadow-2xs">
                <span className="text-base shrink-0">{h.icon}</span>
                <span className="font-bold text-slate-700 leading-tight text-[10px] truncate" title={h.label}>
                  {h.nomor}. {h.shortLabel}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs">
          {/* Search by Name */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama siswa atau kelas..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white font-medium text-xs text-slate-800 outline-none focus:border-amber-500 shadow-2xs"
            />
          </div>

          {/* Filter Class */}
          <div className="sm:col-span-4 flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-300 bg-white font-extrabold text-xs text-slate-800 outline-none cursor-pointer focus:border-amber-500 shadow-2xs"
            >
              <option value="Semua Kelas">Semua Kelas (1A - 6B)</option>
              {CLASSES_LIST.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Date */}
          <div className="sm:col-span-3 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              type="date"
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-300 bg-white font-extrabold text-xs text-slate-800 outline-none cursor-pointer focus:border-amber-500 shadow-2xs"
            />
            {selectedDateFilter && (
              <button
                type="button"
                onClick={() => setSelectedDateFilter('')}
                className="text-[10px] text-rose-600 hover:underline font-bold shrink-0 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Tabel Data Laporan Responsif */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-display font-black text-sm text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" />
              Tabel Rekapitulasi Laporan Masuk
            </span>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
              Menampilkan {filteredReports.length} dari {reports.length} Laporan
            </span>
          </div>

          <div className="overflow-x-auto border-2 border-slate-200 rounded-3xl shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
                  <th className="p-3 w-10 text-center">No</th>
                  <th className="p-3 min-w-[110px]">Tanggal &amp; Waktu</th>
                  <th className="p-3 min-w-[180px]">Nama Peserta Didik</th>
                  <th className="p-3 text-center">Kelas</th>
                  <th className="p-3 text-center min-w-[220px]">Status 7 Kebiasaan</th>
                  <th className="p-3 text-center">Skor</th>
                  <th className="p-3 text-center w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
                        <span>Menghubungkan ke collection Firestore `laporan_kebiasaan`...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-medium space-y-2">
                      <p>Belum ada data laporan kebiasaan yang cocok dengan filter yang dipilih.</p>
                      <button
                        type="button"
                        onClick={handleSeedSampleData}
                        className="text-xs text-indigo-600 hover:underline font-bold cursor-pointer"
                      >
                        + Tambahkan Data Sampel Awal
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((item, idx) => {
                    const matchedStudent = students.find(
                      (s) => s.nama.toLowerCase() === item.namaSiswa.toLowerCase() || s.id === item.studentId
                    );

                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50 transition">
                        <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="p-3">
                          <span className="font-mono font-bold text-slate-800 block text-xs">
                            {item.tanggal}
                          </span>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-400" /> {item.waktuKirim || '06:30 WIB'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={matchedStudent?.fotoUrl || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'}
                              alt={item.namaSiswa}
                              className="w-8 h-8 rounded-xl object-cover border border-slate-300 shrink-0 bg-white"
                            />
                            <div>
                              <span className="font-display font-black text-slate-900 block text-xs">
                                {item.namaSiswa}
                              </span>
                              {matchedStudent?.nisn && (
                                <span className="text-[10px] font-mono text-slate-500">
                                  NISN: {matchedStudent.nisn}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 font-black text-[11px] border border-slate-200">
                            {item.kelas}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {/* 7 Habit Badges Indicators */}
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {TUJUH_KEBIASAAN_LIST.map((h) => {
                              const done = Boolean(item.kebiasaan?.[h.id as keyof typeof item.kebiasaan]);
                              return (
                                <span
                                  key={h.id}
                                  title={`${h.label}: ${done ? 'Sudah Dilaksanakan' : 'Belum Dilaksanakan'}`}
                                  className={`w-6 h-6 rounded-lg text-xs flex items-center justify-center border transition ${
                                    done
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold shadow-2xs'
                                      : 'bg-slate-100 text-slate-400 border-slate-200 opacity-40 grayscale'
                                  }`}
                                >
                                  {h.icon}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-black inline-flex items-center gap-1 ${
                              item.skor === 7
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                                : item.skor >= 5
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 text-slate-700 border border-slate-300'
                            }`}
                          >
                            {item.skor === 7 && <Sparkles className="w-3 h-3 text-amber-500 fill-current" />}
                            <span>{item.skor} / 7</span>
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setActiveModalReport(item)}
                              className="p-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition cursor-pointer"
                              title="Lihat Rincian Catatan 7 Kebiasaan Siswa"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteReport(item.id)}
                              className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                              title="Hapus Laporan ini"
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
      </div>

      {/* MODAL RINCIAN LAPORAN 7 KEBIASAAN */}
      {activeModalReport && (
        <div className="fixed inset-0 z-[950] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-xl w-full rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-200">
                  Rincian Laporan Pembiasaan
                </span>
                <h3 className="font-display font-black text-lg text-slate-800 mt-1">
                  {activeModalReport.namaSiswa} ({activeModalReport.kelas})
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Tanggal: {activeModalReport.tanggal} • Jam {activeModalReport.waktuKirim || '-'}
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold text-slate-500 block">Total Skor</span>
                <span className="text-xl font-display font-black text-emerald-700">
                  {activeModalReport.skor} / 7
                </span>
              </div>
            </div>

            {/* List 7 Habit details */}
            <div className="space-y-2.5 text-xs">
              {TUJUH_KEBIASAAN_LIST.map((h) => {
                const done = Boolean(activeModalReport.kebiasaan?.[h.id as keyof typeof activeModalReport.kebiasaan]);
                const customNote = activeModalReport.catatan?.[h.id as keyof typeof activeModalReport.catatan];

                return (
                  <div
                    key={h.id}
                    className={`p-3 rounded-2xl border flex items-start justify-between gap-3 ${
                      done
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-xl shrink-0 mt-0.5">{h.icon}</span>
                      <div>
                        <h4 className="font-display font-black text-xs text-slate-800">
                          {h.label}
                        </h4>
                        {customNote ? (
                          <p className="text-[11px] text-slate-600 mt-0.5 italic">
                            "{customNote}"
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {done ? 'Sudah dilaksanakan dengan baik' : 'Belum dilaksanakan'}
                          </p>
                        )}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black shrink-0 ${
                        done
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {done ? '✓ Sudah' : '✗ Belum'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Catatan Siswa */}
            {activeModalReport.catatanSiswa && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs">
                <span className="font-extrabold text-amber-900 block mb-1">
                  Catatan Tambahan / Refleksi Siswa:
                </span>
                <p className="text-slate-700 italic">
                  "{activeModalReport.catatanSiswa}"
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveModalReport(null)}
                className="px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-display font-black text-xs transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL KONFIRMASI KOSONGKAN DATA */}
      {isClearAllModalOpen && (
        <div className="fixed inset-0 z-[950] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border-2 border-rose-200 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-display font-black text-lg text-slate-800">
                Kosongkan Seluruh Data Laporan?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tindakan ini akan menghapus secara permanen <strong className="text-rose-600 font-bold">{reports.length} rekaman data</strong> dari koleksi Firestore <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">laporan_kebiasaan</code>.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium space-y-1">
              <span className="font-extrabold block">⚠️ Perhatian Penting:</span>
              <p>
                Data yang telah dikosongkan tidak dapat dipulihkan kembali. Anda disarankan mengunduh cadangan terlebih dahulu dengan tombol <strong>Ekspor Excel</strong> sebelum melanjutkan.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isClearing}
                onClick={() => setIsClearAllModalOpen(false)}
                className="px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-black text-xs transition cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isClearing}
                onClick={handleClearAllReports}
                className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs transition cursor-pointer shadow-md shadow-rose-600/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isClearing ? 'Sedang Mengosongkan...' : 'Ya, Kosongkan Semua Data'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CETAK LAPORAN BULANAN 7 KEBIASAAN */}
      {isMonthlyPrintModalOpen && (
        <div className="fixed inset-0 z-[960] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          {/* Print Style Injector untuk mengisolasi hanya modal saat window.print() dipanggil */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
                @media print {
                  body * {
                    visibility: hidden !important;
                  }
                  #printable-monthly-kebiasaan, #printable-monthly-kebiasaan * {
                    visibility: visible !important;
                  }
                  #printable-monthly-kebiasaan {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 15px 25px !important;
                    background: white !important;
                    color: black !important;
                    font-size: 11pt !important;
                  }
                  .no-print-in-modal {
                    display: none !important;
                  }
                  .print-break-inside-avoid {
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                  }
                }
              `,
            }}
          />

          <div className="bg-white max-w-5xl w-full max-h-[94vh] rounded-3xl shadow-2xl border-2 border-amber-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Top Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 no-print-in-modal">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase bg-white/20 px-2.5 py-0.5 rounded-full text-amber-100">
                    Dokumen Pelaporan Bulanan Resmi
                  </span>
                  <h3 className="font-display font-black text-base sm:text-lg">
                    Cetak Laporan Bulanan: 7 Kebiasaan Anak Indonesia Hebat
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportMonthlyXLSX}
                  className="bg-white hover:bg-amber-50 text-amber-900 font-display font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>Ekspor Excel Bulanan</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-amber-400" />
                  <span>Cetak / PDF Sekarang</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMonthlyPrintModalOpen(false)}
                  className="w-9 h-9 rounded-xl bg-white/20 hover:bg-rose-600 text-white flex items-center justify-center text-sm font-bold transition cursor-pointer"
                  title="Tutup dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filter Bar Inside Modal (Hidden in Print) */}
            <div className="p-4 bg-amber-50/70 border-b border-amber-200 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs shrink-0 no-print-in-modal">
              {/* Pilih Bulan */}
              <div>
                <label className="block text-[11px] font-black uppercase text-amber-900 mb-1">
                  Pilih Bulan:
                </label>
                <select
                  value={printMonth}
                  onChange={(e) => setPrintMonth(e.target.value)}
                  className="w-full p-2 rounded-xl border border-amber-300 bg-white font-bold text-xs text-slate-800 outline-none cursor-pointer focus:border-amber-600 shadow-2xs"
                >
                  {MONTH_NAMES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label} ({m.value})
                    </option>
                  ))}
                </select>
              </div>

              {/* Pilih Tahun */}
              <div>
                <label className="block text-[11px] font-black uppercase text-amber-900 mb-1">
                  Pilih Tahun:
                </label>
                <select
                  value={printYear}
                  onChange={(e) => setPrintYear(e.target.value)}
                  className="w-full p-2 rounded-xl border border-amber-300 bg-white font-bold text-xs text-slate-800 outline-none cursor-pointer focus:border-amber-600 shadow-2xs"
                >
                  <option value="2025">Tahun 2025</option>
                  <option value="2026">Tahun 2026</option>
                  <option value="2027">Tahun 2027</option>
                  <option value="2028">Tahun 2028</option>
                </select>
              </div>

              {/* Filter Kelas */}
              <div>
                <label className="block text-[11px] font-black uppercase text-amber-900 mb-1">
                  Rombel / Kelas:
                </label>
                <select
                  value={printClass}
                  onChange={(e) => setPrintClass(e.target.value)}
                  className="w-full p-2 rounded-xl border border-amber-300 bg-white font-bold text-xs text-slate-800 outline-none cursor-pointer focus:border-amber-600 shadow-2xs"
                >
                  <option value="Semua Kelas">Semua Kelas (1A - 6B)</option>
                  {CLASSES_LIST.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Format Tampilan Cetak */}
              <div>
                <label className="block text-[11px] font-black uppercase text-amber-900 mb-1">
                  Format Laporan:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPrintViewType('rekap_siswa')}
                    className={`p-2 rounded-xl text-xs font-bold transition text-center border cursor-pointer ${
                      printViewType === 'rekap_siswa'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                        : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    Rekap Siswa
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintViewType('jurnal_harian')}
                    className={`p-2 rounded-xl text-xs font-bold transition text-center border cursor-pointer ${
                      printViewType === 'jurnal_harian'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                        : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    Jurnal Harian
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Printable Document Area */}
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 bg-slate-100">
              <div
                id="printable-monthly-kebiasaan"
                className="bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200 text-slate-900 mx-auto max-w-4xl space-y-5"
              >
                {/* 1. KOP SURAT RESMI */}
                <div className="flex items-center justify-between gap-4 border-b-4 border-double border-slate-900 pb-3">
                  <div className="w-20 sm:w-24 shrink-0 text-center">
                    <img
                      src={
                        profile?.logoKemendikbudUrl ||
                        'https://upload.wikimedia.org/wikipedia/commons/9/9c/Logo_of_Ministry_of_Education_and_Culture_of_Republic_of_Indonesia.svg'
                      }
                      alt="Logo Dinas"
                      className="w-16 h-16 sm:w-20 sm:h-20 object-contain mx-auto"
                    />
                  </div>

                  <div className="flex-1 text-center space-y-0.5">
                    <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700">
                      Pemerintah Provinsi Daerah Khusus Ibukota Jakarta
                    </h4>
                    <h5 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700">
                      Dinas Pendidikan • Suku Dinas Wilayah {profile?.kecamatan || 'Jakarta Selatan'}
                    </h5>
                    <h2 className="text-base sm:text-xl font-display font-black uppercase text-slate-900 tracking-tight">
                      {profile?.name || 'SD NEGERI CIPETE UTARA 01 PAGI'}
                    </h2>
                    <p className="text-[10px] sm:text-[11px] text-slate-600 leading-tight">
                      {profile?.alamat || 'Jl. H. Jian No. 2, Cipete Utara, Kebayoran Baru, Jakarta Selatan'}
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-slate-600">
                      NPSN: <span className="font-mono font-bold">{profile?.npsn || '20101234'}</span> • Akreditasi: <strong>A (Unggul)</strong> • Kurikulum Merdeka
                    </p>
                  </div>

                  <div className="w-20 sm:w-24 shrink-0 text-center">
                    <img
                      src={
                        profile?.logoSekolahUrl ||
                        'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=150'
                      }
                      alt="Logo Sekolah"
                      className="w-16 h-16 sm:w-20 sm:h-20 object-contain mx-auto rounded-xl"
                    />
                  </div>
                </div>

                {/* 2. JUDUL DOKUMEN & IDENTITAS PERIODE */}
                <div className="text-center space-y-1">
                  <h3 className="font-display font-black text-sm sm:text-base uppercase tracking-wide text-slate-900 underline decoration-2 underline-offset-4">
                    REKAPITULASI BULANAN PELAKSANAAN 7 KEBIASAAN ANAK INDONESIA HEBAT
                  </h3>
                  <p className="text-xs font-bold text-slate-700">
                    Periode: Bulan <strong>{monthlySelectedMonthName} {printYear}</strong> (1 s/d {lastDayOfMonth} {monthlySelectedMonthName} {printYear})
                  </p>
                  <p className="text-xs text-slate-600">
                    Rombongan Belajar: <strong className="uppercase">{printClass}</strong> • Fokus: Pembiasaan Karakter Profil Pelajar Pancasila
                  </p>
                </div>

                {/* 3. KOTAK STATISTIK BULAN INI */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl border border-slate-900 bg-slate-50 text-center">
                    <span className="text-[10px] font-bold text-slate-600 block">Siswa Terdata</span>
                    <span className="text-lg font-black text-slate-900">{monthlyStudentSummaries.length} Siswa</span>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-900 bg-slate-50 text-center">
                    <span className="text-[10px] font-bold text-slate-600 block">Total Laporan Masuk</span>
                    <span className="text-lg font-black text-slate-900">{monthlyReports.length} Laporan</span>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-900 bg-slate-50 text-center">
                    <span className="text-[10px] font-bold text-slate-600 block">Rata-rata Kepatuhan</span>
                    <span className="text-lg font-black text-emerald-800">{monthlyAvgScore} / 7 ({monthlyAvgPct}%)</span>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-900 bg-slate-50 text-center">
                    <span className="text-[10px] font-bold text-slate-600 block">Predikat Sangat Membudaya</span>
                    <span className="text-lg font-black text-amber-800">{countPredikatA} Siswa</span>
                  </div>
                </div>

                {/* 4. KETERANGAN 7 KEBIASAAN (LEGEND) */}
                <div className="p-2.5 rounded-xl border border-slate-300 bg-slate-50/60 text-[10px] leading-tight space-y-1">
                  <span className="font-black text-slate-800 block">
                    Keterangan Kolom 7 Indikator Kebiasaan:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-0.5 text-slate-700">
                    <span><strong>1. BP</strong>: Bangun Pagi &amp; Tempat Tidur</span>
                    <span><strong>2. IB</strong>: Melaksanakan Ibadah</span>
                    <span><strong>3. MG</strong>: Mandi &amp; Menggosok Gigi</span>
                    <span><strong>4. SS</strong>: Sarapan Sehat Bergizi</span>
                    <span><strong>5. BM</strong>: Berpamitan Orang Tua</span>
                    <span><strong>6. MB</strong>: Membaca Buku (Literasi)</span>
                    <span className="col-span-2"><strong>7. MO</strong>: Membantu Orang Tua di Rumah</span>
                  </div>
                </div>

                {/* 5. TABEL UTAMA */}
                {printViewType === 'rekap_siswa' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-slate-900 text-[10.5px]">
                      <thead>
                        <tr className="bg-slate-200 text-slate-900 font-black border-b border-slate-900 text-center">
                          <th className="p-1.5 border-r border-slate-900 w-7">No</th>
                          <th className="p-1.5 border-r border-slate-900 w-24">NISN</th>
                          <th className="p-1.5 border-r border-slate-900 text-left min-w-[150px]">Nama Peserta Didik</th>
                          <th className="p-1.5 border-r border-slate-900 w-16">Kelas</th>
                          <th className="p-1.5 border-r border-slate-900 w-14">Hari Lapor</th>
                          <th className="p-1.5 border-r border-slate-900 w-14">Rerata Skor</th>
                          <th className="p-1.5 border-r border-slate-900 w-14">% Kepatuhan</th>
                          <th className="p-1 border-r border-slate-900 text-center" colSpan={7}>
                            Frekuensi Pelaksanaan 7 Kebiasaan (Hari)
                          </th>
                          <th className="p-1.5 min-w-[110px]">Predikat Karakter</th>
                        </tr>
                        <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-900 text-center text-[9px]">
                          <th className="border-r border-slate-900" colSpan={7}></th>
                          <th className="p-1 border-r border-slate-900 w-6" title="Bangun Pagi">BP</th>
                          <th className="p-1 border-r border-slate-900 w-6" title="Ibadah">IB</th>
                          <th className="p-1 border-r border-slate-900 w-6" title="Mandi & Gigi">MG</th>
                          <th className="p-1 border-r border-slate-900 w-6" title="Sarapan Sehat">SS</th>
                          <th className="p-1 border-r border-slate-900 w-6" title="Berpamitan">BM</th>
                          <th className="p-1 border-r border-slate-900 w-6" title="Membaca Buku">MB</th>
                          <th className="p-1 border-r border-slate-900 w-6" title="Membantu Orang Tua">MO</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-400">
                        {monthlyStudentSummaries.length === 0 ? (
                          <tr>
                            <td colSpan={15} className="p-6 text-center text-slate-500 italic">
                              Belum ada rekaman laporan 7 kebiasaan pada bulan {monthlySelectedMonthName} {printYear} untuk {printClass}.
                            </td>
                          </tr>
                        ) : (
                          monthlyStudentSummaries.map((s, idx) => (
                            <tr key={s.studentId || idx} className="hover:bg-slate-50">
                              <td className="p-1.5 border-r border-slate-900 text-center font-bold">{idx + 1}</td>
                              <td className="p-1.5 border-r border-slate-900 font-mono text-[10px] text-center">{s.nisn || '-'}</td>
                              <td className="p-1.5 border-r border-slate-900 font-bold uppercase">{s.namaSiswa}</td>
                              <td className="p-1.5 border-r border-slate-900 text-center">{s.kelas}</td>
                              <td className="p-1.5 border-r border-slate-900 text-center font-bold">{s.totalHari} hr</td>
                              <td className="p-1.5 border-r border-slate-900 text-center font-mono font-bold">
                                {s.totalHari > 0 ? s.avgSkor : '-'}
                              </td>
                              <td className="p-1.5 border-r border-slate-900 text-center font-mono font-black">
                                {s.totalHari > 0 ? `${s.persentase}%` : '0%'}
                              </td>
                              <td className="p-1 border-r border-slate-900 text-center font-mono">{s.kebiasaanCount.bangunPagi}</td>
                              <td className="p-1 border-r border-slate-900 text-center font-mono">{s.kebiasaanCount.ibadah}</td>
                              <td className="p-1 border-r border-slate-900 text-center font-mono">{s.kebiasaanCount.mandiGosokGigi}</td>
                              <td className="p-1 border-r border-slate-900 text-center font-mono">{s.kebiasaanCount.sarapanSehat}</td>
                              <td className="p-1 border-r border-slate-900 text-center font-mono">{s.kebiasaanCount.berpamitan}</td>
                              <td className="p-1 border-r border-slate-900 text-center font-mono">{s.kebiasaanCount.membacaBuku}</td>
                              <td className="p-1 border-r border-slate-900 text-center font-mono">{s.kebiasaanCount.membantuOrangTua}</td>
                              <td className="p-1.5 text-center font-bold text-[10px]">
                                {s.predikat}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Format Jurnal Harian Detail */
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-slate-900 text-[10.5px]">
                      <thead>
                        <tr className="bg-slate-200 text-slate-900 font-black border-b border-slate-900 text-center">
                          <th className="p-1.5 border-r border-slate-900 w-7">No</th>
                          <th className="p-1.5 border-r border-slate-900 w-24">Tanggal &amp; Waktu</th>
                          <th className="p-1.5 border-r border-slate-900 text-left min-w-[140px]">Nama Peserta Didik</th>
                          <th className="p-1.5 border-r border-slate-900 w-14">Kelas</th>
                          <th className="p-1.5 border-r border-slate-900 text-center min-w-[130px]">Status 7 Kebiasaan</th>
                          <th className="p-1.5 border-r border-slate-900 w-12 text-center">Skor</th>
                          <th className="p-1.5 text-left">Refleksi / Catatan Siswa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-400">
                        {monthlyReports.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-slate-500 italic">
                              Tidak ada log harian laporan 7 kebiasaan pada periode {monthlySelectedMonthName} {printYear}.
                            </td>
                          </tr>
                        ) : (
                          monthlyReports.map((r, idx) => (
                            <tr key={r.id || idx} className="hover:bg-slate-50">
                              <td className="p-1.5 border-r border-slate-900 text-center font-bold">{idx + 1}</td>
                              <td className="p-1.5 border-r border-slate-900 font-mono text-[10px]">
                                {r.tanggal} ({r.waktuKirim || '-'})
                              </td>
                              <td className="p-1.5 border-r border-slate-900 font-bold uppercase">{r.namaSiswa}</td>
                              <td className="p-1.5 border-r border-slate-900 text-center">{r.kelas}</td>
                              <td className="p-1.5 border-r border-slate-900 text-center font-mono font-bold text-[9px]">
                                {r.skor}/7 Terlaksana
                              </td>
                              <td className="p-1.5 border-r border-slate-900 text-center font-bold font-mono">
                                {r.skor}
                              </td>
                              <td className="p-1.5 italic text-slate-700 text-[10px]">
                                {r.catatanSiswa || '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 6. CATATAN & EVALUASI PEMBIASAAN */}
                <div className="border border-slate-900 rounded-xl p-3 bg-slate-50/40 text-xs space-y-1 print-break-inside-avoid">
                  <span className="font-black text-slate-900 block">
                    Catatan Evaluasi Guru Pembina &amp; Wali Kelas:
                  </span>
                  <p className="text-[11px] text-slate-700 leading-relaxed italic">
                    "Secara umum pada bulan {monthlySelectedMonthName} {printYear}, peserta didik telah menunjukkan pembiasaan diri yang baik dalam menjalankan 7 Kebiasaan Anak Indonesia Hebat. Diharapkan kerja sama yang berkesinambungan antara pihak sekolah dan orang tua di rumah agar nilai-nilai integritas, religiusitas, kemandirian, dan gotong royong terus membudaya dalam kehidupan sehari-hari."
                  </p>
                </div>

                {/* 7. LEMBAR TANDA TANGAN RESMI */}
                <div className="grid grid-cols-2 gap-8 pt-4 text-xs font-medium text-slate-900 print-break-inside-avoid">
                  {/* Kiri: Mengetahui Kepala Sekolah */}
                  <div className="text-center space-y-16">
                    <div>
                      <p>Mengetahui,</p>
                      <p className="font-bold">Kepala {profile?.name || 'SDN CIPETE UTARA 01 PAGI'}</p>
                    </div>
                    <div>
                      <p className="font-bold underline uppercase tracking-tight text-slate-900">
                        {profile?.kepalaSekolah?.nama || 'H. SUDIRMAN, M.Pd.'}
                      </p>
                      <p className="text-[11px] font-mono text-slate-700">
                        NIP. {profile?.kepalaSekolah?.nip || '197508172000031001'}
                      </p>
                    </div>
                  </div>

                  {/* Kanan: Guru Kelas / Pembina */}
                  <div className="text-center space-y-16">
                    <div>
                      <p>Jakarta, {lastDayOfMonth} {monthlySelectedMonthName} {printYear}</p>
                      <p className="font-bold">Guru Kelas / Pembina Karakter</p>
                    </div>
                    <div>
                      <p className="font-bold underline uppercase tracking-tight text-slate-900">
                        {waliTeacher?.nama || 'NURHALIMAH, S.Pd.'}
                      </p>
                      <p className="text-[11px] font-mono text-slate-700">
                        NIP. {waliTeacher?.nip || '198205122008012015'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Modal Footer */}
            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 no-print-in-modal">
              <span className="text-slate-500 font-bold">
                Dokumen siap dicetak dalam format resmi (A4 / Folio) dengan Kop Surat &amp; Tanda Tangan.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMonthlyPrintModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4 text-amber-200" />
                  <span>Cetak / PDF Dokumen</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
