/**
 * Utilitas kompresi gambar sisi klien untuk soal & opsi CBT/TKA
 * agar paket berisi hingga 50 soal tetap ringan untuk localStorage & Firestore.
 */

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  skipThresholdBytes?: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca berkas gambar'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat pratinjau gambar'));
    img.src = src;
  });
}

/**
 * Mengompres gambar soal atau opsi jawaban ke dimensi & kualitas optimal
 * tanpa mengurangi keterbacaan teks/diagram di layar ujian.
 */
export async function compressQuestionImage(
  file: File,
  options: CompressImageOptions = {}
): Promise<string> {
  const {
    maxWidth = 960,
    maxHeight = 720,
    quality = 0.78,
    skipThresholdBytes = 45 * 1024,
  } = options;

  const rawDataUrl = await readFileAsDataUrl(file);

  // Jangan ubah SVG atau gambar yang sudah sangat kecil
  if (
    file.type === 'image/svg+xml' ||
    (file.size > 0 && file.size <= skipThresholdBytes && (file.type === 'image/jpeg' || file.type === 'image/webp'))
  ) {
    return rawDataUrl;
  }

  try {
    const img = await loadImageElement(rawDataUrl);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    if (!origW || !origH) {
      return rawDataUrl;
    }

    const scale = Math.min(1, maxWidth / origW, maxHeight / origH);
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return rawDataUrl;
    }

    // Isi latar putih agar gambar PNG transparan tetap jelas saat dikonversi
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Coba WebP lalu JPEG, pilih hasil terkecil dibanding raw
    let compressed = canvas.toDataURL('image/webp', quality);
    if (!compressed.startsWith('data:image/webp')) {
      compressed = canvas.toDataURL('image/jpeg', quality);
    } else {
      const jpegAlt = canvas.toDataURL('image/jpeg', quality);
      if (jpegAlt.length < compressed.length) {
        compressed = jpegAlt;
      }
    }

    return compressed.length < rawDataUrl.length ? compressed : rawDataUrl;
  } catch {
    return rawDataUrl;
  }
}
