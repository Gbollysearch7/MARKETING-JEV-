# Deploying Rankcall in the UK

Rankcall is one Node.js process (Next.js standalone server) with a SQLite database on local disk. Production runs
it in Docker on **one machine with a persistent volume in London**, and streams every database change to an
S3-compatible bucket with **Litestream**, so a lost machine or volume can be rebuilt from the bucket.

Why one machine: SQLite allows a single writer, and background jobs plus the weekly scheduler run inside the web
process. Scale up (bigger machine) rather than out. A later move to Postgres stays possible (all SQL sits behind
`src/lib/db.ts` and the module `ensureSchema()` functions), but it is a larger async refactor and not needed to launch.

## What is in the repo

| File | Purpose |
| --- | --- |
| `Dockerfile` | Multi-stage build on `node:22-bookworm-slim`: compiles better-sqlite3, runs `next build` (`output: 'standalone'`), adds a pinned, checksum-verified Litestream 0.5.16. App runs as the `node` user. `DATA_DIR=/data`, `PORT=3000`, Docker `HEALTHCHECK` on `/api/health`. |
| `scripts/start.sh` | Entrypoint. Makes `/data` writable, drops root, restores `app.db` from the bucket if it is missing, then runs `litestream replicate -exec "node server.js"`. Without `LITESTREAM_BUCKET` it runs the app with no backups and says so in the log. |
| `litestream.yml` | Replicates `/data/app.db` to `s3://$LITESTREAM_BUCKET/$LITESTREAM_PATH` every second; daily snapshot, 30-day retention. |
| `fly.toml` | Fly.io, region `lhr`, one machine, volume `rankcall_data` at `/data`, never auto-stopped, health check on `/api/health`. |
| `.env.example` | Every environment variable, with what it does. |
| `src/app/api/health/route.ts` | `GET /api/health` returns `{ ok, db, version }` (200, or 503 when SQLite does not answer). |

**Before the first deploy**, `/api/health` must be public: add `'/api/health'` to `PUBLIC` in `src/proxy.ts`
(today the proxy answers 401 to any `/api/*` call without a session cookie, which would fail every health check).

## Backups bucket (do this first, for either option)

Pick one:

- **Cloudflare R2** (no egress fees): create a bucket with **jurisdiction: EU**, then an API token with
  *Object Read & Write* on that bucket only. `LITESTREAM_REGION=auto`,
  `LITESTREAM_ENDPOINT=https://<account id>.r2.cloudflarestorage.com` (use the `eu.` endpoint shown for EU buckets).
- **AWS S3 London**: bucket in `eu-west-2`, block all public access, versioning on; an IAM user with
  `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on that bucket only.
  `LITESTREAM_REGION=eu-west-2`, `LITESTREAM_ENDPOINT` empty.

Set `LITESTREAM_BUCKET`, `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY` (and the region/endpoint) as
secrets on the host.

## Option A: Fly.io, London (`lhr`)

1. Install flyctl and sign in: `brew install flyctl && fly auth login`. Add a card (volumes are not free).
2. From the repo root: `fly launch --no-deploy --copy-config --name <your-app-name> --region lhr`
   (keep the existing `fly.toml`; update `app =` if the name differs).
3. Create the volume in London: `fly volumes create rankcall_data --region lhr --size 3`.
4. Set secrets (values from your password manager; never commit them):
   ```sh
   fly secrets set APP_URL=https://app.yourdomain.co.uk APP_SECRET="$(openssl rand -base64 48)" \
     TYPESAFE_API_KEY=... \
     STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... STRIPE_PRICE_STARTER=... STRIPE_PRICE_GROWTH=... STRIPE_PRICE_SCALE=... \
     GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
     LITESTREAM_BUCKET=... LITESTREAM_ENDPOINT=... LITESTREAM_ACCESS_KEY_ID=... LITESTREAM_SECRET_ACCESS_KEY=...
   ```
   Store the generated `APP_SECRET` somewhere safe: losing it makes stored Google tokens unreadable.
5. Deploy one machine: `fly deploy --ha=false`. Check: `fly status` (one machine, `lhr`), `fly logs` (look for
   `start: replicating /data/app.db`), and `curl https://<app>.fly.dev/api/health`.
6. Make sure it stays at one: `fly scale count 1`. Never run two machines against SQLite.
7. Custom domain and HTTPS: `fly certs add app.yourdomain.co.uk`, then at your DNS provider add the `A`/`AAAA`
   records (or `CNAME` to `<app>.fly.dev`) that the command prints. Fly issues and renews the Let's Encrypt
   certificate. Check with `fly certs show app.yourdomain.co.uk`. Update `APP_URL` if it changed.
8. Deploys after that: `fly deploy`. The machine restarts in place (a few seconds of downtime); Litestream flushes
   on SIGTERM.

## Option B: UK VPS (Hetzner, OVHcloud UK, etc.) with Docker and Caddy

Use a London/UK region where offered (OVHcloud has London; Hetzner's nearest are Falkenstein/Nuremberg/Helsinki
in the EU, which is still fine for UK GDPR adequacy, but choose a UK provider if you promise UK hosting).
A 2 vCPU / 4 GB machine is plenty to start.

1. Create the server (Ubuntu 24.04 LTS), add your SSH key, then on it:
   ```sh
   apt update && apt -y upgrade && apt -y install docker.io docker-compose-v2 ufw unattended-upgrades
   ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable
   ```
2. Copy the repo (or `git clone`) to `/opt/rankcall`, create `/opt/rankcall/.env.production` from `.env.example`
   (`chmod 600`), with `APP_URL`, `APP_SECRET`, Stripe, Google, Litestream values filled in.
3. `/opt/rankcall/compose.yml`:
   ```yaml
   services:
     app:
       build: .
       restart: unless-stopped
       env_file: .env.production
       volumes: [ "rankcall-data:/data" ]
       expose: [ "3000" ]
     caddy:
       image: caddy:2
       restart: unless-stopped
       ports: [ "80:80", "443:443" ]
       volumes: [ "./Caddyfile:/etc/caddy/Caddyfile:ro", "caddy-data:/data", "caddy-config:/config" ]
   volumes: { rankcall-data: {}, caddy-data: {}, caddy-config: {} }
   ```
4. `/opt/rankcall/Caddyfile` (Caddy gets and renews the HTTPS certificate automatically):
   ```
   app.yourdomain.co.uk {
     encode zstd gzip
     reverse_proxy app:3000
   }
   ```
5. Point DNS first: an `A` (and `AAAA`) record for `app.yourdomain.co.uk` to the server's IP. Then
   `docker compose up -d --build`. Check `docker compose logs -f app` and `curl https://app.yourdomain.co.uk/api/health`.
6. Updates: `git pull && docker compose up -d --build app`. Turn on the provider's disk snapshots as a second
   safety net next to Litestream.

## Restore and disaster recovery

- **New machine / lost volume:** deploy as normal onto an empty volume; `start.sh` sees no `app.db` and runs
  `litestream restore -if-replica-exists` before starting.
- **Roll back to a point in time:** stop the app, then on the host:
  `litestream restore -config /etc/litestream.yml -timestamp 2026-11-01T09:00:00Z -o /data/restored.db /data/app.db`,
  check it, move it to `/data/app.db` (delete the old `app.db-wal`/`-shm`), start again.
- **Test the backup monthly:** restore to a scratch path and open it (`sqlite3 restored.db 'select count(*) from accounts'`).

## Stripe webhook

Endpoint: `https://<APP_URL>/api/billing/webhook`. Events: `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_failed`. The handler checks the `Stripe-Signature` header (HMAC-SHA256, 5 minute tolerance),
records every event id (replays are skipped), sets the plan from the subscription's price id
(`STRIPE_PRICE_*`), and ignores prices it does not sell and events older than one already applied.

## Security headers

`next.config.ts` sends HSTS (2 years, include subdomains), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, a CSP of
`frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `Cross-Origin-Opener-Policy: same-origin` and a
restrictive `Permissions-Policy`. A `script-src` CSP is not set because the root layout's inline theme script and
Next's inline scripts would need per-request nonces from `src/proxy.ts`; that is a follow-up. Fonts are self-hosted
by `next/font`, so no Google Fonts hosts are involved. Only add `preload` to HSTS once every subdomain serves HTTPS.
