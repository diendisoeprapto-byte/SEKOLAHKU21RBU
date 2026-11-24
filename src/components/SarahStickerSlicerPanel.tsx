import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ImagePlus,
  Loader2,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
  HardDrive,
} from 'lucide-react';
import {
  SARAH_REALISTIC_STICKERS_ENDI,
  SarahStickerItem,
} from '../utils/sarahStickers';
import {
  CustomRealisticStickerEntry,
  SARAH_STICKERS_UPDATED_EVENT,
  clearAllCustomEndiStickers,
  downloadSlicedStickersAsPng,
  getAllCachedCustomEndiStickers,
  hydrateCustomEndiStickers,
  saveCustomEndiStickersToIndexedDb,
  sliceStickerSheet2x3,
} from '../utils/sarahStickerStorage';

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onInsertStickerInChat?: (stickerId: string) => void;
}

const START_NUMBER_OPTIONS = [31, 37, 43, 49, 55] as const;

interface QueuedSheetItem {
  id: string;
  file: File;
  previewUrl: string;
  startNumber: number;
}

const GalleryStickerCard: React.FC<{
  sticker: SarahStickerItem;
  indexNum: number;
  cachedEntry?: CustomRealisticStickerEntry;
  onUseSticker?: (id: string) => void;
}> = ({ sticker, indexNum, cachedEntry, onUseSticker }) => {
  const [staticExists, setStaticExists] = useState(false);
  const src = cachedEntry?.dataUrl || sticker.path;
  const isInSystem = Boolean(cachedEntry?.dataUrl) || staticExists;

  return (
    <div
      className={`rounded-2xl border p-2.5 flex flex-col items-center text-center gap-1.5 transition ${
        isInSystem
          ? 'bg-emerald-50/50 border-emerald-200 shadow-2xs'
          : 'bg-slate-50 border-slate-200/80 opacity-85'
      }`}
    >
      <div className="w-full flex items-center justify-between text-[10px] font-black">
        <span className="text-slate-600 font-mono">
          #{String(indexNum).padStart(2, '0')}
        </span>
        {isInSystem ? (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-extrabold">
            <CheckCircle2 className="w-2.5 h-2.5" />
            SUDAH MASUK SISTEM
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-600 text-[9px] font-bold">
            Belum Diunggah
          </span>
        )}
      </div>

      <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden p-1">
        <img
          src={src}
          alt={sticker.label}
          onLoad={() => {
            if (!cachedEntry?.dataUrl) setStaticExists(true);
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
            setStaticExists(false);
          }}
          className="w-full h-full object-contain"
        />
        {!isInSystem && (
          <span className="text-2xl select-none" aria-hidden="true">
            {sticker.emoji}
          </span>
        )}
      </div>

      <p className="text-[10px] font-bold text-slate-700 line-clamp-1 w-full" title={sticker.label}>
        {sticker.id}
      </p>

      {isInSystem && onUseSticker && (
        <button
          type="button"
          onClick={() => onUseSticker(sticker.id)}
          className="w-full py-1 px-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] transition cursor-pointer"
        >
          Pakai di Chat
        </button>
      )}
    </div>
  );
};

export const SarahStickerSlicerPanel: React.FC<Props> = ({
  showToast,
  onInsertStickerInChat,
}) => {
  const [defaultStartNum, setDefaultStartNum] = useState<number>(31);
  const [queuedSheets, setQueuedSheets] = useState<QueuedSheetItem[]>([]);
  const [slicedPreview, setSlicedPreview] = useState<CustomRealisticStickerEntry[]>([]);
  const [savedStickersMap, setSavedStickersMap] = useState<Record<string, CustomRealisticStickerEntry>>({});
  const [isSlicing, setIsSlicing] = useState(false);
  const [isSavingIdb, setIsSavingIdb] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const syncSavedFromStorage = () => {
    const all = getAllCachedCustomEndiStickers();
    const map: Record<string, CustomRealisticStickerEntry> = {};
    all.forEach((item) => {
      map[item.id] = item;
    });
    setSavedStickersMap(map);
  };

  useEffect(() => {
    void hydrateCustomEndiStickers().then(syncSavedFromStorage);
    const onUpdated = () => syncSavedFromStorage();
    window.addEventListener(SARAH_STICKERS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SARAH_STICKERS_UPDATED_EVENT, onUpdated);
  }, []);

  useEffect(() => {
    return () => {
      queuedSheets.forEach((q) => URL.revokeObjectURL(q.previewUrl));
    };
  }, [queuedSheets]);

  const handleSelectFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const validFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      showToast('Pilih file gambar lembar stiker (PNG/JPG/WEBP).', 'error');
      return;
    }

    const nextItems: QueuedSheetItem[] = validFiles.map((file, idx) => {
      const candidateStart = Math.min(55, defaultStartNum + (queuedSheets.length + idx) * 6);
      return {
        id: `sheet_${Date.now()}_${idx}`,
        file,
        previewUrl: URL.createObjectURL(file),
        startNumber: candidateStart,
      };
    });
    setQueuedSheets((prev) => [...prev, ...nextItems]);
  };

  const handleUpdateSheetStart = (sheetId: string, startNum: number) => {
    setQueuedSheets((prev) =>
      prev.map((item) => (item.id === sheetId ? { ...item, startNumber: startNum } : item))
    );
  };

  const handleRemoveSheet = (sheetId: string) => {
    setQueuedSheets((prev) => {
      const target = prev.find((i) => i.id === sheetId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== sheetId);
    });
  };

  const handleProcessSliceAll = async () => {
    if (queuedSheets.length === 0) {
      showToast('Unggah minimal 1 lembar stiker grid 2×3 terlebih dahulu.', 'error');
      return;
    }
    setIsSlicing(true);
    try {
      const allResults: CustomRealisticStickerEntry[] = [];
      for (const sheet of queuedSheets) {
        const sliced = await sliceStickerSheet2x3(sheet.file, sheet.startNumber);
        allResults.push(...sliced);
      }
      allResults.sort((a, b) => a.number - b.number);
      // Deduplikasi bila ada startNumber yang menimpa nomor sama (ambil terbaru)
      const dedupedMap = new Map<string, CustomRealisticStickerEntry>();
      allResults.forEach((entry) => dedupedMap.set(entry.id, entry));
      const finalList = Array.from(dedupedMap.values()).sort((a, b) => a.number - b.number);
      setSlicedPreview(finalList);
      showToast(
        `Berhasil memotong & membersihkan latar ${finalList.length} stiker (512×512 PNG transparan)!`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Gagal memotong lembar stiker.', 'error');
    } finally {
      setIsSlicing(false);
    }
  };

  const handleSaveToBrowserCache = async () => {
    if (slicedPreview.length === 0) {
      showToast('Belum ada hasil potongan stiker untuk disimpan.', 'error');
      return;
    }
    setIsSavingIdb(true);
    try {
      await saveCustomEndiStickersToIndexedDb(slicedPreview);
      syncSavedFromStorage();
      showToast(
        `${slicedPreview.length} stiker realistik tersimpan ke IndexedDB & langsung aktif di chat SARAH!`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyimpan ke IndexedDB browser.', 'error');
    } finally {
      setIsSavingIdb(false);
    }
  };

  const handleDownloadAllPng = async () => {
    const source =
      slicedPreview.length > 0 ? slicedPreview : getAllCachedCustomEndiStickers();
    if (source.length === 0) {
      showToast('Belum ada file stiker hasil potongan untuk diunduh.', 'error');
      return;
    }
    setIsDownloading(true);
    try {
      const count = await downloadSlicedStickersAsPng(source);
      showToast(
        `Mengunduh ${count} file PNG satuan (sarah-real-XX.png). Salin ke /public/assets/stickers/realistic/.`,
        'success'
      );
    } catch {
      showToast('Gagal mengunduh beberapa file stiker.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClearCustomCache = async () => {
    await clearAllCustomEndiStickers();
    syncSavedFromStorage();
    showToast('Cache browser stiker tambahan (#31–#60) berhasil dibersihkan.', 'success');
  };

  const customCount = useMemo(() => Object.keys(savedStickersMap).length, [savedStickersMap]);

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="bg-gradient-to-br from-rose-50 via-pink-50 to-amber-50 p-6 rounded-3xl border border-rose-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase">
              <Sparkles className="w-3 h-3" />
              Khusus Endi Soeprapto • Auto-Slicer 2×3
            </div>
            <h2 className="font-display font-black text-lg text-slate-900">
              Upload &amp; Auto-Slicer Lembar Stiker Realistik SARAH (#31–#60)
            </h2>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Unggah gambar lembar stiker grid <strong>2 kolom × 3 baris</strong> tanpa potong manual. Sistem memotong 6 sel otomatis, membuang label teks di bagian bawah (~18%), menghapus latar checkerboard di luar border putih (flood-fill 4 sudut), dan menghasilkan file transparan <strong>512×512 PNG</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="px-4 py-2.5 rounded-2xl bg-white border border-rose-200 text-center">
              <span className="block text-[10px] font-black uppercase text-slate-500">
                Stiker #31–#60 di Cache
              </span>
              <span className="font-display font-black text-lg text-rose-700">
                {customCount} / 30
              </span>
            </div>
          </div>
        </div>

        {/* Upload Bar */}
        <div className="bg-white p-4 rounded-2xl border border-rose-200/80 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <label className="block text-[11px] font-black uppercase text-slate-700 mb-1">
              Nomor Awal Stiker Lembar Pertama
            </label>
            <select
              value={defaultStartNum}
              onChange={(e) => setDefaultStartNum(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 font-bold text-xs text-slate-800 outline-none focus:border-rose-600"
            >
              {START_NUMBER_OPTIONS.map((num) => (
                <option key={num} value={num}>
                  Mulai dari #{num} (untuk #{num} s.d. #{num + 5})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleSelectFiles(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/70 hover:bg-rose-100 text-rose-800 font-display font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ImagePlus className="w-4 h-4" />
              <span>Pilih Lembar Stiker Grid 2×3 (Multi-File)</span>
            </button>
          </div>

          <div className="md:col-span-3">
            <button
              type="button"
              onClick={() => void handleProcessSliceAll()}
              disabled={isSlicing || queuedSheets.length === 0}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white font-display font-black text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-40"
            >
              {isSlicing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Scissors className="w-4 h-4" />
              )}
              <span>{isSlicing ? 'Memotong...' : 'Potong Otomatis 2×3'}</span>
            </button>
          </div>
        </div>

        {/* Queued Sheets */}
        {queuedSheets.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase text-slate-700">
              Lembar Stiker Siap Dipotong ({queuedSheets.length} file):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {queuedSheets.map((sheet) => (
                <div
                  key={sheet.id}
                  className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center gap-3"
                >
                  <img
                    src={sheet.previewUrl}
                    alt={sheet.file.name}
                    className="w-16 h-20 object-cover rounded-xl border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-xs font-bold text-slate-800 truncate" title={sheet.file.name}>
                      {sheet.file.name}
                    </p>
                    <select
                      value={sheet.startNumber}
                      onChange={(e) => handleUpdateSheetStart(sheet.id, Number(e.target.value))}
                      className="w-full px-2 py-1 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-700 bg-slate-50"
                    >
                      {START_NUMBER_OPTIONS.map((num) => (
                        <option key={num} value={num}>
                          Nomor Awal: #{num}–#{num + 5}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSheet(sheet.id)}
                    title="Hapus lembar"
                    className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sliced Output Preview & Dual Save Buttons */}
      {slicedPreview.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-display font-black text-base text-slate-900">
                Pratinjau Hasil Potongan Otomatis ({slicedPreview.length} Stiker • 512×512 PNG)
              </h3>
              <p className="text-xs text-slate-500">
                Latar checkerboard telah dihapus bersih menjadi PNG transparan dengan garis tepi putih die-cut terjaga.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveToBrowserCache()}
                disabled={isSavingIdb}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {isSavingIdb ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <HardDrive className="w-4 h-4" />
                )}
                <span>Simpan ke Cache Browser (IndexedDB)</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadAllPng()}
                disabled={isDownloading}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-display font-black text-xs flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Unduh Semua File Satuan (.PNG)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {slicedPreview.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-2xl border border-slate-200 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:12px_12px] flex flex-col items-center gap-1.5 text-center"
              >
                <img
                  src={item.dataUrl}
                  alt={item.fileName}
                  className="w-24 h-24 object-contain drop-shadow-sm"
                />
                <span className="text-[10px] font-mono font-black text-slate-800 bg-white/90 px-2 py-0.5 rounded border border-slate-200">
                  {item.fileName}
                </span>
                <span className="text-[9px] font-bold text-emerald-700">
                  {savedStickersMap[item.id] ? 'SUDAH MASUK SISTEM' : 'Siap Disimpan'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full 60-Sticker System Gallery */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-display font-black text-base text-slate-900">
              Galeri Lengkap 60 Stiker Realistik SARAH (Mas Endi)
            </h3>
            <p className="text-xs text-slate-500">
              Koleksi #01–#30 (bawaan) &amp; #31–#60 (`sarah-real-31.png` s.d. `sarah-real-60.png`). Klik &ldquo;Pakai di Chat&rdquo; untuk mengirim langsung.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {customCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void handleDownloadAllPng()}
                  disabled={isDownloading}
                  className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Unduh File Satuan Cache ({customCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleClearCustomCache()}
                  className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset Cache #31–#60</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {SARAH_REALISTIC_STICKERS_ENDI.map((stk, i) => (
            <GalleryStickerCard
              key={stk.id}
              sticker={stk}
              indexNum={i + 1}
              cachedEntry={savedStickersMap[stk.id]}
              onUseSticker={onInsertStickerInChat}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
