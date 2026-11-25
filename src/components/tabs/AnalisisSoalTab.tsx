import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  CheckCircle2,
  TrendingUp,
  Download,
  PieChart as PieIcon,
  Layers,
  FileSpreadsheet,
  Users,
  UserCheck,
  Trash2,
  X,
  Trophy,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { ActiveUser, CBTExam, CBTExamResult, SchoolProfile, Student, Teacher, isSiswaInklusi } from '../../types';
import { MAPEL_LIST } from '../../data/defaultData';
import {
  CLASSES_LIST,
  getStoredStudents,
  getStoredCBTExams,
  getStoredCBTResults,
  clearCBTResultsFromStorage,
  deleteSingleCbtResultFromStorage,
  doesExamResultMatchTarget,
  isTkaResultEntry,
} from '../../utils/storage';
import { evaluateQuestionScore } from '../../utils/answerChecker';
import { stripQuestionTags } from '../../utils/questionFormat';
import { syncAllLocalToCloud } from '../../utils/cloudSync';
import { formatNipLabel, resolveKepalaSekolah, resolveWaliKelas } from '../../utils/teacherSync';
import { doesRecordMatchTerm, isSemesterOneLabel } from '../../utils/semesterUtils';
import { findLiveStudentForRecord } from '../../utils/tkaFirestore';
import {
  clearCbtResultsInFirestore,
  deleteSingleCbtResultFromFirestore,
} from '../../utils/cbtResultFirestore';
import { exportCbtAnalisisToPdf } from '../../utils/analisisReportExport';
import {
  computeExamHotsStats,
  computeTieBreakerBadges,
  formatDurasiDetik,
  parseDurasiToSeconds,
  sortExamRankingsWithTieBreaker,
} from '../../utils/examRanking';
import {
  SarahExamAnalysisPanel,
  SarahAnalysisHardestQuestion,
  SarahAnalysisStudentRow,
} from '../SarahExamAnalysisPanel';
import { AnalisisButirMatrixPanel } from '../AnalisisButirMatrixPanel';

export const PAKET_SOAL_LIST = [
  'Sumatif 1 (AS 1)',
  'Sumatif 2 (AS 2)',
  'Sumatif 3 (AS 3)',
  'Sumatif 4 (AS 4)',
  'Sumatif 5 (AS 5)',
  'Sumatif 6 (AS 6)',
  'Remedial 1',
  'Remedial 2',
  'Remedial 3',
  'Remedial 4',
  'Remedial 5',
  'Remedial 6',
  'Asesmen Sumatif Tengah Semester (ASTS)',
  'Asesmen Sumatif Akhir Semester (ASAS)',
  'Sumatif Inklusi 1',
  'Sumatif Inklusi 2',
  'Sumatif Inklusi 3',
  'Sumatif Inklusi 4',
  'Sumatif Inklusi 5',
  'Sumatif Inklusi 6',
  'Remedial Inklusi 1',
  'Remedial Inklusi 2',
  'Remedial Inklusi 3',
  'Remedial Inklusi 4',
  'Remedial Inklusi 5',
  'Remedial Inklusi 6',
  'ASTS Inklusi',
  'ASAS Inklusi',
  'Sumatif Lingkup Materi CBT',
] as const;

interface Props {
  activeUser?: ActiveUser;
  students?: Student[];
  teachers?: Teacher[];
  profile?: SchoolProfile;
  activeClass?: string;
  activeYear?: string;
  activeSemester?: string;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export const AnalisisSoalTab: React.FC<Props> = ({
  activeUser,
  students: propStudents,
  teachers = [],
  profile,
  activeClass: propActiveClass,
  activeYear = '2026/2027',
  activeSemester = 'Ganjil',
  showToast,
}) => {
  const [selectedMapel, setSelectedMapel] = useState<string>('Ilmu Pengetahuan Alam dan Sosial (IPAS)');
  const [selectedPaket, setSelectedPaket] = useState<string>('Asesmen Sumatif Akhir Semester (ASAS)');
  const [selectedClass, setSelectedClass] = useState<string>(propActiveClass || 'Kelas 6A');
  const [kkm, setKkm] = useState<number>(75);
  const [activeTab, setActiveTab] = useState<'peringkat' | 'grafik' | 'matriks' | 'distribusi' | 'kesukaran'>('peringkat');
  const [activeChartTab, setActiveChartTab] = useState<'kesukaran' | 'pembeda' | 'ketuntasan'>('kesukaran');
  const [isClearModalOpen, setIsClearModalOpen] = useState<boolean>(false);
  const [confirmDeleteStudentRowKey, setConfirmDeleteStudentRowKey] = useState<string | null>(null);
  const [cbtExams, setCbtExams] = useState<CBTExam[]>(() => getStoredCBTExams());
  const [cbtResults, setCbtResults] = useState<CBTExamResult[]>(
    () => getStoredCBTResults().filter((r) => !isTkaResultEntry(r))
  );
  const hasManualFilterRef = React.useRef<boolean>(false);
  const effectiveKkm = Math.min(100, Math.max(0, Number.isFinite(kkm) ? kkm : 75));

  const allStudents = useMemo(
    () => (propStudents && propStudents.length > 0 ? propStudents : getStoredStudents()),
    [propStudents]
  );

  const studentById = useMemo(() => {
    const m = new Map<string, Student>();
    allStudents.forEach((s) => {
      if (s.id) m.set(s.id, s);
    });
    return m;
  }, [allStudents]);

  const studentByName = useMemo(() => {
    const m = new Map<string, Student>();
    allStudents.forEach((s) => {
      if (s.nama) m.set(s.nama.trim().toLowerCase(), s);
    });
    return m;
  }, [allStudents]);

  const examById = useMemo(() => {
    const m = new Map<string, CBTExam>();
    cbtExams.forEach((ex) => {
      if (ex.id) m.set(ex.id, ex);
    });
    return m;
  }, [cbtExams]);

  const termCbtResults = useMemo(
    () => cbtResults.filter((r) => doesRecordMatchTerm(r, activeYear, activeSemester)),
    [cbtResults, activeYear, activeSemester]
  );
  const cbtResultCount = termCbtResults.length;

  React.useEffect(() => {
    const refreshData = () => {
      setCbtExams(getStoredCBTExams());
      setCbtResults(getStoredCBTResults().filter((r) => !isTkaResultEntry(r)));
    };
    window.addEventListener('sekolahku-exam-results-updated', refreshData);
    window.addEventListener('sekolahku-cbt-exams-updated', refreshData);
    window.addEventListener('sekolahku-cloud-sync-updated', refreshData);
    window.addEventListener('storage', refreshData);
    return () => {
      window.removeEventListener('sekolahku-exam-results-updated', refreshData);
      window.removeEventListener('sekolahku-cbt-exams-updated', refreshData);
      window.removeEventListener('sekolahku-cloud-sync-updated', refreshData);
      window.removeEventListener('storage', refreshData);
    };
  }, []);

  const submittedExamBuckets = useMemo(() => {
    const map = new Map<
      string,
      {
        mapel: string;
        paket: string;
        kelas: string;
        count: number;
        latestRecordedAt: number;
        tanggal: string;
      }
    >();

    termCbtResults.forEach((r) => {
      const linkedExam = examById.get(r.examId);
      const linkedStudent = findLiveStudentForRecord(allStudents, {
        studentId: r.studentId,
        nisn: r.nisn,
        studentName: r.studentName,
      });
      const mapel = (r.mapel || linkedExam?.mapel || 'Ilmu Pengetahuan Alam dan Sosial (IPAS)').trim();
      const paket = (
        r.paketName ||
        linkedExam?.paketName ||
        linkedExam?.subPaket ||
        linkedExam?.judul ||
        'Sumatif 1 (AS 1)'
      ).trim();
      const kelas = (linkedStudent?.kelas || linkedExam?.kelas || propActiveClass || 'Kelas 6A').trim();
      const key = `${mapel}::${paket}::${kelas}`;
      const existing = map.get(key);
      const recAt = Number(r.recordedAt || 0);
      if (existing) {
        existing.count += 1;
        if (recAt > existing.latestRecordedAt) {
          existing.latestRecordedAt = recAt;
          if (r.tanggal) existing.tanggal = r.tanggal;
        }
      } else {
        map.set(key, {
          mapel,
          paket,
          kelas,
          count: 1,
          latestRecordedAt: recAt,
          tanggal: r.tanggal || '-',
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.latestRecordedAt - a.latestRecordedAt);
  }, [termCbtResults, examById, studentById, studentByName, propActiveClass]);

  const availableMapels = useMemo(() => {
    const extra = [
      ...cbtExams.map((e) => e.mapel),
      ...submittedExamBuckets.map((b) => b.mapel),
    ].filter((v): v is string => Boolean(v && v.trim()));
    return Array.from(new Set([...MAPEL_LIST, ...extra]));
  }, [cbtExams, submittedExamBuckets]);

  const availablePakets = useMemo(() => {
    const extra = [
      ...cbtExams.map((e) => e.paketName || e.subPaket || e.judul),
      ...submittedExamBuckets.map((b) => b.paket),
    ].filter((v): v is string => Boolean(v && v.trim()));
    return Array.from(new Set([...PAKET_SOAL_LIST, ...extra]));
  }, [cbtExams, submittedExamBuckets]);

  const availableClasses = useMemo(() => {
    const extra = [
      ...cbtExams.map((e) => e.kelas),
      ...submittedExamBuckets.map((b) => b.kelas),
    ].filter((v): v is string => Boolean(v && v.trim()));
    return Array.from(new Set([...CLASSES_LIST, ...extra]));
  }, [cbtExams, submittedExamBuckets]);

  const getResultClass = (r: CBTExamResult): string => {
    const linkedStudent = findLiveStudentForRecord(allStudents, {
      studentId: r.studentId,
      nisn: r.nisn,
      studentName: r.studentName,
    });
    const linkedExam = examById.get(r.examId);
    return (linkedStudent?.kelas || r.kelas || linkedExam?.kelas || '').trim();
  };

  // Auto-select real exam bucket on load/sync if current filter has no real submissions
  React.useEffect(() => {
    if (hasManualFilterRef.current || submittedExamBuckets.length === 0) return;

    const currentHasReal = termCbtResults.some((r) => {
      const rCls = getResultClass(r);
      const classOk = selectedClass === 'all' || !rCls || rCls === selectedClass;
      return classOk && doesExamResultMatchTarget(r, selectedPaket, selectedMapel);
    });

    if (!currentHasReal) {
      const preferred =
        (propActiveClass && submittedExamBuckets.find((b) => b.kelas === propActiveClass)) ||
        submittedExamBuckets[0];
      if (preferred) {
        setSelectedMapel(preferred.mapel);
        setSelectedPaket(preferred.paket);
        setSelectedClass(preferred.kelas);
      }
    }
  }, [submittedExamBuckets, termCbtResults, selectedMapel, selectedPaket, selectedClass, propActiveClass]);

  const executeClearCbtData = (scope: 'paket' | 'all') => {
    if (scope === 'paket') {
      const targetIds = matchingExamResults.map((r) => ({
        examId: r.examId,
        studentId: r.studentId,
        nisn: r.nisn,
      }));
      clearCBTResultsFromStorage({
        scope: 'paket',
        targetPaket: selectedPaket,
        targetMapel: selectedMapel,
      });
      void Promise.allSettled(targetIds.map((item) => deleteSingleCbtResultFromFirestore(item)));
      syncAllLocalToCloud('admin').catch(() => {});
      setCbtResults(getStoredCBTResults().filter((r) => !isTkaResultEntry(r)));
      setIsClearModalOpen(false);
      showToast?.(
        `Data hasil CBT "${selectedPaket}" (${selectedMapel}) berhasil dikosongkan & status performa siswa direset!`,
        'success'
      );
      return;
    }

    clearCBTResultsFromStorage({ scope: 'all' });
    void clearCbtResultsInFirestore();
    syncAllLocalToCloud('admin').catch(() => {});
    setCbtResults([]);
    setIsClearModalOpen(false);
    showToast?.(
      'Seluruh data hasil & analisis CBT berhasil dikosongkan dan status performa siswa direset!',
      'success'
    );
  };

  const handleDeleteSingleAnalisisCbtRow = (studentName: string, res: CBTExamResult) => {
    const remaining = deleteSingleCbtResultFromStorage({
      examId: res.examId,
      studentId: res.studentId,
      recordedAt: res.recordedAt,
      tanggal: res.tanggal,
      waktuSelesai: res.waktuSelesai,
      studentName: studentName || res.studentName,
      mapel: res.mapel || selectedMapel,
      paketName: res.paketName || selectedPaket,
    });
    void deleteSingleCbtResultFromFirestore({
      examId: res.examId,
      studentId: res.studentId,
      nisn: res.nisn,
    });
    setCbtResults(remaining.filter((r) => !isTkaResultEntry(r)));
    setConfirmDeleteStudentRowKey(null);
    syncAllLocalToCloud('admin').catch(() => {});
    showToast?.(`Data nilai CBT milik "${studentName}" berhasil dihapus!`, 'success');
  };

  // Matching real student results for active mapel, paket, and class
  const matchingExamResults = useMemo(() => {
    const mapelLower = selectedMapel.trim().toLowerCase();
    return termCbtResults.filter((r) => {
      const rCls = getResultClass(r);
      if (selectedClass !== 'all' && rCls && rCls !== selectedClass) {
        return false;
      }
      if (r.mapel) {
        const rMapel = r.mapel.trim().toLowerCase();
        if (rMapel && !(rMapel === mapelLower || rMapel.includes(mapelLower) || mapelLower.includes(rMapel))) {
          return false;
        }
      }
      return doesExamResultMatchTarget(r, selectedPaket, selectedMapel);
    });
  }, [termCbtResults, selectedPaket, selectedMapel, selectedClass, studentById, studentByName, examById]);

  // Matching real CBT exam (prioritize exact examId from real student submissions, then Mapel/Paket/Class match)
  const matchingExam = useMemo(() => {
    if (matchingExamResults.length > 0) {
      for (const r of matchingExamResults) {
        const byId = examById.get(r.examId);
        if (byId && Array.isArray(byId.soalList) && byId.soalList.length > 0) {
          return byId;
        }
      }
    }

    const mapelLower = selectedMapel.trim().toLowerCase();
    const paketLower = selectedPaket.trim().toLowerCase();
    const classLower = selectedClass.trim().toLowerCase();
    const gradeMatch = classLower.match(/\d+/)?.[0] || '';

    const candidates = cbtExams.filter((ex) => {
      const exMapel = (ex.mapel || '').trim().toLowerCase();
      const mapelOk =
        Boolean(exMapel) &&
        (exMapel === mapelLower || exMapel.includes(mapelLower) || mapelLower.includes(exMapel));
      if (!mapelOk) return false;

      const exPaket = (ex.paketName || ex.subPaket || ex.judul || '').trim().toLowerCase();
      const paketOk =
        Boolean(exPaket) &&
        (exPaket === paketLower ||
          exPaket.includes(paketLower) ||
          paketLower.includes(exPaket) ||
          (paketLower.includes('asas') && exPaket.includes('asas')) ||
          (paketLower.includes('asts') && exPaket.includes('asts')));
      return paketOk;
    });

    if (candidates.length === 0) return null;
    if (selectedClass === 'all') return candidates[0];
    return (
      candidates.find((c) => (c.kelas || '').toLowerCase() === classLower) ||
      candidates.find((c) => gradeMatch && (c.kelas || '').includes(gradeMatch)) ||
      candidates[0]
    );
  }, [cbtExams, examById, matchingExamResults, selectedMapel, selectedPaket, selectedClass]);

  const isDefaultTerm = activeYear === '2026/2027' && isSemesterOneLabel(activeSemester);

  // Generate analysis rows: prefer real CBT questions/results when available, fallback only for default initial term
  const questionsData = useMemo(() => {
    if (matchingExamResults.length === 0 && !isDefaultTerm) {
      return [];
    }
    if (matchingExam && Array.isArray(matchingExam.soalList) && matchingExam.soalList.length > 0) {
      const typeLabelMap: Record<string, string> = {
        pg: 'Pilihan Ganda (PG)',
        pg_kompleks: 'PG Kompleks',
        benar_salah: 'Benar / Salah',
        menjodohkan: 'Menjodohkan',
        isian: 'Isian Singkat',
        uraian: 'Uraian / Penalaran',
      };
      const hasRealSubs = matchingExamResults.length > 0;
      const sortedSubs = [...matchingExamResults].sort(
        (a, b) => Number(b.nilai ?? b.skor ?? 0) - Number(a.nilai ?? a.skor ?? 0)
      );
      const half = Math.max(1, Math.floor(sortedSubs.length / 2));
      const upperGroup = sortedSubs.slice(0, half);
      const lowerGroup = sortedSubs.slice(Math.max(0, sortedSubs.length - half));

      return matchingExam.soalList.map((q, idx) => {
        if (!hasRealSubs) {
          const seedBase = (idx * 11 + selectedMapel.length + selectedPaket.length) % 10;
          const tkValue = Number((0.42 + seedBase * 0.045).toFixed(2));
          const tkLabel = tkValue > 0.7 ? 'Mudah' : tkValue >= 0.3 ? 'Sedang' : 'Sukar';
          const dpValue = Number((0.28 + ((idx * 7) % 5) * 0.05).toFixed(2));
          const dpLabel =
            dpValue >= 0.4
              ? 'Sangat Baik'
              : dpValue >= 0.3
              ? 'Baik'
              : dpValue >= 0.2
              ? 'Cukup'
              : 'Perlu Revisi';
          const ketuntasanPct = Math.round(tkValue * 100);
          return {
            no: idx + 1,
            pertanyaan: stripQuestionTags(q.pertanyaan) || `Butir Soal No. ${idx + 1}`,
            tipe: typeLabelMap[q.tipe] || q.tipe,
            bobot: q.bobot || 10,
            tkValue,
            tkLabel,
            dpValue,
            dpLabel,
            ketuntasanPct,
            pengecoh: dpValue >= 0.3 ? 'Efektif (Simulasi Awal)' : 'Cukup Efektif',
            status: dpValue >= 0.3 ? 'Diterima Tanpa Revisi' : 'Diterima dengan Revisi',
          };
        }

        let correctCount = 0;
        matchingExamResults.forEach((res) => {
          const evalRes = evaluateQuestionScore(
            q.tipe,
            res.jawabanSiswa ? res.jawabanSiswa[q.id] : undefined,
            q.kunciJawaban,
            q.bobot || 10,
            q.opsi,
            q
          );
          if (evalRes.isCorrect) correctCount++;
        });

        let upperCorrect = 0;
        upperGroup.forEach((res) => {
          const evalRes = evaluateQuestionScore(
            q.tipe,
            res.jawabanSiswa ? res.jawabanSiswa[q.id] : undefined,
            q.kunciJawaban,
            q.bobot || 10,
            q.opsi,
            q
          );
          if (evalRes.isCorrect) upperCorrect++;
        });

        let lowerCorrect = 0;
        lowerGroup.forEach((res) => {
          const evalRes = evaluateQuestionScore(
            q.tipe,
            res.jawabanSiswa ? res.jawabanSiswa[q.id] : undefined,
            q.kunciJawaban,
            q.bobot || 10,
            q.opsi,
            q
          );
          if (evalRes.isCorrect) lowerCorrect++;
        });

        const totalParticipants = matchingExamResults.length;
        const tkValue = Number((correctCount / totalParticipants).toFixed(2));
        const tkLabel = tkValue > 0.7 ? 'Mudah' : tkValue >= 0.3 ? 'Sedang' : 'Sukar';
        const ketuntasanPct = Math.round((correctCount / totalParticipants) * 100);
        const dpValue = Number(((upperCorrect - lowerCorrect) / half).toFixed(2));
        const dpLabel =
          dpValue >= 0.4
            ? 'Sangat Baik'
            : dpValue >= 0.3
            ? 'Baik'
            : dpValue >= 0.2
            ? 'Cukup'
            : 'Perlu Revisi';
        const pengecoh =
          dpValue >= 0.35
            ? 'Efektif'
            : dpValue >= 0.2
            ? 'Cukup Efektif'
            : 'Perlu Revisi Pengecoh';
        const status = dpValue >= 0.2 ? 'Diterima Tanpa Revisi' : 'Diterima dengan Revisi';

        return {
          no: idx + 1,
          pertanyaan: stripQuestionTags(q.pertanyaan) || `Butir Soal No. ${idx + 1}`,
          tipe: typeLabelMap[q.tipe] || q.tipe,
          bobot: q.bobot || 10,
          tkValue,
          tkLabel,
          dpValue,
          dpLabel,
          ketuntasanPct,
          pengecoh,
          status,
        };
      });
    }

    const isIpas = selectedMapel.includes('IPAS');
    const isMat = selectedMapel.includes('Matematika');
    const isIndo = selectedMapel.includes('Indonesia');
    const isInggris = selectedMapel.includes('Inggris');
    const isKka = selectedMapel.includes('Koding') || selectedMapel.includes('KKA');

    return [
      {
        no: 1,
        pertanyaan: isIpas
          ? 'Organ tubuh manusia yang berfungsi memompa darah ke seluruh tubuh adalah...'
          : isMat
          ? 'Hasil operasi hitung campuran dari 125 + 45 x 12 - 250 adalah...'
          : isIndo
          ? 'Ide pokok atau gagasan utama pada paragraf deduktif terletak pada...'
          : isInggris
          ? 'What is the main function of the digestive system in humans?'
          : isKka
          ? 'Dalam berpikir komputasional, langkah memecah masalah kompleks menjadi bagian-bagian kecil disebut...'
          : `Soal butir 1 evaluasi capaian materi ${selectedMapel}...`,
        tipe: 'Pilihan Ganda (PG)',
        bobot: 15,
        tkValue: 0.78, // Tingkat Kesukaran (TK)
        tkLabel: 'Mudah',
        dpValue: 0.42, // Daya Pembeda (DP)
        dpLabel: 'Sangat Baik',
        ketuntasanPct: 92,
        pengecoh: 'Efektif',
        status: 'Diterima Tanpa Revisi',
      },
      {
        no: 2,
        pertanyaan: isIpas
          ? 'Manakah dari sumber energi berikut yang termasuk energi terbarukan ramah lingkungan?'
          : isMat
          ? 'Sebuah bak penampungan air berbentuk kubus memiliki panjang rusuk 80 cm. Volume air maksimal adalah...'
          : isIndo
          ? 'Watak tokoh kancil yang cerdik mencari jalan keluar saat terjebak dalam sumur mencerminkan nilai...'
          : isInggris
          ? 'Which of the following activities is best done during the morning?'
          : isKka
          ? 'Manakah dari contoh perangkat lunak berikut yang menggunakan Kecerdasan Artifisial (AI) dalam mengenali suara atau gambar?'
          : `Soal butir 2 pemahaman konseptual ${selectedMapel}...`,
        tipe: 'PG Kompleks',
        bobot: 20,
        tkValue: 0.54,
        tkLabel: 'Sedang',
        dpValue: 0.38,
        dpLabel: 'Baik',
        ketuntasanPct: 82,
        pengecoh: 'Efektif',
        status: 'Diterima Tanpa Revisi',
      },
      {
        no: 3,
        pertanyaan: isIpas
          ? 'Rotasi bumi mengakibatkan terjadinya peristiwa siang dan malam serta perbedaan zona waktu.'
          : isMat
          ? 'KPK dan FPB dari bilangan 24, 36, dan 48 berturut-turut adalah...'
          : isIndo
          ? 'Antonim dari kata "eksklusif" dan "statis" dalam teks artikel ilmiah di atas adalah...'
          : isInggris
          ? 'Fill in the blanks: My sister ... to the school library every Tuesday.'
          : isKka
          ? 'Blok perulangan (loop) "repeat 4 times" akan menjalankan perintah di dalamnya sebanyak empat kali berturut-turut.'
          : `Soal butir 3 aplikasi penerapan prinsip ${selectedMapel}...`,
        tipe: 'Benar / Salah',
        bobot: 15,
        tkValue: 0.65,
        tkLabel: 'Sedang',
        dpValue: 0.45,
        dpLabel: 'Sangat Baik',
        ketuntasanPct: 88,
        pengecoh: 'Efektif',
        status: 'Diterima Tanpa Revisi',
      },
      {
        no: 4,
        pertanyaan: isIpas
          ? 'Jodohkan hewan berikut dengan cara perkembangbiakannya: Kucing, Ayam, Platypus.'
          : isMat
          ? 'Diagram lingkaran menunjukkan hobi 40 siswa. Jika bulutangkis 25%, banyak siswa penyuka bulutangkis adalah...'
          : isIndo
          ? 'Pasangkan kalimat berikut dengan jenis majas yang digunakan secara tepat.'
          : isInggris
          ? 'Match the animals with their habitats correctly: Camel, Penguin, Dolphin.'
          : isKka
          ? 'Pasangkan pilar berpikir komputasional berikut dengan definisinya: Dekomposisi, Abstraksi, Algoritma.'
          : `Soal butir 4 analisis komparasi indikator ${selectedMapel}...`,
        tipe: 'Menjodohkan',
        bobot: 15,
        tkValue: 0.48,
        tkLabel: 'Sedang',
        dpValue: 0.34,
        dpLabel: 'Baik',
        ketuntasanPct: 76,
        pengecoh: 'Cukup Efektif',
        status: 'Diterima Tanpa Revisi',
      },
      {
        no: 5,
        pertanyaan: isIpas
          ? 'Proses fotosintesis pada tumbuhan hijau menghasilkan zat glukosa dan...'
          : isMat
          ? 'Sebuah toko memberikan diskon 20% untuk tas seharga Rp150.000,00. Berapa harga setelah diskon?'
          : isIndo
          ? 'Tuliskan simpulan isi paragraf argumentatif mengenai pelestarian lingkungan kali bersih!'
          : isInggris
          ? 'What is the synonym of the word "tremendous" in paragraph two?'
          : isKka
          ? 'Struktur percabangan logika yang mengecek apakah sebuah syarat terpenuhi disebut kondisi...'
          : `Soal butir 5 isian singkat kompetensi ${selectedMapel}...`,
        tipe: 'Isian Singkat',
        bobot: 15,
        tkValue: 0.28,
        tkLabel: 'Sukar',
        dpValue: 0.32,
        dpLabel: 'Baik',
        ketuntasanPct: 68,
        pengecoh: 'Perlu Revisi Pengecoh',
        status: 'Diterima dengan Revisi',
      },
      {
        no: 6,
        pertanyaan: isIpas
          ? 'Jelaskan mengapa rangkaian listrik di rumah tangga dipasang secara paralel dan bukan seri!'
          : isMat
          ? 'Hitunglah rata-rata (mean) dan median dari data nilai sumatif: 70, 80, 85, 90, 75, 80, 95!'
          : isIndo
          ? 'Susunlah sebuah teks pidato persuasif singkat bertema "Gerakan 7 Kebiasaan Anak Indonesia Hebat"!'
          : isInggris
          ? 'Write three sentences describing your daily morning routine before going to school.'
          : isKka
          ? 'Jelaskan 2 cara menjaga keamanan data pribadi dan memverifikasi kebenaran informasi saat menggunakan asisten Kecerdasan Artifisial!'
          : `Soal butir 6 penalaran tingkat tinggi (HOTS) ${selectedMapel}...`,
        tipe: 'Uraian / Penalaran',
        bobot: 20,
        tkValue: 0.24,
        tkLabel: 'Sukar',
        dpValue: 0.40,
        dpLabel: 'Sangat Baik',
        ketuntasanPct: 64,
        pengecoh: 'Efektif',
        status: 'Diterima Tanpa Revisi',
      },
    ];
  }, [selectedMapel, selectedPaket, matchingExam, matchingExamResults, isDefaultTerm]);

  // Aggregate stats
  const questionCount = questionsData.length;
  const totalQuestions = Math.max(1, questionCount);
  const mudahCount = questionsData.filter((q) => q.tkLabel === 'Mudah').length;
  const sedangCount = questionsData.filter((q) => q.tkLabel === 'Sedang').length;
  const sukarCount = questionsData.filter((q) => q.tkLabel === 'Sukar').length;

  const sangatBaikCount = questionsData.filter((q) => q.dpValue >= 0.4).length;
  const baikCount = questionsData.filter((q) => q.dpValue >= 0.3 && q.dpValue < 0.4).length;
  const revisiCount = questionsData.filter((q) => q.dpValue < 0.3 || q.status.includes('Revisi')).length;

  const avgKetuntasan = questionCount > 0
    ? Math.round(questionsData.reduce((acc, curr) => acc + curr.ketuntasanPct, 0) / questionCount)
    : 0;

  const rechartsQuestionData = useMemo(() => {
    return questionsData.map((q) => ({
      name: `No.${q.no}`,
      no: q.no,
      nilai: q.ketuntasanPct,
      tkValue: q.tkValue,
      tkLabel: q.tkLabel,
      dpValue: q.dpValue,
      dpLabel: q.dpLabel,
      tipe: q.tipe,
      pertanyaan: q.pertanyaan,
      fillColor:
        q.tkLabel === 'Mudah'
          ? '#10B981'
          : q.tkLabel === 'Sedang'
          ? '#F59E0B'
          : '#F43F5E',
    }));
  }, [questionsData]);

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Deteksi apakah paket soal yang dipilih merupakan paket inklusi
  const isInclusivePackage = useMemo(() => {
    return selectedPaket.toLowerCase().includes('inklusi');
  }, [selectedPaket]);

  // Daftar siswa yang dianalisis:
  // - Paket Sumatif Inklusi, Remedial Inklusi, ASTS Inklusi, ASAS Inklusi: HANYA menampilkan siswa inklusi
  // - Paket Sumatif reguler, ASTS, ASAS: nama siswa inklusi TIDAK dimasukkan
  const targetStudents = useMemo(() => {
    const inClass =
      selectedClass === 'all' ? allStudents : allStudents.filter((s) => s.kelas === selectedClass);
    if (isInclusivePackage) {
      return inClass.filter((s) => isSiswaInklusi(s.kebutuhanKhusus));
    }
    return inClass.filter((s) => !isSiswaInklusi(s.kebutuhanKhusus));
  }, [allStudents, selectedClass, isInclusivePackage]);

  const studentAnalysisRows = useMemo(() => {
    const buildRowMeta = (matched?: CBTExamResult) => {
      const soalList = matchingExam?.soalList || [];
      const hotsStats = matched
        ? computeExamHotsStats(
            soalList,
            matched.jawabanSiswa,
            (q, ans) =>
              evaluateQuestionScore(q.tipe, ans, q.kunciJawaban, q.bobot || 10, q.opsi, q).isCorrect
          )
        : { benarHots: 0, totalHots: 0 };
      const benarHots =
        matched && typeof matched.benarHots === 'number' && Number.isFinite(matched.benarHots)
          ? matched.benarHots
          : hotsStats.benarHots;
      const totalHots =
        matched && typeof matched.totalHots === 'number' && Number.isFinite(matched.totalHots)
          ? matched.totalHots
          : hotsStats.totalHots;
      const durasiDetik = matched
        ? parseDurasiToSeconds(matched.durasiDetik)
        : undefined;
      const durasiLabel = matched
        ? formatDurasiDetik(durasiDetik)
        : '-';
      return { benarHots, totalHots, durasiDetik, durasiLabel };
    };

    let rawRows: Array<{
      student: Student;
      score: number;
      isTuntas: boolean;
      matchedResult: CBTExamResult | undefined;
      rekomendasi: string;
      benarHots: number;
      totalHots: number;
      durasiDetik: number | undefined;
      durasiLabel: string;
    }> = [];

    if (matchingExamResults.length === 0 && !isDefaultTerm) {
      return [];
    }

    if (matchingExamResults.length > 0) {
      const matchedResultIds = new Set<CBTExamResult>();
      rawRows = targetStudents
        .map((s) => {
          const matched = matchingExamResults.find(
            (r) =>
              r.studentId === s.id ||
              (r.studentName && r.studentName.trim().toLowerCase() === s.nama.trim().toLowerCase())
          );
          if (!matched) return null;
          matchedResultIds.add(matched);
          const score = Number.isFinite(Number(matched.nilai)) ? Math.round(Number(matched.nilai)) : 0;
          const isTuntas = score >= effectiveKkm;
          const meta = buildRowMeta(matched);
          return {
            student: s,
            score,
            isTuntas,
            matchedResult: matched,
            rekomendasi: isTuntas
              ? 'Tuntas - Memiliki penguasaan kompetensi yang baik pada materi ini'
              : isInclusivePackage
              ? 'Perlu Penguatan Pendampingan Individual / Remedial Adaptif'
              : 'Diberikan Pendampingan Remedial Terarah pada TP yang Belum Tercapai',
            ...meta,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      matchingExamResults.forEach((res, idx) => {
        if (matchedResultIds.has(res)) return;
        const knownStudent = findLiveStudentForRecord(allStudents, {
          studentId: res.studentId,
          nisn: res.nisn,
          studentName: res.studentName,
        });
        const fallbackStudent: Student = knownStudent || {
          id: res.studentId || `res_${idx}`,
          barcodeId: '',
          nama: res.studentName || 'Peserta Didik',
          jenisKelamin: 'L',
          tempatLahir: '',
          tanggalLahir: '',
          nik: '',
          nisn: '-',
          kebutuhanKhusus: 'Tidak Ada (Reguler)',
          namaAyah: '',
          namaIbu: '',
          alamat: '',
          agama: 'Islam',
          kelas: selectedClass === 'all' ? '-' : selectedClass,
          tahunPelajaran: activeYear,
          username: '',
          password: '',
          fotoUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
        };
        const score = Number.isFinite(Number(res.nilai)) ? Math.round(Number(res.nilai)) : 0;
        const isTuntas = score >= effectiveKkm;
        const meta = buildRowMeta(res);
        rawRows.push({
          student: fallbackStudent,
          score,
          isTuntas,
          matchedResult: res,
          rekomendasi: isTuntas
            ? 'Tuntas - Memiliki penguasaan kompetensi yang baik pada materi ini'
            : isInclusivePackage
            ? 'Perlu Penguatan Pendampingan Individual / Remedial Adaptif'
            : 'Diberikan Pendampingan Remedial Terarah pada TP yang Belum Tercapai',
          ...meta,
        });
      });
    } else {
      rawRows = targetStudents.map((s, idx) => {
        const seed = ((s.nama.charCodeAt(0) * 3 + idx * 7 + selectedPaket.length * 5) % 25) + 75;
        const score = Math.min(100, Math.max(65, seed));
        const isTuntas = score >= effectiveKkm;
        return {
          student: s,
          score,
          isTuntas,
          matchedResult: undefined as CBTExamResult | undefined,
          rekomendasi: isTuntas
            ? 'Tuntas - Memiliki penguasaan kompetensi yang baik pada materi ini'
            : isInclusivePackage
            ? 'Perlu Penguatan Pendampingan Individual / Remedial Adaptif'
            : 'Diberikan Pendampingan Remedial Terarah pada TP yang Belum Tercapai',
          benarHots: 0,
          totalHots: 0,
          durasiDetik: undefined,
          durasiLabel: '-',
        };
      });
    }

    return sortExamRankingsWithTieBreaker(rawRows, {
      getScore: (r) => r.score,
      getBenarHots: (r) => r.benarHots,
      getDurasiDetik: (r) => r.durasiDetik,
      getName: (r) => r.student.nama,
    });
  }, [
    targetStudents,
    selectedPaket,
    selectedClass,
    isInclusivePackage,
    matchingExamResults,
    matchingExam,
    isDefaultTerm,
    allStudents,
    activeYear,
    effectiveKkm,
  ]);

  const studentRankingBadges = useMemo(
    () =>
      computeTieBreakerBadges(studentAnalysisRows, {
        getScore: (r) => r.score,
        getBenarHots: (r) => r.benarHots,
        getDurasiDetik: (r) => r.durasiDetik,
        getName: (r) => r.student.nama,
      }),
    [studentAnalysisRows]
  );

  const avgNilaiSiswaCbt = useMemo(() => {
    if (studentAnalysisRows.length === 0) return avgKetuntasan;
    return Number(
      (
        studentAnalysisRows.reduce((acc, r) => acc + r.score, 0) /
        studentAnalysisRows.length
      ).toFixed(1)
    );
  }, [studentAnalysisRows, avgKetuntasan]);

  const tuntasStudentsCount = useMemo(
    () => studentAnalysisRows.filter((r) => r.isTuntas).length,
    [studentAnalysisRows]
  );

  const tuntasStudentsPct = useMemo(() => {
    if (studentAnalysisRows.length === 0) return 0;
    return Math.round((tuntasStudentsCount / studentAnalysisRows.length) * 100);
  }, [tuntasStudentsCount, studentAnalysisRows.length]);

  const distribusiNilaiCbt = useMemo(() => {
    const defs = [
      { label: '< 11', min: 0, max: 10 },
      { label: '11–20', min: 11, max: 20 },
      { label: '21–30', min: 21, max: 30 },
      { label: '31–40', min: 31, max: 40 },
      { label: '41–50', min: 41, max: 50 },
      { label: '51–60', min: 51, max: 60 },
      { label: '61–70', min: 61, max: 70 },
      { label: '71–80', min: 71, max: 80 },
      { label: '81–90', min: 81, max: 90 },
      { label: '91–100', min: 91, max: 100 },
    ];
    return defs.map((b) => {
      const count = studentAnalysisRows.filter((r) => r.score >= b.min && r.score <= b.max).length;
      const pct =
        studentAnalysisRows.length > 0
          ? Number(((count / studentAnalysisRows.length) * 100).toFixed(1))
          : 0;
      return { ...b, count, pct };
    });
  }, [studentAnalysisRows]);

  const kepsekAnalisis = resolveKepalaSekolah(teachers, profile);
  const waliAnalisis = resolveWaliKelas(teachers, selectedClass);
  const tanggalCetakAnalisis = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handleExportExcel = () => {
    const wsData = [
      ['ANALISIS BUTIR SOAL & TINGKAT KESUKARAN CBT'],
      ['SDN RAWA BADAK UTARA 21 - JAKARTA UTARA'],
      [`Mata Pelajaran: ${selectedMapel}`],
      [`Paket / Jenis Soal: ${selectedPaket}`],
      [`Target Kelas: ${selectedClass === 'all' ? 'Semua Kelas' : selectedClass}`],
      [`KKM Ketuntasan: ${effectiveKkm}`],
      [],
      ['No', 'Pertanyaan Soal', 'Tipe Soal', 'Bobot Poin', 'Tingkat Kesukaran (TK)', 'Kategori TK', 'Daya Pembeda (DP)', 'Kategori DP', 'Ketuntasan Siswa (%)', 'Efektivitas Pengecoh', 'Status Butir'],
      ...questionsData.map((q) => [
        q.no,
        q.pertanyaan,
        q.tipe,
        q.bobot,
        q.tkValue,
        q.tkLabel,
        q.dpValue,
        q.dpLabel,
        `${q.ketuntasanPct}%`,
        q.pengecoh,
        q.status,
      ]),
    ];

    const wsRankDistData = [
      ['PERINGKAT PESERTA (TIE-BREAKER HOTS) & DISTRIBUSI NILAI CBT'],
      [`Mata Pelajaran: ${selectedMapel} · Paket: ${selectedPaket} · Kelas: ${selectedClass === 'all' ? 'Semua Kelas' : selectedClass} · KKM: ${effectiveKkm}`],
      [],
      ['DISTRIBUSI NILAI PEROLEHAN'],
      ['Rentang Nilai', ...distribusiNilaiCbt.map((b) => b.label), 'JLH'],
      ['Jumlah Siswa', ...distribusiNilaiCbt.map((b) => b.count), studentAnalysisRows.length],
      ['Persentase (%)', ...distribusiNilaiCbt.map((b) => `${b.pct}%`), '100%'],
      [],
      ['PERINGKAT PESERTA CBT'],
      ['Peringkat', 'Nama Siswa', 'NISN', 'Kelas', 'Kategori', 'Nilai', 'Benar HOTS', 'Durasi', 'Status Ketuntasan', 'Keterangan Tie-Breaker', 'Rekomendasi'],
      ...studentAnalysisRows.map((row, idx) => [
        idx + 1,
        row.student.nama,
        row.student.nisn || '-',
        row.student.kelas,
        isInclusivePackage ? `Inklusi: ${row.student.kebutuhanKhusus}` : 'Reguler',
        row.score,
        row.totalHots > 0 ? `${row.benarHots}/${row.totalHots}` : row.benarHots,
        row.durasiLabel,
        row.isTuntas ? `Tuntas (>= ${effectiveKkm})` : `Belum Tuntas (< ${effectiveKkm})`,
        studentRankingBadges[idx] || '-',
        row.rekomendasi,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wsRankDist = XLSX.utils.aoa_to_sheet(wsRankDistData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analisis Butir Soal');
    XLSX.utils.book_append_sheet(wb, wsRankDist, 'Peringkat & Distribusi');
    const safeKelas = selectedClass === 'all' ? 'Semua_Kelas' : selectedClass.replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Analisis_Soal_${selectedMapel.substring(0, 12)}_${safeKelas}.xlsx`);
  };

  const handleDownloadAnalisisPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportCbtAnalisisToPdf({
        profile,
        mapel: selectedMapel,
        paket: selectedPaket,
        kelas: selectedClass === 'all' ? 'Semua Kelas' : selectedClass,
        tahunPelajaran: activeYear,
        semester: activeSemester,
        kktp: effectiveKkm,
        questions: questionsData.map((q) => ({
          no: q.no,
          pertanyaan: q.pertanyaan,
          tipe: q.tipe,
          bobot: q.bobot,
          tkLabel: q.tkLabel,
          tkValue: q.tkValue,
          dpValue: q.dpValue,
          dpLabel: q.dpLabel,
          ketuntasanPct: q.ketuntasanPct,
          pengecoh: q.pengecoh,
          status: q.status,
        })),
        students: studentAnalysisRows.map((row, idx) => ({
          no: idx + 1,
          nama: row.student.nama,
          nisn: row.student.nisn || '-',
          kategori: isInclusivePackage ? `Inklusi: ${row.student.kebutuhanKhusus}` : 'Reguler',
          nilai: row.score,
          isTuntas: row.isTuntas,
          rekomendasi: row.rekomendasi,
        })),
        kepsekNama: kepsekAnalisis.nama,
        kepsekNipLabel: formatNipLabel(kepsekAnalisis.status, kepsekAnalisis.nip),
        waliNama: waliAnalisis?.nama || 'Guru Mata Pelajaran',
        waliNipLabel: formatNipLabel(waliAnalisis?.statusPegawai, waliAnalisis?.nip),
      });
      showToast?.(`Laporan Analisis CBT (${selectedMapel} · ${selectedPaket}) berhasil diunduh.`, 'success');
    } catch {
      showToast?.('Gagal mengunduh file laporan PDF analisis CBT.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const sarahCompletedStudentRows: SarahAnalysisStudentRow[] = useMemo(() => {
    return studentAnalysisRows
      .filter((row) => Boolean(row.matchedResult))
      .map((row) => {
        const res = row.matchedResult!;
        const wrongNumbers: number[] = [];
        const correctNumbers: number[] = [];
        if (matchingExam?.soalList && res.jawabanSiswa) {
          matchingExam.soalList.forEach((q, qIdx) => {
            const evalRes = evaluateQuestionScore(
              q.tipe,
              res.jawabanSiswa[q.id],
              q.kunciJawaban,
              q.bobot || 10,
              q.opsi,
              q
            );
            if (evalRes.isCorrect) {
              correctNumbers.push(qIdx + 1);
            } else {
              wrongNumbers.push(qIdx + 1);
            }
          });
        }
        return {
          id: row.student.id,
          nama: row.student.nama,
          nisn: row.student.nisn,
          kelas: row.student.kelas,
          score: row.score,
          status: row.isTuntas ? 'Tuntas' : 'Belum Tuntas',
          wrongNumbers,
          correctNumbers,
        };
      });
  }, [studentAnalysisRows, matchingExam]);

  const sarahHardestQuestions: SarahAnalysisHardestQuestion[] = useMemo(() => {
    const totalP = matchingExamResults.length;
    if (totalP === 0) return [];
    return questionsData.map((q) => ({
      no: q.no,
      pertanyaan: q.pertanyaan,
      pctCorrect: q.ketuntasanPct,
      wrongCount: Math.max(0, Math.round(((100 - q.ketuntasanPct) / 100) * totalP)),
      totalParticipants: totalP,
    }));
  }, [questionsData, matchingExamResults.length]);

  const effectiveActiveUser: ActiveUser = activeUser || {
    role: 'guru',
    name: waliAnalisis?.nama || 'Bapak/Ibu Guru',
    username: waliAnalisis?.username || 'guru',
    detail: selectedClass === 'all' ? 'Semua Kelas' : selectedClass,
    fotoUrl: '',
  };

  return (
    <section className="space-y-6">
      {/* Formal Kop Surat Sekolah (Khusus Cetak / PDF) */}
      <div className="hidden print-only border-b-4 border-double border-slate-900 pb-3 mb-4 text-slate-900">
        <div className="flex items-center justify-between gap-4">
          {profile?.logoKemendikbudUrl ? (
            <img
              src={profile.logoKemendikbudUrl}
              alt="Logo Dinas"
              referrerPolicy="no-referrer"
              className="w-16 h-16 object-contain shrink-0"
            />
          ) : (
            <div className="w-16 h-16 shrink-0" />
          )}
          <div className="text-center flex-1 px-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Pemerintah Provinsi DKI Jakarta · Suku Dinas Pendidikan Jakarta Utara
            </div>
            <h1 className="font-display font-black text-xl uppercase tracking-tight text-slate-950">
              {profile?.name || 'SDN Rawa Badak Utara 21'}
            </h1>
            <p className="text-xs text-slate-700">
              {profile?.alamat || 'Jl. Rawa Badak Utara'} · {profile?.kota || 'Jakarta Utara'}
              {profile?.npsn ? ` · NPSN: ${profile.npsn}` : ''}
            </p>
          </div>
          {profile?.logoSekolahUrl ? (
            <img
              src={profile.logoSekolahUrl}
              alt="Logo Sekolah"
              referrerPolicy="no-referrer"
              className="w-16 h-16 object-contain shrink-0"
            />
          ) : (
            <div className="w-16 h-16 shrink-0" />
          )}
        </div>
        <div className="text-center mt-3 pt-2 border-t border-slate-300">
          <h2 className="font-display font-black text-sm uppercase tracking-wide text-slate-950">
            LAPORAN ANALISIS BUTIR SOAL &amp; KETUNTASAN ASESMEN CBT
          </h2>
          <p className="text-[11px] text-slate-700 mt-0.5 tabular-nums">
            Mata Pelajaran: <strong>{selectedMapel}</strong> · Paket: <strong>{selectedPaket}</strong> · Kelas:{' '}
            <strong>{selectedClass}</strong> · Tahun Pelajaran {activeYear} ({activeSemester})
          </p>
        </div>
      </div>

      {/* Attractive Analysis Report Header Card */}
      <div className="no-print overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-900 text-white p-6 rounded-2xl shadow-md border border-emerald-800/40 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 lg:max-w-md shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-200 font-medium">
            <span>Evaluasi Butir Soal CBT</span>
            <span aria-hidden="true">·</span>
            <span>{selectedClass === 'all' ? 'Semua Kelas' : selectedClass}</span>
            <span aria-hidden="true">·</span>
            <span>{selectedPaket}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-display font-black tracking-tight flex items-center gap-2.5 text-white">
            <span className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-emerald-300" />
            </span>
            <span>Analisis Butir Soal &amp; Ketuntasan CBT</span>
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Ringkasan peringkat HOTS, daya pembeda (DP), tingkat kesukaran (TK), distribusi nilai, serta ketuntasan {selectedMapel}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 lg:justify-end flex-1">
          <button
            type="button"
            onClick={() => setIsClearModalOpen(true)}
            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-display font-bold px-3.5 py-2 rounded-xl text-xs border border-rose-400/30 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
            title="Kosongkan data hasil CBT siswa dan reset statistik performa"
          >
            <Trash2 className="w-4 h-4" />
            <span>Kosongkan Data{cbtResultCount > 0 ? ` (${cbtResultCount})` : ''}</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="bg-white/10 hover:bg-white/20 text-white font-display font-bold px-4 py-2 rounded-xl text-xs border border-white/20 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
            <span>Unduh Excel</span>
          </button>
          <button
            type="button"
            disabled={isExportingPdf}
            onClick={handleDownloadAnalisisPdf}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-display font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingPdf ? 'Menyiapkan PDF...' : 'Unduh Laporan'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200 space-y-5">
        {/* Quick-Jump Submitted CBT Exams Bar */}
        {submittedExamBuckets.length > 0 && (
          <div className="no-print p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-900">
                <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Data Hasil Ujian CBT Tersedia ({cbtResultCount} Pengerjaan)</span>
              </div>
              <span className="text-[11px] font-medium text-emerald-800">
                Klik paket ujian untuk langsung menampilkan hasil analisisnya
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {submittedExamBuckets.map((bucket) => {
                const isSelected =
                  bucket.mapel === selectedMapel &&
                  bucket.paket === selectedPaket &&
                  (selectedClass === 'all' || bucket.kelas === selectedClass);
                return (
                  <button
                    key={`${bucket.mapel}_${bucket.paket}_${bucket.kelas}`}
                    type="button"
                    onClick={() => {
                      hasManualFilterRef.current = true;
                      setSelectedMapel(bucket.mapel);
                      setSelectedPaket(bucket.paket);
                      setSelectedClass(bucket.kelas);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-2 ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-slate-700 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50'
                    }`}
                  >
                    <span className="truncate max-w-[260px]">
                      {bucket.mapel} · {bucket.paket} · {bucket.kelas}
                    </span>
                    <span
                      className={`text-[11px] font-mono tabular-nums ${
                        isSelected ? 'text-emerald-100' : 'text-emerald-700'
                      }`}
                    >
                      ({bucket.count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 1-Row Compact Filter Bar */}
        <div className="no-print p-3.5 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-3">
            <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
              Paket / Jenis Soal
            </label>
            <select
              value={selectedPaket}
              onChange={(e) => {
                hasManualFilterRef.current = true;
                setSelectedPaket(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none shadow-2xs cursor-pointer focus:border-emerald-500"
            >
              {availablePakets.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
              Mata Pelajaran
            </label>
            <select
              value={selectedMapel}
              onChange={(e) => {
                hasManualFilterRef.current = true;
                setSelectedMapel(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-xl border border-emerald-400 bg-white text-xs font-black text-slate-800 outline-none shadow-2xs cursor-pointer focus:ring-2 focus:ring-emerald-200"
            >
              {availableMapels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
              Target Kelas
            </label>
            <select
              value={selectedClass}
              onChange={(e) => {
                hasManualFilterRef.current = true;
                setSelectedClass(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none shadow-2xs cursor-pointer focus:border-emerald-500"
            >
              <option value="all">Semua Kelas</option>
              {availableClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
              KKM
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={kkm}
              onChange={(e) => {
                const val = Number(e.target.value);
                setKkm(Number.isFinite(val) ? Math.min(100, Math.max(0, val)) : 75);
              }}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-black text-center font-mono text-slate-800 outline-none focus:border-emerald-500"
            />
          </div>

          <div className="lg:col-span-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex-1 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-display font-bold px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              title={`Unduh Excel (${selectedClass === 'all' ? 'Semua Kelas' : selectedClass})`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              disabled={isExportingPdf}
              onClick={handleDownloadAnalisisPdf}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-display font-black px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              title={`Unduh PDF (${selectedClass === 'all' ? 'Semua Kelas' : selectedClass})`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingPdf ? 'PDF...' : 'PDF'}</span>
            </button>
          </div>
        </div>

        {/* 4 Compact KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Peserta &amp; Cakupan</span>
              <Users className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-display font-black text-slate-900 tabular-nums">
              {studentAnalysisRows.length} / {targetStudents.length}
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{
                  width: `${
                    targetStudents.length > 0
                      ? Math.min(100, Math.round((studentAnalysisRows.length / targetStudents.length) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>
            <span className="text-[11px] text-slate-500 truncate block">
              {selectedClass === 'all' ? 'Semua Kelas' : selectedClass} · {questionCount} Butir Soal
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Rata-Rata Nilai</span>
              <TrendingUp className="w-4 h-4 text-sky-600" />
            </div>
            <div
              className={`text-2xl font-display font-black tabular-nums ${
                avgNilaiSiswaCbt >= effectiveKkm ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {avgNilaiSiswaCbt}
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  avgNilaiSiswaCbt >= effectiveKkm ? 'bg-sky-500' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(100, avgNilaiSiswaCbt)}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums truncate block">
              {selectedMapel}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Ketuntasan &ge; {effectiveKkm}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div
              className={`text-2xl font-display font-black tabular-nums ${
                tuntasStudentsPct >= 75 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {tuntasStudentsPct}%
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  tuntasStudentsPct >= 75 ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, tuntasStudentsPct)}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums block">
              {tuntasStudentsCount} dari {studentAnalysisRows.length} peserta tuntas
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Kesukaran &amp; DP Valid</span>
              <PieIcon className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-lg font-display font-black text-slate-900 tabular-nums">
              {mudahCount}M · {sedangCount}S · {sukarCount}Sk
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
              {questionCount > 0 && (
                <>
                  <div className="h-full bg-emerald-500" style={{ width: `${(mudahCount / totalQuestions) * 100}%` }} />
                  <div className="h-full bg-amber-500" style={{ width: `${(sedangCount / totalQuestions) * 100}%` }} />
                  <div className="h-full bg-rose-500" style={{ width: `${(sukarCount / totalQuestions) * 100}%` }} />
                </>
              )}
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums block">
              DP Valid: {sangatBaikCount + baikCount}/{questionCount} butir
            </span>
          </div>
        </div>

        {/* 5 Horizontal Compact Analysis Tabs */}
        <div className="no-print border-b border-slate-200 overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max pb-2">
            {(
              [
                { id: 'peringkat', label: 'Peringkat & Tie-Breaker HOTS', badge: studentAnalysisRows.length },
                { id: 'grafik', label: 'Grafik Performa & Ketuntasan' },
                { id: 'matriks', label: 'Matriks Analisis Butir Soal', badge: questionCount },
                { id: 'distribusi', label: 'Distribusi Nilai Perolehan' },
                { id: 'kesukaran', label: 'Analisis Tingkat Kesukaran & Daya Beda' },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-display transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-600 text-white font-black shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold'
                  }`}
                >
                  <span>{tab.label}</span>
                  {'badge' in tab && tab.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* TAB 1: PERINGKAT & TIE-BREAKER HOTS */}
        {activeTab === 'peringkat' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-black text-sm text-slate-800 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-emerald-600" />
                  <span>Peringkat Peserta &amp; Tie-Breaker HOTS ({isInclusivePackage ? 'Khusus Siswa Inklusi' : 'Siswa Reguler'})</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Urutan otomatis berdasarkan Nilai Akhir tertinggi &rarr; Benar Soal Sulit (HOTS) terbanyak &rarr; Durasi pengerjaan tercepat.
                </p>
              </div>
              <span
                className={`text-xs font-black px-3 py-1 rounded-xl border ${
                  isInclusivePackage
                    ? 'bg-purple-100 text-purple-900 border-purple-300'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                }`}
              >
                {studentAnalysisRows.length} Peserta · KKM {effectiveKkm}
              </span>
            </div>

            <div className="max-h-[62vh] overflow-auto border border-slate-200 rounded-2xl shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-12 text-center">Rank</th>
                    <th className="p-3 min-w-[190px]">Nama Peserta Didik</th>
                    <th className="p-3 text-center">Kelas</th>
                    <th className="p-3 text-center">Nilai</th>
                    <th className="p-3 text-center">Benar HOTS</th>
                    <th className="p-3 text-center">Durasi</th>
                    <th className="p-3 text-center">Ketuntasan</th>
                    <th className="p-3 text-center">Keterangan</th>
                    <th className="p-3 min-w-[180px]">Rekomendasi &amp; Tindak Lanjut</th>
                    <th className="no-print p-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentAnalysisRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500 font-medium">
                        {!isDefaultTerm && matchingExamResults.length === 0
                          ? `Belum ada data hasil asesmen CBT pada ${activeSemester} (${activeYear}) untuk ${selectedClass === 'all' ? 'Semua Kelas' : selectedClass}.`
                          : isInclusivePackage
                          ? `Tidak ada data siswa inklusi di ${selectedClass === 'all' ? 'Semua Kelas' : selectedClass}.`
                          : `Tidak ada data siswa reguler di ${selectedClass === 'all' ? 'Semua Kelas' : selectedClass}.`}
                      </td>
                    </tr>
                  ) : (
                    studentAnalysisRows.map((row, idx) => {
                      const rowDelKey = row.matchedResult
                        ? `${row.student.id}_${row.matchedResult.examId}_${row.matchedResult.recordedAt || idx}`
                        : row.student.id;
                      const tbBadge = studentRankingBadges[idx];
                      return (
                        <tr key={rowDelKey} className="hover:bg-slate-50 transition">
                          <td className="p-3 text-center font-mono font-black tabular-nums">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs ${
                                idx === 0
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : idx === 1
                                  ? 'bg-slate-200 text-slate-800'
                                  : idx === 2
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'text-slate-600'
                              }`}
                            >
                              {idx + 1}
                            </span>
                          </td>
                          <td className="p-3 font-display font-black text-slate-800">
                            <div className="flex items-center gap-2">
                              <img
                                src={row.student.fotoUrl}
                                alt={row.student.nama}
                                className="w-7 h-7 rounded-lg object-cover border border-slate-300 shrink-0"
                              />
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{row.student.nama}</span>
                                  {isInclusivePackage && (
                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-purple-100 text-purple-900">
                                      ABK
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono font-normal text-slate-400">
                                  NISN: {row.student.nisn || '-'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center font-semibold text-slate-700 whitespace-nowrap">
                            {row.student.kelas || '-'}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-sm text-slate-900 tabular-nums">
                            {row.score}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-purple-700 tabular-nums">
                            {row.totalHots > 0 ? `${row.benarHots}/${row.totalHots}` : row.benarHots}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-600 whitespace-nowrap tabular-nums">
                            {row.durasiLabel}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                row.isTuntas
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-rose-100 text-rose-800 border border-rose-300'
                              }`}
                            >
                              {row.isTuntas ? 'Tuntas' : 'Belum Tuntas'}
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            {tbBadge ? (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black">
                                {tbBadge}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-700 text-[11px] font-medium leading-relaxed">
                            {row.rekomendasi}
                          </td>
                          <td className="no-print p-3 text-right">
                            {row.matchedResult ? (
                              confirmDeleteStudentRowKey === rowDelKey ? (
                                <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl px-2 py-1">
                                  <span className="text-[10px] font-black text-rose-700">Hapus?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSingleAnalisisCbtRow(row.student.nama, row.matchedResult!)}
                                    className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black cursor-pointer"
                                  >
                                    Ya
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteStudentRowKey(null)}
                                    className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold cursor-pointer"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteStudentRowKey(rowDelKey)}
                                  className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-display font-extrabold inline-flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                                  title={`Hapus data nilai CBT milik ${row.student.nama}`}
                                >
                                  <Trash2 className="w-3 h-3" /> Hapus
                                </button>
                              )
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold">Simulasi</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: GRAFIK PERFORMA & KETUNTASAN */}
        {activeTab === 'grafik' && (
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <h3 className="font-display font-black text-sm text-slate-900">
                  Visualisasi Grafik Analisis Soal ({selectedMapel})
                </h3>
              </div>

              <div className="no-print flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveChartTab('kesukaran')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    activeChartTab === 'kesukaran'
                      ? 'bg-emerald-600 text-white font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tingkat Kesukaran
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartTab('ketuntasan')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    activeChartTab === 'ketuntasan'
                      ? 'bg-emerald-600 text-white font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ketuntasan Siswa
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartTab('pembeda')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    activeChartTab === 'pembeda'
                      ? 'bg-emerald-600 text-white font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Daya Pembeda
                </button>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs sm:text-sm font-display font-black text-slate-800 flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-emerald-600" />
                    Grafik Batang Sebaran Nilai &amp; Tingkat Kesukaran Per Soal ({selectedMapel} • {selectedPaket})
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Persentase benar per butir soal dengan kode warna tingkat kesukaran.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-bold">
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Mudah (&gt; 0.70)
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Sedang (0.30–0.70)
                  </span>
                  <span className="inline-flex items-center gap-1 text-rose-700">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Sukar (&lt; 0.30)
                  </span>
                </div>
              </div>

              <div className="w-full h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rechartsQuestionData} margin={{ top: 14, right: 16, left: -12, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#334155' }}
                      axisLine={{ stroke: '#CBD5E1' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      unit="%"
                      tick={{ fontSize: 11, fontWeight: 600, fill: '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#F1F5F9' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload as (typeof rechartsQuestionData)[number];
                        return (
                          <div className="bg-white/95 backdrop-blur-xs p-3 rounded-xl border border-slate-200 shadow-lg text-xs max-w-[260px] space-y-1.5">
                            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                              <span className="font-display font-black text-slate-900">
                                Soal No. {d.no} ({d.tipe})
                              </span>
                              <span className="px-2 py-0.5 rounded-md font-black text-[10px] bg-slate-100 text-slate-700">
                                {d.tkLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 line-clamp-2">{d.pertanyaan}</p>
                            <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] font-mono">
                              <div className="bg-slate-50 px-2 py-1 rounded-lg">
                                <span className="text-[9px] text-slate-400 block">Nilai Benar</span>
                                <strong className="text-slate-900">{d.nilai}%</strong>
                              </div>
                              <div className="bg-slate-50 px-2 py-1 rounded-lg">
                                <span className="text-[9px] text-slate-400 block">Indeks TK</span>
                                <strong className="text-slate-900">{d.tkValue.toFixed(2)}</strong>
                              </div>
                              <div className="bg-slate-50 px-2 py-1 rounded-lg">
                                <span className="text-[9px] text-slate-400 block">Indeks DP</span>
                                <strong className="text-purple-700">{d.dpValue.toFixed(2)}</strong>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      y={effectiveKkm}
                      stroke="#0EA5E9"
                      strokeDasharray="4 4"
                      label={{
                        value: `KKM ${effectiveKkm}%`,
                        position: 'insideTopRight',
                        fill: '#0284C7',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                    <Bar dataKey="nilai" name="Nilai Benar (%)" radius={[8, 8, 0, 0]} maxBarSize={42}>
                      {rechartsQuestionData.map((entry) => (
                        <Cell key={`bar-cell-${entry.no}`} fill={entry.fillColor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {activeChartTab === 'kesukaran' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                <div className="md:col-span-5 flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-200">
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#E2E8F0" strokeWidth="3.5" />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="transparent"
                        stroke="#10B981"
                        strokeWidth="3.8"
                        strokeDasharray={`${Math.round((mudahCount / totalQuestions) * 100)} 100`}
                        strokeDashoffset="0"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="transparent"
                        stroke="#F59E0B"
                        strokeWidth="3.8"
                        strokeDasharray={`${Math.round((sedangCount / totalQuestions) * 100)} 100`}
                        strokeDashoffset={`-${Math.round((mudahCount / totalQuestions) * 100)}`}
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="transparent"
                        stroke="#F43F5E"
                        strokeWidth="3.8"
                        strokeDasharray={`${Math.round((sukarCount / totalQuestions) * 100)} 100`}
                        strokeDashoffset={`-${Math.round(((mudahCount + sedangCount) / totalQuestions) * 100)}`}
                      />
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-xl font-display font-black text-slate-800">{questionCount}</span>
                      <span className="block text-[10px] font-bold text-slate-400">Butir Soal</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-3 mt-3 text-xs font-bold">
                    <span className="flex items-center gap-1 text-emerald-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Mudah ({mudahCount})
                    </span>
                    <span className="flex items-center gap-1 text-amber-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Sedang ({sedangCount})
                    </span>
                    <span className="flex items-center gap-1 text-rose-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Sukar ({sukarCount})
                    </span>
                  </div>
                </div>

                <div className="md:col-span-7 space-y-3 bg-white p-4 rounded-2xl border border-slate-200">
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Distribusi Proporsi Tingkat Kesukaran (TK):
                  </h4>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Soal Mudah (TK &gt; 0.70)</span>
                      <span className="font-mono text-emerald-700 font-extrabold">
                        {mudahCount} Soal ({Math.round((mudahCount / totalQuestions) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div className="bg-emerald-500 h-3 rounded-full" style={{ width: `${(mudahCount / totalQuestions) * 100}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Soal Sedang (0.30 ≤ TK ≤ 0.70)</span>
                      <span className="font-mono text-amber-700 font-extrabold">
                        {sedangCount} Soal ({Math.round((sedangCount / totalQuestions) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div className="bg-amber-500 h-3 rounded-full" style={{ width: `${(sedangCount / totalQuestions) * 100}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Soal Sukar (TK &lt; 0.30)</span>
                      <span className="font-mono text-rose-700 font-extrabold">
                        {sukarCount} Soal ({Math.round((sukarCount / totalQuestions) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div className="bg-rose-500 h-3 rounded-full" style={{ width: `${(sukarCount / totalQuestions) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeChartTab === 'ketuntasan' && (
              <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 max-h-80 overflow-y-auto">
                {questionsData.map((q) => {
                  const isPass = q.ketuntasanPct >= effectiveKkm;
                  return (
                    <div key={q.no} className="space-y-1">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-bold text-slate-800">
                          Soal No. {q.no} ({q.tipe})
                        </span>
                        <span
                          className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                            isPass ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {q.ketuntasanPct}% Tuntas
                        </span>
                      </div>
                      <div className="relative w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400 z-10" style={{ left: `${effectiveKkm}%` }} />
                        <div
                          className={`h-3.5 rounded-full ${isPass ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${q.ketuntasanPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeChartTab === 'pembeda' && (
              <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2.5 max-h-80 overflow-y-auto">
                {questionsData.map((q) => {
                  const dpPct = Math.max(0, Math.min(100, Math.round(q.dpValue * 100)));
                  const barColor =
                    q.dpValue >= 0.4
                      ? 'bg-emerald-500'
                      : q.dpValue >= 0.3
                      ? 'bg-blue-500'
                      : q.dpValue >= 0.2
                      ? 'bg-amber-500'
                      : 'bg-rose-500';
                  return (
                    <div key={`dp_bar_${q.no}`} className="space-y-1">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-bold text-slate-800 truncate">
                          Soal No. {q.no} ({q.tipe})
                        </span>
                        <span className="font-mono font-black text-[11px] text-slate-700 shrink-0">
                          DP: {q.dpValue.toFixed(2)} • {q.dpLabel}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div className={`h-2.5 rounded-full ${barColor}`} style={{ width: `${dpPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MATRIKS ANALISIS BUTIR SOAL */}
        {activeTab === 'matriks' && (
          <AnalisisButirMatrixPanel
            examType="CBT"
            questions={matchingExam?.soalList || []}
            submissions={matchingExamResults.map((r) => ({
              studentId: r.studentId,
              studentName: r.studentName,
              nisn: r.nisn,
              kelas: r.kelas,
              answers: r.jawabanSiswa || {},
              recordedNilai: Number.isFinite(Number(r.nilai)) ? Number(r.nilai) : undefined,
              durasiDetik: r.durasiDetik,
              benarHots: r.benarHots,
            }))}
            eligibleStudents={targetStudents}
            mapelLabel={selectedMapel}
            paketLabel={selectedPaket}
            kelasLabel={selectedClass === 'all' ? 'Semua Kelas' : selectedClass}
            tahunPelajaran={activeYear}
            semester={activeSemester}
            profile={profile}
            teachers={teachers}
            kktp={effectiveKkm}
            showToast={showToast}
          />
        )}

        {/* TAB 4: DISTRIBUSI NILAI PEROLEHAN (< 11 s.d. 91-100 + JLH) */}
        {activeTab === 'distribusi' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-black text-sm text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                  <span>Distribusi Nilai Perolehan Peserta CBT ({selectedClass === 'all' ? 'Semua Kelas' : selectedClass})</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Sebaran nilai siswa pada rentang &lt; 11 hingga 91–100 dengan jumlah total (JLH) berdasarkan KKM {effectiveKkm}.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                  Tuntas (&ge;{effectiveKkm}): {tuntasStudentsCount} ({tuntasStudentsPct}%)
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 tabular-nums">
                  Belum Tuntas: {Math.max(0, studentAnalysisRows.length - tuntasStudentsCount)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-200">
                    <th className="p-2.5 text-left min-w-[130px]">Rentang Nilai</th>
                    {distribusiNilaiCbt.map((b) => (
                      <th key={b.label} className="p-2.5 font-mono whitespace-nowrap">
                        {b.label}
                      </th>
                    ))}
                    <th className="p-2.5 bg-emerald-100 text-emerald-950 font-black">JLH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-2.5 text-left font-bold text-slate-700">Jumlah Siswa</td>
                    {distribusiNilaiCbt.map((b) => (
                      <td key={`cnt_${b.label}`} className="p-2.5 font-mono font-black text-slate-900 tabular-nums">
                        {b.count}
                      </td>
                    ))}
                    <td className="p-2.5 bg-emerald-50 font-mono font-black text-emerald-900 tabular-nums">
                      {studentAnalysisRows.length}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-left font-bold text-slate-600">Persentase (%)</td>
                    {distribusiNilaiCbt.map((b) => (
                      <td key={`pct_${b.label}`} className="p-2.5 font-mono text-slate-600 tabular-nums">
                        {b.pct}%
                      </td>
                    ))}
                    <td className="p-2.5 bg-emerald-50 font-mono font-bold text-emerald-900 tabular-nums">
                      {studentAnalysisRows.length > 0 ? '100%' : '0%'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribusiNilaiCbt} margin={{ top: 10, right: 12, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: '#334155' }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Jumlah Siswa" radius={[6, 6, 0, 0]} maxBarSize={38}>
                      {distribusiNilaiCbt.map((b) => (
                        <Cell
                          key={`dist_cbt_${b.label}`}
                          fill={b.min >= effectiveKkm ? '#10B981' : b.max >= effectiveKkm ? '#F59E0B' : '#F43F5E'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ANALISIS TINGKAT KESUKARAN & DAYA BEDA + SARAH PANEL */}
        {activeTab === 'kesukaran' && (
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-black text-sm text-slate-800 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  Tabel Rincian Analisis Butir Soal ({selectedPaket} • {selectedMapel})
                </h3>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
                  Total: {questionCount} Butir Soal
                </span>
              </div>

              <div className="max-h-[62vh] overflow-auto border border-slate-200 rounded-2xl shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-10 text-center">No</th>
                      <th className="p-3 min-w-[220px]">Pertanyaan Butir Soal</th>
                      <th className="p-3 text-center">Tipe</th>
                      <th className="p-3 text-center">Bobot</th>
                      <th className="p-3 text-center">Tingkat Kesukaran (TK)</th>
                      <th className="p-3 text-center">Daya Pembeda (DP)</th>
                      <th className="p-3 text-center">Ketuntasan</th>
                      <th className="p-3 text-center">Pengecoh</th>
                      <th className="p-3 text-center">Status / Rekomendasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {questionsData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-xs text-slate-500 bg-slate-50/60">
                          Belum ada data analisis butir soal CBT untuk <strong>{selectedMapel}</strong> ({selectedPaket}) pada{' '}
                          <strong>{activeSemester}</strong> Tahun Pelajaran <strong>{activeYear}</strong>.
                        </td>
                      </tr>
                    ) : (
                      questionsData.map((q) => (
                        <tr key={q.no} className="hover:bg-slate-50 transition">
                          <td className="p-3 text-center font-bold text-slate-500">{q.no}</td>
                          <td className="p-3 font-medium text-slate-800 max-w-xs truncate" title={q.pertanyaan}>
                            {q.pertanyaan}
                          </td>
                          <td className="p-3 text-center font-semibold text-slate-600">{q.tipe}</td>
                          <td className="p-3 text-center font-mono font-bold text-slate-700">{q.bobot}</td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                                q.tkLabel === 'Mudah'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : q.tkLabel === 'Sedang'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {q.tkLabel} ({q.tkValue.toFixed(2)})
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                                q.dpValue >= 0.4
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : q.dpValue >= 0.3
                                  ? 'bg-blue-100 text-blue-800'
                                  : q.dpValue >= 0.2
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {q.dpValue.toFixed(2)} • {q.dpLabel}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-black text-emerald-700">
                            {q.ketuntasanPct}%
                          </td>
                          <td className="p-3 text-center text-[11px] text-slate-600">
                            {q.pengecoh}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                q.status.includes('Revisi')
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {q.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <SarahExamAnalysisPanel
              activeUser={effectiveActiveUser}
              profile={profile}
              examCategory="CBT"
              paketLabel={selectedPaket}
              mapelLabel={selectedMapel}
              kelasLabel={selectedClass === 'all' ? 'Semua Kelas' : selectedClass}
              kktp={effectiveKkm}
              hardestQuestions={sarahHardestQuestions}
              studentPerformanceList={sarahCompletedStudentRows}
              showToast={showToast}
            />
          </div>
        )}

        {/* Blok Pengesahan Resmi Kepala Sekolah & Wali Kelas (Khusus Cetak / PDF) */}
        <div className="hidden print-only print-avoid-break pt-6 mt-4 border-t border-slate-300 text-xs text-slate-900">
          <div className="grid grid-cols-2 gap-8 text-center">
            <div>
              <p className="font-medium text-slate-700">
                Mengetahui,<br />Kepala {profile?.name || 'SDN Rawa Badak Utara 21'}
              </p>
              <div style={{ height: '4cm' }} />
              <p className="font-black text-slate-900 underline">{kepsekAnalisis.nama}</p>
              <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                {formatNipLabel(kepsekAnalisis.status, kepsekAnalisis.nip)}
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-700">
                Jakarta, {tanggalCetakAnalisis}<br />Wali Kelas / Guru {selectedClass === 'all' ? 'Semua Kelas' : selectedClass}
              </p>
              <div style={{ height: '4cm' }} />
              <p className="font-black text-slate-900 underline">
                {waliAnalisis?.nama || 'Guru Mata Pelajaran'}
              </p>
              <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                {formatNipLabel(waliAnalisis?.statusPegawai, waliAnalisis?.nip)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {isClearModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-rose-600" /> Kosongkan Data Hasil CBT
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Pilih cakupan data hasil ujian CBT siswa yang ingin dikosongkan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1.5 leading-relaxed">
              <p className="font-bold">
                Tindakan ini akan mengosongkan riwayat skor CBT dan mereset Statistik Performa Siswa (termasuk sinkronisasi Cloud Firestore).
              </p>
              <p className="text-[11px] text-rose-700">
                Bank Soal CBT tidak akan ikut terhapus, hanya data nilai hasil pengerjaan CBT siswa.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => executeClearCbtData('paket')}
                className="w-full px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-display font-black cursor-pointer shadow-xs transition flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Kosongkan "{selectedPaket}" ({selectedMapel}) Saja</span>
              </button>

              <button
                type="button"
                onClick={() => executeClearCbtData('all')}
                className="w-full px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-display font-black cursor-pointer shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Kosongkan Semua Data Hasil CBT</span>
              </button>

              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="w-full px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

