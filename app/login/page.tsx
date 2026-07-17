"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setErr(error.message); setBusy(false); return; }
    router.push("/"); router.refresh();
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between bg-ink text-white p-12 relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full bg-coral/20 blur-[120px]" />
        <span className="text-xs font-extrabold uppercase tracking-[.28em] text-[#FFB4AC]">Workforce transformation for Africa</span>
        <div>
          <h1 className="font-display font-semibold text-5xl leading-tight max-w-md">
            Every side of the table,<br /><em className="text-coral">one room.</em>
          </h1>
          <p className="mt-6 text-white/60 max-w-sm text-sm leading-relaxed">
            Talent gets discovered. Employers hire people who arrive ready. Experts teach rooms we fill for them. Sign in — your portal knows who you are.
          </p>
        </div>
        <span className="text-white/40 text-xs">myjobhack.co</span>
      </section>

      <section className="flex items-center justify-center p-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <h2 className="font-display font-semibold text-3xl mb-1">Welcome back</h2>
          <p className="text-muted text-sm mb-8">Sign in to your MYJOBHACK portal.</p>
          <label className="label">Email</label>
          <input className="input mb-4" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="label">Password</label>
          <input className="input mb-6" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p className="text-coral text-sm mb-4">{err}</p>}
          <button className="btn-coral w-full justify-center" disabled={busy}>
            {busy ? "Signing in…" : "Sign in →"}
          </button>
          <p className="text-sm text-muted mt-6">
            New here? <Link href="/signup" className="text-coral font-semibold">Create your free profile</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
