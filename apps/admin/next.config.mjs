/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The domain package ships TypeScript source; Next compiles it with the app.
  transpilePackages: ['@abide/domain'],
}

export default nextConfig
