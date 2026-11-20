import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STUDENTS } from '../src/data/defaultData';
import { Student } from '../src/types';
import {
  EXPECTED_CLASSES_CONFIG,
  ExpectedKelasRule,
  TKASubmissionCrossRefInput,
  applyAutoFixStudentClassDiscrepancies,
  validateStudentsAgainstKelasConfig,
} from '../src/utils/studentClassValidation';

interface CliOptions {
  inputPath?: string;
  rosterPath?: string;
  strict: boolean;
  runRegressionCheck: boolean;
}

const parseArgs = (argv: string[]): CliOptions => {
  const opts: CliOptions = {
    strict: argv.includes('--strict'),
    runRegressionCheck: !argv.includes('--no-regression'),
  };

  for (const arg of argv) {
    if (arg.startsWith('--input=')) {
      opts.inputPath = arg.slice('--input='.length).trim();
    } else if (arg.startsWith('--roster=')) {
      opts.rosterPath = arg.slice('--roster='.length).trim();
    }
  }

  return opts;
};

const loadDatasetFromBackup = (
  filePath: string
): { students: Student[]; tkaSubmissions: TKASubmissionCrossRefInput[] } => {
  const resolved = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  if (Array.isArray(parsed)) {
    return { students: parsed as Student[], tkaSubmissions: [] };
  }

  const students = Array.isArray(parsed.sekolahku_students)
    ? (parsed.sekolahku_students as Student[])
    : Array.isArray(parsed.students)
    ? (parsed.students as Student[])
    : [];

  const tkaSubmissions = Array.isArray(parsed.sekolahku_tka_submissions)
    ? (parsed.sekolahku_tka_submissions as TKASubmissionCrossRefInput[])
    : Array.isArray(parsed.tkaSubmissions)
    ? (parsed.tkaSubmissions as TKASubmissionCrossRefInput[])
    : [];

  return { students, tkaSubmissions };
};

const loadExpectedRoster = (filePath?: string): ExpectedKelasRule[] => {
  if (!filePath) return [];
  const resolved = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as ExpectedKelasRule[]) : [];
};

const printReportSection = (
  title: string,
  report: ReturnType<typeof validateStudentsAgainstKelasConfig>
) => {
  console.log(`\n=== ${title} ===`);
  console.log(
    `Total Siswa: ${report.summary.totalStudents} | Valid: ${report.summary.validStudents} | Auto-Flagged: ${report.summary.flaggedStudents} | Error: ${report.summary.errorCount} | Warning: ${report.summary.warningCount}`
  );

  const populatedClasses = Object.entries(report.summary.classDistribution)
    .filter(([, count]) => count > 0)
    .map(([kelas, count]) => `${kelas}: ${count}`)
    .join(', ');
  console.log(`Distribusi Kelas: ${populatedClasses || '(tidak ada)'}`);

  if (report.discrepancies.length === 0) {
    console.log('Status: [OK] Semua data siswa selaras dengan konfigurasi kelas.');
    return;
  }

  console.log('\nDaftar Siswa Ter-Flag (Discrepancies):');
  report.discrepancies.forEach((d, idx) => {
    const tag = d.severity === 'error' ? 'ERROR' : 'WARN ';
    console.log(
      `  ${idx + 1}. [${tag}] [${d.type}] ${d.studentName} (NISN: ${d.nisn}) | Tercatat: "${d.actualKelas}" -> Diharapkan: "${d.expectedKelas || '-'}"`
    );
    console.log(`     Detail: ${d.message}`);
  });
};

function runRegressionVerification(): boolean {
  console.log('\n=== VERIFIKASI REGRESI OTOMATIS (KASUS NADHIFA OKTAFIYANI) ===');
  const sampleStudents: Student[] = [
    ...DEFAULT_STUDENTS,
    {
      id: 'std_nadhifa',
      barcodeId: 'RBU21-6A-099', // Sengaja berbeda untuk menguji auto-flag barcode + kelas
      nama: 'Nadhifa Oktafiyani',
      jenisKelamin: 'P',
      tempatLahir: 'Jakarta',
      tanggalLahir: '2014-10-12',
      nik: '3172015210140099',
      nisn: '0134567899',
      agama: 'Islam',
      kebutuhanKhusus: 'Tidak Ada (Reguler)',
      namaAyah: 'Okta Wijaya',
      namaIbu: 'Siti Rahma',
      noTelpOrtu: '081234567890',
      alamat: 'Jl. Rawa Badak Utara, Koja',
      kelas: 'Kelas 6A', // Seharusnya Kelas 6B sesuai expected roster
      tahunPelajaran: '2026/2027',
      username: 'nadhifa.oktafiyani',
      password: '123',
      fotoUrl: '',
    },
  ];

  const expectedRoster: ExpectedKelasRule[] = [
    {
      nisn: '0134567899',
      nama: 'Nadhifa Oktafiyani',
      expectedKelas: 'Kelas 6B',
      source: 'Daftar Rombel Resmi Kelas 6B',
    },
  ];

  const tkaSubmissions: TKASubmissionCrossRefInput[] = [
    {
      id: 'sub_nadhifa_paket1',
      studentId: 'std_nadhifa',
      nama: 'Nadhifa Oktafiyani',
      nisn: '0134567899',
      kelas: 'Kelas 6A',
      paketLabel: 'Paket 1',
      mapel: 'Matematika',
    },
  ];

  const report = validateStudentsAgainstKelasConfig(sampleStudents, {
    allowedClasses: EXPECTED_CLASSES_CONFIG,
    expectedRoster,
    tkaSubmissions,
  });

  const nadhifaFlag = report.flaggedStudentMap['std_nadhifa'];
  const caughtExpectedMismatch = Boolean(
    nadhifaFlag?.discrepancyTypes.includes('KELAS_MISMATCH_EXPECTED_CONFIG')
  );

  printReportSection('Hasil Simulasi Auto-Flag Nadhifa Oktafiyani', report);

  const { updatedStudents, fixedCount } = applyAutoFixStudentClassDiscrepancies(
    sampleStudents,
    report
  );
  const nadhifaAfterFix = updatedStudents.find((s) => s.id === 'std_nadhifa');

  // Uji cross-reference terhadap submission TKA lama yang masih membawa "Kelas 6A"
  const staleTkaCheckReport = validateStudentsAgainstKelasConfig(updatedStudents, {
    allowedClasses: EXPECTED_CLASSES_CONFIG,
    expectedRoster,
    tkaSubmissions,
  });
  const caughtTkaMismatch = Boolean(
    staleTkaCheckReport.flaggedStudentMap['std_nadhifa']?.discrepancyTypes.includes(
      'TKA_SUBMISSION_KELAS_MISMATCH'
    )
  );

  const postFixReport = validateStudentsAgainstKelasConfig(updatedStudents, {
    allowedClasses: EXPECTED_CLASSES_CONFIG,
    expectedRoster,
  });

  const passed =
    caughtExpectedMismatch &&
    caughtTkaMismatch &&
    fixedCount >= 1 &&
    nadhifaAfterFix?.kelas === 'Kelas 6B' &&
    nadhifaAfterFix?.barcodeId === 'RBU21-6B-099' &&
    postFixReport.summary.isHealthy;

  console.log(
    `\nHasil Auto-Fix Regresi: fixedCount=${fixedCount}, Nadhifa kelas=${nadhifaAfterFix?.kelas}, barcode=${nadhifaAfterFix?.barcodeId}, staleTkaFlagged=${caughtTkaMismatch}, postFixHealthy=${postFixReport.summary.isHealthy}`
  );
  console.log(`Status Verifikasi Regresi: ${passed ? 'PASS ✓' : 'FAIL ✕'}`);
  return passed;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const expectedRoster = loadExpectedRoster(opts.rosterPath);

  const dataset = opts.inputPath
    ? loadDatasetFromBackup(opts.inputPath)
    : { students: DEFAULT_STUDENTS, tkaSubmissions: [] };

  const primaryTitle = opts.inputPath
    ? `VALIDASI DATA SISWA DARI FILE (${opts.inputPath})`
    : 'VALIDASI DATA DEFAULT_STUDENTS TERHADAP KONFIGURASI KELAS';

  const report = validateStudentsAgainstKelasConfig(dataset.students, {
    allowedClasses: EXPECTED_CLASSES_CONFIG,
    expectedRoster,
    tkaSubmissions: dataset.tkaSubmissions,
  });

  printReportSection(primaryTitle, report);

  let regressionPassed = true;
  if (opts.runRegressionCheck) {
    regressionPassed = runRegressionVerification();
  }

  if (!regressionPassed || (opts.strict && report.summary.errorCount > 0)) {
    process.exitCode = 1;
  }
}

main();
