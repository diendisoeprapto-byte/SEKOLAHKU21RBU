import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { ActiveUser, Student } from '../types';
import { db } from './firebase';
import { isEndiSoepraptoUser } from './sarahAttachments';
import { getStoredCBTResults, getStoredTKAResults, getStoredTKASubmissions } from './storage';

export const SARAH_EXAM_LOCK_MESSAGE =
  'Maaf ya, SARAH belum bisa membuka pembahasan atau analisis soal ini karena kamu belum menyelesaikan ujiannya di CBT/TKA. Silakan kerjakan dan kirim jawabanmu terlebih dahulu!';

export interface HasilUjianRecord {
  id: string; // `${nisn}_${id_ujian}`
  nisn: string;
  id_ujian: string;
  studentId: string;
  nama_siswa: string;
  kelas: string;
  category: 'cbt' | 'tka';
  mapel: string;
  paketName: string;
  judul: string;
  status: 'mengerjakan' | 'selesai';
  skor: number;
  total_soal: number;
  no_soal_betul: number[];
  no_soal_salah: number[];
  jawaban_siswa: Record<string, any>;
  waktu_selesai: string;
  updatedAt: string;
}

export interface SarahExamLockVerificationResult {
  allowed: boolean;
  source: 'firestore_hasil_ujian' | 'backfilled_from_submission' | 'locked';
  record?: HasilUjianRecord | null;
  lockMessage?: string;
}

const LOCAL_HASIL_UJIAN_CACHE_KEY = 'serbu21_hasil_ujian_cache_v1';
const LOCAL_ENDI_PRIVATE_CHATS_KEY = 'serbu21_endi_private_chats_v1';

export function buildHasilUjianDocId(nisnOrStudentId: string, idUjian: string): string {
  const cleanNisn = String(nisnOrStudentId || 'anon')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanExam = String(idUjian || 'ujian')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${cleanNisn}_${cleanExam}`.slice(0, 150);
}

function readLocalHasilUjianCache(): Record<string, HasilUjianRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_HASIL_UJIAN_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalHasilUjianCache(docId: string, record: HasilUjianRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const map = readLocalHasilUjianCache();
    map[docId] = record;
    const keys = Object.keys(map);
    if (keys.length > 80) {
      keys
        .sort((a, b) => (map[a]?.updatedAt || '').localeCompare(map[b]?.updatedAt || ''))
        .slice(0, keys.length - 80)
        .forEach((k) => delete map[k]);
    }
    window.localStorage.setItem(LOCAL_HASIL_UJIAN_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export function removeLocalHasilUjianCacheEntries(docIds: string[]): void {
  if (typeof window === 'undefined' || !Array.isArray(docIds) || docIds.length === 0) return;
  try {
    const map = readLocalHasilUjianCache();
    let changed = false;
    docIds.forEach((id) => {
      if (id && id in map) {
        delete map[id];
        changed = true;
      }
    });
    if (changed) {
      window.localStorage.setItem(LOCAL_HASIL_UJIAN_CACHE_KEY, JSON.stringify(map));
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Menyimpan hasil ujian ke Firestore koleksi `hasil_ujian` dengan key `${nisn}_${id_ujian}`
 * secara non-blocking agar siswa tidak mengalami "wait response" saat selesai ujian.
 */
export async function saveHasilUjianToFirestore(payload: {
  nisn: string;
  id_ujian: string;
  studentId: string;
  nama_siswa: string;
  kelas: string;
  category: 'cbt' | 'tka';
  mapel: string;
  paketName: string;
  judul: string;
  status: 'mengerjakan' | 'selesai';
  skor: number;
  total_soal: number;
  no_soal_betul: number[];
  no_soal_salah: number[];
  jawaban_siswa: Record<string, any>;
  waktu_selesai?: string;
}): Promise<HasilUjianRecord> {
  const keyIdentifier = payload.nisn?.trim() || payload.studentId?.trim() || 'siswa';
  const docId = buildHasilUjianDocId(keyIdentifier, payload.id_ujian);
  const nowIso = new Date().toISOString();

  const record: HasilUjianRecord = {
    id: docId,
    nisn: String(payload.nisn || '').trim() || keyIdentifier,
    id_ujian: String(payload.id_ujian || '').trim(),
    studentId: String(payload.studentId || '').trim(),
    nama_siswa: String(payload.nama_siswa || '').trim(),
    kelas: String(payload.kelas || '').trim(),
    category: payload.category,
    mapel: String(payload.mapel || '').trim(),
    paketName: String(payload.paketName || '').trim(),
    judul: String(payload.judul || '').trim(),
    status: payload.status,
    skor: Number.isFinite(payload.skor) ? Math.round(payload.skor) : 0,
    total_soal: Number(payload.total_soal) || 0,
    no_soal_betul: Array.isArray(payload.no_soal_betul) ? payload.no_soal_betul : [],
    no_soal_salah: Array.isArray(payload.no_soal_salah) ? payload.no_soal_salah : [],
    jawaban_siswa:
      payload.jawaban_siswa && typeof payload.jawaban_siswa === 'object'
        ? payload.jawaban_siswa
        : {},
    waktu_selesai: payload.waktu_selesai || new Date().toLocaleTimeString('id-ID'),
    updatedAt: nowIso,
  };

  writeLocalHasilUjianCache(docId, record);

  try {
    await setDoc(
      doc(db, 'hasil_ujian', docId),
      {
        ...record,
        serverTime: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[hasil_ujian] Cloud sync tertunda (tersimpan di cache lokal):', err);
  }

  return record;
}

/**
 * Aturan Penguncian Akses Ketat (Strict Access Control):
 * Memeriksa dokumen `hasil_ujian` dengan kunci `${nisn}_${id_ujian}` di Firestore.
 * Hanya membuka akses apabila `status === "selesai"`.
 */
export async function verifyHasilUjianSelesai(params: {
  student?: Student | null;
  nisn?: string;
  idUjian: string;
  paketName?: string;
  mapel?: string;
}): Promise<SarahExamLockVerificationResult> {
  const idUjian = String(params.idUjian || '').trim();
  const nisn = String(params.student?.nisn || params.nisn || '').trim();
  const studentId = String(params.student?.id || '').trim();

  if (!idUjian || (!nisn && !studentId)) {
    return {
      allowed: false,
      source: 'locked',
      lockMessage: SARAH_EXAM_LOCK_MESSAGE,
    };
  }

  const candidateIds = Array.from(
    new Set(
      [
        nisn ? buildHasilUjianDocId(nisn, idUjian) : '',
        studentId ? buildHasilUjianDocId(studentId, idUjian) : '',
      ].filter(Boolean)
    )
  );

  // 1. Cek langsung ke Firebase Firestore `hasil_ujian/${nisn}_${id_ujian}`
  for (const docId of candidateIds) {
    try {
      const snap = await Promise.race([
        getDoc(doc(db, 'hasil_ujian', docId)),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4500)),
      ]);
      if (snap && snap.exists()) {
        const data = snap.data() as HasilUjianRecord;
        if (data?.status === 'selesai') {
          writeLocalHasilUjianCache(docId, data);
          return {
            allowed: true,
            source: 'firestore_hasil_ujian',
            record: data,
          };
        }
        // Dokumen ada tapi status !== "selesai" (misal masih "mengerjakan") -> BLOKIR KETAT!
        return {
          allowed: false,
          source: 'locked',
          record: data,
          lockMessage: SARAH_EXAM_LOCK_MESSAGE,
        };
      }
    } catch {
      // Fallback ke pengecekan cache / bukti submit lokal yang sah
    }
  }

  // 2. Cek cache lokal hasil_ujian yang baru disubmit secara non-blocking
  const localCache = readLocalHasilUjianCache();
  for (const docId of candidateIds) {
    const cached = localCache[docId];
    if (cached && cached.status === 'selesai') {
      return {
        allowed: true,
        source: 'firestore_hasil_ujian',
        record: cached,
      };
    }
  }

  // 3. Cek bukti pengiriman historis resmi (cbt_results / tka_results / tka_submissions)
  // untuk data ujian yang sudah dikerjakan sebelum migrasi koleksi `hasil_ujian`.
  const allLocalResults = [...getStoredCBTResults(), ...getStoredTKAResults()];
  const matchedLegacy = allLocalResults.find((r) => {
    const belongs =
      (studentId && r.studentId === studentId) ||
      (nisn && r.nisn && r.nisn.trim() === nisn) ||
      (params.student?.nama &&
        r.studentName &&
        r.studentName.trim().toLowerCase() === params.student.nama.trim().toLowerCase());
    if (!belongs) return false;
    if (r.examId === idUjian) return true;
    if (
      params.paketName &&
      params.mapel &&
      (r.paketName || '').toLowerCase() === params.paketName.toLowerCase() &&
      (r.mapel || '').toLowerCase() === params.mapel.toLowerCase()
    ) {
      return true;
    }
    return false;
  });

  if (matchedLegacy) {
    const backfilled = await saveHasilUjianToFirestore({
      nisn: nisn || studentId,
      id_ujian: idUjian,
      studentId: studentId || matchedLegacy.studentId,
      nama_siswa: params.student?.nama || matchedLegacy.studentName || 'Siswa',
      kelas: params.student?.kelas || matchedLegacy.kelas || '-',
      category: matchedLegacy.category === 'tka' ? 'tka' : 'cbt',
      mapel: matchedLegacy.mapel || params.mapel || 'Umum',
      paketName: matchedLegacy.paketName || params.paketName || idUjian,
      judul: matchedLegacy.judul || idUjian,
      status: 'selesai',
      skor: Number(matchedLegacy.nilai) || 0,
      total_soal: Object.keys(matchedLegacy.jawabanSiswa || {}).length,
      no_soal_betul: [],
      no_soal_salah: [],
      jawaban_siswa: matchedLegacy.jawabanSiswa || {},
      waktu_selesai: matchedLegacy.waktuSelesai || '-',
    });
    return {
      allowed: true,
      source: 'backfilled_from_submission',
      record: backfilled,
    };
  }

  // Cek legacy TKA submission per mapel
  if (params.paketName && params.mapel) {
    const tkaSubs = getStoredTKASubmissions();
    const matchedTkaSub = tkaSubs.find((sub) => {
      const belongs =
        (studentId && sub.studentId === studentId) ||
        (nisn && sub.nisn && sub.nisn.trim() === nisn);
      if (!belongs) return false;
      const baseP = (sub.paketDasar || sub.paket || '').toLowerCase();
      return baseP.includes(params.paketName!.toLowerCase());
    });
    if (matchedTkaSub) {
      const backfilled = await saveHasilUjianToFirestore({
        nisn: nisn || studentId,
        id_ujian: idUjian,
        studentId: studentId || matchedTkaSub.studentId,
        nama_siswa: params.student?.nama || matchedTkaSub.studentName || 'Siswa',
        kelas: params.student?.kelas || matchedTkaSub.kelas || 'Kelas 6',
        category: 'tka',
        mapel: params.mapel,
        paketName: params.paketName,
        judul: `${params.paketName} - ${params.mapel}`,
        status: 'selesai',
        skor: Number(matchedTkaSub.skorTotal) || 0,
        total_soal: Object.keys(matchedTkaSub.answers || {}).length,
        no_soal_betul: [],
        no_soal_salah: [],
        jawaban_siswa: matchedTkaSub.answers || {},
      });
      return {
        allowed: true,
        source: 'backfilled_from_submission',
        record: backfilled,
      };
    }
  }

  return {
    allowed: false,
    source: 'locked',
    lockMessage: SARAH_EXAM_LOCK_MESSAGE,
  };
}

/**
 * Ruang Chat Privat Terisolasi Eksklusif untuk Endi Soeprapto (`sarah_private_chats/endi_soeprapto`).
 * User/admin lain tidak pernah diizinkan membaca, menulis, atau mengakses koleksi ini.
 */
export interface EndiPrivateChatMessage {
  id: string;
  sender: 'user' | 'sarah';
  text: string;
  timestamp: string;
  stickerId?: string;
  attachmentsMeta?: Array<{ name: string; kind: string }>;
}

const ENDI_PRIVATE_DOC_ID = 'endi_soeprapto';

function readLocalEndiPrivateChats(): EndiPrivateChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_ENDI_PRIVATE_CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalEndiPrivateChats(messages: EndiPrivateChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LOCAL_ENDI_PRIVATE_CHATS_KEY,
      JSON.stringify(messages.slice(-40))
    );
  } catch {
    // ignore storage limits
  }
}

export async function loadEndiPrivateChatMessages(
  user?: Pick<ActiveUser, 'role' | 'username' | 'name'> | null
): Promise<EndiPrivateChatMessage[]> {
  if (!isEndiSoepraptoUser(user)) {
    return [];
  }
  const localCached = readLocalEndiPrivateChats();
  try {
    const msgRef = collection(db, 'sarah_private_chats', ENDI_PRIVATE_DOC_ID, 'messages');
    const q = query(msgRef, orderBy('timestamp', 'desc'), limit(40));
    const snap = await Promise.race([
      getDocs(q),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    if (!snap || snap.empty) {
      return localCached;
    }
    const cloudMsgs: EndiPrivateChatMessage[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        sender: (data.sender === 'user' ? 'user' : 'sarah') as ('user' | 'sarah'),
        text: String(data.text || ''),
        timestamp: String(data.timestamp || new Date().toISOString()),
        ...(data.stickerId ? { stickerId: String(data.stickerId) } : {}),
        ...(Array.isArray(data.attachmentsMeta) ? { attachmentsMeta: data.attachmentsMeta } : {}),
      };
    }).reverse();
    writeLocalEndiPrivateChats(cloudMsgs);
    return cloudMsgs;
  } catch {
    return localCached;
  }
}

export async function appendEndiPrivateChatMessage(
  user: Pick<ActiveUser, 'role' | 'username' | 'name'> | null | undefined,
  message: EndiPrivateChatMessage
): Promise<void> {
  if (!isEndiSoepraptoUser(user)) {
    return;
  }
  const existing = readLocalEndiPrivateChats();
  const deduped = existing.filter((m) => m.id !== message.id);
  deduped.push(message);
  writeLocalEndiPrivateChats(deduped);

  try {
    const parentRef = doc(db, 'sarah_private_chats', ENDI_PRIVATE_DOC_ID);
    await setDoc(
      parentRef,
      {
        owner: 'Endi Soeprapto',
        isolated: true,
        updated_at: new Date().toISOString(),
        serverTime: serverTimestamp(),
      },
      { merge: true }
    );

    const msgRef = doc(
      db,
      'sarah_private_chats',
      ENDI_PRIVATE_DOC_ID,
      'messages',
      message.id
    );
    await setDoc(msgRef, {
      sender: message.sender,
      text: String(message.text || '').slice(0, 40000),
      timestamp: message.timestamp || new Date().toISOString(),
      ...(message.stickerId ? { stickerId: message.stickerId } : {}),
      ...(message.attachmentsMeta ? { attachmentsMeta: message.attachmentsMeta } : {}),
      serverTime: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[sarah_private_chats] Simpan cloud tertunda (aman di lokal):', err);
  }
}

export async function clearEndiPrivateChatMessages(
  user?: Pick<ActiveUser, 'role' | 'username' | 'name'> | null
): Promise<void> {
  if (!isEndiSoepraptoUser(user)) {
    return;
  }
  writeLocalEndiPrivateChats([]);
  try {
    const msgRef = collection(db, 'sarah_private_chats', ENDI_PRIVATE_DOC_ID, 'messages');
    const snap = await getDocs(msgRef);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn('[sarah_private_chats] Hapus cloud gagal:', err);
  }
}
