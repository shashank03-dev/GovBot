import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

import SSPPortalShell from '@/components/ssp/SSPPortalShell';
import { getStoredLanguage, setStoredLanguage } from '@/components/LanguageSelector';
import { getSSPContent } from '@/lib/sspContent.mjs';

const SCHEMES = [
  'Social Welfare Department',
  'Tribal Welfare Department',
  'Backward Classes Welfare Department',
  'Department of Minority Welfare',
  'Department of Technical Education',
  'Department of Medical Education',
  'Karnataka State Brahmin Development Board',
  'AYUSH Department',
];

const REQUIRED_DOCS = [
  "Student's Aadhaar number and name as in Aadhaar",
  "Student's mobile number",
  "Student's email ID",
  "Student's SSLC registration number",
  'Caste and income certificate RD numbers in the name of the student',
  'UDID identification number if the student is disabled',
  'District, taluk, assembly constituency, and student residence address',
  'Student or university registration number',
  'E-attestation number of related documents if applicable',
  'Hostel details if applicable',
];

export default function SSPHomePage() {
  const [language, setLanguage] = useState<'en' | 'kn'>(() => (getStoredLanguage() === 'kn' ? 'kn' : 'en'));
  const content = getSSPContent(language);

  const switchLanguage = (nextLanguage: 'en' | 'kn') => {
    setStoredLanguage(nextLanguage);
    setLanguage(nextLanguage);
  };

  return (
    <>
      <Head>
        <title>SSP | GovBot</title>
        <meta name="description" content="State Scholarship Portal mock inside GovBot with bilingual support and shared draft flows." />
      </Head>

      <SSPPortalShell language={language} onLanguageChange={switchLanguage} title={content.portalName}>
        <div className="mx-auto max-w-[1120px] py-10">
          <div className="text-center">
            <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_45%,#f9edb0,#f5f5f5_70%)] text-7xl">
              🏛️
            </div>
            <div className="mt-5 text-[26px] text-[#111]">{content.governmentName}</div>
            <h1 className="mt-4 text-[66px] font-light uppercase tracking-[0.03em] text-black">
              {content.landing.title}
            </h1>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Link href="/login?next=%2Fssp%2Fdashboard" className="border border-[#d4d9df] bg-white p-3 shadow-[0_8px_18px_rgba(0,0,0,0.04)]">
              <div className="rounded-[4px] border border-[#d3d3d3] bg-[#4386c8] px-6 py-7 text-center text-xl font-bold uppercase leading-10 text-white">
                {content.landing.createAccountLabel}
              </div>
            </Link>
            <Link href="/login?next=%2Fssp%2Fdashboard" className="border border-[#d4d9df] bg-white p-3 shadow-[0_8px_18px_rgba(0,0,0,0.04)]">
              <div className="rounded-[4px] border border-[#d3d3d3] bg-[#4386c8] px-6 py-7 text-center text-xl font-bold uppercase leading-10 text-white">
                {content.landing.postMatricLoginLabel}
              </div>
            </Link>
          </div>

          <div className="mt-7 border border-[#d4d9df] bg-white p-3 shadow-[0_8px_18px_rgba(0,0,0,0.04)]">
            <Link href="/login?next=%2Fssp%2Fdashboard" className="block rounded-[4px] border border-[#d3d3d3] bg-[#0f6a44] px-6 py-7 text-center text-[26px] font-bold uppercase leading-10 text-[#efff89]">
              {content.landing.preMatricLoginLabel}
            </Link>
          </div>

          <div className="mt-10 space-y-5 bg-white px-6 py-8 shadow-[0_8px_18px_rgba(0,0,0,0.04)]">
            {content.landing.notices.map((notice: string) => (
              <div key={notice} className="text-[18px] font-semibold text-[#e61d24]">
                NEW <span className="ml-2 font-normal">{notice}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 border border-[#dadada] bg-[#fffef6] px-6 py-4 text-center text-[20px] font-bold uppercase tracking-[0.18em] text-[#d1261c]">
            Last Date for Application Submission (Click Here)
          </div>

          <div className="mt-8 rounded-[4px] border border-[#cbe1ef] bg-[#dff1fb] px-6 py-7">
            <div className="text-[22px] font-bold uppercase text-[#3575a5]">
              {language === 'kn'
                ? 'ಪೋಸ್ಟ್ ಮ್ಯಾಟ್ರಿಕ್ ವಿದ್ಯಾರ್ಥಿವೇತನ ಅರ್ಜಿಗಾಗಿ ಅಗತ್ಯ ದಾಖಲೆಗಳು / ಮಾಹಿತಿ'
                : 'Required documents / information to create account and submit application for postmatric scholarship'}
            </div>
            <ol className="mt-5 space-y-3 text-[15px] leading-8 text-[#4f6373]">
              {REQUIRED_DOCS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>

          <div className="mt-8">
            <div className="mb-4 text-[34px] font-light uppercase tracking-[0.08em] text-[#5f5f5f]">
              {content.landing.schemesTitle}
            </div>
            <div className="rounded-[4px] bg-[#3575a5] px-6 py-5 text-white shadow-[0_8px_18px_rgba(0,0,0,0.04)]">
              <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm font-semibold">
                {SCHEMES.map((scheme) => (
                  <span key={scheme}>{scheme}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SSPPortalShell>
    </>
  );
}
