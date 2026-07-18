/** Naira for Nigerian visitors, USD for everyone else.
 *  Detection order: explicit ?cur= → Vercel geo header → Cloudflare header → accept-language → default USD. */
export function currencyFromRequest(headers: Headers, override?: string | null): "NGN" | "USD" {
  const forced = (override ?? "").toUpperCase();
  if (forced === "NGN" || forced === "USD") return forced;

  const country =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-country") ||
    "";
  if (country.toUpperCase() === "NG") return "NGN";

  const lang = headers.get("accept-language") ?? "";
  if (/-NG\b/i.test(lang)) return "NGN";

  return "USD";
}

export function formatMoney(currency: "NGN" | "USD", ngn: number, usd: number): string {
  if (currency === "NGN") {
    return ngn > 0 ? `₦${Number(ngn).toLocaleString()}` : "Free";
  }
  return usd > 0 ? `$${Number(usd).toLocaleString()}` : "Free";
}
