import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { SharedKkgItem } from '../types';

export const KKG_COLLECTION = 'shared_kkg_items';

export function subscribeToSharedKkgItems(callback: (items: SharedKkgItem[]) => void) {
  const colRef = collection(db, KKG_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: SharedKkgItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as SharedKkgItem;
        if (data) {
          list.push({ ...data, id: docSnap.id });
        }
      });
      callback(list);
    },
    (err) => {
      console.warn('Shared KKG subscription warning:', err);
      callback([]);
    }
  );
}

export async function publishItemToKkgLibrary(item: Omit<SharedKkgItem, 'id' | 'createdAt'>): Promise<boolean> {
  const colRef = collection(db, KKG_COLLECTION);
  const itemId = `kkg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ref = doc(colRef, itemId);
  await setDoc(ref, {
    ...item,
    id: itemId,
    createdAt: new Date().toISOString(),
    serverTime: serverTimestamp(),
  });
  return true;
}

export async function removeSharedKkgItem(itemId: string): Promise<boolean> {
  const ref = doc(db, KKG_COLLECTION, itemId);
  await deleteDoc(ref);
  return true;
}
