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
  SarahConfigDoc,
  SarahKnowledgeItem,
  SarahMediaAjarContextDoc,
  SarahTextGeneratedResponse,
  callSarahAiEndpoint,
  logSarahStudentQuestion,
  retrieveSarahRagContext,
  subscribeToMediaAjarForSarah,
  subscribeToSarahConfig,
  subscribeToSarahKnowledgeBase,
} from '../utils/sarahFirestore';
import { SarahMarkdown } from './SarahMarkdown';

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

  const buildWelcomeMessage = (): ChatMessage => ({
    id: 'sarah_welcome',
    role: 'model',
    text: `Halo Nak **${activeUser.name}**! Aku **SARAH**, teman belajarmu di SDN Rawa Badak Utara 21.\n\nJangan pernah malu bertanya ya, Nak. Mari kita pelajari pelan-pelan bersama SARAH dengan langkah demi langkah yang mudah dipahami. Ingat, aku akan membimbingmu menemukan sendiri jawabannya agar kamu makin hebat! Pelajaran apa yang ingin kita bahas hari ini?`,
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => [buildWelcomeMessage()]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubCfg = subscribeToSarahConfig(setSarahConfig);
    const unsubExams = subscribeToCbtExamsCollection(setCbtExams);
    const unsubKb = subscribeToSarahKnowledgeBase(setKnowledgeDocs);
    const unsubMedia = subscribeToMediaAjarForSarah(setMediaAjarDocs);

    const handleOpenEvent = () => setIsOpen(true);
    window.addEventListener('serbu21-open-tanya-sarah', handleOpenEvent);

    return () => {
      unsubCfg();
      unsubExams();
      unsubKb();
      unsubMedia();
      window.removeEventListener('serbu21-open-tanya-sarah', handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isThinking]);

  // Automatic CBT Exam Lock (CBT LOCK)
  const isLockedForExam = useMemo(() => {
    if (activeExamStatus?.isRunning) return true;
    return cbtExams.some(
      (ex) => ex.aktif === true && doesExamMatchStudentClass(ex.kelas, studentKelas)
    );
  }, [activeExamStatus?.isRunning, cbtExams, studentKelas]);

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
      await navigator.clipboard.writeText(text);
      showToast('Jawaban SARAH berhasil disalin!', 'success');
    } catch {
      showToast('Gagal menyalin jawaban.', 'error');
    }
  };

  const handleClearChat = () => {
    setMessages([buildWelcomeMessage()]);
    showToast('Obrolan dibersihkan. Yuk mulai topik belajar baru, Nak!', 'success');
  };

  const handleSend = async (e?: React.FormEvent, overridePrompt?: string) => {
    if (e) e.preventDefault();
    if (isLockedForExam) {
      showToast(
        'SARAH sedang beristirahat selama ujian CBT berlangsung. Selamat mengerjakan dengan jujur!',
        'error'
      );
      return;
    }

    const question = (overridePrompt ?? inputText).trim();
    if (!question || isThinking) return;

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
    setStatusLabel('SARAH sedang membaca basis data sekolah...');

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

      const res = await callSarahAiEndpoint<SarahTextGeneratedResponse>({
        mode: 'student_chat',
        role: 'siswa',
        user: {
          name: currentStudent?.nama || activeUser.name,
          kelas: studentKelas,
        },
        params: {
          message: question,
          mapel: selectedMapel,
        },
        history: prevHistory,
        ragContext,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}`,
          role: 'model',
          text: res.text,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'model',
          text: `Maaf ya Nak, SARAH sedang mengalami kendala koneksi sebentar (${err?.message || 'coba lagi'}).`,
          isError: true,
          retryPrompt: question,
        },
      ]);
    } finally {
      setIsThinking(false);
      setStatusLabel('');
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[950] no-print flex flex-col items-end">
      {isOpen && (
        <div className="mb-3 w-[calc(100vw-2rem)] sm:w-[420px] h-[560px] max-h-[82vh] bg-white rounded-[2rem] shadow-2xl border-2 border-rose-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative">
          {/* Header */}
          <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-indigo-700 text-white p-4 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
                {isLockedForExam ? (
                  <Lock className="w-5 h-5 text-amber-200" />
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
              {/* Subject Selector & Anti-Cheat Badge */}
              <div className="px-4 py-2.5 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-rose-800">
                  <HeartHandshake className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>7 Kebiasaan Hebat &amp; Sokratik</span>
                </div>
                <select
                  value={selectedMapel}
                  onChange={(e) => setSelectedMapel(e.target.value)}
                  className="px-2.5 py-1 rounded-xl border border-rose-200 bg-white text-[11px] font-bold text-slate-700 outline-none max-w-[165px]"
                >
                  {mapelChoices.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/70">
                {messages.map((msg) => (
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
                          {msg.retryPrompt && (
                            <div className="flex justify-end pt-1 border-t border-amber-200/70">
                              <button
                                type="button"
                                disabled={isThinking}
                                onClick={() => handleSend(undefined, msg.retryPrompt)}
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
                          <SarahMarkdown content={msg.text} compact />
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
                ))}

                {isThinking && (
                  <div className="flex justify-start">
                    <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2 text-xs font-bold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      <span>{statusLabel || 'SARAH sedang membaca basis data sekolah...'}</span>
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
                <input
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
