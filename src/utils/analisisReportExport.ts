import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SchoolProfile } from '../types';
import {
  formatTodayIndonesianDate,
  loadImageDataUrlForPdf,
} from './pdfImageHelper';

export interface AnalisisQuestionPdfRow {
  no: number;
  pertanyaan: string;
  subLabel?: string; // e.g., tipe / mapel+paket
  tipe: string;
  bobot?: number;
  tkLabel: string;
  tkValue: number;
  dpValue: number;
  dpLabel: string;
  ketuntasanPct: number;
  pengecoh?: string;
  status: string;
}

export interface AnalisisStudentPdfRow {
  no: number;
  nama: string;
  nisn: string;
  kategori: string;
  nilai: number;
  isTuntas: boolean;
  rekomendasi: string;
}

export interface CbtAnalisisPdfOptions {
  profile?: SchoolProfile;
  mapel: string;
  paket: string;
  kelas: string;
  tahunPelajaran: string;
  semester: string;
  kktp?: number;
  questions: AnalisisQuestionPdfRow[];
  students: AnalisisStudentPdfRow[];
  kepsekNama: string;
  kepsekNipLabel: string;
  waliNama: string;
  waliNipLabel: string;
}

export interface TkaAnalisisPdfOptions {
  profile?: SchoolProfile;
  paketLabel: string;
  mapelLabel: string;
  tahunPelajaran: string;
  semester: string;
  totalPeserta: number;
  targetSiswaKelas6: number;
  questions: AnalisisQuestionPdfRow[];
  kepsekNama: string;
  kepsekNipLabel: string;
}

const sanitizeFilename = (val: string): string =>
  (val || 'Laporan')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Laporan';

const drawKopHeader = (
  doc: jsPDF,
  profile: SchoolProfile | undefined,
  leftLogo: string | null,
  rightLogo: string | null,
  reportTitle: string,
  subtitle: string,
  accentRgb: [number, number, number]
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Top decorative accent bar
  doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.rect(0, 0, pageWidth, 3.5, 'F');

  if (leftLogo) {
    try {
      doc.addImage(leftLogo, 'PNG', margin, 8, 16, 16);
    } catch {
      // ignore logo error
    }
  }
  if (rightLogo) {
    try {
      doc.addImage(rightLogo, 'PNG', pageWidth - margin - 16, 8, 16, 16);
    } catch {
      // ignore logo error
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'PEMERINTAH PROVINSI DKI JAKARTA • DINAS PENDIDIKAN',
    pageWidth / 2,
    11.5,
    { align: 'center' }
  );

  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(
    (profile?.name || 'SDN RAWA BADAK UTARA 21').toUpperCase(),
    pageWidth / 2,
    17,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const addrLine = [
    profile?.alamat || 'Jl. Rawa Badak Utara, Kec. Koja, Jakarta Utara',
    profile?.npsn ? `NPSN: ${profile.npsn}` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  doc.text(addrLine, pageWidth / 2, 21.5, { align: 'center' });

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(margin, 26, pageWidth - margin, 26);
  doc.setLineWidth(0.2);
  doc.line(margin, 27, pageWidth - margin, 27);

  // Clean Executive Title Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, 30, pageWidth - margin * 2, 15, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.text(reportTitle, pageWidth / 2, 36.2, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  doc.setTextColor(51, 65, 85);
  doc.text(subtitle, pageWidth / 2, 41.5, { align: 'center' });

  return 49;
};

const drawKpiSummaryCards = (
  doc: jsPDF,
  startY: number,
  cards: Array<{
    label: string;
    value: string;
    subtext: string;
    bgRgb: [number, number, number];
    borderRgb: [number, number, number];
    accentRgb: [number, number, number];
  }>
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const gap = 3.5;
  const totalWidth = pageWidth - margin * 2;
  const cardWidth = (totalWidth - gap * (cards.length - 1)) / cards.length;
  const cardHeight = 20;

  cards.forEach((card, idx) => {
    const x = margin + idx * (cardWidth + gap);
    doc.setFillColor(card.bgRgb[0], card.bgRgb[1], card.bgRgb[2]);
    doc.setDrawColor(card.borderRgb[0], card.borderRgb[1], card.borderRgb[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(card.label.toUpperCase(), x + 3, startY + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(card.accentRgb[0], card.accentRgb[1], card.accentRgb[2]);
    doc.text(card.value, x + 3, startY + 12.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(card.subtext, x + 3, startY + 17.2, { maxWidth: cardWidth - 6 });
  });

  return startY + cardHeight + 5;
};

const drawDifficultyDistributionBar = (
  doc: jsPDF,
  startY: number,
  mudah: number,
  sedang: number,
  sukar: number,
  total: number,
  avgKetuntasan: number,
  kktp: number
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const boxW = pageWidth - margin * 2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, startY, boxW, 21, 2, 2, 'FD');

  const safeTotal = Math.max(1, total);
  const mudahPct = Math.round((mudah / safeTotal) * 100);
  const sedangPct = Math.round((sedang / safeTotal) * 100);
  const sukarPct = Math.max(0, 100 - mudahPct - sedangPct);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text('Proporsi Tingkat Kesukaran & Rata-rata Ketuntasan', margin + 4, startY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Mudah: ${mudah} (${mudahPct}%)   •   Sedang: ${sedang} (${sedangPct}%)   •   Sukar: ${sukar} (${sukarPct}%)   |   Ketuntasan: ${avgKetuntasan}% (Target ${kktp}%)`,
    margin + 4,
    startY + 10.5
  );

  // Stacked bar
  const barX = margin + 4;
  const barY = startY + 13.5;
  const barW = boxW - 8;
  const barH = 4;

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(barX, barY, barW, barH, 1.5, 1.5, 'F');

  if (total > 0) {
    let cursorX = barX;
    const wMudah = (mudah / safeTotal) * barW;
    const wSedang = (sedang / safeTotal) * barW;
    const wSukar = Math.max(0, barW - wMudah - wSedang);

    if (wMudah > 0) {
      doc.setFillColor(16, 185, 129);
      doc.rect(cursorX, barY, wMudah, barH, 'F');
      cursorX += wMudah;
    }
    if (wSedang > 0) {
      doc.setFillColor(245, 158, 11);
      doc.rect(cursorX, barY, wSedang, barH, 'F');
      cursorX += wSedang;
    }
    if (wSukar > 0) {
      doc.setFillColor(244, 63, 94);
      doc.rect(cursorX, barY, wSukar, barH, 'F');
    }
  }

  return startY + 25;
};

export const exportCbtAnalisisToPdf = async (
  options: CbtAnalisisPdfOptions
): Promise<boolean> => {
  const [leftLogo, rightLogo] = await Promise.all([
    loadImageDataUrlForPdf(options.profile?.logoKemendikbudUrl),
    loadImageDataUrlForPdf(options.profile?.logoSekolahUrl),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const kktp = options.kktp ?? 75;

  let y = drawKopHeader(
    doc,
    options.profile,
    leftLogo,
    rightLogo,
    'LAPORAN ANALISIS BUTIR SOAL & KETUNTASAN ASESMEN CBT',
    `${options.mapel} • ${options.paket} • ${options.kelas} • TP ${options.tahunPelajaran} (${options.semester})`,
    [4, 120, 87]
  );

  const qCount = options.questions.length;
  const mudahCount = options.questions.filter((q) => q.tkLabel === 'Mudah').length;
  const sedangCount = options.questions.filter((q) => q.tkLabel === 'Sedang').length;
  const sukarCount = options.questions.filter((q) => q.tkLabel === 'Sukar').length;
  const validDpCount = options.questions.filter((q) => q.dpValue >= 0.3).length;
  const avgKetuntasan =
    qCount > 0
      ? Math.round(options.questions.reduce((acc, q) => acc + q.ketuntasanPct, 0) / qCount)
      : 0;

  y = drawKpiSummaryCards(doc, y, [
    {
      label: 'Total Butir Soal',
      value: `${qCount} Butir`,
      subtext: qCount > 0 ? 'Teranalisis lengkap' : 'Belum ada butir soal',
      bgRgb: [236, 253, 245],
      borderRgb: [167, 243, 208],
      accentRgb: [4, 120, 87],
    },
    {
      label: 'Rata-rata Ketuntasan',
      value: `${avgKetuntasan}%`,
      subtext: avgKetuntasan >= kktp ? `Memenuhi KKTP (${kktp}%)` : `Di bawah KKTP (${kktp}%)`,
      bgRgb: [240, 249, 255],
      borderRgb: [186, 230, 253],
      accentRgb: [3, 105, 161],
    },
    {
      label: 'Tingkat Kesukaran',
      value: `${mudahCount}M · ${sedangCount}S · ${sukarCount}Sk`,
      subtext: 'Mudah / Sedang / Sukar',
      bgRgb: [255, 251, 235],
      borderRgb: [253, 230, 138],
      accentRgb: [180, 83, 9],
    },
    {
      label: 'Daya Pembeda Valid',
      value: `${validDpCount}/${qCount}`,
      subtext: 'Soal dengan DP >= 0.30',
      bgRgb: [245, 243, 255],
      borderRgb: [221, 214, 254],
      accentRgb: [109, 40, 217],
    },
  ]);

  y = drawDifficultyDistributionBar(
    doc,
    y,
    mudahCount,
    sedangCount,
    sukarCount,
    qCount,
    avgKetuntasan,
    kktp
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('A. Rincian Analisis Butir Soal', margin, y);
  y += 2.5;

  const qBody =
    options.questions.length === 0
      ? [['-', 'Belum ada data butir soal untuk filter yang dipilih.', '-', '-', '-', '-', '-', '-']]
      : options.questions.map((q) => [
          String(q.no),
          q.pertanyaan,
          q.tipe,
          `${q.tkLabel} (${q.tkValue.toFixed(2)})`,
          `${q.dpValue.toFixed(2)} (${q.dpLabel})`,
          `${q.ketuntasanPct}%`,
          q.pengecoh || '-',
          q.status,
        ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [6, 95, 70], textColor: 255, fontSize: 7.8, fontStyle: 'bold' },
    styles: { fontSize: 7.4, cellPadding: 2, textColor: [15, 23, 42], valign: 'middle' },
    head: [['No', 'Pertanyaan Butir Soal', 'Tipe', 'TK', 'Daya Pembeda', 'Tuntas', 'Pengecoh', 'Status']],
    body: qBody,
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 52 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 24 },
      5: { halign: 'center', cellWidth: 13, fontStyle: 'bold' },
      6: { halign: 'center', cellWidth: 22 },
      7: { halign: 'center', cellWidth: 'auto', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 7) {
        const text = String(data.cell.raw || '');
        if (text.includes('Revisi')) {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fillColor = [254, 243, 199];
        } else if (text.includes('Valid') || text.includes('Siap')) {
          data.cell.styles.textColor = [4, 120, 87];
          data.cell.styles.fillColor = [209, 250, 229];
        }
      }
    },
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 30) + 7;

  if (options.students.length > 0) {
    if (y + 35 > pageHeight - 15) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('B. Rekapitulasi Capaian Peserta Didik', margin, y);
    y += 2.5;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.8, fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 2, textColor: [15, 23, 42], valign: 'middle' },
      head: [['No', 'Nama Peserta Didik', 'NISN', 'Kategori', 'Nilai', 'Ketuntasan', 'Rekomendasi Tindak Lanjut']],
      body: options.students.map((s) => [
        String(s.no),
        s.nama,
        s.nisn || '-',
        s.kategori,
        String(s.nilai),
        s.isTuntas ? 'Tuntas' : 'Belum Tuntas',
        s.rekomendasi,
      ]),
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { fontStyle: 'bold', cellWidth: 38 },
        2: { halign: 'center', cellWidth: 22 },
        3: { halign: 'center', cellWidth: 22 },
        4: { halign: 'center', cellWidth: 12, fontStyle: 'bold' },
        5: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
        6: { cellWidth: 'auto' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 5) {
          const text = String(data.cell.raw || '');
          if (text === 'Tuntas') {
            data.cell.styles.textColor = [4, 120, 87];
            data.cell.styles.fillColor = [209, 250, 229];
          } else {
            data.cell.styles.textColor = [190, 18, 60];
            data.cell.styles.fillColor = [255, 228, 230];
          }
        }
      },
    });

    y = ((doc as any).lastAutoTable?.finalY || y + 30) + 8;
  }

  // Signature block
  if (y + 42 > pageHeight - 10) {
    doc.addPage();
    y = 20;
  }

  const tanggal = `Jakarta, ${formatTodayIndonesianDate()}`;
  const leftX = margin + 40;
  const rightX = pageWidth - margin - 40;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Mengetahui,', leftX, y, { align: 'center' });
  doc.text(`Kepala ${options.profile?.name || 'SDN Rawa Badak Utara 21'}`, leftX, y + 4.2, { align: 'center' });

  doc.text(tanggal, rightX, y, { align: 'center' });
  doc.text(`Wali Kelas / Guru ${options.kelas}`, rightX, y + 4.2, { align: 'center' });

  const sigY = y + 26;
  doc.setFont('helvetica', 'bold');
  doc.text(options.kepsekNama, leftX, sigY, { align: 'center' });
  doc.text(options.waliNama || 'Guru Mata Pelajaran', rightX, sigY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  doc.text(options.kepsekNipLabel, leftX, sigY + 4, { align: 'center' });
  doc.text(options.waliNipLabel, rightX, sigY + 4, { align: 'center' });

  const fileName = `Laporan_Analisis_CBT_${sanitizeFilename(options.mapel)}_${sanitizeFilename(options.paket)}_${sanitizeFilename(options.kelas)}.pdf`;
  doc.save(fileName);
  return true;
};

export const exportTkaAnalisisToPdf = async (
  options: TkaAnalisisPdfOptions
): Promise<boolean> => {
  const [leftLogo, rightLogo] = await Promise.all([
    loadImageDataUrlForPdf(options.profile?.logoKemendikbudUrl),
    loadImageDataUrlForPdf(options.profile?.logoSekolahUrl),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  let y = drawKopHeader(
    doc,
    options.profile,
    leftLogo,
    rightLogo,
    'LAPORAN ANALISIS BUTIR SOAL & KETUNTASAN TKA',
    `Paket: ${options.paketLabel} • Mapel: ${options.mapelLabel} • TP ${options.tahunPelajaran} (${options.semester})`,
    [180, 83, 9]
  );

  const total = options.questions.length;
  const countMudah = options.questions.filter((q) => q.tkLabel === 'Mudah').length;
  const countSedang = options.questions.filter((q) => q.tkLabel === 'Sedang').length;
  const countSukar = options.questions.filter((q) => q.tkLabel === 'Sukar').length;
  const validDpCount = options.questions.filter((q) => q.dpValue >= 0.2).length;
  const avgPct =
    total > 0
      ? Math.round(options.questions.reduce((acc, q) => acc + q.ketuntasanPct, 0) / total)
      : 0;

  y = drawKpiSummaryCards(doc, y, [
    {
      label: 'Soal Teranalisis',
      value: `${total} Butir`,
      subtext: options.mapelLabel,
      bgRgb: [255, 251, 235],
      borderRgb: [253, 230, 138],
      accentRgb: [180, 83, 9],
    },
    {
      label: 'Rata-rata Ketuntasan',
      value: `${avgPct}%`,
      subtext: `${options.totalPeserta} dari ${options.targetSiswaKelas6} Siswa Kelas 6`,
      bgRgb: [236, 253, 245],
      borderRgb: [167, 243, 208],
      accentRgb: [4, 120, 87],
    },
    {
      label: 'Komposisi Kesukaran',
      value: `${countMudah}M · ${countSedang}S · ${countSukar}Sk`,
      subtext: 'Mudah / Sedang / Sukar',
      bgRgb: [240, 249, 255],
      borderRgb: [186, 230, 253],
      accentRgb: [3, 105, 161],
    },
    {
      label: 'Butir Soal Valid',
      value: `${validDpCount}/${total}`,
      subtext: 'Daya Pembeda >= 0.20',
      bgRgb: [245, 243, 255],
      borderRgb: [221, 214, 254],
      accentRgb: [109, 40, 217],
    },
  ]);

  y = drawDifficultyDistributionBar(
    doc,
    y,
    countMudah,
    countSedang,
    countSukar,
    total,
    avgPct,
    80
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Rincian Hasil Analisis Butir Soal TKA', margin, y);
  y += 2.5;

  const bodyRows =
    options.questions.length === 0
      ? [['-', 'Belum ada butir soal TKA untuk filter yang dipilih.', '-', '-', '-', '-', '-', '-']]
      : options.questions.map((q) => [
          String(q.no),
          q.pertanyaan,
          q.subLabel || '-',
          q.tipe.toUpperCase(),
          `${q.tkLabel} (${q.tkValue.toFixed(2)})`,
          `${q.dpValue.toFixed(2)} (${q.dpLabel})`,
          `${q.ketuntasanPct}%`,
          q.status,
        ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9], textColor: 255, fontSize: 7.8, fontStyle: 'bold' },
    styles: { fontSize: 7.4, cellPadding: 2, textColor: [15, 23, 42], valign: 'middle' },
    head: [['No', 'Butir Pertanyaan TKA', 'Paket · Mapel', 'Tipe', 'Kesukaran', 'Daya Pembeda', 'Tuntas', 'Status']],
    body: bodyRows,
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 50 },
      2: { cellWidth: 32 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'center', cellWidth: 21 },
      5: { halign: 'center', cellWidth: 23 },
      6: { halign: 'center', cellWidth: 13, fontStyle: 'bold' },
      7: { halign: 'center', cellWidth: 'auto', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 7) {
        const text = String(data.cell.raw || '');
        if (text.includes('Revisi')) {
          data.cell.styles.textColor = [190, 18, 60];
          data.cell.styles.fillColor = [255, 228, 230];
        } else if (text.includes('Valid')) {
          data.cell.styles.textColor = [4, 120, 87];
          data.cell.styles.fillColor = [209, 250, 229];
        }
      }
    },
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 30) + 10;
  if (y + 42 > pageHeight - 10) {
    doc.addPage();
    y = 20;
  }

  const tanggal = `Jakarta, ${formatTodayIndonesianDate()}`;
  const rightX = pageWidth - margin - 40;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(tanggal, rightX, y, { align: 'center' });
  doc.text(`Kepala ${options.profile?.name || 'SDN Rawa Badak Utara 21'}`, rightX, y + 4.2, { align: 'center' });

  const sigY = y + 26;
  doc.setFont('helvetica', 'bold');
  doc.text(options.kepsekNama, rightX, sigY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  doc.text(options.kepsekNipLabel, rightX, sigY + 4, { align: 'center' });

  const fileName = `Laporan_Analisis_TKA_${sanitizeFilename(options.paketLabel)}_${sanitizeFilename(options.mapelLabel)}.pdf`;
  doc.save(fileName);
  return true;
};

export interface DynamicMatrixPdfOptions {
  profile?: SchoolProfile;
  matrix: import('./analisisMatrixBuilder').DynamicItemMatrixData;
  kepsekNama: string;
  kepsekNipLabel: string;
  waliNama: string;
  waliNipLabel: string;
}

export const exportDynamicMatrixToPdf = async (
  options: DynamicMatrixPdfOptions
): Promise<boolean> => {
  const { matrix } = options;
  const [leftLogo, rightLogo] = await Promise.all([
    loadImageDataUrlForPdf(options.profile?.logoKemendikbudUrl),
    loadImageDataUrlForPdf(options.profile?.logoSekolahUrl),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  const accentRgb: [number, number, number] =
    matrix.examType === 'TKA' ? [180, 83, 9] : [4, 120, 87];

  let y = drawKopHeader(
    doc,
    options.profile,
    leftLogo,
    rightLogo,
    `MATRIKS ANALISIS BUTIR SOAL ${matrix.examType} PER MATA PELAJARAN`,
    `${matrix.mapelLabel} • ${matrix.paketLabel} • ${matrix.kelasLabel} • ${matrix.totalQuestions} Butir Soal • TP ${matrix.tahunPelajaran} (${matrix.semester})`,
    accentRgb
  );

  const fmtVal = (v: number | null | undefined): string => {
    if (v === null || v === undefined || !Number.isFinite(v)) return '-';
    return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
  };

  // Chunk wide question matrices cleanly into bands of max 22 columns per page
  const CHUNK_SIZE = 22;
  const totalCols = matrix.columns.length;
  const chunks: Array<{ startIdx: number; endIdx: number }> = [];
  if (totalCols === 0) {
    chunks.push({ startIdx: 0, endIdx: 0 });
  } else {
    for (let s = 0; s < totalCols; s += CHUNK_SIZE) {
      chunks.push({ startIdx: s, endIdx: Math.min(totalCols, s + CHUNK_SIZE) });
    }
  }

  chunks.forEach((chunk, chunkIdx) => {
    if (chunkIdx > 0) {
      doc.addPage();
      y = 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Lanjutan Matriks Butir Soal No. ${chunk.startIdx + 1} s.d. ${chunk.endIdx} — ${matrix.mapelLabel} (${matrix.paketLabel})`,
        margin,
        y
      );
      y += 4;
    }

    const sliceCols = matrix.columns.slice(chunk.startIdx, chunk.endIdx);
    const isLastChunk = chunkIdx === chunks.length - 1;

    // Build run-length grouped JENIS PENILAIAN header for this slice
    const sliceGroups: Array<{ label: string; colSpan: number }> = [];
    sliceCols.forEach((col) => {
      const last = sliceGroups[sliceGroups.length - 1];
      if (last && last.label === col.tipeLabel) {
        last.colSpan += 1;
      } else {
        sliceGroups.push({ label: col.tipeLabel, colSpan: 1 });
      }
    });

    const headRow1: any[] = [
      { content: 'NO', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } },
      { content: 'NAMA SISWA', rowSpan: 1, styles: { halign: 'left', valign: 'middle' } },
      { content: 'L/P', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } },
      ...sliceGroups.map((g) => ({
        content: g.label,
        colSpan: g.colSpan,
        styles: { halign: 'center', valign: 'middle' },
      })),
    ];

    if (isLastChunk) {
      headRow1.push(
        { content: 'JUMLAH', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'NILAI', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'RANK', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } }
      );
    }

    const headRow2: any[] = [
      { content: 'NO. SOAL', styles: { halign: 'right', fontStyle: 'bold' } },
      ...sliceCols.map((c) => ({
        content: String(c.no),
        styles: { halign: 'center', fontStyle: 'bold' },
      })),
    ];

    const headRow3: any[] = [
      { content: 'BOBOT', styles: { halign: 'right', fontStyle: 'bold' } },
      ...sliceCols.map((c) => ({
        content: String(c.bobot),
        styles: { halign: 'center' },
      })),
    ];
    if (isLastChunk) {
      headRow3.push(
        { content: fmtVal(matrix.totalBobotMaksimal), styles: { halign: 'center' } },
        { content: '100', styles: { halign: 'center' } }
      );
    }

    const bodyRows: any[][] = matrix.rows.map((row, rIdx) => {
      const base = [
        String(rIdx + 1),
        row.nama,
        row.jenisKelamin,
        ...sliceCols.map((col) => fmtVal(row.itemScores[col.no - 1])),
      ];
      if (isLastChunk) {
        base.push(fmtVal(row.jumlahSkor), fmtVal(row.nilaiAkhir), row.peringkat ? String(row.peringkat) : '-');
      }
      return base;
    });

    // Summary footer rows
    const makeSummaryRow = (
      label: string,
      vals: Array<number | null>,
      totalVal: string,
      nilaiVal: string
    ) => {
      const r: any[] = [
        '',
        label,
        '',
        ...sliceCols.map((col) => fmtVal(vals[col.no - 1])),
      ];
      if (isLastChunk) {
        r.push(totalVal, nilaiVal, '');
      }
      return r;
    };

    bodyRows.push(
      makeSummaryRow(
        'RATA-RATA',
        matrix.summary.itemAverages,
        fmtVal(matrix.summary.avgJumlah),
        fmtVal(matrix.summary.avgNilai)
      ),
      makeSummaryRow(
        'NILAI TERTINGGI',
        matrix.summary.itemMaxes,
        fmtVal(matrix.summary.maxJumlah),
        fmtVal(matrix.summary.maxNilai)
      ),
      makeSummaryRow(
        'NILAI TERENDAH',
        matrix.summary.itemMins,
        fmtVal(matrix.summary.minJumlah),
        fmtVal(matrix.summary.minNilai)
      ),
      makeSummaryRow(
        `KKM (${matrix.summary.kktp})`,
        matrix.columns.map(() => null),
        `${matrix.summary.tuntasCount}/${matrix.summary.pesertaWithScoreCount}`,
        `${matrix.summary.tuntasPct}%`
      )
    );

    const summaryStartRowIdx = matrix.rows.length;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: accentRgb,
        textColor: 255,
        fontSize: 6.8,
        fontStyle: 'bold',
        cellPadding: 1.3,
      },
      styles: {
        fontSize: 6.7,
        cellPadding: 1.2,
        textColor: [15, 23, 42],
        halign: 'center',
        valign: 'middle',
      },
      head: [headRow1, headRow2, headRow3],
      body: bodyRows,
      columnStyles: {
        0: { cellWidth: 7 },
        1: { halign: 'left', cellWidth: 42, fontStyle: 'bold' },
        2: { cellWidth: 7 },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.row.index >= summaryStartRowIdx) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
      },
    });

    y = ((doc as any).lastAutoTable?.finalY || y + 30) + 6;
  });

  // Distribution table + Signature
  if (y + 52 > pageHeight - 10) {
    doc.addPage();
    y = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Distribusi Rentang Nilai Siswa', margin, y);
  y += 2.5;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: pageWidth - margin - 120 },
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
    styles: { fontSize: 7.2, cellPadding: 1.5, halign: 'center' },
    head: [['Rentang Nilai', 'Jumlah Siswa', 'Persentase']],
    body: matrix.distribution.map((b) => [b.label, String(b.count), `${b.percentage}%`]),
  });

  const distEndY = (doc as any).lastAutoTable?.finalY || y + 40;
  const sigTopY = Math.max(y + 4, distEndY - 38);
  const sigLeftX = pageWidth - margin - 100;
  const sigRightX = pageWidth - margin - 32;
  const tanggal = `Jakarta, ${formatTodayIndonesianDate()}`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Mengetahui,', sigLeftX, sigTopY, { align: 'center' });
  doc.text(`Kepala ${options.profile?.name || 'SDN Rawa Badak Utara 21'}`, sigLeftX, sigTopY + 4, {
    align: 'center',
  });

  doc.text(tanggal, sigRightX, sigTopY, { align: 'center' });
  doc.text(`Guru / Wali ${matrix.kelasLabel}`, sigRightX, sigTopY + 4, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.text(options.kepsekNama, sigLeftX, sigTopY + 24, { align: 'center' });
  doc.text(options.waliNama || 'Guru Mata Pelajaran', sigRightX, sigTopY + 24, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text(options.kepsekNipLabel, sigLeftX, sigTopY + 28, { align: 'center' });
  doc.text(options.waliNipLabel, sigRightX, sigTopY + 28, { align: 'center' });

  const fileName = `Matriks_Analisis_${matrix.examType}_${sanitizeFilename(matrix.mapelLabel)}_${sanitizeFilename(matrix.paketLabel)}.pdf`;
  doc.save(fileName);
  return true;
};
