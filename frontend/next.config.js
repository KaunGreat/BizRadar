/**
 * BizRadar frontend — Next.js.
 *
 * МАРШРУТИЗАЦИЯ (принципиально):
 *   браузер -> Caddy (:443, HTTPS) -> frontend (:3000)
 *   frontend -> rewrite /api/* -> BACKEND_INTERNAL_URL (внутри docker-сети)
 *
 * BACKEND_INTERNAL_URL:
 *   - в docker compose: http://api:8000   (внутреннее имя сервиса)
 *   - локально без Docker: http://localhost:8000 (дефолт ниже)
 * Дефолт гарантирует, что `next build` НЕ падает без переменных окружения.
 */
const BACKEND_INTERNAL_URL =
  process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // компактный прод-образ для Docker (server.js)
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_INTERNAL_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
