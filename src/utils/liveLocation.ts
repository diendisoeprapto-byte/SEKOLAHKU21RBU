/**
 * ============================================================================
 * SERBU 21 - Sistem Pelacakan Lokasi Live & Jadwal Sholat Realtime
 * ============================================================================
 * Menyediakan pelacakan lokasi berbasis GPS perangkat presisi tinggi,
 * fallback pintar IP Geolocation saat GPS dibatasi browser/iframe,
 * reverse geocoding otomatis (Kelurahan, Kecamatan, Kota/Kabupaten, Provinsi),
 * serta kalkulasi jadwal sholat 5 waktu realtime terhubung ke Aladhan API.
 */

import { useState, useEffect, useCallback } from 'react';

export interface PrayerScheduleTimes {
  Subuh: string;
  Dzuhur: string;
  Ashar: string;
  Maghrib: string;
  Isya: string;
}

export interface LiveLocationData {
  latitude: number;
  longitude: number;
  accuracy?: number; // dalam meter
  source: 'gps_high' | 'gps_coarse' | 'ip' | 'fallback';
  locationName: string;
  subDistrict?: string;
  district?: string;
  city?: string;
  province?: string;
  updatedAt: string; // Jam menit WIB
  updatedTimestamp: number;
  prayerTimes: PrayerScheduleTimes;
  activePrayer: keyof PrayerScheduleTimes | null;
  nextPrayer: {
    name: keyof PrayerScheduleTimes;
    time: string;
    remainingMinutes: number;
  } | null;
  isLive: boolean;
  googleMapsUrl: string;
}

const DEFAULT_FALLBACK_LAT = -6.1189;
const DEFAULT_FALLBACK_LNG = 106.9016;
const DEFAULT_FALLBACK_LOCATION = 'Rawa Badak Utara, Koja, Jakarta Utara';

const DEFAULT_PRAYER_TIMES: PrayerScheduleTimes = {
  Subuh: '04:15',
  Dzuhur: '11:45',
  Ashar: '15:10',
  Maghrib: '17:55',
  Isya: '19:10',
};

const STORAGE_KEY = 'serbu21_live_location_v2';
const EVENT_NAME = 'serbu21-live-location-updated';

function getNowWib(): {
  dateStr: string;
  ddMmYyyy: string;
  hour: number;
  minute: number;
  totalMinutes: number;
  timeStr: string;
} {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const year = get('year') || String(now.getFullYear());
    const month = get('month') || String(now.getMonth() + 1).padStart(2, '0');
    const day = get('day') || String(now.getDate()).padStart(2, '0');
    const hourRaw = parseInt(get('hour') || String(now.getHours()), 10);
    const hour = hourRaw === 24 ? 0 : Number.isFinite(hourRaw) ? hourRaw : now.getHours();
    const minute = parseInt(get('minute') || String(now.getMinutes()), 10) || 0;
    return {
      dateStr: `${year}-${month}-${day}`,
      ddMmYyyy: `${day}-${month}-${year}`,
      hour,
      minute,
      totalMinutes: hour * 60 + minute,
      timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} WIB`,
    };
  } catch {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = now.getHours();
    const minute = now.getMinutes();
    return {
      dateStr: `${year}-${month}-${day}`,
      ddMmYyyy: `${day}-${month}-${year}`,
      hour,
      minute,
      totalMinutes: hour * 60 + minute,
      timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} WIB`,
    };
  }
}

function parseHhMmToMinutes(hhmm: string): number {
  const clean = String(hhmm || '').trim().slice(0, 5);
  const [hStr, mStr] = clean.split(':');
  const h = parseInt(hStr || '0', 10);
  const m = parseInt(mStr || '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

function cleanAladhanTime(raw?: string, fallback = '00:00'): string {
  const match = String(raw || '').match(/(\d{1,2}:\d{2})/);
  if (!match) return fallback;
  const [h, m] = match[1].split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function computePrayerStatus(
  prayerTimes: PrayerScheduleTimes,
  totalMinutes: number
): {
  activePrayer: keyof PrayerScheduleTimes | null;
  nextPrayer: LiveLocationData['nextPrayer'];
} {
  const subuhM = parseHhMmToMinutes(prayerTimes.Subuh);
  const dzuhurM = parseHhMmToMinutes(prayerTimes.Dzuhur);
  const asharM = parseHhMmToMinutes(prayerTimes.Ashar);
  const maghribM = parseHhMmToMinutes(prayerTimes.Maghrib);
  const isyaM = parseHhMmToMinutes(prayerTimes.Isya);

  let activePrayer: keyof PrayerScheduleTimes | null = null;
  if (subuhM >= 0 && totalMinutes >= subuhM && totalMinutes <= subuhM + 75) {
    activePrayer = 'Subuh';
  } else if (dzuhurM >= 0 && totalMinutes >= dzuhurM && totalMinutes <= dzuhurM + 120) {
    activePrayer = 'Dzuhur';
  } else if (asharM >= 0 && totalMinutes >= asharM && totalMinutes <= asharM + 100) {
    activePrayer = 'Ashar';
  } else if (maghribM >= 0 && totalMinutes >= maghribM && totalMinutes <= maghribM + 55) {
    activePrayer = 'Maghrib';
  } else if (isyaM >= 0 && totalMinutes >= isyaM && totalMinutes <= isyaM + 180) {
    activePrayer = 'Isya';
  }

  // Hitung sholat berikutnya
  const scheduleOrder: Array<{ name: keyof PrayerScheduleTimes; minutes: number; time: string }> = [
    { name: 'Subuh', minutes: subuhM, time: prayerTimes.Subuh },
    { name: 'Dzuhur', minutes: dzuhurM, time: prayerTimes.Dzuhur },
    { name: 'Ashar', minutes: asharM, time: prayerTimes.Ashar },
    { name: 'Maghrib', minutes: maghribM, time: prayerTimes.Maghrib },
    { name: 'Isya', minutes: isyaM, time: prayerTimes.Isya },
  ];

  let nextPrayer: LiveLocationData['nextPrayer'] = null;
  for (const item of scheduleOrder) {
    if (item.minutes > totalMinutes) {
      nextPrayer = {
        name: item.name,
        time: item.time,
        remainingMinutes: item.minutes - totalMinutes,
      };
      break;
    }
  }

  // Jika sudah lewat Isya, jadwal berikutnya adalah Subuh besok
  if (!nextPrayer && subuhM >= 0) {
    const remainingToMidnight = 24 * 60 - totalMinutes;
    nextPrayer = {
      name: 'Subuh',
      time: prayerTimes.Subuh,
      remainingMinutes: remainingToMidnight + subuhM,
    };
  }

  return { activePrayer, nextPrayer };
}

/**
 * Reverse geocoding bertingkat:
 * 1. OpenStreetMap Nominatim
 * 2. Photon Komoot
 */
export async function reverseGeocodeLive(
  lat: number,
  lng: number
): Promise<{
  locationName: string;
  subDistrict?: string;
  district?: string;
  city?: string;
  province?: string;
}> {
  // Percobaan 1: Nominatim OpenStreetMap
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&zoom=14&accept-language=id`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'id, en' },
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const addr = data?.address || {};
      const subDistrict = addr.village || addr.suburb || addr.quarter || addr.city_district || '';
      const district = addr.suburb || addr.municipality || addr.district || addr.county || '';
      const city = addr.city || addr.town || addr.city_district || addr.state_district || '';
      const province = addr.state || 'DKI Jakarta';

      const parts = [subDistrict, district, city].filter((p, i, arr) => p && arr.indexOf(p) === i);
      const locationName = parts.length > 0 ? parts.join(', ') : data.name || DEFAULT_FALLBACK_LOCATION;

      return {
        locationName,
        subDistrict,
        district,
        city,
        province,
      };
    }
  } catch {
    // Lanjut ke fallback Photon Komoot
  }

  // Percobaan 2: Photon Komoot
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const props = data?.features?.[0]?.properties || {};
      const subDistrict = props.locality || props.district || '';
      const district = props.district || props.city || '';
      const city = props.city || props.county || '';
      const province = props.state || '';

      const parts = [subDistrict, district, city].filter((p, i, arr) => p && arr.indexOf(p) === i);
      const locationName = parts.length > 0 ? parts.join(', ') : DEFAULT_FALLBACK_LOCATION;

      return {
        locationName,
        subDistrict,
        district,
        city,
        province,
      };
    }
  } catch {
    // Gagal fallback
  }

  return { locationName: DEFAULT_FALLBACK_LOCATION };
}

/**
 * Fetch jadwal sholat realtime via Aladhan API
 */
export async function fetchLivePrayerTimes(
  lat: number,
  lng: number,
  ddMmYyyy: string
): Promise<PrayerScheduleTimes> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const url = `https://api.aladhan.com/v1/timings/${ddMmYyyy}?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(lng)}&method=20`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return DEFAULT_PRAYER_TIMES;
    const json = await res.json();
    const timings = json?.data?.timings;
    if (!timings) return DEFAULT_PRAYER_TIMES;
    return {
      Subuh: cleanAladhanTime(timings.Fajr, DEFAULT_PRAYER_TIMES.Subuh),
      Dzuhur: cleanAladhanTime(timings.Dhuhr, DEFAULT_PRAYER_TIMES.Dzuhur),
      Ashar: cleanAladhanTime(timings.Asr, DEFAULT_PRAYER_TIMES.Ashar),
      Maghrib: cleanAladhanTime(timings.Maghrib, DEFAULT_PRAYER_TIMES.Maghrib),
      Isya: cleanAladhanTime(timings.Isha, DEFAULT_PRAYER_TIMES.Isya),
    };
  } catch {
    return DEFAULT_PRAYER_TIMES;
  }
}

/**
 * Mendeteksi koordinat melalui GPS perangkat atau fallback IP Geolocation
 */
async function resolveCurrentCoordinates(forceHighAccuracy = false): Promise<{
  latitude: number;
  longitude: number;
  accuracy?: number;
  source: 'gps_high' | 'gps_coarse' | 'ip' | 'fallback';
}> {
  // 1. Coba GPS browser jika didukung
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        const timeout = forceHighAccuracy ? 10000 : 6000;
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout,
          maximumAge: 0,
        });
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 0),
        source: 'gps_high',
      };
    } catch {
      // Coba GPS dengan akurasi standar
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 60000,
          });
        });
        return {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
          source: 'gps_coarse',
        };
      } catch {
        // Lanjut ke IP Geolocation
      }
    }
  }

  // 2. Fallback ke IP Geolocation publik (aman untuk iframe tanpa sensor GPS)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const ipRes = await fetch('https://ipwho.is/', { signal: controller.signal });
    clearTimeout(timer);
    if (ipRes.ok) {
      const ipData = await ipRes.json();
      if (ipData?.success && Number.isFinite(ipData.latitude) && Number.isFinite(ipData.longitude)) {
        return {
          latitude: ipData.latitude,
          longitude: ipData.longitude,
          accuracy: 5000,
          source: 'ip',
        };
      }
    }
  } catch {
    // Lanjut fallback default
  }

  // 3. Fallback default (Koja, Jakarta Utara)
  return {
    latitude: DEFAULT_FALLBACK_LAT,
    longitude: DEFAULT_FALLBACK_LNG,
    accuracy: 100,
    source: 'fallback',
  };
}

/**
 * Mendapatkan data lokasi live terbaru (dengan caching cerdas & sinkronisasi otomatis)
 */
export async function getLiveLocationData(forceRefresh = false): Promise<LiveLocationData> {
  const { ddMmYyyy, totalMinutes, timeStr } = getNowWib();

  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const cached = window.localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as LiveLocationData;
        const now = Date.now();
        // Pakai cache jika masih dalam 10 menit terakhir dan bukan fallback
        if (parsed && now - parsed.updatedTimestamp < 10 * 60 * 1000) {
          const { activePrayer, nextPrayer } = computePrayerStatus(parsed.prayerTimes, totalMinutes);
          return {
            ...parsed,
            activePrayer,
            nextPrayer,
            updatedAt: timeStr,
          };
        }
      }
    } catch {
      // Ignore cache parse error
    }
  }

  const coords = await resolveCurrentCoordinates(forceRefresh);
  const [geoInfo, prayerTimes] = await Promise.all([
    reverseGeocodeLive(coords.latitude, coords.longitude),
    fetchLivePrayerTimes(coords.latitude, coords.longitude, ddMmYyyy),
  ]);

  const { activePrayer, nextPrayer } = computePrayerStatus(prayerTimes, totalMinutes);

  const result: LiveLocationData = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    source: coords.source,
    locationName: geoInfo.locationName || DEFAULT_FALLBACK_LOCATION,
    subDistrict: geoInfo.subDistrict,
    district: geoInfo.district,
    city: geoInfo.city,
    province: geoInfo.province,
    updatedAt: timeStr,
    updatedTimestamp: Date.now(),
    prayerTimes,
    activePrayer,
    nextPrayer,
    isLive: coords.source === 'gps_high' || coords.source === 'gps_coarse',
    googleMapsUrl: `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`,
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: result }));
    } catch {
      // Ignore storage errors
    }
  }

  return result;
}

/**
 * Hook React untuk memantau lokasi secara live di komponen UI
 */
export function useLiveLocation(): {
  location: LiveLocationData;
  isLoading: boolean;
  isCalibrating: boolean;
  error: string | null;
  refreshLocation: (forceGps?: boolean) => Promise<LiveLocationData>;
} {
  const [location, setLocation] = useState<LiveLocationData>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    const { timeStr, totalMinutes } = getNowWib();
    const { activePrayer, nextPrayer } = computePrayerStatus(DEFAULT_PRAYER_TIMES, totalMinutes);
    return {
      latitude: DEFAULT_FALLBACK_LAT,
      longitude: DEFAULT_FALLBACK_LNG,
      source: 'fallback',
      locationName: DEFAULT_FALLBACK_LOCATION,
      updatedAt: timeStr,
      updatedTimestamp: Date.now(),
      prayerTimes: DEFAULT_PRAYER_TIMES,
      activePrayer,
      nextPrayer,
      isLive: false,
      googleMapsUrl: `https://www.google.com/maps?q=${DEFAULT_FALLBACK_LAT},${DEFAULT_FALLBACK_LNG}`,
    };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshLocation = useCallback(async (forceGps = true): Promise<LiveLocationData> => {
    setIsCalibrating(true);
    setError(null);
    try {
      const data = await getLiveLocationData(forceGps);
      setLocation(data);
      return data;
    } catch (err: any) {
      setError(err?.message || 'Gagal memperbarui lokasi');
      return location;
    } finally {
      setIsCalibrating(false);
    }
  }, [location]);

  // Listener event perubahan lokasi antar-tab / komponen
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<LiveLocationData>;
      if (customEvent.detail) {
        setLocation(customEvent.detail);
      }
    };

    window.addEventListener(EVENT_NAME, handleCustomEvent);
    return () => window.removeEventListener(EVENT_NAME, handleCustomEvent);
  }, []);

  // Inisialisasi awal & pendaftaran live watchPosition
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    getLiveLocationData(false)
      .then((data) => {
        if (isMounted) setLocation(data);
      })
      .catch((err) => {
        if (isMounted) setError(err?.message || null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // Pasang watchPosition untuk live update otomatis saat berpindah tempat
    let watchId: number | null = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        watchId = navigator.geolocation.watchPosition(
          async (pos) => {
            if (!isMounted) return;
            const deltaLat = Math.abs(pos.coords.latitude - location.latitude);
            const deltaLng = Math.abs(pos.coords.longitude - location.longitude);
            // Perbarui hanya jika perpindahan signifikan (> 0.0005 deg atau ~50m)
            if (deltaLat > 0.0005 || deltaLng > 0.0005 || !location.isLive) {
              const fresh = await getLiveLocationData(true);
              if (isMounted) setLocation(fresh);
            }
          },
          () => {
            // Watch silent error, keep fallback
          },
          { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
        );
      } catch {
        // Watch not supported
      }
    }

    return () => {
      isMounted = false;
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  return {
    location,
    isLoading,
    isCalibrating,
    error,
    refreshLocation,
  };
}
