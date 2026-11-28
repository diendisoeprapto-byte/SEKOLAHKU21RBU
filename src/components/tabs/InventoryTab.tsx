import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package,
  Plus,
  QrCode,
  FileSpreadsheet,
  Printer,
  Search,
  Trash2,
  Edit,
  CheckCircle2,
  Building,
  Upload,
  Download,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ArrowRightLeft,
  Camera,
  X,
  RefreshCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Html5Qrcode } from 'html5-qrcode';
import { ActiveUser, InventoryItem, SchoolProfile } from '../../types';
import {
  subscribeToInventoryItems,
  saveInventoryItemToFirestore,
  deleteInventoryItemFromFirestore,
  saveInventoryBatchToFirestore,
  subscribeToInventoryRooms,
  saveInventoryRoomsToFirestore,
} from '../../utils/inventoryFirestore';
import { isEndiSoepraptoUser } from '../../utils/sarahAttachments';
import { sanitizeInput } from '../../utils/sanitize';
import {
  DeviceCameraInfo,
  formatCameraErrorIndonesian,
  startHtml5QrScanner,
  stopHtml5QrScanner,
} from '../../utils/cameraScanner';

interface Props {
  activeUser: ActiveUser;
  profile: SchoolProfile;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

const DEFAULT_ROOMS = [
  'Kelas 1A',
  'Kelas 1B',
  'Kelas 2A',
  'Kelas 2B',
  'Kelas 3A',
  'Kelas 3B',
  'Kelas 4A',
  'Kelas 4B',
  'Kelas 5A',
  'Kelas 5B',
  'Kelas 6A',
  'Kelas 6B',
  'Ruang Guru',
  'Ruang Kepala Sekolah',
  'Ruang TU',
  'Perpustakaan',
  'UKS',
  'Gudang',
];

const QrCodeCanvasImage: React.FC<{
  value: string;
  size?: number;
  className?: string;
  alt?: string;
}> = ({ value, size = 144, className = '', alt = 'QR Code' }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value || 'SERBU21', {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className={`bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 ${className}`}
        style={{ width: size, height: size }}
      >
        <QrCode className="w-8 h-8" />
      </div>
    );
  }

  return <img src={dataUrl} alt={alt} width={size} height={size} className={className} />;
};

function normalizeCurrency(raw: any): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const str = String(raw || '').trim();
  if (!str) return 0;
  // Remove trailing decimal cents like ,00 or .00
  const noCents = str.replace(/[.,]\d{2}$/, '');
  const digits = noCents.replace(/[^0-9]/g, '');
  return Number(digits) || 0;
}

function normalizeCondition(
  raw: any,
  isNegeri: boolean
): InventoryItem['keadaanBarang'] {
  const clean = String(raw || '').trim().toLowerCase();
  if (clean === 'rb' || clean.includes('rusak berat') || clean.includes('berat')) {
    return isNegeri ? 'Rusak Berat (RB)' : 'Rusak Berat';
  }
  if (
    clean === 'kb' ||
    clean.includes('kurang') ||
    clean.includes('ringan') ||
    clean.includes('sedang')
  ) {
    return isNegeri ? 'Kurang Baik (KB)' : 'Kurang Baik / Rusak Ringan';
  }
  return isNegeri ? 'Baik (B)' : 'Baik';
}

interface ParsedPreviewRow {
  rowNum: number;
  valid: boolean;
  errorReason?: string;
  item?: InventoryItem;
}

export const InventoryTab: React.FC<Props> = ({
  activeUser,
  profile,
  showToast,
  onOpenZoom,
}) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState('all');
  const [selectedConditionFilter, setSelectedConditionFilter] = useState('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [previewRows, setPreviewRows] = useState<ParsedPreviewRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrTargetItem, setQrTargetItem] = useState<InventoryItem | null>(null);

  // Camera Scanner Modal State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [cameras, setCameras] = useState<DeviceCameraInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState('');
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null);
  const [manualQrInput, setManualQrInput] = useState('');
  const [mutasiTargetRoom, setMutasiTargetRoom] = useState('');
  const [isUpdatingScanned, setIsUpdatingScanned] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // KIR Print / PDF Modal State
  const [isKirModalOpen, setIsKirModalOpen] = useState(false);
  const [kirRoom, setKirRoom] = useState('Kelas 6A');

  // Edit Jumlah & Daftar Ruangan Modal State
  const ROOMS_CACHE_KEY = `serbu21_inv_rooms_${String(profile.npsn || 'default').trim()}`;
  const [configuredRooms, setConfiguredRooms] = useState<string[]>(() => {
    if (Array.isArray(profile.inventoryRooms) && profile.inventoryRooms.length > 0) {
      return profile.inventoryRooms;
    }
    try {
      const cached = localStorage.getItem(ROOMS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_ROOMS;
  });
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [draftRooms, setDraftRooms] = useState<{ original: string; name: string }[]>([]);
  const [targetRoomCountInput, setTargetRoomCountInput] = useState<number>(DEFAULT_ROOMS.length);
  const [rombelPerGrade, setRombelPerGrade] = useState<number>(2);
  const [includeSupportRooms, setIncludeSupportRooms] = useState<boolean>(true);
  const [newRoomNameInput, setNewRoomNameInput] = useState<string>('');
  const [isSavingRooms, setIsSavingRooms] = useState<boolean>(false);

  const isNegeri = (profile.schoolStatus || 'negeri') === 'negeri';
  const detailLower = (activeUser.detail || '').toLowerCase();
  const canManage =
    activeUser.role === 'admin' ||
    isEndiSoepraptoUser(activeUser) ||
    detailLower.includes('bendahara') ||
    detailLower.includes('sarpras') ||
    detailLower.includes('pengurus') ||
    detailLower.includes('tata usaha');

  useEffect(() => {
    const unsub = subscribeToInventoryItems(profile.npsn, setItems);
    return () => unsub();
  }, [profile.npsn]);

  useEffect(() => {
    const unsub = subscribeToInventoryRooms(profile.npsn, (cloudRooms) => {
      if (cloudRooms && cloudRooms.length > 0) {
        setConfiguredRooms(cloudRooms);
        try {
          localStorage.setItem(ROOMS_CACHE_KEY, JSON.stringify(cloudRooms));
        } catch {
          // ignore
        }
      }
    });
    return () => unsub();
  }, [profile.npsn, ROOMS_CACHE_KEY]);

  // Keep scannedItem synced if items list updates live
  useEffect(() => {
    if (scannedItem) {
      const fresh = items.find((i) => i.id === scannedItem.id);
      if (fresh) setScannedItem(fresh);
    }
  }, [items, scannedItem]);

  const itemCountByRoom = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((it) => {
      const r = (it.lokasiRuangan || '').trim();
      if (r) map[r] = (map[r] || 0) + 1;
    });
    return map;
  }, [items]);

  const roomsList = useMemo(() => {
    const set = new Set<string>(configuredRooms.length > 0 ? configuredRooms : DEFAULT_ROOMS);
    items.forEach((it) => {
      if (it.lokasiRuangan) set.add(it.lokasiRuangan.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  }, [configuredRooms, items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const matchRoom = selectedRoomFilter === 'all' || it.lokasiRuangan === selectedRoomFilter;
      const matchCond = selectedConditionFilter === 'all' || it.keadaanBarang === selectedConditionFilter;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        (it.namaBarang || '').toLowerCase().includes(q) ||
        (it.kodeBarang || '').toLowerCase().includes(q) ||
        (it.nibar || '').toLowerCase().includes(q) ||
        (it.kodeYayasan || '').toLowerCase().includes(q) ||
        (it.merkTipe || '').toLowerCase().includes(q) ||
        (it.lokasiRuangan || '').toLowerCase().includes(q);
      return matchRoom && matchCond && matchSearch;
    });
  }, [items, selectedRoomFilter, selectedConditionFilter, searchQuery]);

  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    kodeBarang: '1.3.2.10.01.02.001',
    nibar: '00001',
    nomorRegister: '0001',
    kodeYayasan: 'YYS-INV-001',
    namaBarang: '',
    merkTipe: '',
    ukuranBahan: '',
    tahunPerolehan: String(new Date().getFullYear()),
    sumberDana: 'BOS Reguler',
    hargaPerolehan: 0,
    lokasiRuangan: 'Kelas 6A',
    keadaanBarang: 'Baik (B)',
  });

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      kodeBarang: isNegeri ? '1.3.2.10.01.02.001' : '',
      nibar: isNegeri ? String(items.length + 1).padStart(5, '0') : '',
      nomorRegister: String(items.length + 1).padStart(4, '0'),
      kodeYayasan: isNegeri ? '' : `YYS-INV-${String(items.length + 1).padStart(3, '0')}`,
      namaBarang: '',
      merkTipe: '',
      ukuranBahan: '',
      tahunPerolehan: String(new Date().getFullYear()),
      sumberDana: isNegeri ? 'BOS Reguler' : 'Yayasan',
      hargaPerolehan: 0,
      lokasiRuangan: selectedRoomFilter !== 'all' ? selectedRoomFilter : 'Kelas 6A',
      keadaanBarang: isNegeri ? 'Baik (B)' : 'Baik',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (it: InventoryItem) => {
    setEditingItem(it);
    setFormData(it);
    setIsModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.namaBarang?.trim()) {
      showToast('Nama barang wajib diisi.', 'error');
      return;
    }

    const payload: InventoryItem = {
      id: editingItem?.id || `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      npsn: profile.npsn,
      kodeBarang: sanitizeInput(formData.kodeBarang || (isNegeri ? '1.3.2.10.01.02.001' : '-'), 60),
      nibar: sanitizeInput(formData.nibar || (isNegeri ? '00001' : '-'), 40),
      nomorRegister: sanitizeInput(formData.nomorRegister || '0001', 30),
      kodeYayasan: sanitizeInput(formData.kodeYayasan || '', 60),
      namaBarang: sanitizeInput(formData.namaBarang || '', 150),
      merkTipe: sanitizeInput(formData.merkTipe || '-', 100),
      ukuranBahan: sanitizeInput(formData.ukuranBahan || '-', 100),
      tahunPerolehan: sanitizeInput(formData.tahunPerolehan || String(new Date().getFullYear()), 10),
      sumberDana: sanitizeInput(formData.sumberDana || (isNegeri ? 'BOS Reguler' : 'Yayasan'), 60),
      hargaPerolehan: Number(formData.hargaPerolehan) || 0,
      lokasiRuangan: sanitizeInput(formData.lokasiRuangan || 'Kelas 6A', 80),
      keadaanBarang: (formData.keadaanBarang as InventoryItem['keadaanBarang']) || (isNegeri ? 'Baik (B)' : 'Baik'),
      schoolType: isNegeri ? 'negeri' : 'swasta',
      createdAt: editingItem?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedBy: activeUser.name,
    };

    try {
      await saveInventoryItemToFirestore(payload, profile.npsn);
      showToast(
        editingItem ? 'Data inventaris berhasil diperbarui.' : 'Barang inventaris baru berhasil ditambahkan.',
        'success'
      );
      setIsModalOpen(false);
    } catch (err: any) {
      showToast('Gagal menyimpan inventaris: ' + (err?.message || err), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInventoryItemFromFirestore(id, profile.npsn);
      showToast('Data barang berhasil dihapus.', 'success');
    } catch (err: any) {
      showToast('Gagal menghapus: ' + (err?.message || err), 'error');
    }
  };

  // ==================== CAMERA QR SCANNER ====================
  const resolveScannedInventoryItem = (rawCode: string): InventoryItem | null => {
    const clean = (rawCode || '').trim();
    if (!clean) return null;

    if (clean.startsWith('SERBU21_INV:')) {
      const parts = clean.split(':');
      const targetId = parts[2] || parts[1];
      const byId = items.find((i) => i.id === targetId);
      if (byId) return byId;
    }

    return (
      items.find(
        (i) =>
          i.id === clean ||
          (i.nibar && i.nibar.toLowerCase() === clean.toLowerCase()) ||
          (i.kodeYayasan && i.kodeYayasan.toLowerCase() === clean.toLowerCase()) ||
          (i.kodeBarang && i.kodeBarang.toLowerCase() === clean.toLowerCase() && clean.length > 5)
      ) || null
    );
  };

  const startScannerCamera = async (preferredCamId?: string) => {
    setScannerError('');
    try {
      const res = await startHtml5QrScanner({
        elementId: 'inventory-qr-scanner-box',
        preferredCameraId: preferredCamId || activeCameraId || undefined,
        existingScanner: scannerRef.current,
        onSuccess: (decodedText) => {
          const found = resolveScannedInventoryItem(decodedText);
          if (found) {
            setScannedItem(found);
            setMutasiTargetRoom(found.lokasiRuangan);
            showToast(`Barang ditemukan: ${found.namaBarang}`, 'success');
          } else {
            showToast(`QR terbaca (${decodedText}), tetapi barang tidak ditemukan di database sekolah ini.`, 'error');
          }
        },
      });
      scannerRef.current = res.scanner;
      setCameras(res.cameras);
      setActiveCameraId(res.activeCameraId);
    } catch (err) {
      setScannerError(formatCameraErrorIndonesian(err));
    }
  };

  useEffect(() => {
    if (!isScannerOpen) {
      void stopHtml5QrScanner(scannerRef.current);
      scannerRef.current = null;
      return;
    }
    const timer = setTimeout(() => {
      void startScannerCamera();
    }, 150);
    return () => {
      clearTimeout(timer);
      void stopHtml5QrScanner(scannerRef.current);
      scannerRef.current = null;
    };
  }, [isScannerOpen]);

  const handleQuickUpdateCondition = async (
    item: InventoryItem,
    newCondition: InventoryItem['keadaanBarang']
  ) => {
    setIsUpdatingScanned(true);
    try {
      const updated: InventoryItem = {
        ...item,
        keadaanBarang: newCondition,
        updatedAt: new Date().toISOString(),
        importedBy: activeUser.name,
      };
      await saveInventoryItemToFirestore(updated, profile.npsn);
      setScannedItem(updated);
      showToast(`Kondisi "${item.namaBarang}" diubah menjadi ${newCondition}.`, 'success');
    } catch (err: any) {
      showToast('Gagal memperbarui kondisi: ' + (err?.message || err), 'error');
    } finally {
      setIsUpdatingScanned(false);
    }
  };

  const handleQuickMutasiRoom = async () => {
    if (!scannedItem || !mutasiTargetRoom.trim()) return;
    setIsUpdatingScanned(true);
    try {
      const updated: InventoryItem = {
        ...scannedItem,
        lokasiRuangan: mutasiTargetRoom.trim(),
        updatedAt: new Date().toISOString(),
        importedBy: activeUser.name,
      };
      await saveInventoryItemToFirestore(updated, profile.npsn);
      setScannedItem(updated);
      showToast(
        `"${scannedItem.namaBarang}" berhasil dimutasi ke ruangan ${mutasiTargetRoom}.`,
        'success'
      );
    } catch (err: any) {
      showToast('Gagal memutasi ruangan: ' + (err?.message || err), 'error');
    } finally {
      setIsUpdatingScanned(false);
    }
  };

  // ==================== BULK IMPORT EXCEL / CSV ====================
  const handleDownloadTemplate = () => {
    const headers = isNegeri
      ? 'Kode_Barang;NIBAR;Nomor_Register;Nama_Barang;Merk_Tipe;Ukuran_Bahan;Tahun_Perolehan;Sumber_Dana;Harga_Perolehan;Lokasi_Ruangan;Keadaan_Barang\n' +
        '1.3.2.10.01.02.001;00001;0001;Laptop ASUS ExpertBook;ASUS P1412;Plastik / Besi;2025;BOS Reguler;11500000;Ruang Guru;Baik (B)\n' +
        '1.3.2.10.02.01.001;00002;0002;Proyektor Epson EB-E01;Epson Putih;Plastik;2024;BOS Reguler;5800000;Kelas 6A;Baik (B)'
      : 'Kode_Inventaris_Yayasan;Nomor_Register;Nama_Barang;Merk_Spesifikasi;Tahun_Perolehan;Sumber_Dana;Nilai_Aset;Lokasi_Ruangan;Kondisi\n' +
        'YYS-INV-001;0001;Lemari Arsip Kayu Jati;Jati Ukir 2 Pintu;2023;Yayasan;3500000;Ruang Guru;Baik\n' +
        'YYS-INV-002;0002;AC Split Daikin 1PK;Daikin FTC25;2024;Komite;4200000;Kelas 5A;Baik';

    const blob = new Blob(['\uFEFF' + headers], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isNegeri
      ? 'Template_Inventaris_BMD_Negeri.csv'
      : 'Template_Inventaris_Yayasan_Swasta.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Template CSV berhasil diunduh.', 'success');
  };

  const mapMatrixToPreviewRows = (matrix: any[][]) => {
    if (!matrix || matrix.length < 2) {
      setPreviewRows([]);
      return;
    }

    // Detect header row in first 5 rows
    let headerIdx = 0;
    for (let r = 0; r < Math.min(matrix.length, 5); r++) {
      const joined = (matrix[r] || []).map((c) => String(c || '').toLowerCase()).join(' ');
      if (joined.includes('nama') || joined.includes('kode') || joined.includes('barang')) {
        headerIdx = r;
        break;
      }
    }

    const headers = (matrix[headerIdx] || []).map((h) => String(h || '').trim().toLowerCase());
    const findCol = (keywords: string[], fallbackIdx: number) => {
      const idx = headers.findIndex((h) => keywords.some((k) => h.includes(k)));
      return idx >= 0 ? idx : fallbackIdx;
    };

    const idxKode = isNegeri
      ? findCol(['kode_barang', 'kode barang', 'kode'], 0)
      : findCol(['kode_inventaris', 'kode yayasan', 'kode'], 0);
    const idxNibar = isNegeri ? findCol(['nibar', 'identitas barang'], 1) : -1;
    const idxReg = findCol(['register', 'no_reg', 'no reg'], isNegeri ? 2 : 1);
    const idxNama = findCol(['nama_barang', 'nama barang', 'nama / jenis', 'nama'], isNegeri ? 3 : 2);
    const idxMerk = findCol(['merk', 'tipe', 'spesifikasi'], isNegeri ? 4 : 3);
    const idxUkuran = isNegeri ? findCol(['ukuran', 'bahan'], 5) : -1;
    const idxTahun = findCol(['tahun'], isNegeri ? 6 : 4);
    const idxSumber = findCol(['sumber', 'asal'], isNegeri ? 7 : 5);
    const idxHarga = findCol(['harga', 'nilai'], isNegeri ? 8 : 6);
    const idxLokasi = findCol(['lokasi', 'ruangan', 'ruang'], isNegeri ? 9 : 7);
    const idxKondisi = findCol(['keadaan', 'kondisi'], isNegeri ? 10 : 8);

    const parsed: ParsedPreviewRow[] = [];
    const baseCount = items.length;

    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const cols = matrix[r] || [];
      const nonEmpty = cols.some((c) => String(c ?? '').trim() !== '');
      if (!nonEmpty) continue;

      const namaRaw = String(cols[idxNama] ?? '').trim();
      const seqNum = baseCount + parsed.length + 1;
      const autoReg = String(seqNum).padStart(4, '0');
      const autoNibar = String(seqNum).padStart(5, '0');

      if (!namaRaw) {
        parsed.push({
          rowNum: r + 1,
          valid: false,
          errorReason: 'Nama barang kosong',
        });
        continue;
      }

      const hargaNum = normalizeCurrency(cols[idxHarga]);
      const lokasiClean = sanitizeInput(String(cols[idxLokasi] ?? '').trim() || 'Ruang Guru', 80);
      const condNorm = normalizeCondition(cols[idxKondisi], isNegeri);
      const regVal = sanitizeInput(String(cols[idxReg] ?? '').trim() || autoReg, 30);

      const item: InventoryItem = {
        id: `inv_imp_${Date.now()}_${r}_${Math.random().toString(36).slice(2, 5)}`,
        npsn: profile.npsn,
        kodeBarang: isNegeri
          ? sanitizeInput(String(cols[idxKode] ?? '').trim() || '1.3.2.10.01.02.001', 60)
          : '-',
        nibar: isNegeri
          ? sanitizeInput((idxNibar >= 0 ? String(cols[idxNibar] ?? '').trim() : '') || autoNibar, 40)
          : '-',
        nomorRegister: regVal,
        kodeYayasan: isNegeri
          ? undefined
          : sanitizeInput(String(cols[idxKode] ?? '').trim() || `YYS-INV-${autoReg}`, 60),
        namaBarang: sanitizeInput(namaRaw, 150),
        merkTipe: sanitizeInput(String(cols[idxMerk] ?? '').trim() || '-', 100),
        ukuranBahan:
          idxUkuran >= 0
            ? sanitizeInput(String(cols[idxUkuran] ?? '').trim() || '-', 100)
            : '-',
        tahunPerolehan: sanitizeInput(
          String(cols[idxTahun] ?? '').trim() || String(new Date().getFullYear()),
          10
        ),
        sumberDana: sanitizeInput(
          String(cols[idxSumber] ?? '').trim() || (isNegeri ? 'BOS Reguler' : 'Yayasan'),
          60
        ),
        hargaPerolehan: hargaNum,
        lokasiRuangan: lokasiClean,
        keadaanBarang: condNorm,
        schoolType: isNegeri ? 'negeri' : 'swasta',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        importedBy: activeUser.name,
      };

      parsed.push({
        rowNum: r + 1,
        valid: true,
        item,
      });
    }

    setPreviewRows(parsed);
  };

  const handleParseCsvText = (text: string) => {
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      setPreviewRows([]);
      return;
    }
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const matrix = lines.map((line) =>
      line.split(delimiter).map((p) => p.replace(/^["']|["']$/g, '').trim())
    );
    mapMatrixToPreviewRows(matrix);
  };

  const handleImportFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
          setImportCsvText(`[File Excel dimuat: ${file.name} (${matrix.length} baris)]`);
          mapMatrixToPreviewRows(matrix);
        } catch (err: any) {
          showToast('Gagal membaca file Excel: ' + (err?.message || err), 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = String(evt.target?.result || '');
        setImportCsvText(content);
        handleParseCsvText(content);
      };
      reader.readAsText(file, 'utf-8');
    }
  };

  const validPreviewItems = useMemo(
    () => previewRows.filter((r) => r.valid && r.item).map((r) => r.item as InventoryItem),
    [previewRows]
  );

  const handleProcessBatchImport = async () => {
    if (validPreviewItems.length === 0) {
      showToast('Tidak ada data barang valid untuk diimpor.', 'error');
      return;
    }
    setIsImporting(true);
    try {
      await saveInventoryBatchToFirestore(validPreviewItems, profile.npsn);
      showToast(`Berhasil mengimpor ${validPreviewItems.length} data inventaris barang!`, 'success');
      setIsImportModalOpen(false);
      setPreviewRows([]);
      setImportCsvText('');
    } catch (err: any) {
      showToast('Gagal impor batch: ' + (err?.message || err), 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // ==================== KIR STATS & PDF EXPORT ====================
  const kirRoomItems = useMemo(
    () => items.filter((it) => it.lokasiRuangan === kirRoom),
    [items, kirRoom]
  );
  const kirRoomTotalValue = useMemo(
    () => kirRoomItems.reduce((acc, cur) => acc + (Number(cur.hargaPerolehan) || 0), 0),
    [kirRoomItems]
  );

  const handleDownloadKirPdf = async () => {
    try {
      const docPdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const kepsekName = profile.kepalaSekolah?.nama || 'Darti Isyanti, M.Pd';
      const kepsekNip = profile.kepalaSekolah?.nip || '197710102017082001';

      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(14);
      docPdf.text('KARTU INVENTARIS RUANGAN (KIR)', 148.5, 16, { align: 'center' });
      docPdf.setFontSize(11);
      docPdf.text((profile.name || 'SDN Rawa Badak Utara 21').toUpperCase(), 148.5, 22, {
        align: 'center',
      });
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(9);
      docPdf.text(
        `NPSN: ${profile.npsn}  |  Ruangan: ${kirRoom}  |  Standar: ${
          isNegeri ? 'Permendagri No. 47 Tahun 2021 (BMD)' : 'Inventaris Yayasan'
        }  |  Tahun: ${profile.activeAcademicYear || '2026/2027'}`,
        148.5,
        28,
        { align: 'center' }
      );

      const headRow = isNegeri
        ? [['No', 'Kode Barang', 'NIBAR / Reg', 'Nama & Spesifikasi Barang', 'Tahun', 'Sumber Dana', 'Harga (Rp)', 'Kondisi']]
        : [['No', 'Kode Yayasan', 'No. Reg', 'Nama & Spesifikasi Barang', 'Tahun', 'Sumber Dana', 'Nilai Aset (Rp)', 'Kondisi']];

      const bodyRows = kirRoomItems.map((it, idx) => [
        String(idx + 1),
        isNegeri ? it.kodeBarang || '-' : it.kodeYayasan || '-',
        isNegeri ? `${it.nibar || '-'} / ${it.nomorRegister || '-'}` : it.nomorRegister || '-',
        `${it.namaBarang} (${it.merkTipe || '-'})`,
        it.tahunPerolehan || '-',
        it.sumberDana || '-',
        `Rp ${(Number(it.hargaPerolehan) || 0).toLocaleString('id-ID')}`,
        it.keadaanBarang || '-',
      ]);

      autoTable(docPdf, {
        startY: 33,
        head: headRow,
        body:
          bodyRows.length > 0
            ? bodyRows
            : [['-', '-', '-', `Belum ada barang di ruangan ${kirRoom}`, '-', '-', 'Rp 0', '-']],
        foot: [
          [
            '',
            '',
            '',
            `TOTAL REKAPITULASI (${kirRoomItems.length} Unit Barang)`,
            '',
            '',
            `Rp ${kirRoomTotalValue.toLocaleString('id-ID')}`,
            '',
          ],
        ],
        styles: { fontSize: 8, cellPadding: 2.2 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        theme: 'grid',
      });

      const finalY = ((docPdf as any).lastAutoTable?.finalY || 120) + 10;
      const signY = finalY > 155 ? 160 : finalY;

      docPdf.setFontSize(9);
      docPdf.text('Mengetahui,', 48, signY, { align: 'center' });
      docPdf.text('Kepala Sekolah', 48, signY + 5, { align: 'center' });
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(kepsekName, 48, signY + 24, { align: 'center' });
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(`NIP. ${kepsekNip}`, 48, signY + 29, { align: 'center' });

      // QR Validation in center
      try {
        const qrPayload = `SERBU21_KIR|NPSN:${profile.npsn}|RUANG:${kirRoom}|UNIT:${kirRoomItems.length}|TOTAL:${kirRoomTotalValue}`;
        const qrImg = await QRCode.toDataURL(qrPayload, { width: 120, margin: 1 });
        docPdf.addImage(qrImg, 'PNG', 137, signY + 2, 23, 23);
        docPdf.setFontSize(7);
        docPdf.text('QR Validasi KIR Digital', 148.5, signY + 28, { align: 'center' });
      } catch {
        // ignore QR embed error
      }

      const dateText = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      docPdf.setFontSize(9);
      docPdf.text(`Jakarta, ${dateText}`, 245, signY, { align: 'center' });
      docPdf.text('Pengurus / Bendahara Barang', 245, signY + 5, { align: 'center' });
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Endi Soeprapto, S.Pd., Gr.', 245, signY + 24, { align: 'center' });
      docPdf.setFont('helvetica', 'normal');
      docPdf.text('NIP. 198501012010011001', 245, signY + 29, { align: 'center' });

      const safeRoom = kirRoom.replace(/[^a-zA-Z0-9_-]/g, '_');
      docPdf.save(`KIR_${profile.npsn}_${safeRoom}.pdf`);
      showToast(`File PDF KIR (${kirRoom}) berhasil diunduh!`, 'success');
    } catch (err: any) {
      showToast('Gagal membuat PDF KIR: ' + (err?.message || err), 'error');
    }
  };

  const totalItemCount = items.length;
  const totalAssetValue = useMemo(
    () => items.reduce((acc, cur) => acc + (Number(cur.hargaPerolehan) || 0), 0),
    [items]
  );

  const handleOpenKir = (room?: string) => {
    const target = room && room !== 'all' ? room : roomsList[0] || 'Kelas 6A';
    setKirRoom(target);
    setIsKirModalOpen(true);
  };

  const handleOpenRoomEditor = () => {
    const baseRooms = roomsList.length > 0 ? roomsList : DEFAULT_ROOMS;
    setDraftRooms(baseRooms.map((r) => ({ original: r, name: r })));
    setTargetRoomCountInput(baseRooms.length);
    setNewRoomNameInput('');
    setIsRoomModalOpen(true);
  };

  const handleApplyTargetRoomCount = () => {
    const target = Math.max(1, Math.min(100, Math.round(Number(targetRoomCountInput) || 1)));
    setDraftRooms((prev) => {
      if (target === prev.length) return prev;
      if (target > prev.length) {
        const next = [...prev];
        const existingNames = new Set(next.map((r) => r.name.trim().toLowerCase()));
        let counter = next.length + 1;
        while (next.length < target) {
          const candidate = `Ruang ${counter}`;
          if (!existingNames.has(candidate.toLowerCase())) {
            next.push({ original: '', name: candidate });
            existingNames.add(candidate.toLowerCase());
          }
          counter++;
        }
        return next;
      }
      // Shrink from end, skipping rooms that still hold assets
      const next = [...prev];
      let idx = next.length - 1;
      while (next.length > target && idx >= 0) {
        const curName = (next[idx].original || next[idx].name).trim();
        if ((itemCountByRoom[curName] || 0) === 0) {
          next.splice(idx, 1);
        }
        idx--;
      }
      if (next.length > target) {
        showToast(
          `Sebagian ruangan tidak dapat dikurangi karena masih berisi barang aset (${next.length} ruangan dipertahankan).`,
          'error'
        );
      }
      return next;
    });
  };

  const handleGenerateGradeRoomsFormat = () => {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const countPerGrade = Math.max(1, Math.min(6, rombelPerGrade));
    const generated: string[] = [];
    for (let grade = 1; grade <= 6; grade++) {
      for (let i = 0; i < countPerGrade; i++) {
        generated.push(countPerGrade === 1 ? `Kelas ${grade}` : `Kelas ${grade}${letters[i]}`);
      }
    }
    if (includeSupportRooms) {
      generated.push(
        'Ruang Guru',
        'Ruang Kepala Sekolah',
        'Ruang TU',
        'Perpustakaan',
        'UKS',
        'Lab Komputer',
        'Mushola',
        'Gudang'
      );
    }
    // Pertahankan ruangan lama yang masih memiliki barang aset agar tidak hilang
    const generatedSet = new Set(generated.map((r) => r.toLowerCase()));
    Object.keys(itemCountByRoom).forEach((existingRoom) => {
      if (itemCountByRoom[existingRoom] > 0 && !generatedSet.has(existingRoom.toLowerCase())) {
        generated.push(existingRoom);
        generatedSet.add(existingRoom.toLowerCase());
      }
    });
    setDraftRooms(generated.map((r) => ({ original: r, name: r })));
    setTargetRoomCountInput(generated.length);
    showToast(`Format ${generated.length} ruangan berhasil dibuat! Klik Simpan untuk menerapkan.`, 'success');
  };

  const handleAddDraftRoom = () => {
    const clean = sanitizeInput(newRoomNameInput, 80).trim();
    if (!clean) return;
    if (draftRooms.some((r) => r.name.trim().toLowerCase() === clean.toLowerCase())) {
      showToast(`Ruangan "${clean}" sudah ada di daftar.`, 'error');
      return;
    }
    const next = [...draftRooms, { original: '', name: clean }];
    setDraftRooms(next);
    setTargetRoomCountInput(next.length);
    setNewRoomNameInput('');
  };

  const handleSaveRoomsConfig = async () => {
    const cleanedEntries = draftRooms
      .map((r) => ({ original: r.original.trim(), name: sanitizeInput(r.name, 80).trim() }))
      .filter((r) => r.name.length > 0);

    const uniqueNames: string[] = [];
    const seen = new Set<string>();
    const renameMap: Record<string, string> = {};

    cleanedEntries.forEach((entry) => {
      const lower = entry.name.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        uniqueNames.push(entry.name);
      }
      if (entry.original && entry.original !== entry.name) {
        renameMap[entry.original] = entry.name;
      }
    });

    if (uniqueNames.length === 0) {
      showToast('Minimal harus ada 1 ruangan terdaftar.', 'error');
      return;
    }

    setIsSavingRooms(true);
    try {
      await saveInventoryRoomsToFirestore(uniqueNames, profile.npsn);

      // Update lokasiRuangan barang yang ruangannya diganti nama
      const affectedItems = items
        .filter((it) => renameMap[it.lokasiRuangan])
        .map((it) => ({ ...it, lokasiRuangan: renameMap[it.lokasiRuangan] }));
      if (affectedItems.length > 0) {
        await saveInventoryBatchToFirestore(affectedItems, profile.npsn);
      }

      setConfiguredRooms(uniqueNames);
      try {
        localStorage.setItem(ROOMS_CACHE_KEY, JSON.stringify(uniqueNames));
      } catch {
        // ignore
      }
      if (selectedRoomFilter !== 'all' && renameMap[selectedRoomFilter]) {
        setSelectedRoomFilter(renameMap[selectedRoomFilter]);
      }
      setIsRoomModalOpen(false);
      showToast(
        `Daftar & jumlah ruangan (${uniqueNames.length} ruangan) berhasil diperbarui!`,
        'success'
      );
    } catch (err: any) {
      showToast('Gagal menyimpan daftar ruangan: ' + (err?.message || err), 'error');
    } finally {
      setIsSavingRooms(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Header Banner */}
      <div className="no-print bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 p-6 sm:p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-rose-600/30 border border-rose-400/40 px-3.5 py-1 rounded-full text-xs font-extrabold text-rose-200">
              <Package className="w-4 h-4 text-rose-400" />
              <span>Modul Inventaris &amp; Sarpras Digital ber-QR Code</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-black">
              Pusat Aset &amp; Inventaris Sarpras ({isNegeri ? 'Negeri - Permendagri 47/2021' : 'Swasta - Kebijakan Yayasan'})
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl">
              Kelola pencatatan barang inventaris, cetak stiker label QR Code, pindai aset via kamera HP, dan cetak Kartu Inventaris Ruangan (KIR) resmi secara real-time.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setScannedItem(null);
                setManualQrInput('');
                setIsScannerOpen(true);
              }}
              className="px-4 py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-sky-600/25"
            >
              <Camera className="w-4 h-4" />
              <span>Scan QR via Kamera HP</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenKir(selectedRoomFilter)}
              className="px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-600/25"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak PDF KIR</span>
            </button>

            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setImportCsvText('');
                    setPreviewRows([]);
                    setIsImportModalOpen(true);
                  }}
                  className="px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md"
                >
                  <Upload className="w-4 h-4 text-amber-300" />
                  <span>Impor Data Aset (Excel/CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-rose-600/30"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Barang Baru</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="no-print grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100 shadow-xs">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Barang Aset</span>
            <h3 className="text-xl font-display font-black text-slate-900 mt-0.5">{totalItemCount} Unit</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100 shadow-xs">
              <Building className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Total Ruangan Terdata
              </span>
              <h3 className="text-xl font-display font-black text-slate-900 mt-0.5">
                {roomsList.length} Ruangan
              </h3>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={handleOpenRoomEditor}
              className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-display font-extrabold text-[11px] flex items-center gap-1.5 transition cursor-pointer shrink-0"
              title="Edit jumlah dan daftar ruangan sekolah"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Edit Ruangan</span>
            </button>
          )}
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 shadow-xs">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Nilai Perolehan Aset</span>
            <h3 className="text-lg sm:text-xl font-display font-black text-emerald-700 mt-0.5">
              Rp {totalAssetValue.toLocaleString('id-ID')}
            </h3>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="no-print bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama barang, merk, kode barang, atau NIBAR..."
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-rose-500 bg-slate-50/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={selectedRoomFilter}
            onChange={(e) => setSelectedRoomFilter(e.target.value)}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50/50 outline-none focus:border-rose-500 cursor-pointer"
          >
            <option value="all">Semua Ruangan ({roomsList.length})</option>
            {roomsList.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <select
            value={selectedConditionFilter}
            onChange={(e) => setSelectedConditionFilter(e.target.value)}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50/50 outline-none focus:border-rose-500 cursor-pointer"
          >
            <option value="all">Semua Kondisi</option>
            <option value="Baik (B)">Baik (B)</option>
            <option value="Kurang Baik (KB)">Kurang Baik (KB)</option>
            <option value="Rusak Berat (RB)">Rusak Berat (RB)</option>
            <option value="Baik">Baik</option>
            <option value="Kurang Baik / Rusak Ringan">Kurang Baik / Rusak Ringan</option>
            <option value="Rusak Berat">Rusak Berat</option>
          </select>

          <button
            type="button"
            onClick={() => handleOpenKir(selectedRoomFilter)}
            className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>KIR {selectedRoomFilter !== 'all' ? `(${selectedRoomFilter})` : 'Ruangan'}</span>
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="no-print bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-600 tracking-wider">
                <th className="p-4">No</th>
                <th className="p-4">{isNegeri ? 'Kode Barang / NIBAR' : 'Kode Yayasan'}</th>
                <th className="p-4">Nama Barang &amp; Spesifikasi</th>
                <th className="p-4">Ruangan</th>
                <th className="p-4">Tahun / Sumber</th>
                <th className="p-4">Nilai Aset (Rp)</th>
                <th className="p-4">Kondisi</th>
                <th className="p-4 text-center">QR &amp; Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400 font-semibold">
                    Belum ada data barang inventaris yang cocok dengan pencarian.
                  </td>
                </tr>
              ) : (
                filteredItems.map((it, idx) => (
                  <tr key={it.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4 font-mono font-bold text-slate-500">{idx + 1}</td>
                    <td className="p-4">
                      <span className="font-mono font-bold text-slate-950 block">
                        {isNegeri ? it.kodeBarang : it.kodeYayasan || '-'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                        {isNegeri ? `NIBAR: ${it.nibar} | Reg: ${it.nomorRegister}` : `Reg: ${it.nomorRegister}`}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-display font-black text-slate-900 text-sm block">
                        {it.namaBarang}
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Merk/Tipe: {it.merkTipe} {it.ukuranBahan && it.ukuranBahan !== '-' ? `• ${it.ukuranBahan}` : ''}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="inline-block bg-slate-100 text-slate-800 px-3 py-1 rounded-xl font-bold">
                        {it.lokasiRuangan}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-slate-900 block">{it.tahunPerolehan}</span>
                      <span className="text-[10px] text-slate-500 block">{it.sumberDana}</span>
                    </td>
                    <td className="p-4 font-mono font-black text-emerald-700">
                      Rp {(Number(it.hargaPerolehan) || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-xl text-[10px] font-black uppercase ${
                          it.keadaanBarang.includes('Baik') && !it.keadaanBarang.includes('Kurang')
                            ? 'bg-emerald-100 text-emerald-800'
                            : it.keadaanBarang.includes('Kurang') || it.keadaanBarang.includes('Ringan')
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {it.keadaanBarang}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setQrTargetItem(it);
                            setIsQrModalOpen(true);
                          }}
                          className="p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 transition cursor-pointer"
                          title="Cetak Stiker QR Code"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(it)}
                              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                              title="Edit Barang"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(it.id)}
                              className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                              title="Hapus Barang"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-display font-black text-slate-900">
                  {editingItem ? 'Edit Data Barang Inventaris' : 'Tambah Barang Inventaris Baru'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isNegeri ? 'Standar KIB B Permendagri No. 47 Tahun 2021' : 'Standar Kode Inventaris Yayasan'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer font-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isNegeri ? (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Kode Barang (7 Level Permendagri 47/2021)
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.kodeBarang || ''}
                        onChange={(e) => setFormData({ ...formData, kodeBarang: e.target.value })}
                        placeholder="Contoh: 1.3.2.10.01.02.001"
                        className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        NIBAR (Nomor Identitas Barang)
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.nibar || ''}
                        onChange={(e) => setFormData({ ...formData, nibar: e.target.value })}
                        placeholder="Contoh: 00001"
                        className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-rose-500"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kode Inventaris Yayasan
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.kodeYayasan || ''}
                      onChange={(e) => setFormData({ ...formData, kodeYayasan: e.target.value })}
                      placeholder="Contoh: YYS-INV-001"
                      className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-rose-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Register</label>
                  <input
                    type="text"
                    required
                    value={formData.nomorRegister || ''}
                    onChange={(e) => setFormData({ ...formData, nomorRegister: e.target.value })}
                    placeholder="Contoh: 0001"
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-rose-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama / Jenis Barang</label>
                  <input
                    type="text"
                    required
                    value={formData.namaBarang || ''}
                    onChange={(e) => setFormData({ ...formData, namaBarang: e.target.value })}
                    placeholder="Contoh: Laptop ASUS ExpertBook / Meja Siswa Kayu"
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Merk / Tipe / Spesifikasi</label>
                  <input
                    type="text"
                    value={formData.merkTipe || ''}
                    onChange={(e) => setFormData({ ...formData, merkTipe: e.target.value })}
                    placeholder="Contoh: ASUS P1412 / Epson EB-E01"
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ukuran / Bahan</label>
                  <input
                    type="text"
                    value={formData.ukuranBahan || ''}
                    onChange={(e) => setFormData({ ...formData, ukuranBahan: e.target.value })}
                    placeholder="Contoh: Plastik / Besi / Kayu Jati"
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tahun Perolehan</label>
                  <input
                    type="text"
                    value={formData.tahunPerolehan || ''}
                    onChange={(e) => setFormData({ ...formData, tahunPerolehan: e.target.value })}
                    placeholder="Contoh: 2026"
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sumber Dana / Asal Usul</label>
                  <select
                    value={formData.sumberDana || (isNegeri ? 'BOS Reguler' : 'Yayasan')}
                    onChange={(e) => setFormData({ ...formData, sumberDana: e.target.value })}
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 bg-white outline-none focus:border-rose-500"
                  >
                    <option value="BOS Reguler">BOS Reguler</option>
                    <option value="BOP">BOP</option>
                    <option value="Hibah">Hibah</option>
                    <option value="APBD">APBD</option>
                    <option value="Yayasan">Yayasan</option>
                    <option value="Komite / Sumbangan">Komite / Sumbangan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isNegeri ? 'Harga Perolehan (Rp)' : 'Nilai Aset (Rp)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.hargaPerolehan || 0}
                    onChange={(e) => setFormData({ ...formData, hargaPerolehan: Number(e.target.value) || 0 })}
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lokasi Ruangan Penempatan</label>
                  <select
                    value={formData.lokasiRuangan || 'Kelas 6A'}
                    onChange={(e) => setFormData({ ...formData, lokasiRuangan: e.target.value })}
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 bg-white outline-none focus:border-rose-500"
                  >
                    {roomsList.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Keadaan / Kondisi Barang</label>
                  <select
                    value={formData.keadaanBarang || (isNegeri ? 'Baik (B)' : 'Baik')}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        keadaanBarang: e.target.value as InventoryItem['keadaanBarang'],
                      })
                    }
                    className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 bg-white outline-none focus:border-rose-500"
                  >
                    {isNegeri ? (
                      <>
                        <option value="Baik (B)">Baik (B)</option>
                        <option value="Kurang Baik (KB)">Kurang Baik (KB)</option>
                        <option value="Rusak Berat (RB)">Rusak Berat (RB)</option>
                      </>
                    ) : (
                      <>
                        <option value="Baik">Baik</option>
                        <option value="Kurang Baik / Rusak Ringan">Kurang Baik / Rusak Ringan</option>
                        <option value="Rusak Berat">Rusak Berat</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs transition cursor-pointer shadow-md"
                >
                  Simpan Barang Aset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Excel/CSV Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-display font-black text-slate-900">
                  Impor Massal Data Aset (Excel / CSV)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Format otomatis menyesuaikan status sekolah ({isNegeri ? 'Negeri - Permendagri 47/2021' : 'Swasta - Yayasan'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer font-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <div>
                  <h4 className="text-xs font-black text-amber-950">Langkah 1: Unduh Template CSV Baku</h4>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Mendukung ekspor spreadsheet e-BMD / Yayasan (.xlsx, .xls, .csv) dengan normalisasi nominal &amp; kondisi otomatis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Template CSV</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Langkah 2: Unggah File (.xlsx / .xls / .csv) atau Tempel Teks CSV
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    onChange={handleImportFileUpload}
                    className="text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 cursor-pointer"
                  />
                </div>
                <textarea
                  rows={5}
                  value={importCsvText}
                  onChange={(e) => {
                    setImportCsvText(e.target.value);
                    handleParseCsvText(e.target.value);
                  }}
                  placeholder="Atau tempel isi teks CSV di sini (pisahkan dengan ; atau ,)..."
                  className="w-full p-4 rounded-2xl border border-slate-200 text-xs font-mono outline-none focus:border-rose-500 bg-slate-50/50"
                />
              </div>

              {previewRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-800">
                      Tabel Pratinjau Validasi ({validPreviewItems.length} Valid / {previewRows.length} Baris):
                    </span>
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                      ✓ Siap Simpan Batch (maks 400/commit)
                    </span>
                  </div>
                  <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-extrabold sticky top-0">
                        <tr>
                          <th className="p-3">Baris</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Nama Barang</th>
                          <th className="p-3">Kode / Reg</th>
                          <th className="p-3">Ruangan</th>
                          <th className="p-3">Nilai Aset</th>
                          <th className="p-3">Kondisi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-600">
                        {previewRows.map((pr, pIdx) => (
                          <tr key={pIdx} className={pr.valid ? '' : 'bg-rose-50'}>
                            <td className="p-3 font-mono">{pr.rowNum}</td>
                            <td className="p-3">
                              {pr.valid ? (
                                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                  Valid
                                </span>
                              ) : (
                                <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                                  {pr.errorReason || 'Error'}
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-bold text-slate-900">{pr.item?.namaBarang || '-'}</td>
                            <td className="p-3 font-mono text-[11px]">
                              {pr.item
                                ? `${isNegeri ? pr.item.kodeBarang : pr.item.kodeYayasan} (${pr.item.nomorRegister})`
                                : '-'}
                            </td>
                            <td className="p-3">{pr.item?.lokasiRuangan || '-'}</td>
                            <td className="p-3 font-mono text-emerald-700">
                              {pr.item ? `Rp ${(pr.item.hargaPerolehan || 0).toLocaleString('id-ID')}` : '-'}
                            </td>
                            <td className="p-3">{pr.item?.keadaanBarang || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-6 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={validPreviewItems.length === 0 || isImporting}
                onClick={handleProcessBatchImport}
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke Database...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Proses &amp; Simpan {validPreviewItems.length} Barang</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera QR Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-display font-black text-slate-900 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-sky-600" />
                  <span>Scan QR Code Aset via Kamera HP</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Arahkan kamera ke stiker QR label barang untuk melihat kartu identitas, update kondisi, atau mutasi ruangan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {cameras.length > 1 && (
                <div className="flex items-center gap-2">
                  <select
                    value={activeCameraId}
                    onChange={(e) => {
                      setActiveCameraId(e.target.value);
                      void startScannerCamera(e.target.value);
                    }}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-slate-50"
                  >
                    {cameras.map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void startScannerCamera()}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Muat Ulang
                  </button>
                </div>
              )}

              <div className="rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 min-h-[220px] flex items-center justify-center relative">
                <div id="inventory-qr-scanner-box" className="w-full" />
              </div>

              {scannerError && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{scannerError}</span>
                </div>
              )}

              {/* Fallback input kode QR / NIBAR manual */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualQrInput}
                  onChange={(e) => setManualQrInput(e.target.value)}
                  placeholder="Atau ketik / tempel ID QR, NIBAR, atau Kode Yayasan..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    const found = resolveScannedInventoryItem(manualQrInput);
                    if (found) {
                      setScannedItem(found);
                      setMutasiTargetRoom(found.lokasiRuangan);
                      showToast(`Barang ditemukan: ${found.namaBarang}`, 'success');
                    } else {
                      showToast('Kode barang/NIBAR tidak ditemukan.', 'error');
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black cursor-pointer"
                >
                  Cari Aset
                </button>
              </div>
            </div>

            {scannedItem && (
              <div className="p-5 rounded-3xl bg-sky-50/70 border-2 border-sky-200 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-black uppercase bg-sky-600 text-white px-2.5 py-0.5 rounded-full">
                      Kartu Identitas Barang Terdeteksi
                    </span>
                    <h4 className="text-base font-display font-black text-slate-900 mt-1">
                      {scannedItem.namaBarang}
                    </h4>
                    <p className="text-xs text-slate-600">
                      Merk/Tipe: {scannedItem.merkTipe} • Tahun {scannedItem.tahunPerolehan} • {scannedItem.sumberDana}
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-xl bg-white border border-sky-200 font-bold text-xs text-sky-900">
                    {scannedItem.lokasiRuangan}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] bg-white p-3 rounded-2xl border border-sky-100">
                  <div>
                    <span className="text-slate-400 block">Kode</span>
                    <strong className="font-mono text-slate-800">
                      {isNegeri ? scannedItem.kodeBarang : scannedItem.kodeYayasan || '-'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">NIBAR / Reg</span>
                    <strong className="font-mono text-slate-800">
                      {scannedItem.nibar} / {scannedItem.nomorRegister}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Kondisi Saat Ini</span>
                    <strong className="text-slate-900">{scannedItem.keadaanBarang}</strong>
                  </div>
                </div>

                {canManage && (
                  <div className="space-y-3 pt-2 border-t border-sky-200">
                    <div>
                      <span className="block text-[11px] font-black text-slate-700 mb-1.5">
                        Update Cepat Kondisi Barang:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(isNegeri
                          ? (['Baik (B)', 'Kurang Baik (KB)', 'Rusak Berat (RB)'] as const)
                          : (['Baik', 'Kurang Baik / Rusak Ringan', 'Rusak Berat'] as const)
                        ).map((cond) => (
                          <button
                            key={cond}
                            type="button"
                            disabled={isUpdatingScanned}
                            onClick={() => void handleQuickUpdateCondition(scannedItem, cond)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                              scannedItem.keadaanBarang === cond
                                ? 'bg-slate-900 text-white'
                                : 'bg-white border border-slate-300 hover:bg-slate-100 text-slate-800'
                            }`}
                          >
                            {cond}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-[11px] font-black text-slate-700 mb-1.5">
                        Mutasi Pindah Ruangan:
                      </span>
                      <div className="flex gap-2">
                        <select
                          value={mutasiTargetRoom}
                          onChange={(e) => setMutasiTargetRoom(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                        >
                          {roomsList.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={isUpdatingScanned}
                          onClick={() => void handleQuickMutasiRoom()}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Simpan Mutasi</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR Code Sticker Modal */}
      {isQrModalOpen && qrTargetItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl p-6 sm:p-8 space-y-6 text-center">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 no-print">
              <h3 className="text-base font-display font-black text-slate-900">
                Stiker Label QR Code Aset
              </h3>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              id="print-qr-card"
              className="p-5 bg-white border-2 border-slate-900 rounded-3xl space-y-3 shadow-sm inline-block w-full"
            >
              <div className="flex items-center justify-center gap-2.5 border-b border-slate-200 pb-2.5">
                {profile.logoSekolahUrl && (
                  <img
                    src={profile.logoSekolahUrl}
                    alt="Logo Sekolah"
                    className="w-7 h-7 object-contain"
                  />
                )}
                <div className="text-left">
                  <span className="font-display font-black text-xs uppercase text-slate-900 block leading-tight">
                    {profile.name}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">
                    NPSN: {profile.npsn} • Inventaris Milik Sekolah
                  </span>
                </div>
              </div>

              <div className="flex justify-center py-1">
                <div className="p-2 bg-white border border-slate-300 rounded-2xl shadow-xs inline-flex flex-col items-center">
                  <QrCodeCanvasImage
                    value={`SERBU21_INV:${profile.npsn}:${qrTargetItem.id}`}
                    size={136}
                    alt={`QR ${qrTargetItem.namaBarang}`}
                  />
                  <span className="font-mono text-[9px] font-bold text-slate-600 mt-1">
                    {qrTargetItem.id.slice(-10)}
                  </span>
                </div>
              </div>

              <div className="space-y-1 text-left bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[11px] font-black text-slate-900 truncate">
                  {qrTargetItem.namaBarang}
                </p>
                <p className="text-[10px] font-mono text-slate-700">
                  Kode: {isNegeri ? qrTargetItem.kodeBarang : qrTargetItem.kodeYayasan || '-'}
                </p>
                <p className="text-[10px] font-mono text-slate-700">
                  {isNegeri
                    ? `NIBAR/Reg: ${qrTargetItem.nibar} / ${qrTargetItem.nomorRegister}`
                    : `No. Register: ${qrTargetItem.nomorRegister}`}
                </p>
                <p className="text-[10px] font-semibold text-slate-600">
                  Lokasi: {qrTargetItem.lokasiRuangan} ({qrTargetItem.keadaanBarang})
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Stiker Label</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kartu Inventaris Ruangan (KIR) PDF Modal */}
      {isKirModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-10 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 no-print">
              <div>
                <h3 className="text-xl font-display font-black text-slate-900">
                  Kartu Inventaris Ruangan (KIR) - {kirRoom}
                </h3>
                <p className="text-xs text-slate-500">
                  {profile.name} • NPSN: {profile.npsn}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={kirRoom}
                  onChange={(e) => setKirRoom(e.target.value)}
                  className="px-3.5 py-2 rounded-2xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  {roomsList.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleDownloadKirPdf()}
                  className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh PDF KIR</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Halaman</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsKirModalOpen(false)}
                  className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-black cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable KIR Document Sheet */}
            <div className="p-6 sm:p-8 bg-white border border-slate-300 rounded-3xl space-y-6 text-slate-900 shadow-sm print:p-0 print:border-none">
              <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1">
                <h2 className="text-lg font-display font-black uppercase tracking-wide">
                  KARTU INVENTARIS RUANGAN (KIR)
                </h2>
                <h3 className="text-sm font-bold uppercase">{profile.name}</h3>
                <p className="text-xs text-slate-600">
                  Ruangan: <span className="font-black text-slate-900">{kirRoom}</span> | Tahun Anggaran:{' '}
                  {profile.activeAcademicYear || '2026/2027'} | Standar:{' '}
                  {isNegeri ? 'Permendagri No. 47/2021 (BMD)' : 'Kebijakan Yayasan'}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border border-slate-400 text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 font-extrabold text-[11px] uppercase border-b border-slate-400 text-center">
                      <th className="border border-slate-400 p-2">No</th>
                      <th className="border border-slate-400 p-2">
                        {isNegeri ? 'Kode Barang / NIBAR' : 'Kode Yayasan'}
                      </th>
                      <th className="border border-slate-400 p-2">Nama Barang &amp; Spesifikasi</th>
                      <th className="border border-slate-400 p-2">No. Reg</th>
                      <th className="border border-slate-400 p-2">Tahun</th>
                      <th className="border border-slate-400 p-2">Sumber</th>
                      <th className="border border-slate-400 p-2">Harga (Rp)</th>
                      <th className="border border-slate-400 p-2">Kondisi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {kirRoomItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-500 italic">
                          Belum ada barang terdaftar di ruangan {kirRoom}.
                        </td>
                      </tr>
                    ) : (
                      kirRoomItems.map((it, idx) => (
                        <tr key={it.id}>
                          <td className="border border-slate-300 p-2 text-center font-mono">{idx + 1}</td>
                          <td className="border border-slate-300 p-2 font-mono font-bold">
                            {isNegeri ? `${it.kodeBarang} (${it.nibar})` : it.kodeYayasan || '-'}
                          </td>
                          <td className="border border-slate-300 p-2 font-bold">
                            {it.namaBarang} ({it.merkTipe})
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-mono">
                            {it.nomorRegister}
                          </td>
                          <td className="border border-slate-300 p-2 text-center">{it.tahunPerolehan}</td>
                          <td className="border border-slate-300 p-2 text-center">{it.sumberDana}</td>
                          <td className="border border-slate-300 p-2 text-right font-mono font-bold">
                            {(it.hargaPerolehan || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-bold">
                            {it.keadaanBarang}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-black text-slate-900">
                      <td colSpan={6} className="border border-slate-400 p-2 text-right uppercase">
                        Total Rekapitulasi Aset ({kirRoomItems.length} Unit Barang)
                      </td>
                      <td className="border border-slate-400 p-2 text-right font-mono">
                        Rp {kirRoomTotalValue.toLocaleString('id-ID')}
                      </td>
                      <td className="border border-slate-400 p-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center sm:items-start gap-6 pt-6 text-xs font-semibold">
                <div className="text-center space-y-14">
                  <p>
                    Mengetahui,
                    <br />
                    Kepala Sekolah
                  </p>
                  <div>
                    <p className="font-display font-black underline">
                      {profile.kepalaSekolah?.nama || 'Darti Isyanti, M.Pd'}
                    </p>
                    <p>NIP. {profile.kepalaSekolah?.nip || '197710102017082001'}</p>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1 pt-2">
                  <QrCodeCanvasImage
                    value={`SERBU21_KIR|NPSN:${profile.npsn}|RUANG:${kirRoom}|UNIT:${kirRoomItems.length}|TOTAL:${kirRoomTotalValue}`}
                    size={84}
                    alt="QR Validasi KIR"
                  />
                  <span className="text-[10px] font-bold text-slate-500">QR Validasi KIR</span>
                </div>

                <div className="text-center space-y-14">
                  <p>
                    Jakarta,{' '}
                    {new Date().toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    <br />
                    Pengurus / Bendahara Barang
                  </p>
                  <div>
                    <p className="font-display font-black underline">Endi Soeprapto, S.Pd., Gr.</p>
                    <p>NIP. 198501012010011001</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORMAT EDIT JUMLAH & DAFTAR RUANGAN */}
      {isRoomModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Building className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-black text-slate-900">
                    Format Edit Jumlah &amp; Daftar Ruangan
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sesuaikan jumlah ruangan, format rombel kelas, atau edit nama ruangan untuk inventaris &amp; KIR.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRoomModalOpen(false)}
                className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-black cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Format Cepat 1 & 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Format A: Edit Target Jumlah Ruangan */}
              <div className="p-4 rounded-3xl bg-amber-50/70 border border-amber-200 space-y-3">
                <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider block">
                  1. Atur Jumlah Total Ruangan
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={targetRoomCountInput}
                    onChange={(e) => setTargetRoomCountInput(Number(e.target.value))}
                    className="w-24 px-3 py-2.5 rounded-2xl border border-amber-300 bg-white text-sm font-black text-slate-900 text-center outline-none focus:border-amber-500"
                  />
                  <span className="text-xs font-bold text-slate-700">Ruangan</span>
                  <button
                    type="button"
                    onClick={handleApplyTargetRoomCount}
                    className="ml-auto px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-display font-black text-xs cursor-pointer transition shadow-xs"
                  >
                    Sesuaikan
                  </button>
                </div>
                <p className="text-[11px] text-amber-900/80 leading-relaxed">
                  Menambah ruangan otomatis atau memangkas ruangan kosong dari urutan paling bawah.
                </p>
              </div>

              {/* Format B: Generator Format Rombel Kelas + Ruang Penunjang */}
              <div className="p-4 rounded-3xl bg-sky-50/70 border border-sky-200 space-y-3">
                <span className="text-[11px] font-black uppercase text-sky-900 tracking-wider block">
                  2. Format Otomatis Rombel SD (Kelas 1–6)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={rombelPerGrade}
                    onChange={(e) => setRombelPerGrade(Number(e.target.value))}
                    className="flex-1 min-w-[140px] px-3 py-2 rounded-2xl border border-sky-300 bg-white text-xs font-bold text-slate-800 outline-none"
                  >
                    <option value={1}>1 Rombel/Tingkat (6 Kelas)</option>
                    <option value={2}>2 Rombel/Tingkat (12 Kelas: A–B)</option>
                    <option value={3}>3 Rombel/Tingkat (18 Kelas: A–C)</option>
                    <option value={4}>4 Rombel/Tingkat (24 Kelas: A–D)</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleGenerateGradeRoomsFormat}
                    className="px-4 py-2 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-display font-black text-xs cursor-pointer transition shadow-xs"
                  >
                    Terapkan Format
                  </button>
                </div>
                <label className="flex items-center gap-2 text-[11px] font-bold text-sky-950 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeSupportRooms}
                    onChange={(e) => setIncludeSupportRooms(e.target.checked)}
                    className="w-4 h-4 accent-sky-600 rounded"
                  />
                  <span>Sertakan Ruang Penunjang (Guru, Kepsek, TU, Perpus, UKS, Lab, Mushola, Gudang)</span>
                </label>
              </div>
            </div>

            {/* Tambah Ruangan Manual */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={newRoomNameInput}
                onChange={(e) => setNewRoomNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDraftRoom();
                  }
                }}
                placeholder="Tambah nama ruangan baru (misal: Lab Komputer, Ruang Musik, Kantin)..."
                className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-amber-500 bg-slate-50/70"
              />
              <button
                type="button"
                onClick={handleAddDraftRoom}
                className="px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-display font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Ruangan</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const merged = Array.from(
                    new Set([
                      ...DEFAULT_ROOMS,
                      ...Object.keys(itemCountByRoom).filter((k) => itemCountByRoom[k] > 0),
                    ])
                  );
                  setDraftRooms(merged.map((r) => ({ original: r, name: r })));
                  setTargetRoomCountInput(merged.length);
                }}
                className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Standar</span>
              </button>
            </div>

            {/* Daftar Edit Nama Ruangan */}
            <div className="border border-slate-200 rounded-3xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-black text-slate-700">
                <span>Daftar Ruangan ({draftRooms.length} Ruangan)</span>
                <span className="text-[11px] font-semibold text-slate-500">
                  Klik kolom nama untuk mengedit nama ruangan
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {draftRooms.map((room, idx) => {
                  const activeCount =
                    itemCountByRoom[room.original || room.name] || itemCountByRoom[room.name] || 0;
                  return (
                    <div
                      key={`${idx}_${room.original}`}
                      className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50/80"
                    >
                      <span className="w-7 text-center font-mono font-bold text-xs text-slate-400">
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        value={room.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraftRooms((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                          );
                        }}
                        className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white outline-none focus:border-amber-500"
                      />
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ${
                          activeCount > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {activeCount} unit aset
                      </span>
                      <button
                        type="button"
                        disabled={activeCount > 0}
                        onClick={() => {
                          setDraftRooms((prev) => {
                            const next = prev.filter((_, i) => i !== idx);
                            setTargetRoomCountInput(next.length);
                            return next;
                          });
                        }}
                        title={
                          activeCount > 0
                            ? 'Ruangan tidak dapat dihapus karena masih memiliki barang aset'
                            : 'Hapus ruangan'
                        }
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 disabled:opacity-35 disabled:cursor-not-allowed transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRoomModalOpen(false)}
                className="px-6 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingRooms}
                onClick={handleSaveRoomsConfig}
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md"
              >
                {isSavingRooms ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Simpan Daftar &amp; Jumlah Ruangan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
