"use client";
import { useEffect } from "react";
import { OFFERS_SEEN_COOKIE } from "@/lib/offerSeen";

/**
 * Records that the Offers page has been looked at, which clears the sidebar
 * badge on the next page load. Written after the page has rendered, so the
 * rows that were new on this visit are still marked as new while you read.
 */
export function MarkOffersSeen() {
  useEffect(() => {
    try {
      document.cookie = `${OFFERS_SEEN_COOKIE}=${encodeURIComponent(new Date().toISOString())}; path=/portal/admin; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    } catch { /* a blocked cookie only means the badge stays until it can be set */ }
  }, []);
  return null;
}
