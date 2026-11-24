import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  CheckCircle,
  ChevronRight,
  Edit3,
  Save,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  CBTExam,
  CBTExamResult,
  Student,
  isSiswaInklusi,
} from '../../types';
import { MAPEL_LIST } from '../../data/defaultData';
import {
  CLASSES_LIST,
  DEFAULT_STUDENT_AVATAR_URL,
  getActiveFilters,
  getStoredAssessments,
  getStoredCBTResults,
  getStoredSubjectsForClass,
  isTkaResultEntry,
  notifyStorageMutation,
  saveStoredAssessments,
  saveStoredCBTResults,
} from '../../utils/storage';
import { getLocalTodayStr } from '../../utils/dateUtils';
import {
  buildCbtResultDocId,
  saveCbtResultToFirestore,
} from '../../utils/cbtResultFirestore';
import { saveHasilUjianToFirestore } from '../../utils/sarahExamAccess';
import { parseDurasiToSeconds } from '../../utils/examRanking';

export interface ManualCbtModalSeed {
  paket: string;
  mapel: string;
  kelas: string;
  studentId?: string;
}

interface ManualCbtScoreModalProps {
  seed: ManualCbtModalSeed;
  students: Student[];
  exams: CBTExam[];
  cbtResults: CBTExamResult[];
  paketList: string[];
  activeYear: string;
  activeSemester: string;
  onClose: () => void;
  onSaved: (
    updatedResults: CBTExamResult[],
    toastMessage: string,
    closeAfter: boolean
  ) => void;
  onValidationError: (message: string) => void;
}

const sanitizeManualScoreInput = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  if (digitsOnly === '') return '';
  const num = Math.min(100, Math.max(0, Number(digitsOnly)));
  return String(num);
};

const makeSyntheticCbtExamId = (paket: string, mapel: string, kelas: string): string => {
  const slug = (v: string) =>
    (v || 'umum')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  return `cbt_manual_${slug(paket)}_${slug(mapel)}_${slug(kelas)}`.slice(0, 100);
};

interface BatchCbtStudentRowProps {
  student: Student;
  rowIndex: number;
  existingResult?: CBTExamResult;
  scoreValue: string;
  onScoreChange: (studentId: string, rawValue: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => void;
}

const BatchCbtStudentRow = memo(function BatchCbtStudentRow({
  student,
  rowIndex,
  existingResult,
  scoreValue,
  onScoreChange,
  onKeyDown,
}: BatchCbtStudentRowProps) {
  const parsed = scoreValue.trim() !== '' ? Number(scoreValue) : null;
  const predikat =
    parsed === null
      ? '-'
      : parsed >= 90
      ? 'A'
      : parsed >= 75
      ? 'B'
      : parsed >= 60
      ? 'C'
      : 'D';
  const status = parsed === null ? '—' : parsed >= 75 ? 'Tuntas' : 'Remedial';

  return (
    <tr className="hover:bg-slate-50">
      <td className="p-2 text-center text-slate-400 font-bold tabular-nums">
        {rowIndex + 1}
      </td>
      <td className="p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-slate-900 leading-tight">{student.nama}</span>
          {existingResult ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">
              Sudah Ujian
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase">
              Belum Ujian
            </span>
          )}
          {isSiswaInklusi(student.kebutuhanKhusus) && (
            <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-bold">
              Inklusi
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 tabular-nums">
          {student.kelas} · NISN: {student.nisn || '-'}
        </div>
      </td>
      <td className="p-1.5 text-center">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          data-cbt-batch-row={rowIndex}
          value={scoreValue}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onScoreChange(student.id, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, rowIndex)}
          placeholder="—"
          className="w-20 px-2 py-1 rounded-lg border border-slate-300 bg-white text-center font-bold text-slate-900 tabular-nums outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
      </td>
      <td className="p-2 text-center font-display font-black text-slate-800">
        {predikat}
      </td>
      <td className="p-2 text-center font-bold text-[11px]">
        {parsed !== null ? (
          <span className={parsed >= 75 ? 'text-emerald-700' : 'text-rose-600'}>
            {status}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
    </tr>
  );
});

export const ManualCbtScoreModal: React.FC<ManualCbtScoreModalProps> = ({
  seed,
  students,
  exams,
  cbtResults,
  paketList,
  activeYear,
  activeSemester,
  onClose,
  onSaved,
  onValidationError,
}) => {
  const availablePakets = useMemo(
    () => (paketList.length > 0 ? paketList : ['Sumatif 1 (AS 1)', 'ASAS (Sumatif Akhir Semester)']),
    [paketList]
  );

  const [modalTab, setModalTab] = useState<'individu' | 'massal'>('massal');
  const [paket, setPaket] = useState<string>(
    seed.paket && seed.paket !== 'all' ? seed.paket : availablePakets[0]
  );
  const [mapel, setMapel] = useState<string>(
    seed.mapel && seed.mapel !== 'all' ? seed.mapel : MAPEL_LIST[0] || 'Bahasa Indonesia'
  );
  const [kelasFilter, setKelasFilter] = useState<string>(
    seed.kelas && seed.kelas !== 'all' ? seed.kelas : CLASSES_LIST[0] || 'Kelas 6A'
  );
  const [includeAllStudentsInClass, setIncludeAllStudentsInClass] = useState<boolean>(true);
  const [examStatusFilter, setExamStatusFilter] = useState<'all' | 'belum' | 'sudah'>('all');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [tanggal, setTanggal] = useState<string>(() => getLocalTodayStr());
  const [durasiText, setDurasiText] = useState<string>('45 Menit');

  const isInclusivePackage = useMemo(() => paket.toLowerCase().includes('inklusi'), [paket]);

  const sortedStudents = useMemo(
    () =>
      [...students].sort((a, b) => {
        const cmpCls = (a.kelas || '').localeCompare(b.kelas || '', 'id', { numeric: true });
        if (cmpCls !== 0) return cmpCls;
        return (a.nama || '').localeCompare(b.nama || '', 'id');
      }),
    [students]
  );

  const studentByIdMap = useMemo(() => {
    const m = new Map<string, Student>();
    sortedStudents.forEach((s) => m.set(s.id, s));
    return m;
  }, [sortedStudents]);

  const matchingExam = useMemo(() => {
    const pLower = paket.trim().toLowerCase();
    const mLower = mapel.trim().toLowerCase();
    const kLower = kelasFilter.trim().toLowerCase();
    return (
      exams.find(
        (ex) =>
          (ex.paketName || '').trim().toLowerCase() === pLower &&
          (ex.mapel || '').trim().toLowerCase() === mLower &&
          (kelasFilter === 'all' || (ex.kelas || '').trim().toLowerCase() === kLower)
      ) ||
      exams.find(
        (ex) =>
          (ex.paketName || '').trim().toLowerCase() === pLower &&
          (ex.mapel || '').trim().toLowerCase() === mLower
      ) ||
      null
    );
  }, [exams, paket, mapel, kelasFilter]);

  const sessionSavedRef = useRef<Map<string, CBTExamResult>>(new Map());

  const findExistingCbtResult = useCallback(
    (student: Student, targetPaket: string, targetMapel: string): CBTExamResult | undefined => {
      const pLower = targetPaket.trim().toLowerCase();
      const mLower = targetMapel.trim().toLowerCase();
      const sessionKey = `${student.id}::${pLower}::${mLower}`;
      const sessionHit = sessionSavedRef.current.get(sessionKey);
      if (sessionHit) return sessionHit;

      return cbtResults.find((r) => {
        if (isTkaResultEntry(r)) return false;
        const studentMatch =
          r.studentId === student.id ||
          (student.nisn && r.nisn && r.nisn === student.nisn);
        if (!studentMatch) return false;
        if (matchingExam && r.examId === matchingExam.id) return true;
        const rPaket = (r.paketName || '').trim().toLowerCase();
        const rMapel = (r.mapel || '').trim().toLowerCase();
        return rPaket === pLower && rMapel === mLower;
      });
    },
    [cbtResults, matchingExam]
  );

  const eligibleStudents = useMemo(() => {
    return sortedStudents.filter((s) => {
      if (kelasFilter !== 'all' && s.kelas !== kelasFilter) return false;
      if (!includeAllStudentsInClass) {
        const isInc = isSiswaInklusi(s.kebutuhanKhusus);
        if (isInclusivePackage && !isInc) return false;
        if (!isInclusivePackage && isInc) return false;
      }
      return true;
    });
  }, [sortedStudents, kelasFilter, includeAllStudentsInClass, isInclusivePackage]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return eligibleStudents.filter((s) => {
      const existing = findExistingCbtResult(s, paket, mapel);
      if (examStatusFilter === 'belum' && existing) return false;
      if (examStatusFilter === 'sudah' && !existing) return false;
      if (q && !s.nama.toLowerCase().includes(q) && !(s.nisn || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [eligibleStudents, examStatusFilter, studentSearch, findExistingCbtResult, paket, mapel]);

  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    if (seed.studentId && studentByIdMap.has(seed.studentId)) return seed.studentId;
    return filteredStudents[0]?.id || sortedStudents[0]?.id || '';
  });

  const [singleScoreInput, setSingleScoreInput] = useState<string>(() => {
    const target =
      (seed.studentId && studentByIdMap.get(seed.studentId)) || filteredStudents[0];
    if (!target) return '';
    const existing = findExistingCbtResult(target, paket, mapel);
    return existing ? String(Math.round(Number(existing.nilai) || 0)) : '';
  });

  const [batchScores, setBatchScores] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    eligibleStudents.forEach((s) => {
      const ex = findExistingCbtResult(s, paket, mapel);
      map[s.id] = ex ? String(Math.round(Number(ex.nilai) || 0)) : '';
    });
    return map;
  });

  const batchTableRef = useRef<HTMLDivElement | null>(null);
  const singleInputRef = useRef<HTMLInputElement | null>(null);

  const rebuildBatchScoresForFilter = useCallback(
    (nextPaket: string, nextMapel: string, targetList: Student[]) => {
      const map: Record<string, string> = {};
      targetList.forEach((s) => {
        const ex = findExistingCbtResult(s, nextPaket, nextMapel);
        map[s.id] = ex ? String(Math.round(Number(ex.nilai) || 0)) : '';
      });
      setBatchScores(map);
    },
    [findExistingCbtResult]
  );

  const syncSingleStudentScore = useCallback(
    (targetStudentId: string, nextPaket: string, nextMapel: string) => {
      const st = studentByIdMap.get(targetStudentId);
      if (!st) {
        setSingleScoreInput('');
        return;
      }
      const existing = findExistingCbtResult(st, nextPaket, nextMapel);
      setSingleScoreInput(
        existing ? String(Math.round(Number(existing.nilai) || 0)) : ''
      );
      if (existing?.tanggal) setTanggal(existing.tanggal);
    },
    [studentByIdMap, findExistingCbtResult]
  );

  const handleFilterTargetChange = (nextPaket: string, nextMapel: string, nextKelas: string) => {
    setPaket(nextPaket);
    setMapel(nextMapel);
    setKelasFilter(nextKelas);

    const nextEligible = sortedStudents.filter((s) => {
      if (nextKelas !== 'all' && s.kelas !== nextKelas) return false;
      if (!includeAllStudentsInClass) {
        const nextInc = nextPaket.toLowerCase().includes('inklusi');
        const isInc = isSiswaInklusi(s.kebutuhanKhusus);
        if (nextInc && !isInc) return false;
        if (!nextInc && isInc) return false;
      }
      return true;
    });

    rebuildBatchScoresForFilter(nextPaket, nextMapel, nextEligible);
    const keepId = nextEligible.some((s) => s.id === selectedStudentId)
      ? selectedStudentId
      : nextEligible[0]?.id || '';
    setSelectedStudentId(keepId);
    if (keepId) syncSingleStudentScore(keepId, nextPaket, nextMapel);
  };

  const handleBatchScoreChange = useCallback((studentId: string, rawVal: string) => {
    const clean = sanitizeManualScoreInput(rawVal);
    setBatchScores((prev) => ({
      ...prev,
      [studentId]: clean,
    }));
  }, []);

  const handleBatchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
      let nextRow = rowIndex;
      if (e.key === 'Enter' || e.key === 'ArrowDown') nextRow = rowIndex + 1;
      else if (e.key === 'ArrowUp') nextRow = rowIndex - 1;
      else return;
      e.preventDefault();
      const target = batchTableRef.current?.querySelector<HTMLInputElement>(
        `input[data-cbt-batch-row="${nextRow}"]`
      );
      if (target) {
        target.focus();
        target.select();
      }
    },
    []
  );

  const syncManualCbtToAssessments = (entries: CBTExamResult[]) => {
    if (entries.length === 0) return;
    try {
      const filters = getActiveFilters();
      const byClass = new Map<string, CBTExamResult[]>();
      entries.forEach((entry) => {
        const cls = entry.kelas || kelasFilter || 'Kelas 6A';
        const list = byClass.get(cls) || [];
        list.push(entry);
        byClass.set(cls, list);
      });

      const subjectMap: Record<string, string> = {
        'Pendidikan Agama Islam': 's_pabp_islam',
        'Pendidikan Pancasila': 's_pancasila',
        'Bahasa Indonesia': 's_bindonesia',
        'Matematika': 's_matematika',
        'Ilmu Pengetahuan Alam dan Sosial (IPAS)': 's_ipas',
        'Seni Rupa': 's_senirupa',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)': 's_pjok',
        'Bahasa Inggris': 's_binggris',
        'Muatan Lokal (PLBJ)': 's_plbj',
        'Koding dan Kecerdasan Artifisial (KKA)': 's_k6_kka',
      };

      const normMapel = mapel.toLowerCase();
      byClass.forEach((clsEntries, cls) => {
        const targetSubjects = getStoredSubjectsForClass(cls);
        const matchedSubject = targetSubjects.find((s) => {
          const sn = (s.name || '').toLowerCase();
          const sc = (s.code || '').toUpperCase();
          return (
            sn.includes(normMapel) ||
            normMapel.includes(sn) ||
            (normMapel.includes('agama') && (sc.startsWith('PAI') || sn.includes('agama'))) ||
            (normMapel.includes('seni') && (sc.startsWith('SENI') || sn.includes('seni'))) ||
            (normMapel.includes('plbj') && (sc.startsWith('PLBJ') || sn.includes('plbj'))) ||
            (normMapel.includes('koding') || normMapel.includes('kka')
              ? sc.startsWith('KKA') || sn.includes('koding') || sn.includes('kka')
              : false)
          );
        });
        const subId = matchedSubject?.id || subjectMap[mapel] || 's_bindonesia';
        const assessKey = `${filters.year}_${filters.semester}_${cls}_${subId}`;
        const existingAssessments = getStoredAssessments(assessKey);

        clsEntries.forEach((entry) => {
          const targetId = entry.studentId;
          if (!existingAssessments[targetId]) {
            existingAssessments[targetId] = {
              sumatif: {},
              remedial: {},
              asts: 0,
              asas: 0,
            };
          }
          const isRemedial = paket.toLowerCase().includes('remedial');
          const asMatch = paket.match(/(?:Sumatif|Remedial|AS|UH)\s*(?:Inklusi\s*)?(\d+)/i);
          if (asMatch) {
            const asIdx = parseInt(asMatch[1]);
            if (isRemedial) {
              existingAssessments[targetId].remedial[asIdx] = entry.nilai;
            } else {
              existingAssessments[targetId].sumatif[asIdx] = entry.nilai;
            }
          } else if (paket.toUpperCase().includes('ASTS')) {
            existingAssessments[targetId].asts = entry.nilai;
          } else if (paket.toUpperCase().includes('ASAS')) {
            existingAssessments[targetId].asas = entry.nilai;
          }
        });

        saveStoredAssessments(assessKey, existingAssessments);
        notifyStorageMutation('sekolahku-assessments-updated');
      });
    } catch {
      // ignore non-critical assessment sync error
    }
  };

  const persistManualCbtEntries = (entries: CBTExamResult[]): CBTExamResult[] => {
    const currentAll = getStoredCBTResults();
    const map = new Map<string, CBTExamResult>();
    const makeKey = (r: CBTExamResult) =>
      isTkaResultEntry(r)
        ? `tka::${r.examId}::${r.studentId}::${r.recordedAt || 0}`
        : buildCbtResultDocId(r.examId, r.nisn || r.studentId);

    currentAll.forEach((item) => map.set(makeKey(item), item));
    entries.forEach((entry) => {
      map.set(makeKey(entry), entry);
      const sessionKey = `${entry.studentId}::${paket.trim().toLowerCase()}::${mapel.trim().toLowerCase()}`;
      sessionSavedRef.current.set(sessionKey, entry);
    });

    const mergedAll = Array.from(map.values());
    saveStoredCBTResults(mergedAll);
    syncManualCbtToAssessments(entries);
    notifyStorageMutation('sekolahku-cbt-results-updated');
    notifyStorageMutation('sekolahku-exam-results-updated');

    // Sync ke Firestore cbt_results & hasil_ujian secara non-blocking
    entries.forEach((entry) => {
      void saveCbtResultToFirestore(entry).catch(() => {});
      void saveHasilUjianToFirestore({
        nisn: entry.nisn || entry.studentId,
        id_ujian: entry.examId,
        studentId: entry.studentId,
        nama_siswa: entry.studentName,
        kelas: entry.kelas || kelasFilter || '-',
        category: 'cbt',
        mapel: entry.mapel || mapel,
        paketName: entry.paketName || paket,
        judul: entry.judul || `${paket} - ${mapel}`,
        status: 'selesai',
        skor: entry.nilai,
        total_soal: matchingExam?.soalList?.length || 0,
        no_soal_betul: [],
        no_soal_salah: [],
        jawaban_siswa: entry.jawabanSiswa || {},
        waktu_selesai: entry.waktuSelesai,
      }).catch(() => {});
    });

    return mergedAll.filter((r) => !isTkaResultEntry(r));
  };

  const buildEntryForStudent = (student: Student, scoreNum: number): CBTExamResult => {
    const existing = findExistingCbtResult(student, paket, mapel);
    const examId =
      existing?.examId ||
      matchingExam?.id ||
      makeSyntheticCbtExamId(paket, mapel, student.kelas || kelasFilter);
    const clampedScore = Math.round(Math.min(100, Math.max(0, scoreNum)));
    const parsedSeconds = parseDurasiToSeconds(undefined, durasiText) || 2700;

    return {
      ...(existing || {}),
      examId,
      studentId: student.id,
      studentName: student.nama,
      nisn: student.nisn || student.id,
      kelas: student.kelas || kelasFilter,
      jenjang: student.kelas || kelasFilter || 'Umum',
      skor: existing?.skor && existing.jawabanSiswa && Object.keys(existing.jawabanSiswa).length > 0 ? existing.skor : clampedScore,
      nilai: clampedScore,
      waktuSelesai: existing?.waktuSelesai || new Date().toLocaleTimeString(),
      jawabanSiswa: existing?.jawabanSiswa || {},
      category: 'cbt',
      mapel,
      judul: matchingExam?.judul || `${paket} - ${mapel}`,
      paketName: paket,
      tanggal: tanggal.trim() || existing?.tanggal || getLocalTodayStr(),
      recordedAt: existing?.recordedAt || Date.now(),
      tahunPelajaran: existing?.tahunPelajaran || activeYear,
      semester: existing?.semester || activeSemester,
      durasiDetik: existing?.durasiDetik || parsedSeconds,
      statusPengerjaan: 'selesai',
      updatedAt: new Date().toISOString(),
    };
  };

  const handleSaveSingle = (advanceToNext: boolean) => {
    const student = studentByIdMap.get(selectedStudentId);
    if (!student) {
      onValidationError('Pilih peserta didik terlebih dahulu.');
      return;
    }
    if (singleScoreInput.trim() === '') {
      onValidationError('Isi nilai CBT (0–100) terlebih dahulu.');
      return;
    }
    const entry = buildEntryForStudent(student, Number(singleScoreInput));
    const updatedCbtOnly = persistManualCbtEntries([entry]);
    setBatchScores((prev) => ({
      ...prev,
      [student.id]: String(entry.nilai),
    }));

    const toastMsg = `Nilai CBT "${student.nama}" (${mapel} · ${paket}) tersimpan: ${entry.nilai}.`;

    if (advanceToNext) {
      const curIdx = filteredStudents.findIndex((s) => s.id === student.id);
      const nextSt =
        curIdx >= 0 && curIdx + 1 < filteredStudents.length
          ? filteredStudents[curIdx + 1]
          : null;
      if (nextSt) {
        setSelectedStudentId(nextSt.id);
        syncSingleStudentScore(nextSt.id, paket, mapel);
        requestAnimationFrame(() => {
          singleInputRef.current?.focus();
          singleInputRef.current?.select();
        });
      }
      onSaved(updatedCbtOnly, toastMsg, !nextSt);
    } else {
      onSaved(updatedCbtOnly, toastMsg, true);
    }
  };

  const filledBatchCount = useMemo(() => {
    return filteredStudents.filter((s) => (batchScores[s.id] ?? '').trim() !== '').length;
  }, [filteredStudents, batchScores]);

  const handleSaveBatch = () => {
    const entries: CBTExamResult[] = [];
    filteredStudents.forEach((student) => {
      const raw = (batchScores[student.id] ?? '').trim();
      if (raw === '') return;
      const existing = findExistingCbtResult(student, paket, mapel);
      const numericVal = Math.round(Math.min(100, Math.max(0, Number(raw) || 0)));
      if (existing && Math.round(Number(existing.nilai) || 0) === numericVal) {
        return;
      }
      entries.push(buildEntryForStudent(student, numericVal));
    });

    if (entries.length === 0) {
      onValidationError(
        filledBatchCount === 0
          ? 'Isi minimal 1 nilai siswa pada daftar di bawah sebelum menyimpan.'
          : 'Tidak ada perubahan nilai baru untuk disimpan.'
      );
      return;
    }

    const updatedCbtOnly = persistManualCbtEntries(entries);
    onSaved(
      updatedCbtOnly,
      `Berhasil menyimpan nilai CBT manual untuk ${entries.length} siswa (${mapel} · ${paket})!`,
      true
    );
  };

  const selectedStudent = studentByIdMap.get(selectedStudentId) || null;
  const selectedExisting = selectedStudent
    ? findExistingCbtResult(selectedStudent, paket, mapel)
    : undefined;

  const belumCount = useMemo(
    () => eligibleStudents.filter((s) => !findExistingCbtResult(s, paket, mapel)).length,
    [eligibleStudents, findExistingCbtResult, paket, mapel]
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 flex items-center justify-center p-3 sm:p-4 no-print">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Edit3 className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-display font-black text-base tracking-tight">
                Input &amp; Edit Nilai CBT Manual
              </h3>
              <p className="text-[11px] text-emerald-100/90">
                Menampilkan seluruh siswa yang berhak mengikuti ujian (termasuk yang berstatus Belum Ujian) agar nilai tetap dapat diinputkan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/15 text-white/80 hover:text-white cursor-pointer transition"
            aria-label="Tutup modal input nilai CBT manual"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switch & Target Exam Filters */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setModalTab('massal')}
                className={`px-3 py-1.5 rounded-lg text-xs font-display font-black flex items-center gap-1.5 cursor-pointer transition ${
                  modalTab === 'massal'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Input Cepat Per Kelas ({filteredStudents.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('individu')}
                className={`px-3 py-1.5 rounded-lg text-xs font-display font-black flex items-center gap-1.5 cursor-pointer transition ${
                  modalTab === 'individu'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Per Siswa (Individu)</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-bold">
              <span className="text-slate-500 tabular-nums">
                Total Peserta: <strong className="text-slate-800">{eligibleStudents.length}</strong>
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-amber-700 tabular-nums">
                Belum Ujian: <strong>{belumCount}</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-4">
              <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                Paket CBT
              </label>
              <select
                value={paket}
                onChange={(e) => handleFilterTargetChange(e.target.value, mapel, kelasFilter)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-emerald-600 cursor-pointer"
              >
                {availablePakets.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                Mata Pelajaran
              </label>
              <select
                value={mapel}
                onChange={(e) => handleFilterTargetChange(paket, e.target.value, kelasFilter)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-emerald-600 cursor-pointer"
              >
                {MAPEL_LIST.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                Kelas
              </label>
              <select
                value={kelasFilter}
                onChange={(e) => handleFilterTargetChange(paket, mapel, e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-emerald-600 cursor-pointer"
              >
                <option value="all">Semua Kelas</option>
                {CLASSES_LIST.map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                Status Ujian
              </label>
              <select
                value={examStatusFilter}
                onChange={(e) => setExamStatusFilter(e.target.value as 'all' | 'belum' | 'sudah')}
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-emerald-600 cursor-pointer"
              >
                <option value="all">Semua</option>
                <option value="belum">Belum Ujian</option>
                <option value="sudah">Sudah Ujian</option>
              </select>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="bg-sky-50 border border-sky-200 rounded-2xl px-3.5 py-2.5 text-[11px] text-sky-900 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <span>
                Semua siswa pada kelas terpilih ditampilkan agar guru dapat menginput nilai meski siswa belum mengikuti ujian CBT secara daring. Nilai otomatis tersinkron ke Report CBT, Leger Penilaian, dan status selesai SARAH AI.
              </span>
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAllStudentsInClass}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIncludeAllStudentsInClass(checked);
                  const nextList = sortedStudents.filter((s) => {
                    if (kelasFilter !== 'all' && s.kelas !== kelasFilter) return false;
                    if (!checked) {
                      const isInc = isSiswaInklusi(s.kebutuhanKhusus);
                      if (isInclusivePackage && !isInc) return false;
                      if (!isInclusivePackage && isInc) return false;
                    }
                    return true;
                  });
                  rebuildBatchScoresForFilter(paket, mapel, nextList);
                }}
                className="w-3.5 h-3.5 accent-emerald-600 rounded"
              />
              <span>Tampilkan Reguler + Inklusi</span>
            </label>
          </div>

          {modalTab === 'individu' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-black text-slate-600 mb-1">
                    Cari Nama / NISN
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Ketik nama atau NISN..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
                <div className="sm:col-span-7">
                  <label className="block text-[11px] font-black text-slate-600 mb-1">
                    Pilih Peserta Didik ({filteredStudents.length} Siswa)
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedStudentId(id);
                      syncSingleStudentScore(id, paket, mapel);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    {filteredStudents.length === 0 ? (
                      <option value="">-- Tidak ada siswa yang sesuai --</option>
                    ) : (
                      filteredStudents.map((s) => {
                        const existing = findExistingCbtResult(s, paket, mapel);
                        return (
                          <option key={s.id} value={s.id}>
                            {s.nama} — {s.kelas} · {existing ? `Sudah Ujian (${existing.nilai})` : 'Belum Ujian'}
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>
              </div>

              {selectedStudent && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-6 flex items-center gap-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl px-3.5 py-2.5">
                    <img
                      src={selectedStudent.fotoUrl || DEFAULT_STUDENT_AVATAR_URL}
                      alt={selectedStudent.nama}
                      className="w-10 h-10 rounded-full object-cover border border-emerald-300 bg-white shrink-0"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = DEFAULT_STUDENT_AVATAR_URL;
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-display font-black text-xs text-slate-900 truncate">
                          {selectedStudent.nama}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                            selectedExisting
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {selectedExisting ? 'Sudah Ujian' : 'Belum Ujian'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium">
                        {selectedStudent.kelas} · NISN:{' '}
                        <span className="font-mono">{selectedStudent.nisn || '-'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-black text-slate-600 mb-1">
                      Nilai CBT (0–100)
                    </label>
                    <input
                      ref={singleInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={3}
                      value={singleScoreInput}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setSingleScoreInput(sanitizeManualScoreInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveSingle(true);
                        }
                      }}
                      placeholder="0 - 100"
                      className="w-full px-3 py-2 rounded-xl border-2 border-emerald-500 bg-white text-center font-display font-black text-base text-slate-900 tabular-nums outline-none"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-black text-slate-600 mb-1">
                      Tanggal (YYYY-MM-DD)
                    </label>
                    <input
                      type="text"
                      value={tanggal}
                      onChange={(e) => setTanggal(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Cari nama atau NISN siswa..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs outline-none focus:border-emerald-600"
                  />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-600 font-bold">
                  <span>Durasi:</span>
                  <input
                    type="text"
                    value={durasiText}
                    onChange={(e) => setDurasiText(e.target.value)}
                    className="w-24 px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                  <span className="text-emerald-700 font-black tabular-nums">
                    {filledBatchCount}/{filteredStudents.length} terisi
                  </span>
                </div>
              </div>

              <div
                ref={batchTableRef}
                className="border border-slate-200 rounded-2xl overflow-x-auto max-h-[45vh]"
              >
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 font-black w-10 text-center">No</th>
                      <th className="p-2.5 font-black min-w-[220px]">Nama Siswa &amp; Status Ujian</th>
                      <th className="p-2.5 font-black text-center w-28">Nilai (0–100)</th>
                      <th className="p-2.5 font-black text-center w-20">Predikat</th>
                      <th className="p-2.5 font-black text-center w-24">Ketuntasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((s, idx) => (
                      <BatchCbtStudentRow
                        key={s.id}
                        student={s}
                        rowIndex={idx}
                        existingResult={findExistingCbtResult(s, paket, mapel)}
                        scoreValue={batchScores[s.id] ?? ''}
                        onScoreChange={handleBatchScoreChange}
                        onKeyDown={handleBatchKeyDown}
                      />
                    ))}
                    {filteredStudents.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400 italic">
                          Tidak ada data peserta didik pada kelas atau filter status ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold cursor-pointer"
          >
            Batal
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {modalTab === 'individu' ? (
              <>
                <button
                  type="button"
                  disabled={!selectedStudent}
                  onClick={() => handleSaveSingle(true)}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-display font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>Simpan &amp; Lanjut Siswa Berikutnya</span>
                </button>
                <button
                  type="button"
                  disabled={!selectedStudent}
                  onClick={() => handleSaveSingle(false)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-display font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Nilai</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={filledBatchCount === 0}
                onClick={handleSaveBatch}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-display font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Nilai CBT ({filledBatchCount} Siswa)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
