const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest"
].filter(Boolean) as string[];

/** Call Gemini and return parsed JSON (prompt must demand a JSON-only reply).
 *  Tries a chain of models so a retired model name can never take the feature down. */
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
            generationConfig: { temperature: 0.4, responseMimeType: "application/json" }
          })
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        errors.push(`${model}: ${json?.error?.message ?? `HTTP ${res.status}`}`);
        continue; // next model
      }
      const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      try {
        return { data: JSON.parse(text), error: null, raw: text, model };
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) { try { return { data: JSON.parse(m[0]), error: null, raw: text, model }; } catch {} }
        errors.push(`${model}: unreadable response`);
      }
    } catch (e: any) {
      errors.push(`${model}: ${e?.message ?? "network error"}`);
    }
  }
  return { data: null, error: errors.join(" | ") };
}
