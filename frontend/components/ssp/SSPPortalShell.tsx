import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

type SSPPortalShellProps = {
  language: 'en' | 'kn';
  onLanguageChange?: (language: 'en' | 'kn') => void;
  studentName?: string;
  studentId?: string;
  title?: string;
  subtitle?: string;
  showStudentBar?: boolean;
  children: ReactNode;
};

const MENU_ITEMS = [
  { key: 'home', labelEn: 'Home', labelKn: 'ಮುಖಪುಟ', href: '/ssp/dashboard' },
  { key: 'apply', labelEn: 'Apply for Post-Matric Scholarship', labelKn: 'ಪೋಸ್ಟ್ ಮ್ಯಾಟ್ರಿಕ್ ವಿದ್ಯಾರ್ಥಿವೇತನ ಅರ್ಜಿ', href: '/ssp/dashboard' },
  { key: 'ack', labelEn: 'Print Acknowledgement', labelKn: 'ಸ್ವೀಕೃತಿ ಮುದ್ರಿಸು', href: '/ssp/step-5' },
  { key: 'ship', labelEn: 'Get Free Ship Card', labelKn: 'ಉಚಿತ ಶಿಪ್ ಕಾರ್ಡ್', href: '/ssp/step-3' },
  { key: 'attestation', labelEn: 'Upload E-Attestation Documents', labelKn: 'ಇ-ಅಟೆಸ್ಟೇಶನ್ ದಾಖಲೆಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ', href: '/ssp/step-3' },
  { key: 'nsp-otr', labelEn: 'Add NSP OTR', labelKn: 'NSP OTR ಸೇರಿಸಿ', href: '/ssp/step-1' },
  { key: 'kyc', labelEn: 'e-KYC', labelKn: 'ಇ-ಕೆವೈಸಿ', href: '/ssp/step-1' },
  { key: 'status', labelEn: 'Year wise Student Status', labelKn: 'ವರ್ಷವಾರು ವಿದ್ಯಾರ್ಥಿ ಸ್ಥಿತಿ', href: '/ssp/dashboard' },
  { key: 'uploaded', labelEn: 'View Uploaded E-Attestation Documents', labelKn: 'ಅಪ್‌ಲೋಡ್ ದಾಖಲೆಗಳನ್ನು ವೀಕ್ಷಿಸಿ', href: '/ssp/step-3' },
  { key: 'npci', labelEn: 'Check / Update NPCI', labelKn: 'NPCI ಪರಿಶೀಲಿಸಿ / ನವೀಕರಿಸಿ', href: '/bank-verify' },
  { key: 'counselling', labelEn: 'Update Student Counselling Data', labelKn: 'ಕೌನ್ಸೆಲಿಂಗ್ ವಿವರಗಳನ್ನು ನವೀಕರಿಸಿ', href: '/ssp/step-2' },
  { key: 'marks', labelEn: 'Update Previous Year Marks Details', labelKn: 'ಹಿಂದಿನ ವರ್ಷದ ಅಂಕ ವಿವರಗಳು', href: '/ssp/step-2' },
  { key: 'profile', labelEn: 'Profile', labelKn: 'ಪ್ರೊಫೈಲ್', href: '/profile' },
];

const FOOTER_LINKS = [
  'Feedback',
  'Website Policies',
  'Screen Reader',
  'Terms and Conditions',
  'Contact Us',
  'Sitemap',
];

const HELPLINES = [
  { titleEn: 'Social Welfare Department', titleKn: 'ಸಾಮಾಜಿಕ ಕಲ್ಯಾಣ ಇಲಾಖೆ', phone: '9482300400', email: 'SWDCONTROLROOM@GMAIL.COM' },
  { titleEn: 'Backward Classes Welfare Department', titleKn: 'ಹಿಂದುಳಿದ ವರ್ಗಗಳ ಕಲ್ಯಾಣ ಇಲಾಖೆ', phone: '8050770004', email: '' },
  { titleEn: 'Minority Welfare Department', titleKn: 'ಅಲ್ಪಸಂಖ್ಯಾತರ ಕಲ್ಯಾಣ ಇಲಾಖೆ', phone: '8277799990', email: '' },
  { titleEn: 'Kutumba', titleKn: 'ಕುಟುಂಬ', phone: '080-22371030', email: 'KUTUMBASUPPORT@KARNATAKA.GOV.IN' },
];

function text(language: 'en' | 'kn', en: string, kn: string) {
  return language === 'kn' ? kn : en;
}

export default function SSPPortalShell({
  language,
  onLanguageChange,
  studentName,
  studentId,
  title,
  subtitle,
  showStudentBar = false,
  children,
}: SSPPortalShellProps) {
  const router = useRouter();

  const today = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
    return formatter.format(new Date()).replaceAll('/', '-');
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f8f4] text-[#204f6e]" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-2">
        <div className="flex flex-col gap-2 border-b border-[#d9e1e7] pb-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f8fafc] text-3xl">
              🏛️
            </div>
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#2f7090]">
                {text(language, 'Government of Karnataka', 'ಕರ್ನಾಟಕ ಸರ್ಕಾರ')}
              </div>
              <div className="text-[36px] leading-none text-[#111]">
                {title || text(language, 'STATE SCHOLARSHIP PORTAL', 'ರಾಜ್ಯ ವಿದ್ಯಾರ್ಥಿವೇತನ ಪೋರ್ಟಲ್')}
              </div>
              {subtitle ? (
                <div className="mt-1 text-sm text-[#6a7e8d]">
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            {showStudentBar ? (
              <div className="text-right text-sm leading-6 text-[#4f4f4f]">
                <div>
                  <span className="font-semibold">{text(language, 'Student Name', 'ವಿದ್ಯಾರ್ಥಿಯ ಹೆಸರು')}</span>
                  <span className="ml-2 font-bold text-[#c22564]">{studentName || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold">S Id</span>
                  <span className="ml-2 font-bold text-[#c22564]">{studentId || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold">Date :</span>
                  <span className="ml-2 font-bold text-[#c22564]">{today}</span>
                  <span className="ml-2 font-semibold text-[#4f4f4f]">Server:</span>
                  <span className="ml-1 font-bold text-[#c22564]">179</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[#4f4f4f]">
                {text(language, 'Skip to content', 'ವಿಷಯಕ್ಕೆ ಹೋಗಿ')} · {text(language, 'Screen Reader', 'ಸ್ಕ್ರೀನ್ ರೀಡರ್')}
              </div>
            )}
            <div className="flex items-center gap-3">
              {onLanguageChange ? (
                <select
                  value={language}
                  onChange={(event) => onLanguageChange(event.target.value === 'kn' ? 'kn' : 'en')}
                  className="border border-[#b9c5cf] bg-white px-3 py-2 text-sm text-[#233847]"
                >
                  <option value="en">English</option>
                  <option value="kn">Kannada</option>
                </select>
              ) : null}
              {showStudentBar ? (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('govbot_token');
                    localStorage.removeItem('govbot_phone');
                    router.push('/ssp');
                  }}
                  className="bg-[#d9584f] px-7 py-3 text-sm font-bold text-white"
                >
                  Logout
                </button>
              ) : (
                <div className="rounded-full border border-[#d9e1e7] bg-white px-4 py-2 text-xs font-semibold text-[#425a6b]">
                  {text(language, 'Public Portal', 'ಸಾರ್ವಜನಿಕ ಪೋರ್ಟಲ್')}
                </div>
              )}
            </div>
          </div>
        </div>

        {showStudentBar ? (
          <div className="mt-4 bg-[#256b87] px-6 py-5 text-white shadow-[0_1px_0_#1f546a]">
            <div className="flex flex-wrap gap-x-8 gap-y-5 text-[15px] font-semibold">
              {MENU_ITEMS.map((item) => (
                <Link key={item.key} href={item.href} className="whitespace-nowrap transition-opacity hover:opacity-80">
                  {text(language, item.labelEn, item.labelKn)}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-4 bg-[#3575a5] px-5 py-4 text-white">
            <Link href="/ssp" className="font-semibold">{text(language, 'State Scholarship Portal', 'ರಾಜ್ಯ ವಿದ್ಯಾರ್ಥಿವೇತನ ಪೋರ್ಟಲ್')}</Link>
            <Link href="/services" className="text-sm opacity-90 hover:opacity-100">{text(language, 'Department', 'ಇಲಾಖೆ')}</Link>
            <Link href="/documents" className="text-sm opacity-90 hover:opacity-100">{text(language, 'Downloads', 'ಡೌನ್‌ಲೋಡ್ಸ್')}</Link>
          </div>
        )}

        {children}

        <div className="mt-14 border-t border-[#efe6a6] bg-[#f5efb7] px-6 py-8 text-[#66707b]">
          <div className="grid gap-8 md:grid-cols-2">
            {HELPLINES.map((item) => (
              <div key={item.titleEn}>
                <div className="text-lg uppercase tracking-[0.08em] text-[#6f6040]">
                  {text(language, item.titleEn, item.titleKn)}
                </div>
                <div className="mt-3 text-sm">{item.phone}</div>
                {item.email ? <div className="text-sm">{item.email}</div> : null}
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-4 border-t border-[#e0d890] pt-4 text-sm text-[#4b8d6a]">
            {FOOTER_LINKS.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="mt-8 text-center text-xs leading-6 text-[#8b8b7f]">
            <div>Content and Data Owned &amp; Maintained by : Center for e-Governance, Government of Karnataka</div>
            <div>Software Designed and Developed with the technical support of NIC, Karnataka State Unit, Bangalore.</div>
            <div>Network &amp; State Data Centre Services by e-Governance, Govt. of Karnataka</div>
          </div>
        </div>
      </div>
    </div>
  );
}
