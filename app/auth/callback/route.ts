import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { claimGuestApplications } from "@/lib/claimGuestApplications";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    /**
     * Link up anything this person applied for as a guest.
     *
     * This happens HERE, not during registration, because following the
     * confirmation link is the proof that they control the mailbox. Doing it
     * at registration let anyone type someone else's address and take their
     * applications, permanently, since the claim also set talent_id.
     */
    const user = data?.user;
    if (user?.id && user.email) {
      await claimGuestApplications(user.id, user.email);
    }
  }
  return NextResponse.redirect(`${origin}/`);
}
