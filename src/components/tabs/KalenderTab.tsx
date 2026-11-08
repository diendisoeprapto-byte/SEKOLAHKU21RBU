import React, { useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Save,
  Info,
  Calendar as CalendarIcon,
  CheckCircle2,
  Trash2,
  Filter,
  Users,
  AlertTriangle,
  X,
  Sparkles,
} from 'lucide-react';
import { Student, KaldikDay } from '../../types';
import { AttendanceRecordItem, CLASSES_LIST } from '../../utils/storage';
import { DEFAULT_KALDIK_HOLIDAYS } from '../../data/defaultData';
import { TabId } from '../Sidebar';

interface Props {
  students: Student[];
  activeClass: string;
  attendanceRecords: Record<string, AttendanceRecordItem>;
  onSaveAttendance: (records: Record<string, AttendanceRecordItem>) => void;
  kaldikDays: KaldikDay[];
  onSaveKaldik: (days: KaldikDay[]) => void;
  onOpenCustomModal: () => void;
  onNavigateTab: (tab: TabId) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const KalenderTab: React.FC<Props> = ({
  students,
  activeClass,
  attendanceRecords,
  onSaveAttendance,
  kaldikDays,
  onSaveKaldik,
  onOpenCustomModal,
  onNavigateTab,
  showToast,
}) => {
  const [currentYearMonth, setCurrentYearMonth] = useState('2026-08'); // default active
  const [selectedDate, setSelectedDate] = useState('2026-08-17');
  const [dateType, setDateType] = useState<'effective' | 'holiday'>('holiday');
  const [holidayNote, setHolidayNote] = useState('Hari Kemerdekaan RI Ke-81');
  const [selectedClass, setSelectedClass] = useState<string>(activeClass || 'all');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetScope, setResetScope] = useState<'class' | 'all'>('class');

  const [yearStr, monthStr] = currentYearMonth.split('-');
  const year = parseInt(yearStr) || 2026;
  const month = parseInt(monthStr) || 8;

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 is Sunday

  // Filter students based on selectedClass
  const targetStudents =
    selectedClass === 'all'
      ? students
      : students.filter((s) => s.kelas === selectedClass);
  const totalStudents = targetStudents.length;

  // Build quick map of kaldik
  const kaldikMap: Record<string, KaldikDay> = {};
  kaldikDays.forEach((k) => {
    kaldikMap[k.date] = k;
  });

  const monthNames = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  const handleMonthNav = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    const ym = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    setCurrentYearMonth(ym);
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    const existing = kaldikMap[dateStr];
    const isSun = new Date(dateStr).getDay() === 0;
    if (existing) {
      setDateType(existing.isHoliday ? 'holiday' : 'effective');
      setHolidayNote(existing.keterangan || '');
    } else if (isSun) {
      setDateType('holiday');
      setHolidayNote('Hari Minggu (Libur Mingguan)');
    } else {
      setDateType('effective');
      setHolidayNote('');
    }
  };

  const handleSaveSelectedDate = () => {
    if (!selectedDate) return;
    const existingIdx = kaldikDays.findIndex((d) => d.date === selectedDate);
    const dayObj: KaldikDay = {
      date: selectedDate,
      isHoliday: dateType === 'holiday',
      keterangan: holidayNote || (dateType === 'holiday' ? 'Hari Libur' : 'Hari Efektif'),
      isCustom: true,
    };

    let updated = [...kaldikDays];
    if (existingIdx >= 0) {
      updated[existingIdx] = dayObj;
    } else {
      updated.push(dayObj);
    }

    onSaveKaldik(updated);
    showToast(`Status tanggal ${selectedDate} berhasil disimpan!`, 'success');
  };

  const handleResetKaldik = () => {
    if (confirm('Reset seluruh hari libur ke standar Kaldik DKI Jakarta?')) {
      onSaveKaldik(DEFAULT_KALDIK_HOLIDAYS);
      showToast('Kaldik DKI Jakarta berhasil di-reset ke standar', 'success');
    }
  };

  // Month attendance records count
  const allMonthRecords = Object.values(attendanceRecords).filter((r) =>
    r.date.startsWith(currentYearMonth)
  );
  const targetStudentIdSet = new Set(targetStudents.map((s) => s.id));
  const monthRecordsForScope = allMonthRecords.filter((r) =>
    selectedClass === 'all' ? true : targetStudentIdSet.has(r.studentId)
  );

  // Month stats for effective days & holidays
  let effectiveCount = 0;
  let totalDaysWithAbsen = 0;
  const monthHolidays: KaldikDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isSun = new Date(year, month - 1, d).getDay() === 0;
    const item = kaldikMap[dStr];

    if (item && item.isHoliday) {
      monthHolidays.push(item);
    } else if (isSun) {
      // sunday
    } else {
      effectiveCount++;
    }

    // Check if this date has attendance records
    const hasAnyAbsen = targetStudents.some(
      (s) => attendanceRecords[`${dStr}_${s.id}`] !== undefined
    );
    if (hasAnyAbsen) {
      totalDaysWithAbsen++;
    }
  }

  // Selected date attendance stats
  const selectedDateRecords = targetStudents
    .map((s) => attendanceRecords[`${selectedDate}_${s.id}`])
    .filter(Boolean);
  const selectedDateHasAbsen = selectedDateRecords.length > 0;
  const selectedHadirCount = selectedDateRecords.filter((r) => r.status === 'H').length;
  const selectedSakitCount = selectedDateRecords.filter((r) => r.status === 'S').length;
  const selectedIzinCount = selectedDateRecords.filter((r) => r.status === 'I').length;
  const selectedAlfaCount = selectedDateRecords.filter((r) => r.status === 'A').length;

  const handleResetSingleDateAttendance = () => {
    if (!selectedDateHasAbsen) {
      showToast('Belum ada data kehadiran pada tanggal ' + selectedDate, 'error');
      return;
    }

    if (
      confirm(
        `Yakin ingin mengosongkan/mereset catatan absensi tanggal ${selectedDate} (${selectedDateRecords.length} siswa)?`
      )
    ) {
      const updated = { ...attendanceRecords };
      targetStudents.forEach((s) => {
        delete updated[`${selectedDate}_${s.id}`];
      });
      onSaveAttendance(updated);
      showToast(`Data absensi tanggal ${selectedDate} berhasil di-reset!`, 'success');
    }
  };

  const handleExecuteResetMonthAttendance = () => {
    const recordsToDelete =
      resetScope === 'all' ? allMonthRecords : monthRecordsForScope;

    if (recordsToDelete.length === 0) {
      showToast(
        `Tidak ada data kehadiran yang tercatat di bulan ${monthNames[month - 1]} ${year}!`,
        'error'
      );
      setIsResetModalOpen(false);
      return;
    }

    const updated = { ...attendanceRecords };
    recordsToDelete.forEach((r) => {
      delete updated[`${r.date}_${r.studentId}`];
      delete updated[r.id];
    });

    onSaveAttendance(updated);
    setIsResetModalOpen(false);
    showToast(
      `Berhasil mereset ${recordsToDelete.length} data kehadiran bulan ${monthNames[month - 1]} ${year}!`,
      'success'
    );
  };

  return (
    <section className="space-y-6">
      {/* Sub-menu bar */}
      <div className="bg-white p-4 rounded-3xl shadow-xs border border-rose-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center text-sm font-bold shadow-xs">
            <CalendarDays className="w-5 h-5" />
          </span>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-rose-700">
              Sub-Menu 2.3 • Kalender Pendidikan & Rekap Kehadiran Siswa
            </span>
            <h3 className="font-display font-black text-sm sm:text-base text-slate-800">
              Kalender Sekolah, Status Hari Libur & Indikator Warna Absensi
            </h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab('absensi')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <CalendarIcon className="w-4 h-4" /> Ke Scan Absensi
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('laporan-absensi')}
            className="bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <CalendarDays className="w-4 h-4" /> Ke Laporan Kehadiran
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
        {/* Header Bar with Month Picker, Class Filter & Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase bg-rose-100 text-rose-700 px-3 py-1 rounded-full">
                Kalender Pendidikan DKI Jakarta
              </span>
              <span className="text-xs font-extrabold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {totalDaysWithAbsen} Hari Sudah Absen
              </span>
            </div>
            <h3 className="text-xl font-display font-black text-slate-800 mt-1">
              {monthNames[month - 1]} {year}
            </h3>
            <p className="text-xs text-slate-500">
              Tanggal berwarna <strong className="text-emerald-700 font-bold">hijau</strong> menandakan kehadiran sudah diabsen (dilengkapi rasio hadir/total siswa).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Rombel Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] font-bold text-slate-600">Rombel:</span>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="bg-transparent text-xs font-black text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="all">Semua Kelas ({students.length} Siswa)</option>
                {CLASSES_LIST.map((c) => {
                  const cCount = students.filter((s) => s.kelas === c).length;
                  return (
                    <option key={c} value={c}>
                      {c} ({cCount} Siswa)
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Navigation & Month Selector */}
            <button
              type="button"
              onClick={() => handleMonthNav(-1)}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Bulan Lalu
            </button>
            <input
              type="month"
              value={currentYearMonth}
              onChange={(e) => setCurrentYearMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border-2 border-rose-600 bg-rose-50 text-rose-900 font-display font-extrabold text-xs"
            />
            <button
              type="button"
              onClick={() => handleMonthNav(1)}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold cursor-pointer flex items-center gap-1"
            >
              Bulan Depan <ChevronRight className="w-4 h-4" />
            </button>

            {/* Reset Kehadiran Bulan Ini Button */}
            <button
              type="button"
              onClick={() => setIsResetModalOpen(true)}
              className="bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Reset dan kosongkan data kehadiran pada bulan yang dipilih"
            >
              <Trash2 className="w-4 h-4" /> Reset Kehadiran Bulan Ini
            </button>

            {/* Edit Kaldik & Reset Kaldik */}
            <button
              type="button"
              onClick={onOpenCustomModal}
              className="bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <CalendarPlus className="w-4 h-4" /> Tambah Libur
            </button>
            <button
              type="button"
              onClick={handleResetKaldik}
              className="px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-extrabold cursor-pointer flex items-center gap-1"
              title="Reset hari libur ke standar Kaldik DKI Jakarta"
            >
              <RotateCcw className="w-4 h-4" /> Reset Kaldik
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Calendar Grid */}
          <div className="lg:col-span-8 space-y-3">
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-display font-black uppercase">
              <div className="py-2 rounded-xl bg-rose-600 text-white">Minggu</div>
              <div className="py-2 rounded-xl bg-slate-100 text-slate-700">Senin</div>
              <div className="py-2 rounded-xl bg-slate-100 text-slate-700">Selasa</div>
              <div className="py-2 rounded-xl bg-slate-100 text-slate-700">Rabu</div>
              <div className="py-2 rounded-xl bg-slate-100 text-slate-700">Kamis</div>
              <div className="py-2 rounded-xl bg-slate-100 text-slate-700">Jumat</div>
              <div className="py-2 rounded-xl bg-amber-100 text-amber-900">Sabtu</div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {/* Offset days */}
              {Array.from({ length: firstDayIndex }).map((_, idx) => (
                <div
                  key={`offset_${idx}`}
                  className="min-h-[96px] bg-slate-50/60 rounded-2xl border border-dashed border-slate-200"
                ></div>
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isSun = new Date(year, month - 1, d).getDay() === 0;
                const item = kaldikMap[dStr];
                const isHol = item ? item.isHoliday : isSun;
                const isSelected = selectedDate === dStr;

                // Attendance calculation on this day for target students
                const dayRecords = targetStudents
                  .map((s) => attendanceRecords[`${dStr}_${s.id}`])
                  .filter(Boolean);
                const isAbsenDone = dayRecords.length > 0;
                const hadirCount = dayRecords.filter((r) => r.status === 'H').length;

                return (
                  <div
                    key={d}
                    onClick={() => handleSelectDate(dStr)}
                    className={`min-h-[96px] p-2 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between overflow-hidden relative select-none ${
                      isSelected
                        ? 'border-sky-600 shadow-md ring-2 ring-sky-300 ' +
                          (isAbsenDone
                            ? 'bg-emerald-100/70'
                            : isHol
                            ? 'bg-rose-100/70'
                            : 'bg-sky-50')
                        : isAbsenDone
                        ? 'bg-emerald-50 border-emerald-400 hover:bg-emerald-100/80 shadow-2xs'
                        : isHol
                        ? 'bg-rose-50 border-rose-300 hover:bg-rose-100/50'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Cell Top Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-xs font-black ${
                            isAbsenDone
                              ? 'text-emerald-950 font-display'
                              : isHol
                              ? 'text-rose-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {d}
                        </span>
                        {isAbsenDone && (
                          <span
                            className="w-2 h-2 rounded-full bg-emerald-500 inline-block"
                            title="Sudah absen"
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {isHol && (
                          <span
                            className="text-[9px] bg-rose-600 text-white font-black px-1 rounded shadow-2xs"
                            title={item?.keterangan || 'Libur'}
                          >
                            L
                          </span>
                        )}
                        {isAbsenDone && (
                          <span
                            className="text-[9px] bg-emerald-600 text-white font-extrabold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-2xs"
                            title={`Sudah diabsen: ${hadirCount}/${totalStudents} Hadir`}
                          >
                            <CheckCircle2 className="w-2.5 h-2.5" /> Absen
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Cell Middle (Holiday description if exists) */}
                    {item?.keterangan && (
                      <span
                        className={`text-[10px] font-bold truncate leading-tight block mt-0.5 ${
                          isAbsenDone ? 'text-emerald-900' : 'text-rose-800'
                        }`}
                        title={item.keterangan}
                      >
                        {item.keterangan}
                      </span>
                    )}

                    {/* Cell Bottom: Jumlah Hadir / Total Siswa */}
                    {isAbsenDone ? (
                      <div className="mt-auto pt-1">
                        <div className="text-[10px] font-black text-emerald-950 bg-emerald-200/90 border border-emerald-400/80 px-1.5 py-0.5 rounded-lg flex items-center justify-between shadow-2xs">
                          <span className="text-[9px] font-bold text-emerald-800">Hadir:</span>
                          <span className="font-mono font-black text-[11px] text-emerald-950">
                            {hadirCount}/{totalStudents}
                          </span>
                        </div>
                      </div>
                    ) : (
                      !isHol && (
                        <div className="mt-auto pt-1">
                          <span className="text-[9px] text-slate-400 italic block">
                            Belum absen
                          </span>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Editor & Selected Date Panel */}
          <div className="lg:col-span-4 bg-slate-50 p-4 rounded-3xl border border-slate-200 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              {/* Selected Date Attendance Summary Card */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Status Kehadiran Tanggal
                  </span>
                  <span className="font-mono font-black text-xs text-slate-800">
                    {selectedDate}
                  </span>
                </div>

                {selectedDateHasAbsen ? (
                  <div className="space-y-2.5">
                    <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-300">
                      <div className="flex items-center justify-between text-xs font-black text-emerald-900">
                        <span>Total Kehadiran:</span>
                        <span className="font-mono text-sm font-black text-emerald-700 bg-white px-2 py-0.5 rounded-lg border border-emerald-200">
                          {selectedHadirCount} / {totalStudents} Siswa Hadir
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 text-center mt-2 text-[11px] font-bold">
                        <div className="bg-white p-1 rounded-lg border border-emerald-200">
                          <span className="text-emerald-700 block text-[10px]">H (Hadir)</span>
                          <span className="font-black text-xs">{selectedHadirCount}</span>
                        </div>
                        <div className="bg-white p-1 rounded-lg border border-emerald-200">
                          <span className="text-amber-700 block text-[10px]">S (Sakit)</span>
                          <span className="font-black text-xs">{selectedSakitCount}</span>
                        </div>
                        <div className="bg-white p-1 rounded-lg border border-emerald-200">
                          <span className="text-sky-700 block text-[10px]">I (Izin)</span>
                          <span className="font-black text-xs">{selectedIzinCount}</span>
                        </div>
                        <div className="bg-white p-1 rounded-lg border border-emerald-200">
                          <span className="text-rose-700 block text-[10px]">A (Alfa)</span>
                          <span className="font-black text-xs">{selectedAlfaCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onNavigateTab('absensi')}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold py-2 px-3 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <CalendarIcon className="w-3.5 h-3.5" /> Buka Menu Absensi
                      </button>
                      <button
                        type="button"
                        onClick={handleResetSingleDateAttendance}
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer"
                        title="Kosongkan/Reset absensi untuk tanggal ini saja"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center space-y-2">
                    <p className="text-xs text-slate-500 font-medium">
                      Belum ada catatan kehadiran yang diinput untuk tanggal ini.
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('absensi')}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white font-display font-extrabold py-2 px-3 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" /> Input Absensi Sekarang
                    </button>
                  </div>
                )}
              </div>

              {/* Kaldik Editor Card */}
              <div className="p-3.5 rounded-2xl bg-white border border-rose-200 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full">
                    Editor Status Kaldik
                  </span>
                  <span className="font-mono font-bold text-xs text-slate-700">{selectedDate}</span>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Status Hari pada Kalender:
                  </label>
                  <select
                    value={dateType}
                    onChange={(e) => setDateType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold bg-white"
                  >
                    <option value="effective">Hari Efektif Belajar (Masuk Sekolah)</option>
                    <option value="holiday">Hari Libur Nasional / Kaldik DKI / Khusus</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Keterangan Kegiatan / Libur:
                  </label>
                  <input
                    type="text"
                    value={holidayNote}
                    onChange={(e) => setHolidayNote(e.target.value)}
                    placeholder="Contoh: Raker Guru / Libur Khusus"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveSelectedDate}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold py-2.5 rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" /> Simpan Status Tanggal
                </button>
              </div>

              {/* Month holiday list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-extrabold text-xs uppercase text-slate-700">
                    Hari Libur Bulan Ini
                  </h4>
                  <span className="text-[11px] font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                    {effectiveCount} Hari Efektif
                  </span>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {monthHolidays.map((h) => (
                    <div
                      key={h.date}
                      className="p-2 rounded-xl bg-white border border-rose-100 text-xs flex items-center justify-between"
                    >
                      <span className="font-mono font-bold text-rose-700">{h.date}</span>
                      <span className="text-slate-600 truncate ml-2 font-medium">
                        {h.keterangan}
                      </span>
                    </div>
                  ))}
                  {monthHolidays.length === 0 && (
                    <p className="text-xs text-slate-400 italic">
                      Tidak ada hari libur terjadwal selain Minggu
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Legend / Keterangan Warna Kalender */}
            <div className="text-[11px] text-slate-600 bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2 shadow-2xs">
              <div className="font-black text-slate-800 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-sky-600" /> Keterangan Warna Kalender:
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0"></span>
                  <span>Hijau: Sudah Absen (Hadir/Total)</span>
                </div>
                <div className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 font-bold flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0"></span>
                  <span>Merah: Hari Libur (L)</span>
                </div>
                <div className="px-2 py-1 rounded-lg bg-sky-50 border border-sky-300 text-sky-800 font-bold flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-600 shrink-0"></span>
                  <span>Biru: Tanggal Dipilih</span>
                </div>
                <div className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 font-bold flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0"></span>
                  <span>Putih: Belum Absen</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Konfirmasi Reset Kehadiran Bulan Ini */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="font-display font-black text-base">
                  Reset Kehadiran Bulan {monthNames[month - 1]} {year}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Tindakan ini akan mengosongkan dan menghapus data absensi/kehadiran siswa yang telah tercatat pada periode{' '}
              <strong className="text-slate-900 font-extrabold">
                {monthNames[month - 1]} {year}
              </strong>. Silakan pilih cakupan rombel yang ingin di-reset:
            </p>

            <div className="space-y-2 text-xs font-bold">
              <label
                className={`p-3 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition ${
                  resetScope === 'class'
                    ? 'border-rose-600 bg-rose-50/70 text-rose-950'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="resetScope"
                    checked={resetScope === 'class'}
                    onChange={() => setResetScope('class')}
                    className="accent-rose-600 w-4 h-4"
                  />
                  <div>
                    <div>
                      {selectedClass === 'all'
                        ? 'Semua Kelas yang Sedang Dipilih'
                        : `Kelas ${selectedClass} Saja`}
                    </div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      Menghapus {monthRecordsForScope.length} catatan absensi
                    </div>
                  </div>
                </div>
                <span className="font-mono text-xs font-black bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                  {monthRecordsForScope.length} Data
                </span>
              </label>

              <label
                className={`p-3 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition ${
                  resetScope === 'all'
                    ? 'border-rose-600 bg-rose-50/70 text-rose-950'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="resetScope"
                    checked={resetScope === 'all'}
                    onChange={() => setResetScope('all')}
                    className="accent-rose-600 w-4 h-4"
                  />
                  <div>
                    <div>Seluruh Rombel Sekolah (Semua Kelas)</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      Menghapus total seluruh kehadiran di bulan ini
                    </div>
                  </div>
                </div>
                <span className="font-mono text-xs font-black bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                  {allMonthRecords.length} Data
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteResetMonthAttendance}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Ya, Reset Kehadiran
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
