import type { NextConfig } from "next";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  'http://localhost:8000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/api/auth/official/login', destination: `${BACKEND_URL}/auth/official/login` },
      { source: '/api/send-otp', destination: `${BACKEND_URL}/auth/send-otp` },
      { source: '/api/verify-otp', destination: `${BACKEND_URL}/auth/verify-otp` },
      { source: '/api/ocr/:path*', destination: `${BACKEND_URL}/ocr/:path*` },
      { source: '/api/documents/:path*', destination: `${BACKEND_URL}/documents/:path*` },
      { source: '/api/bank/:path*', destination: `${BACKEND_URL}/api/bank/:path*` },
      { source: '/api/digilocker/:path*', destination: `${BACKEND_URL}/api/digilocker/:path*` },
      { source: '/api/credentials/:path*', destination: `${BACKEND_URL}/api/credentials/:path*` },
      { source: '/api/analytics/:path*', destination: `${BACKEND_URL}/api/analytics/:path*` },
      { source: '/api/admin/:path*', destination: `${BACKEND_URL}/api/admin/:path*` },
      { source: '/api/live/:path*', destination: `${BACKEND_URL}/live/:path*` },
      { source: '/api/pm-kisan', destination: `${BACKEND_URL}/pm-kisan/status` },
      { source: '/api/applications/:path*', destination: `${BACKEND_URL}/applications/:path*` },
      { source: '/api/profile/:path*', destination: `${BACKEND_URL}/profile/:path*` },
      { source: '/api/form-scanner/:path*', destination: `${BACKEND_URL}/form-scanner/:path*` },
      { source: '/api/eligibility/:path*', destination: `${BACKEND_URL}/eligibility/:path*` },
      { source: '/api/renewals/:path*', destination: `${BACKEND_URL}/renewals/:path*` },
      { source: '/api/portals/:path*', destination: `${BACKEND_URL}/portals/:path*` },
      { source: '/api/ssp/:path*', destination: `${BACKEND_URL}/api/ssp/:path*` },
    ];
  },
};

export default nextConfig;
