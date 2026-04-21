# FinRoute Live Platform Gate - 2026-04-21

## Release State

- Branch: `codex/platform-preflight-2026-04-21`
- Release candidate tag: `v1.0.0-rc.1`
- Tagged commit: `e039a66 chore: add production deploy config`
- Working tree before live gate checks: clean

## Local Gates

- Backend build: PASS
- Backend test/typecheck: PASS
- Backend release verifier: PASS
- Mobile typecheck: PASS
- Backend runtime audit with `npm audit --omit=dev`: PASS, 0 vulnerabilities
- Production compose config validation: PASS

## Credential Intake

The following required live-deploy inputs are not present in this shell session:

- `FINROUTE_VPS_HOST`
- `FINROUTE_VPS_USER`
- `FINROUTE_VPS_KEY`
- `FINROUTE_VPS_PORT`
- `EXPO_TOKEN`
- `EAS_PROJECT_ID`
- `deploy/.env.production`

No production secrets were written to the repository.

## DNS And Endpoint Gate

- `finrouteapp.com`: BLOCKED, DNS returned NXDOMAIN
- `api.finrouteapp.com`: BLOCKED, DNS returned NXDOMAIN
- `https://api.finrouteapp.com/api/v1/health`: BLOCKED, host could not be resolved
- `https://finrouteapp.com/privacy`: BLOCKED, host could not be resolved
- `https://finrouteapp.com/delete-account`: BLOCKED, host could not be resolved

## EAS Gate

- EAS CLI session: BLOCKED, `npx.cmd eas-cli whoami` returned `Not logged in`
- Cloud builds: NOT RUN
- EAS Submit: NOT RUN

## Go / No-Go

Current status: NO-GO for live platform access and store submission.

Next executable action is credential intake:

1. Provide VPS SSH access through `FINROUTE_VPS_HOST`, `FINROUTE_VPS_USER`, and either `FINROUTE_VPS_KEY` or the local SSH agent.
2. Point `finrouteapp.com` and `api.finrouteapp.com` A records to the VPS IP.
3. Create `deploy/.env.production` only on the VPS from `deploy/.env.production.example`.
4. Provide `EXPO_TOKEN` and `EAS_PROJECT_ID` for EAS build/submit.
