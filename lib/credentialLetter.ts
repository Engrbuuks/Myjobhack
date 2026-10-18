/**
 * The letter a member can attach to an application anywhere.
 *
 * WHAT IT IS. A one page statement that this person's credential was checked
 * by MYJOBHACK, carrying the member number, the class, and the address and
 * code where anyone can confirm it. The value is the check, not the paper.
 *
 * WHAT IT IS NOT. It is not digitally signed, and it does not pretend to be.
 * There is no certificate, no seal, no claim that the file itself cannot be
 * altered, because any of those would be false and a forged copy would then
 * carry our word for it. The letter says plainly that the only authority is
 * the live verification, which is a page an employer can load for themselves.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type CredentialLetter = {
  fullName: string;
  memberNo: number;
  distinction: string | null;
  institution: string | null;
  course: string | null;
  graduationYear: number | null;
  chapter: string | null;
  classYear: number | null;
  verifyUrl: string;
  verifyCode: string;
  /** Who signs it, and in what capacity. */
  signatory: string;
  signatoryTitle: string;
};

const INK = rgb(0.03, 0.24, 0.25);
const BODY = rgb(0.1, 0.12, 0.12);
const MUTED = rgb(0.35, 0.42, 0.42);
const CORAL = rgb(0.99, 0.34, 0.28);

export async function buildCredentialLetter(d: CredentialLetter): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const [regular, bold, italic] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.HelveticaOblique)
  ]);

  const LEFT = 56;
  const RIGHT = 595.28 - 56;
  const WIDTH = RIGHT - LEFT;
  let y = 841.89 - 64;

  const text = (s: string, o: { size?: number; font?: any; color?: any; gap?: number } = {}) => {
    const size = o.size ?? 11;
    page.drawText(s, { x: LEFT, y, size, font: o.font ?? regular, color: o.color ?? BODY });
    y -= size + (o.gap ?? 6);
  };

  /** Wrap to the text column rather than running off the page. */
  const paragraph = (s: string, size = 11, font: any = regular, color: any = BODY) => {
    const words = s.split(/\s+/);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > WIDTH) {
        page.drawText(line, { x: LEFT, y, size, font, color });
        y -= size + 5;
        line = w;
      } else line = next;
    }
    if (line) {
      page.drawText(line, { x: LEFT, y, size, font, color });
      y -= size + 5;
    }
    y -= 8;
  };

  // ---- masthead -------------------------------------------------------
  page.drawRectangle({ x: 0, y: 841.89 - 10, width: 595.28, height: 10, color: CORAL });

  page.drawText("MYJOBHACK", { x: LEFT, y, size: 20, font: bold, color: INK });
  page.drawText("ELITE", { x: LEFT + bold.widthOfTextAtSize("MYJOBHACK ", 20), y, size: 20, font: bold, color: CORAL });
  y -= 26;
  text("Verified credential statement", { size: 10, font: bold, color: MUTED, gap: 2 });
  text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    { size: 10, color: MUTED, gap: 18 });

  page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.75, color: rgb(0.86, 0.92, 0.91) });
  y -= 26;

  // ---- the statement --------------------------------------------------
  text("To whom it may concern", { size: 12, font: bold, color: INK, gap: 14 });

  const whatWeChecked = [
    d.distinction ? `a ${d.distinction}` : "an academic distinction",
    d.course ? `in ${d.course}` : null,
    d.institution ? `from ${d.institution}` : null,
    d.graduationYear ? `(${d.graduationYear})` : null
  ].filter(Boolean).join(" ");

  paragraph(
    `This is to confirm that ${d.fullName} is a verified member of MYJOBHACK Elite, ` +
    `admitted on the strength of ${whatWeChecked}.`
  );

  paragraph(
    "Membership is granted only after a member of our team has examined the original credential " +
    "document and satisfied themselves that it is genuine. It is not granted on the strength of a " +
    "form, and it is not self declared."
  );

  // ---- the particulars ------------------------------------------------
  y -= 4;
  const rows: [string, string][] = [
    ["Member number", `№ ${String(d.memberNo).padStart(4, "0")}`],
    ["Distinction", d.distinction ?? "Recorded on file"],
    ["Institution", d.institution ?? "Recorded on file"],
    ["Chapter", d.chapter ?? "Continental"],
    ["Induction class", d.classYear ? String(d.classYear) : "Recorded on file"]
  ];

  const boxTop = y;
  const rowH = 22;
  page.drawRectangle({
    x: LEFT - 10, y: boxTop - rows.length * rowH - 6, width: WIDTH + 20, height: rows.length * rowH + 16,
    color: rgb(0.96, 0.98, 0.98)
  });
  y -= 10;
  for (const [k, v] of rows) {
    page.drawText(k, { x: LEFT, y, size: 9.5, font: bold, color: MUTED });
    page.drawText(v, { x: LEFT + 150, y, size: 11, font: regular, color: INK });
    y -= rowH;
  }
  y -= 18;

  // ---- how to check it, which is the only authority this carries ------
  text("Confirm this for yourself", { size: 12, font: bold, color: INK, gap: 10 });
  paragraph(
    "This letter is a convenience. The record is the authority. Open the address below and enter the " +
    "code to see the current status of this membership, which will show as withdrawn or expired if it " +
    "ever ceases to be valid."
  );
  text(d.verifyUrl, { size: 11, font: bold, color: INK, gap: 4 });
  text(`Verification code: ${d.verifyCode}`, { size: 11, font: bold, color: CORAL, gap: 10 });
  paragraph(
    "This file is not digitally signed and should not be treated as proof on its own. A copy that has " +
    "been altered would look exactly like this one. Only the live check above can be relied upon.",
    9.5, italic, MUTED
  );

  // ---- signature ------------------------------------------------------
  y = Math.min(y, 190);
  page.drawLine({ start: { x: LEFT, y }, end: { x: LEFT + 190, y }, thickness: 0.75, color: rgb(0.6, 0.66, 0.66) });
  y -= 16;
  text(d.signatory, { size: 11, font: bold, color: INK, gap: 2 });
  text(d.signatoryTitle, { size: 9.5, color: MUTED, gap: 2 });
  text("MYJOBHACK", { size: 9.5, color: MUTED });

  // ---- footer ---------------------------------------------------------
  page.drawText(
    `Issued ${new Date().toISOString().slice(0, 10)} · member № ${String(d.memberNo).padStart(4, "0")} · app.myjobhack.co`,
    { x: LEFT, y: 42, size: 8, font: regular, color: MUTED }
  );

  return await pdf.save();
}
