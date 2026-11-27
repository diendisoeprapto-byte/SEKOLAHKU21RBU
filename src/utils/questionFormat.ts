import React from 'react';
import { BenarSalahItem, MenjodohkanData } from '../types';

export type PosisiGambar = 'bawah_judul' | 'bawah_pertanyaan' | 'kanan_teks';

export interface QuestionSegment {
  type: 'title' | 'body';
  text: string;
}

const FRACTION_MAP: Record<string, string> = {
  '1/2': 'satu perdua (setengah)',
  '1/3': 'satu pertiga',
  '2/3': 'dua pertiga',
  '1/4': 'satu perempat (seperempat)',
  '2/4': 'dua perempat',
  '3/4': 'tiga perempat',
  '1/5': 'satu perlima',
  '2/5': 'dua perlima',
  '3/5': 'tiga perlima',
  '4/5': 'empat perlima',
  '1/6': 'satu perenam',
  '5/6': 'lima perenam',
  '1/8': 'satu perdelapan',
  '3/8': 'tiga perdelapan',
  '5/8': 'lima perdelapan',
  '7/8': 'tujuh perdelapan',
  '1/10': 'satu persepuluh',
};

export interface MathTextToken {
  type: 'text' | 'fraction';
  value?: string;
  whole?: string;
  numerator?: string;
  denominator?: string;
  raw?: string;
}

const parseFractionPayload = (
  payload: string
): { whole?: string; numerator: string; denominator: string } | null => {
  const clean = (payload || '').trim();
  const slashIdx = clean.indexOf('/');
  if (slashIdx === -1) return null;

  const left = clean.slice(0, slashIdx).trim();
  const right = clean.slice(slashIdx + 1).trim();
  if (!left || !right) return null;

  // Mixed fraction inside tag: e.g. "1 2/5" or "-2 3/4"
  const mixedMatch = left.match(/^([+-]?\d+)\s+(.+)$/);
  if (mixedMatch) {
    return {
      whole: mixedMatch[1],
      numerator: mixedMatch[2].trim(),
      denominator: right,
    };
  }

  return {
    numerator: left,
    denominator: right,
  };
};

/**
 * Mengurai teks menjadi token teks biasa & pecahan susun vertikal (2/5, 1 2/5, [pecahan]2/5[/pecahan], \frac{2}{5}).
 * Aman terhadap tanggal (mis. 17/08/1945) dan URL.
 */
export function tokenizeMathText(text: string): MathTextToken[] {
  const input = text || '';
  if (!input) return [];

  const tokens: MathTextToken[] = [];
  // Matches:
  // 1) [pecahan]...[/pecahan] or [frac]...[/frac]
  // 2) optional whole + \frac{num}{den}
  // 3) optional whole + numeric num/den bounded safely so dates like 17/08/1945 or URLs are skipped
  const pattern =
    /\[(?:pecahan|frac)\]([\s\S]*?)\[\/(?:pecahan|frac)\]|(?:([+-]?\d+)\s+)?\\frac\{([^{}]+)\}\{([^{}]+)\}|(?:^|(?<=[\s(\[=+\-×÷*:,;"'<>]))(?:([+-]?\d{1,3})\s+)?(\d{1,4})\/(\d{1,4})(?=$|[\s)\]=+\-×÷*:,;"'<>%?!.])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const fullMatch = match[0];
    const start = match.index;

    if (start > lastIndex) {
      tokens.push({ type: 'text', value: input.slice(lastIndex, start) });
    }

    if (match[1] !== undefined) {
      const parsed = parseFractionPayload(match[1]);
      if (parsed) {
        tokens.push({
          type: 'fraction',
          whole: parsed.whole,
          numerator: parsed.numerator,
          denominator: parsed.denominator,
          raw: fullMatch,
        });
      } else {
        tokens.push({ type: 'text', value: fullMatch });
      }
    } else if (match[3] !== undefined && match[4] !== undefined) {
      tokens.push({
        type: 'fraction',
        whole: match[2]?.trim() || undefined,
        numerator: match[3].trim(),
        denominator: match[4].trim(),
        raw: fullMatch,
      });
    } else if (match[6] !== undefined && match[7] !== undefined) {
      tokens.push({
        type: 'fraction',
        whole: match[5]?.trim() || undefined,
        numerator: match[6],
        denominator: match[7],
        raw: fullMatch,
      });
    } else {
      tokens.push({ type: 'text', value: fullMatch });
    }

    lastIndex = start + fullMatch.length;
  }

  if (lastIndex < input.length) {
    tokens.push({ type: 'text', value: input.slice(lastIndex) });
  }

  return tokens;
}

/**
 * Menyisipkan atau membungkus seleksi menjadi tag [pecahan]...[/pecahan].
 */
export function insertFractionAtSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  numerator: string,
  denominator: string,
  whole?: string
): { nextValue: string; nextCursor: number } {
  const num = (numerator || '').trim();
  const den = (denominator || '').trim();
  const wh = (whole || '').trim();
  const payload = wh ? `${wh} ${num}/${den}` : `${num}/${den}`;
  const tag = `[pecahan]${payload}[/pecahan]`;

  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const nextValue = `${before}${tag}${after}`;
  const nextCursor = before.length + tag.length;
  return { nextValue, nextCursor };
}

/**
 * Mengonversi penulisan pecahan miring (mis. 2/5 atau 1 2/5) menjadi tag eksplisit [pecahan]...[/pecahan]
 * agar siap dipakai di form pertanyaan maupun opsi pilihan.
 */
export function convertPlainFractionsToTags(text: string): string {
  const tokens = tokenizeMathText(text);
  return tokens
    .map((tok) => {
      if (tok.type === 'text') return tok.value || '';
      const payload = tok.whole
        ? `${tok.whole} ${tok.numerator}/${tok.denominator}`
        : `${tok.numerator}/${tok.denominator}`;
      return `[pecahan]${payload}[/pecahan]`;
    })
    .join('');
}

export function convertFractionsText(text: string): string {
  let updated = text;
  Object.entries(FRACTION_MAP).forEach(([frac, rep]) => {
    const regex = new RegExp(`\\b${frac.replace('/', '\\/')}\\b`, 'g');
    updated = updated.replace(regex, rep);
  });
  return updated;
}

/**
 * Mengekstrak teks tempelan (paste) dari Word / Google Docs / Web.
 * Jika ada elemen atau paragraf yang rata tengah (center), otomatis dibungkus [center]...[/center]
 * dan dipisahkan dari paragraf/kalimat setelahnya.
 */
export function extractPastedQuestionText(e: React.ClipboardEvent<HTMLTextAreaElement>): string | null {
  const html = e.clipboardData?.getData('text/html');
  if (!html || !html.trim()) return null;

  const hasCenterHint =
    /text-align\s*:\s*center|align\s*=\s*["']?center|<center\b|ql-align-center|text-center|MsoTitle|MsoSubtitle/i.test(
      html
    );

  if (!hasCenterHint) {
    return null;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;
    if (!body) return null;

    const BLOCK_TAGS = new Set([
      'P',
      'DIV',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'CENTER',
      'LI',
      'BLOCKQUOTE',
      'TR',
    ]);

    const isCenteredElement = (el: HTMLElement | null): boolean => {
      let cur: HTMLElement | null = el;
      while (cur && cur !== body) {
        const tag = cur.tagName?.toUpperCase();
        const alignAttr = cur.getAttribute('align')?.toLowerCase();
        const styleAttr = cur.getAttribute('style') || '';
        const cls = cur.getAttribute('class') || '';
        if (
          tag === 'CENTER' ||
          alignAttr === 'center' ||
          cur.style?.textAlign === 'center' ||
          /text-align\s*:\s*center/i.test(styleAttr) ||
          /\b(text-center|ql-align-center|MsoTitle|MsoSubtitle)\b/i.test(cls)
        ) {
          return true;
        }
        cur = cur.parentElement;
      }
      return false;
    };

    const lines: string[] = [];

    const hasBlockChild = (el: HTMLElement): boolean => {
      for (let i = 0; i < el.children.length; i++) {
        const child = el.children[i] as HTMLElement;
        if (BLOCK_TAGS.has(child.tagName?.toUpperCase()) || hasBlockChild(child)) {
          return true;
        }
      }
      return false;
    };

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = (node.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (txt) lines.push(txt);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName?.toUpperCase();
      if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'META' || tag === 'LINK') return;

      if (BLOCK_TAGS.has(tag)) {
        if (hasBlockChild(el)) {
          for (let i = 0; i < el.childNodes.length; i++) {
            walk(el.childNodes[i]);
          }
        } else {
          // Replace <br> with newline inside leaf block
          const clone = el.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
          const rawText = (clone.textContent || '').replace(/\u00a0/g, ' ');
          const subLines = rawText
            .split('\n')
            .map((l) => l.replace(/[ \t]+$/g, ''))
            .filter((l) => l.trim().length > 0);

          if (subLines.length === 0) {
            if (lines.length > 0) {
              lines.push('');
            }
          } else {
            const centered = isCenteredElement(el);
            subLines.forEach((sub) => {
              lines.push(centered ? `[center]${sub.trim()}[/center]` : sub);
            });
          }
        }
        return;
      }

      for (let i = 0; i < el.childNodes.length; i++) {
        walk(el.childNodes[i]);
      }
    };

    for (let i = 0; i < body.childNodes.length; i++) {
      walk(body.childNodes[i]);
    }

    const joined = lines.join('\n').replace(/^\n+|\n+$/g, '');
    return joined || null;
  } catch {
    return null;
  }
}

/**
 * Membungkus atau melepas tag [center]...[/center] pada baris yang dipilih di textarea.
 */
export function toggleCenterTagOnSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number
): { nextValue: string; nextCursor: number } {
  if (!value.trim()) {
    const sample = '[center]Judul Bacaan[/center]\n';
    return { nextValue: sample, nextCursor: sample.length };
  }

  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  let lineEnd = value.indexOf('\n', selectionEnd);
  if (lineEnd === -1) lineEnd = value.length;

  const selectedChunk = value.slice(lineStart, lineEnd);
  const lines = selectedChunk.split('\n');

  const allCentered = lines
    .filter((l) => l.trim().length > 0)
    .every((l) => /^\s*(?:\[center\]|<center>)/i.test(l) && /(?:\[\/center\]|<\/center>)\s*$/i.test(l));

  const transformed = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (allCentered) {
        return trimmed.replace(/^(?:\[center\]|<center>)/i, '').replace(/(?:\[\/center\]|<\/center>)$/i, '').trim();
      }
      const clean = trimmed.replace(/^(?:\[center\]|<center>)/i, '').replace(/(?:\[\/center\]|<\/center>)$/i, '').trim();
      return `[center]${clean}[/center]`;
    })
    .join('\n');

  const before = value.slice(0, lineStart);
  const after = value.slice(lineEnd);
  const ensureNewlineAfter = after && !after.startsWith('\n') ? '\n' : '';
  const nextValue = `${before}${transformed}${ensureNewlineAfter}${after}`;
  const nextCursor = before.length + transformed.length;

  return { nextValue, nextCursor };
}

/**
 * Mengurai teks pertanyaan & judul menjadi segmen terstruktur:
 * - Setiap tulisan ditengah ([center]...[/center], <center>...</center>, spasi/tab rata tengah, atau explicitJudul)
 *   dianggap sebagai segmen 'title' (Judul) yang BERDIRI SENDIRI dan TIDAK PERNAH digabung
 *   dengan paragraf atau kalimat setelahnya.
 */
export function parseQuestionSegments(
  pertanyaan: string,
  explicitJudul?: string
): { segments: QuestionSegment[]; hasTitle: boolean } {
  const segments: QuestionSegment[] = [];

  const cleanExplicitJudul = (explicitJudul || '')
    .replace(/\[\/?center\]/gi, '')
    .replace(/<\/?center>/gi, '')
    .trim();

  if (cleanExplicitJudul) {
    segments.push({ type: 'title', text: cleanExplicitJudul });
  }

  const rawText = (pertanyaan || '').replace(/\r\n/g, '\n');
  if (!rawText.trim()) {
    return { segments, hasTitle: segments.some((s) => s.type === 'title') };
  }

  // Langkah 1: Pisahkan tag [center]...[/center] atau <center>...</center> (baik inline maupun multiline)
  // sehingga teks tengah selalu menjadi token terpisah dari kalimat/paragraf sebelum/sesudahnya.
  const tokens: { kind: 'title' | 'raw'; text: string }[] = [];
  const centerTagRegex = /(?:\[center\]|<center>)([\s\S]*?)(?:\[\/center\]|<\/center>)/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = centerTagRegex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'raw', text: rawText.slice(lastIndex, match.index) });
    }
    const inner = match[1]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');
    if (inner) {
      tokens.push({ kind: 'title', text: inner });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < rawText.length) {
    tokens.push({ kind: 'raw', text: rawText.slice(lastIndex) });
  }

  // Langkah 2: Untuk teks di luar tag [center], deteksi baris yang ditulis di tengah (menggunakan spasi/tab simetris atau indentasi tengah)
  // serta pertahankan pemisahan & jarak spasi antar paragraf (termasuk beberapa baris kosong).
  const bodyLinesBuffer: string[] = [];
  const flushBodyBuffer = () => {
    const joined = bodyLinesBuffer
      .join('\n')
      .replace(/^\n+|\n+$/g, '');
    if (joined.trim()) {
      segments.push({ type: 'body', text: joined });
    }
    bodyLinesBuffer.length = 0;
  };

  tokens.forEach((tok) => {
    if (tok.kind === 'title') {
      flushBodyBuffer();
      if (!cleanExplicitJudul || tok.text.toLowerCase() !== cleanExplicitJudul.toLowerCase()) {
        const prev = segments[segments.length - 1];
        if (prev && prev.type === 'title') {
          prev.text = `${prev.text}\n${tok.text}`;
        } else {
          segments.push({ type: 'title', text: tok.text });
        }
      }
      return;
    }

    const rawLines = tok.text.split('\n');
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        if (bodyLinesBuffer.length > 0) {
          bodyLinesBuffer.push('');
        }
        continue;
      }

      // Cek apakah baris ini diformat di tengah menggunakan spasi / tab
      const hasSymmetricPadding = /^(?: {3,}|\t).+(?: {2,}|\t)$/.test(line);
      const hasCenterIndent = /^(?: {4,}|\t+)\S/.test(line);
      const isOptionOrBullet = /^(?:[A-Ea-e][\.\)]|\d+[\.\)]|[-•*]\s)/.test(trimmed);
      const hasFollowingText = rawLines.slice(i + 1).some((nl) => nl.trim().length > 0);
      const looksLikeProseOrQuestion = /[?:.,!]$/.test(trimmed);

      const isHeuristicCentered =
        !isOptionOrBullet &&
        trimmed.length <= 110 &&
        (hasSymmetricPadding || (hasCenterIndent && hasFollowingText && !looksLikeProseOrQuestion));

      if (isHeuristicCentered) {
        flushBodyBuffer();
        const prev = segments[segments.length - 1];
        if (prev && prev.type === 'title') {
          prev.text = `${prev.text}\n${trimmed}`;
        } else {
          segments.push({ type: 'title', text: trimmed });
        }
      } else {
        bodyLinesBuffer.push(line.replace(/\s+$/, ''));
      }
    }
  });

  flushBodyBuffer();

  return {
    segments,
    hasTitle: segments.some((s) => s.type === 'title'),
  };
}

/**
 * Mengubah teks soal menjadi string bersih untuk ekspor/ringkasan tabel tanpa tag [center]/[pecahan].
 */
export function stripQuestionTags(text: string): string {
  return (text || '')
    .replace(/\[\/?center\]/gi, '')
    .replace(/<\/?center>/gi, '')
    .replace(/\[\/?(?:pecahan|frac)\]/gi, '')
    .replace(/\^\{?\\circ\}?|\\degree/g, '°')
    .trim();
}

export function resolveBenarSalahItems(q?: {
  benarSalahItems?: BenarSalahItem[];
  opsi?: string[];
  kunciJawaban?: string | string[];
}): BenarSalahItem[] {
  if (!q) return [];
  const parseBsChoice = (raw: any): 'Benar' | 'Salah' => {
    const clean = String(raw || '')
      .replace(/^\d+\s*[\.\)\-:]\s*/, '')
      .trim()
      .toLowerCase();
    if (['s', 'salah', 'false', '0', 'tidak', 'no', 'f'].includes(clean)) return 'Salah';
    return 'Benar';
  };

  if (Array.isArray(q.benarSalahItems) && q.benarSalahItems.length > 0) {
    return q.benarSalahItems
      .filter((it) => Boolean(it && (it.pernyataan || '').trim()))
      .map((it, idx) => ({
        id: it.id || `bs_${idx + 1}`,
        pernyataan: it.pernyataan,
        kunci: parseBsChoice(it.kunci),
      }));
  }

  const isLegacyChoiceOpsi =
    Array.isArray(q.opsi) &&
    q.opsi.length === 2 &&
    q.opsi.every((o) => /^(?:[a-b][\.\)]\s*)?(benar|salah)$/i.test((o || '').trim()));

  if (Array.isArray(q.opsi) && q.opsi.length > 0 && !isLegacyChoiceOpsi) {
    const kunciArr = Array.isArray(q.kunciJawaban)
      ? q.kunciJawaban
      : String(q.kunciJawaban || '')
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    return q.opsi
      .filter((o) => Boolean(o && o.trim()))
      .map((text, idx) => ({
        id: `bs_${idx + 1}`,
        pernyataan: text,
        kunci: parseBsChoice(kunciArr[idx]),
      }));
  }

  const singleKey = Array.isArray(q.kunciJawaban)
    ? q.kunciJawaban[0] || ''
    : String(q.kunciJawaban || '');
  const norm = singleKey.trim().toLowerCase();
  if (isLegacyChoiceOpsi && q.opsi && (norm === 'a' || norm === 'b')) {
    const pickedOpt = q.opsi[norm === 'a' ? 0 : 1] || '';
    return [
      {
        id: 'bs_1',
        pernyataan: 'Pernyataan pada soal di atas',
        kunci: /salah/i.test(pickedOpt) ? 'Salah' : 'Benar',
      },
    ];
  }
  if (['b', 's', 'benar', 'salah', 'true', 'false'].includes(norm)) {
    return [
      {
        id: 'bs_1',
        pernyataan: 'Pernyataan pada soal di atas',
        kunci: parseBsChoice(norm),
      },
    ];
  }
  return [];
}

export function formatBenarSalahKeySummary(items: BenarSalahItem[]): string[] {
  return items.map((it, idx) => `${idx + 1}. ${it.kunci}`);
}

export function resolveMenjodohkanData(q?: {
  menjodohkanData?: MenjodohkanData;
  kunciJawaban?: string | string[];
}): MenjodohkanData | null {
  if (!q) return null;
  if (
    q.menjodohkanData &&
    Array.isArray(q.menjodohkanData.kolomKiri) &&
    q.menjodohkanData.kolomKiri.some((v) => v.trim()) &&
    Array.isArray(q.menjodohkanData.kolomKanan) &&
    q.menjodohkanData.kolomKanan.some((v) => v.trim())
  ) {
    return {
      kolomKiri: q.menjodohkanData.kolomKiri,
      kolomKanan: q.menjodohkanData.kolomKanan,
      pasangan: { ...(q.menjodohkanData.pasangan || {}) },
    };
  }

  // Fallback otomatis untuk format lama "Kucing:Vivipar, Ayam:Ovipar" atau "Jakarta = Ibukota, ..."
  const rawKey = Array.isArray(q.kunciJawaban) ? q.kunciJawaban.join(', ') : String(q.kunciJawaban || '');
  if (!rawKey.trim() || rawKey.trim().toLowerCase() === 'pasangan kunci benar') return null;

  const chunks = rawKey
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsedPairs: Array<{ kiri: string; kanan: string }> = [];
  chunks.forEach((chunk) => {
    const sepMatch = chunk.match(/^(.+?)\s*(?:->|→|[:=])\s*(.+)$/);
    if (sepMatch) {
      const kiri = sepMatch[1].trim();
      const kanan = sepMatch[2].trim();
      if (kiri && kanan) {
        parsedPairs.push({ kiri, kanan });
      }
    }
  });

  if (parsedPairs.length === 0) return null;

  // Abaikan format ringkasan huruf "1-B, 2-D" tanpa kolomKiri/kolomKanan
  if (parsedPairs.every((p) => /^\d+$/.test(p.kiri) && /^[A-Z]$/i.test(p.kanan))) {
    return null;
  }

  const kolomKiri: string[] = [];
  const kolomKanan: string[] = [];
  const pasangan: Record<string, string> = {};

  parsedPairs.forEach((p, idx) => {
    kolomKiri.push(p.kiri);
    let rightIdx = kolomKanan.findIndex((r) => r.toLowerCase() === p.kanan.toLowerCase());
    if (rightIdx === -1) {
      kolomKanan.push(p.kanan);
      rightIdx = kolomKanan.length - 1;
    }
    pasangan[String(idx + 1)] = String.fromCharCode(65 + rightIdx);
  });

  return { kolomKiri, kolomKanan, pasangan };
}

export function formatMenjodohkanKeySummary(data: MenjodohkanData): string {
  return data.kolomKiri
    .map((_, idx) => {
      const numKey = String(idx + 1);
      const letter = data.pasangan[numKey] || '-';
      return `${numKey}-${letter}`;
    })
    .join(', ');
}
