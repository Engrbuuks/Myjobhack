"use client";
import { useState } from "react";
import { postJson } from "@/lib/apiClient";

type Member = {
  name: string; member_no: number; distinction: string | null;
  institution: string | null; course: string | null; graduation_year: number | null;
  chapter: string | null; class_year: number | null; verified_at: string | null;
};

/**
 * The check an employer runs on a credential letter.
 *
 * Deliberately plain: a code box and an answer. The one piece of care in here
 * is that a failure says the same thing whatever the reason, because the
 * route answers the same way for a typo and for a membership that has been
 * withdrawn, and the interface must not undo that by guessing.
 */
export function VerifyCredential() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; member?: Member; message: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function check() {
    if (code.trim().length < 6) return;
    setBusy(true); setErr(null); setResult(null);
    const res = await postJson("/api/elite/verify", { code });
    setBusy(false);
    if (res.ok) setResult(res.data as any);
    else setErr(res.error);
  }

  return (
    <div>
      <div className="card p-6">
        <label htmlFor="vcode" className="label">Verification code</label>
        <div className="flex flex-wrap gap-3">
          <input id="vcode" className="input flex-1 min-w-48 tracking-[.2em] uppercase"
            placeholder="A1B2C3D4" value={code} maxLength={32}
            onChange={(e) => { setCode(e.target.value); setResult(null); setErr(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") check(); }} />
          <button className="btn-coral" onClick={check} disabled={busy || code.trim().length < 6}>
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
        <p className="text-xs text-muted-2 mt-3">
          The code is printed on the credential letter the member sent you.
        </p>
      </div>

      {err && <p className="text-sm font-semibold text-coral mt-4">{err}</p>}

      {result && !result.valid && (
        <div className="card p-6 mt-5" style={{ background: "#FFF4F2", borderColor: "#FFC9C2" }}>
          <div className="font-display font-semibold text-lg mb-1">No current membership matches that code</div>
          <p className="text-sm text-muted">
            {result.message} Check the code against the letter. We give the same answer for a mistyped code and for
            a membership that is no longer current, so this is not confirmation either way about any individual.
          </p>
        </div>
      )}

      {result?.valid && result.member && (
        <div className="card p-7 mt-5">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 rounded-full bg-ink text-white grid place-items-center shrink-0" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4.5 12.5L10 18L20 6.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <div className="font-display font-semibold text-xl leading-tight">{result.member.name}</div>
              <div className="text-xs text-muted">
                Verified MYJOBHACK Elite member &middot; &#8470; {String(result.member.member_no).padStart(4, "0")}
              </div>
            </div>
          </div>

          <dl className="space-y-3 text-sm">
            {result.member.distinction && (
              <div className="flex gap-4"><dt className="w-32 shrink-0 text-muted">Distinction</dt>
                <dd className="font-semibold">{result.member.distinction}</dd></div>
            )}
            {result.member.institution && (
              <div className="flex gap-4"><dt className="w-32 shrink-0 text-muted">Institution</dt>
                <dd className="font-semibold">{result.member.institution}</dd></div>
            )}
            {result.member.course && (
              <div className="flex gap-4"><dt className="w-32 shrink-0 text-muted">Course</dt>
                <dd className="font-semibold">
                  {result.member.course}{result.member.graduation_year ? `, ${result.member.graduation_year}` : ""}
                </dd></div>
            )}
            {result.member.chapter && (
              <div className="flex gap-4"><dt className="w-32 shrink-0 text-muted">Chapter</dt>
                <dd className="font-semibold">{result.member.chapter}</dd></div>
            )}
            {result.member.class_year && (
              <div className="flex gap-4"><dt className="w-32 shrink-0 text-muted">Induction class</dt>
                <dd className="font-semibold">{result.member.class_year}</dd></div>
            )}
          </dl>

          <p className="text-xs text-muted leading-relaxed mt-6 pt-5 border-t border-line">
            {result.message} We examined the original credential document before granting membership. We do not
            vouch for anything beyond the credential: employment history, references and conduct are yours to check.
          </p>
        </div>
      )}
    </div>
  );
}
