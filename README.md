# Apex Application Archive

Private recruiter workspace for every job application submitted through ApexHRM Forminator form `2989`. Each submission remains a separate historical application, its CV is copied into private Firebase Storage, and source data is reconciled every four hours without overwriting recruiter-owned fields.

## Implemented

- Authenticated WordPress bridge with a least-privilege export role and recursive Forminator CV normalization.
- Firebase 2nd-generation scheduled full sync, owner-only dry run/manual sync, lease protection, source hashing, retained-source-deletion state, and Cloud Tasks CV imports.
- HTTPS/hostname/path allowlisting, 25 MiB limit, extension plus file-signature validation, private Storage writes, and bounded CV retries.
- Google sign-in provisioning for exactly two configured verified emails.
- Firestore and Storage rules that deny by default and permit recruiters to edit only `recruiter` state.
- Search-first recruiter UI using Firestore data and MiniSearch over names, email, job references, submitted text, safe raw fields, tags, and CV filenames.
- Stage, CV, assignee, tag, date, favourite, and source-presence filters; CSV export; CV preview/download; sync monitoring; stale-data warnings.
- Development-only fictional preview at `http://localhost:5173/?demo=1`. Production builds cannot enable this route.

AI search, CV text extraction, semantic ranking, contact-form entries, and automated hiring recommendations are deliberately outside V1.

## Local Development

```powershell
cd D:\Kiro_master\apex-application-archive
npm install
npm --prefix functions install
Copy-Item .env.example .env.local
npm run dev -- --host 127.0.0.1
```

Put only Firebase web-app configuration in `.env.local`. Never place WordPress passwords, service-account JSON, tokens, or backend secrets in Vite variables.

## Verification

```powershell
npm run verify
```

This runs the WordPress normalization test, frontend and function tests, real Firestore/Storage emulator rule tests, both type checks, and both production builds.

Rendered UI proof is kept in `evidence/ui/applications-laptop.png` and `evidence/ui/applications-mobile.png`.

## Data Model

- `applications/{formId}_{entryId}`: source fields, sanitized raw fields, CV state, and recruiter state.
- `syncRuns/{runId}`: reconciliation and CV outcome counts.
- `syncState/apexhrm`: freshness, current status, and latest totals.
- `syncLocks/apexhrm`: backend-only overlap lease.
- `users/{uid}`: approved Google email, display name, role, and active state.
- Storage: `cvs/2989/{entryId}/{sanitizedFileName}`.

`_forminator_user_ip` is deliberately omitted. A source deletion marks `sourcePresent=false`; it never deletes the archived application or downloaded CV.

## Firebase Project

The dedicated project already exists:

```text
Project ID: fb-apexhrm-recruit-intel
Display name: ApexHRM Recruit Intelligence
Region: asia-south1
```

At the latest check, the project had no web app and billing was disabled. Linking its sole available billing account failed because the account had reached its project-link quota. Free a billing slot or request a quota increase before deploying scheduled functions or Cloud Tasks.

## Production Setup

1. Enable Blaze billing for `fb-apexhrm-recruit-intel`.
2. Create the default Firestore database and Storage bucket in `asia-south1`.
3. Enable Google as a Firebase Authentication provider; authorize domains `localhost` and `127.0.0.1` for local testing.
4. Create a Firebase Web app, then copy its public web configuration into `.env.local` and the production build environment.
5. Create `functions/.env.fb-apexhrm-recruit-intel` from `functions/.env.example`, using Nilhan's exact approved Google email for `APEX_OWNER_EMAIL` and Prashanthi's exact approved Google email for `APEX_RECRUITER_EMAIL`.
6. Set WordPress secrets interactively:

```powershell
firebase use fb-apexhrm-recruit-intel
firebase functions:secrets:set WORDPRESS_USERNAME
firebase functions:secrets:set WORDPRESS_APPLICATION_PASSWORD
```

7. Deploy the upgraded WordPress plugin from `wordpress-plugin/apex-forminator-bridge`, activate it, and assign `kiro-api` the **Apex Archive Reader** role.
8. Deploy access, rules, Storage, the manual sync, and CV worker without the scheduler:

```powershell
firebase deploy --only firestore:rules,storage,functions:provisionUserProfile,functions:syncNow,functions:importCvTask
```

9. Sign in as the owner, run **Check source**, then **Sync now**. Accept the backfill only when the live WordPress total equals active Firestore applications and every CV reference is ready, queued, or explicitly failed.
10. Deploy Hosting and only then activate the four-hour scheduler:

```powershell
npm run build
firebase deploy --only hosting,functions:scheduledApexSync
```

The schedule is `0 */4 * * *` in `Asia/Colombo`. Monitor the first three runs and investigate any stale-data warning older than eight hours.

## Current Live Source Evidence

A read-only authenticated check on 15 July 2026 returned 164 form `2989` applications and 163 nested CV uploads. The currently installed v1 bridge exposed zero legacy `cv_urls`; deploy v2 before the Firebase backfill. These numbers are evidence only and are never hardcoded into reconciliation.

## Known Operational Limits

- The first production deployment is blocked until Firebase billing quota is resolved and the two exact approved Google emails are supplied.
- The Functions production dependency audit currently reports eight moderate transitive findings in Firebase/Google packages and no high or critical findings. The automated all-fixes path proposes breaking version changes, so upgrades should be tested deliberately rather than forced during rollout.
- PDF, image, and TXT CVs can preview in-app. DOC/DOCX files download rather than render inline.
- The client-side search index is appropriate for this archive size. Reassess an external search service only if the archive grows beyond roughly 5,000 applications or browser indexing becomes measurably slow.
