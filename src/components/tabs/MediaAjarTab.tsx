import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Presentation,
  Plus,
  Search,
  Eye,
  ExternalLink,
  Pencil,
  Trash2,
  X,
  Maximize2,
  Minimize2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  BookOpen,
  Calendar,
  UserCheck,
  Filter,
  Link2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import { ActiveUser, SchoolProfile, Student } from '../../types';
import { auth, db, handleFirestoreError, OperationType } from '../../utils/firebase';
import { loadPresentationSlides, ParsedSlide } from '../../utils/slideDeckLoader';

export interface MediaAjarItem {
  id: string;
  judul: string;
  kelas: string;
  mapel: string;
  bab: string;
  pertemuan: string;
  drive_url: string;
  embed_url: string;
  guru_nama: string;
  guru_uid: string;
  created_at?: Timestamp | Date | string | number | null;
}

interface Props {
  activeUser: ActiveUser;
  students: Student[];
  profile: SchoolProfile;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const KELAS_NUMS = ['1', '2', '3', '4', '5', '6'] as const;

const BAB_OPTIONS = Array.from({ length: 12 }, (_, idx) => `Bab ${idx + 1}`);
const PERTEMUAN_OPTIONS = Array.from({ length: 16 }, (_, idx) => `Pertemuan ${idx + 1}`);

function parseBabAndPertemuan(rawBab?: string, rawPertemuan?: string): { bab: string; pertemuan: string } {
  const babStr = String(rawBab || '').trim();
  const pertStr = String(rawPertemuan || '').trim();

  if (babStr && pertStr) {
    return { bab: babStr, pertemuan: pertStr };
  }

  const combined = `${babStr} ${pertStr}`.trim();
  const babMatch = combined.match(/\b(Bab\s*\d+)/i);
  const pertMatch = combined.match(/\b(Pertemuan\s*\d+)/i);

  const resolvedBab = babStr || (babMatch ? babMatch[1].replace(/\s+/g, ' ') : 'Bab 1');
  const resolvedPertemuan =
    pertMatch
      ? pertMatch[1].replace(/\s+/g, ' ')
      : pertStr && !/^bab\s*\d+$/i.test(pertStr)
      ? pertStr
      : 'Pertemuan 1';

  return {
    bab: resolvedBab.replace(/^bab/i, 'Bab'),
    pertemuan: resolvedPertemuan.replace(/^pertemuan/i, 'Pertemuan'),
  };
}

const DEFAULT_MAPEL_OPTIONS = [
  'Bahasa Indonesia',
  'IPAS',
  'Matematika',
  'Pendidikan Pancasila',
  'PJOK',
  'PAI',
  'Seni Budaya',
  'Bahasa Inggris',
  'KKA',
  'Mulok PLBJ',
];

function extractGradeDigit(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (/^[1-6]$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:kelas\s*)?([1-6])(?:\s*[a-zA-Z])?\b/i);
  if (match && match[1]) return match[1];
  return null;
}

export function extractGoogleDriveFileId(rawUrl: string): string | null {
  const input = (rawUrl || '').trim();
  if (!input) return null;

  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.endsWith('drive.google.com') && !hostname.endsWith('docs.google.com')) {
      return null;
    }

    const filePathMatch = parsed.pathname.match(/\/(?:file|presentation|document|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/);
    if (filePathMatch && filePathMatch[1]) {
      return filePathMatch[1];
    }

    const idParam = parsed.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) {
      return idParam;
    }
  } catch {
    return null;
  }

  return null;
}

export function isGoogleSlidesUrl(rawUrl?: string): boolean {
  const input = (rawUrl || '').trim();
  if (!input) return false;
  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase();
    return hostname.endsWith('docs.google.com') && /\/presentation\/d\/[a-zA-Z0-9_-]+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function convertDriveUrlToEmbedUrl(rawUrl: string): string | null {
  const fileId = extractGoogleDriveFileId(rawUrl);
  if (!fileId) return null;
  if (isGoogleSlidesUrl(rawUrl)) {
    return `https://docs.google.com/presentation/d/${fileId}/embed?start=false&loop=false&delayms=3000&rm=minimal`;
  }
  return `https://drive.google.com/file/d/${fileId}/preview?rm=minimal`;
}

export function resolvePresentationPreviewUrl(
  mediaItem: Pick<MediaAjarItem, 'drive_url' | 'embed_url'>
): string | null {
  const rawDrive = (mediaItem.drive_url || '').trim();
  const rawEmbed = (mediaItem.embed_url || '').trim();
  const slidesSource = isGoogleSlidesUrl(rawDrive)
    ? rawDrive
    : isGoogleSlidesUrl(rawEmbed)
    ? rawEmbed
    : null;

  if (slidesSource) {
    const slideId = extractGoogleDriveFileId(slidesSource);
    if (slideId) {
      return `https://docs.google.com/presentation/d/${slideId}/embed?start=false&loop=false&delayms=3000&rm=minimal`;
    }
  }

  const fileId = extractGoogleDriveFileId(rawDrive) || extractGoogleDriveFileId(rawEmbed);
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview?rm=minimal`;
  }

  return getSafeExternalUrl(rawEmbed) || getSafeExternalUrl(rawDrive);
}

function getSafeExternalUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith('drive.google.com') || host.endsWith('docs.google.com')) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function getTimestampMs(val: MediaAjarItem['created_at']): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const t = Date.parse(val);
    return Number.isNaN(t) ? 0 : t;
  }
  if (val instanceof Date) return val.getTime();
  if (typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  if (typeof (val as { seconds?: number }).seconds === 'number') {
    return ((val as { seconds: number }).seconds || 0) * 1000;
  }
  return 0;
}

function formatUploadDate(val: MediaAjarItem['created_at']): string {
  const ms = getTimestampMs(val);
  if (!ms) return 'Baru saja';
  return new Date(ms).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getMediaThumbnailUrl(driveUrl?: string, embedUrl?: string): string | null {
  const fileId = extractGoogleDriveFileId(driveUrl || '') || extractGoogleDriveFileId(embedUrl || '');
  if (!fileId) return null;
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}

function getMapelSlideTheme(mapel: string): { bar: string; surface: string; ink: string } {
  const m = (mapel || '').toLowerCase();
  if (m.includes('indonesia')) {
    return { bar: 'bg-rose-600', surface: 'from-rose-50/90 via-white to-slate-50', ink: 'text-rose-700' };
  }
  if (m.includes('matematika')) {
    return { bar: 'bg-sky-600', surface: 'from-sky-50/90 via-white to-slate-50', ink: 'text-sky-700' };
  }
  if (m.includes('ipas') || m.includes('ipa')) {
    return { bar: 'bg-emerald-600', surface: 'from-emerald-50/90 via-white to-slate-50', ink: 'text-emerald-700' };
  }
  if (m.includes('pancasila') || m.includes('pkn')) {
    return { bar: 'bg-amber-600', surface: 'from-amber-50/90 via-white to-slate-50', ink: 'text-amber-700' };
  }
  if (m.includes('pjok')) {
    return { bar: 'bg-orange-600', surface: 'from-orange-50/90 via-white to-slate-50', ink: 'text-orange-700' };
  }
  if (m.includes('pai') || m.includes('agama')) {
    return { bar: 'bg-teal-600', surface: 'from-teal-50/90 via-white to-slate-50', ink: 'text-teal-700' };
  }
  if (m.includes('inggris')) {
    return { bar: 'bg-indigo-600', surface: 'from-indigo-50/90 via-white to-slate-50', ink: 'text-indigo-700' };
  }
  if (m.includes('seni')) {
    return { bar: 'bg-violet-600', surface: 'from-violet-50/90 via-white to-slate-50', ink: 'text-violet-700' };
  }
  return { bar: 'bg-slate-800', surface: 'from-slate-100/80 via-white to-slate-50', ink: 'text-slate-700' };
}

interface MediaSlidePreviewProps {
  driveUrl?: string;
  embedUrl?: string;
  judul: string;
  mapel: string;
  bab: string;
  pertemuan: string;
  guruNama: string;
}

const MediaSlidePreview: React.FC<MediaSlidePreviewProps> = ({
  driveUrl,
  embedUrl,
  judul,
  mapel,
  bab,
  pertemuan,
  guruNama,
}) => {
  const thumbUrl = useMemo(() => getMediaThumbnailUrl(driveUrl, embedUrl), [driveUrl, embedUrl]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [thumbUrl]);

  const theme = useMemo(() => getMapelSlideTheme(mapel), [mapel]);

  if (thumbUrl && !hasError) {
    return (
      <img
        src={thumbUrl}
        alt={`Pratinjau slide ${judul}`}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
    );
  }

  return (
    <div
      className={`w-full h-full bg-gradient-to-br ${theme.surface} p-4 flex flex-col justify-between select-none relative overflow-hidden`}
    >
      <div className={`absolute top-0 inset-x-0 h-1 ${theme.bar}`} />
      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
        <span className={`truncate max-w-[70%] font-bold ${theme.ink}`}>
          {mapel || 'Media Ajar'}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-400 shrink-0">
          <Presentation className="w-3 h-3" />
          <span>PPT</span>
        </span>
      </div>

      <div className="my-auto py-1 space-y-1">
        <div className="text-[10px] font-medium text-slate-400 truncate">
          {bab} · {pertemuan}
        </div>
        <div className="font-display font-extrabold text-sm text-slate-900 leading-snug line-clamp-2">
          {judul || 'Judul Slide Materi'}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-200/70 pt-1.5">
        <span className="truncate">{guruNama || 'Guru SERBU 21'}</span>
        <span className="font-mono text-[9px] shrink-0">Slide 1</span>
      </div>
    </div>
  );
};

export const MediaAjarTab: React.FC<Props> = ({
  activeUser,
  students,
  profile,
  showToast,
}) => {
  // Tentukan hak akses dan kelas pengguna secara otomatis
  const accessProfile = useMemo(() => {
    if (activeUser.role === 'siswa') {
      const ad = activeUser.studentData;
      const liveStudent =
        students.find(
          (s) =>
            (ad?.id && s.id === ad.id) ||
            (ad?.nisn && s.nisn === ad.nisn) ||
            (activeUser.username &&
              (s.username || '').toLowerCase() === activeUser.username.toLowerCase())
        ) || ad;
      const rawClass = liveStudent?.kelas || activeUser.detail || 'Kelas 1';
      const grade = extractGradeDigit(rawClass) || '1';
      return {
        mode: 'siswa' as const,
        userKelas: grade,
        rawClassLabel: rawClass,
        canManage: false,
        isClassLocked: true,
      };
    }

    if (activeUser.role === 'guru') {
      const grade =
        extractGradeDigit(activeUser.kelasDiampu) || extractGradeDigit(activeUser.detail);
      if (grade) {
        return {
          mode: 'guru_kelas' as const,
          userKelas: grade,
          rawClassLabel: activeUser.kelasDiampu || `Kelas ${grade}`,
          canManage: true,
          isClassLocked: true,
        };
      }
      // Guru mapel lintas kelas / Kepala Sekolah
      return {
        mode: 'admin_all' as const,
        userKelas: 'all',
        rawClassLabel: activeUser.detail || 'Lintas Kelas',
        canManage: true,
        isClassLocked: false,
      };
    }

    return {
      mode: 'admin_all' as const,
      userKelas: 'all',
      rawClassLabel: 'Semua Kelas',
      canManage: true,
      isClassLocked: false,
    };
  }, [activeUser, students]);

  const [selectedAdminKelasFilter, setSelectedAdminKelasFilter] = useState<string>('all');
  const [selectedMapelFilter, setSelectedMapelFilter] = useState<string>('all');
  const [selectedBabFilter, setSelectedBabFilter] = useState<string>('all');
  const [selectedPertemuanFilter, setSelectedPertemuanFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [items, setItems] = useState<MediaAjarItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // State Modal Tambah / Edit
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MediaAjarItem | null>(null);
  const [formJudul, setFormJudul] = useState<string>('');
  const [formKelas, setFormKelas] = useState<string>('1');
  const [formMapel, setFormMapel] = useState<string>('Bahasa Indonesia');
  const [formBab, setFormBab] = useState<string>('Bab 1');
  const [formPertemuan, setFormPertemuan] = useState<string>('Pertemuan 1');
  const [formDriveUrl, setFormDriveUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // State Konfirmasi Hapus (inline modal, menghindari window.confirm)
  const [deletingItem, setDeletingItem] = useState<MediaAjarItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // State Modal Slide Viewer & Fullscreen Single-Slide Presentation Mode
  const [viewingItem, setViewingItem] = useState<MediaAjarItem | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isDockVisible, setIsDockVisible] = useState<boolean>(true);
  const [isBottomBarHovered, setIsBottomBarHovered] = useState<boolean>(false);
  const [slides, setSlides] = useState<ParsedSlide[]>([]);
  const [totalSlidesCount, setTotalSlidesCount] = useState<number>(1);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev' | 'fade'>('fade');
  const [isLoadingSlides, setIsLoadingSlides] = useState<boolean>(false);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const dockHideTimerRef = useRef<number | null>(null);
  const isDockHoveredRef = useRef<boolean>(false);
  const slidesCountRef = useRef<number>(1);
  const isPresentingRef = useRef<boolean>(false);
  const exitingViaControlRef = useRef<boolean>(false);
  const previousBodyOverflowRef = useRef<string>('');
  const previousHtmlOverflowRef = useRef<string>('');

  const isPresenting = Boolean(viewingItem);

  useEffect(() => {
    isPresentingRef.current = isPresenting;
  }, [isPresenting]);

  useEffect(() => {
    slidesCountRef.current = Math.max(1, slides.length);
  }, [slides.length]);

  const getFullscreenElement = (): Element | null => {
    if (typeof document === 'undefined') return null;
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return doc.fullscreenElement || doc.webkitFullscreenElement || null;
  };

  const requestBrowserFullscreen = async (targetEl: HTMLElement | null): Promise<void> => {
    if (!targetEl) return;
    const el = targetEl as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen();
    } else if (typeof el.webkitRequestFullscreen === 'function') {
      await el.webkitRequestFullscreen();
    }
  };

  const exitBrowserFullscreen = async (): Promise<void> => {
    if (typeof document === 'undefined') return;
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (typeof doc.exitFullscreen === 'function') {
      await doc.exitFullscreen();
    } else if (typeof doc.webkitExitFullscreen === 'function') {
      await doc.webkitExitFullscreen();
    }
  };

  const lockBodyOverflow = () => {
    if (typeof document === 'undefined') return;
    if (document.body.style.overflow !== 'hidden') {
      previousBodyOverflowRef.current = document.body.style.overflow;
    }
    if (document.documentElement.style.overflow !== 'hidden') {
      previousHtmlOverflowRef.current = document.documentElement.style.overflow;
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  };

  const unlockBodyOverflow = () => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow =
      previousBodyOverflowRef.current === 'hidden' ? '' : previousBodyOverflowRef.current;
    document.documentElement.style.overflow =
      previousHtmlOverflowRef.current === 'hidden' ? '' : previousHtmlOverflowRef.current;
    previousBodyOverflowRef.current = '';
    previousHtmlOverflowRef.current = '';
  };

  const clearDockHideTimer = () => {
    if (dockHideTimerRef.current !== null) {
      window.clearTimeout(dockHideTimerRef.current);
      dockHideTimerRef.current = null;
    }
  };

  const revealDock = () => {
    clearDockHideTimer();
    setIsDockVisible(true);
    dockHideTimerRef.current = window.setTimeout(() => {
      if (!isDockHoveredRef.current) {
        setIsDockVisible(false);
      }
    }, 3000);
  };

  const goToSlide = (targetIndex: number) => {
    const maxIndex = Math.max(0, slidesCountRef.current - 1);
    const clamped = Math.max(0, Math.min(maxIndex, targetIndex));
    setCurrentSlideIndex((prev) => {
      if (clamped === prev) return prev;
      setSlideDirection(clamped > prev ? 'next' : 'prev');
      return clamped;
    });
    revealDock();
  };

  const goToNextSlide = () => {
    setCurrentSlideIndex((prev) => {
      const maxIndex = Math.max(0, slidesCountRef.current - 1);
      if (prev >= maxIndex) return prev;
      setSlideDirection('next');
      return prev + 1;
    });
    revealDock();
  };

  const goToPrevSlide = () => {
    setCurrentSlideIndex((prev) => {
      if (prev <= 0) return prev;
      setSlideDirection('prev');
      return prev - 1;
    });
    revealDock();
  };

  const openMediaPreview = (mediaItem: MediaAjarItem) => {
    // Eksekusi penguncian overflow secara sinkron tepat saat masuk mode presentasi/fullscreen
    lockBodyOverflow();
    exitingViaControlRef.current = false;
    setSlides([]);
    setTotalSlidesCount(1);
    setCurrentSlideIndex(0);
    setSlideDirection('fade');
    setIsBottomBarHovered(false);
    isDockHoveredRef.current = false;
    setViewingItem(mediaItem);
    revealDock();
    if (typeof document !== 'undefined' && !getFullscreenElement()) {
      requestBrowserFullscreen(document.documentElement).catch(() => {});
    }
  };

  const closeMediaPreview = () => {
    // Pulihkan overflow segera secara sinkron saat keluar lewat Escape atau tombol kontrol UI
    unlockBodyOverflow();
    clearDockHideTimer();
    isDockHoveredRef.current = false;
    setIsBottomBarHovered(false);
    if (getFullscreenElement()) {
      exitingViaControlRef.current = true;
      exitBrowserFullscreen().catch(() => {
        exitingViaControlRef.current = false;
      });
    }
    setViewingItem(null);
  };

  useEffect(() => {
    const onFsChange = () => {
      const fsActive = Boolean(getFullscreenElement());
      setIsFullscreen(fsActive);
      if (fsActive) {
        lockBodyOverflow();
        return;
      }

      if (exitingViaControlRef.current) {
        exitingViaControlRef.current = false;
        unlockBodyOverflow();
        return;
      }

      // Saat browser keluar dari native fullscreen (mis. Escape), reset overflow & tutup mode presentasi
      unlockBodyOverflow();
      if (isPresentingRef.current) {
        clearDockHideTimer();
        isDockHoveredRef.current = false;
        setIsBottomBarHovered(false);
        setViewingItem(null);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      unlockBodyOverflow();
    };
  }, []);

  // Ekstraksi halaman slide PDF/PPTX agar bisa ditampilkan tepat 1 slide per layar penuh
  useEffect(() => {
    if (!viewingItem) {
      setSlides([]);
      setIsLoadingSlides(false);
      return;
    }

    const abortController = new AbortController();
    const embedFallbackUrl = resolvePresentationPreviewUrl(viewingItem);
    const fileId =
      extractGoogleDriveFileId(viewingItem.drive_url) ||
      extractGoogleDriveFileId(viewingItem.embed_url);
    const isSlides =
      isGoogleSlidesUrl(viewingItem.drive_url) || isGoogleSlidesUrl(viewingItem.embed_url);

    if (!fileId) {
      setSlides(
        embedFallbackUrl
          ? [
              {
                index: 0,
                kind: 'embed-fallback',
                title: viewingItem.judul,
                embedUrl: embedFallbackUrl,
                aspectRatio: 16 / 9,
              },
            ]
          : []
      );
      setTotalSlidesCount(1);
      setIsLoadingSlides(false);
      return;
    }

    setIsLoadingSlides(true);
    loadPresentationSlides({
      fileId,
      isGoogleSlides: isSlides,
      embedFallbackUrl,
      judul: viewingItem.judul,
      signal: abortController.signal,
      onProgress: (loadedSlides, totalPages) => {
        if (abortController.signal.aborted) return;
        setSlides(loadedSlides);
        setTotalSlidesCount(Math.max(loadedSlides.length, totalPages));
      },
    })
      .then((finalSlides) => {
        if (abortController.signal.aborted) return;
        setSlides(finalSlides);
        setTotalSlidesCount(Math.max(1, finalSlides.length));
        setIsLoadingSlides(false);
      })
      .catch((err) => {
        if (abortController.signal.aborted || err?.name === 'AbortError') return;
        setIsLoadingSlides(false);
      });

    return () => {
      abortController.abort();
    };
  }, [viewingItem]);

  useEffect(() => {
    if (!viewingItem) {
      clearDockHideTimer();
      return;
    }

    revealDock();

    const handleUserActivity = () => {
      revealDock();
    };

    const handlePresentationKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isTyping = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select';
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMediaPreview();
        return;
      }
      if (isTyping) return;

      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === ' ' ||
        e.key === 'PageDown'
      ) {
        e.preventDefault();
        goToNextSlide();
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goToPrevSlide();
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        goToSlide(0);
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        goToSlide(Math.max(0, slidesCountRef.current - 1));
        return;
      }

      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };

    window.addEventListener('mousemove', handleUserActivity, { passive: true });
    window.addEventListener('mousedown', handleUserActivity, { passive: true });
    window.addEventListener('touchstart', handleUserActivity, { passive: true });
    window.addEventListener('pointermove', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handlePresentationKeyDown);

    return () => {
      clearDockHideTimer();
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('mousedown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('pointermove', handleUserActivity);
      window.removeEventListener('keydown', handlePresentationKeyDown);
    };
  }, [viewingItem]);

  // Target query Firestore sesuai role dan kelas
  const targetFirestoreKelas =
    accessProfile.mode === 'admin_all' ? selectedAdminKelasFilter : accessProfile.userKelas;

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);

    const mediaCol = collection(db, 'media_ajar');
    const q =
      targetFirestoreKelas === 'all'
        ? mediaCol
        : query(mediaCol, where('kelas', '==', targetFirestoreKelas));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rows: MediaAjarItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const parsed = parseBabAndPertemuan(data.bab, data.pertemuan);
          rows.push({
            id: docSnap.id,
            judul: String(data.judul || ''),
            kelas: String(data.kelas || '1'),
            mapel: String(data.mapel || ''),
            bab: parsed.bab,
            pertemuan: parsed.pertemuan,
            drive_url: String(data.drive_url || ''),
            embed_url: String(data.embed_url || ''),
            guru_nama: String(data.guru_nama || 'Guru'),
            guru_uid: String(data.guru_uid || ''),
            created_at: data.created_at ?? null,
          });
        });

        // Pengurutan descending berdasarkan waktu unggah di sisi klien (menghindari composite index Firestore)
        rows.sort((a, b) => getTimestampMs(b.created_at) - getTimestampMs(a.created_at));
        setItems(rows);
        setIsLoading(false);
      },
      (err) => {
        setIsLoading(false);
        setLoadError('Gagal memuat daftar media ajar dari Firestore.');
        try {
          handleFirestoreError(err, OperationType.GET, 'media_ajar');
        } catch {
          // Sudah tercatat melalui handleFirestoreError
        }
      }
    );

    return () => unsubscribe();
  }, [targetFirestoreKelas]);

  const mapelFilterOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_MAPEL_OPTIONS);
    items.forEach((it) => {
      if (it.mapel && it.mapel.trim()) set.add(it.mapel.trim());
    });
    return Array.from(set);
  }, [items]);

  const babFilterOptions = useMemo(() => {
    const set = new Set<string>(BAB_OPTIONS);
    items.forEach((it) => {
      if (it.bab && it.bab.trim()) set.add(it.bab.trim());
    });
    return Array.from(set);
  }, [items]);

  const pertemuanFilterOptions = useMemo(() => {
    const set = new Set<string>(PERTEMUAN_OPTIONS);
    items.forEach((it) => {
      if (it.pertemuan && it.pertemuan.trim()) set.add(it.pertemuan.trim());
    });
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedMapelFilter !== 'all' && item.mapel !== selectedMapelFilter) {
        return false;
      }
      if (selectedBabFilter !== 'all' && item.bab !== selectedBabFilter) {
        return false;
      }
      if (selectedPertemuanFilter !== 'all' && item.pertemuan !== selectedPertemuanFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.judul.toLowerCase().includes(q) ||
        item.mapel.toLowerCase().includes(q) ||
        item.bab.toLowerCase().includes(q) ||
        item.pertemuan.toLowerCase().includes(q) ||
        item.guru_nama.toLowerCase().includes(q)
      );
    });
  }, [items, selectedMapelFilter, selectedBabFilter, selectedPertemuanFilter, searchQuery]);

  const previewEmbedUrl = useMemo(() => convertDriveUrlToEmbedUrl(formDriveUrl), [formDriveUrl]);

  const openAddModal = () => {
    setEditingItem(null);
    setFormJudul('');
    setFormKelas(
      accessProfile.isClassLocked
        ? accessProfile.userKelas
        : selectedAdminKelasFilter !== 'all'
        ? selectedAdminKelasFilter
        : '1'
    );
    setFormMapel(selectedMapelFilter !== 'all' ? selectedMapelFilter : 'Bahasa Indonesia');
    setFormBab(selectedBabFilter !== 'all' ? selectedBabFilter : 'Bab 1');
    setFormPertemuan(selectedPertemuanFilter !== 'all' ? selectedPertemuanFilter : 'Pertemuan 1');
    setFormDriveUrl('');
    setIsFormOpen(true);
  };

  const openEditModal = (item: MediaAjarItem) => {
    setEditingItem(item);
    setFormJudul(item.judul);
    setFormKelas(accessProfile.isClassLocked ? accessProfile.userKelas : item.kelas);
    setFormMapel(item.mapel || 'Bahasa Indonesia');
    setFormBab(item.bab || 'Bab 1');
    setFormPertemuan(item.pertemuan || 'Pertemuan 1');
    setFormDriveUrl(item.drive_url);
    setIsFormOpen(true);
  };

  const handleSaveMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    const judulClean = formJudul.trim();
    const babClean = formBab.trim();
    const pertemuanClean = formPertemuan.trim();
    const driveClean = formDriveUrl.trim();
    const targetKelas = accessProfile.isClassLocked ? accessProfile.userKelas : formKelas;

    if (!judulClean || !babClean || !pertemuanClean || !driveClean) {
      showToast('Mohon lengkapi Judul Materi, Bab, Pertemuan, dan Tautan Google Drive.', 'error');
      return;
    }

    const generatedEmbed = convertDriveUrlToEmbedUrl(driveClean);
    if (!generatedEmbed) {
      showToast(
        'Tautan Google Drive tidak valid. Gunakan link Google Drive/Slides seperti .../file/d/ID/view atau .../open?id=ID.',
        'error'
      );
      return;
    }

    setIsSaving(true);
    try {
      const uid = auth.currentUser?.uid || activeUser.username || 'guru_serbu21';
      if (editingItem) {
        await updateDoc(doc(db, 'media_ajar', editingItem.id), {
          judul: judulClean,
          kelas: targetKelas,
          mapel: formMapel,
          bab: babClean,
          pertemuan: pertemuanClean,
          drive_url: driveClean,
          embed_url: generatedEmbed,
        });
        showToast('Media ajar berhasil diperbarui!', 'success');
      } else {
        await addDoc(collection(db, 'media_ajar'), {
          judul: judulClean,
          kelas: targetKelas,
          mapel: formMapel,
          bab: babClean,
          pertemuan: pertemuanClean,
          drive_url: driveClean,
          embed_url: generatedEmbed,
          guru_nama: activeUser.name || 'Guru',
          guru_uid: uid,
          created_at: serverTimestamp(),
        });
        showToast(`Media ajar Kelas ${targetKelas} berhasil ditambahkan!`, 'success');
      }
      setIsFormOpen(false);
    } catch (err) {
      showToast('Gagal menyimpan media ajar ke Firestore. Periksa koneksi atau izin akses.', 'error');
      try {
        handleFirestoreError(
          err,
          editingItem ? OperationType.UPDATE : OperationType.CREATE,
          'media_ajar'
        );
      } catch {
        // Error info sudah dilog
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'media_ajar', deletingItem.id));
      showToast(`Media ajar "${deletingItem.judul}" berhasil dihapus.`, 'success');
      setDeletingItem(null);
    } catch (err) {
      showToast('Gagal menghapus media ajar dari Firestore.', 'error');
      try {
        handleFirestoreError(err, OperationType.DELETE, `media_ajar/${deletingItem.id}`);
      } catch {
        // Error info sudah dilog
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleFullscreen = async () => {
    const targetEl = viewerContainerRef.current || document.documentElement;
    if (!targetEl) return;
    try {
      if (!getFullscreenElement()) {
        lockBodyOverflow();
        await requestBrowserFullscreen(targetEl);
      } else {
        exitingViaControlRef.current = true;
        unlockBodyOverflow();
        await exitBrowserFullscreen();
      }
      revealDock();
    } catch {
      exitingViaControlRef.current = false;
      if (!isPresentingRef.current) {
        unlockBodyOverflow();
      }
      showToast('Mode layar penuh tidak didukung oleh browser atau perangkat ini.', 'error');
    }
  };

  const headerTitle =
    accessProfile.mode === 'siswa' || accessProfile.mode === 'guru_kelas'
      ? `Bank Media Ajar - Kelas ${accessProfile.userKelas}`
      : 'Bank Media Ajar (PPT)';

  return (
    <section className="space-y-6">
      {/* Header Utama */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
              <Presentation className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                  Media Presentasi &amp; Slide Pembelajaran
                </span>
                {accessProfile.mode !== 'admin_all' && (
                  <span className="text-[11px] font-bold text-slate-500">
                    • {accessProfile.rawClassLabel}
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-display font-black text-slate-900 mt-0.5">
                {headerTitle}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {accessProfile.mode === 'siswa'
                  ? `Materi slide PowerPoint dan bahan ajar khusus untuk siswa Kelas ${accessProfile.userKelas} (${profile.name}).`
                  : accessProfile.mode === 'guru_kelas'
                  ? `Kelola dan sajikan slide PowerPoint (PPT) pembelajaran khusus untuk Kelas ${accessProfile.userKelas}.`
                  : 'Pantau, unggah, dan sajikan slide PowerPoint (PPT) pembelajaran untuk seluruh kelas (Kelas 1 s.d. 6).'}
              </p>
            </div>
          </div>

          {accessProfile.canManage && (
            <button
              type="button"
              onClick={openAddModal}
              className="bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-4 py-2.5 rounded-2xl text-xs shadow-sm flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>+ Tambah Media Ajar</span>
            </button>
          )}
        </div>

        {/* Filter Kelas (KHUSUS Admin / Kepsek / Guru Mapel Lintas Kelas) */}
        {accessProfile.mode === 'admin_all' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedAdminKelasFilter('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-display font-extrabold transition cursor-pointer ${
                selectedAdminKelasFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Semua Kelas
            </button>
            {KELAS_NUMS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSelectedAdminKelasFilter(k)}
                className={`px-3.5 py-2 rounded-xl text-xs font-display font-extrabold transition cursor-pointer ${
                  selectedAdminKelasFilter === k
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700'
                }`}
              >
                Kelas {k}
              </button>
            ))}
          </div>
        )}

        {/* Filter Mata Pelajaran, Bab, Pertemuan & Kolom Pencarian */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-3 relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedMapelFilter}
              onChange={(e) => setSelectedMapelFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-rose-500 text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="all">Semua Mapel</option>
              {mapelFilterOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2 relative">
            <select
              value={selectedBabFilter}
              onChange={(e) => setSelectedBabFilter(e.target.value)}
              aria-label="Filter Bab"
              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-rose-500 text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="all">Semua Bab</option>
              {babFilterOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3 relative">
            <select
              value={selectedPertemuanFilter}
              onChange={(e) => setSelectedPertemuanFilter(e.target.value)}
              aria-label="Filter Pertemuan"
              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-rose-500 text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="all">Semua Pertemuan</option>
              {pertemuanFilterOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul materi atau nama guru..."
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-rose-500 text-xs font-semibold text-slate-800 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Konten Daftar Media Ajar */}
      {loadError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <p className="text-sm font-bold text-rose-900">{loadError}</p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white rounded-3xl p-5 border border-slate-200 h-52 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-5 w-28 bg-slate-200 rounded-lg" />
                <div className="h-4 w-40 bg-slate-100 rounded-lg" />
                <div className="h-6 w-full bg-slate-200 rounded-lg" />
              </div>
              <div className="h-9 w-full bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <BookOpen className="w-7 h-7" />
          </div>
          <h3 className="font-display font-black text-base text-slate-800">
            Belum Ada Media Ajar yang Tersedia
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery ||
            selectedMapelFilter !== 'all' ||
            selectedBabFilter !== 'all' ||
            selectedPertemuanFilter !== 'all'
              ? 'Tidak ditemukan materi yang sesuai dengan filter mata pelajaran, bab, pertemuan, atau kata kunci pencarian.'
              : accessProfile.canManage
              ? 'Klik tombol "+ Tambah Media Ajar" di atas untuk menambahkan tautan Google Drive slide PPT/PDF pertama.'
              : `Belum ada slide materi yang diunggah guru untuk Kelas ${accessProfile.userKelas} saat ini.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredItems.map((item) => {
            const safeDriveHref = getSafeExternalUrl(item.drive_url);
            return (
              <article
                key={item.id}
                className="group bg-white rounded-2xl border border-slate-200/80 hover:border-slate-300 shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Preview Slide PPT 16:9 */}
                  <div
                    onClick={() => openMediaPreview(item)}
                    className="relative aspect-[16/9] bg-slate-100 border-b border-slate-100 overflow-hidden cursor-pointer"
                    title="Klik untuk membuka presentasi slide"
                  >
                    <MediaSlidePreview
                      driveUrl={item.drive_url}
                      embedUrl={item.embed_url}
                      judul={item.judul}
                      mapel={item.mapel}
                      bab={item.bab}
                      pertemuan={item.pertemuan}
                      guruNama={item.guru_nama}
                    />

                    {/* Subtle hover scrim */}
                    <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 rounded-lg bg-white/95 text-slate-900 text-[11px] font-bold shadow-sm inline-flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-rose-600" />
                        <span>Mulai Presentasi</span>
                      </span>
                    </div>

                    {/* Staff Edit / Delete quick actions */}
                    {accessProfile.canManage && (
                      <div
                        className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="w-7 h-7 rounded-lg bg-white/95 hover:bg-sky-600 text-slate-600 hover:text-white flex items-center justify-center shadow-xs transition cursor-pointer"
                          title="Edit Media Ajar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingItem(item)}
                          className="w-7 h-7 rounded-lg bg-white/95 hover:bg-rose-600 text-slate-600 hover:text-white flex items-center justify-center shadow-xs transition cursor-pointer"
                          title="Hapus Media Ajar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Minimalist Content Body */}
                  <div className="p-4 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 truncate">
                      <span className="font-semibold text-rose-700 truncate">{item.mapel || 'Umum'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">Kelas {item.kelas}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">
                        {item.bab} · {item.pertemuan}
                      </span>
                    </div>

                    <h3
                      onClick={() => openMediaPreview(item)}
                      className="font-display font-bold text-sm sm:text-[15px] text-slate-900 leading-snug line-clamp-2 cursor-pointer group-hover:text-rose-700 transition-colors"
                    >
                      {item.judul}
                    </h3>
                  </div>
                </div>

                {/* Minimal Footer Actions */}
                <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="min-w-0 text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                    <span className="truncate font-medium text-slate-600">{item.guru_nama}</span>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0">{formatUploadDate(item.created_at)}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openMediaPreview(item)}
                      title="Mulai Presentasi / Layar Penuh"
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-600 text-white font-display font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Mulai Presentasi</span>
                    </button>

                    {safeDriveHref && (
                      <a
                        href={safeDriveHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Buka atau unduh di Google Drive"
                        className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 flex items-center justify-center transition shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* MODAL TAMBAH / EDIT MEDIA AJAR */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <Presentation className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-black text-base text-slate-900">
                    {editingItem ? 'Edit Media Ajar' : 'Tambah Media Ajar (PPT)'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Tautkan slide PowerPoint atau PDF dari Google Drive
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMedia} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Judul Materi Pembelajaran *
                </label>
                <input
                  type="text"
                  required
                  value={formJudul}
                  onChange={(e) => setFormJudul(e.target.value)}
                  placeholder="Contoh: Perubahan Wujud Benda & Siklus Air"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-800 outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Tingkat Kelas *
                  </label>
                  <div className="relative">
                    <select
                      value={formKelas}
                      disabled={accessProfile.isClassLocked}
                      onChange={(e) => setFormKelas(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none ${
                        accessProfile.isClassLocked
                          ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                          : 'bg-white border-slate-300 text-slate-800 focus:border-rose-500 cursor-pointer'
                      }`}
                    >
                      {KELAS_NUMS.map((k) => (
                        <option key={k} value={k}>
                          Kelas {k}
                        </option>
                      ))}
                    </select>
                    {accessProfile.isClassLocked && (
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none" />
                    )}
                  </div>
                  {accessProfile.isClassLocked && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Dikunci otomatis sesuai kelas yang Anda ampu.
                    </p>
                  )}
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Mata Pelajaran *
                  </label>
                  <select
                    value={formMapel}
                    onChange={(e) => setFormMapel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 outline-none focus:border-rose-500 cursor-pointer"
                  >
                    {DEFAULT_MAPEL_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Bab *
                  </label>
                  <select
                    required
                    value={formBab}
                    onChange={(e) => setFormBab(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 outline-none focus:border-rose-500 cursor-pointer"
                  >
                    {babFilterOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Pertemuan *
                  </label>
                  <select
                    required
                    value={formPertemuan}
                    onChange={(e) => setFormPertemuan(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 outline-none focus:border-rose-500 cursor-pointer"
                  >
                    {pertemuanFilterOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Tautan Google Drive (.pptx / .pdf) *
                </label>
                <div className="relative">
                  <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    required
                    value={formDriveUrl}
                    onChange={(e) => setFormDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-[11px] text-slate-800 outline-none focus:border-rose-500"
                  />
                </div>

                {formDriveUrl.trim() && (
                  <div className="mt-2.5 space-y-2.5">
                    {previewEmbedUrl ? (
                      <>
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div className="min-w-0 text-[11px]">
                            <span className="font-bold block">Tautan Pratinjau Siap:</span>
                            <span className="font-mono break-all text-emerald-700">
                              {previewEmbedUrl}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 overflow-hidden aspect-[16/9] bg-slate-50">
                          <MediaSlidePreview
                            driveUrl={formDriveUrl}
                            embedUrl={previewEmbedUrl}
                            judul={formJudul || 'Pratinjau Slide Materi'}
                            mapel={formMapel}
                            bab={formBab}
                            pertemuan={formPertemuan}
                            guruNama={activeUser.name || 'Guru'}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2 text-[11px] font-semibold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          Format link Google Drive belum terbaca. Pastikan menggunakan link Google Drive resmi.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Peringatan Hak Akses Drive */}
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  <strong>Penting:</strong> Pastikan pengaturan berbagi file di Google Drive sudah diubah menjadi{' '}
                  <strong>&quot;Siapa saja yang memiliki link dapat melihat (Viewer)&quot;</strong> agar slide dapat tampil langsung di Papan Interaktif Digital maupun HP siswa.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {isSaving ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Simpan Media Ajar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-black text-base text-slate-900">
                  Hapus Media Ajar?
                </h3>
                <p className="text-xs text-slate-500">
                  Kelas {deletingItem.kelas} • {deletingItem.mapel}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              Materi <strong>&quot;{deletingItem.judul}&quot;</strong> akan dihapus dari katalog Bank Media Ajar.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODE PRESENTASI SATU SLIDE PER LAYAR PENUH (SINGLE-SLIDE VIEWPORT LOCK) */}
      {isPresenting && viewingItem && (() => {
        const safeDriveUrl = getSafeExternalUrl(viewingItem.drive_url);
        const totalSlides = Math.max(slides.length, totalSlidesCount, 1);
        const safeIndex = Math.max(0, Math.min(slides.length - 1, currentSlideIndex));
        const activeSlide = slides[safeIndex];
        const canPaginate = slides.length > 1;
        const slideAnimationClass =
          slideDirection === 'next'
            ? 'slide-in-next'
            : slideDirection === 'prev'
            ? 'slide-in-prev'
            : 'slide-in-fade';

        return (
          <div
            ref={viewerContainerRef}
            onMouseMove={revealDock}
            onTouchStart={revealDock}
            className="fixed inset-0 w-screen h-screen overflow-hidden z-[9999] bg-slate-950 flex items-center justify-center select-none"
          >
            {/* Zona sensitif tepi bawah agar bilah kontrol bawah mudah muncul kembali */}
            <div
              onMouseEnter={revealDock}
              onTouchStart={revealDock}
              className="absolute bottom-0 inset-x-0 h-8 z-20"
            />

            {/* Container 1 Slide Aktif per Layar Penuh (Semua slide lain disembunyikan dengan class hidden) */}
            <div
              onClick={(e) => {
                if (!canPaginate) {
                  revealDock();
                  return;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                if (clickX < rect.width * 0.45) {
                  goToPrevSlide();
                } else {
                  goToNextSlide();
                }
              }}
              className="relative w-full h-full flex flex-col justify-center items-center p-4 sm:p-8 md:p-16 overflow-hidden cursor-pointer"
            >
              {isLoadingSlides && slides.length === 0 ? (
                <div className="w-full max-w-2xl rounded-3xl bg-slate-900/90 border border-white/10 p-8 text-center text-white space-y-3 shadow-2xl">
                  <Loader2 className="w-9 h-9 text-rose-400 animate-spin mx-auto" />
                  <p className="font-display font-bold text-base">
                    Menyiapkan Slide Presentasi...
                  </p>
                  <p className="text-xs text-slate-300">
                    Memuat halaman {viewingItem.judul} sesuai format asli agar tampil satu slide per layar penuh.
                  </p>
                </div>
              ) : slides.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-300 space-y-3">
                  <AlertTriangle className="w-10 h-10 text-amber-400" />
                  <p className="text-sm font-bold">
                    Tautan pratinjau slide tidak valid atau tidak dapat dimuat.
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeMediaPreview();
                    }}
                    className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Tutup Presentasi
                  </button>
                </div>
              ) : (
                slides.map((slide, idx) => {
                  const isActive = idx === safeIndex;
                  if (!isActive) {
                    return (
                      <div key={`hidden-slide-${slide.index}`} className="hidden" aria-hidden="true" />
                    );
                  }

                  return (
                    <div
                      key={`${viewingItem.id}-slide-${slide.index}`}
                      className={`w-full h-full flex flex-col justify-center items-center overflow-hidden ${slideAnimationClass}`}
                    >
                      {slide.kind === 'pdf-image' && slide.imageUrl ? (
                        <div className="w-full h-full flex items-center justify-center overflow-hidden">
                          <img
                            src={slide.imageUrl}
                            alt={`Slide ${idx + 1} - ${viewingItem.judul}`}
                            draggable={false}
                            className="max-w-full max-h-[calc(100vh-7.5rem)] w-auto h-auto object-contain rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.65)] bg-white"
                          />
                        </div>
                      ) : (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="relative w-full max-w-[min(100%,calc((100vh-8rem)*16/9))] aspect-[16/9] max-h-[calc(100vh-7.5rem)] rounded-2xl overflow-hidden bg-black shadow-[0_24px_80px_rgba(0,0,0,0.65)] border border-white/10"
                        >
                          {slide.embedUrl ? (
                            <iframe
                              src={slide.embedUrl}
                              title={viewingItem.judul}
                              className="w-full h-full border-0 bg-black"
                              allow="autoplay; fullscreen"
                              allowFullScreen
                            />
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Tombol Navigasi Samping Kiri / Kanan untuk Papan Interaktif Digital */}
              {canPaginate && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToPrevSlide();
                    }}
                    disabled={safeIndex <= 0}
                    aria-label="Slide Sebelumnya"
                    className={`hidden sm:flex absolute left-4 md:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/65 hover:bg-slate-800/90 border border-white/15 text-white items-center justify-center backdrop-blur-md transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed ${
                      isDockVisible ? 'opacity-90' : 'opacity-0'
                    }`}
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToNextSlide();
                    }}
                    disabled={safeIndex >= slides.length - 1}
                    aria-label="Slide Berikutnya"
                    className={`hidden sm:flex absolute right-4 md:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/65 hover:bg-slate-800/90 border border-white/15 text-white items-center justify-center backdrop-blur-md transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed ${
                      isDockVisible ? 'opacity-90' : 'opacity-0'
                    }`}
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Bilah Kontrol Melayang Bawah (Auto-Hide 3 Detik + Thumbnail Strip Saat Hover) */}
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={() => {
                isDockHoveredRef.current = true;
                setIsBottomBarHovered(true);
                revealDock();
              }}
              onMouseLeave={() => {
                isDockHoveredRef.current = false;
                setIsBottomBarHovered(false);
                revealDock();
              }}
              className={`absolute bottom-5 left-1/2 -translate-x-1/2 z-30 max-w-[94vw] flex flex-col items-center gap-2.5 transition-all duration-300 ${
                isDockVisible
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 translate-y-4 pointer-events-none'
              }`}
            >
              {/* Deretan Thumbnail Slide Tersembunyi: Otomatis Mekar Hanya Saat Kursor Hover di Bilah Kontrol Bawah */}
              {slides.length > 0 && (
                <div
                  className={`w-full max-w-[88vw] transition-all duration-300 ease-out overflow-hidden ${
                    isBottomBarHovered
                      ? 'max-h-36 opacity-100 translate-y-0 pointer-events-auto'
                      : 'max-h-0 opacity-0 translate-y-2 pointer-events-none'
                  }`}
                >
                  <div className="bg-slate-950/90 backdrop-blur-md border border-white/15 rounded-2xl px-3 py-2.5 shadow-2xl">
                    <div className="slide-thumb-strip flex items-center gap-2.5 overflow-x-auto pb-1">
                      {slides.map((slideItem, idx) => {
                        const isThumbActive = idx === safeIndex;
                        return (
                          <button
                            key={`thumb-${slideItem.index}`}
                            type="button"
                            onClick={() => goToSlide(idx)}
                            title={`Lompat ke Slide ${idx + 1}`}
                            className={`group/thumb relative shrink-0 w-24 aspect-[16/9] rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-white ${
                              isThumbActive
                                ? 'border-rose-500 ring-2 ring-rose-500/40 scale-[1.03]'
                                : 'border-white/15 opacity-75 hover:opacity-100 hover:border-white/50'
                            }`}
                          >
                            {slideItem.thumbnailUrl || slideItem.imageUrl ? (
                              <img
                                src={slideItem.thumbnailUrl || slideItem.imageUrl}
                                alt={`Thumbnail Slide ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-200 p-1.5 flex flex-col justify-between text-left">
                                <span className="text-[8px] font-bold text-slate-400">
                                  Slide {idx + 1}
                                </span>
                                <span className="text-[9px] font-extrabold text-slate-800 line-clamp-2 leading-tight">
                                  {slideItem.title || viewingItem.judul}
                                </span>
                              </div>
                            )}
                            <span
                              className={`absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                                isThumbActive
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-950/80 text-white'
                              }`}
                            >
                              {idx + 1}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Kapsul Kontrol Minimalis Bawah */}
              <div className="bg-slate-950/85 backdrop-blur-md border border-white/15 rounded-full shadow-2xl px-3 sm:px-4 py-2 flex items-center gap-1.5 sm:gap-2.5 text-white">
                <div className="hidden lg:flex items-center gap-2 max-w-[220px] pr-1">
                  <span className="w-6 h-6 rounded-full bg-rose-600/90 flex items-center justify-center shrink-0">
                    <Presentation className="w-3.5 h-3.5 text-white" />
                  </span>
                  <span className="font-display font-bold text-xs text-white truncate">
                    {viewingItem.judul}
                  </span>
                </div>

                {canPaginate && (
                  <>
                    <div className="hidden lg:block h-4 w-px bg-white/15 shrink-0" />
                    <button
                      type="button"
                      onClick={goToPrevSlide}
                      disabled={safeIndex <= 0}
                      title="Slide Sebelumnya (Panah Kiri)"
                      className="px-2.5 sm:px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Sebelumnya</span>
                    </button>

                    <span className="px-2.5 py-1 rounded-full bg-white/10 text-[11px] sm:text-xs font-mono font-bold text-slate-100 whitespace-nowrap">
                      Slide {safeIndex + 1} / {totalSlides}
                    </span>

                    <button
                      type="button"
                      onClick={goToNextSlide}
                      disabled={safeIndex >= slides.length - 1}
                      title="Slide Berikutnya (Panah Kanan / Spasi)"
                      className="px-2.5 sm:px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                    >
                      <span className="hidden sm:inline">Berikutnya</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}

                {!canPaginate && activeSlide && (
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-mono font-bold text-slate-200 whitespace-nowrap">
                    Slide 1 / 1
                  </span>
                )}

                <div className="h-4 w-px bg-white/15 shrink-0" />

                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  title="Beralih Layar Penuh (Pintasan: F)"
                  className="px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>

                {safeDriveUrl && (
                  <a
                    href={safeDriveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Buka materi di tab baru Google Drive"
                    className="px-2.5 py-1.5 rounded-full bg-sky-600/90 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1 transition whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={closeMediaPreview}
                  title="Keluar Layar Penuh (Pintasan: Esc)"
                  className="px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Keluar Layar Penuh</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
};
