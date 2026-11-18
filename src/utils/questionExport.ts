import * as XLSX from 'xlsx';
import { CBTQuestion, TKAQuestion } from '../types';
import { parseQuestionSegments, stripQuestionTags, tokenizeMathText } from './questionFormat';

export interface QuestionExportMeta {
  title: string;
  subtitle?: string;
  paket?: string;
  mapel?: string;
  kelas?: string;
  schoolName?: string;
  includeAnswerKey?: boolean;
  fileNameBase?: string;
}

const escapeHtml = (str: string): string =>
  (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderWordMathHtml = (text: string): string => {
  return tokenizeMathText(text || '')
    .map((tok) => {
      if (tok.type === 'fraction' && tok.numerator && tok.denominator) {
        const wholeHtml = tok.whole
          ? `<span style="font-weight:bold;vertical-align:middle;margin-right:2px;">${escapeHtml(tok.whole)}</span>`
          : '';
        return `${wholeHtml}<span style="display:inline-table;vertical-align:middle;text-align:center;line-height:1.05;margin:0 2px;font-size:0.88em;font-weight:bold;"><span style="display:table-row;"><span style="display:table-cell;border-bottom:1.5px solid #0f172a;padding:0 3px 1px 3px;">${escapeHtml(
          tok.numerator
        )}</span></span><span style="display:table-row;"><span style="display:table-cell;padding:1px 3px 0 3px;">${escapeHtml(
          tok.denominator
        )}</span></span></span>`;
      }
      return escapeHtml(tok.value || '');
    })
    .join('');
};

const formatKunciDisplay = (q: CBTQuestion | TKAQuestion): string => {
  if (Array.isArray(q.kunciJawaban)) {
    return q.kunciJawaban.join(', ');
  }
  return String(q.kunciJawaban || '-');
};

const formatTipeLabel = (tipe: CBTQuestion['tipe']): string => {
  switch (tipe) {
    case 'pg':
      return 'Pilihan Ganda';
    case 'pg_kompleks':
      return 'PG Kompleks';
    case 'benar_salah':
      return 'Benar / Salah';
    case 'menjodohkan':
      return 'Menjodohkan';
    case 'isian':
      return 'Isian Singkat';
    case 'uraian':
      return 'Uraian';
    default:
      return String(tipe || '').toUpperCase();
  }
};

/**
 * Mengunduh daftar soal (CBT maupun TKA) dalam format dokumen Microsoft Word (.doc)
 * yang rapi, mendukung judul rata tengah, pecahan susun, jarak paragraf, gambar soal, opsi A-D, serta opsional kunci jawaban.
 */
export const exportQuestionsToWord = (
  questions: Array<CBTQuestion | TKAQuestion>,
  meta: QuestionExportMeta
): boolean => {
  if (!questions || questions.length === 0) return false;

  const includeKey = Boolean(meta.includeAnswerKey);
  const schoolName = meta.schoolName || 'SDN RAWA BADAK UTARA 21';

  const questionsHtml = questions
    .map((q, idx) => {
      const { segments } = parseQuestionSegments(q.pertanyaan || '', q.judulTeks);
      const tkaPaket = (q as TKAQuestion).jenisTka;
      const qMapel = q.mapel || meta.mapel || '-';

      const stemHtml = segments
        .map((seg) => {
          if (seg.type === 'title') {
            const safeTitle = renderWordMathHtml(seg.text).replace(/\n/g, '<br/>');
            return `<p style="text-align:center;font-weight:bold;margin:4px 0 8px 0;">${safeTitle}</p>`;
          }
          const chunks = seg.text.split(/(\n{2,})/);
          return chunks
            .map((chunk) => {
              if (!chunk) return '';
              if (/^\n{2,}$/.test(chunk)) {
                const blanks = chunk.length - 1;
                return blanks > 1
                  ? `<div style="height:${(blanks - 1) * 12}pt;"></div>`
                  : '';
              }
              const cleanChunk = chunk.replace(/^\n+|\n+$/g, '');
              if (!cleanChunk.trim()) return '';
              const safeBody = renderWordMathHtml(cleanChunk).replace(/\n/g, '<br/>');
              return `<p style="margin:2px 0 10px 0;text-align:justify;">${safeBody}</p>`;
            })
            .join('');
        })
        .join('');

      const imagesHtml = [q.gambarUrl, q.gambarUrl2]
        .filter((u): u is string => Boolean(u))
        .map(
          (url, imgIdx) =>
            `<div style="margin:6px 0;"><img src="${escapeHtml(url)}" alt="Gambar Soal ${
              idx + 1
            }-${imgIdx + 1}" style="max-width:320px;max-height:220px;border:1px solid #cbd5e1;" /></div>`
        )
        .join('');

      let optionsHtml = '';
      if (q.opsi && q.opsi.length > 0) {
        optionsHtml = `<table style="width:100%;border-collapse:collapse;margin-top:4px;margin-bottom:6px;">
          ${q.opsi
            .map((op, oIdx) => {
              const letter = String.fromCharCode(65 + oIdx);
              const opImg = q.opsiGambar?.[letter];
              return `<tr>
                <td style="width:24px;vertical-align:top;padding:2px 0;font-weight:bold;">${letter}.</td>
                <td style="vertical-align:top;padding:2px 0;">
                  ${renderWordMathHtml(op)}
                  ${
                    opImg
                      ? `<div style="margin-top:3px;"><img src="${escapeHtml(
                          opImg
                        )}" alt="Opsi ${letter}" style="max-width:160px;max-height:110px;border:1px solid #e2e8f0;" /></div>`
                      : ''
                  }
                </td>
              </tr>`;
            })
            .join('')}
        </table>`;
      } else if (q.tipe === 'benar_salah') {
        optionsHtml = `<p style="margin:4px 0 6px 0;color:#475569;">[ &nbsp; ] Benar &nbsp;&nbsp;&nbsp;&nbsp; [ &nbsp; ] Salah</p>`;
      } else if (q.tipe === 'isian' || q.tipe === 'uraian' || q.tipe === 'menjodohkan') {
        optionsHtml = `<p style="margin:4px 0 6px 0;color:#475569;">Jawaban: .......................................................................................</p>`;
      }

      const keyInlineHtml = includeKey
        ? `<div style="margin-top:4px;padding:6px 8px;background-color:#ecfdf5;border:1px solid #a7f3d0;font-size:10pt;">
            <strong>Kunci Jawaban:</strong> ${escapeHtml(formatKunciDisplay(q))}
            ${
              q.pembahasan
                ? `<br/><strong>Pembahasan:</strong> ${escapeHtml(stripQuestionTags(q.pembahasan))}`
                : ''
            }
          </div>`
        : '';

      return `<div style="margin-bottom:14px;page-break-inside:avoid;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:28px;vertical-align:top;font-weight:bold;">${idx + 1}.</td>
            <td style="vertical-align:top;">
              <div style="font-size:9pt;color:#64748b;margin-bottom:2px;">
                [${escapeHtml(formatTipeLabel(q.tipe))}${tkaPaket ? ` • ${escapeHtml(tkaPaket)}` : ''} • ${escapeHtml(qMapel)} • Bobot ${q.bobot || 10}]
              </div>
              ${stemHtml}
              ${imagesHtml}
              ${optionsHtml}
              ${keyInlineHtml}
            </td>
          </tr>
        </table>
      </div>`;
    })
    .join('');

  const answerSummaryHtml = includeKey
    ? `<div style="margin-top:24px;page-break-before:always;">
        <h3 style="font-size:12pt;border-bottom:2px solid #0f172a;padding-bottom:4px;margin-bottom:10px;">
          REKAP KUNCI JAWABAN &amp; PEMBAHASAN
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;" border="1" cellpadding="5">
          <thead>
            <tr style="background-color:#f1f5f9;">
              <th style="width:40px;text-align:center;">No</th>
              <th style="width:110px;text-align:left;">Tipe Soal</th>
              <th style="width:160px;text-align:left;">Kunci Jawaban</th>
              <th style="text-align:left;">Pembahasan / Keterangan</th>
              <th style="width:55px;text-align:center;">Bobot</th>
            </tr>
          </thead>
          <tbody>
            ${questions
              .map(
                (q, idx) => `<tr>
                  <td style="text-align:center;">${idx + 1}</td>
                  <td>${escapeHtml(formatTipeLabel(q.tipe))}</td>
                  <td><strong>${escapeHtml(formatKunciDisplay(q))}</strong></td>
                  <td>${escapeHtml(stripQuestionTags(q.pembahasan || '-'))}</td>
                  <td style="text-align:center;">${q.bobot || 10}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`
    : '';

  const htmlDocument = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(meta.title)}</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #0f172a; line-height: 1.45; }
    h1, h2, h3 { margin: 0; }
  </style>
</head>
<body>
  <div style="text-align:center;border-bottom:3px double #0f172a;padding-bottom:8px;margin-bottom:14px;">
    <div style="font-size:12pt;font-weight:bold;text-transform:uppercase;">${escapeHtml(schoolName)}</div>
    <div style="font-size:13pt;font-weight:bold;text-transform:uppercase;margin-top:2px;">${escapeHtml(meta.title)}</div>
    ${meta.subtitle ? `<div style="font-size:10pt;color:#334155;margin-top:2px;">${escapeHtml(meta.subtitle)}</div>` : ''}
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:10.5pt;margin-bottom:14px;" border="1" cellpadding="5">
    <tr>
      <td style="width:18%;background:#f8fafc;"><strong>Paket / Jenis</strong></td>
      <td style="width:32%;">${escapeHtml(meta.paket || '-')}</td>
      <td style="width:18%;background:#f8fafc;"><strong>Kelas / Sasaran</strong></td>
      <td style="width:32%;">${escapeHtml(meta.kelas || '-')}</td>
    </tr>
    <tr>
      <td style="background:#f8fafc;"><strong>Mata Pelajaran</strong></td>
      <td>${escapeHtml(meta.mapel || '-')}</td>
      <td style="background:#f8fafc;"><strong>Jumlah Soal</strong></td>
      <td>${questions.length} Butir Soal${includeKey ? ' (Dengan Kunci)' : ''}</td>
    </tr>
  </table>

  ${questionsHtml}
  ${answerSummaryHtml}
</body>
</html>`;

  const blob = new Blob(['\ufeff', htmlDocument], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = (meta.fileNameBase || meta.title || 'Bank_Soal')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  link.href = url;
  link.download = `${safeName}${includeKey ? '_Dengan_Kunci' : ''}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};

/**
 * Mengunduh daftar soal CBT ke Excel (.xlsx)
 */
export const exportCbtQuestionsToExcel = (
  questions: CBTQuestion[],
  meta: QuestionExportMeta
): boolean => {
  if (!questions || questions.length === 0) return false;

  const rows = questions.map((q, idx) => ({
    No: idx + 1,
    'Paket Asesmen': q.paket || meta.paket || '-',
    'Sub Paket': q.subPaket || '-',
    'Mata Pelajaran': q.mapel || meta.mapel || '-',
    Kelas: q.kelas || meta.kelas || '-',
    'Tipe Soal': q.tipe,
    'Kode CP': q.cpId || '',
    'Kode TP': q.tpId || '',
    'Judul Teks': q.judulTeks || '',
    Pertanyaan: stripQuestionTags(q.pertanyaan),
    'Opsi A': q.opsi?.[0] || '',
    'Opsi B': q.opsi?.[1] || '',
    'Opsi C': q.opsi?.[2] || '',
    'Opsi D': q.opsi?.[3] || '',
    'Kunci Jawaban': formatKunciDisplay(q),
    Bobot: q.bobot || 10,
    Pembahasan: stripQuestionTags(q.pembahasan || ''),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bank Soal CBT');
  const safeName = (meta.fileNameBase || 'Bank_Soal_CBT')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  XLSX.writeFile(wb, `${safeName}.xlsx`);
  return true;
};

/**
 * Mengunduh daftar soal TKA ke Excel (.xlsx) dengan format kolom yang kompatibel
 * dengan fitur Import Excel TKA sehingga dapat diedit dan diimpor kembali.
 */
export const exportTkaQuestionsToExcel = (
  questions: TKAQuestion[],
  meta: QuestionExportMeta
): boolean => {
  if (!questions || questions.length === 0) return false;

  const rows = questions.map((q) => ({
    'Jenis TKA': q.jenisTka,
    'Mata Pelajaran': q.mapel,
    'Tipe Soal': q.tipe,
    'Judul Teks': q.judulTeks || '',
    Pertanyaan: stripQuestionTags(q.pertanyaan),
    'Opsi Pilihan': Array.isArray(q.opsi) ? q.opsi.join(', ') : '',
    'Kunci Jawaban': formatKunciDisplay(q),
    'Posisi Gambar': q.posisiGambar || 'bawah_judul',
    Bobot: q.bobot || 10,
    Pembahasan: stripQuestionTags(q.pembahasan || ''),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bank Soal TKA');
  const safeName = (meta.fileNameBase || 'Bank_Soal_TKA')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  XLSX.writeFile(wb, `${safeName}.xlsx`);
  return true;
};
