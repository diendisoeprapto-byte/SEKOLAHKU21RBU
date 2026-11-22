import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  BookOpen,
  FileQuestion,
  Lightbulb,
  Brain,
  Users,
  Send,
  Copy,
  Download,
  Star,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  Loader2,
  Database,
  ArrowRight,
  GraduationCap,
  HeartHandshake,
  MessageCircle,
} from 'lucide-react';
import {
  ActiveUser,
  CBTExam,
  CBTQuestion,
  SchoolProfile,
  Subject,
  TUJUH_KEBIASAAN_LIST,
} from '../../types';
import {
  CLASSES_LIST,
  MAX_QUESTIONS_PER_PACKAGE,
  getStoredCBTExams,
  saveStoredCBTExams,
} from '../../utils/storage';
import { saveCbtExamToFirestore } from '../../utils/cbtFirestore';
import { syncAllLocalToCloud } from '../../utils/cloudSync';
import {
  SarahKategori,
  SarahKnowledgeItem,
  SarahMediaAjarContextDoc,
  SarahStudentLogItem,
  SarahCbtGeneratedResponse,
  SarahTextGeneratedResponse,
  addSarahKnowledgeItem,
  callSarahAiEndpoint,
  deleteSarahKnowledgeItem,
  exportSarahToWordDoc,
  formatSarahDateTime,
  retrieveSarahRagContext,
  subscribeToMediaAjarForSarah,
  subscribeToSarahKnowledgeBase,
  subscribeToSarahStudentLogs,
} from '../../utils/sarahFirestore';
import { SarahMarkdown } from '../SarahMarkdown';
import type { TabId } from '../Sidebar';

interface Props {
  activeUser: ActiveUser;
  profile: SchoolProfile;
  activeClass: string;
  subjects: Subject[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onNavigateTab: (tab: TabId) => void;
}

type SarahTeacherSubTab = 'modul' | 'cbt' | 'riset' | 'memori' | 'logs';

const DEFAULT_MAPEL_LIST = [
  'Bahasa Indonesia',
  'Matematika',
  'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
  'Pendidikan Pancasila',
  'Pendidikan Agama Islam',
  'PJOK',
  'Seni Budaya',
  'Bahasa Inggris',
  'Koding dan Kecerdasan Artifisial (KKA)',
  'Muatan Lokal (PLBJ)',
];

const CBT_PAKET_OPTIONS = [
  'Sumatif 1 (AS 1)',
  'Sumatif 2 (AS 2)',
  'Sumatif 3 (AS 3)',
  'Sumatif 4 (AS 4)',
  'Sumatif 5 (AS 5)',
  'Sumatif 6 (AS 6)',
  'ASTS (Sumatif Tengah Semester)',
  'ASAS (Sumatif Akhir Semester)',
  'Remedial 1',
  'Remedial 2',
];

const KATEGORI_OPTIONS: SarahKategori[] = [
  'RPP/Modul Ajar',
  'Bank Soal',
  'Materi Ajar',
  'Kebijakan Sekolah',
];

export const SarahAssistantTab: React.FC<Props> = ({
  activeUser,
  profile,
  activeClass,
  subjects,
  showToast,
  onNavigateTab,
}) => {
  const [subTab, setSubTab] = useState<SarahTeacherSubTab>('modul');

  // Realtime Firestore states
  const [knowledgeDocs, setKnowledgeDocs] = useState<SarahKnowledgeItem[]>([]);
  const [mediaAjarDocs, setMediaAjarDocs] = useState<SarahMediaAjarContextDoc[]>([]);
  const [studentLogs, setStudentLogs] = useState<SarahStudentLogItem[]>([]);

  useEffect(() => {
    const unsubKb = subscribeToSarahKnowledgeBase(setKnowledgeDocs);
    const unsubMedia = subscribeToMediaAjarForSarah(setMediaAjarDocs);
    const unsubLogs = subscribeToSarahStudentLogs(setStudentLogs);
    return () => {
      unsubKb();
      unsubMedia();
      unsubLogs();
    };
  }, []);

  const mapelOptions = useMemo(() => {
    const names = subjects.map((s) => s.name).filter(Boolean);
    const merged = Array.from(new Set([...names, ...DEFAULT_MAPEL_LIST]));
    return merged;
  }, [subjects]);

  // Shared class default
  const defaultGradeKelas = useMemo(() => {
    if (activeUser.kelasDiampu && CLASSES_LIST.includes(activeUser.kelasDiampu)) {
      return activeUser.kelasDiampu;
    }
    return activeClass || 'Kelas 6A';
  }, [activeUser.kelasDiampu, activeClass]);

  // Processing state
  const [isGenerating, setIsGenerating] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('');

  // Mode A: Modul Ajar & RPP Berdiferensiasi
  const [modulKelas, setModulKelas] = useState(defaultGradeKelas);
  const [modulMapel, setModulMapel] = useState(mapelOptions[0] || 'Bahasa Indonesia');
  const [modulTopik, setModulTopik] = useState('');
  const [modulInklusi, setModulInklusi] = useState('');
  const [modulResult, setModulResult] = useState('');
  const [isSavingModulKb, setIsSavingModulKb] = useState(false);

  // Mode B: Generator Soal CBT Otomatis
  const [cbtKelas, setCbtKelas] = useState(defaultGradeKelas);
  const [cbtMapel, setCbtMapel] = useState(mapelOptions[0] || 'Bahasa Indonesia');
  const [cbtPaket, setCbtPaket] = useState(CBT_PAKET_OPTIONS[0]);
  const [cbtSubPaket, setCbtSubPaket] = useState('Paket 1');
  const [cbtSourceMode, setCbtSourceMode] = useState<'manual' | 'firestore'>('manual');
  const [cbtSelectedRefId, setCbtSelectedRefId] = useState('');
  const [cbtTopik, setCbtTopik] = useState('');
  const [cbtJumlahSoal, setCbtJumlahSoal] = useState(5);
  const [cbtKesulitan, setCbtKesulitan] = useState<'LOTS' | 'HOTS' | 'Campuran LOTS & HOTS'>(
    'Campuran LOTS & HOTS'
  );
  const [cbtTipeSoal, setCbtTipeSoal] = useState<'pg' | 'isian' | 'uraian'>('pg');
  const [cbtGeneratedQuestions, setCbtGeneratedQuestions] = useState<CBTQuestion[]>([]);
  const [cbtRingkasan, setCbtRingkasan] = useState('');
  const [isSendingToCbt, setIsSendingToCbt] = useState(false);
  const [isSavingCbtKb, setIsSavingCbtKb] = useState(false);

  // Mode C: Riset & Pengayaan Materi
  const [risetKelas, setRisetKelas] = useState(defaultGradeKelas);
  const [risetMapel, setRisetMapel] = useState(mapelOptions[0] || 'IPAS');
  const [risetKebiasaan, setRisetKebiasaan] = useState('Semua 7 Kebiasaan Anak Indonesia Hebat');
  const [risetTopik, setRisetTopik] = useState('');
  const [risetResult, setRisetResult] = useState('');
  const [isSavingRisetKb, setIsSavingRisetKb] = useState(false);

  // Mode D: Memori & Ajarkan SARAH
  const [kbSearch, setKbSearch] = useState('');
  const [kbFilterKat, setKbFilterKat] = useState<string>('Semua');
  const [teachJudul, setTeachJudul] = useState('');
  const [teachKategori, setTeachKategori] = useState<SarahKategori>('Materi Ajar');
  const [teachKelas, setTeachKelas] = useState('Semua');
  const [teachMapel, setTeachMapel] = useState(mapelOptions[0] || 'Bahasa Indonesia');
  const [teachSumber, setTeachSumber] = useState('Kurasi Guru SDN Rawa Badak Utara 21');
  const [teachKonten, setTeachKonten] = useState('');
  const [isSavingManualKb, setIsSavingManualKb] = useState(false);

  // Mode E: Log Pemantauan Siswa
  const [logSearch, setLogSearch] = useState('');
  const [logKelasFilter, setLogKelasFilter] = useState('Semua');

  // Combined reference options for CBT Generator from Firestore (media_ajar + sarah_knowledge_base)
  const firestoreMaterialRefs = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      mapel: string;
      kelas: string;
      summary: string;
    }> = [];
    knowledgeDocs.forEach((kb) => {
      items.push({
        id: `kb:${kb.id}`,
        label: `[Memori SARAH] ${kb.judul} (${kb.kelas} • ${kb.mata_pelajaran})`,
        mapel: kb.mata_pelajaran,
        kelas: kb.kelas,
        summary: `${kb.judul}\n${kb.konten_ringkasan.slice(0, 1500)}`,
      });
    });
    mediaAjarDocs.forEach((m) => {
      items.push({
        id: `media:${m.id}`,
        label: `[Media Ajar PPT] ${m.judul} (Kelas ${m.kelas} • ${m.mapel} • ${m.bab || ''} ${m.pertemuan || ''})`,
        mapel: m.mapel,
        kelas: `Kelas ${m.kelas}`,
        summary: `Materi Media Ajar: ${m.judul}, Mata Pelajaran ${m.mapel}, Kelas ${m.kelas}, ${m.bab || ''} ${m.pertemuan || ''} oleh ${m.guru_nama || 'Guru'}`,
      });
    });
    return items;
  }, [knowledgeDocs, mediaAjarDocs]);

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Teks hasil SARAH berhasil disalin ke clipboard!', 'success');
    } catch {
      showToast('Gagal menyalin teks. Silakan blok manual teks yang diinginkan.', 'error');
    }
  };

  const handleGenerateModul = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modulTopik.trim()) {
      showToast('Harap isi Topik / Tujuan Pembelajaran (TP) terlebih dahulu.', 'error');
      return;
    }
    setIsGenerating(true);
    setProcessingLabel('SARAH sedang membaca basis data sekolah...');
    try {
      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: modulKelas,
        mapel: modulMapel,
        queryText: `${modulTopik} ${modulInklusi}`,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
      });

      setTimeout(() => {
        setProcessingLabel('SARAH sedang menyusun Modul Ajar Berdiferensiasi...');
      }, 600);

      const res = await callSarahAiEndpoint<SarahTextGeneratedResponse>({
        mode: 'modul_ajar',
        role: activeUser.role,
        user: { name: activeUser.name, kelas: activeClass },
        params: {
          kelas: modulKelas,
          mapel: modulMapel,
          topik: modulTopik,
          inklusiCatatan: modulInklusi,
        },
        ragContext,
      });

      setModulResult(res.text);
      showToast('Modul Ajar & RPP Berdiferensiasi berhasil disusun oleh SARAH!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal menghubungi asisten SARAH.', 'error');
    } finally {
      setIsGenerating(false);
      setProcessingLabel('');
    }
  };

  const handleSaveModulToMemory = async () => {
    if (!modulResult.trim()) return;
    setIsSavingModulKb(true);
    try {
      await addSarahKnowledgeItem({
        judul: `Modul Ajar: ${modulTopik.trim() || modulMapel}`,
        kategori: 'RPP/Modul Ajar',
        kelas: modulKelas,
        mata_pelajaran: modulMapel,
        konten_ringkasan: modulResult,
        sumber: `Generasi SARAH (${activeUser.name})`,
        disetujui_oleh: activeUser.name,
      });
      showToast('Modul Ajar berhasil disimpan ke Memori Pengetahuan SARAH!', 'success');
    } catch (err: any) {
      showToast(`Gagal menyimpan ke memori SARAH: ${err?.message || 'error'}`, 'error');
    } finally {
      setIsSavingModulKb(false);
    }
  };

  const handleGenerateCbt = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedRef = firestoreMaterialRefs.find((r) => r.id === cbtSelectedRefId);
    if (cbtSourceMode === 'manual' && !cbtTopik.trim()) {
      showToast('Harap masukkan Topik / Materi untuk membuat soal CBT.', 'error');
      return;
    }
    if (cbtSourceMode === 'firestore' && !selectedRef) {
      showToast('Pilih materi dari Memori SARAH / Bank Media Ajar terlebih dahulu.', 'error');
      return;
    }

    setIsGenerating(true);
    setProcessingLabel('SARAH sedang membaca basis data sekolah...');
    try {
      const effectiveTopik =
        cbtSourceMode === 'firestore' && selectedRef
          ? `${selectedRef.label}${cbtTopik.trim() ? ` — Fokus: ${cbtTopik.trim()}` : ''}`
          : cbtTopik.trim();

      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: cbtKelas,
        mapel: cbtMapel,
        queryText: effectiveTopik,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
      });

      setTimeout(() => {
        setProcessingLabel(`SARAH sedang meracik ${cbtJumlahSoal} soal ${cbtKesulitan}...`);
      }, 600);

      const res = await callSarahAiEndpoint<SarahCbtGeneratedResponse>({
        mode: 'cbt_generator',
        role: activeUser.role,
        user: { name: activeUser.name, kelas: activeClass },
        params: {
          kelas: cbtKelas,
          mapel: cbtMapel,
          topik: effectiveTopik,
          sumberMateri: selectedRef ? selectedRef.summary : '',
          jumlahSoal: cbtJumlahSoal,
          kesulitan: cbtKesulitan,
          tipeSoal: cbtTipeSoal,
        },
        ragContext,
      });

      setCbtGeneratedQuestions(Array.isArray(res.questions) ? res.questions : []);
      setCbtRingkasan(res.ringkasan || '');
      showToast(
        `${res.questions?.length || 0} butir soal CBT berhasil dibuat dalam format terstruktur!`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Gagal menghasilkan soal CBT.', 'error');
    } finally {
      setIsGenerating(false);
      setProcessingLabel('');
    }
  };

  const handleSendQuestionsToCbtBank = async () => {
    if (cbtGeneratedQuestions.length === 0) return;
    setIsSendingToCbt(true);
    try {
      const existingExams = getStoredCBTExams();
      const targetIdx = existingExams.findIndex(
        (ex) =>
          (ex.paketName || '').toLowerCase() === cbtPaket.toLowerCase() &&
          ex.mapel.toLowerCase() === cbtMapel.toLowerCase() &&
          (ex.subPaket || 'Paket 1').toLowerCase() === cbtSubPaket.toLowerCase() &&
          (ex.kelas || '').toLowerCase() === cbtKelas.toLowerCase()
      );

      let updatedExam: CBTExam;
      let nextExamsList: CBTExam[];
      const preparedQuestions: CBTQuestion[] = cbtGeneratedQuestions.map((q) => ({
        ...q,
        paket: cbtPaket,
        subPaket: cbtSubPaket,
        mapel: cbtMapel,
        kelas: cbtKelas,
      }));

      if (targetIdx >= 0) {
        const current = existingExams[targetIdx];
        const availableSlots = Math.max(0, MAX_QUESTIONS_PER_PACKAGE - (current.soalList?.length || 0));
        if (availableSlots <= 0) {
          showToast(
            `Paket ${cbtPaket} - ${cbtMapel} (${cbtSubPaket}) untuk ${cbtKelas} sudah penuh (${MAX_QUESTIONS_PER_PACKAGE} soal). Pilih Sub Paket lain.`,
            'error'
          );
          setIsSendingToCbt(false);
          return;
        }
        const toAppend = preparedQuestions.slice(0, availableSlots);
        updatedExam = {
          ...current,
          soalList: [...(current.soalList || []), ...toAppend],
        };
        nextExamsList = existingExams.map((ex, i) => (i === targetIdx ? updatedExam : ex));
      } else {
        updatedExam = {
          id: `cbt_sarah_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          judul: `${cbtPaket} - ${cbtMapel} (${cbtSubPaket})`,
          mapel: cbtMapel,
          kelas: cbtKelas,
          paketName: cbtPaket,
          subPaket: cbtSubPaket,
          durasiMenit: 60,
          aktif: false,
          soalList: preparedQuestions.slice(0, MAX_QUESTIONS_PER_PACKAGE),
        };
        nextExamsList = [...existingExams, updatedExam];
      }

      saveStoredCBTExams(nextExamsList);
      const firestoreOk = await saveCbtExamToFirestore(updatedExam);
      syncAllLocalToCloud(activeUser.name || 'guru').catch(() => {});

      showToast(
        firestoreOk
          ? `${preparedQuestions.length} soal berhasil dikirim ke Bank Soal CBT (${cbtPaket} • ${cbtMapel} • ${cbtSubPaket}) & disinkronkan ke Firestore!`
          : `${preparedQuestions.length} soal berhasil ditambahkan ke Bank Soal CBT lokal!`,
        'success'
      );
    } catch (err: any) {
      showToast(`Gagal mengirim ke Bank Soal CBT: ${err?.message || 'error'}`, 'error');
    } finally {
      setIsSendingToCbt(false);
    }
  };

  const handleSaveCbtToMemory = async () => {
    if (cbtGeneratedQuestions.length === 0) return;
    setIsSavingCbtKb(true);
    try {
      const summaryText = cbtGeneratedQuestions
        .map(
          (q, idx) =>
            `${idx + 1}. [${q.tipe.toUpperCase()}] ${q.pertanyaan}\nKunci: ${
              Array.isArray(q.kunciJawaban) ? q.kunciJawaban.join(', ') : q.kunciJawaban
            }${q.pembahasan ? `\nPembahasan: ${q.pembahasan}` : ''}`
        )
        .join('\n\n');

      await addSarahKnowledgeItem({
        judul: `Bank Soal ${cbtMapel} (${cbtPaket}) - ${cbtTopik || cbtRingkasan || 'Paket AI'}`,
        kategori: 'Bank Soal',
        kelas: cbtKelas,
        mata_pelajaran: cbtMapel,
        konten_ringkasan: summaryText,
        sumber: `Generator Soal SARAH (${cbtKesulitan})`,
        disetujui_oleh: activeUser.name,
      });
      showToast('Kumpulan soal berhasil disimpan ke Memori SARAH!', 'success');
    } catch (err: any) {
      showToast(`Gagal menyimpan ke memori SARAH: ${err?.message || 'error'}`, 'error');
    } finally {
      setIsSavingCbtKb(false);
    }
  };

  const handleGenerateRiset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!risetTopik.trim()) {
      showToast('Harap isi topik riset atau pertanyaan pengayaan materi.', 'error');
      return;
    }
    setIsGenerating(true);
    setProcessingLabel('SARAH sedang membaca basis data sekolah...');
    try {
      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: risetKelas,
        mapel: risetMapel,
        queryText: `${risetTopik} ${risetKebiasaan}`,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
      });

      setTimeout(() => {
        setProcessingLabel('SARAH sedang merangkum materi & ide aktivitas 7 Kebiasaan...');
      }, 600);

      const res = await callSarahAiEndpoint<SarahTextGeneratedResponse>({
        mode: 'riset_materi',
        role: activeUser.role,
        user: { name: activeUser.name, kelas: activeClass },
        params: {
          kelas: risetKelas,
          mapel: risetMapel,
          topik: risetTopik,
          fokusKebiasaan: risetKebiasaan,
        },
        ragContext,
      });

      setRisetResult(res.text);
      showToast('Riset & ide aktivitas pembelajaran berhasil disusun SARAH!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal menghubungi asisten SARAH.', 'error');
    } finally {
      setIsGenerating(false);
      setProcessingLabel('');
    }
  };

  const handleSaveRisetToMemory = async () => {
    if (!risetResult.trim()) return;
    setIsSavingRisetKb(true);
    try {
      await addSarahKnowledgeItem({
        judul: `Pengayaan Materi: ${risetTopik.trim() || risetMapel}`,
        kategori: 'Materi Ajar',
        kelas: risetKelas,
        mata_pelajaran: risetMapel,
        konten_ringkasan: risetResult,
        sumber: `Riset SARAH (${activeUser.name})`,
        disetujui_oleh: activeUser.name,
      });
      showToast('Ringkasan riset materi berhasil disimpan ke Memori SARAH!', 'success');
    } catch (err: any) {
      showToast(`Gagal menyimpan ke memori SARAH: ${err?.message || 'error'}`, 'error');
    } finally {
      setIsSavingRisetKb(false);
    }
  };

  const handleSubmitManualTeach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teachJudul.trim() || !teachKonten.trim()) {
      showToast('Judul dan isi ringkasan pengetahuan wajib diisi.', 'error');
      return;
    }
    setIsSavingManualKb(true);
    try {
      await addSarahKnowledgeItem({
        judul: teachJudul,
        kategori: teachKategori,
        kelas: teachKelas,
        mata_pelajaran: teachMapel,
        konten_ringkasan: teachKonten,
        sumber: teachSumber || 'Input Manual Guru',
        disetujui_oleh: activeUser.name,
      });
      setTeachJudul('');
      setTeachKonten('');
      showToast('Pengetahuan baru berhasil diajarkan ke Memori SARAH!', 'success');
    } catch (err: any) {
      showToast(`Gagal menyimpan pengetahuan: ${err?.message || 'error'}`, 'error');
    } finally {
      setIsSavingManualKb(false);
    }
  };

  const filteredKnowledge = useMemo(() => {
    return knowledgeDocs.filter((docItem) => {
      if (kbFilterKat !== 'Semua' && docItem.kategori !== kbFilterKat) return false;
      if (kbSearch.trim()) {
        const q = kbSearch.toLowerCase();
        return (
          docItem.judul.toLowerCase().includes(q) ||
          docItem.mata_pelajaran.toLowerCase().includes(q) ||
          docItem.konten_ringkasan.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [knowledgeDocs, kbFilterKat, kbSearch]);

  const filteredStudentLogs = useMemo(() => {
    return studentLogs.filter((l) => {
      if (logKelasFilter !== 'Semua' && l.kelas !== logKelasFilter) return false;
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase();
        return (
          l.studentName.toLowerCase().includes(q) ||
          l.topik.toLowerCase().includes(q) ||
          l.pertanyaan.toLowerCase().includes(q) ||
          (l.mata_pelajaran || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [studentLogs, logKelasFilter, logSearch]);

  const topTopicsSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredStudentLogs.forEach((l) => {
      const key = `${l.mata_pelajaran || 'Umum'} — ${l.topik}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [filteredStudentLogs]);

  return (
    <section className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-rose-600 via-rose-700 to-indigo-700 p-6 sm:p-8 text-white shadow-lg">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-[11px] font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Asisten AI Terintegrasi SERBU 21</span>
            </div>
            <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight">
              SARAH — Sistem Asisten Adaptif, Ramah, Amanah &amp; Humanis
            </h1>
            <p className="text-xs sm:text-sm text-rose-100 leading-relaxed">
              Mendukung guru menyusun Modul Ajar Berdiferensiasi, membuat soal CBT terstruktur langsung ke Bank Soal, riset pengayaan materi 7 Kebiasaan Anak Indonesia Hebat, serta memantau pertanyaan belajar siswa.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 shrink-0">
            <div className="bg-white/15 backdrop-blur-xs border border-white/20 rounded-2xl p-3 text-center">
              <span className="text-[10px] uppercase font-extrabold text-rose-100 block">Memori KB</span>
              <span className="text-xl font-display font-black">{knowledgeDocs.length}</span>
            </div>
            <div className="bg-white/15 backdrop-blur-xs border border-white/20 rounded-2xl p-3 text-center">
              <span className="text-[10px] uppercase font-extrabold text-rose-100 block">Media Ajar</span>
              <span className="text-xl font-display font-black">{mediaAjarDocs.length}</span>
            </div>
            <div className="bg-white/15 backdrop-blur-xs border border-white/20 rounded-2xl p-3 text-center">
              <span className="text-[10px] uppercase font-extrabold text-rose-100 block">Tanya Siswa</span>
              <span className="text-xl font-display font-black">{studentLogs.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="bg-white p-2 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap gap-2">
        {[
          { id: 'modul', label: 'Modul Ajar & RPP', icon: BookOpen },
          { id: 'cbt', label: 'Generator Soal CBT', icon: FileQuestion },
          { id: 'riset', label: 'Riset & Pengayaan', icon: Lightbulb },
          { id: 'memori', label: `Memori & Ajarkan (${knowledgeDocs.length})`, icon: Brain },
          { id: 'logs', label: `Pantau Tanya Siswa (${studentLogs.length})`, icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as SarahTeacherSubTab)}
              className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs flex items-center gap-2 transition cursor-pointer ${
                active
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-rose-50 hover:text-rose-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Processing Banner */}
      {isGenerating && (
        <div className="p-4 rounded-2xl bg-indigo-50 border-2 border-indigo-200 flex items-center gap-3 animate-pulse">
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
          <div>
            <p className="font-display font-black text-xs sm:text-sm text-indigo-950">
              {processingLabel || 'SARAH sedang membaca basis data sekolah...'}
            </p>
            <p className="text-[11px] text-indigo-700">
              Menyuntikkan konteks Kurikulum Merdeka, Memori SARAH, dan Bank Media Ajar sekolah secara otomatis.
            </p>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: GENERATOR MODUL AJAR & RPP BERDIFERENSIASI                     */}
      {/* ===================================================================== */}
      {subTab === 'modul' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleGenerateModul}
            className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 h-fit"
          >
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-black text-sm text-slate-900">
                  Generator Modul Ajar &amp; RPP Berdiferensiasi
                </h2>
                <p className="text-[11px] text-slate-500">
                  Pendekatan Pembelajaran Mendalam siap cetak &amp; inklusif
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Jenjang / Kelas
                </label>
                <select
                  value={modulKelas}
                  onChange={(e) => setModulKelas(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:border-rose-600"
                >
                  {CLASSES_LIST.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Mata Pelajaran
                </label>
                <select
                  value={modulMapel}
                  onChange={(e) => setModulMapel(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:border-rose-600"
                >
                  {mapelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Topik / Tujuan Pembelajaran (TP) <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                value={modulTopik}
                onChange={(e) => setModulTopik(e.target.value)}
                placeholder="Contoh: Sistem pernapasan manusia dan cara menjaga kesehatan organ pernapasan..."
                className="w-full p-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 outline-none focus:border-rose-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Catatan Kebutuhan Inklusi / Diferensiasi Siswa
              </label>
              <textarea
                rows={3}
                value={modulInklusi}
                onChange={(e) => setModulInklusi(e.target.value)}
                placeholder="Contoh: Terdapat 1 siswa slow learner dan 2 siswa kinestetik; sertakan lembar kerja visual sederhana..."
                className="w-full p-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 outline-none focus:border-rose-600"
              />
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer disabled:opacity-60"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Susun Modul Ajar dengan SARAH</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display font-black text-sm text-slate-900">
                  Hasil Modul Ajar &amp; RPP
                </h3>
                <p className="text-[11px] text-slate-500">
                  Siap disalin, diekspor ke dokumen Word, atau disimpan ke Memori SARAH
                </p>
              </div>
              {modulResult && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyText(modulResult)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> Salin Teks
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportSarahToWordDoc({
                        title: `Modul Ajar ${modulMapel} - ${modulKelas}`,
                        subtitle: `Topik: ${modulTopik}`,
                        markdownContent: modulResult,
                        schoolName: profile.name,
                        author: activeUser.name,
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1.5 border border-indigo-200 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Ekspor ke Dokumen
                  </button>
                  <button
                    type="button"
                    disabled={isSavingModulKb}
                    onClick={handleSaveModulToMemory}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-extrabold text-xs flex items-center gap-1.5 border border-amber-300 cursor-pointer disabled:opacity-50"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-600" />
                    <span>{isSavingModulKb ? 'Menyimpan...' : 'Simpan ke Memori SARAH'}</span>
                  </button>
                </div>
              )}
            </div>

            {modulResult ? (
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 border border-slate-200 max-h-[650px] overflow-y-auto">
                <SarahMarkdown content={modulResult} />
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 text-slate-400">
                <GraduationCap className="w-10 h-10 mx-auto text-rose-200" />
                <p className="text-xs font-bold text-slate-500">
                  Isi formulir di sebelah kiri untuk membuat Modul Ajar Kurikulum Merdeka.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: GENERATOR SOAL CBT OTOMATIS                                    */}
      {/* ===================================================================== */}
      {subTab === 'cbt' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleGenerateCbt}
            className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 h-fit"
          >
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <FileQuestion className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-black text-sm text-slate-900">
                  Generator Soal CBT Otomatis
                </h2>
                <p className="text-[11px] text-slate-500">
                  Format JSON terstruktur, siap kirim ke Bank Soal CBT
                </p>
              </div>
            </div>

            <div className="flex gap-2 p-1 rounded-2xl bg-slate-100">
              <button
                type="button"
                onClick={() => setCbtSourceMode('manual')}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  cbtSourceMode === 'manual' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Input Topik Manual
              </button>
              <button
                type="button"
                onClick={() => setCbtSourceMode('firestore')}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  cbtSourceMode === 'firestore' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Dari Materi Firestore ({firestoreMaterialRefs.length})
              </button>
            </div>

            {cbtSourceMode === 'firestore' && (
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Pilih Referensi Materi Sekolah (Memori / Media Ajar)
                </label>
                <select
                  value={cbtSelectedRefId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCbtSelectedRefId(id);
                    const found = firestoreMaterialRefs.find((r) => r.id === id);
                    if (found) {
                      if (mapelOptions.includes(found.mapel)) setCbtMapel(found.mapel);
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:border-rose-600"
                >
                  <option value="">-- Pilih Dokumen Materi Firestore --</option>
                  {firestoreMaterialRefs.map((ref) => (
                    <option key={ref.id} value={ref.id}>
                      {ref.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Kelas Tujuan CBT
                </label>
                <select
                  value={cbtKelas}
                  onChange={(e) => setCbtKelas(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  {CLASSES_LIST.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Mata Pelajaran
                </label>
                <select
                  value={cbtMapel}
                  onChange={(e) => setCbtMapel(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  {mapelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Paket CBT Target
                </label>
                <select
                  value={cbtPaket}
                  onChange={(e) => setCbtPaket(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  {CBT_PAKET_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Sub Paket
                </label>
                <select
                  value={cbtSubPaket}
                  onChange={(e) => setCbtSubPaket(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  {['Paket 1', 'Paket 2', 'Paket 3'].map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                {cbtSourceMode === 'manual' ? 'Topik / Kompetensi Soal *' : 'Catatan Fokus Tambahan (Opsional)'}
              </label>
              <textarea
                rows={2}
                value={cbtTopik}
                onChange={(e) => setCbtTopik(e.target.value)}
                placeholder="Contoh: Operasi hitung pecahan campuran dalam soal cerita sehari-hari..."
                className="w-full p-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 outline-none focus:border-rose-600"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Jumlah
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={cbtJumlahSoal}
                  onChange={(e) => setCbtJumlahSoal(Math.max(1, Math.min(20, Number(e.target.value) || 5)))}
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Kesulitan
                </label>
                <select
                  value={cbtKesulitan}
                  onChange={(e) => setCbtKesulitan(e.target.value as any)}
                  className="w-full px-2.5 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  <option value="LOTS">LOTS</option>
                  <option value="HOTS">HOTS</option>
                  <option value="Campuran LOTS & HOTS">Campuran</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Tipe Soal
                </label>
                <select
                  value={cbtTipeSoal}
                  onChange={(e) => setCbtTipeSoal(e.target.value as any)}
                  className="w-full px-2.5 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  <option value="pg">Pilihan Ganda</option>
                  <option value="isian">Isian Singkat</option>
                  <option value="uraian">Uraian</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-700 hover:to-rose-700 text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer disabled:opacity-60"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Generate Soal CBT Terstruktur</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display font-black text-sm text-slate-900">
                  Pratinjau Butir Soal Hasil SARAH ({cbtGeneratedQuestions.length} Soal)
                </h3>
                <p className="text-[11px] text-slate-500">
                  {cbtRingkasan || 'Soal siap dikirim langsung ke Bank Soal CBT sekolah'}
                </p>
              </div>

              {cbtGeneratedQuestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isSavingCbtKb}
                    onClick={handleSaveCbtToMemory}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-extrabold text-xs flex items-center gap-1.5 border border-amber-300 cursor-pointer disabled:opacity-50"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-600" />
                    <span>Simpan ke Memori SARAH</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSendingToCbt}
                    onClick={handleSendQuestionsToCbtBank}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSendingToCbt ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Database className="w-3.5 h-3.5" />
                    )}
                    <span>Kirim Langsung ke Bank Soal CBT</span>
                  </button>
                </div>
              )}
            </div>

            {cbtGeneratedQuestions.length > 0 ? (
              <div className="space-y-3 max-h-[650px] overflow-y-auto pr-1">
                {cbtGeneratedQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-slate-900 text-white font-mono font-black text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                          {q.tipe.toUpperCase()} • Bobot {q.bobot}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCbtGeneratedQuestions((prev) => prev.filter((item) => item.id !== q.id))
                        }
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Hapus butir soal ini"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed">
                      {q.pertanyaan}
                    </p>

                    {q.opsi && q.opsi.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {q.opsi.map((opt, oIdx) => {
                          const isKey = opt === q.kunciJawaban;
                          return (
                            <div
                              key={oIdx}
                              className={`px-3 py-1.5 rounded-xl border text-xs ${
                                isKey
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              {opt}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                      <div>
                        <strong>Kunci Jawaban:</strong>{' '}
                        {Array.isArray(q.kunciJawaban) ? q.kunciJawaban.join(', ') : q.kunciJawaban}
                      </div>
                      {q.pembahasan && (
                        <div className="text-slate-700">
                          <strong>Pembahasan:</strong> {q.pembahasan}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onNavigateTab('ujian')}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Buka Menu Bank Soal &amp; Sesi CBT</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 text-slate-400">
                <FileQuestion className="w-10 h-10 mx-auto text-indigo-200" />
                <p className="text-xs font-bold text-slate-500">
                  Pilih topik atau materi Firestore di kiri lalu klik Generate Soal CBT.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: RISET & PENGAYAAN MATERI (7 KEBIASAAN ANAK INDONESIA HEBAT)    */}
      {/* ===================================================================== */}
      {subTab === 'riset' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleGenerateRiset}
            className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 h-fit"
          >
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-black text-sm text-slate-900">
                  Riset &amp; Pengayaan Materi
                </h2>
                <p className="text-[11px] text-slate-500">
                  Selaras nilai 7 Kebiasaan Anak Indonesia Hebat
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Kelas
                </label>
                <select
                  value={risetKelas}
                  onChange={(e) => setRisetKelas(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  {CLASSES_LIST.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Mata Pelajaran
                </label>
                <select
                  value={risetMapel}
                  onChange={(e) => setRisetMapel(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  {mapelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Fokus 7 Kebiasaan Anak Indonesia Hebat
              </label>
              <select
                value={risetKebiasaan}
                onChange={(e) => setRisetKebiasaan(e.target.value)}
                className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
              >
                <option value="Semua 7 Kebiasaan Anak Indonesia Hebat">
                  Terintegrasi Semua 7 Kebiasaan Anak Indonesia Hebat
                </option>
                {TUJUH_KEBIASAAN_LIST.map((k) => (
                  <option key={k.id} value={k.label}>
                    {k.icon} {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Topik Materi / Ide Aktivitas yang Dicari <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={4}
                value={risetTopik}
                onChange={(e) => setRisetTopik(e.target.value)}
                placeholder="Contoh: Ide aktivitas proyek kelas mengenai siklus air & hemat air yang dikaitkan dengan kebiasaan Makan Sehat / Minum Air Putih & Bermasyarakat..."
                className="w-full p-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 outline-none focus:border-amber-600"
              />
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer disabled:opacity-60"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
              <span>Riset Materi &amp; Ide Aktivitas</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display font-black text-sm text-slate-900">
                  Hasil Riset &amp; Pengayaan Pembelajaran
                </h3>
                <p className="text-[11px] text-slate-500">
                  Simpan ringkasan terbaik ke Memori SARAH agar selalu diingat untuk kelas ini
                </p>
              </div>
              {risetResult && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyText(risetResult)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> Salin Teks
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportSarahToWordDoc({
                        title: `Pengayaan Materi ${risetMapel} - ${risetKelas}`,
                        subtitle: risetKebiasaan,
                        markdownContent: risetResult,
                        schoolName: profile.name,
                        author: activeUser.name,
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1.5 border border-indigo-200 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Ekspor ke Dokumen
                  </button>
                  <button
                    type="button"
                    disabled={isSavingRisetKb}
                    onClick={handleSaveRisetToMemory}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-extrabold text-xs flex items-center gap-1.5 border border-amber-300 cursor-pointer disabled:opacity-50"
                  >
                    <Brain className="w-3.5 h-3.5 text-amber-600" />
                    <span>{isSavingRisetKb ? 'Menyimpan...' : 'Simpan ke Memori SARAH'}</span>
                  </button>
                </div>
              )}
            </div>

            {risetResult ? (
              <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/30 border border-amber-200/80 max-h-[650px] overflow-y-auto">
                <SarahMarkdown content={risetResult} />
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 text-slate-400">
                <Lightbulb className="w-10 h-10 mx-auto text-amber-200" />
                <p className="text-xs font-bold text-slate-500">
                  Minta SARAH merangkum konsep pembelajaran atau ide aktivitas 7 Kebiasaan di sini.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: MEMORI PENGETAHUAN & AJARKAN SARAH (FIRESTORE KB)              */}
      {/* ===================================================================== */}
      {subTab === 'memori' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSubmitManualTeach}
            className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 h-fit"
          >
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-black text-sm text-slate-900">
                  Ajarkan SARAH (Input Pengetahuan Sekolah)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Referensi ini otomatis dibaca SARAH saat melayani Guru &amp; Siswa
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Judul Dokumen / Pengetahuan *
              </label>
              <input
                type="text"
                value={teachJudul}
                onChange={(e) => setTeachJudul(e.target.value)}
                placeholder="Contoh: Tata Tertib Upacara & Pembiasaan Pagi SDN RBU 21"
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:border-emerald-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Kategori
                </label>
                <select
                  value={teachKategori}
                  onChange={(e) => setTeachKategori(e.target.value as SarahKategori)}
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  {KATEGORI_OPTIONS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Kelas
                </label>
                <select
                  value={teachKelas}
                  onChange={(e) => setTeachKelas(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  <option value="Semua">Semua Kelas (1–6)</option>
                  {CLASSES_LIST.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Mata Pelajaran
                </label>
                <select
                  value={teachMapel}
                  onChange={(e) => setTeachMapel(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  <option value="Umum">Umum / Lintas Mapel</option>
                  {mapelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Sumber Referensi
                </label>
                <input
                  type="text"
                  value={teachSumber}
                  onChange={(e) => setTeachSumber(e.target.value)}
                  placeholder="KOSP / Buku Paket / Guru"
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Konten / Ringkasan Pengetahuan *
              </label>
              <textarea
                rows={5}
                value={teachKonten}
                onChange={(e) => setTeachKonten(e.target.value)}
                placeholder="Tuliskan ringkasan materi ajar, kebijakan sekolah, pedoman modul, atau poin penting yang harus diketahui SARAH..."
                className="w-full p-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 outline-none focus:border-emerald-600"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingManualKb}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer disabled:opacity-50"
            >
              {isSavingManualKb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Ajarkan &amp; Simpan ke Memori SARAH</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display font-black text-sm text-slate-900">
                  Basis Memori SARAH ({filteredKnowledge.length} Dokumen)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Koleksi Firestore: sarah_knowledge_base (disinkronkan real-time)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={kbSearch}
                    onChange={(e) => setKbSearch(e.target.value)}
                    placeholder="Cari memori..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-rose-500"
                  />
                </div>
                <select
                  value={kbFilterKat}
                  onChange={(e) => setKbFilterKat(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50"
                >
                  <option value="Semua">Semua Kategori</option>
                  {KATEGORI_OPTIONS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredKnowledge.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {filteredKnowledge.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-white transition space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                            {item.kategori}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                            {item.kelas} • {item.mata_pelajaran}
                          </span>
                        </div>
                        <h4 className="font-display font-black text-xs sm:text-sm text-slate-900">
                          {item.judul}
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteSarahKnowledgeItem(item.id);
                            showToast('Dokumen dihapus dari memori SARAH.', 'success');
                          } catch {
                            showToast('Gagal menghapus dokumen.', 'error');
                          }
                        }}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                        title="Hapus dari memori"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-3 whitespace-pre-line">
                      {item.konten_ringkasan}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 pt-1 border-t border-slate-200/70">
                      <span>
                        Disetujui: <strong className="text-slate-600">{item.disetujui_oleh}</strong> • Sumber:{' '}
                        {item.sumber}
                      </span>
                      <span>{formatSarahDateTime(item.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 text-slate-400">
                <Brain className="w-10 h-10 mx-auto text-emerald-200" />
                <p className="text-xs font-bold text-slate-500">
                  Belum ada memori pengetahuan tersimpan. Mulai ajarkan SARAH atau simpan hasil generasi AI!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: LOG PEMANTAUAN PERTANYAAN SISWA                                */}
      {/* ===================================================================== */}
      {subTab === 'logs' && (
        <div className="space-y-6">
          {/* Top Topics Summary */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-rose-600" />
              <div>
                <h3 className="font-display font-black text-sm text-slate-900">
                  Topik Paling Banyak Ditanyakan Siswa ke SARAH
                </h3>
                <p className="text-[11px] text-slate-500">
                  Membantu guru mengidentifikasi materi yang masih sulit dipahami siswa di kelas
                </p>
              </div>
            </div>

            {topTopicsSummary.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {topTopicsSummary.map(([topicLabel, count], idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200 flex items-center justify-between gap-3"
                  >
                    <span className="text-xs font-bold text-slate-800 line-clamp-2">{topicLabel}</span>
                    <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white font-display font-black text-xs shrink-0">
                      {count}x
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Belum ada catatan pertanyaan siswa.</p>
            )}
          </div>

          {/* Student Logs Table */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display font-black text-sm text-slate-900">
                  Riwayat Pertanyaan Belajar Siswa ({filteredStudentLogs.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Seluruh percakapan siswa menggunakan mode Sokratik Anti-Menyontek
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Cari nama siswa / topik..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-rose-500"
                  />
                </div>
                <select
                  value={logKelasFilter}
                  onChange={(e) => setLogKelasFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50"
                >
                  <option value="Semua">Semua Kelas</option>
                  {CLASSES_LIST.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredStudentLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-display font-black uppercase text-[11px]">
                    <tr>
                      <th className="px-3 py-2.5 rounded-tl-xl">Waktu</th>
                      <th className="px-3 py-2.5">Siswa</th>
                      <th className="px-3 py-2.5">Kelas</th>
                      <th className="px-3 py-2.5">Mapel &amp; Topik</th>
                      <th className="px-3 py-2.5 rounded-tr-xl">Pertanyaan Siswa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudentLogs.slice(0, 100).map((log) => (
                      <tr key={log.id} className="hover:bg-rose-50/30">
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                          {formatSarahDateTime(log.created_at)}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-900">
                          {log.studentName}
                          {log.nisn && <span className="block text-[10px] text-slate-400">NISN: {log.nisn}</span>}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{log.kelas}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 mb-0.5">
                            {log.mata_pelajaran || 'Umum'}
                          </span>
                          <span className="block font-semibold text-slate-700">{log.topik}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 max-w-md">{log.pertanyaan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-14 text-center space-y-2 text-slate-400">
                <CheckCircle2 className="w-10 h-10 mx-auto text-slate-200" />
                <p className="text-xs font-bold text-slate-500">
                  Belum ada log pertanyaan siswa yang tercatat.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
