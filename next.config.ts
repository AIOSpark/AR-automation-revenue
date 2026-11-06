import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // Next 16.3 defaults to the CLI TypeScript path. The project currently uses
  // TypeScript 5.9, whose CLI output is not parsed correctly by this Next
  // build worker in the current Node runtime. Keep build validation enabled,
  // but use Next's compiler API path until the CLI/runtime combination is
  // upgraded together.
  experimental: {
    useTypeScriptCli: false,
  },
  serverExternalPackages: ['node:sqlite'],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
