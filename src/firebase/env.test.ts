import { describe, expect, it } from 'vitest';
import { resolveFirebaseAuthDomain } from './env';

describe('Firebase authentication domain', () => {
  it('uses the live web.app hostname for a same-domain redirect', () => {
    expect(resolveFirebaseAuthDomain(
      'fb-apexhrm-recruit-intel',
      'fb-apexhrm-recruit-intel.firebaseapp.com',
      'fb-apexhrm-recruit-intel.web.app',
    )).toBe('fb-apexhrm-recruit-intel.web.app');
  });

  it('uses the matching firebaseapp.com hostname and preserves local configuration', () => {
    expect(resolveFirebaseAuthDomain(
      'fb-apexhrm-recruit-intel',
      'fb-apexhrm-recruit-intel.firebaseapp.com',
      'fb-apexhrm-recruit-intel.firebaseapp.com',
    )).toBe('fb-apexhrm-recruit-intel.firebaseapp.com');
    expect(resolveFirebaseAuthDomain(
      'fb-apexhrm-recruit-intel',
      'fb-apexhrm-recruit-intel.firebaseapp.com',
      '127.0.0.1',
    )).toBe('fb-apexhrm-recruit-intel.firebaseapp.com');
  });

  it('never trusts an unrelated runtime hostname', () => {
    expect(resolveFirebaseAuthDomain('project', 'project.firebaseapp.com', 'example.com'))
      .toBe('project.firebaseapp.com');
  });
});
