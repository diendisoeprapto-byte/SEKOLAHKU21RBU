import { CBTQuestion } from '../types';
import { cleanStr, evaluateStudentAnswer } from './examEngine';

/**
 * Universal Answer Checker Utility for CBT and TKA (SERBU 21)
 * Delegates evaluation directly to `examEngine.ts` (`evaluateStudentAnswer`) as
 * the single source of truth across student exam submission, Analisis Butir Soal,
 * Rekap Nilai CBT/TKA, Recalculate, and SARAH AI Review.
 */

export { cleanStr, evaluateStudentAnswer };

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
  return evaluateStudentAnswer('isian', studentAnswer, keyAnswer, 1).isCorrect;
};

export const evaluateQuestionScore = (
  questionType: string,
  studentAnswer: any,
  correctKey: string | string[],
  weight: number,
  optionsList?: string[],
  questionObj?: Partial<CBTQuestion>
): { isCorrect: boolean; earnedScore: number } => {
  const safeWeight = Number(weight) > 0 ? Number(weight) : 10;
  const res = evaluateStudentAnswer(
    questionType,
    studentAnswer,
    correctKey,
    safeWeight,
    optionsList,
    questionObj
  );
  return {
    isCorrect: res.isCorrect,
    earnedScore: res.earnedScore,
  };
};
