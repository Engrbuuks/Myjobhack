/**
 * Minimal browser-API shims for PDF parsing under Node.
 *
 * pdfjs (which pdf-parse wraps) reaches for DOMMatrix, Path2D and
 * ImageData when a PDF contains transforms, vector graphics or embedded
 * images. Those are browser globals that do not exist in a serverless Node
 * runtime, so a CV with a logo or a styled header throws
 * "DOMMatrix is not defined" — even though its text is perfectly readable.
 *
 * We only need these to EXIST for text extraction; they are never used to
 * render anything. Keeping them minimal avoids pulling in the native canvas
 * dependency, which will not build on Vercel.
 */
export function installPdfPolyfills() {
  const g = globalThis as any;

  if (typeof g.DOMMatrix === "undefined") {
    class DOMMatrixShim {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0;
      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          this.m11 = this.a; this.m12 = this.b;
          this.m21 = this.c; this.m22 = this.d;
          this.m41 = this.e; this.m42 = this.f;
        }
      }
      // pdfjs only calls these while measuring; identity behaviour is fine.
      multiply() { return this; }
      translate() { return this; }
      scale() { return this; }
      inverse() { return this; }
      transformPoint(p: any) { return p; }
    }
    g.DOMMatrix = DOMMatrixShim;
  }

  if (typeof g.Path2D === "undefined") {
    class Path2DShim {
      addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {}
      quadraticCurveTo() {} closePath() {} rect() {} arc() {}
    }
    g.Path2D = Path2DShim;
  }

  if (typeof g.ImageData === "undefined") {
    class ImageDataShim {
      data: Uint8ClampedArray; width: number; height: number;
      constructor(w: number = 1, h: number = 1) {
        this.width = w; this.height = h;
        this.data = new Uint8ClampedArray(w * h * 4);
      }
    }
    g.ImageData = ImageDataShim;
  }
}
