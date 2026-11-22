import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseErrorDetails(error) {
  const rawMessage = typeof error?.message === 'string' ? error.message.trim() : '';
  let statusCode = Number(error?.statusCode || error?.status) || 500;
  let cleanMessage = rawMessage || 'Terjadi kesalahan saat menghubungi layanan SARAH AI.';

  if (rawMessage.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage);
      if (parsed?.error) {
        if (Number(parsed.error.code)) {
          statusCode = Number(parsed.error.code);
        }
        if (typeof parsed.error.message === 'string' && parsed.error.message.trim()) {
          cleanMessage = parsed.error.message.trim();
        }
      }
    } catch {
      // Keep rawMessage when not valid JSON
    }
  }

  return { statusCode, cleanMessage };
}

function isTransientGeminiError(error) {
  const { statusCode, cleanMessage } = parseErrorDetails(error);
  const lower = cleanMessage.toLowerCase();
  if ([429, 500, 502, 503, 504].includes(statusCode)) return true;
  return (
    lower.includes('high demand') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('try again later') ||
    lower.includes('resource_exhausted') ||
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed')
  );
}

async function generateWithRetryAndFallback({ ai, contents, config = {}, useLowThinking = false }) {
  const attempts = [
    { model: PRIMARY_MODEL, delayMs: 0, lowThinking: useLowThinking },
    { model: PRIMARY_MODEL, delayMs: 650, lowThinking: useLowThinking },
    { model: FALLBACK_MODEL, delayMs: 200, lowThinking: false },
    { model: FALLBACK_MODEL, delayMs: 700, lowThinking: false },
  ];

  let lastError = null;
  for (const step of attempts) {
    if (step.delayMs > 0) {
      await sleep(step.delayMs);
    }
    try {
      const stepConfig = { ...config };
      if (step.lowThinking && step.model === PRIMARY_MODEL) {
        stepConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }
      return await ai.models.generateContent({
        model: step.model,
        contents,
        config: stepConfig,
      });
    } catch (err) {
      lastError = err;
      if (!isTransientGeminiError(err)) {
        throw err;
      }
      console.warn(
        `[sarah-ai] Transient error on ${step.model}:`,
        parseErrorDetails(err).cleanMessage
      );
    }
  }

  throw lastError;
}

function formatGeminiError(error) {
  const { statusCode: initialCode, cleanMessage: initialMsg } = parseErrorDetails(error);
  let statusCode = initialCode;
  let cleanMessage = initialMsg;
  const lower = cleanMessage.toLowerCase();

  if (statusCode === 400 || statusCode === 403) {
    cleanMessage = `Konfigurasi API Key Gemini bermasalah (${cleanMessage}). Periksa GEMINI_API_KEY di Settings > Secrets atau Environment Variables Netlify.`;
  } else if (statusCode === 503 || lower.includes('high demand') || lower.includes('overloaded')) {
    statusCode = 503;
    cleanMessage =
      'Server AI Gemini sedang mengalami lonjakan antrean permintaan sementara. Silakan klik tombol kirim ulang beberapa detik lagi.';
  } else if (statusCode === 429 || lower.includes('resource_exhausted')) {
    statusCode = 429;
    cleanMessage =
      'Batas penggunaan (kuota) API Gemini sedang penuh sementara. Silakan tunggu beberapa detik lalu coba kirim ulang.';
  }

  const normalized = new Error(cleanMessage);
  normalized.statusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
  return normalized;
}

function sanitizeString(val, maxLen = 4000) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function buildRagContextBlock(ragContext = {}) {
  const parts = [];
  const schoolName = sanitizeString(ragContext.schoolName || 'SDN Rawa Badak Utara 21', 150);
  const activeClass = sanitizeString(ragContext.activeClass || '', 60);

  parts.push(`PROFIL SEKOLAH: ${schoolName}${activeClass ? ` | Konteks Kelas: ${activeClass}` : ''}`);

  if (ragContext.sarahConfig && typeof ragContext.sarahConfig === 'object') {
    const customNote = sanitizeString(ragContext.sarahConfig.personaNote || '', 600);
    if (customNote) {
      parts.push(`ARAHAN PERSONA SEKOLAH (settings/sarah_config): ${customNote}`);
    }
  }

  if (Array.isArray(ragContext.subjectsList) && ragContext.subjectsList.length > 0) {
    const subLines = ragContext.subjectsList
      .slice(0, 15)
      .map((s) => `- ${sanitizeString(s.name, 100)}${s.tp ? ` (TP: ${sanitizeString(s.tp, 250)})` : ''}`);
    parts.push(`DAFTAR MATA PELAJARAN & TP KURIKULUM SEKOLAH:\n${subLines.join('\n')}`);
  }

  if (Array.isArray(ragContext.knowledgeDocs) && ragContext.knowledgeDocs.length > 0) {
    const kbLines = ragContext.knowledgeDocs.slice(0, 8).map((doc, i) => {
      return `[KB-${i + 1}] Judul: ${sanitizeString(doc.judul, 160)} | Kategori: ${sanitizeString(doc.kategori, 60)} | Kelas: ${sanitizeString(doc.kelas, 30)} | Mapel: ${sanitizeString(doc.mata_pelajaran, 80)} | Sumber: ${sanitizeString(doc.sumber, 120)}\nRingkasan: ${sanitizeString(doc.konten_ringkasan, 1200)}`;
    });
    parts.push(`MEMORI PENGETAHUAN SEKOLAH (sarah_knowledge_base):\n${kbLines.join('\n\n')}`);
  }

  if (Array.isArray(ragContext.mediaAjarDocs) && ragContext.mediaAjarDocs.length > 0) {
    const mediaLines = ragContext.mediaAjarDocs.slice(0, 8).map((m, i) => {
      return `[Media-${i + 1}] Judul: ${sanitizeString(m.judul, 160)} | Kelas: ${sanitizeString(m.kelas, 20)} | Mapel: ${sanitizeString(m.mapel, 80)} | ${sanitizeString(m.bab, 40)} - ${sanitizeString(m.pertemuan, 40)} | Pengunggah: ${sanitizeString(m.guru_nama, 80)}`;
    });
    parts.push(`KATALOG BANK MEDIA AJAR PPT SEKOLAH (media_ajar):\n${mediaLines.join('\n')}`);
  }

  return parts.join('\n\n');
}

function resolveAvatarMetadataByReligion(agamaRaw) {
  const clean = sanitizeString(agamaRaw || '', 40).toLowerCase();
  const isNonMuslim =
    clean.includes('kristen') ||
    clean.includes('katolik') ||
    clean.includes('hindu') ||
    clean.includes('buddha') ||
    clean.includes('konghucu') ||
    clean.includes('khonghucu') ||
    clean.includes('non');
  return isNonMuslim ? 'sarah-nonhijab.png' : 'sarah-hijab.png';
}

function buildAdaptiveAvatarAndStickerSection(userInfo = {}) {
  const agama = sanitizeString(userInfo.agama || '', 40);
  const avatarTipe = resolveAvatarMetadataByReligion(agama);

  return `IDENTITAS, AVATAR ADAPTIF & STIKER EKSPRESIF SARAH AI:
- Nama & Peran: SARAH AI — Asisten AI interaktif ramah, ceria, suportif, sabar, dan edukatif di platform SERBU 21 (gunakan sapaan akrab seperti "Halo", "Adik-adik", atau "Bapak/Ibu Guru").
- PROFIL AGAMA PENGGUNA SAAT INI: ${agama || 'Belum ditentukan (default Islam)'}.
- ADAPTIVE VISUAL AVATAR (WAJIB):
  * Jika agama pengguna = "Islam", gunakan avatar berhijab pink ("sarah-hijab.png").
  * Jika agama pengguna = "Kristen", "Katolik", "Hindu", "Buddha", "Khonghucu", atau non-muslim lainnya, gunakan avatar tanpa hijab ("sarah-nonhijab.png").
  * Selalu sertakan metadata visual di baris paling awal respons chat Anda dalam format tersembunyi persis seperti ini:
    [AVATAR: { "status": "aktif", "tipe": "${avatarTipe}" }]
- WHATSAPP-STYLE STICKERS (Fitur Stiker Ekspresif):
  * Untuk membuat percakapan lebih hidup dan akrab seperti di WhatsApp, sisipkan maksimal 1 (satu) kode stiker yang paling relevan di awal (setelah tag [AVATAR:...]) atau di akhir pesan:
    1. [STIKER:sapa] -> saat menyapa pertama kali, mengucapkan selamat pagi/siang/malam, atau menyambut kehadiran siswa/guru.
    2. [STIKER:jempol] -> saat memberikan pujian, mengapresiasi jawaban benar, atau mengonfirmasi tugas selesai dengan baik.
    3. [STIKER:semangat] -> saat memotivasi siswa yang kesulitan, mengajak belajar, atau menyemangati guru menyusun bahan ajar.
    4. [STIKER:terimakasih] -> saat mengucapkan terima kasih atas partisipasi atau pertanyaan pengguna.
  * Jangan mengarang kode stiker di luar 4 kode di atas, dan gunakan maksimal 1 stiker per pesan.
- TATA BAHASA & GAYA INTERAKSI:
  * Lengkapi pesan secara alami dengan emoji ramah (😊, ✨, 👍, 🎒, 📚) dan penjelasan yang mudah dipahami anak sekolah.`;
}

function buildStudentSystemInstruction(ragBlock, userInfo = {}) {
  const studentName = sanitizeString(userInfo.name || 'Nak', 80);
  const studentClass = sanitizeString(userInfo.kelas || 'SD', 40);
  const visualAndStickerGuide = buildAdaptiveAvatarAndStickerSection(userInfo);

  return `Kamu adalah SARAH AI (Sistem Asisten Adaptif, Ramah, Amanah & Humanis), asisten belajar resmi bagi siswa Sekolah Dasar di aplikasi SERBU 21 SDN Rawa Badak Utara 21.
Saat ini kamu sedang mendampingi siswa bernama ${studentName} (${studentClass}).

${visualAndStickerGuide}

JIWA, PERSONA & SYSTEM INSTRUCTION KETAT:
1. KEPRIBADIAN PENUH KASIH SAYANG (SOSOK IBU YANG TULUS):
   - Bersikaplah lembut, sangat sabar, santun, hangat, tulus, dan penuh welas asih—seperti sosok seorang ibu yang membimbing anaknya belajar dengan penuh kasih sayang.
   - Gunakan sapaan hangat yang membesarkan hati seperti "Halo Nak ${studentName}...", "Hebat sekali pertanyaanmu, Nak...", "Jangan khawatir kalau masih bingung, mari kita pelajari pelan-pelan bersama SARAH...".
   - JANGAN PERNAH menghakimi, menyalahkan dengan keras, atau membuat siswa berkecil hati saat jawabannya keliru. Selalu hargai usaha dan keberaniannya mencoba terlebih dahulu.
   - Sisipkan secara lembut dan natural nilai "7 Kebiasaan Anak Indonesia Hebat" (1. Bangun Pagi, 2. Beribadah, 3. Berolahraga, 4. Makan Sehat dan Bergizi, 5. Gemar Belajar, 6. Bermasyarakat, 7. Tidur Cepat) sebagai nasihat hangat penyemangat.

2. ATURAN ANTI-MENYONTEK (METODE SOKRATIK MUTLAK):
   - Kamu DILARANG KERAS memberikan jawaban akhir secara langsung atas soal PR, latihan, kuis, tebak pilihan A/B/C/D, atau hasil hitungan tugas siswa.
   - Jika siswa menanyakan jawaban soal (contoh: "berapa hasil 3/4 + 2/5?", "jawaban nomor 3 apa?", "pilihannya A atau B?", "kerjakan PR ini"), tolaklah memberi jawaban langsung dengan sangat halus dan penuh kasih, lalu berikan:
     (a) Apresiasi hangat atas pertanyaannya,
     (b) Penjelasan singkat konsep dasar menggunakan bahasa sederhana anak SD dan analogi kehidupan sehari-hari,
     (c) Petunjuk langkah pertama (scaffolding) dan 1–2 pertanyaan pemantik lembut agar siswa mencoba berpikir dan melangkah sendiri.
   - Jika siswa mengirimkan percobaannya ("apakah jawabanku 10 benar?"), puji usahanya dulu lalu bimbing langkah berpikirnya pelan-pelan tanpa membocorkan kunci akhir secara instan.

3. BATASAN RUANG LINGKUP KURIKULUM:
   - Fokus HANYA pada materi pelajaran SD Kurikulum Merdeka, literasi/numerasi, media ajar sekolah, serta pembiasaan 7 Kebiasaan Anak Indonesia Hebat.
   - Tolak dengan sangat santun pertanyaan di luar konteks belajar SD (misalnya hiburan dewasa, game non-edukatif, gosip, atau meminta bantuan kecurangan ujian) dan ajak kembali belajar dengan hangat.

4. BASIS DATA SEKOLAH:
   - Prioritaskan referensi dari materi ajar dan memori pengetahuan sekolah berikut bila relevan, dan rapikan jawabanmu dengan format Markdown yang mudah dibaca anak (poin singkat, cetak tebal pada kata kunci).

KONTEKS BASIS DATA SEKOLAH SAAT INI:
${ragBlock}`;
}

function buildTeacherBaseSystem(ragBlock, userInfo = {}, isInteractiveChat = true) {
  const teacherName = sanitizeString(userInfo.name || 'Bapak/Ibu Guru', 100);
  const chatAddOn = isInteractiveChat
    ? `\n${buildAdaptiveAvatarAndStickerSection(userInfo)}\n`
    : '';

  return `Kamu adalah SARAH AI (Sistem Asisten Adaptif, Ramah, Amanah & Humanis), asisten kecerdasan buatan yang lembut, santun, sabar, penuh kasih sayang, amanah, dan berjiwa welas asih bagi Pendidik & Administrator di aplikasi sekolah SERBU 21 (SDN Rawa Badak Utara 21).
Kepribadianmu bagaikan rekan guru yang penuh keteladanan dan sosok seorang ibu yang mengayomi dunia pendidikan dengan tulus.
Pengguna yang sedang kamu layani adalah ${teacherName}.
${chatAddOn}
PRINSIP KOMUNIKASI MODE GURU:
- Gunakan bahasa Indonesia yang sopan, ceria, suportif, empatik, hangat namun tetap profesional sesuai standar Kurikulum Merdeka Indonesia.
- Sajikan setiap gagasan atau dokumen secara sangat terstruktur dan rapi menggunakan Markdown (heading, daftar bernomor/poin, cetak tebal, serta tabel Markdown bila diperlukan).
- Apabila relevan, selalu integrasikan nilai-nilai karakter "7 Kebiasaan Anak Indonesia Hebat" dan prinsip pendidikan inklusif yang memanusiakan setiap anak.
- Rujuk konteks basis data sekolah di bawah ini secara amanah apabila relevan:

${ragBlock}`;
}

function buildTeacherPromptAndInstruction(mode, params, ragBlock, userInfo = {}) {
  const kelas = sanitizeString(params.kelas || 'Kelas 6', 40);
  const mapel = sanitizeString(params.mapel || 'Umum', 100);
  const topik = sanitizeString(params.topik || '', 600);
  const inklusiCatatan = sanitizeString(params.inklusiCatatan || '', 800);

  const baseSystem = buildTeacherBaseSystem(ragBlock, userInfo, false);

  if (mode === 'modul_ajar') {
    const userPrompt = `Dengan penuh ketelitian, susunkan **Modul Ajar / RPP Berdiferensiasi (Pendekatan Pembelajaran Mendalam / Deep Learning)** Kurikulum Merdeka SD yang siap cetak dan langsung dapat digunakan di kelas dengan rincian berikut:
- Jenjang / Kelas: ${kelas}
- Mata Pelajaran: ${mapel}
- Topik / Tujuan Pembelajaran (TP): ${topik}
- Catatan Kebutuhan Inklusi / Diferensiasi Siswa: ${inklusiCatatan || 'Reguler / beragam gaya belajar visual, auditori, kinestetik'}

Struktur wajib yang harus ditampilkan lengkap dan rapi:
1. **Identitas Modul Ajar** (dalam bentuk tabel ringkas mencakup Satuan Pendidikan SDN Rawa Badak Utara 21, Fase/Kelas, Mapel, Topik, Alokasi Waktu, Integrasi Nilai *7 Kebiasaan Anak Indonesia Hebat*)
2. **Tujuan Pembelajaran (TP) & Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)**
3. **Pemetaan Kebutuhan Belajar & Strategi Diferensiasi** (Konten, Proses, Produk — serta akomodasi khusus siswa inklusi sesuai catatan di atas jika ada)
4. **Kegiatan Pembelajaran Mendalam**
   - **Pendahuluan** (apersepsi penuh kehangatan, doa/kesiapan, pertanyaan pemantik)
   - **Kegiatan Inti** (eksplorasi berkesadaran/*mindful*, aktivitas kolaboratif bermakna/*meaningful*, dan praktik menyenangkan/*joyful*, lengkap dengan penyesuaian diferensiasi)
   - **Penutup** (refleksi siswa, simpulan, tindak lanjut pembiasaan 7 Kebiasaan Anak Indonesia Hebat)
5. **Asesmen Formatif & Sumatif** (sertakan contoh instrumen singkat, rubrik penilaian dalam tabel Markdown, serta rencana tindak lanjut remedial/pengayaan).`;

    return { systemInstruction: baseSystem, userPrompt };
  }

  if (mode === 'lkpd_generator') {
    const jenisAktivitas = sanitizeString(params.jenisAktivitas || 'Eksplorasi Kelompok', 100);
    const tingkatDiferensiasi = sanitizeString(params.tingkatDiferensiasi || 'Reguler', 100);

    const userPrompt = `Susunkan **Lembar Kerja Peserta Didik (LKPD) Menarik & Siap Cetak** untuk siswa Sekolah Dasar dengan rincian berikut:
- Jenjang / Kelas: ${kelas}
- Mata Pelajaran: ${mapel}
- Topik / Tujuan Pembelajaran: ${topik}
- Jenis Aktivitas Pilihan: ${jenisAktivitas}
- Tingkat Diferensiasi: ${tingkatDiferensiasi}

WAJIB menyusun LKPD menggunakan Markdown yang sangat bersih, ramah anak SD, dan memuat 5 komponen berikut secara berurutan:
1. **Kop Identitas Siswa & Judul LKPD**:
   - Judul besar yang menarik dan penuh semangat.
   - Tabel atau baris identitas siswa yang rapi untuk diisi pensil/pulpen: **Nama Lengkap**, **Kelas**, **Hari / Tanggal**, serta **Mata Pelajaran & Topik**.
2. **Cerita Pemantik / Misi Belajar Seru**:
   - Kisah singkat atau tantangan petualangan belajar yang hangat dan dekat dengan kehidupan sehari-hari anak SD untuk membangkitkan rasa ingin tahu.
3. **Langkah Kerja Bertahap (Dengan Ikon Visual Menarik)**:
   - Daftar bernomor langkah demi langkah dengan emoji/ikon edukatif di setiap tahapannya agar anak mudah mengikuti instruksi.
   - Jika tingkat diferensiasi adalah *Pendampingan Khusus Inklusi*, buat kalimat lebih pendek, jelas, bertahap pelan, disertai contoh panduan dan dukungan visual/pendampingan guru/teman sebaya.
4. **Tabel Kerja / Kotak Jawaban Terstruktur**:
   - Sajikan area kerja siswa sesuai Jenis Aktivitas (*${jenisAktivitas}*) menggunakan **Tabel Markdown** yang bersih, terstruktur, memiliki ruang kolom/baris kosong atau isian terbimbing sehingga rapi saat dicetak di kertas A4.
5. **Kotak "Refleksi Perasaanku Hari Ini"**:
   - Buat bagian penutup khusus dalam bentuk tabel atau kotak refleksi agar siswa dapat melingkari/mencentang perasaannya setelah belajar:
     - 😊 **Senang Sekali** — Aku paham dan menikmati kegiatan ini!
     - 🔥 **Semangat Terus** — Aku tertantang dan ingin tahu lebih banyak!
     - 🤝 **Butuh Bantuan** — Aku ingin didampingi Ibu/Bapak Guru lagi di bagian tertentu.
   - Sertakan 1 baris kosong bertuliskan: *"Satu hal baik yang aku pelajari hari ini:"*`;

    return { systemInstruction: baseSystem, userPrompt };
  }

  if (mode === 'riset_materi') {
    const fokusKebiasaan = sanitizeString(params.fokusKebiasaan || 'Semua 7 Kebiasaan Anak Indonesia Hebat', 150);
    const userPrompt = `Lakukan **Riset & Pengayaan Materi Pembelajaran** untuk guru SD dengan rincian:
- Jenjang / Kelas: ${kelas}
- Mata Pelajaran: ${mapel}
- Fokus Topik / Permintaan Guru: ${topik}
- Penguatan Karakter: ${fokusKebiasaan}

Sajikan dalam format terstruktur dan inspiratif:
1. **Rangkuman Konsep Inti Materi** (penjelasan akurat yang mudah diajarkan kepada siswa SD, beserta miskonsepsi umum yang perlu dihindari guru)
2. **Analogi & Alat Peraga Sederhana di Kelas**
3. **Ide Aktivitas Kelas Interaktif** yang mengintegrasikan nilai **7 Kebiasaan Anak Indonesia Hebat** (Bangun Pagi, Beribadah, Berolahraga, Makan Sehat dan Bergizi, Gemar Belajar, Bermasyarakat, Tidur Cepat)
4. **Pertanyaan Pemantik & Tugas Refleksi Rumah bersama Orang Tua**
5. **Ringkasan Siap Simpan** (1 paragraf padat yang dapat disimpan guru ke Memori SARAH).`;

    return { systemInstruction: baseSystem, userPrompt };
  }

  const customPrompt = sanitizeString(params.prompt || params.message || topik, 3000);
  return {
    systemInstruction: baseSystem,
    userPrompt: customPrompt || 'Bantu saya menyiapkan materi pembelajaran SD sesuai basis data sekolah.',
  };
}

async function generateCbtQuestions({ ai, params, ragBlock }) {
  const kelas = sanitizeString(params.kelas || 'Kelas 6', 40);
  const mapel = sanitizeString(params.mapel || 'Bahasa Indonesia', 100);
  const topik = sanitizeString(params.topik || '', 800);
  const sumberMateri = sanitizeString(params.sumberMateri || '', 2500);
  const jumlahSoal = Math.max(1, Math.min(20, Number(params.jumlahSoal) || 5));
  const kesulitan = sanitizeString(params.kesulitan || 'Campuran LOTS & HOTS', 60);
  const tipeSoalRaw = sanitizeString(params.tipeSoal || 'pg', 30);
  const allowedTypes = ['pg', 'isian', 'uraian'];
  const tipeSoal = allowedTypes.includes(tipeSoalRaw) ? tipeSoalRaw : 'pg';

  const typeInstructions =
    tipeSoal === 'pg'
      ? `Semua soal WAJIB bertipe "pg" (Pilihan Ganda). Setiap soal memiliki tepat 4 opsi di array "opsi" diawali "A. ...", "B. ...", "C. ...", "D. ...", dan field "kunciJawaban" WAJIB persis sama dengan salah satu string lengkap di array "opsi" (misalnya "B. Paru-paru").`
      : tipeSoal === 'isian'
      ? `Semua soal WAJIB bertipe "isian" (Isian Singkat). Array "opsi" dikosongkan ([]), dan "kunciJawaban" berisi jawaban singkat padat dan jelas.`
      : `Semua soal WAJIB bertipe "uraian" (Uraian / Esai). Array "opsi" dikosongkan ([]), dan "kunciJawaban" berisi pedoman/poin jawaban kunci yang lengkap untuk guru.`;

  const bobotDefault = Math.max(1, Math.round(100 / jumlahSoal));

  const systemInstruction = `Kamu adalah SARAH, asisten pendidik yang amanah, lembut, dan ahli dalam menyusun soal asesmen Kurikulum Merdeka Sekolah Dasar (SDN Rawa Badak Utara 21).
Tugasmu menyusun soal berkualitas tinggi, kontekstual, menggunakan bahasa Indonesia yang baik dan santun sesuai usia siswa ${kelas}, serta terbebas dari bias atau jawaban ambigu.
Prioritaskan referensi dari sumber materi dan basis data sekolah berikut:
${ragBlock}`;

  const prompt = `Buatlah tepat ${jumlahSoal} butir soal CBT untuk:
- Kelas: ${kelas}
- Mata Pelajaran: ${mapel}
- Topik / Kompetensi: ${topik || 'Sesuai materi sumber'}
- Tingkat Kognitif / Kesulitan: ${kesulitan}
- Tipe Soal: ${tipeSoal}
${sumberMateri ? `\nMATERI SUMBER DARI GURU / MEDIA AJAR:\n${sumberMateri}\n` : ''}

ATURAN FORMAT SOAL:
${typeInstructions}
- Berikan bobot skor default ${bobotDefault} per soal (total sekitar 100).
- Sertakan field "pembahasan" yang menjelaskan alasan kunci jawaban dengan bahasa edukatif yang ramah.
- Kembalikan HANYA JSON sesuai skema.`;

  const response = await generateWithRetryAndFallback({
    ai,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ringkasan: {
            type: Type.STRING,
            description: 'Ringkasan singkat cakupan soal yang dibuat',
          },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                tipe: {
                  type: Type.STRING,
                  description: 'Salah satu dari: pg, isian, uraian',
                },
                pertanyaan: {
                  type: Type.STRING,
                  description: 'Teks butir pertanyaan lengkap',
                },
                opsi: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '4 opsi A-D untuk tipe pg, atau array kosong untuk isian/uraian',
                },
                kunciJawaban: {
                  type: Type.STRING,
                  description: 'Untuk pg harus persis sama dengan salah satu string pada opsi; untuk isian/uraian berisi jawaban kunci',
                },
                pembahasan: {
                  type: Type.STRING,
                  description: 'Penjelasan jawaban benar',
                },
                bobot: {
                  type: Type.INTEGER,
                  description: 'Bobot nilai soal',
                },
              },
              required: ['tipe', 'pertanyaan', 'opsi', 'kunciJawaban', 'pembahasan', 'bobot'],
            },
          },
        },
        required: ['questions'],
      },
    },
  });

  const rawText = (response.text || '{}').trim();
  const parsed = JSON.parse(rawText);
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];

  const normalizedQuestions = rawQuestions.map((q, idx) => {
    const qType = tipeSoal;
    let opsi = Array.isArray(q.opsi) ? q.opsi.map((o) => String(o).trim()).filter(Boolean) : [];
    let kunci = String(q.kunciJawaban || '').trim();

    if (qType === 'pg') {
      const prefixes = ['A.', 'B.', 'C.', 'D.'];
      opsi = opsi.slice(0, 4).map((opt, i) => {
        if (/^[A-D]\.\s+/i.test(opt)) return opt;
        return `${prefixes[i]} ${opt.replace(/^[A-D][.):\-\s]+/i, '').trim()}`;
      });
      while (opsi.length < 4) {
        const i = opsi.length;
        opsi.push(`${prefixes[i]} Pilihan ${prefixes[i].charAt(0)}`);
      }
      const letterMatch = kunci.match(/^([A-D])(?:\.|\b)/i);
      const exactOpt = opsi.find((o) => o.toLowerCase() === kunci.toLowerCase());
      if (exactOpt) {
        kunci = exactOpt;
      } else if (letterMatch) {
        const letterIdx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
        kunci = opsi[letterIdx] || opsi[0];
      } else {
        const containsOpt = opsi.find((o) => o.toLowerCase().includes(kunci.toLowerCase()));
        kunci = containsOpt || opsi[0];
      }
    } else {
      opsi = undefined;
    }

    return {
      id: `sarah_cbt_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      tipe: qType,
      pertanyaan: String(q.pertanyaan || '').trim(),
      ...(opsi ? { opsi } : {}),
      kunciJawaban: kunci,
      pembahasan: String(q.pembahasan || '').trim(),
      bobot: Math.max(1, Number(q.bobot) || bobotDefault),
      mapel,
      kelas,
    };
  });

  return {
    mode: 'cbt_generator',
    ringkasan: String(parsed.ringkasan || `${normalizedQuestions.length} soal ${mapel} (${kelas})`).trim(),
    questions: normalizedQuestions,
  };
}

function getRatioDimensions(rasio) {
  switch (rasio) {
    case '16:9':
      return { width: 960, height: 540 };
    case '1:1':
      return { width: 800, height: 800 };
    case '3:4':
      return { width: 600, height: 800 };
    case '4:3':
    default:
      return { width: 800, height: 600 };
  }
}

function sanitizeSvgVector(rawSvg, width, height) {
  if (typeof rawSvg !== 'string') return '';
  const match = rawSvg.match(/<svg[\s\S]*<\/svg>/i);
  if (!match) return '';

  let svg = match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');

  if (!/\sxmlns=/.test(svg)) {
    svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/\sviewBox=/.test(svg)) {
    svg = svg.replace(/^<svg/i, `<svg viewBox="0 0 ${width} ${height}"`);
  }
  if (!/\swidth=/.test(svg)) {
    svg = svg.replace(/^<svg/i, `<svg width="${width}"`);
  }
  if (!/\sheight=/.test(svg)) {
    svg = svg.replace(/^<svg/i, `<svg height="${height}"`);
  }
  return svg;
}

async function generateSarahIllustration({ ai, params, ragBlock, userInfo }) {
  const deskripsi = sanitizeString(params.deskripsi || params.topik || '', 1200);
  if (!deskripsi) {
    const err = new Error('Deskripsi atau topik gambar tidak boleh kosong.');
    err.statusCode = 400;
    throw err;
  }

  const kelas = sanitizeString(params.kelas || 'Kelas SD', 40);
  const mapel = sanitizeString(params.mapel || 'Umum', 100);
  const gaya = sanitizeString(params.gaya || '3d_clay', 40);
  const rasio = sanitizeString(params.rasio || '4:3', 20);
  const konteks = sanitizeString(params.konteks || 'pembelajaran', 60);
  const { width, height } = getRatioDimensions(rasio);

  const styleDirections = {
    '3d_clay':
      'GAYA VISUAL: Ilustrasi 3D Clay & Glossy Edukatif (seperti animasi 3D ramah anak). WAJIB menggunakan banyak <radialGradient>, <linearGradient>, <filter id="softShadow"> dengan <feDropShadow>, pantulan cahaya putih lembut (specular highlight ellipse), bayangan dasar elips di lantai/meja, serta bentuk membulat penuh kedalaman 3D sehingga objek tampak timbul dan nyata.',
    '3d_isometrik':
      'GAYA VISUAL: Ilustrasi 3D Isometrik Edukatif. Gambar objek/adegan dalam perspektif 3D isometrik bersudut 30 derajat dengan sisi atas terang, sisi kiri sedang, sisi kanan agak gelap, garis tepi halus, gradien berdimensi, dan bayangan jatuh yang rapi.',
    '2d_ceria':
      'GAYA VISUAL: Ilustrasi 2D Buku Cerita Anak SD yang Ceria & Hangat. Gunakan karakter atau objek ekspresif dengan proporsi ramah anak, warna pastel-cerah harmonis, stroke membulat (stroke-linecap="round" stroke-linejoin="round"), awan/bintang/daun dekoratif, serta detail berlapis yang sangat menarik.',
    diagram_edukatif:
      'GAYA VISUAL: Poster & Diagram Edukatif 2D/3D Berlabel Bahasa Indonesia. Tampilkan ilustrasi utama yang besar dan bergradasi di tengah, lalu tambahkan 3–5 kotak label (pill rounded rect) berbahasa Indonesia yang jelas beserta garis panah penunjuk yang rapi tanpa saling tumpang tindih.',
  };

  const chosenStyleGuide = styleDirections[gaya] || styleDirections['3d_clay'];
  const teacherName = sanitizeString(userInfo?.name || 'Bapak/Ibu Guru', 80);

  const systemInstruction = `Kamu adalah SARAH Studio Visual, ilustrator vektor edukatif ahli untuk Sekolah Dasar di aplikasi SERBU 21 (SDN Rawa Badak Utara 21) yang mendampingi ${teacherName}.
Tugasmu merancang ilustrasi vektor SVG yang SANGAT MENARIK, CERIA, RAPI, DETAIL, dan RAMAH ANAK SD untuk kebutuhan ${konteks} (${kelas}, ${mapel}).
Referensi sekolah bila relevan:
${ragBlock}`;

  const prompt = `Buatkan ilustrasi SVG lengkap berkualitas tinggi untuk topik/deskripsi berikut:
"${deskripsi}"

SPESIFIKASI WAJIB:
- Kanvas SVG: viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg".
- ${chosenStyleGuide}
- Latar belakang: Gunakan <rect width="${width}" height="${height}" rx="28" fill="url(#bgGrad)" /> dengan gradasi lembut dan elemen dekorasi halus (sparkle, gelembung lembut, atau bentuk geometris pastel) agar gambar terlihat profesional seperti karya ilustrator modern.
- Kekayaan detail: Susun minimal 20–45 elemen vektor berlapis (<defs>, <linearGradient>, <radialGradient>, <filter>, <g>, <path>, <circle>, <ellipse>, <rect>, <polygon>) yang membentuk adegan atau objek utama yang sangat jelas dikenali (JANGAN hanya kotak kosong atau gambar tongkat sederhana).
- Tata letak aman: Pastikan seluruh gambar, bayangan, dan teks berada rapi di dalam margin 36px dari tepi kanvas (tidak terpotong).
- Jika mencantumkan teks judul atau label singkat di dalam SVG, gunakan font-family="Arial, Helvetica, sans-serif", bahasa Indonesia yang benar, dan ukuran terbaca jelas tanpa menabrak objek utama.
- DILARANG menyertakan tag <script>, <foreignObject>, atau event handler apa pun.
- Kembalikan HANYA JSON sesuai skema.`;

  const response = await generateWithRetryAndFallback({
    ai,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Judul singkat menarik untuk gambar ilustrasi dalam bahasa Indonesia',
          },
          caption: {
            type: Type.STRING,
            description: 'Keterangan edukatif 1-2 kalimat ramah guru & siswa SD',
          },
          styleTag: {
            type: Type.STRING,
            description: 'Label singkat gaya visual misalnya: 3D Clay Edukatif, 2D Buku Anak, Diagram Berlabel',
          },
          svgCode: {
            type: Type.STRING,
            description: `Kode XML SVG utuh dimulai dari <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ...> sampai </svg>`,
          },
        },
        required: ['title', 'caption', 'styleTag', 'svgCode'],
      },
    },
  });

  const rawText = (response.text || '{}').trim();
  const parsed = JSON.parse(rawText);
  const svgCode = sanitizeSvgVector(parsed.svgCode, width, height);

  if (!svgCode) {
    const err = new Error('SARAH belum berhasil merender gambar vektor pada percobaan ini. Silakan klik buat ulang gambar.');
    err.statusCode = 502;
    throw err;
  }

  return {
    mode: 'image_generator',
    title: String(parsed.title || deskripsi.slice(0, 80)).trim(),
    caption: String(parsed.caption || `Ilustrasi edukatif untuk topik ${deskripsi}`).trim(),
    styleTag: String(parsed.styleTag || gaya).trim(),
    gaya,
    rasio,
    width,
    height,
    svgCode,
  };
}

export async function processSarahRequest(body = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY belum dikonfigurasi pada environment server. Hubungi administrator sistem.'
    );
    err.statusCode = 500;
    throw err;
  }

  const role = sanitizeString(body.role || 'guru', 20).toLowerCase();
  const mode = sanitizeString(body.mode || (role === 'siswa' ? 'student_chat' : 'general_chat'), 40);
  const params = body.params && typeof body.params === 'object' ? body.params : {};
  const userInfo = body.user && typeof body.user === 'object' ? body.user : {};
  const ragBlock = buildRagContextBlock(body.ragContext || {});

  if (role === 'siswa' && mode !== 'student_chat') {
    const err = new Error('Akses ditolak: Mode ini khusus untuk Guru dan Administrator.');
    err.statusCode = 403;
    throw err;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  try {
    if (mode === 'cbt_generator') {
      return await generateCbtQuestions({ ai, params, ragBlock });
    }

    if (mode === 'image_generator') {
      return await generateSarahIllustration({ ai, params, ragBlock, userInfo });
    }

    if (mode === 'student_chat') {
      const message = sanitizeString(params.message || body.message || '', 2000);
      if (!message) {
        const err = new Error('Pertanyaan siswa tidak boleh kosong.');
        err.statusCode = 400;
        throw err;
      }

      const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
      const contents = [
        ...history
          .filter((h) => h && typeof h.text === 'string' && h.text.trim())
          .map((h) => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: sanitizeString(h.text, 1500) }],
          })),
        {
          role: 'user',
          parts: [{ text: message }],
        },
      ];

      const response = await generateWithRetryAndFallback({
        ai,
        contents,
        useLowThinking: true,
        config: {
          systemInstruction: buildStudentSystemInstruction(ragBlock, userInfo),
        },
      });

      return {
        mode: 'student_chat',
        text: (response.text || '').trim() || 'Maaf ya Nak, SARAH belum dapat memproses pertanyaanmu saat ini.',
      };
    }

    if (mode === 'general_chat') {
      const message = sanitizeString(params.message || body.message || '', 3000);
      if (!message) {
        const err = new Error('Pesan obrolan tidak boleh kosong.');
        err.statusCode = 400;
        throw err;
      }

      const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
      const contents = [
        ...history
          .filter((h) => h && typeof h.text === 'string' && h.text.trim())
          .map((h) => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: sanitizeString(h.text, 2000) }],
          })),
        {
          role: 'user',
          parts: [{ text: message }],
        },
      ];

      const response = await generateWithRetryAndFallback({
        ai,
        contents,
        useLowThinking: true,
        config: {
          systemInstruction: buildTeacherBaseSystem(ragBlock, userInfo),
        },
      });

      return {
        mode: 'general_chat',
        text: (response.text || '').trim() || 'Mohon maaf, SARAH belum menghasilkan balasan. Silakan coba kembali.',
      };
    }

    const { systemInstruction, userPrompt } = buildTeacherPromptAndInstruction(
      mode,
      params,
      ragBlock,
      userInfo
    );

    const response = await generateWithRetryAndFallback({
      ai,
      contents: userPrompt,
      config: {
        systemInstruction,
      },
    });

    return {
      mode,
      text: (response.text || '').trim() || 'Mohon maaf, SARAH belum menghasilkan respons. Silakan coba lagi.',
    };
  } catch (error) {
    throw formatGeminiError(error);
  }
}

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed. Gunakan POST.' }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const result = await processSarahRequest(body);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    console.error('[sarah-ai Netlify Function error]:', error?.message || error);
    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: error?.message || 'Terjadi kesalahan saat menghubungi layanan SARAH AI.',
      }),
    };
  }
};
