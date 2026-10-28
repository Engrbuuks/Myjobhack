import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { toCsv } from "@/lib/exportCsv";
import { readOfferFilters, applyOfferFilters, offerOutcome } from "@/lib/offerFilters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Offers list as a CSV, with a Location column, for pivoting outside the
 * app.
 *
 * GET ?q=&status=&loc=  (the page's own filters, read by the same helper)
 *
 * The file carries salaries and candidate identities, so it sits behind the
 * same capability as the page and the offer route. Built on the server so
 * it is not limited to the 300 rows the page shows.
 */
const PAGE = 1000;
const MAX = 20_000;

export async function GET(request: Request) {
  const gate = await requirePermission("applicants.contact");
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const filters = readOfferFilters({
    q: url.searchParams.get("q"), status: url.searchParams.get("status"), loc: url.searchParams.get("loc")
  });
  const admin = createAdminClient();

  const COLS = "id, candidate_name, candidate_email, position_title, salary, start_date, status, sent_at, expires_at, signed_at, declined_at, withdrawn_at, reference, location_id";
  const rows: any[] = [];
  for (let from = 0; from < MAX; from += PAGE) {
    const { data, error } = await applyOfferFilters(
      admin.from("offer_letters").select(COLS)
        .order("sent_at", { ascending: false }).range(from, from + PAGE - 1),
      filters);
    if (error) {
      const missing = /location_id|offer_locations/.test(error.message);
      return NextResponse.json({
        error: missing
          ? "The export includes locations, which need migration 0065_offer_locations.sql. Run it in the Supabase SQL editor, then try again."
          : error.message
      }, { status: missing ? 400 : 500 });
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }

  const { data: locs } = await admin.from("offer_locations").select("id, name");
  const nameOf = new Map((locs ?? []).map((l: any) => [l.id, l.name]));

  const day = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : "");
  /**
   * Names, roles and salaries are typed by applicants and staff. A cell that
   * begins with = + - or @ is run as a formula when the file is opened in a
   * spreadsheet, so those are prefixed with an apostrophe and stay text.
   */
  const text = (v: any) => {
    const s = String(v ?? "");
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  };
  const csv = toCsv(rows.map((o) => ({
    candidate: text(o.candidate_name), email: text(o.candidate_email), position: text(o.position_title),
    // Untagged is written out, not left blank, so a pivot shows it as its own row.
    location: o.location_id ? text(nameOf.get(o.location_id) ?? "Unnamed") : "Not tagged",
    salary: text(o.salary), start_date: day(o.start_date),
    status: o.status, outcome: offerOutcome(o),
    sent: day(o.sent_at), expires: day(o.expires_at), accepted: day(o.signed_at),
    declined: day(o.declined_at), withdrawn: day(o.withdrawn_at), reference: text(o.reference)
  })), [
    { key: "candidate", label: "Candidate" }, { key: "email", label: "Email" },
    { key: "position", label: "Position" }, { key: "location", label: "Location" },
    { key: "salary", label: "Salary" }, { key: "start_date", label: "Start date" },
    { key: "status", label: "Status" }, { key: "outcome", label: "Outcome" },
    { key: "sent", label: "Sent" }, { key: "expires", label: "Expires" },
    { key: "accepted", label: "Accepted" }, { key: "declined", label: "Declined" },
    { key: "withdrawn", label: "Withdrawn" }, { key: "reference", label: "Reference" }
  ]) || "Candidate,Email,Position,Location\n";

  await admin.from("activity_log").insert({
    actor_id: gate.userId, action: "Offers exported", entity: "offer", entity_id: null,
    meta: { rows: rows.length, filters }
  }).then(() => null, () => null);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="offers ${stamp}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
