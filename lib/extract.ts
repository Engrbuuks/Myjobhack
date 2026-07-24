import { SupabaseClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import { installPdfPolyfills } from "@/lib/pdfPolyfill";

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
      // PDFs containing images, logos or transforms make pdfjs reach for
      // browser globals that do not exist in a serverless runtime.
      installPdfPolyfills();

      let raw = "";
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(buf) });
        const parsed = await parser.getText();
        raw = parsed.text ?? "";
      } catch (primaryErr: any) {
        // Fallback: pdfjs directly, reading text items page by page. This path
        // touches none of the rendering code, so it survives PDFs that break
        // the higher-level wrapper.
        try {
          raw = await extractWithPdfJs(buf);
        } catch {
          throw primaryErr;   // report the original, more useful error
        }
      }
      const text = clean(raw);

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

/** Fallback: read text items straight from pdfjs, bypassing the wrapper. */
async function extractWithPdfJs(buf: Buffer): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Serverless bundles do not ship pdf.worker.mjs, so pdfjs fails trying to
  // spawn one ("Setting up fake worker failed"). Point the worker source at
  // nothing and disable it — everything then runs in the main thread, which is
  // what we want for text extraction anyway.
  // Point at the real worker file inside node_modules. This resolves correctly
  // now that pdfjs-dist is externalised from the bundle (see next.config.mjs).
  try {
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  } catch {
    /* If it cannot be resolved, pdfjs falls back to its own fake worker. */
  }

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    disableFontFace: true,     // no font rendering — we only want the text
    isEvalSupported: false,
    verbosity: 0
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push((content.items as any[]).map((it) => it.str ?? "").join(" "));
  }
  return pages.join("\n\n");
}

function clean(t: string): string {
  return t.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 24000);
}
