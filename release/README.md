# FinRoute Release Package

This folder contains the release preparation package for FinRoute.

## Included

- `checklists/publish-checklist.md`
- `store/app-store-metadata.md`
- `store/play-store-metadata.md`
- `store/review-notes.md`
- `store/screenshots-plan.md`
- `store/secrets-and-accounts.md`

## Purpose

These files centralize the release steps that live outside the codebase:

- store listing copy
- review notes
- screenshot plan
- publishing credentials checklist
- final go-live verification

## Repo-side validation

The repository also includes automated release checks:

- `backend npm run verify:release`
- GitHub Actions workflow: `.github/workflows/release-readiness.yml`

## Important

The codebase is prepared for release, but external publishing still requires:

- live production API and WebSocket endpoints
- App Store Connect and Google Play Console credentials
- push notification production config files
- Expo project ID and Expo Push Service delivery verification
- real device smoke testing
