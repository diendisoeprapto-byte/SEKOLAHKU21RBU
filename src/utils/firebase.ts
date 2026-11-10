import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Konfigurasi resmi Firebase Firestore dari pengguna (Project: appadministrasi)
export const USER_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCsZr3o19fL_Rl0K9cDuv2sDQaRPaQpMDA",
  authDomain: "appadministrasi.firebaseapp.com",
  projectId: "appadministrasi",
  storageBucket: "appadministrasi.firebasestorage.app",
  messagingSenderId: "656212188216",
  appId: "1:656212188216:web:1d7ca777550627f5de9acd",
  measurementId: "G-R8MTNPS69M"
};

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(USER_FIREBASE_CONFIG) : getApp();

// Initialize Firestore (default database of appadministrasi)
export const db = getFirestore(app);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Connection test helper
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Firebase connection established successfully to appadministrasi.');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration or internet connection.');
    } else {
      console.log('Firebase ping check completed:', error);
    }
    return false;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
