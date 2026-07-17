const MODEL = "gemini-1.5-flash";

/** Call Gemini and return parsed JSON (prompt must demand a JSON-only reply). */
export async function geminiJson(prompt: string): Promise<{ data: any | null; error: string | null; raw?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { data: null, error: "GEMINI_API_KEY not set — add it in Vercel env vars." };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: "application/json" }
        })
      }
    );
    const json = await res.json();
    if (!res.ok) return { data: null, error: json?.error?.message ?? `Gemini HTTP ${res.status}` };
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    try {
      return { data: JSON.parse(text), error: null, raw: text };
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { return { data: JSON.parse(m[0]), error: null, raw: text }; } catch {} }
      return { data: null, error: "AI returned an unreadable response — try again.", raw: text };
    }
  } catch (e: any) {
    return { data: null, error: e?.message ?? "Network error reaching Gemini" };
  }
}
