import { SupabaseClient } from "@supabase/supabase-js";
import mammoth from "mammoth";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Download a stored document and extract plain text (PDF or DOCX).
 *
 * Detection is deliberately forgiving: the stored mime is often wrong, empty,
 * or "application/octet-stream" depending on how the file was uploaded. We
 * sniff the actual file bytes rather than trusting metadata, because a correct
 * PDF being rejected as "unsupported" is a confusing failure for the user.
 */
export async function extractDocumentText(
  supabase: SupabaseClient, documentId: string
): Promise<{ text: string | null; error: string | null; name?: string; diagnostic?: string }> {
  const { data: doc } = await supabase
    .from("documents").select("bucket, path, mime, original_name").eq("id", documentId).single();
  if (!doc) return { text: null, error: "Document not found" };

  const { data: file, error: dlErr } = await supabase.storage.from(doc.bucket).download(doc.path);
  if (dlErr || !file) return { text: null, error: dlErr?.message ?? "Download failed" };
  const buf = Buffer.from(await file.arrayBuffer());

  const name = doc.original_name ?? doc.path;
  const lowerPath = String(doc.path).toLowerCase();
  const lowerName = String(name).toLowerCase();

  // Sniff the magic bytes — far more reliable than the stored mime.
  const header = buf.subarray(0, 5).toString("latin1");
  const isPdfBytes = header.startsWith("%PDF");
  const isZipBytes = buf[0] === 0x50 && buf[1] === 0x4b;   // docx is a zip

  const looksPdf = isPdfBytes
    || doc.mime?.includes("pdf")
    || lowerPath.endsWith(".pdf") || lowerName.endsWith(".pdf");

  const looksDocx = (isZipBytes && (lowerPath.endsWith(".docx") || lowerName.endsWith(".docx")))
    || doc.mime === DOCX_MIME;

  try {
    if (looksPdf) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const parsed = await parser.getText();
      const text = clean(parsed.text ?? "");

      // A PDF that parses but yields almost nothing is a scan — say so plainly
      // rather than reporting a generic failure.
      if (text.length < 40) {
        return {
          text: null, name,
          error: "This PDF has no readable text layer — it looks like a scan or an exported image.",
          diagnostic: `parsed ok, extracted ${text.length} characters`
        };
      }
      return { text, error: null, name };
    }

    if (looksDocx) {
      const r = await mammoth.extractRawText({ buffer: buf });
      const text = clean(r.value ?? "");
      if (text.length < 40)
        return { text: null, name, error: "We couldn't find text in that Word document.", diagnostic: `extracted ${text.length} characters` };
      return { text, error: null, name };
    }
  } catch (e: any) {
    return {
      text: null, name,
      error: `Could not read ${name}: ${e?.message ?? "parse error"}`,
      diagnostic: `mime=${doc.mime ?? "none"} header=${JSON.stringify(header)}`
    };
  }

  return {
    text: null, name,
    error: "That file type isn't supported. Upload a PDF or Word document.",
    diagnostic: `mime=${doc.mime ?? "none"} path=${lowerPath.slice(-12)} header=${JSON.stringify(header)}`
  };
}

function clean(t: string): string {
  return t.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 24000);
}
