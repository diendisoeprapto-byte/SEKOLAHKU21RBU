import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Download,
  FileSpreadsheet,
  Grid,
  Users,
} from 'lucide-react';
import { CBTQuestion, SchoolProfile, Student, Teacher, TKAQuestion } from '../types';
import {
  MatrixSubmissionInput,
  buildDynamicItemMatrix,
  exportDynamicMatrixToExcel,
  formatMatrixScoreCell,
} from '../utils/analisisMatrixBuilder';
import { exportDynamicMatrixToPdf } from '../utils/analisisReportExport';
import { formatNipLabel, resolveKepalaSekolah, resolveWaliKelas } from '../utils/teacherSync';

interface AnalisisButirMatrixPanelProps {
  examType: 'CBT' | 'TKA';
  questions: Array<CBTQuestion | TKAQuestion>;
  submissions: MatrixSubmissionInput[];
  eligibleStudents: Student[];
  mapelLabel: string;
  paketLabel: string;
  kelasLabel: string;
  tahunPelajaran: string;
  semester: string;
  profile?: SchoolProfile;
  teachers?: Teacher[];
  kktp?: number;
  mapelOptions?: string[];
  selectedMatrixMapel?: string;
  onChangeMatrixMapel?: (mapel: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export const AnalisisButirMatrixPanel: React.FC<AnalisisButirMatrixPanelProps> = ({
  examType,
  questions,
  submissions,
  eligibleStudents,
  mapelLabel,
  paketLabel,
  kelasLabel,
  tahunPelajaran,
  semester,
  profile,
  teachers = [],
  kktp = 75,
  mapelOptions,
  selectedMatrixMapel,
  onChangeMatrixMapel,
  showToast,
}) => {
  const [sortBy, setSortBy] = useState<'absen' | 'rank'>('absen');
  const [includeUnsubmitted, setIncludeUnsubmitted] = useState<boolean>(false);
  const [classSubFilter, setClassSubFilter] = useState<string>('all');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const availableSubClasses = useMemo(() => {
    const set = new Set<string>();
    eligibleStudents.forEach((s) => {
      if (s.kelas) set.add(s.kelas);
    });
    submissions.forEach((sub) => {
      if (sub.kelas) set.add(sub.kelas);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  }, [eligibleStudents, submissions]);

  const scopedStudents = useMemo(() => {
    if (classSubFilter === 'all') return eligibleStudents;
    return eligibleStudents.filter((s) => s.kelas === classSubFilter);
  }, [eligibleStudents, classSubFilter]);

  const scopedSubmissions = useMemo(() => {
    if (classSubFilter === 'all') return submissions;
    return submissions.filter((sub) => {
      if (sub.kelas && sub.kelas === classSubFilter) return true;
      return scopedStudents.some(
        (st) =>
          st.id === sub.studentId ||
          (st.nisn && sub.nisn && st.nisn === sub.nisn)
      );
    });
  }, [submissions, classSubFilter, scopedStudents]);

  const effectiveKelasLabel =
    classSubFilter !== 'all' ? classSubFilter : kelasLabel;

  const matrix = useMemo(
    () =>
      buildDynamicItemMatrix({
        examType,
        questions,
        submissions: scopedSubmissions,
        eligibleStudents: scopedStudents,
        mapelLabel,
        paketLabel,
        kelasLabel: effectiveKelasLabel,
        tahunPelajaran,
        semester,
        kktp,
        includeUnsubmitted,
      }),
    [
      examType,
      questions,
      scopedSubmissions,
      scopedStudents,
      mapelLabel,
      paketLabel,
      effectiveKelasLabel,
      tahunPelajaran,
      semester,
      kktp,
      includeUnsubmitted,
    ]
  );

  const displayRows = useMemo(() => {
    if (sortBy === 'absen') return matrix.rows;
    return [...matrix.rows].sort((a, b) => {
      const ra = a.peringkat ?? 99999;
      const rb = b.peringkat ?? 99999;
      if (ra !== rb) return ra - rb;
      return a.nama.localeCompare(b.nama, 'id');
    });
  }, [matrix.rows, sortBy]);

  const handleExportExcel = () => {
    try {
      exportDynamicMatrixToExcel(matrix);
      showToast?.(
        `Matriks Analisis ${examType} (${mapelLabel} · ${matrix.totalQuestions} soal) berhasil diunduh (.xlsx).`,
        'success'
      );
    } catch {
      showToast?.('Gagal mengekspor matriks analisis ke Excel.', 'error');
    }
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const kepsek = resolveKepalaSekolah(teachers, profile);
      const wali = resolveWaliKelas(teachers, effectiveKelasLabel);
      await exportDynamicMatrixToPdf({
        profile,
        matrix,
        kepsekNama: kepsek.nama,
        kepsekNipLabel: formatNipLabel(kepsek.status, kepsek.nip),
        waliNama: wali?.nama || 'Guru Mata Pelajaran',
        waliNipLabel: formatNipLabel(wali?.statusPegawai, wali?.nip),
      });
      showToast?.(
        `Matriks Analisis ${examType} (${mapelLabel} · ${matrix.totalQuestions} soal) berhasil diunduh (.pdf).`,
        'success'
      );
    } catch {
      showToast?.('Gagal mencetak matriks analisis ke PDF.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const accentHeaderClass =
    examType === 'TKA'
      ? 'bg-amber-800 text-white'
      : 'bg-emerald-800 text-white';
  const accentSubHeaderClass =
    examType === 'TKA'
      ? 'bg-amber-100/90 text-amber-950'
      : 'bg-emerald-100/90 text-emerald-950';

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
      {/* Header Controls */}
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1.5 min-w-0 w-full">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-slate-500">
            <span className="inline-flex items-center gap-1.5 text-slate-800 font-black">
              <Grid className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Matriks Analisis Butir Soal {examType}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>{mapelLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{paketLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-emerald-700 font-black">
              {matrix.totalQuestions} Butir Soal (Dinamis 1–{matrix.totalQuestions || 0})
            </span>
          </div>
          <h3 className="font-display font-black text-base sm:text-lg text-slate-900 leading-snug">
            Matriks Skor Per Nomor Soal, Nilai Akhir, Peringkat &amp; Distribusi Nilai
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-4xl">
            Kolom <strong>JENIS PENILAIAN</strong>, <strong>NO. SOAL (1–{matrix.totalQuestions})</strong>, dan <strong>BOBOT</strong> menyesuaikan jumlah soal aktual tanpa angka statis.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 no-print">
          <div className="flex flex-wrap items-center gap-2">
            {mapelOptions && mapelOptions.length > 0 && onChangeMatrixMapel && (
              <select
                value={selectedMatrixMapel || mapelLabel}
                onChange={(e) => onChangeMatrixMapel(e.target.value)}
                className="px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-xs font-black text-slate-800 outline-none cursor-pointer"
                title="Pilih mata pelajaran untuk menampilkan matriks soalnya"
              >
                {mapelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}

            {availableSubClasses.length > 1 && (
              <select
                value={classSubFilter}
                onChange={(e) => setClassSubFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="all">Semua Kelas ({eligibleStudents.length})</option>
                {availableSubClasses.map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setSortBy((prev) => (prev === 'absen' ? 'rank' : 'absen'))}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Urutkan: {sortBy === 'absen' ? 'Nama / Kelas' : 'Peringkat'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIncludeUnsubmitted((prev) => !prev)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                includeUnsubmitted
                  ? 'bg-sky-50 border-sky-300 text-sky-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{includeUnsubmitted ? 'Sembunyikan Belum Ujian' : 'Tampilkan Belum Ujian'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={matrix.totalQuestions === 0}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-display font-black inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel Matriks</span>
            </button>

            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={matrix.totalQuestions === 0 || isExportingPdf}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-display font-black inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingPdf ? 'Mencetak...' : 'Cetak PDF Matriks'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {matrix.totalQuestions === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 text-center space-y-1.5">
          <p className="text-sm font-display font-black text-slate-700">
            Belum ada butir soal pada mata pelajaran &amp; paket ini
          </p>
          <p className="text-xs text-slate-500">
            Matriks analisis butir soal akan terbentuk otomatis sejumlah soal aktual (10, 20, 25, 35, 40, atau 50 butir) setelah soal tersedia di Bank Soal.
          </p>
        </div>
      ) : (
        <>
          {/* Spreadsheet Matrix Table */}
          <div className="border border-slate-300 rounded-2xl overflow-x-auto max-h-[65vh]">
            <table className="w-max min-w-full border-collapse text-[11px] tabular-nums">
              <thead className="sticky top-0 z-20">
                {/* Row 1: Grouped JENIS PENILAIAN */}
                <tr className={accentHeaderClass}>
                  <th
                    rowSpan={3}
                    className="sticky left-0 z-30 bg-inherit border border-white/25 px-2 py-2 text-center font-black w-9"
                  >
                    NO
                  </th>
                  <th
                    rowSpan={1}
                    className="sticky left-9 z-30 bg-inherit border border-white/25 px-2.5 py-2 text-left font-black min-w-[180px]"
                  >
                    NAMA SISWA
                  </th>
                  <th
                    rowSpan={3}
                    className="sticky left-[216px] z-30 bg-inherit border border-white/25 px-2 py-2 text-center font-black w-10"
                  >
                    L/P
                  </th>
                  {matrix.jenisPenilaianGroups.map((grp, gIdx) => (
                    <th
                      key={`${grp.tipeKey}_${gIdx}`}
                      colSpan={grp.colSpan}
                      className="border border-white/25 px-2 py-1.5 text-center font-black tracking-wide whitespace-nowrap"
                    >
                      {grp.label}
                    </th>
                  ))}
                  <th
                    rowSpan={2}
                    className="border border-white/25 px-2.5 py-2 text-center font-black min-w-[66px]"
                  >
                    JUMLAH
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-white/25 px-2.5 py-2 text-center font-black min-w-[62px]"
                  >
                    NILAI
                  </th>
                  <th
                    rowSpan={3}
                    className="border border-white/25 px-2.5 py-2 text-center font-black min-w-[74px]"
                  >
                    PERINGKAT
                  </th>
                </tr>

                {/* Row 2: NO. SOAL 1..N */}
                <tr className={accentSubHeaderClass}>
                  <th className="sticky left-9 z-30 bg-inherit border border-slate-300 px-2.5 py-1 text-right font-black">
                    NO. SOAL
                  </th>
                  {matrix.columns.map((col) => (
                    <th
                      key={`qno_${col.no}`}
                      title={col.promptSnippet}
                      className="border border-slate-300 px-1.5 py-1 text-center font-mono font-black min-w-[34px]"
                    >
                      {col.no}
                    </th>
                  ))}
                </tr>

                {/* Row 3: BOBOT */}
                <tr className="bg-slate-100 text-slate-800">
                  <th className="sticky left-9 z-30 bg-slate-100 border border-slate-300 px-2.5 py-1 text-right font-black">
                    BOBOT
                  </th>
                  {matrix.columns.map((col) => (
                    <th
                      key={`qbobot_${col.no}`}
                      className="border border-slate-300 px-1.5 py-1 text-center font-mono font-bold text-slate-600"
                    >
                      {col.bobot}
                    </th>
                  ))}
                  <th className="border border-slate-300 px-2 py-1 text-center font-mono font-black text-slate-900">
                    {formatMatrixScoreCell(matrix.totalBobotMaksimal)}
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-center font-mono font-black text-slate-900">
                    100
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {displayRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6 + matrix.totalQuestions}
                      className="p-6 text-center text-slate-500 text-xs"
                    >
                      Belum ada peserta didik yang mengerjakan paket ujian ini. Aktifkan tombol &ldquo;Tampilkan Belum Ujian&rdquo; untuk meninjau daftar peserta kelas.
                    </td>
                  </tr>
                ) : (
                  displayRows.map((row, idx) => (
                    <tr
                      key={`${row.studentId}_${idx}`}
                      className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/70'}
                    >
                      <td className="sticky left-0 z-10 bg-inherit border border-slate-200 px-2 py-1.5 text-center font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="sticky left-9 z-10 bg-inherit border border-slate-200 px-2.5 py-1.5 text-left font-bold text-slate-900 whitespace-nowrap">
                        <span>{row.nama}</span>
                        {!row.hasSubmitted && (
                          <span className="ml-1.5 text-[9px] font-bold text-amber-700">
                            (Belum)
                          </span>
                        )}
                        {row.isManualOnly && (
                          <span className="ml-1.5 text-[9px] font-bold text-sky-700">
                            (Manual)
                          </span>
                        )}
                      </td>
                      <td className="sticky left-[216px] z-10 bg-inherit border border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-600">
                        {row.jenisKelamin}
                      </td>
                      {row.itemScores.map((scoreVal, cIdx) => {
                        const col = matrix.columns[cIdx];
                        const isZero = scoreVal !== null && scoreVal === 0;
                        const isFull = scoreVal !== null && scoreVal >= col.bobot;
                        return (
                          <td
                            key={`cell_${idx}_${cIdx}`}
                            className={`border border-slate-200 px-1.5 py-1.5 text-center font-mono font-bold ${
                              scoreVal === null
                                ? 'text-slate-300'
                                : isZero
                                ? 'bg-rose-50/80 text-rose-700'
                                : isFull
                                ? 'bg-emerald-50/60 text-emerald-800'
                                : 'bg-amber-50/70 text-amber-800'
                            }`}
                          >
                            {formatMatrixScoreCell(scoreVal)}
                          </td>
                        );
                      })}
                      <td className="border border-slate-200 px-2 py-1.5 text-center font-mono font-black text-slate-900">
                        {formatMatrixScoreCell(row.jumlahSkor)}
                      </td>
                      <td
                        className={`border border-slate-200 px-2 py-1.5 text-center font-mono font-black ${
                          row.nilaiAkhir === null
                            ? 'text-slate-400'
                            : row.nilaiAkhir >= kktp
                            ? 'text-emerald-700 bg-emerald-50/40'
                            : 'text-rose-700 bg-rose-50/40'
                        }`}
                      >
                        {formatMatrixScoreCell(row.nilaiAkhir)}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center font-mono font-black text-slate-800">
                        {row.peringkat !== null ? `#${row.peringkat}` : '—'}
                      </td>
                    </tr>
                  ))
                )}

                {/* Bottom Summary Rows */}
                <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                  <td className="sticky left-0 z-10 bg-slate-100 border border-slate-300 px-2 py-1.5 text-center" />
                  <td className="sticky left-9 z-10 bg-slate-100 border border-slate-300 px-2.5 py-1.5 text-left">
                    RATA-RATA
                  </td>
                  <td className="sticky left-[216px] z-10 bg-slate-100 border border-slate-300 px-2 py-1.5" />
                  {matrix.summary.itemAverages.map((v, i) => (
                    <td key={`avg_${i}`} className="border border-slate-300 px-1.5 py-1.5 text-center font-mono">
                      {formatMatrixScoreCell(v)}
                    </td>
                  ))}
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                    {formatMatrixScoreCell(matrix.summary.avgJumlah)}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                    {formatMatrixScoreCell(matrix.summary.avgNilai)}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5" />
                </tr>

                <tr className="bg-slate-50 font-black text-emerald-900">
                  <td className="sticky left-0 z-10 bg-slate-50 border border-slate-300 px-2 py-1.5" />
                  <td className="sticky left-9 z-10 bg-slate-50 border border-slate-300 px-2.5 py-1.5 text-left">
                    NILAI TERTINGGI
                  </td>
                  <td className="sticky left-[216px] z-10 bg-slate-50 border border-slate-300 px-2 py-1.5" />
                  {matrix.summary.itemMaxes.map((v, i) => (
                    <td key={`max_${i}`} className="border border-slate-300 px-1.5 py-1.5 text-center font-mono">
                      {formatMatrixScoreCell(v)}
                    </td>
                  ))}
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                    {formatMatrixScoreCell(matrix.summary.maxJumlah)}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                    {formatMatrixScoreCell(matrix.summary.maxNilai)}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5" />
                </tr>

                <tr className="bg-slate-50 font-black text-rose-900">
                  <td className="sticky left-0 z-10 bg-slate-50 border border-slate-300 px-2 py-1.5" />
                  <td className="sticky left-9 z-10 bg-slate-50 border border-slate-300 px-2.5 py-1.5 text-left">
                    NILAI TERENDAH
                  </td>
                  <td className="sticky left-[216px] z-10 bg-slate-50 border border-slate-300 px-2 py-1.5" />
                  {matrix.summary.itemMins.map((v, i) => (
                    <td key={`min_${i}`} className="border border-slate-300 px-1.5 py-1.5 text-center font-mono">
                      {formatMatrixScoreCell(v)}
                    </td>
                  ))}
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                    {formatMatrixScoreCell(matrix.summary.minJumlah)}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                    {formatMatrixScoreCell(matrix.summary.minNilai)}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5" />
                </tr>

                <tr className="bg-emerald-50/70 font-black text-emerald-950">
                  <td className="sticky left-0 z-10 bg-emerald-50 border border-slate-300 px-2 py-1.5" />
                  <td className="sticky left-9 z-10 bg-emerald-50 border border-slate-300 px-2.5 py-1.5 text-left">
                    KKM ({matrix.summary.kktp})
                  </td>
                  <td className="sticky left-[216px] z-10 bg-emerald-50 border border-slate-300 px-2 py-1.5" />
                  <td
                    colSpan={matrix.totalQuestions}
                    className="border border-slate-300 px-2.5 py-1.5 text-left text-[11px] font-bold text-emerald-900"
                  >
                    Tuntas KKTP: {matrix.summary.tuntasCount} dari {matrix.summary.pesertaWithScoreCount} peserta ({matrix.summary.tuntasPct}%)
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                    {matrix.summary.tuntasCount}/{matrix.summary.pesertaWithScoreCount}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                    {matrix.summary.tuntasPct}%
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5" />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Score Distribution Table (10 bands) */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display font-black text-xs sm:text-sm text-slate-900">
                Distribusi Nilai Siswa (10 Rentang Nilai)
              </h4>
              <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                Total Peserta Dinilai: {matrix.summary.pesertaWithScoreCount} Siswa
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
              {matrix.distribution.map((band) => {
                const isTuntasBand = band.min >= 71;
                return (
                  <div
                    key={band.label}
                    className={`rounded-xl border p-2.5 text-center space-y-0.5 ${
                      band.count > 0
                        ? isTuntasBand
                          ? 'bg-emerald-50/70 border-emerald-200'
                          : 'bg-amber-50/70 border-amber-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="text-[10px] font-black text-slate-600 font-mono">
                      {band.label}
                    </div>
                    <div className="font-display font-black text-base text-slate-900 tabular-nums">
                      {band.count}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 tabular-nums">
                      {band.percentage}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
