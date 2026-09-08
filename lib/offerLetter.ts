import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

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
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // The letterhead page, embedded once and stamped on every page.
  let bgPage: any = null;
  let bgImage: any = null;
  if (letterhead.bytes && letterhead.bytes.length) {
    if (letterhead.kind === "pdf") {
      const src = await PDFDocument.load(letterhead.bytes);
      [bgPage] = await pdf.embedPdf(src, [0]);
    } else {
      bgImage = await pdf.embedPng(letterhead.bytes).catch(async () => pdf.embedJpg(letterhead.bytes!));
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

  let y = topY;
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
  for (const block of offer.body.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text) continue;
    paragraph(text);
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

  return pdf.save();
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

export const DEFAULT_OFFER_BODY = `Dear {name},

OFFER OF EMPLOYMENT: {position}

Following your interview with us, we are pleased to offer you the position of {position}.

Your remuneration will be {salary}. You are expected to resume on {start_date}, reporting to {reporting_to}.

This offer is subject to satisfactory reference checks and to your providing the documents requested separately.

Please confirm your acceptance by signing and returning this letter. We look forward to welcoming you.`;
