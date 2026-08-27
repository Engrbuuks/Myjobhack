"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function changeEmail() {
    setBusy("email"); setErr(null); setNote(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    setNote("Confirmation emails sent to both addresses — the change completes when you confirm.");
    setNewEmail("");
  }
  async function changePassword() {
    if (pw1.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pw1 !== pw2) { setErr("Passwords don't match."); return; }
    setBusy("pw"); setErr(null); setNote(null);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    setNote("Password updated ✓"); setPw1(""); setPw2("");
  }

  return (
    <div className="min-h-screen bg-paper flex items-start justify-center p-6 pt-16">
      <div className="w-full max-w-md">
        <button className="text-sm font-semibold text-muted hover:text-coral transition mb-5" onClick={() => router.back()}>
          ← Back to my portal
        </button>
        <div className="card p-7">
          <h1 className="font-display font-semibold text-2xl mb-1">Account</h1>
          <p className="text-sm text-muted mb-7">Signed in as <b>{email}</b></p>

          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-3">Change email</div>
          <input className="input mb-3" type="email" placeholder="new@email.com"
            value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <button className="btn-ghost !h-11 mb-8" onClick={changeEmail} disabled={busy !== null || !newEmail}>
            {busy === "email" ? "Sending…" : "Update email"}
          </button>

          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-3">Change password</div>
          <input className="input mb-3" type="password" placeholder="New password (8+ characters)"
            value={pw1} onChange={(e) => setPw1(e.target.value)} />
          <input className="input mb-3" type="password" placeholder="Repeat new password"
            value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <button className="btn-coral !h-11" onClick={changePassword} disabled={busy !== null}>
            {busy === "pw" ? "Updating…" : "Update password"}
          </button>

          {note && <p className="text-sm text-muted mt-5">{note}</p>}
          {err && <p className="text-sm text-coral mt-5">{err}</p>}
        </div>
      </div>
    </div>
  );
}
