/**
 * Assessment integrity signals.
 *
 * We cannot PREVENT a candidate using an AI chatbot on a second device.
 * What we can do is capture the signals that usually accompany it, score the
 * risk, and route anything suspicious to a human reviewer. This is a
 * detection aid, never proof — treat "high" as "a person should look at this".
 */

export type IntegrityRaw = {
  paste_events: number;              // pastes into answer fields
  paste_chars: number;               // total characters pasted
  focus_losses: number;              // times the tab/window lost focus
  focus_lost_seconds: number;        // cumulative time away
  per_question: Record<string, { seconds: number; chars: number; bursts: number }>;
  total_seconds: number;
  /* Server-measured, from assessment.started_at to submission. The client
     cannot alter these, so they act as a cross-check on everything above. */
  server_seconds?: number;
  total_answer_chars?: number;
};

export type IntegrityVerdict = {
  risk: "low" | "medium" | "high";
  score: number;                     // 0-100, higher = more suspicious
  flags: string[];
  detail: IntegrityRaw;
};

/** Plausible sustained typing is roughly 300-600 characters per minute. */
const IMPLAUSIBLE_CPM = 900;

export function assessIntegrity(raw: IntegrityRaw): IntegrityVerdict {
  const flags: string[] = [];
  let score = 0;

  // 1. Pasted answers — the clearest single signal.
  if (raw.paste_events > 0) {
    const big = raw.paste_chars >= 200;
    score += big ? 35 : 15;
    flags.push(big
      ? `Large paste detected (${raw.paste_chars} characters across ${raw.paste_events} paste${raw.paste_events === 1 ? "" : "s"})`
      : `Paste detected (${raw.paste_events})`);
  }

  // 2. Leaving the page repeatedly, especially for long stretches.
  if (raw.focus_losses >= 3) {
    const long = raw.focus_lost_seconds > 90;
    score += long ? 25 : 12;
    flags.push(`Left the assessment ${raw.focus_losses} times${long ? ` (${Math.round(raw.focus_lost_seconds)}s away)` : ""}`);
  }

  // 3. Answers produced faster than a human plausibly types them.
  const fast: string[] = [];
  for (const [qid, q] of Object.entries(raw.per_question || {})) {
    if (q.chars > 120 && q.seconds > 0) {
      const cpm = (q.chars / q.seconds) * 60;
      if (cpm > IMPLAUSIBLE_CPM) fast.push(qid);
    }
  }
  if (fast.length) {
    score += Math.min(30, fast.length * 15);
    flags.push(`Implausible typing speed on ${fast.length} answer${fast.length === 1 ? "" : "s"}`);
  }

  // 4. A long answer appearing in a single burst (typical of paste or dictation).
  const singleBurst = Object.entries(raw.per_question || {})
    .filter(([, q]) => q.chars > 250 && q.bursts <= 1).length;
  if (singleBurst) {
    score += Math.min(20, singleBurst * 10);
    flags.push(`${singleBurst} long answer${singleBurst === 1 ? "" : "s"} entered in one continuous burst`);
  }

  // 5. SERVER-SIDE CROSS-CHECK. Everything above is reported by the browser and
  //    could in principle be suppressed. These two come from the server clock
  //    and the stored answers, so they cannot be tampered with client-side.
  if (typeof raw.server_seconds === "number" && raw.server_seconds > 0) {
    const chars = raw.total_answer_chars ?? 0;

    // (a) Substantial work produced in implausibly little wall-clock time.
    if (chars > 400 && raw.server_seconds < 90) {
      score += 40;
      flags.push(`Server clock: ${chars} characters submitted ${Math.round(raw.server_seconds)}s after starting`);
    } else if (chars > 800 && raw.server_seconds < 240) {
      score += 25;
      flags.push(`Server clock: a long paper completed in ${Math.round(raw.server_seconds / 60)} minutes`);
    }

    // (b) The browser's reported time disagrees materially with the server's.
    //     A large gap means the client-side timing was not running honestly.
    if (raw.total_seconds > 0) {
      const ratio = raw.total_seconds / raw.server_seconds;
      if (ratio < 0.45 || ratio > 2.2) {
        score += 20;
        flags.push("Reported time on task does not match the server clock");
      }
    }
  }

  const risk = score >= 50 ? "high" : score >= 22 ? "medium" : "low";
  return { risk, score: Math.min(100, score), flags, detail: raw };
}
