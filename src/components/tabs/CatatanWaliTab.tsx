import React, { useState } from 'react';
import { MessageSquare, Save, User, Sparkles } from 'lucide-react';
import { Student, StudentReportNotes } from '../../types';
import { getStoredReportNotes, saveStoredReportNotes } from '../../utils/storage';

interface Props {
  students: Student[];
  activeClass: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
}

export const CatatanWaliTab: React.FC<Props> = ({
  students,
  activeClass,
  showToast,
  onOpenZoom,
}) => {
  const [reportNotes, setReportNotes] = useState<Record<string, StudentReportNotes>>(getStoredReportNotes());

  const filteredStudents = students.filter((s) => s.kelas === activeClass);

  const handleNoteChange = (studentId: string, field: 'catatanWali' | 'keputusanKenaikan', value: string) => {
    setReportNotes((prev) => {
      const current = prev[studentId] || {
        studentId,
        catatanWali: '',
        keputusanKenaikan: '',
        ekskul: [],
        p5: [],
      };
      return {
        ...prev,
        [studentId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const handleSave = () => {
    saveStoredReportNotes(reportNotes);
    showToast('Catatan Wali Kelas & Keputusan Kenaikan berhasil disimpan!', 'success');
  };

  const DAFTAR_PILIHAN_KEPUTUSAN = [
    'Naik ke Kelas I (Satu)',
    'Naik ke Kelas II (Dua)',
    'Naik ke Kelas III (Tiga)',
    'Naik ke Kelas IV (Empat)',
    'Naik ke Kelas V (Lima)',
    'Naik ke Kelas VI (Enam)',
    'Lulus ke Jenjang SMP',
    'Tinggal di Kelas',
  ] as const;

  const getDefaultDecision = (kelas: string) => {
    if (kelas.startsWith('Kelas 6') || kelas.includes('6')) return 'Lulus ke Jenjang SMP';
    if (kelas.includes('1') || kelas.toUpperCase().includes(' I')) return 'Naik ke Kelas II (Dua)';
    if (kelas.includes('2') || kelas.toUpperCase().includes(' II')) return 'Naik ke Kelas III (Tiga)';
    if (kelas.includes('3') || kelas.toUpperCase().includes(' III')) return 'Naik ke Kelas IV (Empat)';
    if (kelas.includes('4') || kelas.toUpperCase().includes(' IV')) return 'Naik ke Kelas V (Lima)';
    if (kelas.includes('5') || kelas.toUpperCase().includes(' V')) return 'Naik ke Kelas VI (Enam)';
    return 'Lulus ke Jenjang SMP';
  };

  const handleAutoPromoteAll = () => {
    const updated = { ...reportNotes };
    let count = 0;
    filteredStudents.forEach((s) => {
      const decision = getDefaultDecision(s.kelas);
      const prevNote = updated[s.id] || {
        studentId: s.id,
        catatanWali: 'Pertahankan prestasi belajar, sikap disiplin dan budi pekerti yang luhur.',
        keputusanKenaikan: decision,
        ekskul: [],
        p5: [],
      };
      updated[s.id] = {
        ...prevNote,
        keputusanKenaikan: decision,
      };
      count++;
    });
    setReportNotes(updated);
    saveStoredReportNotes(updated);
    showToast(`Berhasil! Seluruh ${count} siswa otomatis diset naik kelas / lulus sesuai jenjang kelas masing-masing.`, 'success');
  };

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
              Menu 4. Penilaian & Pelaporan • Evaluasi Perkembangan
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" /> Catatan Wali Kelas & Keputusan Kenaikan / Kelulusan
            </h2>
            <p className="text-xs text-slate-500">
              Catatan ini otomatis tampil di bagian bawah lembar <strong>e-Rapor Kurikulum Merdeka</strong> untuk masing-masing peserta didik ({activeClass}).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleAutoPromoteAll}
              className="bg-amber-500 hover:bg-amber-600 text-white font-display font-black px-4 py-2.5 rounded-2xl text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition cursor-pointer"
              title="Otomatis tentukan keputusan naik kelas ke jenjang berikutnya untuk seluruh siswa di kelas ini"
            >
              <Sparkles className="w-4 h-4" /> ⚡ Otomatis Naikkan Semua Siswa
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-display font-extrabold px-5 py-2.5 rounded-2xl text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 transition cursor-pointer"
            >
              <Save className="w-4 h-4" /> Simpan Seluruh Catatan
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {filteredStudents.map((s, idx) => {
            const defaultDecision = getDefaultDecision(activeClass);
            const savedData = reportNotes[s.id];
            const data = {
              studentId: s.id,
              catatanWali: savedData?.catatanWali ?? 'Pertahankan prestasi belajar, sikap disiplin dan budi pekerti yang luhur.',
              keputusanKenaikan: savedData?.keputusanKenaikan || defaultDecision,
              ekskul: savedData?.ekskul ?? [],
              p5: savedData?.p5 ?? [],
            };

            return (
              <div key={s.id} className="p-4 sm:p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={s.fotoUrl}
                      alt={s.nama}
                      onClick={() => onOpenZoom(s.fotoUrl, s.nama)}
                      className="w-10 h-10 rounded-xl object-cover border border-slate-300 cursor-zoom-in"
                    />
                    <div>
                      <h4 className="font-display font-black text-sm text-slate-800">{s.nama}</h4>
                      <span className="text-[11px] font-mono text-slate-500">NISN: {s.nisn} • {s.barcodeId}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-extrabold bg-white px-2.5 py-1 rounded-lg border text-slate-600">
                    No. Urut: {idx + 1}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-7">
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      Catatan Perkembangan Karakter & Akademik Wali Kelas:
                    </label>
                    <textarea
                      rows={2}
                      value={data.catatanWali}
                      onChange={(e) => handleNoteChange(s.id, 'catatanWali', e.target.value)}
                      placeholder="Tuliskan catatan perkembangan karakter, budi pekerti, dan motivasi belajar peserta didik..."
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="md:col-span-5">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-extrabold text-slate-700">
                        Keputusan Kenaikan / Kelulusan:
                      </label>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200">
                        Dropdown Menu
                      </span>
                    </div>
                    <select
                      value={data.keputusanKenaikan.includes('VII') ? 'Lulus ke Jenjang SMP' : data.keputusanKenaikan}
                      onChange={(e) => handleNoteChange(s.id, 'keputusanKenaikan', e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-emerald-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer shadow-2xs"
                    >
                      <option value="Naik ke Kelas I (Satu)">Naik ke Kelas I (Satu)</option>
                      <option value="Naik ke Kelas II (Dua)">Naik ke Kelas II (Dua)</option>
                      <option value="Naik ke Kelas III (Tiga)">Naik ke Kelas III (Tiga)</option>
                      <option value="Naik ke Kelas IV (Empat)">Naik ke Kelas IV (Empat)</option>
                      <option value="Naik ke Kelas V (Lima)">Naik ke Kelas V (Lima)</option>
                      <option value="Naik ke Kelas VI (Enam)">Naik ke Kelas VI (Enam)</option>
                      <option value="Lulus ke Jenjang SMP">Lulus ke Jenjang SMP</option>
                      <option value="Tinggal di Kelas">Tinggal di Kelas</option>
                      {data.keputusanKenaikan &&
                        !data.keputusanKenaikan.includes('VII') &&
                        !DAFTAR_PILIHAN_KEPUTUSAN.includes(data.keputusanKenaikan as any) && (
                          <option value={data.keputusanKenaikan}>{data.keputusanKenaikan}</option>
                        )}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Pilihan ini otomatis tercetak pada lembar e-Rapor resmi peserta didik.
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
