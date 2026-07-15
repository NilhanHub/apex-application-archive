import type { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase/data';
import type { UserProfile } from '../types';

export type ApprovedRole = UserProfile['role'];

const APPROVED_ROLES: Readonly<Record<string, ApprovedRole>> = {
  'nilhan.dev@gmail.com': 'owner',
  'nilhan@gmail.com': 'owner',
  'prashanthiratnayake23@gmail.com': 'recruiter',
};

export class ArchiveAccessError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ArchiveAccessError';
    this.code = code;
  }
}

export function approvedRoleForEmail(email: string | null): ApprovedRole | null {
  return email ? APPROVED_ROLES[email.trim().toLowerCase()] ?? null : null;
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

function isPermissionDenied(error: unknown): boolean {
  return errorCode(error).endsWith('permission-denied');
}

function validateProfile(user: User, expectedRole: ApprovedRole, data: DocumentData): UserProfile {
  const email = user.email?.toLowerCase() ?? '';
  if (
    data.uid !== user.uid
    || String(data.email ?? '').toLowerCase() !== email
    || data.role !== expectedRole
    || data.approved !== true
    || data.active !== true
  ) {
    throw new ArchiveAccessError('access/profile-invalid', 'This archive profile is inactive or has invalid access settings.');
  }
  return {
    uid: user.uid,
    email,
    displayName: String(data.displayName ?? user.displayName ?? 'Recruiter'),
    role: expectedRole,
    approved: true,
    active: true,
  };
}

export interface ProfileBootstrapDependencies {
  loadProfile: (user: User, role: ApprovedRole) => Promise<UserProfile>;
  createProfile: (user: User, role: ApprovedRole) => Promise<void>;
}

const firebaseProfileDependencies: ProfileBootstrapDependencies = {
  async loadProfile(user, role) {
    if (!db) throw new Error('Firebase is not configured.');
    const snapshot = await getDoc(doc(db, 'users', user.uid));
    if (!snapshot.exists()) {
      throw new ArchiveAccessError('access/profile-missing', 'No archive profile exists for this account.');
    }
    return validateProfile(user, role, snapshot.data());
  },
  async createProfile(user, role) {
    if (!db) throw new Error('Firebase is not configured.');
    const email = user.email?.toLowerCase() ?? '';
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email,
      displayName: (user.displayName ?? (role === 'owner' ? 'Nilhan' : 'Prashanthi')).slice(0, 100),
      role,
      approved: true,
      active: true,
      provisionedAt: serverTimestamp(),
    });
  },
};

export async function bootstrapCurrentUser(
  user: User,
  dependencies: ProfileBootstrapDependencies = firebaseProfileDependencies,
): Promise<UserProfile> {
  if (!user?.uid || !user.email || !user.emailVerified) {
    throw new ArchiveAccessError('access/email-unverified', 'Use a verified approved Google account to open this archive.');
  }
  const role = approvedRoleForEmail(user.email);
  if (!role) {
    throw new ArchiveAccessError('access/not-approved', 'This Google account is not approved for Apex Talent Archive.');
  }

  try {
    return await dependencies.loadProfile(user, role);
  } catch (loadError) {
    if (!(loadError instanceof ArchiveAccessError && loadError.code === 'access/profile-missing') && !isPermissionDenied(loadError)) {
      throw loadError;
    }
  }

  try {
    await dependencies.createProfile(user, role);
  } catch (createError) {
    if (!isPermissionDenied(createError) && errorCode(createError) !== 'already-exists') throw createError;
  }

  try {
    return await dependencies.loadProfile(user, role);
  } catch (finalError) {
    if (isPermissionDenied(finalError)) {
      throw new ArchiveAccessError('access/profile-unavailable', 'This archive profile is inactive or unavailable. Contact the archive owner.');
    }
    throw finalError;
  }
}
