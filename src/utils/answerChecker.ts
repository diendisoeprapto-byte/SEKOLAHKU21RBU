/**
 * Answer Checker Utility for CBT and TKA
 * Handles case-insensitivity, whitespace-insensitivity, and slash-delimited alternative answers
 * (e.g. "Orang tua / ayah / ibu" -> accepts "ayah", "ibu", "orangtua", "Orang Tua", "AYAH", etc.)
 */

export const normalizeString = (str: string): string => {
  if (!str) return '';
  return str.trim().toLowerCase();
};

export const normalizeCondensed = (str: string): string => {
  if (!str) return '';
  return str.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
};

export const checkIsianAnswer = (
  studentAnswer: string | undefined | null,
  keyAnswer: string | string[]
): boolean => {
  if (!studentAnswer || typeof studentAnswer !== 'string') return false;
  const userAnsRaw = studentAnswer.trim();
  const userAnsNorm = normalizeString(userAnsRaw);
  const userAnsCondensed = normalizeCondensed(userAnsRaw);

  if (!userAnsNorm) return false;

  const keys: string[] = Array.isArray(keyAnswer)
    ? keyAnswer
    : String(keyAnswer).split('/');

  for (const rawKey of keys) {
    const keyTrimmed = rawKey.trim();
    const keyNorm = normalizeString(keyTrimmed);
    const keyCondensed = normalizeCondensed(keyTrimmed);

    // 1. Direct case-insensitive match: "ayah" === "Ayah"
    if (userAnsNorm === keyNorm) return true;

    // 2. Condensed whitespace-insensitive match: "orangtua" === "orang tua"
    if (userAnsCondensed && userAnsCondensed === keyCondensed) return true;
  }

  return false;
};

export const evaluateQuestionScore = (
  questionType: string,
  studentAnswer: any,
  correctKey: string | string[],
  weight: number
): { isCorrect: boolean; earnedScore: number } => {
  if (studentAnswer === undefined || studentAnswer === null || studentAnswer === '') {
    return { isCorrect: false, earnedScore: 0 };
  }

  if (questionType === 'isian') {
    const isCorrect = checkIsianAnswer(String(studentAnswer), correctKey);
    return { isCorrect, earnedScore: isCorrect ? weight : 0 };
  }

  if (questionType === 'pg' || questionType === 'benar_salah') {
    const isCorrect =
      normalizeString(String(studentAnswer)) === normalizeString(String(correctKey));
    return { isCorrect, earnedScore: isCorrect ? weight : 0 };
  }

  if (questionType === 'pg_kompleks') {
    const correctArray: string[] = Array.isArray(correctKey)
      ? correctKey.map(normalizeString)
      : [normalizeString(String(correctKey))];
    const userArray: string[] = Array.isArray(studentAnswer)
      ? studentAnswer.map((s: any) => normalizeString(String(s)))
      : [normalizeString(String(studentAnswer))];

    const matchCount = userArray.filter((ans) => correctArray.includes(ans)).length;
    const isExact =
      correctArray.length === userArray.length && matchCount === correctArray.length;

    if (isExact) {
      return { isCorrect: true, earnedScore: weight };
    } else if (matchCount > 0 && userArray.length <= correctArray.length) {
      // Partial credit for partial correct
      return { isCorrect: false, earnedScore: Math.round((weight * matchCount) / correctArray.length) };
    }
    return { isCorrect: false, earnedScore: 0 };
  }

  if (questionType === 'menjodohkan' || questionType === 'uraian') {
    // For simulation, check if non-empty string or length > 5
    const len = String(studentAnswer).trim().length;
    if (len >= 3) {
      return { isCorrect: true, earnedScore: weight };
    }
    return { isCorrect: false, earnedScore: 0 };
  }

  return { isCorrect: false, earnedScore: 0 };
};
