import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Sparkles,
} from 'lucide-react';
import { CBTExamResult, Student } from '../types';
import {
  getStoredCBTResults,
  getStoredTKAResults,
  getStoredTKASubmissions,
  TKASubmissionItem,
} from '../utils/storage';

interface ExamCatalogMeta {
  id: string;
  category: 'cbt' | 'tka';
  mapel: string;
  judul: string;
  paketName: string;
}

interface Props {
  student: Student | undefined;
  cbtExams: ExamCatalogMeta[];
  tkaExams: ExamCatalogMeta[];
  onStartCbt: () => void;
  onStartTka: () => void;
}

interface PerformanceEntry {
  key: string;
  urutan: number;
  labelPendek: string;
  judul: string;
  mapel: string;
  category: 'CBT' | 'TKA';
  nilai: number;
  cbtNilai?: number;
  tkaNilai?: number;
  waktu: string;
  status: 'Tuntas' | 'Perlu Latihan';
}

const KKTP_THRESHOLD = 75;

function inferExamMeta(
  res: CBTExamResult,
  examLookup: Map<string, ExamCatalogMeta>
): { category: 'CBT' | 'TKA'; mapel: string; judul: string } {
  if (res.category && res.mapel && res.judul) {
    return {
      category: res.category === 'tka' ? 'TKA' : 'CBT',
      mapel: res.mapel,
      judul: res.judul,
    };
  }
  const found = examLookup.get(res.examId);
  if (found) {
    return {
      category: found.category === 'tka' ? 'TKA' : 'CBT',
      mapel: found.mapel,
      judul: found.judul,
    };
  }
  const isTka = res.examId.toLowerCase().startsWith('tka_');
  const cleanTitle = res.examId
    .replace(/^tka_live_|^tka_|^cbt_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    category: isTka ? 'TKA' : 'CBT',
    mapel: res.mapel || (isTka ? 'TKA Terpadu' : 'Penilaian CBT'),
    judul: res.judul || cleanTitle || (isTka ? 'Latihan TKA' : 'Ujian CBT'),
  };
}

function shortenMapel(mapel: string): string {
  const m = mapel.trim();
  if (m.toLowerCase().includes('ilmu pengetahuan alam')) return 'IPAS';
  if (m.toLowerCase().includes('koding')) return 'KKA';
  if (m.toLowerCase().includes('pendidikan agama')) return 'PAI';
  if (m.toLowerCase().includes('pendidikan pancasila')) return 'Pancasila';
  if (m.toLowerCase().includes('jasmani')) return 'PJOK';
  if (m.toLowerCase().includes('bahasa indonesia')) return 'B. Indo';
  if (m.toLowerCase().includes('bahasa inggris')) return 'B. Inggris';
  return m.length > 14 ? `${m.slice(0, 12)}…` : m;
}

export const StudentPerformanceStats: React.FC<Props> = ({
  student,
  cbtExams,
  tkaExams,
  onStartCbt,
  onStartTka,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'CBT' | 'TKA'>('all');
  const [chartView, setChartView] = useState<'trend' | 'subject'>('trend');
  const [cbtResults, setCbtResults] = useState<CBTExamResult[]>(() => getStoredCBTResults());
  const [tkaResults, setTkaResults] = useState<CBTExamResult[]>(() => getStoredTKAResults());
  const [tkaSubmissions, setTkaSubmissions] = useState<TKASubmissionItem[]>(() =>
    getStoredTKASubmissions()
  );

  useEffect(() => {
    const refreshResults = () => {
      setCbtResults(getStoredCBTResults());
      setTkaResults(getStoredTKAResults());
      setTkaSubmissions(getStoredTKASubmissions());
    };
    refreshResults();
    window.addEventListener('sekolahku-exam-results-updated', refreshResults);
    window.addEventListener('sekolahku-cloud-sync-updated', refreshResults);
    return () => {
      window.removeEventListener('sekolahku-exam-results-updated', refreshResults);
      window.removeEventListener('sekolahku-cloud-sync-updated', refreshResults);
    };
  }, [student?.id]);

  const examLookup = useMemo(() => {
    const map = new Map<string, ExamCatalogMeta>();
    [...cbtExams, ...tkaExams].forEach((ex) => map.set(ex.id, ex));
    return map;
  }, [cbtExams, tkaExams]);

  const entries: PerformanceEntry[] = useMemo(() => {
    if (!student) return [];

    const matchStudent = (sid?: string, sname?: string, snisn?: string) => {
      if (sid && sid === student.id) return true;
      if (snisn && student.nisn && snisn === student.nisn) return true;
      if (sname && student.nama && sname.toLowerCase() === student.nama.toLowerCase()) return true;
      return false;
    };

    const collected: PerformanceEntry[] = [];
    const seenTkaPakets = new Set<string>();

    // 1. Riwayat hasil CBT & TKA dari pengerjaan ujian siswa
    const combinedRawResults = [...cbtResults, ...tkaResults];
    combinedRawResults.forEach((res, idx) => {
      if (!matchStudent(res.studentId, res.studentName)) return;
      const meta = inferExamMeta(res, examLookup);
      const score = Math.max(0, Math.min(100, Math.round(Number(res.nilai) || 0)));
      if (meta.category === 'TKA') {
        const paketGuess = res.paketName || examLookup.get(res.examId)?.paketName || meta.judul;
        seenTkaPakets.add(paketGuess.toLowerCase());
      }
      const timeLabel = res.tanggal
        ? `${res.tanggal} · ${res.waktuSelesai || '-'}`
        : res.waktuSelesai || '-';

      collected.push({
        key: `res_${res.examId}_${idx}`,
        urutan: collected.length + 1,
        labelPendek: `${meta.category} ${collected.length + 1}`,
        judul: meta.judul,
        mapel: meta.mapel,
        category: meta.category,
        nilai: score,
        cbtNilai: meta.category === 'CBT' ? score : undefined,
        tkaNilai: meta.category === 'TKA' ? score : undefined,
        waktu: timeLabel,
        status: score >= KKTP_THRESHOLD ? 'Tuntas' : 'Perlu Latihan',
      });
    });

    // 2. Rekap submission TKA yang diinput/disinkronkan dari modul TKA
    tkaSubmissions.forEach((sub, idx) => {
      if (!matchStudent(sub.studentId, sub.studentName, sub.nisn)) return;
      const paketName = sub.paket || `TKA ${idx + 1}`;
      if (seenTkaPakets.has(paketName.toLowerCase())) return;
      const score = Math.max(0, Math.min(100, Math.round(Number(sub.skorTotal) || 0)));
      collected.push({
        key: `sub_${sub.id || idx}`,
        urutan: collected.length + 1,
        labelPendek: `TKA ${collected.length + 1}`,
        judul: `${paketName} (Rekap Terpadu)`,
        mapel: 'TKA Terpadu',
        category: 'TKA',
        nilai: score,
        tkaNilai: score,
        waktu: sub.tanggalUjian || '-',
        status: score >= KKTP_THRESHOLD ? 'Tuntas' : 'Perlu Latihan',
      });
    });

    return collected.map((item, idx) => ({
      ...item,
      urutan: idx + 1,
      labelPendek: `#${idx + 1} ${shortenMapel(item.mapel)}`,
    }));
  }, [student, cbtResults, tkaResults, tkaSubmissions, examLookup]);

  const filteredEntries = useMemo(() => {
    if (categoryFilter === 'all') return entries;
    return entries.filter((e) => e.category === categoryFilter);
  }, [entries, categoryFilter]);

  const subjectChartData = useMemo(() => {
    const grouped = new Map<
      string,
      { mapel: string; fullMapel: string; cbtSum: number; cbtCount: number; tkaSum: number; tkaCount: number }
    >();

    filteredEntries.forEach((item) => {
      const key = item.mapel;
      if (!grouped.has(key)) {
        grouped.set(key, {
          mapel: shortenMapel(key),
          fullMapel: key,
          cbtSum: 0,
          cbtCount: 0,
          tkaSum: 0,
          tkaCount: 0,
        });
      }
      const bucket = grouped.get(key)!;
      if (item.category === 'CBT') {
        bucket.cbtSum += item.nilai;
        bucket.cbtCount += 1;
      } else {
        bucket.tkaSum += item.nilai;
        bucket.tkaCount += 1;
      }
    });

    return Array.from(grouped.values()).map((g) => ({
      mapel: g.mapel,
      fullMapel: g.fullMapel,
      CBT: g.cbtCount > 0 ? Math.round(g.cbtSum / g.cbtCount) : null,
      TKA: g.tkaCount > 0 ? Math.round(g.tkaSum / g.tkaCount) : null,
    }));
  }, [filteredEntries]);

  const metrics = useMemo(() => {
    if (filteredEntries.length === 0) {
      return {
        avg: 0,
        highest: 0,
        highestLabel: '-',
        total: 0,
        cbtCount: 0,
        tkaCount: 0,
        passedCount: 0,
        passRate: 0,
        delta: 0,
      };
    }

    const total = filteredEntries.length;
    const sum = filteredEntries.reduce((acc, cur) => acc + cur.nilai, 0);
    const avg = Math.round(sum / total);
    const highestEntry = filteredEntries.reduce(
      (best, cur) => (cur.nilai > best.nilai ? cur : best),
      filteredEntries[0]
    );
    const cbtCount = filteredEntries.filter((e) => e.category === 'CBT').length;
    const tkaCount = filteredEntries.filter((e) => e.category === 'TKA').length;
    const passedCount = filteredEntries.filter((e) => e.nilai >= KKTP_THRESHOLD).length;
    const passRate = Math.round((passedCount / total) * 100);
    const delta =
      total >= 2 ? filteredEntries[total - 1].nilai - filteredEntries[0].nilai : 0;

    return {
      avg,
      highest: highestEntry.nilai,
      highestLabel: `${highestEntry.category} · ${shortenMapel(highestEntry.mapel)}`,
      total,
      cbtCount,
      tkaCount,
      passedCount,
      passRate,
      delta,
    };
  }, [filteredEntries]);

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span>Rekap Evaluasi Siswa</span>
            <span aria-hidden="true">·</span>
            <span>CBT &amp; TKA</span>
          </div>
          <h2 className="text-lg sm:text-xl font-display font-black text-slate-900 mt-0.5 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-rose-600 shrink-0" />
            <span>Statistik Performa Belajar</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented Filter Kategori */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: 'all', label: 'Semua Ujian' },
                { id: 'CBT', label: 'Ujian CBT' },
                { id: 'TKA', label: 'Ujian TKA' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCategoryFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Segmented Mode Grafik */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setChartView('trend')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chartView === 'trend'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tren Nilai
            </button>
            <button
              type="button"
              onClick={() => setChartView('subject')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chartView === 'subject'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Per Mapel
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Strip (Flat with hairline dividers, tabular numerals) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-2xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 bg-slate-50/50">
        <div className="p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-500">Rata-Rata Nilai</div>
          <div className="text-2xl font-display font-black text-slate-900 tabular-nums">
            {metrics.avg}
          </div>
          <div className="text-xs font-semibold flex items-center gap-1">
            {metrics.delta > 0 ? (
              <span className="text-emerald-700 inline-flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Naik {metrics.delta} poin
              </span>
            ) : metrics.delta < 0 ? (
              <span className="text-amber-700 inline-flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" /> Turun {Math.abs(metrics.delta)} poin
              </span>
            ) : (
              <span className="text-slate-500 inline-flex items-center gap-1">
                <Minus className="w-3.5 h-3.5" /> Stabil
              </span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-500">Nilai Tertinggi</div>
          <div className="text-2xl font-display font-black text-slate-900 tabular-nums">
            {metrics.highest}
          </div>
          <div className="text-xs text-slate-600 truncate">{metrics.highestLabel}</div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-500">Ujian Selesai</div>
          <div className="text-2xl font-display font-black text-slate-900 tabular-nums">
            {metrics.total}
          </div>
          <div className="text-xs text-slate-600 tabular-nums">
            {metrics.cbtCount} CBT <span aria-hidden="true">·</span> {metrics.tkaCount} TKA
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-500">Ketuntasan (≥ {KKTP_THRESHOLD})</div>
          <div className="text-2xl font-display font-black text-slate-900 tabular-nums">
            {metrics.passRate}%
          </div>
          <div className="text-xs text-slate-600 tabular-nums">
            {metrics.passedCount} dari {metrics.total} ujian tuntas
          </div>
        </div>
      </div>

      {/* Chart or Empty State */}
      {filteredEntries.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-4 bg-slate-50/40">
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-display font-black text-slate-800">
              Belum Ada Riwayat Nilai {categoryFilter === 'all' ? 'CBT atau TKA' : categoryFilter}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Grafik tren perkembangan nilai dan perbandingan per mata pelajaran akan muncul secara
              otomatis setelah kamu menyelesaikan ujian CBT atau Tryout/Simulasi TKA.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onStartCbt}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>Mulai Ujian CBT</span>
            </button>
            <button
              type="button"
              onClick={onStartTka}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mulai Tes TKA</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Recharts Visualization */}
          <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="text-xs font-bold text-slate-700">
                {chartView === 'trend'
                  ? 'Grafik Tren Perkembangan Nilai (Skala 0–100)'
                  : 'Rata-Rata Nilai per Mata Pelajaran (CBT vs TKA)'}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block" />
                  CBT
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-violet-600 inline-block" />
                  TKA
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-dashed border-emerald-600 inline-block" />
                  KKTP ({KKTP_THRESHOLD})
                </span>
              </div>
            </div>

            <div className="w-full h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                {chartView === 'trend' ? (
                  <AreaChart
                    data={filteredEntries}
                    margin={{ top: 12, right: 16, left: -16, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="scoreTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e11d48" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#e11d48" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="labelPendek"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine
                      y={KKTP_THRESHOLD}
                      stroke="#059669"
                      strokeDasharray="5 5"
                      label={{
                        value: `KKTP ${KKTP_THRESHOLD}`,
                        position: 'insideTopRight',
                        fill: '#059669',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const row = payload[0].payload as PerformanceEntry;
                        return (
                          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md text-xs space-y-1 max-w-[240px]">
                            <div className="text-[11px] font-semibold text-slate-500">
                              {row.category} · {row.mapel}
                            </div>
                            <div className="font-bold text-slate-900 leading-snug">{row.judul}</div>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <span className="text-slate-500">Nilai Akhir</span>
                              <span className="font-mono font-black text-sm text-slate-900 tabular-nums">
                                {row.nilai}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">{row.waktu}</span>
                              <span
                                className={
                                  row.nilai >= KKTP_THRESHOLD
                                    ? 'font-bold text-emerald-700'
                                    : 'font-bold text-amber-700'
                                }
                              >
                                {row.status}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="nilai"
                      name="Nilai Ujian"
                      stroke="#e11d48"
                      strokeWidth={2.5}
                      fill="url(#scoreTrendFill)"
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        if (typeof cx !== 'number' || typeof cy !== 'number') return <g />;
                        const fill = payload?.category === 'TKA' ? '#7c3aed' : '#e11d48';
                        return (
                          <circle
                            key={payload?.key || `${cx}_${cy}`}
                            cx={cx}
                            cy={cy}
                            r={5}
                            fill={fill}
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                        );
                      }}
                      activeDot={{ r: 7, strokeWidth: 2, stroke: '#ffffff' }}
                    />
                  </AreaChart>
                ) : (
                  <BarChart
                    data={subjectChartData}
                    margin={{ top: 12, right: 16, left: -16, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="mapel"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine y={KKTP_THRESHOLD} stroke="#059669" strokeDasharray="5 5" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const row = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md text-xs space-y-1">
                            <div className="font-bold text-slate-900">{row.fullMapel}</div>
                            {typeof row.CBT === 'number' && (
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-rose-700 font-semibold">Rata-rata CBT</span>
                                <span className="font-mono font-bold tabular-nums">{row.CBT}</span>
                              </div>
                            )}
                            {typeof row.TKA === 'number' && (
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-violet-700 font-semibold">Rata-rata TKA</span>
                                <span className="font-mono font-bold tabular-nums">{row.TKA}</span>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {(categoryFilter === 'all' || categoryFilter === 'CBT') && (
                      <Bar dataKey="CBT" name="Nilai CBT" fill="#e11d48" radius={[6, 6, 0, 0]} />
                    )}
                    {(categoryFilter === 'all' || categoryFilter === 'TKA') && (
                      <Bar dataKey="TKA" name="Nilai TKA" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                    )}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Compact Rekap Riwayat Nilai */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-display font-black text-slate-800">
                Riwayat Nilai Ujian ({filteredEntries.length})
              </h3>
              <span className="text-[11px] text-slate-500">Diurutkan dari awal ke terbaru</span>
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-white border-b border-slate-200 text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4 font-bold">No</th>
                    <th className="py-2.5 px-4 font-bold">Jenis</th>
                    <th className="py-2.5 px-4 font-bold">Ujian &amp; Mata Pelajaran</th>
                    <th className="py-2.5 px-4 font-bold">Waktu</th>
                    <th className="py-2.5 px-4 font-bold text-right">Nilai</th>
                    <th className="py-2.5 px-4 font-bold">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredEntries.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-slate-500 tabular-nums">
                        {row.urutan}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-700">{row.category}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900">{row.judul}</div>
                        <div className="text-[11px] text-slate-500">{row.mapel}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{row.waktu}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900 tabular-nums">
                        {row.nilai}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {row.nilai >= KKTP_THRESHOLD ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Tuntas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                            <AlertCircle className="w-3.5 h-3.5" /> Perlu Latihan
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
