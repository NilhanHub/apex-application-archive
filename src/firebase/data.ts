import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { firebaseApp } from './app';
import { useFirebaseEmulators } from './env';
import { functions } from './functions';

export { functions };

export const db = firebaseApp ? getFirestore(firebaseApp) : undefined;
export const storage = firebaseApp ? getStorage(firebaseApp) : undefined;

declare global {
  var __apexDataEmulatorsConnected: boolean | undefined;
}

if (useFirebaseEmulators && db && storage && !globalThis.__apexDataEmulatorsConnected) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  globalThis.__apexDataEmulatorsConnected = true;
}
