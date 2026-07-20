// Mirrors _PROFILE_FIELDS in gov_agent/profile_router.py — keep the two in sync.
const PROFILE_FIELD_WEIGHTS = {
  full_name: 10,
  dob: 10,
  gender: 5,
  // aadhaar_last4 is derived from aadhaar_number, so only the source field is scored.
  aadhaar_number: 10,
  address: 5,
  state: 5,
  district: 3,
  pincode: 3,
  income: 10,
  caste: 8,
  religion: 3,
  course_level: 5,
  course_name: 5,
  institution: 5,
  board: 3,
  academic_year: 3,
  admission_date: 3,
  marks_pct: 5,
  bank_account: 8,
  bank_ifsc: 5,
  bank_name: 3,
  bank_branch: 3,
  father_name: 5,
  email: 3,
};

const TOTAL_PROFILE_WEIGHT = Object.values(PROFILE_FIELD_WEIGHTS).reduce((sum, value) => sum + value, 0);

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function getAadhaarLast4(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.slice(-4) : '';
}

function toNumberOrValue(value) {
  if (!isFilled(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

export function mapReviewImportedFieldsToProfile(importedFields = {}) {
  const mapped = {
    digilocker_connected: true,
  };

  if (isFilled(importedFields.name)) {
    mapped.full_name = String(importedFields.name).trim();
  }
  if (isFilled(importedFields.dob)) {
    mapped.dob = String(importedFields.dob).trim();
  }
  if (isFilled(importedFields.gender)) {
    mapped.gender = String(importedFields.gender).trim();
  }
  if (isFilled(importedFields.aadhaar_number)) {
    mapped.aadhaar_number = String(importedFields.aadhaar_number).trim();
    mapped.aadhaar_last4 = getAadhaarLast4(importedFields.aadhaar_number);
  }
  if (isFilled(importedFields.address)) {
    mapped.address = String(importedFields.address).trim();
  }
  if (isFilled(importedFields.income)) {
    mapped.income = toNumberOrValue(importedFields.income);
  }
  if (isFilled(importedFields.caste)) {
    mapped.caste = String(importedFields.caste).trim().toLowerCase();
  }
  if (isFilled(importedFields.marks_pct)) {
    mapped.marks_pct = toNumberOrValue(importedFields.marks_pct);
  }

  return mapped;
}

export function hasProfileContent(profile = {}) {
  return Object.keys(PROFILE_FIELD_WEIGHTS).some((field) => isFilled(profile[field]));
}

export function computeProfileSummary(profile = {}) {
  let earned = 0;
  const missing_fields = [];

  for (const [field, weight] of Object.entries(PROFILE_FIELD_WEIGHTS)) {
    if (isFilled(profile[field])) {
      earned += weight;
    } else {
      missing_fields.push(field);
    }
  }

  return {
    completeness_pct: Math.round((earned * 100) / TOTAL_PROFILE_WEIGHT),
    missing_fields,
  };
}

export function mergeReviewIntoProfile(baseProfile = {}, importedFields = {}) {
  const mappedReview = mapReviewImportedFieldsToProfile(importedFields);
  const mergedProfile = { ...baseProfile };

  for (const [field, value] of Object.entries(mappedReview)) {
    if (!isFilled(mergedProfile[field])) {
      mergedProfile[field] = value;
    }
  }

  return {
    profile: mergedProfile,
    ...computeProfileSummary(mergedProfile),
  };
}
