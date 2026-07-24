/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /**
     * Keep PDF libraries OUT of the server bundle.
     *
     * pdfjs-dist loads pdf.worker.mjs at runtime by path. Bundling the package
     * into a chunk loses that sibling file.
     * (Next 14 key — renamed to serverExternalPackages in Next 15.)
     */
    serverComponentsExternalPackages: ["pdfjs-dist", "pdf-parse", "canvas"],

    /**
     * Belt and braces: Vercel prunes files nothing statically imports, which is
     * how pdf.worker.mjs went missing from the deployment. This forces it to be
     * traced and shipped even if the import analysis misses it.
     */
    outputFileTracingIncludes: {
      "/api/ai/parse-resume": ["./node_modules/pdfjs-dist/legacy/build/**"],
      "/api/ai/resume-diagnostic": ["./node_modules/pdfjs-dist/legacy/build/**"],
      "/api/employer/resume": ["./node_modules/pdfjs-dist/legacy/build/**"]
    }
  }
};
export default nextConfig;
