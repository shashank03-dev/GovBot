import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      { source: '/api/send-otp', destination: `${BACKEND_URL}/auth/send-otp` },
      { source: '/api/verify-otp', destination: `${BACKEND_URL}/auth/verify-otp` },
      { source: '/api/ocr/:path*', destination: `${BACKEND_URL}/ocr/:path*` },
      { source: '/api/documents/:path*', destination: `${BACKEND_URL}/documents/:path*` },
      { source: '/api/bank/:path*', destination: `${BACKEND_URL}/api/bank/:path*` },
      { source: '/api/digilocker/:path*', destination: `${BACKEND_URL}/api/digilocker/:path*` },
      { source: '/api/credentials/:path*', destination: `${BACKEND_URL}/api/credentials/:path*` },
      { source: '/api/analytics/:path*', destination: `${BACKEND_URL}/api/analytics/:path*` },
      { source: '/api/live/:path*', destination: `${BACKEND_URL}/live/:path*` },
      { source: '/api/pm-kisan', destination: `${BACKEND_URL}/pm-kisan/status` },
      { source: '/api/profile/:path*', destination: `${BACKEND_URL}/profile/:path*` },
      { source: '/api/form-scanner/:path*', destination: `${BACKEND_URL}/form-scanner/:path*` },
      { source: '/api/eligibility/:path*', destination: `${BACKEND_URL}/eligibility/:path*` },
      { source: '/api/renewals/:path*', destination: `${BACKEND_URL}/renewals/:path*` },
      { source: '/api/portals/:path*', destination: `${BACKEND_URL}/portals/:path*` },
    ];
  },
};

export default nextConfig;
