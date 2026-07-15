import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

interface AuthLike {
  uid?: string;
  token?: Record<string, unknown>;
}

export async function requireApprovedUser(auth: AuthLike | undefined): Promise<{ uid: string; role: 'owner' | 'recruiter' }> {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');

  const snapshot = await getFirestore().collection('users').doc(auth.uid).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.active !== true || data?.approved !== true) {
    throw new HttpsError('permission-denied', 'This account is not approved for Apex Talent Archive.');
  }
  const role = data.role === 'owner' ? 'owner' : data.role === 'recruiter' ? 'recruiter' : null;
  if (!role) throw new HttpsError('permission-denied', 'This account has no valid archive role.');
  return { uid: auth.uid, role };
}

export async function requireOwner(auth: AuthLike | undefined): Promise<string> {
  const user = await requireApprovedUser(auth);
  if (user.role !== 'owner') throw new HttpsError('permission-denied', 'Owner access is required.');
  return user.uid;
}
