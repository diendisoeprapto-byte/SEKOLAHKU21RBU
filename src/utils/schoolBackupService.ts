import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { APP_VERSION } from './appVersion';
import { getLocalTodayStr } from './dateUtils';
import {
  getStoredCBTExams,
  getStoredProfile,
  getStoredTKAQuestions,
} from './storage';
import {
  cleanTenantId,
  getActiveSchoolNpsn,
  SCHOOLS_COLLECTION,
  syncAllExamsSeparatedToTenant,
} from './examAnswerKeyFirestore';
import {
  applyBackupMapToLocalStorage,
  collectPersistentLocalBackup,
  restoreBackupJsonToCloudRealtime,
} from './cloudSync';

export const BACKUP_BATCH_MAX_DOCS = 400;

export const SCHOOL_FIRESTORE_COLLECTIONS = [
  'school_profiles',
  'teachers',
  'students',
  'attendance',
  'assessments',
  'cbt_exams',
  'cbt_results',
  'tka_questions',
  'tka_submissions',
  'ekskul',
  'penilaian_ekskul',
  'settings',
  'settings_asaj',
  'nilai_asaj',
  'siswa',
  'alumni',
  'perpustakaan',
  'log_literasi',
  'peminjaman_perpustakaan',
  'pinjaman',
  'media_ajar',
  'sarah_knowledge_base',
  'sarah_student_logs',
  'sarah_chat_sessions',
  'hasil_ujian',
  'laporan_kebiasaan',
] as const;

export const TENANT_SUBCOLLECTIONS = [
  'learning_docs',
  'learning_journals',
  'learning_remedials',
  'sarah_knowledge_links',
  'exams',
  'exam_answer_keys',
  'inventory_items',
] as const;

// Koleksi yang dokumen usangnya aman dibersihkan saat mode Replace Full
const REPLACE_CLEARABLE_COLLECTIONS = new Set<string>([
  'teachers',
  'students',
  'attendance',
  'assessments',
  'cbt_exams',
  'cbt_results',
  'tka_questions',
  'tka_submissions',
  'ekskul',
  'penilaian_ekskul',
  'settings_asaj',
  'nilai_asaj',
  'siswa',
  'alumni',
  'perpustakaan',
  'log_literasi',
  'peminjaman_perpustakaan',
  'pinjaman',
  'media_ajar',
  'sarah_knowledge_base',
  'sarah_student_logs',
  'hasil_ujian',
  'laporan_kebiasaan',
]);

export interface SerializedDocEntry {
  id: string;
  data: Record<string, any>;
}

export interface FullSchoolBackupPackage {
  backupFormat: 'SERBU21_FULL_SCHOOL_BACKUP';
  schemaVersion: string;
  appVersion: string;
  exportedAt: string;
  exportedDate: string;
  exportedBy: string;
  school: {
    npsn: string;
    name: string;
  };
  stats: {
    totalCollections: number;
    totalDocuments: number;
    totalLocalKeys: number;
  };
  schoolTenantDoc?: Record<string, any> | null;
  collections: Record<string, SerializedDocEntry[]>;
  schoolSubcollections: Record<string, SerializedDocEntry[]>;
  localStorageSnapshot: Record<string, any>;
}

export interface BackupFilePreview {
  format: 'serbu21_v5_full' | 'legacy_flat_json';
  schemaVersion: string;
  schoolName: string;
  npsn: string;
  exportedAt: string;
  exportedBy: string;
  totalCollections: number;
  totalDocuments: number;
  totalLocalKeys: number;
  collectionBreakdown: Array<{
    name: string;
    count: number;
    group: 'firestore' | 'tenant' | 'local';
  }>;
  parsedRaw: any;
}

export interface ExportBackupResult {
  fileName: string;
  npsn: string;
  totalCollections: number;
  totalDocuments: number;
  totalLocalKeys: number;
  byteSize: number;
}

export interface RestoreProgressInfo {
  stage: string;
  currentBatch: number;
  totalBatches: number;
  processedDocs: number;
  totalDocs: number;
}

export interface RestoreSchoolBackupResult {
  restoredDocsCount: number;
  skippedNewerDocsCount: number;
  deletedStaleDocsCount: number;
  restoredLocalKeysCount: number;
  totalBatches: number;
  warningsCount: number;
  mode: 'merge' | 'replace';
}

function serializeFirestoreValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        return val.toDate().toISOString();
      } catch {
        return new Date().toISOString();
      }
    }
    if (
      typeof val.seconds === 'number' &&
      typeof val.nanoseconds === 'number' &&
      Object.keys(val).length <= 3
    ) {
      return new Date(val.seconds * 1000).toISOString();
    }
    if (Array.isArray(val)) {
      return val.map((item) => serializeFirestoreValue(item));
    }
    const out: Record<string, any> = {};
    Object.entries(val).forEach(([k, v]) => {
      if (v === undefined) return;
      if (k === 'serverTime') return;
      out[k] = serializeFirestoreValue(v);
    });
    return out;
  }
  return val;
}

function extractNumericTimestamp(docData: Record<string, any> | null | undefined): number {
  if (!docData || typeof docData !== 'object') return 0;
  const candidates = [
    docData.updatedAt,
    docData.recordedAt,
    docData.lastUpdated,
    docData.timestamp,
    docData.createdAt,
    docData.deletedAt,
    docData.verifiedAt,
  ];
  let best = 0;
  for (const cand of candidates) {
    if (typeof cand === 'number' && Number.isFinite(cand) && cand > best) {
      best = cand;
    } else if (typeof cand === 'string' && cand.trim()) {
      const parsed = Date.parse(cand);
      if (Number.isFinite(parsed) && parsed > best) {
        best = parsed;
      }
    } else if (cand && typeof cand === 'object' && typeof cand.toDate === 'function') {
      try {
        const ms = cand.toDate().getTime();
        if (Number.isFinite(ms) && ms > best) best = ms;
      } catch {}
    } else if (cand && typeof cand === 'object' && typeof cand.seconds === 'number') {
      const ms = cand.seconds * 1000;
      if (Number.isFinite(ms) && ms > best) best = ms;
    }
  }
  return best;
}

function dispatchFullRefreshEvents() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('sekolahku-cloud-sync-updated'));
  window.dispatchEvent(new Event('sekolahku-exam-results-updated'));
  window.dispatchEvent(new Event('sekolahku-cbt-exams-updated'));
  window.dispatchEvent(new Event('sekolahku-cbt-durations-updated'));
  window.dispatchEvent(new Event('sekolahku-tka-durations-updated'));
  window.dispatchEvent(new Event('sekolahku-tka-active-updated'));
  window.dispatchEvent(new Event('sekolahku-tka-questions-updated'));
  window.dispatchEvent(new Event('sekolahku-deletion-log-updated'));
}

/**
 * Mengekspor seluruh database sekolah (Firestore top-level collections, tenant subcollections schools/{npsn}/*,
 * serta snapshot lengkap localStorage & IndexedDB) ke dalam berkas Backup_SERBU21_[NPSN]_[Tanggal].json.
 */
export async function exportFullSchoolBackupJson(params: {
  npsn?: string;
  schoolName?: string;
  actorName?: string;
}): Promise<ExportBackupResult> {
  const profile = getStoredProfile();
  const npsn = getActiveSchoolNpsn(params.npsn || profile?.npsn);
  const schoolName = params.schoolName || profile?.name || 'SDN Rawa Badak Utara 21';
  const actorName = params.actorName || 'Administrator';
  const dateStr = getLocalTodayStr();
  const exportedAt = new Date().toISOString();

  const collections: Record<string, SerializedDocEntry[]> = {};
  const schoolSubcollections: Record<string, SerializedDocEntry[]> = {};
  let totalDocuments = 0;

  // 1. Ambil seluruh top-level collections sekolah
  const collectionResults = await Promise.all(
    SCHOOL_FIRESTORE_COLLECTIONS.map(async (colName) => {
      try {
        const snap = await getDocs(collection(db, colName));
        const docs: SerializedDocEntry[] = [];
        snap.forEach((docSnap) => {
          docs.push({
            id: docSnap.id,
            data: serializeFirestoreValue(docSnap.data() || {}),
          });
        });
        return { colName, docs };
      } catch (err) {
        console.warn(`[schoolBackupService] Koleksi ${colName} dilewati saat backup:`, err);
        return { colName, docs: [] as SerializedDocEntry[] };
      }
    })
  );

  collectionResults.forEach(({ colName, docs }) => {
    collections[colName] = docs;
    totalDocuments += docs.length;
  });

  // 2. Ambil dokumen induk sekolah & subkoleksi multi-tenant schools/{npsn}/*
  let schoolTenantDoc: Record<string, any> | null = null;
  try {
    const tenantSnap = await getDoc(doc(db, SCHOOLS_COLLECTION, npsn));
    if (tenantSnap.exists()) {
      schoolTenantDoc = serializeFirestoreValue(tenantSnap.data() || {});
      totalDocuments += 1;
    }
  } catch {
    schoolTenantDoc = null;
  }

  const subResults = await Promise.all(
    TENANT_SUBCOLLECTIONS.map(async (subName) => {
      try {
        const snap = await getDocs(collection(db, SCHOOLS_COLLECTION, npsn, subName));
        const docs: SerializedDocEntry[] = [];
        snap.forEach((docSnap) => {
          docs.push({
            id: docSnap.id,
            data: serializeFirestoreValue(docSnap.data() || {}),
          });
        });
        return { subName, docs };
      } catch (err) {
        console.warn(
          `[schoolBackupService] Subkoleksi schools/${npsn}/${subName} dilewati:`,
          err
        );
        return { subName, docs: [] as SerializedDocEntry[] };
      }
    })
  );

  subResults.forEach(({ subName, docs }) => {
    schoolSubcollections[subName] = docs;
    totalDocuments += docs.length;
  });

  // 3. Kumpulkan seluruh data localStorage + IndexedDB (e-Rapor, modul ajar, dsb.)
  const localStorageSnapshot = collectPersistentLocalBackup();
  const totalLocalKeys = Object.keys(localStorageSnapshot).length;

  const nonEmptyCollectionsCount =
    Object.values(collections).filter((arr) => arr.length > 0).length +
    Object.values(schoolSubcollections).filter((arr) => arr.length > 0).length;

  const payload: FullSchoolBackupPackage = {
    backupFormat: 'SERBU21_FULL_SCHOOL_BACKUP',
    schemaVersion: '5.1.0',
    appVersion: APP_VERSION,
    exportedAt,
    exportedDate: dateStr,
    exportedBy: actorName,
    school: {
      npsn,
      name: schoolName,
    },
    stats: {
      totalCollections: nonEmptyCollectionsCount,
      totalDocuments,
      totalLocalKeys,
    },
    schoolTenantDoc,
    collections,
    schoolSubcollections,
    localStorageSnapshot,
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const fileName = `Backup_SERBU21_${cleanTenantId(npsn, '20105060')}_${dateStr}.json`;

  if (typeof document !== 'undefined') {
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    fileName,
    npsn,
    totalCollections: nonEmptyCollectionsCount,
    totalDocuments,
    totalLocalKeys,
    byteSize: jsonStr.length,
  };
}

/**
 * Memvalidasi & membuat ringkasan pratinjau file JSON backup sebelum dijalankan proses pemulihan.
 */
export function parseAndPreviewBackupFile(jsonString: string): BackupFilePreview {
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Berkas JSON tidak valid atau bukan format cadangan SERBU 21.');
  }

  if (
    parsed.backupFormat === 'SERBU21_FULL_SCHOOL_BACKUP' ||
    (parsed.collections && typeof parsed.collections === 'object')
  ) {
    const pkg = parsed as FullSchoolBackupPackage;
    const breakdown: BackupFilePreview['collectionBreakdown'] = [];
    let totalDocs = pkg.schoolTenantDoc ? 1 : 0;
    let nonEmptyCols = 0;

    Object.entries(pkg.collections || {}).forEach(([name, docs]) => {
      const count = Array.isArray(docs) ? docs.length : 0;
      if (count > 0) {
        nonEmptyCols++;
        totalDocs += count;
        breakdown.push({ name, count, group: 'firestore' });
      }
    });

    Object.entries(pkg.schoolSubcollections || {}).forEach(([name, docs]) => {
      const count = Array.isArray(docs) ? docs.length : 0;
      if (count > 0) {
        nonEmptyCols++;
        totalDocs += count;
        breakdown.push({ name: `schools/{npsn}/${name}`, count, group: 'tenant' });
      }
    });

    const localKeysCount =
      pkg.localStorageSnapshot && typeof pkg.localStorageSnapshot === 'object'
        ? Object.keys(pkg.localStorageSnapshot).length
        : 0;

    if (totalDocs === 0 && localKeysCount === 0) {
      throw new Error('File backup valid tetapi tidak berisi dokumen atau data lokal.');
    }

    return {
      format: 'serbu21_v5_full',
      schemaVersion: String(pkg.schemaVersion || pkg.appVersion || '5.1.0'),
      schoolName: pkg.school?.name || 'Sekolah SERBU 21',
      npsn: cleanTenantId(pkg.school?.npsn, getActiveSchoolNpsn()),
      exportedAt: pkg.exportedAt || '-',
      exportedBy: pkg.exportedBy || 'Admin',
      totalCollections: nonEmptyCols,
      totalDocuments: totalDocs,
      totalLocalKeys: localKeysCount,
      collectionBreakdown: breakdown,
      parsedRaw: pkg,
    };
  }

  // Fallback dukungan file JSON lama (flat map sekolahku_*)
  const keys = Object.keys(parsed).filter((k) => k.startsWith('sekolahku_'));
  if (keys.length === 0) {
    throw new Error(
      'Struktur file JSON tidak dikenali sebagai cadangan database SERBU 21.'
    );
  }

  const profileObj = parsed.sekolahku_school_profile;
  const breakdown: BackupFilePreview['collectionBreakdown'] = keys
    .slice(0, 12)
    .map((k) => ({
      name: k.replace('sekolahku_', ''),
      count: Array.isArray(parsed[k])
        ? parsed[k].length
        : parsed[k] && typeof parsed[k] === 'object'
        ? Object.keys(parsed[k]).length
        : 1,
      group: 'local',
    }));

  return {
    format: 'legacy_flat_json',
    schemaVersion: 'Legacy JSON',
    schoolName: profileObj?.name || 'Sekolah SERBU 21',
    npsn: cleanTenantId(profileObj?.npsn, getActiveSchoolNpsn()),
    exportedAt: '-',
    exportedBy: 'Admin',
    totalCollections: keys.length,
    totalDocuments: 0,
    totalLocalKeys: keys.length,
    collectionBreakdown: breakdown,
    parsedRaw: parsed,
  };
}

interface PendingBatchOp {
  type: 'set' | 'delete';
  ref: ReturnType<typeof doc>;
  data?: Record<string, any>;
  merge?: boolean;
}

/**
 * Mengeksekusi operasi tulis Firestore dalam batch bertahap maksimal 400 dokumen per batch,
 * dengan fallback aman per-dokumen bila ada satu dokumen yang ditolak aturan keamanan (misal nilai TKA terkunci).
 */
async function executeStagedBatches(
  ops: PendingBatchOp[],
  stageLabel: string,
  onProgress?: (info: RestoreProgressInfo) => void
): Promise<{ committedCount: number; warningsCount: number }> {
  if (ops.length === 0) {
    return { committedCount: 0, warningsCount: 0 };
  }

  const totalBatches = Math.ceil(ops.length / BACKUP_BATCH_MAX_DOCS);
  let committedCount = 0;
  let warningsCount = 0;

  for (let i = 0; i < ops.length; i += BACKUP_BATCH_MAX_DOCS) {
    const batchIdx = Math.floor(i / BACKUP_BATCH_MAX_DOCS) + 1;
    const chunk = ops.slice(i, i + BACKUP_BATCH_MAX_DOCS);

    onProgress?.({
      stage: stageLabel,
      currentBatch: batchIdx,
      totalBatches,
      processedDocs: i,
      totalDocs: ops.length,
    });

    try {
      const batch = writeBatch(db);
      chunk.forEach((op) => {
        if (op.type === 'delete') {
          batch.delete(op.ref);
        } else if (op.data) {
          if (op.merge) {
            batch.set(op.ref, op.data, { merge: true });
          } else {
            batch.set(op.ref, op.data);
          }
        }
      });
      await batch.commit();
      committedCount += chunk.length;
    } catch (batchErr) {
      console.warn(
        `[schoolBackupService] Batch ${batchIdx}/${totalBatches} gagal massal, beralih ke penulisan individual aman:`,
        batchErr
      );
      // Fallback per sub-batch 25 dokumen agar 1 dokumen bermasalah tidak membatalkan ratusan dokumen valid
      const { setDoc, deleteDoc } = await import('firebase/firestore');
      for (const op of chunk) {
        try {
          if (op.type === 'delete') {
            await deleteDoc(op.ref);
          } else if (op.data) {
            await setDoc(op.ref, op.data, op.merge ? { merge: true } : {});
          }
          committedCount += 1;
        } catch {
          warningsCount += 1;
        }
      }
    }

    onProgress?.({
      stage: stageLabel,
      currentBatch: batchIdx,
      totalBatches,
      processedDocs: Math.min(ops.length, i + chunk.length),
      totalDocs: ops.length,
    });
  }

  return { committedCount, warningsCount };
}

/**
 * Memulihkan Full Database Sekolah dari berkas backup .json ke Firestore & penyimpanan lokal.
 * Mendukung mode Merge (gabungkan tanpa menimpa data yang lebih baru) maupun Replace Full,
 * dengan pengiriman batch bertahap maksimal 400 dokumen per commit.
 */
export async function restoreFullSchoolBackupJson(params: {
  preview: BackupFilePreview;
  mode: 'merge' | 'replace';
  actorName: string;
  currentNpsn?: string;
  onProgress?: (info: RestoreProgressInfo) => void;
}): Promise<RestoreSchoolBackupResult> {
  const { preview, mode, actorName, currentNpsn, onProgress } = params;

  // Jalur kompatibilitas untuk file backup flat versi lama
  if (preview.format === 'legacy_flat_json') {
    onProgress?.({
      stage: 'Memulihkan format cadangan versi sebelumnya ke Cloud...',
      currentBatch: 1,
      totalBatches: 1,
      processedDocs: 0,
      totalDocs: 1,
    });
    const res = await restoreBackupJsonToCloudRealtime(
      JSON.stringify(preview.parsedRaw),
      actorName
    );
    await syncAllExamsSeparatedToTenant({
      cbtExams: getStoredCBTExams(),
      tkaQuestions: getStoredTKAQuestions(),
      overrideNpsn: currentNpsn,
    }).catch(() => {});
    dispatchFullRefreshEvents();
    return {
      restoredDocsCount: res.studentsCount + res.attendanceCount + res.kaldikCount,
      skippedNewerDocsCount: 0,
      deletedStaleDocsCount: 0,
      restoredLocalKeysCount: res.restoredKeysCount,
      totalBatches: 1,
      warningsCount: 0,
      mode,
    };
  }

  const pkg = preview.parsedRaw as FullSchoolBackupPackage;
  const targetNpsn = cleanTenantId(
    currentNpsn || pkg.school?.npsn,
    getActiveSchoolNpsn()
  );

  const writeOps: PendingBatchOp[] = [];
  const deleteOps: PendingBatchOp[] = [];
  let skippedNewerDocsCount = 0;

  // 1. Proses dokumen induk sekolah (schools/{npsn})
  if (pkg.schoolTenantDoc && typeof pkg.schoolTenantDoc === 'object') {
    const tenantRef = doc(db, SCHOOLS_COLLECTION, targetNpsn);
    const tenantData = {
      ...pkg.schoolTenantDoc,
      npsn: targetNpsn,
      serverTime: serverTimestamp(),
    };
    if (mode === 'merge') {
      const existingTenantSnap = await getDoc(tenantRef).catch(() => null);
      const existingTs = existingTenantSnap?.exists()
        ? extractNumericTimestamp(existingTenantSnap.data())
        : 0;
      const incomingTs = extractNumericTimestamp(pkg.schoolTenantDoc);
      if (existingTs > 0 && existingTs > incomingTs) {
        skippedNewerDocsCount++;
      } else {
        writeOps.push({ type: 'set', ref: tenantRef, data: tenantData, merge: true });
      }
    } else {
      writeOps.push({ type: 'set', ref: tenantRef, data: tenantData, merge: true });
    }
  }

  // 2. Proses top-level collections
  const colEntries = Object.entries(pkg.collections || {});
  onProgress?.({
    stage: 'Membandingkan stempel waktu data di Cloud Firestore...',
    currentBatch: 0,
    totalBatches: 1,
    processedDocs: 0,
    totalDocs: preview.totalDocuments,
  });

  for (const [colName, rawDocs] of colEntries) {
    if (!Array.isArray(rawDocs) || rawDocs.length === 0) continue;

    const existingTimestamps = new Map<string, number>();
    const existingIds = new Set<string>();
    try {
      const existingSnap = await getDocs(collection(db, colName));
      existingSnap.forEach((docSnap) => {
        existingIds.add(docSnap.id);
        existingTimestamps.set(docSnap.id, extractNumericTimestamp(docSnap.data()));
      });
    } catch {
      // Abaikan jika koleksi kosong/belum dapat dibaca
    }

    const incomingIds = new Set<string>();
    for (const entry of rawDocs) {
      if (!entry || !entry.id || !entry.data || typeof entry.data !== 'object') continue;
      incomingIds.add(entry.id);

      if (mode === 'merge') {
        const existingTs = existingTimestamps.get(entry.id) || 0;
        const incomingTs = extractNumericTimestamp(entry.data);
        if (existingTs > 0 && existingTs > incomingTs) {
          skippedNewerDocsCount++;
          continue;
        }
      }

      const payloadData = { ...entry.data };
      delete payloadData.serverTime;
      if (colName === 'cbt_exams' || colName === 'tka_questions') {
        payloadData.serverTime = serverTimestamp();
      }

      writeOps.push({
        type: 'set',
        ref: doc(db, colName, entry.id),
        data: payloadData,
        merge: mode === 'merge',
      });
    }

    if (mode === 'replace' && REPLACE_CLEARABLE_COLLECTIONS.has(colName)) {
      existingIds.forEach((oldId) => {
        if (!incomingIds.has(oldId)) {
          deleteOps.push({
            type: 'delete',
            ref: doc(db, colName, oldId),
          });
        }
      });
    }
  }

  // 3. Proses subkoleksi multi-tenant schools/{npsn}/*
  const subEntries = Object.entries(pkg.schoolSubcollections || {});
  for (const [subName, rawDocs] of subEntries) {
    if (!Array.isArray(rawDocs) || rawDocs.length === 0) continue;

    const existingTimestamps = new Map<string, number>();
    const existingIds = new Set<string>();
    try {
      const existingSnap = await getDocs(
        collection(db, SCHOOLS_COLLECTION, targetNpsn, subName)
      );
      existingSnap.forEach((docSnap) => {
        existingIds.add(docSnap.id);
        existingTimestamps.set(docSnap.id, extractNumericTimestamp(docSnap.data()));
      });
    } catch {}

    const incomingIds = new Set<string>();
    for (const entry of rawDocs) {
      if (!entry || !entry.id || !entry.data || typeof entry.data !== 'object') continue;
      incomingIds.add(entry.id);

      if (mode === 'merge') {
        const existingTs = existingTimestamps.get(entry.id) || 0;
        const incomingTs = extractNumericTimestamp(entry.data);
        if (existingTs > 0 && existingTs > incomingTs) {
          skippedNewerDocsCount++;
          continue;
        }
      }

      const payloadData = {
        ...entry.data,
        ...(subName === 'exam_answer_keys' ? { npsn: targetNpsn } : {}),
        serverTime: serverTimestamp(),
      };

      writeOps.push({
        type: 'set',
        ref: doc(db, SCHOOLS_COLLECTION, targetNpsn, subName, entry.id),
        data: payloadData,
        merge: mode === 'merge',
      });
    }

    if (mode === 'replace') {
      existingIds.forEach((oldId) => {
        if (!incomingIds.has(oldId)) {
          deleteOps.push({
            type: 'delete',
            ref: doc(db, SCHOOLS_COLLECTION, targetNpsn, subName, oldId),
          });
        }
      });
    }
  }

  // 4. Jalankan deleteOps (mode replace) dan writeOps dalam batch bertahap maksimal 400 dokumen
  let deletedStaleDocsCount = 0;
  let warningsCount = 0;
  let totalBatches = 0;

  if (deleteOps.length > 0) {
    const delRes = await executeStagedBatches(
      deleteOps,
      'Membersihkan dokumen lama (Mode Timpa Penuh)...',
      onProgress
    );
    deletedStaleDocsCount = delRes.committedCount;
    warningsCount += delRes.warningsCount;
    totalBatches += Math.ceil(deleteOps.length / BACKUP_BATCH_MAX_DOCS);
  }

  const writeRes = await executeStagedBatches(
    writeOps,
    'Memulihkan koleksi Firestore (maks. 400 dokumen/batch)...',
    onProgress
  );
  warningsCount += writeRes.warningsCount;
  totalBatches += Math.ceil(writeOps.length / BACKUP_BATCH_MAX_DOCS);

  // 5. Terapkan snapshot penyimpanan lokal & IndexedDB
  let restoredLocalKeysCount = 0;
  if (pkg.localStorageSnapshot && typeof pkg.localStorageSnapshot === 'object') {
    restoredLocalKeysCount = applyBackupMapToLocalStorage(pkg.localStorageSnapshot, {
      replaceAllNonSession: mode === 'replace',
    });
  }

  // 6. Jika cadangan berasal sebelum pemisahan exams & exam_answer_keys, sinkronkan otomatis sekarang
  const hasTenantExams = (pkg.schoolSubcollections?.exams?.length || 0) > 0;
  const hasTenantKeys = (pkg.schoolSubcollections?.exam_answer_keys?.length || 0) > 0;
  if (!hasTenantExams || !hasTenantKeys) {
    await syncAllExamsSeparatedToTenant({
      cbtExams: getStoredCBTExams(),
      tkaQuestions: getStoredTKAQuestions(),
      overrideNpsn: targetNpsn,
    }).catch(() => {});
  }

  dispatchFullRefreshEvents();

  return {
    restoredDocsCount: writeRes.committedCount,
    skippedNewerDocsCount,
    deletedStaleDocsCount,
    restoredLocalKeysCount,
    totalBatches: Math.max(1, totalBatches),
    warningsCount,
    mode,
  };
}
