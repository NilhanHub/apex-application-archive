import type { User } from 'firebase/auth';
import { describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../types';
import {
  approvedRoleForEmail,
  bootstrapCurrentUser,
  type ApprovedRole,
  type ProfileBootstrapDependencies,
} from './access';

function authUser(email = 'authorized-user-2@example.test', verified = true): User {
  return {
    uid: 'approved-user',
    email,
    emailVerified: verified,
    displayName: 'Nilhan',
  } as User;
}

function profile(user: User, role: ApprovedRole = 'owner'): UserProfile {
  return {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? 'Recruiter',
    role,
    approved: true,
    active: true,
  };
}

describe('approved-user profile bootstrap', () => {
  it('maps only the three approved emails to fixed roles', () => {
    expect(approvedRoleForEmail(' authorized-user-2@example.test ')).toBe('owner');
    expect(approvedRoleForEmail('authorized-user-3@example.test')).toBe('owner');
    expect(approvedRoleForEmail('authorized-user-4@example.test')).toBe('recruiter');
    expect(approvedRoleForEmail('someone@example.com')).toBeNull();
  });

  it('returns an existing approved profile without rewriting it', async () => {
    const user = authUser();
    const expected = profile(user);
    const dependencies: ProfileBootstrapDependencies = {
      loadProfile: vi.fn().mockResolvedValue(expected),
      createProfile: vi.fn(),
    };

    await expect(bootstrapCurrentUser(user, dependencies)).resolves.toEqual(expected);
    expect(dependencies.createProfile).not.toHaveBeenCalled();
  });

  it('creates a first-time approved profile and then loads it', async () => {
    const user = authUser();
    const expected = profile(user);
    const dependencies: ProfileBootstrapDependencies = {
      loadProfile: vi.fn()
        .mockRejectedValueOnce({ code: 'firestore/permission-denied' })
        .mockResolvedValueOnce(expected),
      createProfile: vi.fn().mockResolvedValue(undefined),
    };

    await expect(bootstrapCurrentUser(user, dependencies)).resolves.toEqual(expected);
    expect(dependencies.createProfile).toHaveBeenCalledWith(user, 'owner');
    expect(dependencies.loadProfile).toHaveBeenCalledTimes(2);
  });

  it('recovers when another tab creates the profile first', async () => {
    const user = authUser();
    const expected = profile(user);
    const dependencies: ProfileBootstrapDependencies = {
      loadProfile: vi.fn()
        .mockRejectedValueOnce({ code: 'permission-denied' })
        .mockResolvedValueOnce(expected),
      createProfile: vi.fn().mockRejectedValue({ code: 'firestore/permission-denied' }),
    };

    await expect(bootstrapCurrentUser(user, dependencies)).resolves.toEqual(expected);
    expect(dependencies.loadProfile).toHaveBeenCalledTimes(2);
  });

  it('rejects unverified and unapproved Google accounts before any write', async () => {
    const dependencies: ProfileBootstrapDependencies = {
      loadProfile: vi.fn(),
      createProfile: vi.fn(),
    };

    await expect(bootstrapCurrentUser(authUser('authorized-user-2@example.test', false), dependencies))
      .rejects.toMatchObject({ code: 'access/email-unverified' });
    await expect(bootstrapCurrentUser(authUser('someone@example.com'), dependencies))
      .rejects.toMatchObject({ code: 'access/not-approved' });
    expect(dependencies.loadProfile).not.toHaveBeenCalled();
    expect(dependencies.createProfile).not.toHaveBeenCalled();
  });

  it('reports a stable error when an existing profile is inaccessible', async () => {
    const dependencies: ProfileBootstrapDependencies = {
      loadProfile: vi.fn().mockRejectedValue({ code: 'firestore/permission-denied' }),
      createProfile: vi.fn().mockRejectedValue({ code: 'firestore/permission-denied' }),
    };

    await expect(bootstrapCurrentUser(authUser(), dependencies))
      .rejects.toMatchObject({ code: 'access/profile-unavailable' });
  });
});
