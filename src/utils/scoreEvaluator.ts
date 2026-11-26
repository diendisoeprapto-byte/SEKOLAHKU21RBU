/**
 * ============================================================================
 * SERBU 21 - Standardisasi Penilaian & Normalisasi Jawaban Ujian
 * ============================================================================
 */

import { CBTQuestion } from '../types';
import { evaluateQuestionScore, normalizeString } from './answerChecker';

export function evaluateStudentAnswer(
  question: CBTQuestion,
  studentAnswer: any
): { isCorrect: boolean; earnedScore: number } {
  const tipe = question.tipe || 'pg';
  const kunci = question.kunciJawaban ?? '';
  const bobot = Number(question.bobot || 1);
  const opsi = question.opsi || [];

  return evaluateQuestionScore(tipe, studentAnswer, kunci, bobot, opsi, question);
}

export function calculateTotalExamScore(
  questions: CBTQuestion[],
  answersMap: Record<string, any>
): {
  rawScore: number;
  maxScore: number;
  finalScore: number;
  correctCount: number;
  wrongCount: number;
  itemResults: Record<string, boolean>;
} {
  let rawScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  const itemResults: Record<string, boolean> = {};

  (questions || []).forEach((q) => {
    const weight = Number(q.bobot || 1);
    maxScore += weight;
    const ans = answersMap[q.id];
    const evalRes = evaluateStudentAnswer(q, ans);
    itemResults[q.id] = evalRes.isCorrect;
    rawScore += evalRes.earnedScore;
    if (evalRes.isCorrect) {
      correctCount++;
    } else {
      wrongCount++;
    }
  });

  const finalScore = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;

  return {
    rawScore,
    maxScore,
    finalScore,
    correctCount,
    wrongCount,
    itemResults,
  };
}
