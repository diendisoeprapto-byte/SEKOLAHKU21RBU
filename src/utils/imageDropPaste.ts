import { useEffect, useRef } from 'react';

const DEFAULT_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;

function isAcceptedImageFile(file: File | null | undefined, acceptMimes?: string[]): file is File {
  if (!file) return false;
  const type = (file.type || '').toLowerCase();
  const isImageByType = type.startsWith('image/');
  const isImageByName = DEFAULT_IMAGE_EXTENSIONS.test(file.name || '');
  if (!isImageByType && !isImageByName) return false;
  if (acceptMimes && acceptMimes.length > 0 && type) {
    return acceptMimes.some((m) => m.toLowerCase() === type);
  }
  return true;
}

export function extractImageFilesFromDataTransfer(
  dataTransfer: DataTransfer | null | undefined,
  acceptMimes?: string[]
): File[] {
  if (!dataTransfer) return [];
  const results: File[] = [];

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    Array.from(dataTransfer.files).forEach((f) => {
      if (isAcceptedImageFile(f, acceptMimes)) {
        results.push(f);
      }
    });
  }

  if (results.length === 0 && dataTransfer.items && dataTransfer.items.length > 0) {
    Array.from(dataTransfer.items).forEach((item) => {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (isAcceptedImageFile(file, acceptMimes)) {
          results.push(file);
        }
      }
    });
  }

  return results;
}

export function extractImageFilesFromClipboard(
  clipboardData: DataTransfer | null | undefined,
  acceptMimes?: string[]
): File[] {
  if (!clipboardData) return [];
  const results: File[] = [];

  if (clipboardData.items && clipboardData.items.length > 0) {
    Array.from(clipboardData.items).forEach((item, idx) => {
      if (item.kind === 'file' || (item.type || '').toLowerCase().startsWith('image/')) {
        const raw = item.getAsFile();
        if (raw && isAcceptedImageFile(raw, acceptMimes)) {
          const ext = (raw.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
          const namedFile =
            raw.name && raw.name !== 'image.png'
              ? raw
              : new File([raw], `clipboard_${Date.now()}_${idx + 1}.${ext}`, {
                  type: raw.type || 'image/png',
                });
          results.push(namedFile);
        }
      }
    });
  }

  if (results.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
    Array.from(clipboardData.files).forEach((f) => {
      if (isAcceptedImageFile(f, acceptMimes)) {
        results.push(f);
      }
    });
  }

  return results;
}

export function hasDraggedFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.types && Array.from(dataTransfer.types).includes('Files')) {
    return true;
  }
  return Boolean(dataTransfer.items && dataTransfer.items.length > 0);
}

export function useWindowImagePaste({
  enabled,
  onImageFiles,
  acceptMimes,
}: {
  enabled: boolean;
  onImageFiles: (files: File[]) => void;
  acceptMimes?: string[];
}): void {
  const callbackRef = useRef(onImageFiles);
  callbackRef.current = onImageFiles;

  const acceptRef = useRef(acceptMimes);
  acceptRef.current = acceptMimes;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleWindowPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTextField =
        tag === 'input' ||
        tag === 'textarea' ||
        Boolean(target?.isContentEditable);

      const files = extractImageFilesFromClipboard(e.clipboardData, acceptRef.current);
      if (files.length === 0) return;

      const plainText = e.clipboardData?.getData('text/plain')?.trim() || '';
      if (isTextField && plainText && !target?.dataset?.allowImagePaste) {
        return;
      }

      e.preventDefault();
      callbackRef.current(files);
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => {
      window.removeEventListener('paste', handleWindowPaste);
    };
  }, [enabled]);
}
