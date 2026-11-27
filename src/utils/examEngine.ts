import { CBTQuestion } from '../types';
import { resolveBenarSalahItems, resolveMenjodohkanData } from './questionFormat';

/**
 * ============================================================================
 * SERBU 21 - Universal Exam Engine & Standardized Evaluation Engine (v5.0.0)
 * ============================================================================
 * Mesin penilaian universal untuk seluruh 6 tipe soal CBT & TKA:
 * 1. Pilihan Ganda (PG)
 * 2. Pilihan Ganda Kompleks (PG Kompleks)
 * 3. Menjodohkan (Matching)
 * 4. Isian Singkat (Short Answer)
 * 5. Uraian (Essay)
 * 6. Benar / Salah (True / False)
 */

export interface ExamEvaluationResult {
  isCorrect: boolean;
  earnedScore: number;
  status: 'benar' | 'sebagian' | 'salah';
  details?: {
    matchedCount?: number;
    totalExpected?: number;
    penaltyCount?: number;
    explanation?: string;
  };
}

/**
 * Pembersih teks dasar:
 * - Mengubah nilai ke string
 * - Memangkas spasi di depan dan belakang (trim)
 * - Mengganti spasi ganda / whitespace berulang menjadi satu spasi
 * - Mengubah seluruh karakter ke huruf kecil (lowercase)
 */
export function cleanStr(val: any): string {
  if (val === undefined || val === null) return '';
  return String(val).trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Normalisasi teks padat (menghapus spasi & karakter non-alfanumerik)
 * Contoh: "orang tua" -> "orangtua", "Ir. Soekarno" -> "irsoekarno"
 */
export function normalizeCondensed(val: any): string {
  if (val === undefined || val === null) return '';
  return String(val)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Normalisasi teks angka & pecahan:
 * Menyamakan tanda desimal koma (,) dan titik (.), serta mengabaikan pemisah ribuan standar
 */
export function normalizeNumericStr(val: any): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim().toLowerCase();
  // Tangani format ribuan seperti "1.500" atau "1,500" jika tepat 3 digit di belakang
  if (/^\d{1,3}[.,]\d{3}$/.test(str)) {
    str = str.replace(/[.,]/g, '');
  } else {
    // Normalisasi desimal koma ke titik (contoh "0,75" -> "0.75")
    str = str.replace(/,/g, '.');
  }
  return str;
}

/**
 * Ekstraksi token teks & opsi huruf dari nilai jawaban/kunci
 */
export function extractOptionKeyAndText(ans: any): { key: string; text: string } {
  if (ans && typeof ans === 'object' && !Array.isArray(ans)) {
    return {
      key: cleanStr(ans.key || ans.opsiKey || ans.id || ''),
      text: cleanStr(ans.text || ans.jawaban || ans.label || ''),
    };
  }
  const str = String(ans ?? '').trim();
  const match = str.match(/^([A-Fa-f0-9])[\.\:\)\-]\s*(.*)$/);
  if (match) {
    return {
      key: match[1].toLowerCase(),
      text: cleanStr(match[2]),
    };
  }
  return {
    key: cleanStr(str),
    text: cleanStr(str),
  };
}

/**
 * Mengonversi jawaban jamak (Array, Object, atau String pemisah) ke Array string bersih
 */
export function parseMultiAnswersToArray(val: any): string[] {
  if (!val) return [];
  const set = new Set<string>();

  if (Array.isArray(val)) {
    val.forEach((item) => {
      const ext = extractOptionKeyAndText(item);
      const k = ext.key || ext.text;
      if (k) set.add(k);
    });
  } else if (typeof val === 'object') {
    Object.entries(val).forEach(([k, v]) => {
      if (v === true || v === 1 || v === '1' || v === 'true') {
        const ext = extractOptionKeyAndText(k);
        const token = ext.key || ext.text;
        if (token) set.add(token);
      } else if (v && typeof v === 'string') {
        const ext = extractOptionKeyAndText(v);
        const token = ext.key || ext.text;
        if (token) set.add(token);
      }
    });
  } else {
    const str = String(val).trim();
    if (str) {
      // Split pemisah koma, titik-koma, garis miring, atau baris baru
      str.split(/[,;\n\/]+/).forEach((part) => {
        const ext = extractOptionKeyAndText(part);
        const token = ext.key || ext.text;
        if (token) set.add(token);
      });
    }
  }

  return Array.from(set).sort();
}

/**
 * Normalisasi token Benar / Salah ke standar huruf kapital 'B' atau 'S'
 */
export function parseBenarSalahToken(val: any): 'B' | 'S' | '' {
  if (val === true || val === 1 || val === '1') return 'B';
  if (val === false || val === 0 || val === '0') return 'S';
  const c = cleanStr(val);
  if (['b', 'benar', 'true', 'ya', 'yes', 't', 'tul'].includes(c)) return 'B';
  if (['s', 'salah', 'false', 'tidak', 'no', 'f'].includes(c)) return 'S';
  return '';
}

/**
 * Normalisasi struktur Menjodohkan ke Record<premis, respon>
 */
export function parseMatchingPairsMap(val: any): Record<string, string> {
  const result: Record<string, string> = {};
  if (!val) return result;

  if (typeof val === 'object' && !Array.isArray(val)) {
    Object.entries(val).forEach(([k, v]) => {
      const cleanK = cleanStr(k);
      const cleanV = cleanStr(v);
      if (cleanK) result[cleanK] = cleanV;
    });
    return result;
  }

  if (Array.isArray(val)) {
    val.forEach((item) => {
      if (Array.isArray(item) && item.length >= 2) {
        const cleanK = cleanStr(item[0]);
        const cleanV = cleanStr(item[1]);
        if (cleanK) result[cleanK] = cleanV;
      } else if (typeof item === 'object' && item) {
        const k = cleanStr(item.premis || item.left || item.kunci || item.q || '');
        const v = cleanStr(item.respon || item.right || item.jawaban || item.a || '');
        if (k) result[k] = v;
      } else if (typeof item === 'string') {
        const parts = item.split(/[-:=->]+/);
        if (parts.length >= 2) {
          const cleanK = cleanStr(parts[0]);
          const cleanV = cleanStr(parts[1]);
          if (cleanK) result[cleanK] = cleanV;
        }
      }
    });
    return result;
  }

  if (typeof val === 'string') {
    val.split(/[,;\n]+/).forEach((pair) => {
      const parts = pair.split(/[-:=->]+/);
      if (parts.length >= 2) {
        const cleanK = cleanStr(parts[0]);
        const cleanV = cleanStr(parts[1]);
        if (cleanK) result[cleanK] = cleanV;
      }
    });
  }

  return result;
}

/**
 * Pencocokan Pilihan Ganda (PG):
 * Menyamakan huruf opsi (A, B, C, D), indeks angka (0, 1, 2, 3), dan teks opsi.
 */
function evaluatePG(
  studentAns: any,
  keyAns: any,
  weight: number,
  options: string[] = []
): ExamEvaluationResult {
  if (studentAns === undefined || studentAns === null || studentAns === '') {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const cleanStudent = cleanStr(studentAns);
  const cleanKey = cleanStr(keyAns);

  // 1. Pencocokan langsung teks/token
  if (cleanStudent && cleanStudent === cleanKey) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  }

  // 2. Normalisasi opsi huruf & indeks
  const cleanOptions = (options || []).map((o) => cleanStr(o));

  const resolveToken = (val: any): { letter: string; text: string; index: number } => {
    const raw = String(val ?? '').trim();
    const cl = cleanStr(raw);

    // Cek huruf tunggal
    if (/^[a-d]$/i.test(cl)) {
      const idx = cl.toUpperCase().charCodeAt(0) - 65;
      return { letter: cl.toUpperCase(), text: cleanOptions[idx] || '', index: idx };
    }

    // Cek angka indeks
    if (/^[0-3]$/.test(cl)) {
      const idx = parseInt(cl, 10);
      const letter = String.fromCharCode(65 + idx);
      return { letter, text: cleanOptions[idx] || '', index: idx };
    }

    // Cek teks opsi
    const idx = cleanOptions.findIndex((opt) => opt === cl || (cl && opt.includes(cl)) || (opt && cl.includes(opt)));
    if (idx >= 0) {
      return { letter: String.fromCharCode(65 + idx), text: cleanOptions[idx] || '', index: idx };
    }

    return { letter: cl.toUpperCase(), text: cl, index: -1 };
  };

  const studentResolved = resolveToken(studentAns);
  const keyResolved = resolveToken(keyAns);

  if (
    (studentResolved.letter && studentResolved.letter === keyResolved.letter) ||
    (studentResolved.index >= 0 && studentResolved.index === keyResolved.index) ||
    (studentResolved.text && keyResolved.text && studentResolved.text === keyResolved.text)
  ) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  }

  return { isCorrect: false, earnedScore: 0, status: 'salah' };
}

/**
 * Pencocokan Pilihan Ganda Kompleks:
 * Mengubah jawaban siswa & kunci ke array, menormalisasi, lalu menghitung skor proporsional net.
 */
function evaluatePGKompleks(
  studentAns: any,
  keyAns: any,
  weight: number,
  options: string[] = []
): ExamEvaluationResult {
  const studentTokens = parseMultiAnswersToArray(studentAns);
  const keyTokens = parseMultiAnswersToArray(keyAns);

  if (studentTokens.length === 0 || keyTokens.length === 0) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const cleanOptions = (options || []).map((o) => cleanStr(o));

  // Normalisasi token ke huruf A-D jika memungkinkan
  const normalizeTokenList = (tokens: string[]): string[] => {
    return tokens.map((t) => {
      const cl = cleanStr(t);
      if (/^[a-d]$/i.test(cl)) return cl.toUpperCase();
      if (/^[0-3]$/.test(cl)) return String.fromCharCode(65 + parseInt(cl, 10));
      const idx = cleanOptions.findIndex((opt) => opt === cl);
      if (idx >= 0) return String.fromCharCode(65 + idx);
      return cl;
    });
  };

  const normStudent = Array.from(new Set(normalizeTokenList(studentTokens))).sort();
  const normKey = Array.from(new Set(normalizeTokenList(keyTokens))).sort();

  // Pencocokan persis (Exact Match)
  if (
    normStudent.length === normKey.length &&
    normStudent.every((val, idx) => val === normKey[idx])
  ) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  }

  // Perhitungan Sebagian Benar dengan Penalti Jawaban Salah
  const correctChosen = normStudent.filter((t) => normKey.includes(t)).length;
  const wrongChosen = normStudent.filter((t) => !normKey.includes(t)).length;
  const totalCorrect = Math.max(1, normKey.length);

  const netRatio = Math.max(0, (correctChosen - wrongChosen) / totalCorrect);
  const earnedScore = Math.round(netRatio * weight * 100) / 100;

  if (earnedScore >= weight) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  } else if (earnedScore > 0) {
    return {
      isCorrect: false,
      earnedScore,
      status: 'sebagian',
      details: {
        matchedCount: correctChosen,
        penaltyCount: wrongChosen,
        totalExpected: totalCorrect,
      },
    };
  }

  return { isCorrect: false, earnedScore: 0, status: 'salah' };
}

/**
 * Pencocokan Menjodohkan (Matching):
 * Membandingkan pasangan premis dan respons secara proporsional.
 */
function evaluateMenjodohkan(
  studentAns: any,
  keyAns: any,
  weight: number,
  questionObj?: any
): ExamEvaluationResult {
  const studentMap = parseMatchingPairsMap(studentAns);
  let keyMap = parseMatchingPairsMap(keyAns);

  // Jika kunci kosong atau dalam bentuk resolveMenjodohkanData
  if (Object.keys(keyMap).length === 0 && questionObj) {
    try {
      const resolved = resolveMenjodohkanData(questionObj);
      if (resolved && resolved.pasangan && Array.isArray(resolved.pasangan)) {
        resolved.pasangan.forEach((p: any) => {
          const k = cleanStr(p.premis || p.kiri || p.q || '');
          const v = cleanStr(p.respon || p.jawaban || p.kanan || p.a || '');
          if (k) keyMap[k] = v;
        });
      }
    } catch {}
  }

  const keyKeys = Object.keys(keyMap);
  const totalPairs = Math.max(1, keyKeys.length);

  if (keyKeys.length === 0 || Object.keys(studentMap).length === 0) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  let matchedPairs = 0;
  keyKeys.forEach((k) => {
    const expectedVal = keyMap[k];
    const actualVal = studentMap[k];
    if (actualVal !== undefined && actualVal !== '') {
      if (
        actualVal === expectedVal ||
        normalizeCondensed(actualVal) === normalizeCondensed(expectedVal)
      ) {
        matchedPairs++;
      }
    }
  });

  const ratio = matchedPairs / totalPairs;
  const earnedScore = Math.round(ratio * weight * 100) / 100;

  if (matchedPairs === totalPairs) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  } else if (matchedPairs > 0) {
    return {
      isCorrect: false,
      earnedScore,
      status: 'sebagian',
      details: { matchedCount: matchedPairs, totalExpected: totalPairs },
    };
  }

  return { isCorrect: false, earnedScore: 0, status: 'salah' };
}

/**
 * Pencocokan Isian Singkat:
 * Mendukung alternatif tanda garis miring (/), koma, titik desimal, dan condensed.
 */
function evaluateIsianSingkat(
  studentAns: any,
  keyAns: any,
  weight: number
): ExamEvaluationResult {
  if (studentAns === undefined || studentAns === null || studentAns === '') {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const userClean = cleanStr(studentAns);
  const userNum = normalizeNumericStr(studentAns);
  const userCondensed = normalizeCondensed(studentAns);

  if (!userClean) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const rawKeys = Array.isArray(keyAns)
    ? keyAns
    : String(keyAns || '').split(/[\/|;]+/);

  for (const rawK of rawKeys) {
    const keyClean = cleanStr(rawK);
    const keyNum = normalizeNumericStr(rawK);
    const keyCondensed = normalizeCondensed(rawK);

    // 1. Pencocokan langsung teks (case-insensitive & multi-spasi bersih)
    if (userClean === keyClean) {
      return { isCorrect: true, earnedScore: weight, status: 'benar' };
    }

    // 2. Pencocokan numerik desimal ("0,75" === "0.75" / "1.500" === "1500")
    if (userNum && keyNum) {
      if (userNum === keyNum) {
        return { isCorrect: true, earnedScore: weight, status: 'benar' };
      }
      const pUser = parseFloat(userNum);
      const pKey = parseFloat(keyNum);
      if (!Number.isNaN(pUser) && !Number.isNaN(pKey) && Math.abs(pUser - pKey) < 0.0001) {
        return { isCorrect: true, earnedScore: weight, status: 'benar' };
      }
    }

    // 3. Pencocokan teks padat (menghilangkan spasi dan tanda baca titik/koma)
    if (userCondensed && keyCondensed && userCondensed === keyCondensed) {
      return { isCorrect: true, earnedScore: weight, status: 'benar' };
    }
  }

  return { isCorrect: false, earnedScore: 0, status: 'salah' };
}

/**
 * Penilaian Soal Uraian (Essay):
 * Mengutamakan skor manual guru jika tersedia, atau pencocokan kata kunci rubrik.
 */
function evaluateUraian(
  studentAns: any,
  keyAns: any,
  weight: number,
  manualScore?: number,
  rubrik?: string
): ExamEvaluationResult {
  // Jika sudah dinilai secara manual oleh guru (0 sampai weight)
  if (typeof manualScore === 'number' && !Number.isNaN(manualScore)) {
    const safeScore = Math.min(weight, Math.max(0, manualScore));
    return {
      isCorrect: safeScore >= weight * 0.75,
      earnedScore: safeScore,
      status: safeScore >= weight ? 'benar' : safeScore > 0 ? 'sebagian' : 'salah',
    };
  }

  if (studentAns === undefined || studentAns === null || cleanStr(studentAns).length === 0) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const userClean = cleanStr(studentAns);
  const keySource = rubrik || String(keyAns || '');
  const keywords = keySource
    .split(/[,;\/\n]+/)
    .map((k) => cleanStr(k))
    .filter((k) => k.length > 2);

  if (keywords.length > 0) {
    let matchedKeywords = 0;
    keywords.forEach((kw) => {
      if (userClean.includes(kw)) {
        matchedKeywords++;
      }
    });

    const ratio = matchedKeywords / keywords.length;
    if (ratio >= 0.8) {
      return { isCorrect: true, earnedScore: weight, status: 'benar' };
    } else if (ratio > 0.2) {
      const partialScore = Math.round(ratio * weight * 100) / 100;
      return {
        isCorrect: false,
        earnedScore: partialScore,
        status: 'sebagian',
        details: { matchedCount: matchedKeywords, totalExpected: keywords.length },
      };
    }
  }

  // Jika jawaban terisi namun belum ada kata kunci otomatis, tandai sebagian/menunggu koreksi guru
  return {
    isCorrect: false,
    earnedScore: 0,
    status: 'sebagian',
    details: { explanation: 'Menunggu penilaian manual oleh guru' },
  };
}

/**
 * Pencocokan Benar / Salah (True / False):
 * Mendukung token tunggal (B/S) maupun multi-pernyataan (Array pernyataan).
 */
function evaluateBenarSalah(
  studentAns: any,
  keyAns: any,
  weight: number,
  questionObj?: any
): ExamEvaluationResult {
  // Multi-pernyataan (Array / Object pernyataan)
  if (Array.isArray(studentAns) || (studentAns && typeof studentAns === 'object' && !('key' in studentAns))) {
    let items = questionObj ? resolveBenarSalahItems(questionObj) : [];
    const studentTokens: Array<'B' | 'S' | ''> = Array.isArray(studentAns)
      ? studentAns.map(parseBenarSalahToken)
      : Object.values(studentAns).map(parseBenarSalahToken);

    let keyTokens: Array<'B' | 'S' | ''> = [];
    if (Array.isArray(keyAns)) {
      keyTokens = keyAns.map(parseBenarSalahToken);
    } else if (keyAns && typeof keyAns === 'object') {
      keyTokens = Object.values(keyAns).map(parseBenarSalahToken);
    } else if (items.length > 0) {
      keyTokens = items.map((it: any) => parseBenarSalahToken(it.jawaban ?? it.kunci));
    } else {
      const parsed = String(keyAns || '').split(/[,;]+/).map(parseBenarSalahToken);
      keyTokens = parsed;
    }

    const total = Math.max(1, keyTokens.length);
    let matched = 0;

    for (let i = 0; i < total; i++) {
      if (studentTokens[i] && keyTokens[i] && studentTokens[i] === keyTokens[i]) {
        matched++;
      }
    }

    const earnedScore = Math.round((matched / total) * weight * 100) / 100;

    if (matched === total) {
      return { isCorrect: true, earnedScore: weight, status: 'benar' };
    } else if (matched > 0) {
      return {
        isCorrect: false,
        earnedScore,
        status: 'sebagian',
        details: { matchedCount: matched, totalExpected: total },
      };
    }

    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  // Token tunggal Benar / Salah
  const sToken = parseBenarSalahToken(studentAns);
  const kToken = parseBenarSalahToken(keyAns);

  if (sToken && kToken && sToken === kToken) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  }

  return { isCorrect: false, earnedScore: 0, status: 'salah' };
}

/**
 * ============================================================================
 * UNIVERSAL EVALUATION DISPATCHER (`evaluateStudentAnswer`)
 * ============================================================================
 * Mendukung pemanggilan fleksibel:
 * 1. `evaluateStudentAnswer(question, studentAnswer, manualScore)`
 * 2. `evaluateStudentAnswer(tipe, studentAnswer, keyAnswer, weight, options, questionObj, manualScore)`
 */
export function evaluateStudentAnswer(
  questionOrType: CBTQuestion | string,
  studentAnswer: any,
  keyAnswerOrManualScore?: any,
  weight?: number,
  options?: string[],
  questionObj?: any,
  manualScore?: number
): ExamEvaluationResult {
  // Bentuk 1: Objek Pertanyaan CBT/TKA
  if (typeof questionOrType === 'object' && questionOrType !== null) {
    const q = questionOrType;
    const tipe = (q.tipe || 'pg').toLowerCase().trim();
    const kunci = q.kunciJawaban ?? '';
    const qWeight = Number(q.bobot || 1);
    const qOptions = q.opsi || [];
    const mScore = typeof keyAnswerOrManualScore === 'number' ? keyAnswerOrManualScore : undefined;

    return runEvaluation(tipe, studentAnswer, kunci, qWeight, qOptions, q, mScore);
  }

  // Bentuk 2: Pemanggilan argumen terpisah
  const tipe = String(questionOrType || 'pg').toLowerCase().trim();
  const kunci = keyAnswerOrManualScore;
  const qWeight = typeof weight === 'number' && weight > 0 ? weight : 1;
  const qOptions = options || [];

  return runEvaluation(tipe, studentAnswer, kunci, qWeight, qOptions, questionObj, manualScore);
}

function runEvaluation(
  tipe: string,
  studentAnswer: any,
  kunci: any,
  weight: number,
  options: string[],
  questionObj?: any,
  manualScore?: number
): ExamEvaluationResult {
  switch (tipe) {
    case 'pg':
    case 'pilihan_ganda':
    case 'mcq':
      return evaluatePG(studentAnswer, kunci, weight, options);

    case 'pg_kompleks':
    case 'kompleks':
    case 'complex_mcq':
    case 'multi':
      return evaluatePGKompleks(studentAnswer, kunci, weight, options);

    case 'menjodohkan':
    case 'matching':
    case 'jodohkan':
      return evaluateMenjodohkan(studentAnswer, kunci, weight, questionObj);

    case 'isian':
    case 'isian_singkat':
    case 'short_answer':
    case 'isian_teks':
      return evaluateIsianSingkat(studentAnswer, kunci, weight);

    case 'uraian':
    case 'essay':
    case 'deskripsi':
      return evaluateUraian(studentAnswer, kunci, weight, manualScore, questionObj?.rubrik);

    case 'benar_salah':
    case 'bs':
    case 'true_false':
      return evaluateBenarSalah(studentAnswer, kunci, weight, questionObj);

    default:
      return evaluatePG(studentAnswer, kunci, weight, options);
  }
}

/**
 * Menghitung total skor ujian, persentase akhir (0-100), dan status per butir soal
 */
export function calculateTotalExamScore(
  questions: CBTQuestion[],
  answersMap: Record<string, any>,
  manualScoresMap?: Record<string, number>
): {
  rawScore: number;
  maxScore: number;
  finalScore: number;
  correctCount: number;
  wrongCount: number;
  partialCount: number;
  itemResults: Record<string, boolean>;
  itemScores: Record<string, number>;
  itemStatuses: Record<string, 'benar' | 'sebagian' | 'salah'>;
} {
  let rawScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let partialCount = 0;
  const itemResults: Record<string, boolean> = {};
  const itemScores: Record<string, number> = {};
  const itemStatuses: Record<string, 'benar' | 'sebagian' | 'salah'> = {};

  (questions || []).forEach((q) => {
    const weight = Number(q.bobot || 1);
    maxScore += weight;
    const ans = answersMap ? answersMap[q.id] : undefined;
    const mScore = manualScoresMap ? manualScoresMap[q.id] : undefined;

    const res = evaluateStudentAnswer(q, ans, mScore);
    itemResults[q.id] = res.isCorrect;
    itemScores[q.id] = res.earnedScore;
    itemStatuses[q.id] = res.status;

    rawScore += res.earnedScore;
    if (res.status === 'benar') {
      correctCount++;
    } else if (res.status === 'sebagian') {
      partialCount++;
    } else {
      wrongCount++;
    }
  });

  const finalScore = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;

  return {
    rawScore: Math.round(rawScore * 100) / 100,
    maxScore,
    finalScore,
    correctCount,
    wrongCount,
    partialCount,
    itemResults,
    itemScores,
    itemStatuses,
  };
}
