import type { NextConfig } from "next";

/**
 * Baseline security headers.
 *
 * The board carries staff photographs and names, so it is personal data on a
 * screen that may be published through a tunnel. These apply to real internet
 * traffic rather than a LAN. Deliberately stops short of a full
 * Content-Security-Policy: Next's inline bootstrap needs nonces to work under a
 * strict CSP, and a half-configured CSP that silently blanks the board is worse
 * than none. Worth adding separately, with the board retested afterwards.
 */
const securityHeaders = [
  // Nothing here should ever be framed; the admin panel especially.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No feature this app uses needs any of these.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/**
 * Hostnames allowed to reach dev-only assets (HMR, the error overlay).
 *
 * Next blocks cross-origin dev requests by default, so reaching `next dev`
 * through a tunnel gets the client bundle refused and the page never hydrates.
 * Development only — `next start` serves no dev resources.
 */
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "notice.harbourcare.co.uk")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,

  // The tunnel terminates TLS, so a leaked version banner helps nobody.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
