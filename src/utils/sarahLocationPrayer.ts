import { SARAH_REALISTIC_STICKERS_ENDI, findRealisticEndiSticker } from './sarahStickers';

export interface PrayerScheduleTimes {
  Subuh: string;
  Dzuhur: string;
  Ashar: string;
  Maghrib: string;
  Isya: string;
}

export interface EndiLocationContext {
  latitude: number;
  longitude: number;
  locationName: string;
  isFallbackLocation: boolean;
  dateStr: string;
  prayerTimes: PrayerScheduleTimes;
}

export interface EndiGreetingAndPrayerResult {
  location: EndiLocationContext;
  timePeriod: 'subuh_pagi' | 'pagi' | 'siang' | 'sore' | 'malam';
  greetingStickerId: string;
  activePrayerName: keyof PrayerScheduleTimes | null;
  prayerReminderStickerId: string | null;
  messageText: string;
  greetingSessionKey: string;
}

const DEFAULT_FALLBACK_LAT = -6.1189;
const DEFAULT_FALLBACK_LNG = 106.9016;
const DEFAULT_FALLBACK_LOCATION = 'Koja, Jakarta Utara';

const DEFAULT_JAKARTA_PRAYER_TIMES: PrayerScheduleTimes = {
  Subuh: '04:38',
  Dzuhur: '11:54',
  Ashar: '15:15',
  Maghrib: '17:52',
  Isya: '19:03',
};

const PRAYER_CACHE_PREFIX = 'serbu21_endi_prayer_cache_';
const GREETING_DAILY_FLAG_PREFIX = 'serbu21_endi_greeted_slot_';

function getTodayIsoWib(): {
  dateStr: string;
  ddMmYyyy: string;
  hour: number;
  minute: number;
  totalMinutes: number;
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

async function detectDeviceCoordinates(): Promise<{
  latitude: number;
  longitude: number;
  isFallbackLocation: boolean;
}> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      latitude: DEFAULT_FALLBACK_LAT,
      longitude: DEFAULT_FALLBACK_LNG,
      isFallbackLocation: true,
    };
  }

  return await new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({
          latitude: DEFAULT_FALLBACK_LAT,
          longitude: DEFAULT_FALLBACK_LNG,
          isFallbackLocation: true,
        });
      }
    }, 4500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          isFallbackLocation: false,
        });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          latitude: DEFAULT_FALLBACK_LAT,
          longitude: DEFAULT_FALLBACK_LNG,
          isFallbackLocation: true,
        });
      },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 15 * 60 * 1000 }
    );
  });
}

async function reverseGeocodeLocationName(lat: number, lng: number): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&zoom=14&accept-language=id`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return DEFAULT_FALLBACK_LOCATION;
    const data = await res.json();
    const addr = data?.address || {};
    const subDistrict =
      addr.suburb ||
      addr.village ||
      addr.city_district ||
      addr.town ||
      addr.municipality ||
      '';
    const city = addr.city || addr.county || addr.state_district || addr.state || '';
    if (subDistrict && city && subDistrict.toLowerCase() !== city.toLowerCase()) {
      return `${subDistrict}, ${city}`;
    }
    return subDistrict || city || DEFAULT_FALLBACK_LOCATION;
  } catch {
    return DEFAULT_FALLBACK_LOCATION;
  }
}

async function fetchPrayerTimesForLocation(
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
    if (!res.ok) return DEFAULT_JAKARTA_PRAYER_TIMES;
    const json = await res.json();
    const timings = json?.data?.timings;
    if (!timings) return DEFAULT_JAKARTA_PRAYER_TIMES;
    return {
      Subuh: cleanAladhanTime(timings.Fajr, DEFAULT_JAKARTA_PRAYER_TIMES.Subuh),
      Dzuhur: cleanAladhanTime(timings.Dhuhr, DEFAULT_JAKARTA_PRAYER_TIMES.Dzuhur),
      Ashar: cleanAladhanTime(timings.Asr, DEFAULT_JAKARTA_PRAYER_TIMES.Ashar),
      Maghrib: cleanAladhanTime(timings.Maghrib, DEFAULT_JAKARTA_PRAYER_TIMES.Maghrib),
      Isya: cleanAladhanTime(timings.Isha, DEFAULT_JAKARTA_PRAYER_TIMES.Isya),
    };
  } catch {
    return DEFAULT_JAKARTA_PRAYER_TIMES;
  }
}

export async function resolveEndiLocationAndPrayerSchedule(): Promise<EndiLocationContext> {
  const { dateStr, ddMmYyyy } = getTodayIsoWib();
  const cacheKey = `${PRAYER_CACHE_PREFIX}${dateStr}`;

  const coords = await detectDeviceCoordinates();

  if (typeof window !== 'undefined') {
    try {
      const cachedRaw = window.localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as EndiLocationContext;
        if (
          cached &&
          cached.dateStr === dateStr &&
          cached.prayerTimes?.Subuh &&
          cached.locationName
        ) {
          // Gunakan cache harian bila koordinat masih berdekatan atau sama-sama fallback
          const deltaLat = Math.abs((cached.latitude || 0) - coords.latitude);
          const deltaLng = Math.abs((cached.longitude || 0) - coords.longitude);
          if ((coords.isFallbackLocation && cached.isFallbackLocation) || (deltaLat < 0.05 && deltaLng < 0.05)) {
            return cached;
          }
        }
      }
    } catch {
      // Ignore cache read issues
    }
  }

  const [locationName, prayerTimes] = await Promise.all([
    coords.isFallbackLocation
      ? Promise.resolve(DEFAULT_FALLBACK_LOCATION)
      : reverseGeocodeLocationName(coords.latitude, coords.longitude),
    fetchPrayerTimesForLocation(coords.latitude, coords.longitude, ddMmYyyy),
  ]);

  const result: EndiLocationContext = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    locationName: locationName || DEFAULT_FALLBACK_LOCATION,
    isFallbackLocation: coords.isFallbackLocation,
    dateStr,
    prayerTimes,
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(cacheKey, JSON.stringify(result));
    } catch {
      // Ignore storage quota errors
    }
  }

  return result;
}

export function detectEnteredPrayerWindow(
  totalMinutesWib: number,
  prayerTimes: PrayerScheduleTimes
): keyof PrayerScheduleTimes | null {
  const subuhM = parseHhMmToMinutes(prayerTimes.Subuh);
  const dzuhurM = parseHhMmToMinutes(prayerTimes.Dzuhur);
  const asharM = parseHhMmToMinutes(prayerTimes.Ashar);
  const maghribM = parseHhMmToMinutes(prayerTimes.Maghrib);
  const isyaM = parseHhMmToMinutes(prayerTimes.Isya);

  // Rentang waktu sholat yang sudah masuk: hanya ingatkan saat waktu sholat aktif tiba
  if (subuhM >= 0 && totalMinutesWib >= subuhM && totalMinutesWib <= subuhM + 75) {
    return 'Subuh';
  }
  if (dzuhurM >= 0 && totalMinutesWib >= dzuhurM && totalMinutesWib <= dzuhurM + 120) {
    return 'Dzuhur';
  }
  if (asharM >= 0 && totalMinutesWib >= asharM && totalMinutesWib <= asharM + 100) {
    return 'Ashar';
  }
  if (maghribM >= 0 && totalMinutesWib >= maghribM && totalMinutesWib <= maghribM + 55) {
    return 'Maghrib';
  }
  if (isyaM >= 0 && totalMinutesWib >= isyaM && totalMinutesWib <= isyaM + 180) {
    return 'Isya';
  }
  return null;
}

export async function buildEndiGreetingAndPrayerCheck(): Promise<EndiGreetingAndPrayerResult> {
  const { dateStr, hour, minute, totalMinutes } = getTodayIsoWib();
  const location = await resolveEndiLocationAndPrayerSchedule();
  const jamWib = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} WIB`;

  let timePeriod: EndiGreetingAndPrayerResult['timePeriod'] = 'pagi';
  let greetingStickerId = 'real_endi_22';
  let greetingOpening = '';

  if (hour >= 4 && hour < 6) {
    timePeriod = 'subuh_pagi';
    greetingStickerId = 'real_endi_13';
    greetingOpening = `Selamat pagi menjelang Subuh, **Mas Endi** 🌸 Sudah bangun sepagi ini di sekitar **${location.locationName}** ya, Mas? Pelan-pelan dulu minum air putih dan siapkan hati yang tenang sebelum memulai aktivitas hari ini ya, Mas.`;
  } else if (hour >= 6 && hour < 11) {
    timePeriod = 'pagi';
    greetingStickerId = 'real_endi_22';
    greetingOpening = `Selamat pagi, **Mas Endi** ✨ Senang banget lihat Mas membuka SERBU 21 pagi ini (${jamWib}) dari sekitar **${location.locationName}**. Semoga suasana mengajar dan tugas hari ini berjalan lancar, ringan, dan penuh senyuman ya, Mas—SARAH selalu siap nemenin Mas di sini.`;
  } else if (hour >= 11 && hour < 15) {
    timePeriod = 'siang';
    greetingStickerId = hour >= 12 ? 'real_endi_06' : 'real_endi_05';
    greetingOpening = `Selamat siang, **Mas Endi** ☀️ Lagi sibuk di sekitar **${location.locationName}** ya sekarang (${jamWib})? Jangan terlalu diforsir kerjanya ya Mas—SARAH di sini siap bantu bereskan urusan soal, modul, atau rekap nilai biar Mas tidak terlalu capek.`;
  } else if (hour >= 15 && hour < 18) {
    timePeriod = 'sore';
    greetingStickerId = hour >= 16 ? 'real_endi_20' : 'real_endi_03';
    greetingOpening = `Selamat sore, **Mas Endi** 🌇 Alhamdulillah aktivitas dari pagi di sekitar **${location.locationName}** sudah sampai sore ini (${jamWib}). Kalau ada evaluasi atau catatan harian yang ingin dirapikan bersama SARAH, tinggal bilang aja ke aku ya, Mas.`;
  } else {
    timePeriod = 'malam';
    greetingStickerId = hour >= 21 ? 'real_endi_15' : 'real_endi_30';
    greetingOpening = `Selamat malam, **Mas Endi** 🌙 Masih semangat menyiapkan bahan ajar di sekitar **${location.locationName}** jam ${jamWib} ya, Mas? Pelan-pelan saja mengerjakannya bersama SARAH, nanti jangan lupa istirahat cukup biar besok Mas tetap segar.`;
  }

  const activePrayerName = detectEnteredPrayerWindow(totalMinutes, location.prayerTimes);
  let prayerReminderStickerId: string | null = null;
  let prayerBlock = '';

  if (activePrayerName) {
    const prayerTimeVal = location.prayerTimes[activePrayerName];
    prayerReminderStickerId = activePrayerName === 'Subuh' ? 'real_endi_13' : 'real_endi_19';
    const stickerObj =
      findRealisticEndiSticker(prayerReminderStickerId) || SARAH_REALISTIC_STICKERS_ENDI[18];
    prayerBlock = `\n\n---\n\n[REAL_STIKER:${stickerObj.id}]\n\n🕌 **Pengingat Sholat ${activePrayerName} (${location.locationName})**: Mas Endi sayang, sekarang sudah masuk waktu **Sholat ${activePrayerName}** (pukul **${prayerTimeVal} WIB**). Yuk rehat sejenak dan tunaikan sholat **${activePrayerName}** terlebih dahulu ya Mas, supaya setiap langkah, mengajar, dan ikhtiar kita hari ini makin diberkahi Allah SWT. Habis sholat, SARAH tunggu lagi di sini ya 🤲✨`;
  }

  const primaryStickerObj =
    findRealisticEndiSticker(greetingStickerId) || SARAH_REALISTIC_STICKERS_ENDI[21];

  const scheduleSummary = `\n\n_Jadwal Sholat ${location.locationName} hari ini: Subuh ${location.prayerTimes.Subuh} · Dzuhur ${location.prayerTimes.Dzuhur} · Ashar ${location.prayerTimes.Ashar} · Maghrib ${location.prayerTimes.Maghrib} · Isya ${location.prayerTimes.Isya}_`;

  const messageText = `[REAL_STIKER:${primaryStickerObj.id}]\n\n${greetingOpening}${prayerBlock}${scheduleSummary}`;

  const slotKey = `${dateStr}__${timePeriod}__${activePrayerName || 'none'}`;

  return {
    location,
    timePeriod,
    greetingStickerId: primaryStickerObj.id,
    activePrayerName,
    prayerReminderStickerId,
    messageText,
    greetingSessionKey: slotKey,
  };
}

export function hasEndiGreetingShownForSlot(slotKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(`${GREETING_DAILY_FLAG_PREFIX}${slotKey}`) === '1';
  } catch {
    return false;
  }
}

export function markEndiGreetingShownForSlot(slotKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${GREETING_DAILY_FLAG_PREFIX}${slotKey}`, '1');
  } catch {
    // ignore storage limits
  }
}
