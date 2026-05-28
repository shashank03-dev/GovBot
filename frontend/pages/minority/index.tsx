import {
  CircleDollarSign,
  FileCheck2,
  HandHelping,
  Users,
} from 'lucide-react';
import PortalOverviewPage from '@/components/PortalOverviewPage';

export default function MinorityHome() {
  return (
    <PortalOverviewPage
      pageTitle="Minority Scholarships | GovBot"
      metaDescription="Minority scholarship flows presented through the same GOVbot theme and guided intake patterns."
      shortName="Minority"
      schemeName="Minority Scholarship Schemes"
      ministry="Minority affairs support"
      description="A consistent GovBot entry point for minority scholarship journeys, covering community-specific education support without breaking the main product theme."
      heroNote="This route is useful when you want to demonstrate community-focused support while preserving the same reusable profile, document vault, and tracking model as every other GovBot service."
      badgeLabel="Community support"
      badgeBg="#ecfdf5"
      badgeText="#047857"
      applyHref="/nsp/apply?portal=minority"
      primaryLabel="Start minority application"
      stats={[
        { label: 'Coverage', value: 'Multiple schemes', helper: 'Useful for pre-matric, post-matric, and merit-cum-means style stories.' },
        { label: 'Eligibility lens', value: 'Community-aware', helper: 'Religion, marks, and income all matter in different combinations.' },
        { label: 'GovBot benefit', value: 'One shared flow', helper: 'The service now looks and behaves like the rest of the site.' },
      ]}
      highlights={[
        {
          title: 'Community-focused intake',
          body: 'Students can enter minority scholarship journeys without leaving the same GOVbot experience used for broader schemes.',
          icon: Users,
        },
        {
          title: 'Marks and means balance',
          body: 'The route is designed to support merit-cum-means style reasoning while still keeping document and bank steps simple.',
          icon: CircleDollarSign,
        },
        {
          title: 'Document preparation',
          body: 'Identity, community, academic, and income proof can all be staged through the same vault-first workflow.',
          icon: FileCheck2,
        },
        {
          title: 'Better handoff to support',
          body: 'GovBot can guide the user into apply, then return them to the shared dashboard and tracking surfaces after submission.',
          icon: HandHelping,
        },
      ]}
      announcements={[
        'Minority scholarship intake remains available for Academic Year 2025-26 runs through the GovBot application flow.',
        'Income level, community, and marks should be checked together before moving into the final application step.',
        'This page now matches the rest of the site visually so multi-scheme journeys no longer feel fragmented.',
      ]}
      requirements={[
        'Community details relevant to the minority scholarship branch being applied for.',
        'Academic marks and current study information for scheme filtering.',
        'Income information and any associated certificates where required.',
        'Bank details and identity proof for final submission readiness.',
      ]}
      about={[
        'Minority scholarship journeys often combine community eligibility with academic and financial conditions. The page now presents that clearly while staying inside the same GOVbot design language used by the broader service layer.',
        'That consistency makes the service map easier to trust because the user no longer feels pushed into a visually unrelated microsite just because the scheme category changed.',
      ]}
    />
  );
}
