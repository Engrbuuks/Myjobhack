import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Closed. This diagnostic moved to /api/admin/signup-doctor.
 *
 * WHY THIS FILE STILL EXISTS RATHER THAN BEING DELETED: middleware treats the
 * whole /api/public prefix as public by startsWith, so while a handler sat
 * here it answered anyone on the internet. The old version used the service
 * role client and returned real data. Overwriting it with this is what makes
 * replacing the folder enough; deleting the file is equally fine.
 *
 * It touches nothing: no database client, no environment variables, no
 * reasoning about the caller. It exists to occupy the path.
 */
export async function GET() {
  return NextResponse.json({
    error: "Not found.",
    moved_to: "/api/admin/signup-doctor"
  }, { status: 404 });
}
