import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export interface DeviceCameraInfo {
  id: string;
  label: string;
  isBack: boolean;
}

export const BARCODE_FORMATS_TO_SUPPORT: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
];

const BACK_CAMERA_REGEX = /back|rear|belakang|environment|main|macro|wide/i;
const FRONT_CAMERA_REGEX = /front|depan|user|selfie|facetime/i;

export function pickPreferredCameraId(cameras: DeviceCameraInfo[]): string {
  if (!cameras.length) return '';
  const backCam = cameras.find((c) => c.isBack);
  return backCam ? backCam.id : cameras[0].id;
}

export async function enumerateDeviceCameras(): Promise<DeviceCameraInfo[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await Html5Qrcode.getCameras();
    if (!devices || devices.length === 0) return [];
    return devices.map((d, idx) => {
      const rawLabel = (d.label || '').trim();
      const isBack = BACK_CAMERA_REGEX.test(rawLabel) && !FRONT_CAMERA_REGEX.test(rawLabel);
      let label = rawLabel;
      if (!label) {
        label = `Kamera ${idx + 1}`;
      } else if (isBack && !label.toLowerCase().includes('belakang')) {
        label = `${label} (Belakang)`;
      }
      return {
        id: d.id,
        label,
        isBack,
      };
    });
  } catch {
    return [];
  }
}

export function formatCameraErrorIndonesian(err: unknown): string {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Akses kamera memerlukan koneksi aman (HTTPS) atau localhost.';
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'Browser atau perangkat ini tidak mendukung akses kamera langsung.';
  }

  const errObj = err as { name?: string; message?: string } | string | null;
  const rawName = typeof errObj === 'object' && errObj?.name ? errObj.name : '';
  const rawMsg =
    typeof errObj === 'string'
      ? errObj
      : typeof errObj === 'object' && errObj?.message
        ? errObj.message
        : String(err || '');

  const combined = `${rawName} ${rawMsg}`.toLowerCase();

  if (combined.includes('notallowed') || combined.includes('permissiondenied') || combined.includes('permission dismissed')) {
    return 'Izin kamera ditolak. Buka ikon gembok/kamera di address bar browser lalu pilih Izinkan (Allow).';
  }
  if (combined.includes('notfound') || combined.includes('devicesnotfound') || combined.includes('no camera')) {
    return 'Kamera tidak terdeteksi di perangkat ini. Pastikan kamera terpasang atau tidak dinonaktifkan.';
  }
  if (combined.includes('notreadable') || combined.includes('trackstart') || combined.includes('could not start video source')) {
    return 'Kamera sedang digunakan aplikasi/tab lain. Tutup aplikasi kamera lain lalu klik coba lagi.';
  }
  if (combined.includes('overconstrained')) {
    return 'Mode/resolusi kamera tidak sesuai dengan perangkat ini.';
  }

  return rawMsg || 'Pastikan izin kamera diaktifkan di browser dan perangkat mendukung kamera.';
}

export async function stopHtml5QrScanner(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) return;
  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
  } catch {
    // Ignore stop errors during cleanup
  }
  try {
    scanner.clear();
  } catch {
    // Ignore clear errors during cleanup
  }
}

export interface StartScannerOptions {
  elementId: string;
  preferredCameraId?: string;
  existingScanner?: Html5Qrcode | null;
  onSuccess: (decodedText: string) => void;
  fps?: number;
  aspectRatio?: number;
}

export interface StartScannerResult {
  scanner: Html5Qrcode;
  cameras: DeviceCameraInfo[];
  activeCameraId: string;
}

/**
 * Starts Html5Qrcode robustly across desktop webcams, Android/iOS mobile rear & front cameras,
 * handles post-permission camera enumeration, responsive CODE_128 qrbox sizing, and fallback targets.
 */
export async function startHtml5QrScanner(
  options: StartScannerOptions
): Promise<StartScannerResult> {
  const {
    elementId,
    preferredCameraId,
    existingScanner,
    onSuccess,
    fps = 16,
    aspectRatio,
  } = options;

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error('Akses kamera memerlukan koneksi HTTPS atau localhost.');
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Browser ini tidak mendukung API kamera perangkat (getUserMedia).');
  }

  await stopHtml5QrScanner(existingScanner || null);

  // Wait one animation frame so container layout dimensions settle if toggled visible
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });

  // Pre-warm camera permission if no labeled cameras are visible yet
  let preCameras = await enumerateDeviceCameras();
  const hasLabeledCamera = preCameras.some(
    (c) => c.label && !/^Kamera \d+$/i.test(c.label)
  );
  if (preCameras.length === 0 || !hasLabeledCamera) {
    try {
      const warmupStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      warmupStream.getTracks().forEach((track) => track.stop());
      preCameras = await enumerateDeviceCameras();
    } catch {
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        fallbackStream.getTracks().forEach((track) => track.stop());
        preCameras = await enumerateDeviceCameras();
      } catch (permErr) {
        throw permErr;
      }
    }
  }

  const scanner = new Html5Qrcode(elementId, {
    formatsToSupport: BARCODE_FORMATS_TO_SUPPORT,
    useBarCodeDetectorIfSupported: true,
    verbose: false,
  });

  const targets: Array<string | MediaTrackConstraints> = [];
  if (preferredCameraId && preCameras.some((c) => c.id === preferredCameraId)) {
    targets.push(preferredCameraId);
  }
  const backCam = preCameras.find((c) => c.isBack);
  if (backCam && backCam.id !== preferredCameraId) {
    targets.push(backCam.id);
  }
  targets.push({ facingMode: 'environment' });
  targets.push({ facingMode: 'user' });
  for (const cam of preCameras) {
    if (cam.id !== preferredCameraId && cam.id !== backCam?.id) {
      targets.push(cam.id);
    }
  }

  const scanConfig = {
    fps,
    disableFlip: false,
    ...(aspectRatio ? { aspectRatio } : {}),
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
      const safeW = Math.max(120, viewfinderWidth);
      const safeH = Math.max(120, viewfinderHeight);
      const width = Math.max(90, Math.min(Math.floor(safeW * 0.88), 380, safeW - 12));
      const height = Math.max(64, Math.min(Math.floor(safeH * 0.56), 180, safeH - 12));
      return { width, height };
    },
  };

  let started = false;
  let lastError: unknown = null;

  for (const target of targets) {
    try {
      await scanner.start(
        target,
        scanConfig,
        (decodedText: string) => {
          onSuccess(decodedText);
        },
        () => {
          // Per-frame non-match ignored silently
        }
      );
      started = true;
      break;
    } catch (err) {
      lastError = err;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      } catch {
        // Ignore cleanup between fallbacks
      }
    }
  }

  if (!started) {
    throw lastError || new Error('Gagal memulai kamera perangkat.');
  }

  // Request continuous autofocus if hardware supports it
  try {
    await scanner.applyVideoConstraints({
      advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
    } as MediaTrackConstraints);
  } catch {
    // Browser/device doesn't support continuous focusMode constraint - safe to ignore
  }

  // Re-enumerate after active stream so browser guarantees full camera labels
  const updatedCameras = await enumerateDeviceCameras();
  let activeCameraId = preferredCameraId || '';
  try {
    const runningSettings = scanner.getRunningTrackSettings();
    if (runningSettings?.deviceId) {
      activeCameraId = runningSettings.deviceId;
    }
  } catch {
    // Safe fallback
  }
  if (!activeCameraId && updatedCameras.length > 0) {
    activeCameraId = pickPreferredCameraId(updatedCameras);
  }

  return {
    scanner,
    cameras: updatedCameras,
    activeCameraId,
  };
}

export async function scanBarcodeFromImageFile(
  tempElementId: string,
  file: File
): Promise<string> {
  const tempScanner = new Html5Qrcode(tempElementId, {
    formatsToSupport: BARCODE_FORMATS_TO_SUPPORT,
    useBarCodeDetectorIfSupported: true,
    verbose: false,
  });
  try {
    const decodedText = await tempScanner.scanFile(file, false);
    return decodedText;
  } finally {
    try {
      tempScanner.clear();
    } catch {
      // Ignore cleanup
    }
  }
}
