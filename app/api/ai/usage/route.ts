import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toolkitUsage } from "@/lib/ai-gate";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ usage: await toolkitUsage(user.id) });
}
