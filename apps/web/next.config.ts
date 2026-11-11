import type { NextConfig } from "next";

const distDir = process.env.NEXT_DIST_DIR?.trim() || ".next";
if (!/^\.next(?:-[a-z0-9-]+)?$/u.test(distDir)) {
  throw new Error("NEXT_DIST_DIR must be .next or an isolated .next-* directory name");
}

const nextConfig: NextConfig = {
  distDir,
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@researchflow/attachments", "@researchflow/auth", "@researchflow/db"],
  serverExternalPackages: ["@node-rs/argon2", "@prisma/adapter-pg", "@prisma/client", "file-type", "pg"],
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    config.externals.push(function externalizeArgon2(
      { request }: { request?: string },
      callback: (error?: Error | null, result?: string) => void,
    ) {
      if (request && /^@node-rs\/argon2(?:-|$)/.test(request)) {
        callback(null, `commonjs ${request}`);
        return;
      }
      callback();
    });
    return config;
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
};

export default nextConfig;
