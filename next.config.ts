import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // IMAP and MIME parsing run only on the server; keep them out of the bundle (TASK-009).
  serverExternalPackages: ["imapflow", "mailparser"],
};

export default nextConfig;
