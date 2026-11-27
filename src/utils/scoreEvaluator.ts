/**
 * ============================================================================
 * SERBU 21 - Standardisasi Penilaian & Normalisasi Jawaban Ujian
 * ============================================================================
 * Re-exports & delegates to the unified examEngine (v5.0.0).
 */

export {
  cleanStr,
  normalizeCondensed,
  normalizeNumericStr,
  parseMultiAnswersToArray,
  parseBenarSalahToken,
  parseMatchingPairsMap,
  evaluateStudentAnswer,
  calculateTotalExamScore,
  type ExamEvaluationResult,
} from './examEngine';
