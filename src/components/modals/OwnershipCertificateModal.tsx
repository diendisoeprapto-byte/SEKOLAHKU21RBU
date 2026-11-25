import React from 'react';
import { Award, ShieldCheck, Heart, X, Sparkles, Lock } from 'lucide-react';
import {
  _CREATOR_SIGNATURE_ENDI_DILANESA,
  SystemOwnershipStatus,
} from '../../utils/ownershipWatermark';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ownershipStatus: SystemOwnershipStatus;
}

export const OwnershipCertificateModal: React.FC<Props> = ({
  isOpen,
  onClose,
  ownershipStatus,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ownership-cert-title"
    >
      <div className="relative max-w-lg w-full rounded-[2rem] bg-gradient-to-b from-amber-50 via-white to-rose-50/70 p-1.5 shadow-2xl border-2 border-amber-300 my-8">
        <div className="relative rounded-[1.65rem] bg-white/95 border border-amber-200/80 p-6 sm:p-8 text-center space-y-5 overflow-hidden">
          {/* Subtle decorative corner glow */}
          <div className="pointer-events-none absolute -top-16 -right-16 w-44 h-44 rounded-full bg-rose-100/50 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 w-44 h-44 rounded-full bg-amber-100/60 blur-2xl" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup sertifikat"
            className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 flex items-center justify-center transition cursor-pointer z-10"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Emblem Seal */}
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-600 to-amber-500 text-white flex items-center justify-center shadow-lg border-2 border-amber-200">
              <Award className="w-8 h-8" />
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-700">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sertifikat Digital Keaslian Karya</span>
            </div>
            <h2
              id="ownership-cert-title"
              className="mt-1.5 font-display font-black text-lg sm:text-xl tracking-wide text-slate-900"
            >
              VERIFIKASI ORISINALITAS KARYA DIGITAL
            </h2>
          </div>

          <div className="relative z-10 border-y border-amber-200/70 py-4 space-y-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">
                Nama Aplikasi &amp; Satuan Pendidikan
              </span>
              <p className="font-display font-black text-base sm:text-lg text-rose-700 mt-0.5">
                {_CREATOR_SIGNATURE_ENDI_DILANESA.appName} (Sistem Edukasi, Rapor, dan Basis Data Utama) • {_CREATOR_SIGNATURE_ENDI_DILANESA.institution}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">
                Original Creator &amp; Architect
              </span>
              <p className="font-display font-black text-lg text-slate-900 mt-0.5">
                {_CREATOR_SIGNATURE_ENDI_DILANESA.creator}
              </p>
            </div>

            <div className="mx-auto max-w-sm rounded-2xl bg-rose-50/90 border border-rose-200/80 px-4 py-3">
              <div className="flex items-center justify-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-600">
                <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                <span>Dedikasi Khusus</span>
              </div>
              <p className="font-serif italic font-bold text-sm sm:text-base text-rose-900 mt-1">
                &ldquo;{_CREATOR_SIGNATURE_ENDI_DILANESA.dedication}&rdquo;
              </p>
            </div>
          </div>

          {/* Integrity Metadata Footer */}
          <div className="relative z-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500 font-mono">
            <span className="inline-flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-600" />
              Status: <strong className="text-emerald-700">TERVERIFIKASI ASLI</strong>
            </span>
            <span>•</span>
            <span>Tahun {_CREATOR_SIGNATURE_ENDI_DILANESA.year}</span>
            <span>•</span>
            <span>Segel: {ownershipStatus.checksum}</span>
          </div>

          <div className="relative z-10 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 rounded-2xl bg-slate-900 hover:bg-rose-700 text-white font-display font-extrabold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Tutup Sertifikat</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
