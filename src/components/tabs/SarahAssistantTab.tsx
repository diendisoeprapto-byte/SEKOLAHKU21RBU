import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  MessageSquareHeart,
  Heart,
  Printer,
  ClipboardList,
  RotateCcw,
  X,
  Image as ImageIcon,
  Palette,
  RefreshCw,
  History,
  Clock,
  ChevronDown,
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
  DEFAULT_SARAH_CONFIG,
  SARAH_ATTRIBUTION_TEXT,
  SARAH_MAX_CHAT_SESSIONS,
  SarahChatSessionItem,
  SarahConfigDoc,
  SarahIllustrationAsset,
  SarahImageGeneratedResponse,
  SarahKategori,
  SarahKnowledgeItem,
  SarahMediaAjarContextDoc,
  SarahStudentLogItem,
  SarahCbtGeneratedResponse,
  SarahTextGeneratedResponse,
  addSarahKnowledgeItem,
  appendSarahChatMessage,
  buildSarahChatUserId,
  callSarahAiEndpoint,
  createSarahChatSession,
  deleteSarahChatSession,
  deleteSarahKnowledgeItem,
  exportSarahToWordDoc,
  formatSarahDateTime,
  loadSarahSessionMessages,
  loadUserSarahChatSessions,
  rasterizeSvgToPngDataUrl,
  retrieveSarahRagContext,
  subscribeToMediaAjarForSarah,
  subscribeToSarahConfig,
  subscribeToSarahKnowledgeBase,
  subscribeToSarahStudentLogs,
  svgToDataUrl,
  syncSarahConfigToFirestore,
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

type SarahTeacherSubTab = 'chat' | 'lkpd' | 'modul' | 'gambar' | 'cbt' | 'riset' | 'memori' | 'logs';
type SarahVisualStyleId = '3d_clay' | '3d_isometrik' | '2d_ceria' | 'diagram_edukatif';
type SarahDocVisualChoice = SarahVisualStyleId | 'none';

const IMAGE_STYLE_OPTIONS: Array<{
  id: SarahVisualStyleId;
  label: string;
  badge: string;
  desc: string;
}> = [
  {
    id: '3d_clay',
    label: '3D Clay & Glossy Menarik',
    badge: '3D',
    desc: 'Tampak timbul, pencahayaan lembut & warna cerah modern',
  },
  {
    id: '2d_ceria',
    label: '2D Ilustrasi Buku Anak',
    badge: '2D',
    desc: 'Gaya cerita anak ceria, ramah siswa SD & penuh warna',
  },
  {
    id: '3d_isometrik',
    label: '3D Isometrik Edukatif',
    badge: '3D Iso',
    desc: 'Sudut 3D dimensi ruang, cocok untuk bangun ruang & adegan',
  },
  {
    id: 'diagram_edukatif',
    label: 'Diagram Poster Berlabel',
    badge: 'Diagram',
    desc: 'Ilustrasi 2D/3D dengan panah & label bahasa Indonesia',
  },
];

interface TeacherChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isError?: boolean;
  retryPrompt?: string;
}

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

const LKPD_AKTIVITAS_OPTIONS = [
  'Teka-Teki & Permainan',
  'Eksplorasi Kelompok',
  'Studi Kasus Cerita',
  'Tabel Observasi',
  'Proyek Mini',
] as const;

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
  const [subTab, setSubTab] = useState<SarahTeacherSubTab>('chat');
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // Realtime Firestore states
  const [sarahConfig, setSarahConfig] = useState<SarahConfigDoc>(DEFAULT_SARAH_CONFIG);
  const [knowledgeDocs, setKnowledgeDocs] = useState<SarahKnowledgeItem[]>([]);
  const [mediaAjarDocs, setMediaAjarDocs] = useState<SarahMediaAjarContextDoc[]>([]);
  const [studentLogs, setStudentLogs] = useState<SarahStudentLogItem[]>([]);

  useEffect(() => {
    syncSarahConfigToFirestore(undefined, activeUser.name).catch(() => {});
    const unsubCfg = subscribeToSarahConfig(setSarahConfig);
    const unsubKb = subscribeToSarahKnowledgeBase(setKnowledgeDocs);
    const unsubMedia = subscribeToMediaAjarForSarah(setMediaAjarDocs);
    const unsubLogs = subscribeToSarahStudentLogs(setStudentLogs);
    return () => {
      unsubCfg();
      unsubKb();
      unsubMedia();
      unsubLogs();
    };
  }, [activeUser.name]);

  const mapelOptions = useMemo(() => {
    const names = subjects.map((s) => s.name).filter(Boolean);
    return Array.from(new Set([...names, ...DEFAULT_MAPEL_LIST]));
  }, [subjects]);

  const defaultGradeKelas = useMemo(() => {
    if (activeUser.kelasDiampu && CLASSES_LIST.includes(activeUser.kelasDiampu)) {
      return activeUser.kelasDiampu;
    }
    return activeClass || 'Kelas 6A';
  }, [activeUser.kelasDiampu, activeClass]);

  // Processing state
  const [isGenerating, setIsGenerating] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('');

  // Mode 0: Obrolan Bebas (Multi-turn Interactive Chat + Auto-Save History)
  const sarahChatUserId = useMemo(
    () => buildSarahChatUserId(activeUser),
    [activeUser]
  );

  const buildTeacherWelcome = (): TeacherChatMessage => ({
    id: 'sarah_teacher_welcome',
    role: 'model',
    text: `Assalamu'alaikum / Selamat sejahtera, **${activeUser.name}**.\n\nSaya **SARAH**, sahabat diskusi Bapak/Ibu di **${profile.name}**. Silakan ajak saya berdiskusi secara bebas—mulai dari strategi mendampingi anak di kelas, merancang ice breaking, menyusun asesmen, hingga menyelesaikan kendala belajar siswa. Apa yang sedang ingin Bapak/Ibu bahas hari ini?`,
  });

  const [chatMessages, setChatMessages] = useState<TeacherChatMessage[]>(() => [
    buildTeacherWelcome(),
  ]);
  const [chatSessions, setChatSessions] = useState<SarahChatSessionItem[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [isLoadingChatSessions, setIsLoadingChatSessions] = useState(false);
  const [isLoadingSessionMsgs, setIsLoadingSessionMsgs] = useState(false);
  const [showMobileHistory, setShowMobileHistory] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMapel, setChatMapel] = useState('Umum');
  const [isChatSending, setIsChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initHistory = async () => {
      setIsLoadingChatSessions(true);
      try {
        const sessions = await loadUserSarahChatSessions(sarahChatUserId);
        if (cancelled) return;
        setChatSessions(sessions);
        if (sessions.length > 0) {
          const latest = sessions[0];
          setActiveChatSessionId(latest.id);
          setIsLoadingSessionMsgs(true);
          const msgs = await loadSarahSessionMessages(latest.id);
          if (cancelled) return;
          if (msgs.length > 0) {
            setChatMessages(
              msgs.map((m) => ({
                id: m.id,
                role: m.sender === 'user' ? 'user' : 'model',
                text: m.text,
              }))
            );
          } else {
            setChatMessages([buildTeacherWelcome()]);
          }
        } else {
          setActiveChatSessionId(null);
          setChatMessages([buildTeacherWelcome()]);
        }
      } catch {
        // Keep fresh welcome screen if offline/unavailable
      } finally {
        if (!cancelled) {
          setIsLoadingChatSessions(false);
          setIsLoadingSessionMsgs(false);
        }
      }
    };
    initHistory();
    return () => {
      cancelled = true;
    };
  }, [sarahChatUserId]);

  useEffect(() => {
    if (subTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, subTab, isChatSending]);

  // Mode LKPD: Generator LKPD Menarik
  const [lkpdKelas, setLkpdKelas] = useState(defaultGradeKelas);
  const [lkpdMapel, setLkpdMapel] = useState(mapelOptions[0] || 'Bahasa Indonesia');
  const [lkpdTopik, setLkpdTopik] = useState('');
  const [lkpdAktivitas, setLkpdAktivitas] = useState<string>(LKPD_AKTIVITAS_OPTIONS[0]);
  const [lkpdDiferensiasi, setLkpdDiferensiasi] = useState<'Reguler' | 'Pendampingan Khusus Inklusi'>(
    'Reguler'
  );
  const [lkpdGayaGambar, setLkpdGayaGambar] = useState<SarahDocVisualChoice>('3d_clay');
  const [lkpdResult, setLkpdResult] = useState('');
  const [lkpdIllustration, setLkpdIllustration] = useState<SarahIllustrationAsset | null>(null);
  const [isRegenLkpdImage, setIsRegenLkpdImage] = useState(false);
  const [isSavingLkpdKb, setIsSavingLkpdKb] = useState(false);

  // Mode A: Modul Ajar & RPP Berdiferensiasi
  const [modulKelas, setModulKelas] = useState(defaultGradeKelas);
  const [modulMapel, setModulMapel] = useState(mapelOptions[0] || 'Bahasa Indonesia');
  const [modulTopik, setModulTopik] = useState('');
  const [modulInklusi, setModulInklusi] = useState('');
  const [modulGayaGambar, setModulGayaGambar] = useState<SarahDocVisualChoice>('3d_clay');
  const [modulResult, setModulResult] = useState('');
  const [modulIllustration, setModulIllustration] = useState<SarahIllustrationAsset | null>(null);
  const [isRegenModulImage, setIsRegenModulImage] = useState(false);
  const [isSavingModulKb, setIsSavingModulKb] = useState(false);

  // Mode Studio Gambar SARAH (3D & 2D)
  const [gambarDeskripsi, setGambarDeskripsi] = useState('');
  const [gambarGaya, setGambarGaya] = useState<SarahVisualStyleId>('3d_clay');
  const [gambarRasio, setGambarRasio] = useState<'16:9' | '4:3' | '1:1' | '3:4'>('4:3');
  const [gambarKelas, setGambarKelas] = useState(defaultGradeKelas);
  const [gambarMapel, setGambarMapel] = useState(mapelOptions[0] || 'IPAS');
  const [gambarResult, setGambarResult] = useState<SarahIllustrationAsset | null>(null);
  const [gambarHistory, setGambarHistory] = useState<SarahIllustrationAsset[]>([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

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
      showToast('Jawaban SARAH berhasil disalin ke clipboard!', 'success');
    } catch {
      showToast('Gagal menyalin teks. Silakan blok manual teks yang diinginkan.', 'error');
    }
  };

  // Handler Obrolan Bebas (Multi-Turn + Auto-Save Firestore)
  const handleSelectTeacherSession = async (sessionId: string) => {
    if (!sessionId || isChatSending) return;
    setActiveChatSessionId(sessionId);
    setShowMobileHistory(false);
    setIsLoadingSessionMsgs(true);
    try {
      const msgs = await loadSarahSessionMessages(sessionId);
      if (msgs.length > 0) {
        setChatMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.sender === 'user' ? 'user' : 'model',
            text: m.text,
          }))
        );
      } else {
        setChatMessages([buildTeacherWelcome()]);
      }
    } catch {
      showToast('Gagal memuat riwayat percakapan.', 'error');
    } finally {
      setIsLoadingSessionMsgs(false);
    }
  };

  const handleNewTeacherChat = () => {
    if (isChatSending) return;
    setActiveChatSessionId(null);
    setChatMessages([buildTeacherWelcome()]);
    setShowMobileHistory(false);
    showToast('Memulai obrolan baru bersama SARAH!', 'success');
  };

  const handleDeleteTeacherSession = async (
    sessionId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (deletingSessionId) return;
    setDeletingSessionId(sessionId);
    try {
      await deleteSarahChatSession(sessionId);
      const remaining = chatSessions.filter((s) => s.id !== sessionId);
      setChatSessions(remaining);
      if (activeChatSessionId === sessionId) {
        if (remaining.length > 0) {
          await handleSelectTeacherSession(remaining[0].id);
        } else {
          setActiveChatSessionId(null);
          setChatMessages([buildTeacherWelcome()]);
        }
      }
      showToast('Riwayat percakapan berhasil dihapus.', 'success');
    } catch {
      showToast('Gagal menghapus riwayat percakapan.', 'error');
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleSendTeacherChat = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const promptText = (overrideText ?? chatInput).trim();
    if (!promptText || isChatSending) return;

    const userMsg: TeacherChatMessage = {
      id: `tu_${Date.now()}`,
      role: 'user',
      text: promptText,
    };
    const prevHistory = chatMessages
      .filter((m) => !m.isError)
      .slice(-10)
      .map((m) => ({ role: m.role, text: m.text }));

    setChatMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setChatInput('');
    setIsChatSending(true);

    let currentSessionId = activeChatSessionId;
    try {
      if (!currentSessionId) {
        const created = await createSarahChatSession({
          userId: sarahChatUserId,
          role: 'guru',
          firstQuestion: promptText,
        });
        currentSessionId = created.id;
        setActiveChatSessionId(created.id);
        setChatSessions((prev) =>
          [created, ...prev.filter((s) => s.id !== created.id)].slice(
            0,
            SARAH_MAX_CHAT_SESSIONS
          )
        );
      }
      if (currentSessionId) {
        await appendSarahChatMessage({
          sessionId: currentSessionId,
          sender: 'user',
          text: promptText,
        });
      }
    } catch {
      // Do not block AI reply if auto-save encounters a temporary network glitch
    }

    try {
      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: activeClass,
        mapel: chatMapel === 'Umum' ? '' : chatMapel,
        queryText: promptText,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
        sarahConfig,
      });

      const res = await callSarahAiEndpoint<SarahTextGeneratedResponse>({
        mode: 'general_chat',
        role: activeUser.role,
        user: { name: activeUser.name, kelas: activeClass },
        params: { message: promptText, mapel: chatMapel },
        history: prevHistory,
        ragContext,
      });

      setChatMessages((prev) => [
        ...prev,
        {
          id: `tm_${Date.now()}`,
          role: 'model',
          text: res.text,
        },
      ]);

      if (currentSessionId) {
        appendSarahChatMessage({
          sessionId: currentSessionId,
          sender: 'sarah',
          text: res.text,
        }).catch(() => {});
        setChatSessions((prev) => {
          const target = prev.find((s) => s.id === currentSessionId);
          if (!target) return prev;
          const updated = { ...target, updated_at: Date.now() };
          return [updated, ...prev.filter((s) => s.id !== currentSessionId)].slice(
            0,
            SARAH_MAX_CHAT_SESSIONS
          );
        });
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `terr_${Date.now()}`,
          role: 'model',
          text: `Mohon maaf Bapak/Ibu, SARAH mengalami kendala koneksi sebentar (${err?.message || 'coba lagi'}).`,
          isError: true,
          retryPrompt: promptText,
        },
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  const handleClearTeacherChat = () => {
    setActiveChatSessionId(null);
    setChatMessages([buildTeacherWelcome()]);
    showToast('Obrolan dibersihkan. Silakan mulai topik diskusi baru!', 'success');
  };

  const requestIllustrationAsset = async (opts: {
    deskripsi: string;
    gaya: SarahVisualStyleId;
    rasio: '16:9' | '4:3' | '1:1' | '3:4';
    kelas: string;
    mapel: string;
    konteks: string;
    ragContext: ReturnType<typeof retrieveSarahRagContext>;
  }): Promise<SarahIllustrationAsset> => {
    const imgRes = await callSarahAiEndpoint<SarahImageGeneratedResponse>({
      mode: 'image_generator',
      role: activeUser.role,
      user: { name: activeUser.name, kelas: activeClass },
      params: {
        deskripsi: opts.deskripsi,
        gaya: opts.gaya,
        rasio: opts.rasio,
        kelas: opts.kelas,
        mapel: opts.mapel,
        konteks: opts.konteks,
      },
      ragContext: opts.ragContext,
    });
    const svgDataUrl = svgToDataUrl(imgRes.svgCode);
    const pngDataUrl = await rasterizeSvgToPngDataUrl(imgRes.svgCode, imgRes.width, imgRes.height);
    return {
      ...imgRes,
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      svgDataUrl,
      pngDataUrl,
      createdAt: Date.now(),
    };
  };

  const downloadAssetPng = async (asset: SarahIllustrationAsset) => {
    const png =
      asset.pngDataUrl || (await rasterizeSvgToPngDataUrl(asset.svgCode, asset.width, asset.height));
    if (!png) {
      showToast('Gagal mengonversi gambar ke PNG.', 'error');
      return;
    }
    const a = document.createElement('a');
    const safeName = asset.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
    a.href = png;
    a.download = `${safeName || 'ilustrasi_sarah'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Gambar PNG berhasil diunduh!', 'success');
  };

  const downloadAssetSvg = (asset: SarahIllustrationAsset) => {
    const blob = new Blob([asset.svgCode], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = asset.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
    a.href = url;
    a.download = `${safeName || 'ilustrasi_sarah'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Gambar vektor SVG berhasil diunduh!', 'success');
  };

  // Handler Generator LKPD Menarik
  const handleGenerateLkpd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lkpdTopik.trim()) {
      showToast('Harap isi Topik / Tujuan Pembelajaran LKPD terlebih dahulu.', 'error');
      return;
    }
    setIsGenerating(true);
    setProcessingLabel('SARAH sedang merancang LKPD beserta ilustrasi visual menarik...');
    try {
      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: lkpdKelas,
        mapel: lkpdMapel,
        queryText: `${lkpdTopik} ${lkpdAktivitas} ${lkpdDiferensiasi}`,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
        sarahConfig,
      });

      const textPromise = callSarahAiEndpoint<SarahTextGeneratedResponse>({
        mode: 'lkpd_generator',
        role: activeUser.role,
        user: { name: activeUser.name, kelas: activeClass },
        params: {
          kelas: lkpdKelas,
          mapel: lkpdMapel,
          topik: lkpdTopik,
          jenisAktivitas: lkpdAktivitas,
          tingkatDiferensiasi: lkpdDiferensiasi,
        },
        ragContext,
      });

      const imagePromise =
        lkpdGayaGambar !== 'none'
          ? requestIllustrationAsset({
              deskripsi: `Ilustrasi edukatif ceria untuk LKPD siswa SD (${lkpdKelas}, ${lkpdMapel}) bertopik: ${lkpdTopik}. Aktivitas: ${lkpdAktivitas}.`,
              gaya: lkpdGayaGambar,
              rasio: '4:3',
              kelas: lkpdKelas,
              mapel: lkpdMapel,
              konteks: 'LKPD Siswa SD',
              ragContext,
            })
          : Promise.resolve(null);

      const [textSettled, imgSettled] = await Promise.allSettled([textPromise, imagePromise]);

      if (textSettled.status === 'rejected') {
        throw textSettled.reason;
      }

      setLkpdResult(textSettled.value.text);
      if (imgSettled.status === 'fulfilled' && imgSettled.value) {
        setLkpdIllustration(imgSettled.value);
        setGambarHistory((prev) => [imgSettled.value!, ...prev].slice(0, 8));
        showToast('LKPD & ilustrasi menarik berhasil disusun oleh SARAH!', 'success');
      } else {
        setLkpdIllustration(null);
        showToast(
          lkpdGayaGambar !== 'none'
            ? 'LKPD berhasil disusun! Anda bisa klik Buat Ulang Gambar bila ilustrasi belum tampil.'
            : 'LKPD menarik siap pakai berhasil disusun oleh SARAH!',
          'success'
        );
      }
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyusun LKPD dengan SARAH.', 'error');
    } finally {
      setIsGenerating(false);
      setProcessingLabel('');
    }
  };

  const handleRegenerateLkpdImage = async () => {
    if (!lkpdTopik.trim() || lkpdGayaGambar === 'none') return;
    setIsRegenLkpdImage(true);
    try {
      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: lkpdKelas,
        mapel: lkpdMapel,
        queryText: lkpdTopik,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
        sarahConfig,
      });
      const asset = await requestIllustrationAsset({
        deskripsi: `Ilustrasi edukatif menarik untuk LKPD SD (${lkpdKelas}, ${lkpdMapel}) topik: ${lkpdTopik}`,
        gaya: lkpdGayaGambar,
        rasio: '4:3',
        kelas: lkpdKelas,
        mapel: lkpdMapel,
        konteks: 'LKPD Siswa SD',
        ragContext,
      });
      setLkpdIllustration(asset);
      setGambarHistory((prev) => [asset, ...prev].slice(0, 8));
      showToast('Ilustrasi LKPD berhasil diperbarui!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal membuat ulang gambar LKPD.', 'error');
    } finally {
      setIsRegenLkpdImage(false);
    }
  };

  const handleSaveLkpdToMemory = async () => {
    if (!lkpdResult.trim()) return;
    setIsSavingLkpdKb(true);
    try {
      await addSarahKnowledgeItem({
        judul: `LKPD (${lkpdAktivitas}): ${lkpdTopik.trim() || lkpdMapel}`,
        kategori: 'Materi Ajar',
        kelas: lkpdKelas,
        mata_pelajaran: lkpdMapel,
        konten_ringkasan: lkpdResult,
        sumber: `Generator LKPD SARAH (${lkpdDiferensiasi})`,
        disetujui_oleh: activeUser.name,
      });
      showToast('LKPD berhasil disimpan ke Memori Pengetahuan SARAH!', 'success');
    } catch (err: any) {
      showToast(`Gagal menyimpan ke memori SARAH: ${err?.message || 'error'}`, 'error');
    } finally {
      setIsSavingLkpdKb(false);
    }
  };

  const handlePrintLkpd = () => {
    window.print();
  };

  const handleGenerateModul = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modulTopik.trim()) {
      showToast('Harap isi Topik / Tujuan Pembelajaran (TP) terlebih dahulu.', 'error');
      return;
    }
    setIsGenerating(true);
    setProcessingLabel('SARAH sedang menyusun Modul Ajar & ilustrasi visual...');
    try {
      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: modulKelas,
        mapel: modulMapel,
        queryText: `${modulTopik} ${modulInklusi}`,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
        sarahConfig,
      });

      const textPromise = callSarahAiEndpoint<SarahTextGeneratedResponse>({
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

      const imagePromise =
        modulGayaGambar !== 'none'
          ? requestIllustrationAsset({
              deskripsi: `Ilustrasi sampul/media pembelajaran menarik untuk Modul Ajar SD (${modulKelas}, ${modulMapel}) topik: ${modulTopik}`,
              gaya: modulGayaGambar,
              rasio: '16:9',
              kelas: modulKelas,
              mapel: modulMapel,
              konteks: 'Modul Ajar Kurikulum Merdeka',
              ragContext,
            })
          : Promise.resolve(null);

      const [textSettled, imgSettled] = await Promise.allSettled([textPromise, imagePromise]);
      if (textSettled.status === 'rejected') {
        throw textSettled.reason;
      }

      setModulResult(textSettled.value.text);
      if (imgSettled.status === 'fulfilled' && imgSettled.value) {
        setModulIllustration(imgSettled.value);
        setGambarHistory((prev) => [imgSettled.value!, ...prev].slice(0, 8));
        showToast('Modul Ajar & ilustrasi menarik berhasil disusun oleh SARAH!', 'success');
      } else {
        setModulIllustration(null);
        showToast('Modul Ajar & RPP Berdiferensiasi berhasil disusun oleh SARAH!', 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Gagal menghubungi asisten SARAH.', 'error');
    } finally {
      setIsGenerating(false);
      setProcessingLabel('');
    }
  };

  const handleRegenerateModulImage = async () => {
    if (!modulTopik.trim() || modulGayaGambar === 'none') return;
    setIsRegenModulImage(true);
    try {
      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: modulKelas,
        mapel: modulMapel,
        queryText: modulTopik,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
        sarahConfig,
      });
      const asset = await requestIllustrationAsset({
        deskripsi: `Ilustrasi pembelajaran menarik untuk Modul Ajar SD (${modulKelas}, ${modulMapel}) topik: ${modulTopik}`,
        gaya: modulGayaGambar,
        rasio: '16:9',
        kelas: modulKelas,
        mapel: modulMapel,
        konteks: 'Modul Ajar Kurikulum Merdeka',
        ragContext,
      });
      setModulIllustration(asset);
      setGambarHistory((prev) => [asset, ...prev].slice(0, 8));
      showToast('Ilustrasi Modul Ajar berhasil diperbarui!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal membuat ulang gambar Modul Ajar.', 'error');
    } finally {
      setIsRegenModulImage(false);
    }
  };

  const handleGenerateStudioImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gambarDeskripsi.trim()) {
      showToast('Harap tulis deskripsi gambar 3D atau 2D yang ingin dibuat SARAH.', 'error');
      return;
    }
    setIsGeneratingImage(true);
    try {
      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: gambarKelas,
        mapel: gambarMapel,
        queryText: gambarDeskripsi,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
        sarahConfig,
      });
      const asset = await requestIllustrationAsset({
        deskripsi: gambarDeskripsi,
        gaya: gambarGaya,
        rasio: gambarRasio,
        kelas: gambarKelas,
        mapel: gambarMapel,
        konteks: 'Media Visual Guru & Siswa SD',
        ragContext,
      });
      setGambarResult(asset);
      setGambarHistory((prev) => [asset, ...prev].slice(0, 8));
      showToast('Gambar ilustrasi menarik berhasil dibuat oleh SARAH!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal membuat gambar bersama SARAH.', 'error');
    } finally {
      setIsGeneratingImage(false);
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
        sarahConfig,
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
        sarahConfig,
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
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-rose-600 via-rose-700 to-indigo-700 p-6 sm:p-8 text-white shadow-lg no-print">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-[11px] font-black uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Asisten AI Terintegrasi SERBU 21</span>
              </div>
              <button
                type="button"
                onClick={() => setIsInfoModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/35 hover:bg-pink-500/55 border border-pink-200/50 text-[11px] font-bold text-white transition cursor-pointer"
                title="Tentang & Dedikasi SARAH"
              >
                <Heart className="w-3.5 h-3.5 text-pink-200 fill-pink-200" />
                <span>Tentang SARAH</span>
              </button>
            </div>
            <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight">
              SARAH — Sistem Asisten Adaptif, Ramah, Amanah &amp; Humanis
            </h1>
            <p className="text-xs sm:text-sm text-rose-100 leading-relaxed">
              Sahabat pendidik berjiwa kasih sayang untuk tanya jawab bebas, membuat LKPD menarik siap cetak, Modul Ajar Berdiferensiasi, soal CBT otomatis, serta memantau diskusi belajar siswa.
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
      <div className="bg-white p-2 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap gap-2 no-print">
        {[
          { id: 'chat', label: 'Obrolan Bebas', icon: MessageSquareHeart },
          { id: 'lkpd', label: 'Generator LKPD', icon: ClipboardList },
          { id: 'modul', label: 'Modul Ajar & RPP', icon: BookOpen },
          { id: 'gambar', label: 'Buat Gambar (3D & 2D)', icon: ImageIcon },
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
              className={`px-3.5 py-2.5 rounded-2xl font-display font-extrabold text-xs flex items-center gap-2 transition cursor-pointer ${
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
        <div className="p-4 rounded-2xl bg-indigo-50 border-2 border-indigo-200 flex items-center gap-3 animate-pulse no-print">
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
      {/* TAB 0: OBROLAN BEBAS (RUANG TANYA JAWAB INTERAKTIF + AUTO-SAVE)      */}
      {/* ===================================================================== */}
      {subTab === 'chat' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex h-[680px] max-h-[80vh] relative">
          {/* Desktop Sidebar: Riwayat Percakapan */}
          <aside className="hidden lg:flex w-72 shrink-0 border-r border-slate-200 bg-slate-50/80 flex-col">
            <div className="p-4 border-b border-slate-200 bg-white space-y-3">
              <button
                type="button"
                onClick={handleNewTeacherChat}
                disabled={isChatSending}
                className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Obrolan Baru</span>
              </button>
              <div className="flex items-center justify-between text-[11px] font-black text-slate-600 uppercase tracking-wide">
                <span className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-rose-600" />
                  Riwayat Percakapan
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px]">
                  {chatSessions.length}/{SARAH_MAX_CHAT_SESSIONS}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {isLoadingChatSessions ? (
                <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                  <span>Memuat riwayat...</span>
                </div>
              ) : chatSessions.length === 0 ? (
                <div className="p-4 text-center space-y-1.5 text-slate-500">
                  <MessageCircle className="w-7 h-7 mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">Belum ada riwayat obrolan</p>
                  <p className="text-[11px]">
                    Percakapan Anda akan tersimpan otomatis di sini (maks. 20 sesi terakhir).
                  </p>
                </div>
              ) : (
                chatSessions.map((sess) => {
                  const isActive = sess.id === activeChatSessionId;
                  return (
                    <div
                      key={sess.id}
                      onClick={() => handleSelectTeacherSession(sess.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectTeacherSession(sess.id);
                        }
                      }}
                      className={`group w-full text-left p-2.5 rounded-2xl border transition cursor-pointer flex items-start justify-between gap-2 ${
                        isActive
                          ? 'bg-rose-50 border-rose-300 shadow-2xs'
                          : 'bg-white border-slate-200/80 hover:border-rose-200 hover:bg-rose-50/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p
                          className={`text-xs font-bold leading-snug line-clamp-2 ${
                            isActive ? 'text-rose-900' : 'text-slate-800'
                          }`}
                        >
                          {sess.judul_sesi}
                        </p>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {formatSarahDateTime(sess.updated_at || sess.created_at)}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteTeacherSession(sess.id, e)}
                        disabled={deletingSessionId === sess.id}
                        title="Hapus Riwayat"
                        aria-label="Hapus Riwayat"
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-100 transition shrink-0 cursor-pointer disabled:opacity-40"
                      >
                        {deletingSessionId === sess.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Main Chat Column */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* Chat Top Bar */}
            <div className="px-4 sm:px-5 py-3.5 bg-gradient-to-r from-rose-50 via-pink-50/70 to-indigo-50 border-b border-rose-100 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <MessageSquareHeart className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-black text-sm text-slate-900">
                    Obrolan Interaktif Bebas dengan SARAH
                  </h2>
                  <p className="text-[11px] text-slate-600">
                    Tersimpan otomatis lintas perangkat • Maks. 20 sesi &amp; 30 pesan terakhir
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Mobile / Tablet History Dropdown Toggle */}
                <button
                  type="button"
                  onClick={() => setShowMobileHistory((p) => !p)}
                  className="lg:hidden px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-slate-800 border border-rose-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-rose-600" />
                  <span>Riwayat ({chatSessions.length})</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      showMobileHistory ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={handleNewTeacherChat}
                  disabled={isChatSending}
                  className="lg:hidden px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Obrolan Baru</span>
                </button>
                <select
                  value={chatMapel}
                  onChange={(e) => setChatMapel(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-rose-200 bg-white text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="Umum">Konteks Mapel: Umum</option>
                  {mapelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleClearTeacherChat}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Hapus Obrolan</span>
                </button>
              </div>
            </div>

            {/* Mobile History Dropdown Panel */}
            {showMobileHistory && (
              <div className="lg:hidden absolute top-[68px] left-0 right-0 z-20 bg-white border-b-2 border-rose-200 shadow-xl max-h-72 overflow-y-auto p-3 space-y-2">
                <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-100">
                  <span className="text-[11px] font-black text-slate-700 uppercase">
                    Riwayat Percakapan ({chatSessions.length}/{SARAH_MAX_CHAT_SESSIONS})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMobileHistory(false)}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {chatSessions.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-3">
                    Belum ada riwayat obrolan tersimpan.
                  </p>
                ) : (
                  chatSessions.map((sess) => {
                    const isActive = sess.id === activeChatSessionId;
                    return (
                      <div
                        key={sess.id}
                        onClick={() => handleSelectTeacherSession(sess.id)}
                        role="button"
                        tabIndex={0}
                        className={`p-2.5 rounded-2xl border flex items-center justify-between gap-2 cursor-pointer ${
                          isActive
                            ? 'bg-rose-50 border-rose-300'
                            : 'bg-slate-50 border-slate-200 hover:bg-rose-50/40'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {sess.judul_sesi}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {formatSarahDateTime(sess.updated_at || sess.created_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTeacherSession(sess.id, e)}
                          disabled={deletingSessionId === sess.id}
                          title="Hapus Riwayat"
                          aria-label="Hapus Riwayat"
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-100 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Chat Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/60">
              {isLoadingSessionMsgs ? (
                <div className="h-full flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                  <span>Memuat riwayat percakapan terakhir...</span>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] sm:max-w-[78%] rounded-3xl px-4 py-3 shadow-2xs space-y-2 ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white rounded-br-sm text-xs sm:text-sm font-medium leading-relaxed'
                          : msg.isError
                          ? 'bg-amber-50/90 border border-amber-200 text-amber-950 rounded-bl-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      ) : msg.isError ? (
                        <>
                          <p className="text-xs sm:text-sm leading-relaxed">{msg.text}</p>
                          {msg.retryPrompt && (
                            <div className="flex justify-end pt-1.5 border-t border-amber-200/70">
                              <button
                                type="button"
                                disabled={isChatSending}
                                onClick={() => handleSendTeacherChat(undefined, msg.retryPrompt)}
                                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Coba Kirim Ulang</span>
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <SarahMarkdown content={msg.text} />
                          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleCopyText(msg.text)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition"
                            >
                              <Copy className="w-3 h-3" />
                              <span>Salin Jawaban</span>
                            </button>
                            {msg.id !== 'sarah_teacher_welcome' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await addSarahKnowledgeItem({
                                      judul: `Diskusi SARAH (${chatMapel}) - ${new Date().toLocaleDateString('id-ID')}`,
                                      kategori: 'Materi Ajar',
                                      kelas: activeClass || 'Semua',
                                      mata_pelajaran: chatMapel,
                                      konten_ringkasan: msg.text,
                                      sumber: `Obrolan SARAH (${activeUser.name})`,
                                      disetujui_oleh: activeUser.name,
                                    });
                                    showToast('Jawaban disimpan ke Memori SARAH!', 'success');
                                  } catch {
                                    showToast('Gagal menyimpan ke memori SARAH.', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition"
                              >
                                <Star className="w-3 h-3 text-amber-600" />
                                <span>Simpan ke Memori</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}

              {isChatSending && (
                <div className="flex justify-start">
                  <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-xs font-bold">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>SARAH sedang membaca basis data sekolah &amp; merangkai jawaban...</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Starter Prompts */}
            <div className="px-4 py-2 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto shrink-0">
              {[
                'Buatkan ice breaking 5 menit yang ceria sebelum pelajaran dimulai',
                'Bagaimana pendekatan lembut menghadapi siswa yang kurang percaya diri di kelas?',
                'Bantu buatkan pesan pengumuman WhatsApp yang santun untuk wali murid',
                'Rekomendasikan strategi pembelajaran berdiferensiasi untuk kelas saya',
              ].map((chip, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={isChatSending}
                  onClick={() => handleSendTeacherChat(undefined, chip)}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-bold whitespace-nowrap cursor-pointer transition disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Chat Input */}
            <form
              onSubmit={handleSendTeacherChat}
              className="p-4 bg-white border-t border-slate-200 flex items-center gap-2.5 shrink-0"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isChatSending}
                placeholder="Tulis pertanyaan, ide, atau topik diskusi bebas dengan SARAH..."
                className="flex-1 px-4 py-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-rose-600 outline-none text-xs sm:text-sm text-slate-800"
              />
              <button
                type="submit"
                disabled={isChatSending || !chatInput.trim()}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white font-display font-black text-xs flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-40 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Kirim</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB LKPD: GENERATOR LKPD MENARIK SIAP CETAK                           */}
      {/* ===================================================================== */}
      {subTab === 'lkpd' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleGenerateLkpd}
            className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 h-fit no-print"
          >
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-pink-100 text-rose-600 flex items-center justify-center">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-black text-sm text-slate-900">
                  Generator LKPD Menarik
                </h2>
                <p className="text-[11px] text-slate-500">
                  Lembar Kerja Peserta Didik ramah anak SD, siap cetak A4 &amp; ekspor Word
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Kelas (1–6)
                </label>
                <select
                  value={lkpdKelas}
                  onChange={(e) => setLkpdKelas(e.target.value)}
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
                  value={lkpdMapel}
                  onChange={(e) => setLkpdMapel(e.target.value)}
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
                Topik / Tujuan Pembelajaran <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                value={lkpdTopik}
                onChange={(e) => setLkpdTopik(e.target.value)}
                placeholder="Contoh: Mengenal bagian-bagian tumbuhan dan fungsinya serta manfaat bagi manusia..."
                className="w-full p-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 outline-none focus:border-rose-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Jenis Aktivitas
                </label>
                <select
                  value={lkpdAktivitas}
                  onChange={(e) => setLkpdAktivitas(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:border-rose-600"
                >
                  {LKPD_AKTIVITAS_OPTIONS.map((akt) => (
                    <option key={akt} value={akt}>
                      {akt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Tingkat Diferensiasi
                </label>
                <select
                  value={lkpdDiferensiasi}
                  onChange={(e) =>
                    setLkpdDiferensiasi(e.target.value as 'Reguler' | 'Pendampingan Khusus Inklusi')
                  }
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:border-rose-600"
                >
                  <option value="Reguler">Reguler</option>
                  <option value="Pendampingan Khusus Inklusi">Pendampingan Khusus Inklusi</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Ilustrasi Visual Menarik (3D / 2D)
              </label>
              <select
                value={lkpdGayaGambar}
                onChange={(e) => setLkpdGayaGambar(e.target.value as SarahDocVisualChoice)}
                className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:border-rose-600"
              >
                {IMAGE_STYLE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    [{opt.badge}] {opt.label}
                  </option>
                ))}
                <option value="none">Tanpa Gambar Ilustrasi</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer disabled:opacity-60"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Buat LKPD Menarik dengan SARAH</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 lkpd-print-sheet">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 no-print">
              <div>
                <h3 className="font-display font-black text-sm text-slate-900">
                  Pratinjau LKPD Siap Cetak
                </h3>
                <p className="text-[11px] text-slate-500">
                  Dilengkapi Kop Identitas, Ilustrasi 3D/2D, Misi Seru, Tabel Kerja &amp; Refleksi Perasaan
                </p>
              </div>
              {lkpdResult && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrintLkpd}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" /> Cetak / Simpan PDF
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportSarahToWordDoc({
                        title: `LKPD ${lkpdMapel} - ${lkpdKelas}`,
                        subtitle: `${lkpdAktivitas} (${lkpdDiferensiasi}) • Topik: ${lkpdTopik}`,
                        markdownContent: lkpdResult,
                        schoolName: profile.name,
                        author: activeUser.name,
                        illustration: lkpdIllustration,
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1.5 border border-indigo-200 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Unduh Word (.doc)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyText(lkpdResult)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> Salin
                  </button>
                  <button
                    type="button"
                    disabled={isSavingLkpdKb}
                    onClick={handleSaveLkpdToMemory}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-extrabold text-xs flex items-center gap-1.5 border border-amber-300 cursor-pointer disabled:opacity-50"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-600" />
                    <span>{isSavingLkpdKb ? 'Menyimpan...' : 'Simpan ke Memori'}</span>
                  </button>
                </div>
              )}
            </div>

            {lkpdResult ? (
              <div className="p-5 sm:p-6 rounded-2xl bg-white border-2 border-rose-100 max-h-[680px] overflow-y-auto print-expand-scroll lkpd-print-sheet space-y-4">
                {/* School Header for Printed Sheet */}
                <div className="border-b-2 border-slate-800 pb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-rose-700">
                      {profile.name || 'SDN Rawa Badak Utara 21'}
                    </p>
                    <h4 className="font-display font-black text-base text-slate-900">
                      LEMBAR KERJA PESERTA DIDIK (LKPD) — {lkpdMapel.toUpperCase()}
                    </h4>
                  </div>
                  <div className="text-right text-[11px] font-bold text-slate-600">
                    <div>{lkpdKelas}</div>
                    <div>{lkpdAktivitas}</div>
                  </div>
                </div>

                {lkpdIllustration && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3 space-y-2 print-avoid-break">
                    <div className="flex flex-wrap items-center justify-between gap-2 no-print">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase">
                        <Palette className="w-3 h-3" /> {lkpdIllustration.styleTag}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isRegenLkpdImage}
                          onClick={handleRegenerateLkpdImage}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRegenLkpdImage ? 'animate-spin' : ''}`} />
                          <span>{isRegenLkpdImage ? 'Menggambar...' : 'Buat Ulang Gambar'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadAssetPng(lkpdIllustration)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" /> PNG
                        </button>
                      </div>
                    </div>
                    <img
                      src={lkpdIllustration.svgDataUrl}
                      alt={lkpdIllustration.title}
                      className="w-full max-h-[300px] object-contain rounded-xl bg-white border border-rose-100 mx-auto"
                    />
                    <p className="text-center text-[11px] text-slate-600 font-medium">
                      <strong className="text-slate-800">{lkpdIllustration.title}</strong> — {lkpdIllustration.caption}
                    </p>
                  </div>
                )}

                {!lkpdIllustration && lkpdGayaGambar !== 'none' && (
                  <div className="no-print flex items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-xs text-slate-600 font-medium">
                      Ingin melengkapi LKPD ini dengan gambar ilustrasi 3D/2D menarik?
                    </span>
                    <button
                      type="button"
                      disabled={isRegenLkpdImage}
                      onClick={handleRegenerateLkpdImage}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{isRegenLkpdImage ? 'Menggambar...' : 'Buat Gambar Sekarang'}</span>
                    </button>
                  </div>
                )}

                <SarahMarkdown content={lkpdResult} />
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 text-slate-400 no-print">
                <ClipboardList className="w-10 h-10 mx-auto text-rose-200" />
                <p className="text-xs font-bold text-slate-500">
                  Isi topik &amp; jenis aktivitas di sebelah kiri untuk membuat LKPD menarik siap cetak!
                </p>
              </div>
            )}
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
            className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 h-fit no-print"
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

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Ilustrasi Visual Modul (3D / 2D)
              </label>
              <select
                value={modulGayaGambar}
                onChange={(e) => setModulGayaGambar(e.target.value as SarahDocVisualChoice)}
                className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:border-rose-600"
              >
                {IMAGE_STYLE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    [{opt.badge}] {opt.label}
                  </option>
                ))}
                <option value="none">Tanpa Gambar Ilustrasi</option>
              </select>
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

          <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 lkpd-print-sheet">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 no-print">
              <div>
                <h3 className="font-display font-black text-sm text-slate-900">
                  Hasil Modul Ajar &amp; RPP
                </h3>
                <p className="text-[11px] text-slate-500">
                  Dilengkapi ilustrasi 3D/2D, siap cetak PDF, diekspor ke Word, atau disimpan ke Memori SARAH
                </p>
              </div>
              {modulResult && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrintLkpd}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" /> Cetak / PDF
                  </button>
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
                        illustration: modulIllustration,
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
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 border border-slate-200 max-h-[650px] overflow-y-auto print-expand-scroll lkpd-print-sheet space-y-4">
                {modulIllustration && (
                  <div className="rounded-2xl border border-indigo-200 bg-white p-3 space-y-2 print-avoid-break">
                    <div className="flex flex-wrap items-center justify-between gap-2 no-print">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase">
                        <Palette className="w-3 h-3" /> {modulIllustration.styleTag}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isRegenModulImage}
                          onClick={handleRegenerateModulImage}
                          className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRegenModulImage ? 'animate-spin' : ''}`} />
                          <span>{isRegenModulImage ? 'Menggambar...' : 'Buat Ulang Gambar'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadAssetPng(modulIllustration)}
                          className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" /> PNG
                        </button>
                      </div>
                    </div>
                    <img
                      src={modulIllustration.svgDataUrl}
                      alt={modulIllustration.title}
                      className="w-full max-h-[280px] object-contain rounded-xl bg-slate-50 border border-slate-100 mx-auto"
                    />
                    <p className="text-center text-[11px] text-slate-600 font-medium">
                      <strong className="text-slate-800">{modulIllustration.title}</strong> — {modulIllustration.caption}
                    </p>
                  </div>
                )}

                {!modulIllustration && modulGayaGambar !== 'none' && (
                  <div className="no-print flex items-center justify-between gap-2 p-3 rounded-2xl bg-white border border-slate-200">
                    <span className="text-xs text-slate-600 font-medium">
                      Ingin menambahkan ilustrasi gambar 3D/2D ke Modul Ajar ini?
                    </span>
                    <button
                      type="button"
                      disabled={isRegenModulImage}
                      onClick={handleRegenerateModulImage}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{isRegenModulImage ? 'Menggambar...' : 'Buat Gambar Sekarang'}</span>
                    </button>
                  </div>
                )}

                <SarahMarkdown content={modulResult} />
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 text-slate-400 no-print">
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
      {/* TAB STUDIO GAMBAR: BUAT GAMBAR EDUKATIF 3D & 2D BERSAMA SARAH         */}
      {/* ===================================================================== */}
      {subTab === 'gambar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
          <form
            onSubmit={handleGenerateStudioImage}
            className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 h-fit"
          >
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-indigo-600 text-white flex items-center justify-center">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-black text-sm text-slate-900">
                  Studio Gambar Edukatif SARAH (3D &amp; 2D)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Ilustrasi 3D clay, isometrik, 2D cerita anak &amp; diagram berlabel siap pakai
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                Deskripsi / Topik Gambar <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                value={gambarDeskripsi}
                onChange={(e) => setGambarDeskripsi(e.target.value)}
                placeholder="Contoh: Organ sistem pencernaan manusia yang ceria dengan lambung, usus, dan label ramah anak SD..."
                className="w-full p-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 outline-none focus:border-rose-600"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  'Sistem pernapasan manusia paru-paru ramah anak SD',
                  'Siklus air hujan, awan, matahari, dan penguapan',
                  'Bangun ruang kubus, balok, kerucut, dan bola warna-warni',
                  'Anak-anak SD ceria membaca buku di taman sekolah',
                ].map((idea, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setGambarDeskripsi(idea)}
                    className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold cursor-pointer transition"
                  >
                    + {idea}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase mb-1.5">
                Pilih Gaya Visual (3D / 2D)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {IMAGE_STYLE_OPTIONS.map((styleOpt) => {
                  const selected = gambarGaya === styleOpt.id;
                  return (
                    <button
                      key={styleOpt.id}
                      type="button"
                      onClick={() => setGambarGaya(styleOpt.id)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                        selected
                          ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-200'
                          : 'bg-slate-50 border-slate-200 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-display font-black text-xs text-slate-900">
                          {styleOpt.label}
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                            selected ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {styleOpt.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-snug">{styleOpt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Rasio
                </label>
                <select
                  value={gambarRasio}
                  onChange={(e) => setGambarRasio(e.target.value as '16:9' | '4:3' | '1:1' | '3:4')}
                  className="w-full px-2.5 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  <option value="4:3">Kartu (4:3)</option>
                  <option value="16:9">Poster (16:9)</option>
                  <option value="1:1">Persegi (1:1)</option>
                  <option value="3:4">Potret (3:4)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Kelas
                </label>
                <select
                  value={gambarKelas}
                  onChange={(e) => setGambarKelas(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
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
                  Mapel
                </label>
                <select
                  value={gambarMapel}
                  onChange={(e) => setGambarMapel(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  {mapelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isGeneratingImage}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-600 via-pink-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer disabled:opacity-60"
            >
              {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{isGeneratingImage ? 'SARAH Sedang Menggambar...' : 'Buat Gambar Menarik dengan SARAH'}</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display font-black text-sm text-slate-900">
                  Hasil Ilustrasi Visual SARAH
                </h3>
                <p className="text-[11px] text-slate-500">
                  Siap diunduh sebagai PNG/SVG atau langsung dipasang ke LKPD &amp; Modul Ajar
                </p>
              </div>
              {gambarResult && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => downloadAssetPng(gambarResult)}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Unduh PNG
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadAssetSvg(gambarResult)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> SVG
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLkpdIllustration(gambarResult);
                      setSubTab('lkpd');
                      showToast('Gambar dipasang ke pratinjau Generator LKPD!', 'success');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-rose-700 border border-rose-200 font-bold text-xs cursor-pointer"
                  >
                    Pasang ke LKPD
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModulIllustration(gambarResult);
                      setSubTab('modul');
                      showToast('Gambar dipasang ke pratinjau Modul Ajar!', 'success');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs cursor-pointer"
                  >
                    Pasang ke Modul
                  </button>
                </div>
              )}
            </div>

            {gambarResult ? (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-50/50 via-white to-indigo-50/50 border-2 border-rose-100 flex flex-col items-center justify-center">
                  <img
                    src={gambarResult.svgDataUrl}
                    alt={gambarResult.title}
                    className="w-full max-h-[430px] object-contain rounded-xl shadow-xs bg-white"
                  />
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-display font-black text-xs text-slate-900">
                      {gambarResult.title}
                    </p>
                    <p className="text-[11px] text-slate-600">{gambarResult.caption}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase">
                    {gambarResult.styleTag} • {gambarResult.rasio}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 text-slate-400">
                <ImageIcon className="w-10 h-10 mx-auto text-rose-200" />
                <p className="text-xs font-bold text-slate-500">
                  Tulis deskripsi atau pilih ide gambar di sebelah kiri, lalu pilih gaya 3D atau 2D yang Anda sukai!
                </p>
              </div>
            )}

            {gambarHistory.length > 1 && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <p className="text-[11px] font-black uppercase text-slate-500">
                  Galeri Gambar Sesi Ini ({gambarHistory.length})
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {gambarHistory.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setGambarResult(item)}
                      className={`p-1.5 rounded-xl border text-left transition cursor-pointer ${
                        gambarResult?.id === item.id
                          ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50'
                          : 'border-slate-200 bg-white hover:border-rose-300'
                      }`}
                    >
                      <img
                        src={item.svgDataUrl}
                        alt={item.title}
                        className="w-full h-16 object-contain rounded-lg bg-slate-50"
                      />
                      <p className="text-[10px] font-bold text-slate-700 truncate mt-1">
                        {item.title}
                      </p>
                    </button>
                  ))}
                </div>
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

      {/* Modal Info Dedikasi SARAH */}
      {isInfoModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border-2 border-rose-200 text-center space-y-4 animate-in zoom-in-95 duration-200 relative">
            <button
              type="button"
              onClick={() => setIsInfoModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 flex items-center justify-center cursor-pointer"
              aria-label="Tutup modal info"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center mx-auto shadow-md">
              <Heart className="w-7 h-7 fill-white" />
            </div>
            <div className="space-y-2">
              <h3 className="font-display font-black text-base text-slate-900">
                Tentang Asisten SARAH
              </h3>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                {sarahConfig.attribution || SARAH_ATTRIBUTION_TEXT}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsInfoModalOpen(false)}
              className="w-full py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs shadow-sm transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
