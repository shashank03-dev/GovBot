import {
  BarChart3,
  CircleDollarSign,
  GraduationCap,
  ShieldCheck,
} from 'lucide-react';
import PortalOverviewPage from '@/components/PortalOverviewPage';

export default function CSSSHome() {
  return (
    <PortalOverviewPage
      pageTitle="CSSS | GovBot"
      metaDescription="Explore the Central Sector Scholarship Scheme in the same GOVbot design language as the rest of the site."
      shortName="CSSS"
      schemeName="Central Sector Scholarship Scheme"
      ministry="Merit-focused higher education support"
      description="CSSS now sits inside the same light GOVbot service system, making merit-led scholarship journeys feel native to the platform instead of detached from it."
      heroNote="CSSS is strongest when you want to show a merit-based scheme with higher marks thresholds, degree-level education, and clean post-submit proof handling."
      badgeLabel="Merit-based"
      badgeBg="#eff6ff"
      badgeText="#1d4ed8"
      applyHref="/nsp/apply?portal=csss"
      primaryLabel="Start CSSS application"
      stats={[
        { label: 'Student profile', value: 'High-merit', helper: 'Built for students with strong academic performance.' },
        { label: 'Course focus', value: 'Degree level', helper: 'Useful for undergrad and higher education scholarship journeys.' },
        { label: 'GovBot value', value: 'Clean compare', helper: 'Lets users compare CSSS against other schemes without a visual reset.' },
      ]}
      highlights={[
        {
          title: 'Merit-first positioning',
          body: 'The page clearly communicates that CSSS is anchored in academic performance and not only in generic scholarship intake.',
          icon: GraduationCap,
        },
        {
          title: 'Marks and income clarity',
          body: 'GovBot can collect marks, family income, and course details in the same structured intake used elsewhere on the site.',
          icon: BarChart3,
        },
        {
          title: 'Proof-oriented journey',
          body: 'Documents, bank details, and verification steps stay in the same interaction language rather than switching to a separate color system.',
          icon: ShieldCheck,
        },
        {
          title: 'Decision-ready output',
          body: 'After submission, students still land on the same dashboard, track link, and follow-up surfaces used across GovBot.',
          icon: CircleDollarSign,
        },
      ]}
      announcements={[
        'CSSS applications for Academic Year 2025-26 run through the shared GovBot intake and application path.',
        'High marks and family income remain the two most important early qualification points for this flow.',
        'Students comparing schemes now get a visually consistent path instead of four different mini-sites.',
      ]}
      requirements={[
        'Previous academic marks or percentage details for merit evaluation.',
        'Family income information aligned with scheme thresholds.',
        'Current institution, course, and study year details.',
        'Aadhaar-linked identity details and bank information for completion.',
      ]}
      about={[
        'CSSS represents the more merit-sensitive part of the scholarship stack, so the page now emphasizes ranking, academic readiness, and structured student data without dropping the broader GovBot visual language.',
        'That consistency matters because users often evaluate multiple schemes before choosing one, and the interface should support comparison instead of increasing cognitive load.',
      ]}
    />
  );
}
