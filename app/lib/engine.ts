import { createClient, DEFAULT_MODEL, type DecisionClient } from "@jev-marketing/engine";
import type { SiteMode } from "./store";

export function hasLiveKey(): boolean {
  return !!process.env.TYPESAFE_API_KEY;
}

export function pinnedModel(): string {
  return process.env.JEV_MODEL ?? DEFAULT_MODEL;
}

export function clientFor(mode: SiteMode): { client: DecisionClient; mode: "live" | "mock" } {
  if (mode === "mock" || !hasLiveKey()) return { client: createClient({ mock: true }), mode: "mock" };
  return { client: createClient(), mode: "live" };
}
