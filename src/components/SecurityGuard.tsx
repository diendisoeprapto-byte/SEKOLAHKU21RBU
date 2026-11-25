import React, { useEffect } from 'react';

const ALLOWED_SCRIPT_PREFIXES = [
  'https://cdn.tailwindcss.com',
  'https://www.gstatic.com',
  'https://apis.google.com',
  'https://cdnjs.cloudflare.com',
];

const ALLOWED_IFRAME_HOSTS = [
  'docs.google.com',
  'drive.google.com',
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'view.officeapps.live.com',
  'buku.kemdikbud.go.id',
  'sibi.kemdikbud.go.id',
  'appadministrasi.firebaseapp.com',
];

function isAllowedScriptNode(el: HTMLScriptElement): boolean {
  const src = (el.getAttribute('src') || '').trim();
  if (!src) {
    // Izinkan script JSON-LD atau module internal Vite, blokir inline script injeksi berbahaya
    const type = (el.getAttribute('type') || '').trim().toLowerCase();
    if (type === 'application/ld+json' || type === 'module') return true;
    const content = el.textContent || '';
    if (/eval\(|document\.cookie|localStorage\.clear|window\.location\s*=|atob\(/i.test(content)) {
      return false;
    }
    return true;
  }

  if (src.startsWith('/') || src.startsWith(window.location.origin)) {
    return true;
  }

  return ALLOWED_SCRIPT_PREFIXES.some((prefix) => src.startsWith(prefix));
}

function isAllowedIframeNode(el: HTMLIFrameElement): boolean {
  const src = (el.getAttribute('src') || '').trim();
  if (!src || src === 'about:blank') return true;
  if (/^(?:javascript|vbscript|data:text\/html)/i.test(src)) return false;
  if (src.startsWith('/') || src.startsWith(window.location.origin)) return true;

  try {
    const parsed = new URL(src, window.location.origin);
    if (parsed.origin === window.location.origin) return true;
    return ALLOWED_IFRAME_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

function scrubUnsafeNode(node: Node): void {
  if (!(node instanceof Element)) return;

  if (node.tagName === 'SCRIPT') {
    if (!isAllowedScriptNode(node as HTMLScriptElement)) {
      node.remove();
    }
    return;
  }

  if (node.tagName === 'IFRAME') {
    if (!isAllowedIframeNode(node as HTMLIFrameElement)) {
      node.remove();
    }
    return;
  }

  const nested = node.querySelectorAll('script, iframe');
  nested.forEach((child) => {
    if (child.tagName === 'SCRIPT' && !isAllowedScriptNode(child as HTMLScriptElement)) {
      child.remove();
    } else if (child.tagName === 'IFRAME' && !isAllowedIframeNode(child as HTMLIFrameElement)) {
      child.remove();
    }
  });
}

export const SecurityGuard: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((addedNode) => {
          scrubUnsafeNode(addedNode);
        });
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return null;
};
