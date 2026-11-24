import React, { useEffect, useState } from 'react';
import { Camera, Image, RotateCcw, Save, ShieldCheck, Upload, X } from 'lucide-react';
import { SchoolProfile } from '../../types';
import { compressQuestionImage } from '../../utils/imageUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: SchoolProfile;
  onSaveProfile: (profile: SchoolProfile) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const AdminProfilePhotoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
  showToast,
}) => {
  const [adminFotoUrl, setAdminFotoUrl] = useState<string>(profile.adminFotoUrl || '');
  const [logoKemendikbudUrl, setLogoKemendikbudUrl] = useState<string>(profile.logoKemendikbudUrl);
  const [logoSekolahUrl, setLogoSekolahUrl] = useState<string>(profile.logoSekolahUrl);
  const [loginBackgroundUrl, setLoginBackgroundUrl] = useState<string>(profile.loginBackgroundUrl || '');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAdminFotoUrl(profile.adminFotoUrl || '');
      setLogoKemendikbudUrl(profile.logoKemendikbudUrl);
      setLogoSekolahUrl(profile.logoSekolahUrl);
      setLoginBackgroundUrl(profile.loginBackgroundUrl || '');
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleImagePick = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'adminFoto' | 'kemendikbud' | 'sekolah' | 'loginBg'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const compressed = await compressQuestionImage(file, {
        maxWidth: target === 'adminFoto' ? 400 : target === 'loginBg' ? 1200 : 480,
        maxHeight: target === 'adminFoto' ? 400 : target === 'loginBg' ? 800 : 480,
        quality: target === 'loginBg' ? 0.85 : 0.82,
      });
      if (target === 'adminFoto') {
        setAdminFotoUrl(compressed);
      } else if (target === 'kemendikbud') {
        setLogoKemendikbudUrl(compressed);
      } else if (target === 'sekolah') {
        setLogoSekolahUrl(compressed);
      } else {
        setLoginBackgroundUrl(compressed);
      }
    } catch {
      showToast('Gagal memproses file gambar. Pastikan format gambar valid.', 'error');
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({
      ...profile,
      logoKemendikbudUrl,
      logoSekolahUrl,
      adminFotoUrl: adminFotoUrl.trim() || undefined,
      loginBackgroundUrl: loginBackgroundUrl.trim() || undefined,
    });
    showToast(
      'Logo, Foto Profil Admin & Foto Latar Login berhasil disimpan dan disinkronkan realtime!',
      'success'
    );
    onClose();
  };

  const activePreviewAdminFoto = adminFotoUrl || logoSekolahUrl;
  const activePreviewLoginBg = loginBackgroundUrl || '/assets/image_13.png';

  return (
    <div className="fixed inset-0 z-[950] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white max-w-2xl w-full rounded-3xl p-6 sm:p-7 shadow-2xl border-2 border-rose-200 space-y-5 my-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-xs shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-black text-base sm:text-lg text-slate-800">
                Ubah Logo, Foto Admin &amp; Foto Latar Login
              </h3>
              <p className="text-[11px] text-slate-500">
                Perbarui foto profil akun Administrator, 2 logo resmi sekolah, serta foto latar belakang halaman login
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center font-bold text-sm cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Foto Profil Admin */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-rose-50/80 via-white to-amber-50/70 border border-rose-200 flex flex-col sm:flex-row items-center gap-4">
            <img
              src={activePreviewAdminFoto}
              alt="Foto Profil Admin"
              className="w-20 h-20 rounded-2xl object-cover bg-white border-2 border-rose-500 shadow-xs shrink-0"
            />
            <div className="flex-1 min-w-0 text-center sm:text-left space-y-1.5">
              <span className="inline-block text-[10px] font-black uppercase bg-rose-600 text-white px-2.5 py-0.5 rounded-full">
                Profil Administrator Utama
              </span>
              <h4 className="font-display font-black text-sm text-slate-800">
                Foto Profil Akun Admin
              </h4>
              <p className="text-[11px] text-slate-500">
                Tampil di bilah atas aplikasi, kartu profil sidebar, dan sesi login Admin.
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                <label className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs cursor-pointer shadow-xs transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isProcessing ? 'Memproses...' : 'Pilih Foto Profil'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isProcessing}
                    onChange={(e) => handleImagePick(e, 'adminFoto')}
                    className="hidden"
                  />
                </label>
                {adminFotoUrl && (
                  <button
                    type="button"
                    onClick={() => setAdminFotoUrl('')}
                    className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold px-3 py-2 rounded-xl text-xs cursor-pointer transition"
                    title="Gunakan Logo Sekolah sebagai foto profil default"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Pakai Logo Sekolah
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Foto Latar Belakang Login (Pendopo / Anak Belajar) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/70 border border-indigo-200 flex flex-col sm:flex-row items-center gap-4">
            <img
              src={activePreviewLoginBg}
              alt="Foto Latar Login"
              className="w-28 h-20 rounded-2xl object-cover bg-white border-2 border-indigo-500 shadow-xs shrink-0"
            />
            <div className="flex-1 min-w-0 text-center sm:text-left space-y-1.5">
              <span className="inline-block text-[10px] font-black uppercase bg-indigo-600 text-white px-2.5 py-0.5 rounded-full">
                Menu Ganti Foto Latar Login
              </span>
              <h4 className="font-display font-black text-sm text-slate-800">
                Foto Latar Belakang Halaman Login (Pendopo / Anak Belajar)
              </h4>
              <p className="text-[11px] text-slate-500">
                Gambar utama di sisi kiri layar login (misal foto anak-anak belajar di pendopo).
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                <label className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs cursor-pointer shadow-xs transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isProcessing ? 'Memproses...' : 'Ganti Foto Latar Login'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isProcessing}
                    onChange={(e) => handleImagePick(e, 'loginBg')}
                    className="hidden"
                  />
                </label>
                {loginBackgroundUrl && (
                  <button
                    type="button"
                    onClick={() => setLoginBackgroundUrl('')}
                    className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold px-3 py-2 rounded-xl text-xs cursor-pointer transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset Default
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2 Logo Resmi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Logo Kemendikbud */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3.5">
              <img
                src={logoKemendikbudUrl}
                alt="Logo Kemendikbud"
                className="w-16 h-16 rounded-2xl object-contain p-1.5 bg-white border-2 border-sky-400 shrink-0"
              />
              <div className="min-w-0 space-y-1.5">
                <span className="text-[10px] font-black uppercase text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full inline-block">
                  Logo 1: Kemendikbud
                </span>
                <div className="font-bold text-xs text-slate-800 truncate">
                  Tut Wuri Handayani
                </div>
                <label className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3 py-1.5 rounded-xl text-[11px] cursor-pointer shadow-2xs transition">
                  <Image className="w-3.5 h-3.5" /> Ganti Logo 1
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isProcessing}
                    onChange={(e) => handleImagePick(e, 'kemendikbud')}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Logo Sekolah */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3.5">
              <img
                src={logoSekolahUrl}
                alt="Logo Sekolah"
                className="w-16 h-16 rounded-2xl object-contain p-1.5 bg-white border-2 border-rose-400 shrink-0"
              />
              <div className="min-w-0 space-y-1.5">
                <span className="text-[10px] font-black uppercase text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full inline-block">
                  Logo 2: Sekolah
                </span>
                <div className="font-bold text-xs text-slate-800 truncate" title={profile.name}>
                  {profile.name}
                </div>
                <label className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-display font-extrabold px-3 py-1.5 rounded-xl text-[11px] cursor-pointer shadow-2xs transition">
                  <Image className="w-3.5 h-3.5" /> Ganti Logo 2
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isProcessing}
                    onChange={(e) => handleImagePick(e, 'sekolah')}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="p-3 bg-sky-50 rounded-2xl border border-sky-200 text-[11px] text-sky-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-sky-600 mt-0.5" />
            <span>
              Gambar otomatis dioptimalkan agar ringan dan langsung tersinkronisasi ke kartu absensi,
              halaman login, dan Cloud Firestore.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 disabled:opacity-60 text-white font-display font-extrabold text-xs shadow-md flex items-center gap-1.5 cursor-pointer transition"
            >
              <Save className="w-4 h-4" /> Simpan Perubahan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
