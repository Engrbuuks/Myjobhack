import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

export type Compressed = {
  buffer: Buffer;
  mime: string;
  ext: string;
  originalSize: number;
  size: number;
};

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Compress any upload to minimal size while keeping the format usable:
 * - images -> WebP, max 1600px, q80 (avatars/logos/proofs)
 * - PDF    -> re-saved with object streams (strips bloat, stays a valid PDF)
 * - DOCX   -> re-zipped at max deflate (stays a valid DOCX)
 * - other  -> passed through untouched
 */
export async function compressUpload(
  input: Buffer,
  mime: string,
  filename: string
): Promise<Compressed> {
  const originalSize = input.length;

  try {
    if (IMAGE_MIMES.includes(mime)) {
      const out = await sharp(input, { failOn: "none" })
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const buffer = out.length < originalSize ? out : input;
      return {
        buffer,
        mime: buffer === out ? "image/webp" : mime,
        ext: buffer === out ? "webp" : extOf(filename),
        originalSize,
        size: buffer.length
      };
    }

    if (mime === PDF_MIME) {
      const doc = await PDFDocument.load(input, {
        ignoreEncryption: true,
        updateMetadata: false
      });
      const out = Buffer.from(await doc.save({ useObjectStreams: true }));
      const buffer = out.length < originalSize ? out : input;
      return { buffer, mime: PDF_MIME, ext: "pdf", originalSize, size: buffer.length };
    }

    if (mime === DOCX_MIME || filename.toLowerCase().endsWith(".docx")) {
      const zip = await JSZip.loadAsync(input);
      const out = Buffer.from(
        await zip.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE",
          compressionOptions: { level: 9 }
        })
      );
      const buffer = out.length < originalSize ? out : input;
      return { buffer, mime: DOCX_MIME, ext: "docx", originalSize, size: buffer.length };
    }
  } catch {
    // fall through to pass-through on any parse failure
  }

  return { buffer: input, mime, ext: extOf(filename), originalSize, size: originalSize };
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "bin";
}
