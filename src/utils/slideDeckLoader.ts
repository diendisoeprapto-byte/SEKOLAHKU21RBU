import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ParsedSlide {
  index: number;
  kind: 'pdf-image' | 'embed-fallback';
  title?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  embedUrl?: string;
  aspectRatio?: number;
  fallbackReason?: string;
}

export interface LoadDeckOptions {
  fileId: string;
  isGoogleSlides: boolean;
  embedFallbackUrl: string | null;
  judul: string;
  signal?: AbortSignal;
  onProgress?: (slides: ParsedSlide[], totalSlides: number) => void;
}

const deckMemoryCache = new Map<string, ParsedSlide[]>();

function cacheDeck(key: string, slides: ParsedSlide[]) {
  if (deckMemoryCache.has(key)) {
    deckMemoryCache.delete(key);
  } else if (deckMemoryCache.size >= 8) {
    const oldestKey = deckMemoryCache.keys().next().value;
    if (oldestKey) deckMemoryCache.delete(oldestKey);
  }
  deckMemoryCache.set(key, slides);
}

async function renderPdfToSlides(
  bytes: Uint8Array,
  signal?: AbortSignal,
  onProgress?: (slides: ParsedSlide[], totalSlides: number) => void
): Promise<ParsedSlide[]> {
  // Gunakan font bawaan PDF asli agar tampilan dan isi 100% sesuai dokumen asli
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
  });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const rendered: ParsedSlide[] = [];

  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
      if (signal?.aborted) {
        throw new DOMException('Presentation loading aborted', 'AbortError');
      }

      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const aspectRatio = baseViewport.height > 0 ? baseViewport.width / baseViewport.height : 16 / 9;

      const targetWidth = 1600;
      const scale = Math.min(2.4, Math.max(1.25, targetWidth / Math.max(1, baseViewport.width)));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      let imageUrl = '';
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        imageUrl = canvas.toDataURL('image/png');
      }
      canvas.width = 0;
      canvas.height = 0;

      const thumbTargetWidth = 220;
      const thumbScale = Math.min(0.6, Math.max(0.15, thumbTargetWidth / Math.max(1, baseViewport.width)));
      const thumbViewport = page.getViewport({ scale: thumbScale });
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = Math.max(1, Math.floor(thumbViewport.width));
      thumbCanvas.height = Math.max(1, Math.floor(thumbViewport.height));
      const thumbCtx = thumbCanvas.getContext('2d');
      let thumbnailUrl = imageUrl;
      if (thumbCtx) {
        thumbCtx.fillStyle = '#ffffff';
        thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        await page.render({ canvasContext: thumbCtx, viewport: thumbViewport, canvas: thumbCanvas }).promise;
        thumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.78);
      }
      thumbCanvas.width = 0;
      thumbCanvas.height = 0;
      page.cleanup();

      rendered.push({
        index: pageNum - 1,
        kind: 'pdf-image',
        title: `Slide ${pageNum}`,
        imageUrl,
        thumbnailUrl,
        aspectRatio,
      });

      onProgress?.([...rendered], totalPages);
    }
  } finally {
    await loadingTask.destroy().catch(() => {});
  }

  return rendered;
}

export async function loadPresentationSlides(options: LoadDeckOptions): Promise<ParsedSlide[]> {
  const { fileId, isGoogleSlides, embedFallbackUrl, judul, signal, onProgress } = options;
  const cacheKey = `${isGoogleSlides ? 'slides' : 'file'}:${fileId}`;

  const cached = deckMemoryCache.get(cacheKey);
  if (cached && cached.length > 0) {
    onProgress?.(cached, cached.length);
    return cached;
  }

  let fallbackReason: string | undefined;

  try {
    const proxyUrl = `/api/media-proxy?fileId=${encodeURIComponent(fileId)}&kind=${
      isGoogleSlides ? 'slides' : 'file'
    }`;
    const response = await fetch(proxyUrl, { signal });

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const isPdf =
        bytes.length >= 4 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46;

      if (isPdf) {
        const slides = await renderPdfToSlides(bytes, signal, onProgress);
        if (slides.length > 0) {
          cacheDeck(cacheKey, slides);
          return slides;
        }
      }

      // Untuk berkas .pptx mentah yang belum dikonversi ke PDF oleh Google,
      // gunakan pemutar Google Drive/Slides asli agar tampilan & isi 100% identik tanpa error File Not Found.
      fallbackReason = 'Menggunakan pemutar pratinjau Google Drive asli.';
    } else {
      const errJson = await response.json().catch(() => null);
      fallbackReason = errJson?.error || `Status unduhan (${response.status})`;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw err;
    }
    fallbackReason = err?.message || 'Gagal memproses berkas presentasi.';
    console.warn('[MediaAjar] Beralih ke pemutar Google Drive/Slides asli:', err);
  }

  if (embedFallbackUrl) {
    const fallback: ParsedSlide[] = [
      {
        index: 0,
        kind: 'embed-fallback',
        title: judul || 'Presentasi Slide',
        embedUrl: embedFallbackUrl,
        aspectRatio: 16 / 9,
        fallbackReason,
      },
    ];
    onProgress?.(fallback, 1);
    return fallback;
  }

  return [];
}
