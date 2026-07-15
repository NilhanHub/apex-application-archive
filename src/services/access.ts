import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/functions';

export async function provisionCurrentUser(): Promise<void> {
  if (!functions) throw new Error('Firebase is not configured.');
  const callable = httpsCallable(functions, 'provisionUserProfile');
  await callable();
}
