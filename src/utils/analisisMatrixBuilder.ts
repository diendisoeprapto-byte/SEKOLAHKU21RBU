import * as XLSX from 'xlsx';
import { CBTQuestion, Student, TKAQuestion } from '../types';
import { evaluateQuestionScore } from './answerChecker';
import { sortExamRankingsWithTieBreaker } from './examRanking';
import { stripQuestionTags } from './questionFormat';

export interface MatrixQuestionColumn {
  no: number;
  id: string;
  tipeKey: string;
  tipeLabel: string;
  bobot: number;
  promptSnippet: string;
}

export interface JenisPenilaianGroup {
  tipeKey: string;
  label: string;
  colSpan: number;
}

export interface MatrixStudentRow {
  no: number;
  studentId: string;
  nama: string;
  nisn: string;
  jenisKelamin: 'L' | 'P' | '-';
  kelas: string;
  itemScores: Array<number | null>;
  jumlahSkor: number | null;
  nilaiAkhir: number | null;
  peringkat: number | null;
  benarHots: number;
  durasiDetik?: number;
  hasSubmitted: boolean;
  isManualOnly: boolean;
}

export interface MatrixSummaryStats {
  itemAverages: Array<number | null>;
  itemMaxes: Array<number | null>;
  itemMins: Array<number | null>;
  avgJumlah: number | null;
  avgNilai: number | null;
  maxJumlah: number | null;
  maxNilai: number | null;
  minJumlah: number | null;
  minNilai: number | null;
  kktp: number;
  tuntasCount: number;
  pesertaWithScoreCount: number;
  tuntasPct: number;
}

export interface ScoreBandStat {
  label: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface DynamicItemMatrixData {
  examType: 'CBT' | 'TKA';
  mapelLabel: string;
  paketLabel: string;
  kelasLabel: string;
  tahunPelajaran: string;
  semester: string;
  totalQuestions: number;
  totalBobotMaksimal: number;
  columns: MatrixQuestionColumn[];
  jenisPenilaianGroups: JenisPenilaianGroup[];
  rows: MatrixStudentRow[];
  summary: MatrixSummaryStats;
  distribution: ScoreBandStat[];
}

export interface MatrixSubmissionInput {
  studentId?: string;
  studentName?: string;
  nisn?: string;
  kelas?: string;
  answers: Record<string, any>;
  recordedNilai?: number;
  durasiDetik?: number;
  benarHots?: number;
}

export interface BuildDynamicMatrixParams {
  examType: 'CBT' | 'TKA';
  questions: Array<CBTQuestion | TKAQuestion>;
  submissions: MatrixSubmissionInput[];
  eligibleStudents: Student[];
  mapelLabel: string;
  paketLabel: string;
  kelasLabel: string;
  tahunPelajaran: string;
  semester: string;
  kktp?: number;
  includeUnsubmitted?: boolean;
}

const TIPE_LABEL_MAP: Record<string, string> = {
  pg: 'PILIHAN GANDA',
  pg_kompleks: 'PG KOMPLEKS',
  benar_salah: 'BENAR / SALAH',
  menjodohkan: 'MENJODOHKAN',
  isian: 'ISIAN SINGKAT',
  uraian: 'URAIAN',
};

export const SCORE_BANDS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: '< 11', min: 0, max: 10 },
  { label: '11 – 20', min: 11, max: 20 },
  { label: '21 – 30', min: 21, max: 30 },
  { label: '31 – 40', min: 31, max: 40 },
  { label: '41 – 50', min: 41, max: 50 },
  { label: '51 – 60', min: 51, max: 60 },
  { label: '61 – 70', min: 61, max: 70 },
  { label: '71 – 80', min: 71, max: 80 },
  { label: '81 – 90', min: 81, max: 90 },
  { label: '91 – 100', min: 91, max: 100 },
];

function roundScoreVal(val: number): number {
  return Math.round(val * 100) / 100;
}

export function formatMatrixScoreCell(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return Number.isInteger(val) ? String(val) : val.toFixed(1).replace(/\.0$/, '');
}

export function buildDynamicItemMatrix(params: BuildDynamicMatrixParams): DynamicItemMatrixData {
  const {
    examType,
    questions,
    submissions,
    eligibleStudents,
    mapelLabel,
    paketLabel,
    kelasLabel,
    tahunPelajaran,
    semester,
    kktp = 75,
    includeUnsubmitted = false,
  } = params;

  const columns: MatrixQuestionColumn[] = questions.map((q, idx) => {
    const tipeKey = String(q.tipe || 'pg').toLowerCase();
    const tipeLabel = TIPE_LABEL_MAP[tipeKey] || tipeKey.toUpperCase();
    const bobot = Number.isFinite(Number(q.bobot)) && Number(q.bobot) > 0 ? Number(q.bobot) : 1;
    const rawPrompt = stripQuestionTags(q.pertanyaan || '') || `Butir Soal ${idx + 1}`;
    const promptSnippet = rawPrompt.length > 80 ? `${rawPrompt.slice(0, 77)}...` : rawPrompt;
    return {
      no: idx + 1,
      id: q.id || `q_${idx + 1}`,
      tipeKey,
      tipeLabel,
      bobot,
      promptSnippet,
    };
  });

  // Group JENIS PENILAIAN using run-length grouping strictly preserving exact question order 1..N
  const jenisPenilaianGroups: JenisPenilaianGroup[] = [];
  columns.forEach((col) => {
    const last = jenisPenilaianGroups[jenisPenilaianGroups.length - 1];
    if (last && last.tipeKey === col.tipeKey) {
      last.colSpan += 1;
    } else {
      jenisPenilaianGroups.push({
        tipeKey: col.tipeKey,
        label: col.tipeLabel,
        colSpan: 1,
      });
    }
  });

  const totalBobotMaksimal = columns.reduce((acc, col) => acc + col.bobot, 0);

  const findSubmissionForStudent = (student: Student): MatrixSubmissionInput | undefined => {
    const normName = (student.nama || '').trim().toLowerCase();
    return submissions.find((sub) => {
      if (sub.studentId && sub.studentId === student.id) return true;
      if (student.nisn && sub.nisn && sub.nisn.trim() === student.nisn.trim()) return true;
      if (normName && sub.studentName && sub.studentName.trim().toLowerCase() === normName) {
        return true;
      }
      return false;
    });
  };

  const matchedSubSet = new Set<MatrixSubmissionInput>();
  const rawRows: MatrixStudentRow[] = [];

  const pushStudentRow = (student: Student, sub?: MatrixSubmissionInput) => {
    if (sub) matchedSubSet.add(sub);
    const hasSubmitted = Boolean(sub);
    const answerKeys = sub?.answers ? Object.keys(sub.answers) : [];
    const hasAnyItemAnswer =
      hasSubmitted &&
      questions.some((q) => sub?.answers && q.id in sub.answers && sub.answers[q.id] !== undefined);
    const isManualOnly = hasSubmitted && !hasAnyItemAnswer && answerKeys.length === 0;

    if (!hasSubmitted) {
      rawRows.push({
        no: rawRows.length + 1,
        studentId: student.id,
        nama: student.nama,
        nisn: student.nisn || '-',
        jenisKelamin: student.jenisKelamin === 'P' ? 'P' : 'L',
        kelas: student.kelas || '-',
        itemScores: columns.map(() => null),
        jumlahSkor: null,
        nilaiAkhir: null,
        peringkat: null,
        benarHots: 0,
        hasSubmitted: false,
        isManualOnly: false,
      });
      return;
    }

    if (isManualOnly || columns.length === 0) {
      const fallbackNilai =
        typeof sub?.recordedNilai === 'number' && Number.isFinite(sub.recordedNilai)
          ? Math.round(sub.recordedNilai)
          : null;
      rawRows.push({
        no: rawRows.length + 1,
        studentId: student.id,
        nama: student.nama,
        nisn: student.nisn || '-',
        jenisKelamin: student.jenisKelamin === 'P' ? 'P' : 'L',
        kelas: student.kelas || '-',
        itemScores: columns.map(() => null),
        jumlahSkor: null,
        nilaiAkhir: fallbackNilai,
        peringkat: null,
        benarHots: sub?.benarHots || 0,
        durasiDetik: sub?.durasiDetik,
        hasSubmitted: true,
        isManualOnly: true,
      });
      return;
    }

    let sumScore = 0;
    let hotsCount = 0;
    const itemScores = questions.map((q, idx) => {
      const col = columns[idx];
      const ans = sub?.answers ? sub.answers[q.id] : undefined;
      const evalRes = evaluateQuestionScore(
        q.tipe,
        ans,
        q.kunciJawaban,
        col.bobot,
        q.opsi,
        q
      );
      const earned = roundScoreVal(evalRes.earnedScore);
      sumScore += earned;
      if (evalRes.isCorrect) {
        const diff = String((q as any).tingkatKesulitan || '').toLowerCase();
        if (diff === 'sulit' || diff === 'sukar') hotsCount += 1;
      }
      return earned;
    });

    const jumlahSkor = roundScoreVal(sumScore);
    const nilaiAkhir =
      totalBobotMaksimal > 0
        ? Math.round((jumlahSkor / totalBobotMaksimal) * 100)
        : typeof sub?.recordedNilai === 'number'
        ? Math.round(sub.recordedNilai)
        : 0;

    rawRows.push({
      no: rawRows.length + 1,
      studentId: student.id,
      nama: student.nama,
      nisn: student.nisn || '-',
      jenisKelamin: student.jenisKelamin === 'P' ? 'P' : 'L',
      kelas: student.kelas || '-',
      itemScores,
      jumlahSkor,
      nilaiAkhir,
      peringkat: null,
      benarHots: sub?.benarHots ?? hotsCount,
      durasiDetik: sub?.durasiDetik,
      hasSubmitted: true,
      isManualOnly: false,
    });
  };

  // Sort students cleanly by class then name
  const sortedStudents = [...eligibleStudents].sort((a, b) => {
    const clsCmp = (a.kelas || '').localeCompare(b.kelas || '', 'id', { numeric: true });
    if (clsCmp !== 0) return clsCmp;
    return (a.nama || '').localeCompare(b.nama || '', 'id');
  });

  sortedStudents.forEach((student) => {
    const sub = findSubmissionForStudent(student);
    if (sub || includeUnsubmitted) {
      pushStudentRow(student, sub);
    }
  });

  // Include any remaining real submissions whose student wasn't in eligibleStudents
  submissions.forEach((sub, idx) => {
    if (matchedSubSet.has(sub)) return;
    const synthStudent: Student = {
      id: sub.studentId || `sub_${idx}`,
      barcodeId: '',
      nama: sub.studentName || 'Peserta Didik',
      jenisKelamin: 'L',
      tempatLahir: '',
      tanggalLahir: '',
      nik: '',
      nisn: sub.nisn || '-',
      kebutuhanKhusus: 'Tidak Ada (Reguler)',
      namaAyah: '',
      namaIbu: '',
      alamat: '',
      agama: 'Islam',
      kelas: sub.kelas || kelasLabel || '-',
      tahunPelajaran,
      username: '',
      password: '',
      fotoUrl: '',
    };
    pushStudentRow(synthStudent, sub);
  });

  // Compute Peringkat using SERBU 21's tie-breaker ranking
  const rankable = rawRows.filter((r) => r.nilaiAkhir !== null);
  const rankedOrder = sortExamRankingsWithTieBreaker(rankable, {
    getScore: (r) => r.nilaiAkhir ?? 0,
    getBenarHots: (r) => r.benarHots || 0,
    getDurasiDetik: (r) => r.durasiDetik,
    getName: (r) => r.nama,
  });
  const rankMap = new Map<string, number>();
  rankedOrder.forEach((r, idx) => {
    rankMap.set(`${r.studentId}::${r.nama}`, idx + 1);
  });
  rawRows.forEach((r) => {
    if (r.nilaiAkhir !== null) {
      r.peringkat = rankMap.get(`${r.studentId}::${r.nama}`) ?? null;
    }
  });

  // Compute column & total summary stats
  const itemAverages: Array<number | null> = [];
  const itemMaxes: Array<number | null> = [];
  const itemMins: Array<number | null> = [];

  for (let c = 0; c < columns.length; c++) {
    const vals: number[] = [];
    for (let r = 0; r < rawRows.length; r++) {
      const v = rawRows[r].itemScores[c];
      if (v !== null && Number.isFinite(v)) vals.push(v);
    }
    if (vals.length === 0) {
      itemAverages.push(null);
      itemMaxes.push(null);
      itemMins.push(null);
    } else {
      const sum = vals.reduce((a, b) => a + b, 0);
      itemAverages.push(roundScoreVal(sum / vals.length));
      itemMaxes.push(Math.max(...vals));
      itemMins.push(Math.min(...vals));
    }
  }

  const jumlahVals = rawRows
    .map((r) => r.jumlahSkor)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const nilaiVals = rawRows
    .map((r) => r.nilaiAkhir)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  const avgJumlah =
    jumlahVals.length > 0
      ? roundScoreVal(jumlahVals.reduce((a, b) => a + b, 0) / jumlahVals.length)
      : null;
  const maxJumlah = jumlahVals.length > 0 ? Math.max(...jumlahVals) : null;
  const minJumlah = jumlahVals.length > 0 ? Math.min(...jumlahVals) : null;

  const avgNilai =
    nilaiVals.length > 0
      ? roundScoreVal(nilaiVals.reduce((a, b) => a + b, 0) / nilaiVals.length)
      : null;
  const maxNilai = nilaiVals.length > 0 ? Math.max(...nilaiVals) : null;
  const minNilai = nilaiVals.length > 0 ? Math.min(...nilaiVals) : null;

  const tuntasCount = nilaiVals.filter((n) => n >= kktp).length;
  const pesertaWithScoreCount = nilaiVals.length;
  const tuntasPct =
    pesertaWithScoreCount > 0 ? Math.round((tuntasCount / pesertaWithScoreCount) * 100) : 0;

  // Score distribution table across 10 bands
  const distribution: ScoreBandStat[] = SCORE_BANDS.map((band) => {
    const count = nilaiVals.filter((n) => n >= band.min && n <= band.max).length;
    const percentage =
      pesertaWithScoreCount > 0 ? Math.round((count / pesertaWithScoreCount) * 100) : 0;
    return {
      ...band,
      count,
      percentage,
    };
  });

  return {
    examType,
    mapelLabel,
    paketLabel,
    kelasLabel,
    tahunPelajaran,
    semester,
    totalQuestions: columns.length,
    totalBobotMaksimal: roundScoreVal(totalBobotMaksimal),
    columns,
    jenisPenilaianGroups,
    rows: rawRows,
    summary: {
      itemAverages,
      itemMaxes,
      itemMins,
      avgJumlah,
      avgNilai,
      maxJumlah,
      maxNilai,
      minJumlah,
      minNilai,
      kktp,
      tuntasCount,
      pesertaWithScoreCount,
      tuntasPct,
    },
    distribution,
  };
}

export function exportDynamicMatrixToExcel(
  matrix: DynamicItemMatrixData,
  customFilename?: string
): void {
  const nCols = matrix.totalQuestions;
  const rows: any[][] = [];
  const merges: XLSX.Range[] = [];

  rows.push([`MATRIKS ANALISIS BUTIR SOAL ${matrix.examType} PER MATA PELAJARAN`]);
  rows.push(['SDN RAWA BADAK UTARA 21 - JAKARTA UTARA']);
  rows.push([
    `Mata Pelajaran: ${matrix.mapelLabel} | Paket: ${matrix.paketLabel} | Kelas: ${matrix.kelasLabel} | TP ${matrix.tahunPelajaran} (${matrix.semester})`,
  ]);
  rows.push([]);

  // Header Row 1 (index 4): NO | NAMA SISWA | L/P | JENIS PENILAIAN (grouped) | JUMLAH | NILAI | PERINGKAT
  const header1Idx = rows.length;
  const header1: any[] = ['NO', 'NAMA SISWA', 'L/P'];
  let colCursor = 3;
  if (nCols > 0) {
    matrix.jenisPenilaianGroups.forEach((grp) => {
      header1.push(grp.label);
      for (let i = 1; i < grp.colSpan; i++) header1.push('');
      if (grp.colSpan > 1) {
        merges.push({
          s: { r: header1Idx, c: colCursor },
          e: { r: header1Idx, c: colCursor + grp.colSpan - 1 },
        });
      }
      colCursor += grp.colSpan;
    });
  }
  const jumlahColIdx = colCursor;
  const nilaiColIdx = colCursor + 1;
  const rankColIdx = colCursor + 2;
  header1.push('JUMLAH', 'NILAI', 'PERINGKAT');
  rows.push(header1);

  // Header Row 2 (index 5): NO. SOAL 1..N
  const header2Idx = rows.length;
  const header2: any[] = ['', 'NO. SOAL', ''];
  matrix.columns.forEach((c) => header2.push(c.no));
  header2.push(matrix.totalBobotMaksimal, '100', '');
  rows.push(header2);

  // Header Row 3 (index 6): BOBOT per soal
  const header3Idx = rows.length;
  const header3: any[] = ['', 'BOBOT', ''];
  matrix.columns.forEach((c) => header3.push(c.bobot));
  header3.push(matrix.totalBobotMaksimal, '100', '');
  rows.push(header3);

  // Vertical merges for fixed header columns
  merges.push({ s: { r: header1Idx, c: 0 }, e: { r: header3Idx, c: 0 } });
  merges.push({ s: { r: header1Idx, c: 2 }, e: { r: header3Idx, c: 2 } });
  merges.push({ s: { r: header1Idx, c: jumlahColIdx }, e: { r: header2Idx, c: jumlahColIdx } });
  merges.push({ s: { r: header1Idx, c: nilaiColIdx }, e: { r: header2Idx, c: nilaiColIdx } });
  merges.push({ s: { r: header1Idx, c: rankColIdx }, e: { r: header3Idx, c: rankColIdx } });

  // Student rows
  matrix.rows.forEach((row, idx) => {
    const rArr: any[] = [idx + 1, row.nama, row.jenisKelamin];
    row.itemScores.forEach((val) => {
      rArr.push(val !== null ? val : '-');
    });
    rArr.push(
      row.jumlahSkor !== null ? row.jumlahSkor : '-',
      row.nilaiAkhir !== null ? row.nilaiAkhir : '-',
      row.peringkat !== null ? row.peringkat : '-'
    );
    rows.push(rArr);
  });

  // Footer Summary rows
  rows.push([
    '',
    'RATA-RATA',
    '',
    ...matrix.summary.itemAverages.map((v) => (v !== null ? v : '-')),
    matrix.summary.avgJumlah ?? '-',
    matrix.summary.avgNilai ?? '-',
    '',
  ]);
  rows.push([
    '',
    'NILAI TERTINGGI',
    '',
    ...matrix.summary.itemMaxes.map((v) => (v !== null ? v : '-')),
    matrix.summary.maxJumlah ?? '-',
    matrix.summary.maxNilai ?? '-',
    '',
  ]);
  rows.push([
    '',
    'NILAI TERENDAH',
    '',
    ...matrix.summary.itemMins.map((v) => (v !== null ? v : '-')),
    matrix.summary.minJumlah ?? '-',
    matrix.summary.minNilai ?? '-',
    '',
  ]);
  rows.push([
    '',
    `KKM (${matrix.summary.kktp})`,
    '',
    ...matrix.columns.map(() => ''),
    `${matrix.summary.tuntasCount}/${matrix.summary.pesertaWithScoreCount} Tuntas`,
    `${matrix.summary.tuntasPct}%`,
    '',
  ]);

  // Distribution block
  rows.push([]);
  rows.push(['DISTRIBUSI NILAI SISWA']);
  rows.push(['Rentang Nilai', 'Jumlah Siswa', 'Persentase (%)']);
  matrix.distribution.forEach((band) => {
    rows.push([band.label, band.count, `${band.percentage}%`]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = merges;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Matriks Analisis');

  const safeMapel = (matrix.mapelLabel || 'Mapel').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 24);
  const safePaket = (matrix.paketLabel || 'Paket').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 24);
  XLSX.writeFile(
    wb,
    customFilename || `Matriks_Analisis_${matrix.examType}_${safeMapel}_${safePaket}.xlsx`
  );
}
