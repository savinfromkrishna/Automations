/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@prisma/client", "node-cron", "cheerio"],
};

export default nextConfig;
