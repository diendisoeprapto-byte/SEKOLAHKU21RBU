export interface ChangelogVersionItem {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const APP_VERSION = 'v2.6.0';
export const RELEASE_DATE = '25 November 2026';
export const RELEASE_DATE_SHORT = '25 Nov 2026';
export const APP_VERSION_STORAGE_KEY = 'serbu21_app_version';

export const CHANGELOG_LIST: ChangelogVersionItem[] = [
  {
    version: 'v2.6.0',
    date: '25 November 2026',
    title: 'Perbaikan Urutan Muat Obrolan Terbaru SARAH AI',
    highlights: [
      'Perbaikan query pemuatan pesan obrolan privat SARAH AI dari urutan terlama menjadi urutan terbaru (descending limit 40 lalu dibalik), memastikan percakapan terakhir yang Anda simpan langsung tampil saat membuka aplikasi.',
    ],
  },
  {
    version: 'v2.5.0',
    date: '25 November 2026',
    title: 'Sinkronisasi Real-Time Stiker Realistik SARAH ke Cloud Firestore',
    highlights: [
      'Potongan stiker realistik SARAH kini otomatis tersinkron secara real-time ke database Cloud Firestore saat diunggah/dipotong.',
      'Ketika Anda membuka aplikasi di perangkat atau peramban lain, stiker realistik akan langsung terunduh dan tersedia secara otomatis tanpa perlu diunggah ulang.',
    ],
  },
  {
    version: 'v2.4.0',
    date: '25 November 2026',
    title: 'Upload Foto & Gambar Kini Mendukung Drag & Drop serta Copy-Paste (Ctrl+V)',
    highlights: [
      'Seluruh area upload foto & gambar (Foto Layar Login, Profil Admin & Logo Sekolah, Foto Guru/Tendik, Foto Siswa, dan Lembar Stiker SARAH) kini mendukung seret & lepas (Drag & Drop) maupun tempel langsung (Ctrl+V / Cmd+V).',
      'Penyusunan Soal CBT & TKA mendukung drag-and-drop serta tempel gambar (Ctrl+V) langsung pada kolom pertanyaan, slot Gambar 1 & Gambar 2, maupun tiap opsi pilihan jawaban (A–D).',
      'Pemindai Absensi Barcode & Wajah (Face ID) serta modal pendaftaran wajah siswa mendukung drag-and-drop dan paste foto untuk pemindaian maupun registrasi cepat.',
    ],
  },
  {
    version: 'v2.3.1',
    date: '25 November 2026',
    title: 'Perbaikan Tata Letak Matriks Butir Soal, Analisis 5 Tab Ringkas & Penguncian Nilai TKA',
    highlights: [
      'Perbaikan tata letak header Matriks Analisis Butir Soal TKA & CBT agar judul dan deskripsi tampil leluasa di atas baris filter tanpa terjepit.',
      'Tampilan Analisis TKA & CBT kini disusun lebih ringkas dalam 5 tab horizontal (Peringkat HOTS, Grafik Performa, Matriks Butir Soal, Distribusi Nilai, dan Tingkat Kesukaran).',
      'Penguncian nilai resmi ujian TKA satu kali pengerjaan serta penyaringan ekspor Excel, PDF, dan Word sesuai kelas yang dipilih.',
      'Pembaruan teks versi pada footer halaman Login agar langsung menampilkan ajakan klik untuk melihat catatan pembaruan.',
    ],
  },
  {
    version: 'v2.3.0',
    date: '24 November 2026',
    title: 'Optimalisasi SARAH Streaming, Anti-Gagal CBT/TKA 100+ Siswa & Pemeringkatan HOTS',
    highlights: [
      'Pemilihan Mode Kecepatan SARAH AI (Mode Cepat Lite / Otomatis / Standar), respons streaming progresif, lazy context injection, serta auto-fallback model cerdas.',
      'Upload & Auto-Slicer Lembar Stiker Realistik 2x3 (ID 31–60) khusus Endi Soeprapto lengkap dengan pembersihan latar otomatis berbasis HTML5 Canvas & IndexedDB.',
      'Peningkatan kapasitas 100+ siswa per jenjang CBT & TKA dengan isolasi dokumen Firestore per siswa, auto-save draft berkala, retry backoff, dan antrean offline anti-gagal.',
      'Sistem pemeringkatan berjenjang (Tie-Breaker): Nilai Akhir -> Jumlah Benar Soal Sulit (HOTS) -> Durasi Waktu Pengerjaan Tercepat.',
      'Mode Minimalis (5–6 kolom ringkas) & Paginasi Katalog Perpustakaan Digital.',
    ],
  },
  {
    version: 'v2.2.0',
    date: '14 November 2026',
    title: 'Analisis Soal SARAH AI, Tren Recharts & Matriks Betul/Salah',
    highlights: [
      'Integrasi SARAH AI untuk mengulas soal yang masih salah serta analisis capaian kelas/individu pada CBT & TKA berstatus selesai.',
      'Visualisasi tren nilai TKA per mata pelajaran menggunakan Recharts dan rekap total lintas simulasi.',
      'Matriks pemetaan nomor soal betul dan salah per siswa serta sistem antrean AbortController & Result Caching.',
    ],
  },
  {
    version: 'v2.1.0',
    date: '02 November 2026',
    title: 'Katalog Perpustakaan Minimalis, Preview Media Ajar & Absensi Wajah',
    highlights: [
      'Preview sampul buku digital, embed Media Ajar PPT, dan tombol baca langsung dengan pencatatan jumlah pembaca.',
      'Optimalisasi ukuran komponen upload foto pada pemindai wajah agar lebih ringkas dan nyaman.',
    ],
  },
  {
    version: 'v2.0.0',
    date: '18 Oktober 2026',
    title: 'Peluncuran Asisten Virtual SARAH & Penguncian Ujian Ketat',
    highlights: [
      'Peluncuran asisten virtual SARAH (Sistem Asisten Adaptif, Ramah, Amanah & Humanis) dengan Hybrid Visual System dan ruang privat terisolasi.',
      'Aturan penguncian akses ketat (Strict Access Control) CBT & TKA pada dokumen hasil_ujian berstatus selesai.',
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
