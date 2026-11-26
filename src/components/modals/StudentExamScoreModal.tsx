import React, { useEffect } from 'react';
import { Trophy, CheckCircle2, XCircle, Clock, Award, ArrowRight, ShieldCheck } from 'lucide-react';
import { CBTExamResult } from '../../types';

interface Props {
  isOpen: boolean;
  result: CBTExamResult | null;
  onClose: () => void;
  onViewHistory?: () => void;
}

export const StudentExamScoreModal: React.FC<Props> = ({
  isOpen,
  result,
  onClose,
  onViewHistory,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !result) return null;

  const score = Number(result.nilai ?? result.skor ?? 0);
  const isPassed = score >= 75;

  return (
    <div
      className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 sm:p-7 text-center space-y-6 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-20 h-20 rounded-3xl ${isPassed ? 'bg-emerald-100 border-2 border-emerald-300 text-emerald-600' : 'bg-amber-100 border-2 border-amber-300 text-amber-600'} flex items-center justify-center mx-auto shadow-inner`}>
          <Trophy className="w-10 h-10 animate-bounce" />
        </div>

        <div className="space-y-1.5">
          <span className="inline-block px-3 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-extrabold uppercase tracking-wide">
            {result.category === 'tka' ? 'Hasil Ujian TKA' : 'Hasil Ujian CBT'} • {result.mapel || result.judul || 'Evaluasi'}
          </span>
          <h3 className="font-display font-black text-xl text-slate-900">
            {result.judul || result.paketName || 'Ujian Selesai'}
          </h3>
          <p className="text-xs text-slate-500">
            {result.studentName} ({result.kelas || 'Siswa'})
          </p>
        </div>

        {/* Skor Besar */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-50 via-indigo-50/30 to-emerald-50/50 border border-slate-200 space-y-2">
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
            Nilai Akhir Anda
          </div>
          <div className={`font-mono font-black text-4xl sm:text-5xl ${isPassed ? 'text-emerald-600' : 'text-indigo-600'}`}>
            {score}
          </div>
          <p className="text-xs font-bold text-slate-600">
            {isPassed
              ? '🎉 Luar biasa! Nilai Anda sudah tuntas melampaui KKTP (>= 75).'
              : '👍 Bagus! Terus tingkatkan semangat belajar untuk hasil yang makin optimal.'}
          </p>
        </div>

        {/* Statistik Ringkas */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
            <div className="text-[10px] font-bold text-emerald-800 uppercase">Benar</div>
            <div className="font-mono font-black text-emerald-700 text-base mt-0.5">
              {result.benarHots !== undefined ? result.benarHots : '-'}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200">
            <div className="text-[10px] font-bold text-rose-800 uppercase">Salah</div>
            <div className="font-mono font-black text-rose-700 text-base mt-0.5">
              {result.benarHots !== undefined && result.totalHots !== undefined ? Math.max(0, result.totalHots - result.benarHots) : '-'}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200">
            <div className="text-[10px] font-bold text-sky-800 uppercase">Durasi</div>
            <div className="font-mono font-black text-sky-700 text-base mt-0.5">
              {result.durasiDetik ? `${Math.floor(result.durasiDetik / 60)}m` : 'Selesai'}
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-rose-600 text-white font-display font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
          >
            <span>Selesai &amp; Kembali ke Beranda</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {onViewHistory && (
            <button
              type="button"
              onClick={onViewHistory}
              className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
            >
              Lihat Riwayat Nilai Saya
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Nilai sudah tersimpan otomatis ke server sekolah &amp; tercatat resmi.</span>
        </div>
      </div>
    </div>
  );
};
