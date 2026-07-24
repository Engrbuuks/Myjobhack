/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /**
     * Keep PDF libraries OUT of the server bundle.
     *
     * pdfjs-dist loads pdf.worker.mjs at runtime by path. When Next bundles the
     * package into a chunk, that sibling file is not emitted, so extraction dies
     * with: Cannot find module '.next/server/chunks/pdf.worker.mjs'.
     *
     * Listing them here leaves them in node_modules and requires them normally,
     * so the worker sits beside the code that looks for it.
     * (Next 14 key — renamed to serverExternalPackages in Next 15.)
     */
    serverComponentsExternalPackages: ["pdfjs-dist", "pdf-parse", "canvas"]
  }
};
export default nextConfig;
