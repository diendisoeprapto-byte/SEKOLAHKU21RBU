import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, Sparkles } from 'lucide-react';
import { QuestionContent } from './QuestionContent';
import { MathRenderer, MathFontFamily, MixedFractionMode, MATH_FONT_CONFIGS } from './MathRenderer';
import { PosisiGambar } from '../utils/questionFormat';

interface PreviewOptionItem {
  key: 'A' | 'B' | 'C' | 'D';
  text: string;
  isKey?: boolean;
  imageUrl?: string;
}

interface MathPreviewPanelProps {
  judulTeks?: string;
  pertanyaan: string;
  gambarUrl?: string | null;
  gambarUrl2?: string | null;
  posisiGambar?: PosisiGambar;
  tipeSoal?: 'pg' | 'pg_kompleks' | 'isian' | 'benar_salah' | 'uraian' | 'menjodohkan';
  options?: PreviewOptionItem[];
  kunciText?: string;
  pembahasan?: string;
  accentTheme?: 'rose' | 'indigo';
}

export const MathPreviewPanel: React.FC<MathPreviewPanelProps> = ({
  judulTeks,
  pertanyaan,
  gambarUrl,
  gambarUrl2,
  posisiGambar = 'bawah_judul',
  tipeSoal = 'pg',
  options = [],
  kunciText,
  pembahasan,
  accentTheme = 'indigo',
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [previewFont, setPreviewFont] = useState<MathFontFamily>('plus-jakarta');
  const [mixedMode, setMixedMode] = useState<MixedFractionMode>('mixed');

  const hasContent = Boolean(
    pertanyaan.trim() ||
      judulTeks?.trim() ||
      options.some((o) => o.text.trim()) ||
      kunciText?.trim() ||
      pembahasan?.trim()
  );

  const borderCls =
    accentTheme === 'rose'
      ? 'border-rose-200 bg-gradient-to-br from-rose-50/60 via-white to-indigo-50/40'
      : 'border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/40';

  return (
    <div className={`rounded-2xl border-2 ${borderCls} shadow-xs overflow-hidden`}>
      {/* Header Bar */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-2 text-left cursor-pointer group"
        >
          <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Eye className="w-4 h-4" />
          </span>
          <div>
            <div className="text-xs font-display font-black text-slate-900 flex items-center gap-1.5">
              <span>Panel Pratinjau Matematika (Live Sebelum Simpan)</span>
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Deteksi Otomatis KaTeX
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium">
              Menampilkan hasil render pecahan susun, pecahan campuran (1 1/2), simbol derajat (°), LaTeX, dan spasi paragraf.
            </p>
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-slate-700 ml-1" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-700 ml-1" />
          )}
        </button>

        {isOpen && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-[10px]">
              <span className="font-bold text-slate-600 px-1.5">Campuran:</span>
              <button
                type="button"
                onClick={() => setMixedMode('mixed')}
                className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                  mixedMode === 'mixed'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
                title="Tampilkan 1 1/2 sebagai pecahan campuran (1 ½)"
              >
                Campuran (1 ½)
              </button>
              <button
                type="button"
                onClick={() => setMixedMode('improper')}
                className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                  mixedMode === 'improper'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
                title="Konversi otomatis 1 1/2 menjadi pecahan biasa (3/2)"
              >
                Biasa (3/2)
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-[10px]">
              <span className="font-bold text-slate-600 px-1.5">Font:</span>
              {(['plus-jakarta', 'nunito'] as MathFontFamily[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPreviewFont(f)}
                  className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                    previewFont === f
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  {MATH_FONT_CONFIGS[f].label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live Preview Body */}
      {isOpen && (
        <div className="p-4 space-y-3">
          {!hasContent ? (
            <div className="p-3.5 rounded-xl bg-white border border-dashed border-slate-300 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-1.5 font-display font-extrabold text-indigo-800 text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Ketik langsung angka pecahan (mis. 1 1/2 atau 2/5) tanpa kode LaTeX untuk melihat pratinjau di sini.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 leading-relaxed">
                <span className="font-bold text-[11px] text-slate-500 mr-1.5">Contoh Pratinjau Otomatis:</span>
                <MathRenderer
                  text="1 1/2 + 2/5 = 1 9/10, sudut siku-siku 90°, dan \sqrt{16} = 4."
                  fontFamily={previewFont}
                  mixedFractionMode={mixedMode}
                />
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 shadow-2xs">
              {/* Butir Soal + Judul + Gambar + Jarak Paragraf */}
              {pertanyaan.trim() || judulTeks?.trim() ? (
                <QuestionContent
                  pertanyaan={pertanyaan}
                  judulTeks={judulTeks}
                  gambarUrl={gambarUrl}
                  gambarUrl2={gambarUrl2}
                  posisiGambar={posisiGambar}
                  mathFont={previewFont}
                  mixedFractionMode={mixedMode}
                  compact
                />
              ) : (
                <p className="text-[11px] text-slate-400 italic">
                  (Teks pertanyaan masih kosong)
                </p>
              )}

              {/* Pratinjau Opsi PG / PG Kompleks */}
              {(tipeSoal === 'pg' || tipeSoal === 'pg_kompleks') &&
                options.some((o) => o.text.trim() || o.imageUrl) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    {options.map((opt) => (
                      <div
                        key={opt.key}
                        className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
                          opt.isKey
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                            : 'bg-slate-50/60 border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-[11px] w-4 shrink-0">
                            {opt.key}.
                          </span>
                          <span className="flex-1 whitespace-pre-wrap leading-relaxed">
                            {opt.text.trim() ? (
                              <MathRenderer
                                text={opt.text}
                                fontFamily={previewFont}
                                mixedFractionMode={mixedMode}
                              />
                            ) : (
                              <span className="text-slate-400 italic">(kosong)</span>
                            )}
                          </span>
                          {opt.isKey && (
                            <span className="text-[9px] uppercase font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded shrink-0">
                              Kunci
                            </span>
                          )}
                        </div>
                        {opt.imageUrl && (
                          <img
                            src={opt.imageUrl}
                            alt={`Pratinjau Opsi ${opt.key}`}
                            className="h-12 w-auto object-contain rounded border border-slate-200 bg-white ml-6"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

              {/* Pratinjau Kunci Non-PG */}
              {tipeSoal !== 'pg' && tipeSoal !== 'pg_kompleks' && kunciText?.trim() && (
                <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs">
                  <span className="font-bold text-emerald-900">Pratinjau Kunci Jawaban: </span>
                  <MathRenderer
                    text={kunciText}
                    fontFamily={previewFont}
                    mixedFractionMode={mixedMode}
                  />
                </div>
              )}

              {/* Pratinjau Pembahasan */}
              {pembahasan?.trim() && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 whitespace-pre-wrap">
                  <span className="font-bold text-slate-700 mr-1">Pembahasan:</span>
                  <MathRenderer
                    text={pembahasan}
                    fontFamily={previewFont}
                    mixedFractionMode={mixedMode}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MathPreviewPanel;
