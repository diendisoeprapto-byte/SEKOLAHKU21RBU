/**
 * Utilitas sanitasi input & HTML untuk melindungi aplikasi SERBU 21
 * dari injeksi skrip (XSS), HTML berbahaya, dan overflow payload.
 */

export function sanitizeInput(value: unknown, maxLength = 1500): string {
  const raw = typeof value === 'string' ? value : value == null ? '' : String(value);
  if (!raw) return '';

  // Hapus blok <script> dan <style> beserta isinya
  let cleaned = raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?(?:iframe|object|embed|form|input|button|textarea|select|meta|link|base|svg)[^>]*>/gi, ' ')
    // Hapus sisa tag HTML lainnya sambil mempertahankan tanda < atau > matematika yang berdiri sendiri
    .replace(/<\/?[a-zA-Z!][a-zA-Z0-9:-]*(?:\s+[^>]*)?>/g, ' ')
    // Hapus skema berbahaya & inline event handler
    .replace(/(?:javascript|vbscript)\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/\bon(?:error|load|click|mouseover|focus|blur|submit|change|input|keydown|keyup)\s*=/gi, '')
    // Hilangkan karakter kontrol tak tampak (kecuali newline/tab)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  cleaned = cleaned.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (maxLength > 0 && cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength).trim();
  }
  return cleaned;
}

export function sanitizeText(value: unknown, maxLength = 2000): string {
  const cleaned = sanitizeInput(value, maxLength);
  return cleaned;
}

export function escapeHtmlText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Membersihkan fragmen HTML tepercaya (seperti output KaTeX atau template cetak internal)
 * agar bebas dari <script>, <iframe>, <object>, <embed>, event handler, dan URL javascript:.
 */
export function sanitizeHtmlFragment(html: unknown): string {
  const raw = typeof html === 'string' ? html : '';
  if (!raw) return '';

  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<\/?(?:script|iframe|object|embed|base|meta|link|form)\b[^>]*>/gi, '')
    .replace(/\s+on[a-zA-Z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href|action|formaction)\s*=\s*(["'])\s*(?:javascript|vbscript|data:text\/html)[\s\S]*?\2/gi, '$1=$2#$2');
}

export function mapFirestorePermissionError(err: unknown, fallback = 'Terjadi kendala saat menyimpan data ke Cloud SERBU 21.'): string {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  const code = String((err as any)?.code || '').toLowerCase();
  if (
    code.includes('permission-denied') ||
    msg.includes('permission-denied') ||
    msg.includes('missing or insufficient permissions')
  ) {
    return 'Akses Ditolak oleh Server: Anda tidak memiliki izin untuk mengubah data ini.';
  }
  if ((err as any)?.message) {
    return String((err as any).message);
  }
  return fallback;
}
