import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { firebaseApp } from './app';
import { useFirebaseEmulators } from './env';

export const auth = firebaseApp ? getAuth(firebaseApp) : undefined;

declare global {
  var __apexAuthEmulatorConnected: boolean | undefined;
}

if (useFirebaseEmulators && auth && !globalThis.__apexAuthEmulatorConnected) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  globalThis.__apexAuthEmulatorConnected = true;
}
