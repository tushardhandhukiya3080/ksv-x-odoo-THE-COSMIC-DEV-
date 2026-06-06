import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Standalone output (lean Docker image) is gated behind BUILD_STANDALONE so local
// Windows builds — which can't create the trace symlinks — still work. The Dockerfile
// (Linux) sets BUILD_STANDALONE=true.
const standalone = process.env.BUILD_STANDALONE === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(standalone
    ? { output: 'standalone', outputFileTracingRoot: join(__dirname, '../../') }
    : {}),
  transpilePackages: ['@vendorbridge/shared'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
