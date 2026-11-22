import { ActiveUser } from '../types';

export type SarahAttachmentKind = 'image' | 'pdf' | 'text';

export interface SarahChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  kind: SarahAttachmentKind;
  sizeBytes: number;
  base64Data?: string;
  previewDataUrl?: string;
  extractedText?: string;
}

export interface SarahChatAttachmentPayload {
  kind: SarahAttachmentKind;
  name: string;
  mimeType: string;
  base64Data?: string;
  extractedText?: string;
}

export const SARAH_MAX_ATTACHMENTS_PER_MSG = 3;
export const SARAH_MAX_PDF_RAW_BYTES = 3.5 * 1024 * 1024;
export const SARAH_MAX_IMAGE_RAW_BYTES = 12 * 1024 * 1024;
export const SARAH_MAX_DOC_RAW_BYTES = 8 * 1024 * 1024;
export const SARAH_MAX_TEXT_CHARS = 28000;
export const SARAH_MAX_TOTAL_PAYLOAD_CHARS = 4.6 * 1024 * 1024;

export const SARAH_CHAT_ACCEPTED_FILES =
  'image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json';

/**
 * Validasi otorisasi khusus: fitur upload file/gambar di chat SARAH AI
 * hanya diaktifkan untuk akun Endi Soeprapto (bukan siswa maupun user guru/admin lainnya).
 */
export function isEndiSoepraptoUser(
  user?: Pick<ActiveUser, 'role' | 'username' | 'name'> | null
): boolean {
  if (!user || user.role === 'siswa') return false;

  const normName = String(user.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normUsername = String(user.username || '')
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

export function sanitizeAttachmentName(rawName: string): string {
  const cleaned = String(rawName || 'lampiran')
    .replace(/[\u0000-\u001F\u007F<>:"/\\|?*]/g, '_')
    .trim();
  return (cleaned || 'lampiran').slice(0, 120);
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function compressAndEncodeImage(file: File): Promise<{
  mimeType: string;
  base64Data: string;
  previewDataUrl: string;
  sizeBytes: number;
}> {
  const normalizedMime =
    file.type === 'image/jpg' ? 'image/jpeg' : file.type.toLowerCase();

  // Keep GIF or moderately small PNG/JPEG/WEBP intact unless oversized
  if (normalizedMime === 'image/gif' || file.size <= 450 * 1024) {
    const buf = await file.arrayBuffer();
    const base64Data = arrayBufferToBase64(buf);
    const mimeType = normalizedMime || 'image/png';
    return {
      mimeType,
      base64Data,
      previewDataUrl: `data:${mimeType};base64,${base64Data}`,
      sizeBytes: file.size,
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gagal membaca gambar yang dipilih.'));
      el.src = objectUrl;
    });

    const maxDim = 1440;
    let width = img.naturalWidth || img.width || 1024;
    let height = img.naturalHeight || img.height || 1024;

    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const buf = await file.arrayBuffer();
      const base64Data = arrayBufferToBase64(buf);
      return {
        mimeType: normalizedMime || 'image/jpeg',
        base64Data,
        previewDataUrl: `data:${normalizedMime || 'image/jpeg'};base64,${base64Data}`,
        sizeBytes: file.size,
      };
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const outMime = normalizedMime === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(outMime, 0.84);
    const commaIdx = dataUrl.indexOf(',');
    const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
    const approxBytes = Math.round((base64Data.length * 3) / 4);

    return {
      mimeType: outMime,
      base64Data,
      previewDataUrl: dataUrl,
      sizeBytes: approxBytes,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function clampExtractedText(raw: string): string {
  const clean = String(raw || '').replace(/\u0000/g, '').trim();
  if (clean.length <= SARAH_MAX_TEXT_CHARS) return clean;
  return `${clean.slice(0, SARAH_MAX_TEXT_CHARS)}\n\n[...sebagian isi dokumen dipotong karena melebihi batas panjang pratinjau AI...]`;
}

export async function prepareSarahChatAttachment(file: File): Promise<SarahChatAttachment> {
  const name = sanitizeAttachmentName(file.name);
  const lowerName = name.toLowerCase();
  const mime = String(file.type || '').toLowerCase();
  const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 1. Gambar (PNG, JPG/JPEG, WEBP, GIF — blokir SVG untuk keamanan XSS)
  const isAllowedImage =
    mime === 'image/png' ||
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/webp' ||
    mime === 'image/gif' ||
    /\.(png|jpe?g|webp|gif)$/i.test(lowerName);

  if (isAllowedImage && mime !== 'image/svg+xml' && !lowerName.endsWith('.svg')) {
    if (file.size > SARAH_MAX_IMAGE_RAW_BYTES) {
      throw new Error(`Ukuran gambar "${name}" terlalu besar (maksimal 12 MB).`);
    }
    const encoded = await compressAndEncodeImage(file);
    return {
      id,
      name,
      mimeType: encoded.mimeType,
      kind: 'image',
      sizeBytes: encoded.sizeBytes,
      base64Data: encoded.base64Data,
      previewDataUrl: encoded.previewDataUrl,
    };
  }

  // 2. Dokumen PDF
  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    if (file.size > SARAH_MAX_PDF_RAW_BYTES) {
      throw new Error(
        `Ukuran PDF "${name}" (${formatAttachmentSize(file.size)}) melebihi batas 3,5 MB agar cepat diproses SARAH.`
      );
    }
    const buf = await file.arrayBuffer();
    const base64Data = arrayBufferToBase64(buf);
    return {
      id,
      name,
      mimeType: 'application/pdf',
      kind: 'pdf',
      sizeBytes: file.size,
      base64Data,
    };
  }

  // 3. Dokumen Word (.docx)
  if (
    lowerName.endsWith('.docx') ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    if (file.size > SARAH_MAX_DOC_RAW_BYTES) {
      throw new Error(`Ukuran file Word "${name}" melebihi batas 8 MB.`);
    }
    const buf = await file.arrayBuffer();
    const mammothMod = await import('mammoth');
    const mammoth = (mammothMod as any).default || mammothMod;
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    const extracted = clampExtractedText(result?.value || '');
    if (!extracted) {
      throw new Error(`File Word "${name}" tidak memiliki teks yang dapat dibaca.`);
    }
    return {
      id,
      name,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      kind: 'text',
      sizeBytes: file.size,
      extractedText: extracted,
    };
  }

  // 4. Spreadsheet Excel (.xlsx / .xls)
  if (
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  ) {
    if (file.size > SARAH_MAX_DOC_RAW_BYTES) {
      throw new Error(`Ukuran file Excel "${name}" melebihi batas 8 MB.`);
    }
    const buf = await file.arrayBuffer();
    const XLSXMod = await import('xlsx');
    const XLSX = (XLSXMod as any).default || XLSXMod;
    const workbook = XLSX.read(buf, { type: 'array' });
    const sheetTexts: string[] = [];
    for (const sheetName of (workbook.SheetNames || []).slice(0, 6)) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv && csv.trim()) {
        sheetTexts.push(`### Sheet: ${sheetName}\n${csv.trim()}`);
      }
    }
    const extracted = clampExtractedText(sheetTexts.join('\n\n'));
    if (!extracted) {
      throw new Error(`File Excel "${name}" kosong atau tidak memiliki sel terbaca.`);
    }
    return {
      id,
      name,
      mimeType: mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      kind: 'text',
      sizeBytes: file.size,
      extractedText: extracted,
    };
  }

  // 5. Dokumen Teks / CSV / Markdown / JSON
  if (
    /\.(txt|md|csv|json)$/i.test(lowerName) ||
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    mime === 'text/csv' ||
    mime === 'application/json'
  ) {
    if (file.size > 2 * 1024 * 1024) {
      throw new Error(`Ukuran file teks "${name}" melebihi batas 2 MB.`);
    }
    const rawText = await file.text();
    const extracted = clampExtractedText(rawText);
    if (!extracted) {
      throw new Error(`File "${name}" kosong.`);
    }
    return {
      id,
      name,
      mimeType: mime || 'text/plain',
      kind: 'text',
      sizeBytes: file.size,
      extractedText: extracted,
    };
  }

  throw new Error(
    `Format "${name}" belum didukung. Gunakan gambar (PNG/JPG/WEBP/GIF), PDF, Word (.docx), Excel (.xlsx/.xls/.csv), atau teks (.txt/.md/.json).`
  );
}

export function estimateAttachmentsPayloadSize(attachments: SarahChatAttachment[]): number {
  return attachments.reduce(
    (sum, att) => sum + (att.base64Data?.length || 0) + (att.extractedText?.length || 0),
    0
  );
}

export function toAttachmentPayloads(
  attachments: SarahChatAttachment[]
): SarahChatAttachmentPayload[] {
  return attachments.map((att) => ({
    kind: att.kind,
    name: att.name,
    mimeType: att.mimeType,
    ...(att.base64Data ? { base64Data: att.base64Data } : {}),
    ...(att.extractedText ? { extractedText: att.extractedText } : {}),
  }));
}
