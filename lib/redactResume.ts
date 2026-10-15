/**
 * Résumé contact-detail redaction.
 *
 * Finds emails, phone numbers and URLs in a PDF, covers them with opaque
 * boxes, and then RASTERISES every page so the covered text is gone rather
 * than merely hidden. Also detects image-only pages (which text scrubbing
 * can't clean) and refuses them outright.
 *
 * WHY RASTERISING IS NOT OPTIONAL, AND WHY IT COMES SECOND
 * -------------------------------------------------------
 * A box drawn with pdf-lib is an extra operator painted on top of the page.
 * It changes nothing in the content stream underneath, so every email and
 * phone number we "redacted" still came back from copy and paste, from
 * pdftotext, and from any PDF library. For two years this file claimed to
 * flatten the pages and never did. An employer who had not paid could read
 * every candidate's contact details out of the preview.
 *
 * The two steps only work in this order:
 *   1. box the matching runs  -> hides the PIXELS
 *   2. rasterise the result   -> destroys the recoverable TEXT LAYER
 * Rasterising first would bake the contact details into the bitmap, visible
 * to anyone with eyes. Boxing without rasterising is the bug above. If you
 * are here to make this route faster, the rasterising pass is the whole
 * feature: take the page cap or the DPI down, never the pass itself.
 *
 * STILL A DETERRENT, NOT A GUARANTEE: it will not catch the candidate's
 * name, details baked into a photograph, or creative phrasings. What it does
 * guarantee is that whatever the boxes cover cannot be read back as text.
 */
import { PDFDocument, rgb } from "pdf-lib";

/**
 * Separator class for phone patterns.
 *
 * Deliberately excludes the newline that joinPageItems inserts at a line
 * break. \s would let a phone pattern run across two unrelated lines and
 * black out most of a page.
 */
const SEP = "[ \\t.\\u00A0\\u2007\\u202F_-]";

// Patterns for the things we can reliably catch.
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  /**
   * Nigerian mobile numbers, written the way Nigerians actually write them.
   *
   * The generic pattern below misses most of these: a candidate typing
   * +234 803 123 4567, 0803.123.4567 or (0803) 123 4567 was simply not
   * redacted. Country code form first so it wins over the local form on the
   * same digits.
   */
  { name: "phone_ng_intl", re: new RegExp(`\\+?234${SEP}{0,2}\\(?0?\\d{3}\\)?${SEP}{0,2}\\d{3}${SEP}{0,2}\\d{4}`, "g") },
  { name: "phone_ng_local", re: new RegExp(`\\(?0\\d{3}\\)?${SEP}{0,2}\\d{3}${SEP}{0,2}\\d{3,4}`, "g") },
  // International phone shapes: +234..., 080..., 0803 123 4567, (080)...
  { name: "phone", re: new RegExp(`(\\+?\\d{1,3}${SEP}?)?(\\(?\\d{3,4}\\)?${SEP}?)\\d{3}${SEP}?\\d{3,4}`, "g") },
  { name: "url", re: /\b(https?:\/\/|www\.)[^\s]+/gi },
  { name: "handle", re: /(linkedin\.com|github\.com|twitter\.com|x\.com|instagram\.com|wa\.me|t\.me)\/[^\s]+/gi }
];

/** Render resolution. 150 DPI is readable on screen without inflating the file. */
const RASTER_DPI = 150;
const RASTER_SCALE = RASTER_DPI / 72;

/**
 * Hard ceilings. Rasterising is CPU bound and runs inside a request, so an
 * unusual document must be refused rather than allowed to hold a serverless
 * function until the platform kills it mid response. Both ceilings fail
 * CLOSED: no file goes out.
 */
const MAX_PAGES = 15;
const RASTER_DEADLINE_MS = 25_000;

/** No single page bitmap wider or taller than this, whatever the paper size. */
const MAX_PIXELS_PER_SIDE = 4200;

/**
 * Why a résumé could not be safely prepared.
 *
 * The route turns this into a 409 with the reason attached. Every path that
 * cannot prove the contact details are gone must throw one of these, because
 * the alternative the old code took was emitting the unscrubbed original with
 * a warning in an HTTP header that no browser ever shows anyone.
 */
export type RedactionFailureReason =
  | "image_only_pages"
  | "too_many_pages"
  | "raster_timeout"
  | "raster_failed"
  | "parse_failed";

export class RedactionError extends Error {
  readonly reason: RedactionFailureReason;
  constructor(reason: RedactionFailureReason, message: string) {
    super(message);
    this.name = "RedactionError";
    this.reason = reason;
  }
}

export type RedactionResult = {
  bytes: Uint8Array;
  redactedCount: number;
  pageCount: number;
  /** Milliseconds spent in the rasterising pass, for cost monitoring. */
  rasterMs: number;
};

/** One text run we are going to cover, with its place in the joined page text. */
type Span = { start: number; end: number; item: any };

/** A page's text items, classified. */
type Run = { str: string; item: any; isGap: boolean; isEol: boolean };

function pageRuns(items: any[]): Run[] {
  const runs: Run[] = [];
  for (const item of items) {
    if (typeof item?.str !== "string") continue;   // marked content entries carry no text
    runs.push({
      str: item.str,
      item,
      /**
       * pdfjs inserts a whitespace item of its own wherever it infers a gap
       * between two positioning runs. It has no glyph behind it, which is
       * exactly how we spot it: height is 0 where every real run has a size.
       */
      isGap: (item.height ?? 0) === 0 && item.str.length > 0 && item.str.trim() === "",
      isEol: !!item.hasEOL
    });
  }
  return runs;
}

/**
 * Join a page's text items into one string, remembering where each item
 * landed in it.
 *
 * WHY: pdfjs emits one item per positioning run, not per word. A header the
 * PDF laid out as "john", "@", "example.com", or a phone number split at a
 * tab stop, matches nothing when each run is tested on its own, so it was
 * never covered. Testing the joined string and mapping hits back to the runs
 * they span is the only way to catch those. After rasterising this matters
 * more, not less: anything the boxes miss is permanently visible and no
 * longer selectable, so nobody will ever notice it was missed.
 *
 * Items are joined with NO separator of ours, because inserting a space would
 * break exactly the split email we are trying to catch. A newline goes in at a
 * line break so patterns cannot run between unrelated lines.
 *
 * dropInferredGaps drops pdfjs's own inserted whitespace. Both settings are
 * needed and neither alone is enough: keeping the gaps is how
 * "0803 123 4567" stays matchable as written, and dropping them is how
 * "ada.obi" + "@" + "example.com" becomes an address at all. pdfjs reports
 * that split header as "ada.obi @example.com", which matches no email pattern
 * ever written.
 */
function buildJoin(runs: Run[], dropInferredGaps: boolean): { text: string; spans: Span[] } {
  let text = "";
  const spans: Span[] = [];
  for (const r of runs) {
    if (r.str.length && !(dropInferredGaps && r.isGap)) {
      // Whitespace is worth joining but never worth boxing: a zero height
      // rectangle over a space covers nothing and inflates the count.
      if (r.str.trim().length) spans.push({ start: text.length, end: text.length + r.str.length, item: r.item });
      text += r.str;
    }
    if (r.isEol) text += "\n";
  }
  return { text, spans };
}

/** Every text item touched by a pattern match, under either join. */
function itemsToRedact(runs: Run[]): any[] {
  // Keyed on the pdfjs item itself, so an item found under both joins is
  // boxed once.
  const hits = new Set<any>();

  for (const dropInferredGaps of [false, true]) {
    const { text, spans } = buildJoin(runs, dropInferredGaps);
    if (!text.trim() || !spans.length) continue;

    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = p.re.exec(text)) !== null) {
        if (!m[0].length) { p.re.lastIndex++; continue; }   // never loop on an empty match
        const start = m.index;
        const end = start + m[0].length;
        // Any run that overlaps the match gets covered whole. Covering too much is
        // the safe direction to err in.
        for (const sp of spans) if (sp.start < end && sp.end > start) hits.add(sp.item);
      }
    }
  }
  // Array.from, not a spread: this repo's tsconfig sets no target, so it
  // compiles down to ES5 where spreading a Set needs downlevelIteration.
  return Array.from(hits);
}

/** Load pdfjs the way lib/extract.ts does, so both paths behave the same. */
async function loadPdfjs(): Promise<any> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Same serverless constraint as text extraction: no worker file is bundled,
  // so run in the main thread instead of trying to spawn one.
  // Vercel prunes files nothing statically imports, so pdf.worker.mjs was
  // never deployed — hence "Cannot find module .../pdf.worker.mjs".
  // Importing the worker module here makes the bundler treat it as a real
  // dependency and ship it. pdfjs then finds it where it expects.
  try {
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  } catch {
    /* If it will not load, pdfjs falls back to running in the main thread. */
  }
  return pdfjs;
}

/**
 * Install the real canvas backed browser globals pdfjs needs to RENDER.
 *
 * lib/pdfPolyfill.ts installs deliberately inert stand ins so text extraction
 * never pulls in a native canvas. Those stand ins return identity matrices and
 * draw nothing, so if extraction has already run in this process the globals
 * are present but useless and every rasterised page comes out blank or
 * mangled. We therefore OVERWRITE them rather than filling a gap: @napi-rs
 * ships real implementations and is a strict improvement for extraction too.
 */
async function loadRenderCanvas(): Promise<any> {
  const mod: any = await import("@napi-rs/canvas");
  const nc = mod?.createCanvas ? mod : mod?.default;
  if (!nc?.createCanvas) throw new RedactionError("raster_failed", "The canvas renderer did not load.");

  const g = globalThis as any;
  if (nc.DOMMatrix) g.DOMMatrix = nc.DOMMatrix;
  if (nc.Path2D) g.Path2D = nc.Path2D;
  if (nc.ImageData) g.ImageData = nc.ImageData;
  if (nc.DOMPoint) g.DOMPoint = nc.DOMPoint;
  if (nc.DOMRect) g.DOMRect = nc.DOMRect;
  return nc;
}

/**
 * Turn a boxed PDF into a PDF of page images.
 *
 * The output has no fonts and no content stream text at all, so there is
 * nothing left for pdftotext or a copy and paste to recover. This is the step
 * that makes the promise on the pricing page true.
 */
async function rasteriseToImagePdf(boxed: Uint8Array, startedAt: number): Promise<Uint8Array> {
  const pdfjs = await loadPdfjs();
  const nc = await loadRenderCanvas();

  const src = await pdfjs.getDocument({
    data: new Uint8Array(boxed),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0
  }).promise;

  const out = await PDFDocument.create();

  for (let i = 1; i <= src.numPages; i++) {
    if (Date.now() - startedAt > RASTER_DEADLINE_MS)
      throw new RedactionError("raster_timeout",
        `Preparing this résumé took longer than ${Math.round(RASTER_DEADLINE_MS / 1000)} seconds, so it was stopped.`);

    const page = await src.getPage(i);
    // Scale 1 gives the page size in points with any /Rotate already applied.
    const base = page.getViewport({ scale: 1 });
    // Step down the resolution rather than refuse an unusually large page.
    const clamp = Math.min(1, MAX_PIXELS_PER_SIDE / (Math.max(base.width, base.height) * RASTER_SCALE));
    const viewport = page.getViewport({ scale: RASTER_SCALE * clamp });

    const canvas = nc.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    // A PDF page is paper, not transparency. Without this, anything the page
    // leaves unpainted ends up black once flattened into a JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    /**
     * JPEG, not PNG. These previews are opened over Nigerian mobile data, and
     * a lossless page costs several times as much for no readable difference
     * at 150 DPI. The redaction bars are flat fills, so they survive the
     * compression as solid blocks.
     */
    const jpeg = canvas.toBuffer("image/jpeg", 88);
    const image = await out.embedJpg(jpeg);
    const outPage = out.addPage([base.width, base.height]);
    outPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });

    // Release the page's pdfjs resources before the next one, so a long CV
    // does not accumulate every rendered page in memory at once.
    page.cleanup();
  }

  stripMetadata(out);
  return out.save();
}

/**
 * Empty the Info dictionary.
 *
 * WHY: the metadata regularly carries the candidate's own name, their email
 * in the Author field, and the name of the machine the CV was exported from.
 * Redacting the visible page and then shipping "Author: Ada Obi" in the file
 * header gives the whole thing away to anyone who opens the document
 * properties.
 */
function stripMetadata(doc: PDFDocument): void {
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setProducer("MYJOBHACK");
  doc.setCreator("MYJOBHACK");
}

/**
 * Redact a résumé for an employer who has NOT unlocked the candidate.
 *
 * Throws RedactionError on anything it cannot prove it has scrubbed. The
 * honest rule: if we cannot prove the contact details are gone, nobody sees
 * the file. Callers must not fall back to the original bytes.
 */
export async function redactResumePdf(input: ArrayBuffer): Promise<RedactionResult> {
  const startedAt = Date.now();
  const pdfjs = await loadPdfjs();

  let doc: any;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(input.slice(0)),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
      verbosity: 0
    }).promise;
  } catch (e: any) {
    throw new RedactionError("parse_failed", `This file could not be read as a PDF: ${e?.message ?? "parse error"}`);
  }

  if (doc.numPages > MAX_PAGES)
    throw new RedactionError("too_many_pages",
      `This résumé has ${doc.numPages} pages. We can only prepare a protected preview of up to ${MAX_PAGES}.`);

  const out = await PDFDocument.load(input);
  const pages = out.getPages();

  let redactedCount = 0;
  const imageOnlyPages: number[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // If a page has (almost) no extractable text but has image operators,
    // it's an image-based résumé page — we can't scrub it. Most Nigerian CVs
    // arriving as a phone scan land here, which is exactly why this has to be
    // a refusal and not a warning.
    if (content.items.length < 3) {
      const ops = await page.getOperatorList();
      const hasImage = ops.fnArray.some((fn: number) =>
        fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject);
      if (hasImage) { imageOnlyPages.push(i); continue; }
    }

    const outPage = pages[i - 1];
    if (!outPage) continue;

    // Match against the whole page, then cover every run a match touches.
    for (const item of itemsToRedact(pageRuns(content.items as any[]))) {
      const str: string = item.str ?? "";

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

    page.cleanup();
  }

  if (imageOnlyPages.length)
    throw new RedactionError("image_only_pages",
      `${imageOnlyPages.length} page(s) of this résumé (${imageOnlyPages.join(", ")}) are scanned images with no text layer, `
      + "so we cannot remove the contact details from them.");

  // Boxes are on. Now destroy the text layer they are sitting on top of.
  const boxed = await out.save();

  let bytes: Uint8Array;
  try {
    bytes = await rasteriseToImagePdf(boxed, startedAt);
  } catch (e: any) {
    if (e instanceof RedactionError) throw e;
    // A rasterising failure means the boxed file still carries every redacted
    // string in its content stream. Releasing it would be worse than releasing
    // nothing, so this is a refusal.
    throw new RedactionError("raster_failed",
      `We could not flatten this résumé into a protected preview: ${e?.message ?? "render error"}`);
  }

  return { bytes, redactedCount, pageCount: doc.numPages, rasterMs: Date.now() - startedAt };
}

/**
 * Stamps a watermark on every page of a résumé that IS being released to an
 * employer — the "introduced via MYJOBHACK" notice tied to non-circumvention.
 * Deterrent, not prevention: makes going around the platform a documented act.
 *
 * NOT rasterised, on purpose. This file is only reached once the employer has
 * paid to unlock the candidate, so the contact details are theirs to have, and
 * keeping the text layer is what lets them select a phone number or push the
 * CV into their own system. Rasterising here would protect nothing and break
 * both.
 */
import { foldToWinAnsi } from "@/lib/offerLetter";

export async function watermarkResumePdf(input: ArrayBuffer, note?: string): Promise<Uint8Array> {
  const { PDFDocument, rgb, degrees, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.load(input);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  /**
   * Folded, because the built in fonts cannot encode a naira sign or a
   * Yoruba letter, and an unencodable character here would fail the whole
   * resume download rather than just the footer line.
   */
  const text = foldToWinAnsi(note ?? "Introduced via MYJOBHACK. Hiring off platform breaches your agreement");

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
