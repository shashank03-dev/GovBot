import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle,
  FolderLock,
  GraduationCap,
  Landmark,
  Link2,
  MessageCircleMore,
  ScanLine,
  Search,
  Shield,
  ShieldCheck,
  Sprout,
  User,
  Zap,
} from 'lucide-react';

import { SERVICE_CARDS, TOOL_CARDS } from '@/lib/siteFeatureContent.mjs';
import { resolveLoggedInState } from '@/lib/layoutAuth.mjs';
import { buildOfficialLoginHref } from '@/lib/officialSession.mjs';
import { resolveProtectedHref } from '@/lib/navigationLinks.mjs';

const PORTAL_CARDS = [
  { id: 'nsp', name: 'NSP', full: 'National Scholarship Portal', href: '/nsp', color: '#ff9933', bg: '#fff7ed' },
  { id: 'ssp', name: 'SSP', full: 'State Scholarship Portal', href: '/ssp', color: '#2b6f89', bg: '#eef7fb' },
  { id: 'csss', name: 'CSSS', full: 'Central Sector Scholarship', href: '/csss', color: '#0d9488', bg: '#f0fdfa' },
  { id: 'minority', name: 'Minority', full: 'Minority Scholarship', href: '/minority', color: '#8b5cf6', bg: '#f5f3ff' },
];

const ICONS: Record<string, React.ElementType> = {
  Activity,
  CheckCircle,
  FolderLock,
  GraduationCap,
  Landmark,
  Link2,
  MessageCircleMore,
  ScanLine,
  Search,
  ShieldCheck,
  Sprout,
  User,
  Bell,
};

export default function ServicesHub() {
  const prefersReducedMotion = useReducedMotion();
  const [isLoggedIn, setIsLoggedIn] = useState(() =>
    resolveLoggedInState({ hasMounted: false, storage: null }),
  );

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
  }, []);

  return (
    <>
      <Head>
        <title>Services | GovBot</title>
        <meta name="description" content="Access all GovBot services: scholarships, eligibility, PM Kisan, document tools, and more." />
      </Head>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
        {/* Page header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            All Services
          </h1>
          <p className="text-sm text-slate-500 mt-1">Everything you need to navigate government scholarship schemes</p>
        </div>

        {/* Form Auto-Fill Hero */}
        <section>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            whileHover={prefersReducedMotion ? undefined : { y: -3 }}
            className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-semibold text-orange-100 uppercase tracking-wider">New</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Auto-Fill Any Government Form</h2>
              <p className="text-sm text-orange-100">
                Build your citizen profile once, sync documents from DigiLocker or OCR, and let GovBot fill government forms instantly.
              </p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
              <Link
                href="/form-fill"
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-orange-600 text-sm font-bold rounded-xl hover:bg-orange-50 transition-colors"
              >
                <Zap className="w-4 h-4" /> Try Auto-Fill
              </Link>
              <Link
                href="/profile"
                className="flex items-center justify-center gap-2 px-5 py-2 bg-white/20 text-white text-sm font-semibold rounded-xl hover:bg-white/30 transition-colors"
              >
                <User className="w-4 h-4" /> Build My Profile
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Main Services */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Main Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SERVICE_CARDS.map((card, i) => {
              const Icon = ICONS[card.icon] || GraduationCap;
              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  whileHover={prefersReducedMotion ? undefined : { y: -5, scale: 1.01 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                >
                  <Link href={card.href} className="block h-full group">
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 h-full hover:border-slate-200 hover:shadow-lg transition-all duration-300">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: card.bg }}>
                        <Icon className="w-5.5 h-5.5" style={{ color: card.color }} />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 group-hover:text-[#e67e00] transition-colors mb-1">
                        {card.title}
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed">{card.description}</p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Scholarship Portals */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Scholarship Portals</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {PORTAL_CARDS.map((portal, i) => (
              <motion.div
                key={portal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 + 0.2 }}
                whileHover={prefersReducedMotion ? undefined : { y: -5, scale: 1.01 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
              >
                <Link href={portal.href} className="block group">
                  <div className="rounded-2xl p-5 text-center border border-transparent hover:border-slate-200 hover:shadow-lg transition-all duration-300" style={{ background: portal.bg }}>
                    <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white text-lg font-bold shadow-md" style={{ background: `linear-gradient(135deg, ${portal.color}, ${portal.color}cc)` }}>
                      {portal.name.charAt(0)}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{portal.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{portal.full}</p>
                    <div className="mt-2 flex items-center justify-center gap-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: portal.color }}>
                      Open <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Tools & Utilities */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Tools & Utilities</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TOOL_CARDS.map((card, i) => {
              const Icon = ICONS[card.icon] || ScanLine;
              const href = resolveProtectedHref(card.href, {
                isLoggedIn,
                requiresAuth: card.requiresAuth,
              });
              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 + 0.4 }}
                  whileHover={prefersReducedMotion ? undefined : { y: -5, scale: 1.01 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                >
                  <Link href={href} className="block group">
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 hover:border-slate-200 hover:shadow-lg transition-all duration-300 flex items-start gap-3.5 h-full">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: card.bg }}>
                        <Icon className="w-5 h-5" style={{ color: card.color }} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 group-hover:text-[#e67e00] transition-colors">
                          {card.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{card.description}</p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Admin Links */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Government Officials</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href={buildOfficialLoginHref('/gov-dashboard')} className="block group">
              <motion.div
                className="bg-white border border-slate-100 rounded-2xl p-4 hover:border-slate-200 hover:shadow-lg transition-all duration-300 flex items-center gap-3.5"
                whileHover={prefersReducedMotion ? undefined : { y: -4, scale: 1.01 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 group-hover:text-[#e67e00] transition-colors">Analytics Dashboard</h3>
                  <p className="text-xs text-slate-500">Overview, fraud, disbursements, regional stats</p>
                </div>
              </motion.div>
            </Link>
            <Link href={buildOfficialLoginHref('/admin')} className="block group">
              <motion.div
                className="bg-white border border-slate-100 rounded-2xl p-4 hover:border-slate-200 hover:shadow-lg transition-all duration-300 flex items-center gap-3.5"
                whileHover={prefersReducedMotion ? undefined : { y: -4, scale: 1.01 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
              >
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 group-hover:text-[#e67e00] transition-colors">Admin Panel</h3>
                  <p className="text-xs text-slate-500">All applications & fraud flags</p>
                </div>
              </motion.div>
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
