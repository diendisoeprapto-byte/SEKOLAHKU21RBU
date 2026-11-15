import { PerpustakaanBook, PerpustakaanKategori, PerpustakaanKelas } from '../types';

export const KATEGORI_OPTIONS: PerpustakaanKategori[] = [
  'Buku Pelajaran',
  'Buku Cerita/Literasi',
  'Modul Ajar Guru',
  'Buku Referensi',
];

export const KELAS_OPTIONS: PerpustakaanKelas[] = ['Semua', '1', '2', '3', '4', '5', '6'];

export const OFFICIAL_LIBRARY_PORTALS = [
  {
    name: 'SIBI Kemendikdasmen',
    subtitle: 'Buku Teks Resmi Kurikulum Merdeka',
    url: 'https://buku.kemendikdasmen.go.id/',
    accent: 'border-sky-200 hover:border-sky-400 text-sky-900 bg-sky-50/60',
  },
  {
    name: 'Budi Badan Bahasa',
    subtitle: 'Buku Bacaan Literasi Bermutu',
    url: 'https://budikemdikbud.id/',
    accent: 'border-amber-200 hover:border-amber-400 text-amber-900 bg-amber-50/60',
  },
  {
    name: "Let's Read Asia",
    subtitle: 'Cerita Anak Bergambar Gratis',
    url: 'https://www.letsreadasia.org',
    accent: 'border-emerald-200 hover:border-emerald-400 text-emerald-900 bg-emerald-50/60',
  },
  {
    name: 'Literacy Cloud',
    subtitle: 'Pustaka Cerita Anak Room to Read',
    url: 'https://literacycloud.org',
    accent: 'border-rose-200 hover:border-rose-400 text-rose-900 bg-rose-50/60',
  },
];

export const SEED_LIBRARY_BOOKS: Omit<PerpustakaanBook, 'id' | 'dibaca_count' | 'createdAt'>[] = [
  {
    judul: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK) untuk SD/MI Kelas VI',
    penulis: 'Simamora, Berton & Kemendikbudristek',
    kategori: 'Buku Pelajaran',
    kelas: '6',
    cover_url: 'https://static.buku.kemdikbud.go.id/content/thumbnail/Cover_Kelas_6_PJOK_BG.png',
    file_url: 'https://static.buku.kemdikbud.go.id/content/pdf/bukuteks/kurikulum21/PJOK-BG-KLS-VI.pdf',
    sumber: 'SIBI Kemendikdasmen',
  },
  {
    judul: 'Bahasa Indonesia: Anak-Anak yang Mengubah Dunia untuk SD/MI Kelas VI',
    penulis: 'Ade Kumalasari & Latifah',
    kategori: 'Buku Pelajaran',
    kelas: '6',
    cover_url: 'https://static.buku.kemdikbud.go.id/content/thumbnail/Cover_Kelas_6_B_Indonesia_BS.png',
    file_url: 'https://static.buku.kemdikbud.go.id/content/pdf/bukuteks/kurikulum21/Bahasa-Indonesia-BS-KLS-VI.pdf',
    sumber: 'SIBI Kemendikdasmen',
  },
  {
    judul: 'Matematika untuk SD/MI Kelas V Kurikulum Merdeka',
    penulis: 'Meita Fitrianawati, Ika Surtiani & Afit Istiandaru',
    kategori: 'Buku Pelajaran',
    kelas: '5',
    cover_url: 'https://static.buku.kemdikbud.go.id/content/thumbnail/Cover_Kelas_5_Matematika_BS.png',
    file_url: 'https://static.buku.kemdikbud.go.id/content/pdf/bukuteks/kurikulum21/Matematika-BS-KLS-V.pdf',
    sumber: 'SIBI Kemendikdasmen',
  },
  {
    judul: 'Ilmu Pengetahuan Alam dan Sosial (IPAS) untuk SD Kelas IV',
    penulis: 'Amalia Fitri Ghaniem dkk.',
    kategori: 'Buku Pelajaran',
    kelas: '4',
    cover_url: 'https://static.buku.kemdikbud.go.id/content/thumbnail/Cover_Kelas_4_IPAS_BS.png',
    file_url: 'https://static.buku.kemdikbud.go.id/content/pdf/bukuteks/kurikulum21/IPAS-BS-KLS-IV.pdf',
    sumber: 'SIBI Kemendikdasmen',
  },
  {
    judul: 'Kumpulan Cerita Anak Nusantara: Sahabat Penjaga Sungai & Hutan Bakau',
    penulis: 'Badan Pengembangan dan Pembinaan Bahasa',
    kategori: 'Buku Cerita/Literasi',
    kelas: 'Semua',
    cover_url: '',
    file_url: 'https://budikemdikbud.id/',
    sumber: 'Budi Badan Bahasa',
  },
  {
    judul: 'Panduan Modul Ajar Koding & Kecerdasan Artifisial (KKA) Fase C SD',
    penulis: 'Tim Pengembang Kurikulum SDN Rawa Badak Utara 21',
    kategori: 'Modul Ajar Guru',
    kelas: '6',
    cover_url: '',
    file_url: 'https://buku.kemendikdasmen.go.id/',
    sumber: 'SIBI Kemendikdasmen',
  },
];

export const TEMPLATE_PERPUSTAKAAN_CSV = [
  'judul;penulis;kategori;kelas;sumber;cover_url;file_url',
  'Bahasa Indonesia Kelas VI Kurikulum Merdeka;Ade Kumalasari & Latifah;Buku Pelajaran;6;SIBI Kemendikdasmen;https://static.buku.kemdikbud.go.id/content/thumbnail/Cover_Kelas_6_B_Indonesia_BS.png;https://static.buku.kemdikbud.go.id/content/pdf/bukuteks/kurikulum21/Bahasa-Indonesia-BS-KLS-VI.pdf',
  'Matematika Kelas V Kurikulum Merdeka;Meita Fitrianawati dkk.;Buku Pelajaran;5;SIBI Kemendikdasmen;https://static.buku.kemdikbud.go.id/content/thumbnail/Cover_Kelas_5_Matematika_BS.png;https://static.buku.kemdikbud.go.id/content/pdf/bukuteks/kurikulum21/Matematika-BS-KLS-V.pdf',
].join('\n');

/**
 * Mengonversi URL Google Drive (/view atau /edit atau ?id=) menjadi /preview
 * agar PDF / dokumen dapat langsung dibaca dalam iframe reader.
 */
export function convertToEmbedUrl(rawUrl: string): string {
  const url = (rawUrl || '').trim();
  if (!url) return '';

  // Pola 1: https://drive.google.com/file/d/<ID>/view... atau /edit...
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveFileMatch?.[1]) {
    return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;
  }

  // Pola 2: https://drive.google.com/open?id=<ID> atau uc?id=<ID>
  const driveIdMatch = url.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
  if (driveIdMatch?.[1]) {
    return `https://drive.google.com/file/d/${driveIdMatch[1]}/preview`;
  }

  // Pola 3: Google Docs / Sheets / Slides -> /preview
  if (/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/[a-zA-Z0-9_-]+/i.test(url)) {
    return url.replace(/\/(edit|view)(\?.*)?(#.*)?$/i, '/preview');
  }

  // Fallback umum: akhiran /view atau /edit pada link Google
  if (/drive\.google\.com|docs\.google\.com/i.test(url)) {
    return url.replace(/\/(view|edit)(\?.*)?(#.*)?$/i, '/preview');
  }

  return url;
}

export interface LiteracyBadgeInfo {
  label: string;
  minCount: number;
  nextLabel?: string;
  nextTarget?: number;
  badgeStyle: string;
}

export function getLiteracyBadge(count: number): LiteracyBadgeInfo {
  if (count >= 30) {
    return {
      label: 'Duta Literasi Sekolah',
      minCount: 30,
      badgeStyle: 'text-amber-800 bg-amber-50 border-amber-300',
    };
  }
  if (count >= 15) {
    return {
      label: 'Bintang Literasi',
      minCount: 15,
      nextLabel: 'Duta Literasi Sekolah',
      nextTarget: 30,
      badgeStyle: 'text-indigo-800 bg-indigo-50 border-indigo-200',
    };
  }
  if (count >= 5) {
    return {
      label: 'Sahabat Buku',
      minCount: 5,
      nextLabel: 'Bintang Literasi',
      nextTarget: 15,
      badgeStyle: 'text-emerald-800 bg-emerald-50 border-emerald-200',
    };
  }
  if (count >= 1) {
    return {
      label: 'Pemula Literasi',
      minCount: 1,
      nextLabel: 'Sahabat Buku',
      nextTarget: 5,
      badgeStyle: 'text-sky-800 bg-sky-50 border-sky-200',
    };
  }
  return {
    label: 'Belum Membaca',
    minCount: 0,
    nextLabel: 'Pemula Literasi',
    nextTarget: 1,
    badgeStyle: 'text-slate-600 bg-slate-100 border-slate-200',
  };
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeKategori(raw: string): PerpustakaanKategori {
  const low = (raw || '').toLowerCase();
  if (low.includes('cerita') || low.includes('literasi')) return 'Buku Cerita/Literasi';
  if (low.includes('modul') || low.includes('ajar')) return 'Modul Ajar Guru';
  if (low.includes('referensi') || low.includes('kamus') || low.includes('ensiklopedia')) return 'Buku Referensi';
  return 'Buku Pelajaran';
}

function normalizeKelas(raw: string): PerpustakaanKelas {
  const cleaned = (raw || '').replace(/kelas/gi, '').trim();
  if (['1', '2', '3', '4', '5', '6'].includes(cleaned)) {
    return cleaned as PerpustakaanKelas;
  }
  return 'Semua';
}

export interface ParsedCsvResult {
  delimiter: ';' | ',';
  validBooks: Omit<PerpustakaanBook, 'id' | 'dibaca_count' | 'createdAt'>[];
  skippedRows: number;
}

export function parseLibraryCsv(csvText: string): ParsedCsvResult {
  const cleaned = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { delimiter: ';', validBooks: [], skippedRows: 0 };
  }

  const headerLine = lines[0];
  const semiCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const delimiter: ';' | ',' = semiCount >= commaCount ? ';' : ',';

  const headers = splitCsvLine(headerLine, delimiter).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const idxOf = (names: string[]) => headers.findIndex((h) => names.some((n) => h === n || h.includes(n)));

  const idxJudul = idxOf(['judul']);
  const idxPenulis = idxOf(['penulis', 'pengarang', 'author']);
  const idxKategori = idxOf(['kategori', 'category']);
  const idxKelas = idxOf(['kelas', 'tingkat']);
  const idxSumber = idxOf(['sumber', 'source']);
  const idxCover = idxOf(['cover_url', 'cover', 'sampul']);
  const idxFile = idxOf(['file_url', 'file', 'url', 'link']);

  const validBooks: Omit<PerpustakaanBook, 'id' | 'dibaca_count' | 'createdAt'>[] = [];
  let skippedRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    const judul = (idxJudul >= 0 ? cols[idxJudul] : cols[0]) || '';
    const penulis = (idxPenulis >= 0 ? cols[idxPenulis] : cols[1]) || 'Tim Penulis';
    const kategoriRaw = (idxKategori >= 0 ? cols[idxKategori] : cols[2]) || 'Buku Pelajaran';
    const kelasRaw = (idxKelas >= 0 ? cols[idxKelas] : cols[3]) || 'Semua';
    const sumber = (idxSumber >= 0 ? cols[idxSumber] : cols[4]) || 'Perpustakaan Digital';
    const cover_url = (idxCover >= 0 ? cols[idxCover] : cols[5]) || '';
    const file_url = (idxFile >= 0 ? cols[idxFile] : cols[6]) || '';

    if (!judul.trim() || !file_url.trim()) {
      skippedRows++;
      continue;
    }

    validBooks.push({
      judul: judul.trim().slice(0, 240),
      penulis: penulis.trim().slice(0, 160),
      kategori: normalizeKategori(kategoriRaw),
      kelas: normalizeKelas(kelasRaw),
      sumber: sumber.trim().slice(0, 120) || 'Perpustakaan Digital',
      cover_url: cover_url.trim(),
      file_url: file_url.trim(),
    });
  }

  return { delimiter, validBooks, skippedRows };
}
