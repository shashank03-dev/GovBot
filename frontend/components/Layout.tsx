import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, GraduationCap, LayoutDashboard, CheckCircle, Briefcase, LogIn, LogOut, ChevronRight } from 'lucide-react';
import { resolveLoggedInState } from '@/lib/layoutAuth.mjs';

interface LayoutProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { href: '/', label: 'Home', icon: GraduationCap },
  { href: '/services', label: 'Services', icon: Briefcase },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/eligibility', label: 'Eligibility', icon: CheckCircle },
];

const NO_LAYOUT_PAGES = ['/nsp', '/nsp/apply', '/ssp', '/ssp/dashboard', '/ssp/step-1', '/ssp/step-2', '/ssp/step-3', '/ssp/step-4', '/ssp/step-5', '/csss', '/minority', '/digilocker', '/digilocker/callback'];

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() =>
    resolveLoggedInState({ hasMounted: false, storage: null }),
  );

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const syncLoggedInState = () => {
      setIsLoggedIn(
        resolveLoggedInState({
          hasMounted: true,
          storage: window.localStorage,
        }),
      );
    };

    syncLoggedInState();
    window.addEventListener('storage', syncLoggedInState);
    return () => window.removeEventListener('storage', syncLoggedInState);
  }, [router.asPath]);

  if (NO_LAYOUT_PAGES.includes(router.pathname)) {
    return <>{children}</>;
  }

  const handleLogout = () => {
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('govbot_token');
    localStorage.removeItem('govbot_phone');
    setIsLoggedIn(false);
    setMobileOpen(false);
    router.push('/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fafbfc]">
      {/* Navbar */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#e67e00] flex items-center justify-center shadow-md shadow-orange-200/50 group-hover:shadow-orange-300/60 transition-shadow">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Gov<span className="text-[#ff9933]">Bot</span>
              </span>
            </Link>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const isActive = router.pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-orange-50 text-[#e67e00]'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>

            {/* Right side */}
            <div className="hidden md:flex items-center gap-3">
              {isLoggedIn ? (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white text-sm font-semibold rounded-xl shadow-md shadow-orange-200/50 hover:shadow-orange-300/60 hover:-translate-y-0.5 transition-all"
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </Link>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-slate-100 bg-white/95 backdrop-blur-xl overflow-hidden"
            >
              <div className="px-4 py-3 space-y-1">
                {NAV_LINKS.map((link) => {
                  const Icon = link.icon;
                  const isActive = router.pathname === link.href;
                  return (
                    <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-orange-50 text-[#e67e00]'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4.5 h-4.5" />
                      {link.label}
                      <ChevronRight className="w-4 h-4 ml-auto opacity-40" />
                    </Link>
                  );
                })}
                <div className="pt-2 border-t border-slate-100">
                  {isLoggedIn ? (
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      <LogOut className="w-4.5 h-4.5" />
                      Logout
                    </button>
                  ) : (
                    <Link
                      href="/login"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white text-sm font-semibold rounded-xl"
                    >
                      <LogIn className="w-4 h-4" />
                      Login
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ff9933] to-[#e67e00] flex items-center justify-center">
                  <GraduationCap className="w-4.5 h-4.5 text-white" />
                </div>
                <span className="text-lg font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Gov<span className="text-[#ff9933]">Bot</span>
                </span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                AI-powered scholarship assistant for Indian students. Simplifying government schemes.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Quick Links</h4>
              <ul className="space-y-2">
                {[
                  { href: '/eligibility', label: 'Check Eligibility' },
                  { href: '/services', label: 'All Services' },
                  { href: '/pmkisan', label: 'PM Kisan Status' },
                  { href: '/track-search', label: 'Track Application' },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-slate-500 hover:text-[#ff9933] transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Portals */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Portals</h4>
              <ul className="space-y-2">
                {[
                  { href: '/nsp', label: 'NSP - National Scholarship' },
                  { href: '/ssp', label: 'SSP - State Scholarship Portal' },
                  { href: '/csss', label: 'CSSS - Central Sector' },
                  { href: '/minority', label: 'Minority Scholarship' },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-slate-500 hover:text-[#ff9933] transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tools */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Tools</h4>
              <ul className="space-y-2">
                {[
                  { href: '/ocr', label: 'Aadhaar OCR' },
                  { href: '/bank-verify', label: 'Bank Verification' },
                  { href: '/documents', label: 'Document Validator' },
                  { href: '/wallet', label: 'Credential Wallet' },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-slate-500 hover:text-[#ff9933] transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              &copy; {new Date().getFullYear()} GovBot. Powered by AI for Digital India.
            </p>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-full text-xs text-slate-500">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                AI-Powered
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 rounded-full text-xs text-[#e67e00]">
                🇮🇳 Digital India
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
