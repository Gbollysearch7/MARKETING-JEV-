import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CannibalPair, DecisionRecord, GateRow, LinkSuggestion, PageDoc } from "@jev-marketing/engine";

export const DATA_DIR = process.env.JEV_DATA_DIR ?? path.join(process.cwd(), "data");
const SITES_FILE = path.join(DATA_DIR, "sites.json");
const RUNS_DIR = path.join(DATA_DIR, "runs");

export type SiteMode = "auto" | "mock";
export interface Site {
  id: string;
  name: string;
  sitemapUrl?: string;
  urls?: string[];
  filter?: string;
  limit: number;
  topK: number;
  mode: SiteMode;
  createdAt: string;
  latestRunId?: string;
}

export type RunStatus = "queued" | "running" | "done" | "failed";
export interface RunSummary {
  pages: number;
  pairsEvaluated: number;
  inputTokens: number;
  estimatedCostUsd: number;
  links: number;
  cannibalPairs: number;
  gate: { index: number; improve: number; kill: number; needsReview: number };
  seconds: number;
}
export interface Run {
  id: string;
  siteId: string;
  status: RunStatus;
  mode: "live" | "mock";
  model: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  stage: string;
  progress: { done: number; total: number };
  summary?: RunSummary;
}

export type LinkStatus = "open" | "accepted" | "dismissed";
export interface StoredLink extends LinkSuggestion {
  id: string;
  status: LinkStatus;
}

async function ensureDirs(): Promise<void> {
  await mkdir(RUNS_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDirs();
  await writeFile(file, JSON.stringify(data, null, 2));
}

// Sites
export async function listSites(): Promise<Site[]> {
  const sites = await readJson<Site[]>(SITES_FILE, []);
  return sites.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSite(id: string): Promise<Site | null> {
  return (await listSites()).find((s) => s.id === id) ?? null;
}

export async function saveSite(site: Site): Promise<void> {
  const sites = await readJson<Site[]>(SITES_FILE, []);
  const i = sites.findIndex((s) => s.id === site.id);
  if (i >= 0) sites[i] = site;
  else sites.push(site);
  await writeJson(SITES_FILE, sites);
}

export async function createSite(input: Omit<Site, "id" | "createdAt">): Promise<Site> {
  const site: Site = { ...input, id: randomUUID().slice(0, 8), createdAt: new Date().toISOString() };
  await saveSite(site);
  return site;
}

export async function deleteSite(id: string): Promise<void> {
  const sites = await readJson<Site[]>(SITES_FILE, []);
  await writeJson(SITES_FILE, sites.filter((s) => s.id !== id));
  for (const run of await listRuns(id)) await rm(runDir(run.id), { recursive: true, force: true });
}

// Runs
const runDir = (runId: string) => path.join(RUNS_DIR, runId);
const runFile = (runId: string, name: string) => path.join(runDir(runId), name);
export const decisionsPath = (runId: string) => runFile(runId, "decisions.jsonl");

export async function createRun(siteId: string, mode: Run["mode"], model: string): Promise<Run> {
  const run: Run = {
    id: `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6)}`,
    siteId,
    status: "queued",
    mode,
    model,
    startedAt: new Date().toISOString(),
    stage: "queued",
    progress: { done: 0, total: 0 },
  };
  await mkdir(runDir(run.id), { recursive: true });
  await writeJson(runFile(run.id, "run.json"), run);
  return run;
}

export async function getRun(runId: string): Promise<Run | null> {
  if (!/^[\w-]+$/.test(runId)) return null;
  return readJson<Run | null>(runFile(runId, "run.json"), null);
}

export async function updateRun(runId: string, patch: Partial<Run>): Promise<Run> {
  const run = await getRun(runId);
  if (!run) throw new Error(`run ${runId} not found`);
  const next = { ...run, ...patch };
  await writeJson(runFile(runId, "run.json"), next);
  return next;
}

export async function listRuns(siteId?: string): Promise<Run[]> {
  await ensureDirs();
  const ids = await readdir(RUNS_DIR);
  const runs = (await Promise.all(ids.map((id) => getRun(id)))).filter((r): r is Run => !!r);
  return runs.filter((r) => !siteId || r.siteId === siteId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// Run artifacts
export async function writeArtifact(runId: string, name: "pages" | "links" | "cannibal" | "gate", data: unknown): Promise<void> {
  await writeJson(runFile(runId, `${name}.json`), data);
}
export const readPages = (runId: string) => readJson<PageDoc[]>(runFile(runId, "pages.json"), []);
export const readLinks = (runId: string) => readJson<StoredLink[]>(runFile(runId, "links.json"), []);
export const readCannibal = (runId: string) => readJson<CannibalPair[]>(runFile(runId, "cannibal.json"), []);
export const readGate = (runId: string) => readJson<GateRow[]>(runFile(runId, "gate.json"), []);

export async function setLinkStatus(runId: string, linkId: string, status: LinkStatus): Promise<void> {
  const links = await readLinks(runId);
  const link = links.find((l) => l.id === linkId);
  if (!link) return;
  link.status = status;
  await writeArtifact(runId, "links", links);
}

export interface DecisionQuery {
  question?: string;
  minConfidence?: number;
  entity?: string;
  offset?: number;
  limit?: number;
}

export async function readDecisions(runId: string, q: DecisionQuery = {}): Promise<{ rows: DecisionRecord[]; total: number; questions: string[] }> {
  const file = decisionsPath(runId);
  if (!existsSync(file)) return { rows: [], total: 0, questions: [] };
  const lines = (await readFile(file, "utf8")).split("\n").filter(Boolean);
  const all: DecisionRecord[] = [];
  const questions = new Set<string>();
  for (const line of lines) {
    try {
      const r = JSON.parse(line) as DecisionRecord;
      questions.add(r.question_key);
      all.push(r);
    } catch {
      // skip a torn line
    }
  }
  const filtered = all.filter(
    (r) =>
      (!q.question || r.question_key === q.question) &&
      (q.minConfidence === undefined || r.confidence >= q.minConfidence) &&
      (!q.entity || r.entity_id.includes(q.entity)),
  );
  const offset = q.offset ?? 0;
  const limit = q.limit ?? 100;
  return { rows: filtered.slice(offset, offset + limit), total: filtered.length, questions: [...questions].sort() };
}
