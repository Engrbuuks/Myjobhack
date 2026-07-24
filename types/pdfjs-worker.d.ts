/**
 * The pdfjs worker ships no type declarations. We import it purely so the
 * bundler includes the file in the deployment — it is never called directly.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
declare module "pdfjs-dist/build/pdf.worker.mjs";
