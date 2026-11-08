import React from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  imageUrl: string;
  title: string;
  onClose: () => void;
}

export const ImageZoomModal: React.FC<Props> = ({ isOpen, imageUrl, title, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[950] bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-2xl w-full bg-white rounded-3xl p-4 shadow-2xl border-2 border-rose-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h4 className="font-display font-extrabold text-sm text-slate-800">{title || 'Pratinjau Gambar'}</h4>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white flex items-center justify-center font-bold transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 flex items-center justify-center bg-slate-50 rounded-2xl mt-3">
          <img src={imageUrl} alt="Preview" className="max-h-[70vh] w-auto object-contain rounded-xl" />
        </div>
      </div>
    </div>
  );
};
