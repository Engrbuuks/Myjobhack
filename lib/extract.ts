import { SupabaseClient } from "@supabase/supabase-js";
import mammoth from "mammoth";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Download a stored document and extract plain text (PDF or DOCX). */
export async function extractDocumentText(
  supabase: SupabaseClient, documentId: string
): Promise<{ text: string | null; error: string | null; name?: string }> {
  const { data: doc } = await supabase
    .from("documents").select("bucket, path, mime, original_name").eq("id", documentId).single();
  if (!doc) return { text: null, error: "Document not found" };

  const { data: file, error: dlErr } = await supabase.storage.from(doc.bucket).download(doc.path);
  if (dlErr || !file) return { text: null, error: dlErr?.message ?? "Download failed" };
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    if (doc.mime === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const parsed = await parser.getText();
      return { text: clean(parsed.text), error: null, name: doc.original_name };
    }
    if (doc.mime === DOCX_MIME || doc.path.endsWith(".docx")) {
      const r = await mammoth.extractRawText({ buffer: buf });
      return { text: clean(r.value), error: null, name: doc.original_name };
    }
  } catch (e: any) {
    return { text: null, error: `Could not read ${doc.original_name}: ${e?.message ?? "parse error"}` };
  }
  return { text: null, error: "Unsupported file type for text extraction" };
}

function clean(t: string): string {
  return t.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 24000);
}
