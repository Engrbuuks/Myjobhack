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

  /* ------------------------------------------------------------------
   * The text engine.
   *
   * pdf-lib draws strings at coordinates and nothing more, so wrapping,
   * justification and page breaks are all done here, once, and every block of
   * running text in the letter goes through it: body paragraphs, list items
   * and the acceptance clause alike. Two different wrappers was how the same
   * letter came to have two different right edges.
   * ------------------------------------------------------------------ */

  const BODY = 11;
  const LEAD = 15;         // baseline to baseline for body text
  const PARA = 8;          // extra space after a paragraph
  const INK = rgb(0.1, 0.1, 0.1);

  type Tok = { text: string; font: any; space: boolean };

  /** Split text into words and spaces that each carry their own style. */
  const tokenize = (text: string): Tok[] => {
    const out: Tok[] = [];
    for (const piece of text.replace(/\s*\n\s*/g, " ").split(/(\*\*[^*]+\*\*|_[^_\s][^_]*_)/g).filter(Boolean)) {
      let f = font, inner = piece;
      if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) { f = bold; inner = piece.slice(2, -2); }
      else if (/^_[^_\s][^_]*_$/.test(piece)) { f = italic; inner = piece.slice(1, -1); }
      for (const w of inner.split(/(\s+)/)) {
        if (w === "") continue;
        out.push(/^\s+$/.test(w) ? { text: " ", font: f, space: true } : { text: w, font: f, space: false });
      }
    }
    return out;
  };

  const tokWidth = (t: Tok, size: number) => t.font.widthOfTextAtSize(t.text, size);

  /**
   * A word wider than the whole line, an email address or a long link, is cut
   * into pieces that fit rather than running off the paper. Cut on a
   * character boundary, with no hyphen added.
   */
  const splitLong = (t: Tok, size: number, width: number): Tok[] => {
    if (t.space || tokWidth(t, size) <= width) return [t];
    const parts: Tok[] = [];
    let cur = "";
    for (const ch of Array.from(t.text)) {
      if (cur && t.font.widthOfTextAtSize(cur + ch, size) > width) {
        parts.push({ ...t, text: cur });
        cur = ch;
      } else cur += ch;
    }
    if (cur) parts.push({ ...t, text: cur });
    return parts;
  };

  /**
   * Break a paragraph into lines with the spacing balanced across all of it.
   *
   * Filling each line as full as it will go, then moving on, leaves the
   * occasional line with only three or four words and gaps a finger wide
   * once it is justified. Instead every possible set of breaks is weighed,
   * and the one where the lines are most evenly full wins: a line that is a
   * little looser lets the next one avoid being very loose. This is the idea
   * behind how typesetting systems set justified text, kept small enough for
   * a letter. The last line costs nothing, because it is never stretched.
   *
   * Words joined without a space (a bold run followed by its comma) travel
   * together as one unit, and spaces never begin or end a line.
   */
  const wrap = (tokens: Tok[], size: number, width: number): Tok[][] => {
    type Box = { toks: Tok[]; w: number; glue: Tok | null };   // glue: the space before it
    const boxes: Box[] = [];
    let pendingGlue: Tok | null = null;
    for (const raw of tokens) {
      if (raw.space) { if (boxes.length) pendingGlue = raw; continue; }
      splitLong(raw, size, width).forEach((t, k) => {
        const last = boxes[boxes.length - 1];
        if (last && !pendingGlue && k === 0) { last.toks.push(t); last.w += tokWidth(t, size); }
        else { boxes.push({ toks: [t], w: tokWidth(t, size), glue: k === 0 ? pendingGlue : null }); }
        pendingGlue = null;
      });
    }
    const n = boxes.length;
    if (!n) return [];

    // best[i] = least cost to set boxes[0..i), prev[i] = where that line began.
    const best = new Array(n + 1).fill(Infinity);
    const prev = new Array(n + 1).fill(0);
    best[0] = 0;
    for (let j = 1; j <= n; j++) {
      let w = 0;
      for (let i = j - 1; i >= 0; i--) {
        w += boxes[i].w + (i < j - 1 && boxes[i + 1].glue ? tokWidth(boxes[i + 1].glue!, size) : 0);
        if (w > width && i < j - 1) break;            // too long; longer starts are longer still
        const slack = Math.max(0, width - w);
        const cost = j === n ? 0 : (slack / width) ** 2 * 1000 + (i === j - 1 ? 50 : 0);
        if (best[i] + cost < best[j]) { best[j] = best[i] + cost; prev[j] = i; }
      }
    }

    const lines: Tok[][] = [];
    for (let j = n; j > 0; j = prev[j]) {
      const i = prev[j];
      const l: Tok[] = [];
      for (let k = i; k < j; k++) {
        if (k > i && boxes[k].glue) l.push(boxes[k].glue!);
        l.push(...boxes[k].toks);
      }
      lines.unshift(l);
    }
    return lines;
  };

  /**
   * Draw one line, justified when asked.
   *
   * The spare width is shared evenly between the spaces on the line. The
   * last line of a paragraph is never stretched, and neither is a line that
   * would need gaps more than about three spaces wide: that only happens to a
   * line holding two or three long words, and stretched that far it reads
   * worse than a ragged edge.
   */
  const drawLine = (l: Tok[], x0: number, width: number, size: number, justify: boolean) => {
    const natural = l.reduce((n, t) => n + tokWidth(t, size), 0);
    const gaps = l.filter((t) => t.space).length;
    const spaceW = font.widthOfTextAtSize(" ", size);
    let extra = justify && gaps ? (width - natural) / gaps : 0;
    if (extra < 0 || extra > spaceW * 2.2) extra = 0;
    let x = x0;
    for (const t of l) {
      if (t.space) { x += tokWidth(t, size) + extra; continue; }
      page.drawText(t.text, { x, y, size, font: t.font, color: INK });
      x += tokWidth(t, size);
    }
  };

  /** How many more body lines fit on the current page. */
  const linesLeft = () => Math.max(0, Math.floor((y - floorY - BODY) / LEAD) + 1);

  /**
   * Set a block of wrapped lines, keeping it readable across a page break:
   * never one line stranded at the foot of a page (an orphan), never one
   * line alone at the top of the next (a widow). Short blocks of up to three
   * lines are kept whole.
   */
  const setLines = (lines: Tok[][], x0: number, colWidth: number, size: number, justify: boolean,
                    firstPrefix?: (yy: number) => void) => {
    const n = lines.length;
    if (!n) return;
    const fit = linesLeft();
    let breakAt = -1;
    if (fit < n) {
      if (n <= 3 || fit < 2) breakAt = 0;          // move the whole block
      else if (n - fit < 2) breakAt = n - 2;       // leave two for the next page
      else breakAt = fit;
    }
    lines.forEach((l, i) => {
      if (i === breakAt || y - BODY < floorY) {
        page = pdf.addPage([width, height]);
        stamp(page);
        y = topY;
      }
      if (i === 0 && firstPrefix) firstPrefix(y);
      drawLine(l, x0, colWidth, size, justify && i < n - 1);
      y -= LEAD;
    });
  };

  /** A paragraph of running text, justified to both margins. */
  const paragraph = (text: string, opts: { size?: number; justify?: boolean } = {}) => {
    const size = opts.size ?? BODY;
    setLines(wrap(tokenize(text), size, usableWidth), LEFT, usableWidth, size, opts.justify !== false);
    y -= PARA;
  };

  // ---- date and reference ----
  if (offer.dateLine) line(offer.dateLine, { size: 10, color: rgb(0.35, 0.35, 0.35), gap: 2 });
  if (offer.reference) line(`Ref: ${offer.reference}`, { size: 10, color: rgb(0.35, 0.35, 0.35) });
  y -= 8;

  // ---- body ----
  //
  //   # Heading          a heading, wrapped, kept with what follows it
  //   **bold**, _italic_ emphasis inside any line
  //   * item, 1. item    a list, with the text hung clear of the marker
  //   anything else      a justified paragraph
  //
  // A blank line separates blocks. Inside a block, a single line break is
  // treated as a space unless the next line starts a list item, so a letter
  // pasted from an email with hard wrapped lines still sets as paragraphs.
  const LIST = /^\s*(?:([*\u2022\u2013-])|(\d{1,2}|[a-zA-Z])[.)])\s+/;
  const INDENT = 20;

  for (const block of offer.body.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text) continue;

    // [\s\S] rather than the s flag, which needs a newer ES target than
    // this project compiles to.
    const heading = text.match(/^(#{1,3})\s+([\s\S]*)$/);
    if (heading) {
      const level = heading[1].length;
      const size = level === 1 ? 13.5 : level === 2 ? 12 : 11;
      const hLines = wrap(
        tokenize(heading[2]).map((t) => ({ ...t, font: t.font === italic ? italic : bold })),
        size, usableWidth);
      // Keep the heading with at least two lines of what follows it.
      const need = hLines.length * (size + 5) + 6 + LEAD * 2;
      if (y - need < floorY) { page = pdf.addPage([width, height]); stamp(page); y = topY; }
      y -= 4;
      for (const l of hLines) { drawLine(l, LEFT, usableWidth, size, false); y -= size + 5; }
      y -= 7;
      continue;
    }

    // Split the block into list items and plain runs of text.
    const rows = text.split(/\n/);
    const parts: { kind: "p" | "li"; marker?: string; text: string }[] = [];
    for (const row of rows) {
      const m = row.match(LIST);
      if (m) {
        parts.push({ kind: "li", marker: m[1] ? "\u2022" : `${m[2]}.`, text: row.slice(m[0].length) });
      } else if (parts.length) {
        parts[parts.length - 1].text += ` ${row.trim()}`;
      } else {
        parts.push({ kind: "p", text: row.trim() });
      }
    }

    parts.forEach((part, i) => {
      if (part.kind === "p") {
        setLines(wrap(tokenize(part.text), BODY, usableWidth), LEFT, usableWidth, BODY, true);
      } else {
        const markerW = font.widthOfTextAtSize(part.marker!, BODY);
        setLines(wrap(tokenize(part.text), BODY, usableWidth - INDENT), LEFT + INDENT, usableWidth - INDENT,
          BODY, true, (yy) => page.drawText(part.marker!, {
            x: LEFT + INDENT - 7 - markerW, y: yy, size: BODY, font, color: INK
          }));
        if (i < parts.length - 1) y -= 3;    // a little air between items
      }
    });
    y -= PARA;
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
    /**
     * The acceptance block, kept whole on one page. Measured rather than
     * guessed: from the rule, heading 38, the clause 38, the signing lines
     * 31, and the electronic acceptance note 22 more on a signed copy.
     * Reserving more than it uses pushed it onto a page of its own.
     */
    const blockHeight = offer.signedName && offer.signedAt ? 131 : 109;
    // The gap above the rule gives way first: a little less air beats a page
    // holding nothing but the acceptance block.
    const room = y - floorY - blockHeight;
    if (room < 8) { page = pdf.addPage([width, height]); stamp(page); y = topY; }
    else y -= Math.min(22, room);
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
  "{start_date}", "{reporting_to}", "{company}", "{location}", "{today}"
];

export const FORMATTING_HELP =
  "Start a line with # for a heading, * for a bullet point, or 1. for a numbered point. Wrap text in **double asterisks** for bold, or _underscores_ for italic. Leave a blank line between paragraphs. Paragraphs are justified to both margins.";

export const DEFAULT_OFFER_BODY = `Dear {name},

# OFFER OF EMPLOYMENT: {position}

Following your interview with us, we are pleased to offer you the position of {position}.

Your remuneration will be **{salary}**. You are expected to resume on **{start_date}**, reporting to {reporting_to}.

This offer is subject to satisfactory reference checks and to your providing the documents requested separately.

Please confirm your acceptance by signing and returning this letter. We look forward to welcoming you.`;
