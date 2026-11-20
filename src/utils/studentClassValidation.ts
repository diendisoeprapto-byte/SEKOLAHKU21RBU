import { Student } from '../types';

export const EXPECTED_CLASSES_CONFIG: readonly string[] = [
  'Kelas 1A', 'Kelas 1B',
  'Kelas 2A', 'Kelas 2B',
  'Kelas 3A', 'Kelas 3B',
  'Kelas 4A', 'Kelas 4B',
  'Kelas 5A', 'Kelas 5B',
  'Kelas 6A', 'Kelas 6B',
] as const;

export type ValidationSeverity = 'error' | 'warning';

export type DiscrepancyType =
  | 'INVALID_KELAS_CONFIG'
  | 'KELAS_MISMATCH_EXPECTED_CONFIG'
  | 'BARCODE_KELAS_MISMATCH'
  | 'DUPLICATE_IDENTITY_CROSS_CLASS'
  | 'TKA_SUBMISSION_KELAS_MISMATCH';

export interface ExpectedKelasRule {
  studentId?: string;
  nisn?: string;
  barcodeId?: string;
  nama?: string;
  expectedKelas: string;
  source?: string;
}

export interface TKASubmissionCrossRefInput {
  id: string;
  studentId: string;
  nama: string;
  nisn?: string;
  kelas?: string;
  paketLabel?: string;
  mapel?: string;
}

export interface StudentClassDiscrepancy {
  id: string;
  type: DiscrepancyType;
  severity: ValidationSeverity;
  studentId: string;
  studentName: string;
  nisn: string;
  barcodeId: string;
  actualKelas: string;
  expectedKelas?: string;
  autoFixable: boolean;
  message: string;
  source?: string;
}

export interface StudentFlagSummary {
  studentId: string;
  autoFlagged: boolean;
  highestSeverity: ValidationSeverity;
  expectedKelas?: string;
  reasons: string[];
  discrepancyTypes: DiscrepancyType[];
}

export interface StudentValidationSummary {
  totalStudents: number;
  validStudents: number;
  flaggedStudents: number;
  errorCount: number;
  warningCount: number;
  tkaMismatchCount: number;
  classDistribution: Record<string, number>;
  isHealthy: boolean;
}

export interface StudentValidationReport {
  generatedAt: string;
  allowedClasses: string[];
  summary: StudentValidationSummary;
  discrepancies: StudentClassDiscrepancy[];
  flaggedStudentMap: Record<string, StudentFlagSummary>;
  flaggedStudents: Array<Student & { validationFlag: StudentFlagSummary }>;
}

export const normalizeValidationName = (value?: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeValidationNisn = (value?: string): string =>
  String(value || '').replace(/\D+/g, '').trim();

const ROMAN_GRADE_MAP: Record<string, string> = {
  I: '1',
  II: '2',
  III: '3',
  IV: '4',
  V: '5',
  VI: '6',
};

/**
 * Mencoba menormalkan teks kelas mentah menjadi format konfigurasi standar ("Kelas 1A" .. "Kelas 6B").
 */
export const resolveCanonicalKelas = (
  rawKelas?: string,
  allowedClasses: readonly string[] = EXPECTED_CLASSES_CONFIG
): string | undefined => {
  const cleaned = String(rawKelas || '').trim();
  if (!cleaned) return undefined;

  const exact = allowedClasses.find(
    (c) => c.toLowerCase() === cleaned.toLowerCase()
  );
  if (exact) return exact;

  // Tangani format seperti "6B", "6 B", "Kelas VI B", "VI-A", "kls 6b"
  const upper = cleaned
    .toUpperCase()
    .replace(/^(KELAS|KLS|ROMBEL)\s*/i, '')
    .trim();

  const romanMatch = upper.match(/^(I|II|III|IV|V|VI)\s*[-_\s]*([AB])$/);
  if (romanMatch) {
    const candidate = `Kelas ${ROMAN_GRADE_MAP[romanMatch[1]]}${romanMatch[2]}`;
    if (allowedClasses.includes(candidate)) return candidate;
  }

  const digitMatch = upper.match(/^([1-6])\s*[-_\s]*([AB])$/);
  if (digitMatch) {
    const candidate = `Kelas ${digitMatch[1]}${digitMatch[2]}`;
    if (allowedClasses.includes(candidate)) return candidate;
  }

  return undefined;
};

/**
 * Mengekstrak kode kelas dari Barcode ID (mis. "RBU21-6A-001" atau "RBU21-Kelas6B-002" -> "Kelas 6A" / "Kelas 6B").
 */
export const extractKelasFromBarcodeId = (
  barcodeId?: string,
  allowedClasses: readonly string[] = EXPECTED_CLASSES_CONFIG
): string | undefined => {
  const raw = String(barcodeId || '').trim().toUpperCase();
  if (!raw) return undefined;

  const match = raw.match(/(?:^|[-_\s])(?:KELAS)?([1-6])([AB])(?:[-_\s]|$)/);
  if (!match) return undefined;

  const candidate = `Kelas ${match[1]}${match[2]}`;
  return allowedClasses.includes(candidate) ? candidate : undefined;
};

const addStudentFlag = (
  map: Record<string, StudentFlagSummary>,
  studentId: string,
  discrepancy: StudentClassDiscrepancy
) => {
  if (!map[studentId]) {
    map[studentId] = {
      studentId,
      autoFlagged: true,
      highestSeverity: discrepancy.severity,
      expectedKelas: discrepancy.expectedKelas,
      reasons: [discrepancy.message],
      discrepancyTypes: [discrepancy.type],
    };
    return;
  }

  const entry = map[studentId];
  if (discrepancy.severity === 'error') {
    entry.highestSeverity = 'error';
  }
  if (!entry.expectedKelas && discrepancy.expectedKelas) {
    entry.expectedKelas = discrepancy.expectedKelas;
  }
  if (!entry.reasons.includes(discrepancy.message)) {
    entry.reasons.push(discrepancy.message);
  }
  if (!entry.discrepancyTypes.includes(discrepancy.type)) {
    entry.discrepancyTypes.push(discrepancy.type);
  }
};

/**
 * Memvalidasi array `students` terhadap konfigurasi kelas yang diharapkan (`allowedClasses`,
 * `expectedRoster`, kode kelas pada barcodeId, duplikasi identitas lintas kelas, dan opsional
 * keselarasan terhadap `tkaSubmissions`).
 */
export function validateStudentsAgainstKelasConfig(
  students: Student[],
  options?: {
    allowedClasses?: readonly string[];
    expectedRoster?: ExpectedKelasRule[];
    tkaSubmissions?: TKASubmissionCrossRefInput[];
    checkBarcodePrefix?: boolean;
  }
): StudentValidationReport {
  const allowedClasses = Array.from(options?.allowedClasses || EXPECTED_CLASSES_CONFIG);
  const allowedSet = new Set(allowedClasses);
  const checkBarcodePrefix = options?.checkBarcodePrefix !== false;

  const discrepancies: StudentClassDiscrepancy[] = [];
  const flaggedStudentMap: Record<string, StudentFlagSummary> = {};
  const classDistribution: Record<string, number> = {};
  allowedClasses.forEach((c) => {
    classDistribution[c] = 0;
  });

  // Indeks aturan expectedRoster jika disediakan
  const ruleById = new Map<string, ExpectedKelasRule>();
  const ruleByNisn = new Map<string, ExpectedKelasRule>();
  const ruleByBarcode = new Map<string, ExpectedKelasRule>();
  const ruleByName = new Map<string, ExpectedKelasRule>();

  (options?.expectedRoster || []).forEach((rule) => {
    if (rule.studentId) ruleById.set(rule.studentId.trim(), rule);
    const nisn = normalizeValidationNisn(rule.nisn);
    if (nisn.length >= 5) ruleByNisn.set(nisn, rule);
    if (rule.barcodeId) ruleByBarcode.set(rule.barcodeId.trim().toLowerCase(), rule);
    const normName = normalizeValidationName(rule.nama);
    if (normName) ruleByName.set(normName, rule);
  });

  // Lacak identitas untuk mendeteksi duplikasi siswa lintas kelas
  const nisnGroups = new Map<string, Student[]>();
  const nameGroups = new Map<string, Student[]>();

  students.forEach((student, index) => {
    const actualKelas = String(student.kelas || '').trim();
    const normNisn = normalizeValidationNisn(student.nisn);
    const normName = normalizeValidationName(student.nama);
    const barcodeLower = String(student.barcodeId || '').trim().toLowerCase();

    if (actualKelas) {
      classDistribution[actualKelas] = (classDistribution[actualKelas] || 0) + 1;
    }

    if (normNisn.length >= 5) {
      const list = nisnGroups.get(normNisn) || [];
      list.push(student);
      nisnGroups.set(normNisn, list);
    }

    if (normName) {
      const list = nameGroups.get(normName) || [];
      list.push(student);
      nameGroups.set(normName, list);
    }

    // 1. Cek validitas nama kelas terhadap konfigurasi resmi
    if (!actualKelas || !allowedSet.has(actualKelas)) {
      const suggested = resolveCanonicalKelas(actualKelas, allowedClasses);
      const disc: StudentClassDiscrepancy = {
        id: `invalid_kelas_${student.id}_${index}`,
        type: 'INVALID_KELAS_CONFIG',
        severity: 'error',
        studentId: student.id,
        studentName: student.nama,
        nisn: student.nisn || '-',
        barcodeId: student.barcodeId || '-',
        actualKelas: actualKelas || '(Kosong)',
        expectedKelas: suggested,
        autoFixable: Boolean(suggested),
        message: suggested
          ? `Kelas "${actualKelas || '(Kosong)'}" tidak sesuai format standar. Disarankan "${suggested}".`
          : `Kelas "${actualKelas || '(Kosong)'}" tidak terdaftar di konfigurasi kelas sekolah.`,
      };
      discrepancies.push(disc);
      addStudentFlag(flaggedStudentMap, student.id, disc);
    }

    // 2. Cross-reference terhadap expectedRoster (daftar rombel / konfigurasi ekspektasi)
    const matchedRule =
      (student.id ? ruleById.get(student.id.trim()) : undefined) ||
      (normNisn.length >= 5 ? ruleByNisn.get(normNisn) : undefined) ||
      (barcodeLower ? ruleByBarcode.get(barcodeLower) : undefined) ||
      (normName ? ruleByName.get(normName) : undefined);

    if (matchedRule) {
      const expectedNormalized =
        resolveCanonicalKelas(matchedRule.expectedKelas, allowedClasses) ||
        matchedRule.expectedKelas.trim();
      if (actualKelas !== expectedNormalized) {
        const disc: StudentClassDiscrepancy = {
          id: `expected_mismatch_${student.id}_${index}`,
          type: 'KELAS_MISMATCH_EXPECTED_CONFIG',
          severity: 'error',
          studentId: student.id,
          studentName: student.nama,
          nisn: student.nisn || '-',
          barcodeId: student.barcodeId || '-',
          actualKelas: actualKelas || '(Kosong)',
          expectedKelas: expectedNormalized,
          autoFixable: allowedSet.has(expectedNormalized),
          source: matchedRule.source || 'Konfigurasi Rombel',
          message: `Ketidaksesuaian rombel: "${student.nama}" tercatat di "${actualKelas || '(Kosong)'}", seharusnya berada di "${expectedNormalized}".`,
        };
        discrepancies.push(disc);
        addStudentFlag(flaggedStudentMap, student.id, disc);
      }
    }

    // 3. Cross-reference kode kelas pada barcodeId terhadap kelas aktif siswa
    if (checkBarcodePrefix && actualKelas && allowedSet.has(actualKelas)) {
      const barcodeKelas = extractKelasFromBarcodeId(student.barcodeId, allowedClasses);
      if (barcodeKelas && barcodeKelas !== actualKelas) {
        const disc: StudentClassDiscrepancy = {
          id: `barcode_mismatch_${student.id}_${index}`,
          type: 'BARCODE_KELAS_MISMATCH',
          severity: 'warning',
          studentId: student.id,
          studentName: student.nama,
          nisn: student.nisn || '-',
          barcodeId: student.barcodeId || '-',
          actualKelas,
          expectedKelas: actualKelas,
          autoFixable: true,
          message: `Kode barcode (${student.barcodeId}) merujuk ke "${barcodeKelas}", berbeda dengan kelas siswa "${actualKelas}".`,
        };
        discrepancies.push(disc);
        addStudentFlag(flaggedStudentMap, student.id, disc);
      }
    }
  });

  // 4. Deteksi duplikasi identitas (NISN / Nama) lintas kelas
  const duplicateFlaggedPairs = new Set<string>();
  const flagCrossClassDuplicates = (groups: Map<string, Student[]>, label: 'NISN' | 'Nama') => {
    groups.forEach((group) => {
      if (group.length < 2) return;
      const distinctClasses = Array.from(
        new Set(group.map((g) => String(g.kelas || '').trim()).filter(Boolean))
      );
      if (distinctClasses.length < 2) return;

      group.forEach((student) => {
        const pairKey = `${student.id}_${label}`;
        if (duplicateFlaggedPairs.has(pairKey)) return;
        duplicateFlaggedPairs.add(pairKey);

        const disc: StudentClassDiscrepancy = {
          id: `dup_${label.toLowerCase()}_${student.id}`,
          type: 'DUPLICATE_IDENTITY_CROSS_CLASS',
          severity: 'error',
          studentId: student.id,
          studentName: student.nama,
          nisn: student.nisn || '-',
          barcodeId: student.barcodeId || '-',
          actualKelas: student.kelas,
          autoFixable: false,
          message: `Duplikasi ${label} terdeteksi lintas kelas (${distinctClasses.join(' vs ')}) untuk "${student.nama}".`,
        };
        discrepancies.push(disc);
        addStudentFlag(flaggedStudentMap, student.id, disc);
      });
    });
  };

  flagCrossClassDuplicates(nisnGroups, 'NISN');
  flagCrossClassDuplicates(nameGroups, 'Nama');

  // 5. Cross-reference data TKA Submissions (mencegah kasus kelas submission berbeda dari data siswa)
  let tkaMismatchCount = 0;
  if (options?.tkaSubmissions && options.tkaSubmissions.length > 0) {
    const studentByNisn = new Map<string, Student>();
    const studentByName = new Map<string, Student>();
    const studentById = new Map<string, Student>();

    students.forEach((s) => {
      if (s.id) studentById.set(s.id, s);
      const n = normalizeValidationNisn(s.nisn);
      if (n.length >= 5) studentByNisn.set(n, s);
      const nm = normalizeValidationName(s.nama);
      if (nm) studentByName.set(nm, s);
    });

    options.tkaSubmissions.forEach((sub, idx) => {
      const subNisn = normalizeValidationNisn(sub.nisn);
      const subName = normalizeValidationName(sub.nama);
      const liveStudent =
        (subNisn.length >= 5 ? studentByNisn.get(subNisn) : undefined) ||
        (subName ? studentByName.get(subName) : undefined) ||
        studentById.get(sub.studentId);

      if (!liveStudent) return;

      const subKelas = resolveCanonicalKelas(sub.kelas, allowedClasses) || String(sub.kelas || '').trim();
      if (subKelas && liveStudent.kelas && subKelas !== liveStudent.kelas) {
        tkaMismatchCount++;
        const disc: StudentClassDiscrepancy = {
          id: `tka_mismatch_${sub.id}_${idx}`,
          type: 'TKA_SUBMISSION_KELAS_MISMATCH',
          severity: 'error',
          studentId: liveStudent.id,
          studentName: liveStudent.nama,
          nisn: liveStudent.nisn || '-',
          barcodeId: liveStudent.barcodeId || '-',
          actualKelas: subKelas,
          expectedKelas: liveStudent.kelas,
          autoFixable: true,
          source: sub.paketLabel ? `Report TKA (${sub.paketLabel})` : 'Report TKA',
          message: `Data ujian TKA "${liveStudent.nama}" tercatat di "${subKelas}", seharusnya mengikuti kelas siswa "${liveStudent.kelas}".`,
        };
        discrepancies.push(disc);
        addStudentFlag(flaggedStudentMap, liveStudent.id, disc);
      }
    });
  }

  const flaggedStudents = students
    .filter((s) => Boolean(flaggedStudentMap[s.id]))
    .map((s) => ({
      ...s,
      validationFlag: flaggedStudentMap[s.id],
    }));

  const errorCount = discrepancies.filter((d) => d.severity === 'error').length;
  const warningCount = discrepancies.filter((d) => d.severity === 'warning').length;

  return {
    generatedAt: new Date().toISOString(),
    allowedClasses,
    summary: {
      totalStudents: students.length,
      validStudents: students.length - flaggedStudents.length,
      flaggedStudents: flaggedStudents.length,
      errorCount,
      warningCount,
      tkaMismatchCount,
      classDistribution,
      isHealthy: discrepancies.length === 0,
    },
    discrepancies,
    flaggedStudentMap,
    flaggedStudents,
  };
}

/**
 * Memperbaiki otomatis ketidaksesuaian kelas yang sifatnya deterministik (normalisasi nama kelas,
 * penyelarasan expectedRoster, dan sinkronisasi kode kelas pada barcodeId).
 */
export function applyAutoFixStudentClassDiscrepancies(
  students: Student[],
  report: StudentValidationReport
): { updatedStudents: Student[]; fixedCount: number } {
  let fixedCount = 0;

  const updatedStudents = students.map((student) => {
    const flag = report.flaggedStudentMap[student.id];
    if (!flag) return student;

    let nextStudent = { ...student };
    let changed = false;

    if (
      (flag.discrepancyTypes.includes('INVALID_KELAS_CONFIG') ||
        flag.discrepancyTypes.includes('KELAS_MISMATCH_EXPECTED_CONFIG')) &&
      flag.expectedKelas &&
      flag.expectedKelas !== nextStudent.kelas
    ) {
      nextStudent.kelas = flag.expectedKelas;
      changed = true;
    }

    if (
      (changed || flag.discrepancyTypes.includes('BARCODE_KELAS_MISMATCH')) &&
      nextStudent.barcodeId
    ) {
      const targetCode = nextStudent.kelas.replace(/\s+/g, '').replace('Kelas', '');
      const syncedBarcode = nextStudent.barcodeId.replace(
        /((?:^|[-_\s]))(?:KELAS)?[1-6][AB]((?=[-_\s]|$))/i,
        `$1${targetCode}$2`
      );
      if (syncedBarcode !== nextStudent.barcodeId) {
        nextStudent.barcodeId = syncedBarcode;
        changed = true;
      }
    }

    if (changed) fixedCount++;
    return nextStudent;
  });

  return { updatedStudents, fixedCount };
}
