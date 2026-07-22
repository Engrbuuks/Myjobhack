"use client";
import { useState } from "react";
import type { CandidateCard as Card } from "@/lib/candidateCard";

export function CandidateCard({ card, onUnlock }: { card: Card; onUnlock?: (talentId: string) => void }) {
  const [unlocking, setUnlocking] = useState(false);

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-lg truncate">{card.display_name}</h3>
            {card.is_elite && <span className="px-2 py-0.5 rounded-pill bg-coral text-white text-[10px] font-bold uppercase tracking-wider">Elite</span>}
            {!card.released && <span className="text-[10px] font-bold uppercase tracking-wider text-muted-2">🔒 Contact locked</span>}
          </div>
          {card.headline && <p className="text-sm text-muted-2 truncate">{card.headline}</p>}
        </div>
        {card.competency_band && (
          <div className="text-center shrink-0">
            <div className="font-display font-semibold text-xl text-coral">{card.competency_band}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2">Competency{card.competency_score != null ? ` · ${Math.round(card.competency_score)}` : ""}</div>
            {card.assessment_integrity && (
              <div className="mt-1.5">
                {card.assessment_integrity === "clean" && (
                  <span className="px-2 py-0.5 rounded-pill bg-paper-2 text-[10px] font-bold uppercase tracking-wider text-muted"
                    title="No integrity concerns were detected during this assessment.">✓ Clean sitting</span>
                )}
                {card.assessment_integrity === "reviewed" && (
                  <span className="px-2 py-0.5 rounded-pill bg-mint text-[10px] font-bold uppercase tracking-wider text-ink"
                    title="This result was confirmed by a human reviewer.">✓ Human-reviewed</span>
                )}
                {card.assessment_integrity === "flagged" && (
                  <span className="px-2 py-0.5 rounded-pill bg-coral text-white text-[10px] font-bold uppercase tracking-wider"
                    title="Integrity signals were raised during this assessment and it is under review.">⚑ Under review</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-2 mb-3">
        {card.niche && <span>◈ {card.niche}</span>}
        {card.role_level && <span className="capitalize">◴ {card.role_level}</span>}
        <span>◷ {card.years_experience} yr{card.years_experience === 1 ? "" : "s"} experience</span>
        {card.work_mode && <span className="capitalize">⚑ {card.work_mode.replace("_", " ")}</span>}
      </div>

      {card.summary && <p className="text-sm leading-relaxed mb-4">{card.summary}</p>}

      {/* Skills */}
      {card.skills.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-1.5">Skills</div>
          <div className="flex flex-wrap gap-1.5">
            {card.skills.slice(0, 14).map((s) => (
              <span key={s} className="px-2 py-0.5 rounded-pill bg-paper-2 text-xs font-medium">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Experience */}
      {card.experience.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-2">Experience</div>
          <div className="space-y-2.5">
            {card.experience.map((e, i) => (
              <div key={i} className="text-sm">
                <div className="font-semibold">{e.title}{e.company && <span className="text-muted-2 font-normal"> · {e.company}</span>}</div>
                {e.period && <div className="text-xs text-muted-2">{e.period}</div>}
                {e.summary && <p className="text-[13px] text-muted-2 mt-0.5 leading-relaxed">{e.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credentials */}
      {card.credentials.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-2">Credentials</div>
          <div className="space-y-1">
            {card.credentials.map((c, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{c.title}</span>
                {c.institution && <span className="text-muted-2"> · {c.institution}</span>}
                {c.year && <span className="text-muted-2"> · {c.year}</span>}
                {c.distinction && <span className="ml-1 px-1.5 py-0.5 rounded bg-coral-soft text-coral text-[10px] font-bold">{c.distinction}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer: contact + résumé gate */}
      <div className="pt-3 border-t border-line flex items-center justify-between gap-3">
        {card.released ? (
          <>
            <span className="text-xs text-green-600 font-semibold">✓ Contact unlocked</span>
            {card.resume_url && <a href={card.resume_url} target="_blank" rel="noopener" className="text-coral text-sm font-semibold">Open full résumé →</a>}
          </>
        ) : (
          <>
            <span className="text-xs text-muted-2">Contact details and full résumé unlock after you engage this candidate.</span>
            {onUnlock && (
              <button className="btn-coral !h-9 text-xs" disabled={unlocking}
                onClick={async () => { setUnlocking(true); await onUnlock(card.talent_id); setUnlocking(false); }}>
                {unlocking ? "Unlocking…" : "Unlock contact"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
