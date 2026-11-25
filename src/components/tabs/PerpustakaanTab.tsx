import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Upload,
  Download,
  ExternalLink,
  X,
  Pencil,
  Trash2,
  Trophy,
  Crown,
  Medal,
  Award,
  Printer,
  FileSpreadsheet,
  QrCode,
  Camera,
  VideoOff,
  CheckCircle2,
  RotateCcw,
  Library,
  Sparkles,
  BookMarked,
  Calendar,
  UserCheck,
  AlertTriangle,
  Clock,
  SwitchCamera,
  RefreshCw,
  Eye,
  Link2,
  Copy,
  Check,
  Image as ImageIcon,
  LayoutGrid,
  Grid3X3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  collection,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  increment,
  serverTimestamp,
  writeBatch,
  query,
  orderBy,
} from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import {
  enumerateDeviceCameras,
  formatCameraErrorIndonesian,
  pickPreferredCameraId,
  startHtml5QrScanner,
  stopHtml5QrScanner,
} from '../../utils/cameraScanner';
import {
  ActiveUser,
  LogLiterasiItem,
  PeminjamanPerpustakaanItem,
  PerpustakaanBook,
  PerpustakaanKategori,
  PerpustakaanKelas,
  SchoolProfile,
  Student,
} from '../../types';
import { db, handleFirestoreError, OperationType } from '../../utils/firebase';
import { mapFirestorePermissionError, sanitizeInput } from '../../utils/sanitize';
import { CLASSES_LIST } from '../../utils/storage';
import { getLocalTodayStr, formatTanggalIndo } from '../../utils/dateUtils';
import { renderBarcodeToCanvas } from '../../utils/barcode';
import {
  KATEGORI_OPTIONS,
  KELAS_OPTIONS,
  OFFICIAL_LIBRARY_PORTALS,
  SEED_LIBRARY_BOOKS,
  TEMPLATE_PERPUSTAKAAN_CSV,
  convertToEmbedUrl,
  extractGoogleDriveFileId,
  isLikelyEmbeddableBookUrl,
  resolveBookCoverUrl,
  getLiteracyBadge,
  parseLibraryCsv,
  ParsedCsvResult,
} from '../../utils/perpustakaanHelpers';

interface Props {
  activeUser: ActiveUser;
  profile: SchoolProfile;
  students: Student[];
  activeClass: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

type LibrarySubTab = 'katalog' | 'pencarian' | 'literasi' | 'sirkulasi';

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function formatMonthYearLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  if (!y || Number.isNaN(idx) || idx < 0 || idx > 11) return ym;
  return `${MONTH_NAMES_ID[idx]} ${y}`;
}

function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

interface BookCoverImageProps {
  src?: string;
  fileUrl?: string;
  title: string;
  kategori: PerpustakaanKategori;
}

const BookCoverImage: React.FC<BookCoverImageProps> = ({ src, fileUrl, title, kategori }) => {
  const [hasError, setHasError] = useState(false);
  const resolvedSrc = useMemo(() => resolveBookCoverUrl(src, fileUrl), [src, fileUrl]);

  useEffect(() => {
    setHasError(false);
  }, [resolvedSrc]);

  const palette = useMemo(() => {
    if (kategori === 'Buku Cerita/Literasi') {
      return { bg: 'from-emerald-700 via-emerald-800 to-teal-900', bar: 'bg-emerald-300' };
    }
    if (kategori === 'Modul Ajar Guru') {
      return { bg: 'from-amber-600 via-amber-700 to-orange-800', bar: 'bg-amber-200' };
    }
    if (kategori === 'Buku Referensi') {
      return { bg: 'from-indigo-700 via-indigo-800 to-slate-900', bar: 'bg-indigo-300' };
    }
    return { bg: 'from-rose-700 via-rose-800 to-slate-900', bar: 'bg-rose-300' };
  }, [kategori]);

  if (!resolvedSrc || hasError) {
    return (
      <div
        className={`w-full h-full bg-gradient-to-br ${palette.bg} text-white flex flex-col justify-between p-3.5 pl-5 select-none relative overflow-hidden`}
      >
        {/* Minimalist book spine crease */}
        <div className="absolute inset-y-0 left-0 w-2.5 bg-black/20 border-r border-white/15" />
        <div className={`w-8 h-0.5 ${palette.bar} rounded-full opacity-80`} />
        <div className="my-auto py-1 space-y-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-white/75 truncate">
            {kategori}
          </div>
          <div className="font-display font-bold text-xs sm:text-sm leading-snug line-clamp-4 text-white">
            {title || 'Judul Buku Digital'}
          </div>
        </div>
        <div className="flex items-center justify-between text-[9px] font-medium text-white/70 border-t border-white/15 pt-1.5">
          <span>SERBU 21</span>
          <BookOpen className="w-3 h-3 opacity-80" />
        </div>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={`Sampul ${title}`}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
    />
  );
};

export const PerpustakaanTab: React.FC<Props> = ({
  activeUser,
  profile,
  students,
  activeClass,
  showToast,
  onOpenZoom,
}) => {
  const isStaff = activeUser.role === 'admin' || activeUser.role === 'guru';
  const isStudent = activeUser.role === 'siswa';

  const [subTab, setSubTab] = useState<LibrarySubTab>('katalog');

  // Firestore collections state
  const [books, setBooks] = useState<PerpustakaanBook[]>([]);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [literacyLogs, setLiteracyLogs] = useState<LogLiterasiItem[]>([]);
  const [loans, setLoans] = useState<PeminjamanPerpustakaanItem[]>([]);

  // Catalog filters & view/pagination preferences
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKelas, setFilterKelas] = useState<string>('Semua');
  const [filterKategori, setFilterKategori] = useState<string>('Semua');
  const [catalogViewMode, setCatalogViewMode] = useState<'minimalis' | 'kartu'>(() => {
    try {
      const saved = localStorage.getItem('serbu21_perpus_view_mode');
      return saved === 'kartu' ? 'kartu' : 'minimalis';
    } catch {
      return 'minimalis';
    }
  });
  const [itemsPerPage, setItemsPerPage] = useState<10 | 20 | 30 | 50>(() => {
    try {
      const saved = Number(localStorage.getItem('serbu21_perpus_per_page'));
      if (saved === 10 || saved === 20 || saved === 30 || saved === 50) return saved;
    } catch {}
    return 20;
  });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    try {
      localStorage.setItem('serbu21_perpus_view_mode', catalogViewMode);
    } catch {}
  }, [catalogViewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('serbu21_perpus_per_page', String(itemsPerPage));
    } catch {}
  }, [itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterKelas, filterKategori, itemsPerPage]);

  // Dedicated Pencarian Koleksi sub-tab states
  const [searchTabQuery, setSearchTabQuery] = useState('');
  const [searchTabKelas, setSearchTabKelas] = useState<string>('Semua');
  const [searchTabKategori, setSearchTabKategori] = useState<string>('Semua');
  const [searchTabSumber, setSearchTabSumber] = useState<string>('Semua');

  // Reader & Cover Preview modals
  const [readingBook, setReadingBook] = useState<PerpustakaanBook | null>(null);
  const [previewBook, setPreviewBook] = useState<PerpustakaanBook | null>(null);
  const [showPreviewIframe, setShowPreviewIframe] = useState(false);
  const [copiedBookUrlId, setCopiedBookUrlId] = useState<string | null>(null);

  // Add / Edit Book modal
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [formJudul, setFormJudul] = useState('');
  const [formPenulis, setFormPenulis] = useState('');
  const [formKategori, setFormKategori] = useState<PerpustakaanKategori>('Buku Pelajaran');
  const [formKelas, setFormKelas] = useState<PerpustakaanKelas>('Semua');
  const [formSumber, setFormSumber] = useState('SIBI Kemendikdasmen');
  const [formCoverUrl, setFormCoverUrl] = useState('');
  const [formFileUrl, setFormFileUrl] = useState('');
  const [showFormBookPreview, setShowFormBookPreview] = useState(false);
  const [isSavingBook, setIsSavingBook] = useState(false);

  // Delete book confirmation modal
  const [bookToDelete, setBookToDelete] = useState<PerpustakaanBook | null>(null);
  const [isDeletingBook, setIsDeletingBook] = useState(false);

  // CSV Import modal
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<ParsedCsvResult | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Leaderboard filters
  const [filterMonth, setFilterMonth] = useState<string>('ALL');
  const [filterRombel, setFilterRombel] = useState<string>('ALL');

  // Print target controller
  const [printMode, setPrintMode] = useState<'laporan' | 'kartu'>('laporan');

  // Borrowing & Barcode Card (Sirkulasi) state
  const currentStudentRecord = useMemo(() => {
    if (!isStudent) return null;
    return (
      students.find(
        (s) =>
          (activeUser.studentData?.id && s.id === activeUser.studentData.id) ||
          (activeUser.studentData?.nisn && s.nisn === activeUser.studentData.nisn)
      ) || activeUser.studentData || null
    );
  }, [isStudent, students, activeUser]);

  const [selectedBorrowStudentId, setSelectedBorrowStudentId] = useState<string>('');
  const [studentSearchInput, setStudentSearchInput] = useState<string>('');
  const [borrowBookId, setBorrowBookId] = useState<string>('');
  const [borrowCustomTitle, setBorrowCustomTitle] = useState<string>('');
  const [borrowEksemplar, setBorrowEksemplar] = useState<string>('');
  const [borrowDate, setBorrowDate] = useState<string>(() => getLocalTodayStr());
  const [borrowDueDate, setBorrowDueDate] = useState<string>(() => addDaysToDate(getLocalTodayStr(), 7));
  const [borrowNote, setBorrowNote] = useState<string>('');
  const [isSavingLoan, setIsSavingLoan] = useState(false);
  const [loanStatusFilter, setLoanStatusFilter] = useState<'ALL' | 'Dipinjam' | 'Dikembalikan'>('ALL');
  const [loanSearchQuery, setLoanSearchQuery] = useState('');
  const [loanToDelete, setLoanToDelete] = useState<PeminjamanPerpustakaanItem | null>(null);

  // Barcode Checkout Modal State (linking student's attendance/library barcode to a specific book ID)
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [checkoutTargetBook, setCheckoutTargetBook] = useState<PerpustakaanBook | null>(null);
  const [checkoutBarcodeInput, setCheckoutBarcodeInput] = useState('');
  const [checkoutMatchedStudent, setCheckoutMatchedStudent] = useState<Student | null>(null);
  const [checkoutAutoSubmit, setCheckoutAutoSubmit] = useState(true);
  const [checkoutDueDate, setCheckoutDueDate] = useState<string>(() => addDaysToDate(getLocalTodayStr(), 7));
  const [checkoutEksemplar, setCheckoutEksemplar] = useState('');
  const [checkoutNote, setCheckoutNote] = useState('');
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [checkoutSuccessLoan, setCheckoutSuccessLoan] = useState<PeminjamanPerpustakaanItem | null>(null);
  const [checkoutCamActive, setCheckoutCamActive] = useState(false);
  const [isStartingCheckoutCam, setIsStartingCheckoutCam] = useState(false);
  const checkoutQrRef = useRef<Html5Qrcode | null>(null);
  const checkoutInputRef = useRef<HTMLInputElement | null>(null);
  const checkoutKeyBufRef = useRef<{ buf: string; lastTime: number }>({ buf: '', lastTime: 0 });

  // Camera Scanner for Kartu Peminjaman
  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCam, setIsStartingCam] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCamId, setSelectedCamId] = useState('');
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const keyBufferRef = useRef<{ buf: string; lastTime: number }>({ buf: '', lastTime: 0 });
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const printCardCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Subscribe to Firestore collections
  useEffect(() => {
    const qBooks = query(collection(db, 'perpustakaan'), orderBy('createdAt', 'desc'));
    const unsubBooks = onSnapshot(
      qBooks,
      (snap) => {
        const items: PerpustakaanBook[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            judul: data.judul || '',
            penulis: data.penulis || '-',
            kategori: data.kategori || 'Buku Pelajaran',
            kelas: data.kelas || 'Semua',
            cover_url: data.cover_url || '',
            file_url: data.file_url || '',
            sumber: data.sumber || 'Perpustakaan Digital',
            dibaca_count: typeof data.dibaca_count === 'number' ? data.dibaca_count : 0,
            createdAt: data.createdAt,
          };
        });
        setBooks(items);
        setBooksLoaded(true);
      },
      (err) => {
        setBooksLoaded(true);
        handleFirestoreError(err, OperationType.LIST, 'perpustakaan');
      }
    );

    const unsubLogs = onSnapshot(
      collection(db, 'log_literasi'),
      (snap) => {
        const items: LogLiterasiItem[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            nisn: data.nisn || '',
            nama_siswa: data.nama_siswa || '',
            kelas: data.kelas || '',
            buku_id: data.buku_id || '',
            judul_buku: data.judul_buku || '',
            kategori_buku: data.kategori_buku || '',
            waktu_baca: data.waktu_baca,
            tanggal: data.tanggal || '',
            bulan_tahun: data.bulan_tahun || '',
          };
        });
        setLiteracyLogs(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'log_literasi');
      }
    );

    let pinjamanDocs: PeminjamanPerpustakaanItem[] = [];
    let legacyDocs: PeminjamanPerpustakaanItem[] = [];

    const mapLoanDoc = (
      d: any,
      sourceCollection: 'pinjaman' | 'peminjaman_perpustakaan'
    ): PeminjamanPerpustakaanItem => {
      const data = d.data() as any;
      return {
        id: d.id,
        student_id: data.student_id || '',
        barcode_id: data.barcode_id || '',
        nisn: data.nisn || '',
        nama_siswa: data.nama_siswa || '',
        kelas: data.kelas || '',
        buku_id: data.buku_id || '',
        judul_buku: data.judul_buku || '',
        kode_eksemplar: data.kode_eksemplar || '',
        tanggal_pinjam: data.tanggal_pinjam || '',
        tanggal_kembali_rencana: data.tanggal_kembali_rencana || '',
        tanggal_dikembalikan: data.tanggal_dikembalikan || '',
        status: data.status === 'Dikembalikan' ? 'Dikembalikan' : 'Dipinjam',
        petugas: data.petugas || '',
        catatan: data.catatan || '',
        createdAt: data.createdAt,
        sourceCollection,
      };
    };

    const mergeAndSortLoans = () => {
      const merged = [...pinjamanDocs, ...legacyDocs].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'Dipinjam' ? -1 : 1;
        return (b.tanggal_pinjam || '').localeCompare(a.tanggal_pinjam || '');
      });
      setLoans(merged);
    };

    const unsubPinjaman = onSnapshot(
      collection(db, 'pinjaman'),
      (snap) => {
        pinjamanDocs = snap.docs.map((d) => mapLoanDoc(d, 'pinjaman'));
        mergeAndSortLoans();
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'pinjaman');
      }
    );

    const unsubLegacyLoans = onSnapshot(
      collection(db, 'peminjaman_perpustakaan'),
      (snap) => {
        legacyDocs = snap.docs.map((d) => mapLoanDoc(d, 'peminjaman_perpustakaan'));
        mergeAndSortLoans();
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'peminjaman_perpustakaan');
      }
    );

    return () => {
      unsubBooks();
      unsubLogs();
      unsubPinjaman();
      unsubLegacyLoans();
    };
  }, []);

  // Auto-select logged-in student for Sirkulasi tab
  useEffect(() => {
    if (isStudent && currentStudentRecord) {
      setSelectedBorrowStudentId(currentStudentRecord.id);
    }
  }, [isStudent, currentStudentRecord]);

  const activeBorrowStudent = useMemo(() => {
    if (isStudent) return currentStudentRecord;
    return students.find((s) => s.id === selectedBorrowStudentId) || null;
  }, [isStudent, currentStudentRecord, students, selectedBorrowStudentId]);

  // Render student's Kartu Absensi Barcode onto card canvas
  useEffect(() => {
    if (subTab !== 'sirkulasi' || !activeBorrowStudent?.barcodeId) return;
    const idStr = activeBorrowStudent.barcodeId;
    if (cardCanvasRef.current) {
      renderBarcodeToCanvas(cardCanvasRef.current, idStr);
    }
    if (printCardCanvasRef.current) {
      renderBarcodeToCanvas(printCardCanvasRef.current, idStr);
    }
  }, [subTab, activeBorrowStudent]);

  const refreshDeviceCameras = async (preferId?: string) => {
    const list = await enumerateDeviceCameras();
    setCameras(list);
    if (list.length > 0) {
      setSelectedCamId((prev) => {
        const candidate = preferId || prev;
        if (candidate && list.some((c) => c.id === candidate)) return candidate;
        return pickPreferredCameraId(list);
      });
    }
    return list;
  };

  // Enumerate cameras when on Sirkulasi tab or Checkout Modal open (Staff only) + sync on devicechange
  useEffect(() => {
    if (!isStaff || (subTab !== 'sirkulasi' && !isCheckoutModalOpen)) return;
    refreshDeviceCameras();
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    const onDeviceChange = () => {
      refreshDeviceCameras();
    };
    mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    };
  }, [isStaff, subTab, isCheckoutModalOpen]);

  // Cleanup camera on tab switch or unmount
  const stopCameraScanner = async () => {
    await stopHtml5QrScanner(qrScannerRef.current);
    qrScannerRef.current = null;
    setCameraActive(false);
  };

  const stopCheckoutCamera = async () => {
    await stopHtml5QrScanner(checkoutQrRef.current);
    checkoutQrRef.current = null;
    setCheckoutCamActive(false);
  };

  useEffect(() => {
    if (subTab !== 'sirkulasi') {
      stopCameraScanner();
    }
    return () => {
      stopCameraScanner();
    };
  }, [subTab]);

  useEffect(() => {
    if (!isCheckoutModalOpen) {
      stopCheckoutCamera();
    } else {
      setTimeout(() => checkoutInputRef.current?.focus(), 120);
    }
    return () => {
      stopCheckoutCamera();
    };
  }, [isCheckoutModalOpen]);

  // Resolve scanned barcode string -> Student (supports Barcode ID, NISN, and KTP card NIS/NISN)
  const handleResolveBarcodeStudent = (rawCode: string) => {
    const cleaned = rawCode.trim();
    if (!cleaned) return;
    const q = cleaned.toLowerCase();
    const found = students.find(
      (s) =>
        (s.barcodeId && s.barcodeId.trim().toLowerCase() === q) ||
        (s.nisn && s.nisn.trim().toLowerCase() === q) ||
        (s.id && s.id.trim().toLowerCase() === q) ||
        (s.nama && s.nama.trim().toLowerCase() === q)
    );
    if (found) {
      setSelectedBorrowStudentId(found.id);
      setStudentSearchInput('');
      showToast(`Kartu terdeteksi: ${found.nama} (${found.kelas})`, 'success');
    } else {
      showToast(`Kode kartu "${cleaned}" tidak ditemukan pada data siswa.`, 'error');
    }
  };

  const resolveBarcodeStudentRef = useRef(handleResolveBarcodeStudent);
  resolveBarcodeStudentRef.current = handleResolveBarcodeStudent;

  // Hardware USB barcode scanner listener when Sirkulasi tab is open
  useEffect(() => {
    if (!isStaff || subTab !== 'sirkulasi') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const now = Date.now();
      if (now - keyBufferRef.current.lastTime > 120) {
        keyBufferRef.current.buf = '';
      }
      keyBufferRef.current.lastTime = now;

      if (e.key === 'Enter') {
        const scanned = keyBufferRef.current.buf.trim();
        keyBufferRef.current.buf = '';
        if (scanned.length >= 5) {
          resolveBarcodeStudentRef.current(scanned);
        }
      } else if (e.key.length === 1) {
        keyBufferRef.current.buf += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStaff, subTab, students]);

  const startCameraScanner = async (overrideCamId?: string) => {
    if (isStartingCam) return;
    setIsStartingCam(true);
    try {
      const result = await startHtml5QrScanner({
        elementId: 'perpustakaan-barcode-reader',
        preferredCameraId: overrideCamId || selectedCamId || undefined,
        existingScanner: qrScannerRef.current,
        fps: 16,
        onSuccess: (decodedText) => {
          resolveBarcodeStudentRef.current(decodedText);
          stopCameraScanner();
        },
      });
      qrScannerRef.current = result.scanner;
      if (result.cameras.length > 0) setCameras(result.cameras);
      if (result.activeCameraId) setSelectedCamId(result.activeCameraId);
      setCameraActive(true);
    } catch (err: unknown) {
      setCameraActive(false);
      showToast(`Kamera gagal dibuka: ${formatCameraErrorIndonesian(err)}`, 'error');
    } finally {
      setIsStartingCam(false);
    }
  };

  const handleSwitchSirkulasiCam = (camId: string) => {
    setSelectedCamId(camId);
    if (cameraActive) {
      startCameraScanner(camId);
    }
  };

  // Filtered Catalog Books
  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return books.filter((b) => {
      const matchQuery =
        !q ||
        b.judul.toLowerCase().includes(q) ||
        b.penulis.toLowerCase().includes(q) ||
        b.sumber.toLowerCase().includes(q) ||
        b.kategori.toLowerCase().includes(q) ||
        b.kelas.toLowerCase().includes(q) ||
        (b.file_url || '').toLowerCase().includes(q);
      const matchKelas = filterKelas === 'Semua' || b.kelas === filterKelas || b.kelas === 'Semua';
      const matchKategori = filterKategori === 'Semua' || b.kategori === filterKategori;
      return matchQuery && matchKelas && matchKategori;
    });
  }, [books, searchQuery, filterKelas, filterKategori]);

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => {
      if (b.sumber) set.add(b.sumber);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [books]);

  const searchTabMatchedBooks = useMemo(() => {
    const q = searchTabQuery.trim().toLowerCase();
    return books.filter((b) => {
      const matchQuery =
        !q ||
        b.judul.toLowerCase().includes(q) ||
        b.penulis.toLowerCase().includes(q) ||
        b.sumber.toLowerCase().includes(q) ||
        b.kategori.toLowerCase().includes(q) ||
        b.kelas.toLowerCase().includes(q) ||
        (b.file_url || '').toLowerCase().includes(q);
      const matchKelas = searchTabKelas === 'Semua' || b.kelas === searchTabKelas || b.kelas === 'Semua';
      const matchKategori = searchTabKategori === 'Semua' || b.kategori === searchTabKategori;
      const matchSumber = searchTabSumber === 'Semua' || b.sumber === searchTabSumber;
      return matchQuery && matchKelas && matchKategori && matchSumber;
    });
  }, [books, searchTabQuery, searchTabKelas, searchTabKategori, searchTabSumber]);

  const searchTabMatchedPortals = useMemo(() => {
    const q = searchTabQuery.trim().toLowerCase();
    if (!q) return OFFICIAL_LIBRARY_PORTALS;
    return OFFICIAL_LIBRARY_PORTALS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.url.toLowerCase().includes(q)
    );
  }, [searchTabQuery]);

  const searchTabMatchedLoans = useMemo(() => {
    const q = searchTabQuery.trim().toLowerCase();
    if (!q) return loans.slice(0, 8);
    return loans.filter((l) => {
      if (isStudent && currentStudentRecord) {
        const isMe =
          l.student_id === currentStudentRecord.id ||
          (currentStudentRecord.nisn && l.nisn === currentStudentRecord.nisn) ||
          (currentStudentRecord.barcodeId && l.barcode_id === currentStudentRecord.barcodeId);
        if (!isMe) return false;
      }
      return (
        l.nama_siswa.toLowerCase().includes(q) ||
        l.judul_buku.toLowerCase().includes(q) ||
        l.kelas.toLowerCase().includes(q) ||
        l.barcode_id.toLowerCase().includes(q) ||
        l.nisn.toLowerCase().includes(q)
      );
    });
  }, [loans, searchTabQuery, isStudent, currentStudentRecord]);

  // Available months & classes for Leaderboard filters
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    const currentYm = getLocalTodayStr().slice(0, 7);
    set.add(currentYm);
    literacyLogs.forEach((l) => {
      if (l.bulan_tahun) set.add(l.bulan_tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [literacyLogs]);

  const availableRombels = useMemo(() => {
    const set = new Set<string>(CLASSES_LIST);
    students.forEach((s) => {
      if (s.kelas) set.add(s.kelas);
    });
    literacyLogs.forEach((l) => {
      if (l.kelas) set.add(l.kelas);
    });
    return Array.from(set).sort();
  }, [students, literacyLogs]);

  // Filtered Literacy Logs
  const filteredLiteracyLogs = useMemo(() => {
    return literacyLogs.filter((l) => {
      const matchMonth = filterMonth === 'ALL' || l.bulan_tahun === filterMonth;
      const matchRombel = filterRombel === 'ALL' || l.kelas === filterRombel;
      return matchMonth && matchRombel;
    });
  }, [literacyLogs, filterMonth, filterRombel]);

  // Leaderboard Aggregation (from filtered logs)
  const leaderboard = useMemo(() => {
    const map = new Map<
      string,
      { nisn: string; nama_siswa: string; kelas: string; totalDibaca: number; lastDate: string }
    >();

    filteredLiteracyLogs.forEach((log) => {
      const key = log.nisn || log.nama_siswa;
      if (!key) return;
      const prev = map.get(key);
      if (prev) {
        prev.totalDibaca += 1;
        if (log.tanggal > prev.lastDate) prev.lastDate = log.tanggal;
      } else {
        map.set(key, {
          nisn: log.nisn,
          nama_siswa: log.nama_siswa,
          kelas: log.kelas,
          totalDibaca: 1,
          lastDate: log.tanggal || '',
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.totalDibaca !== a.totalDibaca) return b.totalDibaca - a.totalDibaca;
      return a.nama_siswa.localeCompare(b.nama_siswa, 'id');
    });
  }, [filteredLiteracyLogs]);

  // All-time Personal Literacy Stats for logged-in Student
  const studentPersonalStats = useMemo(() => {
    if (!isStudent) return null;
    const nisn = currentStudentRecord?.nisn || activeUser.studentData?.nisn || '';
    const nama = currentStudentRecord?.nama || activeUser.name || '';
    const allMap = new Map<string, { nisn: string; nama: string; total: number }>();

    literacyLogs.forEach((log) => {
      const key = log.nisn || log.nama_siswa;
      if (!key) return;
      const existing = allMap.get(key);
      if (existing) existing.total += 1;
      else allMap.set(key, { nisn: log.nisn, nama: log.nama_siswa, total: 1 });
    });

    const sortedAll = Array.from(allMap.values()).sort((a, b) =>
      b.total !== a.total ? b.total - a.total : a.nama.localeCompare(b.nama, 'id')
    );

    const myKey = nisn || nama;
    const myIdx = sortedAll.findIndex((item) => (nisn && item.nisn === nisn) || item.nama === nama);
    const totalRead = myIdx >= 0 ? sortedAll[myIdx].total : allMap.get(myKey)?.total || 0;
    const rank = myIdx >= 0 ? myIdx + 1 : null;
    const badge = getLiteracyBadge(totalRead);

    return {
      totalRead,
      rank,
      totalReaders: sortedAll.length,
      badge,
    };
  }, [isStudent, literacyLogs, currentStudentRecord, activeUser]);

  // Open Book in Modal Reader + increment dibaca_count + duplicate-safe log_literasi
  const handleOpenBookReader = async (book: PerpustakaanBook) => {
    setReadingBook(book);

    try {
      await updateDoc(doc(db, 'perpustakaan', book.id), {
        dibaca_count: increment(1),
      });
    } catch (err) {
      console.warn('Gagal memperbarui hitungan baca:', err);
    }

    if (isStudent) {
      const todayStr = getLocalTodayStr();
      const monthStr = todayStr.slice(0, 7);
      const studentNisn = (currentStudentRecord?.nisn || activeUser.studentData?.nisn || activeUser.name || 'siswa')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '');
      const studentName = currentStudentRecord?.nama || activeUser.name;
      const studentKelas = currentStudentRecord?.kelas || activeClass;
      const safeBookId = book.id.replace(/[^a-zA-Z0-9_-]/g, '');
      const logDocId = `${todayStr}_${studentNisn}_${safeBookId}`;

      try {
        const logRef = doc(db, 'log_literasi', logDocId);
        const existing = await getDoc(logRef);
        if (!existing.exists()) {
          await setDoc(logRef, {
            nisn: currentStudentRecord?.nisn || activeUser.studentData?.nisn || studentNisn,
            nama_siswa: studentName,
            kelas: studentKelas,
            buku_id: book.id,
            judul_buku: book.judul,
            kategori_buku: book.kategori,
            waktu_baca: serverTimestamp(),
            tanggal: todayStr,
            bulan_tahun: monthStr,
          });
        }
      } catch (err) {
        console.warn('Gagal mencatat log literasi siswa:', err);
      }
    }
  };

  // Seed initial 6 Kurikulum Merdeka / SIBI books
  const handleSeedInitialBooks = async () => {
    if (!isStaff || isSeeding) return;
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      SEED_LIBRARY_BOOKS.forEach((book) => {
        const ref = doc(collection(db, 'perpustakaan'));
        batch.set(ref, {
          ...book,
          dibaca_count: 0,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      showToast('6 contoh buku Kurikulum Merdeka (SIBI) berhasil dimuat ke perpustakaan!', 'success');
    } catch (err: any) {
      showToast(`Gagal memuat buku contoh: ${err?.message || 'Kendala koneksi'}`, 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleCopyBookUrl = async (url: string, bookKey = 'preview') => {
    const clean = (url || '').trim();
    if (!clean) return;
    try {
      await navigator.clipboard.writeText(clean);
      setCopiedBookUrlId(bookKey);
      showToast('Link URL buku berhasil disalin!', 'success');
      setTimeout(() => {
        setCopiedBookUrlId((prev) => (prev === bookKey ? null : prev));
      }, 2000);
    } catch {
      showToast('Gagal menyalin otomatis. Anda dapat menyalin langsung dari kotak link.', 'error');
    }
  };

  // Add / Edit Book handlers
  const openAddBookModal = () => {
    setEditingBookId(null);
    setFormJudul('');
    setFormPenulis('');
    setFormKategori('Buku Pelajaran');
    setFormKelas('Semua');
    setFormSumber('SIBI Kemendikdasmen');
    setFormCoverUrl('');
    setFormFileUrl('');
    setShowFormBookPreview(false);
    setIsBookModalOpen(true);
  };

  const openEditBookModal = (book: PerpustakaanBook) => {
    setEditingBookId(book.id);
    setFormJudul(book.judul);
    setFormPenulis(book.penulis);
    setFormKategori(book.kategori);
    setFormKelas(book.kelas);
    setFormSumber(book.sumber);
    setFormCoverUrl(book.cover_url);
    setFormFileUrl(book.file_url);
    setShowFormBookPreview(false);
    setIsBookModalOpen(true);
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formJudul.trim() || !formFileUrl.trim()) {
      showToast('Judul buku dan URL File buku wajib diisi!', 'error');
      return;
    }

    setIsSavingBook(true);
    try {
      const payload = {
        judul: sanitizeInput(formJudul, 200),
        penulis: sanitizeInput(formPenulis, 120) || 'Tim Penulis',
        kategori: formKategori,
        kelas: formKelas,
        sumber: sanitizeInput(formSumber, 120) || 'Perpustakaan Digital',
        cover_url: sanitizeInput(formCoverUrl, 1000),
        file_url: sanitizeInput(formFileUrl, 1000),
      };

      if (editingBookId) {
        await updateDoc(doc(db, 'perpustakaan', editingBookId), payload);
        showToast(`Buku "${payload.judul}" berhasil diperbarui.`, 'success');
      } else {
        await addDoc(collection(db, 'perpustakaan'), {
          ...payload,
          dibaca_count: 0,
          createdAt: serverTimestamp(),
        });
        showToast(`Buku "${payload.judul}" berhasil ditambahkan ke katalog!`, 'success');
      }
      setIsBookModalOpen(false);
    } catch (err: any) {
      showToast(mapFirestorePermissionError(err, 'Gagal menyimpan data buku ke Perpustakaan Digital.'), 'error');
    } finally {
      setIsSavingBook(false);
    }
  };

  const handleConfirmDeleteBook = async () => {
    if (!bookToDelete || isDeletingBook) return;
    setIsDeletingBook(true);
    try {
      await deleteDoc(doc(db, 'perpustakaan', bookToDelete.id));
      showToast(`Buku "${bookToDelete.judul}" telah dihapus.`, 'success');
      setBookToDelete(null);
    } catch (err: any) {
      showToast(`Gagal menghapus buku: ${err?.message || 'Kendala Firestore'}`, 'error');
    } finally {
      setIsDeletingBook(false);
    }
  };

  // CSV Template Download & Import
  const handleDownloadTemplateCsv = () => {
    const blob = new Blob(['\uFEFF' + TEMPLATE_PERPUSTAKAAN_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_perpustakaan.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = parseLibraryCsv(content);
      setCsvPreview(parsed);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleCommitCsvImport = async () => {
    if (!csvPreview || csvPreview.validBooks.length === 0 || isImportingCsv) return;
    setIsImportingCsv(true);
    try {
      const items = csvPreview.validBooks;
      for (let i = 0; i < items.length; i += 400) {
        const chunk = items.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((book) => {
          const ref = doc(collection(db, 'perpustakaan'));
          batch.set(ref, {
            ...book,
            dibaca_count: 0,
            createdAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      showToast(`Berhasil mengimpor ${items.length} buku ke katalog Firestore!`, 'success');
      setIsCsvModalOpen(false);
      setCsvPreview(null);
      setCsvFileName('');
    } catch (err: any) {
      showToast(`Gagal mengimpor CSV: ${err?.message || 'Kendala Firestore'}`, 'error');
    } finally {
      setIsImportingCsv(false);
    }
  };

  // Export Leaderboard & Daily Reading Log to CSV
  const handleExportLeaderboardCsv = () => {
    const lines: string[] = [];
    lines.push('REKAP PERINGKAT PEMBACA TERAJIN (DUTA LITERASI)');
    lines.push(`Sekolah;${profile.name}`);
    lines.push(`Periode;${filterMonth === 'ALL' ? 'Semua Waktu' : formatMonthYearLabel(filterMonth)}`);
    lines.push(`Rombel;${filterRombel === 'ALL' ? 'Semua Kelas' : filterRombel}`);
    lines.push('');
    lines.push('Peringkat;NISN;Nama Siswa;Kelas;Jumlah Buku Dibaca;Predikat Literasi;Terakhir Membaca');
    leaderboard.forEach((row, idx) => {
      const badge = getLiteracyBadge(row.totalDibaca).label;
      lines.push(
        `${idx + 1};"${row.nisn}";"${row.nama_siswa.replace(/"/g, '""')}";"${row.kelas}";${row.totalDibaca};"${badge}";"${row.lastDate}"`
      );
    });
    lines.push('');
    lines.push('RIWAYAT LOG BACA HARIAN SISWA');
    lines.push('Tanggal;Bulan;NISN;Nama Siswa;Kelas;Judul Buku;Kategori');
    const sortedLogs = [...filteredLiteracyLogs].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
    sortedLogs.forEach((log) => {
      lines.push(
        `"${log.tanggal}";"${log.bulan_tahun}";"${log.nisn}";"${log.nama_siswa.replace(/"/g, '""')}";"${log.kelas}";"${log.judul_buku.replace(/"/g, '""')}";"${log.kategori_buku}"`
      );
    });

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan_literasi_${filterMonth === 'ALL' ? 'semua' : filterMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('File rekap literasi (.csv) berhasil diunduh.', 'success');
  };

  // Trigger print for either Official Report or Borrowing Card
  const handleTriggerPrint = (mode: 'laporan' | 'kartu') => {
    setPrintMode(mode);
    setTimeout(() => {
      if (mode === 'kartu' && activeBorrowStudent?.barcodeId && printCardCanvasRef.current) {
        renderBarcodeToCanvas(printCardCanvasRef.current, activeBorrowStudent.barcodeId);
      }
      window.print();
    }, 100);
  };

  // Active loans indexed by book ID for Book Card availability status
  const activeLoansByBookId = useMemo(() => {
    const map = new Map<string, PeminjamanPerpustakaanItem[]>();
    loans.forEach((loan) => {
      if (loan.status !== 'Dipinjam' || !loan.buku_id) return;
      const list = map.get(loan.buku_id) || [];
      list.push(loan);
      map.set(loan.buku_id, list);
    });
    return map;
  }, [loans]);

  // Shared helper: Link student's library/attendance barcode to specific book ID in 'pinjaman' collection
  const createPinjamanRecord = async (
    student: Student,
    book: PerpustakaanBook | null,
    manualTitle: string,
    opts?: {
      kodeEksemplar?: string;
      tanggalPinjam?: string;
      tanggalKembaliRencana?: string;
      catatan?: string;
    }
  ): Promise<PeminjamanPerpustakaanItem | null> => {
    const finalBookId = book?.id || 'manual';
    const finalTitle = book ? book.judul : manualTitle.trim();
    if (!finalTitle) {
      showToast('Pilih buku atau tuliskan judul buku yang akan dipinjam!', 'error');
      return null;
    }

    // Prevent duplicate active checkout of the exact same book ID by the same student
    if (book?.id) {
      const alreadyBorrowedByStudent = loans.some(
        (l) =>
          l.status === 'Dipinjam' &&
          l.buku_id === book.id &&
          (l.student_id === student.id ||
            (student.barcodeId && l.barcode_id === student.barcodeId))
      );
      if (alreadyBorrowedByStudent) {
        showToast(`${student.nama} masih aktif meminjam buku "${finalTitle}".`, 'error');
        return null;
      }
    }

    const today = opts?.tanggalPinjam || getLocalTodayStr();
    const dueDate = opts?.tanggalKembaliRencana || addDaysToDate(today, 7);

    const payload = {
      student_id: student.id,
      barcode_id: student.barcodeId,
      nisn: student.nisn,
      nama_siswa: student.nama,
      kelas: student.kelas,
      buku_id: finalBookId,
      judul_buku: finalTitle,
      kode_eksemplar: (opts?.kodeEksemplar || '').trim(),
      tanggal_pinjam: today,
      tanggal_kembali_rencana: dueDate,
      tanggal_dikembalikan: '',
      status: 'Dipinjam' as const,
      petugas: activeUser.name || 'Petugas Perpustakaan',
      catatan: (opts?.catatan || '').trim(),
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, 'pinjaman'), payload);
    return {
      ...payload,
      id: docRef.id,
      sourceCollection: 'pinjaman',
    };
  };

  // Open Barcode Checkout Scanner Modal (from Book Card or Header)
  const openCheckoutScannerForBook = (book: PerpustakaanBook | null) => {
    setCheckoutTargetBook(book);
    setCheckoutBarcodeInput('');
    setCheckoutMatchedStudent(null);
    setCheckoutSuccessLoan(null);
    setCheckoutEksemplar('');
    setCheckoutNote('');
    setCheckoutDueDate(addDaysToDate(getLocalTodayStr(), 7));
    setIsCheckoutModalOpen(true);
  };

  // Resolve scanned barcode inside Checkout Modal and optionally auto-checkout
  const handleCheckoutBarcodeScan = async (rawCode: string, forceCommit = false) => {
    const cleaned = rawCode.trim();
    if (!cleaned) return;

    const q = cleaned.toLowerCase();
    const matched = students.find(
      (s) =>
        (s.barcodeId && s.barcodeId.trim().toLowerCase() === q) ||
        (s.nisn && s.nisn.trim().toLowerCase() === q) ||
        (s.id && s.id.trim().toLowerCase() === q) ||
        (s.nama && s.nama.trim().toLowerCase() === q)
    );

    if (!matched) {
      showToast(`Barcode "${cleaned}" tidak cocok dengan Kartu Absensi siswa mana pun.`, 'error');
      return;
    }

    setCheckoutMatchedStudent(matched);
    setCheckoutBarcodeInput(matched.barcodeId);
    setSelectedBorrowStudentId(matched.id);

    if ((checkoutAutoSubmit || forceCommit) && checkoutTargetBook) {
      setIsSubmittingCheckout(true);
      try {
        const created = await createPinjamanRecord(matched, checkoutTargetBook, checkoutTargetBook.judul, {
          kodeEksemplar: checkoutEksemplar,
          tanggalPinjam: getLocalTodayStr(),
          tanggalKembaliRencana: checkoutDueDate,
          catatan: checkoutNote || 'Checkout via Scan Barcode Kartu',
        });
        if (created) {
          setCheckoutSuccessLoan(created);
          showToast(
            `Berhasil! "${checkoutTargetBook.judul}" dipinjam oleh ${matched.nama} (${matched.barcodeId}).`,
            'success'
          );
        }
      } catch (err: any) {
        showToast(`Gagal menyimpan pinjaman ke Firestore: ${err?.message || 'Kendala jaringan'}`, 'error');
      } finally {
        setIsSubmittingCheckout(false);
      }
    } else {
      showToast(`Kartu terdeteksi: ${matched.nama} (${matched.kelas})`, 'success');
    }
  };

  const checkoutBarcodeRef = useRef(handleCheckoutBarcodeScan);
  checkoutBarcodeRef.current = handleCheckoutBarcodeScan;

  const handleConfirmManualCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutTargetBook) {
      showToast('Pilih buku yang akan dipinjam terlebih dahulu!', 'error');
      return;
    }
    if (!checkoutMatchedStudent) {
      showToast('Scan barcode Kartu Absensi siswa atau pilih siswa terlebih dahulu!', 'error');
      return;
    }
    setIsSubmittingCheckout(true);
    try {
      const created = await createPinjamanRecord(
        checkoutMatchedStudent,
        checkoutTargetBook,
        checkoutTargetBook.judul,
        {
          kodeEksemplar: checkoutEksemplar,
          tanggalPinjam: getLocalTodayStr(),
          tanggalKembaliRencana: checkoutDueDate,
          catatan: checkoutNote || 'Checkout via Scan Barcode Kartu',
        }
      );
      if (created) {
        setCheckoutSuccessLoan(created);
        showToast(
          `Peminjaman "${checkoutTargetBook.judul}" oleh ${checkoutMatchedStudent.nama} tersimpan ke Firestore!`,
          'success'
        );
      }
    } catch (err: any) {
      showToast(`Gagal mencatat pinjaman: ${err?.message || 'Kendala Firestore'}`, 'error');
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  const startCheckoutCamera = async (overrideCamId?: string) => {
    if (isStartingCheckoutCam) return;
    setIsStartingCheckoutCam(true);
    try {
      const result = await startHtml5QrScanner({
        elementId: 'book-checkout-barcode-reader',
        preferredCameraId: overrideCamId || selectedCamId || undefined,
        existingScanner: checkoutQrRef.current,
        fps: 16,
        onSuccess: (decodedText) => {
          stopCheckoutCamera();
          checkoutBarcodeRef.current(decodedText);
        },
      });
      checkoutQrRef.current = result.scanner;
      if (result.cameras.length > 0) setCameras(result.cameras);
      if (result.activeCameraId) setSelectedCamId(result.activeCameraId);
      setCheckoutCamActive(true);
    } catch (err: unknown) {
      setCheckoutCamActive(false);
      showToast(`Kamera gagal dibuka: ${formatCameraErrorIndonesian(err)}`, 'error');
    } finally {
      setIsStartingCheckoutCam(false);
    }
  };

  const handleSwitchCheckoutCam = (camId: string) => {
    setSelectedCamId(camId);
    if (checkoutCamActive) {
      startCheckoutCamera(camId);
    }
  };

  // Hardware USB barcode scanner listener inside Checkout Modal
  useEffect(() => {
    if (!isStaff || !isCheckoutModalOpen) return;

    const handleModalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const now = Date.now();
      if (now - checkoutKeyBufRef.current.lastTime > 120) {
        checkoutKeyBufRef.current.buf = '';
      }
      checkoutKeyBufRef.current.lastTime = now;

      if (e.key === 'Enter') {
        const scanned = checkoutKeyBufRef.current.buf.trim();
        checkoutKeyBufRef.current.buf = '';
        if (scanned.length >= 5) {
          handleCheckoutBarcodeScan(scanned);
        }
      } else if (e.key.length === 1) {
        checkoutKeyBufRef.current.buf += e.key;
      }
    };

    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [isStaff, isCheckoutModalOpen, checkoutTargetBook, checkoutAutoSubmit, checkoutDueDate, checkoutEksemplar, students, loans]);

  // Borrowing (Peminjaman) handlers (Sirkulasi Tab -> writes to 'pinjaman')
  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBorrowStudent) {
      showToast('Scan atau pilih kartu siswa terlebih dahulu!', 'error');
      return;
    }
    const chosenBook = books.find((b) => b.id === borrowBookId) || null;
    const finalTitle = chosenBook ? chosenBook.judul : borrowCustomTitle.trim();
    if (!finalTitle) {
      showToast('Pilih buku dari katalog atau tuliskan judul buku fisik yang dipinjam!', 'error');
      return;
    }

    setIsSavingLoan(true);
    try {
      const created = await createPinjamanRecord(activeBorrowStudent, chosenBook, finalTitle, {
        kodeEksemplar: borrowEksemplar,
        tanggalPinjam: borrowDate || getLocalTodayStr(),
        tanggalKembaliRencana: borrowDueDate || addDaysToDate(getLocalTodayStr(), 7),
        catatan: borrowNote,
      });
      if (created) {
        showToast(`Peminjaman "${finalTitle}" oleh ${activeBorrowStudent.nama} disimpan ke koleksi 'pinjaman'.`, 'success');
        setBorrowBookId('');
        setBorrowCustomTitle('');
        setBorrowEksemplar('');
        setBorrowNote('');
      }
    } catch (err: any) {
      showToast(`Gagal mencatat peminjaman: ${err?.message || 'Kendala Firestore'}`, 'error');
    } finally {
      setIsSavingLoan(false);
    }
  };

  const handleMarkReturned = async (loan: PeminjamanPerpustakaanItem) => {
    const colName = loan.sourceCollection || 'pinjaman';
    try {
      await updateDoc(doc(db, colName, loan.id), {
        status: 'Dikembalikan',
        tanggal_dikembalikan: getLocalTodayStr(),
      });
      showToast(`Buku "${loan.judul_buku}" ditandai sudah dikembalikan.`, 'success');
    } catch (err: any) {
      showToast(`Gagal memperbarui status kembali: ${err?.message || 'Kendala Firestore'}`, 'error');
    }
  };

  const handleConfirmDeleteLoan = async () => {
    if (!loanToDelete) return;
    const colName = loanToDelete.sourceCollection || 'pinjaman';
    try {
      await deleteDoc(doc(db, colName, loanToDelete.id));
      showToast('Catatan peminjaman berhasil dihapus.', 'success');
      setLoanToDelete(null);
    } catch (err: any) {
      showToast(`Gagal menghapus catatan: ${err?.message || 'Kendala Firestore'}`, 'error');
    }
  };

  // Filtered loans table
  const visibleLoans = useMemo(() => {
    const q = loanSearchQuery.trim().toLowerCase();
    return loans.filter((loan) => {
      if (isStudent && currentStudentRecord) {
        const matchesMe =
          loan.student_id === currentStudentRecord.id ||
          (currentStudentRecord.nisn && loan.nisn === currentStudentRecord.nisn) ||
          (currentStudentRecord.barcodeId && loan.barcode_id === currentStudentRecord.barcodeId);
        if (!matchesMe) return false;
      }
      const matchStatus = loanStatusFilter === 'ALL' || loan.status === loanStatusFilter;
      const matchSearch =
        !q ||
        loan.nama_siswa.toLowerCase().includes(q) ||
        loan.judul_buku.toLowerCase().includes(q) ||
        loan.barcode_id.toLowerCase().includes(q) ||
        loan.nisn.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [loans, isStudent, currentStudentRecord, loanStatusFilter, loanSearchQuery]);

  const activeLoansForSelectedStudent = useMemo(() => {
    if (!activeBorrowStudent) return [];
    return loans.filter(
      (l) =>
        l.status === 'Dipinjam' &&
        (l.student_id === activeBorrowStudent.id ||
          (activeBorrowStudent.nisn && l.nisn === activeBorrowStudent.nisn) ||
          (activeBorrowStudent.barcodeId && l.barcode_id === activeBorrowStudent.barcodeId))
    );
  }, [loans, activeBorrowStudent]);

  const matchedStudentsDropdown = useMemo(() => {
    const q = studentSearchInput.trim().toLowerCase();
    const sorted = [...students].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    if (!q) return sorted.slice(0, 40);
    return sorted
      .filter(
        (s) =>
          s.nama.toLowerCase().includes(q) ||
          s.nisn.toLowerCase().includes(q) ||
          s.barcodeId.toLowerCase().includes(q) ||
          s.kelas.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [students, studentSearchInput]);

  const openBookPreviewModal = (book: PerpustakaanBook) => {
    setShowPreviewIframe(isLikelyEmbeddableBookUrl(book.file_url));
    setPreviewBook(book);
  };

  const renderMinimalBookCard = (
    book: PerpustakaanBook,
    mode: 'minimalis' | 'kartu' = catalogViewMode
  ) => {
    const activeBookLoans = activeLoansByBookId.get(book.id) || [];
    const isCheckedOut = activeBookLoans.length > 0;
    const latestLoan = activeBookLoans[0];
    const isMinimal = mode === 'minimalis';

    return (
      <article
        key={book.id}
        className="group bg-white rounded-2xl border border-slate-200/85 hover:border-rose-300 shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
      >
        <div>
          {/* Book Cover Preview Stage (Portrait 3:4 framed on clean neutral stage) */}
          <div
            onClick={() => openBookPreviewModal(book)}
            className={`relative bg-slate-50/90 border-b border-slate-100 flex items-center justify-center cursor-pointer ${
              isMinimal ? 'p-2.5' : 'pt-5 pb-4 px-8'
            }`}
            title="Klik untuk preview buku"
          >
            <div
              className={`relative w-full aspect-[3/4] rounded-lg overflow-hidden shadow-sm border border-slate-200/80 bg-white ${
                isMinimal ? 'max-w-[116px]' : 'max-w-[144px] shadow-md'
              }`}
            >
              <BookCoverImage
                src={book.cover_url}
                fileUrl={book.file_url}
                title={book.judul}
                kategori={book.kategori}
              />
              <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/25 transition-colors flex items-end justify-center p-1.5">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded-lg bg-white/95 text-slate-900 text-[10px] font-bold shadow-xs inline-flex items-center gap-1">
                  <Eye className="w-3 h-3 text-rose-600" />
                  <span>Preview</span>
                </span>
              </div>
            </div>

            {isStaff && (
              <div
                className={`absolute flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ${
                  isMinimal ? 'top-1.5 right-1.5' : 'top-2.5 right-2.5'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => openEditBookModal(book)}
                  title="Edit Buku"
                  className="w-6 h-6 rounded-lg bg-white/95 hover:bg-sky-600 text-slate-600 hover:text-white flex items-center justify-center shadow-xs cursor-pointer transition"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setBookToDelete(book)}
                  title="Hapus Buku"
                  className="w-6 h-6 rounded-lg bg-white/95 hover:bg-rose-600 text-slate-600 hover:text-white flex items-center justify-center shadow-xs cursor-pointer transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Minimalist Typography Body (Zero-Pill) */}
          <div className={isMinimal ? 'p-2.5 space-y-1' : 'p-4 space-y-1.5'}>
            <div
              className={`flex items-center gap-1 font-medium text-slate-500 truncate ${
                isMinimal ? 'text-[10px]' : 'text-[11px] gap-1.5'
              }`}
            >
              <span className="font-semibold text-rose-700 truncate">{book.kategori}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">
                {book.kelas === 'Semua' ? 'Semua Kelas' : `Kelas ${book.kelas}`}
              </span>
            </div>

            <h3
              onClick={() => openBookPreviewModal(book)}
              title={book.judul}
              className={`font-display font-bold text-slate-900 leading-snug line-clamp-2 cursor-pointer group-hover:text-rose-700 transition-colors ${
                isMinimal ? 'text-xs min-h-[2rem]' : 'text-sm'
              }`}
            >
              {book.judul}
            </h3>

            <div
              className={`text-slate-500 flex items-center gap-1 truncate ${
                isMinimal ? 'text-[10px]' : 'text-[11px] gap-1.5'
              }`}
            >
              <span className="truncate">{book.penulis}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums shrink-0">{book.dibaca_count}x</span>
            </div>

            <div
              className={`pt-0.5 flex items-center justify-between gap-1.5 ${
                isMinimal ? 'text-[10px]' : 'pt-1 text-[11px]'
              }`}
            >
              {isCheckedOut ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700 truncate">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    Dipinjam ({activeBookLoans.length})
                    {!isMinimal && latestLoan?.nama_siswa ? ` · ${latestLoan.nama_siswa}` : ''}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>Tersedia</span>
                </span>
              )}

              {!isMinimal && isStaff && isCheckedOut && latestLoan && (
                <button
                  type="button"
                  onClick={() => handleMarkReturned(latestLoan)}
                  className="text-[10px] font-bold text-emerald-700 hover:underline shrink-0 cursor-pointer"
                >
                  Tandai Kembali
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Minimal Single-Row Footer Actions */}
        <div
          className={`border-t border-slate-100 flex items-center gap-1.5 ${
            isMinimal ? 'px-2.5 py-2' : 'px-4 py-3'
          }`}
        >
          <button
            type="button"
            onClick={() => handleOpenBookReader(book)}
            className={`flex-1 rounded-xl bg-slate-900 hover:bg-rose-600 text-white font-display font-bold flex items-center justify-center gap-1 cursor-pointer transition whitespace-nowrap ${
              isMinimal ? 'py-1.5 px-2 text-[11px]' : 'py-2 px-3 text-xs gap-1.5'
            }`}
          >
            <BookOpen className="w-3 h-3 shrink-0" />
            <span>{isMinimal ? 'Baca' : 'Baca Buku'}</span>
          </button>
          <button
            type="button"
            onClick={() => openBookPreviewModal(book)}
            className={`rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-display font-bold flex items-center justify-center cursor-pointer transition whitespace-nowrap ${
              isMinimal ? 'w-7 h-7 p-0' : 'py-2 px-3 text-xs gap-1'
            }`}
            title="Lihat preview sampul & isi buku"
          >
            <Eye className="w-3.5 h-3.5 text-rose-600" />
            {!isMinimal && <span>Preview</span>}
          </button>
          {isStaff && (
            <button
              type="button"
              onClick={() => openCheckoutScannerForBook(book)}
              className={`rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white flex items-center justify-center cursor-pointer transition shrink-0 ${
                isMinimal ? 'w-7 h-7' : 'w-8 h-8'
              }`}
              title="Pinjamkan (Scan Barcode)"
            >
              <QrCode className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className="space-y-6">
      {/* ========================================================= */}
      {/* SCREEN UI (no-print)                                       */}
      {/* ========================================================= */}
      <div className="no-print space-y-6">
        {/* Header & Sub-Tab Switcher */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-rose-100 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-sm shrink-0">
                <Library className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600">
                  {profile.name}
                </div>
                <h1 className="font-display font-black text-xl sm:text-2xl text-slate-900">
                  Perpustakaan Digital &amp; Literasi
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Katalog buku Kurikulum Merdeka, catatan literasi harian, dan kartu peminjaman terintegrasi Kartu Absensi.
                </p>
              </div>
            </div>

            {isStaff && subTab === 'katalog' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openCheckoutScannerForBook(books[0] || null)}
                  className="px-3.5 py-2.5 rounded-2xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900 font-display font-extrabold text-xs flex items-center gap-2 cursor-pointer transition"
                >
                  <QrCode className="w-4 h-4 text-sky-700" />
                  <span>Scan Pinjam (Barcode)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCsvPreview(null);
                    setCsvFileName('');
                    setIsCsvModalOpen(true);
                  }}
                  className="px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-display font-extrabold text-xs flex items-center gap-2 cursor-pointer transition"
                >
                  <Upload className="w-4 h-4 text-sky-600" />
                  <span>Import CSV Katalog</span>
                </button>
                <button
                  type="button"
                  onClick={openAddBookModal}
                  className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs flex items-center gap-2 shadow-sm cursor-pointer transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Tambah Buku</span>
                </button>
              </div>
            )}
          </div>

          {/* Sub-Tabs */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setSubTab('katalog')}
              className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                subTab === 'katalog'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Katalog Buku</span>
              <span className="font-mono text-[11px] opacity-80 tabular-nums">({books.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('pencarian')}
              className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                subTab === 'pencarian'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Pencarian Koleksi</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('literasi')}
              className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                subTab === 'literasi'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>Pembaca Terajin (Duta Literasi)</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('sirkulasi')}
              className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                subTab === 'sirkulasi'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>Kartu Peminjaman (Kartu Absensi)</span>
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* SUB-TAB 1: KATALOG BUKU                                   */}
        {/* ========================================================= */}
        {subTab === 'katalog' && (
          <div className="space-y-5">
            {/* Personal Literacy Progress Banner (Student Login Only) */}
            {isStudent && studentPersonalStats && (
              <div className="bg-gradient-to-r from-amber-50 via-white to-rose-50 rounded-3xl p-5 border border-amber-200 shadow-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Award className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-wider text-amber-700">
                        Progres Literasi Pribadi
                      </div>
                      <h2 className="font-display font-black text-base sm:text-lg text-slate-900">
                        {currentStudentRecord?.nama || activeUser.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-0.5">
                        <span>
                          Total Dibaca:{' '}
                          <strong className="font-mono text-slate-900 tabular-nums">
                            {studentPersonalStats.totalRead}
                          </strong>{' '}
                          buku
                        </span>
                        <span>·</span>
                        <span>
                          Peringkat:{' '}
                          <strong className="font-mono text-rose-700 tabular-nums">
                            {studentPersonalStats.rank ? `#${studentPersonalStats.rank}` : 'Belum tercatat'}
                          </strong>
                        </span>
                        <span>·</span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[11px] font-extrabold ${studentPersonalStats.badge.badgeStyle}`}
                        >
                          {studentPersonalStats.badge.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {studentPersonalStats.badge.nextLabel && studentPersonalStats.badge.nextTarget && (
                    <div className="w-full md:w-64 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <span>Menuju {studentPersonalStats.badge.nextLabel}</span>
                        <span className="font-mono tabular-nums">
                          {studentPersonalStats.totalRead}/{studentPersonalStats.badge.nextTarget}
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round((studentPersonalStats.totalRead / studentPersonalStats.badge.nextTarget) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Official Free Portals Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {OFFICIAL_LIBRARY_PORTALS.map((portal) => (
                <a
                  key={portal.name}
                  href={portal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded-2xl border p-3.5 flex items-center justify-between gap-3 transition shadow-2xs ${portal.accent}`}
                >
                  <div className="min-w-0">
                    <div className="font-display font-black text-xs sm:text-sm truncate">{portal.name}</div>
                    <div className="text-[11px] opacity-80 truncate">{portal.subtitle}</div>
                  </div>
                  <ExternalLink className="w-4 h-4 shrink-0 opacity-75" />
                </a>
              ))}
            </div>

            {/* Search, Filters & View/Pagination Controls */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-6 relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari judul buku, penulis, atau sumber..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-rose-500 outline-none text-xs sm:text-sm font-semibold text-slate-800"
                  />
                </div>

                <div className="md:col-span-3">
                  <select
                    value={filterKelas}
                    onChange={(e) => setFilterKelas(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-rose-500 outline-none text-xs sm:text-sm font-bold text-slate-700"
                  >
                    {KELAS_OPTIONS.map((kls) => (
                      <option key={kls} value={kls}>
                        {kls === 'Semua' ? 'Semua Kelas (1–6)' : `Kelas ${kls}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <select
                    value={filterKategori}
                    onChange={(e) => setFilterKategori(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-rose-500 outline-none text-xs sm:text-sm font-bold text-slate-700"
                  >
                    <option value="Semua">Semua Kategori</option>
                    {KATEGORI_OPTIONS.map((kat) => (
                      <option key={kat} value={kat}>
                        {kat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setCatalogViewMode('minimalis')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                      catalogViewMode === 'minimalis'
                        ? 'bg-white text-rose-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Grid3X3 className="w-3.5 h-3.5" />
                    <span>Mode Minimalis</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogViewMode('kartu')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                      catalogViewMode === 'kartu'
                        ? 'bg-white text-rose-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Mode Kartu</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <label htmlFor="perpus-items-per-page" className="font-bold text-slate-600">
                    Tampilkan:
                  </label>
                  <select
                    id="perpus-items-per-page"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value) as 10 | 20 | 30 | 50)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value={10}>10 Buku</option>
                    <option value={20}>20 Buku</option>
                    <option value={30}>30 Buku</option>
                    <option value={50}>50 Buku</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Seeder Empty State or Book Grid */}
            {booksLoaded && books.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 sm:p-10 border border-dashed border-rose-300 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <BookMarked className="w-7 h-7" />
                </div>
                <div className="max-w-lg mx-auto space-y-1.5">
                  <h3 className="font-display font-black text-lg text-slate-900">
                    Katalog Perpustakaan Digital Masih Kosong
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500">
                    {isStaff
                      ? 'Mulai dengan memuat 6 contoh buku resmi Kurikulum Merdeka (SIBI & Budi Bahasa) termasuk buku PJOK Kelas 6, atau tambahkan buku melalui tombol "+ Tambah Buku" dan "Import CSV".'
                      : 'Admin atau Guru belum menambahkan koleksi buku ke perpustakaan digital.'}
                  </p>
                </div>
                {isStaff && (
                  <button
                    type="button"
                    disabled={isSeeding}
                    onClick={handleSeedInitialBooks}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-display font-extrabold text-xs sm:text-sm shadow-sm cursor-pointer transition"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {isSeeding
                        ? 'Memuat Buku Contoh...'
                        : 'Muat 6 Contoh Buku Kurikulum Merdeka (SIBI)'}
                    </span>
                  </button>
                )}
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center text-sm text-slate-500">
                Tidak ada buku yang cocok dengan kata kunci atau filter kelas/kategori tersebut.
              </div>
            ) : (() => {
              const totalBooks = filteredBooks.length;
              const totalPages = Math.max(1, Math.ceil(totalBooks / itemsPerPage));
              const safePage = Math.min(Math.max(1, currentPage), totalPages);
              const startIndex = (safePage - 1) * itemsPerPage;
              const endIndex = Math.min(startIndex + itemsPerPage, totalBooks);
              const paginatedBooks = filteredBooks.slice(startIndex, endIndex);

              const pageNumbers: Array<number | 'ellipsis'> = [];
              if (totalPages <= 7) {
                for (let p = 1; p <= totalPages; p++) pageNumbers.push(p);
              } else {
                pageNumbers.push(1);
                if (safePage > 3) pageNumbers.push('ellipsis');
                const winStart = Math.max(2, safePage - 1);
                const winEnd = Math.min(totalPages - 1, safePage + 1);
                for (let p = winStart; p <= winEnd; p++) pageNumbers.push(p);
                if (safePage < totalPages - 2) pageNumbers.push('ellipsis');
                pageNumbers.push(totalPages);
              }

              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
                    <span className="font-semibold tabular-nums">
                      Menampilkan <strong>{startIndex + 1}–{endIndex}</strong> dari{' '}
                      <strong>{totalBooks}</strong> buku
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      Halaman {safePage} / {totalPages}
                    </span>
                  </div>

                  <div
                    className={
                      catalogViewMode === 'minimalis'
                        ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3'
                        : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'
                    }
                  >
                    {paginatedBooks.map((book) => renderMinimalBookCard(book, catalogViewMode))}
                  </div>

                  {totalPages > 1 && (
                    <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-40 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Sebelumnya</span>
                      </button>

                      <div className="flex flex-wrap items-center gap-1">
                        {pageNumbers.map((item, idx) =>
                          item === 'ellipsis' ? (
                            <span key={`el_${idx}`} className="px-2 text-xs text-slate-400">
                              ...
                            </span>
                          ) : (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setCurrentPage(item)}
                              className={`min-w-[32px] h-8 px-2 rounded-xl font-mono text-xs font-bold cursor-pointer transition tabular-nums ${
                                item === safePage
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'bg-slate-50 hover:bg-rose-50 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {item}
                            </button>
                          )
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-40 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                      >
                        <span>Berikutnya</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ========================================================= */}
        {/* SUB-TAB 1B: PENCARIAN KOLEKSI PERPUSTAKAAN DIGITAL        */}
        {/* ========================================================= */}
        {subTab === 'pencarian' && (
          <div className="space-y-5">
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-rose-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-rose-600">
                    Mesin Pencari Perpustakaan Digital
                  </span>
                  <h2 className="font-display font-black text-lg text-slate-900 flex items-center gap-2 mt-0.5">
                    <Search className="w-5 h-5 text-rose-600" /> Cari Buku, Sumber Resmi, URL &amp; Riwayat Pinjaman
                  </h2>
                </div>
                {(searchTabQuery || searchTabKelas !== 'Semua' || searchTabKategori !== 'Semua' || searchTabSumber !== 'Semua') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTabQuery('');
                      setSearchTabKelas('Semua');
                      setSearchTabKategori('Semua');
                      setSearchTabSumber('Semua');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset Pencarian
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-5 relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-rose-500" />
                  <input
                    type="text"
                    value={searchTabQuery}
                    onChange={(e) => setSearchTabQuery(e.target.value)}
                    placeholder="Ketik judul, penulis, mata pelajaran, URL, atau nama peminjam..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-rose-200 bg-rose-50/30 focus:bg-white focus:border-rose-500 outline-none text-xs sm:text-sm font-bold text-slate-800"
                  />
                </div>
                <div className="md:col-span-2">
                  <select
                    value={searchTabKelas}
                    onChange={(e) => setSearchTabKelas(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none"
                  >
                    {KELAS_OPTIONS.map((kls) => (
                      <option key={kls} value={kls}>
                        {kls === 'Semua' ? 'Semua Kelas' : `Kelas ${kls}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <select
                    value={searchTabKategori}
                    onChange={(e) => setSearchTabKategori(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="Semua">Semua Kategori</option>
                    {KATEGORI_OPTIONS.map((kat) => (
                      <option key={kat} value={kat}>
                        {kat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <select
                    value={searchTabSumber}
                    onChange={(e) => setSearchTabSumber(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="Semua">Semua Sumber</option>
                    {availableSources.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Topic Keywords */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Kata kunci cepat:</span>
                {['Matematika', 'Bahasa Indonesia', 'IPAS', 'Pancasila', 'PJOK', 'Cerita', 'Kelas 6'].map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => setSearchTabQuery(kw)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition cursor-pointer ${
                      searchTabQuery.toLowerCase() === kw.toLowerCase()
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-50 hover:bg-rose-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Result Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Buku Digital Ditemukan</span>
                <span className="font-mono font-black text-base text-rose-700">{searchTabMatchedBooks.length}</span>
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Portal Resmi Cocok</span>
                <span className="font-mono font-black text-base text-sky-700">{searchTabMatchedPortals.length}</span>
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Data Sirkulasi / Pinjaman</span>
                <span className="font-mono font-black text-base text-amber-700">{searchTabMatchedLoans.length}</span>
              </div>
            </div>

            {/* Section A: Matched Books */}
            <div className="space-y-3">
              <h3 className="font-display font-black text-sm text-slate-800 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-rose-600" />
                Hasil Pencarian Koleksi Buku Digital ({searchTabMatchedBooks.length})
              </h3>
              {searchTabMatchedBooks.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center text-xs text-slate-500 italic">
                  Tidak ditemukan buku digital yang sesuai dengan kata kunci &ldquo;{searchTabQuery || 'filter terpilih'}&rdquo;.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {searchTabMatchedBooks.map((book) => renderMinimalBookCard(book))}
                </div>
              )}
            </div>

            {/* Section B: Matched Official Portals */}
            {searchTabMatchedPortals.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-display font-black text-sm text-slate-800 flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-sky-600" />
                  Portal Sumber Resmi Kemendikbud ({searchTabMatchedPortals.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {searchTabMatchedPortals.map((portal) => (
                    <a
                      key={portal.name}
                      href={portal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`rounded-2xl border p-3.5 flex items-center justify-between gap-3 transition shadow-2xs ${portal.accent}`}
                    >
                      <div className="min-w-0">
                        <div className="font-display font-black text-xs sm:text-sm truncate">{portal.name}</div>
                        <div className="text-[11px] opacity-80 truncate">{portal.subtitle}</div>
                      </div>
                      <ExternalLink className="w-4 h-4 shrink-0 opacity-75" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Section C: Matched Loan History */}
            {searchTabMatchedLoans.length > 0 && (
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
                <h3 className="font-display font-black text-sm text-slate-800 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-amber-600" />
                  Catatan Peminjaman Terkait ({searchTabMatchedLoans.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-black uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Siswa</th>
                        <th className="p-2.5">Kelas</th>
                        <th className="p-2.5">Judul Buku</th>
                        <th className="p-2.5">Tgl Pinjam</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {searchTabMatchedLoans.slice(0, 12).map((loan) => (
                        <tr key={loan.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">{loan.nama_siswa}</td>
                          <td className="p-2.5 text-slate-600">{loan.kelas}</td>
                          <td className="p-2.5 font-medium text-slate-800">{loan.judul_buku}</td>
                          <td className="p-2.5 font-mono text-[11px] text-slate-500">{loan.tanggal_pinjam}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                                loan.status === 'Dipinjam'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {loan.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* SUB-TAB 2: PEMBACA TERAJIN (DUTA LITERASI)                */}
        {/* ========================================================= */}
        {subTab === 'literasi' && (
          <div className="space-y-5">
            {/* Filters & Admin/Guru Export Actions */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                    Filter Bulan / Tahun
                  </label>
                  <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800"
                  >
                    <option value="ALL">Semua Waktu</option>
                    {availableMonths.map((ym) => (
                      <option key={ym} value={ym}>
                        {formatMonthYearLabel(ym)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                    Filter Kelas / Rombel
                  </label>
                  <select
                    value={filterRombel}
                    onChange={(e) => setFilterRombel(e.target.value)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800"
                  >
                    <option value="ALL">Semua Kelas</option>
                    {availableRombels.map((r) => (
                      <option key={r} value={r}>
                        Kelas {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isStaff && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportLeaderboardCsv}
                    className="px-3.5 py-2.5 rounded-2xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-display font-extrabold text-xs flex items-center gap-2 cursor-pointer transition"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    <span>Export Excel (.csv)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTriggerPrint('laporan')}
                    className="px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-display font-extrabold text-xs flex items-center gap-2 cursor-pointer transition"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Cetak Laporan PDF</span>
                  </button>
                </div>
              )}
            </div>

            {/* Podium Top 3 */}
            {leaderboard.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {leaderboard.slice(0, 3).map((entry, idx) => {
                  const rank = idx + 1;
                  const badge = getLiteracyBadge(entry.totalDibaca);
                  const styles =
                    rank === 1
                      ? 'bg-gradient-to-br from-amber-50 via-white to-yellow-50 border-amber-300'
                      : rank === 2
                      ? 'bg-gradient-to-br from-slate-50 via-white to-slate-100 border-slate-300'
                      : 'bg-gradient-to-br from-orange-50 via-white to-amber-50 border-orange-200';
                  const iconBox =
                    rank === 1
                      ? 'bg-amber-500 text-white'
                      : rank === 2
                      ? 'bg-slate-500 text-white'
                      : 'bg-orange-600 text-white';

                  return (
                    <div
                      key={`${entry.nisn}_${entry.nama_siswa}`}
                      className={`rounded-3xl p-5 border shadow-xs flex items-center gap-4 ${styles}`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${iconBox}`}>
                        {rank === 1 ? <Crown className="w-6 h-6" /> : <Medal className="w-6 h-6" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                          Peringkat #{rank} · {entry.kelas || '-'}
                        </div>
                        <div className="font-display font-black text-base text-slate-900 truncate">
                          {entry.nama_siswa}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1.5">
                          <span className="font-mono font-black text-sm text-slate-800 tabular-nums">
                            {entry.totalDibaca} buku
                          </span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${badge.badgeStyle}`}>
                            {badge.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full Leaderboard Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-black text-base text-slate-900">
                    Tabel Peringkat Pembaca Terajin
                  </h3>
                  <p className="text-xs text-slate-500">
                    Lencana otomatis: Pemula Literasi (1–4) · Sahabat Buku (5–14) · Bintang Literasi (15–29) · Duta Literasi Sekolah (≥30)
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-slate-600 tabular-nums">
                  {leaderboard.length} siswa aktif membaca
                </span>
              </div>

              {leaderboard.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Belum ada catatan aktivitas baca siswa pada periode dan kelas yang dipilih.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 text-slate-600 font-bold text-xs uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 w-16">No</th>
                        <th className="py-3 px-4">Nama Siswa</th>
                        <th className="py-3 px-4">NISN</th>
                        <th className="py-3 px-4">Kelas</th>
                        <th className="py-3 px-4 text-right">Buku Dibaca</th>
                        <th className="py-3 px-4">Lencana Literasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaderboard.map((row, idx) => {
                        const badge = getLiteracyBadge(row.totalDibaca);
                        return (
                          <tr key={`${row.nisn}_${row.nama_siswa}`} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4 font-mono font-black text-slate-700 tabular-nums">
                              #{idx + 1}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">{row.nama_siswa}</td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-600">{row.nisn || '-'}</td>
                            <td className="py-3 px-4 font-bold text-slate-700">{row.kelas || '-'}</td>
                            <td className="py-3 px-4 text-right font-mono font-black text-slate-900 tabular-nums">
                              {row.totalDibaca}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-block text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border ${badge.badgeStyle}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUB-TAB 3: KARTU PEMINJAMAN (KARTU ABSENSI BARCODE)       */}
        {/* ========================================================= */}
        {subTab === 'sirkulasi' && (
          <div className="space-y-6">
            {/* Staff Scanner & Student Selector */}
            {isStaff && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Barcode Scanner Box */}
                <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                        <QrCode className="w-5 h-5 text-sky-700" />
                        <span>Scan Kartu Absensi Siswa</span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        Gunakan kartu barcode absensi siswa untuk membuka kartu peminjaman perpustakaan.
                      </p>
                    </div>
                  </div>

                  {/* Camera device selector (always available even while active for live switching) */}
                  {cameras.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <SwitchCamera className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <select
                        value={selectedCamId}
                        onChange={(e) => handleSwitchSirkulasiCam(e.target.value)}
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700"
                      >
                        {cameras.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => refreshDeviceCameras(selectedCamId)}
                        className="p-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer shrink-0"
                        title="Sinkronkan daftar kamera perangkat"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Camera Region */}
                  <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 relative min-h-[210px] flex flex-col items-center justify-center">
                    <div
                      id="perpustakaan-barcode-reader"
                      className={`w-full ${cameraActive || isStartingCam ? 'block' : 'hidden'}`}
                    />
                    {!cameraActive && !isStartingCam && (
                      <div className="p-5 text-center space-y-3 text-white">
                        <Camera className="w-8 h-8 mx-auto text-sky-400" />
                        <p className="text-xs text-slate-300">
                          Arahkan kamera ke barcode di Kartu Absensi Siswa, atau gunakan scanner USB / pilih manual.
                        </p>
                        <div>
                          <button
                            type="button"
                            disabled={isStartingCam}
                            onClick={() => startCameraScanner()}
                            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-display font-extrabold text-xs inline-flex items-center gap-2 cursor-pointer"
                          >
                            <Camera className="w-4 h-4" />
                            <span>Buka Kamera Scanner</span>
                          </button>
                        </div>
                      </div>
                    )}
                    {isStartingCam && (
                      <div className="p-4 text-center text-xs text-sky-300 font-bold">
                        Menghubungkan kamera perangkat...
                      </div>
                    )}
                    {cameraActive && (
                      <button
                        type="button"
                        onClick={stopCameraScanner}
                        className="absolute bottom-3 right-3 z-20 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <VideoOff className="w-3.5 h-3.5" /> Matikan Kamera
                      </button>
                    )}
                  </div>

                  {/* Manual Input / Search Student */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-100">
                    <label className="block text-xs font-bold text-slate-700">
                      Cari Nama / NISN / Scan Kode Kartu (cth: RBU21-6A-001)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={studentSearchInput}
                        onChange={(e) => setStudentSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleResolveBarcodeStudent(studentSearchInput);
                          }
                        }}
                        placeholder="Ketik nama, NISN, atau kode kartu..."
                        className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-600 outline-none text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => handleResolveBarcodeStudent(studentSearchInput)}
                        className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                      >
                        Cari
                      </button>
                    </div>

                    <select
                      value={selectedBorrowStudentId}
                      onChange={(e) => setSelectedBorrowStudentId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                    >
                      <option value="">-- Pilih Siswa untuk Kartu Peminjaman --</option>
                      {matchedStudentsDropdown.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nama} ({s.kelas}) — {s.barcodeId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* New Loan Recording Form */}
                <div className="lg:col-span-7 bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-emerald-600" />
                      <span>Catat Peminjaman Buku</span>
                    </h3>
                    {activeBorrowStudent && (
                      <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-xl border border-sky-200">
                        Anggota: {activeBorrowStudent.nama} ({activeBorrowStudent.kelas})
                      </span>
                    )}
                  </div>

                  <form onSubmit={handleCreateLoan} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                    <div className="sm:col-span-2">
                      <label className="font-bold text-slate-700 block mb-1">Pilih Buku dari Katalog</label>
                      <select
                        value={borrowBookId}
                        onChange={(e) => {
                          setBorrowBookId(e.target.value);
                          if (e.target.value) setBorrowCustomTitle('');
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-800"
                      >
                        <option value="">-- Pilih Buku Katalog atau Ketik Manual di Bawah --</option>
                        {books.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.judul} ({b.kelas === 'Semua' ? 'Semua Kelas' : `Kelas ${b.kelas}`})
                          </option>
                        ))}
                      </select>
                    </div>

                    {!borrowBookId && (
                      <div className="sm:col-span-2">
                        <label className="font-bold text-slate-700 block mb-1">
                          Atau Judul Buku Perpustakaan Fisik (Manual)
                        </label>
                        <input
                          type="text"
                          value={borrowCustomTitle}
                          onChange={(e) => setBorrowCustomTitle(e.target.value)}
                          placeholder="Cth: Cerita Rakyat Nusantara Jilid 2"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
                        />
                      </div>
                    )}

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Kode Eksemplar / Inventaris</label>
                      <input
                        type="text"
                        value={borrowEksemplar}
                        onChange={(e) => setBorrowEksemplar(e.target.value)}
                        placeholder="Opsional, cth: INV-PERPUS-014"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-mono"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Catatan Kondisi Buku</label>
                      <input
                        type="text"
                        value={borrowNote}
                        onChange={(e) => setBorrowNote(e.target.value)}
                        placeholder="Baik / sampul utuh"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Tanggal Pinjam</label>
                      <input
                        type="date"
                        value={borrowDate}
                        onChange={(e) => setBorrowDate(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-mono"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Batas Pengembalian</label>
                      <input
                        type="date"
                        value={borrowDueDate}
                        onChange={(e) => setBorrowDueDate(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2 flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={isSavingLoan || !activeBorrowStudent}
                        className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-display font-extrabold text-xs flex items-center gap-2 cursor-pointer transition"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isSavingLoan ? 'Menyimpan...' : 'Simpan Peminjaman ke Kartu'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Visual Integrated Kartu Peminjaman Perpustakaan (using Kartu Absensi Barcode) */}
            {activeBorrowStudent ? (
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display font-black text-base text-slate-900">
                      Kartu Peminjaman Perpustakaan (Terintegrasi Kartu Absensi)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Menggunakan barcode resmi yang sama dengan Kartu Absensi siswa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTriggerPrint('kartu')}
                    className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Cetak Kartu Peminjaman</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  {/* Card Visual */}
                  <div className="lg:col-span-5 bg-white rounded-3xl p-5 border-2 border-slate-300 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b-2 border-rose-500">
                      <img
                        src={profile.logoKemendikbudUrl}
                        alt="Logo Kemendikbud"
                        className="w-10 h-10 object-contain bg-white rounded-xl border border-slate-200 p-0.5"
                      />
                      <div className="text-center px-1">
                        <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider block">
                          KARTU PEMINJAMAN PERPUSTAKAAN
                        </span>
                        <div className="font-display font-black text-xs text-slate-900 leading-tight">
                          {profile.name}
                        </div>
                        <span className="text-[9px] text-slate-500 font-semibold block">
                          Terintegrasi Kartu Absensi
                        </span>
                      </div>
                      <img
                        src={profile.logoSekolahUrl}
                        alt="Logo Sekolah"
                        className="w-10 h-10 object-contain bg-white rounded-xl border border-slate-200 p-0.5"
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      <img
                        src={activeBorrowStudent.fotoUrl}
                        alt={activeBorrowStudent.nama}
                        onClick={() => onOpenZoom(activeBorrowStudent.fotoUrl, activeBorrowStudent.nama)}
                        className="w-16 h-20 rounded-xl object-cover border-2 border-slate-300 cursor-zoom-in shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-1 text-xs">
                        <div className="font-display font-black text-sm text-slate-900 truncate">
                          {activeBorrowStudent.nama}
                        </div>
                        <div className="text-slate-600">
                          NISN: <span className="font-mono font-bold">{activeBorrowStudent.nisn}</span>
                        </div>
                        <div className="text-slate-600">
                          Kelas: <strong>{activeBorrowStudent.kelas}</strong>
                        </div>
                        <div className="text-slate-600">
                          Pinjaman Aktif:{' '}
                          <strong className="font-mono text-rose-700 tabular-nums">
                            {activeLoansForSelectedStudent.length} buku
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-col items-center justify-center bg-white rounded-2xl p-2">
                      <canvas ref={cardCanvasRef} className="max-w-full h-auto" />
                    </div>
                  </div>

                  {/* Active Loans Summary on Card */}
                  <div className="lg:col-span-7 bg-slate-50 rounded-3xl p-4 sm:p-5 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-display font-black text-sm text-slate-900">
                        Buku yang Sedang Dipinjam ({activeLoansForSelectedStudent.length})
                      </h4>
                      <span className="font-mono text-[11px] font-bold text-slate-500">
                        ID Kartu: {activeBorrowStudent.barcodeId}
                      </span>
                    </div>

                    {activeLoansForSelectedStudent.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">
                        Tidak ada tanggungan buku yang sedang dipinjam saat ini.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {activeLoansForSelectedStudent.map((item) => (
                          <div
                            key={item.id}
                            className="bg-white rounded-2xl p-3.5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="font-display font-black text-xs sm:text-sm text-slate-900 truncate">
                                {item.judul_buku}
                              </div>
                              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2">
                                {item.kode_eksemplar && <span className="font-mono">{item.kode_eksemplar}</span>}
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="w-3 h-3" /> Pinjam: {item.tanggal_pinjam}
                                </span>
                                <span>·</span>
                                <span>Kembali: {item.tanggal_kembali_rencana}</span>
                              </div>
                            </div>
                            {isStaff && (
                              <button
                                type="button"
                                onClick={() => handleMarkReturned(item)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 cursor-pointer flex items-center gap-1.5"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Kembalikan</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              isStaff && (
                <div className="bg-white rounded-3xl p-6 border border-dashed border-sky-300 text-center text-xs sm:text-sm text-slate-600">
                  Scan barcode Kartu Absensi siswa atau pilih siswa dari daftar di atas untuk melihat Kartu Peminjaman Perpustakaan dan mencatat peminjaman buku.
                </div>
              )
            )}

            {/* Loan History Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="font-display font-black text-base text-slate-900">
                  Riwayat Peminjaman &amp; Pengembalian Buku
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={loanSearchQuery}
                    onChange={(e) => setLoanSearchQuery(e.target.value)}
                    placeholder="Cari peminjam / judul..."
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold"
                  />
                  <select
                    value={loanStatusFilter}
                    onChange={(e) => setLoanStatusFilter(e.target.value as any)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="Dipinjam">Sedang Dipinjam</option>
                    <option value="Dikembalikan">Sudah Dikembalikan</option>
                  </select>
                </div>
              </div>

              {visibleLoans.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Belum ada data transaksi peminjaman buku.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Siswa / Kartu</th>
                        <th className="py-3 px-4">Judul Buku</th>
                        <th className="py-3 px-4">Tgl Pinjam</th>
                        <th className="py-3 px-4">Batas Kembali</th>
                        <th className="py-3 px-4">Status</th>
                        {isStaff && <th className="py-3 px-4 text-right">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleLoans.map((loan) => (
                        <tr key={loan.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{loan.nama_siswa}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {loan.kelas} · {loan.barcode_id}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800">{loan.judul_buku}</div>
                            {loan.kode_eksemplar && (
                              <div className="text-[11px] font-mono text-slate-500">{loan.kode_eksemplar}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">{loan.tanggal_pinjam}</td>
                          <td className="py-3 px-4 font-mono text-slate-700">{loan.tanggal_kembali_rencana}</td>
                          <td className="py-3 px-4">
                            {loan.status === 'Dipinjam' ? (
                              <span className="inline-block px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-bold">
                                Dipinjam
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                                Dikembalikan ({loan.tanggal_dikembalikan || '-'})
                              </span>
                            )}
                          </td>
                          {isStaff && (
                            <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                              {loan.status === 'Dipinjam' && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkReturned(loan)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                                >
                                  Kembalikan
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setLoanToDelete(loan)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 font-bold cursor-pointer"
                              >
                                Hapus
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODAL PREVIEW COVER BUKU & LINK URL BUKU                  */}
      {/* ========================================================= */}
      {previewBook && (() => {
        const resolvedCover = resolveBookCoverUrl(previewBook.cover_url, previewBook.file_url);
        const embedUrl = convertToEmbedUrl(previewBook.file_url);
        const activeBookLoans = activeLoansByBookId.get(previewBook.id) || [];

        return (
          <div className="fixed inset-0 z-[945] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 no-print overflow-y-auto">
            <div className="bg-white max-w-3xl w-full rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-5 my-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wider text-rose-600">
                      Preview Cover &amp; Link URL Buku Digital
                    </div>
                    <h3 className="font-display font-black text-base sm:text-lg text-slate-900 truncate">
                      {previewBook.judul}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewBook(null)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                {/* Left: High-res Book Cover Preview */}
                <div className="md:col-span-5 space-y-2.5">
                  <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-100 shadow-sm">
                    <BookCoverImage
                      src={previewBook.cover_url}
                      fileUrl={previewBook.file_url}
                      title={previewBook.judul}
                      kategori={previewBook.kategori}
                    />
                  </div>
                  {resolvedCover && (
                    <button
                      type="button"
                      onClick={() => onOpenZoom(resolvedCover, `Cover: ${previewBook.judul}`)}
                      className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <Eye className="w-3.5 h-3.5 text-rose-600" />
                      <span>Perbesar Gambar Sampul</span>
                    </button>
                  )}
                </div>

                {/* Right: Metadata & Link URL Controls */}
                <div className="md:col-span-7 space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-black">
                        {previewBook.kategori}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-extrabold">
                        {previewBook.kelas === 'Semua' ? 'Semua Kelas (1–6)' : `Kelas ${previewBook.kelas}`}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                          activeBookLoans.length > 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {activeBookLoans.length > 0 ? `Dipinjam (${activeBookLoans.length})` : 'Tersedia'}
                      </span>
                    </div>
                    <h4 className="font-display font-black text-lg text-slate-900 leading-snug pt-1">
                      {previewBook.judul}
                    </h4>
                    <p className="text-xs text-slate-600 font-semibold">
                      Penulis: <strong className="text-slate-800">{previewBook.penulis}</strong> · Sumber:{' '}
                      <strong className="text-slate-800">{previewBook.sumber}</strong>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Telah dibaca <strong className="font-mono text-slate-700">{previewBook.dibaca_count}</strong> kali di Perpustakaan Digital.
                    </p>
                  </div>

                  {/* Link URL Buku Panel */}
                  <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase text-sky-900 flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-sky-600" /> Link URL Buku Digital
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyBookUrl(previewBook.file_url, `modal_${previewBook.id}`)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-sky-100 border border-sky-200 text-sky-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                        >
                          {copiedBookUrlId === `modal_${previewBook.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" /> Tersalin
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Salin Link
                            </>
                          )}
                        </button>
                        <a
                          href={previewBook.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold flex items-center gap-1 transition"
                        >
                          <ExternalLink className="w-3 h-3" /> Buka URL
                        </a>
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-white border border-sky-100 text-[11px] font-mono text-slate-700 break-all select-all">
                      {previewBook.file_url}
                    </div>

                    {resolvedCover && (
                      <div className="text-[10px] text-slate-500 break-all">
                        <strong className="text-slate-700">Link URL Cover:</strong>{' '}
                        <span className="font-mono">{resolvedCover}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const target = previewBook;
                        setPreviewBook(null);
                        handleOpenBookReader(target);
                      }}
                      className="flex-1 py-2.5 px-4 rounded-2xl bg-slate-900 hover:bg-rose-600 text-white font-display font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Baca Buku Sekarang</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPreviewIframe((v) => !v)}
                      className="py-2.5 px-4 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-display font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <Eye className="w-4 h-4 text-sky-600" />
                      <span>{showPreviewIframe ? 'Tutup Mini Preview' : 'Preview Isi Link'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Optional Inline Iframe Preview of the Book Link URL */}
              {showPreviewIframe && embedUrl && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Pratinjau langsung dari URL buku (<span className="font-mono">{embedUrl}</span>)
                    </span>
                    <a
                      href={previewBook.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-700 font-bold hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Buka Layar Penuh
                    </a>
                  </div>
                  <iframe
                    src={embedUrl}
                    title={`Preview ${previewBook.judul}`}
                    className="w-full h-80 rounded-2xl border border-slate-200 bg-slate-50"
                    allow="autoplay"
                  />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* MODAL IFRAME READER (FULLSCREEN RESPONSIVE)               */}
      {/* ========================================================= */}
      {readingBook && (
        <div className="fixed inset-0 z-[950] bg-slate-950/90 backdrop-blur-xs flex flex-col no-print">
          <div className="bg-slate-900 text-white px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-12 rounded-xl overflow-hidden border border-slate-700 shrink-0 hidden sm:block">
                <BookCoverImage
                  src={readingBook.cover_url}
                  fileUrl={readingBook.file_url}
                  title={readingBook.judul}
                  kategori={readingBook.kategori}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                  {readingBook.kategori} · {readingBook.sumber}
                </div>
                <h3 className="font-display font-black text-sm sm:text-base truncate">{readingBook.judul}</h3>
                <div className="text-[10px] font-mono text-slate-400 truncate">{readingBook.file_url}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCopyBookUrl(readingBook.file_url, `reader_${readingBook.id}`)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
              >
                {copiedBookUrlId === `reader_${readingBook.id}` ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">Salin Link</span>
              </button>
              <a
                href={readingBook.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-display font-extrabold text-xs flex items-center gap-1.5 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka di Tab Baru</span>
              </a>
              <button
                type="button"
                onClick={() => setReadingBook(null)}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
                <span>Tutup</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-800/90 text-slate-300 px-4 py-1.5 text-[11px] flex items-center justify-between border-b border-slate-700">
            <span>
              Jika halaman buku tidak tampil karena pembatasan situs sumber, klik tombol &ldquo;Buka di Tab Baru&rdquo; di kanan atas.
            </span>
          </div>

          <div className="flex-1 bg-slate-950 p-2 sm:p-4">
            <iframe
              src={convertToEmbedUrl(readingBook.file_url)}
              title={readingBook.judul}
              className="w-full h-full rounded-2xl bg-white border border-slate-800"
              allow="autoplay"
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL TAMBAH / EDIT BUKU (ADMIN & GURU)                   */}
      {/* ========================================================= */}
      {isBookModalOpen && (() => {
        const liveResolvedCover = resolveBookCoverUrl(formCoverUrl, formFileUrl);
        const driveIdFromFile = extractGoogleDriveFileId(formFileUrl);
        const liveEmbedUrl = convertToEmbedUrl(formFileUrl);

        return (
          <div className="fixed inset-0 z-[920] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 no-print">
            <div className="bg-white max-w-4xl w-full rounded-3xl p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-display font-black text-lg text-slate-900">
                  {editingBookId ? 'Edit Data Buku' : 'Tambah Buku Baru'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsBookModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <form onSubmit={handleSaveBook} className="lg:col-span-7 space-y-3.5 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Judul Buku *</label>
                    <input
                      type="text"
                      required
                      value={formJudul}
                      onChange={(e) => setFormJudul(e.target.value)}
                      placeholder="Cth: Matematika Kelas VI Kurikulum Merdeka"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Penulis</label>
                      <input
                        type="text"
                        value={formPenulis}
                        onChange={(e) => setFormPenulis(e.target.value)}
                        placeholder="Nama penulis / penerbit"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Sumber Buku</label>
                      <input
                        type="text"
                        value={formSumber}
                        onChange={(e) => setFormSumber(e.target.value)}
                        placeholder="SIBI Kemendikdasmen / Google Drive Sekolah"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Kategori</label>
                      <select
                        value={formKategori}
                        onChange={(e) => setFormKategori(e.target.value as PerpustakaanKategori)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold bg-white"
                      >
                        {KATEGORI_OPTIONS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Sasaran Kelas</label>
                      <select
                        value={formKelas}
                        onChange={(e) => setFormKelas(e.target.value as PerpustakaanKelas)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold bg-white"
                      >
                        {KELAS_OPTIONS.map((kls) => (
                          <option key={kls} value={kls}>
                            {kls === 'Semua' ? 'Semua Kelas' : `Kelas ${kls}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="font-bold text-slate-700">URL Gambar Sampul (Opsional)</label>
                      {driveIdFromFile && !formCoverUrl.trim() && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormCoverUrl(
                              `https://drive.google.com/thumbnail?id=${driveIdFromFile}&sz=w800`
                            )
                          }
                          className="text-[10px] font-black text-sky-700 hover:underline cursor-pointer"
                        >
                          + Gunakan Cover dari Google Drive
                        </button>
                      )}
                    </div>
                    <input
                      type="url"
                      value={formCoverUrl}
                      onChange={(e) => setFormCoverUrl(e.target.value)}
                      placeholder="https://.../sampul-buku.png atau link gambar Google Drive"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-[11px]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">URL File Buku (PDF / Google Drive / SIBI) *</label>
                    <input
                      type="url"
                      required
                      value={formFileUrl}
                      onChange={(e) => setFormFileUrl(e.target.value)}
                      placeholder="https://drive.google.com/file/d/.../view atau link PDF SIBI"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-[11px]"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Link Google Drive yang berakhiran /view atau /edit otomatis dikonversi menjadi /preview saat dibaca dan menghasilkan cover halaman pertama secara otomatis.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsBookModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingBook}
                      className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-display font-extrabold cursor-pointer"
                    >
                      {isSavingBook ? 'Menyimpan...' : editingBookId ? 'Simpan Perubahan' : 'Simpan Buku'}
                    </button>
                  </div>
                </form>

                {/* Live Cover & Link URL Preview Panel */}
                <div className="lg:col-span-5 bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase text-slate-700 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-rose-600" /> Live Preview Cover &amp; Link
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                      {formCoverUrl.trim()
                        ? 'Cover URL Khusus'
                        : driveIdFromFile
                        ? 'Auto Cover Google Drive'
                        : 'Sampul Digital Default'}
                    </span>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                    <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                      <BookCoverImage
                        src={formCoverUrl}
                        fileUrl={formFileUrl}
                        title={formJudul || 'Judul Buku Baru'}
                        kategori={formKategori}
                      />
                    </div>
                    <div className="p-3 space-y-1">
                      <div className="text-[10px] font-bold text-rose-700">
                        {formKategori} · {formKelas === 'Semua' ? 'Semua Kelas' : `Kelas ${formKelas}`}
                      </div>
                      <div className="font-display font-black text-xs text-slate-900 line-clamp-2">
                        {formJudul || 'Judul buku akan tampil di sini'}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {formPenulis || 'Tim Penulis'} · {formSumber || 'Perpustakaan Digital'}
                      </div>
                    </div>
                  </div>

                  {/* Link URL Buku Preview Box */}
                  <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                    <div className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
                      <Link2 className="w-3 h-3 text-sky-600" /> Preview Link URL Buku
                    </div>
                    <div className="text-[10px] font-mono text-slate-700 break-all bg-slate-50 p-2 rounded-lg border border-slate-100 max-h-16 overflow-y-auto">
                      {formFileUrl.trim() || 'Masukkan URL file buku untuk melihat pratinjau link...'}
                    </div>
                    {liveResolvedCover && (
                      <div className="text-[10px] text-emerald-700 font-semibold break-all">
                        URL Gambar Cover: <span className="font-mono">{liveResolvedCover}</span>
                      </div>
                    )}
                    {formFileUrl.trim() && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowFormBookPreview((v) => !v)}
                          className="flex-1 py-1.5 px-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{showFormBookPreview ? 'Tutup Tes Link' : 'Tes Preview Link'}</span>
                        </button>
                        <a
                          href={formFileUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] flex items-center justify-center gap-1 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Buka URL
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {showFormBookPreview && liveEmbedUrl && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="text-[11px] font-bold text-slate-600">
                    Pratinjau Isi Buku dari Link URL (<span className="font-mono">{liveEmbedUrl}</span>):
                  </div>
                  <iframe
                    src={liveEmbedUrl}
                    title="Preview Link Buku"
                    className="w-full h-72 rounded-2xl border border-slate-200 bg-slate-50"
                    allow="autoplay"
                  />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* MODAL IMPORT CSV KATALOG (ADMIN & GURU)                   */}
      {/* ========================================================= */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-[920] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white max-w-2xl w-full rounded-3xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-black text-lg text-slate-900">Import Massal Katalog CSV</h3>
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-sky-900 space-y-0.5">
                <div className="font-black">Unduh Template CSV Resmi</div>
                <p className="text-[11px] opacity-85">
                  Format kolom: judul;penulis;kategori;kelas;sumber;cover_url;file_url (mendukung pemisah ; atau ,).
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplateCsv}
                className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-display font-extrabold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Template CSV</span>
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Pilih File .CSV Katalog Buku</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
                className="w-full text-xs text-slate-600 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-900 file:text-white cursor-pointer"
              />
              {csvFileName && (
                <div className="text-xs text-slate-600">
                  File dipilih: <strong>{csvFileName}</strong>
                </div>
              )}
            </div>

            {csvPreview && (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>
                    Pemisah terdeteksi: <strong className="font-mono">{csvPreview.delimiter}</strong>
                  </span>
                  <span className="font-bold text-emerald-700">
                    {csvPreview.validBooks.length} buku valid siap diimpor
                    {csvPreview.skippedRows > 0 ? ` (${csvPreview.skippedRows} baris dilewati)` : ''}
                  </span>
                </div>

                {csvPreview.validBooks.length > 0 && (
                  <div className="max-h-52 overflow-auto border border-slate-200 rounded-2xl">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 font-bold text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Judul</th>
                          <th className="py-2 px-3">Kategori</th>
                          <th className="py-2 px-3">Kelas</th>
                          <th className="py-2 px-3">Sumber</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvPreview.validBooks.slice(0, 8).map((b, i) => (
                          <tr key={i}>
                            <td className="py-2 px-3 font-bold text-slate-800">{b.judul}</td>
                            <td className="py-2 px-3">{b.kategori}</td>
                            <td className="py-2 px-3">{b.kelas}</td>
                            <td className="py-2 px-3">{b.sumber}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={!csvPreview || csvPreview.validBooks.length === 0 || isImportingCsv}
                onClick={handleCommitCsvImport}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-display font-extrabold text-xs cursor-pointer"
              >
                {isImportingCsv
                  ? 'Mengimpor ke Firestore...'
                  : `Simpan ${csvPreview?.validBooks.length || 0} Buku ke Firestore`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL KONFIRMASI HAPUS BUKU / HAPUS PEMINJAMAN            */}
      {/* ========================================================= */}
      {bookToDelete && (
        <div className="fixed inset-0 z-[940] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-black text-base text-slate-900">Hapus Buku dari Katalog?</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Anda akan menghapus buku <strong>{bookToDelete.judul}</strong> secara permanen dari Firestore.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBookToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingBook}
                onClick={handleConfirmDeleteBook}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
              >
                {isDeletingBook ? 'Menghapus...' : 'Ya, Hapus Buku'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loanToDelete && (
        <div className="fixed inset-0 z-[940] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-black text-base text-slate-900">Hapus Riwayat Peminjaman?</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Catatan peminjaman <strong>{loanToDelete.judul_buku}</strong> oleh{' '}
                  <strong>{loanToDelete.nama_siswa}</strong> akan dihapus.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLoanToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLoan}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
              >
                Ya, Hapus Catatan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL BARCODE CHECKOUT BUKU (LINK KARTU SISWA -> BOOK ID) */}
      {/* ========================================================= */}
      {isCheckoutModalOpen && isStaff && (
        <div className="fixed inset-0 z-[935] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white max-w-2xl w-full rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                  Checkout Peminjaman Barcode · Koleksi Firestore &apos;pinjaman&apos;
                </div>
                <h3 className="font-display font-black text-lg text-slate-900">
                  Scan Kartu Siswa untuk Pinjam Buku
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Book Selector / Preview */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
              <label className="block text-[11px] font-black uppercase text-slate-500">
                Buku yang Dipinjamkan
              </label>
              <select
                value={checkoutTargetBook?.id || ''}
                onChange={(e) => {
                  const chosen = books.find((b) => b.id === e.target.value) || null;
                  setCheckoutTargetBook(chosen);
                  setCheckoutSuccessLoan(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-bold text-slate-900"
              >
                <option value="">-- Pilih Buku dari Katalog --</option>
                {books.map((b) => {
                  const count = (activeLoansByBookId.get(b.id) || []).length;
                  return (
                    <option key={b.id} value={b.id}>
                      {b.judul} ({b.kelas === 'Semua' ? 'Semua Kelas' : `Kelas ${b.kelas}`})
                      {count > 0 ? ` — Sedang dipinjam (${count})` : ' — Tersedia'}
                    </option>
                  );
                })}
              </select>

              {checkoutTargetBook && (
                <div className="flex items-center justify-between gap-3 pt-1 text-xs">
                  <span className="font-mono text-[11px] text-slate-500 truncate">
                    ID Buku: <strong className="text-slate-800">{checkoutTargetBook.id}</strong>
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-lg border text-[11px] ${
                      (activeLoansByBookId.get(checkoutTargetBook.id) || []).length > 0
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}
                  >
                    {(activeLoansByBookId.get(checkoutTargetBook.id) || []).length > 0
                      ? `Sedang Dipinjam (${(activeLoansByBookId.get(checkoutTargetBook.id) || []).length})`
                      : 'Tersedia'}
                  </span>
                </div>
              )}
            </div>

            {/* Camera & Barcode Scan Interface */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5 space-y-2">
                {cameras.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <SwitchCamera className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <select
                      value={selectedCamId}
                      onChange={(e) => handleSwitchCheckoutCam(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-700"
                    >
                      {cameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => refreshDeviceCameras(selectedCamId)}
                      className="p-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer shrink-0"
                      title="Sinkronkan daftar kamera perangkat"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 relative min-h-[190px] flex flex-col items-center justify-center">
                  <div
                    id="book-checkout-barcode-reader"
                    className={`w-full ${checkoutCamActive || isStartingCheckoutCam ? 'block' : 'hidden'}`}
                  />
                  {!checkoutCamActive && !isStartingCheckoutCam && (
                    <div className="p-4 text-center space-y-2.5 text-white">
                      <QrCode className="w-8 h-8 mx-auto text-sky-400" />
                      <p className="text-[11px] text-slate-300">
                        Scan barcode Kartu Absensi / Perpustakaan siswa via kamera atau USB scanner.
                      </p>
                      <button
                        type="button"
                        disabled={isStartingCheckoutCam}
                        onClick={() => startCheckoutCamera()}
                        className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-display font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Scan via Kamera</span>
                      </button>
                    </div>
                  )}
                  {isStartingCheckoutCam && (
                    <div className="p-4 text-center text-[11px] text-sky-300 font-bold">
                      Menghubungkan kamera perangkat...
                    </div>
                  )}
                  {checkoutCamActive && (
                    <button
                      type="button"
                      onClick={stopCheckoutCamera}
                      className="absolute bottom-2.5 right-2.5 z-20 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-[11px] font-bold flex items-center gap-1 shadow-md cursor-pointer"
                    >
                      <VideoOff className="w-3.5 h-3.5" /> Tutup Kamera
                    </button>
                  )}
                </div>
              </div>

              {/* Input / USB Scanner / Manual Checkout Details */}
              <form onSubmit={handleConfirmManualCheckout} className="md:col-span-7 space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Scan / Ketik Barcode Kartu Absensi Siswa
                  </label>
                  <div className="flex gap-2">
                    <input
                      ref={checkoutInputRef}
                      type="text"
                      value={checkoutBarcodeInput}
                      onChange={(e) => setCheckoutBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCheckoutBarcodeScan(checkoutBarcodeInput);
                        }
                      }}
                      placeholder="Arahkan scanner / ketik RBU21-... lalu Enter"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 focus:border-sky-600 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCheckoutBarcodeScan(checkoutBarcodeInput)}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                    >
                      Scan
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Atau Pilih Siswa Langsung</label>
                  <select
                    value={checkoutMatchedStudent?.id || ''}
                    onChange={(e) => {
                      const s = students.find((st) => st.id === e.target.value) || null;
                      setCheckoutMatchedStudent(s);
                      if (s) setCheckoutBarcodeInput(s.barcodeId);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800"
                  >
                    <option value="">-- Pilih Siswa Peminjam --</option>
                    {[...students]
                      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nama} ({s.kelas}) — {s.barcodeId}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Batas Kembali</label>
                    <input
                      type="date"
                      value={checkoutDueDate}
                      onChange={(e) => setCheckoutDueDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Kode Eksemplar</label>
                    <input
                      type="text"
                      value={checkoutEksemplar}
                      onChange={(e) => setCheckoutEksemplar(e.target.value)}
                      placeholder="Opsional"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer select-none pt-0.5">
                  <input
                    type="checkbox"
                    checked={checkoutAutoSubmit}
                    onChange={(e) => setCheckoutAutoSubmit(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600"
                  />
                  <span>Langsung catat pinjaman otomatis saat barcode kartu siswa terbaca</span>
                </label>

                {checkoutMatchedStudent && (
                  <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 flex items-center gap-3">
                    <img
                      src={checkoutMatchedStudent.fotoUrl}
                      alt={checkoutMatchedStudent.nama}
                      className="w-10 h-12 rounded-xl object-cover border border-sky-300 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-black text-xs text-slate-900 truncate">
                        {checkoutMatchedStudent.nama}
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono">
                        {checkoutMatchedStudent.kelas} · {checkoutMatchedStudent.barcodeId}
                      </div>
                    </div>
                  </div>
                )}

                {checkoutSuccessLoan && (
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="text-[11px]">
                      <div className="font-extrabold">Peminjaman Tercatat di Firestore!</div>
                      <div>
                        Buku <strong>{checkoutSuccessLoan.judul_buku}</strong> dipinjam oleh{' '}
                        <strong>{checkoutSuccessLoan.nama_siswa}</strong> (Kartu:{' '}
                        <span className="font-mono">{checkoutSuccessLoan.barcode_id}</span>).
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCheckoutModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                  >
                    Tutup
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCheckout || !checkoutTargetBook || !checkoutMatchedStudent}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-display font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSubmittingCheckout ? 'Menyimpan...' : 'Simpan Peminjaman'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PRINTABLE AREAS (hidden on screen, rendered on print)     */}
      {/* ========================================================= */}
      {printMode === 'laporan' && (
        <div className="hidden print-only a4-rapor-sheet text-slate-900">
          {/* Kop Surat Resmi */}
          <div className="flex items-center justify-between border-b-4 border-double border-slate-900 pb-3 mb-5">
            <img src={profile.logoKemendikbudUrl} alt="Logo Dinas" className="w-16 h-16 object-contain" />
            <div className="text-center flex-1 px-4">
              <div className="text-xs font-bold uppercase tracking-wide">
                Pemerintah Provinsi DKI Jakarta · Suku Dinas Pendidikan Jakarta Utara
              </div>
              <div className="font-display font-black text-lg uppercase">{profile.name}</div>
              <div className="text-xs">
                {profile.alamat} · {profile.kota} · NPSN: {profile.npsn}
              </div>
            </div>
            <img src={profile.logoSekolahUrl} alt="Logo Sekolah" className="w-16 h-16 object-contain" />
          </div>

          <div className="text-center mb-5">
            <h2 className="font-display font-black text-base uppercase underline">
              LAPORAN PERINGKAT PEMBACA TERAJIN (DUTA LITERASI SEKOLAH)
            </h2>
            <p className="text-xs mt-1">
              Periode: <strong>{filterMonth === 'ALL' ? 'Semua Waktu' : formatMonthYearLabel(filterMonth)}</strong> ·
              Kelas/Rombel: <strong>{filterRombel === 'ALL' ? 'Semua Kelas' : `Kelas ${filterRombel}`}</strong>
            </p>
          </div>

          <table className="w-full border-collapse border border-slate-800 text-xs mb-8">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-800 py-2 px-2 w-12 text-center">Peringkat</th>
                <th className="border border-slate-800 py-2 px-3 text-left">NISN</th>
                <th className="border border-slate-800 py-2 px-3 text-left">Nama Siswa</th>
                <th className="border border-slate-800 py-2 px-2 text-center">Kelas</th>
                <th className="border border-slate-800 py-2 px-2 text-center">Jumlah Buku</th>
                <th className="border border-slate-800 py-2 px-3 text-left">Predikat Literasi</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border border-slate-800 py-4 text-center">
                    Belum ada data pembaca tercatat pada periode ini.
                  </td>
                </tr>
              ) : (
                leaderboard.map((row, idx) => (
                  <tr key={`${row.nisn}_${row.nama_siswa}`}>
                    <td className="border border-slate-800 py-1.5 px-2 text-center font-bold">{idx + 1}</td>
                    <td className="border border-slate-800 py-1.5 px-3 font-mono">{row.nisn || '-'}</td>
                    <td className="border border-slate-800 py-1.5 px-3 font-semibold">{row.nama_siswa}</td>
                    <td className="border border-slate-800 py-1.5 px-2 text-center">{row.kelas || '-'}</td>
                    <td className="border border-slate-800 py-1.5 px-2 text-center font-bold">
                      {row.totalDibaca}
                    </td>
                    <td className="border border-slate-800 py-1.5 px-3">
                      {getLiteracyBadge(row.totalDibaca).label}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-8 text-xs mt-8">
            <div className="text-center">
              <div>Mengetahui,</div>
              <div className="font-bold">Kepala {profile.name}</div>
              <div className="h-20" />
              <div className="font-bold sig-name-line">{profile.kepalaSekolah.nama}</div>
              <div>NIP. {profile.kepalaSekolah.nip}</div>
            </div>
            <div className="text-center">
              <div>Jakarta, {formatTanggalIndo(getLocalTodayStr())}</div>
              <div className="font-bold">Kepala Perpustakaan / Guru Kelas</div>
              <div className="h-20" />
              <div className="font-bold sig-name-line">{activeUser.name}</div>
              <div>&nbsp;</div>
            </div>
          </div>
        </div>
      )}

      {printMode === 'kartu' && activeBorrowStudent && (
        <div className="hidden print-only p-6">
          <div className="max-w-md mx-auto bg-white rounded-3xl p-5 border-2 border-slate-900 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900">
              <img src={profile.logoKemendikbudUrl} alt="Logo" className="w-11 h-11 object-contain" />
              <div className="text-center px-2">
                <div className="text-[10px] font-black uppercase tracking-wider">
                  KARTU PEMINJAMAN PERPUSTAKAAN
                </div>
                <div className="font-display font-black text-xs">{profile.name}</div>
                <div className="text-[9px]">{profile.kota}</div>
              </div>
              <img src={profile.logoSekolahUrl} alt="Logo" className="w-11 h-11 object-contain" />
            </div>

            <div className="flex items-center gap-4">
              <img
                src={activeBorrowStudent.fotoUrl}
                alt={activeBorrowStudent.nama}
                className="w-16 h-20 rounded-xl object-cover border border-slate-400"
              />
              <div className="space-y-1 text-xs">
                <div className="font-display font-black text-sm">{activeBorrowStudent.nama}</div>
                <div>
                  NISN: <span className="font-mono font-bold">{activeBorrowStudent.nisn}</span>
                </div>
                <div>
                  Kelas: <strong>{activeBorrowStudent.kelas}</strong>
                </div>
                <div>
                  Kode Kartu: <span className="font-mono font-bold">{activeBorrowStudent.barcodeId}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-center">
              <canvas ref={printCardCanvasRef} className="max-w-full h-auto" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
