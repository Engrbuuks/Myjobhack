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
export async function geminiGrounded(prompt: string): Promise<{
  data: any | null; error: string | null; sources: { title: string; uri: string }[]; model?: string;
}> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { data: null, error: "GEMINI_API_KEY is not set in Vercel → Settings → Environment Variables.", sources: [] };

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
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
          })
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        errors.push(`${model}: ${json?.error?.message ?? `HTTP ${res.status}`}`);
        continue;
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

      const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      for (const candidate of [stripped, text.match(/\{[\s\S]*\}/)?.[0], text.match(/\[[\s\S]*\]/)?.[0]]) {
        if (!candidate) continue;
        try { return { data: JSON.parse(candidate), error: null, sources, model }; } catch {}
      }
      errors.push(`${model}: unparseable JSON (starts: ${text.slice(0, 60).replace(/\s+/g, " ")}…)`);
    } catch (e: any) {
      errors.push(`${model}: ${e?.message ?? "network error"}`);
    }
  }
  return { data: null, error: errors.join(" · "), sources: [] };
}
