import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  Cell,
} from 'recharts';
import * as XLSX from 'xlsx';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Sparkles,
  FileSpreadsheet,
  Printer,
  BookOpen,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { CBTExamResult, SchoolProfile, Student, isAbkExcludedFromTka } from '../types';
import {
  extractBaseTkaPaket,
  getStoredCBTResults,
  getStoredTKAResults,
  getStoredTKASubmissions,
  normalizeTkaMapelKey,
  TKAMapelScoreKey,
  TKASubmissionItem,
} from '../utils/storage';
import { getLocalTodayStr } from '../utils/dateUtils';
import { TKA_MAPEL_LIST } from '../data/defaultData';

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
  profile?: SchoolProfile;
  activeYear?: string;
  activeSemester?: string;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

interface PerformanceEntry {
  key: string;
  examId?: string;
  paketName: string;
  shortPaket: string;
  urutan: number;
  labelPendek: string;
  judul: string;
  mapel: string;
  shortMapel: string;
  category: 'CBT' | 'TKA';
  nilai: number;
  recordedAt: number;
  waktu: string;
  status: 'Tuntas' | 'Perlu Latihan';
}

interface PaketSubjectBreakdown {
  mapel: string;
  shortMapel: string;
  nilai: number;
  category: 'CBT' | 'TKA';
  status: 'Tuntas' | 'Perlu Latihan';
  waktu: string;
  judul: string;
}

interface PaketChartRow {
  paketKey: string;
  paketName: string;
  shortPaket: string;
  category: 'CBT' | 'TKA' | 'Campuran';
  sortOrder: number;
  firstRecordedAt: number;
  rataRata: number;
  highest: number;
  lowest: number;
  mapelCount: number;
  tuntasCount: number;
  subjects: PaketSubjectBreakdown[];
  scoresByMapel: Record<string, number>;
  [dynamicField: string]: any;
}

const KKTP_THRESHOLD = 75;

const SUBJECT_PALETTE = [
  '#e11d48', // Rose
  '#2563eb', // Blue
  '#059669', // Emerald
  '#d97706', // Amber
  '#7c3aed', // Violet
  '#0891b2', // Cyan
  '#db2777', // Pink
  '#4f46e5', // Indigo
  '#65a30d', // Lime
  '#ea580c', // Orange
];

function canonicalizeMapelName(rawMapel: string): string {
  const m = (rawMapel || '').trim();
  const low = m.toLowerCase();
  if (!m) return 'Umum';
  if (low.includes('ipas') || low.includes('ilmu pengetahuan alam')) return 'IPAS';
  if (low.includes('koding') || low.includes('kka') || low.includes('artifisial')) {
    return 'Koding dan Kecerdasan Artifisial (KKA)';
  }
  if (low.includes('bahasa indonesia')) return 'Bahasa Indonesia';
  if (low.includes('bahasa inggris')) return 'Bahasa Inggris';
  if (low === 'matematika' || low.includes('matematika')) return 'Matematika';
  if (low.includes('pendidikan pancasila') || low === 'pancasila' || low === 'ppkn') {
    return 'Pendidikan Pancasila';
  }
  if (low.includes('pendidikan agama') || low === 'pai') return 'Pendidikan Agama Islam';
  if (low.includes('jasmani') || low === 'pjok') return 'PJOK';
  return m;
}

function normalizeMapelCompareKey(mapel: string): string {
  return canonicalizeMapelName(mapel).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function shortenMapel(mapel: string): string {
  const canonical = canonicalizeMapelName(mapel);
  const low = canonical.toLowerCase();
  if (low === 'ipas') return 'IPAS';
  if (low.includes('koding')) return 'KKA';
  if (low.includes('pendidikan agama')) return 'PAI';
  if (low.includes('pendidikan pancasila')) return 'Pancasila';
  if (low === 'pjok') return 'PJOK';
  if (low.includes('bahasa indonesia')) return 'B. Indo';
  if (low.includes('bahasa inggris')) return 'B. Inggris';
  if (low === 'matematika') return 'Matematika';
  return canonical.length > 14 ? `${canonical.slice(0, 12)}…` : canonical;
}

function shortenPaketName(paketName: string): string {
  const clean = (paketName || '').trim();
  if (!clean) return 'Tes';
  const sumatifMatch = clean.match(/Sumatif\s*(\d+)/i);
  if (sumatifMatch && !clean.toLowerCase().includes('tengah') && !clean.toLowerCase().includes('akhir') && !clean.toLowerCase().includes('inklusi')) {
    return `Sumatif ${sumatifMatch[1]}`;
  }
  if (clean.toLowerCase().includes('asts')) return 'ASTS';
  if (clean.toLowerCase().includes('asas')) return 'ASAS';
  if (clean.toLowerCase().includes('remedial')) {
    const num = clean.match(/\d+/)?.[0];
    return num ? `Rem ${num}` : 'Remedial';
  }
  if (clean.toLowerCase().includes('inklusi')) {
    const num = clean.match(/\d+/)?.[0];
    return num ? `Inklusi ${num}` : 'Inklusi';
  }
  return clean
    .replace(/^Tryout TKA\s*/i, 'TO TKA ')
    .replace(/^Try Out\s*/i, 'TO ')
    .replace(/^Simulasi\s*/i, 'Sim ')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim();
}

function getPaketSortOrder(paketName: string, category: 'CBT' | 'TKA'): number {
  const low = paketName.toLowerCase();
  const num = Number(paketName.match(/\d+/)?.[0] || 0);
  if (category === 'CBT') {
    if (low.includes('sumatif') && !low.includes('tengah') && !low.includes('akhir') && !low.includes('inklusi')) {
      return 100 + (num || 1);
    }
    if (low.includes('asts') || low.includes('tengah semester')) return 150;
    if (low.includes('asas') || low.includes('akhir semester')) return 190;
    if (low.includes('remedial')) return 200 + (num || 1);
    if (low.includes('inklusi')) return 250 + (num || 1);
    return 300;
  }
  if (low.includes('simulasi')) return 400 + (num || 1);
  if (low.includes('tryout tka')) return 500 + (num || 1);
  if (low.includes('try out')) return 600 + (num || 1);
  return 700;
}

function inferPaketFromJudul(judul: string, category: 'CBT' | 'TKA'): string {
  const raw = (judul || '').trim();
  const low = raw.toLowerCase();
  if (category === 'TKA') {
    const simMatch = raw.match(/(Simulasi\s*\d+|Try\s*Out\s*\d+|Tryout\s*TKA\s*\d+)/i);
    if (simMatch) return simMatch[1].replace(/\s+/g, ' ').trim();
    const prefix = raw.split(' - ')[0]?.trim();
    if (prefix) return extractBaseTkaPaket(prefix);
    return 'Latihan TKA';
  }
  if (low.includes('asts')) return 'ASTS (Sumatif Tengah Semester)';
  if (low.includes('asas')) return 'ASAS (Sumatif Akhir Semester)';
  const sumatifMatch = raw.match(/(Sumatif\s*(?:Inklusi\s*)?\d+(?:\s*\(AS\s*\d+\))?)/i);
  if (sumatifMatch) return sumatifMatch[1].trim();
  const remedialMatch = raw.match(/(Remedial\s*\d+)/i);
  if (remedialMatch) return remedialMatch[1].trim();
  const prefix = raw.split(' - ')[0]?.trim();
  return prefix || 'Penilaian CBT';
}

function inferExamMeta(
  res: CBTExamResult,
  examLookup: Map<string, ExamCatalogMeta>
): { category: 'CBT' | 'TKA'; mapel: string; judul: string; paketName: string } {
  const found = examLookup.get(res.examId);
  const category: 'CBT' | 'TKA' =
    res.category === 'tka' || found?.category === 'tka' || res.examId.toLowerCase().startsWith('tka_')
      ? 'TKA'
      : 'CBT';

  const cleanTitle = res.examId
    .replace(/^tka_live_|^tka_|^cbt_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const judul = res.judul || found?.judul || cleanTitle || (category === 'TKA' ? 'Latihan TKA' : 'Ujian CBT');
  const mapelRaw = res.mapel || found?.mapel || (category === 'TKA' ? 'TKA Terpadu' : 'Penilaian CBT');
  const mapel = canonicalizeMapelName(mapelRaw);

  const rawPaket = res.paketName || found?.paketName || '';
  const paketName = rawPaket
    ? category === 'TKA'
      ? extractBaseTkaPaket(rawPaket)
      : rawPaket.trim()
    : inferPaketFromJudul(judul, category);

  return { category, mapel, judul, paketName };
}

export const StudentPerformanceStats: React.FC<Props> = ({
  student,
  cbtExams,
  tkaExams,
  onStartCbt,
  onStartTka,
  profile,
  activeYear = '2026/2027',
  activeSemester = 'Ganjil',
  showToast,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'CBT' | 'TKA'>('all');
  const [selectedPaket, setSelectedPaket] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [chartView, setChartView] = useState<'paket' | 'subject'>('paket');
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
    window.addEventListener('storage', refreshResults);
    return () => {
      window.removeEventListener('sekolahku-exam-results-updated', refreshResults);
      window.removeEventListener('sekolahku-cloud-sync-updated', refreshResults);
      window.removeEventListener('storage', refreshResults);
    };
  }, [student?.id]);

  const examLookup = useMemo(() => {
    const map = new Map<string, ExamCatalogMeta>();
    [...cbtExams, ...tkaExams].forEach((ex) => map.set(ex.id, ex));
    return map;
  }, [cbtExams, tkaExams]);

  const isExcludedFromTka = isAbkExcludedFromTka(student);

  const entries: PerformanceEntry[] = useMemo(() => {
    if (!student) return [];

    const matchStudent = (sid?: string, sname?: string, snisn?: string) => {
      if (sid && sid === student.id) return true;
      if (snisn && student.nisn && snisn === student.nisn) return true;
      if (sname && student.nama && sname.toLowerCase() === student.nama.toLowerCase()) return true;
      return false;
    };

    const collected: PerformanceEntry[] = [];
    const seenResultKeys = new Set<string>();

    // 1. Riwayat hasil CBT & TKA dari pengerjaan ujian siswa (per paket + per mapel)
    const combinedRawResults = [...cbtResults, ...tkaResults];
    combinedRawResults.forEach((res, idx) => {
      if (!matchStudent(res.studentId, res.studentName, res.nisn)) return;
      const meta = inferExamMeta(res, examLookup);
      if (isExcludedFromTka && meta.category === 'TKA') return;

      const dedupKey = `${meta.category}__${meta.paketName.toLowerCase()}__${normalizeMapelCompareKey(meta.mapel)}`;
      if (seenResultKeys.has(dedupKey)) return;
      seenResultKeys.add(dedupKey);

      const score = Math.max(0, Math.min(100, Math.round(Number(res.nilai) || 0)));
      const timeLabel = res.tanggal
        ? `${res.tanggal} · ${res.waktuSelesai || '-'}`
        : res.waktuSelesai || '-';

      collected.push({
        key: `res_${res.examId}_${idx}`,
        examId: res.examId,
        paketName: meta.paketName,
        shortPaket: shortenPaketName(meta.paketName),
        urutan: collected.length + 1,
        labelPendek: `${shortenPaketName(meta.paketName)} · ${shortenMapel(meta.mapel)}`,
        judul: meta.judul,
        mapel: meta.mapel,
        shortMapel: shortenMapel(meta.mapel),
        category: meta.category,
        nilai: score,
        recordedAt: Number(res.recordedAt) || idx + 1,
        waktu: timeLabel,
        status: score >= KKTP_THRESHOLD ? 'Tuntas' : 'Perlu Latihan',
      });
    });

    // 2. Rekap submission TKA: bongkar per mata pelajaran di dalam paket tes
    if (!isExcludedFromTka) {
      tkaSubmissions.forEach((sub, idx) => {
        if (!matchStudent(sub.studentId, sub.studentName, sub.nisn)) return;
        const paketName = extractBaseTkaPaket(sub.paketDasar || sub.paket || `TKA ${idx + 1}`);
        const completedNormKeys = new Set(
          (Array.isArray(sub.completedMapels) ? sub.completedMapels : []).map((m) =>
            normalizeTkaMapelKey(m)
          )
        );

        let unpackedAnyMapel = false;
        TKA_MAPEL_LIST.forEach((rawMapel) => {
          const mapelKey: TKAMapelScoreKey = normalizeTkaMapelKey(rawMapel);
          const rawScore = sub.scoresPerMapel?.[mapelKey];
          const hasScore =
            completedNormKeys.has(mapelKey) || (typeof rawScore === 'number' && rawScore > 0);
          if (!hasScore) return;

          unpackedAnyMapel = true;
          const canonicalMapel = canonicalizeMapelName(mapelKey);
          const dedupKey = `TKA__${paketName.toLowerCase()}__${normalizeMapelCompareKey(canonicalMapel)}`;
          if (seenResultKeys.has(dedupKey)) return;
          seenResultKeys.add(dedupKey);

          const score = Math.max(0, Math.min(100, Math.round(Number(rawScore) || 0)));
          const parsedTime = sub.updatedAt ? Date.parse(sub.updatedAt) : NaN;

          collected.push({
            key: `sub_${sub.id || idx}_${normalizeMapelCompareKey(canonicalMapel)}`,
            paketName,
            shortPaket: shortenPaketName(paketName),
            urutan: collected.length + 1,
            labelPendek: `${shortenPaketName(paketName)} · ${shortenMapel(canonicalMapel)}`,
            judul: `${paketName} - ${canonicalMapel}`,
            mapel: canonicalMapel,
            shortMapel: shortenMapel(canonicalMapel),
            category: 'TKA',
            nilai: score,
            recordedAt: Number.isFinite(parsedTime) ? parsedTime : 10000 + idx,
            waktu: sub.tanggalUjian || '-',
            status: score >= KKTP_THRESHOLD ? 'Tuntas' : 'Perlu Latihan',
          });
        });

        // Fallback jika submission lama hanya memiliki skorTotal tanpa rincian mapel
        if (!unpackedAnyMapel) {
          const dedupKey = `TKA__${paketName.toLowerCase()}__tkaterpadu`;
          if (!seenResultKeys.has(dedupKey)) {
            seenResultKeys.add(dedupKey);
            const score = Math.max(0, Math.min(100, Math.round(Number(sub.skorTotal) || 0)));
            collected.push({
              key: `sub_${sub.id || idx}`,
              paketName,
              shortPaket: shortenPaketName(paketName),
              urutan: collected.length + 1,
              labelPendek: `${shortenPaketName(paketName)} · TKA`,
              judul: `${paketName} (Rekap Terpadu)`,
              mapel: 'TKA Terpadu',
              shortMapel: 'TKA',
              category: 'TKA',
              nilai: score,
              recordedAt: 10000 + idx,
              waktu: sub.tanggalUjian || '-',
              status: score >= KKTP_THRESHOLD ? 'Tuntas' : 'Perlu Latihan',
            });
          }
        }
      });
    }

    return collected
      .sort((a, b) => {
        const orderDiff =
          getPaketSortOrder(a.paketName, a.category) -
          getPaketSortOrder(b.paketName, b.category);
        if (orderDiff !== 0) return orderDiff;
        if (a.paketName !== b.paketName) return a.paketName.localeCompare(b.paketName, 'id');
        if (a.recordedAt !== b.recordedAt) return a.recordedAt - b.recordedAt;
        return a.mapel.localeCompare(b.mapel, 'id');
      })
      .map((item, idx) => ({
        ...item,
        urutan: idx + 1,
      }));
  }, [student, isExcludedFromTka, cbtResults, tkaResults, tkaSubmissions, examLookup]);

  const categoryEntries = useMemo(() => {
    if (categoryFilter === 'all') return entries;
    return entries.filter((e) => e.category === categoryFilter);
  }, [entries, categoryFilter]);

  const availablePakets = useMemo(() => {
    const map = new Map<string, { name: string; order: number }>();
    categoryEntries.forEach((e) => {
      if (!map.has(e.paketName)) {
        map.set(e.paketName, {
          name: e.paketName,
          order: getPaketSortOrder(e.paketName, e.category),
        });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'id'))
      .map((p) => p.name);
  }, [categoryEntries]);

  const effectivePaket =
    selectedPaket === 'all' || availablePakets.includes(selectedPaket) ? selectedPaket : 'all';

  const paketFilteredEntries = useMemo(() => {
    if (effectivePaket === 'all') return categoryEntries;
    return categoryEntries.filter((e) => e.paketName === effectivePaket);
  }, [categoryEntries, effectivePaket]);

  const availableSubjects = useMemo(() => {
    return Array.from(new Set(paketFilteredEntries.map((e) => e.mapel))).sort((a, b) =>
      a.localeCompare(b, 'id')
    );
  }, [paketFilteredEntries]);

  const effectiveSubject =
    selectedSubject === 'all' || availableSubjects.includes(selectedSubject)
      ? selectedSubject
      : 'all';

  const filteredEntries = useMemo(() => {
    const base =
      effectiveSubject === 'all'
        ? paketFilteredEntries
        : paketFilteredEntries.filter((e) => e.mapel === effectiveSubject);

    return base.map((item, idx) => ({
      ...item,
      urutan: idx + 1,
    }));
  }, [paketFilteredEntries, effectiveSubject]);

  // Data Grafik Perkembangan PER PAKET TES yang di dalamnya berisi berbagai Mata Pelajaran
  const { paketChartData, activeChartMapels } = useMemo(() => {
    const paketMap = new Map<string, PaketChartRow>();
    const mapelSet = new Set<string>();

    filteredEntries.forEach((entry) => {
      mapelSet.add(entry.mapel);
      const groupKey = `${entry.category}__${entry.paketName}`;
      if (!paketMap.has(groupKey)) {
        paketMap.set(groupKey, {
          paketKey: groupKey,
          paketName: entry.paketName,
          shortPaket: entry.shortPaket,
          category: entry.category,
          sortOrder: getPaketSortOrder(entry.paketName, entry.category),
          firstRecordedAt: entry.recordedAt,
          rataRata: 0,
          highest: 0,
          lowest: 100,
          mapelCount: 0,
          tuntasCount: 0,
          subjects: [],
          scoresByMapel: {},
        });
      }
      const bucket = paketMap.get(groupKey)!;
      if (entry.recordedAt < bucket.firstRecordedAt) {
        bucket.firstRecordedAt = entry.recordedAt;
      }
      bucket.subjects.push({
        mapel: entry.mapel,
        shortMapel: entry.shortMapel,
        nilai: entry.nilai,
        category: entry.category,
        status: entry.status,
        waktu: entry.waktu,
        judul: entry.judul,
      });
      bucket.scoresByMapel[entry.mapel] = entry.nilai;
      bucket[`mapel_${normalizeMapelCompareKey(entry.mapel)}`] = entry.nilai;
    });

    const sortedRows = Array.from(paketMap.values())
      .map((row) => {
        const sortedSubjects = [...row.subjects].sort((a, b) =>
          a.mapel.localeCompare(b.mapel, 'id')
        );
        const total = sortedSubjects.reduce((acc, s) => acc + s.nilai, 0);
        const count = sortedSubjects.length;
        return {
          ...row,
          subjects: sortedSubjects,
          mapelCount: count,
          tuntasCount: sortedSubjects.filter((s) => s.nilai >= KKTP_THRESHOLD).length,
          rataRata: count > 0 ? Math.round(total / count) : 0,
          highest: count > 0 ? Math.max(...sortedSubjects.map((s) => s.nilai)) : 0,
          lowest: count > 0 ? Math.min(...sortedSubjects.map((s) => s.nilai)) : 0,
        };
      })
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.firstRecordedAt - b.firstRecordedAt ||
          a.paketName.localeCompare(b.paketName, 'id')
      );

    // Jika ada paket bernama sama di CBT & TKA, bedakan label sumbu X
    const shortNameCount = new Map<string, number>();
    sortedRows.forEach((r) => {
      shortNameCount.set(r.shortPaket, (shortNameCount.get(r.shortPaket) || 0) + 1);
    });
    const disambiguatedRows = sortedRows.map((r) => ({
      ...r,
      shortPaket:
        (shortNameCount.get(r.shortPaket) || 0) > 1
          ? `${r.shortPaket} (${r.category})`
          : r.shortPaket,
    }));

    const orderedMapels = Array.from(mapelSet)
      .sort((a, b) => a.localeCompare(b, 'id'))
      .map((fullMapel, idx) => ({
        fullMapel,
        shortMapel: shortenMapel(fullMapel),
        dataKey: `mapel_${normalizeMapelCompareKey(fullMapel)}`,
        color: SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length],
      }));

    return {
      paketChartData: disambiguatedRows,
      activeChartMapels: orderedMapels,
    };
  }, [filteredEntries]);

  // Jika memilih 1 Paket Tes spesifik, tampilkan detail batang setiap mata pelajaran di dalam paket tersebut
  const singlePaketBreakdownData = useMemo(() => {
    if (effectivePaket === 'all' || paketChartData.length === 0) return [];
    return paketChartData.flatMap((row) =>
      row.subjects.map((sub, idx) => ({
        key: `${row.paketKey}_${sub.mapel}_${idx}`,
        mapel: sub.shortMapel,
        fullMapel: sub.mapel,
        paketName: row.paketName,
        category: sub.category,
        nilai: sub.nilai,
        status: sub.status,
        waktu: sub.waktu,
        fill: sub.nilai >= KKTP_THRESHOLD ? '#059669' : '#d97706',
      }))
    );
  }, [effectivePaket, paketChartData]);

  const subjectChartData = useMemo(() => {
    const grouped = new Map<
      string,
      {
        mapel: string;
        fullMapel: string;
        cbtSum: number;
        cbtCount: number;
        tkaSum: number;
        tkaCount: number;
        paketDetails: { paketName: string; category: 'CBT' | 'TKA'; nilai: number }[];
      }
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
          paketDetails: [],
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
      bucket.paketDetails.push({
        paketName: item.shortPaket,
        category: item.category,
        nilai: item.nilai,
      });
    });

    return Array.from(grouped.values()).map((g) => ({
      mapel: g.mapel,
      fullMapel: g.fullMapel,
      CBT: g.cbtCount > 0 ? Math.round(g.cbtSum / g.cbtCount) : null,
      TKA: g.tkaCount > 0 ? Math.round(g.tkaSum / g.tkaCount) : null,
      paketDetails: g.paketDetails,
    }));
  }, [filteredEntries]);

  const metrics = useMemo(() => {
    if (filteredEntries.length === 0) {
      return {
        avg: 0,
        highest: 0,
        highestLabel: '-',
        total: 0,
        paketCount: 0,
        cbtCount: 0,
        tkaCount: 0,
        passedCount: 0,
        passRate: 0,
        delta: 0,
        deltaContext: 'Stabil',
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
    const paketCount = paketChartData.length;

    // Hitung perkembangan rata-rata antar paket tes jika >= 2 paket, atau antar mapel
    const delta =
      paketCount >= 2
        ? paketChartData[paketCount - 1].rataRata - paketChartData[0].rataRata
        : total >= 2
        ? filteredEntries[total - 1].nilai - filteredEntries[0].nilai
        : 0;

    return {
      avg,
      highest: highestEntry.nilai,
      highestLabel: `${highestEntry.shortPaket} · ${shortenMapel(highestEntry.mapel)}`,
      total,
      paketCount,
      cbtCount,
      tkaCount,
      passedCount,
      passRate,
      delta,
      deltaContext: paketCount >= 2 ? 'Antar paket tes' : 'Antar sesi',
    };
  }, [filteredEntries, paketChartData]);

  const categoryLabel =
    categoryFilter === 'all' ? 'Semua Ujian (CBT & TKA)' : `Ujian ${categoryFilter}`;
  const paketLabel = effectivePaket === 'all' ? 'Semua Paket Tes' : effectivePaket;
  const subjectLabel =
    effectiveSubject === 'all' ? 'Semua Mata Pelajaran' : effectiveSubject;

  const tanggalCetakIndo = useMemo(
    () =>
      new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    []
  );

  const handleExportExcel = () => {
    if (filteredEntries.length === 0) {
      showToast?.('Belum ada data nilai ujian untuk diunduh ke Excel.', 'error');
      return;
    }

    const schoolName = profile?.name || 'SDN Rawa Badak Utara 21';
    const studentName = student?.nama || 'Siswa';
    const safeName = studentName
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const aoa: (string | number)[][] = [
      ['REKAPITULASI STATISTIK PERFORMA UJIAN SISWA PER PAKET TES (CBT & TKA)'],
      [schoolName],
      [],
      ['Nama Siswa', studentName, '', 'Tahun Pelajaran', activeYear],
      ['NISN', student?.nisn || '-', '', 'Semester', activeSemester],
      ['Kelas', student?.kelas || '-', '', 'Kategori Laporan', categoryLabel],
      ['Paket Tes', paketLabel, '', 'Mata Pelajaran', subjectLabel],
      ['Tanggal Unduh', tanggalCetakIndo, '', 'Ketuntasan KKTP', `>= ${KKTP_THRESHOLD}`],
      [],
      [
        'Ringkasan Performa',
        `Rata-Rata: ${metrics.avg}`,
        `Nilai Tertinggi: ${metrics.highest}`,
        `Paket / Mapel Selesai: ${metrics.paketCount} Paket (${metrics.total} Mapel)`,
        `Ketuntasan: ${metrics.passRate}% (${metrics.passedCount}/${metrics.total})`,
      ],
      [],
      ['No', 'Kategori', 'Paket Tes', 'Mata Pelajaran', 'Judul Ujian', 'Waktu Pengerjaan', 'Nilai', 'Keterangan'],
      ...filteredEntries.map((row) => [
        row.urutan,
        row.category,
        row.paketName,
        row.mapel,
        row.judul,
        row.waktu,
        row.nilai,
        row.status,
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const wsDetail = XLSX.utils.aoa_to_sheet(aoa);
    wsDetail['!cols'] = [
      { wch: 6 },
      { wch: 10 },
      { wch: 24 },
      { wch: 24 },
      { wch: 34 },
      { wch: 22 },
      { wch: 10 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Rekap Nilai Ujian');

    if (paketChartData.length > 0) {
      const paketRows = paketChartData.map((pkt, idx) => {
        const base: Record<string, string | number> = {
          No: idx + 1,
          'Paket Tes': pkt.paketName,
          Kategori: pkt.category,
          'Jumlah Mapel': pkt.mapelCount,
          'Rata-Rata Paket': pkt.rataRata,
          Ketuntasan: `${pkt.tuntasCount}/${pkt.mapelCount} Tuntas`,
        };
        activeChartMapels.forEach((m) => {
          base[m.fullMapel] = typeof pkt.scoresByMapel[m.fullMapel] === 'number' ? pkt.scoresByMapel[m.fullMapel] : '-';
        });
        return base;
      });
      const wsPaket = XLSX.utils.json_to_sheet(paketRows);
      wsPaket['!cols'] = [
        { wch: 6 },
        { wch: 26 },
        { wch: 12 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
        ...activeChartMapels.map(() => ({ wch: 16 })),
      ];
      XLSX.utils.book_append_sheet(wb, wsPaket, 'Rekap Per Paket Tes');
    }

    if (subjectChartData.length > 0) {
      const subjectRows = subjectChartData.map((item, idx) => ({
        No: idx + 1,
        'Mata Pelajaran': item.fullMapel,
        'Rata-Rata CBT': typeof item.CBT === 'number' ? item.CBT : '-',
        'Rata-Rata TKA': typeof item.TKA === 'number' ? item.TKA : '-',
      }));
      const wsSubject = XLSX.utils.json_to_sheet(subjectRows);
      wsSubject['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsSubject, 'Ringkasan Per Mapel');
    }

    const fileName = `Rekap_Performa_${safeName || 'Siswa'}_${getLocalTodayStr()}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast?.('File Excel rekap nilai per paket tes berhasil diunduh.', 'success');
  };

  const handleExportPDF = () => {
    if (filteredEntries.length === 0) {
      showToast?.('Belum ada data nilai ujian untuk dicetak atau disimpan ke PDF.', 'error');
      return;
    }
    showToast?.('Membuka dialog cetak — pilih "Simpan sebagai PDF" untuk menyimpan dokumen.', 'success');
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <>
      <section className="no-print bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 space-y-6">
        {/* Header & Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>Rekap Evaluasi Siswa</span>
              <span aria-hidden="true">·</span>
              <span>Per Paket Tes &amp; Mata Pelajaran</span>
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
                isExcludedFromTka
                  ? ([
                      { id: 'all', label: 'Semua Ujian' },
                      { id: 'CBT', label: 'Ujian CBT' },
                    ] as const)
                  : ([
                      { id: 'all', label: 'Semua Ujian' },
                      { id: 'CBT', label: 'Ujian CBT' },
                      { id: 'TKA', label: 'Ujian TKA' },
                    ] as const)
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

            {/* Dropdown Pilih Paket Tes */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-200/80">
              <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" aria-hidden="true" />
              <label htmlFor="stats-paket-filter" className="text-xs font-bold text-slate-600 whitespace-nowrap">
                Paket:
              </label>
              <select
                id="stats-paket-filter"
                aria-label="Pilih Paket Tes"
                value={effectivePaket}
                onChange={(e) => {
                  setSelectedPaket(e.target.value);
                  setChartView('paket');
                }}
                disabled={availablePakets.length === 0}
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer max-w-[175px] truncate disabled:opacity-50"
              >
                <option value="all">Semua Paket Tes</option>
                {availablePakets.map((pkt) => (
                  <option key={pkt} value={pkt}>
                    {pkt}
                  </option>
                ))}
              </select>
            </div>

            {/* Dropdown Pilih Mata Pelajaran */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-200/80">
              <BookOpen className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
              <label htmlFor="stats-subject-filter" className="text-xs font-bold text-slate-600 whitespace-nowrap">
                Mapel:
              </label>
              <select
                id="stats-subject-filter"
                aria-label="Pilih Mata Pelajaran"
                value={effectiveSubject}
                onChange={(e) => {
                  setSelectedSubject(e.target.value);
                }}
                disabled={availableSubjects.length === 0}
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer max-w-[165px] truncate disabled:opacity-50"
              >
                <option value="all">Semua Mata Pelajaran</option>
                {availableSubjects.map((mapel) => (
                  <option key={mapel} value={mapel}>
                    {mapel}
                  </option>
                ))}
              </select>
            </div>

            {/* Segmented Mode Grafik */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setChartView('paket')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chartView === 'paket'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Paket Tes
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

            {/* Tombol Unduh Laporan untuk Orang Tua */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                title="Unduh rekap nilai ujian dalam format Excel (.xlsx)"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span>Unduh Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportPDF}
                title="Cetak atau simpan rekap nilai ujian sebagai dokumen PDF"
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span>Unduh PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-2xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 bg-slate-50/50">
          <div className="p-4 space-y-1">
            <div className="text-xs font-semibold text-slate-500">Rata-Rata Nilai</div>
            <div className="text-2xl font-display font-black text-slate-900 tabular-nums">
              {metrics.avg}
            </div>
            <div className="text-xs font-semibold flex items-center gap-1">
              {metrics.delta > 0 ? (
                <span className="text-emerald-700 inline-flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Naik {metrics.delta} poin ({metrics.deltaContext})
                </span>
              ) : metrics.delta < 0 ? (
                <span className="text-amber-700 inline-flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" /> Turun {Math.abs(metrics.delta)} poin ({metrics.deltaContext})
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
            <div className="text-xs font-semibold text-slate-500">Paket &amp; Mapel Selesai</div>
            <div className="text-2xl font-display font-black text-slate-900 tabular-nums">
              {metrics.paketCount} <span className="text-sm font-bold text-slate-500">Paket</span>
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              {metrics.total} mapel ({metrics.cbtCount} CBT <span aria-hidden="true">·</span> {metrics.tkaCount} TKA)
            </div>
          </div>

          <div className="p-4 space-y-1">
            <div className="text-xs font-semibold text-slate-500">Ketuntasan (≥ {KKTP_THRESHOLD})</div>
            <div className="text-2xl font-display font-black text-slate-900 tabular-nums">
              {metrics.passRate}%
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              {metrics.passedCount} dari {metrics.total} mapel tuntas
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
                Grafik perkembangan per paket tes beserta mata pelajaran di dalamnya akan muncul otomatis setelah kamu menyelesaikan ujian CBT atau Simulasi/Try Out TKA.
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
            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-white space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs sm:text-sm font-display font-black text-slate-800">
                    {chartView === 'paket'
                      ? effectivePaket === 'all'
                        ? `Grafik Perkembangan Nilai per Paket Tes${
                            effectiveSubject !== 'all' ? ` — ${effectiveSubject}` : ''
                          }`
                        : `Rincian Nilai Mata Pelajaran — ${effectivePaket}`
                      : `Rata-Rata Nilai per Mata Pelajaran${
                          effectivePaket !== 'all' ? ` (${effectivePaket})` : ' (CBT vs TKA)'
                        }`}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {chartView === 'paket'
                      ? effectivePaket === 'all'
                        ? 'Setiap paket tes menampilkan capaian masing-masing mata pelajaran beserta garis tren rata-rata paket. Klik batang/paket untuk melihat rincian.'
                        : 'Perbandingan nilai tiap mata pelajaran di dalam paket tes terpilih terhadap ambang KKTP.'
                      : 'Perbandingan rata-rata nilai antar mata pelajaran pada seluruh paket yang diikuti.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  {effectivePaket !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedPaket('all')}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Semua Paket Tes</span>
                    </button>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 border-t-2 border-dashed border-emerald-600 inline-block" />
                    KKTP ({KKTP_THRESHOLD})
                  </span>
                </div>
              </div>

              <div className="w-full h-[310px]">
                <ResponsiveContainer width="100%" height="100%">
                  {chartView === 'paket' && effectivePaket !== 'all' ? (
                    <BarChart
                      data={singlePaketBreakdownData}
                      margin={{ top: 14, right: 16, left: -16, bottom: 6 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="mapel"
                        tick={{ fontSize: 11, fontWeight: 700, fill: '#334155' }}
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
                        cursor={{ fill: '#f8fafc' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const row = payload[0].payload as (typeof singlePaketBreakdownData)[number];
                          return (
                            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md text-xs space-y-1 max-w-[240px]">
                              <div className="text-[11px] font-semibold text-slate-500">
                                {row.category} · {row.paketName}
                              </div>
                              <div className="font-bold text-slate-900">{row.fullMapel}</div>
                              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                                <span className="text-slate-500">Nilai Mapel</span>
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
                      <Bar dataKey="nilai" name="Nilai Mata Pelajaran" radius={[6, 6, 0, 0]} maxBarSize={48}>
                        {singlePaketBreakdownData.map((item) => (
                          <Cell key={item.key} fill={item.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : chartView === 'paket' ? (
                    <ComposedChart
                      data={paketChartData}
                      margin={{ top: 14, right: 16, left: -16, bottom: 6 }}
                      onClick={(state: any) => {
                        const activeLabel = state?.activeLabel;
                        if (!activeLabel) return;
                        const matched = paketChartData.find((p) => p.shortPaket === activeLabel);
                        if (matched) setSelectedPaket(matched.paketName);
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="shortPaket"
                        tick={{ fontSize: 11, fontWeight: 700, fill: '#334155' }}
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
                        cursor={{ fill: '#f8fafc' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const row = payload[0].payload as PaketChartRow;
                          return (
                            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-lg text-xs space-y-2 min-w-[220px] max-w-[290px]">
                              <div className="border-b border-slate-100 pb-1.5">
                                <div className="text-[11px] font-semibold text-slate-500">
                                  {row.category} · {row.mapelCount} Mata Pelajaran
                                </div>
                                <div className="font-bold text-slate-900 leading-snug">
                                  {row.paketName}
                                </div>
                              </div>

                              <div className="space-y-1">
                                {row.subjects.map((sub) => {
                                  const mapelMeta = activeChartMapels.find(
                                    (m) => m.fullMapel === sub.mapel
                                  );
                                  return (
                                    <div
                                      key={`${row.paketKey}_${sub.mapel}`}
                                      className="flex items-center justify-between gap-3"
                                    >
                                      <span className="inline-flex items-center gap-1.5 text-slate-700 truncate">
                                        <span
                                          className="w-2 h-2 rounded-xs shrink-0"
                                          style={{ backgroundColor: mapelMeta?.color || '#64748b' }}
                                        />
                                        <span className="truncate">{sub.shortMapel}</span>
                                      </span>
                                      <span
                                        className={`font-mono font-bold tabular-nums ${
                                          sub.nilai >= KKTP_THRESHOLD
                                            ? 'text-slate-900'
                                            : 'text-amber-700'
                                        }`}
                                      >
                                        {sub.nilai}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                                <span className="font-semibold text-slate-600">Rata-Rata Paket</span>
                                <span className="font-mono font-black text-sm text-slate-900 tabular-nums">
                                  {row.rataRata}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                                <span>Ketuntasan Mapel</span>
                                <span className="font-bold text-emerald-700 tabular-nums">
                                  {row.tuntasCount}/{row.mapelCount} Tuntas
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                      {activeChartMapels.map((mapelItem) => (
                        <Bar
                          key={mapelItem.dataKey}
                          dataKey={mapelItem.dataKey}
                          name={mapelItem.shortMapel}
                          fill={mapelItem.color}
                          radius={[5, 5, 0, 0]}
                          maxBarSize={24}
                        />
                      ))}
                      <Line
                        type="monotone"
                        dataKey="rataRata"
                        name="Rata-rata Paket"
                        stroke="#0f172a"
                        strokeWidth={2.5}
                        dot={{ r: 4.5, fill: '#0f172a', stroke: '#ffffff', strokeWidth: 2 }}
                        activeDot={{ r: 6.5, strokeWidth: 2, stroke: '#ffffff' }}
                      />
                    </ComposedChart>
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
                          const row = payload[0].payload as (typeof subjectChartData)[number];
                          return (
                            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md text-xs space-y-1.5 min-w-[200px]">
                              <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">
                                {row.fullMapel}
                              </div>
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
                              {row.paketDetails.length > 0 && (
                                <div className="pt-1 border-t border-slate-100 space-y-0.5 text-[11px]">
                                  <div className="font-semibold text-slate-500">Per Paket Tes:</div>
                                  {row.paketDetails.map((d, idx) => (
                                    <div key={`${d.paketName}_${idx}`} className="flex justify-between gap-3">
                                      <span className="text-slate-600">{d.paketName}</span>
                                      <span className="font-mono font-bold text-slate-900 tabular-nums">{d.nilai}</span>
                                    </div>
                                  ))}
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

            {/* Ringkasan Capaian Per Paket Tes (beserta Mapel di dalamnya) */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-display font-black text-slate-800">
                  Ringkasan Nilai Per Paket Tes ({paketChartData.length} Paket)
                </h3>
                <span className="text-[11px] text-slate-500">
                  Klik baris paket tes untuk memfilter grafik mata pelajaran di dalamnya
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-white border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2.5 px-4 font-bold">Paket Tes</th>
                      <th className="py-2.5 px-4 font-bold">Kategori</th>
                      <th className="py-2.5 px-4 font-bold">Mata Pelajaran di Dalam Paket</th>
                      <th className="py-2.5 px-4 font-bold text-right">Rata-Rata</th>
                      <th className="py-2.5 px-4 font-bold text-right">Ketuntasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paketChartData.map((pkt) => {
                      const isActive = effectivePaket === pkt.paketName;
                      return (
                        <tr
                          key={pkt.paketKey}
                          onClick={() => {
                            setSelectedPaket(isActive ? 'all' : pkt.paketName);
                            setChartView('paket');
                          }}
                          className={`cursor-pointer transition-colors ${
                            isActive ? 'bg-rose-50/70' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                            {pkt.paketName}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-slate-600 whitespace-nowrap">
                            {pkt.category}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                              {pkt.subjects.map((sub, sIdx) => (
                                <span
                                  key={`${pkt.paketKey}_${sub.mapel}`}
                                  className="inline-flex items-center gap-1 text-slate-700"
                                >
                                  {sIdx > 0 && (
                                    <span className="text-slate-300 mr-1" aria-hidden="true">
                                      ·
                                    </span>
                                  )}
                                  <span>{sub.shortMapel}:</span>
                                  <strong
                                    className={`font-mono tabular-nums ${
                                      sub.nilai >= KKTP_THRESHOLD
                                        ? 'text-slate-900'
                                        : 'text-amber-700'
                                    }`}
                                  >
                                    {sub.nilai}
                                  </strong>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900 tabular-nums whitespace-nowrap">
                            {pkt.rataRata}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                            {pkt.tuntasCount}/{pkt.mapelCount}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Compact Rekap Riwayat Nilai */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-display font-black text-slate-800">
                  Riwayat Nilai Ujian ({filteredEntries.length})
                </h3>
                <span className="text-[11px] text-slate-500">Diurutkan sesuai urutan paket tes</span>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-white border-b border-slate-200 text-slate-500 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4 font-bold">No</th>
                      <th className="py-2.5 px-4 font-bold">Jenis</th>
                      <th className="py-2.5 px-4 font-bold">Paket Tes</th>
                      <th className="py-2.5 px-4 font-bold">Mata Pelajaran &amp; Judul</th>
                      <th className="py-2.5 px-4 font-bold">Waktu</th>
                      <th className="py-2.5 px-4 font-bold text-right">Nilai</th>
                      <th className="py-2.5 px-4 font-bold">Keterangan</th>
                      <th className="py-2.5 px-4 font-bold text-right">Ulasan SARAH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredEntries.map((row) => (
                      <tr key={row.key} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-4 font-mono text-slate-500 tabular-nums">
                          {row.urutan}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-700">{row.category}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          {row.paketName}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900">{row.mapel}</div>
                          <div className="text-[11px] text-slate-500">{row.judul}</div>
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
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              window.dispatchEvent(
                                new CustomEvent('serbu21-open-tanya-sarah', {
                                  detail: {
                                    examId: row.examId,
                                    paketName: row.paketName,
                                    mapel: row.mapel,
                                    category: row.category.toLowerCase() as 'cbt' | 'tka',
                                    autoRequestFeedback: true,
                                  },
                                })
                              );
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] cursor-pointer transition"
                            title="Tanya SARAH soal yang masih salah pada ujian ini"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Tanya Soal Salah</span>
                          </button>
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

      {/* ================================================================= */}
      {/* PRINTABLE A4 REPORT FOR PARENTS (Unduh PDF / Cetak Laporan)       */}
      {/* ================================================================= */}
      <div className="hidden print-only a4-rapor-sheet text-slate-900">
        {/* Kop Surat Resmi Sekolah */}
        <div className="flex items-center justify-between border-b-4 border-double border-slate-900 pb-3 mb-4">
          {profile?.logoKemendikbudUrl ? (
            <img
              src={profile.logoKemendikbudUrl}
              alt="Logo Dinas"
              className="w-16 h-16 object-contain"
            />
          ) : (
            <div className="w-16 h-16" />
          )}
          <div className="text-center flex-1 px-4">
            <div className="text-[11px] font-bold uppercase tracking-wide">
              Pemerintah Provinsi DKI Jakarta · Suku Dinas Pendidikan Jakarta Utara
            </div>
            <div className="font-display font-black text-lg uppercase">
              {profile?.name || 'SDN Rawa Badak Utara 21'}
            </div>
            <div className="text-xs">
              {profile?.alamat || 'Jl. Rawa Badak Utara'} · {profile?.kota || 'Jakarta Utara'}
              {profile?.npsn ? ` · NPSN: ${profile.npsn}` : ''}
            </div>
          </div>
          {profile?.logoSekolahUrl ? (
            <img
              src={profile.logoSekolahUrl}
              alt="Logo Sekolah"
              className="w-16 h-16 object-contain"
            />
          ) : (
            <div className="w-16 h-16" />
          )}
        </div>

        {/* Judul Laporan */}
        <div className="text-center mb-4">
          <h2 className="font-display font-black text-base uppercase underline">
            LAPORAN REKAPITULASI STATISTIK PERFORMA UJIAN SISWA
          </h2>
          <p className="text-xs mt-1">
            Salinan Progres Belajar untuk Orang Tua / Wali Murid · Kategori:{' '}
            <strong>{categoryLabel}</strong> · Paket: <strong>{paketLabel}</strong> · Mapel:{' '}
            <strong>{subjectLabel}</strong>
          </p>
        </div>

        {/* Identitas Siswa */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs border border-slate-800 rounded p-3 mb-4 bg-slate-50">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Nama Siswa</span>
            <span className="font-bold text-right">{student?.nama || '-'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Tahun Pelajaran</span>
            <span className="font-bold text-right">
              {activeYear} ({activeSemester})
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">NISN</span>
            <span className="font-mono font-bold text-right">{student?.nisn || '-'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Kelas</span>
            <span className="font-bold text-right">{student?.kelas || '-'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Batas Ketuntasan (KKTP)</span>
            <span className="font-bold text-right tabular-nums">{KKTP_THRESHOLD}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Tanggal Laporan</span>
            <span className="font-bold text-right">{tanggalCetakIndo}</span>
          </div>
        </div>

        {/* Ringkasan Statistik */}
        <div className="grid grid-cols-4 border border-slate-800 divide-x divide-slate-800 mb-4 text-center">
          <div className="p-2.5">
            <div className="text-[10px] uppercase font-bold text-slate-600">Rata-Rata Nilai</div>
            <div className="text-lg font-black tabular-nums mt-0.5">{metrics.avg}</div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] uppercase font-bold text-slate-600">Nilai Tertinggi</div>
            <div className="text-lg font-black tabular-nums mt-0.5">{metrics.highest}</div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] uppercase font-bold text-slate-600">Paket &amp; Mapel</div>
            <div className="text-lg font-black tabular-nums mt-0.5">
              {metrics.paketCount} Paket{' '}
              <span className="text-[10px] font-semibold">({metrics.total} Mapel)</span>
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] uppercase font-bold text-slate-600">Ketuntasan</div>
            <div className="text-lg font-black tabular-nums mt-0.5">
              {metrics.passRate}%{' '}
              <span className="text-[10px] font-semibold">
                ({metrics.passedCount}/{metrics.total})
              </span>
            </div>
          </div>
        </div>

        {/* Ringkasan Per Paket Tes */}
        {paketChartData.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-bold uppercase mb-1.5">
              A. Ringkasan Capaian Per Paket Tes
            </div>
            <table className="w-full border-collapse border border-slate-800 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-800 py-1.5 px-2 w-10 text-center">No</th>
                  <th className="border border-slate-800 py-1.5 px-3 text-left">Paket Tes</th>
                  <th className="border border-slate-800 py-1.5 px-2 w-16 text-center">Jenis</th>
                  <th className="border border-slate-800 py-1.5 px-3 text-left">Nilai Mata Pelajaran</th>
                  <th className="border border-slate-800 py-1.5 px-2 w-20 text-center">Rata-Rata</th>
                </tr>
              </thead>
              <tbody>
                {paketChartData.map((pkt, idx) => (
                  <tr key={`print_pkt_${pkt.paketKey}`}>
                    <td className="border border-slate-800 py-1 px-2 text-center tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-800 py-1 px-3 font-semibold">{pkt.paketName}</td>
                    <td className="border border-slate-800 py-1 px-2 text-center font-bold">{pkt.category}</td>
                    <td className="border border-slate-800 py-1 px-3">
                      {pkt.subjects.map((s) => `${s.shortMapel}: ${s.nilai}`).join(' · ')}
                    </td>
                    <td className="border border-slate-800 py-1 px-2 text-center font-mono font-bold tabular-nums">
                      {pkt.rataRata}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Ringkasan Rata-Rata per Mata Pelajaran */}
        {subjectChartData.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-bold uppercase mb-1.5">
              B. Ringkasan Rata-Rata Nilai per Mata Pelajaran
            </div>
            <table className="w-full border-collapse border border-slate-800 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-800 py-1.5 px-2 w-10 text-center">No</th>
                  <th className="border border-slate-800 py-1.5 px-3 text-left">Mata Pelajaran</th>
                  <th className="border border-slate-800 py-1.5 px-3 text-center w-28">
                    Rata-Rata CBT
                  </th>
                  <th className="border border-slate-800 py-1.5 px-3 text-center w-28">
                    Rata-Rata TKA
                  </th>
                </tr>
              </thead>
              <tbody>
                {subjectChartData.map((s, idx) => (
                  <tr key={s.fullMapel}>
                    <td className="border border-slate-800 py-1 px-2 text-center tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-800 py-1 px-3 font-semibold">{s.fullMapel}</td>
                    <td className="border border-slate-800 py-1 px-3 text-center font-mono tabular-nums">
                      {typeof s.CBT === 'number' ? s.CBT : '-'}
                    </td>
                    <td className="border border-slate-800 py-1 px-3 text-center font-mono tabular-nums">
                      {typeof s.TKA === 'number' ? s.TKA : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabel Riwayat Nilai Ujian */}
        <div className="mb-6">
          <div className="text-xs font-bold uppercase mb-1.5">
            C. Rincian Riwayat Nilai Ujian ({filteredEntries.length} Sesi)
          </div>
          <table className="w-full border-collapse border border-slate-800 text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-800 py-1.5 px-2 w-10 text-center">No</th>
                <th className="border border-slate-800 py-1.5 px-2 w-14 text-center">Jenis</th>
                <th className="border border-slate-800 py-1.5 px-2 text-left">Paket Tes</th>
                <th className="border border-slate-800 py-1.5 px-3 text-left">Mata Pelajaran</th>
                <th className="border border-slate-800 py-1.5 px-3 text-left">Judul Ujian</th>
                <th className="border border-slate-800 py-1.5 px-2 text-center">Waktu</th>
                <th className="border border-slate-800 py-1.5 px-2 w-14 text-center">Nilai</th>
                <th className="border border-slate-800 py-1.5 px-2 w-24 text-center">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((row) => (
                <tr key={`print_${row.key}`}>
                  <td className="border border-slate-800 py-1 px-2 text-center tabular-nums">
                    {row.urutan}
                  </td>
                  <td className="border border-slate-800 py-1 px-2 text-center font-bold">
                    {row.category}
                  </td>
                  <td className="border border-slate-800 py-1 px-2 font-semibold">{row.paketName}</td>
                  <td className="border border-slate-800 py-1 px-3">{row.mapel}</td>
                  <td className="border border-slate-800 py-1 px-3 font-semibold">{row.judul}</td>
                  <td className="border border-slate-800 py-1 px-2 text-center whitespace-nowrap">
                    {row.waktu}
                  </td>
                  <td className="border border-slate-800 py-1 px-2 text-center font-mono font-bold tabular-nums">
                    {row.nilai}
                  </td>
                  <td className="border border-slate-800 py-1 px-2 text-center font-semibold">
                    {row.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tanda Tangan Orang Tua & Kepala Sekolah */}
        <div className="grid grid-cols-2 gap-8 text-xs mt-8">
          <div className="text-center">
            <div>Mengetahui,</div>
            <div className="font-bold">Orang Tua / Wali Murid</div>
            <div className="h-16" />
            <div className="font-bold sig-name-line min-w-[160px]">&nbsp;</div>
            <div className="text-[11px] text-slate-600">Tanda Tangan &amp; Nama Jelas</div>
          </div>
          <div className="text-center">
            <div>Jakarta, {tanggalCetakIndo}</div>
            <div className="font-bold">Kepala {profile?.name || 'SDN Rawa Badak Utara 21'}</div>
            <div className="h-16" />
            <div className="font-bold sig-name-line">
              {profile?.kepalaSekolah?.nama || 'Kepala Sekolah'}
            </div>
            <div>NIP. {profile?.kepalaSekolah?.nip || '-'}</div>
          </div>
        </div>
      </div>
    </>
  );
};
