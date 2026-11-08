import React, { useState } from 'react';
import { School, Save, CheckCircle } from 'lucide-react';
import { SchoolProfile } from '../../types';

interface Props {
  profile: SchoolProfile;
  onSaveProfile: (profile: SchoolProfile) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const ProfilSekolahTab: React.FC<Props> = ({ profile, onSaveProfile, showToast }) => {
  const [formData, setFormData] = useState<SchoolProfile>({ ...profile });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile(formData);
    showToast('Data Profil Sekolah & Kepala Sekolah berhasil diperbarui!', 'success');
  };

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase bg-rose-100 text-rose-700 px-3 py-1 rounded-full">
              Menu 1. Manajemen • Identitas Satuan Pendidikan
            </span>
            <h2 className="text-xl font-display font-black text-slate-800 mt-1">
              Data Profil Sekolah & Identitas Kepala Sekolah
            </h2>
            <p className="text-xs text-slate-500 max-w-3xl mt-1">
              Apabila <strong>Nama Sekolah</strong> diubah di bawah ini, maka seluruh tampilan nama sekolah di
              aplikasi (Header, Kartu Barcode, Leger, e-Rapor, Rapor Kokurikuler, dan Laporan) akan otomatis
              berganti seketika.
            </p>
          </div>
          <span className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-display font-extrabold text-xs flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-600" /> Terkoneksi ke Seluruh Dokumen & e-Rapor
          </span>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50 p-5 rounded-3xl border border-slate-200">
          <div className="lg:col-span-2">
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Nama Sekolah (Otomatis Mengubah Seluruh Nama Sekolah di Aplikasi)
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Contoh: SDN Rawa Badak Utara 21"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-emerald-500 focus:border-sky-600 outline-none bg-white text-sm font-display font-black text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">NPSN / NSS Sekolah</label>
            <input
              type="text"
              value={formData.npsn}
              onChange={(e) => setFormData({ ...formData, npsn: e.target.value })}
              required
              placeholder="20100789"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">Kecamatan</label>
            <input
              type="text"
              value={formData.kecamatan}
              onChange={(e) => setFormData({ ...formData, kecamatan: e.target.value })}
              required
              placeholder="Kecamatan Koja"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Kota / Kabupaten Administrasi
            </label>
            <input
              type="text"
              value={formData.kota}
              onChange={(e) => setFormData({ ...formData, kota: e.target.value })}
              required
              placeholder="Kota Administrasi Jakarta Utara"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">Provinsi</label>
            <input
              type="text"
              value={formData.provinsi}
              onChange={(e) => setFormData({ ...formData, provinsi: e.target.value })}
              required
              placeholder="DKI Jakarta"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs font-extrabold text-slate-700 mb-1">Alamat Lengkap Sekolah</label>
            <input
              type="text"
              value={formData.alamat}
              onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
              required
              placeholder="Jl. Rawa Badak Utara No. 21, Kec. Koja, Kota Administrasi Jakarta Utara"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
            />
          </div>

          {/* Data Kepala Sekolah */}
          <div className="md:col-span-2 lg:col-span-3 pt-3 border-t border-slate-200">
            <span className="text-[11px] font-extrabold uppercase text-rose-700 block mb-2">
              <School className="w-3.5 h-3.5 inline mr-1" />
              Identitas Kepala Sekolah (Terkoneksi Otomatis ke e-Rapor & Rapor Kokurikuler: Nama, Status
              Pegawai & NIP/NIPPPK/NIKKI)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Nama Kepala Sekolah (Lengkap dengan Gelar)
                </label>
                <input
                  type="text"
                  value={formData.kepalaSekolah.nama}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      kepalaSekolah: { ...formData.kepalaSekolah, nama: e.target.value },
                    })
                  }
                  required
                  placeholder="Darti Isyanti, M.Pd"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Status Pegawai Kepala Sekolah
                </label>
                <select
                  value={formData.kepalaSekolah.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      kepalaSekolah: { ...formData.kepalaSekolah, status: e.target.value as any },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-extrabold text-slate-800"
                >
                  <option value="PNS">1. PNS (Memakai NIP.)</option>
                  <option value="PPPK">2. PPPK (Memakai NIPPPK.)</option>
                  <option value="KKI">3. KKI (Memakai NIKKI.)</option>
                  <option value="Honor">4. Honor (Tanda "-")</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Nomor Identitas (NIP / NIPPPK / NIKKI)
                </label>
                <input
                  type="text"
                  value={formData.kepalaSekolah.nip}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      kepalaSekolah: { ...formData.kepalaSekolah, nip: e.target.value },
                    })
                  }
                  placeholder="197710102017082001"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-3 flex items-center justify-end gap-2 pt-2">
            <button
              type="submit"
              className="bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold px-6 py-2.5 rounded-2xl text-xs shadow-md flex items-center gap-2 transition cursor-pointer"
            >
              <Save className="w-4 h-4" /> Simpan Profil Sekolah & Kepala Sekolah
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};
