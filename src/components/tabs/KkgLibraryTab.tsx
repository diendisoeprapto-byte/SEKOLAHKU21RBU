import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Share2,
  Copy,
  Search,
  School,
  Sparkles,
  CheckCircle2,
  Presentation,
  Globe,
  Loader2,
  Trash2,
} from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ActiveUser, SchoolProfile, SharedKkgItem } from '../../types';
import {
  subscribeToSharedKkgItems,
  publishItemToKkgLibrary,
  removeSharedKkgItem,
} from '../../utils/kkgFirestore';
import {
  LearningAdminDoc,
  cleanSchoolNpsn,
  saveLearningDocToFirestore,
} from '../../utils/learningAdminFirestore';
import { db, auth } from '../../utils/firebase';
import { sanitizeInput } from '../../utils/sanitize';
import { convertDriveUrlToEmbedUrl } from './MediaAjarTab';

interface Props {
  activeUser: ActiveUser;
  profile: SchoolProfile;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const KkgLibraryTab: React.FC<Props> = ({
  activeUser,
  profile,
  showToast,
}) => {
  const [sharedItems, setSharedItems] = useState<SharedKkgItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'modul_ajar' | 'media_ajar'>('all');
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

  const [pubTitle, setPubTitle] = useState('');
  const [pubMapel, setPubMapel] = useState('Matematika');
  const [pubKelas, setPubKelas] = useState('Kelas 6A');
  const [pubTopik, setPubTopik] = useState('');
  const [pubDriveUrl, setPubDriveUrl] = useState('');
  const [pubType, setPubType] = useState<'modul_ajar' | 'media_ajar'>('modul_ajar');
  const [isPublishing, setIsPublishing] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToSharedKkgItems(setSharedItems);
    return () => unsub();
  }, []);

  const filteredItems = useMemo(() => {
    return sharedItems.filter((it) => {
      const matchType = selectedTypeFilter === 'all' || it.type === selectedTypeFilter;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        it.title.toLowerCase().includes(q) ||
        it.mapel.toLowerCase().includes(q) ||
        it.topik.toLowerCase().includes(q) ||
        it.schoolName.toLowerCase().includes(q) ||
        it.authorName.toLowerCase().includes(q);
      return matchType && matchSearch;
    });
  }, [sharedItems, selectedTypeFilter, searchQuery]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubTitle.trim() || !pubTopik.trim()) {
      showToast('Judul dan topik perangkat wajib diisi.', 'error');
      return;
    }

    const cleanDrive = pubDriveUrl.trim();
    const embedUrl = cleanDrive ? convertDriveUrlToEmbedUrl(cleanDrive) : null;

    setIsPublishing(true);
    try {
      await publishItemToKkgLibrary({
        npsn: profile.npsn,
        schoolName: profile.name,
        authorName: activeUser.name,
        type: pubType,
        title: sanitizeInput(pubTitle, 180),
        mapel: sanitizeInput(pubMapel, 80),
        kelas: sanitizeInput(pubKelas, 40),
        topik: sanitizeInput(pubTopik, 250),
        contentData: {
          note: 'Dibagikan secara kolaboratif melalui Ekosistem KKG SERBU 21',
          driveUrl: cleanDrive || undefined,
          embedUrl: embedUrl || undefined,
        },
      });
      showToast('Perangkat berhasil dibagikan ke Pustaka KKG Lintas Sekolah!', 'success');
      setIsPublishModalOpen(false);
      setPubTitle('');
      setPubTopik('');
      setPubDriveUrl('');
    } catch (err: any) {
      showToast('Gagal membagikan perangkat: ' + (err?.message || err), 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyItem = async (item: SharedKkgItem) => {
    setCopyingId(item.id);
    try {
      const npsnKey = cleanSchoolNpsn(profile.npsn);
      if (item.type === 'modul_ajar') {
        const docsKey = `serbu21_learning_docs_${npsnKey}`;
        const docsSeededKey = `serbu21_learning_docs_seeded_${npsnKey}`;
        const copiedDoc: LearningAdminDoc = {
          id: `doc_kkg_${Date.now()}`,
          teacherId: activeUser.username || activeUser.name || 't_current',
          teacherName: activeUser.name || activeUser.username || 'Guru Pengajar',
          academicYear: profile.activeAcademicYear || '2026/2027',
          kelas: item.kelas || 'Kelas 6A',
          type: 'modul_ajar',
          title: `${item.title} (Salinan KKG: ${item.schoolName})`,
          driveUrl: item.contentData?.driveUrl || 'https://docs.google.com/',
          contentDraft:
            item.contentData?.contentDraft ||
            `Topik: ${item.topik}\nMapel: ${item.mapel}\nSumber KKG: ${item.schoolName} (${item.authorName})`,
          status: 'Menunggu Verifikasi',
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        await saveLearningDocToFirestore(profile.npsn, copiedDoc);
        try {
          const existing = JSON.parse(localStorage.getItem(docsKey) || '[]');
          const updatedList = Array.isArray(existing) ? [copiedDoc, ...existing] : [copiedDoc];
          localStorage.setItem(docsKey, JSON.stringify(updatedList));
          localStorage.setItem(docsSeededKey, 'true');
        } catch {
          // ignore localStorage write errors
        }
      } else {
        const gradeMatch = String(item.kelas || '').match(/([1-6])/);
        const targetKelasNum = gradeMatch?.[1] || '1';
        const rawDrive =
          String(item.contentData?.driveUrl || item.contentData?.drive_url || '').trim() ||
          'https://drive.google.com/';
        const resolvedEmbed =
          String(item.contentData?.embedUrl || item.contentData?.embed_url || '').trim() ||
          convertDriveUrlToEmbedUrl(rawDrive) ||
          rawDrive;

        await addDoc(collection(db, 'media_ajar'), {
          judul: `${item.title} (Salinan KKG: ${item.schoolName})`,
          kelas: targetKelasNum,
          mapel: item.mapel || 'Umum',
          bab: item.contentData?.bab || 'Bab 1',
          pertemuan: item.contentData?.pertemuan || item.topik || 'Pertemuan 1',
          drive_url: rawDrive,
          embed_url: resolvedEmbed,
          guru_nama: activeUser.name || 'Guru',
          guru_uid: auth.currentUser?.uid || activeUser.username || 'guru_serbu21',
          created_at: serverTimestamp(),
        });
      }
      window.dispatchEvent(new Event('sekolahku-cloud-sync-updated'));
      showToast(
        `Berhasil menyalin "${item.title}" ke ${item.type === 'modul_ajar' ? 'Administrasi Pembelajaran' : 'Bank Media Ajar'} sekolah Anda!`,
        'success'
      );
    } catch (err: any) {
      showToast('Gagal menyalin perangkat ke kelas Anda: ' + (err?.message || err), 'error');
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-900 via-teal-950 to-slate-900 p-6 sm:p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-emerald-600/30 border border-emerald-400/40 px-3.5 py-1 rounded-full text-xs font-extrabold text-emerald-200">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>Ekosistem KKG Bersama (Lintas Sekolah)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-black">
              Pustaka Berbagi Perangkat Ajar & Media KKG
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl">
              Kolaborasi guru-guru dari berbagai sekolah untuk saling berbagi modul ajar, RPP, dan media presentasi berkualitas tinggi dengan satu klik salin.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsPublishModalOpen(true)}
            className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-600/30 shrink-0"
          >
            <Share2 className="w-4 h-4" />
            <span>Bagikan Perangkat Saya ke KKG</span>
          </button>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul perangkat, mapel, topik, atau asal sekolah..."
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-emerald-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('all')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer ${
              selectedTypeFilter === 'all'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Semua ({sharedItems.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('modul_ajar')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer ${
              selectedTypeFilter === 'modul_ajar'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Modul Ajar
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('media_ajar')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer ${
              selectedTypeFilter === 'media_ajar'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Media Ajar
          </button>
        </div>
      </div>

      {/* List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredItems.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 font-semibold">
            Belum ada perangkat ajar yang dibagikan di Pustaka KKG Bersama saat ini.
          </div>
        ) : (
          filteredItems.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between gap-4 hover:border-emerald-300 transition">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                    item.type === 'modul_ajar' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'
                  }`}>
                    {item.type === 'modul_ajar' ? 'Modul Ajar RPP' : 'Media Ajar PPT'}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 font-mono">
                    {item.kelas} • {item.mapel}
                  </span>
                </div>

                <h3 className="font-display font-black text-slate-900 text-base leading-snug">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 font-medium line-clamp-2">
                  Topik: {item.topik}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <School className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="truncate">
                    <p className="text-[11px] font-black text-slate-800 truncate">{item.schoolName}</p>
                    <p className="text-[10px] text-slate-500 truncate">Oleh: {item.authorName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {(item.npsn === profile.npsn || activeUser.role === 'admin') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await removeSharedKkgItem(item.id);
                          showToast('Perangkat dihapus dari Pustaka KKG Bersama.', 'success');
                        } catch {
                          showToast('Gagal menghapus item KKG.', 'error');
                        }
                      }}
                      title="Hapus dari Pustaka KKG"
                      className="p-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={copyingId === item.id}
                    onClick={() => void handleCopyItem(item)}
                    className="px-4 py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 font-display font-black text-xs flex items-center gap-1.5 transition cursor-pointer border border-emerald-200 shrink-0"
                  >
                    {copyingId === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copyingId === item.id ? 'Menyalin...' : 'Salin ke Kelas Saya'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Publish Modal */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-xl font-display font-black text-slate-900">Bagikan ke Pustaka KKG</h3>
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(false)}
                className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePublish} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jenis Perangkat</label>
                <select
                  value={pubType}
                  onChange={(e) => setPubType(e.target.value as any)}
                  className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 bg-white outline-none focus:border-emerald-500"
                >
                  <option value="modul_ajar">Modul Ajar / RPP</option>
                  <option value="media_ajar">Media Ajar Presentasi (PPT)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Judul Perangkat</label>
                <input
                  type="text"
                  required
                  value={pubTitle}
                  onChange={(e) => setPubTitle(e.target.value)}
                  placeholder="Contoh: Modul Ajar IPAS Ekosistem Sawah Berdiferensiasi"
                  className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mata Pelajaran</label>
                  <input
                    type="text"
                    required
                    value={pubMapel}
                    onChange={(e) => setPubMapel(e.target.value)}
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kelas</label>
                  <input
                    type="text"
                    required
                    value={pubKelas}
                    onChange={(e) => setPubKelas(e.target.value)}
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Topik / Tujuan Pembelajaran</label>
                <input
                  type="text"
                  required
                  value={pubTopik}
                  onChange={(e) => setPubTopik(e.target.value)}
                  placeholder="Contoh: Rantai Makanan & Keseimbangan Ekosistem"
                  className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tautan Google Drive / Docs / Slides (Opsional)
                </label>
                <input
                  type="url"
                  value={pubDriveUrl}
                  onChange={(e) => setPubDriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view"
                  className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-mono outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPublishModalOpen(false)}
                  className="px-6 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md"
                >
                  {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                  <span>Bagikan Sekarang</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
