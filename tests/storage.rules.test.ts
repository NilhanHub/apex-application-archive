import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
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
    await setDoc(doc(context.firestore(), 'users/recruiter'), { approved: true, active: true, role: 'recruiter' });
    await uploadBytes(ref(context.storage(), 'cvs/2989/14/cv.pdf'), new Uint8Array([37, 80, 68, 70]));
  });
});

afterAll(async () => testEnvironment.cleanup());

describe('CV storage rules', () => {
  it('allows approved reads and blocks anonymous reads', async () => {
    await assertSucceeds(getBytes(ref(testEnvironment.authenticatedContext('recruiter').storage(), 'cvs/2989/14/cv.pdf')));
    await assertFails(getBytes(ref(testEnvironment.unauthenticatedContext().storage(), 'cvs/2989/14/cv.pdf')));
  });

  it('blocks client writes even for approved users', async () => {
    const storage = testEnvironment.authenticatedContext('recruiter').storage();
    await assertFails(uploadBytes(ref(storage, 'cvs/2989/14/replacement.pdf'), new Uint8Array([1, 2, 3])));
  });
});
