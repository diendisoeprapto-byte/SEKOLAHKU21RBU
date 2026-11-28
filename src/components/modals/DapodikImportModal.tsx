import React, { useState } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  Users,
  GraduationCap,
  School,
  Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  ActiveUser,
  ReligionType,
  SchoolProfile,
  Student,
  Teacher,
} from '../../types';
import { saveStudentsToFirestoreBatch } from '../../utils/studentFirestore';
import { saveTeachersToFirestoreBatch } from '../../utils/teacherFirestore';
import { saveStoredProfile } from '../../utils/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { SCHOOLS_COLLECTION } from '../../utils/examAnswerKeyFirestore';
import { cleanSchoolNpsn } from '../../utils/learningAdminFirestore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeUser: ActiveUser;
  profile: SchoolProfile;
  students: Student[];
  teachers: Teacher[];
  onUpdateProfile?: (profile: SchoolProfile) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

function parseDapodikDate(raw: any, fallback = '2015-01-01'): string {
  if (raw === undefined || raw === null || raw === '') return fallback;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = String(parsed.y).padStart(4, '0');
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(raw).trim();
  if (!str) return fallback;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  return str.slice(0, 10) || fallback;
}

function formatBirthDateToPin(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}${m[2]}${m[1]}`; // DDMMYYYY
  const digits = isoDate.replace(/[^0-9]/g, '');
  return digits.length >= 6 ? digits.slice(0, 8) : '2121';
}

function normalizeAgama(raw: any): ReligionType {
  const s = String(raw || '').trim().toLowerCase();
  if (s.includes('kristen') || s.includes('protestan')) return 'Kristen';
  if (s.includes('katolik')) return 'Katolik';
  if (s.includes('hindu')) return 'Hindu';
  if (s.includes('buddha') || s.includes('budha')) return 'Buddha';
  if (s.includes('konghucu') || s.includes('khonghucu')) return 'Konghucu';
  return 'Islam';
}

function normalizeKelas(raw: any): string {
  const s = String(raw || '').trim();
  if (!s) return 'Kelas 6A';
  const cleaned = s.replace(/^rombel\s*/i, '').trim();
  if (/^kelas\s+/i.test(cleaned)) {
    return cleaned.replace(/^kelas\s*/i, 'Kelas ').replace(/\s+([A-Za-z])$/, '$1');
  }
  return `Kelas ${cleaned.replace(/\s+([A-Za-z])$/, '$1')}`;
}

function normalizeTeacherStatus(raw: any): Teacher['statusPegawai'] {
  const s = String(raw || '').toLowerCase();
  if (s.includes('pppk') || s.includes('p3k')) return 'PPPK';
  if (s.includes('kki') || s.includes('kontrak')) return 'KKI';
  if (s.includes('honor') || s.includes('gty') || s.includes('gtt') || s.includes('tidak tetap')) {
    return 'Honor';
  }
  return 'PNS';
}

export const DapodikImportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeUser,
  profile,
  students,
  teachers,
  onUpdateProfile,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'siswa' | 'guru' | 'sekolah'>('siswa');
  const [isLoading, setIsLoading] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<{
    type: 'siswa' | 'guru' | 'sekolah';
    total: number;
    newCount: number;
    updatedCount: number;
    inklusiCount: number;
    parsedData: any[];
    mergedPreviewList?: any[];
    profilePatch?: Partial<SchoolProfile>;
  } | null>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    if (activeTab === 'siswa') {
      const ws = XLSX.utils.aoa_to_sheet([
        [
          'Nama',
          'NIPD',
          'JK',
          'NISN',
          'Tempat Lahir',
          'Tanggal Lahir',
          'NIK',
          'Agama',
          'Alamat',
          'Nama Ayah',
          'Nama Ibu',
          'Nama Wali',
          'Rombel Saat Ini',
          'Kebutuhan Khusus',
          'No HP',
        ],
        [
          'Contoh Siswa Reguler',
          '2026001',
          'L',
          '0145566778',
          'Jakarta',
          '2014-05-12',
          '3172031205140001',
          'Islam',
          'Jl. Rawa Badak Utara No. 21',
          'Bapak Budi',
          'Ibu Sari',
          '-',
          '6A',
          'Tidak Ada',
          '081234567890',
        ],
        [
          'Contoh Siswa Inklusi',
          '2026002',
          'P',
          '0145566779',
          'Jakarta',
          '2014-08-17',
          '3172031708140002',
          'Islam',
          'Jl. Rawa Badak Utara No. 22',
          'Bapak Andi',
          'Ibu Wati',
          '-',
          '6A',
          'Slow Learner / Hambatan Belajar',
          '081234567891',
        ],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Peserta Didik Dapodik');
      XLSX.writeFile(wb, 'Template_Dapodik_Peserta_Didik.xlsx');
    } else if (activeTab === 'guru') {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Nama PTK', 'NUPTK', 'NIP', 'Jenis PTK', 'Status Kepegawaian', 'Tempat Lahir', 'Tanggal Lahir', 'TMT'],
        ['Endi Soeprapto, S.Pd., Gr.', '1234567890123456', '198801012019031001', 'Guru Kelas', 'PNS', 'Jakarta', '1988-01-01', '2019-03-01'],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'PTK Guru Dapodik');
      XLSX.writeFile(wb, 'Template_Dapodik_PTK_Guru.xlsx');
    } else {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Atribut', 'Nilai'],
        ['Nama Sekolah', profile.name || 'SDN Rawa Badak Utara 21'],
        ['NPSN', profile.npsn || '20101219'],
        ['Status Sekolah', profile.schoolStatus === 'swasta' ? 'Swasta' : 'Negeri'],
        ['Alamat', profile.alamat || 'Jl. Rawa Badak Utara'],
        ['Kecamatan', profile.kecamatan || 'Koja'],
        ['Kota/Kabupaten', profile.kota || 'Jakarta Utara'],
        ['Provinsi', profile.provinsi || 'DKI Jakarta'],
        ['Nama Kepala Sekolah', profile.kepalaSekolah?.nama || 'Darti Isyanti, M.Pd'],
        ['NIP Kepala Sekolah', profile.kepalaSekolah?.nip || '-'],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Profil Sekolah Dapodik');
      XLSX.writeFile(wb, 'Template_Dapodik_Profil_Sekolah.xlsx');
    }
    showToast('Template Excel Dapodik berhasil diunduh.', 'success');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawJson || rawJson.length === 0) {
          showToast('File kosong atau tidak terbaca.', 'error');
          return;
        }

        // Temukan baris header (scan hingga 10 baris pertama untuk format ekspor resmi Dapodik)
        let headerRowIdx = 0;
        for (let r = 0; r < Math.min(rawJson.length, 10); r++) {
          const rowStr = JSON.stringify(rawJson[r] || []).toLowerCase();
          if (
            rowStr.includes('nama') ||
            rowStr.includes('nisn') ||
            rowStr.includes('nuptk') ||
            rowStr.includes('npsn') ||
            rowStr.includes('rombel')
          ) {
            headerRowIdx = r;
            break;
          }
        }

        const headers = (rawJson[headerRowIdx] || []).map((h) => String(h || '').trim().toLowerCase());
        const rows = rawJson.slice(headerRowIdx + 1);

        const findColIdx = (keywords: string[]) => {
          for (const kw of keywords) {
            const exact = headers.findIndex((h) => h === kw);
            if (exact !== -1) return exact;
          }
          return headers.findIndex((h) => keywords.some((k) => h.includes(k)));
        };

        if (activeTab === 'siswa') {
          const idxNama = findColIdx(['nama peserta didik', 'nama siswa', 'nama lengkap', 'nama']);
          const idxNisn = findColIdx(['nisn']);
          const idxNipd = findColIdx(['nipd', 'no induk', 'induk']);
          const idxJk = findColIdx(['jk', 'jenis kelamin', 'kelamin', 'l/p']);
          const idxTempatLahir = findColIdx(['tempat lahir', 'tmp lahir']);
          const idxTglLahir = findColIdx(['tanggal lahir', 'tgl lahir']);
          const idxNik = findColIdx(['nik']);
          const idxAgama = findColIdx(['agama']);
          const idxAlamat = findColIdx(['alamat']);
          const idxRombel = findColIdx(['rombel saat ini', 'rombongan belajar', 'rombel', 'kelas']);
          const idxKhusus = findColIdx(['kebutuhan khusus', 'berkebutuhan khusus', 'inklusi', 'disabilitas']);
          const idxAyah = findColIdx(['nama ayah', 'ayah']);
          const idxIbu = findColIdx(['nama ibu', 'ibu']);
          const idxWali = findColIdx(['nama wali', 'wali']);
          const idxTelp = findColIdx(['no hp', 'hp', 'telp', 'telepon', 'whatsapp']);

          const existingByNisn = new Map<string, Student>();
          const existingByNipd = new Map<string, Student>();
          const existingByNameDob = new Map<string, Student>();
          students.forEach((st) => {
            if (st.nisn) existingByNisn.set(st.nisn.trim(), st);
            if (st.nipd) existingByNipd.set(st.nipd.trim(), st);
            if (st.nama) {
              existingByNameDob.set(`${st.nama.trim().toLowerCase()}|${st.tanggalLahir || ''}`, st);
            }
          });

          const importedStudents: Student[] = [];
          const importedIds = new Set<string>();
          let newCount = 0;
          let updatedCount = 0;
          let inklusiCount = 0;

          rows.forEach((r, i) => {
            const nama = idxNama >= 0 ? String(r[idxNama] || '').trim() : '';
            if (!nama || nama.toLowerCase() === 'nama' || nama.toLowerCase().includes('jumlah')) return;

            const rawNisn = idxNisn >= 0 ? String(r[idxNisn] || '').trim() : '';
            const rawNipd = idxNipd >= 0 ? String(r[idxNipd] || '').trim() : '';
            const tanggalLahir = parseDapodikDate(idxTglLahir >= 0 ? r[idxTglLahir] : '', '2015-01-01');

            const matchedExisting =
              (rawNisn && existingByNisn.get(rawNisn)) ||
              (rawNipd && existingByNipd.get(rawNipd)) ||
              existingByNameDob.get(`${nama.toLowerCase()}|${tanggalLahir}`);

            if (matchedExisting) {
              updatedCount++;
            } else {
              newCount++;
            }

            const nisn = rawNisn || matchedExisting?.nisn || rawNipd || `dap_${Date.now()}_${i}`;
            const jkRaw = idxJk >= 0 ? String(r[idxJk] || '').trim().toUpperCase() : '';
            const jenisKelamin: 'L' | 'P' = jkRaw.startsWith('P')
              ? 'P'
              : jkRaw.startsWith('L')
              ? 'L'
              : matchedExisting?.jenisKelamin || 'L';

            const defaultPin = formatBirthDateToPin(tanggalLahir);
            const kelas =
              idxRombel >= 0 && r[idxRombel]
                ? normalizeKelas(r[idxRombel])
                : matchedExisting?.kelas || 'Kelas 6A';

            const kebutuhanRaw = idxKhusus >= 0 ? String(r[idxKhusus] || '').trim() : '';
            const isInklusi = Boolean(
              kebutuhanRaw &&
                kebutuhanRaw !== '-' &&
                kebutuhanRaw.toLowerCase() !== 'tidak' &&
                kebutuhanRaw.toLowerCase() !== 'tidak ada' &&
                !kebutuhanRaw.toLowerCase().includes('tidak ada (reguler)') &&
                kebutuhanRaw.toLowerCase() !== 'reguler'
            );

            if (isInklusi) inklusiCount++;

            const studentId = matchedExisting?.id || `std_dap_${nisn}`;
            importedIds.add(studentId);

            importedStudents.push({
              ...(matchedExisting || {}),
              id: studentId,
              barcodeId: matchedExisting?.barcodeId || `BC-${nisn}`,
              nama,
              jenisKelamin,
              tempatLahir:
                (idxTempatLahir >= 0 && String(r[idxTempatLahir] || '').trim()) ||
                matchedExisting?.tempatLahir ||
                'Jakarta',
              tanggalLahir,
              nik:
                (idxNik >= 0 && String(r[idxNik] || '').trim()) ||
                matchedExisting?.nik ||
                '317',
              nisn,
              nipd: rawNipd || matchedExisting?.nipd || '',
              kebutuhanKhusus: isInklusi
                ? kebutuhanRaw
                : matchedExisting?.kebutuhanKhusus && matchedExisting.learningStatus === 'inklusi'
                ? matchedExisting.kebutuhanKhusus
                : 'Tidak Ada (Reguler)',
              learningStatus: isInklusi
                ? 'inklusi'
                : matchedExisting?.learningStatus || 'reguler',
              inclusionNote: isInklusi
                ? kebutuhanRaw
                : matchedExisting?.inclusionNote || '',
              namaAyah:
                (idxAyah >= 0 && String(r[idxAyah] || '').trim()) ||
                matchedExisting?.namaAyah ||
                '-',
              namaIbu:
                (idxIbu >= 0 && String(r[idxIbu] || '').trim()) ||
                matchedExisting?.namaIbu ||
                '-',
              namaWali:
                (idxWali >= 0 && String(r[idxWali] || '').trim()) ||
                matchedExisting?.namaWali ||
                '-',
              noTelpOrtu:
                (idxTelp >= 0 && String(r[idxTelp] || '').trim()) ||
                matchedExisting?.noTelpOrtu ||
                '',
              alamat:
                (idxAlamat >= 0 && String(r[idxAlamat] || '').trim()) ||
                matchedExisting?.alamat ||
                'Jakarta Utara',
              agama:
                idxAgama >= 0 && r[idxAgama]
                  ? normalizeAgama(r[idxAgama])
                  : matchedExisting?.agama || 'Islam',
              kelas,
              tahunPelajaran:
                matchedExisting?.tahunPelajaran || profile.activeAcademicYear || '2026/2027',
              username: matchedExisting?.username || nisn,
              password: matchedExisting?.password || defaultPin,
              fotoUrl:
                matchedExisting?.fotoUrl ||
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            });
          });

          const mergedAllStudents = [
            ...students.filter((st) => !importedIds.has(st.id)),
            ...importedStudents,
          ];

          setPreviewSummary({
            type: 'siswa',
            total: importedStudents.length,
            newCount,
            updatedCount,
            inklusiCount,
            parsedData: importedStudents,
            mergedPreviewList: mergedAllStudents,
          });
        } else if (activeTab === 'guru') {
          const idxNama = findColIdx(['nama ptk', 'nama guru', 'nama']);
          const idxNip = findColIdx(['nip']);
          const idxNuptk = findColIdx(['nuptk']);
          const idxJenis = findColIdx(['jenis ptk', 'jabatan', 'penugasan']);
          const idxStatus = findColIdx(['status kepegawaian', 'kepegawaian', 'status']);
          const idxTempat = findColIdx(['tempat lahir', 'tmp lahir']);
          const idxTgl = findColIdx(['tanggal lahir', 'tgl lahir']);
          const idxTmt = findColIdx(['tmt', 'tmt pengangkatan']);

          const existingByNuptk = new Map<string, Teacher>();
          const existingByNip = new Map<string, Teacher>();
          const existingByName = new Map<string, Teacher>();
          teachers.forEach((t) => {
            if (t.nuptk) existingByNuptk.set(t.nuptk.trim(), t);
            if (t.nip && t.nip !== '-') existingByNip.set(t.nip.trim(), t);
            if (t.nama) existingByName.set(t.nama.trim().toLowerCase(), t);
          });

          const importedTeachers: Teacher[] = [];
          const importedIds = new Set<string>();
          let newCount = 0;
          let updatedCount = 0;

          rows.forEach((r, i) => {
            const nama = idxNama >= 0 ? String(r[idxNama] || '').trim() : '';
            if (!nama || nama.toLowerCase() === 'nama ptk') return;

            const rawNip = idxNip >= 0 ? String(r[idxNip] || '').trim() : '';
            const rawNuptk = idxNuptk >= 0 ? String(r[idxNuptk] || '').trim() : '';
            const matchedExisting =
              (rawNuptk && existingByNuptk.get(rawNuptk)) ||
              (rawNip && existingByNip.get(rawNip)) ||
              existingByName.get(nama.toLowerCase());

            if (matchedExisting) updatedCount++;
            else newCount++;

            const tanggalLahir = parseDapodikDate(idxTgl >= 0 ? r[idxTgl] : '', '1985-01-01');
            const tmtPertama = parseDapodikDate(idxTmt >= 0 ? r[idxTmt] : '', '2015-01-01');
            const jenisPtk =
              (idxJenis >= 0 && String(r[idxJenis] || '').trim()) ||
              matchedExisting?.jenisPtk ||
              'Guru Kelas';
            const statusPegawai =
              idxStatus >= 0 && r[idxStatus]
                ? normalizeTeacherStatus(r[idxStatus])
                : matchedExisting?.statusPegawai || 'PNS';

            const teacherId = matchedExisting?.id || `tch_dap_${rawNuptk || rawNip || Date.now()}_${i}`;
            importedIds.add(teacherId);

            const baseUsername = nama
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '')
              .slice(0, 14);

            importedTeachers.push({
              ...(matchedExisting || {}),
              id: teacherId,
              nama,
              statusPegawai,
              nip: rawNip || matchedExisting?.nip || '-',
              nuptk: rawNuptk || matchedExisting?.nuptk || '',
              jenisPtk,
              tempatLahir:
                (idxTempat >= 0 && String(r[idxTempat] || '').trim()) ||
                matchedExisting?.tempatLahir ||
                'Jakarta',
              tanggalLahir,
              tmtPertama: matchedExisting?.tmtPertama || tmtPertama,
              statusPernikahan: matchedExisting?.statusPernikahan || 'Menikah',
              penugasan: matchedExisting?.penugasan || jenisPtk,
              username: matchedExisting?.username || `${baseUsername || 'guru'}_${i + 1}`,
              password: matchedExisting?.password || formatBirthDateToPin(tanggalLahir),
              fotoUrl:
                matchedExisting?.fotoUrl ||
                'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
            });
          });

          const mergedAllTeachers = [
            ...teachers.filter((t) => !importedIds.has(t.id)),
            ...importedTeachers,
          ];

          setPreviewSummary({
            type: 'guru',
            total: importedTeachers.length,
            newCount,
            updatedCount,
            inklusiCount: 0,
            parsedData: importedTeachers,
            mergedPreviewList: mergedAllTeachers,
          });
        } else {
          // Tab 3: Profil Sekolah Dapodik (Key-Value vertikal maupun tabel horizontal)
          const kvMap: Record<string, string> = {};
          rawJson.forEach((row) => {
            if (Array.isArray(row) && row.length >= 2) {
              const key = String(row[0] || '').trim().toLowerCase();
              const val = String(row[1] || '').trim();
              if (key && val) kvMap[key] = val;
            }
          });

          // Juga cek bila berformat tabel 2 baris (header -> values)
          const firstDataRow = rows[0] || [];
          const findProfileVal = (keywords: string[]) => {
            for (const [k, v] of Object.entries(kvMap)) {
              if (keywords.some((kw) => k.includes(kw))) return v;
            }
            const colIdx = findColIdx(keywords);
            if (colIdx !== -1 && firstDataRow[colIdx]) {
              return String(firstDataRow[colIdx]).trim();
            }
            return '';
          };

          const detName = findProfileVal(['nama sekolah', 'satuan pendidikan']);
          const detNpsn = findProfileVal(['npsn']);
          const detAddress = findProfileVal(['alamat', 'jalan']);
          const detKec = findProfileVal(['kecamatan']);
          const detKota = findProfileVal(['kota', 'kabupaten']);
          const detProv = findProfileVal(['provinsi']);
          const detStatusRaw = findProfileVal(['status sekolah', 'status']);
          const detHeadmaster = findProfileVal(['nama kepala sekolah', 'kepala sekolah', 'kepsek']);
          const detHeadNip = findProfileVal(['nip kepala sekolah', 'nip kepsek', 'nip']);

          const nextSchoolStatus: 'negeri' | 'swasta' =
            detStatusRaw.toLowerCase().includes('swasta')
              ? 'swasta'
              : detStatusRaw.toLowerCase().includes('negeri')
              ? 'negeri'
              : profile.schoolStatus || 'negeri';

          const patch: Partial<SchoolProfile> = {
            name: detName || profile.name,
            npsn: detNpsn || profile.npsn,
            alamat: detAddress || profile.alamat,
            kecamatan: detKec || profile.kecamatan,
            kota: detKota || profile.kota,
            provinsi: detProv || profile.provinsi,
            schoolStatus: nextSchoolStatus,
            kepalaSekolah: {
              nama: detHeadmaster || profile.kepalaSekolah?.nama || '',
              nip: detHeadNip || profile.kepalaSekolah?.nip || '',
              status: profile.kepalaSekolah?.status || 'PNS',
            },
          };

          setPreviewSummary({
            type: 'sekolah',
            total: 1,
            newCount: 0,
            updatedCount: 1,
            inklusiCount: 0,
            parsedData: [patch],
            profilePatch: patch,
          });
        }
        showToast('File Dapodik berhasil dibaca dan dipetakan.', 'success');
      } catch (err: any) {
        showToast('Gagal membaca file Dapodik: ' + (err?.message || err), 'error');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExecuteSync = async () => {
    if (!previewSummary) return;
    setIsLoading(true);
    try {
      if (previewSummary.type === 'siswa') {
        const listToSave = (previewSummary.mergedPreviewList || previewSummary.parsedData) as Student[];
        await saveStudentsToFirestoreBatch(listToSave, activeUser.name);
        showToast(
          `Sinkronisasi Dapodik selesai: ${previewSummary.newCount} siswa baru & ${previewSummary.updatedCount} siswa diperbarui!`,
          'success'
        );
      } else if (previewSummary.type === 'guru') {
        const listToSave = (previewSummary.mergedPreviewList || previewSummary.parsedData) as Teacher[];
        await saveTeachersToFirestoreBatch(listToSave);
        showToast(
          `Sinkronisasi Dapodik selesai: ${previewSummary.newCount} PTK baru & ${previewSummary.updatedCount} PTK diperbarui!`,
          'success'
        );
      } else if (previewSummary.type === 'sekolah' && previewSummary.profilePatch) {
        const updatedProfile: SchoolProfile = {
          ...profile,
          ...previewSummary.profilePatch,
        };
        saveStoredProfile(updatedProfile);
        onUpdateProfile?.(updatedProfile);
        const npsnKey = cleanSchoolNpsn(updatedProfile.npsn);
        await setDoc(
          doc(db, SCHOOLS_COLLECTION, npsnKey),
          {
            ...updatedProfile,
            npsn: npsnKey,
            updatedAt: new Date().toISOString(),
            serverTime: serverTimestamp(),
          },
          { merge: true }
        );
        showToast('Identitas Profil Sekolah dari Dapodik berhasil disinkronkan!', 'success');
      }
      setPreviewSummary(null);
      onClose();
    } catch (err: any) {
      showToast('Gagal sinkronisasi Dapodik: ' + (err?.message || err), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-display font-black text-slate-900">
                Sinkronisasi Impor Data Dapodik (.xlsx / .csv)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pembaruan cerdas menggunakan upsert batch tanpa menimpa ID siswa, password, foto, maupun riwayat nilai.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-black cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {/* 3 Tab Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-3 bg-slate-100 p-1.5 rounded-2xl gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('siswa');
              setPreviewSummary(null);
            }}
            className={`py-2.5 px-3 rounded-xl font-display font-black text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'siswa' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>1. Peserta Didik</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('guru');
              setPreviewSummary(null);
            }}
            className={`py-2.5 px-3 rounded-xl font-display font-black text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'guru' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>2. PTK / Guru</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('sekolah');
              setPreviewSummary(null);
            }}
            className={`py-2.5 px-3 rounded-xl font-display font-black text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'sekolah' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <School className="w-4 h-4" />
            <span>3. Profil Sekolah</span>
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-bold">
                Panduan Impor{' '}
                {activeTab === 'siswa'
                  ? 'Peserta Didik Dapodik'
                  : activeTab === 'guru'
                  ? 'PTK / Guru Dapodik'
                  : 'Profil Sekolah Dapodik'}
                :
              </p>
              <p className="leading-relaxed">
                {activeTab === 'siswa'
                  ? 'Unggah unduhan Excel/CSV Dapodik. Sistem otomatis memetakan NISN, NIPD, Rombel, PIN tanggal lahir (DDMMYYYY) bagi siswa baru, serta mendeteksi status Inklusi/PDBK.'
                  : activeTab === 'guru'
                  ? 'Unggah daftar PTK/Guru dari Dapodik (NUPTK, NIP, Status Kepegawaian, Jenis PTK) dengan menjaga akun & riwayat guru yang sudah ada.'
                  : 'Unggah profil satuan pendidikan Dapodik untuk memperbarui Nama Sekolah, NPSN, Status (Negeri/Swasta), Kepala Sekolah, dan Alamat secara otomatis.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-4 py-2 rounded-xl bg-white hover:bg-sky-100 text-sky-800 border border-sky-300 font-display font-extrabold text-[11px] flex items-center gap-1.5 shrink-0 cursor-pointer transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Template</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Pilih File Dapodik (.xlsx / .xls / .csv)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="w-full text-xs text-slate-600 file:mr-4 file:py-3 file:px-6 file:rounded-2xl file:border-0 file:text-xs file:font-black file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 cursor-pointer border border-slate-200 rounded-2xl p-2 bg-slate-50"
            />
          </div>

          {previewSummary && (
            <div className="p-5 rounded-3xl bg-emerald-50 border border-emerald-300 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-950 font-black text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>
                    {previewSummary.type === 'siswa'
                      ? `Terdeteksi ${previewSummary.newCount} Baru, ${previewSummary.updatedCount} Diperbarui, dan ${previewSummary.inklusiCount} Siswa Inklusi`
                      : previewSummary.type === 'guru'
                      ? `Terdeteksi ${previewSummary.newCount} PTK Baru dan ${previewSummary.updatedCount} PTK Diperbarui`
                      : 'Profil Sekolah Dapodik Siap Disinkronkan'}
                  </span>
                </div>
              </div>

              {previewSummary.type !== 'sekolah' ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-bold text-emerald-900">
                    <div className="bg-white p-3 rounded-2xl border border-emerald-200">
                      <span>Total Terbaca:</span>
                      <p className="text-lg font-black text-slate-900">{previewSummary.total}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-emerald-200">
                      <span>Data Baru:</span>
                      <p className="text-lg font-black text-emerald-700">{previewSummary.newCount}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-emerald-200">
                      <span>Diperbarui:</span>
                      <p className="text-lg font-black text-sky-700">{previewSummary.updatedCount}</p>
                    </div>
                    {previewSummary.type === 'siswa' && (
                      <div className="bg-white p-3 rounded-2xl border border-emerald-200">
                        <span>Siswa Inklusi:</span>
                        <p className="text-lg font-black text-amber-700">{previewSummary.inklusiCount}</p>
                      </div>
                    )}
                  </div>

                  {previewSummary.parsedData.length > 0 && (
                    <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
                      <div className="px-3 py-2 bg-emerald-100/70 text-[11px] font-black text-emerald-950">
                        Sampel Pratinjau (Maks. 5 Baris Pertama)
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-100">
                            <tr>
                              <th className="px-3 py-2 font-black">Nama</th>
                              <th className="px-3 py-2 font-black">
                                {previewSummary.type === 'siswa' ? 'NISN / NIPD' : 'NUPTK / NIP'}
                              </th>
                              <th className="px-3 py-2 font-black">
                                {previewSummary.type === 'siswa' ? 'Rombel' : 'Status / Jenis'}
                              </th>
                              <th className="px-3 py-2 font-black">Keterangan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {previewSummary.parsedData.slice(0, 5).map((row: any, idx: number) => (
                              <tr key={idx}>
                                <td className="px-3 py-2 font-bold text-slate-900">{row.nama}</td>
                                <td className="px-3 py-2 font-mono text-slate-600">
                                  {previewSummary.type === 'siswa'
                                    ? `${row.nisn || '-'}${row.nipd ? ` / ${row.nipd}` : ''}`
                                    : `${row.nuptk || '-'} / ${row.nip || '-'}`}
                                </td>
                                <td className="px-3 py-2 text-slate-700">
                                  {previewSummary.type === 'siswa'
                                    ? row.kelas
                                    : `${row.statusPegawai} • ${row.jenisPtk || row.penugasan}`}
                                </td>
                                <td className="px-3 py-2">
                                  {previewSummary.type === 'siswa' ? (
                                    row.learningStatus === 'inklusi' ? (
                                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                                        Inklusi: {row.inclusionNote}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                                        Reguler
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-slate-500">{row.tempatLahir}, {row.tanggalLahir}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                previewSummary.profilePatch && (
                  <div className="bg-white p-4 rounded-2xl border border-emerald-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 font-bold block">Nama Sekolah:</span>
                      <span className="font-black text-slate-900">{previewSummary.profilePatch.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block">NPSN &amp; Status:</span>
                      <span className="font-black text-slate-900">
                        {previewSummary.profilePatch.npsn} ({previewSummary.profilePatch.schoolStatus === 'swasta' ? 'Swasta' : 'Negeri'})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block">Kepala Sekolah:</span>
                      <span className="font-black text-slate-900">
                        {previewSummary.profilePatch.kepalaSekolah?.nama || '-'} (NIP:{' '}
                        {previewSummary.profilePatch.kepalaSekolah?.nip || '-'})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block">Alamat &amp; Wilayah:</span>
                      <span className="font-medium text-slate-700">
                        {[
                          previewSummary.profilePatch.alamat,
                          previewSummary.profilePatch.kecamatan,
                          previewSummary.profilePatch.kota,
                          previewSummary.profilePatch.provinsi,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-extrabold text-xs transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!previewSummary || isLoading}
            onClick={handleExecuteSync}
            className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-display font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyinkronkan ke Database...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Sinkronisasi ke Database SERBU 21</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
