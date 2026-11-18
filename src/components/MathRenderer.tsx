import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export type MathFontFamily = 'nunito' | 'plus-jakarta' | 'katex';
export type MixedFractionMode = 'mixed' | 'improper';

export interface MathFontConfig {
  id: MathFontFamily;
  label: string;
  fontFamily: string;
  containerClass: string;
  inlineFractionWeightClass: string;
}

/**
 * Konfigurasi font kustom untuk MathRenderer agar pecahan dan rumus matematika
 * selaras dengan tipografi aplikasi ('Nunito' dan 'Plus Jakarta Sans').
 */
export const MATH_FONT_CONFIGS: Record<MathFontFamily, MathFontConfig> = {
  nunito: {
    id: 'nunito',
    label: 'Nunito',
    fontFamily: "'Nunito', system-ui, -apple-system, sans-serif",
    containerClass: 'math-renderer math-renderer--nunito font-display',
    inlineFractionWeightClass: 'font-bold',
  },
  'plus-jakarta': {
    id: 'plus-jakarta',
    label: 'Plus Jakarta Sans',
    fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    containerClass: 'math-renderer math-renderer--plus-jakarta font-sans',
    inlineFractionWeightClass: 'font-semibold',
  },
  katex: {
    id: 'katex',
    label: 'KaTeX Default',
    fontFamily: 'KaTeX_Main, "Times New Roman", serif',
    containerClass: 'math-renderer math-renderer--katex',
    inlineFractionWeightClass: 'font-normal',
  },
};

export const DEFAULT_MATH_FONT: MathFontFamily = 'nunito';

export interface MathQuickSymbol {
  label: string;
  insert: string;
  title: string;
}

export const MATH_QUICK_SYMBOLS: MathQuickSymbol[] = [
  { label: '°', insert: '°', title: 'Simbol Derajat (°)' },
  { label: '×', insert: ' × ', title: 'Simbol Perkalian (×)' },
  { label: '÷', insert: ' ÷ ', title: 'Simbol Pembagian (÷)' },
  { label: '±', insert: '±', title: 'Simbol Kurang-Lebih (±)' },
  { label: '√', insert: '\\sqrt{}', title: 'Akar Kuadrat (KaTeX \\sqrt{})' },
  { label: '≤', insert: ' ≤ ', title: 'Kurang dari atau sama dengan (≤)' },
  { label: '≥', insert: ' ≥ ', title: 'Lebih dari atau sama dengan (≥)' },
  { label: '≠', insert: ' ≠ ', title: 'Tidak sama dengan (≠)' },
  { label: 'π', insert: 'π', title: 'Konstanta Pi (π)' },
  { label: '²', insert: '²', title: 'Pangkat Dua (²)' },
  { label: '³', insert: '³', title: 'Pangkat Tiga (³)' },
];

const UNICODE_FRACTIONS: Record<string, [string, string]> = {
  '½': ['1', '2'],
  '⅓': ['1', '3'],
  '⅔': ['2', '3'],
  '¼': ['1', '4'],
  '¾': ['3', '4'],
  '⅕': ['1', '5'],
  '⅖': ['2', '5'],
  '⅗': ['3', '5'],
  '⅘': ['4', '5'],
  '⅙': ['1', '6'],
  '⅚': ['5', '6'],
  '⅛': ['1', '8'],
  '⅜': ['3', '8'],
  '⅝': ['5', '8'],
  '⅞': ['7', '8'],
};

export interface MathSegment {
  type: 'text' | 'math';
  content: string;
  displayMode?: boolean;
}

/**
 * Mengonversi pecahan biasa maupun campuran ke kode LaTeX KaTeX.
 * - Mode 'mixed': '1 1/2' -> '1\,\frac{1}{2}' (tampilan pecahan campuran cantik)
 * - Mode 'improper': '1 1/2' -> '\frac{3}{2}' (konversi ke pecahan biasa LaTeX)
 */
export function formatFractionToLatex(
  numerator: string,
  denominator: string,
  whole?: string,
  mixedMode: MixedFractionMode = 'mixed'
): string {
  const cleanNum = numerator.trim();
  const cleanDen = denominator.trim();
  const cleanWhole = whole?.trim();

  if (!cleanWhole) {
    return `\\frac{${cleanNum}}{${cleanDen}}`;
  }

  if (mixedMode === 'improper') {
    const w = parseInt(cleanWhole, 10);
    const n = parseInt(cleanNum, 10);
    const d = parseInt(cleanDen, 10);
    if (!Number.isNaN(w) && !Number.isNaN(n) && !Number.isNaN(d) && d > 0 && n >= 0) {
      const sign = w < 0 ? '-' : '';
      const combined = Math.abs(w) * d + n;
      return `${sign}\\frac{${combined}}{${d}}`;
    }
  }

  return `${cleanWhole}\\,\\frac{${cleanNum}}{${cleanDen}}`;
}

/**
 * Menormalkan pecahan campuran atau garis miring di dalam blok LaTeX ($...$ / $$...$$),
 * misalnya '$1 1/2 + 1/4$' otomatis menjadi '$1\,\frac{1}{2} + \frac{1}{4}$' (atau '\frac{3}{2}').
 */
export function normalizeFractionsInsideLatex(
  latex: string,
  mixedMode: MixedFractionMode = 'mixed'
): string {
  return (latex || '').replace(
    /(^|[^\\{}\w/])(?:([+-]?\d{1,3})[\s\u00a0]+)?(\d{1,4})\/(\d{1,4})(?=$|[^\w/{}])/g,
    (_full, prefix: string, whole: string | undefined, num: string, den: string) => {
      return `${prefix}${formatFractionToLatex(num, den, whole, mixedMode)}`;
    }
  );
}

const parseBracketFractionPayload = (
  payload: string
): { whole?: string; numerator: string; denominator: string } | null => {
  const clean = (payload || '').replace(/\u00a0/g, ' ').trim();
  const slashIdx = clean.indexOf('/');
  if (slashIdx === -1) return null;

  const left = clean.slice(0, slashIdx).trim();
  const right = clean.slice(slashIdx + 1).trim();
  if (!left || !right) return null;

  const mixedMatch = left.match(/^([+-]?\d+)\s+(.+)$/);
  if (mixedMatch) {
    return {
      whole: mixedMatch[1],
      numerator: mixedMatch[2].trim(),
      denominator: right,
    };
  }

  return { numerator: left, denominator: right };
};

/**
 * Memecah teks menjadi segmen teks biasa dan segmen matematika (KaTeX) dari:
 * - LaTeX blok: $$...$$, \[...\] (juga otomatis mengonversi pecahan '1 1/2' atau '1/2' di dalamnya)
 * - LaTeX inline: $...$, \(...\)
 * - Ekspresi LaTeX berdiri sendiri: \frac{a}{b}, \dfrac{a}{b}, \tfrac{a}{b}, \sqrt{...}, \times, \div, \degree, dll.
 * - Tag pecahan editor: [pecahan]2/5[/pecahan], [pecahan]1 2/5[/pecahan], [frac]...[/frac]
 * - Pecahan campuran & garis miring otomatis: 1 1/2, 2/5, 1½, ¾ (aman dari tanggal 17/08/1945 & URL)
 */
export function parseMathSegments(
  inputText: string,
  mixedMode: MixedFractionMode = 'mixed'
): MathSegment[] {
  const input = inputText || '';
  if (!input) return [];

  const segments: MathSegment[] = [];

  const pattern =
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)|\[(?:pecahan|frac)\]([\s\S]*?)\[\/(?:pecahan|frac)\]|(?:([+-]?\d+)[\s\u00a0]+)?(\\(?:[dt]?frac)\{[^{}]+\}\{[^{}]+\})|([+-]?\d+(?:[.,]\d+)?)\s*(?:\^\{?\\circ\}?|\\degree)|(\\(?:sqrt(?:\[[^\]]+\])?\{[^{}]+\}|times|div|pm|mp|leq|geq|neq|approx|cdot|pi|alpha|beta|gamma|theta|degree))|(?:^|(?<=[\s\u00a0(\[=+\-×÷*:,;"'<>]))(?:([+-]?\d{1,3})[\s\u00a0]+)?(\d{1,4})\/(\d{1,4})(?=$|[\s\u00a0)\]=+\-×÷*:,;"'<>%?!.])|(?:^|(?<=[\s\u00a0(\[=+\-×÷*:,;"'<>]))(?:([+-]?\d{1,3})[\s\u00a0]*)?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])(?=$|[\s\u00a0)\]=+\-×÷*:,;"'<>%?!.])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const start = match.index;
    const fullMatch = match[0];

    if (start > lastIndex) {
      segments.push({ type: 'text', content: input.slice(lastIndex, start) });
    }

    if (match[1] !== undefined) {
      // $$...$$
      segments.push({
        type: 'math',
        content: normalizeFractionsInsideLatex(match[1].trim(), mixedMode),
        displayMode: true,
      });
    } else if (match[2] !== undefined) {
      // \[...\]
      segments.push({
        type: 'math',
        content: normalizeFractionsInsideLatex(match[2].trim(), mixedMode),
        displayMode: true,
      });
    } else if (match[3] !== undefined) {
      // \(...\)
      segments.push({
        type: 'math',
        content: normalizeFractionsInsideLatex(match[3].trim(), mixedMode),
        displayMode: false,
      });
    } else if (match[4] !== undefined) {
      // $...$
      segments.push({
        type: 'math',
        content: normalizeFractionsInsideLatex(match[4].trim(), mixedMode),
        displayMode: false,
      });
    } else if (match[5] !== undefined) {
      // [pecahan]...[/pecahan] or [frac]...[/frac]
      const parsed = parseBracketFractionPayload(match[5]);
      if (parsed) {
        segments.push({
          type: 'math',
          content: formatFractionToLatex(
            parsed.numerator,
            parsed.denominator,
            parsed.whole,
            mixedMode
          ),
          displayMode: false,
        });
      } else {
        segments.push({ type: 'text', content: fullMatch });
      }
    } else if (match[7] !== undefined) {
      // Standalone \frac{...}{...} (optionally preceded by mixed integer)
      const wholePrefix = match[6] ? `${match[6].trim()}\\,` : '';
      segments.push({
        type: 'math',
        content: `${wholePrefix}${match[7].trim()}`,
        displayMode: false,
      });
    } else if (match[8] !== undefined) {
      // Angka diikuti derajat: 90\degree, 90^\circ, 90^{\circ}
      segments.push({ type: 'math', content: `${match[8]}^{\\circ}`, displayMode: false });
    } else if (match[9] !== undefined) {
      // Standalone \sqrt / \times / \div / \degree / etc.
      const latex = match[9] === '\\degree' ? '^{\\circ}' : match[9];
      segments.push({ type: 'math', content: latex, displayMode: false });
    } else if (match[11] !== undefined && match[12] !== undefined) {
      // Simple slash fraction like 1/2 or mixed 1 1/2
      const whole = match[10]?.trim();
      const num = match[11];
      const den = match[12];
      segments.push({
        type: 'math',
        content: formatFractionToLatex(num, den, whole, mixedMode),
        displayMode: false,
      });
    } else if (match[14] !== undefined) {
      // Unicode fraction like ½ or mixed 1 ½ / 1½
      const pair = UNICODE_FRACTIONS[match[14]];
      if (pair) {
        segments.push({
          type: 'math',
          content: formatFractionToLatex(pair[0], pair[1], match[13]?.trim(), mixedMode),
          displayMode: false,
        });
      } else {
        segments.push({ type: 'text', content: fullMatch });
      }
    } else {
      segments.push({ type: 'text', content: fullMatch });
    }

    lastIndex = start + fullMatch.length;
  }

  if (lastIndex < input.length) {
    segments.push({ type: 'text', content: input.slice(lastIndex) });
  }

  return segments;
}

function renderKatexSafe(latex: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: 'html',
      macros: {
        '\\degree': '^{\\circ}',
      },
    });
  } catch {
    return null;
  }
}

export interface MathRendererProps {
  text: string;
  fontFamily?: MathFontFamily;
  mixedFractionMode?: MixedFractionMode;
  className?: string;
}

/**
 * Merender teks campuran bahasa Indonesia, pecahan sederhana (1/2, 2/5),
 * pecahan campuran otomatis (1 1/2 -> 1\frac{1}{2} atau \frac{3}{2}),
 * tag [pecahan]...[/pecahan], simbol derajat (°), dan rumus LaTeX standar menggunakan KaTeX
 * dengan konfigurasi font kustom agar selaras dengan 'Nunito' / 'Plus Jakarta Sans'.
 */
export const MathRenderer: React.FC<MathRendererProps> = ({
  text,
  fontFamily = DEFAULT_MATH_FONT,
  mixedFractionMode = 'mixed',
  className = '',
}) => {
  const fontCfg = MATH_FONT_CONFIGS[fontFamily] || MATH_FONT_CONFIGS[DEFAULT_MATH_FONT];

  const renderedSegments = useMemo(() => {
    const segments = parseMathSegments(text || '', mixedFractionMode);
    return segments.map((seg) => {
      if (seg.type !== 'math') return { ...seg, html: null as string | null };
      return {
        ...seg,
        html: renderKatexSafe(seg.content, Boolean(seg.displayMode)),
      };
    });
  }, [text, mixedFractionMode]);

  if (!text) return null;

  return (
    <span className={`${fontCfg.containerClass} ${className}`.trim()}>
      {renderedSegments.map((seg, idx) => {
        if (seg.type === 'math' && seg.html) {
          if (seg.displayMode) {
            return (
              <span
                key={`math-block-${idx}`}
                className={`block my-1.5 text-center ${fontCfg.inlineFractionWeightClass}`}
                dangerouslySetInnerHTML={{ __html: seg.html }}
              />
            );
          }
          return (
            <span
              key={`math-inline-${idx}`}
              className={`inline-block align-middle mx-[0.12em] ${fontCfg.inlineFractionWeightClass}`}
              dangerouslySetInnerHTML={{ __html: seg.html }}
            />
          );
        }
        return <React.Fragment key={`text-${idx}`}>{seg.content}</React.Fragment>;
      })}
    </span>
  );
};

export default MathRenderer;
