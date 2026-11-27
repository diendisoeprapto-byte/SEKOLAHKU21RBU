import React, { useRef, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  HardDriveDownload,
  KeyRound,
  Layers,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { SchoolProfile } from '../types';
import { verifyProctorPin } from '../utils/examLock';
import {
  BackupFilePreview,
  ExportBackupResult,
  exportFullSchoolBackupJson,
  parseAndPreviewBackupFile,
  restoreFullSchoolBackupJson,
  RestoreProgressInfo,
  RestoreSchoolBackupResult,
} from '../utils/schoolBackupService';
import { getActiveSchoolNpsn } from '../utils/examAnswerKeyFirestore';

interface Props {
  profile: SchoolProfile;
  activeUserName?: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onBackupRestored?: () => void;
}

export const SchoolFullBackupCard: React.FC<Props> = ({
  profile,
  activeUserName = 'Admin',
  showToast,
  onBackupRestored,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportBackupResult | null>(null);

  const [selectedFileName, setSelectedFileName] = useState('');
  const [preview, setPreview] = useState<BackupFilePreview | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [adminPinInput, setAdminPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgressInfo | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreSchoolBackupResult | null>(null);

  const activeNpsn = getActiveSchoolNpsn(profile?.npsn);

  const handleDownloadFullBackup = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const result = await exportFullSchoolBackupJson({
        npsn: activeNpsn,
        schoolName: profile?.name,
        actorName: activeUserName,
      });
      setExportResult(result);
      showToast(
        `Full Backup Sekolah (${result.fileName}) berhasil diunduh (${result.totalDocuments} dokumen Firestore & ${result.totalLocalKeys} modul lokal).`,
        'success'
      );
    } catch (err: any) {
      showToast(
        `Gagal mengekspor full backup sekolah: ${err?.message || 'Terjadi kesalahan sistem.'}`,
        'error'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreResult(null);
    setPinError('');

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsedPreview = parseAndPreviewBackupFile(String(reader.result || ''));
        setSelectedFileName(file.name);
        setPreview(parsedPreview);
        showToast(
          `File "${file.name}" siap dipulihkan (${parsedPreview.totalDocuments} dokumen, ${parsedPreview.totalLocalKeys} modul lokal).`,
          'success'
        );
      } catch (err: any) {
        setSelectedFileName('');
        setPreview(null);
        showToast(
          err?.message || 'File JSON tidak valid sebagai cadangan SERBU 21.',
          'error'
        );
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleClearSelectedFile = () => {
    setSelectedFileName('');
    setPreview(null);
    setAdminPinInput('');
    setPinError('');
    setRestoreProgress(null);
  };

  const handleExecuteRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview || isRestoring) return;

    if (!adminPinInput.trim()) {
      setPinError('Masukkan PIN Pengawas / Admin untuk konfirmasi pemulihan data.');
      return;
    }

    if (!verifyProctorPin(adminPinInput, profile?.proctorPin)) {
      setPinError('PIN Admin tidak sesuai. Periksa PIN Pengawas sekolah (default: 2121).');
      showToast('PIN konfirmasi tidak valid. Pemulihan dibatalkan.', 'error');
      return;
    }

    setPinError('');
    setIsRestoring(true);
    setRestoreResult(null);
    setRestoreProgress({
      stage: 'Mempersiapkan antrean batch Firestore (maks. 400 dokumen/batch)...',
      currentBatch: 0,
      totalBatches: 1,
      processedDocs: 0,
      totalDocs: Math.max(1, preview.totalDocuments),
    });

    try {
      const res = await restoreFullSchoolBackupJson({
        preview,
        mode: restoreMode,
        actorName: activeUserName,
        currentNpsn: activeNpsn,
        onProgress: (info) => setRestoreProgress(info),
      });
      setRestoreResult(res);
      setAdminPinInput('');
      onBackupRestored?.();
      showToast(
        `Pemulihan selesai! ${res.restoredDocsCount} dokumen Firestore & ${res.restoredLocalKeysCount} modul lokal dipulihkan dalam ${res.totalBatches} batch.`,
        'success'
      );
    } catch (err: any) {
      showToast(
        `Gagal memulihkan database sekolah: ${err?.message || 'Pastikan koneksi internet stabil.'}`,
        'error'
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const progressPct =
    restoreProgress && restoreProgress.totalDocs > 0
      ? Math.min(100, Math.round((restoreProgress.processedDocs / restoreProgress.totalDocs) * 100))
      : 0;

  return (
    <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border-2 border-indigo-400/40 shadow-lg space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/15 pb-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
            <Archive className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                Ketahanan Data Multi-Tenant
              </span>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-indigo-200 border border-white/15">
                NPSN: {activeNpsn}
              </span>
            </div>
            <h3 className="font-display font-black text-base sm:text-lg text-white">
              Pusat Pencadangan &amp; Pemulihan Data (Backup &amp; Restore)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              Ekspor seluruh koleksi database sekolah aktif (<code className="font-mono text-emerald-300">schools/{activeNpsn}</code>, Profil Sekolah, Guru, Siswa Reguler &amp; Inklusi, Paket Soal, Kunci Jawaban Terproteksi, Hasil CBT/TKA, e-Rapor, Jurnal &amp; Modul Ajar, serta Bank Media Ajar) atau pulihkan secara bertahap maksimal <strong>400 dokumen per batch</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Column 1: Unduh Full Backup Sekolah */}
        <div className="p-5 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-display font-black text-sm text-white flex items-center gap-2">
                <HardDriveDownload className="w-4 h-4 text-emerald-300" />
                <span>Ekspor Database Sekolah Penuh</span>
              </h4>
              <span className="text-[10px] font-mono font-bold text-emerald-200 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-400/30">
                .JSON Terstruktur
              </span>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed">
              Mengunduh arsip lengkap <span className="font-mono font-semibold text-amber-200">Backup_SERBU21_{activeNpsn}_[Tanggal].json</span> mencakup:
            </p>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-200">
              <div className="bg-slate-950/40 rounded-xl px-3 py-2 border border-white/10 flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Profil, Guru &amp; Siswa</span>
              </div>
              <div className="bg-slate-950/40 rounded-xl px-3 py-2 border border-white/10 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Soal &amp; Kunci Terproteksi</span>
              </div>
              <div className="bg-slate-950/40 rounded-xl px-3 py-2 border border-white/10 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Nilai CBT/TKA &amp; e-Rapor</span>
              </div>
              <div className="bg-slate-950/40 rounded-xl px-3 py-2 border border-white/10 flex items-center gap-2">
                <FileJson className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Jurnal, Modul &amp; Media Ajar</span>
              </div>
            </div>

            {exportResult && (
              <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-[11px] text-emerald-100 space-y-1">
                <div className="font-black flex items-center gap-1.5 text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Backup Berhasil Diunduh: {exportResult.fileName}</span>
                </div>
                <p className="text-emerald-100/90">
                  Tercatat <strong>{exportResult.totalCollections}</strong> koleksi/subkoleksi, <strong>{exportResult.totalDocuments}</strong> dokumen Firestore, dan <strong>{exportResult.totalLocalKeys}</strong> modul penyimpanan lokal ({Math.max(1, Math.round(exportResult.byteSize / 1024))} KB).
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={isExporting || isRestoring}
            onClick={() => void handleDownloadFullBackup()}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-display font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Mengumpulkan Seluruh Koleksi Sekolah...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Unduh Full Backup Sekolah (.json)</span>
              </>
            )}
          </button>
        </div>

        {/* Column 2: Pulihkan Data dari File Backup (.json) */}
        <div className="p-5 rounded-2xl bg-white text-slate-900 border border-indigo-200 flex flex-col justify-between space-y-4 shadow-sm">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-display font-black text-sm text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>Pulihkan Data dari File Backup (.json)</span>
              </h4>
              <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                Maks. 400 Dok/Batch
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />

            {!preview ? (
              <div className="p-4 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 text-center space-y-2.5">
                <FileJson className="w-8 h-8 text-indigo-500 mx-auto" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-800">
                    Pilih Berkas Cadangan Sekolah (.json)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Mendukung berkas Full Backup v5.1.0 maupun cadangan JSON versi sebelumnya.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isRestoring || isExporting}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-display font-black text-xs inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Pilih File Backup (.json)</span>
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => void handleExecuteRestore(e)} className="space-y-3">
                {/* Preview Summary */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900 truncate" title={selectedFileName}>
                        {selectedFileName}
                      </p>
                      <p className="text-[11px] text-slate-600">
                        {preview.schoolName} • NPSN <span className="font-mono font-bold">{preview.npsn}</span> ({preview.schemaVersion})
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isRestoring}
                      onClick={handleClearSelectedFile}
                      className="p-1 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer"
                      title="Ganti file backup"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                      {preview.totalDocuments} Dokumen Cloud
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                      {preview.totalCollections} Koleksi
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                      {preview.totalLocalKeys} Modul Lokal
                    </span>
                  </div>
                </div>

                {/* Mode Restore Options */}
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-black text-slate-700">
                    Mode Pemulihan Database:
                  </span>
                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                      restoreMode === 'merge'
                        ? 'bg-emerald-50 border-emerald-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="backupRestoreMode"
                      checked={restoreMode === 'merge'}
                      onChange={() => setRestoreMode('merge')}
                      disabled={isRestoring}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <div className="text-[11px]">
                      <div className="font-extrabold text-slate-900">
                        Gabungkan tanpa menimpa data yang lebih baru (Disarankan)
                      </div>
                      <div className="text-slate-600">
                        Dokumen di Cloud dengan waktu pembaruan lebih baru tetap dipertahankan.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                      restoreMode === 'replace'
                        ? 'bg-rose-50 border-rose-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="backupRestoreMode"
                      checked={restoreMode === 'replace'}
                      onChange={() => setRestoreMode('replace')}
                      disabled={isRestoring}
                      className="mt-0.5 accent-rose-600"
                    />
                    <div className="text-[11px]">
                      <div className="font-extrabold text-slate-900">
                        Timpa Penuh sesuai File Backup (Replace Full)
                      </div>
                      <div className="text-slate-600">
                        Mengembalikan seluruh database persis seperti isi berkas cadangan.
                      </div>
                    </div>
                  </label>
                </div>

                {/* Admin PIN Confirmation */}
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                    <span>Konfirmasi PIN Admin / Pengawas untuk Restore:</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      value={adminPinInput}
                      onChange={(e) => {
                        setAdminPinInput(e.target.value);
                        if (pinError) setPinError('');
                      }}
                      disabled={isRestoring}
                      placeholder="Masukkan PIN Admin (default: 2121)"
                      maxLength={24}
                      className="w-full px-3 py-2 pr-9 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white font-mono font-bold text-xs text-slate-900 outline-none focus:border-indigo-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((p) => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {pinError && (
                    <p className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>{pinError}</span>
                    </p>
                  )}
                </div>

                {/* Progress Indicator */}
                {isRestoring && restoreProgress && (
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                      <span className="truncate">{restoreProgress.stage}</span>
                      <span className="font-mono shrink-0 ml-2">
                        Batch {restoreProgress.currentBatch}/{restoreProgress.totalBatches} ({progressPct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-indigo-200 overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isRestoring || isExporting}
                  className={`w-full py-2.5 px-4 rounded-xl font-display font-black text-xs text-white flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50 ${
                    restoreMode === 'replace'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isRestoring ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memulihkan Database Sekolah...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {restoreMode === 'merge'
                          ? 'Verifikasi PIN & Pulihkan (Mode Gabung)'
                          : 'Verifikasi PIN & Timpa Penuh Database'}
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}

            {restoreResult && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-[11px] text-emerald-900 space-y-1">
                <div className="font-black flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Pemulihan Database Sekolah Selesai ({restoreResult.totalBatches} Batch)</span>
                </div>
                <p>
                  <strong>{restoreResult.restoredDocsCount}</strong> dokumen Cloud &amp; <strong>{restoreResult.restoredLocalKeysCount}</strong> modul lokal dipulihkan
                  {restoreResult.skippedNewerDocsCount > 0
                    ? ` • ${restoreResult.skippedNewerDocsCount} dokumen dipertahankan karena lebih baru`
                    : ''}
                  {restoreResult.deletedStaleDocsCount > 0
                    ? ` • ${restoreResult.deletedStaleDocsCount} dokumen usang dibersihkan`
                    : ''}
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
