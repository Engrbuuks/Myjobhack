"use client";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AiToolRunner } from "@/components/AiToolRunner";

export default function InterviewPrepPage() {
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [role, setRole] = useState("");
  const [jd, setJd] = useState("");

  return (
    <>
      <PageHeader
        title="Interview Preparer"
        sub="Everything needed to ace the room — your introduction, their likely questions with strong answers, and the questions that impress when you ask them."
      />
      <AiToolRunner
        endpoint="/api/ai/interview-prep"
        runLabel="Prepare me →"
        buildBody={() => ({ company, website, role, jd_text: jd })}
      >
        {(setReady) => {
          const update = (fn: () => void) => { fn(); setTimeout(() => setReady(!!(company && role)), 0); };
          return (
            <div className="space-y-4 mb-4 max-w-xl">
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="label">Company name *</label>
                  <input className="input" value={company} onChange={(e) => update(() => setCompany(e.target.value))} /></div>
                <div><label className="label">Company website</label>
                  <input className="input" placeholder="https://…" value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
              </div>
              <div><label className="label">Role you&rsquo;re interviewing for *</label>
                <input className="input" value={role} onChange={(e) => update(() => setRole(e.target.value))} /></div>
              <div><label className="label">Job description — paste it (recommended)</label>
                <textarea className="input !h-auto py-3" rows={6}
                  placeholder="Paste the full JD here for sharper preparation…"
                  value={jd} onChange={(e) => setJd(e.target.value)} /></div>
            </div>
          );
        }}
      </AiToolRunner>
    </>
  );
}
