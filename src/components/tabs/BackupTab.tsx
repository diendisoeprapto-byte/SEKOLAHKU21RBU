import React, { useRef, useState } from 'react';
import {
  Database,
  Upload,
  Download,
  RotateCcw,
  Image,
  CheckCircle,
  ShieldCheck,
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { SchoolProfile } from '../../types';
import { exportFullSystemJSON, restoreFullSystemJSON } from '../../utils/storage';
import { db, testConnection, handleFirestoreError, OperationType } from '../../utils/firebase';
import firebaseConfig from '../../../firebase-applet-config.json';

interface Props {
  profile: SchoolProfile;
  onSaveProfile: (profile: SchoolProfile) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onResetAll: () => void;
}

export const BackupTab: React.FC<Props> = ({
  profile,
  onSaveProfile,
  showToast,
  onResetAll,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'online' | 'error'>('online');

  const handleTestCloud = async () => {
    showToast('Memeriksa koneksi ke Firebase Cloud Firestore...', 'success');
    const ok = await testConnection();
    if (ok) {
      setCloudStatus('online');
      showToast('Koneksi Firebase Cloud Firestore aktif & terhubung!', 'success');
    } else {
      setCloudStatus('error');
      showToast('Koneksi Firebase gagal atau sedang offline.', 'error');
    }
  };

  const handleSyncToFirestore = async () => {
    setIsSyncing(true);
    try {
      const backupData: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sekolahku_')) {
          try {
            backupData[key] = JSON.parse(localStorage.getItem(key) || 'null');
          } catch {
            backupData[key] = localStorage.getItem(key);
          }
        }
      }
      const backupDoc = {
        id: 'latest',
        timestamp: new Date().toISOString(),
        version: '1.0',
        dataJson: JSON.stringify(backupData),
      };
      await setDoc(doc(db, 'backups', 'latest'), backupDoc);
      showToast('Data sistem berhasil disinkronkan ke Firebase Cloud Firestore!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'backups/latest');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromFirestore = async () => {
    setIsPulling(true);
    try {
      const snap = await getDoc(doc(db, 'backups', 'latest'));
      if (!snap.exists()) {
        showToast('Belum ada data cadangan di Firebase Cloud Firestore.', 'error');
        return;
      }
      const data = snap.data();
      if (data?.dataJson) {
        const success = restoreFullSystemJSON(data.dataJson);
        if (success) {
          showToast('Data berhasil dipulihkan dari Cloud Firestore! Memuat ulang sistem...', 'success');
          setTimeout(() => window.location.reload(), 1000);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'backups/latest');
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
        showToast('Logo Kemendikbud berhasil diperbarui!', 'success');
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
        showToast('Logo Sekolah (Monas Edition) berhasil diperbarui!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const success = restoreFullSystemJSON(reader.result as string);
      if (success) {
        showToast('Cadangan data berhasil dipulihkan! Memuat ulang sistem...', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast('Gagal memulihkan cadangan. Pastikan file JSON valid.', 'error');
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
              Menu 5. Pengaturan & Sistem
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
              <Database className="w-5 h-5 text-slate-700" /> 2 Logo Resmi & Cadangan Data Sistem (Backup / Restore)
            </h2>
            <p className="text-xs text-slate-500">
              Kelola Logo Kemendikbud dan Logo Sekolah Monas, serta amankan seluruh data aplikasi.
            </p>
          </div>
        </div>

        {/* 2 Logo Upload Section */}
        <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
          <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
            <Image className="w-5 h-5 text-rose-600" /> Pengaturan 2 Logo Resmi (Terkoneksi ke Kartu Barcode & e-Rapor)
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
                  Database Cloud Firebase Firestore (Aktif &amp; Terhubung)
                </h3>
                <p className="text-xs text-slate-500">
                  Data tersimpan secara persisten di Google Cloud Firestore dengan sinkronisasi multi-perangkat real-time.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Online Cloud
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Project ID Firebase</span>
              <span className="font-mono font-bold text-slate-800">{firebaseConfig.projectId}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Database ID Firestore</span>
              <span className="font-mono font-bold text-purple-700 truncate block" title={firebaseConfig.firestoreDatabaseId}>
                {firebaseConfig.firestoreDatabaseId}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
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
              <span>{isPulling ? 'Mengunduh...' : 'Tarik Data dari Cloud Firestore'}</span>
            </button>
          </div>
        </div>

        {/* Backup and Restore */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Backup */}
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
            <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-600" /> Cadangkan Seluruh Data (.JSON)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Unduh salinan lengkap seluruh database: Profil Sekolah, Guru, Siswa, Kalender, Absensi, Penilaian
              Sumatif (AS), ASTS, ASAS, CBT, dan Catatan Wali Kelas.
            </p>
            <button
              type="button"
              onClick={exportFullSystemJSON}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black px-5 py-2.5 rounded-2xl text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer transition"
            >
              <Download className="w-4 h-4" /> Download Cadangan (.JSON)
            </button>
          </div>

          {/* Restore */}
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
            <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2">
              <Upload className="w-5 h-5 text-sky-600" /> Pulihkan Data dari Cadangan
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pulihkan database dari file cadangan .JSON yang pernah diunduh sebelumnya untuk mengembalikan seluruh
              data secara utuh.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleRestoreFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-sky-600 hover:bg-sky-700 text-white font-display font-black px-5 py-2.5 rounded-2xl text-xs shadow-md shadow-sky-500/20 flex items-center gap-2 cursor-pointer transition"
            >
              <Upload className="w-4 h-4" /> Pilih File Cadangan (.JSON)
            </button>
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
