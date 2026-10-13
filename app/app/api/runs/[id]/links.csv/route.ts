import { readLinks, type LinkStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const status = new URL(req.url).searchParams.get("status") as LinkStatus | "all" | null;
  const links = (await readLinks(id)).filter((l) => !status || status === "all" || l.status === status);
  const cols = ["sourceUrl", "targetUrl", "anchor", "paragraphKey", "paragraphText", "priority", "readerBenefit", "sameIntent", "prerequisite", "anchorConfidence", "needsReview", "status"] as const;
  const lines = [cols.join(","), ...links.map((l) => cols.map((c) => cell(l[c])).join(","))];
  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="links-${id}-${status ?? "all"}.csv"` },
  });
}
