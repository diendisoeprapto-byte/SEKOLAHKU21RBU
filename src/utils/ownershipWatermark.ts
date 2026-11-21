/**
 * ============================================================================
 * DIGITAL WATERMARK & PROOF OF OWNERSHIP
 * ----------------------------------------------------------------------------
 * Aplikasi                     : SERBU 21 (SDN Rawa Badak Utara 21)
 * Original Creator & Architect : Endi Soeprapto, S.Pd., Gr.
 * Dedikasi                     : "For my beloved daughter, Dilanesa"
 * Tahun                        : 2026
 * ============================================================================
 */

export const _CREATOR_SIGNATURE_ENDI_DILANESA = Object.freeze({
  raw: 'Endi Soeprapto - For my beloved daughter Dilanesa - 2026',
  appName: 'SERBU 21',
  institution: 'SDN Rawa Badak Utara 21',
  creator: 'Endi Soeprapto, S.Pd., Gr.',
  dedication: 'For my beloved daughter, Dilanesa',
  year: 2026,
  systemVersion: 'SERBU21-2026.1',
  checksumSeed: 'SERBU21::ENDI_SOEPRAPTO::DILANESA::2026',
});

export interface SystemOwnershipStatus {
  verified: boolean;
  signature: string;
  systemVersion: string;
  creator: string;
  dedication: string;
  year: number;
  checksum: string;
}

function computeSignatureChecksum(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `S21-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

export const SYSTEM_CREDIT_TEXT =
  'SERBU 21 — Dikembangkan oleh Endi Soeprapto, S.Pd., Gr. | For my beloved daughter, Dilanesa';

// Browser Console Watermark (IIFE) — otomatis dicetak saat halaman dimuat
(function renderBrowserConsoleWatermark() {
  if (typeof window === 'undefined' || typeof console === 'undefined') return;

  const win = window as unknown as Record<string, unknown>;
  if (win.__SERBU21_CONSOLE_WATERMARK_PRINTED__) return;
  win.__SERBU21_CONSOLE_WATERMARK_PRINTED__ = true;

  const badgeStyle =
    'background: linear-gradient(90deg, #be123c, #e11d48); color: #ffffff; font-size: 13px; font-weight: 800; padding: 6px 12px; border-radius: 6px 0 0 6px;';
  const subBadgeStyle =
    'background: #1e293b; color: #fde047; font-size: 13px; font-weight: 700; padding: 6px 12px; border-radius: 0 6px 6px 0;';
  const creatorStyle =
    'color: #0f172a; background: #f8fafc; font-size: 12px; font-weight: 700; padding: 4px 10px; border-left: 4px solid #e11d48;';
  const dedicationStyle =
    'color: #9f1239; background: #fff1f2; font-size: 12px; font-style: italic; font-weight: 700; padding: 4px 10px; border-left: 4px solid #fbbf24;';
  const warningStyle =
    'color: #475569; font-size: 11px; font-weight: 600; padding: 2px 0;';

  console.log(
    '%cSERBU 21%cSDN Rawa Badak Utara 21 • Proof of Ownership',
    badgeStyle,
    subBadgeStyle
  );
  console.log(
    `%cOriginal Creator & Architect: ${_CREATOR_SIGNATURE_ENDI_DILANESA.creator} (${_CREATOR_SIGNATURE_ENDI_DILANESA.year})`,
    creatorStyle
  );
  console.log(
    `%cDedikasi: "${_CREATOR_SIGNATURE_ENDI_DILANESA.dedication}"`,
    dedicationStyle
  );
  console.log(
    '%cHak Cipta Dilindungi © 2026. Dilarang memperjualbelikan, menyalin ulang tanpa izin, atau menghapus identitas pencipta asli dari sistem ini.',
    warningStyle
  );
})();

export function verifySystemOwnershipIntegrity(): SystemOwnershipStatus {
  const sig = _CREATOR_SIGNATURE_ENDI_DILANESA;
  const expectedPrefix = 'Endi Soeprapto';
  const expectedDedication = 'Dilanesa';
  const isIntact =
    sig.raw.includes(expectedPrefix) &&
    sig.raw.includes(expectedDedication) &&
    sig.creator.includes(expectedPrefix) &&
    sig.dedication.includes(expectedDedication) &&
    sig.year === 2026;

  if (!isIntact) {
    throw new Error('Verifikasi tanda tangan keaslian sistem SERBU 21 gagal.');
  }

  const checksum = computeSignatureChecksum(
    `${sig.raw}|${sig.checksumSeed}|${sig.systemVersion}`
  );

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-app-version', sig.systemVersion);
    document.documentElement.setAttribute('data-ownership-seal', checksum);
  }

  return {
    verified: true,
    signature: sig.raw,
    systemVersion: sig.systemVersion,
    creator: sig.creator,
    dedication: sig.dedication,
    year: sig.year,
    checksum,
  };
}
