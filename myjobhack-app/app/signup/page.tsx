"use client";
import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [role, setRole] = useState<"job_seeker" | "employer">("job_seeker");
  const [inviteTier, setInviteTier] = useState<string | null>(null);
  if (typeof window !== "undefined" && inviteTier === null) {
    const as = new URLSearchParams(window.location.search).get("as");
    if (as === "employer") { setInviteTier("employer"); if (role !== "employer") setRole("employer"); }
    else if (as === "elite") { setInviteTier("elite"); }
    else setInviteTier("");
  }
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Turn anything thrown — Error, Supabase error, or a bare object — into readable text. */
  function describe(e: any): string {
    if (!e) return "Unknown error.";
    if (typeof e === "string") return e;
    if (e.message && typeof e.message === "string" && e.message.trim()) return e.message;
    if (e.error_description) return String(e.error_description);
    if (e.error) return String(e.error);
    if (e.msg) return String(e.msg);
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}") return json;
    } catch { /* fall through */ }
    return "The signup service could not be reached. Check your connection and try again.";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);

    // basic checks before we call out, so failures are self-explanatory
    if (!fullName.trim()) { setErr("Please enter your full name."); setBusy(false); return; }
    if (!email.trim() || !email.includes("@")) { setErr("Please enter a valid email address."); setBusy(false); return; }
    if (password.length < 6) { setErr("Password must be at least 6 characters."); setBusy(false); return; }

    try {
      const refTag = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") : null;
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, full_name: fullName.trim(), role, ref: refTag, invite_as: inviteTier || null })
      });

      // Read as text first — an empty body would break res.json() outright.
      const raw = await res.text();
      let json: any = {};
      if (raw) { try { json = JSON.parse(raw); } catch { json = { error: raw }; } }

      if (!res.ok) {
        setErr(describe(json?.error ?? json) || `Server error (${res.status}). Please try again.`);
        setBusy(false);
        return;
      }
      if (!raw) {
        setErr("The registration service returned nothing — the endpoint may not be deployed yet. Please try again shortly.");
        setBusy(false);
        return;
      }
      if (json.warning) console.warn(json.warning);
      setDone(true);
    } catch (thrown: any) {
      console.error("register threw:", thrown);
      setErr(describe(thrown));
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between bg-ink text-white p-12 relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full bg-coral/20 blur-[120px]" />
        <span className="text-xs font-extrabold uppercase tracking-[.28em] text-[#FFB4AC]">Free to join — both sides</span>
        <div>
          <h1 className="font-display font-semibold text-5xl leading-tight max-w-md">
            Built for both sides of the <em className="text-coral">table.</em>
          </h1>
          <p className="mt-6 text-white/60 max-w-sm text-sm leading-relaxed">
            Talent builds one profile and lets the right opportunities come hunting. Employers post roles and watch qualified candidates shortlist themselves. Pick your side — the machine does the rest.
          </p>
        </div>
        <span className="text-white/40 text-xs">myjobhack.co</span>
      </section>

      <section className="flex items-center justify-center p-8">
        {done ? (
          <div className="w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full bg-coral text-white grid place-items-center text-2xl mx-auto mb-6">✓</div>
            <h2 className="font-display font-semibold text-3xl mb-2">Check your email</h2>
            <p className="text-muted text-sm">We sent a confirmation link to <b>{email}</b>. Click it to activate your profile.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="w-full max-w-sm text-center sm:text-left">
            <h2 className="font-display font-semibold text-3xl mb-1">Create your account</h2>
            <p className="text-muted text-sm mb-6">Free to join. Takes two minutes.</p>
            <div className="flex rounded-pill border border-line overflow-hidden text-sm font-bold mb-6">
              <button type="button" onClick={() => setRole("job_seeker")}
                className={`flex-1 h-11 ${role === "job_seeker" ? "bg-ink text-white" : "bg-white"}`}>
                I&rsquo;m talent
              </button>
              <button type="button" onClick={() => setRole("employer")}
                className={`flex-1 h-11 ${role === "employer" ? "bg-ink text-white" : "bg-white"}`}>
                I&rsquo;m hiring
              </button>
            </div>
            <label className="label block text-left">Full name</label>
            <input className="input mb-4" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <label className="label block text-left">Email</label>
            <input className="input mb-4" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label className="label block text-left">Password</label>
            <input className="input mb-6" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            {err && <p className="text-coral text-sm mb-4">{err}</p>}
            <button className="btn-coral w-full justify-center" disabled={busy}>
              {busy ? "Creating…" : role === "employer" ? "Create hiring account →" : "Create free profile →"}
            </button>
            <p className="text-sm text-muted mt-6">
              Already a member? <Link href="/login" className="text-coral font-semibold">Sign in</Link>
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
