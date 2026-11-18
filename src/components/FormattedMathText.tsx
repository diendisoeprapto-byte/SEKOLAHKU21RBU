import React, { useState } from 'react';
import { Check, Plus, Sparkles, X } from 'lucide-react';
import { MathRenderer, MATH_QUICK_SYMBOLS } from './MathRenderer';

interface StackedFractionProps {
  whole?: string;
  numerator: string;
  denominator: string;
  className?: string;
}

export const StackedFraction: React.FC<StackedFractionProps> = ({
  whole,
  numerator,
  denominator,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center gap-[0.18em] align-middle mx-[0.14em] ${className}`}
      aria-label={whole ? `${whole} ${numerator} per ${denominator}` : `${numerator} per ${denominator}`}
    >
      {whole && <span className="font-bold leading-none">{whole}</span>}
      <span className="inline-flex flex-col items-center justify-center align-middle leading-none text-[0.86em] font-bold select-text">
        <span className="px-[0.26em] pb-[2px] border-b-[1.8px] border-current text-center min-w-[1.25em] leading-[1.05]">
          {numerator}
        </span>
        <span className="px-[0.26em] pt-[2px] text-center min-w-[1.25em] leading-[1.05]">
          {denominator}
        </span>
      </span>
    </span>
  );
};

interface FormattedMathTextProps {
  text: string;
  className?: string;
}

export const FormattedMathText: React.FC<FormattedMathTextProps> = ({ text, className }) => {
  return <MathRenderer text={text} fontFamily="plus-jakarta" className={className} />;
};

interface FractionBuilderBarProps {
  onInsertToQuestion: (numerator: string, denominator: string, whole?: string) => void;
  onConvertAllInQuestion: () => void;
  onInsertToOption?: (optKey: 'A' | 'B' | 'C' | 'D', numerator: string, denominator: string, whole?: string) => void;
  onInsertSymbolToQuestion?: (symbol: string) => void;
  onInsertSymbolToOption?: (optKey: 'A' | 'B' | 'C' | 'D', symbol: string) => void;
  showOptionsTargets?: boolean;
  onClose: () => void;
}

export const FractionBuilderBar: React.FC<FractionBuilderBarProps> = ({
  onInsertToQuestion,
  onConvertAllInQuestion,
  onInsertToOption,
  onInsertSymbolToQuestion,
  onInsertSymbolToOption,
  showOptionsTargets = true,
  onClose,
}) => {
  const [whole, setWhole] = useState('');
  const [numerator, setNumerator] = useState('2');
  const [denominator, setDenominator] = useState('5');

  const safeNum = numerator.trim() || '2';
  const safeDen = denominator.trim() || '5';
  const safeWhole = whole.trim() || undefined;

  return (
    <div className="p-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-display font-black text-indigo-950">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Pengaturan &amp; Format Penulisan Pecahan Susun</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-0.5 rounded-lg cursor-pointer"
          title="Tutup panel pecahan"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 bg-white px-2.5 py-2 rounded-xl border border-indigo-200">
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-bold text-slate-500">Bulat</span>
            <input
              type="text"
              value={whole}
              onChange={(e) => setWhole(e.target.value)}
              placeholder="-"
              className="w-10 text-center px-1.5 py-1 rounded-lg border border-slate-300 text-xs font-bold outline-none focus:border-indigo-500"
              title="Bilangan bulat (opsional untuk pecahan campuran)"
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <input
              type="text"
              value={numerator}
              onChange={(e) => setNumerator(e.target.value)}
              placeholder="2"
              aria-label="Pembilang (atas)"
              className="w-14 text-center px-1.5 py-0.5 rounded-lg border border-slate-300 text-xs font-black outline-none focus:border-indigo-500"
            />
            <div className="w-14 border-t-2 border-slate-900" />
            <input
              type="text"
              value={denominator}
              onChange={(e) => setDenominator(e.target.value)}
              placeholder="5"
              aria-label="Penyebut (bawah)"
              className="w-14 text-center px-1.5 py-0.5 rounded-lg border border-slate-300 text-xs font-black outline-none focus:border-indigo-500"
            />
          </div>
          <div className="pl-2 border-l border-slate-200 flex flex-col items-center min-w-[54px]">
            <span className="text-[9px] font-bold text-slate-500 mb-0.5">Pratinjau</span>
            <div className="text-base font-black text-slate-900 py-0.5">
              <StackedFraction whole={safeWhole} numerator={safeNum} denominator={safeDen} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onInsertToQuestion(safeNum, safeDen, safeWhole)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-display font-black text-[11px] flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Sisipkan ke Soal
            </button>
            <button
              type="button"
              onClick={onConvertAllInQuestion}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-xs"
              title="Ubah semua angka pecahan seperti 2/5 di teks soal menjadi tag pecahan susun"
            >
              <Check className="w-3.5 h-3.5" /> Format Semua a/b
            </button>
          </div>

          {showOptionsTargets && onInsertToOption && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-bold text-slate-600">Sisip ke Opsi:</span>
              {(['A', 'B', 'C', 'D'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onInsertToOption(k, safeNum, safeDen, safeWhole)}
                  className="px-2 py-0.5 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-black text-[10px] cursor-pointer"
                >
                  +{k}
                </button>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-600 leading-snug">
            Ketik langsung <code className="bg-white px-1 rounded border border-slate-200 font-mono">2/5</code>,{' '}
            <code className="bg-white px-1 rounded border border-slate-200 font-mono">[pecahan]2/5[/pecahan]</code>, simbol{' '}
            <code className="bg-white px-1 rounded border border-slate-200 font-mono">90°</code>, atau rumus LaTeX seperti{' '}
            <code className="bg-white px-1 rounded border border-slate-200 font-mono">$\frac&#123;2&#125;&#123;5&#125;$</code>.
          </p>
        </div>
      </div>

      {/* Bar Simbol Matematika Cepat (Derajat °, Kali, Bagi, Akar, dll.) */}
      {onInsertSymbolToQuestion && (
        <div className="pt-2 border-t border-indigo-200/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold text-indigo-900 mr-1">Simbol Cepat:</span>
            {MATH_QUICK_SYMBOLS.map((sym) => (
              <button
                key={sym.label}
                type="button"
                onClick={() => onInsertSymbolToQuestion(sym.insert)}
                title={sym.title}
                className={`px-2 py-0.5 rounded-lg border text-[11px] font-black cursor-pointer transition ${
                  sym.label === '°'
                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                    : 'bg-white hover:bg-indigo-100 text-slate-800 border-indigo-200'
                }`}
              >
                {sym.label === '°' ? '° Derajat' : sym.label}
              </button>
            ))}
          </div>

          {showOptionsTargets && onInsertSymbolToOption && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-bold text-slate-600">Derajat (°) ke Opsi:</span>
              {(['A', 'B', 'C', 'D'] as const).map((k) => (
                <button
                  key={`deg-${k}`}
                  type="button"
                  onClick={() => onInsertSymbolToOption(k, '°')}
                  className="px-2 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-black text-[10px] cursor-pointer"
                  title={`Sisipkan simbol derajat (°) ke Opsi ${k}`}
                >
                  +° {k}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
