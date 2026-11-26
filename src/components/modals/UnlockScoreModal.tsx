import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { DEFAULT_PROCTOR_PIN, verifyProctorPin } from '../../utils/examLock';

export type UnlockScoreActionMode = 'recalculate' | 'delete_reexam' | 'manual_unlock';

export interface UnlockMapelOption {
  key: string;
  label: string;
  count?: number;
}

interface UnlockScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  examType: 'CBT' | 'TKA';
  scopeLabel: string;
  itemCount: number;
  hasAnswersCount?: number;
  schoolProctorPin?: string;
  allowManualUnlock?: boolean;
  availableMapels?: UnlockMapelOption[];
  initialSelectedMapels?: string[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onExecuteAction: (mode: UnlockScoreActionMode, selectedMapels: string[]) => Promise<void>;
}

export const UnlockScoreModal: React.FC<UnlockScoreModalProps> = ({
  isOpen,
  onClose,
  examType,
  scopeLabel,
  itemCount,
  hasAnswersCount = 0,
  schoolProctorPin,
  allowManualUnlock = true,
  availableMapels = [],
  initialSelectedMapels,
  showToast,
  onExecuteAction,
}) => {
  const [selectedMode, setSelectedMode] = useState<UnlockScoreActionMode>('recalculate');
  const [selectedMapels, setSelectedMapels] = useState<string[]>([]);
  const [pinInput, setPinInput] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const availableKeysSignature = availableMapels.map((m) => m.key).join('|');
  const initialKeysSignature = (initialSelectedMapels || []).join('|');

  useEffect(() => {
    if (isOpen) {
      setPinInput('');
      setPinError('');
      setIsProcessing(false);
      setSelectedMode(hasAnswersCount > 0 ? 'recalculate' : 'delete_reexam');

      if (availableMapels.length > 0) {
        if (initialSelectedMapels && initialSelectedMapels.length > 0) {
          const initLower = new Set(
            initialSelectedMapels.map((k) => String(k || '').trim().toLowerCase())
          );
          const matched = availableMapels
            .filter((opt) => initLower.has(opt.key.trim().toLowerCase()))
            .map((opt) => opt.key);
          setSelectedMapels(matched.length > 0 ? matched : availableMapels.map((m) => m.key));
        } else {
          setSelectedMapels(availableMapels.map((m) => m.key));
        }
      } else {
        setSelectedMapels([]);
      }
    }
  }, [isOpen, hasAnswersCount, availableKeysSignature, initialKeysSignature]);

  if (!isOpen) return null;

  const hasMapelSelector = availableMapels.length > 0;

  const toggleMapelSelection = (key: string) => {
    setSelectedMapels((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;

    if (hasMapelSelector && selectedMapels.length === 0) {
      showToast('Pilih minimal 1 mata pelajaran (mapel) terlebih dahulu!', 'error');
      return;
    }

    if (!verifyProctorPin(pinInput, schoolProctorPin)) {
      setPinError(
        `PIN Pengawas salah! Masukkan PIN sekolah yang aktif (default: ${DEFAULT_PROCTOR_PIN}).`
      );
      showToast('PIN Pengawas / Admin tidak sesuai!', 'error');
      return;
    }

    setPinError('');
    setIsProcessing(true);
    try {
      await onExecuteAction(selectedMode, selectedMapels);
      onClose();
    } catch (err: any) {
      showToast(
        err?.message || 'Gagal memproses pembukaan kunci nilai ujian.',
        'error'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-amber-200 shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 px-6 py-4 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
              <Unlock className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider bg-black/20 px-2 py-0.5 rounded-md inline-block">
                Otoritas Khusus Admin &amp; Endi Soeprapto · {examType}
              </span>
              <h3 className="font-display font-black text-base leading-tight mt-0.5 truncate">
                Buka Kunci Nilai &amp; Koreksi Ulang Skor
              </h3>
            </div>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Scope Info */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-950">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-black">Target Operasi ({itemCount} Data Terkunci):</div>
              <div className="text-amber-900 font-semibold">{scopeLabel}</div>
              <div className="text-[11px] text-amber-800">
                Tercatat <strong>{hasAnswersCount}</strong> dari <strong>{itemCount}</strong> data memiliki riwayat jawaban tersimpan untuk dikoreksi ulang otomatis.
              </div>
            </div>
          </div>

          {/* Mapel Selection */}
          {hasMapelSelector && (
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-indigo-950">
                    Pilih Mata Pelajaran (Mapel) yang Diproses:
                  </div>
                  <p className="text-[11px] text-indigo-800">
                    {availableMapels.length > 1
                      ? 'Centang hanya mapel tertentu yang ingin diproses/dihapus. Mapel yang tidak dicentang tetap aman.'
                      : 'Mapel target yang akan diproses:'}
                  </p>
                </div>
                {availableMapels.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedMapels(availableMapels.map((m) => m.key))}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-[11px] font-bold text-indigo-700 cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMapels([])}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 border border-slate-200 text-[11px] font-bold text-slate-600 hover:text-rose-600 cursor-pointer"
                    >
                      Kosongkan
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableMapels.map((opt) => {
                  const checked = selectedMapels.includes(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition select-none ${
                        checked
                          ? 'bg-white border-indigo-500 text-indigo-950 shadow-2xs font-bold'
                          : 'bg-white/60 border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMapelSelection(opt.key)}
                          className="rounded border-indigo-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                        />
                        <span className="truncate">{opt.label}</span>
                      </span>
                      {typeof opt.count === 'number' && (
                        <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-black shrink-0 tabular-nums">
                          {opt.count}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {selectedMapels.length === 0 && (
                <p className="text-[11px] font-bold text-rose-600">
                  Pilih minimal 1 mata pelajaran untuk melanjutkan proses.
                </p>
              )}
            </div>
          )}

          {/* Action Selection */}
          <div className="space-y-2.5">
            <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
              Pilih Tindakan Buka Kunci:
            </label>

            {/* Option A: Recalculate */}
            <button
              type="button"
              onClick={() => setSelectedMode('recalculate')}
              className={`w-full text-left p-3.5 rounded-2xl border-2 transition cursor-pointer flex items-start gap-3 ${
                selectedMode === 'recalculate'
                  ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  selectedMode === 'recalculate'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                <Calculator className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-black text-xs sm:text-sm text-slate-900">
                    1. Buka Kunci &amp; Hitung Ulang Nilai Otomatis
                  </span>
                  {selectedMode === 'recalculate' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  Membuka kunci sementara, mengevaluasi ulang seluruh jawaban tersimpan siswa menggunakan <strong>kunci jawaban soal terbaru</strong>, memperbarui Nilai Akhir, HOTS, Rekap Hasil &amp; Matriks Analisis via <code className="font-mono">writeBatch</code>, lalu mengunci kembali tanpa siswa mengulang ujian.
                </p>
              </div>
            </button>

            {/* Option B: Delete for Re-Exam */}
            <button
              type="button"
              onClick={() => setSelectedMode('delete_reexam')}
              className={`w-full text-left p-3.5 rounded-2xl border-2 transition cursor-pointer flex items-start gap-3 ${
                selectedMode === 'delete_reexam'
                  ? 'border-rose-600 bg-rose-50/70 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  selectedMode === 'delete_reexam'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-black text-xs sm:text-sm text-slate-900">
                    2. Buka Kunci &amp; Hapus Nilai (Izinkan Siswa Ujian Ulang)
                  </span>
                  {selectedMode === 'delete_reexam' && (
                    <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  Menghapus dokumen nilai terkunci dari Firestore (<code className="font-mono">{examType === 'TKA' ? 'tka_submissions' : 'cbt_results'}</code>) &amp; cache lokal sehingga status kunci percobaan pertama terhapus dan siswa dapat langsung <strong>mengerjakan ulang ujian</strong>.
                </p>
              </div>
            </button>

            {/* Option C: Unlock Manual Edit */}
            {allowManualUnlock && (
              <button
                type="button"
                onClick={() => setSelectedMode('manual_unlock')}
                className={`w-full text-left p-3.5 rounded-2xl border-2 transition cursor-pointer flex items-start gap-3 ${
                  selectedMode === 'manual_unlock'
                    ? 'border-sky-600 bg-sky-50/70 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    selectedMode === 'manual_unlock'
                      ? 'bg-sky-600 text-white'
                      : 'bg-sky-100 text-sky-700'
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-black text-xs sm:text-sm text-slate-900">
                      3. Buka Kunci untuk Input / Edit Nilai Manual
                    </span>
                    {selectedMode === 'manual_unlock' && (
                      <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    Melepaskan penguncian nilai resmi (<code className="font-mono">isLocked = false</code>) agar nilai siswa dapat langsung diubah secara manual lewat modal <strong>Edit / Input Nilai Manual</strong>.
                  </p>
                </div>
              </button>
            )}
          </div>

          {selectedMode === 'delete_reexam' && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                <strong>Perhatian:</strong> Nilai lama tetap dicatat otomatis ke <strong>Log Riwayat Penghapusan Nilai</strong> di menu Pengaturan Admin jika sewaktu-waktu perlu dipulihkan.
              </span>
            </div>
          )}

          {/* PIN Verification */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              <span>Verifikasi PIN Pengawas / Admin</span>
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  if (pinError) setPinError('');
                }}
                placeholder={`Masukkan PIN Pengawas (default: ${DEFAULT_PROCTOR_PIN})`}
                autoFocus
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 bg-white font-mono font-bold text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                tabIndex={-1}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {pinError && (
              <p className="text-[11px] font-bold text-rose-600">{pinError}</p>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={isProcessing}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-bold text-xs cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={
                isProcessing ||
                !pinInput.trim() ||
                (hasMapelSelector && selectedMapels.length === 0)
              }
              className={`px-5 py-2.5 rounded-xl text-white font-display font-black text-xs shadow-md flex items-center gap-2 cursor-pointer transition disabled:opacity-50 ${
                selectedMode === 'delete_reexam'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : selectedMode === 'manual_unlock'
                  ? 'bg-sky-600 hover:bg-sky-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memproses ke Firestore...</span>
                </>
              ) : selectedMode === 'recalculate' ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Konfirmasi &amp; Hitung Ulang Nilai</span>
                </>
              ) : selectedMode === 'delete_reexam' ? (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Konfirmasi &amp; Hapus Nilai</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Konfirmasi &amp; Buka Kunci Edit</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
