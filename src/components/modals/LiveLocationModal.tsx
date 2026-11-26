import React, { useEffect } from 'react';
import {
  X,
  MapPin,
  Compass,
  Navigation,
  RefreshCw,
  ExternalLink,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { LiveLocationData } from '../../utils/liveLocation';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  location: LiveLocationData;
  isCalibrating: boolean;
  onRefresh: (forceGps?: boolean) => Promise<any>;
}

export const LiveLocationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  location,
  isCalibrating,
  onRefresh,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-location-modal-title"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5 text-emerald-200 animate-pulse" />
            </div>
            <div>
              <h3 id="live-location-modal-title" className="font-display font-black text-base sm:text-lg leading-tight">
                Lokasi Live &amp; Jadwal Sholat
              </h3>
              <p className="text-xs text-emerald-100 flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
                <span>Terhubung Realtime • {location.updatedAt}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer transition"
            aria-label="Tutup modal lokasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {/* Status Badge */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Status Sensor Geolocation
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black ${
                  location.isLive
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    location.isLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                {location.source === 'gps_high'
                  ? 'GPS Akurasi Tinggi'
                  : location.source === 'gps_coarse'
                  ? 'GPS Perangkat'
                  : location.source === 'ip'
                  ? 'Jaringan IP Geolocation'
                  : 'Lokasi Standar Sekolah'}
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <MapPin className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h4 className="font-display font-black text-slate-900 text-sm sm:text-base leading-snug">
                  {location.locationName}
                </h4>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 font-mono">
                  <span>Lat: {location.latitude.toFixed(6)}</span>
                  <span>•</span>
                  <span>Lng: {location.longitude.toFixed(6)}</span>
                  {typeof location.accuracy === 'number' && location.accuracy > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-700 font-bold">
                        Akurasi ±{location.accuracy}m
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2">
              <a
                href={location.googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-800 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka Posisi di Google Maps</span>
              </a>

              <button
                type="button"
                onClick={() => onRefresh(true)}
                disabled={isCalibrating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCalibrating ? 'animate-spin' : ''}`} />
                <span>{isCalibrating ? 'Mendeteksi...' : 'Deteksi Ulang GPS'}</span>
              </button>
            </div>
          </div>

          {/* Jadwal Sholat Realtime */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/70 via-orange-50/50 to-emerald-50/60 border border-amber-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-display font-black text-amber-950">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Jadwal Sholat 5 Waktu Hari Ini</span>
              </div>
              {location.activePrayer ? (
                <span className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">
                  Waktu {location.activePrayer} Aktif
                </span>
              ) : location.nextPrayer ? (
                <span className="px-2 py-0.5 rounded-lg bg-amber-600 text-white text-[10px] font-black">
                  Menjelang {location.nextPrayer.name} ({Math.floor(location.nextPrayer.remainingMinutes / 60)}j {location.nextPrayer.remainingMinutes % 60}m)
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-5 gap-1.5 text-center">
              {[
                { name: 'Subuh', time: location.prayerTimes.Subuh },
                { name: 'Dzuhur', time: location.prayerTimes.Dzuhur },
                { name: 'Ashar', time: location.prayerTimes.Ashar },
                { name: 'Maghrib', time: location.prayerTimes.Maghrib },
                { name: 'Isya', time: location.prayerTimes.Isya },
              ].map((p) => {
                const isCurrent = location.activePrayer === p.name;
                const isNext = !location.activePrayer && location.nextPrayer?.name === p.name;
                return (
                  <div
                    key={p.name}
                    className={`p-2 rounded-xl border transition ${
                      isCurrent
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                        : isNext
                        ? 'bg-amber-100 text-amber-950 border-amber-300 font-bold'
                        : 'bg-white text-slate-800 border-slate-200/90'
                    }`}
                  >
                    <div
                      className={`text-[10px] font-extrabold uppercase ${
                        isCurrent ? 'text-emerald-100' : 'text-slate-500'
                      }`}
                    >
                      {p.name}
                    </div>
                    <div className="font-mono font-black text-xs sm:text-sm mt-0.5">{p.time}</div>
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-slate-500 italic text-center">
              Perhitungan presisi koordinat lintang/bujur otomatis via Aladhan Kemenag RI / Muslim World League.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Pelacakan aman di sisi peramban pengguna.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-emerald-700 text-white font-display font-black text-xs cursor-pointer transition shadow-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
