import Link from 'next/link';

import { getSSPContent } from '@/lib/sspContent.mjs';
import { isSSPStepComplete } from '@/lib/sspDraft.mjs';

type SSPDashboardProps = {
  language: 'en' | 'kn';
  fields: Record<string, unknown>;
};

type DashboardStep = {
  id: string;
  route: string;
  shortTitle: string;
  title: string;
  description: string;
  actionLabel: string;
};

export default function SSPDashboard({ language, fields }: SSPDashboardProps) {
  const content = getSSPContent(language);
  const steps = content.dashboard.steps as DashboardStep[];
  const instructions = content.dashboard.instructions as string[];

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <div>
        <h1 className="mb-8 text-[40px] font-light uppercase tracking-[0.06em] text-[#5f5f5f]">
          {content.dashboard.title}
        </h1>

        <div className="grid gap-10 sm:grid-cols-2">
          {steps.map((step) => {
            const done = isSSPStepComplete(step.id, fields);
            return (
              <div key={step.id} className="rounded-[14px] border border-[#ececec] bg-white px-10 py-12 shadow-[0_16px_30px_rgba(0,0,0,0.04)]">
                <div className="text-center text-[#4f4f4f]">
                  <div className="mb-6 text-2xl">✎</div>
                  <div className="text-[22px] font-bold uppercase">{step.shortTitle}</div>
                  <div className="mt-8 text-[15px] font-bold uppercase leading-7 text-[#4f4f4f]">{step.title}</div>
                  <div className="mt-3 text-[14px] font-semibold text-[#59626a]">{step.description}</div>
                </div>
                <div className="mt-8 flex items-center justify-between gap-3">
                  <Link
                    href={step.route}
                    className="inline-flex flex-1 items-center justify-center bg-[#59b84f] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#4aa441]"
                  >
                    {step.actionLabel}
                  </Link>
                  <div className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] ${done ? 'bg-[#edf8ed] text-[#2f8f2f]' : 'bg-[#f4f7fa] text-[#7d8892]'}`}>
                    {done ? 'Done' : 'Pending'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[14px] bg-[#f4f4f1] px-14 py-16 text-[#1e4d79] shadow-[0_16px_30px_rgba(0,0,0,0.03)]">
        <h2 className="text-[24px] font-bold uppercase leading-9 text-[#c51412]">
          {content.dashboard.instructionsTitle}
        </h2>
        <div className="mt-6 space-y-6 text-[18px] leading-12">
          {instructions.map((instruction, index) => (
            <p key={instruction} className="leading-[1.65]">
              <span className="font-semibold text-[#153f68]">{`${index + 1}) `}</span>
              {instruction}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
