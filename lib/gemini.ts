const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-latest",        // always points at the current free-tier flash
  "gemini-flash-lite-latest",
  "gemini-2.0-flash"            // legacy keys that still carry quota for it
].filter(Boolean) as string[];

/** Call Gemini and return parsed JSON (prompt must demand a JSON-only reply).
 *  - Tries a chain of models so a retired model can never take the feature down.
 *  - Joins ALL response parts and skips "thought" parts (newer models split output). */
export async function geminiJson(prompt: string): Promise<{ data: any | null; error: string | null; raw?: string; model?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { data: null, error: "GEMINI_API_KEY is not set in Vercel → Settings → Environment Variables." };

  const errors: string[] = [];
  for (const model of Array.from(new Set(MODELS))) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.4,
              responseMimeType: "application/json",
              maxOutputTokens: 8192
            }
          })
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        errors.push(`${model}: ${json?.error?.message ?? `HTTP ${res.status}`}`);
        continue;
      }
      // join every non-thought part — newer models split output across parts
      const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
      const text: string = parts
        .filter((p) => p && typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
      if (!text) {
        const reason = json?.candidates?.[0]?.finishReason ?? "empty";
        errors.push(`${model}: no text returned (${reason})`);
        continue;
      }
      try {
        return { data: JSON.parse(text), error: null, raw: text, model };
      } catch {
        const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        try { return { data: JSON.parse(fenced), error: null, raw: text, model }; } catch {}
        const m = text.match(/\{[\s\S]*\}/);
        if (m) { try { return { data: JSON.parse(m[0]), error: null, raw: text, model }; } catch {} }
        errors.push(`${model}: unparseable JSON (starts: ${text.slice(0, 60).replace(/\s+/g, " ")}…)`);
      }
    } catch (e: any) {
      errors.push(`${model}: ${e?.message ?? "network error"}`);
    }
  }
  return { data: null, error: errors.join(" | ") };
}

/**
 * Ask Gemini a question ANSWERED FROM A LIVE WEB SEARCH, and return both the
 * text and the pages it actually used.
 *
 * This exists for the cold-start problem: with no employers posting yet, there
 * is no internal demand signal to measure the pool against. A model answering
 * from memory would just assert a generic, possibly stale skills list. Search
 * grounding means the answer is drawn from current pages, and — critically —
 * the sources come back so a human can check them before acting.
 *
 * NOTE: the API rejects responseMimeType: "application/json" when a tool is
 * enabled, so JSON has to be requested in the prompt and parsed out of prose.
 */
export async function geminiGrounded(prompt: string, opts: { timeoutMs?: number } = {}): Promise<{
  data: any | null; error: string | null; sources: { title: string; uri: string }[]; model?: string;
}> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { data: null, error: "GEMINI_API_KEY is not set in Vercel → Settings → Environment Variables.", sources: [] };

  // A grounded call runs real searches and can take 30s+. Without our own
  // deadline the serverless platform kills the function first and returns its
  // own HTML error page — which is not JSON, so the caller gets an opaque 502
  // instead of anything explaining what happened.
  const budgetMs = opts.timeoutMs ?? 40_000;
  const deadline = Date.now() + budgetMs;

  // The grounding tool is named differently across model generations. Trying
  // both means a model swap can't silently disable the feature.
  const TOOL_SHAPES = [{ google_search: {} }, { google_search_retrieval: {} }];

  const errors: string[] = [];
  outer:
  for (const model of Array.from(new Set(MODELS))) {
    for (const tool of TOOL_SHAPES) {
      const remaining = deadline - Date.now();
      if (remaining < 4_000) { errors.push("ran out of time before all models were tried"); break outer; }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [tool],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
          })
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.error?.message ?? `HTTP ${res.status}`;
        errors.push(`${model}: ${msg}`);
        // An unsupported tool name is worth retrying with the other shape;
        // anything else means this model is out.
        if (/tool|function|search/i.test(msg)) continue;
        break;
      }

      const cand = json?.candidates?.[0];
      const text: string = (cand?.content?.parts ?? [])
        .filter((p: any) => p && typeof p.text === "string" && !p.thought)
        .map((p: any) => p.text).join("").trim();

      // The pages the answer was actually drawn from.
      const chunks: any[] = cand?.groundingMetadata?.groundingChunks ?? [];
      const sources = chunks
        .map((c) => ({ title: c?.web?.title ?? "", uri: c?.web?.uri ?? "" }))
        .filter((s) => s.uri);

      if (!text) { errors.push(`${model}: no text returned`); continue; }
      // A grounded answer with no sources is the model's memory, not the web.
      if (!sources.length) errors.push(`${model}: answered without citing any source`);

      const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      for (const candidate of [stripped, text.match(/\{[\s\S]*\}/)?.[0], text.match(/\[[\s\S]*\]/)?.[0]]) {
        if (!candidate) continue;
        try { return { data: JSON.parse(candidate), error: null, sources, model }; } catch {}
      }
      errors.push(`${model}: unparseable JSON (starts: ${text.slice(0, 60).replace(/\s+/g, " ")}…)`);
      } catch (e: any) {
        errors.push(e?.name === "AbortError"
          ? `${model}: timed out after ${Math.round(budgetMs / 1000)}s`
          : `${model}: ${e?.message ?? "network error"}`);
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return { data: null, error: errors.join(" · ") || "No model returned a usable answer.", sources: [] };
}
