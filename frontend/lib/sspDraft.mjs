export const SSP_STEPS = [
  {
    id: 'step-1',
    route: '/ssp/step-1',
    shortTitle: 'Step 1',
    title: 'Study / Caste / Personal Details',
    description: "Student's study, certificate, disability, and personal details",
  },
  {
    id: 'step-2',
    route: '/ssp/step-2',
    shortTitle: 'Step 2',
    title: 'Student College Details',
    description: "Student's college and course details",
  },
  {
    id: 'step-3',
    route: '/ssp/step-3',
    shortTitle: 'Step 3',
    title: 'E-Attestation Details',
    description: 'Document attestation and uploaded proof details',
  },
  {
    id: 'step-4',
    route: '/ssp/step-4',
    shortTitle: 'Step 4',
    title: 'Hostel Details',
    description: 'Hosteller or day-scholar details',
  },
  {
    id: 'step-5',
    route: '/ssp/step-5',
    shortTitle: 'Step 5',
    title: 'Preview & Final Submit',
    description: 'Preview and final submission',
  },
];

export const EMPTY_SSP_FIELDS = {
  student_id: '',
  student_name: '',
  father_name: '',
  mother_name: '',
  dob: '',
  gender: '',
  mobile: '',
  email: '',
  aadhaar_number: '',
  religion: '',
  category: '',
  caste: '',
  subcaste: '',
  caste_certificate_number: '',
  income_certificate_number: '',
  income: '',
  disability_status: 'No',
  udid_number: '',
  domicile_state: 'Karnataka',
  home_district: '',
  home_taluka: '',
  assembly_constituency: '',
  pincode: '',
  permanent_address: '',
  sslc_board: '',
  sslc_registration_number: '',
  sslc_pass_year: '',
  college_name: '',
  college_code: '',
  university_name: '',
  university_registration_number: '',
  course_name: '',
  course_discipline: '',
  course_year: '',
  academic_year: '2025-26',
  admission_mode: '',
  counselling_number: '',
  counselling_admission_year: '',
  previous_year_board: '',
  previous_year_registration_number: '',
  previous_year_result_type: '',
  previous_year_max_marks: '',
  previous_year_marks_obtained: '',
  previous_year_percentage_or_cgpa: '',
  e_attestation_status: '',
  e_attestation_reference: '',
  hostel_or_day_scholar: '',
  hostel_name: '',
  hostel_registration_reference: '',
  final_declaration_accepted: false,
};

const GOVBOT_SSP_APPLY_FIELDS = {
  student_id: 'SSP-9632363213',
  student_name: 'SHASHANK GOWDA T',
  father_name: 'THIMME GOWDA',
  mother_name: 'MANJULA T',
  dob: '30/10/2006',
  gender: 'Male',
  mobile: '9632363213',
  email: 'shashank.govda@example.com',
  aadhaar_number: '123412341234',
  religion: 'HINDU',
  category: 'OBC',
  caste: 'OBC',
  subcaste: 'Vokkaliga',
  caste_certificate_number: 'RD003467891234',
  income_certificate_number: 'INC202526001234',
  income: '25000',
  disability_status: 'No',
  domicile_state: 'Karnataka',
  home_district: 'Bengaluru Urban',
  home_taluka: 'Bengaluru North',
  assembly_constituency: 'Yelahanka',
  pincode: '560064',
  permanent_address: 'No. 42, Vidyaranyapura, Bengaluru, Karnataka',
  sslc_board: 'SSLC',
  sslc_registration_number: 'SSLC2022001234',
  sslc_pass_year: '2022',
  college_name: 'Sri M Visvesvaraya Institute of Technology',
  college_code: 'SMVIT001',
  university_name: 'Visvesvaraya Technological University',
  university_registration_number: '1MV23CS001',
  course_name: 'B.E Computer Science',
  course_discipline: 'Computer Science and Engineering',
  course_year: 'SECOND',
  academic_year: '2025-26',
  admission_mode: 'CET',
  counselling_number: 'CET2023009876',
  counselling_admission_year: '2023',
  previous_year_board: 'VTU',
  previous_year_registration_number: '1MV23CS001',
  previous_year_result_type: 'Passed',
  previous_year_max_marks: '1000',
  previous_year_marks_obtained: '875',
  previous_year_percentage_or_cgpa: '87.5',
  e_attestation_status: 'Verified',
  e_attestation_reference: 'EA202526009876',
  hostel_or_day_scholar: 'DayScholar',
  hostel_name: '',
  hostel_registration_reference: '',
};

const SSP_APPLY_ANIMATION_GROUPS = [
  {
    stepId: 'step-1',
    title: 'Step 1 — Study / caste / personal details',
    description: 'GovBot fills student identity, SSLC, caste, income, Aadhaar, and address fields.',
    entries: [
      { name: 'student_name', label: 'Student Name' },
      { name: 'dob', label: 'Date of Birth' },
      { name: 'aadhaar_number', label: 'Aadhaar Number' },
      { name: 'category', label: 'Category' },
      { name: 'income', label: 'Income' },
      { name: 'sslc_registration_number', label: 'SSLC Registration Number' },
    ],
  },
  {
    stepId: 'step-2',
    title: 'Step 2 — College / course details',
    description: 'GovBot moves to the course form and fills college, university, marks, and academic year.',
    entries: [
      { name: 'college_name', label: 'College Name' },
      { name: 'university_name', label: 'University' },
      { name: 'course_name', label: 'Course Name' },
      { name: 'course_year', label: 'Course Year' },
      { name: 'previous_year_percentage_or_cgpa', label: 'Previous Year Marks' },
    ],
  },
  {
    stepId: 'step-3',
    title: 'Step 3 — E-attestation documents',
    description: 'GovBot attaches and verifies the e-attestation reference before continuing.',
    entries: [
      { name: 'e_attestation_status', label: 'E-Attestation Status' },
      { name: 'e_attestation_reference', label: 'Reference Number' },
    ],
  },
  {
    stepId: 'step-4',
    title: 'Step 4 — Hostel / day-scholar details',
    description: 'GovBot fills the student residence section and confirms day-scholar status.',
    entries: [
      { name: 'hostel_or_day_scholar', label: 'Hostel or Day Scholar' },
      { name: 'hostel_name', label: 'Hostel Name' },
    ],
  },
  {
    stepId: 'step-5',
    title: 'Step 5 — Preview and final submit',
    description: 'GovBot accepts the declaration and submits the SSP form for tracking.',
    entries: [
      { name: 'final_declaration_accepted', label: 'Declaration Accepted' },
    ],
  },
];

/**
 * @typedef {'en' | 'kn'} SSPLanguage
 */

/**
 * @typedef {Object} ResolveSSPLanguageArgs
 * @property {SSPLanguage | undefined} [preferredLanguage]
 * @property {SSPLanguage | undefined} [savedLanguage]
 */

/**
 * @typedef {Object} SavedSSPDraft
 * @property {string} [current_step]
 * @property {SSPLanguage} [language]
 * @property {Record<string, unknown>} [fields]
 * @property {string} [submission_status]
 * @property {string | null} [confirmation_number]
 */

/**
 * @typedef {Object} BuildSSPDraftArgs
 * @property {Record<string, unknown>} [profile]
 * @property {Record<string, unknown>} [prefill]
 * @property {SavedSSPDraft} [saved]
 * @property {SSPLanguage | undefined} [preferredLanguage]
 */

export function mergeSSPPrefill(manualFields = {}, prefillFields = {}) {
  const merged = { ...prefillFields };

  for (const [key, value] of Object.entries(manualFields)) {
    if (value !== '' && value !== null && value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
}

export function buildGovBotSSPApplyFields(fields = {}) {
  return {
    ...mergeSSPPrefill(fields, GOVBOT_SSP_APPLY_FIELDS),
    final_declaration_accepted: true,
  };
}

function pickFields(sourceFields, entries) {
  return entries.reduce((pickedFields, entry) => {
    pickedFields[entry.name] = sourceFields[entry.name];
    return pickedFields;
  }, {});
}

export function buildGovBotSSPApplyAnimationSteps(fields = {}) {
  const finalFields = buildGovBotSSPApplyFields(fields);
  return SSP_APPLY_ANIMATION_GROUPS.map((group) => ({
    ...group,
    fields: pickFields(finalFields, group.entries),
    entries: group.entries.map((entry) => ({
      ...entry,
      value: finalFields[entry.name],
    })),
  }));
}

export function hasSSPApplySession(phone = '', token = '', loadError = '') {
  const hasAuthValues = Boolean(String(phone || '').trim() && String(token || '').trim());
  if (!hasAuthValues) return false;
  return !/\b(401|403)\b/.test(String(loadError || ''));
}

const SSP_SHOWCASE_NOTICE_IGNORED_FIELDS = new Set(['final_declaration_accepted']);

function hasApplicantSuppliedSSPValue(field, value) {
  if (SSP_SHOWCASE_NOTICE_IGNORED_FIELDS.has(field)) return false;
  if (value === null || value === undefined || value === false) return false;

  const normalizedValue = String(value).trim();
  if (!normalizedValue) return false;

  if (field in EMPTY_SSP_FIELDS) {
    const defaultValue = EMPTY_SSP_FIELDS[field];
    if (String(defaultValue ?? '').trim() === normalizedValue) {
      return false;
    }
  }

  return true;
}

export function shouldShowSSPShowcaseFallbackNotice(fields = {}) {
  return !Object.entries(fields || {}).some(([field, value]) => hasApplicantSuppliedSSPValue(field, value));
}

export function normalizeSSPLanguage(language) {
  return language === 'kn' ? 'kn' : 'en';
}

/**
 * @param {ResolveSSPLanguageArgs} [args]
 * @returns {SSPLanguage}
 */
export function resolveSSPLanguage({ preferredLanguage, savedLanguage } = {}) {
  if (preferredLanguage === 'en' || preferredLanguage === 'kn') {
    return preferredLanguage;
  }
  return normalizeSSPLanguage(savedLanguage);
}

/**
 * @param {BuildSSPDraftArgs} [args]
 */
export function buildSSPDraft({ profile = {}, prefill = {}, saved = {}, preferredLanguage } = {}) {
  const profileFields = { ...EMPTY_SSP_FIELDS, ...(profile || {}) };
  const prefillFields = mergeSSPPrefill(prefill || {}, profileFields);
  const savedFields = mergeSSPPrefill((saved && saved.fields) || {}, prefillFields);

  return {
    current_step: saved.current_step || 'step-1',
    language: resolveSSPLanguage({ preferredLanguage, savedLanguage: saved.language }),
    fields: savedFields,
    submission_status: saved.submission_status || 'draft',
    confirmation_number: saved.confirmation_number || null,
  };
}

export function getSSPStep(stepId) {
  return SSP_STEPS.find((step) => step.id === stepId) || SSP_STEPS[0];
}

export function getNextSSPStep(stepId) {
  const index = SSP_STEPS.findIndex((step) => step.id === stepId);
  if (index < 0 || index === SSP_STEPS.length - 1) return null;
  return SSP_STEPS[index + 1];
}

export function getPreviousSSPStep(stepId) {
  const index = SSP_STEPS.findIndex((step) => step.id === stepId);
  if (index <= 0) return null;
  return SSP_STEPS[index - 1];
}

const STEP_COMPLETION_FIELDS = {
  'step-1': ['student_name', 'dob', 'aadhaar_number', 'category'],
  'step-2': ['college_name', 'course_name', 'course_year'],
  'step-3': ['e_attestation_status'],
  'step-4': ['hostel_or_day_scholar'],
  'step-5': ['final_declaration_accepted'],
};

export function isSSPStepComplete(stepId, fields = {}) {
  const requiredFields = STEP_COMPLETION_FIELDS[stepId] || [];
  return requiredFields.every((field) => {
    const value = fields[field];
    return value !== '' && value !== null && value !== undefined && value !== false;
  });
}
