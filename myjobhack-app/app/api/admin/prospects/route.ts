import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderPlainEmail } from "@/lib/email";
import { templateByKey, stageAfterSend, nextActionAfter } from "@/lib/outreach";

export const runtime = "nodejs";

function addDays(d: number) {
  const t = new Date(); t.setDate(t.getDate() + d);
  return t.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { action, id, data } = await request.json();

  /* ---------- create ---------- */
  if (action === "create") {
    if (!data?.company?.trim()) return NextResponse.json({ error: "Company name is required." }, { status: 400 });
    const { data: created, error } = await admin.from("employer_prospects").insert({
      company: data.company.trim(), sector: data.sector || null, city: data.city || null,
      website: data.website || null, tier: Number(data.tier) || 1,
      contact_name: data.contact_name || "", contact_role: data.contact_role || null,
      contact_email: data.contact_email?.trim().toLowerCase() || null,
      linkedin_url: data.linkedin_url || null,
      hires_roles: data.hires_roles || null, hiring_now: !!data.hiring_now,
      next_action: "Send opening email", next_action_at: addDays(0),
      created_by: user.id, owner_id: user.id
    }).select().single();
    if (error) {
      const msg = error.message.includes("duplicate")
        ? "That contact email is already in the pipeline."
        : `Could not add: ${error.message}`;
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ ok: true, prospect: created });
  }

  /* ---------- send an outreach email ---------- */
  if (action === "send") {
    const { data: p } = await admin.from("employer_prospects").select("*").eq("id", id).maybeSingle();
    if (!p) return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
    if (!p.contact_email) return NextResponse.json({ error: "No contact email on this prospect." }, { status: 400 });

    const subject = String(data?.subject ?? "").trim();
    const bodyText = String(data?.body ?? "").trim();
    if (!subject || !bodyText) return NextResponse.json({ error: "Subject and body are required." }, { status: 400 });

    // Guard the playbook's own rule — never a third chase.
    if (p.touches >= 3 && data?.template_key !== "quarterly") {
      return NextResponse.json({
        error: "This prospect has already had three touches. Two follow-ups then stop — move them to the quarterly list instead."
      }, { status: 409 });
    }

    const html = renderPlainEmail({
      paragraphs: bodyText.split(/\n{2,}/).map(s => s.trim()).filter(Boolean),
      signoff: `— ${me?.full_name ?? "MYJOBHACK"}\nMYJOBHACK · myjobhack.co`
    });

    const res = await sendEmail(p.contact_email, subject, html);
    if (res.error) return NextResponse.json({ error: `Email failed: ${res.error}` }, { status: 502 });

    const tplKey = String(data?.template_key ?? "hr_lead");
    const next = nextActionAfter(tplKey);
    const newStage = stageAfterSend(tplKey, p.stage);

    await admin.from("employer_prospects").update({
      stage: newStage,
      touches: p.touches + 1,
      last_contacted_at: new Date().toISOString(),
      next_action: next.action,
      next_action_at: next.days ? addDays(next.days) : null,
      quarterly_list: tplKey === "follow_up_2" ? true : p.quarterly_list
    }).eq("id", id);

    await admin.from("prospect_activity").insert({
      prospect_id: id, kind: "email", subject, body: bodyText, actor_id: user.id
    });

    return NextResponse.json({ ok: true, message: `Sent to ${p.contact_email}. Next: ${next.action}.` });
  }

  /* ---------- move stage / log a note ---------- */
  if (action === "update") {
    const patch: Record<string, any> = {};
    ["stage", "next_action", "next_action_at", "notes", "hiring_now",
     "quarterly_list", "lost_reason", "hires_roles", "contact_email",
     "contact_name", "contact_role", "city", "sector", "tier"].forEach(k => {
      if (data?.[k] !== undefined) patch[k] = data[k];
    });

    // Replying is the signal that matters — record when it happened.
    if (data?.stage === "replied" || data?.stage === "call_booked") {
      patch.next_action = data.stage === "replied" ? "Book the call" : "Run the call — diagnose, don't present";
      patch.next_action_at = addDays(1);
    }

    const { error } = await admin.from("employer_prospects").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (data?.note) {
      await admin.from("prospect_activity").insert({
        prospect_id: id, kind: "note", body: data.note, actor_id: user.id
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const { error } = await admin.from("employer_prospects").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
