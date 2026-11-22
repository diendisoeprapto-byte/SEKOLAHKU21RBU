import React, { useState } from 'react';
import {
  SARAH_STICKER_ASSETS,
  SarahStickerCode,
  extractSarahResponseMetadata,
} from '../utils/sarahVisuals';

interface Props {
  content: string;
  compact?: boolean;
}

const VALID_STICKER_CODES: SarahStickerCode[] = ['sapa', 'jempol', 'semangat', 'terimakasih'];
const STICKER_TOKEN_REGEX = /\[STIKER\s*:\s*([a-zA-Z_]+)\s*\]/gi;

const SarahStickerView: React.FC<{ code: SarahStickerCode }> = ({ code }) => {
  const asset = SARAH_STICKER_ASSETS[code];
  const [imgError, setImgError] = useState(false);

  return (
    <div className="my-2 inline-flex flex-col items-center">
      {!imgError ? (
        <img
          src={asset.src}
          alt={asset.label}
          title={asset.label}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-[120px] h-[120px] object-cover rounded-2xl border-2 border-white shadow-md sarah-sticker-anim select-none bg-rose-50"
        />
      ) : (
        <div className="w-[120px] h-[120px] rounded-2xl border-2 border-rose-200 bg-gradient-to-br from-rose-50 to-amber-50 shadow-sm flex flex-col items-center justify-center p-2 text-center sarah-sticker-anim">
          <span className="font-display font-black text-xs text-rose-700">
            {asset.badgeText}
          </span>
        </div>
      )}
    </div>
  );
};

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`b_${keyIdx++}`} className="font-extrabold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={`i_${keyIdx++}`} className="italic text-slate-800">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`c_${keyIdx++}`}
          className="px-1.5 py-0.5 rounded bg-slate-100 text-rose-700 font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function parseTableCells(rowLine: string): string[] {
  const trimmed = rowLine.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(trimmed);
}

export const SarahMarkdown: React.FC<Props> = ({ content, compact = false }) => {
  const { cleanText } = extractSarahResponseMetadata(content || '');
  const lines = cleanText.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let idx = 0;
  let stickerUsedCount = 0;

  while (idx < lines.length) {
    const rawLine = lines[idx];
    const trimmedRaw = rawLine.trim();

    if (!trimmedRaw) {
      idx++;
      continue;
    }

    // Extract optional sticker tokens on this line (render max 1 sticker per message)
    let lineStickerBefore: SarahStickerCode | null = null;
    let lineStickerAfter: SarahStickerCode | null = null;
    const stickerMatches = Array.from(trimmedRaw.matchAll(STICKER_TOKEN_REGEX));
    let line = trimmedRaw;

    if (stickerMatches.length > 0) {
      for (const m of stickerMatches) {
        const candidate = String(m[1] || '').toLowerCase() as SarahStickerCode;
        if (VALID_STICKER_CODES.includes(candidate) && stickerUsedCount === 0) {
          stickerUsedCount += 1;
          const matchIndex = m.index ?? 0;
          if (matchIndex <= 4) {
            lineStickerBefore = candidate;
          } else {
            lineStickerAfter = candidate;
          }
        }
      }
      line = trimmedRaw.replace(STICKER_TOKEN_REGEX, '').trim();

      if (!line) {
        const loneSticker = lineStickerBefore || lineStickerAfter;
        if (loneSticker) {
          elements.push(
            <div key={`stk_only_${idx}`} className="flex justify-start">
              <SarahStickerView code={loneSticker} />
            </div>
          );
        }
        idx++;
        continue;
      }
    }

    if (lineStickerBefore) {
      elements.push(
        <div key={`stk_pre_${idx}`} className="flex justify-start">
          <SarahStickerView code={lineStickerBefore} />
        </div>
      );
    }

    // Markdown Table
    if (
      line.includes('|') &&
      idx + 1 < lines.length &&
      isTableSeparator(lines[idx + 1])
    ) {
      const headers = parseTableCells(line);
      idx += 2;
      const rows: string[][] = [];
      while (idx < lines.length && lines[idx].trim().includes('|') && lines[idx].trim() !== '') {
        rows.push(parseTableCells(lines[idx]));
        idx++;
      }
      elements.push(
        <div
          key={`tbl_${idx}`}
          className="my-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100/90 text-slate-800">
              <tr>
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    className="px-3 py-2 font-display font-extrabold border-b border-slate-200"
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, rIdx) => (
                <tr key={rIdx} className="hover:bg-rose-50/30">
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-slate-700 align-top">
                      {renderInline(r[cIdx] || '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      if (lineStickerAfter) {
        elements.push(
          <div key={`stk_post_${idx}`} className="flex justify-start">
            <SarahStickerView code={lineStickerAfter} />
          </div>
        );
      }
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h4
          key={`h3_${idx}`}
          className={`font-display font-black text-slate-900 mt-3 mb-1 ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {renderInline(line.slice(4))}
        </h4>
      );
      idx++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h3
          key={`h2_${idx}`}
          className={`font-display font-black text-rose-800 mt-4 mb-1.5 border-b border-rose-100 pb-1 ${
            compact ? 'text-sm' : 'text-base'
          }`}
        >
          {renderInline(line.slice(3))}
        </h3>
      );
      idx++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h2
          key={`h1_${idx}`}
          className={`font-display font-black text-slate-900 mt-4 mb-2 ${
            compact ? 'text-base' : 'text-lg'
          }`}
        >
          {renderInline(line.slice(2))}
        </h2>
      );
      idx++;
      continue;
    }

    if (line === '---' || line === '***') {
      elements.push(<hr key={`hr_${idx}`} className="my-3 border-slate-200" />);
      idx++;
      continue;
    }

    // Unordered list
    if (/^[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (idx < lines.length && /^[-*•]\s+/.test(lines[idx].trim())) {
        items.push(
          lines[idx].trim().replace(/^[-*•]\s+/, '').replace(STICKER_TOKEN_REGEX, '').trim()
        );
        idx++;
      }
      elements.push(
        <ul key={`ul_${idx}`} className="list-disc pl-5 space-y-1 my-1.5 text-slate-700">
          {items.map((it, i) => (
            <li key={i} className={compact ? 'text-xs leading-relaxed' : 'text-xs sm:text-sm leading-relaxed'}>
              {renderInline(it)}
            </li>
          ))}
        </ul>
      );
      if (lineStickerAfter) {
        elements.push(
          <div key={`stk_post_${idx}`} className="flex justify-start">
            <SarahStickerView code={lineStickerAfter} />
          </div>
        );
      }
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (idx < lines.length && /^\d+\.\s+/.test(lines[idx].trim())) {
        items.push(
          lines[idx].trim().replace(/^\d+\.\s+/, '').replace(STICKER_TOKEN_REGEX, '').trim()
        );
        idx++;
      }
      elements.push(
        <ol key={`ol_${idx}`} className="list-decimal pl-5 space-y-1.5 my-1.5 text-slate-700">
          {items.map((it, i) => (
            <li key={i} className={compact ? 'text-xs leading-relaxed' : 'text-xs sm:text-sm leading-relaxed'}>
              {renderInline(it)}
            </li>
          ))}
        </ol>
      );
      if (lineStickerAfter) {
        elements.push(
          <div key={`stk_post_${idx}`} className="flex justify-start">
            <SarahStickerView code={lineStickerAfter} />
          </div>
        );
      }
      continue;
    }

    // Paragraph
    elements.push(
      <p
        key={`p_${idx}`}
        className={`text-slate-700 leading-relaxed ${
          compact ? 'text-xs my-1' : 'text-xs sm:text-sm my-1.5'
        }`}
      >
        {renderInline(line)}
      </p>
    );

    if (lineStickerAfter) {
      elements.push(
        <div key={`stk_post_${idx}`} className="flex justify-start">
          <SarahStickerView code={lineStickerAfter} />
        </div>
      );
    }
    idx++;
  }

  return <div className="space-y-0.5">{elements}</div>;
};
