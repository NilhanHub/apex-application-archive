import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { firebaseClientConfig, isFirebaseConfigured } from './env';

export const firebaseApp = isFirebaseConfigured && !getApps().length ? initializeApp(firebaseClientConfig) : getApps()[0];
export const auth = firebaseApp ? getAuth(firebaseApp) : undefined;
export const db = firebaseApp ? getFirestore(firebaseApp) : undefined;
export const storage = firebaseApp ? getStorage(firebaseApp) : undefined;
export const functions = firebaseApp ? getFunctions(firebaseApp) : undefined;
