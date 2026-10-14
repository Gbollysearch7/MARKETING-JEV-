# PRD: SEO Decision Platform

> **Use Rankcall day to day on this computer**
>
> 1. One-off setup: `npm install`, then put your Jev key in `.env.local` as `TYPESAFE_API_KEY=...`. Without a key, decisions come from an offline mock with demo quality only.
> 2. Every day: `npm run app` and open http://localhost:3000. It builds only when the code has changed, then starts in about a second. Stop it with Ctrl+C.
> 3. Your data lives in `data/app.db`. To copy it to `data/backups/`, run `npm run backup`; this is safe while the app is running.
> 4. To see who owns which site, run `npm run admin -- status`. Two more commands help with ownership, and both write a backup first:
>    - `npm run admin -- cleanup-test` removes test accounts and hands back sites they claimed.
>    - `npm run admin -- give-site <siteId> <email>` moves a site to another account.
> 5. Developing the code: `npm run dev` gives hot reload, and `npm test` runs the tests. `docs/DEPLOY.md` covers hosting, and `docs/LAUNCH-CHECKLIST.md` covers what is left before launch.

11 Oct 2026 · @Gbolahan

## 1. Overview

The SEO Decision Platform is a standalone SaaS that turns SEO from periodic audits into continuous, scored decisions. For every URL, keyword, page, prompt, link prospect and location a customer owns, the platform returns a verdict (what to do), a reason, a calibrated confidence score and an expected impact, then tracks whether the decision paid off.

**The problem.** SEO teams and agencies make thousands of small judgement calls a month: refresh or prune this page, which cluster does this keyword belong to, should this programmatic page be indexed, why did a competitor get cited in ChatGPT. Today these are made by hand, inconsistently, or bought as a £2,000 to £5,000 one-off audit that is stale within weeks. Existing tools surface data but stop at diagnosis; nobody closes the loop on whether the recommendation worked.

**Why now.** Decision-only models such as TypeSafe's Jev (launched 15 September 2026) and OpenAI's Decisions API (public beta 6 October 2026) make a single classification decision cost a fraction of a cent, with calibrated confidence rather than free text. That makes it economic to score every item on a site every day rather than sample once a quarter. At the same time, Google's helpful-content updates and the shift of search to AI answers have made "which pages deserve to exist" and "why aren't we cited" the two most expensive questions in SEO.

**Core idea.** One decision engine, seven modules. Each module is a workflow (connect data, score items, review verdicts, execute, measure) built on the same engine, the same confidence rules and the same outcome ledger. The outcome ledger is the moat: every decision is matched to what happened next (traffic, rankings, citations), and that data recalibrates the thresholds per customer and per vertical.

### Modules

1. Content Decision Engine (flagship, MVP)
2. Keyword Intent and Clustering
3. Programmatic SEO Quality Gate
4. AI Search Visibility Tracker
5. Content Brief and Editorial Decision Desk
6. Link and Digital PR Opportunity Filter
7. Local SEO Autopilot

### Product principles

- A verdict, not a dashboard: every screen ends in an action.
- Confidence is first-class: low-confidence decisions go to a human, never silently executed.
- Model-agnostic: Jev, OpenAI Decisions or an open-source decision model behind one interface.
- Closed loop: no decision is final until the outcome is measured.

## 2. Target customers and personas

Initial market is UK and English-speaking SMB and mid-market SEO: agencies with 5 to 50 clients, in-house SEO leads at ecommerce and SaaS companies with 1,000 to 500,000 URLs, and multi-location businesses. Enterprise (BrightEdge, Conductor buyers) is out of scope for the first year.

| Persona | Who they are | Job to be done | Pain today | Modules they buy first |
|---|---|---|---|---|
| Agency SEO lead ("Priya") | Runs 10 to 30 client accounts, 2 to 6 juniors | Decide what to work on each month per client and justify it in a report | Audits take days, juniors make inconsistent calls, clients ask "did it work?" | 1, 5, 2 |
| In-house ecommerce SEO ("Tom") | Owns 50k to 500k URLs, small team, pressure from marketing director | Keep index quality high and stop traffic decay across thousands of pages | Can't review every page; prunes by gut; fears Google quality updates | 1, 3, 2 |
| Programmatic SEO builder ("Dayo") | Founder or growth engineer generating pages from data | Publish at scale without getting the site penalised | No tool judges page quality before indexing | 3, 1 |
| Content strategist ("Lena") | Plans 20 to 100 briefs a month for writers | Decide which keywords deserve content and what shape | Briefs are slow, formulaic, and often target the wrong intent | 5, 2 |
| Digital PR / outreach manager ("Sam") | Runs link campaigns, 3 to 10 seats | Spend outreach hours only on prospects that will convert | Hours lost on dead or toxic prospects | 6 |
| Brand or growth marketer ("Aisha") | B2B SaaS or DTC, cares about AI answers | Know whether the brand shows up in ChatGPT and why competitors win | Current trackers show scores but not reasons or fixes | 4 |
| Multi-location operator ("Mark") | Franchise, clinic group or estate agency with 10 to 300 locations | Keep every location's profile, reviews and posts healthy | Can't scale attention across locations; relies on local managers | 7 |

**Buyer vs user.** At agencies the buyer is the owner or head of SEO and the daily user is a junior or mid-level executive. The product must make juniors produce senior-quality decisions and give the owner a client-ready report.

**Not for.** Hobby bloggers under 200 URLs, enterprises needing SSO and procurement, and anyone wanting a content writer first (writing is a downstream integration, not the product).

## 3. Goals, non-goals and success metrics

### Goals (first 12 months)

1. Ship Module 1 as a paid MVP within 90 days and reach 30 paying accounts by month 6.
2. Prove the closed loop: show that verdicts with confidence above 0.8 are right at least 80% of the time, measured against real outcomes at 90 days.
3. Reach £15k MRR by month 12 across Modules 1, 2 and 3.
4. Build an outcome ledger of at least 100,000 scored decisions with measured results, the dataset no competitor has.
5. Produce evidence (traction, UK customers, UK hires planned) that supports an Innovator Founder endorsement.

### Non-goals

- Not a rank tracker, crawler or backlink index. We integrate with Search Console, GA4, and third-party crawl and link data rather than rebuilding them.
- Not a content writer. We produce briefs and verdicts; writing happens in the customer's tools or via integration.
- Not an enterprise platform in year one: no SSO, no on-premise, no custom contracts.
- Not a chat assistant. Every interaction is a structured decision, not a conversation.

### Success metrics

| Metric | Definition | Target at month 6 | Target at month 12 |
|---|---|---|---|
| Paying accounts | Active subscriptions | 30 | 120 |
| MRR | Monthly recurring revenue | £4k | £15k |
| Decision accuracy | Share of verdicts (confidence ≥ 0.8) confirmed correct by outcome at 90 days | 75% | 85% |
| Calibration error | Gap between stated confidence and observed accuracy, averaged across buckets | ≤ 0.10 | ≤ 0.05 |
| Verdict acceptance | Share of verdicts customers approve without change | 60% | 75% |
| Time to first verdict | Minutes from connecting Search Console to first scored URL list | ≤ 20 | ≤ 10 |
| Weekly active accounts | Accounts that review or action a verdict in the week | 70% | 80% |
| Net revenue retention | Month-12 revenue from month-0 cohort | n/a | 100% |
| Gross margin | Revenue minus model, crawl and infrastructure costs | 75% | 85% |

## 4. Platform architecture

Data flows down through one shared decision engine into the seven modules and out to a work queue; the outcome ledger measures each executed decision and the dashed loop feeds those results back to recalibrate thresholds.

### Components

- **Ingestion.** OAuth connectors for Google APIs, scheduled syncs, CSV and export importers, a crawler for sites up to 100k URLs. All data normalised to a per-account item store (URL, keyword, page, prompt, prospect, location).
- **Decision engine.** A typed decision contract (state, options, question) routed through hard rules first, then a provider-abstracted decision model, then the confidence router. Every call is logged with model version and latency.
- **Modules.** Thin workflow layers: each defines its item type, its decisions, its review screens and its execution hooks. New modules reuse the engine and ledger without changes to either.
- **Work queue.** Shared task model across modules with owner, status, due date, export and integrations.
- **Outcome ledger.** Append-only record joining each decision to its measured result. Weekly calibration jobs produce per-module reliability curves and adjust per-account thresholds within guardrails.

**Stack (proposed).** TypeScript end to end: Next.js app, Postgres with a queue table and worker processes for batch scoring, Redis for job scheduling, object storage for crawl snapshots, Playwright workers for AI Overviews capture. Hosted in a UK or EU region.

## 5. Module 1: Content Decision Engine (flagship)

Every URL on a connected site receives one of six verdicts, with a reason, a confidence score and an expected traffic impact, refreshed weekly. This is the MVP and the module every customer starts on.

### Inputs

- Google Search Console (clicks, impressions, CTR, position by page and query, 16 months)
- GA4 (sessions, engagement, conversions by landing page)
- Site crawl (status codes, canonicals, word count, headings, internal links, last modified, templates). Built-in crawler up to 100k URLs; Screaming Frog or Sitebulb export import above that
- Optional: Ahrefs or Semrush keyword and backlink export per URL

### Verdicts

| Verdict | Meaning | Typical signals |
|---|---|---|
| Refresh | Keep URL, update content | Impressions stable, clicks or position decaying, content older than 12 months, top-10 competitors updated recently |
| Expand | Keep URL, add depth | Ranks 8 to 20 for high-volume queries, thin against competing pages, strong internal links |
| Merge | Combine into a stronger sibling | Two or more URLs competing for the same queries (cannibalisation), one clearly weaker |
| Redirect | 301 to the best match | No traffic, has backlinks or historic equity, close topical match exists |
| Prune | Remove and 410 | No traffic, no links, no conversions, not a legal or navigational page, thin or duplicate |
| Leave | No action | Performing to potential, recently updated, or protected page type |

**Decision design.** The engine does not ask a model to "audit the page". It frames each URL as a typed decision with a closed set of options and a state object (metrics deltas, crawl facts, cannibalisation pairs, page type). The decision model returns the option and a calibrated probability. Rules handle hard constraints first (legal pages, pages with conversions above a threshold, pages under 30 days old are never pruned).

### Confidence handling

- ≥ 0.85: auto-approved into the work queue, customer can still override
- 0.60 to 0.84: shown as "needs review", one-click approve or change
- < 0.60: grouped as "uncertain", with the two most likely verdicts and what evidence would settle it
- Prune and Redirect always require explicit approval regardless of confidence in the first 90 days of an account

**Expected impact.** For each verdict the engine estimates 90-day click change as a range (for example +120 to +340 clicks a month) using the site's own CTR curve by position and the queries the URL already appears for. Shown as a range, never a single number.

**Work queue.** Approved verdicts become tasks with owner, due date, status and a brief: for Refresh and Expand, the queries to target, sections to add and competitor pages to beat; for Merge and Redirect, the target URL and redirect rule; for Prune, the 410 list. Export to CSV, Asana, Trello, Notion and a redirect file for common platforms.

**Outcome tracking.** When a task is marked done, the engine records the date and compares the following 30, 60 and 90 days against the forecast. Each decision is labelled worked, neutral or backfired. Results feed the account's report and the platform calibration layer.

### User stories

- As an agency lead, I connect a client's Search Console and within 20 minutes see every URL scored, so I can present a prioritised plan in the first call.
- As an in-house SEO, I review only the 40 uncertain pages a week instead of 4,000, so I can keep index quality without a bigger team.
- As an agency owner, I send a monthly report showing which decisions worked and the traffic they added, so I can justify the retainer.

### Acceptance criteria (MVP)

- [ ] Connect Search Console and GA4 via OAuth in under 5 minutes
- [ ] Crawl or import up to 100k URLs and join to performance data by canonical URL
- [ ] Every URL receives a verdict, reason, confidence and impact range
- [ ] Cannibalisation detection flags URL pairs sharing ≥ 3 top-20 queries
- [ ] Review screen filters by verdict, confidence, template and traffic
- [ ] Work queue with status, export to CSV and a redirect file
- [ ] Outcome tracking marks each completed task worked, neutral or backfired at 90 days
- [ ] Monthly PDF report per site

**Out of scope for MVP.** Automatic publishing of changes, CMS write-back, multi-language sites, JavaScript-rendered crawling.

## 6. Module 2: Keyword Intent and Clustering

Paste or import up to 50,000 keywords and get them clustered by topic, intent and buying stage, mapped to existing URLs, with cannibalisation warnings, in under 10 minutes.

**Inputs.** CSV or paste (keyword, volume, CPC, current URL and position optional); direct import from Search Console queries; Ahrefs or Semrush export.

### Decisions per keyword

| Decision | Options | Notes |
|---|---|---|
| Intent | Informational, commercial investigation, transactional, navigational, local, junk | Junk catches misspellings, brand of competitor, irrelevant |
| Buying stage | Awareness, consideration, decision, retention | Drives content format later |
| Topic cluster | Assigned to an existing cluster or opens a new one | Embeddings for candidate clusters, decision model to confirm membership |
| Page mapping | Existing URL, new page needed, or fold into existing page | Uses Module 1 crawl when connected |
| SERP shape (optional) | Blog, product, category, tool, video, local pack | From a sampled SERP fetch for cluster heads only, to control cost |

### Outputs

- Cluster view: cluster name, total volume, dominant intent, mapped URL, gap flag
- Cannibalisation list: clusters mapped to more than one URL, with the recommended primary
- Export to CSV and directly into Module 5 as brief candidates

**Why we win.** Existing clustering tools either rely on SERP overlap for every keyword (slow and costly) or pure embeddings (groups by wording, not intent). Running a cheap calibrated decision per keyword lets us cluster by intent and stage at a per-keyword cost under £0.0001, so we can price at £49 to £199 a month and still hold 85%+ margin.

### Acceptance criteria

- [ ] 50,000 keywords processed in under 10 minutes
- [ ] Intent agreement with a human-labelled 500-keyword benchmark ≥ 90%
- [ ] Clusters editable: drag keywords between clusters, merge and rename
- [ ] Cannibalisation warnings link to the two URLs and the shared queries
- [ ] Re-run on an updated list keeps existing cluster names stable

## 7. Module 3: Programmatic SEO Quality Gate

Every generated page is scored before it is published and receives Index, Improve or Kill, so sites can scale to tens of thousands of pages without triggering helpful-content or spam penalties.

**How it fits.** Customers send pages via API, CSV, sitemap or a CMS webhook (Webflow, WordPress, Next.js build hook) before or at publish time. The gate returns a verdict in under two seconds per page and a batch report for bulk runs.

### Scoring dimensions

| Dimension | What is checked | Signal source |
|---|---|---|
| Thinness | Unique, useful content beyond the template | Word count outside template, unique facts, data density |
| Duplication | Near-duplicate of a sibling page | Shingling and embeddings against the batch and the existing site |
| Helpfulness | Would a searcher with this query be satisfied | Decision model with the target query and page as state |
| Search demand | Is there any query this page can win | Keyword data and Search Console for the pattern |
| Brand and legal risk | Claims, regulated terms, broken facts, placeholder text | Rules plus decision model |
| Technical | Canonical, title and H1 uniqueness, internal links in and out | Crawl of the generated page |

**Verdicts.** Index (publish and allow indexing), Improve (publish noindex or hold, with the specific fixes), Kill (do not publish, with the reason). Each carries a confidence score and the three strongest reasons.

**Batch intelligence.** Beyond per-page verdicts, the gate reports on the template: share of pages killed, the most common failure, and whether the pattern as a whole should be paused. A template with more than 40% Kill is flagged before any page ships.

**Pricing basis.** Per 10,000 pages scored, with a monthly minimum. Re-scoring an edited page within 30 days is free.

### Acceptance criteria

- [ ] API, CSV and sitemap ingestion; WordPress and Webflow webhook
- [ ] Verdict in under 2 seconds per page, 10,000 pages in under 30 minutes
- [ ] Kill decisions agree with a human reviewer ≥ 85% on a 300-page benchmark
- [ ] Template-level report with pause recommendation
- [ ] Post-publish check: pages marked Index that later lose impressions are fed back as outcomes

## 8. Module 4: AI Search Visibility Tracker

Tracks whether a brand is mentioned or cited in ChatGPT, Claude, Perplexity, Gemini and Google AI Overviews for its target prompts, explains why a competitor won each one, and recommends a fix with a confidence score. The explain-and-fix layer is the differentiator; existing trackers (Profound, Peec, Otterly) stop at scores.

### How tracking works

1. Prompt set: 50 to 500 buyer-style prompts per brand, generated from the customer's keyword clusters (Module 2) and edited by the user.
2. Scheduled runs: daily on paid plans, each prompt sent to every engine via API where one exists (OpenAI, Anthropic, Perplexity, Gemini) and via headless browser for Google AI Overviews and AI Mode. Each prompt runs 3 times per engine to average out volatility.
3. Answer parsing: for every answer, decisions on brand mentioned (yes/no), citation present (URL), position in answer, sentiment, and the source types that won (vendor page, review site, Reddit, news, directory).
4. Aggregation: visibility rate, citation rate, share of voice against named competitors, trend over time.

**The "why" layer.** For every prompt the brand loses, a decision on the most likely reason from a closed set: no page covers the question; page exists but is not cited by the sources engines trust; competitor has third-party coverage (reviews, Reddit, listicles) and we do not; brand entity is weak (no Wikipedia, inconsistent descriptions); content is behind a wall or blocked to AI crawlers. Each reason maps to a recommended fix and an owner (content, PR, technical).

**Crawler signal.** Optional log-file or Cloudflare integration shows which AI bots (GPTBot, ClaudeBot, PerplexityBot) actually fetch which pages, so a loss can be split into "never fetched" versus "fetched but not chosen".

### Outputs

- Visibility dashboard by engine, prompt group and competitor
- Loss register: prompt, winning competitor, reason, fix, confidence, status
- Weekly change alerts when visibility moves more than 10 points
- Fixes push into Module 5 (briefs) and Module 6 (PR targets)

**Cost control.** Answer parsing is the expensive step at scale (500 prompts × 5 engines × 3 runs × 30 days = 225,000 answers a month per brand). All classification runs on the decision model; a general LLM is only used for the "why" on newly lost prompts.

### Acceptance criteria

- [ ] Five engines tracked, daily, with 3-run averaging
- [ ] Mention and citation detection ≥ 95% agreement with manual check on 200 answers
- [ ] Every lost prompt has a reason and a fix with confidence
- [ ] Competitor set of up to 5 brands per account
- [ ] Outcome loop: when a fix is marked done, the prompt's visibility 30 days later is recorded against it

## 9. Module 5: Content Brief and Editorial Decision Desk

For every target keyword or cluster, the desk decides whether to create content at all and, if so, the format, angle, length, structure and sources, producing a writer-ready brief in under a minute.

### Decisions per target

| Decision | Options | Inputs |
|---|---|---|
| Go / no-go | Create, expand existing, skip | Cluster volume, difficulty, existing coverage (Module 1), business relevance score set by the customer |
| Format | Guide, comparison, listicle, tool page, product or category page, FAQ, video-first, template | SERP shape sample, intent, buying stage |
| Angle | Closed set generated per cluster, for example "for UK freelancers", "vs the market leader", "with calculator" | Competitor gap analysis on the top 10 |
| Length band | 600 to 900, 1,000 to 1,500, 1,800 to 2,500, 3,000+ words | Top-10 median and intent |
| Structure | Ordered list of H2s and the questions each must answer | People Also Ask, competitor headings, Module 4 lost prompts |
| Sources | 3 to 8 citations the piece should reference, with first-party data suggestions | Search and the customer's own data connectors |
| Internal links | Pages to link to and from | Module 1 crawl |

**Brief output.** Title options, target queries, format, angle, length, outline with per-section notes, sources, internal links, and a "what makes this better than the top 3" line. Exported to Google Docs, Notion, Markdown or pushed to a writing tool via API.

**Editorial queue.** Briefs sit in a Kanban: proposed, approved, in writing, published, measured. Publishing links the brief to a URL so Module 1 can track the outcome and label the brief worked or not after 90 days.

**Why we win.** Agencies pay a strategist to make these calls at £40 to £80 an hour; the desk makes them consistently and shows its reasoning, so a junior can run the queue. Over time, brief outcomes train which formats and angles win in each vertical.

### Acceptance criteria

- [ ] Brief generated in under 60 seconds from a cluster
- [ ] No-go recommendations shown with the reason and what would change the call
- [ ] Outline agreement with a strategist's outline ≥ 80% on a 50-brief benchmark
- [ ] Export to Google Docs and Notion
- [ ] Published URL linked back and outcome recorded at 90 days

## 10. Module 6: Link and Digital PR Opportunity Filter

Every link prospect, unlinked mention and competitor backlink is scored Pursue, Skip or Toxic with a confidence and a suggested pitch angle, so outreach teams spend hours only on prospects likely to convert.

**Inputs.** Competitor backlink exports (Ahrefs, Semrush, Majestic), brand mention alerts (web search, news APIs), the customer's existing link profile, and a prospect list uploaded by the team.

### Decisions per prospect

| Decision | Options | Signals |
|---|---|---|
| Verdict | Pursue, skip, toxic | Topical relevance, site quality, link placement type, sponsored or UGC patterns, spam signals |
| Prospect type | Editorial, resource page, guest post, directory, unlinked mention, broken link, competitor-linked | Page structure and link context |
| Pitch angle | Data study, expert quote, resource suggestion, correction, partnership | Site's recent content and what competitors got linked for |
| Likelihood | Low, medium, high chance of a reply | Outcome history of similar prospects in the ledger |
| Priority | Score 1 to 100 | Relevance × authority × likelihood |

**Workflow.** Prospects flow into a queue ordered by priority. Each shows the verdict, the reason, the suggested angle and a contact if found. Team members claim prospects, log outreach status (contacted, replied, won, lost) and the outcome feeds the likelihood model.

**Toxic detection.** Separate from skip: sites with link-selling patterns, PBN footprints or spam content are flagged so they are never contacted and, if already linking, surfaced for a disavow review.

**Pricing basis.** Per seat per month, with prospect volume caps by tier.

### Acceptance criteria

- [ ] Import from Ahrefs and Semrush exports, dedupe against existing links
- [ ] Every prospect receives verdict, type, angle, likelihood and priority
- [ ] Toxic flag agrees with a manual review ≥ 90% on a 200-site benchmark
- [ ] Outreach status tracking per seat, with won links verified by crawl
- [ ] Likelihood recalibrates monthly from logged outcomes

## 11. Module 7: Local SEO Autopilot

For every location in a multi-location business, the autopilot decides each week what needs attention across reviews, Google Business Profile posts, Q&A, categories, photos and citations, and routes the action to the right person or executes it with approval.

**Inputs.** Google Business Profile API (locations, reviews, Q&A, insights, posts), Apple Business Connect, Bing Places, citation data (Yext or BrightLocal export), and Search Console filtered by location pages.

### Decisions per location per week

| Area | Decision | Options |
|---|---|---|
| Reviews | What to do with each new review | Reply with template, reply custom, escalate to manager, flag for removal request |
| Posts | Whether to post and what type | Offer, event, update, none this week |
| Q&A | Answer, flag, or ignore each question | Answer from knowledge base, escalate, mark spam |
| Profile health | Which fields need a fix | Categories, hours, attributes, description, photos, duplicate listing |
| Citations | Which inconsistencies to fix first | NAP mismatch by directory, ranked by impact |
| Priority | Location health score 0 to 100 | Drives the weekly attention list |

**Execution.** Replies and posts are drafted and queued; the brand sets per-location approval rules (auto-publish templated 5-star replies, always review 1 to 2-star replies). Everything executed is logged against the location.

**Reporting.** Per-location and roll-up: health score trend, review velocity and rating, local pack visibility for tracked terms, and actions taken versus outcomes 30 days later.

**Pricing basis.** Per location per month, with volume breaks at 25, 100 and 250 locations.

### Acceptance criteria

- [ ] GBP OAuth for multi-location accounts, locations synced in under 10 minutes
- [ ] Weekly attention list per location with prioritised actions
- [ ] Review replies drafted within 1 hour of a new review, approval rules respected
- [ ] Citation inconsistencies listed by directory with a fix path
- [ ] Outcome loop: actions linked to rating, review volume and local visibility changes

## 12. Cross-cutting requirements

These apply to every module and are built once in the platform layer.

### Decision engine contract

- Every decision is a typed request: a state object, a closed set of options and a question. No free-text prompts in production paths.
- Every response carries option, calibrated probability, top reasons and the model and version used.
- Provider abstraction: TypeSafe Jev as the primary decision model, OpenAI Decisions API as fallback, with an open-source decision model for on-premise or cost-sensitive batches. Switching providers must not change the request format.
- Shadow mode: a new model or threshold runs alongside the live one for 2 weeks before it can take over.

### Confidence and human review

- Thresholds per decision type and per account, defaulting to 0.85 auto, 0.60 review, below that uncertain.
- Irreversible actions (prune, redirect, delete listing, publish reply) always require approval until the account has 90 days of outcome data and the customer opts in.
- Every override is captured as a labelled example with the human's chosen option and optional reason.

### Outcome ledger

- One table for all modules: decision id, module, account, item, option chosen, confidence, model version, executed date, outcome window, outcome label, metric deltas.
- Calibration report per model, per module and per vertical, recomputed weekly: stated confidence versus observed accuracy in 10 buckets.
- Ledger data is anonymised at the aggregate level for cross-account calibration; raw item data never leaves the account.

### Integrations (priority order)

1. Google Search Console, GA4, Google Business Profile (OAuth)
2. CSV import and export everywhere
3. Ahrefs and Semrush exports; API where plans allow
4. WordPress, Webflow, Shopify (read and webhook)
5. Asana, Trello, Notion, Google Docs, Slack (work queue and alerts)
6. Public REST API and webhooks for all verdicts

**Reporting.** Monthly client-ready report per site or brand: decisions made, actions completed, outcomes measured, traffic and visibility change, with the agency's logo on agency plans.

**Security and privacy.** UK and EU data residency, encryption at rest and in transit, Google API scopes limited to read-only except where execution is enabled, OAuth tokens revocable in-app, GDPR data processing agreement available, data deletion within 30 days of cancellation.

### Performance and scale

- First verdicts within 20 minutes of connecting a site up to 100k URLs
- Weekly re-scoring of 100k URLs in under 1 hour
- 99.5% monthly uptime target for the app; batch jobs retried with exponential backoff
- Model cost per 10k decisions under £1 at launch

**Accessibility and platform.** Web app responsive to tablet; WCAG 2.1 AA for core flows; English only at launch.

## 13. Pricing and packaging

Pricing is per module, with the Content Decision Engine as the entry product and bundles for agencies. All prices in GBP, monthly, with 2 months free on annual.

| Module | Unit | Starter | Growth | Scale |
|---|---|---|---|---|
| 1. Content Decision Engine | Per site, by URLs | £79 (≤ 5k URLs) | £199 (≤ 50k) | £399 (≤ 250k) |
| 2. Keyword Intent and Clustering | Per workspace, by keywords a month | £49 (25k) | £99 (100k) | £199 (500k) |
| 3. Programmatic Quality Gate | Per 10k pages scored | £59 per 10k, £99 minimum | £49 per 10k above 50k | Custom above 500k |
| 4. AI Search Visibility Tracker | Per brand, by prompts | £99 (100 prompts, 3 engines) | £249 (300 prompts, 5 engines) | £499 (1,000 prompts, 5 engines, 5 competitors) |
| 5. Content Brief Desk | Per team, by briefs a month | £99 (30 briefs) | £249 (100) | £499 (unlimited) |
| 6. Link Opportunity Filter | Per seat | £39 per seat (500 prospects) | £69 per seat (2,500) | £99 per seat (unlimited) |
| 7. Local SEO Autopilot | Per location | £12 (1 to 24) | £9 (25 to 99) | £6 (100+) |

### Bundles

- Agency: Modules 1, 2 and 5 for up to 10 sites at £499 a month, white-label reports, additional sites £29 each.
- Ecommerce: Modules 1, 3 and 4 for one site at £449 a month.
- All modules, unlimited: £1,499 a month for agencies with over 25 sites.

**Trial and onboarding.** 14-day free trial on Module 1 with full verdicts on up to 1,000 URLs; no card required. Paid onboarding call (£250, refunded on annual) for agencies.

**Unit economics (Module 1, Growth tier).** Model cost for weekly re-scoring of 50k URLs is under £5 a month; crawl and storage under £8; support allocation about £15. Gross margin above 85% at £199.

## 14. Build milestones

We build the web app first and connect to Google later. Customers export their data from Search Console, GA4 and their crawler and upload the files. Google OAuth comes after the app works, so we are not blocked on Google's verification.

We build one milestone at a time. Each milestone ends in a working demo on real data. The next milestone starts only when the current one meets its exit criteria. A Jev production key is available, so decisions run live from the first milestone.

| # | Milestone | Exit criteria |
|---|---|---|
| A1 | Upload and data | Uploading a site's Search Console, GA4 and crawl exports shows every URL with its joined metrics |
| A2 | Verdicts | Every URL has a verdict, reason, confidence and impact range from live Jev decisions |
| A3 | Work queue | Approved verdicts become tasks and export as CSV and a redirect file |
| A4 | Outcomes and report | A later upload labels completed tasks worked, neutral or backfired, and a monthly report prints as PDF |
| A5 | Accounts and launch | Sign-in, billing and hosting are live and the first customer pays |
| A6 | Prove the loop | 30 paying accounts and a calibration error at or below 0.10 |
| A7 | Google connections | Search Console and GA4 OAuth replace uploads once Google approves the app |
| M6 to M8 | Modules 3, 2, then 5 | Each module's acceptance criteria pass |
| M9+ | Modules 4, 6 and 7 | One module per milestone, ordered by customer demand |

### A1. Upload and data

- Next.js app with a local database and a background job runner.
- Sites, each with a list of uploads.
- Search Console upload: the Performance export zip from the Search Console website, or a page and query CSV from Looker Studio, BigQuery or Search Analytics for Sheets. The website export stops at 1,000 rows per table, so larger sites need one of the others.
- A Search Console export with "Compare" turned on gives the previous period, which the decay signals need.
- GA4 upload: the landing page report as CSV.
- Crawl: a built-in sitemap crawler, or a Screaming Frog or Sitebulb CSV.
- Optional backlinks CSV from Ahrefs or Semrush.
- All data joined by normalised URL into one table per site.
- **Exit:** a real site's exports upload in under five minutes and every URL shows clicks, impressions, position, sessions and crawl facts.

### A2. Verdicts

- Hard rules first: protected page types, pages with conversions above threshold and pages under 30 days old are never pruned.
- Metrics computed in code and passed to Jev as named buckets.
- Six-verdict decision per URL from Jev, with reasons and calibrated confidence. A mock stand-in runs when no key is set.
- Cannibalisation on URL pairs sharing three or more top-20 queries. This needs page and query data.
- Confidence router: auto at 0.85 or above, review from 0.60, uncertain below that with the two most likely verdicts.
- Expected 90-day click change as a range from the site's own CTR curve.
- Review screen filtering by verdict, confidence, template and traffic.
- **Exit:** every URL on three real sites has a verdict, and an SEO reviewer agrees with at least 75% of verdicts at 0.8 or above.

### A3. Work queue

- Approve, change or reject each verdict. Every override is saved as a labelled example.
- Prune and Redirect always need explicit approval.
- Tasks with owner, due date, status and a brief per verdict type.
- Export to CSV and redirect files for common platforms.
- **Exit:** a reviewer takes a site from verdicts to an exported task list and redirect file inside the app.

### A4. Outcomes and report

- Marking a task done records the date.
- A later Search Console upload covering 30, 60 or 90 days after that date is compared with the forecast, and the task is labelled worked, neutral or backfired.
- Monthly report per site that prints to PDF.
- **Exit:** every Module 1 acceptance criterion in section 5 passes, except the OAuth connection, which uploads replace until A7.

### A5. Accounts and launch

- Sign-in and one account per agency or company, with several sites each.
- Billing in GBP and the 14-day trial on up to 1,000 URLs.
- Hosting in a UK or EU region, with Postgres in place of the local database.
- **Exit:** the first customer pays.

### A6. Prove the loop

- Crawler capacity raised to 100,000 URLs and weekly re-scoring under one hour.
- Weekly calibration report: stated confidence versus observed accuracy in 10 buckets.
- Shadow mode for new models and thresholds, and OpenAI Decisions as the fallback provider.
- Asana, Trello and Notion exports. Agency white-label reports.
- **Exit:** 30 paying accounts and a calibration error at or below 0.10.

### A7. Google connections

- Search Console and GA4 OAuth with read-only scopes, started as soon as A1 works so verification runs in parallel.
- Scheduled syncs replace manual uploads. Uploads stay available.
- **Exit:** Google approves the app and a customer connects without uploading.

### M6 to M8. Next modules

- **M6, Module 3.** Built first because it reuses the crawler and verdict pattern and no incumbent is strong.
- **M7, Module 2.** Feeds page mapping in Module 1 and brief candidates in Module 5.
- **M8, Module 5.** Uses Modules 1 and 2 as inputs, so it comes after both.
- **Exit for each:** its acceptance criteria pass and it has paying accounts. Together they target £15k MRR by month 12.

### M9 and later. Modules 4, 6 and 7

One module per milestone, in the order customer demand sets.

### Status, 13 October 2026

First working versions of Modules 2 to 7 are in the app. Each one takes uploads or pasted data, asks Jev typed questions, logs every decision and has sample data. Their acceptance criteria have not been measured on real sites yet. Not built yet:

- **Module 3:** WordPress and Webflow webhooks, which need API keys for each account.
- **Module 2:** SERP-shape checks and embeddings, which need a SERP API.
- **Module 4:** live engine runs are switched off until `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY` or `GEMINI_API_KEY` is set. They have not been tested against those providers. AI Overviews capture and daily scheduling are not built.
- **Module 5:** Google Docs and Notion export, which need OAuth.
- **Module 6:** contact finding and sending email.
- **Module 7:** Google Business Profile sync and publishing, which need Google approval, and local-pack rank tracking.

## 15. Risks, dependencies and open questions

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Jev access or pricing changes, or TypeSafe is acquired or loses to OpenAI | Medium | High | Provider abstraction from day one; OpenAI Decisions as live fallback; open-source decision model benchmarked quarterly |
| Decision accuracy below 80% on real sites at launch | Medium | High | Rules for hard constraints, human review tiers, shadow mode, 200-site private beta before public launch |
| Google API quota limits (Search Console 16-month window, GBP rate limits) | Medium | Medium | Incremental sync, caching, per-account quotas, Ahrefs or Semrush as supplementary data |
| AI Overviews tracking breaks when Google changes its interface | High | Medium | Headless browser layer isolated and versioned; alerting on parse failures; degrade to 4 engines rather than fail |
| Customers distrust automated prune and redirect verdicts | High | Medium | Approval required for irreversible actions; show reasons and evidence; publish calibration reports |
| Incumbents (Semrush, Ahrefs, Profound) add verdict features | Medium | Medium | Win on the closed loop and outcome data; move fast on Modules 3 and 4 where no incumbent is strong |
| Solo founder bandwidth across seven modules | High | High | Ship Module 1 only until 30 paying accounts; contract help for crawling and integrations; hire first UK engineer by month 9 |
| Cost blow-up on Module 4 at scale (225k answers a month per brand) | Medium | Medium | Decision model for all parsing; caps per tier; 3-run averaging only on paid plans |

### Dependencies

- TypeSafe Jev API key with production access, and OpenAI Decisions API access
- Google Cloud project with Search Console, Analytics Data and Business Profile APIs approved for OAuth verification
- Crawl infrastructure (own crawler or a hosted crawling API) with 100k URL capacity
- Payment and subscription provider with GBP and EUR support
- UK company formation, bank account and data processing agreement template

### Open questions

- [ ] Does Jev's calibration hold on SEO decisions, or do we need our own calibration layer from day one? Resolve in a 2-week benchmark on 20 real sites.
- [ ] Should Module 1 launch with the built-in crawler or require a Screaming Frog export? Trade-off: time to build versus friction.
- [ ] Is the first vertical ecommerce, SaaS or agencies? Decide from the first 10 trial conversations.
- [ ] What minimum outcome data (accounts × months) is needed before cross-account calibration is defensible?
- [ ] Which endorsing body best fits a UK SaaS with a solo founder, and what traction do they expect at endorsement?
- [ ] Product name and domain.
