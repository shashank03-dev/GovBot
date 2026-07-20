-- Fields required so a complete citizen profile can fill the whole NSP form
-- without falling back to demo data. See gov_agent/profile_router.py
-- (_PROFILE_FIELDS) and frontend/lib/formFillTargets.mjs (NSP_DEMO_FIELD_MAP).
--
-- Additive and idempotent: existing rows keep their values and every statement
-- is safe to re-run.

alter table if exists citizen_profiles add column if not exists aadhaar_number text;
alter table if exists citizen_profiles add column if not exists course_name text;
alter table if exists citizen_profiles add column if not exists board text;
alter table if exists citizen_profiles add column if not exists academic_year text;
alter table if exists citizen_profiles add column if not exists admission_date date;
alter table if exists citizen_profiles add column if not exists bank_branch text;

comment on column citizen_profiles.aadhaar_number is
    'Full 12-digit Aadhaar. aadhaar_last4 is derived from this on upsert.';
comment on column citizen_profiles.course_name is
    'Course as printed on the form (e.g. Information Science). Distinct from the course_level eligibility enum.';

-- No backfill: aadhaar_number cannot be reconstructed from aadhaar_last4, and
-- course_level is an eligibility enum rather than a course name, so copying it
-- into course_name would store wrong data.
