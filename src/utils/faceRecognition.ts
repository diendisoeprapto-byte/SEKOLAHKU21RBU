import * as faceapi from '@vladmandic/face-api';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Student } from '../types';
import { db } from './firebase';
import { notifyStorageMutation, safeSetLocalStorage } from './storage';

export const FACE_MODELS_PATH = '/face-models';
export const FACE_PROFILES_STORAGE_KEY = 'sekolahku_face_profiles_v1';
const FACE_FIRESTORE_COLLECTION = 'settings';
const FACE_FIRESTORE_DOC = 'student_face_descriptors';

export interface StoredFaceProfile {
  studentId: string;
  descriptor: number[];
  sampleCount?: number;
  source: 'camera' | 'photo' | 'upload';
  updatedAt: string;
  thumbnailDataUrl?: string;
}

export interface DetectedFaceMatch {
  box: { x: number; y: number; width: number; height: number };
  descriptor: number[];
  score: number;
  matchedStudent: Student | null;
  distance: number;
  confidence: number;
}

let modelsLoaded = false;
let modelsLoadPromise: Promise<void> | null = null;

export const isFaceModelsLoaded = (): boolean => modelsLoaded;

export async function loadFaceRecognitionModels(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoadPromise) return modelsLoadPromise;

  modelsLoadPromise = (async () => {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_PATH),
        faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_PATH),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_PATH),
      ]);
      modelsLoaded = true;
    } catch (err) {
      modelsLoadPromise = null;
      throw err;
    }
  })();

  return modelsLoadPromise;
}

const roundDescriptor = (arr: Float32Array | number[]): number[] =>
  Array.from(arr, (v) => Math.round(v * 100000) / 100000);

export const getStoredFaceProfiles = (): Record<string, StoredFaceProfile> => {
  try {
    const raw = localStorage.getItem(FACE_PROFILES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, StoredFaceProfile>;
  } catch {
    return {};
  }
};

export const saveStoredFaceProfiles = (
  profiles: Record<string, StoredFaceProfile>,
  options?: { skipCloudWrite?: boolean }
): void => {
  try {
    safeSetLocalStorage(FACE_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    notifyStorageMutation(FACE_PROFILES_STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sekolahku-face-profiles-updated'));
    }
  } catch (err) {
    console.warn('Gagal menyimpan profil wajah di localStorage:', err);
  }

  if (!options?.skipCloudWrite) {
    // Strip oversized thumbnails before writing single Firestore settings doc
    const cloudSafe: Record<string, Omit<StoredFaceProfile, 'thumbnailDataUrl'>> = {};
    Object.entries(profiles).forEach(([id, item]) => {
      if (!item || !Array.isArray(item.descriptor) || item.descriptor.length !== 128) return;
      cloudSafe[id] = {
        studentId: item.studentId || id,
        descriptor: roundDescriptor(item.descriptor),
        sampleCount: item.sampleCount || 1,
        source: item.source || 'camera',
        updatedAt: item.updatedAt || new Date().toISOString(),
      };
    });

    setDoc(
      doc(db, FACE_FIRESTORE_COLLECTION, FACE_FIRESTORE_DOC),
      {
        profiles: cloudSafe,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      console.warn('Sync profil wajah ke Firestore background warning:', err);
    });
  }
};

export const subscribeFaceProfilesFromCloud = (
  onSync: (merged: Record<string, StoredFaceProfile>) => void
): (() => void) => {
  try {
    const unsub = onSnapshot(
      doc(db, FACE_FIRESTORE_COLLECTION, FACE_FIRESTORE_DOC),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as { profiles?: Record<string, StoredFaceProfile> } | undefined;
        if (!data?.profiles || typeof data.profiles !== 'object') return;

        const local = getStoredFaceProfiles();
        const merged: Record<string, StoredFaceProfile> = { ...local };
        let changed = false;

        Object.entries(data.profiles).forEach(([id, cloudItem]) => {
          if (!cloudItem || !Array.isArray(cloudItem.descriptor) || cloudItem.descriptor.length !== 128) {
            return;
          }
          const localItem = local[id];
          const cloudTime = new Date(cloudItem.updatedAt || 0).getTime();
          const localTime = localItem ? new Date(localItem.updatedAt || 0).getTime() : -1;
          if (!localItem || cloudTime > localTime) {
            merged[id] = {
              ...cloudItem,
              thumbnailDataUrl: localItem?.thumbnailDataUrl || cloudItem.thumbnailDataUrl,
            };
            changed = true;
          }
        });

        if (changed) {
          saveStoredFaceProfiles(merged, { skipCloudWrite: true });
          onSync(merged);
        }
      },
      (err) => {
        console.warn('Face profiles snapshot listener warning:', err);
      }
    );
    return unsub;
  } catch {
    return () => {};
  }
};

export const averageFaceDescriptors = (descriptors: Array<Float32Array | number[]>): number[] => {
  if (descriptors.length === 0) return [];
  const dim = descriptors[0].length;
  const sum = new Array<number>(dim).fill(0);
  for (const desc of descriptors) {
    for (let i = 0; i < dim; i++) {
      sum[i] += desc[i];
    }
  }
  let normSq = 0;
  for (let i = 0; i < dim; i++) {
    sum[i] /= descriptors.length;
    normSq += sum[i] * sum[i];
  }
  const norm = Math.sqrt(normSq) || 1;
  return roundDescriptor(sum.map((v) => v / norm));
};

export const isUsableRealPhotoUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  if (!clean) return false;
  if (clean.startsWith('data:image/svg+xml')) return false;
  if (clean.includes('dicebear.com') || clean.includes('ui-avatars.com') || clean.endsWith('.svg')) {
    return false;
  }
  return clean.startsWith('data:image/') || clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/');
};

export async function extractSingleFaceDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  options?: { inputSize?: number; scoreThreshold?: number }
): Promise<{
  descriptor: number[];
  box: { x: number; y: number; width: number; height: number };
  score: number;
} | null> {
  await loadFaceRecognitionModels();
  const detectorOpts = new faceapi.TinyFaceDetectorOptions({
    inputSize: options?.inputSize || 320,
    scoreThreshold: options?.scoreThreshold ?? 0.42,
  });

  const result = await faceapi
    .detectSingleFace(input, detectorOpts)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) return null;
  const { x, y, width, height } = result.detection.box;
  return {
    descriptor: roundDescriptor(result.descriptor),
    box: { x, y, width, height },
    score: result.detection.score,
  };
}

export async function extractDescriptorFromImageUrl(url: string): Promise<number[] | null> {
  if (!isUsableRealPhotoUrl(url)) return null;
  await loadFaceRecognitionModels();

  return new Promise<number[] | null>((resolve) => {
    const img = new Image();
    if (!url.startsWith('data:') && !url.startsWith('/')) {
      img.crossOrigin = 'anonymous';
    }
    const timer = window.setTimeout(() => {
      resolve(null);
    }, 6000);

    img.onload = async () => {
      window.clearTimeout(timer);
      try {
        const resized = downscaleImageElementToCanvas(img, 480);
        const res = await extractSingleFaceDescriptor(resized, { inputSize: 320, scoreThreshold: 0.35 });
        resolve(res ? res.descriptor : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

function downscaleImageElementToCanvas(
  img: HTMLImageElement,
  maxDimension = 480
): HTMLCanvasElement {
  const origW = img.naturalWidth || img.width || maxDimension;
  const origH = img.naturalHeight || img.height || maxDimension;
  const scale = Math.min(1, maxDimension / Math.max(origW, origH));
  const targetW = Math.max(1, Math.round(origW * scale));
  const targetH = Math.max(1, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);
  }
  return canvas;
}

export async function extractDescriptorFromFile(file: File): Promise<{
  descriptor: number[];
  thumbnailDataUrl: string;
  compressedBytes: number;
} | null> {
  await loadFaceRecognitionModels();
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gambar tidak valid'));
      el.src = objectUrl;
    });

    // Perkecil & kompres gambar unggahan ke maks 480px agar proses deteksi wajah ringan & cepat
    const resizedCanvas = downscaleImageElementToCanvas(img, 480);
    const compressedDataUrl = resizedCanvas.toDataURL('image/jpeg', 0.76);
    const compressedBytes = Math.round((compressedDataUrl.length * 3) / 4);

    const res = await extractSingleFaceDescriptor(resizedCanvas, {
      inputSize: 320,
      scoreThreshold: 0.35,
    });
    if (!res) return null;

    const thumbnailDataUrl = cropFaceThumbnail(resizedCanvas, res.box);
    return {
      descriptor: res.descriptor,
      thumbnailDataUrl,
      compressedBytes,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function cropFaceThumbnail(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  box: { x: number; y: number; width: number; height: number }
): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 72;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    const padX = box.width * 0.22;
    const padY = box.height * 0.22;
    const sx = Math.max(0, box.x - padX);
    const sy = Math.max(0, box.y - padY);
    const sw = Math.min(srcW - sx, box.width + padX * 2);
    const sh = Math.min(srcH - sy, box.height + padY * 2);

    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, 72, 72);
    return canvas.toDataURL('image/jpeg', 0.64);
  } catch {
    return '';
  }
}

export function matchDescriptorAgainstStudents(
  queryDescriptor: Float32Array | number[],
  candidates: Array<{ student: Student; descriptor: number[] }>,
  maxDistance = 0.50
): { student: Student; distance: number; confidence: number } | null {
  let bestStudent: Student | null = null;
  let bestDistance = Infinity;

  for (const cand of candidates) {
    if (!cand.descriptor || cand.descriptor.length !== 128) continue;
    const dist = faceapi.euclideanDistance(queryDescriptor, cand.descriptor);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestStudent = cand.student;
    }
  }

  if (!bestStudent || bestDistance > maxDistance) {
    return null;
  }

  // Dist 0.0 -> 99%, dist 0.25 -> 93% (>90% strong match), dist 0.35 -> 89%, dist 0.50 -> 85%
  const confidence = Math.max(55, Math.min(99, Math.round((1 - bestDistance * 0.30) * 100)));
  return {
    student: bestStudent,
    distance: bestDistance,
    confidence,
  };
}

export async function detectAndMatchFacesOnVideo(
  video: HTMLVideoElement,
  candidates: Array<{ student: Student; descriptor: number[] }>,
  maxDistance = 0.50
): Promise<DetectedFaceMatch[]> {
  await loadFaceRecognitionModels();
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return [];
  }

  const detectorOpts = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.45,
  });

  const detections = await faceapi
    .detectAllFaces(video, detectorOpts)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map((det) => {
    const descArr = roundDescriptor(det.descriptor);
    const match = matchDescriptorAgainstStudents(det.descriptor, candidates, maxDistance);
    const { x, y, width, height } = det.detection.box;
    return {
      box: { x, y, width, height },
      descriptor: descArr,
      score: det.detection.score,
      matchedStudent: match ? match.student : null,
      distance: match ? match.distance : 1,
      confidence: match ? match.confidence : 0,
    };
  });
}

export async function startFaceCameraStream(
  videoEl: HTMLVideoElement,
  preferredCameraId?: string
): Promise<{ stream: MediaStream; activeCameraId: string }> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error('Akses kamera memerlukan koneksi HTTPS atau localhost.');
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Browser ini tidak mendukung akses kamera langsung (getUserMedia).');
  }

  const attempts: MediaStreamConstraints[] = [];
  if (preferredCameraId) {
    attempts.push({
      video: { deviceId: { exact: preferredCameraId }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  }
  attempts.push({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  attempts.push({
    video: true,
    audio: false,
  });

  let stream: MediaStream | null = null;
  let lastError: unknown = null;

  for (const constraints of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!stream) {
    throw lastError || new Error('Gagal mengakses kamera perangkat.');
  }

  videoEl.srcObject = stream;
  await new Promise<void>((resolve) => {
    const onLoaded = () => {
      videoEl.play().catch(() => {}).finally(() => resolve());
    };
    if (videoEl.readyState >= 1) {
      onLoaded();
    } else {
      videoEl.onloadedmetadata = onLoaded;
    }
  });

  const track = stream.getVideoTracks()[0];
  const activeCameraId = track?.getSettings?.().deviceId || preferredCameraId || '';
  return { stream, activeCameraId };
}

export function stopFaceCameraStream(
  stream: MediaStream | null,
  videoEl?: HTMLVideoElement | null
): void {
  if (stream) {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Ignore stop errors
      }
    });
  }
  if (videoEl) {
    try {
      videoEl.pause();
      videoEl.srcObject = null;
    } catch {
      // Ignore cleanup errors
    }
  }
}
