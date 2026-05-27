/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Firecrawl SDK has a soft dep on `undici` that webpack tries to follow.
  // Keep these packages out of the server bundle so Next doesn't analyze them.
  experimental: {
    serverComponentsExternalPackages: ["@mendable/firecrawl-js"],
  },
};

export default nextConfig;
