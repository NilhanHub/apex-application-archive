# Apex Talent Archive

Private recruiter-facing CV database for Apex HRM. The app is built as a React + Vite + TypeScript frontend prepared for Firebase Hosting, Auth, Firestore, Storage, and Cloud Functions.

## What Is Implemented

- Premium candidate search workspace with filters, saved searches, result reasons, and CSV export.
- Candidate profile panel with Overview, CV, AI summary, Notes, and Raw data tabs.
- Pipeline board with drag-and-drop stage updates.
- AI search panel with recruitment compliance guardrails.
- Import/sync status page reflecting the current archive shape: 158 submissions, 141 job entries, 17 contact entries, 140 CV references.
- Firebase-ready data model, rules, hosting config, storage rules, and function placeholders.

Mock candidates are fictional. Do not paste real Gemini/API secrets into frontend code.

## Local Setup

```powershell
cd D:\Kiro_master\apex-talent-archive
npm install
Copy-Item .env.example .env.local
npm run dev
```

Fill `.env.local` with Firebase web app config only. Firebase web config is not a Gemini secret. Gemini or other AI provider secrets belong in Firebase Secret Manager or Firebase AI Logic server-side paths.

## Build

```powershell
npm run build
```

## Tests

```powershell
npm run test
```

## Firebase Setup

1. Create a Firebase project.
2. Enable Firebase Auth and add approved users for Nilhan and Prashanthi.
3. Enable Firestore.
4. Enable Firebase Storage.
5. Enable Cloud Functions.
6. Add Firebase web app config to `.env.local`.
7. Deploy rules and hosting:

```powershell
firebase deploy --only firestore:rules,storage,hosting
```

## Cloud Functions

The function skeletons are in `functions/src/index.ts`:

- `importCvForCandidate(candidateId)`
- `importAllMissingCvs()`
- `extractCvText(candidateId)`
- `generateCvSummary(candidateId)`
- `aiCandidateSearch(query)`

Set secrets without committing them:

```powershell
firebase functions:secrets:set GEMINI_API_KEY
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

Current note: `npm audit --omit=dev` inside `functions` reports moderate transitive advisories through Firebase/Google Cloud packages. The non-forced fix does not resolve them, and the forced/direct major update creates a Firebase peer-version mismatch. Keep the supported Firebase package pair unless a compatible upstream release is available.

## Firestore Collections

- `candidates/{candidateId}`
- `candidates/{candidateId}/notes/{noteId}`
- `importRuns/{runId}`
- `aiSummaries/{candidateId}`
- `searchDocuments/{candidateId}`
- `users/{uid}`

## Storage Paths

```text
cvs/{candidateId}/{originalFileName}
```

## AI Compliance

AI can assist summarization and source-grounded search. It must not filter, rank, or recommend candidates using protected characteristics such as gender, age, ethnicity, religion, marital or family status, disability, or health. It must also refuse sensitive residential or socioeconomic proxy filters, including flood-risk address targeting.

## Known Next Steps

- Replace mock data with Firestore reads.
- Connect the existing Forminator archive importer to Firebase write paths.
- Implement real CV download, validation, parsing, OCR, and Storage uploads inside Cloud Functions.
- Add App Check once the Firebase project exists.
- Replace the mock AI search with Gemini behind secure Firebase server logic.
