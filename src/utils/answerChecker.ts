import { CBTQuestion } from '../types';
import { resolveBenarSalahItems, resolveMenjodohkanData } from './questionFormat';

/**
 * Universal Answer Checker Utility for CBT and TKA (SERBU 21)
 * Handles case-insensitivity, whitespace-insensitivity, slash-delimited alternative answers,
 * multi-select complex MCQs, matching pairs, true/false statements, and short answers.
 */

export { cleanStr, evaluateStudentAnswer } from './examEngine';

export const normalizeString = (str: any): string => {
  if (str === undefined || str === null) return '';
  return String(str).trim().toLowerCase();
};

export const normalizeCondensed = (str: any): string => {
  if (str === undefined || str === null) return '';
  return String(str).toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
};

export const normalizeNumberString = (str: any): string => {
  if (str === undefined || str === null) return '';
  return String(str).trim().toLowerCase().replace(/,/g, '.');
};

export const checkIsianAnswer = (
  studentAnswer: any,
  keyAnswer: string | string[]
): boolean => {
  if (studentAnswer === undefined || studentAnswer === null || studentAnswer === '') return false;
  const userAnsRaw = String(studentAnswer).trim();
  const userAnsNorm = normalizeString(userAnsRaw);
  const userAnsNum = normalizeNumberString(userAnsRaw);
  const userAnsCondensed = normalizeCondensed(userAnsRaw);

  if (!userAnsNorm) return false;

  const keys: string[] = Array.isArray(keyAnswer)
    ? keyAnswer
    : String(keyAnswer || '').split('/');

  for (const rawKey of keys) {
    const keyTrimmed = String(rawKey || '').trim();
    const keyNorm = normalizeString(keyTrimmed);
    const keyNum = normalizeNumberString(keyTrimmed);
    const keyCondensed = normalizeCondensed(keyTrimmed);

    // 1. Direct case-insensitive match
    if (userAnsNorm === keyNorm) return true;

    // 2. Numeric / decimal comma vs dot match ("0,75" === "0.75")
    if (userAnsNum && keyNum && userAnsNum === keyNum) return true;

    // 3. Condensed whitespace-insensitive match ("orangtua" === "orang tua")
    if (userAnsCondensed && userAnsCondensed === keyCondensed) return true;
  }

  return false;
};

const extractOptionTextAndKey = (ans: any): { text: string; key: string } => {
  if (ans && typeof ans === 'object' && !Array.isArray(ans)) {
    return {
      text: String(ans.text ?? ans.key ?? '').trim(),
      key: String(ans.key ?? '').trim(),
    };
  }
  const str = String(ans ?? '').trim();
  return { text: str, key: '' };
};

const parseMultiAnswersToArray = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((item) => {
      const ext = extractOptionTextAndKey(item);
      return normalizeString(ext.key || ext.text);
    }).filter(Boolean);
  }
  if (val && typeof val === 'object') {
    return Object.values(val).map((item) => {
      const ext = extractOptionTextAndKey(item);
      return normalizeString(ext.key || ext.text);
    }).filter(Boolean);
  }
  const str = String(val).trim();
  if (!str) return [];
  // Split by comma, semicolon, or slash
  return str.split(/[,;|/]+/).map((s) => normalizeString(s)).filter(Boolean);
};

const parseBenarSalahToken = (val: any): 'b' | 's' | '' => {
  const norm = normalizeString(val);
  if (['b', 'benar', 'true', '1', 'ya', 'yes'].includes(norm)) return 'b';
  if (['s', 'salah', 'false', '0', 'tidak', 'no'].includes(norm)) return 's';
  return '';
};

export const evaluateQuestionScore = (
  questionType: string,
  studentAnswer: any,
  correctKey: string | string[],
  weight: number,
  optionsList?: string[],
  questionObj?: Partial<CBTQuestion>
): { isCorrect: boolean; earnedScore: number } => {
  if (studentAnswer === undefined || studentAnswer === null || studentAnswer === '') {
    return { isCorrect: false, earnedScore: 0 };
  }

  const safeWeight = Number(weight || 1);

  // A. ISIAN SINGKAT
  if (questionType === 'isian') {
    const isCorrect = checkIsianAnswer(studentAnswer, correctKey);
    return { isCorrect, earnedScore: isCorrect ? safeWeight : 0 };
  }

  // B. PILIHAN GANDA (PG)
  if (questionType === 'pg') {
    const { text: ansText, key: ansKey } = extractOptionTextAndKey(studentAnswer);
    const keyStr = String(correctKey || '').trim();
    const keyNorm = normalizeString(keyStr);
    if (!ansText && !ansKey && !keyStr) return { isCorrect: false, earnedScore: 0 };

    const ansTextNorm = normalizeString(ansText);
    const ansKeyNorm = normalizeString(ansKey);

    // 1. Direct match or key letter match
    if (ansTextNorm === keyNorm || (ansKeyNorm !== '' && ansKeyNorm === keyNorm)) {
      if (optionsList && optionsList.length > 0 && keyNorm.length === 1 && keyNorm >= 'a' && keyNorm <= 'z') {
        const expectedIdx = keyNorm.charCodeAt(0) - 97;
        const expectedOptText = optionsList[expectedIdx];
        if (expectedOptText && ansTextNorm && ansTextNorm !== keyNorm) {
          const isTextMatchExpected =
            normalizeString(expectedOptText) === ansTextNorm ||
            normalizeString(expectedOptText.replace(/^[a-d]\.\s*/i, '')) ===
              normalizeString(ansText.replace(/^[a-d]\.\s*/i, ''));
          if (isTextMatchExpected) {
            return { isCorrect: true, earnedScore: safeWeight };
          }
          const foundInOptions = optionsList.some(
            (o) =>
              normalizeString(o) === ansTextNorm ||
              normalizeString(o.replace(/^[a-d]\.\s*/i, '')) === normalizeString(ansText.replace(/^[a-d]\.\s*/i, ''))
          );
          if (foundInOptions) {
            return { isCorrect: false, earnedScore: 0 };
          }
        }
      }
      return { isCorrect: true, earnedScore: safeWeight };
    }

    // 2. Match full option text at letter key ('A' -> optionsList[0])
    if (optionsList && optionsList.length > 0 && keyNorm.length === 1 && keyNorm >= 'a' && keyNorm <= 'z') {
      const expectedIdx = keyNorm.charCodeAt(0) - 97;
      const expectedOpt = optionsList[expectedIdx];
      if (expectedOpt) {
        const expectedClean = normalizeString(expectedOpt.replace(/^[a-d]\.\s*/i, ''));
        const ansClean = normalizeString(ansText.replace(/^[a-d]\.\s*/i, ''));
        if (normalizeString(expectedOpt) === ansTextNorm || expectedClean === ansClean) {
          return { isCorrect: true, earnedScore: safeWeight };
        }
      }
    }

    // 3. Match prefix "A. ..."
    if (ansText.length >= 2 && ansText.charAt(1) === '.' && normalizeString(ansText.charAt(0)) === keyNorm) {
      return { isCorrect: true, earnedScore: safeWeight };
    }

    // 4. Match option index when studentAnswer is letter 'A' and correctKey is option text
    if (optionsList && optionsList.length > 0 && ansTextNorm.length === 1 && ansTextNorm >= 'a' && ansTextNorm <= 'z') {
      const idx = ansTextNorm.charCodeAt(0) - 97;
      if (idx >= 0 && idx < optionsList.length && normalizeString(optionsList[idx]) === keyNorm) {
        return { isCorrect: true, earnedScore: safeWeight };
      }
    }

    return { isCorrect: false, earnedScore: 0 };
  }

  // C. BENAR / SALAH (Tunggal maupun Majemuk)
  if (questionType === 'benar_salah') {
    const items = resolveBenarSalahItems({
      benarSalahItems: questionObj?.benarSalahItems,
      opsi: optionsList || questionObj?.opsi,
      kunciJawaban: correctKey,
    });

    if (items.length > 0 && (typeof studentAnswer === 'object' || items.length > 1)) {
      const ansObj: Record<string, any> =
        studentAnswer && typeof studentAnswer === 'object' && !Array.isArray(studentAnswer)
          ? studentAnswer
          : {};
      const ansArr: any[] = Array.isArray(studentAnswer) ? studentAnswer : [];

      let matchCount = 0;
      items.forEach((item, idx) => {
        const rawAns =
          ansObj[item.id] ??
          ansObj[String(idx)] ??
          ansObj[String(idx + 1)] ??
          ansArr[idx] ??
          (items.length === 1 && typeof studentAnswer !== 'object' ? studentAnswer : '');
        const studentToken = parseBenarSalahToken(rawAns);
        const keyToken = parseBenarSalahToken(item.kunci);
        if (studentToken && keyToken && studentToken === keyToken) {
          matchCount++;
        }
      });

      const isCorrect = matchCount === items.length;
      const earnedScore = isCorrect
        ? safeWeight
        : matchCount > 0
        ? Math.round((safeWeight * matchCount) / items.length)
        : 0;
      return { isCorrect, earnedScore };
    }

    // Fallback mode tunggal
    const { text: ansText } = extractOptionTextAndKey(studentAnswer);
    const keySingle = Array.isArray(correctKey) ? correctKey[0] || '' : String(correctKey || '');
    const studentToken = parseBenarSalahToken(ansText);
    const keyToken = parseBenarSalahToken(keySingle);
    const isCorrect = studentToken !== '' && keyToken !== '' && studentToken === keyToken;
    return { isCorrect, earnedScore: isCorrect ? safeWeight : 0 };
  }

  // D. PILIHAN GANDA KOMPLEKS (LEBIH DARI 1 JAWABAN BENAR)
  if (questionType === 'pg_kompleks') {
    const correctRaw = parseMultiAnswersToArray(correctKey);
    const studentRaw = parseMultiAnswersToArray(studentAnswer);

    const correctArray = Array.from(new Set(correctRaw)).sort();
    const studentArray = Array.from(new Set(studentRaw)).sort();

    if (correctArray.length === 0 || studentArray.length === 0) {
      return { isCorrect: false, earnedScore: 0 };
    }

    const matchCount = studentArray.filter((ans) => correctArray.includes(ans)).length;
    const wrongCount = studentArray.filter((ans) => !correctArray.includes(ans)).length;
    const isExact =
      correctArray.length === studentArray.length && matchCount === correctArray.length && wrongCount === 0;

    if (isExact) {
      return { isCorrect: true, earnedScore: safeWeight };
    } else {
      // Proportional score minus penalty for wrong selections (minimum 0)
      const netMatches = Math.max(0, matchCount - wrongCount);
      const earned = Math.round((safeWeight * netMatches) / correctArray.length);
      return { isCorrect: false, earnedScore: Math.max(0, earned) };
    }
  }

  // E. MENJODOHKAN (PASANGAN PREMIS & RESPON)
  if (questionType === 'menjodohkan') {
    const matchData = resolveMenjodohkanData({
      menjodohkanData: questionObj?.menjodohkanData,
      kunciJawaban: correctKey,
    });

    if (matchData && matchData.kolomKiri.length > 0) {
      const totalPairs = matchData.kolomKiri.length;
      let ansMap: Record<string, string> = {};

      if (studentAnswer && typeof studentAnswer === 'object' && !Array.isArray(studentAnswer)) {
        ansMap = studentAnswer as Record<string, string>;
      } else if (Array.isArray(studentAnswer)) {
        // e.g. ["1-B", "2-A"] or [["1","B"], ["2","A"]]
        studentAnswer.forEach((pair) => {
          if (Array.isArray(pair) && pair.length >= 2) {
            ansMap[String(pair[0]).trim()] = String(pair[1]).trim();
          } else if (typeof pair === 'string') {
            const parts = pair.split(/[-:=>]+/);
            if (parts.length >= 2) {
              ansMap[parts[0].trim()] = parts[1].trim();
            }
          }
        });
      } else if (typeof studentAnswer === 'string') {
        const parts = studentAnswer.split(/[,;\n]+/);
        parts.forEach((p) => {
          const sub = p.split(/[-:=>]+/);
          if (sub.length >= 2) {
            ansMap[sub[0].trim()] = sub[1].trim();
          }
        });
      }

      let correctPairs = 0;
      matchData.kolomKiri.forEach((_, idx) => {
        const numKey = String(idx + 1);
        const expectedLetter = normalizeString(matchData.pasangan[numKey] || '');
        const expectedIdx = expectedLetter.length === 1 ? expectedLetter.charCodeAt(0) - 97 : -1;
        const expectedText =
          expectedIdx >= 0 && matchData.kolomKanan[expectedIdx]
            ? normalizeString(matchData.kolomKanan[expectedIdx])
            : '';

        const studentVal = normalizeString(String(ansMap[numKey] || ansMap[String(idx)] || ''));
        if (!studentVal) return;

        if (studentVal === expectedLetter || (expectedText && studentVal === expectedText)) {
          correctPairs++;
        }
      });

      const isCorrect = correctPairs === totalPairs;
      const earnedScore = isCorrect
        ? safeWeight
        : correctPairs > 0
        ? Math.round((safeWeight * correctPairs) / totalPairs)
        : 0;
      return { isCorrect, earnedScore };
    }

    const { text } = extractOptionTextAndKey(studentAnswer);
    if (text.length >= 2) {
      return { isCorrect: true, earnedScore: safeWeight };
    }
    return { isCorrect: false, earnedScore: 0 };
  }

  // F. URAIAN / ESAI
  if (questionType === 'uraian') {
    const { text } = extractOptionTextAndKey(studentAnswer);
    const cleanedText = normalizeString(text);
    if (!cleanedText) return { isCorrect: false, earnedScore: 0 };

    // Jika kunci / rubrik diisi kata kunci cerdas
    const keyStr = String(correctKey || '').trim();
    if (keyStr) {
      const keywords = keyStr.split(/[,/]+/).map((k) => normalizeString(k)).filter(Boolean);
      if (keywords.length > 0) {
        const matchedKeywords = keywords.filter((kw) => cleanedText.includes(kw));
        if (matchedKeywords.length === keywords.length) {
          return { isCorrect: true, earnedScore: safeWeight };
        } else if (matchedKeywords.length > 0) {
          return { isCorrect: false, earnedScore: Math.round((safeWeight * matchedKeywords.length) / keywords.length) };
        }
      }
    }

    if (cleanedText.length >= 3) {
      return { isCorrect: true, earnedScore: safeWeight };
    }
    return { isCorrect: false, earnedScore: 0 };
  }

  return { isCorrect: false, earnedScore: 0 };
};
