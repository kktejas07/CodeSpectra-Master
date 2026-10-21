/**
 * BGV check catalog: what the candidate must provide for each check, per
 * region (India, USA). Pure and client-safe — the portal wizard renders from
 * it and the server validates against it (lib/ats/bgv/validate.ts).
 *
 * Legal note: the consent / disclosure / notice texts here are generic
 * placeholders. The platform does not give legal advice; tenants must review
 * them with counsel (the settings page says so) before using them.
 */
import type { BgvCheckType, BgvRegion } from '@/lib/ats/contract'
import type { BgvRegionSettings, BgvStateNotice } from './types'

export type FieldType = 'text' | 'date' | 'month' | 'email' | 'tel' | 'number' | 'select' | 'textarea' | 'checkbox'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: { value: string; label: string }[]
  /** regex source the (trimmed, upper-cased for `upper`) value must match */
  pattern?: string
  patternHint?: string
  upper?: boolean
  max?: number
  hint?: string
  autoComplete?: string
  /** stored encrypted; the case keeps only a mask */
  sensitive?: 'pan' | 'ssn' | 'dl_number' | 'id_number'
  /** only required / shown when another field has this value */
  when?: { key: string; equals: unknown }
}

export interface DocDef {
  slot: string
  label: string
  required: boolean
  hint?: string
  /** several files allowed (e.g. marksheets, 3 payslips) */
  multiple?: number
  /** required only for the first group item (latest employer) / when the item is not current */
  requiredWhen?: 'first_item' | 'not_current'
  when?: { key: string; equals: unknown }
}

export interface GroupDef {
  key: string
  label: string
  itemLabel: string
  min: number
  max: number
  fields: FieldDef[]
  documents: DocDef[]
}

export interface CheckDef {
  type: BgvCheckType
  label: string
  description: string
  /** false: performed by the vendor from identity + address data; no form */
  candidate_input: boolean
  fields: FieldDef[]
  documents: DocDef[]
  group?: GroupDef
  /** a checkbox field whose `true` skips the group (fresher, no history) */
  skipGroupWith?: string
  notice?: string
}

// ─── Shared field sets ───────────────────────────────────────────────────────

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
export const PAN_RE = '^[A-Z]{5}[0-9]{4}[A-Z]$'
export const SSN_RE = '^(?!000|666|9\\d\\d)\\d{3}-?(?!00)\\d{2}-?(?!0000)\\d{4}$'
const PHONE = { pattern: '^\\+?[0-9 ()-]{7,20}$', patternHint: 'Enter a phone number with country code' }
const EMAIL = { pattern: '^[^\\s@]{1,64}@[^\\s@]{1,255}\\.[^\\s@]{2,}$', patternHint: 'Enter a valid email address' }

const referenceGroup = (min: number): GroupDef => ({
  key: 'references',
  label: 'References',
  itemLabel: 'Reference',
  min,
  max: 5,
  fields: [
    { key: 'name', label: 'Full name', type: 'text', required: true, max: 120 },
    { key: 'relation', label: 'How you know them', type: 'select', required: true, options: [
      { value: 'manager', label: 'Manager' }, { value: 'colleague', label: 'Colleague' }, { value: 'client', label: 'Client' },
      { value: 'professor', label: 'Professor / teacher' }, { value: 'other', label: 'Other' },
    ] },
    { key: 'company', label: 'Company or institution', type: 'text', required: true, max: 160 },
    { key: 'designation', label: 'Their role', type: 'text', max: 120 },
    { key: 'phone', label: 'Phone', type: 'tel', required: true, autoComplete: 'off', ...PHONE },
    { key: 'email', label: 'Email', type: 'email', required: true, autoComplete: 'off', ...EMAIL },
  ],
  documents: [],
})

// ─── India ───────────────────────────────────────────────────────────────────

const IN_ID_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'pan', label: 'PAN card' },
  { value: 'aadhaar_masked', label: 'Masked Aadhaar' },
]

const IN_EDU_LEVELS = [
  { value: '10th', label: '10th (SSC / secondary)' },
  { value: '12th', label: '12th (HSC / intermediate)' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'bachelor', label: "Bachelor's degree" },
  { value: 'master', label: "Master's degree" },
  { value: 'doctorate', label: 'Doctorate' },
  { value: 'other', label: 'Other certification' },
]

const IN: CheckDef[] = [
  {
    type: 'identity',
    label: 'Identity',
    description: 'Your name and date of birth as they appear on your government ID, and a recent photo.',
    candidate_input: true,
    fields: [
      { key: 'full_name', label: 'Full name (as on ID)', type: 'text', required: true, max: 160, autoComplete: 'name' },
      { key: 'dob', label: 'Date of birth', type: 'date', required: true, autoComplete: 'bday' },
      { key: 'father_name', label: "Father's name", type: 'text', required: true, max: 160 },
      { key: 'id_type', label: 'Government ID', type: 'select', required: true, options: IN_ID_TYPES },
      // Optional ID numbers let a verification partner check the ID at source (e.g. IDfy). Never an Aadhaar number.
      { key: 'dl_number', label: 'Driving licence number (optional)', type: 'text', upper: true, max: 20, pattern: '^[A-Z]{2}[0-9A-Z -]{8,18}$', patternHint: 'As printed on your licence, e.g. MH1420110062821', sensitive: 'dl_number', autoComplete: 'off', hint: 'Speeds up verification', when: { key: 'id_type', equals: 'driving_licence' } },
      { key: 'voter_id_number', label: 'Voter ID (EPIC) number (optional)', type: 'text', upper: true, max: 10, pattern: '^[A-Z]{3}[0-9]{7}$', patternHint: '3 letters and 7 digits, e.g. ABC1234567', sensitive: 'id_number', autoComplete: 'off', hint: 'Speeds up verification', when: { key: 'id_type', equals: 'voter_id' } },
      { key: 'passport_file_number', label: 'Passport file number (optional)', type: 'text', upper: true, max: 20, pattern: '^[A-Z]{2}[0-9A-Z]{6,18}$', patternHint: 'The file number on your passport application receipt, e.g. HY1234567890123', sensitive: 'id_number', autoComplete: 'off', hint: 'Speeds up verification', when: { key: 'id_type', equals: 'passport' } },
    ],
    documents: [
      { slot: 'photo', label: 'Recent passport-size photo', required: true, hint: 'JPG or PNG, face clearly visible' },
      { slot: 'govt_id', label: 'Government ID (front and back)', required: true, multiple: 2 },
    ],
  },
  {
    type: 'pan',
    label: 'PAN',
    description: 'Your Permanent Account Number, used to confirm identity.',
    candidate_input: true,
    fields: [
      { key: 'pan', label: 'PAN', type: 'text', required: true, pattern: PAN_RE, patternHint: 'PAN has 10 characters: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)', upper: true, sensitive: 'pan', autoComplete: 'off' },
      { key: 'name_on_pan', label: 'Name on PAN card', type: 'text', required: true, max: 160 },
    ],
    documents: [{ slot: 'pan_card', label: 'PAN card image', required: true }],
  },
  {
    type: 'aadhaar',
    label: 'Aadhaar (optional)',
    description: 'Aadhaar is voluntary. If you share it, upload the masked e-Aadhaar (only the last 4 digits visible) from the UIDAI website. You can give another government ID instead.',
    candidate_input: true,
    notice: 'We never store your full Aadhaar number — only the last 4 digits.',
    fields: [
      { key: 'opt_out', label: "I'd rather give another government ID instead of Aadhaar", type: 'checkbox' },
      { key: 'last4', label: 'Last 4 digits of Aadhaar', type: 'text', required: true, pattern: '^[0-9]{4}$', patternHint: 'Enter only the last 4 digits', autoComplete: 'off', when: { key: 'opt_out', equals: false } },
      { key: 'alt_id_type', label: 'Alternative ID', type: 'select', required: true, options: IN_ID_TYPES.filter((o) => o.value !== 'aadhaar_masked' && o.value !== 'pan'), when: { key: 'opt_out', equals: true } },
    ],
    documents: [
      { slot: 'masked_aadhaar', label: 'Masked e-Aadhaar (PDF or image)', required: true, hint: 'Download "masked Aadhaar" from myaadhaar.uidai.gov.in', when: { key: 'opt_out', equals: false } },
      { slot: 'alt_id', label: 'Alternative ID document', required: true, multiple: 2, when: { key: 'opt_out', equals: true } },
    ],
  },
  {
    type: 'address',
    label: 'Address',
    description: 'Your current and permanent address, how long you have lived there, and a proof of address.',
    candidate_input: true,
    fields: [
      { key: 'current_address', label: 'Current address', type: 'textarea', required: true, max: 500, autoComplete: 'street-address' },
      { key: 'current_pin', label: 'PIN code', type: 'text', required: true, pattern: '^[1-9][0-9]{5}$', patternHint: 'Enter the 6-digit PIN code' },
      { key: 'current_since', label: 'Living here since', type: 'month', required: true },
      { key: 'permanent_same', label: 'My permanent address is the same', type: 'checkbox' },
      { key: 'permanent_address', label: 'Permanent address', type: 'textarea', required: true, max: 500, when: { key: 'permanent_same', equals: false } },
      { key: 'permanent_pin', label: 'Permanent PIN code', type: 'text', required: true, pattern: '^[1-9][0-9]{5}$', patternHint: 'Enter the 6-digit PIN code', when: { key: 'permanent_same', equals: false } },
    ],
    documents: [
      { slot: 'address_proof', label: 'Proof of current address', required: true, hint: 'Utility bill, rent agreement, bank statement or passport' },
      { slot: 'permanent_proof', label: 'Proof of permanent address', required: true, when: { key: 'permanent_same', equals: false } },
    ],
  },
  {
    type: 'education',
    label: 'Education',
    description: 'Your 10th, 12th (or diploma) and highest degree, plus any others you want verified.',
    candidate_input: true,
    fields: [],
    documents: [],
    group: {
      key: 'entries',
      label: 'Qualifications',
      itemLabel: 'Qualification',
      min: 2,
      max: 8,
      fields: [
        { key: 'level', label: 'Level', type: 'select', required: true, options: IN_EDU_LEVELS },
        { key: 'course', label: 'Course / specialisation', type: 'text', max: 160 },
        { key: 'institution', label: 'School / college', type: 'text', required: true, max: 200 },
        { key: 'board', label: 'Board / university', type: 'text', required: true, max: 200 },
        { key: 'year', label: 'Year of passing', type: 'number', required: true, pattern: '^(19[5-9][0-9]|20[0-9]{2})$', patternHint: 'Enter a 4-digit year' },
        { key: 'roll_no', label: 'Roll / registration number', type: 'text', required: true, max: 60 },
      ],
      documents: [
        { slot: 'marksheets', label: 'Marksheets', required: true, multiple: 10 },
        { slot: 'certificate', label: 'Pass / provisional / degree certificate', required: true, multiple: 2 },
      ],
    },
  },
  {
    type: 'employment',
    label: 'Employment',
    description: 'Every employer in scope, latest first. The last two employers are mandatory.',
    candidate_input: true,
    skipGroupWith: 'fresher',
    fields: [{ key: 'fresher', label: "I'm a fresher — I have no previous employment", type: 'checkbox' }],
    documents: [],
    group: {
      key: 'employers',
      label: 'Employers',
      itemLabel: 'Employer',
      min: 1,
      max: 10,
      fields: [
        { key: 'company', label: 'Company', type: 'text', required: true, max: 200 },
        { key: 'designation', label: 'Designation', type: 'text', required: true, max: 120 },
        { key: 'employee_id', label: 'Employee ID', type: 'text', required: true, max: 60 },
        { key: 'from', label: 'From', type: 'month', required: true },
        { key: 'current', label: 'I currently work here', type: 'checkbox' },
        { key: 'to', label: 'To', type: 'month', required: true, when: { key: 'current', equals: false } },
        { key: 'manager_name', label: 'Reporting manager', type: 'text', required: true, max: 120 },
        { key: 'manager_contact', label: 'Manager phone or email', type: 'text', required: true, max: 160 },
        { key: 'hr_contact', label: 'HR email or phone', type: 'text', required: true, max: 160 },
        { key: 'reason', label: 'Reason for leaving', type: 'textarea', max: 500, when: { key: 'current', equals: false } },
        { key: 'may_contact', label: 'May we contact this employer now?', type: 'select', required: true, options: YES_NO, hint: 'For your current employer you can ask us to wait until you have resigned' },
      ],
      documents: [
        { slot: 'offer_letter', label: 'Offer / appointment letter', required: true },
        { slot: 'relieving_letter', label: 'Relieving / experience letter', required: true, requiredWhen: 'not_current' },
        { slot: 'payslips', label: 'Last 3 payslips', required: true, multiple: 3, requiredWhen: 'first_item' },
      ],
    },
  },
  {
    type: 'uan_epfo',
    label: 'UAN / EPFO',
    description: 'Your Universal Account Number lets the verifier match your PF service history with the employers you listed.',
    candidate_input: true,
    fields: [
      { key: 'no_uan', label: "I don't have a UAN (no PF deductions so far)", type: 'checkbox' },
      { key: 'uan', label: 'UAN', type: 'text', required: true, pattern: '^[0-9]{12}$', patternHint: 'UAN is 12 digits', autoComplete: 'off', when: { key: 'no_uan', equals: false } },
    ],
    documents: [{ slot: 'service_history', label: 'EPFO service history (optional)', required: false, hint: 'Download from the EPFO member portal / UMANG' }],
  },
  {
    type: 'court_record',
    label: 'Court record check',
    description: 'A search of court records for the addresses you have lived at.',
    candidate_input: true,
    fields: [
      { key: 'consent', label: 'I consent to a court record search in my name at the addresses I have lived at', type: 'checkbox', required: true },
      { key: 'use_address_check', label: 'Use the addresses from my address check', type: 'checkbox' },
      { key: 'addresses', label: 'Other addresses in the last 7 years', type: 'textarea', max: 1500, hint: 'One per line, with city and PIN code' },
    ],
    documents: [],
  },
  {
    type: 'criminal',
    label: 'Police verification',
    description: 'A police / criminal record verification for the addresses you have lived at.',
    candidate_input: true,
    fields: [
      { key: 'consent', label: 'I consent to a police verification in my name', type: 'checkbox', required: true },
      { key: 'addresses', label: 'Addresses to verify (last 7 years)', type: 'textarea', required: true, max: 1500, hint: 'One per line, with city and PIN code' },
    ],
    documents: [],
  },
  {
    type: 'reference',
    label: 'References',
    description: 'People who can speak about your work — preferably former managers.',
    candidate_input: true,
    fields: [],
    documents: [],
    group: referenceGroup(2),
  },
]

// ─── USA ─────────────────────────────────────────────────────────────────────

export const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')
const STATE_OPTIONS = US_STATES.map((s) => ({ value: s, label: s }))

const vendorCheck = (type: BgvCheckType, label: string, description: string): CheckDef => ({
  type, label, description, candidate_input: false, fields: [], documents: [],
})

const US: CheckDef[] = [
  {
    type: 'identity',
    label: 'Identity',
    description: 'Your legal name, other names you have used, date of birth and Social Security number.',
    candidate_input: true,
    notice: 'Your SSN is encrypted. Verifiers see only the last 4 digits.',
    fields: [
      { key: 'first_name', label: 'Legal first name', type: 'text', required: true, max: 80, autoComplete: 'given-name' },
      { key: 'middle_name', label: 'Middle name', type: 'text', max: 80, autoComplete: 'additional-name' },
      { key: 'no_middle_name', label: 'I have no middle name', type: 'checkbox' },
      { key: 'last_name', label: 'Legal last name', type: 'text', required: true, max: 80, autoComplete: 'family-name' },
      { key: 'other_names', label: 'Other names used (maiden name, aliases)', type: 'textarea', max: 500 },
      { key: 'dob', label: 'Date of birth', type: 'date', required: true, autoComplete: 'bday' },
      { key: 'ssn', label: 'Social Security number', type: 'text', required: true, pattern: SSN_RE, patternHint: 'Enter 9 digits, e.g. 123-45-6789', sensitive: 'ssn', autoComplete: 'off' },
      { key: 'phone', label: 'Phone', type: 'tel', required: true, autoComplete: 'tel', ...PHONE },
    ],
    documents: [{ slot: 'photo_id', label: 'Government photo ID (optional)', required: false, multiple: 2 }],
  },
  vendorCheck('ssn_trace', 'SSN trace', 'The provider uses your SSN to find the names and addresses linked to it.'),
  {
    type: 'address',
    label: 'Address history',
    description: 'Every address you have lived at for the period shown, current first.',
    candidate_input: true,
    fields: [],
    documents: [],
    group: {
      key: 'addresses',
      label: 'Addresses',
      itemLabel: 'Address',
      min: 1,
      max: 15,
      fields: [
        { key: 'street', label: 'Street address', type: 'text', required: true, max: 200, autoComplete: 'address-line1' },
        { key: 'city', label: 'City', type: 'text', required: true, max: 100, autoComplete: 'address-level2' },
        { key: 'state', label: 'State', type: 'select', required: true, options: STATE_OPTIONS, autoComplete: 'address-level1' },
        { key: 'zip', label: 'ZIP code', type: 'text', required: true, pattern: '^[0-9]{5}(-[0-9]{4})?$', patternHint: 'Enter a 5-digit ZIP code', autoComplete: 'postal-code' },
        { key: 'from', label: 'From', type: 'month', required: true },
        { key: 'current', label: 'I live here now', type: 'checkbox' },
        { key: 'to', label: 'To', type: 'month', required: true, when: { key: 'current', equals: false } },
      ],
      documents: [],
    },
  },
  {
    type: 'employment',
    label: 'Employment history',
    description: 'Employers for the period shown, latest first.',
    candidate_input: true,
    skipGroupWith: 'no_history',
    fields: [{ key: 'no_history', label: 'I have no employment history in this period', type: 'checkbox' }],
    documents: [],
    group: {
      key: 'employers',
      label: 'Employers',
      itemLabel: 'Employer',
      min: 1,
      max: 12,
      fields: [
        { key: 'company', label: 'Employer', type: 'text', required: true, max: 200 },
        { key: 'title', label: 'Job title', type: 'text', required: true, max: 120 },
        { key: 'city_state', label: 'City, state', type: 'text', max: 120 },
        { key: 'from', label: 'From', type: 'month', required: true },
        { key: 'current', label: 'I currently work here', type: 'checkbox' },
        { key: 'to', label: 'To', type: 'month', required: true, when: { key: 'current', equals: false } },
        { key: 'manager_name', label: 'Supervisor', type: 'text', max: 120 },
        { key: 'contact', label: 'Employer phone or HR email', type: 'text', required: true, max: 160 },
        { key: 'may_contact', label: 'May we contact this employer now?', type: 'select', required: true, options: YES_NO },
        { key: 'reason', label: 'Reason for leaving', type: 'textarea', max: 500, when: { key: 'current', equals: false } },
      ],
      documents: [{ slot: 'proof', label: 'W-2, pay stub or offer letter (optional)', required: false, multiple: 3 }],
    },
  },
  {
    type: 'education',
    label: 'Education',
    description: 'Your highest qualification, plus any others you want verified.',
    candidate_input: true,
    fields: [],
    documents: [],
    group: {
      key: 'entries',
      label: 'Qualifications',
      itemLabel: 'Qualification',
      min: 1,
      max: 6,
      fields: [
        { key: 'level', label: 'Level', type: 'select', required: true, options: [
          { value: 'high_school', label: 'High school / GED' }, { value: 'associate', label: 'Associate' }, { value: 'bachelor', label: "Bachelor's" },
          { value: 'master', label: "Master's" }, { value: 'doctorate', label: 'Doctorate' }, { value: 'other', label: 'Other' },
        ] },
        { key: 'institution', label: 'School', type: 'text', required: true, max: 200 },
        { key: 'city_state', label: 'City, state / country', type: 'text', max: 120 },
        { key: 'major', label: 'Major / field', type: 'text', max: 120 },
        { key: 'graduated', label: 'Graduated?', type: 'select', required: true, options: YES_NO },
        { key: 'year', label: 'Year completed or last attended', type: 'number', required: true, pattern: '^(19[5-9][0-9]|20[0-9]{2})$', patternHint: 'Enter a 4-digit year' },
        { key: 'name_at_school', label: 'Name used while at school (if different)', type: 'text', max: 160 },
      ],
      documents: [{ slot: 'diploma', label: 'Diploma or transcript (optional)', required: false, multiple: 2 }],
    },
  },
  vendorCheck('national_criminal', 'National criminal search', 'Performed by the background check provider.'),
  vendorCheck('county_criminal', 'County criminal search', 'Performed by the provider for the counties in your address history.'),
  vendorCheck('federal_criminal', 'Federal criminal search', 'Performed by the background check provider.'),
  vendorCheck('sex_offender', 'Sex offender registry', 'Performed by the background check provider.'),
  vendorCheck('criminal', 'Criminal background check', 'Performed by the background check provider.'),
  {
    type: 'mvr',
    label: "Driving record (MVR)",
    description: "Your driver's licence, for a motor vehicle record check.",
    candidate_input: true,
    fields: [
      { key: 'dl_number', label: "Driver's licence number", type: 'text', required: true, max: 30, sensitive: 'dl_number', autoComplete: 'off' },
      { key: 'dl_state', label: 'Issuing state', type: 'select', required: true, options: STATE_OPTIONS },
      { key: 'dl_expiry', label: 'Expiry date', type: 'date', required: true },
    ],
    documents: [{ slot: 'licence', label: "Driver's licence image (optional)", required: false, multiple: 2 }],
  },
  {
    type: 'drug_test',
    label: 'Drug test',
    description: 'The hiring team will send you instructions to schedule a drug test at a nearby collection site.',
    candidate_input: true,
    fields: [
      { key: 'zip', label: 'ZIP code to find a collection site near you', type: 'text', required: true, pattern: '^[0-9]{5}$', patternHint: 'Enter a 5-digit ZIP code' },
      { key: 'availability', label: 'Days and times that work for you', type: 'textarea', max: 300 },
    ],
    documents: [],
  },
  {
    type: 'reference',
    label: 'References',
    description: 'People who can speak about your work.',
    candidate_input: true,
    fields: [],
    documents: [],
    group: referenceGroup(2),
  },
]

export const CATALOG: Record<BgvRegion, CheckDef[]> = { IN, US }
export const REGIONS: readonly BgvRegion[] = ['IN', 'US']
export const REGION_LABELS: Record<BgvRegion, string> = { IN: 'India', US: 'United States' }

export function checkDef(region: BgvRegion, type: BgvCheckType): CheckDef | null {
  return CATALOG[region].find((c) => c.type === type) ?? null
}

export function checksForRegion(region: BgvRegion): BgvCheckType[] {
  return CATALOG[region].map((c) => c.type)
}

export const DEFAULT_CHECKS: Record<BgvRegion, BgvCheckType[]> = {
  IN: ['identity', 'pan', 'aadhaar', 'address', 'education', 'employment', 'uan_epfo', 'court_record', 'reference'],
  US: ['identity', 'ssn_trace', 'address', 'employment', 'education', 'national_criminal', 'county_criminal', 'sex_offender', 'reference'],
}

export const DEFAULT_CRITICAL: Record<BgvRegion, BgvCheckType[]> = {
  IN: ['identity', 'pan', 'education', 'employment', 'court_record', 'criminal'],
  US: ['identity', 'ssn_trace', 'employment', 'education', 'national_criminal', 'county_criminal', 'federal_criminal', 'sex_offender', 'criminal'],
}

/** Keep only checks the region supports, in catalog order, no duplicates. */
export function normalizeChecks(region: BgvRegion, raw: unknown): BgvCheckType[] {
  const want = new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
  return checksForRegion(region).filter((t) => want.has(t))
}

// ─── Region resolution ───────────────────────────────────────────────────────

const IN_HINTS = /\b(india|bengaluru|bangalore|hyderabad|chennai|mumbai|pune|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|kochi|jaipur|coimbatore|vizag|visakhapatnam|chandigarh|indore|trivandrum|thiruvananthapuram)\b/i
const US_HINTS = new RegExp(`\\b(usa|u\\.s\\.a?\\.?|united states|america|${US_STATES.filter((s) => s !== 'IN' && s !== 'OR' && s !== 'ME').join('|')})\\b`)

/** 'auto' → candidate.country (ISO-2), then the job location text; null when unknown. */
export function resolveRegion(cfg: BgvRegion | 'auto' | undefined, candidateCountry?: string | null, jobLocation?: string | null): BgvRegion | null {
  if (cfg === 'IN' || cfg === 'US') return cfg
  const c = String(candidateCountry || '').trim().toUpperCase()
  if (c === 'IN' || c === 'IND') return 'IN'
  if (c === 'US' || c === 'USA') return 'US'
  const loc = String(jobLocation || '')
  if (IN_HINTS.test(loc)) return 'IN'
  if (US_HINTS.test(loc) || /\b(usa|united states)\b/i.test(loc)) return 'US'
  return null
}

/**
 * US fair-chance hint: many US jurisdictions (fair-chance / ban-the-box laws)
 * expect criminal checks only after a conditional offer. A hint, never a block.
 */
export function fairChanceHint(region: BgvRegion, stageTypes: string[], bgvIndex: number): string | null {
  if (region !== 'US') return null
  const offerIdx = stageTypes.indexOf('offer')
  if (offerIdx >= 0 && offerIdx < bgvIndex) return null
  return 'In many US jurisdictions (fair-chance laws), criminal checks should run after a conditional offer. Consider placing this stage after the offer stage.'
}

// ─── Default legal texts (placeholders — review with counsel) ───────────────

export const REVIEW_WITH_COUNSEL = 'Template text — review with counsel before use. CodeSpectra does not give legal advice.'

const IN_CONSENT = `Consent for background verification (Digital Personal Data Protection Act, 2023)

{{company}} ("we") will verify the information you provide for your application for {{job_title}}.

Purpose: to verify your identity, address, education, employment history, references and court / police records for employment.

Personal data we process: your name, date of birth, father's name, photo, contact details, PAN, the number of the government ID you choose (only if you choose to give it), the last 4 digits of your Aadhaar (only if you choose to share it), addresses, education and employment records, UAN service history, references' contact details, and the documents you upload. We may share them with our verification partner and with the institutions, employers and authorities we contact to verify them; your PAN, ID number and UAN may be checked against government records through our verification partner.

Retention: we keep your documents for {{retention_days}} days after the verification closes, then delete them and keep only the outcome.

Your rights: you may withdraw this consent at any time by contacting the hiring team; withdrawing does not affect processing already done, and we may then be unable to continue your application. You may ask to access, correct or erase your data, and raise a grievance with the hiring team or the Data Protection Board of India.

By signing below you confirm that the information you provide is true and that you consent to this verification.`

const US_DISCLOSURE = `Disclosure regarding background investigation

{{company}} may obtain information about you from a third-party consumer reporting agency for employment purposes. You may be the subject of a "consumer report" which may include information about your character, general reputation, personal characteristics and/or mode of living. These reports may contain information regarding your criminal history, Social Security verification, motor vehicle records, verification of your education or employment history, or other background checks.

You have the right, upon written request made within a reasonable time, to request whether a consumer report has been run about you, and to request a copy of your report. The scope of this disclosure is all-encompassing and allows us to obtain consumer reports throughout the hiring process and, if you are hired, throughout your employment, to the extent permitted by law.`

const US_AUTHORIZATION = `Authorization of background investigation

I have read the separate Disclosure Regarding Background Investigation and the Summary of Your Rights Under the Fair Credit Reporting Act. I authorize {{company}} and its consumer reporting agency to obtain consumer reports about me for employment purposes, and I authorize the persons and organizations they contact to provide the information requested.

I agree that an electronic signature is as valid as a handwritten one.`

const STATE_NOTICE_PLACEHOLDERS: BgvStateNotice[] = [
  { state: 'CA', title: 'California notice', version: '1', text: 'California applicants: placeholder for the California ICRAA / Fair Chance Act notice. Your hiring team must replace this text after review with counsel.' },
  { state: 'NY', title: 'New York notice', version: '1', text: 'New York applicants: placeholder for the New York Article 23-A notice and NYC Fair Chance Act process. Your hiring team must replace this text after review with counsel.' },
  { state: 'WA', title: 'Washington notice', version: '1', text: 'Washington applicants: placeholder for the Washington state notice. Your hiring team must replace this text after review with counsel.' },
  { state: 'MN', title: 'Minnesota notice', version: '1', text: 'Minnesota applicants: placeholder for the Minnesota notice. Your hiring team must replace this text after review with counsel.' },
]

export const SUMMARY_OF_RIGHTS_PLACEHOLDER = 'A Summary of Your Rights Under the Fair Credit Reporting Act — attach the current CFPB summary here (placeholder; review with counsel).'

export function defaultRegionSettings(region: BgvRegion, at = new Date(0).toISOString()): BgvRegionSettings {
  if (region === 'IN') {
    return { default_checks: DEFAULT_CHECKS.IN, critical_checks: DEFAULT_CRITICAL.IN, consent: { version: 'in-2', text: IN_CONSENT, updated_at: at }, history: [] }
  }
  return {
    default_checks: DEFAULT_CHECKS.US,
    critical_checks: DEFAULT_CRITICAL.US,
    consent: { version: 'us-auth-1', text: US_AUTHORIZATION, updated_at: at },
    disclosure: { version: 'us-disc-1', text: US_DISCLOSURE, updated_at: at },
    state_notices: STATE_NOTICE_PLACEHOLDERS,
    history: [],
  }
}

export const CHECK_LABEL = (region: BgvRegion, t: BgvCheckType) => checkDef(region, t)?.label ?? t.replace(/_/g, ' ')
