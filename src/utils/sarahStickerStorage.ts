import { SARAH_REALISTIC_STICKERS_ENDI } from './sarahStickers';
import { db } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';

export interface CustomRealisticStickerEntry {
  id: string; // e.g. 'real_endi_01' .. 'real_endi_60'
  number: number; // 1..60
  fileName: string; // e.g. 'real_endi_01_senyum_sapa.png' or 'sarah-real-31.png'
  dataUrl: string; // PNG data URL (512x512 transparent)
  updatedAt: number;
}

const STICKER_IDB_NAME = 'serbu21_sarah_stickers_db';
const STICKER_IDB_VERSION = 1;
const STICKER_STORE_NAME = 'custom_realistic_stickers';
const STICKER_FIRESTORE_COLLECTION = 'sarah_custom_stickers';
export const SARAH_STICKERS_UPDATED_EVENT = 'serbu21-sarah-stickers-updated';

const inMemoryStickerCache = new Map<string, CustomRealisticStickerEntry>();
let idbHydrated = false;
let hydratePromise: Promise<void> | null = null;
let firestoreSubscribed = false;

function openStickerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB tidak tersedia di browser ini.'));
      return;
    }
    const req = window.indexedDB.open(STICKER_IDB_NAME, STICKER_IDB_VERSION);
    req.onupgradeneeded = () => {
      const dbInstance = req.result;
      if (!dbInstance.objectStoreNames.contains(STICKER_STORE_NAME)) {
        dbInstance.createObjectStore(STICKER_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Gagal membuka IndexedDB stiker.'));
  });
}

async function saveToIndexedDBLocal(entries: CustomRealisticStickerEntry[]): Promise<void> {
  if (!entries.length) return;
  try {
    const dbInstance = await openStickerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = dbInstance.transaction(STICKER_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STICKER_STORE_NAME);
      for (const entry of entries) {
        store.put(entry);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore IDB write errors
  }
}

async function loadFromIndexedDBLocal(): Promise<CustomRealisticStickerEntry[]> {
  try {
    const dbInstance = await openStickerDb();
    return await new Promise<CustomRealisticStickerEntry[]>((resolve) => {
      const tx = dbInstance.transaction(STICKER_STORE_NAME, 'readonly');
      const store = tx.objectStore(STICKER_STORE_NAME);
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const rows = Array.isArray(getAllReq.result) ? getAllReq.result : [];
        resolve(rows);
      };
      getAllReq.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

function setupFirestoreStickerListener() {
  if (firestoreSubscribed || typeof window === 'undefined') return;
  firestoreSubscribed = true;
  try {
    onSnapshot(
      collection(db, STICKER_FIRESTORE_COLLECTION),
      (snap) => {
        let changed = false;
        snap.forEach((d) => {
          const data = d.data() as CustomRealisticStickerEntry;
          if (data?.id && data?.dataUrl) {
            const existing = inMemoryStickerCache.get(data.id);
            if (!existing || existing.updatedAt !== data.updatedAt) {
              inMemoryStickerCache.set(data.id, data);
              changed = true;
            }
          }
        });
        if (changed) {
          idbHydrated = true;
          const allEntries = Array.from(inMemoryStickerCache.values());
          void saveToIndexedDBLocal(allEntries);
          window.dispatchEvent(new Event(SARAH_STICKERS_UPDATED_EVENT));
        }
      },
      () => {}
    );
  } catch {
    // ignore offline listener errors
  }
}

export async function hydrateCustomEndiStickers(): Promise<CustomRealisticStickerEntry[]> {
  if (typeof window === 'undefined') return [];
  if (idbHydrated) {
    return Array.from(inMemoryStickerCache.values()).sort((a, b) => a.number - b.number);
  }
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        // 1. Load from local IndexedDB first for instant render
        const localRows = await loadFromIndexedDBLocal();
        inMemoryStickerCache.clear();
        for (const row of localRows) {
          if (row?.id && row?.dataUrl) {
            inMemoryStickerCache.set(row.id, row);
          }
        }

        // 2. Fetch latest from Firestore cloud for real-time cross-device sync
        const cloudSnap = await getDocs(collection(db, STICKER_FIRESTORE_COLLECTION));
        if (!cloudSnap.empty) {
          const cloudRows: CustomRealisticStickerEntry[] = [];
          cloudSnap.forEach((d) => {
            const data = d.data() as CustomRealisticStickerEntry;
            if (data?.id && data?.dataUrl) {
              cloudRows.push(data);
              inMemoryStickerCache.set(data.id, data);
            }
          });
          if (cloudRows.length > 0) {
            void saveToIndexedDBLocal(cloudRows);
          }
        }

        idbHydrated = true;
        setupFirestoreStickerListener();
      } catch {
        idbHydrated = true;
        setupFirestoreStickerListener();
      } finally {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(SARAH_STICKERS_UPDATED_EVENT));
        }
      }
    })();
  }
  await hydratePromise;
  return Array.from(inMemoryStickerCache.values()).sort((a, b) => a.number - b.number);
}

export function getCachedCustomEndiStickerDataUrl(stickerId: string): string | null {
  const clean = String(stickerId || '').trim().toLowerCase();
  if (!clean) return null;
  const hit = inMemoryStickerCache.get(clean);
  return hit?.dataUrl || null;
}

export function getAllCachedCustomEndiStickers(): CustomRealisticStickerEntry[] {
  return Array.from(inMemoryStickerCache.values()).sort((a, b) => a.number - b.number);
}

export async function saveCustomEndiStickersToIndexedDb(
  entries: CustomRealisticStickerEntry[]
): Promise<void> {
  if (!entries.length) return;
  const timestamped = entries.map((e) => ({ ...e, updatedAt: Date.now() }));
  
  // 1. Save to local IndexedDB & memory cache
  await saveToIndexedDBLocal(timestamped);
  for (const entry of timestamped) {
    inMemoryStickerCache.set(entry.id, entry);
  }
  idbHydrated = true;

  // 2. Save to Firestore cloud in real-time so other devices receive them instantly
  try {
    const writes = timestamped.map((entry) =>
      setDoc(doc(db, STICKER_FIRESTORE_COLLECTION, entry.id), entry, { merge: true })
    );
    await Promise.all(writes);
  } catch (err) {
    console.warn('Gagal menyinkronkan stiker realistik ke Firestore cloud:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SARAH_STICKERS_UPDATED_EVENT));
  }
}

export async function deleteCustomEndiStickerById(stickerId: string): Promise<void> {
  const clean = String(stickerId || '').trim().toLowerCase();
  if (!clean) return;
  inMemoryStickerCache.delete(clean);
  try {
    const dbInstance = await openStickerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = dbInstance.transaction(STICKER_STORE_NAME, 'readwrite');
      tx.objectStore(STICKER_STORE_NAME).delete(clean);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore IDB error
  }
  try {
    await deleteDoc(doc(db, STICKER_FIRESTORE_COLLECTION, clean));
  } catch {
    // ignore Firestore error
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SARAH_STICKERS_UPDATED_EVENT));
  }
}

export async function clearAllCustomEndiStickers(): Promise<void> {
  const keysToDelete = Array.from(inMemoryStickerCache.keys());
  inMemoryStickerCache.clear();
  try {
    const dbInstance = await openStickerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = dbInstance.transaction(STICKER_STORE_NAME, 'readwrite');
      tx.objectStore(STICKER_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
  try {
    const deletes = keysToDelete.map((id) => deleteDoc(doc(db, STICKER_FIRESTORE_COLLECTION, id)));
    await Promise.all(deletes);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SARAH_STICKERS_UPDATED_EVENT));
  }
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Gagal memuat gambar lembar stiker "${file.name}".`));
    };
    img.src = objectUrl;
  });
}

/**
 * Menghapus latar checkerboard abu-abu/putih di luar garis tepi putih (die-cut border)
 * dengan BFS flood-fill dari keempat sudut & tepi luar sel, sambil menjaga halo putih di sekitar subjek.
 */
function removeCheckerboardBackgroundWithFloodFill(
  imageData: ImageData,
  width: number,
  height: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const data = imageData.data;
  const totalPixels = width * height;

  // 1. Tandai piksel inti karya seni (berwarna atau cukup gelap, bukan checkerboard/border putih)
  const marginIgnore = 3;
  const dist = new Int16Array(totalPixels).fill(-1);
  const haloQueue = new Int32Array(totalPixels);
  let hHead = 0;
  let hTail = 0;

  for (let y = marginIgnore; y < height - marginIgnore; y++) {
    for (let x = marginIgnore; x < width - marginIgnore; x++) {
      const idx = y * width + x;
      const p = idx * 4;
      const a = data[p + 3];
      if (a < 25) continue;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;
      const luma = (r + g + b) / 3;

      // Inti subjek/wajah/hijab/baju: berwarna atau gelap
      if (chroma > 22 || luma < 176) {
        dist[idx] = 0;
        haloQueue[hTail++] = idx;
      }
    }
  }

  // 2. Perluas zona pelindung garis tepi putih (die-cut border) dari inti subjek
  const dieCutRadiusPx = Math.max(6, Math.min(18, Math.round(Math.min(width, height) * 0.032)));
  while (hHead < hTail) {
    const curr = haloQueue[hHead++];
    const d = dist[curr];
    if (d >= dieCutRadiusPx) continue;

    const cx = curr % width;
    const cy = (curr - cx) / width;

    if (cx > 0) {
      const n = curr - 1;
      if (dist[n] === -1) {
        dist[n] = d + 1;
        haloQueue[hTail++] = n;
      }
    }
    if (cx < width - 1) {
      const n = curr + 1;
      if (dist[n] === -1) {
        dist[n] = d + 1;
        haloQueue[hTail++] = n;
      }
    }
    if (cy > 0) {
      const n = curr - width;
      if (dist[n] === -1) {
        dist[n] = d + 1;
        haloQueue[hTail++] = n;
      }
    }
    if (cy < height - 1) {
      const n = curr + width;
      if (dist[n] === -1) {
        dist[n] = d + 1;
        haloQueue[hTail++] = n;
      }
    }
  }

  const isBackgroundCandidate = (idx: number): boolean => {
    if (dist[idx] !== -1) return false; // Dilindungi sebagai subjek atau garis tepi putih die-cut
    const p = idx * 4;
    const a = data[p + 3];
    if (a === 0) return true;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;
    const luma = (r + g + b) / 3;
    // Kotak checkerboard abu-abu/putih netral (nilai luma tinggi-menengah dan saturasi sangat rendah)
    return chroma <= 26 && luma >= 178;
  };

  // 3. BFS Flood-fill dari keempat sudut dan sekeliling tepi sel
  const visited = new Uint8Array(totalPixels);
  const bgQueue = new Int32Array(totalPixels);
  let bHead = 0;
  let bTail = 0;

  const trySeed = (x: number, y: number) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    if (isBackgroundCandidate(idx)) {
      visited[idx] = 1;
      bgQueue[bTail++] = idx;
    }
  };

  // 4 sudut wajib + tepi keliling sel agar aman meski ada garis tipis pemisah grid
  trySeed(0, 0);
  trySeed(width - 1, 0);
  trySeed(0, height - 1);
  trySeed(width - 1, height - 1);
  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (bHead < bTail) {
    const curr = bgQueue[bHead++];
    const p = curr * 4;
    data[p + 3] = 0;

    const cx = curr % width;
    const cy = (curr - cx) / width;

    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < width - 1 ? curr + 1 : -1,
      cy > 0 ? curr - width : -1,
      cy < height - 1 ? curr + width : -1,
    ];
    for (let i = 0; i < 4; i++) {
      const n = neighbors[i];
      if (n >= 0 && !visited[n] && isBackgroundCandidate(n)) {
        visited[n] = 1;
        bgQueue[bTail++] = n;
      }
    }
  }

  // 4. Cari bounding box bersih dari stiker yang tersisa
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (data[p + 3] > 18) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Memotong lembar stiker grid 2 kolom x 3 baris menjadi 6 file stiker PNG 512x512 transparan.
 * Bagian bawah tiap sel (~18%) otomatis dipotong agar label teks tidak ikut terbawa.
 */
export async function sliceStickerSheet2x3(
  file: File,
  startNumber: number
): Promise<CustomRealisticStickerEntry[]> {
  const img = await loadImageFromFile(file);
  const cols = 2;
  const rows = 3;
  const cellW = Math.floor(img.naturalWidth / cols);
  const cellH = Math.floor(img.naturalHeight / rows);
  const cropH = Math.max(32, Math.round(cellH * 0.82)); // Ambil 82% bagian atas sel (buang teks label)

  const cellCanvas = document.createElement('canvas');
  cellCanvas.width = cellW;
  cellCanvas.height = cropH;
  const cellCtx = cellCanvas.getContext('2d', { willReadFrequently: true });

  const outCanvas = document.createElement('canvas');
  outCanvas.width = 512;
  outCanvas.height = 512;
  const outCtx = outCanvas.getContext('2d');

  if (!cellCtx || !outCtx) {
    throw new Error('Browser tidak mendukung konteks HTML5 Canvas 2D.');
  }

  const results: CustomRealisticStickerEntry[] = [];
  let indexOffset = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const stickerNum = startNumber + indexOffset;
      indexOffset += 1;
      if (stickerNum < 1 || stickerNum > 60) continue;

      const sx = c * cellW;
      const sy = r * cellH;

      cellCtx.clearRect(0, 0, cellW, cropH);
      cellCtx.drawImage(img, sx, sy, cellW, cropH, 0, 0, cellW, cropH);

      const imgData = cellCtx.getImageData(0, 0, cellW, cropH);
      const bounds = removeCheckerboardBackgroundWithFloodFill(imgData, cellW, cropH);
      cellCtx.putImageData(imgData, 0, 0);

      const subjW = Math.max(1, bounds.maxX - bounds.minX + 1);
      const subjH = Math.max(1, bounds.maxY - bounds.minY + 1);

      outCtx.clearRect(0, 0, 512, 512);
      const padding = 20;
      const targetBox = 512 - padding * 2;
      const scale = Math.min(targetBox / subjW, targetBox / subjH);
      const drawW = Math.round(subjW * scale);
      const drawH = Math.round(subjH * scale);
      const drawX = Math.round((512 - drawW) / 2);
      const drawY = Math.round((512 - drawH) / 2);

      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';
      outCtx.drawImage(
        cellCanvas,
        bounds.minX,
        bounds.minY,
        subjW,
        subjH,
        drawX,
        drawY,
        drawW,
        drawH
      );

      const paddedNum = String(stickerNum).padStart(2, '0');
      const stickerId = `real_endi_${paddedNum}`;
      const matchedMeta = SARAH_REALISTIC_STICKERS_ENDI.find((s) => s.id === stickerId);
      const resolvedFileName =
        matchedMeta?.path.split('/').pop() || `sarah-real-${paddedNum}.png`;

      results.push({
        id: stickerId,
        number: stickerNum,
        fileName: resolvedFileName,
        dataUrl: outCanvas.toDataURL('image/png'),
        updatedAt: Date.now(),
      });
    }
  }

  return results;
}

export async function downloadSlicedStickersAsPng(
  entries: CustomRealisticStickerEntry[]
): Promise<number> {
  if (!entries.length) return 0;
  let downloaded = 0;
  for (const item of entries) {
    if (!item.dataUrl) continue;
    const a = document.createElement('a');
    a.href = item.dataUrl;
    a.download = item.fileName || `sarah-real-${String(item.number).padStart(2, '0')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    downloaded += 1;
    // Jeda ringan agar browser mengizinkan unduhan multi-file tanpa diblokir
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return downloaded;
}
