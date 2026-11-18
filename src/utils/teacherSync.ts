import { SchoolProfile, Teacher } from '../types';

export interface ResolvedKepsek {
  nama: string;
  nip: string;
  status: 'PNS' | 'PPPK' | 'KKI' | 'Honor';
}

export function findKepalaSekolahInTeachers(teachers: Teacher[]): Teacher | undefined {
  return teachers.find(
    (t) => (t.penugasan || '').trim().toLowerCase() === 'kepala sekolah'
  );
}

export function resolveKepalaSekolah(
  teachers: Teacher[] = [],
  profile?: SchoolProfile
): ResolvedKepsek {
  const kepsekTeacher = findKepalaSekolahInTeachers(teachers);
  if (kepsekTeacher) {
    return {
      nama: kepsekTeacher.nama || '-',
      nip: kepsekTeacher.nip || '-',
      status: kepsekTeacher.statusPegawai || 'PNS',
    };
  }
  return {
    nama: profile?.kepalaSekolah?.nama || '-',
    nip: profile?.kepalaSekolah?.nip || '-',
    status: profile?.kepalaSekolah?.status || 'PNS',
  };
}

export function resolveWaliKelas(teachers: Teacher[] = [], kelas?: string): Teacher | undefined {
  if (!kelas) return undefined;
  const target = kelas.trim().toLowerCase();
  const targetNoPrefix = target.replace(/^kelas\s+/, '');
  return teachers.find((t) => {
    const p = (t.penugasan || '').trim().toLowerCase();
    if (!p) return false;
    return p === target || p.replace(/^kelas\s+/, '') === targetNoPrefix;
  });
}

export function formatNipLabel(status?: string, nip?: string): string {
  const prefix =
    status === 'PPPK' ? 'NIPPPK. ' : status === 'KKI' ? 'NIKKI. ' : 'NIP. ';
  return `${prefix}${nip && nip.trim() ? nip.trim() : '-'}`;
}

export function syncProfileKepsekWithTeachers(
  profile: SchoolProfile,
  teachers: Teacher[]
): { profile: SchoolProfile; changed: boolean } {
  const kepsekTeacher = findKepalaSekolahInTeachers(teachers);
  if (!kepsekTeacher) {
    return { profile, changed: false };
  }
  const nextNama = kepsekTeacher.nama || profile.kepalaSekolah.nama;
  const nextNip = kepsekTeacher.nip || profile.kepalaSekolah.nip;
  const nextStatus = kepsekTeacher.statusPegawai || profile.kepalaSekolah.status;

  if (
    profile.kepalaSekolah?.nama === nextNama &&
    profile.kepalaSekolah?.nip === nextNip &&
    profile.kepalaSekolah?.status === nextStatus
  ) {
    return { profile, changed: false };
  }

  return {
    changed: true,
    profile: {
      ...profile,
      kepalaSekolah: {
        nama: nextNama,
        nip: nextNip,
        status: nextStatus,
      },
    },
  };
}
