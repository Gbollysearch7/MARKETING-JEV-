# Building on Jev: Marketing and Content Products

Working notes and build plan. Version 1.0, 11 October 2026.

Jev is TypeSafe AI's System One model, released 15 September 2026. It does not write text. You send it a `state` (text or JSON) and a set of typed questions, and it returns choices, scores and yes/no probabilities, all evaluated in parallel, each with calibrated confidence, in roughly 100 milliseconds, at $0.042 per million input tokens with free output. That changes the economics of one specific thing: a frontier-quality judgment on a single item (a URL, a keyword, a headline, a review, a proposed action) now costs close to nothing and is fast enough to sit inside a request path or an editor.

This document does four things:

1. Pins down what Jev can and cannot do, from the official docs, so every idea here is buildable.
2. Stress-tests the seven ideas already on the table.
3. Adds new ideas that only make sense now that a judgment is nearly free.
4. Recommends what to build first, in what order, with a reference architecture and a worked API example.

---

## Code

The first 30-day step from section 6 is implemented in [`engine/`](engine/): a TypeScript package with the decision client (pinned model, retries, mock mode), the four versioned question batteries, the rules that turn atomic answers and numeric buckets into verdicts, the linking and cannibalisation module, the publish gate, the financial-promotions compliance gate, the decision log (JSONL and Supabase) and three CLIs. It runs fully offline with a deterministic mock, so you can develop and test before your TypeSafe key arrives.

```bash
cd engine && npm install && npm test
npm run linking -- --dir test/fixtures --mock --top-k 3
npm run publish-gate -- --dir test/fixtures --mock
npm run compliance -- --file test/fixtures/ad-bad.txt --mock
```

See [`engine/README.md`](engine/README.md) for the layout and the live-run commands.

---

## 0. The short version

- **Jev rewards products that need thousands to millions of small, bounded judgments.** It punishes products that need a paragraph, a calculation, or a date comparison. Marketing and content operations are full of the first kind of work and most teams still do it by hand or with slow, expensive LLM calls.
- **The content decision engine (idea 1) is the right platform, and it is the one to build.** But do not start with the Search Console and GA4 audit. Start with the two modules that are most Jev-shaped and can demo in two weeks: a **publish gate** (your idea 3, widened to all content) and a **pairwise internal-linking and cannibalisation engine** (new). They generate the first decision logs, and the decision log is the moat.
- **One new idea deserves to be a product in its own right: a claims and compliance gate for marketing copy in regulated verticals** (finance and prop firms, crypto, health, gambling). You already run a manual version of this for TradersYard with factual-accuracy rules and two review gates. It uses the same engine as the content platform and carries the strongest innovation and safety story for a Tech Nation application.
- **One open-source side project: an action guardrail for AI agents working inside marketing systems** (send campaign, publish post, change budget, delete list). It is cheap to build, highly visible, and feeds both the visa evidence file and the top of your funnel.
- **Everything else on the list is a module, not a company.** Keyword clustering, brief generation, link prospecting and AI-citation tracking all become columns and tabs inside the platform.

---

## 1. What Jev is, in facts you can build on

All figures below are from TypeSafe's documentation and launch post as of 11 October 2026. Links are in the Sources section.

### The three primitives

| Primitive | Question shape | Returns |
|---|---|---|
| **Choice** | Pick one option from a list you define (up to 255 options) | `choice`, `probabilities` over every option, `confidence` |
| **Score** | Place the state on an ordered rubric whose levels you describe | `score`, `probabilities` over levels, `confidence` |
| **Noul** | Is this statement true? | `noul`, a probability from 0 to 1 (no separate confidence; distance from 0.5 is the signal) |

All three can be mixed in one request. Every question is evaluated independently and in parallel against the same state. Adding questions barely changes latency and does not create context rot between questions.

### Operating facts

| Fact | Value |
|---|---|
| Current model | `jev-1.13.0` (aliases `jev-latest`, `jev-preview`) |
| Price | $0.042 per million input tokens; output free |
| Latency | 70 to 500 ms end to end; most queries around 100 ms |
| Context | 64k tokens per request; 32k for state plus the longest single question |
| Rate limits | 100k tokens per second, 80 requests per second (adjusting dynamically during early access) |
| Input | Text only: string, JSON object, or array of text. No images, audio or video |
| Language | English is primary; other languages accepted with lower accuracy |
| Customisation | No fine-tuning. You shape answers through `state`, `instructions` and `criteria` |
| Training | Reinforcement Learning for Calibrated Decisions (RLCD); not trained on customer data |
| Access | TypeSafe API and SDKs (Python, JavaScript), plus Requesty, OpenRouter, Vercel AI Gateway, Lovable; LangChain `TypeSafeClassifier` |

### What Jev will not do well (from the official jaggedness page for 1.13)

| Failure mode | What to do instead |
|---|---|
| Generate text | Use an LLM for briefs, reasons written as prose, rewrites |
| Arithmetic and counting | Compute in code. Pass Jev named buckets, not raw numbers |
| Date and time comparison | Extract date parts with Choice, compare in code |
| Indirection and double negatives | Ask direct, literal questions; point at fields by name with backticks |
| Large state full of irrelevant detail | Filter in code first; send only what the question needs |
| Adversarial content | Do not treat Jev as a security boundary; write precise criteria; test edge cases |
| Contradictory instructions and criteria | Align them; avoid Nouls where true means no |
| Choice option order bias | Shuffle options and check consistency |
| Literal reading | Put boundary cases in the criteria; split interpretive questions into two literal ones |

The practical consequence for a marketing product: **Jev decides, code computes, an LLM writes.** Every architecture below follows that split.

---

## 2. The Jev lens: a fit test for marketing ideas

Score any idea against these seven questions before building. An idea that fails two or more is probably an LLM product wearing a Jev badge.

1. **Is the unit of work a judgment with a bounded answer?** Classify, score, rank, verify, route. Not write, summarise or calculate.
2. **Are there many units?** Thousands to millions of URLs, keywords, ads, replies, pairs. Jev's price only matters at volume.
3. **Does latency matter?** Inside an editor as someone types, inside a publish pipeline, inside a page request. LLM latency made these impossible; 100 ms makes them normal.
4. **Can the numbers stay in code?** Traffic trends, CTR, word counts, dates, spend. If the decision is mostly numeric, you do not need Jev at all.
5. **Can you filter the state to roughly 2k tokens per decision?** Accuracy falls with irrelevant context.
6. **Can you measure outcomes?** Calibration against real results (did the refresh recover traffic, did the headline win) is where the moat forms.
7. **Is a wrong answer recoverable, or gateable by confidence?** High confidence acts, medium flags, low routes to a human.

### Where marketing is full of Jev-shaped work

| Stream | Typical volume | Judgment per item |
|---|---|---|
| URLs on a site | 100 to 1,000,000 | Intent, depth, freshness risk, duplication, verdict |
| Keywords and Search Console queries | 1,000 to 500,000 | Intent, stage, brand, question, page fit |
| SERP results per keyword | 10 per keyword | Format, intent served, authority signals |
| Page pairs (linking, cannibalisation) | n × k after embedding filter | Same intent? Link helpful? Which survives? |
| Ads, headlines, subject lines, CTAs | 10 to 10,000 per team per month | Clarity, promise, stage fit, claim risk, voice fit |
| Email and form replies, DMs | 100 to 100,000 per month | Intent, ICP fit, urgency, objection type |
| Reviews, community posts, mentions | 1,000 to 1,000,000 | Theme, sentiment, feature request, churn signal, brand risk |
| Backlink and PR prospects | 1,000 to 100,000 | Relevance, quality tier, toxic signals, outreach angle |
| Proposed actions by AI agents | 10 to 10,000 per day | Reversible? Blast radius? On plan? Compliant? |

Three product shapes recur across these streams, and the same engine serves all three:

- **Auditor.** Map-reduce over everything you own. Every item gets a verdict. Runs on a schedule.
- **Gate.** A check before an action: before publish, before send, before an agent acts. Runs in real time.
- **Router.** Triage a stream to handlers. Runs on arrival.

---

## 3. Design rules that make or break a Jev product

These follow directly from the docs and from the first month of community builds.

1. **Decompose every broad judgment into atomic questions.** Not "should we refresh this page?" but ten literal questions about intent match, depth, freshness risk and overlap, combined in code. The atomic answers double as the explanation shown to the user. Explainability comes free, without generating text.
2. **Keep every number in code and pass Jev a named bucket.** `click_trend_12m: "declining_sharply"` not `clicks: [412, 398, ...]`.
3. **Filter state hard.** For a URL: title, H1, meta description, headings, first 1,200 characters, top queries, and a handful of computed buckets. Not the whole HTML.
4. **Use embeddings for candidate generation and Jev for the judgment.** Pairwise questions are quadratic. Pick the top 20 to 50 candidates per item with pgvector, then ask Jev about each pair.
5. **Gate on confidence, with thresholds scaled to the stakes.** Auto-apply a low-risk verdict at 0.8. Require a human for a redirect or a prune at 0.9. Route anything under 0.5 to review.
6. **Pin the model version.** Thresholds tuned on `jev-1.13.0` may not hold on the next release. Log the versioned ID the response reports with every decision.
7. **Build the control before the swap.** Log Jev's decision alongside a stronger LLM judge or a human for a week; study the disagreements; measure calibration on your own data (do decisions at 0.8 come out right about 80 percent of the time).
8. **Abstract the decision client.** The request shape (state in, typed probabilities out) already has open-weight imitations and five hosting routes. Code against your own thin interface so you can switch hosts or fall back to an LLM behind TypeSafe's System One adapter.
9. **Store every decision.** The decision log (entity, question, answer, confidence, model version, timestamp) plus the outcome log (what was done, what happened) is the asset that compounds. It becomes training data for a classical model on top of Jev's probabilities, and it is the thing a competitor cannot copy by calling the same API.

---

## 4. Your seven ideas, stress-tested

### Scorecard

Each criterion scored 1 to 5. Build effort is inverted (5 is easiest). Total out of 30.

| # | Idea | Jev fit | Novelty | Demand | Build ease | Moat | Visa story | Total |
|---|---|---|---|---|---|---|---|---|
| 1 | Content decision engine | 4 | 3 | 4 | 2 | 5 | 4 | **22** |
| 2 | Keyword intent and clustering | 4 | 2 | 3 | 3 | 2 | 2 | 16 |
| 3 | Programmatic SEO quality gate | 5 | 4 | 3 | 4 | 3 | 4 | **23** |
| 4 | AI search visibility tracker | 2 | 3 | 4 | 2 | 2 | 4 | 17 |
| 5 | Content brief and editorial desk | 3 | 2 | 3 | 3 | 2 | 2 | 15 |
| 6 | Link and digital PR filter | 4 | 2 | 3 | 3 | 2 | 2 | 16 |
| 7 | Local SEO autopilot | 3 | 2 | 4 | 1 | 2 | 2 | 14 |

### 1. Content decision engine

**Verdict: build it. It is the platform everything else plugs into.**

*Where Jev fits.* Every URL gets a battery of 10 to 20 atomic questions in one call: which intent the page serves, which intent its top queries express, whether the title promises what the queries ask, whether the intro answers directly, how deep the coverage is, whether it shows first-hand experience, whether it makes time-sensitive claims, whether each of its five nearest sibling pages would satisfy the same queries, and which sibling would be the best consolidation home. Every one of those is a bounded judgment.

*What stays in code.* Everything numeric and temporal: click and impression trends, CTR against position-expected CTR, decline percentages, days since last modified, backlink counts, crawl status. These are computed first and passed in as named buckets. The verdict itself (refresh, merge, redirect, prune, expand, leave) is a rule in code over the atomic answers and the buckets. The "expected traffic impact" is a regression on your own historical outcomes with Jev's probabilities as features, not a Jev question. Until you have outcomes, show impact as a labelled heuristic band.

*Where an LLM fits.* Nowhere in the verdict. Optionally for turning the atomic answers into a sentence, though a template over the atomic answers ("Intent mismatch 0.91, depth thin 0.84, clicks down 43 percent in 12 months") is clearer and free.

*The moat.* Outcome tracking with built-in controls. When the engine says "refresh" on 40 pages, act on 30 and hold 10 as a matched control. Eight to twelve weeks later you can separate the effect of the action from the effect of an algorithm update. No audit vendor does this because audits are one-off. A subscription can. The verdict-to-outcome dataset calibrates the engine per site type and becomes the thing you can publish about.

*Risks.* Search Console API quotas and the fact that most sites have thin data per URL. Mitigate by aggregating at the query-cluster level and by letting the crawl-only tier work without GSC. Attribution noise, handled by the control groups above.

*Pricing reality.* £79 to £399 a month is right for in-house teams. Agencies will want per-site pricing and white-label reports; that is your channel, not your competitor.

*Build sequence.* Do not start with the OAuth flows and the dashboards. Start with the two modules below (idea 3 and new idea N2) which produce value from a crawl alone, then add GSC and GA4 for the full verdict layer.

### 2. Keyword intent and clustering platform

**Verdict: a module inside idea 1, not a standalone product.**

*Where Jev fits.* Per-keyword Choice for intent (informational, commercial investigation, transactional, navigational, local), Choice for buying stage, Noul for "is a question", Noul for brand versus non-brand, Choice for expected content format. And the strongest piece: **Choice over up to 255 existing pages to answer "which page on this site deserves this keyword?"** That gives you page mapping and cannibalisation warnings in one question.

*What stays in code.* Volume, difficulty, SERP overlap counts, and the clustering itself. Fifty thousand keywords is 1.25 billion pairs; pairwise Jev is not an option. Cluster with embeddings and SERP overlap in code, then use Jev to verify membership of borderline keywords and to label each cluster's intent and stage.

*Why not standalone.* Keyword clustering is a crowded, price-compressed category (Keyword Insights, Keyword Cupid, the clustering tabs in SE Ranking and Semrush). Jev lets you undercut on price, but price is not a moat when the API contract has open clones. The defensible version is clustering that is already mapped to the client's pages and verdicts, which is idea 1.

### 3. Programmatic SEO quality gate

**Verdict: build it first, widened into a general publish gate. It is the fastest MVP on the list and the most Jev-shaped.**

*Where Jev fits.* Before a page publishes, one call with a battery: Score for depth against the page's own title promise; Noul for "does this page substantively differ from each of its five nearest template siblings" (pairwise against embedding neighbours); Noul for "makes a claim a reader could not verify from the page"; Noul for "would a person with this query find this page useful"; Nouls for brand risk; Choice for the final index, improve or kill. All of it in roughly 100 ms per page, which means it runs inside the generation pipeline as a CI step, not as a weekly report.

*What stays in code.* Word counts, template fill ratios, shingling-based duplicate ratios, structured data checks, prohibited-term regexes. Your existing TradersYard gates (no placeholder text, no banned topics, no em dashes) are code checks and stay that way.

*Why widen it.* The same battery is a QA gate for any AI-generated article, any agency draft, any translation. "Programmatic SEO" is the sharp wedge; "publish gate for high-volume content" is the market.

*Pricing.* Per 10k pages checked, with a free tier generous enough that indie pSEO builders talk about it. An API plus a GitHub Action is the distribution. Sell the dashboard to teams.

*Honest risk.* Some buyers will use a quality gate to make spam that passes. Position explicitly as "kill what is thin" with public thresholds aligned to Google's helpful-content guidance. That positioning is also what makes it a credible visa story.

### 4. AI search visibility tracker

**Verdict: a column in idea 1, not a product. Weak Jev fit, crowded market.**

*Where Jev fits.* Given an AI answer (ChatGPT, Claude, Perplexity, Google AI Overviews) as state: Noul "is the brand cited", Choice "which cited source is primary", Score for sentiment toward the brand, and a battery over each cited competitor page to explain why it wins (answers the query in its first paragraph, has original data, shows an author, has FAQ structure, is a community thread). Aggregating those across queries in code gives you "citation drivers" and a recommended fix.

*Why weak fit.* The hard, expensive part is collecting the AI answers at scale and keeping within platform terms. Jev's cheapness barely moves that cost. And the category already has well-funded players (Profound, Peec, Otterly, Scrunch, plus the AI toolkits in Semrush and Ahrefs).

*What to do instead.* Add an "AI citation" signal to the per-URL verdict in idea 1 for the client's top 50 queries. It strengthens the platform's story (the same decisions that help you rank help you get cited) without taking on a data-acquisition business.

### 5. Content brief and editorial decision desk

**Verdict: the downstream action of idea 1. Jev decides, an LLM writes.**

*Where Jev fits.* The decisions: go or no-go for a keyword given the SERP state (Noul "does this site plausibly have the authority to rank here"), Choice of format from what the SERP rewards, Choice of angle among candidate angles generated by an LLM, Score for length band, Noul per candidate source for "worth citing". Then it gates the LLM-written brief with the same publish-gate battery.

*Why not standalone.* Brief writing is commoditised (Surfer, Frase, Clearscope, and every LLM wrapper). The decision layer is the differentiator, and the decision layer is idea 1. Ship this as the "expand" and "create" actions inside the engine.

### 6. Link and digital PR opportunity filter

**Verdict: a module. Good Jev fit, little novelty, expensive data.**

*Where Jev fits.* Per prospect: Noul for topical relevance to the client, Choice for site type (news, independent blog, directory, link farm, forum), Score for editorial quality, Nouls for toxic signals (sells links, thin templated posts, unrelated outbound links), Choice for the best outreach angle. Per unlinked mention: Noul "worth claiming". Per competitor backlink: Noul "replicable".

*What stays in code.* Domain rating, traffic, spam scores from Ahrefs (you have the API key), anchor distributions.

*Why not standalone.* Outreach platforms (Pitchbox, BuzzStream, Respona) already own the workflow and will add a classifier. Ahrefs API costs dominate the unit economics. Add it to the platform when a client asks.

### 7. Local SEO autopilot

**Verdict: skip for now. Heaviest integration, strongest incumbents, least lived experience.**

*Where Jev fits.* Per review: sentiment, theme, "needs a response", "violates platform policy and is worth reporting". Per location per week: Choice of the single most valuable action.

*Why skip.* Google Business Profile API access and approval, review-platform integrations, and incumbents with sales teams (Birdeye, Yext, SOCi, Podium). NAP consistency is string comparison in code, not a judgment. The Jev-shaped part is small relative to the integration work, and it is not the problem you have lived.

---

## 5. New ideas

Scored the same way. These are ideas that only make sense because a judgment is now nearly free and fast enough for real time.

| # | Idea | Jev fit | Novelty | Demand | Build ease | Moat | Visa story | Total |
|---|---|---|---|---|---|---|---|---|
| N1 | Claims and compliance gate for marketing copy | 5 | 4 | 4 | 3 | 4 | 5 | **25** |
| N2 | Pairwise internal-linking and cannibalisation engine | 5 | 4 | 4 | 4 | 3 | 3 | **23** |
| N3 | Creative pre-flight and real-time copy linter | 4 | 3 | 4 | 3 | 4 | 4 | 22 |
| N4 | Action guardrail for marketing AI agents (open source) | 5 | 5 | 3 | 4 | 2 | 5 | **24** |
| N5 | Inbound and reply triage for marketing and sales ops | 5 | 2 | 4 | 4 | 2 | 2 | 19 |
| N6 | Community, review and UGC intelligence | 5 | 2 | 3 | 3 | 2 | 2 | 17 |
| N7 | Edge personalisation decider | 4 | 4 | 3 | 2 | 3 | 4 | 20 |

### N1. Claims and compliance gate for marketing copy

**The lint step for marketing in regulated verticals.** Every ad, email, landing page, blog post and social post is checked before it ships against a battery of atomic questions encoded from the relevant rulebook: Does it promise a guaranteed outcome? Does it imply the product is risk-free? Does it use a superlative ("best", "number one") without substantiation on the page? Does it cite a statistic without a source? Is the required risk warning present (Noul) and prominent rather than buried (Score)? Does it name a competitor in a comparative claim? Does a testimonial imply typical results? Does it manufacture urgency with a deadline that is not real? For finance: does it present past performance as indicative of future results? For health: does it make a disease claim?

*Why it is Jev-shaped.* Dozens of literal yes/no questions per piece, in one call, in 100 ms, so it works as you type in the editor and as a hard gate in the pipeline. Confidence gates the behaviour: high-confidence clean passes silently, medium flags the sentence, low routes to a reviewer. Every flag is explainable because it is a named question.

*Why you.* TradersYard is a financial-promotions environment. You wrote the factual-accuracy rules, the two review gates, and the verified-facts source of truth by hand because no tool did it. The rulebooks (UK FCA financial promotions and the ASA CAP code, EU rules for your Vienna entity, FTC for US clients) become criteria libraries, which is both the work and the moat.

*What stays in code.* Presence of an unsubscribe link, sender identity, regex for banned terms, character limits, reading age.

*Positioning and risk.* It assists reviewers; it is not legal advice and must say so. Jev's documented weakness on adversarial text means a motivated copywriter could phrase around it; that is acceptable for an assistive gate and unacceptable for a legal guarantee, so never sell the latter. Price per workspace with seats, higher than SEO tooling because the buyer is avoiding fines and ad-account bans.

*Visa angle.* Safety and trust in AI-assisted marketing, aligned to UK regulators, built on a new model class. This is the strongest "innovation" narrative in this document.

### N2. Pairwise internal-linking and cannibalisation engine

**The first thing Jev's price makes possible that was not possible before.** Internal linking and cannibalisation are pairwise problems: for every page, which other pages should it link to, with what anchor, and which pages compete with it for the same intent. Existing tools do this with keyword matching (Link Whisper) or entity graphs (InLinks). A semantic judgment on every candidate pair was too expensive; now it costs about two dollars per thousand pages.

*How it works.* Embed every page (pgvector). For each page, take the top 30 candidates. For each pair, one Jev call with: Noul "would a reader of `page_a` at `paragraph_i` benefit from a link to `page_b`", Noul "does `page_b` target the same primary intent as `page_a`", Choice over anchor phrases extracted in code from `page_a`, and when overlap is high, Choice "which page should survive: a, b, or merge into a new page". Output: a link plan with anchors and insertion points, a cannibalisation list with a recommended direction, and a confidence on every row.

*Why first.* It needs only a crawl, demos in minutes on any site, has an obvious before-and-after, and is the thing you fixed by hand at TradersYard. It produces the first decision logs for the platform.

### N3. Creative pre-flight and real-time copy linter

**Score 500 headline or subject-line variants in seconds, and lint copy as it is typed.** Decomposed rubric per variant: single clear promise, specificity, curiosity without clickbait, match to the stated awareness stage, brand-voice fit against a voice guide in the state, spam-trigger likelihood for email, and the compliance flags from N1. Each variant gets sub-scores and an aggregate computed in code, which makes the ranking explainable.

*Why now.* Predictive copy scoring exists (Anyword, Persado, Phrasee) at enterprise prices with opaque scores. Jev's version is cheap, explainable, and real-time enough to live in the editor, which the LLM-latency generation of tools could not do.

*The moat.* Connect Meta and Google Ads, Brevo, Omnisend, Klaviyo. Learn which sub-scores actually predict CTR and open rate for each account; recalibrate thresholds from outcomes. Note that competitor ad-library classification is already shipped by others (StealAds and similar); build pre-flight and outcome learning, not another ad library.

### N4. Action guardrail for marketing AI agents (open source)

**Auto mode for agents that touch marketing systems.** When an AI agent proposes an action (send this campaign to this segment, raise this budget, pause these ads, publish this post, delete this list, change this DNS record), Jev classifies it: Choice for reversibility, Score for blast radius (audience size bucketed in code), Noul "is this action consistent with the stated plan", Noul for brand risk, Noul for compliance risk (reusing N1 criteria). Code combines these into approve, confirm or block.

*Why it is novel.* LangChain's AutoModeMiddleware and the community's Jevvy do this for shell commands. Nobody has done it with marketing stakes and marketing rulebooks, and agents are arriving in marketing stacks now (HubSpot, Meta, Google, Brevo, Omnisend all have agent surfaces or MCP servers).

*Why open source.* Distribution and recognition. Ship it as middleware for LangChain and as a hook for Claude Code and MCP-based agents. Stars, forks and adoption are visa evidence; users of it are leads for N1.

### N5. Inbound and reply triage for marketing and sales ops

Form fills, chat messages, email replies and social DMs classified for intent, ICP fit against criteria in the state, urgency, objection type and language, then routed to a sequence or a person. Very strong Jev fit and immediate demand, but email triage was one of the first public Jev demos and every CRM is adding it. Build only as a module if a client needs it.

### N6. Community, review and UGC intelligence

Map-reduce over every review, Reddit thread, Discord message and support ticket: theme, sentiment, feature request, churn signal, competitor mention, brand risk, response priority. Aggregated weekly into decisions. Jev makes indie pricing possible against enterprise incumbents (Brandwatch, Sprinklr). Low novelty; good module for a community-heavy client such as a trading firm's Discord.

### N7. Edge personalisation decider

At request time, pass visitor context (referrer, UTM, prior pages, device, country) plus candidate variants, and let a Choice pick the headline, CTA or offer with confidence; fall back to the default below a threshold; log outcomes and feed a bandit. Jev's 100 ms fits an edge render budget for below-the-fold or streamed sections, but adds latency to the critical path if used carelessly. Innovative and visa-friendly, but it competes with Mutiny and Optimizely and needs privacy care. Park it until the platform has customers.

---

## 6. What to build, in what order

**Build one engine with two front doors.** The engine is: question batteries over content, confidence-gated routing, a decision log, and an outcome loop. The first front door is content operations (ideas 1, 3, N2, with 2, 5, 6 and the AI-citation column as later modules). The second front door is the compliance gate (N1). The open-source guardrail (N4) is the public face.

**Lead with the content operations door** because you can dogfood it today on 118 published posts and a live SEO mandate, the outcome data starts accruing immediately, and SEO buyers are easy to reach from where you already are. Open the compliance door in months four to six on the same engine.

**Flip the order only if the visa timeline dominates.** If you need innovation evidence within six months, lead with N1 and N4, because they read as safety and novelty to an assessor in a way an SEO audit tool does not.

### First 30 days

- Decision client: a thin TypeScript interface over the TypeSafe SDK with version pinning, logging of the reported model ID, and a fallback route (Requesty or Vercel gateway, and TypeSafe's System One LLM adapter).
- Crawl and embed: Firecrawl or your own crawler into Supabase with pgvector.
- Module A, publish gate: the battery in section 4.3 as an API endpoint and a GitHub Action. Run it over the TradersYard drafts folder on day one.
- Module B, linking and cannibalisation: the pairwise flow in N2. Run it over the live blog and compare with the manual fixes you already made; that comparison is your first case study.
- Decision log and outcome log tables (schema in section 7).
- Calibration check: pick 200 pairs, judge them with a strong LLM and by hand, bucket Jev's probabilities, and see whether 0.8 means 80 percent.

### Days 30 to 60

- Search Console and GA4 OAuth; per-URL buckets computed in code; the full verdict battery (section 8) and the verdict rules.
- Work queue with "act" and "hold as control" on each verdict, and a scheduled outcome check at 8 and 12 weeks.
- First five external sites, at least two through an agency.
- Publish the benchmark: a public set of content decisions (verdicts, link pairs, cannibalisation pairs) with Jev, two LLM judges and human SEO labels, with calibration plots. This is both marketing and visa evidence.

### Days 60 to 90

- Open-source N4 as LangChain middleware and a Claude Code hook, using a first compliance criteria set for financial promotions.
- Pricing live: free tier on the publish gate, £79 to £399 for the platform, per-site pricing for agencies.
- Start the N1 criteria libraries (UK FCA financial promotions and CAP code first) inside the same engine.

---

## 6b. How the product looks, screen by screen

One workspace per site or brand. Six screens. Every row on every screen carries a verdict, a confidence, and the atomic answers that produced it, so nothing is a black box.

**1. Overview.** A single page per workspace. Top row: pages crawled, verdicts by type (refresh, merge, redirect, prune, expand, leave), open items in the queue, and what changed since the last nightly run. Below it, the outcome strip: for every verdict applied eight or more weeks ago, applied versus held-as-control, with click delta. This is the screen that proves the subscription pays for itself.

**2. Verdict queue.** A table of URLs sorted by expected impact. Columns: URL, verdict, confidence, reasons (chips such as "intent mismatch 0.82", "thin 0.77", "clicks down 43 percent"), impressions band, and two buttons: Apply and Hold as control. Clicking a row opens the evidence panel: the filtered state that was sent, every atomic answer with its probability bar, and the rule that fired. A low-confidence verdict shows a "needs review" badge and cannot be auto-applied.

**3. Link plan.** Left: the source page with paragraphs numbered. Right: suggested links, each with target page, anchor phrase, insertion paragraph, and the two probabilities behind it (reader benefit, same intent). Accept, edit anchor, or dismiss. A separate tab lists cannibalisation pairs with the recommended survivor and a merge direction. Export as CSV or push directly to Webflow or WordPress.

**4. Publish gate.** Looks like a CI check. A list of drafts or generated pages, each with pass, flag or block, and the failing questions named. Filters for thin, duplicate, unverifiable claim, brand risk. Click through to the draft with flagged sentences highlighted. The same view is exposed as an API and a GitHub Action status, so pipelines block automatically on "kill".

**5. Compliance gate (second front door).** The editor view: copy on the left, a live lint panel on the right that updates as you type (roughly 100 ms per check). Each flag names the rule family (guaranteed outcome, missing risk warning, unsubstantiated superlative, fake urgency), shows the probability, and quotes the sentence. Workspace settings choose the criteria library (UK FCA financial promotions, CAP code, FTC, health). A reviewer queue collects medium-confidence flags for a human.

**6. Decision log and calibration.** For the owner, not the marketer. Every decision ever made, filterable by model version and criteria set. A calibration chart per question: predicted probability on the x-axis, observed accuracy against outcomes or human labels on the y-axis. Threshold sliders per verdict type show how many items would move between auto, review and blocked. This is the screen you screenshot for the visa file and for the benchmark post.

### How a run works, end to end

1. Nightly, or on demand, the worker crawls changed pages and re-embeds them.
2. For each page, code computes the numeric buckets (trend, CTR band, position band, staleness) from Search Console and GA4.
3. Code assembles a filtered state and the versioned question battery, and calls Jev once per page and once per candidate pair.
4. Code combines the answers into a verdict with the rule set, stores every atomic answer in the decision log, and places the verdict in the queue.
5. The user applies or holds each verdict. Applied verdicts push changes through the CMS connector or export a task list.
6. At eight and twelve weeks the worker records outcomes for applied and held items, and the calibration screen updates.

## 7. Reference architecture

Stack matches your preference: Next.js and Supabase.

```
Next.js (app, API routes, GitHub Action client)
   |
   |-- Decision client (thin interface)
   |      |-- TypeSafe SDK  -> jev-1.13.0 (pinned)
   |      |-- Fallback route -> Requesty / Vercel AI Gateway
   |      |-- LLM fallback   -> System One LLM adapter (same contract)
   |
   |-- LLM client (Claude) -> briefs, prose reasons, angle candidates only
   |
Supabase (Postgres)
   |-- pages, keywords, queries, pairs          (entities)
   |-- embeddings (pgvector)                    (candidate generation)
   |-- decisions                                (every Jev answer)
   |-- verdicts                                 (code-combined outcome per entity)
   |-- actions                                  (what the user did, or held as control)
   |-- outcomes                                 (metrics at +8w and +12w)
   |-- criteria_sets                            (versioned question batteries)
   |
Workers (Inngest, Trigger.dev or pg_cron)
   |-- crawl -> filter -> embed -> ask -> combine -> log
   |-- scheduled outcome checks
Connectors
   |-- Search Console, GA4, Ahrefs, Webflow/WordPress, Meta/Google Ads, Brevo/Omnisend
```

### Decision log schema (minimum)

```sql
create table decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  entity_type text not null,        -- 'page' | 'pair' | 'keyword' | 'copy' | 'action'
  entity_id text not null,
  criteria_set_version text not null,
  model_version text not null,      -- as reported in the response, e.g. 'jev-1.13.0'
  question_key text not null,
  answer jsonb not null,            -- choice/score/noul + probabilities
  confidence numeric,               -- derived for nouls as |2p-1|
  state_hash text not null,         -- to dedupe and to audit what was sent
  created_at timestamptz default now()
);

create table verdicts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  verdict text not null,            -- 'refresh' | 'merge' | 'redirect' | 'prune' | 'expand' | 'leave'
  rule_version text not null,
  min_confidence numeric,
  reasons jsonb not null,           -- the atomic answers that fired
  created_at timestamptz default now()
);

create table actions (
  id uuid primary key default gen_random_uuid(),
  verdict_id uuid references verdicts(id),
  status text not null,             -- 'applied' | 'held_as_control' | 'rejected'
  applied_at timestamptz
);

create table outcomes (
  id uuid primary key default gen_random_uuid(),
  action_id uuid references actions(id),
  horizon_weeks int not null,       -- 8 or 12
  clicks_delta_pct numeric,
  impressions_delta_pct numeric,
  position_delta numeric,
  measured_at timestamptz default now()
);
```

### The calibration loop

1. Every verdict stores the atomic answers and the model version.
2. Every verdict is either applied or held as a matched control.
3. Outcomes are measured at fixed horizons for both groups.
4. A small classical model (logistic regression is enough to start) learns which atomic probabilities predict a positive outcome per site type, following TypeSafe's AutoResearch cookbook pattern.
5. Thresholds and verdict rules are re-tuned per model version. When TypeSafe ships a new Jev, you re-run the labelled set before moving the pin.

---

## 8. Worked example: the per-URL verdict request

The request shape below follows the documented API (`POST /v1/systemone` with `model`, `state`, `questions`). Verify field names against the API reference before shipping; the point here is the decomposition.

Everything numeric has already been computed in code and passed as a bucket. Sibling pages are the five nearest by embedding.

```json
{
  "model": "jev-1.13.0",
  "state": {
    "page": {
      "url": "/blog/what-is-a-prop-firm",
      "title": "What Is a Prop Firm? A Plain-English Guide",
      "h1": "What is a prop firm?",
      "meta_description": "Prop firms explained: how funded accounts work, what evaluations test, and what traders actually get paid.",
      "headings": ["How prop firms make money", "Evaluations and challenges", "Profit splits", "Risks for traders"],
      "intro": "A proprietary trading firm, or prop firm, gives traders access to a funded account in exchange for passing an evaluation ... (first 1,200 characters)",
      "author_shown": true,
      "last_updated_text": "Updated January 2025"
    },
    "search": {
      "top_queries": ["what is a prop firm", "prop firm meaning", "how do prop firms work", "prop firm vs broker"],
      "ctr_band": "below_expected_for_position",
      "position_band": "page_one_lower_half",
      "click_trend_12m": "declining_sharply",
      "impressions_band": "high"
    },
    "sibling_pages": [
      {"key": "s0", "url": "/blog/prop-firm-explained", "title": "Prop Firms Explained for Beginners"},
      {"key": "s1", "url": "/blog/how-prop-firms-work", "title": "How Prop Firms Work in 2025"},
      {"key": "s2", "url": "/blog/prop-firm-vs-broker", "title": "Prop Firm vs Broker: Key Differences"},
      {"key": "s3", "url": "/blog/funded-trading-accounts", "title": "Funded Trading Accounts: The Basics"},
      {"key": "s4", "url": "/blog/prop-firm-challenge-tips", "title": "10 Tips to Pass a Prop Firm Challenge"}
    ]
  },
  "questions": {
    "page_intent": {
      "type": "choice",
      "instructions": "Which search intent does `page` primarily serve, judging from `page.title`, `page.h1`, `page.headings` and `page.intro`?",
      "criteria": {
        "informational": "Explains a concept or answers a question; no purchase step on the page",
        "commercial_investigation": "Compares options or helps the reader choose between providers",
        "transactional": "Leads directly to signing up, buying or starting an evaluation",
        "navigational": "Exists mainly so a reader can reach a specific brand page"
      }
    },
    "query_intent": {
      "type": "choice",
      "instructions": "Which search intent do the queries in `search.top_queries` primarily express?",
      "criteria": {
        "informational": "The searcher wants an explanation or definition",
        "commercial_investigation": "The searcher is comparing options before choosing",
        "transactional": "The searcher wants to sign up or buy now",
        "navigational": "The searcher is looking for a specific brand or page"
      }
    },
    "title_matches_queries": {
      "type": "noul",
      "instructions": "Does `page.title` directly promise an answer to `search.top_queries[0]`?"
    },
    "intro_answers_directly": {
      "type": "noul",
      "instructions": "Does `page.intro` give a direct answer to `search.top_queries[0]` within its first two sentences, before any background?"
    },
    "depth": {
      "type": "score",
      "instructions": "How thoroughly do `page.headings` and `page.intro` cover what a reader asking `search.top_queries[0]` would want to know?",
      "criteria": [
        "Thin: restates the question or gives a one-line definition with no specifics",
        "Partial: covers the basics but misses obvious sub-questions such as costs, rules or risks",
        "Thorough: covers the basics and the obvious sub-questions with concrete specifics"
      ]
    },
    "shows_first_hand_experience": {
      "type": "noul",
      "instructions": "Does `page.intro` contain evidence of first-hand experience, such as specific results, screenshots described, or named personal examples, rather than general explanation only?"
    },
    "contains_time_sensitive_claims": {
      "type": "noul",
      "instructions": "Does `page.intro` or any item in `page.headings` make a claim about prices, rules, rankings or a specific year that is likely to become outdated within a year?"
    },
    "overlap_s0": {"type": "noul", "instructions": "Would `sibling_pages[0]` satisfy the same `search.top_queries` as `page`, judging by its title?"},
    "overlap_s1": {"type": "noul", "instructions": "Would `sibling_pages[1]` satisfy the same `search.top_queries` as `page`, judging by its title?"},
    "overlap_s2": {"type": "noul", "instructions": "Would `sibling_pages[2]` satisfy the same `search.top_queries` as `page`, judging by its title?"},
    "overlap_s3": {"type": "noul", "instructions": "Would `sibling_pages[3]` satisfy the same `search.top_queries` as `page`, judging by its title?"},
    "overlap_s4": {"type": "noul", "instructions": "Would `sibling_pages[4]` satisfy the same `search.top_queries` as `page`, judging by its title?"},
    "best_consolidation_target": {
      "type": "choice",
      "instructions": "If `page` were merged into one of `sibling_pages`, which sibling is the best home for its content?",
      "criteria": {
        "s0": "Prop Firms Explained for Beginners",
        "s1": "How Prop Firms Work in 2025",
        "s2": "Prop Firm vs Broker: Key Differences",
        "s3": "Funded Trading Accounts: The Basics",
        "s4": "10 Tips to Pass a Prop Firm Challenge",
        "none": "No sibling is a suitable home; the page should stay separate"
      }
    },
    "misleading_outcome_claim": {
      "type": "noul",
      "instructions": "Does `page.intro` state or imply that a trader is guaranteed, or very likely, to get funded or to profit?"
    }
  }
}
```

Combining the answers in code (TypeScript sketch):

```ts
type Answers = Record<string, { choice?: string; score?: number; noul?: number; confidence?: number }>;

function verdictFor(a: Answers, m: Metrics, siblings: SiblingMetrics[]): Verdict {
  const sure = (q: string, t = 0.6) => (a[q].confidence ?? Math.abs(2 * (a[q].noul ?? 0.5) - 1)) >= t;

  const intentMismatch = a.page_intent.choice !== a.query_intent.choice && sure("page_intent") && sure("query_intent");
  const thin = (a.depth.score ?? 2) < 1 && sure("depth");
  const overlaps = siblings.filter((_, i) => (a[`overlap_s${i}`].noul ?? 0) > 0.8);
  const strongerSibling = overlaps.find((s) => s.clicks12m > m.clicks12m * 1.5);
  const stale = m.clickTrend12m === "declining_sharply" && (a.contains_time_sensitive_claims.noul ?? 0) > 0.7;
  const dead = m.clicks12m === 0 && m.impressions12m < 50 && m.referringDomains === 0;

  if (strongerSibling) {
    const target = a.best_consolidation_target;
    return target.choice !== "none" && (target.confidence ?? 0) > 0.7
      ? { verdict: "merge", into: target.choice, needsReview: false }
      : { verdict: "merge", into: null, needsReview: true };
  }
  if (dead) return { verdict: "prune_or_redirect", needsReview: true };          // irreversible: always review
  if (intentMismatch && m.impressions12m > 500) return { verdict: "rewrite_for_intent", needsReview: false };
  if (thin && m.impressions12m > 500) return { verdict: "expand", needsReview: false };
  if (stale) return { verdict: "refresh", needsReview: false };
  return { verdict: "leave", needsReview: false };
}
```

The `reasons` column is simply the atomic answers that fired, rendered as "Query intent informational, page intent commercial (confidence 0.82); depth thin (0.77); clicks down 43 percent in 12 months". No text generation, fully auditable, and the same fields feed the calibration model later.

---

## 9. Economics

Token counts are estimates for a hard-filtered state as in section 8 (roughly 2.5k tokens of state plus 1k of questions). Measure on your own data.

| Workload | Decisions | Tokens | Jev cost | Wall time at 100k tokens/s |
|---|---|---|---|---|
| Full-site verdict, 10k URLs | 10k calls, 13 questions each | ~35M | ~$1.50 | ~6 minutes |
| Linking and cannibalisation, 1k pages × 30 candidates | 30k pair calls | ~45M | ~$1.90 | ~8 minutes |
| Publish gate, 50k programmatic pages | 50k calls | ~125M | ~$5.25 | ~21 minutes |
| Copy pre-flight, 500 variants × 8 rubric questions | 500 calls | ~0.5M | ~$0.02 | seconds |
| Compliance gate, 2k pieces a month | 2k calls | ~4M | ~$0.17 | real time |

Two implications. First, model cost is a rounding error at every price point above, so price on value and on the data you accumulate, not on tokens. Second, a full-site run completes in minutes, which means "continuous" is literal: re-evaluate nightly and show the user what changed.

TypeSafe's own headline comparison (193.6× faster, 444.6× cheaper than frontier LLMs on their workflow evals) is vendor-run and, by their own note, at the upper end of real-world gains. Benchmark the swap on your workload before quoting it.

---

## 10. What is already crowded or already shipped

Avoid building a demo someone shipped in launch week.

| Already public on Jev (Sept 2026) | Who | Implication |
|---|---|---|
| Ad library classification (724 ads, 37 brands, 40 seconds, 9 cents) | Matthew Berman, heading into StealAds | Build pre-flight and outcome learning, not another ad library |
| Newsjacking triage (384 headlines for 15 brands, $0.19) | Elvis Sun | Fine as a module; not a company |
| Email triage at scale | Ryan Vogel and others | N5 is a module |
| Browser agents (Browser Use, Hunch, Cline, Browserbase) | Several | Not your lane |
| Permission gating for coding agents (Jevvy, LangChain AutoMode) | Community, LangChain | N4 is the marketing-specific version; cite them as prior art |
| Judge replacement and eval arenas (JevArena, JevGraph) | Community | Your content-decisions benchmark follows this pattern in a new domain |
| Open-weight imitations of the API contract (Laya and others) | r/LocalLLaMA | The contract is not a moat; your criteria libraries and outcome data are |

Crowded without Jev: keyword clustering, brief writing, AI visibility tracking, local SEO suites, outreach platforms. Enter those only as modules.

---

## 11. The Tech Nation angle

Assessors look for evidence of innovation, impact and recognition in digital technology. Concrete artefacts this plan produces:

- A shipped product on a new model class (System One) with paying users and measurable outcomes (traffic recovered, pages consolidated, compliance flags caught before publication).
- An open-source guardrail with adoption metrics (stars, forks, downloads, named teams using it).
- A public benchmark of content and compliance decisions comparing Jev, LLM judges and human experts, with calibration analysis. Benchmarks get cited.
- Talks and posts on applying decision models to marketing safety and content operations, a topic with almost no literature yet.
- Letters from agency and brand users describing the before and after.

The compliance gate (N1) and the agent guardrail (N4) carry the innovation and safety narrative. The content platform carries the impact and revenue narrative. Build both on one engine and the file writes itself.

---

## 12. Risks and dependencies

- **Early access.** Jev is in early access with dynamic rate limits and a waitlist. Mitigate with the decision-client abstraction, a gateway route, and the System One LLM adapter so the product keeps working if limits bite.
- **Alias drift.** `jev-latest` moves when a release ships. Pin `jev-1.13.0`, log the reported version, re-run the labelled set before moving.
- **English first.** Non-English content gets lower accuracy. Gate harder on confidence for non-English workspaces and say so in the UI.
- **Adversarial text.** Jev does not treat state as hostile. The compliance gate is assistive, never a guarantee; the agent guardrail is defence in depth, never the only control.
- **Vendor concentration.** One model, one company. The open clones and the adapter mean the request shape survives even if the vendor does not.
- **Search is changing.** SEO tooling faces a shrinking pie as answers move into AI surfaces. The decisions this engine makes (is this page the clearest, most direct, most trustworthy answer to this query) are the same decisions that drive AI citation, which is why the AI-citation column belongs in the platform.
- **Legal positioning for N1.** Clear disclaimers, a human in the loop by default, and criteria libraries reviewed by a compliance professional before launch in each vertical.

---

## 13. Sources

- TypeSafe AI, "Introducing System One Models & Jev" (launch post): https://typesafe.ai/blog/introducing-system-one-models-and-jev
- TypeSafe docs, Introduction: https://docs.typesafe.ai/introduction
- TypeSafe docs, Models (pricing, limits, aliases): https://docs.typesafe.ai/models
- TypeSafe docs, Confidence: https://docs.typesafe.ai/confidence
- TypeSafe docs, State: https://docs.typesafe.ai/concepts/state
- TypeSafe docs, How to build with TypeSafe: https://docs.typesafe.ai/concepts/how-to-build-with-system-one
- TypeSafe docs, Patterns (fan-out, confidence routing, composite scoring, intent routing): https://docs.typesafe.ai/patterns
- TypeSafe docs, Jev 1.13 jaggedness (failure modes): https://docs.typesafe.ai/model-jaggedness/jev-1.13
- TypeSafe, System One LLM adapter (fallback that returns the same contract from an LLM): https://github.com/typesafe-ai/system-one-adapter-python
- LangChain, "Building a Harness with Jev" (TypeSafeClassifier, model routing, AutoModeMiddleware): https://www.langchain.com/blog/building-a-harness-with-jev
- Requesty, "TypeSafe Jev explained" (pricing, access, early demos): https://www.requesty.ai/blog/typesafe-jev-explained
- Requesty, "Jev, week two" (gateways, community builds, open clones, evaluation advice): https://www.requesty.ai/blog/jev-week-two-four-gateways-open-clones-what-builders-shipped

---

*Next revision: add the calibration results from the first 200-pair check, and the TradersYard before-and-after for the linking module.*
