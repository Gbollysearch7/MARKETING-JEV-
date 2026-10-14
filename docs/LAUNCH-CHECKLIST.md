# Rankcall launch checklist

In order. **[code: done]** means the app side is built and tested; the founder still has to do the account work.

## 1. Stripe (payments) [code: done]
- [ ] Create the Stripe account as the UK company; complete business verification and add the payout bank account.
- [ ] Products and prices, all **GBP, monthly, recurring**: Starter £79, Growth £199, Scale £399. Copy the three
      `price_...` ids into `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE`.
      (Annual prices are advertised on the billing page as "2 months free" but are not wired yet.)
- [ ] VAT: decide with your accountant whether to register; if so turn on Stripe Tax or set tax rates, and check
      prices are shown inclusive/exclusive as intended.
- [ ] Customer portal: Settings → Billing → Customer portal: allow cancel, update card, invoice history, and
      switching between the three prices (the webhook follows the new price).
- [ ] Webhook endpoint `https://<your domain>/api/billing/webhook` with events `checkout.session.completed`,
      `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
      `invoice.payment_failed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
- [ ] Secret key into `STRIPE_SECRET_KEY` (test mode first: run one checkout with card 4242 4242 4242 4242, see the
      plan change on /billing, cancel in the portal, see it end; then repeat the setup in live mode).
- [ ] Decide the failed-payment policy: today a `past_due` subscription locks paid features immediately
      (`src/lib/plans.ts`). Consider a grace period while Stripe retries.

## 2. Hosting [code: done]
- [ ] Fly.io account (region `lhr`) **or** a UK VPS. Follow `docs/DEPLOY.md`.
- [ ] Generate `APP_SECRET` once (`openssl rand -base64 48`) and store it in a password manager.
- [ ] Set `TYPESAFE_API_KEY` (live Jev) and any AI visibility engine keys you want switched on.
- [ ] Integrator: make `/api/health` public in `src/proxy.ts` (required for health checks).

## 3. Backups bucket [code: done]
- [ ] Cloudflare R2 bucket (EU jurisdiction) or AWS S3 bucket in `eu-west-2`, private, with a key scoped to that
      bucket only. Set the `LITESTREAM_*` secrets.
- [ ] After the first deploy, test a restore (`docs/DEPLOY.md`, "Restore"). Repeat monthly.

## 4. Domain and HTTPS [code: done]
- [ ] Buy the domain (e.g. a `.co.uk` / `.com`), add DNS records for the app host, issue the certificate
      (Fly `fly certs add`, or Caddy automatically). Set `APP_URL` to the final `https://` origin.
- [ ] Email DNS for the support address: SPF, DKIM, DMARC.

## 5. Google Cloud project (Search Console / GA4 connection) [code: in progress by the Google builder]
- [ ] Create a Google Cloud project; enable the Search Console API and Google Analytics Data API.
- [ ] OAuth consent screen: External, app name Rankcall, support email, logo, home page, privacy policy and terms
      URLs, authorised domain. Scopes: `webmasters.readonly` (and `analytics.readonly` if used).
- [ ] OAuth client (Web application) with redirect URI `https://<APP_URL>/api/google/callback`; set
      `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- [ ] Submit for **verification** (sensitive scopes; needs a demo video and the privacy policy). Until approved,
      only listed test users can connect, max 100. Allow several weeks.

## 6. UK data protection
- [ ] **ICO registration**: pay the data protection fee (ico.org.uk/fee, tier 1 for most small companies).
- [ ] Record of processing, and a Data Processing Agreement offered to customers (they upload their site data).
- [ ] List sub-processors: hosting (Fly.io or VPS provider), backups (Cloudflare/AWS), Stripe, Google, TypeSafe,
      and any AI engines switched on. Check each has UK/EU transfer terms.
- [ ] Cookies: only a strictly necessary session cookie is set today (no analytics), so no consent banner is
      needed; revisit if analytics are added.

## 7. Legal pages
- [ ] Privacy policy and terms of service drafted and **reviewed by a UK lawyer**; link them from the landing page,
      sign-up and the Google consent screen.
- [ ] Refund/cancellation terms consistent with the Stripe portal settings.

## 8. Support
- [ ] Support email (e.g. support@yourdomain) on a monitored inbox; put it on the landing page, billing page and
      Google consent screen.
- [ ] Uptime monitor on `https://<APP_URL>/api/health` (e.g. Better Stack, UptimeRobot) alerting your phone.

## Already done in code
- Production build with `output: 'standalone'`, Dockerfile, Fly config, Litestream backups and restore-on-boot.
- `/api/health` (needs the proxy change above), security headers, `Secure` session cookie in production.
- Stripe checkout, customer portal and signed, idempotent webhooks, with automated tests (`test/billing.test.ts`).
- `.env.example` lists every variable.

## Recommended before or soon after launch (code)
- Rate limit sign-in and sign-up (per IP and per email), e.g. 10 attempts per 15 minutes, with a short lockout.
- `busy_timeout` and `synchronous = NORMAL` pragmas in `src/lib/db.ts` (Litestream holds read locks while copying).
- Build redirects from `APP_URL` in `checkoutAction` / `portalAction` (billing already prefers `APP_URL`).
