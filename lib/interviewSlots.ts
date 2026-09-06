/**
 * Generate interview slots for a batch of candidates.
 *
 * The problem this solves: inviting 33 people to interview means 33 different
 * times, spread across working days, skipping lunch, not running past close,
 * and never putting two people in the same slot. Doing that by hand is where
 * double bookings come from.
 *
 * Everything here is pure and deterministic, so the preview shown before
 * sending is exactly what gets written.
 */

export type SlotRules = {
  /** First day of interviewing, as YYYY-MM-DD. */
  start_date: string;
  /**
   * Last day of interviewing, as YYYY-MM-DD. Optional.
   *
   * Without it a batch spills across as many days as it needs, which is not
   * what you want when the whole point is "everyone tomorrow". With it, slot
   * generation stops at the end of that day and reports the shortfall instead
   * of quietly booking people into next week.
   */
  end_date?: string | null;
  /** Working window each day, as HH:MM in the interviewer's timezone. */
  day_start: string;
  day_end: string;
  /** Length of each interview. */
  slot_minutes: number;
  /** Breathing room between interviews. Zero means back to back. */
  gap_minutes: number;
  /** Optional lunch break, skipped entirely. */
  break_start?: string | null;
  break_end?: string | null;
  /** Which weekdays to use. 0 is Sunday. Defaults to Monday to Friday. */
  weekdays?: number[];
  /** IANA timezone, recorded so the invitation can state it. */
  timezone?: string;
};

export type Slot = { start: Date; end: Date; label: string };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Build the next `count` slots from the rules.
 *
 * Days roll forward automatically: when a day is full the next working day
 * starts fresh at day_start, so a batch of 33 simply spills across as many
 * days as it needs rather than being crammed into one.
 */
export function generateSlots(count: number, rules: SlotRules): Slot[] {
  const slots: Slot[] = [];
  if (count <= 0) return slots;

  const step = Math.max(5, rules.slot_minutes) + Math.max(0, rules.gap_minutes);
  const dayStart = toMinutes(rules.day_start);
  const dayEnd = toMinutes(rules.day_end);
  const breakStart = rules.break_start ? toMinutes(rules.break_start) : null;
  const breakEnd = rules.break_end ? toMinutes(rules.break_end) : null;
  const weekdays = rules.weekdays?.length ? rules.weekdays : [1, 2, 3, 4, 5];

  if (dayEnd <= dayStart) return slots;   // nonsense window, refuse rather than loop

  const [y, m, d] = rules.start_date.split("-").map(Number);
  let day = new Date(y, (m || 1) - 1, d || 1);

  let lastDay: Date | null = null;
  if (rules.end_date) {
    const [ey, em, ed] = rules.end_date.split("-").map(Number);
    lastDay = new Date(ey, (em || 1) - 1, ed || 1);
    lastDay.setHours(23, 59, 59, 999);
    if (lastDay < day) return slots;   // end before start: refuse rather than loop
  }
  let cursor = dayStart;
  let guard = 0;

  while (slots.length < count && guard < 5000) {
    guard++;

    // Stop at the end of the window rather than running into later days.
    if (lastDay && day > lastDay) break;

    // Skip days not being used for interviews.
    if (!weekdays.includes(day.getDay())) {
      day = new Date(day.getTime() + 86_400_000);
      cursor = dayStart;
      continue;
    }

    const end = cursor + rules.slot_minutes;

    // Slot would run past the end of the day: move to the next day.
    if (end > dayEnd) {
      day = new Date(day.getTime() + 86_400_000);
      cursor = dayStart;
      continue;
    }

    // Slot would overlap the break: jump to the end of the break.
    if (breakStart !== null && breakEnd !== null && cursor < breakEnd && end > breakStart) {
      cursor = breakEnd;
      continue;
    }

    const startAt = new Date(day); startAt.setHours(0, cursor, 0, 0);
    const endAt = new Date(day); endAt.setHours(0, end, 0, 0);
    slots.push({
      start: startAt, end: endAt,
      label: startAt.toLocaleString("en-GB", {
        weekday: "short", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: false
      })
    });
    cursor += step;
  }

  return slots;
}

/** How many days a batch will span, for the summary before sending. */
export function summarise(slots: Slot[]): {
  days: number; first: string; last: string; per_day: Record<string, number>;
} {
  const per_day: Record<string, number> = {};
  slots.forEach((s) => {
    const key = s.start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    per_day[key] = (per_day[key] ?? 0) + 1;
  });
  return {
    days: Object.keys(per_day).length,
    first: slots[0]?.label ?? "",
    last: slots[slots.length - 1]?.label ?? "",
    per_day
  };
}

/** Sanity checks worth surfacing before 33 emails go out. */
export function warnings(count: number, slots: Slot[], rules: SlotRules): string[] {
  const out: string[] = [];
  if (slots.length < count) {
    const short = count - slots.length;
    const perDay = rules.slot_minutes + rules.gap_minutes;
    const windowMins = (Number(rules.day_end.split(":")[0]) * 60 + Number(rules.day_end.split(":")[1]))
      - (Number(rules.day_start.split(":")[0]) * 60 + Number(rules.day_start.split(":")[1]));
    const fitPerDay = Math.max(0, Math.floor(windowMins / perDay));
    out.push(
      `Only ${slots.length} of ${count} candidates fit in this window, leaving ${short} unscheduled. ` +
      `At ${rules.slot_minutes} minutes plus a ${rules.gap_minutes} minute gap you fit about ${fitPerDay} per day. ` +
      `To fit everyone: extend the end date, lengthen the day, shorten each interview, or reduce the gap.`
    );
  }

  const perDay = summarise(slots).per_day;
  const busiest = Math.max(0, ...Object.values(perDay));
  if (busiest > 12)
    out.push(`One day has ${busiest} interviews. That is a long day, and later candidates usually get a tired interviewer.`);

  const totalMinutes = rules.slot_minutes * count;
  if (rules.slot_minutes < 15)
    out.push("Slots under fifteen minutes rarely leave room for a real conversation.");
  if (rules.gap_minutes === 0 && count > 6)
    out.push("With no gap between interviews, one overrunning conversation pushes every later candidate back.");

  return out;
}
