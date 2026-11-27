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
 *    - Naikkan angka PATCH (misal: v4.8.0 -> v4.8.1) untuk perbaikan bug, penyesuaian kode,
 *      atau perapihan tampilan kecil.
 *    - Naikkan angka MINOR (misal: v4.8.0 -> v4.9.0) untuk penambahan fitur baru.
 *    - Naikkan angka MAJOR (misal: v4.8.0 -> v5.0.0) untuk perombakan arsitektur besar.
 *    - Perbarui tanggal rilis sesuai tanggal pembaruan kode dibuat.
 *    - SETIAP KALI MENGHASILKAN KODE BARU DI MASA MENDATANG:
 *      WAJIB menambahkan entri baru di urutan PALING ATAS ([0]) array `CHANGELOG_DATA`
 *      yang merangkum poin-poin perubahan dalam bahasa Indonesia yang jelas, ringkas,
 *      dan mudah dipahami oleh pengguna.
 * ============================================================================
 */

export const CHANGELOG_DATA: ChangelogVersionItem[] = [
  {
    version: 'v4.14.2',
    date: '26 November 2026',
    title: 'Mode Presentasi Slideshow Penuh pada Bank Media Ajar',
    highlights: [
      'Mengubah tampilan pratinjau Bank Media Ajar menjadi mode presentasi slideshow layar penuh (100% canvas hitam) layaknya tampilan Slide Show PowerPoint.',
      'Menambahkan bilah kontrol melayang yang otomatis bersembunyi (auto-hide) setelah 3 detik agar tampilan materi di kelas bersih tanpa gangguan.',
    ],
  },
  {
    version: 'v4.14.1',
    date: '26 November 2026',
    title: 'Pemilihan Mata Pelajaran Spesifik saat Hapus / Buka Kunci Nilai TKA & CBT',
    highlights: [
      'Menambahkan kotak centang pilih mata pelajaran (mapel) di dialog Buka Kunci & Hapus Nilai TKA maupun CBT sehingga guru/admin dapat menghapus atau menghitung ulang hanya mapel tertentu tanpa menghapus nilai mapel lainnya.',
      'Menambahkan pemilihan mapel pada dialog Kosongkan Data TKA/CBT serta tombol Hapus per siswa pada Rekap TKA yang memiliki lebih dari satu mapel, sekaligus membersihkan mirror Firestore per mapel secara akurat.',
    ],
  },
  {
    version: 'v4.14.0',
    date: '26 November 2026',
    title: 'Penambahan Link Sumber Pengetahuan untuk Asisten AI SARAH',
    highlights: [
      'Menambahkan menu kelola Link Sumber Pengetahuan (URL situs edukasi, artikel Kemendikbud, Google Drive/PDF) khusus Admin & Endi Soeprapto lengkap dengan ringkasan konten dan kontrol target Guru/Siswa.',
      'Integrasi langsung daftar tautan sumber aktif dan pencarian web Gemini Search ke dalam memori AI SARAH beserta tombol tautan sumber otomatis di bawah balasan chat.',
    ],
  },
  {
    version: 'v4.13.0',
    date: '26 November 2026',
    title: 'Integrasi Kehadiran & TP pada Jurnal Mengajar serta Pengelolaan Modul Ajar',
    highlights: [
      'Penyeragaman istilah menjadi Modul Ajar secara menyeluruh serta penambahan tombol Hapus per item beserta dialog konfirmasi di Repositori Perangkat Ajar.',
      'Integrasi otomatis ringkasan kehadiran murid harian dan pilihan Tujuan Pembelajaran (TP) dari data Kurikulum ke dalam form, tabel, dan ekspor PDF/Excel Jurnal Mengajar.',
    ],
  },
  {
    version: 'v4.11.0',
    date: '26 November 2026',
    title: 'Fitur Buka Kunci Nilai, Koreksi Ulang Skor Otomatis & Ujian Ulang (Admin & Endi Soeprapto)',
    highlights: [
      'Menambahkan kontrol eksklusif Buka Kunci Nilai (hanya dapat diakses Admin / Super Admin dan akun Endi Soeprapto) pada Rekap Hasil & Matriks Analisis Butir Soal CBT maupun TKA.',
      'Menambahkan fitur Hitung Ulang Nilai Otomatis dengan konfirmasi PIN Pengawas untuk mengevaluasi ulang seluruh jawaban tersimpan siswa menggunakan kunci jawaban terbaru via writeBatch Firestore.',
      'Menambahkan opsi Buka Kunci & Hapus Nilai (izinkan siswa mengerjakan ulang paket/mapel) serta Buka Kunci Edit Manual, sekaligus sinkronisasi real-time penghapusan status terkunci di perangkat siswa.',
    ],
  },
  {
    version: 'v4.10.0',
    date: '26 November 2026',
    title: 'Modul Administrasi Pembelajaran & Download Laporan Jurnal Mengajar Harian',
    highlights: [
      'Menambahkan modul Administrasi Pembelajaran (Repositori ATP, Prota, Promes, Modul Ajar/RPP, PPI & LKPD Adaptif) dengan fitur draf otomatis AI SARAH serta status verifikasi digital ber-QR Code.',
      'Menambahkan fitur Jurnal Mengajar Harian (Agenda Kelas) lengkap dengan filter periode, unduh laporan resmi siap cetak (PDF) berkop sekolah & blok pengesahan Kepala Sekolah, serta ekspor Excel (.csv).',
      'Menambahkan dasbor pemantauan & supervisi Kepala Sekolah untuk verifikasi satu klik serta kontrol akses bertahap (khusus Endi Soeprapto & Kepsek, dengan sakelar aktivasi ke seluruh guru).',
    ],
  },
  {
    version: 'v4.9.0',
    date: '26 November 2026',
    title: 'Standardisasi Otomatis Kode Kompetensi (KOM) & Sub Kompetensi (SK) TKA',
    highlights: [
      'Pembaruan dan standardisasi kode Kompetensi TKA otomatis dari awalan "CP-" menjadi "KOM-" (Kompetensi) di seluruh menu Kompetensi TKA, pembuatan butir soal, dan penyimpanan data.',
      'Pembaruan penamaan kode pada sub kompetensi TKA secara menyeluruh (termasuk migrasi otomatis data penyimpanan lokal) dari "TP-" menjadi "SK-" (Sub Kompetensi).',
      'Penyempurnaan sinkronisasi nomor versi otomatis berbasis Semantic Versioning terhubung langsung dengan perubahan data dan pembaruan sistem.',
    ],
  },
  {
    version: 'v4.8.0',
    date: '26 November 2026',
    title: 'Sistem Tahun Ajaran & Arsip Riwayat Mengajar Guru',
    highlights: [
      'Menambahkan pengelolaan Tahun Ajaran aktif serta pemetaan penugasan kelas guru per tahun ajaran tanpa menghapus rekam jejak mengajar sebelumnya.',
      'Menambahkan fitur beralih tahun ajaran (Year Switcher) di dasbor Guru dan Admin untuk melihat arsip nilai, presensi, e-Rapor, dan soal tahun lalu secara utuh sekaligus menyesuaikan kelas ampu otomatis di tahun ajaran baru.',
      'Optimasi performa anti-macet (debouncing auto-save, kompresi gambar otomatis via canvas, paginasi tabel rekap & matriks, serta manajemen listener memori).',
      'Mode Kunci Ujian (Exam Lock) layar penuh otomatis, deteksi pindah tab/Alt+Tab, buka kunci pengawas via Ctrl + C + B dan PIN 2121, pembaruan soal/kunci jawaban secara live, tampilan skor instan siswa, serta tombol Reset Nilai Ujian.',
    ],
  },
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

// KAMUS NAMA KODE RILIS GENERASI (A–Z / v1.0 – v26.0)
export const RELEASE_CODENAMES: Record<number, string> = {
  1: 'Aksara Perintis',
  2: 'Bina Karsa',
  3: 'Cipta Sarana',
  4: 'Daya Inklusi',
  5: 'Ekosistem Merdeka',
  6: 'Fajar Literasi',
  7: 'Gema Budi',
  8: 'Harmoni Cendekia',
  9: 'Ilmu Bestari',
  10: 'Jejak Karya',
  11: 'Karsa Mandiri',
  12: 'Lentera Ilmu',
  13: 'Merdeka Belajar',
  14: 'Nalar Kritis',
  15: 'Olah Rasa',
  16: 'Pamong Sejati',
  17: 'Qalbu Cendekia',
  18: 'Ruang Tumbuh',
  19: 'Sinergi Bangsa',
  20: 'Taman Siswa',
  21: 'Ukir Prestasi',
  22: 'Visi Peradaban',
  23: 'Wawasan Nusantara',
  24: 'Xenia Nusantara',
  25: 'Yakin Mandiri',
  26: 'Zaman Gemilang',
};

export function getMajorVersionNumber(versionString?: string | number): number {
  if (typeof versionString === 'number') {
    return Number.isFinite(versionString) && versionString > 0 ? Math.floor(versionString) : 4;
  }
  if (!versionString) return 4;
  const match = String(versionString).trim().match(/^[vV]?(\d+)/);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return Number.isFinite(num) && num > 0 ? num : 4;
  }
  return 4;
}

export function getReleaseCodename(versionString?: string | number): string {
  const major = getMajorVersionNumber(versionString);
  return RELEASE_CODENAMES[major] || 'Daya Inklusi';
}

export function getGenerationBadgeLabel(versionString?: string | number): string {
  const major = getMajorVersionNumber(versionString);
  const codename = getReleaseCodename(versionString);
  return `Generasi ${major} • ${codename}`;
}

// Alias untuk kompatibilitas kode yang sudah ada
export const CHANGELOG_LIST = CHANGELOG_DATA;

// SUMBER KEBENARAN TUNGGAL DINAMIS BERDASARKAN ELEMEN TERATAS CHANGELOG_DATA:
export const CURRENT_CHANGELOG_ITEM = CHANGELOG_DATA[0];
export const APP_VERSION = CHANGELOG_DATA[0]?.version || 'v4.14.2';
export const RELEASE_DATE = CHANGELOG_DATA[0]?.date || '26 November 2026';
export const RELEASE_DATE_SHORT = RELEASE_DATE.replace('November', 'Nov').replace('Desember', 'Des');
export const APP_VERSION_NUMBER = APP_VERSION.replace(/^v/i, '');
export const APP_VERSION_CODENAME = getReleaseCodename(APP_VERSION);
export const APP_VERSION_FOOTER_TEXT = `Versi ${APP_VERSION_NUMBER} "${APP_VERSION_CODENAME}"`;
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
