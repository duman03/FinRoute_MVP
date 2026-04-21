# Store Review Notes

## Product summary

FinRoute is a simulated portfolio and market-tracking application. It does not process real money transactions, real brokerage orders or investment advice.

## Core user flow

1. Register or sign in.
2. Create the first portfolio.
3. Execute simulated BUY and SELL transactions.
4. Open gamification and leaderboard screens.
5. Open Settings and use account deletion if needed.

## Test account

- Review email: `reviewer@finrouteapp.com`
- Review password: `FinRouteReview2026!`
- 2FA or OTP: Not enabled

Seed and verify this account in production before submitting the build.

## Backend

- Production API base URL: `https://api.finrouteapp.com/api/v1`
- Production WebSocket URL: `wss://api.finrouteapp.com`

## Account deletion

- In-app path: `Settings > Hesabimi Sil`
- Public web path: `https://finrouteapp.com/delete-account`
- Deletion behavior: account access is disabled immediately, personal profile data is anonymized, notification tokens are removed and permanent deletion is scheduled after 30 days.

## Privacy

- Privacy policy URL: `https://finrouteapp.com/privacy`

## Notes for reviewers

- The app uses simulated funds only.
- Notification permission is used for streak reminders and league alerts.
- Push notifications use Expo Push Service; if the reviewer denies notification permission, the app should still function normally.
