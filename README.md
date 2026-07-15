# Apex Application Archive

> [!TIP]
> See [ENGINEERING_OVERVIEW.md](ENGINEERING_OVERVIEW.md) for the ingestion architecture, security boundaries, recruiter workflow, and current verification evidence.

Private recruiter workspace for every job application submitted through ApexHRM Forminator form `2989`. Each submission remains a separate historical application, its CV is copied into private Firebase Storage, and source data is reconciled every four hours without overwriting recruiter-owned fields.

## Implemented

- Authenticated WordPress bridge with a least-privilege export role and recursive Forminator CV normalization.
- Firebase 2nd-generation scheduled full sync, owner-only dry run/manual sync, lease protection, source hashing, retained-source-deletion state, and Cloud Tasks CV imports.
- HTTPS/hostname/path allowlisting, 25 MiB limit, extension plus file-signature validation, private Storage writes, and bounded CV retries.
- Google sign-in provisioning for the configured owner and recruiter allowlists.
- Rules-enforced self-provisioning fallback for the three verified approved emails, so access does not depend on a deployed callable function.
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

Current rollout status, checked on 15 July 2026:

- Firebase Web app exists: **Apex Application Archive**.
- Firestore Standard default database exists in `asia-south1`.
- Firestore rules are deployed.
- Firebase Hosting is deployed at `https://fb-apexhrm-recruit-intel.web.app`.
- Firebase Authentication is initialized, Google sign-in is enabled, and the two Hosting domains plus `localhost` and `127.0.0.1` are authorized.
- The live sign-in control reaches Google Accounts through a full-page redirect without application console errors.
- The deployed Firestore rules allow each verified approved email to create only its assigned owner/recruiter profile; outsiders and role escalation are denied.
- Local `.env.local` contains only public Firebase web-app configuration.
- Functions env allowlist is configured locally with Nilhan's two approved owner emails and Prashanthi's recruiter email.

Billing is still disabled. A request to raise `My Billing Account` from five to six linked projects was submitted successfully on 15 July 2026; the browser confirmation is saved at `evidence/ui/quota-request-submitted-2026-07-15.png`. Until Google approves that request and the project is linked, Cloud Functions, Cloud Build, Cloud Scheduler, Cloud Tasks, Secret Manager, Firebase Storage bucket creation, Storage rules deployment, WordPress secrets, CV import, backfill, and the four-hour scheduler remain blocked.

## Production Setup

1. After the linked-project quota request is approved, link `fb-apexhrm-recruit-intel` to billing account `01A78A-843481-5612A3`; this enables Blaze without unlinking any existing project. Create the project-scoped US$10 budget with 50%, 90%, and 100% alerts. Budget alerts warn but do not cap spend.
2. Create the default Firestore database and Storage bucket in `asia-south1`.
3. Enable Google as a Firebase Authentication provider; authorize domains `localhost` and `127.0.0.1` for local testing.
4. Create a Firebase Web app, then copy its public web configuration into `.env.local` and the production build environment.
5. Create `functions/.env.fb-apexhrm-recruit-intel` from `functions/.env.example`, using comma-separated approved owner emails for `APEX_OWNER_EMAIL` and comma-separated recruiter emails for `APEX_RECRUITER_EMAIL`.
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

The schedule is `0 */4 * * *` in `Asia/Colombo`. The app warns after five hours and escalates after eight hours. Monitor the first three scheduled runs before accepting production completion.

## Current Live Source Evidence

A read-only authenticated check on 15 July 2026 returned 164 form `2989` applications and 163 nested CV uploads. The currently installed v1 bridge exposed zero legacy `cv_urls`; deploy v2 before the Firebase backfill. These numbers are evidence only and are never hardcoded into reconciliation.

## Known Operational Limits

- The first backend production deployment is blocked until the linked-project quota increase is approved and Firebase billing is enabled. The approved email allowlist is already configured locally as `nilhan.dev@gmail.com,nilhan@gmail.com` for owner access and `prashanthiratnayake23@gmail.com` for recruiter access.
- The live WordPress bridge is still plugin version `1.0.0`. It returns 164 form `2989` applications but no canonical `files[]`; v2 must be deployed through WordPress or Hostinger production file access before any backfill is accepted.
- The frontend production dependency audit reports zero findings. The Functions production dependency audit currently reports nine moderate transitive findings in Firebase/Google packages and no high or critical findings. `firebase-functions` is declared at the current compatible `7.2.5`; its peer range still excludes `firebase-admin` 14, so the unsupported automated major downgrade/upgrade path is deliberately not forced.
- PDF, image, and TXT CVs can preview in-app. DOC/DOCX files download rather than render inline.
- The client-side search index is appropriate for this archive size. Reassess an external search service only if the archive grows beyond roughly 5,000 applications or browser indexing becomes measurably slow.
