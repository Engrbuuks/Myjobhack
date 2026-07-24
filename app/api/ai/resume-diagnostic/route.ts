import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractDocumentText } from "@/lib/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Why won't my résumé parse? Reports what is actually stored and what the
 * extractor found, so the answer is "it's a scan" or "the mime was wrong"
 * rather than a guess.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: talent } = await supabase.from("talent_profiles")
    .select("resume_document_id").eq("profile_id", user.id).maybeSingle();
  if (!talent?.resume_document_id)
    return NextResponse.json({ has_resume: false, verdict: "No résumé on file." });

  const { data: doc } = await supabase.from("documents")
    .select("bucket, path, mime, original_name, created_at")
    .eq("id", talent.resume_document_id).maybeSingle();

  const ex = await extractDocumentText(supabase, talent.resume_document_id);

  return NextResponse.json({
    has_resume: true,
    file: {
      name: doc?.original_name ?? null,
      stored_mime: doc?.mime ?? "(none recorded)",
      extension: String(doc?.path ?? "").split(".").pop() ?? "?",
      uploaded: doc?.created_at ?? null
    },
    extraction: {
      succeeded: !!ex.text,
      characters: ex.text?.length ?? 0,
      error: ex.error ?? null,
      diagnostic: ex.diagnostic ?? null,
      preview: ex.text ? ex.text.slice(0, 200) : null
    },
    verdict: ex.text
      ? `Text extracted successfully — ${ex.text.length} characters. Import will work.`
      : ex.error?.includes("no readable text layer")
        ? "This PDF is a scan or an image export. There is no text to read. Re-save it as a text-based PDF from Word or Google Docs, or type the roles in manually."
        : `Extraction failed: ${ex.error}`
  }, { headers: { "Cache-Control": "no-store" } });
}
