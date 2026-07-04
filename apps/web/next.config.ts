import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them in-place.
  transpilePackages: ['@calledit/contracts', '@calledit/engine', '@calledit/txline'],
};

export default nextConfig;
