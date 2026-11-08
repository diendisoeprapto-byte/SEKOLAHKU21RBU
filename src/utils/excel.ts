import * as XLSX from 'xlsx';
import { Student, Teacher } from '../types';

/**
 * Otomatis menghasilkan username login unik berbasis nama lengkap
 * Contoh: 'Hj. Siti Aminah, S.Pd.' -> 'siti.aminah'
 *         'Daniel Christian Siregar' -> 'daniel.siregar'
 */
export const generateAccountUsername = (
  fullName: string,
  fallbackId?: string,
  existingUsernames?: Set<string>
): string => {
  if (!fullName || !fullName.trim()) {
    return fallbackId ? String(fallbackId).trim().toLowerCase() : `user_${Date.now().toString().slice(-4)}`;
  }

  // Bersihkan gelar akademik, keagamaan, dan kehormatan umum di Indonesia
  const clean = fullName
    .replace(/\b(Hj\.|H\.|Dr\.|Drs\.|Dra\.|Prof\.|K\.H\.|Ustadz|Ir\.)\b/gi, '')
    .replace(/\b(S\.Pd\.|M\.Pd\.|S\.Pd\.I|M\.Pd\.I|S\.Ag\.|M\.Ag\.|S\.T\.|M\.T\.|S\.Kom\.|M\.Kom\.|S\.Si\.|M\.Si\.|S\.Sos\.|M\.Sos\.|S\.E\.|M\.M\.|S\.H\.|M\.H\.|Gr\.)\b/gi, '')
    .replace(/[,\.]/g, ' ')
    .trim();

  const words = clean
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  let base = '';
  if (words.length === 0) {
    base = fallbackId ? String(fallbackId).trim().toLowerCase() : `user_${Date.now().toString().slice(-4)}`;
  } else if (words.length === 1) {
    base = words[0];
  } else {
    base = `${words[0]}.${words[words.length - 1]}`;
  }

  let candidate = base;
  if (existingUsernames && existingUsernames.has(candidate)) {
    if (fallbackId && String(fallbackId).trim().length >= 3) {
      candidate = `${base}.${String(fallbackId).trim().slice(-4)}`;
    }
    let counter = 1;
    while (existingUsernames.has(candidate)) {
      candidate = `${base}${counter}`;
      counter++;
    }
  }

  if (existingUsernames) {
    existingUsernames.add(candidate);
  }

  return candidate;
};

/**
 * Otomatis menghasilkan password default akun jika tidak diisi di Excel
 */
export const generateAccountPassword = (fallbackId?: string): string => {
  return '123';
};

/**
 * Mengimpor dan mem-parsing berkas Excel Siswa dengan username & password otomatis
 */
export const parseImportStudentsXLSX = (
  file: File,
  currentStudents: Student[],
  defaultClass: string = 'Kelas 6A',
  defaultYear: string = '2026/2027'
): Promise<{ newStudents: Student[]; count: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bstr = e.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          resolve({ newStudents: [], count: 0 });
          return;
        }

        const existingUsernames = new Set<string>(currentStudents.map((s) => s.username.toLowerCase()));
        const newStudents: Student[] = [];

        data.forEach((row, idx) => {
          const rawNama = row['Nama Siswa'] || row['Nama Lengkap'] || row['Nama'] || row['nama'];
          if (!rawNama || !String(rawNama).trim()) return;

          const nama = String(rawNama).trim();
          const nisn = String(row['NISN'] || row['nisn'] || `013${Date.now().toString().slice(-7)}${idx}`).trim();

          const rawAgama = String(row['Agama'] || row['agama'] || 'Islam').trim();
          const validAgama = ['Islam', 'Kristen', 'Katolik', 'Buddha', 'Hindu', 'Konghucu'];
          const agama = validAgama.includes(rawAgama) ? (rawAgama as any) : 'Islam';

          const kelas = String(row['Kelas'] || row['kelas'] || defaultClass).trim();
          const tahunPelajaran = String(row['Tahun Pelajaran'] || row['tahunPelajaran'] || defaultYear).trim();

          // Otomatis generate username jika kosong
          const providedUsername =
            row['Username'] ||
            row['username'] ||
            row['Username (Opsional, Otomatis)'] ||
            row['Username Akun'];
          const username = providedUsername && String(providedUsername).trim()
            ? String(providedUsername).trim().toLowerCase()
            : generateAccountUsername(nama, nisn, existingUsernames);

          // Otomatis generate password jika kosong (default '123')
          const providedPassword =
            row['Password'] ||
            row['password'] ||
            row['Password (Opsional, Default 123)'] ||
            row['Password Akun'];
          const password = providedPassword && String(providedPassword).trim()
            ? String(providedPassword).trim()
            : generateAccountPassword(nisn);

          // Barcode ID: e.g. RBU21-6A-001
          const classCode = kelas.replace(/\s+/g, '').replace('Kelas', '');
          const seq = String(currentStudents.length + newStudents.length + 1).padStart(3, '0');
          const barcodeId = row['ID Barcode'] || row['barcodeId'] || `RBU21-${classCode}-${seq}`;

          const fotoUrl = row['Foto'] || row['fotoUrl'] || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150';

          newStudents.push({
            id: `std_${Date.now()}_${idx}`,
            barcodeId,
            nama,
            nisn,
            agama,
            kelas,
            tahunPelajaran,
            username,
            password,
            fotoUrl,
          });
        });

        resolve({ newStudents, count: newStudents.length });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

/**
 * Mengimpor dan mem-parsing berkas Excel Guru dengan username & password otomatis
 */
export const parseImportTeachersXLSX = (
  file: File,
  currentTeachers: Teacher[]
): Promise<{ newTeachers: Teacher[]; count: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bstr = e.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          resolve({ newTeachers: [], count: 0 });
          return;
        }

        const existingUsernames = new Set<string>(currentTeachers.map((t) => t.username.toLowerCase()));
        const newTeachers: Teacher[] = [];

        data.forEach((row, idx) => {
          const rawNama = row['Nama Lengkap & Gelar'] || row['Nama Guru'] || row['Nama'] || row['nama'];
          if (!rawNama || !String(rawNama).trim()) return;

          const nama = String(rawNama).trim();
          const nip = String(row['NIP'] || row['nip'] || '-').trim();

          const rawStatus = String(row['Status Pegawai'] || row['statusPegawai'] || 'PNS').trim();
          const validStatus = ['PNS', 'PPPK', 'KKI', 'Honor'];
          const statusPegawai = validStatus.includes(rawStatus) ? (rawStatus as any) : 'PNS';

          const tempatLahir = String(row['Tempat Lahir'] || row['tempatLahir'] || 'Jakarta').trim();
          const tanggalLahir = String(row['Tanggal Lahir'] || row['tanggalLahir'] || '1985-01-01').trim();
          const tmtPertama = String(row['TMT Pertama'] || row['tmtPertama'] || '2010-01-01').trim();

          const rawNikah = String(row['Status Pernikahan'] || row['statusPernikahan'] || 'Menikah').trim();
          const validNikah = ['Menikah', 'Belum Menikah', 'Janda', 'Duda'];
          const statusPernikahan = validNikah.includes(rawNikah) ? (rawNikah as any) : 'Menikah';

          const penugasan = String(row['Penugasan'] || row['penugasan'] || 'Guru Mapel').trim();

          // Otomatis generate username jika kosong
          const providedUsername =
            row['Username'] ||
            row['username'] ||
            row['Username (Opsional, Otomatis)'] ||
            row['Username Akun'];
          const username = providedUsername && String(providedUsername).trim()
            ? String(providedUsername).trim().toLowerCase()
            : generateAccountUsername(nama, nip !== '-' ? nip : undefined, existingUsernames);

          // Otomatis generate password jika kosong (default '123')
          const providedPassword =
            row['Password'] ||
            row['password'] ||
            row['Password (Opsional, Default 123)'] ||
            row['Password Akun'];
          const password = providedPassword && String(providedPassword).trim()
            ? String(providedPassword).trim()
            : generateAccountPassword(nip);

          const fotoUrl = row['Foto'] || row['fotoUrl'] || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150';

          newTeachers.push({
            id: `t_${Date.now()}_${idx}`,
            nama,
            statusPegawai,
            nip,
            tempatLahir,
            tanggalLahir,
            tmtPertama,
            statusPernikahan,
            penugasan,
            username,
            password,
            fotoUrl,
          });
        });

        resolve({ newTeachers, count: newTeachers.length });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

export const downloadTemplateStudentsXLSX = () => {
  const templateData = [
    {
      'Nama Siswa': 'Ahmad Fauzi Pratama',
      'NISN': '0134567899',
      'Agama': 'Islam',
      'Kelas': 'Kelas 6A',
      'Tahun Pelajaran': '2026/2027',
      'Username (Opsional, Otomatis)': '',
      'Password (Opsional, Default 123)': '',
    },
    {
      'Nama Siswa': 'Maria Kristina Siregar',
      'NISN': '0134567898',
      'Agama': 'Kristen',
      'Kelas': 'Kelas 6A',
      'Tahun Pelajaran': '2026/2027',
      'Username (Opsional, Otomatis)': '',
      'Password (Opsional, Default 123)': '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');
  XLSX.writeFile(wb, 'Template_Import_Siswa_SEKOLAHKU.xlsx');
};

export const exportStudentsToXLSX = (students: Student[]) => {
  const data = students.map((s, idx) => ({
    'No': idx + 1,
    'ID Barcode': s.barcodeId,
    'NISN': s.nisn,
    'Nama Lengkap': s.nama,
    'Agama': s.agama,
    'Kelas': s.kelas,
    'Tahun Pelajaran': s.tahunPelajaran,
    'Username': s.username,
    'Password': s.password,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');
  XLSX.writeFile(wb, `Data_Siswa_SEKOLAHKU_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const downloadTemplateTeachersXLSX = () => {
  const templateData = [
    {
      'Nama Lengkap & Gelar': 'Hj. Siti Aminah, S.Pd.',
      'Status Pegawai': 'PNS',
      'NIP': '198504122010012008',
      'Tempat Lahir': 'Jakarta',
      'Tanggal Lahir': '1985-04-12',
      'TMT Pertama': '2010-01-01',
      'Status Pernikahan': 'Menikah',
      'Penugasan': 'Kelas 6A',
      'Username (Opsional, Otomatis)': '',
      'Password (Opsional, Default 123)': '',
    },
    {
      'Nama Lengkap & Gelar': 'Bambang Sutrisno, M.Pd.',
      'Status Pegawai': 'PNS',
      'NIP': '198802102012011004',
      'Tempat Lahir': 'Semarang',
      'Tanggal Lahir': '1988-02-10',
      'TMT Pertama': '2012-01-01',
      'Status Pernikahan': 'Menikah',
      'Penugasan': 'Kelas 6B',
      'Username (Opsional, Otomatis)': '',
      'Password (Opsional, Default 123)': '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template Guru');
  XLSX.writeFile(wb, 'Template_Import_Guru_SEKOLAHKU.xlsx');
};

export const exportTeachersToXLSX = (teachers: Teacher[]) => {
  const data = teachers.map((t, idx) => ({
    'No': idx + 1,
    'Nama Guru': t.nama,
    'Status Pegawai': t.statusPegawai,
    'NIP': t.nip,
    'Tempat Lahir': t.tempatLahir,
    'Tanggal Lahir': t.tanggalLahir,
    'TMT Pertama': t.tmtPertama,
    'Status Pernikahan': t.statusPernikahan,
    'Penugasan': t.penugasan,
    'Username': t.username,
    'Password': t.password,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Guru');
  XLSX.writeFile(wb, `Data_Guru_SEKOLAHKU_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportMonthlyMatrixToXLSX = (
  monthName: string,
  year: number,
  daysInMonth: number,
  students: Student[],
  attendanceMap: Record<string, string>, // key: `${date}_${studentId}` -> status
  kaldikHolidaysMap: Record<string, boolean>
) => {
  const headers = ['No', 'ID Barcode', 'Nama Siswa'];
  for (let d = 1; d <= daysInMonth; d++) {
    headers.push(String(d));
  }
  headers.push('H', 'S', 'I', 'A', '% Hadir');

  const rows: any[] = [];

  students.forEach((s, idx) => {
    let hadir = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;
    let totalEfektif = 0;

    const row: Record<string, any> = {
      'No': idx + 1,
      'ID Barcode': s.barcodeId,
      'Nama Siswa': s.nama,
    };

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateKey = `${year}-${monthName}-${dayStr}`;
      const isSunday = new Date(year, parseInt(monthName) - 1, d).getDay() === 0;
      const isHoliday = isSunday || !!kaldikHolidaysMap[dateKey];

      if (isHoliday) {
        row[String(d)] = 'L';
      } else {
        totalEfektif++;
        const st = attendanceMap[`${dateKey}_${s.id}`] || 'H';
        row[String(d)] = st;
        if (st === 'H') hadir++;
        else if (st === 'S') sakit++;
        else if (st === 'I') izin++;
        else if (st === 'A') alfa++;
      }
    }

    const pct = totalEfektif > 0 ? Math.round((hadir / totalEfektif) * 100) : 100;
    row['H'] = hadir;
    row['S'] = sakit;
    row['I'] = izin;
    row['A'] = alfa;
    row['% Hadir'] = `${pct}%`;

    rows.push(row);
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Absensi_${monthName}`);
  XLSX.writeFile(wb, `Matriks_Absensi_Bulanan_${monthName}_${year}.xlsx`);
};

export const exportLegerToXLSX = (
  schoolName: string,
  className: string,
  year: string,
  semester: string,
  data: any[]
) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leger Nilai');
  XLSX.writeFile(wb, `Leger_Nilai_${className.replace(' ', '_')}_${year.replace('/', '-')}_${semester.replace(' ', '_')}.xlsx`);
};
