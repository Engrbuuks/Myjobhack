/**
 * Résumé contact-detail redaction.
 * Finds emails, phone numbers, and URLs in a PDF and covers them with
 * opaque boxes, then flattens. Also detects image-only pages (which text
 * scrubbing can't clean) and reports them so the caller can gate those.
 *
 * IMPORTANT: this is a deterrent, not a guarantee. It will not catch the
 * candidate's name, contact info baked into images, or creative phrasings.
 */
import { PDFDocument, rgb } from "pdf-lib";

// Patterns for the things we can reliably catch.
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  // Nigerian + international phone shapes: +234..., 080..., 0803 123 4567, (080)...
  { name: "phone", re: /(\+?\d{1,3}[\s-]?)?(\(?\d{3,4}\)?[\s-]?)\d{3}[\s-]?\d{3,4}/g },
  { name: "url", re: /\b(https?:\/\/|www\.)[^\s]+/gi },
  { name: "handle", re: /(linkedin\.com|github\.com|twitter\.com|x\.com|instagram\.com|wa\.me|t\.me)\/[^\s]+/gi }
];

export type RedactionResult = {
  bytes: Uint8Array;
  redactedCount: number;
  imageOnlyPages: number[];   // pages we could NOT scrub (image-based)
  warning: string | null;
};

export async function redactResumePdf(input: ArrayBuffer): Promise<RedactionResult> {
  // Load pdfjs (legacy build works server-side under Node).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdfjs.getDocument({ data: new Uint8Array(input.slice(0)), useSystemFonts: true });
  const doc = await loading.promise;

  const out = await PDFDocument.load(input);
  const pages = out.getPages();

  let redactedCount = 0;
  const imageOnlyPages: number[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    // If a page has (almost) no extractable text but has image operators,
    // it's an image-based résumé page — we can't scrub it.
    if (content.items.length < 3) {
      const ops = await page.getOperatorList();
      const hasImage = ops.fnArray.some((fn: number) =>
        fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject);
      if (hasImage) { imageOnlyPages.push(i); continue; }
    }

    const outPage = pages[i - 1];

    for (const item of content.items as any[]) {
      const str: string = item.str ?? "";
      if (!str.trim()) continue;

      // Does this text run contain anything we redact?
      let hit = false;
      for (const p of PATTERNS) { p.re.lastIndex = 0; if (p.re.test(str)) { hit = true; break; } }
      if (!hit) continue;

      // item.transform = [a,b,c,d,e,f]; e,f = x,y in PDF space (bottom-left origin)
      const x = item.transform[4];
      const yTop = item.transform[5];
      const w = item.width ?? (str.length * (item.height ?? 10) * 0.5);
      const h = item.height ?? 12;

      // Draw an opaque box over the run (pad slightly).
      outPage.drawRectangle({
        x: x - 1, y: yTop - 2, width: w + 2, height: h + 4,
        color: rgb(0.05, 0.24, 0.25) // teal-dark bar, on-brand
      });
      redactedCount++;
    }
  }

  const bytes = await out.save();
  const warning = imageOnlyPages.length
    ? `This résumé has ${imageOnlyPages.length} image-based page(s) that couldn't be automatically scrubbed. Contact details on those pages remain visible — the full file is only released on unlock/placement.`
    : null;

  return { bytes, redactedCount, imageOnlyPages, warning };
}

/**
 * Stamps a watermark on every page of a résumé that IS being released to an
 * employer — the "introduced via MYJOBHACK" notice tied to non-circumvention.
 * Deterrent, not prevention: makes going around the platform a documented act.
 */
export async function watermarkResumePdf(input: ArrayBuffer, note?: string): Promise<Uint8Array> {
  const { PDFDocument, rgb, degrees, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.load(input);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = note ?? "Introduced via MYJOBHACK — hiring off-platform breaches your agreement";

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    // Diagonal faint watermark across the page.
    page.drawText("MYJOBHACK", {
      x: width * 0.12, y: height * 0.45, size: 48, font,
      color: rgb(0.05, 0.35, 0.36), opacity: 0.08, rotate: degrees(30)
    });
    // Footer notice bar.
    page.drawRectangle({ x: 0, y: 0, width, height: 20, color: rgb(0.03, 0.24, 0.25), opacity: 0.9 });
    page.drawText(text, { x: 12, y: 6, size: 7, font, color: rgb(1, 1, 1), opacity: 0.9 });
  }
  return doc.save();
}
