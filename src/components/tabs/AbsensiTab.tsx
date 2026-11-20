import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  QrCode,
  CheckCheck,
  Calendar,
  Clock,
  UserCheck,
  Upload,
  Link as LinkIcon,
  Video,
  VideoOff,
  CheckCircle2,
  X,
  RefreshCw,
  Search,
  Sparkles,
  AlertTriangle,
  FileImage,
  SwitchCamera,
  Volume2,
  ScanFace,
  UserPlus,
  Trash2,
  ShieldCheck,
  Send,
  Bell,
  Copy,
  ExternalLink,
  Settings2,
  History,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  DeviceCameraInfo,
  enumerateDeviceCameras,
  formatCameraErrorIndonesian,
  pickPreferredCameraId,
  scanBarcodeFromImageFile,
  startHtml5QrScanner,
  stopHtml5QrScanner,
} from '../../utils/cameraScanner';
import {
  StoredFaceProfile,
  loadFaceRecognitionModels,
  getStoredFaceProfiles,
  saveStoredFaceProfiles,
  subscribeFaceProfilesFromCloud,
  extractSingleFaceDescriptor,
  extractDescriptorFromImageUrl,
  extractDescriptorFromFile,
  averageFaceDescriptors,
  matchDescriptorAgainstStudents,
  detectAndMatchFacesOnVideo,
  startFaceCameraStream,
  stopFaceCameraStream,
  cropFaceThumbnail,
  isUsableRealPhotoUrl,
} from '../../utils/faceRecognition';
import {
  AttendanceNotificationConfig,
  AttendanceNotificationLog,
  NotificationChannelMode,
  buildWhatsAppDirectUrl,
  dispatchFaceAttendanceNotification,
  formatFaceAttendanceMessage,
  getStoredNotificationConfig,
  getStoredNotificationLogs,
  retryNotificationLog,
  saveNotificationConfig,
  saveNotificationLogs,
  sendTestAttendanceNotification,
  subscribeNotificationConfigFromCloud,
  subscribeNotificationLogsFromCloud,
} from '../../utils/attendanceNotifier';
import { Student, KaldikDay } from '../../types';
import { AttendanceRecordItem } from '../../utils/storage';
import { formatTanggalIndo, getLocalTimeStr, parseLocalDate } from '../../utils/dateUtils';
import { TabId } from '../Sidebar';

interface Props {
  students: Student[];
  activeClass: string;
  attendanceRecords: Record<string, AttendanceRecordItem>;
  selectedDate: string;
  onChangeDate: (date: string) => void;
  liveTodayStr: string;
  onRecordSingleAttendance: (record: AttendanceRecordItem) => Promise<void>;
  onSaveBatchAttendance: (records: AttendanceRecordItem[]) => Promise<void>;
  onDeleteAttendanceRecords: (records: AttendanceRecordItem[]) => Promise<void>;
  kaldikDays: KaldikDay[];
  onOpenCalendarForDate: (dateStr: string) => void;
  onNavigateTab: (tab: TabId) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

type CameraDevice = DeviceCameraInfo;

interface FaceDetectionHistoryItem {
  id: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  nisn: string;
  confidence: number;
  timestamp: string;
  date: string;
  outcome: 'saved' | 'already_recorded' | 'detected';
  methodLabel: string;
  snapshotUrl: string;
}

const FACE_HISTORY_STORAGE_KEY = 'sekolahku_face_detection_history_v1';

export const AbsensiTab: React.FC<Props> = ({
  students,
  activeClass,
  attendanceRecords,
  selectedDate,
  onChangeDate,
  liveTodayStr,
  onRecordSingleAttendance,
  onSaveBatchAttendance,
  onDeleteAttendanceRecords,
  kaldikDays,
  onOpenCalendarForDate,
  onNavigateTab,
  showToast,
  onOpenZoom,
}) => {
  const activeDate = selectedDate || liveTodayStr;
  const setActiveDate = onChangeDate;
  const [liveClock, setLiveClock] = useState<string>(() => getLocalTimeStr(new Date(), true));
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isInitializingCamera, setIsInitializingCamera] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  const [lastScannedStudent, setLastScannedStudent] = useState<string>('Siap menerima scan barcode siswa...');
  const [lastScannedTime, setLastScannedTime] = useState<string>('--:--');
  const [lastScannedStatus, setLastScannedStatus] = useState<'H' | 'S' | 'I' | 'A' | null>(null);
  const [scannedSuccessItem, setScannedSuccessItem] = useState<{
    student: Student;
    time: string;
    status: 'H' | 'S' | 'I' | 'A';
    alreadyPresent?: boolean;
    methodLabel?: string;
  } | null>(null);

  const [manualCode, setManualCode] = useState('');
  const [selectedStudentDropdown, setSelectedStudentDropdown] = useState('');
  const [isScanningFile, setIsScanningFile] = useState(false);

  // Scanner & Hardware references
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const keyBufferRef = useRef<{ buffer: string; lastKeyTime: number }>({ buffer: '', lastKeyTime: 0 });

  // Face Recognition Scan, Dual Verification Layer & Enrollment states
  const [scanMode, setScanMode] = useState<'barcode' | 'face' | 'dual'>('barcode');
  const [dualVerifyRule, setDualVerifyRule] = useState<'verify_barcode' | 'parallel'>('verify_barcode');
  const [faceLayerCameraId, setFaceLayerCameraId] = useState<string>('');
  const [usingSharedBarcodeFeed, setUsingSharedBarcodeFeed] = useState<boolean>(false);
  const [faceProfiles, setFaceProfiles] = useState<Record<string, StoredFaceProfile>>(() =>
    getStoredFaceProfiles()
  );
  const [faceModelsReady, setFaceModelsReady] = useState(false);
  const [isLoadingFaceModels, setIsLoadingFaceModels] = useState(false);
  const [faceCameraActive, setFaceCameraActive] = useState(false);
  const [isInitializingFaceCam, setIsInitializingFaceCam] = useState(false);
  const [faceStatusText, setFaceStatusText] = useState<string>(
    'Aktifkan kamera wajah & arahkan wajah siswa ke bingkai'
  );
  const [liveDetectedFace, setLiveDetectedFace] = useState<{
    studentId: string;
    studentName: string;
    confidence: number;
    hasFace: boolean;
    detectedAt: number;
  } | null>(null);
  const [faceThreshold, setFaceThreshold] = useState<number>(0.50);
  const [autoSubmitFaceAttendance, setAutoSubmitFaceAttendance] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sekolahku_auto_submit_face') !== 'false';
    } catch {
      return true;
    }
  });
  const [isScanningFaceFile, setIsScanningFaceFile] = useState(false);
  const [isSyncingFromPhotos, setIsSyncingFromPhotos] = useState(false);

  // Telegram / WhatsApp Automatic Notification & Status Log states
  const [notifConfig, setNotifConfig] = useState<AttendanceNotificationConfig>(() =>
    getStoredNotificationConfig()
  );
  const [notifDraft, setNotifDraft] = useState<AttendanceNotificationConfig>(() =>
    getStoredNotificationConfig()
  );
  const [notifLogs, setNotifLogs] = useState<AttendanceNotificationLog[]>(() =>
    getStoredNotificationLogs()
  );
  const [isNotifSettingsOpen, setIsNotifSettingsOpen] = useState(false);
  const [isSendingTestNotif, setIsSendingTestNotif] = useState(false);
  const [retryingLogId, setRetryingLogId] = useState<string>('');
  const notifConfigRef = useRef<AttendanceNotificationConfig>(notifConfig);
  notifConfigRef.current = notifConfig;

  const [faceDetectionHistory, setFaceDetectionHistory] = useState<FaceDetectionHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(FACE_HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch {
      return [];
    }
  });
  const lastHistoryStampRef = useRef<Record<string, number>>({});

  const pushFaceDetectionHistory = (params: {
    student: Student;
    confidence: number;
    outcome: 'saved' | 'already_recorded' | 'detected';
    methodLabel: string;
    snapshotUrl?: string;
    force?: boolean;
  }) => {
    const nowMs = Date.now();
    const lastForStudent = lastHistoryStampRef.current[params.student.id] || 0;
    if (!params.force && params.outcome === 'detected' && nowMs - lastForStudent < 5000) {
      return;
    }
    lastHistoryStampRef.current[params.student.id] = nowMs;

    const timeStr = getLocalTimeStr(new Date(), true);
    const fallbackThumb =
      faceProfiles[params.student.id]?.thumbnailDataUrl || params.student.fotoUrl || '';
    const resolvedSnap = params.snapshotUrl || fallbackThumb;

    setFaceDetectionHistory((prev) => {
      const newest = prev[0];
      let next: FaceDetectionHistoryItem[];

      // If the same student was just logged as 'detected' within 4s, upgrade that item instead of duplicating
      if (
        newest &&
        newest.studentId === params.student.id &&
        params.outcome !== 'detected' &&
        newest.outcome === 'detected'
      ) {
        const upgraded: FaceDetectionHistoryItem = {
          ...newest,
          confidence: params.confidence || newest.confidence,
          timestamp: timeStr,
          date: activeDate,
          outcome: params.outcome,
          methodLabel: params.methodLabel,
          snapshotUrl: params.snapshotUrl || newest.snapshotUrl || resolvedSnap,
        };
        next = [upgraded, ...prev.slice(1)].slice(0, 5);
      } else {
        const entry: FaceDetectionHistoryItem = {
          id: `fh_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
          studentId: params.student.id,
          studentName: params.student.nama,
          studentClass: params.student.kelas,
          nisn: params.student.nisn || '-',
          confidence: params.confidence,
          timestamp: timeStr,
          date: activeDate,
          outcome: params.outcome,
          methodLabel: params.methodLabel,
          snapshotUrl: resolvedSnap,
        };
        next = [entry, ...prev].slice(0, 5);
      }

      try {
        localStorage.setItem(FACE_HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

  const handleClearFaceDetectionHistory = () => {
    setFaceDetectionHistory([]);
    lastHistoryStampRef.current = {};
    try {
      localStorage.removeItem(FACE_HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
    showToast('Histori 5 deteksi wajah terakhir dibersihkan.', 'success');
  };

  const handleToggleAutoSubmitFace = (nextVal: boolean) => {
    setAutoSubmitFaceAttendance(nextVal);
    try {
      localStorage.setItem('sekolahku_auto_submit_face', String(nextVal));
    } catch {
      // Ignore storage quota errors
    }
    showToast(
      nextVal
        ? 'Auto-Submit Absen Wajah AKTIF: kehadiran otomatis disimpan saat kepercayaan > 90%.'
        : 'Auto-Submit Absen Wajah NONAKTIF: guru konfirmasi manual saat wajah terdeteksi.',
      'success'
    );
  };

  const handleToggleAutoNotif = (nextEnabled: boolean) => {
    const updated = { ...notifConfig, enabled: nextEnabled };
    setNotifConfig(updated);
    setNotifDraft(updated);
    saveNotificationConfig(updated);
    showToast(
      nextEnabled
        ? 'Notifikasi & Log Otomatis Telegram/WA untuk Absen Wajah AKTIF.'
        : 'Notifikasi & Log Otomatis Telegram/WA dinonaktifkan.',
      'success'
    );
  };

  const handleSaveNotifSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setNotifConfig(notifDraft);
    saveNotificationConfig(notifDraft);
    setIsNotifSettingsOpen(false);
    showToast('Pengaturan notifikasi Telegram & WhatsApp berhasil disimpan!', 'success');
  };

  const handleSendTestNotif = async () => {
    setIsSendingTestNotif(true);
    try {
      const result = await sendTestAttendanceNotification(notifDraft, activeClass);
      setNotifLogs(getStoredNotificationLogs());
      if (result.overallStatus === 'SENT') {
        showToast('Uji kirim notifikasi berhasil terkirim ke kanal aktif!', 'success');
      } else if (result.overallStatus === 'FAILED') {
        showToast(
          `Uji kirim gagal: ${result.telegramStatus === 'FAILED' ? result.telegramDetail : result.whatsappDetail}`,
          'error'
        );
      } else {
        showToast('Uji log berhasil dicatat (isi Bot Token / Webhook WA untuk pengiriman API otomatis).', 'success');
      }
    } finally {
      setIsSendingTestNotif(false);
    }
  };

  const handleRetryLogEntry = async (entry: AttendanceNotificationLog) => {
    setRetryingLogId(entry.id);
    try {
      const updated = await retryNotificationLog(entry, notifConfigRef.current);
      setNotifLogs(getStoredNotificationLogs());
      if (updated.overallStatus === 'SENT') {
        showToast(`Notifikasi ${entry.studentName} berhasil dikirim ulang!`, 'success');
      } else if (updated.overallStatus === 'FAILED') {
        showToast(
          `Pengiriman ulang gagal: ${
            updated.telegramStatus === 'FAILED' ? updated.telegramDetail : updated.whatsappDetail
          }`,
          'error'
        );
      } else {
        showToast('Status diperbarui pada log lokal (kanal API belum dikonfigurasi).', 'success');
      }
    } finally {
      setRetryingLogId('');
    }
  };

  const handleCopyNotifText = async (text: string, successMsg = 'Teks notifikasi berhasil disalin!') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMsg, 'success');
    } catch {
      showToast('Gagal menyalin ke clipboard browser.', 'error');
    }
  };

  const handleClearNotifLogs = () => {
    saveNotificationLogs([]);
    setNotifLogs([]);
    showToast('Log status notifikasi Telegram/WhatsApp telah dibersihkan.', 'success');
  };

  // Face Enrollment Modal states
  const [isFaceEnrollModalOpen, setIsFaceEnrollModalOpen] = useState(false);
  const [enrollStudentId, setEnrollStudentId] = useState<string>('');
  const [enrollSearch, setEnrollSearch] = useState<string>('');
  const [isEnrollingCamera, setIsEnrollingCamera] = useState(false);
  const [enrollProgressText, setEnrollProgressText] = useState<string>('');

  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const enrollStreamRef = useRef<MediaStream | null>(null);
  const faceFileInputRef = useRef<HTMLInputElement>(null);
  const enrollFileInputRef = useRef<HTMLInputElement>(null);
  const usingSharedFeedRef = useRef<boolean>(false);
  const liveFaceDetectionRef = useRef<{
    student: Student | null;
    confidence: number;
    hasFace: boolean;
    detectedAt: number;
  }>({
    student: null,
    confidence: 0,
    hasFace: false,
    detectedAt: 0,
  });
  const faceMatchStreakRef = useRef<{ studentId: string; count: number; lastTrigger: number }>({
    studentId: '',
    count: 0,
    lastTrigger: 0,
  });

  const filteredStudents = students.filter((s) => s.kelas === activeClass);

  // Sync face profiles from local event & Cloud Firestore
  useEffect(() => {
    const syncLocal = () => setFaceProfiles(getStoredFaceProfiles());
    window.addEventListener('sekolahku-face-profiles-updated', syncLocal);
    const unsubCloud = subscribeFaceProfilesFromCloud((merged) => {
      setFaceProfiles(merged);
    });

    const syncNotifCfg = () => {
      const latest = getStoredNotificationConfig();
      setNotifConfig(latest);
      setNotifDraft(latest);
    };
    const syncNotifLogs = () => setNotifLogs(getStoredNotificationLogs());
    window.addEventListener('sekolahku-notif-config-updated', syncNotifCfg);
    window.addEventListener('sekolahku-notif-logs-updated', syncNotifLogs);
    const unsubNotifCfg = subscribeNotificationConfigFromCloud((cfg) => {
      setNotifConfig(cfg);
      setNotifDraft(cfg);
    });
    const unsubNotifLogs = subscribeNotificationLogsFromCloud((logs) => {
      setNotifLogs(logs);
    });

    return () => {
      window.removeEventListener('sekolahku-face-profiles-updated', syncLocal);
      window.removeEventListener('sekolahku-notif-config-updated', syncNotifCfg);
      window.removeEventListener('sekolahku-notif-logs-updated', syncNotifLogs);
      unsubCloud();
      unsubNotifCfg();
      unsubNotifLogs();
    };
  }, []);

  // Face recognition candidates (current class + school wide)
  const faceCandidates = React.useMemo(() => {
    return students
      .map((student) => {
        const prof = faceProfiles[student.id];
        if (!prof || !Array.isArray(prof.descriptor) || prof.descriptor.length !== 128) return null;
        return { student, descriptor: prof.descriptor };
      })
      .filter((x): x is { student: Student; descriptor: number[] } => x !== null);
  }, [students, faceProfiles]);

  const faceCandidatesRef = useRef(faceCandidates);
  faceCandidatesRef.current = faceCandidates;

  const classEnrolledCount = filteredStudents.filter((s) => Boolean(faceProfiles[s.id])).length;

  const activeDayKaldik = kaldikDays.find((k) => k.date === activeDate);
  const isSunday = parseLocalDate(activeDate).getDay() === 0;
  const isHoliday = isSunday || (activeDayKaldik ? activeDayKaldik.isHoliday : false);

  // Live clock real-time setiap detik (WIB/WITA/WIT)
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveClock(getLocalTimeStr(new Date(), true));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const refreshAvailableCameras = async (preferExistingId?: string) => {
    const cams = await enumerateDeviceCameras();
    setAvailableCameras(cams);
    if (cams.length > 0) {
      setSelectedCameraId((prev) => {
        const candidate = preferExistingId || prev;
        if (candidate && cams.some((c) => c.id === candidate)) return candidate;
        return pickPreferredCameraId(cams);
      });
      setFaceLayerCameraId((prev) => {
        if (prev && cams.some((c) => c.id === prev)) return prev;
        const frontCam = cams.find((c) => !c.isBack);
        return frontCam ? frontCam.id : cams[0].id;
      });
    }
    return cams;
  };

  // Enumerate cameras on mount and sync when USB/external cameras connect or disconnect
  useEffect(() => {
    refreshAvailableCameras();
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    const handleDeviceChange = () => {
      refreshAvailableCameras();
    };
    mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, []);

  // Play auditory tone
  const playBeep = (type: 'success' | 'error' | 'duplicate' = 'success') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();

      if (type === 'success') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.12); // A6
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.22);
      } else if (type === 'duplicate') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, audioCtx.currentTime);
        osc.frequency.setValueAtTime(520, audioCtx.currentTime + 0.14);
        gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } else {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, audioCtx.currentTime);
        osc.frequency.setValueAtTime(220, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      }
    } catch {
      // Audio autoplay policy handled silently
    }
  };

  // Record student attendance permanently to state, localStorage, and Firestore 'attendance' collection
  const recordAttendance = async (
    student: Student,
    status: 'H' | 'S' | 'I' | 'A' = 'H',
    options?: {
      skipIfAlreadyRecorded?: boolean;
      methodLabel?: string;
      isFaceAttendance?: boolean;
      confidence?: number;
      snapshotUrl?: string;
    }
  ) => {
    const key = `${activeDate}_${student.id}`;
    const existingRec = attendanceRecords[key];

    if (options?.skipIfAlreadyRecorded && existingRec) {
      const existingLabel =
        existingRec.status === 'H'
          ? 'HADIR'
          : existingRec.status === 'S'
          ? 'SAKIT'
          : existingRec.status === 'I'
          ? 'IZIN'
          : 'ALPA';
      const existingTime = existingRec.time || '--:--';

      setLastScannedStudent(
        `${student.nama} (${student.barcodeId}) - SUDAH ${existingLabel}`
      );
      setLastScannedTime(existingTime);
      setLastScannedStatus(existingRec.status);
      setScannedSuccessItem({
        student,
        time: existingTime,
        status: existingRec.status,
        alreadyPresent: true,
        methodLabel: options?.methodLabel,
      });
      playBeep('duplicate');
      try {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(
            existingRec.status === 'H'
              ? 'Anak ini sudah hadir'
              : `Anak ini sudah tercatat ${existingLabel.toLowerCase()}`
          );
          utterance.lang = 'id-ID';
          utterance.rate = 1.05;
          window.speechSynthesis.speak(utterance);
        }
      } catch {
        // Abaikan jika SpeechSynthesis tidak tersedia
      }
      if (options?.isFaceAttendance || (options?.methodLabel || '').toLowerCase().includes('wajah')) {
        pushFaceDetectionHistory({
          student,
          confidence: options?.confidence || liveFaceDetectionRef.current.confidence || 0,
          outcome: 'already_recorded',
          methodLabel: options?.methodLabel || 'Absensi Wajah',
          snapshotUrl: options?.snapshotUrl,
          force: true,
        });
      }
      showToast(
        existingRec.status === 'H'
          ? `Anak ini sudah hadir! ${student.nama} telah absen pukul ${existingTime} (waktu tidak ditimpa).`
          : `Anak ini sudah absen (${existingLabel}) pukul ${existingTime} — data tidak ditimpa.`,
        'error'
      );
      return;
    }

    const timeStr = getLocalTimeStr(new Date(), true);
    const newRecord: AttendanceRecordItem = {
      id: key,
      studentId: student.id,
      date: activeDate,
      status,
      time: timeStr.slice(0, 5),
    };

    const statusLabel =
      status === 'H' ? 'HADIR' : status === 'S' ? 'SAKIT' : status === 'I' ? 'IZIN' : 'ALPA';

    setLastScannedStudent(`${student.nama} (${student.barcodeId}) - ${statusLabel}`);
    setLastScannedTime(timeStr.slice(0, 5));
    setLastScannedStatus(status);
    setScannedSuccessItem({
      student,
      time: timeStr,
      status,
      alreadyPresent: false,
      methodLabel: options?.methodLabel,
    });
    playBeep('success');

    try {
      await onRecordSingleAttendance(newRecord);
      if (student.kelas !== activeClass) {
        showToast(
          `✓ ${student.nama} (${student.kelas}) tersimpan ${statusLabel} (${formatTanggalIndo(activeDate, false)})`,
          'success'
        );
      } else {
        showToast(
          `✓ ${student.nama} tercatat ${statusLabel} & tersinkron ke Kalender Pendidikan!`,
          'success'
        );
      }

      const isFaceTriggered =
        Boolean(options?.isFaceAttendance) ||
        Boolean(options?.methodLabel && options.methodLabel.toLowerCase().includes('wajah'));

      if (isFaceTriggered) {
        pushFaceDetectionHistory({
          student,
          confidence: options?.confidence || liveFaceDetectionRef.current.confidence || 0,
          outcome: 'saved',
          methodLabel: options?.methodLabel || 'Absensi Wajah',
          snapshotUrl: options?.snapshotUrl,
          force: true,
        });
      }

      if (isFaceTriggered && notifConfigRef.current.enabled) {
        dispatchFaceAttendanceNotification({
          student,
          date: activeDate,
          time: timeStr,
          status,
          methodLabel: options?.methodLabel || 'Absensi Wajah',
          confidence: options?.confidence,
          config: notifConfigRef.current,
        })
          .then((logEntry) => {
            setNotifLogs(getStoredNotificationLogs());
            if (logEntry.overallStatus === 'SENT') {
              showToast(`Notifikasi Telegram/WA terkirim untuk ${student.nama}.`, 'success');
            } else if (logEntry.overallStatus === 'FAILED') {
              showToast(
                `Notifikasi ${student.nama} gagal terkirim ke API (tersimpan di Log Status).`,
                'error'
              );
            }
          })
          .catch((err) => {
            console.warn('Notification dispatch error:', err);
          });
      }
    } catch (error) {
      console.error('Gagal menyimpan presensi ke Firestore:', error);
      showToast('Gagal menyimpan presensi ke Cloud Firestore. Cek koneksi internet.', 'error');
    }
  };

  const handleClearSingleAttendance = async (student: Student) => {
    const rec = attendanceRecords[`${activeDate}_${student.id}`];
    if (!rec) return;
    try {
      await onDeleteAttendanceRecords([rec]);
      showToast(`Status kehadiran ${student.nama} tanggal ${activeDate} dikosongkan.`, 'success');
    } catch (error) {
      console.error('Gagal mengosongkan presensi siswa:', error);
      showToast('Gagal menghapus catatan presensi di cloud.', 'error');
    }
  };

  // Parse detected barcode string and match student (supports Barcode ID, NISN, and KTP Student Card NIS/NISN)
  const handleBarcodeDetected = (rawCode: string) => {
    if (!rawCode) return;
    const clean = rawCode.trim().toLowerCase().replace(/^[\r\n\s]+|[\r\n\s]+$/g, '');
    if (!clean) return;

    const matchesStudent = (s: Student) => {
      const bId = (s.barcodeId || '').trim().toLowerCase();
      const nId = (s.nisn || '').trim().toLowerCase();
      const sId = (s.id || '').trim().toLowerCase();
      return (
        (Boolean(bId) && (bId === clean || clean.includes(bId))) ||
        (Boolean(nId) && (nId === clean || clean.includes(nId))) ||
        (Boolean(sId) && sId === clean)
      );
    };

    // Search in current class first, then in whole school
    const studentAnywhere =
      filteredStudents.find(matchesStudent) || students.find(matchesStudent);

    if (!studentAnywhere) {
      playBeep('error');
      showToast(`Barcode "${rawCode}" tidak cocok dengan data siswa manapun!`, 'error');
      return;
    }

    // Check Face Verification Layer when Dual Mode is active
    if (scanMode === 'dual' && faceCameraActive) {
      const recent = liveFaceDetectionRef.current;
      const isFresh = Date.now() - recent.detectedAt <= 4500;
      const hasEnrolledFace = Boolean(faceProfiles[studentAnywhere.id]);

      if (dualVerifyRule === 'verify_barcode' && hasEnrolledFace) {
        if (!isFresh || !recent.hasFace) {
          playBeep('error');
          showToast(
            `Verifikasi Wajah Diperlukan: Arahkan wajah ${studentAnywhere.nama} ke kamera verifikasi lalu pindai ulang barcode.`,
            'error'
          );
          return;
        }
        if (recent.student && recent.student.id !== studentAnywhere.id) {
          playBeep('error');
          showToast(
            `Verifikasi Wajah Ditolak! Barcode milik ${studentAnywhere.nama}, tetapi wajah di kamera terdeteksi sebagai ${recent.student.nama}.`,
            'error'
          );
          return;
        }
        if (!recent.student) {
          playBeep('error');
          showToast(
            `Wajah belum cocok dengan ${studentAnywhere.nama}. Posisikan wajah lebih jelas ke kamera verifikasi.`,
            'error'
          );
          return;
        }
        recordAttendance(studentAnywhere, 'H', {
          skipIfAlreadyRecorded: true,
          methodLabel: `Barcode + Verifikasi Wajah ✓ (${recent.confidence}%)`,
          isFaceAttendance: true,
          confidence: recent.confidence,
        });
        return;
      }

      if (isFresh && recent.student?.id === studentAnywhere.id) {
        recordAttendance(studentAnywhere, 'H', {
          skipIfAlreadyRecorded: true,
          methodLabel: `Barcode + Verifikasi Wajah ✓ (${recent.confidence}%)`,
          isFaceAttendance: true,
          confidence: recent.confidence,
        });
        return;
      }

      recordAttendance(studentAnywhere, 'H', {
        skipIfAlreadyRecorded: true,
        methodLabel: hasEnrolledFace ? 'Scan Barcode' : 'Scan Barcode (Wajah Belum Terdaftar)',
      });
      return;
    }

    recordAttendance(studentAnywhere, 'H', {
      skipIfAlreadyRecorded: true,
      methodLabel: 'Scan Barcode / QR',
    });
  };

  const barcodeDetectedRef = useRef(handleBarcodeDetected);
  barcodeDetectedRef.current = handleBarcodeDetected;

  // Start Camera scanning using synced device camera helper
  const startCameraScanner = async (cameraId?: string) => {
    setIsInitializingCamera(true);
    try {
      const result = await startHtml5QrScanner({
        elementId: 'html5qr-code-full-region',
        preferredCameraId: cameraId || selectedCameraId || undefined,
        existingScanner: html5QrCodeRef.current,
        fps: 18,
        onSuccess: (decodedText: string) => {
          const now = Date.now();
          if (
            lastScannedRef.current.code === decodedText &&
            now - lastScannedRef.current.time < 2500
          ) {
            return;
          }
          lastScannedRef.current = { code: decodedText, time: now };
          barcodeDetectedRef.current(decodedText);
        },
      });

      html5QrCodeRef.current = result.scanner;
      if (result.cameras.length > 0) {
        setAvailableCameras(result.cameras);
      }
      if (result.activeCameraId) {
        setSelectedCameraId(result.activeCameraId);
      }
      setCameraActive(true);
      showToast('Kamera pemindai barcode aktif! Arahkan barcode ke layar.', 'success');
    } catch (err: unknown) {
      console.error('Camera startup error:', err);
      setCameraActive(false);
      showToast(`Gagal mengakses kamera: ${formatCameraErrorIndonesian(err)}`, 'error');
    } finally {
      setIsInitializingCamera(false);
    }
  };

  // Stop camera scanning
  const stopCameraScanner = async () => {
    await stopHtml5QrScanner(html5QrCodeRef.current);
    html5QrCodeRef.current = null;
    setCameraActive(false);
  };

  const toggleCamera = () => {
    if (cameraActive) {
      stopCameraScanner();
    } else {
      startCameraScanner(selectedCameraId || undefined);
    }
  };

  // Switch camera device smoothly while active
  const handleCameraChange = (cameraId: string) => {
    setSelectedCameraId(cameraId);
    if ((scanMode === 'barcode' || scanMode === 'dual') && cameraActive) {
      startCameraScanner(cameraId);
    } else if (scanMode === 'face' && faceCameraActive) {
      startFaceScanner(cameraId);
    }
  };

  const handleFaceLayerCameraChange = (cameraId: string) => {
    setFaceLayerCameraId(cameraId);
    if ((scanMode === 'face' || scanMode === 'dual') && faceCameraActive) {
      startFaceScanner(cameraId, { keepBarcodeRunning: scanMode === 'dual' });
    }
  };

  // Stop Face Recognition camera
  const stopFaceScanner = () => {
    stopFaceCameraStream(faceStreamRef.current, faceVideoRef.current);
    faceStreamRef.current = null;
    usingSharedFeedRef.current = false;
    setUsingSharedBarcodeFeed(false);
    setFaceCameraActive(false);
    setLiveDetectedFace(null);
    liveFaceDetectionRef.current = {
      student: null,
      confidence: 0,
      hasFace: false,
      detectedAt: 0,
    };
    if (faceCanvasRef.current) {
      const ctx = faceCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, faceCanvasRef.current.width, faceCanvasRef.current.height);
    }
    setFaceStatusText('Kamera layer wajah dimatikan');
  };

  const ensureFaceModels = async (): Promise<boolean> => {
    if (faceModelsReady) return true;
    setIsLoadingFaceModels(true);
    try {
      await loadFaceRecognitionModels();
      setFaceModelsReady(true);
      return true;
    } catch (err) {
      console.error('Gagal memuat model AI wajah:', err);
      showToast('Gagal memuat model deteksi wajah dari sistem.', 'error');
      return false;
    } finally {
      setIsLoadingFaceModels(false);
    }
  };

  // Start live Face Recognition camera via browser MediaDevices API (supports running alongside Barcode Scanner)
  const startFaceScanner = async (
    cameraId?: string,
    options?: { keepBarcodeRunning?: boolean; silentToast?: boolean }
  ) => {
    if (!faceVideoRef.current) return;
    setIsInitializingFaceCam(true);
    setFaceStatusText('Memuat model pengenalan wajah & MediaDevices...');
    try {
      if (!options?.keepBarcodeRunning) {
        await stopCameraScanner();
      }
      stopFaceCameraStream(faceStreamRef.current, faceVideoRef.current);
      faceStreamRef.current = null;
      usingSharedFeedRef.current = false;
      setUsingSharedBarcodeFeed(false);

      const modelsOk = await ensureFaceModels();
      if (!modelsOk) {
        setIsInitializingFaceCam(false);
        return;
      }

      const preferredId =
        cameraId ||
        (scanMode === 'dual' ? faceLayerCameraId : selectedCameraId) ||
        undefined;

      try {
        const { stream, activeCameraId } = await startFaceCameraStream(
          faceVideoRef.current,
          preferredId
        );
        faceStreamRef.current = stream;
        await refreshAvailableCameras(
          scanMode === 'dual' ? undefined : activeCameraId
        );
        setFaceCameraActive(true);
        setFaceStatusText(
          faceCandidatesRef.current.length === 0
            ? 'Kamera wajah aktif! Daftarkan wajah siswa agar otomatis terverifikasi.'
            : 'Layer Wajah aktif — arahkan wajah siswa ke bingkai...'
        );
        if (!options?.silentToast) {
          showToast('Kamera layer deteksi wajah aktif!', 'success');
        }
      } catch (camErr) {
        // Fallback for single-camera devices in Dual Mode: reuse MediaStream from the running barcode <video>
        const barcodeVideo = document.querySelector('#html5qr-code-full-region video') as HTMLVideoElement | null;
        if (options?.keepBarcodeRunning && barcodeVideo && barcodeVideo.srcObject) {
          faceVideoRef.current.srcObject = barcodeVideo.srcObject;
          await faceVideoRef.current.play().catch(() => {});
          usingSharedFeedRef.current = true;
          setUsingSharedBarcodeFeed(true);
          setFaceCameraActive(true);
          setFaceStatusText('Layer wajah aktif (berbagi feed kamera barcode tunggal)');
          if (!options?.silentToast) {
            showToast('Layer wajah aktif menggunakan feed kamera bersama!', 'success');
          }
        } else {
          throw camErr;
        }
      }
    } catch (err) {
      console.error('Face camera startup error:', err);
      setFaceCameraActive(false);
      setFaceStatusText('Gagal mengakses kamera wajah');
      showToast(`Gagal mengakses kamera wajah: ${formatCameraErrorIndonesian(err)}`, 'error');
    } finally {
      setIsInitializingFaceCam(false);
    }
  };

  const toggleFaceCamera = () => {
    if (faceCameraActive) {
      stopFaceScanner();
    } else {
      startFaceScanner(
        (scanMode === 'dual' ? faceLayerCameraId : selectedCameraId) || undefined,
        { keepBarcodeRunning: scanMode === 'dual' }
      );
    }
  };

  const toggleDualScanners = async () => {
    if (cameraActive && faceCameraActive) {
      await stopCameraScanner();
      stopFaceScanner();
      return;
    }
    if (!cameraActive) {
      await startCameraScanner(selectedCameraId || undefined);
    }
    if (!faceCameraActive) {
      await startFaceScanner(faceLayerCameraId || undefined, {
        keepBarcodeRunning: true,
        silentToast: true,
      });
      showToast('Mode Dual aktif: Pemindai Barcode & Layer Wajah MediaDevices berjalan bersamaan!', 'success');
    }
  };

  const handleSwitchScanMode = async (nextMode: 'barcode' | 'face' | 'dual') => {
    if (nextMode === scanMode) return;
    if (nextMode === 'face') {
      await stopCameraScanner();
    } else if (nextMode === 'barcode') {
      stopFaceScanner();
    } else if (nextMode === 'dual') {
      // Switching to dual keeps whichever camera is running and lets user run both alongside
    }
    setScanMode(nextMode);
  };

  const recordAttendanceRef = useRef(recordAttendance);
  recordAttendanceRef.current = recordAttendance;

  // Real-time continuous face detection & matching loop (runs in Face mode AND alongside Barcode in Dual mode)
  useEffect(() => {
    if (!faceCameraActive || (scanMode !== 'face' && scanMode !== 'dual')) return;
    let cancelled = false;
    let timerId: number | null = null;

    const runLoop = async () => {
      if (cancelled) return;
      const sharedVideo = usingSharedFeedRef.current
        ? (document.querySelector('#html5qr-code-full-region video') as HTMLVideoElement | null)
        : null;
      const video = faceVideoRef.current || sharedVideo;
      const canvas = faceCanvasRef.current;

      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const matches = await detectAndMatchFacesOnVideo(
            video,
            faceCandidatesRef.current,
            faceThreshold
          );

          if (cancelled) return;

          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (matches.length === 0) {
              liveFaceDetectionRef.current = {
                student: null,
                confidence: 0,
                hasFace: false,
                detectedAt: Date.now(),
              };
              setLiveDetectedFace(null);
              setFaceStatusText(
                faceCandidatesRef.current.length === 0
                  ? 'Belum ada wajah terdaftar — klik "Daftarkan Wajah Siswa"'
                  : 'Mencari wajah di depan kamera...'
              );
            } else {
              for (const m of matches) {
                const { x, y, width, height } = m.box;
                const isMatched = Boolean(m.matchedStudent);

                ctx.strokeStyle = isMatched ? '#10b981' : '#f59e0b';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, width, height);

                const labelText = isMatched && m.matchedStudent
                  ? `${m.matchedStudent.nama} (${m.confidence}%)`
                  : 'Wajah Belum Terdaftar';
                ctx.font = 'bold 14px sans-serif';
                const textW = ctx.measureText(labelText).width;
                const pillW = textW + 16;
                const pillH = 26;
                const pillY = Math.max(0, y - pillH - 4);

                ctx.fillStyle = isMatched ? 'rgba(5, 150, 105, 0.92)' : 'rgba(217, 119, 6, 0.92)';
                ctx.fillRect(x, pillY, pillW, pillH);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(labelText, x + 8, pillY + 18);
              }

              const bestMatched = matches.find((m) => m.matchedStudent !== null);
              if (bestMatched && bestMatched.matchedStudent) {
                const student = bestMatched.matchedStudent;
                const now = Date.now();
                const liveSnapshot = cropFaceThumbnail(video, bestMatched.box);
                liveFaceDetectionRef.current = {
                  student,
                  confidence: bestMatched.confidence,
                  hasFace: true,
                  detectedAt: now,
                };
                setLiveDetectedFace({
                  studentId: student.id,
                  studentName: student.nama,
                  confidence: bestMatched.confidence,
                  hasFace: true,
                  detectedAt: now,
                });

                pushFaceDetectionHistory({
                  student,
                  confidence: bestMatched.confidence,
                  outcome: 'detected',
                  methodLabel:
                    scanMode === 'dual'
                      ? `Dual Layer • Deteksi Wajah (${bestMatched.confidence}%)`
                      : `Deteksi Wajah (${bestMatched.confidence}%)`,
                  snapshotUrl: liveSnapshot,
                });

                const streak = faceMatchStreakRef.current;
                if (streak.studentId === student.id) {
                  streak.count += 1;
                } else {
                  streak.studentId = student.id;
                  streak.count = 1;
                }

                const meetsConfidenceThreshold = bestMatched.confidence > 90;

                if (scanMode === 'dual' && dualVerifyRule === 'verify_barcode' && !autoSubmitFaceAttendance) {
                  setFaceStatusText(
                    `Siap Verifikasi Barcode: ${student.nama} (${bestMatched.confidence}%)`
                  );
                } else if (autoSubmitFaceAttendance) {
                  setFaceStatusText(
                    meetsConfidenceThreshold
                      ? `Terdeteksi: ${student.nama} (${bestMatched.confidence}% > 90% • Auto-Submit)`
                      : `Terdeteksi: ${student.nama} (${bestMatched.confidence}% • butuh > 90% untuk Auto-Submit)`
                  );
                } else {
                  setFaceStatusText(
                    `Terdeteksi: ${student.nama} (${bestMatched.confidence}%) — Auto-Submit Nonaktif`
                  );
                }

                // Auto-submit attendance only when switch is ON, confidence > 90%, and cooldown elapsed
                const canTriggerFaceMode =
                  scanMode === 'face' ||
                  (scanMode === 'dual' && (dualVerifyRule === 'parallel' || meetsConfidenceThreshold));

                if (
                  autoSubmitFaceAttendance &&
                  canTriggerFaceMode &&
                  meetsConfidenceThreshold &&
                  now - streak.lastTrigger > 3500
                ) {
                  streak.lastTrigger = now;
                  streak.count = 0;
                  setLastScannedStudent(
                    `${student.nama} (${student.barcodeId}) • Auto-Submit Wajah ${bestMatched.confidence}%`
                  );
                  await recordAttendanceRef.current(student, 'H', {
                    skipIfAlreadyRecorded: true,
                    methodLabel:
                      scanMode === 'dual'
                        ? `Dual Layer • Auto-Submit Wajah (${bestMatched.confidence}%)`
                        : `Auto-Submit Wajah (${bestMatched.confidence}%)`,
                    isFaceAttendance: true,
                    confidence: bestMatched.confidence,
                    snapshotUrl: liveSnapshot,
                  });
                }
              } else {
                liveFaceDetectionRef.current = {
                  student: null,
                  confidence: 0,
                  hasFace: true,
                  detectedAt: Date.now(),
                };
                setLiveDetectedFace({
                  studentId: '',
                  studentName: '',
                  confidence: 0,
                  hasFace: true,
                  detectedAt: Date.now(),
                });
                faceMatchStreakRef.current.studentId = '';
                faceMatchStreakRef.current.count = 0;
                setFaceStatusText(
                  faceCandidatesRef.current.length === 0
                    ? 'Wajah terdeteksi, tetapi belum ada data wajah siswa yang terdaftar'
                    : 'Wajah terdeteksi tetapi belum cocok dengan data wajah terdaftar'
                );
              }
            }
          }
        } catch {
          // Skip transient frame errors silently
        }
      }

      if (!cancelled) {
        timerId = window.setTimeout(runLoop, 220);
      }
    };

    runLoop();
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [faceCameraActive, scanMode, faceThreshold, dualVerifyRule, autoSubmitFaceAttendance]);

  // Scan Face from Uploaded Photo File
  const handleScanFaceFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (faceCandidatesRef.current.length === 0) {
      showToast('Belum ada data wajah siswa yang terdaftar. Daftarkan wajah terlebih dahulu.', 'error');
      if (faceFileInputRef.current) faceFileInputRef.current.value = '';
      return;
    }

    setIsScanningFaceFile(true);
    try {
      const extracted = await extractDescriptorFromFile(file);
      if (!extracted) {
        playBeep('error');
        showToast('Tidak ada wajah yang terdeteksi jelas pada foto ini.', 'error');
        return;
      }
      const match = matchDescriptorAgainstStudents(
        extracted.descriptor,
        faceCandidatesRef.current,
        faceThreshold
      );
      if (match) {
        await recordAttendance(match.student, 'H', {
          skipIfAlreadyRecorded: true,
          methodLabel: `Foto Wajah (${match.confidence}%)`,
          isFaceAttendance: true,
          confidence: match.confidence,
          snapshotUrl: extracted.thumbnailDataUrl,
        });
        setLastScannedStudent(
          `${match.student.nama} (${match.student.barcodeId}) • Foto Wajah ${match.confidence}%`
        );
      } else {
        playBeep('error');
        showToast('Wajah pada foto tidak cocok dengan data wajah siswa yang terdaftar.', 'error');
      }
    } catch {
      playBeep('error');
      showToast('Gagal memproses foto wajah.', 'error');
    } finally {
      setIsScanningFaceFile(false);
      if (faceFileInputRef.current) faceFileInputRef.current.value = '';
    }
  };

  // Auto-index face descriptors from existing student profile photos
  const handleSyncFacesFromStudentPhotos = async () => {
    const candidatesToIndex = filteredStudents.filter(
      (s) => !faceProfiles[s.id] && isUsableRealPhotoUrl(s.fotoUrl)
    );
    if (candidatesToIndex.length === 0) {
      showToast(
        `Seluruh siswa kelas ${activeClass} dengan foto asli sudah terindeks, atau siswa masih memakai avatar bawaan (gunakan rekam kamera / unggah foto wajah).`,
        'error'
      );
      return;
    }

    setIsSyncingFromPhotos(true);
    try {
      const ok = await ensureFaceModels();
      if (!ok) return;

      const updated: Record<string, StoredFaceProfile> = { ...faceProfiles };
      let addedCount = 0;

      for (const s of candidatesToIndex) {
        const desc = await extractDescriptorFromImageUrl(s.fotoUrl);
        if (desc) {
          updated[s.id] = {
            studentId: s.id,
            descriptor: desc,
            sampleCount: 1,
            source: 'photo',
            updatedAt: new Date().toISOString(),
          };
          addedCount++;
        }
      }

      if (addedCount > 0) {
        setFaceProfiles(updated);
        saveStoredFaceProfiles(updated);
        showToast(
          `Berhasil mendaftarkan wajah otomatis dari ${addedCount} foto profil siswa kelas ${activeClass}!`,
          'success'
        );
      } else {
        showToast(
          'Tidak ada wajah yang terdeteksi jelas pada foto profil siswa. Gunakan tombol Rekam Kamera atau Unggah Foto.',
          'error'
        );
      }
    } finally {
      setIsSyncingFromPhotos(false);
    }
  };

  // Start / Stop Enrollment Modal preview stream
  useEffect(() => {
    let active = true;
    const setupEnrollCam = async () => {
      if (!isFaceEnrollModalOpen) {
        stopFaceCameraStream(enrollStreamRef.current, enrollVideoRef.current);
        enrollStreamRef.current = null;
        return;
      }
      if (!enrollStudentId && filteredStudents.length > 0) {
        setEnrollStudentId(filteredStudents[0].id);
      }
      // Pause main camera scanners while modal preview uses webcam
      await stopCameraScanner();
      stopFaceScanner();
      await ensureFaceModels();
      if (!active || !enrollVideoRef.current) return;
      try {
        const { stream } = await startFaceCameraStream(
          enrollVideoRef.current,
          selectedCameraId || undefined
        );
        if (!active) {
          stopFaceCameraStream(stream);
          return;
        }
        enrollStreamRef.current = stream;
      } catch {
        // User can still enroll via photo file upload if camera is unavailable
      }
    };
    setupEnrollCam();
    return () => {
      active = false;
      stopFaceCameraStream(enrollStreamRef.current, enrollVideoRef.current);
      enrollStreamRef.current = null;
    };
  }, [isFaceEnrollModalOpen]);

  // Capture 3 face samples from camera in Enrollment Modal and save averaged descriptor
  const handleEnrollFaceFromCamera = async () => {
    const target = students.find((s) => s.id === enrollStudentId);
    if (!target) {
      showToast('Pilih siswa terlebih dahulu.', 'error');
      return;
    }
    const videoEl = enrollVideoRef.current;
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
      showToast('Kamera pendaftaran belum siap. Gunakan unggah foto jika perangkat tanpa kamera.', 'error');
      return;
    }

    setIsEnrollingCamera(true);
    try {
      const ok = await ensureFaceModels();
      if (!ok) return;

      const samples: number[][] = [];
      let thumbnailDataUrl = '';
      for (let i = 1; i <= 3; i++) {
        setEnrollProgressText(`Mengambil sampel wajah ${i}/3... Hadapkan wajah ke kamera`);
        const detected = await extractSingleFaceDescriptor(videoEl, {
          inputSize: 320,
          scoreThreshold: 0.4,
        });
        if (detected) {
          samples.push(detected.descriptor);
          if (!thumbnailDataUrl) {
            thumbnailDataUrl = cropFaceThumbnail(videoEl, detected.box);
          }
        }
        if (i < 3) {
          await new Promise((r) => setTimeout(r, 260));
        }
      }

      if (samples.length === 0) {
        playBeep('error');
        showToast('Wajah tidak terdeteksi jelas di kamera. Pastikan pencahayaan cukup.', 'error');
        return;
      }

      const averaged = averageFaceDescriptors(samples);
      const nextMap: Record<string, StoredFaceProfile> = {
        ...faceProfiles,
        [target.id]: {
          studentId: target.id,
          descriptor: averaged,
          sampleCount: samples.length,
          source: 'camera',
          updatedAt: new Date().toISOString(),
          thumbnailDataUrl: thumbnailDataUrl || faceProfiles[target.id]?.thumbnailDataUrl,
        },
      };
      setFaceProfiles(nextMap);
      saveStoredFaceProfiles(nextMap);
      playBeep('success');
      showToast(
        `Wajah ${target.nama} berhasil direkam (${samples.length} sampel) & tersinkron ke Cloud!`,
        'success'
      );
    } finally {
      setIsEnrollingCamera(false);
      setEnrollProgressText('');
    }
  };

  // Enroll student face from uploaded image file
  const handleEnrollFaceFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const target = students.find((s) => s.id === enrollStudentId);
    if (!target) {
      showToast('Pilih siswa terlebih dahulu.', 'error');
      if (enrollFileInputRef.current) enrollFileInputRef.current.value = '';
      return;
    }

    setIsEnrollingCamera(true);
    setEnrollProgressText('Mengekstrak fitur wajah dari foto...');
    try {
      const extracted = await extractDescriptorFromFile(file);
      if (!extracted) {
        playBeep('error');
        showToast('Tidak ditemukan wajah yang jelas pada foto yang diunggah.', 'error');
        return;
      }
      const nextMap: Record<string, StoredFaceProfile> = {
        ...faceProfiles,
        [target.id]: {
          studentId: target.id,
          descriptor: extracted.descriptor,
          sampleCount: 1,
          source: 'upload',
          updatedAt: new Date().toISOString(),
          thumbnailDataUrl: extracted.thumbnailDataUrl,
        },
      };
      setFaceProfiles(nextMap);
      saveStoredFaceProfiles(nextMap);
      playBeep('success');
      showToast(`Wajah ${target.nama} berhasil didaftarkan dari foto!`, 'success');
    } catch {
      playBeep('error');
      showToast('Gagal memproses foto wajah siswa.', 'error');
    } finally {
      setIsEnrollingCamera(false);
      setEnrollProgressText('');
      if (enrollFileInputRef.current) enrollFileInputRef.current.value = '';
    }
  };

  const handleDeleteFaceProfile = (studentId: string) => {
    const target = students.find((s) => s.id === studentId);
    const nextMap = { ...faceProfiles };
    delete nextMap[studentId];
    setFaceProfiles(nextMap);
    saveStoredFaceProfiles(nextMap);
    showToast(`Data wajah ${target?.nama || 'siswa'} dihapus.`, 'success');
  };

  // Scan from uploaded file / photo
  const handleFileUploadScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanningFile(true);
    try {
      const decodedText = await scanBarcodeFromImageFile('temp-barcode-reader-helper', file);
      barcodeDetectedRef.current(decodedText);
    } catch {
      playBeep('error');
      showToast('Tidak ditemukan barcode yang terbaca pada foto ini.', 'error');
    } finally {
      setIsScanningFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Support USB / Bluetooth Handheld Barcode Scanner
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is typing in regular text inputs or textareas
      const activeElement = document.activeElement;
      const isInput =
        activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
      if (isInput && activeElement.id !== 'manual_barcode_input') {
        return;
      }

      const now = Date.now();
      if (now - keyBufferRef.current.lastKeyTime > 200) {
        keyBufferRef.current.buffer = '';
      }
      keyBufferRef.current.lastKeyTime = now;

      if (e.key === 'Enter') {
        if (keyBufferRef.current.buffer.length >= 3) {
          const scanned = keyBufferRef.current.buffer;
          keyBufferRef.current.buffer = '';
          barcodeDetectedRef.current(scanned);
        }
      } else if (e.key.length === 1) {
        keyBufferRef.current.buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [filteredStudents, students, activeDate, attendanceRecords]);

  // Clean up scanner & face streams on unmount
  useEffect(() => {
    return () => {
      stopHtml5QrScanner(html5QrCodeRef.current);
      html5QrCodeRef.current = null;
      stopFaceCameraStream(faceStreamRef.current, faceVideoRef.current);
      faceStreamRef.current = null;
      stopFaceCameraStream(enrollStreamRef.current, enrollVideoRef.current);
      enrollStreamRef.current = null;
    };
  }, []);

  // Manual code submit
  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    const query = manualCode.trim().toLowerCase();
    const student =
      filteredStudents.find(
        (s) =>
          s.barcodeId.toLowerCase() === query ||
          s.nisn.toLowerCase() === query ||
          s.nama.toLowerCase().includes(query)
      ) ||
      students.find(
        (s) =>
          s.barcodeId.toLowerCase() === query ||
          s.nisn.toLowerCase() === query ||
          s.nama.toLowerCase().includes(query)
      );

    if (student) {
      recordAttendance(student, 'H', { skipIfAlreadyRecorded: true });
      setManualCode('');
    } else {
      playBeep('error');
      showToast(`Siswa dengan kode/nama "${manualCode}" tidak ditemukan`, 'error');
    }
  };

  const handleStatusChange = (studentId: string, newStatus: 'H' | 'S' | 'I' | 'A') => {
    const student = students.find((s) => s.id === studentId);
    if (student) {
      recordAttendance(student, newStatus);
    }
  };

  const markAllPresent = async () => {
    if (filteredStudents.length === 0) {
      showToast(`Tidak ada siswa terdaftar pada kelas ${activeClass}.`, 'error');
      return;
    }
    setIsBatchSaving(true);
    try {
      const timeStr = getLocalTimeStr(new Date(), false);
      const batchRecords: AttendanceRecordItem[] = filteredStudents.map((s) => {
        const key = `${activeDate}_${s.id}`;
        const existing = attendanceRecords[key];
        return {
          id: key,
          studentId: s.id,
          date: activeDate,
          status: 'H',
          time: existing?.status === 'H' && existing.time ? existing.time : timeStr,
        };
      });

      await onSaveBatchAttendance(batchRecords);
      showToast(
        `Seluruh ${filteredStudents.length} siswa (${activeClass}) tersimpan Hadir & tersinkron ke Kalender!`,
        'success'
      );
    } catch (error) {
      console.error('Gagal menyimpan hadir massal:', error);
      showToast('Gagal menyimpan presensi massal ke Cloud Firestore.', 'error');
    } finally {
      setIsBatchSaving(false);
    }
  };

  // Ringkasan kehadiran harian kelas aktif untuk tanggal terpilih
  const dailySummary = filteredStudents.reduce(
    (acc, s) => {
      const rec = attendanceRecords[`${activeDate}_${s.id}`];
      if (!rec) acc.belum++;
      else if (rec.status === 'H') acc.hadir++;
      else if (rec.status === 'S') acc.sakit++;
      else if (rec.status === 'I') acc.izin++;
      else if (rec.status === 'A') acc.alfa++;
      return acc;
    },
    { hadir: 0, sakit: 0, izin: 0, alfa: 0, belum: 0 }
  );

  return (
    <section className="space-y-6">
      {/* Hidden helper element for file scanning */}
      <div id="temp-barcode-reader-helper" className="hidden" />

      {/* Sub-menu Navigation Bar */}
      <div className="bg-white p-4 rounded-3xl shadow-xs border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-emerald-200">
            <QrCode className="w-5 h-5" />
          </span>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-wider">
              Sub-Menu 2.2 • Terhubung ke Kalender, e-Rapor & Cloud
            </span>
            <h3 className="font-display font-black text-sm sm:text-base text-slate-800">
              Scan Barcode, Scan Wajah &amp; Presensi Harian ({activeClass})
            </h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-xs font-black flex items-center gap-1.5 shadow-xs">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>{liveClock} WIB</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenCalendarForDate(activeDate)}
            className="bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-800 border border-rose-200 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4" /> Buka Kalender Pendidikan
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('laporan-absensi')}
            className="bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Clock className="w-4 h-4" /> Buka Laporan Kehadiran
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Scanner (Barcode & Face ID) & Input Tools */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span
                className={`text-xs font-extrabold uppercase px-3 py-1 rounded-full ${
                  scanMode === 'dual'
                    ? 'bg-purple-100 text-purple-800'
                    : scanMode === 'face'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {scanMode === 'dual'
                  ? 'Dual Mode: Barcode + Layer Wajah'
                  : scanMode === 'face'
                  ? 'Pemindai Wajah Otomatis (Face ID)'
                  : 'Pemindai Barcode Otomatis'}
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1.5 flex items-center gap-2">
                {scanMode === 'dual'
                  ? 'Barcode + Verifikasi Wajah'
                  : scanMode === 'face'
                  ? 'Scan Wajah Siswa'
                  : 'Scan Kamera Siswa'}
                <span
                  className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                    scanMode === 'dual'
                      ? 'bg-purple-500'
                      : scanMode === 'face'
                      ? 'bg-indigo-500'
                      : 'bg-emerald-500'
                  }`}
                />
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <LinkIcon className="w-3 h-3 text-emerald-600" /> Firestore Realtime
            </span>
          </div>

          {/* Mode Switcher: Scan Barcode vs Scan Wajah vs Dual Verification Layer */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => handleSwitchScanMode('barcode')}
              className={`py-2 px-2 rounded-xl text-[11px] font-display font-black flex items-center justify-center gap-1 transition cursor-pointer ${
                scanMode === 'barcode'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <QrCode className="w-3.5 h-3.5 shrink-0" />
              <span>Barcode</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchScanMode('face')}
              className={`py-2 px-2 rounded-xl text-[11px] font-display font-black flex items-center justify-center gap-1 transition cursor-pointer ${
                scanMode === 'face'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <ScanFace className="w-3.5 h-3.5 shrink-0" />
              <span>Wajah ({classEnrolledCount}/{filteredStudents.length})</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchScanMode('dual')}
              className={`py-2 px-2 rounded-xl text-[11px] font-display font-black flex items-center justify-center gap-1 transition cursor-pointer ${
                scanMode === 'dual'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
              title="Jalankan Layer Deteksi Wajah MediaDevices bersamaan dengan Scanner Barcode"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Dual Layer</span>
            </button>
          </div>

          {/* Date Picker & Kaldik Holiday Indicator */}
          <div
            className={`p-3.5 rounded-2xl border space-y-2 ${
              isHoliday ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-slate-800">
                    <Calendar className="w-3.5 h-3.5 inline mr-1 text-rose-600" />
                    {formatTanggalIndo(activeDate)}
                  </span>
                  {activeDate === liveTodayStr && (
                    <span className="text-[10px] font-black uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                      Hari Ini
                    </span>
                  )}
                </div>
                <span className={`text-[11px] font-bold block mt-0.5 ${isHoliday ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {isHoliday
                    ? `Status Kaldik: Libur (${activeDayKaldik?.keterangan || 'Hari Minggu'})`
                    : `Status Kaldik: ${activeDayKaldik?.keterangan || 'Hari Efektif Belajar'}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {activeDate !== liveTodayStr && (
                  <button
                    type="button"
                    onClick={() => setActiveDate(liveTodayStr)}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold cursor-pointer shadow-xs"
                    title={`Kembali ke tanggal hari ini (${liveTodayStr})`}
                  >
                    Ke Hari Ini
                  </button>
                )}
                <input
                  type="date"
                  value={activeDate}
                  onChange={(e) => setActiveDate(e.target.value || liveTodayStr)}
                  className="px-3 py-1.5 rounded-xl border border-rose-300 bg-white font-mono font-bold text-xs shadow-xs"
                />
              </div>
            </div>
            {isHoliday && (
              <div className="text-[11px] text-rose-800 bg-white/80 px-2.5 py-1.5 rounded-xl border border-rose-200 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  Tanggal ini ditandai libur di Kalender Pendidikan.
                </span>
                <button
                  type="button"
                  onClick={() => onOpenCalendarForDate(activeDate)}
                  className="font-extrabold text-rose-700 underline cursor-pointer shrink-0"
                >
                  Ubah di Kaldik
                </button>
              </div>
            )}
          </div>

          {/* Camera Controls & Selection */}
          <div className="space-y-2">
            {scanMode === 'barcode' ? (
              <div className="flex items-center justify-between bg-slate-100 p-2.5 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-slate-700">Kamera Scanner (CODE-128 &amp; QR)</span>
                </div>
                <button
                  type="button"
                  onClick={toggleCamera}
                  disabled={isInitializingCamera}
                  className={`text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    cameraActive
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {isInitializingCamera ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Memuat...</span>
                    </>
                  ) : cameraActive ? (
                    <>
                      <VideoOff className="w-4 h-4" />
                      <span>Matikan Kamera</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4" />
                      <span>Aktifkan Kamera</span>
                    </>
                  )}
                </button>
              </div>
            ) : scanMode === 'face' ? (
              <div className="flex items-center justify-between bg-indigo-50 p-2.5 rounded-2xl border border-indigo-200">
                <div className="flex items-center gap-2">
                  <ScanFace className="w-4 h-4 text-indigo-700" />
                  <span className="text-xs font-bold text-indigo-900">Kamera Scan Wajah (Face ID)</span>
                </div>
                <button
                  type="button"
                  onClick={toggleFaceCamera}
                  disabled={isInitializingFaceCam || isLoadingFaceModels}
                  className={`text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    faceCameraActive
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {isInitializingFaceCam || isLoadingFaceModels ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Memuat AI...</span>
                    </>
                  ) : faceCameraActive ? (
                    <>
                      <VideoOff className="w-4 h-4" />
                      <span>Matikan Kamera</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4" />
                      <span>Aktifkan Kamera Wajah</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-purple-50 p-2.5 rounded-2xl border border-purple-200">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-700" />
                  <div>
                    <span className="text-xs font-extrabold text-purple-950 block">
                      Kamera Dual (Barcode + Layer Wajah)
                    </span>
                    <span className="text-[10px] text-purple-700 font-semibold">
                      {cameraActive && faceCameraActive
                        ? 'Keduanya aktif berjalan bersamaan'
                        : 'Aktifkan pemindai barcode & layer wajah'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleDualScanners}
                  disabled={isInitializingCamera || isInitializingFaceCam || isLoadingFaceModels}
                  className={`text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    cameraActive && faceCameraActive
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  {isInitializingCamera || isInitializingFaceCam || isLoadingFaceModels ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyiapkan Dual...</span>
                    </>
                  ) : cameraActive && faceCameraActive ? (
                    <>
                      <VideoOff className="w-4 h-4" />
                      <span>Matikan Dual Kamera</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4" />
                      <span>Aktifkan Dual Kamera</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Camera device selection & refresh control */}
            {availableCameras.length > 0 && (
              <div className="space-y-1.5 px-1 text-xs">
                <div className="flex items-center gap-2">
                  <SwitchCamera className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-600 shrink-0">
                    {scanMode === 'dual' ? 'Kamera Barcode:' : 'Kamera:'}
                  </span>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    className="flex-1 min-w-0 text-[11px] py-1 px-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-700"
                  >
                    {availableCameras.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => refreshAvailableCameras(selectedCameraId)}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer shrink-0"
                    title="Sinkronkan ulang daftar kamera perangkat"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {scanMode === 'dual' && (
                  <div className="flex items-center gap-2">
                    <ScanFace className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span className="text-[11px] font-bold text-purple-800 shrink-0">Kamera Wajah:</span>
                    <select
                      value={faceLayerCameraId}
                      onChange={(e) => handleFaceLayerCameraChange(e.target.value)}
                      className="flex-1 min-w-0 text-[11px] py-1 px-2 rounded-lg border border-purple-300 bg-white font-medium text-purple-900"
                    >
                      {availableCameras.map((c) => (
                        <option key={`face_${c.id}`} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pengaturan Auto-Submit Absen Wajah (> 90%) — selalu terlihat di pengaturan AbsensiTab */}
          <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                <ScanFace className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                <span>Auto-Submit Absen Wajah</span>
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-black">
                  &gt; 90%
                </span>
              </div>
              <p className="text-[11px] text-indigo-800/80 mt-0.5 leading-snug">
                {autoSubmitFaceAttendance
                  ? 'Aktif — kehadiran otomatis disimpan saat kepercayaan deteksi wajah di atas 90%.'
                  : 'Nonaktif — tampilkan tombol konfirmasi manual saat wajah siswa terdeteksi.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoSubmitFaceAttendance}
              aria-label="Auto-Submit Absen Wajah"
              onClick={() => handleToggleAutoSubmitFace(!autoSubmitFaceAttendance)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoSubmitFaceAttendance ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                  autoSubmitFaceAttendance ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Pengaturan Notifikasi & Log Otomatis Telegram / WhatsApp (Absen Wajah) */}
          <div className="p-3 rounded-2xl bg-sky-50/80 border border-sky-200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-sky-950 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                <span>Notifikasi Otomatis Telegram / WA</span>
              </div>
              <p className="text-[11px] text-sky-800/85 mt-0.5 leading-snug">
                {notifConfig.enabled
                  ? notifConfig.telegramBotToken || notifConfig.whatsappWebhookUrl
                    ? `Aktif — otomatis kirim & catat log saat absen wajah (${notifConfig.channelMode === 'both' ? 'Telegram & WA' : notifConfig.channelMode === 'telegram' ? 'Telegram' : notifConfig.channelMode === 'whatsapp' ? 'WhatsApp' : 'Log Saja'}).`
                    : 'Aktif — otomatis catat log status & siap kirim WA/Telegram.'
                  : 'Nonaktif — notifikasi otomatis dimatikan.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setNotifDraft(notifConfig);
                  setIsNotifSettingsOpen(true);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-sky-100 text-sky-800 border border-sky-300 text-[11px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Konfigurasi Bot Telegram & Webhook WhatsApp"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Atur</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={notifConfig.enabled}
                aria-label="Notifikasi Otomatis Telegram dan WhatsApp"
                onClick={() => handleToggleAutoNotif(!notifConfig.enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifConfig.enabled ? 'bg-sky-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                    notifConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Dual Verification Rule Config */}
          {scanMode === 'dual' && (
            <div className="p-3 rounded-2xl bg-purple-50/80 border border-purple-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-purple-950">Aturan Layer Wajah:</span>
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-purple-200">
                <button
                  type="button"
                  onClick={() => setDualVerifyRule('verify_barcode')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                    dualVerifyRule === 'verify_barcode'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-600 hover:text-purple-800'
                  }`}
                >
                  Wajib Cocok Saat Scan Barcode
                </button>
                <button
                  type="button"
                  onClick={() => setDualVerifyRule('parallel')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                    dualVerifyRule === 'parallel'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-600 hover:text-purple-800'
                  }`}
                >
                  Simultan (Barcode / Wajah)
                </button>
              </div>
            </div>
          )}

          {/* Camera Viewport Container (Barcode Mode vs Face Recognition Mode vs Dual Mode) */}
          <div className="space-y-3">
            {/* Barcode Viewport — shown in Barcode mode and Dual mode */}
            {(scanMode === 'barcode' || scanMode === 'dual') && (
              <div
                className={`relative rounded-3xl overflow-hidden bg-slate-950 border-4 border-emerald-400 shadow-inner flex flex-col items-center justify-center text-white ${
                  scanMode === 'dual' ? 'min-h-[195px]' : 'min-h-[250px]'
                }`}
              >
                <div
                  id="html5qr-code-full-region"
                  className={`w-full h-full ${
                    scanMode === 'dual' ? 'min-h-[195px]' : 'min-h-[250px]'
                  } ${cameraActive || isInitializingCamera ? 'block' : 'hidden'}`}
                />

                {cameraActive && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase text-emerald-400 tracking-wider bg-black/45 backdrop-blur-xs px-2.5 py-1 rounded-full w-fit">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1.5" />
                      Scanner Barcode Aktif
                    </div>
                    <div className="laser-line" />
                    <div className="text-center text-[11px] font-bold text-white/90 bg-black/50 backdrop-blur-xs py-1 px-3 rounded-xl mx-auto">
                      Arahkan garis barcode (CODE-128) ke kotak pemindai
                    </div>
                  </div>
                )}

                {!cameraActive && !isInitializingCamera && (
                  <div className="relative z-10 text-center p-5 space-y-2.5">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 mx-auto flex items-center justify-center text-emerald-400 border border-white/10 shadow-lg">
                      <QrCode className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-display font-black text-sm text-white">
                        {scanMode === 'dual' ? 'Layer Pemindai Barcode' : 'Pemindai Barcode Siap Digunakan'}
                      </p>
                      <p className="text-xs text-slate-300 max-w-xs mt-1">
                        {scanMode === 'dual'
                          ? 'Klik Aktifkan Dual Kamera di atas atau nyalakan barcode secara terpisah.'
                          : 'Klik Aktifkan Kamera di atas untuk memindai kartu barcode siswa secara langsung.'}
                      </p>
                    </div>
                    <div className="pt-1 flex flex-wrap justify-center gap-2">
                      {scanMode === 'dual' && (
                        <button
                          type="button"
                          onClick={toggleCamera}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Nyalakan Barcode</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isScanningFile}
                        className="bg-white/10 hover:bg-white/20 text-emerald-300 text-xs font-bold px-3 py-1.5 rounded-xl border border-white/20 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isScanningFile ? 'Menganalisis Foto...' : 'Unggah Foto Barcode'}</span>
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleFileUploadScan}
                        className="hidden"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Face Recognition Layer Viewport — shown in Face mode AND alongside Barcode in Dual mode */}
            {(scanMode === 'face' || scanMode === 'dual') && (
              <div className="space-y-3">
                <div
                  className={`relative rounded-3xl overflow-hidden bg-slate-950 border-4 ${
                    scanMode === 'dual' ? 'border-purple-400 min-h-[205px]' : 'border-indigo-400 min-h-[270px]'
                  } shadow-inner flex flex-col items-center justify-center text-white`}
                >
                  <video
                    ref={faceVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full object-cover ${
                      scanMode === 'dual' ? 'h-[205px]' : 'h-[270px]'
                    } ${faceCameraActive || isInitializingFaceCam ? 'block' : 'hidden'}`}
                  />
                  <canvas
                    ref={faceCanvasRef}
                    className={`pointer-events-none absolute inset-0 w-full object-cover z-10 ${
                      scanMode === 'dual' ? 'h-[205px]' : 'h-[270px]'
                    } ${faceCameraActive ? 'block' : 'hidden'}`}
                  />

                  {faceCameraActive && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center text-[10px] font-black uppercase text-indigo-200 tracking-wider bg-black/55 backdrop-blur-xs px-2.5 py-1 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping mr-1.5" />
                          Layer Wajah MediaDevices • {faceCandidates.length} Profil
                          {usingSharedBarcodeFeed ? ' (Kamera Bersama)' : ''}
                        </div>
                        {liveDetectedFace?.studentId && (
                          <span className="bg-emerald-600/90 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-xs">
                            ✓ {liveDetectedFace.studentName.split(' ')[0]} ({liveDetectedFace.confidence}%)
                          </span>
                        )}
                      </div>
                      <div className="text-center text-[11px] font-bold text-white/95 bg-black/60 backdrop-blur-xs py-1.5 px-3 rounded-xl mx-auto max-w-full truncate">
                        {faceStatusText}
                      </div>
                    </div>
                  )}

                  {!faceCameraActive && !isInitializingFaceCam && (
                    <div className="relative z-10 text-center p-5 space-y-2.5">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 mx-auto flex items-center justify-center text-indigo-300 border border-indigo-400/30 shadow-lg">
                        <ScanFace className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-display font-black text-sm text-white">
                          {scanMode === 'dual'
                            ? 'Layer Verifikasi Wajah (MediaDevices)'
                            : 'Pemindai Wajah Siswa (Face ID)'}
                        </p>
                        <p className="text-xs text-slate-300 max-w-xs mt-1 mx-auto">
                          {faceCandidates.length === 0
                            ? 'Daftarkan wajah siswa terlebih dahulu (via kamera atau foto profil).'
                            : scanMode === 'dual'
                            ? `${faceCandidates.length} wajah siswa siap memverifikasi scan barcode secara bersamaan.`
                            : `${faceCandidates.length} wajah siswa siap dipindai. Klik Aktifkan Kamera Wajah di atas.`}
                        </p>
                      </div>
                      <div className="pt-1 flex flex-wrap justify-center gap-2">
                        {scanMode === 'dual' && (
                          <button
                            type="button"
                            onClick={toggleFaceCamera}
                            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Nyalakan Layer Wajah</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEnrollStudentId(filteredStudents[0]?.id || students[0]?.id || '');
                            setIsFaceEnrollModalOpen(true);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Daftarkan Wajah</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => faceFileInputRef.current?.click()}
                          disabled={isScanningFaceFile}
                          className="bg-white/10 hover:bg-white/20 text-indigo-200 text-xs font-bold px-3 py-1.5 rounded-xl border border-white/20 transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{isScanningFaceFile ? 'Mengenali...' : 'Foto Wajah'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <input
                  type="file"
                  ref={faceFileInputRef}
                  accept="image/*"
                  onChange={handleScanFaceFromFile}
                  className="hidden"
                />

                {/* Face Enrollment & Accuracy Controls Bar */}
                <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-700 shrink-0" />
                      <span className="text-xs font-extrabold text-indigo-950">
                        Database Wajah {activeClass}: {classEnrolledCount}/{filteredStudents.length} Siswa
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-indigo-700">Akurasi:</span>
                      <select
                        value={String(faceThreshold)}
                        onChange={(e) => setFaceThreshold(Number(e.target.value))}
                        className="px-2 py-1 rounded-lg border border-indigo-300 bg-white text-[11px] font-bold text-indigo-900 outline-none"
                        title="Tingkat kecocokan wajah"
                      >
                        <option value="0.44">Ketat (Sangat Mirip)</option>
                        <option value="0.5">Normal (Disarankan)</option>
                        <option value="0.56">Toleran (Cahaya Redup)</option>
                      </select>
                    </div>
                  </div>

                  {/* Manual Confirm Action when face is detected & auto-submit is OFF or <= 90% */}
                  {faceCameraActive &&
                    liveDetectedFace?.studentId &&
                    (!autoSubmitFaceAttendance || liveDetectedFace.confidence <= 90) && (() => {
                      const detectedStudent = students.find((s) => s.id === liveDetectedFace.studentId);
                      if (!detectedStudent) return null;
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            recordAttendance(detectedStudent, 'H', {
                              skipIfAlreadyRecorded: true,
                              methodLabel: `Konfirmasi Wajah (${liveDetectedFace.confidence}%)`,
                              isFaceAttendance: true,
                              confidence: liveDetectedFace.confidence,
                            })
                          }
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-display font-black px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            Simpan Hadir: {detectedStudent.nama} ({liveDetectedFace.confidence}%)
                          </span>
                        </button>
                      );
                    })()}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEnrollStudentId(filteredStudents[0]?.id || students[0]?.id || '');
                        setIsFaceEnrollModalOpen(true);
                      }}
                      className="flex-1 min-w-[140px] bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Kelola &amp; Rekam Wajah
                    </button>
                    <button
                      type="button"
                      onClick={handleSyncFacesFromStudentPhotos}
                      disabled={isSyncingFromPhotos}
                      className="bg-white hover:bg-indigo-100 disabled:opacity-60 text-indigo-800 border border-indigo-300 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      title="Ekstrak wajah otomatis dari foto profil asli siswa di Data Siswa"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isSyncingFromPhotos ? 'animate-spin' : ''}`} />
                      <span>{isSyncingFromPhotos ? 'Memindai Foto...' : 'Ambil dari Foto Profil'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => faceFileInputRef.current?.click()}
                      disabled={isScanningFaceFile}
                      className="bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-300 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      title="Pindai kehadiran dari file foto wajah"
                    >
                      <FileImage className="w-3.5 h-3.5" />
                      <span>Scan File</span>
                    </button>
                  </div>
                </div>

                {/* Panel Histori 5 Deteksi Wajah Terakhir (Bukti Verifikasi Visual) */}
                <div className="p-3.5 rounded-2xl bg-white border border-indigo-200 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                        <History className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-display font-black text-xs text-slate-800 truncate">
                          Histori 5 Deteksi Wajah Terakhir ({faceDetectionHistory.length}/5)
                        </h4>
                        <p className="text-[10px] text-slate-500 truncate">
                          Bukti verifikasi visual real-time beserta nama siswa &amp; timestamp
                        </p>
                      </div>
                    </div>
                    {faceDetectionHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearFaceDetectionHistory}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-[10px] font-extrabold cursor-pointer transition whitespace-nowrap shrink-0"
                      >
                        Bersihkan
                      </button>
                    )}
                  </div>

                  {faceDetectionHistory.length === 0 ? (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 text-center">
                      Belum ada histori deteksi wajah. Arahkan wajah siswa ke kamera atau unggah foto wajah untuk mencatat bukti visual.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {faceDetectionHistory.map((item, idx) => {
                        const outcomeLabel =
                          item.outcome === 'saved'
                            ? '✓ Hadir Tercatat'
                            : item.outcome === 'already_recorded'
                            ? '• Sudah Hadir'
                            : '• Terdeteksi';
                        const outcomeCls =
                          item.outcome === 'saved'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : item.outcome === 'already_recorded'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200';
                        return (
                          <div
                            key={item.id}
                            className="p-2 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2.5 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-[10px] font-mono font-bold text-slate-400 w-4 text-center shrink-0">
                                {idx + 1}.
                              </span>
                              {item.snapshotUrl ? (
                                <img
                                  src={item.snapshotUrl}
                                  alt={`Snapshot wajah ${item.studentName}`}
                                  referrerPolicy="no-referrer"
                                  onClick={() =>
                                    onOpenZoom(
                                      item.snapshotUrl,
                                      `${item.studentName} • ${item.date} ${item.timestamp}`
                                    )
                                  }
                                  className="w-10 h-10 rounded-xl object-cover border border-indigo-200 shrink-0 cursor-zoom-in shadow-2xs"
                                  title="Klik untuk memperbesar bukti visual deteksi wajah"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                                  <ScanFace className="w-5 h-5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-display font-black text-slate-800 truncate">
                                  {item.studentName}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono tabular-nums truncate">
                                  {item.studentClass} · {item.date} <strong className="text-slate-700">{item.timestamp}</strong> · Akurasi {item.confidence}%
                                </div>
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold shrink-0 whitespace-nowrap ${outcomeCls}`}
                            >
                              {outcomeLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* NOTIFIKASI HASIL SCAN SESUAI WARNA STATUS (Hijau=Hadir, Biru=Sakit, Kuning=Izin, Merah=Alpa) */}
          {scannedSuccessItem && (() => {
            const isDuplicate = Boolean(scannedSuccessItem.alreadyPresent);
            const statusThemeMap: Record<
              'H' | 'S' | 'I' | 'A',
              {
                statusText: string;
                cardCls: string;
                badgeCls: string;
                iconWrapCls: string;
                subTextCls: string;
                closeBtnCls: string;
                dupBoxCls: string;
                dupIconCls: string;
                footerBorderCls: string;
                dotCls: string;
                timePillCls: string;
              }
            > = {
              H: {
                statusText: 'HADIR (H)',
                cardCls: 'bg-gradient-to-r from-emerald-600 to-green-600 border-emerald-300 text-white',
                badgeCls: 'bg-white/20 text-emerald-50',
                iconWrapCls: 'bg-white text-emerald-600',
                subTextCls: 'text-emerald-100',
                closeBtnCls: 'bg-white/20 hover:bg-white/30 text-white',
                dupBoxCls: 'bg-black/20 border-white/25 text-white',
                dupIconCls: 'text-emerald-200',
                footerBorderCls: 'border-emerald-300/40',
                dotCls: 'bg-emerald-200',
                timePillCls: 'bg-emerald-950/50 text-emerald-100 border-emerald-300/30',
              },
              S: {
                statusText: 'SAKIT (S)',
                cardCls: 'bg-gradient-to-r from-blue-600 to-sky-600 border-blue-300 text-white',
                badgeCls: 'bg-white/20 text-blue-50',
                iconWrapCls: 'bg-white text-blue-600',
                subTextCls: 'text-blue-100',
                closeBtnCls: 'bg-white/20 hover:bg-white/30 text-white',
                dupBoxCls: 'bg-black/20 border-white/25 text-white',
                dupIconCls: 'text-blue-200',
                footerBorderCls: 'border-blue-300/40',
                dotCls: 'bg-blue-200',
                timePillCls: 'bg-blue-950/50 text-blue-100 border-blue-300/30',
              },
              I: {
                statusText: 'IZIN (I)',
                cardCls: 'bg-gradient-to-r from-yellow-400 to-amber-400 border-yellow-200 text-slate-900',
                badgeCls: 'bg-yellow-950/15 text-yellow-950',
                iconWrapCls: 'bg-white text-yellow-600',
                subTextCls: 'text-yellow-950/80',
                closeBtnCls: 'bg-yellow-950/15 hover:bg-yellow-950/25 text-yellow-950',
                dupBoxCls: 'bg-yellow-950/15 border-yellow-950/20 text-yellow-950',
                dupIconCls: 'text-yellow-900',
                footerBorderCls: 'border-yellow-900/20',
                dotCls: 'bg-yellow-900',
                timePillCls: 'bg-yellow-950 text-yellow-100 border-yellow-800',
              },
              A: {
                statusText: 'ALPA (A)',
                cardCls: 'bg-gradient-to-r from-red-600 to-rose-600 border-red-300 text-white',
                badgeCls: 'bg-white/20 text-red-50',
                iconWrapCls: 'bg-white text-red-600',
                subTextCls: 'text-red-100',
                closeBtnCls: 'bg-white/20 hover:bg-white/30 text-white',
                dupBoxCls: 'bg-black/20 border-white/25 text-white',
                dupIconCls: 'text-red-200',
                footerBorderCls: 'border-red-300/40',
                dotCls: 'bg-red-200',
                timePillCls: 'bg-red-950/50 text-red-100 border-red-300/30',
              },
            };
            const theme = statusThemeMap[scannedSuccessItem.status];

            return (
              <div
                className={`p-4 rounded-3xl shadow-xl border-2 animate-in fade-in zoom-in-95 duration-200 ${theme.cardCls}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="relative">
                      <img
                        src={scannedSuccessItem.student.fotoUrl}
                        alt={scannedSuccessItem.student.nama}
                        onClick={() =>
                          onOpenZoom(
                            scannedSuccessItem.student.fotoUrl,
                            scannedSuccessItem.student.nama
                          )
                        }
                        className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-md cursor-zoom-in"
                      />
                      <div
                        className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-md ${theme.iconWrapCls}`}
                      >
                        {isDuplicate ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                    <div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${theme.badgeCls}`}
                      >
                        {isDuplicate ? (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5" /> Sudah Absen Hari Ini • Tidak Ditimpa
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Presensi Berhasil Tercatat
                          </>
                        )}
                      </span>
                      <h4 className="font-display font-black text-base mt-0.5">
                        {scannedSuccessItem.student.nama}
                      </h4>
                      <div className={`text-[11px] font-mono font-bold ${theme.subTextCls}`}>
                        {scannedSuccessItem.student.barcodeId} • Kelas: {scannedSuccessItem.student.kelas} • NISN: {scannedSuccessItem.student.nisn}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScannedSuccessItem(null)}
                    className={`p-1.5 rounded-xl transition cursor-pointer ${theme.closeBtnCls}`}
                    title="Tutup Notifikasi"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {isDuplicate && (
                  <div
                    className={`mt-2.5 px-3 py-2 rounded-2xl border text-xs font-extrabold flex items-center gap-2 ${theme.dupBoxCls}`}
                  >
                    <AlertTriangle className={`w-4 h-4 shrink-0 ${theme.dupIconCls}`} />
                    <span>
                      {scannedSuccessItem.status === 'H'
                        ? `Anak ini sudah hadir! Waktu scan awal (${scannedSuccessItem.time}) tetap dipertahankan.`
                        : `Anak ini sudah tercatat ${theme.statusText} hari ini pukul ${scannedSuccessItem.time}. Data tidak ditimpa.`}
                    </span>
                  </div>
                )}

                <div
                  className={`mt-3 pt-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-xs font-bold ${theme.footerBorderCls}`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${theme.dotCls} ${
                        isDuplicate ? '' : 'animate-ping'
                      }`}
                    />
                    Status: <strong>{theme.statusText}</strong>
                    {scannedSuccessItem.methodLabel && (
                      <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-extrabold">
                        {scannedSuccessItem.methodLabel}
                      </span>
                    )}
                  </span>
                  <span className={`font-mono px-3 py-1 rounded-xl border ${theme.timePillCls}`}>
                    {isDuplicate ? `Waktu Awal: ${scannedSuccessItem.time}` : `Waktu: ${scannedSuccessItem.time}`}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Status Scan Terakhir Barcode (Mengikuti Warna Status) */}
          {(() => {
            const lastTheme =
              lastScannedStatus === 'S'
                ? {
                    box: 'bg-blue-50 border-blue-200',
                    icon: 'bg-blue-600 text-white',
                    title: 'text-blue-800',
                    time: 'border-blue-200 text-blue-800',
                  }
                : lastScannedStatus === 'I'
                ? {
                    box: 'bg-yellow-50 border-yellow-300',
                    icon: 'bg-yellow-500 text-slate-950',
                    title: 'text-yellow-900',
                    time: 'border-yellow-300 text-yellow-900',
                  }
                : lastScannedStatus === 'A'
                ? {
                    box: 'bg-red-50 border-red-200',
                    icon: 'bg-red-600 text-white',
                    title: 'text-red-800',
                    time: 'border-red-200 text-red-800',
                  }
                : {
                    box: 'bg-emerald-50 border-emerald-200',
                    icon: 'bg-emerald-600 text-white',
                    title: 'text-emerald-800',
                    time: 'border-emerald-200 text-emerald-800',
                  };
            return (
              <div
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 text-xs transition-colors ${lastTheme.box}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${lastTheme.icon}`}
                  >
                    <CheckCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-[10px] font-extrabold uppercase ${lastTheme.title}`}>
                      Status Scan Terakhir
                    </div>
                    <div className="font-display font-black text-slate-800 truncate">
                      {lastScannedStudent}
                    </div>
                  </div>
                </div>
                <span
                  className={`font-mono font-bold text-xs bg-white px-2.5 py-1.5 rounded-xl border shrink-0 ${lastTheme.time}`}
                >
                  {lastScannedTime}
                </span>
              </div>
            );
          })()}

          {/* Manual Input (USB Scanner & Text Input) */}
          <form onSubmit={handleManualScan} className="flex gap-2">
            <input
              id="manual_barcode_input"
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Scan Barcode USB / Ketik ID, NISN, atau Nama Siswa..."
              className="flex-1 px-4 py-2.5 rounded-2xl border-2 border-slate-200 focus:border-emerald-600 outline-none text-xs font-mono font-bold"
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-5 py-2.5 rounded-2xl text-xs cursor-pointer shadow-xs"
            >
              Scan
            </button>
          </form>

          {/* Quick Simulation Buttons for Active Class */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase">
                Simulasi Klik Cepat Scan Siswa ({activeClass}):
              </span>
              <span className="text-[10px] text-slate-400">Total: {filteredStudents.length} siswa</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              {filteredStudents.map((s) => {
                const rec = attendanceRecords[`${activeDate}_${s.id}`];
                const chipCls =
                  rec?.status === 'H'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : rec?.status === 'S'
                    ? 'bg-blue-100 text-blue-800 border-blue-300'
                    : rec?.status === 'I'
                    ? 'bg-yellow-100 text-yellow-900 border-yellow-300'
                    : rec?.status === 'A'
                    ? 'bg-red-100 text-red-800 border-red-300'
                    : 'bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 border-slate-200 text-slate-700';
                const chipIcon =
                  rec?.status === 'H'
                    ? '✓'
                    : rec?.status === 'S'
                    ? 'S'
                    : rec?.status === 'I'
                    ? 'I'
                    : rec?.status === 'A'
                    ? 'A'
                    : '+';
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => recordAttendance(s, 'H', { skipIfAlreadyRecorded: true })}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${chipCls}`}
                  >
                    <span>{chipIcon}</span>
                    <span>{s.nama.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Automated Telegram / WhatsApp Notification & Status Log Panel */}
          <div className="pt-3 border-t border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                  <Bell className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-display font-black text-xs text-slate-800 truncate">
                    Log Status Notifikasi Telegram / WhatsApp ({notifLogs.length})
                  </h4>
                  <p className="text-[10px] text-slate-500 truncate">
                    Tercatat otomatis setiap kali absensi wajah berhasil mendeteksi siswa
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setNotifDraft(notifConfig);
                    setIsNotifSettingsOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Settings2 className="w-3 h-3" />
                  <span>Pengaturan</span>
                </button>
                {notifLogs.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyNotifText(
                          notifLogs
                            .slice(0, 20)
                            .map(
                              (l, idx) =>
                                `${idx + 1}. ${l.studentName} (${l.studentClass}) - HADIR ${l.time.slice(0, 5)} WIB [${l.methodLabel}]`
                            )
                            .join('\n'),
                          'Rekap log absensi wajah disalin untuk Telegram/WA!'
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      title="Salin ringkasan log untuk ditempel ke grup WhatsApp / Telegram"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Salin Rekap</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearNotifLogs}
                      className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-extrabold cursor-pointer whitespace-nowrap"
                      title="Hapus semua log notifikasi"
                    >
                      Bersihkan
                    </button>
                  </>
                )}
              </div>
            </div>

            {notifLogs.length === 0 ? (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 text-center">
                Belum ada log notifikasi absen wajah. Lakukan scan wajah siswa atau klik Uji Kirim di Pengaturan.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {notifLogs.slice(0, 25).map((log) => {
                  const statusBadgeCls =
                    log.overallStatus === 'SENT'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : log.overallStatus === 'FAILED'
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200';
                  const statusText =
                    log.overallStatus === 'SENT'
                      ? '✓ Terkirim'
                      : log.overallStatus === 'FAILED'
                      ? '✕ Gagal API'
                      : '• Log Siap Kirim';
                  const waHref = buildWhatsAppDirectUrl(
                    notifConfig.whatsappTargetPhone,
                    log.messageText
                  );
                  return (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-display font-black text-slate-800 truncate">
                            {log.studentName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            {log.studentClass} · {log.date} {log.time.slice(0, 5)} · {log.methodLabel}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold shrink-0 whitespace-nowrap ${statusBadgeCls}`}
                        >
                          {statusText}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-600 space-y-0.5">
                        {log.telegramStatus !== 'SKIPPED' && (
                          <div className="truncate">
                            <strong>Telegram:</strong> {log.telegramDetail}
                          </div>
                        )}
                        {log.whatsappStatus !== 'SKIPPED' && (
                          <div className="truncate">
                            <strong>WhatsApp:</strong> {log.whatsappDetail}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Kirim WA</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyNotifText(log.messageText)}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Salin Pesan</span>
                        </button>
                        {(notifConfig.telegramBotToken || notifConfig.whatsappWebhookUrl) && (
                          <button
                            type="button"
                            onClick={() => handleRetryLogEntry(log)}
                            disabled={retryingLogId === log.id}
                            className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-[10px] font-extrabold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${retryingLogId === log.id ? 'animate-spin' : ''}`}
                            />
                            <span>{retryingLogId === log.id ? 'Mengirim...' : 'Kirim Ulang'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Daily Attendance Table */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-extrabold text-lg text-slate-800">
                Daftar Pendataan Kehadiran Siswa ({activeClass})
              </h3>
              <p className="text-xs text-slate-500">
                Tanggal: <strong>{formatTanggalIndo(activeDate)}</strong> ({activeDate}) • Terhubung real-time ke Kalender Pendidikan & Cloud
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenCalendarForDate(activeDate)}
                className="bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                title="Lihat rekap tanggal ini di Kalender Pendidikan"
              >
                <Calendar className="w-3.5 h-3.5" /> Lihat di Kaldik
              </button>
              <button
                type="button"
                onClick={markAllPresent}
                disabled={isBatchSaving}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <CheckCheck className="w-4 h-4" /> {isBatchSaving ? 'Menyimpan...' : 'Tandai Semua Hadir'}
              </button>
            </div>
          </div>

          {/* Real-time Daily Recap Strip (Synced with Kalender Pendidikan) */}
          <div className="grid grid-cols-5 gap-2 text-center">
            <div className="p-2 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div className="text-[10px] font-extrabold text-emerald-700 uppercase">Hadir (H)</div>
              <div className="text-base font-display font-black text-emerald-900">{dailySummary.hadir}</div>
            </div>
            <div className="p-2 rounded-2xl bg-blue-50 border border-blue-200">
              <div className="text-[10px] font-extrabold text-blue-700 uppercase">Sakit (S)</div>
              <div className="text-base font-display font-black text-blue-900">{dailySummary.sakit}</div>
            </div>
            <div className="p-2 rounded-2xl bg-yellow-50 border border-yellow-300">
              <div className="text-[10px] font-extrabold text-yellow-800 uppercase">Izin (I)</div>
              <div className="text-base font-display font-black text-yellow-900">{dailySummary.izin}</div>
            </div>
            <div className="p-2 rounded-2xl bg-red-50 border border-red-200">
              <div className="text-[10px] font-extrabold text-red-700 uppercase">Alpa (A)</div>
              <div className="text-base font-display font-black text-red-900">{dailySummary.alfa}</div>
            </div>
            <div className="p-2 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase">Belum</div>
              <div className="text-base font-display font-black text-slate-700">{dailySummary.belum}</div>
            </div>
          </div>

          {/* Quick Dropdown Selector */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-700" />
              <label className="text-xs font-extrabold text-slate-700">Pilih Siswa (Dropdown):</label>
            </div>
            <select
              value={selectedStudentDropdown}
              onChange={(e) => {
                setSelectedStudentDropdown(e.target.value);
                const s = students.find((st) => st.id === e.target.value);
                if (s) {
                  recordAttendance(s, 'H', { skipIfAlreadyRecorded: true });
                  setSelectedStudentDropdown('');
                }
              }}
              className="flex-1 max-w-md px-3.5 py-2 rounded-xl border-2 border-emerald-600 bg-white text-xs font-display font-extrabold text-slate-800 cursor-pointer outline-none"
            >
              <option value="">-- Pilih Nama Siswa untuk Hadir Otomatis --</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama} ({s.barcodeId})
                </option>
              ))}
            </select>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-xs uppercase font-extrabold">
                  <th className="p-3 rounded-l-xl">ID Barcode</th>
                  <th className="p-3">Foto & Nama Siswa</th>
                  <th className="p-3 text-center">Waktu Presensi</th>
                  <th className="p-3 text-center">Status Kehadiran</th>
                  <th className="p-3 rounded-r-xl text-center">Ubah Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                      Tidak ada peserta didik terdaftar pada rombel {activeClass}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s) => {
                    const rec = attendanceRecords[`${activeDate}_${s.id}`];
                    const status = rec ? rec.status : '-';
                    const time = rec ? rec.time : '--:--';
                    const isJustScanned = scannedSuccessItem?.student.id === s.id;

                    const rowHighlightCls = isJustScanned
                      ? scannedSuccessItem?.status === 'H'
                        ? 'bg-emerald-50 ring-2 ring-emerald-500'
                        : scannedSuccessItem?.status === 'S'
                        ? 'bg-blue-50 ring-2 ring-blue-500'
                        : scannedSuccessItem?.status === 'I'
                        ? 'bg-yellow-50 ring-2 ring-yellow-400'
                        : 'bg-red-50 ring-2 ring-red-500'
                      : 'hover:bg-slate-50';

                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors ${rowHighlightCls}`}
                      >
                        <td className="p-3 font-mono font-bold text-rose-700">{s.barcodeId}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={s.fotoUrl}
                              alt={s.nama}
                              onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                              className="w-8 h-8 rounded-lg object-cover border cursor-zoom-in shadow-xs"
                            />
                            <div>
                              <div className="font-bold text-slate-800">{s.nama}</div>
                              <div className="text-[10px] text-slate-500 font-mono flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span>NISN: {s.nisn}</span>
                                {faceProfiles[s.id] ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEnrollStudentId(s.id);
                                      setIsFaceEnrollModalOpen(true);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-sans font-extrabold text-[9px] hover:bg-indigo-200 transition cursor-pointer"
                                    title="Wajah terdaftar — klik untuk perbarui"
                                  >
                                    Face ID ✓
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEnrollStudentId(s.id);
                                      setIsFaceEnrollModalOpen(true);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-sans font-bold text-[9px] hover:bg-indigo-100 hover:text-indigo-800 transition cursor-pointer"
                                    title="Daftarkan wajah siswa ini"
                                  >
                                    + Daftar Wajah
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center font-mono text-xs font-bold text-slate-700">
                          {time}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                              status === 'H'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : status === 'S'
                                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                : status === 'I'
                                ? 'bg-yellow-100 text-yellow-900 border border-yellow-400'
                                : status === 'A'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {status === 'H'
                              ? 'Hadir'
                              : status === 'S'
                              ? 'Sakit'
                              : status === 'I'
                              ? 'Izin'
                              : status === 'A'
                              ? 'Alpa'
                              : 'Belum Presensi'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs font-bold shadow-xs">
                              <button
                                type="button"
                                onClick={() => handleStatusChange(s.id, 'H')}
                                title="Tandai Hadir (Hijau)"
                                className={`px-2.5 py-1.5 transition cursor-pointer ${
                                  status === 'H'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white hover:bg-emerald-50 text-slate-700'
                                }`}
                              >
                                H
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(s.id, 'S')}
                                title="Tandai Sakit (Biru)"
                                className={`px-2.5 py-1.5 border-l border-slate-200 transition cursor-pointer ${
                                  status === 'S'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white hover:bg-blue-50 text-slate-700'
                                }`}
                              >
                                S
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(s.id, 'I')}
                                title="Tandai Izin (Kuning)"
                                className={`px-2.5 py-1.5 border-l border-slate-200 transition cursor-pointer ${
                                  status === 'I'
                                    ? 'bg-yellow-400 text-slate-950'
                                    : 'bg-white hover:bg-yellow-50 text-slate-700'
                                }`}
                              >
                                I
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(s.id, 'A')}
                                title="Tandai Alpa (Merah)"
                                className={`px-2.5 py-1.5 border-l border-slate-200 transition cursor-pointer ${
                                  status === 'A'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-white hover:bg-red-50 text-slate-700'
                                }`}
                              >
                                A
                              </button>
                            </div>
                            {rec && (
                              <button
                                type="button"
                                onClick={() => handleClearSingleAttendance(s)}
                                title="Kosongkan status kehadiran siswa ini"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Pendaftaran & Pengelolaan Wajah Siswa (Face ID) */}
      {isFaceEnrollModalOpen && (() => {
        const selectedTarget = students.find((s) => s.id === enrollStudentId) || filteredStudents[0];
        const selectedProf = selectedTarget ? faceProfiles[selectedTarget.id] : undefined;
        const enrollList = filteredStudents.filter((s) =>
          !enrollSearch.trim()
            ? true
            : s.nama.toLowerCase().includes(enrollSearch.trim().toLowerCase()) ||
              s.nisn.includes(enrollSearch.trim())
        );

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-indigo-50/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                    <ScanFace className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-base text-slate-900">
                      Pendaftaran Data Wajah Siswa ({activeClass})
                    </h3>
                    <p className="text-xs text-slate-600">
                      Rekam 3 pose langsung dari kamera atau unggah foto wajah siswa. Data otomatis tersinkron ke Cloud Firestore.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFaceEnrollModalOpen(false)}
                  className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-5">
                {/* Left: Camera / Upload Capture for Selected Student */}
                <div className="md:col-span-7 space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-indigo-400 h-56 flex items-center justify-center">
                    <video
                      ref={enrollVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {enrollProgressText && (
                      <div className="absolute inset-x-3 bottom-3 bg-indigo-900/90 text-white text-xs font-extrabold px-3 py-2 rounded-xl text-center shadow-lg">
                        {enrollProgressText}
                      </div>
                    )}
                  </div>

                  {selectedTarget && (
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={selectedProf?.thumbnailDataUrl || selectedTarget.fotoUrl}
                          alt={selectedTarget.nama}
                          className="w-11 h-11 rounded-xl object-cover border border-slate-300 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-display font-black text-sm text-slate-900 truncate">
                            {selectedTarget.nama}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {selectedTarget.kelas} • NISN {selectedTarget.nisn}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase shrink-0 ${
                          selectedProf
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {selectedProf ? 'Terdaftar ✓' : 'Belum Ada Data'}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleEnrollFaceFromCamera}
                      disabled={isEnrollingCamera || !selectedTarget}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-display font-black text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{isEnrollingCamera ? 'Memproses...' : 'Rekam Wajah dari Kamera'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => enrollFileInputRef.current?.click()}
                      disabled={isEnrollingCamera || !selectedTarget}
                      className="bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-800 border border-slate-300 font-display font-extrabold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-indigo-600" />
                      <span>Unggah Foto</span>
                    </button>
                    <input
                      type="file"
                      ref={enrollFileInputRef}
                      accept="image/*"
                      onChange={handleEnrollFaceFromFile}
                      className="hidden"
                    />
                    {selectedProf && selectedTarget && (
                      <button
                        type="button"
                        onClick={() => handleDeleteFaceProfile(selectedTarget.id)}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs px-3 py-2.5 rounded-xl flex items-center gap-1 cursor-pointer"
                        title="Hapus data wajah siswa ini"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Right: Student Selector List */}
                <div className="md:col-span-5 flex flex-col border border-slate-200 rounded-2xl overflow-hidden bg-slate-50">
                  <div className="p-2.5 bg-white border-b border-slate-200 space-y-2">
                    <div className="text-xs font-extrabold text-slate-800 flex items-center justify-between">
                      <span>Pilih Siswa ({classEnrolledCount}/{filteredStudents.length} Siap)</span>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={enrollSearch}
                        onChange={(e) => setEnrollSearch(e.target.value)}
                        placeholder="Cari nama / NISN siswa..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-slate-50 focus:bg-white outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="flex-1 max-h-72 overflow-y-auto divide-y divide-slate-100 p-1.5 space-y-1">
                    {enrollList.map((s) => {
                      const prof = faceProfiles[s.id];
                      const isSelected = selectedTarget?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setEnrollStudentId(s.id)}
                          className={`w-full p-2 rounded-xl flex items-center justify-between gap-2 text-left transition cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-white hover:bg-indigo-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={prof?.thumbnailDataUrl || s.fotoUrl}
                              alt={s.nama}
                              className="w-7 h-7 rounded-lg object-cover shrink-0 border border-white/40"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">{s.nama}</div>
                              <div
                                className={`text-[10px] font-mono ${
                                  isSelected ? 'text-indigo-100' : 'text-slate-500'
                                }`}
                              >
                                {s.nisn}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black shrink-0 ${
                              prof
                                ? isSelected
                                  ? 'bg-white text-indigo-700'
                                  : 'bg-emerald-100 text-emerald-800'
                                : isSelected
                                ? 'bg-indigo-500 text-indigo-100'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {prof ? '✓ Siap' : 'Belum'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Modal Pengaturan Notifikasi Otomatis Telegram & WhatsApp */}
      {isNotifSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-sky-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-sm">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-black text-base text-slate-900">
                    Pengaturan Notifikasi &amp; Log Otomatis (Telegram / WhatsApp)
                  </h3>
                  <p className="text-xs text-slate-600">
                    Dikirim otomatis saat siswa terdeteksi melalui Absensi Wajah SERBU 21
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNotifSettingsOpen(false)}
                className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNotifSettings} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="font-extrabold text-slate-800">Aktifkan Notifikasi &amp; Log Otomatis</div>
                  <div className="text-[11px] text-slate-500">
                    Setiap absensi wajah berhasil langsung tercatat di log dan dikirim ke kanal aktif.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notifDraft.enabled}
                  onChange={(e) => setNotifDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="w-4 h-4 accent-sky-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-extrabold text-slate-700 mb-1.5">Mode Kanal Pengiriman</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'both', label: 'Telegram & WA' },
                      { id: 'telegram', label: 'Telegram Saja' },
                      { id: 'whatsapp', label: 'WhatsApp Saja' },
                      { id: 'log_only', label: 'Log Status Saja' },
                    ] as Array<{ id: NotificationChannelMode; label: string }>
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setNotifDraft((prev) => ({ ...prev, channelMode: mode.id }))}
                      className={`px-3 py-2 rounded-xl font-extrabold border text-[11px] transition cursor-pointer whitespace-nowrap ${
                        notifDraft.channelMode === mode.id
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Telegram Config */}
                <div className="p-3.5 rounded-2xl border border-sky-200 bg-sky-50/40 space-y-2.5">
                  <div className="font-display font-black text-sky-950 text-xs">
                    Konfigurasi Telegram Bot API
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Bot Token Telegram (@BotFather)
                    </label>
                    <input
                      type="password"
                      value={notifDraft.telegramBotToken}
                      onChange={(e) =>
                        setNotifDraft((prev) => ({ ...prev, telegramBotToken: e.target.value }))
                      }
                      placeholder="123456789:AAF..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-[11px] outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Chat ID / ID Grup Tujuan
                    </label>
                    <input
                      type="text"
                      value={notifDraft.telegramChatId}
                      onChange={(e) =>
                        setNotifDraft((prev) => ({ ...prev, telegramChatId: e.target.value }))
                      }
                      placeholder="-1001234567890 atau 987654321"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-[11px] outline-none focus:border-sky-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-snug">
                    Masukkan Bot Token &amp; Chat ID untuk pengiriman otomatis langsung ke grup/akun Telegram tanpa server tambahan.
                  </p>
                </div>

                {/* WhatsApp Config */}
                <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/40 space-y-2.5">
                  <div className="font-display font-black text-emerald-950 text-xs">
                    Konfigurasi WhatsApp (Webhook / Direct)
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nomor WA Tujuan (Wali Kelas / Grup)
                    </label>
                    <input
                      type="text"
                      value={notifDraft.whatsappTargetPhone}
                      onChange={(e) =>
                        setNotifDraft((prev) => ({ ...prev, whatsappTargetPhone: e.target.value }))
                      }
                      placeholder="6281234567890"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-[11px] outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      URL Webhook Gateway WA (Opsional)
                    </label>
                    <input
                      type="url"
                      value={notifDraft.whatsappWebhookUrl}
                      onChange={(e) =>
                        setNotifDraft((prev) => ({ ...prev, whatsappWebhookUrl: e.target.value }))
                      }
                      placeholder="https://api.fonnte.com/send atau webhook n8n/GAS"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-[11px] outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Token Header Authorization (Opsional)
                    </label>
                    <input
                      type="password"
                      value={notifDraft.whatsappWebhookHeaderToken}
                      onChange={(e) =>
                        setNotifDraft((prev) => ({
                          ...prev,
                          whatsappWebhookHeaderToken: e.target.value,
                        }))
                      }
                      placeholder="Token gateway bila diperlukan"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-[11px] outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={notifDraft.includeConfidence}
                  onChange={(e) =>
                    setNotifDraft((prev) => ({ ...prev, includeConfidence: e.target.checked }))
                  }
                  className="w-4 h-4 accent-sky-600"
                />
                <span>Sertakan skor akurasi deteksi wajah (%) pada pesan notifikasi</span>
              </label>

              {/* Message Preview */}
              <div className="p-3 rounded-2xl bg-slate-900 text-slate-100 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                {formatFaceAttendanceMessage({
                  student: filteredStudents[0] || {
                    nama: 'Ahmad Fauzan',
                    kelas: activeClass,
                    nisn: '0151234567',
                    barcodeId: 'RBU21-001',
                  },
                  date: activeDate,
                  time: liveClock,
                  status: 'H',
                  methodLabel: 'Auto-Submit Wajah (95%)',
                  confidence: 95,
                  includeConfidence: notifDraft.includeConfidence,
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleSendTestNotif}
                  disabled={isSendingTestNotif}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-display font-black text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSendingTestNotif ? 'Menguji...' : 'Uji Kirim & Catat Log'}</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsNotifSettingsOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer whitespace-nowrap"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-display font-black text-xs cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    Simpan Pengaturan
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
