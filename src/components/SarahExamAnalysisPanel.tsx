import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Users,
  UserCheck,
  Loader2,
  Copy,
  Download,
  AlertCircle,
  BarChart3,
  RefreshCw,
  Database,
  Zap,
  StopCircle,
  CheckCircle2,
} from 'lucide-react';
import { ActiveUser, SchoolProfile } from '../types';
import {
  SarahAnalysisPhase,
  SarahTextGeneratedResponse,
  cancelSarahAnalysisQueueGroup,
  enqueueSarahAnalysisRequest,
  exportSarahToWordDoc,
  sanitizeSarahErrorMessage,
} from '../utils/sarahFirestore';
import { extractSarahResponseMetadata } from '../utils/sarahVisuals';
import {
  SARAH_STANDARD_AVATAR_URL,
  pickRealisticEndiStickerForAnalysis,
  resolveSarahUserMode,
} from '../utils/sarahStickers';
import { SarahMarkdown } from './SarahMarkdown';

export interface SarahAnalysisHardestQuestion {
  no: number;
  pertanyaan: string;
  tp?: string;
  pctCorrect: number;
  wrongCount: number;
  totalParticipants: number;
}

export interface SarahAnalysisStudentRow {
  id: string;
  nama: string;
  nisn?: string;
  kelas: string;
  score: number;
  status: string;
  wrongNumbers?: number[];
  correctNumbers?: number[];
  mapelBreakdown?: Record<string, number>;
}

interface Props {
  activeUser: ActiveUser;
  profile?: SchoolProfile;
  examCategory: 'CBT' | 'TKA';
  paketLabel: string;
  mapelLabel: string;
  kelasLabel: string;
  kktp?: number;
  hardestQuestions: SarahAnalysisHardestQuestion[];
  studentPerformanceList: SarahAnalysisStudentRow[];
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export const SarahExamAnalysisPanel: React.FC<Props> = ({
  activeUser,
  profile,
  examCategory,
  paketLabel,
  mapelLabel,
  kelasLabel,
  kktp = 75,
  hardestQuestions,
  studentPerformanceList,
  showToast,
}) => {
  const userMode = useMemo(() => resolveSarahUserMode(activeUser), [activeUser]);
  const isExclusiveEndi = userMode === 'exclusive_endi';

  const [analysisScope, setAnalysisScope] = useState<'kelas' | 'individu'>('kelas');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<SarahAnalysisPhase>('idle');
  const [analysisStatusText, setAnalysisStatusText] = useState('');
  const [resultFromCache, setResultFromCache] = useState(false);
  const [resultCacheHash, setResultCacheHash] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');
  const [analysisModel, setAnalysisModel] = useState('gemini-3.8-flash');
  const [analysisError, setAnalysisError] = useState('');
  const [avatarError, setAvatarError] = useState(false);
  const analysisAbortRef = useRef<AbortController | null>(null);

  const analysisQueueGroupKey = useMemo(
    () => `teacher_exam_analysis_${examCategory}_${paketLabel}_${mapelLabel}`,
    [examCategory, paketLabel, mapelLabel]
  );

  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort();
      cancelSarahAnalysisQueueGroup(analysisQueueGroupKey);
    };
  }, [analysisQueueGroupKey]);

  const completedStudents = useMemo(
    () =>
      studentPerformanceList.filter(
        (s) => Number.isFinite(s.score) && String(s.nama || '').trim().length > 0
      ),
    [studentPerformanceList]
  );

  useEffect(() => {
    if (completedStudents.length === 0) {
      setSelectedStudentId('');
      return;
    }
    if (!completedStudents.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(completedStudents[0].id);
    }
  }, [completedStudents, selectedStudentId]);

  const statsSummary = useMemo(() => {
    if (completedStudents.length === 0) {
      return {
        total: 0,
        avg: 0,
        max: 0,
        min: 0,
        tuntasCount: 0,
        remedialCount: 0,
        tuntasPct: 0,
      };
    }
    const scores = completedStudents.map((s) => Number(s.score) || 0);
    const total = scores.length;
    const sum = scores.reduce((acc, v) => acc + v, 0);
    const avg = Math.round(sum / total);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const tuntasCount = scores.filter((sc) => sc >= kktp).length;
    const remedialCount = total - tuntasCount;
    const tuntasPct = Math.round((tuntasCount / total) * 100);
    return { total, avg, max, min, tuntasCount, remedialCount, tuntasPct };
  }, [completedStudents, kktp]);

  const headerAvatarSrc = useMemo(() => {
    if (!isExclusiveEndi) return SARAH_STANDARD_AVATAR_URL;
    return pickRealisticEndiStickerForAnalysis(statsSummary.avg >= kktp).path;
  }, [isExclusiveEndi, statsSummary.avg, kktp]);

  const topHardest3 = useMemo(() => {
    return [...hardestQuestions]
      .filter((q) => q.totalParticipants > 0)
      .sort((a, b) => a.pctCorrect - b.pctCorrect)
      .slice(0, 5);
  }, [hardestQuestions]);

  const handleCancelAnalysis = () => {
    if (!isAnalyzing) return;
    analysisAbortRef.current?.abort();
    cancelSarahAnalysisQueueGroup(analysisQueueGroupKey);
    setIsAnalyzing(false);
    setAnalysisPhase('cancelled');
    setAnalysisStatusText('Permintaan analisis SARAH dibatalkan.');
    showToast?.('Analisis SARAH dibatalkan.', 'success');
  };

  const handleRunAnalysis = async () => {
    if (completedStudents.length === 0) {
      showToast?.(
        'Belum ada siswa yang berstatus selesai mengerjakan pada paket ujian ini.',
        'error'
      );
      return;
    }
    if (analysisScope === 'individu' && !selectedStudentId) {
      showToast?.('Silakan pilih siswa yang ingin dianalisis terlebih dahulu.', 'error');
      return;
    }

    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;

    setIsAnalyzing(true);
    setAnalysisError('');
    setResultFromCache(false);
    setAnalysisPhase('cache_check');
    setAnalysisStatusText('Memeriksa Result Cache (id_ujian, nisn)...');

    try {
      const summaryStatsText = [
        `Jumlah Siswa Selesai Mengerjakan: ${statsSummary.total}`,
        `Rata-rata Kelas: ${statsSummary.avg}`,
        `Nilai Tertinggi: ${statsSummary.max} | Terendah: ${statsSummary.min}`,
        `Tuntas (>= KKTP ${kktp}): ${statsSummary.tuntasCount} siswa (${statsSummary.tuntasPct}%)`,
        `Perlu Remedial (< KKTP ${kktp}): ${statsSummary.remedialCount} siswa`,
      ].join('\n');

      const hardestText =
        topHardest3.length > 0
          ? topHardest3
              .map(
                (q) =>
                  `- Soal No. ${q.no} | Salah: ${q.wrongCount}/${q.totalParticipants} siswa (Ketuntasan ${q.pctCorrect}%)${
                    q.tp ? ` | TP/Materi: ${q.tp}` : ''
                  } | Cuplikan: ${q.pertanyaan.slice(0, 140)}`
              )
              .join('\n')
          : 'Belum tersedia rincian per butir soal pada tampilan filter ini.';

      const remedialStudents = completedStudents
        .filter((s) => s.score < kktp)
        .sort((a, b) => a.score - b.score);
      const pengayaanStudents = completedStudents
        .filter((s) => s.score >= kktp)
        .sort((a, b) => b.score - a.score);

      const studentPerfText = [
        `KELOMPOK REMEDIAL (${remedialStudents.length} siswa):`,
        ...remedialStudents.slice(0, 25).map((s) => {
          const wrongStr =
            s.wrongNumbers && s.wrongNumbers.length > 0
              ? ` | Salah no: ${s.wrongNumbers.join(', ')}`
              : '';
          return `  * ${s.nama} (${s.kelas}) — Nilai: ${s.score}${wrongStr}`;
        }),
        `KELOMPOK PENGAYAAN (${pengayaanStudents.length} siswa):`,
        ...pengayaanStudents
          .slice(0, 25)
          .map((s) => `  * ${s.nama} (${s.kelas}) — Nilai: ${s.score}`),
      ].join('\n');

      const pickedStudent =
        analysisScope === 'individu'
          ? completedStudents.find((s) => s.id === selectedStudentId)
          : undefined;

      let targetStudentSummary = '';
      if (pickedStudent) {
        const mapelLines = pickedStudent.mapelBreakdown
          ? Object.entries(pickedStudent.mapelBreakdown)
              .map(([m, v]) => `${m}: ${v}`)
              .join(', ')
          : '';
        targetStudentSummary = [
          `Nama Siswa: ${pickedStudent.nama} (NISN: ${pickedStudent.nisn || '-'})`,
          `Kelas: ${pickedStudent.kelas}`,
          `Skor Akhir: ${pickedStudent.score} (${pickedStudent.score >= kktp ? 'Tuntas' : 'Belum Tuntas / Remedial'})`,
          pickedStudent.correctNumbers && pickedStudent.correctNumbers.length > 0
            ? `Nomor Soal Benar: ${pickedStudent.correctNumbers.join(', ')}`
            : '',
          pickedStudent.wrongNumbers && pickedStudent.wrongNumbers.length > 0
            ? `Nomor Soal Masih Salah: ${pickedStudent.wrongNumbers.join(', ')}`
            : 'Nomor Soal Masih Salah: Tidak ada / semua benar',
          mapelLines ? `Rincian Nilai Mapel: ${mapelLines}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }

      const isRerun = Boolean(analysisResult);
      const idUjianKey = `${examCategory}_${paketLabel}_${mapelLabel}_${kelasLabel}`;
      const nisnKey =
        analysisScope === 'individu'
          ? pickedStudent?.nisn || pickedStudent?.id || selectedStudentId
          : `KELAS_${statsSummary.total}_${statsSummary.avg}`;

      const res = await enqueueSarahAnalysisRequest<SarahTextGeneratedResponse>({
        queueGroupKey: analysisQueueGroupKey,
        idUjian: idUjianKey,
        nisn: nisnKey,
        cacheScope: `exam_dev_${analysisScope}_${isExclusiveEndi ? 'endi' : 'guru'}`,
        bypassCache: isRerun,
        timeoutMs: 28000,
        externalController: controller,
        onPhaseChange: (phase, statusText) => {
          setAnalysisPhase(phase);
          setAnalysisStatusText(statusText);
        },
        payload: {
          mode: 'exam_development_analysis',
          role: activeUser.role,
          user: {
            name: activeUser.name,
            username: activeUser.username,
            role: activeUser.role,
          },
          params: {
            examCategory,
            analysisScope,
            paketLabel,
            mapelLabel,
            kelasLabel,
            summaryStats: summaryStatsText,
            hardestQuestions: hardestText,
            studentPerformanceList: studentPerfText,
            targetStudentSummary,
            bypassCache: isRerun,
          },
        },
      });

      const cleanedReply = isExclusiveEndi
        ? res.text
        : res.text
            .replace(/\[REAL_STIKER\s*:\s*[a-zA-Z0-9_]+\s*\]/gi, '')
            .replace(/\[STIKER_3D\s*:\s*[a-zA-Z0-9_]+\s*\]/gi, '')
            .replace(/\[STIKER\s*:\s*[a-zA-Z0-9_]+\s*\]/gi, '')
            .trim();

      setAnalysisResult(cleanedReply);
      setAnalysisModel(res.model || 'gemini-3.8-flash');
      setResultFromCache(Boolean(res.fromCache));
      setResultCacheHash(res.resultCacheHash || '');
      setAnalysisPhase(res.fromCache ? 'cached_hit' : 'done');
      showToast?.(
        res.fromCache
          ? 'Hasil analisis SARAH dimuat instan dari Result Cache!'
          : 'Analisis perkembangan ujian oleh SARAH AI selesai dibuat!',
        'success'
      );
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        setAnalysisPhase('cancelled');
        setAnalysisStatusText('Permintaan analisis SARAH dibatalkan.');
        return;
      }
      const msg = sanitizeSarahErrorMessage(err);
      setAnalysisPhase('error');
      setAnalysisStatusText(msg);
      setAnalysisError(msg);
      showToast?.(msg, 'error');
    } finally {
      if (analysisAbortRef.current === controller) {
        analysisAbortRef.current = null;
        setIsAnalyzing(false);
      }
    }
  };

  const handleCopy = async () => {
    if (!analysisResult) return;
    try {
      const cleaned = extractSarahResponseMetadata(analysisResult)
        .cleanText.replace(/\[STIKER\s*:\s*[a-zA-Z0-9_]+\s*\]/gi, '')
        .replace(/\[REAL_STIKER\s*:\s*[a-zA-Z0-9_]+\s*\]/gi, '')
        .replace(/\[STIKER_3D\s*:\s*[a-zA-Z0-9_]+\s*\]/gi, '')
        .trim();
      await navigator.clipboard.writeText(cleaned);
      showToast?.('Hasil analisis SARAH berhasil disalin!', 'success');
    } catch {
      showToast?.('Gagal menyalin hasil analisis.', 'error');
    }
  };

  const handleExportWord = () => {
    if (!analysisResult) return;
    exportSarahToWordDoc({
      title: `Analisis Perkembangan Ujian ${examCategory} - ${paketLabel}`,
      subtitle: `${mapelLabel} · ${kelasLabel} · ${profile?.name || 'SDN Rawa Badak Utara 21'}`,
      schoolName: profile?.name || 'SDN Rawa Badak Utara 21',
      author: activeUser.name,
      markdownContent: analysisResult,
    });
    showToast?.('Dokumen Word (.doc) analisis SARAH diunduh!', 'success');
  };

  return (
    <div className="no-print bg-white rounded-3xl border-2 border-rose-200/80 shadow-sm overflow-hidden">
      {/* Header Panel */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-rose-50 via-pink-50/70 to-indigo-50 border-b border-rose-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white shadow-sm bg-rose-100 shrink-0 flex items-center justify-center">
            {!avatarError ? (
              <img
                src={headerAvatarSrc}
                alt="SARAH AI"
                onError={() => setAvatarError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <Sparkles className="w-6 h-6 text-rose-600" />
            )}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider">
                <Sparkles className="w-3 h-3" /> SARAH AI Evaluasi
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white border border-rose-200 text-[10px] font-extrabold text-rose-800">
                {examCategory} · {paketLabel}
              </span>
            </div>
            <h3 className="font-display font-black text-base sm:text-lg text-slate-900">
              Analisis Perkembangan Ujian (SARAH AI)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Menganalisis data siswa yang <strong>sudah selesai mengerjakan</strong> ({statsSummary.total} siswa · Rata-rata {statsSummary.avg} · Tuntas {statsSummary.tuntasPct}%) untuk pemetaan Remedial, Pengayaan, &amp; butir soal tersulit.
            </p>
          </div>
        </div>

        {/* Mode & Action Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex rounded-xl bg-white p-1 border border-rose-200">
            <button
              type="button"
              onClick={() => setAnalysisScope('kelas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                analysisScope === 'kelas'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-rose-50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Analisis Satu Kelas Penuh</span>
            </button>
            <button
              type="button"
              onClick={() => setAnalysisScope('individu')}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                analysisScope === 'individu'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-indigo-50'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Analisis Per Individu Siswa</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isAnalyzing || completedStudents.length === 0}
            onClick={() => void handleRunAnalysis()}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 disabled:opacity-50 text-white font-display font-black text-xs flex items-center gap-2 shadow-sm transition cursor-pointer whitespace-nowrap"
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : analysisResult ? (
              <RefreshCw className="w-4 h-4" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )}
            <span>
              {isAnalyzing
                ? 'SARAH Menganalisis...'
                : analysisResult
                ? 'Analisis Ulang'
                : 'Jalankan Analisis SARAH'}
            </span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 sm:p-6 space-y-4">
        {/* Dual-Stage Pipeline Indicator: Firestore Data (Instan) vs SARAH AI (Async Queue + Cache) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="px-3.5 py-2.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Database className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wide text-emerald-900">
                1. Data Firestore (Instan)
              </p>
              <p className="text-[11px] font-semibold text-emerald-800 truncate">
                {completedStudents.length > 0
                  ? `✓ ${statsSummary.total} rekaman nilai selesai siap diolah`
                  : 'Menunggu siswa menyelesaikan ujian'}
              </p>
            </div>
          </div>

          <div
            className={`px-3.5 py-2.5 rounded-2xl border flex items-center justify-between gap-2 ${
              isAnalyzing
                ? 'bg-indigo-50 border-indigo-200'
                : analysisPhase === 'cached_hit'
                ? 'bg-amber-50/80 border-amber-200'
                : analysisPhase === 'done'
                ? 'bg-emerald-50/60 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                  isAnalyzing
                    ? 'bg-indigo-600 text-white'
                    : analysisPhase === 'cached_hit'
                    ? 'bg-amber-500 text-white'
                    : analysisPhase === 'done'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-600 text-white'
                }`}
              >
                {isAnalyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : analysisPhase === 'cached_hit' ? (
                  <Zap className="w-3.5 h-3.5" />
                ) : analysisPhase === 'done' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-800">
                  2. Analisis SARAH AI (Async Queue)
                </p>
                <p className="text-[11px] font-semibold text-slate-700 truncate">
                  {isAnalyzing
                    ? analysisStatusText || 'Memproses antrean AbortController...'
                    : analysisPhase === 'cached_hit'
                    ? '⚡ Dimuat instan dari Result Cache (hash id_ujian, nisn)'
                    : analysisPhase === 'done'
                    ? `✓ Analisis selesai (${analysisModel || 'gemini-3.8-flash'})`
                    : analysisPhase === 'cancelled'
                    ? 'Dibatalkan oleh pengguna'
                    : 'Siap dijalankan melalui antrean async'}
                </p>
              </div>
            </div>
            {isAnalyzing && (
              <button
                type="button"
                onClick={handleCancelAnalysis}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer shrink-0 transition"
                title="Batalkan antrean analisis SARAH"
              >
                <StopCircle className="w-3 h-3" />
                <span>Batalkan</span>
              </button>
            )}
          </div>
        </div>

        {completedStudents.length === 0 ? (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Belum ada siswa yang selesai mengerjakan ujian pada filter {paketLabel} ({mapelLabel}).
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                SARAH hanya memproses hasil ujian yang berstatus selesai dikerjakan agar analisis akurat.
              </p>
            </div>
          </div>
        ) : (
          analysisScope === 'individu' && (
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-xs font-display font-black text-indigo-950 whitespace-nowrap">
                Pilih Siswa Selesai Mengerjakan:
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs font-bold text-slate-800 outline-none"
              >
                {completedStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama} ({s.kelas}) — Skor: {s.score} ({s.score >= kktp ? 'Tuntas' : 'Remedial'})
                  </option>
                ))}
              </select>
            </div>
          )
        )}

        {analysisError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
            {analysisError}
          </div>
        )}

        {analysisResult ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-display font-black text-slate-700">
                  Hasil Analisis SARAH AI ({analysisScope === 'kelas' ? 'Satu Kelas Penuh' : 'Per Individu Siswa'})
                </span>
                {resultFromCache && (
                  <span
                    title={resultCacheHash ? `Hash Cache: ${resultCacheHash}` : undefined}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-black"
                  >
                    <Zap className="w-3 h-3 text-amber-600" />
                    Result Cache (id_ujian, nisn)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportWord}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Word</span>
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 border border-slate-200 max-h-[600px] overflow-y-auto">
              <SarahMarkdown content={analysisResult} userMode={userMode} />
            </div>
          </div>
        ) : (
          completedStudents.length > 0 &&
          !isAnalyzing && (
            <p className="text-xs text-slate-500 italic">
              Klik tombol <strong>"Jalankan Analisis SARAH"</strong> di atas untuk mendapatkan ringkasan ketuntasan KKTP, 3 butir soal tersulit, pemetaan Remedial &amp; Pengayaan, serta rekomendasi strategi mengajar.
            </p>
          )
        )}
      </div>
    </div>
  );
};
