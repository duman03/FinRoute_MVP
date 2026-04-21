# FinRoute Platform Preflight — 2026-04-21

## Release Freeze

- Backend build: PASS
- Backend test/typecheck: PASS
- Backend release verifier: PASS
- Mobile typecheck: PASS
- Git baseline: BLOCKED for tag creation because the repository has no commits yet.

## Local Docker Gates

- Docker services: `postgres`, `redis`, `backend` running locally.
- Local health: PASS — `http://localhost:3001/api/v1/health` returned PostgreSQL and Redis `up`.
- Migrations: PASS — all migrations through `023_account_deletion_release_policy.sql` applied or skipped idempotently.
- Week 8 smoke: PASS.
- Full API smoke: PASS.
  - Register: PASS
  - Portfolio create: PASS
  - BUY trade queued and completed: PASS
  - SELL trade queued and completed: PASS
  - Gamification streak read: PASS
  - Global leaderboard read: PASS
  - Account profile read: PASS
  - Account deletion: PASS
  - Login after deletion rejected: PASS
- Soft-delete DB verification: PASS.
  - `is_active = false`
  - anonymized deleted email
  - `device_token` empty
  - `notifications_enabled = false`
  - `scheduled_for_deletion_at` set to 30 days later
- Permanent-delete function: PASS when run as a separate statement after marking the disposable smoke user expired.

## Production Gates

- `https://api.finrouteapp.com/api/v1/health`: BLOCKED — DNS name did not resolve from this machine.
- `https://finrouteapp.com/privacy`: BLOCKED — DNS name did not resolve from this machine.
- `https://finrouteapp.com/delete-account`: BLOCKED — DNS name did not resolve from this machine.

Required next production action:

1. Point `finrouteapp.com` and `api.finrouteapp.com` DNS records to the Docker VPS.
2. Install TLS certificates.
3. Deploy the compose stack on the VPS.
4. Re-run production health and web page checks.

## EAS / Store Gates

- EAS CLI availability: PASS — `eas-cli/18.7.0` can run through `npx.cmd eas-cli`.
- EAS login: BLOCKED — `npx.cmd eas-cli whoami` returned `Not logged in`.
- `EAS_PROJECT_ID`: BLOCKED — not present in process environment; `expo config --json` showed `extra` as `{}`.
- Native push config files:
  - `mobile/google-services.json`: missing
  - `mobile/GoogleService-Info.plist`: missing
- iOS/Android production cloud builds: NOT RUN because EAS login and project ID are missing.
- EAS Submit: NOT RUN because production builds are not available.

Required next EAS action:

1. Run `npx.cmd eas-cli login`.
2. Link or create the Expo project with `npx.cmd eas-cli init`.
3. Set `EAS_PROJECT_ID` in the production build environment.
4. Add Android/iOS push config files if required by the configured notification path.
5. Run production Android and iOS EAS builds.
6. Submit TestFlight and Google Play closed testing builds with EAS Submit.

## Go / No-Go

Current status: NO-GO for platform submission.

Reason:

- Local app/backend/release gates are green.
- Production DNS/TLS/VPS endpoints are not live.
- EAS account/project configuration is not ready on this machine.
- Store-delivered real-device tests have not been run.
