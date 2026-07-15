import { httpsCallable } from 'firebase/functions';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth } from '../firebase/auth';
import { db } from '../firebase/data';
import { functions } from '../firebase/functions';

export async function provisionCurrentUser(): Promise<void> {
  if (!functions || !auth || !db) throw new Error('Firebase is not configured.');
  try {
    const callable = httpsCallable(functions, 'provisionUserProfile');
    await callable();
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code !== 'functions/not-found') throw error;

    const user = auth.currentUser;
    if (!user?.uid || !user.email || !user.emailVerified) throw error;
    const email = user.email.toLowerCase();
    const role = email === 'nilhan.dev@gmail.com' || email === 'nilhan@gmail.com'
      ? 'owner'
      : email === 'prashanthiratnayake23@gmail.com'
        ? 'recruiter'
        : null;
    if (!role) throw error;

    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email,
      displayName: (user.displayName ?? (role === 'owner' ? 'Nilhan' : 'Prashanthi')).slice(0, 100),
      role,
      approved: true,
      active: true,
      provisionedAt: serverTimestamp(),
    });
  }
}
