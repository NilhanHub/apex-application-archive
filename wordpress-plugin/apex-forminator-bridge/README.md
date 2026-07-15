# Apex Forminator Bridge

Private WordPress REST bridge for Apex Talent Archive.

## Endpoints

- `GET /wp-json/apex-forminator/v1/forms`
- `GET /wp-json/apex-forminator/v1/forms/2989/entries?page=1&per_page=200`
- `GET /wp-json/apex-forminator/v1/forms/2989/entries/{entryId}`

All routes require WordPress Application Password Basic authentication and the `apex_export_forminator` capability. The plugin creates an **Apex Archive Reader** role containing only `read` and that export capability. Form IDs other than `2989` return `404`.

Version 2 recursively discovers nested Forminator upload metadata and returns canonical `files` while retaining `cv_urls` for older clients.

## Deployment

1. Zip the `apex-forminator-bridge` directory.
2. In WordPress, replace the existing Apex Forminator Bridge plugin and activate it.
3. Change the `kiro-api` user role from Administrator to **Apex Archive Reader**.
4. Keep its Application Password in Firebase Secret Manager, never in this plugin or repository.

## Local Test

```powershell
php tests/normalization-test.php
```
