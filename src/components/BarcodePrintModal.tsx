import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import {
  Printer,
  X,
  CheckSquare,
  Square,
  Layers,
  CreditCard,
  Users,
  Eye,
} from 'lucide-react';
import { SchoolProfile, Student } from '../types';
import { CLASSES_LIST } from '../utils/storage';

export type BatchPrintLayout =
  | 'one-sheet-class'
  | 'ktp-10'
  | 'ktp-8'
  | 'ktp-9-landscape';

export type PaperFormat = 'A4' | 'F4';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  profile: SchoolProfile;
  initialClass: string;
  activeYear: string;
}

interface VectorBarcodeProps {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  className?: string;
}

const VectorBarcodeSvg: React.FC<VectorBarcodeProps> = ({
  value,
  height = 28,
  width = 1.4,
  fontSize = 10,
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const clean = (value || '').trim() || '000000';
    try {
      const adjustedWidth =
        clean.length > 16 ? Math.max(1.0, width * 0.78) : clean.length > 11 ? Math.max(1.15, width * 0.9) : width;
      JsBarcode(el, clean, {
        format: 'CODE128',
        lineColor: '#000000',
        background: '#ffffff',
        width: adjustedWidth,
        height,
        displayValue: true,
        font: 'monospace',
        fontOptions: 'bold',
        fontSize,
        textMargin: 1.5,
        margin: 2,
      });
    } catch {
      // Fallback safely if invalid character appears
      try {
        JsBarcode(el, '000000', {
          format: 'CODE128',
          width: 1.2,
          height,
          displayValue: false,
          margin: 2,
        });
      } catch {
        // Ignore
      }
    }
  }, [value, height, width, fontSize]);

  return <svg ref={svgRef} className={`max-w-full h-auto block ${className}`} />;
};

export const BarcodePrintModal: React.FC<Props> = ({
  isOpen,
  onClose,
  students,
  profile,
  initialClass,
  activeYear,
}) => {
  const [selectedClass, setSelectedClass] = useState<string>(initialClass || CLASSES_LIST[0]);
  const [layoutMode, setLayoutMode] = useState<BatchPrintLayout>('one-sheet-class');
  const [paperSize, setPaperSize] = useState<PaperFormat>('A4');
  const [barcodeSource, setBarcodeSource] = useState<'barcodeId' | 'nisn'>('barcodeId');
  const [showCredentials, setShowCredentials] = useState<boolean>(true);
  const [showPhoto, setShowPhoto] = useState<boolean>(true);
  const [showCutLines, setShowCutLines] = useState<boolean>(true);
  const [excludedIds, setExcludedIds] = useState<Record<string, boolean>>({});

  // Sync initialClass when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedClass(initialClass || CLASSES_LIST[0]);
      setExcludedIds({});
    }
  }, [isOpen, initialClass]);

  const classCounts = useMemo(() => {
    const map: Record<string, number> = {};
    CLASSES_LIST.forEach((c) => {
      map[c] = 0;
    });
    students.forEach((s) => {
      map[s.kelas] = (map[s.kelas] || 0) + 1;
    });
    return map;
  }, [students]);

  const classStudents = useMemo(() => {
    const filtered =
      selectedClass === 'SEMUA'
        ? students
        : students.filter((s) => s.kelas === selectedClass);
    return [...filtered].sort((a, b) => {
      const clsCmp = (a.kelas || '').localeCompare(b.kelas || '', 'id', { numeric: true });
      if (selectedClass === 'SEMUA' && clsCmp !== 0) return clsCmp;
      return (a.nama || '').localeCompare(b.nama || '', 'id', { sensitivity: 'base' });
    });
  }, [students, selectedClass]);

  const selectedStudents = useMemo(
    () => classStudents.filter((s) => !excludedIds[s.id]),
    [classStudents, excludedIds]
  );

  // Dynamic columns/rows for "Semua Sekelas dalam 1 Lembar"
  const oneSheetMetrics = useMemo(() => {
    const count = Math.max(1, selectedStudents.length);
    const isF4 = paperSize === 'F4';
    const sheetWmm = isF4 ? 215 : 210;
    const sheetHmm = isF4 ? 330 : 297;

    let cols = 2;
    if (count <= 8) cols = 2;
    else if (count <= 15) cols = 3;
    else if (count <= 32) cols = 4;
    else cols = 5;

    const rows = Math.max(1, Math.ceil(count / cols));
    const isDense = count > 16;
    const isUltraDense = count > 24;

    return {
      cols,
      rows,
      sheetWmm,
      sheetHmm,
      isDense,
      isUltraDense,
      barcodeHeight: isUltraDense ? 16 : isDense ? 20 : 26,
      barcodeWidth: isUltraDense ? 0.95 : isDense ? 1.1 : 1.3,
      barcodeFont: isUltraDense ? 7.5 : isDense ? 8.5 : 10,
    };
  }, [selectedStudents.length, paperSize]);

  // Pages breakdown
  const pages = useMemo(() => {
    if (layoutMode === 'one-sheet-class') {
      return [selectedStudents];
    }
    const perPage =
      layoutMode === 'ktp-10' ? 10 : layoutMode === 'ktp-9-landscape' ? 9 : 8;
    const chunks: Student[][] = [];
    for (let i = 0; i < selectedStudents.length; i += perPage) {
      chunks.push(selectedStudents.slice(i, i + perPage));
    }
    return chunks.length > 0 ? chunks : [[]];
  }, [selectedStudents, layoutMode]);

  const isLandscape = layoutMode === 'ktp-9-landscape';
  const pageDimensionStyle = useMemo(() => {
    const w = paperSize === 'F4' ? (isLandscape ? '330mm' : '215mm') : isLandscape ? '297mm' : '210mm';
    const h = paperSize === 'F4' ? (isLandscape ? '215mm' : '330mm') : isLandscape ? '210mm' : '297mm';
    return { width: w, minHeight: h, exactHeight: h };
  }, [paperSize, isLandscape]);

  const toggleStudent = (id: string) => {
    setExcludedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const selectAllStudents = () => setExcludedIds({});
  const clearAllStudents = () => {
    const next: Record<string, boolean> = {};
    classStudents.forEach((s) => {
      next[s.id] = true;
    });
    setExcludedIds(next);
  };

  if (!isOpen) return null;

  const pageCssSize =
    paperSize === 'F4'
      ? isLandscape
        ? '330mm 215mm'
        : '215mm 330mm'
      : isLandscape
        ? 'A4 landscape'
        : 'A4 portrait';

  const modalContent = (
    <div
      id="batch-barcode-portal-root"
      className="fixed inset-0 z-[970] bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: ${pageCssSize};
                margin: 5mm;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              body > *:not(#batch-barcode-portal-root) {
                display: none !important;
              }
              #batch-barcode-portal-root {
                position: static !important;
                inset: auto !important;
                display: block !important;
                background: #ffffff !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow: visible !important;
              }
              #batch-barcode-modal-shell {
                position: static !important;
                max-width: none !important;
                max-height: none !important;
                width: 100% !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                overflow: visible !important;
                background: #ffffff !important;
              }
              #batch-barcode-scroll-area {
                overflow: visible !important;
                padding: 0 !important;
                background: #ffffff !important;
              }
              .no-print-in-modal {
                display: none !important;
              }
              .print-sheet-page {
                box-shadow: none !important;
                margin: 0 auto !important;
                border: none !important;
                page-break-after: always !important;
                break-after: page !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .print-sheet-page:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
              }
              .barcode-card-item {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          `,
        }}
      />

      <div
        id="batch-barcode-modal-shell"
        className="bg-white max-w-6xl w-full max-h-[95vh] rounded-3xl shadow-2xl border-2 border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Header Modal */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-sky-700 via-teal-700 to-emerald-700 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 no-print-in-modal">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-black text-base sm:text-lg leading-tight">
                Cetak Kartu Barcode Siswa Satu Lembar Per Kelas
              </h3>
              <p className="text-xs text-sky-100">
                Sesuaikan kelas &amp; tata letak untuk mencetak seluruh siswa sekaligus dalam satu lembar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedStudents.length === 0}
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-display font-black text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Sekarang ({selectedStudents.length} Kartu)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Control Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0 no-print-in-modal">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Pilih Kelas */}
            <div className="md:col-span-3">
              <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-sky-600" /> Kelas yang Dicetak
              </label>
              <select
                value={selectedClass}
                onChange={(e) => {
                  setSelectedClass(e.target.value);
                  setExcludedIds({});
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
              >
                {CLASSES_LIST.map((c) => (
                  <option key={c} value={c}>
                    Kelas {c} ({classCounts[c] || 0} siswa)
                  </option>
                ))}
                <option value="SEMUA">Semua Kelas ({students.length} siswa)</option>
              </select>
            </div>

            {/* Tata Letak Lembar */}
            <div className="md:col-span-5">
              <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-emerald-600" /> Format Lembar Cetak
              </label>
              <select
                value={layoutMode}
                onChange={(e) => setLayoutMode(e.target.value as BatchPrintLayout)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
              >
                <option value="one-sheet-class">
                  Semua Siswa Sekelas dalam 1 Lembar (Auto-Fit 1 Halaman)
                </option>
                <option value="ktp-10">
                  Ukuran KTP Presisi (85,6×53,98mm) — 10 Kartu / Lembar (2×5)
                </option>
                <option value="ktp-8">
                  Ukuran KTP Presisi (85,6×53,98mm) — 8 Kartu / Lembar (2×4)
                </option>
                <option value="ktp-9-landscape">
                  Ukuran KTP Presisi (85,6×53,98mm) — 9 Kartu / Lembar Landscape (3×3)
                </option>
              </select>
            </div>

            {/* Ukuran Kertas & Barcode */}
            <div className="md:col-span-4 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                  Kertas
                </label>
                <select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as PaperFormat)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
                >
                  <option value="A4">A4 (210×297mm)</option>
                  <option value="F4">F4 (215×330mm)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-rose-600" /> Kode Barcode
                </label>
                <select
                  value={barcodeSource}
                  onChange={(e) => setBarcodeSource(e.target.value as 'barcodeId' | 'nisn')}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
                >
                  <option value="barcodeId">ID Kartu (RBU21-...)</option>
                  <option value="nisn">NIS / NISN</option>
                </select>
              </div>
            </div>
          </div>

          {/* Toggles + Pilihan Siswa */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPhoto}
                  onChange={(e) => setShowPhoto(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600"
                />
                Tampilkan Foto
              </label>
              <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCredentials}
                  onChange={(e) => setShowCredentials(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600"
                />
                User &amp; Password
              </label>
              <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCutLines}
                  onChange={(e) => setShowCutLines(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600"
                />
                Garis Potong
              </label>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-bold text-slate-600">
                <Eye className="w-3.5 h-3.5 inline mr-1 text-sky-600" />
                Total: <strong>{pages.length}</strong> lembar ({selectedStudents.length} dari {classStudents.length} siswa)
              </span>
              <button
                type="button"
                onClick={selectAllStudents}
                className="px-2 py-1 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold cursor-pointer"
              >
                Pilih Semua
              </button>
              <button
                type="button"
                onClick={clearAllStudents}
                className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold cursor-pointer"
              >
                Kosongkan
              </button>
            </div>
          </div>

          {/* Checklist Siswa ringkas per kelas */}
          {classStudents.length > 0 && (
            <div className="max-h-20 overflow-y-auto flex flex-wrap gap-1.5 pt-1">
              {classStudents.map((s) => {
                const checked = !excludedIds[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStudent(s.id)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 border transition cursor-pointer ${
                      checked
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-white border-slate-200 text-slate-400 line-through'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Square className="w-3 h-3 text-slate-400" />
                    )}
                    <span>{s.nama}</span>
                    {selectedClass === 'SEMUA' && (
                      <span className="text-[10px] opacity-75">({s.kelas})</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Printable Sheet Preview Area */}
        <div
          id="batch-barcode-scroll-area"
          className="flex-1 overflow-auto bg-slate-200/80 p-4 sm:p-6 space-y-6"
        >
          {selectedStudents.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center text-slate-500 max-w-md mx-auto">
              <p className="font-bold text-sm">Belum ada siswa yang dipilih pada kelas ini.</p>
              <p className="text-xs mt-1">Pilih kelas lain atau klik &quot;Pilih Semua&quot; di atas.</p>
            </div>
          ) : (
            <div id="printable-batch-barcode-sheet" className="space-y-6">
              {pages.map((pageStudents, pageIdx) => {
                const isOneSheet = layoutMode === 'one-sheet-class';
                const ktpCols = layoutMode === 'ktp-9-landscape' ? 3 : 2;
                const borderClass = showCutLines
                  ? 'border border-dashed border-slate-400'
                  : 'border border-slate-200';

                return (
                  <div
                    key={pageIdx}
                    className="print-sheet-page bg-white mx-auto shadow-lg"
                    style={{
                      width: pageDimensionStyle.width,
                      height: isOneSheet ? pageDimensionStyle.exactHeight : undefined,
                      minHeight: pageDimensionStyle.minHeight,
                      padding: isOneSheet ? '4mm' : '5mm',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {/* Header Lembar Kelas */}
                    <div
                      className="flex items-center justify-between border-b border-slate-300 pb-1 mb-1.5 text-[9pt] font-bold text-slate-800 shrink-0"
                      style={{ lineHeight: 1.2 }}
                    >
                      <span>
                        KARTU BARCODE SISWA — {selectedClass === 'SEMUA' ? 'SEMUA KELAS' : `KELAS ${selectedClass}`} ({profile.name})
                      </span>
                      <span className="text-[8pt] text-slate-600 font-semibold">
                        TA {activeYear} • Hal {pageIdx + 1}/{pages.length} ({pageStudents.length} Siswa)
                      </span>
                    </div>

                    {/* Grid Kartu */}
                    {isOneSheet ? (
                      <div
                        style={{
                          flex: 1,
                          minHeight: 0,
                          display: 'grid',
                          gridTemplateColumns: `repeat(${oneSheetMetrics.cols}, minmax(0, 1fr))`,
                          gridTemplateRows: `repeat(${oneSheetMetrics.rows}, minmax(0, 1fr))`,
                          gap: oneSheetMetrics.isUltraDense ? '1.8mm' : '2.5mm',
                        }}
                      >
                        {pageStudents.map((s) => {
                          const codeVal =
                            barcodeSource === 'nisn'
                              ? s.nisn || s.barcodeId
                              : s.barcodeId || s.nisn;
                          const dense = oneSheetMetrics.isDense;
                          const ultra = oneSheetMetrics.isUltraDense;

                          return (
                            <div
                              key={s.id}
                              className={`barcode-card-item bg-white rounded-lg overflow-hidden flex flex-col justify-between ${borderClass}`}
                              style={{ minHeight: 0 }}
                            >
                              {/* Card Top Header */}
                              <div
                                className="flex items-center justify-between gap-1 text-white shrink-0"
                                style={{
                                  background: 'linear-gradient(135deg, #0369a1 0%, #0d9488 100%)',
                                  padding: ultra ? '0.8mm 1.5mm' : '1.2mm 2mm',
                                }}
                              >
                                <span
                                  className="font-black uppercase tracking-wide truncate"
                                  style={{ fontSize: ultra ? '5.5pt' : dense ? '6pt' : '7pt' }}
                                >
                                  KARTU PELAJAR • {s.kelas}
                                </span>
                                <span
                                  className="font-bold opacity-90 shrink-0"
                                  style={{ fontSize: ultra ? '5pt' : '5.5pt' }}
                                >
                                  {activeYear}
                                </span>
                              </div>

                              {/* Card Middle */}
                              <div
                                className="flex items-center gap-1.5 min-h-0 flex-1"
                                style={{ padding: ultra ? '0.8mm 1.5mm' : '1.2mm 2mm' }}
                              >
                                {showPhoto && (
                                  <img
                                    src={s.fotoUrl}
                                    alt={s.nama}
                                    className="rounded object-cover border border-slate-300 shrink-0"
                                    style={{
                                      width: ultra ? '8mm' : dense ? '10mm' : '12.5mm',
                                      height: ultra ? '10mm' : dense ? '12.5mm' : '15.5mm',
                                    }}
                                  />
                                )}
                                <div className="min-w-0 flex-1 leading-tight">
                                  <div
                                    className="font-black text-slate-900 uppercase truncate"
                                    style={{ fontSize: ultra ? '6.2pt' : dense ? '7pt' : '8pt' }}
                                  >
                                    {s.nama}
                                  </div>
                                  <div
                                    className="text-slate-600 font-semibold truncate"
                                    style={{ fontSize: ultra ? '5.4pt' : dense ? '6pt' : '6.8pt' }}
                                  >
                                    NISN: <span className="font-mono font-bold text-slate-900">{s.nisn || '-'}</span>
                                  </div>
                                  {showCredentials && (
                                    <div
                                      className="font-mono text-slate-700 truncate"
                                      style={{ fontSize: ultra ? '5pt' : dense ? '5.6pt' : '6.2pt' }}
                                    >
                                      U: <strong>{s.username || '-'}</strong> | P: <strong className="text-rose-700">{s.password || '-'}</strong>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Card Bottom Barcode */}
                              <div
                                className="bg-white border-t border-slate-100 flex items-center justify-center shrink-0"
                                style={{ padding: ultra ? '0.4mm 1mm 0.8mm' : '0.6mm 1.5mm 1mm' }}
                              >
                                <VectorBarcodeSvg
                                  value={codeVal}
                                  height={oneSheetMetrics.barcodeHeight}
                                  width={oneSheetMetrics.barcodeWidth}
                                  fontSize={oneSheetMetrics.barcodeFont}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Exact KTP Dimensions (85.6mm x 53.98mm) Grid */
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${ktpCols}, 85.6mm)`,
                          gap: layoutMode === 'ktp-10' ? '2.2mm 4mm' : '4mm 5mm',
                          justifyContent: 'center',
                          alignContent: 'start',
                        }}
                      >
                        {pageStudents.map((s) => {
                          const codeVal =
                            barcodeSource === 'nisn'
                              ? s.nisn || s.barcodeId
                              : s.barcodeId || s.nisn;

                          return (
                            <div
                              key={s.id}
                              className={`barcode-card-item bg-white overflow-hidden flex flex-col justify-between ${borderClass}`}
                              style={{
                                width: '85.6mm',
                                height: '53.98mm',
                                borderRadius: '3mm',
                                boxSizing: 'border-box',
                              }}
                            >
                              {/* Top Header */}
                              <div
                                className="flex items-center justify-between gap-2 text-white shrink-0"
                                style={{
                                  background: 'linear-gradient(135deg, #0369a1 0%, #0d9488 100%)',
                                  padding: '1.5mm 2.8mm',
                                }}
                              >
                                <div className="min-w-0 flex-1">
                                  <div
                                    className="font-black uppercase tracking-wider leading-none"
                                    style={{ fontSize: '7pt' }}
                                  >
                                    KARTU PELAJAR &amp; ABSENSI
                                  </div>
                                  <div
                                    className="font-bold opacity-95 truncate mt-0.5"
                                    style={{ fontSize: '6pt' }}
                                  >
                                    {profile.name}
                                  </div>
                                </div>
                                <span
                                  className="font-extrabold px-1.5 py-0.5 rounded shrink-0"
                                  style={{
                                    fontSize: '5.5pt',
                                    backgroundColor: 'rgba(255,255,255,0.2)',
                                  }}
                                >
                                  Kelas {s.kelas}
                                </span>
                              </div>

                              {/* Middle Info */}
                              <div
                                className="flex items-center gap-2.5 flex-1 min-h-0"
                                style={{ padding: '1.5mm 2.8mm 0.8mm' }}
                              >
                                {showPhoto && (
                                  <img
                                    src={s.fotoUrl}
                                    alt={s.nama}
                                    className="object-cover border border-slate-300 shrink-0"
                                    style={{
                                      width: '14.5mm',
                                      height: '18.5mm',
                                      borderRadius: '1.5mm',
                                    }}
                                  />
                                )}
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div
                                    className="font-black text-slate-900 uppercase leading-tight truncate"
                                    style={{ fontSize: '8pt' }}
                                  >
                                    {s.nama}
                                  </div>
                                  <div
                                    className="text-slate-700 font-semibold"
                                    style={{ fontSize: '6.6pt' }}
                                  >
                                    NISN: <span className="font-mono font-bold text-slate-900">{s.nisn || '-'}</span> • TA {activeYear}
                                  </div>
                                  {showCredentials && (
                                    <div
                                      className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 font-mono text-slate-800 truncate"
                                      style={{ fontSize: '6.2pt' }}
                                    >
                                      User: <strong>{s.username || '-'}</strong> | Pass: <strong className="text-rose-700">{s.password || '-'}</strong>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Bottom CODE128 Barcode */}
                              <div
                                className="bg-white border-t border-slate-100 flex items-center justify-center shrink-0"
                                style={{ height: '15.5mm', padding: '0.4mm 2.5mm 1mm' }}
                              >
                                <VectorBarcodeSvg
                                  value={codeVal}
                                  height={26}
                                  width={1.45}
                                  fontSize={9.5}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
