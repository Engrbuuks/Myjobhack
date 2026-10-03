import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { DEJAVU_REGULAR, DEJAVU_BOLD, DEJAVU_OBLIQUE } from "@/lib/fonts/dejavu";

/**
 * Build an offer letter PDF on the company's own letterhead.
 *
 * WHY THE LETTERHEAD IS A BACKGROUND RATHER THAN A HEADER IMAGE: companies
 * supply letterhead as a full page with a logo at the top, a watermark or
 * border down the side, and contact details in the footer. Pasting only the
 * top strip loses the rest and looks wrong next to the paper version. So the
 * uploaded page is drawn first, at full size, and the text is laid over it
 * inside margins the letterhead itself declares.
 */

const A4 = { width: 595.28, height: 841.89 };

/**
 * Characters the built in PDF fonts cannot encode, and the nearest thing they
 * can. Only ever used if embedding the real font fails: a letter that says
 * NGN is poor, a letter that fails to build at all is worse.
 */
const FOLD: Record<string, string> = {
  "\u20a6": "NGN ", "\u20b5": "GHS ", "\u20a8": "Rs ", "\u20b9": "INR ",
  "\u20ab": "VND ", "\u20bd": "RUB ", "\u20ba": "TRY ", "\u2713": "(tick)",
  "\u2714": "(tick)", "\u2022": "-", "\u2026": "..."
};

export function foldToWinAnsi(text: string): string {
  let out = "";
  for (const ch of String(text ?? "")) {
    if (FOLD[ch]) { out += FOLD[ch]; continue; }
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x100) { out += ch; continue; }
    // Strip the marks from a letter rather than lose the letter: \u1e63 becomes s.
    const bare = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out += bare && (bare.codePointAt(0) ?? 0) < 0x100 ? bare : "?";
  }
  return out;
}

/**
 * Embed DejaVu so every character in a letter can actually be drawn.
 *
 * Falls back to the built in fonts if anything about embedding fails, because
 * an offer letter that builds in a plainer font beats one that does not build.
 */
async function loadFonts(pdf: PDFDocument) {
  try {
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    (pdf as any).registerFontkit(fontkit);
    const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));
    const [font, bold, italic] = await Promise.all([
      pdf.embedFont(bytes(DEJAVU_REGULAR), { subset: true }),
      pdf.embedFont(bytes(DEJAVU_BOLD), { subset: true }),
      pdf.embedFont(bytes(DEJAVU_OBLIQUE), { subset: true })
    ]);
    return { font, bold, italic, unicode: true };
  } catch {
    const [font, bold, italic] = await Promise.all([
      pdf.embedFont(StandardFonts.Helvetica),
      pdf.embedFont(StandardFonts.HelveticaBold),
      pdf.embedFont(StandardFonts.HelveticaOblique)
    ]);
    return { font, bold, italic, unicode: false };
  }
}

export type LetterheadSpec = {
  bytes: Uint8Array | null;
  kind: "pdf" | "image";
  topMargin: number;
  bottomMargin: number;
  signature: Uint8Array | null;
  signatureKind?: "png" | "jpg";
  signatoryName: string;
  signatoryTitle: string;
};

export type OfferSpec = {
  candidateName: string;
  body: string;
  /**
   * Nudge the whole letter up or down, in points, from where the letterhead
   * says text may begin. Positive moves it down.
   *
   * The letterhead's own margin is a property of the paper and applies to
   * every letter printed on it. This is per letter: a short offer often looks
   * better sitting lower on the page, and a long one needs every line it can
   * get. Keeping them separate means adjusting one letter does not silently
   * reposition all the others.
   */
  startOffset?: number;
  reference?: string;
  dateLine?: string;
  /** Adds the sign and return block. */
  countersign: boolean;
  /** Filled in once the candidate has signed, for the final copy. */
  signedName?: string | null;
  signedAt?: string | null;
};

const LEFT = 64;
const RIGHT = 64;

export async function buildOfferPdf(
  letterhead: LetterheadSpec, offer: OfferSpec
): Promise<Uint8Array & { warnings?: string[] }> {
  const pdf = await PDFDocument.create();
  const { font, bold, italic, unicode } = await loadFonts(pdf);

  /**
   * If the real font could not be embedded, fold every piece of text ONCE,
   * here, rather than at each place it is drawn. Folding later would leave
   * the wrapping measured on one string and drawn with another, and lines
   * would overrun the margin.
   */
  if (!unicode) {
    offer = {
      ...offer,
      candidateName: foldToWinAnsi(offer.candidateName),
      body: foldToWinAnsi(offer.body),
      reference: offer.reference ? foldToWinAnsi(offer.reference) : offer.reference,
      dateLine: offer.dateLine ? foldToWinAnsi(offer.dateLine) : offer.dateLine,
      signedName: offer.signedName ? foldToWinAnsi(offer.signedName) : offer.signedName
    };
    letterhead = {
      ...letterhead,
      signatoryName: foldToWinAnsi(letterhead.signatoryName),
      signatoryTitle: foldToWinAnsi(letterhead.signatoryTitle)
    };
  }

  // The letterhead page, embedded once and stamped on every page.
  /**
   * Embedding the letterhead must never take the whole letter down.
   *
   * An encrypted PDF, a CMYK JPEG, a file saved with the wrong extension: any
   * of these throws inside pdf-lib, and an unhandled throw here meant the
   * preview returned a 500 and the button appeared to do nothing. A letter on
   * plain paper with a warning is far better than no letter and no
   * explanation.
   */
  const warnings: string[] = [];
  let bgPage: any = null;
  let bgImage: any = null;
  if (letterhead.bytes && letterhead.bytes.length) {
    try {
      if (letterhead.kind === "pdf") {
        const src = await PDFDocument.load(letterhead.bytes, { ignoreEncryption: true });
        if (src.getPageCount() < 1) throw new Error("the PDF has no pages");
        [bgPage] = await pdf.embedPdf(src, [0]);
      } else {
        bgImage = await pdf.embedPng(letterhead.bytes).catch(async () => pdf.embedJpg(letterhead.bytes!));
      }
    } catch (e: any) {
      // Try the other interpretation before giving up: a .pdf that is really
      // a PNG, or an image that is really a PDF, is a common upload mistake.
      try {
        if (letterhead.kind === "pdf") {
          bgImage = await pdf.embedPng(letterhead.bytes).catch(async () => pdf.embedJpg(letterhead.bytes!));
        } else {
          const src = await PDFDocument.load(letterhead.bytes, { ignoreEncryption: true });
          [bgPage] = await pdf.embedPdf(src, [0]);
        }
      } catch {
        warnings.push(`The letterhead could not be read (${e?.message ?? "unsupported file"}), so this letter is on plain paper. Re-export it as a standard PDF or PNG and upload it again.`);
      }
    }
  }

  const width = A4.width, height = A4.height;
  const usableWidth = width - LEFT - RIGHT;
  const topY = height - letterhead.topMargin;
  const floorY = letterhead.bottomMargin;

  let page = pdf.addPage([width, height]);
  const stamp = (p: any) => {
    if (bgPage) p.drawPage(bgPage, { x: 0, y: 0, width, height });
    else if (bgImage) p.drawImage(bgImage, { x: 0, y: 0, width, height });
  };
  stamp(page);

  let y = topY - (offer.startOffset ?? 0);
  const newPageIfNeeded = (needed: number) => {
    if (y - needed >= floorY) return;
    page = pdf.addPage([width, height]);
    stamp(page);
    y = topY;
  };

  const line = (text: string, opts: { size?: number; f?: any; gap?: number; color?: any } = {}) => {
    const size = opts.size ?? 11;
    const f = opts.f ?? font;
    newPageIfNeeded(size + 6);
    page.drawText(text, { x: LEFT, y, size, font: f, color: opts.color ?? rgb(0.1, 0.1, 0.1) });
    y -= size + (opts.gap ?? 5);
  };

  /**
   * Draw a line that may contain **bold** and _italic_ runs.
   *
   * pdf-lib draws a string in one font, so mixed weights have to be drawn as
   * separate pieces with the x position advanced by the measured width of
   * each. Wrapping therefore has to happen before this is called.
   */
  const drawRich = (text: string, size: number, startX: number) => {
    let x = startX;
    // Split on the markers, keeping them so each piece knows its own style.
    const pieces = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
    for (const piece of pieces) {
      let f = font, shown = piece;
      if (piece.startsWith("**") && piece.endsWith("**")) { f = bold; shown = piece.slice(2, -2); }
      else if (piece.startsWith("_") && piece.endsWith("_")) { f = italic; shown = piece.slice(1, -1); }
      page.drawText(shown, { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      x += f.widthOfTextAtSize(shown, size);
    }
  };

  /** Width of a line once its formatting markers are removed. */
  const richWidth = (text: string, size: number) => {
    let w = 0;
    for (const piece of text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean)) {
      if (piece.startsWith("**") && piece.endsWith("**")) w += bold.widthOfTextAtSize(piece.slice(2, -2), size);
      else if (piece.startsWith("_") && piece.endsWith("_")) w += italic.widthOfTextAtSize(piece.slice(1, -1), size);
      else w += font.widthOfTextAtSize(piece, size);
    }
    return w;
  };

  /** Wrap to the usable width. pdf-lib has no layout engine, so this is manual. */
  const paragraph = (text: string, opts: { size?: number; f?: any } = {}) => {
    const size = opts.size ?? 11;
    const f = opts.f ?? font;
    const words = text.split(/\s+/);
    let current = "";
    for (const w of words) {
      const trial = current ? `${current} ${w}` : w;
      if (f.widthOfTextAtSize(trial, size) > usableWidth) {
        line(current, { size, f, gap: 4 });
        current = w;
      } else {
        current = trial;
      }
    }
    if (current) line(current, { size, f, gap: 4 });
    y -= 8;
  };

  // ---- date and reference ----
  if (offer.dateLine) line(offer.dateLine, { size: 10, color: rgb(0.35, 0.35, 0.35), gap: 2 });
  if (offer.reference) line(`Ref: ${offer.reference}`, { size: 10, color: rgb(0.35, 0.35, 0.35) });
  y -= 8;

  // ---- body ----
  //
  // Lines beginning with # are headings, and **bold** or _italic_ runs are
  // honoured inside a paragraph. That covers what an offer letter actually
  // needs: a subject line that stands out, and emphasis on the terms.
  for (const block of offer.body.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text) continue;

    // [\s\S] rather than the s flag, which needs a newer ES target than
    // this project compiles to.
    const heading = text.match(/^(#{1,3})\s+([\s\S]*)$/);
    if (heading) {
      const level = heading[1].length;
      const size = level === 1 ? 14 : level === 2 ? 12 : 11;
      newPageIfNeeded(size + 14);
      y -= 4;
      page.drawText(heading[2].replace(/\n/g, " ").trim(), {
        x: LEFT, y, size, font: bold, color: rgb(0.05, 0.05, 0.05)
      });
      y -= size + 10;
      continue;
    }

    /**
     * Tokenise into styled words BEFORE wrapping.
     *
     * Wrapping the raw string splits a run like **Monday, 15 September** in
     * the middle, and each half then fails the "starts and ends with **"
     * test, so the markers print literally. Splitting into words that each
     * carry their own style makes a wrap harmless wherever it falls.
     */
    const tokens: { text: string; font: any }[] = [];
    for (const piece of text.replace(/\n/g, " ").split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean)) {
      let f = font, inner = piece;
      if (piece.startsWith("**") && piece.endsWith("**")) { f = bold; inner = piece.slice(2, -2); }
      else if (piece.startsWith("_") && piece.endsWith("_")) { f = italic; inner = piece.slice(1, -1); }
      inner.split(/(\s+)/).forEach((w) => { if (w !== "") tokens.push({ text: w, font: f }); });
    }

    let lineTokens: { text: string; font: any }[] = [];
    const lineWidth = (ts: typeof tokens) =>
      ts.reduce((n, t) => n + t.font.widthOfTextAtSize(t.text, 11), 0);

    const flush = () => {
      if (!lineTokens.length) return;
      newPageIfNeeded(17);
      let x = LEFT;
      for (const t of lineTokens) {
        page.drawText(t.text, { x, y, size: 11, font: t.font, color: rgb(0.1, 0.1, 0.1) });
        x += t.font.widthOfTextAtSize(t.text, 11);
      }
      y -= 15;
      lineTokens = [];
    };

    for (const tok of tokens) {
      const candidate = [...lineTokens, tok];
      if (lineWidth(candidate) > usableWidth && lineTokens.length) {
        flush();
        // Never begin a wrapped line with the space that caused the wrap.
        if (!/^\s+$/.test(tok.text)) lineTokens.push(tok);
      } else {
        lineTokens.push(tok);
      }
    }
    flush();
    y -= 8;
  }

  // ---- signatory ----
  newPageIfNeeded(120);
  y -= 10;
  line("Yours sincerely,", { gap: 10 });

  if (letterhead.signature && letterhead.signature.length) {
    try {
      const sig = letterhead.signatureKind === "jpg"
        ? await pdf.embedJpg(letterhead.signature)
        : await pdf.embedPng(letterhead.signature).catch(() => pdf.embedJpg(letterhead.signature!));
      // Scaled to a consistent height so a large upload does not dominate.
      const h = 42;
      const w = (sig.width / sig.height) * h;
      newPageIfNeeded(h + 40);
      page.drawImage(sig, { x: LEFT, y: y - h + 8, width: w, height: h });
      y -= h + 4;
    } catch {
      // An unreadable signature file must not stop the letter being produced.
      y -= 30;
    }
  } else {
    y -= 34;   // room to sign by hand
  }

  page.drawLine({
    start: { x: LEFT, y }, end: { x: LEFT + 190, y },
    thickness: 0.75, color: rgb(0.6, 0.6, 0.6)
  });
  y -= 14;
  if (letterhead.signatoryName) line(letterhead.signatoryName, { f: bold, gap: 2 });
  if (letterhead.signatoryTitle) line(letterhead.signatoryTitle, { size: 10, color: rgb(0.35, 0.35, 0.35) });

  // ---- countersignature ----
  if (offer.countersign) {
    newPageIfNeeded(150);
    y -= 22;
    page.drawLine({
      start: { x: LEFT, y }, end: { x: width - RIGHT, y },
      thickness: 0.5, color: rgb(0.75, 0.75, 0.75)
    });
    y -= 20;
    line("ACCEPTANCE", { f: bold, size: 10, gap: 8 });
    paragraph(
      "I accept the offer set out in this letter, on the terms stated. " +
      "Please sign and date below, then return a copy to us."
    );

    y -= 18;
    if (offer.signedName && offer.signedAt) {
      // Signed copy: record what was agreed and when, rather than blank lines.
      page.drawText(offer.signedName, {
        x: LEFT, y: y + 6, size: 13, font: italic, color: rgb(0.1, 0.1, 0.1)
      });
      page.drawText(new Date(offer.signedAt).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric"
      }), { x: LEFT + 300, y: y + 6, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
    }

    page.drawLine({ start: { x: LEFT, y }, end: { x: LEFT + 240, y }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });
    page.drawLine({ start: { x: LEFT + 300, y }, end: { x: LEFT + 460, y }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });
    y -= 13;
    page.drawText(`Signature of ${offer.candidateName}`, {
      x: LEFT, y, size: 9, font, color: rgb(0.45, 0.45, 0.45)
    });
    page.drawText("Date", { x: LEFT + 300, y, size: 9, font, color: rgb(0.45, 0.45, 0.45) });

    if (offer.signedName && offer.signedAt) {
      y -= 22;
      page.drawText("Accepted electronically through MYJOBHACK. A record of this acceptance is held with the offer.", {
        x: LEFT, y, size: 8, font: italic, color: rgb(0.45, 0.45, 0.45)
      });
    }
  }

  const out = await pdf.save() as Uint8Array & { warnings?: string[] };
  if (warnings.length) out.warnings = warnings;
  return out;
}

/** Fill {tokens} in the letter body. */
export function renderOfferBody(template: string, vars: Record<string, string>): string {
  return (template || "").replace(/\{(\w+)\}/g, (whole, key) =>
    vars[key] === undefined || vars[key] === "" ? whole : vars[key]);
}

export const OFFER_TOKENS = [
  "{first_name}", "{name}", "{position}", "{salary}",
  "{start_date}", "{reporting_to}", "{company}", "{today}"
];

export const FORMATTING_HELP =
  "Start a line with # for a heading. Wrap text in **double asterisks** for bold, or _underscores_ for italic. Leave a blank line between paragraphs.";

export const DEFAULT_OFFER_BODY = `Dear {name},

# OFFER OF EMPLOYMENT: {position}

Following your interview with us, we are pleased to offer you the position of {position}.

Your remuneration will be **{salary}**. You are expected to resume on **{start_date}**, reporting to {reporting_to}.

This offer is subject to satisfactory reference checks and to your providing the documents requested separately.

Please confirm your acceptance by signing and returning this letter. We look forward to welcoming you.`;
