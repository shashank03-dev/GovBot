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
