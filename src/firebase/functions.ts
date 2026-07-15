import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { firebaseApp } from './app';
import { useFirebaseEmulators } from './env';

export const functions = firebaseApp ? getFunctions(firebaseApp, 'asia-south1') : undefined;

declare global {
  var __apexFunctionsEmulatorConnected: boolean | undefined;
}

if (useFirebaseEmulators && functions && !globalThis.__apexFunctionsEmulatorConnected) {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  globalThis.__apexFunctionsEmulatorConnected = true;
}
