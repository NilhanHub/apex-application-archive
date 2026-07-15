import type { Auth, Unsubscribe, User } from 'firebase/auth';
import { describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../types';
import { ArchiveAccessError } from './access';
import {
  startAuthSession,
  type AuthPhase,
  type AuthSessionDependencies,
  type AuthSessionHandlers,
} from './authSession';

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function user(): User {
  return { uid: 'approved-user', email: 'authorized-user-2@example.test', emailVerified: true } as User;
}

function profile(): UserProfile {
  return {
    uid: 'approved-user',
    email: 'authorized-user-2@example.test',
    displayName: 'Nilhan',
    role: 'owner',
    approved: true,
    active: true,
  };
}

function harness(overrides: Partial<AuthSessionDependencies> = {}) {
  let observer: ((user: User | null) => void) | undefined;
  const dependencies: AuthSessionDependencies = {
    establishPersistence: vi.fn().mockResolvedValue(undefined),
    recoverRedirect: vi.fn().mockResolvedValue(null),
    observeAuth: vi.fn((_auth, next) => { observer = next; return vi.fn() as Unsubscribe; }),
    bootstrapUser: vi.fn().mockResolvedValue(profile()),
    signOutUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const phases: AuthPhase[] = [];
  const errors: unknown[] = [];
  const ready: UserProfile[] = [];
  const handlers: AuthSessionHandlers = {
    onPhase: (phase) => phases.push(phase),
    onReady: (nextProfile) => ready.push(nextProfile),
    onError: (error) => errors.push(error),
  };
  return { dependencies, handlers, phases, errors, ready, getObserver: () => observer };
}

describe('authentication session coordinator', () => {
  it('recovers redirect state before observing and bootstraps a UID once', async () => {
    const test = harness();
    const stop = startAuthSession({} as Auth, test.handlers, test.dependencies);
    expect(test.phases).toEqual(['resolving']);
    await settle();
    expect(test.dependencies.establishPersistence).toHaveBeenCalledOnce();
    expect(test.dependencies.recoverRedirect).toHaveBeenCalledOnce();
    expect(test.dependencies.observeAuth).toHaveBeenCalledOnce();

    test.getObserver()?.(user());
    test.getObserver()?.(user());
    await settle();
    expect(test.dependencies.bootstrapUser).toHaveBeenCalledOnce();
    expect(test.ready).toEqual([profile()]);
    expect(test.phases).toEqual(['resolving', 'provisioning', 'ready']);
    stop();
  });

  it('shows a redirect recovery failure and returns to signed out', async () => {
    const redirectError = { code: 'auth/unauthorized-domain' };
    const test = harness({ recoverRedirect: vi.fn().mockRejectedValue(redirectError) });
    startAuthSession({} as Auth, test.handlers, test.dependencies);
    await settle();

    expect(test.errors).toEqual([redirectError]);
    expect(test.phases).toEqual(['resolving', 'signedOut']);
    expect(test.dependencies.signOutUser).toHaveBeenCalledOnce();
    expect(test.dependencies.observeAuth).not.toHaveBeenCalled();
  });

  it('preserves an access failure while failure sign-out returns to signed out', async () => {
    const accessError = new ArchiveAccessError('access/not-approved', 'Not approved');
    const test = harness({ bootstrapUser: vi.fn().mockRejectedValue(accessError) });
    startAuthSession({} as Auth, test.handlers, test.dependencies);
    await settle();
    test.getObserver()?.(user());
    await settle();

    expect(test.errors).toEqual([accessError]);
    expect(test.phases).toEqual(['resolving', 'provisioning', 'signedOut']);
    expect(test.dependencies.signOutUser).toHaveBeenCalledOnce();
  });
});
