/**
 * Utilitas tanggal & waktu real-time Indonesia (WIB / WITA / WIT)
 * Menghindari bug tanggal mundur sehari akibat konversi UTC (toISOString)
 * maupun perbedaan zona waktu server/browser luar negeri.
 */

function isIndonesianLocalTimezone(date: Date = new Date()): boolean {
  // getTimezoneOffset() mengembalikan menit relatif terhadap UTC (negatif untuk UTC+).
  // WIB = -420, WITA = -480, WIT = -540.
  const offset = date.getTimezoneOffset();
  return offset <= -420 && offset >= -540;
}

/**
 * Mengembalikan tanggal hari ini ('YYYY-MM-DD') secara real-time sesuai zona waktu Indonesia.
 * Jika perangkat pengguna berada di zona waktu WIB/WITA/WIT, gunakan jam lokal perangkat.
 * Jika perangkat/browser berada di luar zona Indonesia (misal UTC / server luar), gunakan Asia/Jakarta (WIB).
 */
export function getLocalTodayStr(date: Date = new Date()): string {
  if (isIndonesianLocalTimezone(date)) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) {
      return `${y}-${m}-${d}`;
    }
  } catch {
    // fallback di bawah
  }

  // Fallback manual UTC+7 (WIB)
  const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
  const wibDate = new Date(wibMs);
  return `${wibDate.getUTCFullYear()}-${String(wibDate.getUTCMonth() + 1).padStart(2, '0')}-${String(
    wibDate.getUTCDate()
  ).padStart(2, '0')}`;
}

export function getLocalYearMonthStr(date: Date = new Date()): string {
  return getLocalTodayStr(date).slice(0, 7);
}

/**
 * Mengembalikan jam real-time ('HH:mm' atau 'HH:mm:ss') sesuai zona waktu Indonesia.
 */
export function getLocalTimeStr(date: Date = new Date(), withSeconds: boolean = false): string {
  if (isIndonesianLocalTimezone(date)) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    if (!withSeconds) return `${hh}:${mm}`;
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const hh = parts.find((p) => p.type === 'hour')?.value || '00';
    const mm = parts.find((p) => p.type === 'minute')?.value || '00';
    const ss = parts.find((p) => p.type === 'second')?.value || '00';
    return withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  } catch {
    const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
    const wibDate = new Date(wibMs);
    const hh = String(wibDate.getUTCHours()).padStart(2, '0');
    const mm = String(wibDate.getUTCMinutes()).padStart(2, '0');
    if (!withSeconds) return `${hh}:${mm}`;
    const ss = String(wibDate.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
}

/**
 * Memformat objek Date lokal hasil konstruksi new Date(year, month - 1, day) menjadi 'YYYY-MM-DD'
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Mengurai string 'YYYY-MM-DD' sebagai tanggal lokal (jam 00:00 waktu lokal),
 * agar .getDay() tidak bergeser akibat UTC midnight.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const parts = dateStr.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date();
  }
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

const HARI_INDO = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_INDO = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function formatTanggalIndo(dateStr: string, withDayName: boolean = true): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return dateStr;
  const [year, month, day] = parts;
  const localDate = new Date(year, month - 1, day);
  const bulan = BULAN_INDO[month - 1] || '';
  if (!withDayName) {
    return `${day} ${bulan} ${year}`;
  }
  const hari = HARI_INDO[localDate.getDay()] || '';
  return `${hari}, ${day} ${bulan} ${year}`;
}
