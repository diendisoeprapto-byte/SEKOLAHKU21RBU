export interface ChangelogVersionItem {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

/**
 * ============================================================================
 * ATURAN PERMANEN MANAJEMEN VERSI OTOMATIS (SEMANTIC VERSIONING) — SERBU 21
 * ============================================================================
 * 1. SUMBER KEBENARAN TUNGGAL:
 *    Array `CHANGELOG_DATA` di bawah ini adalah SUMBER KEBENARAN TUNGGAL seluruh versi
 *    aplikasi SERBU 21. Versi aktif aplikasi (`APP_VERSION`) otomatis mengambil
 *    nilai dari elemen teratas: `CHANGELOG_DATA[0].version`.
 *
 * 2. PETUNJUK BAGI AI / PENGEMBANG UNTUK SETIAP SESI PEMBARUAN BERIKUTNYA:
 *    - Naikkan angka PATCH (misal: v4.3.1 -> v4.3.2) untuk perbaikan bug, penyesuaian kode,
 *      atau perapihan tampilan kecil.
 *    - Naikkan angka MINOR (misal: v4.3.2 -> v4.4.0) untuk penambahan fitur baru.
 *    - Naikkan angka MAJOR (misal: v4.4.0 -> v5.0.0) untuk perombakan arsitektur besar.
 *    - Perbarui tanggal rilis sesuai tanggal pembaruan kode dibuat.
 *    - SETIAP KALI MENGHASILKAN KODE BARU DI MASA MENDATANG:
 *      WAJIB menambahkan entri baru di urutan PALING ATAS ([0]) array `CHANGELOG_DATA`
 *      yang merangkum poin-poin perubahan dalam bahasa Indonesia yang jelas, ringkas,
 *      dan mudah dipahami oleh pengguna.
 * ============================================================================
 */

export const CHANGELOG_DATA: ChangelogVersionItem[] = [
  {
    version: 'v4.4.0',
    date: '26 November 2026',
    title: 'Pelacakan Lokasi Live Realtime & Jadwal Sholat Presisi',
    highlights: [
      'Implementasi sistem pelacakan lokasi live realtime berbasis sensor GPS perangkat presisi tinggi yang memantau pergerakan posisi pengguna secara dinamis.',
      'Dukungan multi-tier IP Geolocation & reverse geocoding otomatis (Kelurahan, Kecamatan, Kota, Provinsi) saat GPS terbatas peramban/iframe.',
      'Penambahan widget indikator Lokasi Live & Jadwal Sholat di bilah atas (Header) aplikasi dengan modal detail koordinat, tautan Google Maps, serta kalkulasi waktu sholat 5 waktu akurat.',
    ],
  },
  {
    version: 'v4.3.3',
    date: '26 November 2026',
    title: 'Penyederhanaan Tampilan Badge Versi & Catatan Pembaruan',
    highlights: [
      'Penyederhanaan tampilan teks nomor versi pada footer menjadi "Versi 4.3.3" agar lebih ringkas, bersih, dan proporsional.',
      'Fungsi interaktif tetap aktif sepenuhnya di mana pengguna dapat mengklik badge versi kapan saja untuk membuka modal Catatan Pembaruan (Changelog).',
    ],
  },
  {
    version: 'v4.3.2',
    date: '26 November 2026',
    title: 'Standardisasi Otomatis Kode Kompetensi TKA Menjadi KOM',
    highlights: [
      'Pembaruan dan standardisasi kode Kompetensi TKA otomatis dari awalan "CP-" menjadi "KOM-" (Kompetensi) di seluruh menu Kompetensi TKA, pembuatan butir soal, dan penyimpanan data.',
      'Sistem otomatisasi nomor versi berbasis Semantic Versioning terhubung langsung dengan sumber kebenaran tunggal CHANGELOG_DATA[0].version.',
      'Penyempurnaan tampilan modal Catatan Pembaruan (Changelog) dengan garis vertikal timeline interaktif, tombol tutup Esc, dan akses mudah di seluruh halaman.',
    ],
  },
  {
    version: 'v4.3.1',
    date: '26 November 2026',
    title: 'Migrasi & Pembaruan Kode Sub Kompetensi TKA Menjadi SK',
    highlights: [
      'Pembaruan penamaan kode pada sub kompetensi TKA secara menyeluruh (termasuk migrasi otomatis data penyimpanan lokal) yang sebelumnya menggunakan awalan "TP-" kini diubah menjadi "SK-" (Sub Kompetensi).',
      'Penyempurnaan dukungan unggah gambar dengan metode Drag & Drop dan Salin-Tempel (Copy-Paste) di semua modul aplikasi (Login background, logo sekolah, foto siswa/guru, stiker realistis SARAH, dan butir soal CBT/TKA).',
    ],
  },
  {
    version: 'v4.2.0',
    date: '26 November 2026',
    title: 'Optimalisasi Matriks TKA & Sistem Info Versi',
    highlights: [
      'Perbaikan tata letak tabel Matriks Analisis Butir Soal TKA agar kolom nomor soal proporsional dan teks indikator tidak memanjang ke bawah secara berlebihan.',
      'Penambahan tampilan nomor versi dinamis di footer halaman Login serta modal Catatan Pembaruan (Changelog).',
    ],
  },
  {
    version: 'v4.1.0',
    date: '25 November 2026',
    title: 'Bank Media Ajar, Kustomisasi Login & Keamanan Admin',
    highlights: [
      'Integrasi fitur Bank Media Ajar (repositori PPT hybrid Google Drive & Firestore dengan filter jenjang kelas).',
      'Penambahan fitur unggah dan pengaturan foto latar layar Login kustom langsung dari panel Admin.',
      'Penambahan fitur Backup dan Reset data terpusat pada akun Admin serta proteksi keamanan anti-iklan dan malware.',
    ],
  },
  {
    version: 'v4.0.0',
    date: '19 November 2026',
    title: 'Arsitektur Multi-Tenant SaaS & Dasbor Super Admin',
    highlights: [
      'Pembaruan struktur database Firebase Firestore menjadi isolasi multi-sekolah berbasis NPSN (schools/{npsn}).',
      'Penambahan portal registrasi sekolah baru, branding dinamis per sekolah, dan dasbor pengelolaan Super Admin.',
    ],
  },
  {
    version: 'v3.0.0',
    date: '23 November 2026',
    title: 'Peluncuran Asisten AI SARAH & Stiker Ekspresi',
    highlights: [
      'Integrasi asisten virtual SARAH (Sistem Asisten Adaptif, Ramah, Amanah & Humanis) berbasis mesin Gemini yang ringan, responsif, dan berwawasan luas.',
      'Fitur Guru: Pembuatan soal CBT otomatis, Modul Ajar, dan RPP berbasis konteks kurikulum.',
      'Fitur Siswa: Pendamping belajar dengan metode Sokratik (membimbing tanpa memberi jawaban instan), pengingat waktu salat sesuai lokasi, serta pustaka 56 stiker ekspresi guru dan siswa.',
    ],
  },
  {
    version: 'v2.0.0',
    date: '24 November 2026',
    title: 'Ekosistem Ujian CBT/TKA Skala Besar & Analitik Skor',
    highlights: [
      'Implementasi Mode Fokus Ujian yang menyembunyikan sidebar navigasi selama siswa mengerjakan soal.',
      'Sistem Anti-Gagal Simpan: Auto-save lokal (localStorage), mekanisme auto-retry, dan penguncian layar tunggu (read-back verification) hingga skor terkonfirmasi tersimpan di Firestore.',
      'Sistem Peringkat & Tie-Breaker otomatis (Nilai Akhir, jumlah benar soal Sulit/HOTS, dan durasi tercepat dalam detik), penguncian nilai percobaan TKA pertama, pemetaan Kompetensi/Sub-Kompetensi, serta grafik analitik terpisah untuk TKA dan CBT.',
    ],
  },
  {
    version: 'v1.0.0',
    date: '11 November 2026',
    title: 'Fondasi Awal & Transformasi Identitas SERBU 21',
    highlights: [
      'Perubahan nama dan identitas aplikasi dari SEKOLAHKU menjadi SERBU 21 (Sistem Edukasi, Rapor, dan Basis Data Utama 21).',
      'Peluncuran modul inti: Presensi QR Code & cetak kartu barcode siswa, e-Rapor, jurnal 7 Kebiasaan Anak Indonesia Hebat, serta Perpustakaan Digital buku BSE dengan paginasi.',
    ],
  },
];

// Alias untuk kompatibilitas kode yang sudah ada
export const CHANGELOG_LIST = CHANGELOG_DATA;

// SUMBER KEBENARAN TUNGGAL DINAMIS BERDASARKAN ELEMEN TERATAS CHANGELOG_DATA:
export const CURRENT_CHANGELOG_ITEM = CHANGELOG_DATA[0];
export const APP_VERSION = CHANGELOG_DATA[0]?.version || 'v4.3.3';
export const RELEASE_DATE = CHANGELOG_DATA[0]?.date || '26 November 2026';
export const RELEASE_DATE_SHORT = RELEASE_DATE.replace('November', 'Nov').replace('Desember', 'Des');
export const APP_VERSION_NUMBER = APP_VERSION.replace(/^v/i, '');
export const APP_VERSION_FOOTER_TEXT = `Versi ${APP_VERSION_NUMBER}`;
export const APP_VERSION_TOOLTIP = 'Klik untuk melihat catatan pembaruan aplikasi SERBU 21';

export const APP_VERSION_STORAGE_KEY = 'serbu21_app_version';

// Prefix cache UI/AI sementara yang aman dibersihkan saat pergantian versi aplikasi.
// DILARANG keras menghapus pending submissions, exam drafts, data siswa/guru, atau hasil ujian lokal.
const SAFE_STALE_CACHE_PREFIXES = [
  'serbu21_sarah_ai_cache_',
  'sekolahku_ui_cache_',
];

export function checkAndBumpAppVersionCache(): {
  upgraded: boolean;
  previousVersion: string | null;
  currentVersion: string;
} {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { upgraded: false, previousVersion: null, currentVersion: APP_VERSION };
  }

  try {
    const previousVersion = window.localStorage.getItem(APP_VERSION_STORAGE_KEY);
    if (previousVersion === APP_VERSION) {
      return { upgraded: false, previousVersion, currentVersion: APP_VERSION };
    }

    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (SAFE_STALE_CACHE_PREFIXES.some((prefix) => k.startsWith(prefix))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {
        // Ignore individual key errors
      }
    });

    window.localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION);
    return {
      upgraded: true,
      previousVersion,
      currentVersion: APP_VERSION,
    };
  } catch {
    return { upgraded: false, previousVersion: null, currentVersion: APP_VERSION };
  }
}
