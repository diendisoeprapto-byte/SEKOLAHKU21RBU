import React, { useMemo, useState } from 'react';
import {
  HeartHandshake,
  CheckCircle2,
  Calendar,
  Award,
  Flame,
  Save,
  RotateCcw,
  ChevronRight,
  ListChecks,
  CheckSquare,
  Sparkles,
} from 'lucide-react';
import { TUJUH_KEBIASAAN_LIST, KebiasaanReportItem } from '../types';
import { formatDateKey, parseLocalDate } from '../utils/dateUtils';

interface Props {
  studentName: string;
  studentClass: string;
  todayStr: string;
  kebiasaanStatus: Record<string, boolean>;
  kebiasaanSelectedIndicators: Record<string, string[]>;
  studentPastReports: KebiasaanReportItem[];
  hasUnsavedChanges: boolean;
  isSubmitting: boolean;
  onToggleIndikator: (habitId: string, indikatorTitle: string) => void;
  onSelectAllIndicatorsForHabit: (habitId: string, titles: string[]) => void;
  onCheckAllToday: (checked: boolean) => void;
  onSaveTodayProgress: () => void;
  onOpenFullForm: () => void;
}

const DAY_NAMES_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function countHabitScore(statusMap: Record<string, boolean> | undefined): number {
  if (!statusMap) return 0;
  return TUJUH_KEBIASAAN_LIST.filter((h) => Boolean(statusMap[h.id])).length;
}

function countIndicatorsSelected(indMap: Record<string, string[]> | undefined): number {
  if (!indMap) return 0;
  return TUJUH_KEBIASAAN_LIST.reduce((acc, h) => {
    const arr = indMap[h.id];
    return acc + (Array.isArray(arr) ? arr.length : 0);
  }, 0);
}

export const StudentKebiasaanTracker: React.FC<Props> = ({
  studentName,
  studentClass,
  todayStr,
  kebiasaanStatus,
  kebiasaanSelectedIndicators,
  studentPastReports,
  hasUnsavedChanges,
  isSubmitting,
  onToggleIndikator,
  onSelectAllIndicatorsForHabit,
  onCheckAllToday,
  onSaveTodayProgress,
  onOpenFullForm,
}) => {
  const [selectedHabitId, setSelectedHabitId] = useState<string>(TUJUH_KEBIASAAN_LIST[0].id);
  const [showAllHabits, setShowAllHabits] = useState<boolean>(false);

  // Lookup laporan per tanggal (prioritaskan laporan terbaru atau skor tertinggi di tanggal tersebut)
  const reportByDate = useMemo(() => {
    const map: Record<string, KebiasaanReportItem> = {};
    studentPastReports.forEach((rep) => {
      if (!rep.tanggal) return;
      const existing = map[rep.tanggal];
      if (!existing) {
        map[rep.tanggal] = rep;
        return;
      }
      const existingTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
      const newTime = rep.createdAt ? new Date(rep.createdAt).getTime() : 0;
      if (newTime > existingTime || (newTime === existingTime && rep.skor > existing.skor)) {
        map[rep.tanggal] = rep;
      }
    });
    return map;
  }, [studentPastReports]);

  // Hitung 7 hari minggu berjalan (Senin s.d. Minggu)
  const weekDays = useMemo(() => {
    const todayDate = parseLocalDate(todayStr);
    const dow = todayDate.getDay() === 0 ? 7 : todayDate.getDay(); // 1=Senin .. 7=Minggu
    const monday = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - (dow - 1));

    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + idx);
      const dateStr = formatDateKey(d);
      const isToday = dateStr === todayStr;
      const isFuture = dateStr > todayStr;
      const saved = reportByDate[dateStr];

      const dayStatus = isToday ? kebiasaanStatus : saved?.kebiasaan;
      const dayIndicators = isToday ? kebiasaanSelectedIndicators : saved?.indikatorTerpilih;
      const score = isToday
        ? countHabitScore(kebiasaanStatus)
        : saved
          ? typeof saved.skor === 'number'
            ? saved.skor
            : countHabitScore(saved.kebiasaan)
          : 0;
      const indicatorCount = countIndicatorsSelected(dayIndicators);

      return {
        dateStr,
        dayShort: DAY_NAMES_SHORT[idx],
        dateLabel: `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]}`,
        isToday,
        isFuture,
        hasSavedReport: Boolean(saved),
        score,
        indicatorCount,
        statusMap: dayStatus || {},
      };
    });
  }, [todayStr, reportByDate, kebiasaanStatus, kebiasaanSelectedIndicators]);

  const todaySavedReport = reportByDate[todayStr];
  const todayHabitScore = countHabitScore(kebiasaanStatus);
  const todayIndicatorCount = countIndicatorsSelected(kebiasaanSelectedIndicators);
  const totalIndicatorsPossible = TUJUH_KEBIASAAN_LIST.reduce((acc, h) => acc + h.indikator.length, 0);

  const weeklyTotalScore = useMemo(
    () => weekDays.reduce((acc, day) => acc + day.score, 0),
    [weekDays]
  );
  const weeklyMaxScore = 49;
  const weeklyPercentage = Math.round((weeklyTotalScore / weeklyMaxScore) * 100);
  const weeklySavedDays = weekDays.filter((d) => d.hasSavedReport).length;
  const weeklyTotalIndicators = useMemo(
    () => weekDays.reduce((acc, day) => acc + day.indicatorCount, 0),
    [weekDays]
  );

  const weeklyPredicate = useMemo(() => {
    if (weeklyPercentage >= 85) {
      return { label: 'Sangat Membudaya', tone: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }
    if (weeklyPercentage >= 65) {
      return { label: 'Membudaya', tone: 'bg-sky-100 text-sky-800 border-sky-300' };
    }
    if (weeklyPercentage >= 40) {
      return { label: 'Mulai Berkembang', tone: 'bg-amber-100 text-amber-800 border-amber-300' };
    }
    return { label: 'Terus Semangat', tone: 'bg-slate-100 text-slate-700 border-slate-300' };
  }, [weeklyPercentage]);

  // Konsistensi per kebiasaan selama minggu berjalan
  const habitWeeklyStats = useMemo(() => {
    return TUJUH_KEBIASAAN_LIST.map((h) => {
      const doneDays = weekDays.filter((day) => Boolean(day.statusMap[h.id])).length;
      return {
        ...h,
        doneDays,
        pct: Math.round((doneDays / 7) * 100),
      };
    });
  }, [weekDays]);

  const visibleHabits = useMemo(() => {
    if (showAllHabits) return TUJUH_KEBIASAAN_LIST;
    return TUJUH_KEBIASAAN_LIST.filter((h) => h.id === selectedHabitId);
  }, [showAllHabits, selectedHabitId]);

  const weekRangeLabel = `${weekDays[0]?.dateLabel || ''} – ${weekDays[6]?.dateLabel || ''}`;

  return (
    <div className="no-print bg-white rounded-[2rem] border-2 border-amber-200/90 shadow-md overflow-hidden">
      {/* Header Pelacakan Progres */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 p-5 sm:p-6 text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-xs px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider">
                <HeartHandshake className="w-3.5 h-3.5" /> Pelacak Harian &amp; Skor Mingguan
              </span>
              <span className="inline-flex items-center gap-1 bg-white/15 px-2.5 py-1 rounded-full text-[11px] font-bold">
                <Calendar className="w-3.5 h-3.5" /> Minggu Ini: {weekRangeLabel}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-black tracking-tight">
              Progres 7 Kebiasaan Anak Indonesia Hebat
            </h2>
            <p className="text-xs text-amber-50 max-w-2xl">
              Centang indikator kegiatan yang sudah kamu lakukan hari ini ({studentName} • {studentClass}) dan pantau akumulasi skor mingguanmu secara langsung.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenFullForm}
              className="px-4 py-2.5 rounded-2xl bg-white/20 hover:bg-white/30 border border-white/30 text-white font-display font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>Formulir &amp; Refleksi Lengkap</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* 1. Ringkasan Akumulasi Skor Mingguan & Progres Hari Ini */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Akumulasi Skor Mingguan */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                Akumulasi Skor Mingguan
              </span>
              <Award className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-display font-black text-amber-900">
                {weeklyTotalScore}
              </span>
              <span className="text-xs font-bold text-amber-700">/ {weeklyMaxScore} Poin</span>
            </div>
            <div className="w-full bg-amber-200/60 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${weeklyPercentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-amber-800">{weeklyPercentage}% Capaian</span>
              <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black ${weeklyPredicate.tone}`}>
                {weeklyPredicate.label}
              </span>
            </div>
          </div>

          {/* Card 2: Skor Hari Ini */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">
                Skor Hari Ini
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-display font-black text-emerald-900">
                {todayHabitScore}
              </span>
              <span className="text-xs font-bold text-emerald-700">/ 7 Kebiasaan</span>
            </div>
            <div className="w-full bg-emerald-200/60 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.round((todayHabitScore / 7) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] font-bold text-emerald-700">
              {todaySavedReport && !hasUnsavedChanges
                ? `Tersimpan pukul ${todaySavedReport.waktuKirim}`
                : hasUnsavedChanges
                  ? 'Ada perubahan baru — klik Simpan'
                  : 'Centang indikator di bawah'}
            </p>
          </div>

          {/* Card 3: Indikator Tercentang Hari Ini */}
          <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-sky-800">
                Indikator Harian
              </span>
              <ListChecks className="w-4 h-4 text-sky-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-display font-black text-sky-900">
                {todayIndicatorCount}
              </span>
              <span className="text-xs font-bold text-sky-700">/ {totalIndicatorsPossible} Indikator</span>
            </div>
            <div className="w-full bg-sky-200/60 h-2 rounded-full overflow-hidden">
              <div
                className="bg-sky-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.round((todayIndicatorCount / totalIndicatorsPossible) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] font-bold text-sky-700">
              Total minggu ini: {weeklyTotalIndicators} indikator
            </p>
          </div>

          {/* Card 4: Keaktifan Pelaporan Mingguan */}
          <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-rose-800">
                Hari Terlapor Minggu Ini
              </span>
              <Flame className="w-4 h-4 text-rose-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-display font-black text-rose-900">
                {weeklySavedDays}
              </span>
              <span className="text-xs font-bold text-rose-700">/ 7 Hari</span>
            </div>
            <div className="w-full bg-rose-200/60 h-2 rounded-full overflow-hidden">
              <div
                className="bg-rose-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.round((weeklySavedDays / 7) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] font-bold text-rose-700">
              {weeklySavedDays === 7 ? 'Penuh 1 Minggu!' : 'Simpan rutin setiap hari'}
            </p>
          </div>
        </div>

        {/* 2. Strip Skor Harian 7 Hari (Senin - Minggu) */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-amber-600" />
              Rekap Skor Harian Minggu Ini (Senin – Minggu)
            </h3>
            <span className="text-[11px] font-bold text-slate-500">
              Maksimal 7 poin per hari • Total minggu: <strong className="text-amber-700">{weeklyTotalScore}/49</strong>
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
            {weekDays.map((day) => {
              const pct = Math.round((day.score / 7) * 100);
              return (
                <div
                  key={day.dateStr}
                  className={`p-2 sm:p-3 rounded-xl border text-center transition flex flex-col justify-between ${
                    day.isToday
                      ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200 shadow-xs'
                      : day.hasSavedReport
                        ? 'bg-white border-emerald-200'
                        : 'bg-white/60 border-slate-200'
                  }`}
                >
                  <div>
                    <span
                      className={`block text-[10px] sm:text-xs font-black uppercase ${
                        day.isToday ? 'text-amber-800' : 'text-slate-600'
                      }`}
                    >
                      {day.dayShort}
                    </span>
                    <span className="block text-[9px] sm:text-[10px] text-slate-400 font-semibold">
                      {day.dateLabel}
                    </span>
                  </div>

                  <div className="my-1.5">
                    <span
                      className={`inline-block text-xs sm:text-sm font-display font-black ${
                        day.score === 7
                          ? 'text-emerald-700'
                          : day.score > 0
                            ? 'text-amber-700'
                            : 'text-slate-400'
                      }`}
                    >
                      {day.isFuture && day.score === 0 ? '-' : `${day.score}/7`}
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        day.score === 7
                          ? 'bg-emerald-500'
                          : day.score > 0
                            ? 'bg-amber-500'
                            : 'bg-slate-200'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Checklist Indikator Harian (Bisa langsung dicentang dari Dashboard Siswa) */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-display font-black text-slate-800 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-emerald-600" />
                Checklist Indikator Harian ({todayStr})
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Klik kebiasaan di bawah lalu centang indikator yang kamu kerjakan hari ini. Setiap kebiasaan dengan minimal 1 indikator tercentang bernilai +1 poin.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAllHabits((v) => !v)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                {showAllHabits ? 'Tampilkan Per Kebiasaan' : 'Lihat Semua 7 Kebiasaan'}
              </button>
              <button
                type="button"
                onClick={() => onCheckAllToday(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-extrabold text-xs transition cursor-pointer flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Centang Semua (28/28)</span>
              </button>
              <button
                type="button"
                onClick={() => onCheckAllToday(false)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 font-bold text-xs transition cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Selector Tabs untuk 7 Kebiasaan */}
          {!showAllHabits && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {TUJUH_KEBIASAAN_LIST.map((h) => {
                const selectedCount = (kebiasaanSelectedIndicators[h.id] || []).length;
                const isDone = Boolean(kebiasaanStatus[h.id]);
                const isActiveTab = selectedHabitId === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedHabitId(h.id)}
                    className={`p-2.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                      isActiveTab
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                        : isDone
                          ? 'bg-emerald-50/80 border-emerald-300 text-slate-800 hover:bg-emerald-100/70'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white hover:border-amber-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{h.icon}</span>
                      <span
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                          isActiveTab
                            ? 'bg-white/25 text-white'
                            : isDone
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {selectedCount}/{h.indikator.length}
                      </span>
                    </div>
                    <span className="text-[11px] font-display font-black leading-tight line-clamp-2">
                      {h.nomor}. {h.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Panel Indikator Kebiasaan yang Sedang Dipilih / Semua */}
          <div className="space-y-3">
            {visibleHabits.map((habit) => {
              const selectedList = kebiasaanSelectedIndicators[habit.id] || [];
              const allTitles = habit.indikator.map((ind) => ind.title);
              const isAllHabitSelected =
                allTitles.length > 0 && allTitles.every((t) => selectedList.includes(t));
              const isHabitDone = Boolean(kebiasaanStatus[habit.id]);

              return (
                <div
                  key={habit.id}
                  className={`p-4 rounded-2xl border transition ${
                    isHabitDone
                      ? 'bg-emerald-50/40 border-emerald-300'
                      : 'bg-slate-50/70 border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl p-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                        {habit.icon}
                      </span>
                      <div>
                        <h4 className="font-display font-black text-sm text-slate-800 flex items-center gap-2">
                          <span>{habit.nomor}. {habit.label}</span>
                          {isHabitDone && (
                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-300">
                              +1 Poin Hari Ini
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] text-slate-500">{habit.deskripsi}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectAllIndicatorsForHabit(habit.id, allTitles)}
                      className="text-xs font-extrabold text-emerald-700 hover:text-emerald-900 bg-white px-3 py-1.5 rounded-xl border border-emerald-200 hover:bg-emerald-50 transition cursor-pointer"
                    >
                      {isAllHabitSelected ? 'Batal Pilih Semua' : 'Pilih Semua (4)'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {habit.indikator.map((ind) => {
                      const checked = selectedList.includes(ind.title);
                      return (
                        <label
                          key={ind.id}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border transition cursor-pointer ${
                            checked
                              ? 'bg-white border-emerald-400 ring-1 ring-emerald-300 shadow-2xs'
                              : 'bg-white/90 border-slate-200 hover:border-amber-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleIndikator(habit.id, ind.title)}
                            className="w-4 h-4 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <span
                              className={`block text-xs font-extrabold leading-snug ${
                                checked ? 'text-emerald-950' : 'text-slate-800'
                              }`}
                            >
                              {ind.title}
                            </span>
                            <span className="block text-[11px] text-slate-500 leading-relaxed mt-0.5">
                              {ind.detail}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Footer Simpan Progres Hari Ini */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-700">
              <strong className="font-display font-black text-slate-800">
                Status Hari Ini: {todayHabitScore}/7 Kebiasaan • {todayIndicatorCount}/{totalIndicatorsPossible} Indikator
              </strong>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {hasUnsavedChanges
                  ? 'Klik tombol Simpan Progres Hari Ini agar skor harian dan mingguanmu tercatat ke sekolah.'
                  : todaySavedReport
                    ? `Sudah tersinkron ke sistem sekolah pada ${todaySavedReport.tanggal} (${todaySavedReport.waktuKirim}).`
                    : 'Centang indikator yang dilakukan hari ini lalu simpan progresmu.'}
              </p>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={onSaveTodayProgress}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-display font-black text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Menyimpan...'
                  : todaySavedReport
                    ? 'Perbarui Progres Hari Ini'
                    : 'Simpan Progres Hari Ini'}
              </span>
            </button>
          </div>
        </div>

        {/* 4. Ringkasan Konsistensi Mingguan per Kebiasaan */}
        <div className="pt-2 border-t border-slate-100 space-y-2.5">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">
            Konsistensi Mingguan per Kebiasaan (Senin – Minggu)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
            {habitWeeklyStats.map((h) => (
              <div
                key={h.id}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span>{h.icon}</span>
                  <span className="font-display font-black text-slate-800">{h.doneDays}/7 hr</span>
                </div>
                <div className="text-[11px] font-bold text-slate-700 truncate" title={h.label}>
                  {h.shortLabel}
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      h.doneDays >= 6
                        ? 'bg-emerald-500'
                        : h.doneDays >= 3
                          ? 'bg-amber-500'
                          : 'bg-slate-400'
                    }`}
                    style={{ width: `${h.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
