# Rankcall API

The API lets a build pipeline or a CMS send pages to the Quality gate (Module 3) before they are published, and get back a verdict for each page: **Index**, **Improve** or **Kill**, with a confidence and the three strongest reasons.

- Base URL: the address you open Rankcall at (for example `https://rankcall.example`). The examples use `$RANKCALL`.
- All requests and responses are JSON over HTTPS.
- Version: `v1`. New fields may be added to responses; existing fields and error codes do not change within `v1`.

## Authentication

Create a key in **Settings → API keys** (account owners only). The full key is shown once; Rankcall keeps only a SHA-256 hash and the last four characters.

```
Authorization: Bearer rk_live_<43 characters>
```

- Keys belong to the account and work for every site in it.
- Keys are accepted **only** in the `Authorization` header. A request with a key (or `api_key`, `key`, `token` parameter) in the URL is refused with `key_in_query`; revoke any key that has appeared in a URL.
- Scopes: `gate:check` (score pages). Every key may also list the account's sites (`sites:read`).
- Keys can be given an expiry and can be revoked at any time; a revoked or expired key gets `401 invalid_api_key`.
- Rate limit: **60 requests a minute per key**. Over the limit you get `429 rate_limited` with a `Retry-After` header in seconds.
- Scoring needs an active plan or a running free trial. Otherwise every call gets `402 account_inactive`.
- Each call is logged against the key (route, status, time); Settings shows when each key was last used.

```sh
export RANKCALL=https://rankcall.example
export RANKCALL_KEY=rk_live_...   # from Settings → API keys
```

## Errors

Every error has the same shape: a sentence for people and a stable `code` for programs.

```json
{ "error": "This key does not have the gate:check scope.", "code": "insufficient_scope", "required_scope": "gate:check" }
```

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_json` | The body is not a JSON object. |
| 400 | `invalid_request` | A required field is missing or has the wrong type (for example `site` or `pages`). |
| 400 | `key_in_query` | A key was sent in the URL. Use the `Authorization` header. |
| 401 | `missing_api_key` | No `Authorization: Bearer` header. |
| 401 | `invalid_api_key` | The key does not exist, was revoked, or has expired. |
| 402 | `account_inactive` | The trial has ended or the subscription is not active. |
| 403 | `insufficient_scope` | The key lacks the scope this route needs (`required_scope`). |
| 404 | `site_not_found` | No site with this id in the key's account. |
| 422 | `no_usable_pages` | None of the pages had a URL, slug or title. `details` lists each problem. |
| 429 | `rate_limited` | Too many requests. Wait `Retry-After` seconds. |
| 502 | `scoring_failed` | Scoring failed part way; `batch_id` points at the batch. Retry later. |

## GET /api/v1/sites

The sites in the key's account.

```sh
curl -s "$RANKCALL/api/v1/sites" -H "Authorization: Bearer $RANKCALL_KEY"
```

```json
{ "sites": [ { "id": "a1b2c3d4e5f6", "name": "Sample Outdoors", "domain": "sample-outdoors.example" } ] }
```

## POST /api/v1/gate/check

Scores up to 500 pages and answers when they are all scored. Needs the `gate:check` scope.

| Field | Type | |
|---|---|---|
| `site` | string | Required. A site id from `GET /api/v1/sites`. |
| `pages` | array | Required. One object per page (below). Repeated URLs are skipped. |
| `name` | string | Optional. Batch name shown in Rankcall. |
| `source` | string | Optional. `"wordpress"` labels the batch as coming from the WordPress plugin. |

Each page:

| Field | Aliases | |
|---|---|---|
| `url` | `slug`, `path` | Full URL, path or slug. If all are missing the title is slugified. |
| `title` | | Page title. |
| `h1` | | Main heading. |
| `body` | `html`, `content`, `text` | Page body as text or HTML (tags are stripped). |
| `meta_description` | `meta`, `description` | |
| `target_query` | `query`, `keyword` | The search the page should win. Taken from Search Console when omitted and available. |
| `template` | | Template or page type, for the template report. Defaults to the first path segment. |

```sh
curl -s "$RANKCALL/api/v1/gate/check" \
  -H "Authorization: Bearer $RANKCALL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site": "a1b2c3d4e5f6",
    "name": "October location pages",
    "pages": [
      { "url": "/walks/keswick", "title": "Walks in Keswick", "h1": "Walks in Keswick",
        "body": "<p>Five walks around Keswick, from a 3 km lakeside loop to the Catbells ridge…</p>",
        "target_query": "walks in keswick", "template": "walks" }
    ]
  }'
```

Response (shortened):

```json
{
  "batch_id": "9f8e7d6c5b4a",
  "url": "/sites/a1b2c3d4e5f6/gate/9f8e7d6c5b4a",
  "model": "jev-…",
  "criteria_version": "gate.v1",
  "elapsed_ms": 1840,
  "counts": { "index": 1, "improve": 0, "kill": 0 },
  "templates": [ { "template": "walks", "pages": 1, "counts": { "index": 1, "improve": 0, "kill": 0 }, "most_common_failure": null, "pause_template": false } ],
  "notes": [],
  "pages": [
    {
      "path": "/walks/keswick", "url": null, "template": "walks", "target_query": "walks in keswick",
      "verdict": "index", "confidence": 0.91, "router": "auto",
      "reasons": ["…", "…", "…"], "fixes": [],
      "checks": { "word_count": 412, "unique_words": 260, "duplicate_ratio": 0, "placeholders": [], "duplicate_title": false, "missing_title": false, "missing_h1": false },
      "model": "jev-…"
    }
  ]
}
```

`router` says whether a person should look: `auto` (confidence 0.85 or above), `review` (0.60 to 0.84) or `uncertain` (below 0.60). Treat `kill` as "do not publish" and `improve` as "publish noindex or hold, with the fixes".

### Per-site route

`POST /api/sites/<site id>/gate/check` takes the same body without `site`. It accepts either a signed-in browser session or the same `Authorization: Bearer` key, and returns the same response and errors.

## WordPress plugin

Download it from the site's **Quality gate → Integrations** card (`rankcall-gate.zip`), upload it under **Plugins → Add New → Upload Plugin**, then fill in **Settings → Rankcall Gate**: the Rankcall address, a key with `gate:check`, and the site id.

When a post moves to Published it sends title, slug, content, excerpt, permalink and template (or post type) to `POST /api/v1/gate/check` with `"source": "wordpress"`. The verdict, confidence, reasons and fixes are stored in post meta `_rankcall_gate` and shown in the editor box and as an admin notice. With **Block publishing on Kill** on, a Kill post is saved as Pending review (or Draft) instead. The editor box has a **Check with Rankcall** button for the last saved version. If Rankcall cannot be reached within 15 seconds the post is published and the error is shown (fail open).

The plugin is in `integrations/wordpress/rankcall-gate/`. It has not yet been tested inside a running WordPress install.

## Webflow webhooks

Webflow cannot hold a publish while an outside service decides, so Webflow items are scored **after** they are created or changed. Each item becomes a gate batch named **Webflow · &lt;collection&gt;** in the batch list.

Set up, on the site's **Quality gate → Integrations** card:

1. In Webflow, create a webhook for `collection_item_created` and `collection_item_changed` (and `collection_item_published` if you want) with a site token or an app, so it is signed. Webflow's docs say webhooks created in the dashboard do not carry signature headers; Rankcall refuses unsigned requests.
2. In Rankcall, add a Webflow connection: paste the webhook's signing secret (for an OAuth app, the app's client secret), the slug of the rich-text field to score (for example `post-body`), an optional summary field, an optional collection id to watch, and the collection name used as the template.
3. Set the webhook's URL in Webflow to the address shown for the connection: `$RANKCALL/api/v1/webhooks/webflow/<connection id>`.

### POST /api/v1/webhooks/webflow/&lt;connection id&gt;

Called by Webflow, not by you. Rankcall:

- verifies `x-webflow-signature`, the hex HMAC-SHA256 of `"<x-webflow-timestamp>:<raw body>"` keyed with the connection's secret, compared in constant time;
- refuses requests whose `x-webflow-timestamp` (Unix epoch milliseconds) is more than 5 minutes from now (`401 stale_timestamp`);
- processes each signed delivery once (Webflow retries and replays are acknowledged with `"duplicate": true`);
- maps the item's `fieldData`: `name` → title and H1, `slug` → `/<collection>/<slug>`, the chosen body field → body (the longest text field is used, with a note, if it is empty), the summary field → meta description, the collection name → template;
- answers `200` straight away and scores in the background, because Webflow treats slow or non-200 answers as failures and retries up to 3 times.

Other events (for example `site_publish`) are acknowledged with `"status": "ignored"`. Errors use the codes above, plus `invalid_signature` (401), `stale_timestamp` (401), `connection_not_found` (404) and `not_configured` (503, the server has no `APP_SECRET`).

Signature scheme source: Webflow, "Working with webhooks → Validating request signatures", https://developers.webflow.com/data/docs/working-with-webhooks#validating-request-signatures (checked 14 October 2026). Payload shape: https://developers.webflow.com/data/reference/webhooks/events/collection-item-created.

```sh
# Simulate a signed Webflow delivery (secret = the one pasted into the connection)
BODY='{"triggerType":"collection_item_created","payload":{"id":"6720…","collectionId":"6710…","fieldData":{"name":"Walks in Keswick","slug":"walks-in-keswick","post-body":"<p>Five walks…</p>"}}}'
TS=$(($(date +%s)*1000))
SIG=$(printf '%s:%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$WEBFLOW_SECRET" -hex | sed 's/^.* //')
curl -s "$RANKCALL/api/v1/webhooks/webflow/$CONNECTION_ID" \
  -H "Content-Type: application/json" -H "x-webflow-timestamp: $TS" -H "x-webflow-signature: $SIG" -d "$BODY"
```

## Server configuration

| Variable | Needed for |
|---|---|
| `APP_SECRET` | Encrypting Webflow signing secrets (AES-256-GCM, key derived with HKDF-SHA256). At least 16 characters; use 32+ random bytes. Without it Webflow connections cannot be created and the webhook answers `503 not_configured`. Changing it makes stored secrets unreadable: connections must be recreated. |
| `APP_URL` | The public address used to show webhook URLs (otherwise the request's host is used). |

API keys need no configuration. The rate limit is kept in memory per server process.
