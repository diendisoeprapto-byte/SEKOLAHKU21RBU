import React from 'react';

interface Props {
  content: string;
  compact?: boolean;
}

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
  const lines = (content || '').split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const rawLine = lines[idx];
    const line = rawLine.trim();

    if (!line) {
      idx++;
      continue;
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
        items.push(lines[idx].trim().replace(/^[-*•]\s+/, ''));
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
        items.push(lines[idx].trim().replace(/^\d+\.\s+/, ''));
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
