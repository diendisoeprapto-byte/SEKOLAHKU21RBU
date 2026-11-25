export interface ChangelogVersionItem {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

/**
 * ============================================================================
 * ATURAN PERMANEN MANAJEMEN VERSI OTOMATIS (SEMANTIC VERSIONING):
 * ============================================================================
 * 1. Sumber kebenaran tunggal versi aktif saat ini adalah CHANGELOG_LIST[0].version (v4.2.0).
 * 2. Instruksi bagi AI/Developer untuk sesi pembaruan berikutnya:
 *    - Naikkan angka PATCH (misal: v4.2.0 -> v4.2.1) untuk perbaikan bug atau penyesuaian kecil.
 *    - Naikkan angka MINOR (misal: v4.2.1 -> v4.3.0) untuk penambahan fitur baru.
 *    - Naikkan angka MAJOR (misal: v4.3.0 -> v5.0.0) untuk perubahan arsitektur besar.
 *    - Perbarui tanggal rilis sesuai tanggal pembaruan kode dibuat.
 *    - Setiap kali menghasilkan kode baru di masa mendatang, WAJIB menambahkan entri
 *      baru di urutan paling atas array CHANGELOG_LIST yang merangkum poin-poin
 *      perubahan dalam bahasa Indonesia yang jelas dan mudah dipahami pengguna.
 */

export const APP_VERSION = 'v4.3.0';
export const RELEASE_DATE = '26 November 2026';
export const RELEASE_DATE_SHORT = '26 Nov 2026';
export const APP_VERSION_STORAGE_KEY = 'serbu21_app_version';

export const CHANGELOG_LIST: ChangelogVersionItem[] = [
  {
    version: 'v4.3.0',
    date: '26 November 2026',
    title: 'Pembaruan Kode Sub Kompetensi dari TP menjadi SK',
    highlights: [
      'Pembaruan penamaan kode pada sub kompetensi (Tujuan Pembelajaran) yang sebelumnya menggunakan awalan "TP-" kini diubah menjadi "SK-" (Sub Kompetensi) agar selaras dengan standar modul evaluasi.',
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
