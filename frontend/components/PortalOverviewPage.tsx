import Head from 'next/head';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  Landmark,
  MessageCircleMore,
  ShieldCheck,
} from 'lucide-react';

type PortalStat = {
  label: string;
  value: string;
  helper: string;
};

type PortalHighlight = {
  title: string;
  body: string;
  icon: LucideIcon;
};

type PortalOverviewPageProps = {
  pageTitle: string;
  metaDescription: string;
  shortName: string;
  schemeName: string;
  ministry: string;
  description: string;
  heroNote: string;
  badgeLabel: string;
  badgeBg: string;
  badgeText: string;
  applyHref: string;
  primaryLabel: string;
  stats: PortalStat[];
  highlights: PortalHighlight[];
  announcements: string[];
  requirements: string[];
  about: string[];
};

export default function PortalOverviewPage({
  pageTitle,
  metaDescription,
  shortName,
  schemeName,
  ministry,
  description,
  heroNote,
  badgeLabel,
  badgeBg,
  badgeText,
  applyHref,
  primaryLabel,
  stats,
  highlights,
  announcements,
  requirements,
  about,
}: PortalOverviewPageProps) {
  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
      </Head>

      <div className="min-h-screen gradient-hero">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <Link href="/" className="hover:text-[#ff9933] transition-colors">GovBot</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/services" className="hover:text-[#ff9933] transition-colors">Services</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-600 font-medium">{shortName}</span>
          </div>

          <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 sm:p-8 lg:p-10 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <span
                    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]"
                    style={{ backgroundColor: badgeBg, color: badgeText }}
                  >
                    {badgeLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                    <Landmark className="h-3.5 w-3.5 text-[#ff9933]" />
                    {ministry}
                  </span>
                </div>

                <h1
                  className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {schemeName}
                </h1>
                <p className="mt-4 max-w-2xl text-sm sm:text-base leading-7 text-slate-600">
                  {description}
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href={applyHref}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-200/60 transition-all hover:-translate-y-0.5 hover:shadow-orange-300/70"
                  >
                    {primaryLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/eligibility"
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-[#e67e00]"
                  >
                    Check eligibility
                  </Link>
                  <Link
                    href="/track-search"
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-[#e67e00]"
                  >
                    Track application
                  </Link>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-slate-50/85 p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50">
                    <ShieldCheck className="h-5 w-5 text-[#e67e00]" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Why this fits GovBot
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{heroNote}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Citizen workflow
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      WhatsApp guidance, reusable profile, OCR or DigiLocker prefill, bank verification, and dashboard tracking.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Best for demo
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      Start here, then continue straight into the guided apply flow without leaving the GovBot surface.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-orange-100 bg-white/90 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50">
                <MessageCircleMore className="h-4.5 w-4.5 text-[#e67e00]" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Latest scheme notes
                </p>
                <div className="mt-2 flex flex-col gap-2 text-sm text-slate-600">
                  {announcements.map((item) => (
                    <p key={item} className="leading-6">
                      <span className="mr-2 text-[#ff9933]">•</span>
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.45)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{stat.label}</p>
                <p className="mt-3 text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {stat.value}
                </p>
                <p className="mt-2 text-sm text-slate-500">{stat.helper}</p>
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <div>
              <h2
                className="text-2xl font-bold text-slate-900"
                style={{ fontFamily: 'DM Sans, sans-serif' }}
              >
                What this portal covers
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Same GOVbot visual system, different scheme requirements.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {highlights.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.45)]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50">
                      <Icon className="h-5 w-5 text-[#e67e00]" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                About the scheme
              </p>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600">
                {about.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Keep these ready
              </p>
              <div className="mt-4 space-y-3">
                {requirements.map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[#0d9488]" />
                    <p className="text-sm leading-6 text-slate-600">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[30px] bg-gradient-to-r from-[#ff9933] to-[#e67e00] p-6 sm:p-8 text-white shadow-[0_24px_70px_-45px_rgba(230,126,0,0.7)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-100">
                  Ready to continue
                </p>
                <h2 className="mt-2 text-2xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Open the guided apply flow and let GovBot handle the heavy lifting.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-orange-50">
                  You can start from WhatsApp, continue on the web, and land back on the same dashboard timeline after submission.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={applyHref}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[#e67e00] transition-transform hover:-translate-y-0.5"
                >
                  {primaryLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/services"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/40 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Back to services
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
