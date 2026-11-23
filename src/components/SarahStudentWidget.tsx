import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  X,
  Lock,
  Loader2,
  HeartHandshake,
  Minimize2,
  MessageCircleHeart,
  Heart,
  Copy,
  RotateCcw,
  History,
  Plus,
  Trash2,
  Clock,
  ChevronDown,
  ClipboardCheck,
  CheckCircle2,
  Database,
  Zap,
  StopCircle,
} from 'lucide-react';
import {
  ActiveExamHeaderStatus,
  ActiveUser,
  CBTExam,
  SchoolProfile,
  Student,
  Subject,
} from '../types';
import { subscribeToCbtExamsCollection } from '../utils/cbtFirestore';
import {
  DEFAULT_SARAH_CONFIG,
  SARAH_ATTRIBUTION_TEXT,
  SARAH_MAX_CHAT_SESSIONS,
  SarahAnalysisPhase,
  SarahChatSessionItem,
  SarahConfigDoc,
  SarahKnowledgeItem,
  SarahMediaAjarContextDoc,
  SarahTextGeneratedResponse,
  appendSarahChatMessage,
  buildSarahChatUserId,
  callSarahAiEndpoint,
  cancelSarahAnalysisQueueGroup,
  createSarahChatSession,
  deleteSarahChatSession,
  enqueueSarahAnalysisRequest,
  formatFriendlySarahChatError,
  formatSarahDateTime,
  loadSarahSessionMessages,
  loadUserSarahChatSessions,
  logSarahStudentQuestion,
  retrieveSarahRagContext,
  subscribeToMediaAjarForSarah,
  subscribeToSarahConfig,
  subscribeToSarahKnowledgeBase,
} from '../utils/sarahFirestore';
import { SarahMarkdown } from './SarahMarkdown';
import {
  SARAH_AVATAR_ASSETS,
  SarahAvatarType,
  extractSarahResponseMetadata,
  resolveAvatarTypeFromReligion,
} from '../utils/sarahVisuals';
import { SarahEmojiPicker } from './SarahEmojiPicker';
import {
  buildStudentExamReviewBundle,
  SarahCompletedExamReview,
} from '../utils/sarahExamReview';
import {
  SARAH_EXAM_LOCK_MESSAGE,
  verifyHasilUjianSelesai,
} from '../utils/sarahExamAccess';
import { pickStudent3DStickerForReview } from '../utils/sarahStickers';

interface Props {
  activeUser: ActiveUser;
  students: Student[];
  subjects: Subject[];
  profile: SchoolProfile;
  activeExamStatus?: ActiveExamHeaderStatus | null;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isError?: boolean;
  retryPrompt?: string;
  retryExam?: SarahCompletedExamReview;
}

function normalizeKelas(raw?: string): string {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function doesExamMatchStudentClass(examKelas?: string, studentKelas?: string): boolean {
  const e = normalizeKelas(examKelas);
  const s = normalizeKelas(studentKelas);
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

export const SarahStudentWidget: React.FC<Props> = ({
  activeUser,
  students,
  subjects,
  profile,
  activeExamStatus,
  showToast,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [selectedMapel, setSelectedMapel] = useState('Umum');
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [statusLabel, setStatusLabel] = useState('');
  const [firestoreCheckState, setFirestoreCheckState] = useState<'idle' | 'checking' | 'verified' | 'locked'>('idle');
  const [analysisPhase, setAnalysisPhase] = useState<SarahAnalysisPhase>('idle');
  const wrongReviewAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      wrongReviewAbortRef.current?.abort();
      cancelSarahAnalysisQueueGroup('student_wrong_review');
    };
  }, []);
  const [cbtExams, setCbtExams] = useState<CBTExam[]>([]);
  const [sarahConfig, setSarahConfig] = useState<SarahConfigDoc>(DEFAULT_SARAH_CONFIG);
  const [knowledgeDocs, setKnowledgeDocs] = useState<SarahKnowledgeItem[]>([]);
  const [mediaAjarDocs, setMediaAjarDocs] = useState<SarahMediaAjarContextDoc[]>([]);

  const currentStudent = useMemo(() => {
    const ad = activeUser.studentData;
    return (
      students.find(
        (s) =>
          (ad?.id && s.id === ad.id) ||
          (ad?.nisn && s.nisn === ad.nisn) ||
          (activeUser.username &&
            (s.username || '').toLowerCase() === activeUser.username.toLowerCase())
      ) || ad
    );
  }, [activeUser, students]);

  const studentKelas = currentStudent?.kelas || activeUser.detail || 'Kelas SD';

  const sarahChatUserId = useMemo(
    () => buildSarahChatUserId(activeUser, currentStudent?.id || currentStudent?.nisn),
    [activeUser, currentStudent?.id, currentStudent?.nisn]
  );

  const buildWelcomeMessage = (): ChatMessage => ({
    id: 'sarah_welcome',
    role: 'model',
    text: `[STIKER_3D:3d_siswa_01]\n\nHalo Nak **${activeUser.name}**! Aku **SARAH**, teman belajarmu di SDN Rawa Badak Utara 21.\n\nJangan pernah malu bertanya ya, Nak. Mari kita pelajari pelan-pelan bersama SARAH dengan langkah demi langkah yang mudah dipahami. Ingat, aku akan membimbingmu menemukan sendiri jawabannya agar kamu makin hebat! Pelajaran apa yang ingin kita bahas hari ini?`,
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => [buildWelcomeMessage()]);
  const [activeAvatarType, setActiveAvatarType] = useState<SarahAvatarType>(() =>
    resolveAvatarTypeFromReligion(currentStudent?.agama)
  );
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [chatSessions, setChatSessions] = useState<SarahChatSessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingSessionMsgs, setIsLoadingSessionMsgs] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [examDataVersion, setExamDataVersion] = useState(0);
  const [isExamReviewOpen, setIsExamReviewOpen] = useState(false);
  const [pinnedReviewExamId, setPinnedReviewExamId] = useState<string | null>(null);

  useEffect(() => {
    setActiveAvatarType(resolveAvatarTypeFromReligion(currentStudent?.agama));
    setAvatarLoadError(false);
  }, [currentStudent?.agama]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const isExamRunningRef = useRef<boolean>(Boolean(activeExamStatus?.isRunning));
  const currentStudentRef = useRef<Student | undefined>(currentStudent);
  currentStudentRef.current = currentStudent;
  const cbtExamsRef = useRef<CBTExam[]>(cbtExams);
  cbtExamsRef.current = cbtExams;
  const handleSendRef = useRef<
    (e?: React.FormEvent, overridePrompt?: string, overrideExamId?: string | null) => void
  >(() => {});
  const handleRequestWrongReviewRef = useRef<(exam: SarahCompletedExamReview) => void>(() => {});

  useEffect(() => {
    const running = Boolean(activeExamStatus?.isRunning);
    isExamRunningRef.current = running;
    if (running) {
      setIsOpen(false);
      setIsInfoModalOpen(false);
      setIsExamReviewOpen(false);
    }
  }, [activeExamStatus?.isRunning]);

  const handleInsertStudentEmoji = (emoji: string) => {
    const el = chatInputRef.current;
    if (!el) {
      setInputText((prev) => `${prev}${emoji}`);
      return;
    }
    const start = el.selectionStart ?? inputText.length;
    const end = el.selectionEnd ?? inputText.length;
    const nextVal = `${inputText.slice(0, start)}${emoji}${inputText.slice(end)}`;
    setInputText(nextVal);
    requestAnimationFrame(() => {
      el.focus();
      const nextPos = start + emoji.length;
      el.setSelectionRange(nextPos, nextPos);
    });
  };

  useEffect(() => {
    const unsubCfg = subscribeToSarahConfig(setSarahConfig);
    const unsubExams = subscribeToCbtExamsCollection(setCbtExams);
    const unsubKb = subscribeToSarahKnowledgeBase(setKnowledgeDocs);
    const unsubMedia = subscribeToMediaAjarForSarah(setMediaAjarDocs);

    const bumpExamVersion = () => setExamDataVersion((v) => v + 1);
    window.addEventListener('sekolahku-exam-results-updated', bumpExamVersion);
    window.addEventListener('sekolahku-cbt-exams-updated', bumpExamVersion);
    window.addEventListener('sekolahku-tka-questions-updated', bumpExamVersion);
    window.addEventListener('sekolahku-cloud-sync-updated', bumpExamVersion);
    window.addEventListener('storage', bumpExamVersion);

    const handleOpenEvent = (ev: Event) => {
      if (isExamRunningRef.current) return;
      bumpExamVersion();
      setIsOpen(true);

      const customEv = ev as CustomEvent<{
        examId?: string;
        paketName?: string;
        mapel?: string;
        category?: 'cbt' | 'tka';
        autoRequestFeedback?: boolean;
        openReviewDrawer?: boolean;
      }>;
      const detail = customEv?.detail;
      if (!detail) return;

      if (detail.openReviewDrawer) {
        setIsExamReviewOpen(true);
      }

      const freshBundle = buildStudentExamReviewBundle(
        currentStudentRef.current,
        cbtExamsRef.current
      );

      let matchedCompleted: SarahCompletedExamReview | undefined;
      if (detail.examId) {
        matchedCompleted = freshBundle.completedExams.find(
          (e) => e.examId === detail.examId
        );
      }
      if (!matchedCompleted && (detail.paketName || detail.mapel)) {
        const targetPaket = String(detail.paketName || '').trim().toLowerCase();
        const targetMapel = String(detail.mapel || '').trim().toLowerCase();
        matchedCompleted = freshBundle.completedExams.find((e) => {
          const sameCat = !detail.category || e.category === detail.category;
          const paketMatch =
            !targetPaket ||
            e.paketName.toLowerCase().includes(targetPaket) ||
            e.judul.toLowerCase().includes(targetPaket);
          const mapelMatch =
            !targetMapel ||
            targetMapel === 'tka terpadu' ||
            e.mapel.toLowerCase().includes(targetMapel) ||
            targetMapel.includes(e.mapel.toLowerCase());
          return sameCat && paketMatch && mapelMatch;
        });
      }

      if (matchedCompleted) {
        setPinnedReviewExamId(matchedCompleted.examId);
        setIsExamReviewOpen(false);
        if (detail.autoRequestFeedback) {
          setTimeout(() => {
            handleRequestWrongReviewRef.current(matchedCompleted!);
          }, 120);
        }
      } else if (detail.examId || detail.paketName) {
        const isInUncompleted = freshBundle.uncompletedExams.some(
          (u) =>
            (detail.examId && u.examId === detail.examId) ||
            (detail.paketName &&
              u.paketName.toLowerCase() === String(detail.paketName).toLowerCase())
        );
        if (isInUncompleted || detail.autoRequestFeedback) {
          setMessages((prev) => [
            ...prev,
            {
              id: `lock_${Date.now()}`,
              role: 'model',
              text: `[STIKER_3D:3d_siswa_13]\n\n🔒 ${SARAH_EXAM_LOCK_MESSAGE}`,
            },
          ]);
          showToast(SARAH_EXAM_LOCK_MESSAGE, 'error');
        } else {
          setIsExamReviewOpen(true);
        }
      }
    };
    window.addEventListener('serbu21-open-tanya-sarah', handleOpenEvent);

    return () => {
      unsubCfg();
      unsubExams();
      unsubKb();
      unsubMedia();
      window.removeEventListener('sekolahku-exam-results-updated', bumpExamVersion);
      window.removeEventListener('sekolahku-cbt-exams-updated', bumpExamVersion);
      window.removeEventListener('sekolahku-tka-questions-updated', bumpExamVersion);
      window.removeEventListener('sekolahku-cloud-sync-updated', bumpExamVersion);
      window.removeEventListener('storage', bumpExamVersion);
      window.removeEventListener('serbu21-open-tanya-sarah', handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      setIsLoadingSessions(true);
      try {
        const sessions = await loadUserSarahChatSessions(sarahChatUserId);
        if (cancelled) return;
        setChatSessions(sessions);
        if (sessions.length > 0) {
          const latest = sessions[0];
          setActiveSessionId(latest.id);
          setIsLoadingSessionMsgs(true);
          const msgs = await loadSarahSessionMessages(latest.id);
          if (cancelled) return;
          if (msgs.length > 0) {
            setMessages(
              msgs.map((m) => ({
                id: m.id,
                role: m.sender === 'user' ? 'user' : 'model',
                text: m.text,
              }))
            );
          } else {
            setMessages([buildWelcomeMessage()]);
          }
        } else {
          setActiveSessionId(null);
          setMessages([buildWelcomeMessage()]);
        }
      } catch {
        // Keep welcome screen if offline
      } finally {
        if (!cancelled) {
          setIsLoadingSessions(false);
          setIsLoadingSessionMsgs(false);
        }
      }
    };
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [sarahChatUserId]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isThinking]);

  const examReviewBundle = useMemo(
    () => buildStudentExamReviewBundle(currentStudent, cbtExams),
    [currentStudent, cbtExams, examDataVersion]
  );

  const pinnedReviewExam = useMemo(
    () =>
      pinnedReviewExamId
        ? examReviewBundle.completedExams.find((e) => e.examId === pinnedReviewExamId) || null
        : null,
    [examReviewBundle.completedExams, pinnedReviewExamId]
  );

  // Tanya SARAH disembunyikan penuh saat siswa berada di ruang ujian aktif (`activeExamStatus?.isRunning`)
  // Ujian CBT & TKA yang BELUM dikerjakan tetap terkunci per-ujian agar anti-curang, sementara ujian yang SUDAH selesai boleh diulas.
  const isLockedForExam = Boolean(activeExamStatus?.isRunning);

  const mapelChoices = useMemo(() => {
    const base = subjects.map((s) => s.name).filter(Boolean);
    return Array.from(
      new Set([
        'Umum',
        ...base,
        'Bahasa Indonesia',
        'Matematika',
        'IPAS',
        'Pendidikan Pancasila',
        'Bahasa Inggris',
      ])
    );
  }, [subjects]);

  const inferTopikFromQuestion = (q: string) => {
    const clean = q.trim().replace(/\s+/g, ' ');
    return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
  };

  const handleCopyAnswer = async (text: string) => {
    try {
      const cleaned = extractSarahResponseMetadata(text)
        .cleanText.replace(/\[STIKER\s*:\s*[a-zA-Z0-9_]+\s*\]/gi, '')
        .replace(/\[REAL_STIKER\s*:\s*[a-zA-Z0-9_]+\s*\]/gi, '')
        .replace(/\[STIKER_3D\s*:\s*[a-zA-Z0-9_]+\s*\]/gi, '')
        .trim();
      await navigator.clipboard.writeText(cleaned);
      showToast('Jawaban SARAH berhasil disalin!', 'success');
    } catch {
      showToast('Gagal menyalin jawaban.', 'error');
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    if (!sessionId || isThinking) return;
    setActiveSessionId(sessionId);
    setIsHistoryOpen(false);
    setIsLoadingSessionMsgs(true);
    try {
      const msgs = await loadSarahSessionMessages(sessionId);
      if (msgs.length > 0) {
        setMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.sender === 'user' ? 'user' : 'model',
            text: m.text,
          }))
        );
      } else {
        setMessages([buildWelcomeMessage()]);
      }
    } catch {
      showToast('Gagal memuat riwayat percakapan.', 'error');
    } finally {
      setIsLoadingSessionMsgs(false);
    }
  };

  const handleNewChat = () => {
    if (isThinking) return;
    setActiveSessionId(null);
    setIsHistoryOpen(false);
    setMessages([buildWelcomeMessage()]);
    showToast('Obrolan baru dimulai. Yuk belajar bersama SARAH, Nak!', 'success');
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingSessionId) return;
    setDeletingSessionId(sessionId);
    try {
      await deleteSarahChatSession(sessionId);
      const remaining = chatSessions.filter((s) => s.id !== sessionId);
      setChatSessions(remaining);
      if (activeSessionId === sessionId) {
        if (remaining.length > 0) {
          await handleSelectSession(remaining[0].id);
        } else {
          setActiveSessionId(null);
          setMessages([buildWelcomeMessage()]);
        }
      }
      showToast('Riwayat percakapan berhasil dihapus.', 'success');
    } catch {
      showToast('Gagal menghapus riwayat percakapan.', 'error');
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleClearChat = () => {
    handleNewChat();
  };

  const handleSend = async (
    e?: React.FormEvent,
    overridePrompt?: string,
    overrideExamId?: string | null
  ) => {
    if (e) e.preventDefault();
    if (isLockedForExam) {
      showToast(
        'SARAH sedang beristirahat selama ujian CBT/TKA berlangsung. Selamat mengerjakan dengan jujur!',
        'error'
      );
      return;
    }

    const question = (overridePrompt ?? inputText).trim();
    if (!question || isThinking) return;

    const freshExamBundle = buildStudentExamReviewBundle(currentStudent, cbtExams);
    const activeExamIdToSend =
      overrideExamId !== undefined ? overrideExamId : pinnedReviewExamId;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: question,
    };

    const prevHistory = messages
      .filter((m) => !m.isError)
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, userMsg]);
    if (!overridePrompt) setInputText('');
    setIsThinking(true);
    setStatusLabel('SARAH sedang membaca data ujian & materi belajar...');

    let currentSessionId = activeSessionId;
    try {
      if (!currentSessionId) {
        const created = await createSarahChatSession({
          userId: sarahChatUserId,
          role: 'siswa',
          firstQuestion: question,
        });
        currentSessionId = created.id;
        setActiveSessionId(created.id);
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
          text: question,
        });
      }
    } catch {
      // Proceed even if auto-save encounters a temporary network glitch
    }

    try {
      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: studentKelas,
        mapel: selectedMapel === 'Umum' ? '' : selectedMapel,
        queryText: question,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
        sarahConfig,
        excludeBankSoal: true,
      });

      logSarahStudentQuestion({
        studentId: currentStudent?.id || activeUser.username,
        studentName: currentStudent?.nama || activeUser.name,
        nisn: currentStudent?.nisn || '',
        kelas: studentKelas,
        mata_pelajaran: selectedMapel,
        topik: inferTopikFromQuestion(question),
        pertanyaan: question,
      }).catch(() => {});

      const res = await callSarahAiEndpoint<SarahTextGeneratedResponse>(
        {
          mode: 'student_chat',
          role: 'siswa',
          user: {
            name: currentStudent?.nama || activeUser.name,
            kelas: studentKelas,
            agama: currentStudent?.agama || '',
          },
          params: {
            message: question,
            mapel: selectedMapel,
          },
          examReviewContext: {
            requestedExamId: activeExamIdToSend || undefined,
            completedExams: freshExamBundle.completedExams,
            uncompletedExams: freshExamBundle.uncompletedExams,
          },
          history: prevHistory,
          ragContext,
        },
        {
          timeoutMs: 24000,
          onStatusChange: (statusText) => setStatusLabel(statusText),
        }
      );

      const parsedMeta = extractSarahResponseMetadata(res.text);
      if (parsedMeta.avatarType) {
        setActiveAvatarType(parsedMeta.avatarType);
        setAvatarLoadError(false);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}`,
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
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'model',
          text: formatFriendlySarahChatError(err, 'siswa'),
          isError: true,
          retryPrompt: question,
        },
      ]);
    } finally {
      setIsThinking(false);
      setStatusLabel('');
    }
  };

  handleSendRef.current = handleSend;

  const handleCancelWrongReview = () => {
    wrongReviewAbortRef.current?.abort();
    cancelSarahAnalysisQueueGroup('student_wrong_review');
    setIsThinking(false);
    setAnalysisPhase('cancelled');
    setStatusLabel('Analisis SARAH dibatalkan.');
    showToast('Proses analisis SARAH dibatalkan.', 'success');
  };

  const handleRequestWrongReview = async (exam: SarahCompletedExamReview) => {
    if (isLockedForExam) {
      showToast(
        'SARAH sedang beristirahat selama ujian CBT/TKA berlangsung. Selamat mengerjakan dengan jujur!',
        'error'
      );
      return;
    }

    wrongReviewAbortRef.current?.abort();
    const controller = new AbortController();
    wrongReviewAbortRef.current = controller;

    setPinnedReviewExamId(exam.examId);
    setIsExamReviewOpen(false);

    const userPrompt = `Tanya SARAH soal yang masih salah pada [${exam.category.toUpperCase()}] "${exam.judul}" (Nilai saya: ${exam.score}/100)`;
    const userMsg: ChatMessage = {
      id: `u_rev_${Date.now()}`,
      role: 'user',
      text: userPrompt,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);
    setFirestoreCheckState('checking');
    setAnalysisPhase('cache_check');
    setStatusLabel('Memeriksa status ujian di Firestore...');

    let currentSessionId = activeSessionId;
    try {
      if (!currentSessionId) {
        const created = await createSarahChatSession({
          userId: sarahChatUserId,
          role: 'siswa',
          firstQuestion: userPrompt,
        });
        currentSessionId = created.id;
        setActiveSessionId(created.id);
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
          text: userPrompt,
        });
      }
    } catch {
      // Proceed even if auto-save fails
    }

    try {
      const verification = await verifyHasilUjianSelesai({
        student: currentStudentRef.current,
        idUjian: exam.examId,
        paketName: exam.paketName,
        mapel: exam.mapel,
      });

      if (controller.signal.aborted) return;

      if (!verification.allowed) {
        setFirestoreCheckState('locked');
        const lockReply = `[STIKER_3D:3d_siswa_13]\n\n🔒 ${verification.lockMessage || SARAH_EXAM_LOCK_MESSAGE}`;
        setMessages((prev) => [
          ...prev,
          {
            id: `m_lock_${Date.now()}`,
            role: 'model',
            text: lockReply,
          },
        ]);
        if (currentSessionId) {
          appendSarahChatMessage({
            sessionId: currentSessionId,
            sender: 'sarah',
            text: lockReply,
          }).catch(() => {});
        }
        return;
      }

      setFirestoreCheckState('verified');
      setStatusLabel('Memeriksa Result Cache (id_ujian, nisn)...');

      const wrongQuestions = exam.questions
        .filter((q) => !q.isCorrect)
        .map((q) => ({
          no: q.no,
          pertanyaan: q.pertanyaan,
          opsi: q.opsi,
          studentAnswer: q.studentAnswer,
          correctAnswer: q.correctAnswer,
          pembahasan: q.pembahasan,
        }));
      const correctNumbers = exam.questions
        .filter((q) => q.isCorrect)
        .map((q) => q.no);

      const ragContext = retrieveSarahRagContext({
        schoolName: profile.name,
        kelas: studentKelas,
        mapel: exam.mapel || '',
        queryText: `${exam.judul} ${exam.mapel}`,
        knowledgeDocs,
        mediaAjarDocs,
        subjects,
        sarahConfig,
        excludeBankSoal: true,
      });

      logSarahStudentQuestion({
        studentId: currentStudent?.id || activeUser.username,
        studentName: currentStudent?.nama || activeUser.name,
        nisn: currentStudent?.nisn || '',
        kelas: studentKelas,
        mata_pelajaran: exam.mapel || selectedMapel,
        topik: `Evaluasi Soal Salah: ${exam.judul}`,
        pertanyaan: userPrompt,
      }).catch(() => {});

      const studentNisnKey = (
        currentStudent?.nisn ||
        currentStudent?.id ||
        activeUser.username ||
        'siswa'
      ).trim();

      const res = await enqueueSarahAnalysisRequest<
        SarahTextGeneratedResponse & { cachedScore?: number }
      >({
        queueGroupKey: 'student_wrong_review',
        idUjian: exam.examId,
        nisn: studentNisnKey,
        cacheScope: 'student_wrong_review',
        timeoutMs: 24000,
        externalController: controller,
        validateCached: (cached) =>
          typeof cached.cachedScore !== 'number' || cached.cachedScore === exam.score,
        onPhaseChange: (phase, nextStatusText) => {
          setAnalysisPhase(phase);
          setStatusLabel(nextStatusText);
        },
        payload: {
          mode: 'student_wrong_review',
          role: 'siswa',
          user: {
            name: currentStudent?.nama || activeUser.name,
            nisn: studentNisnKey,
            kelas: studentKelas,
            agama: currentStudent?.agama || '',
          },
          params: {
            examStatus: 'selesai',
            studentName: currentStudent?.nama || activeUser.name,
            kelas: studentKelas,
            judul: exam.judul,
            mapel: exam.mapel,
            category: exam.category,
            score: exam.score,
            totalQuestions: exam.totalQuestions || exam.questions.length,
            wrongQuestions,
            correctNumbers,
          },
          ragContext,
        },
      });

      let replyText = res.text || '';
      if (!/\[STIKER_3D\s*:/i.test(replyText)) {
        const chosenSticker = pickStudent3DStickerForReview(exam.score, exam.mapel);
        replyText = `[STIKER_3D:${chosenSticker.id}]\n\n${replyText}`;
      }
      if (res.fromCache) {
        replyText = `${replyText}\n\n_⚡ Dimuat instan dari Result Cache (hash id_ujian + nisn) tanpa panggilan API berulang._`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `m_rev_${Date.now()}`,
          role: 'model',
          text: replyText,
        },
      ]);

      if (currentSessionId) {
        appendSarahChatMessage({
          sessionId: currentSessionId,
          sender: 'sarah',
          text: replyText,
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
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        setAnalysisPhase('cancelled');
        return;
      }
      setAnalysisPhase('error');
      setMessages((prev) => [
        ...prev,
        {
          id: `err_rev_${Date.now()}`,
          role: 'model',
          text: formatFriendlySarahChatError(err, 'siswa'),
          isError: true,
          retryExam: exam,
        },
      ]);
    } finally {
      if (wrongReviewAbortRef.current === controller) {
        wrongReviewAbortRef.current = null;
        setIsThinking(false);
        setStatusLabel('');
        setFirestoreCheckState('idle');
      }
    }
  };
  handleRequestWrongReviewRef.current = handleRequestWrongReview;

  // Hilangkan menu/widget Tanya SARAH sepenuhnya saat siswa sedang mengerjakan ujian CBT atau TKA
  if (activeExamStatus?.isRunning) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-[950] no-print flex flex-col items-end">
      {isOpen && (
        <div className="mb-3 w-[calc(100vw-2rem)] sm:w-[420px] h-[560px] max-h-[82vh] bg-white rounded-[2rem] shadow-2xl border-2 border-rose-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative">
          {/* Header */}
          <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-indigo-700 text-white p-4 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-white/20 border-2 border-white/50 flex items-center justify-center shrink-0 overflow-hidden shadow-xs relative">
                {isLockedForExam ? (
                  <Lock className="w-5 h-5 text-amber-200" />
                ) : !avatarLoadError ? (
                  <img
                    src={SARAH_AVATAR_ASSETS[activeAvatarType]}
                    alt="Avatar SARAH AI"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarLoadError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Sparkles className="w-5 h-5 text-amber-300" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-black text-sm leading-tight truncate">
                  Tanya SARAH
                </h3>
                <p className="text-[11px] text-rose-100 truncate">
                  {isLockedForExam
                    ? 'Mode Ujian — SARAH Istirahat'
                    : `Tutor Sokratik SD • ${studentKelas}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsInfoModalOpen(true)}
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-pink-100 transition cursor-pointer"
                title="Tentang & Dedikasi SARAH"
              >
                <Heart className="w-4 h-4 fill-pink-200 text-pink-200" />
              </button>
              {!isLockedForExam && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition cursor-pointer"
                  title="Hapus Obrolan"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition cursor-pointer"
                title="Kecilkan Tanya SARAH"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Info Modal inside Widget */}
          {isInfoModalOpen && (
            <div className="absolute inset-0 z-20 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-5">
              <div className="bg-white rounded-3xl p-5 shadow-xl border-2 border-rose-200 text-center space-y-3 w-full">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center mx-auto">
                  <Heart className="w-6 h-6 fill-white" />
                </div>
                <h4 className="font-display font-black text-sm text-slate-900">
                  Tentang SARAH
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {sarahConfig.attribution || SARAH_ATTRIBUTION_TEXT}
                </p>
                <button
                  type="button"
                  onClick={() => setIsInfoModalOpen(false)}
                  className="w-full py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

          {/* CBT Lock State vs Active Tutor */}
          {isLockedForExam ? (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4 bg-amber-50/60">
              <div className="w-16 h-16 rounded-3xl bg-amber-100 border-2 border-amber-300 text-amber-700 flex items-center justify-center shadow-sm">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-2 max-w-xs">
                <span className="inline-block text-[10px] font-black uppercase px-3 py-1 rounded-full bg-amber-200/80 text-amber-950">
                  Kunci Ujian CBT Aktif
                </span>
                <p className="font-display font-black text-sm text-slate-900 leading-relaxed">
                  SARAH sedang beristirahat selama ujian CBT berlangsung. Selamat mengerjakan dengan jujur!
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Setelah sesi ujian CBT untuk kelasmu selesai atau dinonaktifkan oleh guru, SARAH akan kembali siap menemanimu belajar.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Subject Selector, Exam Feedback & History Controls */}
              <div className="px-3.5 py-2 bg-rose-50/70 border-b border-rose-100 flex flex-wrap items-center justify-between gap-1.5 shrink-0 relative">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExamReviewOpen(false);
                      setIsHistoryOpen((p) => !p);
                    }}
                    className="px-2 py-1 rounded-xl bg-white hover:bg-rose-100/70 border border-rose-200 text-rose-800 text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                    title="Lihat Riwayat Percakapan"
                  >
                    <History className="w-3 h-3 text-rose-600" />
                    <span>Riwayat ({chatSessions.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsHistoryOpen(false);
                      setIsExamReviewOpen((p) => !p);
                    }}
                    className={`px-2 py-1 rounded-xl border text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition whitespace-nowrap ${
                      isExamReviewOpen || pinnedReviewExam
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white hover:bg-indigo-50 border-indigo-200 text-indigo-800'
                    }`}
                    title="Minta masukan ujian CBT & TKA yang sudah dikerjakan"
                  >
                    <ClipboardCheck className="w-3 h-3" />
                    <span>Masukan Ujian ({examReviewBundle.completedExams.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleNewChat}
                    disabled={isThinking}
                    className="px-2 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition disabled:opacity-50 whitespace-nowrap"
                    title="Mulai Obrolan Baru"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Baru</span>
                  </button>
                </div>

                <select
                  value={selectedMapel}
                  onChange={(e) => setSelectedMapel(e.target.value)}
                  className="px-2 py-1 rounded-xl border border-rose-200 bg-white text-[10px] font-bold text-slate-700 outline-none max-w-[120px]"
                >
                  {mapelChoices.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                {/* Collapsible Masukan Ujian CBT & TKA Drawer (Completion-Gated Anti-Cheat) */}
                {isExamReviewOpen && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-white border-b-2 border-indigo-200 shadow-xl max-h-72 overflow-y-auto p-3 space-y-2.5">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <span className="text-[10px] font-black uppercase text-indigo-900 flex items-center gap-1">
                        <ClipboardCheck className="w-3.5 h-3.5 text-indigo-600" />
                        Ulasan Ujian CBT &amp; TKA (Anti-Curang)
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsExamReviewOpen(false)}
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Sudah Dikerjakan — Masukan SARAH Terbuka ({examReviewBundle.completedExams.length})
                      </p>
                      {examReviewBundle.completedExams.length === 0 ? (
                        <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                          Belum ada ujian CBT maupun TKA yang selesai kamu kerjakan. Kerjakan ujian lebih dahulu agar SARAH dapat mengulas jawabanmu ya, Nak!
                        </p>
                      ) : (
                        examReviewBundle.completedExams.map((ex) => (
                          <div
                            key={ex.examId}
                            className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${
                              pinnedReviewExamId === ex.examId
                                ? 'bg-indigo-50 border-indigo-300'
                                : 'bg-emerald-50/50 border-emerald-200'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-slate-900 truncate" title={ex.judul}>
                                [{ex.category.toUpperCase()}] {ex.judul}
                              </p>
                              <p className="text-[10px] text-slate-600 tabular-nums">
                                Nilai: <strong className="text-emerald-700">{ex.score}/100</strong> · Benar {ex.correctCount}/{ex.totalQuestions || ex.questions.length} soal
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={isThinking}
                              onClick={() => {
                                void handleRequestWrongReview(ex);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] whitespace-nowrap cursor-pointer shrink-0 disabled:opacity-50"
                            >
                              Tanya Soal Salah
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {examReviewBundle.uncompletedExams.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        <p className="text-[10px] font-black text-amber-800 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Belum Dikerjakan — Terkunci Ketat ({examReviewBundle.uncompletedExams.length})
                        </p>
                        {examReviewBundle.uncompletedExams.slice(0, 8).map((u) => (
                          <button
                            key={u.examId}
                            type="button"
                            onClick={() =>
                              showToast(
                                `Ujian "${u.judul}" belum kamu kerjakan, Nak. Kerjakan dengan jujur terlebih dahulu ya!`,
                                'error'
                              )
                            }
                            className="w-full text-left p-2 rounded-xl border border-amber-200 bg-amber-50/50 flex items-center justify-between gap-2 opacity-85 hover:opacity-100 cursor-not-allowed"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-slate-700 truncate">
                                [{u.category.toUpperCase()}] {u.judul}
                              </p>
                              <p className="text-[10px] text-amber-800">
                                Terkunci sampai ujian selesai dikumpulkan
                              </p>
                            </div>
                            <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsible Riwayat Percakapan Dropdown */}
                {isHistoryOpen && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-white border-b-2 border-rose-200 shadow-xl max-h-64 overflow-y-auto p-3 space-y-1.5">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                      <span className="text-[10px] font-black uppercase text-slate-600 flex items-center gap-1">
                        <HeartHandshake className="w-3 h-3 text-rose-600" />
                        Riwayat Percakapan ({chatSessions.length}/{SARAH_MAX_CHAT_SESSIONS})
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsHistoryOpen(false)}
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {isLoadingSessions ? (
                      <div className="py-3 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                        <span>Memuat riwayat...</span>
                      </div>
                    ) : chatSessions.length === 0 ? (
                      <p className="py-3 text-center text-[11px] text-slate-500">
                        Belum ada riwayat obrolan tersimpan. Pertanyaanmu akan tersimpan otomatis!
                      </p>
                    ) : (
                      chatSessions.map((sess) => {
                        const isActive = sess.id === activeSessionId;
                        return (
                          <div
                            key={sess.id}
                            onClick={() => handleSelectSession(sess.id)}
                            role="button"
                            tabIndex={0}
                            className={`p-2 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition ${
                              isActive
                                ? 'bg-rose-50 border-rose-300'
                                : 'bg-slate-50 border-slate-200 hover:bg-rose-50/40'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-slate-800 truncate">
                                {sess.judul_sesi}
                              </p>
                              <p className="text-[9px] text-slate-500 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                <span>
                                  {formatSarahDateTime(sess.updated_at || sess.created_at)}
                                </span>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSession(sess.id, e)}
                              disabled={deletingSessionId === sess.id}
                              title="Hapus Riwayat"
                              aria-label="Hapus Riwayat"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-100 cursor-pointer shrink-0 disabled:opacity-40"
                            >
                              {deletingSessionId === sess.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {pinnedReviewExam && (
                <div className="px-3.5 py-1.5 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between gap-2 text-[11px] shrink-0">
                  <span className="font-bold text-indigo-900 truncate">
                    Mengulas [{pinnedReviewExam.category.toUpperCase()}]: {pinnedReviewExam.judul} ({pinnedReviewExam.score}/100)
                  </span>
                  <button
                    type="button"
                    onClick={() => setPinnedReviewExamId(null)}
                    className="text-indigo-700 hover:text-indigo-950 font-black text-[10px] whitespace-nowrap cursor-pointer"
                  >
                    Lepas
                  </button>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/70">
                {isLoadingSessionMsgs ? (
                  <div className="h-full flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                    <span>Memuat obrolan terakhirmu...</span>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-2xs ${
                          msg.role === 'user'
                            ? 'bg-rose-600 text-white rounded-br-sm text-xs font-medium leading-relaxed'
                            : msg.isError
                            ? 'bg-amber-50/90 border border-amber-200 text-amber-950 rounded-bl-sm space-y-2'
                            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm space-y-2'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        ) : msg.isError ? (
                          <>
                            <p className="text-xs leading-relaxed">{msg.text}</p>
                            {(msg.retryPrompt || msg.retryExam) && (
                              <div className="flex justify-end pt-1 border-t border-amber-200/70">
                                <button
                                  type="button"
                                  disabled={isThinking}
                                  onClick={() => {
                                    if (msg.retryExam) {
                                      void handleRequestWrongReview(msg.retryExam);
                                    } else if (msg.retryPrompt) {
                                      void handleSend(undefined, msg.retryPrompt);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                                >
                                  <RotateCcw className="w-2.5 h-2.5" />
                                  <span>Coba Kirim Ulang</span>
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <SarahMarkdown content={msg.text} compact userMode="siswa" />
                            <div className="flex justify-end pt-1 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => handleCopyAnswer(msg.text)}
                                className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                              >
                                <Copy className="w-2.5 h-2.5" />
                                <span>Salin Jawaban</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {isThinking && (
                  <div className="flex justify-start">
                    <div className="w-full max-w-[92%] bg-white border border-indigo-200 rounded-2xl rounded-bl-sm p-3 space-y-2 shadow-2xs">
                      {firestoreCheckState !== 'idle' && (
                        <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1.5">
                          <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>
                            {firestoreCheckState === 'checking'
                              ? 'Tahap 1: Verifikasi jawaban Firestore (Instan)...'
                              : firestoreCheckState === 'verified'
                              ? '✓ Tahap 1: Jawaban tersimpan & terverifikasi di Firestore (Instan)'
                              : '🔒 Tahap 1: Ujian belum selesai di Firestore'}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-xl px-2.5 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {analysisPhase === 'cached_hit' ? (
                            <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          ) : (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                          )}
                          <span className="truncate">
                            {statusLabel || 'Tahap 2: SARAH menganalisis secara async...'}
                          </span>
                        </div>
                        {wrongReviewAbortRef.current && (
                          <button
                            type="button"
                            onClick={handleCancelWrongReview}
                            className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                            title="Batalkan antrean analisis SARAH"
                          >
                            <StopCircle className="w-3 h-3" />
                            <span>Batal</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Learning Prompts */}
              <div className="px-3 py-1.5 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto shrink-0">
                {[
                  'Jelaskan konsep materi ini dengan contoh mudah',
                  'Beri aku petunjuk langkah pertama mengerjakan soal',
                  'Hubungkan pelajaran ini dengan 7 Kebiasaan Hebat',
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isThinking}
                    onClick={() => handleSend(undefined, chip)}
                    className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold whitespace-nowrap cursor-pointer transition disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form
                onSubmit={handleSend}
                className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
              >
                <SarahEmojiPicker
                  onSelectEmoji={handleInsertStudentEmoji}
                  disabled={isThinking}
                  compact
                />
                <input
                  ref={chatInputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={isThinking}
                  placeholder="Tanyakan materi yang belum kamu pahami, Nak..."
                  className="flex-1 px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-rose-600 outline-none text-xs text-slate-800"
                />
                <button
                  type="submit"
                  disabled={isThinking || !inputText.trim()}
                  className="w-10 h-10 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-sm transition cursor-pointer disabled:opacity-40 shrink-0"
                  title="Kirim pertanyaan ke SARAH"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group flex items-center gap-2.5 px-4 py-3 rounded-full shadow-xl border-2 transition cursor-pointer ${
          isLockedForExam
            ? 'bg-amber-500 hover:bg-amber-600 border-amber-200 text-white'
            : 'bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 border-white text-white'
        }`}
      >
        {isOpen ? (
          <X className="w-5 h-5" />
        ) : isLockedForExam ? (
          <Lock className="w-5 h-5" />
        ) : (
          <MessageCircleHeart className="w-5 h-5" />
        )}
        <span className="font-display font-black text-xs sm:text-sm">
          {isOpen ? 'Tutup SARAH' : isLockedForExam ? 'SARAH (Mode Ujian)' : 'Tanya SARAH'}
        </span>
      </button>
    </div>
  );
};
