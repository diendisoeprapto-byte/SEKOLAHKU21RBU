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
} from 'lucide-react';
import { SchoolProfile } from '../../types';
import { exportFullSystemJSON } from '../../utils/storage';
import { testConnection, handleFirestoreError, OperationType } from '../../utils/firebase';
import {
  CloudBackupDocMeta,
  CloudSyncPayload,
  pullBackupFromCloudRealtime,
  restoreBackupJsonToCloudRealtime,
  subscribeToCloudBackupDoc,
  subscribeToCloudChanges,
  syncAllLocalToCloud,
} from '../../utils/cloudSync';
import firebaseConfig from '../../../firebase-applet-config.json';

interface Props {
  profile: SchoolProfile;
  onSaveProfile: (profile: SchoolProfile) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onResetAll: () => void;
  activeUserName?: string;
  onBackupRestored?: () => void;
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
  onSaveProfile,
  showToast,
  onResetAll,
  activeUserName = 'admin',
  onBackupRestored,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isRestoringFile, setIsRestoringFile] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'connecting' | 'online' | 'error'>('connecting');
  const [cloudBackupMeta, setCloudBackupMeta] = useState<CloudBackupDocMeta | null>(null);
  const [cloudSyncMeta, setCloudSyncMeta] = useState<CloudSyncPayload | null>(null);
  const [lastRestoreSummary, setLastRestoreSummary] = useState<string>('');

  // Realtime listeners (onSnapshot) for backups/latest & school_data/primary_data
  useEffect(() => {
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

  const handleKemendikbudUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        onSaveProfile({
          ...profile,
          logoKemendikbudUrl: reader.result as string,
        });
        showToast('Logo Kemendikbud berhasil diperbarui & disinkronkan realtime!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSchoolLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        onSaveProfile({
          ...profile,
          logoSekolahUrl: reader.result as string,
        });
        showToast('Logo Sekolah (Monas Edition) berhasil diperbarui & disinkronkan realtime!', 'success');
      };
      reader.readAsDataURL(file);
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

        {/* 2 Logo Upload Section */}
        <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
          <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
            <Image className="w-5 h-5 text-rose-600" /> Pengaturan 2 Logo Resmi (Terkoneksi ke Kartu Barcode &amp; e-Rapor)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Logo 1: Kemendikbud */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 flex items-center gap-4">
              <img
                src={profile.logoKemendikbudUrl}
                alt="Logo Kemendikbud"
                className="w-20 h-20 rounded-2xl object-contain p-2 bg-slate-50 border-2 border-sky-400 shrink-0"
              />
              <div className="space-y-2 min-w-0">
                <span className="text-[10px] font-black uppercase text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full">
                  Logo 1: Kemendikbud
                </span>
                <h4 className="font-bold text-sm text-slate-800">Tut Wuri Handayani</h4>
                <label className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3 py-1.5 rounded-xl text-xs cursor-pointer shadow-xs transition">
                  <Upload className="w-3.5 h-3.5" /> Ganti Logo 1
                  <input type="file" accept="image/*" onChange={handleKemendikbudUpload} className="hidden" />
                </label>
              </div>
            </div>

            {/* Logo 2: Sekolah Monas */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 flex items-center gap-4">
              <img
                src={profile.logoSekolahUrl}
                alt="Logo Sekolah"
                className="w-20 h-20 rounded-2xl object-contain p-2 bg-slate-50 border-2 border-rose-400 shrink-0"
              />
              <div className="space-y-2 min-w-0">
                <span className="text-[10px] font-black uppercase text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full">
                  Logo 2: Logo Sekolah
                </span>
                <h4 className="font-bold text-sm text-slate-800">SDN Rawa Badak Utara 21</h4>
                <label className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-3 py-1.5 rounded-xl text-xs cursor-pointer shadow-xs transition">
                  <Upload className="w-3.5 h-3.5" /> Ganti Logo 2
                  <input type="file" accept="image/*" onChange={handleSchoolLogoUpload} className="hidden" />
                </label>
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
