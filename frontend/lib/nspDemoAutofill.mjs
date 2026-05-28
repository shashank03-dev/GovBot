export const NSP_DEMO_SESSION_STORAGE_KEY = 'govbot_nsp_demo_prefill';

export const NSP_DEMO_DATA = {
  name: 'SHASHANK GOWDA T',
  dob: '30/10/2006',
  gender: 'Male',
  category: 'obc',
  religion: 'hindu',
  mobile: '919632363213',
  email: 'frshashank7447@gmail.com',
  aadhaar: '6634 0835 5424',
  income: '98000',
  domicile: 'Karnataka',
  instituteState: 'Karnataka',
  district: 'Bengaluru North',
  institute: 'Sir M Vishveswraya Institute of Technology',
  course: 'Information Science',
  year: '2025',
  board: 'Karnataka School Examination and Assessment Board',
  marks: '95.5',
  admissionDate: '03/09/2025',
  accountHolder: 'SHASHANK GOWDA T',
  bankName: 'State Bank of India',
  accountNo: '325671904812',
  confirmAccountNo: '325671904812',
  ifsc: 'SBIN0012345',
  branch: 'HMT Layout',
};

const NSP_VISIBLE_AUTOFILL_FIELDS = [
  'name',
  'dob',
  'gender',
  'category',
  'religion',
  'mobile',
  'email',
  'aadhaar',
  'income',
  'domicile',
  'instituteState',
  'district',
  'institute',
  'course',
  'year',
  'board',
  'marks',
  'admissionDate',
  'accountHolder',
  'bankName',
  'accountNo',
  'confirmAccountNo',
  'ifsc',
  'branch',
];

export const NSP_DEMO_STEPS = [
  { field: 'name', label: 'Full Name entered', tab: 0 },
  { field: 'dob', label: 'Date of Birth filled', tab: 0 },
  { field: 'gender', label: 'Gender selected', tab: 0 },
  { field: 'category', label: 'Category selected', tab: 0 },
  { field: 'religion', label: 'Religion selected', tab: 0 },
  { field: 'mobile', label: 'Mobile Number entered', tab: 0 },
  { field: 'email', label: 'Email ID entered', tab: 0 },
  { field: 'aadhaar', label: 'Aadhaar Number entered', tab: 0 },
  { field: 'income', label: 'Annual Income entered', tab: 0 },
  { field: 'domicile', label: 'State of Domicile selected', tab: 0 },
  { field: 'instituteState', label: 'Institute State selected', tab: 1 },
  { field: 'district', label: 'Institute District selected', tab: 1 },
  { field: 'institute', label: 'Institute Name filled', tab: 1 },
  { field: 'course', label: 'Course selected', tab: 1 },
  { field: 'year', label: 'Year of Study selected', tab: 1 },
  { field: 'board', label: 'Board / University filled', tab: 1 },
  { field: 'marks', label: 'Previous Year Marks entered', tab: 1 },
  { field: 'admissionDate', label: 'Admission Date entered', tab: 1 },
  { field: 'accountHolder', label: 'Account Holder Name entered', tab: 2 },
  { field: 'bankName', label: 'Bank Name selected', tab: 2 },
  { field: 'accountNo', label: 'Account Number entered', tab: 2 },
  { field: 'confirmAccountNo', label: 'Confirm Account Number entered', tab: 2 },
  { field: 'ifsc', label: 'IFSC Code entered', tab: 2 },
  { field: 'branch', label: 'Branch Name filled', tab: 2 },
];

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildNspDemoDataFromFillValues(fillValues = {}) {
  const merged = { ...NSP_DEMO_DATA };

  Object.entries(fillValues).forEach(([field, value]) => {
    const normalized = normalizeString(value);
    if (!normalized) {
      return;
    }
    if (field in merged) {
      merged[field] = normalized;
    }
  });

  if (!normalizeString(fillValues.instituteState) && normalizeString(fillValues.domicile)) {
    merged.instituteState = normalizeString(fillValues.domicile);
  }

  if (!normalizeString(fillValues.accountHolder) && normalizeString(fillValues.name)) {
    merged.accountHolder = normalizeString(fillValues.name);
  }

  if (!normalizeString(fillValues.confirmAccountNo) && normalizeString(fillValues.accountNo)) {
    merged.confirmAccountNo = normalizeString(fillValues.accountNo);
  }

  return merged;
}

function hasNspApplicantValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== '';
}

export function shouldShowNspShowcaseFallbackNotice(fillValues = {}) {
  return !NSP_VISIBLE_AUTOFILL_FIELDS.some((field) => hasNspApplicantValue(fillValues[field]));
}

export function getMissingNspDemoStepFields() {
  const stepFields = new Set(NSP_DEMO_STEPS.map((step) => step.field));
  return NSP_VISIBLE_AUTOFILL_FIELDS.filter((field) => !stepFields.has(field));
}
