import React, { useEffect, useRef, useState } from 'react';
import { Smile, X } from 'lucide-react';

export const SARAH_CHAT_EMOJIS = [
  '😊',
  '😄',
  '🙏',
  '👍',
  '✨',
  '❤️',
  '🙌',
  '👏',
  '📚',
  '✏️',
  '🎒',
  '💡',
  '🌟',
  '🔥',
  '🤔',
  '😅',
  '💪',
  '🎉',
  '🌸',
  '🌈',
];

interface Props {
  onSelectEmoji: (emoji: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const SarahEmojiPicker: React.FC<Props> = ({
  onSelectEmoji,
  disabled = false,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Pilih Emoji"
        aria-label="Pilih Emoji"
        className={`rounded-2xl border transition cursor-pointer flex items-center justify-center disabled:opacity-40 ${
          compact ? 'w-10 h-10' : 'w-11 h-11'
        } ${
          isOpen
            ? 'bg-rose-100 border-rose-300 text-rose-700'
            : 'bg-slate-50 hover:bg-rose-50 border-slate-300 text-slate-600 hover:text-rose-700'
        }`}
      >
        <Smile className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
      </button>

      {isOpen && (
        <div
          className={`absolute bottom-full left-0 mb-2 z-30 bg-white rounded-2xl border border-slate-200 shadow-xl p-2.5 ${
            compact ? 'w-[236px]' : 'w-[260px]'
          }`}
        >
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-600">
              Pilih Emoji Chat
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-0.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              aria-label="Tutup panel emoji"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {SARAH_CHAT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onSelectEmoji(emoji);
                }}
                className="h-9 rounded-xl hover:bg-rose-50 active:scale-95 text-lg flex items-center justify-center transition cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
