import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TKAQuestion } from '../types';
import {
  extractBaseTkaPaket,
  normalizeTkaMapelKey,
  TKAMapelScoreKey,
} from './storage';
import {
  formatTodayIndonesianDate,
  loadImageDataUrlForPdf,
  resolveAbsoluteAssetUrl,
} from './pdfImageHelper';

export interface TkaReportRecordInput {
  id: string;
  studentId: string;
  nama: string;
  nisn: string;
  kelas: string;
  paket: string;
  paketDasar?: string;
  completedMapels?: string[];
  scoresPerMapel?: Partial<Record<TKAMapelScoreKey, number>>;
  skorIndo?: number | null;
  skorMtk?: number | null;
  skorIpas?: number | null;
  skorInggris?: number | null;
  skorKka?: number | null;
  skorTotal: number;
  predikat: string;
  status: string;
  tanggalUjian?: string;
  durasiPengerjaan?: string;
  rank?: number;
}

export interface TkaActiveMapelDef {
  key: TKAMapelScoreKey;
  field: 'skorIndo' | 'skorMtk' | 'skorIpas' | 'skorInggris' | 'skorKka';
  shortHeader: string;
  excelHeader: string;
}

export interface TkaReportExportOptions {
  schoolName: string;
  schoolAddress?: string;
  schoolNpsn?: string;
  logoKemendikbudUrl?: string;
  logoSekolahUrl?: string;
  tahunPelajaran: string;
  paketLabel: string;
  kepsekNama: string;
  kepsekNipLabel: string;
  getWaliKelas: (kelas: string) => { nama: string; nipLabel: string };
  activeTestedMapels: TkaActiveMapelDef[];
  tkaQuestions: TKAQuestion[];
  tanggalCetak?: string;
}

const ALL_MAPEL_META: Array<{
  key: TKAMapelScoreKey;
  field: 'skorIndo' | 'skorMtk' | 'skorIpas' | 'skorInggris' | 'skorKka';
  label: string;
  shortHeader: string;
  desc: string;
}> = [
  {
    key: 'Bahasa Indonesia',
    field: 'skorIndo',
    label: 'Bahasa Indonesia (Literasi Membaca)',
    shortHeader: 'B. Indonesia',
    desc: 'Terampil menemukan gagasan pokok dan menganalisis simpulan teks informatif.',
  },
  {
    key: 'Matematika',
    field: 'skorMtk',
    label: 'Matematika (Numerasi & Penalaran)',
    shortHeader: 'Matematika',
    desc: 'Mampu menyelesaikan soal aplikasi operasi pecahan, perbandingan, dan bangun ruang.',
  },
  {
    key: 'IPAS',
    field: 'skorIpas',
    label: 'IPAS (Sains & Lingkungan Sosial)',
    shortHeader: 'IPAS',
    desc: 'Memahami siklus ekosistem, sifat energi, serta interaksi sosial kemasyarakatan.',
  },
  {
    key: 'Bahasa Inggris',
    field: 'skorInggris',
    label: 'Bahasa Inggris (Literasi Global)',
    shortHeader: 'B. Inggris',
    desc: 'Mampu memahami ungkapan kontekstual, deskripsi harian, dan kosakata fungsional.',
  },
  {
    key: 'Koding dan Kecerdasan Artifisial (KKA)',
    field: 'skorKka',
    label: 'Koding & Kecerdasan Artifisial (KKA)',
    shortHeader: 'KKA',
    desc: 'Menerapkan berpikir komputasional, logika algoritma, dan etika aman Kecerdasan Artifisial.',
  },
];

const escapeHtml = (str: string): string =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeFilenamePart = (val: string): string =>
  (val || 'Data')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Data';

const predFromScore = (score: number): string =>
  score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';

const getStudentScoreForMapel = (
  record: TkaReportRecordInput,
  key: TKAMapelScoreKey,
  field: 'skorIndo' | 'skorMtk' | 'skorIpas' | 'skorInggris' | 'skorKka'
): number | null => {
  const fromMap = record.scoresPerMapel?.[key];
  if (typeof fromMap === 'number' && Number.isFinite(fromMap)) return fromMap;
  const fromField = record[field];
  if (typeof fromField === 'number' && Number.isFinite(fromField)) return fromField;
  return null;
};

const resolveStudentVisibleMapels = (
  record: TkaReportRecordInput,
  tkaQuestions: TKAQuestion[]
) => {
  const completedMapels = Array.isArray(record.completedMapels)
    ? record.completedMapels.map((m) => normalizeTkaMapelKey(m))
    : [];
  const targetPaket = record.paketDasar || extractBaseTkaPaket(record.paket || '');

  const paketHasQuestions = (key: TKAMapelScoreKey) =>
    tkaQuestions.some(
      (q) =>
        (!targetPaket || q.jenisTka === targetPaket) &&
        normalizeTkaMapelKey(q.mapel) === key
    );

  const rowsWithScores = ALL_MAPEL_META.map((meta) => {
    const score = getStudentScoreForMapel(record, meta.key, meta.field);
    return {
      ...meta,
      score: score ?? 0,
      hasScoreEntry: score !== null && score > 0,
    };
  });

  const hasAnyPositiveScore = rowsWithScores.some((r) => r.hasScoreEntry);
  return rowsWithScores.filter((row) => {
    if (completedMapels.length > 0) return completedMapels.includes(row.key);
    if (hasAnyPositiveScore) return row.hasScoreEntry;
    return paketHasQuestions(row.key);
  });
};

const triggerWordDownload = (htmlDocument: string, filename: string) => {
  const blob = new Blob(['\ufeff', htmlDocument], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const buildWordKopSuratHtml = (
  options: TkaReportExportOptions,
  documentTitle: string,
  subtitle: string
): string => {
  const leftLogo = resolveAbsoluteAssetUrl(options.logoKemendikbudUrl);
  const rightLogo = resolveAbsoluteAssetUrl(options.logoSekolahUrl);
  const leftImgHtml = leftLogo
    ? `<img src="${escapeHtml(leftLogo)}" width="64" height="64" style="width:64px;height:64px;object-fit:contain;" alt="Logo Dinas" />`
    : '&nbsp;';
  const rightImgHtml = rightLogo
    ? `<img src="${escapeHtml(rightLogo)}" width="64" height="64" style="width:64px;height:64px;object-fit:contain;" alt="Logo Sekolah" />`
    : '&nbsp;';

  return `
  <table style="width:100%;border-collapse:collapse;border-bottom:3px double #0f172a;margin-bottom:14px;">
    <tr>
      <td style="width:76px;text-align:center;vertical-align:middle;padding-bottom:8px;">
        ${leftImgHtml}
      </td>
      <td style="text-align:center;vertical-align:middle;padding:0 8px 8px 8px;">
        <div style="font-size:9.5pt;font-weight:bold;text-transform:uppercase;color:#334155;">
          PEMERINTAH PROVINSI DKI JAKARTA • DINAS PENDIDIKAN
        </div>
        <div style="font-size:13.5pt;font-weight:bold;text-transform:uppercase;color:#0f172a;">
          ${escapeHtml(options.schoolName)}
        </div>
        ${
          options.schoolAddress || options.schoolNpsn
            ? `<div style="font-size:8.5pt;color:#475569;margin-top:2px;">
                ${escapeHtml(options.schoolAddress || '')}${options.schoolNpsn ? ` • NPSN: ${escapeHtml(options.schoolNpsn)}` : ''}
              </div>`
            : ''
        }
      </td>
      <td style="width:76px;text-align:center;vertical-align:middle;padding-bottom:8px;">
        ${rightImgHtml}
      </td>
    </tr>
  </table>
  <div style="text-align:center;margin-bottom:12px;">
    <div style="font-size:12pt;font-weight:bold;text-transform:uppercase;color:#0f172a;">
      ${escapeHtml(documentTitle)}
    </div>
    <div style="font-size:9.5pt;color:#334155;margin-top:2px;">
      ${subtitle}
    </div>
  </div>`;
};

// Standard 4 cm vertical signature gap for Microsoft Word HTML
const WORD_SIGNATURE_SPACER =
  '<div style="height:4cm;min-height:4cm;line-height:4cm;font-size:1pt;mso-line-height-rule:exactly;">&nbsp;</div>';

const buildIndividualReportSectionHtml = (
  record: TkaReportRecordInput,
  options: TkaReportExportOptions,
  addPageBreakAfter: boolean
): string => {
  const visibleRows = resolveStudentVisibleMapels(record, options.tkaQuestions);
  const weightPct = visibleRows.length > 0 ? Math.round(100 / visibleRows.length) : 0;
  const wali = options.getWaliKelas(record.kelas);
  const tanggalCetak = options.tanggalCetak || `Jakarta, ${formatTodayIndonesianDate()}`;

  const tableRowsHtml =
    visibleRows.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:#64748b;padding:12px;">Belum ada mata pelajaran yang memiliki tes pada paket TKA ini.</td></tr>`
      : visibleRows
          .map(
            (row, idx) => `
          <tr>
            <td style="text-align:center;padding:6px 8px;">${idx + 1}</td>
            <td style="padding:6px 8px;font-weight:bold;">${escapeHtml(row.label)}</td>
            <td style="text-align:center;padding:6px 8px;">${weightPct}%</td>
            <td style="text-align:center;padding:6px 8px;font-weight:bold;color:#581c87;">${row.score}</td>
            <td style="text-align:center;padding:6px 8px;font-weight:bold;">${predFromScore(row.score)}</td>
            <td style="padding:6px 8px;font-size:9.5pt;color:#334155;">${escapeHtml(row.desc)}</td>
          </tr>`
          )
          .join('');

  const kopHtml = buildWordKopSuratHtml(
    options,
    'LAPORAN HASIL TES KEMAMPUAN AKADEMIK (TKA)',
    `Tahun Pelajaran ${escapeHtml(options.tahunPelajaran)} • Paket: ${escapeHtml(record.paket || options.paketLabel)}`
  );

  return `
  <div style="${addPageBreakAfter ? 'page-break-after:always;' : ''}">
    ${kopHtml}

    <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:14px;" border="1" cellpadding="6">
      <tr>
        <td style="width:20%;background:#f8fafc;"><strong>Nama Lengkap</strong></td>
        <td style="width:32%;font-weight:bold;">${escapeHtml(record.nama)}</td>
        <td style="width:20%;background:#f8fafc;"><strong>Kelas / Rombel</strong></td>
        <td style="width:28%;font-weight:bold;">${escapeHtml(record.kelas)}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;"><strong>NISN</strong></td>
        <td>${escapeHtml(record.nisn || '-')}</td>
        <td style="background:#f8fafc;"><strong>Paket Ujian</strong></td>
        <td>${escapeHtml(record.paket || options.paketLabel)}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;"><strong>Peringkat</strong></td>
        <td>${record.rank ? `Peringkat #${record.rank}` : '-'}</td>
        <td style="background:#f8fafc;"><strong>Tanggal Ujian</strong></td>
        <td>${escapeHtml(record.tanggalUjian || '-')}</td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:14px;" border="1" cellpadding="6">
      <thead>
        <tr style="background:#6b21a8;color:#ffffff;">
          <th style="width:36px;text-align:center;">No</th>
          <th style="text-align:left;">Mata Pelajaran yang Diuji</th>
          <th style="width:60px;text-align:center;">Bobot</th>
          <th style="width:85px;text-align:center;">Nilai</th>
          <th style="width:65px;text-align:center;">Predikat</th>
          <th style="text-align:left;">Deskripsi Capaian Kompetensi</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
        <tr style="background:#f3e8ff;font-weight:bold;">
          <td colspan="3" style="text-align:right;padding:8px;">RATA-RATA NILAI AKHIR KOMPOSIT TKA</td>
          <td style="text-align:center;font-size:12pt;color:#581c87;padding:8px;">${record.skorTotal}</td>
          <td style="text-align:center;color:#581c87;padding:8px;">${escapeHtml(record.predikat)}</td>
          <td style="padding:8px;color:#065f46;">Status: ${escapeHtml(record.status)} (KKTP &ge; 75)</td>
        </tr>
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-top:20px;text-align:center;">
      <tr>
        <td style="width:33%;vertical-align:top;">
          <div>Mengetahui,<br/>Orang Tua / Wali Murid</div>
          ${WORD_SIGNATURE_SPACER}
          <div style="border-bottom:1px solid #0f172a;width:140px;margin:0 auto 3px auto;"></div>
          <div style="font-size:8.5pt;color:#64748b;">(Nama Terang Orang Tua)</div>
        </td>
        <td style="width:34%;vertical-align:top;">
          <div>Mengetahui,<br/>Kepala ${escapeHtml(options.schoolName)}</div>
          ${WORD_SIGNATURE_SPACER}
          <div style="font-weight:bold;text-decoration:underline;">${escapeHtml(options.kepsekNama)}</div>
          <div style="font-size:8.5pt;color:#475569;">${escapeHtml(options.kepsekNipLabel)}</div>
        </td>
        <td style="width:33%;vertical-align:top;">
          <div>${escapeHtml(tanggalCetak)}<br/>Wali Kelas ${escapeHtml(record.kelas)}</div>
          ${WORD_SIGNATURE_SPACER}
          <div style="font-weight:bold;text-decoration:underline;">${escapeHtml(wali.nama)}</div>
          <div style="font-size:8.5pt;color:#475569;">${escapeHtml(wali.nipLabel)}</div>
        </td>
      </tr>
    </table>
  </div>`;
};

const wrapWordHtml = (title: string, bodyHtml: string, landscape = false): string => `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${landscape ? 'A4 landscape' : 'A4 portrait'}; margin: 1.5cm; }
    body { font-family: "Times New Roman", Times, serif; font-size: 10.5pt; color: #0f172a; line-height: 1.4; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

export const exportIndividualTkaReportToWord = (
  record: TkaReportRecordInput,
  options: TkaReportExportOptions
): boolean => {
  if (!record) return false;
  const body = buildIndividualReportSectionHtml(record, options, false);
  const docHtml = wrapWordHtml(`Report TKA - ${record.nama}`, body, false);
  const fileName = `Report_TKA_Individu_${sanitizeFilenamePart(record.nama)}_${sanitizeFilenamePart(record.kelas)}_${sanitizeFilenamePart(record.paket || options.paketLabel)}.doc`;
  triggerWordDownload(docHtml, fileName);
  return true;
};

export const exportClassTkaReportToWord = (
  records: TkaReportRecordInput[],
  classLabel: string,
  options: TkaReportExportOptions,
  mode: 'rekap' | 'rapor_bundel' = 'rekap'
): boolean => {
  if (!records || records.length === 0) return false;

  if (mode === 'rapor_bundel') {
    const pagesHtml = records
      .map((rec, idx) =>
        buildIndividualReportSectionHtml(rec, options, idx < records.length - 1)
      )
      .join('\n');
    const docHtml = wrapWordHtml(`Bundel Rapor TKA - ${classLabel}`, pagesHtml, false);
    const fileName = `Bundel_Rapor_TKA_${sanitizeFilenamePart(classLabel)}_${sanitizeFilenamePart(options.paketLabel)}.doc`;
    triggerWordDownload(docHtml, fileName);
    return true;
  }

  const totalPeserta = records.length;
  const avgTotal = (records.reduce((acc, r) => acc + r.skorTotal, 0) / totalPeserta).toFixed(2);
  const maxScore = Math.max(...records.map((r) => r.skorTotal));
  const minScore = Math.min(...records.map((r) => r.skorTotal));
  const tuntasCount = records.filter((r) => r.status === 'Tuntas').length;
  const tuntasPct = Math.round((tuntasCount / totalPeserta) * 100);

  const isSingleSpecificClass =
    classLabel !== 'Semua Kelas 6' && !classLabel.toLowerCase().includes('semua');
  const wali = isSingleSpecificClass ? options.getWaliKelas(classLabel) : null;
  const tanggalCetak = options.tanggalCetak || `Jakarta, ${formatTodayIndonesianDate()}`;

  const mapelHeadersHtml = options.activeTestedMapels
    .map((m) => `<th style="text-align:center;padding:5px;">${escapeHtml(m.shortHeader)}</th>`)
    .join('');

  const rowsHtml = records
    .map((r, idx) => {
      const mapelCellsHtml = options.activeTestedMapels
        .map((def) => {
          const val = getStudentScoreForMapel(r, def.key, def.field);
          return `<td style="text-align:center;padding:5px;">${val !== null ? val : '-'}</td>`;
        })
        .join('');

      return `<tr>
        <td style="text-align:center;padding:5px;">${idx + 1}</td>
        <td style="text-align:center;padding:5px;font-weight:bold;">#${r.rank ?? idx + 1}</td>
        <td style="padding:5px;">${escapeHtml(r.nisn || '-')}</td>
        <td style="padding:5px;font-weight:bold;">${escapeHtml(r.nama)}</td>
        <td style="text-align:center;padding:5px;">${escapeHtml(r.kelas)}</td>
        ${mapelCellsHtml}
        <td style="text-align:center;padding:5px;font-weight:bold;color:#581c87;">${r.skorTotal}</td>
        <td style="text-align:center;padding:5px;font-weight:bold;">${escapeHtml(r.predikat)}</td>
        <td style="text-align:center;padding:5px;">${escapeHtml(r.status)}</td>
      </tr>`;
    })
    .join('');

  const signatureHtml = wali
    ? `<table style="width:100%;border-collapse:collapse;font-size:10pt;margin-top:24px;text-align:center;">
        <tr>
          <td style="width:50%;vertical-align:top;">
            <div>Mengetahui,<br/>Kepala ${escapeHtml(options.schoolName)}</div>
            ${WORD_SIGNATURE_SPACER}
            <div style="font-weight:bold;text-decoration:underline;">${escapeHtml(options.kepsekNama)}</div>
            <div style="font-size:8.5pt;color:#475569;">${escapeHtml(options.kepsekNipLabel)}</div>
          </td>
          <td style="width:50%;vertical-align:top;">
            <div>${escapeHtml(tanggalCetak)}<br/>Wali Kelas ${escapeHtml(classLabel)}</div>
            ${WORD_SIGNATURE_SPACER}
            <div style="font-weight:bold;text-decoration:underline;">${escapeHtml(wali.nama)}</div>
            <div style="font-size:8.5pt;color:#475569;">${escapeHtml(wali.nipLabel)}</div>
          </td>
        </tr>
      </table>`
    : `<table style="width:100%;border-collapse:collapse;font-size:10pt;margin-top:24px;text-align:center;">
        <tr>
          <td style="width:55%;"></td>
          <td style="width:45%;vertical-align:top;">
            <div>${escapeHtml(tanggalCetak)}<br/>Kepala ${escapeHtml(options.schoolName)}</div>
            ${WORD_SIGNATURE_SPACER}
            <div style="font-weight:bold;text-decoration:underline;">${escapeHtml(options.kepsekNama)}</div>
            <div style="font-size:8.5pt;color:#475569;">${escapeHtml(options.kepsekNipLabel)}</div>
          </td>
        </tr>
      </table>`;

  const kopHtml = buildWordKopSuratHtml(
    options,
    'REKAPITULASI LAPORAN HASIL TES KEMAMPUAN AKADEMIK (TKA)',
    `Kelas: <strong>${escapeHtml(classLabel)}</strong> • Paket: <strong>${escapeHtml(options.paketLabel)}</strong> • Tahun Pelajaran ${escapeHtml(options.tahunPelajaran)}`
  );

  const bodyHtml = `
    ${kopHtml}

    <table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:12px;" border="1" cellpadding="5">
      <tr style="background:#f8fafc;">
        <td><strong>Total Peserta:</strong> ${totalPeserta} Siswa</td>
        <td><strong>Rata-rata Kelas:</strong> ${avgTotal}</td>
        <td><strong>Tertinggi / Terendah:</strong> ${maxScore} / ${minScore}</td>
        <td><strong>Ketuntasan (KKTP 75):</strong> ${tuntasCount} Siswa (${tuntasPct}%)</td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:9pt;" border="1" cellpadding="4">
      <thead>
        <tr style="background:#6b21a8;color:#ffffff;">
          <th style="width:28px;text-align:center;padding:5px;">No</th>
          <th style="width:42px;text-align:center;padding:5px;">Rank</th>
          <th style="width:85px;text-align:left;padding:5px;">NISN</th>
          <th style="text-align:left;padding:5px;">Nama Siswa</th>
          <th style="width:65px;text-align:center;padding:5px;">Kelas</th>
          ${mapelHeadersHtml}
          <th style="width:60px;text-align:center;padding:5px;">Skor Akhir</th>
          <th style="width:52px;text-align:center;padding:5px;">Predikat</th>
          <th style="width:62px;text-align:center;padding:5px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    ${signatureHtml}
  `;

  const docHtml = wrapWordHtml(`Rekap Report TKA - ${classLabel}`, bodyHtml, true);
  const fileName = `Rekap_Report_TKA_${sanitizeFilenamePart(classLabel)}_${sanitizeFilenamePart(options.paketLabel)}.doc`;
  triggerWordDownload(docHtml, fileName);
  return true;
};

// =========================================================================
// PDF EXPORT HELPERS (jsPDF + jspdf-autotable)
// =========================================================================

const drawPdfKopSurat = (
  doc: jsPDF,
  options: TkaReportExportOptions,
  leftLogoData: string | null,
  rightLogoData: string | null,
  title: string,
  subtitle: string
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  if (leftLogoData) {
    try {
      doc.addImage(leftLogoData, 'PNG', margin, 10, 16, 16);
    } catch {
      // ignore invalid image
    }
  }
  if (rightLogoData) {
    try {
      doc.addImage(rightLogoData, 'PNG', pageWidth - margin - 16, 10, 16, 16);
    } catch {
      // ignore invalid image
    }
  }

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PEMERINTAH PROVINSI DKI JAKARTA • DINAS PENDIDIKAN', pageWidth / 2, 13.5, {
    align: 'center',
  });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text((options.schoolName || 'SDN RAWA BADAK UTARA 21').toUpperCase(), pageWidth / 2, 19, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const addrLine = [options.schoolAddress, options.schoolNpsn ? `NPSN: ${options.schoolNpsn}` : '']
    .filter(Boolean)
    .join(' • ');
  if (addrLine) {
    doc.text(addrLine, pageWidth / 2, 23.5, { align: 'center' });
  }

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.7);
  doc.line(margin, 27.5, pageWidth - margin, 27.5);
  doc.setLineWidth(0.25);
  doc.line(margin, 28.5, pageWidth - margin, 28.5);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, pageWidth / 2, 34.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(51, 65, 85);
  doc.text(subtitle, pageWidth / 2, 39.5, { align: 'center' });

  return 44;
};

const renderIndividualTkaPdfPage = (
  doc: jsPDF,
  record: TkaReportRecordInput,
  options: TkaReportExportOptions,
  leftLogoData: string | null,
  rightLogoData: string | null
) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  let y = drawPdfKopSurat(
    doc,
    options,
    leftLogoData,
    rightLogoData,
    'LAPORAN HASIL TES KEMAMPUAN AKADEMIK (TKA)',
    `Tahun Pelajaran ${options.tahunPelajaran} • Paket: ${record.paket || options.paketLabel}`
  );

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [15, 23, 42] },
    body: [
      ['Nama Lengkap', record.nama, 'Kelas / Rombel', record.kelas],
      ['NISN', record.nisn || '-', 'Paket Ujian', record.paket || options.paketLabel],
      [
        'Peringkat',
        record.rank ? `Peringkat #${record.rank}` : '-',
        'Tanggal Ujian',
        record.tanggalUjian || '-',
      ],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 32 },
      1: { fontStyle: 'bold', cellWidth: 58 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 32 },
      3: { fontStyle: 'bold' },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 22) + 5;

  const visibleRows = resolveStudentVisibleMapels(record, options.tkaQuestions);
  const weightPct = visibleRows.length > 0 ? Math.round(100 / visibleRows.length) : 0;

  const bodyRows =
    visibleRows.length === 0
      ? [['-', 'Belum ada mata pelajaran yang memiliki tes pada paket ini.', '-', '-', '-', '-']]
      : visibleRows.map((row, idx) => [
          String(idx + 1),
          row.label,
          `${weightPct}%`,
          String(row.score),
          predFromScore(row.score),
          row.desc,
        ]);

  bodyRows.push([
    '',
    'RATA-RATA NILAI AKHIR KOMPOSIT TKA',
    '100%',
    String(record.skorTotal),
    record.predikat,
    `Status: ${record.status} (KKTP >= 75)`,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [107, 33, 168], textColor: 255, fontStyle: 'bold', fontSize: 8.8 },
    styles: { fontSize: 8.6, cellPadding: 2.5, textColor: [15, 23, 42], valign: 'middle' },
    head: [['No', 'Mata Pelajaran yang Diuji', 'Bobot', 'Nilai', 'Pred.', 'Deskripsi Capaian Kompetensi']],
    body: bodyRows,
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { fontStyle: 'bold', cellWidth: 50 },
      2: { halign: 'center', cellWidth: 15 },
      3: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
      4: { halign: 'center', fontStyle: 'bold', cellWidth: 15 },
      5: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.row.index === bodyRows.length - 1 && data.section === 'body') {
        data.cell.styles.fillColor = [243, 232, 255];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 40) + 10;
  // Ensure signature block + 4 cm gap fits on page
  if (y + 56 > pageHeight - 10) {
    doc.addPage();
    y = 20;
  }

  const wali = options.getWaliKelas(record.kelas);
  const tanggalCetak = options.tanggalCetak || `Jakarta, ${formatTodayIndonesianDate()}`;
  const colW = (pageWidth - margin * 2) / 3;
  const cx1 = margin + colW * 0.5;
  const cx2 = margin + colW * 1.5;
  const cx3 = margin + colW * 2.5;

  doc.setFontSize(8.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  doc.text('Mengetahui,', cx1, y, { align: 'center' });
  doc.text('Orang Tua / Wali Murid', cx1, y + 4.2, { align: 'center' });

  doc.text('Mengetahui,', cx2, y, { align: 'center' });
  doc.text(`Kepala ${options.schoolName}`, cx2, y + 4.2, { align: 'center' });

  doc.text(tanggalCetak, cx3, y, { align: 'center' });
  doc.text(`Wali Kelas ${record.kelas}`, cx3, y + 4.2, { align: 'center' });

  // Exact 4 cm (40 mm) vertical signature spacer
  const sigY = y + 4.2 + 40;

  doc.setDrawColor(15, 23, 42);
  doc.line(cx1 - 20, sigY, cx1 + 20, sigY);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('(Nama Terang Orang Tua)', cx1, sigY + 4, { align: 'center' });

  doc.setFontSize(8.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(options.kepsekNama, cx2, sigY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(options.kepsekNipLabel, cx2, sigY + 4, { align: 'center' });

  doc.setFontSize(8.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(wali.nama, cx3, sigY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(wali.nipLabel, cx3, sigY + 4, { align: 'center' });
};

export const exportIndividualTkaReportToPdf = async (
  record: TkaReportRecordInput,
  options: TkaReportExportOptions
): Promise<boolean> => {
  if (!record) return false;
  const [leftLogoData, rightLogoData] = await Promise.all([
    loadImageDataUrlForPdf(options.logoKemendikbudUrl),
    loadImageDataUrlForPdf(options.logoSekolahUrl),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  renderIndividualTkaPdfPage(doc, record, options, leftLogoData, rightLogoData);
  const fileName = `Report_TKA_Individu_${sanitizeFilenamePart(record.nama)}_${sanitizeFilenamePart(record.kelas)}_${sanitizeFilenamePart(record.paket || options.paketLabel)}.pdf`;
  doc.save(fileName);
  return true;
};

export const exportClassTkaReportToPdf = async (
  records: TkaReportRecordInput[],
  classLabel: string,
  options: TkaReportExportOptions,
  mode: 'rekap' | 'rapor_bundel' = 'rekap'
): Promise<boolean> => {
  if (!records || records.length === 0) return false;

  const [leftLogoData, rightLogoData] = await Promise.all([
    loadImageDataUrlForPdf(options.logoKemendikbudUrl),
    loadImageDataUrlForPdf(options.logoSekolahUrl),
  ]);

  if (mode === 'rapor_bundel') {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    records.forEach((rec, idx) => {
      if (idx > 0) doc.addPage();
      renderIndividualTkaPdfPage(doc, rec, options, leftLogoData, rightLogoData);
    });
    const fileName = `Bundel_Rapor_TKA_${sanitizeFilenamePart(classLabel)}_${sanitizeFilenamePart(options.paketLabel)}.pdf`;
    doc.save(fileName);
    return true;
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  let y = drawPdfKopSurat(
    doc,
    options,
    leftLogoData,
    rightLogoData,
    'REKAPITULASI LAPORAN HASIL TES KEMAMPUAN AKADEMIK (TKA)',
    `Kelas: ${classLabel} • Paket: ${options.paketLabel} • Tahun Pelajaran ${options.tahunPelajaran}`
  );

  const totalPeserta = records.length;
  const avgTotal = (records.reduce((acc, r) => acc + r.skorTotal, 0) / totalPeserta).toFixed(2);
  const maxScore = Math.max(...records.map((r) => r.skorTotal));
  const minScore = Math.min(...records.map((r) => r.skorTotal));
  const tuntasCount = records.filter((r) => r.status === 'Tuntas').length;
  const tuntasPct = Math.round((tuntasCount / totalPeserta) * 100);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2, fillColor: [248, 250, 252], textColor: [15, 23, 42] },
    body: [
      [
        `Total Peserta: ${totalPeserta} Siswa`,
        `Rata-rata Kelas: ${avgTotal}`,
        `Tertinggi / Terendah: ${maxScore} / ${minScore}`,
        `Ketuntasan (KKTP 75): ${tuntasCount} Siswa (${tuntasPct}%)`,
      ],
    ],
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 10) + 4;

  const head = [
    [
      'No',
      'Rank',
      'NISN',
      'Nama Siswa',
      'Kelas',
      ...options.activeTestedMapels.map((m) => m.shortHeader),
      'Skor Akhir',
      'Predikat',
      'Status',
    ],
  ];

  const body = records.map((r, idx) => [
    String(idx + 1),
    `#${r.rank ?? idx + 1}`,
    r.nisn || '-',
    r.nama,
    r.kelas,
    ...options.activeTestedMapels.map((def) => {
      const val = getStudentScoreForMapel(r, def.key, def.field);
      return val !== null ? String(val) : '-';
    }),
    String(r.skorTotal),
    r.predikat,
    r.status,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [107, 33, 168], textColor: 255, fontStyle: 'bold', fontSize: 8.2 },
    styles: { fontSize: 8, cellPadding: 2, textColor: [15, 23, 42], valign: 'middle' },
    head,
    body,
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 13 },
      2: { cellWidth: 24 },
      3: { fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 20 },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 30) + 8;
  if (y + 56 > pageHeight - 10) {
    doc.addPage();
    y = 20;
  }

  const isSingleSpecificClass =
    classLabel !== 'Semua Kelas 6' && !classLabel.toLowerCase().includes('semua');
  const wali = isSingleSpecificClass ? options.getWaliKelas(classLabel) : null;
  const tanggalCetak = options.tanggalCetak || `Jakarta, ${formatTodayIndonesianDate()}`;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  if (wali) {
    const cx1 = pageWidth * 0.25;
    const cx2 = pageWidth * 0.75;
    doc.text('Mengetahui,', cx1, y, { align: 'center' });
    doc.text(`Kepala ${options.schoolName}`, cx1, y + 4.5, { align: 'center' });

    doc.text(tanggalCetak, cx2, y, { align: 'center' });
    doc.text(`Wali Kelas ${classLabel}`, cx2, y + 4.5, { align: 'center' });

    // Exact 4 cm vertical spacer
    const sigY = y + 4.5 + 40;
    doc.setFont('helvetica', 'bold');
    doc.text(options.kepsekNama, cx1, sigY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(options.kepsekNipLabel, cx1, sigY + 4, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(wali.nama, cx2, sigY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(wali.nipLabel, cx2, sigY + 4, { align: 'center' });
  } else {
    const cx = pageWidth * 0.75;
    doc.text(tanggalCetak, cx, y, { align: 'center' });
    doc.text(`Kepala ${options.schoolName}`, cx, y + 4.5, { align: 'center' });

    const sigY = y + 4.5 + 40;
    doc.setFont('helvetica', 'bold');
    doc.text(options.kepsekNama, cx, sigY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(options.kepsekNipLabel, cx, sigY + 4, { align: 'center' });
  }

  const fileName = `Rekap_Report_TKA_${sanitizeFilenamePart(classLabel)}_${sanitizeFilenamePart(options.paketLabel)}.pdf`;
  doc.save(fileName);
  return true;
};
