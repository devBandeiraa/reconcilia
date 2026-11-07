import type { NextConfig } from 'next';
// Valida o env ao subir `next dev`/`next build`: com env inválido a web não sobe.
import './src/env';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
