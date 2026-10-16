import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // IMAP and MIME parsing run only on the server; keep them out of the bundle (TASK-009).
  serverExternalPackages: ["imapflow", "mailparser"],
  // Client material uploads (TASK-014): several photos per submit; host nginx allows 50 MB.
  experimental: { serverActions: { bodySizeLimit: "45mb" } },
};

export default nextConfig;
