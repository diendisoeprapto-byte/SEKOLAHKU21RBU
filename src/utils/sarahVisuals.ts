import sarahHijabImg from '../assets/images/sarah_hijab_1795348786939.jpg';
import sarahNonHijabImg from '../assets/images/sarah_nonhijab_1795348786813.jpg';
import stikerSapaImg from '../assets/images/stiker_sapa_1795348787022.jpg';
import stikerJempolImg from '../assets/images/stiker_jempol_1795348790133.jpg';
import stikerSemangatImg from '../assets/images/stiker_semangat_1795348787044.jpg';
import stikerTerimaKasihImg from '../assets/images/stiker_terimakasih_1795348786678.jpg';

export type SarahAvatarType = 'sarah-hijab.png' | 'sarah-nonhijab.png';
export type SarahStickerCode = 'sapa' | 'jempol' | 'semangat' | 'terimakasih';

export const SARAH_AVATAR_ASSETS: Record<SarahAvatarType, string> = {
  'sarah-hijab.png': sarahHijabImg,
  'sarah-nonhijab.png': sarahNonHijabImg,
};

export const SARAH_STICKER_ASSETS: Record<
  SarahStickerCode,
  { src: string; label: string; badgeText: string }
> = {
  sapa: {
    src: stikerSapaImg,
    label: 'Stiker Sapaan SARAH - Halo!',
    badgeText: 'Halo!',
  },
  jempol: {
    src: stikerJempolImg,
    label: 'Stiker Apresiasi SARAH - Hebat!',
    badgeText: 'Hebat!',
  },
  semangat: {
    src: stikerSemangatImg,
    label: 'Stiker Motivasi SARAH - Semangat!',
    badgeText: 'Semangat!',
  },
  terimakasih: {
    src: stikerTerimaKasihImg,
    label: 'Stiker Terima Kasih SARAH',
    badgeText: 'Terima Kasih',
  },
};

export function resolveAvatarTypeFromReligion(agama?: string | null): SarahAvatarType {
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

export interface ParsedSarahMetadata {
  avatarType: SarahAvatarType | null;
  avatarStatus: string | null;
  cleanText: string;
}

const AVATAR_TAG_REGEX = /\[AVATAR\s*:\s*(\{[\s\S]*?\})\s*\]/gi;

export function extractSarahResponseMetadata(rawText: string): ParsedSarahMetadata {
  const text = String(rawText || '');
  let avatarType: SarahAvatarType | null = null;
  let avatarStatus: string | null = null;

  const cleanText = text
    .replace(AVATAR_TAG_REGEX, (_full, jsonPayload: string) => {
      try {
        const normalizedJson = jsonPayload.replace(/'/g, '"');
        const parsed = JSON.parse(normalizedJson);
        if (parsed && typeof parsed === 'object') {
          if (parsed.tipe === 'sarah-nonhijab.png' || parsed.tipe === 'sarah-hijab.png') {
            avatarType = parsed.tipe;
          }
          if (typeof parsed.status === 'string') {
            avatarStatus = parsed.status;
          }
        }
      } catch {
        if (jsonPayload.includes('sarah-nonhijab')) {
          avatarType = 'sarah-nonhijab.png';
        } else if (jsonPayload.includes('sarah-hijab')) {
          avatarType = 'sarah-hijab.png';
        }
      }
      return '';
    })
    .replace(/^\s*\n+/g, '')
    .trim();

  return { avatarType, avatarStatus, cleanText };
}
