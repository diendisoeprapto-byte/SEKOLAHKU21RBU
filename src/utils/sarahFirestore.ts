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

export async function callSarahAiEndpoint<T = SarahTextGeneratedResponse>(
  payload: Record<string, any>
): Promise<T> {
  const maxAttempts = 2;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 900));
    }

    try {
      const response = await fetch('/.netlify/functions/sarah-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok) {
        return data as T;
      }

      const errMsg =
        data?.error || `Permintaan ke layanan SARAH gagal (HTTP ${response.status}).`;
      const isTransientStatus = [502, 503, 504].includes(response.status);
      lastErr = new Error(errMsg);

      if (!isTransientStatus || attempt === maxAttempts - 1) {
        throw lastErr;
      }
    } catch (err: any) {
      const isNetworkError = err instanceof TypeError;
      lastErr = err instanceof Error ? err : new Error('Gagal terhubung ke layanan SARAH.');
      if (!isNetworkError || attempt === maxAttempts - 1) {
        throw lastErr;
      }
    }
  }

  throw lastErr || new Error('Permintaan ke layanan SARAH gagal.');
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
