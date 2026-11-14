import React from 'react';
import { PosisiGambar, parseQuestionSegments } from '../utils/questionFormat';

interface QuestionContentProps {
  pertanyaan: string;
  judulTeks?: string;
  gambarUrl?: string | null;
  gambarUrl2?: string | null;
  posisiGambar?: PosisiGambar;
  onOpenZoom?: (url: string, title: string) => void;
  titleClassName?: string;
  bodyClassName?: string;
  compact?: boolean;
}

export const QuestionContent: React.FC<QuestionContentProps> = ({
  pertanyaan,
  judulTeks,
  gambarUrl,
  gambarUrl2,
  posisiGambar = 'bawah_judul',
  onOpenZoom,
  titleClassName = 'text-sm sm:text-base font-display font-black text-slate-900',
  bodyClassName = 'text-xs sm:text-sm font-semibold text-slate-800 leading-relaxed',
  compact = false,
}) => {
  const { segments, hasTitle } = parseQuestionSegments(pertanyaan, judulTeks);
  const hasAnyImage = Boolean(gambarUrl || gambarUrl2);

  // Temukan index segmen judul terakhir agar judul tampil penuh di atas
  // dan gambar dapat ditempatkan di bawah judul, di bawah pertanyaan, atau di kanan teks.
  let lastTitleIdx = -1;
  segments.forEach((seg, idx) => {
    if (seg.type === 'title') lastTitleIdx = idx;
  });

  const renderImages = (sideLayout: boolean = false) => {
    if (!hasAnyImage) return null;

    const maxImgHeight = compact ? 'max-h-48' : 'max-h-56';
    const spacingCls = sideLayout ? 'w-full' : 'my-2.5';

    if (gambarUrl && gambarUrl2) {
      return (
        <div
          className={`grid gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200 ${spacingCls} ${
            sideLayout ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto w-full'
          }`}
        >
          <div className="flex flex-col items-center text-center">
            <span className="text-[10px] font-bold text-slate-500 mb-1">Gambar 1</span>
            <img
              src={gambarUrl}
              alt="Gambar 1 Soal"
              onClick={onOpenZoom ? () => onOpenZoom(gambarUrl, 'Gambar 1 Soal') : undefined}
              className={`${maxImgHeight} w-full object-contain rounded-xl border border-slate-200 bg-white ${
                onOpenZoom ? 'cursor-zoom-in hover:opacity-90 transition' : ''
              }`}
            />
          </div>
          <div className="flex flex-col items-center text-center">
            <span className="text-[10px] font-bold text-slate-500 mb-1">Gambar 2 (Bersebelahan)</span>
            <img
              src={gambarUrl2}
              alt="Gambar 2 Soal"
              onClick={onOpenZoom ? () => onOpenZoom(gambarUrl2, 'Gambar 2 Soal') : undefined}
              className={`${maxImgHeight} w-full object-contain rounded-xl border border-slate-200 bg-white ${
                onOpenZoom ? 'cursor-zoom-in hover:opacity-90 transition' : ''
              }`}
            />
          </div>
        </div>
      );
    }

    const singleUrl = (gambarUrl || gambarUrl2)!;
    if (sideLayout) {
      return (
        <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 w-full flex justify-center">
          <img
            src={singleUrl}
            alt="Gambar Soal"
            onClick={onOpenZoom ? () => onOpenZoom(singleUrl, 'Gambar Soal') : undefined}
            className={`${maxImgHeight} max-w-full object-contain rounded-xl bg-white ${
              onOpenZoom ? 'cursor-zoom-in hover:opacity-90 transition' : ''
            }`}
          />
        </div>
      );
    }

    return (
      <div className="my-2.5 w-full flex justify-center">
        <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 inline-flex justify-center max-w-full">
          <img
            src={singleUrl}
            alt="Gambar Soal"
            onClick={onOpenZoom ? () => onOpenZoom(singleUrl, 'Gambar Soal') : undefined}
            className={`${maxImgHeight} max-w-full object-contain rounded-xl bg-white ${
              onOpenZoom ? 'cursor-zoom-in hover:opacity-90 transition' : ''
            }`}
          />
        </div>
      </div>
    );
  };

  const renderSegment = (seg: { type: 'title' | 'body'; text: string }, idx: number) => {
    if (seg.type === 'title') {
      return (
        <div
          key={`seg-title-${idx}`}
          className={`w-full text-center whitespace-pre-line py-1.5 px-3 rounded-xl bg-slate-50/70 border border-slate-200/80 tracking-wide ${titleClassName}`}
        >
          {seg.text}
        </div>
      );
    }

    const paragraphs = seg.text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    return (
      <div key={`seg-body-${idx}`} className="space-y-2.5">
        {paragraphs.map((para, pIdx) => (
          <p key={pIdx} className={`${bodyClassName} whitespace-pre-line text-left`}>
            {para}
          </p>
        ))}
      </div>
    );
  };

  if (posisiGambar === 'bawah_pertanyaan') {
    return (
      <div className="space-y-3">
        {segments.map((seg, idx) => renderSegment(seg, idx))}
        {renderImages(false)}
      </div>
    );
  }

  if (posisiGambar === 'kanan_teks' && hasAnyImage) {
    const titleSegments = hasTitle ? segments.slice(0, lastTitleIdx + 1) : [];
    const bodySegments = hasTitle ? segments.slice(lastTitleIdx + 1) : segments;

    return (
      <div className="space-y-3">
        {titleSegments.map((seg, idx) => renderSegment(seg, idx))}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          <div className="md:col-span-7 space-y-3">
            {bodySegments.map((seg, idx) => renderSegment(seg, lastTitleIdx + 1 + idx))}
          </div>
          <div className="md:col-span-5 flex flex-col items-center">
            {renderImages(true)}
          </div>
        </div>
      </div>
    );
  }

  // Posisi 'bawah_judul': gambar ditempatkan tepat setelah judul (atau di paling atas jika tidak ada judul)
  const beforeImageSegments = hasTitle ? segments.slice(0, lastTitleIdx + 1) : [];
  const afterImageSegments = hasTitle ? segments.slice(lastTitleIdx + 1) : segments;

  return (
    <div className="space-y-3">
      {beforeImageSegments.map((seg, idx) => renderSegment(seg, idx))}
      {renderImages(false)}
      {afterImageSegments.map((seg, idx) => renderSegment(seg, lastTitleIdx + 1 + idx))}
    </div>
  );
};
