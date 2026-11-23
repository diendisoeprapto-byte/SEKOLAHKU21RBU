import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { ActiveUser, CBTQuestion, Subject } from '../types';

export type SarahKategori =
  | 'RPP/Modul Ajar'
  | 'Bank Soal'
  | 'Materi Ajar'
  | 'Kebijakan Sekolah';

export interface SarahKnowledgeItem {
  id: string;
  judul: string;
  kategori: SarahKategori;
  kelas: string;
  mata_pelajaran: string;
  konten_ringkasan: string;
  sumber: string;
  disetujui_oleh: string;
  created_at?: Timestamp | Date | string | number | null;
}

export interface SarahStudentLogItem {
  id: string;
  studentId: string;
  studentName: string;
  nisn?: string;
  kelas: string;
  mata_pelajaran?: string;
  topik: string;
  pertanyaan: string;
  created_at?: Timestamp | Date | string | number | null;
}

export interface SarahMediaAjarContextDoc {
  id: string;
  judul: string;
  kelas: string;
  mapel: string;
  bab?: string;
  pertemuan?: string;
  guru_nama?: string;
}

export interface SarahConfigDoc {
  name: string;
  fullName: string;
  attribution: string;
  personaNote: string;
  studentGreetingStyle: string;
  teacherStyle: string;
  updatedAt?: any;
}

export type SarahChatRole = 'guru' | 'siswa';

export interface SarahChatSessionItem {
  id: string;
  user_id: string;
  role: SarahChatRole;
  judul_sesi: string;
  created_at?: Timestamp | Date | string | number | null;
  updated_at?: Timestamp | Date | string | number | null;
}

export interface SarahChatMessageDoc {
  id: string;
  sender: 'user' | 'sarah';
  text: string;
  timestamp?: Timestamp | Date | string | number | null;
}

export const SARAH_KB_COLLECTION = 'sarah_knowledge_base';
export const SARAH_STUDENT_LOGS_COLLECTION = 'sarah_student_logs';
export const SARAH_CHAT_SESSIONS_COLLECTION = 'sarah_chat_sessions';
export const SARAH_MAX_CHAT_SESSIONS = 20;
export const SARAH_MAX_CHAT_MESSAGES = 30;
export const MEDIA_AJAR_COLLECTION = 'media_ajar';
export const SARAH_CONFIG_DOC_PATH = 'sarah_config';

export const SARAH_ATTRIBUTION_TEXT =
  'SARAH — Sistem Asisten Adaptif, Ramah, Amanah & Humanis. Dipersembahkan dengan penuh kasih sayang untuk dunia pendidikan dan sebagai kenangan abadi bagi keluarga.';

export const DEFAULT_SARAH_CONFIG: SarahConfigDoc = {
  name: 'SARAH',
  fullName: 'Sistem Asisten Adaptif, Ramah, Amanah & Humanis',
  attribution: SARAH_ATTRIBUTION_TEXT,
  personaNote:
    'Berkepribadian lembut, sabar, santun, penuh kasih sayang, dan berjiwa welas asih seperti sosok seorang ibu yang membimbing anaknya dengan tulus dan membantu rekan guru dengan penuh keteladanan serta menanamkan nilai 7 Kebiasaan Anak Indonesia Hebat.',
  studentGreetingStyle:
    'Sapaan hangat seperti "Halo Nak...", "Hebat sekali pertanyaanmu...", "Mari kita pelajari pelan-pelan bersama SARAH...", tidak menghakimi, dan membimbing secara Sokratik.',
  teacherStyle:
    'Bahasa Indonesia sopan, suportif, empatik, dan terstruktur rapi sesuai Kurikulum Merdeka.',
};

export function subscribeToSarahConfig(
  onUpdate: (cfg: SarahConfigDoc) => void
): () => void {
  try {
    return onSnapshot(
      doc(db, 'settings', SARAH_CONFIG_DOC_PATH),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<SarahConfigDoc>;
          onUpdate({
            ...DEFAULT_SARAH_CONFIG,
            ...data,
          });
        } else {
          onUpdate(DEFAULT_SARAH_CONFIG);
        }
      },
      () => {
        onUpdate(DEFAULT_SARAH_CONFIG);
      }
    );
  } catch {
    return () => {};
  }
}

export async function syncSarahConfigToFirestore(
  partial?: Partial<SarahConfigDoc>,
  updatedBy?: string
): Promise<void> {
  try {
    const ref = doc(db, 'settings', SARAH_CONFIG_DOC_PATH);
    const existing = await getDoc(ref);
    if (!existing.exists() || partial) {
      await setDoc(
        ref,
        {
          ...DEFAULT_SARAH_CONFIG,
          ...(existing.exists() ? existing.data() : {}),
          ...(partial || {}),
          updatedBy: updatedBy || 'system',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn('Sync settings/sarah_config info:', err);
  }
}

export function resolveTimestampMillis(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val?.seconds === 'number') return val.seconds * 1000;
  return 0;
}

export function formatSarahDateTime(val: any): string {
  const ms = resolveTimestampMillis(val);
  if (!ms) return '-';
  return new Date(ms).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function subscribeToSarahKnowledgeBase(
  onUpdate: (items: SarahKnowledgeItem[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    return onSnapshot(
      collection(db, SARAH_KB_COLLECTION),
      (snap) => {
        const list: SarahKnowledgeItem[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          list.push({
            id: d.id,
            judul: String(data.judul || 'Tanpa Judul'),
            kategori: (data.kategori as SarahKategori) || 'Materi Ajar',
            kelas: String(data.kelas || 'Semua'),
            mata_pelajaran: String(data.mata_pelajaran || 'Umum'),
            konten_ringkasan: String(data.konten_ringkasan || ''),
            sumber: String(data.sumber || 'Kurasi Guru'),
            disetujui_oleh: String(data.disetujui_oleh || 'Guru'),
            created_at: data.created_at || null,
          });
        });
        list.sort(
          (a, b) => resolveTimestampMillis(b.created_at) - resolveTimestampMillis(a.created_at)
        );
        onUpdate(list);
      },
      (err) => {
        console.warn('SARAH KB listener warning:', err?.message);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('Gagal subscribe sarah_knowledge_base:', err);
    return () => {};
  }
}

export async function addSarahKnowledgeItem(
  payload: Omit<SarahKnowledgeItem, 'id' | 'created_at'>
): Promise<string> {
  const docId = `kb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const cleanData = {
    id: docId,
    judul: payload.judul.trim().slice(0, 280),
    kategori: payload.kategori,
    kelas: (payload.kelas || 'Semua').trim().slice(0, 40),
    mata_pelajaran: (payload.mata_pelajaran || 'Umum').trim().slice(0, 120),
    konten_ringkasan: payload.konten_ringkasan.trim().slice(0, 38000),
    sumber: (payload.sumber || 'Asisten SARAH').trim().slice(0, 160),
    disetujui_oleh: (payload.disetujui_oleh || 'Guru').trim().slice(0, 120),
    created_at: serverTimestamp(),
  };
  await setDoc(doc(db, SARAH_KB_COLLECTION, docId), cleanData);
  return docId;
}

export async function deleteSarahKnowledgeItem(docId: string): Promise<void> {
  await deleteDoc(doc(db, SARAH_KB_COLLECTION, docId));
}

export function subscribeToSarahStudentLogs(
  onUpdate: (logs: SarahStudentLogItem[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    return onSnapshot(
      collection(db, SARAH_STUDENT_LOGS_COLLECTION),
      (snap) => {
        const list: SarahStudentLogItem[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          list.push({
            id: d.id,
            studentId: String(data.studentId || ''),
            studentName: String(data.studentName || 'Siswa'),
            nisn: String(data.nisn || ''),
            kelas: String(data.kelas || '-'),
            mata_pelajaran: String(data.mata_pelajaran || 'Umum'),
            topik: String(data.topik || 'Diskusi Belajar'),
            pertanyaan: String(data.pertanyaan || ''),
            created_at: data.created_at || null,
          });
        });
        list.sort(
          (a, b) => resolveTimestampMillis(b.created_at) - resolveTimestampMillis(a.created_at)
        );
        onUpdate(list);
      },
      (err) => {
        console.warn('SARAH student logs listener warning:', err?.message);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('Gagal subscribe sarah_student_logs:', err);
    return () => {};
  }
}

export async function logSarahStudentQuestion(
  entry: Omit<SarahStudentLogItem, 'id' | 'created_at'>
): Promise<void> {
  try {
    const ref = await addDoc(collection(db, SARAH_STUDENT_LOGS_COLLECTION), {
      id: `log_${Date.now()}`,
      studentId: String(entry.studentId || 'anon').slice(0, 100),
      studentName: String(entry.studentName || 'Siswa').slice(0, 120),
      nisn: String(entry.nisn || '').slice(0, 40),
      kelas: String(entry.kelas || '-').slice(0, 40),
      mata_pelajaran: String(entry.mata_pelajaran || 'Umum').slice(0, 100),
      topik: String(entry.topik || 'Pertanyaan Belajar').slice(0, 180),
      pertanyaan: String(entry.pertanyaan || '').slice(0, 2800),
      created_at: serverTimestamp(),
    });
    await setDoc(doc(db, SARAH_STUDENT_LOGS_COLLECTION, ref.id), { id: ref.id }, { merge: true });
  } catch (err) {
    console.warn('Gagal mencatat log pertanyaan siswa SARAH:', err);
  }
}

export function buildSarahChatUserId(
  activeUser: Pick<ActiveUser, 'role' | 'username' | 'name' | 'studentData'>,
  studentFallbackId?: string
): string {
  if (activeUser.role === 'siswa') {
    const raw =
      studentFallbackId ||
      activeUser.studentData?.id ||
      activeUser.studentData?.nisn ||
      activeUser.username ||
      activeUser.name ||
      'siswa';
    return `siswa_${String(raw).trim().toLowerCase().replace(/\s+/g, '_')}`.slice(0, 150);
  }
  const raw = activeUser.username || activeUser.name || activeUser.role;
  return `${activeUser.role}_${String(raw).trim().toLowerCase().replace(/\s+/g, '_')}`.slice(0, 150);
}

export function generateSarahSessionTitle(firstQuestion: string): string {
  const words = String(firstQuestion || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return 'Obrolan Baru bersama SARAH';
  const picked = words.slice(0, 6).join(' ');
  const suffix = words.length > 6 ? '...' : '';
  return `${picked}${suffix}`.slice(0, 160);
}

export async function loadUserSarahChatSessions(
  userId: string
): Promise<SarahChatSessionItem[]> {
  if (!userId) return [];
  const colRef = collection(db, SARAH_CHAT_SESSIONS_COLLECTION);

  let snap;
  try {
    const qOrdered = query(
      colRef,
      where('user_id', '==', userId),
      orderBy('updated_at', 'desc'),
      limit(SARAH_MAX_CHAT_SESSIONS)
    );
    snap = await getDocs(qOrdered);
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (err?.code === 'failed-precondition' || msg.includes('index')) {
      const qFallback = query(
        colRef,
        where('user_id', '==', userId),
        limit(SARAH_MAX_CHAT_SESSIONS)
      );
      snap = await getDocs(qFallback);
    } else {
      throw err;
    }
  }

  const sessions: SarahChatSessionItem[] = [];
  snap.forEach((d) => {
    const data = d.data() as any;
    sessions.push({
      id: d.id,
      user_id: String(data.user_id || userId),
      role: data.role === 'siswa' ? 'siswa' : 'guru',
      judul_sesi: String(data.judul_sesi || 'Percakapan SARAH'),
      created_at: data.created_at || null,
      updated_at: data.updated_at || data.created_at || null,
    });
  });

  sessions.sort(
    (a, b) =>
      resolveTimestampMillis(b.updated_at || b.created_at) -
      resolveTimestampMillis(a.updated_at || a.created_at)
  );

  return sessions.slice(0, SARAH_MAX_CHAT_SESSIONS);
}

export async function loadSarahSessionMessages(
  sessionId: string
): Promise<SarahChatMessageDoc[]> {
  if (!sessionId) return [];
  const msgsRef = collection(db, SARAH_CHAT_SESSIONS_COLLECTION, sessionId, 'messages');
  const qMsgs = query(msgsRef, orderBy('timestamp', 'desc'), limit(SARAH_MAX_CHAT_MESSAGES));
  const snap = await getDocs(qMsgs);
  const items: SarahChatMessageDoc[] = [];
  snap.forEach((d) => {
    const data = d.data() as any;
    items.push({
      id: d.id,
      sender: data.sender === 'user' ? 'user' : 'sarah',
      text: String(data.text || ''),
      timestamp: data.timestamp || null,
    });
  });
  return items.reverse();
}

export async function createSarahChatSession(params: {
  userId: string;
  role: SarahChatRole;
  firstQuestion: string;
}): Promise<SarahChatSessionItem> {
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const judul_sesi = generateSarahSessionTitle(params.firstQuestion);
  const ref = doc(db, SARAH_CHAT_SESSIONS_COLLECTION, sessionId);
  await setDoc(ref, {
    user_id: params.userId.slice(0, 160),
    role: params.role,
    judul_sesi,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  return {
    id: sessionId,
    user_id: params.userId,
    role: params.role,
    judul_sesi,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

export async function appendSarahChatMessage(params: {
  sessionId: string;
  sender: 'user' | 'sarah';
  text: string;
}): Promise<string> {
  const cleanText = String(params.text || '').trim().slice(0, 39000);
  if (!cleanText) return '';
  const msgRef = await addDoc(
    collection(db, SARAH_CHAT_SESSIONS_COLLECTION, params.sessionId, 'messages'),
    {
      sender: params.sender,
      text: cleanText,
      timestamp: serverTimestamp(),
    }
  );
  await setDoc(
    doc(db, SARAH_CHAT_SESSIONS_COLLECTION, params.sessionId),
    { updated_at: serverTimestamp() },
    { merge: true }
  );
  return msgRef.id;
}

export async function deleteSarahChatSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  const msgsRef = collection(db, SARAH_CHAT_SESSIONS_COLLECTION, sessionId, 'messages');
  const snap = await getDocs(query(msgsRef, limit(100)));
  if (!snap.empty) {
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, SARAH_CHAT_SESSIONS_COLLECTION, sessionId));
}

export function subscribeToMediaAjarForSarah(
  onUpdate: (docs: SarahMediaAjarContextDoc[]) => void
): () => void {
  try {
    return onSnapshot(
      collection(db, MEDIA_AJAR_COLLECTION),
      (snap) => {
        const list: SarahMediaAjarContextDoc[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          list.push({
            id: d.id,
            judul: String(data.judul || ''),
            kelas: String(data.kelas || ''),
            mapel: String(data.mapel || ''),
            bab: String(data.bab || ''),
            pertemuan: String(data.pertemuan || ''),
            guru_nama: String(data.guru_nama || ''),
          });
        });
        onUpdate(list);
      },
      () => {}
    );
  } catch {
    return () => {};
  }
}

function extractGradeDigit(raw?: string): string {
  const m = String(raw || '').match(/([1-6])/);
  return m ? m[1] : '';
}

export function retrieveSarahRagContext(params: {
  schoolName: string;
  kelas?: string;
  mapel?: string;
  queryText?: string;
  knowledgeDocs: SarahKnowledgeItem[];
  mediaAjarDocs: SarahMediaAjarContextDoc[];
  subjects?: Subject[];
  sarahConfig?: SarahConfigDoc;
  excludeBankSoal?: boolean;
}) {
  const targetDigit = extractGradeDigit(params.kelas);
  const queryTokens = `${params.queryText || ''} ${params.mapel || ''}`
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const scoreDoc = (text: string, docKelas?: string, docMapel?: string) => {
    let score = 0;
    const lower = text.toLowerCase();
    const dDigit = extractGradeDigit(docKelas);
    if (targetDigit && dDigit === targetDigit) score += 5;
    if (String(docKelas || '').toLowerCase() === 'semua') score += 2;
    if (
      params.mapel &&
      docMapel &&
      docMapel.toLowerCase().includes(params.mapel.toLowerCase())
    ) {
      score += 5;
    }
    queryTokens.forEach((tok) => {
      if (lower.includes(tok)) score += 3;
    });
    return score;
  };

  const eligibleKbDocs = params.excludeBankSoal
    ? params.knowledgeDocs.filter(
        (docItem) =>
          !String(docItem.kategori || '')
            .toLowerCase()
            .includes('bank soal')
      )
    : params.knowledgeDocs;

  const rankedKb = [...eligibleKbDocs]
    .map((docItem) => ({
      docItem,
      score: scoreDoc(
        `${docItem.judul} ${docItem.mata_pelajaran} ${docItem.konten_ringkasan}`,
        docItem.kelas,
        docItem.mata_pelajaran
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => ({
      judul: x.docItem.judul,
      kategori: x.docItem.kategori,
      kelas: x.docItem.kelas,
      mata_pelajaran: x.docItem.mata_pelajaran,
      konten_ringkasan: x.docItem.konten_ringkasan.slice(0, 1200),
      sumber: x.docItem.sumber,
    }));

  const rankedMedia = [...params.mediaAjarDocs]
    .map((m) => ({
      m,
      score: scoreDoc(`${m.judul} ${m.mapel} ${m.bab || ''}`, m.kelas, m.mapel),
    }))
    .filter((x) => !targetDigit || extractGradeDigit(x.m.kelas) === targetDigit || x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => ({
      judul: x.m.judul,
      kelas: x.m.kelas,
      mapel: x.m.mapel,
      bab: x.m.bab || '',
      pertemuan: x.m.pertemuan || '',
      guru_nama: x.m.guru_nama || '',
    }));

  const subjectsList = (params.subjects || []).slice(0, 12).map((s) => ({
    name: s.name,
    tp: Array.isArray(s.tujuanPembelajaran) ? s.tujuanPembelajaran.slice(0, 3).join('; ') : '',
  }));

  return {
    schoolName: params.schoolName || 'SDN Rawa Badak Utara 21',
    activeClass: params.kelas || '',
    knowledgeDocs: rankedKb,
    mediaAjarDocs: rankedMedia,
    subjectsList,
    sarahConfig: params.sarahConfig
      ? { personaNote: params.sarahConfig.personaNote }
      : undefined,
  };
}

export interface SarahCbtGeneratedResponse {
  mode: 'cbt_generator';
  ringkasan: string;
  questions: CBTQuestion[];
}

export interface SarahTextGeneratedResponse {
  mode: string;
  text: string;
  model?: string;
}

export interface SarahImageGeneratedResponse {
  mode: 'image_generator';
  title: string;
  caption: string;
  styleTag: string;
  gaya: string;
  rasio: string;
  width: number;
  height: number;
  svgCode: string;
}

export interface SarahIllustrationAsset extends SarahImageGeneratedResponse {
  id: string;
  svgDataUrl: string;
  pngDataUrl?: string;
  createdAt: number;
}

export function svgToDataUrl(svgCode: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgCode)}`;
}

export async function rasterizeSvgToPngDataUrl(
  svgCode: string,
  width = 800,
  height = 600
): Promise<string> {
  const dataUrl = svgToDataUrl(svgCode);
  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(320, width * scale);
        canvas.height = Math.max(240, height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('');
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

const SARAH_AI_MAX_CONCURRENT = 3;
let sarahAiInFlightCount = 0;
const sarahAiWaitQueue: Array<() => void> = [];
const sarahMemoryCache = new Map<string, { value: any; cachedAt: number }>();
const SARAH_CACHE_LOCAL_PREFIX = 'serbu21_sarah_ai_cache_';
const SARAH_CACHE_TTL_MS = 1000 * 60 * 45; // 45 menit untuk ulasan soal / analisis

export type SarahAnalysisPhase =
  | 'idle'
  | 'cache_check'
  | 'queued'
  | 'analyzing'
  | 'cached_hit'
  | 'done'
  | 'cancelled'
  | 'error';

export interface CallSarahAiOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  cacheKey?: string;
  bypassCache?: boolean;
  validateCached?: (cached: any) => boolean;
  onStatusChange?: (statusText: string) => void;
  onPhaseChange?: (phase: SarahAnalysisPhase, statusText: string) => void;
}

function fnv1aHexFallback(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Menghasilkan hash deterministik dari pasangan (id_ujian, nisn)
 * untuk Result Caching hasil analisis SARAH di sisi klien.
 */
export async function computeSarahResultCacheHash(
  idUjian: string,
  nisn: string,
  extraScope: string = ''
): Promise<string> {
  const normExam = String(idUjian || '').trim().toLowerCase();
  const normNisn = String(nisn || '').trim().toLowerCase();
  const normScope = String(extraScope || '').trim().toLowerCase();
  const raw = `${normExam}::${normNisn}${normScope ? `::${normScope}` : ''}`;

  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const encoded = new TextEncoder().encode(raw);
      const digest = await window.crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);
    }
  } catch {
    // Fallback ke FNV-1a jika subtle crypto tidak tersedia
  }
  return fnv1aHexFallback(raw);
}

function readSarahResponseCache<T>(cacheKey?: string): T | null {
  if (!cacheKey) return null;
  const now = Date.now();
  const mem = sarahMemoryCache.get(cacheKey);
  if (mem && now - mem.cachedAt < SARAH_CACHE_TTL_MS) {
    return mem.value as T;
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(`${SARAH_CACHE_LOCAL_PREFIX}${cacheKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && now - Number(parsed.cachedAt || 0) < SARAH_CACHE_TTL_MS && parsed.value) {
          sarahMemoryCache.set(cacheKey, parsed);
          return parsed.value as T;
        }
      }
    } catch {
      // ignore storage errors
    }
  }
  return null;
}

function writeSarahResponseCache(cacheKey: string | undefined, value: any): void {
  if (!cacheKey || !value) return;
  const entry = { value, cachedAt: Date.now() };
  sarahMemoryCache.set(cacheKey, entry);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(`${SARAH_CACHE_LOCAL_PREFIX}${cacheKey}`, JSON.stringify(entry));
    } catch {
      // ignore quota error
    }
  }
}

async function acquireSarahQueueSlot(
  signal?: AbortSignal,
  onStatusChange?: (statusText: string) => void,
  onPhaseChange?: (phase: SarahAnalysisPhase, statusText: string) => void
): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException('Permintaan dibatalkan.', 'AbortError');
  }
  if (sarahAiInFlightCount < SARAH_AI_MAX_CONCURRENT) {
    sarahAiInFlightCount += 1;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const position = sarahAiWaitQueue.length + 1;
    const waitMsg = `Menunggu antrean layanan SARAH (#${position})...`;
    onStatusChange?.(waitMsg);
    onPhaseChange?.('queued', waitMsg);
    const wake = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      sarahAiInFlightCount += 1;
      resolve();
    };
    const onAbort = () => {
      const idx = sarahAiWaitQueue.indexOf(wake);
      if (idx >= 0) sarahAiWaitQueue.splice(idx, 1);
      reject(new DOMException('Permintaan dibatalkan oleh pengguna.', 'AbortError'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    sarahAiWaitQueue.push(wake);
  });
}

function releaseSarahQueueSlot(): void {
  sarahAiInFlightCount = Math.max(0, sarahAiInFlightCount - 1);
  const next = sarahAiWaitQueue.shift();
  if (next) {
    next();
  }
}

export async function callSarahAiEndpoint<T = SarahTextGeneratedResponse>(
  payload: Record<string, any>,
  options: CallSarahAiOptions = {}
): Promise<T & { fromCache?: boolean }> {
  const {
    signal,
    timeoutMs = 24000,
    cacheKey,
    bypassCache = false,
    validateCached,
    onStatusChange,
    onPhaseChange,
  } = options;

  if (cacheKey && !bypassCache) {
    onPhaseChange?.('cache_check', 'Memeriksa Result Cache (id_ujian, nisn)...');
    const cached = readSarahResponseCache<T>(cacheKey);
    if (cached && (!validateCached || validateCached(cached))) {
      onPhaseChange?.('cached_hit', 'Hasil analisis dimuat instan dari Result Cache.');
      return {
        ...cached,
        fromCache: true,
      };
    }
  }

  await acquireSarahQueueSlot(signal, onStatusChange, onPhaseChange);
  try {
    const maxAttempts = 2;
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) {
        throw new DOMException('Permintaan ke SARAH dibatalkan.', 'AbortError');
      }
      if (attempt > 0) {
        const retryMsg = 'Menghubungkan ulang ke SARAH AI...';
        onStatusChange?.(retryMsg);
        onPhaseChange?.('analyzing', retryMsg);
        await new Promise((resolve) => setTimeout(resolve, 450));
      }

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      const forwardAbort = () => controller.abort();
      if (signal) {
        signal.addEventListener('abort', forwardAbort, { once: true });
      }

      try {
        const analyzeMsg = 'SARAH sedang menganalisis secara async (gemini-3.8-flash)...';
        onStatusChange?.(analyzeMsg);
        onPhaseChange?.('analyzing', analyzeMsg);

        const response = await fetch('/.netlify/functions/sarah-ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        let data: any = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (response.ok) {
          writeSarahResponseCache(cacheKey, data);
          onPhaseChange?.(
            data?.fromCache ? 'cached_hit' : 'done',
            data?.fromCache
              ? 'Hasil analisis dimuat dari Result Cache server.'
              : 'Analisis SARAH selesai.'
          );
          return data as T & { fromCache?: boolean };
        }

        const errMsg = sanitizeSarahErrorMessage(
          data?.error || `Permintaan ke layanan SARAH gagal (HTTP ${response.status}).`
        );
        // Server sudah menjalankan fallback multi-model; hanya retry di klien bila gangguan gateway 502
        const isTransientGateway = response.status === 502;
        lastErr = new Error(errMsg);

        if (!isTransientGateway || attempt === maxAttempts - 1) {
          throw lastErr;
        }
      } catch (err: any) {
        if (timedOut) {
          lastErr = new Error(
            'Koneksi ke layanan SARAH AI sedang padat sehingga waktu tunggu habis. Silakan coba kirim ulang sebentar lagi.'
          );
          if (attempt === maxAttempts - 1) throw lastErr;
        } else if (err?.name === 'AbortError' || signal?.aborted) {
          onPhaseChange?.('cancelled', 'Proses analisis SARAH dibatalkan.');
          throw new DOMException('Permintaan ke SARAH dibatalkan.', 'AbortError');
        } else {
          const isNetworkError = err instanceof TypeError;
          lastErr = new Error(
            sanitizeSarahErrorMessage(
              err instanceof Error ? err.message : 'Gagal terhubung ke layanan SARAH.'
            )
          );
          if (!isNetworkError || attempt === maxAttempts - 1) {
            throw lastErr;
          }
        }
      } finally {
        clearTimeout(timer);
        if (signal) {
          signal.removeEventListener('abort', forwardAbort);
        }
      }
    }

    throw lastErr || new Error('Layanan SARAH AI sedang mengalami kendala koneksi sementara.');
  } finally {
    releaseSarahQueueSlot();
  }
}

export function sanitizeSarahErrorMessage(rawMessage?: unknown): string {
  const raw =
    typeof rawMessage === 'string'
      ? rawMessage.trim()
      : rawMessage instanceof Error
      ? String(rawMessage.message || '').trim()
      : '';

  if (!raw) {
    return 'Koneksi ke layanan SARAH AI sedang mengalami gangguan sementara. Silakan coba kirim ulang ya.';
  }

  const lower = raw.toLowerCase();

  // Pertahankan pesan domain aplikasi yang memang sudah ramah berbahasa Indonesia
  if (lower.includes('belum menyelesaikan ujiannya')) {
    return raw;
  }

  if (
    lower.includes('no longer available') ||
    lower.includes('not available to new users') ||
    lower.includes('update your code to use') ||
    lower.includes('models/') ||
    lower.includes('gemini-') ||
    lower.includes('model not found') ||
    lower.includes('deprecated')
  ) {
    return 'Layanan model SARAH AI sedang disinkronkan atau beralih ke jalur cadangan sementara. Silakan coba kirim ulang sebentar lagi.';
  }

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('batas waktu') ||
    lower.includes('504')
  ) {
    return 'Koneksi ke layanan SARAH AI sedang padat sehingga waktu tunggu habis. Silakan coba kirim ulang sebentar lagi.';
  }

  if (
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('429') ||
    lower.includes('batas penggunaan') ||
    lower.includes('batas antrean')
  ) {
    return 'Antrean permintaan ke layanan SARAH AI sedang penuh sementara. Silakan tunggu sejenak lalu coba kirim ulang.';
  }

  if (
    lower.includes('overloaded') ||
    lower.includes('high demand') ||
    lower.includes('unavailable') ||
    lower.includes('503')
  ) {
    return 'Server layanan SARAH AI sedang padat sementara. Silakan coba kirim ulang beberapa detik lagi.';
  }

  if (
    lower.includes('api_key') ||
    lower.includes('api key') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated') ||
    lower.includes('401') ||
    lower.includes('403')
  ) {
    return 'Konfigurasi akses layanan SARAH AI di server sedang perlu diperiksa. Silakan coba beberapa saat lagi.';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('fetch failed') ||
    lower.includes('econn') ||
    lower.includes('http ') ||
    raw.startsWith('{') ||
    raw.includes('{"error"') ||
    raw.length > 180
  ) {
    return 'Koneksi ke server SARAH AI sedang mengalami kendala sementara. Silakan coba kirim ulang sebentar lagi.';
  }

  return raw;
}

export function formatFriendlySarahChatError(
  rawError: unknown,
  audience: 'endi' | 'guru' | 'siswa'
): string {
  const cleanDetail = sanitizeSarahErrorMessage(rawError);
  const lower = cleanDetail.toLowerCase();

  if (lower.includes('belum menyelesaikan ujiannya')) {
    return `🔒 ${cleanDetail}`;
  }

  const isBusyOrTimeout =
    lower.includes('padat') ||
    lower.includes('waktu tunggu') ||
    lower.includes('antrean') ||
    lower.includes('penuh');

  if (audience === 'endi') {
    if (isBusyOrTimeout) {
      return 'Maaf ya Mas Endi, layanan SARAH sedang sedikit padat dan butuh waktu sebentar. Mas silakan tekan tombol Coba Kirim Ulang di bawah ya 😊';
    }
    if (lower.includes('model') || lower.includes('konfigurasi')) {
      return 'Maaf ya Mas Endi, sambungan ke server SARAH AI sedang disinkronkan sementara. Mas boleh klik tombol Coba Kirim Ulang beberapa saat lagi ya 😊';
    }
    return 'Maaf ya Mas Endi, SARAH mengalami kendala koneksi sebentar saat menjawab pesan Mas. Yuk klik tombol Coba Kirim Ulang di bawah ya 😊';
  }

  if (audience === 'siswa') {
    if (isBusyOrTimeout) {
      return 'Maaf ya Nak, teman-teman sedang ramai bertanya sehingga SARAH perlu antre sebentar. Yuk klik tombol Coba Kirim Ulang di bawah ya! 😊';
    }
    return 'Maaf ya Nak, SARAH sedang mengalami kendala koneksi sebentar. Yuk tekan tombol Coba Kirim Ulang di bawah ya! 😊';
  }

  if (isBusyOrTimeout) {
    return 'Mohon maaf Bapak/Ibu, antrean layanan SARAH AI sedang padat sementara. Silakan klik tombol Coba Kirim Ulang beberapa detik lagi.';
  }
  return 'Mohon maaf Bapak/Ibu, koneksi ke layanan SARAH AI sedang mengalami kendala sementara. Silakan klik tombol Coba Kirim Ulang beberapa saat lagi.';
}

const activeAnalysisControllers = new Map<string, AbortController>();

export function cancelSarahAnalysisQueueGroup(queueGroupKey: string): void {
  const existing = activeAnalysisControllers.get(queueGroupKey);
  if (existing) {
    existing.abort();
    activeAnalysisControllers.delete(queueGroupKey);
  }
}

/**
 * Sistem Antrean (Queue) berbasis AbortController khusus modul analisis SARAH
 * dengan Result Caching berdasarkan hash SHA-256 dari (id_ujian, nisn).
 */
export async function enqueueSarahAnalysisRequest<T = SarahTextGeneratedResponse>(params: {
  queueGroupKey: string;
  idUjian: string;
  nisn: string;
  cacheScope?: string;
  payload: Record<string, any>;
  bypassCache?: boolean;
  validateCached?: (cached: T) => boolean;
  timeoutMs?: number;
  externalController?: AbortController;
  onPhaseChange?: (phase: SarahAnalysisPhase, statusText: string) => void;
}): Promise<T & { fromCache?: boolean; resultCacheHash: string }> {
  const resultCacheHash = await computeSarahResultCacheHash(
    params.idUjian,
    params.nisn,
    params.cacheScope || ''
  );

  // Batalkan antrean sebelumnya pada grup analisis yang sama agar tidak terjadi tabrakan / wait response menumpuk
  cancelSarahAnalysisQueueGroup(params.queueGroupKey);

  const controller = params.externalController || new AbortController();
  activeAnalysisControllers.set(params.queueGroupKey, controller);

  try {
    const res = await callSarahAiEndpoint<T>(
      {
        ...params.payload,
        params: {
          ...(params.payload.params || {}),
          id_ujian: params.idUjian,
          nisn: params.nisn,
          resultCacheHash,
        },
      },
      {
        signal: controller.signal,
        timeoutMs: params.timeoutMs ?? 28000,
        cacheKey: resultCacheHash,
        bypassCache: params.bypassCache,
        validateCached: params.validateCached,
        onPhaseChange: params.onPhaseChange,
      }
    );

    return {
      ...res,
      resultCacheHash,
    };
  } finally {
    if (activeAnalysisControllers.get(params.queueGroupKey) === controller) {
      activeAnalysisControllers.delete(params.queueGroupKey);
    }
  }
}

function escapeHtmlForDoc(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isTableSeparatorLine(line: string): boolean {
  return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(line.trim());
}

function parseTableCellsLine(rowLine: string): string[] {
  return rowLine
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function markdownToPrintableHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  let i = 0;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  const formatInline = (text: string) =>
    escapeHtmlForDoc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      i++;
      continue;
    }

    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      closeList();
      const headers = parseTableCellsLine(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        rows.push(parseTableCellsLine(lines[i]));
        i++;
      }
      out.push('<table><thead><tr>');
      headers.forEach((h) => out.push(`<th>${formatInline(h)}</th>`));
      out.push('</tr></thead><tbody>');
      rows.forEach((r) => {
        out.push('<tr>');
        headers.forEach((_, cIdx) => out.push(`<td>${formatInline(r[cIdx] || '')}</td>`));
        out.push('</tr>');
      });
      out.push('</tbody></table>');
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeList();
      out.push(`<h3>${formatInline(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      closeList();
      out.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      closeList();
      out.push(`<h1>${formatInline(trimmed.slice(2))}</h1>`);
    } else if (trimmed === '---' || trimmed === '***') {
      closeList();
      out.push('<hr />');
    } else if (/^[-*•]\s+/.test(trimmed)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${formatInline(trimmed.replace(/^[-*•]\s+/, ''))}</li>`);
    } else if (/^\d+\.\s+/.test(trimmed)) {
      closeList();
      out.push(`<p><strong>${formatInline(trimmed)}</strong></p>`);
    } else {
      closeList();
      out.push(`<p>${formatInline(trimmed)}</p>`);
    }
    i++;
  }
  closeList();
  return out.join('\n');
}

export function exportSarahToWordDoc(params: {
  title: string;
  subtitle?: string;
  markdownContent: string;
  schoolName?: string;
  author?: string;
  illustration?: {
    title: string;
    caption?: string;
    pngDataUrl?: string;
    svgDataUrl?: string;
  } | null;
}) {
  const bodyHtml = markdownToPrintableHtml(params.markdownContent);
  const safeImgSrc =
    params.illustration?.pngDataUrl &&
    params.illustration.pngDataUrl.startsWith('data:image/png;base64,')
      ? params.illustration.pngDataUrl
      : '';
  const illustrationHtml = safeImgSrc
    ? `<div class="illustration-box">
        <img src="${safeImgSrc}" alt="${escapeHtmlForDoc(params.illustration?.title || 'Ilustrasi Pembelajaran')}" style="max-width: 520px; width: 100%; height: auto; border-radius: 10px; border: 1px solid #e2e8f0;" />
        ${
          params.illustration?.caption
            ? `<div class="illustration-caption"><strong>${escapeHtmlForDoc(params.illustration.title)}</strong> — ${escapeHtmlForDoc(params.illustration.caption)}</div>`
            : ''
        }
      </div>`
    : '';

  const fullHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtmlForDoc(params.title)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1e293b; }
  h1 { font-size: 16pt; color: #be123c; border-bottom: 2px solid #be123c; padding-bottom: 6px; }
  h2 { font-size: 13pt; color: #0f172a; margin-top: 14px; }
  h3 { font-size: 11.5pt; color: #334155; margin-top: 10px; }
  p { margin: 5px 0; }
  ul { margin: 4px 0 8px 18px; }
  li { margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { border: 1px solid #94a3b8; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 10.5pt; }
  th { background-color: #f1f5f9; font-weight: bold; }
  .meta { font-size: 9.5pt; color: #475569; margin-bottom: 14px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; }
  .illustration-box { text-align: center; margin: 12px 0 16px 0; padding: 10px; background: #fff8f9; border: 1px solid #fecdd3; border-radius: 8px; }
  .illustration-caption { font-size: 9.5pt; color: #475569; margin-top: 6px; }
</style>
</head>
<body>
  <h1>${escapeHtmlForDoc(params.title)}</h1>
  <div class="meta">
    <div><strong>Sekolah:</strong> ${escapeHtmlForDoc(params.schoolName || 'SDN Rawa Badak Utara 21')}</div>
    ${params.subtitle ? `<div><strong>Keterangan:</strong> ${escapeHtmlForDoc(params.subtitle)}</div>` : ''}
    ${params.author ? `<div><strong>Disusun oleh:</strong> ${escapeHtmlForDoc(params.author)}</div>` : ''}
  </div>
  ${illustrationHtml}
  ${bodyHtml}
</body>
</html>`;

  const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = params.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  a.href = url;
  a.download = `${safeName || 'dokumen_sarah'}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
