export interface AcademicSemesterRange {
  startYear: number;
  endYear: number;
  isSemester1: boolean;
  startMonth: string; // YYYY-MM
  endMonth: string;   // YYYY-MM
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  months: string[];   // ['YYYY-MM', ...]
  label: string;
}

export const isSemesterOneLabel = (semester?: string): boolean => {
  const s = (semester || '').toLowerCase().trim();
  if (!s) return true;
  if (s.includes('2') || s.includes('genap')) return false;
  return true;
};

export const parseAcademicYear = (
  activeYear: string = '2026/2027'
): { startYear: number; endYear: number } => {
  const match = String(activeYear || '').match(/(\d{4})\s*[/\-]\s*(\d{4})/);
  if (match) {
    return {
      startYear: Number(match[1]),
      endYear: Number(match[2]),
    };
  }
  const single = String(activeYear || '').match(/(\d{4})/);
  const y = single ? Number(single[1]) : 2026;
  return { startYear: y, endYear: y + 1 };
};

export const getSemesterDateRange = (
  activeYear: string = '2026/2027',
  activeSemester: string = 'Semester 1'
): AcademicSemesterRange => {
  const { startYear, endYear } = parseAcademicYear(activeYear);
  const sem1 = isSemesterOneLabel(activeSemester);

  if (sem1) {
    const months = ['07', '08', '09', '10', '11', '12'].map((m) => `${startYear}-${m}`);
    return {
      startYear,
      endYear,
      isSemester1: true,
      startMonth: `${startYear}-07`,
      endMonth: `${startYear}-12`,
      startDate: `${startYear}-07-01`,
      endDate: `${startYear}-12-31`,
      months,
      label: `Juli – Desember ${startYear}`,
    };
  }

  const months = ['01', '02', '03', '04', '05', '06'].map((m) => `${endYear}-${m}`);
  return {
    startYear,
    endYear,
    isSemester1: false,
    startMonth: `${endYear}-01`,
    endMonth: `${endYear}-06`,
    startDate: `${endYear}-01-01`,
    endDate: `${endYear}-06-30`,
    months,
    label: `Januari – Juni ${endYear}`,
  };
};

const ID_MONTH_MAP: Record<string, string> = {
  januari: '01',
  jan: '01',
  februari: '02',
  feb: '02',
  pebruari: '02',
  maret: '03',
  mar: '03',
  april: '04',
  apr: '04',
  mei: '05',
  may: '05',
  juni: '06',
  jun: '06',
  juli: '07',
  jul: '07',
  agustus: '08',
  agu: '08',
  ags: '08',
  aug: '08',
  september: '09',
  sep: '09',
  oktober: '10',
  okt: '10',
  oct: '10',
  november: '11',
  nov: '11',
  nopember: '11',
  desember: '12',
  des: '12',
  dec: '12',
};

export const normalizeDateToYmd = (raw?: string): string | null => {
  const s = (raw || '').trim();
  if (!s || s === '-') return null;

  // YYYY-MM-DD or ISO string
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  // Indonesian long date e.g. "04 November 2026"
  const indoMatch = s.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (indoMatch) {
    const mm = ID_MONTH_MAP[indoMatch[2]];
    if (mm) {
      return `${indoMatch[3]}-${mm}-${indoMatch[1].padStart(2, '0')}`;
    }
  }

  return null;
};

export const isDateInAcademicYear = (
  dateStr: string | undefined,
  activeYear: string = '2026/2027'
): boolean => {
  const ymd = normalizeDateToYmd(dateStr);
  if (!ymd) return false;
  const { startYear, endYear } = parseAcademicYear(activeYear);
  return ymd >= `${startYear}-07-01` && ymd <= `${endYear}-06-30`;
};

export const getDefaultKaldikHolidaysForYear = (
  activeYear: string = '2026/2027'
): Array<{ date: string; isHoliday: boolean; keterangan: string }> => {
  const { startYear, endYear } = parseAcademicYear(activeYear);
  const fixedHolidays: Array<{ date: string; isHoliday: boolean; keterangan: string }> = [
    { date: `${startYear}-08-17`, isHoliday: true, keterangan: `Hari Kemerdekaan Republik Indonesia` },
    { date: `${startYear}-11-25`, isHoliday: true, keterangan: `Hari Guru Nasional` },
    { date: `${startYear}-12-25`, isHoliday: true, keterangan: `Hari Raya Natal` },
    { date: `${startYear}-12-26`, isHoliday: true, keterangan: `Cuti Bersama Hari Raya Natal` },
    { date: `${startYear}-12-28`, isHoliday: true, keterangan: `Libur Akhir Semester Ganjil` },
    { date: `${startYear}-12-29`, isHoliday: true, keterangan: `Libur Akhir Semester Ganjil` },
    { date: `${startYear}-12-30`, isHoliday: true, keterangan: `Libur Akhir Semester Ganjil` },
    { date: `${startYear}-12-31`, isHoliday: true, keterangan: `Libur Akhir Semester Ganjil` },
    { date: `${endYear}-01-01`, isHoliday: true, keterangan: `Tahun Baru Masehi ${endYear}` },
    { date: `${endYear}-05-01`, isHoliday: true, keterangan: `Hari Buruh Internasional` },
    { date: `${endYear}-06-01`, isHoliday: true, keterangan: `Hari Lahir Pancasila` },
  ];

  if (startYear === 2026 && endYear === 2027) {
    return [
      { date: '2026-07-07', isHoliday: true, keterangan: 'Tahun Baru Islam 1448 H' },
      { date: '2026-08-17', isHoliday: true, keterangan: 'Hari Kemerdekaan Republik Indonesia Ke-81' },
      { date: '2026-09-04', isHoliday: true, keterangan: 'Maulid Nabi Muhammad SAW' },
      { date: '2026-10-15', isHoliday: true, keterangan: 'Asesmen Sumatif Tengah Semester (ASTS)' },
      { date: '2026-11-25', isHoliday: true, keterangan: 'Hari Guru Nasional' },
      { date: '2026-12-25', isHoliday: true, keterangan: 'Hari Raya Natal' },
      { date: '2026-12-26', isHoliday: true, keterangan: 'Cuti Bersama Hari Raya Natal' },
      { date: '2026-12-28', isHoliday: true, keterangan: 'Libur Akhir Semester Ganjil' },
      { date: '2026-12-29', isHoliday: true, keterangan: 'Libur Akhir Semester Ganjil' },
      { date: '2026-12-30', isHoliday: true, keterangan: 'Libur Akhir Semester Ganjil' },
      { date: '2026-12-31', isHoliday: true, keterangan: 'Libur Akhir Semester Ganjil' },
      { date: '2027-01-01', isHoliday: true, keterangan: 'Tahun Baru Masehi 2027' },
      { date: '2027-02-06', isHoliday: true, keterangan: 'Tahun Baru Imlek 2578 Kongzili' },
      { date: '2027-03-09', isHoliday: true, keterangan: 'Hari Suci Nyepi Tahun Baru Saka 1949' },
      { date: '2027-03-10', isHoliday: true, keterangan: 'Hari Raya Idul Fitri 1448 H' },
      { date: '2027-03-11', isHoliday: true, keterangan: 'Hari Raya Idul Fitri 1448 H' },
      { date: '2027-05-01', isHoliday: true, keterangan: 'Hari Buruh Internasional' },
      { date: '2027-05-20', isHoliday: true, keterangan: 'Hari Raya Waisak 2571 BE' },
      { date: '2027-06-01', isHoliday: true, keterangan: 'Hari Lahir Pancasila' },
    ];
  }

  return fixedHolidays;
};

export const isDateInSemester = (
  dateStr: string | undefined,
  activeYear: string,
  activeSemester: string
): boolean => {
  const ymd = normalizeDateToYmd(dateStr);
  if (!ymd) return false;
  const range = getSemesterDateRange(activeYear, activeSemester);
  return ymd >= range.startDate && ymd <= range.endDate;
};

export const getDefaultMonthForSemester = (
  activeYear: string,
  activeSemester: string,
  todayYmd: string
): string => {
  const range = getSemesterDateRange(activeYear, activeSemester);
  const currentYm = (todayYmd || '').slice(0, 7);
  if (currentYm && currentYm >= range.startMonth && currentYm <= range.endMonth) {
    return currentYm;
  }
  return range.startMonth;
};

export const doesRecordMatchTerm = (
  record: {
    semester?: string;
    tahunPelajaran?: string;
    tanggal?: string;
    tanggalUjian?: string;
    date?: string;
    recordedAt?: number;
  },
  activeYear: string,
  activeSemester: string
): boolean => {
  const targetSem1 = isSemesterOneLabel(activeSemester);
  const normalizedTargetYear = activeYear.trim();

  if (record.tahunPelajaran && record.tahunPelajaran.trim()) {
    if (record.tahunPelajaran.trim() !== normalizedTargetYear) {
      return false;
    }
    if (record.semester) {
      return isSemesterOneLabel(record.semester) === targetSem1;
    }
    const candidateDate = record.tanggal || record.tanggalUjian || record.date;
    const ymd = normalizeDateToYmd(candidateDate);
    if (ymd) {
      return isDateInSemester(ymd, activeYear, activeSemester);
    }
    if (typeof record.recordedAt === 'number' && record.recordedAt > 0) {
      const d = new Date(record.recordedAt);
      const localYmd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      return isDateInSemester(localYmd, activeYear, activeSemester);
    }
    return targetSem1;
  }

  // Record tidak memiliki field tahunPelajaran eksplisit: cek semester + rentang tanggal tahun ajaran
  if (record.semester && isSemesterOneLabel(record.semester) !== targetSem1) {
    return false;
  }

  const candidateDate = record.tanggal || record.tanggalUjian || record.date;
  const ymd = normalizeDateToYmd(candidateDate);
  if (ymd) {
    return record.semester
      ? isDateInAcademicYear(ymd, activeYear)
      : isDateInSemester(ymd, activeYear, activeSemester);
  }

  if (typeof record.recordedAt === 'number' && record.recordedAt > 0) {
    const d = new Date(record.recordedAt);
    const localYmd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    return record.semester
      ? isDateInAcademicYear(localYmd, activeYear)
      : isDateInSemester(localYmd, activeYear, activeSemester);
  }

  // Legacy data without explicit term or date defaults to 2026/2027 only
  return normalizedTargetYear === '2026/2027' && (record.semester ? true : targetSem1);
};

export const countSemesterEffectiveDays = (
  activeYear: string,
  activeSemester: string,
  kaldikHolidayDates: Set<string>,
  capAtDate?: string
): number => {
  const range = getSemesterDateRange(activeYear, activeSemester);
  const endLimit = capAtDate && capAtDate < range.endDate ? capAtDate : range.endDate;
  if (endLimit < range.startDate) return 0;

  const [sy, sm, sd] = range.startDate.split('-').map(Number);
  const [ey, em, ed] = endLimit.split('-').map(Number);
  const startDt = new Date(sy, sm - 1, sd);
  const endDt = new Date(ey, em - 1, ed);

  let count = 0;
  for (let dt = new Date(startDt); dt <= endDt; dt.setDate(dt.getDate() + 1)) {
    const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
      dt.getDate()
    ).padStart(2, '0')}`;
    if (dt.getDay() !== 0 && !kaldikHolidayDates.has(ymd)) {
      count++;
    }
  }
  return count;
};
