# Google Search Console and GA4: setup and OAuth verification

Rankcall connects to Google with read-only OAuth (milestone A7). The code is built and tested with mocked Google responses; it switches on when the environment variables below are set. Uploads keep working whether or not Google is connected.

## 1. What the app asks for

| Scope | Sensitivity | Why |
|---|---|---|
| `openid`, `email` | Non-sensitive | Show which Google account is connected on the Data page. Taken from the id_token. |
| `https://www.googleapis.com/auth/webmasters.readonly` | Sensitive | List Search Console properties; read Search Analytics (pages and queries, last 28 days and prior 28 days). |
| `https://www.googleapis.com/auth/analytics.readonly` | Sensitive | List GA4 properties (Admin API `accountSummaries`); read landing-page sessions, engaged sessions, key events and revenue (Data API `runReport`). |

No restricted scopes, so no CASA security assessment is needed. Both data scopes are **sensitive**, so the app needs Google's sensitive-scope verification before it can leave Testing mode for public use.

Flow: authorisation code with PKCE (S256), `access_type=offline`, `prompt=consent`, a signed, expiring (10 minute), single-use `state` bound to the signed-in user and site. Refresh tokens are encrypted at rest with AES-256-GCM (key derived from `APP_SECRET`). Disconnect revokes at `https://oauth2.googleapis.com/revoke` and deletes the row.

## 2. Create the Google Cloud project

1. Go to <https://console.cloud.google.com/>, signed in with the company Google Workspace account that will own the app (not a personal account).
2. Project picker → **New project**. Name: `Rankcall`. Organisation: your company's. Create.
3. **APIs & Services → Library**. Enable all three:
   - **Google Search Console API** (`searchconsole.googleapis.com`)
   - **Google Analytics Admin API** (`analyticsadmin.googleapis.com`)
   - **Google Analytics Data API** (`analyticsdata.googleapis.com`)

## 3. Verify your domain

Google requires the app's home page, privacy policy and authorised domain to be on a domain you own and have verified.

1. In <https://search.google.com/search-console>, add a **Domain** property for `rankcall.io` (or your production domain) and verify it with the DNS TXT record. Use an account that is an Owner or Editor of the Cloud project.
2. The landing page (`/`), `/privacy` and `/terms` must be publicly reachable on that domain without signing in (see "Integrator changes" at the end).

## 4. Configure the OAuth consent screen (Google Auth Platform)

**APIs & Services → OAuth consent screen** (shown as **Google Auth Platform** in newer consoles).

**Branding**
- App name: **Rankcall**
- User support email: `[support email]`
- App logo: 120×120 PNG of the Rankcall mark (a logo triggers brand verification; that is fine and runs alongside scope verification)
- Application home page: `https://rankcall.io/`
- Privacy policy: `https://rankcall.io/privacy`
- Terms of service: `https://rankcall.io/terms`
- Authorised domains: `rankcall.io`
- Developer contact email: `[developer email]`

**Audience**
- User type: **External**.
- Publishing status: leave as **Testing** until verification is approved.
- **Test users**: add each Google account that will try the flow before approval (up to 100). Only these accounts can sign in while the app is in Testing. Refresh tokens issued in Testing expire after 7 days, so expect "Reconnect needed" on test accounts after a week.

**Data access (scopes)** → Add or remove scopes → add `openid`, `.../auth/userinfo.email`, `.../auth/webmasters.readonly`, `.../auth/analytics.readonly`.

Scope justifications (paste into the form):

- **webmasters.readonly**: "Rankcall is an SEO decision tool. With this scope it lists the Search Console properties the user can access so they can choose the one for their site, and reads Search Analytics data (clicks, impressions, CTR and position by page, and by page and query) for the last 28 days and the 28 days before. Rankcall uses this data only to show the user a recommendation for each page of their own site (refresh, expand, merge, redirect, prune or leave), detect pages competing for the same queries, and measure whether completed changes worked. Access is read-only; Rankcall never changes Search Console settings. A narrower scope does not exist for reading Search Analytics."
- **analytics.readonly**: "Rankcall lists the user's GA4 properties (Admin API accountSummaries) so they can choose the property for their site, and runs one Data API report of sessions, engaged sessions, key events and total revenue by landing page for the last 28 days. This is used only to protect pages that convert from being recommended for removal, and to show traffic next to each recommendation in the user's own account. Access is read-only; no configuration is changed. There is no narrower scope that allows reading reports."
- **openid / email**: "Shows the user which Google account is connected to each site so they can confirm or disconnect it."

**Clients** → Create client → **Web application**, name `Rankcall web`.
- Authorised JavaScript origins: `https://rankcall.io`
- Authorised redirect URIs: `https://rankcall.io/api/google/callback` (must equal `APP_URL` + `/api/google/callback` exactly). For local testing also add `http://localhost:3000/api/google/callback`.
- Copy the client ID and secret into the environment (below). Never commit them.

## 5. Environment variables

| Variable | Example | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `1234-abc.apps.googleusercontent.com` | From the Web client. |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-…` | Secret. |
| `APP_URL` | `https://rankcall.io` | Public base URL, no trailing slash. Builds the redirect URI. Required in production; outside production the request origin is used if unset. |
| `APP_SECRET` | 32+ random characters (`openssl rand -base64 48`) | Encrypts stored tokens and signs OAuth state. If missing or shorter than 32 characters, Google connections stay off (fail closed). **Changing it makes stored Google tokens unreadable**; users would have to reconnect. Back it up with your other secrets. |

Restart the app after setting them. The Data page then shows **Connect Google** instead of the setup notice.

## 6. Demo video (required for sensitive-scope verification)

Upload an unlisted YouTube video (2 to 4 minutes, English, real production domain visible in the address bar). Script:

1. **0:00** Open `https://rankcall.io`, show the home page, then scroll to the footer and open the Privacy policy, showing the Google data section and the Limited Use statement.
2. **0:20** Sign in to Rankcall. Open a site → **Data**.
3. **0:35** Click **Connect Google**. On Google's consent screen, pause and **show the app name "Rankcall" and the full list of scopes**, with the address bar showing the OAuth client ID (`client_id=` in the URL).
4. **1:00** Approve. Back on the Data page, show the connected email.
5. **1:10** Choose the Search Console property and the GA4 property from the dropdowns and Save. Point out the domain-match hint.
6. **1:25** Click **Sync now**; show the progress bar and the last-sync counts. Explain: "webmasters.readonly is used to read clicks, impressions and position by page and query; analytics.readonly reads sessions and key events by landing page."
7. **1:50** Show where the data is used: the URLs table on the Data page, then Overview → run scoring, and open one verdict that cites Search Console clicks and GA4 key events.
8. **2:30** Back on Data, click **Disconnect**, confirm, and show it revoked. Optionally show that Rankcall is gone from <https://myaccount.google.com/permissions>.

## 7. Submit and timeline

1. On the consent screen, **Publish app** (moves to "In production", pending verification) and **Prepare for verification** → submit.
2. Google's Trust & Safety team emails the developer contact. Answer within a few days or the review stalls.
3. Typical timeline: brand verification 2 to 3 business days; sensitive-scope verification **3 to 6 weeks**, longer if they ask for changes (most often: privacy policy wording, demo video not showing the consent screen or client ID, domain not verified).
4. Until approved: only test users can connect, and unverified users who are added see the "Google hasn't verified this app" screen. Uploads stay the default for everyone.
5. Re-verification is needed if you add scopes, change the app name or logo, or change the privacy policy domain.

Sensitive scopes have no annual security assessment requirement (that applies to restricted scopes only).

## 8. API references used by the code

- OAuth 2.0 for web server apps: <https://developers.google.com/identity/protocols/oauth2/web-server>
- Search Console `sites.list`: <https://developers.google.com/webmaster-tools/v1/sites/list>
- Search Console `searchanalytics.query` (`rowLimit` 1 to 25,000, `startRow` paging): <https://developers.google.com/webmaster-tools/v1/searchanalytics/query>
- GA4 Admin `accountSummaries.list` (`pageSize` max 200): <https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list>
- GA4 Data `runReport`: <https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport>
- GA4 dimension and metric names (`landingPage`, `sessions`, `engagedSessions`, `keyEvents`, `totalRevenue`): <https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema>
- Google API Services User Data Policy: <https://developers.google.com/terms/api-services-user-data-policy>

## 9. Integrator changes outside the Google code

- `src/proxy.ts`: `/privacy`, `/terms` and `/security` must stay in `PUBLIC` (already added in the working tree) so signed-out visitors and Google reviewers can read them.
- Landing page footer (`src/app/page.tsx`): add links to `/privacy`, `/terms`, `/security`. Google checks the home page links to the privacy policy.
- Optionally update the landing FAQ "Do I need to connect my Google account?" once verification is approved.
- The weekly scheduler can call `syncGoogleForSite(siteId)` from `src/lib/google/server.ts` for each id in `syncableSiteIds()` from `src/lib/google/store.ts`.
