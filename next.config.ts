import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 1. Allow the ngrok domain to trigger Server Actions
      allowedOrigins: [
        'localhost:3000',
        'noncadenced-zachery-phalangeal.ngrok-free.dev', // 👈 Copy your EXACT ngrok domain here
      ],
    },
  },
};

export default nextConfig;
