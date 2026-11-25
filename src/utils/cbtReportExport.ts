import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatTodayIndonesianDate,
  loadImageDataUrlForPdf,
  resolveAbsoluteAssetUrl,
} from './pdfImageHelper';

export interface CbtReportRecordInput {
  id: string;
  nama: string;
  nisn: string;
  kelas: string;
  mapel: string;
  paket: string;
  judul: string;
  nilai: number;
  predikat: string;
  status: 'Tuntas' | 'Remedial';
  tanggal: string;
  waktuSelesai: string;
}

export interface CbtReportExportOptions {
  schoolName: string;
  schoolAddress?: string;
  schoolNpsn?: string;
  logoKemendikbudUrl?: string;
  logoSekolahUrl?: string;
  tahunPelajaran: string;
  semester: string;
  kelasLabel?: string;
  filterSummary: string;
  kepsekNama: string;
  kepsekNipLabel: string;
  waliKelasLabel?: string;
  waliNama?: string;
  waliNipLabel?: string;
  tanggalCetak?: string;
}

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

const WORD_SIGNATURE_SPACER =
  '<div style="height:4cm;min-height:4cm;line-height:4cm;font-size:1pt;mso-line-height-rule:exactly;">&nbsp;</div>';

const buildCbtWordKopHtml = (
  options: CbtReportExportOptions,
  docTitle: string,
  subtitle: string
): string => {
  const leftLogo = resolveAbsoluteAssetUrl(options.logoKemendikbudUrl);
  const rightLogo = resolveAbsoluteAssetUrl(options.logoSekolahUrl);
  const leftImg = leftLogo
    ? `<img src="${escapeHtml(leftLogo)}" width="64" height="64" style="width:64px;height:64px;object-fit:contain;" alt="Logo Dinas" />`
    : '&nbsp;';
  const rightImg = rightLogo
    ? `<img src="${escapeHtml(rightLogo)}" width="64" height="64" style="width:64px;height:64px;object-fit:contain;" alt="Logo Sekolah" />`
    : '&nbsp;';

  return `
  <table style="width:100%;border-collapse:collapse;border-bottom:3px double #0f172a;margin-bottom:14px;">
    <tr>
      <td style="width:76px;text-align:center;vertical-align:middle;padding-bottom:8px;">${leftImg}</td>
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
      <td style="width:76px;text-align:center;vertical-align:middle;padding-bottom:8px;">${rightImg}</td>
    </tr>
  </table>
  <div style="text-align:center;margin-bottom:12px;">
    <div style="font-size:12pt;font-weight:bold;text-transform:uppercase;color:#0f172a;">
      ${escapeHtml(docTitle)}
    </div>
    <div style="font-size:9.5pt;color:#334155;margin-top:2px;">
      ${subtitle}
    </div>
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

export const exportIndividualCbtReportToWord = (
  record: CbtReportRecordInput,
  options: CbtReportExportOptions
): boolean => {
  if (!record) return false;
  const tanggalCetak = options.tanggalCetak || `Jakarta, ${formatTodayIndonesianDate()}`;
  const kopHtml = buildCbtWordKopHtml(
    options,
    'LEMBAR HASIL UJIAN BERBASIS KOMPUTER (CBT)',
    `Tahun Pelajaran ${escapeHtml(options.tahunPelajaran)} (${escapeHtml(options.semester)}) • Paket: ${escapeHtml(record.paket)}`
  );

  const body = `
    ${kopHtml}
    <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:14px;" border="1" cellpadding="6">
      <tr>
        <td style="width:22%;background:#f8fafc;"><strong>Nama Lengkap</strong></td>
        <td style="width:30%;font-weight:bold;">${escapeHtml(record.nama)}</td>
        <td style="width:20%;background:#f8fafc;"><strong>Kelas / Rombel</strong></td>
        <td style="width:28%;font-weight:bold;">${escapeHtml(record.kelas)}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;"><strong>NISN</strong></td>
        <td>${escapeHtml(record.nisn || '-')}</td>
        <td style="background:#f8fafc;"><strong>Waktu Selesai</strong></td>
        <td>${escapeHtml(record.tanggal)} • ${escapeHtml(record.waktuSelesai)}</td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:14px;" border="1" cellpadding="6">
      <thead>
        <tr style="background:#047857;color:#ffffff;">
          <th style="text-align:left;">Mata Pelajaran</th>
          <th style="text-align:left;">Judul / Paket Asesmen</th>
          <th style="width:75px;text-align:center;">Nilai</th>
          <th style="width:65px;text-align:center;">Predikat</th>
          <th style="width:90px;text-align:center;">Ketuntasan</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight:bold;">${escapeHtml(record.mapel)}</td>
          <td>${escapeHtml(record.judul)}</td>
          <td style="text-align:center;font-weight:bold;font-size:12pt;color:#065f46;">${record.nilai}</td>
          <td style="text-align:center;font-weight:bold;">${escapeHtml(record.predikat)}</td>
          <td style="text-align:center;font-weight:bold;color:${record.status === 'Tuntas' ? '#047857' : '#be123c'};">${escapeHtml(record.status)}</td>
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
          <div>${escapeHtml(tanggalCetak)}<br/>${escapeHtml(options.waliKelasLabel || `Wali Kelas ${record.kelas}`)}</div>
          ${WORD_SIGNATURE_SPACER}
          <div style="font-weight:bold;text-decoration:underline;">${escapeHtml(options.waliNama || 'Guru / Wali Kelas')}</div>
          <div style="font-size:8.5pt;color:#475569;">${escapeHtml(options.waliNipLabel || 'NIP. -')}</div>
        </td>
      </tr>
    </table>
  `;

  const docHtml = wrapWordHtml(`Rapor CBT - ${record.nama}`, body, false);
  const fileName = `Rapor_CBT_${sanitizeFilenamePart(record.nama)}_${sanitizeFilenamePart(record.kelas)}_${sanitizeFilenamePart(record.mapel)}.doc`;
  triggerWordDownload(docHtml, fileName);
  return true;
};

export const exportClassCbtReportToWord = (
  records: CbtReportRecordInput[],
  options: CbtReportExportOptions
): boolean => {
  if (!records || records.length === 0) return false;

  const total = records.length;
  const avg = (records.reduce((acc, r) => acc + r.nilai, 0) / total).toFixed(1);
  const maxVal = Math.max(...records.map((r) => r.nilai));
  const minVal = Math.min(...records.map((r) => r.nilai));
  const tuntasCount = records.filter((r) => r.status === 'Tuntas').length;
  const tuntasPct = Math.round((tuntasCount / total) * 100);
  const tanggalCetak = options.tanggalCetak || `Jakarta, ${formatTodayIndonesianDate()}`;

  const kopHtml = buildCbtWordKopHtml(
    options,
    'LAPORAN REKAPITULASI HASIL UJIAN BERBASIS KOMPUTER (CBT)',
    `${escapeHtml(options.filterSummary)} • Tahun Pelajaran ${escapeHtml(options.tahunPelajaran)} (${escapeHtml(options.semester)})`
  );

  const rowsHtml = records
    .map(
      (r, idx) => `
      <tr>
        <td style="text-align:center;padding:5px;">${idx + 1}</td>
        <td style="padding:5px;">${escapeHtml(r.nisn)}</td>
        <td style="padding:5px;font-weight:bold;">${escapeHtml(r.nama)}</td>
        <td style="text-align:center;padding:5px;">${escapeHtml(r.kelas)}</td>
        <td style="padding:5px;">${escapeHtml(r.mapel)}</td>
        <td style="padding:5px;">${escapeHtml(r.paket)}</td>
        <td style="text-align:center;padding:5px;font-weight:bold;color:#065f46;">${r.nilai}</td>
        <td style="text-align:center;padding:5px;font-weight:bold;">${escapeHtml(r.predikat)}</td>
        <td style="text-align:center;padding:5px;">${escapeHtml(r.status)}</td>
      </tr>`
    )
    .join('');

  const body = `
    ${kopHtml}
    <table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:12px;" border="1" cellpadding="5">
      <tr style="background:#f8fafc;">
        <td><strong>Total Pengerjaan:</strong> ${total} Sesi</td>
        <td><strong>Rata-rata Nilai:</strong> ${avg}</td>
        <td><strong>Tertinggi / Terendah:</strong> ${maxVal} / ${minVal}</td>
        <td><strong>Ketuntasan (KKTP 75):</strong> ${tuntasCount} (${tuntasPct}%)</td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:9pt;" border="1" cellpadding="4">
      <thead>
        <tr style="background:#047857;color:#ffffff;">
          <th style="width:28px;text-align:center;">No</th>
          <th style="width:82px;text-align:left;">NISN</th>
          <th style="text-align:left;">Nama Siswa</th>
          <th style="width:65px;text-align:center;">Kelas</th>
          <th style="text-align:left;">Mata Pelajaran</th>
          <th style="text-align:left;">Paket Ujian</th>
          <th style="width:52px;text-align:center;">Nilai</th>
          <th style="width:52px;text-align:center;">Predikat</th>
          <th style="width:62px;text-align:center;">Status</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-top:24px;text-align:center;">
      <tr>
        <td style="width:50%;vertical-align:top;">
          <div>Mengetahui,<br/>Kepala ${escapeHtml(options.schoolName)}</div>
          ${WORD_SIGNATURE_SPACER}
          <div style="font-weight:bold;text-decoration:underline;">${escapeHtml(options.kepsekNama)}</div>
          <div style="font-size:8.5pt;color:#475569;">${escapeHtml(options.kepsekNipLabel)}</div>
        </td>
        <td style="width:50%;vertical-align:top;">
          <div>${escapeHtml(tanggalCetak)}<br/>${escapeHtml(options.waliKelasLabel || 'Wali Kelas / Guru Mapel')}</div>
          ${WORD_SIGNATURE_SPACER}
          <div style="font-weight:bold;text-decoration:underline;">${escapeHtml(options.waliNama || 'Guru Mata Pelajaran')}</div>
          <div style="font-size:8.5pt;color:#475569;">${escapeHtml(options.waliNipLabel || 'NIP. -')}</div>
        </td>
      </tr>
    </table>
    <div style="margin-top:18px;padding-top:6px;border-top:1px solid #cbd5e1;text-align:center;font-size:8pt;color:#64748b;">
      Dokumen Resmi SERBU 21 (Sistem Edukasi, Rapor, dan Basis Data Utama) • ${escapeHtml(options.schoolName)}
    </div>
  `;

  const docHtml = wrapWordHtml('Rekap Report CBT', body, true);
  const kelasPart = options.kelasLabel ? `_${sanitizeFilenamePart(options.kelasLabel)}` : '';
  const fileName = `Report_Hasil_CBT_${sanitizeFilenamePart(options.semester)}${kelasPart}.doc`;
  triggerWordDownload(docHtml, fileName);
  return true;
};

const drawCbtPdfKop = (
  doc: jsPDF,
  options: CbtReportExportOptions,
  leftLogo: string | null,
  rightLogo: string | null,
  title: string,
  subtitle: string
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  if (leftLogo) {
    try {
      doc.addImage(leftLogo, 'PNG', margin, 10, 16, 16);
    } catch {
      // ignore
    }
  }
  if (rightLogo) {
    try {
      doc.addImage(rightLogo, 'PNG', pageWidth - margin - 16, 10, 16, 16);
    } catch {
      // ignore
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

export const exportIndividualCbtReportToPdf = async (
  record: CbtReportRecordInput,
  options: CbtReportExportOptions
): Promise<boolean> => {
  if (!record) return false;
  const [leftLogo, rightLogo] = await Promise.all([
    loadImageDataUrlForPdf(options.logoKemendikbudUrl),
    loadImageDataUrlForPdf(options.logoSekolahUrl),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  let y = drawCbtPdfKop(
    doc,
    options,
    leftLogo,
    rightLogo,
    'LEMBAR HASIL UJIAN BERBASIS KOMPUTER (CBT)',
    `Tahun Pelajaran ${options.tahunPelajaran} (${options.semester}) • Paket: ${record.paket}`
  );

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [15, 23, 42] },
    body: [
      ['Nama Lengkap', record.nama, 'Kelas / Rombel', record.kelas],
      ['NISN', record.nisn || '-', 'Waktu Selesai', `${record.tanggal} • ${record.waktuSelesai}`],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 32 },
      1: { fontStyle: 'bold', cellWidth: 58 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 32 },
      3: { fontStyle: 'bold' },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 18) + 6;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [4, 120, 87], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3, textColor: [15, 23, 42] },
    head: [['Mata Pelajaran', 'Judul / Paket Asesmen', 'Nilai Akhir', 'Predikat', 'Ketuntasan']],
    body: [[record.mapel, record.judul, String(record.nilai), record.predikat, record.status]],
    columnStyles: {
      0: { fontStyle: 'bold' },
      2: { halign: 'center', fontStyle: 'bold', cellWidth: 22 },
      3: { halign: 'center', fontStyle: 'bold', cellWidth: 20 },
      4: { halign: 'center', fontStyle: 'bold', cellWidth: 26 },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 20) + 12;
  if (y + 56 > pageHeight - 10) {
    doc.addPage();
    y = 20;
  }

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
  doc.text(options.waliKelasLabel || `Wali Kelas ${record.kelas}`, cx3, y + 4.2, { align: 'center' });

  const sigY = y + 4.2 + 40;
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
  doc.text(options.kepsekNipLabel, cx2, sigY + 4, { align: 'center' });

  doc.setFontSize(8.8);
  doc.setFont('helvetica', 'bold');
  doc.text(options.waliNama || 'Guru / Wali Kelas', cx3, sigY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(options.waliNipLabel || 'NIP. -', cx3, sigY + 4, { align: 'center' });

  doc.save(`Rapor_CBT_${sanitizeFilenamePart(record.nama)}_${sanitizeFilenamePart(record.mapel)}.pdf`);
  return true;
};

export const exportClassCbtReportToPdf = async (
  records: CbtReportRecordInput[],
  options: CbtReportExportOptions
): Promise<boolean> => {
  if (!records || records.length === 0) return false;
  const [leftLogo, rightLogo] = await Promise.all([
    loadImageDataUrlForPdf(options.logoKemendikbudUrl),
    loadImageDataUrlForPdf(options.logoSekolahUrl),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  let y = drawCbtPdfKop(
    doc,
    options,
    leftLogo,
    rightLogo,
    'LAPORAN REKAPITULASI HASIL UJIAN BERBASIS KOMPUTER (CBT)',
    `${options.filterSummary} • Tahun Pelajaran ${options.tahunPelajaran} (${options.semester})`
  );

  const total = records.length;
  const avg = (records.reduce((acc, r) => acc + r.nilai, 0) / total).toFixed(1);
  const maxVal = Math.max(...records.map((r) => r.nilai));
  const minVal = Math.min(...records.map((r) => r.nilai));
  const tuntasCount = records.filter((r) => r.status === 'Tuntas').length;
  const tuntasPct = Math.round((tuntasCount / total) * 100);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2, fillColor: [248, 250, 252], textColor: [15, 23, 42] },
    body: [
      [
        `Total Pengerjaan: ${total} Sesi`,
        `Rata-rata Nilai: ${avg}`,
        `Tertinggi / Terendah: ${maxVal} / ${minVal}`,
        `Ketuntasan (KKTP 75): ${tuntasCount} (${tuntasPct}%)`,
      ],
    ],
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 10) + 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [4, 120, 87], textColor: 255, fontStyle: 'bold', fontSize: 8.2 },
    styles: { fontSize: 8, cellPadding: 2, textColor: [15, 23, 42], valign: 'middle' },
    head: [['No', 'NISN', 'Nama Siswa', 'Kelas', 'Mata Pelajaran', 'Paket Ujian', 'Nilai', 'Predikat', 'Status']],
    body: records.map((r, idx) => [
      String(idx + 1),
      r.nisn,
      r.nama,
      r.kelas,
      r.mapel,
      r.paket,
      String(r.nilai),
      r.predikat,
      r.status,
    ]),
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 24 },
      2: { fontStyle: 'bold' },
      3: { halign: 'center', cellWidth: 20 },
      6: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
      7: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
      8: { halign: 'center', cellWidth: 22 },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 30) + 8;
  if (y + 56 > pageHeight - 10) {
    doc.addPage();
    y = 20;
  }

  const tanggalCetak = options.tanggalCetak || `Jakarta, ${formatTodayIndonesianDate()}`;
  const cx1 = pageWidth * 0.25;
  const cx2 = pageWidth * 0.75;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text('Mengetahui,', cx1, y, { align: 'center' });
  doc.text(`Kepala ${options.schoolName}`, cx1, y + 4.5, { align: 'center' });

  doc.text(tanggalCetak, cx2, y, { align: 'center' });
  doc.text(options.waliKelasLabel || 'Wali Kelas / Guru Mapel', cx2, y + 4.5, { align: 'center' });

  const sigY = y + 4.5 + 40;
  doc.setFont('helvetica', 'bold');
  doc.text(options.kepsekNama, cx1, sigY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(options.kepsekNipLabel, cx1, sigY + 4, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(options.waliNama || 'Guru Mata Pelajaran', cx2, sigY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(options.waliNipLabel || 'NIP. -', cx2, sigY + 4, { align: 'center' });

  doc.setFontSize(7.2);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Dokumen Resmi SERBU 21 (Sistem Edukasi, Rapor, dan Basis Data Utama) • ${options.schoolName}`,
    pageWidth / 2,
    pageHeight - 6,
    { align: 'center' }
  );

  const kelasPart = options.kelasLabel ? `_${sanitizeFilenamePart(options.kelasLabel)}` : '';
  doc.save(`Report_Hasil_CBT_${sanitizeFilenamePart(options.semester)}${kelasPart}.pdf`);
  return true;
};
