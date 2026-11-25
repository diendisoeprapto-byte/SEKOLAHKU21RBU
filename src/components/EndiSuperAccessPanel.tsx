import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert,
  Image as ImageIcon,
  KeyRound,
  Upload,
  CheckCircle2,
  RotateCcw,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  AlertTriangle,
  Sparkles,
  Loader2,
  X,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ActiveUser, SchoolProfile } from '../types';
import { db } from '../utils/firebase';
import { isEndiSoepraptoUser } from '../utils/sarahAttachments';
import { saveStoredAdminPassword } from '../utils/storage';
import {
  AdminCredentialsDoc,
  clearLocalAdminLockout,
  getCachedLoginAppearanceUrl,
  getLocalAdminLockout,
  setCachedLoginAppearanceUrl,
  subscribeToAdminCredentials,
  subscribeToLoginAppearance,
} from '../utils/authSession';
import { mapFirestorePermissionError, sanitizeInput } from '../utils/sanitize';
import {
  extractImageFilesFromClipboard,
  extractImageFilesFromDataTransfer,
  useWindowImagePaste,
} from '../utils/imageDropPaste';

interface Props {
  activeUser: ActiveUser;
  profile: SchoolProfile;
  onUpdateProfile: (profile: SchoolProfile) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const DEFAULT_PENDOPO_IMAGE = '/assets/image_13.png';
const MAX_COMPRESSED_BYTES = 440 * 1024; // < 450 KB agar ringan & aman di Firestore

async function compressLoginPhotoOnCanvas(file: File): Promise<{
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('File gambar tidak dapat dibaca.'));
      el.src = objectUrl;
    });

    const maxWidth = 1600;
    const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
    const targetW = Math.max(1, Math.round(img.naturalWidth * scale));
    const targetH = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Kanvas HTML5 tidak tersedia di peramban ini.');
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Coba WEBP 0.82 dulu, lalu JPEG 0.82, dan turunkan kualitas bertahap bila > 440 KB
    const candidates: Array<{ mime: string; quality: number }> = [
      { mime: 'image/webp', quality: 0.82 },
      { mime: 'image/jpeg', quality: 0.82 },
      { mime: 'image/jpeg', quality: 0.72 },
      { mime: 'image/jpeg', quality: 0.62 },
      { mime: 'image/jpeg', quality: 0.5 },
    ];

    let bestDataUrl = '';
    let bestBytes = Number.POSITIVE_INFINITY;

    for (const c of candidates) {
      const url = canvas.toDataURL(c.mime, c.quality);
      const byteLen = Math.round(((url.split(',')[1] || '').length * 3) / 4);
      if (byteLen < bestBytes) {
        bestBytes = byteLen;
        bestDataUrl = url;
      }
      if (byteLen <= MAX_COMPRESSED_BYTES) {
        return { dataUrl: url, sizeBytes: byteLen, width: targetW, height: targetH };
      }
    }

    // Jika masih lebih dari batas 440 KB (misalnya gambar sangat detail), perkecil resolusi 1280px
    const smallScale = Math.min(1, 1280 / targetW);
    canvas.width = Math.max(1, Math.round(targetW * smallScale));
    canvas.height = Math.max(1, Math.round(targetH * smallScale));
    const ctx2 = canvas.getContext('2d');
    if (ctx2) {
      ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
      const smallUrl = canvas.toDataURL('image/jpeg', 0.78);
      const smallBytes = Math.round(((smallUrl.split(',')[1] || '').length * 3) / 4);
      return {
        dataUrl: smallUrl,
        sizeBytes: smallBytes,
        width: canvas.width,
        height: canvas.height,
      };
    }

    return {
      dataUrl: bestDataUrl,
      sizeBytes: bestBytes,
      width: targetW,
      height: targetH,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const EndiSuperAccessPanel: React.FC<Props> = ({
  activeUser,
  profile,
  onUpdateProfile,
  showToast,
}) => {
  const isAllowedEndi = isEndiSoepraptoUser(activeUser) && activeUser.role !== 'siswa';

  const [panelTab, setPanelTab] = useState<'login_photo' | 'admin_recovery'>('login_photo');

  // State Tab 1: Foto Login Screen
  const [cloudBgUrl, setCloudBgUrl] = useState<string>(() => getCachedLoginAppearanceUrl());
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string>('');
  const [pendingMeta, setPendingMeta] = useState<{ sizeKb: number; width: number; height: number } | null>(null);
  const [photoStatusMsg, setPhotoStatusMsg] = useState<string>('');
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // State Tab 2: Pemulihan & Reset Akun Admin
  const [adminCredDoc, setAdminCredDoc] = useState<AdminCredentialsDoc | null>(null);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isRecoveringAdmin, setIsRecoveringAdmin] = useState(false);
  const [confirmModalAction, setConfirmModalAction] = useState<null | 'reset_password' | 'unlock_only'>(null);

  useEffect(() => {
    if (!isAllowedEndi) return;
    const unsubPhoto = subscribeToLoginAppearance((docData) => {
      setCloudBgUrl(docData?.imageDataUrl || '');
    });
    const unsubCred = subscribeToAdminCredentials((cred) => {
      setAdminCredDoc(cred);
    });
    return () => {
      unsubPhoto();
      unsubCred();
    };
  }, [isAllowedEndi]);

  if (!isAllowedEndi) {
    return (
      <section className="bg-white rounded-3xl border-2 border-rose-200 p-8 text-center space-y-3 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="font-display font-black text-lg text-slate-900">
          Akses Terbatas — Khusus Endi Soeprapto
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Halaman Pengaturan Sistem &amp; Cadangan Admin hanya dapat diakses secara eksklusif oleh kreator aplikasi (Endi Soeprapto).
        </p>
      </section>
    );
  }

  const effectivePreviewSrc =
    pendingPreviewUrl || cloudBgUrl || profile.loginBackgroundUrl || DEFAULT_PENDOPO_IMAGE;

  const localLock = getLocalAdminLockout();
  const isAdminCurrentlyLocked = Boolean(
    (adminCredDoc?.lockedUntil && adminCredDoc.lockedUntil > Date.now()) ||
      (localLock.lockedUntil && localLock.lockedUntil > Date.now())
  );

  const processPhotoFile = async (file: File) => {
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type || '') && !/\.(jpe?g|png|webp)$/i.test(file.name || '')) {
      showToast('Format file harus JPG, PNG, atau WEBP.', 'error');
      return;
    }

    setIsCompressingPhoto(true);
    setPhotoStatusMsg('');
    try {
      const compressed = await compressLoginPhotoOnCanvas(file);
      setPendingPreviewUrl(compressed.dataUrl);
      setPendingMeta({
        sizeKb: Math.round(compressed.sizeBytes / 1024),
        width: compressed.width,
        height: compressed.height,
      });
      showToast(
        `Foto berhasil dikompres (${Math.round(compressed.sizeBytes / 1024)} KB, ${compressed.width}×${compressed.height}px). Siap disimpan ke Cloud!`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Gagal memproses foto login.', 'error');
    } finally {
      setIsCompressingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useWindowImagePaste({
    enabled: Boolean(isAllowedEndi && panelTab === 'login_photo' && !confirmModalAction),
    onImageFiles: (files) => {
      if (files[0]) void processPhotoFile(files[0]);
    },
  });

  const handleSelectPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processPhotoFile(file);
  };

  const handleSaveLoginPhoto = async () => {
    const targetUrl = pendingPreviewUrl || cloudBgUrl;
    if (!targetUrl) {
      showToast('Pilih dan unggah gambar baru terlebih dahulu.', 'error');
      return;
    }
    setIsSavingPhoto(true);
    try {
      await setDoc(
        doc(db, 'settings', 'login_appearance'),
        {
          imageDataUrl: targetUrl,
          updatedAt: new Date().toISOString(),
          updatedBy: 'Endi Soeprapto',
          serverTime: serverTimestamp(),
        },
        { merge: true }
      );
      setCachedLoginAppearanceUrl(targetUrl);
      onUpdateProfile({
        ...profile,
        loginBackgroundUrl: targetUrl,
      });
      setPendingPreviewUrl('');
      setPendingMeta(null);
      const okMsg =
        'Foto Login berhasil disimpan permanen ke Cloud SERBU 21 dan langsung aktif di halaman Login.';
      setPhotoStatusMsg(okMsg);
      showToast(okMsg, 'success');
    } catch (err) {
      const msg = mapFirestorePermissionError(err);
      showToast(msg, 'error');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const handleResetLoginPhotoDefault = async () => {
    setIsSavingPhoto(true);
    try {
      await setDoc(
        doc(db, 'settings', 'login_appearance'),
        {
          imageDataUrl: '',
          updatedAt: new Date().toISOString(),
          updatedBy: 'Endi Soeprapto',
          serverTime: serverTimestamp(),
        },
        { merge: true }
      );
      setCachedLoginAppearanceUrl('');
      onUpdateProfile({
        ...profile,
        loginBackgroundUrl: '',
      });
      setPendingPreviewUrl('');
      setPendingMeta(null);
      const msg = 'Foto Login berhasil dikembalikan ke Foto Default Pendopo (/assets/image_13.png).';
      setPhotoStatusMsg(msg);
      showToast(msg, 'success');
    } catch (err) {
      showToast(mapFirestorePermissionError(err), 'error');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const handleOpenConfirmResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNew = sanitizeInput(newAdminPassword, 80);
    const cleanConfirm = sanitizeInput(confirmAdminPassword, 80);
    if (cleanNew.length < 4) {
      showToast('Password baru Admin minimal 4 karakter.', 'error');
      return;
    }
    if (cleanNew !== cleanConfirm) {
      showToast('Konfirmasi password baru Admin tidak cocok.', 'error');
      return;
    }
    setConfirmModalAction('reset_password');
  };

  const executeAdminRecovery = async () => {
    if (!confirmModalAction) return;
    setIsRecoveringAdmin(true);
    try {
      const nowIso = new Date().toISOString();
      if (confirmModalAction === 'reset_password') {
        const cleanPass = sanitizeInput(newAdminPassword, 80);
        await setDoc(
          doc(db, 'settings', 'admin_credentials'),
          {
            password: cleanPass,
            active: true,
            failedAttempts: 0,
            lockedUntil: null,
            lastAdminRecoveryBy: 'Endi Soeprapto',
            lastAdminRecoveryAt: nowIso,
            updatedAt: nowIso,
            serverTime: serverTimestamp(),
          },
          { merge: true }
        );
        saveStoredAdminPassword(cleanPass);
        clearLocalAdminLockout();
        setNewAdminPassword('');
        setConfirmAdminPassword('');
        showToast(
          'Akun Admin Sekolah berhasil dipulihkan dan password baru langsung aktif!',
          'success'
        );
      } else {
        await setDoc(
          doc(db, 'settings', 'admin_credentials'),
          {
            active: true,
            failedAttempts: 0,
            lockedUntil: null,
            lastAdminRecoveryBy: 'Endi Soeprapto',
            lastAdminRecoveryAt: nowIso,
            updatedAt: nowIso,
            serverTime: serverTimestamp(),
          },
          { merge: true }
        );
        clearLocalAdminLockout();
        showToast('Sesi & Lockout Akun Admin berhasil dibuka kembali!', 'success');
      }
      setConfirmModalAction(null);
    } catch (err) {
      showToast(mapFirestorePermissionError(err), 'error');
    } finally {
      setIsRecoveringAdmin(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Banner Utama Super-Access */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-indigo-950 text-white rounded-3xl p-6 sm:p-7 shadow-lg border border-rose-500/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[10px] font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> Panel Super-Access • Khusus Endi Soeprapto
            </span>
            <h1 className="font-display font-black text-xl sm:text-2xl tracking-tight">
              Pengaturan Sistem &amp; Cadangan Admin SERBU 21
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Kelola gambar latar halaman Login secara permanen di Cloud Firestore dan pulihkan akun Administrator apabila mengalami lupa password atau terkunci.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPanelTab('login_photo')}
              className={`px-4 py-2.5 rounded-2xl font-display font-black text-xs flex items-center gap-2 transition cursor-pointer ${
                panelTab === 'login_photo'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-slate-200 border border-white/15'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Ganti Foto Login</span>
            </button>
            <button
              type="button"
              onClick={() => setPanelTab('admin_recovery')}
              className={`px-4 py-2.5 rounded-2xl font-display font-black text-xs flex items-center gap-2 transition cursor-pointer ${
                panelTab === 'admin_recovery'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-slate-200 border border-white/15'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Pemulihan Akun Admin</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: UPLOAD & KELOLA FOTO LOGIN SCREEN */}
      {panelTab === 'login_photo' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div>
              <h2 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-rose-600" />
                <span>Unggah Foto Latar Halaman Login</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Gambar otomatis dikompresi via HTML5 Canvas (lebar maksimal 1600px, ukuran &lt; 450 KB) agar langsung termuat cepat dan permanen di Cloud SERBU 21.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleSelectPhotoFile}
              className="hidden"
            />

            <div
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingPhoto(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDraggingPhoto(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingPhoto(false);
                const files = extractImageFilesFromDataTransfer(e.dataTransfer);
                if (files[0]) void processPhotoFile(files[0]);
                else showToast('Harap jatuhkan file gambar (JPG, PNG, atau WEBP).', 'error');
              }}
              onPaste={(e) => {
                const files = extractImageFilesFromClipboard(e.clipboardData);
                if (files[0]) {
                  e.preventDefault();
                  e.stopPropagation();
                  void processPhotoFile(files[0]);
                }
              }}
              className={`p-5 rounded-2xl border-2 border-dashed text-center space-y-3 outline-none transition ${
                isDraggingPhoto
                  ? 'border-rose-500 bg-rose-100/80 ring-2 ring-rose-300'
                  : 'border-rose-200 bg-rose-50/40 focus:border-rose-400'
              }`}
            >
              <Upload className="w-8 h-8 text-rose-600 mx-auto" />
              <div>
                <p className="font-display font-bold text-xs text-slate-800">
                  Pilih, Seret &amp; Lepas (Drag &amp; Drop), atau Tempel (Ctrl+V) Foto Login
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Mendukung format .JPG / .PNG / .WEBP (disarankan rasio lanskap tajam).
                </p>
              </div>
              <button
                type="button"
                disabled={isCompressingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-display font-black text-xs inline-flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                {isCompressingPhoto ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengompres Foto...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Pilih Foto dari Perangkat</span>
                  </>
                )}
              </button>
              {pendingMeta && (
                <p className="text-[11px] font-bold text-emerald-700">
                  ✓ Siap diterapkan: {pendingMeta.width}×{pendingMeta.height}px • {pendingMeta.sizeKb} KB
                </p>
              )}
            </div>

            {photoStatusMsg && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{photoStatusMsg}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={isSavingPhoto || !pendingPreviewUrl}
                onClick={handleSaveLoginPhoto}
                className="flex-1 min-w-[200px] py-3 px-4 rounded-2xl bg-slate-900 hover:bg-emerald-600 disabled:opacity-45 disabled:cursor-not-allowed text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
              >
                {isSavingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Simpan &amp; Terapkan Foto Login</span>
              </button>

              <button
                type="button"
                disabled={isSavingPhoto}
                onClick={handleResetLoginPhotoDefault}
                className="py-3 px-4 rounded-2xl bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 border border-slate-200 font-display font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Kembalikan ke Foto Default Pendopo</span>
              </button>
            </div>
          </div>

          {/* Live Preview */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-black text-sm text-slate-900">
                Live Preview Tampilan Login Screen
              </h3>
              <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {pendingPreviewUrl
                  ? 'Pratinjau Unggahan Baru'
                  : cloudBgUrl
                  ? 'Aktif di Cloud'
                  : 'Default Pendopo'}
              </span>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-slate-900 h-72 border border-slate-200 shadow-inner">
              <img
                src={effectivePreviewSrc}
                alt="Pratinjau Foto Login SERBU 21"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-black/35 pointer-events-none" />
              <div className="absolute bottom-4 left-4 right-4 text-white space-y-1">
                <span className="inline-block px-2 py-0.5 rounded bg-rose-600/90 text-[9px] font-black uppercase">
                  Portal Edukasi &amp; Evaluasi Sekolah Dasar
                </span>
                <p className="font-display font-black text-sm leading-tight">
                  SELAMAT DATANG DI WEB SERBU 21
                </p>
                <p className="text-[11px] font-bold text-amber-100">
                  (Sistem Edukasi, Rapor, dan Basis Data Utama)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PEMULIHAN & RESET AKUN ADMIN SEKOLAH */}
      {panelTab === 'admin_recovery' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleOpenConfirmResetPassword}
            className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4"
          >
            <div>
              <h2 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-600" />
                <span>Reset &amp; Pulihkan Password Admin Sekolah</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Gunakan panel darurat ini apabila akun Administrator lupa kata sandi atau terblokir karena terlalu banyak percobaan masuk.
              </p>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Password Baru Akun Admin
              </label>
              <div className="relative">
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  required
                  minLength={4}
                  placeholder="Minimal 4 karakter..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-slate-50 focus:bg-white focus:border-rose-500 outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Konfirmasi Password Baru Admin
              </label>
              <div className="relative">
                <input
                  type={showConfirmPass ? 'text' : 'password'}
                  value={confirmAdminPassword}
                  onChange={(e) => setConfirmAdminPassword(e.target.value)}
                  required
                  minLength={4}
                  placeholder="Ketik ulang password baru..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-slate-50 focus:bg-white focus:border-rose-500 outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isRecoveringAdmin}
              className="w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>Pulihkan Akun Admin Sekolah</span>
            </button>
          </form>

          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
              <Unlock className="w-5 h-5 text-emerald-600" />
              <span>Status Keamanan &amp; Pembukaan Kunci Sesi Admin</span>
            </h3>

            <div
              className={`p-4 rounded-2xl border ${
                isAdminCurrentlyLocked
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              } space-y-1.5`}
            >
              <div className="flex items-center justify-between text-xs font-black">
                <span>Status Lockout Akun Admin</span>
                <span>{isAdminCurrentlyLocked ? 'TERKUNCI' : 'AKTIF NORMAL'}</span>
              </div>
              <p className="text-[11px]">
                {isAdminCurrentlyLocked
                  ? 'Akun Administrator terdeteksi terkunci sementara karena percobaan sandi keliru.'
                  : 'Akun Administrator saat ini aktif dan dapat digunakan masuk pada halaman Login.'}
              </p>
            </div>

            {adminCredDoc?.lastAdminRecoveryAt && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div>
                  Pemulihan Terakhir oleh:{' '}
                  <strong className="text-slate-900">
                    {adminCredDoc.lastAdminRecoveryBy || 'Endi Soeprapto'}
                  </strong>
                </div>
                <div>
                  Waktu:{' '}
                  <strong className="text-slate-900">
                    {new Date(adminCredDoc.lastAdminRecoveryAt).toLocaleString('id-ID')}
                  </strong>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={isRecoveringAdmin}
              onClick={() => setConfirmModalAction('unlock_only')}
              className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-emerald-600 disabled:opacity-50 text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>Buka Kunci Sesi / Reset Lockout Admin</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI RESET ADMIN */}
      {confirmModalAction && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border-2 border-amber-300 space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => setConfirmModalAction(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              <h3 className="font-display font-black text-base text-slate-900">
                Konfirmasi Pemulihan Akses Admin
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin mereset akses akun Administrator SERBU 21? Tindakan ini akan dicatat di Cloud atas nama <strong>Endi Soeprapto</strong>.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalAction(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-bold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isRecoveringAdmin}
                onClick={executeAdminRecovery}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-display font-black text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                {isRecoveringAdmin && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Ya, Reset Akses Admin</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
