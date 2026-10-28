/**
 * Offer locations: one place, one spelling.
 *
 * Imported by client components as well as routes, so nothing here reaches
 * the database. The server half (finding or adding a row) takes a client as
 * an argument rather than creating one.
 */

/** The comparison key. Must match the unique index in 0065 exactly. */
export function locationKey(name: string): string {
  return String(name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** What is stored and shown: spaces tidied, the person's own casing kept. */
export function tidyLocationName(name: string): string {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * A job location as a place name.
 *
 * jobs.locations holds {country, state}. "Lagos" reads as a place on a letter;
 * "Lagos, Nigeria" is what a whole country entry would need, and "Nigeria" on
 * its own is only offered when the job covers the whole country.
 */
export function jobLocationLabel(l: { country?: string | null; state?: string | null }): string {
  return tidyLocationName(l?.state || l?.country || "");
}

export type OfferLocation = { id: string; name: string };

/** The filter's value for offers with no location. Not a uuid, so it cannot collide. */
export const UNTAGGED = "none";

/**
 * Find a location by name, or add it to the list.
 *
 * Used when the form sends a name rather than an id: a suggestion taken from
 * the job, or a new place added on purpose. Matching is on the normalised key,
 * so "ikeja " finds "Ikeja" instead of creating a second Ikeja. A race between
 * two people adding the same name is settled by the unique index: the loser
 * reads back the winner's row.
 */
export async function findOrAddLocation(
  admin: any, rawName: string, userId: string | null
): Promise<{ ok: true; location: OfferLocation; created: boolean } | { ok: false; error: string }> {
  const name = tidyLocationName(rawName);
  if (!name) return { ok: false, error: "A location needs a name." };
  const key = locationKey(name);

  const lookup = async () => {
    const { data, error } = await admin.from("offer_locations").select("id, name");
    if (error) return { error };
    return { found: (data ?? []).find((l: any) => locationKey(l.name) === key) as OfferLocation | undefined };
  };

  const first = await lookup();
  if ("error" in first && first.error) return { ok: false, error: missingTable(first.error.message) };
  if (first.found) return { ok: true, location: first.found, created: false };

  const { data: row, error } = await admin.from("offer_locations")
    .insert({ name, created_by: userId }).select("id, name").single();
  if (!error && row) return { ok: true, location: row, created: true };

  // Someone added the same place a moment ago. Use theirs.
  const again = await lookup();
  if (!("error" in again && again.error) && again.found)
    return { ok: true, location: again.found, created: false };
  return { ok: false, error: missingTable(error?.message ?? "The location could not be saved.") };
}

export function missingTable(message: string): string {
  return /offer_locations|location_id|does not exist|could not find/i.test(message)
    ? "Locations need migration 0065_offer_locations.sql. Run it in the Supabase SQL editor, then try again."
    : message;
}
