import React, { useEffect } from 'react';
import { X, Sparkles, CheckCircle2, History, Compass } from 'lucide-react';
import {
  APP_VERSION,
  RELEASE_DATE,
  CHANGELOG_DATA,
  getMajorVersionNumber,
  getGenerationBadgeLabel,
} from '../utils/appVersion';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  // Dukungan penutupan modal dengan tombol Esc
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-modal-title"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-rose-600 to-rose-700 text-white flex items-center justify-between gap-3 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h3 id="changelog-modal-title" className="font-display font-black text-base sm:text-lg leading-tight">
                Catatan Pembaruan (Changelog) — SERBU 21
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <p className="text-xs text-rose-100">
                  Versi Aktif <span className="font-mono font-bold">{APP_VERSION}</span> • Rilis {RELEASE_DATE}
                </p>
                <span className="px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-[10px] font-bold text-white tracking-wide inline-flex items-center gap-1">
                  <Compass className="w-3 h-3 text-amber-200" />
                  <span>{getGenerationBadgeLabel(APP_VERSION)}</span>
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="Tutup modal catatan pembaruan"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Timeline Section */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-2">
          <div className="relative pl-6 sm:pl-8 border-l-2 border-slate-200 ml-3 sm:ml-4 space-y-6 my-2">
            {CHANGELOG_DATA.map((item, idx) => {
              const isLatest = idx === 0;
              const currentMajor = getMajorVersionNumber(item.version);
              const prevItem = idx > 0 ? CHANGELOG_DATA[idx - 1] : null;
              const prevMajor = prevItem ? getMajorVersionNumber(prevItem.version) : null;
              const isFirstOfGeneration = idx === 0 || currentMajor !== prevMajor;

              return (
                <React.Fragment key={item.version}>
                  {/* Generation Section Divider / Header */}
                  {isFirstOfGeneration && (
                    <div className="relative -ml-6 sm:-ml-8 pt-3 pb-1 flex items-center gap-2.5">
                      <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-display font-black tracking-wide shadow-2xs border ${
                          currentMajor === 4
                            ? 'bg-rose-50 border-rose-300 text-rose-800'
                            : currentMajor === 3
                            ? 'bg-sky-50 border-sky-300 text-sky-800'
                            : currentMajor === 2
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-purple-50 border-purple-300 text-purple-800'
                        }`}
                      >
                        <Compass className="w-3.5 h-3.5 shrink-0" />
                        <span>{getGenerationBadgeLabel(item.version)}</span>
                      </div>
                      <div className="h-px bg-slate-200 flex-1" />
                    </div>
                  )}

                  <div className="relative">
                    {/* Timeline Node Indicator */}
                    <div
                      className={`absolute -left-[31px] sm:-left-[39px] top-1.5 w-4 h-4 rounded-full border-2 transition-all ${
                        isLatest
                          ? 'bg-emerald-500 border-white ring-4 ring-emerald-100 shadow-xs'
                          : 'bg-slate-300 border-white ring-2 ring-slate-100'
                      }`}
                      aria-hidden="true"
                    />

                    {/* Version Card */}
                    <div
                      className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                        isLatest
                          ? 'bg-emerald-50/60 border-emerald-300/80 shadow-xs ring-1 ring-emerald-200/50'
                          : 'bg-slate-50/70 border-slate-200/80'
                      } space-y-2.5`}
                    >
                      {/* Header: Version badge + Generation pill + date */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg font-mono font-black text-xs ${
                              isLatest
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {item.version}
                          </span>
                          {isLatest && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider border border-emerald-200">
                              Terbaru
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              currentMajor === 4
                                ? 'bg-white text-rose-700 border-rose-200/90 shadow-2xs'
                                : currentMajor === 3
                                ? 'bg-white text-sky-700 border-sky-200/90 shadow-2xs'
                                : currentMajor === 2
                                ? 'bg-white text-emerald-700 border-emerald-200/90 shadow-2xs'
                                : 'bg-white text-purple-700 border-purple-200/90 shadow-2xs'
                            }`}
                          >
                            {getGenerationBadgeLabel(item.version)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-slate-500">
                          {item.date}
                        </span>
                      </div>

                      {/* Version Title */}
                      <h4 className="font-display font-black text-sm sm:text-base text-slate-900 leading-snug">
                        {item.title}
                      </h4>

                      {/* Highlights List */}
                      <ul className="space-y-2 pt-0.5">
                        {item.highlights.map((hl, hIdx) => (
                          <li
                            key={hIdx}
                            className="flex items-start gap-2 text-xs sm:text-sm text-slate-700 leading-relaxed"
                          >
                            <CheckCircle2
                              className={`w-4 h-4 shrink-0 mt-0.5 ${
                                isLatest ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                            />
                            <span>{hl}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <History className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="hidden sm:inline">
              Data &amp; penyimpanan lokal tetap aman tersinkronisasi.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-rose-600 text-white font-display font-black text-xs cursor-pointer transition shadow-xs whitespace-nowrap active:scale-95"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
