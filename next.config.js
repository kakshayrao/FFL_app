/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Skip ESLint in `next build` (CI) – dev still shows errors
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
