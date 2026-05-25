import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

import SSPPortalShell from '@/components/ssp/SSPPortalShell';
import { getSSPContent } from '@/lib/sspContent.mjs';
import { getNextSSPStep, getPreviousSSPStep, getSSPStep } from '@/lib/sspDraft.mjs';
import { useSSPDraft } from '@/lib/useSSPDraft';

type StepId = 'step-1' | 'step-2' | 'step-3' | 'step-4';

type Option = {
  value: string;
  labelEn: string;
  labelKn: string;
};

type FieldConfig = {
  name: string;
  labelEn: string;
  labelKn: string;
  type?: 'text' | 'number' | 'textarea' | 'select' | 'radio' | 'email';
  required?: boolean;
  placeholder?: string;
  options?: Option[];
  fullWidth?: boolean;
};

type SectionConfig = {
  titleEn: string;
  titleKn: string;
  fields: FieldConfig[];
};

type StepConfig = {
  titleEn: string;
  titleKn: string;
  noticeEn: string;
  noticeKn: string;
  helperEn?: string;
  helperKn?: string;
  sections: SectionConfig[];
  footerNoteEn?: string;
  footerNoteKn?: string;
};

const RELIGION_OPTIONS: Option[] = [
  { value: 'HINDU', labelEn: 'Hindu', labelKn: 'ಹಿಂದು' },
  { value: 'MUSLIM', labelEn: 'Muslim', labelKn: 'ಮುಸ್ಲಿಂ' },
  { value: 'CHRISTIAN', labelEn: 'Christian', labelKn: 'ಕ್ರೈಸ್ತ' },
  { value: 'JAIN', labelEn: 'Jain', labelKn: 'ಜೈನ' },
];

const BOARD_OPTIONS: Option[] = [
  { value: 'SSLC', labelEn: 'SSLC', labelKn: 'ಎಸ್‌ಎಸ್‌ಎಲ್‌ಸಿ' },
  { value: 'CBSE', labelEn: 'CBSE', labelKn: 'ಸಿಬಿಎಸ್‌ಇ' },
  { value: 'ICSE', labelEn: 'ICSE', labelKn: 'ಐಸಿಎಸ್‌ಇ' },
  { value: 'NIOS', labelEn: 'NIOS', labelKn: 'ಎನ್‌ಐಒಎಸ್' },
];

const CATEGORY_OPTIONS: Option[] = [
  { value: 'SC', labelEn: 'SC', labelKn: 'ಎಸ್‌ಸಿ' },
  { value: 'ST', labelEn: 'ST', labelKn: 'ಎಸ್‌ಟಿ' },
  { value: 'OBC', labelEn: 'OBC', labelKn: 'ಒಬಿಸಿ' },
  { value: 'CAT IIIA', labelEn: 'Cat IIIA', labelKn: 'ವರ್ಗ IIIA' },
  { value: 'GENERAL', labelEn: 'General', labelKn: 'ಸಾಮಾನ್ಯ' },
];

const YES_NO_OPTIONS: Option[] = [
  { value: 'Yes', labelEn: 'Yes', labelKn: 'ಹೌದು' },
  { value: 'No', labelEn: 'No', labelKn: 'ಇಲ್ಲ' },
];

const DAY_SCHOLAR_OPTIONS: Option[] = [
  { value: 'DayScholar', labelEn: 'Day Scholar', labelKn: 'ಡೆ ಸ್ಕಾಲರ್' },
  { value: 'Hosteller', labelEn: 'Hosteller', labelKn: 'ಹಾಸ್ಟೆಲರ್' },
];

const COURSE_YEAR_OPTIONS: Option[] = [
  { value: 'FIRST', labelEn: 'First', labelKn: 'ಪ್ರಥಮ' },
  { value: 'SECOND', labelEn: 'Second', labelKn: 'ದ್ವಿತೀಯ' },
  { value: 'THIRD', labelEn: 'Third', labelKn: 'ತೃತೀಯ' },
  { value: 'FOURTH', labelEn: 'Fourth', labelKn: 'ಚತುರ್ಥ' },
];

const ATTESTATION_OPTIONS: Option[] = [
  { value: 'Pending', labelEn: 'Pending', labelKn: 'ಬಾಕಿ' },
  { value: 'Uploaded', labelEn: 'Uploaded', labelKn: 'ಅಪ್‌ಲೋಡ್ ಆಗಿದೆ' },
  { value: 'Verified', labelEn: 'Verified', labelKn: 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ' },
];

const STEP_CONFIGS: Record<StepId, StepConfig> = {
  'step-1': {
    titleEn: 'Enter SSLC Study Details',
    titleKn: '10 ನೇ ತರಗತಿ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ',
    noticeEn: 'Application will get rejected if any details submitted by you are found wrong / incorrect.',
    noticeKn: 'ತಪ್ಪಾದ ಮಾಹಿತಿ ಸಲ್ಲಿಸಿದಲ್ಲಿ ಅರ್ಜಿ ತಿರಸ್ಕರಿಸಲಾಗುತ್ತದೆ.',
    helperEn: 'Check and confirm that all SSLC, caste, income, and personal details belong to the student only.',
    helperKn: 'ಎಸ್‌ಎಸ್‌ಎಲ್‌ಸಿ, ಜಾತಿ, ಆದಾಯ ಮತ್ತು ವೈಯಕ್ತಿಕ ವಿವರಗಳು ವಿದ್ಯಾರ್ಥಿಯದ್ದಾಗಿರುವುದನ್ನು ಖಚಿತಪಡಿಸಿ.',
    sections: [
      {
        titleEn: 'SSLC Details',
        titleKn: 'ಎಸ್‌ಎಸ್‌ಎಲ್‌ಸಿ ವಿವರಗಳು',
        fields: [
          { name: 'sslc_board', labelEn: '10th Board Type', labelKn: '10ನೇ ಬೋರ್ಡ್ ಪ್ರಕಾರ', type: 'select', options: BOARD_OPTIONS, required: true },
          { name: 'sslc_registration_number', labelEn: 'SSLC Registration Number', labelKn: 'ಎಸ್‌ಎಸ್‌ಎಲ್‌ಸಿ ನೋಂದಣಿ ಸಂಖ್ಯೆ', required: true },
          { name: 'sslc_pass_year', labelEn: 'Year of Pass', labelKn: 'ಪಾಸ್ ಆದ ವರ್ಷ', required: true },
          { name: 'student_name', labelEn: 'Student Name', labelKn: 'ವಿದ್ಯಾರ್ಥಿಯ ಹೆಸರು', required: true },
          { name: 'dob', labelEn: 'Date of Birth', labelKn: 'ಹುಟ್ಟಿದ ದಿನಾಂಕ', required: true },
        ],
      },
      {
        titleEn: 'Caste / Income Details',
        titleKn: 'ಜಾತಿ / ಆದಾಯ ವಿವರಗಳು',
        fields: [
          { name: 'religion', labelEn: 'Religion', labelKn: 'ಧರ್ಮ', type: 'select', options: RELIGION_OPTIONS, required: true },
          { name: 'category', labelEn: 'Category', labelKn: 'ವರ್ಗ', type: 'select', options: CATEGORY_OPTIONS, required: true },
          { name: 'caste_certificate_number', labelEn: 'Caste Certificate Number', labelKn: 'ಜಾತಿ ಪ್ರಮಾಣಪತ್ರ ಸಂಖ್ಯೆ', required: true },
          { name: 'income_certificate_number', labelEn: 'Income Certificate Number', labelKn: 'ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ ಸಂಖ್ಯೆ', required: true },
          { name: 'income', labelEn: 'Income (in Rs)', labelKn: 'ಆದಾಯ (ರೂ.)', type: 'number', required: true },
        ],
      },
      {
        titleEn: 'Disability Details',
        titleKn: 'ಅಂಗವೈಕಲ್ಯ ವಿವರಗಳು',
        fields: [
          { name: 'disability_status', labelEn: 'Person with Disabilities', labelKn: 'ಅಂಗವೈಕಲ್ಯ ಹೊಂದಿರುವವರೇ', type: 'radio', options: YES_NO_OPTIONS, required: true, fullWidth: true },
          { name: 'udid_number', labelEn: 'UDID Number', labelKn: 'ಯುಡಿಐಡಿ ಸಂಖ್ಯೆ' },
        ],
      },
      {
        titleEn: 'Personal Details',
        titleKn: 'ವೈಯಕ್ತಿಕ ವಿವರಗಳು',
        fields: [
          { name: 'mobile', labelEn: "Student's Mobile Number", labelKn: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ', required: true },
          { name: 'email', labelEn: 'E-Mail', labelKn: 'ಇ-ಮೇಲ್', type: 'email', required: true },
          { name: 'home_district', labelEn: 'Home District', labelKn: 'ಜಿಲ್ಲೆ', required: true },
          { name: 'home_taluka', labelEn: 'Home Taluka', labelKn: 'ತಾಲ್ಲೂಕು', required: true },
          { name: 'assembly_constituency', labelEn: 'Assembly Constituency', labelKn: 'ವಿಧಾನಸಭಾ ಕ್ಷೇತ್ರ', required: true },
          { name: 'pincode', labelEn: 'Pin Code', labelKn: 'ಪಿನ್ ಕೋಡ್', required: true },
          { name: 'permanent_address', labelEn: 'Permanent Address', labelKn: 'ಶಾಶ್ವತ ವಿಳಾಸ', type: 'textarea', required: true, fullWidth: true },
          { name: 'domicile_state', labelEn: 'Domicile State', labelKn: 'ನಿವಾಸ ರಾಜ್ಯ', required: true },
        ],
      },
    ],
    footerNoteEn: 'Both caste and income certificate details should belong to the student only.',
    footerNoteKn: 'ಜಾತಿ ಮತ್ತು ಆದಾಯ ಪ್ರಮಾಣಪತ್ರದ ವಿವರಗಳು ವಿದ್ಯಾರ್ಥಿಯದ್ದಾಗಿರಬೇಕು.',
  },
  'step-2': {
    titleEn: 'Enter College / Course Details',
    titleKn: 'ಕಾಲೇಜು / ಕೋರ್ಸ್ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ',
    noticeEn: 'Newly added districts and talukas will be included in the district and taluka drop-down lists shortly.',
    noticeKn: 'ಹೊಸ ಜಿಲ್ಲೆಗಳು ಮತ್ತು ತಾಲೂಕುಗಳು ಶೀಘ್ರದಲ್ಲೇ ಪಟ್ಟಿಯಲ್ಲಿ ಸೇರಿಸಲಾಗುತ್ತದೆ.',
    helperEn: 'Please check and confirm once again all the details entered are correct and in the student name only.',
    helperKn: 'ವಿದ್ಯಾರ್ಥಿಯ ಹೆಸರಿನಲ್ಲಿ ಸಲ್ಲಿಸಿದ ಎಲ್ಲಾ ವಿವರಗಳು ಸರಿಯಾಗಿರುವುದನ್ನು ಮರುಪರಿಶೀಲಿಸಿ.',
    sections: [
      {
        titleEn: 'Present Year Study Details',
        titleKn: 'ಪ್ರಸ್ತುತ ವರ್ಷದ ಅಧ್ಯಯನ ವಿವರಗಳು',
        fields: [
          { name: 'university_name', labelEn: 'Select University or Board', labelKn: 'ವಿಶ್ವವಿದ್ಯಾಲಯ / ಮಂಡಳಿ ಆಯ್ಕೆ', required: true },
          { name: 'university_registration_number', labelEn: 'University or Board Registration Number', labelKn: 'ನೋಂದಣಿ ಸಂಖ್ಯೆ', required: true },
          { name: 'college_name', labelEn: 'College Name', labelKn: 'ಕಾಲೇಜಿನ ಹೆಸರು', required: true },
          { name: 'course_name', labelEn: 'Course Name', labelKn: 'ಕೋರ್ಸ್ ಹೆಸರು', required: true },
          { name: 'course_year', labelEn: 'Course Year', labelKn: 'ಕೋರ್ಸ್ ವರ್ಷ', type: 'select', options: COURSE_YEAR_OPTIONS, required: true },
          { name: 'course_discipline', labelEn: 'Course Combination / Discipline', labelKn: 'ವಿಭಾಗ / ಕೋರ್ಸ್ ಸಂಯೋಜನೆ', required: true },
          { name: 'admission_mode', labelEn: 'Mode of Admission', labelKn: 'ಪ್ರವೇಶ ಮಾದರಿ', required: true },
          { name: 'academic_year', labelEn: 'Academic Year', labelKn: 'ಶೈಕ್ಷಣಿಕ ವರ್ಷ', required: true },
        ],
      },
      {
        titleEn: 'Counselling Data',
        titleKn: 'ಕೌನ್ಸೆಲಿಂಗ್ ವಿವರಗಳು',
        fields: [
          { name: 'counselling_number', labelEn: 'Counselling Number', labelKn: 'ಕೌನ್ಸೆಲಿಂಗ್ ಸಂಖ್ಯೆ' },
          { name: 'counselling_admission_year', labelEn: 'Counselling Admission Year', labelKn: 'ಕೌನ್ಸೆಲಿಂಗ್ ಪ್ರವೇಶ ವರ್ಷ' },
        ],
      },
      {
        titleEn: 'Previous Year Passed Details',
        titleKn: 'ಹಿಂದಿನ ವರ್ಷದ ಫಲಿತಾಂಶದ ವಿವರಗಳು',
        fields: [
          { name: 'previous_year_board', labelEn: 'Previous Year Board / University', labelKn: 'ಹಿಂದಿನ ವರ್ಷದ ಮಂಡಳಿ / ವಿಶ್ವವಿದ್ಯಾಲಯ', required: true },
          { name: 'previous_year_registration_number', labelEn: 'Previous Year Registration Number', labelKn: 'ಹಿಂದಿನ ವರ್ಷದ ನೋಂದಣಿ ಸಂಖ್ಯೆ', required: true },
          { name: 'previous_year_result_type', labelEn: 'Result Type', labelKn: 'ಫಲಿತಾಂಶ ಪ್ರಕಾರ', required: true },
          { name: 'previous_year_max_marks', labelEn: 'Maximum Marks', labelKn: 'ಗರಿಷ್ಠ ಅಂಕಗಳು', type: 'number', required: true },
          { name: 'previous_year_marks_obtained', labelEn: 'Total Marks Obtained', labelKn: 'ಒಟ್ಟು ಪಡೆದ ಅಂಕಗಳು', type: 'number', required: true },
          { name: 'previous_year_percentage_or_cgpa', labelEn: 'CGPA / Percentage', labelKn: 'ಸಿ.ಜಿ.ಪಿ.ಎ / ಶೇಕಡಾವಾರು', required: true },
        ],
      },
    ],
    footerNoteEn: 'Check and confirm all details are correct or not you entered.',
    footerNoteKn: 'ನಿಮ್ಮಿಂದ ನಮೂದಿಸಿದ ಎಲ್ಲಾ ವಿವರಗಳು ಸರಿಯಾಗಿವೆ ಎಂಬುದನ್ನು ಪರಿಶೀಲಿಸಿ.',
  },
  'step-3': {
    titleEn: 'E-Attestation Details',
    titleKn: 'ಇ-ಅಟೆಸ್ಟೇಶನ್ ವಿವರಗಳು',
    noticeEn: 'Instructions for students to apply for post-matric scholarship for FY 2025-26.',
    noticeKn: '2025-26 ಸಾಲಿನ ಪೋಸ್ಟ್ ಮ್ಯಾಟ್ರಿಕ್ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸುವ ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಸೂಚನೆಗಳು.',
    helperEn: 'Upload and confirm e-attestation references before moving to hostel details.',
    helperKn: 'ಹಾಸ್ಟೆಲ್ ವಿವರಗಳಿಗೆ ಮುನ್ನ ಇ-ಅಟೆಸ್ಟೇಶನ್ ದಾಖಲೆಗಳನ್ನು ದೃಢೀಕರಿಸಿ.',
    sections: [
      {
        titleEn: 'Uploaded E-Attestation Details',
        titleKn: 'ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ಇ-ಅಟೆಸ್ಟೇಶನ್ ವಿವರಗಳು',
        fields: [
          { name: 'e_attestation_status', labelEn: 'E-Attestation Status', labelKn: 'ಇ-ಅಟೆಸ್ಟೇಶನ್ ಸ್ಥಿತಿ', type: 'select', options: ATTESTATION_OPTIONS, required: true },
          { name: 'e_attestation_reference', labelEn: 'Reference Number / Notes', labelKn: 'ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ / ಟಿಪ್ಪಣಿ', type: 'textarea', fullWidth: true },
        ],
      },
    ],
    footerNoteEn: 'Review uploaded documents and check their mapping before continuing.',
    footerNoteKn: 'ಮುಂದುವರಿಸುವ ಮೊದಲು ಅಪ್‌ಲೋಡ್ ದಾಖಲೆಗಳ ಮ್ಯಾಪಿಂಗ್ ಪರಿಶೀಲಿಸಿ.',
  },
  'step-4': {
    titleEn: 'Hosteller / Dayscholar Details',
    titleKn: 'ವಸತಿನಿಲಯ / ಡೇ ಸ್ಕಾಲರ್ ವಿವರಗಳು',
    noticeEn: 'If your hostel warden does not add your details in hostel HMIS then you will be treated as day scholar.',
    noticeKn: 'ಹಾಸ್ಟೆಲ್ HMIS ನಲ್ಲಿ ವಿವರಗಳಿಲ್ಲದಿದ್ದರೆ ನಿಮಗೆ ಡೇ ಸ್ಕಾಲರ್ ಎಂದು ಪರಿಗಣಿಸಲಾಗುತ್ತದೆ.',
    helperEn: 'Contact your hostel warden to add details in HMIS if you are staying in hostel.',
    helperKn: 'ನೀವು ಹಾಸ್ಟೆಲ್‌ನಲ್ಲಿ ಉಳಿದಿದ್ದರೆ HMIS ನಲ್ಲಿ ವಿವರ ಸೇರಿಸಲು ವಾರ್ಡನ್ ಅನ್ನು ಸಂಪರ್ಕಿಸಿ.',
    sections: [
      {
        titleEn: 'Hostel Details',
        titleKn: 'ಹಾಸ್ಟೆಲ್ ವಿವರಗಳು',
        fields: [
          { name: 'hostel_or_day_scholar', labelEn: 'Are you a Day Scholar?', labelKn: 'ನೀವು ಡೇ ಸ್ಕಾಲರ್ ವಿದ್ಯಾರ್ಥಿಯೇ?', type: 'radio', options: DAY_SCHOLAR_OPTIONS, required: true, fullWidth: true },
          { name: 'hostel_name', labelEn: 'Hostel Name', labelKn: 'ಹಾಸ್ಟೆಲ್ ಹೆಸರು' },
          { name: 'hostel_registration_reference', labelEn: 'HMIS / Hostel Reference', labelKn: 'HMIS / ಹಾಸ್ಟೆಲ್ ಉಲ್ಲೇಖ' },
        ],
      },
    ],
    footerNoteEn: 'Continue only after confirming hostel or day-scholar details are correct.',
    footerNoteKn: 'ಹಾಸ್ಟೆಲ್ ಅಥವಾ ಡೇ ಸ್ಕಾಲರ್ ವಿವರಗಳು ಸರಿಯಾಗಿರುವುದನ್ನು ಖಚಿತಪಡಿಸಿ.',
  },
};

function localize(language: 'en' | 'kn', english: string, kannada: string) {
  return language === 'kn' ? kannada : english;
}

function Label({ language, labelEn, labelKn, required }: { language: 'en' | 'kn'; labelEn: string; labelKn: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-sm font-semibold text-[#555]">
      {localize(language, labelEn, labelKn)}
      {required ? <span className="ml-1 text-[#d11a1a]">*</span> : null}
    </label>
  );
}

function renderOptionLabel(language: 'en' | 'kn', option: Option) {
  return localize(language, option.labelEn, option.labelKn);
}

function Field({
  config,
  language,
  value,
  onChange,
}: {
  config: FieldConfig;
  language: 'en' | 'kn';
  value: unknown;
  onChange: (nextValue: string | boolean) => void;
}) {
  const baseClass = 'w-full border border-[#d7d7d7] bg-white px-3 py-2 text-sm text-[#333] outline-none transition-colors focus:border-[#3c83ba]';

  if (config.type === 'textarea') {
    return (
      <div className={config.fullWidth ? 'md:col-span-2' : ''}>
        <Label language={language} labelEn={config.labelEn} labelKn={config.labelKn} required={config.required} />
        <textarea className={`${baseClass} min-h-28 resize-y`} value={String(value || '')} onChange={(event) => onChange(event.target.value)} />
      </div>
    );
  }

  if (config.type === 'select') {
    return (
      <div className={config.fullWidth ? 'md:col-span-2' : ''}>
        <Label language={language} labelEn={config.labelEn} labelKn={config.labelKn} required={config.required} />
        <select className={baseClass} value={String(value || '')} onChange={(event) => onChange(event.target.value)}>
          <option value="">{language === 'kn' ? 'ಆಯ್ಕೆ ಮಾಡಿ' : 'Select'}</option>
          {(config.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {renderOptionLabel(language, option)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (config.type === 'radio') {
    return (
      <div className={config.fullWidth ? 'md:col-span-2' : ''}>
        <Label language={language} labelEn={config.labelEn} labelKn={config.labelKn} required={config.required} />
        <div className="flex flex-wrap gap-6 border border-[#d7d7d7] bg-white px-4 py-3 text-sm text-[#333]">
          {(config.options || []).map((option) => (
            <label key={option.value} className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={String(value || '') === option.value}
                onChange={() => onChange(option.value)}
              />
              {renderOptionLabel(language, option)}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={config.fullWidth ? 'md:col-span-2' : ''}>
      <Label language={language} labelEn={config.labelEn} labelKn={config.labelKn} required={config.required} />
      <input
        type={config.type || 'text'}
        className={baseClass}
        value={config.type === 'number' && value === 0 ? '0' : String(value || '')}
        placeholder={config.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function LoginPrompt({ language }: { language: 'en' | 'kn' }) {
  return (
    <div className="mt-10 rounded-[14px] border border-[#d9dee3] bg-white px-8 py-10 text-center shadow-[0_12px_24px_rgba(0,0,0,0.04)]">
      <h1 className="text-2xl font-semibold text-[#23445a]">
        {localize(language, 'Login required to continue the SSP flow', 'ಎಸ್‌ಎಸ್‌ಪಿ ಪ್ರಕ್ರಿಯೆಯನ್ನು ಮುಂದುವರಿಸಲು ಲಾಗಿನ್ ಅಗತ್ಯವಿದೆ')}
      </h1>
      <p className="mt-4 text-sm text-[#5e6c76]">
        {localize(language, 'Use your GovBot login so we can load your saved profile and draft data.', 'ನಿಮ್ಮ ಸಂರಕ್ಷಿತ ಪ್ರೊಫೈಲ್ ಮತ್ತು ಕರಡು ಡೇಟಾವನ್ನು ಲೋಡ್ ಮಾಡಲು GovBot ಲಾಗಿನ್ ಬಳಸಿ.')}
      </p>
      <div className="mt-6 flex justify-center gap-4">
        <Link href="/login?next=%2Fssp%2Fdashboard" className="bg-[#59b84f] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white">
          {localize(language, 'Login', 'ಲಾಗಿನ್')}
        </Link>
        <Link href="/ssp" className="border border-[#b8c7d2] bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#30556d]">
          {localize(language, 'Back to portal', 'ಪೋರ್ಟಲ್‌ಗೆ ಹಿಂದಿರುಗಿ')}
        </Link>
      </div>
    </div>
  );
}

export default function SSPStepPage({ stepId }: { stepId: StepId }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const {
    draft,
    error,
    loading,
    phone,
    language,
    setLanguage,
    updateFields,
    saveDraft,
    studentId,
    studentName,
  } = useSSPDraft(stepId);
  const content = getSSPContent(language);
  const step = getSSPStep(stepId);
  const previousStep = getPreviousSSPStep(stepId);
  const nextStep = getNextSSPStep(stepId);
  const config = STEP_CONFIGS[stepId];

  const pageTitle = useMemo(
    () => localize(language, config.titleEn, config.titleKn),
    [config.titleEn, config.titleKn, language],
  );

  const handleNavigate = async (target: string | null, targetStepId: string | null) => {
    if (!target || !targetStepId) return;

    setSaving(true);
    setSubmitError('');
    try {
      await saveDraft({ current_step: targetStepId });
      await router.push(target);
    } catch (saveError) {
      setSubmitError(saveError instanceof Error ? saveError.message : 'Could not save SSP draft');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SSPPortalShell
      language={language}
      onLanguageChange={setLanguage}
      studentName={studentName}
      studentId={studentId}
      title={content.portalName}
      subtitle={pageTitle}
      showStudentBar={Boolean(phone)}
    >
      <div className="mt-6 rounded-[4px] border border-[#c8e0ef] bg-[#dff1fb] px-6 py-5 text-[17px] uppercase tracking-[0.03em] text-[#3778a4]">
        {localize(language, config.noticeEn, config.noticeKn)}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => void handleNavigate(previousStep?.route || '/ssp/dashboard', previousStep?.id || 'step-1')}
          className="inline-flex items-center gap-3 bg-[#59b84f] px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white"
        >
          <span>◀</span>
          {content.common.back}
        </button>
        <button
          type="button"
          onClick={() => void handleNavigate(nextStep?.route || '/ssp/step-5', nextStep?.id || 'step-5')}
          className="inline-flex items-center gap-3 bg-[#59b84f] px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white"
        >
          {saving ? localize(language, 'Saving...', 'ಉಳಿಸಲಾಗುತ್ತಿದೆ...') : content.common.next}
          <span>▶</span>
        </button>
      </div>

      <div className="mt-6 border border-[#3d7fbb] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between bg-[#3d7fbb] px-4 py-3 text-white">
          <div className="text-[24px] uppercase tracking-[0.04em]">
            {step.shortTitle} / {pageTitle}
          </div>
          <div className="text-xl">⌃</div>
        </div>

        <div className="px-6 py-7">
          <h1 className="text-[30px] font-semibold uppercase tracking-[0.03em] text-[#444]">
            {pageTitle}
          </h1>
          {config.helperEn ? (
            <p className="mt-4 text-sm leading-7 text-[#5b6b75]">
              {localize(language, config.helperEn, config.helperKn || config.helperEn)}
            </p>
          ) : null}

          {loading ? (
            <div className="mt-8 rounded-[12px] border border-[#e1e6eb] bg-[#f7f9fb] px-5 py-6 text-sm text-[#61707a]">
              {localize(language, 'Loading your SSP draft...', 'ಎಸ್‌ಎಸ್‌ಪಿ ಕರಡು ಲೋಡ್ ಆಗುತ್ತಿದೆ...')}
            </div>
          ) : !phone ? (
            <LoginPrompt language={language} />
          ) : (
            <div className="mt-8 space-y-8">
              {config.sections.map((section) => (
                <section key={section.titleEn} className="border border-[#d8e2eb] bg-[#fcfcfc]">
                  <div className="bg-[#4d8fc5] px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white">
                    {localize(language, section.titleEn, section.titleKn)}
                  </div>
                  <div className="grid gap-5 px-4 py-5 md:grid-cols-2">
                    {section.fields.map((field) => (
                      <Field
                        key={field.name}
                        config={field}
                        language={language}
                        value={draft.fields[field.name]}
                        onChange={(value) => updateFields({ [field.name]: value })}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {error || submitError ? (
                <div className="border border-[#efc0c0] bg-[#fff4f4] px-4 py-4 text-sm font-semibold text-[#b62d2d]">
                  {submitError || error}
                </div>
              ) : null}

              <div className="border border-[#f3d2d2] bg-[#fff7f7] px-4 py-4 text-sm font-bold uppercase tracking-[0.08em] text-[#d11a1a]">
                {localize(language, config.footerNoteEn || '', config.footerNoteKn || config.footerNoteEn || '')}
              </div>
            </div>
          )}
        </div>
      </div>
    </SSPPortalShell>
  );
}
