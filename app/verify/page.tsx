import type { Metadata } from "next";
import Link from "next/link";
import { VerifyCredential } from "@/components/VerifyCredential";

export const metadata: Metadata = {
  title: "Verify an Elite credential — MYJOBHACK",
  description:
    "Check a MYJOBHACK Elite membership. Enter the code from the credential letter to see the current status.",
  alternates: { canonical: "https://app.myjobhack.co/verify" }
};

/**
 * Open to everyone, which is the point of it.
 *
 * An employer who receives a credential letter needs to be able to check it
 * without an account, without being sold anything, and without us knowing who
 * they are. That is what makes the letter worth attaching to an application.
 */
export default function VerifyPage() {
  return (
    <main className="min-h-screen bg-paper px-5 py-14">
      <div className="max-w-xl mx-auto">
        <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-coral">Credential check</div>
        <h1 className="font-display font-semibold text-3xl sm:text-4xl mt-3 leading-tight">
          Is this membership current?
        </h1>
        <p className="text-sm text-muted mt-3 leading-relaxed">
          MYJOBHACK Elite membership is granted only after our team has examined the original credential document.
          Enter the code from the letter and you will see the live status, not a copy of it.
        </p>

        <div className="mt-8">
          <VerifyCredential />
        </div>

        <div className="mt-10 pt-6 border-t border-line text-sm text-muted">
          <p className="mb-3">
            Hiring and want candidates whose credentials are already checked?
          </p>
          <Link href="/roles" className="btn-ghost">See how MYJOBHACK works</Link>
        </div>
      </div>
    </main>
  );
}
