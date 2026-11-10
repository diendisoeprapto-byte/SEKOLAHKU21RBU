import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  QrCode,
  CheckCheck,
  Calendar,
  Clock,
  UserCheck,
  Upload,
  Link as LinkIcon,
  Video,
  VideoOff,
  CheckCircle2,
  X,
  RefreshCw,
  Search,
  Sparkles,
  AlertTriangle,
  FileImage,
  SwitchCamera,
  Volume2,
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Student, KaldikDay } from '../../types';
import { AttendanceRecordItem } from '../../utils/storage';
import { TabId } from '../Sidebar';

interface Props {
  students: Student[];
  activeClass: string;
  attendanceRecords: Record<string, AttendanceRecordItem>;
  onSaveAttendance: (records: Record<string, AttendanceRecordItem>) => void;
  kaldikDays: KaldikDay[];
  onNavigateTab: (tab: TabId) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

interface CameraDevice {
  id: string;
  label: string;
}

export const AbsensiTab: React.FC<Props> = ({
  students,
  activeClass,
  attendanceRecords,
  onSaveAttendance,
  kaldikDays,
  onNavigateTab,
  showToast,
  onOpenZoom,
}) => {
  const [activeDate, setActiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [cameraActive, setCameraActive] = useState(false);
  const [isInitializingCamera, setIsInitializingCamera] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  const [lastScannedStudent, setLastScannedStudent] = useState<string>('Siap menerima scan barcode siswa...');
  const [lastScannedTime, setLastScannedTime] = useState<string>('--:--');
  const [scannedSuccessItem, setScannedSuccessItem] = useState<{
    student: Student;
    time: string;
    status: 'H' | 'S' | 'I' | 'A';
  } | null>(null);

  const [manualCode, setManualCode] = useState('');
  const [selectedStudentDropdown, setSelectedStudentDropdown] = useState('');
  const [isScanningFile, setIsScanningFile] = useState(false);

  // Scanner & Hardware references
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const keyBufferRef = useRef<{ buffer: string; lastKeyTime: number }>({ buffer: '', lastKeyTime: 0 });

  const filteredStudents = students.filter((s) => s.kelas === activeClass);

  const activeDayKaldik = kaldikDays.find((k) => k.date === activeDate);
  const isSunday = new Date(activeDate).getDay() === 0;
  const isHoliday = isSunday || (activeDayKaldik ? activeDayKaldik.isHoliday : false);

  // Enumerate cameras on mount
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          const cams = devices.map((d) => ({
            id: d.id,
            label: d.label || `Kamera ${d.id.slice(0, 5)}`,
          }));
          setAvailableCameras(cams);
          // Prefer back/environment camera if available
          const backCam = cams.find((c) =>
            c.label.toLowerCase().includes('back') ||
            c.label.toLowerCase().includes('belakang') ||
            c.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCam ? backCam.id : cams[0].id);
        }
      })
      .catch((err) => {
        console.warn('Gagal membaca daftar kamera perangkat:', err);
      });
  }, []);

  // Play auditory tone
  const playBeep = (type: 'success' | 'error' = 'success') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      
      if (type === 'success') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.12); // A6
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.22);
      } else {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, audioCtx.currentTime);
        osc.frequency.setValueAtTime(220, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      }
    } catch {
      // Audio autoplay policy handled silently
    }
  };

  // Record student attendance to state, storage, and cloud
  const recordAttendance = (student: Student, status: 'H' | 'S' | 'I' | 'A' = 'H') => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const key = `${activeDate}_${student.id}`;

    const updated: Record<string, AttendanceRecordItem> = {
      ...attendanceRecords,
      [key]: {
        id: key,
        studentId: student.id,
        date: activeDate,
        status,
        time: timeStr.slice(0, 5),
      },
    };

    onSaveAttendance(updated);
    setLastScannedStudent(`${student.nama} (${student.barcodeId}) - ${status === 'H' ? 'HADIR' : status}`);
    setLastScannedTime(timeStr.slice(0, 5));
    setScannedSuccessItem({
      student,
      time: timeStr,
      status,
    });
    playBeep('success');

    if (student.kelas !== activeClass) {
      showToast(`✓ Siswa ${student.nama} (Kelas ${student.kelas}) berhasil tercatat Hadir!`, 'success');
    } else {
      showToast(`✓ Berhasil scan barcode: ${student.nama} (${student.barcodeId}) - Hadir`, 'success');
    }
  };

  // Parse detected barcode string and match student
  const handleBarcodeDetected = (rawCode: string) => {
    if (!rawCode) return;
    const clean = rawCode.trim().toLowerCase().replace(/^[\r\n\s]+|[\r\n\s]+$/g, '');
    if (!clean) return;

    // Search in current class first, then in whole school
    const studentInClass = filteredStudents.find((s) => {
      const bId = s.barcodeId.toLowerCase();
      const nId = s.nisn.toLowerCase();
      const sId = s.id.toLowerCase();
      return (
        bId === clean ||
        nId === clean ||
        sId === clean ||
        clean.includes(bId) ||
        clean.includes(nId)
      );
    });

    const studentAnywhere =
      studentInClass ||
      students.find((s) => {
        const bId = s.barcodeId.toLowerCase();
        const nId = s.nisn.toLowerCase();
        const sId = s.id.toLowerCase();
        return (
          bId === clean ||
          nId === clean ||
          sId === clean ||
          clean.includes(bId) ||
          clean.includes(nId)
        );
      });

    if (studentAnywhere) {
      recordAttendance(studentAnywhere, 'H');
    } else {
      playBeep('error');
      showToast(`Barcode "${rawCode}" tidak cocok dengan data siswa manapun!`, 'error');
    }
  };

  // Start Camera scanning using Html5Qrcode
  const startCameraScanner = async (cameraId?: string) => {
    setIsInitializingCamera(true);
    try {
      // If already running, stop first
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
          await html5QrCodeRef.current.clear();
        } catch (e) {
          console.warn('Error clearing previous instance:', e);
        }
      }

      const qrInstance = new Html5Qrcode('html5qr-code-full-region', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        verbose: false,
      });

      html5QrCodeRef.current = qrInstance;

      const cameraSource = cameraId
        ? { deviceId: { exact: cameraId } }
        : { facingMode: 'environment' };

      const scanConfig = {
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          // Optimized wide rectangular box for Code-128 linear barcodes
          const width = Math.floor(Math.min(viewfinderWidth * 0.92, 360));
          const height = Math.floor(Math.min(viewfinderHeight * 0.65, 180));
          return { width, height };
        },
        aspectRatio: 1.5,
      };

      await qrInstance.start(
        cameraSource,
        scanConfig,
        (decodedText: string) => {
          // Debounce same barcode within 2.5 seconds to prevent spamming
          const now = Date.now();
          if (
            lastScannedRef.current.code === decodedText &&
            now - lastScannedRef.current.time < 2500
          ) {
            return;
          }
          lastScannedRef.current = { code: decodedText, time: now };
          handleBarcodeDetected(decodedText);
        },
        () => {
          // Frame parse error ignored
        }
      );

      setCameraActive(true);
      showToast('Kamera pemindai barcode aktif! Arahkan barcode ke layar.', 'success');
    } catch (err: any) {
      console.error('Camera startup error:', err);
      setCameraActive(false);
      showToast(
        'Gagal mengakses kamera: ' +
          (err?.message || 'Pastikan izin kamera diaktifkan di browser'),
        'error'
      );
    } finally {
      setIsInitializingCamera(false);
    }
  };

  // Stop camera scanning
  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (e) {
        console.warn('Error stopping scanner:', e);
      }
    }
    setCameraActive(false);
  };

  const toggleCamera = () => {
    if (cameraActive) {
      stopCameraScanner();
    } else {
      startCameraScanner(selectedCameraId || undefined);
    }
  };

  // Switch camera device
  const handleCameraChange = (cameraId: string) => {
    setSelectedCameraId(cameraId);
    if (cameraActive) {
      startCameraScanner(cameraId);
    }
  };

  // Scan from uploaded file / photo
  const handleFileUploadScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanningFile(true);
    try {
      const tempScanner = new Html5Qrcode('temp-barcode-reader-helper', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
        ],
        verbose: false,
      });

      const decodedText = await tempScanner.scanFile(file, false);
      tempScanner.clear();
      handleBarcodeDetected(decodedText);
    } catch (err) {
      playBeep('error');
      showToast('Tidak ditemukan barcode yang terbaca pada foto ini.', 'error');
    } finally {
      setIsScanningFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Support USB / Bluetooth Handheld Barcode Scanner
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is typing in regular text inputs or textareas
      const activeElement = document.activeElement;
      const isInput =
        activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
      if (isInput && activeElement.id !== 'manual_barcode_input') {
        return;
      }

      const now = Date.now();
      if (now - keyBufferRef.current.lastKeyTime > 200) {
        keyBufferRef.current.buffer = '';
      }
      keyBufferRef.current.lastKeyTime = now;

      if (e.key === 'Enter') {
        if (keyBufferRef.current.buffer.length >= 3) {
          const scanned = keyBufferRef.current.buffer;
          keyBufferRef.current.buffer = '';
          handleBarcodeDetected(scanned);
        }
      } else if (e.key.length === 1) {
        keyBufferRef.current.buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [filteredStudents, students, activeDate, attendanceRecords]);

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            html5QrCodeRef.current.stop().then(() => html5QrCodeRef.current?.clear());
          }
        } catch (e) {
          // ignore cleanup errors
        }
      }
    };
  }, []);

  // Manual code submit
  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    const query = manualCode.trim().toLowerCase();
    const student =
      filteredStudents.find(
        (s) =>
          s.barcodeId.toLowerCase() === query ||
          s.nisn.toLowerCase() === query ||
          s.nama.toLowerCase().includes(query)
      ) ||
      students.find(
        (s) =>
          s.barcodeId.toLowerCase() === query ||
          s.nisn.toLowerCase() === query ||
          s.nama.toLowerCase().includes(query)
      );

    if (student) {
      recordAttendance(student, 'H');
      setManualCode('');
    } else {
      playBeep('error');
      showToast(`Siswa dengan kode/nama "${manualCode}" tidak ditemukan`, 'error');
    }
  };

  const handleStatusChange = (studentId: string, newStatus: 'H' | 'S' | 'I' | 'A') => {
    const student = students.find((s) => s.id === studentId);
    if (student) {
      recordAttendance(student, newStatus);
    }
  };

  const markAllPresent = () => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const updated = { ...attendanceRecords };

    filteredStudents.forEach((s) => {
      const key = `${activeDate}_${s.id}`;
      updated[key] = {
        id: key,
        studentId: s.id,
        date: activeDate,
        status: 'H',
        time: timeStr,
      };
    });

    onSaveAttendance(updated);
    showToast(`Seluruh ${filteredStudents.length} siswa berhasil ditandai Hadir hari ini!`, 'success');
  };

  return (
    <section className="space-y-6">
      {/* Hidden helper element for file scanning */}
      <div id="temp-barcode-reader-helper" className="hidden" />

      {/* Sub-menu Navigation Bar */}
      <div className="bg-white p-4 rounded-3xl shadow-xs border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-emerald-200">
            <QrCode className="w-5 h-5" />
          </span>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-wider">
              Sub-Menu 2.2 • Terhubung ke Kalender, e-Rapor & Cloud
            </span>
            <h3 className="font-display font-black text-sm sm:text-base text-slate-800">
              Scan Barcode & Presensi Harian ({activeClass})
            </h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab('kalender')}
            className="bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-800 border border-rose-200 font-display font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4" /> Buka Kalender Pendidikan
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('laporan-absensi')}
            className="bg-sky-600 hover:bg-sky-700 text-white font-display font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Clock className="w-4 h-4" /> Buka Laporan Kehadiran
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Scanner & Input Tools */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
                Pemindai Barcode Otomatis
              </span>
              <h2 className="text-xl font-display font-black text-slate-800 mt-1.5 flex items-center gap-2">
                Scan Kamera Siswa
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <LinkIcon className="w-3 h-3 text-emerald-600" /> Realtime Sync
            </span>
          </div>

          {/* Date Picker & Holiday Indicator */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-extrabold text-slate-800 block">
                <Calendar className="w-3.5 h-3.5 inline mr-1 text-rose-600" /> Tanggal Presensi:
              </span>
              <span className={`text-[11px] font-bold ${isHoliday ? 'text-rose-600' : 'text-emerald-700'}`}>
                {isHoliday
                  ? `Hari Libur: ${activeDayKaldik?.keterangan || 'Hari Minggu'}`
                  : 'Hari Efektif Belajar'}
              </span>
            </div>
            <input
              type="date"
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-rose-300 bg-white font-mono font-bold text-xs shadow-xs"
            />
          </div>

          {/* Camera Controls & Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-slate-100 p-2.5 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-slate-700">Kamera Scanner (CODE-128 & QR)</span>
              </div>
              <button
                type="button"
                onClick={toggleCamera}
                disabled={isInitializingCamera}
                className={`text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  cameraActive
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {isInitializingCamera ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memuat...</span>
                  </>
                ) : cameraActive ? (
                  <>
                    <VideoOff className="w-4 h-4" />
                    <span>Matikan Kamera</span>
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    <span>Aktifkan Kamera</span>
                  </>
                )}
              </button>
            </div>

            {/* Camera device selection dropdown if multiple cameras exist */}
            {availableCameras.length > 1 && (
              <div className="flex items-center gap-2 px-1 text-xs">
                <SwitchCamera className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[11px] font-bold text-slate-600">Pilih Kamera:</span>
                <select
                  value={selectedCameraId}
                  onChange={(e) => handleCameraChange(e.target.value)}
                  className="flex-1 text-[11px] py-1 px-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-700"
                >
                  {availableCameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Camera Viewport Container */}
          <div className="relative rounded-3xl overflow-hidden bg-slate-950 min-h-[250px] border-4 border-emerald-400 shadow-inner flex flex-col items-center justify-center text-white">
            {/* Html5Qrcode target DOM element */}
            <div
              id="html5qr-code-full-region"
              className={`w-full h-full min-h-[250px] ${cameraActive ? 'block' : 'hidden'}`}
            />

            {/* Laser scanning beam overlay when camera is running */}
            {cameraActive && (
              <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4">
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-emerald-400 tracking-wider bg-black/40 backdrop-blur-xs px-2.5 py-1 rounded-full w-fit">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1.5" />
                  Mencari Barcode Siswa...
                </div>
                <div className="laser-line" />
                <div className="text-center text-[11px] font-bold text-white/90 bg-black/50 backdrop-blur-xs py-1 px-3 rounded-xl mx-auto">
                  Arahkan garis barcode (CODE-128) ke kotak pemindai
                </div>
              </div>
            )}

            {/* Inactive Camera State with Instructions */}
            {!cameraActive && (
              <div className="relative z-10 text-center p-6 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-white/10 mx-auto flex items-center justify-center text-2xl text-emerald-400 border border-white/10 shadow-lg">
                  <QrCode className="w-7 h-7" />
                </div>
                <div>
                  <p className="font-display font-black text-sm text-white">
                    Pemindai Kamera Siap Digunakan
                  </p>
                  <p className="text-xs text-slate-300 max-w-xs mt-1">
                    Klik <strong>Aktifkan Kamera</strong> di atas untuk memindai kartu barcode siswa secara langsung.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isScanningFile}
                    className="bg-white/10 hover:bg-white/20 text-emerald-300 text-xs font-bold px-3 py-1.5 rounded-xl border border-white/20 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isScanningFile ? 'Menganalisis Foto...' : 'Unggah Foto Barcode'}</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileUploadScan}
                    className="hidden"
                  />
                </div>
              </div>
            )}
          </div>

          {/* NOTIFIKASI CEKLIS SUKSES SCAN BARCODE (Real-time Checklist Notification) */}
          {scannedSuccessItem && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xl border-2 border-emerald-300 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="relative">
                    <img
                      src={scannedSuccessItem.student.fotoUrl}
                      alt={scannedSuccessItem.student.nama}
                      onClick={() =>
                        onOpenZoom(
                          scannedSuccessItem.student.fotoUrl,
                          scannedSuccessItem.student.nama
                        )
                      }
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-md cursor-zoom-in"
                    />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white text-emerald-600 flex items-center justify-center shadow-md">
                      <CheckCircle2 className="w-5 h-5 fill-emerald-600 text-white" />
                    </div>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-white/20 text-emerald-100 tracking-wider">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Presensi Berhasil Tercatat
                    </span>
                    <h4 className="font-display font-black text-base text-white mt-0.5">
                      {scannedSuccessItem.student.nama}
                    </h4>
                    <div className="text-[11px] text-emerald-100 font-mono font-bold">
                      {scannedSuccessItem.student.barcodeId} • Kelas: {scannedSuccessItem.student.kelas} • NISN: {scannedSuccessItem.student.nisn}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScannedSuccessItem(null)}
                  className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition cursor-pointer"
                  title="Tutup Notifikasi"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 pt-2.5 border-t border-emerald-400/40 flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-200 animate-ping" />
                  Status: <strong>HADIR (H)</strong>
                </span>
                <span className="font-mono bg-emerald-900/60 px-3 py-1 rounded-xl text-emerald-100 border border-emerald-400/30">
                  Waktu: {scannedSuccessItem.time}
                </span>
              </div>
            </div>
          )}

          {/* Status Scan Terakhir Barcode */}
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <CheckCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase text-emerald-800">
                  Status Scan Terakhir
                </div>
                <div className="font-display font-black text-slate-800 truncate">
                  {lastScannedStudent}
                </div>
              </div>
            </div>
            <span className="font-mono font-bold text-xs bg-white px-2.5 py-1.5 rounded-xl border border-emerald-200 text-emerald-800 shrink-0">
              {lastScannedTime}
            </span>
          </div>

          {/* Manual Input (USB Scanner & Text Input) */}
          <form onSubmit={handleManualScan} className="flex gap-2">
            <input
              id="manual_barcode_input"
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Scan Barcode USB / Ketik ID, NISN, atau Nama Siswa..."
              className="flex-1 px-4 py-2.5 rounded-2xl border-2 border-slate-200 focus:border-emerald-600 outline-none text-xs font-mono font-bold"
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-5 py-2.5 rounded-2xl text-xs cursor-pointer shadow-xs"
            >
              Scan
            </button>
          </form>

          {/* Quick Simulation Buttons for Active Class */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase">
                Simulasi Klik Cepat Scan Siswa ({activeClass}):
              </span>
              <span className="text-[10px] text-slate-400">Total: {filteredStudents.length} siswa</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              {filteredStudents.map((s) => {
                const rec = attendanceRecords[`${activeDate}_${s.id}`];
                const isHadir = rec?.status === 'H';
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => recordAttendance(s, 'H')}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                      isHadir
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span>{isHadir ? '✓' : '+'}</span>
                    <span>{s.nama.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Daily Attendance Table */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-extrabold text-lg text-slate-800">
                Daftar Pendataan Kehadiran Siswa ({activeClass})
              </h3>
              <p className="text-xs text-slate-500">
                Tanggal: <strong>{activeDate}</strong> • Terhubung langsung dengan Kalender, e-Rapor & Cloud
              </p>
            </div>
            <button
              type="button"
              onClick={markAllPresent}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <CheckCheck className="w-4 h-4" /> Tandai Semua Hadir
            </button>
          </div>

          {/* Quick Dropdown Selector */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-700" />
              <label className="text-xs font-extrabold text-slate-700">Pilih Siswa (Dropdown):</label>
            </div>
            <select
              value={selectedStudentDropdown}
              onChange={(e) => {
                setSelectedStudentDropdown(e.target.value);
                const s = students.find((st) => st.id === e.target.value);
                if (s) {
                  recordAttendance(s, 'H');
                  setSelectedStudentDropdown('');
                }
              }}
              className="flex-1 max-w-md px-3.5 py-2 rounded-xl border-2 border-emerald-600 bg-white text-xs font-display font-extrabold text-slate-800 cursor-pointer outline-none"
            >
              <option value="">-- Pilih Nama Siswa untuk Hadir Otomatis --</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama} ({s.barcodeId})
                </option>
              ))}
            </select>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-xs uppercase font-extrabold">
                  <th className="p-3 rounded-l-xl">ID Barcode</th>
                  <th className="p-3">Foto & Nama Siswa</th>
                  <th className="p-3 text-center">Waktu Presensi</th>
                  <th className="p-3 text-center">Status Kehadiran</th>
                  <th className="p-3 rounded-r-xl text-center">Ubah Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                      Tidak ada peserta didik terdaftar pada rombel {activeClass}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s) => {
                    const rec = attendanceRecords[`${activeDate}_${s.id}`];
                    const status = rec ? rec.status : '-';
                    const time = rec ? rec.time : '--:--';
                    const isJustScanned = scannedSuccessItem?.student.id === s.id;

                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors ${
                          isJustScanned
                            ? 'bg-emerald-50 ring-2 ring-emerald-400'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-3 font-mono font-bold text-rose-700">{s.barcodeId}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={s.fotoUrl}
                              alt={s.nama}
                              onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                              className="w-8 h-8 rounded-lg object-cover border cursor-zoom-in shadow-xs"
                            />
                            <div>
                              <div className="font-bold text-slate-800">{s.nama}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                NISN: {s.nisn}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center font-mono text-xs font-bold text-slate-700">
                          {time}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                              status === 'H'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : status === 'S'
                                ? 'bg-sky-100 text-sky-800 border border-sky-300'
                                : status === 'I'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : status === 'A'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {status === 'H'
                              ? 'Hadir'
                              : status === 'S'
                              ? 'Sakit'
                              : status === 'I'
                              ? 'Izin'
                              : status === 'A'
                              ? 'Alfa'
                              : 'Belum Presensi'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs font-bold shadow-xs">
                            <button
                              type="button"
                              onClick={() => handleStatusChange(s.id, 'H')}
                              title="Tandai Hadir"
                              className={`px-2.5 py-1.5 transition ${
                                status === 'H'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              H
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(s.id, 'S')}
                              title="Tandai Sakit"
                              className={`px-2.5 py-1.5 border-l border-slate-200 transition ${
                                status === 'S'
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-white hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              S
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(s.id, 'I')}
                              title="Tandai Izin"
                              className={`px-2.5 py-1.5 border-l border-slate-200 transition ${
                                status === 'I'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-white hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              I
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(s.id, 'A')}
                              title="Tandai Alfa"
                              className={`px-2.5 py-1.5 border-l border-slate-200 transition ${
                                status === 'A'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-white hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              A
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
