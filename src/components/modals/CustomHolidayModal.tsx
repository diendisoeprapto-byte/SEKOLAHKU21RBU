import React, { useState } from 'react';
import { X, CalendarPlus, Save, Trash2, Calendar } from 'lucide-react';
import { KaldikDay } from '../../types';
import { formatDateKey, parseLocalDate } from '../../utils/dateUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  kaldikDays: KaldikDay[];
  onSaveDays: (updated: KaldikDay[]) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const CustomHolidayModal: React.FC<Props> = ({
  isOpen,
  onClose,
  kaldikDays,
  onSaveDays,
  showToast,
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'holiday' | 'effective'>('holiday');
  const [desc, setDesc] = useState('');

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !desc.trim()) {
      showToast('Harap isi tanggal mulai dan keterangan libur!', 'error');
      return;
    }

    const start = parseLocalDate(startDate);
    const end = endDate ? parseLocalDate(endDate) : parseLocalDate(startDate);

    if (end < start) {
      showToast('Tanggal akhir tidak boleh lebih awal dari tanggal mulai!', 'error');
      return;
    }

    const newDays: KaldikDay[] = [...kaldikDays];
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());

    while (cur <= end) {
      const dateStr = formatDateKey(cur);
      const existingIdx = newDays.findIndex((d) => d.date === dateStr);

      const dayObj: KaldikDay = {
        date: dateStr,
        isHoliday: status === 'holiday',
        keterangan: desc.trim(),
        isCustom: true,
      };

      if (existingIdx >= 0) {
        newDays[existingIdx] = dayObj;
      } else {
        newDays.push(dayObj);
      }

      cur.setDate(cur.getDate() + 1);
    }

    onSaveDays(newDays);
    showToast(`Berhasil menyimpan pengaturan tanggal libur!`, 'success');
    setStartDate('');
    setEndDate('');
    setDesc('');
  };

  const handleDelete = (date: string) => {
    const updated = kaldikDays.filter((d) => d.date !== date);
    onSaveDays(updated);
    showToast(`Tanggal ${date} berhasil dihapus dari daftar libur`, 'success');
  };

  const fillPreset = (text: string) => {
    setDesc(text);
  };

  const holidaysList = [...kaldikDays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="fixed inset-0 z-[930] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full rounded-3xl shadow-2xl border-2 border-rose-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-gradient-to-r from-rose-600 via-rose-700 to-amber-500 text-white flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-white/20 px-2.5 py-0.5 rounded-full">
              Kustomisasi Hari Libur & Hari Efektif
            </span>
            <h3 className="font-display font-black text-base sm:text-lg mt-0.5">
              Menu Edit Tanggal & Tambah Libur di Luar Kaldik
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-rose-800 text-white flex items-center justify-center text-sm font-bold transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <form onSubmit={handleAdd} className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-extrabold text-xs sm:text-sm text-rose-900 flex items-center gap-1.5">
                <CalendarPlus className="w-4 h-4 text-rose-600" /> Tambah / Edit Tanggal Libur (1 Hari atau Rentang)
              </h4>
              <span className="text-[10px] font-bold bg-white text-slate-600 px-2.5 py-0.5 rounded-full border">
                Otomatis Sinkron Rekap Absensi
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Mulai Tanggal:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Sampai Tanggal (Opsional):</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Status Tanggal:</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-extrabold text-rose-800"
                >
                  <option value="holiday">Tetapkan Sebagai Hari Libur</option>
                  <option value="effective">Tetapkan Sebagai Hari Efektif Masuk</option>
                </select>
              </div>
              <div className="sm:col-span-7">
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Keterangan Libur / Catatan:</label>
                <input
                  type="text"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  required
                  placeholder="Contoh: Libur Khusus Sekolah / Raker Guru / Cuaca Ekstrem"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => fillPreset('Libur Khusus SDN Rawa Badak Utara 21')}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-rose-200 font-bold text-slate-700"
                >
                  + Libur Khusus Sekolah
                </button>
                <button
                  type="button"
                  onClick={() => fillPreset('Kegiatan Rapat Kerja / Workshop Guru')}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-rose-200 font-bold text-slate-700"
                >
                  + Raker / Workshop Guru
                </button>
                <button
                  type="button"
                  onClick={() => fillPreset('Cuti / Libur Insidental Daerah')}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-rose-200 font-bold text-slate-700"
                >
                  + Libur Insidental
                </button>
              </div>
              <button
                type="submit"
                className="bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-4 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" /> Simpan Tanggal
              </button>
            </div>
          </form>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-extrabold text-xs uppercase text-slate-700">
                Daftar Hari Libur Tersimpan (Kaldik & Tambahan)
              </h4>
              <span className="text-[11px] font-extrabold bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full">
                {holidaysList.length} Tanggal
              </span>
            </div>
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100">
              {holidaysList.map((d) => (
                <div key={d.date} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        d.isHoliday ? 'bg-rose-600' : 'bg-emerald-600'
                      }`}
                    />
                    <div>
                      <span className="font-mono font-bold text-slate-800">{d.date}</span>
                      <span className="text-slate-500 ml-2">
                        {d.isHoliday ? '(Libur)' : '(Efektif)'}: {d.keterangan}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(d.date)}
                    className="text-rose-500 hover:text-rose-700 p-1"
                    title="Hapus Tanggal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
