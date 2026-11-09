import mammoth from 'mammoth';
import { CBTQuestion, TKAQuestion, TKAJenis } from '../types';

export interface DocxParseResult {
  success: boolean;
  count: number;
  questions: CBTQuestion[];
  rawText: string;
  error?: string;
}

/**
 * Membaca dan mengurai butir-butir soal dari berkas dokumen Microsoft Word (.docx)
 * Format umum:
 * 1. Pertanyaan soal ...
 * A. Pilihan A
 * B. Pilihan B
 * C. Pilihan C
 * D. Pilihan D
 * Kunci: A
 * Pembahasan: Pembahasan soal...
 */
export async function parseQuestionsFromDocx(file: File): Promise<DocxParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const { value: rawText } = await mammoth.extractRawText({ arrayBuffer });

    if (!rawText || !rawText.trim()) {
      return {
        success: false,
        count: 0,
        questions: [],
        rawText: '',
        error: 'Dokumen Word kosong atau tidak dapat terbaca teksnya.',
      };
    }

    const questions: CBTQuestion[] = [];

    // Pisahkan teks berdasarkan pola nomor soal: "1.", "1)", "Soal 1:", "No. 1"
    const splitRegex = /(?:^|\n)\s*(?:(?:Soal|No\.?)?\s*(\d+)[\.\)]\s*)/i;
    const parts = rawText.split(splitRegex);

    if (parts.length > 2) {
      for (let i = 1; i < parts.length; i += 2) {
        const num = parts[i];
        const content = parts[i + 1]?.trim() || '';
        if (!content) continue;

        const q = parseSingleQuestionBlock(content, `q_docx_${Date.now()}_${num}`);
        if (q) questions.push(q);
      }
    } else {
      // Alternatif: pemisahan baris ganda
      const blocks = rawText.split(/\n\s*\n/).filter((b) => b.trim().length > 10);
      blocks.forEach((block, idx) => {
        const q = parseSingleQuestionBlock(block.trim(), `q_docx_${Date.now()}_${idx + 1}`);
        if (q) questions.push(q);
      });
    }

    return {
      success: true,
      count: questions.length,
      questions,
      rawText,
    };
  } catch (err: any) {
    console.error('Gagal membaca berkas docx:', err);
    return {
      success: false,
      count: 0,
      questions: [],
      rawText: '',
      error: err?.message || 'Gagal membaca berkas DOCX',
    };
  }
}

function parseSingleQuestionBlock(block: string, id: string): CBTQuestion | null {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  let pertanyaan = '';
  const opsi: string[] = [];
  let kunciJawaban: string = 'A';
  let pembahasan = '';

  const qLines: string[] = [];
  let inOptions = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Deteksi kunci jawaban
    const keyMatch = line.match(/^(?:Kunci|Jawaban|Kunci Jawaban|KUNCI)\s*[:=]\s*([A-Ea-e1-4]|\w+)/i);
    if (keyMatch) {
      kunciJawaban = keyMatch[1].trim().toUpperCase();
      continue;
    }

    // Deteksi pembahasan
    const pembMatch = line.match(/^(?:Pembahasan|Penjelasan|Keterangan)\s*[:=]\s*(.+)/i);
    if (pembMatch) {
      pembahasan = pembMatch[1].trim();
      continue;
    }

    // Deteksi opsi A, B, C, D, E
    const optMatch = line.match(/^([A-Ea-e])[\.\)]\s*(.+)/);
    if (optMatch) {
      inOptions = true;
      const optText = optMatch[2].trim();
      // Tandai jika ada bintang kunci jawaban, misal: *A. Jakarta
      if (optMatch[1].toUpperCase() === kunciJawaban) {
        opsi.push(optText);
      } else {
        opsi.push(optText);
      }
      continue;
    }

    if (!inOptions) {
      qLines.push(line);
    } else {
      // Sambungan opsi sebelumnya atau pembahasan
      if (opsi.length > 0) {
        opsi[opsi.length - 1] += ' ' + line;
      }
    }
  }

  pertanyaan = qLines.join(' ').trim();
  if (!pertanyaan) return null;

  // Tentukan tipe soal
  let tipe: CBTQuestion['tipe'] = 'pg';
  if (opsi.length === 0) {
    if (pertanyaan.toLowerCase().includes('jelaskan') || pertanyaan.toLowerCase().includes('uraikan')) {
      tipe = 'uraian';
    } else {
      tipe = 'isian';
    }
  } else if (opsi.length === 2 && opsi.some((o) => o.toLowerCase().includes('benar') || o.toLowerCase().includes('salah'))) {
    tipe = 'benar_salah';
  } else {
    tipe = 'pg';
  }

  // Jika opsi kurang dari 4 tapi pg, lengkapi placeholder
  if (tipe === 'pg') {
    while (opsi.length < 4) {
      opsi.push(`Pilihan ${String.fromCharCode(65 + opsi.length)}`);
    }
  }

  return {
    id,
    tipe,
    pertanyaan,
    opsi: tipe === 'pg' || tipe === 'benar_salah' ? opsi : undefined,
    kunciJawaban,
    bobot: 10,
    pembahasan: pembahasan || undefined,
  };
}

/**
 * Konversi hasil parsing DOCX ke bentuk TKAQuestion
 */
export function convertToTkaQuestions(
  questions: CBTQuestion[],
  mapel: string,
  jenisTka: TKAJenis
): TKAQuestion[] {
  return questions.map((q, idx) => ({
    ...q,
    id: `tka_docx_${Date.now()}_${idx + 1}`,
    mapel,
    jenisTka,
  }));
}
