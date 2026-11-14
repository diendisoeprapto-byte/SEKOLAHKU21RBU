import React from 'react';

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
            .map((l) => l.replace(/\s+/g, ' ').trim())
            .filter(Boolean);

          if (subLines.length === 0) {
            if (lines.length > 0 && lines[lines.length - 1] !== '') {
              lines.push('');
            }
          } else {
            const centered = isCenteredElement(el);
            subLines.forEach((sub) => {
              lines.push(centered ? `[center]${sub}[/center]` : sub);
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

    const joined = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
  // serta pertahankan pemisahan paragraf/baris agar judul tidak menyatu dengan paragraf setelahnya.
  const bodyLinesBuffer: string[] = [];
  const flushBodyBuffer = () => {
    const joined = bodyLinesBuffer
      .join('\n')
      .replace(/^\n+|\n+$/g, '')
      .replace(/\n{3,}/g, '\n\n');
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
        if (bodyLinesBuffer.length > 0 && bodyLinesBuffer[bodyLinesBuffer.length - 1] !== '') {
          bodyLinesBuffer.push('');
        }
        continue;
      }

      // Cek apakah baris ini diformat di tengah menggunakan spasi / tab
      const hasSymmetricPadding = /^(?: {3,}|\t).+(?: {2,}|\t)$/.test(line);
      const hasCenterIndent = /^(?: {4,}|\t+)\S/.test(line);
      const isOptionOrBullet = /^(?:[A-Ea-e][\.\)]|\d+[\.\)]|[-•*]\s)/.test(trimmed);
      const hasFollowingText = rawLines.slice(i + 1).some((nl) => nl.trim().length > 0);
      const looksLikeQuestion = /[?:]$/.test(trimmed);

      const isHeuristicCentered =
        !isOptionOrBullet &&
        trimmed.length <= 110 &&
        (hasSymmetricPadding || (hasCenterIndent && hasFollowingText && !looksLikeQuestion));

      if (isHeuristicCentered) {
        flushBodyBuffer();
        const prev = segments[segments.length - 1];
        if (prev && prev.type === 'title') {
          prev.text = `${prev.text}\n${trimmed}`;
        } else {
          segments.push({ type: 'title', text: trimmed });
        }
      } else {
        bodyLinesBuffer.push(trimmed);
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
 * Mengubah teks soal menjadi string bersih untuk ekspor/ringkasan tabel tanpa tag [center].
 */
export function stripQuestionTags(text: string): string {
  return (text || '').replace(/\[\/?center\]/gi, '').replace(/<\/?center>/gi, '').trim();
}
