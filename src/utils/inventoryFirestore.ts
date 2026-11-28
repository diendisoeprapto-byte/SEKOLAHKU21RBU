import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { InventoryItem } from '../types';
import { getActiveSchoolNpsn, SCHOOLS_COLLECTION } from './examAnswerKeyFirestore';

export const INVENTORY_SUBCOLLECTION = 'inventory_items';

export function getInventoryCollectionRef(npsn?: string) {
  const tenant = getActiveSchoolNpsn(npsn);
  return collection(db, SCHOOLS_COLLECTION, tenant, INVENTORY_SUBCOLLECTION);
}

export function subscribeToInventoryItems(npsn: string | undefined, callback: (items: InventoryItem[]) => void) {
  const tenant = getActiveSchoolNpsn(npsn);
  const colRef = collection(db, SCHOOLS_COLLECTION, tenant, INVENTORY_SUBCOLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: InventoryItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as InventoryItem;
        if (data) {
          list.push({ ...data, id: docSnap.id });
        }
      });
      callback(list);
    },
    (err) => {
      console.warn('Inventory subscription warning:', err);
      callback([]);
    }
  );
}

export async function saveInventoryItemToFirestore(item: InventoryItem, npsn?: string): Promise<boolean> {
  const tenant = getActiveSchoolNpsn(npsn);
  const itemId = item.id || `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ref = doc(db, SCHOOLS_COLLECTION, tenant, INVENTORY_SUBCOLLECTION, itemId);
  await setDoc(
    ref,
    {
      ...item,
      id: itemId,
      npsn: tenant,
      updatedAt: new Date().toISOString(),
      serverTime: serverTimestamp(),
    },
    { merge: true }
  );
  return true;
}

export async function deleteInventoryItemFromFirestore(itemId: string, npsn?: string): Promise<boolean> {
  const tenant = getActiveSchoolNpsn(npsn);
  const ref = doc(db, SCHOOLS_COLLECTION, tenant, INVENTORY_SUBCOLLECTION, itemId);
  await deleteDoc(ref);
  return true;
}

export async function saveInventoryBatchToFirestore(items: InventoryItem[], npsn?: string): Promise<boolean> {
  const tenant = getActiveSchoolNpsn(npsn);
  if (!items || items.length === 0) return true;
  const CHUNK_SIZE = 400;
  const totalChunks = Math.ceil(items.length / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const chunk = items.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((it, idx) => {
      const itemId = it.id || `inv_${Date.now()}_${i}_${idx}`;
      const ref = doc(db, SCHOOLS_COLLECTION, tenant, INVENTORY_SUBCOLLECTION, itemId);
      batch.set(
        ref,
        {
          ...it,
          id: itemId,
          npsn: tenant,
          updatedAt: new Date().toISOString(),
          serverTime: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  }
  return true;
}

export function subscribeToInventoryRooms(
  npsn: string | undefined,
  callback: (rooms: string[] | null) => void
) {
  const tenant = getActiveSchoolNpsn(npsn);
  const schoolDocRef = doc(db, SCHOOLS_COLLECTION, tenant);
  return onSnapshot(
    schoolDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data?.inventoryRooms)) {
          const clean = data.inventoryRooms
            .map((r: any) => String(r || '').trim())
            .filter(Boolean);
          callback(clean);
          return;
        }
      }
      callback(null);
    },
    () => {
      callback(null);
    }
  );
}

export async function saveInventoryRoomsToFirestore(
  rooms: string[],
  npsn?: string
): Promise<boolean> {
  const tenant = getActiveSchoolNpsn(npsn);
  const cleanRooms = Array.from(
    new Set(rooms.map((r) => String(r || '').trim()).filter(Boolean))
  );
  const schoolDocRef = doc(db, SCHOOLS_COLLECTION, tenant);
  await setDoc(
    schoolDocRef,
    {
      npsn: tenant,
      inventoryRooms: cleanRooms,
      updatedAt: new Date().toISOString(),
      serverTime: serverTimestamp(),
    },
    { merge: true }
  );
  return true;
}

