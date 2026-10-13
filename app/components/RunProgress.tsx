"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Run } from "@/lib/store";

export function RunProgress({ run }: { run: Run }) {
  const router = useRouter();
  const [state, setState] = useState(run);

  useEffect(() => {
    if (state.status !== "running" && state.status !== "queued") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as Run;
        setState(next);
        if (next.status === "done" || next.status === "failed") {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // keep polling
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [state.status, run.id, router]);

  const { done, total } = state.progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const live = state.status === "running" || state.status === "queued";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[13px]">
        <span>
          <span className="font-medium capitalize">{state.stage}</span>
          {live ? <span className="text-muted"> · {state.mode === "mock" ? "mock decisions" : state.model}</span> : null}
        </span>
        {total > 0 ? <span className="font-mono text-xs text-muted">{done}/{total}</span> : null}
      </div>
      {live ? (
        <div className="h-2 rounded-full bg-soft overflow-hidden">
          <div className="h-2 rounded-full bg-teal transition-[width]" style={{ width: `${total > 0 ? pct : 10}%` }} />
        </div>
      ) : null}
      {state.status === "failed" ? <div className="text-[13px] text-red-ink">{state.error}</div> : null}
    </div>
  );
}
