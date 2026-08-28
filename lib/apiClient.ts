/**
 * Call an internal API route without ever failing silently.
 *
 * The pattern this replaces:
 *
 *   const r = await fetch(url, ...);
 *   const j = await r.json();          // throws on a 500 HTML page
 *   setBusy(false);                    // never reached
 *
 * When a route 500s, times out at the gateway, or redirects to login, the
 * body is HTML and `r.json()` throws. The throw escapes the handler, the
 * loading flag is never cleared, and the button sits on "Saving…" forever
 * with nothing on screen. The request looks like it did nothing.
 *
 * This always resolves — never throws — and always returns something the UI
 * can display.
 */
export type ApiResult<T = any> = {
  ok: boolean;
  data: T | null;
  /** Present whenever ok is false. Always safe to show the user. */
  error: string | null;
  status: number;
};

export async function callApi<T = any>(
  url: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e: any) {
    return {
      ok: false, data: null, status: 0,
      error: e?.name === "AbortError"
        ? "The request took too long and was cancelled."
        : "Couldn't reach the server. Check your connection and try again."
    };
  }

  const text = await res.text().catch(() => "");

  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON — a Vercel error page, a login redirect, a gateway timeout.
    // Report what actually happened instead of dying quietly.
    if (res.status === 401 || res.redirected)
      return { ok: false, data: null, status: res.status, error: "Your session expired. Reload the page and sign in again." };
    if (res.status === 504 || res.status === 408)
      return { ok: false, data: null, status: res.status, error: "The server took too long. Try a smaller batch." };
    if (res.status >= 500)
      return { ok: false, data: null, status: res.status, error: `The server returned an error (${res.status}). Check the Vercel logs for this route.` };
    return { ok: false, data: null, status: res.status, error: `Unexpected response from the server (${res.status}).` };
  }

  if (!res.ok) {
    return {
      ok: false, data: parsed, status: res.status,
      error: parsed?.error ?? `Request failed (${res.status}).`
    };
  }

  return { ok: true, data: parsed as T, error: null, status: res.status };
}

export function postJson<T = any>(url: string, body: any) {
  return callApi<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
}
