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

export function convertDriveUrlToEmbedUrl(rawUrl: string): string | null {
  const fileId = extractGoogleDriveFileId(rawUrl);
  if (!fileId) return null;
  return `https://drive.google.com/file/d/${fileId}/preview`;
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

function getMapelBadgeClass(mapel: string): string {
  const m = (mapel || '').toLowerCase();
  if (m.includes('indonesia')) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (m.includes('matematika')) return 'bg-sky-50 text-sky-700 border-sky-200';
  if (m.includes('ipas') || m.includes('ipa')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (m.includes('pancasila') || m.includes('pkn')) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (m.includes('pjok')) return 'bg-orange-50 text-orange-700 border-orange-200';
  if (m.includes('pai') || m.includes('agama')) return 'bg-teal-50 text-teal-700 border-teal-200';
  if (m.includes('inggris')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (m.includes('seni')) return 'bg-purple-50 text-purple-700 border-purple-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

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

  // State Modal Slide Viewer & Fullscreen
  const [viewingItem, setViewingItem] = useState<MediaAjarItem | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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
    if (!viewerContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await viewerContainerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
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
                className="bg-white rounded-3xl p-5 border border-slate-200/90 hover:border-rose-300 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Top Row: Mapel Badge & Kelas / Edit-Delete */}
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[11px] font-bold ${getMapelBadgeClass(
                        item.mapel
                      )}`}
                    >
                      {item.mapel || 'Umum'}
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold">
                        Kelas {item.kelas}
                      </span>
                      {accessProfile.canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition cursor-pointer"
                            title="Edit Media Ajar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingItem(item)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Hapus Media Ajar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bab & Pertemuan (Terpisah) serta Judul */}
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {item.bab}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700">
                        {item.pertemuan}
                      </span>
                    </div>
                    <h3 className="font-display font-black text-base text-slate-900 leading-snug mt-1.5 line-clamp-2">
                      {item.judul}
                    </h3>
                  </div>

                  {/* Meta Guru & Tanggal */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-1">
                    <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                      {item.guru_nama}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatUploadDate(item.created_at)}
                    </span>
                  </div>
                </div>

                {/* 2 Tombol Aksi Utama */}
                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingItem(item)}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-3 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Lihat Slide</span>
                  </button>

                  {safeDriveHref ? (
                    <a
                      href={safeDriveHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-display font-bold px-3 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition text-center"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Unduh / Drive</span>
                    </a>
                  ) : (
                    <span className="bg-slate-50 text-slate-400 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center justify-center">
                      Tautan Invalid
                    </span>
                  )}
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
                  <div className="mt-2">
                    {previewEmbedUrl ? (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="min-w-0 text-[11px]">
                          <span className="font-bold block">Tautan Pratinjau Siap:</span>
                          <span className="font-mono break-all text-emerald-700">
                            {previewEmbedUrl}
                          </span>
                        </div>
                      </div>
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

      {/* MODAL VIEWER SLIDE PRESENTASI FULLSCREEN */}
      {viewingItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div
            ref={viewerContainerRef}
            className="bg-slate-900 w-full h-full max-w-6xl max-h-[92vh] rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col border border-slate-700 shadow-2xl"
          >
            {/* Top Toolbar Viewer */}
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-white shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span className="font-bold text-rose-400">{viewingItem.mapel}</span>
                  <span>•</span>
                  <span>Kelas {viewingItem.kelas}</span>
                  <span>•</span>
                  <span>{viewingItem.bab}</span>
                  <span>•</span>
                  <span className="truncate">{viewingItem.pertemuan}</span>
                </div>
                <h3 className="font-display font-black text-sm sm:text-base text-white truncate">
                  {viewingItem.judul}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  {isFullscreen ? (
                    <>
                      <Minimize2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Keluar Layar Penuh</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Mode Layar Penuh (Fullscreen)</span>
                    </>
                  )}
                </button>

                {getSafeExternalUrl(viewingItem.drive_url) && (
                  <a
                    href={getSafeExternalUrl(viewingItem.drive_url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Buka Drive</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (document.fullscreenElement) {
                      document.exitFullscreen().catch(() => {});
                    }
                    setViewingItem(null);
                  }}
                  className="p-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer"
                  title="Tutup Viewer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Iframe Slide Container */}
            <div className="flex-1 bg-slate-950 relative">
              {getSafeExternalUrl(viewingItem.embed_url) ? (
                <iframe
                  src={getSafeExternalUrl(viewingItem.embed_url)!}
                  title={viewingItem.judul}
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-300 space-y-2">
                  <AlertTriangle className="w-10 h-10 text-amber-400" />
                  <p className="text-sm font-bold">
                    Tautan pratinjau slide tidak valid atau tidak dapat dimuat.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
