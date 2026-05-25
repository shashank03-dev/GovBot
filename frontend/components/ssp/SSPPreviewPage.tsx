import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

import SSPPortalShell from '@/components/ssp/SSPPortalShell';
import { getSSPContent } from '@/lib/sspContent.mjs';
import { useSSPDraft } from '@/lib/useSSPDraft';

const PREVIEW_FIELDS = [
  ['Student Name', 'ವಿದ್ಯಾರ್ಥಿಯ ಹೆಸರು', 'student_name'],
  ['Father Name', 'ತಂದೆಯ ಹೆಸರು', 'father_name'],
  ['Mother Name', 'ತಾಯಿಯ ಹೆಸರು', 'mother_name'],
  ['Date of Birth', 'ಹುಟ್ಟಿದ ದಿನಾಂಕ', 'dob'],
  ['SSLC Registration Number', 'ಎಸ್‌ಎಸ್‌ಎಲ್‌ಸಿ ನೋಂದಣಿ ಸಂಖ್ಯೆ', 'sslc_registration_number'],
  ['SSLC Pass Year', 'ಪಾಸ್ ಆದ ವರ್ಷ', 'sslc_pass_year'],
  ['Category', 'ವರ್ಗ', 'category'],
  ['Caste Certificate Details', 'ಜಾತಿ ಪ್ರಮಾಣಪತ್ರ ವಿವರಗಳು', 'caste_certificate_number'],
  ['Income Certificate Details', 'ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ ವಿವರಗಳು', 'income_certificate_number'],
  ['Income', 'ಆದಾಯ', 'income'],
  ['Hosteller or Day Scholar', 'ಹಾಸ್ಟೆಲರ್ / ಡೇ ಸ್ಕಾಲರ್', 'hostel_or_day_scholar'],
  ['Domicile', 'ನಿವಾಸ', 'domicile_state'],
  ['Physically Handicap', 'ಅಂಗವೈಕಲ್ಯ', 'disability_status'],
  ['College', 'ಕಾಲೇಜು', 'college_name'],
  ['Course', 'ಕೋರ್ಸ್', 'course_name'],
  ['Course Discipline', 'ವಿಭಾಗ', 'course_discipline'],
  ['Course Year', 'ಕೋರ್ಸ್ ವರ್ಷ', 'course_year'],
  ['Academic Year', 'ಶೈಕ್ಷಣಿಕ ವರ್ಷ', 'academic_year'],
  ['Maximum Marks', 'ಗರಿಷ್ಠ ಅಂಕಗಳು', 'previous_year_max_marks'],
  ['Total Marks Obtained', 'ಒಟ್ಟು ಅಂಕಗಳು', 'previous_year_marks_obtained'],
  ['CGPA / Percentage', 'ಸಿ.ಜಿ.ಪಿ.ಎ / ಶೇಕಡಾವಾರು', 'previous_year_percentage_or_cgpa'],
];

function localize(language: 'en' | 'kn', english: string, kannada: string) {
  return language === 'kn' ? kannada : english;
}

function LoginPrompt({ language }: { language: 'en' | 'kn' }) {
  return (
    <div className="mt-10 rounded-[14px] border border-[#d9dee3] bg-white px-8 py-10 text-center shadow-[0_12px_24px_rgba(0,0,0,0.04)]">
      <h1 className="text-2xl font-semibold text-[#23445a]">
        {localize(language, 'Login required to continue the SSP flow', 'ಎಸ್‌ಎಸ್‌ಪಿ ಪ್ರಕ್ರಿಯೆಯನ್ನು ಮುಂದುವರಿಸಲು ಲಾಗಿನ್ ಅಗತ್ಯವಿದೆ')}
      </h1>
      <p className="mt-4 text-sm text-[#5e6c76]">
        {localize(language, 'Use your GovBot login so we can submit and track the SSP application.', 'ಅರ್ಜಿಯನ್ನು ಸಲ್ಲಿಸಲು ಮತ್ತು ಟ್ರ್ಯಾಕ್ ಮಾಡಲು GovBot ಲಾಗಿನ್ ಬಳಸಿ.')}
      </p>
      <div className="mt-6 flex justify-center gap-4">
        <Link href="/login?next=%2Fssp%2Fstep-5" className="bg-[#59b84f] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white">
          {localize(language, 'Login', 'ಲಾಗಿನ್')}
        </Link>
        <Link href="/ssp" className="border border-[#b8c7d2] bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#30556d]">
          {localize(language, 'Back to portal', 'ಪೋರ್ಟಲ್‌ಗೆ ಹಿಂದಿರುಗಿ')}
        </Link>
      </div>
    </div>
  );
}

export default function SSPPreviewPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const {
    draft,
    loading,
    phone,
    language,
    setLanguage,
    updateFields,
    saveDraft,
    submitDraft,
    studentId,
    studentName,
  } = useSSPDraft('step-5');
  const content = getSSPContent(language);

  const groupedFields = useMemo(
    () =>
      PREVIEW_FIELDS.map(([labelEn, labelKn, key]) => ({
        label: localize(language, labelEn, labelKn),
        value: draft.fields[key] || '-',
      })),
    [draft.fields, language],
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      await saveDraft({
        current_step: 'step-5',
        fields: {
          ...draft.fields,
          final_declaration_accepted: true,
        },
      });
      const result = await submitDraft();
      setSuccessMessage(
        `${localize(language, 'Application submitted successfully. Confirmation:', 'ಅರ್ಜಿಯನ್ನು ಯಶಸ್ವಿಯಾಗಿ ಸಲ್ಲಿಸಲಾಗಿದೆ. ದೃಢೀಕರಣ ಸಂಖ್ಯೆ:')} ${result.confirmation_number}`,
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit SSP draft');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SSPPortalShell
      language={language}
      onLanguageChange={setLanguage}
      studentName={studentName}
      studentId={studentId}
      title={content.portalName}
      subtitle={localize(language, 'Preview & Final Submit', 'ಪೂರ್ವावलೋಕನ ಮತ್ತು ಅಂತಿಮ ಸಲ್ಲಿಕೆ')}
      showStudentBar={Boolean(phone)}
    >
      <div className="mt-6 rounded-[4px] border border-[#c8e0ef] bg-[#dff1fb] px-6 py-5 text-[17px] uppercase tracking-[0.03em] text-[#3778a4]">
        {localize(language, 'Application will get rejected if any details submitted by you are found wrong / incorrect.', 'ತಪ್ಪಾದ ಮಾಹಿತಿ ಸಲ್ಲಿಸಿದಲ್ಲಿ ಅರ್ಜಿ ತಿರಸ್ಕರಿಸಲಾಗುತ್ತದೆ.')}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => void router.push('/ssp/step-4')}
          className="inline-flex items-center gap-3 bg-[#59b84f] px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white"
        >
          <span>◀</span>
          {content.common.back}
        </button>
      </div>

      <div className="mt-6 border border-[#3d7fbb] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between bg-[#3d7fbb] px-4 py-3 text-white">
          <div className="text-[24px] uppercase tracking-[0.04em]">
            Final Submit
          </div>
          <div className="text-xl">⌃</div>
        </div>

        <div className="px-6 py-7">
          {loading ? (
            <div className="rounded-[12px] border border-[#e1e6eb] bg-[#f7f9fb] px-5 py-6 text-sm text-[#61707a]">
              {localize(language, 'Loading your SSP draft...', 'ಎಸ್‌ಎಸ್‌ಪಿ ಕರಡು ಲೋಡ್ ಆಗುತ್ತಿದೆ...')}
            </div>
          ) : !phone ? (
            <LoginPrompt language={language} />
          ) : (
            <>
              <div className="mx-auto max-w-[920px] border border-[#d8d8d8] bg-white">
                <div className="border-b border-[#d8d8d8] px-4 py-6 text-center text-[28px] font-semibold text-[#4d4d4d]" style={{ fontFamily: 'Georgia, serif' }}>
                  {localize(language, 'State Scholarship Portal (Post Matric)', 'ರಾಜ್ಯ ವಿದ್ಯಾರ್ಥಿವೇತನ ಪೋರ್ಟಲ್ (ಪೋಸ್ಟ್ ಮ್ಯಾಟ್ರಿಕ್)')}
                </div>
                <table className="w-full border-collapse text-left text-[18px] text-[#4d4d4d]">
                  <tbody>
                    {groupedFields.map((row) => (
                      <tr key={row.label} className="border-b border-[#e4e4e4]">
                        <th className="w-[34%] border-r border-[#e4e4e4] px-4 py-4 font-semibold">{row.label}</th>
                        <td className="px-4 py-4">{String(row.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-5 bg-[#3d7fbb] px-4 py-4 text-sm font-semibold text-white">
                  {content.common.declaration}
                </div>
                <div className="px-4 py-5 text-[20px] font-bold text-[#ff0000]">
                  {draft.confirmation_number ? content.common.alreadySubmitted : localize(language, 'Ready for final submission.', 'ಅಂತಿಮ ಸಲ್ಲಿಕೆಗೆ ಸಿದ್ಧವಾಗಿದೆ.')}
                </div>
              </div>

              <label className="mt-6 flex items-start gap-3 rounded-[8px] border border-[#dfe7ee] bg-[#fbfcfd] px-5 py-4 text-sm text-[#495a66]">
                <input
                  type="checkbox"
                  checked={Boolean(draft.fields.final_declaration_accepted)}
                  onChange={(event) => updateFields({ final_declaration_accepted: event.target.checked })}
                />
                <span>
                  {localize(
                    language,
                    'I confirm that the entered details are correct and belong to the student.',
                    'ನಮೂದಿಸಿದ ಎಲ್ಲಾ ವಿವರಗಳು ಸರಿಯಾಗಿದ್ದು ವಿದ್ಯಾರ್ಥಿಯದ್ದೇ ಎಂದು ನಾನು ದೃಢೀಕರಿಸುತ್ತೇನೆ.',
                  )}
                </span>
              </label>

              {error ? (
                <div className="mt-5 border border-[#efc0c0] bg-[#fff4f4] px-4 py-4 text-sm font-semibold text-[#b62d2d]">
                  {error}
                </div>
              ) : null}
              {successMessage ? (
                <div className="mt-5 border border-[#cbe7cc] bg-[#f3fff3] px-4 py-4 text-sm font-semibold text-[#2e8b57]">
                  {successMessage}
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void saveDraft({ current_step: 'step-5' })}
                  className="border border-[#b8c7d2] bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#30556d]"
                >
                  {content.common.save}
                </button>
                <div className="flex flex-wrap items-center gap-3">
                  {draft.confirmation_number ? (
                    <Link
                      href={`/track/${encodeURIComponent(draft.confirmation_number)}`}
                      className="bg-[#3575a5] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white"
                    >
                      {localize(language, 'Track Application', 'ಅರ್ಜಿಯನ್ನು ಟ್ರ್ಯಾಕ್ ಮಾಡಿ')}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    disabled={submitting || !draft.fields.final_declaration_accepted}
                    onClick={() => void handleSubmit()}
                    className="bg-[#59b84f] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? localize(language, 'Submitting...', 'ಸಲ್ಲಿಸಲಾಗುತ್ತಿದೆ...') : content.common.finalSubmit}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </SSPPortalShell>
  );
}
