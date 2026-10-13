# App

The working product on top of the engine. Next.js 16 App Router, Tailwind v4, file-backed storage (no database to set up), server actions for every mutation, and a background job runner for crawl, linking and gate.

## Run it

```bash
# from the repo root
npm install
npm run dev            # builds the engine, then starts the app on http://localhost:3000
```

Add a site (sitemap URL or a list of page URLs, a path filter, a page limit and candidates per page), then click **Run crawl, links and gate**. A 40-page run with 10 candidates per page finishes in well under a minute.

Without a key the app uses the engine's deterministic mock and says so on every screen. To go live:

```bash
# app/.env.local
TYPESAFE_API_KEY=ts_...
JEV_MODEL=jev-1.13.0
```

## What each screen does

| Route | What it shows | What you can do |
|---|---|---|
| `/` | Sites with their latest run | Add a site, open it |
| `/sites/[id]` | Run status with live progress, summary figures, run history | Start a run, delete the site |
| `/sites/[id]/links` | Link suggestions grouped by source page: target, anchor, paragraph, three probabilities, priority | Accept, dismiss, reopen; filter by status or page; export accepted as CSV |
| `/sites/[id]/cannibalisation` | Pairs above the same-intent threshold with the suggested survivor | Review |
| `/sites/[id]/gate` | Every page as index, improve or kill with the failing questions named | Filter by disposition |
| `/sites/[id]/decisions` | Every atomic answer with model version, criteria version and state hash | Filter by question, confidence and entity; paginate |
| `/settings` | Key status, pinned model, data directory, current thresholds | Read |
| `/api/runs/[id]` | Run status as JSON | Polled by the progress widget |
| `/api/runs/[id]/links.csv?status=accepted` | CSV export | Download |

## Where data lives

`app/data/` (gitignored): `sites.json` and one folder per run with `run.json`, `pages.json`, `links.json`, `cannibal.json`, `gate.json` and `decisions.jsonl`. Set `JEV_DATA_DIR` to move it. Swapping this for Supabase means replacing `lib/store.ts`; nothing else touches the filesystem.

## Layout

- `lib/store.ts`: sites, runs, artifacts, decision log reads
- `lib/jobs.ts`: the pipeline (crawl, linking, publish gate) run in the background with progress updates
- `lib/engine.ts`: picks live Jev or the mock from the environment
- `lib/actions.ts`: server actions (add site, start run, set link status, delete site)
- `components/`: shared UI, the polling progress widget, the site tabs
- `app/`: routes

## Next

- Search Console and GA4 connectors feeding the page-verdict battery (engine already has `runPageVerdicts`)
- Webflow and WordPress writers for accepted links
- Calibration view: bucket logged probabilities against labels
- Per-site thresholds stored with the model version
