"use client";
import { useState } from "react";

export function AiToolRunner({ endpoint, buildBody, children, runLabel }: {
  endpoint: string;
  buildBody?: () => any;
  children?: (setReady: (b: boolean) => void) => React.ReactNode;
  runLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [ready, setReady] = useState(!children);

  async function run() {
    setBusy(true); setErr(null); setResult(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildBody ? JSON.stringify(buildBody()) : undefined
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "Something went wrong"); return; }
    setResult(json.result);
  }

  return (
    <div className="max-w-3xl">
      {children?.(setReady)}
      <button className="btn-coral !h-13 mt-2" onClick={run} disabled={busy || !ready}>
        {busy ? "Thinking… (10–30s)" : runLabel}
      </button>
      {err && <p className="text-coral text-sm mt-4">{err}</p>}
      {result && <ResultBlocks data={result} />}
    </div>
  );
}

function ResultBlocks({ data }: { data: any }) {
  return (
    <div className="mt-8 space-y-5">
      {Object.entries(data).map(([key, val]) => (
        <div key={key} className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">
            {key.replace(/_/g, " ")}
          </div>
          <Value v={val} />
        </div>
      ))}
    </div>
  );
}

function Value({ v }: { v: any }) {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number")
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{String(v)}</p>;
  if (Array.isArray(v)) {
    return (
      <div className="space-y-3">
        {v.map((item, i) =>
          typeof item === "object" && item !== null ? (
            <div key={i} className="rounded-xl border border-line p-4">
              {Object.entries(item).map(([k, x]) => (
                <div key={k} className="text-sm mb-1.5 last:mb-0">
                  {k === "severity" || k === "priority" ? (
                    <span className={`inline-block px-2 py-0.5 rounded-pill text-xs font-bold ${
                      String(x) === "critical" || String(x) === "high"
                        ? "bg-coral text-white"
                        : String(x) === "major" || String(x) === "medium"
                        ? "bg-coral-soft text-coral" : "bg-paper-2 text-muted"
                    }`}>{String(x)}</span>
                  ) : (
                    <>
                      <span className="text-muted capitalize">{k.replace(/_/g, " ")}: </span>
                      <span className="font-medium">{String(x)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p key={i} className="text-sm flex gap-2"><span className="text-coral">•</span>{String(item)}</p>
          )
        )}
      </div>
    );
  }
  return <Value v={JSON.stringify(v)} />;
}
