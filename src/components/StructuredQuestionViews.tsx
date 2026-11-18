import React, { useState } from 'react';
import { ArrowRight, Link2, Plus, Shuffle, Trash2, X } from 'lucide-react';
import { BenarSalahItem, MenjodohkanData } from '../types';
import { MathRenderer, MathFontFamily } from './MathRenderer';

/* ============================================================================
 * 1. BENAR / SALAH — TAMPILAN TABEL (PERNYATAAN DI KIRI, BENAR & SALAH DI KANAN)
 * ============================================================================ */

interface BenarSalahTableViewProps {
  items: BenarSalahItem[];
  interactive?: boolean;
  value?: Record<string, 'Benar' | 'Salah'> | string;
  onChange?: (next: Record<string, 'Benar' | 'Salah'>) => void;
  showKeys?: boolean;
  mathFont?: MathFontFamily;
  accentTheme?: 'rose' | 'purple' | 'amber' | 'indigo';
}

export const BenarSalahTableView: React.FC<BenarSalahTableViewProps> = ({
  items,
  interactive = false,
  value,
  onChange,
  showKeys = false,
  mathFont = 'plus-jakarta',
  accentTheme = 'indigo',
}) => {
  const normalizedMap: Record<string, 'Benar' | 'Salah'> = {};
  if (typeof value === 'string' && (value === 'Benar' || value === 'Salah') && items.length === 1) {
    normalizedMap[items[0].id] = value;
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => {
      if (v === 'Benar' || v === 'Salah') normalizedMap[k] = v;
    });
  }

  const handleSelect = (itemId: string, choice: 'Benar' | 'Salah') => {
    if (!interactive || !onChange) return;
    onChange({
      ...normalizedMap,
      [itemId]: choice,
    });
  };

  const activeRingCls =
    accentTheme === 'purple'
      ? 'border-purple-600 bg-purple-600'
      : accentTheme === 'rose'
      ? 'border-rose-600 bg-rose-600'
      : accentTheme === 'amber'
      ? 'border-amber-600 bg-amber-600'
      : 'border-blue-600 bg-blue-600';

  if (!items || items.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-2xs">
      <table className="w-full border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="bg-blue-50/90 border-b border-slate-300 text-blue-950 font-display font-black">
            <th className="py-2.5 px-3.5 text-left border-r border-slate-300">Pernyataan</th>
            <th className="py-2.5 px-3 text-center w-24 sm:w-28 border-r border-slate-300">Benar</th>
            <th className="py-2.5 px-3 text-center w-24 sm:w-28">Salah</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((item, idx) => {
            const selected = normalizedMap[item.id] ?? normalizedMap[String(idx + 1)];
            const keyChoice = item.kunci;

            return (
              <tr
                key={item.id || idx}
                className="hover:bg-slate-50/70 transition-colors"
              >
                <td className="py-3 px-3.5 text-slate-800 font-medium leading-relaxed border-r border-slate-200 align-middle">
                  <div className="flex items-start gap-2">
                    {items.length > 1 && (
                      <span className="font-mono font-bold text-slate-500 text-xs mt-0.5 shrink-0">
                        {idx + 1}.
                      </span>
                    )}
                    <span className="whitespace-pre-wrap flex-1">
                      <MathRenderer text={item.pernyataan} fontFamily={mathFont} />
                    </span>
                  </div>
                </td>

                {(['Benar', 'Salah'] as const).map((colChoice, colIdx) => {
                  const isSelected = selected === colChoice;
                  const isKey = showKeys && keyChoice === colChoice;

                  return (
                    <td
                      key={colChoice}
                      onClick={interactive ? () => handleSelect(item.id, colChoice) : undefined}
                      className={`py-3 px-3 text-center align-middle ${
                        colIdx === 0 ? 'border-r border-slate-200' : ''
                      } ${interactive ? 'cursor-pointer select-none hover:bg-blue-50/40' : ''} ${
                        isKey ? 'bg-emerald-50/70' : ''
                      }`}
                    >
                      <button
                        type="button"
                        disabled={!interactive}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(item.id, colChoice);
                        }}
                        aria-label={`Pernyataan ${idx + 1}: ${colChoice}`}
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full border-2 transition ${
                          isSelected
                            ? `${activeRingCls} text-white shadow-2xs scale-105`
                            : isKey
                            ? 'border-emerald-600 bg-emerald-500 text-white'
                            : 'border-slate-500 bg-white text-transparent hover:border-blue-600'
                        } ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-current" />
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/* ============================================================================
 * 2. MENJODOHKAN — KOLOM KIRI (1, 2, 3...) & KOLOM KANAN (A, B, C...)
 * ============================================================================ */

interface MenjodohkanColumnsViewProps {
  data: MenjodohkanData;
  interactive?: boolean;
  value?: Record<string, string>;
  onChange?: (next: Record<string, string>) => void;
  showKeys?: boolean;
  mathFont?: MathFontFamily;
  accentTheme?: 'rose' | 'purple' | 'amber' | 'indigo';
}

export const MenjodohkanColumnsView: React.FC<MenjodohkanColumnsViewProps> = ({
  data,
  interactive = false,
  value,
  onChange,
  showKeys = false,
  mathFont = 'plus-jakarta',
  accentTheme = 'indigo',
}) => {
  const [activeLeftNum, setActiveLeftNum] = useState<string | null>(null);

  const studentPairs: Record<string, string> =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const rightLetters = data.kolomKanan.map((_, i) => String.fromCharCode(65 + i));

  const setPair = (numKey: string, letter: string) => {
    if (!interactive || !onChange) return;
    const next = { ...studentPairs };
    if (!letter) {
      delete next[numKey];
    } else {
      next[numKey] = letter;
    }
    onChange(next);
  };

  const handleRightClick = (letter: string) => {
    if (!interactive || !activeLeftNum) return;
    setPair(activeLeftNum, letter);
    // Otomatis pindah ke baris kiri berikutnya yang belum berpasangan agar cepat
    const curIdx = Number(activeLeftNum) - 1;
    const nextUnpaired = data.kolomKiri.findIndex(
      (_, i) => i > curIdx && !studentPairs[String(i + 1)]
    );
    if (nextUnpaired >= 0) {
      setActiveLeftNum(String(nextUnpaired + 1));
    } else {
      setActiveLeftNum(null);
    }
  };

  const highlightLeftCls =
    accentTheme === 'purple'
      ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-200'
      : accentTheme === 'rose'
      ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-200'
      : accentTheme === 'amber'
      ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-200'
      : 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200';

  const badgeCls =
    accentTheme === 'purple'
      ? 'bg-purple-600 text-white'
      : accentTheme === 'rose'
      ? 'bg-rose-600 text-white'
      : accentTheme === 'amber'
      ? 'bg-amber-600 text-white'
      : 'bg-indigo-600 text-white';

  return (
    <div className="space-y-3">
      {interactive && (
        <div className="px-3 py-2 rounded-xl bg-indigo-50/80 border border-indigo-200 text-[11px] text-indigo-950 font-medium flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            {activeLeftNum ? (
              <span>
                Klik salah satu pilihan di <strong>Kolom Kanan (A–{rightLetters[rightLetters.length - 1] || 'A'})</strong> untuk dipasangkan dengan <strong>No. {activeLeftNum}</strong>.
              </span>
            ) : (
              <span>
                Klik pernyataan di <strong>Kolom Kiri</strong> lalu klik jawabannya di <strong>Kolom Kanan</strong>, atau pilih huruf langsung pada kotak pasangan.
              </span>
            )}
          </span>
          {Object.keys(studentPairs).length > 0 && (
            <button
              type="button"
              onClick={() => onChange?.({})}
              className="text-[10px] font-bold text-rose-700 hover:underline cursor-pointer"
            >
              Reset Pasangan
            </button>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* KOLOM KIRI */}
          <div className="md:col-span-7 border-b md:border-b-0 md:border-r border-slate-200">
            <div className="px-3.5 py-2.5 bg-slate-100/90 border-b border-slate-200 text-xs font-display font-black text-slate-900">
              Kolom Kiri (Pernyataan / Operasi)
            </div>
            <div className="divide-y divide-slate-200">
              {data.kolomKiri.map((leftText, idx) => {
                const numKey = String(idx + 1);
                const chosenLetter = studentPairs[numKey] || '';
                const keyLetter = data.pasangan?.[numKey] || '';
                const isActive = interactive && activeLeftNum === numKey;

                return (
                  <div
                    key={idx}
                    onClick={
                      interactive
                        ? () => setActiveLeftNum(isActive ? null : numKey)
                        : undefined
                    }
                    className={`px-3.5 py-3 flex items-center justify-between gap-3 transition ${
                      isActive
                        ? highlightLeftCls
                        : chosenLetter
                        ? 'bg-emerald-50/40'
                        : 'bg-white hover:bg-slate-50/70'
                    } ${interactive ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 font-medium leading-relaxed flex-1">
                      <span className="font-mono font-black text-slate-900 shrink-0">
                        {numKey}.
                      </span>
                      <span className="whitespace-pre-wrap flex-1">
                        <MathRenderer text={leftText} fontFamily={mathFont} />
                      </span>
                    </div>

                    {interactive && (
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <select
                          value={chosenLetter}
                          onChange={(e) => setPair(numKey, e.target.value)}
                          aria-label={`Pasangan untuk nomor ${numKey}`}
                          className={`px-2 py-1 rounded-lg border text-xs font-black outline-none cursor-pointer ${
                            chosenLetter
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-950'
                              : 'border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <option value="">Pilih</option>
                          {rightLetters.map((ltr) => (
                            <option key={ltr} value={ltr}>
                              {ltr}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {showKeys && keyLetter && (
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono font-black text-[11px] shrink-0">
                        → {keyLetter}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* KOLOM KANAN */}
          <div className="md:col-span-5">
            <div className="px-3.5 py-2.5 bg-slate-100/90 border-b border-slate-200 text-xs font-display font-black text-slate-900">
              Kolom Kanan (Pilihan Jawaban)
            </div>
            <div className="divide-y divide-slate-200">
              {data.kolomKanan.map((rightText, rIdx) => {
                const letter = String.fromCharCode(65 + rIdx);
                const pairedNums = Object.entries(studentPairs)
                  .filter(([, l]) => l === letter)
                  .map(([n]) => n);

                return (
                  <div
                    key={letter}
                    onClick={
                      interactive && activeLeftNum
                        ? () => handleRightClick(letter)
                        : undefined
                    }
                    className={`px-3.5 py-3 flex items-center justify-between gap-2.5 transition ${
                      interactive && activeLeftNum
                        ? 'cursor-pointer hover:bg-indigo-50/80'
                        : ''
                    } ${pairedNums.length > 0 ? 'bg-indigo-50/30' : 'bg-white'}`}
                  >
                    <div className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 font-medium leading-relaxed flex-1">
                      <span className="font-mono font-black text-slate-900 shrink-0">
                        {letter}.
                      </span>
                      <span className="whitespace-pre-wrap flex-1">
                        <MathRenderer text={rightText} fontFamily={mathFont} />
                      </span>
                    </div>

                    {pairedNums.length > 0 && (
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${badgeCls}`}>
                        No. {pairedNums.join(', ')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Ringkasan pasangan yang sudah dipilih siswa */}
      {interactive && Object.keys(studentPairs).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[11px] font-bold text-slate-600 mr-1">Pasangan Anda:</span>
          {data.kolomKiri.map((_, idx) => {
            const numKey = String(idx + 1);
            const chosen = studentPairs[numKey];
            if (!chosen) return null;
            return (
              <span
                key={numKey}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-[11px] font-bold"
              >
                <span>
                  {numKey} → {chosen}
                </span>
                <button
                  type="button"
                  onClick={() => setPair(numKey, '')}
                  className="text-emerald-700 hover:text-rose-600 cursor-pointer"
                  title={`Hapus pasangan nomor ${numKey}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 3. EDITOR GURU — BENAR / SALAH TABEL & MENJODOHKAN DUA KOLOM
 * ============================================================================ */

interface BenarSalahEditorProps {
  items: BenarSalahItem[];
  onChange: (next: BenarSalahItem[]) => void;
}

export const BenarSalahEditor: React.FC<BenarSalahEditorProps> = ({ items, onChange }) => {
  const safeItems: BenarSalahItem[] =
    items && items.length > 0
      ? items
      : [
          { id: 'bs_1', pernyataan: '', kunci: 'Benar' },
          { id: 'bs_2', pernyataan: '', kunci: 'Salah' },
          { id: 'bs_3', pernyataan: '', kunci: 'Benar' },
        ];

  const handleUpdateRow = (idx: number, patch: Partial<BenarSalahItem>) => {
    const next = safeItems.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };

  const handleAddRow = () => {
    const nextIdx = safeItems.length + 1;
    onChange([
      ...safeItems,
      { id: `bs_${Date.now()}_${nextIdx}`, pernyataan: '', kunci: 'Benar' },
    ]);
  };

  const handleDeleteRow = (idx: number) => {
    if (safeItems.length <= 1) return;
    onChange(safeItems.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-display font-black text-slate-800">
            Tabel Pernyataan Benar / Salah (Pernyataan di Kiri • Pilihan Benar/Salah di Kanan)
          </div>
          <p className="text-[11px] text-slate-500">
            Isi setiap baris pernyataan lalu pilih lingkaran kunci <strong>Benar</strong> atau <strong>Salah</strong> di sebelah kanan. Mendukung pecahan (1/2) &amp; simbol derajat (°).
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddRow}
          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-display font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" /> Tambah Pernyataan
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-blue-50 border-b border-slate-300 text-blue-950 font-display font-black">
              <th className="py-2 px-3 text-left border-r border-slate-300">Pernyataan</th>
              <th className="py-2 px-3 text-center w-20 border-r border-slate-300">Benar</th>
              <th className="py-2 px-3 text-center w-20 border-r border-slate-300">Salah</th>
              <th className="py-2 px-2 text-center w-12">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {safeItems.map((it, idx) => (
              <tr key={it.id || idx} className="bg-white">
                <td className="p-2 border-r border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-500 w-5 text-center shrink-0">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={it.pernyataan}
                      onChange={(e) => handleUpdateRow(idx, { pernyataan: e.target.value })}
                      placeholder={`Tuliskan pernyataan ke-${idx + 1}...`}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium outline-none focus:border-indigo-500"
                    />
                  </div>
                </td>
                {(['Benar', 'Salah'] as const).map((choice) => {
                  const active = it.kunci === choice;
                  return (
                    <td
                      key={choice}
                      onClick={() => handleUpdateRow(idx, { kunci: choice })}
                      className="p-2 text-center border-r border-slate-200 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name={`editor_bs_${it.id}_${idx}`}
                        checked={active}
                        onChange={() => handleUpdateRow(idx, { kunci: choice })}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer"
                        aria-label={`Kunci pernyataan ${idx + 1} ${choice}`}
                      />
                    </td>
                  );
                })}
                <td className="p-2 text-center">
                  <button
                    type="button"
                    disabled={safeItems.length <= 1}
                    onClick={() => handleDeleteRow(idx)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 cursor-pointer"
                    title="Hapus baris pernyataan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface MenjodohkanEditorProps {
  data: MenjodohkanData;
  onChange: (next: MenjodohkanData) => void;
}

export const MenjodohkanEditor: React.FC<MenjodohkanEditorProps> = ({ data, onChange }) => {
  const kolomKiri = data.kolomKiri.length > 0 ? data.kolomKiri : ['', '', ''];
  const kolomKanan = data.kolomKanan.length > 0 ? data.kolomKanan : ['', '', ''];
  const pasangan = data.pasangan || {};
  const rightLetters = kolomKanan.map((_, i) => String.fromCharCode(65 + i));

  const updateLeft = (idx: number, val: string) => {
    const nextLeft = kolomKiri.map((v, i) => (i === idx ? val : v));
    onChange({ kolomKiri: nextLeft, kolomKanan, pasangan });
  };

  const updateRight = (idx: number, val: string) => {
    const nextRight = kolomKanan.map((v, i) => (i === idx ? val : v));
    onChange({ kolomKiri, kolomKanan: nextRight, pasangan });
  };

  const updatePair = (numKey: string, letter: string) => {
    onChange({
      kolomKiri,
      kolomKanan,
      pasangan: { ...pasangan, [numKey]: letter },
    });
  };

  const addLeftRow = () => {
    const nextLeft = [...kolomKiri, ''];
    const nextRight =
      kolomKanan.length < nextLeft.length ? [...kolomKanan, ''] : kolomKanan;
    const numKey = String(nextLeft.length);
    onChange({
      kolomKiri: nextLeft,
      kolomKanan: nextRight,
      pasangan: {
        ...pasangan,
        [numKey]: pasangan[numKey] || String.fromCharCode(65 + (nextLeft.length - 1)),
      },
    });
  };

  const removeLeftRow = (idx: number) => {
    if (kolomKiri.length <= 1) return;
    const nextLeft = kolomKiri.filter((_, i) => i !== idx);
    const nextPasangan: Record<string, string> = {};
    nextLeft.forEach((_, i) => {
      const oldIdx = i >= idx ? i + 1 : i;
      const oldVal = pasangan[String(oldIdx + 1)];
      if (oldVal) nextPasangan[String(i + 1)] = oldVal;
    });
    onChange({ kolomKiri: nextLeft, kolomKanan, pasangan: nextPasangan });
  };

  const addRightRow = () => {
    onChange({
      kolomKiri,
      kolomKanan: [...kolomKanan, ''],
      pasangan,
    });
  };

  const removeRightRow = (idx: number) => {
    if (kolomKanan.length <= 1) return;
    const removedLetter = String.fromCharCode(65 + idx);
    const nextRight = kolomKanan.filter((_, i) => i !== idx);
    const nextPasangan: Record<string, string> = {};
    Object.entries(pasangan).forEach(([k, v]) => {
      if (!v || v === removedLetter) return;
      const code = v.charCodeAt(0) - 65;
      nextPasangan[k] = code > idx ? String.fromCharCode(65 + code - 1) : v;
    });
    onChange({ kolomKiri, kolomKanan: nextRight, pasangan: nextPasangan });
  };

  const shuffleRightColumn = () => {
    const indices = kolomKanan.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const nextRight = indices.map((oldIdx) => kolomKanan[oldIdx]);
    const oldLetterToNewLetter: Record<string, string> = {};
    indices.forEach((oldIdx, newIdx) => {
      oldLetterToNewLetter[String.fromCharCode(65 + oldIdx)] = String.fromCharCode(65 + newIdx);
    });
    const nextPasangan: Record<string, string> = {};
    Object.entries(pasangan).forEach(([k, oldLetter]) => {
      nextPasangan[k] = oldLetterToNewLetter[oldLetter] || oldLetter;
    });
    onChange({ kolomKiri, kolomKanan: nextRight, pasangan: nextPasangan });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-display font-black text-slate-800">
            Soal Menjodohkan (Kolom Kiri 1, 2, 3... &amp; Kolom Kanan A, B, C...)
          </div>
          <p className="text-[11px] text-slate-500">
            Isi <strong>Kolom Kiri (Pernyataan / Operasi)</strong> dan <strong>Kolom Kanan (Pilihan Jawaban)</strong>, lalu tentukan pasangan huruf yang benar di setiap baris kiri.
          </p>
        </div>
        <button
          type="button"
          onClick={shuffleRightColumn}
          className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-display font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
          title="Acak urutan Kolom Kanan secara otomatis tanpa merusak kunci pasangan"
        >
          <Shuffle className="w-3.5 h-3.5" /> Acak Urutan Kanan
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Editor Kolom Kiri */}
        <div className="lg:col-span-7 p-3 rounded-2xl border border-slate-300 bg-white space-y-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-display font-black text-slate-900">
              Kolom Kiri (Pernyataan / Operasi)
            </span>
            <button
              type="button"
              onClick={addLeftRow}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Baris Kiri
            </button>
          </div>
          <div className="space-y-2">
            {kolomKiri.map((val, idx) => {
              const numKey = String(idx + 1);
              const selectedLetter = pasangan[numKey] || '';
              return (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-mono font-black text-xs text-slate-700 w-5 shrink-0">
                    {numKey}.
                  </span>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => updateLeft(idx, e.target.value)}
                    placeholder={`Pernyataan / operasi ke-${numKey} (mis. 150% - 2 + 3/5)`}
                    className="flex-1 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-medium outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center gap-1 shrink-0 bg-emerald-50 px-1.5 py-1 rounded-lg border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-800">Kunci:</span>
                    <select
                      value={selectedLetter}
                      onChange={(e) => updatePair(numKey, e.target.value)}
                      className="text-xs font-black text-emerald-950 bg-transparent outline-none cursor-pointer"
                      aria-label={`Kunci pasangan nomor ${numKey}`}
                    >
                      <option value="">-</option>
                      {rightLetters.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={kolomKiri.length <= 1}
                    onClick={() => removeLeftRow(idx)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                    title="Hapus baris kiri"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor Kolom Kanan */}
        <div className="lg:col-span-5 p-3 rounded-2xl border border-slate-300 bg-white space-y-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-display font-black text-slate-900">
              Kolom Kanan (Pilihan Jawaban)
            </span>
            <button
              type="button"
              onClick={addRightRow}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Pilihan Kanan
            </button>
          </div>
          <div className="space-y-2">
            {kolomKanan.map((val, rIdx) => {
              const letter = String.fromCharCode(65 + rIdx);
              return (
                <div key={letter} className="flex items-center gap-2">
                  <span className="font-mono font-black text-xs text-slate-800 w-5 shrink-0">
                    {letter}.
                  </span>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => updateRight(rIdx, e.target.value)}
                    placeholder={`Pilihan ${letter} (mis. 120° atau 1.500 gram)`}
                    className="flex-1 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-medium outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    disabled={kolomKanan.length <= 1}
                    onClick={() => removeRightRow(rIdx)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                    title="Hapus pilihan kanan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
