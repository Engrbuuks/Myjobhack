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


/** Currency symbols by code. */
export const CUR_SYMBOL: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€", GHS: "GH₵", KES: "KSh", ZAR: "R" };

/**
 * Ensure a salary/price string carries its denomination.
 * "150,000"        + NGN → "₦150,000"
 * "450k–600k"      + NGN → "₦450k–₦600k"
 * "₦450k"                → unchanged (already denominated)
 * "Competitive"          → unchanged (not a figure)
 */
export function denominate(text: string | null | undefined, code = "NGN"): string {
  const s = (text ?? "").trim();
  if (!s) return "";
  const sym = CUR_SYMBOL[code.toUpperCase()] ?? code.toUpperCase() + " ";

  // already has a currency symbol or code
  if (/[₦$£€]|GH₵|KSh|\b(NGN|USD|GBP|EUR|GHS|KES|ZAR)\b/i.test(s)) return s;

  // no digits → descriptive text like "Competitive", leave alone
  if (!/\d/.test(s)) return s;

  // prefix each numeric run (handles ranges like 450k-600k, 150,000 - 200,000)
  return s.replace(/(\d[\d,.]*\s*[kKmM]?)/g, (m) => sym + m.trim());
}

/** Format a numeric amount with its symbol. */
export function money(amount: number | null | undefined, code = "NGN"): string {
  if (amount === null || amount === undefined) return "";
  const sym = CUR_SYMBOL[code.toUpperCase()] ?? code.toUpperCase() + " ";
  return sym + Number(amount).toLocaleString();
}
