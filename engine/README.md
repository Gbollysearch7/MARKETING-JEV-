# Engine

The decision engine behind the content-operations platform described in the root README. It follows one rule throughout: **Jev decides, code computes, an LLM writes.**

What is here today:

| Piece | File | What it does |
|---|---|---|
| Decision client | `src/jev/client.ts` | Thin interface over `POST /v1/systemone`. Pinned model, retry with backoff on 429 and 529, logs the version the API reports. A deterministic `MockClient` runs everything offline. |
| Confidence maths | `src/jev/confidence.ts` | The documented Choice, Score and Noul confidence formulas, plus helpers for gating. |
| Question batteries | `src/criteria/*.v1.ts` | Versioned, atomic questions: per-URL verdict, pairwise link and cannibalisation, publish gate, financial-promotions compliance. |
| Rules | `src/rules/*.ts` | All numbers and thresholds live here. Buckets for Search Console metrics, verdict rules, gate rules, compliance rules. |
| Modules | `src/modules/*.ts` | Pipelines: candidate generation (TF-IDF now, pgvector later), linking, publish gate, compliance, page verdicts. |
| Decision log | `src/log/decision-log.ts` | One record per answer. JSONL always; Supabase through PostgREST when configured. |
| Crawl | `src/crawl/*.ts` | Sitemap and page fetching, HTML and Markdown extraction into a filtered `PageDoc`. |
| Migration | `supabase/migrations/0001_decision_log.sql` | `decisions`, `verdicts`, `actions`, `outcomes`. |

## Quick start

```bash
cd engine
npm install
npm test                      # 40+ tests, all offline

# Offline demo on the fixture pages (no API key needed)
npm run linking -- --dir test/fixtures --mock --top-k 3
npm run publish-gate -- --dir test/fixtures --mock
npm run compliance -- --file test/fixtures/ad-bad.txt --mock

# Live run on a site
cp .env.example .env          # add TYPESAFE_API_KEY
npm run linking -- --sitemap https://blog.example.com/sitemap.xml --limit 100 --top-k 20
npm run publish-gate -- --dir ./drafts --banned "competitor name,another term" --strict
npm run compliance -- --dir ./ads --channel ad --strict
```

Outputs land in `out/<module>/`: CSVs you can open or push to a CMS, `decisions.jsonl` with every atomic answer, and `summary.json` with token counts and estimated cost at $0.042 per million input tokens.

`--strict` makes the gate and compliance scripts exit non-zero on a kill or a block, which is what a GitHub Action needs.

## How a run works

1. Load pages from a folder, a sitemap or a URL list and extract a filtered document: title, H1, meta description, headings, paragraphs, first 1,200 characters.
2. Candidate generation in code. For linking, the top-k most similar pages per page by TF-IDF cosine. Swap `topCandidates` for a pgvector query without touching anything else.
3. Build a small state per decision and ask the versioned battery in one call. Every question is literal, points at a named field with backticks, and asks one thing.
4. Combine answers in code with the rules in `src/rules`. Thresholds are constants you can tune per workspace and per model version.
5. Write every atomic answer to the decision log with the criteria version, the model version and a hash of the state that was sent.

## Design rules enforced in code

- No arithmetic, counting or date comparison is ever asked of the model. `src/rules/buckets.ts` turns raw metrics into named buckets first.
- Irreversible verdicts (merge without a confident target, prune or redirect) are always marked `needsReview`.
- Code checks run before the model: placeholders, banned terms and shingle-level duplicates kill a page without a call.
- The model version is pinned (`JEV_MODEL=jev-1.13.0`). Tune thresholds against a labelled set before moving the pin.
- The compliance gate is assistive. It flags and blocks for a reviewer; it is not legal advice.

## Next

- Search Console and GA4 connectors feeding `runPageVerdicts` (today it takes a `Map<url, PageMetricsRaw>` you supply).
- Calibration script: bucket logged probabilities against human labels and plot predicted versus observed.
- Webflow and WordPress writers for the link plan.
- GitHub Action wrapper for the publish gate.
