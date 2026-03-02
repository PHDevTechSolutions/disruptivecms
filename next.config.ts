import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdfjs-dist out of the server bundle (it's client-only)
  serverExternalPackages: ["pdfjs-dist"],

  // Turbopack: alias the worker to the local node_modules copy
  // so it never tries to fetch from a CDN
  turbopack: {
    resolveAlias: {
      "pdfjs-dist/build/pdf.worker.mjs":
        "./node_modules/pdfjs-dist/build/pdf.worker.mjs",
    },
  },
};

export default nextConfig;