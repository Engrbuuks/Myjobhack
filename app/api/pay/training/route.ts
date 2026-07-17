import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { training_id, method, proof_document_id } = await request.json();
  const { data: training } = await supabase.from("trainings")
    .select("id, title, price_ngn, price_usd").eq("id", training_id).single();
  if (!training) return NextResponse.json({ error: "Training not found" }, { status: 404 });

  const admin = createAdminClient();
  const currency = method === "manual_transfer_usd" ? "USD" : "NGN";
  const amount = currency === "USD" ? training.price_usd : training.price_ngn;
  if (!amount || amount <= 0) return NextResponse.json({ error: "This training is free — just register." }, { status: 400 });

  const { data: payment, error } = await admin.from("payments").insert({
    profile_id: user.id, amount, currency,
    method: method === "paystack" ? "paystack" : method,
    status: method === "paystack" ? "initiated" : "pending_review",
    kind: "training", training_id,
    proof_document_id: proof_document_id ?? null
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (method !== "paystack") {
    await admin.from("notifications").insert({
      profile_id: user.id, title: "Transfer received for review",
      body: `We'll confirm your payment for "${training.title}" and register your seat.`,
      link: "/portal/seeker/trainings"
    });
    return NextResponse.json({ ok: true, mode: "manual" });
  }

  // Paystack init
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Card payments not configured yet — use bank transfer." }, { status: 400 });
  const { data: prof } = await admin.from("profiles").select("email").eq("id", user.id).single();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: prof?.email, amount: amount * 100, currency: "NGN",
      callback_url: `${appUrl}/api/pay/training/verify?payment_id=${payment.id}`,
      metadata: { kind: "training", training_id, profile_id: user.id, payment_id: payment.id }
    })
  });
  const json = await res.json();
  if (!json?.status) return NextResponse.json({ error: json?.message ?? "Paystack init failed" }, { status: 500 });
  await admin.from("payments").update({ provider_ref: json.data.reference }).eq("id", payment.id);
  return NextResponse.json({ ok: true, mode: "paystack", authorization_url: json.data.authorization_url });
}
