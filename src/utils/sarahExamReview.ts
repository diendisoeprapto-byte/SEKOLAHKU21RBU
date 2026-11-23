import {
  CBTExam,
  CBTExamResult,
  CBTQuestion,
  Student,
  TKAQuestion,
  isAbkExcludedFromTka,
} from '../types';
import {
  getStoredCBTExams,
  getStoredCBTResults,
  getStoredTKAQuestions,
  getStoredTKAResults,
  getStoredTKASubmissions,
  isKelas6Class,
  isTkaResultEntry,
  normalizeTkaMapelKey,
  extractBaseTkaPaket,
  TKASubmissionItem,
  TKAMapelScoreKey,
} from './storage';
import { findLiveStudentForRecord } from './tkaFirestore';
import { evaluateQuestionScore } from './answerChecker';
import {
  stripQuestionTags,
  resolveBenarSalahItems,
  resolveMenjodohkanData,
} from './questionFormat';

export interface SarahReviewedQuestionItem {
  no: number;
  id: string;
  tipe: string;
  pertanyaan: string;
  opsi?: string[];
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  bobot: number;
  pembahasan?: string;
}

export interface SarahCompletedExamReview {
  examId: string;
  category: 'cbt' | 'tka';
  judul: string;
  mapel: string;
  paketName: string;
  hasCompleted: true;
  score: number;
  waktuSelesai: string;
  recordedAt: number;
  totalQuestions: number;
  correctCount: number;
  questions: SarahReviewedQuestionItem[];
}

export interface SarahUncompletedExamMeta {
  examId: string;
  category: 'cbt' | 'tka';
  judul: string;
  mapel: string;
  paketName: string;
  status: 'belum_dikerjakan';
}

export interface SarahExamReviewBundle {
  completedExams: SarahCompletedExamReview[];
  uncompletedExams: SarahUncompletedExamMeta[];
}

const SAMPLE_CBT_LOOKUP: Record<string, CBTExam> = {
  cbt_ipas_as1: {
    id: 'cbt_ipas_as1',
    judul: 'Sumatif 1 (AS 1) - Organ Tubuh & Sistem Pernapasan Manusia (Paket 1)',
    mapel: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
    kelas: 'Semua Kelas',
    paketName: 'Sumatif 1 (AS 1)',
    subPaket: 'Paket 1',
    durasiMenit: 60,
    aktif: false,
    soalList: [
      {
        id: 'cbt_q1',
        tipe: 'pg',
        pertanyaan:
          'Organ tubuh manusia yang berfungsi sebagai organ utama pernapasan dan tempat pertukaran oksigen dengan karbondioksida adalah...',
        opsi: ['A. Paru-paru', 'B. Jantung', 'C. Lambung', 'D. Ginjal'],
        kunciJawaban: 'A',
        bobot: 20,
        pembahasan:
          'Paru-paru adalah organ utama sistem pernapasan manusia tempat terjadinya difusi O2 dan CO2 di alveolus.',
      },
      {
        id: 'cbt_q2',
        tipe: 'pg',
        pertanyaan:
          'Bagian darah yang bertugas mengangkut oksigen ke seluruh sel-sel tubuh adalah...',
        opsi: [
          'A. Sel darah putih (Leukosit)',
          'B. Sel darah merah (Eritrosit)',
          'C. Keping darah (Trombosit)',
          'D. Plasma darah',
        ],
        kunciJawaban: 'B',
        bobot: 20,
        pembahasan:
          'Eritrosit mengandung hemoglobin yang mengikat oksigen untuk diedarkan ke seluruh tubuh.',
      },
      {
        id: 'cbt_q3',
        tipe: 'pg',
        pertanyaan: 'Hewan berikut ini bernapas menggunakan trakea adalah...',
        opsi: ['A. Ikan mas', 'B. Belalang', 'C. Katak dewasa', 'D. Cacing tanah'],
        kunciJawaban: 'B',
        bobot: 20,
        pembahasan: 'Serangga seperti belalang bernapas menggunakan pembuluh trakea.',
      },
      {
        id: 'cbt_q4',
        tipe: 'pg',
        pertanyaan:
          'Peredaran darah dari jantung menuju ke seluruh tubuh dan kembali lagi ke jantung disebut...',
        opsi: [
          'A. Peredaran darah kecil',
          'B. Peredaran darah besar',
          'C. Peredaran darah terbuka',
          'D. Peredaran getah bening',
        ],
        kunciJawaban: 'B',
        bobot: 20,
        pembahasan:
          'Peredaran darah sistemik (besar) mengalirkan darah dari ventrikel kiri jantung ke seluruh tubuh lalu kembali ke atrium kanan.',
      },
      {
        id: 'cbt_q5',
        tipe: 'pg',
        pertanyaan:
          'Upaya menjaga kesehatan sistem pernapasan pada masa pancaroba adalah...',
        opsi: [
          'A. Merokok di ruangan tertutup',
          'B. Menggunakan masker saat berdebu dan berolahraga rutin',
          'C. Tidur larut malam setiap hari',
          'D. Mengonsumsi makanan berpengawet tinggi',
        ],
        kunciJawaban: 'B',
        bobot: 20,
        pembahasan:
          'Menggunakan masker dan berolahraga secara teratur menjaga imunitas dan saluran pernapasan tetap bersih.',
      },
    ],
  },
  cbt_mtk_as2: {
    id: 'cbt_mtk_as2',
    judul: 'Sumatif 2 (AS 2) - Operasi Hitung Campuran Bilangan Bulat (Paket 1)',
    mapel: 'Matematika',
    kelas: 'Semua Kelas',
    paketName: 'Sumatif 2 (AS 2)',
    subPaket: 'Paket 1',
    durasiMenit: 60,
    aktif: false,
    soalList: [
      {
        id: 'cbt_m1',
        tipe: 'pg',
        pertanyaan: 'Hasil dari 150 + 25 × 4 - 100 adalah...',
        opsi: ['A. 150', 'B. 600', 'C. 175', 'D. 250'],
        kunciJawaban: 'A',
        bobot: 25,
        pembahasan:
          'Dahulukan perkalian: 25 x 4 = 100. Kemudian 150 + 100 - 100 = 150.',
      },
      {
        id: 'cbt_m2',
        tipe: 'pg',
        pertanyaan:
          'Suhu di dalam lemari es mula-mula -4°C. Ketika listrik padam, suhu naik 2°C setiap 10 menit. Setelah 30 menit, suhu lemari es menjadi...',
        opsi: ['A. 2°C', 'B. -2°C', 'C. 6°C', 'D. 0°C'],
        kunciJawaban: 'A',
        bobot: 25,
        pembahasan:
          'Kenaikan suhu = (30 / 10) x 2°C = 6°C. Suhu akhir = -4°C + 6°C = 2°C.',
      },
      {
        id: 'cbt_m3',
        tipe: 'pg',
        pertanyaan: 'FPB dari bilangan 36, 54, dan 72 adalah...',
        opsi: ['A. 9', 'B. 12', 'C. 18', 'D. 24'],
        kunciJawaban: 'C',
        bobot: 25,
        pembahasan: 'Faktor persekutuan terbesar dari 36, 54, dan 72 adalah 18.',
      },
      {
        id: 'cbt_m4',
        tipe: 'pg',
        pertanyaan:
          'Ibu memiliki 3 kantong beras, masing-masing berisi 2,5 kg. Beras tersebut dibagikan kepada 5 orang tetangga sama rata. Setiap tetangga menerima...',
        opsi: ['A. 1,5 kg', 'B. 1,2 kg', 'C. 1,8 kg', 'D. 2,0 kg'],
        kunciJawaban: 'A',
        bobot: 25,
        pembahasan: 'Total beras = 3 x 2,5 = 7,5 kg. Dibagi 5 orang = 7,5 / 5 = 1,5 kg.',
      },
    ],
  },
  cbt_asts_indo: {
    id: 'cbt_asts_indo',
    judul: 'ASTS (Sumatif Tengah Semester) - Bahasa Indonesia (Paket 1)',
    mapel: 'Bahasa Indonesia',
    kelas: 'Semua Kelas',
    paketName: 'ASTS (Sumatif Tengah Semester)',
    subPaket: 'Paket 1',
    durasiMenit: 90,
    aktif: false,
    soalList: [
      {
        id: 'cbt_bi1',
        tipe: 'pg',
        pertanyaan:
          'Teks yang berisi penjelasan mengenai peristiwa alam, sosial, atau budaya secara ilmiah disebut teks...',
        opsi: ['A. Narasi', 'B. Eksplanasi', 'C. Fiksi', 'D. Deskripsi'],
        kunciJawaban: 'B',
        bobot: 33,
        pembahasan:
          'Teks eksplanasi menjelaskan proses terjadinya suatu fenomena alam atau sosial dengan kausalitas.',
      },
      {
        id: 'cbt_bi2',
        tipe: 'pg',
        pertanyaan: 'Ide pokok pada paragraf induktif berada di...',
        opsi: [
          'A. Awal paragraf',
          'B. Akhir paragraf',
          'C. Awal dan akhir paragraf',
          'D. Tengah paragraf',
        ],
        kunciJawaban: 'B',
        bobot: 33,
        pembahasan:
          'Paragraf induktif menyajikan kalimat-kalimat penjelas terlebih dahulu kemudian disimpulkan di akhir paragraf.',
      },
      {
        id: 'cbt_bi3',
        tipe: 'pg',
        pertanyaan:
          'Kata tanya yang tepat untuk menggali alasan atau penyebab terjadinya suatu fenomena adalah...',
        opsi: ['A. Siapa', 'B. Kapan', 'C. Mengapa', 'D. Dimana'],
        kunciJawaban: 'C',
        bobot: 34,
        pembahasan: 'Kata tanya "Mengapa" menanyakan sebab atau alasan peristiwa terjadi.',
      },
    ],
  },
  cbt_asas_pancasila: {
    id: 'cbt_asas_pancasila',
    judul: 'ASAS (Sumatif Akhir Semester) - Pendidikan Pancasila (Paket 1)',
    mapel: 'Pendidikan Pancasila',
    kelas: 'Semua Kelas',
    paketName: 'ASAS (Sumatif Akhir Semester)',
    subPaket: 'Paket 1',
    durasiMenit: 90,
    aktif: false,
    soalList: [
      {
        id: 'cbt_p1',
        tipe: 'pg',
        pertanyaan:
          'Sila dalam Pancasila yang mendasari pentingnya musyawarah untuk mencapai mufakat adalah sila ke-...',
        opsi: ['A. 2', 'B. 3', 'C. 4', 'D. 5'],
        kunciJawaban: 'C',
        bobot: 34,
        pembahasan:
          'Sila ke-4: Kerakyatan yang Dipimpin oleh Hikmat Kebijaksanaan dalam Permusyawaratan/Perwakilan.',
      },
      {
        id: 'cbt_p2',
        tipe: 'pg',
        pertanyaan:
          'Mendapatkan kasih sayang dan pendidikan yang layak dari orang tua di rumah merupakan contoh...',
        opsi: ['A. Hak anak', 'B. Kewajiban anak', 'C. Hukuman anak', 'D. Paksaan anak'],
        kunciJawaban: 'A',
        bobot: 33,
        pembahasan:
          'Kasih sayang dan pendidikan adalah hak dasar yang wajib dipenuhi orang tua untuk anak.',
      },
      {
        id: 'cbt_p3',
        tipe: 'pg',
        pertanyaan:
          'Sikap yang harus kita tunjukkan ketika pendapat kita tidak diterima dalam musyawarah kelas adalah...',
        opsi: [
          'A. Marah dan meninggalkan ruangan',
          'B. Menerima dengan lapang dada demi kepentingan bersama',
          'C. Memaksa teman agar sependapat',
          'D. Mogok belajar',
        ],
        kunciJawaban: 'B',
        bobot: 33,
        pembahasan:
          'Musyawarah menuntut sikap lapang dada menghargai keputusan mufakat bersama.',
      },
    ],
  },
};

function slugifyTka(val: string): string {
  return String(val || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeKelasStr(raw?: string): string {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function doesCbtMatchStudentClass(examKelas?: string, studentKelas?: string): boolean {
  const e = normalizeKelasStr(examKelas);
  const s = normalizeKelasStr(studentKelas);
  if (!e || e === 'semua' || e === 'all' || e.includes('semua')) return true;
  if (!s) return true;
  if (e === s) return true;
  const eDigit = e.match(/([1-6])/);
  const sDigit = s.match(/([1-6])/);
  if (eDigit && sDigit && eDigit[1] === sDigit[1] && !/[a-d]$/i.test(e)) {
    return true;
  }
  return false;
}

function doesResultBelongToStudent(
  res: { studentId?: string; studentName?: string; nisn?: string },
  student: Student
): boolean {
  const matched = findLiveStudentForRecord([student], {
    studentId: res.studentId,
    nisn: res.nisn,
    studentName: res.studentName,
  });
  if (matched && matched.id === student.id) return true;
  if (res.studentId && res.studentId === student.id) return true;
  if (res.nisn && student.nisn && res.nisn.trim() === student.nisn.trim()) return true;
  if (
    res.studentName &&
    student.nama &&
    res.studentName.trim().toLowerCase() === student.nama.trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

function formatRawAnswerValue(ans: any, q: Partial<CBTQuestion>): string {
  if (ans === undefined || ans === null || ans === '') return '(Belum dijawab)';
  if (q.tipe === 'benar_salah') {
    const items = resolveBenarSalahItems({
      benarSalahItems: q.benarSalahItems,
      opsi: q.opsi,
      kunciJawaban: q.kunciJawaban,
    });
    if (items.length > 0 && typeof ans === 'object' && !Array.isArray(ans)) {
      return items
        .map((it, idx) => {
          const val = ans[it.id] ?? ans[String(idx)] ?? ans[String(idx + 1)] ?? '-';
          return `${idx + 1}. ${val}`;
        })
        .join('; ');
    }
  }
  if (q.tipe === 'menjodohkan' && typeof ans === 'object' && !Array.isArray(ans)) {
    const entries = Object.entries(ans);
    if (entries.length === 0) return '(Belum dijawab)';
    return entries.map(([k, v]) => `${k}->${v}`).join(', ');
  }
  if (Array.isArray(ans)) {
    return ans
      .map((item) => {
        if (item && typeof item === 'object') return String(item.text || item.key || '');
        return String(item || '');
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof ans === 'object') {
    if (ans.key && ans.text) {
      return String(ans.text).startsWith(String(ans.key))
        ? String(ans.text)
        : `${ans.key}. ${ans.text}`;
    }
    return String(ans.text || ans.key || JSON.stringify(ans));
  }
  return String(ans);
}

function formatCorrectKey(q: Partial<CBTQuestion>): string {
  if (q.tipe === 'benar_salah') {
    const items = resolveBenarSalahItems({
      benarSalahItems: q.benarSalahItems,
      opsi: q.opsi,
      kunciJawaban: q.kunciJawaban,
    });
    if (items.length > 0) {
      return items.map((it, idx) => `${idx + 1}. ${it.kunci}`).join('; ');
    }
  }
  if (q.tipe === 'menjodohkan') {
    const md = resolveMenjodohkanData({
      menjodohkanData: q.menjodohkanData,
      kunciJawaban: q.kunciJawaban,
    });
    if (md && md.pasangan) {
      return Object.entries(md.pasangan)
        .map(([k, v]) => `${k}->${v}`)
        .join(', ');
    }
  }
  if (Array.isArray(q.kunciJawaban)) {
    return q.kunciJawaban.join(', ');
  }
  return String(q.kunciJawaban || '-');
}

function buildReviewedQuestions(
  soalList: CBTQuestion[],
  jawabanSiswa: Record<string, any> | undefined
): { questions: SarahReviewedQuestionItem[]; correctCount: number } {
  const ansMap = jawabanSiswa && typeof jawabanSiswa === 'object' ? jawabanSiswa : {};
  let correctCount = 0;

  const questions: SarahReviewedQuestionItem[] = soalList.slice(0, 50).map((q, idx) => {
    const rawAns = ansMap[q.id];
    const evalRes = evaluateQuestionScore(
      q.tipe,
      rawAns,
      q.kunciJawaban,
      q.bobot || 10,
      q.opsi,
      q
    );
    if (evalRes.isCorrect) correctCount++;

    return {
      no: idx + 1,
      id: q.id,
      tipe: q.tipe,
      pertanyaan: stripQuestionTags(q.pertanyaan || '').slice(0, 420),
      opsi: Array.isArray(q.opsi) ? q.opsi.slice(0, 6).map((o) => stripQuestionTags(o).slice(0, 180)) : undefined,
      studentAnswer: formatRawAnswerValue(rawAns, q).slice(0, 240),
      correctAnswer: formatCorrectKey(q).slice(0, 240),
      isCorrect: evalRes.isCorrect,
      bobot: q.bobot || 10,
      pembahasan: q.pembahasan ? stripQuestionTags(q.pembahasan).slice(0, 320) : undefined,
    };
  });

  return { questions, correctCount };
}

export function buildStudentExamReviewBundle(
  student: Student | undefined,
  liveCbtExams?: CBTExam[]
): SarahExamReviewBundle {
  if (!student) {
    return { completedExams: [], uncompletedExams: [] };
  }

  const storedCbtExams = getStoredCBTExams();
  const cbtExams =
    Array.isArray(liveCbtExams) && liveCbtExams.length > 0 ? liveCbtExams : storedCbtExams;
  const tkaQuestions = getStoredTKAQuestions();
  const cbtResults = getStoredCBTResults();
  const tkaResults = getStoredTKAResults();
  const tkaSubmissions = getStoredTKASubmissions();

  const excludeFromTka = isAbkExcludedFromTka(student);
  const completedMap = new Map<string, SarahCompletedExamReview>();

  const findMatchingCbtExam = (res: CBTExamResult): CBTExam | undefined => {
    const byId = cbtExams.find((ex) => ex.id === res.examId) || SAMPLE_CBT_LOOKUP[res.examId];
    if (byId) return byId;
    const targetMapel = (res.mapel || '').trim().toLowerCase();
    const targetPaket = (res.paketName || '').trim().toLowerCase();
    return cbtExams.find(
      (ex) =>
        (!targetMapel || (ex.mapel || '').trim().toLowerCase() === targetMapel) &&
        (!targetPaket ||
          (ex.paketName || ex.judul || '').toLowerCase().includes(targetPaket))
    );
  };

  // Group TKA questions by (paket, normalizedMapel)
  const tkaGroupMap = new Map<
    string,
    { paketName: string; mapel: string; questions: TKAQuestion[]; examId: string }
  >();
  tkaQuestions.forEach((q) => {
    const paketName = q.jenisTka || 'Simulasi 1';
    const normMapel = normalizeTkaMapelKey(q.mapel || 'Bahasa Indonesia');
    const key = `${paketName}__${normMapel}`;
    if (!tkaGroupMap.has(key)) {
      tkaGroupMap.set(key, {
        paketName,
        mapel: q.mapel || normMapel,
        questions: [],
        examId: `tka_live_${slugifyTka(paketName)}_${slugifyTka(q.mapel || normMapel)}`,
      });
    }
    tkaGroupMap.get(key)!.questions.push(q);
  });

  // 1. Scan CBT & TKA exam results submitted by this student
  const combinedResults = [...cbtResults, ...tkaResults];
  combinedResults.forEach((res) => {
    if (!doesResultBelongToStudent(res, student)) return;

    const isTka = isTkaResultEntry(res);
    if (isTka && excludeFromTka) return;

    const score = Math.max(0, Math.min(100, Math.round(Number(res.nilai) || 0)));
    const waktuLabel = res.tanggal
      ? `${res.tanggal} · ${res.waktuSelesai || '-'}`
      : res.waktuSelesai || '-';
    const recordedAt = Number(res.recordedAt) || 0;

    if (!isTka) {
      const examObj = findMatchingCbtExam(res);
      const examId = examObj?.id || res.examId;
      const judul = examObj?.judul || res.judul || `Ujian CBT ${res.mapel || ''}`.trim();
      const mapel = examObj?.mapel || res.mapel || 'Umum';
      const paketName = examObj?.paketName || res.paketName || judul;
      const soalList = examObj?.soalList || [];
      const { questions, correctCount } = buildReviewedQuestions(soalList, res.jawabanSiswa);
      const dedupKey = `cbt:${examId}`;

      const prev = completedMap.get(dedupKey);
      if (!prev || recordedAt >= prev.recordedAt) {
        completedMap.set(dedupKey, {
          examId,
          category: 'cbt',
          judul,
          mapel,
          paketName,
          hasCompleted: true,
          score,
          waktuSelesai: waktuLabel,
          recordedAt,
          totalQuestions: soalList.length,
          correctCount,
          questions,
        });
      }
    } else {
      const paketName = extractBaseTkaPaket(
        res.paketName ||
          (res.judul ? res.judul.split(' - ')[0] : '') ||
          'Simulasi 1'
      );
      const rawMapel = res.mapel || 'Bahasa Indonesia';
      const normMapel = normalizeTkaMapelKey(rawMapel);
      const grp = tkaGroupMap.get(`${paketName}__${normMapel}`);
      const examId =
        res.examId || grp?.examId || `tka_live_${slugifyTka(paketName)}_${slugifyTka(normMapel)}`;
      const soalList = grp?.questions || [];
      const { questions, correctCount } = buildReviewedQuestions(soalList, res.jawabanSiswa);
      const dedupKey = `tka:${paketName.toLowerCase()}__${normMapel}`;

      const prev = completedMap.get(dedupKey);
      if (!prev || recordedAt >= prev.recordedAt || questions.length > prev.questions.length) {
        completedMap.set(dedupKey, {
          examId,
          category: 'tka',
          judul: res.judul || `${paketName} - ${grp?.mapel || normMapel}`,
          mapel: grp?.mapel || rawMapel,
          paketName,
          hasCompleted: true,
          score,
          waktuSelesai: waktuLabel,
          recordedAt,
          totalQuestions: soalList.length,
          correctCount,
          questions,
        });
      }
    }
  });

  // 2. Also incorporate TKA Submissions (in case student took or recovered TKA scores via TKASubmissionItem)
  if (!excludeFromTka) {
    tkaSubmissions.forEach((sub: TKASubmissionItem) => {
      if (!doesResultBelongToStudent(sub, student)) return;
      const paketName = sub.paketDasar || extractBaseTkaPaket(sub.paket);
      const completedKeys: TKAMapelScoreKey[] = Array.isArray(sub.completedMapels) && sub.completedMapels.length > 0
        ? sub.completedMapels.map((m) => normalizeTkaMapelKey(m))
        : (Object.keys(sub.scoresPerMapel || {}) as TKAMapelScoreKey[]).filter(
            (k) => Number(sub.scoresPerMapel?.[k] ?? 0) > 0
          );

      completedKeys.forEach((normMapel) => {
        const scoreVal = Number(sub.scoresPerMapel?.[normMapel] ?? sub.skorTotal ?? 0);
        const grp = tkaGroupMap.get(`${paketName}__${normMapel}`);
        const examId = grp?.examId || `tka_live_${slugifyTka(paketName)}_${slugifyTka(normMapel)}`;
        const soalList = grp?.questions || [];
        const { questions, correctCount } = buildReviewedQuestions(soalList, sub.answers);
        const dedupKey = `tka:${paketName.toLowerCase()}__${normMapel}`;

        const prev = completedMap.get(dedupKey);
        if (!prev) {
          completedMap.set(dedupKey, {
            examId,
            category: 'tka',
            judul: `${paketName} - ${grp?.mapel || normMapel}`,
            mapel: grp?.mapel || normMapel,
            paketName,
            hasCompleted: true,
            score: Math.max(0, Math.min(100, Math.round(scoreVal))),
            waktuSelesai: sub.tanggalUjian || '-',
            recordedAt: Date.parse(sub.updatedAt || '') || 0,
            totalQuestions: soalList.length,
            correctCount,
            questions,
          });
        } else if (prev.questions.length === 0 && questions.length > 0) {
          completedMap.set(dedupKey, {
            ...prev,
            totalQuestions: soalList.length,
            correctCount,
            questions,
          });
        }
      });
    });
  }

  const completedExams = Array.from(completedMap.values()).sort(
    (a, b) => b.recordedAt - a.recordedAt
  );
  const completedIds = new Set(completedExams.map((e) => e.examId));
  const completedTkaKeys = new Set(
    completedExams
      .filter((e) => e.category === 'tka')
      .map((e) => `${e.paketName.toLowerCase()}__${normalizeTkaMapelKey(e.mapel)}`)
  );

  // 3. Build uncompletedExams metadata-only blocklist (STRICTLY NO questions/answers/keys!)
  const uncompletedExams: SarahUncompletedExamMeta[] = [];

  cbtExams.forEach((ex) => {
    if (!Array.isArray(ex.soalList) || ex.soalList.length === 0) return;
    if (!doesCbtMatchStudentClass(ex.kelas, student.kelas)) return;
    if (completedIds.has(ex.id)) return;
    uncompletedExams.push({
      examId: ex.id,
      category: 'cbt',
      judul: ex.judul || `${ex.paketName || 'CBT'} - ${ex.mapel}`,
      mapel: ex.mapel,
      paketName: ex.paketName || ex.judul,
      status: 'belum_dikerjakan',
    });
  });

  if (!excludeFromTka && isKelas6Class(student.kelas)) {
    tkaGroupMap.forEach((grp) => {
      const tkaKey = `${grp.paketName.toLowerCase()}__${normalizeTkaMapelKey(grp.mapel)}`;
      if (completedTkaKeys.has(tkaKey) || completedIds.has(grp.examId)) return;
      uncompletedExams.push({
        examId: grp.examId,
        category: 'tka',
        judul: `${grp.paketName} - ${grp.mapel}`,
        mapel: grp.mapel,
        paketName: grp.paketName,
        status: 'belum_dikerjakan',
      });
    });
  }

  return { completedExams, uncompletedExams };
}
