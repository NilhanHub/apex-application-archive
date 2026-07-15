import {
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signOut,
  type Auth,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import type { UserProfile } from '../types';
import { bootstrapCurrentUser } from './access';

export type AuthPhase = 'resolving' | 'signedOut' | 'provisioning' | 'ready';

export interface AuthSessionHandlers {
  onPhase: (phase: AuthPhase) => void;
  onReady: (profile: UserProfile) => void;
  onError: (error: unknown) => void;
}

export interface AuthSessionDependencies {
  establishPersistence: (auth: Auth) => Promise<void>;
  recoverRedirect: (auth: Auth) => Promise<unknown>;
  observeAuth: (auth: Auth, next: (user: User | null) => void, error: (error: unknown) => void) => Unsubscribe;
  bootstrapUser: (user: User) => Promise<UserProfile>;
  signOutUser: (auth: Auth) => Promise<void>;
}

const firebaseAuthDependencies: AuthSessionDependencies = {
  establishPersistence: (auth) => setPersistence(auth, browserLocalPersistence),
  recoverRedirect: (auth) => getRedirectResult(auth),
  observeAuth: (auth, next, error) => onAuthStateChanged(auth, next, error),
  bootstrapUser: (user) => bootstrapCurrentUser(user),
  signOutUser: (auth) => signOut(auth),
};

export function startAuthSession(
  auth: Auth,
  handlers: AuthSessionHandlers,
  dependencies: AuthSessionDependencies = firebaseAuthDependencies,
): Unsubscribe {
  let disposed = false;
  let unsubscribe: Unsubscribe = () => undefined;
  let generation = 0;
  let activeUid: string | null = null;

  const signedOut = () => {
    generation += 1;
    activeUid = null;
    handlers.onPhase('signedOut');
  };

  const handleUser = async (user: User | null) => {
    if (!user) {
      signedOut();
      return;
    }
    if (activeUid === user.uid) return;
    const currentGeneration = ++generation;
    activeUid = user.uid;
    handlers.onPhase('provisioning');
    try {
      const profile = await dependencies.bootstrapUser(user);
      if (disposed || currentGeneration !== generation) return;
      handlers.onReady(profile);
      handlers.onPhase('ready');
    } catch (error) {
      if (disposed || currentGeneration !== generation) return;
      activeUid = null;
      handlers.onError(error);
      try {
        await dependencies.signOutUser(auth);
      } catch {
        // Preserve the original access error; the user is still denied by Firestore rules.
      }
      if (!disposed && currentGeneration === generation) signedOut();
    }
  };

  handlers.onPhase('resolving');
  void (async () => {
    try {
      await dependencies.establishPersistence(auth);
      await dependencies.recoverRedirect(auth);
    } catch (error) {
      if (disposed) return;
      handlers.onError(error);
      try {
        await dependencies.signOutUser(auth);
      } catch {
        // The redirect error remains the useful failure to show.
      }
      if (!disposed) signedOut();
      return;
    }
    if (disposed) return;
    unsubscribe = dependencies.observeAuth(
      auth,
      (user) => { void handleUser(user); },
      (error) => {
        if (disposed) return;
        handlers.onError(error);
        signedOut();
      },
    );
  })();

  return () => {
    disposed = true;
    generation += 1;
    unsubscribe();
  };
}
