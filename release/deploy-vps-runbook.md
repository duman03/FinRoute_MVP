# FinRoute VPS Deploy Runbook

This runbook keeps production secrets outside git and deploys the Docker VPS stack with Nginx plus Certbot.

## 1. Prepare VPS

- Install Docker Engine and Docker Compose plugin.
- Open firewall ports `22`, `80`, and `443`.
- Add swap if the VPS has less than 2 GB RAM.
- Create a deploy directory, for example `/opt/finroute`.
- Copy or clone this repo into `/opt/finroute`.

## 2. Create Production Env

Copy `deploy/.env.production.example` to `deploy/.env.production` on the VPS and replace every placeholder.

Required values:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `FINNHUB_API_KEY`
- `LETSENCRYPT_EMAIL`
- Optional `EXPO_PUSH_ACCESS_TOKEN` if Expo push access tokens are enforced.

Keep `NGINX_CONF_PATH=./nginx/nginx.prod.bootstrap.conf` for the first boot.

## 3. Boot HTTP Stack

Run from `/opt/finroute`:

```bash
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml up -d --build postgres redis backend nginx
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml exec backend npm run migrate:prod
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml ps
```

Confirm DNS already points to the VPS before requesting certificates:

- `finrouteapp.com`
- `api.finrouteapp.com`

## 4. Issue TLS Certificate

```bash
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml run --rm certbot certonly --webroot --webroot-path /var/www/certbot --cert-name finrouteapp.com --email REPLACE_WITH_LETSENCRYPT_EMAIL --agree-tos --no-eff-email -d finrouteapp.com -d api.finrouteapp.com
```

After the certificate is issued, update `deploy/.env.production`:

```text
NGINX_CONF_PATH=./nginx/nginx.prod.ssl.conf
```

Then restart Nginx:

```bash
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml up -d nginx
```

## 5. Verify Production

```bash
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml ps
curl -fsS https://api.finrouteapp.com/api/v1/health
curl -fsS https://finrouteapp.com/privacy
curl -fsS https://finrouteapp.com/delete-account
```

Only continue to EAS builds after all production checks are green.
