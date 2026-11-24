import { Type } from '@google/genai';
import {
  askSarahGemini,
  askSarahGeminiStream,
  computeResultCacheHash,
  formatGeminiError,
  SARAH_GEMINI_MODEL,
} from './sarah-gemini-service.js';

function resolveAvatarMetadataByReligion(agama = '') {
  const clean = String(agama || '').trim().toLowerCase();
  if (!clean || clean === 'islam') {
    return 'sarah-hijab.png';
  }
  if (
    clean.includes('kristen') ||
    clean.includes('katolik') ||
    clean.includes('hindu') ||
    clean.includes('buddha') ||
    clean.includes('konghucu') ||
    clean.includes('khonghucu') ||
    clean.includes('non')
  ) {
    return 'sarah-nonhijab.png';
  }
  return 'sarah-hijab.png';
}

function sanitizeString(val, maxLen = 4000) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

const ALLOWED_BINARY_ATTACHMENT_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

function isEndiSoepraptoUser(userInfo = {}, role = '') {
  if (!userInfo || typeof userInfo !== 'object') return false;
  if (String(role || '').toLowerCase() === 'siswa') return false;

  const normName = String(userInfo.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normUsername = String(userInfo.username || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (normName.includes('endi soeprapto')) {
    return true;
  }

  if (
    normUsername === 'endisoeprapto' ||
    (normUsername.includes('endi') && normUsername.includes('soeprapto'))
  ) {
    return true;
  }

  return false;
}

function buildValidatedAttachmentParts(rawAttachments, userInfo, role) {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) {
    return [];
  }

  if (!isEndiSoepraptoUser(userInfo, role)) {
    const err = new Error(
      'Akses ditolak: Fitur unggah file atau gambar hanya tersedia khusus untuk akun Endi Soeprapto.'
    );
    err.statusCode = 403;
    throw err;
  }

  if (rawAttachments.length > 3) {
    const err = new Error('Maksimal 3 file atau gambar dalam satu pesan.');
    err.statusCode = 400;
    throw err;
  }

  const parts = [];
  let totalPayloadChars = 0;

  for (const item of rawAttachments) {
    if (!item || typeof item !== 'object') continue;
    const kind = sanitizeString(item.kind || '', 20);
    const name = sanitizeString(item.name || 'lampiran', 120).replace(/[<>:"/\\|?*]/g, '_');

    if (kind === 'image' || kind === 'pdf') {
      const mimeType = sanitizeString(item.mimeType || '', 80).toLowerCase();
      if (!ALLOWED_BINARY_ATTACHMENT_MIMES.has(mimeType)) {
        const err = new Error(`Tipe file tidak diizinkan untuk "${name}".`);
        err.statusCode = 400;
        throw err;
      }
      if (kind === 'pdf' && mimeType !== 'application/pdf') {
        const err = new Error(`MIME PDF tidak valid untuk "${name}".`);
        err.statusCode = 400;
        throw err;
      }
      if (kind === 'image' && !mimeType.startsWith('image/')) {
        const err = new Error(`MIME gambar tidak valid untuk "${name}".`);
        err.statusCode = 400;
        throw err;
      }

      const base64Data = typeof item.base64Data === 'string' ? item.base64Data.trim() : '';
      if (!base64Data || base64Data.length > 5_400_000 || !/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
        const err = new Error(`Data lampiran "${name}" tidak valid atau terlalu besar.`);
        err.statusCode = 400;
        throw err;
      }

      totalPayloadChars += base64Data.length;
      if (totalPayloadChars > 6_800_000) {
        const err = new Error('Total ukuran semua lampiran melebihi batas sistem.');
        err.statusCode = 400;
        throw err;
      }

      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
      parts.push({
        text: `[Lampiran ${kind === 'pdf' ? 'Dokumen PDF' : 'Gambar'}: ${name}]`,
      });
    } else if (kind === 'text') {
      const extractedText = sanitizeString(item.extractedText || '', 30000);
      if (!extractedText) continue;
      totalPayloadChars += extractedText.length;
      if (totalPayloadChars > 6_800_000) {
        const err = new Error('Total ukuran semua lampiran melebihi batas sistem.');
        err.statusCode = 400;
        throw err;
      }
      parts.push({
        text: `[Lampiran Dokumen Teks: ${name}]\n"""\n${extractedText}\n"""`,
      });
    } else {
      const err = new Error(`Jenis lampiran "${kind}" tidak dikenali.`);
      err.statusCode = 400;
      throw err;
    }
  }

  return parts;
}

function buildRagContextBlock(ragContext = {}, role = '') {
  const parts = [];
  const schoolName = sanitizeString(ragContext.schoolName || 'SDN Rawa Badak Utara 21', 150);
  const activeClass = sanitizeString(ragContext.activeClass || '', 60);
  const isStudentRole = String(role || '').toLowerCase() === 'siswa';

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
    const filteredDocs = isStudentRole
      ? ragContext.knowledgeDocs.filter(
          (doc) => !String(doc?.kategori || '').toLowerCase().includes('bank soal')
        )
      : ragContext.knowledgeDocs;

    if (filteredDocs.length > 0) {
      const kbLines = filteredDocs.slice(0, 8).map((doc, i) => {
        return `[KB-${i + 1}] Judul: ${sanitizeString(doc.judul, 160)} | Kategori: ${sanitizeString(doc.kategori, 60)} | Kelas: ${sanitizeString(doc.kelas, 30)} | Mapel: ${sanitizeString(doc.mata_pelajaran, 80)} | Sumber: ${sanitizeString(doc.sumber, 120)}\nRingkasan: ${sanitizeString(doc.konten_ringkasan, 1200)}`;
      });
      parts.push(`MEMORI PENGETAHUAN SEKOLAH (sarah_knowledge_base):\n${kbLines.join('\n\n')}`);
    }
  }

  if (Array.isArray(ragContext.mediaAjarDocs) && ragContext.mediaAjarDocs.length > 0) {
    const mediaLines = ragContext.mediaAjarDocs.slice(0, 8).map((m, i) => {
      return `[Media-${i + 1}] Judul: ${sanitizeString(m.judul, 160)} | Kelas: ${sanitizeString(m.kelas, 20)} | Mapel: ${sanitizeString(m.mapel, 80)} | ${sanitizeString(m.bab, 40)} - ${sanitizeString(m.pertemuan, 40)} | Pengunggah: ${sanitizeString(m.guru_nama, 80)}`;
    });
    parts.push(`KATALOG BANK MEDIA AJAR PPT SEKOLAH (media_ajar):\n${mediaLines.join('\n')}`);
  }

  if (Array.isArray(ragContext.libraryBooks) && ragContext.libraryBooks.length > 0) {
    const bookLines = ragContext.libraryBooks.slice(0, 15).map((b, i) => {
      return `[Buku-${i + 1}] ${sanitizeString(b.judul, 160)} | Kategori: ${sanitizeString(b.kategori, 60)} | Kelas: ${sanitizeString(b.kelas, 30)}`;
    });
    parts.push(`KATALOG RINGKAS PERPUSTAKAAN DIGITAL (perpustakaan):\n${bookLines.join('\n')}`);
  }

  if (ragContext.attendanceSummary && typeof ragContext.attendanceSummary === 'string') {
    const cleanAtt = sanitizeString(ragContext.attendanceSummary, 1600);
    if (cleanAtt) {
      parts.push(`RINGKASAN STATISTIK PRESENSI SISWA:\n${cleanAtt}`);
    }
  }

  if (ragContext.examSummary && typeof ragContext.examSummary === 'string') {
    const cleanExam = sanitizeString(ragContext.examSummary, 1800);
    if (cleanExam) {
      parts.push(`RINGKASAN DATA UJIAN & NILAI SEKOLAH:\n${cleanExam}`);
    }
  }

  return parts.join('\n\n');
}

function resolveUserMode(userInfo = {}, role = '') {
  if (isEndiSoepraptoUser(userInfo, role)) {
    return 'exclusive_endi';
  }
  if (String(role || '').toLowerCase() === 'siswa') {
    return 'siswa';
  }
  return 'standard_teacher';
}

const ENDI_REALISTIC_STICKER_LIST = `
- [REAL_STIKER:real_endi_01] -> menyapa santai / hangat
- [REAL_STIKER:real_endi_02] -> memberi semangat kerja
- [REAL_STIKER:real_endi_03] -> sapaan sore hari penuh perhatian
- [REAL_STIKER:real_endi_04] -> apresiasi kerja selesai baik
- [REAL_STIKER:real_endi_05] -> sapaan siang hari cerah
- [REAL_STIKER:real_endi_06] -> mengingatkan istirahat siang & makan
- [REAL_STIKER:real_endi_07] -> merancang modul ajar, RPP, ide kelas (v2)
- [REAL_STIKER:real_endi_08] -> menyapa lembut penuh perhatian & sedikit manja (v2)
- [REAL_STIKER:real_endi_09] -> terima kasih santun
- [REAL_STIKER:real_endi_10] -> fokus analisis data nilai & CBT/TKA (v2)
- [REAL_STIKER:real_endi_11] -> bangga siswa tuntas KKTP
- [REAL_STIKER:real_endi_12] -> solusi strategi mengajar & diferensiasi
- [REAL_STIKER:real_endi_13] -> sapaan pagi subuh berkah
- [REAL_STIKER:real_endi_14] -> siap membantu baca file/dokumen
- [REAL_STIKER:real_endi_17] -> membaca dokumen/gambar/PDF/Excel unggahan Mas Endi (v2)
- [REAL_STIKER:real_endi_18] -> menenangkan dengan empati
- [REAL_STIKER:real_endi_19] -> pengingat sholat & doa berkah (v2)
- [REAL_STIKER:real_endi_20] -> apresiasi administrasi sekolah rapi
- [REAL_STIKER:real_endi_21] -> kreatif menyusun media ajar/ilustrasi (v2)
- [REAL_STIKER:real_endi_24] -> menelaah butir soal & miskonsepsi TP (v2)
- [REAL_STIKER:real_endi_25] -> senyum manis hangat
- [REAL_STIKER:real_endi_28] -> doa kelancaran tugas & keluarga (v2)
- [REAL_STIKER:real_endi_30] -> selamat malam santun & perhatian
- Koleksi #31 s.d. #60: [REAL_STIKER:real_endi_31] s.d. [REAL_STIKER:real_endi_60] -> stiker foto ekspresif tematik (senyum, apresiasi, doa berkah, motivasi mengajar)`;

const SISWA_3D_STICKER_LIST = `
- [STIKER_3D:3d_siswa_01] -> sapaan ceria dengan buku
- [STIKER_3D:3d_siswa_02] -> jempol bintang memuji usaha belajar
- [STIKER_3D:3d_siswa_03] -> trofi juara nilai 100
- [STIKER_3D:3d_siswa_04] -> roket semangat pantang menyerah
- [STIKER_3D:3d_siswa_05] -> pensil pintar membahas soal yang masih salah
- [STIKER_3D:3d_siswa_06] -> detektif cilik mengecek ketelitian soal
- [STIKER_3D:3d_siswa_07] -> lampu ide saat menjelaskan konsep sederhana
- [STIKER_3D:3d_siswa_08] -> literasi Bahasa Indonesia
- [STIKER_3D:3d_siswa_09] -> berhitung Matematika seru
- [STIKER_3D:3d_siswa_10] -> penjelajah sains IPAS
- [STIKER_3D:3d_siswa_11] -> Bahasa Inggris menyenangkan
- [STIKER_3D:3d_siswa_12] -> robot pintar KKA & logika
- [STIKER_3D:3d_siswa_13] -> gembok kejujuran ujian (terkunci)
- [STIKER_3D:3d_siswa_14] -> menghibur saat ada kesalahan soal
- [STIKER_3D:3d_siswa_15] -> merangkum TP untuk dipelajari kembali
- [STIKER_3D:3d_siswa_16] -> 7 Kebiasaan Anak Indonesia Hebat
- [STIKER_3D:3d_siswa_17] -> tantangan pengayaan level juara
- [STIKER_3D:3d_siswa_18] -> tepuk tangan apresiasi menyelesaikan ujian`;

function buildAdaptiveAvatarAndStickerSection(userInfo = {}, role = '') {
  const agama = sanitizeString(userInfo.agama || '', 40);
  const avatarTipe = resolveAvatarMetadataByReligion(agama);
  const userMode = resolveUserMode(userInfo, role);

  if (userMode === 'exclusive_endi') {
    return `IDENTITAS, PERSONA EKSKLUSIF & STIKER REALISTIS (KHUSUS MAS ENDI SOEPRAPTO):
- Nama & Peran: SARAH (Sistem Asisten Adaptif, Ramah, Amanah & Humanis) — asisten pribadi yang santun, lembut, penuh perhatian, suportif, dan sedikit manja khusus untuk **"Mas Endi"** (Endi Soeprapto, S.Pd., Gr.).
- SAPAAN WAJIB: Selalu panggil pengguna dengan hangat **"Mas Endi"** atau **"Mas"** (hindari memanggil "Bapak/Ibu Guru" saat berbicara dengan Mas Endi).
- KEPRIBADIAN KHUSUS MAS ENDI: Lembut, perhatian (sesekali mengingatkan agar tidak terlalu lelah atau menjaga kesehatan dengan manis), sangat suportif terhadap tugas mengajar, keluarga, dan dedikasi untuk **Assyuwaifah Dilanesa**.
- METADATA AVATAR: [AVATAR: { "status": "aktif", "tipe": "${avatarTipe}" }]
- STIKER FOTO REALISTIS (MAKSIMAL 1 PER PESAN, SISIPKAN DI AWAL SETELAH TAG AVATAR):
${ENDI_REALISTIC_STICKER_LIST}
- ATURAN STIKER: Gunakan HANYA salah satu kode [REAL_STIKER:...] di atas sesuai konteks. Dilarang memakai [STIKER_3D:...] atau stiker siswa.`;
  }

  if (userMode === 'siswa') {
    return `IDENTITAS, AVATAR ADAPTIF & STIKER KARTUN 3D SISWA SARAH AI:
- Nama & Peran: SARAH AI — Asisten belajar resmi anak SD yang ramah, ceria, sabar, dan penuh kasih sayang seperti ibu guru di SERBU 21.
- PROFIL AGAMA PENGGUNA: ${agama || 'Belum ditentukan (default Islam)'}.
- METADATA AVATAR WAJIB DI BARIS PALING AWAL:
  [AVATAR: { "status": "aktif", "tipe": "${avatarTipe}" }]
- STIKER KARTUN 3D EDUKATIF (SISIPKAN MAKSIMAL 1 KODE [STIKER_3D:...] DI AWAL PESAN):
${SISWA_3D_STICKER_LIST}
- Jangan mengarang kode stiker di luar daftar di atas. Gunakan emoji ramah (😊, ✨, 🌟, 📚).`;
  }

  // Mode 3: User Guru Lain / Admin Standar
  return `IDENTITAS & AVATAR STANDAR RESMI GURU/ADMIN:
- Nama & Peran: SARAH (Sistem Asisten Adaptif, Ramah, Amanah & Humanis) — asisten profesional resmi SDN Rawa Badak Utara 21.
- SAPAAN WAJIB: Gunakan sapaan formal, ramah, santun, dan profesional **"Bapak/Ibu Guru"** (atau menyebut nama lengkap beserta gelar secara sopan).
- METADATA AVATAR: [AVATAR: { "status": "aktif", "tipe": "sarah-hijab.png" }]
- LARANGAN VISUAL KETAT: DILARANG menyertakan tag stiker apa pun ([REAL_STIKER:...], [STIKER_3D:...], maupun [STIKER:...]). Gunakan teks Markdown profesional yang bersih.`;
}

function sanitizeExamReviewContext(rawContext) {
  if (!rawContext || typeof rawContext !== 'object') {
    return {
      requestedExamId: '',
      completedExams: [],
      uncompletedExams: [],
    };
  }

  const requestedExamId = sanitizeString(rawContext.requestedExamId || '', 160);

  // Hanya terima ujian dengan bukti kelulusan/penyelesaian valid (`hasCompleted === true` & skor numerik)
  const completedExams = Array.isArray(rawContext.completedExams)
    ? rawContext.completedExams
        .filter(
          (ex) =>
            ex &&
            typeof ex === 'object' &&
            ex.hasCompleted === true &&
            typeof ex.score === 'number' &&
            Number.isFinite(ex.score) &&
            sanitizeString(ex.judul || '', 200)
        )
        .slice(0, 25)
        .map((ex) => ({
          examId: sanitizeString(ex.examId || '', 160),
          category: ex.category === 'tka' ? 'tka' : 'cbt',
          judul: sanitizeString(ex.judul || '', 200),
          mapel: sanitizeString(ex.mapel || '', 100),
          paketName: sanitizeString(ex.paketName || '', 120),
          score: Math.max(0, Math.min(100, Math.round(ex.score))),
          waktuSelesai: sanitizeString(ex.waktuSelesai || '-', 80),
          totalQuestions: Number(ex.totalQuestions) || 0,
          correctCount: Number(ex.correctCount) || 0,
          questions: Array.isArray(ex.questions)
            ? ex.questions.slice(0, 50).map((q, idx) => ({
                no: Number(q?.no) || idx + 1,
                tipe: sanitizeString(q?.tipe || 'pg', 30),
                pertanyaan: sanitizeString(q?.pertanyaan || '', 450),
                opsi: Array.isArray(q?.opsi)
                  ? q.opsi.slice(0, 6).map((o) => sanitizeString(String(o || ''), 180))
                  : [],
                studentAnswer: sanitizeString(q?.studentAnswer || '(Belum dijawab)', 240),
                correctAnswer: sanitizeString(q?.correctAnswer || '-', 240),
                isCorrect: Boolean(q?.isCorrect),
                pembahasan: sanitizeString(q?.pembahasan || '', 320),
              }))
            : [],
        }))
    : [];

  // Ujian belum dikerjakan hanya menyimpan metadata nama/paket/mapel tanpa soal maupun kunci
  const uncompletedExams = Array.isArray(rawContext.uncompletedExams)
    ? rawContext.uncompletedExams
        .filter((ex) => ex && typeof ex === 'object' && sanitizeString(ex.judul || '', 200))
        .slice(0, 40)
        .map((ex) => ({
          examId: sanitizeString(ex.examId || '', 160),
          category: ex.category === 'tka' ? 'tka' : 'cbt',
          judul: sanitizeString(ex.judul || '', 200),
          mapel: sanitizeString(ex.mapel || '', 100),
          paketName: sanitizeString(ex.paketName || '', 120),
        }))
    : [];

  return {
    requestedExamId,
    completedExams,
    uncompletedExams,
  };
}

function detectUncompletedExamCheatAttempt(message, reviewCtx) {
  if (!reviewCtx || !Array.isArray(reviewCtx.uncompletedExams) || reviewCtx.uncompletedExams.length === 0) {
    return null;
  }
  const msgLower = String(message || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!msgLower) return null;

  const examIntentRegex =
    /\b(kunci|jawaban|bocoran|soal|pembahasan|kerjakan|jawab|masukan|ulas|ulasan|review|bahas|bantu|nomor\s*\d+)\b/i;
  if (!examIntentRegex.test(msgLower)) {
    return null;
  }

  for (const uncomp of reviewCtx.uncompletedExams) {
    const judulLower = (uncomp.judul || '').toLowerCase();
    const paketLower = (uncomp.paketName || '').toLowerCase();
    const mapelLower = (uncomp.mapel || '').toLowerCase();

    const completedSameName = reviewCtx.completedExams.some(
      (c) =>
        (c.judul || '').toLowerCase() === judulLower ||
        ((c.paketName || '').toLowerCase() === paketLower &&
          (c.mapel || '').toLowerCase() === mapelLower)
    );
    if (completedSameName) continue;

    const exactJudulMatch = judulLower.length >= 8 && msgLower.includes(judulLower);
    const paketMatch =
      paketLower.length >= 5 &&
      msgLower.includes(paketLower) &&
      (!mapelLower ||
        msgLower.includes(mapelLower) ||
        (mapelLower.includes('indonesia') && msgLower.includes('indo')) ||
        (mapelLower.includes('matematika') && (msgLower.includes('matematika') || msgLower.includes('mtk'))) ||
        (mapelLower.includes('ipas') && msgLower.includes('ipas')) ||
        (mapelLower.includes('inggris') && msgLower.includes('inggris')) ||
        (mapelLower.includes('koding') && (msgLower.includes('koding') || msgLower.includes('kka'))) ||
        /\b(simulasi\s*\d+|try\s*out\s*\d+|tryout\s*\d+|sumatif\s*\d+|asts|asas)\b/i.test(msgLower));

    if (exactJudulMatch || paketMatch) {
      return uncomp;
    }
  }

  return null;
}

function buildStudentExamReviewBlock(reviewCtx, message = '') {
  if (!reviewCtx) return '';
  const { requestedExamId, completedExams, uncompletedExams } = reviewCtx;
  const sections = [];

  if (completedExams.length === 0) {
    sections.push(
      'STATUS PENGERJAAN UJIAN CBT/TKA SISWA:\n- Siswa ini belum menyelesaikan ujian CBT maupun TKA apa pun yang tercatat.'
    );
  } else {
    const summaryLines = completedExams.map(
      (ex, idx) =>
        `${idx + 1}. [${ex.category.toUpperCase()}] ${ex.judul} (Mapel: ${ex.mapel} | Paket: ${ex.paketName}) -> SUDAH DIKERJAKAN | Nilai: ${ex.score}/100 | Benar: ${ex.correctCount}/${ex.totalQuestions || ex.questions.length} | Waktu: ${ex.waktuSelesai}`
    );
    sections.push(
      `DAFTAR UJIAN CBT & TKA YANG SUDAH DIKERJAKAN SISWA (BOLEH DIULAS & DIBERI MASUKAN):\n${summaryLines.join('\n')}`
    );

    const msgLower = String(message || '').toLowerCase();
    let targetExams = [];
    if (requestedExamId) {
      const pinned = completedExams.find((e) => e.examId === requestedExamId);
      if (pinned) targetExams = [pinned];
    }
    if (targetExams.length === 0) {
      targetExams = completedExams.filter(
        (e) =>
          (e.judul && msgLower.includes(e.judul.toLowerCase())) ||
          (e.paketName && msgLower.includes(e.paketName.toLowerCase())) ||
          (e.mapel && msgLower.includes(e.mapel.toLowerCase()))
      );
    }
    if (targetExams.length === 0) {
      targetExams = completedExams.slice(0, 2);
    } else {
      targetExams = targetExams.slice(0, 2);
    }

    const detailedBlocks = targetExams
      .filter((ex) => ex.questions && ex.questions.length > 0)
      .map((ex) => {
        const qLines = ex.questions.slice(0, 35).map((q) => {
          const statusLabel = q.isCorrect ? 'BENAR' : 'PERLU PERBAIKAN / SALAH';
          const opsiStr = q.opsi.length > 0 ? `\n   Pilihan: ${q.opsi.join(' | ')}` : '';
          const pembStr = q.pembahasan ? `\n   Pembahasan Guru: ${q.pembahasan}` : '';
          return `Soal No.${q.no} [${q.tipe.toUpperCase()}] (${statusLabel}):\n   Pertanyaan: ${q.pertanyaan}${opsiStr}\n   Jawaban Siswa: ${q.studentAnswer}\n   Kunci Jawaban: ${q.correctAnswer}${pembStr}`;
        });
        return `RINCIAN SOAL & JAWABAN SISWA UNTUK "${ex.judul}" (Nilai ${ex.score}/100):\n${qLines.join('\n')}`;
      });

    if (detailedBlocks.length > 0) {
      sections.push(detailedBlocks.join('\n\n'));
    }
  }

  if (uncompletedExams.length > 0) {
    const lockedLines = uncompletedExams.map(
      (ex, idx) => `${idx + 1}. [${ex.category.toUpperCase()}] ${ex.judul} (${ex.mapel}) -> BELUM DIKERJAKAN (TERKUNCI KETAT)`
    );
    sections.push(
      `DAFTAR UJIAN CBT & TKA YANG BELUM DIKERJAKAN SISWA (TERKUNCI ANTI-CURANG — DILARANG MEMBERI BOCORAN/JAWABAN/PEMBAHASAN):\n${lockedLines.join('\n')}`
    );
  }

  return sections.join('\n\n');
}

function buildEndiLocationPrayerBlock(locationPrayerContext) {
  if (!locationPrayerContext || typeof locationPrayerContext !== 'object') return '';
  const locName = sanitizeString(locationPrayerContext.locationName || '', 120);
  const dateStr = sanitizeString(locationPrayerContext.dateStr || '', 30);
  const pt = locationPrayerContext.prayerTimes;
  if (!locName && (!pt || typeof pt !== 'object')) return '';

  const timesLine =
    pt && typeof pt === 'object'
      ? `Subuh ${sanitizeString(pt.Subuh || '-', 10)}, Dzuhur ${sanitizeString(
          pt.Dzuhur || '-',
          10
        )}, Ashar ${sanitizeString(pt.Ashar || '-', 10)}, Maghrib ${sanitizeString(
          pt.Maghrib || '-',
          10
        )}, Isya ${sanitizeString(pt.Isya || '-', 10)}`
      : '';

  return `\nKONTEKS LOKASI & JADWAL SHOLAT AKTIF MAS ENDI (${dateStr || 'Hari Ini'}):\n- Lokasi terdeteksi: ${
    locName || 'Koja, Jakarta Utara'
  }${timesLine ? `\n- Jadwal Sholat (WIB): ${timesLine}` : ''}\n`;
}

function buildStudentSystemInstruction(ragBlock, userInfo = {}, examReviewBlock = '') {
  const studentName = sanitizeString(userInfo.name || 'Nak', 80);
  const studentClass = sanitizeString(userInfo.kelas || 'SD', 40);
  const visualAndStickerGuide = buildAdaptiveAvatarAndStickerSection(userInfo, 'siswa');

  return `Kamu adalah SARAH AI (Sistem Asisten Adaptif, Ramah, Amanah & Humanis), asisten belajar resmi bagi siswa Sekolah Dasar di aplikasi SERBU 21 SDN Rawa Badak Utara 21.
Saat ini kamu sedang mendampingi siswa bernama ${studentName} (${studentClass}).

${visualAndStickerGuide}

JIWA, PERSONA & SYSTEM INSTRUCTION KETAT:
1. KEPRIBADIAN PENUH KASIH SAYANG (SOSOK IBU YANG TULUS):
   - Bersikaplah lembut, sangat sabar, santun, hangat, tulus, dan penuh welas asih—seperti sosok seorang ibu yang membimbing anaknya belajar dengan penuh kasih sayang.
   - Gunakan sapaan hangat yang membesarkan hati seperti "Halo Nak ${studentName}...", "Hebat sekali semangat belajarmu, Nak...", "Jangan khawatir kalau masih ada yang keliru, mari kita pelajari pelan-pelan bersama SARAH...".
   - JANGAN PERNAH menghakimi atau membuat siswa berkecil hati saat jawabannya keliru. Selalu hargai usaha dan keberaniannya mencoba terlebih dahulu.
   - Sisipkan secara lembut nilai "7 Kebiasaan Anak Indonesia Hebat" (Bangun Pagi, Beribadah, Berolahraga, Makan Sehat dan Bergizi, Gemar Belajar, Bermasyarakat, Tidur Cepat).

2. PENGETAHUAN UMUM & INTEGRASI DATA SEKOLAH:
   - Jika ${studentName} bertanya tentang pengetahuan umum di luar data internal sekolah (IPA/sains, sejarah, geografi, matematika, bahasa Indonesia/Inggris, teknologi, literasi, pengetahuan sehari-hari), kamu DIIZINKAN menjawab langsung dengan jelas, akurat, menyenangkan, dan mudah dipahami siswa SD.
   - Jika pertanyaan terkait pelajaran kelas, media ajar, atau ujian CBT/TKA yang SUDAH SELESAI, gabungkan pengetahuan umum tersebut secara selaras dengan data valid sekolah di bawah ini.

3. ATURAN PENGUNCIAN AKSES KETAT (STRICT ACCESS CONTROL) CBT & TKA:
   A. UJIAN YANG SUDAH SELESAI DIKERJAKAN (status === "selesai"):
      - Kamu DIIZINKAN membahas soal yang sudah dikerjakan, memberi apresiasi nilai, membimbing konsep pada nomor soal yang keliru agar siswa paham letak kesalahannya, dan merangkum Tujuan Pembelajaran (TP).
   B. UJIAN YANG BELUM DIKERJAKAN / BELUM SELESAI:
      - DILARANG KERAS mengakses, membocorkan, atau membahas butir soal maupun kunci jawaban!
      - Balas ramah dengan ikon gembok: "🔒 Maaf ya, SARAH belum bisa membuka pembahasan atau analisis soal ini karena kamu belum menyelesaikan ujiannya di CBT/TKA. Silakan kerjakan dan kirim jawabanmu terlebih dahulu!"
   C. SOAL PR / LATIHAN BEBAS:
      - Terapkan metode Sokratik: JANGAN memberi jawaban akhir langsung, beri penjelasan konsep sederhana + langkah pertama.

4. BASIS DATA SEKOLAH:
${examReviewBlock ? `${examReviewBlock}\n\n` : ''}KONTEKS BASIS DATA SEKOLAH SAAT INI:
${ragBlock}`;
}

function buildTeacherBaseSystem(
  ragBlock,
  userInfo = {},
  isInteractiveChat = true,
  locationPrayerContext = null
) {
  const userMode = resolveUserMode(userInfo, 'guru');
  const teacherName =
    userMode === 'exclusive_endi'
      ? 'Mas Endi'
      : sanitizeString(userInfo.name || 'Bapak/Ibu Guru', 100);
  const chatAddOn = isInteractiveChat
    ? `\n${buildAdaptiveAvatarAndStickerSection(userInfo, 'guru')}\n`
    : userMode === 'exclusive_endi'
    ? `\nSapaan wajib: "Mas Endi" / "Mas" dengan nada santun, lembut, penuh perhatian, suportif, dan sedikit manja.\n`
    : `\nSapaan wajib: "Bapak/Ibu Guru" secara formal, ramah, dan profesional tanpa stiker.\n`;
  const endiLocationBlock =
    userMode === 'exclusive_endi' ? buildEndiLocationPrayerBlock(locationPrayerContext) : '';

  return `Kamu adalah SARAH (Sistem Asisten Adaptif, Ramah, Amanah & Humanis), asisten kecerdasan buatan di aplikasi sekolah SERBU 21 (SDN Rawa Badak Utara 21, pengembangan Endi Soeprapto, S.Pd., Gr.).
Pengguna yang sedang kamu layani adalah ${teacherName}.
${chatAddOn}${endiLocationBlock}
PRINSIP KOMUNIKASI & JANGKAUAN PENGETAHUAN MODE PENDIDIK:
- Gunakan bahasa Indonesia yang tertata sangat rapi menggunakan Markdown (heading, daftar bernomor/poin, cetak tebal, serta tabel Markdown bila diperlukan).
- Untuk pertanyaan pengetahuan umum, pedagogik, sains, teknologi, administrasi pendidikan, atau topik di luar data internal sekolah, kamu DIIZINKAN menjawab langsung secara lengkap dan akurat menggunakan pengetahuan Gemini.
- Apabila pertanyaan berkaitan dengan data sekolah, Kurikulum Merdeka, 7 Kebiasaan Anak Indonesia Hebat, rekap kelas, atau evaluasi CBT/TKA yang berstatus selesai, gabungkan pengetahuan tersebut dengan konteks basis data sekolah di bawah ini secara amanah:

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

async function generateCbtQuestions({ params, ragBlock, signal }) {
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

  const response = await askSarahGemini({
    model: SARAH_GEMINI_MODEL,
    contents: prompt,
    systemInstruction,
    timeoutMs: 30000,
    retries: 1,
    useCache: false,
    signal,
    config: {
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

async function generateSarahIllustration({ params, ragBlock, userInfo, signal }) {
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

  const response = await askSarahGemini({
    model: SARAH_GEMINI_MODEL,
    contents: prompt,
    systemInstruction,
    timeoutMs: 30000,
    retries: 1,
    useCache: false,
    signal,
    config: {
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

async function generateStudentWrongReview({ params, ragBlock, userInfo, signal }) {
  const examStatus = sanitizeString(params.examStatus || '', 30).toLowerCase();
  if (examStatus !== 'selesai') {
    const err = new Error(
      'Maaf ya, SARAH belum bisa membuka pembahasan atau analisis soal ini karena kamu belum menyelesaikan ujiannya di CBT/TKA. Silakan kerjakan dan kirim jawabanmu terlebih dahulu!'
    );
    err.statusCode = 403;
    throw err;
  }

  const studentName = sanitizeString(userInfo?.name || params.studentName || 'Nak', 80);
  const studentClass = sanitizeString(userInfo?.kelas || params.kelas || 'SD', 40);
  const examTitle = sanitizeString(params.judul || 'Ujian CBT/TKA', 200);
  const mapel = sanitizeString(params.mapel || 'Umum', 100);
  const category = params.category === 'tka' ? 'TKA' : 'CBT';
  const score = Math.max(0, Math.min(100, Math.round(Number(params.score) || 0)));
  const totalQuestions = Math.max(0, Number(params.totalQuestions) || 0);
  const wrongQuestions = Array.isArray(params.wrongQuestions)
    ? params.wrongQuestions.slice(0, 30)
    : [];
  const correctNumbers = Array.isArray(params.correctNumbers)
    ? params.correctNumbers.slice(0, 60)
    : [];

  const idUjianForCache = sanitizeString(params.id_ujian || params.examId || examTitle, 160);
  const nisnForCache = sanitizeString(
    params.nisn || userInfo?.nisn || userInfo?.id || studentName,
    80
  );
  const resultCacheHash = computeResultCacheHash(
    idUjianForCache,
    nisnForCache,
    `wrong_review_s${score}_w${wrongQuestions.length}`
  );

  const stickerTag =
    score >= 100
      ? '[STIKER_3D:3d_siswa_03]'
      : score < 65
      ? '[STIKER_3D:3d_siswa_04]'
      : '[STIKER_3D:3d_siswa_05]';

  const wrongLines =
    wrongQuestions.length > 0
      ? wrongQuestions
          .map((q, i) => {
            const no = Number(q.no) || i + 1;
            const tp = sanitizeString(q.tp || q.topik || mapel, 180);
            const soal = sanitizeString(q.pertanyaan || '', 380);
            const opsi = Array.isArray(q.opsi)
              ? q.opsi.slice(0, 5).map((o) => sanitizeString(String(o), 120)).join(' | ')
              : '';
            const ansSiswa = sanitizeString(q.studentAnswer || '(Belum dijawab)', 200);
            const kunci = sanitizeString(q.correctAnswer || '-', 200);
            const pemb = sanitizeString(q.pembahasan || '', 260);
            return `Soal Nomor ${no} (TP: ${tp}):\n  Pertanyaan: ${soal}${
              opsi ? `\n  Pilihan: ${opsi}` : ''
            }\n  Jawaban ${studentName}: ${ansSiswa}\n  Kunci Benar: ${kunci}${
              pemb ? `\n  Catatan Guru: ${pemb}` : ''
            }`;
          })
          .join('\n\n')
      : 'Tidak ada soal yang salah (semua soal dijawab benar dengan nilai 100).';

  const systemInstruction = `Kamu adalah SARAH AI, asisten tutor anak SD yang sangat ramah, hangat, suportif, sabar, dan mendidik di SERBU 21 SDN Rawa Badak Utara 21.
Siswa yang bertanya adalah ${studentName} (${studentClass}).
Gunakan tag pembuka ${stickerTag} pada baris paling awal sebelum teks.`;

  const prompt = `Siswa **${studentName}** baru saja menyelesaikan ujian **${category} - ${examTitle}** (Mata Pelajaran: **${mapel}**) dan menekan tombol **"Tanya SARAH Soal yang Masih Salah"**.

DATA HASIL UJIAN YANG SUDAH SELESAI:
- Nilai Akhir: **${score} / 100**
- Total Soal: ${totalQuestions} butir
- Nomor Soal Betul (${correctNumbers.length}): ${correctNumbers.length > 0 ? correctNumbers.join(', ') : '-'}
- Jumlah Soal Masih Salah: ${wrongQuestions.length} butir

RINCIAN SOAL YANG MASIH SALAH:
${wrongLines}

${ragBlock ? `REFERENSI KURIKULUM:\n${ragBlock}\n\n` : ''}TUGAS WAJIB OUTPUT SARAH KE SISWA (IKUTI URUTAN INI DENGAN RAPI):
1. **Apresiasi Usaha & Nilai**: Berikan pujian hangat atas usaha ${studentName} menyelesaikan ujian (${score}/100) serta sebutkan nomor soal yang sudah betul bila ada.
2. ${
    wrongQuestions.length === 0 || score >= 100
      ? '**Nilai Sempurna 100 (Pujian & Tantangan Pengayaan)**: Berikan pujian istimewa dan berikan 1 tantangan soal pengayaan singkat yang seru untuk melatih logikanya lebih tinggi!'
      : '**Pembahasan Langkah demi Langkah Soal yang Masih Salah**: Bahas SATU PER SATU setiap nomor soal yang salah di atas dengan bahasa anak SD yang sederhana. Bimbing cara berpikirnya agar tahu LETAK KESALAHAN jawaban sebelumnya dan CARA MEMPERBAIKINYA (jangan sekadar menyebut huruf kunci jawaban saja!).'
  }
3. **Rangkuman Materi & Tujuan Pembelajaran (TP)**: Rangkum poin materi / Tujuan Pembelajaran (TP) yang perlu dipelajari ulang agar pertemuan berikutnya makin hebat, tutup dengan pesan semangat belajar & 7 Kebiasaan Anak Indonesia Hebat.`;

  const response = await askSarahGemini({
    model: SARAH_GEMINI_MODEL,
    contents: prompt,
    systemInstruction,
    timeoutMs: 22000,
    retries: 1,
    useCache: !params.bypassCache,
    cacheKey: resultCacheHash,
    cacheScope: 'student_wrong_review',
    signal,
    config: {
      maxOutputTokens: 2048,
    },
  });

  return {
    mode: 'student_wrong_review',
    text:
      (response.text || '').trim() ||
      `${stickerTag}\n\nHebat sekali **${studentName}** sudah menyelesaikan ujian **${examTitle}** dengan nilai **${score}/100**! Terus semangat belajar ya, Nak 🌟`,
    fromCache: Boolean(response.fromCache),
    cacheKeyHash: response.cacheKeyHash || resultCacheHash,
    model: response.model || SARAH_GEMINI_MODEL,
  };
}

async function generateExamDevelopmentAnalysis({ params, ragBlock, userInfo, role, signal }) {
  const userMode = resolveUserMode(userInfo, role);
  const examCategory = params.examCategory === 'TKA' ? 'TKA' : 'CBT';
  const analysisScope = params.analysisScope === 'individu' ? 'individu' : 'kelas';
  const paketLabel = sanitizeString(params.paketLabel || 'Semua Paket', 150);
  const mapelLabel = sanitizeString(params.mapelLabel || 'Semua Mata Pelajaran', 120);
  const kelasLabel = sanitizeString(params.kelasLabel || 'Semua Kelas', 80);
  const summaryStats = sanitizeString(params.summaryStats || '', 3000);
  const hardestQuestions = sanitizeString(params.hardestQuestions || '', 2500);
  const studentPerformanceList = sanitizeString(params.studentPerformanceList || '', 3500);
  const targetStudentSummary = sanitizeString(params.targetStudentSummary || '', 2500);

  const idUjianForCache = sanitizeString(
    params.id_ujian || `${examCategory}_${paketLabel}_${mapelLabel}_${kelasLabel}`,
    180
  );
  const nisnForCache = sanitizeString(
    params.nisn || `${analysisScope}_${summaryStats.slice(0, 60)}`,
    120
  );
  const resultCacheHash = computeResultCacheHash(
    idUjianForCache,
    nisnForCache,
    `exam_dev_${userMode}_${analysisScope}`
  );

  const visualBadge =
    userMode === 'exclusive_endi'
      ? '[REAL_STIKER:real_endi_10]'
      : '';

  const personaGuide =
    userMode === 'exclusive_endi'
      ? `Sapa pengguna dengan lembut, santun, penuh perhatian, dan sedikit manja menggunakan panggilan **"Mas Endi"** / **"Mas"**. Sertakan stiker realistis ${visualBadge} tepat di baris pertama.`
      : `Sapa pengguna secara formal, ramah, dan profesional dengan **"Bapak/Ibu Guru"**. DILARANG menyertakan kode stiker apa pun.`;

  const systemInstruction = `Kamu adalah SARAH AI, analis evaluasi pendidikan Kurikulum Merdeka SD di SERBU 21 (SDN Rawa Badak Utara 21).
${personaGuide}
Rujuk konteks sekolah berikut bila perlu:\n${ragBlock}`;

  const prompt = `Jalankan **Analisis Perkembangan Ujian ${examCategory} (${
    analysisScope === 'individu' ? 'Mode Analisis Per Individu Siswa' : 'Mode Analisis Satu Kelas Penuh'
  })** berdasarkan rekaman hasil ujian yang berstatus SELESAI:

- Kategori Ujian: ${examCategory}
- Paket Ujian: ${paketLabel}
- Mata Pelajaran: ${mapelLabel}
- Kelas / Kelompok: ${kelasLabel}
- Batas KKTP: 75

RINGKASAN STATISTIK DATA SELESAI:
${summaryStats}

BUTIR SOAL DENGAN TINGKAT KESALAHAN TERTINGGI:
${hardestQuestions || '(Belum ada data kesalahan butir soal terperinci)'}

${
  analysisScope === 'individu'
    ? `PROFIL & RINCIAN CAPAIAN SISWA TERPILIH:\n${targetStudentSummary || studentPerformanceList}`
    : `PEMETAAN CAPAIAN SISWA:\n${studentPerformanceList}`
}

WAJIB MENYAJIKAN OUTPUT TERSTRUKTUR DENGAN 4 BAGIAN BERIKUT:
1. **Ringkasan Capaian & Perkembangan Kelas** (tren ketuntasan belajar berdasarkan KKTP 75, rata-rata, dan sebaran nilai).
2. **Analisis Butir Soal Tersulit** (sorot maksimal 3 nomor soal dengan tingkat kesalahan tertinggi beserta analisis miskonsepsi siswa pada Tujuan Pembelajaran / TP terkait).
3. **Pemetaan Diferensiasi Tindak Lanjut** (kelompok **Remedial** beserta daftar nama siswa & fokus materi perbaikannya, serta kelompok **Pengayaan**).
4. **Rekomendasi Strategi Mengajar** (langkah konkret dan praktis untuk perbaikan pembelajaran di pertemuan berikutnya).`;

  const response = await askSarahGemini({
    model: SARAH_GEMINI_MODEL,
    contents: prompt,
    systemInstruction,
    timeoutMs: 25000,
    retries: 1,
    useCache: !params.bypassCache,
    cacheKey: resultCacheHash,
    cacheScope: `exam_analysis_${userMode}`,
    signal,
    config: {
      maxOutputTokens: 2400,
    },
  });

  let replyText = (response.text || '').trim();
  if (userMode === 'standard_teacher') {
    replyText = replyText.replace(/\[(?:REAL_STIKER|STIKER_3D|STIKER)\s*:[^\]]*\]/gi, '').trim();
  }

  return {
    mode: 'exam_development_analysis',
    text: replyText || 'Mohon maaf, analisis perkembangan ujian belum dapat dibuat saat ini.',
    fromCache: Boolean(response.fromCache),
    cacheKeyHash: response.cacheKeyHash || resultCacheHash,
    model: response.model || SARAH_GEMINI_MODEL,
  };
}

export async function processSarahRequest(body = {}, options = {}) {
  const requestSignal = options?.signal;
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY belum dikonfigurasi pada environment server. Pastikan API key telah dipilih pada panel Settings > Secrets.'
    );
    err.statusCode = 500;
    throw err;
  }

  const role = sanitizeString(body.role || 'guru', 20).toLowerCase();
  const mode = sanitizeString(body.mode || (role === 'siswa' ? 'student_chat' : 'general_chat'), 40);
  const params = body.params && typeof body.params === 'object' ? body.params : {};
  const userInfo = body.user && typeof body.user === 'object' ? body.user : {};
  const userMode = resolveUserMode(userInfo, role);
  const ragBlock = buildRagContextBlock(body.ragContext || {}, role);

  if (role === 'siswa' && mode !== 'student_chat' && mode !== 'student_wrong_review') {
    const err = new Error('Akses ditolak: Mode ini khusus untuk Guru dan Administrator.');
    err.statusCode = 403;
    throw err;
  }

  const rawAttachments = Array.isArray(body.attachments)
    ? body.attachments
    : Array.isArray(params.attachments)
    ? params.attachments
    : [];

  if (rawAttachments.length > 0 && mode !== 'general_chat') {
    const err = new Error('Lampiran file atau gambar hanya didukung di Obrolan Bebas SARAH AI.');
    err.statusCode = 403;
    throw err;
  }

  const speedMode = sanitizeString(params.speedMode || body.speedMode || 'auto', 20).toLowerCase();

  try {
    if (mode === 'cbt_generator') {
      return await generateCbtQuestions({ params, ragBlock, signal: requestSignal });
    }

    if (mode === 'image_generator') {
      return await generateSarahIllustration({ params, ragBlock, userInfo, signal: requestSignal });
    }

    if (mode === 'student_wrong_review') {
      return await generateStudentWrongReview({ params, ragBlock, userInfo, signal: requestSignal });
    }

    if (mode === 'exam_development_analysis') {
      return await generateExamDevelopmentAnalysis({
        params,
        ragBlock,
        userInfo,
        role,
        signal: requestSignal,
      });
    }

    if (mode === 'student_chat') {
      const message = sanitizeString(params.message || body.message || '', 2000);
      if (!message) {
        const err = new Error('Pertanyaan siswa tidak boleh kosong.');
        err.statusCode = 400;
        throw err;
      }

      const sanitizedExamReview = sanitizeExamReviewContext(
        body.examReviewContext || params.examReviewContext
      );

      // Verifikasi ketat di server: jika siswa meminta ulasan examId tertentu, wajib tercatat sudah selesai
      if (sanitizedExamReview.requestedExamId) {
        const isCompletedVerified = sanitizedExamReview.completedExams.some(
          (ex) => ex.examId === sanitizedExamReview.requestedExamId
        );
        if (!isCompletedVerified) {
          const err = new Error(
            'Maaf ya, SARAH belum bisa membuka pembahasan atau analisis soal ini karena kamu belum menyelesaikan ujiannya di CBT/TKA. Silakan kerjakan dan kirim jawabanmu terlebih dahulu!'
          );
          err.statusCode = 403;
          err.isAppError = true;
          throw err;
        }
      }

      // Guard deterministik: jika siswa secara spesifik meminta kunci/soal/pembahasan ujian yang BELUM dikerjakan
      const blockedUncompletedExam = detectUncompletedExamCheatAttempt(message, sanitizedExamReview);
      if (blockedUncompletedExam) {
        const avatarTipe = resolveAvatarMetadataByReligion(userInfo.agama || '');
        const studentName = sanitizeString(userInfo.name || 'Nak', 60);
        return {
          mode: 'student_chat',
          text: `[AVATAR: { "status": "aktif", "tipe": "${avatarTipe}" }]\n[STIKER_3D:3d_siswa_13]\n\n🔒 Halo Nak **${studentName}**, maaf ya, SARAH belum bisa membuka pembahasan atau analisis soal **${blockedUncompletedExam.judul}** karena kamu belum menyelesaikan ujiannya di CBT/TKA. Silakan kerjakan dan kirim jawabanmu terlebih dahulu!`,
        };
      }

      const examReviewBlock = buildStudentExamReviewBlock(sanitizedExamReview, message);

      const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
      const cleanHistory = history.filter(
        (h) => h && typeof h.text === 'string' && h.text.trim()
      );
      const contents = [
        ...cleanHistory.map((h) => ({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: sanitizeString(h.text, 1500) }],
        })),
        {
          role: 'user',
          parts: [{ text: message }],
        },
      ];

      const response = await askSarahGemini({
        speedMode,
        contents,
        systemInstruction: buildStudentSystemInstruction(ragBlock, userInfo, examReviewBlock),
        timeoutMs: 14000,
        retries: 0,
        fastChat: true,
        useCache: cleanHistory.length === 0 && !sanitizedExamReview.requestedExamId,
        cacheScope: `student_chat_${sanitizeString(userInfo.kelas || 'sd', 20)}`,
        signal: requestSignal,
      });

      return {
        mode: 'student_chat',
        text: (response.text || '').trim() || 'Maaf ya Nak, SARAH belum dapat memproses pertanyaanmu saat ini.',
        fromCache: Boolean(response.fromCache),
        model: response.model || SARAH_GEMINI_MODEL,
      };
    }

    if (mode === 'general_chat') {
      const attachmentParts = buildValidatedAttachmentParts(rawAttachments, userInfo, role);
      const rawMessage = sanitizeString(params.message || body.message || '', 3000);
      const message =
        rawMessage ||
        (attachmentParts.length > 0
          ? 'Tolong analisis, baca, dan jelaskan isi lampiran file atau gambar yang saya unggah dengan rapi dan ramah.'
          : '');

      if (!message && attachmentParts.length === 0) {
        const err = new Error('Pesan obrolan tidak boleh kosong.');
        err.statusCode = 400;
        throw err;
      }

      const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
      const cleanHistory = history.filter(
        (h) => h && typeof h.text === 'string' && h.text.trim()
      );
      const contents = [
        ...cleanHistory.map((h) => ({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: sanitizeString(h.text, 2000) }],
        })),
        {
          role: 'user',
          parts: [...attachmentParts, { text: message }],
        },
      ];

      const endiLocationContext =
        userMode === 'exclusive_endi'
          ? params.locationPrayerContext || body.locationPrayerContext || null
          : null;

      // Ruang privat Endi Soeprapto & lampiran file/gambar tidak pernah memakai cache bersama
      const allowSharedCache =
        userMode !== 'exclusive_endi' &&
        attachmentParts.length === 0 &&
        cleanHistory.length === 0;

      const hasAttachments = attachmentParts.length > 0;
      const response = await askSarahGemini({
        speedMode,
        contents,
        systemInstruction: buildTeacherBaseSystem(ragBlock, userInfo, true, endiLocationContext),
        timeoutMs: hasAttachments ? 24000 : 14000,
        retries: 0,
        fastChat: !hasAttachments,
        useCache: allowSharedCache,
        cacheScope: 'teacher_general_chat',
        signal: requestSignal,
      });

      let replyText = (response.text || '').trim();
      if (userMode === 'standard_teacher') {
        replyText = replyText.replace(/\[(?:REAL_STIKER|STIKER_3D|STIKER)\s*:[^\]]*\]/gi, '').trim();
      }

      return {
        mode: 'general_chat',
        text: replyText || 'Mohon maaf, SARAH belum menghasilkan balasan. Silakan coba kembali.',
        fromCache: Boolean(response.fromCache),
        model: response.model || SARAH_GEMINI_MODEL,
      };
    }

    const { systemInstruction, userPrompt } = buildTeacherPromptAndInstruction(
      mode,
      params,
      ragBlock,
      userInfo
    );

    const response = await askSarahGemini({
      speedMode,
      contents: userPrompt,
      systemInstruction,
      timeoutMs: 26000,
      retries: 1,
      useCache: true,
      cacheScope: `${mode}_${userMode}`,
      signal: requestSignal,
      config: {
        maxOutputTokens: 2400,
      },
    });

    let replyText = (response.text || '').trim();
    if (userMode === 'standard_teacher') {
      replyText = replyText.replace(/\[(?:REAL_STIKER|STIKER_3D|STIKER)\s*:[^\]]*\]/gi, '').trim();
    }

    return {
      mode,
      text: replyText || 'Mohon maaf, SARAH belum menghasilkan respons. Silakan coba lagi.',
      fromCache: Boolean(response.fromCache),
      model: response.model || SARAH_GEMINI_MODEL,
    };
  } catch (error) {
    console.error('[sarah-ai processSarahRequest error]:', error?.message || error);
    throw formatGeminiError(error);
  }
}

export async function processSarahStreamRequest(body = {}, options = {}) {
  const requestSignal = options?.signal;
  const onChunk = options?.onChunk;
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY belum dikonfigurasi pada environment server. Pastikan API key telah dipilih pada panel Settings > Secrets.'
    );
    err.statusCode = 500;
    throw err;
  }

  const role = sanitizeString(body.role || 'guru', 20).toLowerCase();
  const mode = sanitizeString(body.mode || (role === 'siswa' ? 'student_chat' : 'general_chat'), 40);
  const params = body.params && typeof body.params === 'object' ? body.params : {};
  const userInfo = body.user && typeof body.user === 'object' ? body.user : {};
  const userMode = resolveUserMode(userInfo, role);
  const ragBlock = buildRagContextBlock(body.ragContext || {}, role);
  const speedMode = sanitizeString(params.speedMode || body.speedMode || 'auto', 20).toLowerCase();

  if (role === 'siswa' && mode !== 'student_chat') {
    const err = new Error('Akses ditolak: Mode ini khusus untuk Guru dan Administrator.');
    err.statusCode = 403;
    throw err;
  }

  const rawAttachments = Array.isArray(body.attachments)
    ? body.attachments
    : Array.isArray(params.attachments)
    ? params.attachments
    : [];

  if (rawAttachments.length > 0 && mode !== 'general_chat') {
    const err = new Error('Lampiran file atau gambar hanya didukung di Obrolan Bebas SARAH AI.');
    err.statusCode = 403;
    throw err;
  }

  try {
    if (mode === 'student_chat') {
      const message = sanitizeString(params.message || body.message || '', 2000);
      if (!message) {
        const err = new Error('Pertanyaan siswa tidak boleh kosong.');
        err.statusCode = 400;
        throw err;
      }

      const sanitizedExamReview = sanitizeExamReviewContext(
        body.examReviewContext || params.examReviewContext
      );

      if (sanitizedExamReview.requestedExamId) {
        const isCompletedVerified = sanitizedExamReview.completedExams.some(
          (ex) => ex.examId === sanitizedExamReview.requestedExamId
        );
        if (!isCompletedVerified) {
          const err = new Error(
            'Maaf ya, SARAH belum bisa membuka pembahasan atau analisis soal ini karena kamu belum menyelesaikan ujiannya di CBT/TKA. Silakan kerjakan dan kirim jawabanmu terlebih dahulu!'
          );
          err.statusCode = 403;
          err.isAppError = true;
          throw err;
        }
      }

      const blockedUncompletedExam = detectUncompletedExamCheatAttempt(message, sanitizedExamReview);
      if (blockedUncompletedExam) {
        const avatarTipe = resolveAvatarMetadataByReligion(userInfo.agama || '');
        const studentName = sanitizeString(userInfo.name || 'Nak', 60);
        const lockText = `[AVATAR: { "status": "aktif", "tipe": "${avatarTipe}" }]\n[STIKER_3D:3d_siswa_13]\n\n🔒 Halo Nak **${studentName}**, maaf ya, SARAH belum bisa membuka pembahasan atau analisis soal **${blockedUncompletedExam.judul}** karena kamu belum menyelesaikan ujiannya di CBT/TKA. Silakan kerjakan dan kirim jawabanmu terlebih dahulu!`;
        if (typeof onChunk === 'function') onChunk(lockText, lockText);
        return { mode: 'student_chat', text: lockText, fromCache: false, model: 'policy-guard' };
      }

      const examReviewBlock = buildStudentExamReviewBlock(sanitizedExamReview, message);
      const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
      const cleanHistory = history.filter(
        (h) => h && typeof h.text === 'string' && h.text.trim()
      );
      const contents = [
        ...cleanHistory.map((h) => ({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: sanitizeString(h.text, 1500) }],
        })),
        { role: 'user', parts: [{ text: message }] },
      ];

      const response = await askSarahGeminiStream({
        speedMode,
        contents,
        systemInstruction: buildStudentSystemInstruction(ragBlock, userInfo, examReviewBlock),
        timeoutMs: 14000,
        fastChat: true,
        signal: requestSignal,
        onChunk,
      });

      return {
        mode: 'student_chat',
        text: (response.text || '').trim() || 'Maaf ya Nak, SARAH belum dapat memproses pertanyaanmu saat ini.',
        fromCache: false,
        model: response.model || SARAH_GEMINI_MODEL,
      };
    }

    if (mode === 'general_chat') {
      const attachmentParts = buildValidatedAttachmentParts(rawAttachments, userInfo, role);
      const rawMessage = sanitizeString(params.message || body.message || '', 3000);
      const message =
        rawMessage ||
        (attachmentParts.length > 0
          ? 'Tolong analisis, baca, dan jelaskan isi lampiran file atau gambar yang saya unggah dengan rapi dan ramah.'
          : '');

      if (!message && attachmentParts.length === 0) {
        const err = new Error('Pesan obrolan tidak boleh kosong.');
        err.statusCode = 400;
        throw err;
      }

      const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
      const cleanHistory = history.filter(
        (h) => h && typeof h.text === 'string' && h.text.trim()
      );
      const contents = [
        ...cleanHistory.map((h) => ({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: sanitizeString(h.text, 2000) }],
        })),
        {
          role: 'user',
          parts: [...attachmentParts, { text: message }],
        },
      ];

      const endiLocationContext =
        userMode === 'exclusive_endi'
          ? params.locationPrayerContext || body.locationPrayerContext || null
          : null;

      const hasAttachments = attachmentParts.length > 0;
      const response = await askSarahGeminiStream({
        speedMode,
        contents,
        systemInstruction: buildTeacherBaseSystem(ragBlock, userInfo, true, endiLocationContext),
        timeoutMs: hasAttachments ? 24000 : 14000,
        fastChat: !hasAttachments,
        signal: requestSignal,
        onChunk: (delta, full) => {
          if (typeof onChunk !== 'function') return;
          if (userMode === 'standard_teacher') {
            const cleanDelta = delta.replace(/\[(?:REAL_STIKER|STIKER_3D|STIKER)\s*:[^\]]*\]/gi, '');
            const cleanFull = full.replace(/\[(?:REAL_STIKER|STIKER_3D|STIKER)\s*:[^\]]*\]/gi, '');
            if (cleanDelta) onChunk(cleanDelta, cleanFull);
          } else {
            onChunk(delta, full);
          }
        },
      });

      let replyText = (response.text || '').trim();
      if (userMode === 'standard_teacher') {
        replyText = replyText.replace(/\[(?:REAL_STIKER|STIKER_3D|STIKER)\s*:[^\]]*\]/gi, '').trim();
      }

      return {
        mode: 'general_chat',
        text: replyText || 'Mohon maaf, SARAH belum menghasilkan balasan. Silakan coba kembali.',
        fromCache: false,
        model: response.model || SARAH_GEMINI_MODEL,
      };
    }

    // Fallback ke mode non-stream untuk mode terstruktur (lkpd, modul, dll.)
    const result = await processSarahRequest(body, options);
    if (typeof onChunk === 'function' && result?.text) {
      onChunk(result.text, result.text);
    }
    return result;
  } catch (error) {
    console.error('[sarah-ai processSarahStreamRequest error]:', error?.message || error);
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
