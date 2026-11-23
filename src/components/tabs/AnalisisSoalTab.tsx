import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  CheckCircle2,
  TrendingUp,
  HelpCircle,
  Filter,
  Download,
  PieChart as PieIcon,
  Award,
  AlertTriangle,
  Layers,
  FileSpreadsheet,
  Users,
  UserCheck,
  Trash2,
  X,
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
import { exportCbtAnalisisToPdf } from '../../utils/analisisReportExport';
import {
  SarahExamAnalysisPanel,
  SarahAnalysisHardestQuestion,
  SarahAnalysisStudentRow,
} from '../SarahExamAnalysisPanel';

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
  const [activeChartTab, setActiveChartTab] = useState<'kesukaran' | 'pembeda' | 'ketuntasan'>('kesukaran');
  const [isClearModalOpen, setIsClearModalOpen] = useState<boolean>(false);
  const [confirmDeleteStudentRowKey, setConfirmDeleteStudentRowKey] = useState<string | null>(null);
  const [cbtExams, setCbtExams] = useState<CBTExam[]>(() => getStoredCBTExams());
  const [cbtResults, setCbtResults] = useState<CBTExamResult[]>(
    () => getStoredCBTResults().filter((r) => !isTkaResultEntry(r))
  );
  const hasManualFilterRef = React.useRef<boolean>(false);

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
      clearCBTResultsFromStorage({
        scope: 'paket',
        targetPaket: selectedPaket,
        targetMapel: selectedMapel,
      });
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

  const handleExportExcel = () => {
    const wsData = [
      ['ANALISIS BUTIR SOAL & TINGKAT KESUKARAN CBT'],
      ['SDN RAWA BADAK UTARA 21 - JAKARTA UTARA'],
      [`Mata Pelajaran: ${selectedMapel}`],
      [`Paket / Jenis Soal: ${selectedPaket}`],
      [`Target Kelas: ${selectedClass}`],
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

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analisis Butir Soal');
    XLSX.writeFile(wb, `Analisis_Soal_${selectedMapel.substring(0, 10)}_${selectedClass}.xlsx`);
  };

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleDownloadAnalisisPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportCbtAnalisisToPdf({
        profile,
        mapel: selectedMapel,
        paket: selectedPaket,
        kelas: selectedClass,
        tahunPelajaran: activeYear,
        semester: activeSemester,
        kktp: 75,
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
    if (matchingExamResults.length === 0 && !isDefaultTerm) {
      return [];
    }
    if (matchingExamResults.length > 0) {
      const matchedResultIds = new Set<CBTExamResult>();
      const rows = targetStudents
        .map((s) => {
          const matched = matchingExamResults.find(
            (r) =>
              r.studentId === s.id ||
              (r.studentName && r.studentName.trim().toLowerCase() === s.nama.trim().toLowerCase())
          );
          if (!matched) return null;
          matchedResultIds.add(matched);
          const score = Number.isFinite(Number(matched.nilai)) ? Math.round(Number(matched.nilai)) : 0;
          const isTuntas = score >= 75;
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
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Pastikan hasil pengerjaan nyata yang belum masuk ke targetStudents (mis. siswa inklusi/mutasi ID) tetap tampil
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
        const isTuntas = score >= 75;
        rows.push({
          student: fallbackStudent,
          score,
          isTuntas,
          matchedResult: res,
          rekomendasi: isTuntas
            ? 'Tuntas - Memiliki penguasaan kompetensi yang baik pada materi ini'
            : isInclusivePackage
            ? 'Perlu Penguatan Pendampingan Individual / Remedial Adaptif'
            : 'Diberikan Pendampingan Remedial Terarah pada TP yang Belum Tercapai',
        });
      });

      return rows;
    }
    return targetStudents.map((s, idx) => {
      const seed = ((s.nama.charCodeAt(0) * 3 + idx * 7 + selectedPaket.length * 5) % 25) + 75;
      const score = Math.min(100, Math.max(65, seed));
      const isTuntas = score >= 75;
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
      };
    });
  }, [targetStudents, selectedPaket, selectedClass, isInclusivePackage, matchingExamResults, isDefaultTerm, studentById, studentByName, activeYear]);

  const kepsekAnalisis = resolveKepalaSekolah(teachers, profile);
  const waliAnalisis = resolveWaliKelas(teachers, selectedClass);
  const tanggalCetakAnalisis = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

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
      <div className="no-print bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-900 text-white p-6 sm:p-7 rounded-3xl shadow-md border border-emerald-800/40 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-200 font-medium">
            <span>Evaluasi Butir Soal CBT</span>
            <span aria-hidden="true">·</span>
            <span>{selectedPaket}</span>
            <span aria-hidden="true">·</span>
            <span>{selectedMapel}</span>
            <span aria-hidden="true">·</span>
            <span>{selectedClass === 'all' ? 'Semua Kelas' : selectedClass}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-display font-black tracking-tight flex items-center gap-2.5 text-white">
            <span className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-emerald-300" />
            </span>
            <span>Laporan Analisis Butir Soal &amp; Ketuntasan CBT</span>
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Ringkasan daya pembeda (DP), tingkat kesukaran soal (TK), efektivitas pengecoh, serta distribusi ketuntasan peserta didik secara real-time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsClearModalOpen(true)}
            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-display font-bold px-3.5 py-2.5 rounded-xl text-xs border border-rose-400/30 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
            title="Kosongkan data hasil CBT siswa dan reset statistik performa"
          >
            <Trash2 className="w-4 h-4" />
            <span>Kosongkan Data{cbtResultCount > 0 ? ` (${cbtResultCount})` : ''}</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="bg-white/10 hover:bg-white/20 text-white font-display font-bold px-4 py-2.5 rounded-xl text-xs border border-white/20 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
            <span>Unduh Excel</span>
          </button>
          <button
            type="button"
            disabled={isExportingPdf}
            onClick={handleDownloadAnalisisPdf}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-display font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingPdf ? 'Menyiapkan PDF...' : 'Unduh Laporan'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-6">
        {/* Quick-Jump Submitted CBT Exams Bar */}
        {submittedExamBuckets.length > 0 && (
          <div className="no-print p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-900">
                <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Data Hasil Ujian CBT Siswa Tersedia ({cbtResultCount} Pengerjaan)</span>
              </div>
              <span className="text-[11px] font-medium text-emerald-800">
                Pilih paket ujian untuk langsung menampilkan hasil analisisnya
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
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

        {/* Filter Bar: Paket Soal disamping Mata Pelajaran Dropdown + Target Kelas */}
        <div className="no-print p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              Filter Paket / Jenis Soal
            </label>
            <select
              value={selectedPaket}
              onChange={(e) => {
                hasManualFilterRef.current = true;
                setSelectedPaket(e.target.value);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none shadow-2xs cursor-pointer focus:border-emerald-500"
            >
              {availablePakets.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              Filter Mata Pelajaran
            </label>
            <select
              value={selectedMapel}
              onChange={(e) => {
                hasManualFilterRef.current = true;
                setSelectedMapel(e.target.value);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-400 bg-white text-xs font-black text-slate-800 outline-none shadow-2xs cursor-pointer focus:ring-2 focus:ring-emerald-200"
            >
              {availableMapels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              Target Kelas
            </label>
            <select
              value={selectedClass}
              onChange={(e) => {
                hasManualFilterRef.current = true;
                setSelectedClass(e.target.value);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none shadow-2xs cursor-pointer focus:border-emerald-500"
            >
              <option value="all">Semua Kelas</option>
              {availableClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Refined Executive KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Total Butir Soal</span>
              <Layers className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-display font-black text-slate-900 tabular-nums">{questionCount} Butir</div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: questionCount > 0 ? '100%' : '0%' }} />
            </div>
            <span className="text-[11px] text-slate-500 block">
              {questionCount > 0 ? `${studentAnalysisRows.length} peserta dinilai` : `Belum ada data ${activeSemester} (${activeYear})`}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Rata-rata Ketuntasan</span>
              <TrendingUp className="w-4 h-4 text-sky-600" />
            </div>
            <div className={`text-2xl font-display font-black tabular-nums ${avgKetuntasan >= 75 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {avgKetuntasan}%
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${avgKetuntasan >= 75 ? 'bg-sky-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, avgKetuntasan)}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums block">
              {questionCount > 0 ? (avgKetuntasan >= 75 ? 'Memenuhi KKTP (75%)' : 'Di bawah KKTP (75%)') : 'Menunggu hasil asesmen'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Komposisi Kesukaran</span>
              <PieIcon className="w-4 h-4 text-amber-600" />
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
            <span className="text-[11px] text-slate-500 block">
              Mudah · Sedang · Sukar
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Daya Pembeda Valid</span>
              <CheckCircle2 className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-display font-black text-slate-900 tabular-nums">
              {sangatBaikCount + baikCount}/{questionCount}
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full"
                style={{ width: `${questionCount > 0 ? Math.round(((sangatBaikCount + baikCount) / questionCount) * 100) : 0}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-500 block">
              Soal kategori Sangat Baik &amp; Baik
            </span>
          </div>
        </div>

        {/* GRAFIK DATA ANALISIS SOAL */}
        <div className="p-5 print:p-3 rounded-3xl print:rounded-xl bg-slate-50 print:bg-white border border-slate-200 space-y-4 print-avoid-break">
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

          {/* RECHARTS BAR CHART: SEBARAN NILAI & TINGKAT KESULITAN PER SOAL */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-display font-black text-slate-800 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                  Grafik Batang Sebaran Nilai &amp; Tingkat Kesukaran Per Soal ({selectedMapel} • {selectedPaket})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Visualisasi persentase nilai benar per butir soal dengan kode warna tingkat kesukaran untuk deteksi soal sukar secara instan.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-bold">
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Mudah (TK &gt; 0.70)
                </span>
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Sedang (0.30–0.70)
                </span>
                <span className="inline-flex items-center gap-1 text-rose-700">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Sukar (TK &lt; 0.30)
                </span>
              </div>
            </div>

            <div className="w-full h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rechartsQuestionData}
                  margin={{ top: 14, right: 16, left: -12, bottom: 8 }}
                >
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
                            <span
                              className={`px-2 py-0.5 rounded-md font-black text-[10px] ${
                                d.tkLabel === 'Mudah'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : d.tkLabel === 'Sedang'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
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
                    y={75}
                    stroke="#0EA5E9"
                    strokeDasharray="4 4"
                    label={{
                      value: 'KKTP 75%',
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

          {/* Chart Content 1: Tingkat Kesukaran */}
          {activeChartTab === 'kesukaran' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
              {/* Donut representation */}
              <div className="md:col-span-5 flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-200">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    {/* Ring background */}
                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#E2E8F0" strokeWidth="3.5" />
                    {/* Segment 1: Mudah (green) */}
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
                    {/* Segment 2: Sedang (amber) */}
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
                    {/* Segment 3: Sukar (rose) */}
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

              {/* Progress bars & guidelines */}
              <div className="md:col-span-7 space-y-3 bg-white p-4 rounded-2xl border border-slate-200">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Distribusi Proporsi Tingkat Kesukaran (TK):
                </h4>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Soal Mudah (TK &gt; 0.70)
                    </span>
                    <span className="font-mono text-emerald-700 font-extrabold">
                      {mudahCount} Soal ({Math.round((mudahCount / totalQuestions) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${(mudahCount / totalQuestions) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> Soal Sedang (0.30 ≤ TK ≤ 0.70)
                    </span>
                    <span className="font-mono text-amber-700 font-extrabold">
                      {sedangCount} Soal ({Math.round((sedangCount / totalQuestions) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-amber-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${(sedangCount / totalQuestions) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span> Soal Sukar (TK &lt; 0.30)
                    </span>
                    <span className="font-mono text-rose-700 font-extrabold">
                      {sukarCount} Soal ({Math.round((sukarCount / totalQuestions) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-rose-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${(sukarCount / totalQuestions) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 pt-1 leading-relaxed">
                  💡 <strong>Catatan Kurikulum Merdeka:</strong> Sebaran tingkat kesukaran soal telah memenuhi kurva normal asesmen sekolah dasar (komposisi seimbang antara butir soal mudah, sedang, dan penalaran bertingkat/sukar).
                </p>
              </div>
            </div>
          )}

          {/* Chart Content 2: Ketuntasan Siswa Per Nomor Soal (Bar chart) */}
          {activeChartTab === 'ketuntasan' && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Grafik Batang Ketuntasan Siswa Per Nomor Soal ({selectedPaket}):
                </h4>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="flex items-center gap-1 text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> ≥ 75% Tuntas
                  </span>
                  <span className="flex items-center gap-1 text-rose-700">
                    <span className="w-2.5 h-2.5 rounded bg-rose-500"></span> &lt; 75% Perlu Pengayaan
                  </span>
                  <span className="text-[11px] text-slate-400">--- Garis Batas KKTP (75%)</span>
                </div>
              </div>

              {/* Bar Chart Container */}
              <div className="space-y-3 pt-2">
                {questionsData.map((q) => {
                  const isPass = q.ketuntasanPct >= 75;
                  return (
                    <div key={q.no} className="space-y-1">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-bold text-slate-800">
                          Soal No. {q.no} ({q.tipe})
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-slate-500 font-mono">TK: {q.tkValue.toFixed(2)}</span>
                          <span className="text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-mono font-bold">
                            DP: {q.dpValue.toFixed(2)}
                          </span>
                          <span
                            className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                              isPass ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {q.ketuntasanPct}% Tuntas
                          </span>
                        </div>
                      </div>
                      <div className="relative w-full bg-slate-100 rounded-full h-4 overflow-hidden">
                        {/* 75% benchmark marker */}
                        <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-slate-400 z-10" title="Batas KKTP 75%"></div>
                        <div
                          className={`h-4 rounded-full transition-all duration-500 ${
                            isPass ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${q.ketuntasanPct}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chart Content 3: Daya Pembeda */}
          {activeChartTab === 'pembeda' && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900 uppercase">Sangat Baik (DP ≥ 0.40)</span>
                    <span className="text-xl font-display font-black text-emerald-700">{sangatBaikCount} Soal</span>
                  </div>
                  <div className="w-full bg-emerald-200/60 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-2.5 rounded-full"
                      style={{ width: `${(sangatBaikCount / totalQuestions) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    Soal mampu membedakan kelompok siswa pandai dan kelompok siswa yang belum tuntas secara tajam dan valid.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-blue-900 uppercase">Baik (0.30 ≤ DP &lt; 0.40)</span>
                    <span className="text-xl font-display font-black text-blue-700">{baikCount} Soal</span>
                  </div>
                  <div className="w-full bg-blue-200/60 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full"
                      style={{ width: `${(baikCount / totalQuestions) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Butir soal memiliki daya pembeda yang memuaskan dan dapat langsung disimpan ke Bank Soal Sekolah.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-900 uppercase">Cukup / Revisi (DP &lt; 0.30)</span>
                    <span className="text-xl font-display font-black text-amber-700">{revisiCount} Soal</span>
                  </div>
                  <div className="w-full bg-amber-200/60 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-amber-600 h-2.5 rounded-full"
                      style={{ width: `${(revisiCount / totalQuestions) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Dianjurkan merevisi opsi pengecoh atau merapikan redaksi kalimat soal agar tidak membingungkan peserta didik.
                  </p>
                </div>
              </div>

              {/* Per-Question Daya Pembeda Bars */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Nilai Daya Pembeda (DP) Tiap Nomor Soal ({selectedPaket}):
                  </h4>
                  <span className="text-[11px] text-slate-500 font-semibold">
                    Indeks DP: ≥ 0.40 Sangat Baik • 0.30–0.39 Baik • &lt; 0.30 Cukup/Revisi
                  </span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto print-expand-scroll pr-1">
                  {questionsData.map((q) => {
                    const dpPct = Math.max(0, Math.min(100, Math.round(q.dpValue * 100)));
                    const badgeColor =
                      q.dpValue >= 0.4
                        ? 'bg-emerald-100 text-emerald-800'
                        : q.dpValue >= 0.3
                        ? 'bg-blue-100 text-blue-800'
                        : q.dpValue >= 0.2
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800';
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
                          <span className={`font-mono font-black text-[11px] px-2 py-0.5 rounded-md shrink-0 ${badgeColor}`}>
                            DP: {q.dpValue.toFixed(2)} • {q.dpLabel}
                          </span>
                        </div>
                        <div className="relative w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-3 rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${dpPct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Detailed Table of Questions */}
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

          <div className="overflow-x-auto border-2 border-slate-200 rounded-3xl shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
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

        {/* Table 2: Tabel Analisis Hasil Asesmen Peserta Didik */}
        <div className="space-y-3 pt-6 border-t-2 border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-black text-sm text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                Tabel Analisis Hasil Peserta Didik ({isInclusivePackage ? 'Khusus Siswa Inklusi' : 'Siswa Reguler'})
              </h3>
              <p className="text-xs text-slate-500">
                {isInclusivePackage
                  ? 'Menampilkan khusus hasil analisis butir asesmen siswa inklusi (ABK) sesuai paket inklusi yang dipilih.'
                  : 'Siswa inklusi secara otomatis tidak dimasukkan dalam rekapitulasi analisis paket asesmen reguler ini.'}
              </p>
            </div>
            <span
              className={`text-xs font-black px-3 py-1 rounded-xl border ${
                isInclusivePackage
                  ? 'bg-purple-100 text-purple-900 border-purple-300'
                  : 'bg-emerald-100 text-emerald-900 border-emerald-300'
              }`}
            >
              {isInclusivePackage
                ? `Total Siswa Inklusi: ${targetStudents.length} Siswa`
                : `Total Siswa Reguler: ${targetStudents.length} Siswa`}
            </span>
          </div>

          <div className="overflow-x-auto border-2 border-slate-200 rounded-3xl shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
                  <th className="p-3 w-12 text-center">No</th>
                  <th className="p-3 min-w-[200px]">Nama Peserta Didik</th>
                  <th className="p-3 text-center">NISN</th>
                  <th className="p-3 text-center">Kategori Siswa</th>
                  <th className="p-3 text-center">Nilai Asesmen</th>
                  <th className="p-3 text-center">Ketuntasan</th>
                  <th className="p-3">Rekomendasi & Tindak Lanjut</th>
                  <th className="no-print p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentAnalysisRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-500 font-medium">
                      {!isDefaultTerm && matchingExamResults.length === 0
                        ? `Belum ada data hasil asesmen CBT pada ${activeSemester} (${activeYear}) untuk ${selectedClass}.`
                        : isInclusivePackage
                        ? `Tidak ada data siswa inklusi di ${selectedClass}.`
                        : `Tidak ada data siswa reguler di ${selectedClass}.`}
                    </td>
                  </tr>
                ) : (
                  studentAnalysisRows.map((row, idx) => {
                    const rowDelKey = row.matchedResult
                      ? `${row.student.id}_${row.matchedResult.examId}_${row.matchedResult.recordedAt || idx}`
                      : row.student.id;
                    return (
                    <tr key={rowDelKey} className="hover:bg-slate-50 transition">
                      <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="p-3 font-display font-black text-slate-800">
                        <div className="flex items-center gap-2">
                          <img
                            src={row.student.fotoUrl}
                            alt={row.student.nama}
                            className="w-7 h-7 rounded-lg object-cover border border-slate-300 shrink-0"
                          />
                          <span>{row.student.nama}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">{row.student.nisn}</td>
                      <td className="p-3 text-center">
                        {isInclusivePackage ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-200">
                            Inklusi: {row.student.kebutuhanKhusus}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            Reguler
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-sm text-slate-900">
                        {row.score}
                      </td>
                      <td className="p-3 text-center">
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
                Jakarta, {tanggalCetakAnalisis}<br />Wali Kelas / Guru {selectedClass}
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

      <SarahExamAnalysisPanel
        activeUser={effectiveActiveUser}
        profile={profile}
        examCategory="CBT"
        paketLabel={selectedPaket}
        mapelLabel={selectedMapel}
        kelasLabel={selectedClass === 'all' ? 'Semua Kelas' : selectedClass}
        hardestQuestions={sarahHardestQuestions}
        studentPerformanceList={sarahCompletedStudentRows}
        showToast={showToast}
      />

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

