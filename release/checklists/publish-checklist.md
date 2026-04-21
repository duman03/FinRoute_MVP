# Publish Checklist

## 1. Production infrastructure

- [ ] PostgreSQL is running in the production environment.
- [ ] Redis is running in the production environment.
- [ ] Backend environment variables are populated from `backend/.env.example`.
- [ ] `EXPO_PUSH_ACCESS_TOKEN` is set if Expo push access tokens are enforced.
- [ ] Production API is reachable at `https://api.finrouteapp.com/api/v1`.
- [ ] Production WebSocket is reachable at `wss://api.finrouteapp.com`.
- [ ] Privacy page is live at `https://finrouteapp.com/privacy`.
- [ ] Account deletion page is live at `https://finrouteapp.com/delete-account`.

## 2. Database and backend

- [ ] Run `backend npm run migrate`.
- [ ] Run `backend npm run build`.
- [ ] Run `backend npm test`.
- [ ] Run `backend npm run verify:release`.
- [ ] Verify `/api/v1/health` returns healthy PostgreSQL and Redis status.

## 3. Mobile build inputs

- [ ] Copy `mobile/.env.production.example` into the production environment values.
- [ ] Add `mobile/google-services.json` if Android push notifications are enabled.
- [ ] Add `mobile/GoogleService-Info.plist` if iOS push notifications are enabled.
- [ ] Confirm the EAS project is linked so Expo push tokens include a real project ID.
- [ ] Confirm icons and splash assets render correctly.

## 4. End-to-end smoke test

- [ ] Register a new user.
- [ ] Login with the new user.
- [ ] Create the first portfolio.
- [ ] Execute a BUY trade.
- [ ] Execute a SELL trade.
- [ ] Verify transactions move from `PENDING` to `COMPLETED`.
- [ ] Open gamification, leaderboard and settings screens.
- [ ] Trigger account deletion from the app.
- [ ] Confirm deleted account can no longer authenticate.
- [ ] Confirm deleted account is soft-deleted and scheduled for permanent deletion after 30 days.
- [ ] Confirm Expo push token registration reaches `/notification-settings/device-token`.

## 5. Store preparation

- [ ] Fill App Store metadata from `release/store/app-store-metadata.md`.
- [ ] Fill Google Play metadata from `release/store/play-store-metadata.md`.
- [ ] Prepare review notes from `release/store/review-notes.md`.
- [ ] Capture screenshots listed in `release/store/screenshots-plan.md`.
- [ ] Fill store credentials checklist in `release/store/secrets-and-accounts.md`.

## 6. Final release gate

- [ ] Build an iOS production artifact.
- [ ] Build an Android production artifact.
- [ ] Install both builds on real devices.
- [ ] Verify push notification permission flow on real devices.
- [ ] Verify Expo push delivery, ticket logging and receipt handling on real devices.
- [ ] Verify account deletion and privacy links from inside the app.
- [ ] Submit to App Store Connect.
- [ ] Submit to Google Play Console.
