import {
  CircleDollarSign,
  FileCheck2,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import PortalOverviewPage from '@/components/PortalOverviewPage';

export default function PMSSHome() {
  return (
    <PortalOverviewPage
      pageTitle="PMSS | GovBot"
      metaDescription="Explore the Post Matric Scholarship Scheme through a consistent GovBot web experience."
      shortName="PMSS"
      schemeName="Post Matric Scholarship Scheme"
      ministry="Social justice scholarship support"
      description="A cleaner PMSS portal surface inside GovBot for students who need income-linked post-matric support without switching into an unrelated website style."
      heroNote="PMSS works best when the student already has income proof, category details, and bank information ready. GovBot keeps that flow inside the same light-weight service shell as the rest of the site."
      badgeLabel="Post-matric support"
      badgeBg="#fef2f2"
      badgeText="#b91c1c"
      applyHref="/nsp/apply?portal=pmss"
      primaryLabel="Start PMSS application"
      stats={[
        { label: 'Target stage', value: 'Post-matric', helper: 'Designed for higher study support beyond school level.' },
        { label: 'Key filter', value: 'Income-based', helper: 'Most PMSS journeys depend on family income thresholds and category proof.' },
        { label: 'GovBot route', value: 'Faster intake', helper: 'Lets you pre-collect details before the portal submission step.' },
      ]}
      highlights={[
        {
          title: 'Income-driven support',
          body: 'The page frames PMSS as a scheme that depends on financial background, making eligibility and document preparation clearer for students.',
          icon: CircleDollarSign,
        },
        {
          title: 'Category and proof handling',
          body: 'GovBot keeps the category, certificate, and bank verification flow aligned with the rest of the website instead of switching styles mid-journey.',
          icon: ShieldCheck,
        },
        {
          title: 'Application readiness',
          body: 'Students can arrive with their vault already populated so the PMSS journey feels like continuation, not a restart.',
          icon: FileCheck2,
        },
        {
          title: 'Trackable after submit',
          body: 'Once the form is submitted, the same dashboard and tracking surfaces remain available for status follow-up.',
          icon: Landmark,
        },
      ]}
      announcements={[
        'PMSS remains open for Academic Year 2025-26 demo submissions through GovBot.',
        'Income threshold and category evidence should be prepared before entering the final form stage.',
        'Renewal-style status checks can still be demonstrated from the shared GovBot track surface after submission.',
      ]}
      requirements={[
        'Accurate family income information and the related certificate if applicable.',
        'Student category details and any supporting proof needed by the scheme.',
        'Post-matric academic details such as institution, course, and year of study.',
        'Verified bank details for benefit transfer readiness.',
      ]}
      about={[
        'PMSS is typically chosen when the story is about targeted financial support for continued education after matriculation. The page now shares the same tone, spacing, and interaction rhythm as the rest of GovBot.',
        'This keeps the scholarship landscape readable for users who move between services and prevents the portal switch from feeling like a separate product.',
      ]}
    />
  );
}
