import React, { useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import AnimatedCounter from '@/components/AnimatedCounter';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle,
  Clock3,
  FileCheck2,
  FolderLock,
  Globe,
  Landmark,
  Link2,
  LockKeyhole,
  MessageCircleMore,
  QrCode,
  ScanLine,
  Search,
  SendHorizontal,
  ShieldCheck,
  Smartphone,
  Sprout,
  Upload,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';

import {
  HERO_CONSOLE_STEPS,
  HERO_CHAT_MESSAGES,
  HERO_PRODUCT_POSITIONING,
  HERO_SERVICE_PILLS,
  HOMEPAGE_DISCOVER_CARDS,
  HOMEPAGE_FEATURES,
  ONBOARDING_ACTIVITY_ITEMS,
  ONBOARDING_SIGNALS,
} from '@/lib/siteFeatureContent.mjs';

const PORTALS = [
  { id: 'nsp', name: 'NSP', full: 'National Scholarship Portal', href: '/nsp', color: '#ff9933', bg: '#fff7ed' },
  { id: 'pmss', name: 'PMSS', full: 'Post Matric Scholarship', href: '/pmss', color: '#3b82f6', bg: '#eff6ff' },
  { id: 'csss', name: 'CSSS', full: 'Central Sector Scholarship', href: '/csss', color: '#0d9488', bg: '#f0fdfa' },
  { id: 'minority', name: 'Minority', full: 'Minority Scholarship', href: '/minority', color: '#8b5cf6', bg: '#f5f3ff' },
];

const STEPS = [
  { step: '01', title: 'Start on WhatsApp or Web', desc: 'Begin from WhatsApp guidance or web login with OTP-backed access to the same account.', icon: MessageCircleMore },
  { step: '02', title: 'Build Profile and Secure Docs', desc: 'Use profile completeness, DigiLocker sync, Aadhaar OCR, and the passkey-gated vault to prepare once.', icon: Upload },
  { step: '03', title: 'Auto-Apply and Track Live', desc: 'GovBot fills the form, updates the dashboard timeline, and keeps proof links ready after submission.', icon: Smartphone },
];

const HERO_BENTO_TILES = [
  { className: 'left-[3%] top-[10%] h-24 w-44', tone: 'govbot-bento-tile-saffron', delay: '0ms' },
  { className: 'left-[18%] top-[6%] h-16 w-32', tone: 'govbot-bento-tile-white', delay: '120ms' },
  { className: 'right-[17%] top-[8%] h-20 w-44', tone: 'govbot-bento-tile-teal', delay: '240ms' },
  { className: 'right-[4%] top-[17%] h-32 w-36', tone: 'govbot-bento-tile-white', delay: '360ms' },
  { className: 'left-[8%] top-[43%] h-40 w-28', tone: 'govbot-bento-tile-white', delay: '480ms' },
  { className: 'right-[9%] top-[47%] h-28 w-48', tone: 'govbot-bento-tile-saffron', delay: '600ms' },
  { className: 'left-[22%] bottom-[10%] h-20 w-48', tone: 'govbot-bento-tile-teal', delay: '720ms' },
  { className: 'right-[24%] bottom-[7%] h-24 w-36', tone: 'govbot-bento-tile-white', delay: '840ms' },
];

const FEATURE_ICONS: Record<string, React.ElementType> = {
  MessageCircleMore,
  Bot,
  Clock3,
  FileCheck2,
  Globe,
  UserRound,
  FolderLock,
  ScanLine,
  Activity,
  ShieldCheck,
  Landmark,
  Search,
  Sprout,
  Link2,
  LockKeyhole,
  QrCode,
  SendHorizontal,
  BarChart3,
};

function FadeInSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function HeroBentoBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="govbot-bento-grid absolute inset-0" />
      <div className="absolute left-1/2 top-1/2 h-[760px] w-[1180px] -translate-x-1/2 -translate-y-1/2">
        {HERO_BENTO_TILES.map((tile) => (
          <div
            key={`${tile.className}-${tile.delay}`}
            className={`govbot-bento-tile absolute rounded-[1.75rem] ${tile.className} ${tile.tone}`}
            style={{ animationDelay: tile.delay }}
          />
        ))}
      </div>
    </div>
  );
}

function HeroChatLayer({ shift, reduceMotion }: { shift: { x: number; y: number }; reduceMotion: boolean }) {
  const positions = [
    'left-[4%] top-[20%]',
    'right-[3%] top-[24%]',
    'left-[8%] bottom-[17%]',
    'right-[8%] bottom-[15%]',
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-0 hidden xl:block">
      {HERO_CHAT_MESSAGES.map((chat, i) => (
        <motion.div
          key={chat.id}
          className={`pointer-events-auto absolute ${positions[i] || positions[0]}`}
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.45 + i * 0.16, ease: [0.16, 1, 0.3, 1] }}
          style={{
            x: shift.x * (i % 2 === 0 ? 0.75 : -0.65),
            y: shift.y * (i < 2 ? 0.65 : -0.55),
          }}
          whileHover={reduceMotion ? undefined : { scale: 1.03, rotate: i % 2 === 0 ? -0.7 : 0.7 }}
        >
          <div className={`govbot-chat-float ${i % 2 === 1 ? 'govbot-chat-float-slow' : ''} w-[270px] rounded-2xl border border-white/80 bg-white/90 p-4 shadow-xl shadow-orange-100/40 backdrop-blur-sm`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: chat.color }}>
                <span className="govbot-chat-pulse h-2 w-2 rounded-full" style={{ backgroundColor: chat.color }} />
                {chat.channel}
              </span>
              <span className="text-[11px] font-medium text-slate-400">{chat.meta}</span>
            </div>
            <p className="text-sm font-semibold leading-relaxed text-slate-800">{chat.message}</p>
            <div className={`mt-3 flex ${chat.side === 'right' ? 'justify-end' : 'justify-start'}`}>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1">
                <span className="govbot-typing-dot" />
                <span className="govbot-typing-dot" style={{ animationDelay: '140ms' }} />
                <span className="govbot-typing-dot" style={{ animationDelay: '280ms' }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{chat.speaker}</span>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function HeroServicePills({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="mb-7 flex flex-wrap items-center justify-center gap-2"
    >
      {HERO_SERVICE_PILLS.map((pill, i) => {
        const Icon = FEATURE_ICONS[pill.icon] || CheckCircle;

        return (
          <motion.div
            key={pill.id}
            className="govbot-chip-drift inline-flex items-center gap-2 rounded-full border border-slate-100 bg-white/90 px-3 py-2 text-left shadow-sm shadow-slate-100"
            style={{ animationDelay: `${i * 180}ms` }}
            whileHover={reduceMotion ? undefined : { y: -3, scale: 1.02 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: pill.bg }}>
              <Icon className="h-3.5 w-3.5" style={{ color: pill.color }} />
            </span>
            <span>
              <span className="block text-xs font-bold text-slate-900">{pill.label}</span>
              <span className="hidden text-[10px] font-medium text-slate-400 sm:block">{pill.detail}</span>
            </span>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function HeroExperienceConsole({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.65, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto mt-12 max-w-5xl text-left"
    >
      <div className="absolute -left-8 top-10 hidden h-24 w-24 rounded-full bg-orange-200/30 blur-2xl sm:block" />
      <div className="absolute -right-8 bottom-8 hidden h-28 w-28 rounded-full bg-teal-200/25 blur-2xl sm:block" />

      <div className="relative overflow-hidden rounded-[2rem] border border-orange-100/80 bg-white/95 p-4 shadow-2xl shadow-orange-100/50 sm:p-5">
        <div className="govbot-console-scan absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#ff9933]/70 to-transparent" />

        <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50">
              <Bot className="h-5 w-5 text-[#e67e00]" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Live citizen service desk</div>
              <div className="text-xs text-slate-500">Chat, profile, vault, tracking, and proof in one flow</div>
            </div>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-700">
            <span className="govbot-chat-pulse h-2 w-2 rounded-full bg-teal-500" />
            System online
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <MessageCircleMore className="h-4 w-4 text-[#0d9488]" />
                Citizen chat
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-400">Auto-routed</span>
            </div>

            <div className="space-y-3">
              {HERO_CHAT_MESSAGES.slice(0, 3).map((chat, i) => (
                <motion.div
                  key={chat.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.58 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex ${chat.side === 'right' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[86%] rounded-2xl px-4 py-3 ${chat.side === 'right' ? 'bg-orange-50' : 'bg-white'}`}>
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: chat.color }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: chat.color }} />
                      {chat.channel}
                    </div>
                    <p className="text-sm font-semibold leading-relaxed text-slate-700">{chat.message}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2.5">
              <span className="flex-1 text-xs font-medium text-slate-400">Ask about certificates, benefits, IDs, or status</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ff9933] text-white">
                <SendHorizontal className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {HERO_SERVICE_PILLS.map((pill, i) => {
                const Icon = FEATURE_ICONS[pill.icon] || CheckCircle;

                return (
                  <motion.div
                    key={pill.id}
                    className="rounded-2xl border border-slate-100 bg-white p-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.62 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={reduceMotion ? undefined : { y: -3 }}
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: pill.bg }}>
                      <Icon className="h-4 w-4" style={{ color: pill.color }} />
                    </div>
                    <div className="text-sm font-bold text-slate-900">{pill.label}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-slate-400">{pill.detail}</div>
                  </motion.div>
                );
              })}
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-900">Workflow now running</div>
                  <div className="mt-0.5 text-xs text-slate-500">The same request becomes a tracked service packet.</div>
                </div>
                <Clock3 className="h-5 w-5 text-slate-300" />
              </div>

              <div className="space-y-3">
                {HERO_CONSOLE_STEPS.map((step, i) => {
                  const Icon = FEATURE_ICONS[step.icon] || CheckCircle;

                  return (
                    <motion.div
                      key={step.id}
                      className="flex items-start gap-3"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: 0.72 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                        {i < HERO_CONSOLE_STEPS.length - 1 && <span className="absolute left-1/2 top-9 h-5 w-px bg-slate-100" />}
                        <Icon className="h-4 w-4" style={{ color: step.color }} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">{step.title}</div>
                        <p className="text-xs leading-relaxed text-slate-500">{step.detail}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function OnboardingSignalRail() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="bg-white py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeInSection>
          <div className="relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-5 shadow-xl shadow-slate-100/70 sm:p-6">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-orange-100/50 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-teal-100/40 blur-3xl" />

            <div className="relative mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#e67e00]">
                  <FileCheck2 className="h-3.5 w-3.5" />
                  Onboarding engine
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  First impression feels like the product is already working
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
                  The entry flow turns a chat into a verified profile, document packet, live timeline, and official-ready record.
                </p>
              </div>

              <div className="w-full rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 lg:w-auto">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-700">
                  <span className="govbot-chat-pulse h-2 w-2 rounded-full bg-teal-500" />
                  Secure handoff active
                </div>
                <p className="mt-1 text-xs text-teal-700/70">OTP, passkey, and proof links stay connected.</p>
              </div>
            </div>

            <div className="relative">
              <div className="hidden lg:block absolute left-8 right-8 top-1/2 h-px bg-slate-100 govbot-onboarding-line" />
              <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ONBOARDING_SIGNALS.map((signal, i) => {
                  const Icon = FEATURE_ICONS[signal.icon] || CheckCircle;
                  return (
                    <motion.div
                      key={signal.id}
                      className="group relative rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 transition-colors hover:bg-white"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                      whileHover={reduceMotion ? undefined : { y: -4, scale: 1.01 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm">
                          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full govbot-chat-pulse" style={{ backgroundColor: signal.color }} />
                          <Icon className="h-5 w-5" style={{ color: signal.color }} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{signal.title}</h3>
                          <p className="mt-0.5 text-xs text-slate-500">{signal.detail}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div className="relative mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-900">Live intake activity</div>
                    <div className="text-xs text-slate-500">What a new citizen sees during first run</div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Session 01</span>
                </div>

                <div className="space-y-2.5">
                  {ONBOARDING_ACTIVITY_ITEMS.map((item, i) => {
                    const Icon = FEATURE_ICONS[item.icon] || CheckCircle;

                    return (
                      <motion.div
                        key={item.id}
                        className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: 0.18 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                        whileHover={reduceMotion ? undefined : { x: 4 }}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                          <Icon className="h-4.5 w-4.5" style={{ color: item.color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-slate-900">{item.title}</div>
                          <div className="truncate text-xs text-slate-500">{item.detail}</div>
                        </div>
                        <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-400">{item.status}</span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-orange-100 bg-orange-50/70 p-4">
                <div className="govbot-proof-sweep absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                <div className="relative">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-900">Credential gate</div>
                      <div className="text-xs text-slate-500">Passkey, QR, and officer proof link</div>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white">
                      <QrCode className="h-5 w-5 text-[#e67e00]" />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">4-digit passkey</span>
                      <LockKeyhole className="h-4 w-4 text-slate-300" />
                    </div>
                    <div className="mb-5 flex gap-2">
                      {[0, 1, 2, 3].map((dot) => (
                        <span
                          key={dot}
                          className="govbot-chat-pulse h-3 w-3 rounded-full bg-[#ff9933]"
                          style={{ animationDelay: `${dot * 120}ms` }}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl bg-slate-50 p-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
                        <ShieldCheck className="h-5 w-5 text-teal-600" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">Proof link ready</div>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          Citizens can share a verified status page instead of uploading the same proof again.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const prefersReducedMotion = useReducedMotion();
  const [heroShift, setHeroShift] = useState({ x: 0, y: 0 });

  const handleHeroMove = (event: React.MouseEvent<HTMLElement>) => {
    if (prefersReducedMotion) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 22;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 16;
    setHeroShift({ x, y });
  };

  return (
    <>
      <Head>
        <title>GovBot: AI-Powered Citizen Services Platform for India</title>
        <meta name="description" content={HERO_PRODUCT_POSITIONING.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="GovBot: AI-Powered Citizen Services Platform" />
        <meta property="og:description" content={HERO_PRODUCT_POSITIONING.description} />
        <meta property="og:type" content="website" />
      </Head>

      {/* Hero Section */}
      <section
        className="relative overflow-hidden"
        onMouseMove={handleHeroMove}
        onMouseLeave={() => setHeroShift({ x: 0, y: 0 })}
      >
        <div className="absolute inset-0 gradient-hero" />
        <HeroBentoBackdrop />
        <div className="absolute top-20 left-10 w-72 h-72 bg-orange-200/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-teal-200/15 rounded-full blur-3xl animate-float" style={{ animationDelay: '3s' }} />
        <HeroChatLayer shift={heroShift} reduceMotion={Boolean(prefersReducedMotion)} />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24 sm:pt-24 sm:pb-32">
          <div className="text-center max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-50 border border-orange-200 rounded-full text-sm text-[#e67e00] font-medium mb-6"
            >
              <Zap className="w-3.5 h-3.5" />
              {HERO_PRODUCT_POSITIONING.kicker}
            </motion.div>

            <HeroServicePills reduceMotion={Boolean(prefersReducedMotion)} />

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1] mb-6"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              {HERO_PRODUCT_POSITIONING.title}{' '}
              <span className="text-[#e67e00]" style={{ fontFamily: 'Georgia, Cambria, serif', fontStyle: 'italic', fontWeight: 700 }}>
                {HERO_PRODUCT_POSITIONING.highlight}
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg sm:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed"
            >
              {HERO_PRODUCT_POSITIONING.description}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link
                href={HERO_PRODUCT_POSITIONING.primaryHref}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white text-base font-semibold rounded-xl shadow-lg shadow-orange-200/50 hover:shadow-orange-300/60 hover:-translate-y-0.5 transition-all"
              >
                {HERO_PRODUCT_POSITIONING.primaryCta}
                <ArrowRight className="w-4.5 h-4.5" />
              </Link>
              <Link
                href={HERO_PRODUCT_POSITIONING.secondaryHref}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white border-2 border-slate-200 text-slate-700 text-base font-semibold rounded-xl hover:border-[#ff9933] hover:text-[#e67e00] transition-all"
              >
                {HERO_PRODUCT_POSITIONING.secondaryCta}
              </Link>
            </motion.div>

            <HeroExperienceConsole reduceMotion={Boolean(prefersReducedMotion)} />

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto"
            >
              {[
                { value: 10000, suffix: '+', label: HERO_PRODUCT_POSITIONING.statLabels[0] },
                { value: 50, suffix: '+', label: HERO_PRODUCT_POSITIONING.statLabels[1] },
                { value: 4, suffix: '', label: HERO_PRODUCT_POSITIONING.statLabels[2] },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="text-xs sm:text-sm text-slate-400 mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      <OnboardingSignalRail />

      {/* Features Grid */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Everything You Need
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              From chat intake to verification and official dashboards, GovBot handles the full citizen service workflow.
            </p>
          </FadeInSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {HOMEPAGE_FEATURES.map((feat, i) => {
              const Icon = FEATURE_ICONS[feat.icon] || CheckCircle;
              return (
                <FadeInSection key={feat.title} delay={i * 0.05}>
                  <motion.div
                    className="group p-6 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 hover:shadow-lg transition-all duration-300 h-full"
                    whileHover={prefersReducedMotion ? undefined : { y: -6, rotate: i % 2 === 0 ? 0.25 : -0.25 }}
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                      style={{ backgroundColor: `${feat.color}12` }}
                    >
                      <Icon className="w-5.5 h-5.5" style={{ color: feat.color }} />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-1.5 group-hover:text-[#e67e00] transition-colors">
                      {feat.title}
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{feat.desc}</p>
                  </motion.div>
                </FadeInSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* Web Surface */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              More Ways GovBot Works On The Web
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              GovBot surfaces tracking, PM Kisan, DigiLocker, service tools, and official analytics in one web entry point.
            </p>
          </FadeInSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {HOMEPAGE_DISCOVER_CARDS.map((card, i) => {
              const Icon = FEATURE_ICONS[card.icon] || CheckCircle;
              return (
                <FadeInSection key={card.id} delay={i * 0.06}>
                  <Link href={card.href} className="block group">
                    <motion.div
                      className="p-6 rounded-2xl border border-transparent hover:border-slate-200 transition-all duration-300 h-full hover:shadow-lg"
                      style={{ backgroundColor: card.bg }}
                      whileHover={prefersReducedMotion ? undefined : { y: -6, scale: 1.01 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${card.color}12` }}>
                        <Icon className="w-5.5 h-5.5" style={{ color: card.color }} />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mb-1.5 group-hover:text-[#e67e00] transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-sm text-slate-500 leading-relaxed">{card.desc}</p>
                    </motion.div>
                  </Link>
                </FadeInSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* Portals Section */}
      <section className="py-20 sm:py-28 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Connected Government Portals
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Use one front door across public service portals, starting with major scholarship systems.
            </p>
          </FadeInSection>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {PORTALS.map((portal, i) => (
              <FadeInSection key={portal.id} delay={i * 0.08}>
                <Link href={portal.href} className="block group">
                  <motion.div
                    className="p-6 rounded-2xl border border-transparent hover:border-slate-200 transition-all duration-300 text-center h-full hover:shadow-lg"
                    style={{ backgroundColor: portal.bg }}
                    whileHover={prefersReducedMotion ? undefined : { y: -5, scale: 1.01 }}
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div
                      className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white text-xl font-bold shadow-md"
                      style={{ background: `linear-gradient(135deg, ${portal.color}, ${portal.color}cc)` }}
                    >
                      {portal.name.charAt(0)}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{portal.name}</h3>
                    <p className="text-sm text-slate-500">{portal.full}</p>
                    <div className="mt-3 flex items-center justify-center gap-1 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: portal.color }}>
                      Open Portal <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </motion.div>
                </Link>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              How It Works
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Three simple steps from discovery to application.
            </p>
          </FadeInSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <FadeInSection key={s.step} delay={i * 0.1}>
                  <motion.div
                    className="relative text-center"
                    whileHover={prefersReducedMotion ? undefined : { y: -4 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200/50 flex items-center justify-center mx-auto mb-5">
                      <Icon className="w-7 h-7 text-[#e67e00]" />
                    </div>
                    <div className="text-xs font-bold text-[#ff9933] uppercase tracking-wider mb-2">Step {s.step}</div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{s.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
                    {i < STEPS.length - 1 && (
                      <div className="hidden md:block absolute top-8 -right-4 w-8">
                        <ArrowRight className="w-5 h-5 text-slate-300" />
                      </div>
                    )}
                  </motion.div>
                </FadeInSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 py-14 sm:px-16 sm:py-20 text-center">
              <div className="absolute top-0 left-1/4 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl" />

              <div className="relative z-10">
                <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Bring Citizen Services Into One Flow
                </h2>
                <p className="text-lg text-slate-400 max-w-xl mx-auto mb-8">
                  Citizens start in chat, officials get dashboards, and every service keeps profile, documents, status, and proof connected.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    href="/services"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white text-base font-semibold rounded-xl shadow-lg shadow-orange-900/30 hover:shadow-orange-900/50 hover:-translate-y-0.5 transition-all"
                  >
                    Explore Services
                    <ArrowRight className="w-4.5 h-4.5" />
                  </Link>
                  <a
                    href="https://wa.me/919999999999?text=Hi%20GovBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white/10 border border-white/20 text-white text-base font-semibold rounded-xl hover:bg-white/20 transition-all"
                  >
                    <Users className="w-4.5 h-4.5" />
                    Chat on WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </FadeInSection>
        </div>
      </section>
    </>
  );
}
