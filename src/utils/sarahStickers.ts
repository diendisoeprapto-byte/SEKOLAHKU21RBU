import { ActiveUser } from '../types';
import { isEndiSoepraptoUser } from './sarahAttachments';

export type SarahUserMode = 'exclusive_endi' | 'siswa' | 'standard_teacher';

export interface SarahStickerItem {
  id: string;
  key: string;
  path: string;
  label: string;
  triggerContext: string;
  hijabStyle?: string;
  iconTheme?: string;
  emoji: string;
}

export const SARAH_STANDARD_AVATAR_URL = '/assets/sarah-avatar-standard.png';

/**
 * Mode 1: Koleksi tunggal 30 Stiker Foto Realistis Eksklusif untuk Endi Soeprapto.
 * Mempertahankan fitur wajah asli subjek dengan pencahayaan studio lembut,
 * variasi hijab (pink pastel, ungu muda, cokelat tua seragam khaki, hitam garis putih, motif abu-abu),
 * garis tepi stiker putih tebal (die-cut border), dan bayangan halus.
 * 9 stiker versi v2 (real_endi_07, 08, 10, 17, 19, 21, 22, 24, 28) memakai jalur v2_*.png
 * beserta key & triggerContext terbaru.
 */
export const SARAH_REALISTIC_STICKERS_ENDI: readonly SarahStickerItem[] = Object.freeze([
  {
    id: 'real_endi_01',
    key: 'senyum_ramah_sapa',
    path: '/assets/stickers/realistic/real_endi_01_senyum_sapa.png',
    label: 'Senyum Hangat Sapaan Mas Endi',
    triggerContext: 'menyapa ramah, membuka percakapan santai dengan Mas Endi',
    hijabStyle: 'pink pastel',
    emoji: '🌸',
  },
  {
    id: 'real_endi_02',
    key: 'semangat_dukung',
    path: '/assets/stickers/realistic/real_endi_02_semangat_dukung.png',
    label: 'Semangat Terus Mas Endi!',
    triggerContext: 'memberi semangat kerja dan menyusun administrasi sekolah',
    hijabStyle: 'ungu muda',
    emoji: '💪',
  },
  {
    id: 'real_endi_03',
    key: 'sapaan_sore_hangat',
    path: '/assets/stickers/realistic/real_endi_03_sapaan_sore.png',
    label: 'Selamat Sore Mas Endi',
    triggerContext: 'sapaan sore hari (15:00-17:59 WIB) penuh perhatian & menanyakan kabar sore',
    hijabStyle: 'pink pastel',
    emoji: '🌇',
  },
  {
    id: 'real_endi_04',
    key: 'jempol_apresiasi',
    path: '/assets/stickers/realistic/real_endi_04_jempol_apresiasi.png',
    label: 'Keren Banget Mas Endi!',
    triggerContext: 'mengapresiasi pencapaian mengajar, modul selesai, atau hasil ujian baik',
    hijabStyle: 'cokelat tua seragam khaki',
    emoji: '👍',
  },
  {
    id: 'real_endi_05',
    key: 'sapaan_siang_cerah',
    path: '/assets/stickers/realistic/real_endi_05_sapaan_siang.png',
    label: 'Selamat Siang Mas Endi',
    triggerContext: 'sapaan siang hari (11:00-14:59 WIB) saat beraktivitas di sekolah',
    hijabStyle: 'cokelat tua seragam khaki',
    emoji: '☀️',
  },
  {
    id: 'real_endi_06',
    key: 'ingat_istirahat_siang',
    path: '/assets/stickers/realistic/real_endi_06_istirahat_siang.png',
    label: 'Jangan Lupa Istirahat & Makan Siang',
    triggerContext: 'mengingatkan Mas Endi istirahat siang dan menjaga kesehatan di sela mengajar',
    hijabStyle: 'motif abu-abu',
    emoji: '🍱',
  },
  {
    id: 'real_endi_07',
    key: 'catat_ide_cemerlang_v2',
    path: '/assets/stickers/realistic/v2_real_endi_07_catat_ide.png',
    label: 'Mencatat Ide & Rencana Pembelajaran',
    triggerContext: 'v2: membantu merancang RPP, Modul Ajar, analisis butir soal, dan inovasi kelas',
    hijabStyle: 'cokelat tua seragam khaki',
    emoji: '📝',
  },
  {
    id: 'real_endi_08',
    key: 'perhatian_lembut_manja_v2',
    path: '/assets/stickers/realistic/v2_real_endi_08_perhatian_manja.png',
    label: 'Perhatian Lembut untuk Mas Endi',
    triggerContext: 'v2: menyapa lembut dengan nada manja penuh perhatian khusus Mas Endi',
    hijabStyle: 'pink pastel',
    emoji: '🩷',
  },
  {
    id: 'real_endi_09',
    key: 'terima_kasih_santun',
    path: '/assets/stickers/realistic/real_endi_09_terima_kasih.png',
    label: 'Terima Kasih Mas Endi',
    triggerContext: 'mengucapkan terima kasih dengan tulus dan santun',
    hijabStyle: 'ungu muda',
    emoji: '🙏',
  },
  {
    id: 'real_endi_10',
    key: 'analisis_data_fokus_v2',
    path: '/assets/stickers/realistic/v2_real_endi_10_analisis_data.png',
    label: 'Fokus Mengulas Data Nilai & CBT/TKA',
    triggerContext: 'v2: menganalisis perkembangan nilai CBT, TKA, dan pemetaan remedial/pengayaan',
    hijabStyle: 'hitam garis putih',
    emoji: '📊',
  },
  {
    id: 'real_endi_11',
    key: 'bangga_murid_tuntas',
    path: '/assets/stickers/realistic/real_endi_11_bangga_murid.png',
    label: 'Alhamdulillah Murid-Murid Makin Hebat',
    triggerContext: 'merayakan ketuntasan belajar siswa di atas KKTP',
    hijabStyle: 'pink pastel',
    emoji: '🌟',
  },
  {
    id: 'real_endi_12',
    key: 'sedang_berpikir_solusi',
    path: '/assets/stickers/realistic/real_endi_12_berpikir_solusi.png',
    label: 'Mencari Solusi Mengajar Terbaik',
    triggerContext: 'menyusun strategi diferensiasi kelas dan pemecahan kendala siswa',
    hijabStyle: 'motif abu-abu',
    emoji: '💡',
  },
  {
    id: 'real_endi_13',
    key: 'senyum_subuh_berkah',
    path: '/assets/stickers/realistic/real_endi_13_pagi_berkah.png',
    label: 'Pagi Berkah & Semangat Ibadah',
    triggerContext: 'sapaan pagi penuh doa atau pengingat sholat subuh/pagi yang penuh keteduhan',
    hijabStyle: 'ungu muda',
    emoji: '🌅',
  },
  {
    id: 'real_endi_14',
    key: 'siap_bantu_kapan_saja',
    path: '/assets/stickers/realistic/real_endi_14_siap_bantu.png',
    label: 'SARAH Siap Membantu Mas Endi',
    triggerContext: 'menawarkan bantuan upload dokumen, baca PDF/Word/Excel, atau tugas mendadak',
    hijabStyle: 'cokelat tua seragam khaki',
    emoji: '🤝',
  },
  {
    id: 'real_endi_15',
    key: 'tenang_malam_istirahat',
    path: '/assets/stickers/realistic/real_endi_15_tenang_malam.png',
    label: 'Malam Tenang, Jangan Begadang Mas',
    triggerContext: 'menemani kerja malam hari dan mengingatkan Mas Endi agar tidak tidur terlalu larut',
    hijabStyle: 'hitam garis putih',
    emoji: '🌙',
  },
  {
    id: 'real_endi_16',
    key: 'senang_dengar_cerita',
    path: '/assets/stickers/realistic/real_endi_16_mendengar_ramah.png',
    label: 'SARAH Senang Mendengarkan Mas',
    triggerContext: 'merespons curhat mengajar, cerita kegiatan sekolah, atau refleksi harian',
    hijabStyle: 'pink pastel',
    emoji: '😊',
  },
  {
    id: 'real_endi_17',
    key: 'baca_dokumen_cermat_v2',
    path: '/assets/stickers/realistic/v2_real_endi_17_baca_dokumen.png',
    label: 'Cermat Membaca File & Lampiran',
    triggerContext: 'v2: membaca gambar, PDF, spreadsheet Excel, atau dokumen yang diunggah Mas Endi',
    hijabStyle: 'motif abu-abu',
    emoji: '📄',
  },
  {
    id: 'real_endi_18',
    key: 'peluk_semangat_empati',
    path: '/assets/stickers/realistic/real_endi_18_empati_hangat.png',
    label: 'Sabar Ya Mas, Semua Pasti Beres',
    triggerContext: 'menenangkan saat jadwal padat, koreksi numpuk, atau suasana hati lelah',
    hijabStyle: 'ungu muda',
    emoji: '🫂',
  },
  {
    id: 'real_endi_19',
    key: 'pengingat_sholat_berkah_v2',
    path: '/assets/stickers/realistic/v2_real_endi_19_pengingat_sholat.png',
    label: 'Yuk Sholat Dulu Mas Endi',
    triggerContext: 'v2: pengingat waktu sholat santun, lembut, dan penuh doa keberkahan',
    hijabStyle: 'ungu muda',
    emoji: '🕌',
  },
  {
    id: 'real_endi_20',
    key: 'sore_santai_kopi_teh',
    path: '/assets/stickers/realistic/real_endi_20_sore_santai.png',
    label: 'Sore Teduh Setelah Mengajar',
    triggerContext: 'menemani sore hari seusai jam pulang sekolah atau saat rekap tugas sore',
    hijabStyle: 'motif abu-abu',
    emoji: '🍵',
  },
  {
    id: 'real_endi_21',
    key: 'kreatif_media_ajar_v2',
    path: '/assets/stickers/realistic/v2_real_endi_21_kreatif_media.png',
    label: 'Merangkai Media Ajar & Visual Seru',
    triggerContext: 'v2: membuat ilustrasi edukatif, LKPD kreatif, dan presentasi pembelajaran',
    hijabStyle: 'pink pastel',
    emoji: '🎨',
  },
  {
    id: 'real_endi_22',
    key: 'sambutan_pagi_hangat_v2',
    path: '/assets/stickers/realistic/v2_real_endi_22_sambutan_pagi.png',
    label: 'Selamat Pagi Mas Endi Tersayang',
    triggerContext: 'v2: sambutan pagi otomatis (04:30-10:59 WIB) penuh kehangatan & semangat pagi',
    hijabStyle: 'cokelat tua seragam khaki',
    emoji: '🌤️',
  },
  {
    id: 'real_endi_23',
    key: 'amanah_jaga_rahasia',
    path: '/assets/stickers/realistic/real_endi_23_amanah_rahasia.png',
    label: 'Amanah & Tersimpan Privat',
    triggerContext: 'menegaskan kerahasiaan ruang privat dan keamanan data sekolah',
    hijabStyle: 'hitam garis putih',
    emoji: '🔐',
  },
  {
    id: 'real_endi_24',
    key: 'evaluasi_soal_teliti_v2',
    path: '/assets/stickers/realistic/v2_real_endi_24_evaluasi_teliti.png',
    label: 'Menelaah Butir Soal & TP Siswa',
    triggerContext: 'v2: mengevaluasi tingkat kesukaran, daya pembeda, dan soal tersulit siswa',
    hijabStyle: 'cokelat tua seragam khaki',
    emoji: '🔍',
  },
  {
    id: 'real_endi_25',
    key: 'senyum_manis_manja',
    path: '/assets/stickers/realistic/real_endi_25_senyum_manja.png',
    label: 'Senyum Manja Khusus Mas Endi',
    triggerContext: 'momen ringan, bercanda sopan, atau membalas sapaan akrab Mas Endi',
    hijabStyle: 'pink pastel',
    emoji: '✨',
  },
  {
    id: 'real_endi_26',
    key: 'apresiasi_guru_hebat',
    path: '/assets/stickers/realistic/real_endi_26_guru_teladan.png',
    label: 'Mas Endi Guru Hebat SDN RBU 21',
    triggerContext: 'memberi penguatan saat mendampingi siswa inklusi atau kelas 6 TKA',
    hijabStyle: 'cokelat tua seragam khaki',
    emoji: '🏆',
  },
  {
    id: 'real_endi_27',
    key: 'cek_kesiapan_ujian',
    path: '/assets/stickers/realistic/real_endi_27_siap_ujian.png',
    label: 'Kesiapan CBT & TKA Terpantau Aman',
    triggerContext: 'memastikan paket soal, jadwal, dan kesiapan perangkat ujian CBT/TKA',
    hijabStyle: 'hitam garis putih',
    emoji: '💻',
  },
  {
    id: 'real_endi_28',
    key: 'doa_kelancaran_aktivitas_v2',
    path: '/assets/stickers/realistic/v2_real_endi_28_doa_kelancaran.png',
    label: 'Semoga Lancar & Berkah Hari Ini',
    triggerContext: 'v2: mendoakan kelancaran tugas sekolah, keluarga, dan Assyuwaifah Dilanesa',
    hijabStyle: 'ungu muda',
    emoji: '🤲',
  },
  {
    id: 'real_endi_29',
    key: 'rekap_nilai_tuntas',
    path: '/assets/stickers/realistic/real_endi_29_rekap_tuntas.png',
    label: 'Rekap Nilai & e-Rapor Rapi',
    triggerContext: 'merapikan leger nilai, remedial, pengayaan, dan laporan rapor siswa',
    hijabStyle: 'motif abu-abu',
    emoji: '📋',
  },
  {
    id: 'real_endi_30',
    key: 'sambutan_malam_manja',
    path: '/assets/stickers/realistic/real_endi_30_sambutan_malam.png',
    label: 'Selamat Malam Mas Endi',
    triggerContext: 'sambutan malam hari (18:00-04:29 WIB) lembut, santun, dan penuh perhatian',
    hijabStyle: 'hitam garis putih',
    emoji: '🌠',
  },
]);

/**
 * Mode 2: Koleksi tunggal 20 Stiker Kartun 3D untuk Akun Siswa (Anak-Anak SD).
 * Karakter guru berhijab 3D yang ramah, cerah, ceria, outline putih tebal,
 * dilengkapi ikon edukasi (buku, pensil, roket, trofi, bintang).
 */
export const SARAH_3D_STICKERS_SISWA: readonly SarahStickerItem[] = Object.freeze([
  {
    id: '3d_siswa_01',
    key: 'sapa_ceria_buku',
    path: '/assets/stickers/3d/3d_siswa_01_sapa_buku.png',
    label: 'Halo Anak Hebat! Yuk Belajar',
    triggerContext: 'menyapa siswa pertama kali sambil memegang buku',
    iconTheme: 'buku terbuka',
    emoji: '📚',
  },
  {
    id: '3d_siswa_02',
    key: 'jempol_nilai_bagus',
    path: '/assets/stickers/3d/3d_siswa_02_jempol_bintang.png',
    label: 'Hebat Sekali Jawabanmu!',
    triggerContext: 'memuji usaha dan keberanian siswa menjawab soal ujian',
    iconTheme: 'bintang emas',
    emoji: '🌟',
  },
  {
    id: '3d_siswa_03',
    key: 'trofi_nilai_seratus',
    path: '/assets/stickers/3d/3d_siswa_03_trofi_juara.png',
    label: 'Juara! Nilai Sempurna 100',
    triggerContext: 'merayakan nilai 100 atau ketuntasan sangat tinggi',
    iconTheme: 'trofi juara',
    emoji: '🏆',
  },
  {
    id: '3d_siswa_04',
    key: 'roket_semangat_maju',
    path: '/assets/stickers/3d/3d_siswa_04_roket_semangat.png',
    label: 'Meluncur Semangat Belajar!',
    triggerContext: 'memotivasi siswa yang nilainya belum tuntas agar terus berjuang',
    iconTheme: 'roket warna-warni',
    emoji: '🚀',
  },
  {
    id: '3d_siswa_05',
    key: 'pensil_catat_rumus',
    path: '/assets/stickers/3d/3d_siswa_05_pensil_pintar.png',
    label: 'Ayo Catat Konsep Pentingnya!',
    triggerContext: 'membahas soal yang salah dengan cara mudah dipahami anak SD',
    iconTheme: 'pensil raksasa',
    emoji: '✏️',
  },
  {
    id: '3d_siswa_06',
    key: 'kaca_pembesar_teliti',
    path: '/assets/stickers/3d/3d_siswa_06_detektif_soal.png',
    label: 'Detektif Cilik Pencari Jawaban',
    triggerContext: 'membimbing siswa mengecek letak kesalahan membaca soal',
    iconTheme: 'kaca pembesar & buku',
    emoji: '🔍',
  },
  {
    id: '3d_siswa_07',
    key: 'lampu_ide_paham',
    path: '/assets/stickers/3d/3d_siswa_07_lampu_ide.png',
    label: 'Aha! Sekarang Jadi Paham',
    triggerContext: 'menjelaskan konsep materi dengan analogi sederhana',
    iconTheme: 'lampu ide & bintang',
    emoji: '💡',
  },
  {
    id: '3d_siswa_08',
    key: 'baca_cerita_literasi',
    path: '/assets/stickers/3d/3d_siswa_08_literasi_ceria.png',
    label: 'Gemar Membaca Jadi Pintar',
    triggerContext: 'pembahasan soal Bahasa Indonesia dan pemahaman teks',
    iconTheme: 'tumpukan buku',
    emoji: '📖',
  },
  {
    id: '3d_siswa_09',
    key: 'hitung_matematika_seru',
    path: '/assets/stickers/3d/3d_siswa_09_matematika_seru.png',
    label: 'Berhitung Itu Seru!',
    triggerContext: 'pembahasan soal Matematika atau langkah hitung bertahap',
    iconTheme: 'penggaris & angka',
    emoji: '🧮',
  },
  {
    id: '3d_siswa_10',
    key: 'eksperimen_ipas_asik',
    path: '/assets/stickers/3d/3d_siswa_10_sains_ipas.png',
    label: 'Penjelajah Sains Cilik',
    triggerContext: 'pembahasan soal IPAS dan pengamatan alam',
    iconTheme: 'tabung sains & daun',
    emoji: '🔬',
  },
  {
    id: '3d_siswa_11',
    key: 'english_fun_globe',
    path: '/assets/stickers/3d/3d_siswa_11_bahasa_inggris.png',
    label: 'Great Job! Keep Learning',
    triggerContext: 'pembahasan soal Bahasa Inggris anak SD',
    iconTheme: 'globe & kartu kata',
    emoji: '🌍',
  },
  {
    id: '3d_siswa_12',
    key: 'koding_robot_cka',
    path: '/assets/stickers/3d/3d_siswa_12_robot_kka.png',
    label: 'Sobat Koding & Logika',
    triggerContext: 'pembahasan soal KKA / berpikir komputasional',
    iconTheme: 'robot imut & bintang',
    emoji: '🤖',
  },
  {
    id: '3d_siswa_13',
    key: 'gembok_jujur_amanah',
    path: '/assets/stickers/3d/3d_siswa_13_jujur_ujian.png',
    label: 'Kerjakan Jujur Dulu Ya, Nak!',
    triggerContext: 'ujian masih terkunci karena belum selesai dikerjakan siswa',
    iconTheme: 'gembok & perisai jujur',
    emoji: '🔒',
  },
  {
    id: '3d_siswa_14',
    key: 'jangan_menyerah_peluk',
    path: '/assets/stickers/3d/3d_siswa_14_tetap_semangat.png',
    label: 'Salah Itu Wajar, Yuk Coba Lagi!',
    triggerContext: 'menghibur siswa yang banyak salah soal agar tetap percaya diri',
    iconTheme: 'hati & bintang',
    emoji: '💖',
  },
  {
    id: '3d_siswa_15',
    key: 'langkah_demi_langkah',
    path: '/assets/stickers/3d/3d_siswa_15_tangga_belajar.png',
    label: 'Belajar Pelan-Pelan Bertahap',
    triggerContext: 'merangkum Tujuan Pembelajaran (TP) yang perlu diulang',
    iconTheme: 'tangga buku & pensil',
    emoji: '🪜',
  },
  {
    id: '3d_siswa_16',
    key: 'tujuh_kebiasaan_hebat',
    path: '/assets/stickers/3d/3d_siswa_16_anak_hebat.png',
    label: '7 Kebiasaan Anak Indonesia Hebat',
    triggerContext: 'mengaitkan motivasi belajar dengan 7 Kebiasaan Anak Indonesia Hebat',
    iconTheme: 'medali bintang',
    emoji: '🎖️',
  },
  {
    id: '3d_siswa_17',
    key: 'tantangan_pengayaan',
    path: '/assets/stickers/3d/3d_siswa_17_pengayaan_roket.png',
    label: 'Tantangan Level Juara!',
    triggerContext: 'memberi tantangan pengayaan singkat untuk siswa nilai tinggi/100',
    iconTheme: 'roket & trofi',
    emoji: '🎯',
  },
  {
    id: '3d_siswa_18',
    key: 'tepuk_tangan_apresiasi',
    path: '/assets/stickers/3d/3d_siswa_18_tepuk_tangan.png',
    label: 'Prok Prok Prok, Kamu Keren!',
    triggerContext: 'merayakan selesainya ujian CBT atau TKA oleh siswa',
    iconTheme: 'konfeti & bintang',
    emoji: '👏',
  },
  {
    id: '3d_siswa_19',
    key: 'berdoa_sebelum_belajar',
    path: '/assets/stickers/3d/3d_siswa_19_doa_belajar.png',
    label: 'Awali Belajar dengan Doa',
    triggerContext: 'mengingatkan berdoa & menjaga adab belajar yang baik',
    iconTheme: 'buku & cahaya bintang',
    emoji: '🤲',
  },
  {
    id: '3d_siswa_20',
    key: 'terima_kasih_sampai_jumpa',
    path: '/assets/stickers/3d/3d_siswa_20_terima_kasih.png',
    label: 'Terima Kasih Sudah Belajar Bersama SARAH!',
    triggerContext: 'menutup sesi belajar dan memuji ketekunan siswa',
    iconTheme: 'buku & pita bintang',
    emoji: '🌈',
  },
]);

/**
 * Resolusi mode aktif secara terpusat berdasarkan identitas user yang login.
 */
export function resolveSarahUserMode(
  user?: Pick<ActiveUser, 'role' | 'username' | 'name'> | null
): SarahUserMode {
  if (isEndiSoepraptoUser(user)) {
    return 'exclusive_endi';
  }
  if (user?.role === 'siswa') {
    return 'siswa';
  }
  return 'standard_teacher';
}

export function findRealisticEndiSticker(idOrKey?: string | null): SarahStickerItem | null {
  const clean = String(idOrKey || '').trim().toLowerCase();
  if (!clean) return null;
  return (
    SARAH_REALISTIC_STICKERS_ENDI.find(
      (s) => s.id.toLowerCase() === clean || s.key.toLowerCase() === clean
    ) || null
  );
}

export function findStudent3DSticker(idOrKey?: string | null): SarahStickerItem | null {
  const clean = String(idOrKey || '').trim().toLowerCase();
  if (!clean) return null;
  return (
    SARAH_3D_STICKERS_SISWA.find(
      (s) => s.id.toLowerCase() === clean || s.key.toLowerCase() === clean
    ) || null
  );
}

export function pickStudent3DStickerForReview(score: number, mapel?: string): SarahStickerItem {
  if (score >= 100) {
    return findStudent3DSticker('3d_siswa_03') || SARAH_3D_STICKERS_SISWA[2];
  }
  const m = String(mapel || '').toLowerCase();
  if (score < 65) {
    return findStudent3DSticker('3d_siswa_04') || SARAH_3D_STICKERS_SISWA[3];
  }
  if (m.includes('matematika')) {
    return findStudent3DSticker('3d_siswa_09') || SARAH_3D_STICKERS_SISWA[8];
  }
  if (m.includes('ipas') || m.includes('ipa')) {
    return findStudent3DSticker('3d_siswa_10') || SARAH_3D_STICKERS_SISWA[9];
  }
  if (m.includes('inggris')) {
    return findStudent3DSticker('3d_siswa_11') || SARAH_3D_STICKERS_SISWA[10];
  }
  if (m.includes('koding') || m.includes('kka')) {
    return findStudent3DSticker('3d_siswa_12') || SARAH_3D_STICKERS_SISWA[11];
  }
  if (m.includes('indonesia')) {
    return findStudent3DSticker('3d_siswa_08') || SARAH_3D_STICKERS_SISWA[7];
  }
  return findStudent3DSticker('3d_siswa_05') || SARAH_3D_STICKERS_SISWA[4];
}

export function pickRealisticEndiStickerForAnalysis(isOptimal: boolean): SarahStickerItem {
  if (isOptimal) {
    return findRealisticEndiSticker('real_endi_11') || SARAH_REALISTIC_STICKERS_ENDI[10];
  }
  return findRealisticEndiSticker('real_endi_10') || SARAH_REALISTIC_STICKERS_ENDI[9];
}
