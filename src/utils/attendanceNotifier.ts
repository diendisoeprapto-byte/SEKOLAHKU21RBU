import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Student } from '../types';
import { db } from './firebase';
import { notifyStorageMutation, safeSetLocalStorage } from './storage';

export type NotificationChannelMode = 'both' | 'telegram' | 'whatsapp' | 'log_only';
export type NotificationDeliveryStatus = 'SENT' | 'LOGGED' | 'FAILED';

export interface AttendanceNotificationConfig {
  enabled: boolean;
  channelMode: NotificationChannelMode;
  telegramBotToken: string;
  telegramChatId: string;
  whatsappWebhookUrl: string;
  whatsappWebhookHeaderToken: string;
  whatsappTargetPhone: string;
  includeConfidence: boolean;
}

export interface AttendanceNotificationLog {
  id: string;
  createdAt: string;
  date: string;
  time: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  nisn: string;
  barcodeId: string;
  status: 'H' | 'S' | 'I' | 'A';
  methodLabel: string;
  confidence?: number;
  messageText: string;
  telegramStatus: NotificationDeliveryStatus | 'SKIPPED';
  telegramDetail?: string;
  whatsappStatus: NotificationDeliveryStatus | 'SKIPPED';
  whatsappDetail?: string;
  overallStatus: NotificationDeliveryStatus;
}

export const NOTIF_CONFIG_STORAGE_KEY = 'sekolahku_attendance_notif_config_v1';
export const NOTIF_LOGS_STORAGE_KEY = 'sekolahku_attendance_notif_logs_v1';
const NOTIF_FIRESTORE_COLLECTION = 'settings';
const NOTIF_CONFIG_DOC = 'attendance_notification_config';
const NOTIF_LOGS_DOC = 'attendance_notification_logs';
const MAX_STORED_LOGS = 150;

export const DEFAULT_NOTIFICATION_CONFIG: AttendanceNotificationConfig = {
  enabled: true,
  channelMode: 'both',
  telegramBotToken: '',
  telegramChatId: '',
  whatsappWebhookUrl: '',
  whatsappWebhookHeaderToken: '',
  whatsappTargetPhone: '',
  includeConfidence: true,
};

export const normalizeIndonesianPhone = (raw: string): string => {
  const digits = (raw || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
};

export const getStoredNotificationConfig = (): AttendanceNotificationConfig => {
  try {
    const raw = localStorage.getItem(NOTIF_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_CONFIG;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_NOTIFICATION_CONFIG;
    return {
      ...DEFAULT_NOTIFICATION_CONFIG,
      ...parsed,
    };
  } catch {
    return DEFAULT_NOTIFICATION_CONFIG;
  }
};

export const saveNotificationConfig = (
  config: AttendanceNotificationConfig,
  options?: { skipCloudWrite?: boolean }
): void => {
  const sanitized: AttendanceNotificationConfig = {
    enabled: Boolean(config.enabled),
    channelMode: config.channelMode || 'both',
    telegramBotToken: (config.telegramBotToken || '').trim(),
    telegramChatId: (config.telegramChatId || '').trim(),
    whatsappWebhookUrl: (config.whatsappWebhookUrl || '').trim(),
    whatsappWebhookHeaderToken: (config.whatsappWebhookHeaderToken || '').trim(),
    whatsappTargetPhone: (config.whatsappTargetPhone || '').trim(),
    includeConfidence: config.includeConfidence !== false,
  };

  try {
    safeSetLocalStorage(NOTIF_CONFIG_STORAGE_KEY, JSON.stringify(sanitized));
    notifyStorageMutation(NOTIF_CONFIG_STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sekolahku-notif-config-updated'));
    }
  } catch (err) {
    console.warn('Gagal menyimpan pengaturan notifikasi di localStorage:', err);
  }

  if (!options?.skipCloudWrite) {
    setDoc(
      doc(db, NOTIF_FIRESTORE_COLLECTION, NOTIF_CONFIG_DOC),
      {
        config: sanitized,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      console.warn('Sync pengaturan notifikasi ke Firestore warning:', err);
    });
  }
};

export const subscribeNotificationConfigFromCloud = (
  onSync: (config: AttendanceNotificationConfig) => void
): (() => void) => {
  try {
    const unsub = onSnapshot(
      doc(db, NOTIF_FIRESTORE_COLLECTION, NOTIF_CONFIG_DOC),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as { config?: Partial<AttendanceNotificationConfig> } | undefined;
        if (!data?.config || typeof data.config !== 'object') return;
        const merged: AttendanceNotificationConfig = {
          ...DEFAULT_NOTIFICATION_CONFIG,
          ...data.config,
        };
        saveNotificationConfig(merged, { skipCloudWrite: true });
        onSync(merged);
      },
      (err) => {
        console.warn('Notification config listener warning:', err);
      }
    );
    return unsub;
  } catch {
    return () => {};
  }
};

export const getStoredNotificationLogs = (): AttendanceNotificationLog[] => {
  try {
    const raw = localStorage.getItem(NOTIF_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as AttendanceNotificationLog[];
  } catch {
    return [];
  }
};

export const saveNotificationLogs = (
  logs: AttendanceNotificationLog[],
  options?: { skipCloudWrite?: boolean }
): void => {
  const trimmed = logs.slice(0, MAX_STORED_LOGS);
  try {
    safeSetLocalStorage(NOTIF_LOGS_STORAGE_KEY, JSON.stringify(trimmed));
    notifyStorageMutation(NOTIF_LOGS_STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sekolahku-notif-logs-updated'));
    }
  } catch (err) {
    console.warn('Gagal menyimpan log notifikasi di localStorage:', err);
  }

  if (!options?.skipCloudWrite) {
    setDoc(
      doc(db, NOTIF_FIRESTORE_COLLECTION, NOTIF_LOGS_DOC),
      {
        logs: trimmed,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      console.warn('Sync log notifikasi ke Firestore warning:', err);
    });
  }
};

export const subscribeNotificationLogsFromCloud = (
  onSync: (logs: AttendanceNotificationLog[]) => void
): (() => void) => {
  try {
    const unsub = onSnapshot(
      doc(db, NOTIF_FIRESTORE_COLLECTION, NOTIF_LOGS_DOC),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as { logs?: AttendanceNotificationLog[] } | undefined;
        if (!Array.isArray(data?.logs)) return;

        const local = getStoredNotificationLogs();
        const byId = new Map<string, AttendanceNotificationLog>();
        [...data.logs, ...local].forEach((item) => {
          if (!item || !item.id) return;
          const prev = byId.get(item.id);
          if (!prev || new Date(item.createdAt).getTime() >= new Date(prev.createdAt).getTime()) {
            byId.set(item.id, item);
          }
        });
        const merged = Array.from(byId.values())
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, MAX_STORED_LOGS);

        saveNotificationLogs(merged, { skipCloudWrite: true });
        onSync(merged);
      },
      (err) => {
        console.warn('Notification logs listener warning:', err);
      }
    );
    return unsub;
  } catch {
    return () => {};
  }
};

const escapeHtml = (val: string): string =>
  val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const formatFaceAttendanceMessage = (params: {
  student: Pick<Student, 'nama' | 'kelas' | 'nisn' | 'barcodeId'>;
  date: string;
  time: string;
  status: 'H' | 'S' | 'I' | 'A';
  methodLabel: string;
  confidence?: number;
  includeConfidence?: boolean;
}): string => {
  const statusText =
    params.status === 'H'
      ? 'HADIR'
      : params.status === 'S'
      ? 'SAKIT'
      : params.status === 'I'
      ? 'IZIN'
      : 'ALPA';

  const confidenceLine =
    params.includeConfidence !== false && typeof params.confidence === 'number' && params.confidence > 0
      ? `\nAkurasi Wajah : ${params.confidence}%`
      : '';

  return [
    `[SERBU 21 • SDN Rawa Badak Utara 21]`,
    `Notifikasi Absensi Wajah Siswa`,
    `Nama Siswa    : ${params.student.nama}`,
    `Kelas / NISN  : ${params.student.kelas} / ${params.student.nisn || '-'}`,
    `Status        : ${statusText}`,
    `Tanggal / Jam : ${params.date} • ${params.time} WIB`,
    `Metode        : ${params.methodLabel}${confidenceLine}`,
  ].join('\n');
};

export const formatTelegramHtmlMessage = (params: {
  student: Pick<Student, 'nama' | 'kelas' | 'nisn' | 'barcodeId'>;
  date: string;
  time: string;
  status: 'H' | 'S' | 'I' | 'A';
  methodLabel: string;
  confidence?: number;
  includeConfidence?: boolean;
}): string => {
  const statusText =
    params.status === 'H'
      ? 'HADIR (H)'
      : params.status === 'S'
      ? 'SAKIT (S)'
      : params.status === 'I'
      ? 'IZIN (I)'
      : 'ALPA (A)';

  const confidencePart =
    params.includeConfidence !== false && typeof params.confidence === 'number' && params.confidence > 0
      ? `\n<b>Akurasi Wajah:</b> ${params.confidence}%`
      : '';

  return (
    `<b>SERBU 21 • SDN Rawa Badak Utara 21</b>\n` +
    `Notifikasi Absensi Wajah Otomatis\n\n` +
    `<b>Nama:</b> ${escapeHtml(params.student.nama)}\n` +
    `<b>Kelas:</b> ${escapeHtml(params.student.kelas)} | <b>NISN:</b> ${escapeHtml(params.student.nisn || '-')}\n` +
    `<b>Status:</b> ${statusText}\n` +
    `<b>Waktu:</b> ${escapeHtml(params.date)} pukul ${escapeHtml(params.time)} WIB\n` +
    `<b>Metode:</b> ${escapeHtml(params.methodLabel)}` +
    confidencePart
  );
};

export const buildWhatsAppDirectUrl = (targetPhone: string, message: string): string => {
  const normalized = normalizeIndonesianPhone(targetPhone);
  const encoded = encodeURIComponent(message);
  return normalized ? `https://wa.me/${normalized}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
};

async function sendTelegramDelivery(
  config: AttendanceNotificationConfig,
  htmlText: string
): Promise<{ status: NotificationDeliveryStatus; detail: string }> {
  const token = config.telegramBotToken.trim();
  const chatId = config.telegramChatId.trim();

  if (!token || !chatId) {
    return {
      status: 'LOGGED',
      detail: 'Bot Token / Chat ID Telegram belum diatur — tersimpan di log otomatis.',
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string; result?: { message_id?: number } }
      | null;

    if (!res.ok || !data?.ok) {
      return {
        status: 'FAILED',
        detail: data?.description || `HTTP ${res.status} saat mengirim ke Telegram`,
      };
    }

    return {
      status: 'SENT',
      detail: `Terkirim ke Chat ${chatId}${data.result?.message_id ? ` (#${data.result.message_id})` : ''}`,
    };
  } catch (err) {
    return {
      status: 'FAILED',
      detail: err instanceof Error ? err.message : 'Gagal terhubung ke API Telegram',
    };
  }
}

async function sendWhatsAppWebhookDelivery(
  config: AttendanceNotificationConfig,
  payload: {
    message: string;
    student: Pick<Student, 'id' | 'nama' | 'kelas' | 'nisn' | 'barcodeId'>;
    date: string;
    time: string;
    status: string;
    methodLabel: string;
    confidence?: number;
  }
): Promise<{ status: NotificationDeliveryStatus; detail: string }> {
  const webhookUrl = config.whatsappWebhookUrl.trim();
  const targetPhone = normalizeIndonesianPhone(config.whatsappTargetPhone);

  if (!webhookUrl) {
    return {
      status: 'LOGGED',
      detail: targetPhone
        ? `Webhook WA belum diisi — siap kirim ke ${targetPhone} via tombol Kirim WA.`
        : 'Webhook WA belum diisi — tersimpan di log untuk kirim manual.',
    };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.whatsappWebhookHeaderToken.trim()) {
      headers['Authorization'] = config.whatsappWebhookHeaderToken.trim();
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app: 'SERBU 21',
        school: 'SDN Rawa Badak Utara 21',
        event: 'face_attendance_detected',
        phone: targetPhone,
        target: targetPhone,
        message: payload.message,
        text: payload.message,
        student: {
          id: payload.student.id,
          nama: payload.student.nama,
          kelas: payload.student.kelas,
          nisn: payload.student.nisn,
          barcodeId: payload.student.barcodeId,
        },
        date: payload.date,
        time: payload.time,
        status: payload.status,
        methodLabel: payload.methodLabel,
        confidence: payload.confidence,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        status: 'FAILED',
        detail: `HTTP ${res.status}${errText ? `: ${errText.slice(0, 80)}` : ''}`,
      };
    }

    return {
      status: 'SENT',
      detail: targetPhone ? `Terkirim via Webhook WA (${targetPhone})` : 'Terkirim via Webhook WA',
    };
  } catch (err) {
    return {
      status: 'FAILED',
      detail: err instanceof Error ? err.message : 'Gagal menghubungi Webhook WhatsApp',
    };
  }
}

function computeOverallStatus(
  tg: NotificationDeliveryStatus | 'SKIPPED',
  wa: NotificationDeliveryStatus | 'SKIPPED'
): NotificationDeliveryStatus {
  if (tg === 'SENT' || wa === 'SENT') {
    if (tg === 'FAILED' || wa === 'FAILED') {
      return 'SENT';
    }
    return 'SENT';
  }
  if (tg === 'FAILED' || wa === 'FAILED') {
    return 'FAILED';
  }
  return 'LOGGED';
}

export async function dispatchFaceAttendanceNotification(params: {
  student: Student;
  date: string;
  time: string;
  status: 'H' | 'S' | 'I' | 'A';
  methodLabel: string;
  confidence?: number;
  config?: AttendanceNotificationConfig;
}): Promise<AttendanceNotificationLog> {
  const config = params.config || getStoredNotificationConfig();
  const plainText = formatFaceAttendanceMessage({
    student: params.student,
    date: params.date,
    time: params.time,
    status: params.status,
    methodLabel: params.methodLabel,
    confidence: params.confidence,
    includeConfidence: config.includeConfidence,
  });
  const tgHtml = formatTelegramHtmlMessage({
    student: params.student,
    date: params.date,
    time: params.time,
    status: params.status,
    methodLabel: params.methodLabel,
    confidence: params.confidence,
    includeConfidence: config.includeConfidence,
  });

  const useTelegram =
    config.channelMode === 'both' || config.channelMode === 'telegram';
  const useWhatsApp =
    config.channelMode === 'both' || config.channelMode === 'whatsapp';

  const [tgResult, waResult] = await Promise.all([
    useTelegram
      ? sendTelegramDelivery(config, tgHtml)
      : Promise.resolve<{ status: 'SKIPPED'; detail: string }>({
          status: 'SKIPPED',
          detail: 'Kanal Telegram dinonaktifkan pada mode pilihan',
        }),
    useWhatsApp
      ? sendWhatsAppWebhookDelivery(config, {
          message: plainText,
          student: params.student,
          date: params.date,
          time: params.time,
          status: params.status,
          methodLabel: params.methodLabel,
          confidence: params.confidence,
        })
      : Promise.resolve<{ status: 'SKIPPED'; detail: string }>({
          status: 'SKIPPED',
          detail: 'Kanal WhatsApp dinonaktifkan pada mode pilihan',
        }),
  ]);

  const entry: AttendanceNotificationLog = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    date: params.date,
    time: params.time,
    studentId: params.student.id,
    studentName: params.student.nama,
    studentClass: params.student.kelas,
    nisn: params.student.nisn || '',
    barcodeId: params.student.barcodeId || '',
    status: params.status,
    methodLabel: params.methodLabel,
    confidence: params.confidence,
    messageText: plainText,
    telegramStatus: tgResult.status,
    telegramDetail: tgResult.detail,
    whatsappStatus: waResult.status,
    whatsappDetail: waResult.detail,
    overallStatus: computeOverallStatus(tgResult.status, waResult.status),
  };

  const existingLogs = getStoredNotificationLogs();
  saveNotificationLogs([entry, ...existingLogs]);
  return entry;
}

export async function retryNotificationLog(
  logEntry: AttendanceNotificationLog,
  config?: AttendanceNotificationConfig
): Promise<AttendanceNotificationLog> {
  const cfg = config || getStoredNotificationConfig();
  const fakeStudent: Student = {
    id: logEntry.studentId,
    barcodeId: logEntry.barcodeId,
    nama: logEntry.studentName,
    jenisKelamin: 'L',
    tempatLahir: '',
    tanggalLahir: '',
    nik: '',
    nisn: logEntry.nisn,
    kebutuhanKhusus: 'Tidak Ada (Reguler)',
    namaAyah: '',
    namaIbu: '',
    alamat: '',
    agama: 'Islam',
    kelas: logEntry.studentClass,
    tahunPelajaran: '',
    username: '',
    password: '',
    fotoUrl: '',
  };

  const tgHtml = formatTelegramHtmlMessage({
    student: fakeStudent,
    date: logEntry.date,
    time: logEntry.time,
    status: logEntry.status,
    methodLabel: logEntry.methodLabel,
    confidence: logEntry.confidence,
    includeConfidence: cfg.includeConfidence,
  });

  const useTelegram = cfg.channelMode === 'both' || cfg.channelMode === 'telegram';
  const useWhatsApp = cfg.channelMode === 'both' || cfg.channelMode === 'whatsapp';

  const [tgResult, waResult] = await Promise.all([
    useTelegram
      ? sendTelegramDelivery(cfg, tgHtml)
      : Promise.resolve<{ status: 'SKIPPED'; detail: string }>({
          status: 'SKIPPED',
          detail: 'Kanal Telegram tidak aktif',
        }),
    useWhatsApp
      ? sendWhatsAppWebhookDelivery(cfg, {
          message: logEntry.messageText,
          student: fakeStudent,
          date: logEntry.date,
          time: logEntry.time,
          status: logEntry.status,
          methodLabel: logEntry.methodLabel,
          confidence: logEntry.confidence,
        })
      : Promise.resolve<{ status: 'SKIPPED'; detail: string }>({
          status: 'SKIPPED',
          detail: 'Kanal WhatsApp tidak aktif',
        }),
  ]);

  const updatedEntry: AttendanceNotificationLog = {
    ...logEntry,
    createdAt: new Date().toISOString(),
    telegramStatus: tgResult.status,
    telegramDetail: tgResult.detail,
    whatsappStatus: waResult.status,
    whatsappDetail: waResult.detail,
    overallStatus: computeOverallStatus(tgResult.status, waResult.status),
  };

  const currentLogs = getStoredNotificationLogs().map((item) =>
    item.id === logEntry.id ? updatedEntry : item
  );
  saveNotificationLogs(currentLogs);
  return updatedEntry;
}

export async function sendTestAttendanceNotification(
  config: AttendanceNotificationConfig,
  activeClass: string
): Promise<AttendanceNotificationLog> {
  const sampleStudent: Student = {
    id: 'test_notif_student',
    barcodeId: 'SERBU21-TEST',
    nama: 'Siswa Uji Coba SERBU 21',
    jenisKelamin: 'L',
    tempatLahir: 'Jakarta',
    tanggalLahir: '2015-05-10',
    nik: '',
    nisn: '0151234567',
    kebutuhanKhusus: 'Tidak Ada (Reguler)',
    namaAyah: '',
    namaIbu: '',
    alamat: '',
    agama: 'Islam',
    kelas: activeClass || 'Kelas 6A',
    tahunPelajaran: '2026/2027',
    username: 'uji_notif',
    password: '123',
    fotoUrl: '',
  };

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8);

  return dispatchFaceAttendanceNotification({
    student: sampleStudent,
    date: dateStr,
    time: timeStr,
    status: 'H',
    methodLabel: 'Uji Koneksi Notifikasi Wajah',
    confidence: 96,
    config,
  });
}
