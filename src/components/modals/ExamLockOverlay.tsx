import React, { useState } from 'react';
import { Lock, ShieldAlert, KeyRound, Check, X, Eye, EyeOff } from 'lucide-react';
import { verifyProctorPin, requestExamFullscreen } from '../../utils/examLock';

interface Props {
  isOpen: boolean;
  violationCount: number;
  schoolProctorPin?: string;
  onUnlockSuccess: (allowExitTotal: boolean) => void;
  onClosePrompt?: () => void;
}

export const ExamLockOverlay: React.FC<Props> = ({
  isOpen,
  violationCount,
  schoolProctorPin,
  onUnlockSuccess,
}) => {
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyProctorPin(pinInput, schoolProctorPin)) {
      setErrorMsg('');
      setPinInput('');
      setShowPinDialog(false);
      onUnlockSuccess(false); // Lanjutkan ujian
    } else {
      setErrorMsg('PIN Pengawas salah! Masukkan "2121" atau PIN khusus sekolah.');
    }
  };

  const handleFullExit = () => {
    if (verifyProctorPin(pinInput, schoolProctorPin)) {
      setErrorMsg('');
      setPinInput('');
      setShowPinDialog(false);
      onUnlockSuccess(true); // Keluar total
    } else {
      setErrorMsg('PIN Pengawas salah!');
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/92 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-3xl border-2 border-rose-500 shadow-2xl max-w-md w-full p-6 sm:p-8 text-center space-y-5 animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-3xl bg-rose-100 border-2 border-rose-300 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert className="w-8 h-8 animate-bounce" />
        </div>

        <div className="space-y-2">
          <h2 className="font-display font-black text-xl sm:text-2xl text-slate-900 tracking-tight">
            AKSES UJIAN TERKUNCI!
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Terdeteksi keluar dari layar ujian, mengecilkan jendela, atau berpindah aplikasi (Pelanggaran ke-{violationCount}). Hubungi Guru Pengawas untuk membuka kunci.
          </p>
        </div>

        {!showPinDialog ? (
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => {
                requestExamFullscreen();
                setShowPinDialog(true);
              }}
              className="w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-amber-200" />
              <span>Masukkan PIN Pengawas (Atau Tekan Ctrl+C+B)</span>
            </button>

            <button
              type="button"
              onClick={() => requestExamFullscreen()}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
            >
              Kembali ke Layar Penuh (Fullscreen)
            </button>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4 pt-2 border-t border-slate-100">
            <div className="text-left space-y-1">
              <label className="block text-xs font-extrabold text-slate-700">
                PIN / Password Pengawas:
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Masukkan PIN (Default: 2121)"
                  autoFocus
                  required
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border-2 border-slate-300 bg-slate-50 font-mono font-bold text-sm outline-none focus:border-rose-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errorMsg && (
                <p className="text-[11px] font-bold text-rose-600 pt-1 animate-shake">
                  {errorMsg}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="submit"
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>Lanjutkan Ujian</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPinDialog(false)}
                className="py-2.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer transition"
              >
                Batal
              </button>
            </div>
          </form>
        )}

        <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100">
          Sistem Keamanan Ujian Proktor SERBU 21 • PIN Default: <strong className="font-mono text-slate-600">2121</strong>
        </div>
      </div>
    </div>
  );
};
