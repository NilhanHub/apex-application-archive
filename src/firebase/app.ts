import { getApps, initializeApp } from 'firebase/app';
import { firebaseClientConfig, isFirebaseConfigured } from './env';

export const firebaseApp = isFirebaseConfigured ? getApps()[0] ?? initializeApp(firebaseClientConfig) : undefined;
