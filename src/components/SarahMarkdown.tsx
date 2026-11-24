import React, { useEffect, useState } from 'react';
import {
  SARAH_STICKER_ASSETS,
  SarahStickerCode,
  extractSarahResponseMetadata,
} from '../utils/sarahVisuals';
import {
  SarahStickerItem,
  SarahUserMode,
  findRealisticEndiSticker,
  findStudent3DSticker,
} from '../utils/sarahStickers';
import {
  SARAH_STICKERS_UPDATED_EVENT,
  getCachedCustomEndiStickerDataUrl,
  hydrateCustomEndiStickers,
} from '../utils/sarahStickerStorage';

interface Props {
  content: string;
  compact?: boolean;
  userMode?: SarahUserMode;
}

const VALID_STICKER_CODES: SarahStickerCode[] = ['sapa', 'jempol', 'semangat', 'terimakasih'];
const STICKER_TOKEN_REGEX = /\[STIKER\s*:\s*([a-zA-Z0-9_]+)\s*\]/gi;
const REAL_STICKER_TOKEN_REGEX = /\[REAL_STIKER\s*:\s*([a-zA-Z0-9_]+)\s*\]/gi;
const STUDENT_3D_STICKER_TOKEN_REGEX = /\[STIKER_3D\s*:\s*([a-zA-Z0-9_]+)\s*\]/gi;

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
          className="w-[120px] h-[120px] object-cover rounded-2xl border-4 border-white shadow-lg sarah-sticker-anim select-none bg-rose-50"
        />
      ) : (
        <div className="w-[120px] h-[120px] rounded-2xl border-4 border-white ring-1 ring-rose-200 bg-gradient-to-br from-rose-50 to-amber-50 shadow-md flex flex-col items-center justify-center p-2 text-center sarah-sticker-anim">
          <span className="font-display font-black text-xs text-rose-700">
            {asset.badgeText}
          </span>
        </div>
      )}
    </div>
  );
};

const SarahModeStickerView: React.FC<{
  item: SarahStickerItem;
  variant: 'realistic' | 'student3d';
}> = ({ item, variant }) => {
  const [imgError, setImgError] = useState(false);
  const [customDataUrl, setCustomDataUrl] = useState<string | null>(() =>
    variant === 'realistic' ? getCachedCustomEndiStickerDataUrl(item.id) : null
  );

  useEffect(() => {
    if (variant !== 'realistic') return;
    let active = true;
    const syncCustom = () => {
      if (!active) return;
      const hit = getCachedCustomEndiStickerDataUrl(item.id);
      setCustomDataUrl(hit);
      if (hit) setImgError(false);
    };
    void hydrateCustomEndiStickers().then(syncCustom);
    window.addEventListener(SARAH_STICKERS_UPDATED_EVENT, syncCustom);
    return () => {
      active = false;
      window.removeEventListener(SARAH_STICKERS_UPDATED_EVENT, syncCustom);
    };
  }, [item.id, variant]);

  const resolvedSrc = (variant === 'realistic' && customDataUrl) || item.path;

  if (!imgError) {
    return (
      <div className="my-2 inline-flex flex-col items-center">
        <div className="p-1 rounded-[1.25rem] bg-white shadow-[0_10px_24px_-6px_rgba(15,23,42,0.22)] border-2 border-white inline-block sarah-sticker-anim">
          <img
            src={resolvedSrc}
            alt={item.label}
            title={item.label}
            onError={() => setImgError(true)}
            className="w-[124px] h-[124px] object-contain rounded-2xl select-none bg-rose-50/40"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 inline-flex flex-col items-center">
      <div
        title={item.label}
        className={`w-[132px] min-h-[112px] p-3 rounded-[1.25rem] border-4 border-white shadow-[0_8px_22px_-6px_rgba(15,23,42,0.2)] flex flex-col items-center justify-center text-center gap-1.5 sarah-sticker-anim select-none ${
          variant === 'realistic'
            ? 'bg-gradient-to-br from-rose-100 via-pink-50 to-amber-50 ring-1 ring-rose-200'
            : 'bg-gradient-to-br from-sky-100 via-indigo-50 to-amber-50 ring-1 ring-indigo-200'
        }`}
      >
        <span className="text-3xl leading-none drop-shadow-xs">{item.emoji}</span>
        <span
          className={`font-display font-black text-[11px] leading-tight ${
            variant === 'realistic' ? 'text-rose-900' : 'text-indigo-950'
          }`}
        >
          {item.label}
        </span>
        {(item.hijabStyle || item.iconTheme) && (
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
              variant === 'realistic'
                ? 'bg-white/80 text-rose-700'
                : 'bg-white/80 text-indigo-700'
            }`}
          >
            {item.hijabStyle ? `Hijab ${item.hijabStyle}` : item.iconTheme}
          </span>
        )}
      </div>
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

export const SarahMarkdown: React.FC<Props> = ({
  content,
  compact = false,
  userMode = 'standard_teacher',
}) => {
  const { cleanText } = extractSarahResponseMetadata(content || '');
  const lines = cleanText.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let idx = 0;
  let stickerUsedCount = 0;

  const renderLineStickers = (raw: string, keyPrefix: string): { cleanedLine: string; rendered: React.ReactNode[] } => {
    const rendered: React.ReactNode[] = [];
    let cleaned = raw;

    // 1. Stiker Realistis (HANYA boleh tampil pada Mode 1: exclusive_endi)
    const realMatches = Array.from(cleaned.matchAll(REAL_STICKER_TOKEN_REGEX));
    if (realMatches.length > 0) {
      if (userMode === 'exclusive_endi') {
        for (const m of realMatches) {
          if (stickerUsedCount < 2) {
            const item = findRealisticEndiSticker(m[1]);
            if (item) {
              stickerUsedCount += 1;
              rendered.push(
                <div key={`${keyPrefix}_real_${stickerUsedCount}`} className="flex justify-start">
                  <SarahModeStickerView item={item} variant="realistic" />
                </div>
              );
            }
          }
        }
      }
      cleaned = cleaned.replace(REAL_STICKER_TOKEN_REGEX, '').trim();
    }

    // 2. Stiker Kartun 3D Siswa (HANYA boleh tampil pada Mode 2: siswa)
    const student3DMatches = Array.from(cleaned.matchAll(STUDENT_3D_STICKER_TOKEN_REGEX));
    if (student3DMatches.length > 0) {
      if (userMode === 'siswa') {
        for (const m of student3DMatches) {
          if (stickerUsedCount < 2) {
            const item = findStudent3DSticker(m[1]);
            if (item) {
              stickerUsedCount += 1;
              rendered.push(
                <div key={`${keyPrefix}_3d_${stickerUsedCount}`} className="flex justify-start">
                  <SarahModeStickerView item={item} variant="student3d" />
                </div>
              );
            }
          }
        }
      }
      cleaned = cleaned.replace(STUDENT_3D_STICKER_TOKEN_REGEX, '').trim();
    }

    // 3. Stiker WA klasik (hanya untuk mode siswa; standard_teacher tanpa stiker)
    const classicMatches = Array.from(cleaned.matchAll(STICKER_TOKEN_REGEX));
    if (classicMatches.length > 0) {
      if (userMode === 'siswa' && stickerUsedCount === 0) {
        const candidate = String(classicMatches[0][1] || '').toLowerCase() as SarahStickerCode;
        if (VALID_STICKER_CODES.includes(candidate)) {
          stickerUsedCount += 1;
          rendered.push(
            <div key={`${keyPrefix}_stk`} className="flex justify-start">
              <SarahStickerView code={candidate} />
            </div>
          );
        }
      }
      cleaned = cleaned.replace(STICKER_TOKEN_REGEX, '').trim();
    }

    return { cleanedLine: cleaned, rendered };
  };

  while (idx < lines.length) {
    const rawLine = lines[idx];
    const trimmedRaw = rawLine.trim();

    if (!trimmedRaw) {
      idx++;
      continue;
    }

    const { cleanedLine: line, rendered: lineStickerNodes } = renderLineStickers(
      trimmedRaw,
      `l_${idx}`
    );

    if (!line) {
      if (lineStickerNodes.length > 0) {
        elements.push(...lineStickerNodes);
      }
      idx++;
      continue;
    }

    if (lineStickerNodes.length > 0) {
      elements.push(...lineStickerNodes);
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
          lines[idx]
            .trim()
            .replace(/^[-*•]\s+/, '')
            .replace(REAL_STICKER_TOKEN_REGEX, '')
            .replace(STUDENT_3D_STICKER_TOKEN_REGEX, '')
            .replace(STICKER_TOKEN_REGEX, '')
            .trim()
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
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (idx < lines.length && /^\d+\.\s+/.test(lines[idx].trim())) {
        items.push(
          lines[idx]
            .trim()
            .replace(/^\d+\.\s+/, '')
            .replace(REAL_STICKER_TOKEN_REGEX, '')
            .replace(STUDENT_3D_STICKER_TOKEN_REGEX, '')
            .replace(STICKER_TOKEN_REGEX, '')
            .trim()
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

    idx++;
  }

  return <div className="space-y-0.5">{elements}</div>;
};
