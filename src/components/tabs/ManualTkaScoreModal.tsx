import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  CheckCircle,
  ChevronRight,
  Edit3,
  Lock,
  Save,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import { Student } from '../../types';
import { TKA_JENIS_LIST } from '../../data/defaultData';
import {
  DEFAULT_STUDENT_AVATAR_URL,
  TKAMapelScoreKey,
  TKASubmissionItem,
  extractBaseTkaPaket,
  normalizeTkaMapelKey,
  sanitizeSubmissionFotoUrl,
} from '../../utils/storage';
import {
  isAnyTkaMapelLocked,
  isTkaMapelLocked,
  makeSubmissionDocId,
} from '../../utils/tkaFirestore';

export interface ManualTkaModalSeed {
  paket: string;
  studentId?: string;
  classFilter: string;
  initialRecord?: TKASubmissionItem | null;
}

interface ManualTkaScoreModalProps {
  seed: ManualTkaModalSeed;
  tkaStudents: Student[];
  availableClasses: string[];
  tkaSubmissions: TKASubmissionItem[];
  activeYear: string;
  activeSemester: string;
  onClose: () => void;
  onApplySavedSubmissions: (
    savedSubs: TKASubmissionItem[],
    toastMessage: string,
    closeAfter: boolean
  ) => void;
  onValidationError: (message: string) => void;
}

const MANUAL_TKA_MAPEL_LIST: Array<{ key: TKAMapelScoreKey; shortLabel: string }> = [
  { key: 'Bahasa Indonesia', shortLabel: 'B. Indonesia' },
  { key: 'Matematika', shortLabel: 'Matematika' },
  { key: 'IPAS', shortLabel: 'IPAS' },
  { key: 'Bahasa Inggris', shortLabel: 'B. Inggris' },
  { key: 'Koding dan Kecerdasan Artifisial (KKA)', shortLabel: 'KKA' },
];

const EMPTY_MANUAL_SCORES: Record<TKAMapelScoreKey, string> = {
  'Bahasa Indonesia': '',
  'Matematika': '',
  'IPAS': '',
  'Bahasa Inggris': '',
  'Koding dan Kecerdasan Artifisial (KKA)': '',
};

const formatManualTanggalToday = (): string =>
  new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const sanitizeManualScoreInput = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  if (digitsOnly === '') return '';
  const num = Math.min(100, Math.max(0, Number(digitsOnly)));
  return String(num);
};

const extractManualMapelInputs = (
  sub?: TKASubmissionItem | null
): Record<TKAMapelScoreKey, string> => {
  if (!sub) return { ...EMPTY_MANUAL_SCORES };
  const completed = Array.isArray(sub.completedMapels)
    ? sub.completedMapels.map((m) => normalizeTkaMapelKey(m))
    : [];
  const next = { ...EMPTY_MANUAL_SCORES };
  MANUAL_TKA_MAPEL_LIST.forEach(({ key }) => {
    const val = Number(sub.scoresPerMapel?.[key] ?? 0);
    const isPresent = completed.length > 0 ? completed.includes(key) : val > 0;
    next[key] = isPresent && Number.isFinite(val) ? String(Math.round(val)) : '';
  });
  return next;
};

const buildManualSubmissionRecord = (params: {
  student: Student;
  paket: string;
  mapelInputs: Partial<Record<TKAMapelScoreKey, string>>;
  tanggalUjian?: string;
  durasi?: string;
  existingSub?: TKASubmissionItem;
  activeYear: string;
  activeSemester: string;
  todayLabel: string;
}): TKASubmissionItem | null => {
  const {
    student,
    paket,
    mapelInputs,
    tanggalUjian,
    durasi,
    existingSub,
    activeYear,
    activeSemester,
    todayLabel,
  } = params;
  const basePaket = extractBaseTkaPaket(paket) || paket;
  const completedMapels: TKAMapelScoreKey[] = [];
  const scoresPerMapel: TKASubmissionItem['scoresPerMapel'] = {
    'Bahasa Indonesia': 0,
    'Matematika': 0,
    'IPAS': 0,
    'Bahasa Inggris': 0,
    'Koding dan Kecerdasan Artifisial (KKA)': 0,
  };

  MANUAL_TKA_MAPEL_LIST.forEach(({ key }) => {
    if (isTkaMapelLocked(existingSub, key)) {
      const lockedVal = Number(
        existingSub?.lockedMapels?.[key]?.score ?? existingSub?.scoresPerMapel?.[key] ?? 0
      );
      completedMapels.push(key);
      scoresPerMapel[key] = Number.isFinite(lockedVal) ? lockedVal : 0;
      return;
    }
    const raw = (mapelInputs[key] ?? '').toString().trim();
    if (raw !== '') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        const clamped = Math.round(Math.min(100, Math.max(0, parsed)));
        completedMapels.push(key);
        scoresPerMapel[key] = clamped;
      }
    }
  });

  if (completedMapels.length === 0) return null;

  const sum = completedMapels.reduce((acc, k) => acc + Number(scoresPerMapel?.[k] ?? 0), 0);
  const skorTotal = Math.round(sum / completedMapels.length);
  const predikat: 'A' | 'B' | 'C' | 'D' =
    skorTotal >= 88 ? 'A' : skorTotal >= 78 ? 'B' : skorTotal >= 68 ? 'C' : 'D';
  const status: 'Tuntas' | 'Remedial' = skorTotal >= 75 ? 'Tuntas' : 'Remedial';
  const docId = makeSubmissionDocId(student.id, basePaket, existingSub?.id);
  const nowIso = new Date().toISOString();
  const hasLockedAny = isAnyTkaMapelLocked(existingSub);

  return {
    ...(existingSub || {}),
    id: docId,
    studentId: student.id,
    studentName: student.nama,
    nisn: student.nisn || '',
    kelas: student.kelas || '-',
    fotoUrl: sanitizeSubmissionFotoUrl(student.fotoUrl || existingSub?.fotoUrl),
    paket: basePaket,
    paketDasar: basePaket,
    completedMapels,
    answers: existingSub?.answers || {},
    scoresPerMapel,
    skorTotal,
    predikat,
    status,
    sumberNilai: hasLockedAny ? 'UJIAN_TKA' : 'INPUT_MANUAL',
    isLocked: hasLockedAny,
    ...(hasLockedAny && existingSub?.waktuTerkunci ? { waktuTerkunci: existingSub.waktuTerkunci } : {}),
    ...(hasLockedAny && existingSub?.lockedMapels ? { lockedMapels: existingSub.lockedMapels } : {}),
    tanggalUjian: (tanggalUjian || '').trim() || existingSub?.tanggalUjian || todayLabel,
    durasiPengerjaan: (durasi || '').trim() || existingSub?.durasiPengerjaan || '45 Menit',
    tahunPelajaran: existingSub?.tahunPelajaran || activeYear,
    semester: existingSub?.semester || activeSemester,
    updatedAt: nowIso,
  };
};

interface ManualBatchStudentRowProps {
  student: Student;
  rowIndex: number;
  existingSub?: TKASubmissionItem;
  rowScores: Partial<Record<TKAMapelScoreKey, string>> | undefined;
  onCellChange: (studentId: string, mapelKey: TKAMapelScoreKey, rawValue: string) => void;
  onCellKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => void;
}

const ManualBatchStudentRow = memo(function ManualBatchStudentRow({
  student,
  rowIndex,
  existingSub,
  rowScores,
  onCellChange,
  onCellKeyDown,
}: ManualBatchStudentRowProps) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < MANUAL_TKA_MAPEL_LIST.length; i++) {
    const k = MANUAL_TKA_MAPEL_LIST[i].key;
    const raw = (rowScores?.[k] ?? '').toString().trim();
    if (raw !== '') {
      const n = Math.round(Math.min(100, Math.max(0, Number(raw) || 0)));
      sum += n;
      count++;
    }
  }
  const rowAvg = count > 0 ? Math.round(sum / count) : null;
  const anyLocked = isAnyTkaMapelLocked(existingSub);

  return (
    <tr className="hover:bg-slate-50">
      <td className="p-2 text-center text-slate-400 font-bold tabular-nums">
        {rowIndex + 1}
      </td>
      <td className="p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-slate-900 leading-tight">{student.nama}</span>
          {anyLocked ? (
            <span
              className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase inline-flex items-center gap-0.5"
              title="Nilai resmi dari Ujian TKA siswa dan terkunci 1x"
            >
              <Lock className="w-2.5 h-2.5" />
              Terkunci
            </span>
          ) : existingSub ? (
            <span
              className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[9px] font-black uppercase"
              title="Input manual guru — akan terganti & terkunci 1x jika siswa mengerjakan Ujian TKA"
            >
              Manual
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase">
              Belum Ujian
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 tabular-nums">
          {student.kelas} · {student.nisn || '-'}
        </div>
      </td>
      {MANUAL_TKA_MAPEL_LIST.map(({ key }, colIndex) => {
        const isCellLocked = isTkaMapelLocked(existingSub, key);
        return (
          <td key={key} className="p-1.5 text-center">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              disabled={isCellLocked}
              data-batch-cell={`${rowIndex}-${colIndex}`}
              value={rowScores?.[key] ?? ''}
              onFocus={(e) => {
                if (!isCellLocked) e.currentTarget.select();
              }}
              onChange={(e) => {
                if (isCellLocked) return;
                onCellChange(student.id, key, e.target.value);
              }}
              onKeyDown={(e) => onCellKeyDown(e, rowIndex, colIndex)}
              placeholder="—"
              title={
                isCellLocked
                  ? 'Terkunci (Hasil Ujian TKA Resmi)'
                  : 'Isi nilai manual 0-100'
              }
              className={`w-16 px-1.5 py-1 rounded-lg border text-center font-bold tabular-nums outline-none ${
                isCellLocked
                  ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900 cursor-not-allowed opacity-80'
                  : 'border-slate-300 bg-white text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
              }`}
            />
          </td>
        );
      })}
      <td className="p-2 text-center font-display font-black tabular-nums">
        {rowAvg !== null ? (
          <span className={rowAvg >= 75 ? 'text-emerald-700' : 'text-rose-600'}>
            {rowAvg}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
    </tr>
  );
});

export const ManualTkaScoreModal: React.FC<ManualTkaScoreModalProps> = ({
  seed,
  tkaStudents,
  availableClasses,
  tkaSubmissions,
  activeYear,
  activeSemester,
  onClose,
  onApplySavedSubmissions,
  onValidationError,
}) => {
  const todayLabel = useMemo(() => formatManualTanggalToday(), []);

  // Index submissions in O(1) maps so switching students/paket or opening batch tab is instant
  const submissionLookup = useMemo(() => {
    const byDocId = new Map<string, TKASubmissionItem>();
    const byStudentPaket = new Map<string, TKASubmissionItem>();
    const byNisnPaket = new Map<string, TKASubmissionItem>();
    for (let i = 0; i < tkaSubmissions.length; i++) {
      const sub = tkaSubmissions[i];
      if (!sub) continue;
      const basePaket = sub.paketDasar || extractBaseTkaPaket(sub.paket);
      if (sub.id && !byDocId.has(sub.id)) {
        byDocId.set(sub.id, sub);
      }
      if (sub.studentId && basePaket) {
        const spKey = `${sub.studentId}::${basePaket}`;
        if (!byStudentPaket.has(spKey)) byStudentPaket.set(spKey, sub);
      }
      if (sub.nisn && basePaket) {
        const npKey = `${sub.nisn}::${basePaket}`;
        if (!byNisnPaket.has(npKey)) byNisnPaket.set(npKey, sub);
      }
    }
    return { byDocId, byStudentPaket, byNisnPaket };
  }, [tkaSubmissions]);

  const sessionSavedMapRef = useRef<Map<string, TKASubmissionItem>>(new Map());
  const batchTanggalDirtyRef = useRef<boolean>(false);

  const findExistingFast = useCallback(
    (studentId: string, targetPaket: string, nisn?: string): TKASubmissionItem | undefined => {
      const basePaket = extractBaseTkaPaket(targetPaket) || targetPaket;
      const sessionHit = sessionSavedMapRef.current.get(`${studentId}::${basePaket}`);
      if (sessionHit) return sessionHit;
      const expectedDocId = makeSubmissionDocId(studentId, basePaket);
      return (
        submissionLookup.byDocId.get(expectedDocId) ||
        submissionLookup.byStudentPaket.get(`${studentId}::${basePaket}`) ||
        (nisn ? submissionLookup.byNisnPaket.get(`${nisn}::${basePaket}`) : undefined)
      );
    },
    [submissionLookup]
  );

  const sortedTkaStudents = useMemo(
    () =>
      [...tkaStudents].sort((a, b) => {
        const cmpCls = (a.kelas || '').localeCompare(b.kelas || '', 'id', { numeric: true });
        if (cmpCls !== 0) return cmpCls;
        return (a.nama || '').localeCompare(b.nama || '', 'id');
      }),
    [tkaStudents]
  );

  const studentByIdMap = useMemo(() => {
    const m = new Map<string, Student>();
    sortedTkaStudents.forEach((s) => m.set(s.id, s));
    return m;
  }, [sortedTkaStudents]);

  const classStudentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    sortedTkaStudents.forEach((s) => {
      if (s.kelas) {
        counts.set(s.kelas, (counts.get(s.kelas) || 0) + 1);
      }
    });
    return counts;
  }, [sortedTkaStudents]);

  const initialStudent = useMemo(() => {
    if (seed.studentId) {
      const matched = sortedTkaStudents.find((s) => s.id === seed.studentId);
      if (matched) return matched;
    }
    return (
      sortedTkaStudents.find((s) => seed.classFilter === 'all' || s.kelas === seed.classFilter) ||
      sortedTkaStudents[0] ||
      null
    );
  }, [seed.studentId, seed.classFilter, sortedTkaStudents]);

  const initialExistingSub = useMemo(() => {
    if (seed.initialRecord) return seed.initialRecord;
    if (!initialStudent) return undefined;
    return findExistingFast(initialStudent.id, seed.paket, initialStudent.nisn);
  }, [seed.initialRecord, seed.paket, initialStudent, findExistingFast]);

  const [modalTab, setModalTab] = useState<'individu' | 'massal'>('individu');
  const [paket, setPaket] = useState<string>(seed.paket || TKA_JENIS_LIST[0] || 'Simulasi 1');
  const [studentClassFilter, setStudentClassFilter] = useState<string>(
    seed.initialRecord ? 'all' : seed.classFilter || 'all'
  );
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentId, setStudentId] = useState<string>(initialStudent?.id || seed.studentId || '');
  const [scoresInput, setScoresInput] = useState<Record<TKAMapelScoreKey, string>>(() =>
    extractManualMapelInputs(initialExistingSub)
  );
  const [tanggalUjian, setTanggalUjian] = useState<string>(
    () => initialExistingSub?.tanggalUjian || todayLabel
  );
  const [durasi, setDurasi] = useState<string>(
    () => initialExistingSub?.durasiPengerjaan || '45 Menit'
  );

  // Batch state initialized lazily when entering the massal tab
  const [batchClassFilter, setBatchClassFilter] = useState<string>(seed.classFilter || 'all');
  const [examStatusFilter, setExamStatusFilter] = useState<'all' | 'belum' | 'sudah'>('all');
  const [batchInputs, setBatchInputs] = useState<
    Record<string, Partial<Record<TKAMapelScoreKey, string>>>
  >({});
  const batchInitializedPaketRef = useRef<string | null>(null);
  const batchTableContainerRef = useRef<HTMLDivElement | null>(null);
  const singleScoreInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const buildBatchMapForPaket = useCallback(
    (targetPaket: string) => {
      const map: Record<string, Partial<Record<TKAMapelScoreKey, string>>> = {};
      for (let i = 0; i < sortedTkaStudents.length; i++) {
        const s = sortedTkaStudents[i];
        const existing = findExistingFast(s.id, targetPaket, s.nisn);
        map[s.id] = extractManualMapelInputs(existing);
      }
      return map;
    },
    [sortedTkaStudents, findExistingFast]
  );

  const ensureBatchInputsForPaket = useCallback(
    (targetPaket: string, forceRebuild = false) => {
      if (!forceRebuild && batchInitializedPaketRef.current === targetPaket) return;
      batchInitializedPaketRef.current = targetPaket;
      setBatchInputs(buildBatchMapForPaket(targetPaket));
    },
    [buildBatchMapForPaket]
  );

  const syncIndividuSelection = useCallback(
    (targetStudentId: string, targetPaket: string) => {
      const student = studentByIdMap.get(targetStudentId);
      const existing = findExistingFast(targetStudentId, targetPaket, student?.nisn);
      setScoresInput(extractManualMapelInputs(existing));
      setTanggalUjian(existing?.tanggalUjian || todayLabel);
      setDurasi(existing?.durasiPengerjaan || '45 Menit');
    },
    [studentByIdMap, findExistingFast, todayLabel]
  );

  const selectableStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return sortedTkaStudents.filter((s) => {
      if (studentClassFilter !== 'all' && s.kelas !== studentClassFilter) return false;
      if (examStatusFilter !== 'all') {
        const hasSub = Boolean(findExistingFast(s.id, paket, s.nisn));
        if (examStatusFilter === 'belum' && hasSub) return false;
        if (examStatusFilter === 'sudah' && !hasSub) return false;
      }
      if (q && !s.nama.toLowerCase().includes(q) && !(s.nisn || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [sortedTkaStudents, studentClassFilter, examStatusFilter, studentSearch, findExistingFast, paket]);

  const batchStudents = useMemo(
    () =>
      sortedTkaStudents.filter((s) => {
        if (batchClassFilter !== 'all' && s.kelas !== batchClassFilter) return false;
        if (examStatusFilter !== 'all') {
          const hasSub = Boolean(findExistingFast(s.id, paket, s.nisn));
          if (examStatusFilter === 'belum' && hasSub) return false;
          if (examStatusFilter === 'sudah' && !hasSub) return false;
        }
        return true;
      }),
    [sortedTkaStudents, batchClassFilter, examStatusFilter, findExistingFast, paket]
  );

  const selectedStudent = studentByIdMap.get(studentId) || null;
  const selectedStudentExistingSub = selectedStudent
    ? findExistingFast(selectedStudent.id, paket, selectedStudent.nisn)
    : undefined;

  const { filledCount, previewAvg, previewPredikat, previewStatus } = useMemo(() => {
    const vals: number[] = [];
    for (let i = 0; i < MANUAL_TKA_MAPEL_LIST.length; i++) {
      const raw = (scoresInput[MANUAL_TKA_MAPEL_LIST[i].key] ?? '').trim();
      if (raw !== '') {
        vals.push(Math.round(Math.min(100, Math.max(0, Number(raw) || 0))));
      }
    }
    if (vals.length === 0) {
      return {
        filledCount: 0,
        previewAvg: null as number | null,
        previewPredikat: '-',
        previewStatus: '-',
      };
    }
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const predikat = avg >= 88 ? 'A' : avg >= 78 ? 'B' : avg >= 68 ? 'C' : 'D';
    const status = avg >= 75 ? 'Tuntas' : 'Remedial';
    return {
      filledCount: vals.length,
      previewAvg: avg,
      previewPredikat: predikat,
      previewStatus: status,
    };
  }, [scoresInput]);

  const filledBatchCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < batchStudents.length; i++) {
      const row = batchInputs[batchStudents[i].id];
      if (!row) continue;
      const hasAny = MANUAL_TKA_MAPEL_LIST.some(
        ({ key }) => (row[key] ?? '').toString().trim() !== ''
      );
      if (hasAny) count++;
    }
    return count;
  }, [batchStudents, batchInputs]);

  // Stable cell handler so React.memo skips every untouched row
  const handleBatchCellChange = useCallback(
    (targetStudentId: string, mapelKey: TKAMapelScoreKey, rawValue: string) => {
      const val = sanitizeManualScoreInput(rawValue);
      setBatchInputs((prev) => ({
        ...prev,
        [targetStudentId]: {
          ...(prev[targetStudentId] || {}),
          [mapelKey]: val,
        },
      }));
    },
    []
  );

  // Excel-like Enter/Arrow keyboard navigation inside batch table
  const handleBatchCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
      let nextRow = rowIndex;
      let nextCol = colIndex;
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        nextRow = rowIndex + 1;
      } else if (e.key === 'ArrowUp') {
        nextRow = rowIndex - 1;
      } else {
        return;
      }
      e.preventDefault();
      const container = batchTableContainerRef.current;
      if (!container) return;
      const target = container.querySelector<HTMLInputElement>(
        `input[data-batch-cell="${nextRow}-${nextCol}"]`
      );
      if (target) {
        target.focus();
        target.select();
      }
    },
    []
  );

  const hasSubmissionValuesChanged = (
    prevSub: TKASubmissionItem | undefined,
    nextSub: TKASubmissionItem
  ): boolean => {
    if (!prevSub) return true;
    const prevCompleted = Array.isArray(prevSub.completedMapels)
      ? prevSub.completedMapels.map((m) => normalizeTkaMapelKey(m))
      : [];
    const nextCompleted = Array.isArray(nextSub.completedMapels)
      ? nextSub.completedMapels.map((m) => normalizeTkaMapelKey(m))
      : [];
    if (prevCompleted.length !== nextCompleted.length) return true;
    for (let i = 0; i < MANUAL_TKA_MAPEL_LIST.length; i++) {
      const k = MANUAL_TKA_MAPEL_LIST[i].key;
      if (Number(prevSub.scoresPerMapel?.[k] ?? 0) !== Number(nextSub.scoresPerMapel?.[k] ?? 0)) {
        return true;
      }
      if (prevCompleted.includes(k) !== nextCompleted.includes(k)) {
        return true;
      }
    }
    if ((prevSub.tanggalUjian || '') !== (nextSub.tanggalUjian || '')) return true;
    if ((prevSub.durasiPengerjaan || '') !== (nextSub.durasiPengerjaan || '')) return true;
    return false;
  };

  const handleSaveSingle = (advanceToNext: boolean) => {
    const student = studentByIdMap.get(studentId);
    if (!student) {
      onValidationError('Pilih siswa Kelas 6 terlebih dahulu.');
      return;
    }
    const existingSub = findExistingFast(student.id, paket, student.nisn);
    const newSub = buildManualSubmissionRecord({
      student,
      paket,
      mapelInputs: scoresInput,
      tanggalUjian,
      durasi,
      existingSub,
      activeYear,
      activeSemester,
      todayLabel,
    });
    if (!newSub) {
      onValidationError('Isi minimal 1 nilai mata pelajaran (0–100) terlebih dahulu.');
      return;
    }

    const basePaket = newSub.paketDasar || extractBaseTkaPaket(newSub.paket);
    sessionSavedMapRef.current.set(`${student.id}::${basePaket}`, newSub);

    if (batchInitializedPaketRef.current === paket) {
      setBatchInputs((prev) => ({
        ...prev,
        [student.id]: extractManualMapelInputs(newSub),
      }));
    }

    const toastMsg = `Nilai TKA "${student.nama}" (${newSub.paket}) tersimpan — Rata-rata: ${newSub.skorTotal} (${newSub.predikat}).`;

    if (advanceToNext) {
      const curIdx = selectableStudents.findIndex((s) => s.id === student.id);
      const nextStudent =
        curIdx >= 0 && curIdx + 1 < selectableStudents.length
          ? selectableStudents[curIdx + 1]
          : null;
      if (nextStudent) {
        setStudentId(nextStudent.id);
        syncIndividuSelection(nextStudent.id, paket);
        requestAnimationFrame(() => {
          singleScoreInputRefs.current[0]?.focus();
          singleScoreInputRefs.current[0]?.select();
        });
      }
      onApplySavedSubmissions([newSub], toastMsg, !nextStudent);
    } else {
      onApplySavedSubmissions([newSub], toastMsg, true);
    }
  };

  const handleSaveBatch = () => {
    if (filledBatchCount === 0) {
      onValidationError('Isi minimal 1 nilai siswa pada daftar di bawah sebelum menyimpan.');
      return;
    }

    const savedSubs: TKASubmissionItem[] = [];
    for (let i = 0; i < batchStudents.length; i++) {
      const student = batchStudents[i];
      const inputs = batchInputs[student.id];
      if (!inputs) continue;
      const existingSub = findExistingFast(student.id, paket, student.nisn);
      const effectiveTanggal = batchTanggalDirtyRef.current
        ? tanggalUjian
        : existingSub?.tanggalUjian || tanggalUjian;
      const built = buildManualSubmissionRecord({
        student,
        paket,
        mapelInputs: inputs,
        tanggalUjian: effectiveTanggal,
        durasi: existingSub?.durasiPengerjaan || durasi,
        existingSub,
        activeYear,
        activeSemester,
        todayLabel,
      });
      if (built && hasSubmissionValuesChanged(existingSub, built)) {
        const basePaket = built.paketDasar || extractBaseTkaPaket(built.paket);
        sessionSavedMapRef.current.set(`${student.id}::${basePaket}`, built);
        savedSubs.push(built);
      }
    }

    if (savedSubs.length === 0) {
      onApplySavedSubmissions(
        [],
        `Semua nilai TKA pada paket "${paket}" sudah tersimpan dan mutakhir.`,
        true
      );
      return;
    }

    onApplySavedSubmissions(
      savedSubs,
      `Berhasil menyimpan nilai TKA untuk ${savedSubs.length} siswa pada paket "${paket}"!`,
      true
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 flex items-center justify-center p-3 sm:p-4 no-print">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Edit3 className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-display font-black text-base tracking-tight">
                Input &amp; Edit Nilai TKA Manual
              </h3>
              <p className="text-[11px] text-emerald-100/90">
                Tambahkan atau perbarui nilai TKA siswa per orang maupun per kelas. Penilaian otomatis dari soal CBT tetap berjalan normal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/15 text-white/80 hover:text-white cursor-pointer transition"
            aria-label="Tutup modal input nilai manual"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Controls: Paket Ujian & Mode Tabs */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
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
              <button
                type="button"
                onClick={() => {
                  ensureBatchInputsForPaket(paket);
                  setModalTab('massal');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-display font-black flex items-center gap-1.5 cursor-pointer transition ${
                  modalTab === 'massal'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Input Cepat Per Kelas ({batchStudents.length})</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] font-black text-slate-600 whitespace-nowrap">
              Paket TKA:
            </label>
            <select
              value={paket}
              onChange={(e) => {
                const nextPaket = e.target.value;
                setPaket(nextPaket);
                if (studentId) {
                  syncIndividuSelection(studentId, nextPaket);
                }
                if (modalTab === 'massal') {
                  ensureBatchInputsForPaket(nextPaket, true);
                } else {
                  batchInitializedPaketRef.current = null;
                }
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:border-emerald-600 outline-none cursor-pointer"
            >
              {TKA_JENIS_LIST.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Info Note preserving Auto Grading */}
          <div className="bg-sky-50 border border-sky-200 rounded-2xl px-3.5 py-2.5 text-[11px] text-sky-900 flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <span>
              <strong>Mode Hibrida Aman:</strong> Kosongkan kolom mata pelajaran yang belum diujikan. Jika siswa sebelumnya atau nanti mengerjakan soal TKA secara otomatis, riwayat jawaban CBT tetap tersimpan dan nilai per mapel akan tergabung otomatis.
            </span>
          </div>

          {modalTab === 'individu' ? (
            <div className="space-y-4">
              {/* Student Picker Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200">
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-black text-slate-600 mb-1">
                    Filter Kelas 6:
                  </label>
                  <select
                    value={studentClassFilter}
                    onChange={(e) => {
                      const cls = e.target.value;
                      setStudentClassFilter(cls);
                      const firstMatch = sortedTkaStudents.find(
                        (s) => cls === 'all' || s.kelas === cls
                      );
                      if (firstMatch) {
                        setStudentId(firstMatch.id);
                        syncIndividuSelection(firstMatch.id, paket);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    <option value="all">Semua Kelas 6</option>
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-black text-slate-600 mb-1">
                    Cari Nama / NISN:
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Ketik nama..."
                      className="w-full pl-8 pr-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
                <div className="sm:col-span-6">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-[11px] font-black text-slate-600">
                      Pilih Peserta Didik ({selectableStudents.length} Siswa):
                    </label>
                    <select
                      value={examStatusFilter}
                      onChange={(e) => setExamStatusFilter(e.target.value as 'all' | 'belum' | 'sudah')}
                      className="px-2 py-0.5 rounded-lg border border-slate-300 bg-white text-[10px] font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="all">Semua Status</option>
                      <option value="belum">Belum Ujian</option>
                      <option value="sudah">Sudah Ujian</option>
                    </select>
                  </div>
                  <select
                    value={studentId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setStudentId(nextId);
                      syncIndividuSelection(nextId, paket);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    {selectableStudents.length === 0 ? (
                      <option value="">-- Tidak ada siswa yang sesuai --</option>
                    ) : (
                      selectableStudents.map((s) => {
                        const existing = findExistingFast(s.id, paket, s.nisn);
                        return (
                          <option key={s.id} value={s.id}>
                            {s.nama} — {s.kelas} · {existing ? `Sudah Ujian (${existing.skorTotal})` : 'Belum Ujian'}
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>
              </div>

              {/* Selected Student Info + Date/Duration */}
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
                        {isAnyTkaMapelLocked(selectedStudentExistingSub) ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 inline-flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" />
                            Terkunci (Hasil Ujian TKA Resmi)
                          </span>
                        ) : selectedStudentExistingSub ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-sky-100 text-sky-800">
                            Manual
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800">
                            Belum Ujian
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium">
                        {selectedStudent.kelas} · NISN:{' '}
                        <span className="font-mono">{selectedStudent.nisn || '-'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-black text-slate-600 mb-1">
                      Tanggal Ujian:
                    </label>
                    <input
                      type="text"
                      value={tanggalUjian}
                      onChange={(e) => setTanggalUjian(e.target.value)}
                      placeholder="cth: 20 November 2026"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-black text-slate-600 mb-1">
                      Durasi Pengerjaan:
                    </label>
                    <input
                      type="text"
                      value={durasi}
                      onChange={(e) => setDurasi(e.target.value)}
                      placeholder="cth: 45 Menit"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              )}

              {selectedStudentExistingSub && isAnyTkaMapelLocked(selectedStudentExistingSub) && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-3.5 py-2.5 text-[11px] text-emerald-900 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    <strong>Nilai Ujian TKA Resmi Terkunci:</strong> Mata pelajaran bertanda <strong>Terkunci</strong> berasal dari pengerjaan langsung siswa dan tidak dapat ditimpa manual. Anda tetap dapat mengisi mata pelajaran lain yang masih kosong atau berstatus <strong>Manual</strong>.
                  </span>
                </div>
              )}

              {/* 5 Subject Score Inputs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800">
                    Nilai Per Mata Pelajaran (Skala 0 – 100):
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setScoresInput((prev) => {
                        const next = { ...EMPTY_MANUAL_SCORES };
                        MANUAL_TKA_MAPEL_LIST.forEach(({ key }) => {
                          if (isTkaMapelLocked(selectedStudentExistingSub, key)) {
                            next[key] = prev[key];
                          }
                        });
                        return next;
                      })
                    }
                    className="text-[11px] font-bold text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    Kosongkan Isian Manual
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {MANUAL_TKA_MAPEL_LIST.map(({ key, shortLabel }, idx) => {
                    const isMapelLocked = isTkaMapelLocked(selectedStudentExistingSub, key);
                    return (
                      <div
                        key={key}
                        className={`border rounded-2xl p-3 space-y-1.5 ${
                          isMapelLocked
                            ? 'bg-emerald-50/60 border-emerald-200'
                            : 'bg-slate-50 border-slate-200 focus-within:border-emerald-500 focus-within:bg-emerald-50/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <label className="block text-[11px] font-black text-slate-700 leading-tight">
                            {shortLabel}
                          </label>
                          {isMapelLocked && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-700">
                              <Lock className="w-2.5 h-2.5" /> Terkunci
                            </span>
                          )}
                        </div>
                        <input
                          ref={(el) => {
                            singleScoreInputRefs.current[idx] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={3}
                          disabled={isMapelLocked}
                          value={scoresInput[key]}
                          onFocus={(e) => {
                            if (!isMapelLocked) e.currentTarget.select();
                          }}
                          onChange={(e) => {
                            if (isMapelLocked) return;
                            const val = sanitizeManualScoreInput(e.target.value);
                            setScoresInput((prev) => ({
                              ...prev,
                              [key]: val,
                            }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const nextEl = singleScoreInputRefs.current[idx + 1];
                              if (nextEl && !nextEl.disabled) {
                                nextEl.focus();
                                nextEl.select();
                              } else {
                                handleSaveSingle(true);
                              }
                            }
                          }}
                          placeholder="—"
                          className={`w-full px-3 py-2 rounded-xl border text-center font-display font-black text-base tabular-nums outline-none ${
                            isMapelLocked
                              ? 'border-emerald-200 bg-white/80 text-emerald-900 cursor-not-allowed opacity-85'
                              : 'border-slate-300 bg-white text-slate-900 focus:border-emerald-600'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Calculation Preview */}
              <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-300">
                  Pratinjau Kalkulasi Otomatis ({filledCount} Mapel Diisi)
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 mr-1.5">Rata-rata:</span>
                    <span className="font-display font-black text-base text-amber-300 tabular-nums">
                      {previewAvg !== null ? previewAvg : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 mr-1.5">Predikat:</span>
                    <span className="font-display font-black text-sm px-2 py-0.5 rounded-lg bg-white/15">
                      {previewPredikat}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 mr-1.5">Status (KKM 75):</span>
                    <span
                      className={`font-display font-black text-xs px-2.5 py-0.5 rounded-lg ${
                        previewStatus === 'Tuntas'
                          ? 'bg-emerald-500/25 text-emerald-300'
                          : previewStatus === 'Remedial'
                          ? 'bg-rose-500/25 text-rose-300'
                          : 'bg-white/10 text-slate-300'
                      }`}
                    >
                      {previewStatus}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Batch / Per Class Input Tab */
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-black text-slate-700">Pilih Kelas:</label>
                  <select
                    value={batchClassFilter}
                    onChange={(e) => setBatchClassFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    <option value="all">
                      Semua Kelas 6 ({sortedTkaStudents.length} Siswa)
                    </option>
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls} ({classStudentCounts.get(cls) || 0} Siswa)
                      </option>
                    ))}
                  </select>
                  <select
                    value={examStatusFilter}
                    onChange={(e) => setExamStatusFilter(e.target.value as 'all' | 'belum' | 'sudah')}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    <option value="all">Semua Status Ujian</option>
                    <option value="belum">Belum Ujian</option>
                    <option value="sudah">Sudah Ujian</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 font-bold">
                  <span>Tanggal:</span>
                  <input
                    type="text"
                    value={tanggalUjian}
                    onChange={(e) => {
                      batchTanggalDirtyRef.current = true;
                      setTanggalUjian(e.target.value);
                    }}
                    className="w-36 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                  />
                  <span className="ml-1 text-emerald-700 font-black tabular-nums">
                    {filledBatchCount}/{batchStudents.length} siswa terisi
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
                <span>
                  Menampilkan seluruh peserta didik Kelas 6 (termasuk siswa berstatus <strong>Belum Ujian</strong>). Gunakan <strong>Tab</strong> atau <strong>Enter / Panah Bawah</strong> untuk pindah sel cepat.
                </span>
              </div>

              <div
                ref={batchTableContainerRef}
                className="border border-slate-200 rounded-2xl overflow-x-auto max-h-[46vh]"
              >
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 font-black w-8 text-center">No</th>
                      <th className="p-2.5 font-black min-w-[200px]">Nama Siswa &amp; Status Ujian</th>
                      {MANUAL_TKA_MAPEL_LIST.map(({ key, shortLabel }) => (
                        <th key={key} className="p-2 font-black text-center min-w-[78px]">
                          {shortLabel}
                        </th>
                      ))}
                      <th className="p-2.5 font-black text-center w-16">Rata²</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batchStudents.map((s, idx) => (
                      <ManualBatchStudentRow
                        key={s.id}
                        student={s}
                        rowIndex={idx}
                        existingSub={findExistingFast(s.id, paket, s.nisn)}
                        rowScores={batchInputs[s.id]}
                        onCellChange={handleBatchCellChange}
                        onCellKeyDown={handleBatchCellKeyDown}
                      />
                    ))}
                    {batchStudents.length === 0 && (
                      <tr>
                        <td
                          colSpan={3 + MANUAL_TKA_MAPEL_LIST.length}
                          className="p-6 text-center text-slate-400 italic"
                        >
                          Belum ada siswa Kelas 6 pada filter kelas ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
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
                <span>Simpan Nilai ({filledBatchCount} Siswa)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
