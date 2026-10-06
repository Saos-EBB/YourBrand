import type { NextConfig } from "next";

// Server-to-server: default is plain localhost (frontend runs on the host),
// overridden to the docker-compose service name (http://nestjs:3000) when
// the frontend itself runs inside the container.
const backendInternalUrl = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.156'],
  rewrites: async () => [
    {
      source: '/uploads/:path*',
      destination: `${backendInternalUrl}/uploads/:path*`,
    },
    // Medien-Proxy des Backends (media.controller.ts). Mehrere Seiten machen
    // aus der Medien-URL einen relativen Pfad (new URL(...).pathname bzw.
    // .replace('http://localhost:3000', '')) — ohne diesen Rewrite landet der
    // auf dem Frontend-Origin und gibt 404. BACKEND_INTERNAL_URL ist pro
    // Mandant gesetzt, damit trifft es immer das richtige Backend.
    {
      source: '/api/v1/media/file/:path*',
      destination: `${backendInternalUrl}/api/v1/media/file/:path*`,
    },
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/uploads/**',
      },
    ],
  },
};

export default nextConfig;
