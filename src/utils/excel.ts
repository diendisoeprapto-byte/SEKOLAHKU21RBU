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
 * Menormalkan penamaan kelas dari berbagai format (misal '6A', '6 A', 'VI A', 'VI-A', 'Kelas 6A')
 * agar selalu cocok dengan standar kelas di sistem ('Kelas 1A' - 'Kelas 6B')
 */
export const normalizeClassName = (raw: any, defaultClass: string = 'Kelas 6A'): string => {
  if (!raw) return defaultClass;
  const str = String(raw).trim();
  if (!str) return defaultClass;

  const validClasses = [
    'Kelas 1A', 'Kelas 1B',
    'Kelas 2A', 'Kelas 2B',
    'Kelas 3A', 'Kelas 3B',
    'Kelas 4A', 'Kelas 4B',
    'Kelas 5A', 'Kelas 5B',
    'Kelas 6A', 'Kelas 6B'
  ];

  if (validClasses.includes(str)) return str;

  const upper = str.toUpperCase().replace(/\s+/g, ' ');

  // Roman numerals mapping
  const romanMap: Record<string, string> = {
    'VI': '6',
    'V': '5',
    'IV': '4',
    'III': '3',
    'II': '2',
    'I': '1'
  };

  const defaultGrade = defaultClass.replace(/[^1-6]/g, '') || '6';
  const defaultSection = defaultClass.toUpperCase().includes('B') ? 'B' : 'A';

  // Strip prefixes like "KELAS", "KLS", "ROMBEL", "ROMBONGAN BELAJAR"
  const cleaned = upper.replace(/^(KELAS|KLS|ROMBEL|ROMBONGAN BELAJAR|TINGKAT)\s*/i, '').trim();

  // Pattern 1: Roman numeral with optional section, e.g. "VI A", "VI-A", "VIA", "VI"
  const romanMatch = cleaned.match(/^(VI|V|IV|III|II|I)[\s\-_.]*([AB])?$/i);
  if (romanMatch) {
    const grade = romanMap[romanMatch[1].toUpperCase()];
    const section = (romanMatch[2] || defaultSection).toUpperCase();
    const candidate = `Kelas ${grade}${section}`;
    if (validClasses.includes(candidate)) return candidate;
  }

  // Pattern 2: Digits with optional section, e.g. "6A", "6 A", "6-A", "6.A", "6"
  const digitMatch = cleaned.match(/^([1-6])[\s\-_.]*([AB])?$/i);
  if (digitMatch) {
    const grade = digitMatch[1];
    const section = (digitMatch[2] || defaultSection).toUpperCase();
    const candidate = `Kelas ${grade}${section}`;
    if (validClasses.includes(candidate)) return candidate;
  }

  // Pattern 3: Any digit 1-6 found in string
  const anyDigit = upper.match(/[1-6]/);
  const anySection = upper.match(/\b([AB])\b/) || upper.match(/([AB])$/);
  if (anyDigit) {
    const grade = anyDigit[0];
    const section = anySection ? anySection[1] : defaultSection;
    const candidate = `Kelas ${grade}${section}`;
    if (validClasses.includes(candidate)) return candidate;
  }

  return defaultClass;
};

/**
 * Format tanggal lahir ke YYYY-MM-DD dari berbagai format (Excel serial number, DD/MM/YYYY, Date)
 */
export const formatDateValue = (rawDate: any): string => {
  if (!rawDate) return '2014-01-01';

  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    return rawDate.toISOString().split('T')[0];
  }

  // Excel serial number (e.g. 41771 -> 2014-05-12)
  if (typeof rawDate === 'number' && rawDate > 10000 && rawDate < 60000) {
    const jsDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) {
      return jsDate.toISOString().split('T')[0];
    }
  }

  const str = String(rawDate).trim();
  if (!str) return '2014-01-01';

  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1990 && parsed.getFullYear() < 2035) {
    return parsed.toISOString().split('T')[0];
  }

  return '2014-01-01';
};

/**
 * Mengimpor dan mem-parsing berkas Excel Siswa dengan deteksi header dinamis,
 * normalisasi nama kelas, dan pembuatan username & password otomatis
 */
export const parseImportStudentsXLSX = (
  file: File,
  currentStudents: Student[],
  defaultClass: string = 'Kelas 6A',
  defaultYear: string = '2026/2027'
): Promise<{ newStudents: Student[]; count: number; importedClasses: string[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          resolve({ newStudents: [], count: 0, importedClasses: [] });
          return;
        }

        const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          resolve({ newStudents: [], count: 0, importedClasses: [] });
          return;
        }

        const ws = wb.Sheets[wb.SheetNames[0]];
        // Ubah sheet menjadi array 2D
        const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (!rawRows || rawRows.length === 0) {
          resolve({ newStudents: [], count: 0, importedClasses: [] });
          return;
        }

        // Deteksi baris header secara dinamis (mencari baris yang memiliki 'nama', 'peserta didik', 'siswa', 'nisn')
        let headerRowIdx = 0;
        let foundHeader = false;

        for (let r = 0; r < Math.min(15, rawRows.length); r++) {
          const rowCells = rawRows[r].map((c) => String(c || '').toLowerCase().trim());
          const hasNama = rowCells.some((c) =>
            c.includes('nama') || c.includes('siswa') || c.includes('peserta') || c.includes('murid')
          );
          const hasIdentifier = rowCells.some((c) =>
            c.includes('nisn') || c.includes('nis') || c.includes('nik') || c.includes('kelamin') || c.includes('jk') || c.includes('kelas') || c.includes('rombel')
          );

          if (hasNama && hasIdentifier) {
            headerRowIdx = r;
            foundHeader = true;
            break;
          }
        }

        // Jika tidak ketemu baris kedua kriteria, cari baris pertama yang memuat kata 'nama'
        if (!foundHeader) {
          for (let r = 0; r < Math.min(15, rawRows.length); r++) {
            const rowCells = rawRows[r].map((c) => String(c || '').toLowerCase().trim());
            if (rowCells.some((c) => c.includes('nama'))) {
              headerRowIdx = r;
              foundHeader = true;
              break;
            }
          }
        }

        const headerRow = rawRows[headerRowIdx] || [];
        const normalizedHeaders = headerRow.map((h) =>
          String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        );

        // Helper untuk mencari nilai berdasarkan berbagai kemungkinan nama kolom
        const getRowVal = (rowDict: Record<string, any>, possibleKeys: string[]): string => {
          for (const k of possibleKeys) {
            const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (rowDict[cleanKey] !== undefined && rowDict[cleanKey] !== null) {
              const val = String(rowDict[cleanKey]).trim();
              if (val) return val;
            }
          }
          return '';
        };

        const existingUsernames = new Set<string>(currentStudents.map((s) => s.username.toLowerCase()));
        const newStudents: Student[] = [];
        const detectedClasses = new Set<string>();

        for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.length === 0) continue;

          // Buat dictionary baris
          const rowDict: Record<string, any> = {};
          normalizedHeaders.forEach((key, colIdx) => {
            if (key) {
              rowDict[key] = row[colIdx];
            }
          });

          // Ekstraksi Nama
          const nama = getRowVal(rowDict, [
            'namasiswa',
            'namapesertadidik',
            'namalengkap',
            'nama',
            'pesertadidik',
            'murid',
            'namamurid',
            'namalengkapsiswa'
          ]);

          // Lewati baris kosong atau baris judul/catatan di bagian bawah
          if (!nama || nama.toLowerCase().includes('total') || nama.toLowerCase().includes('rekapitulasi')) {
            continue;
          }

          // Ekstraksi NISN
          const rawNisn = getRowVal(rowDict, [
            'nisn',
            'nonisn',
            'nomorinduksiswanasional',
            'nis',
            'nonis',
            'nisnisn',
            'nomorinduk'
          ]);
          const nisn = rawNisn || `013${Date.now().toString().slice(-7)}${newStudents.length}`;

          // Ekstraksi Agama
          const rawAgama = getRowVal(rowDict, ['agama', 'religion']) || 'Islam';
          const validAgama = ['Islam', 'Kristen', 'Katolik', 'Buddha', 'Hindu', 'Konghucu'];
          const matchedAgama = validAgama.find(
            (a) => a.toLowerCase() === rawAgama.toLowerCase()
          );
          const agama = (matchedAgama || 'Islam') as any;

          // Ekstraksi Jenis Kelamin
          const rawJk = getRowVal(rowDict, [
            'jeniskelamin',
            'jeniskelaminlp',
            'jk',
            'lp',
            'sex',
            'gender',
            'kelamin'
          ]).toUpperCase();
          const jenisKelamin: 'L' | 'P' =
            rawJk.startsWith('P') || rawJk === 'PEREMPUAN' || rawJk === 'WANITA' || rawJk === 'W' ? 'P' : 'L';

          // Ekstraksi Tempat & Tanggal Lahir
          const tempatLahir = getRowVal(rowDict, [
            'tempatlahir',
            'tempat',
            'tmplahir',
            'kotallahir'
          ]) || 'Jakarta';

          const rawTglLahir = rowDict['tanggallahir'] ??
            rowDict['tanggallahiryyyymmdd'] ??
            rowDict['tgllahir'] ??
            rowDict['tgl'] ??
            rowDict['birthdate'] ??
            rowDict['tgllahirddmmyyyy'];
          const tanggalLahir = formatDateValue(rawTglLahir);

          // Ekstraksi NIK
          const rawNik = getRowVal(rowDict, [
            'nik',
            'nonik',
            'noktp',
            'nomorindukkependudukan'
          ]);
          const nik = rawNik || `317201${Date.now().toString().slice(-10)}`;

          // Ekstraksi Kebutuhan Khusus
          const kebutuhanKhusus = getRowVal(rowDict, [
            'kebutuhankhusus',
            'inklusi',
            'abk',
            'disabilitas',
            'kategoriinklusi',
            'jeniskebutuhankhusus'
          ]) || 'Tidak Ada (Reguler)';

          // Ekstraksi Orang Tua & Alamat
          const namaAyah = getRowVal(rowDict, ['namaayah', 'ayah', 'bapak', 'namabapak']) || '-';
          const namaIbu = getRowVal(rowDict, ['namaibu', 'ibu']) || '-';
          const alamat = getRowVal(rowDict, [
            'alamat',
            'alamatrumah',
            'alamattinggal',
            'domisili',
            'tempattinggal',
            'alamatsiswa'
          ]) || 'Jakarta Utara';

          // Ekstraksi Kelas dengan normalisasi cerdas
          const rawKelas = getRowVal(rowDict, [
            'kelas',
            'rombel',
            'rombonganbelajar',
            'tingkat',
            'kls',
            'ruang'
          ]);
          const kelas = normalizeClassName(rawKelas, defaultClass);
          detectedClasses.add(kelas);

          // Ekstraksi Tahun Pelajaran
          const tahunPelajaran = getRowVal(rowDict, [
            'tahunpelajaran',
            'tapel',
            'thnpelajaran',
            'tahunajaran',
            'tp'
          ]) || defaultYear;

          // Akun Login: Username & Password
          const rawUser = getRowVal(rowDict, [
            'username',
            'user',
            'namaakun',
            'usernameopsionalotomatis',
            'usernameakun'
          ]);
          const username = rawUser
            ? rawUser.toLowerCase()
            : generateAccountUsername(nama, nisn, existingUsernames);

          const rawPass = getRowVal(rowDict, [
            'password',
            'katasandi',
            'pass',
            'passwordopsionaldefault123',
            'passwordakun'
          ]);
          const password = rawPass || generateAccountPassword(nisn);

          // Barcode ID
          const rawBarcode = getRowVal(rowDict, ['idbarcode', 'barcode', 'barcodeid']);
          const classCode = kelas.replace(/\s+/g, '').replace('Kelas', '');
          const seq = String(currentStudents.length + newStudents.length + 1).padStart(3, '0');
          const barcodeId = rawBarcode || `RBU21-${classCode}-${seq}`;

          const fotoUrl = getRowVal(rowDict, ['foto', 'fotourl', 'linkfoto']) ||
            'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150';

          newStudents.push({
            id: `std_${Date.now()}_${newStudents.length}`,
            barcodeId,
            nama,
            jenisKelamin,
            tempatLahir,
            tanggalLahir,
            nik,
            nisn,
            kebutuhanKhusus,
            namaAyah,
            namaIbu,
            alamat,
            agama,
            kelas,
            tahunPelajaran,
            username,
            password,
            fotoUrl,
          });
        }

        resolve({
          newStudents,
          count: newStudents.length,
          importedClasses: Array.from(detectedClasses),
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
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
      'Nama Siswa': 'Muhammad Rizky Pratama',
      'Jenis Kelamin (L/P)': 'L',
      'Tempat Lahir': 'Jakarta',
      'Tanggal Lahir (YYYY-MM-DD)': '2014-05-12',
      'NIK': '3172011205140001',
      'NISN': '0134567801',
      'Agama': 'Islam',
      'Kebutuhan Khusus': 'Tidak Ada (Reguler)',
      'Nama Ayah': 'Budi Pratama',
      'Nama Ibu': 'Siti Nurjanah',
      'Alamat': 'Jl. Rawa Badak Utara No. 12, Koja, Jakarta Utara',
      'Kelas': 'Kelas 6A',
      'Tahun Pelajaran': '2026/2027',
      'Username (Opsional, Otomatis)': '',
      'Password (Opsional, Default 123)': '',
    },
    {
      'Nama Siswa': 'Aisyah Putri Azzahra',
      'Jenis Kelamin (L/P)': 'P',
      'Tempat Lahir': 'Jakarta',
      'Tanggal Lahir (YYYY-MM-DD)': '2014-08-20',
      'NIK': '3172016008140002',
      'NISN': '0134567802',
      'Agama': 'Islam',
      'Kebutuhan Khusus': 'Tidak Ada (Reguler)',
      'Nama Ayah': 'Ahmad Zaki',
      'Nama Ibu': 'Fatimah Hanum',
      'Alamat': 'Jl. Lorong 102 No. 5, Rawa Badak Utara, Koja',
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
    'NIK': s.nik || '-',
    'NISN': s.nisn,
    'Nama Lengkap': s.nama,
    'Jenis Kelamin': s.jenisKelamin || 'L',
    'Tempat Lahir': s.tempatLahir || '-',
    'Tanggal Lahir': s.tanggalLahir || '-',
    'Agama': s.agama,
    'Kebutuhan Khusus': s.kebutuhanKhusus || 'Tidak Ada (Reguler)',
    'Nama Ayah': s.namaAyah || '-',
    'Nama Ibu': s.namaIbu || '-',
    'Alamat': s.alamat || '-',
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
