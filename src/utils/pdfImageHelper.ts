export const resolveAbsoluteAssetUrl = (url?: string): string => {
  const raw = (url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return raw.startsWith('/')
      ? `${window.location.origin}${raw}`
      : `${window.location.origin}/${raw}`;
  }
  return raw;
};

export const formatTodayIndonesianDate = (): string => {
  return new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const loadImageDataUrlForPdf = async (url?: string): Promise<string | null> => {
  const resolved = resolveAbsoluteAssetUrl(url);
  if (!resolved) return null;
  if (resolved.startsWith('data:image/png') || resolved.startsWith('data:image/jpeg')) {
    return resolved;
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 2500);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const w = img.naturalWidth || img.width || 128;
        const h = img.naturalHeight || img.height || 128;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };

    img.src = resolved;
  });
};
