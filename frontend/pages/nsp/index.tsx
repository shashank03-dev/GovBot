import {
  FileCheck2,
  FolderLock,
  Landmark,
  ScanLine,
} from 'lucide-react';
import PortalOverviewPage from '@/components/PortalOverviewPage';

export default function NSPHome() {
  return (
    <PortalOverviewPage
      pageTitle="NSP | GovBot"
      metaDescription="Explore the National Scholarship Portal through GovBot with guided intake, document reuse, and live tracking."
      shortName="NSP"
      schemeName="National Scholarship Portal"
      ministry="Government of India scholarship services"
      description="Use GovBot to enter the National Scholarship Portal flow with one reusable profile, faster document handling, and clean application tracking after submission."
      heroNote="NSP is the broadest scholarship entry surface in GovBot. It pairs well with Aadhaar OCR, DigiLocker-backed documents, and the post-submission dashboard timeline."
      badgeLabel="Flagship portal"
      badgeBg="#fff7ed"
      badgeText="#e67e00"
      applyHref="/nsp/apply"
      primaryLabel="Start NSP application"
      stats={[
        { label: 'Scheme scope', value: 'Multi-ministry', helper: 'A single entry point for central scholarship flows.' },
        { label: 'Identity base', value: 'OTR ready', helper: 'Designed for reusable registration and student identity reuse.' },
        { label: 'GovBot handoff', value: 'WhatsApp + Web', helper: 'Move from chat to web without losing progress.' },
      ]}
      highlights={[
        {
          title: 'One guided intake',
          body: 'Collect student identity, education, income, and bank details once instead of splitting the flow across disconnected pages.',
          icon: FileCheck2,
        },
        {
          title: 'Document reuse',
          body: 'Store Aadhaar, PAN, certificates, and marksheets in the vault and reuse them during subsequent applications.',
          icon: FolderLock,
        },
        {
          title: 'OCR and DigiLocker assist',
          body: 'Prefill fields from Aadhaar OCR or DigiLocker-backed documents before the application reaches review state.',
          icon: ScanLine,
        },
        {
          title: 'Status stays visible',
          body: 'Once submitted, the application appears in the GovBot dashboard and track page instead of disappearing into a static confirmation screen.',
          icon: Landmark,
        },
      ]}
      announcements={[
        'Portal intake is active for Academic Year 2025-26 and supports fresh application demos through GovBot.',
        'WhatsApp-first onboarding remains the fastest path for showcase runs because it feeds directly into the guided web apply flow.',
        'Aadhaar-backed prefill, vault uploads, and bank verification can all be demonstrated from the same student record.',
      ]}
      requirements={[
        'Student identity details exactly as they should appear in the application.',
        'Aadhaar image or number for OCR-driven prefill and proof checks.',
        'Income, marks, and basic academic information for scheme matching.',
        'Bank IFSC and account number for payout readiness.',
      ]}
      about={[
        'The National Scholarship Portal acts as the broad scholarship layer inside GovBot. It is the most flexible entry point when you want to show application intake, profile reuse, document handling, and live status tracking in one story.',
        'For demos, NSP works especially well because it exposes both sides of the system: guided citizen onboarding at the start and dashboard-based follow-through after submission.',
      ]}
    />
  );
}
