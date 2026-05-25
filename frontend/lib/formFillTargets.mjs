const NSP_DEMO_FIELDS = [
  { label: 'Full Name (as per Aadhaar)', name: 'name', id: 'name', type: 'text', placeholder: '' },
  { label: 'Date of Birth (DD/MM/YYYY)', name: 'dob', id: 'dob', type: 'text', placeholder: '' },
  { label: 'Gender', name: 'gender', id: 'gender', type: 'select', placeholder: '' },
  { label: 'Category', name: 'category', id: 'category', type: 'select', placeholder: '' },
  { label: 'Religion', name: 'religion', id: 'religion', type: 'select', placeholder: '' },
  { label: 'Mobile Number', name: 'mobile', id: 'mobile', type: 'tel', placeholder: '' },
  { label: 'Email ID', name: 'email', id: 'email', type: 'email', placeholder: '' },
  { label: 'Aadhaar Number', name: 'aadhaar', id: 'aadhaar', type: 'text', placeholder: '' },
  { label: 'Annual Family Income (Rs)', name: 'income', id: 'income', type: 'text', placeholder: '' },
  { label: 'State of Domicile', name: 'domicile', id: 'domicile', type: 'select', placeholder: '' },
  { label: 'Institute District', name: 'district', id: 'district', type: 'select', placeholder: '' },
  { label: 'Institute Name', name: 'institute', id: 'institute', type: 'text', placeholder: '' },
  { label: 'Course / Class', name: 'course', id: 'course', type: 'select', placeholder: '' },
  { label: 'Previous Year Marks (%)', name: 'marks', id: 'marks', type: 'text', placeholder: '' },
  { label: 'Account Holder Name', name: 'accountHolder', id: 'accountHolder', type: 'text', placeholder: '' },
  { label: 'Bank Name', name: 'bankName', id: 'bankName', type: 'select', placeholder: '' },
  { label: 'Account Number', name: 'accountNo', id: 'accountNo', type: 'text', placeholder: '' },
  { label: 'IFSC Code', name: 'ifsc', id: 'ifsc', type: 'text', placeholder: '' },
  { label: "Father's Name", name: 'fatherName', id: 'fatherName', type: 'text', placeholder: '' },
  { label: "Mother's Name", name: 'motherName', id: 'motherName', type: 'text', placeholder: '' },
];

const NSP_DEMO_FIELD_MAP = {
  name: 'full_name',
  dob: 'dob',
  gender: 'gender',
  category: 'caste',
  religion: 'religion',
  mobile: 'phone',
  email: 'email',
  aadhaar: 'aadhaar_last4',
  income: 'income',
  domicile: 'state',
  district: 'district',
  institute: 'institution',
  course: 'course_level',
  marks: 'marks_pct',
  accountHolder: 'full_name',
  bankName: 'bank_name',
  accountNo: 'bank_account',
  ifsc: 'bank_ifsc',
  fatherName: 'father_name',
  motherName: 'mother_name',
};

export const FORM_FILL_SAMPLE_TARGETS = [
  {
    key: 'nsp-demo',
    label: 'NSP Scholarship',
    displayUrl: 'https://scholarships.gov.in/fresh/newstdRegfrmInstruction',
    mode: 'demo_alias',
    resolvedPath: '/nsp/apply',
    analyzedPageLabel: 'GovBot NSP demo form',
    proofNote: 'Official NSP URL shown, GovBot analyzed the local NSP showcase for the demo run.',
  },
  {
    key: 'dummy-address',
    label: 'Real Demo Form',
    displayUrl: 'https://thedummysite.com/address',
    mode: 'live_site',
    analyzedPageLabel: 'The Dummy Site address form',
    proofNote: 'Public autofill playground. GovBot detects and fills matched fields but does not submit.',
  },
];

function normalizeLookupUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildFillValues(fieldMap, profile) {
  const fillValues = {};
  const missingFields = new Set();

  Object.entries(fieldMap).forEach(([fieldId, profileKey]) => {
    const value = profile?.[profileKey];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      fillValues[fieldId] = String(value);
    } else {
      missingFields.add(profileKey);
    }
  });

  return {
    fillValues,
    missingFields: Array.from(missingFields),
  };
}

export function findFormFillTarget(url) {
  const normalizedUrl = normalizeLookupUrl(url);
  return FORM_FILL_SAMPLE_TARGETS.find((target) => normalizeLookupUrl(target.displayUrl) === normalizedUrl) || null;
}

export function buildDemoAliasAnalysis(target, profile, frontendBaseUrl) {
  const resolvedUrl = new URL(target.resolvedPath, frontendBaseUrl);
  resolvedUrl.searchParams.set('autostart', '1');
  resolvedUrl.searchParams.set('source', 'form-fill');

  const { fillValues, missingFields } = buildFillValues(NSP_DEMO_FIELD_MAP, profile);

  return {
    url: target.displayUrl,
    display_url: target.displayUrl,
    resolved_url: resolvedUrl.toString(),
    resolution_mode: 'demo_alias',
    target_key: target.key,
    target_label: target.label,
    analyzed_page_label: target.analyzedPageLabel,
    proof_note: target.proofNote,
    form_fields: NSP_DEMO_FIELDS,
    field_map: NSP_DEMO_FIELD_MAP,
    fill_values: fillValues,
    filled_count: Object.keys(fillValues).length,
    missing_fields: missingFields,
  };
}
