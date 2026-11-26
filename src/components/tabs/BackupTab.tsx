import React, { useEffect, useRef, useState } from 'react';
import {
  Database,
  Upload,
  Download,
  RotateCcw,
  Image,
  CheckCircle2,
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  Clock,
  Radio,
  KeyRound,
  Camera,
  History,
  Search,
  UserCheck,
  ShieldCheck,
  AlertCircle,
  Lock,
  BookOpenCheck,
} from 'lucide-react';
import { ExamDeletionLogEntry, SchoolProfile, Student } from '../../types';
import {
  exportFullSystemJSON,
  getStoredExamDeletionLog,
  getStoredStudents,
  resetStoredAdminPassword,
} from '../../utils/storage';
import { compressQuestionImage } from '../../utils/imageUtils';
import { testConnection, handleFirestoreError, OperationType } from '../../utils/firebase';
import {
  CloudBackupDocMeta,
  CloudSyncPayload,
  pullBackupFromCloudRealtime,
  recoverDeletedExamDataByStudentId,
  restoreBackupJsonToCloudRealtime,
  restoreDeletionLogEntryFromLog,
  subscribeToCloudBackupDoc,
  subscribeToCloudChanges,
  syncAllLocalToCloud,
  syncDeletionLogFromCloud,
} from '../../utils/cloudSync';
import firebaseConfig from '../../../firebase-applet-config.json';
import {
  extractImageFilesFromClipboard,
  extractImageFilesFromDataTransfer,
} from '../../utils/imageDropPaste';

interface Props {
  profile: SchoolProfile;
  students?: Student[];
  onSaveProfile: (profile: SchoolProfile) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onResetAll: () => void;
  activeUserName?: string;
  onBackupRestored?: () => void;
  isAdmin?: boolean;
  allowResetAdmin?: boolean;
  onOpenChangePassword?: () => void;
}

function formatIsoTime(iso?: string): string {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

export const BackupTab: React.FC<Props> = ({
  profile,
  students: propStudents,
  onSaveProfile,
  showToast,
  onResetAll,
  activeUserName = 'admin',
  onBackupRestored,
  isAdmin = false,
  allowResetAdmin = true,
  onOpenChangePassword,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isRestoringFile, setIsRestoringFile] = useState(false);
  const [dragPhotoSlot, setDragPhotoSlot] = useState<'kemendikbud' | 'sekolah' | 'admin' | null>(null);
  const [cloudStatus, setCloudStatus] = useState<'connecting' | 'online' | 'error'>('connecting');
  const [cloudBackupMeta, setCloudBackupMeta] = useState<CloudBackupDocMeta | null>(null);
  const [cloudSyncMeta, setCloudSyncMeta] = useState<CloudSyncPayload | null>(null);
  const [lastRestoreSummary, setLastRestoreSummary] = useState<string>('');
  const [confirmResetAdminPass, setConfirmResetAdminPass] = useState(false);

  // Pemulihan Data & Log Riwayat Penghapusan TKA / CBT
  const [deletionLogs, setDeletionLogs] = useState<ExamDeletionLogEntry[]>(() =>
    getStoredExamDeletionLog()
  );
  const [recoveryStudentIdInput, setRecoveryStudentIdInput] = useState<string>('');
  const [recoveryCategory, setRecoveryCategory] = useState<'all' | 'tka' | 'cbt'>('all');
  const [isRecoveringById, setIsRecoveringById] = useState<boolean>(false);
  const [isSyncingDeletionLog, setIsSyncingDeletionLog] = useState<boolean>(false);
  const [restoringLogId, setRestoringLogId] = useState<string | null>(null);
  const [recoveryFeedbackBanner, setRecoveryFeedbackBanner] = useState<string>('');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [logCategoryFilter, setLogCategoryFilter] = useState<'all' | 'tka' | 'cbt'>('all');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'pending' | 'restored'>('all');

  const activeStudentsList = React.useMemo(() => {
    const list = propStudents && propStudents.length > 0 ? propStudents : getStoredStudents();
    return list.slice().sort((a, b) => {
      const cmpCls = (a.kelas || '').localeCompare(b.kelas || '', 'id', { numeric: true });
      if (cmpCls !== 0) return cmpCls;
      return (a.nama || '').localeCompare(b.nama || '', 'id');
    });
  }, [propStudents]);

  // Realtime listeners (onSnapshot) for backups/latest & school_data/primary_data
  useEffect(() => {
    const refreshLogs = () => {
      setDeletionLogs(getStoredExamDeletionLog());
    };
    window.addEventListener('sekolahku-deletion-log-updated', refreshLogs);
    window.addEventListener('sekolahku-cloud-sync-updated', refreshLogs);

    const unsubBackup = subscribeToCloudBackupDoc(
      (meta) => {
        setCloudBackupMeta(meta);
        setCloudStatus('online');
      },
      () => {
        setCloudStatus('error');
      }
    );

    const unsubSync = subscribeToCloudChanges((payload) => {
      setCloudSyncMeta(payload);
      setCloudStatus('online');
    });

    return () => {
      window.removeEventListener('sekolahku-deletion-log-updated', refreshLogs);
      window.removeEventListener('sekolahku-cloud-sync-updated', refreshLogs);
      unsubBackup();
      unsubSync();
    };
  }, []);

  const handleTestCloud = async () => {
    showToast('Memeriksa koneksi ke Firebase Cloud Firestore...', 'success');
    const ok = await testConnection();
    if (ok) {
      setCloudStatus('online');
      showToast('Koneksi Firebase Cloud Firestore aktif & terkoneksi realtime!', 'success');
    } else {
      setCloudStatus('error');
      showToast('Koneksi Firebase gagal atau sedang offline.', 'error');
    }
  };

  const handleSyncToFirestore = async () => {
    setIsSyncing(true);
    try {
      const ok = await syncAllLocalToCloud(activeUserName);
      if (ok) {
        setCloudStatus('online');
        showToast('Seluruh data & cadangan berhasil disinkronkan realtime ke Cloud Firestore!', 'success');
      } else {
        showToast('Sebagian data gagal disinkronkan ke Cloud Firestore.', 'error');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'backups/latest');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromFirestore = async () => {
    setIsPulling(true);
    try {
      const result = await pullBackupFromCloudRealtime();
      if (result.restoredKeysCount === 0 && result.studentsCount === 0 && result.attendanceCount === 0) {
        showToast('Belum ada data cadangan di Firebase Cloud Firestore.', 'error');
        return;
      }
      onBackupRestored?.();
      const summary = `${result.restoredKeysCount} modul data, ${result.studentsCount} siswa, & ${result.attendanceCount} absensi dipulihkan realtime dari Cloud Firestore.`;
      setLastRestoreSummary(summary);
      showToast(summary, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'backups/latest');
      showToast('Gagal memulihkan data dari Cloud Firestore.', 'error');
    } finally {
      setIsPulling(false);
    }
  };

  const processKemendikbudFile = async (file: File) => {
    const compressed = await compressQuestionImage(file, {
      maxWidth: 480,
      maxHeight: 480,
      quality: 0.85,
    });
    onSaveProfile({
      ...profile,
      logoKemendikbudUrl: compressed,
    });
    showToast('Logo Kemendikbud berhasil diperbarui & disinkronkan realtime!', 'success');
  };

  const handleKemendikbudUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processKemendikbudFile(file);
      e.target.value = '';
    }
  };

  const processSchoolLogoFile = async (file: File) => {
    const compressed = await compressQuestionImage(file, {
      maxWidth: 480,
      maxHeight: 480,
      quality: 0.85,
    });
    onSaveProfile({
      ...profile,
      logoSekolahUrl: compressed,
    });
    showToast('Logo Sekolah (Monas Edition) berhasil diperbarui & disinkronkan realtime!', 'success');
  };

  const handleSchoolLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processSchoolLogoFile(file);
      e.target.value = '';
    }
  };

  const processAdminPhotoFile = async (file: File) => {
    const compressed = await compressQuestionImage(file, {
      maxWidth: 400,
      maxHeight: 400,
      quality: 0.82,
    });
    onSaveProfile({
      ...profile,
      adminFotoUrl: compressed,
    });
    showToast('Foto Profil Admin berhasil diperbarui & disinkronkan realtime!', 'success');
  };

  const handleAdminPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processAdminPhotoFile(file);
      e.target.value = '';
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      setIsRestoringFile(true);
      try {
        const result = await restoreBackupJsonToCloudRealtime(String(reader.result || ''), activeUserName);
        onBackupRestored?.();
        const summary = `Pulih & sinkron realtime: ${result.restoredKeysCount} modul, ${result.studentsCount} siswa, ${result.attendanceCount} absensi, ${result.kaldikCount} kaldik terkirim ke Firestore.`;
        setLastRestoreSummary(summary);
        showToast('Cadangan .JSON berhasil dipulihkan & disinkronkan realtime ke seluruh perangkat!', 'success');
      } catch (err: any) {
        console.error('Gagal memulihkan cadangan ke cloud:', err);
        showToast(
          `Gagal memulihkan cadangan: ${err?.message || 'Pastikan file JSON valid dan koneksi internet aktif.'}`,
          'error'
        );
      } finally {
        setIsRestoringFile(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleSyncDeletionLog = async () => {
    if (isSyncingDeletionLog) return;
    setIsSyncingDeletionLog(true);
    try {
      const merged = await syncDeletionLogFromCloud();
      setDeletionLogs(merged);
      showToast(
        `Log riwayat penghapusan disegarkan (${merged.length} catatan tercatat).`,
        'success'
      );
    } finally {
      setIsSyncingDeletionLog(false);
    }
  };

  const handleRestoreLogEntry = async (entry: ExamDeletionLogEntry) => {
    if (restoringLogId) return;
    setRestoringLogId(entry.logId);
    try {
      const result = await restoreDeletionLogEntryFromLog(entry.logId, activeUserName);
      setDeletionLogs(getStoredExamDeletionLog());
      if (result.ok) {
        onBackupRestored?.();
        setRecoveryFeedbackBanner(result.message);
        showToast(result.message, 'success');
      } else {
        showToast(result.message, 'error');
      }
    } finally {
      setRestoringLogId(null);
    }
  };

  const handleRecoverSpecificStudentById = async () => {
    const trimmedId = recoveryStudentIdInput.trim();
    if (!trimmedId) {
      showToast('Masukkan atau pilih ID Siswa yang datanya ingin dipulihkan terlebih dahulu.', 'error');
      return;
    }
    if (isRecoveringById) return;
    setIsRecoveringById(true);
    try {
      const res = await recoverDeletedExamDataByStudentId({
        studentId: trimmedId,
        category: recoveryCategory,
        actorName: activeUserName,
      });
      setDeletionLogs(getStoredExamDeletionLog());
      const totalRestored = res.recoveredTkaCount + res.recoveredCbtCount;
      if (totalRestored > 0) {
        onBackupRestored?.();
        const label = res.studentName ? `${res.studentName} (${trimmedId})` : `ID ${trimmedId}`;
        const msg = `Berhasil memulihkan ${res.recoveredTkaCount} nilai TKA & ${res.recoveredCbtCount} nilai CBT untuk ${label}.`;
        setRecoveryFeedbackBanner(msg);
        showToast(msg, 'success');
      } else {
        const msg = `Tidak ditemukan data terhapus untuk ID "${trimmedId}" yang belum aktif, atau data siswa tersebut saat ini sudah utuh.`;
        setRecoveryFeedbackBanner(msg);
        showToast(msg, 'error');
      }
    } finally {
      setIsRecoveringById(false);
    }
  };

  const filteredDeletionLogs = React.useMemo(() => {
    const q = logSearchQuery.trim().toLowerCase();
    return deletionLogs.filter((entry) => {
      if (logCategoryFilter !== 'all' && entry.category !== logCategoryFilter) return false;
      if (logStatusFilter === 'pending' && entry.restoredAt) return false;
      if (logStatusFilter === 'restored' && !entry.restoredAt) return false;
      if (q) {
        const hay = [
          entry.studentId,
          entry.studentName,
          entry.nisn,
          entry.kelas,
          entry.paket,
          entry.mapel,
          entry.deletedBy,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deletionLogs, logSearchQuery, logCategoryFilter, logStatusFilter]);

  const pendingDeletionCount = React.useMemo(
    () => deletionLogs.filter((l) => !l.restoredAt).length,
    [deletionLogs]
  );
  const restoredDeletionCount = React.useMemo(
    () => deletionLogs.filter((l) => Boolean(l.restoredAt)).length,
    [deletionLogs]
  );

  const matchedRecoveryStudent = React.useMemo(() => {
    const q = recoveryStudentIdInput.trim().toLowerCase();
    if (!q) return null;
    return (
      activeStudentsList.find(
        (s) => s.id.toLowerCase() === q || (s.nisn && s.nisn.toLowerCase() === q)
      ) || null
    );
  }, [recoveryStudentIdInput, activeStudentsList]);

  const matchingLogsForInputIdCount = React.useMemo(() => {
    const q = recoveryStudentIdInput.trim().toLowerCase();
    if (!q) return 0;
    const targetId = (matchedRecoveryStudent?.id || q).toLowerCase();
    return deletionLogs.filter(
      (l) =>
        !l.restoredAt &&
        l.studentId.toLowerCase() === targetId &&
        (recoveryCategory === 'all' || l.category === recoveryCategory)
    ).length;
  }, [recoveryStudentIdInput, matchedRecoveryStudent, deletionLogs, recoveryCategory]);

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase bg-slate-100 text-slate-800 px-3 py-1 rounded-full">
              Menu Pengaturan &amp; Sistem
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
              <Database className="w-5 h-5 text-slate-700" /> 2 Logo Resmi &amp; Cadangan Data Sistem (Backup / Restore)
            </h2>
            <p className="text-xs text-slate-500">
              Kelola Logo Kemendikbud dan Logo Sekolah Monas, serta pulihkan &amp; sinkronkan data aplikasi secara real-time.
            </p>
          </div>
        </div>

        {/* 2 Logo & Foto Profil Admin Upload Section */}
        <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
              <Image className="w-5 h-5 text-rose-600" /> Pengaturan Logo Resmi &amp; Foto Profil Admin
            </h3>
            <span className="text-[11px] font-semibold text-slate-500">
              Seret &amp; lepas gambar ke kartu atau klik kartu lalu tekan <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono">Ctrl+V</kbd>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Logo 1: Kemendikbud */}
            <div
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                setDragPhotoSlot('kemendikbud');
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragPhotoSlot(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragPhotoSlot(null);
                const files = extractImageFilesFromDataTransfer(e.dataTransfer);
                if (files[0]) void processKemendikbudFile(files[0]);
              }}
              onPaste={(e) => {
                const files = extractImageFilesFromClipboard(e.clipboardData);
                if (files[0]) {
                  e.preventDefault();
                  void processKemendikbudFile(files[0]);
                }
              }}
              className={`p-5 rounded-2xl bg-white border flex items-center gap-4 outline-none transition ${
                dragPhotoSlot === 'kemendikbud'
                  ? 'border-sky-500 ring-2 ring-sky-300 bg-sky-50'
                  : 'border-slate-200 focus:border-sky-400'
              }`}
            >
              <img
                src={profile.logoKemendikbudUrl}
                alt="Logo Kemendikbud"
                className="w-16 h-16 rounded-2xl object-contain p-1.5 bg-slate-50 border-2 border-sky-400 shrink-0"
              />
              <div className="space-y-1.5 min-w-0">
                <span className="text-[10px] font-black uppercase text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full inline-block">
                  Logo 1: Kemendikbud
                </span>
                <h4 className="font-bold text-xs text-slate-800 truncate">Tut Wuri Handayani</h4>
                <label className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3 py-1.5 rounded-xl text-xs cursor-pointer shadow-xs transition">
                  <Upload className="w-3.5 h-3.5" /> Ganti Logo 1
                  <input type="file" accept="image/*" onChange={handleKemendikbudUpload} className="hidden" />
                </label>
              </div>
            </div>

            {/* Logo 2: Sekolah Monas */}
            <div
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                setDragPhotoSlot('sekolah');
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragPhotoSlot(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragPhotoSlot(null);
                const files = extractImageFilesFromDataTransfer(e.dataTransfer);
                if (files[0]) void processSchoolLogoFile(files[0]);
              }}
              onPaste={(e) => {
                const files = extractImageFilesFromClipboard(e.clipboardData);
                if (files[0]) {
                  e.preventDefault();
                  void processSchoolLogoFile(files[0]);
                }
              }}
              className={`p-5 rounded-2xl bg-white border flex items-center gap-4 outline-none transition ${
                dragPhotoSlot === 'sekolah'
                  ? 'border-rose-500 ring-2 ring-rose-300 bg-rose-50'
                  : 'border-slate-200 focus:border-rose-400'
              }`}
            >
              <img
                src={profile.logoSekolahUrl}
                alt="Logo Sekolah"
                className="w-16 h-16 rounded-2xl object-contain p-1.5 bg-slate-50 border-2 border-rose-400 shrink-0"
              />
              <div className="space-y-1.5 min-w-0">
                <span className="text-[10px] font-black uppercase text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full inline-block">
                  Logo 2: Logo Sekolah
                </span>
                <h4 className="font-bold text-xs text-slate-800 truncate">{profile.name}</h4>
                <label className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-3 py-1.5 rounded-xl text-xs cursor-pointer shadow-xs transition">
                  <Upload className="w-3.5 h-3.5" /> Ganti Logo 2
                  <input type="file" accept="image/*" onChange={handleSchoolLogoUpload} className="hidden" />
                </label>
              </div>
            </div>

            {/* Foto Profil Admin */}
            <div
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                setDragPhotoSlot('admin');
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragPhotoSlot(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragPhotoSlot(null);
                const files = extractImageFilesFromDataTransfer(e.dataTransfer);
                if (files[0]) void processAdminPhotoFile(files[0]);
              }}
              onPaste={(e) => {
                const files = extractImageFilesFromClipboard(e.clipboardData);
                if (files[0]) {
                  e.preventDefault();
                  void processAdminPhotoFile(files[0]);
                }
              }}
              className={`p-5 rounded-2xl bg-white border flex items-center gap-4 outline-none transition ${
                dragPhotoSlot === 'admin'
                  ? 'border-amber-500 ring-2 ring-amber-300 bg-amber-50'
                  : 'border-slate-200 focus:border-amber-400'
              }`}
            >
              <img
                src={profile.adminFotoUrl || profile.logoSekolahUrl}
                alt="Foto Profil Admin"
                className="w-16 h-16 rounded-2xl object-cover bg-slate-50 border-2 border-amber-400 shrink-0"
              />
              <div className="space-y-1.5 min-w-0">
                <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full inline-block">
                  Foto Profil Admin
                </span>
                <h4 className="font-bold text-xs text-slate-800 truncate">Administrator Utama</h4>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-display font-extrabold px-3 py-1.5 rounded-xl text-xs cursor-pointer shadow-xs transition">
                    <Camera className="w-3.5 h-3.5" /> Ganti Foto
                    <input type="file" accept="image/*" onChange={handleAdminPhotoUpload} className="hidden" />
                  </label>
                  {profile.adminFotoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        onSaveProfile({ ...profile, adminFotoUrl: undefined });
                        showToast('Foto Profil Admin dikembalikan ke Logo Sekolah.', 'success');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Firebase Cloud Firestore Online Sync Section */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 via-white to-purple-500/10 border-2 border-amber-300 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black shadow-sm">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                  Database Cloud Firebase Firestore (Sinkronisasi Realtime)
                </h3>
                <p className="text-xs text-slate-500">
                  Listener <code className="font-mono">onSnapshot</code> aktif memantau perubahan data &amp; pemulihan cadangan di seluruh perangkat.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black border ${
                  cloudStatus === 'error'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{cloudStatus === 'error' ? 'Terputus' : 'Terkoneksi Realtime'}</span>
              </span>
              <button
                type="button"
                onClick={handleTestCloud}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Tes Koneksi
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Project ID Firebase</span>
              <span className="font-mono font-bold text-slate-800">{firebaseConfig.projectId}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Database ID Firestore</span>
              <span
                className="font-mono font-bold text-purple-700 truncate block"
                title={(firebaseConfig as any).firestoreDatabaseId || '(default)'}
              >
                {(firebaseConfig as any).firestoreDatabaseId || '(default)'}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Cadangan Cloud Terakhir</span>
              <span className="font-semibold text-slate-800 block truncate">
                {cloudBackupMeta?.timestamp ? formatIsoTime(cloudBackupMeta.timestamp) : 'Belum tercatat'}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Sinkronisasi Terakhir</span>
              <span className="font-semibold text-slate-800 block truncate">
                {cloudSyncMeta?.lastUpdated
                  ? `${formatIsoTime(cloudSyncMeta.lastUpdated)} (${cloudSyncMeta.updatedBy || 'admin'})`
                  : 'Menunggu sinkronisasi'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSyncToFirestore}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs shadow-sm flex items-center gap-2 cursor-pointer transition"
            >
              <CloudUpload className="w-4 h-4" />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Data ke Cloud Firestore'}</span>
            </button>

            <button
              type="button"
              disabled={isPulling}
              onClick={handlePullFromFirestore}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs shadow-sm flex items-center gap-2 cursor-pointer transition"
            >
              <CloudDownload className="w-4 h-4" />
              <span>{isPulling ? 'Memulihkan...' : 'Tarik Data Terbaru dari Cloud Firestore'}</span>
            </button>
          </div>
        </div>

        {/* Backup and Restore */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Backup */}
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                <Download className="w-5 h-5 text-emerald-600" /> Cadangkan Seluruh Data (.JSON)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Unduh salinan lengkap seluruh database: Profil Sekolah, Guru, Siswa, Kalender, Absensi, Penilaian
                Sumatif (AS), ASTS, ASAS, CBT, TKA, dan Catatan Wali Kelas.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={exportFullSystemJSON}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-5 py-2.5 rounded-2xl text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer transition"
              >
                <Download className="w-4 h-4" /> Download Cadangan (.JSON)
              </button>
            </div>
          </div>

          {/* Restore (Realtime Connected) */}
          <div className="p-6 rounded-3xl bg-sky-50/70 border border-sky-200 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-sky-600" /> Pulihkan Data dari Cadangan
                </h3>
                <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1">
                  <Radio className="w-3 h-3" /> Realtime Firestore
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Data yang dipulihkan dari file <strong>.JSON</strong> atau dari <strong>Cloud Backup</strong> akan
                otomatis disimpan ke Firebase Firestore (<code className="font-mono">students</code>,{' '}
                <code className="font-mono">attendance</code>, <code className="font-mono">kaldik</code>,{' '}
                <code className="font-mono">school_data</code>, dan <code className="font-mono">backups</code>) sehingga
                seluruh perangkat langsung ter-update secara real-time.
              </p>

              {cloudBackupMeta?.timestamp && (
                <div className="text-[11px] text-slate-600 bg-white border border-sky-200/80 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>
                    Cadangan cloud aktif: <strong>{formatIsoTime(cloudBackupMeta.timestamp)}</strong>
                    {typeof cloudBackupMeta.totalKeys === 'number' ? ` · ${cloudBackupMeta.totalKeys} modul` : ''}
                  </span>
                </div>
              )}

              {lastRestoreSummary && (
                <div className="text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{lastRestoreSummary}</span>
                </div>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleRestoreFile}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={isRestoringFile}
                onClick={() => fileInputRef.current?.click()}
                className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs shadow-md shadow-sky-500/20 flex items-center gap-2 cursor-pointer transition"
              >
                <Upload className="w-4 h-4" />
                <span>{isRestoringFile ? 'Memulihkan & Sinkron Cloud...' : 'Pilih File (.JSON) & Sinkron Realtime'}</span>
              </button>

              <button
                type="button"
                disabled={isPulling}
                onClick={handlePullFromFirestore}
                className="bg-white hover:bg-sky-100 disabled:opacity-50 text-sky-900 border border-sky-300 font-display font-black px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2 cursor-pointer transition"
              >
                <CloudDownload className="w-4 h-4 text-sky-700" />
                <span>{isPulling ? 'Memulihkan...' : 'Pulihkan dari Cloud Realtime'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Panel Khusus Pemulihan Data & Log Riwayat Penghapusan Nilai (TKA & CBT) */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/70 border-2 border-emerald-200 space-y-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-emerald-200/70 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <History className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                    Pemulihan Data Spesifik
                  </span>
                  <span className="text-[10px] font-bold bg-white border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded-full">
                    {deletionLogs.length} Total Log · {pendingDeletionCount} Belum Dipulihkan · {restoredDeletionCount} Pulih
                  </span>
                </div>
                <h3 className="font-display font-black text-base text-slate-900">
                  Pemulihan Data &amp; Log Riwayat Penghapusan Nilai (TKA / CBT)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                  Pantau seluruh riwayat penghapusan nilai TKA dan CBT. Jika ada nilai anak yang tidak sengaja terhapus, pulihkan langsung dari log atau pindai cadangan Cloud secara spesifik berdasarkan <strong>ID Siswa</strong>.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isSyncingDeletionLog}
              onClick={() => void handleSyncDeletionLog()}
              className="bg-white hover:bg-emerald-50 disabled:opacity-60 text-emerald-800 border border-emerald-300 font-display font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDeletionLog ? 'animate-spin' : ''}`} />
              <span>{isSyncingDeletionLog ? 'Menyegarkan...' : 'Segarkan Log Cloud'}</span>
            </button>
          </div>

          {/* Pencarian & Pemulihan Spesifik Berdasarkan ID Siswa */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-200/90 shadow-2xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display font-black text-xs sm:text-sm text-slate-800 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Pemulihan Data Spesifik Berdasarkan ID Siswa</span>
              </h4>
              {matchedRecoveryStudent && (
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                  Teridentifikasi: <strong>{matchedRecoveryStudent.nama}</strong> ({matchedRecoveryStudent.kelas}) · {matchingLogsForInputIdCount} catatan terhapus di log
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="block text-[11px] font-black text-slate-600 mb-1">
                  Pilih Siswa (Isi Otomatis ID Siswa):
                </label>
                <select
                  value={matchedRecoveryStudent?.id || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setRecoveryStudentIdInput(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs font-bold text-slate-800 outline-none focus:border-emerald-600 cursor-pointer"
                >
                  <option value="">-- Pilih dari Daftar Siswa ({activeStudentsList.length}) --</option>
                  {activeStudentsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {s.nama} ({s.kelas})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-black text-slate-600 mb-1">
                  Atau Ketik ID Siswa:
                </label>
                <input
                  type="text"
                  value={recoveryStudentIdInput}
                  onChange={(e) => setRecoveryStudentIdInput(e.target.value)}
                  placeholder="cth: s_6a_01"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-xs font-bold text-slate-900 outline-none focus:border-emerald-600"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-black text-slate-600 mb-1">
                  Target Data:
                </label>
                <select
                  value={recoveryCategory}
                  onChange={(e) => setRecoveryCategory(e.target.value as 'all' | 'tka' | 'cbt')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 outline-none focus:border-emerald-600 cursor-pointer"
                >
                  <option value="all">Semua (TKA &amp; CBT)</option>
                  <option value="tka">Khusus TKA</option>
                  <option value="cbt">Khusus CBT</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <button
                  type="button"
                  disabled={isRecoveringById || !recoveryStudentIdInput.trim()}
                  onClick={() => void handleRecoverSpecificStudentById()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-display font-black px-4 py-2 rounded-xl text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isRecoveringById ? 'animate-spin' : ''}`} />
                  <span>{isRecoveringById ? 'Memindai & Memulihkan...' : 'Pulihkan Data ID Ini'}</span>
                </button>
              </div>
            </div>

            {recoveryFeedbackBanner && (
              <div className="text-xs text-emerald-950 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{recoveryFeedbackBanner}</span>
              </div>
            )}
          </div>

          {/* Filter & Tabel Log Riwayat Penghapusan Nilai */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="Cari ID Siswa, nama, NISN, kelas, paket, mapel..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs outline-none focus:border-emerald-600"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={logCategoryFilter}
                  onChange={(e) => setLogCategoryFilter(e.target.value as 'all' | 'tka' | 'cbt')}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 outline-none focus:border-emerald-600 cursor-pointer"
                >
                  <option value="all">Semua Kategori</option>
                  <option value="tka">TKA Saja</option>
                  <option value="cbt">CBT Saja</option>
                </select>
                <select
                  value={logStatusFilter}
                  onChange={(e) => setLogStatusFilter(e.target.value as 'all' | 'pending' | 'restored')}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 outline-none focus:border-emerald-600 cursor-pointer"
                >
                  <option value="all">Semua Status ({deletionLogs.length})</option>
                  <option value="pending">Belum Dipulihkan ({pendingDeletionCount})</option>
                  <option value="restored">Sudah Dipulihkan ({restoredDeletionCount})</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-black whitespace-nowrap">Waktu Hapus</th>
                    <th className="p-3 font-black whitespace-nowrap">Kategori</th>
                    <th className="p-3 font-black">ID Siswa &amp; Peserta Didik</th>
                    <th className="p-3 font-black">Paket / Mapel</th>
                    <th className="p-3 font-black text-center">Nilai</th>
                    <th className="p-3 font-black text-right">Status &amp; Pemulihan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDeletionLogs.map((entry) => {
                    const isRestored = Boolean(entry.restoredAt);
                    const actionLabel =
                      entry.actionType === 'single'
                        ? 'Hapus Satuan'
                        : entry.actionType === 'paket'
                        ? 'Kosongkan Paket'
                        : 'Kosongkan Semua';
                    return (
                      <tr key={entry.logId} className="hover:bg-slate-50/90 transition">
                        <td className="p-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">
                            {formatIsoTime(entry.deletedAtIso)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Oleh: {entry.deletedBy || 'Admin/Guru'}
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                entry.category === 'tka'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {entry.category.toUpperCase()}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              {actionLabel}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setRecoveryStudentIdInput(entry.studentId);
                                setRecoveryCategory(entry.category);
                              }}
                              title="Klik untuk mengisi ID Siswa ke kotak Pemulihan Spesifik"
                              className="font-mono text-[10px] font-bold bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 border border-slate-200 px-1.5 py-0.5 rounded cursor-pointer transition"
                            >
                              ID: {entry.studentId || '-'}
                            </button>
                            {entry.kelas && (
                              <span className="text-[10px] font-bold text-slate-500">
                                {entry.kelas}
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-slate-900">{entry.studentName}</div>
                          {entry.nisn && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              NISN: {entry.nisn}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{entry.paket}</div>
                          {entry.mapel && entry.mapel !== '-' && (
                            <div className="text-[11px] text-slate-500">{entry.mapel}</div>
                          )}
                        </td>
                        <td className="p-3 text-center font-display font-black text-sm tabular-nums text-slate-900">
                          {typeof entry.skorRingkas === 'number' ? entry.skorRingkas : '—'}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {isRestored ? (
                            <div className="inline-flex flex-col items-end gap-1">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black">
                                <CheckCircle2 className="w-3 h-3" /> Sudah Dipulihkan
                              </span>
                              <button
                                type="button"
                                disabled={restoringLogId === entry.logId}
                                onClick={() => void handleRestoreLogEntry(entry)}
                                className="text-[10px] font-bold text-slate-500 hover:text-emerald-700 underline cursor-pointer"
                              >
                                Pulihkan Lagi
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={restoringLogId === entry.logId}
                              onClick={() => void handleRestoreLogEntry(entry)}
                              className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-display font-black px-3 py-1.5 rounded-xl text-[11px] shadow-2xs cursor-pointer transition"
                            >
                              <RotateCcw
                                className={`w-3 h-3 ${
                                  restoringLogId === entry.logId ? 'animate-spin' : ''
                                }`}
                              />
                              <span>
                                {restoringLogId === entry.logId ? 'Memulihkan...' : 'Pulihkan'}
                              </span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredDeletionLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                          <AlertCircle className="w-4 h-4 text-slate-400" />
                          <span>
                            {deletionLogs.length === 0
                              ? 'Belum ada riwayat penghapusan nilai TKA atau CBT yang tercatat. Setiap penghapusan nilai di menu Report TKA maupun CBT akan otomatis dicatat di sini.'
                              : 'Tidak ada catatan log penghapusan yang cocok dengan pencarian atau filter Anda.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pengaturan Fitur Khusus Admin (Administrasi Pembelajaran & Mode Kunci Ujian) */}
        {isAdmin && (
          <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-50/80 via-white to-amber-50/70 border-2 border-indigo-200 space-y-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-indigo-100 pb-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-display font-black text-sm sm:text-base text-slate-900">
                    Pengaturan Keamanan Ujian &amp; Hak Akses Modul Guru
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Kelola Mode Kunci Ujian (Exam Lock / PIN Pengawas) dan aktivasi bertahap modul Administrasi Pembelajaran ke seluruh guru.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Toggle Menu Administrasi Pembelajaran untuk Semua Guru */}
              <div className="p-4 rounded-2xl bg-white border border-indigo-200/80 flex flex-col justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <BookOpenCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-display font-black text-xs sm:text-sm text-slate-900">
                      Aktifkan Menu Administrasi Pembelajaran untuk Semua Guru
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      Saat <strong>Nonaktif</strong>, menu ini hanya tampil di akun <strong>Endi Soeprapto</strong> &amp; <strong>Kepala Sekolah</strong>. Saat <strong>Aktif</strong>, seluruh guru dapat mengisi perangkat ajar &amp; jurnal harian.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span
                    className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                      profile.isLearningAdminPublic
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {profile.isLearningAdminPublic ? 'Aktif untuk Semua Guru' : 'Khusus Endi Soeprapto & Kepsek'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(profile.isLearningAdminPublic)}
                    onClick={() => {
                      const nextVal = !profile.isLearningAdminPublic;
                      onSaveProfile({ ...profile, isLearningAdminPublic: nextVal });
                      showToast(
                        nextVal
                          ? 'Menu Administrasi Pembelajaran kini aktif untuk seluruh akun guru!'
                          : 'Menu Administrasi Pembelajaran dikembalikan khusus ke Endi Soeprapto & Kepala Sekolah.',
                        'success'
                      );
                    }}
                    className={`relative w-14 h-7 rounded-full transition-colors cursor-pointer p-1 ${
                      profile.isLearningAdminPublic ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        profile.isLearningAdminPublic ? 'translate-x-7' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Pengaturan PIN Pengawas & Exam Lock */}
              <div className="p-4 rounded-2xl bg-white border border-amber-200/90 flex flex-col justify-between gap-3">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-black text-xs sm:text-sm text-slate-900">
                      Mode Kunci Layar Penuh (Exam Lock)
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={profile.examLockEnabled !== false}
                      onClick={() => {
                        const nextVal = profile.examLockEnabled === false;
                        onSaveProfile({ ...profile, examLockEnabled: nextVal });
                        showToast(
                          nextVal
                            ? 'Mode Kunci Layar Penuh (Exam Lock) diaktifkan!'
                            : 'Mode Kunci Layar Penuh (Exam Lock) dinonaktifkan.',
                          'success'
                        );
                      }}
                      className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer p-0.5 ${
                        profile.examLockEnabled !== false ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          profile.examLockEnabled !== false ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        PIN / Password Buka Kunci Ujian (Pengawas):
                      </label>
                      <input
                        type="text"
                        value={profile.proctorPin ?? '2121'}
                        onChange={(e) =>
                          onSaveProfile({
                            ...profile,
                            proctorPin: e.target.value.trim() || '2121',
                          })
                        }
                        placeholder="2121"
                        maxLength={16}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white font-mono font-bold text-xs text-slate-900 outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Gunakan kombinasi <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono font-bold">Ctrl+C+B</kbd> saat ujian atau modal Buka Kunci Nilai dengan PIN ini (default: <strong>2121</strong>).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Ubah & Reset Password Administrator */}
        {isAdmin && onOpenChangePassword && (
          <div className="p-6 rounded-3xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="font-display font-black text-sm text-amber-950 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-600" /> Akun &amp; Password Administrator
              </h4>
              <p className="text-xs text-amber-800">
                {allowResetAdmin ? (
                  <>
                    Ubah kata sandi login akun Administrator Utama atau reset ke password default (<span className="font-mono font-bold">admin</span>) dan sinkronkan otomatis ke seluruh perangkat.
                  </>
                ) : (
                  <>
                    Ubah kata sandi login akun Administrator Utama dan sinkronkan otomatis ke seluruh perangkat.
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {allowResetAdmin &&
                (confirmResetAdminPass ? (
                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-amber-300">
                    <button
                      type="button"
                      onClick={() => {
                        resetStoredAdminPassword();
                        setConfirmResetAdminPass(false);
                        showToast('Password akun Administrator di-reset ke default ("admin")!', 'success');
                      }}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                    >
                      Ya, Reset ke "admin"
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResetAdminPass(false)}
                      className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmResetAdminPass(true)}
                    className="bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-display font-extrabold px-4 py-2.5 rounded-xl text-xs cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-700" /> Reset Password Admin
                  </button>
                ))}
              <button
                type="button"
                onClick={onOpenChangePassword}
                className="bg-amber-500 hover:bg-amber-600 text-white font-display font-extrabold px-4 py-2.5 rounded-xl text-xs cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" /> Rubah Password Admin
              </button>
            </div>
          </div>
        )}

        {/* Reset System to Factory SDN RBU 21 Defaults */}
        <div className="p-6 rounded-3xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-display font-black text-sm text-rose-950 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-rose-600" /> Reset Data ke Standar Awal
            </h4>
            <p className="text-xs text-rose-700">
              Mengembalikan seluruh data profil, akun guru, murid, dan nilai ke setelan bawaan resmi SDN Rawa Badak Utara 21.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetAll}
            className="bg-rose-600 hover:bg-rose-700 text-white font-display font-bold px-4 py-2 rounded-xl text-xs shrink-0 cursor-pointer shadow-xs"
          >
            Reset ke Data Awal
          </button>
        </div>
      </div>
    </section>
  );
};
