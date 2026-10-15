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
    serverComponentsExternalPackages: ["pdfjs-dist", "pdf-parse", "canvas", "@napi-rs/canvas"],

    /**
     * Belt and braces: Vercel prunes files nothing statically imports, which is
     * how pdf.worker.mjs went missing from the deployment. This forces it to be
     * traced and shipped even if the import analysis misses it.
     */
    outputFileTracingIncludes: {
      "/api/ai/parse-resume": ["./node_modules/pdfjs-dist/legacy/build/**"],
      "/api/ai/resume-diagnostic": ["./node_modules/pdfjs-dist/legacy/build/**"],
      /**
       * Resume redaction rasterises each page, so it needs the pdfjs worker
       * AND the native canvas binary. @napi-rs/canvas resolves its platform
       * package at runtime through js-binding.js, which the bundler cannot
       * follow, so without this the .node file is pruned from the deployment
       * and redaction fails in production while working locally. That is
       * exactly how pdf.worker.mjs went missing before.
       */
      "/api/employer/resume": [
        "./node_modules/pdfjs-dist/legacy/build/**",
        "./node_modules/@napi-rs/canvas-linux-x64-gnu/*.node",
        "./node_modules/@napi-rs/canvas-linux-x64-musl/*.node"
      ]
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
  },

  /**
   * Baseline response headers for every path.
   *
   * WHAT THIS FIXES: nothing stopped another site from loading the portal in a
   * hidden frame, so a signed in member's clicks could be aimed at buttons they
   * could not see. DENY ends that, and the rest close the ordinary adjacent
   * holes: content sniffed into a different type than it was served as, full
   * URLs with ids in them leaking to third parties through the referrer, a
   * frame quietly asking for the camera or the visitor's location, and a first
   * visit over plain HTTP.
   *
   * NO CONTENT SECURITY POLICY HERE, DELIBERATELY. The public job and training
   * pages carry inline JSON-LD for search engines, and the print views use
   * inline script. Any policy strict enough to be worth setting would block
   * those on the pages visitors actually land on. A CSP for this app needs a
   * nonce threaded through those inline scripts first, measured in report only
   * mode, and then enforced. Added blind it just breaks pages.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }
        ]
      }
    ];
  }
};
export default nextConfig;
