// Friendly labels for Service.department codes.
const DEPARTMENT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy',
  OT: 'Occupational Therapy',
  SLP: 'Speech-Language Pathology',
  ST: 'Speech-Language Pathology',
  SPED: 'Special Education',
  EDU: 'Education',
  PSYCHOLOGY: 'Psychology',
  PSYCH: 'Psychology',
  PSY: 'Psychology',
  MD: 'Medical Doctor',
  ORTHOSIS_PROSTHESIS: 'Orthosis & Prosthesis',
  ORTHOSIS: 'Orthosis & Prosthesis',
  ADMIN: 'Admin',
  ALL: 'All Departments',
}

export function departmentLabel(dept?: string | null): string {
  if (!dept) return '—'
  return DEPARTMENT_LABELS[dept] ?? dept
}
