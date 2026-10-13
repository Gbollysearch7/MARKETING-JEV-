"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { startRun } from "./jobs";
import { createSite, deleteSite, getSite, setLinkStatus, type LinkStatus } from "./store";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const num = (v: FormDataEntryValue | null, d: number, min: number, max: number) => {
  const n = Number(str(v));
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : d;
};

export async function addSiteAction(formData: FormData): Promise<void> {
  const name = str(formData.get("name"));
  const sitemapUrl = str(formData.get("sitemapUrl"));
  const urls = str(formData.get("urls")).split("\n").map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u));
  if (!name) throw new Error("Give the site a name");
  if (!sitemapUrl && !urls.length) throw new Error("Provide a sitemap URL or at least one page URL");
  const site = await createSite({
    name,
    sitemapUrl: sitemapUrl || undefined,
    urls: urls.length ? urls : undefined,
    filter: str(formData.get("filter")) || undefined,
    limit: num(formData.get("limit"), 40, 1, 2000),
    topK: num(formData.get("topK"), 10, 1, 50),
    mode: str(formData.get("mode")) === "mock" ? "mock" : "auto",
  });
  revalidatePath("/");
  redirect(`/sites/${site.id}`);
}

export async function startRunAction(siteId: string): Promise<void> {
  const site = await getSite(siteId);
  if (!site) throw new Error("Site not found");
  await startRun(site);
  revalidatePath(`/sites/${siteId}`);
  revalidatePath("/");
}

export async function setLinkStatusAction(siteId: string, runId: string, linkId: string, status: LinkStatus): Promise<void> {
  await setLinkStatus(runId, linkId, status);
  revalidatePath(`/sites/${siteId}/links`);
}

export async function deleteSiteAction(siteId: string): Promise<void> {
  await deleteSite(siteId);
  revalidatePath("/");
  redirect("/");
}
