import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

let testEnvironment: RulesTestEnvironment;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: 'apex-application-archive-test',
    firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(resolve('storage.rules'), 'utf8') },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.clearStorage();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), 'cvs/2989/14/cv.pdf'), new Uint8Array([37, 80, 68, 70]));
  });
});

afterAll(async () => testEnvironment.cleanup());

describe('CV storage rules', () => {
  it('allows verified allowlisted users and blocks anonymous reads', async () => {
    const approved = testEnvironment.authenticatedContext('recruiter', {
      email: 'authorized-user-4@example.test',
      email_verified: true,
    });

    await assertSucceeds(getBytes(ref(approved.storage(), 'cvs/2989/14/cv.pdf')));
    await assertFails(getBytes(ref(testEnvironment.unauthenticatedContext().storage(), 'cvs/2989/14/cv.pdf')));
  });

  it('blocks unapproved and unverified accounts', async () => {
    const unapproved = testEnvironment.authenticatedContext('unapproved', {
      email: 'someone@example.com',
      email_verified: true,
    });
    const unverified = testEnvironment.authenticatedContext('unverified', {
      email: 'authorized-user-2@example.test',
      email_verified: false,
    });

    await assertFails(getBytes(ref(unapproved.storage(), 'cvs/2989/14/cv.pdf')));
    await assertFails(getBytes(ref(unverified.storage(), 'cvs/2989/14/cv.pdf')));
  });

  it('blocks client writes even for approved users', async () => {
    const storage = testEnvironment.authenticatedContext('owner', {
      email: 'authorized-user-2@example.test',
      email_verified: true,
    }).storage();
    await assertFails(uploadBytes(ref(storage, 'cvs/2989/14/replacement.pdf'), new Uint8Array([1, 2, 3])));
  });
});
