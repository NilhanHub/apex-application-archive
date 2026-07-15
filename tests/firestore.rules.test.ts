import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

let testEnvironment: RulesTestEnvironment;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: 'apex-application-archive-test',
    firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/owner'), { approved: true, active: true, role: 'owner' });
    await setDoc(doc(db, 'users/recruiter'), { approved: true, active: true, role: 'recruiter' });
    await setDoc(doc(db, 'applications/2989_14'), {
      fullName: 'Jane Applicant',
      updatedAt: new Date(),
      recruiter: { stage: 'New', tags: [], assignedTo: null, favorite: false, lastReviewedAt: null },
    });
  });
});

afterAll(async () => testEnvironment.cleanup());

describe('application rules', () => {
  it('denies anonymous and unapproved reads', async () => {
    await assertFails(getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'applications/2989_14')));
    await assertFails(getDoc(doc(testEnvironment.authenticatedContext('unknown').firestore(), 'applications/2989_14')));
  });

  it('allows approved recruiters to read applications', async () => {
    await assertSucceeds(getDoc(doc(testEnvironment.authenticatedContext('recruiter').firestore(), 'applications/2989_14')));
  });

  it('allows recruiter-state updates but blocks source-field changes', async () => {
    const db = testEnvironment.authenticatedContext('recruiter').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'applications/2989_14'), {
        recruiter: { stage: 'Review', tags: ['priority'], assignedTo: 'Prashanthi', favorite: true, lastReviewedAt: new Date() },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(doc(db, 'applications/2989_14'), { fullName: 'Changed by client' }));
  });
});
