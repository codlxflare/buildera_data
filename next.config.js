/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // папка .next/standalone для деплоя на сервер / Docker

  // Global security headers applied to every response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent MIME-sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Stop XSS auditor (modern browsers ignore, but belt+suspenders)
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // Don't leak referrer to external sites
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Restrict browser features not needed by this app
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // Basic CSP: only same-origin scripts/styles; api.openai.com for data fetch
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js needs 'unsafe-inline' for styles and 'unsafe-eval' in dev; in prod only unsafe-inline for styles
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              // API calls go to OpenAI (server-side only, but CSP doesn't restrict server-side)
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      // Cache-control for API routes (additional safety)
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },

  webpack: (config, { dev }) => {
    if (dev) {
      // Снижает нагрузку на file watcher (EMFILE) — меньше открытых дескрипторов
      config.watchOptions = {
        ignored: ["**/node_modules/**", "**/.next/**", "**/.git/**"],
        aggregateTimeout: 300,
        poll: 2000,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
