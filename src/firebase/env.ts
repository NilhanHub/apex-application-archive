export function resolveFirebaseAuthDomain(
  projectId: string | undefined,
  configuredAuthDomain: string | undefined,
  hostname: string | undefined,
): string | undefined {
  if (!projectId || !hostname) return configuredAuthDomain;
  const hostingDomains = new Set([`${projectId}.web.app`, `${projectId}.firebaseapp.com`]);
  return hostingDomains.has(hostname) ? hostname : configuredAuthDomain;
}

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const hostname = typeof window === 'undefined' ? undefined : window.location.hostname;

export const firebaseClientConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: resolveFirebaseAuthDomain(projectId, import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, hostname),
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseClientConfig.projectId && firebaseClientConfig.apiKey);
export const useFirebaseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
