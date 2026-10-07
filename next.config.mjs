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
    },

    /**
     * Do not reuse a page the browser already has.
     *
     * WHAT THIS FIXES: the App Router keeps a client side copy of each page it
     * has rendered and, by default, reuses it for 30 seconds on navigation
     * without asking the server. On an admin portal that reads a live database
     * this is the wrong trade. Twenty interviews were scheduled and the
     * Interviews page showed none of them, and interviews that had been
     * deleted reappeared when the page was navigated back to — in both cases
     * the browser was showing a snapshot taken before the change.
     *
     * Zero means every navigation asks the server. These pages are already
     * server rendered on demand, so nothing is being given up except the
     * stale copy.
     */
    staleTimes: { dynamic: 0, static: 0 }
  }
};
export default nextConfig;
