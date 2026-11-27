import { CBTQuestion } from '../types';
import {
  mergeQuestionsWithAnswerKeys,
  SeparatedAnswerKeyEntry,
} from './examAnswerKeyFirestore';
import {
  resolveBenarSalahItems,
  resolveMenjodohkanData,
  stripQuestionTags,
} from './questionFormat';

/**
 * ============================================================================
 * SERBU 21 - Universal Exam Engine & Standardized Evaluation Engine (v5.0.2)
 * ============================================================================
 * Mesin penilaian universal tunggal untuk seluruh 6 tipe soal CBT & TKA:
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

const STOPWORDS_ID = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'adalah',
  'yaitu', 'sebagai', 'karena', 'atau', 'agar', 'oleh', 'dalam', 'ini',
  'itu', 'tersebut', 'dapat', 'bisa', 'akan', 'telah', 'sudah', 'serta',
  'juga', 'jika', 'maka', 'saat', 'ketika', 'antara', 'sehingga', 'secara',
  'lebih', 'paling', 'tidak', 'bukan', 'hanya', 'harus', 'cara', 'hal',
]);

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

function stripLeadingOptionPrefix(str: string): string {
  return String(str || '').trim().replace(/^[a-fA-F][\.\)]\s+/, '').trim();
}

function cleanOptionForCompare(val: any): string {
  return cleanStr(stripQuestionTags(stripLeadingOptionPrefix(String(val ?? ''))));
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
 * Menyamakan tanda desimal koma (,) dan titik (.), pemisah ribuan Indonesia, serta pecahan sederhana
 */
export function normalizeNumericStr(val: any): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim().toLowerCase();
  if (!str) return '';
  // Tangani format ribuan Indonesia seperti "1.500", "1.500.000", atau "1,500"
  if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
    str = str.replace(/\./g, '');
  } else if (/^\d{1,3}(,\d{3})+$/.test(str)) {
    str = str.replace(/,/g, '');
  } else {
    // Normalisasi desimal koma ke titik (contoh "0,75" -> "0.75")
    str = str.replace(/,/g, '.');
  }
  return str;
}

function parseNumericOrFractionValue(val: any): number | null {
  const raw = String(val ?? '')
    .replace(/\[(?:pecahan|frac)\]([\s\S]*?)\[\/(?:pecahan|frac)\]/gi, '$1')
    .trim();
  if (!raw) return null;

  // Pecahan campuran: e.g. "1 1/2" atau "-2 3/4"
  const mixed = raw.match(/^([+-]?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = parseFloat(mixed[1]);
    const num = parseFloat(mixed[2]);
    const den = parseFloat(mixed[3]);
    if (den !== 0) {
      return whole >= 0 ? whole + num / den : whole - num / den;
    }
  }

  // Pecahan biasa: e.g. "3/4"
  const frac = raw.match(/^([+-]?\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    if (den !== 0) return num / den;
  }

  const norm = normalizeNumericStr(raw);
  if (/^[+-]?\d+(\.\d+)?$/.test(norm)) {
    const parsed = parseFloat(norm);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Ekstraksi token teks & opsi huruf dari nilai jawaban/kunci
 */
export function extractOptionKeyAndText(ans: any): { key: string; text: string } {
  if (ans && typeof ans === 'object' && !Array.isArray(ans)) {
    const rawKey = cleanStr(ans.key ?? ans.opsiKey ?? ans.id ?? '');
    const rawText = cleanStr(ans.text ?? ans.jawaban ?? ans.label ?? '');
    return {
      key: rawKey,
      text: rawText || rawKey,
    };
  }
  const str = String(ans ?? '').trim();
  const match = str.match(/^([A-Fa-f])[\.\:\)\-]\s+(.+)$/);
  if (match) {
    return {
      key: match[1].toLowerCase(),
      text: cleanStr(match[2]),
    };
  }
  const singleLetterMatch = str.match(/^([A-Fa-f])[\.\)]?$/);
  if (singleLetterMatch) {
    return {
      key: singleLetterMatch[1].toLowerCase(),
      text: singleLetterMatch[1].toLowerCase(),
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
  const list: string[] = [];
  const seen = new Set<string>();

  const pushToken = (t: string) => {
    const cleaned = cleanStr(t);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      list.push(cleaned);
    }
  };

  if (Array.isArray(val)) {
    val.forEach((item) => {
      if (item && typeof item === 'object') {
        const ext = extractOptionKeyAndText(item);
        // Utamakan text opsi agar tahan pengacakan opsi, atau key jika text kosong
        pushToken(ext.text || ext.key);
      } else {
        const str = String(item ?? '').trim();
        if (str) pushToken(str);
      }
    });
  } else if (typeof val === 'object') {
    Object.entries(val).forEach(([k, v]) => {
      if (v === true || v === 1 || v === '1' || v === 'true' || cleanStr(v) === 'benar') {
        pushToken(k);
      } else if (v && typeof v === 'string') {
        pushToken(v);
      } else if (v && typeof v === 'object') {
        const ext = extractOptionKeyAndText(v);
        pushToken(ext.text || ext.key);
      }
    });
  } else {
    const str = String(val).trim();
    if (str) {
      // Hanya pecah dengan '/' jika formatnya huruf opsi seperti "A/C" atau "A / B / D"
      const isLetterSlashList = /^[a-fA-F](\s*\/\s*[a-fA-F])+$/.test(str);
      const parts = isLetterSlashList ? str.split(/\s*\/\s*/) : str.split(/[,;\n|]+/);
      parts.forEach((part) => {
        const trimmed = part.trim();
        if (trimmed) pushToken(trimmed);
      });
    }
  }

  return list;
}

/**
 * Normalisasi token Benar / Salah ke standar huruf kapital 'B' atau 'S'
 */
export function parseBenarSalahToken(val: any): 'B' | 'S' | '' {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'object' && !Array.isArray(val)) {
    const unwrapped = val.jawaban ?? val.kunci ?? val.text ?? val.label ?? val.key;
    if (unwrapped !== undefined) return parseBenarSalahToken(unwrapped);
    return '';
  }
  if (val === true || val === 1 || val === '1') return 'B';
  if (val === false || val === 0 || val === '0') return 'S';

  let c = cleanStr(val);
  if (!c) return '';

  // Hapus awalan nomor pernyataan, mis. "1. Benar", "2) Salah", "3: B", "4 - S"
  c = c.replace(/^\d+\s*[\.\)\-:]\s*/, '').trim();
  // Hapus awalan huruf opsi jika diikuti kata Benar/Salah, mis. "A. Benar", "B. Salah"
  c = c.replace(/^[a-f]\s*[\.\)]\s*(?=(?:benar|salah|true|false|ya|tidak)\b)/i, '').trim();

  if (['b', 'benar', 'true', 'ya', 'yes', 't', 'tul', 'betul', 'v', '✓'].includes(c)) return 'B';
  if (['s', 'salah', 'false', 'tidak', 'no', 'f', 'x', '✗'].includes(c)) return 'S';
  return '';
}

function splitPairString(pair: string): [string, string] | null {
  const trimmed = String(pair || '').trim();
  if (!trimmed) return null;
  // Utamakan pemisah panah, titik dua, atau sama dengan agar kata ber-tanda hubung tidak terpotong
  const explicitMatch = trimmed.match(/^(.+?)\s*(?:->|→|=>|[:=])\s*(.+)$/);
  if (explicitMatch) {
    return [explicitMatch[1].trim(), explicitMatch[2].trim()];
  }
  // Pemisah '-' untuk pola nomor atau teks (gunakan pemisah paling akhir jika ada spasi atau angka)
  const numberedDash = trimmed.match(/^(\d+)\s*-\s*(.+)$/);
  if (numberedDash) {
    return [numberedDash[1].trim(), numberedDash[2].trim()];
  }
  const spacedDash = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
  if (spacedDash) {
    return [spacedDash[1].trim(), spacedDash[2].trim()];
  }
  const lastDashIdx = trimmed.lastIndexOf('-');
  if (lastDashIdx > 0 && lastDashIdx < trimmed.length - 1) {
    return [trimmed.slice(0, lastDashIdx).trim(), trimmed.slice(lastDashIdx + 1).trim()];
  }
  return null;
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
      if (cleanK && cleanV) result[cleanK] = cleanV;
    });
    return result;
  }

  if (Array.isArray(val)) {
    val.forEach((item) => {
      if (Array.isArray(item) && item.length >= 2) {
        const cleanK = cleanStr(item[0]);
        const cleanV = cleanStr(item[1]);
        if (cleanK && cleanV) result[cleanK] = cleanV;
      } else if (typeof item === 'object' && item) {
        const k = cleanStr(item.premis || item.left || item.kunci || item.q || '');
        const v = cleanStr(item.respon || item.right || item.jawaban || item.a || '');
        if (k && v) result[k] = v;
      } else if (typeof item === 'string') {
        const split = splitPairString(item);
        if (split) {
          const cleanK = cleanStr(split[0]);
          const cleanV = cleanStr(split[1]);
          if (cleanK && cleanV) result[cleanK] = cleanV;
        }
      }
    });
    return result;
  }

  if (typeof val === 'string') {
    val.split(/[,;\n]+/).forEach((pair) => {
      const split = splitPairString(pair);
      if (split) {
        const cleanK = cleanStr(split[0]);
        const cleanV = cleanStr(split[1]);
        if (cleanK && cleanV) result[cleanK] = cleanV;
      }
    });
  }

  return result;
}

/**
 * Pencocokan Pilihan Ganda (PG):
 * Menyamakan huruf opsi (A-F), objek { key, text }, indeks angka (0-5), dan teks opsi.
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

  const sExt = extractOptionKeyAndText(studentAns);
  const kExt = extractOptionKeyAndText(keyAns);

  if (!sExt.key && !sExt.text) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const safeOptions = Array.isArray(options) ? options : [];
  const cleanOptions = safeOptions.map((o) => cleanStr(o));
  const strippedOptions = safeOptions.map((o) => cleanOptionForCompare(o));

  const findOptionIndex = (textVal: string): number => {
    const tRaw = cleanStr(textVal);
    const tStripped = cleanOptionForCompare(textVal);
    if (!tRaw && !tStripped) return -1;
    return safeOptions.findIndex((_, i) => {
      const optRaw = cleanOptions[i];
      const optStripped = strippedOptions[i];
      return (
        (tRaw && optRaw === tRaw) ||
        (tStripped && optStripped === tStripped) ||
        (tStripped && optRaw === tStripped)
      );
    });
  };

  const resolveToken = (
    val: any,
    ext: { key: string; text: string }
  ): { letter: string; text: string; strippedText: string; index: number } => {
    // Jika objek punya text non-huruf, prioritaskan pencocokan teksnya agar aman terhadap Acak Jawaban
    const isLetterKey = /^[a-f]$/i.test(ext.key);
    const isIndexKey = /^[0-5]$/.test(ext.key);
    const hasDistinctText = Boolean(ext.text && ext.text !== ext.key);

    if (hasDistinctText) {
      const idxByText = findOptionIndex(ext.text);
      if (idxByText >= 0) {
        return {
          letter: String.fromCharCode(65 + idxByText),
          text: cleanOptions[idxByText],
          strippedText: strippedOptions[idxByText],
          index: idxByText,
        };
      }
      return {
        letter: isLetterKey ? ext.key.toUpperCase() : '',
        text: ext.text,
        strippedText: cleanOptionForCompare(ext.text),
        index: isLetterKey ? ext.key.toUpperCase().charCodeAt(0) - 65 : -1,
      };
    }

    const cl = cleanStr(typeof val === 'object' ? ext.key || ext.text : val);
    if (/^[a-f][\.\)]?$/i.test(cl)) {
      const ltr = cl.charAt(0).toUpperCase();
      const idx = ltr.charCodeAt(0) - 65;
      return {
        letter: ltr,
        text: cleanOptions[idx] || ext.text || ltr.toLowerCase(),
        strippedText: strippedOptions[idx] || cleanOptionForCompare(ext.text || ltr),
        index: idx,
      };
    }

    if (/^[0-5]$/.test(cl)) {
      const idx = parseInt(cl, 10);
      const ltr = String.fromCharCode(65 + idx);
      return {
        letter: ltr,
        text: cleanOptions[idx] || '',
        strippedText: strippedOptions[idx] || '',
        index: idx,
      };
    }

    const idx = findOptionIndex(ext.text || cl);
    if (idx >= 0) {
      return {
        letter: String.fromCharCode(65 + idx),
        text: cleanOptions[idx],
        strippedText: strippedOptions[idx],
        index: idx,
      };
    }

    return {
      letter: ext.key && /^[a-f]$/i.test(ext.key) ? ext.key.toUpperCase() : '',
      text: ext.text || cl,
      strippedText: cleanOptionForCompare(ext.text || cl),
      index: -1,
    };
  };

  const sRes = resolveToken(studentAns, sExt);
  const kRes = resolveToken(keyAns, kExt);

  // 1. Jika keduanya bisa dipetakan ke teks opsi spesifik, bandingkan teks bersih atau huruf indeks
  if (
    (sRes.strippedText && kRes.strippedText && sRes.strippedText === kRes.strippedText) ||
    (sRes.text && kRes.text && sRes.text === kRes.text)
  ) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  }

  // 2. Bandingkan huruf opsi (A-F) atau indeks numerik (0-5)
  if (sRes.letter && kRes.letter && sRes.letter === kRes.letter) {
    // Jika opsi tersedia dan siswa mengirim { key, text } yg teksnya berbeda dari opsi kunci (bukan kasus huruf murni), pastikan konsisten
    if (
      studentAns &&
      typeof studentAns === 'object' &&
      sExt.text &&
      sExt.text !== sExt.key &&
      kRes.strippedText &&
      sRes.strippedText !== kRes.strippedText &&
      findOptionIndex(sExt.text) >= 0
    ) {
      return { isCorrect: false, earnedScore: 0, status: 'salah' };
    }
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  }

  if (sRes.index >= 0 && kRes.index >= 0 && sRes.index === kRes.index) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  }

  return { isCorrect: false, earnedScore: 0, status: 'salah' };
}

/**
 * Pencocokan Pilihan Ganda Kompleks:
 * Menormalisasi token (huruf A-F, indeks 0-5, atau teks opsi) lalu menghitung skor proporsional net.
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

  const safeOptions = Array.isArray(options) ? options : [];
  const cleanOptions = safeOptions.map((o) => cleanStr(o));
  const strippedOptions = safeOptions.map((o) => cleanOptionForCompare(o));

  const normalizeTokenList = (tokens: string[]): string[] => {
    return tokens.map((t) => {
      const ext = extractOptionKeyAndText(t);
      const cl = cleanStr(t);
      const stripped = cleanOptionForCompare(t);

      // Cek kecocokan terhadap daftar opsi dulu jika teks opsi tersedia
      if (safeOptions.length > 0 && ext.text && ext.text !== ext.key) {
        const idxByText = safeOptions.findIndex(
          (_, i) => cleanOptions[i] === ext.text || strippedOptions[i] === cleanOptionForCompare(ext.text)
        );
        if (idxByText >= 0) return String.fromCharCode(65 + idxByText);
      }

      if (/^[a-f][\.\)]?$/i.test(cl)) return cl.charAt(0).toUpperCase();
      if (/^[0-5]$/.test(cl)) return String.fromCharCode(65 + parseInt(cl, 10));

      if (safeOptions.length > 0) {
        const idx = safeOptions.findIndex(
          (_, i) =>
            cleanOptions[i] === cl ||
            (stripped && strippedOptions[i] === stripped) ||
            (stripped && cleanOptions[i] === stripped)
        );
        if (idx >= 0) return String.fromCharCode(65 + idx);
      }

      if (ext.key && /^[a-f]$/i.test(ext.key) && ext.text !== ext.key) {
        return ext.key.toUpperCase();
      }
      return stripped || cl;
    });
  };

  const normStudent = Array.from(new Set(normalizeTokenList(studentTokens))).sort();
  const normKey = Array.from(new Set(normalizeTokenList(keyTokens))).sort();

  if (
    normStudent.length === normKey.length &&
    normStudent.every((val, idx) => val === normKey[idx])
  ) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  }

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
 * Mendukung struktur `menjodohkanData` (kolomKiri, kolomKanan, pasangan) maupun string/array pasangan.
 */
function evaluateMenjodohkan(
  studentAns: any,
  keyAns: any,
  weight: number,
  questionObj?: any
): ExamEvaluationResult {
  if (studentAns === undefined || studentAns === null || studentAns === '') {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const studentMap = parseMatchingPairsMap(studentAns);
  if (Object.keys(studentMap).length === 0) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const studentLookupByCondensed: Record<string, string> = {};
  Object.entries(studentMap).forEach(([k, v]) => {
    const ck = normalizeCondensed(k);
    if (ck) studentLookupByCondensed[ck] = v;
  });

  // 1. Evaluasi berbasis `resolveMenjodohkanData` (kolomKiri + kolomKanan + pasangan Record<string, string>)
  let matchData: ReturnType<typeof resolveMenjodohkanData> = null;
  try {
    matchData = resolveMenjodohkanData({
      menjodohkanData: questionObj?.menjodohkanData,
      kunciJawaban: keyAns ?? questionObj?.kunciJawaban,
    });
  } catch {
    matchData = null;
  }

  if (
    matchData &&
    Array.isArray(matchData.kolomKiri) &&
    matchData.kolomKiri.length > 0 &&
    matchData.pasangan &&
    Object.keys(matchData.pasangan).length > 0
  ) {
    const totalPairs = matchData.kolomKiri.length;
    let matchedPairs = 0;

    matchData.kolomKiri.forEach((leftLabel, idx) => {
      const numKey = String(idx + 1);
      const zeroKey = String(idx);
      const cleanLeft = cleanStr(leftLabel);
      const condLeft = normalizeCondensed(leftLabel);

      const rawExpected = String(matchData!.pasangan[numKey] ?? matchData!.pasangan[zeroKey] ?? '').trim();
      if (!rawExpected) return;

      const expLetterClean = cleanStr(rawExpected).replace(/[\.\)]$/, '');
      const isExpSingleLetter = /^[a-z]$/.test(expLetterClean);
      const expIdx = isExpSingleLetter ? expLetterClean.charCodeAt(0) - 97 : -1;
      const expRightText =
        expIdx >= 0 && matchData!.kolomKanan[expIdx]
          ? cleanStr(matchData!.kolomKanan[expIdx])
          : cleanStr(rawExpected);

      const rawActual =
        studentMap[numKey] ??
        studentMap[zeroKey] ??
        studentMap[cleanLeft] ??
        (condLeft ? studentLookupByCondensed[condLeft] : undefined);

      if (!rawActual) return;

      const actClean = cleanStr(rawActual).replace(/[\.\)]$/, '');
      const isActLetter = /^[a-z]$/.test(actClean);
      const actIdx = isActLetter ? actClean.charCodeAt(0) - 97 : -1;
      const actRightText =
        actIdx >= 0 && matchData!.kolomKanan[actIdx]
          ? cleanStr(matchData!.kolomKanan[actIdx])
          : actClean;

      const letterMatched = isExpSingleLetter && isActLetter && actClean === expLetterClean;
      const textMatched =
        Boolean(expRightText) &&
        (actRightText === expRightText ||
          actClean === expRightText ||
          normalizeCondensed(actRightText) === normalizeCondensed(expRightText));

      if (letterMatched || textMatched) {
        matchedPairs++;
      }
    });

    const earnedScore = Math.round((matchedPairs / totalPairs) * weight * 100) / 100;
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

  // 2. Fallback berbasis keyMap langsung (misal "1-B, 2-A" tanpa menjodohkanData)
  const keyMap = parseMatchingPairsMap(keyAns);
  const keyKeys = Object.keys(keyMap);
  if (keyKeys.length === 0) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const totalPairs = keyKeys.length;
  let matchedPairs = 0;
  keyKeys.forEach((k) => {
    const expectedVal = cleanStr(keyMap[k]);
    const actualVal =
      studentMap[k] ??
      studentLookupByCondensed[normalizeCondensed(k)];
    if (actualVal !== undefined && actualVal !== '') {
      if (
        cleanStr(actualVal) === expectedVal ||
        normalizeCondensed(actualVal) === normalizeCondensed(expectedVal)
      ) {
        matchedPairs++;
      }
    }
  });

  const earnedScore = Math.round((matchedPairs / totalPairs) * weight * 100) / 100;
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
 * Mendukung alternatif pemisah (/, |, ;), pecahan (3/4 === 0,75 === 0.75), desimal koma/titik, & condensed.
 */
function evaluateIsianSingkat(
  studentAns: any,
  keyAns: any,
  weight: number
): ExamEvaluationResult {
  if (studentAns === undefined || studentAns === null || studentAns === '') {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const userRaw = typeof studentAns === 'object'
    ? String(studentAns.text ?? studentAns.jawaban ?? studentAns.key ?? '')
    : String(studentAns);
  const userClean = cleanStr(userRaw);
  const userNumStr = normalizeNumericStr(userRaw);
  const userNumVal = parseNumericOrFractionValue(userRaw);
  const userCondensed = normalizeCondensed(userRaw);

  if (!userClean) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const checkSingleKey = (rawK: any): boolean => {
    const keyClean = cleanStr(rawK);
    if (!keyClean) return false;
    const keyNumStr = normalizeNumericStr(rawK);
    const keyNumVal = parseNumericOrFractionValue(rawK);
    const keyCondensed = normalizeCondensed(rawK);

    // 1. Pencocokan teks langsung
    if (userClean === keyClean) return true;

    // 2. Pencocokan numerik / pecahan ("0,75" === "0.75" === "3/4" / "1.500" === "1500")
    if (userNumStr && keyNumStr && userNumStr === keyNumStr) return true;
    if (userNumVal !== null && keyNumVal !== null && Math.abs(userNumVal - keyNumVal) < 0.0001) {
      return true;
    }

    // 3. Pencocokan teks padat
    if (userCondensed && keyCondensed && userCondensed === keyCondensed) return true;
    return false;
  };

  // Cek seluruh kunci terlebih dahulu (penting jika kunci berupa pecahan tunggal seperti "3/4")
  if (!Array.isArray(keyAns) && checkSingleKey(keyAns)) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  }

  const rawKeys: any[] = Array.isArray(keyAns)
    ? keyAns
    : (() => {
        const s = String(keyAns || '').trim();
        // Jangan pecah pecahan tunggal seperti "3/4" atau "1 1/2"
        if (/^(?:[+-]?\d+\s+)?[+-]?\d+\s*\/\s*\d+$/.test(s)) {
          return [s];
        }
        return s.split(/[\/|;]+/);
      })();

  for (const rawK of rawKeys) {
    if (checkSingleKey(rawK)) {
      return { isCorrect: true, earnedScore: weight, status: 'benar' };
    }
  }

  return { isCorrect: false, earnedScore: 0, status: 'salah' };
}

/**
 * Penilaian Soal Uraian (Essay):
 * Mengutamakan skor manual guru jika tersedia, atau pencocokan kata kunci rubrik & konten inti.
 */
function evaluateUraian(
  studentAns: any,
  keyAns: any,
  weight: number,
  manualScore?: number,
  rubrik?: string
): ExamEvaluationResult {
  if (typeof manualScore === 'number' && !Number.isNaN(manualScore)) {
    const safeScore = Math.min(weight, Math.max(0, manualScore));
    return {
      isCorrect: safeScore >= weight * 0.75,
      earnedScore: safeScore,
      status: safeScore >= weight ? 'benar' : safeScore > 0 ? 'sebagian' : 'salah',
    };
  }

  const rawAns =
    studentAns && typeof studentAns === 'object'
      ? String(studentAns.text ?? studentAns.jawaban ?? studentAns.key ?? '')
      : String(studentAns ?? '');
  const userClean = cleanStr(rawAns);
  if (userClean.length === 0) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const keySource = String(rubrik || keyAns || '').trim();
  const cleanKeySource = cleanStr(keySource);

  // Jika tidak ada rubrik spesifik atau masih berupa teks placeholder bawaan
  if (!cleanKeySource || cleanKeySource === 'rubrik penilaian uraian') {
    if (userClean.length >= 5) {
      return { isCorrect: true, earnedScore: weight, status: 'benar' };
    }
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  if (userClean === cleanKeySource || normalizeCondensed(userClean) === normalizeCondensed(cleanKeySource)) {
    return { isCorrect: true, earnedScore: weight, status: 'benar' };
  }

  const rawSegments = keySource
    .split(/[,;\/\n]+/)
    .map((s) => cleanStr(s))
    .filter((s) => s.length >= 2);
  const segWordCounts = rawSegments.map((s) => s.split(/\s+/).length);
  const avgWords =
    segWordCounts.length > 0
      ? segWordCounts.reduce((acc, c) => acc + c, 0) / segWordCounts.length
      : 99;
  const maxWords = segWordCounts.length > 0 ? Math.max(...segWordCounts) : 99;

  // Jika guru menuliskan daftar kata kunci singkat (misal: "matahari, air, oksigen"), gunakan segmen langsung;
  // jika berupa kalimat jawaban penuh, ekstrak kata-kata bermakna (>= 4 huruf & bukan stopword).
  let keywords: string[] = [];
  if (rawSegments.length > 1 && avgWords <= 3 && maxWords <= 4) {
    keywords = rawSegments.filter((k) => k.length >= 2);
  } else {
    const words = cleanKeySource
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS_ID.has(w));
    keywords = Array.from(new Set(words));
    if (keywords.length === 0) {
      keywords = rawSegments;
    }
  }

  const isExplicitKeywordList = rawSegments.length > 1 && avgWords <= 3 && maxWords <= 4;
  if (keywords.length > 0) {
    const matchedKeywords = keywords.filter((kw) => userClean.includes(kw)).length;
    const ratio = matchedKeywords / keywords.length;
    const fullThreshold = isExplicitKeywordList ? 0.75 : 0.65;

    if (ratio >= fullThreshold) {
      return { isCorrect: true, earnedScore: weight, status: 'benar' };
    } else if (matchedKeywords > 0) {
      const scaled = Math.min(weight, Math.round((ratio / fullThreshold) * weight * 100) / 100);
      return {
        isCorrect: ratio >= 0.5,
        earnedScore: scaled,
        status: ratio >= 0.5 ? 'benar' : 'sebagian',
        details: { matchedCount: matchedKeywords, totalExpected: keywords.length },
      };
    }
  }

  return { isCorrect: false, earnedScore: 0, status: 'salah' };
}

/**
 * Pencocokan Benar / Salah (True / False):
 * Mendukung multi-pernyataan berbasis ID baris (`bs_1`, `bs_xxx`), indeks (0/1-based), array, dan token tunggal.
 * Menghindari bug urutan kunci `Object.values()` dan mendukung format kunci bernomor ("1. Benar", "2. Salah").
 */
function evaluateBenarSalah(
  studentAns: any,
  keyAns: any,
  weight: number,
  questionObj?: any,
  options: string[] = []
): ExamEvaluationResult {
  if (studentAns === undefined || studentAns === null || studentAns === '') {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }
  if (Array.isArray(studentAns) && studentAns.length === 0) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }
  if (
    typeof studentAns === 'object' &&
    !Array.isArray(studentAns) &&
    Object.keys(studentAns).length === 0
  ) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  const effectiveOptions = questionObj?.opsi || options || [];
  const effectiveKey = keyAns ?? questionObj?.kunciJawaban;

  const isLegacyChoiceOpsi =
    Array.isArray(effectiveOptions) &&
    effectiveOptions.length === 2 &&
    effectiveOptions.every((o: string) =>
      /^(?:[a-b][\.\)]\s*)?(benar|salah)$/i.test(String(o || '').trim())
    );

  const resolveLegacyChoiceToken = (val: any): 'B' | 'S' | '' => {
    const direct = parseBenarSalahToken(val);
    if (direct) return direct;
    if (isLegacyChoiceOpsi) {
      const ext = extractOptionKeyAndText(val);
      if (ext.key === 'a') return parseBenarSalahToken(effectiveOptions[0]);
      if (ext.key === 'b') return parseBenarSalahToken(effectiveOptions[1]);
    }
    return '';
  };

  // 1. Kumpulkan daftar pernyataan & kunci yang diharapkan
  const resolvedItems = resolveBenarSalahItems({
    benarSalahItems: questionObj?.benarSalahItems,
    opsi: effectiveOptions,
    kunciJawaban: effectiveKey,
  });

  interface ExpectedBSItem {
    id: string;
    numKey: string;
    zeroKey: string;
    token: 'B' | 'S';
  }

  let expectedItems: ExpectedBSItem[] = [];

  if (resolvedItems.length > 0) {
    expectedItems = resolvedItems
      .map((it, idx) => ({
        id: it.id || `bs_${idx + 1}`,
        numKey: String(idx + 1),
        zeroKey: String(idx),
        token: parseBenarSalahToken(it.kunci),
      }))
      .filter((it): it is ExpectedBSItem => it.token === 'B' || it.token === 'S');
  } else if (Array.isArray(effectiveKey)) {
    expectedItems = effectiveKey
      .map((k, idx) => {
        const numMatch = String(k ?? '').trim().match(/^(\d+)\s*[\.\)\-:]/);
        const numKey = numMatch ? numMatch[1] : String(idx + 1);
        return {
          id: `bs_${numKey}`,
          numKey,
          zeroKey: String(Number(numKey) - 1),
          token: parseBenarSalahToken(k),
        };
      })
      .filter((it): it is ExpectedBSItem => it.token === 'B' || it.token === 'S');
  } else if (effectiveKey && typeof effectiveKey === 'object') {
    expectedItems = Object.entries(effectiveKey)
      .map(([k, v], idx) => ({
        id: k,
        numKey: String(idx + 1),
        zeroKey: String(idx),
        token: parseBenarSalahToken(v),
      }))
      .filter((it): it is ExpectedBSItem => it.token === 'B' || it.token === 'S');
  } else {
    const keyStr = String(effectiveKey ?? '').trim();
    if (isLegacyChoiceOpsi && /^[a-b][\.\)]?$/i.test(keyStr)) {
      const tok = resolveLegacyChoiceToken(keyStr);
      if (tok) {
        expectedItems = [{ id: 'bs_1', numKey: '1', zeroKey: '0', token: tok }];
      }
    } else if (keyStr) {
      const parts = keyStr.split(/[,;\n|]+/).map((p) => p.trim()).filter(Boolean);
      expectedItems = parts
        .map((p, idx) => {
          const numMatch = p.match(/^(\d+)\s*[\.\)\-:]/);
          const numKey = numMatch ? numMatch[1] : String(idx + 1);
          return {
            id: `bs_${numKey}`,
            numKey,
            zeroKey: String(Number(numKey) - 1),
            token: parseBenarSalahToken(p),
          };
        })
        .filter((it): it is ExpectedBSItem => it.token === 'B' || it.token === 'S');
    }
  }

  if (expectedItems.length === 0) {
    return { isCorrect: false, earnedScore: 0, status: 'salah' };
  }

  // 2. Cocokkan jawaban siswa terhadap setiap item berdasarkan ID / nomor urut (bukan Object.values order)
  const isPlainObj = typeof studentAns === 'object' && !Array.isArray(studentAns);
  const studentObjEntries = isPlainObj ? Object.entries(studentAns as Record<string, any>) : [];
  const normalizedStudentObj: Record<string, any> = {};
  studentObjEntries.forEach(([k, v]) => {
    normalizedStudentObj[k] = v;
    normalizedStudentObj[cleanStr(k)] = v;
  });

  // Jika jawaban string berisi beberapa nilai ("1. Benar, 2. Salah" atau "B, S")
  const studentStringParts: Array<{ numKey?: string; raw: string }> =
    typeof studentAns === 'string'
      ? studentAns
          .split(/[,;\n|]+/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => {
            const m = p.match(/^(\d+)\s*[\.\)\-:]/);
            return { numKey: m ? m[1] : undefined, raw: p };
          })
      : [];

  let matched = 0;
  const total = expectedItems.length;

  expectedItems.forEach((exp, idx) => {
    let rawStudentVal: any = undefined;

    if (isPlainObj) {
      if (exp.id in studentAns) rawStudentVal = studentAns[exp.id];
      else if (cleanStr(exp.id) in normalizedStudentObj) rawStudentVal = normalizedStudentObj[cleanStr(exp.id)];
      else if (`bs_${exp.numKey}` in studentAns) rawStudentVal = studentAns[`bs_${exp.numKey}`];
      else if (exp.numKey in studentAns) rawStudentVal = studentAns[exp.numKey];
      else if (exp.zeroKey in studentAns) rawStudentVal = studentAns[exp.zeroKey];
      else if (total === 1 && ('key' in studentAns || 'text' in studentAns || 'jawaban' in studentAns)) {
        rawStudentVal = studentAns;
      } else if (total === 1 && studentObjEntries.length === 1) {
        rawStudentVal = studentObjEntries[0][1];
      }
    } else if (Array.isArray(studentAns)) {
      const byNum = studentAns.find((item) => {
        const m = String(item ?? '').trim().match(/^(\d+)\s*[\.\)\-:]/);
        return m && m[1] === exp.numKey;
      });
      rawStudentVal = byNum !== undefined ? byNum : studentAns[idx];
    } else if (total === 1) {
      rawStudentVal = studentAns;
    } else if (studentStringParts.length > 0) {
      const byNum = studentStringParts.find((p) => p.numKey === exp.numKey);
      rawStudentVal = byNum ? byNum.raw : studentStringParts[idx]?.raw;
    }

    const sToken = resolveLegacyChoiceToken(rawStudentVal);
    if (sToken && sToken === exp.token) {
      matched++;
    }
  });

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
    const qWeight = Number(q.bobot) > 0 ? Number(q.bobot) : 10;
    const qOptions = q.opsi || [];
    const mScore = typeof keyAnswerOrManualScore === 'number' ? keyAnswerOrManualScore : undefined;

    return runEvaluation(tipe, studentAnswer, kunci, qWeight, qOptions, q, mScore);
  }

  // Bentuk 2: Pemanggilan argumen terpisah
  const tipe = String(questionOrType || 'pg').toLowerCase().trim();
  const kunci = keyAnswerOrManualScore;
  const qWeight = typeof weight === 'number' && weight > 0 ? weight : 10;
  const qOptions = options || questionObj?.opsi || [];

  return runEvaluation(tipe, studentAnswer, kunci, qWeight, qOptions, questionObj, manualScore);
}

/**
 * Mengevaluasi jawaban siswa dengan menggabungkan butir soal bersih dan entri kunci jawaban terproteksi.
 */
export function evaluateStudentAnswerWithSeparatedKey(
  question: CBTQuestion,
  studentAnswer: any,
  separatedKey?: SeparatedAnswerKeyEntry | null,
  manualScore?: number
): ExamEvaluationResult {
  const merged = separatedKey
    ? mergeQuestionsWithAnswerKeys([question], { [question.id]: separatedKey })[0]
    : question;
  return evaluateStudentAnswer(merged, studentAnswer, manualScore);
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
      return evaluateBenarSalah(studentAnswer, kunci, weight, questionObj, options);

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
    const weight = Number(q.bobot) > 0 ? Number(q.bobot) : 10;
    maxScore += weight;
    const ans = answersMap ? answersMap[q.id] : undefined;
    const mScore = manualScoresMap ? manualScoresMap[q.id] : undefined;

    const res = evaluateStudentAnswer({ ...q, bobot: weight }, ans, mScore);
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
