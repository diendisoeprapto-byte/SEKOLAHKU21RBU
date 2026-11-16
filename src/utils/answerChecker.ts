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

export const evaluateQuestionScore = (
  questionType: string,
  studentAnswer: any,
  correctKey: string | string[],
  weight: number,
  optionsList?: string[]
): { isCorrect: boolean; earnedScore: number } => {
  if (studentAnswer === undefined || studentAnswer === null || studentAnswer === '') {
    return { isCorrect: false, earnedScore: 0 };
  }

  if (questionType === 'isian') {
    const isCorrect = checkIsianAnswer(String(studentAnswer), correctKey);
    return { isCorrect, earnedScore: isCorrect ? weight : 0 };
  }

  if (questionType === 'pg') {
    const { text: ansText, key: ansKey } = extractOptionTextAndKey(studentAnswer);
    const keyNorm = normalizeString(String(correctKey || ''));
    if (!ansText && !ansKey) return { isCorrect: false, earnedScore: 0 };

    const ansTextNorm = normalizeString(ansText);
    const ansKeyNorm = normalizeString(ansKey);

    // 1. Direct text or direct key letter match
    if (ansTextNorm === keyNorm || (ansKeyNorm !== '' && ansKeyNorm === keyNorm)) {
      // Catatan: jika opsi diacak, pastikan kecocokan teks bila kunci huruf & teks ada
      if (optionsList && optionsList.length > 0 && keyNorm.length === 1 && keyNorm >= 'a' && keyNorm <= 'z') {
        const expectedIdx = keyNorm.charCodeAt(0) - 97;
        const expectedOptText = optionsList[expectedIdx];
        if (expectedOptText && ansTextNorm && ansTextNorm !== keyNorm) {
          const isTextMatchExpected =
            normalizeString(expectedOptText) === ansTextNorm ||
            normalizeString(expectedOptText.replace(/^[a-d]\.\s*/i, '')) ===
              normalizeString(ansText.replace(/^[a-d]\.\s*/i, ''));
          if (isTextMatchExpected) {
            return { isCorrect: true, earnedScore: weight };
          }
          // Jika jawaban teks cocok opsi lain yang bukan kunci (karena opsi diacak saat ujian), jangan salah klaim benar
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
      return { isCorrect: true, earnedScore: weight };
    }

    // 2. Match full option text at kunci huruf ('A' -> optionsList[0])
    if (optionsList && optionsList.length > 0 && keyNorm.length === 1 && keyNorm >= 'a' && keyNorm <= 'z') {
      const expectedIdx = keyNorm.charCodeAt(0) - 97;
      const expectedOpt = optionsList[expectedIdx];
      if (expectedOpt) {
        const expectedClean = normalizeString(expectedOpt.replace(/^[a-d]\.\s*/i, ''));
        const ansClean = normalizeString(ansText.replace(/^[a-d]\.\s*/i, ''));
        if (normalizeString(expectedOpt) === ansTextNorm || expectedClean === ansClean) {
          return { isCorrect: true, earnedScore: weight };
        }
      }
    }

    // 3. Match prefix "A. ..."
    if (ansText.length >= 2 && ansText.charAt(1) === '.' && normalizeString(ansText.charAt(0)) === keyNorm) {
      return { isCorrect: true, earnedScore: weight };
    }

    // 4. Match option index when studentAnswer is letter 'A' and correctKey is option text
    if (optionsList && optionsList.length > 0 && ansTextNorm.length === 1 && ansTextNorm >= 'a' && ansTextNorm <= 'z') {
      const idx = ansTextNorm.charCodeAt(0) - 97;
      if (idx >= 0 && idx < optionsList.length && normalizeString(optionsList[idx]) === keyNorm) {
        return { isCorrect: true, earnedScore: weight };
      }
    }

    return { isCorrect: false, earnedScore: 0 };
  }

  if (questionType === 'benar_salah') {
    const { text: ansText } = extractOptionTextAndKey(studentAnswer);
    const isCorrect = normalizeString(ansText) === normalizeString(String(correctKey));
    return { isCorrect, earnedScore: isCorrect ? weight : 0 };
  }

  if (questionType === 'pg_kompleks') {
    const correctArray: string[] = Array.isArray(correctKey)
      ? correctKey.map(normalizeString)
      : [normalizeString(String(correctKey))];
    const rawUserArr: any[] = Array.isArray(studentAnswer) ? studentAnswer : [studentAnswer];
    const userArray: string[] = rawUserArr.map((s) => {
      const { text, key } = extractOptionTextAndKey(s);
      if (optionsList && optionsList.length > 0 && text) {
        const foundIdx = optionsList.findIndex((o) => normalizeString(o) === normalizeString(text));
        if (foundIdx >= 0 && correctArray.every((c) => c.length === 1)) {
          return String.fromCharCode(65 + foundIdx).toLowerCase();
        }
      }
      return normalizeString(text || key);
    });

    const matchCount = userArray.filter((ans) => correctArray.includes(ans)).length;
    const isExact =
      correctArray.length === userArray.length && matchCount === correctArray.length;

    if (isExact) {
      return { isCorrect: true, earnedScore: weight };
    } else if (matchCount > 0 && userArray.length <= correctArray.length) {
      return { isCorrect: false, earnedScore: Math.round((weight * matchCount) / correctArray.length) };
    }
    return { isCorrect: false, earnedScore: 0 };
  }

  if (questionType === 'menjodohkan' || questionType === 'uraian') {
    const { text } = extractOptionTextAndKey(studentAnswer);
    const len = text.length;
    if (len >= 3) {
      return { isCorrect: true, earnedScore: weight };
    }
    return { isCorrect: false, earnedScore: 0 };
  }

  return { isCorrect: false, earnedScore: 0 };
};
