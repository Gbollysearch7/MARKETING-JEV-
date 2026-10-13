import { randomUUID } from "node:crypto";
import { JsonlSink, fetchPages, fetchSitemapUrls, runLinking, runPublishGate } from "@jev-marketing/engine";
import { clientFor } from "./engine";
import { createRun, decisionsPath, getRun, saveSite, updateRun, writeArtifact, type Run, type Site, type StoredLink } from "./store";

const PRICE_PER_MTOK = 0.042;
const active = new Set<string>();

export function isActive(runId: string): boolean {
  return active.has(runId);
}

/** Creates the run record and executes the pipeline in the background. Returns immediately. */
export async function startRun(site: Site): Promise<Run> {
  const { client, mode } = clientFor(site.mode);
  const run = await createRun(site.id, mode, client.model);
  active.add(run.id);
  void execute(site, run.id, client).finally(() => active.delete(run.id));
  return run;
}

async function execute(site: Site, runId: string, client: ReturnType<typeof clientFor>["client"]): Promise<void> {
  const started = Date.now();
  try {
    await updateRun(runId, { status: "running", stage: "crawling" });
    let urls: string[] = [];
    if (site.sitemapUrl) urls = await fetchSitemapUrls(site.sitemapUrl);
    else if (site.urls?.length) urls = site.urls;
    if (site.filter) urls = urls.filter((u) => u.includes(site.filter!));
    urls = urls.slice(0, site.limit);
    if (!urls.length) throw new Error("No URLs found. Check the sitemap URL or the path filter.");

    const pages = await fetchPages(urls, 6);
    if (!pages.length) throw new Error("Fetched the URLs but none had enough body text (over 50 words).");
    await writeArtifact(runId, "pages", pages);

    await updateRun(runId, { stage: "linking", progress: { done: 0, total: 0 } });
    const sink = new JsonlSink(decisionsPath(runId));
    let lastWrite = 0;
    const linking = await runLinking(pages, client, {
      topK: site.topK,
      concurrency: 8,
      workspaceId: site.id,
      sink,
      onProgress: (done, total) => {
        const now = Date.now();
        if (now - lastWrite > 500 || done === total) {
          lastWrite = now;
          void updateRun(runId, { progress: { done, total } });
        }
      },
    });
    const links: StoredLink[] = linking.links.map((l) => ({ ...l, id: randomUUID().slice(0, 8), status: "open" }));
    await writeArtifact(runId, "links", links);
    await writeArtifact(runId, "cannibal", linking.cannibalisation);

    await updateRun(runId, { stage: "publish gate", progress: { done: 0, total: pages.length } });
    const gate = await runPublishGate(pages, client, { siblingsK: 5, concurrency: 8, workspaceId: site.id, sink });
    await writeArtifact(runId, "gate", gate);

    const gateTokens = gate.reduce((s, r) => s + r.inputTokens, 0);
    const inputTokens = linking.inputTokens + gateTokens;
    const counts = { index: 0, improve: 0, kill: 0, needsReview: 0 };
    for (const r of gate) {
      counts[r.disposition]++;
      if (r.needsReview) counts.needsReview++;
    }
    await updateRun(runId, {
      status: "done",
      stage: "done",
      finishedAt: new Date().toISOString(),
      progress: { done: pages.length, total: pages.length },
      summary: {
        pages: pages.length,
        pairsEvaluated: linking.pairsEvaluated,
        inputTokens,
        estimatedCostUsd: Math.round((inputTokens / 1_000_000) * PRICE_PER_MTOK * 10000) / 10000,
        links: links.length,
        cannibalPairs: linking.cannibalisation.length,
        gate: counts,
        seconds: Math.round((Date.now() - started) / 100) / 10,
      },
    });
    const fresh = { ...site, latestRunId: runId };
    await saveSite(fresh);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const run = await getRun(runId);
    if (run) await updateRun(runId, { status: "failed", stage: "failed", error: message, finishedAt: new Date().toISOString() });
  }
}
